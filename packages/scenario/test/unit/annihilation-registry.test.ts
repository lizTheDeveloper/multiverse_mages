/*
 * Multiverse Mages — the registry of functions allowed to floor a quantity away.
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
 * # The Zeno stall, made into a claim instead of an accident
 *
 * `assembled-run-values.test.ts` proves no *non-integer* reaches component
 * storage. This file proves the complementary thing, which nothing checked
 * before: that no function silently floors a live quantity to zero and leaves
 * it there.
 *
 * The project has met that failure three times and caught it three different
 * ways, all of them luck:
 *
 * - `planConstructionLabour` floored a backlog into a headcount of zero, so a
 *   site two per cent from done asked for nobody and stopped forever. Found by
 *   a probe written to measure something else.
 * - `RaidState.stabilityDecayPerTick` is authored rather than derived, with a
 *   comment saying a derived decay would give *"a raid that runs forever, with
 *   no error and no symptom"*. Found by reasoning, at authoring time.
 * - `laggedWorship` moves one unit when its step floors away. Found while
 *   writing the function.
 *
 * Three sites someone happened to look at, and no mechanism. This is the
 * mechanism.
 *
 * ## Why a registry rather than a threshold
 *
 * Flooring a small product to zero is what fixed-point arithmetic *does*, so
 * "no annihilation" is not a property the simulation can have, and a
 * persistence threshold would just be a number nobody could defend. What is
 * defensible is that the *set of functions which do it* is small, known, and
 * changes only on purpose — the same shape as the append-only stream-ID
 * registry that protects INV-3.
 *
 * **A new name here is not automatically a bug.** It is a function that can
 * round a live quantity to nothing, and it needs the same review
 * `laggedWorship` got: does it stall, or does it handle the zero? Add it below
 * with the answer, or fix it. Do not delete the assertion.
 */

import { describe, expect, it } from 'vitest';

import { mul, rngFromRootSeed, step } from '@mm/sim-core';
import { defineWorldSimulation } from '@mm/coordination';

import {
  AnnihilationRecorder,
  LONG_RUN_OPTIONS,
  LONG_RUN_SEED,
  buildReferenceState,
  referenceContent,
} from '../../src/index.js';

/**
 * World ticks the reference arm runs.
 *
 * Twenty world years, matching `assembled-run-values.test.ts`, and for the same
 * reason: long enough that grants have been taught out and materials produced
 * and spent, short enough that an invariant does not become a measurement.
 */
const TICKS = 240;

/**
 * Every function known to floor a non-zero quantity to zero, with the reason it
 * is allowed to.
 *
 * Keyed `module:functionName` rather than by line, so an unrelated edit above
 * a function does not fail this test. See `src/annihilation.ts`.
 */
