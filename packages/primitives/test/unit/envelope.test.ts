/*
 * Multiverse Mages — the five techniques are five different shapes, and cost the same.
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
 * `sound-design.md` §4.1 claims the five techniques are five different envelopes.
 * These tests are what makes that claim checkable rather than decorative: every
 * assertion below names the sentence it enforces, and the acceptance criterion
 * this file exists for is *"the five techniques have measurably different
 * cost/effect shapes, and a test distinguishes them."*
 */

import { describe, expect, it } from 'vitest';

import type { EffortEnvelope } from '../../src/envelope.js';
import {
  ENVELOPE_HARMONIC_TARGET,
  ENVELOPE_SLOTS,
  ENVELOPE_SLOT_FLOOR,
  RIGID_ENVELOPE,
  envelopeHarmonicSum,
  envelopeMultiplier,
  envelopeProblems,
  envelopeSlotAt,
  shapedEffort,
} from '../../src/envelope.js';

const FP_ONE = 1024;

/**
 * The shipped tables, restated here rather than loaded.
 *
 * `@mm/primitives` depends on `@mm/content` for *types only* — its package
 * manifest says so — so this file may not reach `data/technique.json`. That the
 * two agree is a separate claim, and it is pinned where both are reachable, in
 * `rules-magic`'s `envelope-content-conformance.test.ts`. Restating them here
 * keeps the shape assertions readable as a table, which is how they are argued.
 */
const SHIPPED: Record<string, EffortEnvelope> = {
  rigid: RIGID_ENVELOPE,
  swell: curve('swell', [347, 697, 1044, 1392, 1739, 2087, 2435, 2783]),
  hole: curve('hole', [2783, 2435, 2087, 1739, 1392, 1044, 697, 347]),
  bend: curve('bend', [429, 1286, 2146, 3004, 3004, 2146, 1286, 429]),
  open: curve('open', [277, 1665, 1665, 1665, 1664, 1664, 1664, 1664]),
};

function curve(id: string, slots: number[]): EffortEnvelope {
  return { id, gloss: `${id} (test)`, slots, tuningStatus: 'untuned' };
}

/** The multiplier at each of the eight positions, which is the shape itself. */
function shape(envelope: EffortEnvelope): number[] {
  const required = ENVELOPE_SLOTS * FP_ONE;
  return Array.from({ length: ENVELOPE_SLOTS }, (_unused, slot) =>
    envelopeMultiplier(envelope, slot * FP_ONE, required),
  );
}

describe('the five techniques are five different shapes', () => {
  it('gives every pair of techniques a different shape', () => {
    const shapes = Object.entries(SHIPPED).map(([id, envelope]) => [id, shape(envelope)] as const);
    for (const [idA, shapeA] of shapes) {
      for (const [idB, shapeB] of shapes) {
        if (idA === idB) continue;
        expect(shapeA, `${idA} and ${idB} are the same shape`).not.toEqual(shapeB);
      }
    }
  });

  it("holds Rego flat — §4.1's 'zero attack, gated release, rhythmically rigid'", () => {
    expect(shape(SHIPPED.rigid as EffortEnvelope)).toEqual(Array(ENVELOPE_SLOTS).fill(FP_ONE));
  });

  it("makes Creo the only rising one — §4.1's 'the only technique whose energy increases across its duration'", () => {
    const rising = (curveShape: number[]): boolean =>
      curveShape.every((value, index) => index === 0 || value > (curveShape[index - 1] as number));

    expect(rising(shape(SHIPPED.swell as EffortEnvelope))).toBe(true);
    for (const id of ['rigid', 'hole', 'bend', 'open']) {
      expect(rising(shape(SHIPPED[id] as EffortEnvelope)), `${id} rises`).toBe(false);
    }
  });

  it("makes Perdo the exact time-reverse of Creo — §4.1's 'subtractive... Perdo's signature is a hole'", () => {
    expect(shape(SHIPPED.hole as EffortEnvelope)).toEqual(
      [...shape(SHIPPED.swell as EffortEnvelope)].reverse(),
    );
  });

  it("peaks Muto in the middle — §4.1's 'the listener hears the change, not the endpoints'", () => {
    const bend = shape(SHIPPED.bend as EffortEnvelope);
    const middle = bend.slice(3, 5);
    const endpoints = [bend[0] as number, bend[ENVELOPE_SLOTS - 1] as number];
    for (const peak of middle) {
      for (const edge of endpoints) expect(peak).toBeGreaterThan(edge);
    }
    // Symmetric, which is what distinguishes a bend from a swell or a hole.
    expect(bend).toEqual([...bend].reverse());
  });

  it("gives Intellego alone a near-silent attack — §4.1's 'no impact at all... nothing is struck'", () => {
    const open = shape(SHIPPED.open as EffortEnvelope);
    // The attack slot is the smallest of any technique's, and the rest of the
    // curve is flat above the flat rate: the filter opens once and stays open.
    const attacks = Object.values(SHIPPED).map((envelope) => shape(envelope)[0] as number);
    expect(open[0]).toBe(Math.min(...attacks));
    expect(open[0]).toBeGreaterThanOrEqual(ENVELOPE_SLOT_FLOOR);
    for (const value of open.slice(1)) expect(value).toBeGreaterThan(FP_ONE);
  });
});

