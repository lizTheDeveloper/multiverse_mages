/*
 * Multiverse Mages — two hundred world years of a universe nobody plays, and
 * the six claims 0.4.0 makes about it.
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
 * `mages-and-species` task group 9. **Existence and boundedness claims only** —
 * `release-plan.md` forbids a balance claim before 0.5.0, every magnitude in
 * the shipped content is marked `untuned`, and nothing here is evidence that
 * any of them is *right*.
 *
 * ## Three of the group's assertions are not made, and that is the finding
 *
 * A checked box that is false is worse than an unmet promise recorded. Tasks
 * 9.5, 9.8 and 9.9 are each measured below and each reported rather than
 * asserted, because the universe does not do what they assume:
 *
 * - **9.5 — "research, teaching and scribing each occur within every recorded
 *   window."** Research does, in all ten windows. **Teaching stops after world
 *   year twenty** and **scribing after world year sixty**, and both stop for
 *   reasons the build already knows about: a researched instance is created at
 *   `fp(256)` and the teach threshold is `fp(512)`, so only founding grants are
 *   ever teachable and they are taught out; and the materials stock empties, so
 *   no scribe can pay for a book. See {@link activityIn} in the table this file
 *   prints.
 * - **9.8 — "the rolling growth rate of total effective capital contribution is
 *   non-increasing."** It is, and vacuously: the series is `fp(32)` from world
 *   year one to world year two hundred. Library depth reaches two distinct
 *   nodes and stops, because the scribable list is ordered by cost and every
 *   scribe copies the same cheap node — 1,263 books, two nodes. A derivative
 *   that is zero for 199 years is not a diminishing return; asserting
 *   non-increase over it would be the same vacuous pass task 9.4 used to be.
 * - **9.9 — "at least four species differ by more than the observed cross-seed
 *   spread."** Three do. `reference-time-to-tier.test.ts` has the numbers.
 *
 * **This bullet list is a historical record, not the current measurement**,
 * and is kept rather than rewritten for the reason this repo amends findings
 * instead of deleting them. 9.5 has moved three times since it was written and
 * 9.8 twice — 9.5's teaching half was fixed by wiring the `acquire` hook, and
 * its scribing half now survives the whole run once `w29` split the
 * materials stock into `food`/`stone`/`vellum`; 9.8's capital curve, fixed by
 * `w7/knowledge-capital`, no longer falls back within two centuries for the
 * same reason. The tests below assert the current measurement; this list
 * documents what was true when task group 9 was first driven through.
 *
 * 9.5's third move is the only one so far that **withdrew** an assertion
 * rather than replacing it with a truer one, and it is worth reading as its
 * own kind of event. "A lesson is taught in every one of the ten windows" was
 * green for two changes and was never a property of the build: three of five
 * run seeds violate it on the `main` it was green on. It measured a wave at
 * one phase. The test below has the seeds, the supply counts, and the three
 * explanations they rule out.
 *
 * ## What the run costs, and why it is not shortened
 *
 * Two full runs of 2,400 ticks, because task 9.6 compares two executions and a
 * hash equality over a prefix is not the claim. A world tick is a month
 * (`contracts.md` §0), and the shipped species are slow: a draconic matures at
 * 3,600 months, so **no draconic is promoted at any point in this run** and the
 * species is carried for two centuries by its founders. A cheaper horizon is a
 * horizon in which most of the six species have not yet done anything.
 */

import {
  LONG_RUN_OPTIONS,
  LONG_RUN_TICKS,
  TICKS_PER_WORLD_YEAR,
  activityIn,
  longRunLines,
  longestOccupationAlternation,
  runLongReference,
  windowsOf,
} from '@mm/scenario';
import type { LongRunResult } from '@mm/scenario';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Long enough for two hundred world years on a busy machine.
 *
 * One such run costs 86 s here (the 9.6 case runs two, at 171.5 s, under load
 * 20-50); the same hook was cut at 300 s on GitHub Actions job 95387839967 on
 * 2026-08-17, which is the >3.5x ratio `vitest.config.ts` derives its factor
 * from. Seven times the two-run case, rounded up.
 */
const LONG_RUN_TIMEOUT_MS = 1_200_000;

/**
 * The bound `maxCarryingCapacity` gives the shipped `territory.json`.
 *
 * Restated here as a literal on purpose. The assertion below compares against
 * the computed bound, so it cannot drift; this constant is what task 9.4 names
 * in prose, and if content changes the two disagree and this file says so.
 */
const DOCUMENTED_POPULATION_BOUND = 109_800;

/**
 * Windows the activity claims are read over: ten windows of twenty world years.
 *
 * Twenty, because that is the horizon `balance-gate-horizon.sweep.json` already
 * runs and the two instruments should share a timebase. Ten windows is enough
 * that "in every window" is a claim about the whole run rather than about its
 * beginning and its end.
 */
const WINDOW_YEARS = 20;

/**
 * The streak length at which a two-tick occupation alternation counts as
 * *sustained*: one world year.
 *
 * A single alternating tick is a rate-limited controller moving one person out
 * and one person back, which it is entitled to do. Twelve consecutive
 * alternating ticks is a controller oscillating against its own demand signal
 * for a year, which is the failure task 9.7 is about.
 */
const SUSTAINED_ALTERNATION_TICKS = TICKS_PER_WORLD_YEAR;

let run: LongRunResult;

beforeAll(async () => {
  run = await runLongReference();
}, LONG_RUN_TIMEOUT_MS);

