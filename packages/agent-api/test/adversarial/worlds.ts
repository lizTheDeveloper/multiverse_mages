/*
 * Multiverse Mages — worlds for the adversarial agent-api suite.
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
 * Fixtures for the adversarial suite, kept apart from `../unit/fixtures.ts`.
 *
 * Deliberately separate. The unit fixtures were written alongside the code they
 * exercise, and a breaker that builds on them inherits whatever assumption they
 * encode — including the assumption about which resource magnitudes are worth
 * distinguishing, which is one of the things under attack here. What is reused
 * from next door is only the catalogue and the content revision, neither of
 * which is a claim about the code under test.
 */

import type { Action, SimState, System } from '@mm/sim-core';
import { TIME_MODE, createState } from '@mm/sim-core';
import {
  MATERIAL_STOCK,
  OCCUPATION,
  POPULACE_COHORT,
  attachRecord,
  createUniverse,
  defineWorldStateSchema,
} from '@mm/state';
import type { Scenario } from '@mm/agent-api';

import { FIXTURE_CATALOGUE, FIXTURE_CONTENT_REVISION, FP } from '../unit/fixtures.js';

export { FIXTURE_CATALOGUE, FIXTURE_CONTENT_REVISION, FP };

/** The resource quantities a universe holds. All in `fp`, except `worshipTier`. */
export interface Resources {
  readonly favor: number;
  readonly worship: number;
  readonly worshipTier: number;
  readonly materials: number;
  readonly prestige: number;
  readonly favorCap: number;
}

/** A modest, plausible universe: 5.0 favor, 12.0 materials, tier 1. */
export const LEAN_RESOURCES: Resources = Object.freeze({
  favor: 5 * FP,
  worship: 2 * FP,
  worshipTier: 1,
  materials: 12 * FP,
  prestige: 1 * FP,
  favorCap: 100 * FP,
});

/** A rich universe of the same shape: 90.0 favor, 4000.0 materials, tier 12. */
export const FLUSH_RESOURCES: Resources = Object.freeze({
  favor: 90 * FP,
  worship: 60 * FP,
  worshipTier: 12,
  materials: 4_000 * FP,
  prestige: 75 * FP,
  favorCap: 100 * FP,
});

/**
 * A universe holding the given resources, and nothing else that differs.
 *
 * Everything except the resources block is held constant between the two so
 * that a difference anywhere in the exported vector is attributable.
 */
export function universeHolding(resources: Resources, rootSeed = 0x5150_0001): SimState {
  const state = createState({
    rootSeed,
    schema: defineWorldStateSchema(),
    contentRevision: FIXTURE_CONTENT_REVISION,
  });
  const universe = createUniverse(state, {
    permittedTechniques: 0b00111,
    permittedForms: 0b00000000111111,
    edictBudget: 4,
    traditionId: 2,
    favor: resources.favor,
    worship: resources.worship,
    worshipTier: resources.worshipTier,
    prestige: resources.prestige,
    prestigeEarned: 0,
    terminalReason: 0,
    favorCap: resources.favorCap,
    ascended: 0,
  });
  // `observation.ts`'s resources block reads the **sum** of the three
  // `MATERIAL_STOCK` kinds for the slot `materials` used to occupy alone, so
  // an exact raw-value check (`resources-dynamic-range.test.ts`) is
  // satisfied by putting the whole figure in one kind. Which kind is
  // arbitrary — nothing in this suite reads `food`, `stone` or `vellum`
  // individually — so `food` is picked for a single, unambiguous source.
  attachRecord(state, MATERIAL_STOCK, universe, {
    food: resources.materials,
    stone: 0,
    vellum: 0,
  });
  const cohort = state.entities.create();
  attachRecord(state, POPULACE_COHORT, cohort, {
    speciesId: 1,
    occupation: OCCUPATION.laborer,
    count: 5_000,
    birthTickBucket: -60,
  });
  return state;
}

/** A scenario over {@link universeHolding}, optionally recording what reaches `step`. */
export function plainScenario(seenActions?: Action[][]): Scenario {
  const systems: System[] =
    seenActions === undefined
      ? []
      : [
          {
            name: 'adversarial-action-recorder',
            run(ctx) {
              if (ctx.mode !== TIME_MODE.world) return;
              seenActions.push(
                ctx.actions.map((action) => ({
                  kind: action.kind,
                  params: [...(action.params ?? [])],
                })),
              );
            },
          },
        ];

  return {
    scenarioId: 'adversarial-plain',
    catalogue: FIXTURE_CATALOGUE,
    create(runSeed: number): SimState {
      const state = createState({
        rootSeed: runSeed,
        schema: defineWorldStateSchema(systems),
        contentRevision: FIXTURE_CONTENT_REVISION,
      });
      const universe = createUniverse(state, {
        permittedTechniques: 0b00111,
        permittedForms: 0b00000000111111,
        edictBudget: 4,
        traditionId: 2,
        favor: 20 * FP,
        worship: 0,
        worshipTier: 1,
        prestige: 0,
        prestigeEarned: 0,
        terminalReason: 0,
        favorCap: 100 * FP,
        ascended: 0,
      });
      attachRecord(state, MATERIAL_STOCK, universe, { food: 100 * FP, stone: 0, vellum: 0 });
      const cohort = state.entities.create();
      attachRecord(state, POPULACE_COHORT, cohort, {
        speciesId: 1,
        occupation: OCCUPATION.laborer,
        count: 5_000,
        birthTickBucket: -60,
      });
      return state;
    },
  };
}
