/*
 * Multiverse Mages — the declared stacking rules produce the declared numbers.
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
 * Two of these cases are the reason task group 3 exists at all.
 *
 * **Two 50% wards.** Summing them gives 100% — total immunity from two
 * ordinary defences. `contracts.md` §3 says wards stack multiplicatively on the
 * remainder, so the answer is 75%. Anyone who reaches for `+` here is wrong,
 * and the control below proves the wrong arithmetic really would produce a
 * different, worse number rather than the test passing by coincidence.
 *
 * **Blink is max, not sum.** Two displacements do not add; the larger wins.
 * Same shape of mistake, opposite rule, which is exactly why the rule is data
 * on the primitive rather than a habit in the caller's head.
 *
 * Every case runs against the *shipped* registry rather than a record written
 * here, so a test cannot agree with an implementation that both disagree with
 * the data.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE, fromInt } from '@mm/sim-core';
import type { Fixed } from '@mm/sim-core';
import { loadContent, shippedContentSource } from '@mm/content';
import type { ContentRegistry, PrimitiveRecord } from '@mm/content';
import {
  ClampCounters,
  additive,
  additiveIntoMultiplier,
  applyCap,
  applyWard,
  capLimit,
  maxOf,
  multiplicativeOnRemainder,
  presence,
  stackMagnitudes,
} from '@mm/primitives';

const registry: ContentRegistry = loadContent(shippedContentSource());

function primitive(id: string): PrimitiveRecord {
  const found = registry.primitives.find((entry) => entry.record.id === id);
  if (found === undefined) {
    throw new Error(`shipped content has no primitive "${id}"`);
  }
  return found.record;
}

/** fp(512) is 0.5. Written through the constant so the scale is never guessed. */
const HALF: Fixed = FP_ONE / 2;

describe('additive stacking', () => {
  it('sums its sources', () => {
    expect(additive([100, 200, 300])).toBe(600);
  });

  it('is zero for no sources, because absence is not an effect', () => {
    expect(additive([])).toBe(0);
  });

  it('stacks area-denial per the registry, without a cap', () => {
    const areaDenial = primitive('area-denial');
    expect(areaDenial.stacking).toBe('additive');
    expect(stackMagnitudes(areaDenial, [fromInt(3), fromInt(4)])).toEqual({
      value: fromInt(7),
      clamped: false,
      floored: false,
    });
  });

  it('sums negative and positive sources uniformly', () => {
    // A debuff is a negative magnitude, not a separate code path.
    expect(additive([1024, -512])).toBe(512);
  });
});

describe('additive-into-multiplier stacking', () => {
  it('adds the bonuses into one multiplier rather than multiplying them', () => {
    // The scenario from the spec: two research-rate sources of fp(204).
    const research = primitive('research-rate');
    expect(research.stacking).toBe('additive-into-multiplier');

    const stacked = stackMagnitudes(research, [204, 204]);
    expect(stacked.value).toBe(FP_ONE + 204 + 204);
    expect(stacked.value).toBe(1432);
  });

  it('is 1.0 for no sources, because a multiplier with nothing in it changes nothing', () => {
    expect(additiveIntoMultiplier([])).toBe(FP_ONE);
  });

  it('control: multiplying the two multipliers instead would give a different answer', () => {
    // (1 + 0.199)^2 = 1.4375, where the declared rule gives 1.3984. The whole
    // design note behind this task group is that both readings look right;
    // fp(1432) against fp(1472) is the gap two implementers silently ship.
    const asProduct = ((FP_ONE + 204) * (FP_ONE + 204)) / FP_ONE;
    expect(Math.floor(asProduct)).toBe(1472);
    expect(additiveIntoMultiplier([204, 204])).not.toBe(Math.floor(asProduct));
  });
});

