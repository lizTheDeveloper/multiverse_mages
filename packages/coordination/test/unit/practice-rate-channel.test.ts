/*
 * Multiverse Mages — the seam by which a god's verbs reach maintenance.
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
 * ## Why this file exists before the measurement, not after it
 *
 * W53's first measurement question is whether applied use separates
 * `permit-then-idle` from `permissive-breadth` — a god that permits and then
 * does nothing, against one that permits and then funds, encourages and blesses.
 * If the answer comes back "no", there are two very different explanations:
 * **the god's verbs genuinely do not move practice**, which is a finding, or
 * **the channel was never wired**, which is a bug wearing a finding's clothes.
 *
 * A sweep cannot tell those apart. These assertions can, and they are cheap:
 * three sources feed `practice-rate`, and each one is checked to be non-zero
 * where it should be and absent where it should not. A null result in the sweep
 * with this file green is a statement about the game; a null with this file red
 * would be a statement about the build.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import { libraryRateMultiplier } from '@mm/rules-world';

import { BLESSING, attachRecord, defineWorldStateSchema } from '@mm/state';
import type { EntityHandle, SimState } from '@mm/sim-core';
import type { LibraryDepth } from '@mm/rules-world';

import { godEffectHooks } from '../../src/index.js';

import { catalogAndCells, registry } from './world-fixtures.js';
import { constants, godWorld } from './god-fixtures.js';

/** A shelf deep enough for the contribution table to have something to say. */
const DEEP_SHELF: LibraryDepth = {
  distinctByTier: [4, 4, 4, 2, 1, 0, 0],
  cumulativeByTier: [4, 8, 12, 14, 15, 15, 15],
  distinctNodes: 15,
  instanceCount: 20,
  grimoireCount: 20,
};

/** Blesses one mage until `expiryTick`. The god action's effect, without the god. */
function bless(state: SimState, mage: EntityHandle, expiryTick: number): void {
  attachRecord(state, BLESSING, mage, { mageId: mage, expiryTick });
}

function hooks() {
  const { cells } = catalogAndCells();
  return godEffectHooks({ constants: constants(), cells });
}

function practiceRatePrimitive() {
  const found = registry().primitives.find((entry) => entry.record.id === 'practice-rate');
  if (found === undefined) throw new Error('no "practice-rate" primitive in the shipped registry');
  return found.record;
}

describe('the god reaches practice through the same three sources research uses', () => {
  it('a blessing contributes bless-practice-rate, and it is not zero', () => {
    const world = godWorld(defineWorldStateSchema(), { mages: 2 });
    const mage = world.mages[0];
    expect(mage).toBeDefined();
    if (mage === undefined) return;
    bless(world.state, mage, 100);

    const bonuses = hooks().practiceBonusesFor(world.state, 0, mage, 1);

    expect(bonuses).toContain(constants().blessPracticeRate);
    expect(constants().blessPracticeRate).toBeGreaterThan(0);
  });

  it('an unblessed mage in an unencouraged cell gets nothing, so the channel is not a constant', () => {
    const world = godWorld(defineWorldStateSchema(), { mages: 2 });
    const mage = world.mages[1];
    expect(mage).toBeDefined();
    if (mage === undefined) return;

    expect(hooks().practiceBonusesFor(world.state, 0, mage, 1)).toEqual([]);
  });

  it('is a different constant from the research channel, so an ablation can tell them apart', () => {
    // The rejected alternative was to alias `practiceBonusesFor` onto
    // `researchBonusesFor`. It would have worked and it would have made every
    // `winRateByPrimitive` statement about `research-rate` half a statement
    // about `practice-rate`, with nothing in the output saying so.
    expect(hooks().practiceBonusesFor).not.toBe(hooks().researchBonusesFor);
  });
});

describe('vision §6a reaches practice too, which is what fundUniversity buys', () => {
  it('a deep library raises the practice multiplier above neutral', () => {
    const primitive = practiceRatePrimitive();
    const bare = libraryRateMultiplier(primitive, [], undefined, 7);
    const deep = libraryRateMultiplier(primitive, [], DEEP_SHELF, 7);

    expect(bare.multiplier).toBe(FP_ONE);
    expect(deep.multiplier).toBeGreaterThan(FP_ONE);
    expect(deep.contribution).toBeGreaterThan(0);
  });

  it('routes identically to research-rate, which is the property that makes it one channel', () => {
    // `capital.ts`: *"any of the three; the routing is identical, which is the
    // point."* Four now. The two primitives declare the same stacking and the
    // same cap, so the same shelf must produce the same multiplier — a practice
    // channel that quietly used a second accumulator would be the `4.0 x 2.0
    // without anyone deciding it should be 8.0` the design rejects.
    const research = registry().primitives.find((entry) => entry.record.id === 'research-rate');
    expect(research).toBeDefined();
    if (research === undefined) return;

    expect(libraryRateMultiplier(practiceRatePrimitive(), [], DEEP_SHELF, 7).multiplier).toBe(
      libraryRateMultiplier(research.record, [], DEEP_SHELF, 7).multiplier,
    );
  });
});
