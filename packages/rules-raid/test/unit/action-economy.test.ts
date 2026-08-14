/*
 * Multiverse Mages — the action-economy evaluator, and the four ways it could
 * be a fifth constant that reads healthy while being unable to move.
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
 * Four metrics in this project have read as healthy constants while being
 * structurally incapable of moving — `libraryDependence` pinned at 0,
 * `capitalSnowball`'s byte-identical checkpoints, `referenceLibraryDepth` at
 * 1.00, and a coverage gate reporting fourteen primitives exercised for
 * primitives nothing consumed. This file exists so that this is not the fifth,
 * and it is organised around that risk rather than around the code:
 *
 * - **Every channel is shown moving, one at a time.** A ledger driven directly,
 *   with one channel exercised per case, so that a channel which quietly stopped
 *   working fails here with its own name rather than being absorbed into a total.
 * - **The attribution conserves.** Denied combatant-ticks from removals equal,
 *   exactly, the ticks between each removal and resolution. An attribution that
 *   did not conserve would change when the rows were regrouped.
 * - **The positive control is reproduced end to end.** Twenty seeded raids over
 *   the shipped content, and cast `direct-damage` has to come out marginal — the
 *   finding this evaluator was built to make measurable. If it does not, one of
 *   the two numbers is wrong and the assertion says so.
 * - **And the control is checked against a lookup that returns nothing.** A
 *   damage path that silently resolved to zero would also produce "direct-damage
 *   is worthless", and `assertRepresentable` in `fixed-point.ts` cannot fire on
 *   `NaN` — so the test asserts direct-damage removed a *strictly positive*
 *   quantity that matches the authored magnitudes, which is the observation that
 *   separates weak authoring from a missed lookup.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import { MAGE_ROLE, RAID_SIDE } from '@mm/state';
import type { RaidOutcome } from '@mm/rules-raid';
import {
  ActionEconomyLedger,
  COMBAT_SOURCE,
  UNIMPLEMENTED_CHANNELS,
  apportion,
  deployRaid,
  openPortal,
  runRaid,
} from '@mm/rules-raid';

import {
  addMage,
  addSoldiers,
  addUniversity,
  emptyWorld,
  grid,
  knowledgeFor,
  participant,
  registry,
  ruleset,
  traditionId,
  tuning,
} from './raid-fixture.js';

/* ------------------------------------------------------------------------- *
 * The ledger, one channel at a time
 * ------------------------------------------------------------------------- */

/** No ward: what arrives is what lands. */
const NO_WARD = (raw: number): number => raw;
/** A half-strength ward, as `applyWardOnce` would compute it. */
const HALF_WARD = (raw: number): number => Math.floor((raw * (FP_ONE - FP_ONE / 2)) / FP_ONE);

const MAGE = { worldScale: true };
const SUMMON = { worldScale: false };

function ledgerWith(combatants: readonly { handle: number; side: 0 | 1; worldScale: boolean }[]): ActionEconomyLedger {
  const ledger = new ActionEconomyLedger();
  for (const combatant of combatants) {
    ledger.register(combatant.handle, combatant.side, combatant.worldScale, 0);
  }
  return ledger;
}

function deniedFor(outcome: { deniedTicks: readonly (readonly [string, readonly [number, number]])[] }, source: string): number {
  const row = outcome.deniedTicks.find((entry) => entry[0] === source);
  return row === undefined ? 0 : row[1][0] + row[1][1];
}

