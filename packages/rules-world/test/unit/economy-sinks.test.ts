/*
 * Multiverse Mages — the two world-loop sinks, and the ceiling that spills.
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
 * `material-economy` task 3.4: each sink must **drain**, not gate.
 * `economy-flow-models.md` §3.3 draws the line — *"A drain destroys
 * unconditionally and accumulates nothing. A gate accumulates nothing either
 * but destroys only as a side effect"* — and the practical test of which one
 * you built is whether the response has a cliff in it.
 *
 * **Every assertion here is written as two arms measured in the same run**, and
 * that is the discipline rather than a style. A single-arm assertion of the
 * shape *"a funded faculty teaches faster than the base rate"* passes on a
 * build where the sink does nothing at all, as long as somebody remembered to
 * add the constant. Two arms that must **differ** cannot: on a build with no
 * sink, the funded and unfunded arms return the same number and the test fails.
 * The unfunded arm is the positive control for the funded one and the other way
 * round.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';

import {
  MATERIAL_KINDS,
  MATERIAL_STOCK_CEILING,
  REQUIRED_CONSTRUCTION_WEIGHTS,
  REQUIRED_TEACHING_WEIGHTS,
  applyStockCeiling,
  fundedTeachingShare,
  hireableMonths,
  insightTeachingBonus,
  readHiredLabourWeights,
  readTeachingWeights,
  spendableLabor,
  teachingInsightDemand,
  zeroAmounts,
} from '../../src/index.js';
import type { TeachingWeights } from '../../src/index.js';

import { stackMagnitudes } from '@mm/primitives';

import { primitiveNamed, shippedRegistry } from './universities-fixtures.js';

/** Round numbers, so an assertion about a share is not one about rounding. */
const TEACHING: TeachingWeights = { insightPerMonth: 4, insightTeachBonus: 256 };

describe('the shipped weights for both sinks are read by name and are untuned', () => {
  it('reads the teaching pair and the hire rate out of autonomy-weight.json', () => {
    const teaching = readTeachingWeights(shippedRegistry());
    expect(teaching.insightPerMonth).toBeGreaterThan(0);
    expect(teaching.insightTeachBonus).toBeGreaterThan(0);
    expect(readHiredLabourWeights(shippedRegistry()).laborPerMonth).toBeGreaterThan(0);
  });

  it('names exactly the ids the loader requires of the table', () => {
    // Both directions. An id this module reads and the table does not declare
    // would arrive as `0` — a sink that silently drains nothing — while every
    // test that supplied its own weights went on passing.
    expect([...REQUIRED_TEACHING_WEIGHTS]).toEqual([
      'teaching-insight-per-month',
      'teaching-insight-bonus',
    ]);
    expect([...REQUIRED_CONSTRUCTION_WEIGHTS]).toEqual(['construction-labor-per-month']);
    for (const id of [...REQUIRED_TEACHING_WEIGHTS, ...REQUIRED_CONSTRUCTION_WEIGHTS]) {
      expect(() => shippedRegistry().autonomyWeight(id)).not.toThrow();
    }
  });

  it('refuses an id the source does not declare rather than defaulting it', () => {
    const absent = {
      autonomyWeight: (): number => {
        throw new Error('no such weight');
      },
    };
    expect(() => readTeachingWeights(absent)).toThrow();
    expect(() => readHiredLabourWeights(absent)).toThrow();
  });
});

