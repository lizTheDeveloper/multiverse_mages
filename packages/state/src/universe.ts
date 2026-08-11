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

import { EDICT, UNIVERSE } from './components.js';
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
  const handle = state.entities.create();
  attachRecord(state, UNIVERSE, handle, record);
  return handle;
}

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
