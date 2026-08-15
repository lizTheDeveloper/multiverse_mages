/*
 * Multiverse Mages — the raid verb set, and the measurement that says it is not
 * decoration.
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
 * `raid-engagement.md` §3 and §5.
 *
 * The last suite here is the one that matters, and it is the design's own first
 * claim stated as a test rather than as an intention:
 *
 * > **The muster decisions change the outcome.** Two arms, same seed, same
 * > forces, different muster spend → different survival. If the outcome is
 * > identical, the verbs are decoration.
 *
 * It is written as a **paired** experiment across several seeds rather than as
 * one run, because a single run that happened to differ would be a coincidence
 * and a single run that happened not to would be a false negative.
 */

import { describe, expect, it } from 'vitest';

import {
  COMBATANT,
  RAID_SIDE,
  RULE_CHANGE_KIND,
  MAGE,
  RULE_SCOPE,
  UNIVERSE,
  componentOf,
  findUniverse,
} from '@mm/state';
import type { Directive, RaidVerbValue } from '@mm/rules-raid';
import {
  ENGAGEMENT_PHASE,
  RAID_VERB,
  applyDirective,
  applyRaidOutcome,
  currentPhase,
  legalVerbs,
  livingCombatants,
  purseOf,
  resolveRaid,
  runRaid,
  stepEngagement,
  verbCost,
  verbSide,
} from '@mm/rules-raid';

import { buildRaid, nodeId } from './raid-fixture.js';

const FIRE = 'cig-the-uncontained-hour';

function defenderDirective(verb: RaidVerbValue, change?: Directive['change']): Directive {
  return change === undefined
    ? { verb, side: RAID_SIDE.defender }
    : { verb, side: RAID_SIDE.defender, change };
}

function attackerDirective(verb: RaidVerbValue): Directive {
  return { verb, side: RAID_SIDE.attacker };
}

describe('the verbs belong to sides, and forbidding is defender-only', () => {
  it('gives each verb exactly one side', () => {
    expect(verbSide(RAID_VERB.forbid)).toBe(RAID_SIDE.defender);
    expect(verbSide(RAID_VERB.permit)).toBe(RAID_SIDE.defender);
    expect(verbSide(RAID_VERB.levy)).toBe(RAID_SIDE.defender);
    expect(verbSide(RAID_VERB.ward)).toBe(RAID_SIDE.defender);
    expect(verbSide(RAID_VERB.mend)).toBe(RAID_SIDE.attacker);
    expect(verbSide(RAID_VERB.conceal)).toBe(RAID_SIDE.attacker);
  });

  it('refuses an attacker who tries to forbid', () => {
    // §6.2, ruled: under host arbitration an attacker forbidding her own cells
    // would change nothing inside the universe she is standing in, so the verb
    // is defender-only rather than a dead entry in her action space.
    const { raid } = buildRaid({ withHostUniverse: true });
    const result = applyDirective(raid, {
      verb: RAID_VERB.forbid,
      side: RAID_SIDE.attacker,
      change: { scope: RULE_SCOPE.technique, targetId: 3, kind: RULE_CHANGE_KIND.forbid },
    });
    expect(result.refusal).toBe('wrong-side');
    expect(raid.lock.size).toBe(0);
  });

  it('refuses a defender who tries to spend the attacker\'s Vis', () => {
    const { raid } = buildRaid({ withHostUniverse: true });
    expect(applyDirective(raid, defenderDirective(RAID_VERB.mend)).refusal).toBe('wrong-side');
  });
});

