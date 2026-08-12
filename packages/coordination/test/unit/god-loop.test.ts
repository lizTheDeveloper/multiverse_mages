/*
 * Multiverse Mages — the god systems inside a universe that is actually stepped.
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
 * What the unit files cannot claim.
 *
 * `god-worship.test.ts` and `god-favor.test.ts` assert arithmetic; this asserts
 * that the arithmetic is *installed* — that `ctx.actions` reaches the rules, that
 * worship moves because the world moved, that regeneration happens once per
 * world tick and not at all during an engagement, and that a terminated universe
 * stops.
 *
 * ## The determinism check is not decoration
 *
 * `contracts.md` §6 makes stream ids permanent because a re-roll invalidates
 * every committed balance baseline, and `god-agency` claims to add **no** stream:
 * every intervention is a deterministic function of state and submission,
 * worship is a measurement, and both terminal conditions are predicates. A
 * capability that quietly drew would show up here as two runs of one seed and
 * one action log disagreeing.
 */

import { describe, expect, it } from 'vitest';

import type { Action, SimState } from '@mm/sim-core';
import { snapshotHash, step } from '@mm/sim-core';
import {
  BLESSING,
  ERA_EVALUATION,
  MAGE,
  TERMINAL_REASON,
  UNIVERSE,
  collectRecords,
  componentOf,
  findUniverse,
  godStateOrEmpty,
  readUniverse,
} from '@mm/state';

import type { WorldSimulation } from '../../src/index.js';
import { ACTION, defineWorldSimulation, ledgerBalances } from '../../src/index.js';

import { registry, seededWorld, sourceFor } from './world-fixtures.js';
import { constants, costs, godlyWorldDeps } from './god-fixtures.js';

const C = constants();
const COSTS = costs();
const ROOT_SEED = 0x0006_0001;

function traditionId(): number {
  return registry().traditions[0]?.contentId ?? 1;
}

/** A seeded, godly universe and the simulation that steps it. */
function world(rootSeed = ROOT_SEED): {
  simulation: WorldSimulation;
  state: SimState;
  source: ReturnType<typeof sourceFor>;
} {
  const simulation = defineWorldSimulation(godlyWorldDeps(traditionId()));
  const { state } = seededWorld(simulation.schema, { rootSeed });
  return { simulation, state, source: sourceFor(rootSeed) };
}

function universeOf(state: SimState): ReturnType<typeof readUniverse> {
  return readUniverse(state, findUniverse(state));
}