describe('insight drains into teaching throughput, proportionally and without a cliff', () => {
  it('spends what the lessons cost, and spends nothing when nobody teaches', () => {
    expect(teachingInsightDemand(4 * FP_ONE, TEACHING)).toBe(16);
    expect(teachingInsightDemand(0, TEACHING)).toBe(0);
  });

  it('refuses a negative demand rather than paying into the stock', () => {
    expect(() => teachingInsightDemand(-FP_ONE, TEACHING)).toThrow(/negative demand/u);
  });

  it('funds every teacher in full when the stock covers the faculty', () => {
    // Four mage-months at 4 insight each is 16, and the stock holds more.
    expect(fundedTeachingShare(4 * FP_ONE, 64, TEACHING)).toBe(FP_ONE);
  });

  it('funds a proportional share when it does not, which is the drain', () => {
    // **The two arms.** Half the insight buys half the share and therefore half
    // the acceleration — not none of it, and not all of it. A *gate* would
    // return `FP_ONE` above some threshold and `0` below, and the midpoint
    // below is the reading that tells the two apart.
    const full = fundedTeachingShare(4 * FP_ONE, 16, TEACHING);
    const half = fundedTeachingShare(4 * FP_ONE, 8, TEACHING);
    const quarter = fundedTeachingShare(4 * FP_ONE, 4, TEACHING);
    expect(full).toBe(FP_ONE);
    expect(half).toBe(FP_ONE / 2);
    expect(quarter).toBe(FP_ONE / 4);
    expect(half).toBeGreaterThan(quarter);
    expect(half).toBeLessThan(full);
  });

  it('funds nothing at all out of an empty stock, and does not go negative', () => {
    expect(fundedTeachingShare(4 * FP_ONE, 0, TEACHING)).toBe(0);
    expect(fundedTeachingShare(4 * FP_ONE, -100, TEACHING)).toBe(0);
  });

  it('never overdraws by rounding, because the share floors', () => {
    // One insight against a demand of 16 is 1/16 of the share, floored. The
    // remainder stays in the stock rather than being granted for free — the
    // same discipline `affordableMageMonths` states next door.
    const share = fundedTeachingShare(4 * FP_ONE, 1, TEACHING);
    expect(share).toBe(FP_ONE / 16);
    expect(teachingInsightDemand((4 * FP_ONE * share) / FP_ONE, TEACHING)).toBeLessThanOrEqual(1);
  });

  it('turns the share into a teach-rate magnitude, and zero into zero', () => {
    // The magnitude is what joins the one `teach-rate` array — see
    // `material-economy` precondition 0.4. An unfunded faculty adds **nothing**
    // to it, which is what makes the sink additive rather than a tax: a
    // universe with no insight teaches at exactly the rate its god and its
    // scholars supply, which is the pre-change behaviour.
    expect(insightTeachingBonus(FP_ONE, TEACHING)).toBe(256);
    expect(insightTeachingBonus(FP_ONE / 2, TEACHING)).toBe(128);
    expect(insightTeachingBonus(0, TEACHING)).toBe(0);
    // Bounded above, so a share arriving out of range cannot buy more than a
    // fully funded month.
    expect(insightTeachingBonus(4 * FP_ONE, TEACHING)).toBe(256);
  });

  it('costs nothing and buys nothing on a build whose weights are zero', () => {
    // The fixture default in `world-fixtures.ts`, and the shape every test that
    // predates this sink runs under.
    const free: TeachingWeights = { insightPerMonth: 0, insightTeachBonus: 0 };
    expect(fundedTeachingShare(4 * FP_ONE, 0, free)).toBe(FP_ONE);
    expect(teachingInsightDemand(4 * FP_ONE, free)).toBe(0);
    expect(insightTeachingBonus(FP_ONE, free)).toBe(0);
  });
});

describe('labor drains into construction by hiring months, and hires nobody for nothing', () => {
  const HIRE = { laborPerMonth: 4 };

  it('hires what the stock affords', () => {
    expect(hireableMonths(10, 40, HIRE)).toBe(10);
    expect(hireableMonths(10, 20, HIRE)).toBe(5);
    expect(hireableMonths(10, 3, HIRE)).toBe(0);
  });

  it('hires nobody onto a site with no crew, whatever the stock holds', () => {
    // **The load-bearing arm.** `labor` accelerates a workforce and does not
    // replace one, and the mechanical consequence is the property a new
    // claimant needs: the demand is exactly zero when no construction is
    // happening, so every world that has never held any `labor` records no
    // shortfall rather than one every tick forever.
    expect(hireableMonths(0, 1_000_000, HIRE)).toBe(0);
    expect(hireableMonths(-5, 1_000_000, HIRE)).toBe(0);
  });

  it('never hires more than the crew it is accelerating', () => {
    expect(hireableMonths(3, 1_000_000, HIRE)).toBe(3);
  });

  it('hires nobody on a build whose hire rate is zero', () => {
    expect(hireableMonths(10, 1_000_000, { laborPerMonth: 0 })).toBe(0);
  });
});

