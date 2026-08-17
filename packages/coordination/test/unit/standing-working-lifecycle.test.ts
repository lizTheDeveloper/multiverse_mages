/*
 * Multiverse Mages — a working stands, expires, and must be renewed.
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
 * The behavioural half of `working-duration`, in the world loop rather than in
 * the gather.
 *
 * `zero-duration-is-not-expiry.test.ts` proves the gate fires and does not fire
 * over `gatherEffects`. This file proves the three things that only a stepped
 * universe can say:
 *
 * 1. **A working reverts.** Both arms: the contribution is there *within* the
 *    duration and gone after it, and the tick it goes is the tick the report
 *    says it went.
 * 2. **An absent row is not a lapse.** A save written before this component
 *    existed migrates to an empty section, and the first tick of the restored
 *    universe reports **zero** lapses rather than lapsing everything at once.
 *    That is the failure a synthesized `expiresTick: 0` would have caused, and
 *    it throws nothing — it looks exactly like the rule working.
 * 3. **A mage chooses to renew, and the month is visibly spent.** Against a
 *    control in which nothing can be lit, so "the goal was never selected" and
 *    "the goal does not exist" are distinguishable.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle, SimState } from '@mm/sim-core';
import { decodeSnapshot, encodeSnapshot, rngFromRootSeed, serializeState, step } from '@mm/sim-core';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  STANDING_WORKING,
  attachRecord,
  componentOf,
  findUniverse,
  loadWorldSnapshot,
  readRulesetForObservation,
  worldSchemaVersionOf,
} from '@mm/state';
import { GOAL } from '@mm/rules-world';

import type { WorldStepDeps, WorldStepReport } from '../../src/index.js';
import {
  buildWorkingDurations,
  defineWorldSimulation,
  establishOrRenewWorking,
  universeEffectIndex,
  universeEconomyBonuses,
} from '../../src/index.js';

import {
  catalogAndCells,
  registry,
  scribingTraditionId,
  seededWorld,
  worldDeps,
} from './world-fixtures.js';

const ROOT_SEED = 0x0d17_0001;

/**
 * *Muto Herbam*, tier 3, `build-rate` and `resource-yield` at
 * `target: "universe"`, authored at **24** ticks.
 *
 * Chosen because its gloss is the sharpest statement of the mechanic in the
 * whole grid — *"Halls built this way cannot be repaired by anyone who does not
 * also hold the working"* — and because `build-rate` is the one economic
 * primitive `universe-effects.ts` deliberately leaves ungated on practice, so
 * a contribution appearing or vanishing here is the standing gate and nothing
 * else.
 */
const DURABLE_NODE = 'mh-the-grown-beam';
const DURABLE_TICKS = 24;

function nodeContentId(stringId: string): number {
  const found = registry().nodes.find((entry) => entry.record.id === stringId);
  if (found === undefined) throw new Error(`node.json declares no "${stringId}"`);
  return found.contentId;
}

/** The authored duration, read from content rather than from the literal above. */
function authoredTicks(stringId: string): number {
  return buildWorkingDurations(registry()).durationOf(nodeContentId(stringId));
}

function depsWithEconomy(): WorldStepDeps {
  return { ...worldDeps(scribingTraditionId()), universeEffects: universeEffectIndex(registry()) };
}

/** The same deps, plus the wire that lets a mage light and renew a working. */
function depsWithUpkeep(): WorldStepDeps {
  return { ...depsWithEconomy(), workingDurations: buildWorkingDurations(registry()) };
}

function grantToEveryMage(state: SimState, mages: readonly EntityHandle[], nodeId: number): void {
  for (const mage of mages) {
    const instance = state.entities.create();
    attachRecord(state, KNOWLEDGE_INSTANCE, instance, {
      nodeId,
      locationKind: LOCATION_KIND.mind,
      locationId: mage,
      acquiredTick: 0,
      mastery: 1024,
    });
  }
}

