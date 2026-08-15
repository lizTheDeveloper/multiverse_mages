/*
 * Multiverse Mages — how a run ends, and what the ending is worth.
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
 * The `ascension-and-prestige` spec, asserted.
 *
 * ## The stagnation test that matters is the one about a thriving custodian
 *
 * A perfect custodian — every learnable node already learned, nothing lost —
 * acquires no new nodes either, because zero losses means there is nothing left
 * to rediscover. A bare "no new node for 480 ticks" trigger would therefore
 * terminate as *ruin* the exact civilization the Enduring Canon path exists to
 * reward, and would do it at tick 480 when the path qualifies at tick 960. That
 * is a bound nobody could reach wearing the opposite sign, and the conjunction
 * with the worship health floor is what prevents it. It is asserted here
 * directly rather than left to the shape of the code.
 *
 * ## There is no literal tier-7 check anywhere, and this file proves it
 *
 * Per-species depth ceilings mean tier 7 may be reachable by one species or by
 * none, and the v1 node graphs may contain no tier-7 node at all. So
 * `deepestNodesByCell` is tested against a synthetic catalog whose deepest tier
 * is 5, and Path A is satisfied by it — which a literal check could not be.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import type { GodStateRecord } from '@mm/state';
import { ASCENSION_PATH, EMPTY_GOD_STATE, TERMINAL_REASON } from '@mm/state';
import type { NodeCatalog } from '@mm/rules-magic';

import type { ApotheosisFacts } from '../../src/index.js';
import {
  apotheosisSatisfied,
  canonSatisfied,
  carriedPrestige,
  deepestNodesByCell,
  legacyBudget,
  legacyGrant,
  libraryDependence,
  prestigeEarned,
  qualifyingPath,
  stepStagnation,
} from '../../src/index.js';

import { constants } from './god-fixtures.js';
import { registry } from './world-fixtures.js';

/**
 * The shipped constants, with Path A's cell gate held at **1**.
 *
 * Every Path A test below asserts the *structure* of the conjunction — that the
 * copy count, the permit, the tier gate and "deepest in its cell" each refuse on
 * their own — against a two-cell synthetic catalog. `ascension-summit-cells`
 * ships at 18 because a universe the god never touches masters all twelve cells
 * of the v1 rectangle, so a two-cell fixture cannot reach it and every assertion
 * here would pass for the one reason that has nothing to do with what it names.
 *
 * Held at the identity value rather than raised, because "the shipped gate is
 * 18" is a magnitude and `god-ascension-achievement.test.ts` is where it is
 * asserted. This file is about the predicate's shape.
 */
const C = { ...constants(), ascensionSummitCells: 1 };

/** A god-state row with the named fields moved off zero. */
function god(overrides: Partial<GodStateRecord> = {}): GodStateRecord {
  return { ...EMPTY_GOD_STATE, ...overrides };
}

/**
 * A catalog whose deepest node is tier 5, in two cells.
 *
 * Deliberately shallower than `contracts.md` §2.3's tier 7. If any part of the
 * ascension tree carried a literal tier check, this content would make Path A
 * unreachable and the tests below would fail — which is the whole point of
 * testing against it rather than against the shipped graph.
 */
const SHALLOW: { catalog: NodeCatalog; cellOf: (nodeId: number) => number } = {
  catalog: {
    nodeCount: 6,
    node(nodeId: number) {
      const tiers: Record<number, number> = { 1: 1, 2: 3, 3: 5, 4: 1, 5: 2, 6: 4 };
      const tier = tiers[nodeId];
      if (tier === undefined) return undefined;
      return { nodeId, tier, prerequisites: [], researchCost: 1024, teachCost: 1024, scribeCost: 1024 };
    },
  } as unknown as NodeCatalog,
  cellOf: (nodeId: number) => (nodeId <= 3 ? 1 : 2),
};

/** Path A's inputs, with every conjunct satisfied unless a test breaks one. */
function apotheosisFacts(overrides: Partial<ApotheosisFacts> = {}): ApotheosisFacts {
  return {
    heldByLivingMage: new Set([3]),
    instanceCount: () => 2,
    permitsCell: () => true,
    cellOf: SHALLOW.cellOf,
    deepest: deepestNodesByCell(SHALLOW.catalog, SHALLOW.cellOf),
    worshipTier: C.ascensionTierGate,
    completedUniversities: C.ascensionInstitutions,
    ...overrides,
  };
}

