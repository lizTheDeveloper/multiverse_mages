/*
 * Multiverse Mages — promotion is arithmetic plus one draw, never a draw per
 * person.
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

import { RNG_STREAM } from '@mm/sim-core';
import { maxPromotableCount, promoteStudentCohort } from '@mm/rules-world';

import { handleOf, recordingRng, rngForbidding, stepRng } from './mage-fixtures.js';
import { shippedRegistry } from './mage-fixtures.js';
import { speciesById } from './species-fixtures.js';

const registry = shippedRegistry();
const COHORT = handleOf(7, 1);

describe('the integer part promotes deterministically', () => {
  it('promotes at least the floor of count × aptitude', () => {
    // The spec scenario: 1,000 members at fp(512) yields at least 500.
    const outcome = promoteStudentCohort(stepRng(1, 0), COHORT, 1000, 512);
    expect(outcome.integerPart).toBe(500);
    expect(outcome.promoted).toBeGreaterThanOrEqual(500);
    expect(outcome.promoted).toBeLessThanOrEqual(501);
  });

  it('reduces the cohort by exactly the number promoted', () => {
    const outcome = promoteStudentCohort(stepRng(1, 0), COHORT, 1000, 512);
    expect(outcome.promoted + outcome.notPromoted).toBe(1000);
  });

  it('leaves no remainder when the product is whole', () => {
    // 1000 × fp(512) is exactly 500 people, so the draw cannot add one.
    const outcome = promoteStudentCohort(stepRng(1, 0), COHORT, 1000, 512);
    expect(outcome.remainder).toBe(0);
    expect(outcome.remainderPromoted).toBe(false);
  });

  it('promotes everybody at a neutral aptitude, and nobody from an empty cohort', () => {
    expect(promoteStudentCohort(stepRng(1, 0), COHORT, 40, 1024).promoted).toBe(40);
    expect(promoteStudentCohort(stepRng(1, 0), COHORT, 0, 1024).promoted).toBe(0);
  });
});

describe('the remainder is resolved by exactly one draw', () => {
  it('yields the integer part or one more, and nothing else', () => {
    // The spec scenario: 3 members at fp(896) is 2.625 people, so 2 or 3.
    const outcome = promoteStudentCohort(stepRng(99, 0), COHORT, 3, 896);
    expect(outcome.integerPart).toBe(2);
    expect(outcome.remainder).toBe(640);
    expect([2, 3]).toContain(outcome.promoted);
  });

  it('takes exactly one draw for a cohort of 10,000, not 10,000', () => {
    // The contract §1.3 violation this arithmetic exists to prevent, measured
    // against the real generator rather than a mock: the counter replays the
    // stream from the position it was issued at.
    const rng = recordingRng(12345, 0);
    const outcome = promoteStudentCohort(rng, COHORT, 10_000, 640);
    expect(outcome.draws).toBe(1);
    expect(rng.drawsTaken()).toBe(1);
    expect(rng.drawsOn(RNG_STREAM.mageBirth)).toBe(1);
  });

  it('takes the same one draw whatever the cohort size', () => {
    for (const count of [1, 17, 10_000, 250_000]) {
      const rng = recordingRng(4, 0);
      promoteStudentCohort(rng, COHORT, count, 640);
      expect(rng.drawsTaken()).toBe(1);
    }
  });

  it('draws even when the remainder is zero, so the stream position never depends on the data', () => {
    const rng = recordingRng(4, 0);
    const outcome = promoteStudentCohort(rng, COHORT, 1000, 512);
    expect(outcome.remainder).toBe(0);
    expect(rng.drawsTaken()).toBe(1);
  });

  it('draws on stream 1, keyed on the cohort handle', () => {
    const rng = recordingRng(4, 0);
    promoteStudentCohort(rng, COHORT, 10, 700);
    expect(rng.issued).toEqual([{ subsystemId: RNG_STREAM.mageBirth, actorKey: COHORT }]);
  });

  it('makes no mortality draw at promotion', () => {
    // "No draw is made on RNG stream 2 at promotion, and no scheduled death is
    // recorded." Asserted by refusing the stream rather than by counting draws
    // on it: a promotion path that *requests* the mortality stream already
    // knows something it should not.
    const rng = rngForbidding(4, 0, RNG_STREAM.mortality);
    expect(() => promoteStudentCohort(rng, COHORT, 10, 700)).not.toThrow();
  });
});

describe('promotion is insertion-invariant across cohorts', () => {
  it('gives one cohort the same outcome whatever other cohorts exist', () => {
    // The property §6 calls insertion invariance. Keyed positionally instead,
    // creating a cohort ahead of this one would silently re-roll it.
    const rng = stepRng(777, 40);
    const alone = promoteStudentCohort(rng, COHORT, 33, 700);

    const busy = stepRng(777, 40);
    for (const other of [handleOf(1, 1), handleOf(2, 1), handleOf(3, 9)]) {
      promoteStudentCohort(busy, other, 12, 512);
    }
    const crowded = promoteStudentCohort(busy, COHORT, 33, 700);

    expect(crowded).toEqual(alone);
  });

  it('gives two different cohorts of identical size independent draws', () => {
    const rng = stepRng(31337, 5);
    const outcomes = new Set<boolean>();
    for (let slot = 1; slot <= 64; slot += 1) {
      outcomes.add(promoteStudentCohort(rng, handleOf(slot, 1), 3, 512).remainderPromoted);
    }
    // Both outcomes occur across 64 cohorts; one shared cursor read at position
    // zero would give all 64 the same answer.
    expect(outcomes.size).toBe(2);
  });
});

describe('promotion refuses what it cannot compute', () => {
  it('names the ceiling rather than overflowing into a smaller number', () => {
    const aptitude = 1024;
    const limit = maxPromotableCount(aptitude);
    expect(() => promoteStudentCohort(stepRng(1, 0), COHORT, limit + 1, aptitude)).toThrow(
      /exceeds/u,
    );
    expect(() => promoteStudentCohort(stepRng(1, 0), COHORT, limit, aptitude)).not.toThrow();
  });

  it('rejects a negative or fractional cohort count', () => {
    expect(() => promoteStudentCohort(stepRng(1, 0), COHORT, -1, 1024)).toThrow(/non-negative/u);
    expect(() => promoteStudentCohort(stepRng(1, 0), COHORT, 1.5, 1024)).toThrow(/integer/u);
  });

  it('rejects a non-positive aptitude, which a divisor-shaped mistake would produce', () => {
    expect(() => promoteStudentCohort(stepRng(1, 0), COHORT, 10, 0)).toThrow(/positive/u);
  });
});

describe('promotion reads the species trait rather than a shared constant', () => {
  it('yields different mage counts for different species from one cohort size', () => {
    // The 0.4.0 differentiation claim in its smallest form: lifecycle timing and
    // volume must actually depend on species content.
    const counts = new Map<string, number>();
    for (const entry of registry.species) {
      counts.set(
        entry.record.id,
        promoteStudentCohort(stepRng(2, 0), COHORT, 1000, entry.record.mageAptitude).integerPart,
      );
    }
    expect(new Set(counts.values()).size).toBeGreaterThan(1);
    // And the ordering follows the trait, which is what "higher is better" means
    // for mageAptitude.
    const orc = speciesById(registry, 'orc');
    const draconic = speciesById(registry, 'draconic');
    expect(counts.get('draconic') ?? 0).toBeGreaterThan(counts.get('orc') ?? 0);
    expect(draconic.mageAptitude).toBeGreaterThan(orc.mageAptitude);
  });
});
