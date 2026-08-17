/*
 * Multiverse Mages — what the bridge's tests drive: one real universe, one fake session.
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
 * Two fixtures, and the split between them is deliberate.
 *
 * **A real universe** — {@link probeScenario} — built with `@mm/sim-core` alone:
 * a world with one component, one system that draws from a registered stream and
 * writes what it drew, and nothing else. It is enough to make an observation
 * change from tick to tick, a snapshot hash depend on the seed, and a replay
 * mean something. It is deliberately *not* the reference universe: building that
 * needs `@mm/content` and `@mm/coordination`, `contracts.md` §5 puts both out of
 * this package's reach, and `@mm/scenario` — which may reach them — is a leaf
 * nothing here may import.
 *
 * **A fake session** — {@link fixedSession} — for the frames whose subject is
 * the *transport* rather than the simulation. Whether an ascension sets
 * `terminal` is `agent-api`'s claim and is tested in `agent-api`'s suite; what
 * this package must show is that two independent booleans cross the wire as two
 * independent booleans. A fake with a settable status shows that in three lines,
 * where reaching a real ascension would need `god-agency`'s whole worship loop.
 */

import type {
  AgentSession,
  CandidateLists,
  EpisodeAccounting,
  EpisodeStatus,
  OutcomeRecord,
  PlayerState,
  Scenario,
  SessionOptions,
  SubmitResult,
} from '@mm/agent-api';
import {
  ACTION_SPACE_SIZE,
  EMPTY_CATALOGUE,
  OBSERVATION_LAYOUT_DIGEST,
  OBSERVATION_SCHEMA_VERSION,
  OBSERVATION_SIZE,
  project,
} from '@mm/agent-api';
import type { SimState, System } from '@mm/sim-core';
import { RNG_STREAM, TIME_MODE, createState, nextUint32 } from '@mm/sim-core';
import {
  MATERIAL_STOCK,
  OCCUPATION,
  POPULACE_COHORT,
  UNIVERSE,
  attachRecord,
  componentOf,
  createUniverse,
  defineWorldStateSchema,
  findUniverse,
} from '@mm/state';

/** Fixed point at scale 1/1024, as §0 pins it. Written out rather than imported. */
const FP = 1024;

/**
 * One system, drawing from one registered stream every world tick and writing
 * what it drew somewhere the snapshot hash can see.
 *
 * Registered rather than invented: §6 makes stream ids permanent, and a fixture
 * that drew from an unregistered id would be modelling something the simulation
 * cannot do. `worship` is the field written because it is already in §1.1's
 * universe record — a fixture component of its own would be a second world
 * schema for the observation to disagree with.
 */
function driftSystem(): System {
  return {
    name: 'drift',
    run(ctx) {
      if (ctx.mode !== TIME_MODE.world) return;
      const stream = ctx.rng.stream(RNG_STREAM.populace);
      const roll = nextUint32(stream);
      const universe = findUniverse(ctx.state);
      if (universe === 0) return;
      componentOf(ctx.state, UNIVERSE).set(universe, 'worship', roll % (16 * FP));
    },
  };
}

/** The scenario id every fixture universe reports. */
export const PROBE_SCENARIO_ID = 'gym-bridge-probe';

/**
 * A universe with one cohort and one drifting number.
 *
 * Deliberately *not* the reference universe. Building that needs `@mm/content`
 * and `@mm/coordination`, `contracts.md` §5 puts both out of this package's
 * reach, and `@mm/scenario` — which may reach them — is a leaf nothing here may
 * import. What this fixture has to be is *observable and seed-dependent*, so
 * that a replay comparing snapshot hashes is comparing something that moves.
 *
 * Every technique and form is forbidden, so `forbidTechnique` and `forbidForm`
 * are structurally illegal and the illegal-action tests have a genuinely
 * rejected submission to make.
 */
