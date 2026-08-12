/*
 * Multiverse Mages — a capability no single mage can ever hold, and the
 * acceptance test that says so end to end.
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
 * `contracts.md` §2.13, `compositional-content.md` §3.2: exclusion inverted
 * from a limitation into the reason a faculty exists. Every fixture here is
 * synthetic, the same discipline `exclusion.test.ts` uses and for the same
 * reason — the shipped v1 tracks are a balance question a sweep may retune,
 * and the claim under test is structural, not about `read-the-sealed-shelf`'s
 * particular magnitudes.
 */

import { describe, expect, it } from 'vitest';

import { LOCATION_KIND } from '@mm/state';
import type { Handle } from '@mm/state';

import type { KnowledgeNode } from '../../src/instances/catalog.js';
import { catalogOf } from '../../src/instances/catalog.js';
import { acquisitionExclusion } from '../../src/instances/exclusion.js';
import type { TrackCatalog } from '../../src/instances/exclusion.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import type {
  RitualCasterCandidate,
  RitualCastersResult,
  RitualDefinition,
} from '../../src/rituals/casters.js';
import { ritualAvailable, ritualCasters } from '../../src/rituals/casters.js';
import { testWorld } from '../support/scenario.js';

// ---------------------------------------------------------------------------
// Fixture: two mutually exclusive tracks, threshold 2 both ways — the same
// shape `read-the-sealed-shelf` and `found-the-hollow-hall` ship with.

const TRACK_A = 900;
const TRACK_B = 901;
const CLOSING_THRESHOLD = 2;

const A1 = 910;
const A2 = 911;
const A3 = 912;
const B1 = 920;
const B2 = 921;
const B3 = 922;

/** Mirrors `trackCatalogFromRegistry`'s output for a `symmetric: true` pair. */
const tracks: TrackCatalog = {
  excludesOf: (trackId) => {
    if (trackId === TRACK_A) return [{ trackId: TRACK_B, threshold: CLOSING_THRESHOLD }];
    if (trackId === TRACK_B) return [{ trackId: TRACK_A, threshold: CLOSING_THRESHOLD }];
    return [];
  },
};

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

const catalog = catalogOf([
  node({ nodeId: A1, trackId: TRACK_A }),
  node({ nodeId: A2, trackId: TRACK_A }),
  node({ nodeId: A3, trackId: TRACK_A }),
  node({ nodeId: B1, trackId: TRACK_B }),
  node({ nodeId: B2, trackId: TRACK_B }),
  node({ nodeId: B3, trackId: TRACK_B }),
]);

/**
 * "Read the Sealed Shelf", restated with fixture ids: two roles on two
 * mutually exclusive tracks, `minNodes` at the closing threshold — exactly
 * what `ritual-castable-by-one` requires of shipped content
 * (`contracts.md` §2.13).
 */
const RITUAL: RitualDefinition = {
  ritualId: 7001,
  roles: [
    { trackId: TRACK_A, minNodes: CLOSING_THRESHOLD },
    { trackId: TRACK_B, minNodes: CLOSING_THRESHOLD },
  ],
};

const UNIVERSITY_1: Handle = 5001;
const UNIVERSITY_2: Handle = 5002;

const READER: Handle = 101;
const WARDEN: Handle = 102;
const A_LONE_MAGE: Handle = 103;

function fixture(nodeCount: number): KnowledgeSubsystem {
  return new KnowledgeSubsystem(testWorld(), nodeCount);
}

/** Directly creates a held mind instance, bypassing `research`/`teach`. */
function grant(knowledge: KnowledgeSubsystem, subject: Handle, nodeId: number): void {
  knowledge.createInstance({
    nodeId,
    locationKind: LOCATION_KIND.mind,
    locationId: subject,
    acquiredTick: 0,
    mastery: 1024,
  });
}

function candidate(
  handle: Handle,
  universityId: Handle,
  alive: 0 | 1 = 1,
): RitualCasterCandidate {
  return { handle, mage: { universityId, alive } };
}

