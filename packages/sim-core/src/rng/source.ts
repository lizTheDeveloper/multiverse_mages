/*
 * Multiverse Mages — the RNG handle a simulation step is given.
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

import type { RngStream } from './pcg32.js';
import { assertRngUint32, deriveActorStream, deriveStream } from './streams.js';

/**
 * The `rng` argument of `step(state, actions, rng)`.
 *
 * Deliberately not a generator. It holds no draw position and no mutable state
 * of its own — it is a seed plus two derivations — so passing the same source
 * to two subsystems, or to the same subsystem twice, cannot couple them. Every
 * call returns a fresh cursor positioned at the start of the stream it names,
 * which is what makes a stream a pure function of its coordinates rather than
 * of the order the step happened to visit things in.
 *
 * The consequence worth stating plainly: a caller cannot get a draw out of this
 * object without naming a subsystem from `docs/design/contracts.md` §6, and it
 * cannot get a *sequence* without also naming the tick. There is no ambient
 * randomness to reach for, which is the point — `contracts.md` §0 requires
 * every draw to name a subsystem stream, and this type is where that
 * requirement stops being a convention and starts being the only available API.
 */
export interface RngSource {
  /** The universe's seed. Everything in the run is a function of it. */
  readonly rootSeed: number;

  /**
   * A subsystem's stream for one tick. Use this for draws that belong to the
   * tick as a whole rather than to a particular entity — the number of mages
   * born this month, which raid objective is generated.
   */
  stream(subsystemId: number, tick: number): RngStream;

  /**
   * One actor's stream within a subsystem, for one tick. Use this for any draw
   * attributable to a specific entity, which is most of them: a combatant's
   * to-hit roll, a mage's research outcome, a cohort's mortality.
   *
   * `actorKey` must be a stable identity — an entity handle — never an array
   * index or roster position. See {@link deriveActorStream}, which explains
   * what a positional key silently destroys.
   */
  actorStream(subsystemId: number, tick: number, actorKey: number): RngStream;
}

/**
 * Builds the {@link RngSource} for a universe from its root seed.
 *
 * Validation happens here, once, rather than being discovered on the first draw
 * of the first tick that happens to use a stream: a bad seed is a setup error,
 * and a setup error that surfaces mid-run looks like a simulation bug.
 *
 * @param rootSeed - The universe's seed. Unsigned 32-bit.
 * @throws RangeError naming `rootSeed` if it is outside that domain.
 */
export function rngFromRootSeed(rootSeed: number): RngSource {
  assertRngUint32(rootSeed, 'rootSeed');

  return {
    rootSeed,
    stream(subsystemId: number, tick: number): RngStream {
      return deriveStream(rootSeed, subsystemId, tick);
    },
    actorStream(subsystemId: number, tick: number, actorKey: number): RngStream {
      return deriveActorStream(rootSeed, subsystemId, tick, actorKey);
    },
  };
}
