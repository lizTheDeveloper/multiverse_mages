/*
 * Multiverse Mages — the primitive floor, Rego's control clamp, and their order.
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
 * `docs/design/compositional-content.md` §3.3/§3.4 and `contracts.md` §3 give
 * `stackMagnitudes` two new stages beyond the fold and the cap: a primitive's
 * own `floor` (a division-hazard guard against Perdo driving a world-scale
 * rate to zero or negative), and Rego's `control` clamp (a genuine trade —
 * floor bought, ceiling sold). The order is normative: rule → ablation →
 * floor → control clamp → cap. This file is the order, the ceiling-wins rule
 * for a contradictory clamp, and `combineControls`'s order-independence.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE, fromInt } from '@mm/sim-core';
import { loadContent, shippedContentSource } from '@mm/content';
import type { ContentRegistry, PrimitiveRecord } from '@mm/content';
import { ClampCounters, combineControls, neutralizing, stackMagnitudes } from '@mm/primitives';
import type { EffectControl } from '@mm/primitives';

const registry: ContentRegistry = loadContent(shippedContentSource());

function primitive(id: string): PrimitiveRecord {
  const found = registry.primitives.find((entry) => entry.record.id === id);
  if (found === undefined) {
    throw new Error(`shipped content has no primitive "${id}"`);
  }
  return found.record;
}

describe('the primitive floor', () => {
  it('stops a Perdo-driven research-rate multiplier at the authored floor instead of going negative', () => {
    const research = primitive('research-rate');
    const counters = new ClampCounters();

    // A large negative source (Perdo `remove`, at the fold this package never
    // constructs itself -- that is @mm/rules-magic's job) drives the raw
    // additive-into-multiplier stack well below zero: FP_ONE - 2000 = -976.
    const stacked = stackMagnitudes(research, [-2000], { floor: 256, counters });

    expect(stacked.value).toBe(256);
    expect(stacked.clamped).toBe(true);
    expect(counters.count('research-rate')).toBe(1);
  });

  it('leaves a value already above the floor untouched', () => {
    const research = primitive('research-rate');
    const stacked = stackMagnitudes(research, [204], { floor: 256 });
    expect(stacked.value).toBe(FP_ONE + 204);
    expect(stacked.clamped).toBe(false);
  });

  it('applies on the ablated path too, the same uniformity the cap already gives ablation', () => {
    // Neutralizing additive-into-multiplier yields FP_ONE (1024), which is
    // already above a floor of 256 -- so ablation plus a floor is still just
    // ablation here, but the floor stage still runs, not skipped.
    const research = primitive('research-rate');
    const stacked = stackMagnitudes(research, [-5000], {
      floor: 256,
      ablation: neutralizing(research.id),
    });
    expect(stacked.value).toBe(FP_ONE);
  });
});

describe('the control clamp', () => {
  it('pulls a value up to a floor and down to a ceiling', () => {
    const research = primitive('research-rate');
    const below = stackMagnitudes(research, [-100], { clamp: { floor: 1200, ceiling: 1500 } });
    expect(below.value).toBe(1200);
    expect(below.clamped).toBe(true);

    const above = stackMagnitudes(research, [4096], { clamp: { floor: 1200, ceiling: 1500 } });
    expect(above.value).toBe(1500);
    expect(above.clamped).toBe(true);

    const within = stackMagnitudes(research, [200], { clamp: { floor: 1200, ceiling: 1500 } });
    expect(within.value).toBe(FP_ONE + 200);
    expect(within.clamped).toBe(false);
  });

  it('runs after the primitive floor and before the cap', () => {
    const research = primitive('research-rate');
    const counters = new ClampCounters();

    // Raw stack: FP_ONE - 5000 = -3976. Primitive floor lifts it to 256.
    // Control floor then lifts it further, to 900. Cap (fp(4096)) never binds.
    const stacked = stackMagnitudes(research, [-5000], {
      floor: 256,
      clamp: { floor: 900 },
      counters,
    });
    expect(stacked.value).toBe(900);
    expect(stacked.clamped).toBe(true);
    // Two distinct stages bound in this one call: the primitive floor, then
    // the control floor. Both are counted, the way cap clamping already was.
    expect(counters.count('research-rate')).toBe(2);
  });

  it('cannot lift a value past the primitive cap: the cap always has the last word', () => {
    const research = primitive('research-rate');
    // A control ceiling above the cap (fp(4096)) does not create headroom --
    // the cap stage runs last and still binds.
    const stacked = stackMagnitudes(research, [8192], { clamp: { ceiling: 9000 } });
    expect(stacked.value).toBe(4096);
    expect(stacked.clamped).toBe(true);
  });

  it('when the floor exceeds the ceiling, the ceiling wins: the gate is shut, not widened', () => {
    const research = primitive('research-rate');

    // Below both, above both, and inside the (nonsensical) requested range --
    // every input lands on the ceiling.
    const low = stackMagnitudes(research, [-5000], { clamp: { floor: 2000, ceiling: 1200 } });
    const high = stackMagnitudes(research, [8192], { clamp: { floor: 2000, ceiling: 1200 } });
    const mid = stackMagnitudes(research, [176], { clamp: { floor: 2000, ceiling: 1200 } });

    expect(low.value).toBe(1200);
    expect(high.value).toBe(1200);
    expect(mid.value).toBe(1200);
  });

  it('has no effect when absent', () => {
    const research = primitive('research-rate');
    const stacked = stackMagnitudes(research, [204]);
    expect(stacked.value).toBe(FP_ONE + 204);
    expect(stacked.clamped).toBe(false);
  });
});

describe('combineControls', () => {
  it('takes the max of the floors and the min of the ceilings', () => {
    const controls: readonly EffectControl[] = [
      { floor: 100, ceiling: 900 },
      { floor: 300, ceiling: 700 },
      { floor: 50 },
    ];
    expect(combineControls(controls)).toEqual({ floor: 300, ceiling: 700 });
  });

  it('is order-independent', () => {
    const a: EffectControl = { floor: 100, ceiling: 900 };
    const b: EffectControl = { floor: 300, ceiling: 700 };
    const c: EffectControl = { ceiling: 1024 };
    const d: EffectControl = { floor: 50 };

    const forward = combineControls([a, b, c, d]);
    const reversed = combineControls([d, c, b, a]);
    // A handful of other shuffles, so this is not passing by coincidence of
    // one particular reversal.
    const shuffled1 = combineControls([c, a, d, b]);
    const shuffled2 = combineControls([d, b, c, a]);

    expect(reversed).toEqual(forward);
    expect(shuffled1).toEqual(forward);
    expect(shuffled2).toEqual(forward);
  });

  it('returns an empty clamp for no controls', () => {
    expect(combineControls([])).toEqual({});
  });

  it('carries a floor-only or ceiling-only control through untouched', () => {
    expect(combineControls([{ floor: 500 }])).toEqual({ floor: 500 });
    expect(combineControls([{ ceiling: 500 }])).toEqual({ ceiling: 500 });
  });

  it('combines with fromInt-scaled values the same way', () => {
    const controls: readonly EffectControl[] = [
      { floor: fromInt(1) },
      { floor: fromInt(2) },
      { ceiling: fromInt(5) },
      { ceiling: fromInt(3) },
    ];
    expect(combineControls(controls)).toEqual({ floor: fromInt(2), ceiling: fromInt(3) });
  });
});
