/*
 * Multiverse Mages — the founding-grant budget as a swept parameter.
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
 * A budget that only content could set would not be measurable: `worldDeps`
 * resolves the god constants once per worker and shares the frozen struct across
 * every run that worker executes, so two arms of one sweep could never disagree
 * about it. Seeding the budget into state at founding is what makes it a swept
 * parameter, and these tests pin the three properties that has to have.
 *
 * 1. **A sweep that names nothing gets content's numbers**, so every committed
 *    sweep file keeps running the experiment it was written to run.
 * 2. **A sweep that names a level gets that level**, per run.
 * 3. **The scenario's own tick-zero grants are recorded as seeded**, so the
 *    accrual never credits a universe with discovering what a god handed it.
 *    Without this the richer cells of every sweep would quietly mint budget the
 *    poorer ones did not — an undeclared factor interaction, in the direction
 *    that flatters the mechanic.
 */

import { GRANT_BUDGET, componentOf, findUniverse, readRecord } from '@mm/state';
import type { SimState } from '@mm/sim-core';
import {
  REFERENCE_FACTOR_IDS,
  referenceContent,
  referenceOptions,
  referenceScenario,
} from '@mm/scenario';
import { resolveGodContent } from '@mm/coordination';
import { describe, expect, it } from 'vitest';

/** One content resolution for the whole file. It is read-only. */
const content = referenceContent();
const CONSTANTS = resolveGodContent(content.registry).constants;

const SEED = 0x0069_0001;

function build(options: Record<string, number>): SimState {
  return referenceScenario(content).scenario.create(SEED, { worldTickCap: 24, options });
}

function budgetOf(state: SimState) {
  const universe = findUniverse(state);
  expect(componentOf(state, GRANT_BUDGET).has(universe)).toBe(true);
  return readRecord(state, GRANT_BUDGET, universe);
}

describe('the three budget knobs are registered factors', () => {
  it('names all three, so a sweep file may vary them and is validated against them', () => {
    // A sweep naming an unregistered factor is refused before dispatch; an
    // unregistered knob is therefore one no experiment can ever turn.
    expect(REFERENCE_FACTOR_IDS).toContain('grantBudgetStart');
    expect(REFERENCE_FACTOR_IDS).toContain('grantAccrualNodes');
    expect(REFERENCE_FACTOR_IDS).toContain('grantBudgetCap');
  });
});

describe('a config that names no budget takes content', () => {
  it('seeds the shipped god constants verbatim', () => {
    const row = budgetOf(build({ cohortSize: 4, foundingNodes: 1 }));
    expect(row.startingGrants).toBe(CONSTANTS.foundingGrantBudgetStart);
    expect(row.accrualNodes).toBe(CONSTANTS.foundingGrantAccrualNodes);
    expect(row.cap).toBe(CONSTANTS.foundingGrantBudgetCap);
  });

  it('leaves the shipped default unreachable, so this build grants as it always did', () => {
    // The shipped allowance is deliberately inert: the grid holds 300 nodes and
    // only prerequisite-free ones in permitted cells are grantable, so no run
    // can spend it. That is what makes the mechanic ship without moving a
    // baseline, and it is a claim worth pinning rather than trusting.
    expect(CONSTANTS.foundingGrantBudgetStart).toBeGreaterThan(content.registry.nodes.length);
    expect(CONSTANTS.foundingGrantBudgetCap).toBeGreaterThan(content.registry.nodes.length);
  });

  it('reads absent keys as undefined rather than as zero', () => {
    const options = referenceOptions({ worldTickCap: 24, options: { cohortSize: 4 } });
    expect(options.grantBudgetStart).toBeUndefined();
    expect(options.grantAccrualNodes).toBeUndefined();
    expect(options.grantBudgetCap).toBeUndefined();
  });
});

describe('a config that names a budget gets that budget', () => {
  it('carries each level into the row', () => {
    const row = budgetOf(
      build({
        cohortSize: 4,
        foundingNodes: 1,
        grantBudgetStart: 2,
        grantAccrualNodes: 8,
        grantBudgetCap: 12,
      }),
    );
    expect(row.startingGrants).toBe(2);
    expect(row.accrualNodes).toBe(8);
    expect(row.cap).toBe(12);
  });

  it('carries a level of zero, which is the pure-discovery control', () => {
    // Zero has to survive the `??` fallback or the most important arm of the
    // sweep would silently run at the content default and report itself as a
    // distinct observation.
    const row = budgetOf(build({ cohortSize: 4, foundingNodes: 1, grantBudgetStart: 0 }));
    expect(row.startingGrants).toBe(0);
  });

  it('refuses a level that is present and malformed', () => {
    expect(() =>
      referenceOptions({
        worldTickCap: 24,
        options: { cohortSize: 4, grantBudgetStart: '2' as unknown as number },
      }),
    ).toThrow(/grantBudgetStart/);
  });
});

describe("the scenario's own founding grants are not counted as discoveries", () => {
  it('records exactly the nodes it seeded', () => {
    for (const foundingNodes of [0, 1, 4]) {
      const row = budgetOf(build({ cohortSize: 4, foundingNodes }));
      expect(row.seededNodes, `foundingNodes ${String(foundingNodes)}`).toBe(foundingNodes);
    }
  });

  it('starts every universe with a clean ledger', () => {
    const row = budgetOf(build({ cohortSize: 12, foundingNodes: 4 }));
    expect(row.grantsUsed).toBe(0);
  });

  it('leaves a universe seeded with four nodes no more budget than one seeded with one', () => {
    // The interaction this field exists to prevent, stated as the comparison a
    // reader would actually make: `foundingNodes` moves what the universe knows
    // and must not move what the god may seed.
    const sparse = budgetOf(build({ cohortSize: 4, foundingNodes: 1 }));
    const rich = budgetOf(build({ cohortSize: 4, foundingNodes: 4 }));
    expect(rich.startingGrants).toBe(sparse.startingGrants);
    expect(rich.seededNodes - sparse.seededNodes).toBe(3);
  });
});
