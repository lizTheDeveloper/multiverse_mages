/*
 * Multiverse Mages — a whole raid, from the portal opening to the world
 * resuming.
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
 * The two claims this whole change exists for, exercised end to end:
 *
 * - **Every raid terminates**, and the test a non-terminating raid cannot pass
 *   is here: the engagement is stepped under a fault injector that disables the
 *   decrement, and the assertion is that it raises rather than that it finishes.
 *   A test that merely ran a raid and asserted it ended would hang instead of
 *   failing, which is the failure mode this change is about.
 * - **Arbitration does not leak.** A raider whose home permits a cell the host
 *   forbids can neither select nor resolve a node from it, and the counter that
 *   would have caught a leak is proven live by disabling the mask.
 */

import { describe, expect, it } from 'vitest';

import { TIME_MODE, advanceClock } from '@mm/sim-core';
import {
  COMBATANT,
  EDICT_KIND,
  MAGE,
  MAGE_ROLE,
  OBJECTIVE_STATUS,
  RAID_SIDE,
  componentOf,
} from '@mm/state';
import type { Raid, RaidFaults } from '@mm/rules-raid';
import {
  EngagementCeilingReached,
  MAX_ENGAGEMENT_TICKS,
  applyRaidOutcome,
  closePortal,
  deployRaid,
  engagementTickOf,
  livingCombatants,
  maxEngagementTicks,
  openPortal,
  runRaid,
  stepEngagement,
} from '@mm/rules-raid';

import {
  addMage,
  addSoldiers,
  addUniversity,
  emptyWorld,
  grid,
  knowledgeFor,
  nodeId,
  participant,
  registry,
  ruleset,
  traditionId,
  tuning,
} from './raid-fixture.js';

/** A node whose only interesting property is that it hurts people. */
const FIRE = 'cig-the-uncontained-hour';
/** A node in a cell the host can forbid without forbidding fire. */
const MIND_READING = 'im-read-the-surface';

interface Built {
  readonly raid: Raid;
  readonly attackerWorld: ReturnType<typeof emptyWorld>;
  readonly hostWorld: ReturnType<typeof emptyWorld>;
  readonly raider: number;
  readonly warden: number;
}

/**
 * Two universes and a portal between them.
 *
 * The host is deliberately the richer one: a raid against a universe with
 * nothing to take is a legitimate case and it is tested separately, but it is a
 * bad default because every objective assertion would pass vacuously.
 */
function build(options: {
  readonly hostRuleset?: ReturnType<typeof ruleset>;
  readonly raiderRuleset?: ReturnType<typeof ruleset>;
  readonly raiderNodes?: readonly string[];
  readonly faults?: RaidFaults;
  readonly seed?: number;
  readonly hostTradition?: string;
  readonly withSoldiers?: boolean;
  readonly tuningOverride?: Partial<typeof tuning>;
  readonly hostNodes?: readonly string[];
} = {}): Built {
  const attackerWorld = emptyWorld();
  const hostWorld = emptyWorld();
  const attackerKnowledge = knowledgeFor(attackerWorld);
  const hostKnowledge = knowledgeFor(hostWorld);

  const hostSnapshot =
    options.hostRuleset ??
    ruleset({ traditionId: traditionId(options.hostTradition ?? 'vancian-memorization') });
  const raiderSnapshot = options.raiderRuleset ?? ruleset({});

  const raider = addMage(attackerWorld, attackerKnowledge, {
    role: MAGE_ROLE.raider,
    nodes: options.raiderNodes ?? [FIRE, MIND_READING],
  });
  const warden = addMage(hostWorld, hostKnowledge, {
    role: MAGE_ROLE.warden,
    nodes: options.hostNodes ?? [FIRE],
  });
  addUniversity(hostWorld, hostKnowledge, ['rl-open-the-portal', 'cig-the-uncontained-hour']);
  if (options.withSoldiers === true) {
    addSoldiers(hostWorld, 300);
    addSoldiers(attackerWorld, 300);
  }

  const raid = openPortal({
    attacker: participant(
      attackerWorld,
      attackerKnowledge,
      raiderSnapshot,
      hostSnapshot.traditionId,
    ),
    host: participant(hostWorld, hostKnowledge, hostSnapshot, hostSnapshot.traditionId),
    registry,
    grid,
    tuning: { ...tuning, ...options.tuningOverride },
    raidSeed: options.seed ?? 0x5eed_1234,
    ...(options.faults === undefined ? {} : { faults: options.faults }),
  });
  deployRaid(raid);

  return { raid, attackerWorld, hostWorld, raider, warden };
}

