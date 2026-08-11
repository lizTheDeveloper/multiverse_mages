/*
 * Multiverse Mages — the harness side of primitive ablation: paired-seed arm
 * scheduling, mirrored sides, and the Wilson interval the attribution is read
 * through.
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
 * Tasks 7.4 through 7.8. The *mechanism* — the mask inside `stackMagnitudes`,
 * the per-stacking-class neutralization identities, draw-count invariance — is
 * tasks 7.1–7.3 and lives in `@mm/primitives`, where the one shared stacking
 * implementation is. What lives here is the experiment built on top of it.
 *
 * ## An arm is a whole execution of the sweep, not a slice of one
 *
 * The obvious design is to widen a run's coordinates with an arm index and put
 * every arm in one results file. It is the wrong one, and specifically because
 * of task 7.4's own requirement: *identical derived seeds*. A run seed is
 * `deriveRunSeed(rootSeed, sweepId, cellIndex, replicateIndex)` and nothing
 * else, which is what makes a record reproducible from the four numbers it
 * carries. Adding an arm index to that tuple would give the control arm and the
 * ablation arm different seeds — different founders, different personalities,
 * different everything — and the measured difference between them would be
 * mostly sampling noise wearing a primitive's name.
 *
 * So every arm is executed as its own sweep, over the *same* `sweepId`,
 * `rootSeed`, factors and replicates, differing only in which primitive its
 * `AblationSpec` neutralizes and which agent slot carries the neutralized
 * ruleset. Identical coordinates therefore derive identical seeds by
 * construction rather than by a convention someone has to keep, and
 * {@link pairedSeedProblems} checks that claim against the built tasks rather
 * than asserting it in prose.
 *
 * The configuration hash *does* differ between arms, because the ablation block
 * is inside it. That is correct: the control arm and the ablation arm are two
 * different experiments, and a summary whose job is to say which experiment
 * produced these numbers must not call them the same one.
 *
 * ## Why one primitive produces two arms
 *
 * `winRateByPrimitive` is a win rate of *"the arm retaining p against the arm in
 * which p is neutralized … over mirrored pairs that share derived run seeds and
 * are played twice with the sides swapped"*. Mirroring is not decoration: if
 * side 0 has any structural advantage — first mover, defender's terrain,
 * whatever `raid-engagement` ends up giving it — then an unmirrored measurement
 * reports that advantage as the primitive's contribution, quietly, as a number
 * near 50% that drifts.
 *
 * The two sides are the two agent slots, so one primitive gets **two** ablation
 * arms: one neutralizing it in slot 0, one in slot 1, on the same seeds. Each
 * (cell, replicate) then yields two plays of one pair, one per side, and both
 * contribute. Task 7.4 says "one ablation arm per primitive"; it is one
 * *treatment* per primitive, realized as its mirrored pair, and the alternative
 * — a single arm — is the thing the mirroring requirement exists to forbid.
 *
 * ## Interaction ablation is refused, in two places
 *
 * `ablationMaskFor` in `@mm/primitives` refuses a mask naming two primitives.
 * That is the last line of defence, inside a worker, after dispatch.
 * {@link ablationProblems} is the first: a sweep *file* asking for pairwise
 * ablation is rejected before a single run is scheduled, naming the pair and the
 * arithmetic (fifteen primitives make 105 pairs). Both exist because they fail
 * at different times, and the one that fails before forty minutes of compute is
 * the one a human actually reads.
 */

import type { MetricDetail, MetricEntry } from './metrics.js';
import { UNAVAILABLE_REASON } from './metrics.js';
import type { AblationSpec, SweepPlan, SweepRegistries, SweepSpec } from './sweep-spec.js';
import { expandSweep, validateSweep } from './sweep-spec.js';
import type { RunTask } from './protocol.js';
import { buildTasks } from './runner.js';

/* ------------------------------------------------------------------------- *
 * 7.7 — the primitive whose ablation has nothing to attribute
 * ------------------------------------------------------------------------- */

