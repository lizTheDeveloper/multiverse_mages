/*
 * Multiverse Mages — the five normalization rules and the table that declares them.
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
 * `agent-interface` tasks 1.2, 1.3 and 1.4, and the `agent-api` spec's
 * *"Normalization descriptor table"* requirement.
 *
 * The scenario these tests exist for is the fourth one — *"Run-relative
 * denominators are rejected"* — and it is the one with no natural symptom. A
 * divisor fitted to the largest cohort seen so far produces a perfectly
 * plausible vector every tick; it is only wrong in the sense that the same world
 * state means two different things in two different runs, and nothing anywhere
 * says so. So the table is validated for the properties a constant has and a
 * fitted value does not: integrality, positivity, and immutability.
 */

import { FP_ONE } from '@mm/sim-core';
import type { NormalizationDescriptor, ObservationSlot } from '@mm/agent-api';
import {
  BOOLEAN_SCALE,
  FP_SCALE,
  IDENTITY_SCALE,
  NORMALIZATION_RULES,
  OBSERVATION_DESCRIPTORS,
  OBSERVATION_SIZE,
  OBSERVATION_SLOTS,
  applyDescriptor,
  boundedScale,
  flagScale,
  identityScale,
  layoutProblems,
  logBucketScale,
  observationBlock,
  ratioScale,
} from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

describe('task 1.2 — one descriptor per slot, declaring a rule and a saturation constant', () => {
  it('covers every channel of the vector exactly once', () => {
    expect(OBSERVATION_DESCRIPTORS).toHaveLength(OBSERVATION_SIZE);
    expect(OBSERVATION_SLOTS).toHaveLength(OBSERVATION_SIZE);
  });

  it('declares one of the five permitted rules on every channel', () => {
    expect([...NORMALIZATION_RULES]).toEqual([
      'ratio',
      'bounded',
      'log-bucket',
      'flag',
      'identity',
    ]);
    for (const [index, descriptor] of OBSERVATION_DESCRIPTORS.entries()) {
      expect(NORMALIZATION_RULES, `channel ${index}`).toContain(descriptor.rule);
    }
  });

  it('gives every channel a positive integer saturation constant', () => {
    for (const [index, descriptor] of OBSERVATION_DESCRIPTORS.entries()) {
      expect(Number.isSafeInteger(descriptor.divisor), `channel ${index}`).toBe(true);
      expect(descriptor.divisor, `channel ${index}`).toBeGreaterThan(0);
    }
  });

  it('freezes every descriptor, so no run can write a denominator into one', () => {
    // The mechanical half of "compile-time constant". A divisor fitted at
    // runtime has to be *stored* somewhere, and this is the only place it could
    // go without changing the type.
    for (const [index, descriptor] of OBSERVATION_DESCRIPTORS.entries()) {
      expect(Object.isFrozen(descriptor), `channel ${index}`).toBe(true);
    }
  });

  it('assigns the rule that matches what the channel holds', () => {
    // Not a restatement of the implementation: the pairing of block to rule is
    // the claim, and getting it wrong is how a fixed-point channel would come to
    // be divided by a count scale.
    const resources = observationBlock('resources');
    for (const offset of [0, 1, 3, 4]) {
      const descriptor = resources.descriptors[offset] as NormalizationDescriptor;
      expect(descriptor.rule, `resources channel ${offset}`).toBe('bounded');
      expect(descriptor.divisor).toBe(FP_ONE);
    }
    // worshipTier is a small integer, not an fp quantity.
    expect((resources.descriptors[2] as NormalizationDescriptor).rule).toBe('ratio');

    const ruleset = observationBlock('ruleset');
    // The 19 axis bits are flags; the edict pairs are (cellId, kind).
    for (let index = 0; index < 19; index += 1) {
      expect((ruleset.descriptors[index] as NormalizationDescriptor).rule).toBe('flag');
    }
    expect((ruleset.descriptors[19] as NormalizationDescriptor).rule).toBe('ratio');
    expect((ruleset.descriptors[20] as NormalizationDescriptor).rule).toBe('flag');

    const clock = observationBlock('clock');
    expect((clock.descriptors[0] as NormalizationDescriptor).rule).toBe('ratio');
    expect((clock.descriptors[2] as NormalizationDescriptor).rule).toBe('flag');
  });
});

