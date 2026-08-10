/*
 * Multiverse Mages — action-log recording and replay tests.
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

import { ActionLog, Recorder } from '../../src/replay/recorder.js';
import { replay, replayAndLocate } from '../../src/replay/replayer.js';
import { rngFromRootSeed } from '../../src/rng/source.js';
import { RNG_STREAM } from '../../src/rng/streams.js';
import { nextBounded } from '../../src/rng/pcg32.js';
import { snapshotHash } from '../../src/snapshot/snapshot.js';
import type { System } from '../../src/state.js';
import { createState, defineWorld } from '../../src/state.js';
import { CORE_ACTION, step } from '../../src/step.js';

const vitality = { name: 'vitality', fields: { hp: 'i32' } } as const;

/** Spawns on action 1, kills on action 2, and rolls damage every tick. */
const rules: System = {
  name: 'rules',
  run(ctx) {
    const component = ctx.state.component('vitality');
    for (const action of ctx.actions) {
      if (action.kind === 1) {
        const handle = ctx.state.entities.create();
        component.add(handle);
        component.set(handle, 'hp', 1000);
      }
      if (action.kind === 2 && action.params !== undefined) {
        const slot = action.params[0] as number;
        const handle = ctx.state.entities.handleAt(slot);
        if (handle !== 0) {
          ctx.state.entities.destroy(handle);
        }
      }
    }

    const stream = ctx.rng.stream(RNG_STREAM.combat);
    const hp = component.field('hp');
    component.forEach((row) => {
      hp[row] = (hp[row] as number) - nextBounded(stream, 8);
    });
  },
};

const world = defineWorld({ components: [vitality], systems: [rules] });
const ROOT_SEED = 606060;

/** The action script both the original run and every replay use. */
const script: { tick: number; actions: { kind: number; params?: number[] }[] }[] = [
  { tick: 0, actions: [{ kind: 1 }, { kind: 1 }] },
  { tick: 1, actions: [{ kind: 1 }] },
  { tick: 2, actions: [] },
  { tick: 3, actions: [{ kind: 2, params: [1] }, { kind: 1 }] },
  { tick: 4, actions: [{ kind: CORE_ACTION.enterEngagement }] },
  { tick: 5, actions: [{ kind: 1 }] },
  { tick: 6, actions: [{ kind: CORE_ACTION.leaveEngagement }] },
  { tick: 7, actions: [] },
];

function runUnrecorded(): string {
  let state = createState({ rootSeed: ROOT_SEED, schema: world });
  for (const entry of script) {
    state = step(state, entry.actions, rngFromRootSeed(ROOT_SEED));
  }
  return snapshotHash(state);
}

function runRecorded(options?: { traceHashes?: boolean }) {
  const state = createState({ rootSeed: ROOT_SEED, schema: world });
  const recorder = new Recorder(state, options);
  for (const entry of script) {
    recorder.step(entry.actions, rngFromRootSeed(ROOT_SEED));
  }
  return recorder;
}

describe('recording does not change results', () => {
  it('produces the same final hash as an unrecorded run', () => {
    expect(snapshotHash(runRecorded().state)).toBe(runUnrecorded());
  });

  it('produces the same final hash with hash tracing on as with it off', () => {
    expect(snapshotHash(runRecorded({ traceHashes: true }).state)).toBe(
      snapshotHash(runRecorded({ traceHashes: false }).state),
    );
  });
});

describe('the action log', () => {
  it('preserves each action tick and the order within that tick', () => {
    const log = runRecorded().recording.actionLog;
    expect(log.at(0).map((a) => a.kind)).toEqual([1, 1]);
    expect(log.at(2)).toEqual([]);
    expect(log.at(3).map((a) => a.kind)).toEqual([2, 1]);
    expect(log.at(3)[0]?.params).toEqual([1]);
  });

  it('records the tick the action was applied at, across a mode change', () => {
    // Ticks 5 and 6 are engagement ticks 1 and 2 by the clock, but the log
    // indexes by step ordinal — a raid does not restart the log.
    const log = runRecorded().recording.actionLog;
    expect(log.length).toBe(script.length);
    expect(log.at(5).map((a) => a.kind)).toEqual([1]);
    expect(log.at(6).map((a) => a.kind)).toEqual([CORE_ACTION.leaveEngagement]);
  });

  it('is unaffected by later mutation of the caller`s action array', () => {
    const state = createState({ rootSeed: ROOT_SEED, schema: world });
    const recorder = new Recorder(state);
    const actions = [{ kind: 1 }];
    recorder.step(actions, rngFromRootSeed(ROOT_SEED));
    actions.push({ kind: 2 });
    actions[0] = { kind: 99 };
    expect(recorder.recording.actionLog.at(0).map((a) => a.kind)).toEqual([1]);
  });

  it('round-trips through a plain JSON value, for fixtures on disk', () => {
    const log = runRecorded().recording.actionLog;
    const restored = ActionLog.fromJSON(JSON.parse(JSON.stringify(log.toJSON())) as unknown);
    expect(restored.length).toBe(log.length);
    expect(restored.at(3).map((a) => a.kind)).toEqual(log.at(3).map((a) => a.kind));
    expect(restored.at(3)[0]?.params).toEqual([1]);
  });

  it('rejects malformed JSON rather than replaying something else', () => {
    expect(() => ActionLog.fromJSON({ ticks: 'nope' })).toThrow(/action log/i);
    expect(() => ActionLog.fromJSON({ ticks: [[{ kind: 1.5 }]] })).toThrow(/integer/i);
    expect(() => ActionLog.fromJSON({ ticks: [[{ kind: 1, params: [0.5] }]] })).toThrow(/integer/i);
  });
});

