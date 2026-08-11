/*
 * Multiverse Mages — the harness side of ablation: paired seeds, mirrored
 * sides, the Wilson interval, and the two refusals. Tasks 7.4 through 7.8.
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

import type { AblationPlay, ArmTelemetry, SweepSpec } from '@mm/mc-harness';
import {
  ATTRIBUTION_STATUS,
  MECHANICS_AT_0_5_0,
  NOT_ATTRIBUTABLE_PRIMITIVES,
  WILSON_Z_95,
  ablationArms,
  ablationPairProblems,
  ablationProblems,
  armSpec,
  attributePrimitive,
  collectWinRateByPrimitive,
  isAttributable,
  pairedSeedProblems,
  scheduleAblation,
  validateAblationSweep,
  wilsonInterval,
} from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import { TOY_REGISTRIES, toySweep } from './fixtures.js';

/** A sweep shaped for one-sided ablation: two slots, so the sides can swap. */
function ablationSweep(primitives: readonly string[], overrides: Partial<SweepSpec> = {}): SweepSpec {
  return toySweep({
    agentPool: { strategies: ['toy-passive', 'toy-greedy'], assignment: 'mirrored', slots: 2 },
    ablation: { mode: 'one-sided', primitives },
    ...overrides,
  });
}

/** A build that has raids, so the collector gets past its first gate. */
const RAIDING = { ...MECHANICS_AT_0_5_0, raidEngagement: true };

/** An arm telemetry carrying nothing but what `winRateByPrimitive` reads. */
function ablationArmTelemetry(input: {
  readonly primitiveId: string | null;
  readonly plays?: readonly AblationPlay[];
  readonly raids?: boolean;
}): ArmTelemetry {
  return {
    armId: 'test-arm',
    mechanics: input.raids === false ? MECHANICS_AT_0_5_0 : RAIDING,
    runs: [],
    prestigeCarryForwardMax: null,
    ablatedPrimitiveId: input.primitiveId,
    ...(input.plays === undefined ? {} : { ablationPlays: input.plays }),
  };
}

/** `n` mirrored pairs, of which `retainingWins` plays the retaining side won. */
function plays(pairCount: number, retainingWins: number): AblationPlay[] {
  const built: AblationPlay[] = [];
  for (let pair = 0; pair < pairCount; pair += 1) {
    for (const side of [0, 1] as const) {
      built.push({ runSeed: 1000 + pair, retainingSide: side, retainingWon: false });
    }
  }
  for (let index = 0; index < retainingWins; index += 1) {
    built[index] = { ...(built[index] as AblationPlay), retainingWon: true };
  }
  return built;
}