describe('a capability that no single mage can ever hold, and the universe loses it when one caster dies', () => {
  it('is available with two committed casters, unavailable the instant one of them dies, and unreachable by any one mage however much she learns', () => {
    const knowledge = fixture(1000);

    // Two mages, one university, committed to opposite tracks.
    grant(knowledge, READER, A1);
    grant(knowledge, READER, A2);
    grant(knowledge, WARDEN, B1);
    grant(knowledge, WARDEN, B2);

    const roster: RitualCasterCandidate[] = [
      candidate(READER, UNIVERSITY_1),
      candidate(WARDEN, UNIVERSITY_1),
    ];

    // --- Leg 1: available with both casters alive and affiliated. ---
    const available: RitualCastersResult = ritualCasters(RITUAL, roster, {
      university: UNIVERSITY_1,
      catalog,
      knowledge,
    });
    expect(available.refusal).toBeUndefined();
    expect(available.casters).toEqual([
      { roleIndex: 0, caster: READER },
      { roleIndex: 1, caster: WARDEN },
    ]);
    expect(ritualAvailable(RITUAL, roster, { university: UNIVERSITY_1, catalog, knowledge })).toBe(
      true,
    );

    // --- Leg 2: the reader dies. Nothing is migrated, nothing is cleaned up
    // --- — the roster simply reflects her death, the same tick it happens,
    // --- and the derived check sees it immediately.
    const rosterAfterDeath: RitualCasterCandidate[] = [
      candidate(READER, UNIVERSITY_1, 0),
      candidate(WARDEN, UNIVERSITY_1),
    ];
    const afterDeath = ritualCasters(RITUAL, rosterAfterDeath, {
      university: UNIVERSITY_1,
      catalog,
      knowledge,
    });
    expect(afterDeath.refusal).toEqual({
      reason: 'ritual-role-unfilled',
      ritualId: RITUAL.ritualId,
      roleIndex: 0,
    });
    expect(afterDeath.casters).toEqual([]);
    expect(
      ritualAvailable(RITUAL, rosterAfterDeath, { university: UNIVERSITY_1, catalog, knowledge }),
    ).toBe(false);
    // The warden alone — who still holds only her own track — cannot revive
    // the ritual either: one living committed caster is still one role short.
    expect(
      ritualCasters(RITUAL, [candidate(WARDEN, UNIVERSITY_1)], {
        university: UNIVERSITY_1,
        catalog,
        knowledge,
      }).refusal?.reason,
    ).toBe('ritual-role-unfilled');

    // --- Leg 3: the greedy-mage proof. A third mage, entirely on her own,
    // --- tries to accumulate her way to both roles by learning greedily —
    // --- exactly the "long-lived mage plus time" case the design rejects.
    // --- The *content* graph's mutual exclusion (proven at load by
    // --- `ritual-castable-by-one`), not `ritualCasters`' own bookkeeping, is
    // --- what makes this impossible: she is checked against the same
    // --- `acquisitionExclusion` every research and teaching path already
    // --- runs through, never against a ritual-specific rule.
    let heldA = 0;
    let heldB = 0;
    for (const nodeId of [A1, B1, A2, B2, A3, B3]) {
      const refusal = acquisitionExclusion(
        knowledge,
        catalog,
        tracks,
        A_LONE_MAGE,
        catalog.node(nodeId) as KnowledgeNode,
      );
      if (refusal === undefined) {
        grant(knowledge, A_LONE_MAGE, nodeId);
        if (nodeId === A1 || nodeId === A2 || nodeId === A3) heldA += 1;
        else heldB += 1;
      }
    }
    // She reached the threshold on one track and stalled one short on the
    // other — never both at once, and this holds regardless of which track
    // she pursued first (see the order-independence case below).
    expect(Math.min(heldA, heldB)).toBeLessThan(CLOSING_THRESHOLD);
    expect(Math.max(heldA, heldB)).toBeGreaterThanOrEqual(CLOSING_THRESHOLD);

    const soloResult = ritualCasters(RITUAL, [candidate(A_LONE_MAGE, UNIVERSITY_1)], {
      university: UNIVERSITY_1,
      catalog,
      knowledge,
    });
    expect(soloResult.refusal?.reason).toBe('ritual-role-unfilled');
    expect(soloResult.casters).toEqual([]);
  });

  it('cannot be reached solo regardless of which track the lone mage pursues first', () => {
    // Same proof, opposite pursuit order — the claim is "however she plays",
    // not an artifact of the order the first test happened to try.
    const knowledge = fixture(1000);
    let heldA = 0;
    let heldB = 0;
    for (const nodeId of [B1, A1, B2, A2, B3, A3]) {
      const refusal = acquisitionExclusion(
        knowledge,
        catalog,
        tracks,
        A_LONE_MAGE,
        catalog.node(nodeId) as KnowledgeNode,
      );
      if (refusal === undefined) {
        grant(knowledge, A_LONE_MAGE, nodeId);
        if (nodeId === A1 || nodeId === A2 || nodeId === A3) heldA += 1;
        else heldB += 1;
      }
    }
    expect(Math.min(heldA, heldB)).toBeLessThan(CLOSING_THRESHOLD);

    const result = ritualCasters(RITUAL, [candidate(A_LONE_MAGE, UNIVERSITY_1)], {
      university: UNIVERSITY_1,
      catalog,
      knowledge,
    });
    expect(result.refusal?.reason).toBe('ritual-role-unfilled');
  });
});

