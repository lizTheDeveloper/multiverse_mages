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
 * Before this file nothing terminated a universe: every harness run ended
 * `truncated` and `ascensionRate` was 0 over a denominator of 0. A metric cannot
 * be a fraction of an undefined population, so "what ends a run" had to be
 * answered before the release's claim could be measured.
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
 * meta-game. `ascensionRateByPath` is reported separately for that reason: an
 * aggregate inside the 5–20% band can conceal a dead path.
 *
 * ## Depth is relative to content, and there is no literal tier check anywhere
 *
 * Per-species depth ceilings mean tier 7 may be reachable by one species or
 * none, and the v1 node graphs may hold no tier-7 node at all. A literal
 * condition would be unreachable in v1 content and would need rewriting on every
 * content change. *"The deepest node present in this cell"* survives retuning,
 * and {@link deepestNodesByCell} is the whole of it.
 *
 * ## Stagnation's third trigger is conjunctive, and that is the sharp part
 *
 * A perfect custodian — zero losses, every learnable node learned — acquires no
 * new nodes either, because zero losses leaves nothing to rediscover. A bare "no
 * new node for 480 ticks" trigger would terminate as *ruin* the exact
 * civilization Enduring Canon rewards, at tick 480, when the path qualifies at
 * 960. Stagnation must mean decline, not completion, and only worship separates
 * the two.
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
 * ascension condition: two peers disagreeing about which tier-5 node counted
 * would disagree about whether a run ended. Node id is a stable identity; a
 * catalog's enumeration order is not.
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
 * How many permitted cells stand at their floor: deepest node held by a living
 * mage, and surviving in at least `copies` instances.
 *
 * A count, not a boolean, and that is the whole of Path A's fix. The shipped v1
 * rectangle is twelve cells holding fifty-one nodes, and a universe the god
 * never touches learns **all fifty-one** — so "some cell is at its floor" is not
 * an achievement, it is where a starting position converges on its own. Counting
 * turns the same predicate into a question about how much grid the god *opened*:
 * a thirteenth mastered cell exists only if a technique or form was permitted
 * that the universe did not begin with.
 *
 * Iterating the deepest-by-cell map rather than the held set is deliberate. The
 * quantity is "cells at their floor"; over the held set a mage holding two
 * summits would count twice and a cell held by two mages once.
 */
export function masteredCellCount(facts: ApotheosisFacts, copies: number): number {
  let mastered = 0;
  for (const [cellId, nodeId] of facts.deepest) {
    if (!facts.permitsCell(cellId)) continue;
    if (!facts.heldByLivingMage.has(nodeId)) continue;
    if (facts.instanceCount(nodeId) < copies) continue;
    mastered += 1;
  }
  return mastered;
}

/**
 * Whether the Apotheosis path is satisfied right now.
 *
 * Five conjuncts, each independently unlikely: a species with the depth ceiling
 * to reach a cell's deepest tier; a mage who lived long enough to climb the
 * prerequisite chain; the cell still permitted at declaration;
 * `ascension-summit-copies` surviving instances of a node only one mage has ever
 * held — which is why teaching or scribing is necessary rather than a nicety —
 * and `ascension-summit-cells` cells in that state at once.
 *
 * **The cell count is the conjunct that reads play.** Worship tier does not: it
 * accrues from mages, universities and populace whether or not the god acts, and
 * a 2-D scan over the two authored knobs found the idle probe winning every cell
 * of the grid because of it. Raising the tier gate could not fix that —
 * `worship-tier-count` is 5, one step from the knob's ceiling.
 *
 * At `ascension-summit-cells = 1` and `ascension-summit-copies = 2` this is
 * exactly the predicate that shipped before, which makes the change bisectable
 * against a moved balance number.
 */
export function apotheosisSatisfied(facts: ApotheosisFacts, constants: GodConstants): boolean {
  if (facts.worshipTier < constants.ascensionTierGate) return false;
  return masteredCellCount(facts, constants.ascensionSummitCopies) >= constants.ascensionSummitCells;
}

