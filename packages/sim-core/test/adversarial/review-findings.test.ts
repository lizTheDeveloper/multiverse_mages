/*
 * Multiverse Mages — regression guards for the 0.1.0 code review findings.
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
 * Six defects found by review after the builders and the breakers had both
 * finished and the suite was green. Each is guarded here.
 *
 * Worth recording why a third pass found anything at all: the builders tested
 * what the code was for, and the breakers attacked what it did. These are
 * mostly failures of *meaning* — a counter that counts the wrong population, a
 * message that misdescribes its own cause, randomness keyed on a number that
 * does not identify what it claims to. None of them made a test fail, and the
 * first one would never have made a test fail, in any suite, ever. It would
 * have shown up as an unexplained correlation in a balance report months later.
 */

import { describe, expect, it } from 'vitest';

import { TIME_MODE } from '../../src/clock.js';
import { nextUint32 } from '../../src/rng/pcg32.js';
import { rngFromRootSeed } from '../../src/rng/source.js';
import { RNG_STREAM } from '../../src/rng/streams.js';
import { Recorder } from '../../src/replay/recorder.js';
import { replay, replayAndLocate } from '../../src/replay/replayer.js';
import type { System } from '../../src/state.js';
import { createState, defineWorld } from '../../src/state.js';
import { CORE_ACTION, step } from '../../src/step.js';

/** Records the mortality draw taken on every step, whatever scale it is at. */
function rollRecorder(sink: number[]): System {
  return {
    name: 'roll',
    run(ctx) {
      sink.push(nextUint32(ctx.rng.stream(RNG_STREAM.mortality)));
    },
  };
}

