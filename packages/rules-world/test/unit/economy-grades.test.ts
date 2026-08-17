/*
 * Multiverse Mages — the grade ladder: one step, never two, and a gate that
 * destroys only what it pays for.
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

import { describe, expect, it } from 'vitest';

import type { GradeEdgeRecord } from '@mm/content';
import { loadContent, shippedContentSource } from '@mm/content';
import { FP_ONE, mul } from '@mm/sim-core';

import type { ActiveDemand, GradedStock } from '../../src/index.js';
import {
  NO_GRADED_STOCK,
  demandKey,
  gradedColumn,
  metDemands,
  rawRefiningDemand,
  settleGrades,
} from '../../src/index.js';

/**
 * ## What this file is defending
 *
 * `mt-turn-the-poor-ore`'s gloss is the specification: *"Change worthless rock
 * into ore that is merely bad. Never into good ore: the working improves a
 * thing by one step and has never once been made to take two."*
 *
 * Every negative assertion below is paired with a positive control that makes
 * the same call succeed. `CLAUDE.md` records a RED test that passed because
 * `undefined === 0` is false, an ablation that was a null by construction, and
 * a metric that could only ever read zero: an assertion that *nothing happened*
 * is worthless until the same machinery has been shown to make something
 * happen.
 */

/** The two rungs as shipped, read from content rather than restated here. */
const shipped = loadContent(shippedContentSource());
const SHIPPED_EDGES: readonly GradeEdgeRecord[] = shipped.gradeEdges.map((entry) => entry.record);
const GROUND = SHIPPED_EDGES.find((edge) => edge.fromGrade === 0) as GradeEdgeRecord;
const UPPER = SHIPPED_EDGES.find((edge) => edge.fromGrade === 1) as GradeEdgeRecord;

function holding(stoneWorked: number, stoneFine = 0): GradedStock {
  return { stoneWorked, stoneFine };
}

function demand(grade: number, amountPerTick: number, nodeId = 1, effectIndex = 0): ActiveDemand {
  return { nodeId, effectIndex, requires: { kind: 'stone', grade, amountPerTick } };
}

describe('the shipped content really is a two-rung ladder, so the rest of this file is not vacuous', () => {
  it('reads exactly one ground rung and one rung above it, both on stone', () => {
    expect(SHIPPED_EDGES).toHaveLength(2);
    expect(GROUND).toBeDefined();
    expect(UPPER).toBeDefined();
    expect(GROUND.node).toBe('mt-turn-the-poor-ore');
    expect(UPPER.node).toBe('mn-call-it-iron-until-it-is');
    expect([GROUND.kind, UPPER.kind]).toEqual(['stone', 'stone']);
  });

  it('authors every rung as exactly one step, which is the gloss', () => {
    for (const edge of SHIPPED_EDGES) expect(edge.toGrade).toBe(edge.fromGrade + 1);
  });

  it('gives the rung whose gloss states no loss a lossless ratio, and the other one a rate', () => {
    // "the working improves a thing by one step" — no loss is mentioned, so the
    // whole cost of the rung is the raw stone it draws.
    expect(GROUND.ratio).toBe(FP_ONE);
    expect(mul(GROUND.inputPerTick, GROUND.ratio)).toBe(GROUND.inputPerTick);
    // "it becomes iron at roughly the rate the claim goes unchallenged" — a
    // rate, so below one.
    expect(UPPER.ratio).toBeLessThan(FP_ONE);
  });
});