describe('depth is relative to content, and no literal tier appears anywhere', () => {
  it('picks the deepest node present in each cell, whatever tier that happens to be', () => {
    const deepest = deepestNodesByCell(SHALLOW.catalog, SHALLOW.cellOf);
    expect(deepest.get(1)).toBe(3);
    expect(deepest.get(2)).toBe(6);
  });

  it('satisfies Path A on a graph whose deepest tier is 5', () => {
    expect(apotheosisSatisfied(apotheosisFacts(), C)).toBe(true);
  });

  it('breaks ties by ascending node id rather than by enumeration order', () => {
    const tied = {
      nodeCount: 3,
      node(nodeId: number) {
        return nodeId <= 3
          ? { nodeId, tier: 4, prerequisites: [], researchCost: 1, teachCost: 1, scribeCost: 1 }
          : undefined;
      },
    } as unknown as NodeCatalog;
    expect(deepestNodesByCell(tied, () => 1).get(1)).toBe(1);
  });
});

describe('Path A is a conjunction, and every conjunct is load-bearing', () => {
  it('is not satisfied when only one instance of the node survives', () => {
    // Two copies, because by construction only one mage has ever held the
    // deepest node — teaching or scribing a second is a necessary step and not
    // a nicety.
    expect(apotheosisSatisfied(apotheosisFacts({ instanceCount: () => 1 }), C)).toBe(false);
    expect(apotheosisSatisfied(apotheosisFacts({ instanceCount: () => 2 }), C)).toBe(true);
  });

  it('is not satisfied while the cell is forbidden', () => {
    expect(apotheosisSatisfied(apotheosisFacts({ permitsCell: () => false }), C)).toBe(false);
  });

  it('is not satisfied below the worship-tier gate', () => {
    expect(
      apotheosisSatisfied(apotheosisFacts({ worshipTier: C.ascensionTierGate - 1 }), C),
    ).toBe(false);
  });

  it('is not satisfied by a node that is merely deep, but not the deepest in its cell', () => {
    // Node 2 is tier 3 in a cell whose deepest is tier 5.
    expect(apotheosisSatisfied(apotheosisFacts({ heldByLivingMage: new Set([2]) }), C)).toBe(false);
  });

  it('is not satisfied when no living mage holds anything', () => {
    expect(apotheosisSatisfied(apotheosisFacts({ heldByLivingMage: new Set() }), C)).toBe(false);
  });
});

describe('Path B is a run of good era boundaries, not a tally of them', () => {
  it('is satisfied by an unbroken run of the declared length', () => {
    expect(canonSatisfied(god({ goodEraRun: C.ascensionEraCount }), C)).toBe(true);
    expect(canonSatisfied(god({ goodEraRun: C.ascensionEraCount - 1 }), C)).toBe(false);
  });

  it('cannot be reached by banking good eras and then collapsing', () => {
    // A tally of good-boundaries-ever would let a universe bank three good
    // eras, collapse, and coast to the ending on history. `goodEraRun` resets
    // to zero on a failed boundary, which is what makes the earliest qualifying
    // boundary "move forward" as the spec's scenario says.
    const collapsed = god({ goodEraRun: 0 });
    expect(canonSatisfied(collapsed, C)).toBe(false);
  });
});

describe('the minimum tick gates qualification, not merely declaration', () => {
  it('reports no path before the floor, even with Path A fully satisfied', () => {
    expect(qualifyingPath(apotheosisFacts(), god(), C.ascensionMinTick - 1, C)).toBe(
      ASCENSION_PATH.none,
    );
  });

  it('reports the path from the floor onward', () => {
    expect(qualifyingPath(apotheosisFacts(), god(), C.ascensionMinTick, C)).toBe(
      ASCENSION_PATH.apotheosis,
    );
  });

  it('falls back to the canon path when apotheosis is not satisfied', () => {
    expect(
      qualifyingPath(
        apotheosisFacts({ worshipTier: 0 }),
        god({ goodEraRun: C.ascensionEraCount }),
        C.ascensionMinTick,
        C,
      ),
    ).toBe(ASCENSION_PATH.canon);
  });

  it('can lapse: a path satisfied one tick is none the next', () => {
    const tick = C.ascensionMinTick;
    expect(qualifyingPath(apotheosisFacts(), god(), tick, C)).toBe(ASCENSION_PATH.apotheosis);
    // The qualifying mage dies between ticks.
    expect(qualifyingPath(apotheosisFacts({ heldByLivingMage: new Set() }), god(), tick, C)).toBe(
      ASCENSION_PATH.none,
    );
  });
});

