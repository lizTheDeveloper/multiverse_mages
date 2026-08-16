/*
 * Multiverse Mages — teaching stops at the institution, and `0` is one.
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
 * S2 — *"teaching has no institutional boundary, so universities cannot
 * diverge."* `universityId` already decided which library a book is shelved
 * into, how many scribe-months a mage can draw on and whether she would rather
 * be somewhere else; it decided nothing about who could teach her, and
 * `studentFor`/`teacherFor` walked every living mage in the universe.
 *
 * Four things are pinned here, and the third is the one a naive fix breaks:
 *
 * 1. a pair from different institutions can exchange nothing;
 * 2. co-affiliates still can, so the boundary is a wall and not an off switch;
 * 3. **the counterparty bound is per institution** — filtering a universe-wide
 *    lowest-32 by affiliation would have given a university whose mages all sit
 *    above slot 32 an empty faculty, and that emptiness would have been read as
 *    a knowledge result;
 * 4. `universityId === 0` is a container like any other — the unaffiliated teach
 *    each other and nobody else. See `gateway.ts`'s `teachingRosterFor` for why
 *    that ruling rather than the strict one.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle } from '@mm/sim-core';
import { createState } from '@mm/sim-core';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  MAGE_ROLE,
  attachRecord,
  captureRuleset,
  componentOf,
  createUniverse,
  defineWorldStateSchema,
} from '@mm/state';
import { KnowledgeSubsystem } from '@mm/rules-magic';

import { CoordinatingKnowledgeGateway, MAX_TEACHING_COUNTERPARTIES } from '../../src/index.js';

import {
  catalogAndCells,
  nodeFacets,
  registry,
  shippedAcquirePolicy,
  shippedStorePolicy,
  speciesTable,
} from './world-fixtures.js';

/** A universe holding the mages this list describes, in the order it gives. */
function worldOf(affiliations: readonly number[]) {
  const { catalog, cells } = catalogAndCells();
  const { speciesOf, ids } = speciesTable();
  const speciesId = ids[0] as number;
  const species = speciesOf(speciesId);
  if (species === undefined) throw new Error('the shipped registry declares no species');
  const traditionId = registry().traditions[0]?.contentId ?? 1;

  const state = createState({
    rootSeed: 7,
    schema: defineWorldStateSchema(),
    contentRevision: registry().contentRevision,
  });
  const universe = createUniverse(state, {
    permittedTechniques: 0b11111,
    permittedForms: 0b11111111111111,
    edictBudget: 0,
    traditionId,
    favor: 0,
    worship: 0,
    worshipTier: 0,
    prestige: 0,
    prestigeEarned: 0,
    terminalReason: 0,
    favorCap: 0,
    ascended: 0,
  });
  const ruleset = captureRuleset(state, universe);

  // Handles are fabricated rather than drawn from a `UNIVERSITY` row: nothing on
  // this path reads the university's own record — the boundary is a comparison
  // of two `universityId` fields and nothing more — and creating academies here
  // would put entity-creation order between the test and the thing it pins.
  const mages: EntityHandle[] = affiliations.map((universityId) => {
    const mage = state.entities.create();
    attachRecord(state, MAGE, mage, {
      speciesId,
      birthTick: 0,
      roleId: MAGE_ROLE.researcher,
      universityId,
      curiosity: species.curiosity,
      ambition: 1024,
      caution: 1024,
      vigor: 1024,
      maxVigor: 1024,
      alive: 1,
    });
    return mage;
  });

  const knowledge = KnowledgeSubsystem.fromState(state, catalog.nodeCount);
  const build = (): CoordinatingKnowledgeGateway =>
    new CoordinatingKnowledgeGateway({
      state,
      knowledge,
      catalog,
      cells,
      facets: nodeFacets(),
      ruleset,
      ratesOf: () => ({
        learnRate: species.learnRate,
        rediscoveryAffinity: species.rediscoveryAffinity,
        depthCeiling: species.depthCeiling,
        scribeAffinity: species.scribeAffinity,
      }),
      store: shippedStorePolicy(traditionId),
      acquire: shippedAcquirePolicy(traditionId),
    });

  /** Gives a mage a node at full mastery — teachable by any threshold. */
  const teach = (mage: EntityHandle, nodeId: number): void => {
    const instance = state.entities.create();
    attachRecord(state, KNOWLEDGE_INSTANCE, instance, {
      nodeId,
      locationKind: LOCATION_KIND.mind,
      locationId: mage,
      acquiredTick: 0,
      mastery: 1024,
    });
    knowledge.rebuild();
  };

  return { state, mages, build, teach };
}

