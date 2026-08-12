/*
 * Multiverse Mages — adversarial: episode determinism, reset, and the accounting toggle.
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
 * **Nothing in this file fails.** It is the published negative result for the
 * session attacks the brief called for, each stated as the property it checks so
 * that a later regression has something to break.
 *
 * The claim under the heaviest attack is the accounting toggle:
 *
 * > `countIllegalActions` is claimed to toggle only a session-side breakdown,
 * > with identical final snapshot hashes and identical per-stream draw counts
 * > either way. Test that claim hard — an observation-side option that perturbed
 * > a draw would rot every baseline.
 *
 * `session.test.ts` already compares final snapshot hashes and stream draw
 * counts. That is the weakest form of the claim: a perturbation that happens to
 * cancel by the last tick passes it. What is asserted here instead is the whole
 * **trajectory** — every observation of every tick, every mask, every candidate
 * list, every snapshot hash, and the core's own `illegalActionCount` at each
 * step — element by element, over an action sequence containing legal actions,
 * masked actions, an unknown action id, and a stale slot index. It held.
 *
 * The other axes, all of which held:
 *
 * - `reset` clears every session-side field, including after a terminal episode
 *   and after a *different* config, and re-derives the agent generator.
 * - Two sessions at one seed produce identical observation *trajectories*, not
 *   only identical first observations.
 * - The mask and `submit` agree on all sixteen action ids: nothing the mask calls
 *   legal is rejected, and nothing it calls illegal is admitted.
 * - `accounting().rejected` and the state's `illegalActionCount` never diverge.
 * - `snapshotHash` is stable across repeated reads and moves only when the state
 *   does.
 * - Observations are unaffected by run history: the same tick reached by
 *   different routes exports the same vector.
 */

import type { Action } from '@mm/sim-core';
import {
  ACTION_SPACE_SIZE,
  GOD_ACTION,
  OBSERVATION_SIZE,
  createSession,
} from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

import { plainScenario } from './worlds.js';

const NOOP: Action = { kind: GOD_ACTION.noop, params: [] };

/**
 * A sequence mixing everything the gate can do to a submission: admit, mask,
 * reject as unknown, and reject as an empty slot.
 */
const MIXED: readonly Action[] = Object.freeze([
  NOOP,
  { kind: GOD_ACTION.permitTechnique, params: [1] },
  { kind: GOD_ACTION.openPortal, params: [0] },
  { kind: 4242, params: [] },
  { kind: GOD_ACTION.blessMage, params: [31] },
  NOOP,
  { kind: GOD_ACTION.issueDispensation, params: [3] },
  NOOP,
]);

/** Everything observable about one tick of one episode. */
interface Frame {
  readonly observation: number[];
  readonly mask: number[];
  readonly candidates: [number, number][];
  readonly hash: string;
  readonly illegalActionCount: number;
  readonly status: string;
  readonly admitted: boolean;
}

function runEpisode(options: {
  readonly seed: number;
  readonly countIllegalActions?: boolean;
  readonly actions?: readonly Action[];
}): { readonly frames: Frame[]; readonly rejected: number; readonly submitted: number } {
  const session = createSession({
    scenario: plainScenario(),
    ...(options.countIllegalActions === undefined
      ? {}
      : { countIllegalActions: options.countIllegalActions }),
  });
  const actions = options.actions ?? MIXED;
  session.reset(options.seed, { worldTickCap: actions.length });

  const frames: Frame[] = [];
  for (const action of actions) {
    if (session.status() !== 'running') break;
    const result = session.submit(action);
    frames.push({
      observation: [...result.observation],
      mask: [...session.legalActions()],
      candidates: [...session.candidates()].map(([kind, list]) => [kind, list.length]),
      hash: session.snapshotHash(),
      illegalActionCount: session.illegalActionCount(),
      status: result.status,
      admitted: result.admitted,
    });
  }
  const accounting = session.accounting();
  return { frames, rejected: accounting.rejected, submitted: accounting.submitted };
}

