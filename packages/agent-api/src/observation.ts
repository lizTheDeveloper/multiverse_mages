/*
 * Multiverse Mages — the integer observation vector.
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
 * `docs/design/contracts.md` §4.1's observation, encoded as integers.
 *
 * **This half emits integers and nothing else.** §4.1: *"The core emits
 * integers; normalization happens in the agent-api layer, which is the one
 * place floats are permitted on the way out."* The float is one module over, in
 * `./normalize.ts`; nothing in this file divides, and the return type is an
 * `Int32Array` so that the claim is enforced by the container rather than
 * asserted in a comment.
 *
 * Every write goes through {@link saturate}, and every index through the
 * helpers in `./layout.ts`. Neither is ceremony: a raw `view[offset + i] = x`
 * on an `Int32Array` wraps silently above 2^31 and takes an offset nobody
 * checked, and the two failures compose into a population that reads as
 * negative in a channel that belongs to a different species.
 */

import type { SimState } from '@mm/sim-core';
import { TIME_MODE, eraOf } from '@mm/sim-core';
import type { Engagement, RaidSideValue } from '@mm/state';
import {
  COMBATANT,
  EDICT_BUDGET_MAX,
  GRID_CELL_COUNT,
  GRID_FORM_COUNT,
  GRID_TECHNIQUE_COUNT,
  GRIMOIRE,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  OBJECTIVE,
  POPULACE_COHORT,
  PREPARED_SPELL,
  RAID_SIDE,
  UNIVERSITY,
  collectRecords,
  findUniverse,
  inEngagement,
  readEdicts,
  readUniverse,
} from '@mm/state';

import type { ContentCatalogue } from './catalogue.js';
import {
  OBSERVATION_OBJECTIVE_CHANNELS,
  OBSERVATION_OBJECTIVE_SLOTS,
  OBSERVATION_SIDE_CHANNELS,
  OBSERVATION_SIZE,
  cohortSlot,
  knowledgeSlot,
  UNTAUGHT_TIER_SLOT,
  mageTierSlot,
  observationBlock,
  saturate,
} from './layout.js';

/**
 * The engagement this universe is in, and which side of it this universe is on.
 *
 * §4.1 describes the engagement block as *"own/enemy combatant summaries"*, and
 * "own" is not recoverable from an {@link Engagement}: the raid holds a host
 * ruleset and a raider ruleset, but the observing universe could be either. A
 * block laid out attacker-first would mean opposite things to the two
 * participants, and a policy trained as an attacker would read its own losses
 * as the enemy's the first time it defended. So the caller — which does know —
 * says, and the block is always own-first.
 */
export interface EngagementView {
  readonly engagement: Engagement;
  /** {@link RAID_SIDE}. Which side of this raid the observing universe is. */
  readonly ownSide: RaidSideValue;
}

/** What {@link rawObservation} reads. */
export interface ObservationInput {
  /** The world. One universe per instance (§1.1). */
  readonly state: SimState;
  /** Node tiers, node cells, and tradition ids. See `./catalogue.ts`. */
  readonly catalogue: ContentCatalogue;
  /**
   * The engagement, when the clock is in engagement mode.
   *
   * Omitted at world scale, and the engagement block is then zero-filled — §4.1
   * marks it *"(zeroed at world scale)"*, and §4.3 explains why the block
   * exists at all: *"A raid is inside an episode, not its own episode… One
   * agent plays both scales — which is exactly what the fixed-shape observation
   * with its zero-filled engagement block exists to support."*
   */
  readonly engagement?: EngagementView;
}

/**
 * A locations-and-tiers digest of the universe's knowledge, computed once.
 *
 * Built in a single pass rather than by re-scanning per cell. The knowledge
 * block is 70 cells wide and the instance count is unbounded, so a per-cell
 * scan is 70 passes over every instance in the universe, every observation, in
 * every Monte Carlo worker — which is exactly the kind of cost §1.3's cohort
 * contract exists to avoid elsewhere.
 */
interface KnowledgeDigest {
  /** Distinct known nodes per cell, indexed by `cellId - 1`. */
  readonly nodesKnown: Int32Array;
  /** Deepest tier known per cell, indexed by `cellId - 1`. `0` if none. */
  readonly deepestTier: Int32Array;
  /** Instances per cell, indexed by `cellId - 1`. */
  readonly instances: Int32Array;
  /** Distinct nodes held in libraries — §7's `capitalSnowball` quantity. */
  readonly libraryDepth: number;
  /** Highest tier known by each mage handle. Absent means she knows nothing. */
  readonly mageHighestTier: ReadonlyMap<number, number>;
}

