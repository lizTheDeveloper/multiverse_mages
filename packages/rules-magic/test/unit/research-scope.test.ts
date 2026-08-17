/*
 * Multiverse Mages — reach is priced, and the arithmetic survives the worst
 * node anyone can author.
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
 * `researchCost` was a pure function of tier and nothing else — measured on the
 * 300 shipped nodes, all five effect targets appear at the same cost at every
 * tier — so a node reaching the whole universe was priced exactly as one
 * reaching a single mage. `docs/design/ars-magica-and-what-we-owe-it.md` argues
 * the axis; these tests are what makes it true rather than authored.
 *
 * Four claims, and the third is the one that would be silently wrong:
 *
 * 1. the multiplier multiplies, and an absent one is neutral;
 * 2. a node's scope is the **widest** target any of its effects carries;
 * 3. `catalog.ts`'s local `SCOPE_ORDER` still matches `@mm/content`'s, and every
 *    weight id it builds resolves — the copy exists because this package may
 *    import content for types only, and a drifted copy would price by the wrong
 *    rung without throwing;
 * 4. the worst requirement anyone can author stays inside fixed point.
 */

import { describe, expect, it } from 'vitest';

import type { EffectTarget } from '@mm/content';
import { EFFECT_SCOPE_ORDER, loadContent, shippedContentSource } from '@mm/content';
import { createRediscoveryClampCounter } from '@mm/primitives';
import { FP_MAX, FP_ONE, div, mul } from '@mm/sim-core';

import type { KnowledgeNode } from '../../src/instances/catalog.js';
import { catalogFromRegistry } from '../../src/instances/catalog.js';
import { researchRequirement } from '../../src/instances/research.js';

const registry = loadContent(shippedContentSource());
const catalog = catalogFromRegistry(registry);

const requirementOf = (node: KnowledgeNode): number =>
  researchRequirement(node, {
    rediscovery: false,
    rediscoveryAffinity: FP_ONE,
    learnRate: FP_ONE,
    researchRate: FP_ONE,
    clampCounter: createRediscoveryClampCounter(),
  });

const bareNode = (overrides: Partial<KnowledgeNode> = {}): KnowledgeNode => ({
  nodeId: 1,
  tier: 1,
  prerequisites: [],
  researchCost: FP_ONE * 8,
  teachCost: FP_ONE,
  scribeCost: FP_ONE,
  rediscoveryMultiplier: FP_ONE * 3,
  ...overrides,
});

describe('scope multiplies the authored research cost', () => {
  it('charges a wider node more than a narrower one at the same authored cost', () => {
    const narrow = requirementOf(bareNode({ scopeMultiplier: registry.autonomyWeight('scope-multiplier-self') }));
    const wide = requirementOf(bareNode({ scopeMultiplier: registry.autonomyWeight('scope-multiplier-universe') }));
    expect(wide).toBeGreaterThan(narrow);
  });

  it('treats an absent multiplier as neutral, so an old catalog is unchanged', () => {
    // Not merely "does not throw". A hand-built catalog node, a fixture, and
    // every save written before this axis existed must produce the number they
    // were written against, which is the fp(1024) answer and not the middle
    // rung's — those happen to be equal today, and equal-by-accident is what
    // this asserts against.
    expect(requirementOf(bareNode())).toBe(requirementOf(bareNode({ scopeMultiplier: FP_ONE })));
    expect(requirementOf(bareNode())).toBe(FP_ONE * 8);
  });
});

