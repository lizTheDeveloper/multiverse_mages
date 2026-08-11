/*
 * Multiverse Mages — the research frontier's scan window, and the third of the
 * v1 content it cannot see.
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
 * ## What this file is a tripwire for
 *
 * A reference universe run through `@mm/scenario` stops discovering nodes at 32
 * of the 51 the v1 rectangle holds, by world-year eight, and never moves again.
 * The cause is here, and it is one line of `gateway.ts`:
 *
 *     const scanned = Math.min(this.#deps.catalog.nodeCount, MAX_FRONTIER_SCAN);
 *     for (let nodeId = 1; nodeId <= scanned && found.length < limit; nodeId += 1)
 *
 * `MAX_FRONTIER_SCAN` is 256 and the shipped catalog holds 300 nodes, so the
 * frontier is not a *bounded scan* of the catalog — it is a **prefix window over
 * interned node id**. Nodes 257..300 are invisible to every mage, at every tick,
 * for the life of the universe. Eighteen of the fifty-one v1 nodes live there:
 * the whole `rego` technique, four cells of the twelve, including four tier-1
 * roots that have no prerequisites at all and could otherwise be picked up on
 * day one.
 *
 * That is not what the constant's own documentation claims it does — *"a catalog
 * of ten thousand nodes costs the same per mage as one of three hundred"* — and
 * the difference between capping cost and capping *reachability* is the whole
 * defect. Teaching cannot route around it either: `teachableTo` walks a teacher's
 * holdings rather than the catalog, so it is unwindowed, but nobody can ever hold
 * a node nobody can ever research.
 *
 * **When the window is replaced by a bound that does not silently delete
 * content, these tests fail, and that is the point.** The assertions below pin
 * the defect deliberately, so that a fix is a visible diff here rather than a
 * number that quietly changed in a baseline. What replaces them is an assertion
 * that every legal, prerequisite-free node is offered — see the second test,
 * which states that property as the thing currently violated.
 *
 * The remaining nineteenth unlearned node is *not* this: `pm-the-empty-room`
 * (tier 5, interned 221, inside the window) is merely slow, and a fifty-year run
 * reaches it around year thirty-one. Only eighteen nodes are unreachable.
 *
 * ## The control, with its honest figures
 *
 * Two agents diagnosed this independently and reached the same line. The
 * counterfactual both ran — raise `MAX_FRONTIER_SCAN` to 1024, change nothing
 * else, same seed:
 *
 * | | year 10 | year 20 | year 50 |
 * |---|---|---|---|
 * | as shipped | 32 | 32 | 33 |
 * | scan = 1024 | ~41-43 | ~49 | **50 of 51** |
 *
 * Fifty, not fifty-one. `rl-the-standing-gate` is tier 5 and still merely slow
 * at the fifty-year mark, exactly as `pm-the-empty-room` is. Recorded here
 * because a merge commit on this branch rounded it up to "all 51", and the
 * difference matters: the claim being made is *the plateau is gone and the
 * curve keeps rising*, not *everything is learned*. A slow tail on tier-5 nodes
 * is the prerequisite chain doing its job, and is the one thing the missing
 * study loop genuinely does explain.
 *
 * Raising the constant is **not** the recommended fix — it defers the same
 * defect to the next catalog. See the second prefix bias below.
 *
 * ## The second prefix bias, which a naive fix would leave behind
 *
 * The same loop exits on `found.length < limit`, where limit is
 * `MAX_CANDIDATE_TARGETS * 2`, and it also runs in ascending id. So "lowest ids
 * win" survives one layer up. It does not bind today because the legal frontier
 * is far smaller than the limit — but widening the window without addressing it
 * reintroduces this plateau as a *soft* cap the moment more than `limit` nodes
 * are simultaneously eligible, which is a harder defect to see than this one.
 */

import { describe, expect, it } from 'vitest';

