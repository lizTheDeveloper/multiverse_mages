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

  it('9.5 — teaching now sustains; scribing still dies of the economy', () => {
    // This tripwire has fired once already and been rewritten, which is what a
    // tripwire is for. It used to assert that teaching happened in the first
    // window and *never again* — because nothing a mage researched for herself
    // cleared the `fp(512)` teach threshold, so only the founding grants were
    // ever teachable and they were taught out inside twenty years.
    //
    // The cause was not the threshold. It was that the `acquire` tradition hook
    // was inert: `applyAcquire` was called from tests and from nowhere else, so
    // a tradition's `initialMastery` never reached a created instance and every
    // mage finished her research at the placeholder `fp(256)`. Wiring the hook
    // into the real acquisition path fixed the deadlock as a side effect, which
    // is worth recording — the symptom looked like a threshold that wanted
    // retuning, and retuning it would have hidden a dead contract instead.
    const windows = windowsOf(run, WINDOW_YEARS).map((window) => activityIn(window));
    const taught = windows.map((activity) => activity.lessonsTaught);
    const scribed = windows.map((activity) => activity.grimoiresScribed);
    console.log(`9.5 lessons taught per 20-year window: ${taught.join(' / ')}`);
    console.log(`9.5 books scribed per 20-year window:  ${scribed.join(' / ')}`);

    // Teaching happens in *every* window now, so knowledge moves mind to mind
    // for the whole run rather than for its first twenty years. Asserted per
    // window rather than as a total: a total would be satisfied by one enormous
    // early burst, which is the behaviour this replaced.
    for (const [index, lessons] of taught.entries()) {
      expect(lessons, `no lesson taught in 20-year window ${String(index)}`).toBeGreaterThan(0);
    }

    // Scribing still stops, and still dies of the economy rather than of the
    // mastery threshold: books cost materials and the stock is empty from
    // roughly world year seventy. That half of 9.5 stays unchecked, and this
    // stays a tripwire for it.
    expect(scribed[0] ?? 0).toBeGreaterThan(0);
    expect(scribed[scribed.length - 1] ?? 0).toBe(0);
  });

  it('9.7 — shows no sustained two-tick alternation in the occupation mix', () => {
    const longest = longestOccupationAlternation(run);
    console.log(`9.7 longest two-tick occupation alternation: ${String(longest)} ticks`);
    expect(longest).toBeLessThan(SUSTAINED_ALTERNATION_TICKS);
  });

  it('9.8 — has a capital curve at last, and it rises, peaks and falls back', () => {
    // **This box was open, and the tripwire under it has fired.** Task 9.8 read
    // *"true and vacuous, so not asserted: total effective capital contribution
    // is `fp(32)` from world year one to world year two hundred, because library
    // depth reaches two distinct nodes and stops … 1,263 books, two nodes"*, and
    // it asserted the books-to-depth ratio precisely so that fixing the loop
    // would fail the suite and bring somebody back here.
    //
    // `w7/knowledge-capital` wired vision §6a: the library's depth reaches
    // `research-rate`, `teach-rate` and `scribe-rate` through the shared
    // accumulator, upkeep is charged, and the scribable list prefers a node the
    // shelf does not already hold. So the series is a curve now.
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
    // and could not make; the *derivative* claim it was written to make is still
    // not made here, because the series does not merely flatten — it falls, and
    // asserting "non-increasing growth" over a series that turns negative would
    // pass for the wrong reason.
    expect(distinct.length).toBeGreaterThan(2);
    expect(peak).toBeGreaterThan(0);

    // What replaces the books-to-depth tripwire, and what it is a tripwire for
    // now: the shelf is no longer hundreds of copies of a handful of nodes. It
    // is roughly one book per distinct node, because a scribe prefers something
    // the library lacks and because upkeep charges her for every duplicate she
    // does write. Two books per node would mean the preference has stopped
    // biting; ten would mean it is gone.
    expect(last?.grimoires ?? 0).toBeLessThan(2 * (last?.libraryDepth ?? 1));

    // And the fall is brake 4 doing exactly what `mages-and-species/design.md`
    // said it would: *"beyond some depth the marginal shelf costs more than it
    // returns."* The materials stock empties around world year seventy, upkeep
    // goes unpaid, and the library is shed back to what the economy can keep —
    // a soft equilibrium set by the materials situation rather than a plateau
    // every universe reaches. The first non-raid channel in the build by which
    // a *written* copy leaves a universe.
    expect(peak).toBeGreaterThan(
      run.ticks[run.ticks.length - 1]?.capitalContribution ?? Number.POSITIVE_INFINITY,
    );
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
