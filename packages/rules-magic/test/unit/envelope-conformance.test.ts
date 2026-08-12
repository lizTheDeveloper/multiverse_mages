/*
 * Multiverse Mages — the shipped envelopes, the loader's check, and the tradition hook.
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
 * Three claims that can only be checked from a package that sees both content
 * and the arithmetic.
 *
 * `@mm/content`'s loader computes the harmonic invariant a second time, because
 * `@mm/primitives` depends on it and the edge may not run the other way. That is
 * the same situation the rediscovery multiplier was in, and this is the same
 * remedy its module note prescribes: *"declaration in one place, arithmetic in
 * one place, and a check that they have not drifted apart."*
 *
 * The third claim is `sound-design.md` §4.4's. A tradition recolours *cast and
 * cost*, and a cost curve lives in cost — so the obvious mistake is to make the
 * curve a fifth tradition hook, which vision §4a forbids. It is not one, and
 * what that means concretely is that the curve and the `acquire` hook compose
 * without either shadowing the other.
 */

import { describe, expect, it } from 'vitest';

import { loadContent, shippedContentSource } from '@mm/content';
import {
  ENVELOPE_HARMONIC_TARGET,
  ENVELOPE_SLOTS,
  createRediscoveryClampCounter,
  envelopeHarmonicSum,
  envelopeProblems,
  shapedEffort,
} from '@mm/primitives';

import { researchRequirement } from '../../src/instances/research.js';
import type { KnowledgeNode } from '../../src/instances/catalog.js';

const registry = loadContent(shippedContentSource());

describe('the shipped technique envelopes', () => {
  it('gives all five techniques a curve', () => {
    expect(registry.techniques).toHaveLength(5);
    for (const entry of registry.techniques) {
      expect(entry.record.envelope, entry.record.id).toBeDefined();
      expect(entry.record.envelope.slots).toHaveLength(ENVELOPE_SLOTS);
      expect(entry.record.envelope.tuningStatus).toBe('untuned');
    }
  });

  it('satisfies every rule @mm/primitives declares, which is the loader agreeing with the arithmetic', () => {
    for (const entry of registry.techniques) {
      expect(envelopeProblems(entry.record.envelope.slots), entry.record.id).toEqual([]);
      expect(envelopeHarmonicSum(entry.record.envelope.slots), entry.record.id).toBe(
        ENVELOPE_HARMONIC_TARGET,
      );
    }
  });

  it('gives each technique a distinct curve, so the grid has five shapes and not one', () => {
    const ids = registry.techniques.map((entry) => entry.record.envelope.id);
    expect(new Set(ids).size).toBe(5);
    const tables = registry.techniques.map((entry) => JSON.stringify(entry.record.envelope.slots));
    expect(new Set(tables).size).toBe(5);
  });

  it('names the section it came from in every gloss', () => {
    for (const entry of registry.techniques) {
      expect(entry.record.envelope.gloss, entry.record.id).toContain('§4.1');
    }
  });
});

describe('§4.4: a tradition recolours cost, and the curve is not a fifth hook', () => {
  const node: KnowledgeNode = {
    nodeId: 1,
    tier: 1,
    prerequisites: [],
    researchCost: 4096,
    teachCost: 1024,
    scribeCost: 2048,
    rediscoveryMultiplier: 5376,
  };
  const swell = registry.techniques.find((entry) => entry.record.id === 'creo')?.record.envelope;

  it('lets the acquire hook price the node while the curve redistributes the effort', () => {
    // A tradition that halves the price. It moves `required`; it does not touch
    // the shape, and the shape does not touch it.
    const halving = { researchCost: (cost: number): number => Math.floor(cost / 2) };
    const base = researchRequirement(node, {
      rediscovery: false,
      rediscoveryAffinity: 1024,
      learnRate: 1024,
      researchRate: 1024,
      clampCounter: createRediscoveryClampCounter(),
    });
    const priced = researchRequirement(node, {
      rediscovery: false,
      rediscoveryAffinity: 1024,
      learnRate: 1024,
      researchRate: 1024,
      clampCounter: createRediscoveryClampCounter(),
      acquire: { ...halving, initialMastery: 512 },
    });

    expect(priced).toBe(Math.floor(base / 2));

    // The curve reads the same position in both, because position is a
    // *fraction* of the requirement. Halving the price does not change which
    // slot a half-finished project is in — which is exactly what "composes
    // multiplicatively without shadowing" means here.
    const atHalf = (required: number): number =>
      shapedEffort(swell, 1024, Math.floor(required / 2), required);
    expect(atHalf(base)).toBe(atHalf(priced));
  });

  it('leaves effort unshaped when no technique is resolved, so a hookless caller is unchanged', () => {
    expect(shapedEffort(undefined, 1024, 0, 4096)).toBe(1024);
  });
});
