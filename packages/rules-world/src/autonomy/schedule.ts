/*
 * Multiverse Mages — when a mage reconsiders, and what it takes to change her
 * mind.
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

import type { Fixed } from '@mm/sim-core';
import type { ContentId } from '@mm/content';
import type { Tick } from '@mm/state';

import type { MageHandle } from '../coordination.js';
import type { GoalId } from './goals.js';

/**
 * ## Two problems, one mechanism
 *
 * `mages-and-species/design.md` gives the stagger two jobs and warns that
 * solving only one leaves the other:
 *
 * > Cost: re-scoring every mage against every goal every tick is the hot loop
 * > of this change, and the stagger divides it by `evalPeriod` with no loss of
 * > fidelity at the month granularity of world time. Behaviour: synchronous
 * > evaluation makes the entire mage population switch goals in lockstep the
 * > tick a shared input changes — every mage in the universe abandons research
 * > on the same month because one library grew — which looks like a bug,
 * > oscillates, and poisons every metric with harmonics that have nothing to do
 * > with balance.
 *
 * The alternative it rejects is instructive: *"evaluate everyone every tick and
 * rely on hysteresis alone to damp the herding. Rejected — hysteresis damps
 * flip-flopping but not synchronization, and it does nothing for the cost."*
 * So the two mechanisms in this file are not redundant. The stagger spreads
 * *when* mages decide; hysteresis governs *whether* a decision changes
 * anything.
 *
 * ## The phase comes from the handle, and that is the determinism argument
 *
 * `(worldTick + mageId) mod evalPeriod`. The handle is a stable identity —
 * `contracts.md` §6 requires actor keys to be stable rather than positional for
 * RNG, and the same argument applies to a schedule: phase by array index and
 * inserting one mage re-phases everyone behind her, so a run stays reproducible
 * while every per-mage trace in it becomes unattributable.
 *
 * ## Completion and infeasibility outrank both
 *
 * A mage whose goal has completed, or whose goal has become impossible, does
 * not wait for her phase. The `mage-autonomy` spec makes that a scenario —
 * *"the mage re-evaluates in that same tick"* — and it is what stops a
 * commitment period from becoming a period of doing nothing.
 */

/**
 * Ticks between scheduled re-evaluations. **Untuned.**
 *
 * `mages-and-species/design.md` leaves this open: *"Is `evalPeriod` of 3 ticks
 * the right granularity? It trades AI responsiveness against the hot loop's
 * cost. The benchmark measures the cost; only 0.5.0 can measure whether the
 * responsiveness matters."* Three world ticks is a quarter of a year.
 */
export const EVAL_PERIOD = 3;

/**
 * Ticks a freshly adopted goal is held before a challenger may displace it.
 * **Untuned.**
 *
 * Six months. Long enough that a mage cannot re-point herself twice a year on
 * noise, short enough that a 200-year run contains hundreds of decisions per
 * mage rather than a handful.
 */
export const MIN_COMMITMENT_TICKS = 6;

/**
 * How far a challenger must beat the incumbent to displace it, in fixed point.
 * **Untuned.**
 *
 * `fp(128)` is an eighth of the largest base appeal, so a challenger has to be
 * meaningfully better rather than better by a rounding step. Zero here would
 * make every arithmetic tie a coin flip between two goals on consecutive
 * evaluations, which is the flip-flopping the margin exists to damp.
 */
export const HYSTERESIS_MARGIN: Fixed = 128;

/**
 * What a mage is currently working on.
 *
 * Deliberately a value rather than a component read. Everything in this
 * directory is a pure function of an outlook and a commitment, so nothing here
 * needs to know where a commitment lives — and at 0.4.0 nothing has decided.
 *
 * That is an open question rather than an oversight, and it is recorded as one:
 * `contracts.md` §1.2's mage row has no goal field, so persisting a commitment
 * across a snapshot needs either a new world component or a field amendment,
 * and neither should be chosen by whoever happens to write the first caller.
 * Keeping the commitment a value means the decision is still available. Keeping
 * it in a JavaScript map beside the state would not be — that is state which
 * does not round-trip through a save, which `components.ts` names as the defect
 * that shows up as a loaded game missing the player's edicts.
 */
