/*
 * Multiverse Mages — slot-indexed candidate lists for the parameterized actions.
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
 * `docs/design/contracts.md` §4.4, implemented.
 *
 * > Actions 8–14 carry entity handles drawn from a set that changes every tick,
 * > and a flat discrete mask cannot express "action 9, but only for these 40 of
 * > 3,000 mages."
 * >
 * > **Resolution:** parameterized actions address a **slot-indexed candidate
 * > list**, not raw handles. Each observation carries, per parameterized action,
 * > a fixed-length list of the top-*k* candidate entities ranked by a
 * > deterministic salience ordering; the agent selects a slot index.
 *
 * ## Three properties, and each prevents a different failure
 *
 * 1. **Fixed length.** `k` comes from `CANDIDATE_SLOTS` and never from how many
 *    candidates were found. A list that shrank when mages died would make slot
 *    5 mean a different mage every tick, which is the exact thing a policy
 *    cannot learn against.
 * 2. **Deterministic ordering, tie-broken by entity handle.** Never by slot
 *    order, row order, or discovery order — `@mm/state`'s `collectRecords`
 *    records why: rows move under swap-removal, so row order depends on the
 *    destruction history, and two peers holding identical state could rank
 *    identically-scored candidates differently and desync.
 * 3. **A slot is resolved against *current* state, at submission.** §4.4: *"A
 *    slot referring to an entity that died between observation and action is an
 *    ordinary illegal action."* Ordinary — a no-op and a counter increment, not
 *    an exception. `./gate.ts` re-derives the lists rather than trusting the
 *    ones the agent saw, which is what makes that sentence true rather than
 *    aspirational.
 *
 * ## The orderings below are structural, not tuned
 *
 * §8 leaves utility-AI scoring to `rules-world` and the worship formulas to
 * `god-agency`, so there is nothing here to compute a *good* salience from yet.
 * Each ordering uses one obvious state key plus the handle tie-break, and is
 * documented as such. Replacing one with a real utility function later changes
 * which entity a slot names — which is a balance-affecting change and belongs
 * in a release claim, not in a refactor.
 */

import type { EntityHandle, SimState } from '@mm/sim-core';
import {
  ENCOURAGED_CELL,
  GRID_CELL_COUNT,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  MAGE_ROLE,
  UNIVERSITY,
  readRulesetForObservation,
  canGrantFoundingKnowledge,
  collectRecords,
  findUniverse,
  permits,
  readUniverse,
} from '@mm/state';

import type { ContentCatalogue } from './catalogue.js';
import { GOD_ACTION, PARAMETERIZED_ACTIONS, candidateSlotCount } from './actions.js';

/**
 * One entry of a candidate list: the parameters the slot resolves to.
 *
 * `params` is an integer tuple in the order §4.2's parameter column lists them
 * — `[mageId, nodeId]` for action 8, `[mageId, roleId]` for action 10, a single
 * id for the rest. Keeping the tuple here rather than making the agent supply
 * the second parameter is what lets one slot index address a pair, which is the
 * only way a flat discrete action space can express action 8 at all.
 */
export interface Candidate {
  readonly params: readonly number[];
}

/** The candidate lists for one observation, keyed by action id. */
export type CandidateLists = ReadonlyMap<number, readonly Candidate[]>;

/** What the candidate lists are derived from. */
export interface CandidateInput {
  readonly state: SimState;
  readonly catalogue: ContentCatalogue;
  /**
   * Universes this one could open a portal to.
   *
   * Supplied by the caller because §1.1 is explicit that *"one simulation
   * instance holds one universe"* — the multiverse is not in state, and there
   * is nothing here to enumerate. An empty list means action 14 has no
   * candidates and is therefore masked, which is the correct answer for a
   * single-universe Monte Carlo run.
   */
  readonly portalTargets?: readonly number[];
}

/** Every parameterized action's list, each truncated to its pinned `k`. */
export function buildCandidates(input: CandidateInput): CandidateLists {
  const lists = new Map<number, readonly Candidate[]>();
  for (const action of PARAMETERIZED_ACTIONS) {
    lists.set(action, truncate(action, candidatesFor(action, input)));
  }
  return lists;
}

/** Cuts a list to the action's pinned `k`. Never pads — an absent slot is illegal. */
function truncate(action: number, found: Candidate[]): readonly Candidate[] {
  return Object.freeze(found.slice(0, candidateSlotCount(action)));
}

function candidatesFor(action: number, input: CandidateInput): Candidate[] {
  switch (action) {
    case GOD_ACTION.grantFoundingKnowledge:
      return foundingKnowledgeCandidates(input);
    case GOD_ACTION.blessMage:
      return blessCandidates(input.state);
    case GOD_ACTION.assignRole:
      return assignRoleCandidates(input.state);
    case GOD_ACTION.fundUniversity:
      return fundUniversityCandidates(input.state);
    case GOD_ACTION.encourageResearch:
      return encourageResearchCandidates(input);
    case GOD_ACTION.changeTradition:
      return changeTraditionCandidates(input);
    case GOD_ACTION.openPortal:
      return portalCandidates(input);
    default:
      return [];
  }
}

