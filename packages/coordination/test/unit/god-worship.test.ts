/*
 * Multiverse Mages — worship saturates, lags asymmetrically, and cannot run away.
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
 * The `worship-loop` spec, asserted.
 *
 * ## The runaway test is written so a runaway cannot satisfy it
 *
 * `CLAUDE.md` records a shipped defect in which *"population never exceeds K"*
 * passed **vacuously**, because `K` outran the population it was supposed to
 * bound. The same trap is available here: "worship stays under `worshipMax`"
 * would pass for any formula whose ceiling was recomputed from its own inputs.
 *
 * So the ceiling is asserted three separate ways, and no one of them could be
 * satisfied by a bound that moves:
 *
 * 1. Against a **constant read from content** — `worshipMax` — rather than
 *    against anything the formula computes.
 * 2. Against the **sum of the three caps**, which is where that constant has to
 *    come from if the ceiling is a property of the formula rather than a clamp.
 * 3. With **a million of every source**, which is nine orders of magnitude past
 *    anything carrying capacity permits, so a linear term hiding behind a
 *    saturating one would show.
 *
 * And the fourth, which is the one a clamp would fail: every class's saturated
 * contribution is *strictly below* its own cap at every finite input. A
 * `Math.min` would produce equality.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE, mul } from '@mm/sim-core';

import {
  edictBudgetFor,
  favorCapFor,
  laggedWorship,
  sat,
  shockedTarget,
  strongestDeclaredShock,
  worshipTarget,
  worshipTierOf,
} from '../../src/index.js';

import { constants } from './god-fixtures.js';

const C = constants();

/** No mages, no universities, no populace, nobody blessed. */
const NOTHING = { mages: 0, blessedMages: 0, completedUniversities: 0, populace: 0 };

describe('sat() is the saturation the spec describes, and nothing else', () => {
  it('yields exactly half a cap at the half-point', () => {
    // The identity the whole shape rests on. Written against `cap` and `half`
    // read from content, so a retune of either moves the assertion with it.
    expect(sat(C.worshipMageHalf, C.worshipMageCap, C.worshipMageHalf)).toBe(
      Math.floor(C.worshipMageCap / 2),
    );
    expect(sat(C.worshipPopulaceHalf, C.worshipPopulaceCap, C.worshipPopulaceHalf)).toBe(
      Math.floor(C.worshipPopulaceCap / 2),
    );
  });

  it('is concave: the second half-point is worth less than the first', () => {
    const half = C.worshipMageHalf;
    const cap = C.worshipMageCap;
    const first = sat(half, cap, half) - sat(0, cap, half);
    const second = sat(2 * half, cap, half) - sat(half, cap, half);
    expect(second).toBeLessThan(first);
    // And the third less than the second, so it is concavity rather than one
    // step that happens to be smaller.
    expect(sat(3 * half, cap, half) - sat(2 * half, cap, half)).toBeLessThan(second);
  });

  it('is strictly below its cap at every input, which a clamp could not be', () => {
    for (const x of [1, 1024, C.worshipMageHalf, 1_000_000 * FP_ONE, Number.MAX_SAFE_INTEGER >> 8]) {
      expect(sat(x, C.worshipMageCap, C.worshipMageHalf)).toBeLessThan(C.worshipMageCap);
    }
  });

  it('multiplies before it divides, so an input below the half-point is not floored away', () => {
    // The shipped defect class: written `cap × (x / (x + half))` the inner
    // quotient floors to zero for every input below `half`, so one mage short
    // of the half-point would worship exactly nothing. One mage's worth of raw
    // input is nine orders of magnitude below the half-point here, and it still
    // has to produce something.
    expect(sat(C.worshipMagePerHead, C.worshipMageCap, C.worshipMageHalf)).toBeGreaterThan(0);
  });

  it('refuses a half-point of zero rather than behaving as a step function', () => {
    expect(() => sat(1024, C.worshipMageCap, 0)).toThrow(RangeError);
  });

  it('is zero at zero and at every negative input', () => {
    expect(sat(0, C.worshipMageCap, C.worshipMageHalf)).toBe(0);
    expect(sat(-4096, C.worshipMageCap, C.worshipMageHalf)).toBe(0);
  });
});

