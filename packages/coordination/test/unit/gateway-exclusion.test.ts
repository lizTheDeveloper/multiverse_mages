/*
 * Multiverse Mages — an excluded node never appears as a candidate at all.
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
 * `docs/design/compositional-content.md` §3.2 puts the enforcement seam at
 * "candidate feasibility... so that an excluded node never appears as a
 * candidate at all." `gateway.ts`'s `researchFrontier` and `#admitsLesson`
 * (which `teachableTo`, `studentFor` and `teacherFor` all route through) are
 * that seam; `exclusion.test.ts` in `@mm/rules-magic` already covers the
 * predicate itself and the acquisition-time refusal in depth, so this file
 * only proves the candidate-list half: a mage never sees an excluded node on
 * her frontier or her teaching lists, whatever the acquisition-point checks
 * would separately have refused.
 *
 * Synthetic throughout — a hand-built `NodeCatalog` and `TrackCatalog`, a
 * `Ruleset` built directly rather than through `@mm/content`, and `store`/
 * `acquire` policies with the shape `standard` resolves to. Nothing here
 * loads the shipped registry, so nothing here is affected by its current
 * state.
 */

import { describe, expect, it } from 'vitest';

import { createState } from '@mm/sim-core';
import { LOCATION_KIND, cellIdAt, defineWorldStateSchema } from '@mm/state';
import type { Ruleset } from '@mm/state';
import { KnowledgeSubsystem, catalogOf, closeAntirequisites } from '@mm/rules-magic';
import type { KnowledgeNode, StorePolicy, AcquirePolicy } from '@mm/rules-magic';
import type { TrackCatalog } from '@mm/rules-magic';

import { CoordinatingKnowledgeGateway } from '../../src/gateway.js';
import { UNKNOWN_NODE_FACETS } from '../../src/node-facets.js';

const MAGE_A = 4096;
const STUDENT = 4097;
const TEACHER = 4098;

const CELL = cellIdAt(0, 0);
const RULESET: Ruleset = { permittedTechniques: 0b1, permittedForms: 0b1, edicts: [] };

const STORE: StorePolicy = {
  kind: 'standard',
  holdableLocationKinds: [LOCATION_KIND.mind],
  personalLocationKind: LOCATION_KIND.mind,
  slotsPerMage: 0,
  scribingAvailable: true,
  lootableAt: () => true,
  transferableAt: () => false,
  burnableAt: () => false,
  perishesWithHolder: [LOCATION_KIND.mind],
  libraryDepthCoefficient: 0,
};

const ACQUIRE: AcquirePolicy = {
  kind: 'standard',
  researchCost: (authored) => authored,
  teachCost: (authored) => authored,
  initialMastery: 0,
  stolenMastery: 0,
};

const RATES = { learnRate: 1024, rediscoveryAffinity: 1024, depthCeiling: 7, scribeAffinity: 1024 };

function node(overrides: Partial<KnowledgeNode> & { nodeId: number }): KnowledgeNode {
  return {
    tier: 1,
    prerequisites: [],
    researchCost: 4096,
    teachCost: 1024,
    scribeCost: 2048,
    rediscoveryMultiplier: 4096,
    ...overrides,
  };
}

function buildGateway(nodes: readonly KnowledgeNode[], tracks: TrackCatalog | undefined) {
  // `catalogFromRegistry` always closes antirequisites over both directions
  // before anything downstream sees the catalog; a hand-built fixture must do
  // the same to be a faithful stand-in for it.
  const catalog = catalogOf(closeAntirequisites(nodes));
  const state = createState({ rootSeed: 3, schema: defineWorldStateSchema() });
  const knowledge = new KnowledgeSubsystem(state, catalog.nodeCount);
  const gateway = new CoordinatingKnowledgeGateway({
    state,
    knowledge,
    catalog,
    cells: { cellOf: () => CELL },
    facets: () => UNKNOWN_NODE_FACETS,
    ruleset: RULESET,
    ratesOf: () => RATES,
    store: STORE,
    acquire: ACQUIRE,
    tracks,
  });
  return { knowledge, gateway };
}

