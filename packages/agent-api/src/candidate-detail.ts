/*
 * Multiverse Mages — what a candidate slot is, for a reader who is not a policy.
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
 * §4.4's **candidate descriptors** — a third projection, beside
 * `./knowledge-census.ts` and `./explain.ts`.
 *
 * `Candidate` is `{ params: readonly number[] }` and nothing else, which is the
 * whole of what a policy needs: §4.4 says *"the agent selects a slot index"*, and
 * a slot index is a categorical choice a network learns by outcome. A **person**
 * choosing which of nineteen mages to bless has no outcome to learn from yet and
 * is handed nineteen numbers, so the choice carries no meaning — it is click
 * work. `docs/design/interface-findings.md` §1.11 states the gap and splits it in
 * two:
 *
 * > - **Attributes that exist and do not travel.** Species, age, role,
 * >   affiliation and the personality triple are all in state and none of them
 * >   reaches the read path […] *"a cautious gnome enchanter of forty, at the
 * >   Third College"* identifies a mage to a player without a name existing
 * >   anywhere.
 * > - **A personal name, which nothing holds.** That is new content and a naming
 * >   scheme is a design decision, not a format change.
 *
 * This module is the **first half only**. Nothing here invents a name, and
 * nothing here can: no field of any component is a name, so a name produced here
 * would be fiction rendered as fact. `WHY_ABSENT.mageNames` in
 * `ui/shared/session.js` stays true after this change and stays printed.
 *
 * ## Why this is not on `PlayerState`, and not in the observation
 *
 * Two separate reasons, pointing the same way.
 *
 * The observation is out because widening it moves `OBSERVATION_SIZE` and
 * `OBSERVATION_LAYOUT_DIGEST`, which `gate.ts` lists in `PROVENANCE_KEYS` and
 * which invalidates every committed balance baseline. That is the argument
 * `./player-state.ts` makes for `stocks`, and it holds here with far more force:
 * thirteen fields per mage across 32 bless slots, 32 role slots and 16 grant
 * slots is not a rounding error on a 400-slot vector, it is a second vector.
 *
 * `PlayerState` is out for a different reason. `entitlement.ts` walks it and
 * requires every top-level block to be one `encodePlayerState` places —
 * `unencodedObservables` reports *"is a PlayerState field that
 * encodePlayerState does not place"* otherwise — and `DECLARED_UNENCODED` cannot
 * hold a `PlayerState` field either, by the reverse check right above it. So a
 * block here would have to be encoded, which is the first reason again. The gate
 * is right, and this projection is simply not that kind of thing: §4.4's own
 * words, *"emitted on request, is never an input to any rules computation, and
 * no simulation behaviour may depend on whether it was requested"*.
 *
 * ## What that means for the trait inventory
 *
 * `docs/design/observable-trait-inventory.md` classifies eight of the ten `mage`
 * traits WITHHELD with the reason `not-yet-decided`, and this change moves none
 * of them: they remain unwritten by the encoder, so a *policy* still cannot see
 * a mage's age, role, affiliation, personality or vigor. That classification is
 * a statement about `observation.ts`. It is not a statement about what a player
 * may know about her own universe — the inventory says as much itself, recording
 * that `hidden-from-opponent` is unused because *"the observation is always of
 * the agent's own universe"*.
 *
 * ## Alignment is the invariant
 *
 * A submitted parameter is still a slot index. So `byAction.get(a)[i]` must
 * describe `lists.get(a)[i]` for every action and every slot, or a page shows one
 * mage and blesses another — a defect no rejection would surface, because both
 * slots are legal. {@link describeCandidates} therefore takes the caller's own
 * `CandidateLists` rather than rebuilding them, and returns one entry per entry,
 * in order; `AgentSession.candidateDetails` passes the very list
 * `AgentSession.candidates` returns.
 *
 * ## Handles are looked up, not embedded
 *
 * §1.11 offers the choice — *"whether the descriptor rides on the `Candidate` […]
 * or sits beside `knowledgeCensus` as a per-handle lookup"* — and this takes the
 * second. Actions 8, 9 and 10 name largely the *same* mages, so embedding would
 * ship each of them up to three times per tick; a per-handle table ships each
 * once and lets a client notice that slot 3 of bless and slot 7 of assign-role
 * are one woman, which is itself a thing a player wants to know.
 *
 * ## Cost
 *
 * Bounded by the lists, not by the world. The mage handles named by every list
 * together are at most `16 + 32 + 32`, so the knowledge tally is one pass over
 * `knowledge-instance` filtered to a small set, rather than the per-mage
 * repertoire `knowledgeCensus` builds for everybody. Nothing here is on any
 * policy's per-tick path.
 */

