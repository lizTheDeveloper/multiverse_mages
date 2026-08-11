/*
 * Multiverse Mages — the node-existence index is derived, never stored.
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
 * Task 1.5. Two claims are being tested, and the second is the one that would
 * otherwise rot: that the index is maintained incrementally and correctly, and
 * that *nothing caches it in state* — which here means the index leaves no
 * trace in a snapshot at all.
 */

import { describe, expect, it } from 'vitest';

import { serializeState, snapshotHash } from '@mm/sim-core';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  NodeExistenceIndex,
  attachRecord,
  collectRecords,
} from '@mm/state';

import { populatedWorld } from './fixtures.js';

const NODE_COUNT = 24;

describe('the index answers "does this node exist in the universe"', () => {
  it('is empty until an instance appears, and empty again once the last one goes', () => {
    const index = new NodeExistenceIndex(NODE_COUNT);
    expect(index.exists(7)).toBe(false);

    index.add(7);
    expect(index.exists(7)).toBe(true);

    index.remove(7);
    expect(index.exists(7)).toBe(false);
  });

  it('survives losing one of several copies', () => {
    // The reason the index counts rather than flagging. A boolean cleared on
    // the first removal would report a node as lost while three copies of it
    // sat in a library — and the research system would then charge the
    // rediscovery multiplier for something nobody had forgotten.
    const index = new NodeExistenceIndex(NODE_COUNT);
    index.add(3);
    index.add(3);
    index.add(3);

    index.remove(3);
    expect(index.exists(3)).toBe(true);
    expect(index.instanceCount(3)).toBe(2);

    index.remove(3);
    index.remove(3);
    expect(index.exists(3)).toBe(false);
  });

  it('reports the single-instance nodes §7 measures as libraryDependence', () => {
    const index = new NodeExistenceIndex(NODE_COUNT);
    index.add(2);
    index.add(5);
    index.add(5);
    index.add(9);

    expect(index.singleInstanceNodes()).toEqual([2, 9]);
    expect(index.knownNodes()).toEqual([2, 5, 9]);
  });

  it('refuses a removal it has no record of rather than clamping', () => {
    // Clamping would be friendlier and would hide the divergence: the index and
    // the instances it derives from would already disagree, and the next symptom
    // would be a node reading as lost while an instance of it exists.
    const index = new NodeExistenceIndex(NODE_COUNT);
    expect(() => {
      index.remove(4);
    }).toThrow(/diverged/);
  });

  it('rejects node id 0 and ids outside the loaded content', () => {
    const index = new NodeExistenceIndex(NODE_COUNT);
    expect(() => {
      index.add(0);
    }).toThrow(RangeError);
    expect(() => {
      index.add(NODE_COUNT + 1);
    }).toThrow(RangeError);
    // Reads are total, deliberately: this is a hot path, and a bounds check
    // that threw would turn a mis-derived id into a crash mid-tick.
    expect(index.instanceCount(NODE_COUNT + 1)).toBe(0);
    expect(index.exists(0)).toBe(false);
  });
});

describe('the index is rebuilt from state, and never lives in it', () => {
  it('rebuilds to exactly what the knowledge instances say', () => {
    const { state, library } = populatedWorld();

    // Two more instances of one node, one of another.
    for (const nodeId of [7, 11, 11]) {
      const handle = state.entities.create();
      attachRecord(state, KNOWLEDGE_INSTANCE, handle, {
        nodeId,
        locationKind: LOCATION_KIND.library,
        locationId: library,
        acquiredTick: 40,
        mastery: 1024,
      });
    }

    const index = new NodeExistenceIndex(NODE_COUNT);
    index.rebuildFrom((yieldNodeId) => {
      for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) yieldNodeId(row.nodeId);
    });

    expect(index.instanceCount(7)).toBe(2);
    expect(index.instanceCount(11)).toBe(2);
    expect(index.knownNodes()).toEqual([7, 11]);
  });

  it('rebuilding twice gives the same answer, so a reload cannot drift', () => {
    const { state } = populatedWorld();
    const rebuild = (): number[] => {
      const index = new NodeExistenceIndex(NODE_COUNT);
      index.rebuildFrom((yieldNodeId) => {
        for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) yieldNodeId(row.nodeId);
      });
      return index.knownNodes();
    };
    expect(rebuild()).toEqual(rebuild());
  });

  it('leaves no trace in a snapshot, because it is not part of state', () => {
    // The claim §1.5 actually makes. A cached copy in state would be serialized
    // alongside the instances it was derived from, so any moment of
    // disagreement would be persisted and carried forward forever.
    const { state } = populatedWorld();
    const before = snapshotHash(state);
    const beforeBytes = serializeState(state).byteLength;

    const index = new NodeExistenceIndex(NODE_COUNT);
    index.rebuildFrom((yieldNodeId) => {
      for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) yieldNodeId(row.nodeId);
    });
    index.add(11);
    index.add(12);

    expect(snapshotHash(state)).toBe(before);
    expect(serializeState(state).byteLength).toBe(beforeBytes);
  });
});
