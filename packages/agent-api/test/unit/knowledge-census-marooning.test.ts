/*
 * Multiverse Mages — the marooning projection, at its edges.
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
 * W26's extension to the census: the derived numbers that make a raw mastery
 * legible, and the three buckets that must never blend.
 *
 * ## Why the model here is a toy and not `rules-magic`'s
 *
 * `@mm/agent-api` may not import `@mm/rules-magic` — `contracts.md` §5 runs the
 * dependency the other way, and `module-boundaries.test.ts` enforces it — which
 * is the whole reason {@link MasteryModel} is injected rather than imported. So
 * the cases below use a four-line model with numbers written out, and they test
 * the *projection*: the bucketing, the ordering, the countdown arithmetic, and
 * what happens at each edge.
 *
 * That leaves one thing untested here, deliberately: that the numbers a caller
 * gets when it supplies `rules-magic`'s real functions are the numbers
 * `teach()` actually acts on. That claim needs a real universe and both
 * packages at once, so it is `@mm/scenario`'s
 * `knowledge-census-marooning-agreement.test.ts` — the one-implementation guard.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle, SimState } from '@mm/sim-core';
import { KNOWLEDGE_INSTANCE, LOCATION_KIND, attachRecord } from '@mm/state';
import type { MasteryModel } from '@mm/agent-api';
import { knowledgeCensus } from '@mm/agent-api';

import { firstUniverse } from './fixtures.js';

/** The shipped threshold, restated rather than imported. See the header. */
const THRESHOLD = 512;

/**
 * `rules-magic`'s curve, written out. `speciesId` 1 is the fixture's humans
 * (retention 1024, decay 8, floor 256) and 3 its dwarves (1536, 5, 384) — the
 * two the fixture actually creates.
 */
const RETENTION: Readonly<Record<number, number>> = { 1: 1024, 3: 1536 };

function model(overrides: Partial<MasteryModel> = {}): MasteryModel {
  return {
    teachThreshold: THRESHOLD,
    retentionOfSpecies: (speciesId) => RETENTION[speciesId] ?? 0,
    // floor = retention / 4, capped at full mastery; 0 when dormant.
    masteryFloor: (retention, dormant) => (dormant ? 0 : Math.min(Math.floor(retention / 4), 1024)),
    // 8 / retention in fixed point, at least one unit.
    masteryDecayPerTick: (retention) =>
      retention <= 0 ? 8 : Math.max(Math.floor((8 * 1024) / retention), 1),
    ...overrides,
  };
}

function place(
  state: SimState,
  nodeId: number,
  locationKind: number,
  locationId: number,
  mastery: number,
  acquiredTick = 1,
): EntityHandle {
  const instance = state.entities.create();
  attachRecord(state, KNOWLEDGE_INSTANCE, instance, {
    nodeId,
    locationKind,
    locationId,
    acquiredTick,
    mastery,
  });
  return instance;
}

/** The fixture ships instances of its own; these tests only read node ids they add. */
function rowFor(state: SimState, nodeId: number, mastery: MasteryModel = model()) {
  const census = knowledgeCensus(state, { mastery });
  const marooning = census.marooning;
  if (marooning === undefined) throw new Error('the census returned no marooning block');
  const row = marooning.byInstance.find((entry) => entry.nodeId === nodeId);
  if (row === undefined) throw new Error(`no held instance of node ${String(nodeId)}`);
  return row;
}

