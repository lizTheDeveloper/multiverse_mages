/*
 * Multiverse Mages — what a mage who knows combat magic is actually worth.
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
 * The measurement behind w18-combat, and it has two halves that say different
 * things. Reading them as one number would misreport what changed.
 *
 * ## Half one — the control, and it passed before the change too
 *
 * `describe('a warband that knows combat magic')` sends two identical warbands
 * through the same portal on the same seeds, differing only in whether their
 * four nodes carry combat primitives or tier-matched academic ones. The armed
 * band lands damage; the unarmed band lands none.
 *
 * **This was already true on `main`.** It is asserted here anyway, because the
 * premise w18-combat was opened on — *"nothing a mage learns changes any of the
 * combat primitives"* — was false, and the honest way to record that is a test
 * that would have passed against the old code. `arbitration.ts` has turned a
 * held node into damage since `raid-engagement`; `scenario/raids.ts` has called
 * it since #122's predecessor. What was missing was never the behaviour.
 *
 * What was missing was that **nothing could observe it**: arbitration read
 * `registry.nodes` itself rather than asking through `nodeEffectRecords`, so the
 * composition root's consumption recorder saw no fetch and `check:consumption`
 * reported seven live consumers as absent. A tier-matched control is the right
 * shape for that claim: `deepestTier` decides who is fielded and `castVigorPerTier`
 * decides what a cast costs, so an unarmed band of shallower nodes would be a
 * weaker band for two reasons and would prove neither.
 *
 * ## Half two — the ablation arms, which could not be written before
 *
 * `describe('§9's mask reaches a raid')` runs the **same** warband twice: same
 * mages, same nodes, same seed, differing only in whether one primitive is
 * neutralized. That is the arm that attributes an outcome to a primitive rather
 * than to a loadout, and until `openPortal` threaded `ablation` it was
 * impossible — `arbitration.ts` passed `{}` to every `stackMagnitudes` call, so
 * a sweep arm neutralizing `direct-damage` would have reported "no detected
 * effect" while every raid in it ran at full strength. A false negative wearing
 * a measurement's clothes, which is worse than no measurement.
 *
 * ## Neutralization keeps the slot, and one test is about only that
 *
 * `#authored` replaces an ablated magnitude and never removes it, because the
 * effect lists' *lengths* decide control flow that draws randomness. The
 * paired-tick test asserts the consequence end to end: for `direct-damage` the
 * control arm and the ablation arm resolve on the **identical** engagement tick,
 * seed by seed, while one of them does 63,168 fp of damage and the other does
 * zero. A mask that dropped the entries instead would desynchronise stream 8 on
 * the first cast and every later draw in the raid would differ for a reason
 * that has nothing to do with the primitive.
 */

import { describe, expect, it } from 'vitest';

import { ablationMaskFor } from '@mm/primitives';
import { RAID_SIDE } from '@mm/state';

import type { WarbandOptions } from './warband.js';
import { resolveWarband } from './warband.js';

/**
 * Four v1 `direct-damage` nodes, one per tier 1–4, and four v1 nodes of the
 * same tiers carrying no combat primitive at all.
 *
 * Tier-matched on purpose; see the module header. Both lists are inside the
 * twelve enabled cells, so both are things a mage in a shipped universe can
 * actually learn.
 */
const ARMED = Object.freeze([
  'pl-fray-the-edge', // t1, perdo-limen, direct-damage 128
  'pm-the-misplaced-hour', // t2, perdo-mentem, direct-damage 192
  'pt-pull-down-the-arch', // t3, perdo-terram, direct-damage 448
  'pm-unmake-the-mind', // t4, perdo-mentem, direct-damage 512
]);
const UNARMED = Object.freeze([
  'il-sense-the-seam', // t1, research-rate 128
  'il-count-the-doors', // t2, research-rate 256
  'il-read-the-binding', // t3, research-rate 384
  'in-catalogue-of-names', // t4, scribe-rate 384 + research-rate 192
]);

