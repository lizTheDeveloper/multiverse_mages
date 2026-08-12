/*
 * Multiverse Mages — illegal actions are no-ops plus a counter, never exceptions.
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
 * Tasks 4.5 and 4.8.
 *
 * ## Why 4.8's test builds its own applier
 *
 * The scenario is *"an agent submits a forbid-technique action during
 * engagement; the ruleset is unchanged and the illegal-action counter
 * increments."* Proving the ruleset is unchanged needs something that *would*
 * change it — otherwise the assertion holds trivially, for the same reason a
 * test of a lock passes if nobody ever tries the door.
 *
 * That something is `god-agency`'s (`contracts.md` §8), and it does not exist.
 * So the test supplies a deliberately naive one: a system that applies every
 * `forbidTechnique` it is handed, with no legality check of its own. That is
 * the worst-case downstream consumer, and it is the one the gate has to hold
 * against — a well-behaved applier that re-checked the mask would make the gate
 * untested rather than proven.
 */

import type { Action, StepContext, System } from '@mm/sim-core';
import { rngFromRootSeed, step } from '@mm/sim-core';
import {
  EDICT,
  EDICT_KIND,
  GRID_FORM_COUNT,
  GRID_TECHNIQUE_COUNT,
  UNIVERSE,
  attachRecord,
  cellIdAt,
  componentOf,
  findUniverse,
  readUniverse,
} from '@mm/state';
import { GOD_ACTION, OBSERVATION_SIZE, admit, observe } from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

import { FIXTURE_CATALOGUE, engageWorld, firstUniverse } from './fixtures.js';

/**
 * A system that forbids whatever technique it is told to, unconditionally.
 *
 * Deliberately trusting. It is standing in for `god-agency`, and its
 * carelessness is the point — see this file's opening note.
 */
const NAIVE_RULESET_APPLIER: System = {
  name: 'test-naive-ruleset-applier',
  run(ctx: StepContext): void {
    const universe = findUniverse(ctx.state);
    if (universe === 0) return;
    const store = componentOf(ctx.state, UNIVERSE);
    for (const action of ctx.actions) {
      if (action.kind !== GOD_ACTION.forbidTechnique) continue;
      // The parameter is a **1-based technique id**, and the bit is `id - 1` —
      // the convention `coordination/src/god/interventions.ts` validates
      // against and the one the gate now range-checks. The applier is naive
      // about legality, not about the vocabulary; a stand-in that read the
      // number differently from the real dispatch would be testing a downstream
      // consumer that does not exist.
      const bit = (action.params?.[0] ?? 0) - 1;
      const current = store.get(universe, 'permittedTechniques');
      store.set(universe, 'permittedTechniques', current & ~(1 << bit));
    }
  },
};

/** The fixture world, rebuilt with the naive applier installed. */
function worldWithApplier(): ReturnType<typeof firstUniverse> {
  const world = firstUniverse();
  // `schema.systems` is frozen at `defineWorld`, so the applier is spliced in
  // through the array the schema already holds rather than by rebuilding the
  // world — which would mean duplicating the fixture here.
  (world.state.schema.systems as System[]).push(NAIVE_RULESET_APPLIER);
  return world;
}

