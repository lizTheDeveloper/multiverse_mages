/*
 * Multiverse Mages — the axis-price factor: what a permit costs.
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
 * Five claims, and the first three are the ones whose failure would be silent.
 *
 * 1. **The default is today's universe, byte for byte.** A run naming no price
 *    must produce the identical snapshot hash to one built before the factor
 *    existed — the promise `openingTechniqueCount`'s zero makes and the only
 *    thing that keeps every committed balance baseline meaningful.
 * 2. **The resolver and the mask see the same price.** `deps.god.costs` is what
 *    `interventionCost` charges and `catalogue.costs` is what the legality mask
 *    refuses on. A scale reaching one and not the other produces an action the
 *    mask admits and the resolver refuses — the exact drift
 *    `cheapestAxisMultiplier`'s docstring warns about — and nothing would throw.
 * 3. **Only the four axis actions move.** A scale that also moved a grant or a
 *    blessing would be a different experiment reported as this one.
 * 4. **Permit/forbid symmetry survives.** `content/src/god.ts` makes it a checked
 *    invariant on vision pillar 1's argument; a factor that broke it would make
 *    denial a penalty.
 * 5. **A scaled registry refuses a second, different scale.** Compounding is the
 *    failure that produces plausible numbers under the wrong label.
 */

import { snapshotHash } from '@mm/sim-core';
import { describe, expect, it } from 'vitest';

import {
  AXIS_PRICE_ACTION_IDS,
  AXIS_PRICE_IDENTITY,
  appliedAxisPriceScale,
  axisPriceUnder,
  referenceContent,
  referenceScenario,
  withAxisPriceScale,
} from '../../src/index.js';

const shipped = referenceContent();

/** A tick-zero state, built the way every reference run builds one. */
function build(axisPriceScale: number) {
  const content = referenceContent(undefined, undefined, axisPriceScale);
  return referenceScenario(content).scenario.create(0x0009_0001, { worldTickCap: 12 });
}

describe('the axis-price factor', () => {
  it('leaves the shipped universe byte-identical at 0 and at the identity', () => {
    const base = snapshotHash(build(0));
    expect(snapshotHash(build(AXIS_PRICE_IDENTITY))).toBe(base);
    expect(withAxisPriceScale(shipped.registry, 0)).toBe(shipped.registry);
    expect(withAxisPriceScale(shipped.registry, AXIS_PRICE_IDENTITY)).toBe(shipped.registry);
  });

  it('charges the resolver and the mask the identical price', () => {
    for (const scale of [2048, 4096, 8192, 16384]) {
      const content = referenceContent(undefined, undefined, scale);
      // The resolver's table and the mask's, read separately on purpose: a scale
      // that reached one and not the other is the drift this test exists for.
      const resolver = content.deps.god?.content.costs.byAction;
      const mask = content.catalogue.costs?.byAction;
      expect(resolver).toBeDefined();
      expect(mask).toBeDefined();
      for (const actionId of AXIS_PRICE_ACTION_IDS) {
        const base = shipped.registry.godCost(actionId)?.favorCost ?? 0;
        const expected = Math.floor((base * scale) / AXIS_PRICE_IDENTITY);
        expect(resolver?.[actionId]).toBe(expected);
        expect(mask?.[actionId]).toBe(expected);
        expect(axisPriceUnder(shipped.registry, actionId, scale)).toBe(expected);
      }
    }
  });

  it('moves no price but the four axis actions', () => {
    const costs = referenceContent(undefined, undefined, 8192).catalogue.costs;
    const base = shipped.catalogue.costs;
    expect(costs).toBeDefined();
    expect(base).toBeDefined();
    for (let actionId = 0; actionId <= 15; actionId += 1) {
      if (AXIS_PRICE_ACTION_IDS.includes(actionId)) continue;
      expect(costs?.byAction[actionId]).toBe(base?.byAction[actionId]);
    }
    expect(costs?.foundUniversity).toBe(base?.foundUniversity);
  });

  it('keeps permitting and forbidding the same price, and a technique twice a form', () => {
    for (const scale of [2048, 5120, 8192]) {
      const byAction = referenceContent(undefined, undefined, scale).catalogue.costs?.byAction;
      expect(byAction).toBeDefined();
      expect(byAction?.[1]).toBe(byAction?.[2]);
      expect(byAction?.[3]).toBe(byAction?.[4]);
      expect(byAction?.[1]).toBe((byAction?.[3] ?? 0) * 2);
    }
  });

  it('refuses a second, different scale rather than compounding it', () => {
    const doubled = withAxisPriceScale(shipped.registry, 2048);
    expect(appliedAxisPriceScale(doubled)).toBe(2048);
    expect(withAxisPriceScale(doubled, 2048)).toBe(doubled);
    expect(() => withAxisPriceScale(doubled, 4096)).toThrow(/already priced/i);
  });

  it('refuses a level it cannot price, rather than running a different one', () => {
    expect(() => withAxisPriceScale(shipped.registry, -1)).toThrow(/non-negative integer/i);
    expect(() => withAxisPriceScale(shipped.registry, 1.5)).toThrow(/non-negative integer/i);
    // 32 fp is 1/32 of the shipped price, which puts a form permit at 128 —
    // below `assign-role`'s 256, which `god-cost.json`'s loader refuses.
    expect(() => withAxisPriceScale(shipped.registry, 32)).toThrow(/assigning a role/i);
  });
});
