/*
 * Multiverse Mages — the per-tick faucet/sink ledger, and the leak that proves
 * it can fail.
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
 * `material-economy` group 6, and `economy-flow-models.md` §5.2's missing class:
 * *"Every metric in the registry measures a level, a rate, or a distribution at
 * a checkpoint. None reconciles flows."*
 *
 * A level tells you the granary is empty. It cannot tell you whether the food
 * was eaten, spilled over a ceiling, or lost by a phase that decremented a stock
 * without telling anybody — and the third produces plausible output
 * indefinitely, because an economy that leaks slowly looks exactly like an
 * economy that is merely poor.
 *
 * ## The half that matters is the leak
 *
 * The assertion runs inside every world tick in this repository and has never
 * fired, which is *not* evidence that it works: `CLAUDE.md` records five
 * checkers in one night that answered confidently about the wrong input. So the
 * control here injects a real, unrecorded drain into the **shipped** tick — not
 * into a re-implementation of it, which could agree with itself while both had
 * drifted — and requires the assertion to fail by exactly the amount stolen and
 * to name the kind and the tick.
 */

import { describe, expect, it } from 'vitest';

import type { SimState } from '@mm/sim-core';
import { step } from '@mm/sim-core';
import { MATERIAL_STOCK, componentOf, findUniverse } from '@mm/state';
import type { MaterialKind } from '@mm/rules-world';
import {
  MATERIAL_KINDS,
  assertMaterialsConserved,
  conservationBreaches,
  zeroAmounts,
} from '@mm/rules-world';

import type { WorldStepDeps } from '../../src/index.js';
import { defineWorldSimulation } from '../../src/index.js';

import { scribingTraditionId, seededWorld, sourceFor, worldDeps } from './world-fixtures.js';

const ROOT_SEED = 0x0247_0006;
const TICKS = 40;

/** Deps with both world-loop sinks priced, so the ledger has flows to reconcile. */
function pricedDeps(): WorldStepDeps {
  return {
    ...worldDeps(scribingTraditionId()),
    teaching: { insightPerMonth: 4, insightTeachBonus: 256 },
    hiredLabour: { laborPerMonth: 4 },
  };
}

/** Runs a world, returning the closing stocks. Throws if conservation fails. */
function run(deps: WorldStepDeps, ticks = TICKS): Record<MaterialKind, number> {
  const simulation = defineWorldSimulation(deps);
  const { state } = seededWorld(simulation.schema, {
    rootSeed: ROOT_SEED,
    traditionId: scribingTraditionId(),
  });
  const source = sourceFor(ROOT_SEED);
  let current: SimState = state;
  for (let tick = 0; tick < ticks; tick += 1) current = step(current, [], source);

  const universe = findUniverse(current);
  const stocks = componentOf(current, MATERIAL_STOCK);
  const closing = zeroAmounts();
  for (const kind of MATERIAL_KINDS) closing[kind] = stocks.get(universe, kind);
  return closing;
}

describe('the ledger balances every tick of a real run', () => {
  it('steps a whole world without the conservation assertion firing', () => {
    // The assertion is inside `step`, so this passing *is* the claim: forty
    // ticks of production, casting, subsistence, scribing, teaching, library
    // upkeep and construction, and every kind's stock moved by exactly what the
    // tick recorded.
    expect(() => run(pricedDeps())).not.toThrow();
  });

  it('actually moved some material, so the run above reconciled something', () => {
    // The control on the control. A world in which nothing was ever produced or
    // consumed satisfies `0 == 0 - 0` for all seven kinds and would pass the
    // assertion above while proving nothing at all.
    const closing = run(pricedDeps());
    const moved = MATERIAL_KINDS.filter((kind) => closing[kind] > 0);
    expect(moved.length).toBeGreaterThan(0);
  });
});

