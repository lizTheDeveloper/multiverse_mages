/*
 * Multiverse Mages — the ruleset changes mid-raid, and the change locks.
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
 * `raid-engagement.md` §1, and the worked case the design asks for by name:
 *
 * > You are being raided and your library is about to be unmade, so you
 * > **forbid Perdo**. Under host arbitration that works absolutely: nobody
 * > inside your universe can unmake anything, *including the raider*. It also
 * > means **your own defenders cannot use Perdo for the rest of the
 * > engagement**, and you cannot take it back when the fight turns.
 *
 * All three halves of that sentence are separate assertions below, because all
 * three are separately breakable and only the first is obvious.
 */

import { describe, expect, it } from 'vitest';

import {
  EDICT,
  EDICT_KIND,
  MID_RAID_CHANGE,
  RULE_CHANGE_KIND,
  RULE_SCOPE,
  collectRecords,
  componentOf,
  findUniverse,
  permits,
  readMidRaidMarks,
  readRulesetForObservation,
  readUniverse,
} from '@mm/state';
import {
  ENGAGEMENT_PHASE,
  applyRaidOutcome,
  changeRuleMidRaid,
  currentPhase,
  livingCombatants,
  resolveRaid,
  runRaid,
  stepEngagement,
} from '@mm/rules-raid';

import { buildRaid, grid, nodeId, registry, ruleset } from './raid-fixture.js';

/** Perdo is the fourth technique: creo, intellego, muto, perdo, rego. */
const PERDO_BIT = 3;
/** A perdo-terram node both sides are given, so the forbid cuts both ways. */
const CRUMBLE = 'pt-crumble';
/** A rego node, so there is something left to cast after perdo goes. */
const REGO = 'rt-set-the-stone';

const FORBID_PERDO = {
  scope: RULE_SCOPE.technique,
  targetId: PERDO_BIT,
  kind: RULE_CHANGE_KIND.forbid,
} as const;

function withPerdoOnBothSides() {
  return buildRaid({
    raiderNodes: [CRUMBLE, REGO],
    hostNodes: [CRUMBLE, REGO],
    withSoldiers: true,
  });
}

describe('the defender forbids Perdo mid-raid', () => {
  it('takes it from the raider', () => {
    const { raid } = withPerdoOnBothSides();
    const attacker = raid.rosters[0].briefs[0]!;
    expect(attacker.legalNodes.has(nodeId(CRUMBLE))).toBe(true);

    const result = changeRuleMidRaid(raid, FORBID_PERDO, 4096);

    expect(result.applied).toBe(true);
    expect(attacker.legalNodes.has(nodeId(CRUMBLE))).toBe(false);
    expect(result.nodesUnmade).toContain(nodeId(CRUMBLE));
  });

  it('takes it from the defender too, which is the price', () => {
    const { raid } = withPerdoOnBothSides();
    const defender = raid.rosters[1].briefs[0]!;
    expect(defender.legalNodes.has(nodeId(CRUMBLE))).toBe(true);

    const result = changeRuleMidRaid(raid, FORBID_PERDO, 4096);

    expect(defender.legalNodes.has(nodeId(CRUMBLE))).toBe(false);
    // Both sides lost combatants to it. A forbid that only cost the attacker
    // would not be the decision the design is describing.
    expect(result.combatantsAffected[0]).toBeGreaterThan(0);
    expect(result.combatantsAffected[1]).toBeGreaterThan(0);
  });

  it('cannot be taken back while the raid runs', () => {
    const { raid } = withPerdoOnBothSides();
    expect(changeRuleMidRaid(raid, FORBID_PERDO, 4096).applied).toBe(true);

    const back = changeRuleMidRaid(
      raid,
      { scope: RULE_SCOPE.technique, targetId: PERDO_BIT, kind: RULE_CHANGE_KIND.permit },
      4096,
    );

    expect(back.applied).toBe(false);
    expect(back.refusal).toBe('locked');
    expect(raid.rosters[0].briefs[0]!.legalNodes.has(nodeId(CRUMBLE))).toBe(false);
  });

  it('cannot be forbidden twice either — the lock is on the knob', () => {
    const { raid } = withPerdoOnBothSides();
    expect(changeRuleMidRaid(raid, FORBID_PERDO, 4096).applied).toBe(true);
    expect(changeRuleMidRaid(raid, FORBID_PERDO, 4096).refusal).toBe('locked');
  });

  it('leaves the raid still runnable, and never blocks a forbidden cast', () => {
    const { raid } = withPerdoOnBothSides();
    // Ten ticks of ordinary fighting, then the intervention, then the rest.
    for (let tick = 0; tick < 10; tick += 1) {
      if (stepEngagement(raid) !== undefined) break;
    }
    changeRuleMidRaid(raid, FORBID_PERDO, 4096);
    const outcome = runRaid(raid);

    // The 0.9.0 invariant. Layer 1 was brought back into agreement with layer 2
    // atomically, so layer 2 never had to be the thing that stopped a cast.
    expect(outcome.forbiddenCastsBlocked).toBe(0);
    expect(outcome.resolutionTick).toBeLessThanOrEqual(raid.maxTicks);
  });
});

