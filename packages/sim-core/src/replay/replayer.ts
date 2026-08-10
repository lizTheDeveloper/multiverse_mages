/*
 * Multiverse Mages — replaying a recorded run, and locating where it diverged.
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

import { rngFromRootSeed } from '../rng/source.js';
import { deserializeState, snapshotHash } from '../snapshot/snapshot.js';
import type { SimState, WorldSchema } from '../state.js';
import { step } from '../step.js';
import type { Recording } from './recorder.js';

export interface ReplayOptions {
  /**
   * Called after each step. Intended for progress reporting and for tests that
   * need to prove replay speed is irrelevant; it must not touch the state it
   * is handed.
   */
  readonly onTick?: (tick: number, state: SimState) => void;
}

/**
 * Re-runs a recording and returns the state it ends in.
 *
 * Takes the schema separately from the recording, and that separation is the
 * point of the whole determinism apparatus: a snapshot says what the world
 * *was*, the schema says what the rules *are*. Replaying an old recording
 * against today's schema is how a rules change is caught — the hashes stop
 * matching, in the change that caused it, which is the only time it is cheap
 * to fix.
 */
export function replay(
  recording: Recording,
  schema: WorldSchema,
  options: ReplayOptions = {},
): SimState {
  let state = deserializeState(recording.initialSnapshot, schema);
  const rng = rngFromRootSeed(recording.rootSeed);

  for (let tick = 0; tick < recording.tickCount; tick += 1) {
    state = step(state, recording.actionLog.at(tick), rng);
    options.onTick?.(tick, state);
  }
  return state;
}

export interface DivergenceResult {
  /** The state the replay ended in, or the state at the first diverging tick. */
  readonly state: SimState;
  readonly diverged: boolean;
  /**
   * The earliest step ordinal whose hash disagreed with the recording, or
   * `null` when the run matched — or when it diverged but the recording
   * carried no per-tick hashes to locate it with.
   */
  readonly tick: number | null;
  /** Present when something is worth saying beyond the flag. */
  readonly reason?: string;
}

/**
 * Replays a recording and reports **where** it stopped agreeing, not merely
 * that it did.
 *
 * The distinction is the entire value of the check. "The final hashes differ"
 * on a 2,000-tick run leaves an engineer bisecting by hand through every
 * subsystem; "they diverged at tick 417" points at one tick's worth of rules,
 * and usually at the diff that landed that morning. A determinism harness that
 * only detects is a harness people learn to ignore.
 *
 * Replay stops at the first divergence. Continuing would report every
 * subsequent tick as diverged too — all of them consequences of the first — and
 * bury the one fact worth having.
 */
export function replayAndLocate(
  recording: Recording,
  schema: WorldSchema,
  options: ReplayOptions = {},
): DivergenceResult {
  const tickHashes = recording.tickHashes;
  let state = deserializeState(recording.initialSnapshot, schema);
  const rng = rngFromRootSeed(recording.rootSeed);

  for (let tick = 0; tick < recording.tickCount; tick += 1) {
    state = step(state, recording.actionLog.at(tick), rng);
    options.onTick?.(tick, state);

    if (tickHashes !== undefined) {
      const expected = tickHashes[tick];
      if (expected !== undefined && snapshotHash(state) !== expected) {
        return {
          state,
          diverged: true,
          tick,
          reason: `Replay diverged at tick ${tick}: expected snapshot hash ${expected}, got ${snapshotHash(state)}.`,
        };
      }
    }
  }

  if (snapshotHash(state) === recording.finalHash) {
    return { state, diverged: false, tick: null };
  }

  return {
    state,
    diverged: true,
    tick: null,
    reason:
      `Replay diverged: expected final snapshot hash ${recording.finalHash}, got ${snapshotHash(state)}. ` +
      'The recording carries no per-tick hashes, so the diverging tick cannot be identified — ' +
      're-record with `traceHashes: true` to locate it.',
  };
}
