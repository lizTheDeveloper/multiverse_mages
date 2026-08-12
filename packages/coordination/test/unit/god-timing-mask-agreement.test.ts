/*
 * Multiverse Mages — the mask and the resolver price the eight-bar unease the same way.
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
 * The check `mask.ts`'s `uneaseMultiplier` comment promises, written down.
 *
 * `contracts.md` §5 gives `@mm/agent-api` and `@mm/coordination` no edge to each
 * other, so the unease multiplier is implemented twice — once where an action's
 * affordability is *judged* and once where its price is *charged*. That is the
 * same situation `cheapestAxisMultiplier` is in for hysteresis, and the same
 * remedy applies: a test that fails when the two drift, since an import cannot.
 *
 * **Why this is worth a file of its own.** Integration round 2's sharpest finding
 * was that `uniform-random-legal` — the probe every published exploit margin was
 * measured against — was crippled by exactly this class of disagreement:
 * *"`CANDIDATE_SLOTS` covers actions 8–14, so it submits 1–7 bare; the gate
 * admits them, coordination refuses them onto `state.illegalActionCount`… Seven
 * of fifteen verbs inert, telemetry clean."* A surcharge the mask cannot see is
 * not a cost. It is a silent refusal that looks like a working mechanic in every
 * summary anybody reads.
 *
 * The discriminating case is favor set **between** the two prices. Any test with
 * plenty of favor passes whether or not the mask knows about the rule.
 */

import { describe, expect, it } from 'vitest';

import type { Action, EntityHandle, SimState } from '@mm/sim-core';
import { FP_ONE, TIME_MODE, mul } from '@mm/sim-core';
import { UNIVERSE, componentOf, defineWorldStateSchema } from '@mm/state';
import { KnowledgeSubsystem } from '@mm/rules-magic';
import { GOD_ACTION, buildCandidates, buildCatalogue, isLegal, legalityMask } from '@mm/agent-api';

import type { InterventionDeps } from '../../src/index.js';
import { ACTION, resolveInterventions } from '../../src/index.js';

import { catalogAndCells, registry } from './world-fixtures.js';
import { constants, costs, godWorld, nodesCarrying } from './god-fixtures.js';

const C = constants();
const COSTS = costs();
const SCHEMA = defineWorldStateSchema([]);

/** The catalogue the observation layer would build over this content. */
function catalogue() {
  const loaded = registry();
  return buildCatalogue(
    loaded.nodes.map((entry) => ({
      nodeId: entry.contentId,
      cellId: loaded.intern('cell', entry.record.cell),
      tier: entry.record.tier,
    })),
    loaded.traditions.map((entry) => entry.contentId),
    {
      byAction: COSTS.byAction,
      foundUniversity: COSTS.foundUniversity,
      hysteresisStep: C.hysteresisStep,
      uneaseBars: C.uneaseBars,
      uneaseStep: C.uneaseStep,
    },
  );
}

interface Bench {
  readonly state: SimState;
  readonly universe: EntityHandle;
  readonly deps: InterventionDeps;
}

function bench(): Bench {
  const world = godWorld(SCHEMA, { favor: 1_000_000 });
  const { catalog, cells } = catalogAndCells();
  return {
    state: world.state,
    universe: world.universe,
    deps: {
      god: { constants: C, costs: COSTS },
      catalog,
      cells,
      knowledge: KnowledgeSubsystem.fromState(world.state, catalog.nodeCount),
      edictBudgetMax: 8,
      portalNodes: new Set(nodesCarrying('portal').keys()),
      requestEngagement: () => {},
    },
  };
}

function resolve(b: Bench, action: Action, worldTick: number) {
  return resolveInterventions(b.state, [action], worldTick, TIME_MODE.world, b.deps);
}

function setFavor(b: Bench, favor: number): void {
  componentOf(b.state, UNIVERSE).set(b.universe, 'favor', favor);
}