describe('randomness is keyed on something that identifies a step', () => {
  it('does not re-roll the same numbers in a second engagement', () => {
    // THE FINDING: `engagementTick` restarts at zero for every engagement, so
    // keying a stream on it made raid #2's third tick derive a byte-identical
    // stream to raid #1's third tick. Same combatants, same dice, every
    // battle. Replay stayed perfectly deterministic throughout — which is why
    // no test failed and why this is the most dangerous kind of defect this
    // project can have.
    const drawn: number[] = [];
    const schema = defineWorld({ components: [], systems: [rollRecorder(drawn)] });
    let state = createState({ rootSeed: 4242, schema });
    const rng = () => rngFromRootSeed(4242);

    // Engagement one: enter, two ticks inside it, leave.
    state = step(state, [{ kind: CORE_ACTION.enterEngagement }], rng());
    state = step(state, [], rng());
    state = step(state, [{ kind: CORE_ACTION.leaveEngagement }], rng());
    const first = drawn.length;

    // Engagement two, at the same engagement tick ordinals.
    state = step(state, [{ kind: CORE_ACTION.enterEngagement }], rng());
    state = step(state, [], rng());
    state = step(state, [{ kind: CORE_ACTION.leaveEngagement }], rng());
    expect(state.clock.mode).toBe(TIME_MODE.world);

    const raidOne = drawn.slice(0, first);
    const raidTwo = drawn.slice(first);
    expect(raidTwo).toHaveLength(raidOne.length);
    expect(raidTwo).not.toEqual(raidOne);
    // Nothing repeats anywhere across the whole run.
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  it('does not collide a world tick with an engagement tick of the same number', () => {
    const drawn: number[] = [];
    const schema = defineWorld({ components: [], systems: [rollRecorder(drawn)] });
    let state = createState({ rootSeed: 77, schema });
    const rng = () => rngFromRootSeed(77);

    for (let i = 0; i < 4; i += 1) {
      state = step(state, [], rng());
    }
    state = step(state, [{ kind: CORE_ACTION.enterEngagement }], rng());
    for (let i = 0; i < 4; i += 1) {
      state = step(state, [], rng());
    }
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  it('still replays identically, which was never the property at risk', () => {
    const drawn: number[] = [];
    const schema = defineWorld({ components: [], systems: [rollRecorder(drawn)] });
    const recorder = new Recorder(createState({ rootSeed: 9, schema }));
    for (const actions of [[{ kind: CORE_ACTION.enterEngagement }], [], []]) {
      recorder.step(actions, rngFromRootSeed(9));
    }
    const during = [...drawn];
    drawn.length = 0;
    replay(recorder.recording, schema);
    expect(drawn).toEqual(during);
  });
});

describe('illegalActionCount counts agent submissions, not rules idempotence', () => {
  it('does not count a system asking for the mode it is already in', () => {
    // THE FINDING: `requestWorldTime()` shares its implementation with the
    // action path, so a world whose only system asks to stay in world time
    // reported one illegal action per tick — with no agent in the loop at all.
    // The counter feeds `illegalActionRate` against a per-submission
    // denominator, so this is a balance metric measuring the wrong population.
    const schema = defineWorld({
      components: [],
      systems: [{ name: 'stay', run: (ctx) => ctx.requestWorldTime() }],
    });
    let state = createState({ rootSeed: 1, schema });
    for (let i = 0; i < 5; i += 1) {
      state = step(state, [], rngFromRootSeed(1));
    }
    expect(state.illegalActionCount).toBe(0);
  });

  it('still counts every illegal action an agent actually submitted', () => {
    let state = createState({ rootSeed: 1, schema: defineWorld({ components: [], systems: [] }) });
    state = step(state, [{ kind: CORE_ACTION.enterEngagement }], rngFromRootSeed(1));
    state = step(
      state,
      Array.from({ length: 4 }, () => ({ kind: CORE_ACTION.enterEngagement })),
      rngFromRootSeed(1),
    );
    expect(state.illegalActionCount).toBe(4);
  });
});

describe('leaving and re-entering an engagement starts a new engagement', () => {
  it('resets the engagement tick rather than continuing the old count', () => {
    // THE FINDING: both requests are legal and the net target equals the
    // starting mode, so nothing was applied and `engagementTick` kept counting
    // — a new engagement silently inheriting the previous one's clock, against
    // `enterEngagement`'s documented contract.
    const schema = defineWorld({ components: [], systems: [] });
    let state = createState({ rootSeed: 1, schema });
    state = step(state, [{ kind: CORE_ACTION.enterEngagement }], rngFromRootSeed(1));
    state = step(state, [], rngFromRootSeed(1));
    state = step(state, [], rngFromRootSeed(1));
    expect(state.clock.engagementTick).toBe(3);

    state = step(
      state,
      [{ kind: CORE_ACTION.leaveEngagement }, { kind: CORE_ACTION.enterEngagement }],
      rngFromRootSeed(1),
    );
    expect(state.clock.mode).toBe(TIME_MODE.engagement);
    expect(state.clock.engagementTick).toBe(1);
    expect(state.illegalActionCount).toBe(0);
  });

  it('leaves world time alone when the pair runs the other way round', () => {
    const schema = defineWorld({ components: [], systems: [] });
    let state = createState({ rootSeed: 1, schema });
    state = step(state, [], rngFromRootSeed(1));
    state = step(
      state,
      [{ kind: CORE_ACTION.enterEngagement }, { kind: CORE_ACTION.leaveEngagement }],
      rngFromRootSeed(1),
    );
    expect(state.clock.mode).toBe(TIME_MODE.world);
    expect(state.clock.worldTick).toBe(2);
    expect(state.clock.engagementTick).toBe(0);
  });
});

describe('a recording taken mid-run does not decay as the run continues', () => {
  it('keeps its own action log, so it stays replayable', () => {
    // THE FINDING: `tickCount` was frozen at getter time while `actionLog` was
    // handed out live, so a Recording taken mid-run disagreed with itself by
    // the next step and replaying it threw. "Safe to take mid-run" was
    // documented and false — and taking one mid-run is exactly what a desync
    // report does.
    const schema = defineWorld({ components: [], systems: [] });
    const recorder = new Recorder(createState({ rootSeed: 1, schema }));
    for (let i = 0; i < 3; i += 1) {
      recorder.step([{ kind: CORE_ACTION.noop }], rngFromRootSeed(1));
    }
    const taken = recorder.recording;
    const hashAtCapture = taken.finalHash;

    for (let i = 0; i < 3; i += 1) {
      recorder.step([], rngFromRootSeed(1));
    }

    expect(taken.tickCount).toBe(3);
    expect(taken.actionLog.length).toBe(3);
    expect(taken.finalHash).toBe(hashAtCapture);
    expect(replayAndLocate(taken, schema).diverged).toBe(false);
  });

  it('hands out action arrays a system cannot rewrite', () => {
    const recorder = new Recorder(
      createState({ rootSeed: 1, schema: defineWorld({ components: [], systems: [] }) }),
    );
    recorder.step([{ kind: 7, params: [1, 2] }], rngFromRootSeed(1));
    const recorded = recorder.recording.actionLog.at(0);
    expect(() => (recorded as { length: number }).length).not.toThrow();
    expect(Object.isFrozen(recorded)).toBe(true);
    expect(Object.isFrozen(recorded[0])).toBe(true);
  });
});

describe('a divergence report describes its own cause accurately', () => {
  it('says the hashes are truncated, not absent, when there are some but too few', () => {
    // THE FINDING: a recording with per-tick hashes shorter than its tick count
    // fell through to the final-hash branch and was told to "re-record with
    // traceHashes: true" — advice for a recording that already had them. This
    // is the one path whose entire value is telling an engineer where to look.
    const schema = defineWorld({ components: [], systems: [] });
    const recorder = new Recorder(createState({ rootSeed: 1, schema }), { traceHashes: true });
    for (let i = 0; i < 4; i += 1) {
      recorder.step([], rngFromRootSeed(1));
    }

    const truncated = {
      ...recorder.recording,
      tickHashes: recorder.recording.tickHashes!.slice(0, 2),
      finalHash: '0000000000000000',
    };
    const result = replayAndLocate(truncated, schema);
    expect(result.diverged).toBe(true);
    expect(result.reason).toMatch(/only 2 per-tick hashes for 4 ticks/i);
    expect(result.reason).not.toMatch(/carries no per-tick hashes/i);
  });

  it('still gives the re-record advice when there genuinely are none', () => {
    const schema = defineWorld({ components: [], systems: [] });
    const recorder = new Recorder(createState({ rootSeed: 1, schema }));
    recorder.step([], rngFromRootSeed(1));
    const result = replayAndLocate(
      { ...recorder.recording, finalHash: '0000000000000000' },
      schema,
    );
    expect(result.reason).toMatch(/traceHashes/i);
  });
});

describe('defineWorld rejects names the snapshot format cannot write', () => {
  it('fails at definition rather than on the first autosave', () => {
    // THE FINDING: a component named `vitalité` defined, created and stepped
    // fine, then threw hours into a run on the first serialization, from a
    // call site with nothing to do with naming it.
    expect(() =>
      defineWorld({ components: [{ name: 'vitalité', fields: { hp: 'i32' } }], systems: [] }),
    ).toThrow(/printable ASCII/i);

    expect(() =>
      defineWorld({ components: [{ name: 'x'.repeat(256), fields: { hp: 'i32' } }], systems: [] }),
    ).toThrow(/1 to 255/);
  });

  it('checks field names too, not only component names', () => {
    expect(() =>
      defineWorld({ components: [{ name: 'vitality', fields: { 'hp°': 'i32' } }], systems: [] }),
    ).toThrow(/printable ASCII/i);
  });

  it('still accepts ordinary names', () => {
    expect(() =>
      defineWorld({
        components: [{ name: 'vitality-2', fields: { hp_max: 'i32' } }],
        systems: [],
      }),
    ).not.toThrow();
  });
});
