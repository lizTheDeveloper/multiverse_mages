/*
 * Multiverse Mages — engagement state stays out of world snapshots.
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
 * Task 1.6 and the `state-schema` scenario "combatants absent from world
 * snapshot": a world snapshot taken during engagement mode records the clock
 * mode and the engagement tick, but no combatant and no objective.
 */

import { describe, expect, it } from 'vitest';

import { TIME_MODE, advanceClock, deserializeState, serializeState, snapshotHash } from '@mm/sim-core';
import {
  COMBATANT,
  OBJECTIVE,
  PREPARED_SPELL,
  beginEngagement,
  componentOf,
  decayPortal,
  defineWorldStateSchema,
  endEngagement,
  inEngagement,
  raidHasEnded,
} from '@mm/state';

import { fixtureRuleset, populateEngagement, populatedWorld } from './fixtures.js';

const HOST_REVISION = '11111111111111111111111111111111';
const RAIDER_REVISION = '22222222222222222222222222222222';

/**
 * Two revisions agreeing on their first 32 bits and disagreeing below.
 *
 * The first eight hex characters are the entire width `contentRevision` used
 * to be stored at, so a build that folded the hash would see one value here,
 * not two.
 */
const COLLIDING_ABOVE_32_BITS = [
  'deadbeef00000000000000000000000a',
  'deadbeef00000000000000000000000b',
] as const;

/** The bytes of a snapshot, as text, for asserting a name is absent from it. */
function asLatin1(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
}

function openRaid(world: ReturnType<typeof populatedWorld>['state']) {
  return beginEngagement(world, {
    hostRuleset: fixtureRuleset(),
    raiderRuleset: fixtureRuleset(),
    portalStability: 300,
    stabilityDecayPerTick: 1,
    raidSeed: 0x1234_5678,
  });
}

describe('a world snapshot taken during engagement carries no engagement entities', () => {
  it('names no combatant, prepared spell, or objective component', () => {
    const { state } = populatedWorld();
    const engagement = openRaid(state);
    populateEngagement(engagement.entities);

    const text = asLatin1(serializeState(state));
    for (const spec of [COMBATANT, PREPARED_SPELL, OBJECTIVE]) {
      expect(text).not.toContain(spec.name);
    }
    // The control: the world's own component names *are* in there, so the
    // assertions above are about what was excluded rather than about a
    // serializer that emitted no names at all.
    expect(text).toContain('mage');
    expect(text).toContain('knowledge-instance');
  });

  it('is byte-identical before and after an engagement is populated', () => {
    // The strongest available form of "excluded": populating the engagement
    // store, and then destroying half of it, moves nothing in the world's
    // bytes. Exclusion here is structural — the engagement entities are in a
    // different store — rather than a filter someone has to remember.
    const { state } = populatedWorld();
    const engagement = openRaid(state);

    const before = serializeState(state);
    populateEngagement(engagement.entities);
    populateEngagement(engagement.entities);
    const after = serializeState(state);

    expect(Array.from(after)).toEqual(Array.from(before));
    expect(after.byteLength).toBe(before.byteLength);
  });

  it('is the same size as the same world snapshotted at world scale', () => {
    const { state } = populatedWorld();
    const atWorldScale = serializeState(state);

    const engagement = openRaid(state);
    populateEngagement(engagement.entities);
    const duringRaid = serializeState(state);

    expect(duringRaid.byteLength).toBe(atWorldScale.byteLength);
  });
});

describe('a world snapshot taken during engagement preserves the clock', () => {
  it('restores the engagement mode and the engagement tick', () => {
    const { state } = populatedWorld();
    const engagement = openRaid(state);
    populateEngagement(engagement.entities);

    advanceClock(state.clock);
    advanceClock(state.clock);
    advanceClock(state.clock);

    const restored = deserializeState(serializeState(state), defineWorldStateSchema());

    expect(restored.clock.mode).toBe(TIME_MODE.engagement);
    expect(restored.clock.engagementTick).toBe(3);
    expect(restored.clock.worldTick).toBe(state.clock.worldTick);
    expect(snapshotHash(restored)).toBe(snapshotHash(state));
  });

  it('freezes world time for the duration and resumes it exactly where it stopped', () => {
    const { state } = populatedWorld();
    advanceClock(state.clock);
    advanceClock(state.clock);
    const frozenAt = state.clock.worldTick;

    openRaid(state);
    expect(inEngagement(state)).toBe(true);
    advanceClock(state.clock);
    advanceClock(state.clock);
    expect(state.clock.worldTick).toBe(frozenAt);

    endEngagement(state);
    expect(inEngagement(state)).toBe(false);
    expect(state.clock.worldTick).toBe(frozenAt);
    expect(state.clock.engagementTick).toBe(0);
  });
});

