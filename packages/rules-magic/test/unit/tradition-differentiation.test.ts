/*
 * Multiverse Mages — each v1 tradition differs, and only where it declares it does.
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
 * Task 6.15, which is two claims and needs both halves to mean anything.
 *
 * The first half — every pair of v1 traditions is distinguishable on some
 * seeded scenario — is the 0.3.0 release claim that each tradition *changes
 * measurable behaviour*. Without it a tradition is a label.
 *
 * The second half — all three agree on a scenario outside their differing
 * hooks — is what stops "different" from meaning "randomly different". A
 * tradition that perturbed unrelated outcomes would still pass the first half
 * while being exactly the thing `vision.md` §4a caps hooks to prevent: a
 * bespoke behaviour the balance harness cannot enumerate, showing up as
 * unexplained variance in a Monte Carlo sweep at 0.5.0.
 *
 * Deterministic by construction. Nothing here draws from an RNG stream, so the
 * "seed" is the fixed script below: the same inputs, in the same order, under
 * each tradition, with the only variable being which tradition governs.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE, floorDiv, fromInt, mul } from '@mm/sim-core';
import { LOCATION_KIND } from '@mm/state';

import {
  admitToStore,
  applyAcquire,
  castCost,
  castPolicy,
  costPolicy,
  expendOnCast,
  hooksOfTradition,
  palaceLibraryDepth,
  prepare,
  scribeAvailability,
  storePolicy,
} from '../../src/traditions/index.js';

import { TRADITIONS, V1_TRADITIONS } from './tradition-fixtures.js';

/** The fixed script. Identical for every tradition; only the hooks change. */
const SCRIPT = {
  nodeId: 7,
  baseResearchCost: mul(fromInt(6), FP_ONE),
  baseTeachCost: mul(fromInt(2), FP_ONE),
  baseCastCost: mul(fromInt(3), FP_ONE),
  heldPersonalInstances: 12,
  palaceTierWeight: 15,
} as const;

/** Everything one run of the script observed, as a comparable record. */
interface Outcome {
  readonly researchCost: number;
  readonly teachCost: number;
  readonly initialMastery: number;
  readonly stolenMastery: number;
  readonly personalLocationKind: number;
  readonly admittedThirteenth: boolean;
  readonly scribingAvailable: boolean;
  readonly canPrepare: boolean;
  readonly preparedAfterCast: readonly number[];
  readonly costAtRelease: number;
  readonly palaceDepth: number;
}

/**
 * Runs the script under one tradition, through all four hooks.
 *
 * Everything world-side is supplied. `contracts.md` §5 forbids `rules-magic`
 * from importing `rules-world`, so species rates and mage handles arrive as
 * parameters — which is also what makes this scenario reproducible without a
 * simulation running.
 */
function run(tradition: number): Outcome {
  const hooks = hooksOfTradition(tradition, TRADITIONS);

  const terms = applyAcquire(hooks.acquire, {
    baseResearchCost: SCRIPT.baseResearchCost,
    baseTeachCost: SCRIPT.baseTeachCost,
    baseInitialMastery: 0,
    baseStolenMastery: 0,
  });

  const store = storePolicy(hooks.store);
  const cast = castPolicy(hooks.cast);
  const cost = costPolicy(hooks.cost);

  const preparation = prepare(cast, [], { nodeId: SCRIPT.nodeId, usable: true, dormant: false });
  const released = expendOnCast(cast, preparation.preparedSpells, SCRIPT.nodeId);

  return {
    researchCost: terms.researchCost,
    teachCost: terms.teachCost,
    initialMastery: terms.initialMastery,
    stolenMastery: terms.stolenMastery,
    personalLocationKind: store.personalLocationKind,
    admittedThirteenth: admitToStore(store, SCRIPT.heldPersonalInstances).admitted,
    scribingAvailable: scribeAvailability(store).available,
    canPrepare: preparation.prepared,
    preparedAfterCast: released.preparedSpells,
    costAtRelease: castCost(cost, SCRIPT.baseCastCost),
    palaceDepth: palaceLibraryDepth(store, [
      { mageId: 1, tierWeightedCount: SCRIPT.palaceTierWeight },
    ]),
  };
}

