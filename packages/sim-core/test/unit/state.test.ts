/*
 * Multiverse Mages — simulation state container tests.
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

import { TIME_MODE } from '../../src/clock.js';
import { createState, defineWorld } from '../../src/state.js';

const vitality = { name: 'vitality', fields: { hp: 'i32', age: 'u16' } } as const;
const affinity = { name: 'affinity', fields: { strength: 'i32' } } as const;

const testWorld = defineWorld({ components: [vitality, affinity], systems: [] });

describe('defineWorld', () => {
  it('rejects two components with the same name', () => {
    expect(() =>
      defineWorld({ components: [vitality, { ...vitality }], systems: [] }),
    ).toThrow(/vitality/);
  });

  it('rejects two systems with the same name', () => {
    const noop = { name: 'decay', run: () => undefined };
    expect(() => defineWorld({ components: [], systems: [noop, { ...noop }] })).toThrow(/decay/);
  });

  it('preserves declaration order, which the snapshot format depends on', () => {
    expect(testWorld.components.map((c) => c.name)).toEqual(['vitality', 'affinity']);
  });
});

describe('createState', () => {
  it('starts at world tick zero with no entities', () => {
    const state = createState({ rootSeed: 7, schema: testWorld });
    expect(state.clock.mode).toBe(TIME_MODE.world);
    expect(state.clock.worldTick).toBe(0);
    expect(state.entities.liveCount).toBe(0);
    expect(state.rootSeed).toBe(7);
  });

  it('registers every declared component in declaration order', () => {
    const state = createState({ rootSeed: 7, schema: testWorld });
    expect(state.entities.components.map((c) => c.name)).toEqual(['vitality', 'affinity']);
    expect(state.component('vitality').fieldNames).toEqual(['hp', 'age']);
  });

  it('names an unregistered component rather than returning undefined', () => {
    const state = createState({ rootSeed: 7, schema: testWorld });
    expect(() => state.component('nonesuch')).toThrow(/nonesuch/);
  });

  it('rejects a root seed outside the unsigned 32-bit domain', () => {
    expect(() => createState({ rootSeed: -1, schema: testWorld })).toThrow(/rootSeed/);
    expect(() => createState({ rootSeed: 2 ** 32, schema: testWorld })).toThrow(/rootSeed/);
  });
});

describe('cloning a state', () => {
  it('shares no mutable structure with its source', () => {
    const state = createState({ rootSeed: 7, schema: testWorld });
    const a = state.entities.create();
    state.component('vitality').add(a);
    state.component('vitality').set(a, 'hp', 100);

    const copy = state.clone();
    copy.component('vitality').set(a, 'hp', 5);
    copy.clock.worldTick = 42;
    copy.entities.create();

    expect(state.component('vitality').get(a, 'hp')).toBe(100);
    expect(state.clock.worldTick).toBe(0);
    expect(state.entities.liveCount).toBe(1);
  });

  it('carries entity identity across, so handles resolve in the copy', () => {
    const state = createState({ rootSeed: 7, schema: testWorld });
    const a = state.entities.create();
    const b = state.entities.create();
    state.entities.destroy(a);

    const copy = state.clone();
    expect(copy.entities.isAlive(b)).toBe(true);
    expect(copy.entities.isStale(a)).toBe(true);
    expect(copy.entities.liveCount).toBe(1);
  });

  it('preserves the free list order, so the copy allocates the same next slot', () => {
    const state = createState({ rootSeed: 7, schema: testWorld });
    const handles = [
      state.entities.create(),
      state.entities.create(),
      state.entities.create(),
    ];
    state.entities.destroy(handles[0]!);
    state.entities.destroy(handles[2]!);

    const copy = state.clone();
    const fromOriginal = state.entities.create();
    const fromCopy = copy.entities.create();
    expect(fromCopy).toBe(fromOriginal);
  });

  it('keeps sparse component membership exact', () => {
    const state = createState({ rootSeed: 7, schema: testWorld });
    const a = state.entities.create();
    const b = state.entities.create();
    state.component('vitality').add(b);

    const copy = state.clone();
    expect(copy.component('vitality').has(a)).toBe(false);
    expect(copy.component('vitality').has(b)).toBe(true);
    expect(copy.component('affinity').size).toBe(0);
  });
});
