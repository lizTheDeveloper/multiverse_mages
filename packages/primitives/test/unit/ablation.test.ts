/*
 * Multiverse Mages — neutralizing a primitive without touching content.
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
 * Ablation is the instrument behind `winRateByPrimitive`, and the number it
 * produces is only worth reading if two things hold: the ablated arm plays the
 * *same* universe as its control, and the neutralized primitive contributes its
 * own rule's identity rather than a plausible-looking zero.
 *
 * The second is the whole of this file. Four of the five stacking classes
 * neutralize to `0`; **`additive-into-multiplier` neutralizes to `FP_ONE`**, and
 * substituting `0` there would not remove a primitive, it would multiply every
 * research, teaching, scribing, build, resource, fertility and worship rate in
 * the ablated arm by zero. The arm would lose every pair, the attribution would
 * come back enormous, and it would be measuring the bug.
 *
 * So every class is asserted against the shipped registry rather than against a
 * record written here, and every case carries the control that shows the
 * unmasked value really is different — a neutralization test that passes
 * because the value was already the identity proves nothing.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE, fromInt } from '@mm/sim-core';
import type { Fixed } from '@mm/sim-core';
import { loadContent, shippedContentSource } from '@mm/content';
import type { ContentRegistry, PrimitiveRecord, PrimitiveStacking } from '@mm/content';
import {
  ClampCounters,
  NEUTRALIZED_MAGNITUDE,
  NO_ABLATION,
  ablationMaskFor,
  additive,
  additiveIntoMultiplier,
  applyWard,
  maxOf,
  multiplicativeOnRemainder,
  neutralizedMagnitude,
  neutralizing,
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

describe('the mask names one primitive and nothing else', () => {
  it('neutralizes nothing on the control arm', () => {
    expect(NO_ABLATION.neutralizedPrimitiveId).toBeUndefined();
    for (const entry of registry.primitives) {
      expect(NO_ABLATION.neutralizes(entry.record.id)).toBe(false);
    }
  });

  it('neutralizes exactly the primitive it names', () => {
    const mask = neutralizing('ward');
    expect(mask.neutralizedPrimitiveId).toBe('ward');
    expect(mask.neutralizes('ward')).toBe(true);
    expect(mask.neutralizes('concealment')).toBe(false);
    expect(mask.neutralizes('')).toBe(false);
  });

  it('rejects a mask naming no primitive at all', () => {
    expect(() => neutralizing('')).toThrow(/primitive id/i);
  });

  it('reads a zero-length request as the control arm', () => {
    expect(ablationMaskFor([]).neutralizedPrimitiveId).toBeUndefined();
  });

  it('rejects a pairwise request by explaining why, rather than ablating one of the two', () => {
    // The silent-success failure mode: taking the first id and running an arm
    // that is labelled "ward+blink" and is in fact "ward". The count is named
    // in the message because 105 pairs is the reason the answer is no.
    expect(() => ablationMaskFor(['ward', 'blink'])).toThrow(/single-primitive/i);
    expect(() => ablationMaskFor(['ward', 'blink'])).toThrow(/ward, blink/);
  });
});

describe('each stacking class neutralizes to its own identity', () => {
  it('additive contributes nothing', () => {
    const areaDenial = primitive('area-denial');
    expect(areaDenial.stacking).toBe('additive');
    const magnitudes = [fromInt(3), fromInt(4)];

    expect(stackMagnitudes(areaDenial, magnitudes).value).toBe(fromInt(7));
    expect(
      stackMagnitudes(areaDenial, magnitudes, { ablation: neutralizing('area-denial') }).value,
    ).toBe(0);
  });

  it('summed-then-single-ward contributes nothing, and the ward step still runs', () => {
    const damage = primitive('direct-damage');
    expect(damage.stacking).toBe('summed-then-single-ward');
    const hits = [fromInt(5), fromInt(5)];

    expect(stackMagnitudes(damage, hits).value).toBe(fromInt(10));
    const ablated = stackMagnitudes(damage, hits, {
      ablation: neutralizing('direct-damage'),
    }).value;
    expect(ablated).toBe(0);
    // No damage to ward. `applyWard` is a separate step and is not the mask's
    // business, so it must keep behaving arithmetically rather than specially.
    expect(applyWard(ablated, HALF)).toBe(0);
  });

  it('additive-into-multiplier leaves the multiplier at fp(1024), not at zero', () => {
    // The case that would silently invert the whole measurement.
    const research = primitive('research-rate');
    expect(research.stacking).toBe('additive-into-multiplier');

    expect(stackMagnitudes(research, [204, 204]).value).toBe(1432);
    expect(
      stackMagnitudes(research, [204, 204], { ablation: neutralizing('research-rate') }).value,
    ).toBe(FP_ONE);
    // Stated as the control it is: zero here is not a smaller bonus, it is a
    // rate of zero, and every world-scale rate in the game would stop.
    expect(
      stackMagnitudes(research, [204, 204], { ablation: neutralizing('research-rate') }).value,
    ).not.toBe(0);
  });

  it('multiplicative-on-remainder prevents nothing, so the whole effect survives', () => {
    const ward = primitive('ward');
    expect(ward.stacking).toBe('multiplicative-on-remainder');

    expect(stackMagnitudes(ward, [HALF, HALF]).value).toBe(768);
    const prevented = stackMagnitudes(ward, [HALF, HALF], {
      ablation: neutralizing('ward'),
    }).value;
    expect(prevented).toBe(0);
    expect(applyWard(fromInt(10), prevented)).toBe(fromInt(10));
  });

  it('max contributes 0, including when every source is a debuff', () => {
    const blink = primitive('blink');
    expect(blink.stacking).toBe('max');

    // `maxOf` seeds from the first magnitude rather than from zero, so an
    // all-negative set stacks to -50 unablated. Neutralizing must reach 0 —
    // "contributes nothing" — rather than inheriting that seeding.
    expect(stackMagnitudes(blink, [-100, -50]).value).toBe(-50);
    expect(stackMagnitudes(blink, [-100, -50], { ablation: neutralizing('blink') }).value).toBe(0);
    expect(stackMagnitudes(blink, [fromInt(4), fromInt(9)]).value).toBe(fromInt(9));
    expect(
      stackMagnitudes(blink, [fromInt(4), fromInt(9)], { ablation: neutralizing('blink') }).value,
    ).toBe(0);
  });

  it('a presence gate reads as absent', () => {
    const portal = primitive('portal');
    expect(portal.stacking).toBe('presence');

    expect(stackMagnitudes(portal, [FP_ONE]).value).toBe(FP_ONE);
    expect(stackMagnitudes(portal, [FP_ONE], { ablation: neutralizing('portal') }).value).toBe(0);
  });

  it('a capped additive primitive neutralizes through the same cap path', () => {
    // `lifespan` is the one cap that needs the caller's species base. The
    // ablated arm must take the same path, not a shortcut that skips the cap
    // and therefore skips the error a missing base would raise.
    const lifespan = primitive('lifespan');
    const speciesBase = fromInt(600);
    const options = { speciesBase, ablation: neutralizing('lifespan') };

    expect(stackMagnitudes(lifespan, [fromInt(400)], { speciesBase }).value).toBe(fromInt(300));
    expect(stackMagnitudes(lifespan, [fromInt(400)], options).value).toBe(0);
    expect(() => stackMagnitudes(lifespan, [fromInt(400)], { ablation: options.ablation })).toThrow(
      /speciesBase/,
    );
  });
});

describe('the declared identity and the rule’s own empty case agree', () => {
  /**
   * Two artefacts, checked against each other rather than against a third copy.
   *
   * {@link NEUTRALIZED_MAGNITUDE} is the declared rule — the thing task 7.9's
   * conformance check reads. `stacking.ts` separately documents what each rule
   * returns for zero sources. They must be the same number, because
   * neutralization *is* "this primitive contributed no sources"; if someone
   * changes one, this fails rather than the two drifting into a disagreement
   * that only shows up as a biased attribution six months later.
   */
  const emptyCase: Readonly<Record<PrimitiveStacking, Fixed>> = {
    additive: additive([]),
    'summed-then-single-ward': additive([]),
    'additive-into-multiplier': additiveIntoMultiplier([]),
    'multiplicative-on-remainder': multiplicativeOnRemainder([]),
    max: maxOf([]),
    presence: presence([]),
  };

  for (const [stacking, value] of Object.entries(emptyCase)) {
    it(`${stacking} declares the same identity its rule produces for no sources`, () => {
      expect(neutralizedMagnitude(stacking as PrimitiveStacking)).toBe(value);
    });
  }

  it('declares an identity for every stacking class the registry uses', () => {
    for (const entry of registry.primitives) {
      expect(() => neutralizedMagnitude(entry.record.stacking)).not.toThrow();
    }
  });

  it('refuses an unrecognised stacking class instead of defaulting to zero', () => {
    // A stacking rule added to the schema without a neutralization rule must
    // stop the ablation, not quietly become "contributes 0" — which is the
    // right answer for four of the six classes and catastrophically wrong for
    // the fifth.
    expect(() => neutralizedMagnitude('geometric-mean' as PrimitiveStacking)).toThrow(
      /geometric-mean/,
    );
    expect(() => neutralizedMagnitude('geometric-mean' as PrimitiveStacking)).toThrow(
      /neutralization/i,
    );
  });

  it('exposes the table as data, covering exactly the declared classes', () => {
    expect(Object.keys(NEUTRALIZED_MAGNITUDE).sort()).toEqual(Object.keys(emptyCase).sort());
  });
});

describe('the mask reaches only the primitive it names', () => {
  it('leaves every other primitive at its unablated value', () => {
    const ward = primitive('ward');
    const blink = primitive('blink');
    const mask = neutralizing('ward');

    expect(stackMagnitudes(blink, [fromInt(9)], { ablation: mask }).value).toBe(fromInt(9));
    expect(stackMagnitudes(ward, [HALF], { ablation: mask }).value).toBe(0);
  });

  it('does not count a clamp for a primitive it neutralized', () => {
    // Cap pressure is a balance finding (`caps.ts`). An ablated arm reporting
    // that `worship-yield` pinned its ceiling would be reporting pressure from
    // a primitive that did nothing that run.
    const worship = primitive('worship-yield');
    const enormous = [fromInt(9)];

    const control = new ClampCounters();
    expect(stackMagnitudes(worship, enormous, { counters: control }).clamped).toBe(true);
    expect(control.count('worship-yield')).toBe(1);

    const ablated = new ClampCounters();
    const outcome = stackMagnitudes(worship, enormous, {
      counters: ablated,
      ablation: neutralizing('worship-yield'),
    });
    expect(outcome).toEqual({ value: FP_ONE, clamped: false });
    expect(ablated.total()).toBe(0);
  });
});