/**
 * The reserve floor, which exists because the first attempt at pricing
 * `fund-university` in `labor` failed and the failure was measured.
 *
 * An automatic per-tick sink and a discretionary verb competing for one stock is
 * a race the sink always wins: the hire drains to zero every tick, so the verb
 * is masked on almost every tick it is otherwise legal on. Measured on the
 * shipped pool, action 11 came back legal on **8 ticks of 585**.
 *
 * `economy-flow-models.md` §3.3–§3.4 name the two available shapes, and this is
 * the **drain** one rather than the **gate** one: the hire still draws
 * proportionally to the crew above the reserve and simply stops drawing there.
 * Nothing is gated, nothing accumulates outside a stock, and a stock held back
 * by a floor is still in the stock — which is why conservation is unaffected.
 */
describe('the hire reserves what the funding verb costs, and drains freely above it', () => {
  const RESERVE = { laborPerMonth: 4, reserve: 40 };

  it('draws only the labor above the reserve', () => {
    // 100 held, 40 reserved, 60 spendable, 4 per month -> 15 months.
    expect(hireableMonths(100, 100, RESERVE)).toBe(15);
    // And the subtraction happens exactly **once**. The first draft of this
    // floor subtracted the reserve in the world loop as well as here, which
    // floored the drain at twice the declared price — 8192 against a reserve of
    // 4096 — and every arm still moved in the right direction, so only an
    // arithmetic assertion could catch it. This is that assertion.
    expect(hireableMonths(100, 100, { laborPerMonth: 4, reserve: 0 })).toBe(25);
  });

  it('hires nobody once the stock is down to the reserve', () => {
    // The floor itself. At or below it the hire is zero, which is what leaves
    // the discretionary verb something to spend.
    expect(hireableMonths(100, 40, RESERVE)).toBe(0);
    expect(hireableMonths(100, 39, RESERVE)).toBe(0);
    expect(hireableMonths(100, 44, RESERVE)).toBe(1);
  });

  it('is a floor on the drain and never a gate on it', () => {
    // A *gate* would refuse to hire at all until some threshold was cleared.
    // This hires whatever the margin above the reserve affords, however thin —
    // one month over, one month hired. The distinction is the one
    // `economy-flow-models.md` §3.4 draws, and it is why the verb stays payable
    // rather than the hire becoming a switch.
    expect(hireableMonths(100, 41, RESERVE)).toBe(0);
    expect(hireableMonths(100, 48, RESERVE)).toBe(2);
    expect(hireableMonths(100, 1_000_000, RESERVE)).toBe(100);
  });

  it('behaves exactly as it always did when no reserve is declared', () => {
    // The compatibility arm, and the positive control on the whole field: every
    // world written before this floor supplies no reserve, and must drain to
    // zero precisely as it did. An absent reserve and a zero reserve are the
    // same universe.
    expect(hireableMonths(100, 100, { laborPerMonth: 4 })).toBe(25);
    expect(hireableMonths(100, 100, { laborPerMonth: 4, reserve: 0 })).toBe(25);
    expect(hireableMonths(100, 3, { laborPerMonth: 4 })).toBe(0);
  });

  it('reads the reserve off the funding verb rather than off a second constant', () => {
    // `readHiredLabourWeights` takes the price as an argument because the
    // composition root reads it out of `god-cost.json`. A second authored
    // constant could disagree with the price it exists to protect, and would go
    // stale the first time anybody retuned the verb.
    expect(readHiredLabourWeights(shippedRegistry(), 4096).reserve).toBe(4096);
    // Defaulted, and clamped: an absent price is no floor, and a negative one
    // is not a floor either.
    expect(readHiredLabourWeights(shippedRegistry()).reserve).toBe(0);
    expect(readHiredLabourWeights(shippedRegistry(), -10).reserve).toBe(0);
  });

  it('holds the reserved labor in the stock rather than destroying it', () => {
    // Conservation. A floor that consumed what it held back would read as a
    // leak to the ledger, and the whole point of choosing a floor over a gate
    // is that nothing leaves the stock.
    expect(spendableLabor(100, RESERVE)).toBe(60);
    expect(spendableLabor(40, RESERVE)).toBe(0);
    expect(spendableLabor(10, RESERVE)).toBe(0);
    expect(spendableLabor(-5, RESERVE)).toBe(0);
  });
});

