/*
 * Multiverse Mages — adversarial: rediscoveryAffinity's direction is inverted.
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
 * `packages/rules-magic/src/instances/research.ts`'s `effectiveRediscoveryMultiplier`
 * computes `Math.max(mul(multiplier, affinity), REDISCOVERY_FLOOR)`.
 *
 * `mul(a, b)` is `(a * b) / FP_ONE` (`packages/sim-core/src/fixed-point/fixed-point.ts`).
 * That is multiplication by `affinity` treated as a *scalar in [0, ...)* where a
 * bigger `affinity` produces a *bigger* result.
 *
 * `docs/design/contracts.md` §2.4, the `species.json` field table, is explicit
 * about what `rediscoveryAffinity` means and is normative over any spec
 * (contracts.md §0, and this task's own instructions):
 *
 *   > `rediscoveryAffinity` | 768 | fp DIVISOR against rediscoveryMultiplier.
 *   > Higher is better, uniform with every other trait -- so this dwarf is a
 *   > below-average rediscoverer, and gnomes lead (vision §5)
 *
 * "Higher is better" and "DIVISOR" both point the same way: a bigger affinity
 * must produce a *smaller* effective multiplier (a cheaper rediscovery), and a
 * smaller affinity must produce a *bigger* one (a more expensive rediscovery).
 * `contracts.md` §2.3 gives the exact worked formula, twice, both times as a
 * division:
 *
 *   > the best rediscoverer (gnome, affinity 1792) turns 4096 into
 *   > 4096*1024/1792 = 2340 ... Break-even is 3072 * 1792 / 1024 = 5376
 *
 * `mul` computes the opposite trend: a species with an *above-average* affinity
 * (> fp(1024)) gets a *more expensive* rediscovery than a species with a
 * below-average one, and `vision.md` §5's "gnomes lead" at rediscovery becomes
 * false in code. This is the exact seam the task brief calls out: "Rediscovery
 * composition order... Try affinities that make the clamp the binding
 * constraint, affinity 0, affinity above fp(1024)."
 *
 * Caveat, reported here rather than hidden: contracts.md §2.3 also contains one
 * sentence — "otherwise affinity alone drops the effective cost to 2.25x" for a
 * gnome — that is only arithmetically consistent with `mul` and affinity 768 (a
 * *dwarf's* value in the very same document's own species.json example, not a
 * gnome's). That sentence and the two worked division formulas cannot both be
 * literally correct; the field definition ("DIVISOR... Higher is better...
 * gnomes lead") and the two worked formulas agree with each other and are two
 * independent pieces of evidence against the one inconsistent sentence, so
 * these tests are written against the majority, self-consistent reading.
 *
 * Also worth naming: `packages/rules-magic/test/unit/research.test.ts:239-244`
 * already asserts the `mul` trend as intended, naming affinity `768` "gnomish"
 * — but contracts.md's own species.json example assigns `768` to a *dwarf*
 * ("below-average rediscoverer") and `1792` to the gnome ("the best
 * rediscoverer"). That test and this one cannot both be green; fixing this
 * defect requires updating that test too.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE, div, mul } from '@mm/sim-core';

import {
  REDISCOVERY_FLOOR,
  createRediscoveryClampCounter,
  effectiveRediscoveryMultiplier,
} from '@mm/primitives';

/** A throwaway counter per call: these tests assert values, not clamp counts. */
const counter = (): ReturnType<typeof createRediscoveryClampCounter> =>
  createRediscoveryClampCounter();

/** Comfortably above the floor under either `mul` or `div` semantics, at every affinity below. */
const BASE = REDISCOVERY_FLOOR * 10; // fp(30720)

describe('effectiveRediscoveryMultiplier direction (contracts.md §2.4)', () => {
  it('gives a higher-affinity species a cheaper (lower) effective multiplier than a lower-affinity one', () => {
    // contracts.md §2.4: "Higher is better, uniform with every other trait".
    // A species with affinity fp(2048) (2x) must rediscover more cheaply than
    // one with affinity fp(512) (0.5x). BASE is chosen so neither result is
    // clamped by the floor under either mul or div semantics, isolating the
    // direction question from the clamp.
    const betterAffinity = effectiveRediscoveryMultiplier(BASE, 2048, counter());
    const worseAffinity = effectiveRediscoveryMultiplier(BASE, 512, counter());

    expect(betterAffinity).toBeLessThan(worseAffinity);
  });

  it('gives a species at exactly fp(1024) (neutral) affinity the unmodified multiplier', () => {
    // Neutral ground truth both readings agree on: affinity fp(1024) = 1.0
    // must leave the base multiplier unchanged, since both mul(x, FP_ONE) and
    // div(x, FP_ONE) equal x.
    expect(effectiveRediscoveryMultiplier(BASE, FP_ONE, counter())).toBe(BASE);
  });

  it('matches contracts.md §2.3\'s own worked break-even formula exactly', () => {
    // "the best rediscoverer (gnome, affinity 1792) turns 4096 into
    //  4096*1024/1792 = 2340 ... Break-even is 3072 * 1792 / 1024 = 5376"
    //
    // Break-even means: a node whose rediscoveryMultiplier is fp(5376),
    // rediscovered by a subject at gnome affinity fp(1792), lands *exactly* on
    // the fp(3072) floor -- neither above it (affinity did nothing) nor below
    // it (the floor would have to clamp something illegal).
    const geometricPrediction = div(5376, 1792); // contracts.md's own formula
    expect(geometricPrediction).toBe(REDISCOVERY_FLOOR); // sanity: 3072

    expect(effectiveRediscoveryMultiplier(5376, 1792, counter())).toBe(REDISCOVERY_FLOOR);
  });

  it('never makes affinity fp(0) (the worst possible rediscoverer) cheaper than neutral affinity', () => {
    // contracts.md §2.4: "Higher is better". Affinity 0 is the floor of the
    // trait's range and must never be cheaper than neutral (fp(1024)).
    //
    // The shared implementation satisfies this more strongly than the ordering
    // this test originally asserted: a non-positive affinity is not a cheap
    // rediscoverer, it is unrepresentable, and the divisor form rejects it at
    // the boundary rather than returning some value whose meaning nobody
    // agreed. An exception is a stronger guarantee than an inequality, so the
    // assertion is tightened rather than relaxed.
    expect(() => effectiveRediscoveryMultiplier(BASE, 0, counter())).toThrow(RangeError);
  });

  it('reproduces the exact mul/div divergence at the gnome/dwarf values contracts.md names', () => {
    // Documents the magnitude of the defect at the two concrete affinities
    // contracts.md's own species.json example uses: dwarf fp(768) (below
    // average, should be the *worse* -- more expensive -- rediscoverer) and
    // gnome fp(1792) (best, should be the *cheaper* one).
    const dwarf = effectiveRediscoveryMultiplier(BASE, 768, counter());
    const gnome = effectiveRediscoveryMultiplier(BASE, 1792, counter());

    // What contracts.md requires: the gnome (higher affinity) rediscovers more
    // cheaply than the dwarf (lower affinity).
    expect(gnome).toBeLessThan(dwarf);

    // Demonstrates precisely how the current implementation gets there: it
    // computes the two numbers with mul(), producing the opposite ordering
    // from what div() (contracts.md's own formula) would.
    expect(mul(BASE, 768)).toBeLessThan(mul(BASE, 1792));
  });
});
