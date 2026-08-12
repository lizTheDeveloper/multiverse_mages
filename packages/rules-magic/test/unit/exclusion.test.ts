/*
 * Multiverse Mages — the two exclusion constructs, and the acceptance
 * criterion they exist for.
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
 * Every fixture here is synthetic — hand-built `KnowledgeNode`s and a
 * hand-built `TrackCatalog` — never the shipped v1 content. Two reasons: zero
 * shipped nodes declare `track` or `antirequisites` yet (this workstream lands
 * ahead of the content that uses it), and `@mm/content`'s `NodeRecord` does not
 * expose either field to `catalogFromRegistry` yet either — see the note atop
 * `exclusion.ts`. So there is nothing here a golden fixture or a balance
 * baseline could move.
 */

import { describe, expect, it } from 'vitest';

import { LOCATION_KIND } from '@mm/state';
import { createRediscoveryClampCounter } from '@mm/primitives';

import type { KnowledgeNode } from '../../src/instances/catalog.js';
import { catalogOf } from '../../src/instances/catalog.js';
import {
  acquisitionExclusion,
  closeAntirequisites,
  heldTrackCount,
} from '../../src/instances/exclusion.js';
import type { TrackCatalog } from '../../src/instances/exclusion.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import type { ResearchInputs } from '../../src/instances/research.js';
import { research } from '../../src/instances/research.js';
import type { TeachingInputs } from '../../src/instances/teaching.js';
import { teach } from '../../src/instances/teaching.js';
import {
  HOME_CELL,
  OTHER_CELL,
  interdicting,
  permissiveRuleset,
  stepRng,
  testWorld,
} from '../support/scenario.js';

const TEACHER = 4096;
const STUDENT = 4097;
const MAGE_A = 5001;
const MAGE_B = 5002;

/** Every node in this file lives here unless a test says otherwise. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the fixture must match `(nodeId) => number`.
function cellOf(_nodeId: number): number {
  return HOME_CELL;
}
const testCells = { cellOf };

function fixture(nodeCount: number): KnowledgeSubsystem {
  return new KnowledgeSubsystem(testWorld(), nodeCount);
}

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

function researchInputs(
  knowledge: KnowledgeSubsystem,
  catalog: ReturnType<typeof catalogOf>,
  overrides: Partial<ResearchInputs> = {},
): ResearchInputs {
  return {
    knowledge,
    catalog,
    cells: testCells,
    ruleset: permissiveRuleset(),
    rng: stepRng(11, 3),
    subject: TEACHER,
    nodeId: 0,
    worldTick: 3,
    progress: 0,
    effort: 0,
    learnRate: 1024,
    researchRate: 1024,
    rediscoveryAffinity: 1024,
    clampCounter: createRediscoveryClampCounter(),
    ...overrides,
  };
}

function teachInputs(
  knowledge: KnowledgeSubsystem,
  catalog: ReturnType<typeof catalogOf>,
  overrides: Partial<TeachingInputs> = {},
): TeachingInputs {
  return {
    knowledge,
    catalog,
    cells: testCells,
    ruleset: permissiveRuleset(),
    rng: stepRng(11, 4),
    teacher: TEACHER,
    student: STUDENT,
    nodeId: 0,
    worldTick: 3,
    ...overrides,
  };
}

/** Directly creates a held mind instance, bypassing `research`/`teach`. */
function grant(knowledge: KnowledgeSubsystem, subject: number, nodeId: number, mastery = 1024): void {
  knowledge.createInstance({
    nodeId,
    locationKind: LOCATION_KIND.mind,
    locationId: subject,
    acquiredTick: 0,
    mastery,
  });
}

