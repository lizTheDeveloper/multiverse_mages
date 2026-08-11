/*
 * Multiverse Mages — adversarial: the Art of Memory's palace has no floor under it.
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
 * # FAILING ON PURPOSE — finding 2 of 3
 *
 * ## (a) The behaviour believed to be incorrect
 *
 * The shipped v1 Art of Memory declares `store: palace` with
 * `"slotsPerMage": 12` (`packages/content/data/tradition.json`), and
 * `storePolicy()` faithfully surfaces it as `StorePolicy.slotsPerMage`.
 * `admitToStore()` will answer questions about it. **Nothing ever asks.**
 *
 * `admitToStore` has no caller anywhere in `packages/rules-magic/src` — grep it.
 * `research()` and `teach()` create an instance at the `locationKind` their
 * caller hands them and take no store policy, no slot count, and no held-instance
 * count, so there is no argument by which a caller could make either of them
 * refuse. Driven exactly as `release-claim-0.3.0-traditions.test.ts` drives the
 * Art of Memory — `locationKind: storePolicy(hooks.store).personalLocationKind`
 * — a single mage acquires her twentieth palace instance without complaint.
 *
 * ## (b) The lines that say it should be otherwise
 *
 * `openspec/changes/knowledge-model/specs/magic-traditions/spec.md`,
 * "Requirement: The Art of Memory hooks store only", verbatim:
 *
 * > Under `palace`, knowledge instances MUST be created at `locationKind`
 * > palace **bounded by the declared `slotsPerMage`** ...
 *
 * and its named scenario, verbatim:
 *
 * > #### Scenario: Palace slots are bounded
 * > - **WHEN** a mage with `slotsPerMage` of twelve acquires a thirteenth node
 * > - **THEN** the acquisition is refused and the slot count is named
 *
 * `traditions/store.ts` restates the same thing as the tradition's identity:
 * *"How many instances one mage may hold at `personalLocationKind`"* — *may*,
 * not *is nominally allowed*.
 *
 * ## (c) Why the asserted values are the right ones
 *
 * Twelve is the number shipped content declares, and thirteen is the number the
 * spec scenario names, so the assertion is `instancesHeldBy(mage).length <= 12`
 * after twenty successful acquisitions and a refusal on the thirteenth. Neither
 * figure is invented here.
 *
 * This is not the same shape as the `acquire` hook's costs, which `research()`
 * also does not read directly. There the caller has a parameter to push the
 * tradition's decision through — it scales the catalog's `researchCost`, which
 * is what the release-claim transcript does — and `research()` genuinely
 * behaves differently as a result. Here there is no parameter at all: the bound
 * is unreachable from every shipped acquisition path, so `slotsPerMage` is the
 * one v1 hook param that cannot change what a mage ends up holding. That is
 * precisely release 0.3.0's second claim — *"each of the three v1 traditions
 * changes measurable behaviour through its declared hook"* — failing at its
 * "measurable" clause for the Art of Memory's headline limit, and it is why the
 * shipped release-claim test can only assert `admitToStore(store, 12).admitted`,
 * a query about a policy object rather than an outcome of a simulation.
 *
 * A fix may thread the bound through `research`/`teach` (a store policy plus the
 * subject's current personal-instance count), or `KnowledgeSubsystem` may learn
 * to refuse. This file asserts the outcome and not the mechanism.
 */

import { describe, expect, it } from 'vitest';

import { createRediscoveryClampCounter } from '@mm/primitives';
import { LOCATION_KIND } from '@mm/state';

import type { KnowledgeNode } from '../../src/instances/catalog.js';
import { catalogOf } from '../../src/instances/catalog.js';
import { MASTERY_MAX } from '../../src/instances/constants.js';
import { research } from '../../src/instances/research.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import { teach } from '../../src/instances/teaching.js';
import { hooksOfTradition, storePolicy } from '../../src/traditions/index.js';
import { ART_OF_MEMORY, TRADITIONS } from '../unit/tradition-fixtures.js';
import { HOME_CELL, permissiveRuleset, stepRng, testWorld } from '../support/scenario.js';

const ARCHMAGE = 700;
const STUDENT = 701;
/** More nodes than the shipped `slotsPerMage`, all prerequisite-free and cheap. */
const NODE_COUNT = 20;