describe('a deliberately leaking flow fails the assertion — task 6.4', () => {
  /**
   * The leak is injected into the **shipped** world loop through
   * `WorldStepDeps.leak`, which removes material from the closing stock and
   * records it as no sink. That is the exact defect shape the ledger exists to
   * catch: a flow that changes a stock without telling anybody.
   */
  it('throws, and the throw is what a passing run above is evidence against', () => {
    expect(() => run({ ...pricedDeps(), leak: { kind: 'food', perTick: 64 } })).toThrow(
      /material conservation failed/u,
    );
  });

  it('names the kind and the tick, which the spec requires of the message', () => {
    let message = '';
    try {
      run({ ...pricedDeps(), leak: { kind: 'vellum', perTick: 32 } });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/vellum/u);
    expect(message).toMatch(/world tick \d+/u);
    // And it reports the arithmetic rather than only the verdict, so a reader
    // is not sent to re-derive by hand what the check already knew.
    expect(message).toMatch(/discrepancy of -32/u);
  });

  it('leaks only the kind it names, so the failure is attributable', () => {
    let message = '';
    try {
      run({ ...pricedDeps(), leak: { kind: 'stone', perTick: 16 } });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/stone/u);
    expect(message).not.toMatch(/food/u);
    expect(message).not.toMatch(/passage/u);
  });

  it('is absent from the deps every ordinary world is built with', () => {
    // **The guard that keeps a test hook from becoming a shipped defect.** The
    // injector lives on the real `WorldStepDeps` so that the control exercises
    // the real loop, and the cost of that choice is exactly this risk: a
    // composition root that set `leak` would quietly destroy material in
    // production, and the conservation assertion would dutifully report the
    // leak it was itself asked to create.
    //
    // Asserted against the shared fixture rather than argued: nothing outside
    // this file sets the field today, and if that changes, the change has to
    // come through here.
    expect(pricedDeps().leak).toBeUndefined();
    expect(worldDeps(scribingTraditionId()).leak).toBeUndefined();
  });

  it('does not fire for a leak of zero, which is the off switch', () => {
    // A control that fires whatever it is handed is not a control. A declared
    // leak of nothing must leave the run exactly as clean as no leak at all.
    expect(() => run({ ...pricedDeps(), leak: { kind: 'food', perTick: 0 } })).not.toThrow();
  });
});

describe('the arithmetic itself, away from a running world', () => {
  const kinds = (values: Partial<Record<MaterialKind, number>>): Record<MaterialKind, number> => ({
    ...zeroAmounts(),
    ...values,
  });

  it('accepts a tick whose stock moved by exactly faucet less sink', () => {
    const ledger = {
      opening: kinds({ food: 100 }),
      closing: kinds({ food: 120 }),
      faucet: kinds({ food: 50 }),
      sink: kinds({ food: 30 }),
    };
    expect(conservationBreaches(ledger)).toEqual([]);
    expect(() => assertMaterialsConserved(ledger, 7)).not.toThrow();
  });

  it('reports material arriving from nowhere as well as material lost', () => {
    // Both signs. A check written as `delta <= expected` would pass a stock that
    // grew without a faucet, which is the more dangerous of the two defects
    // because it reads as a healthy economy.
    const invented = {
      opening: kinds({ stone: 0 }),
      closing: kinds({ stone: 500 }),
      faucet: kinds({ stone: 0 }),
      sink: kinds({ stone: 0 }),
    };
    const breaches = conservationBreaches(invented);
    expect(breaches).toHaveLength(1);
    expect(breaches[0]?.kind).toBe('stone');
    expect(breaches[0]?.discrepancy).toBe(500);
  });

  it('counts a spill as a sink, so a capped inflow still balances', () => {
    // `applyStockCeiling` returns what did not fit precisely so this arithmetic
    // has somewhere to put it. A silent truncation would show up here as a leak
    // — a diagnosis a reader would then have to un-make.
    const spilled = {
      opening: kinds({ insight: 10 }),
      closing: kinds({ insight: 60 }),
      faucet: kinds({ insight: 100 }),
      sink: kinds({ insight: 50 }),
    };
    expect(conservationBreaches(spilled)).toEqual([]);
  });

  it('is exact, with no tolerance for a one-unit drift', () => {
    // Every quantity is a fixed-point integer, so an epsilon would hide exactly
    // the slow leak this exists to find — one unit per tick over a 2,400-tick
    // run is the whole starting endowment.
    const drifted = {
      opening: kinds({ passage: 0 }),
      closing: kinds({ passage: 99 }),
      faucet: kinds({ passage: 100 }),
      sink: kinds({ passage: 0 }),
    };
    expect(conservationBreaches(drifted)).toHaveLength(1);
  });
});