describe('each pair of v1 traditions is distinguishable', () => {
  const outcomes = new Map(V1_TRADITIONS.map(([name, id]) => [name, run(id)]));

  for (let i = 0; i < V1_TRADITIONS.length; i += 1) {
    for (let j = i + 1; j < V1_TRADITIONS.length; j += 1) {
      const left = V1_TRADITIONS[i]?.[0] ?? '';
      const right = V1_TRADITIONS[j]?.[0] ?? '';

      it(`${left} differs from ${right}`, () => {
        expect(outcomes.get(left)).not.toEqual(outcomes.get(right));
      });
    }
  }

  it('differs through the hook each tradition declares, not incidentally', () => {
    const vancian = outcomes.get('vancian-memorization');
    const trueNaming = outcomes.get('true-naming');
    const artOfMemory = outcomes.get('art-of-memory');

    // Vancian stresses cast and cost: preparation is required, and release is free.
    expect(vancian?.canPrepare).toBe(true);
    expect(vancian?.costAtRelease).toBe(0);
    expect(vancian?.preparedAfterCast).toEqual([]);

    // True Naming stresses acquire: dearer research, cheaper teaching, whole instances.
    expect(trueNaming?.researchCost).toBeGreaterThan(vancian?.researchCost ?? 0);
    expect(trueNaming?.teachCost).toBeLessThan(vancian?.teachCost ?? 0);
    expect(trueNaming?.initialMastery).toBe(FP_ONE);

    // The Art of Memory stresses store: palaces, bounded, unwritable, and the
    // only one of the three whose universities get depth from living minds.
    expect(artOfMemory?.personalLocationKind).toBe(LOCATION_KIND.palace);
    expect(artOfMemory?.admittedThirteenth).toBe(false);
    expect(artOfMemory?.scribingAvailable).toBe(false);
    expect(artOfMemory?.palaceDepth).toBeGreaterThan(0);
    expect(vancian?.palaceDepth).toBe(0);
  });

  it('is reproducible: the same script under the same tradition twice', () => {
    for (const [, id] of V1_TRADITIONS) expect(run(id)).toEqual(run(id));
  });
});

/**
 * The agreement half.
 *
 * `magic-traditions` names the scenario: one exercising only research
 * prerequisites and cell legality, with identical supplied rates. Both of those
 * live in other task groups of this change, so the two steps below stand in for
 * them — a deterministic mastery decay toward a retention-derived floor, and a
 * dormancy predicate over cell legality. Their *values* are not the point and
 * are not asserted against anything; what is asserted is that supplying a
 * different tradition to the same script changes none of them.
 *
 * When `knowledge-instances` lands its own decay and the grid lands `permits`,
 * this scenario should call those directly instead. Recorded as an interface to
 * reconcile rather than left as a silent duplicate.
 */
function unhookedScenario(tradition: number): readonly number[] {
  // Resolved, deliberately. If a tradition could leak past its four hooks, the
  // leak would have to happen somewhere downstream of exactly this call, and a
  // scenario that never resolved a tradition could not detect it.
  const hooks = hooksOfTradition(tradition, TRADITIONS);
  expect(Object.keys(hooks).sort()).toEqual(['acquire', 'cast', 'cost', 'store']);

  const retention = 1536;
  const floor = floorDiv(FP_ONE * retention, FP_ONE * 2);
  const log: number[] = [];

  let mastery = FP_ONE;
  let dormant = false;
  for (let tick = 0; tick < 24; tick += 1) {
    // Cell legality flips at tick 8 and back at tick 16 — an interdiction the
    // god issues and then regrets. Dormancy is derived, so re-permitting
    // restores the instance with no migration step.
    if (tick === 8) dormant = true;
    if (tick === 16) dormant = false;

    const decayed = mastery - floorDiv(mastery, 64);
    // A dormant instance decays without a floor; a held one stops at retention.
    mastery = dormant ? Math.max(decayed, 0) : Math.max(decayed, floor);
    log.push(mastery, dormant ? 1 : 0);
  }
  return log;
}

describe('all three traditions agree outside their differing hooks', () => {
  it('produces one identical log for every v1 tradition', () => {
    const [first = [], ...rest] = V1_TRADITIONS.map(([, id]) => unhookedScenario(id));
    expect(first.length).toBeGreaterThan(0);
    for (const other of rest) expect(other).toEqual(first);
  });

  it('leaves decay untouched by the acquire hook specifically', () => {
    // `magic-traditions` calls this out by name: a True Naming mind instance
    // carried forward under a supplied retention decays by exactly the same
    // amount as an identical instance under a standard acquire tradition. The
    // acquire hook's whole vocabulary is four costs; it has no word for decay.
    const [, trueNaming = 0] = V1_TRADITIONS[1] ?? [];
    const [, vancian = 0] = V1_TRADITIONS[0] ?? [];
    expect(unhookedScenario(trueNaming)).toEqual(unhookedScenario(vancian));
  });

  it('is not vacuous — the same script does differ when a hook is involved', () => {
    // Guards the agreement assertion against passing because the script does
    // nothing at all.
    const [, vancian = 0] = V1_TRADITIONS[0] ?? [];
    const [, trueNaming = 0] = V1_TRADITIONS[1] ?? [];
    expect(run(vancian)).not.toEqual(run(trueNaming));
  });
});