function digestKnowledge(state: SimState, catalogue: ContentCatalogue): KnowledgeDigest {
  const nodesKnown = new Int32Array(GRID_CELL_COUNT);
  const deepestTier = new Int32Array(GRID_CELL_COUNT);
  const instances = new Int32Array(GRID_CELL_COUNT);
  const seenNodes = new Set<number>();
  const libraryNodes = new Set<number>();
  const mageHighestTier = new Map<number, number>();

  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    const node = catalogue.node(row.nodeId);
    if (node === undefined) {
      // A node the catalogue does not name. Skipped rather than thrown on: this
      // is state referring to content, and §0 already has the mechanism for
      // that mismatch — `contentRevision`, checked before two universes ever
      // interact. Throwing here would turn a stale-catalogue call into a
      // crash inside a Monte Carlo worker rather than a refused interaction.
      continue;
    }
    const cellIndex = node.cellId - 1;
    if (cellIndex < 0 || cellIndex >= GRID_CELL_COUNT) continue;

    instances[cellIndex] = saturate((instances[cellIndex] ?? 0) + 1);
    if (!seenNodes.has(node.nodeId)) {
      seenNodes.add(node.nodeId);
      nodesKnown[cellIndex] = saturate((nodesKnown[cellIndex] ?? 0) + 1);
    }
    if (node.tier > (deepestTier[cellIndex] ?? 0)) {
      deepestTier[cellIndex] = node.tier;
    }

    if (row.locationKind === LOCATION_KIND.library) {
      libraryNodes.add(node.nodeId);
    }

    // §1.5: a knowledge instance in a *mind* or a *palace* is located by mage
    // handle. Both count as the mage knowing the node — the palace location is
    // the Art of Memory tradition's `store` hook, and a policy that read only
    // `mind` would see every Art of Memory mage as knowing nothing.
    if (row.locationKind === LOCATION_KIND.mind || row.locationKind === LOCATION_KIND.palace) {
      const current = mageHighestTier.get(row.locationId) ?? 0;
      if (node.tier > current) mageHighestTier.set(row.locationId, node.tier);
    }
  }

  return { nodesKnown, deepestTier, instances, libraryDepth: libraryNodes.size, mageHighestTier };
}

/**
 * §4.1's observation as integers, always exactly {@link OBSERVATION_SIZE} long.
 *
 * The length does not depend on the universe, the content actually loaded, the
 * tick, or the clock mode. That is the whole requirement — everything else in
 * §4.1 is detail about what goes where.
 */
export function rawObservation(input: ObservationInput): Int32Array {
  const { state, catalogue } = input;
  const view = new Int32Array(OBSERVATION_SIZE);
  const digest = digestKnowledge(state, catalogue);

  writeRuleset(view, state);
  writeTradition(view, state);
  writeResources(view, state);
  writePopulation(view, state);
  writeMages(view, state, digest);
  writeKnowledge(view, digest);
  writeInstitutions(view, state, digest);
  writeClock(view, state);
  if (input.engagement !== undefined) {
    writeEngagement(view, input.engagement);
  }

  return view;
}

// ---------------------------------------------------------------------------
// World-scale blocks.
// ---------------------------------------------------------------------------

function writeRuleset(view: Int32Array, state: SimState): void {
  const { offset } = observationBlock('ruleset');
  const universe = findUniverse(state);
  if (universe === 0) return;

  const record = readUniverse(state, universe);
  for (let bit = 0; bit < GRID_TECHNIQUE_COUNT; bit += 1) {
    view[offset + bit] = (record.permittedTechniques & (1 << bit)) === 0 ? 0 : 1;
  }
  for (let bit = 0; bit < GRID_FORM_COUNT; bit += 1) {
    view[offset + GRID_TECHNIQUE_COUNT + bit] = (record.permittedForms & (1 << bit)) === 0 ? 0 : 1;
  }

  // Truncated at EDICT_BUDGET_MAX rather than trusted to fit. §1.1 caps
  // `edictBudget` at the constant, so an over-long list is already a bug — but
  // an unbounded write here would run into the tradition block and report a
  // ninth edict's cell id as the universe's tradition.
  const edicts = readEdicts(state).slice(0, EDICT_BUDGET_MAX);
  const edictBase = offset + GRID_TECHNIQUE_COUNT + GRID_FORM_COUNT;
  for (let slot = 0; slot < edicts.length; slot += 1) {
    const edict = edicts[slot];
    if (edict === undefined) continue;
    view[edictBase + slot * 2] = saturate(edict.cellId);
    view[edictBase + slot * 2 + 1] = saturate(edict.kind);
  }
}