describe('ritualCasters: the supporting cases', () => {
  it('does not combine casters from different universities', () => {
    const knowledge = fixture(1000);
    grant(knowledge, READER, A1);
    grant(knowledge, READER, A2);
    grant(knowledge, WARDEN, B1);
    grant(knowledge, WARDEN, B2);

    const roster: RitualCasterCandidate[] = [
      candidate(READER, UNIVERSITY_1),
      candidate(WARDEN, UNIVERSITY_2), // a different university
    ];

    const result = ritualCasters(RITUAL, roster, { university: UNIVERSITY_1, catalog, knowledge });
    expect(result.refusal).toEqual({
      reason: 'ritual-role-unfilled',
      ritualId: RITUAL.ritualId,
      roleIndex: 1,
    });
  });

  it('does not qualify a role below minNodes', () => {
    const knowledge = fixture(1000);
    grant(knowledge, READER, A1); // one node; the role needs two
    grant(knowledge, WARDEN, B1);
    grant(knowledge, WARDEN, B2);

    const roster: RitualCasterCandidate[] = [
      candidate(READER, UNIVERSITY_1),
      candidate(WARDEN, UNIVERSITY_1),
    ];

    const result = ritualCasters(RITUAL, roster, { university: UNIVERSITY_1, catalog, knowledge });
    expect(result.refusal).toEqual({
      reason: 'ritual-role-unfilled',
      ritualId: RITUAL.ritualId,
      roleIndex: 0,
    });
  });

  it('qualifies a role exactly at minNodes, not only strictly above it', () => {
    const knowledge = fixture(1000);
    grant(knowledge, READER, A1);
    grant(knowledge, READER, A2);
    grant(knowledge, WARDEN, B1);
    grant(knowledge, WARDEN, B2);

    const roster: RitualCasterCandidate[] = [
      candidate(READER, UNIVERSITY_1),
      candidate(WARDEN, UNIVERSITY_1),
    ];

    expect(
      ritualCasters(RITUAL, roster, { university: UNIVERSITY_1, catalog, knowledge }).refusal,
    ).toBeUndefined();
  });

  it('refuses university 0, the unaffiliated sentinel, rather than treating hermits as co-located', () => {
    const knowledge = fixture(1000);
    grant(knowledge, READER, A1);
    grant(knowledge, READER, A2);
    grant(knowledge, WARDEN, B1);
    grant(knowledge, WARDEN, B2);

    const roster: RitualCasterCandidate[] = [candidate(READER, 0), candidate(WARDEN, 0)];

    const result = ritualCasters(RITUAL, roster, { university: 0, catalog, knowledge });
    expect(result.refusal).toEqual({ reason: 'ritual-no-university', ritualId: RITUAL.ritualId });
    expect(result.casters).toEqual([]);
  });

  it('is a deterministic function of the roster, independent of its input order', () => {
    const knowledge = fixture(1000);
    grant(knowledge, READER, A1);
    grant(knowledge, READER, A2);
    grant(knowledge, WARDEN, B1);
    grant(knowledge, WARDEN, B2);

    const forward: RitualCasterCandidate[] = [
      candidate(READER, UNIVERSITY_1),
      candidate(WARDEN, UNIVERSITY_1),
    ];
    const reversed = [...forward].reverse();

    const ctx = { university: UNIVERSITY_1, catalog, knowledge };
    expect(ritualCasters(RITUAL, forward, ctx)).toEqual(ritualCasters(RITUAL, reversed, ctx));
    // The input array itself is never mutated as a side effect.
    expect(reversed[0]?.handle).toBe(WARDEN);
  });
});
