/*
 * Multiverse Mages — "revoke edict N" revokes the edict the player sees at N.
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
 * Action 7 takes an `edictIndex` (`contracts.md` §4.2) and nothing else, so the
 * index means whatever order the player was shown — the §4.1 ruleset block, and
 * `PlayerState.ruleset.edicts` that the UI renders. The resolver indexes
 * ascending entity handle. `readEdicts`, which both projections read, returned
 * the component's storage order while documenting "ascending slot order", and
 * the two disagree as soon as a recycled handle is in play — which on the
 * reference universe is from the first edict: dead mages free slots long before
 * a god issues anything.
 *
 * Reproduced before it was fixed (S4, 2026-10-08, seed 20260813): interdict
 * cells 5 then 9, the projection reads `[5, 9]`, submit `revoke 0`, and cell 9
 * is the one removed.
 *
 * The test issues edicts, revokes one, issues another into the freed handle,
 * and at every step revokes the index at which the projection shows a chosen
 * cell — asserting that exactly that cell leaves, and that the observation's
 * ruleset block agrees with the projection slot for slot.
 */

import { describe, expect, it } from 'vitest';

import {
  GOD_ACTION,
  OBSERVATION_DESCRIPTORS,
  createSession,
  observationBlock,
} from '@mm/agent-api';
import type { AgentSession } from '@mm/agent-api';

import { referenceContent, referenceScenario } from '../../src/index.js';

const content = referenceContent();

/** Generous, for the reason every long arm in this package gives. */
const TIMEOUT_MS = 180_000;

/**
 * A god with the pool and the slots to issue several edicts in a row, so the
 * test is about ordering rather than about affording. Raids off: an arriving
 * raid would lock the ruleset under this test's feet.
 */
function session(): AgentSession {
  const run = referenceScenario(content, {
    raids: false,
    sandbox: { favor: 60_000, favorCap: 200_000, edictBudget: 8 },
  });
  const s = createSession({ scenario: run.scenario, strategyId: 'revoke-order' });
  s.reset(20260813, { worldTickCap: 400 });
  return s;
}

/** Lets §7's unease decay so the next constitutional act is ordinarily priced. */
function settle(s: AgentSession): void {
  for (let tick = 0; tick < 10; tick += 1) s.submit({ kind: GOD_ACTION.noop });
}

const shown = (s: AgentSession): number[] => s.playerState().ruleset.edicts.map((e) => e.cellId);

/** The ruleset block's edict cell ids, decoded the way the frames carry them. */
function observed(s: AgentSession): number[] {
  const view = s.observe();
  const { offset } = observationBlock('ruleset');
  const base = offset + 19;
  const cells: number[] = [];
  for (let slot = 0; slot < 8; slot += 1) {
    const index = base + slot * 2;
    const descriptor = OBSERVATION_DESCRIPTORS[index];
    const cell = Math.round((view[index] ?? 0) * (descriptor?.divisor ?? 1));
    if (cell !== 0) cells.push(cell);
  }
  return cells;
}

function interdict(s: AgentSession, cellId: number): void {
  const result = s.submit({ kind: GOD_ACTION.issueInterdiction, params: [cellId] });
  expect(result.admitted, `interdiction on cell ${String(cellId)}`).toBe(true);
  settle(s);
}

/** Revokes the edict the player sees on `cellId`, by the index the player sees it at. */
function revokeShown(s: AgentSession, cellId: number): void {
  const before = shown(s);
  const index = before.indexOf(cellId);
  expect(index, `cell ${String(cellId)} is shown`).toBeGreaterThanOrEqual(0);
  s.submit({ kind: GOD_ACTION.revokeEdict, params: [index] });
  settle(s);
  expect(shown(s).sort()).toEqual(before.filter((c) => c !== cellId).sort());
}

describe('revoking edict N revokes the edict shown at N', () => {
  it(
    'agrees across issue, revoke, and an issue into a recycled handle',
    () => {
      const s = session();
      settle(s);
      interdict(s, 5);
      interdict(s, 9);
      interdict(s, 13);
      expect(shown(s).sort((a, b) => a - b)).toEqual([5, 9, 13]);
      expect(observed(s)).toEqual(shown(s));

      // The first one issued, wherever it is shown.
      revokeShown(s, 5);
      expect(observed(s)).toEqual(shown(s));

      // Into the freed handle, then revoke something that is not first.
      interdict(s, 20);
      expect(observed(s)).toEqual(shown(s));
      revokeShown(s, 13);
      expect(observed(s)).toEqual(shown(s));
      revokeShown(s, 20);
      revokeShown(s, 9);
      expect(shown(s)).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