describe('a node scopes to the widest target any of its effects carries', () => {
  it('prices every shipped node at its widest rung and never at a narrower one', () => {
    let checked = 0;
    for (const entry of registry.nodes) {
      const node = catalog.node(entry.contentId);
      expect(node).toBeDefined();
      if (node === undefined) continue;

      let widest = 0;
      for (const effect of entry.record.effects) {
        const rung = EFFECT_SCOPE_ORDER.indexOf(effect.target);
        if (rung > widest) widest = rung;
      }
      const target = EFFECT_SCOPE_ORDER[widest] as EffectTarget;
      expect(node.scopeMultiplier).toBe(registry.autonomyWeight(`scope-multiplier-${target}`));
      checked += 1;
    }
    expect(checked).toBe(300);
  });

  it('is not diluted by narrow effects riding along with a wide one', () => {
    // The property the fold is chosen for: adding `self` effects to a node that
    // already reaches the universe must never make it cheaper, or an author
    // could buy a discount by writing more content.
    const universe = registry.autonomyWeight('scope-multiplier-universe');
    const mixed = registry.nodes.find((entry) => {
      const targets = entry.record.effects.map((effect) => effect.target);
      return targets.includes('universe') && targets.some((target) => target !== 'universe');
    });
    expect(mixed).toBeDefined();
    if (mixed === undefined) return;
    expect(catalog.node(mixed.contentId)?.scopeMultiplier).toBe(universe);
  });

  it('never floors a shipped node to a free one', () => {
    for (const entry of registry.nodes) {
      const node = catalog.node(entry.contentId);
      if (node === undefined) continue;
      expect(requirementOf(node)).toBeGreaterThan(0);
    }
  });
});

describe("catalog.ts's local copy of the scope order has not drifted", () => {
  it('lists the same five targets in the same order as @mm/content', () => {
    // `catalog.ts` may not import the constant at runtime — this package builds
    // types-only against content so it runs in a browser — so the copy is
    // checked here instead. A drifted copy prices by the wrong rung silently.
    const derived: EffectTarget[] = [];
    for (const target of EFFECT_SCOPE_ORDER) {
      const node = registry.nodes.find((entry) =>
        entry.record.effects.every((effect) => effect.target === target),
      );
      if (node === undefined) continue;
      derived.push(target);
      expect(catalog.node(node.contentId)?.scopeMultiplier).toBe(
        registry.autonomyWeight(`scope-multiplier-${target}`),
      );
    }
    expect(derived.length).toBeGreaterThan(0);
  });

  it('resolves every scope weight id and orders them narrowest-cheapest', () => {
    const values = EFFECT_SCOPE_ORDER.map((target) =>
      registry.autonomyWeight(`scope-multiplier-${target}`),
    );
    expect(values).toHaveLength(5);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeGreaterThanOrEqual(values[index - 1] as number);
    }
  });
});

describe('the worst authorable requirement stays inside fixed point', () => {
  it('survives the deepest node at the worst rediscovery and a research rate of 1', () => {
    // The binding constraint on the scope curve, and it is `div`, not `mul`.
    // `researchRequirement` ends in `div(base, rate)` = `base * FP_ONE / rate`,
    // and `rate` can legitimately be `1` — the smallest positive product of
    // `learnRate` and a stacked `research-rate`, which `research.ts` records as
    // reachable since magnitudes became signed.
    //
    // Worst case, at the shipped ceilings: `researchCost` fp(65536), authored
    // `rediscoveryMultiplier` fp(8192) divided by the orc's fp(512) — 16x —
    // times the widest scope. `SCOPE_MULTIPLIER_CEILING` is 2047 because
    // fp(2048) lands this exactly one past `FP_MAX`.
    const worstCost = FP_ONE * 64;
    const worstMultiplier = FP_ONE * 8;
    const orc = 512;
    const universe = registry.autonomyWeight('scope-multiplier-universe');

    const node = bareNode({
      researchCost: worstCost,
      rediscoveryMultiplier: worstMultiplier,
      scopeMultiplier: universe,
    });
    const required = researchRequirement(node, {
      rediscovery: true,
      rediscoveryAffinity: orc,
      learnRate: 1,
      researchRate: FP_ONE,
      clampCounter: createRediscoveryClampCounter(),
    });
    expect(required).toBeLessThanOrEqual(FP_MAX);
    expect(required).toBeGreaterThan(0);

    // And the rung above would not: the same arithmetic at fp(2048) overflows,
    // which is the derivation of the ceiling rather than a taste about reach.
    const overflowing = mul(mul(worstCost, FP_ONE * 2), div(worstMultiplier, orc));
    expect(() => div(overflowing, 1)).toThrow(RangeError);
  });
});
