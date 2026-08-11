/*
 * Multiverse Mages — how a run ends: the two ascension paths, the three
 * stagnation triggers, and what the ending is worth.
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

/**
 * Before this file, nothing terminated a universe: every harness run ended
 * `truncated` and `ascensionRate` was 0 over a denominator of 0. A metric
 * cannot be a fraction of an undefined population, so "what ends a run" had to
 * be answered before the release's own claim could be measured.
 *
 * ## Two paths, deliberately different in kind
 *
 * **Apotheosis of Mastery** rewards a spike: one long-lived, well-taught mage
 * holding the deepest node her cell's content graph offers, in a cell that is
 * still permitted, secured against loss by a second surviving copy, in a
 * universe worshipped to tier 4.
 *
 * **Enduring Canon** rewards custodianship: four consecutive era boundaries at
 * which `libraryDependence` stayed under a quarter and no more than two nodes
 * left the universe. That cuts directly against `knowledgeHalfLife`, and it is
 * the ending available to a civilization that never produced a prodigy.
 *
 * A single condition would make one species archetype the only route to the
 * meta-game. `ascensionRateByPath` is reported separately for exactly this
 * reason: an aggregate inside the 5–20% band can conceal one path being dead.
 *
 * ## Depth is relative to content, and there is no literal tier check anywhere
 *
 * Per-species depth ceilings mean tier 7 may be reachable by one species or by
 * none, and the v1 node graphs may contain no tier-7 node at all. A literal
 * condition would be unreachable in v1 content and would need rewriting every
 * time content changed. *"The deepest node present in this cell"* survives
 * retuning, and {@link deepestNodesByCell} is the whole of it.
 *
 * ## Stagnation's third trigger is conjunctive, and that is the sharp part
 *
 * A perfect custodian — zero losses, every learnable node already learned —
 * acquires no new nodes either, because zero losses means there is nothing to
 * rediscover. A bare "no new node for 480 ticks" trigger would therefore
 * terminate as *ruin* the exact civilization Enduring Canon exists to reward,
 * and would do it at tick 480 when the path qualifies at tick 960. Stagnation
 * must mean decline, not completion, and only worship separates the two.
 */

import type { Fixed } from '@mm/sim-core';
import { FP_ONE, floorDiv, mul } from '@mm/sim-core';
import type { NodeCatalog } from '@mm/rules-magic';
import type { GodStateRecord } from '@mm/state';
import { ASCENSION_PATH, TERMINAL_REASON } from '@mm/state';

import type { GodConstants } from './constants.js';

/** The deepest node id present in each cell of the loaded content graph. */
export type DeepestByCell = ReadonlyMap<number, number>;

/**
 * The deepest node in each cell, by node tier, ties broken by ascending node id.
 *
 * Ties are broken rather than left ambiguous because the answer decides an
 * ascension condition, and two peers that disagreed about which of two tier-5
 * nodes counted would disagree about whether a run had ended. Node id is a
 * stable identity; the order a catalog happens to enumerate in is not.
 */
export function deepestNodesByCell(
  catalog: NodeCatalog,
  cellOf: (nodeId: number) => number,
): DeepestByCell {
  const best = new Map<number, { nodeId: number; tier: number }>();
  for (let nodeId = 1; nodeId <= catalog.nodeCount; nodeId += 1) {
    const node = catalog.node(nodeId);
    if (node === undefined) continue;
    const cellId = cellOf(nodeId);
    if (cellId <= 0) continue;
    const current = best.get(cellId);
    if (
      current === undefined ||
      node.tier > current.tier ||
      (node.tier === current.tier && nodeId < current.nodeId)
    ) {
      best.set(cellId, { nodeId, tier: node.tier });
    }
  }
  const out = new Map<number, number>();
  for (const [cellId, entry] of best) out.set(cellId, entry.nodeId);
  return out;
}

/** What Path A is evaluated against, as facts rather than as state. */
export interface ApotheosisFacts {
  /** `(nodeId, instanceCount)` for every node a *living* mage holds in mind or palace. */
  readonly heldByLivingMage: ReadonlySet<number>;
  /** Live instances per node, anywhere in the universe. */
  readonly instanceCount: (nodeId: number) => number;
  /** Whether the ruleset currently permits a cell. */
  readonly permitsCell: (cellId: number) => boolean;
  readonly cellOf: (nodeId: number) => number;
  readonly deepest: DeepestByCell;
  readonly worshipTier: number;
}

/**
 * Whether the Apotheosis path is satisfied right now.
 *
 * Four conjuncts, and each is independently unlikely: a species with the depth
 * ceiling to reach the cell's deepest tier, a mage who lived long enough to
 * climb the whole prerequisite chain, the cell still permitted at the moment of
 * declaration, and *two* surviving instances of a node that by construction
 * only one mage has ever held. That last one is why teaching or scribing is a
 * necessary step and not a nicety.
 */