describe('two mages in one universe end up holding incomparable sets (primary acceptance criterion)', () => {
  // `compositional-content.md` §2: "two mages holding incomparable sets are
  // not the same mage at different speeds." Threshold 1 on both tracks —
  // committing to either school forecloses the other on first contact, which
  // is the sharpest version of the claim: the mage who researches the first
  // warden node can never subsequently hold a single thief node, and vice
  // versa, however long either of them lives.
  const TRACK_WARDEN = 900;
  const TRACK_THIEF = 901;
  const WARDEN_1 = 910;
  const WARDEN_2 = 911;
  const WARDEN_3 = 912;
  const THIEF_1 = 920;
  const THIEF_2 = 921;
  const THIEF_3 = 922;

  const tracks: TrackCatalog = {
    excludesOf: (trackId) => {
      if (trackId === TRACK_WARDEN) return [{ trackId: TRACK_THIEF, threshold: 1 }];
      if (trackId === TRACK_THIEF) return [{ trackId: TRACK_WARDEN, threshold: 1 }];
      return [];
    },
  };

  const catalog = catalogOf([
    node({ nodeId: WARDEN_1, trackId: TRACK_WARDEN }),
    node({ nodeId: WARDEN_2, trackId: TRACK_WARDEN }),
    node({ nodeId: WARDEN_3, trackId: TRACK_WARDEN }),
    node({ nodeId: THIEF_1, trackId: TRACK_THIEF }),
    node({ nodeId: THIEF_2, trackId: TRACK_THIEF }),
    node({ nodeId: THIEF_3, trackId: TRACK_THIEF }),
  ]);

  it('builds, by construction, two held sets neither of which contains the other', () => {
    const knowledge = fixture(1000);

    // Mage A commits to the warden line; mage B, to the thief line — each on
    // her very first acquisition.
    grant(knowledge, MAGE_A, WARDEN_1);
    grant(knowledge, MAGE_B, THIEF_1);

    // Each of them goes on to acquire the rest of her own track. If
    // exclusion were merely advisory, nothing below would stop her from
    // reaching into the other track too.
    for (const nodeId of [WARDEN_2, WARDEN_3]) {
      expect(
        acquisitionExclusion(knowledge, catalog, tracks, MAGE_A, catalog.node(nodeId) as KnowledgeNode),
      ).toBeUndefined();
      grant(knowledge, MAGE_A, nodeId);
    }
    for (const nodeId of [THIEF_2, THIEF_3]) {
      expect(
        acquisitionExclusion(knowledge, catalog, tracks, MAGE_B, catalog.node(nodeId) as KnowledgeNode),
      ).toBeUndefined();
      grant(knowledge, MAGE_B, nodeId);
    }

    // Every thief node is refused for A, and every warden node is refused for
    // B — not merely unattempted. This is the difference between "she never
    // got around to it" and "she structurally cannot."
    for (const nodeId of [THIEF_1, THIEF_2, THIEF_3]) {
      const refusal = acquisitionExclusion(
        knowledge,
        catalog,
        tracks,
        MAGE_A,
        catalog.node(nodeId) as KnowledgeNode,
      );
      expect(refusal?.reason).toBe('track-excluded');
    }
    for (const nodeId of [WARDEN_1, WARDEN_2, WARDEN_3]) {
      const refusal = acquisitionExclusion(
        knowledge,
        catalog,
        tracks,
        MAGE_B,
        catalog.node(nodeId) as KnowledgeNode,
      );
      expect(refusal?.reason).toBe('track-excluded');
    }

    const heldByA = new Set(knowledge.heldNodeIdsOf(MAGE_A));
    const heldByB = new Set(knowledge.heldNodeIdsOf(MAGE_B));

    expect(heldByA).toEqual(new Set([WARDEN_1, WARDEN_2, WARDEN_3]));
    expect(heldByB).toEqual(new Set([THIEF_1, THIEF_2, THIEF_3]));

    // The acceptance criterion itself: neither set is a subset of the other.
    const aSubsetOfB = [...heldByA].every((id) => heldByB.has(id));
    const bSubsetOfA = [...heldByB].every((id) => heldByA.has(id));
    expect(aSubsetOfB).toBe(false);
    expect(bSubsetOfA).toBe(false);
  });
});

