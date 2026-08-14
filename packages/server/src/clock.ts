/*
 * Multiverse Mages — the wall clock, confined to one file so the boundary is a place.
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
 * **This is the only file in `@mm/server` that may read a wall clock.**
 *
 * `CLAUDE.md` bans `Date.now` in the rules path, and `contracts.md` §0 says
 * real-time pacing *"is a client/server concern and never appears in the core"*
 * while §8 names the server as its owner. Those two statements together are the
 * licence for this file and the boundary around it: a server legitimately needs
 * a clock for tick pacing and submission deadlines, and nothing downstream of
 * that may see one.
 *
 * The boundary is drawn as a **dependency**, not as a convention. Every module
 * that needs the time takes a {@link Clock}; nothing calls `Date.now` directly
 * except {@link systemClock} below. Two consequences, both wanted:
 *
 * - The rules path is unreachable from here. `match.ts` — the authoritative
 *   tick — takes no clock at all. Its output is a function of the canonical
 *   batch and the sessions, and of nothing else. That is what makes replaying a
 *   recorded match reproduce its hashes, and therefore what makes the release
 *   plan's zero-desync claim measurable rather than decorative.
 * - The tests use {@link manualClock} and are not slow, flaky, or dependent on
 *   the machine's load. A pacing test that needed real elapsed time would be a
 *   test people re-run rather than read.
 *
 * A reviewer checking this boundary has one grep to run: `Date.now` in
 * `packages/server/src` must appear exactly once, in this file. There is a test
 * that runs it.
 */

/** A source of wall-clock milliseconds. Pacing and timeouts only. */
export interface Clock {
  /** Milliseconds. Monotonicity is not assumed; nothing here subtracts across a match. */
  now(): number;
}

/**
 * The real clock. The one licensed `Date.now` in this package.
 *
 * Named rather than inlined so the grep above finds a declaration with this
 * comment next to it, instead of a call site in the middle of a loop.
 */
export const systemClock: Clock = {
  now: (): number => Date.now(),
};

/** A clock a test drives by hand. */
export interface ManualClock extends Clock {
  /** Moves time forward. */
  advance(ms: number): void;
  /** Moves time to an absolute value. */
  set(ms: number): void;
}

/**
 * A clock that only moves when a caller moves it.
 *
 * Used by every test that exercises a deadline. A deadline test written against
 * the real clock asserts something about the machine it runs on, which is why
 * such tests fail in CI and pass on a laptop.
 */
export function manualClock(start = 0): ManualClock {
  let t = start;
  return {
    now: (): number => t,
    advance: (ms: number): void => {
      t += ms;
    },
    set: (ms: number): void => {
      t = ms;
    },
  };
}

/**
 * The default wall-clock terms of a match, **one profile per layer**.
 *
 * These are **pacing**, not simulation. §0 fixes an engagement tick at 100 ms of
 * *fictional* time and a world tick at a month; how much wall clock either takes
 * is these numbers, and they are tuning values rather than contracts —
 * `docs/design/campaign-plan.md` calls a magnitude the spec leaves open
 * `tuningStatus: "untuned"`, and that is what all four are. Nothing about the
 * simulation changes if they change; only how long a participant has to answer.
 *
 * ## Why two profiles
 *
 * The game is two layers. The management layer — research, teaching, scribing,
 * universities — is the mini-game between raids, and its moves are deliberate
 * decisions on a clock whose tick is a month. The raid is the RTS layer, on a
 * clock whose tick is a tenth of a second. See `MatchPacing` in `protocol.ts`
 * for the argument in full; the consequence here is that a god pausing to think
 * about which technique to permit is not handed a no-op for missing a 40 ms
 * deadline that exists for combat.
 *
 * ## Within each profile
 *
 * `actionDeadlineMs` is deliberately shorter than `tickIntervalMs`: the gap is
 * the time the server spends stepping and broadcasting. Equal values would mean
 * the deadline expires exactly as the next tick opens, and every slow tick would
 * substitute a no-op for a submission that had in fact arrived.
 *
 * The engagement numbers are sized against §0's 100 ms fictional tick — running
 * the raid clock at roughly half fictional speed leaves headroom for a round
 * trip on a real link, and "roughly" is doing real work in that sentence
 * because no engagement has ever run over one. The world numbers are sized for
 * a human or an agent deciding, not for a packet arriving.
 */
export const DEFAULT_PACING = Object.freeze({
  engagement: Object.freeze({ tickIntervalMs: 50, actionDeadlineMs: 40 }),
  world: Object.freeze({ tickIntervalMs: 1_000, actionDeadlineMs: 900 }),
});