import { createState } from '@mm/sim-core';
import {
  MAGE,
  MAGE_ROLE,
  attachRecord,
  captureRuleset,
  createUniverse,
  defineWorldStateSchema,
} from '@mm/state';
import { KnowledgeSubsystem } from '@mm/rules-magic';

import { CoordinatingKnowledgeGateway, MAX_FRONTIER_SCAN } from '../../src/index.js';

import { catalogAndCells, registry, shippedStorePolicy, speciesTable } from './world-fixtures.js';

/**
 * A universe permitting every cell, holding one mage of the deepest-reaching
 * species, and knowing nothing.
 *
 * Every axis is permitted so that legality cannot be confused with the window:
 * a node absent from the frontier here is absent because of where its id falls
 * and for no other reason. The species is the one with the highest
 * `depthCeiling`, for the same reason — the depth gate lives one layer up in
 * `gatherFrontier`, but a shallow species here would leave a reader wondering.
 */
function universeSeeingEverything(): {
  gateway: CoordinatingKnowledgeGateway;
  mage: number;
  nodeCount: number;
} {
  const { catalog, cells } = catalogAndCells();
  const { speciesOf, ids } = speciesTable();
  const traditionId = registry().traditions[0]?.contentId ?? 1;

  const deepest = ids
    .map((speciesId) => ({ speciesId, species: speciesOf(speciesId) }))
    .filter((entry) => entry.species !== undefined)
    .sort((a, b) => (b.species?.depthCeiling ?? 0) - (a.species?.depthCeiling ?? 0))[0];
  const species = deepest?.species;
  if (species === undefined || deepest === undefined) {
    throw new Error('the shipped registry declares no species');
  }

  const state = createState({
    rootSeed: 11,
    schema: defineWorldStateSchema(),
    contentRevision: registry().contentRevision,
  });
  const universe = createUniverse(state, {
    // Every technique and every form the shipped grid declares, so that
    // `permits` refuses nothing and cannot be mistaken for the cause.
    permittedTechniques: (1 << registry().techniques.length) - 1,
    permittedForms: (1 << registry().forms.length) - 1,
    edictBudget: 0,
    traditionId,
    favor: 0,
    worship: 0,
    worshipTier: 0,
    materials: 0,
    prestige: 0,
    prestigeEarned: 0,
    terminalReason: 0,
    favorCap: 0,
    ascended: 0,
  });

  const mage = state.entities.create();
  attachRecord(state, MAGE, mage, {
    speciesId: deepest.speciesId,
    birthTick: 0,
    roleId: MAGE_ROLE.researcher,
    universityId: 0,
    curiosity: species.curiosity,
    ambition: 1024,
    caution: 1024,
    vigor: 1024,
    maxVigor: 1024,
    alive: 1,
  });

  return {
    mage,
    nodeCount: catalog.nodeCount,
    gateway: new CoordinatingKnowledgeGateway({
      state,
      knowledge: KnowledgeSubsystem.fromState(state, catalog.nodeCount),
      catalog,
      cells,
      ruleset: captureRuleset(state, universe),
      ratesOf: () => ({
        learnRate: species.learnRate,
        rediscoveryAffinity: species.rediscoveryAffinity,
        depthCeiling: species.depthCeiling,
        scribeAffinity: species.scribeAffinity,
      }),
      store: shippedStorePolicy(traditionId),
    }),
  };
}

/** Interned ids of nodes with no prerequisites, ascending. */
function prerequisiteFreeNodeIds(): number[] {
  return registry()
    .nodes.filter((entry) => entry.record.prerequisites.length === 0)
    .map((entry) => entry.contentId)
    .sort((a, b) => a - b);
}

/** Interned ids of every node in a cell content flags `v1`, ascending. */
function v1NodeIds(): number[] {
  const v1Cells = new Set(
    registry()
      .cells.filter((entry) => entry.record.v1 === true)
      .map((entry) => entry.record.id),
  );
  return registry()
    .nodes.filter((entry) => v1Cells.has(entry.record.cell))
    .map((entry) => entry.contentId)
    .sort((a, b) => a - b);
}