describe('replay reproduces a run exactly', () => {
  it('matches the original final hash', () => {
    const recorder = runRecorded();
    const replayed = replay(recorder.recording, world);
    expect(snapshotHash(replayed)).toBe(snapshotHash(recorder.state));
  });

  it('replays from the initial snapshot, not from a fresh state', () => {
    // Start the recording from an already-populated world, so a replayer that
    // ignored the initial snapshot would produce a plausible but wrong result
    // rather than an obviously empty one.
    let seeded = createState({ rootSeed: ROOT_SEED, schema: world });
    seeded = step(seeded, [{ kind: 1 }, { kind: 1 }, { kind: 1 }], rngFromRootSeed(ROOT_SEED));

    const recorder = new Recorder(seeded);
    for (const entry of script) {
      recorder.step(entry.actions, rngFromRootSeed(ROOT_SEED));
    }
    expect(snapshotHash(replay(recorder.recording, world))).toBe(snapshotHash(recorder.state));
    expect(replay(recorder.recording, world).entities.slotCount).toBeGreaterThan(0);
  });

  it('is independent of replay speed', () => {
    const recorder = runRecorded();
    const fast = replay(recorder.recording, world);

    // Stand-in for a slow caller: unrelated work between steps. There is no
    // wall-clock input by which a delay could reach the core, which is the
    // property under test.
    const slow = replay(recorder.recording, world, {
      onTick: () => {
        const noise = createState({ rootSeed: 1, schema: world });
        step(noise, [{ kind: 1 }], rngFromRootSeed(1));
      },
    });

    expect(snapshotHash(slow)).toBe(snapshotHash(fast));
  });
});

describe('divergence is located, not merely detected', () => {
  it('reports no divergence for a faithful replay', () => {
    const recorder = runRecorded({ traceHashes: true });
    const result = replayAndLocate(recorder.recording, world);
    expect(result.diverged).toBe(false);
    expect(result.tick).toBeNull();
    expect(snapshotHash(result.state)).toBe(snapshotHash(recorder.state));
  });

  it('names the earliest diverging tick, not merely that it diverged', () => {
    const recorder = runRecorded({ traceHashes: true });
    const tampered = {
      ...recorder.recording,
      tickHashes: recorder.recording.tickHashes!.map((hash, tick) =>
        tick >= 4 ? '0000000000000000' : hash,
      ),
    };

    const result = replayAndLocate(tampered, world);
    expect(result.diverged).toBe(true);
    expect(result.tick).toBe(4);
  });

  it('locates a divergence caused by a genuinely different rule', () => {
    const recorder = runRecorded({ traceHashes: true });
    const drifted = defineWorld({
      components: [vitality],
      systems: [
        {
          name: 'rules',
          run(ctx) {
            rules.run(ctx);
            if (ctx.tick === 2) {
              ctx.state.entities.create();
            }
          },
        },
      ],
    });

    const result = replayAndLocate(recorder.recording, drifted);
    expect(result.diverged).toBe(true);
    expect(result.tick).toBe(2);
  });

  it('says so plainly when the recording carries no per-tick hashes', () => {
    const recorder = runRecorded({ traceHashes: false });
    expect(recorder.recording.tickHashes).toBeUndefined();
    const result = replayAndLocate(
      { ...recorder.recording, finalHash: '0000000000000000' },
      world,
    );
    expect(result.diverged).toBe(true);
    expect(result.tick).toBeNull();
    expect(result.reason).toMatch(/traceHashes|per-tick/i);
  });
});
