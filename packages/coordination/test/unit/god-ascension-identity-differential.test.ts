/*
 * Multiverse Mages — W6 verification: the identity claim, checked differentially
 * against the predicates as they stood on `main`.
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
 * W6 claims each new ascension constant has an *identity value* at which the
 * predicate is exactly the pre-change one, and asserts it in
 * `god-ascension-achievement.test.ts` with two point-checks per path.
 *
 * Two points is not an identity. The claim is that two *functions* agree on
 * their whole domain, and the pre-change function does not appear anywhere in
 * the tree any more — so nothing in the suite compares them. These tests do:
 * the two `main` predicates are transcribed verbatim below from
 * `packages/coordination/src/god/ascension.ts` at `origin/main`, and the shipped
 * ones are driven against them over a randomised input space.
 *
 * A differential test is the right shape here because identity is what lets a
 * moved balance number be bisected between "the rule changed" and "the tuning
 * changed". If the two disagree anywhere, the bisection is unsound.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import type { NodeCatalog } from '@mm/rules-magic';

import type { ApotheosisFacts, EraBoundaryFacts, GodConstants } from '../../src/index.js';
import { apotheosisSatisfied, deepestNodesByCell, eraBoundaryPassed } from '../../src/index.js';

import { constants } from './god-fixtures.js';

const C = constants();

/** The identity setting W6 names, all five constants at once. */
const IDENTITY: GodConstants = {
  ...C,
  ascensionSummitCells: 1,
  ascensionSummitCopies: 2,
  ascensionCanonBreadth: 0,
  ascensionCanonCells: 0,
  ascensionLossFraction: 0,
};

// ---------------------------------------------------------------------------
// The predicates as they stood on origin/main, transcribed verbatim.
// ---------------------------------------------------------------------------

/** `apotheosisSatisfied` at `origin/main`. Note the literal 2. */
function apotheosisSatisfiedOnMain(facts: ApotheosisFacts, con: GodConstants): boolean {
  if (facts.worshipTier < con.ascensionTierGate) return false;
  for (const nodeId of facts.heldByLivingMage) {
    const cellId = facts.cellOf(nodeId);
    if (facts.deepest.get(cellId) !== nodeId) continue;
    if (!facts.permitsCell(cellId)) continue;
    if (facts.instanceCount(nodeId) < 2) continue;
    return true;
  }
  return false;
}

/** The era-boundary test at `origin/main`, which lived inline in `system.ts`. */
function eraBoundaryPassedOnMain(facts: EraBoundaryFacts, con: GodConstants): boolean {
  return facts.dependence <= con.ascensionDependenceMax && facts.eraNodesLost <= con.ascensionLossMax;
}

// ---------------------------------------------------------------------------
// A deterministic generator. No Math.random: a differential test that cannot be
// replayed is a differential test nobody can act on.
// ---------------------------------------------------------------------------

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const CELLS = 9;
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

describe('W6 verification — the identity values reproduce the pre-change predicates', () => {
  it('Path A agrees with main over 20000 randomised fact sets', () => {
    const rand = lcg(20_260_811);
    const disagreements: string[] = [];
    for (let trial = 0; trial < 20_000; trial += 1) {
      const held = new Set<number>();
      for (let nodeId = 1; nodeId <= CELLS * 3; nodeId += 1) {
        if (rand() < 0.35) held.add(nodeId);
      }
      // Per-node instance counts and per-cell permission, both varying, because
      // the two implementations iterate different collections: main walks the
      // held set and the shipped one walks the deepest-by-cell map.
      const counts = new Map<number, number>();
      for (let nodeId = 1; nodeId <= CELLS * 3; nodeId += 1) {
        counts.set(nodeId, Math.floor(rand() * 4));
      }
      const permitted = new Set<number>();
      for (let cell = 1; cell <= CELLS; cell += 1) if (rand() < 0.6) permitted.add(cell);
      const facts: ApotheosisFacts = {
        heldByLivingMage: held,
        instanceCount: (nodeId) => counts.get(nodeId) ?? 0,
        permitsCell: (cellId) => permitted.has(cellId),
        cellOf,
        deepest: DEEPEST,
        worshipTier: Math.floor(rand() * 6),
      };
      const shipped = apotheosisSatisfied(facts, IDENTITY);
      const onMain = apotheosisSatisfiedOnMain(facts, IDENTITY);
      if (shipped !== onMain) disagreements.push(`trial ${trial}: shipped=${shipped} main=${onMain}`);
    }
    expect(disagreements).toEqual([]);
  });

  it('Path B agrees with main over 20000 randomised boundaries', () => {
    const rand = lcg(76_543);
    const disagreements: string[] = [];
    for (let trial = 0; trial < 20_000; trial += 1) {
      const facts: EraBoundaryFacts = {
        nodesKnown: Math.floor(rand() * 300),
        cellsKnown: Math.floor(rand() * 70),
        dependence: Math.floor(rand() * FP_ONE),
        eraNodesLost: Math.floor(rand() * 12),
      };
      const shipped = eraBoundaryPassed(facts, IDENTITY);
      const onMain = eraBoundaryPassedOnMain(facts, IDENTITY);
      if (shipped !== onMain) {
        disagreements.push(
          `trial ${trial}: nodes=${facts.nodesKnown} cells=${facts.cellsKnown} ` +
            `dep=${facts.dependence} lost=${facts.eraNodesLost} shipped=${shipped} main=${onMain}`,
        );
      }
    }
    expect(disagreements).toEqual([]);
  });

  /**
   * The identity is *not* the shipped configuration, and this records the gap
   * rather than asserting it away: at the shipped values the two predicates
   * disagree constantly, which is the change doing its job. A reader who sees
   * only the two tests above could otherwise believe the change was inert.
   */
  it('and the SHIPPED constants are not the identity — Path A disagrees with main', () => {
    const held = new Set<number>([DEEPEST.get(1) as number]);
    const facts: ApotheosisFacts = {
      heldByLivingMage: held,
      instanceCount: () => 2,
      permitsCell: () => true,
      cellOf,
      deepest: DEEPEST,
      worshipTier: C.ascensionTierGate,
    };
    expect(apotheosisSatisfiedOnMain(facts, C)).toBe(true);
    expect(apotheosisSatisfied(facts, C)).toBe(false);
  });
});