/** Living mages, ascending handle. The base list several orderings start from. */
function livingMages(state: SimState): { handle: EntityHandle; vigor: number; roleId: number }[] {
  return collectRecords(state, MAGE)
    .filter(({ row }) => row.alive !== 0)
    .map(({ handle, row }) => ({ handle, vigor: row.vigor, roleId: row.roleId }))
    .sort((a, b) => a.handle - b.handle);
}

/** Nodes each mage holds, by handle. §1.5: `mind` and `palace` locate by mage. */
function knownNodesByMage(state: SimState): ReadonlyMap<number, ReadonlySet<number>> {
  const known = new Map<number, Set<number>>();
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (row.locationKind !== LOCATION_KIND.mind && row.locationKind !== LOCATION_KIND.palace) {
      continue;
    }
    let set = known.get(row.locationId);
    if (set === undefined) {
      set = new Set<number>();
      known.set(row.locationId, set);
    }
    set.add(row.nodeId);
  }
  return known;
}

/**
 * Action 8: `(mage, node)` pairs a god could found knowledge with.
 *
 * Restricted to **tier-1 nodes the mage does not already hold, in cells the
 * ruleset permits**. Tier 1 because "founding" knowledge is the seed a universe
 * starts from, and granting a tier-7 node to a fresh mage would let the god
 * skip the entire §6a knowledge-as-capital loop the game is about. Permitted
 * because §1.1 makes legality gate acquisition.
 *
 * Ordering: ascending mage handle, then ascending node id. Both are stable
 * identities, so the list is the same on every machine holding the same state.
 *
 * **An exhausted grant budget empties the list, which closes the mask entry.**
 * Founding grants are a bounded resource — a god starts with an allowance and
 * earns more by the universe discovering nodes on its own — and an action a bot
 * can submit but which reliably does nothing is the defect `illegalActionRate`
 * calls a *"spec-clarity smell"*: the mask says yes, `god-agency` refuses, and
 * the disagreement lands in the telemetry looking like a confused agent. So the
 * budget is read here, from the same `@mm/state` accessor the rules use, and the
 * mask follows it down through `PARAMETERIZED_ACTIONS` with no edit of its own —
 * exactly as `canIssueEdict` gates actions 5 and 6.
 *
 * The permitted-cell filter is re-derived from the ruleset **at call time** and
 * never cached, so a grid whose enabled set moves during a run — techniques and
 * forms are to become discoverable — narrows and widens this list with it.
 */
function foundingKnowledgeCandidates(input: CandidateInput): Candidate[] {
  const { state, catalogue } = input;
  const universe = findUniverse(state);
  if (universe === 0) return [];
  if (!canGrantFoundingKnowledge(state, universe)) return [];
  const ruleset = readRulesetForObservation(state, universe);
  const known = knownNodesByMage(state);

  const grantable = catalogue.nodes
    .filter((node) => node.tier === 1)
    .filter((node) => node.cellId >= 1 && node.cellId <= GRID_CELL_COUNT && permits(ruleset, node.cellId))
    .sort((a, b) => a.nodeId - b.nodeId);

  const found: Candidate[] = [];
  for (const mage of livingMages(state)) {
    const held = known.get(mage.handle);
    for (const node of grantable) {
      if (held?.has(node.nodeId) === true) continue;
      found.push({ params: [mage.handle, node.nodeId] });
      // Cut the search short at `k` rather than enumerating every mage against
      // every tier-1 node and then slicing. With three thousand mages and
      // seventy cells that product is large enough to matter, and every entry
      // past the sixteenth would be built only to be thrown away.
      if (found.length >= candidateSlotCount(GOD_ACTION.grantFoundingKnowledge)) return found;
    }
  }
  return found;
}

/**
 * Action 9: mages worth blessing, most depleted first.
 *
 * Ascending `vigor` — the resource §1.2 says a tradition's `cost` hook deducts
 * from — then ascending handle. Absolute vigor rather than the fraction of
 * `maxVigor`: the fraction needs a division, and `floorDiv` at this scale would
 * collapse most mages to the same quotient and hand the ordering entirely to
 * the tie-break.
 */
function blessCandidates(state: SimState): Candidate[] {
  return livingMages(state)
    .sort((a, b) => (a.vigor !== b.vigor ? a.vigor - b.vigor : a.handle - b.handle))
    .map((mage) => ({ params: [mage.handle] }));
}