/**
 * Primitives whose neutralization destroys the very outcome being attributed,
 * mapped to the reason `winRateByPrimitive` reports for each.
 *
 * One member, and it is `portal`. `contracts.md` §3 gives `portal` the
 * `presence` stacking class — it is a gate, not a magnitude — and `@mm/primitives`
 * neutralizes a presence gate by treating it as absent. A universe with no
 * portal opens no portal, so the ablation arm plays no raid, so there is no raid
 * whose outcome could be compared against the control arm's. The honest report
 * is not "0.5, no detected effect": that would claim the experiment ran and
 * found nothing. It is `not-attributable`, which claims the experiment cannot be
 * run at all.
 *
 * This is a *methodological* exclusion and not a mechanic gap, which is why it
 * gets a reason code of its own rather than reusing `no-observations`. The
 * distinction survives into the record: a reader in 2031 can tell "raids exist
 * and this arm happened to play none" from "this arm could never have played
 * one".
 */
export const NOT_ATTRIBUTABLE_PRIMITIVES: Readonly<Record<string, string>> = Object.freeze({
  portal:
    'neutralizing portal removes raiding entirely — it is a presence gate, and an absent gate ' +
    'opens no portal — so the ablation arm plays no raid and there is no outcome to attribute. ' +
    'A win rate here would be a comparison against an arm that never fought.',
});

/** Whether `winRateByPrimitive` can be defined for `primitiveId` at all. */
export function isAttributable(primitiveId: string): boolean {
  return NOT_ATTRIBUTABLE_PRIMITIVES[primitiveId] === undefined;
}

/* ------------------------------------------------------------------------- *
 * 7.4 and 7.5 — arms, and the seeds they share
 * ------------------------------------------------------------------------- */

/** What an arm is for. */
export const ABLATION_ROLE = {
  /** Nothing neutralized. One per ablation sweep, shared by every comparison. */
  control: 'control',
  /** One primitive neutralized, in one agent slot. */
  ablation: 'ablation',
} as const;

/** Any role from {@link ABLATION_ROLE}. */
export type AblationRole = (typeof ABLATION_ROLE)[keyof typeof ABLATION_ROLE];

/** One arm of an ablation sweep. */
export interface AblationArm {
  /**
   * Stable, and stable across executions: `control`, or
   * `ablate:<primitiveId>@slot<n>`. It keys the arm's results directory and the
   * `ArmTelemetry` the per-arm collectors read, so a renaming is a change to
   * where a number came from.
   */
  readonly armId: string;
  readonly role: AblationRole;
  /** The neutralized primitive, or `null` on the control arm. */
  readonly neutralizedPrimitiveId: string | null;
  /**
   * The agent slot playing the neutralized ruleset, or `null` on the control.
   *
   * This is the "side" the mirroring swaps. The retaining side is every other
   * slot, which for the two-slot pairing a mirrored ablation requires is exactly
   * one of them.
   */
  readonly ablatedSlotIndex: number | null;
}

/** The control arm every comparison in a sweep is made against. */
export const CONTROL_ARM: AblationArm = Object.freeze({
  armId: 'control',
  role: ABLATION_ROLE.control,
  neutralizedPrimitiveId: null,
  ablatedSlotIndex: null,
});

/** The slot count a mirrored one-sided ablation needs. Two sides, two slots. */
export const MIRRORED_SLOT_COUNT = 2;

/**
 * Every problem with a sweep's ablation block, as human-readable lines.
 *
 * Called by {@link validateAblationSweep} and, through it, before any arm is
 * scheduled. Returns all of them rather than the first, for the reason
 * `sweep-spec.ts` gives: a file with three mistakes should cost one round trip.
 */