describe('agency decays across the phases', () => {
  it('offers the full set in muster', () => {
    expect(legalVerbs(RAID_SIDE.defender, ENGAGEMENT_PHASE.muster)).toEqual([
      RAID_VERB.forbid,
      RAID_VERB.permit,
      RAID_VERB.levy,
      RAID_VERB.ward,
    ]);
    expect(legalVerbs(RAID_SIDE.attacker, ENGAGEMENT_PHASE.muster)).toEqual([
      RAID_VERB.mend,
      RAID_VERB.conceal,
    ]);
  });

  it('offers fewer, sharper interventions in contact', () => {
    const defender = legalVerbs(RAID_SIDE.defender, ENGAGEMENT_PHASE.contact);
    const attacker = legalVerbs(RAID_SIDE.attacker, ENGAGEMENT_PHASE.contact);
    expect(defender.length).toBeLessThan(
      legalVerbs(RAID_SIDE.defender, ENGAGEMENT_PHASE.muster).length,
    );
    expect(attacker.length).toBeLessThan(
      legalVerbs(RAID_SIDE.attacker, ENGAGEMENT_PHASE.muster).length,
    );
    // §2 says ruleset changes are still possible in contact, and still locking.
    expect(defender).toContain(RAID_VERB.forbid);
    expect(defender).toContain(RAID_VERB.permit);
  });

  it('offers nothing at all in resolution', () => {
    expect(legalVerbs(RAID_SIDE.defender, ENGAGEMENT_PHASE.resolution)).toEqual([]);
    expect(legalVerbs(RAID_SIDE.attacker, ENGAGEMENT_PHASE.resolution)).toEqual([]);
  });

  it('refuses a real directive once the phase has closed on it', () => {
    const { raid } = buildRaid({ withSoldiers: true, withLaborers: true, withHostUniverse: true });
    expect(applyDirective(raid, defenderDirective(RAID_VERB.levy)).applied).toBe(true);

    while (currentPhase(raid) === ENGAGEMENT_PHASE.muster) {
      if (stepEngagement(raid) !== undefined) break;
    }
    expect(currentPhase(raid)).not.toBe(ENGAGEMENT_PHASE.muster);
    expect(applyDirective(raid, defenderDirective(RAID_VERB.levy)).refusal).toBe(
      'phase-closed',
    );
  });
});

describe('two currencies, and neither one touches a world while the raid runs', () => {
  it('opens the defender\'s purse at the host god\'s own favor', () => {
    const { raid } = buildRaid({ withHostUniverse: true });
    expect(purseOf(raid.purse, RAID_SIDE.defender)).toBe(64 * 1024);
    expect(purseOf(raid.purse, RAID_SIDE.attacker)).toBe(raid.tuning.attackerVisStock);
  });

  it('refuses a verb the purse cannot cover, and charges nothing', () => {
    const { raid } = buildRaid({
      withSoldiers: true,
      withHostUniverse: true,
      tuningOverride: { verbWardCost: 999_999_999 },
    });
    const before = purseOf(raid.purse, RAID_SIDE.defender);
    expect(applyDirective(raid, defenderDirective(RAID_VERB.ward)).refusal).toBe('unaffordable');
    expect(purseOf(raid.purse, RAID_SIDE.defender)).toBe(before);
  });

  it('leaves the host universe\'s favor untouched until the outcome is applied', () => {
    const { raid, hostWorld } = buildRaid({ withSoldiers: true, withHostUniverse: true });
    const universe = findUniverse(hostWorld);
    const favorOf = (): number => componentOf(hostWorld, UNIVERSE).get(universe, 'favor');
    const openingFavor = favorOf();

    const opening = purseOf(raid.purse, RAID_SIDE.defender);
    applyDirective(raid, defenderDirective(RAID_VERB.ward));
    expect(purseOf(raid.purse, RAID_SIDE.defender)).toBeLessThan(opening);

    // Not one field of the world has moved yet, which is what makes the whole
    // settlement atomic.
    expect(favorOf()).toBe(openingFavor);

    const outcome = runRaid(raid);
    expect(outcome.favorSpentByDefender).toBe(raid.tuning.verbWardCost);
    expect(favorOf()).toBe(openingFavor);

    applyRaidOutcome(raid, outcome);
    expect(favorOf()).toBe(openingFavor - raid.tuning.verbWardCost);
  });

  it('spends Vis and not favor when the attacker acts', () => {
    const { raid } = buildRaid({ withHostUniverse: true });
    const favorBefore = purseOf(raid.purse, RAID_SIDE.defender);
    const result = applyDirective(raid, attackerDirective(RAID_VERB.conceal));
    expect(result.applied).toBe(true);
    expect(result.paid).toBe(verbCost(raid, RAID_VERB.conceal));
    expect(purseOf(raid.purse, RAID_SIDE.defender)).toBe(favorBefore);
    expect(purseOf(raid.purse, RAID_SIDE.attacker)).toBe(
      raid.tuning.attackerVisStock - result.paid,
    );
  });
});

