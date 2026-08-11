/*
 * Multiverse Mages — a memory palace dies with the mage who built it.
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
 * `magic-traditions`, the Art of Memory:
 *
 * > **WHEN** the holder of a palace instance dies and that instance was the
 * > node's last **THEN** the instance is destroyed, the node ceases to exist,
 * > and a loss event is emitted naming the palace location kind.
 *
 * ## Why this file exists, given that both halves were already tested
 *
 * `traditions/store.ts` knew which location kinds perish with their holder, and
 * `instances/subsystem.ts` knew how to destroy an instance and emit a loss
 * event. Nothing joined them. The nearest assertion anywhere was
 * `perishesWithHolder(policy, LOCATION_KIND.palace) === true` — a policy-flag
 * lookup, which is the tradition's *declaration*, not its consequence — and no
 * test in the repository asserted a loss event carrying
 * `location: LOCATION_KIND.palace` at all.
 *
 * That seam is exactly where the Art of Memory's bargain lives. Unburnable and
 * unlootable in exchange for utterly mortal: if the second half quietly stopped
 * happening, every assertion about the first half would stay green, the
 * tradition would become strictly the best of the three, and the first evidence
 * would be an unexplained divergence in a Monte Carlo sweep at 0.5.0.
 *
 * ## The policy chooses what dies; the test does not
 *
 * Every case below selects the doomed instances through
 * {@link perishesWithHolder} against the resolved `store` hook, rather than by
 * naming `palace` in the test. A test that hand-picked the palace instance
 * would still pass if the policy stopped nominating it — which is the failure
 * this file is here to catch.
 */

import { describe, expect, it } from 'vitest';

import type { Handle, LocationKindValue } from '@mm/state';
import { LOCATION_KIND } from '@mm/state';

import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import type { StorePolicy } from '../../src/traditions/index.js';
import { perishesWithHolder, storePolicy } from '../../src/traditions/index.js';

import { CHILD_NODE, ROOT_NODE, TEST_NODE_COUNT, testWorld } from '../support/scenario.js';
import { ART_OF_MEMORY, VANCIAN, ownHook } from './tradition-fixtures.js';

/** Opaque mage handles. `rules-magic` never resolves them into mage records. */
const SCHOLAR = 41;
const COLLEAGUE = 42;

/** The university whose shelves outlive a standard-tradition author. */
const LIBRARY = 900;

function subsystem(): KnowledgeSubsystem {
  return new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
}

function storeOf(tradition: number): StorePolicy {
  return storePolicy(ownHook('store', tradition));
}

/**
 * The mortality path, driven by the tradition rather than by the test.
 *
 * This is the shape `mages-and-species` will call when a mage dies: ask the
 * resolved `store` hook which of the dead mage's instances it does not survive,
 * and destroy exactly those.
 */
function holderDies(
  knowledge: KnowledgeSubsystem,
  policy: StorePolicy,
  holder: Handle,
  worldTick: number,
) {
  const doomed = knowledge
    .instancesHeldBy(holder)
    .filter((instance) =>
      perishesWithHolder(policy, knowledge.read(instance).locationKind as LocationKindValue),
    );
  return { doomed, lost: knowledge.destroyAll(doomed, worldTick) };
}

