/*
 * Multiverse Mages — a small world for the knowledge-lifecycle tests.
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
 * Fixtures shared by the knowledge tests: a world state, a three-node graph,
 * rulesets that permit or interdict, and a step-bound RNG.
 *
 * **The node graph is synthetic, not the shipped v1 content.** The lifecycle
 * requirements are structural — a node ceases to exist when its last instance
 * is destroyed, rediscovery is clamped at 3× — and asserting them against
 * authored magnitudes would make these tests fail whenever content is retuned,
 * which is exactly the "test that fails for a reason unrelated to the code under
 * test" this repository's vitest config already complains about. One test does
 * project the real registry, and it asserts the projection rather than the
 * numbers.
 */

import { cellIdAt } from '@mm/state';
import type { Edict, Ruleset } from '@mm/state';
import type { SimState } from '@mm/sim-core';
import { createState, rngFromRootSeed } from '@mm/sim-core';
import { defineWorldStateSchema } from '@mm/state';
import { EDICT_KIND } from '@mm/state';

import type { KnowledgeNode, KnowledgeRng, NodeCatalog } from '../../src/instances/catalog.js';
import { catalogOf } from '../../src/instances/catalog.js';

/** Technique and form bits the fixture nodes live on. Arbitrary but fixed. */
export const TECHNIQUE_BIT = 2;
export const OTHER_TECHNIQUE_BIT = 1;
export const FORM_BIT = 3;

/** `intellego`-like cell every fixture node sits in unless stated otherwise. */
export const HOME_CELL = cellIdAt(TECHNIQUE_BIT, FORM_BIT);

/** A second cell, on a different technique axis, for cross-cell prerequisites. */
export const OTHER_CELL = cellIdAt(OTHER_TECHNIQUE_BIT, FORM_BIT);

/** Node ids in {@link testCatalog}. */
export const ROOT_NODE = 1;
export const CHILD_NODE = 2;
export const OTHER_CELL_NODE = 3;
/** In {@link HOME_CELL}, but requiring the node in {@link OTHER_CELL}. */
export const CROSS_CELL_CHILD = 4;

const NODE_CELLS: ReadonlyMap<number, number> = new Map([
  [ROOT_NODE, HOME_CELL],
  [CHILD_NODE, HOME_CELL],
  [OTHER_CELL_NODE, OTHER_CELL],
  [CROSS_CELL_CHILD, HOME_CELL],
]);

/** `cellOf` as `magic-grid` will supply it, over the fixture graph. */
export function cellOf(nodeId: number): number {
  const cellId = NODE_CELLS.get(nodeId);
  if (cellId === undefined) throw new RangeError(`fixture has no cell for node ${String(nodeId)}`);
  return cellId;
}

export const testCells = { cellOf };

/**
 * Four nodes: a root, a child that requires it, a node in another cell, and a
 * child whose prerequisite is that other-cell node.
 *
 * The last one exists so that a *cross-cell* prerequisite can be interdicted
 * without interdicting the node being researched — the only shape in which
 * "dormant knowledge satisfies no prerequisite" is distinguishable from "the
 * node's own cell is forbidden".
 *
 * `researchCost` is `fp(4096)` and `rediscoveryMultiplier` `fp(4096)` on every
 * node, which are the exact magnitudes the rediscovery scenarios in
 * `knowledge-instances` name.
 */
export function testCatalog(overrides: Partial<KnowledgeNode> = {}): NodeCatalog {
  const base = {
    tier: 1,
    researchCost: 4096,
    teachCost: 1024,
    scribeCost: 2048,
    rediscoveryMultiplier: 4096,
    // `episteme` is the fixture default because it is the content majority —
    // 271 of 300 shipped nodes — not because it is the neutral value. It is not
    // neutral: it halves the copy distance a scribing costs. A fidelity test
    // must override it rather than inherit it.
    knowledgeKind: 'episteme' as const,
    ...overrides,
  };
  return catalogOf([
    { ...base, nodeId: ROOT_NODE, prerequisites: [] },
    { ...base, nodeId: CHILD_NODE, prerequisites: [ROOT_NODE] },
    { ...base, nodeId: OTHER_CELL_NODE, prerequisites: [] },
    { ...base, nodeId: CROSS_CELL_CHILD, prerequisites: [OTHER_CELL_NODE] },
  ]);
}

/** How many node ids the fixture catalog spans. Sizes the instance index. */
export const TEST_NODE_COUNT = 4;

/** A world state with §1's components and no systems. */
export function testWorld(rootSeed = 7): SimState {
  return createState({ schema: defineWorldStateSchema(), rootSeed });
}

/** A ruleset permitting both fixture cells' axes and issuing no edicts. */
export function permissiveRuleset(edicts: readonly Edict[] = []): Ruleset {
  return {
    permittedTechniques: (1 << TECHNIQUE_BIT) | (1 << OTHER_TECHNIQUE_BIT),
    permittedForms: 1 << FORM_BIT,
    edicts,
  };
}

/** A ruleset interdicting one cell and permitting everything else the fixture uses. */
export function interdicting(cellId: number): Ruleset {
  return permissiveRuleset([{ cellId, kind: EDICT_KIND.interdiction }]);
}

/**
 * The RNG a step would hand a system, bound to one tick.
 *
 * Built from `rngFromRootSeed` rather than hand-rolled so the tests draw from
 * the same derivation the simulation does — including the per-actor split that
 * insertion invariance depends on.
 */
export function stepRng(rootSeed: number, tick: number): KnowledgeRng {
  const source = rngFromRootSeed(rootSeed);
  return {
    stream: (subsystemId) => source.stream(subsystemId, tick),
    actorStream: (subsystemId, actorKey) => source.actorStream(subsystemId, tick, actorKey),
  };
}
