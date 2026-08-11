/*
 * Multiverse Mages — adversarial: does the tradition-change plan match what applying it produces?
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
 * The task brief asks: "Does a node emptied by a tradition change get the
 * same loss event, with the same fields, as one emptied by decay? Does
 * `everKnown` survive both?"
 *
 * `changeTradition` (`traditions/change.ts`) is pure: it *predicts* which
 * instances the incoming `store` kind cannot hold and *predicts* the loss
 * events that follow, but does not touch the `KnowledgeSubsystem` itself —
 * `magic-traditions`'s spec.md says the operation "returns a description
 * rather than mutating: the caller applies the whole result or none of it".
 * No caller exists yet (`god-agency` is unimplemented), so nothing in the
 * shipped suite exercises the *composed* path: predicted plan -> applied via
 * `KnowledgeSubsystem.destroyAll` -> the subsystem's own emitted loss event
 * -> `wasEverKnown` afterward.
 *
 * This test builds that composition by hand, using the same
 * `KnowledgeSubsystem.destroyAll` the decay and mortality paths already use,
 * and checks it against `mastery-decay.test.ts`'s own decay-loss assertion
 * shape (`{ nodeId, worldTick, location }`) for exact structural agreement.
 *
 * Expected, and asserted here, to pass: `changeTradition`'s own loss records
 * are literally re-exported from `instances/outcomes.ts`
 * (`export type { KnowledgeLossEvent } from '../instances/outcomes.js';`,
 * `traditions/change.ts:90`), so structural agreement is not really in
 * question. What *was* open before this test is whether applying the plan
 * through the subsystem's real destroy path reproduces the same event the
 * plan predicted, field for field, and leaves `wasEverKnown` set — since nothing
 * previously ran that composition end to end.
 */

import { describe, expect, it } from 'vitest';

import { LOCATION_KIND } from '@mm/state';

import { changeTradition } from '../../src/traditions/change.js';
import type { InstanceView } from '../../src/traditions/change.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import { ROOT_NODE, TEST_NODE_COUNT, testWorld } from '../support/scenario.js';
import { ART_OF_MEMORY, TRADITIONS, VANCIAN } from '../unit/tradition-fixtures.js';
import { hooksOfTradition } from '../../src/traditions/index.js';

const WORLD_TICK = 55;

describe('applying a predicted tradition-change loss produces the same event decay would', () => {
  it('the subsystem-emitted loss event matches the plan, and everKnown survives it', () => {
    const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
    const grimoire = knowledge.state.entities.create();
    const instance = knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.grimoire,
      locationId: grimoire,
      acquiredTick: 0,
      mastery: 0,
      grimoire,
    });
    expect(knowledge.wasEverKnown(ROOT_NODE)).toBe(true);

    // Vancian (standard store) -> Art of Memory (palace store): grimoires have
    // nowhere to live under the incoming kind, and this is the node's only
    // instance.
    const outgoing = hooksOfTradition(VANCIAN, TRADITIONS).store;
    const incoming = hooksOfTradition(ART_OF_MEMORY, TRADITIONS).store;
    const view: InstanceView = {
      instanceId: instance,
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.grimoire,
      locationId: grimoire,
    };

    const plan = changeTradition({
      outgoingStore: outgoing,
      incomingStore: incoming,
      instances: [view],
      worldTick: WORLD_TICK,
    });

    expect(plan.applied).toBe(true);
    expect(plan.destroyed).toEqual([instance]);
    expect(plan.losses).toEqual([
      { nodeId: ROOT_NODE, worldTick: WORLD_TICK, location: LOCATION_KIND.grimoire },
    ]);

    // Apply the plan the way a future caller must: destroy exactly the
    // instances named, through the one subsystem-owned destroy path.
    const appliedLosses = knowledge.destroyAll(plan.destroyed, WORLD_TICK);

    // Same shape decay's own loss event takes (mastery-decay.test.ts asserts
    // `{ nodeId, worldTick, location }` for a decay-caused loss) -- a
    // tradition-change loss and a decay loss are structurally
    // indistinguishable, exactly as magic-traditions's spec requires.
    expect(appliedLosses).toEqual(plan.losses);
    expect(knowledge.exists(ROOT_NODE)).toBe(false);
    expect(knowledge.wasEverKnown(ROOT_NODE)).toBe(true);
  });
});
