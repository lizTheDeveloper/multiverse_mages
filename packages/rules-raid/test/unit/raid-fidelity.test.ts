/*
 * Multiverse Mages — six mages raided; this is what happened to each of them.
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
 * **The isolation test: a defined warband in, the transformed mages out.**
 *
 * `raid-engine.test.ts` asks whether a raid *ends*. This file asks what a raid
 * *does to people*, which is a different question and needs a different reading:
 * every assertion here is against `MAGE` rows and knowledge instances in the two
 * worlds, after `applyRaidOutcome` has landed, rather than against the
 * {@link RaidOutcome} ledger that describes them. A ledger that said someone died
 * while her row stayed alive would pass the first kind of test and fail this one.
 *
 * ## The answer to "can this test be written today"
 *
 * Partly, and the part that cannot is the finding.
 *
 * | fate | representation | write-back |
 * | --- | --- | --- |
 * | **death** | `MAGE.alive` | yes — `applyRaidOutcome` sets it to `0` and empties her mind |
 * | **wounds** | `COMBATANT.hp`, engagement scope only | **no** — nothing copies it onto the mage |
 * | **capture** | **none anywhere** | n/a |
 *
 * So *"this one died"* and *"these two nodes moved"* are assertions. *"This one
 * came home with these wounds"* is not: it can be asserted only as the two
 * halves it really is — she was hurt in the engagement, and her universe cannot
 * tell. *"This one was captured"* cannot be written at all, and the test that
 * stands in for it asserts the absence rather than pretending it away.
 *
 * ## And a finding nobody was looking for
 *
 * Under the **shipped** raid constants no raider has ever come home. The last
 * `describe` block below is that measurement, pinned as a test so that the day
 * someone fixes it, it fails and says so.
 */

import { describe, expect, it } from 'vitest';

import { RAID_SIDE } from '@mm/state';
import { RAID_END_REASON } from '@mm/rules-raid';

import { fateOf, nodeId, resolveWarband } from './warband.js';
import type { WarbandResult } from './warband.js';

/** A node whose only interesting property is that it hurts people. */
const FIRE = 'cig-the-uncontained-hour';
/** The node a thief reads out of a mind, and the only reason theft happens here. */
const MIND_READING = 'im-read-the-surface';
/** A node the host keeps only on a shelf, so looting is the only way it moves. */
const SHELVED = 'rl-open-the-portal';

/**
 * The scenario every assertion below reads.
 *
 * Six named mages, three a side, one seed. Built once per `it` rather than
 * shared, because `resolveWarband` mutates two worlds and a shared result would
 * make the tests order-dependent — but built from the same arguments, so every
 * block is talking about the same raid.
 */
function sixMages(seed = 1): WarbandResult {
  return resolveWarband({
    attackers: [
      { name: 'Brannoc', nodes: [FIRE, MIND_READING] },
      { name: 'Sela', nodes: [MIND_READING] },
      { name: 'Odo', nodes: [FIRE] },
    ],
    defenders: [
      { name: 'Warden', nodes: [FIRE] },
      { name: 'Keeper', nodes: [FIRE] },
      { name: 'Archivist', nodes: [FIRE] },
    ],
    hostShelves: [SHELVED, FIRE],
    seed,
  });
}