describe('each verb does the thing it says', () => {
  it('levy fields a detachment out of a cohort that does not fight', () => {
    const { raid } = buildRaid({ withSoldiers: true, withLaborers: true, withHostUniverse: true });
    const before = raid.rosters[RAID_SIDE.defender].briefs.length;
    expect(applyDirective(raid, defenderDirective(RAID_VERB.levy)).applied).toBe(true);
    expect(raid.rosters[RAID_SIDE.defender].briefs.length).toBe(before + 1);
  });

  it('levy refuses a universe whose soldiers are already all on the field', () => {
    // The finding that renamed this verb. `portal.ts` commits every detachment a
    // soldier cohort can field at deployment, so a verb that asked for "one more
    // soldier" could never fire — legal, and refusing forever. With soldiers and
    // nobody else, there is genuinely nothing left to levy.
    const { raid } = buildRaid({ withSoldiers: true, withHostUniverse: true });
    expect(applyDirective(raid, defenderDirective(RAID_VERB.levy)).refusal).toBe('no-effect');
  });

  it('ward appends a source rather than writing a total, so the cap still applies', () => {
    const { raid } = buildRaid({ withHostUniverse: true, hostNodes: [FIRE] });
    const warden = raid.rosters[RAID_SIDE.defender].briefs[0]!;
    const before = warden.wardSources.length;
    expect(applyDirective(raid, defenderDirective(RAID_VERB.ward)).applied).toBe(true);
    expect(warden.wardSources.length).toBe(before + 1);
    expect(warden.wardSources.at(-1)).toBe(raid.tuning.verbWardMagnitude);
  });

  it('mend raises hit points and never above what she arrived with', () => {
    const { raid } = buildRaid({ withHostUniverse: true });
    const store = componentOf(raid.engagement.entities, COMBATANT);
    const raider = raid.rosters[RAID_SIDE.attacker].briefs[0]!;
    const max = store.get(raider.handle, 'maxHp');
    store.set(raider.handle, 'hp', 1);

    expect(applyDirective(raid, attackerDirective(RAID_VERB.mend)).applied).toBe(true);
    expect(store.get(raider.handle, 'hp')).toBe(
      Math.min(1 + raid.tuning.verbMendHitPoints, max),
    );

    store.set(raider.handle, 'hp', max);
    expect(applyDirective(raid, attackerDirective(RAID_VERB.mend)).refusal).toBe('no-effect');
  });

  it('conceal raises concealment and clamps at the authored ceiling', () => {
    const { raid } = buildRaid({ withHostUniverse: true });
    const store = componentOf(raid.engagement.entities, COMBATANT);
    const raider = raid.rosters[RAID_SIDE.attacker].briefs[0]!;
    expect(applyDirective(raid, attackerDirective(RAID_VERB.conceal)).applied).toBe(true);
    expect(store.get(raider.handle, 'concealment')).toBe(raid.tuning.verbConcealMagnitude);

    store.set(raider.handle, 'concealment', raid.tuning.concealmentCap);
    expect(applyDirective(raid, attackerDirective(RAID_VERB.conceal)).refusal).toBe('no-effect');
  });

  it('forbid goes through the lock, and pays only when the lock accepts', () => {
    const { raid } = buildRaid({ withHostUniverse: true, raiderNodes: [FIRE], hostNodes: [FIRE] });
    const change = { scope: RULE_SCOPE.technique, targetId: 3, kind: RULE_CHANGE_KIND.forbid };
    const opening = purseOf(raid.purse, RAID_SIDE.defender);

    const first = applyDirective(raid, defenderDirective(RAID_VERB.forbid, change));
    expect(first.applied).toBe(true);
    expect(purseOf(raid.purse, RAID_SIDE.defender)).toBe(opening - raid.tuning.verbForbidCost);

    // Locked, and a locked change costs a decision but not a resource.
    const second = applyDirective(raid, defenderDirective(RAID_VERB.permit, change));
    expect(second.refusal).toBe('refused');
    expect(second.rule?.refusal).toBe('locked');
    expect(purseOf(raid.purse, RAID_SIDE.defender)).toBe(opening - raid.tuning.verbForbidCost);
  });

  it('takes the direction from the verb, never from the change it carries', () => {
    // A directive that said `forbid` and carried a permit would be a client bug
    // that silently opened a cell. The verb decides.
    const { raid } = buildRaid({ withHostUniverse: true, raiderNodes: [FIRE], hostNodes: [FIRE] });
    const result = applyDirective(
      raid,
      defenderDirective(RAID_VERB.forbid, {
        scope: RULE_SCOPE.technique,
        targetId: 3,
        kind: RULE_CHANGE_KIND.permit,
      }),
    );
    expect(result.applied).toBe(true);
    expect(raid.lock.changes()[0]?.kind).toBe(RULE_CHANGE_KIND.forbid);
  });
});