export interface GoalCommitment {
  readonly goal: GoalId;
  /** The node this goal is pointed at, or `0` for a goal that needs none. */
  readonly targetNodeId: ContentId;
  /** The world tick the goal was adopted on. The commitment clock. */
  readonly adoptedTick: Tick;
  /** The score it was adopted at, for reporting rather than for comparison. */
  readonly score: Fixed;
}

/** Tuning knobs, so a test can shorten a period without editing a constant. */
export interface ScheduleOptions {
  readonly evalPeriod?: number | undefined;
  readonly minCommitmentTicks?: number | undefined;
  readonly hysteresisMargin?: Fixed | undefined;
}

/** Whether this tick is a mage's scheduled evaluation phase. */
export function isEvaluationTick(
  worldTick: number,
  mage: MageHandle,
  evalPeriod: number = EVAL_PERIOD,
): boolean {
  if (!Number.isInteger(evalPeriod) || evalPeriod < 1) {
    throw new RangeError(
      `evalPeriod must be a positive integer, received ${String(evalPeriod)}; a period of zero ` +
        'would divide the hot loop by nothing and a negative one has no meaning',
    );
  }
  // Both operands are non-negative in every legitimate call — world ticks do
  // not run backwards and handles are `uint32` — but a modulus of a negative
  // number is negative in JavaScript, so the sum is normalised rather than
  // trusted. A mage whose phase silently became "never" would simply stop
  // making decisions, which reads as a personality rather than as a defect.
  const phase = ((worldTick + mage) % evalPeriod + evalPeriod) % evalPeriod;
  return phase === 0;
}

/** Everything the re-evaluation decision needs. */
export interface ReevaluationInput {
  readonly worldTick: number;
  readonly mage: MageHandle;
  /** The current commitment, or `undefined` for a mage who has never chosen. */
  readonly incumbent: GoalCommitment | undefined;
  /** Whether the incumbent goal is still feasible this tick. */
  readonly incumbentFeasible: boolean;
  /** Whether the incumbent goal finished — the caller's judgement, not ours. */
  readonly incumbentComplete: boolean;
  readonly options?: ScheduleOptions | undefined;
}

/** Why a mage is being re-evaluated, for the report and for a test to assert on. */
export type ReevaluationReason = 'no-incumbent' | 'complete' | 'infeasible' | 'scheduled' | 'held';

/**
 * Whether a mage reconsiders this tick, and why.
 *
 * The three forcing reasons are checked before the schedule and before
 * commitment, because all three mean the incumbent no longer exists as
 * something to be committed to. Holding an impossible goal for the rest of a
 * commitment period is the failure the mask was introduced to prevent, arriving
 * through the scheduler instead.
 */
export function reevaluationReason(input: ReevaluationInput): ReevaluationReason {
  const { incumbent } = input;
  if (incumbent === undefined) return 'no-incumbent';
  if (input.incumbentComplete) return 'complete';
  if (!input.incumbentFeasible) return 'infeasible';

  const evalPeriod = input.options?.evalPeriod ?? EVAL_PERIOD;
  if (!isEvaluationTick(input.worldTick, input.mage, evalPeriod)) return 'held';

  const minCommitment = input.options?.minCommitmentTicks ?? MIN_COMMITMENT_TICKS;
  if (input.worldTick - incumbent.adoptedTick < minCommitment) return 'held';

  return 'scheduled';
}

/** Whether {@link reevaluationReason} means the mage scores her options this tick. */
export function shouldReevaluate(input: ReevaluationInput): boolean {
  return reevaluationReason(input) !== 'held';
}

/**
 * Whether a challenger beats an incumbent by enough to displace it.
 *
 * Strictly greater than the margin, so a challenger exactly at the margin does
 * not displace. The spec's scenario is *"scores above the incumbent by less
 * than the hysteresis margin → the mage keeps its current goal"*, which leaves
 * the boundary open; it is closed toward keeping, because the whole purpose of
 * the margin is to prefer the status quo when the difference is small.
 */
export function displaces(
  challengerScore: Fixed,
  incumbentScore: Fixed,
  margin: Fixed = HYSTERESIS_MARGIN,
): boolean {
  return challengerScore - incumbentScore > margin;
}
