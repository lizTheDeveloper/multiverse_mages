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

  // `capital:applyLibraryUpkeep` was registered here twice — once in W193 and
  // once in W197, independently, for the same site — and **both rows are gone on
  // `integration/all-branches`, 2026-08-17.** Not because the arm stopped
  // reaching the function: because **the function no longer floors anything**.
  //
  // What the W193 row said: *"A genuine floor with no banking, declared at the
  // site: 'a shortfall smaller than one instance's worth costs nothing this
  // tick' ... DEGRADATION_PER_SHORTFALL is 32, so that is the threshold. Newly
  // reached rather than newly written — W116 gave `completeAffiliation` a
  // caller."* W197's row said the same thing about the same line, adding that
  // the run *"goes marginally short on vellum on 17 of 240 ticks and the last
  // unit floors."*
  //
  // `knowledge-fidelity` took the conversion out. `UpkeepOutcome` used to carry
  // `degradedInstances: Math.min(depth.instanceCount, floorDiv(shortfall,
  // DEGRADATION_PER_SHORTFALL))`; it now reports the shortfall whole and
  // `coordination` spends it against particular books at their own `durability`,
  // because a flat price charged every book the same *"regardless of how well it
  // was made"*. The `floorDiv` left the function with the field. What remains in
  // `applyLibraryUpkeep` is `Math.min`, `Math.max` and a subtraction.
  //
  // The registry caught this from the direction it is unusual to catch anything
  // — `registeredButUnseen`, the same direction that retired
  // `promotion:promoteStudentCohort` in W197 — and it caught it while the arm
  // was under *more* pressure than when the rows were written, not less:
  // `libraryUpkeep` is short on **147 of 240 ticks** here, totalling 32,789 fp,
  // and its smallest non-zero shortfall is 38 fp. Under the old code every one
  // of those 147 ticks would have floored. Deleting the rows rather than leaving
  // them is this file's own rule, stated below the assertion.
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
  // (The W197 duplicate of `capital:applyLibraryUpkeep` stood here and is gone
  // for the reason above. The W207 note below is kept: it is about
  // `terms:shareOfDeviation`, not about upkeep, and only one entry may carry a
  // key.)
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


  // ---- Not a live quantity: a comparison weight. ----
  //
  // Reviewed on the terms this file's header sets — does it stall, or does it
  // handle the zero — and the answer is neither, because there is nothing here to
  // stall. `effortTerm` is one of six addends in an appeal score used only to
  // *order* candidate research targets against each other. It stores nothing,
  // drains nothing, and carries no state between ticks.
  //
  // It floors when a target is nearly finished: the sample is
  // `floorDiv(58, 64) -> 0`, a remaining cost of 58/1024 fp against an
  // `effortDivisor` of 64. The term is negative by construction because remaining
  // cost is a price, so flooring it to zero means "this project is so nearly done
  // that it carries no effort penalty" — which is the correct reading of that
  // input and not a lost quantity. The five other terms still separate the
  // candidates, and a target whose effort penalty rounds away is a target the
  // penalty was never going to decide.
  //
  // It appears now because enabling all seventy cells took the research frontier
  // from 51 nodes to 300, which is the first content set in which a remaining cost
  // lands in `(0, 64)` inside twenty world years. It fires on 2 of 240 ticks
  // (persistence 0.008), so the sentinel is right to see it and right not to be
  // alarmed.
  [
    'target-appeal:effortTerm',
    'Not a quantity. One of six addends ordering research candidates; it stores ' +
      'nothing and carries nothing between ticks. Floors only for a nearly ' +
      'finished target — floorDiv(58, 64) — where "no effort penalty" is the ' +
      'correct reading of the input rather than a loss. First reachable when all ' +
      'seventy cells were enabled and the frontier went from 51 nodes to 300.',
  ],

  // ---- W300: three sites the open grid and the materials economy newly reach. ----
  //
  // All three arrived together on `integration/all-branches`, 2026-08-17, and
  // none of the three functions changed. Each is reviewed on the terms this
  // file's header sets — *does it stall, or does it handle the zero* — and each
  // answer is recorded with the tick counts the recorder reported over the
  // 240-tick reference arm.
  [
    'envelope:envelopeSlotAt',
    'Index arithmetic, exactly as `grid:techniqueBitOf` and `clock:eraOf` above. ' +
      '`floorDiv(progress x ENVELOPE_SLOTS, required)` names which eighth of an ' +
      'acquisition a project sits in, and zero names the first eighth — the ' +
      'sample is floorDiv(1936, 5039), a project 38% of the way through its ' +
      'first slot. There is no quantity here to lose and nothing to stall: the ' +
      'index selects a multiplier, `envelopeMultiplier` clamps it into range, ' +
      'and a caller that omits an envelope gets FP_ONE. It floors on 174 of 240 ' +
      'ticks (persistence 0.725) because most research is in its opening slot ' +
      'most of the time, which is what an eight-slot curve over a multi-month ' +
      'project means. **Newly reached rather than newly written** — the effort ' +
      'envelope is threaded through research, teaching and scribing, and the ' +
      'reference arm reaches it on every tick a project is under way.',
  ],
  [
    'lifespan:effectiveLifespan',
    'A genuine floor with no banking, and the unit is the reason: a lifespan is ' +
      'in whole months, so `toInt(stacked.value)` discards a bonus worth less ' +
      'than one month. The sample is floorDiv(18, 1024) — 18/1024 of a month, ' +
      'about thirteen hours. It cannot stall: the function is recomputed from ' +
      'scratch at every hazard evaluation (its own docstring says why), nothing ' +
      'accumulates between ticks, and the floored term is one of three addends ' +
      'beside a species base of hundreds of months. What it costs is real and ' +
      'bounded — an extension effect too small to be worth a month is worth ' +
      'nothing — and if that stops being the intent, the fix is banking the ' +
      'remainder in `stackMagnitudes`, not here. ' +
      '**Newly reached rather than newly written, and the cause is named in ' +
      'advance**: `knowledge-vitality.ts` records that its lifespan magnitudes ' +
      'were "zero in any v1 universe ... all twenty-two authored nodes sat ' +
      'outside the twelve enabled cells, so `permits()` refused every one of ' +
      'them". This campaign enabled all seventy, so the stack has contributors ' +
      'for the first time and the rounding step at the end of it is finally ' +
      'visible. Fires on 32 of 240 ticks (0.133).',
  ],
  [
    'materials:materialsProduced',
    'A genuine floor with no banking, at the land-share split: ' +
      '`floorDiv(worked x shares[kind], FP_ONE)` is zero when a cohort works ' +
      'less than one fp unit into a kind. The sample is floorDiv(512, 1024) — ' +
      'half a unit of a material, from a cohort too small or too tilted away ' +
      'from that kind to make a whole one. Nothing stalls: production is ' +
      'recomputed per cohort per tick from headcount and affinity, no remainder ' +
      'is carried and none is owed, and the same cohort produces the moment it ' +
      'is larger or its share is higher. It is the same reading ' +
      '`world-step:latentInCohort` above carries — a population too small to ' +
      'produce a whole unit should produce none, and rounding it up would have ' +
      'every hamlet quarrying stone. Fires on 4 of 240 ticks (0.017), which is ' +
      'the honest rate for a floor that needs both a small cohort and a low ' +
      'share to bite. **Newly reached rather than newly written** — `material-' +
      'economy` widened the stock from three kinds to seven and tilted the land ' +
      'shares by species aptitude, so a cohort now splits one month of work ' +
      'across four land kinds instead of concentrating it.',
  ],

  // ---- Handled at the site. ----
  [
    'worship:laggedWorship',
    'Handled. A rising gap of one unit floors to zero, and the function moves ' +
      'one unit instead of returning the stalled value, so worship still ' +
      'converges on its target.',
  ],
]);