function writeTradition(view: Int32Array, state: SimState): void {
  const { offset } = observationBlock('tradition');
  const universe = findUniverse(state);
  if (universe === 0) return;
  view[offset] = saturate(readUniverse(state, universe).traditionId);
}

function writeResources(view: Int32Array, state: SimState): void {
  const { offset } = observationBlock('resources');
  const universe = findUniverse(state);
  if (universe === 0) return;

  const record = readUniverse(state, universe);
  // §4.1's order, and the order is the contract: favor, worship, worshipTier,
  // materials, prestige.
  view[offset] = saturate(record.favor);
  view[offset + 1] = saturate(record.worship);
  view[offset + 2] = saturate(record.worshipTier);
  view[offset + 3] = saturate(record.materials);
  view[offset + 4] = saturate(record.prestige);
}

function writePopulation(view: Int32Array, state: SimState): void {
  const { offset } = observationBlock('population');
  for (const { row } of collectRecords(state, POPULACE_COHORT)) {
    const slot = offset + cohortSlot(row.speciesId, row.occupation);
    view[slot] = saturate((view[slot] ?? 0) + row.count);
  }
}

function writeMages(view: Int32Array, state: SimState, digest: KnowledgeDigest): void {
  const { offset } = observationBlock('mages');
  for (const { handle, row } of collectRecords(state, MAGE)) {
    if (row.alive === 0) continue;
    // Tier 0 is a mage who knows nothing, and she goes in slot 0 rather than
    // being skipped. §4.1's block was widened to eight slots per species for
    // exactly this: with seven, an all-zero mage block was ambiguous between an
    // empty universe and a young one — the state every universe is in when the
    // god's choices about what magic can exist matter most.
    const tier = digest.mageHighestTier.get(handle) ?? UNTAUGHT_TIER_SLOT;
    const slot = offset + mageTierSlot(row.speciesId, tier);
    view[slot] = saturate((view[slot] ?? 0) + 1);
  }
}

function writeKnowledge(view: Int32Array, digest: KnowledgeDigest): void {
  const { offset } = observationBlock('knowledge');
  for (let cellId = 1; cellId <= GRID_CELL_COUNT; cellId += 1) {
    const base = offset + knowledgeSlot(cellId);
    const index = cellId - 1;
    view[base] = saturate(digest.nodesKnown[index] ?? 0);
    view[base + 1] = saturate(digest.deepestTier[index] ?? 0);
    // §4.1 calls this channel "instance redundancy". It carries the raw
    // instance count, not the surplus over `nodesKnown`. Redundancy proper is
    // `instances - nodesKnown`, and the policy can compute that from these two
    // adjacent channels — whereas from a surplus alone the base is gone, and a
    // cell with one node and one copy would be indistinguishable from a cell
    // with forty nodes and forty copies. Emitting the count keeps both facts.
    view[base + 2] = saturate(digest.instances[index] ?? 0);
  }
}

function writeInstitutions(view: Int32Array, state: SimState, digest: KnowledgeDigest): void {
  const { offset } = observationBlock('institutions');
  const universities = collectRecords(state, UNIVERSITY);
  let capacity = 0;
  for (const { row } of universities) capacity += row.capacity;

  view[offset] = saturate(universities.length);
  view[offset + 1] = saturate(capacity);
  // "Library depth" as *distinct nodes held in libraries*, not as a count of
  // copies. §7's `capitalSnowball` runs a Gini coefficient over library depth as
  // the knowledge-as-capital measure, and forty copies of one node is not deep.
  // Pinned here because that metric will be implemented against this channel.
  view[offset + 2] = saturate(digest.libraryDepth);
  view[offset + 3] = saturate(collectRecords(state, GRIMOIRE).length);
}

function writeClock(view: Int32Array, state: SimState): void {
  const { offset } = observationBlock('clock');
  view[offset] = saturate(state.clock.worldTick);
  view[offset + 1] = saturate(eraOf(state.clock.worldTick));
  view[offset + 2] = state.clock.mode === TIME_MODE.engagement ? 1 : 0;
}

