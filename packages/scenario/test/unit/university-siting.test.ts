/*
 * Multiverse Mages — two universes that differ only in where the academy
 * stands.
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
 * ## The acceptance test for `university-siting`, made literal
 *
 * *"Two universes differing only in where universities stand diverge on
 * population and on knowledge."* Every other input is held fixed — the same
 * seed, the same content, the same founding cohorts, the same tradition, the
 * same number of ticks, **the same six thousand land units** — and one scalar
 * differs: `academySiteKind`.
 *
 * `river-delta` against `highland-waste` is the widest pair the shipped content
 * authors: 40960 against 512 `capacityPerLandUnit` — an 80× spread in what a
 * unit of land supports — and 2048 against 512 `libraryUpkeepMultiplier` pulling
 * the other way.
 *
 * ## Two results, and both have been re-measured since they were written
 *
 * *This section is the W24 original, kept because the reasoning is still how the
 * mechanism works, and annotated 2026-08-17 where the tree has moved past it.
 * Each case below carries its own re-measurement, its own seed table and the
 * decision that voided the claim it used to make.*
 *
 * W24's prediction was *"the delta holds more people"* and W24 measured the
 * opposite. Both universes hold the *same ground*; what differs is the size of
 * one institution. Seats reach the world through two channels that pull against
 * each other:
 *
 * - `completedCapacity` → `seatsBonus` → **`K` rises** — and it does, by half.
 *   *(7.8% on this tree, not by half; the enrolment gate now competes with it.)*
 * - `universityCapacity` → **student demand** → the populace reallocates into
 *   studenthood, and students do not farm. Materials fall, subsistence goes
 *   unpaid, and over fifty years the labour cost dominates a `K` neither
 *   universe is anywhere near.
 *
 * So W24 recorded the delta buying a **bigger institution at the price of a
 * smaller population**. **That price is largely gone**, and the case below says
 * why: `w197/aptitude-sorts-careers` bounds enrolment by school-age population
 * and species prevalence rather than by seats, so the delta now seats 61 students
 * to the waste's 8 *and* ends with more people at the pinned seed. The tradeoff
 * survives as a *divergence* — 6% to 76% across four seeds, direction 3 of 4 —
 * rather than as a direction.
 *
 * W24's second result was that **`nodesKnown` cannot diverge here**, because 51
 * was the number of authored nodes inside the twelve v1 cells and every strategy
 * the campaign measured plateaued there. **That ceiling is gone too**: this
 * campaign flagged all seventy cells `v1` and both universes finish above 150.
 * Knowledge therefore diverges where siting can actually reach it — **the book
 * count**, through `libraryUpkeepMultiplier`, which is the one channel that holds
 * its direction on every seed measured.
 *
 * ## What this is not
 *
 * Not a balance claim (`release-plan.md` forbids one before 0.5.0) and not a
 * statement that either site is the *right* answer. It is a demonstration that
 * the choice is a choice, with the numbers printed so a reader can see the size
 * of it rather than take the word "diverge" on trust.
 */

import {
  TICKS_PER_WORLD_YEAR,
  academySiteKindOf,
  referenceContent,
  runLongReference,
} from '@mm/scenario';
import type { LongRunResult, ReferenceOptions } from '@mm/scenario';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Fifty world years.
 *
 * Long enough for the founding students to mature, be promoted and research —
 * the chain siting reaches knowledge through — and short enough that two runs
 * fit inside one test. The 200-year horizon is `reference-long-run.test.ts`'s
 * job and adds nothing here: the divergence is unambiguous at fifty.
 */
const SITING_TICKS = 50 * TICKS_PER_WORLD_YEAR;

