/*
 * Multiverse Mages — what a mage's death destroys, and what survives her.
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

import { describe, expect, it } from 'vitest';

import type { ContentId } from '@mm/content';
import { HOLDER_KIND, LOCATION_KIND, MAGE_ROLE } from '@mm/state';
import type { MageDeathPort, MageHandle, UniversityHandle } from '@mm/rules-world';
import { NO_INHERITOR, isWorkingMage, killMage } from '@mm/rules-world';

import { handleOf, mageRow } from './mage-fixtures.js';

/**
 * A knowledge world small enough to assert over, standing in for the
 * coordinating layer.
 *
 * Deliberately a working model rather than a stub returning fixed answers. The
 * one thing this suite has to prove is an *ordering* — that "which nodes are
 * now gone" is asked after the destruction and not before — and a stub whose
 * `instanceCount` never changes cannot tell the two orderings apart.
 */
class FakeKnowledge {
  /** Live instances, as `(nodeId, locationKind, locationId)` triples. */
  instances: { nodeId: ContentId; locationKind: number; locationId: number }[] = [];
  /** Grimoires, as `(nodeId, holderKind, holderId, durability)`. */
  grimoires: { nodeId: ContentId; holderKind: number; holderId: number; durability: number }[] = [];
  readonly notifiedLost: ContentId[] = [];
  readonly released: { mage: MageHandle; universityId: UniversityHandle; roleId: number }[] = [];
  readonly goalsAbandoned: MageHandle[] = [];
  /** Set when `heldNodes` is called, so a test can assert it happened first. */
  readonly callOrder: string[] = [];

  instanceCount(nodeId: ContentId): number {
    this.callOrder.push(`instanceCount:${String(nodeId)}`);
    return this.instances.filter((instance) => instance.nodeId === nodeId).length;
  }

  port(): MageDeathPort {
    return {
      knowledge: {
        instanceCount: (nodeId) => this.instanceCount(nodeId),
        everKnown: () => true,
        knows: (mage, nodeId) =>
          this.instances.some(
            (instance) => instance.nodeId === nodeId && instance.locationId === mage,
          ),
        researchFrontier: () => [],
        canTeach: () => false,
        teachableTo: () => undefined,
        scribableBy: () => undefined,
        contributeResearch: () => undefined,
        contributeTeaching: () => undefined,
        contributeScribing: () => undefined,
        onMageDied: (mage, inheritor) => {
          this.callOrder.push('onMageDied');
          // Mind and memory-palace instances die with her.
          this.instances = this.instances.filter(
            (instance) =>
              !(
                instance.locationId === mage &&
                (instance.locationKind === LOCATION_KIND.mind ||
                  instance.locationKind === LOCATION_KIND.palace)
              ),
          );
          // Her books are things, and they survive.
          for (const grimoire of this.grimoires) {
            if (grimoire.holderKind === HOLDER_KIND.mage && grimoire.holderId === mage) {
              if (inheritor === NO_INHERITOR) {
                grimoire.holderKind = HOLDER_KIND.inTransit;
                grimoire.holderId = 0;
              } else {
                grimoire.holderKind = HOLDER_KIND.library;
                grimoire.holderId = inheritor;
              }
            }
          }
        },
      },
      heldNodes: (mage) => {
        this.callOrder.push('heldNodes');
        return this.instances
          .filter(
            (instance) =>
              instance.locationId === mage &&
              (instance.locationKind === LOCATION_KIND.mind ||
                instance.locationKind === LOCATION_KIND.palace),
          )
          .map((instance) => instance.nodeId);
      },
      onNodeInstanceCountZero: (nodeId) => {
        this.callOrder.push(`lost:${String(nodeId)}`);
        this.notifiedLost.push(nodeId);
      },
      releaseSlots: (mage, universityId, roleId) => {
        this.released.push({ mage, universityId, roleId });
      },
      abandonGoal: (mage) => {
        this.callOrder.push('abandonGoal');
        this.goalsAbandoned.push(mage);
      },
    };
  }
}

const MAGE = handleOf(12, 3);
const OTHER_MAGE = handleOf(13, 1);
const UNIVERSITY = handleOf(40, 1);

describe('death destroys the knowledge a mage carried', () => {
  it('destroys every mind instance in the same tick', () => {
    const world = new FakeKnowledge();
    world.instances = [1, 2, 3].map((nodeId) => ({
      nodeId,
      locationKind: LOCATION_KIND.mind,
      locationId: MAGE,
    }));
    killMage(MAGE, mageRow(), world.port());
    expect(world.instances).toHaveLength(0);
  });

  it('destroys memory-palace instances, with no copy surviving anywhere', () => {
    const world = new FakeKnowledge();
    world.instances = [
      { nodeId: 7, locationKind: LOCATION_KIND.palace, locationId: MAGE },
      { nodeId: 8, locationKind: LOCATION_KIND.palace, locationId: MAGE },
    ];
    killMage(MAGE, mageRow(), world.port());
    expect(world.instances.filter((instance) => instance.locationKind === LOCATION_KIND.palace))
      .toHaveLength(0);
  });

  it('leaves another mage’s instances of the same node alone', () => {
    const world = new FakeKnowledge();
    world.instances = [
      { nodeId: 5, locationKind: LOCATION_KIND.mind, locationId: MAGE },
      { nodeId: 5, locationKind: LOCATION_KIND.mind, locationId: OTHER_MAGE },
    ];
    const outcome = killMage(MAGE, mageRow(), world.port());
    expect(world.instances).toHaveLength(1);
    expect(outcome.nodesLost).toEqual([]);
  });
});

