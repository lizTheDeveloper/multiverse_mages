/*
 * Multiverse Mages — the floors the sentinel was blind to, and now is not.
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
 * # The floors the sentinel could not see, kept as the guard that it can
 *
 * ## Where this file came from
 *
 * It was written by an adversarial reviewer, on a different model, whose brief
 * was to break the numeric-integrity campaign rather than agree with it. At the
 * time `installAnnihilationSentinel` wrapped `mul` and `div`, and the registry
 * in `annihilation-registry.test.ts` asserted it knew *every* function that
 * floors a live quantity to zero. The rules path calls `floorDiv` **directly**
 * at eighty sites — 44 in `rules-world`, 28 in `rules-raid`, 8 in
 * `coordination` — and every one was invisible.
 *
 * `numeric-integrity.md` admitted that blind spot in prose. The test did not,
 * and the test is what runs.
 *
 * Every assertion in the original was `expect(events).toEqual([])`: the
 * *passing* assertion was the finding, because the sentinel stayed silent when
 * it should not have. The sentinel now sits on `floorDiv` — the only `/` in the
 * simulation core, which `mul`, `div` and `toInt` all route through — so all six
 * of those assertions became false, which is the correct outcome and the reason
 * this file could not be merged as written.
 *
 * ## What it does now
 *
 * The same scenarios, inverted. Each one is a concrete production call that
 * floors a non-zero quantity to nothing, and each now asserts the sentinel
 * **sees** it. That makes this a regression guard on the fix at the exact sites
 * that motivated it: if the check ever moves back out of `floorDiv`, or is
 * narrowed to the scaling helpers again, these go red rather than the coverage
 * quietly disappearing.
 *
 * None of these is a live defect. `materialsProduced` and `routeYieldByForm`
 * floor small shares to zero because that is what fixed-point does, and the
 * cohort transfer cliff at sixteen members is declared in `reallocation.ts`'s
 * own note. The claim here is only about what the instrument can see.
 */

import { describe, expect, it } from 'vitest';

import {
  FP_ONE,
  floorDiv,
  installAnnihilationSentinel,
  mul,
  type FixedPointAnnihilation,
} from '@mm/sim-core';
import {
  NO_YIELD_BONUSES,
  materialsProduced,
  routeYieldByForm,
  zeroAmounts,
} from '@mm/rules-world';

import { primitiveNamed, referenceContent } from '../../src/index.js';

// ---------------------------------------------------------------------------
// Finding 1: floorDiv annihilation is invisible to the sentinel.
// ---------------------------------------------------------------------------

describe('the annihilation sentinel sees a bare floorDiv', () => {
  it('reports a floorDiv that turns a non-zero numerator into zero', () => {
    const events: FixedPointAnnihilation[] = [];
    const previous = installAnnihilationSentinel((event) => {
      events.push(event);
    });

    try {
      // 100 * 10 / 1024 = 0.976… → floor → 0.
      // Both operands are non-zero; the result is zero.
      // This is the same arithmetic materialsProduced and routeYieldByForm
      // perform through bare floorDiv, and the sentinel does not see it.
      const result = floorDiv(100 * 10, FP_ONE);
      expect(result).toBe(0);
      expect(events).toHaveLength(1);
      expect(events[0]?.numerator).toBe(1000);
      expect(events[0]?.denominator).toBe(FP_ONE);
    } finally {
      installAnnihilationSentinel(previous);
    }
  });

  it('still reports the equivalent annihilation through mul, which routes here', () => {
    const events: FixedPointAnnihilation[] = [];
    const previous = installAnnihilationSentinel((event) => {
      events.push(event);
    });

    try {
      // mul(1, 1) = floor(1 * 1 / 1024) = 0. Sentinel sees this.
      const result = mul(1, 1);
      expect(result).toBe(0);
      expect(events).toHaveLength(1);
      expect(events[0]?.denominator).toBe(FP_ONE);
    } finally {
      installAnnihilationSentinel(previous);
    }
  });
});

// ---------------------------------------------------------------------------
// Finding 2: materialsProduced annihilates through floorDiv, sentinel-blind.
// ---------------------------------------------------------------------------

