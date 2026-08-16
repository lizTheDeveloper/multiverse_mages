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
 * **The reference universe joins no combat.** The first version of this
 * paragraph said it fields no mage combatants and gave the wrong mechanism —
 * *"defenders field `warden`"* — which `combatants.ts` contradicts:
 * `DEFENDING_ROLES` is `{warden, professor, researcher, raider}`, so every
 * living mage defends and an inbound raid is not walking onto an empty field.
 * The measured cause, from `scripts/w144-ablation-visibility.mjs` over all eight
 * shipped strategies at two seeds each — **61 raids, 80,615 combatant-ticks,
 * zero combat attempts** — is `chooseIntent`'s priority order. Theft is
 * candidate 2 and casting is candidate 3, and no shipped strategy grants a
 * raider a combat node, so `firstCastableNode` returns nothing on every tick of
 * every raid. Bodies are on the field; nobody swings.
 *
 * So ablating `direct-damage`, `concealment` or `blink` changes the raid log on
 * none of six seeds at 400 ticks, and every raid resolves with zero casualties,
 * zero nodes lost and zero nodes gained. Until `RaidRecord` grew an `actionEconomy` block that null was also
 * *unfalsifiable* — `RaidRecord` carried no combat instrumentation, so a live
 * mask and a dead one produced the same log. It carries `actionEconomy` now, and
 * `raid-metrics.test.ts` pins the zero-attempt finding as the tripwire that
 * fails the day a strategy fields an armed combatant.
 *
 * `knowledge-steal` still bites because a thief scores the *intent* to steal
 * before there is a victim, and a thief whose theft is worth nothing spends her
 * raid differently. That is the mask changing behaviour through the arbiter, on
 * two of the six seeds, and it is what this file asserts.
 *
 * The honest reading is not "the mask barely works". It is **"reference raids
 * contain no combat at all"**, which is a finding for whoever tunes raid
 * participation next, and which this file will start reporting differently the
 * moment a strategy puts a combat node in a combatant's hands.
 *
 * ## That reading is now counted rather than argued — `main` at `57bcbc44`
 *
 * It was inferred from `chooseIntent`'s priority order, which is a claim about
 * code, and a null result is the one place a claim about code most needs a
 * measurement. `ablation-mask-is-consulted.test.ts` instruments the mask itself
 * over this file's first seed and horizon, and **all seven combat primitives
 * are stacked** on a run this file calls unmeasurable: `knowledge-steal` 334,
 * `ward` 223, `concealment` 68, `direct-damage` 22, `area-denial` 7, `blink` 4,
 * `summon` 4. The mask reaches `openPortal` hundreds of times a raid. The
 * magnitude is computed, neutralized, and discarded unused.
 *
 * So the six nulls are reading (2)-becoming-(3) in that file's taxonomy — the
 * wire is live and the consumer is idle — and **not** the reading that would
 * matter, which is the seam having come apart. Run that file first the day this
 * one reports a seed stopping moving: `SEEDS` and `UNMOVED_SEEDS` are a survey
 * of a mechanic that runs at the margin, and a seed crossing between them is
 * ordinary. Every one of them going quiet at once is not.
 */

import { describe, expect, it } from 'vitest';

import { rngFromRootSeed, step } from '@mm/sim-core';
import { MAGE, MAGE_ROLE, collectRecords } from '@mm/state';
import { ablationMaskFor } from '@mm/coordination';

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
    'neutralizing %s changes nothing, because nobody ever swings',
    (primitive) => {
      const seed = 0x0bad_c0de;
      // The raid log now carries `actionEconomy`, so this comparison is a real
      // one: before the record carried `actionEconomy` it could not have distinguished a live mask from a dead
      // one, because the fields a combat primitive moves were not in it.
      expect(play(seed, primitive).raidLog).toBe(play(seed).raidLog);
    },
  );

  it('fields no warden — which is a symptom, and not the cause', () => {
    const played = play(0x0bad_c0de);
    // `assign role` is god action 10 and the passive strategy never submits it,
    // so every mage stays a `researcher`. That is worth asserting and it is
    // **not** why the six are invisible: `DEFENDING_ROLES` includes
    // `researcher`, so these mages do defend. The cause is that nobody on either
    // side holds a combat node and theft outranks casting in `chooseIntent`, so
    // no attempt is ever begun — pinned as a tripwire in `raid-metrics.test.ts`,
    // where the record can now show it.
    expect(played.livingMages).toBeGreaterThan(0);
    expect(played.wardens).toBe(0);
  });
});