/**
 * Whether the Enduring Canon path is satisfied.
 *
 * A run of consecutive passing boundaries, not a count of good ones: the spec's
 * scenario says failing the fourth means *"the earliest era boundary that can
 * still support it moves forward"*, which is a run. A tally of
 * good-boundaries-ever would let a universe bank three good eras, collapse, and
 * coast to the ending on history.
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
  // The minimum tick gates *qualification*, not just declaration, so
  // `ascensionFirstMetTick` records a moment the god could have acted on. A
  // universe satisfying Path A at tick 400 has not "first met" the condition at
  // 400 in any sense the harness can use.
  if (worldTick < constants.ascensionMinTick) return ASCENSION_PATH.none;
  if (apotheosisSatisfied(facts, constants)) return ASCENSION_PATH.apotheosis;
  if (canonSatisfied(god, constants)) return ASCENSION_PATH.canon;
  return ASCENSION_PATH.none;
}

/** What one era boundary is judged on. Facts, not state, for the same reason Path A's are. */
export interface EraBoundaryFacts {
  /** Distinct nodes of which the universe holds at least one instance. */
  readonly nodesKnown: number;
  /** Distinct cells in which the universe knows at least one node. */
  readonly cellsKnown: number;
  /** `libraryDependence` at the boundary, fp. */
  readonly dependence: Fixed;
  /** Nodes that left the universe during the era now ending. */
  readonly eraNodesLost: number;
}

/**
 * Nodes a passing era may lose: the authored floor, or a share of the canon,
 * whichever is larger.
 *
 * **A flat cap over a quantity that scales measures scale, not custodianship.**
 * Measured on this build: a universe the god never touches holds 51 nodes and
 * loses zero per era; one that permitted most of the grid holds 220 and loses
 * seven. An absolute allowance of two disqualified the civilization doing
 * something and waved through the one in stasis — the inverted sign this change
 * corrects, and no setting of the authored constant corrects it, because the
 * number that should scale with the canon was not a function of it.
 *
 * `ascension-loss-max` stays as the floor, so a small canon is not handed a free
 * loss by the fraction rounding to zero and the authored constant keeps meaning
 * what it meant.
 *
 * Integer arithmetic throughout: `floorDiv` over fixed point at 1/1024, never a
 * float and never a platform-dependent rounding mode.
 */
export function lossAllowance(nodesKnown: number, constants: GodConstants): number {
  const scaled = floorDiv(Math.max(nodesKnown, 0) * constants.ascensionLossFraction, FP_ONE);
  return Math.max(constants.ascensionLossMax, scaled);
}

/**
 * Whether one era boundary passes — the conjunction Path B counts runs of.
 *
 * Four conjuncts; the first two are the fix. As shipped, the test asked only for
 * low dependence and few losses, both *absences*: a universe nobody touches has
 * no single-copy nodes and loses nothing, so **doing nothing was perfect
 * custodianship** and Path B opened passively around tick 1080. Vision §8a's
 * second summit is *"a civilization that has held its knowledge intact across
 * enough eras"*, and holding fifty-one nodes nobody reads is not that.
 *
 * So a passing boundary now also needs a canon of a stated size across a stated
 * number of cells. Both anchor to the *passive baseline* rather than any
 * strategy's score: the starting rectangle is twelve cells holding fifty-one
 * nodes and an unattended universe learns every one, so those two numbers are
 * the game's autonomous ceiling and the constants are multiples of them.
 *
 * The two breadth conjuncts are not redundant, and the tension is the point:
 * node count alone falls to driving a few cells to their floor, cell count alone
 * to scattering one node across many, and both together only to opening the grid
 * and keeping it — which raises single-copy nodes and pushes back on the
 * dependence ceiling. Three axes that cannot all be maximised at once is the
 * difference between a summit and a counter.
 */
