/*
 * Multiverse Mages — the outcome system counts plunder only while it survives.
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
 * The projection behind both ascension paths' loot conjunct (vision §8a,
 * 2026-10-08), read through the god report on a real stepped universe rather
 * than through a facts object a test filled in by hand. Each case moves one
 * fact the rule names — a thief alive or dead, a captured book whole or burned —
 * and reads `ascensionProgress.lootedNodesHeld` on the next tick.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle, SimState } from '@mm/sim-core';
import { step } from '@mm/sim-core';
import {
  GRIMOIRE,
  HOLDER_KIND,
  KNOWLEDGE_INSTANCE,
  KNOWLEDGE_PROVENANCE,
  LOCATION_KIND,
  LOOT_ROUTE,
  MAGE,
  attachRecord,
  captureRuleset,
  componentOf,
  findUniverse,
  permits,
} from '@mm/state';
import { KnowledgeSubsystem } from '@mm/rules-magic';

import { defineWorldSimulation } from '../../src/index.js';
import type { WorldSimulation } from '../../src/index.js';

import { catalogAndCells, registry, seededWorld, sourceFor } from './world-fixtures.js';
import { godlyWorldDeps } from './god-fixtures.js';

const ROOT_SEED = 0x0006_0a17;

function world(): { simulation: WorldSimulation; state: SimState } {
  const traditionId = registry().traditions[0]?.contentId ?? 1;
  const simulation = defineWorldSimulation(godlyWorldDeps(traditionId));
  const { state } = seededWorld(simulation.schema, { rootSeed: ROOT_SEED });
  return { simulation, state };
}

function tick(simulation: WorldSimulation, state: SimState): { state: SimState; looted: number } {
  const next = step(state, [], sourceFor(ROOT_SEED));
  return { state: next, looted: simulation.lastGodReport()?.ascensionProgress.lootedNodesHeld ?? -1 };
}

/**
 * A node put into a living mage's mind, as a theft would put it there — the
 * seeded world starts with no knowledge in heads.
 *
 * At **full** mastery, not the zero a theft writes, and that is a finding rather
 * than a convenience: `decayHeldKnowledge` destroys any held instance at zero
 * mastery on its next sweep (its *"zero mastery is destruction whether or not
 * the cell is forbidden"* rule), so a stolen node written at `mastery: 0` is gone
 * one world tick after the raid unless something raises it first. This file is
 * about the projection, so it holds the instance still; whether a theft should
 * survive its first sweep is a knowledge-model question raised in the PR.
 */
function heldByLivingMage(state: SimState): { mage: EntityHandle; instance: EntityHandle } {
  const mages = componentOf(state, MAGE);
  let mage: EntityHandle | undefined;
  mages.forEach((_row, handle) => {
    if (mage === undefined && mages.get(handle, 'alive') === 1) mage = handle;
  });
  if (mage === undefined) throw new Error('the seeded world holds no living mage');
  // A node in a cell the ruleset permits: a stolen node from a forbidden cell is
  // dormant, and at a theft's zero mastery the decay sweep takes it on the next
  // tick — which is the knowledge model working, not this projection.
  const { catalog, cells } = catalogAndCells();
  const ruleset = captureRuleset(state, findUniverse(state));
  let nodeId = 0;
  for (let id = 1; id <= catalog.nodeCount && nodeId === 0; id += 1) {
    if (permits(ruleset, cells.cellOf(id))) nodeId = id;
  }
  const instance = KnowledgeSubsystem.fromState(state, catalog.nodeCount).createInstance({
    nodeId,
    locationKind: LOCATION_KIND.mind,
    locationId: mage,
    acquiredTick: 0,
    mastery: 1024,
  });
  return { mage, instance };
}

describe('lootedNodesHeld reads the plunder a universe still has', () => {
  it('reads zero in a universe that has never raided', () => {
    const { simulation, state } = world();
    expect(tick(simulation, state).looted).toBe(0);
  });

  it('counts a stolen node while its thief lives, and not after she dies', () => {
    const { simulation, state } = world();
    let current = tick(simulation, state).state;
    const { mage, instance } = heldByLivingMage(current);
    attachRecord(current, KNOWLEDGE_PROVENANCE, instance, { route: LOOT_ROUTE.theft });

    const held = tick(simulation, current);
    expect(held.looted).toBe(1);
    current = held.state;

    // Read on the *next* state: `step` clones, and the handle is stable.
    componentOf(current, MAGE).set(mage, 'alive', 0);
    expect(tick(simulation, current).looted).toBe(0);
  });

  it('counts a captured book while it exists, and not after it burns', () => {
    const { simulation, state } = world();
    const current = tick(simulation, state).state;
    const { catalog } = catalogAndCells();
    const knowledge = KnowledgeSubsystem.fromState(current, catalog.nodeCount);
    const book = current.entities.create();
    const nodeId = catalog.nodeCount;
    attachRecord(current, GRIMOIRE, book, { nodeId, durability: 1024, holderKind: HOLDER_KIND.unowned, holderId: 0 });
    const instance = knowledge.createInstance({
      nodeId,
      locationKind: LOCATION_KIND.grimoire,
      locationId: book,
      acquiredTick: 0,
      mastery: 1024,
      grimoire: book,
    });
    attachRecord(current, KNOWLEDGE_PROVENANCE, instance, { route: LOOT_ROUTE.capturedBook });

    const held = tick(simulation, current);
    expect(held.looted).toBe(1);

    const burning = KnowledgeSubsystem.fromState(held.state, catalog.nodeCount);
    burning.destroyInstance(instance, 0);
    // The row went with its entity — there is no second bookkeeping step.
    expect(componentOf(held.state, KNOWLEDGE_PROVENANCE).has(instance)).toBe(false);
    expect(tick(simulation, held.state).looted).toBe(0);
  });

  it('counts distinct nodes, not instances', () => {
    const { simulation, state } = world();
    const current = tick(simulation, state).state;
    const { instance } = heldByLivingMage(current);
    const nodeId = componentOf(current, KNOWLEDGE_INSTANCE).get(instance, 'nodeId');
    attachRecord(current, KNOWLEDGE_PROVENANCE, instance, { route: LOOT_ROUTE.theft });
    // A second looted copy of the same node, as a captured book.
    const { catalog } = catalogAndCells();
    const knowledge = KnowledgeSubsystem.fromState(current, catalog.nodeCount);
    const book = current.entities.create();
    attachRecord(current, GRIMOIRE, book, { nodeId, durability: 1024, holderKind: HOLDER_KIND.unowned, holderId: 0 });
    const copy = knowledge.createInstance({
      nodeId,
      locationKind: LOCATION_KIND.grimoire,
      locationId: book,
      acquiredTick: 0,
      mastery: 1024,
      grimoire: book,
    });
    attachRecord(current, KNOWLEDGE_PROVENANCE, copy, { route: LOOT_ROUTE.capturedBook });
    expect(tick(simulation, current).looted).toBe(1);
  });
});