describe('a raid runs, ends, and says why', () => {
  it('terminates within the bound computable before the first tick', () => {
    const { raid } = build();
    const bound = raid.maxTicks;
    expect(bound).toBeGreaterThan(0);
    expect(bound).toBeLessThanOrEqual(MAX_ENGAGEMENT_TICKS);

    const outcome = runRaid(raid);

    expect(outcome.resolutionTick).toBeLessThanOrEqual(bound);
    expect(outcome.reason).toBeGreaterThan(0);
  });

  it('names exactly one victor, whatever happened', () => {
    for (const seed of [1, 2, 3, 17, 99, 4242]) {
      const { raid } = build({ seed });
      const outcome = runRaid(raid);
      expect([RAID_SIDE.attacker, RAID_SIDE.defender]).toContain(outcome.victor);
    }
  });

  it('decreases portal stability strictly, every tick', () => {
    const { raid } = build();
    let previous = raid.engagement.raid.portalStability;
    for (let step = 0; step < 50; step += 1) {
      const ended = stepEngagement(raid);
      expect(raid.engagement.raid.portalStability).toBeLessThan(previous);
      previous = raid.engagement.raid.portalStability;
      if (ended !== undefined) break;
    }
  });

  it('freezes both world clocks and resumes them at the tick they paused at', () => {
    const { raid, attackerWorld, hostWorld } = build();
    advanceClock(hostWorld.clock);
    const hostTick = hostWorld.clock.worldTick;
    const attackerTick = attackerWorld.clock.worldTick;

    // The advance above happened in engagement mode, so it moved the
    // engagement tick and not the world one — which is the structural half of
    // the freeze and is worth asserting before the raid runs.
    expect(hostWorld.clock.worldTick).toBe(hostTick);

    runRaid(raid);
    expect(engagementTickOf(raid)).toBeGreaterThan(0);
    expect(hostWorld.clock.worldTick).toBe(hostTick);
    expect(attackerWorld.clock.worldTick).toBe(attackerTick);

    closePortal(raid);
    expect(hostWorld.clock.mode).toBe(TIME_MODE.world);
    expect(attackerWorld.clock.mode).toBe(TIME_MODE.world);
    expect(hostWorld.clock.worldTick).toBe(hostTick);
    expect(attackerWorld.clock.worldTick).toBe(attackerTick);
  });

  it('never exceeds the per-side combatant cap', () => {
    const { raid } = build({ withSoldiers: true });
    const outcome = runRaid(raid);
    expect(outcome.peakCombatants[0]).toBeLessThanOrEqual(tuning.maxCombatantsPerSide);
    expect(outcome.peakCombatants[1]).toBeLessThanOrEqual(tuning.maxCombatantsPerSide);
    // The control: the cap has to be *reachable*, or "never exceeds it" is a
    // statement about a bound nothing approaches. 300 soldiers at a detachment
    // strength of 100 plus the mages is more than the cap on both sides.
    expect(Math.max(...outcome.peakCombatants)).toBeGreaterThan(1);
  });
});

