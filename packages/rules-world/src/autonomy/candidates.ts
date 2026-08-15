/*
 * Multiverse Mages — bounded candidate scanning, and the one place the
 * knowledge gateway is touched.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any
 * later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { KnowledgeGateway, KnowledgeTarget, MageHandle } from '../coordination.js';
import type { SpeciesRecord } from '@mm/content';

/**
 * ## The bound is a documented constant, not a hope about graph size
 *
 * The `mage-autonomy` spec: *"Candidate target scanning per goal per evaluation
 * MUST be bounded by a documented constant"*, with the scenario naming "a
 * universe holding several hundred researchable nodes". `coordination.ts`
 * already shaped `researchFrontier` to take a `limit` for this reason; this
 * module supplies {@link MAX_CANDIDATE_TARGETS} as that limit and is the only
 * caller.
 *
 * The cost argument is the same one that produced the stagger. Per-tick cost is
 * `mages × goals × candidates`, and the node graph is the one factor of the
 * three that content can grow without anyone thinking about the AI. A constant
 * makes adding a hundred nodes a content decision rather than a performance
 * regression discovered in a 200-year run.
 *
 * ## Depth gating happens here, before anything can select an over-deep node
 *
 * `species-traits`: *"an orc mage with `depthCeiling` 3 holds every prerequisite
 * for a tier-4 node → the node is not a feasible research or teaching target
 * for that mage, at any rate."* "At any rate" is the operative phrase — it must
 * not be a low score, and it must not be a filter one call site can forget. So
 * the filter is applied as candidates are gathered and an over-deep target
 * never enters a {@link MageOutlook} at all.
 *
 * The filter runs *before* the limit is spent, which matters: filtering after
 * truncation would let a frontier full of deep nodes crowd out the shallow ones
 * a low-ceiling species can actually work on, and that species would look
 * incurious rather than gated.
 *
 * ## Discovery and rediscovery are separated here
 *
 * `KnowledgeGateway.rediscovery` decides which of the two lists a target lands
 * in — a node this universe held once and has since *lost* is a rediscovery,
 * whatever the individual mage knows. That is the input that makes
 * `rediscover-node` a distinct goal id rather than a flavour of research.
 *
 * ## It used to ask `everKnown`, and that was the wrong half of §1.5
 *
 * The persisted ever-known mark is set by `createInstance` and never cleared,
 * so it is true of every node anybody here has ever learned, including the ones
 * still standing. Bucketing on it filed *held* nodes as rediscoveries, which is
 * the same skew the research quote carried until `isRediscovery` replaced it
 * there — except that here it moved a target between two goal ids rather than
 * between two prices, so nothing in the cost path could see it.
 *
 * ## What it was worth, measured rather than argued
 *
 * Bucketing is not scoring, so the effect is indirect — `rediscover-node` is a
 * separate goal id with its own appeal terms and its own commitment, and a mage
 * who files a held node under it is choosing from the wrong list all the way
 * down. It is not small. Lessons taught per 20-year window over the reference
 * two hundred years, before and after:
 *
 * ```
 * before  867 513 60  83  38   2 265 323 340 314
 * after   446 337 34 112 113  16  51 588 323 124
 * ```
 *
 * The total falls and the *thinnest window rises*, from 2 to 16, which is the
 * direction that matters: `reference-long-run.test.ts` asserts teaching in every
 * window, and the run it was asserting over was one bad tick away from a hole.
 * On a tree carrying the economy wire the same correction lifts windows that had
 * gone to nothing — `7 2 0` becomes `261 533 146` — while research over the last
 * forty years rises from 176 completions to 487.
 */

/**
 * The most candidate targets any one goal considers in one evaluation.
 *
 * Sixteen: enough that `OPPORTUNITY_CANDIDATE_CAP`'s saturation at four
 * is reached from a real frontier rather than from a truncation artefact, and
 * small enough that the hot loop stays flat as content grows. A placeholder,
 * like everything else at 0.4.0 — but a placeholder whose *existence* is a
 * requirement rather than a tuning choice.
 */
export const MAX_CANDIDATE_TARGETS = 16;

/** Whether a node is at or below a species' depth ceiling. */
export function withinDepthCeiling(target: KnowledgeTarget, species: SpeciesRecord): boolean {
  return target.tier <= species.depthCeiling;
}