describe('a working improves a thing by exactly one step', () => {
  it('turns paid-for rock into the grade above it', () => {
    const settled = settleGrades(NO_GRADED_STOCK, [GROUND], [], GROUND.inputPerTick);

    expect(settled.closing.stoneWorked).toBe(mul(GROUND.inputPerTick, GROUND.ratio));
    expect(settled.rawConsumed).toBe(GROUND.inputPerTick);
  });

  it('cannot take two steps in one tick, even with both rungs known and paid', () => {
    // The arm that matters. Both rungs are active, the ground rung is paid in
    // full, and the universe starts with nothing refined — so the *only* ore in
    // existence this tick is the ore the ground rung just made. If the rungs
    // fired in ascending order that ore would climb again immediately and a
    // unit of worthless rock would reach iron in one tick through two legal
    // one-step workings. `settleGrades` fires them descending for exactly this.
    const settled = settleGrades(NO_GRADED_STOCK, [GROUND, UPPER], [], GROUND.inputPerTick);

    expect(settled.closing.stoneWorked).toBe(mul(GROUND.inputPerTick, GROUND.ratio));
    expect(settled.closing.stoneFine).toBe(0);
  });

  it('POSITIVE CONTROL: the second rung does fire, one tick later', () => {
    // Without this, the zero above would be equally consistent with a rung that
    // never works at all — which is the shape of every dead mechanism this
    // campaign has found.
    const first = settleGrades(NO_GRADED_STOCK, [GROUND, UPPER], [], GROUND.inputPerTick);
    const second = settleGrades(first.closing, [GROUND, UPPER], [], GROUND.inputPerTick);

    expect(second.closing.stoneFine).toBeGreaterThan(0);
    expect(second.closing.stoneFine).toBe(
      mul(Math.min(UPPER.inputPerTick, first.closing.stoneWorked), UPPER.ratio),
    );
  });

  it('POSITIVE CONTROL: ordering is what produces the zero, not an inert rung', () => {
    // Same call, same rungs, the only difference being that the ore is already
    // on hand rather than made this tick. If `stoneFine` moved here and not
    // above, the one-step rule is the thing being tested.
    const preloaded = settleGrades(holding(UPPER.inputPerTick), [GROUND, UPPER], [], 0);
    expect(preloaded.closing.stoneFine).toBeGreaterThan(0);
  });
});

describe('a one-step working on a top-grade thing does nothing', () => {
  it('leaves a holding that is already at the top of the ladder alone', () => {
    // Nothing in the content authors a rung out of grade 2 — `mt-turn-the-poor-ore`
    // says *"Never into good ore"* and nothing goes above good — so a universe
    // holding only iron has nowhere to climb to.
    const top = holding(0, 4096);
    const settled = settleGrades(top, SHIPPED_EDGES, [], 0);

    expect(settled.closing.stoneFine).toBe(4096);
    expect(settled.closing.stoneWorked).toBe(0);
    expect(settled.convertedAway).toBe(0);
  });

  it('POSITIVE CONTROL: the same call on a mid-grade holding does move', () => {
    const middle = holding(4096, 0);
    const settled = settleGrades(middle, SHIPPED_EDGES, [], 0);

    expect(settled.closing.stoneWorked).toBeLessThan(4096);
    expect(settled.closing.stoneFine).toBeGreaterThan(0);
  });

  it('does nothing at all to a universe with nothing and no payment', () => {
    const settled = settleGrades(NO_GRADED_STOCK, SHIPPED_EDGES, [], 0);
    expect(settled.closing).toEqual(NO_GRADED_STOCK);
    expect(settled.rawConsumed).toBe(0);
    expect(settled.convertedAway).toBe(0);
  });
});

describe('a rung that loses says how much, and one that does not loses nothing', () => {
  it('preserves every unit across the lossless rung', () => {
    const settled = settleGrades(NO_GRADED_STOCK, [GROUND], [], GROUND.inputPerTick);
    expect(settled.closing.stoneWorked).toBe(GROUND.inputPerTick);
    expect(settled.convertedAway).toBe(0);
  });

  it('records what the rate rung burned rather than dropping it', () => {
    const drawn = UPPER.inputPerTick;
    const settled = settleGrades(holding(drawn), [UPPER], [], 0);

    expect(settled.closing.stoneFine).toBe(mul(drawn, UPPER.ratio));
    expect(settled.convertedAway).toBe(drawn - mul(drawn, UPPER.ratio));
    expect(settled.convertedAway).toBeGreaterThan(0);
  });

  it('never draws more of a grade than is held', () => {
    const scarce = Math.floor(UPPER.inputPerTick / 4);
    const settled = settleGrades(holding(scarce), [UPPER], [], 0);

    expect(settled.closing.stoneWorked).toBe(0);
    expect(settled.closing.stoneFine).toBe(mul(scarce, UPPER.ratio));
  });
});

