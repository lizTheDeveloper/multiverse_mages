/*
 * Multiverse Mages — anti-requisites are enforced where every acquisition meets.
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
 * `vision.md` §4b: *"The exclusion is checked against the **mage's** held set,
 * never the universe's: a universe can eventually hold everything, spread across
 * many mages, and that is exactly what a civilization is for."*
 *
 * ## Why the check lives on `createInstance` and not on the frontier
 *
 * Five things put a node in a mage's head: a founding grant, research, teaching,
 * scribing read back, and **raid theft**. Four of them route through
 * `CoordinatingKnowledgeGateway`, which is where a frontier filter would live.
 * The fifth does not: `rules-raid`'s `consequences.ts` calls `createInstance`
 * directly into `LOCATION_KIND.mind` for the thief.
 *
 * So a check that lived only on the frontier would be **launderable** — steal
 * the school you are forbidden, and the exclusion never fires. That is not an
 * exotic edge case; it is a strategy, and one a learned agent would find while
 * a human reviewer read the frontier filter and believed it. The check therefore
 * sits at `createInstance`, which is the one place all five converge and the
 * same place `contracts.md` §1.5's ever-known write already sits for exactly the
 * same reason: *"first instance is a fact about the index, not about which
 * operation happened to produce it."*
 *
 * A frontier filter is still worth having, and it is an **optimization**: it
 * keeps forbidden nodes off a mage's candidate list so she does not commit
 * months of effort to work that would be refused at the desk. Enforcement at the
 * chokepoint, filtering at the edges — never the other way round.
 */

import { describe, expect, it } from 'vitest';

import { LOCATION_KIND } from '@mm/state';

import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import {
  HOME_CELL,
  OTHER_CELL,
  OTHER_CELL_NODE,
  ROOT_NODE,
  TEST_NODE_COUNT,
  cellOf,
  testWorld,
} from '../support/scenario.js';

const MAGE = 1 as const;
const OTHER_MAGE = 2 as const;
const TICK = 10;

/** The two fixture cells, excluding one another with the given resolution. */
function exclusions(resolution: 'refused' | 'destructive') {
  return {
    cellOf,
    excludedBy: (cellId: number) => {
      if (cellId === HOME_CELL) return [{ cell: OTHER_CELL, resolution }];
      if (cellId === OTHER_CELL) return [{ cell: HOME_CELL, resolution }];
      return [];
    },
  };
}

function subsystemWith(resolution: 'refused' | 'destructive'): KnowledgeSubsystem {
  return KnowledgeSubsystem.fromState(testWorld(), TEST_NODE_COUNT, exclusions(resolution));
}

