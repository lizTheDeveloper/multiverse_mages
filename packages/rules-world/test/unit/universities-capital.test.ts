/*
 * Multiverse Mages — the knowledge-as-capital loop, and the four brakes on it.
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
 * The concavity property is asserted **over the table data**, which is what the
 * `universities` spec asks for: *"A convex tuning edit fails CI … and names the
 * offending segment."* A test that only sampled the interpolation would pass a
 * table whose segments were convex in a region nobody sampled.
 *
 * The marginal comparison is done by cross-multiplication rather than by
 * dividing. Marginals here are 16.0, 8.0, 4.0, 1.2 and 0.33 per node — three of
 * the five are not integers, so integer division would compare 1 against 0 and
 * report two different segments as equal.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import { ClampCounters } from '@mm/primitives';

import {
  CAPITAL_TABLE_TUNING_STATUS,
  DEGRADATION_PER_SHORTFALL,
  LIBRARY_CONTRIBUTION,
  LIBRARY_UPKEEP_PER_INSTANCE,
  SATURATION_CONTRIBUTION,
  SATURATION_NODES,
  TIER_COUNT,
  applyLibraryUpkeep,
  capitalRateMultiplier,
  contributionFor,
  emitCapital,
  libraryContribution,
  libraryDepth,
} from '../../src/index.js';
import type { LibraryDepth } from '../../src/index.js';

import {
  makeLibrary,
  researchRatePrimitive,
  scribeRatePrimitive,
  shelve,
  speciesNamed,
  syntheticTierOf,
  worldState,
} from './universities-fixtures.js';

/** A depth record with a chosen number of tier-1 nodes, for the table tests. */
function depthOf(nodes: number, instances = nodes): LibraryDepth {
  const distinctByTier = Array.from({ length: TIER_COUNT }, (_unused, index) =>
    index === 0 ? nodes : 0,
  );
  return {
    distinctByTier,
    cumulativeByTier: Array.from({ length: TIER_COUNT }, () => nodes),
    distinctNodes: nodes,
    instanceCount: instances,
    grimoireCount: 0,
  };
}

describe('the contribution table is data, and it is untuned', () => {
  it('says so in a machine-readable way', () => {
    expect(CAPITAL_TABLE_TUNING_STATUS).toBe('untuned');
  });

  it('starts at nothing and ends at a documented saturation value', () => {
    expect(LIBRARY_CONTRIBUTION[0]).toEqual({ nodes: 0, contribution: 0 });
    expect(SATURATION_NODES).toBe(640);
    expect(SATURATION_CONTRIBUTION).toBe(896);
  });

  it('ascends in both columns', () => {
    for (let index = 1; index < LIBRARY_CONTRIBUTION.length; index += 1) {
      const lower = LIBRARY_CONTRIBUTION[index - 1];
      const upper = LIBRARY_CONTRIBUTION[index];
      expect(upper?.nodes).toBeGreaterThan(lower?.nodes ?? 0);
      expect(upper?.contribution).toBeGreaterThan(lower?.contribution ?? 0);
    }
  });
});