describe('libraryDependence is a fraction of what is known', () => {
  it('is the share of known nodes with exactly one surviving instance', () => {
    expect(libraryDependence(4, 1)).toBe(FP_ONE / 4);
    expect(libraryDependence(4, 4)).toBe(FP_ONE);
    expect(libraryDependence(4, 0)).toBe(0);
  });

  it('reads a universe that knows nothing as zero rather than dividing by it', () => {
    expect(libraryDependence(0, 0)).toBe(0);
  });
});

describe('stagnation means decline, and the stasis trigger is conjunctive', () => {
  const thriving = { livingMages: 12, worship: C.stagnationHealthFloor * 2, nodeEntered: false };

  it('does not terminate a thriving custodian who acquires nothing, ever', () => {
    // The bound nobody could reach, wearing the opposite sign. Run it well past
    // the stasis window and past the tick Path B qualifies at, and it must still
    // be alive to declare.
    let state = god();
    for (let tick = 0; tick < C.stagnationStasisTicks * 3; tick += 1) {
      const outcome = stepStagnation(state, thriving, C);
      expect(outcome.stagnated).toBe(false);
      state = god({
        magelessTicks: outcome.magelessTicks,
        lowWorshipTicks: outcome.lowWorshipTicks,
        stasisTicks: outcome.stasisTicks,
      });
    }
    expect(state.stasisTicks).toBe(0);
  });

  it('terminates a universe that is both frozen and unworshipped', () => {
    const failing = { livingMages: 3, worship: C.stagnationHealthFloor - 1, nodeEntered: false };
    let state = god();
    let terminatedAt = -1;
    for (let tick = 0; tick < C.stagnationStasisTicks + 5; tick += 1) {
      const outcome = stepStagnation(state, failing, C);
      state = god({
        magelessTicks: outcome.magelessTicks,
        lowWorshipTicks: outcome.lowWorshipTicks,
        stasisTicks: outcome.stasisTicks,
      });
      if (outcome.stagnated && terminatedAt < 0) terminatedAt = tick;
    }
    expect(terminatedAt).toBeGreaterThanOrEqual(0);
  });

  it('terminates a mageless universe after the declared window', () => {
    const dead = { livingMages: 0, worship: C.stagnationHealthFloor * 2, nodeEntered: true };
    let state = god();
    for (let tick = 1; tick < C.stagnationMagelessTicks; tick += 1) {
      const outcome = stepStagnation(state, dead, C);
      expect(outcome.stagnated).toBe(false);
      state = god({ magelessTicks: outcome.magelessTicks });
    }
    expect(stepStagnation(state, dead, C).stagnated).toBe(true);
  });

  it('resets every clock the moment its condition stops holding', () => {
    const dead = { livingMages: 0, worship: 0, nodeEntered: false };
    let state = god();
    for (let tick = 0; tick < 30; tick += 1) {
      const outcome = stepStagnation(state, dead, C);
      state = god({
        magelessTicks: outcome.magelessTicks,
        lowWorshipTicks: outcome.lowWorshipTicks,
        stasisTicks: outcome.stasisTicks,
      });
    }
    expect(state.magelessTicks).toBe(30);

    const recovered = stepStagnation(state, {
      livingMages: 4,
      worship: C.stagnationHealthFloor * 2,
      nodeEntered: true,
    }, C);
    expect(recovered.magelessTicks).toBe(0);
    expect(recovered.lowWorshipTicks).toBe(0);
    expect(recovered.stasisTicks).toBe(0);
    expect(recovered.stagnated).toBe(false);
  });

  it('terminates a universe held below the worship floor for the declared window', () => {
    const starved = { livingMages: 2, worship: C.stagnationWorshipFloor - 1, nodeEntered: true };
    let state = god();
    let ticks = 0;
    while (ticks < C.stagnationWorshipTicks + 5) {
      const outcome = stepStagnation(state, starved, C);
      state = god({
        magelessTicks: outcome.magelessTicks,
        lowWorshipTicks: outcome.lowWorshipTicks,
        stasisTicks: outcome.stasisTicks,
      });
      ticks += 1;
      if (outcome.stagnated) break;
    }
    expect(ticks).toBe(C.stagnationWorshipTicks);
  });
});

