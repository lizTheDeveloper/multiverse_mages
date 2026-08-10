/*
 * Multiverse Mages — the boundary float, and the descriptors that pin it.
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
 * Task 4.6, and the `observation-action-space` scenarios *"core emits
 * integers"* and *"boundary normalizes"*.
 *
 * The descriptor assertions matter more than they look. §4.1's reason for
 * per-block descriptors is *"so that a quantity whose range later grows does
 * not silently rescale an existing policy's inputs"* — which is a claim about a
 * divisor being a **constant**, not about it being any particular number. So the
 * test that carries the requirement is the one asserting the descriptor table
 * is identical across two universes holding wildly different values: a divisor
 * fitted to observed data would differ between them, and would differ silently.
 */

import { FP_ONE } from '@mm/sim-core';
import {
  FP_SCALE,
  OBSERVATION_DESCRIPTORS,
  OBSERVATION_SIZE,
  applyDescriptor,
  descriptorAt,
  normalizedObservation,
  observationBlock,
  rawObservation,
} from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

import { FIXTURE_CATALOGUE, firstUniverse, secondUniverse } from './fixtures.js';

describe('the core half emits integers', () => {
  it('returns an Int32Array, so the claim is enforced by the container', () => {
    const world = firstUniverse();
    const raw = rawObservation({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    expect(raw).toBeInstanceOf(Int32Array);
    for (const value of raw) expect(Number.isInteger(value)).toBe(true);
  });
});

describe('task 4.6 — the boundary normalizes, and only the boundary', () => {
  it('exports a Float64Array of the pinned width', () => {
    const world = firstUniverse();
    const raw = rawObservation({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    const normalized = normalizedObservation(raw);
    expect(normalized).toBeInstanceOf(Float64Array);
    expect(normalized.length).toBe(OBSERVATION_SIZE);
  });

  it('puts every value in [0, 1], for both fixture universes', () => {
    for (const world of [firstUniverse(), secondUniverse()]) {
      const normalized = normalizedObservation(
        rawObservation({ state: world.state, catalogue: FIXTURE_CATALOGUE }),
      );
      for (const [index, value] of normalized.entries()) {
        expect(value, `channel ${index}`).toBeGreaterThanOrEqual(0);
        expect(value, `channel ${index}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('maps fp(1024) to exactly 1.0, as §4.1 pins it', () => {
    expect(FP_SCALE.divisor).toBe(FP_ONE);
    expect(applyDescriptor(FP_ONE, FP_SCALE)).toBe(1);
    expect(applyDescriptor(FP_ONE / 2, FP_SCALE)).toBe(0.5);
    expect(applyDescriptor(0, FP_SCALE)).toBe(0);
  });

  it('clamps rather than rescales when a quantity exceeds its divisor', () => {
    // Saturation is half the descriptor, not a safety net around a wrong
    // divisor: a channel reading 2.0 would put a trained policy's inputs
    // somewhere its training distribution never went.
    expect(applyDescriptor(4 * FP_ONE, FP_SCALE)).toBe(1);
    expect(applyDescriptor(-4 * FP_ONE, FP_SCALE)).toBe(0);
  });

  it('refuses a vector of the wrong width instead of padding it', () => {
    expect(() => normalizedObservation(new Int32Array(OBSERVATION_SIZE - 1))).toThrow(
      /fixes it at 400/,
    );
  });
});

describe('normalization descriptors are pinned constants', () => {
  it('gives every channel in the vector exactly one descriptor', () => {
    expect(OBSERVATION_DESCRIPTORS).toHaveLength(OBSERVATION_SIZE);
    for (let index = 0; index < OBSERVATION_SIZE; index += 1) {
      const descriptor = descriptorAt(index);
      expect(Number.isInteger(descriptor.divisor), `channel ${index} divisor`).toBe(true);
      expect(descriptor.divisor, `channel ${index} divisor`).toBeGreaterThan(0);
      expect(descriptor.min).toBe(0);
      expect(descriptor.max).toBe(1);
    }
    expect(() => descriptorAt(OBSERVATION_SIZE)).toThrow(/outside the observation/);
  });

  it('declares its descriptors per block, as §4.1 requires', () => {
    for (const block of [
      'ruleset',
      'tradition',
      'resources',
      'population',
      'mages',
      'knowledge',
      'institutions',
      'clock',
      'engagement',
    ] as const) {
      const resolved = observationBlock(block);
      expect(resolved.descriptors, `block ${block}`).toHaveLength(resolved.size);
      for (let index = 0; index < resolved.size; index += 1) {
        expect(resolved.descriptors[index]).toBe(descriptorAt(resolved.offset + index));
      }
    }
  });

  it('is identical across two universes with wildly different magnitudes', () => {
    // The requirement, stated as a test. A divisor fitted to observed data
    // would differ here — and would differ silently, rescaling every channel of
    // a policy trained on the other universe.
    const before = OBSERVATION_DESCRIPTORS.map((descriptor) => descriptor.divisor);

    const first = firstUniverse();
    const second = secondUniverse();
    const a = rawObservation({ state: first.state, catalogue: FIXTURE_CATALOGUE });
    const b = rawObservation({ state: second.state, catalogue: FIXTURE_CATALOGUE });
    // The control: the two universes really do hold different magnitudes, so
    // a divisor fitted to either would land somewhere different.
    expect([...a]).not.toEqual([...b]);

    expect(OBSERVATION_DESCRIPTORS.map((descriptor) => descriptor.divisor)).toEqual(before);

    // Every fixed-point channel shares the one fixed-point divisor. A second
    // fp divisor would mean two channels reporting the same magnitude as
    // different numbers.
    const resources = observationBlock('resources');
    for (const index of [0, 1, 3, 4]) {
      expect(descriptorAt(resources.offset + index).divisor).toBe(FP_ONE);
    }
  });
});
