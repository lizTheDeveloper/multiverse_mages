/*
 * Multiverse Mages — applied magic makes materials in the kinds its form is
 * made of, costs the mage's rations, and obeys the one stacking rule.
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
 * The arithmetic of `GOAL.applyMagic`, tested apart from the loop that spends
 * it. Two claims run through the file and both are `application.ts`'s reasons
 * for existing:
 *
 * - **`resource-yield` is a multiplier and is used as one.** A node's magnitude
 *   never becomes an absolute quantity of grain; it goes through
 *   `stackMagnitudes` under `contracts.md` §3's `(1 + Σ)` rule and its cap, and
 *   the base quantity is the content scalar beside it.
 * - **Which material a mage makes is a fact about her node's form**, routed
 *   through the same `routeYieldByForm` table the ambient multiplier uses, so a
 *   Terram caster quarries and a form that is not a material makes nothing.
 */

import { describe, expect, it } from 'vitest';

import type { Fixed } from '@mm/sim-core';
import { FP_ONE } from '@mm/sim-core';
import type { FormRecord } from '@mm/content';
import { ClampCounters, neutralizing } from '@mm/primitives';

import {
  APPLICATION_TUNING_STATUS,
  MATERIALS_PER_LABORER,
  NO_MATERIALS,
  REQUIRED_APPLICATION_WEIGHTS,
  SUBSISTENCE_PER_PERSON,
  appliedYield,
  applicationRations,
  formRoutesToMaterials,
  readApplicationWeights,
  totalAmount,
} from '../../src/index.js';
import type { ApplicationWeights } from '../../src/index.js';

import { primitiveNamed, shippedRegistry } from './universities-fixtures.js';

/** A form record with everything but `yieldWeights` held neutral. */
function form(yieldWeights: Partial<Record<'food' | 'stone' | 'vellum', number>>): FormRecord {
  return {
    id: 'fixture-form',
    name: 'Fixture Form',
    gloss: 'A synthetic form for the applied-work arithmetic.',
    bit: 0,
    yieldWeights: {
      food: 0,
      stone: 0,
      vellum: 0,
      labor: 0,
      essence: 0,
      insight: 0,
      passage: 0,
      ...yieldWeights,
    },
    tuningStatus: 'untuned',
  };
}

/** Round numbers, so a routing assertion is about routing and not about rounding. */
const WEIGHTS: ApplicationWeights = { outputPerMonth: 64, rationPerMonth: 4 };

const resourceYield = primitiveNamed('resource-yield');

function yieldOf(
  yieldWeights: Partial<Record<'food' | 'stone' | 'vellum', number>>,
  magnitudes: readonly Fixed[],
  extra: { months?: Fixed; weights?: ApplicationWeights; counters?: ClampCounters } = {},
) {
  return appliedYield({
    weights: extra.weights ?? WEIGHTS,
    months: extra.months ?? FP_ONE,
    form: form(yieldWeights),
    resourceYield,
    magnitudes,
    ...(extra.counters === undefined ? {} : { counters: extra.counters }),
  });
}

describe('the shipped weights are read by name and are untuned', () => {
  it('reads both scalars out of autonomy-weight.json', () => {
    const weights = readApplicationWeights(shippedRegistry());
    expect(weights.outputPerMonth).toBeGreaterThan(0);
    expect(weights.rationPerMonth).toBeGreaterThan(0);
  });

  it('names exactly the ids the loader requires of the table', () => {
    // Both directions, which is the whole point of `REQUIRED_AUTONOMY_WEIGHTS`
    // holding these two: an id this module reads and the table does not declare
    // would arrive as `0`, and a mage would apply magic for nothing while every
    // test that supplied a weight went on passing.
    expect([...REQUIRED_APPLICATION_WEIGHTS]).toEqual([
      'apply-output-per-month',
      'apply-ration-per-month',
    ]);
    for (const id of REQUIRED_APPLICATION_WEIGHTS) {
      expect(() => shippedRegistry().autonomyWeight(id)).not.toThrow();
    }
  });

  it('refuses an id the source does not declare rather than defaulting it', () => {
    expect(() =>
      readApplicationWeights({
        autonomyWeight: () => {
          throw new Error('no such weight');
        },
      }),
    ).toThrow();
  });

  it('declares itself untuned, because no balance claim is possible before 0.5.0', () => {
    expect(APPLICATION_TUNING_STATUS).toBe('untuned');
  });

  it('prices a mage-month against the laborer-month beside it, in one unit', () => {
    // The comparison `application.ts` says the two scalars exist to make
    // possible. Not an assertion that either number is right — both are
    // untuned — but that they are denominated the same way, so "is an archmage
    // in a field worth more than the peasants she displaces" is a question the
    // content set can be asked at all.
    const weights = readApplicationWeights(shippedRegistry());
    expect(weights.outputPerMonth).toBeGreaterThan(MATERIALS_PER_LABORER);
    expect(weights.rationPerMonth).toBeGreaterThan(SUBSISTENCE_PER_PERSON);
  });
});

