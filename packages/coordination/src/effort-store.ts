/*
 * Multiverse Mages — where unfinished work lives between two ticks.
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
 * ## The question `gateway.ts` used to refuse to answer
 *
 * `@mm/rules-magic`'s `research` takes *"progress accumulated before this step"*
 * and says *"the caller owns storing it"*; teaching and scribing have a cost to
 * reach and no accumulator either. Nothing owned it, and the three `contribute*`
 * methods threw rather than invent somewhere for it to go — a component, a
 * schema revision and a migration is not a decision for whoever writes the first
 * caller, which is the argument `contracts.md` §1.2 already makes about the goal
 * commitment.
 *
 * It is `@mm/state`'s {@link EFFORT_PROGRESS}, one entity per project, and the
 * property that decided the shape is that **progress outlives a goal switch**. A
 * mage displaced from a node by hysteresis has not abandoned it; she has set it
 * down. Storing progress on the goal commitment would have deleted years of work
 * the moment a challenger cleared the margin, and the mage would have restarted
 * that node from zero on returning to it — a loss no metric in the project would
 * attribute to the hysteresis rule that caused it.
 *
 * ## The ledger is a view of one tick, like the gateway next door
 *
 * Every lookup here is by `(subject, kind, nodeId, counterparty)`, which is not
 * an entity handle, so answering one means finding the row. Doing that by scan
 * would make the work phase `mages × efforts`. So the index is built once per
 * construction and maintained by this class's own writers — and the class is
 * therefore stale the moment something else touches the component, which is why
 * the world loop builds one per tick rather than keeping one around.
 *
 * The indices are `Map`s and are used **only** for lookup. Nothing depends on
 * the order they enumerate in: `contracts.md`-driven determinism forbids a rule
 * whose outcome depends on the insertion history of a hash structure, so the
 * two methods that hand rows to a caller sort what they gathered back into
 * ascending slot order before returning it, and eviction breaks its ties on
 * declared fields rather than on position.
 *
 * ## Whose rows, without reading everybody's
 *
 * "Which projects belong to this mage" used to be `collectRecords` over the
 * whole component, a record object per row, and a `filter`. `#evictIfFull` asks
 * it every time a mage starts a project, so a tick in which two hundred mages
 * each began one cost two hundred passes over every project in the universe —
 * 14% of a profiled two-hundred-year run. So the subject and the counterparty
 * each get a handle set, maintained by the same two writers that maintain the
 * key index.
 */

import type { ContentId, Fp } from '@mm/content';
import type { EntityHandle, SimState } from '@mm/sim-core';
import { handleIndex } from '@mm/sim-core';
import type { EffortKindValue, EffortProgressRecord, Handle } from '@mm/state';
import { EFFORT_KIND, EFFORT_PROGRESS, attachRecord, collectRecords, componentOf } from '@mm/state';

/**
 * The most projects one mage may have set down at once.
 *
 * A bound in the same family as `MAX_FRONTIER_SCAN` and
 * `MAX_TEACHING_COUNTERPARTIES`, and for the same reason: without one, the
 * component grows with *how often mages change their minds*, which is a number
 * the design does not control and which nothing would notice until a 200-year
 * run's snapshots stopped fitting anywhere. A mage who lives eight centuries and
 * reconsiders every commitment period would otherwise carry a row for every node
 * she ever glanced at.
 *
 * It is not a cap on what a mage may *pursue* — she can always start a project;
 * the least-invested one is given up to make room. **Untuned**, like every
 * magnitude before 0.5.0.
 */
export const MAX_EFFORTS_PER_MAGE = 8;

/** What identifies one project. See `EFFORT_PROGRESS` for why each part is here. */
export interface EffortKey {
  /** The mage the effort is counted against. For teaching, the teacher. */
  readonly subject: Handle;
  readonly kind: EffortKindValue;
  readonly nodeId: ContentId;
  /** The student, for teaching; `0` otherwise. */
  readonly counterparty: Handle;
}

/** One stored project, with the handle of the entity carrying it. */
export interface EffortRow extends EffortKey {
  readonly handle: EntityHandle;
  readonly progress: Fp;
}

/**
 * Reads and writes {@link EFFORT_PROGRESS}, and is the only thing that does.
 *
 * One writer, for the reason `KnowledgeSubsystem` gives about instances: a
 * component several modules write directly is one whose invariants — the
 * per-mage bound, the removal of a finished project, the cleanup on death —
 * hold only as far as the least careful of them.
 */
export class EffortLedger {
  readonly #state: SimState;
  /** `keyOf(...)` to entity handle. Lookup only; never iterated. */
  readonly #index = new Map<string, EntityHandle>();
  /** Mage to the projects counted against her. Lookup only; see the module note. */
  readonly #bySubject = new Map<Handle, Set<EntityHandle>>();
  /**
   * Counterparty to the rows naming it — a mage, for the lessons she is the
   * *student* half of, and `0` for everything that has no second person in it.
   *
   * The `0` bucket is kept rather than skipped so that this pair of maps answers
   * `counterparty === mage` for *every* argument, exactly as the `filter` it
   * replaced did. Skipping it would be free and would quietly change the answer
   * to a question about the null handle.
   */
  readonly #byCounterparty = new Map<Handle, Set<EntityHandle>>();