describe('the derived values a renderer must not recompute', () => {
  it('publishes the floor and the per-tick loss from the holder’s species', () => {
    const world = firstUniverse();
    const human = world.mages[0] as number;
    const dwarf = world.mages[2] as number;
    place(world.state, 801, LOCATION_KIND.mind, human, 704);
    place(world.state, 802, LOCATION_KIND.mind, dwarf, 704);

    expect(rowFor(world.state, 801)).toMatchObject({
      retention: 1024,
      floor: 256,
      decayPerTick: 8,
      mastery: 704,
      teachable: true,
    });
    expect(rowFor(world.state, 802)).toMatchObject({
      retention: 1536,
      floor: 384,
      decayPerTick: 5,
    });
  });

  it('counts down to the tick teach() refuses, which is one past the threshold', () => {
    const world = firstUniverse();
    const human = world.mages[0] as number;
    // 704 is the doc-comment's example: (704 - 512) / 8 = 24, so 25.
    place(world.state, 803, LOCATION_KIND.mind, human, 704);
    // Full mastery: (1024 - 512) / 8 = 64, so 65 — deliberately one more than
    // "ticks from 1024 to 512", because at exactly 512 she can still teach.
    place(world.state, 804, LOCATION_KIND.mind, human, 1024);

    expect(rowFor(world.state, 803).ticksToUnteachable).toBe(25);
    expect(rowFor(world.state, 804).ticksToUnteachable).toBe(65);
  });

  it('treats exactly the threshold as still teachable, with one tick left', () => {
    const world = firstUniverse();
    place(world.state, 805, LOCATION_KIND.mind, world.mages[0] as number, THRESHOLD);
    const row = rowFor(world.state, 805);
    expect(row.teachable).toBe(true);
    expect(row.marooned).toBe(false);
    expect(row.ticksToUnteachable).toBe(1);
  });

  it('reports zero ticks left for an instance already below the threshold', () => {
    const world = firstUniverse();
    place(world.state, 806, LOCATION_KIND.mind, world.mages[0] as number, THRESHOLD - 1);
    const row = rowFor(world.state, 806);
    expect(row.teachable).toBe(false);
    expect(row.marooned).toBe(true);
    expect(row.ticksToUnteachable).toBe(0);
  });

  it('says "never" when the floor sits at or above the threshold', () => {
    const world = firstUniverse();
    place(world.state, 807, LOCATION_KIND.mind, world.mages[0] as number, 1024);
    // Retention 4096 — legal under species.schema.json, unreached by v1 content.
    const generous = model({ retentionOfSpecies: () => 4096 });
    const row = rowFor(world.state, 807, generous);
    expect(row.floor).toBe(1024);
    expect(row.ticksToUnteachable).toBeNull();
    expect(row.marooned).toBe(false);
  });

  it('says "never" rather than dividing by zero if a model returns no decay', () => {
    // rules-magic's masteryDecayPerTick cannot return 0 — it is max(..., 1) —
    // so this guards a *wrong* injected model, which is the failure the
    // injection design newly makes possible.
    const world = firstUniverse();
    place(world.state, 808, LOCATION_KIND.mind, world.mages[0] as number, 1024);
    const frozen = model({ masteryDecayPerTick: () => 0 });
    expect(rowFor(world.state, 808, frozen).ticksToUnteachable).toBeNull();
  });
});

describe('the three buckets, kept apart', () => {
  it('excludes written copies: a book has mastery 0 and is not marooned', () => {
    const world = firstUniverse();
    place(world.state, 810, LOCATION_KIND.library, world.library as number, 0);
    place(world.state, 810, LOCATION_KIND.grimoire, 4242, 0);

    const marooning = knowledgeCensus(world.state, { mastery: model() }).marooning;
    expect(marooning?.byInstance.some((row) => row.nodeId === 810)).toBe(false);
    expect(marooning?.writtenInstances).toBeGreaterThanOrEqual(2);
    const node = marooning?.byNode.find((entry) => entry.nodeId === 810);
    expect(node).toEqual({ nodeId: 810, held: 0, teachable: 0, marooned: 0, condemned: 0, written: 2 });
    // Held by nobody, so nobody can teach it — and it still counts as a node
    // the universe cannot transmit, which is the honest answer.
    expect(marooning?.untransmittableNodeIds).toContain(810);
  });

  it('separates condemned from marooned: dormancy has an exit, marooning has none', () => {
    const world = firstUniverse();
    const human = world.mages[0] as number;
    place(world.state, 811, LOCATION_KIND.mind, human, 300);
    place(world.state, 812, LOCATION_KIND.mind, human, 300);
    const dormant = model({ isDormant: (nodeId) => nodeId === 811 });

    const marooning = knowledgeCensus(world.state, { mastery: dormant }).marooning;
    const condemnedRow = marooning?.byInstance.find((row) => row.nodeId === 811);
    const maroonedRow = marooning?.byInstance.find((row) => row.nodeId === 812);
    expect(condemnedRow).toMatchObject({ condemned: true, marooned: false, floor: 0 });
    expect(maroonedRow).toMatchObject({ condemned: false, marooned: true, floor: 256 });
    expect(marooning?.dormancyEvaluated).toBe(true);
  });

  it('says dormancy was not evaluated rather than reporting a zero nobody measured', () => {
    const world = firstUniverse();
    place(world.state, 813, LOCATION_KIND.mind, world.mages[0] as number, 300);
    const marooning = knowledgeCensus(world.state, { mastery: model() }).marooning;
    expect(marooning?.dormancyEvaluated).toBe(false);
    expect(marooning?.condemnedInstances).toBe(0);
  });

  it('gives an orphaned instance retention 0, the way the decay sweep does', () => {
    const world = firstUniverse();
    // A holder handle no mage row carries: world-step's retentionOf returns 0,
    // masteryFloor(0) is 0, and the instance is on its way to destruction.
    place(world.state, 814, LOCATION_KIND.mind, 99_999, 300);
    const row = rowFor(world.state, 814);
    expect(row).toMatchObject({ retention: 0, floor: 0, decayPerTick: 8, marooned: true });
  });
});

