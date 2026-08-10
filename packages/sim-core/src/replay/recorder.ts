/*
 * Multiverse Mages — action-log recording.
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

import type { RngSource } from '../rng/source.js';
import { serializeState, snapshotHash } from '../snapshot/snapshot.js';
import type { Action, SimState } from '../state.js';
import { step } from '../step.js';

/** The JSON projection of an action log, for fixtures on disk. */
export interface ActionLogJSON {
  readonly ticks: readonly (readonly { readonly kind: number; readonly params?: readonly number[] }[])[];
}

function assertInteger(value: unknown, role: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`Action log ${role} must be an integer, received ${String(value)}.`);
  }
  return value;
}

/**
 * Every action submitted to `step`, indexed by the step ordinal it applied at.
 *
 * **Ordinal, not clock tick.** The clock is dual-scale and freezes world time
 * during an engagement, so a clock tick does not identify a step uniquely — two
 * different steps can both be "world tick 12". The replayer has to know how
 * many times to call `step` and what to pass each time, and the step ordinal is
 * the only index that answers that across a mode change.
 *
 * Actions are copied in, never referenced. A caller that reuses one array
 * across ticks — which a client render loop naturally would — must not be able
 * to rewrite history it has already recorded.
 */
export class ActionLog {
  readonly #ticks: Action[][] = [];

  /** Appends one step's actions. */
  record(actions: readonly Action[]): void {
    // Frozen, not merely copied. `at()` hands this array straight to `step` as
    // `ctx.actions`, so an unfrozen copy would let a system rewrite the log it
    // is being replayed from — history editing itself mid-replay.
    this.#ticks.push(
      Object.freeze(
        actions.map((action) =>
          Object.freeze(
            action.params === undefined
              ? { kind: action.kind }
              : { kind: action.kind, params: Object.freeze([...action.params]) },
          ),
        ),
      ) as Action[],
    );
  }

  /** A detached copy, so a snapshot of a log does not follow the live one. */
  clone(): ActionLog {
    const copy = new ActionLog();
    for (const actions of this.#ticks) {
      copy.record(actions);
    }
    return copy;
  }

  /** Steps recorded. */
  get length(): number {
    return this.#ticks.length;
  }

  /** The actions applied at a step ordinal, in submission order. */
  at(tick: number): readonly Action[] {
    return this.#ticks[tick] ?? [];
  }

  toJSON(): ActionLogJSON {
    return {
      ticks: this.#ticks.map((actions) =>
        actions.map((action) =>
          action.params === undefined
            ? { kind: action.kind }
            : { kind: action.kind, params: [...action.params] },
        ),
      ),
    };
  }

  /**
   * Rebuilds a log from its JSON projection, validating as it goes.
   *
   * Validation is not politeness here. A golden fixture is read off disk and
   * fed straight into the simulation; a malformed action that slipped through
   * would replay as *something*, and a fixture that reproduces the wrong run is
   * strictly worse than one that fails to load.
   */
  static fromJSON(value: unknown): ActionLog {
    const ticks = Array.isArray(value)
      ? (value as unknown[])
      : typeof value === 'object' && value !== null && Array.isArray((value as ActionLogJSON).ticks)
        ? ((value as { ticks: unknown[] }).ticks)
        : undefined;
    if (ticks === undefined) {
      throw new TypeError(
        'Malformed action log: expected an array of ticks, or an object with a `ticks` array.',
      );
    }

    const log = new ActionLog();
    for (let tick = 0; tick < ticks.length; tick += 1) {
      const entry = ticks[tick];
      if (!Array.isArray(entry)) {
        throw new TypeError(`Malformed action log: tick ${tick} is not an array of actions.`);
      }
      log.record(
        (entry as unknown[]).map((raw) => {
          if (typeof raw !== 'object' || raw === null) {
            throw new TypeError(`Malformed action log: tick ${tick} holds a non-action entry.`);
          }
          const action = raw as { kind: unknown; params?: unknown };
          const kind = assertInteger(action.kind, `tick ${tick} action kind`);
          if (action.params === undefined) {
            return { kind };
          }
          if (!Array.isArray(action.params)) {
            throw new TypeError(`Malformed action log: tick ${tick} action params is not an array.`);
          }
          return {
            kind,
            params: (action.params as unknown[]).map((param, i) =>
              assertInteger(param, `tick ${tick} action param ${i}`),
            ),
          };
        }),
      );
    }
    return log;
  }
}