describe('prestige is earned from bounded achievement, and never from nothing', () => {
  it('awards something for every terminal outcome, including ruin', () => {
    for (const terminalReason of [
      TERMINAL_REASON.ascensionApotheosis,
      TERMINAL_REASON.ascensionCanon,
      TERMINAL_REASON.stagnation,
      TERMINAL_REASON.truncated,
    ]) {
      const earned = prestigeEarned(
        { terminalReason, deepestTier: 1, erasSurvived: 1, peakWorshipTier: 0 },
        C,
      );
      // A zero floor makes a losing streak spiral toward zero carried prestige,
      // which is the runaway-leader failure wearing the opposite sign.
      expect(earned).toBeGreaterThan(0);
    }
  });

  it('ranks an ascension above a cutoff above a stagnation, all else equal', () => {
    const at = (terminalReason: number): number =>
      prestigeEarned({ terminalReason, deepestTier: 2, erasSurvived: 2, peakWorshipTier: 1 }, C);
    expect(at(TERMINAL_REASON.ascensionApotheosis)).toBeGreaterThan(at(TERMINAL_REASON.truncated));
    expect(at(TERMINAL_REASON.truncated)).toBeGreaterThan(at(TERMINAL_REASON.stagnation));
  });

  it('is clamped at the earning ceiling however large the achievement', () => {
    expect(
      prestigeEarned(
        {
          terminalReason: TERMINAL_REASON.ascensionApotheosis,
          deepestTier: 1000,
          erasSurvived: 1000,
          peakWorshipTier: 1000,
        },
        C,
      ),
    ).toBe(C.prestigeEarnMax);
  });

  it('reads a negative achievement as zero rather than as a penalty', () => {
    expect(
      prestigeEarned(
        {
          terminalReason: TERMINAL_REASON.stagnation,
          deepestTier: -5,
          erasSurvived: -5,
          peakWorshipTier: -5,
        },
        C,
      ),
    ).toBe(C.prestigeBaseStagnated);
  });
});

describe('the carry-over converges by arithmetic rather than by a clamp', () => {
  it('declares a cap that is the analytic limit of its own recurrence', () => {
    // `cap × (fp(1024) − retention) == earnMax × fp(1024)`. The content loader
    // checks this too; asserted here because it is the sentence that makes
    // `PRESTIGE_CAP` a property rather than a number somebody chose.
    expect(C.prestigeCap * (FP_ONE - C.prestigeRetention)).toBe(C.prestigeEarnMax * FP_ONE);
  });

  it('approaches the cap over a hundred maximal runs and never exceeds it', () => {
    let prestige = 0;
    const trail: number[] = [];
    for (let run = 0; run < 100; run += 1) {
      prestige = carriedPrestige(prestige, C.prestigeEarnMax, C);
      expect(prestige).toBeLessThanOrEqual(C.prestigeCap);
      trail.push(prestige);
    }
    expect(prestige).toBeGreaterThan(C.prestigeCap - FP_ONE);
    // And it approached rather than jumped: the cap is not what stopped it.
    expect(trail[2] ?? 0).toBeLessThan(C.prestigeCap);
  });

  it('makes the tenth consecutive win worth far less than the third', () => {
    // Asserted **marginally** — what the tenth win adds against what the third
    // added — rather than as the spec's scenario phrases it, which compares the
    // *aggregate* gain from run 1 to 3 against the gain from run 3 to 10. Those
    // are two runs against seven, so the second is larger for a reason that has
    // nothing to do with diminishing returns, and the comparison is ill-posed
    // however the recurrence behaves. `design.md`'s own wording is the marginal
    // one: *"the tenth consecutive ascension adds a few percent over the
    // fifth"*.
    const after = (runs: number): number => {
      let prestige = 0;
      for (let run = 0; run < runs; run += 1) prestige = carriedPrestige(prestige, C.prestigeEarnMax, C);
      return prestige;
    };
    const thirdWin = after(3) - after(2);
    const tenthWin = after(10) - after(9);
    expect(tenthWin).toBeLessThan(thirdWin);
    // "Far less", not merely less: under a fifth of it.
    expect(tenthWin * 5).toBeLessThan(thirdWin);
  });

  it('erodes an idle legacy toward what the recent runs support', () => {
    let prestige = 0;
    for (let run = 0; run < 40; run += 1) prestige = carriedPrestige(prestige, C.prestigeEarnMax, C);
    const peak = prestige;
    for (let run = 0; run < 20; run += 1) {
      prestige = carriedPrestige(prestige, C.prestigeBaseStagnated, C);
    }
    expect(prestige).toBeLessThan(peak);
    // Toward the level minimal runs support, not toward zero.
    expect(prestige).toBeGreaterThan(0);
  });
});

