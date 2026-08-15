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
 * ## Two results, and one of them is not what was predicted
 *
 * The prediction was *"the delta holds more people"*, and it is **wrong**, for a
 * reason worth having in the tree rather than in a commit message. Both
 * universes hold the *same ground*; what differs is the size of one institution.
 * Seats reach the world through two channels that pull against each other:
 *
 * - `completedCapacity` → `seatsBonus` → **`K` rises** — and it does, by half.
 * - `universityCapacity` → **student demand** → the populace reallocates into
 *   studenthood, and students do not farm. Materials fall, subsistence goes
 *   unpaid, and over fifty years the labour cost dominates a `K` neither
 *   universe is anywhere near.
 *
 * So the delta buys a **bigger institution at the price of a smaller
 * population**, which is a real strategic tradeoff and not a bug. It is recorded
 * as measured rather than asserted in the direction somebody expected.
 *
 * The second result is that **`nodesKnown` cannot diverge here**, and that is
 * also not this change's doing: 51 is the *ruleset* ceiling — the number of
 * authored nodes inside the twelve v1 cells — and every strategy the campaign
 * has ever measured plateaus there. Knowledge therefore diverges where there is
 * room for it to: **library depth**, which is the channel `w7/knowledge-capital`
 * used for the same reason.
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
  cohortSize: 12,
  foundingMages: 1,
  foundingNodes: 6,
  foundingSpeciesMask: 0,
  // The v1 rectangle, which is what every recorded run of this measurement was
  // taken on. Pinned rather than defaulted so a later flip of the opening-square
  // default cannot move a comparison whose whole point is that only the site
  // differs.
  openingTechniqueCount: 0,
  openingFormCount: 0,
  openingSquareSeeded: 0,
};

const RUN_SEED = 0x0009_0024;

const TEST_TIMEOUT_MS = 300_000;

/**
 * The node count every strategy the campaign has measured plateaus at.
 *
 * Not a balance number and not this change's to move: the twelve enabled v1
 * cells contain exactly this many of the three hundred authored nodes, so a
 * universe that runs long enough learns all of them and stops. Pinned here so
 * that the "knowledge does not diverge on `nodesKnown`" finding below fails
 * loudly if the ceiling ever lifts, rather than quietly becoming untrue.
 */
const RULESET_NODE_CEILING = 51;

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
    expect(delta.capacity).toBeGreaterThan(waste.capacity);
    expect(spread(delta.capacity, waste.capacity)).toBeGreaterThan(25);
  });

  it('diverges on population — and the richer country holds FEWER people', () => {
    // Recorded in the direction it was measured, not the direction predicted.
    // Both universes hold the same ground; what differs is the size of one
    // institution, and a bigger institution demands more students. Students do
    // not farm. Over fifty years the labour drawn off the land costs more than
    // the `seatsBonus` gains, against a `K` neither universe comes near.
    //
    // The tradeoff is the *point*: siting in rich country buys an institution
    // and pays for it in people, and a strategy layer now has something to
    // decide. If a later change reverses this, it should reverse it on purpose.
    expect(spread(delta.population, waste.population)).toBeGreaterThan(5);
    expect(delta.population).toBeLessThan(waste.population);
    expect(delta.students).toBeGreaterThan(waste.students);
  });

  it('diverges on knowledge, on the channel that has room to move', () => {
    // `nodesKnown` is pinned at the ruleset ceiling in *both* universes and
    // cannot be the measure: 51 is every authored node inside the twelve v1
    // cells, and an unplayed universe reaches all of them. That is the
    // campaign's own finding and not a result of this change.
    expect(delta.nodesKnown).toBe(RULESET_NODE_CEILING);
    expect(waste.nodesKnown).toBe(RULESET_NODE_CEILING);

    // Library depth is where knowledge has headroom, and it is the channel
    // `w7/knowledge-capital` measured for the same reason. The delta wins it
    // *despite* paying double upkeep on every shelf, because seats become
    // students become mages become books.
    expect(delta.libraryDepth).not.toBe(waste.libraryDepth);
    expect(delta.libraryDepth).toBeGreaterThan(waste.libraryDepth);
    expect(delta.capitalContribution).toBeGreaterThan(waste.capitalContribution);
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