export function ablationProblems(spec: SweepSpec): string[] {
  const problems: string[] = [];
  // Read through a widened shape on purpose. A sweep file is JSON that has not
  // been near the type system, so `mode: "pairwise"` and a stray `pairs` key are
  // both things a human can write and the compiler will never see — and a
  // validator that could only reject what the types already forbid would reject
  // nothing that ever actually happens.
  const ablation = spec.ablation as Omit<AblationSpec, 'mode'> & {
    readonly pairs?: unknown;
    readonly mode?: string;
  };
  if (ablation === undefined || typeof ablation !== 'object') return problems;

  // 7.8 — the two shapes a pairwise request takes, each refused by name.
  if (ablation.mode === 'pairwise' || ablation.mode === 'interaction') {
    problems.push(
      `ablation.mode is "${String(ablation.mode)}". Interaction ablation is deliberately out of ` +
        'scope: fifteen primitives make 105 pairs, two orders of magnitude of sweep cost for a ' +
        'question nobody has asked. Declare "one-sided" and schedule one arm per primitive; the ' +
        'arms are independent and their results can be read side by side.',
    );
  }
  if (ablation.pairs !== undefined) {
    problems.push(
      'ablation.pairs asks for pairwise ablation, which this change declares out of scope. Each ' +
        'arm neutralizes exactly one primitive — @mm/primitives\' ablationMaskFor refuses a mask ' +
        'naming two — so a "pairs" arm could not be built, only mislabelled.',
    );
  }

  if (ablation.mode !== 'one-sided') return problems.sort();

  const primitives = ablation.primitives;
  if (Array.isArray(primitives)) {
    if (new Set(primitives).size !== primitives.length) {
      problems.push(
        'ablation.primitives names the same primitive twice. Two arms neutralizing one primitive ' +
          'on identical seeds are one measurement counted as two.',
      );
    }
    for (const primitiveId of primitives) {
      if (typeof primitiveId !== 'string' || primitiveId.length === 0) {
        problems.push('every entry of ablation.primitives must be a non-empty primitive id.');
      }
    }
  }

  if (spec.agentPool !== undefined && spec.agentPool.slots !== MIRRORED_SLOT_COUNT) {
    problems.push(
      `ablation.mode is "one-sided" but agentPool.slots is ${String(spec.agentPool.slots)}. ` +
        'One-sided ablation is measured over mirrored pairs — the same seed played twice with the ' +
        'sides swapped — and there is nothing to swap with one slot or three. Without the mirror, ' +
        'any structural advantage side 0 has is reported as the primitive\'s contribution.',
    );
  }

  return problems.sort();
}

/**
 * Validates a sweep including its ablation block.
 *
 * A thin composition rather than a change to `validateSweep`, because
 * `validateSweep` is what `expandSweep` calls on every sweep in the repository
 * and the ablation rules apply only to a sweep that asked for ablation. Both
 * lists are returned together and sorted, so a caller sees one message.
 */
export function validateAblationSweep(spec: SweepSpec, registries: SweepRegistries): string[] {
  return [...validateSweep(spec, registries), ...ablationProblems(spec)].sort();
}

/**
 * The arms an ablation sweep schedules, in a stable order.
 *
 * `none` gives exactly one arm — the control — so that a caller can run every
 * sweep through the same path and a non-ablation sweep is simply an ablation
 * sweep with nothing ablated. `one-sided` gives the control plus, per primitive
 * in sorted order, one arm per agent slot: the mirrored pair.
 *
 * Primitives are sorted rather than taken in file order for the reason
 * `sweep-spec.ts` sorts factors — arm ids must be a function of the primitive
 * *set*, so that reordering two lines in a sweep file does not silently re-map
 * which results directory holds which primitive.
 *
 * @throws Error naming every problem, when the ablation block does not validate.
 */
