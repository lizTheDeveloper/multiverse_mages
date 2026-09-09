/*
 * Multiverse Mages — scribing a mind into a grimoire.
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

import { GRIMOIRE, HOLDER_KIND, LOCATION_KIND, readRecord } from '@mm/state';

import { MASTERY_MAX, SCRIBE_CAPACITY_PER_TIER } from '../../src/instances/constants.js';
import type { ScribingInputs } from '../../src/instances/scribing.js';
import { scribe } from '../../src/instances/scribing.js';
import { PALACE_STORE, STANDARD_STORE } from '../support/store-hooks.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import {
  HOME_CELL,
  ROOT_NODE,
  TEST_NODE_COUNT,
  interdicting,
  permissiveRuleset,
  stepRng,
  testCatalog,
  testCells,
  testWorld,
} from '../support/scenario.js';

const SCRIBE = 300;

function fixture(): KnowledgeSubsystem {
  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  knowledge.createInstance({
    nodeId: ROOT_NODE,
    locationKind: LOCATION_KIND.mind,
    locationId: SCRIBE,
    acquiredTick: 0,
    mastery: MASTERY_MAX,
  });
  return knowledge;
}

function inputs(
  knowledge: KnowledgeSubsystem,
  overrides: Partial<ScribingInputs> = {},
): ScribingInputs {
  return {
    knowledge,
    catalog: testCatalog(),
    cells: testCells,
    ruleset: permissiveRuleset(),
    rng: stepRng(17, 6),
    scribe: SCRIBE,
    nodeId: ROOT_NODE,
    worldTick: 6,
    store: STANDARD_STORE,
    scribeAffinity: 1024,
    scribeCapacity: 4096,
    materials: 4096,
    ...overrides,
  };
}

describe('scribing', () => {
  it('produces a grimoire, one instance, and a report of what it consumed', () => {
    const knowledge = fixture();
    const outcome = scribe(inputs(knowledge));

    expect(outcome.refusal).toBeUndefined();
    expect(outcome.grimoire).not.toBe(0);
    expect(outcome.instance).not.toBe(0);

    const book = readRecord(knowledge.state, GRIMOIRE, outcome.grimoire);
    expect(book.nodeId).toBe(ROOT_NODE);
    expect(book.durability).toBe(outcome.durability);
    expect(book.holderKind).toBe(HOLDER_KIND.mage);
    expect(book.holderId).toBe(SCRIBE);

    const written = knowledge.read(outcome.instance);
    expect(written.locationKind).toBe(LOCATION_KIND.grimoire);
    expect(written.locationId).toBe(outcome.grimoire);
    expect(knowledge.instanceForGrimoire(outcome.grimoire)).toBe(outcome.instance);

    expect(outcome.materialsConsumed).toBe(2048);
    expect(outcome.capacityConsumed).toBe(SCRIBE_CAPACITY_PER_TIER);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(2);
  });

  it('refuses insufficient materials, reporting the shortfall', () => {
    const knowledge = fixture();
    const outcome = scribe(inputs(knowledge, { materials: 1024 }));

    expect(outcome.refusal).toEqual({
      reason: 'insufficient-materials',
      nodeId: ROOT_NODE,
      supplied: 1024,
      required: 2048,
    });
    expect(outcome.grimoire).toBe(0);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(1);
  });

  it('refuses insufficient scribe capacity', () => {
    const knowledge = fixture();
    const outcome = scribe(inputs(knowledge, { scribeCapacity: 512 }));

    expect(outcome.refusal).toEqual({
      reason: 'insufficient-scribe-capacity',
      nodeId: ROOT_NODE,
      supplied: 512,
      required: SCRIBE_CAPACITY_PER_TIER,
    });
  });

  it('gives a higher scribe affinity a strictly greater durability at the same seed', () => {
    const dwarven = scribe(inputs(fixture(), { scribeAffinity: 1792 }));
    const ordinary = scribe(inputs(fixture(), { scribeAffinity: 1024 }));

    expect(dwarven.durability).toBeGreaterThan(ordinary.durability);
  });

  it('refuses under a palace store hook, naming the active kind', () => {
    const knowledge = fixture();
    const outcome = scribe(inputs(knowledge, { store: PALACE_STORE }));

    expect(outcome.refusal).toEqual({
      reason: 'written-storage-unavailable',
      nodeId: ROOT_NODE,
      storeKind: 'palace',
    });
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(1);
  });

  it('refuses a forbidden cell, so a dormant instance cannot be scribed', () => {
    const outcome = scribe(inputs(fixture(), { ruleset: interdicting(HOME_CELL) }));
    expect(outcome.refusal).toEqual({
      reason: 'forbidden-cell',
      nodeId: ROOT_NODE,
      cellId: HOME_CELL,
    });
  });

  it('refuses a scribe who does not hold the node in mind', () => {
    const outcome = scribe(inputs(fixture(), { scribe: 777 }));
    expect(outcome.refusal).toEqual({ reason: 'node-not-held', nodeId: ROOT_NODE, subject: 777 });
  });

  it('draws its durability roll from stream 5, reproducibly', () => {
    const first = scribe(inputs(fixture(), { rng: stepRng(21, 6) }));
    const same = scribe(inputs(fixture(), { rng: stepRng(21, 6) }));
    const other = scribe(inputs(fixture(), { rng: stepRng(22, 6) }));

    expect(same.durability).toBe(first.durability);
    expect(other.durability).not.toBe(first.durability);
  });
});