const nodes: readonly KnowledgeNode[] = Array.from({ length: NODE_COUNT }, (_, index) => ({
  nodeId: index + 1,
  tier: 1,
  prerequisites: [],
  researchCost: 1024,
  teachCost: 1024,
  scribeCost: 1024,
  rediscoveryMultiplier: 4096,
}));

const catalog = catalogOf(nodes);
/** Every fixture node sits in one permitted cell; legality is not what is under test. */
const cells = { cellOf: () => HOME_CELL };

/** The Art of Memory's own store policy, read from the shipped v1 record. */
const palace = storePolicy(hooksOfTradition(ART_OF_MEMORY, TRADITIONS).store);

/**
 * Research one node to completion, wired the way the release-claim transcript
 * wires the Art of Memory: the tradition supplies the location kind and nothing
 * else.
 */
function acquire(knowledge: KnowledgeSubsystem, nodeId: number): boolean {
  let progress = 0;
  for (let tick = 100; tick < 160; tick += 1) {
    const outcome = research({
      knowledge,
      catalog,
      cells,
      ruleset: permissiveRuleset(),
      rng: stepRng(3, tick),
      subject: ARCHMAGE,
      nodeId,
      worldTick: tick,
      progress,
      effort: 2048,
      learnRate: 1024,
      researchRate: 1024,
      rediscoveryAffinity: 1024,
      clampCounter: createRediscoveryClampCounter(),
      initialMastery: MASTERY_MAX,
      locationKind: palace.personalLocationKind,
    });
    progress = outcome.progress;
    if (outcome.completed) return true;
    if (outcome.refusal !== undefined) return false;
  }
  return false;
}

describe('the Art of Memory bounds a palace at its declared slot count', () => {
  it('reads twelve slots from the shipped v1 content', () => {
    // Not the finding — the premise. If this ever fails, the content changed and
    // the numbers below have to move with it.
    expect(palace.kind).toBe('palace');
    expect(palace.personalLocationKind).toBe(LOCATION_KIND.palace);
    expect(palace.slotsPerMage).toBe(12);
  });

  it('refuses the thirteenth acquisition, and the mage ends holding twelve', () => {
    const knowledge = new KnowledgeSubsystem(testWorld(), NODE_COUNT);

    const acquired: number[] = [];
    for (let nodeId = 1; nodeId <= NODE_COUNT; nodeId += 1) {
      if (acquire(knowledge, nodeId)) acquired.push(nodeId);
    }

    // The spec scenario, stated as an outcome: the thirteenth does not land.
    expect(acquired.length).toBe(palace.slotsPerMage);
    expect(knowledge.instancesHeldBy(ARCHMAGE)).toHaveLength(palace.slotsPerMage);
  });

  /**
   * The same bound, reached the other way. Teaching is the cheaper route into a
   * palace — one call, one instance, no accumulated progress — and it consults
   * the store policy no more than research does, so a bound that only `research`
   * honoured would still be circumventable by enrolling.
   *
   * The teacher's twenty instances are a founding grant through the subsystem's
   * own writer, which is the one legitimate way a universe starts out knowing
   * things; the *acquisition* under test is the twenty `teach()` calls.
   */
  it('bounds a palace filled by teaching too', () => {
    const knowledge = new KnowledgeSubsystem(testWorld(), NODE_COUNT);
    for (let nodeId = 1; nodeId <= NODE_COUNT; nodeId += 1) {
      knowledge.createInstance({
        nodeId,
        locationKind: LOCATION_KIND.palace,
        locationId: ARCHMAGE,
        acquiredTick: 0,
        mastery: MASTERY_MAX,
      });
    }

    let taught = 0;
    for (let nodeId = 1; nodeId <= NODE_COUNT; nodeId += 1) {
      const outcome = teach({
        knowledge,
        catalog,
        cells,
        ruleset: permissiveRuleset(),
        rng: stepRng(4, 200 + nodeId),
        teacher: ARCHMAGE,
        student: STUDENT,
        nodeId,
        worldTick: 200 + nodeId,
        locationKind: palace.personalLocationKind,
      });
      if (outcome.instance !== 0) taught += 1;
    }

    expect(taught).toBe(palace.slotsPerMage);
    expect(knowledge.instancesHeldBy(STUDENT)).toHaveLength(palace.slotsPerMage);
  });
});
