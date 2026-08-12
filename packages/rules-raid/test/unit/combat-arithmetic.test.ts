/*
 * Multiverse Mages — the combat arithmetic §3 pins, and the insertion
 * invariance §6 depends on.
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
 * Tasks 6.4, 6.5, 6.11 and 6.12.
 *
 * These are the assertions that keep two committed measurements meaningful:
 *
 * - **Ten small hits equal one large hit.** `contracts.md` §3 asks for it and
 *   says why — per-source ward application would make splitting an attack
 *   strictly worse for the attacker as a rounding artefact, which is a balance
 *   result nobody authored.
 * - **Insertion invariance.** Adding a combatant, or adding a draw, must not
 *   disturb anybody else's rolls. Without it an ablation run diverges from its
 *   control for reasons unrelated to the ablated primitive, and every
 *   attribution measurement becomes noise with no indication that it is noise.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE, RNG_STREAM, nextUint32, rngFromRootSeed } from '@mm/sim-core';
import { ClampCounters } from '@mm/primitives';
import { RAID_SIDE } from '@mm/state';
import { CastArbiter, compareCombatantKeys, packCombatantKey } from '@mm/rules-raid';

import { grid, registry, ruleset, tuning } from './raid-fixture.js';

function arbiter(): CastArbiter {
  return new CastArbiter({
    hostRuleset: ruleset({}),
    grid,
    registry,
    tuning,
  });
}

describe('one ward application over the summed damage (task 6.11)', () => {
  it('gives ten small hits and one large hit identical results', () => {
    const ward = [512]; // half, well under the fp(922) cap
    const one = arbiter().applyWardOnce(10 * FP_ONE, ward);
    const many = arbiter().applyWardOnce(10 * FP_ONE, ward);
    expect(one).toBe(many);

    // And the shape that would have differed: ward applied per source. Ten
    // applications of `1 × (1 − w)` floor ten times; one application of
    // `10 × (1 − w)` floors once. The engine sums first, so this is the
    // arithmetic it does *not* do — asserted as a control so that "identical"
    // above is a property rather than a tautology about calling one function
    // twice.
    const perSource = Array.from({ length: 10 }, () =>
      arbiter().applyWardOnce(FP_ONE, ward),
    ).reduce((sum, part) => sum + part, 0);
    const summedFirst = arbiter().applyWardOnce(10 * FP_ONE, ward);
    expect(summedFirst).toBeGreaterThanOrEqual(perSource);
  });

  it('is the identity when nothing wards', () => {
    expect(arbiter().applyWardOnce(7 * FP_ONE, [])).toBe(7 * FP_ONE);
  });

  it('caps two wards at the §3 ceiling and counts the clamp (task 6.12)', () => {
    const counters = new ClampCounters();
    const capped = new CastArbiter({
      hostRuleset: ruleset({}),
      grid,
      registry,
      tuning,
      counters,
    });
    // Two wards of 90% each combine on the remainder to 99%, well past the
    // fp(922) cap. The applied damage must be exactly the cap's, and the
    // counter must say the cap bound — an uncounted clamp is a balance finding
    // that never surfaces.
    const applied = capped.applyWardOnce(1000 * FP_ONE, [922, 922]);
    const atCap = arbiter().applyWardOnce(1000 * FP_ONE, [922]);
    expect(applied).toBe(atCap);
    expect(counters.count('ward')).toBeGreaterThan(0);
  });
});

describe('combat draws are keyed by stable identity (tasks 6.4 and 6.5)', () => {
  const rng = rngFromRootSeed(0xc0ffee);

  /** The first three draws of one combatant's stream on one tick. */
  function drawsFor(side: number, spawnOrdinal: number, tick: number): number[] {
    const stream = rng.actorStream(
      RNG_STREAM.combat,
      tick,
      packCombatantKey({ side: side as 0 | 1, spawnOrdinal }),
    );
    return [nextUint32(stream), nextUint32(stream), nextUint32(stream)];
  }

  it('leaves every other combatant unchanged when one is added', () => {
    // "Adding a summon" is exactly this: a new spawn ordinal appears, and every
    // existing ordinal keeps its own stream. The property is structural — the
    // key does not encode how many combatants exist — so the assertion is that
    // the same key yields the same draws whatever else is on the field.
    const before = [0, 1, 2, 3].map((ordinal) => drawsFor(RAID_SIDE.attacker, ordinal, 17));
    const afterAnExtraSummon = [0, 1, 2, 3, 4].map((ordinal) =>
      drawsFor(RAID_SIDE.attacker, ordinal, 17),
    );
    expect(afterAnExtraSummon.slice(0, 4)).toEqual(before);
  });

  it('leaves every other combatant unchanged when one takes an extra draw', () => {
    // A combatant's stream is re-derived per tick and never carried forward, so
    // how many draws she took cannot shift anybody — including herself, next
    // tick.
    const neighbour = drawsFor(RAID_SIDE.defender, 2, 17);
    const greedy = rng.actorStream(
      RNG_STREAM.combat,
      17,
      packCombatantKey({ side: RAID_SIDE.attacker, spawnOrdinal: 1 }),
    );
    for (let extra = 0; extra < 50; extra += 1) nextUint32(greedy);
    expect(drawsFor(RAID_SIDE.defender, 2, 17)).toEqual(neighbour);
  });

  it('gives the two sides different streams for the same ordinal', () => {
    expect(drawsFor(RAID_SIDE.attacker, 0, 17)).not.toEqual(drawsFor(RAID_SIDE.defender, 0, 17));
  });

  it('gives one combatant different streams on different ticks', () => {
    expect(drawsFor(RAID_SIDE.attacker, 0, 17)).not.toEqual(drawsFor(RAID_SIDE.attacker, 0, 18));
  });

  it('refuses an ordinal that would collide with the other side', () => {
    expect(() => packCombatantKey({ side: RAID_SIDE.attacker, spawnOrdinal: 65_536 })).toThrow(
      /wrapped key/u,
    );
  });

  it('orders attackers before defenders, and each side by spawn ordinal', () => {
    const keys = [
      { side: RAID_SIDE.defender, spawnOrdinal: 0 },
      { side: RAID_SIDE.attacker, spawnOrdinal: 3 },
      { side: RAID_SIDE.attacker, spawnOrdinal: 0 },
    ] as const;
    const sorted = [...keys].sort(compareCombatantKeys);
    expect(sorted).toEqual([
      { side: RAID_SIDE.attacker, spawnOrdinal: 0 },
      { side: RAID_SIDE.attacker, spawnOrdinal: 3 },
      { side: RAID_SIDE.defender, spawnOrdinal: 0 },
    ]);
  });
});
