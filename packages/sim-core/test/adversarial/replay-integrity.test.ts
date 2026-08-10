/*
 * Multiverse Mages — adversarial: replay integrity against malformed and
 * hostile recordings.
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
import { snapshotHash } from '../../src/snapshot/snapshot.js';
import type { System } from '../../src/state.js';
import { createState, defineWorld } from '../../src/state.js';

const vitality = { name: 'vitality', fields: { hp: 'i32' } } as const;

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

const world = defineWorld({ components: [vitality], systems: [spawning, ageing] });
const ROOT_SEED = 424242;

function recordThreeTicks(): Recorder {
  const state = createState({ rootSeed: ROOT_SEED, schema: world });
  const recorder = new Recorder(state);
  recorder.step([{ kind: 1 }], rngFromRootSeed(ROOT_SEED));
  recorder.step([{ kind: 1 }], rngFromRootSeed(ROOT_SEED));
  recorder.step([{ kind: 1 }], rngFromRootSeed(ROOT_SEED));
  return recorder;
}

describe('a recording whose declared tickCount disagrees with its action log', () => {
  // `Recording.tickCount`'s own doc comment states the invariant plainly:
  // "Steps taken. Always equal to actionLog.length." That invariant holds
  // for every `Recording` a `Recorder` produces, because `recording` derives
  // `tickCount` from `actionLog.length` directly. But `Recording` is a plain
  // interface, not a validated value type: nothing stops a caller — a
  // hand-built recording, a partially-corrupted fixture, a value that
  // survived a lossy transport — from constructing one where the two
  // disagree.
  //
  // **History.** At the time this file was first written, neither `replay`
  // nor `replayAndLocate` checked that `tickCount` and `actionLog.length`
  // agreed before using `tickCount` as the loop bound and `actionLog.at()`
  // (which falls back to `[]` for any index past the log's real length) to
  // fetch each tick's actions — so a mismatched recording replayed
  // successfully to a *different, silently wrong* final state instead of
  // being rejected. `replayer.ts` now has an `assertConsistentLength` guard,
  // called at the top of both `replay` and `replayAndLocate`, that throws a
  // descriptive error on exactly this mismatch. The tests below are kept as
  // regression guards.

  it('REGRESSION GUARD: rejects a tickCount larger than the action log rather than padding the run with extra no-op ticks', () => {
    const recorder = recordThreeTicks();
    const real = recorder.recording;
    expect(real.tickCount).toBe(3);
    expect(real.actionLog.length).toBe(3);

    // Claims 5 ticks happened; only 3 are actually recorded.
    const tampered = { ...real, tickCount: 5 };
    expect(() => replay(tampered, world)).toThrow(/tickCount|ticks but its action log/i);
  });

  it('REGRESSION GUARD: rejects a tickCount smaller than the action log rather than silently truncating the replay', () => {
    const recorder = recordThreeTicks();
    const real = recorder.recording;

    // Claims only 1 tick happened; 3 are actually recorded.
    const tampered = { ...real, tickCount: 1 };
    expect(() => replay(tampered, world)).toThrow(/tickCount|ticks but its action log/i);
  });

  it('REGRESSION GUARD: replayAndLocate rejects the same mismatch, not just replay', () => {
    const recorder = recordThreeTicks();
    const tampered = { ...recorder.recording, tickCount: 5 };
    expect(() => replayAndLocate(tampered, world)).toThrow(/tickCount|ticks but its action log/i);
  });

  it('PASSES: a well-formed recording (tickCount === actionLog.length) is unaffected by the guard', () => {
    // The control for the REGRESSION GUARD tests above: the guard is
    // specifically about disagreement between the two fields, not about
    // replay rejecting recordings in general.
    const recorder = recordThreeTicks();
    const genuine = replay(recorder.recording, world);
    expect(genuine.clock.worldTick).toBe(3);
    expect(() => replay(recorder.recording, world)).not.toThrow();
  });
});

describe('boundary recordings', () => {
  it('PASSES: a zero-tick recording replays to exactly the initial snapshot', () => {
    const state = createState({ rootSeed: ROOT_SEED, schema: world });
    const recorder = new Recorder(state);
    const recording = recorder.recording;
    expect(recording.tickCount).toBe(0);

    const replayed = replay(recording, world);
    expect(snapshotHash(replayed)).toBe(snapshotHash(state));
  });

  it('PASSES: replayAndLocate on a zero-tick recording reports no divergence', () => {
    const state = createState({ rootSeed: ROOT_SEED, schema: world });
    const recorder = new Recorder(state, { traceHashes: true });
    const result = replayAndLocate(recorder.recording, world);
    expect(result.diverged).toBe(false);
    expect(result.tick).toBeNull();
  });

  it('PASSES: divergence is located at tick 0 when the very first step differs', () => {
    const state = createState({ rootSeed: ROOT_SEED, schema: world });
    const traced = new Recorder(state, { traceHashes: true });
    traced.step([{ kind: 1 }], rngFromRootSeed(ROOT_SEED));
    traced.step([{ kind: 1 }], rngFromRootSeed(ROOT_SEED));
    traced.step([{ kind: 1 }], rngFromRootSeed(ROOT_SEED));

    const tampered = {
      ...traced.recording,
      tickHashes: traced.recording.tickHashes!.map((hash, tick) => (tick === 0 ? '0'.repeat(16) : hash)),
    };
    const result = replayAndLocate(tampered, world);
    expect(result.diverged).toBe(true);
    expect(result.tick).toBe(0);
  });

  it('PASSES: divergence is located at the very last tick, not reported as "no divergence"', () => {
    const state = createState({ rootSeed: ROOT_SEED, schema: world });
    const traced = new Recorder(state, { traceHashes: true });
    traced.step([{ kind: 1 }], rngFromRootSeed(ROOT_SEED));
    traced.step([{ kind: 1 }], rngFromRootSeed(ROOT_SEED));
    traced.step([{ kind: 1 }], rngFromRootSeed(ROOT_SEED));

    const lastIndex = traced.recording.tickHashes!.length - 1;
    const tampered = {
      ...traced.recording,
      tickHashes: traced.recording.tickHashes!.map((hash, tick) =>
        tick === lastIndex ? '0'.repeat(16) : hash,
      ),
    };
    const result = replayAndLocate(tampered, world);
    expect(result.diverged).toBe(true);
    expect(result.tick).toBe(lastIndex);
  });
});

describe('replaying against a schema with the same systems in a different order', () => {
  it('PASSES: reordering systems changes the result, and replayAndLocate catches it', () => {
    // "Same systems, different order is a different game" — this must
    // diverge, not silently replay to the same hash. spawning-then-ageing
    // means a mage spawned this tick is aged this tick too (hp 1 after tick
    // 0); ageing-then-spawning means a mage spawned this tick is aged next
    // tick instead (hp 0 after tick 0). The two orders are observably
    // different rules.
    const reordered = defineWorld({ components: [vitality], systems: [ageing, spawning] });

    const state = createState({ rootSeed: ROOT_SEED, schema: world });
    const traced = new Recorder(state, { traceHashes: true });
    traced.step([{ kind: 1 }], rngFromRootSeed(ROOT_SEED));
    traced.step([], rngFromRootSeed(ROOT_SEED));

    const result = replayAndLocate(traced.recording, reordered);
    expect(result.diverged).toBe(true);
    expect(result.tick).toBe(0);
  });
});

describe('recording is additive, not observed by the core', () => {
  it('PASSES: recording with traceHashes on produces byte-identical states to traceHashes off, at every tick', () => {
    const withTrace = (() => {
      const state = createState({ rootSeed: ROOT_SEED, schema: world });
      const recorder = new Recorder(state, { traceHashes: true });
      recorder.step([{ kind: 1 }], rngFromRootSeed(ROOT_SEED));
      recorder.step([{ kind: 1 }], rngFromRootSeed(ROOT_SEED));
      return recorder;
    })();
    const withoutTrace = (() => {
      const state = createState({ rootSeed: ROOT_SEED, schema: world });
      const recorder = new Recorder(state, { traceHashes: false });
      recorder.step([{ kind: 1 }], rngFromRootSeed(ROOT_SEED));
      recorder.step([{ kind: 1 }], rngFromRootSeed(ROOT_SEED));
      return recorder;
    })();
    expect(snapshotHash(withTrace.state)).toBe(snapshotHash(withoutTrace.state));
  });

  it('PASSES: mutating the caller`s params array after recording does not retroactively change the log', () => {
    const state = createState({ rootSeed: ROOT_SEED, schema: world });
    const recorder = new Recorder(state);
    const params = [7, 8, 9];
    recorder.step([{ kind: 1, params }], rngFromRootSeed(ROOT_SEED));
    params.push(10);
    params[0] = -1;
    expect(recorder.recording.actionLog.at(0)[0]?.params).toEqual([7, 8, 9]);
  });
});

describe('ActionLog.fromJSON against hostile input', () => {
  it('rejects a huge nested object standing in for kind', () => {
    expect(() => ActionLog.fromJSON({ ticks: [[{ kind: { nested: true } }]] })).toThrow(/integer/i);
  });

  it('rejects a tick entry that is not an array', () => {
    expect(() => ActionLog.fromJSON({ ticks: [{ kind: 1 }] })).toThrow(/array of actions/i);
  });

  it('rejects a non-action entry inside a tick', () => {
    expect(() => ActionLog.fromJSON({ ticks: [[null]] })).toThrow(/non-action/i);
    expect(() => ActionLog.fromJSON({ ticks: [['not-an-action']] })).toThrow(/non-action/i);
  });

  it('rejects a missing kind field', () => {
    expect(() => ActionLog.fromJSON({ ticks: [[{}]] })).toThrow(/integer/i);
  });

  it('rejects an entirely malformed top-level value', () => {
    expect(() => ActionLog.fromJSON(null)).toThrow(/malformed/i);
    expect(() => ActionLog.fromJSON('not an action log')).toThrow(/malformed/i);
    expect(() => ActionLog.fromJSON(42)).toThrow(/malformed/i);
  });

  it('AMBIGUITY: accepts a negative action kind without complaint', () => {
    // `assertInteger` in recorder.ts checks `Number.isInteger`, not range.
    // `Action.kind` in state.ts is typed as a bare `number` with no
    // documented non-negative constraint, and CORE_ACTION values occupy the
    // *top* of the uint16 range specifically so as not to collide with the
    // god's action space (0-15) — nothing states the domain excludes
    // negatives. A negative kind will simply fail to match any CORE_ACTION
    // or god-action branch and fall through as "somebody else's vocabulary"
    // per step.ts's own comment, so this is not obviously wrong — but it
    // does mean a corrupted fixture with a negative kind loads silently
    // rather than failing the way a non-integer or a nested-object kind
    // does, which is worth a reader's attention even without a spec
    // citation to call it a defect.
    const log = ActionLog.fromJSON({ ticks: [[{ kind: -5 }]] });
    expect(log.at(0)).toEqual([{ kind: -5 }]);
  });

  it('PASSES: accepts a large but well-formed action log without truncating or crashing', () => {
    const many = Array.from({ length: 5000 }, (_unused, i) => ({ kind: i % 16 }));
    const log = ActionLog.fromJSON({ ticks: [many] });
    expect(log.at(0)).toHaveLength(5000);
    expect(log.at(0)[4999]).toEqual({ kind: 4999 % 16 });
  });

  it('PASSES: an object-form __proto__ key parsed from JSON text does not pollute Object.prototype', () => {
    // JSON.parse assigns "__proto__" as an ordinary own property (via
    // [[DefineOwnProperty]]), not via the prototype-setting object-literal
    // syntax, so this is really testing that fromJSON's field access
    // (`action.__proto__` is never read as anything but data) does not
    // accidentally trigger prototype assignment either.
    const parsed: unknown = JSON.parse(
      '{"ticks":[[{"kind":1,"__proto__":{"polluted":true}}]]}',
    );
    const log = ActionLog.fromJSON(parsed);
    expect(log.at(0)).toEqual([{ kind: 1 }]);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('rejects a params array containing a nested object', () => {
    expect(() => ActionLog.fromJSON({ ticks: [[{ kind: 1, params: [{}] }]] })).toThrow(/integer/i);
  });

  it('accepts the bare-array top-level form documented as an alternative to {ticks: [...]}', () => {
    const log = ActionLog.fromJSON([[{ kind: 1 }], []]);
    expect(log.length).toBe(2);
    expect(log.at(0)).toEqual([{ kind: 1 }]);
  });
});

describe('replay is independent of the caller consulting onTick', () => {
  it('PASSES: onTick observing state does not perturb the replay result', () => {
    const recorder = recordThreeTicks();
    const observedTicks: number[] = [];
    const replayed = replay(recorder.recording, world, {
      onTick: (tick) => {
        observedTicks.push(tick);
      },
    });
    expect(observedTicks).toEqual([0, 1, 2]);
    expect(snapshotHash(replayed)).toBe(snapshotHash(recorder.state));
  });
});
