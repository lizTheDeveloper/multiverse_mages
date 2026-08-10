/*
 * Multiverse Mages — simulation core public surface.
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
 * `@mm/sim-core` — the pure, dependency-free, deterministic substrate every
 * consumer of the simulation shares: the Monte Carlo balance harness, the
 * Electron client, the PvP server, and the later RL bridge.
 *
 * The whole of `sim-core-foundation`: fixed-point arithmetic, the splittable
 * PRNG, the entity store, the dual-scale clock, the pure `step` contract,
 * versioned snapshots, and recording and replay.
 *
 * The one thing deliberately *not* exported is the benchmark runner. It reads
 * a wall clock, which is precisely what this package forbids; it lives outside
 * `src` and is reached through `npm run bench`.
 */

export * from './handle.js';
export * from './component.js';
export * from './entity-store.js';

export type { Clock, ReadonlyClock, TimeMode } from './clock.js';
export {
  ENGAGEMENT_TICK_MS,
  ERA_TICKS,
  TIME_MODE,
  WORLD_TICKS_PER_YEAR,
  advanceClock,
  cloneClock,
  createClock,
  currentTick,
  enterEngagement,
  eraOf,
  leaveEngagement,
} from './clock.js';

export type {
  Action,
  CreateStateOptions,
  StepContext,
  System,
  WorldSchema,
  WorldSchemaInput,
} from './state.js';
export { SimState, createState, defineWorld } from './state.js';

export { CORE_ACTION, step } from './step.js';

export type { ActionLogJSON, Recording, RecorderOptions } from './replay/recorder.js';
export { ActionLog, Recorder } from './replay/recorder.js';

export type { DivergenceResult, ReplayOptions } from './replay/replayer.js';
export { replay, replayAndLocate } from './replay/replayer.js';

export { hashBytes } from './snapshot/hash.js';

export type { Migration } from './snapshot/migrations.js';
export { MigrationRegistry } from './snapshot/migrations.js';

export type {
  DeserializeOptions,
  SnapshotComponent,
  SnapshotEnvelope,
} from './snapshot/snapshot.js';
export {
  SNAPSHOT_VERSION,
  decodeSnapshot,
  deserializeState,
  encodeSnapshot,
  envelopeToState,
  serializeState,
  snapshotHash,
  stateToEnvelope,
} from './snapshot/snapshot.js';

export { floorDiv } from './fixed-point/divide.js';

export type { Fixed } from './fixed-point/fixed-point.js';
export {
  FP_INT_MAX,
  FP_INT_MIN,
  FP_MAX,
  FP_MIN,
  FP_ONE,
  FP_SHIFT,
  div,
  fromInt,
  lerp,
  mul,
  toInt,
} from './fixed-point/fixed-point.js';

export type { RngStream } from './rng/pcg32.js';
export {
  cloneStream,
  nextBounded,
  nextUint32,
  rejectionThreshold,
  streamFromWords,
} from './rng/pcg32.js';

export type { RngSubsystemId } from './rng/streams.js';
export { RNG_STREAM, deriveActorStream, deriveStream } from './rng/streams.js';

export type { RngSource } from './rng/source.js';
export { rngFromRootSeed } from './rng/source.js';