describe('a month of applied magic makes materials in the kinds of its form', () => {
  it('routes the whole output to one kind when the form is made of one thing', () => {
    // Terram's shipped weights: all 1024 to stone. At the identity multiplier
    // the mage makes exactly the base scalar, and she makes it in stone.
    expect(yieldOf({ stone: FP_ONE }, [])).toEqual({ food: 0, stone: 64, vellum: 0 });
  });

  it('splits it when the form is made of two, as Herbam and Animal are', () => {
    expect(yieldOf({ food: 512, vellum: 512 }, [])).toEqual({ food: 32, stone: 0, vellum: 32 });
  });

  it('makes nothing at all for a form whose material is not a material', () => {
    // Mentem, Vim, Umbra, Fatum, Limen, Imaginem and Corpus all carry all-zero
    // weights, and `kinds.ts` states that as a design position rather than an
    // omission: shadow magic feeds nobody. Spending a month on it does not
    // change that.
    expect(yieldOf({}, [4096])).toEqual(NO_MATERIALS);
  });

  it('scales linearly in the months spent', () => {
    const whole = totalAmount(yieldOf({ stone: FP_ONE }, []));
    const half = totalAmount(yieldOf({ stone: FP_ONE }, [], { months: FP_ONE / 2 }));
    expect(half * 2).toBe(whole);
  });

  it('makes nothing for a month that was not spent', () => {
    expect(yieldOf({ stone: FP_ONE }, [], { months: 0 })).toEqual(NO_MATERIALS);
    expect(yieldOf({ stone: FP_ONE }, [], { months: -FP_ONE })).toEqual(NO_MATERIALS);
  });
});

describe('the node magnitude is a multiplier, not a quantity', () => {
  it('reads a magnitude of fp(1) as doubling the base rather than as adding one', () => {
    // `(1 + Σ)`. A magnitude equal to `FP_ONE` is "+100%", so the output is
    // twice the scalar — not the scalar plus one, which is what reading the
    // magnitude as a quantity of stone would give.
    expect(yieldOf({ stone: FP_ONE }, [FP_ONE])).toEqual({ food: 0, stone: 128, vellum: 0 });
  });

  it('folds several magnitudes on one node into one multiplier', () => {
    expect(yieldOf({ stone: FP_ONE }, [FP_ONE / 2, FP_ONE / 2])).toEqual({
      food: 0,
      stone: 128,
      vellum: 0,
    });
  });

  it('caps through the shared implementation and reports the clamp', () => {
    // `contracts.md` §3's cap belongs to `@mm/primitives` and is not restated
    // here. A counter that never increments and one that always does look the
    // same in the output, which is why `stackMagnitudes` takes one.
    const counters = new ClampCounters();
    const huge = yieldOf({ stone: FP_ONE }, [1_000_000], { counters });
    const capped = yieldOf({ stone: FP_ONE }, [2_000_000], { counters });
    expect(huge).toEqual(capped);
    expect(counters.total()).toBeGreaterThan(0);
  });

  it('neutralizes to the bare base under an ablation of resource-yield', () => {
    // §9's arm: the magic was researched, taught and paid for, and produced
    // nothing beyond the month itself. Threaded rather than simulated by
    // passing an empty magnitude list, which would be a universe that never
    // learned the node at all.
    const ablated = appliedYield({
      weights: WEIGHTS,
      months: FP_ONE,
      form: form({ stone: FP_ONE }),
      resourceYield,
      magnitudes: [FP_ONE * 3],
      ablation: neutralizing(resourceYield.id),
    });
    expect(ablated).toEqual({ food: 0, stone: 64, vellum: 0 });
  });
});

describe('an applying mage eats', () => {
  it('owes one ration per applying mage', () => {
    expect(applicationRations(0, WEIGHTS)).toBe(0);
    expect(applicationRations(3, WEIGHTS)).toBe(12);
  });

  it('refuses a fractional or negative count rather than rounding it into free food', () => {
    expect(() => applicationRations(-1, WEIGHTS)).toThrow(/non-negative integer/u);
    expect(() => applicationRations(1.5, WEIGHTS)).toThrow(/non-negative integer/u);
  });
});

describe('a form routes somewhere, or a mage should not be offered it', () => {
  it('is true of every shipped form with a material behind it', () => {
    const routing = shippedRegistry()
      .forms.filter((entry) => formRoutesToMaterials(entry.record))
      .map((entry) => entry.record.id);
    // The seven forms `kinds.ts` names as carrying all-zero weights are exactly
    // the ones missing, and the assertion is written as the positive list so a
    // content edit that silently zeroed a form's weights fails here.
    expect(routing.sort()).toEqual(['animal', 'aquam', 'auram', 'herbam', 'ignem', 'nomen', 'terram']);
  });

  it('is false for a form with nothing behind it', () => {
    expect(formRoutesToMaterials(form({}))).toBe(false);
  });
});
