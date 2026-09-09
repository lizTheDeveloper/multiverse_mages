/*
 * Multiverse Mages — the mask and the resolver price the eight-bar unease the same way.
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
 * The check `agent-api`'s `uneaseMultiplier` comment promises, written down.
 *
 * `contracts.md` §5 gives `@mm/agent-api` and `@mm/coordination` no edge to each
 * other, so `sound-design.md` §5.2's unease multiplier is implemented twice —
 * once where an action's affordability is *judged* (the mask) and once where its
 * price is *charged* (the resolver). That is the same situation
 * `cheapestAxisMultiplier` is in for hysteresis, and the same remedy applies: a
 * test that fails when the two drift, since an import cannot.
 *
 * **This file lives in `scenario` and not beside either implementation, and §5
 * is the reason.** `scenario` is the composition root: the one package the
 * dependency graph permits to name both. Written first in `coordination`, it was
 * caught by `module-boundaries.test.ts` — *"imports @mm/agent-api, an edge §5
 * does not grant coordination"* — which is exactly that scanner doing its job,
 * and moving the test is the repair rather than widening the graph for a test's
 * convenience.
 *
 * **Why it is worth a file at all.** Integration round 2's sharpest finding was
 * that `uniform-random-legal` — the probe every published exploit margin was
 * measured against — was crippled by this class of disagreement: *"the gate
 * admits them, coordination refuses them onto `state.illegalActionCount`… Seven
 * of fifteen verbs inert, telemetry clean."* A surcharge the mask cannot see is
 * not a cost. It is a silent refusal that looks like a working mechanic in every
 * summary anybody reads.
 *
 * The discriminating case is favor set **between** the two prices. Any test with
 * plenty of favor passes whether or not the mask knows the rule exists.
 */

import { describe, expect, it } from 'vitest';

import { GOD_ACTION, buildCandidates, isLegal, legalityMask } from '@mm/agent-api';
import type { SimState } from '@mm/sim-core';
import { FP_ONE, mul, rngFromRootSeed, step } from '@mm/sim-core';
import { UNIVERSE, componentOf, findUniverse } from '@mm/state';
import { referenceContent, referenceScenario } from '@mm/scenario';

const content = referenceContent();
const CONFIG = { worldTickCap: 64, options: { cohortSize: 7, foundingNodes: 3 } } as const;

/** The two §5.2 constants, read from shipped content rather than assumed. */
const UNEASE_BARS = content.registry.godConstant('unease-bars');
const UNEASE_STEP = content.registry.godConstant('unease-step');
/** A form flip: never touched here, so its hysteresis multiplier is exactly 1. */
const BASE = content.catalogue.costs?.byAction[GOD_ACTION.forbidForm] ?? 0;

/**
 * The lowest set bit of a permitted-axis mask, as §4.2's 1-based parameter.
 *
 * Read from the reference ruleset rather than written as a literal, because a
 * toggle that would not move the bit is *refused rather than charged* — so an
 * axis this universe never permitted makes every assertion below pass over a
 * price of zero. An earlier draft used `[1]` for both axes and measured exactly
 * that: creo is not in the v1 subset, nothing resolved, and the sweep agreed
 * with itself about nothing.
 */
function lowestPermitted(mask: number): number {
  for (let bit = 0; bit < 16; bit += 1) {
    if ((mask & (1 << bit)) !== 0) return bit + 1;
  }
  throw new Error('the reference ruleset permits no axis on this side of the grid');
}

const TECHNIQUE_PARAM = lowestPermitted(content.axes.permittedTechniques);
const FORM_PARAM = lowestPermitted(content.axes.permittedForms);

function fresh(): SimState {
  return referenceScenario(content).scenario.create(0x0021_0001, CONFIG);
}

function setFavor(state: SimState, favor: number): void {
  componentOf(state, UNIVERSE).set(findUniverse(state), 'favor', favor);
}