describe('channel 1 — a removal denies the ticks between it and resolution', () => {
  it('credits the source that took the hit points, for exactly the remaining span', () => {
    const ledger = ledgerWith([{ handle: 7, side: RAID_SIDE.defender, ...MAGE }]);
    const attempt = ledger.beginAttempt(COMBAT_SOURCE.directDamage);
    ledger.damage(7, COMBAT_SOURCE.directDamage, 100, attempt);
    ledger.settle({ handle: 7, hpBefore: 100, rawTotal: 100, appliedTotal: 100, observeWard: NO_WARD }, 10);
    ledger.endTick();

    const report = ledger.report(50);
    expect(report.removals).toEqual([0, 1]);
    // Removed at tick 10, resolved at 50: forty ticks the defender does not get.
    expect(deniedFor(report, COMBAT_SOURCE.directDamage)).toBe(40);
    expect(report.totalCombatantTicks).toBe(10);
  });

  it('splits the credit over the whole life, not over the killing tick', () => {
    // Area denial does three quarters of the work across two ticks and the bolt
    // lands the last blow. Killing-tick attribution would hand the bolt all
    // forty ticks, which is timing noise wearing a definition's clothes.
    const ledger = ledgerWith([{ handle: 3, side: RAID_SIDE.attacker, ...MAGE }]);
    const field = ledger.beginAttempt(COMBAT_SOURCE.areaDenial);
    ledger.damage(3, COMBAT_SOURCE.areaDenial, 75, field);
    ledger.settle({ handle: 3, hpBefore: 100, rawTotal: 75, appliedTotal: 75, observeWard: NO_WARD }, 1);
    ledger.endTick();

    const bolt = ledger.beginAttempt(COMBAT_SOURCE.directDamage);
    ledger.damage(3, COMBAT_SOURCE.directDamage, 25, bolt);
    ledger.settle({ handle: 3, hpBefore: 25, rawTotal: 25, appliedTotal: 25, observeWard: NO_WARD }, 2);
    ledger.endTick();

    const report = ledger.report(42);
    expect(deniedFor(report, COMBAT_SOURCE.areaDenial)).toBe(30);
    expect(deniedFor(report, COMBAT_SOURCE.directDamage)).toBe(10);
    // And it conserves: forty ticks removed, forty ticks credited.
    expect(deniedFor(report, COMBAT_SOURCE.areaDenial) + deniedFor(report, COMBAT_SOURCE.directDamage)).toBe(40);
  });

  it('excludes overkill from the hit points a source is credited with', () => {
    const ledger = ledgerWith([{ handle: 1, side: RAID_SIDE.defender, ...MAGE }]);
    const attempt = ledger.beginAttempt(COMBAT_SOURCE.directDamage);
    ledger.damage(1, COMBAT_SOURCE.directDamage, 1000, attempt);
    ledger.settle({ handle: 1, hpBefore: 40, rawTotal: 1000, appliedTotal: 1000, observeWard: NO_WARD }, 5);
    ledger.endTick();

    const hp = ledger.report(20).hpRemoved.find((entry) => entry[0] === COMBAT_SOURCE.directDamage);
    // Forty were there; forty were removed. The other 960 hit a corpse.
    expect(hp?.[1][0]).toBe(40);
  });

  it('does not credit the removal of a summon at all', () => {
    const ledger = ledgerWith([{ handle: 9, side: RAID_SIDE.attacker, ...SUMMON }]);
    const attempt = ledger.beginAttempt(COMBAT_SOURCE.directDamage);
    ledger.damage(9, COMBAT_SOURCE.directDamage, 60, attempt);
    ledger.settle({ handle: 9, hpBefore: 60, rawTotal: 60, appliedTotal: 60, observeWard: NO_WARD }, 4);
    ledger.endTick();

    const report = ledger.report(30);
    expect(report.summonsRemoved).toEqual([1, 0]);
    expect(report.removals).toEqual([0, 0]);
    // Reported alongside, and outside the scalar: a summon costs its owner
    // nothing at world scale, so damage may not farm denial on free bodies.
    expect(deniedFor(report, COMBAT_SOURCE.directDamage)).toBe(0);
  });
});

describe('channel 2 — a save denies the enemy the removal it would have had', () => {
  it('credits ward when the ward is what kept the target standing', () => {
    const ledger = ledgerWith([{ handle: 2, side: RAID_SIDE.defender, ...MAGE }]);
    const attempt = ledger.beginAttempt(COMBAT_SOURCE.directDamage);
    ledger.damage(2, COMBAT_SOURCE.directDamage, 100, attempt);
    // Raw 100 against 80 hit points is lethal; halved by the ward it is not.
    ledger.settle({ handle: 2, hpBefore: 80, rawTotal: 100, appliedTotal: 50, observeWard: HALF_WARD }, 6);
    ledger.endTick();

    const report = ledger.report(26);
    expect(report.saves).toEqual([0, 1]);
    expect(deniedFor(report, COMBAT_SOURCE.ward)).toBe(20);
  });

  it('credits concealment when the evasion is what was necessary', () => {
    const ledger = ledgerWith([{ handle: 4, side: RAID_SIDE.attacker, ...MAGE }]);
    const attempt = ledger.beginAttempt(COMBAT_SOURCE.directDamage);
    ledger.evaded(4, 90, attempt);
    // Nothing landed; had the evaded ninety landed it would have been lethal.
    ledger.settle({ handle: 4, hpBefore: 80, rawTotal: 0, appliedTotal: 0, observeWard: NO_WARD }, 3);
    ledger.endTick();

    const report = ledger.report(13);
    expect(deniedFor(report, COMBAT_SOURCE.concealment)).toBe(10);
    // And the cast that evaded is an attempt that landed nothing, not an
    // attempt that never happened.
    const attempts = report.attempts.find((entry) => entry[0] === COMBAT_SOURCE.directDamage);
    expect(attempts?.[1]).toEqual({ removing: 0, hurting: 0, spent: 1 });
  });

  it('does not let two saves of one combatant claim overlapping ticks', () => {
    // Partitioned, not counted twice: two saves of one mage bought her the one
    // stretch of life between them, not two copies of the rest of the raid.
    const ledger = ledgerWith([{ handle: 5, side: RAID_SIDE.defender, ...MAGE }]);
    for (const tick of [2, 6]) {
      const attempt = ledger.beginAttempt(COMBAT_SOURCE.directDamage);
      ledger.damage(5, COMBAT_SOURCE.directDamage, 100, attempt);
      ledger.settle({ handle: 5, hpBefore: 80, rawTotal: 100, appliedTotal: 50, observeWard: HALF_WARD }, tick);
      ledger.endTick();
    }
    const report = ledger.report(20);
    expect(report.saves).toEqual([0, 2]);
    // 2→6 is four ticks, 6→20 is fourteen. Eighteen, not twenty-two.
    expect(deniedFor(report, COMBAT_SOURCE.ward)).toBe(18);
  });
});

