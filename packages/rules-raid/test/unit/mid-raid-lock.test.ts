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
  applyRaidOutcome,
  changeRuleMidRaid,
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