// ---------------------------------------------------------------------------
// §5's first claim, as an experiment.
// ---------------------------------------------------------------------------

/** The eight seeds both arms are paired over. Fixed, so the numbers are quotable. */
const SEEDS = [1, 7, 11, 23, 42, 77, 101, 999];

/** What one arm produced. Survival is the observable §5 states the claim in. */
interface ArmResult {
  readonly attackersAlive: number;
  readonly defendersAlive: number;
  readonly objectivesTaken: number;
  readonly resolutionTick: number;
  /** Nodes the host learned by watching. §3's exposure. */
  readonly exposed: number;
  /** Mage raiders who did not go home — killed, or taken by the timer. */
  readonly raidersLost: number;
  readonly raidersWithdrawn: number;
}

/** How a player spends. `none` is the control arm. */
type Spend = 'none' | 'defender' | 'attacker';

/**
 * One arm of the paired experiment.
 *
 * Both arms build the *same* universe from the *same* seed and differ in exactly
 * one input: what the player did. Anything else — a different roster, a
 * different terrain — and a divergence would not be attributable.
 */
function arm(seed: number, spend: Spend): ArmResult {
  const { raid } = buildRaid({
    seed,
    withSoldiers: true,
    withLaborers: true,
    withHostUniverse: true,
    extraWardens: 2,
    // The raider carries a node the host does not, so exposure has something to
    // teach. A repertoire the defender already holds teaches nobody anything,
    // which is correct and would make this measurement read zero.
    raiderNodes: ['pt-crumble', 'im-read-the-surface'],
    hostNodes: [FIRE],
  });

  if (spend === 'defender') {
    for (const verb of [RAID_VERB.levy, RAID_VERB.levy, RAID_VERB.ward]) {
      applyDirective(raid, defenderDirective(verb));
    }
  }
  if (spend === 'attacker') applyDirective(raid, attackerDirective(RAID_VERB.conceal));

  let termination;
  for (;;) {
    // The attacker's contact-phase verb, issued whenever it would do something.
    // Mending is the shape of a Vampire Survivors decision: cheap, repeated, and
    // the stock it comes out of is visibly draining.
    if (spend === 'attacker' && currentPhase(raid) === ENGAGEMENT_PHASE.contact) {
      applyDirective(raid, attackerDirective(RAID_VERB.mend));
    }
    termination = stepEngagement(raid);
    if (termination !== undefined) break;
  }
  const outcome = resolveRaid(raid, termination.reason);
  const alive = livingCombatants(raid);

  return {
    attackersAlive: alive.filter((brief) => brief.side === RAID_SIDE.attacker).length,
    defendersAlive: alive.filter((brief) => brief.side === RAID_SIDE.defender).length,
    objectivesTaken: outcome.objectives.filter((objective) => objective.status !== 0).length,
    resolutionTick: outcome.resolutionTick,
    exposed: outcome.exposures.length,
    raidersLost: outcome.raidersFielded - outcome.raidersWithdrawn,
    raidersWithdrawn: outcome.raidersWithdrawn,
  };
}

