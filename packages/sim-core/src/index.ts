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
 * Landed so far (`sim-core-foundation` task groups 2, 3 and 4): fixed-point
 * arithmetic, the splittable PRNG, and the entity store. The dual-scale clock,
 * snapshots, and replay land in groups 5 through 8 and are exported from here.
 */

export * from './handle.js';
export * from './component.js';
export * from './entity-store.js';

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
export { RNG_STREAM, deriveStream } from './rng/streams.js';
