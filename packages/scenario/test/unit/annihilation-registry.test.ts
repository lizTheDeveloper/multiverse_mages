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
  // `promotion:promoteStudentCohort` was registered here until W185. It floored
  // when a *small* matured student cohort yielded no mage at all, and the
  // reason it no longer fires is that `student` is now filled from `idle` in
  // whatever quantity the transfer pool allows rather than one frozen cohort at
  // a time, so the cohorts that mature are no longer small enough to round
  // their yield away. Removed rather than kept, per this file's own doctrine:
  // a registration describing something that does not happen is the failure it
  // exists to prevent. If it returns, it is a real finding about cohort size
  // and not a re-blessing.

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
  [
    'target-appeal:personalityTargetTerm',
    'The floor *is* the meaning. `floorDiv(ambition - FP_ONE, ' +
      'ambitionDivisor)` is how far a personality sits from the neutral ' +
      'midpoint, divided down to a per-tier weight; a mage three units of ' +
      '`fp` from neutral has a per-tier preference of less than one unit, and ' +
      'rounding that to nothing is the statement that she has no preference. ' +
      'Nothing stalls: the term is one of six addends, not a quantity that ' +
      'must move. Newly reachable since W185 opened the labour valve, which ' +
      'changed which mages exist and therefore which personalities the target ' +
      'scorer sees — not a new site, a newly *visited* one.',
  ],

  // ---- Floored, discarded, and documented as such. ----
  [
    'reallocation:reallocateOccupations',
    'A genuine floor with no banking, applied where the control law is stated. ' +
      'It used to be `collectSources` — the same floor, taken once per ' +
      '**cohort** — and W185 measured what that cost: cohorts are keyed on ' +
      'species x occupation x birth decade, so nearly all of them sit below ' +
      'sixteen members, every budget floored to zero, and reallocation moved ' +
      'zero scribes in either direction on 600 consecutive ticks. The rate is ' +
      "now the occupation's own pool, `floorDiv(supply * " +
      'TRANSFER_RATE_PER_TICK, FP_ONE)`, truncated exactly once and therefore ' +
      'independent of how the occupation is split up. It still annihilates ' +
      'for an occupation of fewer than sixteen people, which is 6.25% of ' +
      'fifteen rounded down and the honest reading of a rate with no bank — ' +
      'and persistence fell from every tick to a third of them. If that stops ' +
      'being the intent, this is the line that says so.',
  ],

  [
    'capital:applyLibraryUpkeep',
    'A genuine floor with no banking, declared at the site: "a shortfall ' +
      'smaller than one instance\'s worth costs nothing this tick", because ' +
      'banking it would need a pending-degradation field §1.5 does not have. ' +
      'DEGRADATION_PER_SHORTFALL is 32, so that is the threshold. **Newly ' +
      'reached rather than newly written** — W116 gave `completeAffiliation` a ' +
      'caller, and a universe whose mages actually join universities is the ' +
      'first one to keep libraries deep enough to owe upkeep it cannot pay.',
  ],

  [
    'terms:shareOfDeviation',
    'A scoring term, and the floor is a rounding step rather than a lost ' +
      'quantity: it converts how far a trait sits from `fp(1024)` neutral into ' +
      'a signed share, so a value one or two units off neutral scores 0 rather ' +
      'than a fraction of a point. Nothing accumulates and nothing can stall — ' +
      'the result is compared against other goals in the same tick and ' +
      '`boundTerm` clamps it anyway. `floorDiv` rather than a shift precisely ' +
      'so it rounds the same way for both signs, which the site explains. ' +
      '**Newly reached rather than newly written** — W116 made `affiliate` ' +
      'score an `ambition` term only on a transfer, so the ternary reaches ' +
      'this function on ticks where the old unconditional call did not.',
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