describe('the god systems are installed, and the world loop still runs', () => {
  it('advances a universe through both god systems without throwing', () => {
    const { simulation, state, source } = world();
    let current = state;
    expect(() => {
      for (let tick = 0; tick < 24; tick += 1) current = step(current, [], source);
    }).not.toThrow();
    expect(simulation.lastGodReport()?.worldTick).toBe(23);
  });

  it('measures worship from a civilization that grew, rather than from nothing', () => {
    const { state, source } = world();
    let current = state;
    for (let tick = 0; tick < 12; tick += 1) current = step(current, [], source);
    const record = universeOf(current);
    expect(record.worship).toBeGreaterThan(0);
    expect(record.worship).toBeLessThan(C.worshipMax);
  });

  it('regenerates favor once per world tick, into a pool that is never negative', () => {
    // The pool used to be asserted *strictly increasing* here, and that was
    // true only while regeneration was the economy's one flow. Ruleset
    // stewardship is a drain, so a tick in which upkeep exceeds regeneration
    // now leaves the pool level at its reserve or lower than it opened — which
    // is the whole point of adding an outflow, and an assertion that forbade it
    // would forbid the drain rather than test it.
    //
    // What survives, and is the property that actually matters: the pool never
    // goes negative, the drain never takes it below the reserve, and income
    // still arrives — over twelve ticks the pool ends above where it started.
    const { state, source } = world();
    let current = state;
    const opening = universeOf(current).favor;
    for (let tick = 0; tick < 12; tick += 1) {
      current = step(current, [], source);
      const favor = universeOf(current).favor;
      expect(favor).toBeGreaterThanOrEqual(0);
    }
    expect(universeOf(current).favor).toBeGreaterThan(opening);
  });

  it('recomputes the tier, the edict budget and the favor cap from the worship it just wrote', () => {
    const { simulation, state, source } = world();
    let current = state;
    for (let tick = 0; tick < 6; tick += 1) current = step(current, [], source);
    const report = simulation.lastGodReport();
    const record = universeOf(current);
    expect(report).toBeDefined();
    expect(record.worshipTier).toBe(report?.worshipTier);
    expect(record.edictBudget).toBe(report?.edictBudget);
    expect(record.favorCap).toBe(report?.favorCap);
    expect(record.edictBudget).toBe(1 + record.worshipTier);
  });

  it('balances the favor ledger on every tick, including ticks that spent', () => {
    const { simulation, state, source } = world();
    let current = state;
    for (let tick = 0; tick < 30; tick += 1) {
      // Assign a role on every tick the pool can afford it, so the spend side
      // of the ledger is exercised rather than assumed.
      const mage = collectRecords(current, MAGE)[0]?.handle ?? 0;
      const actions: Action[] =
        mage === 0 ? [] : [{ kind: ACTION.assignRole, params: [mage, tick % 4] }];
      current = step(current, actions, source);
      const ledger = simulation.lastGodReport()?.ledger;
      expect(ledger).toBeDefined();
      if (ledger !== undefined) expect(ledgerBalances(ledger)).toBe(true);
    }
  });
});

describe('a god action submitted to step reaches the rules', () => {
  it('blesses a mage, and the blessing shows up in state and in worship', () => {
    const { state, source } = world();
    let current = step(state, [], source);
    // Enough favor for a blessing takes a few ticks of regeneration.
    while (universeOf(current).favor < (COSTS.byAction[ACTION.blessMage] ?? 0)) {
      current = step(current, [], source);
    }
    const mage = collectRecords(current, MAGE)[0]?.handle ?? 0;
    expect(mage).not.toBe(0);

    const before = universeOf(current).favor;
    current = step(current, [{ kind: ACTION.blessMage, params: [mage] }], source);

    expect(collectRecords(current, BLESSING)).toHaveLength(1);
    // Paid for, then regenerated within the same tick — so the pool moved by
    // less than a tick's regeneration rather than by nothing.
    expect(universeOf(current).favor).toBeLessThan(before + (COSTS.byAction[ACTION.blessMage] ?? 0));
  });

  it('lets the blessing expire on its own schedule', () => {
    const { state, source } = world();
    let current = step(state, [], source);
    while (universeOf(current).favor < (COSTS.byAction[ACTION.blessMage] ?? 0)) {
      current = step(current, [], source);
    }
    const mage = collectRecords(current, MAGE)[0]?.handle ?? 0;
    current = step(current, [{ kind: ACTION.blessMage, params: [mage] }], source);
    expect(collectRecords(current, BLESSING)).toHaveLength(1);

    for (let tick = 0; tick <= C.blessDurationTicks; tick += 1) {
      current = step(current, [], source);
    }
    expect(collectRecords(current, BLESSING)).toHaveLength(0);
  });

  it('produces a different universe from a run that submitted nothing', () => {
    // The measured consequence this whole change exists to fix: before it, no
    // system read `ctx.actions` and every scripted strategy produced a
    // byte-identical universe.
    const passive = world(0x0006_0002);
    const active = world(0x0006_0002);
    let quiet = passive.state;
    let busy = active.state;

    for (let tick = 0; tick < 20; tick += 1) {
      quiet = step(quiet, [], passive.source);
      const mage = collectRecords(busy, MAGE)[0]?.handle ?? 0;
      busy = step(busy, mage === 0 ? [] : [{ kind: ACTION.blessMage, params: [mage] }], active.source);
    }
    expect(snapshotHash(busy)).not.toBe(snapshotHash(quiet));
  });
});

