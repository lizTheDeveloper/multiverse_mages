/*
 * Multiverse Mages — the institution conjunct: the one thing in either
 * ascension path that a ruleset edit cannot produce.
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
 * W6 closed *"doing nothing wins"* and the measurement agrees it stayed closed:
 * on this tree `passive-control` never leaves `ascensionPath = none` and
 * `idle-then-declare` — a probe that plays nothing and declares the instant the
 * mask opens — ascends 0 of 40 in every committed arm. What replaced that defect
 * is one step away from it. At n=400, `permit-then-idle` presses
 * `permitTechnique` and `permitForm` for 140 of 2400 ticks, submits an **empty**
 * preference list for the remaining 2260, and wins **40 of 40** — beating
 * `permissive-breadth`'s 38 of 40, which does all of that *and* funds, dispenses
 * and encourages.
 *
 * So every conjunct W6 added reads what the god **permitted**, not what the
 * universe **achieved**: a permitted cell is driven to its floor by mages acting
 * on their own, and the canon grows to whatever the ruleset allows. Raising
 * `ascension-summit-cells` or `ascension-canon-breadth` moves the tick that
 * clock strikes and nothing else, which is why this change adds a conjunct
 * rather than turning a knob.
 *
 * ## Why universities, and why this is an anchor rather than a threshold
 *
 * `packages/scenario/src/reference-universe.ts` seeds exactly **one** completed
 * academy, the world loop founds no site of its own, and `foundUniversity` is
 * the only thing in the build that creates one. A second completed university is
 * therefore a fact about what the god bought, *by construction of the scenario*
 * — not a number calibrated against some strategy's score, which is the trap two
 * earlier proposals both named: the passive baseline **is** a strategy's summit,
 * so anchoring to it reproduces the defect with a larger constant.
 *
 * That construction finishes on its own since W29 is the shape of the conjunct
 * and not a hole in it. The god buys the site; the universe raises it; the count
 * lapses if the buildings do. Both paths recompute it — Path A every tick, Path
 * B at every era boundary of the run it counts — so it is a standing
 * requirement, not a purchase made once in the first century.
 *
 * ## The identity value
 *
 * `ascension-institutions = 0` recovers the predicate exactly as it shipped, for
 * the reason the five constants before it have identity values: a rule change
 * nobody can turn off is a rule change nobody can bisect, and the first question
 * asked of a moved balance number is *"was it this change or the tuning?"*
 */

import { describe, expect, it } from 'vitest';

import type { NodeCatalog } from '@mm/rules-magic';

import type { ApotheosisFacts, EraBoundaryFacts } from '../../src/index.js';
import { apotheosisSatisfied, deepestNodesByCell, eraBoundaryPassed } from '../../src/index.js';

import { constants } from './god-fixtures.js';

const C = constants();

/** Enough cells that Path A's own cell gate can be satisfied while it is tested. */
const CELLS = Math.max(C.ascensionSummitCells + 1, 2);

const CATALOG = {
  nodeCount: CELLS * 3,
  node(nodeId: number) {
    if (nodeId < 1 || nodeId > CELLS * 3) return undefined;
    return {
      nodeId,
      tier: ((nodeId - 1) % 3) + 1,
      prerequisites: [],
      researchCost: 1024,
      teachCost: 1024,
      scribeCost: 1024,
    };
  },
} as unknown as NodeCatalog;

const cellOf = (nodeId: number): number => Math.floor((nodeId - 1) / 3) + 1;
const DEEPEST = deepestNodesByCell(CATALOG, cellOf);

/** Path A with every *other* conjunct satisfied, so a failure names this one. */
function facts(overrides: Partial<ApotheosisFacts> = {}): ApotheosisFacts {
  const held = new Set<number>();
  for (let cell = 1; cell <= CELLS; cell += 1) held.add(DEEPEST.get(cell) as number);
  return {
    heldByLivingMage: held,
    instanceCount: () => C.ascensionSummitCopies,
    permitsCell: () => true,
    cellOf,
    deepest: DEEPEST,
    worshipTier: C.ascensionTierGate,
    completedUniversities: C.ascensionInstitutions,
    ...overrides,
  };
}

/** Path B with every *other* conjunct satisfied, for the same reason. */
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

describe('the shipped constant is above what the scenario hands out for free', () => {
  it('asks for more completed universities than the reference universe is seeded with', () => {
    // The seeded academy is one. If this constant is ever tuned to 1 or below,
    // the conjunct is satisfied by the starting position and the whole argument
    // above evaporates — silently, and while every other test still passes.
    expect(C.ascensionInstitutions).toBeGreaterThan(1);
  });
});

describe('Path A refuses a summit with no institution behind it', () => {
  it('holds when the universities are there', () => {
    expect(apotheosisSatisfied(facts(), C)).toBe(true);
  });

  it('refuses one university short, with every other conjunct untouched', () => {
    expect(apotheosisSatisfied(facts({ completedUniversities: C.ascensionInstitutions - 1 }), C)).toBe(
      false,
    );
  });

  it('refuses the seeded academy alone, which is what an idle universe has', () => {
    expect(apotheosisSatisfied(facts({ completedUniversities: 1 }), C)).toBe(false);
  });

  it('does not make the other conjuncts redundant — a mastered grid still loses without them', () => {
    // Institutions present, worship short. Both conjuncts must bind, or the
    // change has replaced a predicate rather than tightened one.
    expect(
      apotheosisSatisfied(
        facts({ completedUniversities: C.ascensionInstitutions + 10, worshipTier: C.ascensionTierGate - 1 }),
        C,
      ),
    ).toBe(false);
  });

  it('lapses when the buildings do, because it is recomputed and not banked', () => {
    const built = facts({ completedUniversities: C.ascensionInstitutions });
    const razed = facts({ completedUniversities: 0 });
    expect(apotheosisSatisfied(built, C)).toBe(true);
    expect(apotheosisSatisfied(razed, C)).toBe(false);
  });

  it('is off at the identity value, which is what makes the change bisectable', () => {
    const identity = { ...C, ascensionInstitutions: 0 };
    expect(apotheosisSatisfied(facts({ completedUniversities: 0 }), identity)).toBe(true);
  });
});

describe('Path B refuses an era boundary with no institution standing at it', () => {
  it('holds when the universities are there', () => {
    expect(eraBoundaryPassed(boundary(), C)).toBe(true);
  });

  it('refuses one university short, with the canon and the losses untouched', () => {
    expect(eraBoundaryPassed(boundary({ completedUniversities: C.ascensionInstitutions - 1 }), C)).toBe(
      false,
    );
  });

  it('refuses a perfectly kept canon that nobody built anywhere to keep it', () => {
    // This is the `permit-then-idle` profile at an era boundary: a large canon,
    // spread wide, nothing lost, dependence at zero — and one seeded academy.
    expect(
      eraBoundaryPassed(
        {
          nodesKnown: 258,
          cellsKnown: 70,
          dependence: 0,
          eraNodesLost: 0,
          completedUniversities: 1,
        },
        C,
      ),
    ).toBe(false);
  });

  it('is off at the identity value', () => {
    const identity = { ...C, ascensionInstitutions: 0 };
    expect(eraBoundaryPassed(boundary({ completedUniversities: 0 }), identity)).toBe(true);
  });
});
