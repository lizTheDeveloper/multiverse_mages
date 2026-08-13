/*
 * Multiverse Mages — the cost side of an effect, and what it does to a workforce.
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
 * Three claims, and the third is the one that matters.
 *
 * 1. The fold is `multiplicativeOnRemainder` and nothing else, so two shares
 *    compose on the remainder rather than by addition. Asserted against the
 *    shared implementation's own answer rather than against a literal, because
 *    a literal here would be this file quietly holding a second opinion about
 *    `contracts.md` §3 — which is the failure the whole package exists to
 *    prevent.
 * 2. The ceiling clamps and the clamp is **counted**. A cap that binds on every
 *    evaluation and a cap that never binds produce identical output; only the
 *    counter tells them apart (`caps.ts`).
 * 3. **An absent displacement is not a zero displacement** — the two are the
 *    same number here and are different claims everywhere else, and the whole
 *    optionality of the field rests on nothing ever having to substitute one.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import { ClampCounters, multiplicativeOnRemainder } from '@mm/primitives';

import {
  DISPLACED_LABOR_CAP,
  DISPLACEMENT_CLAMP_ID,
  NO_DISPLACEMENT,
  laborAfterDisplacement,
  stackDisplacedLabor,
} from '../../src/index.js';

describe('shares stack on the remainder, through the one implementation', () => {
  it('two five-per-cent shares remove less than ten per cent', () => {
    const shares = [51, 51];
    const outcome = stackDisplacedLabor(shares);

    expect(outcome.fraction).toBe(multiplicativeOnRemainder(shares));
    expect(outcome.fraction).toBeLessThan(102);
    expect(outcome.clamped).toBe(false);
  });

  it('no shares displace nothing, which is the rule’s identity and not a missing value', () => {
    expect(stackDisplacedLabor([])).toEqual(NO_DISPLACEMENT);
  });

  it('order does not change the answer — the stack is over a multiset', () => {
    // The three magnitudes `stacking.ts` names as the adversarial case for
    // floored multiplication not associating.
    const forward = stackDisplacedLabor([300, 500, 700]).fraction;
    const backward = stackDisplacedLabor([700, 500, 300]).fraction;
    expect(forward).toBe(backward);
  });
});

describe('the ceiling', () => {
  it('clamps a long list of shares and counts the clamp', () => {
    const counters = new ClampCounters();
    // Twenty ten-per-cent shares reach 0.878 on the remainder, well past half.
    const outcome = stackDisplacedLabor(Array.from({ length: 20 }, () => 102), { counters });

    expect(outcome.clamped).toBe(true);
    expect(outcome.fraction).toBe(DISPLACED_LABOR_CAP.value);
    expect(counters.count(DISPLACEMENT_CLAMP_ID)).toBe(1);
  });

  it('counts nothing when the ceiling did not decide the answer', () => {
    const counters = new ClampCounters();
    stackDisplacedLabor([51], { counters });
    expect(counters.total()).toBe(0);
  });

  it('takes a caller-supplied ceiling, so the harness can move it without editing the rules', () => {
    const outcome = stackDisplacedLabor([512], { cap: { kind: 'fp', value: 128 } });
    expect(outcome.fraction).toBe(128);
    expect(outcome.clamped).toBe(true);
  });
});

describe('what displacement does to a headcount', () => {
  it('leaves the workforce alone when nothing displaces', () => {
    expect(laborAfterDisplacement(40, 0)).toBe(40);
  });

  it('removes half of a workforce at half a share', () => {
    expect(laborAfterDisplacement(40, FP_ONE / 2)).toBe(20);
  });

  it('floors the survivors rather than the displaced', () => {
    // Three people and a one-per-cent share: flooring the displaced count would
    // displace nobody and make the mechanism silently inert on small cohorts.
    // Flooring the survivors takes one, which is the direction that keeps a
    // share meaning something at every scale.
    expect(laborAfterDisplacement(3, 10)).toBe(2);
  });

  it('never returns more people than it was given, or fewer than none', () => {
    expect(laborAfterDisplacement(0, 512)).toBe(0);
    expect(laborAfterDisplacement(7, FP_ONE)).toBe(0);
    // A share past the whole is nonsense the schema refuses, and is clamped
    // rather than made to produce a negative workforce.
    expect(laborAfterDisplacement(7, FP_ONE * 2)).toBe(0);
  });

  it('refuses a headcount that is not a whole number of people', () => {
    expect(() => laborAfterDisplacement(3.5, 128)).toThrow(RangeError);
    expect(() => laborAfterDisplacement(-1, 128)).toThrow(RangeError);
  });
});