describe('multiplicative-on-remainder stacking', () => {
  it('two 50% wards prevent 75% of damage, not 100%', () => {
    const ward = primitive('ward');
    expect(ward.stacking).toBe('multiplicative-on-remainder');

    const prevented = multiplicativeOnRemainder([HALF, HALF]);
    expect(prevented).toBe(768);
    expect(prevented).toBe((FP_ONE * 3) / 4);
  });

  it('control: summing the two wards would claim total immunity', () => {
    // This is the bug the rule exists to prevent, stated as an assertion so the
    // test above cannot pass while quietly computing the sum.
    expect(additive([HALF, HALF])).toBe(FP_ONE);
    expect(multiplicativeOnRemainder([HALF, HALF])).not.toBe(additive([HALF, HALF]));
  });

  it('prevents nothing when there is no ward', () => {
    expect(multiplicativeOnRemainder([])).toBe(0);
  });

  it('leaves a survivable remainder no matter how many wards stack, before the cap', () => {
    // Ten 50% wards: remainder 1024 -> 512 -> 256 -> ... The prevented fraction
    // approaches 1.0 but the *rule* never reaches it; only the cap decides.
    const prevented = multiplicativeOnRemainder(Array<Fixed>(10).fill(HALF));
    expect(prevented).toBeLessThan(FP_ONE);
  });

  it('applies one ward factor to a summed damage total', () => {
    // contracts.md §3, direct-damage: ten small hits must equal one large hit.
    const tenSmall = additive(Array<Fixed>(10).fill(fromInt(10)));
    const oneLarge = fromInt(100);
    expect(tenSmall).toBe(oneLarge);
    expect(applyWard(tenSmall, HALF)).toBe(applyWard(oneLarge, HALF));
    expect(applyWard(oneLarge, HALF)).toBe(fromInt(50));
  });

  it('rounds the surviving damage toward negative infinity, in the defender’s favour', () => {
    // fp(101) through a 50% ward is fp(50.5); the shared floor takes it to
    // fp(50). Stated as a test because "which way does damage round" is the
    // question a balance mystery is made of.
    expect(applyWard(101, HALF)).toBe(50);
  });

  it('rounds a negative value the same direction, which truncation would not', () => {
    // The discriminating case, and the reason the previous test is not enough:
    // floor and truncation agree on +50.5 and disagree on -50.5. A negative
    // magnitude — a heal routed through the same formula, a debuffing ward —
    // must round toward negative infinity like everything else, or the rules
    // path rounds differently for negative modifiers and the resulting balance
    // drift is untraceable. Truncation would give -50 here.
    expect(applyWard(-101, HALF)).toBe(-51);
  });
});

describe('max stacking', () => {
  it('two blinks displace by the larger, not the sum', () => {
    const blink = primitive('blink');
    expect(blink.stacking).toBe('max');
    expect(stackMagnitudes(blink, [5120, 8192]).value).toBe(8192);
  });

  it('control: summing the two blinks would teleport 13 metres instead of 8', () => {
    expect(additive([5120, 8192])).toBe(13312);
    expect(maxOf([5120, 8192])).not.toBe(additive([5120, 8192]));
  });

  it('is order-independent', () => {
    expect(maxOf([8192, 5120])).toBe(maxOf([5120, 8192]));
  });

  it('is zero for no sources', () => {
    expect(maxOf([])).toBe(0);
  });

  it('stacks knowledge-steal by max as well, since the registry says so', () => {
    const steal = primitive('knowledge-steal');
    expect(steal.stacking).toBe('max');
    expect(stackMagnitudes(steal, [384, 512, 128]).value).toBe(512);
  });
});

describe('presence stacking', () => {
  it('reports one when any source is present and zero otherwise', () => {
    const portal = primitive('portal');
    expect(portal.stacking).toBe('presence');
    expect(stackMagnitudes(portal, [fromInt(1)]).value).toBe(FP_ONE);
    expect(stackMagnitudes(portal, []).value).toBe(0);
    expect(presence([])).toBe(0);
  });
});

describe('summed-then-single-ward stacking', () => {
  it('sums the hits and leaves the ward factor to applyWard', () => {
    const damage = primitive('direct-damage');
    expect(damage.stacking).toBe('summed-then-single-ward');
    expect(stackMagnitudes(damage, [fromInt(3), fromInt(4), fromInt(5)]).value).toBe(fromInt(12));
  });
});