describe('the legacy conversion is concave, and it buys stocks only', () => {
  it('gives half the prestige cap more than two thirds of the attainable budget', () => {
    const full = legacyBudget(C.prestigeCap, C);
    const half = legacyBudget(Math.floor(C.prestigeCap / 2), C);
    expect(half * 3).toBeGreaterThan(full * 2);
    expect(half).toBeLessThan(full);
  });

  it('is bounded by the declared legacy cap however large prestige grows', () => {
    expect(legacyBudget(C.prestigeCap * 1000, C)).toBeLessThan(C.legacyCap);
  });

  it('grants nothing at all to a universe with no prestige', () => {
    const grant = legacyGrant(0, C);
    expect(grant).toEqual({
      favor: 0,
      materials: 0,
      populace: 0,
      archiveNodes: 0,
      // The bound rides along even when there is nothing to bound. It is a
      // property of the content, not of this universe's prestige, and a seeder
      // reading it off a zero grant must get the same answer as off a full one.
      archiveMaxTier: C.legacyArchiveMaxTier,
    });
  });

  it('grants only the four stock channels, and each is monotonic in prestige', () => {
    const small = legacyGrant(Math.floor(C.prestigeCap / 8), C);
    const large = legacyGrant(C.prestigeCap, C);
    expect(Object.keys(large).sort()).toEqual(
      ['archiveNodes', 'archiveMaxTier', 'favor', 'materials', 'populace'].sort(),
    );
    expect(large.favor).toBeGreaterThanOrEqual(small.favor);
    expect(large.materials).toBeGreaterThanOrEqual(small.materials);
    expect(large.populace).toBeGreaterThanOrEqual(small.populace);
    expect(large.archiveNodes).toBeGreaterThanOrEqual(small.archiveNodes);
  });

  it('never seeds more archive instances than the content permits', () => {
    expect(legacyGrant(C.prestigeCap * 1000, C).archiveNodes).toBeLessThanOrEqual(
      C.legacyArchiveNodes,
    );
  });

  /**
   * The count is meaningless without the bound, and the bound used to be carried
   * nowhere.
   *
   * `archiveNodes` shipped with a gloss promising *"at or below the authored
   * tier"* while `legacy-archive-max-tier` was resolved into `GodConstants` and
   * read by nothing — `check:reachability` reported it as a constant nothing
   * consumes. A promise kept only in a comment is one a seeder can miss, and the
   * failure mode is named in the constant's own gloss: *"A legacy that could
   * seed the summit would be prestige buying the ascension condition."*
   *
   * The second assertion is the one with teeth. It is not "3 equals 3" — it
   * checks the bound against the **deepest tier the shipped node graph actually
   * authors**, so it fails if either number moves toward the other. Retuning the
   * bound up to the summit, or authoring a graph shallow enough that the bound
   * reaches it, both break this.
   */
  it('carries the archive tier bound, and the bound stays below the authored summit', () => {
    const deepestAuthoredTier = Math.max(...registry().nodes.map((entry) => entry.record.tier));

    for (const prestige of [0, 1, 2048, C.prestigeCap, C.prestigeCap * 1000]) {
      expect(legacyGrant(prestige, C).archiveMaxTier).toBe(C.legacyArchiveMaxTier);
    }
    expect(legacyGrant(C.prestigeCap, C).archiveMaxTier).toBeLessThan(deepestAuthoredTier);
  });

  it('grants a whole number of people, because a fifth of a person is not one', () => {
    for (const prestige of [1, 512, 2048, C.prestigeCap]) {
      expect(Number.isInteger(legacyGrant(prestige, C).populace)).toBe(true);
    }
  });

  it('keeps every channel at or below the head-start fraction of its reference baseline', () => {
    const grant = legacyGrant(C.prestigeCap, C);
    const ceiling = (baseline: number): number =>
      Math.floor((baseline * C.legacyHeadstartFraction) / FP_ONE);
    expect(grant.favor).toBeLessThanOrEqual(ceiling(C.legacyBaselineFavor));
    expect(grant.materials).toBeLessThanOrEqual(ceiling(C.legacyBaselineMaterials));
    expect(grant.populace).toBeLessThanOrEqual(ceiling(C.legacyBaselinePopulace * FP_ONE) / FP_ONE);
  });
});
