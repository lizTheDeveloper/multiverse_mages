/*
 * Multiverse Mages — vision §6a's compounding loop, wired and measured.
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
 * `vision.md` §6a:
 *
 * > **Knowledge as capital** — a university's output scales with the depth of
 * > its library. […] A deep library trains better mages, who research faster,
 * > who deepen the library.
 *
 * Every piece of that shipped with `mages-and-species` and none of it was
 * joined: `capitalRateMultiplier`, `contributionFor`, `applyLibraryUpkeep` and
 * `emitCapital` had no caller outside their own unit tests, and `world-step.ts`
 * handed `libraryUpkeep: 0` to the consumption order. What this file pins is the
 * join.
 *
 * ## The two worlds differ by one field, and it is not an entity
 *
 * Both worlds below build **both** academies and shelve **both** shelves
 * identically. The only difference is which `universityId` the mages carry. That
 * is `shelving.test.ts`' own discipline and it is not fussiness: `contracts.md`
 * §6 keys the research stream on the subject, so a world holding forty fewer
 * entities hands every mage a different handle and a legitimately different
 * draw — and a test that changed the seeding would be measuring the seeding.
 *
 * ## What a rate does, and where
 *
 * `research.ts` is explicit that a rate scales the **requirement**, not the
 * progress: *"a quick learner needs less progress rather than earning more per
 * step … one place for rates to apply instead of two."* So a deep library does
 * not show up as a bigger number banked in one month; it shows up as **more
 * finished work over time**, which is what these tests count.
 *
 * ## No magnitude is asserted
 *
 * `release-plan.md` forbids a balance claim before 0.5.0 and every number in the
 * contribution table is marked `untuned`. These are direction and mechanism
 * claims: *strictly more*, *strictly less*, *exactly once*.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle, SimState } from '@mm/sim-core';
import { step } from '@mm/sim-core';
import type { Handle } from '@mm/state';
import {
  GOAL_COMMITMENT,
  KNOWLEDGE_INSTANCE,
  LIBRARY,
  LOCATION_KIND,
  MAGE,
  MATERIAL_STOCK,
  UNIVERSE,
  UNIVERSITY,
  attachRecord,
  collectRecords,
  componentOf,
} from '@mm/state';
import { MASTERY_MAX } from '@mm/rules-magic';
import { GOAL, LIBRARY_UPKEEP_PER_INSTANCE } from '@mm/rules-world';

import type { WorldStepReport } from '../../src/index.js';
import { defineWorldSimulation } from '../../src/index.js';

import {
  catalogAndCells,
  scribingTraditionId,
  seededWorld,
  sourceFor,
  worldDeps,
} from './world-fixtures.js';

const ROOT_SEED = 0x0006_a000;

/** `fp(1.0)` — a completed university (`contracts.md` §1.4). */
const FP_ONE = 1024;

/**
 * Distinct tier-1 nodes shelved in the "scholarly" library.
 *
 * Past the table's second knot (32 nodes, `fp(320)`), so the contribution is
 * comfortably clear of the rounding at the bottom of the curve and still far
 * below saturation at 640. Nothing here depends on the exact figure — the
 * assertions are inequalities — but a fixture inside the first segment would
 * make a real regression look like a rounding difference.
 */
const DEEP_SHELF = 40;

/** Which academy the universe's mages belong to. */
type Affiliation = 'scholarly' | 'bare';

interface Academy {
  readonly university: Handle;
  readonly library: EntityHandle;
}

/** A completed university with an empty library, and nothing on its staff. */
/**
 * An academy that **enrols nobody**, and the zero is W193's doing.
 *
 * This file's claim is *"a deep library makes the mages who work in it faster"*,
 * and its fixture is two academies identical except for which one the founding
 * mages are affiliated with. Since W193, that affiliation also decides which
 * academies have a **curriculum** — faculty are one of the two halves of one —
 * and therefore which of them can seat a student at all. The scholarly arm ended
 * up with 64 seats and the bare arm with 128, so the two arms differed in their
 * mage *population* (76 against 345) rather than in their library depth, and the
 * comparison stopped being a comparison.
 *
 * `capacity: 0` restores like-for-like by taking enrolment out of this fixture
 * entirely: both arms run the founding faculty against two shelves, which is
 * what the test was written to measure. It is a **narrowing**, stated here
 * rather than hidden, and the thing it gives up — whether a deep library
 * graduates more students — is a claim this file never made and which
 * `student-enrolment.test.ts` makes directly.
 */