  constructor(state: SimState) {
    this.#state = state;
    for (const { handle, row } of collectRecords(state, EFFORT_PROGRESS)) {
      this.#index.set(keyOf(row), handle);
      this.#link(row, handle);
    }
  }

  /** Work accumulated on a project, or `0` for one nobody has started. */
  progressOf(key: EffortKey): Fp {
    const handle = this.#index.get(keyOf(key));
    if (handle === undefined) return 0;
    return componentOf(this.#state, EFFORT_PROGRESS).get(handle, 'progress');
  }

  /**
   * Adds work to a project, creating its row on the first month spent.
   *
   * Created on first use rather than when a goal is adopted, so that a mage who
   * commits to something and dies, or is displaced, in the same tick leaves
   * nothing behind. Returns the new total, because every caller needs to compare
   * it against a requirement and re-reading it would be a second lookup.
   */
  accrue(key: EffortKey, amount: Fp): Fp {
    const store = componentOf(this.#state, EFFORT_PROGRESS);
    const existing = this.#index.get(keyOf(key));
    if (existing !== undefined) {
      const progress = store.get(existing, 'progress') + amount;
      store.set(existing, 'progress', progress);
      return progress;
    }

    this.#evictIfFull(key.subject);

    const handle = this.#state.entities.create();
    const record: EffortProgressRecord = {
      subject: key.subject,
      kind: key.kind,
      nodeId: key.nodeId,
      counterparty: key.counterparty,
      progress: amount,
    };
    attachRecord(this.#state, EFFORT_PROGRESS, handle, record);
    this.#index.set(keyOf(key), handle);
    this.#link(key, handle);
    return amount;
  }

  /** Caps a project's stored progress. Used when the work is done and the act is blocked. */
  clampTo(key: EffortKey, ceiling: Fp): void {
    const handle = this.#index.get(keyOf(key));
    if (handle === undefined) return;
    const store = componentOf(this.#state, EFFORT_PROGRESS);
    if (store.get(handle, 'progress') > ceiling) store.set(handle, 'progress', ceiling);
  }

  /**
   * Forgets a project: it finished, or it can never finish.
   *
   * The entity goes with the row. An effort entity exists only to carry one, so
   * leaving it behind would leak a handle per completed project — and unlike a
   * mage's, nothing else ever names it.
   */
  clear(key: EffortKey): void {
    const handle = this.#index.get(keyOf(key));
    if (handle === undefined) return;
    this.#remove(keyOf(key), handle);
  }

  /**
   * Forgets everything a mage was in the middle of, on either side of it.
   *
   * The death path. A dead mage's entity is deliberately retained — a grimoire
   * may name her as its last holder — so her rows would otherwise sit there
   * describing work nobody is doing, exactly as `clearCommitment` prevents for
   * her goal. Teaching efforts she was the *student* half of go too: a lesson
   * has two people in it and one of them is gone.
   */
  clearSubject(mage: Handle): void {
    for (const row of this.effortsInvolving(mage)) {
      this.#remove(keyOf(row), row.handle);
    }
  }

  /**
   * Every project this mage is on either side of, in ascending slot order.
   *
   * The order is load-bearing here in a way it is not for {@link effortsOf}:
   * `clearSubject` destroys these entities in the order they arrive, entity
   * slots are recycled, and a mage promoted later takes a handle that is also
   * her stream-1 actor key. Two peers that destroyed one dead scholar's rows in
   * different orders would hand different handles to different mages and roll
   * different personalities from the same seed.
   */
  effortsInvolving(mage: Handle): readonly EffortRow[] {
    const handles = new Set<EntityHandle>(this.#bySubject.get(mage) ?? []);
    for (const handle of this.#byCounterparty.get(mage) ?? []) handles.add(handle);
    return this.#rowsOf(handles);
  }

  /** Every project counted against this mage, in ascending slot order. */
  effortsOf(mage: Handle): readonly EffortRow[] {
    return this.#rowsOf(this.#bySubject.get(mage) ?? EMPTY_HANDLES);
  }

  /**
   * What this mage has banked against each node she is deriving alone.
   *
   * The frontier scan subtracts banked progress from every candidate's
   * requirement, once per candidate per mage per tick, and asking
   * {@link progressOf} for each of them built a key string per question — a few
   * hundred throwaway strings per mage per tick, to look up the eight rows she
   * could possibly have. This reads those eight and hands back a map.
   *
   * Research only, and solo research at that: a teaching row is the pair's and
   * is keyed on the student as well, so folding one in here would report a
   * lesson's progress as a discount on researching the same node alone.
   *
   * A `Map` the caller only ever reads by key. Its insertion order is the order
   * the mage's rows happen to sit in, and nothing may iterate it.
   */
  bankedResearch(subject: Handle): ReadonlyMap<ContentId, Fp> {
    const handles = this.#bySubject.get(subject);
    if (handles === undefined) return EMPTY_PROGRESS;
    const store = componentOf(this.#state, EFFORT_PROGRESS);
    const banked = new Map<ContentId, Fp>();
    for (const handle of handles) {
      if (store.get(handle, 'kind') !== EFFORT_KIND.research) continue;
      if (store.get(handle, 'counterparty') !== 0) continue;
      banked.set(store.get(handle, 'nodeId'), store.get(handle, 'progress'));
    }
    return banked;
  }

  /** How many rows the component holds. For reporting and for tests. */
  get size(): number {
    return componentOf(this.#state, EFFORT_PROGRESS).size;
  }

  /**
   * Gives up the least-invested project when a mage is at her bound.
   *
   * Least progress first, because the cheapest thing to lose is the thing least
   * has been spent on — and because any other rule would need a tick nobody
   * records. Ties fall to the lower `kind`, then the lower `nodeId`, then the
   * lower `counterparty`: three declared fields, so the choice depends on the
   * effort set and not on the order the rows happen to sit in.
   */
  #evictIfFull(subject: Handle): void {
    const held = this.effortsOf(subject);
    if (held.length < MAX_EFFORTS_PER_MAGE) return;

    let worst = held[0];
    if (worst === undefined) return;
    for (const row of held) {
      if (compareAbandonability(row, worst) < 0) worst = row;
    }
    this.#remove(keyOf(worst), worst.handle);
  }

  /**
   * Reads a set of effort entities into rows, ascending by slot.
   *
   * Sorted rather than gathered in order, because a `Set` enumerates in
   * insertion order and insertion order here is the history of who started what
   * when. `collectRecords` sorts by slot for exactly this reason and says so;
   * this is the same guarantee over a handful of rows instead of all of them.
   */
  #rowsOf(handles: ReadonlySet<EntityHandle>): EffortRow[] {
    const store = componentOf(this.#state, EFFORT_PROGRESS);
    const rows: EffortRow[] = [];
    for (const handle of handles) {
      rows.push({
        handle,
        subject: store.get(handle, 'subject'),
        kind: store.get(handle, 'kind') as EffortKindValue,
        nodeId: store.get(handle, 'nodeId'),
        counterparty: store.get(handle, 'counterparty'),
        progress: store.get(handle, 'progress'),
      });
    }
    rows.sort((a, b) => handleIndex(a.handle) - handleIndex(b.handle));
    return rows;
  }

  #link(address: EffortAddress, handle: EntityHandle): void {
    addTo(this.#bySubject, address.subject, handle);
    addTo(this.#byCounterparty, address.counterparty, handle);
  }

  #remove(key: string, handle: EntityHandle): void {
    const store = componentOf(this.#state, EFFORT_PROGRESS);
    // Read before the row goes: unlinking needs the two mages the row names, and
    // afterwards there is nothing left to ask.
    const subject = store.get(handle, 'subject');
    const counterparty = store.get(handle, 'counterparty');
    store.remove(handle);
    this.#state.entities.destroy(handle);
    this.#index.delete(key);
    removeFrom(this.#bySubject, subject, handle);
    removeFrom(this.#byCounterparty, counterparty, handle);
  }
}

/** A mage who is in the middle of nothing. Shared, and never written to. */
const EMPTY_HANDLES: ReadonlySet<EntityHandle> = new Set<EntityHandle>();

/** A mage who has banked nothing. Shared, and never written to. */
const EMPTY_PROGRESS: ReadonlyMap<ContentId, Fp> = new Map<ContentId, Fp>();

function addTo(index: Map<Handle, Set<EntityHandle>>, mage: Handle, handle: EntityHandle): void {
  let held = index.get(mage);
  if (held === undefined) {
    held = new Set<EntityHandle>();
    index.set(mage, held);
  }
  held.add(handle);
}

/**
 * Drops a handle, and the mage with her last one.
 *
 * The empty set goes too. A two-hundred-year run kills every mage in it several
 * times over, and a residue keyed on the dead grows with the length of the run —
 * which is the axis a balance sweep pushes hardest.
 */
function removeFrom(
  index: Map<Handle, Set<EntityHandle>>,
  mage: Handle,
  handle: EntityHandle,
): void {
  const held = index.get(mage);
  if (held === undefined) return;
  held.delete(handle);
  if (held.size === 0) index.delete(mage);
}

/** The four addressing fields, however they arrive. */
interface EffortAddress {
  readonly subject: number;
  readonly kind: number;
  readonly nodeId: number;
  readonly counterparty: number;
}

/** The lookup key, as a string. Never parsed back; never iterated. */
function keyOf(key: EffortAddress): string {
  return `${String(key.subject)}:${String(key.kind)}:${String(key.nodeId)}:${String(key.counterparty)}`;
}

/** Which of two efforts a mage gives up first. Negative means the first one. */
function compareAbandonability(a: EffortRow, b: EffortRow): number {
  if (a.progress !== b.progress) return a.progress - b.progress;
  if (a.kind !== b.kind) return a.kind - b.kind;
  if (a.nodeId !== b.nodeId) return a.nodeId - b.nodeId;
  return a.counterparty - b.counterparty;
}