/** Held fixed across both universes. Only the site differs. */
const SHARED: Omit<ReferenceOptions, 'academySiteKind'> = {
  // One, which is what this instrument has always founded: two academies
  // standing in different country would confound siting with institutional
  // structure, which is the confound the whole fixture exists to exclude.
  foundingUniversities: 1,
  cohortSize: 12,
  foundingMages: 1,
  foundingNodes: 6,
  foundingSpeciesMask: 0,
  // Zero, the documented default, and named explicitly for this file's own
  // reason: `ReferenceOptions` gained the field after W24 was written, and
  // `Omit<ReferenceOptions, 'academySiteKind'>` requires every other key. Zero
  // changes nothing — a run that does not seed portal magic is byte-identical
  // to one written before the factor existed — which is exactly what a fixture
  // whose only intended variable is the site needs.
  foundingPortalMagic: 0,
  // **The combine-time flag raised on 2026-08-16 is resolved, 2026-08-17.** It
  // read: this fixture and the node-count assertions below reason about the v1
  // opening square — 51 nodes inside twelve enabled cells — while a sibling
  // branch has opened all seventy, so every count here is a statement about a
  // ruleset that will not exist. It does not exist: both arms now finish above
  // 150 nodes.
  //
  // These three zeroes are **kept** rather than replaced with explicit counts,
  // and it is worth being exact about what they now mean.
  // {@link ReferenceOptions.openingFormCount} documents zero as *"the v1
  // rectangle"* — so these do not name a square, they defer to the content gate,
  // and the content gate is what this campaign changed. Both arms therefore open
  // on all seventy cells, which is why `nodesKnown` reads 151 and 153 below
  // instead of the 51 this file was written against.
  //
  // Kept because the fixture's requirement is that the two arms be *identical*
  // except for the site, and deferring to content satisfies that exactly as well
  // at seventy cells as it did at twelve. Pinning explicit counts here would
  // freeze this instrument on a ruleset the game no longer ships.
  //
  // Pinned rather than defaulted so a later flip of the opening-square default
  // cannot move a comparison whose whole point is that only the site differs.
  openingTechniqueCount: 0,
  openingFormCount: 0,
  openingSquareSeeded: 0,
};

const RUN_SEED = 0x0009_0024;

const TEST_TIMEOUT_MS = 300_000;

/**
 * The node count the campaign's every measured strategy used to plateau at.
 *
 * The twelve enabled v1 cells contained exactly this many of the three hundred
 * authored nodes, so a universe that ran long enough learned all of them and
 * stopped. **That ceiling is gone**: this campaign flagged all seventy cells
 * `v1`, and both universes below finish at 151 and 153 nodes. The constant is
 * kept, renamed, and turned around — the assertion it now backs is that both
 * arms are *past* it, so the day something re-narrows the opening square this
 * file says so instead of quietly reverting to a plateau.
 *
 * Renamed from `RULESET_NODE_CEILING` on 2026-08-17: it is a historical content
 * count, not a ruleset ceiling, and the old name made every reader of the
 * assertion below think a rule bounded it.
 */
const V1_RECTANGLE_NODE_COUNT = 51;

interface Sited {
  readonly run: LongRunResult;
  readonly population: number;
  readonly nodesKnown: number;
  readonly libraryDepth: number;
  readonly capitalContribution: number;
  readonly capacity: number;
  readonly students: number;
  readonly grimoires: number;
}

async function runSitedAt(territoryId: string): Promise<Sited> {
  const content = referenceContent();
  const run = await runLongReference({
    runSeed: RUN_SEED,
    ticks: SITING_TICKS,
    content,
    options: { ...SHARED, academySiteKind: academySiteKindOf(content, territoryId) },
  });
  const last = run.ticks[run.ticks.length - 1];
  if (last === undefined) throw new Error('a run of fifty world years recorded no ticks');
  return {
    run,
    population: last.population,
    nodesKnown: last.nodesKnown,
    libraryDepth: last.libraryDepth,
    capitalContribution: last.capitalContribution,
    capacity: last.report.carryingCapacity,
    // `OCCUPATION.student` is index 2 in `OCCUPATIONS_IN_ORDER`; read positionally
    // because the observation exports the block and not the enum.
    students: last.populationByOccupation[2] ?? 0,
    grimoires: last.grimoires,
  };
}