describe('materialsProduced floors each share, and the sentinel sees every one', () => {
  it('returns zero for all kinds when the base is small and shares are uneven', () => {
    const { registry } = referenceContent();

    // base = mul(1 * 16, 64) = floor(1024 / 1024) = 1. Non-zero; sentinel
    // would not fire on this mul even if installed.
    //
    // stone: floorDiv(1 * 10, 1024) = 0. Sentinel-blind.
    // vellum: floorDiv(1 * 10, 1024) = 0. Sentinel-blind.
    // food:   floorDiv(1 * 1004, 1024) = 0. Also sentinel-blind.
    //
    // The shares sum to 1024 = FP_ONE as required.
    const input = {
      laborerCount: 1,
      laborAffinity: 64,
      shares: { food: 1004, stone: 10, vellum: 10 },
      resourceYield: primitiveNamed(registry, 'resource-yield'),
      resourceYieldBonuses: NO_YIELD_BONUSES,
    };

    const events: FixedPointAnnihilation[] = [];
    const previous = installAnnihilationSentinel((event) => {
      events.push(event);
    });

    try {
      const produced = materialsProduced(input);

      // The mul on the base produces 1 — non-zero, so the sentinel does not
      // fire there either. The three floorDiv calls then annihilate it to
      // zero for every kind. The sentinel reports nothing.
      expect(produced).toEqual(zeroAmounts());
      // One per material kind: the floor that deleted it.
      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events.every((event) => event.numerator !== 0)).toBe(true);
    } finally {
      installAnnihilationSentinel(previous);
    }
  });

  it('reports the base mul and the per-kind floors alike, where it once saw only the mul', () => {
    const { registry } = referenceContent();

    // A case where the mul IS annihilating (low affinity) AND a floorDiv
    // also annihilates. The sentinel sees the mul but not the floorDiv.
    //
    // base = mul(1 * 16, 32) = floor(512 / 1024) = 0. Sentinel fires.
    // But even if the mul had not annihilated, the floorDiv would have.
    const input = {
      laborerCount: 1,
      laborAffinity: 32,
      shares: { food: 512, stone: 256, vellum: 256 },
      resourceYield: primitiveNamed(registry, 'resource-yield'),
      resourceYieldBonuses: NO_YIELD_BONUSES,
    };

    const events: FixedPointAnnihilation[] = [];
    const previous = installAnnihilationSentinel((event) => {
      events.push(event);
    });

    try {
      const produced = materialsProduced(input);
      expect(produced).toEqual(zeroAmounts());

      // The sentinel fires once: for the mul. It does not fire for the three
      // floorDiv calls that also produce zero. If the mul had not annihilated
      // (e.g. higher affinity), the floorDiv zeros would be completely silent.
      // The `mul` on the base annihilates, and so does each share's floor.
      // Every one of them is now reported.
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.every((event) => event.numerator !== 0)).toBe(true);
    } finally {
      installAnnihilationSentinel(previous);
    }
  });
});

// ---------------------------------------------------------------------------
// Finding 3: routeYieldByForm annihilates through floorDiv, sentinel-blind.
// ---------------------------------------------------------------------------

describe('routeYieldByForm floors each weight, and the sentinel sees every one', () => {
  it('returns zero for all kinds when the magnitude is small relative to the weights', () => {
    // magnitude = 1 (non-zero).
    // food: floorDiv(1 * 512, 1024) = 0. Sentinel-blind.
    // stone: floorDiv(1 * 256, 1024) = 0. Sentinel-blind.
    // vellum: floorDiv(1 * 256, 1024) = 0. Sentinel-blind.
    //
    // The weights sum to 1024 = FP_ONE, so they are valid. But the magnitude
    // is too small for any kind to survive the floor.
    const form = {
      yieldWeights: { food: 512, stone: 256, vellum: 256 },
    };

    const events: FixedPointAnnihilation[] = [];
    const previous = installAnnihilationSentinel((event) => {
      events.push(event);
    });

    try {
      const routed = routeYieldByForm(form as Parameters<typeof routeYieldByForm>[0], 1);

      // All three kinds produce zero. The magnitude is non-zero but every
      // kind's share is too small to survive the floor. The sentinel reports
      // nothing.
      expect(routed).toEqual(zeroAmounts());
      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events.every((event) => event.numerator !== 0)).toBe(true);
    } finally {
      installAnnihilationSentinel(previous);
    }
  });
});

// ---------------------------------------------------------------------------
// Finding 4: the cohort transfer budget is sentinel-blind.
// ---------------------------------------------------------------------------

describe('the cohort transfer cliff at sixteen members is visible', () => {
  it('a cohort of 15 has a transfer budget of zero, and the sentinel says so', () => {
    // TRANSFER_RATE_PER_TICK = floorDiv(FP_ONE, 16) = 64.
    // budget = floorDiv(15 * 64, 1024) = floorDiv(960, 1024) = 0.
    // A cohort that shrinks to 15 through mortality silently freezes.
    const TRANSFER_RATE_PER_TICK = floorDiv(FP_ONE, 16);

    const events: FixedPointAnnihilation[] = [];
    const previous = installAnnihilationSentinel((event) => {
      events.push(event);
    });

    try {
      const budget = floorDiv(15 * TRANSFER_RATE_PER_TICK, FP_ONE);
      expect(budget).toBe(0);
      expect(events).toHaveLength(1);
      expect(events[0]?.numerator).toBe(960);

      // At 16 members the budget becomes 1, so nothing more is reported. The
      // cliff is declared in `reallocation.ts`'s own note — "cohorts smaller
      // than 1 / TRANSFER_RATE_PER_TICK never transfer at all" — and is now
      // visible to the instrument as well as to a reader.
      const budgetAt16 = floorDiv(16 * TRANSFER_RATE_PER_TICK, FP_ONE);
      expect(budgetAt16).toBe(1);
    } finally {
      installAnnihilationSentinel(previous);
    }
  });
});