describe('the frontier scan is a prefix window over node id, not a bounded scan', () => {
  it('has a catalog larger than the window, which is the precondition for the rest', () => {
    // Stated first and separately: every assertion below is vacuous on a catalog
    // that fits inside the window, and a reader who grows the content set is
    // entitled to know which of these tests is the load-bearing one.
    const { nodeCount } = universeSeeingEverything();
    expect(nodeCount).toBeGreaterThan(MAX_FRONTIER_SCAN);
  });

  it('offers no node above the window, however many candidates are asked for', () => {
    const { gateway, mage, nodeCount } = universeSeeingEverything();
    // A limit as large as the catalog, so the loop's second exit condition
    // (`found.length < limit`) cannot fire and the window is the only bound left.
    const offered = gateway.researchFrontier(mage, nodeCount).map((target) => target.nodeId);

    expect(offered.length).toBeGreaterThan(0);
    expect(Math.max(...offered)).toBeLessThanOrEqual(MAX_FRONTIER_SCAN);
  });

  it('drops legal, prerequisite-free nodes solely for having a high interned id', () => {
    const { gateway, mage, nodeCount } = universeSeeingEverything();
    const offered = new Set(gateway.researchFrontier(mage, nodeCount).map((t) => t.nodeId));

    const free = prerequisiteFreeNodeIds();
    const reachable = free.filter((nodeId) => nodeId <= MAX_FRONTIER_SCAN);
    const unreachable = free.filter((nodeId) => nodeId > MAX_FRONTIER_SCAN);

    // The control. Every prerequisite-free node inside the window is offered, so
    // the exclusion below is about the window and not about some other filter.
    for (const nodeId of reachable) expect(offered.has(nodeId)).toBe(true);

    // The defect. These nodes are legal, need nothing, and are never offered —
    // to this mage or to any other, at this tick or at any other.
    expect(unreachable.length).toBeGreaterThan(0);
    for (const nodeId of unreachable) expect(offered.has(nodeId)).toBe(false);
  });
});

describe('what the window costs the shipped v1 subset', () => {
  it('puts eighteen of the fifty-one v1 nodes permanently out of reach', () => {
    const v1 = v1NodeIds();
    const beyond = v1.filter((nodeId) => nodeId > MAX_FRONTIER_SCAN);

    // The exact figures the plateau is made of. Written as numbers rather than as
    // a comparison against itself, because the point of the test is that a
    // content change moving a v1 cell across id 256 is a silent balance change.
    expect(v1).toHaveLength(51);
    expect(beyond).toHaveLength(18);

    // And they are one contiguous block — the four `rego` cells of the v1
    // rectangle, which is why the symptom reads as "a whole technique is missing"
    // rather than as scattered gaps.
    const names = new Set(
      registry()
        .nodes.filter((entry) => beyond.includes(entry.contentId))
        .map((entry) => entry.record.cell.split('-')[0]),
    );
    expect([...names]).toEqual(['rego']);
  });

  it('hides four v1 tier-1 roots, so the loss is not a depth or prerequisite effect', () => {
    // The hypothesis this rules out. If the plateau were prerequisite
    // reachability, the unreachable set would be closed under prerequisites and
    // would contain no roots. It contains four — one per `rego` cell — each with
    // an empty prerequisite list and a tier of 1.
    const v1 = new Set(v1NodeIds());
    const roots = registry().nodes.filter(
      (entry) =>
        v1.has(entry.contentId) &&
        entry.record.prerequisites.length === 0 &&
        entry.contentId > MAX_FRONTIER_SCAN,
    );

    expect(roots).toHaveLength(4);
    for (const root of roots) expect(root.record.tier).toBe(1);
  });
});