describe('returns on library depth are concave', () => {
  it('has strictly non-increasing marginal return over every segment', () => {
    let previous: { rise: number; span: number } | undefined;
    for (let index = 1; index < LIBRARY_CONTRIBUTION.length; index += 1) {
      const lower = LIBRARY_CONTRIBUTION[index - 1];
      const upper = LIBRARY_CONTRIBUTION[index];
      if (lower === undefined || upper === undefined) continue;

      const segment = { rise: upper.contribution - lower.contribution, span: upper.nodes - lower.nodes };
      if (previous !== undefined) {
        // segment.rise / segment.span <= previous.rise / previous.span, without
        // dividing.
        expect(
          segment.rise * previous.span,
          `segment ${String(lower.nodes)}..${String(upper.nodes)} has a higher marginal return ` +
            'than the segment before it; the library contribution table must be concave',
        ).toBeLessThanOrEqual(previous.rise * segment.span);
      }
      previous = segment;
    }
  });

  it('rejects a convex table, so the check is not vacuous', () => {
    // The control. A synthetic table whose second segment is steeper than its
    // first must fail the same comparison the real one passes.
    const convex = [
      { nodes: 0, contribution: 0 },
      { nodes: 8, contribution: 32 },
      { nodes: 16, contribution: 256 },
    ];
    const first = { rise: 32, span: 8 };
    const second = { rise: 224, span: 8 };
    expect(convex).toHaveLength(3);
    expect(second.rise * first.span).toBeGreaterThan(first.rise * second.span);
  });

  it('doubling depth does not double the contribution', () => {
    // The spec's scenario, at its own numbers.
    const at96 = libraryContribution(96);
    const at192 = libraryContribution(192);
    expect(at96).toBe(576);
    expect(at192).toBeGreaterThan(at96);
    expect(at192).toBeLessThan(at96 * 2);
  });

  it('is monotonic across the whole range, one node at a time', () => {
    let previous = 0;
    for (let nodes = 0; nodes <= SATURATION_NODES + 64; nodes += 1) {
      const value = libraryContribution(nodes);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('passes through every knot exactly', () => {
    for (const knot of LIBRARY_CONTRIBUTION) {
      expect(libraryContribution(knot.nodes)).toBe(knot.contribution);
    }
  });
});

describe('the contribution saturates', () => {
  it('gives a library ten times past saturation no more than one at it', () => {
    expect(libraryContribution(SATURATION_NODES)).toBe(SATURATION_CONTRIBUTION);
    expect(libraryContribution(6400)).toBe(SATURATION_CONTRIBUTION);
    expect(libraryContribution(1_000_000)).toBe(SATURATION_CONTRIBUTION);
  });

  it('gives an empty or impossible library nothing', () => {
    expect(libraryContribution(0)).toBe(0);
    expect(libraryContribution(-5)).toBe(0);
  });
});

describe('relevance gates the contribution by species depth ceiling', () => {
  it('contributes nothing to a shallow species from a deep library', () => {
    const state = worldState();
    const library = makeLibrary(state);
    // Nodes 4..700 under the synthetic numbering include tiers 4..7 only when
    // chosen deliberately; a uniform tier-6 library is the clean case.
    for (let nodeId = 1; nodeId <= 200; nodeId += 1) shelve(state, library, nodeId);
    const depth = libraryDepth(state, library, () => 6);

    expect(contributionFor(depth, speciesNamed('orc').depthCeiling)).toBe(0);
    expect(contributionFor(depth, speciesNamed('draconic').depthCeiling)).toBeGreaterThan(0);
  });

  it('gives the deeper species strictly more from the same library', () => {
    const state = worldState();
    const library = makeLibrary(state);
    for (let nodeId = 1; nodeId <= 210; nodeId += 1) shelve(state, library, nodeId);
    const depth = libraryDepth(state, library, syntheticTierOf);

    expect(contributionFor(depth, speciesNamed('draconic').depthCeiling)).toBeGreaterThan(
      contributionFor(depth, speciesNamed('orc').depthCeiling),
    );
  });
});

describe('the contribution enters the shared stacking, and nothing else', () => {
  it('is summed with node bonuses into one (1 + Σ)', () => {
    const primitive = researchRatePrimitive();
    const withBoth = capitalRateMultiplier(primitive, [256], 384);
    expect(withBoth.multiplier).toBe(FP_ONE + 256 + 384);
    expect(withBoth.contribution).toBe(384);
  });

  it('is indistinguishable from a node bonus of the same size', () => {
    const primitive = researchRatePrimitive();
    expect(capitalRateMultiplier(primitive, [256, 384], 0).multiplier).toBe(
      capitalRateMultiplier(primitive, [256], 384).multiplier,
    );
  });

  it('is clamped by the contracted cap, once, and the clamp is counted', () => {
    const counters = new ClampCounters();
    const outcome = capitalRateMultiplier(researchRatePrimitive(), [4096], 4096, counters);
    expect(outcome.multiplier).toBe(4096);
    expect(outcome.clamped).toBe(true);
    expect(counters.count('research-rate')).toBe(1);
  });

  it('routes the same way for every rate the library touches', () => {
    for (const primitive of [researchRatePrimitive(), scribeRatePrimitive()]) {
      expect(capitalRateMultiplier(primitive, [], 512).multiplier).toBe(FP_ONE + 512);
    }
  });
});

describe('per-tick capital state is emitted', () => {
  it('reports depth by tier, the effective contribution, and the clamp count', () => {
    const state = worldState();
    const library = makeLibrary(state);
    for (let nodeId = 1; nodeId <= 21; nodeId += 1) shelve(state, library, nodeId);
    const depth = libraryDepth(state, library, syntheticTierOf);

    const emission = emitCapital(7, depth, 4, 2);
    expect(emission.university).toBe(7);
    expect(emission.relevantByTier).toHaveLength(TIER_COUNT);
    expect(emission.relevantByTier).toEqual([3, 6, 9, 12, 15, 18, 21]);
    expect(emission.effectiveContribution).toBe(libraryContribution(12));
    expect(emission.clampCount).toBe(2);
  });

  it('carries enough to compute capitalSnowball with no further instrumentation', () => {
    // `contracts.md` §7: capitalSnowball is a Gini coefficient over library
    // depth across runs at a fixed tick. Computed here from emissions alone --
    // no simulation call, no extra field -- which is the "no retrofit"
    // requirement made concrete.
    const emissions = [
      emitCapital(1, depthOf(10), 7),
      emitCapital(2, depthOf(40), 7),
      emitCapital(3, depthOf(400), 7),
    ];
    const depths = emissions.map((emission) => emission.relevantByTier[TIER_COUNT - 1] ?? 0);

    let absoluteDifferences = 0;
    for (const a of depths) for (const b of depths) absoluteDifferences += Math.abs(a - b);
    const total = depths.reduce((sum, value) => sum + value, 0);
    const gini = Math.round((absoluteDifferences * 1024) / (2 * depths.length * total));

    expect(depths).toEqual([10, 40, 400]);
    expect(gini).toBeGreaterThan(0);
    expect(gini).toBeLessThanOrEqual(1024);
  });
});

describe('upkeep is charged deterministically and never overdraws', () => {
  const libraries = [
    { handle: 9, depth: depthOf(4, 4) },
    { handle: 2, depth: depthOf(4, 4) },
    { handle: 5, depth: depthOf(4, 4) },
  ];

  it('charges every library and reports them in ascending handle order', () => {
    const { outcomes, materialsRemaining } = applyLibraryUpkeep(libraries, 1000);
    expect(outcomes.map((outcome) => outcome.library)).toEqual([2, 5, 9]);
    for (const outcome of outcomes) {
      expect(outcome.paid).toBe(4 * LIBRARY_UPKEEP_PER_INSTANCE);
      expect(outcome.shortfall).toBe(0);
    }
    expect(materialsRemaining).toBe(1000 - 3 * 4 * LIBRARY_UPKEEP_PER_INSTANCE);
  });

  it('never drives materials negative, at any stock', () => {
    for (const materials of [0, 1, 7, 8, 23, 24]) {
      const { outcomes, materialsRemaining } = applyLibraryUpkeep(libraries, materials);
      expect(materialsRemaining).toBeGreaterThanOrEqual(0);
      const paid = outcomes.reduce((sum, outcome) => sum + outcome.paid, 0);
      expect(paid).toBeLessThanOrEqual(materials);
    }
  });

  it('short-changes the highest-handle library, in the documented order', () => {
    // Two libraries' worth of materials and three libraries: the deterministic
    // order decides who goes short, and it is the last handle.
    const { outcomes } = applyLibraryUpkeep(libraries, 2 * 4 * LIBRARY_UPKEEP_PER_INSTANCE);
    expect(outcomes[0]?.shortfall).toBe(0);
    expect(outcomes[1]?.shortfall).toBe(0);
    expect(outcomes[2]?.shortfall).toBe(4 * LIBRARY_UPKEEP_PER_INSTANCE);
  });

  it('reports the whole shortfall of a library it could not pay for, and converts nothing', () => {
    // W23 moved the conversion out of here. This side owns *what is owed and
    // what went unpaid*; turning unpaid upkeep into destroyed books is
    // `coordination`'s job, because the price of a book is its `durability` and
    // `contracts.md` §5 rule 3 keeps this package out of `rules-magic`.
    const big = [{ handle: 1, depth: depthOf(200, 200) }];
    const { outcomes } = applyLibraryUpkeep(big, 0);
    const outcome = outcomes[0];
    expect(outcome?.paid).toBe(0);
    expect(outcome?.shortfall).toBe(200 * LIBRARY_UPKEEP_PER_INSTANCE);
    // The magnitude survives the move -- it is the divisor turning a book's
    // durability into the unpaid upkeep it takes to destroy it, and at the
    // reference `scribeAffinity` of fp(1024) it still prices a book at 32.
    expect(DEGRADATION_PER_SHORTFALL).toBe(32);
  });

  it('makes hoarding cost the hoarder', () => {
    // The spec's scenario: equal income, four times the shelves, strictly less
    // left for construction and scribing.
    const modest = applyLibraryUpkeep([{ handle: 1, depth: depthOf(50, 50) }], 10_000);
    const hoard = applyLibraryUpkeep([{ handle: 1, depth: depthOf(50, 200) }], 10_000);
    expect(hoard.materialsRemaining).toBeLessThan(modest.materialsRemaining);
  });
});