const WARDS = Object.freeze(['rl-hold-the-door', 'rl-seal-the-way', 'rl-the-standing-gate']);
const CONCEALMENTS = Object.freeze([
  'pn-mispronounce',
  'pn-shed-the-use-name',
  'pn-the-nameless',
  'il-stand-in-the-doorway',
]);
const DENIALS = Object.freeze([
  'pl-the-open-wound',
  'pm-scatter-the-lesson',
  'pt-open-the-ground',
  'pt-the-swallowed-hall',
]);
const THIEVES = Object.freeze([
  'im-read-the-surface',
  'im-open-the-locked-room',
  'rn-compel-by-name',
  'rn-the-bound-servant',
]);
const SUMMONERS = Object.freeze(['rn-call-by-name', 'rn-the-bound-servant']);
const BLINKERS = Object.freeze(['rl-step-across', 'pl-fray-the-edge']);

/** Seeds per arm. Every arm is paired on this list, so the seed is never a variable. */
const SEEDS = 30;

/** One raid's numbers, in the terms `contracts.md` §3 names. */
interface RaidSample {
  /** `direct-damage` magnitude the attacker put on the field, `fp`. */
  readonly damageDealt: number;
  /** Hit points the attacker's casts actually removed, after ward, `fp`. */
  readonly hpRemovedByCasts: number;
  /** Hit points the attacker's `area-denial` fields removed, `fp`. */
  readonly hpRemovedByFields: number;
  /** `blink` magnitude the attacker displaced itself by, `fp`. */
  readonly blinkApplied: number;
  /** Instances the raiders read off a defending mind. */
  readonly instancesCopied: number;
  /** Peak simultaneous attacking combatants — mages plus whatever they summoned. */
  readonly peakAttackers: number;
  /** Defending mages who did not survive the raid. */
  readonly defendersKilled: number;
  /** The engagement tick the raid resolved on. */
  readonly resolutionTick: number;
}

function sample(base: Omit<WarbandOptions, 'seed'>, seed: number, ablated?: string): RaidSample {
  const result = resolveWarband({
    ...base,
    seed,
    ...(ablated === undefined ? {} : { ablation: ablationMaskFor([ablated]) }),
  });
  const outcome = result.outcome;
  const applied = (id: string): number =>
    outcome.primitiveApplication.find(([key]) => key === id)?.[1].attacker ?? 0;
  const removed = (id: string): number =>
    outcome.actionEconomy.hpRemoved.find(([key]) => key === id)?.[1][0] ?? 0;

  return {
    damageDealt: applied('direct-damage'),
    hpRemovedByCasts: removed('direct-damage'),
    hpRemovedByFields: removed('area-denial'),
    blinkApplied: applied('blink'),
    instancesCopied: outcome.knowledgeMovements.filter((move) => move.verb === 'copied').length,
    peakAttackers: outcome.peakCombatants[0],
    defendersKilled: result.fates.filter((fate) => fate.side === RAID_SIDE.defender && fate.died)
      .length,
    resolutionTick: outcome.resolutionTick,
  };
}

/** One arm: the same warband over {@link SEEDS} seeds. */
function arm(base: Omit<WarbandOptions, 'seed'>, ablated?: string): readonly RaidSample[] {
  const samples: RaidSample[] = [];
  for (let index = 0; index < SEEDS; index += 1) {
    samples.push(sample(base, 0x5eed_0000 + index * 0x1000 + 1, ablated));
  }
  return samples;
}

/**
 * Mean and standard error of one field across an arm.
 *
 * Integer inputs, floating-point statistics: this is a **measurement over** the
 * rules path and not a step in it, so §-whatever's fixed-point rule does not
 * apply and a fixed-point standard error would be a worse number for no reason.
 * Nothing here feeds a simulation.
 */
function summarise(
  samples: readonly RaidSample[],
  field: keyof RaidSample,
): { readonly mean: number; readonly standardError: number } {
  const values = samples.map((entry) => entry[field]);
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  if (values.length < 2) return { mean, standardError: 0 };
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1);
  return { mean, standardError: Math.sqrt(variance / values.length) };
}

/**
 * The separation between two arms, in standard errors of the difference.
 *
 * `Infinity` when both arms have zero spread and different means — which is the
 * common case here, because a neutralized combat primitive contributes exactly
 * zero on every seed. Reported as `Infinity` rather than clamped: a difference
 * with no overlap at all is the strongest result this design can produce and
 * flattening it to a large finite number would invent a spread that is not
 * there.
 */