describe('node antirequisites (compositional-content.md §3.2)', () => {
  const X = 10;
  const Y = 11;
  const Z = 12;

  // Declared on one side only — `X` names `Y`, `Y` names nothing — exactly
  // what the schema comment permits ("declaring it on one side is enough").
  const catalog = catalogOf(
    closeAntirequisites([
      node({ nodeId: X, antirequisites: [Y] }),
      node({ nodeId: Y }),
      node({ nodeId: Z }),
    ]),
  );

  it('closes the declared side over both directions at catalog build time', () => {
    expect(catalog.node(X)?.antirequisites).toEqual([Y]);
    expect(catalog.node(Y)?.antirequisites).toEqual([X]);
  });

  it('blocks acquiring the excluded node once the other is held, in the declared direction', () => {
    const knowledge = fixture(100);
    grant(knowledge, TEACHER, X);
    const refusal = acquisitionExclusion(
      knowledge,
      catalog,
      undefined,
      TEACHER,
      catalog.node(Y) as KnowledgeNode,
    );
    expect(refusal).toEqual({
      reason: 'antirequisite-held',
      nodeId: Y,
      antirequisiteId: X,
      subject: TEACHER,
    });
  });

  it('blocks the reverse direction too, which nobody declared directly', () => {
    const knowledge = fixture(100);
    grant(knowledge, TEACHER, Y);
    const refusal = acquisitionExclusion(
      knowledge,
      catalog,
      undefined,
      TEACHER,
      catalog.node(X) as KnowledgeNode,
    );
    expect(refusal?.reason).toBe('antirequisite-held');
  });

  it('does not block an unrelated node', () => {
    const knowledge = fixture(100);
    grant(knowledge, TEACHER, X);
    expect(
      acquisitionExclusion(knowledge, catalog, undefined, TEACHER, catalog.node(Z) as KnowledgeNode),
    ).toBeUndefined();
  });

  it('research() refuses with antirequisite-held at the acquisition point', () => {
    const knowledge = fixture(100);
    grant(knowledge, TEACHER, X);
    const outcome = research(
      researchInputs(knowledge, catalog, { nodeId: Y, subject: TEACHER, progress: 4096, effort: 4096 }),
    );
    expect(outcome.refusal?.reason).toBe('antirequisite-held');
    expect(outcome.completed).toBe(false);
  });
});

describe('track exclusion at threshold (compositional-content.md §3.2)', () => {
  const TRACK_SEALED = 30;
  const TRACK_OPEN = 31;
  const SEALED_1 = 40;
  const SEALED_2 = 41;
  const OPEN_1 = 50;

  const tracks: TrackCatalog = {
    excludesOf: (trackId) => (trackId === TRACK_OPEN ? [{ trackId: TRACK_SEALED, threshold: 2 }] : []),
  };

  const catalog = catalogOf([
    node({ nodeId: SEALED_1, trackId: TRACK_SEALED }),
    node({ nodeId: SEALED_2, trackId: TRACK_SEALED }),
    node({ nodeId: OPEN_1, trackId: TRACK_OPEN }),
  ]);

  it('a mage below the threshold may still acquire the excluded track', () => {
    const knowledge = fixture(100);
    grant(knowledge, TEACHER, SEALED_1);
    expect(heldTrackCount(catalog, knowledge.heldNodeIdsOf(TEACHER), TRACK_SEALED)).toBe(1);
    expect(
      acquisitionExclusion(knowledge, catalog, tracks, TEACHER, catalog.node(OPEN_1) as KnowledgeNode),
    ).toBeUndefined();
  });

  it('a mage at the threshold is refused, naming the blocking track', () => {
    const knowledge = fixture(100);
    grant(knowledge, TEACHER, SEALED_1);
    grant(knowledge, TEACHER, SEALED_2);
    expect(heldTrackCount(catalog, knowledge.heldNodeIdsOf(TEACHER), TRACK_SEALED)).toBe(2);
    const refusal = acquisitionExclusion(
      knowledge,
      catalog,
      tracks,
      TEACHER,
      catalog.node(OPEN_1) as KnowledgeNode,
    );
    expect(refusal).toEqual({
      reason: 'track-excluded',
      nodeId: OPEN_1,
      trackId: TRACK_OPEN,
      excludedByTrackId: TRACK_SEALED,
      threshold: 2,
      held: 2,
      subject: TEACHER,
    });
  });

  it('counts distinct nodes, so a duplicate instance from theft never double-counts', () => {
    const knowledge = fixture(100);
    grant(knowledge, TEACHER, SEALED_1);
    grant(knowledge, TEACHER, SEALED_1); // a second instance of the same node
    expect(knowledge.heldNodeIdsOf(TEACHER)).toEqual([SEALED_1]);
    expect(heldTrackCount(catalog, knowledge.heldNodeIdsOf(TEACHER), TRACK_SEALED)).toBe(1);
    // Below the threshold of 2 distinct nodes, even though she holds two
    // instances.
    expect(
      acquisitionExclusion(knowledge, catalog, tracks, TEACHER, catalog.node(OPEN_1) as KnowledgeNode),
    ).toBeUndefined();
  });

  it('omitting the track catalog means nothing is excluded', () => {
    const knowledge = fixture(100);
    grant(knowledge, TEACHER, SEALED_1);
    grant(knowledge, TEACHER, SEALED_2);
    expect(
      acquisitionExclusion(knowledge, catalog, undefined, TEACHER, catalog.node(OPEN_1) as KnowledgeNode),
    ).toBeUndefined();
  });
});

