/*
 * Multiverse Mages — the core emits an outcome record and no reward.
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
 * `contracts.md` §4.3. The load-bearing assertion here is the *absence* one:
 * the view an agent receives has no reward field, because §4.3 says reward is a
 * property of a training objective and *"baking one in would make every trained
 * agent a hostage to one researcher's choice"*.
 */

import { TERMINAL_REASON, UNIVERSE, attachRecord, readUniverse } from '@mm/state';
import { observe, outcomeOf, sparseTerminalReward } from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

import { FIXTURE_CATALOGUE, engageWorld, firstUniverse } from './fixtures.js';

/** Rewrites one field of the universe row, leaving the rest as the fixture set it. */
function setTerminalReason(world: ReturnType<typeof firstUniverse>, reason: number): void {
  const record = readUniverse(world.state, world.universe);
  attachRecord(world.state, UNIVERSE, world.universe, { ...record, terminalReason: reason });
}

describe('§4.3 — the outcome record', () => {
  it('travels alongside the observation and carries no reward', () => {
    const world = firstUniverse();
    const view = observe({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    expect(view.outcome.terminal).toBe(false);
    expect(view.outcome.terminalReason).toBe(TERMINAL_REASON.none);
    expect(Object.keys(view)).not.toContain('reward');
  });

  it('flags truncated distinctly from terminal', () => {
    // §4.3: conflating the two is a silent training bug, because bootstrapping
    // value estimates through them differs.
    const world = firstUniverse();
    const truncated = outcomeOf({ state: world.state, truncated: true });
    expect(truncated.truncated).toBe(true);
    expect(truncated.terminal).toBe(false);

    setTerminalReason(world, TERMINAL_REASON.stagnation);
    const terminal = outcomeOf({ state: world.state });
    expect(terminal.terminal).toBe(true);
    expect(terminal.truncated).toBe(false);
  });

  it('reads terminal off terminalReason, not off `ascended`', () => {
    // A stagnated run has `ascended === 0` and is emphatically over.
    const world = firstUniverse();
    setTerminalReason(world, TERMINAL_REASON.stagnation);
    expect(readUniverse(world.state, world.universe).ascended).toBe(0);
    expect(outcomeOf({ state: world.state }).terminal).toBe(true);
  });

  it('does not end the episode when a raid begins', () => {
    // §4.3: "A raid is inside an episode, not its own episode."
    const world = firstUniverse();
    engageWorld(world);
    expect(outcomeOf({ state: world.state }).terminal).toBe(false);
    expect(outcomeOf({ state: world.state }).truncated).toBe(false);
  });
});

describe('§4.3 — the shipped default reward', () => {
  it('is sparse and terminal: ascension +1, everything else 0', () => {
    const world = firstUniverse();
    expect(sparseTerminalReward(outcomeOf({ state: world.state }))).toBe(0);

    for (const reason of [TERMINAL_REASON.ascensionApotheosis, TERMINAL_REASON.ascensionCanon]) {
      setTerminalReason(world, reason);
      expect(sparseTerminalReward(outcomeOf({ state: world.state }))).toBe(1);
    }

    for (const reason of [TERMINAL_REASON.stagnation, TERMINAL_REASON.truncated]) {
      setTerminalReason(world, reason);
      expect(sparseTerminalReward(outcomeOf({ state: world.state }))).toBe(0);
    }
  });

  it('is replaceable — the signature is the contract, not the function', () => {
    const world = firstUniverse();
    setTerminalReason(world, TERMINAL_REASON.stagnation);
    const outcome = outcomeOf({ state: world.state });
    const punishStagnation = (record: typeof outcome): number =>
      record.terminalReason === TERMINAL_REASON.stagnation ? -1 : 0;
    expect(punishStagnation(outcome)).toBe(-1);
    expect(sparseTerminalReward(outcome)).toBe(0);
  });
});