describe('the number W26 exists to produce', () => {
  it('names a node whose every copy is below the threshold, however many copies', () => {
    const world = firstUniverse();
    // Twenty copies across four mages. minRedundancy is 20, unwritten says
    // nothing, singleLocation says nothing — and not one of them can teach.
    for (let i = 0; i < 20; i += 1) {
      place(world.state, 820, LOCATION_KIND.mind, world.mages[i % 4] as number, 256);
    }
    const census = knowledgeCensus(world.state, { mastery: model() });
    expect(census.fragileNodeIds).not.toContain(820);
    expect(census.singleLocationNodeIds).not.toContain(820);
    expect(census.marooning?.untransmittableNodeIds).toContain(820);
    expect(census.marooning?.byNode.find((n) => n.nodeId === 820)).toMatchObject({
      held: 20,
      teachable: 0,
      marooned: 20,
    });
  });

  it('does not call a node untransmittable while one copy can still teach', () => {
    const world = firstUniverse();
    for (let i = 0; i < 19; i += 1) {
      place(world.state, 821, LOCATION_KIND.mind, world.mages[i % 4] as number, 256);
    }
    place(world.state, 821, LOCATION_KIND.mind, world.mages[0] as number, THRESHOLD);
    const marooning = knowledgeCensus(world.state, { mastery: model() }).marooning;
    expect(marooning?.untransmittableNodeIds).not.toContain(821);
    expect(marooning?.teachableNodeIds).toContain(821);
  });

  it('partitions every held node into teachable or untransmittable, never both', () => {
    const world = firstUniverse();
    place(world.state, 822, LOCATION_KIND.mind, world.mages[0] as number, 900);
    place(world.state, 823, LOCATION_KIND.mind, world.mages[1] as number, 100);
    const census = knowledgeCensus(world.state, { mastery: model() });
    const marooning = census.marooning;
    const teachable = new Set(marooning?.teachableNodeIds ?? []);
    const untransmittable = new Set(marooning?.untransmittableNodeIds ?? []);
    expect(teachable.size + untransmittable.size).toBe(census.nodesHeld);
    for (const nodeId of teachable) expect(untransmittable.has(nodeId)).toBe(false);
  });

  it('accounts for every instance exactly once across held, written and malformed', () => {
    const world = firstUniverse();
    place(world.state, 824, LOCATION_KIND.mind, world.mages[0] as number, 900);
    place(world.state, 824, LOCATION_KIND.library, world.library as number, 0);
    // Kind 0 is §0's null — a malformed record, not a fifth location.
    place(world.state, 824, 0, 7, 900);

    const census = knowledgeCensus(world.state, { mastery: model() });
    const m = census.marooning;
    expect((m?.heldInstances ?? 0) + (m?.writtenInstances ?? 0) + (m?.malformedInstances ?? 0)).toBe(
      census.instanceTotal,
    );
    expect(m?.malformedInstances).toBe(1);
  });
});

describe('ordering and opt-in', () => {
  it('returns held instances ascending by handle, never row order', () => {
    const world = firstUniverse();
    const handles: number[] = [];
    for (const nodeId of [840, 841, 842, 843]) {
      handles.push(place(world.state, nodeId, LOCATION_KIND.mind, world.mages[0] as number, 600));
    }
    // Destroy a middle one so the backing rows are no longer in handle order.
    world.state.entities.destroy(handles[1] as EntityHandle);
    place(world.state, 844, LOCATION_KIND.mind, world.mages[0] as number, 600);

    const rows = knowledgeCensus(world.state, { mastery: model() }).marooning?.byInstance ?? [];
    const order = rows.map((row) => row.instanceHandle);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('omits the block entirely, and changes nothing else, when no model is supplied', () => {
    const world = firstUniverse();
    place(world.state, 850, LOCATION_KIND.mind, world.mages[0] as number, 300);

    const plain = knowledgeCensus(world.state);
    const withModel = knowledgeCensus(world.state, { mastery: model() });
    expect(plain.marooning).toBeUndefined();
    expect(withModel.marooning).toBeDefined();

    // Every pre-W26 field is untouched by asking for the extra one.
    expect({ ...withModel, marooning: undefined }).toEqual({ ...plain, marooning: undefined });
  });

  it('republishes the threshold it judged against, so a view need not restate it', () => {
    const world = firstUniverse();
    place(world.state, 851, LOCATION_KIND.mind, world.mages[0] as number, 300);
    const marooning = knowledgeCensus(world.state, { mastery: model() }).marooning;
    expect(marooning?.teachThreshold).toBe(THRESHOLD);
  });
});
