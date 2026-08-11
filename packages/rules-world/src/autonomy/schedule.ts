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
import type { GoalCommitmentRecord } from '@mm/state';

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
 * **`@mm/state`'s `GoalCommitmentRecord`, with the goal id narrowed to this
 * package's registry — not a second declaration of it.** `state-schema` requires
 * one set of world-state types that every rules package consumes, and a
 * conformance check over the workspace enforces it; the field names here are
 * therefore the component's field names, so reading and writing a commitment is
 * a plain record access with no translation step to transpose.
 *
 * The only thing added is the narrowing. The component stores `goalId` as a
 * `uint8`, because `@mm/state` may not import a rules package and so cannot know
 * the registry; on this side of the boundary it is a {@link GoalId}, and
 * `commitment-store.ts` is where an out-of-registry value from a foreign
 * snapshot is caught rather than allowed to flow into a scoring table lookup.
 *
 * Where a commitment lives was an open question in this file at 0.4.0 — a new
 * world component, or an amendment to `contracts.md` §1.2's mage row. The
 * component won, §1.2 now names it, and the deviation that creates from
 * `mages-and-species`' "state-schema is consumed unchanged" is recorded there
 * with its reasoning, in the style of the two §5 deviations before it.
 */
export interface MageGoalCommitment extends GoalCommitmentRecord {
  /** The chosen goal. Narrowed from the component's `uint8` to the registry. */
  readonly goalId: GoalId;
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
  readonly incumbent: MageGoalCommitment | undefined;
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
