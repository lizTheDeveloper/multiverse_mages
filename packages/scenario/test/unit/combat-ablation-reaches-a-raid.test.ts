/*
 * Multiverse Mages — the ablation mask, from a scenario option into a raid.
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
 * `ablation-reaches-the-world-loop.test.ts`, for the half of the simulation that
 * loop does not contain.
 *
 * That file proves §9's mask reaches `world-step.ts`. It cannot say anything
 * about a raid: `coordination` may not import `@mm/rules-raid`, so the raid
 * system is appended to the schema by `reference-universe.ts` and takes its
 * mask through a **separate** argument. Before w18-combat there was no such
 * argument — `openPortal` had no `ablation` parameter and `arbitration.ts`
 * passed `{}` to every `stackMagnitudes` call — so a sweep arm neutralizing
 * `direct-damage` neutralized it everywhere except inside the raids that are the
 * only place `direct-damage` exists.
 *
 * `packages/rules-raid/test/unit/combat-knowledge.test.ts` proves the mask works
 * once it reaches `openPortal`, over all seven combat primitives. This file
 * proves the two lines that get it there — `reference-universe.ts` spreading
 * `options.ablation` into `raidSystem`, and `raids.ts` spreading `deps.ablation`
 * into `openPortal` — by running two whole reference universes and comparing
 * their raid logs. It never inspects a mask or a deps object, for the reason
 * that file gives at length: **a test that stops at the data structure is the
 * test that passes while the seam is open.**
 *
 * ## Why `knowledge-steal`, and the finding behind that choice
 *
 * It is the only combat primitive whose neutralization changes a reference run
 * today, and the reason is worth writing down because it is a gap in the
 * scenario rather than in this wiring.
 *
 * **The reference universe fields no mage combatants.** `eligibleMages` selects
 * on role — attackers field `raider`, defenders field `warden` — and role is set
 * by god action 10, which no shipped passive strategy submits. Every mage in a
 * reference run is therefore a `researcher`, asserted below so this stays true
 * or the test fails. So an inbound raid is a rival warband walking onto an empty
 * field: nothing on the host side has a `ward` or a `concealment` to neutralize,
 * and the rival's `direct-damage` has no mage to spend itself on. Measured over
 * six seeds at 400 ticks, ablating `direct-damage`, `concealment` or `blink`
 * changes the raid log on **none** of them, and every raid resolves with zero
 * casualties, zero nodes lost and zero nodes gained.
 *
 * `knowledge-steal` still bites because a thief scores the *intent* to steal
 * before there is a victim, and a thief whose theft is worth nothing spends her
 * raid differently. That is the mask changing behaviour through the arbiter, on
 * two of the six seeds, and it is what this file asserts.
 *
 * The honest reading is not "the mask barely works". It is **"reference raids
 * contain almost no combat"**, which is a finding for whoever tunes raid
 * participation next, and which this file will start reporting differently the
 * moment a strategy assigns a warden.
 */

import { describe, expect, it } from 'vitest';

import { rngFromRootSeed, step } from '@mm/sim-core';
import { ablationMaskFor } from '@mm/primitives';
import { MAGE, MAGE_ROLE, collectRecords } from '@mm/state';

import { referenceContent, referenceScenario } from '../../src/index.js';

const content = referenceContent();

/** Long enough that the arrival process fires. Measured, not guessed: see below. */
const HORIZON = 400;

/**
 * The two seeds whose raid log moves when `knowledge-steal` is neutralized, of
 * six surveyed at this horizon.
 *
 * Named rather than swept, because two arms per seed at 400 ticks is seconds
 * each and a survey belongs in the commit message. Both are asserted, so one of
 * them ceasing to raid cannot silently leave this file passing on the other.
 */
const SEEDS: readonly number[] = Object.freeze([0x0bad_c0de, 0x00ab_cdef]);

/** Seeds whose raid log does **not** move — the control on the control. */
const UNMOVED_SEEDS: readonly number[] = Object.freeze([0x1234_5678, 0x0004_1000]);

interface Played {
  readonly raidLog: string;
  readonly raidCount: number;
  readonly wardens: number;
  readonly livingMages: number;
}

function play(seed: number, ablated?: string): Played {
  const run = referenceScenario(content, {
    raids: true,
    // Off: this file reads the raid log, and the census is seconds of work it
    // never looks at.
    telemetry: false,
    ...(ablated === undefined ? {} : { ablation: ablationMaskFor([ablated]) }),
  });
  let state = run.scenario.create(seed, { worldTickCap: HORIZON });
  for (let tick = 0; tick < HORIZON; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
  }
  const living = collectRecords(state, MAGE).filter(({ row }) => row.alive === 1);
  return {
    raidLog: JSON.stringify(run.raids()),
    raidCount: run.raids().length,
    wardens: living.filter(({ row }) => row.roleId === MAGE_ROLE.warden).length,
    livingMages: living.length,
  };
}

describe('§9’s mask crosses the scenario boundary into a raid', () => {
  it.each(SEEDS)('neutralizing knowledge-steal changes the raid log on seed %i', (seed) => {
    const control = play(seed);
    const ablated = play(seed, 'knowledge-steal');

    // The arm has to have reached the mechanic. A run that resolves no raid
    // reports two identical empty logs and would pass a naive comparison while
    // covering nothing — the same hollowing-out `raid-engagement.test.ts` guards
    // its sentinel arm against.
    expect(control.raidCount).toBeGreaterThan(0);
    expect(ablated.raidCount).toBe(control.raidCount);

    expect(ablated.raidLog).not.toBe(control.raidLog);
  });

  it.each(UNMOVED_SEEDS)('leaves a run it does not touch byte-identical on seed %i', (seed) => {
    // The other direction, and it is what makes the assertion above mean
    // something: the mask is not a general perturbation that moves any run it is
    // handed. Two of six surveyed seeds move and four do not.
    const control = play(seed);
    expect(play(seed, 'knowledge-steal').raidLog).toBe(control.raidLog);
  });
});

describe('why six of the seven combat primitives cannot be measured here', () => {
  it.each(['direct-damage', 'concealment', 'blink'])(
    'neutralizing %s changes nothing, because no mage is fielded to be hit',
    (primitive) => {
      const seed = 0x0bad_c0de;
      expect(play(seed, primitive).raidLog).toBe(play(seed).raidLog);
    },
  );

  it('fields no warden, which is the whole reason', () => {
    const played = play(0x0bad_c0de);
    // Not a bug in this change and not something it fixes: `assign role` is god
    // action 10 and the passive strategy never submits it, so every mage stays
    // a `researcher` and a defending universe sends nobody. When that changes,
    // this assertion fails and the file above it needs rewriting with the
    // primitives that have become measurable.
    expect(played.livingMages).toBeGreaterThan(0);
    expect(played.wardens).toBe(0);
  });
});
