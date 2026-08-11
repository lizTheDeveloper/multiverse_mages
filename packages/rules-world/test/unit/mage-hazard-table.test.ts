/*
 * Multiverse Mages — the shared hazard table's shape.
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

import { HAZARD_TABLE, HAZARD_TABLE_TUNING_STATUS, hazardAt } from '@mm/rules-world';

describe('the hazard table is data, and marked untuned', () => {
  it('declares its tuning status machine-readably', () => {
    // release-plan.md forbids any claim these magnitudes are right before the
    // harness exists at 0.5.0. A marker a script can read is what makes that
    // enforceable rather than a promise in a comment.
    expect(HAZARD_TABLE_TUNING_STATUS).toBe('untuned');
  });

  it('transcribes the placeholder rows from the change design', () => {
    expect(HAZARD_TABLE.map((knot) => [knot.normalizedAge, knot.hazard])).toEqual([
      [0, 1024],
      [256, 1024],
      [512, 1536],
      [768, 4096],
      [1024, 12288],
      [1280, 49152],
      [1536, 196608],
    ]);
  });

  it('is strictly ascending in normalized age', () => {
    // The interpolation walks the array in order. An out-of-order knot produces
    // a silently non-monotonic curve — a mage who gets safer as she ages — in a
    // table that still reads plausibly top to bottom.
    for (let i = 1; i < HAZARD_TABLE.length; i += 1) {
      expect(HAZARD_TABLE[i]?.normalizedAge).toBeGreaterThan(
        HAZARD_TABLE[i - 1]?.normalizedAge ?? 0,
      );
    }
  });

  it('never returns zero, at any age', () => {
    // The property the extended-scale division downstream is protecting. If H
    // itself could be zero, no amount of precision in the division would keep a
    // hazard positive.
    for (let age = -4096; age <= 8192; age += 37) {
      expect(hazardAt(age)).toBeGreaterThan(0);
    }
  });
});

describe('H(normalizedAge) interpolates between the knots', () => {
  it('reproduces every knot exactly', () => {
    for (const knot of HAZARD_TABLE) {
      expect(hazardAt(knot.normalizedAge)).toBe(knot.hazard);
    }
  });

  it('is flat through young adulthood', () => {
    // "0 – 256, young adulthood, flat" is two knots, not one. Written as a
    // single knot at 0 it would slope the whole of youth toward midlife.
    expect(hazardAt(0)).toBe(1024);
    expect(hazardAt(128)).toBe(1024);
    expect(hazardAt(256)).toBe(1024);
  });

  it('interpolates linearly inside a segment', () => {
    // Halfway from (256, 1024) to (512, 1536) is 1280.
    expect(hazardAt(384)).toBe(1280);
    // Halfway from (768, 4096) to (1024, 12288) is 8192.
    expect(hazardAt(896)).toBe(8192);
  });

  it('is non-decreasing across the whole range', () => {
    let previous = hazardAt(-1024);
    for (let age = -1024; age <= 4096; age += 1) {
      const current = hazardAt(age);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it('clamps rather than extrapolating past the ends', () => {
    // Extrapolating past the last knot would take a mage at normalized age
    // fp(3072) to something near fp(1.4 million) — not more dead than
    // "effectively certain", and an invitation to overflow the division below.
    expect(hazardAt(-1)).toBe(1024);
    expect(hazardAt(-100000)).toBe(1024);
    expect(hazardAt(1536)).toBe(196608);
    expect(hazardAt(100000)).toBe(196608);
  });
});