function foundAcademy(state: SimState): Academy {
  const library = state.entities.create();
  attachRecord(state, LIBRARY, library, { foundedTick: 0 });
  const university = state.entities.create();
  attachRecord(state, UNIVERSITY, university, {
    libraryId: library,
    capacity: 0,
    buildProgress: FP_ONE,
  });
  return { university, library };
}

/** Tier-1 node ids from the shipped catalog, ascending, however many are asked for. */
function tierOneNodes(count: number): number[] {
  const { catalog } = catalogAndCells();
  const found: number[] = [];
  for (let nodeId = 1; nodeId <= catalog.nodeCount && found.length < count; nodeId += 1) {
    if (catalog.node(nodeId)?.tier === 1) found.push(nodeId);
  }
  if (found.length < count) {
    throw new Error(`the shipped catalog holds fewer than ${String(count)} tier-1 nodes`);
  }
  return found;
}

/** Shelves `copies` instances of each node in a library, as an endowment would. */
function shelve(
  state: SimState,
  library: EntityHandle,
  nodes: readonly number[],
  copies = 1,
): void {
  for (const nodeId of nodes) {
    for (let copy = 0; copy < copies; copy += 1) {
      const instance = state.entities.create();
      attachRecord(state, KNOWLEDGE_INSTANCE, instance, {
        nodeId,
        locationKind: LOCATION_KIND.library,
        locationId: library,
        acquiredTick: 0,
        mastery: MASTERY_MAX,
      });
    }
  }
}

interface WorldOptions {
  /** Which academy every mage is affiliated with. */
  readonly affiliation: Affiliation;
  /** Distinct nodes on the scholarly shelf. */
  readonly shelf?: number;
  /** Copies of each of them, for the upkeep-without-depth case. */
  readonly copies?: number;
}

interface World {
  readonly state: SimState;
  readonly scholarly: Academy;
  readonly bare: Academy;
  readonly mages: readonly Handle[];
  report(): WorldStepReport;
  advance(ticks?: number): void;
  totals(): { researchCompleted: number; grimoiresScribed: number };
}

/**
 * One universe with two completed universities, identical in every respect
 * except which of them the mages are affiliated with.
 */
function universe(options: WorldOptions): World {
  const traditionId = scribingTraditionId();
  const simulation = defineWorldSimulation(worldDeps(traditionId));
  const { state, mages } = seededWorld(simulation.schema, { rootSeed: ROOT_SEED, traditionId });

  const scholarly = foundAcademy(state);
  const bare = foundAcademy(state);
  shelve(state, scholarly.library, tierOneNodes(options.shelf ?? DEEP_SHELF), options.copies ?? 1);

  const home = options.affiliation === 'scholarly' ? scholarly : bare;
  const store = componentOf(state, MAGE);
  store.forEach((_row, handle) => {
    store.set(handle, 'universityId', home.university);
  });

  let current = state;
  const source = sourceFor(ROOT_SEED);
  const summed = { researchCompleted: 0, grimoiresScribed: 0 };

  return {
    get state() {
      return current;
    },
    scholarly,
    bare,
    mages,
    report: () => simulation.lastReport() as WorldStepReport,
    advance: (ticks = 1) => {
      for (let tick = 0; tick < ticks; tick += 1) {
        current = step(current, [], source);
        const report = simulation.lastReport() as WorldStepReport;
        summed.researchCompleted += report.researchCompleted;
        summed.grimoiresScribed += report.grimoiresScribed;
      }
    },
    totals: () => ({ ...summed }),
  };
}

/** Five world years, as the other loop tests use. Group 9 owns the long run. */
const TICKS = 60;

/**
 * Two five-year universes is two real universes, and the suite runs files in
 * parallel. Raised from vitest's 5s default for the same reason
 * `reference-time-to-tier.test.ts` raises its own: a timeout under load is a
 * scheduling fact reported as a behaviour failure.
 */
const TIMEOUT_MS = 120_000;