/**
 * Orders candidates **novel first**, then cheapest, breaking ties on node id.
 *
 * A total order that depends on nothing but the targets themselves. Ordering by
 * the gateway's own return order would make selection depend on how
 * `rules-magic` happens to walk its index — the same class of divergence
 * `reallocation.ts` avoids by sorting cohorts on their key rather than on their
 * entity slot.
 *
 * ## Why novelty outranks cost, and only for scribing
 *
 * Cost alone is a total order over *content*, so the cheapest scribable node is
 * the cheapest for every scribe in every century, and a universe writes the same
 * book forever. That is not a hypothesis: the reference run ends with **1,263
 * grimoires holding two distinct nodes** (vision §13; `mages-and-species` task
 * 9.8), and vision §6a's capital loop reads *depth* — distinct nodes — so its
 * input was pinned at two and could not compound.
 *
 * `libraryHolds` is set only by the scribing scan, so this tie-break is inert
 * for research and teaching candidates and their ordering is unchanged. It is a
 * *preference*, not a filter: a second copy is still selected when it is the
 * only thing on the list, which is what keeps §5's redundancy against loss
 * reachable.
 */
export function compareTargets(a: KnowledgeTarget, b: KnowledgeTarget): number {
  const novelty = compareNovelty(a, b);
  if (novelty !== 0) return novelty;
  if (a.remainingCost !== b.remainingCost) return a.remainingCost - b.remainingCost;
  return a.nodeId - b.nodeId;
}

/**
 * Orders a novel node ahead of one the shelf already holds. `0` when neither is
 * a scribing candidate, which is every research and teaching target.
 *
 * ## Why this is a separate axis from the target utility score, and stays one
 *
 * `target-appeal.ts` scores a candidate on six bounded, additive terms and
 * `chooseTarget` takes the argmax. Novelty is not one of those terms and must
 * not become one. It is a **binary fact about redundancy** on exactly one goal,
 * where the six are **magnitudes about value** on all five target-taking goals,
 * and folding a binary into a bounded sum has only two outcomes: a bound small
 * enough to be outvoted, which restores the 1,263-books-two-nodes defect the
 * measurement above records, or a bound large enough to dominate, which is a
 * lexicographic prefix wearing a magnitude's clothes and lying about it in the
 * ablation report.
 *
 * So the two are composed rather than merged: novelty partitions the candidate
 * list, and the utility score decides inside the partition. Exported for
 * `compareAppeal`, which is the only other place that has to know the order the
 * two mechanisms apply in.
 */
export function compareNovelty(a: KnowledgeTarget, b: KnowledgeTarget): number {
  const aHolds = a.libraryHolds === true ? 1 : 0;
  const bHolds = b.libraryHolds === true ? 1 : 0;
  return aHolds - bHolds;
}

/** A frontier split into what has never been known here and what has been lost. */
export interface SplitFrontier {
  readonly discovery: readonly KnowledgeTarget[];
  readonly rediscovery: readonly KnowledgeTarget[];
}

/**
 * Gathers a mage's research frontier, gated by depth and bounded by
 * {@link MAX_CANDIDATE_TARGETS}.
 *
 * The gateway is asked for more than the limit — `limit × 2` — because it
 * filters by prerequisites and legality but not by species depth, so a request
 * for exactly sixteen could come back as sixteen targets of which two survive
 * gating. Over-asking is bounded too, which is what keeps the cost argument
 * intact.
 */
export function gatherFrontier(
  gateway: KnowledgeGateway,
  mage: MageHandle,
  species: SpeciesRecord,
  limit: number = MAX_CANDIDATE_TARGETS,
): SplitFrontier {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(
      `the candidate limit must be a positive integer, received ${String(limit)}; an unbounded ` +
        'scan is the requirement this argument exists to satisfy',
    );
  }
  const raw = gateway.researchFrontier(mage, limit * 2);
  const eligible = raw.filter((target) => withinDepthCeiling(target, species));
  eligible.sort(compareTargets);

  const discovery: KnowledgeTarget[] = [];
  const rediscovery: KnowledgeTarget[] = [];
  for (const target of eligible) {
    const bucket = gateway.rediscovery(target.nodeId) ? rediscovery : discovery;
    if (bucket.length < limit) bucket.push(target);
  }
  return { discovery, rediscovery };
}

/**
 * Filters and bounds a list of teaching or scribing candidates the coordinating
 * layer has already produced.
 *
 * The same depth gate and the same limit, applied to the lists the gateway
 * answers with rather than to the frontier. Written as one function so that a
 * new target-taking goal cannot acquire a different bound by being written by
 * somebody else.
 */
export function boundCandidates(
  targets: readonly KnowledgeTarget[],
  species: SpeciesRecord,
  limit: number = MAX_CANDIDATE_TARGETS,
): readonly KnowledgeTarget[] {
  const eligible = targets.filter((target) => withinDepthCeiling(target, species));
  eligible.sort(compareTargets);
  return eligible.slice(0, limit);
}