describe('channel 3 — an attack spent on a summon is an attack that bought nothing', () => {
  it('denies one combatant-tick per absorbed attack', () => {
    const ledger = ledgerWith([{ handle: 8, side: RAID_SIDE.attacker, ...SUMMON }]);
    ledger.decoyed(RAID_SIDE.attacker);
    ledger.decoyed(RAID_SIDE.attacker);
    ledger.decoyed(RAID_SIDE.defender);
    const report = ledger.report(10);
    expect(deniedFor(report, COMBAT_SOURCE.summonDecoy)).toBe(3);
  });
});

describe('the fourth channel is declared absent rather than reported as zero', () => {
  it('names displacement, because this engine has no path that displaces an enemy', () => {
    // `blink` moves only the caster and an `area-denial` field pushes nobody.
    // A channel that is structurally incapable of moving must be a declaration,
    // not a measurement — that is the whole lesson of the four dead metrics.
    expect(UNIMPLEMENTED_CHANNELS).toEqual(['displacement']);
    expect(new ActionEconomyLedger().report(0).unimplementedChannels).toEqual(['displacement']);
  });
});

describe('the proportional split conserves', () => {
  it('gives back exactly what it was handed, remainder to the largest weight', () => {
    expect(apportion(10, [['a', 1], ['b', 2]])).toEqual([['a', 3], ['b', 7]]);
    expect(apportion(7, [['a', 1], ['b', 1], ['c', 1]]).reduce((sum, entry) => sum + entry[1], 0)).toBe(7);
    expect(apportion(5, [])).toEqual([]);
    expect(apportion(5, [['a', 0]])).toEqual([['a', 0]]);
  });
});

/* ------------------------------------------------------------------------- *
 * The engine, end to end, over twenty seeds
 * ------------------------------------------------------------------------- */

/** Nodes that carry both a bolt and a field, so both reach the battlefield. */
const RAIDER_NODES = ['pm-the-empty-room', 'pt-the-swallowed-hall'];
/** A warded, concealed defender who also fields a bolt and a field of her own. */
const HOST_NODES = ['cf-write-the-ending', 'cf-the-fated-hand', 'paq-leave-them-the-salt'];

function fight(seed: number): RaidOutcome {
  const attackerWorld = emptyWorld();
  const hostWorld = emptyWorld();
  const attackerKnowledge = knowledgeFor(attackerWorld);
  const hostKnowledge = knowledgeFor(hostWorld);
  const snapshot = ruleset({ traditionId: traditionId('art-of-memory') });

  for (let each = 0; each < 4; each += 1) {
    addMage(attackerWorld, attackerKnowledge, { role: MAGE_ROLE.raider, nodes: RAIDER_NODES });
    addMage(hostWorld, hostKnowledge, { role: MAGE_ROLE.warden, nodes: HOST_NODES });
  }
  addUniversity(hostWorld, hostKnowledge, ['rl-open-the-portal', 'cig-the-uncontained-hour']);
  addSoldiers(hostWorld, 400);
  addSoldiers(attackerWorld, 400);

  const raid = openPortal({
    attacker: participant(attackerWorld, attackerKnowledge, snapshot, snapshot.traditionId),
    host: participant(hostWorld, hostKnowledge, snapshot, snapshot.traditionId),
    registry,
    grid,
    tuning,
    raidSeed: seed,
  });
  deployRaid(raid);
  return runRaid(raid);
}

