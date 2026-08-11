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
 * The index is a `Map` and is used **only** for lookup. Nothing iterates it:
 * `contracts.md`-driven determinism forbids a rule whose outcome depends on the
 * insertion history of a hash structure, and the one place this class needs an
 * order — eviction — sorts a slot-ordered list by declared fields instead.
 */

import type { ContentId, Fp } from '@mm/content';
import type { EntityHandle, SimState } from '@mm/sim-core';
import type { EffortKindValue, EffortProgressRecord, Handle } from '@mm/state';
import { EFFORT_PROGRESS, attachRecord, collectRecords, componentOf } from '@mm/state';

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

  constructor(state: SimState) {
    this.#state = state;
    for (const { handle, row } of collectRecords(state, EFFORT_PROGRESS)) {
      this.#index.set(keyOf(row), handle);
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

  /** Every project this mage is on either side of, in ascending slot order. */
  effortsInvolving(mage: Handle): readonly EffortRow[] {
    return this.#rows().filter((row) => row.subject === mage || row.counterparty === mage);
  }

  /** Every project counted against this mage, in ascending slot order. */
  effortsOf(mage: Handle): readonly EffortRow[] {
    return this.#rows().filter((row) => row.subject === mage);
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

  #rows(): EffortRow[] {
    return collectRecords(this.#state, EFFORT_PROGRESS).map(({ handle, row }) => ({
      handle,
      subject: row.subject,
      kind: row.kind as EffortKindValue,
      nodeId: row.nodeId,
      counterparty: row.counterparty,
      progress: row.progress,
    }));
  }

  #remove(key: string, handle: EntityHandle): void {
    componentOf(this.#state, EFFORT_PROGRESS).remove(handle);
    this.#state.entities.destroy(handle);
    this.#index.delete(key);
  }
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