/**
 * How many `build-rate` magnitudes the universe's knowledge contributes.
 *
 * **Only ever called on a state a `step` returned**, and that is not a
 * stylistic preference. `universeEconomyBonuses` memoizes on the `SimState`
 * object exactly as `god/effects.ts` does — `step` clones per tick, so a new
 * tick is a new key — which means calling it twice on one object either side of
 * a mutation returns the *first* answer both times. A test that lit a working
 * and re-measured the same object would report "the gate does nothing" with
 * complete confidence.
 *
 * So each measurement here is a different tick's state, and the value returned
 * is the one the tick's own economy phase computed rather than a second
 * derivation of it.
 */
function buildRateContributions(state: SimState, deps: WorldStepDeps): number {
  const index = deps.universeEffects;
  if (index === undefined) throw new Error('this measurement needs the economy index');
  const { cells } = catalogAndCells();
  const ruleset = readRulesetForObservation(state, findUniverse(state));
  return universeEconomyBonuses(state, { index, cells, ruleset }).buildRate.length;
}

describe('a working stands, and then it does not', () => {
  it('contributes inside its duration and stops contributing outside it', () => {
    const deps = depsWithEconomy();
    const simulation = defineWorldSimulation(deps);
    const { state, mages } = seededWorld(simulation.schema, { rootSeed: ROOT_SEED });
    const nodeId = nodeContentId(DURABLE_NODE);
    grantToEveryMage(state, mages, nodeId);

    // Not vacuous: the node really is authored with a duration, read from the
    // content rather than from the literal at the top of this file. A run in
    // which `authoredTicks` came back `0` would pass every assertion below by
    // making the gate unreachable.
    expect(authoredTicks(DURABLE_NODE)).toBe(DURABLE_TICKS);

    // **The negative arm first**, so that the positive one is a change and not
    // a state. Nobody has lit anything, so the duration-bearing effect is not
    // in the economy at all — which is the whole premise: worn, not granted.
    const unlit = step(state, [], rngFromRootSeed(ROOT_SEED));
    expect(buildRateContributions(unlit, deps)).toBe(0);

    const holder = mages[0];
    if (holder === undefined) throw new Error('the fixture seeded no mages');
    establishOrRenewWorking(unlit, holder, nodeId, unlit.clock.worldTick, DURABLE_TICKS);

    // Lit, and read on the next tick's state — see `buildRateContributions`.
    // A working lit during a tick's work phase reaches the economy on the tick
    // after, which is `spendTheMonth`'s own convention: the economy counts the
    // mages who are about to spend the month, and the same mages then spend it.
    const held = step(unlit, [], rngFromRootSeed(ROOT_SEED));
    expect(buildRateContributions(held, deps)).toBe(1);
  });

  it('reverts on the tick its duration runs out, and says so', () => {
    // **`workingDurations` deliberately absent.** `sustain-working` is masked
    // for every mage, so nobody can renew what this test lights by hand — which
    // is what isolates the lapse from the rota. The sweep runs regardless: it is
    // not gated on the index, because a working already standing has to end
    // whether or not anybody could have renewed it.
    const deps = depsWithEconomy();
    const simulation = defineWorldSimulation(deps);
    const { state, mages } = seededWorld(simulation.schema, { rootSeed: ROOT_SEED });
    const nodeId = nodeContentId(DURABLE_NODE);
    grantToEveryMage(state, mages, nodeId);
    const holder = mages[0];
    if (holder === undefined) throw new Error('the fixture seeded no mages');
    establishOrRenewWorking(state, holder, nodeId, state.clock.worldTick, DURABLE_TICKS);

    const reports: WorldStepReport[] = [];
    let current = state;
    let contributionsAtTen = -1;
    for (let tick = 0; tick < DURABLE_TICKS + 4; tick += 1) {
      current = step(current, [], rngFromRootSeed(ROOT_SEED));
      const report = simulation.lastReport();
      if (report !== undefined) reports.push(report);
      if (tick === 10) contributionsAtTen = buildRateContributions(current, deps);
    }

    // The positive control, taken mid-run: the working is still standing at
    // tick 10 and the economy can still feel it. Without this the assertions
    // below are satisfied by a gate that refused from the first tick.
    expect(contributionsAtTen).toBe(1);

    const lapsed = reports.filter((report) => report.workingsLapsed > 0);
    expect(lapsed.length).toBe(1);
    expect(lapsed[0]?.workingsLapsedNodes).toEqual([nodeId]);

    // And the revert is in the economy, not only on the report.
    expect(buildRateContributions(current, deps)).toBe(0);
    expect(componentOf(current, STANDING_WORKING).size).toBe(0);
  });
});