describe('a deep library makes the mages who work in it faster (vision §6a)', () => {
  /**
   * ## Why this counts books and not completed research projects
   *
   * It counted `researchCompleted` when `knowledge-capital` landed, and that
   * measure **inverted** the moment target selection became a utility score
   * (`autonomy/target-appeal.ts`, W17). Measured on this fixture at 60 ticks,
   * scholarly against bare:
   *
   * | measure | value-scored selection | five non-effort bounds zeroed |
   * |---|---|---|
   * | `researchCompleted` | 4131 vs **4142** | **4366** vs 4257 |
   * | `grimoiresScribed` | **324** vs 231 | **324** vs 211 |
   * | distinct nodes held | **42** vs 41 | 40 vs 40 |
   * | knowledge instances | **7839** vs 7744 | **6052** vs 5968 |
   *
   * Zeroing the five non-effort term bounds reduces the score to the cost order
   * this file was written against, and the old comparison comes back — so the
   * inversion is the reordering and nothing else. But it is an inversion of the
   * **metric**, not of the mechanism: under value-scored selection the deep
   * library still yields more distinct nodes, more instances and 40% more
   * books. What changed is the goal *mix* — the score moves effort toward
   * teaching, so total instances rise about 30% while the **count** of finished
   * research projects falls about 4% in both arms, and an 0.27% arm difference
   * sits inside that shift.
   *
   * A count of completions was always a weak proxy for §6a's *"a university's
   * output scales with the depth of its library"*: it weights a tier-1 project
   * and a tier-5 project the same and ignores everything learned by being
   * taught. Books are the loop's own output — the thing that deepens the
   * library that raises the rate — and the margin is 40% rather than 0.27%.
   *
   * `researchCompleted` is kept as a **control** on both arms. It is the
   * assertion that this universe is doing research at all, which is what makes
   * the comparison above a comparison.
   */
  it('produces strictly more of the library output over five years than a bare shelf', () => {
    const scholarly = universe({ affiliation: 'scholarly' });
    scholarly.advance(TICKS);
    const unaided = universe({ affiliation: 'bare' });
    unaided.advance(TICKS);

    // The control first: both universes must still be doing research, or
    // "strictly more" would be a claim about a universe that does nothing.
    expect(unaided.totals().researchCompleted).toBeGreaterThan(0);
    expect(scholarly.totals().researchCompleted).toBeGreaterThan(0);
    expect(scholarly.totals().grimoiresScribed).toBeGreaterThan(
      unaided.totals().grimoiresScribed,
    );
  }, TIMEOUT_MS);

  it('adds nothing to any rate while the shelves are bare', () => {
    // The other control, and the one that matters for every committed baseline
    // taken before this change: an empty library must contribute exactly
    // nothing and cost exactly nothing, so a universe that has written no books
    // yet steps as it stepped before the loop existed.
    //
    // The claim is about the arithmetic rather than about two runs' totals,
    // because the two academies do not have the same entity handle and
    // `universityPreference` breaks a depth tie on the lower one — so which
    // academy the mages start at moves the `affiliate` goal, which has nothing
    // to do with §6a and predates it.
    const world = universe({ affiliation: 'scholarly', shelf: 0 });
    world.advance();
    const first = world.report();
    expect(first.capital).not.toHaveLength(0);
    expect(first.capital.every((entry) => entry.effectiveContribution === 0)).toBe(true);
    expect(first.libraryUpkeepOwed).toBe(0);
  }, TIMEOUT_MS);

  it('closes the loop: a universe that started with nothing shelved is contributing by year five', () => {
    // The other half of §6a, and the half that makes it a *loop* rather than a
    // bonus: the same universe, given no endowment at all, writes books, shelves
    // them, and the shelf it built is worth something to the mages who built it.
    const world = universe({ affiliation: 'scholarly', shelf: 0 });
    world.advance(TICKS);
    const total = world
      .report()
      .capital.reduce((sum, entry) => sum + entry.effectiveContribution, 0);
    expect(world.totals().grimoiresScribed).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(0);
  }, TIMEOUT_MS);
});