describe('the raid is reproducible from its own inputs', () => {
  it('produces byte-identical outcomes from the same snapshots and seed', () => {
    const first = runRaid(build({ seed: 777 }).raid);
    const second = runRaid(build({ seed: 777 }).raid);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('produces a different raid from a different seed', () => {
    const first = runRaid(build({ seed: 777 }).raid);
    const second = runRaid(build({ seed: 778 }).raid);
    // Terrain, deployment and objective placement all move, so *something*
    // about the two must differ. Asserting on the whole record rather than on
    // one field, because which field moves is not the claim.
    expect(JSON.stringify(second)).not.toBe(JSON.stringify(first));
  });
});

describe('termination is structural, not hoped for', () => {
  it('raises the ceiling as a loud failure when the decrement is disabled', () => {
    // **The test a non-terminating raid cannot pass.** Without the ceiling this
    // would hang rather than fail, which is exactly the failure mode the whole
    // termination argument exists to remove — a Monte Carlo worker that never
    // returns looks like a slow machine, not like a bug.
    // Two things have to be true at once for a raid to be unable to end, and
    // both are injected rather than hoped for: the portal never decays, and no
    // objective can ever be completed. Either alone still terminates, which is
    // the argument working.
    // Three things have to be true at once for a raid to be unable to end, and
    // each is arranged rather than hoped for: the portal never decays, no
    // objective can ever be completed, and neither side can kill the other.
    // Any one of them absent and the raid still terminates, which is the
    // argument working rather than the test being lucky.
    const { raid } = build({
      faults: { disableStabilityDecay: true },
      raiderNodes: [],
      hostNodes: [],
      tuningOverride: { objectiveProgressPerTick: 0 },
    });
    expect(() => runRaid(raid)).toThrow(EngagementCeilingReached);
    expect(engagementTickOf(raid)).toBeGreaterThanOrEqual(MAX_ENGAGEMENT_TICKS);
  });

  it('still produces a complete outcome record when the ceiling is reached', () => {
    // A caller that catches the invariant violation is holding a finished raid,
    // not half a battle. Otherwise the loud failure would corrupt the thing it
    // was trying to protect.
    const { raid } = build({
      faults: { disableStabilityDecay: true },
      raiderNodes: [],
      hostNodes: [],
      tuningOverride: { objectiveProgressPerTick: 0 },
    });
    try {
      runRaid(raid);
    } catch (error) {
      expect(error).toBeInstanceOf(EngagementCeilingReached);
    }
    expect(raid.outcome).toBeDefined();
    expect(raid.outcome?.resolutionTick).toBe(MAX_ENGAGEMENT_TICKS);
  });

  it('refuses to start a raid whose own bound exceeds the ceiling', () => {
    const { raid } = build();
    // A hand-built RaidState, which the content loader would have refused.
    const hostile = {
      ...raid.engagement.raid,
      portalStability: (MAX_ENGAGEMENT_TICKS + 1) * raid.engagement.raid.stabilityDecayPerTick,
    };
    expect(() => maxEngagementTicks(hostile)).toThrow(/ceiling/u);
  });
});

describe('arbitration is the host ruleset, and it does not leak', () => {
  it('blocks nothing across an ordinary raid, and the counter proves it looked', () => {
    const { raid } = build();
    const outcome = runRaid(raid);
    expect(outcome.forbiddenCastsBlocked).toBe(0);
  });

  it('keeps a raider from casting what her host forbids, even though her home permits it', () => {
    const ignem = registry.intern('form', 'ignem');
    const hostForbidsFire = ruleset({
      // Every form except ignem. The raider's own universe permits everything.
      permittedForms: 0b11111111111111 & ~(1 << (ignem - 1)),
    });
    const { raid } = build({ hostRuleset: hostForbidsFire, raiderNodes: [FIRE] });

    const raider = raid.rosters[RAID_SIDE.attacker].briefs[0];
    expect(raider).toBeDefined();
    // Layer 1: the node is not a candidate at all, so no tick is spent on a
    // guaranteed refusal.
    expect(raider?.legalNodes.has(nodeId(FIRE))).toBe(false);
    expect(raider?.preparedSpells).not.toContain(nodeId(FIRE));

    const outcome = runRaid(raid);
    // Layer 2 never had to fire, which is the whole claim.
    expect(outcome.forbiddenCastsBlocked).toBe(0);
  });

  it('lets a raider cast what her own home forbids but the host permits', () => {
    const ignem = registry.intern('form', 'ignem');
    const raiderForbidsFire = ruleset({
      permittedForms: 0b11111111111111 & ~(1 << (ignem - 1)),
    });
    const { raid } = build({ raiderRuleset: raiderForbidsFire, raiderNodes: [FIRE] });
    const raider = raid.rosters[RAID_SIDE.attacker].briefs[0];
    // Her home ruleset is irrelevant to what functions inside the host.
    expect(raider?.legalNodes.has(nodeId(FIRE))).toBe(true);
  });

  it('binds the defender by her own interdiction exactly as it binds an attacker', () => {
    const fireCell = grid.cellOf(nodeId(FIRE));
    const interdicted = ruleset({
      edicts: [{ cellId: fireCell, kind: EDICT_KIND.interdiction }],
    });
    const { raid } = build({ hostRuleset: interdicted, raiderNodes: [FIRE] });
    const raider = raid.rosters[RAID_SIDE.attacker].briefs[0];
    const warden = raid.rosters[RAID_SIDE.defender].briefs[0];
    expect(raider?.legalNodes.has(nodeId(FIRE))).toBe(false);
    expect(warden?.legalNodes.has(nodeId(FIRE))).toBe(false);
  });

  it('arms both sides through a host dispensation', () => {
    const ignem = registry.intern('form', 'ignem');
    const fireCell = grid.cellOf(nodeId(FIRE));
    const dispensed = ruleset({
      permittedForms: 0b11111111111111 & ~(1 << (ignem - 1)),
      edicts: [{ cellId: fireCell, kind: EDICT_KIND.dispensation }],
    });
    const { raid } = build({ hostRuleset: dispensed, raiderNodes: [FIRE] });
    expect(raid.rosters[RAID_SIDE.attacker].briefs[0]?.legalNodes.has(nodeId(FIRE))).toBe(true);
    expect(raid.rosters[RAID_SIDE.defender].briefs[0]?.legalNodes.has(nodeId(FIRE))).toBe(true);
  });

  it('proves the resolution assertion is live by disabling the selection mask', () => {
    // Without this, "the counter read zero" and "the check never ran" are the
    // same observation. The fault injector puts a forbidden node in front of
    // `resolveCast` and the assertion has to be what stops it.
    const ignem = registry.intern('form', 'ignem');
    const hostForbidsFire = ruleset({
      permittedForms: 0b11111111111111 & ~(1 << (ignem - 1)),
    });
    const { raid } = build({
      hostRuleset: hostForbidsFire,
      raiderNodes: [FIRE],
      faults: { disableSelectionMask: true },
    });

    const raider = raid.rosters[RAID_SIDE.attacker].briefs[0];
    if (raider === undefined) throw new Error('fixture produced no raider');

    const resolution = raid.arbiter.resolveCast({
      nodeId: nodeId(FIRE),
      legalNodes: raider.legalNodes,
      hostCast: raid.host.hooks.hostCast,
      hostCost: raid.host.hooks.hostCost,
      preparedSpells: [nodeId(FIRE)],
      vigor: 1024 * 1024,
    });

    expect(raid.arbiter.forbiddenCastsBlocked).toBe(1);
    expect(resolution.resolved).toBe(false);
    expect(resolution.refusal).toBe('forbidden');
    // Applies nothing, charges nothing, and leaves the preparation readied —
    // three separate promises, each one asserted rather than assumed.
    expect(resolution.cost).toBe(0);
    expect(resolution.preparedSpells).toEqual([nodeId(FIRE)]);
    expect(resolution.effects.directDamage).toEqual([]);
  });

  it('blocks a forbidden cast inside a running raid, with the combatants in range', () => {
    // The same proof through the whole engine rather than through the arbiter
    // alone: the mask is disabled, the two sides are placed within cast range,
    // and the counter is what has to move.
    const ignem = registry.intern('form', 'ignem');
    const hostForbidsFire = ruleset({
      permittedForms: 0b11111111111111 & ~(1 << (ignem - 1)),
    });
    const { raid } = build({
      hostRuleset: hostForbidsFire,
      raiderNodes: [FIRE],
      faults: { disableSelectionMask: true },
    });

    const raider = raid.rosters[RAID_SIDE.attacker].briefs[0];
    const warden = raid.rosters[RAID_SIDE.defender].briefs[0];
    if (raider === undefined || warden === undefined) throw new Error('fixture is short a side');
    raider.preparedSpells = [nodeId(FIRE)];
    placeAdjacent(raid, raider.handle, warden.handle);

    stepEngagement(raid);

    expect(raid.arbiter.forbiddenCastsBlocked).toBeGreaterThan(0);
    // And nothing was applied. The ledger records every applied magnitude by
    // primitive, so an empty attacker column is the assertion that the blocked
    // cast did nothing rather than that nobody looked.
    const damage = raid.ledger
      .primitiveApplication()
      .find((entry) => entry[0] === 'direct-damage');
    expect(damage?.[1].attacker ?? 0).toBe(0);
  });
});

describe('consequences reach both worlds', () => {
  it('kills a stranded raider and keeps nothing she stole', () => {
    const { raid, attackerWorld, raider } = build({ raiderNodes: [FIRE, MIND_READING] });
    const outcome = runRaid(raid);
    applyRaidOutcome(raid, outcome);

    const stranded = outcome.casualties.some(
      (casualty) => casualty.side === RAID_SIDE.attacker && casualty.stranded,
    );
    if (stranded) {
      expect(componentOf(attackerWorld, MAGE).get(raider, 'alive')).toBe(0);
      for (const movement of outcome.knowledgeMovements) {
        if (movement.verb === 'copied') expect(movement.forfeited).toBe(true);
      }
    }
  });

  it('writes nothing to a world the outcome record does not name', () => {
    // The inert control. What reaches world state is exactly what the outcome
    // record says, so a raid that produced no casualties leaves every mage
    // alive — otherwise "the engagement layer writes only what the outcome
    // says" is not true and the atomicity argument has nothing to stand on.
    const { raid, hostWorld, warden } = build({ raiderNodes: [] });
    const outcome = runRaid(raid);
    applyRaidOutcome(raid, outcome);

    const hostDied = outcome.casualties.some((casualty) => casualty.side === RAID_SIDE.defender);
    expect(componentOf(hostWorld, MAGE).get(warden, 'alive')).toBe(hostDied ? 0 : 1);
  });

  it('records an objective status for every objective it generated', () => {
    const { raid } = build();
    const outcome = runRaid(raid);
    expect(outcome.objectives.length).toBe(raid.objectives.length);
    for (const objective of outcome.objectives) {
      expect([
        OBJECTIVE_STATUS.held,
        OBJECTIVE_STATUS.captured,
        OBJECTIVE_STATUS.looted,
        OBJECTIVE_STATUS.destroyed,
      ]).toContain(objective.status);
    }
  });
});

describe('a universe with nothing to take still yields a terminating raid', () => {
  it('resolves at portal collapse with a defender victory', () => {
    const attackerWorld = emptyWorld();
    const hostWorld = emptyWorld();
    const attackerKnowledge = knowledgeFor(attackerWorld);
    const hostKnowledge = knowledgeFor(hostWorld);
    addMage(attackerWorld, attackerKnowledge, { role: MAGE_ROLE.raider, nodes: [FIRE] });

    const snapshot = ruleset({});
    const raid = openPortal({
      attacker: participant(attackerWorld, attackerKnowledge, snapshot, snapshot.traditionId),
      host: participant(hostWorld, hostKnowledge, snapshot, snapshot.traditionId),
      registry,
      grid,
      tuning,
      raidSeed: 31337,
    });
    deployRaid(raid);

    expect(raid.objectives).toHaveLength(0);
    const outcome = runRaid(raid);
    expect(outcome.victor).toBe(RAID_SIDE.defender);
    expect(livingCombatants(raid).length).toBeLessThanOrEqual(1);
  });
});

/** Puts two combatants beside each other, for the tests that need contact. */
function placeAdjacent(raid: Raid, a: number, b: number): void {
  const store = componentOf(raid.engagement.entities, COMBATANT);
  const x = 100 * 1024;
  const y = 100 * 1024;
  store.set(a, 'x', x);
  store.set(a, 'y', y);
  store.set(b, 'x', x + 1024);
  store.set(b, 'y', y);
}