describe('the accounting toggle perturbs nothing, checked per tick and not only at the end', () => {
  it('produces an identical trajectory with counting on and off', () => {
    const on = runEpisode({ seed: 0x7777_0001, countIllegalActions: true });
    const off = runEpisode({ seed: 0x7777_0001, countIllegalActions: false });
    expect(off.frames).toEqual(on.frames);
    expect(off.rejected).toBe(on.rejected);
    expect(off.submitted).toBe(on.submitted);
  });

  it('is not vacuous: the episode really does reject some of what it is given', () => {
    // The control. If every submission were admitted, "identical either way"
    // would be a statement about a toggle that never fired.
    const on = runEpisode({ seed: 0x7777_0001, countIllegalActions: true });
    expect(on.rejected).toBeGreaterThan(0);
    expect(on.submitted).toBe(MIXED.length);
    expect(on.frames.some((frame) => !frame.admitted)).toBe(true);
    expect(on.frames.some((frame) => frame.admitted)).toBe(true);
  });

  it('leaves the state-side counter identical, since §4.2 makes it non-optional', () => {
    const on = runEpisode({ seed: 0x7777_0001, countIllegalActions: true });
    const off = runEpisode({ seed: 0x7777_0001, countIllegalActions: false });
    const last = (run: { frames: Frame[] }): number =>
      (run.frames[run.frames.length - 1] as Frame).illegalActionCount;
    expect(last(off)).toBe(last(on));
    expect(last(on)).toBe(on.rejected);
  });

  it('keeps the breakdown empty when off and populated when on', () => {
    const session = createSession({
      scenario: plainScenario(),
      countIllegalActions: false,
    });
    session.reset(0x7777_0002, { worldTickCap: 4 });
    session.submit({ kind: 4242, params: [] });
    expect(session.accounting()).toMatchObject({ enabled: false, rejected: 1 });
    expect(session.accounting().rejectedByAction).toEqual({});
    expect(session.illegalActionCount()).toBe(1);
  });
});

describe('reset clears the episode, not merely the state', () => {
  it('clears accounting, cap, view and generator, and re-derives from the new seed', () => {
    const session = createSession({ scenario: plainScenario(), strategyId: 'probe' });
    session.reset(0x1010_0001, { worldTickCap: 2 });
    const firstDraws = Array.from({ length: 8 }, () => session.rng().nextUint32());
    session.submit({ kind: 4242, params: [] });
    session.submit(NOOP);
    expect(session.status()).toBe('truncated');
    expect(session.accounting().rejected).toBe(1);

    session.reset(0x1010_0002, { worldTickCap: 5 });
    expect(session.status()).toBe('running');
    expect(session.accounting()).toMatchObject({ submitted: 0, rejected: 0 });
    expect(session.accounting().rejectedByAction).toEqual({});
    expect(session.illegalActionCount()).toBe(0);
    // The generator is re-derived from the new run seed, so the old sequence
    // does not continue into the new episode.
    expect(Array.from({ length: 8 }, () => session.rng().nextUint32())).not.toEqual(firstDraws);
  });

  it('makes a re-reset episode identical to a fresh session at the same seed', () => {
    // Leftover state between episodes is the classic session defect: the second
    // episode of a reused session must equal the first episode of a new one.
    const reused = createSession({ scenario: plainScenario() });
    reused.reset(0x1010_0003, { worldTickCap: MIXED.length });
    for (const action of MIXED) {
      if (reused.status() !== 'running') break;
      reused.submit(action);
    }
    reused.reset(0x1010_0004, { worldTickCap: MIXED.length });
    const secondEpisode: string[] = [];
    for (const action of MIXED) {
      if (reused.status() !== 'running') break;
      reused.submit(action);
      secondEpisode.push(reused.snapshotHash());
    }

    const fresh = runEpisode({ seed: 0x1010_0004 });
    expect(secondEpisode).toEqual(fresh.frames.map((frame) => frame.hash));
  });

  it('refuses a run seed outside uint32 and a cap below one, before touching the episode', () => {
    const session = createSession({ scenario: plainScenario() });
    for (const seed of [-1, 1.5, 0x1_0000_0000, Number.NaN]) {
      expect(() => session.reset(seed, { worldTickCap: 4 }), `seed ${String(seed)}`).toThrow(
        /unsigned 32-bit/,
      );
    }
    for (const cap of [0, -1, 2.5, Number.NaN]) {
      expect(() => session.reset(1, { worldTickCap: cap }), `cap ${String(cap)}`).toThrow(
        /positive integer/,
      );
    }
    // Still no episode: a refused reset must not have half-started one.
    expect(() => session.observe()).toThrow(/reset/);
  });
});

