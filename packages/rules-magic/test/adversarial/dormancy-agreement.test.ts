/*
 * Multiverse Mages — adversarial: do the four dormancy checks ever disagree?
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
 * Six agents, in isolation, each wrote a call to `permits(ruleset,
 * cellOf(nodeId))` to decide dormancy: `dormancy.ts`'s `isDormant`,
 * `effects/gather.ts`'s inline check, `instances/decay.ts`'s inline check, and
 * `instances/library-depth.ts`'s inline check. `docs/design/contracts.md` §1.1
 * gives `permits()` exactly one meaning and `magic-grid`'s spec.md
 * ("Requirement: Dormancy in a forbidden cell") requires dormancy to be
 * *derived* as `!permits(...)` everywhere, never a second implementation.
 *
 * This is a differential test over the real shipped v1 content, run against
 * `isDormant` as the reference: for a node whose cell is interdicted, every one
 * of the four call sites must agree that the node is unavailable, and for the
 * same node with the cell permitted, all four must agree it is available.
 *
 * Unlike the other files in this directory, **this test is expected to pass.**
 * It is included because the task brief calls this seam out by name as the
 * most likely place for four isolated authors to drift, and a green result
 * here is worth recording as verified robustness (category b in the report),
 * not skipped because it did not turn something up.
 */

import { describe, expect, it } from 'vitest';

import { loadContent, shippedContentSource } from '@mm/content';
import { TIME_MODE } from '@mm/sim-core';
import { LOCATION_KIND } from '@mm/state';

import { isDormant } from '../../src/dormancy.js';
import { MagicGrid } from '../../src/grid.js';
import { gatherEffects } from '../../src/effects/index.js';
import { catalogFromRegistry } from '../../src/instances/catalog.js';
import { decayHeldKnowledge } from '../../src/instances/decay.js';
import { libraryDepth } from '../../src/instances/library-depth.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import { testWorld } from '../support/scenario.js';
import {
  cellIdOfNode,
  mindInstance,
  permissiveRuleset,
  rulesetInterdicting,
  worldActiveNodesInDistinctCells,
} from '../unit/effect-fixtures.js';

const HOLDER = 900;
const LIBRARY = 901;
const NODE_COUNT_UPPER_BOUND = 100_000; // generous; only sizes the existence index

describe('the four dormancy call sites agree on a real, interdicted v1 node', () => {
  it('isDormant, effect gathering, decay, and library depth all treat the node consistently', () => {
    const registry = loadContent(shippedContentSource());
    const grid = MagicGrid.from(registry);
    const chosen = worldActiveNodesInDistinctCells(registry, 1);
    const nodeId = chosen[0];
    expect(nodeId).toBeDefined();
    if (nodeId === undefined) throw new Error('unreachable: asserted above');
    const cellId = cellIdOfNode(registry, nodeId);

    const permitted = permissiveRuleset();
    const interdicted = rulesetInterdicting(cellId);
    const cells = { cellOf: (id: number): number => cellIdOfNode(registry, id) };

    // Reference: dormancy.ts's isDormant.
    expect(isDormant(grid, permitted, nodeId)).toBe(false);
    expect(isDormant(grid, interdicted, nodeId)).toBe(true);

    // effects/gather.ts's inline permits() check.
    const contributionsPermitted = gatherEffects([mindInstance(nodeId)], {
      registry,
      ruleset: permitted,
      mode: TIME_MODE.world,
      cellOf: (id) => cellIdOfNode(registry, id),
    });
    const contributionsInterdicted = gatherEffects([mindInstance(nodeId)], {
      registry,
      ruleset: interdicted,
      mode: TIME_MODE.world,
      cellOf: (id) => cellIdOfNode(registry, id),
    });
    expect(contributionsPermitted.length).toBeGreaterThan(0);
    expect(contributionsInterdicted).toEqual([]);

    // instances/decay.ts's inline permits() check, via its `dormant` branch.
    const decayKnowledge = new KnowledgeSubsystem(
      testWorld(),
      NODE_COUNT_UPPER_BOUND,
    );
    decayKnowledge.createInstance({
      nodeId,
      locationKind: LOCATION_KIND.mind,
      locationId: HOLDER,
      acquiredTick: 0,
      mastery: 100,
    });
    const lossUnderPermitted = decayHeldKnowledge({
      knowledge: decayKnowledge,
      cells,
      ruleset: permitted,
      elapsedTicks: 1,
      worldTick: 1,
      retentionOf: () => 1024,
    });
    // Non-dormant: floored, never destroyed by a single ordinary tick.
    expect(lossUnderPermitted).toEqual([]);
    expect(decayKnowledge.exists(nodeId)).toBe(true);

    const interdictedKnowledge = new KnowledgeSubsystem(
      testWorld(),
      NODE_COUNT_UPPER_BOUND,
    );
    interdictedKnowledge.createInstance({
      nodeId,
      locationKind: LOCATION_KIND.mind,
      locationId: HOLDER,
      acquiredTick: 0,
      mastery: 1,
    });
    const lossUnderInterdicted = decayHeldKnowledge({
      knowledge: interdictedKnowledge,
      cells,
      ruleset: interdicted,
      elapsedTicks: 1,
      worldTick: 1,
      retentionOf: () => 1024,
    });
    // Dormant: floorless, destroyed once mastery reaches zero -- agrees with
    // isDormant(interdicted) === true.
    expect(lossUnderInterdicted).toHaveLength(1);
    expect(interdictedKnowledge.exists(nodeId)).toBe(false);

    // instances/library-depth.ts's inline permits() check.
    const libraryKnowledge = new KnowledgeSubsystem(testWorld(), NODE_COUNT_UPPER_BOUND);
    const grimoire = libraryKnowledge.state.entities.create();
    libraryKnowledge.createInstance({
      nodeId,
      locationKind: LOCATION_KIND.library,
      locationId: LIBRARY,
      acquiredTick: 0,
      mastery: 0,
      grimoire,
    });
    const catalog = catalogFromRegistry(registry);
    const depthPermitted = libraryDepth({
      knowledge: libraryKnowledge,
      catalog,
      cells,
      ruleset: permitted,
      library: LIBRARY,
    });
    const depthInterdicted = libraryDepth({
      knowledge: libraryKnowledge,
      catalog,
      cells,
      ruleset: interdicted,
      library: LIBRARY,
    });
    expect(depthPermitted).toBeGreaterThan(0);
    expect(depthInterdicted).toBe(0);
  });
});