export function ablationArms(spec: SweepSpec): AblationArm[] {
  const problems = ablationProblems(spec);
  if (problems.length > 0) {
    throw new Error(
      `Sweep ${String(spec.sweepId)} has an ablation block that cannot be scheduled and no arm ` +
        `was built:\n  ${problems.join('\n  ')}`,
    );
  }

  const arms: AblationArm[] = [CONTROL_ARM];
  if (spec.ablation.mode !== 'one-sided') return arms;

  for (const primitiveId of [...spec.ablation.primitives].sort()) {
    for (let slot = 0; slot < spec.agentPool.slots; slot += 1) {
      arms.push(
        Object.freeze({
          armId: `ablate:${primitiveId}@slot${String(slot)}`,
          role: ABLATION_ROLE.ablation,
          neutralizedPrimitiveId: primitiveId,
          ablatedSlotIndex: slot,
        }),
      );
    }
  }
  return arms;
}

/**
 * The sweep specification one arm executes.
 *
 * Everything that feeds the seed derivation is carried through untouched —
 * `sweepId`, `rootSeed`, `factors`, `replicates` — and only the ablation block
 * changes. That is the whole of task 7.4's guarantee, expressed as a function
 * rather than as a warning.
 */
export function armSpec(spec: SweepSpec, arm: AblationArm): SweepSpec {
  if (arm.neutralizedPrimitiveId === null) {
    return { ...spec, ablation: { mode: 'none', primitives: [] } };
  }
  return {
    ...spec,
    ablation: { mode: 'one-sided', primitives: [arm.neutralizedPrimitiveId] },
  };
}

/** One arm's plan and tasks, ready to dispatch. */
export interface ArmSchedule {
  readonly arm: AblationArm;
  readonly spec: SweepSpec;
  readonly plan: SweepPlan;
  /** Keyed by task id, exactly as {@link buildTasks} builds them. */
  readonly tasks: Map<number, RunTask>;
}

/**
 * Expands every arm of an ablation sweep and derives all of its seeds.
 *
 * Seeds are derived here, once, for every arm — not dealt out as workers become
 * free and not re-derived inside a worker. {@link pairedSeedProblems} is then a
 * check over data that already exists rather than a claim about code that will
 * run later.
 */
export function scheduleAblation(spec: SweepSpec, registries: SweepRegistries): ArmSchedule[] {
  return ablationArms(spec).map((arm) => {
    const derived = armSpec(spec, arm);
    const plan = expandSweep(derived, registries);
    return {
      arm,
      spec: derived,
      plan,
      tasks: buildTasks(derived, plan, {
        ...(arm.ablatedSlotIndex === null ? {} : { ablatedSlotIndex: arm.ablatedSlotIndex }),
      }),
    };
  });
}

/**
 * Names every way an ablation schedule fails "identical derived seeds".
 *
 * The property task 7.4 asks for, checked rather than assumed: for every
 * `(cellIndex, replicateIndex)`, every arm must hold a task with the same run
 * seed and the same factor levels. A control arm whose founders differ from its
 * ablation arm's is not a control.
 *
 * Returns lines naming the coordinates and both seeds, because a failure here is
 * a silent one — the sweep completes, the numbers are plausible, and the
 * attribution is noise.
 */
export function pairedSeedProblems(schedules: readonly ArmSchedule[]): string[] {
  const control = schedules[0];
  if (control === undefined) return [];
  const problems: string[] = [];

  const key = (task: RunTask): string =>
    `${String(task.coordinates.cellIndex)}:${String(task.coordinates.replicateIndex)}`;
  const reference = new Map<string, RunTask>();
  for (const task of control.tasks.values()) reference.set(key(task), task);

  for (const schedule of schedules.slice(1)) {
    const seen = new Set<string>();
    for (const task of schedule.tasks.values()) {
      const coordinates = key(task);
      seen.add(coordinates);
      const paired = reference.get(coordinates);
      if (paired === undefined) {
        problems.push(
          `arm ${schedule.arm.armId} holds a run at cell/replicate ${coordinates} that the ` +
            `control arm ${control.arm.armId} does not. Arms must expand to the same cells.`,
        );
        continue;
      }
      if (paired.runSeed !== task.runSeed) {
        problems.push(
          `arm ${schedule.arm.armId} derives run seed ${String(task.runSeed)} at cell/replicate ` +
            `${coordinates} where the control arm derives ${String(paired.runSeed)}. Paired arms ` +
            'must share seeds, or the measured difference between them is mostly sampling noise.',
        );
      }
      if (JSON.stringify(paired.levels) !== JSON.stringify(task.levels)) {
        problems.push(
          `arm ${schedule.arm.armId} runs cell/replicate ${coordinates} at different factor ` +
            'levels from the control arm.',
        );
      }
    }
    for (const coordinates of reference.keys()) {
      if (!seen.has(coordinates)) {
        problems.push(
          `arm ${schedule.arm.armId} is missing the run at cell/replicate ${coordinates} that the ` +
            'control arm holds.',
        );
      }
    }
  }
  return problems.sort();
}

