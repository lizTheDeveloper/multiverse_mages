/*
 * Multiverse Mages — the ablation mask, from a RunTask to a different universe.
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
 * ## The test that was missing while §9 was unreachable
 *
 * `RunTask.ablatedPrimitives` was set by `tasks.ts`, validated by
 * `ablation.ts`, carried across the worker boundary, and read on the far side by
 * **nothing**. Every arm of an ablation sweep therefore ran the unablated
 * universe, and the campaign's own instrumentation found it the way it finds
 * everything of this shape: a counter on `stackMagnitudes` reported **0 of
 * 70,462** stacked magnitudes seeing a mask over a 300-tick reference run, and
 * the declared arm's outcome was byte-identical to the control's.
 *
 * `ablation-scheduling.test.ts` was green throughout. It asserts that `armSpec`
 * returns a spec whose `ablation.primitives` is `['ward']` and that `buildTasks`
 * copies that onto the task — both true, both irrelevant to whether the
 * simulation ever saw it. **A test that stops at the data structure is the test
 * that passes while the seam is open**, so this file deliberately never inspects
 * a mask, a spec or a task field. It runs two universes and compares what they
 * became.
 *
 * ## Why `resource-yield`, and why 240 ticks
 *
 * Both are measured rather than chosen, and the measurements are the reason the
 * obvious cheaper versions of this test do not work.
 *
 * **The primitive.** Only three call sites in `world-step.ts` forward
 * `deps.ablation` — `materialsProduced`, `advanceConstruction` and
 * `appliedYield` — so `resource-yield` and `build-rate` are the only two
 * primitives the world loop can currently neutralize at all. Masking
 * `research-rate`, `teach-rate`, `scribe-rate`, `fertility` or `lifespan` in a
 * reference run neutralizes **zero** stacked magnitudes today; a test written
 * over one of those would assert "no difference" and pass for the wrong reason.
 * `build-rate` is out for the reason `causal-chain-build-rate.test.ts` had to
 * hand-seed a site: the reference universe seeds its academy complete, so a
 * passive run has nothing to build.
 *
 * **The horizon.** Masking `resource-yield` neutralizes thousands of magnitudes
 * from early on — 2,997 by tick 120 — and the census is *still* identical at
 * tick 192, because a material surplus absorbs the loss. The census first
 * diverges between tick 192 and tick 204. 240 is four census intervals past
 * that boundary, where the divergence is 20% of knowledge instances and 68% of
 * grimoires: far enough that a content tweak moving the boundary a little
 * cannot silently turn this into a passing test of nothing.
 *
 * That last sentence is the whole argument for spending seconds here. A cheaper
 * horizon exists and would have been fine on the day it was written.
 */

import { describe, expect, it } from 'vitest';

import type { RunTask } from '@mm/mc-harness';

import { executeReferenceRun, referenceContent } from '../../src/index.js';
import type { CensusSample } from '../../src/census.js';

/**
 * The horizon both arms run to. See the file comment: measured, not picked.
 */
const HORIZON = 240;

/** A cheap horizon, for the runs that only have to be *identical*. */
const SHORT_HORIZON = 36;

/**
 * The primitive both arms disagree about.
 *
 * One of exactly two the world loop can neutralize today. If this test ever
 * fails because `resource-yield` stopped being one of them, the fix is to
 * forward `deps.ablation` at more call sites, not to change this constant.
 */
const ABLATED = 'resource-yield';

/**
 * Shared across every run but the last on purpose.
 *
 * A `ReferenceContent` is read-only and reused across thousands of runs — an
 * executor pre-resolves one, and `CONTENT_BY_TRADITION` memoizes one per
 * tradition for the life of a worker. So the realistic wrong version of this
 * fix is one that folds the mask into `content.deps`, which mutates or
 * replaces a value later runs still hold. Passing one object to both the
 * ablated run and the control after it is what gives the leak test below
 * something real to catch.
 */
const shared = referenceContent();

function taskFor(ablatedPrimitives: readonly string[], worldTickCap: number): RunTask {
  return {
    coordinates: {
      sweepId: 'ablation-reaches-the-world-loop',
      rootSeed: 0x1234_5678,
      cellIndex: 0,
      replicateIndex: 0,
    },
    runSeed: 0x1234_5678,
    levels: { cohortSize: 12, foundingMages: 2, foundingNodes: 4 },
    strategies: ['permissive-breadth'],
    worldTickCap,
    metrics: [],
    ablatedPrimitives: [...ablatedPrimitives],
  };
}