describe('task 1.3 — the five rules, each clamping at its declared constant', () => {
  it('ratio divides by the constant and saturates above it', () => {
    const descriptor = ratioScale(1000);
    expect(applyDescriptor(0, descriptor)).toBe(0);
    expect(applyDescriptor(250, descriptor)).toBe(0.25);
    expect(applyDescriptor(1000, descriptor)).toBe(1);
    // The spec scenario: a cohort count above its saturation constant reads 1.0.
    expect(applyDescriptor(4_000_000, descriptor)).toBe(1);
    expect(applyDescriptor(-5, descriptor)).toBe(0);
  });

  it('bounded is the fp rule §4.1 names, and fp(1024) is exactly 1.0', () => {
    expect(boundedScale().divisor).toBe(FP_ONE);
    expect(FP_SCALE.rule).toBe('bounded');
    expect(applyDescriptor(FP_ONE, FP_SCALE)).toBe(1);
    expect(applyDescriptor(FP_ONE / 4, FP_SCALE)).toBe(0.25);
    expect(applyDescriptor(0, FP_SCALE)).toBe(0);
    expect(Object.is(applyDescriptor(0, FP_SCALE), 0)).toBe(true); // never -0
  });

  it('flag reports set or unset, and its constant is 1', () => {
    expect(BOOLEAN_SCALE.rule).toBe('flag');
    expect(flagScale().divisor).toBe(1);
    expect(applyDescriptor(0, BOOLEAN_SCALE)).toBe(0);
    expect(applyDescriptor(1, BOOLEAN_SCALE)).toBe(1);
    expect(applyDescriptor(7, BOOLEAN_SCALE)).toBe(1);
    expect(applyDescriptor(-1, BOOLEAN_SCALE)).toBe(0);
  });

  it('identity passes a value already in range through unchanged', () => {
    expect(IDENTITY_SCALE.rule).toBe('identity');
    expect(identityScale().divisor).toBe(1);
    expect(applyDescriptor(0, IDENTITY_SCALE)).toBe(0);
    expect(applyDescriptor(1, IDENTITY_SCALE)).toBe(1);
    expect(applyDescriptor(9, IDENTITY_SCALE)).toBe(1);
  });

  it('log-bucket maps a count through its edges, monotonically, saturating at the last', () => {
    const descriptor = logBucketScale([1, 4, 16, 64]);
    expect(descriptor.rule).toBe('log-bucket');
    // The saturation constant is the value that reads exactly 1.0.
    expect(descriptor.divisor).toBe(64);
    expect(applyDescriptor(0, descriptor)).toBe(0);
    expect(applyDescriptor(1, descriptor)).toBe(0.25);
    expect(applyDescriptor(3, descriptor)).toBe(0.25);
    expect(applyDescriptor(4, descriptor)).toBe(0.5);
    expect(applyDescriptor(63, descriptor)).toBe(0.75);
    expect(applyDescriptor(64, descriptor)).toBe(1);
    expect(applyDescriptor(1_000_000, descriptor)).toBe(1);

    let previous = -1;
    for (const value of [0, 1, 2, 4, 8, 16, 32, 64, 128]) {
      const exported = applyDescriptor(value, descriptor);
      expect(exported).toBeGreaterThanOrEqual(previous);
      previous = exported;
    }
  });

  it('refuses a saturation constant that could not be a compile-time constant', () => {
    expect(() => ratioScale(0)).toThrow(/positive integer/);
    expect(() => ratioScale(-4)).toThrow(/positive integer/);
    expect(() => ratioScale(1.5)).toThrow(/positive integer/);
    expect(() => ratioScale(Number.NaN)).toThrow(/positive integer/);
    expect(() => ratioScale(Number.POSITIVE_INFINITY)).toThrow(/positive integer/);
  });

  it('refuses a bucket edge list that is not strictly increasing positive integers', () => {
    expect(() => logBucketScale([])).toThrow(/at least one edge/);
    expect(() => logBucketScale([4, 4])).toThrow(/strictly increasing/);
    expect(() => logBucketScale([16, 4])).toThrow(/strictly increasing/);
    expect(() => logBucketScale([0, 4])).toThrow(/positive/);
    expect(() => logBucketScale([1, 2.5])).toThrow(/integer/);
  });
});

describe('task 1.4 — the table is validated, and a failure names the slot', () => {
  it('finds nothing wrong with the shipped table', () => {
    expect(layoutProblems(OBSERVATION_SLOTS)).toEqual([]);
  });

  /** The shipped table with one slot replaced. */
  const withSlot = (index: number, patch: Partial<ObservationSlot>): ObservationSlot[] => {
    const slots = OBSERVATION_SLOTS.map((slot) => ({ ...slot }));
    slots[index] = { ...(slots[index] as ObservationSlot), ...patch };
    return slots;
  };

  it('names the slot whose saturation constant is not an integer', () => {
    const problems = layoutProblems(
      withSlot(7, { descriptor: Object.freeze({ rule: 'ratio', divisor: 12.5, min: 0, max: 1 }) }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('slot 7');
    expect(problems[0]).toContain('ruleset');
  });

  it('names the slot whose saturation constant is not positive', () => {
    const problems = layoutProblems(
      withSlot(3, { descriptor: Object.freeze({ rule: 'ratio', divisor: 0, min: 0, max: 1 }) }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('slot 3');
  });

  it('names the slot whose descriptor is mutable, because a run could rewrite it', () => {
    // Unfrozen is the shape a run-relative denominator has to take: somewhere to
    // put the number it just measured.
    const problems = layoutProblems(
      withSlot(11, { descriptor: { rule: 'flag', divisor: 1, min: 0, max: 1 } }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('slot 11');
    expect(problems[0]).toMatch(/frozen|mutable/);
  });

  it('rejects a table that is not as long as the vector', () => {
    // A slot that simply is not there. Reported on its own rather than alongside
    // the several hundred index mismatches a splice also causes, because a
    // failure report nobody reads to the end is a failure report.
    const slots = OBSERVATION_SLOTS.map((slot) => ({ ...slot }));
    slots.splice(40, 1);
    const problems = layoutProblems(slots);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(String(OBSERVATION_SIZE));
  });

  it('names a slot declaring a rule outside the permitted five', () => {
    const problems = layoutProblems(
      withSlot(5, {
        // Deliberately a rule that does not exist. The cast is the test's whole
        // point: TypeScript would refuse it, and validation must too.
        descriptor: Object.freeze({
          rule: 'zscore' as NormalizationDescriptor['rule'],
          divisor: 1,
          min: 0,
          max: 1,
        }),
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('slot 5');
    expect(problems[0]).toContain('zscore');
  });

  it('names a log-bucket slot with no edge list', () => {
    const problems = layoutProblems(
      withSlot(9, { descriptor: Object.freeze({ rule: 'log-bucket', divisor: 8, min: 0, max: 1 }) }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('slot 9');
    expect(problems[0]).toMatch(/edge/);
  });

  it('names a slot whose index disagrees with its position in the table', () => {
    const problems = layoutProblems(withSlot(13, { index: 999 }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('999');
  });
});
