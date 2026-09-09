/*
 * Multiverse Mages — the target-appeal weight table, and the two checks that
 * keep the god from choosing what a mage studies.
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
 * `autonomy-weight.json` carries **two** god-owned magnitudes now — the role
 * bound, which is what the god's standing-role instruction is worth, and the
 * emphasis bound, which is what `encourageResearch` is worth. Each is checked
 * against the same five mage-owned bounds and neither against the other, and
 * this file is where that distinction is exercised rather than merely written
 * down: folding them into one sum would let a raise in either hide behind the
 * other and still load.
 *
 * Every check runs twice, once against the shipped table and once against a
 * table broken in exactly the way the check exists to catch, for the reason
 * `god-tables.test.ts` gives: a validator that only ever runs against a healthy
 * tree cannot tell *"found nothing"* from *"looks for nothing"*.
 */

import { describe, expect, it } from 'vitest';

import type { AutonomyWeightRecord } from '@mm/content';
import {
  REQUIRED_AUTONOMY_WEIGHTS,
  checkAutonomyWeights,
  loadContent,
  shippedContentSource,
} from '@mm/content';

import { shippedDocuments } from './fixtures.js';

const registry = loadContent(shippedContentSource());

function weights(): AutonomyWeightRecord[] {
  return shippedDocuments()['autonomy-weight.json'] as unknown as AutonomyWeightRecord[];
}

function primitives(): Parameters<typeof checkAutonomyWeights>[1] {
  return registry.primitives.map((entry) => entry.record);
}

/** The table with one scalar moved, and everything else verbatim. */
function withValue(id: string, value: number): AutonomyWeightRecord[] {
  return weights().map((record) => (record.id === id ? { ...record, value } : record));
}

/** The sum of the five bounds a mage owns. Both god-owned bounds sit under it. */
function mageOwnedSum(): number {
  return [
    'target-bound-effort',
    'target-bound-affinity',
    'target-bound-species',
    'target-bound-age',
    'target-bound-personality',
  ].reduce((sum, id) => sum + registry.autonomyWeight(id), 0);
}

describe('the shipped weight table', () => {
  it('declares every scalar target selection reads by name', () => {
    for (const id of REQUIRED_AUTONOMY_WEIGHTS) {
      expect(() => registry.autonomyWeight(id)).not.toThrow();
    }
  });

  it('passes its own checks', () => {
    expect(checkAutonomyWeights(weights(), primitives())).toEqual([]);
  });

  it('leaves both god-owned bounds under what a mage can say back', () => {
    expect(registry.autonomyWeight('target-bound-role')).toBeLessThan(mageOwnedSum());
    expect(registry.autonomyWeight('target-bound-emphasis')).toBeLessThan(mageOwnedSum());
  });
});

describe('an emphasis that could outvote a mage fails the load', () => {
  it('refuses a bound at the sum of the five mage-owned bounds', () => {
    const broken = withValue('target-bound-emphasis', mageOwnedSum());
    expect(checkAutonomyWeights(broken, primitives()).map((entry) => entry.message)).toEqual([
      expect.stringMatching(/deletes the autonomy the whole design rests on/u),
    ]);
  });

  it('does not let the role bound borrow room from the emphasis bound', () => {
    // The distinguishing case, and the reason the emphasis bound is checked
    // against the same five rather than being added to them. A role bound of
    // `mageOwnedSum()` is refused; if the emphasis bound had been folded into
    // the sum the role is measured against, this exact table would load.
    const broken = withValue('target-bound-role', mageOwnedSum());
    expect(mageOwnedSum() + registry.autonomyWeight('target-bound-emphasis')).toBeGreaterThan(
      mageOwnedSum(),
    );
    expect(checkAutonomyWeights(broken, primitives()).map((entry) => entry.message)).toEqual([
      expect.stringMatching(/role-as-filter arriving by tuning edit/u),
    ]);
  });

  it('refuses a bound of zero as an ablation rather than a tuning value', () => {
    const broken = withValue('target-bound-emphasis', 0);
    expect(checkAutonomyWeights(broken, primitives()).map((entry) => entry.message)).toEqual([
      expect.stringMatching(/ablation rather than a tuning value/u),
    ]);
  });

  it('refuses a divisor below one, which floorDiv cannot take', () => {
    const broken = withValue('target-emphasis-divisor', 0);
    expect(checkAutonomyWeights(broken, primitives()).map((entry) => entry.message)).toEqual([
      expect.stringMatching(/It divides/u),
    ]);
  });
});