describe('an absent row is never lit, which is not the same as expired', () => {
  it('restores a pre-revision-12 save with nothing standing and nothing lapsing', () => {
    // The failure this pins is the one that throws nothing: a migration that
    // synthesised rows at `expiresTick: 0` would make every save written before
    // world-schema revision 12 lapse every working in the universe on its first
    // tick, and it would look exactly like the rule working.
    const deps = depsWithUpkeep();
    const simulation = defineWorldSimulation(deps);
    const { state, mages } = seededWorld(simulation.schema, { rootSeed: ROOT_SEED });
    grantToEveryMage(state, mages, nodeContentId(DURABLE_NODE));

    const envelope = decodeSnapshot(serializeState(state));
    const older = {
      ...envelope,
      components: envelope.components.filter(
        (component) => component.name !== STANDING_WORKING.name,
      ),
    };
    // The fixture is the claim: this really is a save from before
    // `standing-working` existed, not a current one with a name filtered out of
    // the assertion.
    //
    // **The number moved from 11 to 12 on the merge, and moved for the reason
    // the assertion exists to detect.** `w/exp-duration` authored `11` because
    // `standing-working` was revision 12 in that tree and 11 was what preceded
    // it. `w/exp-grades` then landed `material-grade` as revision 12 and
    // `standing-working` was renumbered to 13, so the envelope this fixture
    // builds — everything but `standing-working` — is a **12**. Nothing
    // behavioural moved: every assertion below this line passed unchanged, and
    // the migration still appends an empty section rather than synthesising
    // rows.
    expect(worldSchemaVersionOf(older)).toBe(12);

    // `simulation.schema`, not `defineWorldStateSchema()`. The bare schema
    // declares the same components and **no systems**, so a state loaded into
    // it steps without running the world loop at all — and `lastReport()` comes
    // back `undefined`, which `?.` would have quietly turned into a passing
    // assertion about nothing.
    const restored = loadWorldSnapshot(encodeSnapshot(older), simulation.schema);
    expect(componentOf(restored, STANDING_WORKING).size).toBe(0);

    // Stepped in the real world loop, because "the section is empty" and "the
    // tick reports no lapse" are two different claims and only the second is
    // the one that matters. An empty section that some later reader treated as
    // a shortage would satisfy the first and fail this.
    const stepped = step(restored, [], rngFromRootSeed(ROOT_SEED));
    const report = simulation.lastReport();
    expect(report?.workingsLapsed).toBe(0);
    expect(report?.workingsLapsedNodes).toEqual([]);
    void stepped;
  });

  it('is a real distinction: a row that has expired does report a lapse', () => {
    // The positive control for the assertion above, on the same world loop. If
    // the report's `workingsLapsed` could only ever read zero, the migration
    // test would be a metric that cannot fail — which this campaign has found
    // five times.
    const deps = depsWithEconomy();
    const simulation = defineWorldSimulation(deps);
    const { state, mages } = seededWorld(simulation.schema, { rootSeed: ROOT_SEED });
    const holder = mages[0];
    if (holder === undefined) throw new Error('the fixture seeded no mages');
    grantToEveryMage(state, mages, nodeContentId(DURABLE_NODE));
    // Lit in the past: `expiresTick` is already behind the clock, so the very
    // first sweep ends it.
    // Well behind the clock, so the first sweep ends it whatever tick the
    // fixture's clock starts on.
    establishOrRenewWorking(state, holder, nodeContentId(DURABLE_NODE), -1000, DURABLE_TICKS);

    step(state, [], rngFromRootSeed(ROOT_SEED));
    expect(simulation.lastReport()?.workingsLapsed).toBe(1);
  });
});