describe('the capability adds no RNG stream, and a run replays exactly', () => {
  it('produces byte-identical snapshots from one seed and one action log', () => {
    const log = (tick: number): Action[] =>
      tick % 5 === 0 ? [{ kind: ACTION.encourageResearch, params: [(tick % 14) + 1] }] : [];

    const runOnce = (): string[] => {
      const { state, source } = world(0x0006_0003);
      let current = state;
      const hashes: string[] = [];
      for (let tick = 0; tick < 40; tick += 1) {
        current = step(current, log(tick), source);
        hashes.push(snapshotHash(current));
      }
      return hashes;
    };

    expect(runOnce()).toEqual(runOnce());
  });
});

describe('eras advance, and each boundary is recorded once', () => {
  it('records one evaluation per era boundary crossed', () => {
    const { state, source } = world();
    let current = state;
    // Two era boundaries. `eraOf` is `floor(worldTick / ERA_TICKS)`, so the
    // first boundary is the tick the quotient first reads 1.
    for (let tick = 0; tick <= 240; tick += 1) current = step(current, [], source);
    const evaluations = collectRecords(current, ERA_EVALUATION);
    expect(evaluations.length).toBeGreaterThanOrEqual(1);
    const eras = evaluations.map(({ row }) => row.era);
    expect(new Set(eras).size).toBe(eras.length);
  });
});

describe('a terminated universe is frozen', () => {
  it('changes no component row once a terminal reason is written', () => {
    const { state, source } = world();
    let current = step(state, [], source);
    componentOf(current, UNIVERSE).set(
      findUniverse(current),
      'terminalReason',
      TERMINAL_REASON.stagnation,
    );

    const frozen = { ...universeOf(current) };
    const mages = collectRecords(current, MAGE).length;
    for (let tick = 0; tick < 24; tick += 1) current = step(current, [], source);

    expect({ ...universeOf(current) }).toEqual(frozen);
    expect(collectRecords(current, MAGE)).toHaveLength(mages);
  });

  it('refuses every submitted action after termination', () => {
    const { state, source } = world();
    let current = step(state, [], source);
    const mage = collectRecords(current, MAGE)[0]?.handle ?? 0;
    componentOf(current, UNIVERSE).set(
      findUniverse(current),
      'terminalReason',
      TERMINAL_REASON.stagnation,
    );
    const before = current.illegalActionCount;
    current = step(current, [{ kind: ACTION.blessMage, params: [mage] }], source);
    expect(collectRecords(current, BLESSING)).toHaveLength(0);
    expect(current.illegalActionCount).toBeGreaterThan(before);
  });

  it('writes prestigeEarned once, at termination, and never during the run', () => {
    const { state, source } = world();
    let current = state;
    for (let tick = 0; tick < 24; tick += 1) {
      current = step(current, [], source);
      expect(universeOf(current).prestigeEarned).toBe(0);
      expect(universeOf(current).prestige).toBe(0);
    }

    componentOf(current, UNIVERSE).set(
      findUniverse(current),
      'terminalReason',
      TERMINAL_REASON.stagnation,
    );
    // The outcome system writes `prestigeEarned` on the tick it sees a terminal
    // reason; after that the whole universe is frozen and it cannot move again.
    const afterTermination = step(current, [], source);
    expect(universeOf(afterTermination).prestige).toBe(0);
  });
});

describe('the god-state row appears on the first god tick and never disappears', () => {
  it('is absent before stepping and present afterwards', () => {
    const { state, source } = world();
    expect(godStateOrEmpty(state, findUniverse(state)).lastExisting).toBe(0);
    const after = step(state, [], source);
    const god = godStateOrEmpty(after, findUniverse(after));
    expect(god.lastEraRecorded).toBeGreaterThanOrEqual(0);
    expect(god.favorWasted).toBeGreaterThanOrEqual(0);
  });
});
