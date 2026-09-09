/*
 * Multiverse Mages — the `acquire` hook, as a universe rather than as arithmetic.
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
 * **The measurement behind the 0.3.0 release claim's `acquire` half.**
 *
 * > Each of the three v1 traditions changes measurable behaviour through its
 * > declared hook, and through no other path.
 *
 * For the whole of 0.3.0 that sentence was defended for `store`, `cast` and
 * `cost` and *asserted* for `acquire`. `applyAcquire` had no caller outside a
 * test: the world loop gated teaching on the catalog's authored `teachCost`,
 * priced research against the authored `researchCost`, and created every derived
 * instance at the placeholder mastery. A tradition could declare
 * `teachCostMultiplier` and no mage anywhere would pay it.
 *
 * `packages/rules-magic/test/unit/tradition-dispatch.test.ts` could not catch
 * that, and neither could the release-claim suite next door to it: both prove
 * `applyAcquire` returns different numbers for different hooks, which was true
 * the entire time the hook was inert. **Only a run can catch it**, so this file
 * runs one.
 *
 * ## Two universes that differ in one hook
 *
 * The pair is chosen by asking the hooks, never by naming a tradition
 * ({@link traditionsDifferingOnlyAtAcquire}). Today it resolves to True Naming
 * against Vancian Memorization, which is a genuinely controlled comparison at
 * this build: their `store` hooks resolve to identical policies, and `cast` and
 * `cost` are engagement-time hooks that the world loop does not consult at all —
 * `WorldStepDeps` takes `store` and `acquire` and nothing else from a tradition.
 * So a difference between these two runs has one available cause.
 *
 * That is also what makes the test a mutation detector: unwire
 * `GatewayDeps.acquire` and the two universes become the same universe, which is
 * the first assertion below and the reason it is written as an inequality of
 * whole transcripts before anything is attributed.
 *
 * **No balance claim.** `release-plan.md` forbids one before 0.5.0 and nothing
 * here is one: that True Naming researches slower and teaches at all is a
 * consequence of content nobody has tuned. The claim is that the hook reaches a
 * mage, not that where it lands is right.
 */

import { describe, expect, it } from 'vitest';

import { step } from '@mm/sim-core';
import type { SimState } from '@mm/sim-core';
import { KNOWLEDGE_INSTANCE, componentOf } from '@mm/state';
import {
  DEFAULT_INITIAL_MASTERY,
  DEFAULT_TEACH_THRESHOLD,
  MASTERY_MAX,
  hooksOfTradition,
  storePolicy,
  traditionTableFrom,
} from '@mm/rules-magic';

import { defineWorldSimulation } from '../../src/index.js';

import { registry, seededWorld, sourceFor, worldDeps } from './world-fixtures.js';

const ROOT_SEED = 0x00ac_0001;
/**
 * Budget for the replay check, which is another whole run.
 *
 * Stated rather than left to the 5s default because a universe with teaching in
 * it is genuinely slower than one without — that is the fix working — and a
 * timeout here would read as a nondeterminism failure, which is the one thing
 * this test must never be ambiguous about.
 */
const REPLAY_TIMEOUT_MS = 120_000;
/**
 * Five world years.
 *
 * Long enough that both universes derive nodes steadily rather than once — so
 * "fewer nodes" is a rate and not a truncation — and short enough that four runs
 * of it are a couple of seconds each. That second half is not tidiness: this
 * file runs the whole world loop four times, and a suite where one test's cost
 * pushes another over its timeout reports a defect that is not there. The
 * 200-year question belongs to the Monte Carlo harness, which runs the reference
 * universe rather than this six-species fixture.
 */
const TICKS = 60;

/** One run's mage-facing outcome. Comparable with `toEqual`. */
interface Universe {
  /** Research projects that became instances, over the run. */
  readonly researchCompleted: number;
  /** Lessons that paid their cost and transmitted, over the run. */
  readonly lessonsTaught: number;
  /** The tick the first node was derived on, or `-1`. */
  readonly firstDerivationTick: number;
  /** Instances alive at the end, by mastery, ascending. */
  readonly masteries: readonly number[];
}

/**
 * Two shipped traditions whose only differing hook the world loop can see is
 * `acquire`.
 *
 * Resolved from the hooks rather than named, for the reason `world-fixtures.ts`
 * gives about `scribingTraditionId`: ids are interned in code-unit order, so
 * "the first tradition" is not the first in the file, and a content reorder
 * would silently re-point a hardcoded pair at the wrong comparison.
 *
 * The `store` policies are compared field by field rather than assumed
 * identical, because a pair differing at `store` as well would still produce two
 * different universes and would prove nothing about `acquire`.
 */
function traditionsDifferingOnlyAtAcquire(): { hooked: number; standard: number } {
  const table = traditionTableFrom(registry());
  const ids = registry().traditions.map((entry) => entry.contentId);

  for (const hooked of ids) {
    const hookedHooks = hooksOfTradition(hooked, table);
    if (hookedHooks.acquire.kind === 'standard') continue;
    const hookedStore = storePolicy(hookedHooks.store);

    for (const standard of ids) {
      if (standard === hooked) continue;
      const otherHooks = hooksOfTradition(standard, table);
      if (otherHooks.acquire.kind !== 'standard') continue;
      const otherStore = storePolicy(otherHooks.store);
      if (otherStore.kind !== hookedStore.kind) continue;
      if (otherStore.personalLocationKind !== hookedStore.personalLocationKind) continue;
      if (otherStore.slotsPerMage !== hookedStore.slotsPerMage) continue;
      if (otherStore.scribingAvailable !== hookedStore.scribingAvailable) continue;
      return { hooked, standard };
    }
  }

  throw new Error(
    'No pair of shipped traditions differs at `acquire` while agreeing at `store`, so this file ' +
      'cannot attribute a difference between two runs to one hook. That is a content change, not ' +
      'a test failure — the comparison needs re-designing before it can be trusted again.',
  );
}