function favorOf(state: SimState): number {
  return componentOf(state, UNIVERSE).get(findUniverse(state), 'favor');
}

function advance(state: SimState, kind: number, params: readonly number[]): SimState {
  return step(state, [{ kind, params }], rngFromRootSeed(state.rootSeed));
}

/** A universe that changed its law, then waited `gap` bars, holding `favor`. */
function phraseOpenedThenWaited(gap: number, favor: number): SimState {
  let state = fresh();
  setFavor(state, 1_000_000);
  state = advance(state, GOD_ACTION.forbidTechnique, [TECHNIQUE_PARAM]);
  for (let tick = 0; tick < gap; tick += 1) state = advance(state, GOD_ACTION.noop, []);
  setFavor(state, favor);
  return state;
}

function admits(state: SimState, action: number): boolean {
  const mask = legalityMask({
    state,
    candidates: buildCandidates({ state, catalogue: content.catalogue }),
    catalogue: content.catalogue,
  });
  return isLegal(mask, action);
}

describe('the mask and the resolver agree about §5.2’s unease surcharge', () => {
  it('is the discriminating case: the two prices differ', () => {
    // The premise of everything below. If the surcharge were zero, the rest of
    // this file would pass vacuously.
    expect(UNEASE_BARS).toBeGreaterThan(0);
    expect(mul(BASE, FP_ONE + (UNEASE_BARS - 1) * UNEASE_STEP)).toBeGreaterThan(BASE);
  });

  it('never admits a constitutional act the resolver will refuse, at any point in the phrase', () => {
    // The property, swept rather than sampled: for every bar of the window and a
    // price on each side of the surcharge, the mask's verdict and the resolver's
    // must be the same verdict. Both halves of a disagreement are caught — a
    // mask that admits what the resolver refuses (the silent illegal-action
    // count) and a mask that refuses what the resolver would have applied (an
    // action an agent can never learn to take).
    //
    // **The price is measured, not predicted.** An earlier draft computed the
    // expected charge from `UNEASE_BARS` and the gap, and was wrong by one bar
    // because `step` advances the clock after resolving — so the test failed
    // while both implementations agreed with each other. Reading the charge off
    // a run with favor to spare removes the third model that could be the one
    // that is wrong.
    const charges: number[] = [];
    for (let gap = 0; gap <= UNEASE_BARS; gap += 1) {
      const rich = phraseOpenedThenWaited(gap, 1_000_000);
      const before = favorOf(rich);
      charges.push(before - favorOf(advance(rich, GOD_ACTION.forbidForm, [FORM_PARAM])));
    }

    // The premise, restated over the measured numbers: the surcharge is real and
    // it decays. Without this the sweep below could pass over a flat price.
    expect(charges[0]).toBeGreaterThan(charges[UNEASE_BARS] as number);
    expect(charges[UNEASE_BARS]).toBe(BASE);

    for (let gap = 0; gap <= UNEASE_BARS; gap += 1) {
      const charge = charges[gap] as number;
      for (const favor of [charge - 1, charge]) {
        const state = phraseOpenedThenWaited(gap, favor);
        const admitted = admits(state, GOD_ACTION.forbidForm);
        const before = favorOf(state);
        // The universe's favor is the only witness the core offers that a plan
        // was applied: §4.2 turns a refusal into a no-op and a counter, never an
        // exception, so "did it resolve" is "did it cost anything".
        const applied = favorOf(advance(state, GOD_ACTION.forbidForm, [FORM_PARAM])) < before;
        expect(admitted, `gap ${String(gap)}, favor ${String(favor)}`).toBe(applied);
      }
    }
  });

  it('admits the act at the base price once the phrase has run out', () => {
    // The control. Without it the sweep above would also pass for a mask and a
    // resolver that agreed to refuse every constitutional action forever.
    const state = phraseOpenedThenWaited(UNEASE_BARS, BASE);
    expect(admits(state, GOD_ACTION.forbidForm)).toBe(true);
  });
});
