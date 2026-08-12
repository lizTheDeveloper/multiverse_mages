/*
 * Multiverse Mages — timeToTierBySpecies over all 42 pairs, with censoring.
 * Task 6.7.
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

import type { TierPairOutcome } from '@mm/mc-harness';
import {
  TIER_MAX,
  TIER_MIN,
  TIER_PAIR_COUNT,
  aggregateTierPairs,
  collectTimeToTierBySpecies,
  tierPairOutcomes,
} from '@mm/mc-harness';

import { SPECIES_IDS, telemetry } from './metrics-fixtures.js';

describe('all 42 pairs are present, whatever the run did (task 6.7)', () => {
  it('spans 6 species and 7 tiers', () => {
    expect(TIER_MIN).toBe(1);
    expect(TIER_MAX).toBe(7);
    expect(TIER_PAIR_COUNT).toBe(42);
    expect(SPECIES_IDS.length * (TIER_MAX - TIER_MIN + 1)).toBe(TIER_PAIR_COUNT);
  });

  it('reports every pair even when the run used only the 12 v1 cells', () => {
    // The v1 subset tops out below tier 7; the unreachable pairs are censored,
    // not omitted. A baseline compares 42 keys and always will.
    const outcomes = tierPairOutcomes(
      telemetry({
        ticksRun: 2400,
        tierFirstReached: [{ speciesId: 'human', tier: 1, worldTick: 36 }],
      }),
    );
    expect(outcomes).toHaveLength(42);
    expect(outcomes.filter((outcome) => outcome.worldTick !== null)).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.censoredAt === 2400)).toHaveLength(41);
  });

  it('censors at the termination tick and does not record it as a reach', () => {
    // "Censoring is not a measurement." A censored pair has no worldTick at all,
    // so no fold anywhere can pick up 2400 and treat it as a time-to-tier.
    const outcomes = tierPairOutcomes(telemetry({ ticksRun: 2400 }));
    for (const outcome of outcomes) {
      expect(outcome.worldTick).toBeNull();
      expect(outcome.censoredAt).toBe(2400);
    }
  });

  it('takes the earliest reach when the executor reports several', () => {
    const outcomes = tierPairOutcomes(
      telemetry({
        tierFirstReached: [
          { speciesId: 'elf', tier: 3, worldTick: 300 },
          { speciesId: 'elf', tier: 3, worldTick: 120 },
        ],
      }),
    );
    const pair = outcomes.find((outcome) => outcome.speciesId === 'elf' && outcome.tier === 3);
    expect(pair?.worldTick).toBe(120);
  });

  it('fails the run when the content does not make 42 pairs', () => {
    // A five-species content set would silently report 35 pairs, and the gate
    // would read the seven missing ones as newly censored rather than as the
    // content change they are.
    expect(() => tierPairOutcomes(telemetry({ speciesIds: ['human', 'elf'] }))).toThrow(
      /pin 42/,
    );
  });

  it('fails the run on a tier outside 1–7', () => {
    expect(() =>
      tierPairOutcomes(
        telemetry({ tierFirstReached: [{ speciesId: 'human', tier: 8, worldTick: 10 }] }),
      ),
    ).toThrow(/outside 1–7/);
  });
});

describe('the per-run entry', () => {
  it('is the median over reached pairs, with censored pairs excluded from it', () => {
    const entry = collectTimeToTierBySpecies(
      telemetry({
        ticksRun: 2400,
        tierFirstReached: [
          { speciesId: 'human', tier: 1, worldTick: 12 },
          { speciesId: 'human', tier: 2, worldTick: 60 },
          { speciesId: 'elf', tier: 1, worldTick: 120 },
        ],
      }),
    );
    if (entry.status !== 'measured') throw new Error('expected a measurement');
    // Nearest-rank median of [12, 60, 120] is 60. The 39 censored pairs, all of
    // which would be 2400, do not drag it up.
    expect(entry.value).toBe(60);
    expect(entry.detail?.['reachedPairs']).toBe(3);
    expect(entry.detail?.['censoredPairs']).toBe(39);
  });

  it('carries the whole 42-pair table so a moved median is diagnosable', () => {
    const entry = collectTimeToTierBySpecies(
      telemetry({ tierFirstReached: [{ speciesId: 'orc', tier: 7, worldTick: 900 }] }),
    );
    const pairs = entry.detail?.['pairs'] as readonly { speciesId: string; tier: number }[];
    expect(pairs).toHaveLength(42);
    expect(pairs.filter((pair) => pair.speciesId === 'orc')).toHaveLength(7);
  });

  it('reports censored, not no-observations, when the run reached nothing', () => {
    // Something was watched and it did not happen. That is a different claim
    // from "there was nothing to watch", and the reason code is where the
    // difference survives into the record.
    const entry = collectTimeToTierBySpecies(telemetry({ ticksRun: 2400 }));
    expect(entry).toMatchObject({ status: 'unavailable', reason: 'censored' });
    expect(entry.detail?.['censoredAtTick']).toBe(2400);
  });
});

describe('the arm aggregate and the heavy-censoring rule', () => {
  function run(reached: readonly { speciesId: string; tier: number; worldTick: number }[]): TierPairOutcome[] {
    return tierPairOutcomes(
      telemetry({ ticksRun: 2400, tierFirstReached: reached.map((entry) => ({ ...entry })) }),
    );
  }

  it('takes the median across the runs that reached a pair', () => {
    const runs = [
      run([{ speciesId: 'human', tier: 1, worldTick: 12 }]),
      run([{ speciesId: 'human', tier: 1, worldTick: 24 }]),
      run([{ speciesId: 'human', tier: 1, worldTick: 36 }]),
    ];
    const aggregate = aggregateTierPairs(runs).find(
      (entry) => entry.speciesId === 'human' && entry.tier === 1,
    );
    expect(aggregate).toMatchObject({ status: 'measured', medianWorldTick: 24, censoredRuns: 0 });
  });

  it('reports censoring rather than a median when more than half the runs censor', () => {
    // Three of five runs never get there. A median over the two that did is a
    // median of the runs that happened to make it — and it *falls* as the game
    // gets harder, because the survivors are the fastest.
    const runs = [
      run([{ speciesId: 'dwarf', tier: 5, worldTick: 100 }]),
      run([{ speciesId: 'dwarf', tier: 5, worldTick: 200 }]),
      run([]),
      run([]),
      run([]),
    ];
    const aggregate = aggregateTierPairs(runs).find(
      (entry) => entry.speciesId === 'dwarf' && entry.tier === 5,
    );
    expect(aggregate?.status).toBe('censored');
    expect(aggregate?.medianWorldTick).toBeNull();
    expect(aggregate?.censoringFraction).toBeCloseTo(0.6, 12);
    expect(aggregate?.reachedRuns).toBe(2);
  });

  it('reports a median at exactly half censored, which is not "more than half"', () => {
    const runs = [
      run([{ speciesId: 'gnome', tier: 2, worldTick: 48 }]),
      run([{ speciesId: 'gnome', tier: 2, worldTick: 96 }]),
      run([]),
      run([]),
    ];
    const aggregate = aggregateTierPairs(runs).find(
      (entry) => entry.speciesId === 'gnome' && entry.tier === 2,
    );
    expect(aggregate?.status).toBe('measured');
    expect(aggregate?.censoringFraction).toBeCloseTo(0.5, 12);
  });

  it('covers all 42 pairs in the aggregate too', () => {
    expect(aggregateTierPairs([run([])])).toHaveLength(42);
  });
});