/**
 * Action 10: `(mage, role)` pairs, excluding the role she already holds.
 *
 * Excluded because assigning a mage the role she has is a no-op the agent
 * cannot distinguish from a real change, and a slot that does nothing is worse
 * than a slot that is illegal — the illegal one at least increments a counter
 * the harness reports.
 */
function assignRoleCandidates(state: SimState): Candidate[] {
  const roles = Object.values(MAGE_ROLE).sort((a, b) => a - b);
  const found: Candidate[] = [];
  for (const mage of livingMages(state)) {
    for (const roleId of roles) {
      if (roleId === mage.roleId) continue;
      found.push({ params: [mage.handle, roleId] });
    }
  }
  return found;
}

/**
 * Action 11: universities to fund, least complete first, after the standing
 * option to found a new one.
 *
 * **Slot 0 is always `[0]`** — §4.2's *"universityId | 0 to found new"*. It is
 * a fixed slot rather than a ranked candidate because it does not name an
 * entity and therefore cannot die between observation and action; giving it a
 * position that moved with the university list would make founding a university
 * an action whose slot index changed every time one was built.
 */
function fundUniversityCandidates(state: SimState): Candidate[] {
  const existing = collectRecords(state, UNIVERSITY)
    .map(({ handle, row }) => ({ handle, buildProgress: row.buildProgress }))
    .sort((a, b) =>
      a.buildProgress !== b.buildProgress
        ? a.buildProgress - b.buildProgress
        : a.handle - b.handle,
    )
    .map((university) => ({ params: [university.handle] }));
  return [{ params: [0] }, ...existing];
}

/**
 * Action 12: permitted cells not already under encouragement, deepest first.
 *
 * Ranked by descending count of instances already in the cell, then ascending
 * cell id — encouragement compounds with what a universe already knows, which
 * is the §6a loop, so the ordering puts the cells where it would compound at
 * the top. Cells already encouraged are excluded: §1.1 gives
 * `encouragedCells` an expiry, and re-encouraging an active cell is the same
 * do-nothing slot `assignRole` excludes.
 */
function encourageResearchCandidates(input: CandidateInput): Candidate[] {
  const { state, catalogue } = input;
  const universe = findUniverse(state);
  if (universe === 0) return [];
  const ruleset = readRulesetForObservation(state, universe);

  const encouraged = new Set(
    collectRecords(state, ENCOURAGED_CELL)
      .filter(({ row }) => row.expiryTick > state.clock.worldTick)
      .map(({ row }) => row.cellId),
  );

  const weight = new Int32Array(GRID_CELL_COUNT);
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    const node = catalogue.node(row.nodeId);
    if (node === undefined) continue;
    const index = node.cellId - 1;
    if (index < 0 || index >= GRID_CELL_COUNT) continue;
    weight[index] = (weight[index] ?? 0) + 1;
  }

  const found: { cellId: number; weight: number }[] = [];
  for (let cellId = 1; cellId <= GRID_CELL_COUNT; cellId += 1) {
    if (encouraged.has(cellId)) continue;
    if (!permits(ruleset, cellId)) continue;
    found.push({ cellId, weight: weight[cellId - 1] ?? 0 });
  }
  return found
    .sort((a, b) => (b.weight !== a.weight ? b.weight - a.weight : a.cellId - b.cellId))
    .map((entry) => ({ params: [entry.cellId] }));
}

/**
 * Action 13: traditions other than the one held.
 *
 * §1.1 gives a universe exactly one tradition and never 0, so the current one
 * is excluded for the same reason a mage's current role is: it would be a slot
 * that reliably does nothing.
 */
function changeTraditionCandidates(input: CandidateInput): Candidate[] {
  const { state, catalogue } = input;
  const universe = findUniverse(state);
  if (universe === 0) return [];
  const current = readUniverse(state, universe).traditionId;
  return catalogue.traditionIds
    .filter((traditionId) => traditionId !== current && traditionId !== 0)
    .map((traditionId) => ({ params: [traditionId] }));
}

/** Action 14: portal targets, ascending. Supplied by the caller — see {@link CandidateInput}. */
function portalCandidates(input: CandidateInput): Candidate[] {
  return [...new Set(input.portalTargets ?? [])]
    .filter((target) => Number.isInteger(target) && target !== 0)
    .sort((a, b) => a - b)
    .map((target) => ({ params: [target] }));
}

/**
 * The candidate a slot index names, or `undefined`.
 *
 * `undefined` covers both "the slot is past the end of the list" and "the index
 * is not a slot at all". Both are ordinary illegal actions per §4.4, and
 * distinguishing them would give an agent a signal the mask already carries.
 */
export function candidateAt(
  lists: CandidateLists,
  action: number,
  slot: number,
): Candidate | undefined {
  const list = lists.get(action);
  if (list === undefined) return undefined;
  if (!Number.isInteger(slot) || slot < 0 || slot >= candidateSlotCount(action)) return undefined;
  return list[slot];
}