describe('two sessions at one seed agree tick by tick, not only on the first observation', () => {
  it('produces identical trajectories', () => {
    expect(runEpisode({ seed: 0x2020_0001 }).frames).toEqual(
      runEpisode({ seed: 0x2020_0001 }).frames,
    );
  });

  it('diverges on a different seed, so the equality above is not trivial', () => {
    const a = runEpisode({ seed: 0x2020_0001 });
    const b = runEpisode({ seed: 0x2020_0002 });
    expect(b.frames.map((frame) => frame.hash)).not.toEqual(a.frames.map((frame) => frame.hash));
  });

  it('exports the pinned width at every tick of every run', () => {
    for (const frame of runEpisode({ seed: 0x2020_0003 }).frames) {
      expect(frame.observation).toHaveLength(OBSERVATION_SIZE);
      expect(frame.mask).toHaveLength(ACTION_SPACE_SIZE);
    }
  });

  it('reports the same snapshot hash on repeated reads of one state', () => {
    const session = createSession({ scenario: plainScenario() });
    session.reset(0x2020_0004, { worldTickCap: 4 });
    const before = session.snapshotHash();
    expect(session.snapshotHash()).toBe(before);
    session.submit(NOOP);
    const after = session.snapshotHash();
    expect(after).not.toBe(before);
    expect(session.snapshotHash()).toBe(after);
  });
});

/**
 * A parameter that is in range for this action id, whatever the action is.
 *
 * `1` for the four axis toggles, whose ids are 1-based and run to
 * `GRID_TECHNIQUE_COUNT` / `GRID_FORM_COUNT`, and for the two edict issuers,
 * whose cell ids are 1-based too. `0` everywhere else: it is slot zero of a
 * §4.4 candidate list, the first edict index, and the ignored parameter of the
 * unparameterized actions.
 */
function wellFormedParameter(kind: number): number {
  switch (kind) {
    case GOD_ACTION.permitTechnique:
    case GOD_ACTION.forbidTechnique:
    case GOD_ACTION.permitForm:
    case GOD_ACTION.forbidForm:
    case GOD_ACTION.issueDispensation:
    case GOD_ACTION.issueInterdiction:
      return 1;
    default:
      return 0;
  }
}