describe('caps clamp and are counted', () => {
  it('clamps a ward stack above 90% to fp(922)', () => {
    const ward = primitive('ward');
    const counters = new ClampCounters();

    // Four 50% wards: remainder 1024 -> 512 -> 256 -> 128 -> 64, prevented 960.
    const stacked = stackMagnitudes(ward, Array<Fixed>(4).fill(HALF), { counters });
    expect(stacked.value).toBe(922);
    expect(stacked.clamped).toBe(true);
    expect(counters.count('ward')).toBe(1);
  });

  it('clamps a build-rate multiplier above fp(4096)', () => {
    const buildRate = primitive('build-rate');
    const counters = new ClampCounters();

    const stacked = stackMagnitudes(buildRate, [2048, 2048], { counters });
    expect(stacked.value).toBe(4096);
    expect(stacked.clamped).toBe(true);
    expect(counters.count('build-rate')).toBe(1);
  });

  it('does not count a stack that stays under its cap', () => {
    const counters = new ClampCounters();
    const stacked = stackMagnitudes(primitive('build-rate'), [204], { counters });
    expect(stacked.value).toBe(1228);
    expect(stacked.clamped).toBe(false);
    expect(counters.count('build-rate')).toBe(0);
    expect(counters.total()).toBe(0);
  });

  it('counts per primitive, and reports in a deterministic order', () => {
    const counters = new ClampCounters();
    stackMagnitudes(primitive('worship-yield'), [4096], { counters });
    stackMagnitudes(primitive('build-rate'), [8192], { counters });
    stackMagnitudes(primitive('build-rate'), [8192], { counters });

    expect(counters.count('build-rate')).toBe(2);
    expect(counters.count('worship-yield')).toBe(1);
    expect(counters.total()).toBe(3);
    // Sorted by primitive id: a harness report that reordered between runs
    // would make two Monte Carlo baselines differ for no simulated reason.
    expect(counters.entries()).toEqual([
      ['build-rate', 2],
      ['worship-yield', 1],
    ]);
  });

  it('caps the lifespan bonus at half the species base, not at a flat fp value', () => {
    const lifespan = primitive('lifespan');
    expect(lifespan.cap.kind).toBe('fraction-of-species-base');

    const base = fromInt(600);
    const counters = new ClampCounters();
    const stacked = stackMagnitudes(lifespan, [fromInt(200), fromInt(200)], {
      speciesBase: base,
      counters,
    });
    expect(stacked.value).toBe(fromInt(300));
    expect(stacked.clamped).toBe(true);
    expect(counters.count('lifespan')).toBe(1);
  });

  it('refuses a fraction-of-species-base cap with no base supplied', () => {
    expect(() => stackMagnitudes(primitive('lifespan'), [fromInt(200)])).toThrow(
      /species base/i,
    );
  });

  it('reads the summon cap as a whole count of combatants per side', () => {
    const summon = primitive('summon');
    expect(summon.cap.kind).toBe('count-per-side');
    // Magnitudes are fp counts: fp(1024) is one combatant (see node.json).
    expect(capLimit(summon.cap)).toBe(fromInt(8));

    const stacked = stackMagnitudes(summon, Array<Fixed>(10).fill(FP_ONE));
    expect(stacked.value).toBe(fromInt(8));
    expect(stacked.clamped).toBe(true);
  });

  it('leaves an uncapped primitive alone', () => {
    const blink = primitive('blink');
    expect(blink.cap.kind).toBe('none');
    expect(capLimit(blink.cap)).toBeUndefined();
    expect(applyCap(blink.cap, fromInt(1000))).toEqual({ value: fromInt(1000), clamped: false });
  });

  it('counts every clamp, so a cap that is silently hit constantly is visible', () => {
    // The design note: caps are set to be reachable, so the harness measures
    // behaviour at the cap. Without the counter, a cap pinned on every single
    // tick looks exactly like a cap that never binds.
    const counters = new ClampCounters();
    const research = primitive('research-rate');
    for (let i = 0; i < 5; i += 1) {
      stackMagnitudes(research, [8192], { counters });
    }
    expect(counters.count('research-rate')).toBe(5);
    counters.reset();
    expect(counters.total()).toBe(0);
  });
});

describe('every primitive in the shipped registry can be stacked', () => {
  it('handles all sixteen without falling through to a default', () => {
    for (const entry of registry.primitives) {
      const record = entry.record;
      const options =
        record.cap.kind === 'fraction-of-species-base' ? { speciesBase: fromInt(600) } : {};
      const stacked = stackMagnitudes(record, [FP_ONE, FP_ONE], options);
      expect(Number.isInteger(stacked.value)).toBe(true);
    }
  });
});
