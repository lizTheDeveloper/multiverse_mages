/*
 * Multiverse Mages — the observation's shape is a constant, not a consequence.
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
 * Tasks 4.1, 4.2 and 4.7, and the `observation-action-space` scenarios *"shape
 * is constant across universes"*, *"shape is constant across scales"*, and *"v1
 * content yields a sparse vector"*.
 *
 * The block sizes are asserted against `contracts.md` §4.1's table one row at a
 * time rather than only in aggregate. A total that matches while two blocks are
 * swapped is exactly the failure a sum cannot see, and it is a failure with no
 * symptom: every vector would be the right length and every channel would mean
 * something else.
 */

import { TIME_MODE } from '@mm/sim-core';
import { EDICT_BUDGET_MAX, GRID_CELL_COUNT, RAID_SIDE, inEngagement } from '@mm/state';
import {
  OBSERVATION_BLOCKS,
  OBSERVATION_BLOCK_NAMES,
  OBSERVATION_SIZE,
  observationBlock,
  rawObservation,
} from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

import { FIXTURE_CATALOGUE, engageWorld, firstUniverse, secondUniverse } from './fixtures.js';

describe('contracts.md §4.1 block table', () => {
  it('sizes each block exactly as the document does', () => {
    // Transcribed from §4.1's table. Written as literals on purpose: deriving
    // them from the implementation would make this test agree with whatever the
    // implementation happens to do.
    const expected: Record<string, number> = {
      ruleset: 19 + 2 * EDICT_BUDGET_MAX,
      tradition: 1,
      resources: 5,
      population: 6 * 5,
      mages: 6 * 8, // seven tiers plus slot 0, the untaught
      knowledge: 70 * 3,
      institutions: 4,
      clock: 3,
      engagement: 64,
    };
    for (const name of OBSERVATION_BLOCK_NAMES) {
      expect(observationBlock(name).size, `block ${name}`).toBe(expected[name]);
    }
  });

  it('totals 400, and the total is the sum of the blocks', () => {
    // 394 until core-contracts widened the mage block from 7 tier slots to 8.
    // A mage who knew nothing was counted in no bucket and no other block
    // carries a living-mage count, so an all-zero mage block was ambiguous
    // between an empty universe and a young one.
    expect(OBSERVATION_SIZE).toBe(400);
    expect(OBSERVATION_BLOCKS.reduce((total, block) => total + block.size, 0)).toBe(400);
  });

  it('lays the blocks out contiguously, in the order the document lists them', () => {
    let cursor = 0;
    for (const [index, block] of OBSERVATION_BLOCKS.entries()) {
      expect(block.name).toBe(OBSERVATION_BLOCK_NAMES[index]);
      expect(block.offset).toBe(cursor);
      cursor += block.size;
    }
    expect(cursor).toBe(OBSERVATION_SIZE);
  });

  it('is sized from the full space, not from the v1 subset', () => {
    // §2.2 flags 12 of the 70 cells as v1. The knowledge block spans all 70.
    expect(observationBlock('knowledge').size).toBe(GRID_CELL_COUNT * 3);
    expect(observationBlock('knowledge').size).not.toBe(12 * 3);
  });
});

describe('task 4.7 — shape is constant', () => {
  it('is identical across two universes that differ in every readable way', () => {
    const first = firstUniverse();
    const second = secondUniverse();
    const a = rawObservation({ state: first.state, catalogue: FIXTURE_CATALOGUE });
    const b = rawObservation({ state: second.state, catalogue: FIXTURE_CATALOGUE });

    expect(a.length).toBe(OBSERVATION_SIZE);
    expect(b.length).toBe(OBSERVATION_SIZE);
    // The control: the two must genuinely differ, or "same length" is a claim
    // about two copies of one vector.
    expect([...a]).not.toEqual([...b]);
  });

  it('is identical in both clock modes, from the same universe', () => {
    const world = firstUniverse();
    const atWorldScale = rawObservation({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    expect(world.state.clock.mode).toBe(TIME_MODE.world);

    const engagement = engageWorld(world);
    expect(inEngagement(world.state)).toBe(true);
    const inRaid = rawObservation({
      state: world.state,
      catalogue: FIXTURE_CATALOGUE,
      engagement: { engagement, ownSide: RAID_SIDE.defender },
    });

    expect(inRaid.length).toBe(atWorldScale.length);
    expect(inRaid.length).toBe(OBSERVATION_SIZE);
  });

  it('does not change length when the world empties out entirely', () => {
    // No mages and no universe at all — the degenerate case a length derived
    // from what the world happens to contain would get wrong. Every block is
    // zero-filled here and the vector is still 400 wide.
    const empty = secondUniverse();
    for (const handle of empty.mages) {
      empty.state.entities.destroy(handle);
    }
    empty.state.entities.destroy(empty.universe);
    expect(
      rawObservation({ state: empty.state, catalogue: FIXTURE_CATALOGUE }).length,
    ).toBe(OBSERVATION_SIZE);
  });
});

describe('task 4.2 — the engagement block', () => {
  it('is 64 wide and always present', () => {
    expect(observationBlock('engagement').size).toBe(64);
  });

  it('is entirely zero at world scale', () => {
    const world = firstUniverse();
    const view = rawObservation({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    const { offset, size } = observationBlock('engagement');
    expect([...view.slice(offset, offset + size)]).toEqual(Array.from({ length: size }, () => 0));
  });

  it('carries side summaries, objective slots and portal stability during a raid', () => {
    const world = firstUniverse();
    const engagement = engageWorld(world);
    const view = rawObservation({
      state: world.state,
      catalogue: FIXTURE_CATALOGUE,
      engagement: { engagement, ownSide: RAID_SIDE.defender },
    });
    const { offset, size } = observationBlock('engagement');
    const block = [...view.slice(offset, offset + size)];

    // Own side is the defender: one combatant, one prepared spell.
    expect(block[0]).toBe(1);
    expect(block[6]).toBe(1);
    // Enemy side is the attacker: two combatants, two prepared spells.
    expect(block[7]).toBe(2);
    expect(block[13]).toBe(2);

    // Objectives rank by descending value, so the 9-favor one takes slot 0.
    expect(block[14 + 2]).toBe(9 * 1024);
    expect(block[14 + 4 + 2]).toBe(2 * 1024);
    // Unused objective slots stay zero-filled.
    expect(block.slice(14 + 2 * 4, 14 + 12 * 4)).toEqual(
      Array.from({ length: 10 * 4 }, () => 0),
    );

    // Portal stability and its decay close the block.
    expect(block[62]).toBe(600);
    expect(block[63]).toBe(3);
  });

  it('puts the observing universe own side first, whichever side that is', () => {
    const asDefender = firstUniverse();
    const defenderView = rawObservation({
      state: asDefender.state,
      catalogue: FIXTURE_CATALOGUE,
      engagement: { engagement: engageWorld(asDefender), ownSide: RAID_SIDE.defender },
    });

    const asAttacker = firstUniverse();
    const attackerView = rawObservation({
      state: asAttacker.state,
      catalogue: FIXTURE_CATALOGUE,
      engagement: { engagement: engageWorld(asAttacker), ownSide: RAID_SIDE.attacker },
    });

    const { offset } = observationBlock('engagement');
    // The same raid read from the two sides: own-side combatant counts swap.
    expect(defenderView[offset]).toBe(1);
    expect(attackerView[offset]).toBe(2);
    expect(defenderView[offset + 7]).toBe(2);
    expect(attackerView[offset + 7]).toBe(1);
  });
});