describe('a palace dies with its holder', () => {
  it('destroys the instance, empties the node, and names the palace in the loss event', () => {
    const policy = storeOf(ART_OF_MEMORY);
    const knowledge = subsystem();
    const instance = knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: policy.personalLocationKind,
      locationId: SCHOLAR,
      acquiredTick: 3,
      mastery: 512,
    });

    // The premise: the Art of Memory puts a newly acquired instance in a
    // palace. Asserted rather than assumed, so this case cannot pass by
    // silently testing a mind instance.
    expect(policy.personalLocationKind).toBe(LOCATION_KIND.palace);
    expect(knowledge.exists(ROOT_NODE)).toBe(true);

    const { doomed, lost } = holderDies(knowledge, policy, SCHOLAR, 77);

    // All three conjuncts of the THEN, in the order the scenario writes them.
    expect(doomed).toEqual([instance]);
    expect(knowledge.isInstance(instance)).toBe(false);
    expect(knowledge.exists(ROOT_NODE)).toBe(false);
    expect(lost).toEqual([
      { nodeId: ROOT_NODE, worldTick: 77, location: LOCATION_KIND.palace },
    ]);
  });

  it('leaves the node rediscoverable at rediscovery cost, not forgotten outright', () => {
    // The other half of `contracts.md` §1.5: current existence goes, ever-known
    // stays. A palace death that also erased the ever-known record would make
    // re-deriving the node ordinary research, which is the 3× claim quietly
    // switching itself off for one of the three v1 traditions.
    const policy = storeOf(ART_OF_MEMORY);
    const knowledge = subsystem();
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: policy.personalLocationKind,
      locationId: SCHOLAR,
      acquiredTick: 3,
      mastery: 512,
    });

    holderDies(knowledge, policy, SCHOLAR, 77);

    expect(knowledge.exists(ROOT_NODE)).toBe(false);
    expect(knowledge.wasEverKnown(ROOT_NODE)).toBe(true);
  });

  it('emits nothing while a colleague still holds the node in her own palace', () => {
    // "and that instance was the node's last" is a condition, not decoration.
    // A loss event per destroyed instance would drown the signal
    // `knowledgeHalfLife` reads.
    const policy = storeOf(ART_OF_MEMORY);
    const knowledge = subsystem();
    for (const holder of [SCHOLAR, COLLEAGUE]) {
      knowledge.createInstance({
        nodeId: ROOT_NODE,
        locationKind: policy.personalLocationKind,
        locationId: holder,
        acquiredTick: 3,
        mastery: 512,
      });
    }

    const { lost } = holderDies(knowledge, policy, SCHOLAR, 77);

    expect(lost).toEqual([]);
    expect(knowledge.exists(ROOT_NODE)).toBe(true);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(1);
  });

  it('takes every node the dead mage held alone, and reports each one', () => {
    const policy = storeOf(ART_OF_MEMORY);
    const knowledge = subsystem();
    for (const nodeId of [ROOT_NODE, CHILD_NODE]) {
      knowledge.createInstance({
        nodeId,
        locationKind: policy.personalLocationKind,
        locationId: SCHOLAR,
        acquiredTick: 3,
        mastery: 512,
      });
    }
    knowledge.createInstance({
      nodeId: CHILD_NODE,
      locationKind: policy.personalLocationKind,
      locationId: COLLEAGUE,
      acquiredTick: 3,
      mastery: 512,
    });

    const { lost } = holderDies(knowledge, policy, SCHOLAR, 80);

    expect(lost).toEqual([
      { nodeId: ROOT_NODE, worldTick: 80, location: LOCATION_KIND.palace },
    ]);
    expect(knowledge.exists(CHILD_NODE)).toBe(true);
  });

  it('agrees with the subsystem’s own mortality path', () => {
    // `destroyInstancesHeldBy` is the shortcut a caller reaches for, and under
    // the Art of Memory it must produce the same result as consulting the
    // policy — mind and palace are both held locations and both perish. If the
    // two ever disagreed, whichever one `mages-and-species` happened to call
    // would decide the tradition's balance.
    const policy = storeOf(ART_OF_MEMORY);
    const viaPolicy = subsystem();
    const viaSubsystem = subsystem();
    for (const knowledge of [viaPolicy, viaSubsystem]) {
      knowledge.createInstance({
        nodeId: ROOT_NODE,
        locationKind: policy.personalLocationKind,
        locationId: SCHOLAR,
        acquiredTick: 3,
        mastery: 512,
      });
    }

    expect(holderDies(viaPolicy, policy, SCHOLAR, 77).lost).toEqual(
      viaSubsystem.destroyInstancesHeldBy(SCHOLAR, 77),
    );
    expect(viaSubsystem.exists(ROOT_NODE)).toBe(false);
  });
});

describe('the bargain is a bargain: a shelf outlives its author, a palace does not', () => {
  it('leaves a standard tradition’s library copy standing when the author dies', () => {
    // The contrast that makes the palace rule mean something. Under `standard`
    // the same death destroys the mind instance and stops there, because a
    // written copy is an object in a building and the building did not die.
    const policy = storeOf(VANCIAN);
    const knowledge = subsystem();
    const grimoire = knowledge.state.entities.create();
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: policy.personalLocationKind,
      locationId: SCHOLAR,
      acquiredTick: 3,
      mastery: 512,
    });
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.library,
      locationId: LIBRARY,
      acquiredTick: 3,
      mastery: 0,
      grimoire,
    });

    const { lost } = holderDies(knowledge, policy, SCHOLAR, 77);

    expect(policy.personalLocationKind).toBe(LOCATION_KIND.mind);
    expect(lost).toEqual([]);
    expect(knowledge.exists(ROOT_NODE)).toBe(true);
    expect(knowledge.instancesAt(LOCATION_KIND.library, LIBRARY)).toHaveLength(1);
  });

  it('has no shelf to fall back on under the Art of Memory', () => {
    // Why the palace death is total rather than merely unlucky: the tradition
    // cannot write, so there is no second copy anywhere by construction.
    expect(storeOf(ART_OF_MEMORY).scribingAvailable).toBe(false);
    expect(perishesWithHolder(storeOf(ART_OF_MEMORY), LOCATION_KIND.palace)).toBe(true);
    expect(perishesWithHolder(storeOf(VANCIAN), LOCATION_KIND.library)).toBe(false);
  });
});