describe('a universe holding a school must never block a different, uncommitted mage', () => {
  // The corrected requirement, stated as its own test: scope is the mage, and
  // only the mage. `instanceCount` is never consulted anywhere in
  // `exclusion.ts`.
  const TRACK_SEALED = 60;
  const TRACK_OPEN = 61;
  const SEALED_1 = 70;
  const OPEN_1 = 80;

  const tracks: TrackCatalog = {
    excludesOf: (trackId) => (trackId === TRACK_OPEN ? [{ trackId: TRACK_SEALED, threshold: 1 }] : []),
  };

  const catalog = catalogOf([
    node({ nodeId: SEALED_1, trackId: TRACK_SEALED }),
    node({ nodeId: OPEN_1, trackId: TRACK_OPEN }),
  ]);

  it('lets an untouched mage learn the excluded school despite the universe already holding the other', () => {
    const knowledge = fixture(100);
    // Mage A commits the *universe* to the sealed line.
    grant(knowledge, MAGE_A, SEALED_1);
    expect(knowledge.instanceCount(SEALED_1)).toBeGreaterThan(0);

    // Mage B has never touched anything. The universe-wide existence of
    // SEALED_1 must not reach her.
    expect(
      acquisitionExclusion(knowledge, catalog, tracks, MAGE_B, catalog.node(OPEN_1) as KnowledgeNode),
    ).toBeUndefined();
  });
});

describe('a commitment reopens only when she loses the blocking knowledge, never on dormancy', () => {
  const TRACK_SEALED = 60;
  const TRACK_OPEN = 61;
  const SEALED_1 = 70;
  const OPEN_1 = 80;

  const tracks: TrackCatalog = {
    excludesOf: (trackId) => (trackId === TRACK_OPEN ? [{ trackId: TRACK_SEALED, threshold: 1 }] : []),
  };

  const catalog = catalogOf([
    node({ nodeId: SEALED_1, trackId: TRACK_SEALED }),
    node({ nodeId: OPEN_1, trackId: TRACK_OPEN }),
  ]);

  it('interdicting the blocking node’s cell does not reopen the excluded track', () => {
    const knowledge = fixture(100);
    grant(knowledge, TEACHER, SEALED_1);

    // Direct check: `acquisitionExclusion` has no `ruleset` parameter at all
    // — legality cannot enter this decision even by accident.
    expect(
      acquisitionExclusion(knowledge, catalog, tracks, TEACHER, catalog.node(OPEN_1) as KnowledgeNode),
    ).toBeDefined();

    // Integrated check, through `research()`: interdict a *different* cell
    // from the target's (so the refusal cannot be mistaken for
    // `forbidden-cell`) and confirm the exclusion still fires.
    function twoCellCells(nodeId: number): number {
      return nodeId === OPEN_1 ? HOME_CELL : OTHER_CELL;
    }
    const outcome = research(
      researchInputs(knowledge, catalog, {
        nodeId: OPEN_1,
        subject: TEACHER,
        cells: { cellOf: twoCellCells },
        ruleset: interdicting(OTHER_CELL),
        tracks,
        progress: 4096,
        effort: 4096,
      }),
    );
    expect(outcome.refusal?.reason).toBe('track-excluded');
  });

  it('reopens once she actually loses the blocking instance', () => {
    const knowledge = fixture(100);
    const instance = knowledge.createInstance({
      nodeId: SEALED_1,
      locationKind: LOCATION_KIND.mind,
      locationId: TEACHER,
      acquiredTick: 0,
      mastery: 1024,
    });
    expect(
      acquisitionExclusion(knowledge, catalog, tracks, TEACHER, catalog.node(OPEN_1) as KnowledgeNode),
    ).toBeDefined();

    knowledge.destroyInstance(instance, 5);

    expect(
      acquisitionExclusion(knowledge, catalog, tracks, TEACHER, catalog.node(OPEN_1) as KnowledgeNode),
    ).toBeUndefined();
  });
});