/* ------------------------------------------------------------------------- *
 * 7.5 — mirrored plays
 * ------------------------------------------------------------------------- */

/**
 * One mirrored play of an ablation pair.
 *
 * A *pair* is two of these sharing a `runSeed` with the retaining side swapped.
 * Both contribute to the win rate, which is what makes the side advantage
 * cancel: whatever side 0 gains structurally, it gains once for the retaining
 * arm and once for the ablating arm.
 */
export interface AblationPlay {
  readonly runSeed: number;
  /** Which agent slot retained the primitive in this play. */
  readonly retainingSide: 0 | 1;
  /** Whether the retaining side won it. */
  readonly retainingWon: boolean;
}

/**
 * Names every way a set of `(runSeed, side)` plays is not mirrored.
 *
 * The **one** implementation of that check in this package.
 * `prestigeAdvantage`'s `mirroredPairProblems` delegates here, because the two
 * metrics are both win rates over mirrored pairs with exactly the same failure
 * mode: an arm holding an odd number of plays, or two plays of one seed on the
 * same side, produces a win rate contaminated by whatever advantage side 0 has —
 * and it produces it quietly, as a number near 50% that drifts. Two
 * implementations would be two opinions about what "mirrored" means, and the one
 * that drifted would be the one nobody re-read.
 */
export function mirroredSideProblems(
  plays: readonly { readonly runSeed: number; readonly side: 0 | 1 }[],
): string[] {
  const problems: string[] = [];
  const bySeed = new Map<number, number[]>();
  for (const play of plays) {
    const sides = bySeed.get(play.runSeed) ?? [];
    sides.push(play.side);
    bySeed.set(play.runSeed, sides);
  }
  for (const seed of [...bySeed.keys()].sort((a, b) => a - b)) {
    const sides = (bySeed.get(seed) as number[]).slice().sort();
    if (sides.length !== 2 || sides[0] !== 0 || sides[1] !== 1) {
      problems.push(
        `run seed ${String(seed)} was played on sides [${sides.join(', ')}] rather than once on ` +
          'each. Mirroring is what cancels side bias; an unmirrored pair leaves it in the estimate.',
      );
    }
  }
  return problems;
}

/** {@link mirroredSideProblems}, read off the retaining side of ablation plays. */
export function ablationPairProblems(plays: readonly AblationPlay[]): string[] {
  return mirroredSideProblems(
    plays.map((play) => ({ runSeed: play.runSeed, side: play.retainingSide })),
  );
}

/* ------------------------------------------------------------------------- *
 * 7.6 — the Wilson score interval
 * ------------------------------------------------------------------------- */

/** *z* for a two-sided 95% interval. Pinned; it is part of the definition. */
export const WILSON_Z_95 = 1.959963984540054;

/** A Wilson score interval on a binomial proportion. */
export interface WilsonInterval {
  /** The observed proportion. Not the interval's centre — Wilson shrinks it. */
  readonly pointEstimate: number;
  readonly low: number;
  readonly high: number;
  readonly z: number;
  readonly trials: number;
  readonly successes: number;
}