describe('task 4.5 — an illegal action is a no-op and a counter increment', () => {
  it('never throws, whatever arrives', () => {
    const world = firstUniverse();
    const nonsense: Action[] = [
      { kind: 999 },
      { kind: -4 },
      { kind: GOD_ACTION.blessMage }, // parameterized, but no slot
      { kind: GOD_ACTION.blessMage, params: [10_000] }, // slot past the end
    ];
    expect(() => admit({ state: world.state, catalogue: FIXTURE_CATALOGUE }, nonsense)).not.toThrow();
  });

  it('counts one per submission, not one per tick', () => {
    const world = firstUniverse();
    const before = world.state.illegalActionCount;
    const ten: Action[] = Array.from({ length: 10 }, () => ({ kind: 999 }));
    const result = admit({ state: world.state, catalogue: FIXTURE_CATALOGUE }, ten);

    expect(result.admitted).toEqual([]);
    expect(result.rejected).toHaveLength(10);
    // `step` makes the same choice for redundant clock actions, and for the same
    // reason: undercounting makes §7's `illegalActionRate` quietly wrong against
    // a per-submission denominator.
    expect(world.state.illegalActionCount).toBe(before + 10);
  });

  it('names why each submission was turned away', () => {
    const world = firstUniverse();
    const result = admit({ state: world.state, catalogue: FIXTURE_CATALOGUE }, [
      { kind: 42 },
      { kind: GOD_ACTION.blessMage },
      { kind: GOD_ACTION.blessMage, params: [99] },
    ]);
    expect(result.rejected.map((entry) => entry.reason)).toEqual([
      'unknown-action',
      'missing-slot',
      'empty-slot',
    ]);
  });

  it('lets a legal action through, with its slot resolved to real parameters', () => {
    const world = firstUniverse();
    const view = observe({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    const slotZero = view.candidates.get(GOD_ACTION.blessMage)?.[0];

    const result = admit({ state: world.state, catalogue: FIXTURE_CATALOGUE }, [
      { kind: GOD_ACTION.blessMage, params: [0] },
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.admitted).toEqual([{ kind: GOD_ACTION.blessMage, params: slotZero?.params }]);
    expect(world.state.illegalActionCount).toBe(0);
  });

  it('rejects a slot whose mage died between observation and action (§4.4)', () => {
    const world = firstUniverse();
    const view = observe({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    const doomed = view.candidates.get(GOD_ACTION.blessMage)?.[0]?.params[0] as number;

    // The agent observed, decided on slot 0, and the world moved underneath it.
    world.state.entities.destroy(doomed);

    const result = admit({ state: world.state, catalogue: FIXTURE_CATALOGUE }, [
      { kind: GOD_ACTION.blessMage, params: [0] },
    ]);
    // Slot 0 now names a *different* living mage rather than the dead one — the
    // list re-ranked — so this submission is legal and resolves elsewhere. What
    // matters is that nothing threw and no handle to a destroyed entity escaped.
    for (const admitted of result.admitted) {
      expect(admitted.params?.[0]).not.toBe(doomed);
      expect(world.state.entities.isAlive(admitted.params?.[0] as number)).toBe(true);
    }
  });

  it('rejects the last slot of a list that shrank, as an ordinary illegal action', () => {
    const world = firstUniverse();
    const view = observe({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    const lastSlot = (view.candidates.get(GOD_ACTION.blessMage)?.length ?? 0) - 1;
    expect(lastSlot).toBeGreaterThan(0);

    for (const mage of world.mages) world.state.entities.destroy(mage);

    const before = world.state.illegalActionCount;
    const result = admit({ state: world.state, catalogue: FIXTURE_CATALOGUE }, [
      { kind: GOD_ACTION.blessMage, params: [lastSlot] },
    ]);
    expect(result.admitted).toEqual([]);
    expect(result.rejected[0]?.reason).toBe('masked');
    expect(world.state.illegalActionCount).toBe(before + 1);
  });
});

describe('task 4.8 — a masked rules change mid-engagement leaves the ruleset unchanged', () => {
  it('does not reach the applier, and increments the counter', () => {
    const world = worldWithApplier();
    engageWorld(world);

    const universe = findUniverse(world.state);
    const before = readUniverse(world.state, universe).permittedTechniques;
    expect(before & 0b1).toBe(0b1); // technique bit 0 is currently permitted

    const submission: Action[] = [{ kind: GOD_ACTION.forbidTechnique, params: [1] }];
    const gated = admit({ state: world.state, catalogue: FIXTURE_CATALOGUE }, submission);
    expect(gated.admitted).toEqual([]);
    expect(gated.rejected).toHaveLength(1);
    expect(gated.rejected[0]?.reason).toBe('masked');

    const next = step(world.state, gated.admitted, rngFromRootSeed(world.state.rootSeed));
    expect(readUniverse(next, findUniverse(next)).permittedTechniques).toBe(before);
    expect(next.illegalActionCount).toBe(1);
  });

  it('is not a vacuous test — the same applier does change the ruleset at world scale', () => {
    // The positive control. Without it, the assertion above would pass against
    // an applier that does nothing at all, and the gate would be untested.
    const world = worldWithApplier();
    const universe = findUniverse(world.state);
    const before = readUniverse(world.state, universe).permittedTechniques;

    const gated = admit({ state: world.state, catalogue: FIXTURE_CATALOGUE }, [
      { kind: GOD_ACTION.forbidTechnique, params: [1] },
    ]);
    expect(gated.admitted).toHaveLength(1);

    const next = step(world.state, gated.admitted, rngFromRootSeed(world.state.rootSeed));
    expect(readUniverse(next, findUniverse(next)).permittedTechniques).toBe(before & ~0b1);
    expect(next.illegalActionCount).toBe(0);
  });

  it('holds for every ruleset action, not just forbid-technique', () => {
    const world = firstUniverse();
    engageWorld(world);
    const submissions: Action[] = [
      { kind: GOD_ACTION.permitTechnique, params: [3] },
      { kind: GOD_ACTION.forbidTechnique, params: [1] },
      { kind: GOD_ACTION.permitForm, params: [7] },
      { kind: GOD_ACTION.forbidForm, params: [1] },
      { kind: GOD_ACTION.issueDispensation, params: [5] },
      { kind: GOD_ACTION.issueInterdiction, params: [5] },
      { kind: GOD_ACTION.revokeEdict, params: [0] },
      { kind: GOD_ACTION.changeTradition, params: [0] },
    ];
    const gated = admit({ state: world.state, catalogue: FIXTURE_CATALOGUE }, submissions);
    expect(gated.admitted).toEqual([]);
    expect(gated.rejected).toHaveLength(submissions.length);
    expect(world.state.illegalActionCount).toBe(submissions.length);
  });
});

describe('a conflicted ruleset does not crash the read path', () => {
  it('observes and admits without throwing when a cell carries both edicts', () => {
    // contracts.md §4.2: an illegal action gets a no-op and a counter, "never
    // an exception". The candidate builders captured the ruleset through the
    // path that asserts no cell carries both a dispensation and an
    // interdiction, so a conflicted universe made `observe()` and `admit()`
    // throw — turning a recoverable rules mistake into a crashed training run.
    //
    // The state is reachable: the god issues both edicts and nothing validates
    // the cell id at submission. `permits()` is deliberately total over it,
    // interdiction winning, so reading it is well defined; only the paths that
    // *construct* a ruleset for arbitration assert.
    const world = firstUniverse();
    const contested = cellIdAt(1, 1);
    for (const kind of [EDICT_KIND.dispensation, EDICT_KIND.interdiction]) {
      const edict = world.state.entities.create();
      attachRecord(world.state, EDICT, edict, { cellId: contested, kind });
    }

    const input = { state: world.state, catalogue: FIXTURE_CATALOGUE };
    expect(() => observe(input)).not.toThrow();
    expect(observe(input).raw).toHaveLength(OBSERVATION_SIZE);
    expect(() =>
      admit(input, [{ kind: GOD_ACTION.permitTechnique, params: [1] }]),
    ).not.toThrow();
  });
});

/**
 * The measured defect this block pins.
 *
 * `coordination/src/god/interventions.ts` reads the parameter of actions 1–4 as
 * a **1-based axis id** and refuses anything outside `1..count` — silently: a
 * no-op, a `refused` tally entry, and `state.illegalActionCount`. But §7's
 * `illegalActionRate` is collected from the *session's* rejection counters, not
 * from the core's tally, so a whole class of malformed submission was invisible
 * to the one metric whose job is to show it. `mc-harness`'s strategy pool was
 * emitting `0` once every five rounds and nothing could see it.
 *
 * The range is judged here, and not left entirely to §8, because it is
 * **structural**: `GRID_TECHNIQUE_COUNT` and `GRID_FORM_COUNT` are pinned in
 * `@mm/state`, which this package already depends on and already reads the
 * ruleset out of. That is the same kind of fact as `k` for a candidate list,
 * which the gate has always judged. Cell ids and edict indices are deliberately
 * *not* checked here and stay with §8 — a cell id needs content and an edict
 * index needs the current edict list, and neither is a structural constant.
 */
describe('an axis id outside the grid is a counted rejection, not a silent refusal', () => {
  it('rejects a technique or form id below 1 or above the axis count', () => {
    const world = firstUniverse();
    const before = world.state.illegalActionCount;
    const submissions: Action[] = [
      { kind: GOD_ACTION.permitTechnique, params: [0] },
      { kind: GOD_ACTION.forbidTechnique, params: [GRID_TECHNIQUE_COUNT + 1] },
      { kind: GOD_ACTION.permitForm, params: [0] },
      { kind: GOD_ACTION.forbidForm, params: [GRID_FORM_COUNT + 1] },
      { kind: GOD_ACTION.permitTechnique, params: [-3] },
    ];
    const result = admit({ state: world.state, catalogue: FIXTURE_CATALOGUE }, submissions);

    expect(result.admitted).toEqual([]);
    expect(result.rejected.map((entry) => entry.reason)).toEqual(
      submissions.map(() => 'parameter-out-of-range'),
    );
    expect(world.state.illegalActionCount).toBe(before + submissions.length);
  });

  it('admits both ends of each axis, including the top id', () => {
    // The positive control, and the specific thing the harness could not reach:
    // technique 5 and form 14 are ids, not off-by-one mistakes.
    const world = firstUniverse();
    const result = admit({ state: world.state, catalogue: FIXTURE_CATALOGUE }, [
      { kind: GOD_ACTION.forbidTechnique, params: [1] },
      { kind: GOD_ACTION.forbidTechnique, params: [GRID_TECHNIQUE_COUNT] },
      { kind: GOD_ACTION.forbidForm, params: [1] },
      { kind: GOD_ACTION.forbidForm, params: [GRID_FORM_COUNT] },
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.admitted).toHaveLength(4);
  });

  it('leaves an axis action carrying no parameter alone', () => {
    // Deliberately *not* rejected here. A missing parameter is a different
    // defect from an out-of-range one; it is what `uniform-random-legal`
    // submits for every action 1–7, because those carry no §4.4 candidate list
    // and so it draws no slot for them. Turning that into a counted rejection
    // would move the noise floor's illegal-action rate in the same commit as
    // the axis fix, which is two changes inside one measurement. Recorded here
    // so the next campaign finds the decision rather than the behaviour.
    const world = firstUniverse();
    const result = admit({ state: world.state, catalogue: FIXTURE_CATALOGUE }, [
      { kind: GOD_ACTION.permitTechnique },
    ]);
    expect(result.admitted).toEqual([{ kind: GOD_ACTION.permitTechnique, params: [] }]);
  });
});
