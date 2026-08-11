/*
 * Multiverse Mages — the episode session: one interface for bots, Monte Carlo, and RL.
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
 * `agent-interface` task group 2, and the `agent-api` spec requirements
 * *"Episode session interface"*, *"Illegal action accounting"*, and the
 * behavioural half of *"Agent-side randomness is outside the RNG stream
 * registry"*.
 *
 * ## The probe scenario draws, and says how much
 *
 * Task 2.8 asks that *"per-stream simulation draw counts are unchanged between a
 * passive agent and a random-legal agent submitting only no-ops"*, and a
 * scenario whose systems never draw satisfies that vacuously — zero equals zero
 * whatever the agent does. So the scenario below installs a system that draws a
 * fixed number of times from two registered streams and records each draw. The
 * counts are then a real measurement rather than an absence.
 */

import type { Action, SimState, System } from '@mm/sim-core';
import {
  RNG_STREAM,
  TIME_MODE,
  createState,
  nextUint32,
} from '@mm/sim-core';
import {
  OCCUPATION,
  POPULACE_COHORT,
  TERMINAL_REASON,
  UNIVERSE,
  attachRecord,
  componentOf,
  createUniverse,
  defineWorldStateSchema,
  findUniverse,
} from '@mm/state';
import type { Scenario, ScenarioConfig } from '@mm/agent-api';
import {
  ACTION_SPACE_SIZE,
  GOD_ACTION,
  OBSERVATION_LAYOUT_DIGEST,
  OBSERVATION_SCHEMA_VERSION,
  OBSERVATION_SIZE,
  createSession,
} from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

import { FIXTURE_CATALOGUE, FIXTURE_CONTENT_REVISION, FP } from './fixtures.js';

/** Draws per subsystem id, in the order the streams were drawn from. */
type DrawLog = Map<number, number>;

/**
 * A system that draws a fixed amount from two registered streams every world
 * tick, and counts what it drew.
 */
function probeSystem(log: DrawLog): System {
  return {
    name: 'draw-probe',
    run(ctx) {
      if (ctx.mode !== TIME_MODE.world) return;
      const note = (subsystem: number): void => {
        log.set(subsystem, (log.get(subsystem) ?? 0) + 1);
      };

      const populace = ctx.rng.stream(RNG_STREAM.populace);
      for (let draw = 0; draw < 3; draw += 1) {
        nextUint32(populace);
        note(RNG_STREAM.populace);
      }

      const universe = findUniverse(ctx.state);
      if (universe !== 0) {
        const mortality = ctx.rng.actorStream(RNG_STREAM.mortality, universe);
        const roll = nextUint32(mortality);
        note(RNG_STREAM.mortality);
        // Something seed-dependent moves, so a snapshot-hash comparison between
        // two runs is a real comparison rather than a comparison of two
        // identical initial states.
        componentOf(ctx.state, UNIVERSE).set(universe, 'worship', roll % (16 * FP));
      }
    },
  };
}

/**
 * A universe with a cohort, so the observation has something in it.
 *
 * **Every technique and form is forbidden**, which makes `forbidTechnique` and
 * `forbidForm` structurally illegal — there is no bit left to clear. That is
 * what gives the accounting tests a genuinely illegal submission to make; a
 * scenario in which everything is legal would have them asserting that a legal
 * action was accepted.
 */
function probeScenario(log: DrawLog, terminalReason = 0): Scenario {
  return {
    scenarioId: 'probe',
    catalogue: FIXTURE_CATALOGUE,
    create(runSeed: number): SimState {
      const state = createState({
        rootSeed: runSeed,
        schema: defineWorldStateSchema([probeSystem(log)]),
        contentRevision: FIXTURE_CONTENT_REVISION,
      });
      createUniverse(state, {
        permittedTechniques: 0,
        permittedForms: 0,
        edictBudget: 4,
        traditionId: 1,
        favor: 20 * FP,
        worship: 0,
        worshipTier: 1,
        materials: 100 * FP,
        prestige: 0,
        prestigeEarned: 0,
        terminalReason,
        favorCap: 100 * FP,
        ascended: 0,
      });
      const cohort = state.entities.create();
      attachRecord(state, POPULACE_COHORT, cohort, {
        speciesId: 1,
        occupation: OCCUPATION.laborer,
        count: 5_000,
        birthTickBucket: -60,
      });
      return state;
    },
  };
}

const CONFIG: ScenarioConfig = { worldTickCap: 8 };
const NOOP: Action = { kind: GOD_ACTION.noop, params: [] };