describe('a named warband goes through a portal and comes back transformed', () => {
  it('reports one fate per mage, matched by name and read from her own world', () => {
    const result = sixMages();
    expect(result.fates.map((fate) => fate.name)).toEqual([
      'Brannoc',
      'Sela',
      'Odo',
      'Warden',
      'Keeper',
      'Archivist',
    ]);
    // Every one of them was actually derived into a combatant. Without this the
    // assertions below could all be satisfied by mages who never left home.
    for (const fate of result.fates) {
      expect(fate.fielded, `${fate.name} was never fielded`).toBe(true);
      expect(fate.aliveBefore).toBe(true);
    }
  });

  it('resolves, names a victor, and ends for a reason the enum knows', () => {
    const { outcome } = sixMages();
    expect([RAID_SIDE.attacker, RAID_SIDE.defender]).toContain(outcome.victor);
    expect(Object.values(RAID_END_REASON)).toContain(outcome.reason);
    expect(outcome.resolutionTick).toBeGreaterThan(0);
    expect(outcome.resolutionTick).toBeLessThanOrEqual(outcome.maxTicks);
  });

  it('is a pure function of its warband and its seed', () => {
    // Two independent universes built from the same arguments produce the same
    // fates. The raid subsystem in isolation is reproducible, which is what
    // makes every other assertion in this file a fact rather than a sample.
    expect(JSON.stringify(sixMages(1).fates)).toBe(JSON.stringify(sixMages(1).fates));
    expect(JSON.stringify(sixMages(2).fates)).not.toBe(JSON.stringify(sixMages(1).fates));
  });
});

describe('death is real, and it is written into the world', () => {
  it('empties a lost raider\'s mind through the ordinary death path', () => {
    // Searched rather than named. Under the constants this file was first
    // written against every raider was stranded, so `Brannoc` on the default
    // seed was a safe pick; `withdraw-after-ticks` makes most of them come home
    // and which ones do not is a property of the seed. The claim is about what
    // happens to a mage who is lost, not about who is unlucky.
    let lost;
    for (let seed = 1; seed <= 40 && lost === undefined; seed += 1) {
      lost = sixMages(seed).fates.find(
        (fate) => fate.side === RAID_SIDE.attacker && fate.died && fate.knownBefore.length > 0,
      );
    }

    expect(lost, 'no raider was lost in forty seeds, so this claim has nothing to stand on')
      .toBeDefined();
    if (lost === undefined) return;

    // Read from the `MAGE` row, not from the casualty list: the ledger claiming
    // a death and the world recording one are the two things this asserts are
    // the same event.
    expect(lost.aliveAfter).toBe(false);
    // Her memory palace and her mind empty with her. `applyRaidOutcome` routes
    // this through `knowledge-model`'s own `destroyInstancesHeldBy` rather than
    // a raid-specific rule, which is why the assertion is "she knows nothing"
    // and not "the raid deleted two rows".
    expect(lost.knownAfter).toEqual([]);
  });

  it('records a lost raider as stranded, which is death and not capture', () => {
    // The implication that matters, asserted over every attacker of every seed
    // rather than three named mages: stranded always resolves to a dead mage.
    // If this ever fails, the stranded-raider rule has grown a second outcome —
    // which is where capture would land, and it has not.
    let stranded = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      for (const fate of sixMages(seed).fates) {
        if (!fate.stranded) continue;
        stranded += 1;
        expect(fate.side, 'only an attacker can be stranded').toBe(RAID_SIDE.attacker);
        expect(fate.died, `${fate.name} was stranded but not killed`).toBe(true);
      }
    }
    // The control on the implication: it would hold vacuously if nobody were
    // ever stranded, which is the state `withdraw-after-ticks` had to avoid
    // creating in the other direction.
    expect(stranded).toBeGreaterThan(0);
  });

  it('leaves the defenders alive in their own world', () => {
    const result = sixMages();
    for (const name of ['Warden', 'Keeper', 'Archivist']) {
      const fate = fateOf(result, name);
      expect(fate.aliveAfter, `${name} should have survived her own defence`).toBe(true);
      expect(fate.stranded).toBe(false);
    }
  });
});