const REGISTERED: ReadonlyMap<string, string> = new Map([
  // ---- The fraction is banked, not discarded. ----
  //
  // These floor a rate into a whole count and then spend the remainder as a
  // probability: `whole + (draw < remainder ? 1 : 0)`. A cohort whose expected
  // births are 0.3 has no births on 70% of ticks and one on the other 30%. The
  // floor is real and the sentinel is right to see it; nothing is lost, so
  // none of these can stall.
  [
    'carrying-capacity:cohortBirths',
    'Banked. `expectedBirths` floors to whole births and the remainder becomes ' +
      'the probability of one more, drawn once per cohort per tick.',
  ],
  [
    'mortality:cohortDeathsThisTick',
    'Banked, same shape as births. The draw is taken before the early return ' +
      'so the stream advances identically whether or not anyone dies.',
  ],
  // `promotion:promoteStudentCohort` was here until W197, described as
  // *"banked -- how many mages a matured student cohort yields, and the single
  // draw that decides the fraction."* **It no longer floors anything, and the
  // registry caught that from the direction it is unusual for a registry to
  // catch anything: `registeredButUnseen`.**
  //
  // W197 spends the species gate once, in the demand controller, so the
  // enrolment call passes `ENROLS_EVERY_LATENT_MEMBER` -- `FP_ONE` -- and the
  // arithmetic is an identity: the integer part is the whole count and the
  // remainder is always zero. The draw is still taken and still costs one, so
  // the `draws: 1` contract is intact; there is simply nothing left for it to
  // round. Deleting the row rather than leaving it is the registry's own rule,
  // stated below: *"a registry that only grows is a registry that goes
  // stale ... the entry is now describing something that does not happen, and
  // the next reader will trust it."*
  //
  // If a fraction is ever restored to that call site, the row comes back with
  // it.

  // ---- The floor *is* the meaning. ----
  //
  // Index and bucket arithmetic, where a quotient of zero names the first
  // bucket rather than losing a quantity. There is nothing here to stall.
  ['grid:techniqueBitOf', 'Index arithmetic. Zero is the first technique, not a lost quantity.'],
  ['clock:eraOf', 'Era index. Tick 1 is in era 0, which is what a floor is for.'],
  ['buckets:birthBucketOf', 'Bucket index. The youngest bucket is 0.'],
  [
    'buckets:normalizedCohortAge',
    'A normalized age in [0, FP_ONE]. A cohort younger than one bucket ' +
      'normalizes to 0, which is the intended reading.',
  ],
  ['age:normalizedAge', 'The same normalization, per mage rather than per cohort.'],

  // ---- Floored, discarded, and documented as such. ----
  [
    'reallocation:collectSources',
    'A genuine floor with no banking, and a declared consequence rather than ' +
      'an oversight: `TRANSFER_RATE_PER_TICK` is `FP_ONE / 16`, and the ' +
      "module's own note says \"cohorts smaller than 1 / TRANSFER_RATE_PER_TICK " +
      'never transfer at all". Sixteen is the threshold. If that stops being ' +
      'the intent, this is the line that says so.',
  ],

  // ---- W193: enrolment, and one site it reached by making the world poorer. ----
  [
    'world-step:latentInCohort',
    'A genuine floor with no banking, and the design asks for it. ' +
      '`count x prevalence` -- and `prevalence` alone since W197 -- is zero for ' +
      'every cohort smaller than `1 / prevalence`, at the shipped numbers about ' +
      'ten people for a human cohort and twenty for an orc one, and that is the ' +
      'intended reading: a population too small or too mundane to produce a ' +
      'single mage should ask for no students. Rounding it up would have every ' +
      'hamlet demanding a seat. Fires on every tick of the reference run because ' +
      "the reference universe's cohorts are small and fragmented by " +
      'construction, which is the same fragmentation ' +
      '`reallocation:collectSources` above is about. ' +
      '**W197 made this floor load-bearing in a way it was not.** It is now the ' +
      'only place the species gate is applied at all, so it is also the only ' +
      'thing standing between a rare species and never producing a mage. It ' +
      'does not currently do that -- every shipped species still graduates on ' +
      'every seed -- but if one ever truncates out of existence here, the ' +
      "remainder draw `promotion.ts` carries for exactly this reason has to " +
      'move into the demand path.',
  ],

  // ---- W197: two autonomy terms the arm newly reaches, neither of them new. ----
  [
    'terms:shareOfDeviation',
    'Floored and discarded, and the site is a **deviation from unity halved or ' +
      'quartered**: `floorDiv(value - FP_ONE, 2)` is zero for any species trait ' +
      'within one fixed-point unit of `1024`, which is a trait that is by ' +
      "definition saying \"average\". A term that reports \"no preference\" as " +
      'zero is the term behaving correctly, not annihilating a live quantity. ' +
      '**New to this registry in W197, and not because the function changed.** ' +
      'The reference arm now carries roughly two and a half times as many ' +
      'living mages, so goal scoring runs far more often and reaches trait ' +
      'values within one unit of unity that it previously never sampled. That ' +
      'is the registry doing its job -- reporting a site the arm newly reaches ' +
      '-- rather than a defect introduced.',
  ],
  [
    'target-appeal:personalityTargetTerm',
    'Floored and discarded, on the same argument and for the same reason. ' +
      '`floorDiv(ambition - FP_ONE, divisor)` is zero for a mage whose ambition ' +
      'or caution is within a divisor of the species mean -- an unremarkable ' +
      'personality having an unremarkable opinion -- and the bounded term it ' +
      'feeds is *supposed* to be able to say nothing. **New to this registry in ' +
      'W197 for the population reason above**: a larger and longer-lived mage ' +
      'roster rolls more personalities near the mean, and the arm reaches the ' +
      'floor on 16 of 240 ticks where it previously reached it on none.',
  ],
  [
    'capital:applyLibraryUpkeep',
    'Floored and discarded, and the function says so at the line: "a shortfall ' +
      'smaller than one instance\'s worth costs nothing this tick ... a library ' +
      'that is one unit short every tick forever is a library whose universe ' +
      'has a materials problem the economy layer will report." ' +
      '**New to this registry in W193, and not because the function changed.** ' +
      'It was already capable of flooring and the reference run never reached a ' +
      'shortfall small enough; student mages eat subsistence, so the run now ' +
      'goes marginally short on vellum on 17 of 240 ticks and the last unit ' +
      'floors. That is the registry doing its job -- reporting a site the arm ' +
      'newly reaches -- rather than a defect introduced. The consequence is ' +
      'bounded by the same argument the function makes, and if it stops being ' +
      'bounded the economy report is where it shows up.',

  // W207 registered `terms:shareOfDeviation` too, independently, with a
  // different and stronger argument for the same site — and only one entry may
  // carry the key. Its reasoning is kept here rather than lost, because it is a
  // proof where the entry above is an observation: every species trait in
  // `species.json` is a multiple of 128, so a *species* deviation cannot floor
  // to zero under a divisor of 2 or 4 unless it is already zero. The numerator
  // can therefore only be a **rolled personality axis** — a mage whose roll
  // landed 2/1024 from neutral gets no shading on a goal whose divisor is 4.
  // Nothing accumulates: the score is recomputed from the outlook every tick and
  // a stall would require the floored quantity to feed its own next value, which
  // an appeal term never does. W207 also measured that neither
  // `w196/mastery-rises` nor `w200/layer-one-fixes` reaches the site alone
  // (2026-08-15), which agrees with the entry above that it is a reachability
  // change and not a new floor.
  ],

  // ---- Handled at the site. ----
  [
    'worship:laggedWorship',
    'Handled. A rising gap of one unit floors to zero, and the function moves ' +
      'one unit instead of returning the stalled value, so worship still ' +
      'converges on its target.',
  ],
]);