import type { SimState } from '@mm/sim-core';
import type { GoalCommitmentRecord } from '@mm/state';
import {
  GOAL_COMMITMENT,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  UNIVERSITY,
  UNIVERSITY_STAFF,
  collectRecords,
  componentOf,
} from '@mm/state';

import { GOD_ACTION } from './actions.js';
import type { ContentCatalogue } from './catalogue.js';
import type { CandidateLists } from './candidates.js';

/**
 * One mage, in the terms a player would use to tell her from another one.
 *
 * **No name, and no `birthTick` or `alive`.** `alive` because every mage in this
 * table is living — `livingMages` filters the lists — so the field would be a
 * constant dressed as information. `birthTick` because §1.2 makes age *derived,
 * never stored*, and a client handed the tick would derive it against whatever
 * clock it happened to hold; {@link ageTicks} is derived once, here, against the
 * clock the rest of the frame was read from.
 *
 * Dropping those two is also what keeps this from being a second declaration of
 * `MageRecord`. `state`'s schema-duplication check refuses a type whose fields
 * are a superset of a §1 record, and it is right to: the reason someone
 * redeclares is to add a field, and the added field is then written and never
 * serialized.
 */
export interface MageDescriptor {
  /** The entity handle. What `params[0]` carries, and it names nobody. */
  readonly handle: number;
  /** §1.3's interned species id. `@mm/content` names it; this package cannot. */
  readonly speciesId: number;
  /** `worldTick - birthTick`, in world ticks. §1.2: age is derived, never stored. */
  readonly ageTicks: number;
  /** `MAGE_ROLE`'s id. The enum is `@mm/state`'s; the *word* is the client's. */
  readonly roleId: number;
  /** University handle, or `0` for unaffiliated. §1.11's *"where she is"*. */
  readonly universityId: number;
  /** Personality, `fp`. Rolled at birth from species means. */
  readonly curiosity: number;
  readonly ambition: number;
  readonly caution: number;
  /** What a tradition's `cost` hook deducts from, `fp`. Action 9's ranking key. */
  readonly vigor: number;
  readonly maxVigor: number;
  /** Distinct nodes she holds in `mind` or `palace` — what she herself can work. */
  readonly nodesKnown: number;
  /** The deepest tier among them; `0` when she holds none. */
  readonly deepestTier: number;
  /**
   * What she is working on, or `undefined` when she has never committed.
   *
   * `@mm/state`'s own row, nested rather than inlined — the `stocks` precedent
   * in `player-state.ts`, and the same rule: four fields of a §1 record spread
   * as siblings here is a second declaration of it.
   *
   * **`undefined` is not `goalId: 0`.** `GOAL_COMMITMENT`'s own note makes that
   * distinction load-bearing: an absent row is a mage who has not chosen yet,
   * `goalId: 0` is a mage who weighed her options and committed to idle. A
   * client rendering the first as the second would report a whole university of
   * deliberate loafers on the tick they were promoted.
   */
  readonly goal: GoalCommitmentRecord | undefined;
}

/**
 * One standing university, in the terms funding it would be judged on.
 *
 * `libraryId` is deliberately absent and {@link hasLibrary} stands in for it: a
 * library handle is another number that names nobody, while *whether there is a
 * library at all* decides whether funding this one buys shelves or foundations.
 * {@link libraryNodes} then says how much is already on those shelves.
 */
export interface UniversityDescriptor {
  readonly handle: number;
  /** §1.4's student seats. */
  readonly capacity: number;
  /** `fp(1024)` is complete. Action 11's ranking key — least complete first. */
  readonly buildProgress: number;
  /** Whether §1.4's `libraryId` is set. The handle itself would name nobody. */
  readonly hasLibrary: boolean;
  /** Distinct nodes on its shelves. `0` for a university with no library. */
  readonly libraryNodes: number;
  /** Living mages whose `universityId` is this handle. */
  readonly affiliatedMages: number;
  /** §1.4 `staffCohorts` links pointing here. */
  readonly staffCohorts: number;
}

