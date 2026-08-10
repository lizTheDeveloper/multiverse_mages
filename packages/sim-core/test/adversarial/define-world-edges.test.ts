/*
 * Multiverse Mages — adversarial: defineWorld edge cases.
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

import { rngFromRootSeed } from '../../src/rng/source.js';
import type { System } from '../../src/state.js';
import { createState, defineWorld } from '../../src/state.js';
import { step } from '../../src/step.js';

describe('a world with zero components and zero systems', () => {
  it('PASSES: is legal to define and to step, and simply advances the clock', () => {
    const empty = defineWorld({ components: [], systems: [] });
    let state = createState({ rootSeed: 1, schema: empty });
    state = step(state, [{ kind: 42 }], rngFromRootSeed(1));
    expect(state.clock.worldTick).toBe(1);
    expect(state.entities.slotCount).toBe(0);
  });
});

describe('a component and a system sharing the same name', () => {
  it('PASSES: is permitted, because component names and system names are validated against separate namespaces', () => {
    // state.ts's defineWorld tracks `componentNames` and `systemNames` as two
    // independent Sets, so nothing here cross-checks the two lists against
    // each other. Confirmed here rather than assumed, since a reader of the
    // duplicate-rejection code could reasonably expect a shared namespace.
    const combat = { name: 'combat', fields: { hp: 'i32' } } as const;
    const combatSystem: System = { name: 'combat', run: () => undefined };
    expect(() =>
      defineWorld({ components: [combat], systems: [combatSystem] }),
    ).not.toThrow();
  });
});

describe('duplicate names within one list', () => {
  it('rejects two components with the same name', () => {
    const a = { name: 'dup', fields: { x: 'i32' } } as const;
    const b = { name: 'dup', fields: { y: 'i32' } } as const;
    expect(() => defineWorld({ components: [a, b], systems: [] })).toThrow(/more than once/i);
  });

  it('rejects two systems with the same name', () => {
    const s1: System = { name: 'dup', run: () => undefined };
    const s2: System = { name: 'dup', run: () => undefined };
    expect(() => defineWorld({ components: [], systems: [s1, s2] })).toThrow(/more than once/i);
  });
});

describe('a system that creates entities without bound', () => {
  it('propagates the entity-store-full error rather than silently capping creation', () => {
    const vitality = { name: 'vitality', fields: { hp: 'i32' } } as const;
    const unbounded: System = {
      name: 'unbounded',
      run(ctx) {
        // Loop far past the declared maxSlots.
        for (let i = 0; i < 1000; i += 1) {
          ctx.state.entities.create();
        }
      },
    };
    const schema = defineWorld({ components: [vitality], systems: [unbounded], maxSlots: 5 });
    const state = createState({ rootSeed: 2, schema });
    expect(() => step(state, [], rngFromRootSeed(2))).toThrow(/full/i);
  });
});

describe('a component declared with zero fields', () => {
  it('is rejected at ComponentStore construction time, which defineWorld surfaces during state creation', () => {
    // component.ts's constructor requires at least one field. defineWorld
    // itself does not validate a spec's field count (it only checks name
    // uniqueness), so a zero-field component is accepted by defineWorld and
    // only fails once a SimState actually tries to register it. Confirms
    // where in the pipeline this particular piece of invalid content is
    // actually caught.
    const empty = { name: 'empty', fields: {} } as const;
    const schema = defineWorld({ components: [empty], systems: [] });
    expect(() => createState({ rootSeed: 1, schema })).toThrow(/at least one field/i);
  });
});

describe('maxSlots of exactly 1', () => {
  it('PASSES: allows exactly one live entity and rejects a second, deterministically', () => {
    const vitality = { name: 'vitality', fields: { hp: 'i32' } } as const;
    const spawnOnce: System = {
      name: 'spawnOnce',
      run(ctx) {
        for (const action of ctx.actions) {
          if (action.kind === 1) {
            ctx.state.entities.create();
          }
        }
      },
    };
    const schema = defineWorld({ components: [vitality], systems: [spawnOnce], maxSlots: 1 });
    let state = createState({ rootSeed: 3, schema });
    state = step(state, [{ kind: 1 }], rngFromRootSeed(3));
    expect(state.entities.liveCount).toBe(1);
    expect(() => step(state, [{ kind: 1 }], rngFromRootSeed(3))).toThrow(/full/i);
  });
});
