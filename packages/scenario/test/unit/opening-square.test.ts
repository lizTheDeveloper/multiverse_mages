/*
 * Multiverse Mages — the opening square: what a universe is founded holding.
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
 * Four claims, and the first two are the ones that could rot every committed
 * balance baseline without a test failing anywhere else.
 *
 * 1. **The default is today's universe, byte for byte.** A run that names no
 *    opening square must produce the identical snapshot hash to one built
 *    before the option existed. This is what makes the 3×4 arm of a size sweep
 *    a control rather than a re-implementation of one.
 * 2. **The draw is invisible to every other subsystem.** A seeded square and an
 *    explicitly-named copy of that same square must agree on the snapshot hash.
 *    They can only do so if drawing the square disturbed no mortality roll, no
 *    founding personality and no research draw — which is the whole point of
 *    `RNG_STREAM.openingSquare` having its own id.
 * 3. **Squares nest across sizes at one seed.** A 1×1 square must be contained
 *    in that seed's 2×2, and the 2×2 in the 3×3. Without this a size sweep
 *    varies position as well as size and cannot attribute either.
 * 4. **Membership goes through `permits()` and nothing else.** The cells a
 *    universe opens on are exactly the cells the one arbitration function says
 *    it opens on.
 */

import { RNG_STREAM, rngFromRootSeed, snapshotHash } from '@mm/sim-core';
import { GRID_CELL_COUNT, findUniverse, permits, readRulesetForObservation } from '@mm/state';
import {
  explicitOpeningAxes,
  foundingCandidates,
  referenceContent,
  referenceScenario,
  seededOpeningAxes,
  standardOpeningAxes,
  standardOpeningOrder,
  v1RulesetAxes,
} from '@mm/scenario';
import { describe, expect, it } from 'vitest';

const content = referenceContent();
const registry = content.registry;

/** A seed with no significance beyond being fixed. */
const SEED = 0x0007_0001;

const BASE = { cohortSize: 4, foundingNodes: 2 } as const;

function build(options: Record<string, number>, seed = SEED) {
  return referenceScenario(content).scenario.create(seed, {
    worldTickCap: 12,
    options: { ...BASE, ...options },
  });
}

/** The cell ids a built universe actually permits, read through `permits()`. */
function openCells(state: ReturnType<typeof build>): number[] {
  const ruleset = readRulesetForObservation(state, findUniverse(state));
  const open: number[] = [];
  for (let cellId = 1; cellId <= GRID_CELL_COUNT; cellId += 1) {
    if (permits(ruleset, cellId)) open.push(cellId);
  }
  return open;
}

/** The axis bits a mask holds, ascending. */
function bitsOf(mask: number): number[] {
  const bits: number[] = [];
  for (let bit = 0; bit < 32; bit += 1) if ((mask & (1 << bit)) !== 0) bits.push(bit);
  return bits;
}

/** The square a seed draws at a given size, off the opening-square stream alone. */
function drawSquare(seed: number, techniqueCount: number, formCount: number) {
  return seededOpeningAxes(
    registry,
    { techniqueCount, formCount },
    rngFromRootSeed(seed).stream(RNG_STREAM.openingSquare, 0),
  );
}

describe('the default opening is the v1 rectangle and nothing has moved', () => {
  it('opens exactly the cells content flags v1', () => {
    // Was twelve. `material-economy` opened the grid, so the default opening is
    // all seventy. The literal is kept rather than derived from the registry:
    // a count read back out of the thing under test cannot fail, and the point
    // of this assertion is that the default opening *is* the flagged set.
    expect(openCells(build({}))).toHaveLength(70);
  });

  it('is byte-identical to naming the counts as zero', () => {
    const implicit = snapshotHash(build({}));
    const explicit = snapshotHash(build({ openingTechniqueCount: 0, openingFormCount: 0 }));
    expect(explicit).toBe(implicit);
  });

  it('refuses a half-named square rather than opening a whole axis', () => {
    // A 2 × 14 opening is a legal square and almost certainly not what a sweep
    // file that wrote one number meant. Recorded as a 2×2 it would be a lie in
    // the run record, which is worse than a refusal.
    expect(() => build({ openingTechniqueCount: 2 })).toThrow(/one axis/i);
    expect(() => build({ openingFormCount: 2 })).toThrow(/one axis/i);
  });
});