describe('libraries cost materials to keep (brake 4)', () => {
  it('charges upkeep in proportion to the instances on the shelf', () => {
    const deep = universe({ affiliation: 'scholarly' });
    deep.advance();
    const shallow = universe({ affiliation: 'scholarly', shelf: 4 });
    shallow.advance();

    expect(deep.report().libraryUpkeepOwed).toBe(DEEP_SHELF * LIBRARY_UPKEEP_PER_INSTANCE);
    expect(shallow.report().libraryUpkeepOwed).toBe(4 * LIBRARY_UPKEEP_PER_INSTANCE);
  });

  it('charges a duplicate its keep and pays it nothing back', () => {
    // The asymmetry the whole brake is: benefit is concave in *distinct nodes*
    // and cost is linear in *instances*, so a shelf of ten copies of one book is
    // ten shelves' upkeep and one book's worth of capital.
    const hoard = universe({ affiliation: 'scholarly', shelf: 4, copies: 10 });
    hoard.advance();
    const lean = universe({ affiliation: 'scholarly', shelf: 4, copies: 1 });
    lean.advance();

    const contribution = (world: World): number =>
      world.report().capital.reduce((sum, entry) => sum + entry.effectiveContribution, 0);
    expect(hoard.report().libraryUpkeepOwed).toBe(10 * lean.report().libraryUpkeepOwed);
    expect(contribution(hoard)).toBe(contribution(lean));
  });

  it('leaves the shelved universe with less material at the end of the tick', () => {
    const deep = universe({ affiliation: 'scholarly' });
    deep.advance();
    const empty = universe({ affiliation: 'scholarly', shelf: 0 });
    empty.advance();
    expect(deep.report().materialsRemaining).toBeLessThan(empty.report().materialsRemaining);
  });

  it('degrades a library it cannot keep rather than driving the stock negative', () => {
    // A shelf far past what this universe's laborers can supply in a month, and
    // an empty storeroom to start. The `universities` spec: *"the shortfall MUST
    // degrade libraries deterministically rather than driving materials
    // negative."*
    const world = universe({ affiliation: 'scholarly', shelf: 64, copies: 400 });
    const stock = collectRecords(world.state, UNIVERSE)[0] as { handle: EntityHandle };
    // Library upkeep is paid in **vellum** (`materials.ts`'s `CLAIMANT_KIND`),
    // so it is vellum that has to run out for this shortfall to happen — the
    // single scalar this test used to zero was the whole economy at once, and
    // zeroing food or stone here would starve or halt construction instead of
    // exercising brake 4 at all.
    componentOf(world.state, MATERIAL_STOCK).set(stock.handle, 'vellum', 0);
    world.advance();

    const report = world.report();
    expect(report.materialsRemaining).toBeGreaterThanOrEqual(0);
    expect(report.libraryUpkeepPaid).toBeLessThan(report.libraryUpkeepOwed);
    expect(report.libraryInstancesDegraded).toBeGreaterThan(0);
  });

  it('sheds duplicates before it sheds the only copy of anything', () => {
    // The brake is a cost on hoarding, not a randomised loss of the archive.
    // `libraryDependence` is the metric that would otherwise be moved by it.
    const world = universe({ affiliation: 'scholarly', shelf: 64, copies: 400 });
    const stock = collectRecords(world.state, UNIVERSE)[0] as { handle: EntityHandle };
    // Vellum, for the same reason as the case above: it is the kind library
    // upkeep is paid from.
    componentOf(world.state, MATERIAL_STOCK).set(stock.handle, 'vellum', 0);
    world.advance();

    const report = world.report();
    expect(report.libraryInstancesDegraded).toBeGreaterThan(0);
    // Every distinct node still has a copy on the shelf, because only surplus
    // was taken. The emission's tier-1 prefix carries the answer.
    const shelfDepth = report.capital.reduce(
      (best, entry) => Math.max(best, entry.relevantByTier[0] ?? 0),
      0,
    );
    expect(shelfDepth).toBe(64);
    expect(report.nodesLost).toBe(0);
  });
});

