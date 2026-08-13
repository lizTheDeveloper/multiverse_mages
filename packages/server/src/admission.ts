/*
 * Multiverse Mages — the admission policy §4.2 puts at the boundary.
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

import type { Clock } from './clock.js';

/**
 * The defence the core deliberately does not have.
 *
 * `contracts.md` §4.2 states the problem and assigns it here in one paragraph:
 *
 * > **This rule governs the core only, and the core assumes a trusted caller.**
 * > A cheap, silent, unlimited no-op is correct for a learning agent and is an
 * > invitation to unbounded work from a hostile network peer — and under the
 * > AGPL, modified clients are a granted right, not an anomaly. Any layer
 * > accepting actions across a trust boundary (`server`, …) MUST apply its own
 * > admission policy — rate limiting, disconnection — *before* the action
 * > reaches the core. The core does not defend itself; the boundary does.
 *
 * Two budgets, because there are two distinct abuses and one number cannot
 * bound both:
 *
 * - **Frames per window** bounds the *parsing* a peer can make the server do.
 *   It is charged for every line, including malformed ones and frames of verbs
 *   that go nowhere, because a peer that floods `hello` costs exactly as much as
 *   one that floods `action`.
 * - **Submissions per tick** bounds the *screening* a peer can make the server
 *   do. Ordering already discards all but one submission per slot per tick, so
 *   without this a peer could submit ten thousand times for one tick and have
 *   every one of them mask-checked before 9,999 were thrown away.
 *
 * ## This is the one place besides pacing that reads a clock
 *
 * And it reads an injected one. A rate limiter is the classic place a
 * `Date.now()` gets typed directly into a condition, and a test for it then
 * either sleeps or is skipped. Taking a {@link Clock} makes the limiter's tests
 * exact and instant, and keeps the wall clock reachable only from `clock.ts` —
 * see the note there, and the test that greps for it.
 *
 * Nothing in this file is a simulation input. A refusal changes which frames the
 * server reads; it never changes what a tick means. A slot whose submissions are
 * all refused gets the same substituted no-op that a slot which sent nothing
 * gets, so a rate-limited participant and a silent one produce identical state
 * — which is what keeps the limiter out of the determinism story entirely.
 */

/** The numbers a connection is held to. */
export interface AdmissionPolicy {
  /** Frames a connection may send per {@link windowMs}. */
  readonly maxFramesPerWindow: number;
  /** The window, in wall-clock milliseconds. */
  readonly windowMs: number;
  /** Submissions a connection may offer for one tick. */
  readonly maxSubmissionsPerTick: number;
}

/**
 * The shipped defaults.
 *
 * Sized so an honest client is never near them: a participant sends on the order
 * of two frames per tick — one action, one checkpoint — and at the default
 * pacing of one tick per 50 ms that is roughly 40 frames a second against a
 * budget of 600. `campaign-plan.md`'s rule for a magnitude the spec leaves open
 * applies: these are untuned, and the thing to tune them against is a real
 * deployment's observed frame rate, which does not exist yet.
 */
export const DEFAULT_ADMISSION_POLICY: AdmissionPolicy = Object.freeze({
  maxFramesPerWindow: 600,
  windowMs: 1_000,
  maxSubmissionsPerTick: 4,
});

/** Why a frame was not admitted. */
export type AdmissionRefusal = 'frame-rate' | 'submission-budget';

/**
 * One connection's budgets.
 *
 * A fixed window rather than a sliding one, deliberately: a fixed window admits
 * up to twice the nominal rate across a boundary, and a sliding window costs a
 * timestamp per frame — which is a per-frame allocation a hostile peer controls
 * the rate of. Bounding the memory a peer can make the server spend matters more
 * here than the precision of the bound, since the bound exists to stop unbounded
 * work rather than to meter a paying customer.
 */
export class ConnectionBudget {
  private windowStart: number;
  private framesThisWindow = 0;
  private tick = -1;
  private submissionsThisTick = 0;

  constructor(
    private readonly clock: Clock,
    private readonly policy: AdmissionPolicy = DEFAULT_ADMISSION_POLICY,
  ) {
    this.windowStart = clock.now();
  }

  /**
   * Charges one frame.
   *
   * Returns the refusal, or `undefined` when the frame may be processed. A
   * refusal is fatal for the connection: a peer already past its budget will not
   * be persuaded by an error frame, and answering it would be more work of
   * exactly the kind being refused.
   */
  chargeFrame(): AdmissionRefusal | undefined {
    const now = this.clock.now();
    if (now - this.windowStart >= this.policy.windowMs) {
      this.windowStart = now;
      this.framesThisWindow = 0;
    }
    this.framesThisWindow += 1;
    return this.framesThisWindow > this.policy.maxFramesPerWindow ? 'frame-rate' : undefined;
  }

  /**
   * Charges one submission against the given tick's budget.
   *
   * The counter resets when the tick changes rather than on a timer, so a
   * participant cannot bank budget by staying quiet through several ticks.
   */
  chargeSubmission(tick: number): AdmissionRefusal | undefined {
    if (tick !== this.tick) {
      this.tick = tick;
      this.submissionsThisTick = 0;
    }
    this.submissionsThisTick += 1;
    return this.submissionsThisTick > this.policy.maxSubmissionsPerTick
      ? 'submission-budget'
      : undefined;
  }
}