/**
 * Hands the event loop back so the vitest worker can answer its runner.
 *
 * The convention `packages/scenario/src/annihilation.ts` names — *"every long
 * arm in this repository yields to the vitest runner once a world year"* — and
 * the reason `AnnihilationRecorder.record` was hardened to hold the sentinel
 * across an await. This arm was the one that had the budget and not the yield:
 * it runs 240 ticks of instrumented reference universe in one unbroken
 * synchronous block, 320 s on this box, and a worker that has not touched its
 * event loop for that long cannot answer birpc inside its hardcoded 60 s. That
 * surfaces as `[vitest-worker]: Timeout calling "onTaskUpdate"` in the
 * unhandled-error list — four of them locally and five on GitHub Actions job
 * 95387839967 on 2026-08-17, each of which fails the run on its own and
 * *under-reports* what else happened.
 *
 * It changes no number: the simulation between yields is unchanged and entirely
 * synchronous.
 */
async function yieldToRunner(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

describe('the set of functions that floor a live quantity to zero', () => {
  it('is exactly the registered set, over an assembled reference universe', async () => {
    const content = referenceContent();
    const simulation = defineWorldSimulation(content.deps);
    const recorder = new AnnihilationRecorder();

    await recorder.record(async () => {
      let state = buildReferenceState({
        runSeed: LONG_RUN_SEED,
        options: LONG_RUN_OPTIONS,
        content,
        schema: simulation.schema,
      });
      for (let tick = 0; tick < TICKS; tick += 1) {
        recorder.atTick(tick);
        state = step(state, [], rngFromRootSeed(state.rootSeed));
        // Once a world year, as every other long arm does.
        if (tick % 12 === 11) await yieldToRunner();
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
    // A timeout rather than the suite default, and the number is a measurement.
    // The sentinel wraps every `floorDiv` in the rules path, so its cost tracks
    // the amount of arithmetic a tick does — and enabling all seventy cells took
    // the research frontier from 51 nodes to 300. Measured on this build, 240
    // recorded ticks of the reference universe:
    //
    //     historic twelve    1.8 s
    //     all seventy       31.7 s
    //
    // Uninstrumented the same runs are 1.1 s and 2.2 s, so the widening costs 2x
    // and the *instrument* costs the other 9x. 180 s leaves room for a loaded
    // machine without leaving room for a regression: if this arm needs more, the
    // frontier scan is doing something new and that is the thing to look at.
    //
    // 180 s was the first budget and it was not enough: the same arm takes 234 s
    // inside a full `npm run verify`, where every other worker is competing for
    // the same cores. 600 s was four times the standalone cost and two and a
    // half times the contended one.
    //
    // 600 s was not enough either — on GitHub Actions, 2026-08-17, job
    // 95387839967, where it was cut at exactly its budget. The arm costs 320 s
    // inside a full `npm run verify` on this box; seven times that, rounded up,
    // is the number below. See `vitest.config.ts` for where the seven comes
    // from.
  }, 2_400_000);

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
