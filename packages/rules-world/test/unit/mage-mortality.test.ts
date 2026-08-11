/*
 * Multiverse Mages — the per-tick mortality hazard, and the dragon it must not
 * make immortal.
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
 * ## The defect under test
 *
 * `docs/design/contracts.md` §3 requires *"a test must assert a non-zero
 * draconic hazard specifically"*, and the requirement is unusual enough to be
 * worth restating: it names a species, in a document that otherwise refuses to
 * name species, because this particular arithmetic mistake is invisible in
 * aggregate. A run in which dragons never die does not throw, does not clamp,
 * does not warn, and does not look wrong — it looks like a species that is
 * merely very long-lived, which is exactly what dragons are supposed to look
 * like.
 *
 * So every test here that asserts the correct behaviour also asserts the
 * *incorrect* behaviour of `naivePerLifespanRate`, side by side. An assertion
 * that only says "the hazard is positive" passes against an implementation that
 * is positive for an unrelated reason and says nothing about the failure it was
 * written for. Asserting both halves — this returns zero, that one does not —
 * is what makes the test about the defect rather than about the feature.
 *
 * ## And it is not a dragon problem
 *
 * At the flat young-adult hazard the naive division floors to zero for **four**
 * of the six shipped species, not one. That is asserted below because it
 * changes what the fix has to be: a special case for the longest-lived species
 * would have looked like it worked.
 */

import { describe, expect, it } from 'vitest';

import { WORLD_TICKS_PER_YEAR } from '@mm/sim-core';
import {
  effectiveLifespan,
  hazardAt,
  hazardNumerator,
  naivePerLifespanRate,
  perTickHazard,
  rollMortality,
} from '@mm/rules-world';

import { lifespanPrimitive, shippedRegistry, stepRng } from './mage-fixtures.js';
import { speciesById } from './species-fixtures.js';

const registry = shippedRegistry();
const draconic = speciesById(registry, 'draconic');
const human = speciesById(registry, 'human');

/** A mage at exactly the nominal lifespan: `age = effectiveLifespanMonths`. */
const atNominalLifespan = (lifespanMonths: number): {
  worldTick: number;
  birthTick: number;
  effectiveLifespanMonths: number;
} => ({ worldTick: lifespanMonths, birthTick: 0, effectiveLifespanMonths: lifespanMonths });

/** A mage a quarter of the way through her life: normalized age `fp(256)`. */
const atQuarterLife = (lifespanMonths: number): {
  worldTick: number;
  birthTick: number;
  effectiveLifespanMonths: number;
} => ({
  worldTick: Math.floor(lifespanMonths / 4),
  birthTick: 0,
  effectiveLifespanMonths: lifespanMonths,
});

describe('a draconic hazard is strictly non-zero', () => {
  it('is positive at the nominal lifespan, where the naive division is zero', () => {
    // The spec scenario, verbatim: effectiveLifespanMonths 18000, normalized age
    // fp(1024), H = fp(12288).
    const input = atNominalLifespan(draconic.lifespanMonths);
    expect(input.effectiveLifespanMonths).toBe(18000);
    expect(hazardNumerator(input)).toBe(12288);

    expect(perTickHazard(input)).toBeGreaterThan(0);

    // The other half, and the half that makes this a test about the defect:
    // the arithmetic that looks right returns zero for the same inputs.
    expect(naivePerLifespanRate(12288, draconic.lifespanMonths)).toBe(0);
  });

  it('is positive at every age a dragon can reach', () => {
    const lifespan = draconic.lifespanMonths;
    const step = Math.max(1, Math.floor(lifespan / 64));
    for (let age = 0; age <= lifespan * 2; age += step) {
      expect(
        perTickHazard({ worldTick: age, birthTick: 0, effectiveLifespanMonths: lifespan }),
      ).toBeGreaterThan(0);
    }
  });

  it('is positive for every shipped species, where the naive form kills four of them', () => {
    // Not "makes four species immortal" as a turn of phrase: at the flat
    // young-adult hazard of fp(1024), floorDiv(1024, lifespanMonths) is exactly
    // zero for every species living longer than 1024 months. Four of six do.
    const youngHazard = hazardAt(0);
    const naiveZeroes: string[] = [];
    for (const entry of registry.species) {
      const record = entry.record;
      const input = atQuarterLife(record.lifespanMonths);
      expect(perTickHazard(input)).toBeGreaterThan(0);
      if (naivePerLifespanRate(youngHazard, record.lifespanMonths) === 0) {
        naiveZeroes.push(record.id);
      }
    }
    expect(
      naiveZeroes.sort(),
      'A fix that special-cased only the longest-lived species would have left three more ' +
        'immortal. The defect is the arithmetic, not the content.',
    ).toEqual(['draconic', 'dwarf', 'elf', 'gnome']);
  });
});