describe('7.4 — one shared control arm and one ablation treatment per primitive', () => {
  it('gives a non-ablation sweep exactly one arm, the control', () => {
    const arms = ablationArms(toySweep());
    expect(arms).toHaveLength(1);
    expect(arms[0]?.armId).toBe('control');
    expect(arms[0]?.neutralizedPrimitiveId).toBeNull();
  });

  it('gives one control plus a mirrored pair of arms per primitive', () => {
    const arms = ablationArms(ablationSweep(['research-rate', 'ward']));
    expect(arms.map((arm) => arm.armId)).toEqual([
      'control',
      // Sorted by primitive id, not by the order the file listed them: an arm
      // id must be a function of the primitive *set*, or moving two lines in a
      // sweep file re-maps which directory holds which primitive.
      'ablate:research-rate@slot0',
      'ablate:research-rate@slot1',
      'ablate:ward@slot0',
      'ablate:ward@slot1',
    ]);
  });

  it('changes nothing that feeds the seed derivation when it builds an arm spec', () => {
    const base = ablationSweep(['ward']);
    const arm = ablationArms(base)[1];
    const derived = armSpec(base, arm as NonNullable<typeof arm>);
    expect(derived.sweepId).toBe(base.sweepId);
    expect(derived.rootSeed).toBe(base.rootSeed);
    expect(derived.factors).toEqual(base.factors);
    expect(derived.replicates).toBe(base.replicates);
    // Only the ablation block moves — which is why the configuration hash
    // differs and the seeds do not.
    expect(derived.ablation).toEqual({ mode: 'one-sided', primitives: ['ward'] });
  });

  it('derives identical run seeds and levels in every arm', () => {
    const schedules = scheduleAblation(ablationSweep(['research-rate', 'ward']), TOY_REGISTRIES);
    expect(schedules).toHaveLength(5);
    expect(pairedSeedProblems(schedules)).toEqual([]);

    // Positive control: the check must be capable of failing. Perturb one seed
    // and it names the arm, the coordinates and both numbers.
    const control = schedules[0] as (typeof schedules)[number];
    const arm = schedules[1] as (typeof schedules)[number];
    const [taskId, task] = [...arm.tasks][0] as [number, (typeof arm.tasks) extends Map<number, infer T> ? T : never];
    const tampered = new Map(arm.tasks);
    tampered.set(taskId, { ...task, runSeed: task.runSeed + 1 });
    const problems = pairedSeedProblems([control, { ...arm, tasks: tampered }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('must share seeds');
  });

  it('carries the ablated slot onto every task of an ablation arm and onto none of the control', () => {
    const schedules = scheduleAblation(ablationSweep(['ward']), TOY_REGISTRIES);
    for (const task of (schedules[0] as (typeof schedules)[number]).tasks.values()) {
      expect(task.ablatedSlotIndex).toBeUndefined();
      expect(task.ablatedPrimitives).toEqual([]);
    }
    for (const task of (schedules[1] as (typeof schedules)[number]).tasks.values()) {
      expect(task.ablatedSlotIndex).toBe(0);
      expect(task.ablatedPrimitives).toEqual(['ward']);
    }
    for (const task of (schedules[2] as (typeof schedules)[number]).tasks.values()) {
      expect(task.ablatedSlotIndex).toBe(1);
    }
  });
});

describe('7.5 — mirrored slot assignment', () => {
  it('refuses one-sided ablation on a pool with one slot, because there is nothing to swap', () => {
    const spec = ablationSweep(['ward'], {
      agentPool: { strategies: ['toy-passive'], assignment: 'fixed', slots: 1 },
    });
    const problems = ablationProblems(spec);
    expect(problems.some((problem) => problem.includes('nothing to swap'))).toBe(true);
    expect(() => ablationArms(spec)).toThrow(/no arm was built/);
  });

  it('names a seed played twice on the same side', () => {
    const unmirrored: AblationPlay[] = [
      { runSeed: 7, retainingSide: 0, retainingWon: true },
      { runSeed: 7, retainingSide: 0, retainingWon: false },
    ];
    expect(ablationPairProblems(unmirrored)[0]).toContain('run seed 7');
  });

  it('accepts a properly mirrored set', () => {
    expect(ablationPairProblems(plays(3, 2))).toEqual([]);
  });
});

describe('7.6 — the Wilson score interval and no-detected-effect', () => {
  it('is the Wilson interval and not the Wald one, which matters at the extremes', () => {
    const twenty = wilsonInterval(20, 20);
    // Wald would give [1, 1] here: infinite confidence from twenty plays.
    expect(twenty.low).toBeGreaterThan(0.8);
    expect(twenty.low).toBeLessThan(0.9);
    expect(twenty.high).toBe(1);
    expect(twenty.pointEstimate).toBe(1);
  });

  it('brackets the textbook value for a large balanced sample', () => {
    const interval = wilsonInterval(500, 1000);
    expect(interval.low).toBeCloseTo(0.5 - 0.031, 3);
    expect(interval.high).toBeCloseTo(0.5 + 0.031, 3);
    expect(interval.z).toBe(WILSON_Z_95);
  });

  it('refuses a success count that is not a subset of the trials', () => {
    expect(() => wilsonInterval(5, 4)).toThrow(/different arms/);
  });

  it('reports no-detected-effect with the point estimate, not instead of it', () => {
    const attribution = attributePrimitive('research-rate', plays(20, 21));
    expect(attribution.status).toBe(ATTRIBUTION_STATUS.noDetectedEffect);
    // §7: "reported as no-detected-effect alongside its point estimate rather
    // than as a small contribution". The estimate is present and is not 0.5.
    expect(attribution.pointEstimate).toBeCloseTo(21 / 40, 10);
    expect(attribution.pairs).toBe(20);
    expect(attribution.reason).toContain('contains 0.5');
  });

  it('reports exactly 0.5 as no-detected-effect', () => {
    const attribution = attributePrimitive('research-rate', plays(50, 50));
    expect(attribution.pointEstimate).toBe(0.5);
    expect(attribution.status).toBe(ATTRIBUTION_STATUS.noDetectedEffect);
  });

  it('attributes a contribution once the interval clears 0.5', () => {
    const attribution = attributePrimitive('research-rate', plays(100, 140));
    expect(attribution.status).toBe(ATTRIBUTION_STATUS.attributed);
    expect(attribution.interval?.low).toBeGreaterThan(0.5);
    // The sample size travels with the estimate, so a wide interval is
    // attributable to sample size rather than mysterious.
    expect(attribution.plays).toBe(200);
    expect(attribution.pairs).toBe(100);
  });

  it('throws rather than reporting a win rate over unmirrored plays', () => {
    expect(() =>
      attributePrimitive('research-rate', [
        { runSeed: 3, retainingSide: 0, retainingWon: true },
        { runSeed: 4, retainingSide: 0, retainingWon: true },
      ]),
    ).toThrow(/not mirrored/);
  });

  it('cancels a structural side advantage', () => {
    // Side 0 wins every play, whichever arm is on it. Mirrored, that is 20
    // retaining wins out of 40 — no detected effect, which is the truth.
    const built: AblationPlay[] = [];
    for (let pair = 0; pair < 20; pair += 1) {
      built.push({ runSeed: pair, retainingSide: 0, retainingWon: true });
      built.push({ runSeed: pair, retainingSide: 1, retainingWon: false });
    }
    const attribution = attributePrimitive('research-rate', built);
    expect(attribution.pointEstimate).toBe(0.5);
    expect(attribution.status).toBe(ATTRIBUTION_STATUS.noDetectedEffect);
  });
});

describe('7.7 — portal is not attributable', () => {
  it('names portal and nothing else', () => {
    expect(Object.keys(NOT_ATTRIBUTABLE_PRIMITIVES)).toEqual(['portal']);
    expect(isAttributable('portal')).toBe(false);
    expect(isAttributable('ward')).toBe(true);
  });

  it('reports not-attributable with its reason, even when plays exist', () => {
    const attribution = attributePrimitive('portal', plays(50, 45));
    expect(attribution.status).toBe(ATTRIBUTION_STATUS.notAttributable);
    expect(attribution.pointEstimate).toBeNull();
    expect(attribution.reason).toContain('removes raiding entirely');
  });

  it('reaches the metric entry as its own reason code', () => {
    const entry = collectWinRateByPrimitive(
      ablationArmTelemetry({ primitiveId: 'portal', plays: plays(4, 3) }),
    );
    expect(entry.status).toBe('unavailable');
    expect(entry.status === 'unavailable' ? entry.reason : '').toBe('not-attributable');
  });
});

describe('7.8 — pairwise ablation is refused with an explanation', () => {
  it('refuses a pairwise mode by name, before any arm is built', () => {
    const spec = ablationSweep(['ward'], {
      ablation: { mode: 'pairwise', primitives: ['ward', 'blink'] },
    } as unknown as Partial<SweepSpec>);
    const problems = ablationProblems(spec);
    expect(problems.some((problem) => problem.includes('105 pairs'))).toBe(true);
    expect(() => ablationArms(spec)).toThrow(/no arm was built/);
  });

  it('refuses a pairs block, whatever the mode says', () => {
    const spec = {
      ...ablationSweep(['ward']),
      ablation: { mode: 'one-sided', primitives: ['ward'], pairs: [['ward', 'blink']] },
    } as unknown as SweepSpec;
    expect(ablationProblems(spec).some((problem) => problem.includes('ablation.pairs'))).toBe(true);
  });

  it('rolls the ablation problems into the ordinary sweep validation', () => {
    const spec = ablationSweep(['ward'], {
      agentPool: { strategies: ['toy-passive'], assignment: 'fixed', slots: 1 },
    });
    const problems = validateAblationSweep(spec, TOY_REGISTRIES);
    expect(problems.some((problem) => problem.includes('nothing to swap'))).toBe(true);
  });

  it('names the same primitive twice as a duplicate rather than scheduling two identical arms', () => {
    const spec = ablationSweep(['ward', 'ward']);
    expect(ablationProblems(spec).some((problem) => problem.includes('twice'))).toBe(true);
  });
});

describe('the collector still answers mechanic-absent before anything else', () => {
  it('reports mechanic-absent on a build with no raids, whatever the arm holds', () => {
    const entry = collectWinRateByPrimitive(
      ablationArmTelemetry({ primitiveId: 'portal', plays: plays(4, 3), raids: false }),
    );
    expect(entry.status).toBe('unavailable');
    expect(entry.status === 'unavailable' ? entry.reason : '').toBe('mechanic-absent');
  });

  it('reports no-observations for a control arm on a raiding build', () => {
    const entry = collectWinRateByPrimitive(ablationArmTelemetry({ primitiveId: null }));
    expect(entry.status).toBe('unavailable');
    expect(entry.status === 'unavailable' ? entry.reason : '').toBe('no-observations');
  });

  it('measures a win rate on a raiding build with mirrored plays', () => {
    const entry = collectWinRateByPrimitive(
      ablationArmTelemetry({ primitiveId: 'research-rate', plays: plays(100, 140) }),
    );
    expect(entry.status).toBe('measured');
    expect(entry.status === 'measured' ? entry.value : 0).toBeCloseTo(0.7, 10);
    expect(entry.detail?.['attribution']).toBe('attributed');
  });
});