function grant(knowledge: KnowledgeSubsystem, subject: number, nodeId: number): void {
  knowledge.createInstance({
    nodeId,
    locationKind: LOCATION_KIND.mind,
    locationId: subject,
    acquiredTick: 0,
    mastery: 1024,
  });
}

describe('researchFrontier never offers an excluded node as a candidate', () => {
  const TRACK_SEALED = 1;
  const TRACK_OPEN = 2;
  const SEALED_1 = 10;
  const OPEN_1 = 20;
  const NEUTRAL = 30;

  const tracks: TrackCatalog = {
    excludesOf: (trackId) => (trackId === TRACK_OPEN ? [{ trackId: TRACK_SEALED, threshold: 1 }] : []),
  };

  it('drops the excluded node from the frontier once the mage holds the blocking track', () => {
    const { knowledge, gateway } = buildGateway(
      [
        node({ nodeId: SEALED_1, trackId: TRACK_SEALED }),
        node({ nodeId: OPEN_1, trackId: TRACK_OPEN }),
        node({ nodeId: NEUTRAL }),
      ],
      tracks,
    );
    grant(knowledge, MAGE_A, SEALED_1);

    const frontier = gateway.researchFrontier(MAGE_A, 16);
    const offered = frontier.map((target) => target.nodeId);

    expect(offered).toContain(NEUTRAL);
    expect(offered).not.toContain(OPEN_1);
  });

  it('offers it before the threshold is reached', () => {
    const { gateway } = buildGateway(
      [node({ nodeId: SEALED_1, trackId: TRACK_SEALED }), node({ nodeId: OPEN_1, trackId: TRACK_OPEN })],
      tracks,
    );
    const frontier = gateway.researchFrontier(MAGE_A, 16);
    expect(frontier.map((target) => target.nodeId)).toContain(OPEN_1);
  });

  it('drops a node with a held antirequisite too', () => {
    const X = 40;
    const Y = 41;
    const { knowledge, gateway } = buildGateway(
      [node({ nodeId: X, antirequisites: [Y] }), node({ nodeId: Y })],
      undefined,
    );
    grant(knowledge, MAGE_A, X);
    const offered = gateway.researchFrontier(MAGE_A, 16).map((target) => target.nodeId);
    expect(offered).not.toContain(Y);
  });
});

describe('the teaching seam never offers a pairing the student is excluded from', () => {
  const TRACK_SEALED = 1;
  const TRACK_OPEN = 2;
  const SEALED_1 = 10;
  const OPEN_1 = 20;

  const tracks: TrackCatalog = {
    excludesOf: (trackId) => (trackId === TRACK_OPEN ? [{ trackId: TRACK_SEALED, threshold: 1 }] : []),
  };

  it('teachableTo returns undefined for the excluded node', () => {
    const { knowledge, gateway } = buildGateway(
      [node({ nodeId: SEALED_1, trackId: TRACK_SEALED }), node({ nodeId: OPEN_1, trackId: TRACK_OPEN })],
      tracks,
    );
    grant(knowledge, TEACHER, OPEN_1);
    grant(knowledge, STUDENT, SEALED_1);

    expect(gateway.teachableTo(TEACHER, STUDENT)).toBeUndefined();
  });

  it('studentFor and teacherFor agree: the pairing never forms', () => {
    const { knowledge, gateway } = buildGateway(
      [node({ nodeId: SEALED_1, trackId: TRACK_SEALED }), node({ nodeId: OPEN_1, trackId: TRACK_OPEN })],
      tracks,
    );
    grant(knowledge, TEACHER, OPEN_1);
    grant(knowledge, STUDENT, SEALED_1);

    expect(gateway.studentFor(TEACHER, OPEN_1)).toBeUndefined();
    expect(gateway.teacherFor(STUDENT, OPEN_1)).toBeUndefined();
  });

  it('teachableTo still offers the node to an uncommitted student', () => {
    const { knowledge, gateway } = buildGateway(
      [node({ nodeId: SEALED_1, trackId: TRACK_SEALED }), node({ nodeId: OPEN_1, trackId: TRACK_OPEN })],
      tracks,
    );
    grant(knowledge, TEACHER, OPEN_1);

    expect(gateway.teachableTo(TEACHER, STUDENT)).toBe(OPEN_1);
  });
});