describe('a change that changes nothing is refused rather than charged', () => {
  it('refuses forbidding what is already forbidden', () => {
    const { raid } = buildRaid({
      hostRuleset: ruleset({ permittedTechniques: 0b11111 & ~(1 << PERDO_BIT) }),
    });
    expect(changeRuleMidRaid(raid, FORBID_PERDO, 4096).refusal).toBe('not-a-change');
    expect(raid.lock.size).toBe(0);
  });

  it('refuses a target that is not on the grid', () => {
    const { raid } = buildRaid();
    expect(
      changeRuleMidRaid(
        raid,
        { scope: RULE_SCOPE.technique, targetId: 99, kind: RULE_CHANGE_KIND.forbid },
        0,
      ).refusal,
    ).toBe('out-of-range');
  });

  it('refuses an interdiction on a cell nothing could cast in anyway', () => {
    const perdoTerram = grid.cellByName('perdo-terram').cellId;
    const { raid } = buildRaid({
      hostRuleset: ruleset({ permittedTechniques: 0b11111 & ~(1 << PERDO_BIT) }),
    });
    expect(
      changeRuleMidRaid(
        raid,
        { scope: RULE_SCOPE.cell, targetId: perdoTerram, kind: RULE_CHANGE_KIND.forbid },
        0,
      ).refusal,
    ).toBe('not-a-change');
  });
});

describe('a cell-scoped change', () => {
  it('forbids one cell and leaves the rest of the technique alone', () => {
    const perdoTerram = grid.cellByName('perdo-terram').cellId;
    const perdoMentem = grid.cellByName('perdo-mentem').cellId;
    const { raid } = buildRaid({
      raiderNodes: [CRUMBLE, 'pm-blunt-the-edge'],
      hostNodes: [CRUMBLE],
    });

    const result = changeRuleMidRaid(
      raid,
      { scope: RULE_SCOPE.cell, targetId: perdoTerram, kind: RULE_CHANGE_KIND.forbid },
      2048,
    );

    expect(result.applied).toBe(true);
    const attacker = raid.rosters[0].briefs[0]!;
    expect(attacker.legalNodes.has(nodeId(CRUMBLE))).toBe(false);
    expect(attacker.legalNodes.has(nodeId('pm-blunt-the-edge'))).toBe(true);
    expect(permits(raid.arbiter.hostRuleset, perdoMentem)).toBe(true);
  });
});