export function probeScenario(scenarioId = PROBE_SCENARIO_ID): Scenario {
  const schema = defineWorldStateSchema([driftSystem()]);
  return {
    scenarioId,
    catalogue: EMPTY_CATALOGUE,
    create(runSeed: number): SimState {
      const state = createState({ rootSeed: runSeed, schema });
      const universe = createUniverse(state, {
        permittedTechniques: 0,
        permittedForms: 0,
        edictBudget: 4,
        traditionId: 1,
        favor: 20 * FP,
        worship: 0,
        worshipTier: 1,
        prestige: 0,
        prestigeEarned: 0,
        terminalReason: 0,
        favorCap: 100 * FP,
        ascended: 0,
      });
      attachRecord(state, MATERIAL_STOCK, universe, {
        food: 100 * FP,
        stone: 0,
        vellum: 0,
        labor: 0,
        essence: 0,
        insight: 0,
        passage: 0,
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

/**
 * One projection of the probe world, built once and shared.
 *
 * `fixedSession` satisfies `AgentSession` structurally, so it owes a
 * `playerState()` — the client-facing projection `material-economy` added
 * beside `observe()`. Nothing in this package asserts on its contents; what the
 * fixture owes is a *real* `PlayerState` rather than a cast, because a cast
 * would go on satisfying the type after the interface grew a field that a real
 * projection would have refused to build.
 *
 * Built from `probeScenario`'s own world at seed zero, which is the only world
 * this package is allowed to construct — `@mm/scenario` is a leaf nothing here
 * may import.
 */
let probeProjection: PlayerState | undefined;
function fixedPlayerState(): PlayerState {
  probeProjection ??= project({
    state: probeScenario().create(0, { worldTickCap: 1 }),
    catalogue: EMPTY_CATALOGUE,
  });
  return probeProjection;
}

/** What a {@link fixedSession} should report. */
export interface FixedSessionOptions {
  /** Reported once {@link FixedSessionOptions.after} submissions have landed. */
  readonly status?: EpisodeStatus;
  /**
   * How many submissions the episode runs for before {@link status} applies.
   *
   * Defaults to `1`. A session that reported a terminal status from tick zero
   * could never be stepped at all — the bridge refuses `step` on a finished
   * episode, correctly — so the fixture has to run for at least one tick to be
   * able to report anything.
   */
  readonly after?: number;
  readonly terminal?: boolean;
  readonly truncated?: boolean;
  readonly terminalReason?: number;
  readonly admitted?: boolean;
  readonly rejection?: string;
  readonly observationFill?: number;
}

/**
 * A session that reports exactly what a test asked it to.
 *
 * Satisfies `AgentSession` structurally rather than by inheritance, which is the
 * only option — `createSession` is the constructor and the interface is the
 * contract. Everything it returns is fixed, because every test that uses it is
 * asking a question about a frame rather than about a world.
 */
export function fixedSession(options: FixedSessionOptions = {}): AgentSession {
  const eventual: EpisodeStatus = options.status ?? 'running';
  const after = options.after ?? 1;
  const observation = new Float64Array(OBSERVATION_SIZE).fill(options.observationFill ?? 0);
  const mask = new Uint8Array(ACTION_SPACE_SIZE).fill(1);
  let submitted = 0;

  const status = (): EpisodeStatus => (submitted >= after ? eventual : 'running');
  const settled = (): boolean => submitted >= after;

  const outcome = (): OutcomeRecord =>
    Object.freeze({
      terminal: settled() && (options.terminal ?? (eventual === 'ascended' || eventual === 'stagnated')),
      truncated: settled() && (options.truncated ?? eventual === 'truncated'),
      terminalReason: settled() ? (options.terminalReason ?? 0) : 0,
      era: 0,
      metricDeltas: Object.freeze({}),
    });

  return {
    observationSchemaVersion: OBSERVATION_SCHEMA_VERSION,
    observationLayoutDigest: OBSERVATION_LAYOUT_DIGEST,
    actionSpaceSize: ACTION_SPACE_SIZE,
    scenarioId: 'fixed',
    reset: () => observation,
    observe: () => observation,
    legalActions: () => mask,
    candidates: (): CandidateLists => new Map(),
    submit: (): SubmitResult => {
      submitted += 1;
      return {
        admitted: options.admitted ?? true,
        ...(options.rejection === undefined ? {} : { rejection: options.rejection as never }),
        observation,
        status: status(),
      };
    },
    status,
    outcome,
    accounting: (): EpisodeAccounting =>
      Object.freeze({ submitted, rejected: 0, rejectedByAction: {}, enabled: true }),
    illegalActionCount: () => 0,
    rng: () => {
      throw new Error('The fixture session has no agent-side generator.');
    },
    snapshotHash: () => 'fixed-hash',
    playerState: (): PlayerState => fixedPlayerState(),
  };
}

/** A session factory the vector accepts, ignoring the options it is handed. */
export function fixedSessionFactory(
  options: FixedSessionOptions = {},
): (sessionOptions: SessionOptions) => AgentSession {
  return () => fixedSession(options);
}

/** The build version every fixture bridge publishes. */
export const FIXTURE_BUILD_VERSION = '0.0.0-test';