export function apotheosisSatisfied(facts: ApotheosisFacts, constants: GodConstants): boolean {
  if (facts.worshipTier < constants.ascensionTierGate) return false;
  for (const nodeId of facts.heldByLivingMage) {
    const cellId = facts.cellOf(nodeId);
    if (facts.deepest.get(cellId) !== nodeId) continue;
    if (!facts.permitsCell(cellId)) continue;
    if (facts.instanceCount(nodeId) < 2) continue;
    return true;
  }
  return false;
}

/**
 * Whether the Enduring Canon path is satisfied.
 *
 * A run of consecutive passing era boundaries, not a count of good ones: the
 * spec's own scenario says that failing the fourth boundary means *"the
 * earliest era boundary that can still support it moves forward"*, which is a
 * run, and a tally of good-boundaries-ever would let a universe bank three good
 * eras, collapse, and coast to the ending on history.
 */
export function canonSatisfied(god: GodStateRecord, constants: GodConstants): boolean {
  return god.goodEraRun >= constants.ascensionEraCount;
}

/** Which path, if any, a universe currently qualifies on. */
export function qualifyingPath(
  facts: ApotheosisFacts,
  god: GodStateRecord,
  worldTick: number,
  constants: GodConstants,
): number {
  // The minimum tick gates *qualification*, not merely declaration, so that
  // `ascensionFirstMetTick` records a moment the god could actually have acted
  // on. A universe that satisfied Path A at tick 400 has not "first met" the
  // condition at 400 in any sense the harness can use.
  if (worldTick < constants.ascensionMinTick) return ASCENSION_PATH.none;
  if (apotheosisSatisfied(facts, constants)) return ASCENSION_PATH.apotheosis;
  if (canonSatisfied(god, constants)) return ASCENSION_PATH.canon;
  return ASCENSION_PATH.none;
}

/** `libraryDependence` (§7): the fraction of known nodes with exactly one instance. */
export function libraryDependence(knownNodes: number, singleInstanceNodes: number): Fixed {
  if (knownNodes <= 0) return 0;
  return floorDiv(singleInstanceNodes * FP_ONE, knownNodes);
}

/** What the stagnation check is given, and what it decides. */
export interface StagnationInputs {
  readonly livingMages: number;
  readonly worship: Fixed;
  /** Whether a node newly entered the universe this tick. */
  readonly nodeEntered: boolean;
}

/** The counters after one tick, and whether any trigger fired. */
export interface StagnationOutcome {
  readonly magelessTicks: number;
  readonly lowWorshipTicks: number;
  readonly stasisTicks: number;
  readonly stagnated: boolean;
}

/**
 * Advances the three stagnation clocks and reports whether any has run out.
 *
 * Each counter resets to zero the moment its condition stops holding, because
 * every trigger is about a *consecutive* run: a universe that spends alternate
 * decades mageless and thriving is not dying, and a counter that only ever
 * increased would eventually terminate every long run regardless of health.
 */
export function stepStagnation(
  god: GodStateRecord,
  inputs: StagnationInputs,
  constants: GodConstants,
): StagnationOutcome {
  const magelessTicks = inputs.livingMages === 0 ? god.magelessTicks + 1 : 0;
  const lowWorshipTicks =
    inputs.worship < constants.stagnationWorshipFloor ? god.lowWorshipTicks + 1 : 0;
  // The conjunctive one. The clock runs only while the universe is *both*
  // acquiring nothing and unworshipped; a healthy custodian with a completed
  // graph resets it every tick and is never terminated as ruin.
  const stasisTicks =
    !inputs.nodeEntered && inputs.worship < constants.stagnationHealthFloor
      ? god.stasisTicks + 1
      : 0;

  const stagnated =
    magelessTicks >= constants.stagnationMagelessTicks ||
    lowWorshipTicks >= constants.stagnationWorshipTicks ||
    stasisTicks >= constants.stagnationStasisTicks;

  return { magelessTicks, lowWorshipTicks, stasisTicks, stagnated };
}

/** What a terminated run earned, and the achievement it earned it from. */
export interface PrestigeInputs {
  readonly terminalReason: number;
  readonly deepestTier: number;
  readonly erasSurvived: number;
  readonly peakWorshipTier: number;
}

/**
 * `prestigeEarned`, computed once at run termination.
 *
 * A base per outcome plus three saturating achievement terms, clamped to
 * `PRESTIGE_EARN_MAX`. **Every outcome earns something non-zero**, including a
 * universe that stagnated at tier 1 in era 1 — a zero floor makes a losing
 * streak spiral toward zero carried prestige, which is the runaway-leader
 * failure wearing the opposite sign.
 *
 * Written at termination and applied to the *next* universe's `prestige`, never
 * to the terminating one: §1.1 makes `prestige` read-only during a run, and a
 * run that could raise its own carried prestige mid-flight would be the
 * meta-game feeding the loop it is supposed to sit outside.
 */