function totals(spend: Spend): {
  attackers: number;
  defenders: number;
  taken: number;
  raidersLost: number;
} {
  let attackers = 0;
  let defenders = 0;
  let taken = 0;
  let raidersLost = 0;
  for (const seed of SEEDS) {
    const result = arm(seed, spend);
    attackers += result.attackersAlive;
    defenders += result.defendersAlive;
    taken += result.objectivesTaken;
    raidersLost += result.raidersLost;
  }
  return { attackers, defenders, taken, raidersLost };
}

function seedsThatDiffer(spend: Spend): number {
  let differed = 0;
  for (const seed of SEEDS) {
    const control = arm(seed, 'none');
    const spent = arm(seed, spend);
    if (
      control.attackersAlive !== spent.attackersAlive ||
      control.defendersAlive !== spent.defendersAlive ||
      control.objectivesTaken !== spent.objectivesTaken ||
      control.resolutionTick !== spent.resolutionTick
    ) {
      differed += 1;
    }
  }
  return differed;
}

describe('§5: the muster decisions change the outcome', () => {
  it('is a paired experiment: an arm is reproducible from its seed', () => {
    // Without this, "the arms differed" and "the engine is nondeterministic" are
    // the same green run, and the whole measurement says nothing.
    for (const seed of SEEDS) {
      expect(arm(seed, 'none')).toEqual(arm(seed, 'none'));
      expect(arm(seed, 'defender')).toEqual(arm(seed, 'defender'));
    }
  });

  it('a defender who musters ends every raid differently, and better', () => {
    // Measured on this commit, 8 seeds, two levies and a ward for 11,264 favor:
    //   defenders alive at close    22 -> 53
    //   raiders lost (killed or timed out)   3 -> 8
    //   objectives taken            12 -> 11
    // 8 of 8 seeds differ. The verbs are not decoration.
    expect(seedsThatDiffer('defender')).toBe(SEEDS.length);

    const control = totals('none');
    const spent = totals('defender');
    expect(spent.defenders).toBeGreaterThan(control.defenders);
    expect(spent.taken).toBeLessThanOrEqual(control.taken);

    // **`raidersLost`, not `attackersAlive`.** Both arms leave four attackers
    // standing at close, and that number stopped being a measure of harm the
    // moment `withdraw-after-ticks` let raiders leave: a raider who went home
    // alive and a raider who was never threatened both read as "not alive on
    // the field", so `attackersAlive` now counts *how many are still walking
    // around at resolution* and is nearly a constant.
    //
    // What a defender's muster actually buys is raiders who do not get home —
    // killed outright, or still on the field when their deadline passes. That
    // is the harm the levies and the ward are for, and it is the number that
    // moves.
    expect(spent.raidersLost).toBeGreaterThan(control.raidersLost);
  });

  it('an attacker who musters and mends changes the raid on most seeds', () => {
    // Same 8 seeds, one conceal plus repeated mending until the Vis runs out —
    // 15 mends, 65,536 Vis down to 1,024:
    //   raiders alive at close     23 -> 27
    // **6 of 8 seeds differ**, against the defender's 8 of 8, and the asymmetry
    // is reported rather than smoothed over. The two seeds that do not move are
    // raids the defenders never closed with the raiders in; nothing the attacker
    // buys can change a fight that did not happen. It is also a real finding
    // about the engine — see `verbs.ts` on `mend`, and the report on
    // concealment, which the intrinsic-damage path does not consult at all.
    expect(seedsThatDiffer('attacker')).toBeGreaterThanOrEqual(6);
    expect(totals('attacker').attackers).toBeGreaterThan(totals('none').attackers);
  });

  it('drains the Vis it spends, and the stock is what stops the spending', () => {
    const { raid } = buildRaid({
      seed: 1,
      withSoldiers: true,
      withLaborers: true,
      withHostUniverse: true,
      raiderNodes: ['pt-crumble'],
      hostNodes: [FIRE],
    });
    const opening = purseOf(raid.purse, RAID_SIDE.attacker);
    let spent = 0;
    for (;;) {
      if (currentPhase(raid) === ENGAGEMENT_PHASE.contact) {
        if (applyDirective(raid, attackerDirective(RAID_VERB.mend)).applied) spent += 1;
      }
      if (stepEngagement(raid) !== undefined) break;
    }
    expect(spent).toBeGreaterThan(0);
    expect(purseOf(raid.purse, RAID_SIDE.attacker)).toBe(
      opening - spent * raid.tuning.verbMendCost,
    );
    expect(purseOf(raid.purse, RAID_SIDE.attacker)).toBeLessThan(raid.tuning.verbMendCost);
  });
});

