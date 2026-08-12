/*
 * Multiverse Mages — what the server's tests drive: one real universe, one
 * in-memory transport.
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
 * Two fixtures, and the split between them is the same one `gym-bridge`'s tests
 * draw.
 *
 * **A real universe** — {@link probeScenario} — built with `@mm/sim-core` and
 * `@mm/state` alone. It is deliberately *not* the reference universe: building
 * that needs `@mm/content` and `@mm/coordination`, §5 puts both out of this
 * package's reach, and `@mm/scenario` — which may reach them — is a leaf nothing
 * here may import. The end-to-end test runs against the reference universe by
 * spawning processes, which is the only way this package is allowed to see it.
 *
 * The one thing this fixture must do that `gym-bridge`'s need not: **make the
 * hash depend on the action submitted.** A match's whole claim is that each
 * slot's action reached that slot's universe, and a world whose state ignored
 * its actions would produce identical hashes whether the server routed them
 * correctly or shuffled them.
 *
 * **An in-memory transport** — {@link recordingConnection} — for everything
 * whose subject is the protocol rather than the socket. `MatchHost` never
 * imports `node:net`, so the fast tests exercise exactly the code the slow test
 * runs, rather than a parallel implementation of it.
 */

import type { AgentSession, Scenario } from '@mm/agent-api';
import {
  ACTION_SPACE_SIZE,
  EMPTY_CATALOGUE,
  OBSERVATION_LAYOUT_DIGEST,
  OBSERVATION_SCHEMA_VERSION,
  OBSERVATION_SIZE,
  createSession,
} from '@mm/agent-api';
import type { SimState, System } from '@mm/sim-core';
import { TIME_MODE, createState } from '@mm/sim-core';
import {
  OCCUPATION,
  POPULACE_COHORT,
  UNIVERSE,
  attachRecord,
  componentOf,
  createUniverse,
  defineWorldStateSchema,
  findUniverse,
} from '@mm/state';

import type { Connection, ServerFrame } from '../../src/index.js';
import { PROTOCOL_VERSION, type MatchContract } from '../../src/index.js';

/** Fixed point at scale 1/1024, as §0 pins it. Written out rather than imported. */
const FP = 1024;

/** The content revision every fixture declares. 32 lowercase hex, as §0 requires. */
export const PROBE_CONTENT_REVISION = '00112233445566778899aabbccddeeff';

/** The scenario id every fixture universe reports. */
export const PROBE_SCENARIO_ID = 'server-probe';

/**
 * One system that folds the tick's submitted actions into world state.
 *
 * `worship` is the field written because it is already in §1.1's universe
 * record — a fixture component of its own would be a second world schema for
 * the observation to disagree with. The value mixes the previous one with each
 * action's id, so two universes given different actions diverge and stay
 * diverged, which is exactly the property a routing test needs.
 */
function actionEchoSystem(): System {
  return {
    name: 'action-echo',
    run(ctx) {
      if (ctx.mode !== TIME_MODE.world) return;
      const universe = findUniverse(ctx.state);
      if (universe === 0) return;
      const store = componentOf(ctx.state, UNIVERSE);
      let value = store.get(universe, 'worship');
      for (const action of ctx.actions) {
        // Integer arithmetic only: §0 bans floats in the rules path, and a
        // fixture that broke that rule would be a fixture the purity lint is
        // entitled to fail.
        value = (value * 31 + action.kind * 7 + 1) % (16 * FP);
      }
      store.set(universe, 'worship', value);
    },
  };
}

/**
 * A universe with one cohort and one number that remembers what was submitted.
 *
 * Every technique and form is forbidden, so several actions are structurally
 * illegal and the mask has something to refuse.
 */
export function probeScenario(scenarioId = PROBE_SCENARIO_ID): Scenario {
  const schema = defineWorldStateSchema([actionEchoSystem()]);
  return {
    scenarioId,
    catalogue: EMPTY_CATALOGUE,
    create(runSeed: number): SimState {
      const state = createState({ rootSeed: runSeed, schema });
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
        terminalReason: 0,
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

/** A session over the probe universe, as the host would build one. */
export function probeSession(slot: number): AgentSession {
  return createSession({ scenario: probeScenario(), agentSlotIndex: slot });
}

/** The contract the fixture server publishes. */
export function probeContract(overrides: Partial<MatchContract> = {}): MatchContract {
  return {
    protocolVersion: PROTOCOL_VERSION,
    observationSchemaVersion: OBSERVATION_SCHEMA_VERSION,
    observationLayoutDigest: OBSERVATION_LAYOUT_DIGEST,
    observationSize: OBSERVATION_SIZE,
    actionSpaceSize: ACTION_SPACE_SIZE,
    contentRevision: PROBE_CONTENT_REVISION,
    scenarioId: PROBE_SCENARIO_ID,
    buildVersion: 'test',
    ...overrides,
  };
}

/**
 * The legal non-no-op action ids in a freshly reset probe universe.
 *
 * Read off the mask rather than written down, because which actions are legal
 * is a fact about `agent-api` and the fixture's ruleset, and a test that
 * transcribed it would start failing for reasons unrelated to the server the
 * day either changed.
 */
export function legalKinds(session: AgentSession): number[] {
  const mask = session.legalActions();
  const out: number[] = [];
  for (let id = 1; id < mask.length; id += 1) if (mask[id] === 1) out.push(id);
  return out;
}

/** A connection that keeps every frame it was sent. */
export interface RecordingConnection extends Connection {
  readonly sent: ServerFrame[];
  readonly closed: () => boolean;
  /** Every frame of one type, narrowed for the caller. */
  ofType<T extends ServerFrame['type']>(type: T): Extract<ServerFrame, { type: T }>[];
}

/** Builds one. */
export function recordingConnection(id: string): RecordingConnection {
  const sent: ServerFrame[] = [];
  let isClosed = false;
  return {
    id,
    sent,
    send: (frame: ServerFrame): void => {
      sent.push(frame);
    },
    close: (): void => {
      isClosed = true;
    },
    closed: (): boolean => isClosed,
    ofType: <T extends ServerFrame['type']>(type: T): Extract<ServerFrame, { type: T }>[] =>
      sent.filter((f): f is Extract<ServerFrame, { type: T }> => f.type === type),
  };
}