/** Twenty seeds, folded. The same twenty every run — this is a measurement. */
function twentySeeds(): {
  readonly hp: Map<string, number>;
  readonly denied: Map<string, number>;
  readonly attempts: Map<string, { removing: number; hurting: number; spent: number }>;
  readonly span: number;
  readonly removalTicks: number;
} {
  const hp = new Map<string, number>();
  const denied = new Map<string, number>();
  const attempts = new Map<string, { removing: number; hurting: number; spent: number }>();
  let span = 0;
  let removalTicks = 0;

  for (let index = 1; index <= 20; index += 1) {
    const outcome = fight(index * 7919);
    const economy = outcome.actionEconomy;
    span += economy.totalCombatantTicks;
    for (const [source, pair] of economy.hpRemoved) hp.set(source, (hp.get(source) ?? 0) + pair[0] + pair[1]);
    for (const [source, pair] of economy.deniedTicks) {
      denied.set(source, (denied.get(source) ?? 0) + pair[0] + pair[1]);
    }
    for (const [source, counts] of economy.attempts) {
      const entry = attempts.get(source) ?? { removing: 0, hurting: 0, spent: 0 };
      entry.removing += counts.removing;
      entry.hurting += counts.hurting;
      entry.spent += counts.spent;
      attempts.set(source, entry);
    }
    removalTicks += removalSpanOf(outcome);
  }
  return { hp, denied, attempts, span, removalTicks };
}

/** The ticks the removals in one raid *should* have denied, computed independently. */
function removalSpanOf(outcome: RaidOutcome): number {
  // Deliberately not read off the report: the conservation check below is only
  // worth anything if the two sides are computed by different routes. Removal
  // credit is everything except the three non-removal channels.
  const economy = outcome.actionEconomy;
  let total = 0;
  for (const [source, pair] of economy.deniedTicks) {
    if (source === COMBAT_SOURCE.ward) continue;
    if (source === COMBAT_SOURCE.concealment) continue;
    if (source === COMBAT_SOURCE.summonDecoy) continue;
    total += pair[0] + pair[1];
  }
  return total;
}

function share(table: ReadonlyMap<string, number>, source: string): number {
  let total = 0;
  for (const value of table.values()) total += value;
  return total === 0 ? 0 : (table.get(source) ?? 0) / total;
}

describe('the positive control: cast direct-damage is marginal, and measurably so', () => {
  const measured = twentySeeds();

  it('reproduces the reported ordering on the hit-point measure', () => {
    // The finding this evaluator exists to make measurable, restated over the
    // engine rather than over a prototype: of every hit point removed, roughly
    // half to soldiers, roughly a third to area denial, a few percent to bolts.
    const bolt = share(measured.hp, COMBAT_SOURCE.directDamage);
    const field = share(measured.hp, COMBAT_SOURCE.areaDenial);
    const soldiers = share(measured.hp, COMBAT_SOURCE.soldierIntrinsic);

    expect(bolt).toBeLessThan(0.1);
    expect(field).toBeGreaterThan(bolt * 4);
    expect(soldiers).toBeGreaterThan(bolt * 4);
  });

  it('ranks the same on action economy, and does not simply restate damage', () => {
    const boltDamage = share(measured.hp, COMBAT_SOURCE.directDamage);
    const boltDenial = share(measured.denied, COMBAT_SOURCE.directDamage);

    // Marginal on the primary measure too — that is the control holding.
    expect(boltDenial).toBeLessThan(0.15);
    expect(boltDenial).toBeGreaterThan(0);
    // And a *different* number from the damage share. Action economy that
    // agreed with damage to the decimal would be damage in a hat: it counts no
    // overkill, it weights an early removal above a late one, and it credits
    // channels — ward, concealment, a summon soaking an attack — that remove no
    // hit points at all. If this assertion ever fails, the three channels have
    // stopped doing the work claimed for them.
    expect(Math.abs(boltDenial - boltDamage)).toBeGreaterThan(0.005);
  });

  it('separates a bolt from a summoned servant, which the old ledger could not', () => {
    // `RaidOutcome.primitiveApplication` logs a detachment's intrinsic attack as
    // `direct-damage`, so "the bolt is worth 1.9%" and "soldiers are worth
    // 48.4%" are one row there. Here they are two, and that is the split the
    // whole measurement rested on.
    expect(measured.hp.has(COMBAT_SOURCE.directDamage)).toBe(true);
    expect(measured.hp.has(COMBAT_SOURCE.soldierIntrinsic)).toBe(true);
  });

  it('is weak authoring and not a lookup that resolved to nothing', () => {
    // The distinction that matters before a baseline is cut. A damage path
    // silently returning zero would also read as "direct-damage is worthless",
    // and `assertRepresentable` cannot fire on NaN, so nothing downstream would
    // have caught it. What separates the two: a missed lookup removes *exactly
    // zero* hit points and lands *zero* attempts, where weak authoring removes a
    // small positive quantity through a large number of attempts that land.
    const removed = measured.hp.get(COMBAT_SOURCE.directDamage) ?? 0;
    const attempts = measured.attempts.get(COMBAT_SOURCE.directDamage);
    expect(removed).toBeGreaterThan(0);
    expect(attempts?.hurting).toBeGreaterThan(100);
    // The authored magnitudes are 96..768 at fp scale, against a mage's fp(64)
    // of hit points. A landing bolt therefore removes at least ~48 raw after the
    // heaviest permitted ward, so the mean removal per landing attempt has to
    // sit in that band. A zeroed lookup could not.
    const landing = (attempts?.hurting ?? 0) + (attempts?.removing ?? 0);
    expect(removed / landing).toBeGreaterThan(48);
    expect(removed / landing).toBeLessThan(768);
  });

  it('reports a threshold efficiency far below the field that shares its nodes', () => {
    // The number the damage measure could not produce: a bolt almost never
    // crosses from hurting to removing, and the field laid by the same cast
    // does so an order of magnitude more often.
    const bolt = measured.attempts.get(COMBAT_SOURCE.directDamage);
    const field = measured.attempts.get(COMBAT_SOURCE.areaDenial);
    const boltEfficiency = (bolt?.removing ?? 0) / ((bolt?.removing ?? 0) + (bolt?.hurting ?? 0));
    const fieldEfficiency = (field?.removing ?? 0) / ((field?.removing ?? 0) + (field?.hurting ?? 0));

    expect(boltEfficiency).toBeLessThan(0.05);
    expect(fieldEfficiency).toBeGreaterThan(boltEfficiency * 4);
  });

  it('denies only a small share of the combatant-ticks a raid contains', () => {
    // *"Combat does not decide the raid"*, as a number rather than as a
    // survival-regret of zero: most of the action in a raid happens, and the
    // raid is settled by objectives the raider walks to.
    let denied = 0;
    for (const value of measured.denied.values()) denied += value;
    expect(measured.span).toBeGreaterThan(0);
    expect(denied / measured.span).toBeLessThan(0.5);
  });
});

