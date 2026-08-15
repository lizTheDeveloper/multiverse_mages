/*
 * Multiverse Mages — reconciling the harness's session surface with agent-api's.
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
 * `session.ts` declared the surface the harness needed while `agent-api`'s
 * session was being written next door. Both exist now, and `adaptAgentSession`
 * is the reconciliation; this file is what keeps it honest.
 *
 * ## Why the double, and not the real session
 *
 * Driving the real `createSession` needs a `Scenario`, a `Scenario` needs a
 * `SimState`, and building one needs `@mm/content` and `@mm/coordination` —
 * which `contracts.md` §5 forbids `mc-harness` from importing, in `src` and in
 * `test` alike. So the double below is typed **against `agent-api`'s exported
 * `AgentSession` interface**, which is what makes it a test of the
 * reconciliation rather than a test of a shape somebody made up: the double
 * cannot drift from the real session without failing to compile.
 */

import type {
  AgentSession as ApiSession,
  CandidateLists,
  EpisodeAccounting,
  EpisodeStatus,
  OutcomeRecord,
  ScenarioConfig,
  SubmitResult,
  AgentRng,
} from '@mm/agent-api';
import { ACTION_SPACE_SIZE, GOD_ACTION, agentRng } from '@mm/agent-api';

/**
 * `sim-core`'s `Action`, transcribed.
 *
 * `agent-api` re-exports neither the type nor a name for it, and §5 does not
 * grant `mc-harness` an edge to `sim-core` — so the shape is written here and
 * held to account by `implements ApiSession` below: a double whose `submit`
 * did not accept the real `Action` would not compile.
 */
interface Action {
  readonly kind: number;
  readonly params?: readonly number[];
}

import { TERMINAL_STATUS, adaptAgentSession, normalizeSubmission, runEpisode } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

/**
 * A session satisfying `agent-api`'s interface exactly.
 *
 * It advances one tick per `submit`, raises on a terminated episode, counts
 * rejections without throwing, and reports accounting under `agent-api`'s key
 * names — the four behaviours the adapter has to bridge or preserve.
 */
class ApiSessionDouble implements ApiSession {
  readonly observationSchemaVersion = 1;
  readonly observationLayoutDigest = 'double-layout';
  readonly actionSpaceSize = ACTION_SPACE_SIZE;
  readonly scenarioId = 'adapter-double';

  tick = 0;
  cap = 0;
  private submitted = 0;
  private rejected = 0;
  private rejectedByAction: Record<number, number> = {};
  /** Every `Action` the adapter handed over, verbatim. */
  readonly received: Action[] = [];
  private generator: AgentRng | undefined;

  reset(runSeed: number, config: ScenarioConfig): Float64Array {
    this.tick = 0;
    this.cap = config.worldTickCap;
    this.submitted = 0;
    this.rejected = 0;
    this.rejectedByAction = {};
    this.received.length = 0;
    this.generator = agentRng({ runSeed, agentSlotIndex: 0, strategyId: 'adapter-double' });
    return this.observe();
  }

  observe(): Float64Array {
    const view = new Float64Array(4);
    view[0] = this.tick / 1024;
    return view;
  }

  legalActions(): Uint8Array {
    const mask = new Uint8Array(ACTION_SPACE_SIZE);
    mask[GOD_ACTION.noop] = 1;
    // Legal only on even ticks, so a policy reaching for it accrues real
    // rejections rather than none.
    mask[GOD_ACTION.blessMage] = this.tick % 2 === 0 ? 1 : 0;
    return mask;
  }

  candidates(): CandidateLists {
    return new Map();
  }

  submit(action: Action): SubmitResult {
    if (this.status() !== 'running') {
      throw new Error(`This episode is ${this.status()}; it cannot be advanced.`);
    }
    this.received.push(action);
    this.submitted += 1;
    const legal = this.legalActions()[action.kind] === 1;
    if (!legal) {
      this.rejected += 1;
      this.rejectedByAction[action.kind] = (this.rejectedByAction[action.kind] ?? 0) + 1;
    }
    this.tick += 1;
    return { admitted: legal, observation: this.observe(), status: this.status() };
  }

  status(): EpisodeStatus {
    return this.tick >= this.cap ? 'truncated' : 'running';
  }

  outcome(): OutcomeRecord {
    return {
      terminal: false,
      truncated: this.status() === 'truncated',
      terminalReason: 0,
      era: 0,
      metricDeltas: {},
    };
  }

  accounting(): EpisodeAccounting {
    return {
      submitted: this.submitted,
      rejected: this.rejected,
      rejectedByAction: { ...this.rejectedByAction },
      enabled: true,
    };
  }

  illegalActionCount(): number {
    return this.rejected;
  }

  rng(): AgentRng {
    if (this.generator === undefined) throw new Error('no episode yet');
    return this.generator;
  }

  snapshotHash(): string {
    return `double-${String(this.tick)}`;
  }
}