/** Relative difference of two figures against the smaller, as a percentage. */
function spread(left: number, right: number): number {
  const smaller = Math.min(left, right);
  if (smaller <= 0) return Number.POSITIVE_INFINITY;
  return (Math.abs(left - right) / smaller) * 100;
}

describe('where a university stands changes what its universe becomes', () => {
  let delta: Sited;
  let waste: Sited;

  beforeAll(async () => {
    delta = await runSitedAt('river-delta');
    waste = await runSitedAt('highland-waste');
  }, TEST_TIMEOUT_MS);

  it('prints both universes, so the size of the difference is on the record', () => {
    const line = (name: string, sited: Sited): string =>
      [
        name.padEnd(15),
        `population ${String(sited.population).padStart(5)}`,
        `K ${String(sited.capacity).padStart(6)}`,
        `students ${String(sited.students).padStart(4)}`,
        `nodes ${String(sited.nodesKnown).padStart(3)}`,
        `libraryDepth ${String(sited.libraryDepth).padStart(3)}`,
        `capital ${String(sited.capitalContribution).padStart(4)} fp`,
        `books ${String(sited.grimoires).padStart(4)}`,
      ].join('  ');
    console.log(`siting, after ${String(SITING_TICKS)} world ticks (50 years), seed 0x90024:`);
    console.log(line('river-delta', delta));
    console.log(line('highland-waste', waste));
    expect(delta.run.ticks).toHaveLength(SITING_TICKS);
    expect(waste.run.ticks).toHaveLength(SITING_TICKS);
  });

  it('holds the universe-level territory identical, so the extent is not what moved', () => {
    // The control, and the one this change would be worthless without. Both
    // universes hold exactly the same ground: `maxCarryingCapacity` is a
    // function of the endowment alone, and it is equal to the figure
    // `contracts.md` §2.7 has always documented. Every divergence below is
    // therefore attributable to the *site* and not to a territory sum that moved
    // underneath it.
    expect(delta.run.populationBound).toBe(waste.run.populationBound);
    expect(delta.run.populationBound).toBe(109_800);
  });

  it('raises carrying capacity in the richer country, which is the direct mechanism', () => {
    // Site multiplier -> seats -> `completedCapacity` -> `seatsBonus` -> `K`.
    // This is the one link in the chain that is arithmetic rather than
    // consequence, so it is the one asserted by direction.
    //
    // **The direction holds and the magnitude does not, re-measured
    // 2026-08-16.** W24 recorded a spread over 25%; on this merged tree it is
    // 7.8%. The threshold is lowered to 5 rather than deleted, because the
    // claim worth keeping is that the mechanism *bites measurably*, and a bare
    // `>` would let it decay to a rounding difference unnoticed.
    //
    // Why it shrank is legible: the seat multiplier now competes with W197's
    // enrolment gate, which is bounded by school-age population and species
    // prevalence rather than by seats. More seats buy less when seats are no
    // longer the binding constraint.
    expect(delta.capacity).toBeGreaterThan(waste.capacity);
    expect(spread(delta.capacity, waste.capacity)).toBeGreaterThan(5);
  });

  it('diverges on population — and at this seed it is now the richer country holding MORE', () => {
    // ## The reversal, decided on purpose, 2026-08-17, `integration/all-branches`
    //
    // **What it measured before.** W24 measured the rich-country universe holding
    // *fewer* people and asserted that direction: *"a bigger institution demands
    // more students, students do not farm, and over fifty years the labour drawn
    // off the land costs more than the `seatsBonus` gains."* The comment closed
    // with *"if a later change reverses this, it should reverse it on purpose"*,
    // and `integration/group-e` left the case red on 2026-08-16 rather than take
    // that decision on its own branch.
    //
    // **Which decision voided it.** `w197/aptitude-sorts-careers`. Enrolment is
    // now bounded by school-age population and species prevalence rather than by
    // seats, so a bigger institution no longer draws proportionally more labour
    // off the land, and the cost side of W24's tradeoff largely disappeared. The
    // mechanism is visible in the printed line: the delta seats **61 students to
    // the waste's 8** and still ends with more people, which under W24's model
    // could not happen.
    //
    // **What it measures now**, and this is the decision being taken rather than
    // deferred: the acceptance criterion is *divergence*, and divergence is what
    // is asserted as a general property. The **direction** is asserted at the
    // pinned seed as a canary, because four seeds say the direction is seed-local
    // and the size of the divergence is not.
    //
    // **Measured on this tree, 2026-08-17, at 600 ticks, two runs per seed:**
    //
    // | seed | delta pop | waste pop | spread | ahead |
    // |---|--:|--:|--:|---|
    // | `0x00090024` (pinned) | 1044 | 981 | 6.42% | delta |
    // | `0x00090025` | 2112 | 1200 | 76.00% | delta |
    // | `0x00090026` | 851 | 945 | 11.05% | **waste** |
    // | `0x000a1111` | 1639 | 1046 | 56.69% | delta |
    //
    // So: **divergence holds 4 of 4 seeds**, never under 6%, and the direction
    // holds 3 of 4. W24's finding did not survive the career split, and neither
    // does its simple inverse — what survived is that siting moves population by
    // a lot, in a direction that depends on how the run goes.
    //
    // Two things in this fixture *are* direction-stable across all four seeds,
    // and they are the two the mechanism predicts directly:
    //
    // - **students**: 61 / 64 / 62 / 64 in the delta against **8** in the waste,
    //   every seed — a seven- to eight-fold gap.
    // - **carrying capacity**: the delta ahead by 7.66% to 7.76%, every seed,
    //   which is the case above this one.
    //
    // Those are asserted by direction below and above respectively. Population is
    // asserted by size generally and by direction at the seed it was measured at,
    // and if a later change flips the pinned seed too, the honest response is to
    // re-measure the four and rewrite this table — not to widen the assertion.
    expect(spread(delta.population, waste.population)).toBeGreaterThan(5);
    expect(delta.population).toBeGreaterThan(waste.population);
    expect(delta.students).toBeGreaterThan(waste.students);
  });

  it('diverges on knowledge — and the channel with room to move is now the shelf, not the graph', () => {
    // ## Re-authored 2026-08-17, `integration/all-branches`
    //
    // **What it measured before.** Two claims, both dead: that `nodesKnown` is
    // *equal* between the arms because both saturate a 51-node ruleset, and that
    // the rich site wins `libraryDepth` and `capitalContribution`.
    //
    // **Which decisions voided them.** Two, and they are separable:
    //
    // - *The open grid.* All seventy cells are now `v1`, so `nodesKnown` is 151
    //   and 153 rather than 51 and 51. There is no plateau left to be equal at,
    //   and `<= 51` is now false of both arms by a factor of three.
    // - *`w197/aptitude-sorts-careers`, composed with W21.* Depth and capital no
    //   longer separate the sites in a stable direction — see the table.
    //
    // **What it measures now.** The acceptance criterion's second half, on the
    // channel that actually carries it: **books standing at the end**, which
    // separates the two sites in the *same direction on every seed measured*, by
    // between 2x and 5.2x.
    //
    // **Measured on this tree, 2026-08-17, at 600 ticks, two runs per seed:**
    //
    // | seed | books d/w | depth d/w | capital d/w | nodesKnown d/w |
    // |---|---|---|---|---|
    // | `0x00090024` (pinned) | 136 / **510** | 18 / 21 | 208 / 232 | 151 / 153 |
    // | `0x00090025` | 111 / **332** | 54 / 40 | 408 / 352 | 183 / 182 |
    // | `0x00090026` | 110 / **575** | 11 / 11 | 152 / 152 | 151 / 151 |
    // | `0x000a1111` | 115 / **492** | 26 / 25 | 272 / 264 | 112 / 76 |
    //
    // The waste holds more books 4 of 4. Depth and capital go to the delta twice,
    // to the waste once and tie once; `nodesKnown` is within 1.4% three times and
    // 47% apart the fourth. Only one of those four is an instrument.
    //
    // ## Why books, mechanically — and it is the same finding as `9.8`
    //
    // `siting.ts` changes exactly two things and says so: the seat multiplier and
    // `libraryUpkeepMultiplier`. It explicitly does **not** change materials
    // yield, so both arms draw the *same* vellum faucet from the same 6,000 land
    // units — the universe-level control above pins that the ground is identical.
    // What differs is the bill: `territory.json` authors 2048 for `river-delta`
    // against 512 for `highland-waste`, so **the delta pays 4x the upkeep on
    // every shelved instance**.
    //
    // `reference-long-run`'s 9.8 measured, on this same tree, that library upkeep
    // is what bounds a shelf: 79% of the vellum faucet at its final tick goes to
    // keeping books already held. A site that charges four times that rate is
    // therefore the one place siting can move the archive hardest, and it is: the
    // rich delta feeds people and floods the archive, the cold dry waste starves
    // people and forgets nothing, exactly as the two glosses say.
    //
    // Depth is *not* that channel and cannot be: `degradeLibrary` sheds duplicate
    // copies before last copies, so depth is the last quantity to move and a 4x
    // upkeep difference reaches it only after it has eaten every duplicate. That
    // is why W24's depth claim was direction-stable on the tree it was written on
    // and is not on this one — the book count moved far enough to expose it.
    expect(waste.grimoires).toBeGreaterThan(delta.grimoires);
    expect(spread(delta.grimoires, waste.grimoires)).toBeGreaterThan(100);

    // The old plateau, turned around. Both arms are past the count the twelve-cell
    // opening square held, so a future change that re-narrows the grid fails here
    // rather than silently restoring a ceiling this file used to assert.
    expect(delta.nodesKnown).toBeGreaterThan(V1_RECTANGLE_NODE_COUNT);
    expect(waste.nodesKnown).toBeGreaterThan(V1_RECTANGLE_NODE_COUNT);

    // Acquisition barely separates the sites at the pinned seed — 151 against
    // 153, 1.32% — which is the honest replacement for the old equality: the two
    // universes learn nearly the same amount and *capitalize* it differently.
    // Asserted at the pinned seed only; `0x000a1111` puts them 47% apart, so this
    // is a canary and the table above is the finding.
    expect(spread(delta.nodesKnown, waste.nodesKnown)).toBeLessThan(5);

    // Non-vacuity, because every claim above is a comparison and a comparison
    // between two dead libraries is also a comparison. Direction is deliberately
    // not asserted on either: the table shows it is not stable.
    expect(delta.libraryDepth).toBeGreaterThan(0);
    expect(waste.libraryDepth).toBeGreaterThan(0);
    expect(delta.capitalContribution).toBeGreaterThan(0);
    expect(waste.capitalContribution).toBeGreaterThan(0);
  });

  it('gives the two universes different histories, not merely different endings', () => {
    // A final-tick difference could in principle be one late divergent draw.
    // This checks the runs are different worlds throughout.
    expect(delta.run.finalSnapshotHash).not.toBe(waste.run.finalSnapshotHash);
    const divergedAt = delta.run.ticks.findIndex(
      (tick, index) => tick.population !== (waste.run.ticks[index]?.population ?? -1),
    );
    expect(divergedAt).toBeGreaterThanOrEqual(0);
    console.log(`siting first moves the population at world tick ${String(divergedAt + 1)}.`);
  });
});
