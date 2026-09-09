/*
 * Multiverse Mages — who may open a portal, and who may not refuse one.
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
 * Tasks 2.2, 2.8 and 3.8.
 *
 * The scenario worth the most here is the *negative* one: **forbidding
 * `rego-limen` denies you the ability to raid, never the ability to be
 * raided.** That is a design decision with a consequence a player will feel, and
 * it is easy to implement the other way by accident — checking both rulesets
 * reads like symmetry and is a strictly dominant defensive play the moment
 * anybody finds it.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import { EDICT_KIND, MAGE_ROLE, RAID_SIDE } from '@mm/state';
import {
  CastArbiter,
  DEFENDING_ROLES,
  RAIDING_ROLES,
  deployRaid,
  openPortal,
  portalGate,
  runRaid,
} from '@mm/rules-raid';

import {
  ALL_FORMS,
  addMage,
  combat,
  emptyWorld,
  grid,
  knowledgeFor,
  nodeId,
  participant,
  registry,
  ruleset,
  tuning,
} from './raid-fixture.js';

/** The two shipped nodes that carry the `portal` primitive. */
const PORTAL_NODE = 'rl-open-the-portal';
const FIRE = 'cig-the-uncontained-hour';

function attacker(options: { readonly nodes?: readonly string[]; readonly mastery?: number } = {}) {
  const world = emptyWorld();
  const knowledge = knowledgeFor(world);
  addMage(world, knowledge, {
    role: MAGE_ROLE.raider,
    nodes: options.nodes ?? [PORTAL_NODE],
    ...(options.mastery === undefined ? {} : { mastery: options.mastery }),
  });
  return { world, knowledge };
}

function gate(options: {
  readonly attackerRuleset?: ReturnType<typeof ruleset>;
  readonly nodes?: readonly string[];
  readonly mastery?: number;
  readonly favor?: number;
  readonly favorCost?: number;
  readonly alreadyEngaged?: boolean;
} = {}) {
  const { world, knowledge } = attacker({
    ...(options.nodes === undefined ? {} : { nodes: options.nodes }),
    ...(options.mastery === undefined ? {} : { mastery: options.mastery }),
  });
  return portalGate({
    attackerWorld: world,
    attackerRuleset: options.attackerRuleset ?? ruleset({}),
    registry,
    grid,
    favor: options.favor ?? 100 * FP_ONE,
    favorCost: options.favorCost ?? 8 * FP_ONE,
    alreadyEngaged: options.alreadyEngaged ?? false,
    heldOf: (mage) =>
      knowledge.instancesHeldBy(mage).map((instance) => {
        const view = knowledge.read(instance);
        return { nodeId: view.nodeId, locationKind: view.locationKind, mastery: view.mastery };
      }),
  });
}

describe("the gate is the attacker's own ruleset and knowledge", () => {
  it('opens when every gate is satisfied', () => {
    expect(gate()).toEqual({ open: true, refusal: '' });
  });

  it('refuses when the attacker forbids the portal cell by axis', () => {
    const limen = registry.intern('form', 'limen');
    expect(
      gate({ attackerRuleset: ruleset({ permittedForms: ALL_FORMS & ~(1 << (limen - 1)) }) }),
    ).toEqual({ open: false, refusal: 'cell-forbidden' });
  });

  it('refuses when the attacker interdicts the portal cell', () => {
    const cell = grid.cellByName('rego-limen').cellId;
    expect(
      gate({ attackerRuleset: ruleset({ edicts: [{ cellId: cell, kind: EDICT_KIND.interdiction }] }) }),
    ).toEqual({ open: false, refusal: 'cell-forbidden' });
  });

  it('refuses when no living mage holds a node carrying the portal primitive', () => {
    expect(gate({ nodes: [FIRE] })).toEqual({ open: false, refusal: 'knowledge-lost' });
  });

  it('refuses when the portal node is held below the activation threshold', () => {
    // Knowledge that does not do anything yet is not a spell anybody can cast,
    // and `rules-magic` owns that threshold rather than this package.
    expect(gate({ mastery: 1 })).toEqual({ open: false, refusal: 'knowledge-lost' });
  });

  it('refuses when the favor will not cover the action', () => {
    expect(gate({ favor: FP_ONE, favorCost: 8 * FP_ONE })).toEqual({
      open: false,
      refusal: 'unaffordable',
    });
  });

  it('refuses a nested raid', () => {
    expect(gate({ alreadyEngaged: true })).toEqual({ open: false, refusal: 'already-engaged' });
  });

  it('never throws, whatever is wrong', () => {
    // `contracts.md` §4.2: an illegal action is a no-op and a counter
    // increment, never an exception. An RL agent will submit this constantly.
    for (const options of [
      { favor: 0 },
      { nodes: [] as string[] },
      { alreadyEngaged: true },
    ]) {
      expect(() => gate(options)).not.toThrow();
    }
  });
});

