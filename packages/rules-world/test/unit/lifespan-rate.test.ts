/*
 * Multiverse Mages — dragons are not immortal, and the arithmetic proves it.
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
 * `docs/design/contracts.md` §3 demands this file by name: *"Any rate of the
 * form `X / lifespanMonths` computes at extended scale before narrowing, and a
 * test must assert a non-zero draconic hazard specifically."*
 *
 * The word *specifically* is the whole instruction. A test that asserted "the
 * rate is positive" for a human would pass against the defective arithmetic,
 * because a human lifespan of 960 months does not floor `fp(1024) / lifespan`
 * to zero — only the long-lived species do, and draconic is the longest by a
 * factor of nineteen. So the assertions below name draconic, read its lifespan
 * out of shipped content rather than restating it, and pin the failure
 * alongside the fix: `naivePerLifespanRate` returns 0 for a dragon, and
 * `perLifespanRate` does not.
 *
 * Keeping both halves in one test is deliberate. "The right answer is non-zero"
 * is satisfied by any number of implementations that are right for unrelated
 * reasons, and it stays green if somebody later widens the hazard table instead
 * of the division. Asserting that the naive form is *zero on the same inputs*
 * is what ties this test to the defect it was written for — and if a future
 * change makes the naive form non-zero too, this test fails and asks why,
 * which is the correct outcome for a tripwire whose ground has moved.
 *
 * The hazard *table* is not here. `mages-and-species` task 4.6 authors it as
 * data; this file uses the smallest numerator that table can hold, because the
 * smallest numerator is the one that floors first.
 */

import { describe, expect, it } from 'vitest';

import { loadContent, shippedContentSource } from '@mm/content';
import { FP_ONE } from '@mm/sim-core';

import {
  LIFESPAN_RATE_ONE,
  naivePerLifespanRate,
  narrowToFixed,
  perLifespanRate,
} from '@mm/rules-world';

import { speciesById } from './species-fixtures.js';

const registry = loadContent(shippedContentSource());

/**
 * The flat young-adulthood entry of the placeholder hazard table in
 * `openspec/changes/mages-and-species/design.md` — `H = fp(1024)` — which is
 * its *smallest* value and therefore the first to floor away. Untuned, like
 * every magnitude in this change; the assertions below depend on it being small
 * rather than on it being right.
 */
const SMALLEST_HAZARD_NUMERATOR = FP_ONE;

describe('a draconic hazard is strictly non-zero', () => {
  it('gives the longest-lived species a positive per-tick hazard', () => {
    const draconic = speciesById(registry, 'draconic');
    expect(draconic.lifespanMonths).toBe(18_000); // ~1500 years; the worst case in shipped content

    const rate = perLifespanRate(SMALLEST_HAZARD_NUMERATOR, draconic.lifespanMonths);
    expect(rate).toBeGreaterThan(0);
  });

  it('shows the naive fp division producing exactly the immortality bug', () => {
    const draconic = speciesById(registry, 'draconic');
    expect(naivePerLifespanRate(SMALLEST_HAZARD_NUMERATOR, draconic.lifespanMonths)).toBe(0);
  });

  it('leaves no shipped species with a zero hazard', () => {
    for (const entry of registry.species) {
      const rate = perLifespanRate(SMALLEST_HAZARD_NUMERATOR, entry.record.lifespanMonths);
      expect(rate, `${entry.record.id} has a zero per-tick hazard`).toBeGreaterThan(0);
    }
  });

  it('identifies exactly which species the naive form would make immortal', () => {
    // Recorded rather than asserted as a count, because the interesting fact is
    // *which* species: it is not only the dragon. Every species whose lifespan
    // exceeds fp(1024) months — that is, all four of the long-lived ones —
    // rounds to zero at fp scale, so a fix aimed only at draconic would leave
    // elves, dwarves and gnomes immortal and pass a draconic-only test.
    const immortalUnderNaive = registry.species
      .filter((entry) => naivePerLifespanRate(SMALLEST_HAZARD_NUMERATOR, entry.record.lifespanMonths) === 0)
      .map((entry) => entry.record.id)
      .sort();
    expect(immortalUnderNaive).toEqual(['draconic', 'dwarf', 'elf', 'gnome']);
  });

  it('narrows a draconic rate back to zero, which is why nothing narrows first', () => {
    // The trap has a second door: compute at extended scale, then helpfully
    // convert to fp before comparing against a draw. That reintroduces the
    // floor while appearing to use the safe helper, and this is the assertion
    // that says so out loud.
    const draconic = speciesById(registry, 'draconic');
    const rate = perLifespanRate(SMALLEST_HAZARD_NUMERATOR, draconic.lifespanMonths);
    expect(rate).toBeGreaterThan(0);
    expect(narrowToFixed(rate)).toBe(0);
  });
});

describe('the extended-scale division behaves like a rate', () => {
  it('orders species by lifespan, longest-lived lowest', () => {
    const byLifespan = [...registry.species]
      .map((entry) => entry.record)
      .sort((a, b) => a.lifespanMonths - b.lifespanMonths);
    let previous = Number.POSITIVE_INFINITY;
    for (const species of byLifespan) {
      const rate = perLifespanRate(SMALLEST_HAZARD_NUMERATOR, species.lifespanMonths);
      expect(rate).toBeLessThanOrEqual(previous);
      previous = rate;
    }
  });

  it('scales with the hazard numerator', () => {
    const draconic = speciesById(registry, 'draconic');
    const single = perLifespanRate(SMALLEST_HAZARD_NUMERATOR, draconic.lifespanMonths);
    const doubled = perLifespanRate(SMALLEST_HAZARD_NUMERATOR * 2, draconic.lifespanMonths);
    expect(doubled).toBeGreaterThan(single);
  });

  it('reaches certainty when the numerator reaches the lifespan', () => {
    // A sanity anchor on the units: H = fp(1) per month over a one-month
    // lifespan is the whole range, so the rate is the draw denominator itself.
    expect(perLifespanRate(FP_ONE, 1)).toBe(LIFESPAN_RATE_ONE);
  });

  it('refuses inputs it cannot compute exactly rather than saturating', () => {
    expect(() => perLifespanRate(FP_ONE, 0)).toThrow(/positive integer lifespanMonths/u);
    expect(() => perLifespanRate(FP_ONE, -12)).toThrow(/positive integer lifespanMonths/u);
    expect(() => perLifespanRate(-1, 960)).toThrow(/non-negative fixed-point numerator/u);
    expect(() => perLifespanRate(Number.MAX_SAFE_INTEGER, 960)).toThrow(/overflows extended scale/u);
  });
});