describe('the teaching seam checks the student, never the teacher', () => {
  const TRACK_SEALED = 60;
  const TRACK_OPEN = 61;
  const SEALED_1 = 70;
  const OPEN_1 = 80;

  const tracks: TrackCatalog = {
    excludesOf: (trackId) => (trackId === TRACK_OPEN ? [{ trackId: TRACK_SEALED, threshold: 1 }] : []),
  };

  const catalog = catalogOf([
    node({ nodeId: SEALED_1, trackId: TRACK_SEALED }),
    node({ nodeId: OPEN_1, trackId: TRACK_OPEN }),
  ]);

  it('refuses a lesson the student is excluded from, even though the teacher is willing and able', () => {
    const knowledge = fixture(100);
    // The teacher knows the open school and could teach it to anybody.
    grant(knowledge, TEACHER, OPEN_1, 1024);
    // The student has already committed to the sealed school.
    grant(knowledge, STUDENT, SEALED_1);

    const outcome = teach(teachInputs(knowledge, catalog, { nodeId: OPEN_1, tracks }));
    expect(outcome.refusal?.reason).toBe('track-excluded');
    expect(outcome.instance).toBe(0);
  });

  it('a teacher holding both schools (through theft) still cannot pass the excluded one to a committed student', () => {
    const knowledge = fixture(100);
    // Reachable only through raid theft in the real game, per `exclusion.ts`'s
    // module note on the one known gap — but constructible directly here.
    grant(knowledge, TEACHER, OPEN_1, 1024);
    grant(knowledge, TEACHER, SEALED_1, 1024);
    grant(knowledge, STUDENT, SEALED_1);

    const outcome = teach(teachInputs(knowledge, catalog, { nodeId: OPEN_1, tracks }));
    expect(outcome.refusal?.reason).toBe('track-excluded');
  });

  it('permits the lesson once the student is not excluded from it', () => {
    const knowledge = fixture(100);
    grant(knowledge, TEACHER, OPEN_1, 1024);

    const outcome = teach(teachInputs(knowledge, catalog, { nodeId: OPEN_1, tracks }));
    expect(outcome.refusal).toBeUndefined();
    expect(outcome.instance).not.toBe(0);
  });
});

describe('symmetric-by-choice, isolated behind addSymmetricEdge (compositional-content.md §7)', () => {
  it('a track exclusion declared on only one side blocks in both directions', () => {
    const declaredOnlyOnSealed: TrackCatalog = {
      excludesOf: (trackId) => (trackId === 30 ? [{ trackId: 31, threshold: 1 }] : []),
    };
    // A hand-rolled symmetric wrapper, exactly what `trackCatalogFromRegistry`
    // computes from one-sided content — proving the shape a real registry
    // will produce is the shape `acquisitionExclusion` already knows how to
    // consume.
    const symmetric: TrackCatalog = {
      excludesOf: (trackId) => {
        if (trackId === 30) return declaredOnlyOnSealed.excludesOf(30);
        if (trackId === 31) return [{ trackId: 30, threshold: 1 }];
        return [];
      },
    };
    const catalog = catalogOf([node({ nodeId: 1, trackId: 30 }), node({ nodeId: 2, trackId: 31 })]);
    const knowledge = fixture(10);
    grant(knowledge, TEACHER, 1);
    expect(
      acquisitionExclusion(knowledge, catalog, symmetric, TEACHER, catalog.node(2) as KnowledgeNode)
        ?.reason,
    ).toBe('track-excluded');
  });
});
