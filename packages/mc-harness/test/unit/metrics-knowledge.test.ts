/*
 * Multiverse Mages — the knowledge census, the survival estimator, and the two
 * knowledge lifetime metrics. Tasks 6.4, 6.5 and 6.6.
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

import { describe, expect, it } from 'vitest';

import {
  KNOWLEDGE_CENSUS_INTERVAL_TICKS,
  KnowledgeCensus,
  censusProblems,
  censusTicks,
  collectKnowledgeHalfLife,
  collectLibraryDependence,
  isCensusTick,
  kaplanMeier,
  survivalObservationsFrom,
  survivalQuantile,
} from '@mm/mc-harness';

import { sample, telemetry } from './metrics-fixtures.js';

describe('the census interval, pinned at 12 world ticks from tick 0 (task 6.4)', () => {
  it('is one world year', () => {
    expect(KNOWLEDGE_CENSUS_INTERVAL_TICKS).toBe(12);
  });

  it('samples tick 0 — the cohort before anything has happened', () => {
    expect(isCensusTick(0)).toBe(true);
    expect(censusTicks(0)).toEqual([0]);
  });

  it('samples every twelfth tick and nothing between', () => {
    expect(censusTicks(30)).toEqual([0, 12, 24]);
    for (let tick = 1; tick < 12; tick += 1) expect(isCensusTick(tick)).toBe(false);
  });

  it('includes a final tick that lands on the lattice', () => {
    // A run that stopped at 24 was at 24, and the census there observes whatever
    // the final step destroyed. Dropping it loses the run's last observation.
    expect(censusTicks(24)).toEqual([0, 12, 24]);
  });

  it('records only on census ticks, and says whether it recorded', () => {
    const census = new KnowledgeCensus();
    expect(census.offer(0, [1, 2], [2])).toBe(true);
    expect(census.offer(5, [1, 2], [])).toBe(false);
    expect(census.offer(12, [1], [1])).toBe(true);
    expect(census.samples().map((entry) => entry.worldTick)).toEqual([0, 12]);
  });

  it('refuses a repeated or out-of-order census tick', () => {
    const census = new KnowledgeCensus();
    census.offer(12, [1], []);
    expect(() => census.offer(12, [1], [])).toThrow(/double-counts/);
    expect(() => census.offer(0, [1], [])).toThrow(/double-counts|negative/);
  });

  it('copies the lists it is handed', () => {
    // The executor reuses its scratch arrays across ticks. A census holding a
    // reference would report the final tick's contents at every tick.
    const census = new KnowledgeCensus();
    const scratch = [1, 2, 3];
    census.offer(0, scratch, []);
    scratch.length = 0;
    expect(census.samples()[0]?.existingNodeIds).toEqual([1, 2, 3]);
  });

  it('names the problems in a census it did not build', () => {
    expect(censusProblems([sample(0, [1], []), sample(7, [1], [])]).join(' ')).toContain(
      'not a multiple of 12',
    );
    expect(censusProblems([sample(0, [1], [2])]).join(' ')).toContain('not listed as existing');
    expect(censusProblems([sample(0, [1, 1], [])]).join(' ')).toContain('lists a node twice');
    expect(censusProblems([sample(0, [1], [1]), sample(12, [1], [1])])).toEqual([]);
  });
});

describe('the Kaplan–Meier estimator (task 6.5)', () => {
  it('is 1 everywhere when nothing was ever lost', () => {
    const curve = kaplanMeier([
      { elapsed: 100, event: false },
      { elapsed: 100, event: false },
    ]);
    expect(curve.steps).toEqual([]);
    expect(curve.lowestSurvival).toBe(1);
    expect(survivalQuantile(curve, 0.5)).toBeNull();
  });

  it('reproduces the textbook product-limit calculation', () => {
    // Four subjects: deaths at 10 and 30, censorings at 20 and 40.
    //   t=10: at risk 4, 1 death → S = 0.75
    //   t=30: at risk 2 (the 20-censoring has left), 1 death → S = 0.375
    const curve = kaplanMeier([
      { elapsed: 10, event: true },
      { elapsed: 20, event: false },
      { elapsed: 30, event: true },
      { elapsed: 40, event: false },
    ]);
    expect(curve.steps.map((step) => [step.time, step.atRisk, step.events])).toEqual([
      [10, 4, 1],
      [30, 2, 1],
    ]);
    expect(curve.steps[0]?.survival).toBeCloseTo(0.75, 12);
    expect(curve.steps[1]?.survival).toBeCloseTo(0.375, 12);
    expect(survivalQuantile(curve, 0.5)).toBe(30);
  });

  it('applies tied deaths in one step, so listing order cannot matter', () => {
    const forward = kaplanMeier([
      { elapsed: 10, event: true },
      { elapsed: 10, event: true },
      { elapsed: 50, event: false },
    ]);
    const reverse = kaplanMeier([
      { elapsed: 50, event: false },
      { elapsed: 10, event: true },
      { elapsed: 10, event: true },
    ]);
    expect(forward.steps).toEqual(reverse.steps);
    // Two of three at risk die at once: S = 1 − 2/3.
    expect(forward.steps[0]?.survival).toBeCloseTo(1 / 3, 12);
  });

  it('counts a censored subject in the risk set until it leaves', () => {
    // Censoring is not a death: the subject censored at 20 is at risk at 10.
    const curve = kaplanMeier([
      { elapsed: 10, event: true },
      { elapsed: 20, event: false },
    ]);
    expect(curve.steps[0]?.atRisk).toBe(2);
    expect(curve.steps[0]?.survival).toBeCloseTo(0.5, 12);
  });

  it('refuses a negative elapsed time', () => {
    expect(() => kaplanMeier([{ elapsed: -1, event: true }])).toThrow(/non-negative/);
  });
});

describe('cohorts are built from existence, and rediscovery re-enters them', () => {
  it('records a loss for every cohort a node belonged to before it was lost', () => {
    // Node 1 exists at 0 and 12, gone at 24. Two cohorts, two losses.
    const observations = survivalObservationsFrom([
      sample(0, [1]),
      sample(12, [1]),
      sample(24, []),
    ]);
    expect(observations).toEqual([
      { elapsed: 24, event: true },
      { elapsed: 12, event: true },
    ]);
  });

  it('lets a rediscovered node re-enter cohorts sampled after it returns', () => {
    // The capability spec's scenario, on the census lattice: lost by tick 24,
    // back by tick 48. Cohorts at 0 and 12 record losses; the cohort at 48
    // records a fresh subject, right-censored at the end.
    const observations = survivalObservationsFrom([
      sample(0, [1]),
      sample(12, [1]),
      sample(24, []),
      sample(36, []),
      sample(48, [1]),
      sample(60, [1]),
    ]);
    expect(observations).toEqual([
      { elapsed: 24, event: true },
      { elapsed: 12, event: true },
      { elapsed: 12, event: false },
      { elapsed: 0, event: false },
    ]);
  });

  it('right-censors survivors at run end rather than counting them as losses', () => {
    const observations = survivalObservationsFrom([sample(0, [1, 2]), sample(12, [1, 2])]);
    expect(observations.every((observation) => !observation.event)).toBe(true);
    expect(observations).toHaveLength(4);
  });
});

describe('knowledgeHalfLife (task 6.5)', () => {
  it('reports the first census-lattice time at which pooled survival reaches 0.5', () => {
    // Four nodes at tick 0; three gone by tick 12, one surviving to the end.
    //   observations: events at 12, 12, 12; censorings at 24 (cohort 0),
    //                 12 (cohort 12) and 0 (cohort 24)
    //   t=12: at risk 5 (everything observed for ≥ 12), 3 deaths → S = 0.4
    const entry = collectKnowledgeHalfLife(
      telemetry({
        ticksRun: 24,
        census: [sample(0, [1, 2, 3, 4]), sample(12, [4]), sample(24, [4])],
      }),
    );
    expect(entry.status).toBe('measured');
    if (entry.status !== 'measured') throw new Error('unreachable');
    expect(entry.value).toBe(12);
    expect(entry.detail?.['losses']).toBe(3);
    expect(entry.detail?.['rightCensored']).toBe(3);
  });

  it('pools later cohorts as censored survivors, which is what pooling costs', () => {
    // Half the tick-0 cohort is lost by tick 12, and yet the pooled curve does
    // *not* reach 0.5: the cohorts opened at 12 and 24 contribute two more
    // still-living subjects each time. This is inherent to the definition the
    // capability spec pins — cohorts are pooled, not averaged — and it biases
    // the estimate upward in a run whose knowledge is stable at the end. It is
    // asserted rather than discovered so nobody later reads it as a bug.
    const entry = collectKnowledgeHalfLife(
      telemetry({
        ticksRun: 24,
        census: [sample(0, [1, 2, 3, 4]), sample(12, [3, 4]), sample(24, [3, 4])],
      }),
    );
    expect(entry).toMatchObject({ status: 'unavailable', reason: 'censored' });
    expect(entry.detail?.['lowestSurvival']).toBeCloseTo(2 / 3, 12);
  });

  it('is always a multiple of the census interval, because losses are seen at census resolution', () => {
    const entry = collectKnowledgeHalfLife(
      telemetry({
        ticksRun: 36,
        census: [sample(0, [1, 2, 3, 4]), sample(12, [4]), sample(24, [4]), sample(36, [4])],
      }),
    );
    if (entry.status !== 'measured') throw new Error('expected a measurement');
    expect(entry.value % KNOWLEDGE_CENSUS_INTERVAL_TICKS).toBe(0);
  });

  it('reports censored with a lower bound when survival never reaches 0.5', () => {
    // Ten nodes, one lost. The curve bottoms out well above 0.5.
    const entry = collectKnowledgeHalfLife(
      telemetry({
        ticksRun: 24,
        census: [
          sample(0, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
          sample(12, [2, 3, 4, 5, 6, 7, 8, 9, 10]),
          sample(24, [2, 3, 4, 5, 6, 7, 8, 9, 10]),
        ],
      }),
    );
    expect(entry).toMatchObject({ status: 'unavailable', reason: 'censored' });
    expect(entry.detail?.['lowerBoundTicks']).toBe(24);
    expect(entry.detail?.['lowestSurvival']).toBeGreaterThan(0.5);
  });

  it('does not report the run length as the half-life', () => {
    // The tempting shortcut. A censored run must not produce a number that
    // reads as a measurement, least of all one equal to how long we looked.
    const entry = collectKnowledgeHalfLife(
      telemetry({ ticksRun: 1200, census: [sample(0, [1, 2, 3]), sample(12, [1, 2, 3])] }),
    );
    expect(entry.status).toBe('unavailable');
  });

  it('reports no-observations for a universe that never held a node', () => {
    const entry = collectKnowledgeHalfLife(
      telemetry({ ticksRun: 24, census: [sample(0, []), sample(12, []), sample(24, [])] }),
    );
    expect(entry).toMatchObject({ status: 'unavailable', reason: 'no-observations' });
  });

  it('reports no-observations when no census was taken at all', () => {
    expect(collectKnowledgeHalfLife(telemetry({ census: [] }))).toMatchObject({
      status: 'unavailable',
      reason: 'no-observations',
    });
  });
});

describe('libraryDependence (task 6.6)', () => {
  it('is the mean over census samples, with the maximum and the final sample', () => {
    // Fractions 1/2, 1/4, 0 → mean 0.25, max 0.5, final 0.
    const entry = collectLibraryDependence(
      telemetry({
        census: [
          sample(0, [1, 2], [1]),
          sample(12, [1, 2, 3, 4], [4]),
          sample(24, [1, 2, 3, 4], []),
        ],
      }),
    );
    if (entry.status !== 'measured') throw new Error('expected a measurement');
    expect(entry.value).toBeCloseTo(0.25, 12);
    expect(entry.detail?.['maximum']).toBeCloseTo(0.5, 12);
    expect(entry.detail?.['final']).toBe(0);
    expect(entry.detail?.['samples']).toBe(3);
  });

  it('excludes empty-universe samples and records how many it excluded', () => {
    const entry = collectLibraryDependence(
      telemetry({ census: [sample(0, [], []), sample(12, [1, 2], [1]), sample(24, [], [])] }),
    );
    if (entry.status !== 'measured') throw new Error('expected a measurement');
    // 0.5 over one sample, not 0.5/3 over three.
    expect(entry.value).toBeCloseTo(0.5, 12);
    expect(entry.detail?.['samples']).toBe(1);
    expect(entry.detail?.['excludedEmptySamples']).toBe(2);
  });

  it('reports no-observations rather than dividing by zero on an empty universe', () => {
    const entry = collectLibraryDependence(telemetry({ census: [sample(0, []), sample(12, [])] }));
    expect(entry).toMatchObject({ status: 'unavailable', reason: 'no-observations' });
    expect(entry.detail?.['excludedEmptySamples']).toBe(2);
  });

  it('reports 1 when every node hangs on a single copy', () => {
    const entry = collectLibraryDependence(
      telemetry({ census: [sample(0, [1, 2, 3], [1, 2, 3])] }),
    );
    if (entry.status !== 'measured') throw new Error('expected a measurement');
    expect(entry.value).toBe(1);
  });
});