describe('a mage chooses to renew, and the month is spent', () => {
  function run(deps: WorldStepDeps, ticks: number) {
    const simulation = defineWorldSimulation(deps);
    const { state, mages } = seededWorld(simulation.schema, {
      rootSeed: ROOT_SEED,
      withUniversity: true,
    });
    grantToEveryMage(state, mages, nodeContentId(DURABLE_NODE));
    const reports: WorldStepReport[] = [];
    let current = state;
    for (let tick = 0; tick < ticks; tick += 1) {
      current = step(current, [], rngFromRootSeed(ROOT_SEED));
      const report = simulation.lastReport();
      if (report !== undefined) reports.push(report);
    }
    const upkeepMonths = reports.reduce(
      (total, report) => total + (report.monthsByGoal[GOAL.sustainWorking] ?? 0),
      0,
    );
    return {
      reports,
      finalState: current,
      upkeepMonths,
      lit: reports.reduce((total, report) => total + report.workingsLit, 0),
      renewed: reports.reduce((total, report) => total + report.workingsRenewed, 0),
      research: reports.reduce(
        (total, report) => total + (report.monthsByGoal[GOAL.researchNode] ?? 0),
        0,
      ),
      // Every month spent on anything other than upkeep. The denominator the
      // tradeoff is actually against — see the assertion that reads it.
      otherMonths: reports.reduce(
        (total, report) =>
          total +
          report.monthsByGoal.reduce(
            (sum, months, goal) => (goal === GOAL.sustainWorking ? sum : sum + months),
            0,
          ),
        0,
      ),
      totalMonths: reports.reduce(
        (total, report) => total + report.monthsByGoal.reduce((sum, months) => sum + months, 0),
        0,
      ),
    };
  }

    const treatment = run(depsWithUpkeep(), 60);
  const control = run(depsWithEconomy(), 60);

  it('spends months on upkeep that the control spends elsewhere', () => {
    // The month is the cost, and the report counts it in the same array every
    // other goal is counted in — so "a month of upkeep" and "a month of
    // research" are the same unit and the tradeoff is arithmetic rather than
    // asserted.
    expect(treatment.upkeepMonths).toBeGreaterThan(0);
    // The control is the ablation of the *wire*, not of the goal: same content,
    // same seed, same roster, no duration index. `sustain-working` is masked, so
    // every month it would have taken goes somewhere else.
    expect(control.upkeepMonths).toBe(0);
    expect(control.lit).toBe(0);
    expect(control.renewed).toBe(0);
  });

  it('lights a working with one of those months, and keeps it with the rest', () => {
    expect(treatment.lit).toBeGreaterThan(0);
    // Renewal, not merely lighting. A run that only ever lit would mean the
    // urgency term never fired and upkeep was a one-off purchase.
    expect(treatment.renewed).toBeGreaterThan(0);
  });

  it('takes those months out of everything else, one for one', () => {
    // The tradeoff, measured rather than argued, and measured against the right
    // denominator. The first version of this compared **research** months and
    // it came out exactly equal — which read as "upkeep costs nothing" and was
    // in fact "the mages who went on upkeep would have been scribing". The
    // months are fungible; which goal they came out of is a property of the
    // roster, not of the mechanic.
    //
    // So the claim is the one the mechanic actually makes: the two runs have
    // the same mages alive for the same ticks and therefore the same number of
    // months to spend, and every month upkeep took is a month nothing else got.
    expect(treatment.totalMonths).toBe(control.totalMonths);
    expect(treatment.otherMonths).toBe(control.totalMonths - treatment.upkeepMonths);
    expect(treatment.otherMonths).toBeLessThan(control.otherMonths);
  });

  it('is a rota rather than a treadmill: most months still go elsewhere', () => {
    // `GOAL_BASE_APPEAL` sits `sustain-working` level with `apply-magic`, and
    // what keeps it from taking every month is candidacy: a working with years
    // left is not in `sustainableTargets` at all, so the mage holding it is
    // masked out of the goal until its renewal window opens. A universe in
    // which upkeep took most of the months would mean that window was wrong,
    // and the failure would look like a universe that had simply stopped
    // learning.
    expect(treatment.upkeepMonths * 4).toBeLessThan(treatment.totalMonths);
    expect(treatment.research).toBeGreaterThan(0);
  });
});
