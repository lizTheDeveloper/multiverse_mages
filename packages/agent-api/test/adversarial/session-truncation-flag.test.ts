/*
 * Multiverse Mages — adversarial: the outcome record's truncated flag, in a session.
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
 * # DEFECT 2 — `AgentSession.outcome().truncated` is never `true`
 *
 * Two tests here **fail on purpose**.
 *
 * ## (a) The behaviour believed to be incorrect
 *
 * `createSession` holds the caller's `worldTickCap`, and `statusOf` uses it:
 * `current.clock.worldTick >= cap ? 'truncated' : 'running'`. So `status()`
 * knows. But `currentView()` builds the view with
 *
 * ```ts
 * view ??= observe({ state: current, catalogue: scenario.catalogue });
 * ```
 *
 * and never passes `truncated`. `ObserveInput.truncated` — *"The caller's step
 * limit, if it has one. §4.3 puts truncation on the caller."* — therefore
 * defaults to `undefined` on every observation a session ever takes, and
 * `outcomeOf` returns `input.truncated ?? false`. The field is dead: `false` at
 * every tick of every episode, including the tick at which the session itself
 * reports `'truncated'`.
 *
 * ## (b) What says otherwise
 *
 * `docs/design/contracts.md` §4.3, on episode boundaries:
 *
 * > **Truncated** — a step limit imposed by the caller, never by the core. A
 * > truncated episode is flagged distinctly from a terminal one; bootstrapping
 * > value estimates through the two differs, and **conflating them is a silent
 * > training bug**.
 *
 * `src/outcome.ts`, restating it and naming the cost:
 *
 * > The bug is silent in the strict sense — a policy trained through a conflated
 * > boundary converges to something, just to the wrong thing, and no test
 * > anywhere fails. Two booleans cost nothing and remove the possibility.
 *
 * `src/session.ts` on `ScenarioConfig.worldTickCap`:
 *
 * > §4.3 puts the step limit on the caller — *"a step limit imposed by the
 * > caller, never by the core"* — and **this is where the caller imposes it**.
 *
 * ## (c) Why the asserted value is right
 *
 * At the cap the episode is over and it is over for the caller's reason, not the
 * world's. The correct record is `terminal: false, truncated: true` — the two
 * flags are independent by design, so this is not self-contradictory, and it is
 * exactly the combination §4.3 draws the distinction to express. What the
 * session emits instead is `terminal: false, truncated: false`, which is the
 * record of an episode that is still running. A learner reading `outcome()` —
 * the record §4.3 says the core emits *"alongside each observation"*, and the
 * only structured episode-boundary signal the session offers — bootstraps
 * through the cap as if nothing happened. That is the silent training bug in
 * the sentence, reproduced.
 *
 * The `status()` string is not a substitute: `sparseTerminalReward` and every
 * other `RewardFunction` take an `OutcomeRecord` and nothing else, on purpose
 * (*"A reward function handed the whole state could read anything"*), so a
 * consumer written to §4.3's interface cannot see `status()` at all.
 */

import { GOD_ACTION, createSession, outcomeOf } from '@mm/agent-api';
import type { Action } from '@mm/sim-core';
import { describe, expect, it } from 'vitest';

import { LEAN_RESOURCES, plainScenario, universeHolding } from './worlds.js';

const NOOP: Action = { kind: GOD_ACTION.noop, params: [] };

describe('DEFECT 2 — the session never flags a truncated episode in its outcome record', () => {
  it('FAILS ON PURPOSE: reports truncated from status() but not from outcome()', () => {
    const session = createSession({ scenario: plainScenario() });
    session.reset(0x5150_0002, { worldTickCap: 1 });
    session.submit(NOOP);

    expect(session.status()).toBe('truncated');
    // Mutually satisfiable with the line above and with the line below: §4.3's
    // two flags are independent, and "the caller's limit ended it" is precisely
    // `truncated && !terminal`.
    expect(session.outcome().truncated).toBe(true);
    expect(session.outcome().terminal).toBe(false);
  });

  it('FAILS ON PURPOSE: leaves the flag false across an entire episode run to the cap', () => {
    // Stated as "at no point does it ever become true", so the test cannot be
    // satisfied by flipping the flag on some unrelated tick.
    const cap = 6;
    const session = createSession({ scenario: plainScenario() });
    session.reset(0x5150_0003, { worldTickCap: cap });

    const flags: boolean[] = [session.outcome().truncated];
    while (session.status() === 'running') {
      session.submit(NOOP);
      flags.push(session.outcome().truncated);
    }

    expect(session.status()).toBe('truncated');
    // Exactly one observation is taken past the cap — the last one — so exactly
    // one entry should be true.
    expect(flags.filter((flag) => flag).length).toBe(1);
    expect(flags[flags.length - 1]).toBe(true);
  });

  it('HOLDS: outcomeOf itself reports the flag when a caller passes it', () => {
    // The control. The mechanism exists and works; the session is the caller
    // that never uses it, which is why this is a session defect and not an
    // outcome-record one.
    const state = universeHolding(LEAN_RESOURCES);
    expect(outcomeOf({ state, truncated: true }).truncated).toBe(true);
    expect(outcomeOf({ state, truncated: true }).terminal).toBe(false);
    expect(outcomeOf({ state }).truncated).toBe(false);
  });

  it('HOLDS: a running episode reports neither flag', () => {
    const session = createSession({ scenario: plainScenario() });
    session.reset(0x5150_0004, { worldTickCap: 8 });
    session.submit(NOOP);
    expect(session.status()).toBe('running');
    expect(session.outcome()).toMatchObject({ terminal: false, truncated: false });
  });
});
