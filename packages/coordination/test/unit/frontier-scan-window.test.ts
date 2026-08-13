/*
 * Multiverse Mages — the research frontier's scan window, the third of the v1
 * content it could not see, and the bound that replaced it.
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
 * ## What this file was a tripwire for
 *
 * A reference universe run through `@mm/scenario` stopped discovering nodes at
 * 32 of the 51 the v1 rectangle holds, by world-year eight, and never moved
 * again. The cause was one line of `gateway.ts`:
 *
 *     const scanned = Math.min(this.#deps.catalog.nodeCount, MAX_FRONTIER_SCAN);
 *     for (let nodeId = 1; nodeId <= scanned && found.length < limit; nodeId += 1)
 *
 * `MAX_FRONTIER_SCAN` was 256 and the shipped catalog holds 300 nodes, so the
 * frontier was not a *bounded scan* of the catalog — it was a **prefix window
 * over interned node id**. Nodes 257..300 were invisible to every mage, at every
 * tick, for the life of the universe. Eighteen of the fifty-one v1 nodes live
 * there: the whole `rego` technique, four cells of the twelve, including four
 * tier-1 roots that have no prerequisites at all and could otherwise be picked
 * up on day one.
 *
 * That is not what the constant's own documentation claimed it did — *"a catalog
 * of ten thousand nodes costs the same per mage as one of three hundred"* — and
 * the difference between capping cost and capping *reachability* was the whole
 * defect. Teaching could not route around it either: `teachableTo` walks a
 * teacher's holdings rather than the catalog, so it was unwindowed, but nobody
 * can ever hold a node nobody can ever research.
 *
 * ## What replaced it, and what these tests now assert
 *
 * The window is gone. `researchFrontier` walks the nodes of the cells the
 * ruleset permits — `frontier-index.ts` inverts `cellOf` once per content load,
 * the gateway intersects it with `permits()` once per phase — so the scan is
 * `O(legal nodes)`, flat in total catalog size, and bounded by a *rule* rather
 * than by an id range. The tests that pinned the defect have become the tests
 * that pin its absence, stated as the property the diagnosis asked for: **every
 * legal, prerequisite-free node is offered.**
 *
 * {@link HISTORIC_SCAN_WINDOW} is kept here, in the test that remembers why,
 * rather than in `gateway.ts`, where a live constant would invite someone to
 * raise it. The content facts it addresses — 51 v1 nodes, 18 of them interned
 * above 256, all four `rego` cells — are asserted below because they are exactly
 * what made the defect a third of the v1 content rather than a rounding error,
 * and because content that drifted back across that line would tell a future
 * reader this file is about nothing.
 *
 * The nineteenth unlearned node was *not* this: `pm-the-empty-room` (tier 5,
 * interned 221, inside the window) was merely slow, and a fifty-year run reaches
 * it around year thirty-two. Only eighteen nodes were unreachable.
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
import { compareTargets } from '@mm/rules-world';

import { CoordinatingKnowledgeGateway } from '../../src/index.js';

import { catalogAndCells, nodeFacets, registry, shippedAcquirePolicy, shippedStorePolicy, speciesTable } from './world-fixtures.js';

/**
 * The id the frontier scan used to stop at.
 *
 * Not imported, because the production constant no longer exists — that is the
 * fix. It survives as a number in this file so the assertions below can still
 * say *which* nodes were lost, and so a content reshuffle that moved the v1
 * rectangle back under 256 shows up as a failure here rather than as a test
 * quietly asserting nothing.
 */
const HISTORIC_SCAN_WINDOW = 256;

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
  return universePermitting(
    (1 << registry().techniques.length) - 1,
    (1 << registry().forms.length) - 1,
  );
}

/**
 * The same universe, narrowed to the three techniques and four forms the v1
 * rectangle covers.
 *
 * The control the all-permitting universe cannot be: with every cell open, a
 * frontier that ignored the ruleset entirely would pass every assertion above.
 * Here the ruleset is the only thing that could exclude a node, which is what
 * the scan is now bounded by.
 */
