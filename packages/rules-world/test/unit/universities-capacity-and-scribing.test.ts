/*
 * Multiverse Mages — seats are refused rather than truncated, and scribes are
 * counted rather than created.
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

import { FP_ONE } from '@mm/sim-core';
import { ClampCounters } from '@mm/primitives';
import type { UniversityRecord } from '@mm/state';

import {
  AdmissionRefusals,
  BUILD_COMPLETE,
  SCRIBE_MONTHS_PER_SCRIBE,
  admitStudents,
  scribeRateMultiplier,
  scribingThroughput,
} from '../../src/index.js';

import { scribeRatePrimitive, speciesNamed } from './universities-fixtures.js';

const finished = (capacity: number): UniversityRecord => ({
  libraryId: 0,
  capacity,
  buildProgress: BUILD_COMPLETE,
});

const staffedWith = (
  scribeCount: number,
  scribeAffinity = FP_ONE,
  scribeRateBonuses: readonly number[] = [],
): Parameters<typeof scribingThroughput>[1] => ({
  scribeCount,
  scribeAffinity,
  scribeRate: scribeRatePrimitive(),
  scribeRateBonuses,
});

describe('capacity bounds concurrent students', () => {
  it('admits up to the free seats and refuses the rest', () => {
    expect(admitStudents(finished(10), 4, 10)).toEqual({ admitted: 6, refused: 4, hosted: 10 });
  });

  it('refuses everyone at full capacity, leaving the hosted count alone', () => {
    expect(admitStudents(finished(10), 10, 3)).toEqual({ admitted: 0, refused: 3, hosted: 10 });
  });

  it('frees seats the moment the hosted count falls', () => {
    // The graduation scenario: the caller subtracts graduates, and capacity is
    // available in the same tick because admission is a function of the hosted
    // count now rather than of a cumulative record.
    const record = finished(10);
    expect(admitStudents(record, 10, 1).admitted).toBe(0);
    expect(admitStudents(record, 7, 3).admitted).toBe(3);
  });

  it('admits nobody to an over-full university without going negative', () => {
    // Possible if a designed capacity is ever reduced. Not an error, and not a
    // licence to evict anyone either.
    expect(admitStudents(finished(4), 9, 5)).toEqual({ admitted: 0, refused: 5, hosted: 9 });
  });

  it('refuses a fractional or negative request rather than rounding it', () => {
    expect(() => admitStudents(finished(4), 0, 1.5)).toThrow(/non-negative integer/u);
    expect(() => admitStudents(finished(4), -1, 1)).toThrow(/non-negative integer/u);
  });
});

describe('refused demand is observable', () => {
  it('accumulates per university and in total', () => {
    const refusals = new AdmissionRefusals();
    refusals.record(7, admitStudents(finished(2), 2, 5).refused);
    refusals.record(7, admitStudents(finished(2), 2, 1).refused);
    refusals.record(3, admitStudents(finished(2), 0, 4).refused);

    expect(refusals.at(7)).toBe(6);
    expect(refusals.at(3)).toBe(2);
    expect(refusals.total).toBe(8);
  });

  it('records nothing for a university that turned nobody away', () => {
    const refusals = new AdmissionRefusals();
    refusals.record(7, admitStudents(finished(10), 0, 5).refused);
    expect(refusals.at(7)).toBe(0);
    expect(refusals.universities()).toEqual([]);
  });

  it('reports universities in ascending handle order, never in insertion order', () => {
    const refusals = new AdmissionRefusals();
    refusals.record(9, 1);
    refusals.record(2, 1);
    refusals.record(5, 1);
    expect(refusals.universities()).toEqual([2, 5, 9]);
  });
});

describe('scribing throughput comes from staff', () => {
  it('is zero with no scribe cohort, however finished the university', () => {
    expect(scribingThroughput(finished(40), staffedWith(0))).toBe(0);
  });

  it('is zero at an unfinished university, however well staffed', () => {
    const site: UniversityRecord = { libraryId: 0, capacity: 40, buildProgress: FP_ONE / 2 };
    expect(scribingThroughput(site, staffedWith(400))).toBe(0);
  });

  it('scales linearly with the scribe count', () => {
    const one = scribingThroughput(finished(40), staffedWith(1));
    const ten = scribingThroughput(finished(40), staffedWith(10));
    expect(one).toBe(SCRIBE_MONTHS_PER_SCRIBE);
    expect(ten).toBe(one * 10);
  });

  it('gives the better-scribing species more output from the same headcount', () => {
    const better = speciesNamed('dwarf');
    const worse = speciesNamed('orc');
    expect(better.scribeAffinity).toBeGreaterThan(worse.scribeAffinity);

    expect(scribingThroughput(finished(40), staffedWith(100, better.scribeAffinity))).toBeGreaterThan(
      scribingThroughput(finished(40), staffedWith(100, worse.scribeAffinity)),
    );
  });

  it('refuses a fractional scribe count', () => {
    expect(() => scribingThroughput(finished(40), staffedWith(2.5))).toThrow(
      /non-negative integer/u,
    );
  });
});

describe('the scribe-rate multiplier goes through the shared accumulator', () => {
  it('is (1 + Σ) and is capped once at the contracted value', () => {
    expect(scribeRateMultiplier(staffedWith(1))).toBe(FP_ONE);
    expect(scribeRateMultiplier(staffedWith(1, FP_ONE, [256, 256]))).toBe(FP_ONE + 512);

    const counters = new ClampCounters();
    const capped = scribeRateMultiplier({
      ...staffedWith(1, FP_ONE, [9000]),
      counters,
    });
    expect(capped).toBe(4096);
    expect(counters.count('scribe-rate')).toBe(1);
  });

  it('takes a library contribution in the same list as node bonuses', () => {
    // The `universities` spec's "contribution enters shared stacking": a
    // library's capital is one more entry, not a factor applied afterwards.
    const nodeOnly = scribingThroughput(finished(40), staffedWith(10, FP_ONE, [512]));
    const withLibrary = scribingThroughput(finished(40), staffedWith(10, FP_ONE, [512, 384]));
    const asOneSum = scribingThroughput(finished(40), staffedWith(10, FP_ONE, [896]));
    expect(withLibrary).toBeGreaterThan(nodeOnly);
    expect(withLibrary).toBe(asOneSum);
  });
});
