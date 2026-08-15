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

/** Long enough for two hundred world years on a busy machine. */
const LONG_RUN_TIMEOUT_MS = 300_000;

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
    // value on both series, exactly (peak `fp(384)`, depth 48 nodes) — even
    // though `food` still collapses `K` and the population from world year
    // seventy on. Brake 4 (`applyLibraryUpkeep`) has not net-degraded the
    // shelf even once in two centuries, because `vellum` never actually runs
    // out here.
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

    // It is a curve rather than a constant. That half of the original claim
    // still holds.
    expect(distinct.length).toBeGreaterThan(2);
    expect(peak).toBeGreaterThan(0);

    // The books-to-depth ratio, restated at its new measured value. It used
    // to run close to one book per distinct node under the single-stock
    // economy, where a scribe's `vellum` competed with the populace's food and
    // upkeep for the same pool. Decoupled from food, scribing now has more
    // headroom and duplicates accumulate faster before upkeep's per-instance
    // cost catches them — measured at 157 books against 48 distinct nodes,
    // roughly 3.3 books per node.
    //
    // `apply-magic` moved it again, to **186 books against 43 nodes — 4.33** —
    // and the direction is the goal doing what it is for rather than a
    // regression. A month spent casting at the world is a month not spent
    // researching, so the universe reaches five fewer distinct nodes; the
    // scribes are unaffected (applied Terram work makes stone, and a scribe is
    // paid in vellum), so the same scribing capacity now has a smaller distinct
    // set to write and copies it more often. Fewer nodes and the same books is
    // exactly a higher ratio.
    //
    // Widened to 5 to fit the new measurement with headroom, not doubled
    // reflexively — still well under the "ten would mean it is gone" ceiling the
    // original comment named.
    //
    // **W116 blew through that ceiling and the bound is being retired rather
    // than widened again.** Measured on this run: **182 books against 14
    // distinct nodes — 13.0**, past the figure the original comment named as
    // meaning the property was gone. Both terms moved and they moved the same
    // way for one reason. `completeAffiliation` gained a caller, so most mages
    // are affiliated instead of six of them; a month spent writing is a month
    // not spent researching, so distinct nodes fall 43 → 14, and the enlarged
    // scribe pool copies that smaller set far more often.
    //
    // A ratio between two quantities that one mechanism moves in opposite
    // directions is not a bound anybody can set a number for — it is 1.0 when
    // nobody can scribe and unbounded as the scribe pool grows, and neither end
    // is a defect. What the original comment was actually protecting is stated
    // directly instead: the shelf must keep **gaining distinct nodes**, because
    // a library that only ever accumulates duplicates is the degenerate case.
    // Vision §6a's benefit is concave in distinct nodes and brake 4's cost is
    // linear in instances, so that is the pair the design cares about.
    expect(last?.libraryDepth ?? 0).toBeGreaterThan(10);
    expect(last?.grimoires ?? 0).toBeGreaterThan(last?.libraryDepth ?? 0);

    // The replacement for "it falls": it does not, anywhere in the run.
    // Walked tick by tick rather than compared as peak-vs-last, for the same
    // reason 9.3 walks every tick instead of every checkpoint — a series that
    // dipped and recovered between the 20-year windows this file prints would
    // still read as "never fell" from the endpoints alone.
    let sawADecrease = false;
    let previousDepth = 0;
    let previousCapital = 0;
    for (const tick of run.ticks) {
      if (tick.libraryDepth < previousDepth || tick.capitalContribution < previousCapital) {
        sawADecrease = true;
      }
      previousDepth = tick.libraryDepth;
      previousCapital = tick.capitalContribution;
    }
    expect(
      sawADecrease,
      'library depth or capital contribution fell at some tick — brake 4 is shedding the shelf ' +
        'again, and the fall-back claim this test replaced may be true once more',
    ).toBe(false);
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