describe('an exclusion is checked against the mage, not the universe', () => {
  it('lets one mage hold each side — that is what a civilization is for', () => {
    const knowledge = subsystemWith('refused');
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: MAGE,
      acquiredTick: TICK,
      mastery: 1024,
    });
    // A different mage, the other side of the exclusion. Must be allowed.
    expect(() =>
      knowledge.createInstance({
        nodeId: OTHER_CELL_NODE,
        locationKind: LOCATION_KIND.mind,
        locationId: OTHER_MAGE,
        acquiredTick: TICK,
        mastery: 1024,
      }),
    ).not.toThrow();
    expect(knowledge.exists(ROOT_NODE)).toBe(true);
    expect(knowledge.exists(OTHER_CELL_NODE)).toBe(true);
  });

  it('refuses the second side for one mage under `refused`', () => {
    const knowledge = subsystemWith('refused');
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: MAGE,
      acquiredTick: TICK,
      mastery: 1024,
    });
    const outcome = knowledge.createInstance({
      nodeId: OTHER_CELL_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: MAGE,
      acquiredTick: TICK,
      mastery: 1024,
    });
    expect(outcome).toBe(0);
    // The refusal is total: she does not hold it, and if nobody else does, the
    // universe does not either.
    expect(knowledge.exists(OTHER_CELL_NODE)).toBe(false);
    expect(knowledge.exists(ROOT_NODE)).toBe(true);
  });

  it('destroys the conflicting side under `destructive`, and may take the last copy', () => {
    const knowledge = subsystemWith('destructive');
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: MAGE,
      acquiredTick: TICK,
      mastery: 1024,
    });
    expect(knowledge.exists(ROOT_NODE)).toBe(true);

    const handle = knowledge.createInstance({
      nodeId: OTHER_CELL_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: MAGE,
      acquiredTick: TICK,
      mastery: 1024,
    });
    // The acquisition succeeded...
    expect(handle).not.toBe(0);
    expect(knowledge.exists(OTHER_CELL_NODE)).toBe(true);
    // ...and it cost her the other school. This was the universe's only copy,
    // so the node is now *gone* — which is the whole point of `destructive`.
    expect(knowledge.exists(ROOT_NODE)).toBe(false);
  });

  it('leaves other mages’ copies alone when it destroys one mage’s', () => {
    const knowledge = subsystemWith('destructive');
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: MAGE,
      acquiredTick: TICK,
      mastery: 1024,
    });
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: OTHER_MAGE,
      acquiredTick: TICK,
      mastery: 1024,
    });
    knowledge.createInstance({
      nodeId: OTHER_CELL_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: MAGE,
      acquiredTick: TICK,
      mastery: 1024,
    });
    // One mage lost it; the universe did not, because a colleague still holds
    // it. §4b's per-mage rule, from the other direction.
    expect(knowledge.exists(ROOT_NODE)).toBe(true);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(1);
  });

  it('does not fire on a library, because a shelf is not a mage', () => {
    // §4b excludes what a *mage* may hold. A library is an institution and the
    // civilization is allowed to keep both books — otherwise the first
    // exclusion authored would start burning archives nobody learned from.
    const knowledge = subsystemWith('destructive');
    const library = 40 as const;
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.library,
      locationId: library,
      acquiredTick: TICK,
      mastery: 1024,
      grimoire: 41,
    });
    expect(() =>
      knowledge.createInstance({
        nodeId: OTHER_CELL_NODE,
        locationKind: LOCATION_KIND.library,
        locationId: library,
        acquiredTick: TICK,
        mastery: 1024,
        grimoire: 42,
      }),
    ).not.toThrow();
    expect(knowledge.exists(ROOT_NODE)).toBe(true);
    expect(knowledge.exists(OTHER_CELL_NODE)).toBe(true);
  });

  it('fires on raid theft, which is the path a frontier filter would miss', () => {
    // `rules-raid`'s `consequences.ts` writes straight into the thief's mind.
    // This is the same call it makes, and the exclusion must bite here or it is
    // launderable by stealing what you may not learn.
    const knowledge = subsystemWith('refused');
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: MAGE,
      acquiredTick: TICK,
      mastery: 1024,
    });
    const stolen = knowledge.createInstance({
      nodeId: OTHER_CELL_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: MAGE,
      acquiredTick: TICK,
      // Theft arrives at zero mastery. Irrelevant to the exclusion, and pinned
      // here so the test still describes theft if that changes.
      mastery: 0,
    });
    expect(stolen).toBe(0);
    expect(knowledge.exists(OTHER_CELL_NODE)).toBe(false);
  });

  it('is inert when no exclusions are authored, which is every shipped v1 cell', () => {
    const knowledge = KnowledgeSubsystem.fromState(testWorld(), TEST_NODE_COUNT);
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: MAGE,
      acquiredTick: TICK,
      mastery: 1024,
    });
    expect(() =>
      knowledge.createInstance({
        nodeId: OTHER_CELL_NODE,
        locationKind: LOCATION_KIND.mind,
        locationId: MAGE,
        acquiredTick: TICK,
        mastery: 1024,
      }),
    ).not.toThrow();
    expect(knowledge.exists(ROOT_NODE)).toBe(true);
    expect(knowledge.exists(OTHER_CELL_NODE)).toBe(true);
  });
});