describe('wounds exist inside the engagement and nowhere else', () => {
  it('hurts a defender who then goes home with her vigor untouched', () => {
    // Seeds differ in who gets hit, so the wounded survivor is found rather
    // than named: the claim is about the write-back, not about who was unlucky.
    let wounded;
    for (let seed = 1; seed <= 40 && wounded === undefined; seed += 1) {
      const result = sixMages(seed);
      wounded = result.fates.find(
        (fate) => fate.side === RAID_SIDE.defender && fate.tookDamage && !fate.died,
      );
    }

    expect(
      wounded,
      'no defender was ever hurt and survived, so this claim has nothing to stand on',
    ).toBeDefined();
    if (wounded === undefined) return;

    // She was hurt: her engagement row finished below the hit points she
    // entered with.
    expect(wounded.engagementHpAtEnd).toBeLessThan(wounded.engagementMaxHp as number);
    expect(wounded.engagementHpAtEnd).toBeGreaterThan(0);

    // **And her universe cannot tell.** `MAGE.vigor` is byte-identical, which is
    // the whole finding: a mage who was nearly killed abroad is indistinguishable
    // at home from one who never went. There is no wound state to carry, and
    // `vigor` — the field a tradition's `cost` hook deducts from, and the only
    // plausible carrier on the row — is not written by any raid path.
    expect(wounded.worldVigorAfter).toBe(wounded.worldVigorBefore);
  });

  it('leaves every survivor of every seed at exactly the vigor she left with', () => {
    // The general form of the claim above, so it cannot be satisfied by one
    // lucky mage. Nothing in `rules-raid` writes `MAGE.vigor` at all.
    for (let seed = 1; seed <= 12; seed += 1) {
      for (const fate of sixMages(seed).fates) {
        if (fate.died) continue;
        expect(
          fate.worldVigorAfter,
          `${fate.name} came home from raid ${String(seed)} with different vigor`,
        ).toBe(fate.worldVigorBefore);
      }
    }
  });
});

describe('capture has no representation, and that is the gap', () => {
  it('never reports a captured mage, because there is nothing to report it from', () => {
    // Not a behavioural claim — a structural one. `MAGE` has no captured field,
    // `RaidOutcome` has no captured record, and the string "captur" appears in
    // `packages/` only against *objectives*. A mage cannot be taken, only killed.
    for (let seed = 1; seed <= 12; seed += 1) {
      for (const fate of sixMages(seed).fates) {
        expect(fate.captured).toBe(false);
      }
    }
  });

  it('accounts for every fielded mage as exactly alive or dead, with no third state', () => {
    const result = sixMages();
    for (const fate of result.fates) {
      // The positive control on the claim above: if capture existed, some mage
      // would have to be neither at home nor dead, and this would be where she
      // showed up.
      expect(fate.aliveAfter === !fate.died).toBe(true);
    }
  });
});

describe('knowledge moves between universes, and the moves are readable', () => {
  it('takes a book off the host shelf and puts the node in the raider universe', () => {
    const result = sixMages();

    // The host had both shelved nodes and holds fewer afterwards; the raider's
    // universe holds one it did not. `applied` is `applyRaidOutcome`'s own
    // §1.5 recomputation, never a cache.
    expect(result.applied.nodesLostByHost).toContain(nodeId(SHELVED));
    expect(result.applied.nodesGainedByRaider).toContain(nodeId(SHELVED));

    expect(result.hostNodesBefore).toContain(nodeId(SHELVED));
    expect(result.hostNodesAfter).not.toContain(nodeId(SHELVED));
    expect(result.attackerNodesBefore).not.toContain(nodeId(SHELVED));
    expect(result.attackerNodesAfter).toContain(nodeId(SHELVED));
  });

  it('moves the looted book even when no raider who could carry it survived', () => {
    // Worth its own assertion because it is surprising and it is load-bearing:
    // library looting is settled by `settleLibrary` against the *objective*, so
    // it is not gated on a surviving carrier — while a node read out of a mind
    // is forfeited if the thief does not come home. Two knowledge routes out of
    // a universe with two different survival requirements.
    //
    // Searched for a raid in which nobody came back, because that is now the
    // uncommon case rather than the only one. The claim is unchanged; what
    // changed is that it takes a seed to demonstrate.
    let wiped;
    for (let seed = 1; seed <= 40 && wiped === undefined; seed += 1) {
      const result = sixMages(seed);
      const survivors = result.fates.filter(
        (fate) => fate.side === RAID_SIDE.attacker && !fate.died,
      );
      if (survivors.length === 0 && result.applied.nodesGainedByRaider.length > 0) wiped = result;
    }

    expect(
      wiped,
      'no raid in forty seeds lost its whole warband and still moved a book',
    ).toBeDefined();
  });
});