describe('an inflow over the ceiling spills, and the spill is recorded', () => {
  it('leaves an ordinary stock exactly alone', () => {
    // The positive control. A ceiling that clamped something it should not
    // would be a balance change nobody authored, and the assertion that it does
    // not fire is the half a spill test cannot supply for itself.
    const ordinary = { ...zeroAmounts(), food: 1_000_000, stone: 4_400_000, vellum: 12 };
    const outcome = applyStockCeiling(ordinary);
    expect(outcome.stock).toEqual(ordinary);
    expect(outcome.spilled).toEqual(zeroAmounts());
    expect(outcome.anySpill).toBe(false);
  });

  it('stops at the ceiling and hands back exactly what did not fit', () => {
    const over = { ...zeroAmounts(), stone: MATERIAL_STOCK_CEILING + 500 };
    const outcome = applyStockCeiling(over);
    expect(outcome.stock.stone).toBe(MATERIAL_STOCK_CEILING);
    expect(outcome.spilled.stone).toBe(500);
    expect(outcome.anySpill).toBe(true);
    // Conservation, stated as the arithmetic group 6's ledger will assert:
    // what went in is what is held plus what spilled. A truncation would leave
    // the two sides 500 apart with nothing saying so.
    expect(outcome.stock.stone + outcome.spilled.stone).toBe(over.stone);
  });

  it('spills per kind, so one overflowing stock does not clamp the others', () => {
    const over = {
      ...zeroAmounts(),
      insight: MATERIAL_STOCK_CEILING + 7,
      passage: MATERIAL_STOCK_CEILING,
      food: 5,
    };
    const outcome = applyStockCeiling(over);
    expect(outcome.spilled.insight).toBe(7);
    // Exactly at the ceiling is not over it.
    expect(outcome.spilled.passage).toBe(0);
    expect(outcome.stock.passage).toBe(MATERIAL_STOCK_CEILING);
    expect(outcome.stock.food).toBe(5);
    for (const kind of MATERIAL_KINDS) {
      if (kind === 'insight') continue;
      expect(outcome.spilled[kind], `spilled ${kind}`).toBe(0);
    }
  });
});

describe('the insight subsidy is capped once, with everything else on teach-rate', () => {
  const teachRate = primitiveNamed('teach-rate');

  /** One array, one `stackMagnitudes` — the shape `world-step.ts` builds. */
  function multiplier(...magnitudes: number[]): number {
    return stackMagnitudes(teachRate, magnitudes).value;
  }

  it('adds the subsidy into the same sum as the god blessing and the mage knowledge', () => {
    // `(1 + Σ)`. Three sources of `teach-rate` — a god's blessing, a scholar's
    // own node, and `material-economy`'s insight subsidy — sum before the
    // multiplier is taken, which is why the third is a magnitude rather than a
    // factor.
    const god = 512;
    const known = 256;
    const subsidy = insightTeachingBonus(FP_ONE, TEACHING);
    expect(multiplier(god, known, subsidy)).toBe(multiplier(god + known + subsidy));
  });

  it('adds nothing at all to an already-saturated rate, which is the whole condition', () => {
    // **`material-economy` precondition 0.4, made checkable.** Its verdict —
    // that `insight` does not double-count `encourage-research` — holds *only*
    // if the subsidy joins the existing array under its one cap. If it were a
    // second multiplier applied after `stackMagnitudes`, a saturated universe
    // would still get more from it, and this assertion is the one that would
    // fail.
    //
    // `mages-and-species/design.md`: *"two caps on the same quantity is how a
    // rate ends up at 4.0 × 2.0 without anyone deciding it should be 8.0."*
    const saturated = multiplier(1_000_000);
    expect(multiplier(1_000_000, insightTeachingBonus(FP_ONE, TEACHING))).toBe(saturated);
    expect(saturated).toBe(teachRate.cap.value);
  });
});
