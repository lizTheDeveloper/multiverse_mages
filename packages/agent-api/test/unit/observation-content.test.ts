/*
 * Multiverse Mages — what each observation block actually says.
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
 * Task 4.1's other half. `observation-shape.test.ts` proves the vector is the
 * right *size*; this proves the channels carry what §4.1 says they carry.
 *
 * Both are needed and neither implies the other. A vector of the right length
 * whose population block holds mage counts passes every shape assertion ever
 * written, and would train a policy on a quantity nobody intended.
 */

import { EDICT_KIND, OCCUPATION, cellIdAt } from '@mm/state';
import {
  OBSERVATION_SPECIES_COUNT,
  cohortSlot,
  knowledgeSlot,
  UNTAUGHT_TIER_SLOT,
  mageTierSlot,
  observationBlock,
  rawObservation,
  speciesSlot,
} from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

import { FIXTURE_CATALOGUE, FP, firstUniverse } from './fixtures.js';

function observationOf(): Int32Array {
  const world = firstUniverse();
  return rawObservation({ state: world.state, catalogue: FIXTURE_CATALOGUE });
}

describe('the ruleset block', () => {
  it('writes 19 axis bits then EDICT_BUDGET_MAX (cellId, kind) pairs', () => {
    const view = observationOf();
    const { offset } = observationBlock('ruleset');
    // permittedTechniques 0b00111, permittedForms 0b00000000111111.
    expect([...view.slice(offset, offset + 5)]).toEqual([1, 1, 1, 0, 0]);
    expect([...view.slice(offset + 5, offset + 19)]).toEqual([
      1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);

    // One interdiction on rego-limen-ish cell (1,2), then zero padding.
    expect(view[offset + 19]).toBe(cellIdAt(1, 2));
    expect(view[offset + 20]).toBe(EDICT_KIND.interdiction);
    expect([...view.slice(offset + 21, offset + 35)]).toEqual(
      Array.from({ length: 14 }, () => 0),
    );
  });
});

describe('the tradition and resources blocks', () => {
  it('carries the five resources of §4.1 in the order the document lists them', () => {
    const view = observationOf();
    expect(view[observationBlock('tradition').offset]).toBe(2);

    const { offset } = observationBlock('resources');
    expect([...view.slice(offset, offset + 5)]).toEqual([
      40 * FP, // favor
      12 * FP, // worship
      3, // worshipTier
      500 * FP, // materials
      2 * FP, // prestige
    ]);
  });
});

describe('the population block', () => {
  it('counts cohorts by species and occupation, and leaves the rest zero', () => {
    const view = observationOf();
    const { offset, size } = observationBlock('population');
    expect(view[offset + cohortSlot(1, OCCUPATION.laborer)]).toBe(40_000);
    expect(view[offset + cohortSlot(1, OCCUPATION.student)]).toBe(900);
    expect(view[offset + cohortSlot(3, OCCUPATION.scribe)]).toBe(120);

    const nonZero = [...view.slice(offset, offset + size)].filter((value) => value !== 0);
    expect(nonZero).toHaveLength(3);
  });

  it('refuses a species the observation was not sized for', () => {
    // Not a "handles gracefully" test — the point is that it throws. A seventh
    // species that silently vanished from the block would read as a population
    // that never grew, which looks like a balance result rather than a bug.
    expect(() => speciesSlot(OBSERVATION_SPECIES_COUNT + 1)).toThrow(/contract change/);
    expect(() => speciesSlot(0)).toThrow(/no observation slot/);
  });
});

describe('the mages block', () => {
  it('counts living mages by species and highest tier known', () => {
    const view = observationOf();
    const { offset, size } = observationBlock('mages');
    // Mage 0 (species 1) knows a tier-3 node; mage 2 (species 3) a tier-6 one.
    expect(view[offset + mageTierSlot(1, 3)]).toBe(1);
    expect(view[offset + mageTierSlot(3, 6)]).toBe(1);

    // Mage 1 knows nothing, and she lands in slot 0 rather than vanishing. This
    // test previously asserted she was counted nowhere, which locked in the
    // defect the eighth slot exists to fix: with seven slots an all-zero mage
    // block could not be told apart from an empty universe.
    expect(view[offset + mageTierSlot(1, UNTAUGHT_TIER_SLOT)]).toBe(1);

    // Mage 3 is dead, and stays uncounted — that one is §1.2's `alive`, not a
    // bucketing gap.
    const total = [...view.slice(offset, offset + size)].reduce((sum, value) => sum + value, 0);
    expect(total).toBe(3);
  });
});

describe('the knowledge block', () => {
  it('reports nodes known, deepest tier, and instance count per cell', () => {
    const view = observationOf();
    const { offset } = observationBlock('knowledge');

    // Cell (0,0) holds nodes 1 and 2. Node 1 has three instances — one in a
    // mind, two shelved — and node 2 one. Deepest tier is node 2's, 3.
    const first = offset + knowledgeSlot(cellIdAt(0, 0));
    expect([...view.slice(first, first + 3)]).toEqual([2, 3, 4]);

    // Cell (2,5) holds nodes 3 and 4: one instance each, deepest tier 6.
    const second = offset + knowledgeSlot(cellIdAt(2, 5));
    expect([...view.slice(second, second + 3)]).toEqual([2, 6, 2]);

    // A cell nobody knows anything in stays zero — the "v1 yields a sparse
    // vector" scenario, for one of the 58 non-v1 cells.
    const empty = offset + knowledgeSlot(cellIdAt(3, 9));
    expect([...view.slice(empty, empty + 3)]).toEqual([0, 0, 0]);
  });
});

describe('the institutions and clock blocks', () => {
  it('counts universities, capacity, library depth and grimoires', () => {
    const view = observationOf();
    const { offset } = observationBlock('institutions');
    // Library depth is *distinct nodes* held in libraries — nodes 1 and 3 —
    // not the three shelved copies of them.
    expect([...view.slice(offset, offset + 4)]).toEqual([1, 240, 2, 1]);
  });

  it('reports worldTick, era and mode', () => {
    const view = observationOf();
    const { offset } = observationBlock('clock');
    expect([...view.slice(offset, offset + 3)]).toEqual([0, 0, 0]);
  });
});