describe('two hundred world years of the reference universe', () => {
  it('prints what every assertion below was taken over', () => {
    // Printed, not only asserted, for the reason `reference-universe.test.ts`
    // prints its census: a green suite over a universe that sits still is worth
    // nothing, and the only way a reader can tell is to see the numbers.
    for (const line of longRunLines(run, WINDOW_YEARS)) console.log(line);
    for (const window of windowsOf(run, WINDOW_YEARS)) {
      const activity = activityIn(window);
      console.log(
        `ticks ${String(window.fromTick).padStart(4)}-${String(window.toTick).padStart(4)}` +
          `  research ${String(activity.researchCompleted).padStart(5)}` +
          `  taught ${String(activity.lessonsTaught).padStart(4)}` +
          `  scribed ${String(activity.grimoiresScribed).padStart(4)}` +
          `  births ${String(activity.births).padStart(5)}` +
          `  deaths ${String(activity.populaceDeaths).padStart(5)}`,
      );
    }
    expect(run.ticks).toHaveLength(LONG_RUN_TICKS);
  });

  it('9.3 — loses no species, at any tick, in two centuries', () => {
    // Every tick rather than every checkpoint. Extinction is an absorbing state
    // (`deliverBirths` synthesises no founding population), so a species that
    // touched zero between two checkpoints would still read as extinct at the
    // next one — but a species that touched zero and was refilled by a
    // mechanism nobody sanctioned would not, and that is the failure a
    // checkpoint-only assertion cannot see.
    const floor = run.founding.populationBySpecies.map(() => Number.POSITIVE_INFINITY);
    for (const tick of run.ticks) {
      tick.populationBySpecies.forEach((count, species) => {
        floor[species] = Math.min(floor[species] ?? 0, count);
      });
    }
    console.log(`9.3 minimum population per species over the run: ${floor.join(' / ')}`);
    for (const [species, minimum] of floor.entries()) {
      expect(minimum, `species ${String(species + 1)} reached ${String(minimum)}`).toBeGreaterThan(
        0,
      );
    }
  });

  it('9.4 — stays under the documented bound, and under the K it is actually held by', () => {
    // **The bound is asserted against `maxCarryingCapacity`, not against `K`.**
    // The `economy` spec's "population never exceeds K" passed vacuously for as
    // long as K was a function of the materials the population produced: K
    // outran P forever and the requirement was never tested. K now comes from
    // territory, which nothing in a run creates, so it has a ceiling that names
    // content and nothing else.
    expect(run.populationBound).toBe(DOCUMENTED_POPULATION_BOUND);
    expect(run.peakPopulation).toBeLessThanOrEqual(run.populationBound);

    // The tighter statement, and the one that is no longer vacuous. K falls
    // through this run — 57,473 at year twenty to 29,831 at year two hundred —
    // because the subsistence shortfall now reaches `carryingCapacity`, while
    // the population rises from 216 to its peak. The gap closes from a factor
    // of 264 to a factor of 1.6, so "P never exceeds K" is being asked a real
    // question at the end of the run in a way it was not at the start.
    for (const tick of run.ticks) {
      expect(
        tick.population,
        `population ${String(tick.population)} exceeded K ${String(
          tick.report.carryingCapacity,
        )} at tick ${String(tick.worldTick)}`,
      ).toBeLessThanOrEqual(tick.report.carryingCapacity);
    }

    const last = run.ticks[run.ticks.length - 1];
    console.log(
      `9.4 observed peak population ${String(run.peakPopulation)} against the documented bound ` +
        `${String(run.populationBound)} (${(
          (run.peakPopulation / run.populationBound) *
          100
        ).toFixed(1)}% of it) and against a final K of ${String(
          last?.report.carryingCapacity ?? 0,
        )}.`,
    );
    // Recorded rather than asserted: the bound is not tight, and a reader who
    // sees only "under 109,800" would take the brake for the thing holding the
    // population down. It is not. What holds it down is a universe that cannot
    // feed itself from world year seventy onward.
  });

  it('9.5 — learns more than it was given, and research never stops', () => {
    // The half of task 9.5 that holds.
    expect(run.founding.nodesKnown).toBeGreaterThan(0);
    const last = run.ticks[run.ticks.length - 1];
    expect(last?.nodesKnown ?? 0).toBeGreaterThan(run.founding.nodesKnown);

    for (const window of windowsOf(run, WINDOW_YEARS)) {
      const activity = activityIn(window);
      expect(
        activity.researchCompleted,
        `no research completed in ticks ${String(window.fromTick)}-${String(window.toTick)}`,
      ).toBeGreaterThan(0);
    }
  });

  it('9.5 — teaching comes in waves and never dies out, and scribing survives the run', () => {
    // This tripwire has fired three times now and been rewritten each time,
    // which is what a tripwire is for. The third rewrite is the one that took
    // a claim *out* rather than moving it: see below.
    //
    // It first asserted that teaching happened in the first window and *never
    // again* — because nothing a mage researched for herself cleared the
    // `fp(512)` teach threshold, so only the founding grants were ever
    // teachable and they were taught out inside twenty years. The cause was
    // not the threshold: `applyAcquire` was called from tests and from
    // nowhere else, so a tradition's `initialMastery` never reached a created
    // instance and every mage finished her research at the placeholder
    // `fp(256)`. Wiring the hook into the real acquisition path fixed the
    // deadlock as a side effect.
    //
    // It then asserted teaching sustains but **scribing still dies of the
    // economy** — books cost materials and the single stock emptied from
    // roughly world year seventy, so the last window scribed zero. `w29`
    // differentiated that one stock into `food`, `stone` and `vellum`
    // (`kinds.ts`), and scribing spends only `vellum`, which no longer
    // competes with subsistence's `food`. Measured over this run: the stock
    // that used to starve every claimant at once now starves only the
    // claimant paid from the kind that actually ran out, and vellum did not.
    // The final window now scribes **5** books, not 0.
    const windows = windowsOf(run, WINDOW_YEARS).map((window) => activityIn(window));
    const taught = windows.map((activity) => activity.lessonsTaught);
    const scribed = windows.map((activity) => activity.grimoiresScribed);
    console.log(`9.5 lessons taught per 20-year window: ${taught.join(' / ')}`);
    console.log(`9.5 books scribed per 20-year window:  ${scribed.join(' / ')}`);

    //
    // **W21's side of this conflict is not merged, and the reason is on the
    // record above.** It restores the per-window form — `for (const [index,
    // lessons] of taught.slice(0, 8))`, every window must teach — which is
    // exactly the assertion `main` retired after measuring five run seeds and
    // finding three with an empty window. W21 predates that measurement; taking
    // its hunk would re-assert a claim about one seed as a claim about the
    // build.
    // **The per-window form of this assertion has been retired, and not
    // because this branch could not satisfy it.** It read "a lesson is taught
    // in every one of the ten windows" and it was never a property of the
    // build — only of `LONG_RUN_SEED`. Measured on `main`, where it is green,
    // across five run seeds (lessons per 20-year window):
    //
    //     589825  446 337  34 112 113  16  51 588 323 124
    //     597744  418 177  75  27  88  13   0  10   1   0
    //     605663  329 398 124  56  45   0   7 157 285 340
    //     613582  342 209 110  73  32   0   0   3  59 132
    //     621501  304 173 110  78  28 126 198 271 268  22
    //
    // Three of the five have an empty window. The committed seed does not, so
    // a claim about the *universe* was riding on a coincidence about one run.
    // On this tree the same five seeds also give three with an empty window —
    // the identical rate — and the committed one moves its empty window inside
    // the horizon, which is the whole of the difference this merge made.
    //
    // What actually drives it is supply, and it is a wave rather than a level.
    // `seek-teaching` is feasible only while `teachableToMe` is non-empty: a
    // node some living colleague holds at mastery ≥ `fp(512)` that this mage
    // does not hold and her species' depth ceiling admits. Counted over every
    // mage-evaluation in each window, mean entries per evaluation:
    //
    //     this tree  3.22 2.46 1.46 0.81 0.34 0.25 0.67 0.88 0.47 0.00
    //     main       3.22 2.77 1.17 0.90 0.45 0.09 0.16 0.98 0.80 0.52
    //
    // Both oscillate; a trough is knowledge having finished diffusing and not
    // yet having been replaced by anything new. `main`'s trough is window 5,
    // this tree's is window 9, and the horizon ends in the middle of it. Run
    // the same seed 100 years further and teaching resumes — 131 / 105 / 47
    // over windows 10 to 12.
    //
    // Three explanations are ruled out rather than left open, because the
    // interesting failure would be any of them:
    //
    // - **Not the economy.** 261 research projects complete in the same empty
    //   window. Nothing here is short of materials.
    // - **Not crowd-out.** In that window `teachableToMe` is empty on *all*
    //   21,471 mage-evaluations, so `seek-teaching` is masked infeasible
    //   rather than out-scored. The same count on `main` is 7,610 non-empty.
    // - **Not the mastery threshold.** `fp(512)` is unchanged, and the wave
    //   crosses it nine windows out of ten.
    //
    // One finding is left standing and unfixed, recorded here because it is
    // real and is *not* what stops teaching: `affiliate` holds 76 of 90 mages
    // by world year 200, growing from a third of them at year 20. It does the
    // same on `main` (69 of 83), where teaching continues — so it is a goal
    // monoculture worth its own change, not the cause of this. `teach` itself
    // is feasible on 2,628 evaluations in the empty window and chosen on none;
    // over two centuries no mage ever selects it, and every lesson in this run
    // happens because a student went looking. Both belong to `mage-autonomy`,
    // and retuning either from here would be tuning against one seed again.
    //
    // So what is asserted is what the tripwire was built for and what survives
    // every seed measured on both trees: teaching starts, and it is not
    // confined to the founding-grant era. The original failure — lessons in
    // window zero and never again, because only the founding grants ever
    // cleared the threshold — fails this exactly as loudly as it failed the
    // per-window form. The series itself is printed above, and a reader who
    // wants to know whether the wave is healthy should read it rather than
    // trust a boolean.
    expect(taught[0] ?? 0, 'no lesson taught in the first 20-year window').toBeGreaterThan(0);
    const secondHalf = taught.slice(5).reduce((total, lessons) => total + lessons, 0);
    expect(
      secondHalf,
      'no lesson taught in the whole second century — teaching has died out, which is the ' +
        'dead-`acquire`-hook shape this tripwire exists to catch',
    ).toBeGreaterThan(0);

    // And teaching is the *normal* state rather than a couple of accidents:
    // more than half the windows are non-empty. A majority rather than a
    // count near the data — the ten runs measured above hold 8, 9 or 10
    // non-empty windows, on both trees and every seed, so six is a structural
    // claim with room in it rather than a threshold fitted to what was
    // observed. Without it the two assertions above would be satisfied by
    // teaching in window zero and once more in window seven, which is closer
    // to the failure than to the behaviour.
    const windowsWithTeaching = taught.filter((lessons) => lessons > 0).length;
    expect(
      windowsWithTeaching,
      `teaching happened in only ${String(windowsWithTeaching)} of ` +
        `${String(taught.length)} windows: ${taught.join(' / ')}`,
    ).toBeGreaterThan(taught.length / 2);

    // Scribing dips hard in the middle of the run — the food-driven population
    // collapse still starves the *populace* that would otherwise staff a
    // scriptorium, and windows five and six (world years 80-120) scribe
    // nothing — but it is not the permanent, one-way death the single-stock
    // economy produced. Asserted as a tripwire in the direction that now
    // holds: the last window is not zero. A future change that drives vellum
    // to zero for good should fail this loudly rather than have the suite
    // quietly keep asserting the old "dies forever" shape.
    expect(scribed[0] ?? 0).toBeGreaterThan(0);
    expect(
      scribed[scribed.length - 1] ?? 0,
      'scribing died of the economy again — vellum ran out, not just food',
    ).toBeGreaterThan(0);
  });

  it('9.7 — shows no sustained two-tick alternation in the occupation mix', () => {
    const longest = longestOccupationAlternation(run);
    console.log(`9.7 longest two-tick occupation alternation: ${String(longest)} ticks`);
    expect(longest).toBeLessThan(SUSTAINED_ALTERNATION_TICKS);
  });

  it('9.8 — has a capital curve at last, and under the differentiated economy it no longer falls back', () => {
    // **This box was open twice, and both tripwires under it have fired.**
    // Task 9.8 first read *"true and vacuous, so not asserted: total effective
    // capital contribution is `fp(32)` from world year one to world year two
    // hundred, because library depth reaches two distinct nodes and stops …
    // 1,263 books, two nodes"*, and `w7/knowledge-capital` fixed that: the
    // library's depth reaches `research-rate`, `teach-rate` and `scribe-rate`
    // through the shared accumulator, upkeep is charged, and the scribable
    // list prefers a node the shelf does not already hold — so the series
    // became a real curve, and it fell late in the run once the single
    // materials stock ran dry.
    //
    // `w29` differentiated that stock into `food`, `stone` and `vellum`
    // (`kinds.ts`), and library upkeep and scribing are paid from `vellum`
    // alone (`materials.ts`'s `CLAIMANT_KIND`) — a claimant that no longer
    // competes with subsistence's `food`. Measured over this run: the fall is
    // **gone**. `libraryDepth` and `capitalContribution` are non-decreasing
    // across every one of the 2,400 ticks — the run's peak *is* its final
    // value on both series, exactly — even though `food` still collapses `K`
    // and the population from world year seventy on. Brake 4
    // (`applyLibraryUpkeep`) has not net-degraded the shelf even once in two
    // centuries, because `vellum` never actually runs out here.
    //
    // *Re-measured 2026-08-17 on `integration/all-branches`: peak `fp(404)` at
    // depth 53, where this paragraph was written at `fp(384)` and depth 48. The
    // shape held and the magnitudes moved with the open grid; the assertions
    // below are all taken against the run's own series rather than against
    // either pair of literals.*
    //
    // This is the honest replacement for the old "rises, peaks and falls
    // back" claim, not a loosened version of it: that claim is now false, and
    // asserting it (even loosely) would be the same "checked box that is
    // false" this file's own module note warns against. What is asserted
    // instead is the property this run actually has — monotonic non-decrease
    // — as a tripwire in the *other* direction: the day some future change
    // makes `vellum` scarce enough to force a shed-back again, this fails,
    // and that is the signal to come back and decide whether the fall-back
    // claim should return.
    const distinct = [...new Set(run.ticks.map((tick) => tick.capitalContribution))];
    const depths = [...new Set(run.ticks.map((tick) => tick.libraryDepth))];
    const last = run.ticks[run.ticks.length - 1];
    const peak = run.ticks.reduce((best, tick) => Math.max(best, tick.capitalContribution), 0);
    console.log(
      `9.8 total effective capital contribution took the values [${distinct.join(', ')}] fp over ` +
        `the whole run, from library depths [${depths.join(', ')}] distinct nodes, against ` +
        `${String(last?.grimoires ?? 0)} books standing at the end.`,
    );

    // It is a curve rather than a constant. That is the claim the box asked for
    // and could not make.
    expect(distinct.length).toBeGreaterThan(2);
    expect(peak).toBeGreaterThan(0);

    // ## The tripwire fired, and W23 is the somebody it was set to bring back
    //
    // It read `grimoires < 2 * libraryDepth` and on this tree it reads **2,746
    // books against 51 nodes**. **Its stated reason does not survive the
    // measurement.**
    //
    // *Re-measured on the merged tree (W23 + `main`), 2026-08-14, at
    // `LONG_RUN_SEED`.* W23 recorded 3,350 books here against the same 51
    // nodes, on its own branch and before `apply-magic` and the differentiated
    // economy. The numerator moved and the claim below did not, which is the
    // point of asserting an equality against the run's own `nodesKnown` rather
    // than a ratio against a literal: the ratio would have had to be rewritten
    // for a third time and this did not move at all.
    // The comment argued the ratio would stay near one because *"a scribe
    // prefers something the library lacks and upkeep charges her for every
    // duplicate"* — so a ratio of 65 would mean the preference had stopped
    // biting. Ablating W23's laborer materials-coverage term and rerunning at
    // these coordinates says otherwise:
    //
    //     books standing at the end   before 15      after 3,350
    //     library depth reached       before 36      after 51 — every node known
    //     books scribed, last window  before  0      after 480
    //
    // That ablation is W23's, on W23's tree, and is left as it was recorded.
    // The merged tree reaches the same place by the same route: 51 of 51 nodes
    // shelved, 2,746 books standing, 480 scribed in the last 20-year window,
    // and 597 instances degraded off unpaid shelves over the run — so
    // destruction is live here too, which the assertion below this one checks.
    //
    // The preference was not biting *harder* before. It had nothing to bite
    // with: the stock emptied around world year seventy, scribing became
    // infeasible, and the fifteen books standing at the end were the residue of
    // a shelf that had been degraded to nothing. The old bound was satisfied by
    // **a library that had stopped existing**, which is the same trap the
    // campaign's D5 was rewritten to escape.
    //
    // What replaces it is the claim the old bound was reaching for and could
    // not make: the shelf holds **everything the universe knows**. That is the
    // preference biting all the way to full coverage, and it is strictly
    // stronger than a ratio — a ratio near one is also what an empty library
    // reports. Compared against the run's own `nodesKnown` rather than a
    // literal, so that widening the ruleset does not silently weaken it.
    //
    // ## Re-authored 2026-08-17, `integration/all-branches`: the coverage
    // equality is withdrawn and the curve itself is asserted
    //
    // **What it measured before.** `libraryDepth === nodesKnown` — the shelf
    // holds *everything* the universe knows. W23 wrote that when the two
    // coincided at 51, because the twelve enabled v1 cells were all there was to
    // know, and it is a strong claim only while that is true.
    //
    // **Which decision voided it.** This campaign flagged all seventy grid cells
    // `v1`. At the end of this run `nodesKnown` is **227** where W23 measured 51,
    // and `libraryDepth` is **53** where W23 measured 51. The shelf did not
    // shrink — it grew, and so did the pile, 2,746 books -> **3,530**. The
    // equality broke because its right-hand side went up 4.5x, and a claim about
    // a universe with 51 things in it is not a claim about one with 227.
    //
    // **What it measures now.** The property task 9.8 actually asked for: that
    // total effective capital contribution is *a curve*, and that under the
    // differentiated economy it does not fall back — measured across the whole
    // run rather than at its end, which is the only form in which "does not fall
    // back" is checkable at all.
    //
    // **Measured on this tree at `LONG_RUN_SEED` over 2,400 ticks:**
    //
    // | | founding | final | peak |
    // |---|--:|--:|--:|
    // | `capitalContribution` | 0 | **404 fp** | 404 fp |
    // | `libraryDepth` | 0 | **53** | 53 |
    // | `nodesKnown` | 6 | 227 | **230** |
    //
    // Neither of the first two falls at **any** of the 2,399 tick boundaries, so
    // peak and final coincide by construction rather than by luck. `nodesKnown`
    // is the control that keeps that from being vacuous: it *does* fall back,
    // 230 -> 227, so the run being reported is not one in which nothing is ever
    // lost. What the pair says is that **minds forget and shelves do not** —
    // which is exactly `degradeLibrary`'s authored order, and the destruction
    // assertion at the bottom of this case argues the same point from the other
    // side. Depth is the *last* thing that brake touches, so its non-decrease is
    // a claim that the shelf was never degraded past its last copy of a title in
    // two centuries, and not a claim that nothing was destroyed: **733**
    // instances were, measured on this tree by the same case's brake-4 line
    // below. (The 597 an earlier revision of this comment carried was taken
    // before the grid opened.)
    //
    // ## And the shelf stops growing, which is what the equality was hiding
    //
    // Depth reaches 40 by tick **91** and 53 by tick **1,705** — thirteen further
    // titles across the intervening twenty-three centuries of month-ticks. Growth
    // over the last fifth of the run is **0** against **40** over the first
    // fifth. The curve is monotone and flattening, and the gap to `nodesKnown`
    // widens for the rest of the run.
    //
    // What bounds it is `CONSUMPTION_ORDER`, working exactly as authored:
    // `libraryUpkeep` is paid at position 4 and `scribing` at 5, and the upkeep
    // bill scales with the pile. Measured per twenty-year window rather than
    // inferred from the depth series:
    //
    // | window (ticks) | 1-240 | 481-720 | 961-1200 | 1441-1680 | 2161-2400 |
    // |---|--:|--:|--:|--:|--:|
    // | `libraryUpkeep` owed, fp | 215,690 | 114,234 | 186,798 | 589,850 | **1,579,364** |
    // | vellum faucet, fp | 163,049 | 138,907 | 390,576 | 1,278,583 | 2,117,968 |
    // | owed as % of faucet | 132% | 82% | 48% | 46% | **75%** |
    // | `libraryDepth` at window end | 40 | 51 | 51 | 52 | 53 |
    //
    // At the final tick upkeep owes **7,056 fp of an 8,931 fp faucet — 79%** —
    // leaving under two grimoires a month. That is a negative feedback loop
    // between shelf size and shelf growth, and it is asserted below as its own
    // measured figure rather than left as an inference from a flat series.
    //
    // ### The `scribing` shortfall is zero, and that zero has a positive control
    //
    // Scribing is throttled by affordability *before* the priority walk, so it
    // never asks for what is not there and its claimant row cannot show the
    // pressure: `scribing` owed == paid == 4,365,312 fp, shortfall **0** summed
    // over all 2,400 ticks. The same reader on the same field reports
    // `libraryUpkeep` short by **42,643 fp** and `shortKinds.vellum` true on
    // **389 of 2,400 ticks**, so the probe works and the zero is a fact about
    // scribing rather than a dead field.
    //
    // ### What would bring the coverage claim back
    //
    // Either the vellum faucet scales with what there is to know, or upkeep stops
    // scaling linearly with the pile. Both are content or rules decisions and
    // neither is a test edit. Until one is taken, the honest statement is the one
    // asserted here: the shelf covers *part* of what the universe knows, that
    // part is shrinking as a fraction, and the capital curve built on it still
    // does not fall back.
    const fallsIn = (series: readonly number[]): number => {
      let falls = 0;
      for (let index = 1; index < series.length; index += 1) {
        if ((series[index] ?? 0) < (series[index - 1] ?? 0)) falls += 1;
      }
      return falls;
    };
    const capitalSeries = run.ticks.map((tick) => tick.capitalContribution);
    const depthSeries = run.ticks.map((tick) => tick.libraryDepth);
    const knownSeries = run.ticks.map((tick) => tick.nodesKnown);
    const fifth = Math.floor(run.ticks.length / 5);
    const depthAt = (index: number): number => run.ticks[index]?.libraryDepth ?? 0;
    const firstFifthGrowth = depthAt(fifth - 1) - run.founding.libraryDepth;
    const lastFifthGrowth = depthAt(run.ticks.length - 1) - depthAt(run.ticks.length - fifth - 1);
    const upkeepOwedLast = last?.report.libraryUpkeepOwed ?? 0;
    const vellumFaucetLast = last?.report.faucetByKind.vellum ?? 0;
    console.log(
      `9.8 the curve does not fall back: ${String(fallsIn(capitalSeries))} decreases in ` +
        `capitalContribution and ${String(fallsIn(depthSeries))} in libraryDepth over ` +
        `${String(run.ticks.length)} ticks, against ${String(fallsIn(knownSeries))} in nodesKnown. ` +
        `Depth grew ${String(firstFifthGrowth)} over the first fifth and ` +
        `${String(lastFifthGrowth)} over the last, ending at ${String(last?.libraryDepth ?? 0)} ` +
        `against ${String(last?.nodesKnown ?? 0)} nodes known. Final-tick libraryUpkeep owes ` +
        `${String(upkeepOwedLast)} fp of a ${String(vellumFaucetLast)} fp vellum faucet.`,
    );

    // The curve, over the whole run and not at its end. `nodesKnown` is the
    // positive control for the counter: an instrument that reports "no decreases"
    // on every series it is handed is reporting nothing.
    expect(fallsIn(capitalSeries)).toBe(0);
    expect(fallsIn(depthSeries)).toBe(0);
    expect(fallsIn(knownSeries)).toBeGreaterThan(0);

    // It grew, and it stopped growing. Both halves, because either alone is
    // satisfied by a shelf that never existed.
    expect(last?.libraryDepth ?? 0).toBeGreaterThan(run.founding.libraryDepth);
    expect(lastFifthGrowth).toBeLessThan(firstFifthGrowth);

    // The coverage gap, asserted in the direction it was measured, as the mirror
    // of the tripwire the equality used to be: if a later change funds the shelf
    // well enough to catch up with what the universe knows, this fails, and that
    // is the signal to restore W23's equality rather than to widen this.
    expect(last?.libraryDepth ?? 0).toBeLessThan(last?.nodesKnown ?? 0);

    // The upkeep pressure that explains the flattening, as its own figure. A
    // majority of every sheet of vellum the universe makes goes to keeping the
    // books it already has; 79% at the final tick, asserted as "more than half"
    // so that a tuning pass has room to move it without silently repealing the
    // mechanism.
    expect(upkeepOwedLast * 2).toBeGreaterThan(vellumFaucetLast);
    //
    // ## The books-to-depth ratio is withdrawn — and so, now, is the equality
    //
    // *Heading corrected 2026-08-17: this section was written as "the coverage
    // equality stays", and the block above withdraws it. The ruling below about
    // the **ratio** is unaffected — it was never an argument for the equality,
    // only against a bound over duplication — so it is left standing as it was
    // decided.*
    //
    // Three branches reached this line with three different answers and the
    // Group F merge, 2026-08-16, had to rule between them. `main` replaced the
    // ratio with the coverage equality above, on the ground that *a ratio near
    // one is also what an empty library reports*. `w78/teaching-boundary`
    // widened the ratio to `6 x`, then this group re-measured it to `8 x` on the
    // w78 tree. `w53/practice` withdrew it outright, and gave the strongest
    // reason of the three: books-per-node averages **10.9 across 32 seeds** with
    // depth running 3 to 45, so the ratio is not a trend and no bound over it is
    // a claim anybody has established. Two of the three sides therefore agree
    // the ratio is a bad instrument, and the `8 x` this group measured two rows
    // ago is a fourth number for a quantity that should not have a bound at all.
    //
    // So: the ratio is withdrawn and the number is printed instead. The
    // equality was kept at that ruling and is withdrawn in its turn by the block
    // above, for a different reason — the open grid, not the instrument. What
    // survives from `w78` is its finding, recorded below and no longer asserted.
    //
    // ### Recorded, not asserted: what `w78` measured
    //
    // ## Both claims are kept, because they are two claims and not one
    //
    // `main` replaced the duplication ratio with the coverage equality above,
    // giving the reason: a ratio near one is also what an *empty* library
    // reports, so the ratio alone could be satisfied by a shelf that had been
    // degraded out of existence. `w78/teaching-boundary` did not see that
    // decision and widened the ratio instead. Resolved on the Group F merge,
    // 2026-08-16, by keeping both: the equality is the coverage claim and the
    // ratio is the duplication claim, and neither implies the other. Both were
    // re-measured on this tree rather than inherited — see below. *(The coverage
    // half of that ruling is superseded 2026-08-17; the reasoning about why the
    // two are distinct claims is why the block above replaces the equality with
    // a coverage **gap** rather than dropping coverage altogether.)*
    // **The two effects compound, and the merged tree is the first one holding
    // both.** `w78/teaching-boundary` measured this same ratio independently and
    // widened it to `6 ×` for its own reason: teaching stops at the institution,
    // only six of ninety mages are ever affiliated, and they collectively know
    // less, so the shelf holds fewer *distinct* nodes. That is the same
    // denominator `apply-magic` cuts, by a different mechanism. Neither number
    // below is a claim about a tree holding both:
    //
    // | tree | books | distinct nodes | ratio | bound it carried |
    // |---|--:|--:|--:|---|
    // | after `vellum` decoupled from food | 157 | 48 | 3.3 | `< 4 ×` |
    // | `main`, after `apply-magic` | 186 | 43 | 4.33 | `< 5 ×` |
    // | `w78`, after the teaching boundary | 154 | 36 | 4.3 | `< 6 ×` |
    // | **both, this tree** | **164** | **25** | **6.56** | `< 8 ×` |
    //
    // Re-measured from the merged tree rather than taken from either side —
    // `5 ×` and `6 ×` are both bounds this tree fails, and taking the tighter of
    // two numbers neither side measured here is how a merge silently pins a
    // value the build cannot hold. The numerator barely moved; the denominator
    // fell 43 → 25 because both mechanisms take distinct nodes off the shelf.
    //
    // Widened to 8, which fits 6.56 with headroom and is still under the "ten
    // would mean it is gone" ceiling the original comment named — but 6.56 is
    // the closest this ratio has ever come to it. **If this fails again, do not
    // widen it a fourth time without naming which mechanism moved which half.**
    // **The books-to-depth bound is withdrawn, and this is the third time this
    // task has withdrawn an assertion rather than loosening one.**
    //
    // Its history: close to one book per node under the single-stock economy;
    // 157 books against 48 distinct nodes — roughly 3.3 — once `w29` decoupled
    // `vellum` from `food`, with a bound of `4 x depth` written to fit that
    // *"with headroom, not doubled reflexively"*, and a comment observing it
    // was *"nowhere near the 'ten would mean it is gone' ceiling"*.
    //
    // W53 measured here: **159 books against 17 distinct nodes, roughly 9.4** —
    // at the ceiling that comment named, from the other side. The count holds
    // while the *breadth* collapses.
    //
    // **The first draft of this comment named the wrong cause, and the
    // correction is worth more than the number.** It said the `resource-yield`
    // practitioner gate did it: *"an economy that only pays out while somebody
    // is casting produces less `vellum`, and less `vellum` is fewer books."*
    // Ablating that gate — the ungated instance list to the second
    // `gatherEffects` call, i.e. `main`'s behaviour exactly — changes `stone`
    // and **nothing else**: food, vellum, population, carrying capacity and the
    // per-species mage table are bit-identical over 1,200 ticks. Every
    // `resource-yield` node in this content set routes to `stone`, so the gate
    // never fed vellum and cannot have starved it.
    //
    // What did it is the **practice goal taking the month** from research and
    // rediscovery, the only two operations that add a *distinct* node. Against a
    // practice-free control on 32 paired seeds: depth −6.31 (t = −2.96) at an
    // unchanged book count. Both halves of the fix are in
    // `docs/design/practice-results.md`.
    //
    // And 3.3 was itself one seed: main-equivalent books-per-node averages 10.9
    // across 32 seeds at this horizon, with depth running 3 to 45. This ratio is
    // not a trend and this bound is not coming back on one run's evidence.
    //
    // Widening the bound to `10 x depth` would make it pass and would assert
    // that 9.4 is fine, which is exactly the claim nobody has established. So
    // the number is printed and the bound is gone, in the same spirit the
    // module note applies to 9.5 and 9.9: *"a checked box that is false is
    // worse than an unmet promise recorded."* What is asserted instead is
    // non-vacuity — the library has *some* breadth and *some* books — and the
    // ratio is left to the writeup, where W53 records it as the cost of the
    // gate rather than as a passing test.
    console.log(
      `9.8 books-to-depth: ${String(last?.grimoires ?? 0)} books against ` +
        `${String(last?.libraryDepth ?? 0)} distinct nodes — ` +
        `${((last?.grimoires ?? 0) / Math.max(last?.libraryDepth ?? 1, 1)).toFixed(1)} per node. ` +
        'Was 3.3 before the practice gate. NOT ASSERTED; see the comment.',
    );
    expect(last?.libraryDepth ?? 0).toBeGreaterThan(0);
    expect(last?.grimoires ?? 0).toBeGreaterThan(0);

    // ## Destruction is still live, which is the other half and the harder one
    //
    // W23's brief was explicit that a written record which *cannot be lost* is
    // as broken as one that cannot persist — `degradeLibrary` is the only
    // non-raid destruction channel in the build. So brake 4 must still bind,
    // and `mages-and-species/design.md`'s *"beyond some depth the marginal
    // shelf costs more than it returns"* must still be true.
    //
    // The old assertion said so by requiring the curve to end **below** its
    // peak — but that encoded the collapse itself, and a library that recovers
    // is indistinguishable from one that never grew under it.
    //
    // Asserted off the loop's own count of what it destroyed rather than off a
    // dip in a series. `libraryDepth` **cannot** fall while duplicates exist:
    // `degradeLibrary` sheds every second copy before it touches a last one, so
    // depth is the last thing to move and a depth series would report a
    // perfectly healthy shelf right up until the archive was gone. Reading the
    // brake's own emission is both stronger and honest about what it measures.
    const degraded = run.ticks.reduce(
      (sum, tick) => sum + tick.report.libraryInstancesDegraded,
      0,
    );
    const owed = run.ticks.reduce((sum, tick) => sum + tick.report.libraryUpkeepOwed, 0);
    const paid = run.ticks.reduce((sum, tick) => sum + tick.report.libraryUpkeepPaid, 0);
    console.log(
      `9.8 brake 4 over the run: ${String(owed)} fp upkeep owed, ${String(paid)} paid, ` +
        `${String(degraded)} instances degraded off unpaid shelves.`,
    );
    expect(owed).toBeGreaterThan(0);
    expect(paid).toBeLessThan(owed);
    expect(degraded, 'brake 4 destroyed nothing in two hundred years').toBeGreaterThan(0);
  });

  it('9.10 — records the mature-universe mage population vision §13 asked for', () => {
    const last = run.ticks[run.ticks.length - 1];
    if (last === undefined) throw new Error('the run recorded no ticks');
    const total = last.magesBySpecies.reduce((sum, value) => sum + value, 0);
    const peak = run.ticks.reduce(
      (best, tick) => Math.max(best, tick.magesBySpecies.reduce((sum, value) => sum + value, 0)),
      0,
    );
    console.log(
      `9.10 mages at world year ${String(LONG_RUN_TICKS / TICKS_PER_WORLD_YEAR)}: ` +
        `${String(total)} across a population of ${String(last.population)} ` +
        `(by species: ${last.magesBySpecies.join(' / ')}); peak over the run ${String(peak)}.`,
    );
    // The figure `docs/design/vision.md` §13 carries is this one. Asserted only
    // as an order of magnitude — that a mature universe holds tens of mages and
    // not thousands — because that is the shape of the open question, and a
    // tighter assertion would be a balance claim.
    expect(total).toBeGreaterThan(10);
    expect(total).toBeLessThan(1000);
  });
});