function censusOf(task: RunTask, content = shared): CensusSample {
  const result = executeReferenceRun(task, { content });
  const last = result.samples.at(-1);
  if (last === undefined) {
    throw new Error('A completed run kept no census sample; the recorder is not sampling.');
  }
  return last;
}

/**
 * The two long arms, run once between them.
 *
 * Memoized rather than run per test, and *lazily* rather than at module scope:
 * a run at this horizon costs seconds, four assertions read the pair, and work
 * done while a file is being collected is outside every test timeout — which
 * turns a slow machine into a collection error rather than into a slow test.
 *
 * The control is taken **first**, deliberately. If a mask ever leaked into the
 * shared `ReferenceContent`, taking the control afterwards would hide the leak
 * inside the very number the leak test compares against.
 */
let pair: { control: CensusSample; ablated: CensusSample } | undefined;
function arms(): { control: CensusSample; ablated: CensusSample } {
  if (pair === undefined) {
    const control = censusOf(taskFor([], HORIZON));
    pair = { control, ablated: censusOf(taskFor([ABLATED], HORIZON)) };
  }
  return pair;
}

/** Long enough for two 240-tick runs on a machine several agents are sharing. */
const RUN_TIMEOUT_MS = 300_000;

/**
 * How far below the control's population the ablated arm may finish, in percent.
 *
 * ## This was an equality, and the equality was never structural
 *
 * It read `expect(ablated.population).toBe(control.population)`, and its comment
 * gave the reason: the knowledge and grimoire losses above should read as *"a
 * loss the arm suffered rather than an arm that died"*. That reading is right.
 * The equality was the wrong instrument for it, and this tree is where it
 * finally reported so: **494 control, 495 ablated.**
 *
 * ## The mechanism, measured rather than argued
 *
 * The two effect campaigns this branch unions each raise the population level,
 * and the first suspicion was that one of them had coupled knowledge to bodies
 * in a way that made the arms diverge. Instrumented at the union's own seed
 * (`0x12345678`, `HORIZON` 240), the wires do move the level a long way:
 *
 * | wiring | control | ablated | delta |
 * |---|--:|--:|--:|
 * | both wires off | 325 | 325 | 0 |
 * | academic rates only | 304 | 304 | 0 |
 * | vitality only | 392 | 392 | 0 |
 * | **both (this tree)** | **494** | **495** | **+1** |
 *
 * Which looks exactly like an interaction defect, and is not one. Re-run across
 * six seeds it falls apart:
 *
 * | seed | both wires off | academic only | vitality only | both |
 * |---|--:|--:|--:|--:|
 * | `0x12345678` | 0 | 0 | 0 | **+1** |
 * | `0x00000001` | **−3** | **+1** | **−10** | **−5** |
 * | `0x00000002` | 0 | 0 | 0 | 0 |
 * | `0xdeadbeef` | 0 | 0 | 0 | 0 |
 * | `0x0badc0de` | 0 | 0 | 0 | 0 |
 * | `0x5eed0007` | 0 | 0 | 0 | 0 |
 *
 * **The pre-campaign column is not all zeroes.** With neither wire installed —
 * the behaviour `main` ships — seed `0x00000001` already finishes 3 people
 * apart. So the equality was a property of one seed, not of the simulation, and
 * "it passed before and fails now" is a statement about `0x12345678` rather than
 * about a coupling either wire introduced. The sign is not systematic either:
 * +1, −3, −5, −10 all appear. Nothing here says the ablated arm is better off.
 *
 * The channel is ordinary and predates both wires. `resource-yield` feeds
 * `stock.food`; food is the only kind `carryingCapacity` reads; capacity sets
 * `fertilityBrake`; and `deliverBirths` is stochastic. Two arms whose food
 * histories differ take different draws and land a few people apart in either
 * direction. What the wires changed is the *level* — 325 to 494 — which moved
 * this seed off the zero it had been sitting on by luck.
 *
 * ## Why a floor, and why one-sided
 *
 * *Not having died* was always the claim; the equality was a proxy that happened
 * to hold. So this is the weakest statement that still makes the claim:
 *
 * - **One-sided.** An ablated arm finishing with slightly more people is not the
 *   failure this guards. The inverted-mask failure the file comment warns about
 *   — `0` substituted for `FP_ONE` under `additive-into-multiplier`, multiplying
 *   an arm's whole economy by zero — is caught by the two `toBeLessThan`
 *   assertions above, which a better-off arm cannot satisfy.
 * - **A constant, not a ratio off `knowledgeInstances`.** A tolerance derived
 *   from the quantity that is diverging widens itself as the mechanic grows,
 *   which is how a guard stops guarding with nobody editing it.
 * - **A backstop, not a discriminator, and said plainly** — the largest
 *   population swing any lever in the table above produces is 10 of ~500, so
 *   nothing this test can currently do will trip 95%. It is kept because the
 *   coupling is real at longer horizons: `gate-power.test.ts`'s
 *   `BLIND_ARM_LINES` records `referencePeakPopulation@permissive-breadth`
 *   moving 7,009 → 12,685 at the 2,400-tick gate.
 *
 * PR #161 (`anti-requisites`) reached the same replacement independently, from a
 * different failure and with the same constant and name, so the two resolve
 * together. Its evidence is the ablation table across all seven primitives at
 * one seed; this one is one primitive across six seeds, including the seeds
 * where the pre-campaign tree already disagreed with itself.
 *
 * Measured on `w187/effects-union` at `9be84ea`, 2026-08-14.
 */