function maskFor(b: Bench) {
  const cat = catalogue();
  return legalityMask({
    state: b.state,
    candidates: buildCandidates({ state: b.state, catalogue: cat }),
    catalogue: cat,
  });
}

describe('the mask and the resolver agree about the unease surcharge', () => {
  /**
   * A form flip is the discriminating action: `forbidForm` has never been
   * touched here, so its hysteresis multiplier is exactly `fp(1)` and every
   * difference between the two prices below is the unease and nothing else.
   */
  const ACT: Action = { kind: ACTION.forbidForm, params: [1] };
  const BASE = COSTS.byAction[ACTION.forbidForm] ?? 0;

  it('is the discriminating case: the two prices differ', () => {
    // The premise of every assertion below. If the surcharge were zero the rest
    // of this file would pass vacuously.
    const surcharged = mul(BASE, FP_ONE + (C.uneaseBars - 1) * C.uneaseStep);
    expect(surcharged).toBeGreaterThan(BASE);
  });

  it('marks a constitutional act illegal when only its unsurcharged price is affordable', () => {
    const b = bench();
    // Change the law, so the next act lands inside the phrase.
    expect(resolve(b, { kind: ACTION.forbidTechnique, params: [1] }, 0).applied).toBe(1);

    const surcharged = mul(BASE, FP_ONE + (C.uneaseBars - 1) * C.uneaseStep);
    // Between the two prices: enough for the act at its base price, not enough
    // for it inside the phrase. A mask blind to the rule reads this as legal.
    setFavor(b, surcharged - 1);
    b.state.clock.worldTick = 1;
    expect(isLegal(maskFor(b), GOD_ACTION.forbidForm)).toBe(false);

    // And the resolver refuses it, which is the half that would otherwise be a
    // silent illegal-action count.
    expect(resolve(b, ACT, 1).applied).toBe(0);
  });

  it('marks the same act legal once the phrase has run out', () => {
    // The control. Without it, the assertion above would also pass for a mask
    // that simply refused every constitutional action.
    const b = bench();
    expect(resolve(b, { kind: ACTION.forbidTechnique, params: [1] }, 0).applied).toBe(1);

    const surcharged = mul(BASE, FP_ONE + (C.uneaseBars - 1) * C.uneaseStep);
    setFavor(b, surcharged - 1);
    b.state.clock.worldTick = C.uneaseBars;
    expect(isLegal(maskFor(b), GOD_ACTION.forbidForm)).toBe(true);
    expect(resolve(b, ACT, C.uneaseBars).applied).toBe(1);
  });

  it('never admits an act the resolver will refuse, at any point in the phrase', () => {
    // The property, swept rather than sampled: for every bar of the window and
    // a price on each side of the surcharge, the mask's verdict and the
    // resolver's must be the same verdict.
    for (let gap = 0; gap <= C.uneaseBars; gap += 1) {
      const bars = Math.max(C.uneaseBars - gap, 0);
      const expected = mul(BASE, FP_ONE + bars * C.uneaseStep);
      for (const favor of [expected - 1, expected]) {
        const b = bench();
        expect(resolve(b, { kind: ACTION.forbidTechnique, params: [1] }, 0).applied).toBe(1);
        setFavor(b, favor);
        b.state.clock.worldTick = gap;

        const admitted = isLegal(maskFor(b), GOD_ACTION.forbidForm);
        const applied = resolve(b, ACT, gap).applied === 1;
        expect(admitted, `gap ${String(gap)}, favor ${String(favor)}`).toBe(applied);
      }
    }
  });

  it('leaves the mask unchanged for a universe that has never changed its law', () => {
    const b = bench();
    setFavor(b, BASE);
    expect(isLegal(maskFor(b), GOD_ACTION.forbidForm)).toBe(true);
    setFavor(b, BASE - 1);
    expect(isLegal(maskFor(b), GOD_ACTION.forbidForm)).toBe(false);
  });
});