/**
 * The Wilson score interval, and why it rather than the textbook one.
 *
 * The normal-approximation interval `p ± z·√(p(1−p)/n)` is the one everybody
 * learns and it fails exactly where an ablation result is most interesting: at
 * small *n*, and at proportions near 0 or 1. A primitive that wins 20 of 20
 * mirrored plays gets a Wald interval of width zero — `[1, 1]` — which reports
 * infinite confidence from twenty observations. Wilson gives `[0.839, 1]`,
 * which is a statement someone can act on.
 *
 * It is also the interval that makes `no-detected-effect` mean something: the
 * status is "the interval contains 0.5", and a Wald interval that collapses at
 * the extremes would declare a detected effect from a handful of plays.
 *
 * Zero trials returns the whole `[0, 1]` interval with a `null`-free shape and a
 * point estimate of 0.5 — the maximally uninformative answer, which is honest,
 * and which the caller must still not report as a measurement. See
 * {@link attributePrimitive}, which refuses to report at all with no plays.
 *
 * @throws RangeError when `successes` is outside `[0, trials]`, which is a
 * counting bug and would otherwise produce an interval outside `[0, 1]`.
 */
export function wilsonInterval(
  successes: number,
  trials: number,
  z: number = WILSON_Z_95,
): WilsonInterval {
  if (!Number.isInteger(successes) || !Number.isInteger(trials) || trials < 0) {
    throw new RangeError(
      `wilsonInterval takes integer counts; received ${String(successes)} of ${String(trials)}.`,
    );
  }
  if (successes < 0 || successes > trials) {
    throw new RangeError(
      `${String(successes)} successes out of ${String(trials)} trials. Every success is a trial; ` +
        'a count outside the range means two tallies came from different arms.',
    );
  }
  if (trials === 0) {
    return { pointEstimate: 0.5, low: 0, high: 1, z, trials: 0, successes: 0 };
  }

  const p = successes / trials;
  const zz = z * z;
  const denominator = 1 + zz / trials;
  const centre = (p + zz / (2 * trials)) / denominator;
  const halfWidth =
    (z / denominator) * Math.sqrt((p * (1 - p)) / trials + zz / (4 * trials * trials));
  return {
    pointEstimate: p,
    low: Math.max(0, centre - halfWidth),
    high: Math.min(1, centre + halfWidth),
    z,
    trials,
    successes,
  };
}

/** What an attribution concluded. */
export const ATTRIBUTION_STATUS = {
  /** The interval excludes 0.5: the primitive has a measured contribution. */
  attributed: 'attributed',
  /** The interval contains 0.5. Reported with the point estimate, per §7. */
  noDetectedEffect: 'no-detected-effect',
  /** Neutralizing this primitive removes the outcome being attributed. */
  notAttributable: 'not-attributable',
  /** The arms ran and produced no mirrored play. */
  noObservations: 'no-observations',
} as const;

/** Any status from {@link ATTRIBUTION_STATUS}. */
export type AttributionStatus = (typeof ATTRIBUTION_STATUS)[keyof typeof ATTRIBUTION_STATUS];

/** One primitive's ablation result. */
export interface PrimitiveAttribution {
  readonly primitiveId: string;
  readonly status: AttributionStatus;
  /** The retaining arm's win rate, or `null` when there is nothing to estimate. */
  readonly pointEstimate: number | null;
  readonly interval: WilsonInterval | null;
  /** Mirrored plays the estimate was computed from. Half as many pairs. */
  readonly plays: number;
  readonly pairs: number;
  /** Present whenever the status is not `attributed`. */
  readonly reason?: string;
}

/**
 * The attribution for one primitive, from its mirrored plays.
 *
 * Three refusals before an estimate, and each is a different claim:
 *
 * 1. **`not-attributable`** — the experiment cannot be run for this primitive.
 *    Checked first, because a `portal` arm that somehow produced plays would
 *    otherwise get a number, and that number would be a comparison against an
 *    arm that never fought.
 * 2. **`no-observations`** — the arms ran and produced nothing. Distinct from
 *    the above and from a measured 0.5.
 * 3. **A pairing failure throws**, rather than being reported. An unmirrored set
 *    of plays yields a win rate contaminated by side bias, and the contamination
 *    is invisible in the result — so it must not be possible to read one.
 *
 * `no-detected-effect` is *not* a refusal: §7 requires the point estimate to be
 * reported alongside it. "The interval contains 0.5" and "the estimate is
 * missing" are different findings, and collapsing them would hide a primitive
 * measured at 0.52 over eight plays behind the same words as one measured at
 * 0.5 over eight hundred.
 *
 * @throws Error when the plays are not properly mirrored.
 */