describe('task 2.1 — reset, observe, legalActions, submit, status', () => {
  it('returns the initial observation from reset, at the pinned width', () => {
    const session = createSession({ scenario: probeScenario(new Map()) });
    const initial = session.reset(0x1234_0001, CONFIG);
    expect(initial).toBeInstanceOf(Float64Array);
    expect(initial).toHaveLength(OBSERVATION_SIZE);
    for (const value of initial) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('returns a mask the width of the action space §4.2 enumerates', () => {
    const session = createSession({ scenario: probeScenario(new Map()) });
    session.reset(0x1234_0001, CONFIG);
    const mask = session.legalActions();
    expect(mask).toBeInstanceOf(Uint8Array);
    expect(mask).toHaveLength(ACTION_SPACE_SIZE);
    expect(mask[GOD_ACTION.noop]).toBe(1);
  });

  it('advances one world tick per submission', () => {
    const log: DrawLog = new Map();
    const session = createSession({ scenario: probeScenario(log) });
    session.reset(0x1234_0001, CONFIG);
    expect(log.get(RNG_STREAM.populace)).toBeUndefined();
    session.submit(NOOP);
    expect(log.get(RNG_STREAM.populace)).toBe(3);
    session.submit(NOOP);
    expect(log.get(RNG_STREAM.populace)).toBe(6);
  });

  it('observe() reports the state the last submission produced', () => {
    const session = createSession({ scenario: probeScenario(new Map()) });
    const initial = session.reset(0x1234_0001, CONFIG);
    session.submit(NOOP);
    session.submit(NOOP);
    expect([...session.observe()]).not.toEqual([...initial]);
    expect([...session.observe()]).toEqual([...session.observe()]);
  });

  it('publishes the schema version and the layout digest a caller records', () => {
    const session = createSession({ scenario: probeScenario(new Map()) });
    expect(session.observationSchemaVersion).toBe(OBSERVATION_SCHEMA_VERSION);
    expect(session.observationLayoutDigest).toBe(OBSERVATION_LAYOUT_DIGEST);
    // Available before reset: a harness records provenance when it builds the
    // sweep, not once per episode.
    expect(session.observationLayoutDigest).toMatch(/^[0-9a-f]{16}$/);
  });

  it('refuses every episode operation before reset, rather than inventing a state', () => {
    const session = createSession({ scenario: probeScenario(new Map()) });
    expect(() => session.observe()).toThrow(/reset/);
    expect(() => session.legalActions()).toThrow(/reset/);
    expect(() => session.status()).toThrow(/reset/);
    expect(() => session.submit(NOOP)).toThrow(/reset/);
  });
});

describe('task 2.2 — terminal status, and what submit does after one', () => {
  it('reports running until the world-tick cap, then truncated', () => {
    const session = createSession({ scenario: probeScenario(new Map()) });
    session.reset(0x1234_0001, { worldTickCap: 3 });
    expect(session.status()).toBe('running');
    session.submit(NOOP);
    expect(session.status()).toBe('running');
    session.submit(NOOP);
    expect(session.status()).toBe('running');
    session.submit(NOOP);
    expect(session.status()).toBe('truncated');
  });

  it('raises on a submission to a terminated session rather than advancing it', () => {
    const log: DrawLog = new Map();
    const session = createSession({ scenario: probeScenario(log) });
    session.reset(0x1234_0001, { worldTickCap: 1 });
    session.submit(NOOP);
    expect(session.status()).toBe('truncated');

    const drawsBefore = log.get(RNG_STREAM.populace);
    expect(() => session.submit(NOOP)).toThrow(/truncated/);
    // The refusal is the whole point: a silently-advancing terminated episode
    // puts ticks past the cap into a record that says the cap was honoured.
    expect(log.get(RNG_STREAM.populace)).toBe(drawsBefore);
  });

  it('reports ascended and stagnated from the terminal reason §1.1 records', () => {
    for (const [reason, expected] of [
      [TERMINAL_REASON.ascensionApotheosis, 'ascended'],
      [TERMINAL_REASON.ascensionCanon, 'ascended'],
      [TERMINAL_REASON.stagnation, 'stagnated'],
      [TERMINAL_REASON.truncated, 'truncated'],
      [TERMINAL_REASON.none, 'running'],
    ] as const) {
      const session = createSession({ scenario: probeScenario(new Map(), reason) });
      session.reset(0x1234_0001, CONFIG);
      expect(session.status(), `terminal reason ${String(reason)}`).toBe(expected);
    }
  });

  it('refuses to advance an ascended episode, not only a truncated one', () => {
    const session = createSession({
      scenario: probeScenario(new Map(), TERMINAL_REASON.ascensionApotheosis),
    });
    session.reset(0x1234_0001, CONFIG);
    expect(() => session.submit(NOOP)).toThrow(/ascended/);
  });

  it('reset revives a terminated session', () => {
    const session = createSession({ scenario: probeScenario(new Map()) });
    session.reset(0x1234_0001, { worldTickCap: 1 });
    session.submit(NOOP);
    expect(session.status()).toBe('truncated');
    session.reset(0x1234_0001, { worldTickCap: 4 });
    expect(session.status()).toBe('running');
    expect(session.accounting().submitted).toBe(0);
  });
});

describe('task 2.3 — illegal action accounting', () => {
  it('counts four rejections and attributes them to the two action ids', () => {
    // The spec scenario, literally: three illegal forbid-technique actions and
    // one illegal open-portal action.
    const session = createSession({ scenario: probeScenario(new Map()) });
    session.reset(0x1234_0001, { worldTickCap: 32 });

    // `openPortal` has no candidates in this scenario, so it is masked; the
    // forbid-technique submissions carry no legal slot and are turned away by
    // the same gate. Both are ordinary illegal actions, which is the point.
    const mask = session.legalActions();
    expect(mask[GOD_ACTION.openPortal]).toBe(0);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = session.submit({ kind: GOD_ACTION.forbidTechnique, params: [99] });
      expect(result.admitted).toBe(false);
    }
    session.submit({ kind: GOD_ACTION.openPortal, params: [0] });

    const accounting = session.accounting();
    expect(accounting.submitted).toBe(4);
    expect(accounting.rejected).toBe(4);
    expect(accounting.rejectedByAction[GOD_ACTION.forbidTechnique]).toBe(3);
    expect(accounting.rejectedByAction[GOD_ACTION.openPortal]).toBe(1);
  });

  it('survives to episode end and is enough to compute illegalActionRate', () => {
    const session = createSession({ scenario: probeScenario(new Map()) });
    session.reset(0x1234_0001, { worldTickCap: 4 });
    session.submit(NOOP);
    session.submit({ kind: GOD_ACTION.openPortal, params: [0] });
    session.submit(NOOP);
    session.submit(NOOP);
    expect(session.status()).toBe('truncated');

    const accounting = session.accounting();
    expect(accounting.submitted).toBe(4);
    expect(accounting.rejected).toBe(1);
    // §7's illegalActionRate is rejections over submissions, and both are here.
    expect(accounting.rejected / accounting.submitted).toBe(0.25);
  });

  it('counts a submission that is not in §4.2 at all', () => {
    const session = createSession({ scenario: probeScenario(new Map()) });
    session.reset(0x1234_0001, { worldTickCap: 4 });
    const result = session.submit({ kind: 4242, params: [] });
    expect(result.admitted).toBe(false);
    expect(result.rejection).toBe('unknown-action');
    expect(session.accounting().rejectedByAction[4242]).toBe(1);
  });
});

describe('task 2.6 — reset is reproducible', () => {
  it('gives two sessions at the same seed and config identical initial observations', () => {
    const a = createSession({ scenario: probeScenario(new Map()) });
    const b = createSession({ scenario: probeScenario(new Map()) });
    expect([...a.reset(0x9999_0001, CONFIG)]).toEqual([...b.reset(0x9999_0001, CONFIG)]);
  });

  it('diverges on a different seed, so the equality above is not trivial', () => {
    const a = createSession({ scenario: probeScenario(new Map()) });
    const b = createSession({ scenario: probeScenario(new Map()) });
    a.reset(0x9999_0001, CONFIG);
    b.reset(0x9999_0002, CONFIG);
    for (let tick = 0; tick < 4; tick += 1) {
      a.submit(NOOP);
      b.submit(NOOP);
    }
    // Same scenario, different seed: the states are the same shape and the
    // hashes differ because the root seed is part of the snapshot.
    expect(a.snapshotHash()).not.toBe(b.snapshotHash());
  });

  it('replays the same episode to the same final snapshot hash', () => {
    const run = (): string => {
      const session = createSession({ scenario: probeScenario(new Map()) });
      session.reset(0x9999_0001, { worldTickCap: 6 });
      while (session.status() === 'running') session.submit(NOOP);
      return session.snapshotHash();
    };
    expect(run()).toBe(run());
  });
});

describe('task 2.7 — accounting does not perturb the simulation', () => {
  it('produces identical final snapshot hashes with accounting on and off', () => {
    const actions: Action[] = [
      NOOP,
      { kind: GOD_ACTION.openPortal, params: [0] },
      { kind: GOD_ACTION.forbidTechnique, params: [3] },
      NOOP,
      { kind: 4242, params: [] },
      NOOP,
    ];

    const run = (countIllegalActions: boolean): { hash: string; draws: DrawLog } => {
      const draws: DrawLog = new Map();
      const session = createSession({
        scenario: probeScenario(draws),
        countIllegalActions,
      });
      session.reset(0x7777_0001, { worldTickCap: actions.length });
      for (const action of actions) session.submit(action);
      return { hash: session.snapshotHash(), draws };
    };

    const on = run(true);
    const off = run(false);
    expect(on.hash).toBe(off.hash);
    expect([...on.draws.entries()].sort()).toEqual([...off.draws.entries()].sort());
  });

  it('still counts illegal actions in state, because §4.2 requires the core to', () => {
    // The toggle covers the *session's* per-action-id breakdown, which lives
    // outside state. `illegalActionCount` is state, is in the snapshot, and is
    // what `illegalActionRate` is computed from — so switching it off would be
    // switching off a contract, not an option.
    const session = createSession({
      scenario: probeScenario(new Map()),
      countIllegalActions: false,
    });
    session.reset(0x7777_0001, { worldTickCap: 4 });
    session.submit({ kind: GOD_ACTION.openPortal, params: [0] });
    expect(session.accounting().enabled).toBe(false);
    expect(session.accounting().rejectedByAction).toEqual({});
    expect(session.illegalActionCount()).toBe(1);
  });
});

describe('task 2.8 — an agent drawing randomness does not perturb the simulation', () => {
  it('leaves per-stream draw counts and the final hash identical', () => {
    const ticks = 6;

    const passiveDraws: DrawLog = new Map();
    const passive = createSession({
      scenario: probeScenario(passiveDraws),
      strategyId: 'passive',
      agentSlotIndex: 0,
    });
    passive.reset(0x4242_0001, { worldTickCap: ticks });
    for (let tick = 0; tick < ticks; tick += 1) passive.submit(NOOP);

    const noisyDraws: DrawLog = new Map();
    const noisy = createSession({
      scenario: probeScenario(noisyDraws),
      strategyId: 'uniform-random-legal',
      agentSlotIndex: 0,
    });
    noisy.reset(0x4242_0001, { worldTickCap: ticks });
    for (let tick = 0; tick < ticks; tick += 1) {
      // A random-legal agent: it samples the mask, draws to break ties, and —
      // as the scenario specifies — every action it settles on is a no-op.
      const mask = noisy.legalActions();
      for (let attempt = 0; attempt < 32; attempt += 1) {
        noisy.rng().nextBelow(mask.length);
      }
      noisy.rng().fork('exploration').nextUint32();
      noisy.submit(NOOP);
    }

    expect([...noisyDraws.entries()].sort()).toEqual([...passiveDraws.entries()].sort());
    expect(passiveDraws.get(RNG_STREAM.populace)).toBe(ticks * 3);
    expect(noisy.snapshotHash()).toBe(passive.snapshotHash());
  });

  it('gives the same strategy at the same seed and slot an identical draw sequence', () => {
    const draw = (): number[] => {
      const session = createSession({
        scenario: probeScenario(new Map()),
        strategyId: 'narrow-depth',
        agentSlotIndex: 2,
      });
      session.reset(0x4242_0002, CONFIG);
      return Array.from({ length: 32 }, () => session.rng().nextUint32());
    };
    expect(draw()).toEqual(draw());
    // Not vacuous: the generator has to advance between calls, or a sequence of
    // thirty-two identical numbers would satisfy the equality above.
    expect(new Set(draw()).size).toBeGreaterThan(28);
  });

  it('gives two slots in one run different draws, so mirrored arms are not twins', () => {
    const draw = (agentSlotIndex: number): number[] => {
      const session = createSession({
        scenario: probeScenario(new Map()),
        strategyId: 'narrow-depth',
        agentSlotIndex,
      });
      session.reset(0x4242_0002, CONFIG);
      return Array.from({ length: 32 }, () => session.rng().nextUint32());
    };
    expect(draw(0)).not.toEqual(draw(1));
  });
});

describe('task 2.5 — the session exposes no reward', () => {
  it('carries no member named for a reward, a return, a score, or a fitness', () => {
    const session = createSession({ scenario: probeScenario(new Map()) });
    session.reset(0x1234_0001, CONFIG);

    const names = new Set<string>();
    for (
      let object: object | null = session;
      object !== null && object !== Object.prototype;
      object = Object.getPrototypeOf(object) as object | null
    ) {
      for (const name of Object.getOwnPropertyNames(object)) names.add(name);
    }
    for (const name of names) {
      expect(name, `session member ${name}`).not.toMatch(/reward|score|fitness|utility/i);
      expect(name, `session member ${name}`).not.toMatch(/^returns?$/i);
    }
  });

  it('emits no number a caller could mistake for one, from the outcome record', () => {
    // §4.3 puts the outcome record in the interface and reward outside it. The
    // record is facts — terminal, truncated, reason, era — and this asserts the
    // set, so a reward added later fails here rather than being adopted by every
    // consumer that reads the record generically.
    const session = createSession({ scenario: probeScenario(new Map()) });
    session.reset(0x1234_0001, CONFIG);
    expect(Object.keys(session.outcome()).sort()).toEqual([
      'era',
      'metricDeltas',
      'terminal',
      'terminalReason',
      'truncated',
    ]);
  });
});
