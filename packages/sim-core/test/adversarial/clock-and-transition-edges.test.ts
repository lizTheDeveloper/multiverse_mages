/*
 * Multiverse Mages — adversarial: clock transitions, illegal-action counting,
 * and RNG-stream tick boundaries.
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

import { TIME_MODE, eraOf } from '../../src/clock.js';
import { floorDiv } from '../../src/fixed-point/divide.js';
import { deriveStream } from '../../src/rng/streams.js';
import { rngFromRootSeed } from '../../src/rng/source.js';
import type { System } from '../../src/state.js';
import { createState, defineWorld } from '../../src/state.js';
import { CORE_ACTION, step } from '../../src/step.js';

const world = defineWorld({ components: [], systems: [] });

describe('multiple identical illegal transitions submitted in one tick', () => {
  it('AMBIGUITY: ten illegal enterEngagement actions increment the counter once, not ten times', () => {
    // step.ts scans `actions` and folds every enterEngagement/leaveEngagement
    // kind into a single `transition` variable — the *last* matching action
    // wins, then `applyTransition` is called exactly once. Submitting the
    // same illegal action ten times therefore produces exactly one counter
    // increment, not ten.
    //
    // contracts.md §4.2, read literally and per-element ("An agent that
    // submits an illegal action gets a no-op and a counter increment"),
    // would suggest each of the ten submissions should count. But step.ts's
    // own docstring documents "Apply at most one mode transition" as
    // intentional per-tick behaviour, and the god's action space (§4.2's
    // list) is a single discrete choice per step in the intended
    // architecture — the ten-actions-in-one-array case is a batch extension
    // the core's `Action[]` shape permits but that contracts.md's counting
    // language was not written against. I cannot confidently say which
    // reading is "correct", so this is reported as an ambiguity, not a
    // defect — but it is a real one: `illegalActionRate` (contracts.md §7)
    // is defined as "fraction of agent actions rejected by the mask", and
    // this collapsing means the counter under-reports relative to a
    // per-submitted-action denominator.
    let state = createState({ rootSeed: 1, schema: world });
    state = step(state, [{ kind: CORE_ACTION.enterEngagement }], rngFromRootSeed(1));
    expect(state.clock.mode).toBe(TIME_MODE.engagement);

    const tenIllegalRequests = Array.from({ length: 10 }, () => ({
      kind: CORE_ACTION.enterEngagement,
    }));
    state = step(state, tenIllegalRequests, rngFromRootSeed(1));

    // Documents the actual, current behaviour.
    expect(state.illegalActionCount).toBe(1);
  });
});

describe('conflicting transition actions in the same tick', () => {
  it('AMBIGUITY: a legal transition is silently discarded when a later illegal one is submitted in the same tick', () => {
    // Submitting `enterEngagement` (legal, from world mode) followed by
    // `leaveEngagement` (illegal, since the clock has not actually entered
    // engagement yet) in the *same* actions array: step.ts's scan loop
    // overwrites `transition` for each matching action it sees, so only the
    // last one — `leaveEngagement` — survives to `applyTransition`. The
    // `enterEngagement` request is neither applied, nor recorded, nor
    // counted as illegal (it was legal in isolation). It simply vanishes.
    //
    // contracts.md §4.2 says an illegal action gets "never a silent partial
    // effect" — that clause is about illegal actions specifically, so it
    // does not directly condemn this case. But a *legal* action producing
    // zero effect and zero record, purely because of its position relative
    // to another action in the same submission, is the sharper version of
    // the same concern: nothing in the observable state after this step
    // reveals that an enterEngagement request ever arrived. The spec is
    // silent on multiple transition-actions-per-tick, so I record this as an
    // ambiguity rather than assert a "correct" behaviour I cannot cite.
    let state = createState({ rootSeed: 2, schema: world });
    state = step(
      state,
      [{ kind: CORE_ACTION.enterEngagement }, { kind: CORE_ACTION.leaveEngagement }],
      rngFromRootSeed(2),
    );

    // Documents the actual, current behaviour: the tick just advances world
    // time normally, as if neither action had been submitted, except that
    // the counter silently attributes an illegal leaveEngagement.
    expect(state.clock.mode).toBe(TIME_MODE.world);
    expect(state.clock.worldTick).toBe(1);
    expect(state.illegalActionCount).toBe(1);
  });

  it('AMBIGUITY: a system-requested transition unconditionally overrides a CORE_ACTION from the same tick', () => {
    // step.ts's order: (1) scan `actions`, setting `transition` for any
    // CORE_ACTION found; (2) run systems, which can reassign `transition`
    // via ctx.requestEngagement()/requestWorldTime(); (3) apply whatever
    // `transition` ends up holding. Because systems run strictly after the
    // action scan and both write the same closed-over variable, a system's
    // request *always* wins over a CORE_ACTION submitted the same tick,
    // regardless of the actions array's submission order. The step.ts
    // docstring enumerates step ordering (clone, systems, apply transition,
    // advance clock) but never states this precedence rule explicitly, so
    // this documents observed, deterministic behaviour rather than asserting
    // a violation.
    const schema = defineWorld({
      components: [],
      systems: [
        {
          name: 'always-leaves',
          run(ctx) {
            ctx.requestWorldTime();
          },
        },
      ],
    });
    let state = createState({ rootSeed: 3, schema });
    // A legal enterEngagement request, from world mode.
    state = step(state, [{ kind: CORE_ACTION.enterEngagement }], rngFromRootSeed(3));

    // The system's (illegal, since not yet in engagement) requestWorldTime()
    // call overrides the action's legal request. The god's enterEngagement
    // is silently discarded; the system's contrary request is counted.
    expect(state.clock.mode).toBe(TIME_MODE.world);
    expect(state.illegalActionCount).toBe(1);
  });
});

describe('the RNG stream tick boundary the clock does not itself enforce', () => {
  it('PASSES: deriveStream rejects a tick at exactly 2^32, the value worldTick reaches with no ceiling of its own', () => {
    // clock.ts's advanceClock is `clock.worldTick += 1`, unconditionally —
    // there is no ceiling anywhere in the clock or in `step`. The *only*
    // thing that would ever notice a worldTick this large is a rules-layer
    // system calling `ctx.rng.stream(subsystemId, ctx.tick)`, because
    // deriveStream validates its `tick` argument as u32 and throws. That
    // throw would be an uncaught exception propagating out of `step` — not
    // the documented "illegal action -> no-op + counter" path, because this
    // is not an illegal action, it is an unbounded clock meeting a bounded
    // RNG domain. streams.ts's own doc comment calls 2^32 ticks "longer than
    // any run will ever be", which is presumably why nothing enforces the
    // bound at the clock — but the two modules' assumptions are not
    // reconciled by any shared constant or check. This test documents that
    // the RNG layer's guard is the only thing standing between an
    // extremely long run and an uncaught exception mid-step, and confirms
    // that guard does fire.
    expect(() => deriveStream(1, 1, 2 ** 32)).toThrow(RangeError);
    expect(() => deriveStream(1, 1, 2 ** 32 - 1)).not.toThrow();
  });
});

describe('eraOf at the extremes floorDiv is willing to accept', () => {
  it('PASSES: is negative for a negative world tick, per floor (not truncating) division', () => {
    // Not reachable through `step` (worldTick only ever increases from 0),
    // but eraOf and floorDiv are exported, pure functions, and eraOf's own
    // comment insists it is "a pure function of the tick, never a stored
    // counter" — so it is fair to call it directly at inputs step() would
    // never itself produce, to check the function does not assume a
    // non-negative domain it never declares.
    expect(eraOf(-1)).toBe(-1); // floor(-1/240) = -1
    expect(eraOf(-240)).toBe(-1); // floor(-240/240) = -1 exactly
    expect(eraOf(-241)).toBe(-2); // floor(-241/240) = -2
    expect(eraOf(0)).toBe(0);
    expect(eraOf(239)).toBe(0);
    expect(eraOf(240)).toBe(1);
  });

  it('PASSES: computes correctly at the largest safe integer, without precision loss', () => {
    const huge = Number.MAX_SAFE_INTEGER;
    expect(eraOf(huge)).toBe(floorDiv(huge, 240));
    // Cross-checked against the definition directly, since a naive
    // `Math.floor(huge / 240)` would already have lost precision converting
    // through a float division before flooring — exactly the class of bug
    // floorDiv's shared-helper design exists to prevent.
  });

  it('PASSES: rejects a tick outside the safe-integer domain rather than returning a wrong era silently', () => {
    expect(() => eraOf(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
    expect(() => eraOf(Number.NaN)).toThrow(RangeError);
    expect(() => eraOf(Infinity)).toThrow(RangeError);
  });
});

describe('a system that observes both a CORE_ACTION-driven and a request-driven transition arriving on the same tick as engagement begins', () => {
  it('PASSES: a system requesting engagement sees the pre-transition tick and mode, consistent with "systems see the tick the state arrived with"', () => {
    // step.ts's docstring: "Run systems in schema order, each seeing the
    // tick the state arrived with." Confirms a system that itself triggers
    // the transition still observes the *incoming* mode/tick, not the
    // outgoing one — i.e. the transition genuinely lands after systems run,
    // as documented, even for the system that requested it.
    const seen: { tick: number; mode: number }[] = [];
    const portal: System = {
      name: 'portal',
      run(ctx) {
        seen.push({ tick: ctx.tick, mode: ctx.mode });
        if (ctx.tick === 2) {
          ctx.requestEngagement();
        }
      },
    };
    const schema = defineWorld({ components: [], systems: [portal] });
    let state = createState({ rootSeed: 4, schema });
    for (let i = 0; i < 4; i += 1) {
      state = step(state, [], rngFromRootSeed(4));
    }
    expect(seen).toEqual([
      { tick: 0, mode: TIME_MODE.world },
      { tick: 1, mode: TIME_MODE.world },
      { tick: 2, mode: TIME_MODE.world }, // still world: transition applies after this system ran
      { tick: 1, mode: TIME_MODE.engagement }, // tick 3 overall, but engagementTick 1
    ]);
    expect(state.clock.mode).toBe(TIME_MODE.engagement);
    expect(state.clock.worldTick).toBe(2);
  });
});
