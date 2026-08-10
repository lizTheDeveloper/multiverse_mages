/*
 * Multiverse Mages — forgetting: floored when held, floorless when forbidden.
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

import { LOCATION_KIND } from '@mm/state';

import { MASTERY_MAX } from '../../src/instances/constants.js';
import { decayHeldKnowledge, decayedMastery, masteryFloor } from '../../src/instances/decay.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import {
  HOME_CELL,
  ROOT_NODE,
  TEST_NODE_COUNT,
  interdicting,
  permissiveRuleset,
  testCells,
  testWorld,
} from '../support/scenario.js';

const HOLDER = 400;
const RETENTION = 1024;

function held(
  locationKind: number = LOCATION_KIND.mind,
  mastery = MASTERY_MAX,
): { knowledge: KnowledgeSubsystem; instance: number } {
  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  const isWritten =
    locationKind === LOCATION_KIND.grimoire || locationKind === LOCATION_KIND.library;
  const common = { nodeId: ROOT_NODE, locationKind, acquiredTick: 0, mastery };

  if (!isWritten) {
    return { knowledge, instance: knowledge.createInstance({ ...common, locationId: HOLDER }) };
  }
  const grimoire = knowledge.state.entities.create();
  return {
    knowledge,
    instance: knowledge.createInstance({ ...common, locationId: grimoire, grimoire }),
  };
}

function sweep(
  knowledge: KnowledgeSubsystem,
  elapsedTicks: number,
  worldTick: number,
  dormantCell = false,
) {
  return decayHeldKnowledge({
    knowledge,
    cells: testCells,
    ruleset: dormantCell ? interdicting(HOME_CELL) : permissiveRuleset(),
    elapsedTicks,
    worldTick,
    retentionOf: () => RETENTION,
  });
}

describe('written knowledge', () => {
  it('does not decay in a library', () => {
    const { knowledge, instance } = held(LOCATION_KIND.library);
    sweep(knowledge, 100, 100);
    expect(knowledge.read(instance).mastery).toBe(MASTERY_MAX);
  });

  it('does not decay in a grimoire, even in a forbidden cell', () => {
    const { knowledge, instance } = held(LOCATION_KIND.grimoire);
    sweep(knowledge, 500, 500, true);
    expect(knowledge.read(instance).mastery).toBe(MASTERY_MAX);
    expect(knowledge.exists(ROOT_NODE)).toBe(true);
  });
});

describe('held knowledge', () => {
  it('decays to the retention floor and stops there', () => {
    const { knowledge, instance } = held();
    const floor = masteryFloor(RETENTION, false);

    sweep(knowledge, 1000, 1000);
    expect(knowledge.read(instance).mastery).toBe(floor);

    sweep(knowledge, 100, 1100);
    expect(knowledge.read(instance).mastery).toBe(floor);
    expect(knowledge.exists(ROOT_NODE)).toBe(true);
  });

  it('settles higher for a species that remembers better', () => {
    expect(masteryFloor(1536, false)).toBeGreaterThan(masteryFloor(768, false));
  });

  it('decays a palace instance the same way it decays a mind', () => {
    const { knowledge, instance } = held(LOCATION_KIND.palace);
    sweep(knowledge, 10, 10);
    expect(knowledge.read(instance).mastery).toBeLessThan(MASTERY_MAX);
  });

  it('is deterministic, and takes no random source at all', () => {
    const once = decayedMastery(MASTERY_MAX, 17, RETENTION, false);
    const again = decayedMastery(MASTERY_MAX, 17, RETENTION, false);
    expect(again).toBe(once);
    // decayHeldKnowledge's inputs carry no `rng` field, so adding a draw here
    // would be a signature change rather than a quiet perturbation of every
    // other subsystem's sequence. That is the whole reason decay is
    // deterministic: contracts.md §6 streams stay honest only if the
    // subsystems that do not need randomness never take any.
    expect(decayedMastery(MASTERY_MAX, 0, RETENTION, false)).toBe(MASTERY_MAX);
  });
});

describe('dormant knowledge', () => {
  it('has no floor at all', () => {
    expect(masteryFloor(1536, true)).toBe(0);
  });

  it('decays to nothing, is destroyed, and takes the node with it', () => {
    const { knowledge, instance } = held();
    const lost = sweep(knowledge, 1000, 90, true);

    expect(knowledge.isInstance(instance)).toBe(false);
    expect(knowledge.exists(ROOT_NODE)).toBe(false);
    expect(lost).toEqual([{ nodeId: ROOT_NODE, worldTick: 90, location: LOCATION_KIND.mind }]);
    expect(knowledge.wasEverKnown(ROOT_NODE)).toBe(true);
  });

  it('survives a short interdiction the god reverses in time', () => {
    const { knowledge, instance } = held();
    sweep(knowledge, 10, 10, true);
    expect(knowledge.isInstance(instance)).toBe(true);
    expect(knowledge.read(instance).mastery).toBeGreaterThan(0);

    // Re-permitting restores the survivor with no migration step: the next
    // sweep is an ordinary floored one.
    sweep(knowledge, 1000, 1010);
    expect(knowledge.read(instance).mastery).toBe(masteryFloor(RETENTION, false));
  });

  it('emits no loss event while another copy survives', () => {
    const { knowledge } = held();
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 401,
      acquiredTick: 0,
      mastery: MASTERY_MAX,
    });

    const lost = sweep(knowledge, 4, 4, true);
    expect(lost).toEqual([]);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(2);
  });
});