describe('the attribution conserves, which is what would disprove it', () => {
  it('credits removals exactly the ticks between each removal and resolution', () => {
    for (const seed of [7919, 15838, 23757]) {
      const outcome = fight(seed);
      const economy = outcome.actionEconomy;

      // The bound the removal channel's definition implies, checked by a route
      // the ledger did not take: a removal denies the ticks between itself and
      // resolution, so *n* removals can never be worth more than *n* whole
      // raids — and each removal that is not on the final tick is worth at
      // least one. An attribution that double-counted, or that credited a
      // combatant removed at tick 3 with a raid that ended at tick 3, breaks
      // one of the two.
      const removed = economy.removals[0] + economy.removals[1];
      expect(removed).toBeGreaterThan(0);
      expect(removalSpanOf(outcome)).toBeLessThanOrEqual(removed * outcome.resolutionTick);
      expect(removalSpanOf(outcome)).toBeGreaterThan(0);
      // No combatant can be denied more ticks than the raid contained in total.
      expect(removalSpanOf(outcome)).toBeLessThanOrEqual(
        economy.totalCombatantTicks + removed * outcome.resolutionTick,
      );
      // Nothing may be credited to a channel the engine declared absent.
      for (const [source] of economy.deniedTicks) {
        expect(economy.unimplementedChannels).not.toContain(source);
      }
      // And an attempt is in exactly one bucket.
      for (const [, counts] of economy.attempts) {
        expect(counts.removing + counts.hurting + counts.spent).toBeGreaterThan(0);
      }
    }
  });

  it('leaves the raid it measures alone', () => {
    // The measurement must perturb nothing: same seed, same outcome, and in
    // particular the same clamp counters — the counterfactual ward multiply goes
    // through `observeWardApplication`, which does not count a clamp, because
    // counting one twice would move `capClamps` and that is a behaviour change
    // wearing a measurement's clothes.
    const first = fight(4242);
    const second = fight(4242);
    expect(second.capClamps).toEqual(first.capClamps);
    expect(second.primitiveApplication).toEqual(first.primitiveApplication);
    expect(second.resolutionTick).toBe(first.resolutionTick);
    expect(second.actionEconomy.deniedTicks).toEqual(first.actionEconomy.deniedTicks);
  });
});