describe('the per-tick capital emission §7 needs is there from the first tick', () => {
  it('reports one entry per completed university, including the bare one', () => {
    const world = universe({ affiliation: 'scholarly' });
    world.advance();

    const capital = world.report().capital;
    expect(capital).toHaveLength(2);
    for (const emission of capital) expect(emission.relevantByTier).toHaveLength(7);

    const contributions = capital.map((entry) => entry.effectiveContribution).sort((a, b) => a - b);
    // The zero is the point: `capitalSnowball` is a Gini coefficient across
    // libraries, and a bare shelf dropped from the sample would report the most
    // unequal arrangement there is as a perfectly equal one.
    expect(contributions[0]).toBe(0);
    expect(contributions[1]).toBeGreaterThan(0);
  });

  it('is a number that moves with depth, which is the whole of `capitalSnowball`', () => {
    const total = (world: World): number =>
      world.report().capital.reduce((sum, entry) => sum + entry.effectiveContribution, 0);

    const deep = universe({ affiliation: 'scholarly', shelf: DEEP_SHELF });
    deep.advance();
    const shallow = universe({ affiliation: 'scholarly', shelf: 8 });
    shallow.advance();
    expect(total(deep)).toBeGreaterThan(total(shallow));
  });
});

describe('an interdicted shelf is worth nothing and costs the same', () => {
  it('drops a forbidden cell out of depth while leaving its books standing', () => {
    // `permits` is an AND over the two axis masks, so a universe with no
    // permitted technique permits no cell and every shelved node is dormant.
    // `rules-magic`'s `library-depth.ts`: *"A library full of interdicted books
    // still stands, still holds every instance, and reports zero depth:
    // forbidding a cell costs a university its research advantage immediately,
    // while costing it no book at all."*
    const world = universe({ affiliation: 'scholarly' });
    const stock = collectRecords(world.state, UNIVERSE)[0] as { handle: EntityHandle };
    componentOf(world.state, UNIVERSE).set(stock.handle, 'permittedTechniques', 0);
    world.advance();

    const report = world.report();
    expect(report.capital.every((entry) => entry.effectiveContribution === 0)).toBe(true);
    expect(report.libraryUpkeepOwed).toBe(DEEP_SHELF * LIBRARY_UPKEEP_PER_INSTANCE);
  });
});

describe('the loop closes: a scribe writes what her shelf does not already hold', () => {
  it('does not commit to copying a node the library already carries', () => {
    // The measured defect this ordering exists for, recorded in vision §13 and
    // on the committed balance baseline alike: **1,263 books and two distinct
    // nodes**, because the scribable list was ordered by cost alone and the
    // cheapest node is the cheapest for everybody forever.
    const traditionId = scribingTraditionId();
    const simulation = defineWorldSimulation(worldDeps(traditionId));
    const { state, mages } = seededWorld(simulation.schema, { rootSeed: ROOT_SEED, traditionId });
    const academy = foundAcademy(state);

    const store = componentOf(state, MAGE);
    store.forEach((_row, handle) => {
      store.set(handle, 'universityId', academy.university);
    });

    // Two nodes every mage knows and could write. The cheaper one is already on
    // the shelf; the dearer one is not.
    const { catalog } = catalogAndCells();
    const [cheap, dear] = tierOneNodes(2) as [number, number];
    expect(catalog.node(cheap)?.scribeCost).toBeLessThanOrEqual(catalog.node(dear)?.scribeCost ?? 0);
    for (const mage of mages) {
      for (const nodeId of [cheap, dear]) {
        const instance = state.entities.create();
        attachRecord(state, KNOWLEDGE_INSTANCE, instance, {
          nodeId,
          locationKind: LOCATION_KIND.mind,
          locationId: mage,
          acquiredTick: 0,
          mastery: MASTERY_MAX,
        });
      }
    }
    shelve(state, academy.library, [cheap]);

    const after = step(state, [], sourceFor(ROOT_SEED));
    const commitments = componentOf(after, GOAL_COMMITMENT);

    let scribes = 0;
    for (const { handle, row } of collectRecords(after, GOAL_COMMITMENT)) {
      expect(commitments.has(handle)).toBe(true);
      if (row.goalId !== GOAL.scribe) continue;
      scribes += 1;
      // She may well choose not to scribe at all — the utility AI is hers, not
      // this test's. What must not happen is that she copies what the shelf
      // already holds while something novel is on her list.
      expect(row.targetNodeId).toBe(dear);
    }
    expect(scribes).toBeGreaterThan(0);
  });
});