/**
 * The measurement this harness was built to be able to take, and the answer it
 * gives now.
 *
 * **It used to be zero.** Under the constants this file was written against, no
 * raider came home from any of sixty raids — not because of damage, but because
 * `chooseIntent` ordered a withdrawal only once `portalStability` fell to
 * `withdraw-stability-margin` (409,600), and a portal that opens with 2,401–3,600
 * ticks of life never falls that far inside a raid that ends around tick 65. The
 * threshold was unreachable in every raid the shipped numbers produced, so the
 * stranded-raider rule took every survivor and `knowledge-steal` could not
 * deliver a single node: every theft was forfeited with the thief.
 *
 * `withdraw-after-ticks` replaces it with an elapsed-tick threshold, which is a
 * clock the raid actually runs on. This pins the new answer at the same sixty
 * seeds, and it is pinned rather than written down for the same reason the old
 * zero was: it is a balance claim, and it should fail loudly the moment it stops
 * being true. The **direction** is the assertion — raiders come home, thefts are
 * delivered — and the exact counts are recorded beside it so a change that moves
 * them has to say so.
 *
 * Measured on this tree: **173 of 180 raiders come home**, and **0 of 33 mind-
 * thefts are forfeited**, against 0 and 33-of-33 before. The seven who do not
 * come home are the control on the other side — the timer still takes people.
 */
const SIXTY_SEED_WITHDRAWALS = 173;

describe('under the shipped constants, raiders come home', () => {
  it('brings most attackers back across sixty seeds and delivers their thefts', () => {
    let attackers = 0;
    let survivors = 0;
    let withdrawals = 0;
    let thefts = 0;
    let forfeited = 0;

    for (let seed = 1; seed <= 60; seed += 1) {
      const result = sixMages(seed);
      for (const fate of result.fates) {
        if (fate.side !== RAID_SIDE.attacker) continue;
        attackers += 1;
        if (!fate.died) survivors += 1;
        if (fate.withdrew) withdrawals += 1;
      }
      for (const movement of result.outcome.knowledgeMovements) {
        if (movement.verb !== 'copied') continue;
        thefts += 1;
        if (movement.forfeited) forfeited += 1;
      }
    }

    expect(attackers).toBe(180);

    // The direction, which is the claim. A survivor is an attacker who was not
    // taken by anything — damage or the timer — and every survivor here is a
    // raider who reached the portal, because the stranded-raider rule leaves no
    // third option.
    expect(withdrawals).toBeGreaterThan(0);
    expect(survivors).toBe(withdrawals);

    // The counts, recorded. `SIXTY_SEED_WITHDRAWALS` is a measurement of this
    // tree at this content revision, not a target.
    expect(withdrawals).toBe(SIXTY_SEED_WITHDRAWALS);

    // The control, kept from the version of this test that asserted zero: theft
    // *happens*, so "delivered" is a statement about extraction rather than
    // about a mechanic that never fires.
    expect(thefts).toBeGreaterThan(0);
    expect(forfeited).toBeLessThan(thefts);
  });

  it('withdraws immediately when the threshold is tick zero', () => {
    // The positive control, kept and repointed. Nothing was ever wrong with the
    // withdrawal *code*; the threshold was simply never crossed. Ask for it on
    // the opening tick and a raider walks out alive.
    const result = resolveWarband({
      attackers: [
        { name: 'Brannoc', nodes: [FIRE, MIND_READING] },
        { name: 'Sela', nodes: [MIND_READING] },
      ],
      defenders: [{ name: 'Warden', nodes: [FIRE] }],
      hostShelves: [SHELVED, FIRE],
      seed: 42,
      tuningOverride: { withdrawAfterTicks: 0 },
    });

    expect(result.fates.some((fate) => fate.withdrew)).toBe(true);
    for (const name of ['Brannoc', 'Sela']) {
      expect(fateOf(result, name).died, `${name} should have survived`).toBe(false);
    }
  });
});
