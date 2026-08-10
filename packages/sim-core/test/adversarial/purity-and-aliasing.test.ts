/*
 * Multiverse Mages — adversarial: purity, aliasing, and atomicity of `step`.
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
import { snapshotHash } from '../../src/snapshot/snapshot.js';
import type { StepContext, System } from '../../src/state.js';
import { createState, defineWorld } from '../../src/state.js';
import { step } from '../../src/step.js';

const vitality = { name: 'vitality', fields: { hp: 'i32' } } as const;

const ageing: System = {
  name: 'ageing',
  run(ctx) {
    const component = ctx.state.component('vitality');
    const hp = component.field('hp');
    component.forEach((row) => {
      hp[row] = (hp[row] as number) + 1;
    });
  },
};

const spawning: System = {
  name: 'spawning',
  run(ctx) {
    for (const action of ctx.actions) {
      if (action.kind === 1) {
        const handle = ctx.state.entities.create();
        ctx.state.component('vitality').add(handle);
      }
    }
  },
};

const world = defineWorld({ components: [vitality], systems: [spawning, ageing] });

describe('holding a field() array across a step', () => {
  it('PASSES: mutating an array captured from the input state after step() returns does not affect the output', () => {
    // `spec.md`'s "Input state is not mutated" scenario is about step()
    // mutating the input; this is the sharper, adversarial direction — a
    // caller mutating the input *after* the call, through a raw array
    // reference `field()` deliberately hands out (component.ts documents it
    // as "the unchecked hot path"). SimState.clone's use of `.slice()` for
    // every typed array should make the output wholly independent storage.
    let state = createState({ rootSeed: 1, schema: world });
    state = step(state, [{ kind: 1 }], rngFromRootSeed(1));
    const inputHpArray = state.component('vitality').field('hp');

    const output = step(state, [], rngFromRootSeed(1));
    const beforeMutation = snapshotHash(output);

    // Corrupt the array captured from `state` (now the *input* to the second
    // step) after the fact.
    inputHpArray[0] = 999999;

    expect(snapshotHash(output)).toBe(beforeMutation);
  });

  it('PASSES: mutating an array captured from the returned state does not affect a state produced from it earlier in the lineage', () => {
    const state = createState({ rootSeed: 2, schema: world });
    const state0 = step(state, [{ kind: 1 }], rngFromRootSeed(2));
    const hash0 = snapshotHash(state0);
    const state1 = step(state0, [], rngFromRootSeed(2));

    // Mutate state1's array directly.
    const hpArray1 = state1.component('vitality').field('hp');
    hpArray1[0] = 12345;

    // state0, the ancestor, must be unaffected — it was cloned *into* state1,
    // not shared with it.
    expect(snapshotHash(state0)).toBe(hash0);
  });

  it('PASSES: a component that grows past a capacity doubling during a step still clones correctly into the next step', () => {
    // component.ts's #ensureRows doubles capacity and replaces the backing
    // array. Exercises clone immediately after a growth event, to catch any
    // assumption that clone reads a fixed-size array.
    const growing: System = {
      name: 'growing',
      run(ctx) {
        if (ctx.tick === 0) {
          const component = ctx.state.component('vitality');
          for (let i = 0; i < 40; i += 1) {
            // MIN_ROWS is 8; 40 forces at least two doublings.
            const handle = ctx.state.entities.create();
            component.add(handle);
            component.set(handle, 'hp', i);
          }
        }
      },
    };
    const schema = defineWorld({ components: [vitality], systems: [growing] });
    let state = createState({ rootSeed: 3, schema });
    state = step(state, [], rngFromRootSeed(3));
    expect(state.component('vitality').size).toBe(40);

    const next = step(state, [], rngFromRootSeed(3));
    expect(next.component('vitality').size).toBe(40);
    for (let i = 0; i < 40; i += 1) {
      const handle = next.entities.handleAt(i);
      expect(next.component('vitality').get(handle, 'hp')).toBe(i);
    }
    // Original values in `state` must survive independently of `next`.
    for (let i = 0; i < 40; i += 1) {
      const handle = state.entities.handleAt(i);
      expect(state.component('vitality').get(handle, 'hp')).toBe(i);
    }
  });

  it('confirms the documented hazard: a field() reference captured before a same-tick growth silently loses writes', () => {
    // Not a defect in the core — component.ts's own doc comment on `field()`
    // warns explicitly: "Re-fetch it after any `add`: growing the component
    // replaces the array, and a reference captured beforehand would keep
    // writing into the abandoned buffer." This test exists to confirm that
    // warning describes a real, currently-live hazard (so any future change
    // that quietly made growth preserve old references would be a silent
    // behaviour change future rules authors would need to know about), and
    // to make the hazard visible to anyone writing a rules-layer system
    // against this API.
    const trap: System = {
      name: 'trap',
      run(ctx) {
        const component = ctx.state.component('vitality');
        const staleArray = component.field('hp'); // captured before growth
        for (let i = 0; i < 20; i += 1) {
          const handle = ctx.state.entities.create();
          component.add(handle); // may replace the backing array partway through
        }
        // Writing through the stale reference — per the documented hazard,
        // these writes land in the abandoned buffer and are lost.
        staleArray[0] = 777;
      },
    };
    const schema = defineWorld({ components: [vitality], systems: [trap] });
    const state = createState({ rootSeed: 4, schema });
    const after = step(state, [], rngFromRootSeed(4));

    const handle0 = after.entities.handleAt(0);
    // The write through the stale array was lost; the row keeps its
    // zero-initialised value, not 777.
    expect(after.component('vitality').get(handle0, 'hp')).toBe(0);
  });
});

describe('capturing ctx in a closure and using it after step() returns', () => {
  it('PASSES: a stale requestEngagement()/requestWorldTime() call after step() returns has no effect on any state', () => {
    let capturedCtx: StepContext | undefined;
    const capture: System = {
      name: 'capture',
      run(ctx) {
        capturedCtx = ctx;
      },
    };
    const schema = defineWorld({ components: [], systems: [capture] });
    let state = createState({ rootSeed: 5, schema });
    state = step(state, [], rngFromRootSeed(5));
    expect(capturedCtx).toBeDefined();

    // Call the closures after the step that captured them has long since
    // returned and its `transition` variable has already been consumed.
    capturedCtx?.requestEngagement();
    capturedCtx?.requestWorldTime();

    // Neither the already-returned state nor a subsequent step should be
    // affected — the closures close over a `transition` local that step()
    // already read and discarded.
    expect(state.clock.mode).toBe(0); // TIME_MODE.world
    const next = step(state, [], rngFromRootSeed(5));
    expect(next.clock.mode).toBe(0);
  });

  it('PASSES: ctx.state captured in a closure is simply the returned state, not a live view of future steps', () => {
    let capturedState: StepContext['state'] | undefined;
    // Capture once, on the first step only. The original version of this test
    // reassigned on every step, so the second step overwrote the capture and
    // the test failed against its own bookkeeping rather than against `step`.
    const capture: System = {
      name: 'capture',
      run(ctx) {
        capturedState ??= ctx.state;
      },
    };
    const schema = defineWorld({ components: [vitality], systems: [capture, spawning] });
    let state = createState({ rootSeed: 6, schema });
    state = step(state, [{ kind: 1 }], rngFromRootSeed(6));
    expect(capturedState).toBe(state); // ctx.state === the state step() returned this call

    // A later step must not retroactively be visible through the old
    // capture — capturedState is a snapshot-in-time object, not a live
    // window onto the lineage.
    const hashAfterFirstStep = snapshotHash(capturedState as StepContext['state']);
    step(state, [{ kind: 1 }], rngFromRootSeed(6));
    expect(snapshotHash(capturedState as StepContext['state'])).toBe(hashAfterFirstStep);
  });
});

describe('atomicity when a system throws', () => {
  it('PASSES: the caller`s input state is untouched when a later system throws', () => {
    // Throws from tick 1 onward, so the baseline step at tick 0 can establish
    // a state to compare against. The original version threw unconditionally,
    // which meant the baseline step threw too and the test never reached its
    // own assertion.
    const throwing: System = {
      name: 'throwing',
      run(ctx) {
        if (ctx.tick > 0) {
          throw new Error('deliberate failure inside a system');
        }
      },
    };
    const schema = defineWorld({ components: [vitality], systems: [spawning, throwing] });
    let state = createState({ rootSeed: 7, schema });
    state = step(state, [], rngFromRootSeed(7)); // baseline at tick 0, before `throwing` fires
    const before = snapshotHash(state);

    expect(() => step(state, [{ kind: 1 }], rngFromRootSeed(7))).toThrow(
      /deliberate failure/,
    );

    // The mutations `spawning` made to the *working copy* before `throwing`
    // ran are never surfaced anywhere the caller can reach, because `step`
    // never returns when a system throws. The caller's own reference is the
    // original, untouched state.
    expect(snapshotHash(state)).toBe(before);
    expect(state.entities.liveCount).toBe(0);
  });

  it('PASSES: an entity store that hits its bound propagates the error rather than silently truncating', () => {
    const smallWorld = defineWorld({ components: [vitality], systems: [spawning], maxSlots: 3 });
    let state = createState({ rootSeed: 8, schema: smallWorld });
    // Fill exactly to the bound.
    state = step(state, [{ kind: 1 }, { kind: 1 }, { kind: 1 }], rngFromRootSeed(8));
    expect(state.entities.liveCount).toBe(3);
    const before = snapshotHash(state);

    expect(() => step(state, [{ kind: 1 }], rngFromRootSeed(8))).toThrow(/full/i);
    // Input untouched, same atomicity guarantee as the throwing-system case.
    expect(snapshotHash(state)).toBe(before);
  });
});

describe('two independently created states never share storage', () => {
  it('PASSES: field() arrays from two createState() calls against the same schema are distinct objects', () => {
    const a = createState({ rootSeed: 9, schema: world });
    const b = createState({ rootSeed: 9, schema: world });
    expect(a.component('vitality').field('hp')).not.toBe(b.component('vitality').field('hp'));
  });
});