describe('§3: exposure, and the choice it is', () => {
  it('teaches the host a node it did not have, outright, at mastery zero', () => {
    const { raid, hostWorld, hostKnowledge } = buildRaid({
      withHostUniverse: true,
      raiderNodes: ['pt-crumble'],
      hostNodes: [FIRE],
    });
    const outcome = runRaid(raid);

    expect(outcome.exposures.length).toBeGreaterThan(0);
    const exposure = outcome.exposures[0]!;
    expect(exposure.nodeId).toBe(nodeId('pt-crumble'));

    // Also in the movement list, under its own verb: nothing left the host, so
    // filing it as a theft would be a theft nobody committed.
    expect(
      outcome.knowledgeMovements.some(
        (movement) => movement.verb === 'witnessed' && movement.nodeId === exposure.nodeId,
      ),
    ).toBe(true);

    applyRaidOutcome(raid, outcome);

    const held = hostKnowledge
      .instancesHeldBy(exposure.learnedBy)
      .map((instance) => hostKnowledge.read(instance));
    const learned = held.find((view) => view.nodeId === exposure.nodeId);
    expect(learned).toBeDefined();
    // Mastery zero, where theft writes too: she saw the shape and not the
    // practice, so she cannot teach it onward without further study.
    expect(learned?.mastery).toBe(0);
    expect(componentOf(hostWorld, MAGE).has(exposure.learnedBy)).toBe(true);
  });

  it('teaches nothing the host already knew, however often it is thrown', () => {
    // The restraint the design is about: winning with spells they already have
    // costs you nothing. Both sides hold the same node here.
    const { raid } = buildRaid({
      withHostUniverse: true,
      raiderNodes: [FIRE],
      hostNodes: [FIRE],
    });
    expect(runRaid(raid).exposures).toEqual([]);
  });

  it('counts a repertoire once, not a tick', () => {
    // Deduplication is the mechanic, not an optimisation: without it exposure
    // would scale with tick count rather than with repertoire, and "winning
    // with your cheapest spells preserves your edge" would be false.
    const { raid } = buildRaid({
      withHostUniverse: true,
      raiderNodes: ['pt-crumble'],
      hostNodes: [FIRE],
    });
    const outcome = runRaid(raid);
    const witnessed = outcome.knowledgeMovements.filter(
      (movement) => movement.verb === 'witnessed',
    );
    expect(witnessed).toHaveLength(new Set(witnessed.map((m) => m.nodeId)).size);
    expect(raid.exposure.size).toBe(outcome.exposures.length);
  });
});