describe('the set of functions that floor a live quantity to zero', () => {
  it('is exactly the registered set, over an assembled reference universe', () => {
    const content = referenceContent();
    const simulation = defineWorldSimulation(content.deps);
    const recorder = new AnnihilationRecorder();

    recorder.record(() => {
      let state = buildReferenceState({
        runSeed: LONG_RUN_SEED,
        options: LONG_RUN_OPTIONS,
        content,
        schema: simulation.schema,
      });
      for (let tick = 0; tick < TICKS; tick += 1) {
        recorder.atTick(tick);
        state = step(state, [], rngFromRootSeed(state.rootSeed));
      }
    });

    const seen = recorder.siteNames();
    const unregistered = seen.filter((site) => !REGISTERED.has(site));
    // Both directions, because a registry that only grows is a registry that
    // goes stale. If `laggedWorship` stops annihilating -- because its rate
    // changed, or because the arm stopped reaching it -- the entry below is now
    // describing something that does not happen, and the next reader will trust
    // it. That is the same failure as an arm asserting cleanliness over a
    // mechanic it never reached; see INV-39.
    const registeredButUnseen = [...REGISTERED.keys()].filter((site) => !seen.includes(site));
    const detail = recorder
      .sites()
      .filter((row) => unregistered.includes(row.site))
      .map(
        (row) =>
          `${row.site} annihilated on ${String(row.ticks)}/${String(TICKS)} ticks ` +
          `(${row.persistence.toFixed(3)}), e.g. floorDiv(` +
          `${String(row.sample.numerator)}, ${String(row.sample.denominator)}) -> 0`,
      );

    expect(detail, detail.join('\n')).toEqual([]);
    expect(unregistered).toEqual([]);
    expect(registeredButUnseen).toEqual([]);
  });

  it('and the instrument that says so can be made to fail', () => {
    // The half that usually gets skipped. A recorder that never fires would
    // pass the assertion above forever, so drive a known annihilation through
    // the real sentinel and require that it is both seen and attributed.
    const recorder = new AnnihilationRecorder();

    recorder.record(() => {
      recorder.atTick(0);
      annihilateOnPurpose();
    });

    expect(recorder.siteNames()).toEqual(['annihilation-registry.test:annihilateOnPurpose']);
    const [site] = recorder.sites();
    expect(site?.sample.denominator).toBe(1024);
    expect(site?.persistence).toBe(1);
  });

  it('keeps watching across an await, which it did not', async () => {
    // Found by an adversarial reviewer on a different model, pointed at this
    // campaign's own work.
    //
    // `record` was `try { return body(); } finally { restore() }`. With an
    // async body that is silently useless: `body()` returns its promise at the
    // first `await`, `finally` runs *then*, and the sentinel is uninstalled
    // before any awaited work happens. Measured before the fix: this body
    // reported `[]` while the identical synchronous body reported the site.
    //
    // It matters because every long arm in this repository yields to the vitest
    // runner once a world year, which makes it async — so the shape most likely
    // to be used was the shape that recorded nothing. An instrument that
    // appears to be watching and is not is the exact failure this module exists
    // to catch, one level up.
    const recorder = new AnnihilationRecorder();

    await recorder.record(async () => {
      await Promise.resolve();
      recorder.atTick(0);
      annihilateOnPurpose();
    });

    expect(recorder.siteNames()).toEqual(['annihilation-registry.test:annihilateOnPurpose']);
  });

  it('restores the previous sentinel even when an async body rejects', async () => {
    const recorder = new AnnihilationRecorder();

    await expect(
      recorder.record(async () => {
        await Promise.resolve();
        throw new Error('body failed');
      }),
    ).rejects.toThrow('body failed');

    // If the restore had been skipped on the rejecting path, this recorder
    // would still be installed and the next arm would attribute to it.
    const after = new AnnihilationRecorder();
    after.record(() => {
      after.atTick(0);
      annihilateOnPurpose();
    });
    expect(recorder.siteNames()).toEqual([]);
    expect(after.siteNames()).toEqual(['annihilation-registry.test:annihilateOnPurpose']);
  });
});

/** `1 * 1` in fixed-point is `1/1024 * 1/1024`, which floors to nothing. */
function annihilateOnPurpose(): number {
  return mul(1, 1);
}