/** Runs one universe under one tradition and reports what its mages are left holding. */
function universe(traditionId: number): Universe {
  const simulation = defineWorldSimulation(worldDeps(traditionId));
  const { state } = seededWorld(simulation.schema, { rootSeed: ROOT_SEED, traditionId });
  const source = sourceFor(ROOT_SEED);

  let current = state;
  let researchCompleted = 0;
  let lessonsTaught = 0;
  let firstDerivationTick = -1;
  for (let tick = 0; tick < TICKS; tick += 1) {
    current = step(current, [], source);
    const report = simulation.lastReport();
    if (report === undefined) continue;
    if (report.researchCompleted > 0 && firstDerivationTick < 0) firstDerivationTick = tick;
    researchCompleted += report.researchCompleted;
    lessonsTaught += report.lessonsTaught;
  }

  return {
    researchCompleted,
    lessonsTaught,
    firstDerivationTick,
    masteries: masteriesIn(current),
  };
}

/** Every surviving instance's mastery, ascending. */
function masteriesIn(state: SimState): readonly number[] {
  const store = componentOf(state, KNOWLEDGE_INSTANCE);
  const mastery = store.field('mastery');
  const found: number[] = [];
  store.forEach((row) => found.push(mastery[row] as number));
  return found.sort((a, b) => a - b);
}

describe('the acquire hook reaches a running universe', () => {
  const { hooked, standard } = traditionsDifferingOnlyAtAcquire();
  const withHook = universe(hooked);
  const withoutHook = universe(standard);

  it('produces two different universes from one seed and one starting position', () => {
    // The whole point, and the assertion that goes red the moment the gateway
    // stops consulting the hook: with `acquire` unwired these two runs behave
    // identically, because the loop reads nothing else from a tradition.
    //
    // **Deliberately not the snapshot hash.** `traditionId` is a field of the
    // universe record, so two runs under two traditions have different hashes
    // whatever the hooks do or fail to do — an assertion on the hash is green
    // against an inert hook and was, for the whole of 0.3.0. What is compared
    // is what happened to the mages.
    expect(withHook).not.toEqual(withoutHook);
  });

  it('charges the declared research multiplier: the first node is derived later', () => {
    // `researchCostMultiplier` above `fp(1)` is dearer research, and dearer
    // research is a later first derivation and fewer of them in a fixed span.
    // Both mages work the same month at the same rate — `MAGE_MONTHS_PER_TICK`
    // is not a tradition's to move — so the delay is the cost and nothing else.
    expect(withHook.firstDerivationTick).toBeGreaterThan(withoutHook.firstDerivationTick);
    expect(withoutHook.firstDerivationTick).toBeGreaterThanOrEqual(0);
    expect(withHook.researchCompleted).toBeLessThan(withoutHook.researchCompleted);
  });

  it('creates derived instances at the declared mastery, so teaching comes sooner', () => {
    // The hook says a name is known or it is not, and the declared masteries
    // still differ at creation: `fp(1024)` against a placeholder that sits
    // below `TEACH_THRESHOLD`.
    expect(DEFAULT_INITIAL_MASTERY).toBeLessThan(DEFAULT_TEACH_THRESHOLD);

    // ## What this assertion used to say, and why it had to change
    //
    // It read: the standard universe's ceiling is its placeholder mastery,
    // *"which nothing in the loop ever raises"*, and `withoutHook.lessonsTaught`
    // is exactly `0`. Both were true and both were a statement of the defect
    // `w196/mastery-rises` fixes — `setMastery`'s only rules-path caller was the
    // decay sweep. A standard universe was not slow at transmitting knowledge,
    // it was **structurally incapable** of it, and this test was one of the
    // places that fact was written down as though it were a property of
    // traditions.
    //
    // With `GOAL.practice` in the loop both universes climb: the measured
    // ceiling is 1019 on each arm at twenty years. So the acquire hook's
    // difference is no longer possible-versus-impossible. It is **15× the
    // transmission** — 479 lessons against 31 — because True Naming's mages
    // start above the threshold and everybody else has to spend months getting
    // there. That is a tradition being *better*, which is what a tradition
    // should be, rather than a tradition being the only one that works.
    expect(Math.max(...withHook.masteries)).toBeGreaterThan(DEFAULT_TEACH_THRESHOLD);
    expect(Math.max(...withHook.masteries)).toBeLessThanOrEqual(MASTERY_MAX);
    expect(Math.max(...withoutHook.masteries)).toBeLessThanOrEqual(MASTERY_MAX);
    // The fix itself, asserted here because this is the test that pinned its
    // absence: a universe with no tradition help now gets above the threshold.
    expect(Math.max(...withoutHook.masteries)).toBeGreaterThan(DEFAULT_INITIAL_MASTERY);

    expect(withoutHook.lessonsTaught).toBeGreaterThan(0);
    expect(withHook.lessonsTaught).toBeGreaterThan(withoutHook.lessonsTaught * 4);
  });

  it('is reproducible: the same seeded universe twice', () => {
    // The hooked run only. Both arms are the same machinery over the same
    // fixture, and this file already runs the world loop three times — a fourth
    // whole universe to re-establish a property `world-step.test.ts` asserts
    // tick by tick is cost the suite pays on every commit for no extra
    // information.
    expect(universe(hooked)).toEqual(withHook);
  }, REPLAY_TIMEOUT_MS);
});