describe('grimoires survive their author', () => {
  it('passes an affiliated mage’s books to her university library, durability unchanged', () => {
    const world = new FakeKnowledge();
    world.grimoires = [
      { nodeId: 2, holderKind: HOLDER_KIND.mage, holderId: MAGE, durability: 1536 },
      { nodeId: 3, holderKind: HOLDER_KIND.mage, holderId: MAGE, durability: 768 },
    ];
    const outcome = killMage(MAGE, mageRow({ universityId: UNIVERSITY }), world.port());
    expect(outcome.inheritor).toBe(UNIVERSITY);
    expect(world.grimoires).toEqual([
      { nodeId: 2, holderKind: HOLDER_KIND.library, holderId: UNIVERSITY, durability: 1536 },
      { nodeId: 3, holderKind: HOLDER_KIND.library, holderId: UNIVERSITY, durability: 768 },
    ]);
  });

  it('sends an unaffiliated mage’s book to a holder kind the contract enumerates', () => {
    const world = new FakeKnowledge();
    world.grimoires = [
      { nodeId: 2, holderKind: HOLDER_KIND.mage, holderId: MAGE, durability: 1024 },
    ];
    const outcome = killMage(MAGE, mageRow({ universityId: 0 }), world.port());
    expect(outcome.inheritor).toBe(NO_INHERITOR);
    expect(world.grimoires[0]?.holderKind).toBe(HOLDER_KIND.inTransit);
    // No fifth holder kind was invented for the case.
    expect(Object.values(HOLDER_KIND)).toContain(world.grimoires[0]?.holderKind);
  });
});

describe('the last instance leaving the universe is signalled', () => {
  it('notifies the coordinating layer, and writes no cached existence flag', () => {
    const world = new FakeKnowledge();
    world.instances = [{ nodeId: 42, locationKind: LOCATION_KIND.mind, locationId: MAGE }];
    const record = mageRow();
    const outcome = killMage(MAGE, record, world.port());

    expect(outcome.nodesLost).toEqual([42]);
    expect(world.notifiedLost).toEqual([42]);
    // The mage row is the only state this function writes, and it gained no
    // node-existence field: §1.5 makes existence derived, and a cached flag is
    // a second source of truth a snapshot would faithfully preserve after it
    // stopped being true.
    expect(Object.keys(record).sort()).toEqual(
      [
        'alive',
        'ambition',
        'birthTick',
        'caution',
        'curiosity',
        'maxVigor',
        'roleId',
        'speciesId',
        'universityId',
        'vigor',
      ].sort(),
    );
  });

  it('asks which nodes are gone only after the instances are destroyed', () => {
    // The ordering mistake that fails silently in the safe-looking direction:
    // asked first, `instanceCount` never returns zero, nothing is ever reported
    // lost, and the universe appears to retain everything it has known.
    const world = new FakeKnowledge();
    world.instances = [{ nodeId: 42, locationKind: LOCATION_KIND.mind, locationId: MAGE }];
    killMage(MAGE, mageRow(), world.port());

    expect(world.callOrder.indexOf('heldNodes')).toBeLessThan(
      world.callOrder.indexOf('onMageDied'),
    );
    expect(world.callOrder.indexOf('onMageDied')).toBeLessThan(
      world.callOrder.indexOf('instanceCount:42'),
    );
  });

  it('says nothing when another copy survives', () => {
    const world = new FakeKnowledge();
    world.instances = [
      { nodeId: 42, locationKind: LOCATION_KIND.mind, locationId: MAGE },
      { nodeId: 42, locationKind: LOCATION_KIND.mind, locationId: OTHER_MAGE },
    ];
    killMage(MAGE, mageRow(), world.port());
    expect(world.notifiedLost).toEqual([]);
  });
});

describe('dead mages are excluded from work', () => {
  it('clears alive, releases the slots, and abandons the goal', () => {
    const world = new FakeKnowledge();
    const record = mageRow({ universityId: UNIVERSITY, roleId: MAGE_ROLE.professor });
    const outcome = killMage(MAGE, record, world.port());

    expect(record.alive).toBe(0);
    expect(isWorkingMage(record)).toBe(false);
    expect(record.universityId).toBe(0);
    expect(world.goalsAbandoned).toEqual([MAGE]);
    expect(world.released).toEqual([
      { mage: MAGE, universityId: UNIVERSITY, roleId: MAGE_ROLE.professor },
    ]);
    expect(outcome.contributedMageMonths).toBe(0);
  });

  it('abandons the goal before clearing alive, so the autonomy layer can still resolve her', () => {
    const world = new FakeKnowledge();
    const record = mageRow();
    let aliveWhenAbandoned: number | undefined;
    const port = world.port();
    killMage(MAGE, record, {
      ...port,
      abandonGoal: (mage) => {
        aliveWhenAbandoned = record.alive;
        port.abandonGoal(mage);
      },
    });
    expect(aliveWhenAbandoned).toBe(1);
    expect(record.alive).toBe(0);
  });

  it('releases the slots with the affiliation and role she had, not the cleared ones', () => {
    const world = new FakeKnowledge();
    killMage(MAGE, mageRow({ universityId: UNIVERSITY, roleId: MAGE_ROLE.raider }), world.port());
    expect(world.released[0]?.universityId).toBe(UNIVERSITY);
    expect(world.released[0]?.roleId).toBe(MAGE_ROLE.raider);
  });
});