const POPULATION_FLOOR_PERCENT = 95;

describe('an ablation arm is not its own control', () => {
  it('a task naming an ablated primitive produces a different universe', () => {
    const { control, ablated } = arms();
    // Not `not.toEqual` on one field: the claim is that the *run* diverged, and
    // naming the field would let a future change satisfy this by moving a
    // different number.
    expect(ablated).not.toEqual(control);
  }, RUN_TIMEOUT_MS);

  it('neutralizing resource-yield costs the universe knowledge and grimoires', () => {
    const { control, ablated } = arms();
    // The direction is asserted, not only the difference. A mask that arrived
    // and made the ablated arm *better* would satisfy the test above, and would
    // mean the neutralization identity is inverted — which `ablation.ts` warns
    // about at length for `additive-into-multiplier`, where substituting `0` for
    // `FP_ONE` multiplies the arm's whole economy by zero.
    expect(ablated.knowledgeInstances).toBeLessThan(control.knowledgeInstances);
    expect(ablated.grimoires).toBeLessThan(control.grimoires);

    // And it is a loss the arm suffered rather than an arm that died. See
    // `POPULATION_FLOOR_PERCENT`: this was an equality until the union of the
    // two effect campaigns showed the equality had only ever held on this seed.
    expect(ablated.population).toBeGreaterThanOrEqual(
      Math.floor((control.population * POPULATION_FLOOR_PERCENT) / 100),
    );
  }, RUN_TIMEOUT_MS);

  it('the two arms ran the same length, so the difference is not a shorter run', () => {
    const { control, ablated } = arms();
    expect(ablated.worldTick).toBe(control.worldTick);
  }, RUN_TIMEOUT_MS);
});

describe('the mask belongs to one run', () => {
  it('does not leak into the memoized content the next run reuses', () => {
    // Same shared `ReferenceContent` the ablated run above was executed against,
    // versus a content set that has never seen a mask. A fix that wrote the mask
    // into `content.deps` — the obvious one-line version — would make every
    // subsequent run holding that object an ablation arm, and the sweep would
    // still complete with entirely plausible numbers.
    arms();
    const afterAblated = censusOf(taskFor([], SHORT_HORIZON));
    const untouched = censusOf(taskFor([], SHORT_HORIZON), referenceContent());
    expect(afterAblated).toEqual(untouched);
  }, RUN_TIMEOUT_MS);
});

describe('a task the mask cannot represent is refused', () => {
  it('names both primitives rather than ablating the first', () => {
    // `ablationMaskFor` rather than `neutralizing(ids[0])`, so a pairwise arm
    // cannot be recorded under two names having neutralized one.
    expect(() => executeReferenceRun(taskFor(['ward', 'blink'], SHORT_HORIZON), { content: shared }))
      .toThrow(/single-primitive only/);
  });
});