function universeOnTheV1Rectangle(): {
  gateway: CoordinatingKnowledgeGateway;
  mage: number;
  nodeCount: number;
} {
  const v1Cells = registry().cells.filter((entry) => entry.record.v1 === true);
  const techniques = new Set(v1Cells.map((entry) => entry.record.technique));
  const forms = new Set(v1Cells.map((entry) => entry.record.form));

  const maskOver = (
    axis: readonly { readonly record: { readonly id: string; readonly bit: number } }[],
    chosen: ReadonlySet<string>,
  ): number => {
    let mask = 0;
    for (const entry of axis) {
      if (chosen.has(entry.record.id)) mask |= 1 << entry.record.bit;
    }
    return mask;
  };

  return universePermitting(
    maskOver(registry().techniques, techniques),
    maskOver(registry().forms, forms),
  );
}

function universePermitting(
  permittedTechniques: number,
  permittedForms: number,
): {
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
    permittedTechniques,
    permittedForms,
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
      facets: nodeFacets(),
      ruleset: captureRuleset(state, universe),
      ratesOf: () => ({
        learnRate: species.learnRate,
        rediscoveryAffinity: species.rediscoveryAffinity,
        depthCeiling: species.depthCeiling,
        scribeAffinity: species.scribeAffinity,
      }),
      store: shippedStorePolicy(traditionId),
      acquire: shippedAcquirePolicy(traditionId),
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

describe('the frontier scan is bounded by legality, not by a range of node ids', () => {
  it('has a catalog larger than the window that used to bound it', () => {
    // Stated first and separately: every assertion below is vacuous on a catalog
    // that fits inside the old window, and a reader who shrinks the content set
    // is entitled to know which of these tests is the load-bearing one.
    const { nodeCount } = universeSeeingEverything();
    expect(nodeCount).toBeGreaterThan(HISTORIC_SCAN_WINDOW);
  });

  it('offers every legal, prerequisite-free node, wherever its id falls', () => {
    const { gateway, mage, nodeCount } = universeSeeingEverything();
    // A limit as large as the catalog, so the result bound cannot fire and
    // legality is the only filter left standing.
    const offered = new Set(gateway.researchFrontier(mage, nodeCount).map((t) => t.nodeId));

    const free = prerequisiteFreeNodeIds();
    const beyond = free.filter((nodeId) => nodeId > HISTORIC_SCAN_WINDOW);

    // The control: there really are nodes on the far side of the old window, so
    // the property below is not satisfied by a catalog that never had any.
    expect(beyond.length).toBeGreaterThan(0);

    // The property. Every one of them, and no exception for a high id — this is
    // the assertion the diagnosis asked to replace the window tests with.
    for (const nodeId of free) expect(offered.has(nodeId)).toBe(true);
  });

  it('offers nothing a mage could not legally begin, and nothing twice', () => {
    // The other half of the property. A scan that walked cells and forgot to
    // intersect them with the ruleset, or that emitted a node once per cell it
    // appears in, would pass the test above and be wrong.
    const { gateway, mage, nodeCount } = universeSeeingEverything();
    const offered = gateway.researchFrontier(mage, nodeCount).map((t) => t.nodeId);
    const free = new Set(prerequisiteFreeNodeIds());

    expect(new Set(offered).size).toBe(offered.length);
    // This mage holds nothing, so "prerequisites satisfied" and "no
    // prerequisites" are the same set, and the frontier is exactly the roots.
    expect([...offered].sort((a, b) => a - b)).toEqual([...free].sort((a, b) => a - b));
  });

  it('offers only what the ruleset permits, and every v1 root inside it', () => {
    // The legality half of the bound, on the rectangle a v1 universe actually
    // runs. Every offered node is in the twelve permitted cells — a scan that
    // walked the index and skipped `permits` would fail here — and every one of
    // the rectangle's twelve roots is offered, including the four `rego` roots
    // the window used to hide.
    const { gateway, mage, nodeCount } = universeOnTheV1Rectangle();
    const offered = gateway.researchFrontier(mage, nodeCount).map((t) => t.nodeId);
    const v1 = new Set(v1NodeIds());
    const roots = prerequisiteFreeNodeIds().filter((nodeId) => v1.has(nodeId));

    expect(offered.length).toBeGreaterThan(0);
    for (const nodeId of offered) expect(v1.has(nodeId)).toBe(true);
    expect([...offered].sort((a, b) => a - b)).toEqual(roots);
    expect(roots.filter((nodeId) => nodeId > HISTORIC_SCAN_WINDOW)).toHaveLength(4);
  });

  it('spends its result bound on the cheapest candidates, not the lowest-numbered', () => {
    // The secondary bias the diagnosis names. The old loop exited on
    // `found.length < limit` in ascending id, so a mage with more candidates
    // than the limit got the lowest-numbered ones — interned id deciding
    // reachability again, one layer in. The bound is now applied to the
    // frontier's own order, which is the caller's `compareTargets`.
    const { gateway, mage, nodeCount } = universeSeeingEverything();
    const whole = [...gateway.researchFrontier(mage, nodeCount)].sort(compareTargets);
    expect(whole.length).toBeGreaterThan(4);

    const bounded = gateway.researchFrontier(mage, 4);
    expect(bounded).toHaveLength(4);
    expect(bounded.map((t) => t.nodeId)).toEqual(whole.slice(0, 4).map((t) => t.nodeId));
  });
});

describe('what the window cost the shipped v1 subset', () => {
  it('put eighteen of the fifty-one v1 nodes permanently out of reach', () => {
    const v1 = v1NodeIds();
    const beyond = v1.filter((nodeId) => nodeId > HISTORIC_SCAN_WINDOW);

    // The exact figures the plateau was made of. Written as numbers rather than
    // as a comparison against itself, because the point is that a content change
    // moving a v1 cell across id 256 used to be a silent balance change — and
    // the `check:content` assertion in `@mm/content`'s loader now refuses the
    // class of reshuffle that would make an id range matter again.
    expect(v1).toHaveLength(51);
    expect(beyond).toHaveLength(18);

    // And they were one contiguous block — the four `rego` cells of the v1
    // rectangle, which is why the symptom read as "a whole technique is missing"
    // rather than as scattered gaps.
    const names = new Set(
      registry()
        .nodes.filter((entry) => beyond.includes(entry.contentId))
        .map((entry) => entry.record.cell.split('-')[0]),
    );
    expect([...names]).toEqual(['rego']);
  });

  it('hid four v1 tier-1 roots, so the loss was not a depth or prerequisite effect', () => {
    // The hypothesis this rules out. If the plateau had been prerequisite
    // reachability, the unreachable set would be closed under prerequisites and
    // would contain no roots. It contains four — one per `rego` cell — each with
    // an empty prerequisite list and a tier of 1.
    const v1 = new Set(v1NodeIds());
    const roots = registry().nodes.filter(
      (entry) =>
        v1.has(entry.contentId) &&
        entry.record.prerequisites.length === 0 &&
        entry.contentId > HISTORIC_SCAN_WINDOW,
    );

    expect(roots).toHaveLength(4);
    for (const root of roots) expect(root.record.tier).toBe(1);
  });

  it('is over: all four of those roots are on a new mage\'s day-one frontier', () => {
    // The regression, stated in the terms the symptom was reported in. These are
    // the four nodes a fifty-year reference run never reached; a mage who has
    // just been created can now begin any of them.
    const { gateway, mage, nodeCount } = universeSeeingEverything();
    const offered = new Set(gateway.researchFrontier(mage, nodeCount).map((t) => t.nodeId));
    const v1 = new Set(v1NodeIds());
    const roots = registry()
      .nodes.filter(
        (entry) =>
          v1.has(entry.contentId) &&
          entry.record.prerequisites.length === 0 &&
          entry.contentId > HISTORIC_SCAN_WINDOW,
      )
      .map((entry) => entry.contentId);

    expect(roots).toHaveLength(4);
    for (const nodeId of roots) expect(offered.has(nodeId)).toBe(true);
  });
});