describe('a host cannot make itself unraidable (task 2.8)', () => {
  it('is raided normally even while forbidding rego-limen outright', () => {
    // The whole point. Forbidding one form would otherwise grant total raid
    // immunity — a strictly dominant play, and the collapse of the engagement
    // layer for that matchup.
    const limen = registry.intern('form', 'limen');
    const hostForbidsPortals = ruleset({ permittedForms: ALL_FORMS & ~(1 << (limen - 1)) });

    const attackerWorld = emptyWorld();
    const attackerKnowledge = knowledgeFor(attackerWorld);
    addMage(attackerWorld, attackerKnowledge, {
      role: MAGE_ROLE.raider,
      nodes: [PORTAL_NODE, FIRE],
    });
    const hostWorld = emptyWorld();
    const hostKnowledge = knowledgeFor(hostWorld);
    addMage(hostWorld, hostKnowledge, { role: MAGE_ROLE.warden, nodes: [FIRE] });

    const attackerSnapshot = ruleset({});
    // The attacker's own gate is satisfied, and the host's ruleset is not a
    // parameter of it — the signature could not consult the host if it wanted to.
    expect(gate({ attackerRuleset: attackerSnapshot }).open).toBe(true);

    const raid = openPortal({
      attacker: participant(
        attackerWorld,
        attackerKnowledge,
        attackerSnapshot,
        hostForbidsPortals.traditionId,
      ),
      host: participant(
        hostWorld,
        hostKnowledge,
        hostForbidsPortals,
        hostForbidsPortals.traditionId,
      ),
      registry,
      grid,
      combat,
      tuning,
      raidSeed: 0xbeef,
    });
    deployRaid(raid);
    const outcome = runRaid(raid);

    expect(outcome.resolutionTick).toBeGreaterThan(0);
    expect(outcome.forbiddenCastsBlocked).toBe(0);
  });
});

describe('the populace mage defends (W197)', () => {
  it('is deployed with the wardens, and never with the attackers', () => {
    // **The side effect this test exists to forbid.** W197 sorts roughly half of
    // every graduating class into `populace` where it would previously have been
    // `researcher` — and `researcher` is a defending role. Leaving the new role
    // out of `DEFENDING_ROLES` would have cut a universe's defender pool by
    // about half as a *by-product* of a change about careers, which is exactly
    // the shape of regression that gets found months later and attributed to
    // something else.
    //
    // It is also the reading `magical-prevalence.md` gives: *"people who are
    // able to defend at any given random time"* is one of its named end states,
    // and a populace mage is a graduate with a job rather than a child.
    expect(DEFENDING_ROLES.has(MAGE_ROLE.populace)).toBe(true);
    expect(RAIDING_ROLES.has(MAGE_ROLE.populace)).toBe(false);
    // `student` stays out, per W193's recorded choice. The two appended roles
    // are deliberately on opposite sides of this line.
    expect(DEFENDING_ROLES.has(MAGE_ROLE.student)).toBe(false);

    // And the set is not merely a list: a defence made only of populace mages
    // fields somebody.
    const attackerWorld = emptyWorld();
    const attackerKnowledge = knowledgeFor(attackerWorld);
    addMage(attackerWorld, attackerKnowledge, {
      role: MAGE_ROLE.raider,
      nodes: [PORTAL_NODE, FIRE],
    });
    const hostWorld = emptyWorld();
    const hostKnowledge = knowledgeFor(hostWorld);
    addMage(hostWorld, hostKnowledge, { role: MAGE_ROLE.populace, nodes: [FIRE] });

    const snapshot = ruleset({});
    const raid = openPortal({
      attacker: participant(attackerWorld, attackerKnowledge, snapshot, snapshot.traditionId),
      host: participant(hostWorld, hostKnowledge, snapshot, snapshot.traditionId),
      registry,
      grid,
      combat,
      tuning,
      raidSeed: 0x9701,
    });
    deployRaid(raid);
    expect(raid.rosters[RAID_SIDE.defender]?.briefs.length).toBeGreaterThan(0);
  });
});

describe('legality gates casting, never possession (task 3.8)', () => {
  it('leaves a forbidden node held, and castable again once permitted', () => {
    // `contracts.md` §1.1 is explicit: a mage may hold knowledge her universe
    // has since forbidden, and it lies dormant rather than being erased. So the
    // mask is a *view* over what she holds, recomputed from a different ruleset
    // without touching a single instance.
    const world = emptyWorld();
    const knowledge = knowledgeFor(world);
    const mage = addMage(world, knowledge, { role: MAGE_ROLE.raider, nodes: [FIRE] });
    const held = knowledge.instancesHeldBy(mage).map((instance) => {
      const view = knowledge.read(instance);
      return { nodeId: view.nodeId, locationKind: view.locationKind, mastery: view.mastery };
    });

    const ignem = registry.intern('form', 'ignem');
    const forbidding = new CastArbiter({
      hostRuleset: ruleset({ permittedForms: ALL_FORMS & ~(1 << (ignem - 1)) }),
      grid,
      registry,
      combat,
      tuning,
    });
    const permitting = new CastArbiter({
      hostRuleset: ruleset({}),
      grid,
      registry,
      combat,
      tuning,
    });

    expect(forbidding.legalNodeMask(held, 512).has(nodeId(FIRE))).toBe(false);
    // The instance is untouched: no destruction, no loss, no relearning.
    expect(knowledge.instancesHeldBy(mage)).toHaveLength(1);
    expect(permitting.legalNodeMask(held, 512).has(nodeId(FIRE))).toBe(true);
  });
});