describe('drawing the square disturbs no other subsystem', () => {
  it('agrees with an explicitly-named copy of the same square, hash for hash', () => {
    const axes = drawSquare(SEED, 2, 2);
    const techniqueIds = registry.techniques
      .filter((entry) => (axes.permittedTechniques & (1 << entry.record.bit)) !== 0)
      .map((entry) => entry.record.id);
    const formIds = registry.forms
      .filter((entry) => (axes.permittedForms & (1 << entry.record.bit)) !== 0)
      .map((entry) => entry.record.id);

    // The same square, reached the god's way rather than the harness's.
    const named = explicitOpeningAxes(registry, techniqueIds, formIds);
    expect(named).toEqual(axes);

    // And the universe built on it is the same universe. If the opening-square
    // draw shared a stream with anything else, these two would differ in their
    // founders while agreeing on their grid.
    // `openingSquareSeeded: 1` because the default answer to "who chooses" is
    // now the god; without it this builds the *standard* square and the two
    // sides of the comparison would be two different squares.
    const seeded = build({
      openingTechniqueCount: 2,
      openingFormCount: 2,
      openingSquareSeeded: 1,
    });
    const viaContent = referenceScenario({ ...content, axes: named, foundingNodeIds: foundingCandidates(registry, named) })
      .scenario.create(SEED, { worldTickCap: 12, options: { ...BASE } });
    expect(snapshotHash(viaContent)).toBe(snapshotHash(seeded));
  });

});

describe('squares nest across sizes at one seed', () => {
  it('contains the 1×1 in the 2×2 and the 2×2 in the 3×3', () => {
    for (const seed of [SEED, 0x1234_5678, 99]) {
      const one = drawSquare(seed, 1, 1);
      const two = drawSquare(seed, 2, 2);
      const three = drawSquare(seed, 3, 3);
      expect(one.permittedTechniques & two.permittedTechniques).toBe(one.permittedTechniques);
      expect(one.permittedForms & two.permittedForms).toBe(one.permittedForms);
      expect(two.permittedTechniques & three.permittedTechniques).toBe(two.permittedTechniques);
      expect(two.permittedForms & three.permittedForms).toBe(two.permittedForms);
    }
  });

  it('holds exactly as many axes as it was asked for', () => {
    for (const [t, f] of [
      [1, 1],
      [2, 2],
      [3, 3],
      [3, 4],
      [5, 14],
    ] as const) {
      const axes = drawSquare(SEED, t, f);
      expect(bitsOf(axes.permittedTechniques)).toHaveLength(t);
      expect(bitsOf(axes.permittedForms)).toHaveLength(f);
    }
  });

  it('refuses a square the grid cannot hold', () => {
    expect(() => drawSquare(SEED, 6, 2)).toThrow(/does not fit/);
    expect(() => drawSquare(SEED, 2, 15)).toThrow(/does not fit/);
  });

  it('at full size is the whole grid, which the v1 rectangle is a sub-square of', () => {
    const full = drawSquare(SEED, registry.techniques.length, registry.forms.length);
    const v1 = v1RulesetAxes(registry);
    expect(full.permittedTechniques & v1.permittedTechniques).toBe(v1.permittedTechniques);
    expect(full.permittedForms & v1.permittedForms).toBe(v1.permittedForms);
  });
});