/**
 * What one slot *is*, as a tag plus the ids it names.
 *
 * §1.11's second complaint is that one anonymous label covered every shape:
 *
 * > `fundUniversityCandidates` puts `{ params: [0] }` — *found a new one* — in
 * > slot 0 ahead of the standing universities […] and
 * > `foundingKnowledgeCandidates` pairs a mage handle with a **node id**, half of
 * > which content does name. The label is per slot, not per param, so both come
 * > out as *"1 of 2, by §4.4 ranking"*.
 *
 * A tagged union rather than an optional-field bag, so a client's switch is
 * exhaustive and a new verb's shape is a missing branch at every rendering site
 * rather than a blank chip at one of them.
 *
 * `mage-lost` exists because a slot resolves against *current* state: a caller
 * may hand in lists built from an older one, and a handle that no longer names a
 * living mage must render as the stale slot it is rather than as a mage whose
 * every attribute is zero.
 */
export type CandidateDetail =
  /** Action 9. `params` is `[mageId]`. */
  | { readonly kind: 'mage'; readonly handle: number }
  /** Action 10. `params` is `[mageId, roleId]`; `toRoleId` is the role she would take. */
  | { readonly kind: 'mage-role'; readonly handle: number; readonly toRoleId: number }
  /** Action 8. `params` is `[mageId, nodeId]` — a founding grant, so nobody holds the node. */
  | { readonly kind: 'mage-node'; readonly handle: number; readonly nodeId: number }
  /** Action 11, slots 1 and up. `params` is `[universityId]`. */
  | { readonly kind: 'university'; readonly handle: number }
  /** Action 11, slot 0. `params` is `[0]` — §4.2's *"universityId | 0 to found new"*. */
  | { readonly kind: 'found-university' }
  /**
   * Action 14. `params` is `[targetId]`, and **state holds nothing to describe
   * it with**. A rival is generated from the run seed and the target id when the
   * raid resolves (`scenario/src/rival-universe.ts`), so before the portal opens
   * there is no entity, no ruleset and no population to read. The id is the whole
   * of what is knowable, and this kind exists so a client can say that rather
   * than print a bare number as though it were a description.
   */
  | { readonly kind: 'portal-target'; readonly targetId: number }
  /** Action 12. `params` is `[cellId]`; `@mm/content` names the cell. */
  | { readonly kind: 'cell'; readonly cellId: number }
  /** Action 13. `params` is `[traditionId]`; `@mm/content` names it. */
  | { readonly kind: 'tradition'; readonly traditionId: number }
  /** Action 16. `params` is `[speciesId]`; `@mm/content` names it. */
  | { readonly kind: 'species'; readonly speciesId: number }
  /** The handle names no living mage or university here — a slot gone stale. */
  | { readonly kind: 'lost'; readonly handle: number };

/** The whole projection: slots in list order, and the tables they point into. */
export interface CandidateDetailProjection {
  /** Per action id, aligned slot-for-slot with the `CandidateLists` given. */
  readonly byAction: ReadonlyMap<number, readonly CandidateDetail[]>;
  /** Every mage any slot names, once, by handle. */
  readonly mages: ReadonlyMap<number, MageDescriptor>;
  /**
   * Every university any slot names **and** every university a described mage
   * is affiliated to — so *"where she is"* resolves to something a player can
   * read even when action 11 did not happen to list her college this tick.
   */
  readonly universities: ReadonlyMap<number, UniversityDescriptor>;
}

/** What {@link describeCandidates} reads. */
export interface CandidateDetailInput {
  readonly state: SimState;
  /** For a node's tier. The catalogue holds no name; `@mm/content` does. */
  readonly catalogue: ContentCatalogue;
  /** The lists to describe. Described in place — see the note on alignment. */
  readonly lists: CandidateLists;
}

/** The three actions whose `params[0]` is a mage handle. */
const MAGE_PARAM_ACTIONS: ReadonlySet<number> = new Set([
  GOD_ACTION.grantFoundingKnowledge,
  GOD_ACTION.blessMage,
  GOD_ACTION.assignRole,
]);

/**
 * Describes every slot of every list, in place.
 *
 * @returns One array per action id present in `lists`, of exactly the same
 * length and in the same order, plus the lookup tables those arrays reference.
 */
