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
 * `everKnown` decides which of the two lists a target lands in — a node this
 * universe has held before is a rediscovery, whatever the individual mage
 * knows. That is `contracts.md` §1.5's persisted record, and it is the input
 * that makes `rediscover-node` a distinct goal id rather than a flavour of
 * research.
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
  const aHolds = a.libraryHolds === true ? 1 : 0;
  const bHolds = b.libraryHolds === true ? 1 : 0;
  if (aHolds !== bHolds) return aHolds - bHolds;
  if (a.remainingCost !== b.remainingCost) return a.remainingCost - b.remainingCost;
  return a.nodeId - b.nodeId;
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
    const bucket = gateway.everKnown(target.nodeId) ? rediscovery : discovery;
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
