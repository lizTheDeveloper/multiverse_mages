/*
 * Multiverse Mages — the universe singleton and the ruleset it snapshots.
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
 * Reading `contracts.md` §1.1's universe out of state, and freezing the part of
 * it that governs legality.
 *
 * One simulation instance holds one universe. A raid does **not** load a second
 * universe into the same instance: it captures an immutable ruleset snapshot
 * from each participant at portal open, and {@link permits} evaluates against
 * that snapshot, never against a live entity.
 */

import type { EntityHandle, SimState } from '@mm/sim-core';
import { NULL_ENTITY, eraOf } from '@mm/sim-core';

import { EDICT, MID_RAID_CHANGE, UNIVERSE } from './components.js';
import type { UniverseRecord } from './components.js';
import { EDICT_BUDGET_MAX } from './enums.js';
import type { Edict, RulesetSnapshot } from './permits.js';
import { assertNoEdictConflict } from './permits.js';
import { attachRecord, collectRecords, readRecord } from './records.js';

/**
 * Creates the universe entity and its component row.
 *
 * Returns the handle rather than storing it anywhere. §1.1 says one universe
 * per instance, and {@link findUniverse} recovers it by scanning the one
 * component that can only have one row — which is cheaper than a cached handle
 * that a snapshot round-trip would have to be trusted to restore.
 */
export function createUniverse(state: SimState, record: UniverseRecord): EntityHandle {
  assertTraditionSelected(record);
  const handle = state.entities.create();
  attachRecord(state, UNIVERSE, handle, record);
  return handle;
}

/**
 * Throws unless a universe record names a tradition.
 *
 * §1.1 says a universe has *exactly one* `traditionId` and that it is **never
 * `0`**, and until now that sentence was a comment on {@link UniverseRecord}
 * with nothing enforcing it. `0` is the zeroed default of a `u16` field, so an
 * unselected tradition is not a value somebody typed — it is what a record
 * looks like when the selection step was skipped, which is precisely the case a
 * comment cannot catch.
 *
 * The failure it prevents is downstream and quiet. `rules-magic`'s `hookFor`
 * throws on tradition `0`, but only when something *resolves a hook*: a
 * universe that never cast, never researched and never scribed would carry the
 * missing selection indefinitely, and the first thing to notice would be a raid
 * arbitration far from the construction site. Checking here fails at the moment
 * the mistake is made, with the record in hand.
 *
 * Exported separately from {@link createUniverse} because a snapshot load path
 * reconstructs the row without going through the constructor, and it should be
 * able to make the same assertion rather than reimplement it.
 *
 * @throws RangeError if `traditionId` is `0`.
 */
export function assertTraditionSelected(record: UniverseRecord): void {
  if (record.traditionId !== NO_TRADITION) return;
  throw new RangeError(
    'This universe names no tradition: `traditionId` is 0. contracts.md §1.1 says exactly one ' +
      'tradition is required per universe and that it is never 0 — a tradition supplies the four ' +
      'hooks (acquire, store, cast, cost) every acquisition, cast and cost resolves through, and ' +
      'a zeroed id would resolve to "standard everything", which is a plausible-looking answer to ' +
      'a question nobody asked.',
  );
}

/** The `traditionId` of a universe whose tradition was never selected. */
const NO_TRADITION = 0;

/**
 * The universe entity, or {@link NULL_ENTITY} if the world has none yet.
 *
 * @throws Error if more than one exists. §1.1 says *singleton*, and a second
 * universe in one instance would make every unqualified "the universe" in the
 * rules layer ambiguous — silently, since each read would simply find whichever
 * came first in slot order.
 */
export function findUniverse(state: SimState): EntityHandle {
  const rows = collectRecords(state, UNIVERSE);
  if (rows.length > 1) {
    throw new Error(
      `This simulation instance holds ${rows.length} universes. contracts.md §1.1 makes the ` +
        'universe a singleton per instance: a raid captures a ruleset snapshot from each ' +
        'participant rather than loading a second universe here.',
    );
  }
  return rows[0]?.handle ?? NULL_ENTITY;
}

/** The universe's row. */
export function readUniverse(state: SimState, universe: EntityHandle): UniverseRecord {
  return readRecord(state, UNIVERSE, universe);
}

/**
 * The universe's edicts, in ascending slot order.
 *
 * Slot order rather than issue order. §1.1's `edicts` is written as an array,
 * but nothing in the arbitration rule depends on its order — interdiction beats
 * dispensation regardless — and slot order is the one order two peers that
 * reached the same state by different routes agree on.
 */
export function readEdicts(state: SimState): Edict[] {
  return collectRecords(state, EDICT).map(({ row }) => ({ cellId: row.cellId, kind: row.kind }));
}

/**
 * One durable mark left by a ruleset change made during a raid.
 *
 * A projection of the {@link MID_RAID_CHANGE} row with its handle, because the
 * handle is what a caller needs in order to clear a mark once it has been paid
 * for. Ascending by handle: the marks are read while pricing an action, and a
 * price whose order two peers disagree about is a desync.
 */