/**
 * Everything needed to reproduce a run exactly: where it started, what was
 * asked of it, and what it turned into.
 */
export interface Recording {
  readonly rootSeed: number;
  /** The state before the first step, serialized. */
  readonly initialSnapshot: Uint8Array;
  readonly actionLog: ActionLog;
  /** Steps taken. Always equal to `actionLog.length`. */
  readonly tickCount: number;
  /** Snapshot hash after the last step. */
  readonly finalHash: string;
  /**
   * Snapshot hash after each step, when hash tracing was enabled.
   *
   * Absent by default, and that default is deliberate: hashing serializes the
   * entire state, so tracing every tick would dominate the cost of a Monte
   * Carlo sweep whose whole purpose is throughput. It is turned on for golden
   * fixtures and when hunting a desync, which are exactly the cases where
   * knowing *which* tick diverged is worth more than the run's speed.
   */
  readonly tickHashes?: readonly string[];
}

export interface RecorderOptions {
  /** Record a snapshot hash after every step. Off by default; see {@link Recording.tickHashes}. */
  readonly traceHashes?: boolean;
}

/**
 * Drives `step` while writing down what it was asked to do.
 *
 * Recording is strictly additive: the recorder calls the same `step` with the
 * same arguments a bare caller would, and reads the resulting state. There is
 * no recording-aware branch anywhere in the core, which is what makes "enabling
 * recording does not change results" true by construction rather than by test —
 * though the test exists anyway, because "by construction" is a claim that
 * stops being true the first time someone adds a branch.
 */
export class Recorder {
  readonly #rootSeed: number;
  readonly #initialSnapshot: Uint8Array;
  readonly #actionLog = new ActionLog();
  readonly #tickHashes: string[] | undefined;

  #state: SimState;
  #finalHash: string | undefined;

  constructor(initial: SimState, options: RecorderOptions = {}) {
    this.#rootSeed = initial.rootSeed;
    this.#initialSnapshot = serializeState(initial);
    this.#state = initial;
    this.#tickHashes = options.traceHashes === true ? [] : undefined;
  }

  /** The state as of the last step. */
  get state(): SimState {
    return this.#state;
  }

  /** Advances one tick, recording the actions. */
  step(actions: readonly Action[], rng: RngSource): SimState {
    this.#state = step(this.#state, actions, rng);
    this.#actionLog.record(actions);
    this.#finalHash = undefined;
    if (this.#tickHashes !== undefined) {
      const hash = snapshotHash(this.#state);
      this.#tickHashes.push(hash);
      this.#finalHash = hash;
    }
    return this.#state;
  }

  /**
   * The recording so far, detached from this recorder.
   *
   * The action log is copied, not referenced. It used to be handed out live
   * while `tickCount` was frozen at the moment of the call, so a `Recording`
   * taken mid-run silently decayed as the run continued — by the next step its
   * own two fields disagreed, and replaying it threw. "Safe to take mid-run"
   * was documented and false; this makes it true instead of retracting it,
   * because taking a recording mid-run is exactly what a desync report does.
   */
  get recording(): Recording {
    this.#finalHash ??= snapshotHash(this.#state);
    const base = {
      rootSeed: this.#rootSeed,
      initialSnapshot: this.#initialSnapshot.slice(),
      actionLog: this.#actionLog.clone(),
      tickCount: this.#actionLog.length,
      finalHash: this.#finalHash,
    };
    return this.#tickHashes === undefined ? base : { ...base, tickHashes: [...this.#tickHashes] };
  }
}
