/*
 * Multiverse Mages — the pure step contract.
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
import { nextUint32 } from '../../src/rng/pcg32.js';
import { rngFromRootSeed } from '../../src/rng/source.js';
import { RNG_STREAM } from '../../src/rng/streams.js';
import { snapshotHash } from '../../src/snapshot/snapshot.js';
import type { StepContext, System } from '../../src/state.js';
import { createState, defineWorld } from '../../src/state.js';
import { CORE_ACTION, step } from '../../src/step.js';

const vitality = { name: 'vitality', fields: { hp: 'i32' } } as const;

/** Ages every entity by one point of hp per tick, so a tick is observable. */
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

/** Spawns one entity per action of kind 1, so actions are observable. */
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

const seededState = (rootSeed = 20260810 >>> 0) => createState({ rootSeed, schema: world });

describe('step is pure', () => {
  it('produces identical output for identical input', () => {
    const a = seededState();
    const b = seededState();
    const actions = [{ kind: 1 }, { kind: 1 }];

    const afterA = step(a, actions, rngFromRootSeed(a.rootSeed));
    const afterB = step(b, actions, rngFromRootSeed(b.rootSeed));

    expect(snapshotHash(afterA)).toBe(snapshotHash(afterB));
  });

  it('does not mutate the state it was given', () => {
    const state = seededState();
    const before = snapshotHash(state);

    step(state, [{ kind: 1 }, { kind: 1 }], rngFromRootSeed(state.rootSeed));

    expect(snapshotHash(state)).toBe(before);
    expect(state.entities.liveCount).toBe(0);
    expect(state.clock.worldTick).toBe(0);
  });

  it('returns a new state rather than the one passed in', () => {
    const state = seededState();
    expect(step(state, [], rngFromRootSeed(state.rootSeed))).not.toBe(state);
  });

  it('gives the same result however fast the caller drives it', () => {
    // "Caller owns time" has no wall-clock surface to test directly, which is
    // the point: there is no input by which a slow caller could differ. What is
    // testable is that stepping N times in a row equals stepping N times with
    // unrelated work interleaved.
    const fast = seededState();
    let fastState = fast;
    for (let i = 0; i < 12; i += 1) {
      fastState = step(fastState, [{ kind: 1 }], rngFromRootSeed(fastState.rootSeed));
    }

    const slow = seededState();
    let slowState = slow;
    for (let i = 0; i < 12; i += 1) {
      // Interleaved work that touches an unrelated state, standing in for a
      // client rendering a frame between steps.
      const distraction = seededState();
      step(distraction, [{ kind: 1 }], rngFromRootSeed(distraction.rootSeed));
      slowState = step(slowState, [{ kind: 1 }], rngFromRootSeed(slowState.rootSeed));
    }

    expect(snapshotHash(slowState)).toBe(snapshotHash(fastState));
  });

  it('advances the clock exactly once per call', () => {
    let state = seededState();
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    expect(state.clock.worldTick).toBe(2);
  });

  it('runs systems in declaration order', () => {
    const order: string[] = [];
    const record = (name: string): System => ({
      name,
      run: () => {
        order.push(name);
      },
    });
    const schema = defineWorld({
      components: [],
      systems: [record('first'), record('second'), record('third')],
    });
    const state = createState({ rootSeed: 1, schema });
    step(state, [], rngFromRootSeed(1));
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('runs systems at the incoming tick, not the outgoing one', () => {
    const seen: number[] = [];
    const schema = defineWorld({
      components: [],
      systems: [{ name: 'observe', run: (ctx) => void seen.push(ctx.tick) }],
    });
    let state = createState({ rootSeed: 1, schema });
    for (let i = 0; i < 3; i += 1) {
      state = step(state, [], rngFromRootSeed(1));
    }
    expect(seen).toEqual([0, 1, 2]);
  });
});

describe('systems see a working copy', () => {
  it('applies system mutations to the returned state', () => {
    let state = seededState();
    state = step(state, [{ kind: 1 }], rngFromRootSeed(state.rootSeed));
    expect(state.entities.liveCount).toBe(1);

    const handle = state.entities.handleAt(0);
    // Spawned this tick, then aged by the ageing system in the same tick.
    expect(state.component('vitality').get(handle, 'hp')).toBe(1);

    state = step(state, [], rngFromRootSeed(state.rootSeed));
    expect(state.component('vitality').get(handle, 'hp')).toBe(2);
  });
});

describe('randomness reaches systems through the stream registry', () => {
  it('hands a system the stream for its subsystem at the current tick', () => {
    const drawn: number[] = [];
    const schema = defineWorld({
      components: [],
      systems: [
        {
          name: 'roll',
          run: (ctx: StepContext) => {
            const stream = ctx.rng.stream(RNG_STREAM.mortality, ctx.tick);
            drawn.push(nextUint32(stream));
          },
        },
      ],
    });

    let state = createState({ rootSeed: 99, schema });
    state = step(state, [], rngFromRootSeed(99));
    // The second tick's result is never read: what is under test is what the
    // system was handed, which `drawn` already captured.
    step(state, [], rngFromRootSeed(99));

    const rng = rngFromRootSeed(99);
    expect(drawn).toEqual([
      nextUint32(rng.stream(RNG_STREAM.mortality, 0)),
      nextUint32(rng.stream(RNG_STREAM.mortality, 1)),
    ]);
  });

  it('rejects an rng whose root seed disagrees with the state', () => {
    const state = seededState(5);
    expect(() => step(state, [], rngFromRootSeed(6))).toThrow(/root seed/i);
  });
});

describe('mode transitions are action-driven', () => {
  it('enters engagement on the core action and freezes world time', () => {
    let state = seededState();
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    expect(state.clock.worldTick).toBe(2);

    state = step(state, [{ kind: CORE_ACTION.enterEngagement }], rngFromRootSeed(state.rootSeed));
    expect(state.clock.mode).toBe(TIME_MODE.engagement);
    expect(state.clock.worldTick).toBe(2);
    expect(state.clock.engagementTick).toBe(1);

    state = step(state, [], rngFromRootSeed(state.rootSeed));
    expect(state.clock.worldTick).toBe(2);
    expect(state.clock.engagementTick).toBe(2);
  });

  it('resumes world time on leaving engagement', () => {
    let state = seededState();
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    state = step(state, [{ kind: CORE_ACTION.enterEngagement }], rngFromRootSeed(state.rootSeed));
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    state = step(state, [{ kind: CORE_ACTION.leaveEngagement }], rngFromRootSeed(state.rootSeed));

    expect(state.clock.mode).toBe(TIME_MODE.world);
    expect(state.clock.worldTick).toBe(2);
    expect(state.clock.engagementTick).toBe(0);
  });

  it('lets a system request a transition, for raids that begin as a consequence', () => {
    const schema = defineWorld({
      components: [],
      systems: [
        {
          name: 'portal',
          run: (ctx) => {
            if (ctx.tick === 3 && ctx.mode === TIME_MODE.world) {
              ctx.requestEngagement();
            }
          },
        },
      ],
    });
    let state = createState({ rootSeed: 1, schema });
    for (let i = 0; i < 5; i += 1) {
      state = step(state, [], rngFromRootSeed(1));
    }
    expect(state.clock.mode).toBe(TIME_MODE.engagement);
    expect(state.clock.worldTick).toBe(3);
    expect(state.clock.engagementTick).toBe(2);
  });

  it('treats a redundant transition as an illegal action, not an exception', () => {
    // contracts.md §4.2: an illegal action is a no-op and a counter increment,
    // never an exception. An RL agent will submit these constantly.
    let state = seededState();
    state = step(state, [{ kind: CORE_ACTION.leaveEngagement }], rngFromRootSeed(state.rootSeed));
    expect(state.clock.mode).toBe(TIME_MODE.world);
    expect(state.illegalActionCount).toBe(1);

    state = step(state, [{ kind: CORE_ACTION.enterEngagement }], rngFromRootSeed(state.rootSeed));
    state = step(state, [{ kind: CORE_ACTION.enterEngagement }], rngFromRootSeed(state.rootSeed));
    expect(state.clock.mode).toBe(TIME_MODE.engagement);
    expect(state.illegalActionCount).toBe(2);
  });

  it('ignores a no-op action', () => {
    let state = seededState();
    state = step(state, [{ kind: CORE_ACTION.noop }], rngFromRootSeed(state.rootSeed));
    expect(state.illegalActionCount).toBe(0);
    expect(state.clock.worldTick).toBe(1);
  });
});