export interface MidRaidMark {
  readonly handle: EntityHandle;
  /** {@link RULE_SCOPE}. */
  readonly scope: number;
  /** Technique bit, form bit, or cell id, by `scope`. */
  readonly targetId: number;
  /** {@link RULE_CHANGE_KIND}. */
  readonly changeKind: number;
  /** Favor paid inside the raid. The surcharge's base. */
  readonly paidCost: number;
  readonly markedTick: number;
}

/** Every mid-raid ruleset change still unreverted, ascending by handle. */
export function readMidRaidMarks(state: SimState): MidRaidMark[] {
  return collectRecords(state, MID_RAID_CHANGE)
    .map(({ handle, row }) => ({
      handle,
      scope: row.scope,
      targetId: row.targetId,
      changeKind: row.changeKind,
      paidCost: row.paidCost,
      markedTick: row.markedTick,
    }))
    .sort((a, b) => a.handle - b.handle);
}

/**
 * The mark a scope and target carries, or `undefined`.
 *
 * The lookup the god-action pricing path makes, kept here rather than at the
 * call site so that "which change is still marked" has one answer. Ties cannot
 * happen — a scope and target carry at most one mark, because clearing is part
 * of paying the surcharge — but the first by handle is returned regardless, so
 * a state that somehow held two would still price deterministically rather than
 * by iteration order.
 */
export function findMidRaidMark(
  state: SimState,
  scope: number,
  targetId: number,
): MidRaidMark | undefined {
  return readMidRaidMarks(state).find(
    (mark) => mark.scope === scope && mark.targetId === targetId,
  );
}

/**
 * Whether the universe may issue another edict.
 *
 * §1.1: a new edict may be issued only while `length < edictBudget`, and
 * existing edicts stay in force if the budget later falls — deterministic
 * auto-revocation would silently rewrite a player's ruleset mid-run. So this
 * answers "may one more be issued", never "are there too many".
 */
export function canIssueEdict(state: SimState, universe: EntityHandle): boolean {
  const budget = readUniverse(state, universe).edictBudget;
  return readEdicts(state).length < Math.min(budget, EDICT_BUDGET_MAX);
}

/**
 * Freezes the parts of a universe that decide legality, as a raid does at
 * portal open.
 *
 * The returned snapshot shares no mutable structure with state, and is frozen,
 * so a raid holding one cannot observe a mid-raid rule change *even if a bug
 * elsewhere made one*. That is the point: `rules-raid` may not depend on
 * `agent-api` (§5), so it has no action mask to lean on, and the vision's
 * frozen-policy rule has to be structural or it is nothing.
 */
export function captureRuleset(state: SimState, universe: EntityHandle): RulesetSnapshot {
  return buildRuleset(state, universe, true);
}

/**
 * The same capture, without the conflict assertion.
 *
 * For read-only consumers — the observation and the legality mask — which
 * `contracts.md` §4.2 forbids from throwing at all: an agent submitting a bad
 * action gets a no-op and a counter, never an exception. A conflicted ruleset
 * is reachable, since the god may issue a dispensation and an interdiction on
 * one cell and nothing validates the cell id at submission, so making the
 * *observation* throw would take a recoverable rules mistake and turn it into
 * a crashed training run.
 *
 * `permits()` is deliberately total over conflicted rulesets for the same
 * reason — interdiction simply wins — so reading one is well defined. The
 * assertion belongs on the paths that *construct* a ruleset for arbitration,
 * which is where {@link captureRuleset} keeps it.
 */
export function readRulesetForObservation(
  state: SimState,
  universe: EntityHandle,
): RulesetSnapshot {
  return buildRuleset(state, universe, false);
}

function buildRuleset(
  state: SimState,
  universe: EntityHandle,
  assertConflicts: boolean,
): RulesetSnapshot {
  const record = readUniverse(state, universe);
  const edicts = readEdicts(state).map((edict) => Object.freeze({ ...edict }));
  if (assertConflicts) {
    assertNoEdictConflict(edicts);
  }

  return Object.freeze({
    permittedTechniques: record.permittedTechniques,
    permittedForms: record.permittedForms,
    edicts: Object.freeze(edicts),
    traditionId: record.traditionId,
    contentRevision: state.contentRevision,
  });
}

/**
 * The era the world is in.
 *
 * A pure function of the clock, exposed here so nothing is tempted to add an
 * `era` field to {@link UNIVERSE}. §1.1 records that `era` was once a field
 * nothing wrote, while an ascension path was defined over it; `@mm/sim-core`
 * resolved that by deriving it, and this re-export is so a caller reaching for
 * "the universe's era" finds the derivation instead of adding the field back.
 */
export function currentEra(state: SimState): number {
  return eraOf(state.clock.worldTick);
}