export function attributePrimitive(
  primitiveId: string,
  plays: readonly AblationPlay[],
  z: number = WILSON_Z_95,
): PrimitiveAttribution {
  const notAttributable = NOT_ATTRIBUTABLE_PRIMITIVES[primitiveId];
  if (notAttributable !== undefined) {
    return {
      primitiveId,
      status: ATTRIBUTION_STATUS.notAttributable,
      pointEstimate: null,
      interval: null,
      plays: plays.length,
      pairs: Math.floor(plays.length / 2),
      reason: notAttributable,
    };
  }

  if (plays.length === 0) {
    return {
      primitiveId,
      status: ATTRIBUTION_STATUS.noObservations,
      pointEstimate: null,
      interval: null,
      plays: 0,
      pairs: 0,
      reason:
        'the retaining and ablating arms produced no mirrored play. The arms were scheduled; ' +
        'nothing was resolved.',
    };
  }

  const problems = ablationPairProblems(plays);
  if (problems.length > 0) {
    throw new Error(
      `winRateByPrimitive for ${primitiveId} was handed plays that are not mirrored, so its win ` +
        `rate would carry whatever advantage one side has:\n  ${problems.join('\n  ')}`,
    );
  }

  let wins = 0;
  for (const play of plays) if (play.retainingWon) wins += 1;
  const interval = wilsonInterval(wins, plays.length, z);
  const containsHalf = interval.low <= 0.5 && interval.high >= 0.5;

  return {
    primitiveId,
    status: containsHalf ? ATTRIBUTION_STATUS.noDetectedEffect : ATTRIBUTION_STATUS.attributed,
    pointEstimate: interval.pointEstimate,
    interval,
    plays: plays.length,
    pairs: plays.length / 2,
    ...(containsHalf
      ? {
          reason:
            `the 95% Wilson interval [${interval.low.toFixed(4)}, ${interval.high.toFixed(4)}] ` +
            'contains 0.5, so the retaining arm and the ablating arm win equally often as far as ' +
            `${String(plays.length)} mirrored plays can tell. Reported with its point estimate ` +
            'rather than as a small contribution.',
        }
      : {}),
  };
}

/** An attribution as the `detail` block of a metric entry. */
export function attributionDetail(attribution: PrimitiveAttribution): MetricDetail {
  return {
    primitiveId: attribution.primitiveId,
    attribution: attribution.status,
    plays: attribution.plays,
    pairs: attribution.pairs,
    pointEstimate: attribution.pointEstimate,
    intervalLow: attribution.interval === null ? null : attribution.interval.low,
    intervalHigh: attribution.interval === null ? null : attribution.interval.high,
    intervalZ: attribution.interval === null ? null : attribution.interval.z,
    ...(attribution.reason === undefined ? {} : { reasonDetail: attribution.reason }),
  };
}

/** The metric entry an attribution becomes. Exported for the collector's use. */
export function attributionEntry(attribution: PrimitiveAttribution): MetricEntry {
  const detail = attributionDetail(attribution);
  if (attribution.status === ATTRIBUTION_STATUS.notAttributable) {
    return { status: 'unavailable', reason: UNAVAILABLE_REASON.notAttributable, detail };
  }
  if (attribution.status === ATTRIBUTION_STATUS.noObservations) {
    return { status: 'unavailable', reason: UNAVAILABLE_REASON.noObservations, detail };
  }
  return { status: 'measured', value: attribution.pointEstimate as number, detail };
}