function separation(
  control: readonly RaidSample[],
  treatment: readonly RaidSample[],
  field: keyof RaidSample,
): number {
  const a = summarise(control, field);
  const b = summarise(treatment, field);
  const pooled = Math.sqrt(a.standardError ** 2 + b.standardError ** 2);
  if (pooled === 0) return a.mean === b.mean ? 0 : Number.POSITIVE_INFINITY;
  return Math.abs(a.mean - b.mean) / pooled;
}

/**
 * The pinned reading of the armed-versus-unarmed control, over `SEEDS` seeds.
 *
 * Pinned rather than bounded because it is the headline number of the change
 * and a bound would let it halve without anybody noticing. It moves when the
 * shipped magnitudes of the four `ARMED` nodes move, when raid tuning moves, or
 * when the terrain generator moves — each of which is a diff a reviewer should
 * read as the claim it is.
 */
const EXPECTED_ARMED_VERSUS_UNARMED = Object.freeze({
  armedMean: 2106,
  armedStandardError: 127,
  unarmedMean: 0,
  unarmedStandardError: 0,
});

const bareDefenders = Object.freeze([
  { name: 'Defender-1', nodes: [] as readonly string[] },
  { name: 'Defender-2', nodes: [] as readonly string[] },
]);
const pairOf = (nodes: readonly string[]): readonly { name: string; nodes: readonly string[] }[] =>
  Object.freeze([
    { name: 'Raider-1', nodes },
    { name: 'Raider-2', nodes },
  ]);

describe('a warband that knows combat magic outfights one that does not', () => {
  const armed = arm({ attackers: pairOf(ARMED), defenders: bareDefenders });
  const unarmed = arm({ attackers: pairOf(UNARMED), defenders: bareDefenders });

  it('lands damage the academic warband cannot', () => {
    const withCombat = summarise(armed, 'damageDealt');
    const without = summarise(unarmed, 'damageDealt');

    expect(withCombat.mean).toBeGreaterThan(2000);
    expect(without.mean).toBe(0);

    // The unarmed arm's standard error is exactly zero — thirty seeds, thirty
    // zeroes — so the whole spread in the separation is the armed arm's, which
    // varies with where the terrain put people. Recorded rather than left in an
    // inequality, so a later reader can see the numbers move.
    expect({
      armedMean: Math.round(withCombat.mean),
      armedStandardError: Math.round(withCombat.standardError),
      unarmedMean: without.mean,
      unarmedStandardError: without.standardError,
    }).toEqual(EXPECTED_ARMED_VERSUS_UNARMED);
    expect(separation(unarmed, armed, 'damageDealt')).toBeGreaterThan(10);
  });

  it('removes hit points the academic warband cannot', () => {
    expect(summarise(armed, 'hpRemovedByCasts').mean).toBeGreaterThan(0);
    expect(summarise(unarmed, 'hpRemovedByCasts').mean).toBe(0);
  });

  it('is not merely a longer raid — the academic band fights for as long', () => {
    // Both arms run to portal collapse. If the armed arm simply had more ticks
    // in which to act, the damage difference would be an artefact of raid
    // length rather than of what anyone knew.
    expect(summarise(armed, 'resolutionTick').mean).toBeGreaterThan(50);
    expect(summarise(unarmed, 'resolutionTick').mean).toBeGreaterThan(50);
  });
});

