/*
 * Multiverse Mages — lifespan variance and lifespan effects are derived, not
 * stored.
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

import { fromInt } from '@mm/sim-core';
import { ClampCounters } from '@mm/primitives';
import {
  MIN_EFFECTIVE_LIFESPAN_MONTHS,
  effectiveLifespan,
  lifespanVarianceOffsetMonths,
  perTickHazard,
} from '@mm/rules-world';

import { handleOf, lifespanPrimitive, shippedRegistry } from './mage-fixtures.js';
import { speciesById } from './species-fixtures.js';

const registry = shippedRegistry();
const primitive = lifespanPrimitive(registry);
const draconic = speciesById(registry, 'draconic');
const human = speciesById(registry, 'human');

const ROOT_SEED = 0xabcdef;

const lifespanOf = (
  species: typeof human,
  mage: number,
  birthTick: number,
  effectMagnitudes: readonly number[] = [],
  counters?: ClampCounters,
): ReturnType<typeof effectiveLifespan> =>
  effectiveLifespan({
    species,
    mage,
    birthTick,
    rootSeed: ROOT_SEED,
    lifespanPrimitive: primitive,
    effectMagnitudes,
    ...(counters === undefined ? {} : { counters }),
  });

describe('lifespan variance is derived and stable', () => {
  it('produces the same value at two different world ticks', () => {
    // The spec scenario. Recomputation must not be a re-roll: a stream is
    // re-derived per tick, so a variance implemented as a draw would give a
    // different answer every month and would have had to be stored.
    const mage = handleOf(5, 1);
    const first = lifespanVarianceOffsetMonths(ROOT_SEED, mage, 300, draconic.lifespanVarianceMonths);
    const second = lifespanVarianceOffsetMonths(
      ROOT_SEED,
      mage,
      300,
      draconic.lifespanVarianceMonths,
    );
    expect(second).toBe(first);
  });

  it('stays inside the species bound', () => {
    const bound = draconic.lifespanVarianceMonths;
    for (let slot = 1; slot <= 512; slot += 1) {
      const offset = lifespanVarianceOffsetMonths(ROOT_SEED, handleOf(slot, 1), 0, bound);
      expect(offset).toBeGreaterThanOrEqual(-bound);
      expect(offset).toBeLessThanOrEqual(bound);
    }
  });

  it('actually varies, rather than returning a constant', () => {
    const seen = new Set<number>();
    for (let slot = 1; slot <= 256; slot += 1) {
      seen.add(lifespanVarianceOffsetMonths(ROOT_SEED, handleOf(slot, 1), 0, 120));
    }
    expect(seen.size).toBeGreaterThan(64);
  });

  it('does not alias when a slot is reused, because the generation differs', () => {
    // The spec scenario. Two mages in one slot at two generations derive their
    // variance independently — the dead mage's luck does not transfer.
    const first = lifespanVarianceOffsetMonths(ROOT_SEED, handleOf(9, 1), 0, 2400);
    const second = lifespanVarianceOffsetMonths(ROOT_SEED, handleOf(9, 2), 0, 2400);
    expect(second).not.toBe(first);
  });

  it('separates two universes with different root seeds', () => {
    const mage = handleOf(9, 1);
    expect(lifespanVarianceOffsetMonths(1, mage, 0, 2400)).not.toBe(
      lifespanVarianceOffsetMonths(2, mage, 0, 2400),
    );
  });

  it('yields zero for a species with no declared variance', () => {
    expect(lifespanVarianceOffsetMonths(ROOT_SEED, handleOf(9, 1), 0, 0)).toBe(0);
  });

  it('refuses a negative bound, which would invert the interval', () => {
    expect(() => lifespanVarianceOffsetMonths(ROOT_SEED, handleOf(9, 1), 0, -1)).toThrow(
      /non-negative/u,
    );
  });
});

describe('the lifespan primitive is recomputed, capped, and counted', () => {
  it('adds nothing when no effect is active', () => {
    const computed = lifespanOf(human, handleOf(2, 1), 0);
    expect(computed.bonusMonths).toBe(0);
    expect(computed.months).toBe(human.lifespanMonths + computed.varianceMonths);
    expect(computed.clamped).toBe(false);
  });

  it('adds the stacked months of the active effects', () => {
    // W20: `lifespan` stacks by `diminishing`, not `additive`
    // (docs/design/compositional-content.md §3.3, contracts.md §3's "Why
    // lifespan stacks by diminishing returns" paragraph) -- the largest source
    // counts in full and the second at half. 60 in full, 30 at half (15):
    // 60 + 15 = 75, not the additive 90.
    const bare = lifespanOf(human, handleOf(2, 1), 0);
    const blessed = lifespanOf(human, handleOf(2, 1), 0, [fromInt(60), fromInt(30)]);
    expect(blessed.bonusMonths).toBe(75);
    expect(blessed.months).toBe(bare.months + 75);
  });

  it('clamps a bonus above 50% of the species base, and counts the clamp', () => {
    // The spec scenario, and contracts.md §3's cap: stacked (diminishing)
    // months, capped at +50% of species base. Full + half of two equal
    // sources is already 1.5x the base, well past the cap either way.
    const counters = new ClampCounters();
    const blessed = lifespanOf(
      human,
      handleOf(2, 1),
      0,
      [fromInt(human.lifespanMonths), fromInt(human.lifespanMonths)],
      counters,
    );
    expect(blessed.bonusMonths).toBe(human.lifespanMonths / 2);
    expect(blessed.clamped).toBe(true);
    expect(counters.count('lifespan')).toBe(1);
  });

  it('caps against the species base, not against the varied lifespan', () => {
    // Two mages of one species may be blessed by the same amount regardless of
    // which of them drew the longer natural life.
    const counters = new ClampCounters();
    const magnitudes = [fromInt(human.lifespanMonths)];
    const a = lifespanOf(human, handleOf(3, 1), 0, magnitudes, counters);
    const b = lifespanOf(human, handleOf(4, 1), 0, magnitudes, counters);
    expect(a.varianceMonths).not.toBe(b.varianceMonths);
    expect(a.bonusMonths).toBe(b.bonusMonths);
  });

  it('does not count a clamp that did not bind', () => {
    // A counter that always ticks tells 0.5.0 nothing, which is the whole
    // argument for having one.
    const counters = new ClampCounters();
    lifespanOf(human, handleOf(2, 1), 0, [fromInt(12)], counters);
    expect(counters.total()).toBe(0);
  });

  it('floors at one month rather than dividing by zero when a curse overwhelms it', () => {
    // §3 caps the primitive above and deliberately not below, so a curse can
    // shorten a life past zero — and a non-positive lifespan is not a short
    // life, it is a division by zero inside the hazard.
    const cursed = lifespanOf(human, handleOf(2, 1), 0, [fromInt(-100000)]);
    expect(cursed.months).toBe(MIN_EFFECTIVE_LIFESPAN_MONTHS);
    expect(cursed.floored).toBe(true);
    expect(() =>
      perTickHazard({ worldTick: 5, birthTick: 0, effectiveLifespanMonths: cursed.months }),
    ).not.toThrow();
  });
});

describe('a lifespan blessing can save an old mage', () => {
  it('lowers her hazard on the next evaluation', () => {
    // The spec scenario, and the reason mortality is a hazard rather than a
    // date rolled at birth: a date rolled eighty years ago cannot express this
    // without a special case.
    const mage = handleOf(6, 1);
    const age = human.lifespanMonths + 60;
    const bare = lifespanOf(human, mage, 0);
    const blessed = lifespanOf(human, mage, 0, [fromInt(human.lifespanMonths / 2)]);

    expect(blessed.months).toBeGreaterThan(bare.months);
    const before = perTickHazard({
      worldTick: age,
      birthTick: 0,
      effectiveLifespanMonths: bare.months,
    });
    const after = perTickHazard({
      worldTick: age,
      birthTick: 0,
      effectiveLifespanMonths: blessed.months,
    });
    expect(after).toBeLessThan(before);
  });
});

describe('lifecycle timing reads species content rather than a shared constant', () => {
  it('gives the six species six different effective lifespans', () => {
    const months = new Set<number>();
    for (const entry of registry.species) {
      months.add(lifespanOf(entry.record, handleOf(1, 1), 0).months);
    }
    expect(months.size).toBe(registry.species.length);
  });
});
