/*
 * Multiverse Mages — both ascension paths must read the presence of an
 * achievement, never the absence of a misfortune.
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
 * The defect these tests pin, stated as behaviour rather than as code.
 *
 * Measured over ~40 Monte Carlo sweeps: **both ascension paths were reachable
 * without playing.** Path A opened passively around tick 700 because worship
 * accrues from mages, universities and populace whether or not the god acts.
 * Path B opened passively around tick 1080 because its era test asked only that
 * nothing had gone wrong — a universe nobody touches loses no nodes and holds no
 * single-copy nodes, so *doing nothing was perfect custodianship*.
 *
 * The fix is not a tuning value, and a 2-D scan over the two authored knobs
 * proved it: the idle-then-declare probe won 100% of runs in every cell. Both
 * predicates now require a quantity that only play produces, and the tests below
 * are written so that each new conjunct is separately falsifiable.
 *
 * ## Why these predicates are generalisations and not replacements
 *
 * Every new constant has an *identity value* at which the predicate is exactly
 * what it was before this change: `ascension-summit-cells = 1`,
 * `ascension-summit-copies = 2`, `ascension-canon-breadth = 0`,
 * `ascension-canon-cells = 0`, `ascension-loss-fraction = 0`. That is asserted
 * here, because a rule change that cannot be turned off is a rule change nobody
 * can bisect, and the first question asked of a moved balance number is "was it
 * this change or the tuning?"
 *
 * ## No literal tier appears here either
 *
 * `ascension.ts` argues at length that a literal tier check would be unreachable
 * in v1 content and would need rewriting whenever content changed. Counting
 * *cells driven to their floor* keeps that property: it is relative to whatever
 * depth the loaded graph offers, and it grows only when the god opens more of
 * the grid.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import type { NodeCatalog } from '@mm/rules-magic';

import type { ApotheosisFacts, EraBoundaryFacts } from '../../src/index.js';
import {
  apotheosisSatisfied,
  deepestNodesByCell,
  eraBoundaryPassed,
  lossAllowance,
  masteredCellCount,
} from '../../src/index.js';

import { constants } from './god-fixtures.js';

const C = constants();

/**
 * A grid of `CELLS` cells of three nodes each, so "how many cells are at their
 * floor" is a number rather than a boolean wearing a count's clothes.
 *
 * Sized from the shipped gate plus two so that the fixture can stand both sides
 * of it. A fixed size would silently stop testing the gate the day the constant
 * is tuned past it — which is the failure mode a *balance* campaign is most
 * likely to introduce, since moving that constant is the whole point of the
 * tuner. Nodes are numbered in triples, and the deepest in each cell is the
 * third of its triple.
 */
const CELLS = Math.max(C.ascensionSummitCells + 2, 4);
const GRID: { catalog: NodeCatalog; cellOf: (nodeId: number) => number } = {
  catalog: {
    nodeCount: CELLS * 3,
    node(nodeId: number) {
      if (nodeId < 1 || nodeId > CELLS * 3) return undefined;
      const tier = ((nodeId - 1) % 3) + 1;
      return { nodeId, tier, prerequisites: [], researchCost: 1024, teachCost: 1024, scribeCost: 1024 };
    },
  } as unknown as NodeCatalog,
  cellOf: (nodeId: number) => Math.floor((nodeId - 1) / 3) + 1,
};

const DEEPEST = deepestNodesByCell(GRID.catalog, GRID.cellOf);

/** Path A's inputs with `mastered` cells at their floor, held with `copies` each. */
function facts(mastered: number, copies = 2, overrides: Partial<ApotheosisFacts> = {}): ApotheosisFacts {
  const held = new Set<number>();
  for (let cell = 1; cell <= mastered; cell += 1) held.add(DEEPEST.get(cell) as number);
  return {
    heldByLivingMage: held,
    instanceCount: () => copies,
    permitsCell: () => true,
    cellOf: GRID.cellOf,
    deepest: DEEPEST,
    worshipTier: C.ascensionTierGate,
    completedUniversities: C.ascensionInstitutions,
    ...overrides,
  };
}

/** An era boundary that passes, unless a test breaks one conjunct. */
function boundary(overrides: Partial<EraBoundaryFacts> = {}): EraBoundaryFacts {
  return {
    nodesKnown: C.ascensionCanonBreadth,
    cellsKnown: C.ascensionCanonCells,
    dependence: 0,
    eraNodesLost: 0,
    completedUniversities: C.ascensionInstitutions,
    ...overrides,
  };
}