describe('a demand is a gate, not a drain', () => {
  it('is met, and eats what it was priced at, when the holding covers it', () => {
    const outcome = metDemands(holding(0, 512), [demand(2, 128)]);

    expect(outcome.met.has(demandKey(1, 0))).toBe(true);
    expect(outcome.remaining.stoneFine).toBe(512 - 128);
  });

  it('is refused and destroys nothing when the holding is short', () => {
    const outcome = metDemands(holding(0, 64), [demand(2, 128)]);

    expect(outcome.met.size).toBe(0);
    // The gate leaks nothing: an idle furnace does not eat the ore it could not
    // run on. `economy-flow-models.md` §1.1 — "a gate accumulates nothing either
    // but destroys only as a side effect."
    expect(outcome.remaining.stoneFine).toBe(64);
  });

  it('POSITIVE CONTROL: one more unit and the same demand is met', () => {
    // The boundary, from both sides, so "refused" above is about the amount and
    // not about a demand that can never be met.
    expect(metDemands(holding(0, 127), [demand(2, 128)]).met.size).toBe(0);
    expect(metDemands(holding(0, 128), [demand(2, 128)]).met.size).toBe(1);
  });

  it('will not pay two demands out of one holding', () => {
    const outcome = metDemands(holding(0, 128), [demand(2, 128, 1), demand(2, 128, 2)]);

    expect(outcome.met.has(demandKey(1, 0))).toBe(true);
    expect(outcome.met.has(demandKey(2, 0))).toBe(false);
    expect(outcome.remaining.stoneFine).toBe(0);
  });

  it('keeps two effects of one node distinct', () => {
    // `cig-the-standing-furnace` declares two effects and only one is gated.
    // Without `effectIndex` in the key they would collapse into one demand.
    const outcome = metDemands(holding(256, 0), [demand(1, 128, 9, 0), demand(1, 128, 9, 1)]);

    expect(outcome.met.has(demandKey(9, 0))).toBe(true);
    expect(outcome.met.has(demandKey(9, 1))).toBe(true);
    expect(outcome.met.size).toBe(2);
  });

  it('charges the demand before a rung can spend the same material', () => {
    // Both want grade 1 out of one holding. The demand is paid first because
    // the phase-1 gate read the opening holding, so a rung that got there first
    // would let a furnace contribute on ore that had already become iron.
    const settled = settleGrades(holding(UPPER.inputPerTick), [UPPER], [demand(1, UPPER.inputPerTick)], 0);

    expect(settled.met.size).toBe(1);
    expect(settled.closing.stoneWorked).toBe(0);
    expect(settled.closing.stoneFine).toBe(0);
  });
});

describe('what the ladder asks of the raw stock', () => {
  it('asks only for the ground rungs, because nothing above grade 0 comes out of the stock', () => {
    expect(rawRefiningDemand([GROUND])).toBe(GROUND.inputPerTick);
    expect(rawRefiningDemand([UPPER])).toBe(0);
    expect(rawRefiningDemand(SHIPPED_EDGES)).toBe(GROUND.inputPerTick);
    expect(rawRefiningDemand([])).toBe(0);
  });

  it('refines only what the consumption order actually paid', () => {
    const half = Math.floor(GROUND.inputPerTick / 2);
    const settled = settleGrades(NO_GRADED_STOCK, [GROUND], [], half);

    expect(settled.rawConsumed).toBe(half);
    expect(settled.closing.stoneWorked).toBe(mul(half, GROUND.ratio));
  });

  it('cannot refine more than it was paid, however much it asked for', () => {
    const settled = settleGrades(NO_GRADED_STOCK, [GROUND], [], GROUND.inputPerTick * 10);
    expect(settled.rawConsumed).toBe(GROUND.inputPerTick);
  });

  it('splits a partial payment between rungs in proportion to what each asked', () => {
    // Two ground rungs, one asking twice what the other does, paid half of the
    // total. Apportionment matters because "whichever the content author wrote
    // first gets paid" is a rule nobody chose.
    const small: GradeEdgeRecord = { ...GROUND, id: 'ge-small', inputPerTick: 100 };
    const large: GradeEdgeRecord = { ...GROUND, id: 'ge-large', inputPerTick: 200 };
    const settled = settleGrades(NO_GRADED_STOCK, [small, large], [], 150);

    // 150 paid against 300 asked: 50 to the small rung, 100 to the large.
    expect(settled.rawConsumed).toBe(150);
    expect(settled.closing.stoneWorked).toBe(mul(50, GROUND.ratio) + mul(100, GROUND.ratio));
  });
});

describe('the column map answers about pairs the schema carries and no others', () => {
  it('names a column for every pair a shipped rung produces', () => {
    for (const edge of SHIPPED_EDGES) {
      expect(gradedColumn(edge.kind, edge.toGrade)).toBeDefined();
    }
  });

  it('has no column for grade 0, which is the raw stock and lives elsewhere', () => {
    expect(gradedColumn('stone', 0)).toBeUndefined();
  });

  it('has no column for a kind with no ladder, or a grade above the top', () => {
    expect(gradedColumn('food', 1)).toBeUndefined();
    expect(gradedColumn('vellum', 1)).toBeUndefined();
    expect(gradedColumn('stone', 3)).toBeUndefined();
  });
});