describe('the adapter is the whole of the reconciliation', () => {
  it('translates an action id and a parameter into agent-api\'s Action', () => {
    const double = new ApiSessionDouble();
    const session = adaptAgentSession<ScenarioConfig>(double);
    session.reset(7, { worldTickCap: 8 });

    session.submit(GOD_ACTION.noop);
    session.submit(GOD_ACTION.blessMage, 3);

    expect(double.received).toEqual([
      { kind: GOD_ACTION.noop },
      // §4.4: the parameter is a slot index, and it arrives as params[0].
      { kind: GOD_ACTION.blessMage, params: [3] },
    ]);
  });

  it('renames the three accounting keys the two sides disagreed about', () => {
    const double = new ApiSessionDouble();
    const session = adaptAgentSession<ScenarioConfig>(double);
    session.reset(7, { worldTickCap: 8 });

    session.submit(GOD_ACTION.blessMage, 0); // tick 0, even, legal
    session.submit(GOD_ACTION.blessMage, 0); // tick 1, odd, rejected

    expect(session.accounting()).toEqual({
      submissions: 2,
      rejections: 1,
      byActionId: { [String(GOD_ACTION.blessMage)]: 1 },
    });
    // The session's own names are untouched: the adapter renames on the way
    // out, and does not ask agent-api to change what it calls its own fields.
    expect(double.accounting().submitted).toBe(2);
    expect(double.accounting().rejectedByAction).toEqual({ [GOD_ACTION.blessMage]: 1 });
  });

  it('preserves the raise on a terminated episode, which the loop depends on', () => {
    const double = new ApiSessionDouble();
    const session = adaptAgentSession<ScenarioConfig>(double);
    session.reset(1, { worldTickCap: 1 });
    session.submit(GOD_ACTION.noop);
    expect(session.status()).toBe(TERMINAL_STATUS.truncated);
    expect(() => {
      session.submit(GOD_ACTION.noop);
    }).toThrow(/cannot be advanced/);
  });

  it('does not raise on an illegal action, which the loop also depends on', () => {
    const double = new ApiSessionDouble();
    const session = adaptAgentSession<ScenarioConfig>(double);
    session.reset(1, { worldTickCap: 4 });
    session.submit(GOD_ACTION.noop); // tick 0 -> 1
    expect(() => {
      session.submit(GOD_ACTION.blessMage, 0); // tick 1 is odd: masked
    }).not.toThrow();
    expect(session.accounting().rejections).toBe(1);
  });
});

describe('the episode loop drives the adapted session', () => {
  it('stops mid-round when a submission terminates the session', () => {
    // The harness decision this preserves: `runEpisode` breaks out of the slot
    // loop the moment `status()` leaves `running`. Without it, slot 1 would
    // submit into a terminated session, `agent-api` would raise, and a
    // legitimate terminal run would be recorded as `failed`.
    const double = new ApiSessionDouble();
    const session = adaptAgentSession<ScenarioConfig>(double);
    const outcome = runEpisode({
      session,
      runSeed: 3,
      scenarioConfig: { worldTickCap: 3 },
      // Three slots against a three-tick cap: the third submission of round one
      // is the one that terminates, and the loop must not attempt a fourth.
      policies: [() => 0, () => 0, () => 0],
      worldTickCap: 100,
    });
    expect(outcome.status).toBe(TERMINAL_STATUS.truncated);
    expect(outcome.ticksRun).toBe(1);
    expect(double.received).toHaveLength(3);
  });

  it('enforces its own cap outside the session, on a session that never ends', () => {
    // The other harness decision. The double below reports `running` forever,
    // which is exactly the failure a cap administered by the session cannot
    // catch — its clock never reaches the session's own cap either.
    const stuck = new ApiSessionDouble();
    const session = adaptAgentSession<ScenarioConfig>({
      ...stuck,
      reset: (runSeed: number, config: ScenarioConfig) => stuck.reset(runSeed, config),
      observe: () => stuck.observe(),
      legalActions: () => stuck.legalActions(),
      candidates: () => stuck.candidates(),
      submit: (action: Action) => {
        stuck.received.push(action);
        return { admitted: true, observation: stuck.observe(), status: 'running' as const };
      },
      outcome: () => stuck.outcome(),
      status: () => 'running' as const,
      accounting: () => stuck.accounting(),
    });
    const outcome = runEpisode({
      session,
      runSeed: 3,
      scenarioConfig: { worldTickCap: 1_000_000 },
      policies: [() => 0],
      worldTickCap: 17,
    });
    expect(outcome.status).toBe(TERMINAL_STATUS.truncated);
    expect(outcome.ticksRun).toBe(17);
  });

  it('lets a policy name a slot index, which a bare action id could not', () => {
    const double = new ApiSessionDouble();
    const session = adaptAgentSession<ScenarioConfig>(double);
    runEpisode({
      session,
      runSeed: 3,
      scenarioConfig: { worldTickCap: 2 },
      policies: [() => ({ action: GOD_ACTION.blessMage, parameter: 5 })],
      worldTickCap: 100,
    });
    expect(double.received[0]).toEqual({ kind: GOD_ACTION.blessMage, params: [5] });
  });

  it('refuses a fractional parameter rather than letting it resolve to nothing', () => {
    const double = new ApiSessionDouble();
    const session = adaptAgentSession<ScenarioConfig>(double);
    expect(() =>
      runEpisode({
        session,
        runSeed: 3,
        scenarioConfig: { worldTickCap: 4 },
        policies: [() => ({ action: GOD_ACTION.blessMage, parameter: 1.5 })],
        worldTickCap: 4,
      }),
    ).toThrow(/which is not an integer/);
  });
});

describe('normalizeSubmission keeps the bare-number policy legal', () => {
  it('widens a number and passes a submission through', () => {
    expect(normalizeSubmission(4)).toEqual({ action: 4 });
    expect(normalizeSubmission({ action: 4, parameter: 2 })).toEqual({ action: 4, parameter: 2 });
  });
});