export function describeCandidates(input: CandidateDetailInput): CandidateDetailProjection {
  const { state, catalogue, lists } = input;

  // Which handles are actually named, so the passes below are bounded by the
  // lists rather than by the universe. Three thousand mages contribute at most
  // eighty here.
  const mageHandles = new Set<number>();
  const universityHandles = new Set<number>();
  for (const [action, list] of lists) {
    for (const candidate of list ?? []) {
      const first = candidate.params[0] ?? 0;
      if (MAGE_PARAM_ACTIONS.has(action)) mageHandles.add(first);
      else if (action === GOD_ACTION.fundUniversity && first !== 0) universityHandles.add(first);
    }
  }

  const mages = describeMages(state, catalogue, mageHandles);
  for (const mage of mages.values()) {
    if (mage.universityId !== 0) universityHandles.add(mage.universityId);
  }
  const universities = describeUniversities(state, universityHandles);

  const byAction = new Map<number, readonly CandidateDetail[]>();
  for (const [action, list] of lists) {
    byAction.set(
      action,
      Object.freeze((list ?? []).map((candidate) => detailFor(action, candidate.params, mages, universities))),
    );
  }

  return Object.freeze({ byAction, mages, universities });
}

function detailFor(
  action: number,
  params: readonly number[],
  mages: ReadonlyMap<number, MageDescriptor>,
  universities: ReadonlyMap<number, UniversityDescriptor>,
): CandidateDetail {
  const first = params[0] ?? 0;
  const second = params[1] ?? 0;
  if (MAGE_PARAM_ACTIONS.has(action) && !mages.has(first)) return { kind: 'lost', handle: first };
  switch (action) {
    case GOD_ACTION.blessMage:
      return { kind: 'mage', handle: first };
    case GOD_ACTION.assignRole:
      return { kind: 'mage-role', handle: first, toRoleId: second };
    case GOD_ACTION.grantFoundingKnowledge:
      return { kind: 'mage-node', handle: first, nodeId: second };
    case GOD_ACTION.fundUniversity:
      if (first === 0) return { kind: 'found-university' };
      return universities.has(first)
        ? { kind: 'university', handle: first }
        : { kind: 'lost', handle: first };
    case GOD_ACTION.encourageResearch:
      return { kind: 'cell', cellId: first };
    case GOD_ACTION.changeTradition:
      return { kind: 'tradition', traditionId: first };
    case GOD_ACTION.inviteScholar:
      return { kind: 'species', speciesId: first };
    case GOD_ACTION.openPortal:
    default:
      // `openPortal` and any action added to `PARAMETERIZED_ACTIONS` without a
      // branch here. Falling through to the shape that promises nothing is the
      // safe direction: a new verb renders as an id and a caption saying so,
      // rather than as a mage it is not.
      return { kind: 'portal-target', targetId: first };
  }
}