describe('what a universe opens on is what permits() says it opens on', () => {
  it('opens technique count × form count cells, and no more', () => {
    for (const [t, f] of [
      [1, 1],
      [2, 2],
      [3, 3],
      [3, 4],
    ] as const) {
      const state = build({ openingTechniqueCount: t, openingFormCount: f });
      expect(openCells(state)).toHaveLength(t * f);
    }
  });

  it('deals founding grants only from inside the square', () => {
    const axes = drawSquare(SEED, 2, 2);
    const candidates = foundingCandidates(registry, axes);
    const openCellIds = new Set(
      registry.cells
        .filter((entry) => {
          const technique = registry.techniques.find((x) => x.record.id === entry.record.technique);
          const form = registry.forms.find((x) => x.record.id === entry.record.form);
          return (
            technique !== undefined &&
            form !== undefined &&
            (axes.permittedTechniques & (1 << technique.record.bit)) !== 0 &&
            (axes.permittedForms & (1 << form.record.bit)) !== 0
          );
        })
        .map((entry) => entry.record.id),
    );
    expect(candidates.length).toBeGreaterThan(0);
    for (const contentId of candidates) {
      const node = registry.nodes.find((entry) => entry.contentId === contentId);
      expect(node).toBeDefined();
      expect(openCellIds.has(node?.record.cell ?? '')).toBe(true);
    }
  });

  it('deals what exists when the square holds fewer roots than asked for', () => {
    // Every shipped cell holds exactly one prerequisite-free node, so a 1×1
    // square offers exactly one founding candidate however many are requested.
    // A refusal here would punch a hole in a paired seed grid; a thinly-founded
    // universe is data.
    const axes = drawSquare(SEED, 1, 1);
    expect(foundingCandidates(registry, axes)).toHaveLength(1);
    expect(() =>
      build({ openingTechniqueCount: 1, openingFormCount: 1, foundingNodes: 4 }),
    ).not.toThrow();
  });
});

/**
 * The god's square — the default since the opening was wired in.
 *
 * The claim that matters here is claim 1 from the module header restated at a
 * different size: **the standard opening at the v1 rectangle's own size is the
 * v1 rectangle**. If it ever stops being, the full-size arm of a size sweep
 * stops being a control and every comparison in that sweep silently acquires a
 * second difference.
 */
describe("the god's square is the default, and its full size is today's universe", () => {
  const v1TechniqueCount = new Set(
    registry.cells.filter((entry) => entry.record.v1 === true).map((entry) => entry.record.technique),
  ).size;
  const v1FormCount = new Set(
    registry.cells.filter((entry) => entry.record.v1 === true).map((entry) => entry.record.form),
  ).size;

  it('at the v1 rectangle size is the v1 rectangle, mask for mask', () => {
    expect(
      standardOpeningAxes(registry, {
        techniqueCount: v1TechniqueCount,
        formCount: v1FormCount,
      }),
    ).toEqual(v1RulesetAxes(registry));
  });

  it('at the v1 rectangle size builds the identical universe, hash for hash', () => {
    const named = build({
      openingTechniqueCount: v1TechniqueCount,
      openingFormCount: v1FormCount,
    });
    expect(snapshotHash(named)).toBe(snapshotHash(build({})));
  });

  it('is explicitOpeningAxes underneath — the play verb, not a second one', () => {
    const order = standardOpeningOrder(registry);
    expect(standardOpeningAxes(registry, { techniqueCount: 2, formCount: 3 })).toEqual(
      explicitOpeningAxes(registry, order.techniqueIds.slice(0, 2), order.formIds.slice(0, 3)),
    );
  });

  it('draws nothing, so two seeds open on the same square', () => {
    const one = build({ openingTechniqueCount: 2, openingFormCount: 2 }, SEED);
    const two = build({ openingTechniqueCount: 2, openingFormCount: 2 }, 0x5150_0001);
    expect(openCells(one)).toEqual(openCells(two));
  });

  it('nests, so a size sweep varies size alone', () => {
    const smaller = standardOpeningAxes(registry, { techniqueCount: 1, formCount: 2 });
    const larger = standardOpeningAxes(registry, { techniqueCount: 2, formCount: 3 });
    expect(smaller.permittedTechniques & larger.permittedTechniques).toBe(
      smaller.permittedTechniques,
    );
    expect(smaller.permittedForms & larger.permittedForms).toBe(smaller.permittedForms);
  });

  it('puts the v1 rectangle first in its order, and every other axis after it', () => {
    const order = standardOpeningOrder(registry);
    const v1Techniques = new Set(
      registry.cells
        .filter((entry) => entry.record.v1 === true)
        .map((entry) => entry.record.technique),
    );
    expect(order.techniqueIds.slice(0, v1Techniques.size).every((id) => v1Techniques.has(id))).toBe(
      true,
    );
    expect(order.techniqueIds).toHaveLength(registry.techniques.length);
    expect(order.formIds).toHaveLength(registry.forms.length);
  });
});