describe('the worship ceiling is a property of the formula, not a clamp', () => {
  it('declares a maximum equal to the sum of the three caps', () => {
    expect(C.worshipMax).toBe(C.worshipMageCap + C.worshipUniversityCap + C.worshipPopulaceCap);
  });

  it('stays strictly below that maximum with a million of every source', () => {
    const target = worshipTarget(
      {
        mages: 1_000_000,
        blessedMages: 1_000_000,
        completedUniversities: 1_000_000,
        populace: 1_000_000,
      },
      C,
    );
    expect(target.target).toBeLessThan(C.worshipMax);
    // Each class strictly below its own cap too. Were the ceiling a
    // post-hoc `Math.min` on the sum, this is where it would show: an
    // individual class would reach its cap exactly.
    expect(target.mages.saturated).toBeLessThan(C.worshipMageCap);
    expect(target.universities.saturated).toBeLessThan(C.worshipUniversityCap);
    expect(target.populace.saturated).toBeLessThan(C.worshipPopulaceCap);
  });

  it('is monotonic in every source, so growth never reduces devotion', () => {
    let previous = worshipTarget(NOTHING, C).target;
    for (const mages of [1, 10, 50, 200, 1000, 100_000]) {
      const next = worshipTarget({ ...NOTHING, mages }, C).target;
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
  });
});

describe('the classes saturate independently', () => {
  it('lets a founded university raise worship for a universe already deep into the mage cap', () => {
    const capped = { ...NOTHING, mages: 100_000 };
    const withUniversity = worshipTarget({ ...capped, completedUniversities: 1 }, C);
    expect(withUniversity.target).toBeGreaterThan(worshipTarget(capped, C).target);
  });

  it('leaves each class attributable, which one global transform would not', () => {
    const target = worshipTarget(
      { mages: 40, blessedMages: 0, completedUniversities: 3, populace: 500 },
      C,
    );
    expect(target.target).toBe(
      target.mages.saturated + target.universities.saturated + target.populace.saturated,
    );
    for (const contribution of [target.mages, target.universities, target.populace]) {
      expect(contribution.saturated).toBeGreaterThan(0);
    }
  });

  it('counts a blessed mage as worth more than an unblessed one, and only while blessed', () => {
    const plain = worshipTarget({ ...NOTHING, mages: 10 }, C).target;
    const blessed = worshipTarget({ ...NOTHING, mages: 10, blessedMages: 10 }, C).target;
    expect(blessed).toBeGreaterThan(plain);
  });

  it('cannot be told that more mages are blessed than are alive', () => {
    const overclaimed = worshipTarget({ ...NOTHING, mages: 2, blessedMages: 1000 }, C).target;
    const honest = worshipTarget({ ...NOTHING, mages: 2, blessedMages: 2 }, C).target;
    expect(overclaimed).toBe(honest);
  });
});

describe('the lag is asymmetric, and it converges', () => {
  it('falls faster than it rises across the same gap', () => {
    const gap = 4608 * 1024;
    const rise = laggedWorship(0, gap, C) - 0;
    const fall = gap - laggedWorship(gap, 0, C);
    expect(fall).toBeGreaterThan(rise);
    // And the content itself declares the asymmetry, so a retune that inverted
    // it would fail here rather than quietly making recoveries faster than
    // setbacks.
    expect(C.worshipLagFall).toBeGreaterThan(C.worshipLagRise);
  });

  it('moves a fraction of the way rather than snapping to the target', () => {
    const target = 4608 * 1024;
    const after = laggedWorship(0, target, C);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(target);
  });

  it('converges to within one fixed-point unit of a held target in 200 ticks', () => {
    // The spec's scenario, read as it is written: *one fixed-point unit*, which
    // `contracts.md` §0 makes `fp(1) = 1024` raw. Reading it as one raw integer
    // would be a claim about a different formula — at `LAG_RISE` of about 5% a
    // tick, 200 ticks close a gap to roughly 3.7e-5 of itself, which from the
    // worship ceiling is a fifth of one fixed-point unit and not one raw unit.
    const target = 4608 * 1024;
    let worship = 0;
    for (let tick = 0; tick < 200; tick += 1) worship = laggedWorship(worship, target, C);
    expect(Math.abs(target - worship)).toBeLessThan(FP_ONE);
  });

  it('reaches its target exactly, rather than approaching it forever', () => {
    // The +1 rule's whole purpose. Left to `mul` alone the last twenty units
    // would each floor to a step of zero and worship would never arrive.
    const target = 4608 * 1024;
    let worship = 0;
    let ticks = 0;
    while (worship !== target && ticks < 5000) {
      worship = laggedWorship(worship, target, C);
      ticks += 1;
    }
    expect(worship).toBe(target);
  });

  it('does not stall one unit short, which a floor alone would', () => {
    // `mul` floors, so a rising gap of one unit computes a step of zero. Left
    // there, worship would sit one unit below its target forever — the shipped
    // defect in which *"a floor rounded a one-unit teaching shortfall away"*.
    expect(laggedWorship(100, 101, C)).toBe(101);
    expect(laggedWorship(101, 100, C)).toBe(100);
  });

  it('never overshoots in either direction', () => {
    for (const [from, to] of [
      [0, 7],
      [7, 0],
      [0, 4_718_592],
      [4_718_592, 0],
    ] as const) {
      const after = laggedWorship(from, to, C);
      const low = Math.min(from, to);
      const high = Math.max(from, to);
      expect(after).toBeGreaterThanOrEqual(low);
      expect(after).toBeLessThanOrEqual(high);
    }
  });
});

describe('worship rewards current standing and never history', () => {
  it('gives a collapsed-and-recovered universe no advantage over a steadily grown one', () => {
    const settled = { mages: 20, blessedMages: 0, completedUniversities: 2, populace: 300 };
    const target = worshipTarget(settled, C).target;

    // One universe grows from nothing to the settled size and holds it.
    let steady = 0;
    // The other peaks at ten times that size, collapses to the same settled
    // size, and holds it. If worship were an accumulated stock, the second
    // would carry the integral of its peak forever.
    let peaked = worshipTarget(
      { mages: 200, blessedMages: 0, completedUniversities: 20, populace: 3000 },
      C,
    ).target;

    for (let tick = 0; tick < 400; tick += 1) {
      steady = laggedWorship(steady, target, C);
      peaked = laggedWorship(peaked, target, C);
    }
    expect(steady).toBe(peaked);
  });

  it('reads the target from the sources it is given and not from what it held', () => {
    // "Worship is recomputed, not persisted forward": every mage dies, and the
    // target for the next tick reflects zero mage devotion regardless of what
    // worship stood at.
    const alive = worshipTarget({ ...NOTHING, mages: 40, populace: 200 }, C);
    const dead = worshipTarget({ ...NOTHING, mages: 0, populace: 200 }, C);
    expect(dead.mages.saturated).toBe(0);
    expect(dead.target).toBeLessThan(alive.target);
  });
});

describe('shocks combine on the remainder and are bounded by the worst one priced', () => {
  it('leaves an unshocked target alone', () => {
    expect(shockedTarget(4096, [], C)).toBe(4096);
  });

  it('floors a combination at the strongest shock the content declares, not at the forbidding floor', () => {
    // The defect this test was written for. `upheaval-shock-floor` is `fp(512)`
    // and `tradition-shock` is `fp(256)`, and the constant's gloss says it
    // bounds *forbiddings*. Flooring a combination against it silently softened
    // a tradition change into an ordinary forbidding.
    expect(C.traditionShock).toBeLessThan(C.upheavalShockFloor);
    expect(strongestDeclaredShock(C)).toBe(C.traditionShock);
  });

  it('leaves a tradition shock at its own, larger magnitude', () => {
    const target = 1024 * 1024;
    expect(shockedTarget(target, [C.traditionShock], C)).toBe(mul(target, C.traditionShock));
    expect(shockedTarget(target, [C.traditionShock], C)).toBeLessThan(
      shockedTarget(target, [C.upheavalShockFloor], C),
    );
  });

  it('compounds two shocks multiplicatively rather than by summing their reductions', () => {
    const target = 1024 * 1024;
    const floor = C.upheavalShockFloor;
    // Two maximal forbiddings. Summed reductions would take the target to zero;
    // multiplicative-on-remainder takes it to a quarter, which is strictly
    // below what one forbidding does and is therefore compounding rather than a
    // bound being observed.
    const both = shockedTarget(target, [floor, floor], C);
    expect(both).toBeLessThan(shockedTarget(target, [floor], C));
    expect(both).toBeGreaterThan(0);
  });

  it('never takes a target below the worst single priced shock, however many overlap', () => {
    const target = 1_000_000;
    const many = Array.from({ length: 12 }, () => C.upheavalShockFloor);
    expect(shockedTarget(target, many, C)).toBe(mul(target, strongestDeclaredShock(C)));
    // Twelve overlapping forbiddings land exactly where the single most ruinous
    // thing the content prices lands, so no number of them compounds toward
    // nothing. Upheaval is a decade of ruin, not an extinction event.
    expect(shockedTarget(target, many, C)).toBeGreaterThan(0);
  });

  it('ignores a factor above fp(1024), so a shock can never be a blessing', () => {
    const target = 4096;
    expect(shockedTarget(target, [FP_ONE * 4], C)).toBe(target);
  });
});

describe('tiers are geometric, and the budget they grant is bounded', () => {
  it('puts a fresh universe at tier 0 with one edict', () => {
    expect(worshipTierOf(0, C)).toBe(0);
    expect(edictBudgetFor(worshipTierOf(0, C), 8)).toBe(1);
  });

  it('advances one tier per doubling, and stops at the declared count', () => {
    let threshold = C.worshipTierBase;
    for (let tier = 1; tier <= C.worshipTierCount; tier += 1) {
      expect(worshipTierOf(threshold, C)).toBe(tier);
      expect(worshipTierOf(threshold - 1, C)).toBe(tier - 1);
      threshold *= 2;
    }
    // Past the last threshold the tier does not keep climbing — the observation
    // vector's ruleset block is sized on the budget the top tier grants.
    expect(worshipTierOf(C.worshipMax, C)).toBe(C.worshipTierCount);
  });

  it('never issues a budget above EDICT_BUDGET_MAX, whatever the tier', () => {
    for (let tier = 0; tier <= 32; tier += 1) {
      expect(edictBudgetFor(tier, 8)).toBeLessThanOrEqual(8);
    }
    // And at the reachable top tier the budget is comfortably below the pin,
    // which is the headroom §0 says the constant exists to provide.
    expect(edictBudgetFor(C.worshipTierCount, 8)).toBe(1 + C.worshipTierCount);
    expect(1 + C.worshipTierCount).toBeLessThanOrEqual(8);
  });

  it('raises the favor cap by exactly one step per tier', () => {
    for (let tier = 1; tier <= C.worshipTierCount; tier += 1) {
      expect(favorCapFor(tier, C) - favorCapFor(tier - 1, C)).toBe(C.favorCapPerTier);
    }
  });
});