describe('Path A counts cells driven to their floor, and the count is the achievement', () => {
  it('counts a cell only when a living mage holds its deepest node with enough copies', () => {
    expect(masteredCellCount(facts(3), C.ascensionSummitCopies)).toBe(3);
    expect(masteredCellCount(facts(0), C.ascensionSummitCopies)).toBe(0);
    expect(masteredCellCount(facts(CELLS), C.ascensionSummitCopies)).toBe(CELLS);
  });

  it('does not count a cell the ruleset has closed, however deeply it was mastered', () => {
    // A god that mastered four cells and then forbade two of them has two.
    const closed = facts(CELLS, 2, { permitsCell: (cellId: number) => cellId <= 2 });
    expect(masteredCellCount(closed, C.ascensionSummitCopies)).toBe(2);
  });

  it('does not count a cell whose summit survives in only one copy', () => {
    expect(masteredCellCount(facts(CELLS, 1), C.ascensionSummitCopies)).toBe(0);
  });

  it('refuses a universe that mastered fewer cells than the gate asks for', () => {
    expect(apotheosisSatisfied(facts(C.ascensionSummitCells - 1), C)).toBe(false);
    expect(apotheosisSatisfied(facts(C.ascensionSummitCells), C)).toBe(true);
  });

  it('still refuses below the worship-tier gate, whatever was mastered', () => {
    const unworshipped = facts(CELLS, 2, { worshipTier: C.ascensionTierGate - 1 });
    expect(apotheosisSatisfied(unworshipped, C)).toBe(false);
  });

  it('reduces to the pre-change predicate at the identity values', () => {
    // One mastered cell, two copies: exactly what Path A asked before this
    // change. Anything the old rule admitted, this admits at these constants.
    const identity = { ...C, ascensionSummitCells: 1, ascensionSummitCopies: 2 };
    expect(apotheosisSatisfied(facts(1), identity)).toBe(true);
    expect(apotheosisSatisfied(facts(1, 1), identity)).toBe(false);
  });
});

describe('Path B requires breadth held, not merely misfortune avoided', () => {
  it('passes a boundary that clears every conjunct', () => {
    expect(eraBoundaryPassed(boundary(), C)).toBe(true);
  });

  it('refuses a universe that lost nothing but knows too little', () => {
    // The measured defect, as a single assertion: zero losses, zero dependence,
    // and a canon the size of a universe nobody touched.
    const idle = boundary({ nodesKnown: C.ascensionCanonBreadth - 1 });
    expect(eraBoundaryPassed(idle, C)).toBe(false);
  });

  it('refuses a canon of the right size crammed into too few cells', () => {
    const narrow = boundary({ cellsKnown: C.ascensionCanonCells - 1 });
    expect(eraBoundaryPassed(narrow, C)).toBe(false);
  });

  it('still refuses a universe above the dependence ceiling', () => {
    expect(eraBoundaryPassed(boundary({ dependence: FP_ONE }), C)).toBe(false);
  });

  it('reduces to the pre-change predicate at the identity values', () => {
    const identity = {
      ...C,
      ascensionCanonBreadth: 0,
      ascensionCanonCells: 0,
      ascensionLossFraction: 0,
      ascensionInstitutions: 0,
    };
    const bare = { nodesKnown: 0, cellsKnown: 0, dependence: 0, completedUniversities: 0 };
    expect(eraBoundaryPassed({ ...bare, eraNodesLost: 0 }, identity)).toBe(true);
    expect(
      eraBoundaryPassed({ ...bare, eraNodesLost: identity.ascensionLossMax + 1 }, identity),
    ).toBe(false);
  });
});

describe('the loss allowance scales with the canon, because a flat cap measures size', () => {
  it('hands a small canon exactly the authored allowance', () => {
    // The fraction rounds to zero on a tiny canon, and the authored constant is
    // the floor so that a small custodian is not handed a free loss by rounding.
    expect(lossAllowance(1, C)).toBe(C.ascensionLossMax);
  });

  it('grows the allowance in proportion to what there is to lose', () => {
    const small = lossAllowance(100, C);
    const large = lossAllowance(400, C);
    expect(large).toBeGreaterThan(small);
    // Fixed point, floor division, integers only: no float may enter here.
    expect(Number.isInteger(large)).toBe(true);
    expect(large).toBe(Math.floor((400 * C.ascensionLossFraction) / FP_ONE));
  });

  it('lets a large canon survive a loss that would end a small one', () => {
    // Isolated from the breadth conjuncts on purpose: this asserts the *loss*
    // rule, and a small canon that also failed breadth would pass the assertion
    // for the wrong reason.
    const open = { ...C, ascensionCanonBreadth: 0, ascensionCanonCells: 0, ascensionInstitutions: 0 };
    const large = 40 * (FP_ONE / Math.max(open.ascensionLossFraction, 1)) * (open.ascensionLossMax + 1);
    const lost = open.ascensionLossMax + 1;
    expect(lossAllowance(large, open)).toBeGreaterThanOrEqual(lost);
    const held = { dependence: 0, eraNodesLost: lost, completedUniversities: 0 };
    expect(eraBoundaryPassed({ ...held, nodesKnown: large, cellsKnown: 1 }, open)).toBe(true);
    expect(eraBoundaryPassed({ ...held, nodesKnown: 1, cellsKnown: 1 }, open)).toBe(false);
  });

  it('never lets the allowance fall below the authored floor', () => {
    for (const known of [0, 1, 2, 5, 20, 51]) {
      expect(lossAllowance(known, C)).toBeGreaterThanOrEqual(C.ascensionLossMax);
    }
  });
});