describe('opening a raid refuses the arrangements that break termination', () => {
  it('refuses two universes on different content revisions, naming both', () => {
    const { state } = populatedWorld();
    expect(() =>
      beginEngagement(state, {
        hostRuleset: fixtureRuleset({ contentRevision: HOST_REVISION }),
        raiderRuleset: fixtureRuleset({ contentRevision: RAIDER_REVISION }),
        portalStability: 300,
        stabilityDecayPerTick: 1,
        raidSeed: 1,
      }),
    ).toThrow(
      new RegExp(`${HOST_REVISION}.*${RAIDER_REVISION}|${RAIDER_REVISION}.*${HOST_REVISION}`, 's'),
    );
  });

  /**
   * The regression guard for the `contentRevision` narrowing.
   *
   * These two revisions are identical for their first eight hex characters —
   * the whole of the 32 bits the field used to be folded to — and differ only
   * below that. While `SimState.contentRevision` was a `uint32`, a pair like
   * this was the shape of the collision that let two incompatible universes
   * into the same raid: §0 offers no partial-compatibility rule and no
   * negotiation, so the equality check below is the *only* thing standing
   * between them and a desync. Now that the full 128 bits are carried, they
   * are simply two different revisions and the raid is refused.
   */
  it('refuses two universes whose revisions differ only below the old 32-bit fold', () => {
    const { state } = populatedWorld();
    const [low, high] = COLLIDING_ABOVE_32_BITS;

    expect(low.slice(0, 8)).toBe(high.slice(0, 8)); // identical where a u32 would have looked
    expect(low).not.toBe(high); // and different everywhere it mattered

    expect(() =>
      beginEngagement(state, {
        hostRuleset: fixtureRuleset({ contentRevision: low }),
        raiderRuleset: fixtureRuleset({ contentRevision: high }),
        portalStability: 300,
        stabilityDecayPerTick: 1,
        raidSeed: 1,
      }),
    ).toThrow(new RegExp(`${low}.*${high}`, 's'));
  });

  it('admits two universes on the same full-width revision', () => {
    // The other half of the claim: the guard above must be refusing them for
    // the difference, not refusing everything. Without this, narrowing the
    // comparison to a constant `false` would pass the test above.
    const { state } = populatedWorld();
    const [low] = COLLIDING_ABOVE_32_BITS;

    expect(() =>
      beginEngagement(state, {
        hostRuleset: fixtureRuleset({ contentRevision: low }),
        raiderRuleset: fixtureRuleset({ contentRevision: low }),
        portalStability: 300,
        stabilityDecayPerTick: 1,
        raidSeed: 1,
      }),
    ).not.toThrow();
  });

  it('refuses a stability decay of zero, which is a raid that never ends', () => {
    const { state } = populatedWorld();
    expect(() =>
      beginEngagement(state, {
        hostRuleset: fixtureRuleset(),
        raiderRuleset: fixtureRuleset(),
        portalStability: 300,
        stabilityDecayPerTick: 0,
        raidSeed: 1,
      }),
    ).toThrow(/at least 1/);
  });

  it('terminates: repeated decay reaches zero and ends the raid', () => {
    const { state } = populatedWorld();
    const engagement = beginEngagement(state, {
      hostRuleset: fixtureRuleset(),
      raiderRuleset: fixtureRuleset(),
      portalStability: 5,
      stabilityDecayPerTick: 2,
      raidSeed: 1,
    });

    expect(raidHasEnded(engagement.raid)).toBe(false);
    for (let tick = 0; tick < 3; tick += 1) decayPortal(engagement.raid);
    expect(engagement.raid.portalStability).toBe(0);
    expect(raidHasEnded(engagement.raid)).toBe(true);
  });
});

describe('the engagement store is bounded', () => {
  it('carries only the engagement components, and the world carries none of them', () => {
    const { state } = populatedWorld();
    const engagement = openRaid(state);
    populateEngagement(engagement.entities);

    expect(componentOf(engagement.entities, COMBATANT).size).toBe(1);
    expect(() => state.component('combatant')).toThrow(/declares no component/);
  });

  it('records the world tick the raid began at', () => {
    const { state } = populatedWorld();
    advanceClock(state.clock);
    const engagement = openRaid(state);
    expect(engagement.raid.engagementStartTick).toBe(1);
  });
});