export function eraBoundaryPassed(facts: EraBoundaryFacts, constants: GodConstants): boolean {
  return (
    facts.nodesKnown >= constants.ascensionCanonBreadth &&
    facts.cellsKnown >= constants.ascensionCanonCells &&
    facts.dependence <= constants.ascensionDependenceMax &&
    facts.eraNodesLost <= lossAllowance(facts.nodesKnown, constants)
  );
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
 * every trigger is a *consecutive* run: a universe alternating decades between
 * mageless and thriving is not dying, and a counter that only increased would
 * eventually terminate every long run regardless of health.
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
  // acquiring nothing and unworshipped, so a healthy custodian with a completed
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
 * universe that stagnated at tier 1 in era 1 — a zero floor spirals a losing
 * streak toward zero carried prestige, the runaway-leader failure with the sign
 * flipped.
 *
 * Written at termination, applied to the *next* universe's `prestige`, never the
 * terminating one: §1.1 makes `prestige` read-only during a run, and a run that
 * could raise its own carried prestige mid-flight would be the meta-game feeding
 * the loop it sits outside.
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
 * The clamp defends against a content bug raising the earning ceiling, and is
 * otherwise unreachable: the loader asserts
 * `cap × (fp(1024) − retention) == earnMax × fp(1024)`, making `cap` the
 * analytic limit of the recurrence at maximum earning. An infinite streak of
 * perfect runs approaches it asymptotically and never exceeds it; the tenth
 * consecutive ascension adds a few percent over the fifth.
 *
 * ## Staged ahead of its consumer, and the consumer is a run boundary
 *
 * **Nothing in this repository calls this function, and that is a statement
 * about what the simulation does not yet have rather than about this file.**
 * `check:reachability` reports it, and the report is correct.
 *
 * The recurrence relates two runs. Half the seam exists: `system.ts` writes
 * `prestigeEarned` onto the universe row once, at termination, as the gloss
 * above describes. Nothing reads it back, because **nothing starts a successor
 * universe** — `scenario`'s `buildReferenceState` composes one universe with
 * `prestige: 0` and `step()`s it to a tick cap, and `agent-api`'s session has no
 * successor lifecycle. A grep for a write of a non-zero `prestige` anywhere in
 * `packages/` returns nothing.
 *
 * The missing piece is a **succession layer above the world step**: on
 * `terminalReason !== none`, read `prestigeEarned`, call this, build the next
 * universe's tick-zero state through {@link legacyGrant}. Above `step()` because
 * §1.1 makes `prestige` read-only for a run's length — a universe raising its own
 * carried prestige mid-flight would be the meta-game feeding the loop it sits
 * outside.
 *
 * **That layer is a change of its own, with its own spec**, deliberately not
 * invented here: a succession seam built to silence a reachability finding would
 * be a mechanic nobody designed, and unwinding one later costs more than the
 * finding does now.
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
 * Concave on top of a convergent accumulation — two damping stages in series
 * make the meta-game's ceiling a property rather than a tuning accident. At the
 * prestige cap the budget reaches about `fp(819)` of a possible `fp(1024)`, at
 * half the cap about `fp(682)`, so the back half of the prestige range is nearly
 * worthless and a long winning streak buys little over a short one.
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
  /** Knowledge instances to place in a library, at or below {@link archiveMaxTier}. */
  readonly archiveNodes: number;
  /**
   * The deepest node tier a seeded instance may be — `legacy-archive-max-tier`.
   *
   * Carried in the grant rather than left for the seeder to look up: the count
   * above is meaningless without it, and the two were separated once already —
   * `archiveNodes` shipped promising *"at or below the authored tier"* while the
   * tier resolved into `GodConstants` and was read by nothing, a promise made in
   * a comment and kept nowhere. A seeder handed only a count re-derives the
   * bound, and one that forgot would let a legacy seed the summit — the failure
   * the constant's own gloss names: *"prestige buying the ascension condition."*
   *
   * Not computed here. Passed through unchanged, so the one place a retune
   * happens stays `god-constant.json`.
   */
  readonly archiveMaxTier: number;
}