describe('the mark the raid leaves', () => {
  it('moves the host universe\'s own ruleset, and records why', () => {
    const { raid, hostWorld } = withPerdoOnBothSides();
    changeRuleMidRaid(raid, FORBID_PERDO, 4096);
    const outcome = resolveRaid(raid, 1);

    expect(outcome.constitutionalMarks).toHaveLength(1);
    expect(outcome.constitutionalMarks[0]).toMatchObject({
      scope: RULE_SCOPE.technique,
      targetId: PERDO_BIT,
      changeKind: RULE_CHANGE_KIND.forbid,
      paidCost: 4096,
    });

    applyRaidOutcome(raid, outcome);

    // The change is real in the world, not only in the discarded raid.
    const marks = readMidRaidMarks(hostWorld);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.paidCost).toBe(4096);
    expect(componentOf(hostWorld, MID_RAID_CHANGE).has(marks[0]!.handle)).toBe(true);
  });

  it('writes a cell change as a real edict on the host universe', () => {
    const perdoTerram = grid.cellByName('perdo-terram').cellId;
    const { raid, hostWorld } = buildRaid({
      raiderNodes: [CRUMBLE, REGO],
      hostNodes: [CRUMBLE, REGO],
      withHostUniverse: true,
    });
    changeRuleMidRaid(
      raid,
      { scope: RULE_SCOPE.cell, targetId: perdoTerram, kind: RULE_CHANGE_KIND.forbid },
      2048,
    );
    applyRaidOutcome(raid, resolveRaid(raid, 1));

    const edicts = collectRecords(hostWorld, EDICT).map(({ row }) => row);
    expect(edicts).toHaveLength(1);
    expect(edicts[0]).toMatchObject({ cellId: perdoTerram, kind: EDICT_KIND.interdiction });
    expect(permits(readRulesetForObservation(hostWorld, findUniverse(hostWorld)), perdoTerram)).toBe(
      false,
    );
  });

  it('moves the host universe bitmask for a technique change', () => {
    const { raid, hostWorld } = buildRaid({
      raiderNodes: [CRUMBLE, REGO],
      hostNodes: [CRUMBLE, REGO],
      withHostUniverse: true,
    });
    const universe = findUniverse(hostWorld);
    expect(readUniverse(hostWorld, universe).permittedTechniques & (1 << PERDO_BIT)).not.toBe(0);

    changeRuleMidRaid(raid, FORBID_PERDO, 4096);
    applyRaidOutcome(raid, resolveRaid(raid, 1));

    expect(readUniverse(hostWorld, universe).permittedTechniques & (1 << PERDO_BIT)).toBe(0);
  });

  it('is empty for a raid nobody intervened in', () => {
    const { raid, hostWorld } = withPerdoOnBothSides();
    const outcome = runRaid(raid);
    expect(outcome.constitutionalMarks).toEqual([]);
    applyRaidOutcome(raid, outcome);
    expect(readMidRaidMarks(hostWorld)).toEqual([]);
  });
});