describe('a two-hundred-year run is a function of its seed', () => {
  it(
    '9.6 — produces a byte-identical final snapshot hash across two executions',
    async () => {
      // A second full execution, not a replay and not a prefix. `sim-core` has
      // a replay harness and golden fixtures for the substrate; this asks the
      // different question the world loop can fail on its own — whether two
      // independent 2,400-tick executions of the *same* build agree, given that
      // the loop keeps per-run mutable state (a report closure and a clamp
      // counter) that a shared instance would leak between them.
      const second = await runLongReference();
      expect(second.finalSnapshotHash).toBe(run.finalSnapshotHash);
      console.log(`9.6 final snapshot hash: ${run.finalSnapshotHash}`);

      // The control. Without it the equality above would also hold for a run
      // that ignored its seed, and the claim would be about nothing.
      const other = await runLongReference({ runSeed: 0x0009_00ff, ticks: 240 });
      const prefix = await runLongReference({ ticks: 240 });
      expect(other.finalSnapshotHash).not.toBe(prefix.finalSnapshotHash);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});

describe('the starting position the long run is taken at', () => {
  it('grants one node per founder, so no species is handed a head start', () => {
    // Task 9.9 measures species against each other. At the shakedown sweep's
    // four founding nodes, dealt round-robin across six founders, two species
    // would begin knowing nothing — and every difference measured afterwards
    // would be a difference in dealing order.
    expect(LONG_RUN_OPTIONS.foundingNodes).toBe(6);
    expect(run.founding.nodesKnown).toBe(LONG_RUN_OPTIONS.foundingNodes);
    expect(run.founding.deepestTierBySpecies.every((tier) => tier === 1)).toBe(true);
  });

  it('is played by nobody: no action is submitted at any tick', () => {
    // Zero player input, which is a claim with teeth since `god-agency` landed.
    // The universe never ascends and never stagnates here, so the terminal
    // freeze `frozenWhenTerminal` applies is not what produced any number
    // above — a frozen universe would report an unchanging population, and the
    // population moves at the last tick.
    const last = run.ticks[run.ticks.length - 1];
    const before = run.ticks[run.ticks.length - 2];
    expect(last?.report.births ?? 0).toBeGreaterThan(0);
    expect(before?.report.populaceDeaths ?? 0).toBeGreaterThanOrEqual(0);
  });
});

describe('births and deaths over two centuries (task 8.7, unmet)', () => {
  it('converge without arriving, because the run never reaches carrying capacity', () => {
    // Task 8.7 asks for births and deaths to balance "once the reference
    // scenario reaches carrying capacity". **It does not reach it.** The
    // population ends at roughly three fifths of K, and the ratio of births to
    // deaths is still above one. What can honestly be asserted is the approach:
    // the ratio falls, and it falls by a lot.
    const windows = windowsOf(run, WINDOW_YEARS).map((window) => activityIn(window));
    const ratios = windows.map(
      (activity) => activity.births / Math.max(1, activity.populaceDeaths),
    );
    console.log(`8.7 births-to-deaths per 20-year window: ${ratios.map((r) => r.toFixed(2)).join(' / ')}`);

    const first = ratios[0] ?? 0;
    const last = ratios[ratios.length - 1] ?? 0;
    expect(first).toBeGreaterThan(3);
    expect(last).toBeLessThan(1.5);
    expect(last).toBeGreaterThan(1);

    // Non-increasing over the second half, which is where the establishment
    // phase is over. Stated over a half rather than the whole run because the
    // first three windows are a founding population finding its shape and the
    // ratio wobbles there.
    const tail = ratios.slice(ratios.length / 2);
    for (let index = 1; index < tail.length; index += 1) {
      expect(tail[index] ?? 0).toBeLessThanOrEqual(tail[index - 1] ?? 0);
    }

    const lastTick = run.ticks[run.ticks.length - 1];
    const share = (lastTick?.population ?? 0) / Math.max(1, lastTick?.report.carryingCapacity ?? 1);
    console.log(`8.7 final population is ${(share * 100).toFixed(1)}% of K — not at capacity.`);
    expect(share).toBeLessThan(1);
  });
});
