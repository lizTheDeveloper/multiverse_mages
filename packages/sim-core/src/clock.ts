/*
 * Multiverse Mages — the dual-scale world clock.
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

import { floorDiv } from './fixed-point/divide.js';

/**
 * The two time scales, as stored in state.
 *
 * Numeric because the mode is serialized into every snapshot and compared
 * across processes; a string would be a wider encoding for a one-bit fact.
 */
export const TIME_MODE = {
  /** World scale: one tick is one month. */
  world: 0,
  /** Engagement scale: one tick is 100 ms of fictional time. */
  engagement: 1,
} as const;

export type TimeMode = (typeof TIME_MODE)[keyof typeof TIME_MODE];

/** A world year, per `contracts.md` §0. */
export const WORLD_TICKS_PER_YEAR = 12;

/**
 * Fictional milliseconds per engagement tick, per `contracts.md` §0.
 *
 * *Fictional* is the load-bearing word: this is how much in-world time a
 * combat tick represents, not how much wall clock a caller should spend on
 * one. Real-time pacing is a client and server concern and never enters the
 * core — see the `step` contract, where callers own time.
 */
export const ENGAGEMENT_TICK_MS = 100;

/** World ticks per era — 20 world years, per `contracts.md` §1.1. */
export const ERA_TICKS = 240;

/**
 * The simulation's time, at both scales, plus which one is running.
 *
 * Mutable, and deliberately so: it lives inside `SimState` and is advanced on
 * the working copy `step` owns. Callers holding a state never see a clock
 * mutate, because `step` clones before it touches anything.
 */
export interface Clock {
  /** Months elapsed. Frozen while in engagement mode. */
  worldTick: number;
  /** Ticks elapsed within the current engagement. Zero outside one. */
  engagementTick: number;
  mode: TimeMode;
  /**
   * Steps taken since the run began. Monotonic, never reset, never frozen.
   *
   * Exists because neither other counter identifies a step uniquely, and
   * randomness has to key on something that does. `engagementTick` restarts at
   * zero for every engagement, so raid #2's third tick would derive a
   * byte-identical stream to raid #1's third tick — the same combatants rolling
   * the same dice in every battle. `worldTick` is frozen during an engagement,
   * so it cannot break the tie either, and world tick 5 and engagement tick 5
   * would collide outright.
   *
   * Replay stayed deterministic throughout, which is exactly what made this
   * worth finding early: nothing would have failed. The damage would have been
   * to every balance measurement taken over repeated engagements, discovered
   * as an unexplained correlation months later.
   */
  stepOrdinal: number;
}

/** A read-only view, for the observation and snapshot paths. */
export type ReadonlyClock = Readonly<Clock>;

/** A fresh clock: world mode, nothing elapsed. */
export function createClock(): Clock {
  return { worldTick: 0, engagementTick: 0, mode: TIME_MODE.world, stepOrdinal: 0 };
}

export function cloneClock(clock: ReadonlyClock): Clock {
  return {
    worldTick: clock.worldTick,
    engagementTick: clock.engagementTick,
    mode: clock.mode,
    stepOrdinal: clock.stepOrdinal,
  };
}

/**
 * Advances whichever scale is currently running.
 *
 * The freeze is structural rather than a rule systems are asked to respect:
 * there is one advancement path, and in engagement mode it cannot reach
 * `worldTick` at all. `raid-engagement` gets the pause for free, and no future
 * system can accidentally age the world during a raid.
 */
export function advanceClock(clock: Clock): void {
  clock.stepOrdinal += 1;
  if (clock.mode === TIME_MODE.engagement) {
    clock.engagementTick += 1;
    return;
  }
  clock.worldTick += 1;
}

/**
 * Enters engagement mode, freezing world time and starting the engagement
 * scale at zero.
 *
 * Throws rather than being idempotent. A double entry means a caller lost
 * track of the mode, and silently accepting it would reset an engagement's
 * clock mid-raid — a corruption that would surface as an unreproducible raid
 * length rather than as an error at its cause.
 */
export function enterEngagement(clock: Clock): void {
  if (clock.mode === TIME_MODE.engagement) {
    throw new Error(
      `Clock is already in engagement mode at engagement tick ${clock.engagementTick}.`,
    );
  }
  clock.mode = TIME_MODE.engagement;
  clock.engagementTick = 0;
}

/**
 * Leaves engagement mode. World time resumes from exactly the tick it held
 * when engagement began, because it never moved.
 */
export function leaveEngagement(clock: Clock): void {
  if (clock.mode !== TIME_MODE.engagement) {
    throw new Error(`Clock is not in engagement mode; it is at world tick ${clock.worldTick}.`);
  }
  clock.mode = TIME_MODE.world;
  clock.engagementTick = 0;
}

/**
 * The era a world tick falls in.
 *
 * A pure function of the tick, never a stored counter. `contracts.md` §1.1
 * records that `era` was previously a field nothing wrote while an ascension
 * path was defined over it; deriving it removes the possibility of that class
 * of bug rather than fixing one instance of it.
 */
export function eraOf(worldTick: number): number {
  return floorDiv(worldTick, ERA_TICKS);
}

/** The tick of whichever scale is currently running. */
export function currentTick(clock: ReadonlyClock): number {
  return clock.mode === TIME_MODE.engagement ? clock.engagementTick : clock.worldTick;
}