/** The mage rows named by the lists, with their knowledge and their goal. */
function describeMages(
  state: SimState,
  catalogue: ContentCatalogue,
  handles: ReadonlySet<number>,
): ReadonlyMap<number, MageDescriptor> {
  const out = new Map<number, MageDescriptor>();
  if (handles.size === 0) return out;

  // Distinct nodes and deepest tier, per named mage, in one pass over the
  // instance store. `mind` and `palace` only: those two are what *she* holds and
  // therefore what she can work. A grimoire on her shelf is a book she owns —
  // `knowledgeCensus` splits all four for exactly this reason, and conflating
  // them would report a librarian as a scholar.
  const held = new Map<number, Set<number>>();
  const deepest = new Map<number, number>();
  const store = componentOf(state, KNOWLEDGE_INSTANCE);
  const nodeIds = store.field('nodeId');
  const kinds = store.field('locationKind');
  const locations = store.field('locationId');
  store.forEach((rowIndex: number) => {
    const kind = kinds[rowIndex];
    if (kind !== LOCATION_KIND.mind && kind !== LOCATION_KIND.palace) return;
    const holder = locations[rowIndex] ?? 0;
    if (!handles.has(holder)) return;
    const nodeId = nodeIds[rowIndex] ?? 0;
    let set = held.get(holder);
    if (set === undefined) {
      set = new Set<number>();
      held.set(holder, set);
    }
    set.add(nodeId);
    const tier = catalogue.node(nodeId)?.tier ?? 0;
    if (tier > (deepest.get(holder) ?? 0)) deepest.set(holder, tier);
  });

  const goals = componentOf(state, GOAL_COMMITMENT);
  const mageStore = componentOf(state, MAGE);
  const worldTick = state.clock.worldTick;

  // Ascending handle, so the table's key order is the world's ordering and not
  // the order the lists happened to mention people in — the point
  // `collectRecords` makes about row order, one level up.
  for (const handle of [...handles].sort((a, b) => a - b)) {
    if (handle === 0 || !mageStore.has(handle)) continue;
    if (mageStore.get(handle, 'alive') === 0) continue;
    out.set(handle, {
      handle,
      speciesId: mageStore.get(handle, 'speciesId'),
      // Clamped at zero rather than allowed negative: a mage born after the
      // clock cannot exist, and "-3 months old" rendered on a card would be
      // reported as a world defect rather than as the arithmetic it is.
      ageTicks: Math.max(0, worldTick - mageStore.get(handle, 'birthTick')),
      roleId: mageStore.get(handle, 'roleId'),
      universityId: mageStore.get(handle, 'universityId'),
      curiosity: mageStore.get(handle, 'curiosity'),
      ambition: mageStore.get(handle, 'ambition'),
      caution: mageStore.get(handle, 'caution'),
      vigor: mageStore.get(handle, 'vigor'),
      maxVigor: mageStore.get(handle, 'maxVigor'),
      nodesKnown: held.get(handle)?.size ?? 0,
      deepestTier: deepest.get(handle) ?? 0,
      goal: goals.has(handle)
        ? {
            goalId: goals.get(handle, 'goalId'),
            targetNodeId: goals.get(handle, 'targetNodeId'),
            adoptedTick: goals.get(handle, 'adoptedTick'),
            score: goals.get(handle, 'score'),
          }
        : undefined,
    });
  }
  return out;
}

/** The university rows named by the lists, with what is on their shelves. */
function describeUniversities(
  state: SimState,
  handles: ReadonlySet<number>,
): ReadonlyMap<number, UniversityDescriptor> {
  const out = new Map<number, UniversityDescriptor>();
  if (handles.size === 0) return out;

  const store = componentOf(state, UNIVERSITY);

  // Which library belongs to which named university, so one pass over the
  // instance store attributes shelved nodes back to a university without a
  // lookup per instance.
  const libraryOwner = new Map<number, number>();
  for (const handle of handles) {
    if (handle === 0 || !store.has(handle)) continue;
    const libraryId = store.get(handle, 'libraryId');
    if (libraryId !== 0) libraryOwner.set(libraryId, handle);
  }

  const shelved = new Map<number, Set<number>>();
  if (libraryOwner.size > 0) {
    const instances = componentOf(state, KNOWLEDGE_INSTANCE);
    const nodeIds = instances.field('nodeId');
    const kinds = instances.field('locationKind');
    const locations = instances.field('locationId');
    instances.forEach((rowIndex: number) => {
      if (kinds[rowIndex] !== LOCATION_KIND.library) return;
      const owner = libraryOwner.get(locations[rowIndex] ?? 0);
      if (owner === undefined) return;
      let set = shelved.get(owner);
      if (set === undefined) {
        set = new Set<number>();
        shelved.set(owner, set);
      }
      set.add(nodeIds[rowIndex] ?? 0);
    });
  }

  const affiliated = new Map<number, number>();
  for (const { row } of collectRecords(state, MAGE)) {
    if (row.alive === 0) continue;
    if (!handles.has(row.universityId)) continue;
    affiliated.set(row.universityId, (affiliated.get(row.universityId) ?? 0) + 1);
  }

  const staff = new Map<number, number>();
  for (const { row } of collectRecords(state, UNIVERSITY_STAFF)) {
    if (!handles.has(row.universityId)) continue;
    staff.set(row.universityId, (staff.get(row.universityId) ?? 0) + 1);
  }

  for (const handle of [...handles].sort((a, b) => a - b)) {
    if (handle === 0 || !store.has(handle)) continue;
    out.set(handle, {
      handle,
      capacity: store.get(handle, 'capacity'),
      buildProgress: store.get(handle, 'buildProgress'),
      hasLibrary: store.get(handle, 'libraryId') !== 0,
      libraryNodes: shelved.get(handle)?.size ?? 0,
      affiliatedMages: affiliated.get(handle) ?? 0,
      staffCohorts: staff.get(handle) ?? 0,
    });
  }
  return out;
}
