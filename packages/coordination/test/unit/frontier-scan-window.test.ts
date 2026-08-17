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
 * The twelve cells that carried `"v1": true` when the window was diagnosed.
 *
 * Pinned here for exactly the reason {@link HISTORIC_SCAN_WINDOW} is pinned here:
 * the production fact it names no longer exists. All seventy cells are enabled
 * now, so `registry().cells.filter(v1)` returns the whole grid — and a test that
 * derived the rectangle from the flag would have quietly become two things at
 * once. The narrowing control below would stop narrowing anything, passing
 * vacuously; and *"eighteen of the fifty-one v1 nodes"* would silently restate
 * itself as forty-four of three hundred, which is a different and much less
 * interesting claim about a defect that was fixed against the smaller subset.
 *
 * So the historical claims below are asserted against these twelve, and the
 * currently-enabled subset is read from the flag where that is what is meant.
 * `{intellego, perdo, rego} × {limen, mentem, nomen, terram}` — a rectangle, so a
 * ruleset built by OR-ing its axes permits exactly these and no thirteenth.
 */
const HISTORIC_V1_CELLS: readonly string[] = [
  'intellego-limen',
  'intellego-mentem',
  'intellego-nomen',
  'intellego-terram',
  'perdo-limen',
  'perdo-mentem',
  'perdo-nomen',
  'perdo-terram',
  'rego-limen',
  'rego-mentem',
  'rego-nomen',
  'rego-terram',
];

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
 * The same universe, narrowed to the three techniques and four forms the historic
 * v1 rectangle covered.
 *
 * The control the all-permitting universe cannot be: with every cell open, a
 * frontier that ignored the ruleset entirely would pass every assertion above.
 * Here the ruleset is the only thing that could exclude a node, which is what
 * the scan is now bounded by.
 *
 * Built from {@link HISTORIC_V1_CELLS} rather than from the `v1` flag, because
 * the flag now covers the whole grid and a ruleset derived from it would permit
 * everything — making this function a copy of `universeSeeingEverything` and the
 * control no control at all. Any proper rectangle would do; this one is the one
 * whose numbers the tests below quote.
 */
function universeOnTheHistoricV1Rectangle(): {
  gateway: CoordinatingKnowledgeGateway;
  mage: number;
  nodeCount: number;
} {
  const historic = new Set(HISTORIC_V1_CELLS);
  const v1Cells = registry().cells.filter((entry) => historic.has(entry.record.id));
  if (v1Cells.length !== HISTORIC_V1_CELLS.length) {
    throw new Error('HISTORIC_V1_CELLS names a cell the shipped registry does not declare');
  }
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
        scribeAffinity: species.scribeAffinity, curiosity: 1024,
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

/** Interned ids of every node in one of {@link HISTORIC_V1_CELLS}, ascending. */
function historicV1NodeIds(): number[] {
  const historic = new Set(HISTORIC_V1_CELLS);
  return registry()
    .nodes.filter((entry) => historic.has(entry.record.cell))
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

  it('offers only what the ruleset permits, and every root inside it', () => {
    // The legality half of the bound, on the rectangle the diagnosis was taken
    // against. Every offered node is in the twelve permitted cells — a scan that
    // walked the index and skipped `permits` would fail here — and every one of
    // the rectangle's twelve roots is offered, including the four `rego` roots
    // the window used to hide.
    //
    // The rectangle is now a *narrower* thing than the content set rather than
    // equal to it, which is what makes this a control at all. Enabling all
    // seventy cells is what separated the two: `permits()` is the god's gate and
    // `"v1": true` is content's, and this test only ever needed the first.
    const { gateway, mage, nodeCount } = universeOnTheHistoricV1Rectangle();
    const offered = gateway.researchFrontier(mage, nodeCount).map((t) => t.nodeId);
    const rectangle = new Set(historicV1NodeIds());
    const roots = prerequisiteFreeNodeIds().filter((nodeId) => rectangle.has(nodeId));

    expect(offered.length).toBeGreaterThan(0);
    // The control the derived version lost: the ruleset really does exclude most
    // of the catalog, so "everything offered is permitted" is not vacuous.
    expect(rectangle.size).toBeLessThan(nodeCount);
    for (const nodeId of offered) expect(rectangle.has(nodeId)).toBe(true);
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
  it('put eighteen of the fifty-two historic v1 nodes permanently out of reach', () => {
    // Against {@link HISTORIC_V1_CELLS} and not against the flag. These figures
    // are a measurement of the twelve-cell subset that was enabled when the
    // plateau was found; recomputing them over the seventy cells enabled since
    // `material-economy` is a true statement about a different subset and not
    // this diagnosis. The current subset is asserted separately below, so the
    // file still notices a content reshuffle that moved ids around.
    //
    // **Fifty-two, not the fifty-one either branch carried.** `main` added a
    // node inside the historic rectangle while `material-economy` was out, and
    // that branch counted 51 over a grid that did not have it. Counted from
    // `node.json`, not carried over from a comment.
    const v1 = historicV1NodeIds();
    const beyond = v1.filter((nodeId) => nodeId > HISTORIC_SCAN_WINDOW);

    // The exact figures the plateau was made of. Written as numbers rather than
    // as a comparison against itself, because the point is that a content change
    // moving a v1 cell across id 256 used to be a silent balance change — and
    // the `check:content` assertion in `@mm/content`'s loader now refuses the
    // class of reshuffle that would make an id range matter again.
    // 52, not the 51 this was written against: `w190/scribing-fidelity` added
    // `pn-the-wrong-true-name` to `perdo-nomen`. The count of *unreachable*
    // nodes is unchanged at eighteen, and that is the load-bearing half — the
    // new node interns at 227, inside the historic window, so it neither joins
    // the lost block nor rescues anything from it. A content addition that moved
    // that second number would be the silent balance change this test exists to
    // catch.
    expect(v1).toHaveLength(52);
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
    const v1 = new Set(historicV1NodeIds());
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
    const v1 = new Set(historicV1NodeIds());
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

  it('would cost the whole grid forty-four nodes and ten roots today', () => {
    // The same window against the subset that is enabled *now*, so the file keeps
    // noticing content movement rather than freezing into a museum piece. These
    // are not a diagnosis of anything — the window is gone — they are the figures
    // that say how much larger the hazard would have been had it survived
    // enabling all seventy cells, and they are the ones a reader should expect to
    // change when content moves.
    const enabled = v1NodeIds();
    // 301, not the 300 this was written against: `main` added
    // `pn-the-wrong-true-name` to `perdo-nomen` while `material-economy` was
    // out. A node count is a content decision and is recomputed here rather
    // than reasoned about, exactly as the historic count above it is.
    expect(enabled).toHaveLength(301);
    // 45, not 44, and by the same one node: `pn-the-wrong-true-name` interns
    // above the historic window, so it joins the block the window would have
    // lost. That it moved *this* count and not the historic one above is the
    // whole point of keeping the two separate — the historic figure is a
    // diagnosis of a subset that no longer exists and must not drift, and this
    // one is a live reading of the subset enabled now and is expected to.
    expect(enabled.filter((nodeId) => nodeId > HISTORIC_SCAN_WINDOW)).toHaveLength(45);

    const enabledSet = new Set(enabled);
    const roots = prerequisiteFreeNodeIds().filter(
      (nodeId) => enabledSet.has(nodeId) && nodeId > HISTORIC_SCAN_WINDOW,
    );
    expect(roots).toHaveLength(10);
  });
});