// ---------------------------------------------------------------------------
// The engagement block (§4.1, 64 channels, zero-filled at world scale).
// ---------------------------------------------------------------------------

/** One side's running totals, in {@link ENGAGEMENT_SIDE_CHANNELS} order. */
function emptySideTotals(): number[] {
  return Array.from({ length: OBSERVATION_SIDE_CHANNELS }, () => 0);
}

function writeEngagement(view: Int32Array, engaged: EngagementView): void {
  const { offset } = observationBlock('engagement');
  const { engagement, ownSide } = engaged;
  const entities = engagement.entities;

  const totals = new Map<number, number[]>([
    [RAID_SIDE.attacker, emptySideTotals()],
    [RAID_SIDE.defender, emptySideTotals()],
  ]);
  const sideOfCombatant = new Map<number, number>();

  for (const { handle, row } of collectRecords(entities, COMBATANT)) {
    const side = totals.get(row.side);
    if (side === undefined) continue; // a side outside {0,1} is rules-raid's bug, not a channel
    sideOfCombatant.set(handle, row.side);
    side[0] = saturate((side[0] ?? 0) + 1);
    side[1] = saturate((side[1] ?? 0) + row.hp);
    side[2] = saturate((side[2] ?? 0) + row.maxHp);
    side[3] = saturate((side[3] ?? 0) + row.vigor);
    side[4] = saturate((side[4] ?? 0) + row.maxVigor);
    side[5] = saturate((side[5] ?? 0) + row.concealment);
  }

  for (const { row } of collectRecords(entities, PREPARED_SPELL)) {
    const owner = sideOfCombatant.get(row.combatantId);
    if (owner === undefined) continue; // a spell prepared by a combatant that is gone
    const side = totals.get(owner);
    if (side === undefined) continue;
    side[6] = saturate((side[6] ?? 0) + 1);
  }

  const enemySide = ownSide === RAID_SIDE.attacker ? RAID_SIDE.defender : RAID_SIDE.attacker;
  const ordered = [totals.get(ownSide) ?? emptySideTotals(), totals.get(enemySide) ?? emptySideTotals()];
  for (let side = 0; side < ordered.length; side += 1) {
    const channels = ordered[side] ?? emptySideTotals();
    for (let channel = 0; channel < OBSERVATION_SIDE_CHANNELS; channel += 1) {
      view[offset + side * OBSERVATION_SIDE_CHANNELS + channel] = saturate(channels[channel] ?? 0);
    }
  }

  const objectiveBase = offset + 2 * OBSERVATION_SIDE_CHANNELS;
  const objectives = rankedObjectives(entities);
  for (let slot = 0; slot < OBSERVATION_OBJECTIVE_SLOTS && slot < objectives.length; slot += 1) {
    const objective = objectives[slot];
    if (objective === undefined) continue;
    const base = objectiveBase + slot * OBSERVATION_OBJECTIVE_CHANNELS;
    view[base] = saturate(objective.kind);
    view[base + 1] = saturate(objective.statusKind);
    view[base + 2] = saturate(objective.valueFp);
    view[base + 3] = objective.capturedBy === 0 ? 0 : 1;
  }

  const portalBase =
    objectiveBase + OBSERVATION_OBJECTIVE_SLOTS * OBSERVATION_OBJECTIVE_CHANNELS;
  view[portalBase] = saturate(engagement.raid.portalStability);
  view[portalBase + 1] = saturate(engagement.raid.stabilityDecayPerTick);
}

/**
 * Objectives in the order the block reports them: most valuable first, ties
 * broken by ascending entity handle.
 *
 * Deterministic and identity-keyed, for the reason `collectRecords` documents
 * about slot order versus row order — a ranking that fell back on row order
 * would depend on which objectives had been destroyed, so two peers agreeing on
 * every value could still fill the twelve slots differently and diverge.
 */
function rankedObjectives(entities: SimState): {
  kind: number;
  statusKind: number;
  valueFp: number;
  capturedBy: number;
}[] {
  return collectRecords(entities, OBJECTIVE)
    .map(({ handle, row }) => ({ handle, ...row }))
    .sort((a, b) => (b.valueFp !== a.valueFp ? b.valueFp - a.valueFp : a.handle - b.handle));
}

/** Whether the world's clock says an engagement is running (§1.6). */
export function isEngaged(state: SimState): boolean {
  return inEngagement(state);
}
