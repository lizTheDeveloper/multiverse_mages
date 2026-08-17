/*
 * Multiverse Mages — the grade ladder, through the real world loop.
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
 * ## Why this file exists and `economy-grades.test.ts` is not enough
 *
 * That file tests `settleGrades` as arithmetic. This one runs `step` — the real
 * world loop, the real content, the real consumption order — because the
 * campaign's recurring finding is a subsystem that is *built, tested, exported
 * and never invoked*. `advanceConstruction`, `applyLibraryUpkeep` and
 * `UNIVERSITY_STAFF` each had a green unit test and no caller.
 *
 * ## The claim, and the arms that isolate it
 *
 * *"Improving rock is worthless until something needs ore."* Two universes are
 * compared and **they differ in exactly one thing**: whether the universe is
 * holding refined stone. Same seed, same species, same population, same
 * knowledge — every mage in both arms knows `cig-the-standing-furnace`, and both
 * are committed to practising it.
 *
 * That isolation is deliberate and it was got wrong once on the way here. The
 * obvious pair — *knows the rung* against *does not* — also differs by two
 * `resource-yield` nodes, so any divergence is confounded with simply knowing
 * more magic. `universe-effects.ts` makes the same argument about ablation: *"an
 * empty list is a universe that never learned the magic, while a neutralized
 * primitive is one that researched it, paid for it and got nothing."* Only the
 * second isolates anything.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle, SimState } from '@mm/sim-core';
import { rngFromRootSeed, step } from '@mm/sim-core';
import {
  GOAL_COMMITMENT,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MATERIAL_GRADE,
  attachRecord,
  componentOf,
  findUniverse,
} from '@mm/state';
import { GOAL } from '@mm/rules-world';

import type { WorldStepDeps, WorldStepReport } from '../../src/index.js';
import { defineWorldSimulation, universeEffectIndex } from '../../src/index.js';
import { registry, seededWorld, traditionNamed, worldDeps } from './world-fixtures.js';

const ROOT_SEED = 20260816;
const TICKS = 8;

/** Seeded ore, well above the twelve furnaces' combined demand for one tick. */
const SEEDED_ORE = 4096;

function nodeContentId(stringId: string): number {
  const found = registry().nodes.find((entry) => entry.record.id === stringId);
  if (found === undefined) throw new Error(`node.json declares no "${stringId}"`);
  return found.contentId;
}

function depsWithEconomy(): WorldStepDeps {
  return {
    ...worldDeps(traditionNamed('true-naming')),
    universeEffects: universeEffectIndex(registry()),
  };
}

function grant(state: SimState, mage: EntityHandle, node: number): void {
  attachRecord(state, KNOWLEDGE_INSTANCE, state.entities.create(), {
    nodeId: node,
    locationKind: LOCATION_KIND.mind,
    locationId: mage,
    acquiredTick: 0,
    mastery: 1024,
  });
}

interface Arm {
  readonly reports: readonly WorldStepReport[];
  /** `-1` when the universe never grew a `material-grade` row at all. */
  readonly worked: readonly number[];
  readonly fine: readonly number[];
}

/**
 * @param knowsRungs Whether every mage knows the two rungs of the ladder.
 * @param seededOre Refined stone the universe starts holding.
 */
function run(options: { knowsRungs: boolean; seededOre?: number }): Arm {
  const simulation = defineWorldSimulation(depsWithEconomy());
  const { state, mages } = seededWorld(simulation.schema, { rootSeed: ROOT_SEED });

  const seeded = options.seededOre ?? 0;
  if (seeded > 0) {
    attachRecord(state, MATERIAL_GRADE, findUniverse(state) as EntityHandle, {
      stoneWorked: seeded,
      stoneFine: seeded,
    });
  }

  const furnace = nodeContentId('cig-the-standing-furnace');
  for (const mage of mages) {
    if (options.knowsRungs) {
      grant(state, mage, nodeContentId('mt-turn-the-poor-ore'));
      grant(state, mage, nodeContentId('mn-call-it-iron-until-it-is'));
    }
    grant(state, mage, furnace);
    // The furnace's `resource-yield` is gathered from **practised** instances,
    // so without this the gate would read shut in every arm for a reason that
    // has nothing to do with ore — the shape of an ablation that is a null by
    // construction. Autonomy re-evaluates and replaces this commitment, which
    // is why the consumer assertions below are pinned to the first tick.
    attachRecord(state, GOAL_COMMITMENT, mage, {
      goalId: GOAL.practice,
      targetNodeId: furnace,
      adoptedTick: 0,
      score: 4096,
    });
  }

  const reports: WorldStepReport[] = [];
  const worked: number[] = [];
  const fine: number[] = [];
  let current = state;
  for (let tick = 0; tick < TICKS; tick += 1) {
    current = step(current, [], rngFromRootSeed(ROOT_SEED));
    const report = simulation.lastReport();
    if (report !== undefined) reports.push(report);
    const universe = findUniverse(current) as EntityHandle;
    const store = componentOf(current, MATERIAL_GRADE);
    worked.push(store.has(universe) ? store.get(universe, 'stoneWorked') : -1);
    fine.push(store.has(universe) ? store.get(universe, 'stoneFine') : -1);
  }
  return { reports, worked, fine };
}