/**
 * Converts carried prestige into starting stocks.
 *
 * **Stocks, never rates, and the distinction is the whole model.** In a game
 * with two compounding loops a rate bonus feeds through both for the whole run
 * and its advantage *grows* with run length — the meta-game deciding matches
 * before they start. A stock is spent, consumed, aged out or looted, so its
 * advantage *decays*. The seeded archive in an ordinary library is the sharpest
 * version: the head start is not merely perishable, it is a target.
 *
 * Each channel is `channelMax × budget / fp(1024)`, `channelMax` being
 * `LEGACY_HEADSTART_FRACTION` of the median unaided universe's value for that
 * channel at the reference tick. That fraction is the only knob
 * `prestigeAdvantage` turns; if it reaches zero and the metric still fails, the
 * model is wrong and gets redesigned rather than retuned.
 *
 * ## Staged ahead of its consumer, for the same reason {@link carriedPrestige} is
 *
 * Nothing calls this, and `check:reachability` reports it with the five
 * constants only it reads — `legacy-archive-nodes`, `legacy-headstart-fraction`,
 * and the three `legacy-baseline-*`. They inherit this function's answer rather
 * than holding one of their own.
 *
 * A grant is a **tick-zero starting position for a universe that does not exist
 * yet**, so its caller is {@link carriedPrestige}'s succession layer: the thing
 * that ends one run and founds the next.
 *
 * What that caller still has to decide, none of it settled here, none of it
 * mechanical:
 *
 * - **`materials` is one figure and `MATERIAL_STOCK` has three fields** — food,
 *   stone, vellum. Splitting three ways, weighting, or giving each field the
 *   whole figure are three different starting positions.
 * - **`populace` is a headcount; a cohort is keyed by `(speciesId, occupation,
 *   birthTickBucket)`** with `contracts.md` §1.3 requiring one entity per key.
 *   The heads either join existing cohorts — changing the species and occupation
 *   mix — or found new ones, needing a birth bucket nobody has chosen.
 * - **`archiveNodes` cannot be placed as bare instances.** A written copy at
 *   `LOCATION_KIND.library` needs a paired `GRIMOIRE` row whose `holderKind` and
 *   `holderId` agree — `KnowledgeSubsystem.createInstance` throws otherwise — so
 *   seeding an archive means authoring book durability, a magnitude no constant
 *   here supplies.
 *
 * Seeding decisions with balance consequences. Inventing them to give this
 * function a call site would be inventing the mechanic.
 *
 * The three `legacy-baseline-*` values are also **placeholders their own glosses
 * disown** — *"a measurement that has not been taken"* — pinned to
 * `legacy-reference-tick`. Until a `prestigeAdvantage` sweep replaces them this
 * is correct arithmetic over numbers nobody has measured: a second, independent
 * reason not to wire it to anything reporting a balance figure.
 */
export function legacyGrant(prestige: Fixed, constants: GodConstants): LegacyGrant {
  const budget = legacyBudget(prestige, constants);
  const share = (baseline: number): number =>
    mul(mul(baseline, constants.legacyHeadstartFraction), budget);

  return {
    favor: share(constants.legacyBaselineFavor),
    materials: share(constants.legacyBaselineMaterials),
    // A count, not `fp`: a fifth of a person is not a person, and rounding up a
    // headcount would hand a fresh universe a free settler.
    populace: Math.floor(share(constants.legacyBaselinePopulace * FP_ONE) / FP_ONE),
    archiveNodes: Math.floor(
      (constants.legacyArchiveNodes * FP_ONE * budget) / (FP_ONE * FP_ONE),
    ),
    archiveMaxTier: constants.legacyArchiveMaxTier,
  };
}