export function prestigeEarned(inputs: PrestigeInputs, constants: GodConstants): Fixed {
  const base =
    inputs.terminalReason === TERMINAL_REASON.ascensionApotheosis ||
    inputs.terminalReason === TERMINAL_REASON.ascensionCanon
      ? constants.prestigeBaseAscended
      : inputs.terminalReason === TERMINAL_REASON.stagnation
        ? constants.prestigeBaseStagnated
        : constants.prestigeBaseCutoff;

  const earned =
    base +
    Math.max(inputs.deepestTier, 0) * constants.prestigePerTier +
    Math.max(inputs.erasSurvived, 0) * constants.prestigePerEra +
    Math.max(inputs.peakWorshipTier, 0) * constants.prestigePerWorshipTier;

  return Math.min(earned, constants.prestigeEarnMax);
}

/**
 * The carry-over recurrence: `prestige' = min(cap, prestige × retention +
 * earned)`.
 *
 * The clamp is retained as a defence against a content bug that raises the
 * earning ceiling, and is otherwise unreachable: the content loader asserts
 * `cap × (fp(1024) − retention) == earnMax × fp(1024)`, which makes `cap` the
 * analytic limit of the recurrence at maximum earning. An infinite streak of
 * perfect runs approaches it asymptotically and never exceeds it, and the tenth
 * consecutive ascension adds a few percent over the fifth.
 */
export function carriedPrestige(
  prestige: Fixed,
  earned: Fixed,
  constants: GodConstants,
): Fixed {
  return Math.min(
    mul(Math.max(prestige, 0), constants.prestigeRetention) + Math.max(earned, 0),
    constants.prestigeCap,
  );
}

/**
 * The legacy budget carried prestige converts into: `sat(prestige, cap, half)`.
 *
 * Concave on top of a convergent accumulation — two damping stages in series is
 * what makes the meta-game's ceiling a property rather than a tuning accident.
 * At the prestige cap the budget reaches about `fp(819)` of a possible
 * `fp(1024)`, and at half the cap about `fp(682)`, so the back half of the
 * prestige range is nearly worthless and a long winning streak buys very little
 * over a short one.
 */
export function legacyBudget(prestige: Fixed, constants: GodConstants): Fixed {
  const x = Math.max(prestige, 0);
  if (x === 0) return 0;
  return floorDiv(constants.legacyCap * x, x + constants.legacyHalf);
}

/** The four stock channels prestige may be spent on, and nothing else. */
export const LEGACY_CHANNELS = ['favor', 'materials', 'populace', 'archive'] as const;

export type LegacyChannel = (typeof LEGACY_CHANNELS)[number];

/** What a prestiged universe is seeded with. Stocks only — never a rate. */
export interface LegacyGrant {
  readonly favor: Fixed;
  readonly materials: Fixed;
  readonly populace: number;
  /** Knowledge instances to place in a library, at or below the authored tier. */
  readonly archiveNodes: number;
}

/**
 * Converts carried prestige into starting stocks.
 *
 * **Stocks, never rates, and the distinction is the whole model.** In a game
 * with two compounding loops a rate bonus is fed through both for the entire
 * run and its advantage *grows* with run length — which is exactly the
 * meta-game deciding matches before they start. A stock is spent, consumed,
 * aged out, or looted, so its advantage *decays*. Putting the seeded archive in
 * an ordinary library is the sharpest version of that: the head start is not
 * merely perishable, it is a target.
 *
 * Each channel is `channelMax × budget / fp(1024)`, where `channelMax` is
 * `LEGACY_HEADSTART_FRACTION` of the median unaided universe's value for that
 * channel at the reference tick. That single fraction is the only knob
 * `prestigeAdvantage` turns, and if it reaches zero and the metric still fails,
 * the model is wrong and gets redesigned rather than retuned.
 */
export function legacyGrant(prestige: Fixed, constants: GodConstants): LegacyGrant {
  const budget = legacyBudget(prestige, constants);
  const share = (baseline: number): number =>
    mul(mul(baseline, constants.legacyHeadstartFraction), budget);

  return {
    favor: share(constants.legacyBaselineFavor),
    materials: share(constants.legacyBaselineMaterials),
    // A count, not `fp`: a fifth of a person is not a person, and rounding a
    // headcount up would hand a fresh universe a free settler.
    populace: Math.floor(share(constants.legacyBaselinePopulace * FP_ONE) / FP_ONE),
    archiveNodes: Math.floor(
      (constants.legacyArchiveNodes * FP_ONE * budget) / (FP_ONE * FP_ONE),
    ),
  };
}