describe('a curve redistributes work and never discounts it', () => {
  it('gives every shipped curve the flat curve\'s harmonic sum, exactly', () => {
    for (const [id, envelope] of Object.entries(SHIPPED)) {
      expect(envelopeHarmonicSum(envelope.slots), id).toBe(ENVELOPE_HARMONIC_TARGET);
    }
  });

  it('completes in the same number of constant-effort months, whatever the shape', () => {
    // The claim in its operational form. A mage spends one mage-month per tick
    // on a node costing 4096; count the ticks under each curve.
    const required = 4096;
    const effortPerTick = FP_ONE;
    const months = (envelope: EffortEnvelope): number => {
      let progress = 0;
      let ticks = 0;
      while (progress < required && ticks < 10_000) {
        progress += shapedEffort(envelope, effortPerTick, progress, required);
        ticks += 1;
      }
      return ticks;
    };

    const flat = months(RIGID_ENVELOPE);
    expect(flat).toBe(4);
    for (const [id, envelope] of Object.entries(SHIPPED)) {
      // Within one tick: the slots hit the harmonic target exactly, but a mage
      // works in whole months and a boundary can be crossed a month either side.
      expect(Math.abs(months(envelope) - flat), `${id} took ${String(months(envelope))}`)
        .toBeLessThanOrEqual(1);
    }
  });

  it('banks visibly different progress at the same point in the same project', () => {
    // The reason the mechanic is not decorative: `researchFrontier` scores
    // whether to resume a project from `required - banked`, so a curve changes
    // what mages choose to work on even when it does not change the total.
    // A project the flat curve finishes in 32 months, sampled at month 16.
    const required = 8 * FP_ONE * 64;
    const perMonth = FP_ONE * 16;
    const banked = (envelope: EffortEnvelope): number => {
      let progress = 0;
      for (let month = 0; month < 16; month += 1) {
        progress += shapedEffort(envelope, perMonth, progress, required);
      }
      return progress;
    };

    const halfway = banked(RIGID_ENVELOPE);
    expect(halfway).toBe(Math.floor(required / 2));
    expect(banked(SHIPPED.hole as EffortEnvelope)).toBeGreaterThan(halfway);
    expect(banked(SHIPPED.swell as EffortEnvelope)).toBeLessThan(halfway);
    expect(banked(SHIPPED.hole as EffortEnvelope)).toBeGreaterThan(
      banked(SHIPPED.swell as EffortEnvelope),
    );
  });
});

describe('the evaluator', () => {
  it('is the identity when no envelope is supplied', () => {
    expect(shapedEffort(undefined, 1234, 500, 4096)).toBe(1234);
    expect(envelopeMultiplier(undefined, 500, 4096)).toBe(FP_ONE);
  });

  it('answers slot 0 for a degenerate requirement rather than dividing by it', () => {
    expect(envelopeSlotAt(0, 0)).toBe(0);
    expect(envelopeSlotAt(100, -1)).toBe(0);
  });

  it('clamps a completed or overshot project into the last slot', () => {
    expect(envelopeSlotAt(4096, 4096)).toBe(ENVELOPE_SLOTS - 1);
    expect(envelopeSlotAt(1_000_000, 4096)).toBe(ENVELOPE_SLOTS - 1);
  });

  it('walks every slot exactly once across a project', () => {
    const required = ENVELOPE_SLOTS * 128;
    const visited = new Set<number>();
    for (let progress = 0; progress < required; progress += 1) {
      visited.add(envelopeSlotAt(progress, required));
    }
    expect([...visited].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('the content rules', () => {
  it('accepts every shipped curve', () => {
    for (const [id, envelope] of Object.entries(SHIPPED)) {
      expect(envelopeProblems(envelope.slots), id).toEqual([]);
    }
  });

  it('refuses a curve that discounts its technique', () => {
    // Every slot at twice the flat rate: the same shape as `rigid`, at half the
    // price. This is the failure mode the harmonic invariant exists to catch.
    expect(envelopeProblems(Array(ENVELOPE_SLOTS).fill(2 * FP_ONE))).toContain(
      'harmonic-imbalance',
    );
  });

  it('refuses a zero attack slot, which would never finish', () => {
    expect(envelopeProblems([0, ...Array(7).fill(FP_ONE)])).toContain('slot-below-floor');
  });

  it('refuses a table of the wrong length', () => {
    expect(envelopeProblems([FP_ONE, FP_ONE])).toContain('slot-count');
  });
});