describe('the mask and submit agree, across the whole action space', () => {
  it('admits everything the mask calls legal and rejects everything it does not', () => {
    // A mask that lied in either direction would show up here: an agent trained
    // against it would either waste its budget on rejections or never try
    // something that would have worked.
    //
    // The parameter has to be **well-formed for the action**, and that is a
    // narrowing of what this test could once assume rather than a weakening of
    // what it proves. The mask is per-action: `legalityMask` answers "is
    // `permitTechnique` available", and §4.2 gives it no way to say "…with
    // technique id 0". So a submission the mask calls legal is admitted *given
    // a parameter of the right type and in range* — the same qualification the
    // integrality check already imposed, now that the gate also range-checks
    // the two axis ids against §2.1's grid. `params: [0]` used to satisfy that
    // for every action only because nothing checked; for actions 1–4 the ids
    // are 1-based and `0` names nothing.
    for (let kind = 0; kind < ACTION_SPACE_SIZE; kind += 1) {
      const session = createSession({ scenario: plainScenario() });
      session.reset(0x3030_0001, { worldTickCap: 8 });
      const legal = session.legalActions()[kind] === 1;
      const result = session.submit({ kind, params: [wellFormedParameter(kind)] });
      expect(result.admitted, `action ${String(kind)}`).toBe(legal);
      expect(result.rejection === undefined, `action ${String(kind)}`).toBe(legal);
      expect(session.illegalActionCount(), `action ${String(kind)}`).toBe(legal ? 0 : 1);
      expect(session.accounting().rejected, `action ${String(kind)}`).toBe(legal ? 0 : 1);
    }
  });

  it('rejects an id outside §4.2 without throwing, as §4.2 requires', () => {
    const session = createSession({ scenario: plainScenario() });
    session.reset(0x3030_0002, { worldTickCap: 8 });
    for (const kind of [16, -1, 1.5, Number.NaN, 65_535]) {
      const before = session.illegalActionCount();
      const result = session.submit({ kind, params: [] });
      expect(result.admitted, `kind ${String(kind)}`).toBe(false);
      expect(result.rejection, `kind ${String(kind)}`).toBe('unknown-action');
      expect(session.illegalActionCount()).toBe(before + 1);
    }
  });

  it('rejects a slot index outside a candidate list, at both ends and past k', () => {
    const session = createSession({ scenario: plainScenario() });
    session.reset(0x3030_0003, { worldTickCap: 16 });
    // `fundUniversity` always has at least slot 0 ("found a new one"), so the
    // list is non-empty and the mask says legal — which makes an out-of-range
    // slot a genuine slot rejection rather than a masked one.
    expect(session.legalActions()[GOD_ACTION.fundUniversity]).toBe(1);
    for (const slot of [-1, 8, 9, 1_000, 0.5]) {
      const result = session.submit({ kind: GOD_ACTION.fundUniversity, params: [slot] });
      expect(result.admitted, `slot ${String(slot)}`).toBe(false);
      expect(result.rejection, `slot ${String(slot)}`).toBe('empty-slot');
    }
    expect(session.submit({ kind: GOD_ACTION.fundUniversity, params: [0] }).admitted).toBe(true);
  });

  it('rejects a parameterized action submitted with no slot at all', () => {
    const session = createSession({ scenario: plainScenario() });
    session.reset(0x3030_0004, { worldTickCap: 8 });
    expect(session.submit({ kind: GOD_ACTION.fundUniversity }).rejection).toBe('missing-slot');
    expect(session.submit({ kind: GOD_ACTION.fundUniversity, params: [] }).rejection).toBe(
      'missing-slot',
    );
  });
});

describe('the observation does not depend on how the tick was reached', () => {
  it('exports the same vector for the same tick under two different action histories', () => {
    // The capability spec's *"Normalization does not depend on run history"*
    // scenario, in the form this package can actually stage: two episodes at one
    // seed differing only in submissions the gate rejects. A rejected submission
    // is a no-op, so the worlds are identical and so must be the vectors.
    const passive = runEpisode({
      seed: 0x4040_0001,
      actions: [NOOP, NOOP, NOOP, NOOP],
    });
    const noisy = runEpisode({
      seed: 0x4040_0001,
      actions: [
        { kind: 4242, params: [] },
        { kind: GOD_ACTION.openPortal, params: [0] },
        { kind: 9999, params: [] },
        NOOP,
      ],
    });
    expect(noisy.frames.map((frame) => frame.observation)).toEqual(
      passive.frames.map((frame) => frame.observation),
    );
    // The counter is the one thing that legitimately differs — it is state, and
    // §4.2 requires it to move.
    expect(noisy.frames.map((frame) => frame.illegalActionCount)).not.toEqual(
      passive.frames.map((frame) => frame.illegalActionCount),
    );
  });
});