describe("§9's mask reaches a raid: one primitive off, everything else identical", () => {
  /**
   * Every combat primitive, the warband that exercises it, and the metric that
   * collapses when it is neutralized.
   *
   * Seven rows, because seven is how many combat primitives `contracts.md` §3
   * declares and a table with a gap in it is a table that invites one.
   */
  const arms: readonly {
    readonly primitive: string;
    readonly attackers: readonly string[];
    readonly defenders: readonly string[];
    readonly field: keyof RaidSample;
    /** Whether neutralizing it must drive the metric to exactly zero. */
    readonly collapsesToZero: boolean;
  }[] = Object.freeze([
    { primitive: 'direct-damage', attackers: ARMED, defenders: [], field: 'damageDealt', collapsesToZero: true },
    { primitive: 'area-denial', attackers: DENIALS, defenders: [], field: 'hpRemovedByFields', collapsesToZero: true },
    { primitive: 'blink', attackers: BLINKERS, defenders: [], field: 'blinkApplied', collapsesToZero: true },
    { primitive: 'summon', attackers: SUMMONERS, defenders: [], field: 'peakAttackers', collapsesToZero: false },
    { primitive: 'knowledge-steal', attackers: THIEVES, defenders: ARMED, field: 'instancesCopied', collapsesToZero: true },
    // The two defensive ones are measured on the *defenders*: neutralizing them
    // makes the attacker's numbers go **up**, which is the sign a defence has.
    { primitive: 'ward', attackers: ARMED, defenders: WARDS, field: 'hpRemovedByCasts', collapsesToZero: false },
    { primitive: 'concealment', attackers: ARMED, defenders: CONCEALMENTS, field: 'damageDealt', collapsesToZero: false },
  ]);

  it.each(arms)('neutralizing $primitive moves $field', (row) => {
    const base = {
      attackers: pairOf(row.attackers),
      defenders:
        row.defenders.length === 0
          ? bareDefenders
          : Object.freeze([
              { name: 'Defender-1', nodes: row.defenders },
              { name: 'Defender-2', nodes: row.defenders },
            ]),
    };
    const control = arm(base);
    const ablated = arm(base, row.primitive);

    const controlMean = summarise(control, row.field).mean;
    const ablatedMean = summarise(ablated, row.field).mean;

    expect(controlMean).not.toBe(ablatedMean);
    expect(separation(control, ablated, row.field)).toBeGreaterThan(3);
    if (row.collapsesToZero) {
      expect(controlMean).toBeGreaterThan(0);
      expect(ablatedMean).toBe(0);
    }
  });

  it('a ward that is neutralized stops preventing damage', () => {
    const base = {
      attackers: pairOf(ARMED),
      defenders: [
        { name: 'Defender-1', nodes: WARDS },
        { name: 'Defender-2', nodes: WARDS },
      ],
    };
    const warded = summarise(arm(base), 'hpRemovedByCasts').mean;
    const unwarded = summarise(arm(base, 'ward'), 'hpRemovedByCasts').mean;
    const dealt = summarise(arm(base), 'damageDealt').mean;

    // The magnitude *put on the field* is identical either way — ward scales
    // what lands, not what is thrown — so this is the one arm where the primitive
    // application ledger cannot see the effect and the action economy can.
    expect(summarise(arm(base, 'ward'), 'damageDealt').mean).toBe(dealt);
    expect(unwarded).toBe(dealt);
    expect(warded).toBeLessThan(unwarded * 0.6);
  });

  it('a concealed defender is harder to hit, and neutralizing it makes her easy', () => {
    const base = {
      attackers: pairOf(ARMED),
      defenders: [
        { name: 'Defender-1', nodes: CONCEALMENTS },
        { name: 'Defender-2', nodes: CONCEALMENTS },
      ],
    };
    const hidden = summarise(arm(base), 'damageDealt').mean;
    const exposed = summarise(arm(base, 'concealment'), 'damageDealt').mean;
    expect(hidden).toBeLessThan(exposed / 2);
  });
});

describe('an ablated magnitude keeps its slot, so the two arms share a stream', () => {
  it('resolves on the identical engagement tick, seed by seed, with and without direct-damage', () => {
    const base = { attackers: pairOf(ARMED), defenders: bareDefenders };
    const control = arm(base);
    const ablated = arm(base, 'direct-damage');

    // The whole point of neutralizing in place rather than dropping the entry.
    // A raid whose casts still happen, still cost vigor and still draw the
    // evasion roll on stream 8 — and lands nothing.
    expect(ablated.map((entry) => entry.resolutionTick)).toEqual(
      control.map((entry) => entry.resolutionTick),
    );
    expect(summarise(control, 'damageDealt').mean).toBeGreaterThan(0);
    expect(summarise(ablated, 'damageDealt').mean).toBe(0);
  });
});