const refining = run({ knowsRungs: true });
const barren = run({ knowsRungs: false });
const stocked = run({ knowsRungs: false, seededOre: SEEDED_ORE });

describe('the ladder actually turns in the world loop', () => {
  it('refines rock into ore, tick after tick, out of the consumption order', () => {
    expect(refining.reports[0]?.refiningPaid).toBeGreaterThan(0);
    expect(refining.worked[0]).toBeGreaterThan(0);
    // Monotone while the rung is paid, which is what a standing conversion is.
    expect(refining.worked[3] as number).toBeGreaterThan(refining.worked[0] as number);
  });

  it('takes a second tick to reach the grade above, and never one', () => {
    // `mt-turn-the-poor-ore`: *"the working improves a thing by one step and has
    // never once been made to take two."* Both rungs are known from tick 0 and
    // the universe starts with nothing refined, so the only ore that exists on
    // tick 0 is the ore made on tick 0 — and it does not climb again until the
    // tick after.
    expect(refining.fine[0]).toBe(0);
    expect(refining.fine[1] as number).toBeGreaterThan(0);
  });

  it('POSITIVE CONTROL: the zero above is the one-step rule, not a dead rung', () => {
    // The same run, later. If `stoneFine` never moved at all, the assertion
    // above would be satisfied by a rung that does nothing — which is exactly
    // how a mechanic gets shipped dead.
    expect(refining.fine[TICKS - 1] as number).toBeGreaterThan(refining.fine[1] as number);
  });

  it('leaves a universe that knows no rung with no refined material at all', () => {
    // `-1` is "no `material-grade` row", not "a row of zeroes". A universe that
    // never refines never grows one, which is what keeps *absent means grade
    // zero* true of a live world and not only of an old save.
    expect(barren.worked.every((value) => value === -1)).toBe(true);
    expect(barren.reports.every((report) => report.refiningPaid === 0)).toBe(true);
  });
});

describe('a downstream consumer requires a grade, and that is what makes the rung worth learning', () => {
  /**
   * `stocked` and `barren` know identical magic and differ only in whether the
   * universe holds ore. `cig-the-standing-furnace` *"runs the great foundries"*,
   * and a foundry runs on ore.
   */
  it('POSITIVE CONTROL: the gate opens for a universe holding ore', () => {
    // Asserted before the negative, so "refused" below cannot be a demand that
    // could never be met.
    expect(stocked.reports[0]?.gradeGateShut).toBe(0);
  });

  it('refuses every furnace in a universe that cannot make ore', () => {
    expect(barren.reports[0]?.gradeGateShut).toBeGreaterThan(0);
  });

  it('diverges in production, which is a number a player reads off the stocks', () => {
    const withOre = stocked.reports[0]?.producedByKind.stone as number;
    const withoutOre = barren.reports[0]?.producedByKind.stone as number;

    expect(withOre).toBeGreaterThan(withoutOre);
    // Not a rounding difference: the furnaces are a large fraction of the
    // tick's quarrying. The magnitudes are untuned — `release-plan.md` forbids
    // any claim that they are balanced — so what is pinned is the *sign and
    // scale* of the divergence, not the figures.
    expect(withOre).toBeGreaterThan(withoutOre * 2);
  });

  it('eats what it runs on, and only what it runs on', () => {
    // A gate destroys as a side effect of running. The stocked arm's holding
    // falls on the tick its furnaces fire, by the demand they were priced at.
    const opening = SEEDED_ORE;
    const afterFirst = stocked.worked[0] as number;
    expect(afterFirst).toBeLessThan(opening);

    // And the barren arm destroys nothing, because nothing ran. That is the
    // difference between a gate and a drain, measured rather than asserted.
    expect(barren.worked[0]).toBe(-1);
  });

  it('POSITIVE CONTROL: the two arms are otherwise the same universe', () => {
    // If the arms differed in population or in what they knew, every assertion
    // above would be about something else. Both are seeded identically and both
    // are given the same knowledge; the only edit is the `material-grade` row.
    expect(barren.reports[0]?.carryingCapacity).toBe(stocked.reports[0]?.carryingCapacity);
    expect(barren.reports[0]?.economicNodes).toBe(stocked.reports[0]?.economicNodes);
  });
});