describe('the ruleset arithmetic', () => {
  it('never mutates the snapshot it was given', () => {
    const { raid } = withPerdoOnBothSides();
    const opening = raid.engagement.raid.hostRuleset;
    const openingTechniques = opening.permittedTechniques;
    changeRuleMidRaid(raid, FORBID_PERDO, 0);

    // `RaidState.hostRuleset` is what the raid *opened* under and must stay
    // answerable; the arbiter carries what it is being fought under.
    expect(opening.permittedTechniques).toBe(openingTechniques);
    expect(raid.arbiter.hostRuleset.permittedTechniques).not.toBe(openingTechniques);
  });

  it('resolves an interdiction laid over a standing dispensation', () => {
    const perdoTerram = grid.cellByName('perdo-terram').cellId;
    const { raid } = buildRaid({
      hostRuleset: ruleset({
        permittedTechniques: 0b11111 & ~(1 << PERDO_BIT),
        edicts: [{ cellId: perdoTerram, kind: EDICT_KIND.dispensation }],
      }),
      raiderNodes: [CRUMBLE],
      hostNodes: [CRUMBLE],
    });
    expect(raid.rosters[0].briefs[0]!.legalNodes.has(nodeId(CRUMBLE))).toBe(true);

    const result = changeRuleMidRaid(
      raid,
      { scope: RULE_SCOPE.cell, targetId: perdoTerram, kind: RULE_CHANGE_KIND.forbid },
      1024,
    );

    expect(result.applied).toBe(true);
    // Exactly one edict on the cell, and it is the interdiction. A cell
    // carrying both is a defect §1.1 refuses outright.
    const onCell = raid.arbiter.hostRuleset.edicts.filter(
      (edict) => edict.cellId === perdoTerram,
    );
    expect(onCell).toHaveLength(1);
    expect(onCell[0]?.kind).toBe(EDICT_KIND.interdiction);
    expect(raid.rosters[0].briefs[0]!.legalNodes.has(nodeId(CRUMBLE))).toBe(false);
  });

  it('only ever names nodes the content set has', () => {
    expect(registry.node(nodeId(CRUMBLE))).toBeDefined();
    expect(registry.node(nodeId(REGO))).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// §5's second claim, as an experiment.
// ---------------------------------------------------------------------------

/**
 * > **The lock creates regret.** Some fraction of raids should feature a
 * > mid-raid forbid that the player would take back if they could. Zero regret
 * > means the lock costs nothing and is not a decision.
 *
 * ## What "would take it back" is measured as, and why not survival
 *
 * Survival was tried first and reports **zero** on every seed, and the reason is
 * a finding about the engine rather than about the lock: at shipped tuning a
 * raid is decided by **objective capture, not by combat**. The raider walks to
 * three objectives, takes all three, and leaves in 60–100 engagement ticks —
 * before casting has killed anybody on either side. Every arm of every pairing
 * ended with the same four wardens standing and the same three objectives taken,
 * whatever the god did to the ruleset.
 *
 * That is worth writing down twice, because it is the thing a balance sweep
 * should move before anyone tunes a verb: **mid-raid policy cannot decide a raid
 * that combat does not decide.** Recorded, not worked around.
 *
 * So regret is measured where the forbid actually lands — the damage ledger.
 * A forbid is one the player would take back when it cost **her side** more
 * applied damage than it cost the raider's, which is the same question the
 * design asks, asked of the quantity the mechanic actually moves.
 */
const REGRET_SEEDS = [1, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 42, 77, 101, 313, 999];

/** Damage each side applied, with and without a mid-raid forbid at first contact. */
function damageWith(seed: number, forbid: boolean, hostNodes: readonly string[]) {
  const { raid } = buildRaid({
    seed,
    withHostUniverse: true,
    withSoldiers: true,
    withLaborers: true,
    extraWardens: 3,
    // The raider keeps a second technique, so forbidding Perdo does not simply
    // disarm her. A forbid the attacker cannot lose to is not a decision.
    raiderNodes: [CRUMBLE, 'cig-the-uncontained-hour'],
    hostNodes,
  });

  let issued = false;
  let termination;
  for (;;) {
    if (!issued && forbid && currentPhase(raid) === ENGAGEMENT_PHASE.contact) {
      changeRuleMidRaid(raid, FORBID_PERDO, 6144);
      issued = true;
    }
    termination = stepEngagement(raid);
    if (termination !== undefined) break;
  }
  const outcome = resolveRaid(raid, termination.reason);
  const applied = outcome.primitiveApplication.find(([id]) => id === 'direct-damage')?.[1];
  return { attacker: applied?.attacker ?? 0, defender: applied?.defender ?? 0 };
}

describe('§5: the lock creates regret', () => {
  it('costs the defender more than the raider in most raids, and not in all', () => {
    // Measured on this commit over 18 seeds, the defender forbidding Perdo at
    // first contact while her wardens hold only Perdo:
    //   13 of 18  the forbid cost her side more applied damage than the raider's
    //    4 of 18  it was worth it — the raider lost more
    //    1 of 18  it changed nothing either way
    // With a second technique in her wardens' hands the split is 12 / 5 / 1.
    //
    // Both halves are the claim. Non-zero regret says the lock is a real price;
    // a regret rate below one means it is a *decision* rather than a trap.
    let regret = 0;
    let worthIt = 0;
    for (const seed of REGRET_SEEDS) {
      const control = damageWith(seed, false, [CRUMBLE]);
      const locked = damageWith(seed, true, [CRUMBLE]);
      const defenderLost = control.defender - locked.defender;
      const attackerLost = control.attacker - locked.attacker;
      if (defenderLost > attackerLost) regret += 1;
      else if (attackerLost > defenderLost) worthIt += 1;
    }

    expect(regret).toBeGreaterThan(0);
    expect(worthIt).toBeGreaterThan(0);
    // A lock that is regretted in most raids is a lock with teeth. Asserted as a
    // majority rather than as 13 exactly, so that a tuning change moves the
    // number without inventing a failure.
    expect(regret * 2).toBeGreaterThan(REGRET_SEEDS.length);
  });

  it('reports zero regret in survival, which is a finding about the engine', () => {
    // The measurement that did not work, kept because it is the useful one. If
    // a later change makes combat decide raids, this test starts failing and
    // the failure is the news.
    let differed = 0;
    for (const seed of REGRET_SEEDS.slice(0, 6)) {
      const control = survivorsWith(seed, false);
      const locked = survivorsWith(seed, true);
      if (control !== locked) differed += 1;
    }
    expect(differed).toBe(0);
  });
});

/** Defenders standing when the portal closed, with and without the forbid. */
function survivorsWith(seed: number, forbid: boolean): number {
  const { raid } = buildRaid({
    seed,
    withHostUniverse: true,
    extraWardens: 3,
    raiderNodes: [CRUMBLE, 'cig-the-uncontained-hour'],
    hostNodes: [CRUMBLE],
  });
  let issued = false;
  for (;;) {
    if (!issued && forbid && currentPhase(raid) === ENGAGEMENT_PHASE.contact) {
      changeRuleMidRaid(raid, FORBID_PERDO, 6144);
      issued = true;
    }
    if (stepEngagement(raid) !== undefined) break;
  }
  return livingCombatants(raid).filter((brief) => brief.side === 1).length;
}