describe('the hazard curve behaves as the spec describes', () => {
  it('rises with normalized age', () => {
    const lifespan = draconic.lifespanMonths;
    const young = perTickHazard(atQuarterLife(lifespan));
    const nominal = perTickHazard(atNominalLifespan(lifespan));
    expect(nominal).toBeGreaterThan(young);
  });

  it('serves every lifespan from one table', () => {
    // Same H at the same normalized age; the per-tick hazards then differ only
    // by the lifespan they are divided by.
    const dragon = atNominalLifespan(draconic.lifespanMonths);
    const person = atNominalLifespan(human.lifespanMonths);
    expect(hazardNumerator(dragon)).toBe(hazardNumerator(person));
    expect(perTickHazard(person)).toBeGreaterThan(perTickHazard(dragon));
  });

  it('rounds toward negative infinity, like every other division in the rules path', () => {
    // 1024 << 10 = 1048576; 1048576 / 18000 = 58.25…, and the shared helper
    // floors it rather than rounding to nearest.
    expect(perTickHazard({ worldTick: 0, birthTick: 0, effectiveLifespanMonths: 18000 })).toBe(58);
  });
});

describe('at least one draconic dies in a 200-world-year run', () => {
  /**
   * The reference scenario proper is task group 9's; this is the same claim at
   * the scale one task group can own — a founding cohort of dragons, no births,
   * no player input, stepped for 200 world years on a fixed seed.
   *
   * The founding count is documented rather than tuned. At the flat young-adult
   * hazard a dragon's chance of dying in 200 years is about one in eight, so a
   * founding population in the tens makes at least one death overwhelmingly
   * likely — and the seed is fixed, so the run either passes or it does not;
   * there is no flake to inherit.
   */
  const FOUNDING_DRAGONS = 100;
  const RUN_TICKS = 200 * WORLD_TICKS_PER_YEAR;
  const ROOT_SEED = 0x0d1ce5;

  interface RunResult {
    readonly deaths: number;
    readonly survivors: number;
  }

  function run(hazardOf: (age: number, lifespan: number) => number): RunResult {
    const primitive = lifespanPrimitive(registry);
    const alive = new Set<number>();
    const lifespans = new Map<number, number>();
    for (let slot = 1; slot <= FOUNDING_DRAGONS; slot += 1) {
      // Real handles: slot index in the low 20 bits, generation 1 above it.
      const mage = ((1 << 20) | slot) >>> 0;
      alive.add(mage);
      lifespans.set(
        mage,
        effectiveLifespan({
          species: draconic,
          mage,
          birthTick: 0,
          rootSeed: ROOT_SEED,
          lifespanPrimitive: primitive,
          effectMagnitudes: [],
        }).months,
      );
    }

    let deaths = 0;
    for (let tick = 0; tick < RUN_TICKS; tick += 1) {
      const rng = stepRng(ROOT_SEED, tick);
      for (const mage of [...alive]) {
        const lifespan = lifespans.get(mage) ?? draconic.lifespanMonths;
        if (hazardOf(tick, lifespan) > 0 && rollMortality(rng, mage, {
          worldTick: tick,
          birthTick: 0,
          effectiveLifespanMonths: lifespan,
        })) {
          alive.delete(mage);
          deaths += 1;
        }
      }
    }
    return { deaths, survivors: alive.size };
  }

  it('records at least one death, and the test fails if zero are', () => {
    const result = run((age, lifespan) =>
      perTickHazard({ worldTick: age, birthTick: 0, effectiveLifespanMonths: lifespan }),
    );
    expect(result.deaths).toBeGreaterThan(0);
    // Not a mass extinction either: a species that dies out in a fifth of its
    // own lifespan is a different bug with the same test.
    expect(result.survivors).toBeGreaterThan(FOUNDING_DRAGONS / 2);
  });

  it('would have caught the naive division: it produces exactly zero deaths', () => {
    // The counterfactual, run through the same loop. `naivePerLifespanRate`
    // returns 0 for a dragon at every age this run reaches, so the gate above
    // never opens and not one dragon dies in two centuries — silently, with a
    // full population of survivors and no diagnostic anywhere.
    const result = run((age, lifespan) =>
      naivePerLifespanRate(
        hazardNumerator({ worldTick: age, birthTick: 0, effectiveLifespanMonths: lifespan }),
        lifespan,
      ),
    );
    expect(result.deaths).toBe(0);
    expect(result.survivors).toBe(FOUNDING_DRAGONS);
  });
});