/** A tier-1 node the shipped ruleset permits, from the frontier itself. */
function someTeachableNode(gateway: CoordinatingKnowledgeGateway, mage: EntityHandle): number {
  const target = gateway.researchFrontier(mage, 1)[0];
  if (target === undefined) throw new Error('the shipped content offers no researchable node');
  return target.nodeId;
}

describe('teaching stops at the institution', () => {
  it('refuses a pair from different universities the lesson it would otherwise admit', () => {
    // Two mages, two academies. The teacher holds the node at full mastery and
    // the student does not, which is every condition for a lesson except one.
    const { mages, build, teach } = worldOf([11, 22]);
    const [teacher, student] = mages as [EntityHandle, EntityHandle];
    const node = someTeachableNode(build(), student);
    teach(teacher, node);

    const gateway = build();
    expect(gateway.canTeach(teacher, node)).toBe(true);
    expect(gateway.knows(student, node)).toBe(false);

    expect(gateway.teachableTo(teacher, student)).toBeUndefined();
    expect(gateway.studentFor(teacher, node)).toBeUndefined();
    expect(gateway.teacherFor(student, node)).toBeUndefined();
  });

  it('admits the same lesson once the two share an institution', () => {
    const { mages, build, teach } = worldOf([11, 11]);
    const [teacher, student] = mages as [EntityHandle, EntityHandle];
    const node = someTeachableNode(build(), student);
    teach(teacher, node);

    const gateway = build();
    expect(gateway.teachableTo(teacher, student)).toBe(node);
    expect(gateway.studentFor(teacher, node)).toBe(student);
    expect(gateway.teacherFor(student, node)).toBe(teacher);
  });

  it('treats the unaffiliated as one open pool rather than as a crowd of hermits', () => {
    // The ruling, pinned. `0` is an id and the rule is `same id teaches same id`,
    // so two unaffiliated mages exchange knowledge freely — and neither of them
    // can reach into an academy, nor an academy into them. The strict
    // alternative would be an off switch: every mage promoted after founding is
    // created unaffiliated, so a strict rule puts almost the whole population in
    // a pool of one.
    const { mages, build, teach } = worldOf([0, 0, 11]);
    const [wanderer, other, scholar] = mages as [EntityHandle, EntityHandle, EntityHandle];
    const node = someTeachableNode(build(), other);
    teach(wanderer, node);

    const gateway = build();
    expect(gateway.teachableTo(wanderer, other)).toBe(node);
    expect(gateway.teachableTo(wanderer, scholar)).toBeUndefined();
    expect(gateway.studentFor(wanderer, node)).toBe(other);
  });

  it('bounds the counterparty roster per institution, not per universe', () => {
    // The regression a filter-the-global-32 fix would have shipped. Academy 11
    // fills every one of the first `MAX_TEACHING_COUNTERPARTIES` mage slots;
    // academy 22's two mages come after all of them. Under a universe-wide bound
    // neither of the pair is on the roster at all, and academy 22 would have had
    // an empty faculty for a reason no rule states.
    const affiliations = [
      ...Array.from({ length: MAX_TEACHING_COUNTERPARTIES }, () => 11),
      22,
      22,
    ];
    const { mages, build, teach } = worldOf(affiliations);
    const teacher = mages[MAX_TEACHING_COUNTERPARTIES] as EntityHandle;
    const student = mages[MAX_TEACHING_COUNTERPARTIES + 1] as EntityHandle;
    const node = someTeachableNode(build(), student);
    teach(teacher, node);

    const gateway = build();
    expect(gateway.teachingRosterFor(teacher)).toEqual([teacher, student]);
    expect(gateway.studentFor(teacher, node)).toBe(student);
    expect(gateway.teacherFor(student, node)).toBe(teacher);

    // And the bound still binds, on the institution that is over it.
    const crowded = mages[0] as EntityHandle;
    expect(gateway.teachingRosterFor(crowded)).toHaveLength(MAX_TEACHING_COUNTERPARTIES);
  });

  it('leaves a dead mage off every roster', () => {
    const { state, mages, build } = worldOf([11, 11]);
    const [teacher, student] = mages as [EntityHandle, EntityHandle];
    // `alive` is the other field the roster scan reads, and it is read on the
    // same pass as affiliation — so a dead co-affiliate must fall out of the
    // group rather than out of a later filter.
    componentOf(state, MAGE).set(student, 'alive', 0);

    expect(build().teachingRosterFor(teacher)).toEqual([teacher]);
  });
});
