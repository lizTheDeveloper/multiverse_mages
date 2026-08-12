/*
 * Multiverse Mages — the axis parameters a strategy names must be ids the
 * dispatch accepts, and the whole grid must be reachable.
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
 * The measured defect this file pins.
 *
 * `coordination/src/god/interventions.ts` validates a technique or form
 * parameter as a **1-based id**: `axisId < 1 || axisId > count` is refused, and
 * the bit it flips is `axisId - 1`. The strategy pool's rotations were 0-based
 * (`round % count`), so two things were true of every measurement ever taken:
 *
 * 1. One `permitTechnique` in five and one `permitForm` in fourteen named `0`,
 *    which the dispatch refused. The mask said legal, so `policyFor` never fell
 *    through, and the round was spent on nothing.
 * 2. The **top** technique (id 5) and the **top** form (id 14) were never named
 *    by any strategy, so a fifth of the technique axis and a fourteenth of the
 *    form axis were unreachable in every sweep.
 *
 * Neither was visible in `illegalActionRate`: `agent-api`'s gate passes the
 * direct-parameter actions through after an integer check, and the collector
 * reads the *session's* rejection counters, not the core's tally — so a refusal
 * taken inside the dispatch never reached the metric that exists to show it.
 *
 * The counts are written here rather than imported. `contracts.md` §5 grants
 * `mc-harness` no edge to `@mm/state`, which is the same reason `strategies.ts`
 * writes them down; this file is the second copy, and a test that disagreed
 * with the pool would be the intended failure.
 */

import { GOD_ACTION, agentRng } from '@mm/agent-api';
import type { StrategyDefinition } from '@mm/mc-harness';
import { BOT_POOL, effectivePreferences } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

/** §2.1's grid, as `interventions.ts` counts it. */
const GRID_TECHNIQUES = 5;
const GRID_FORMS = 14;

/** Enough rounds that every rotation in the pool wraps several times. */
const ROUNDS = 200;

const TECHNIQUE_ACTIONS: readonly number[] = [
  GOD_ACTION.permitTechnique,
  GOD_ACTION.forbidTechnique,
];
const FORM_ACTIONS: readonly number[] = [GOD_ACTION.permitForm, GOD_ACTION.forbidForm];

/** Every axis parameter this strategy would name over `ROUNDS` rounds. */
function axisParameters(definition: StrategyDefinition): {
  techniques: number[];
  forms: number[];
  bare: number[];
} {
  const techniques: number[] = [];
  const forms: number[] = [];
  const bare: number[] = [];
  const context = {
    runSeed: 4242,
    agentSlotIndex: 0,
    rng: agentRng({ runSeed: 4242, agentSlotIndex: 0, strategyId: definition.strategyId }),
  };
  const observation = new Float64Array(400);
  const mask = new Uint8Array(16).fill(1);
  for (let round = 0; round < ROUNDS; round += 1) {
    for (const preference of effectivePreferences(definition, {
      observation,
      mask,
      round,
      context,
    })) {
      const onTechnique = TECHNIQUE_ACTIONS.includes(preference.action);
      const onForm = FORM_ACTIONS.includes(preference.action);
      if (!onTechnique && !onForm) continue;
      if (preference.parameter === undefined) {
        bare.push(preference.action);
        continue;
      }
      (onTechnique ? techniques : forms).push(preference.parameter);
    }
  }
  return { techniques, forms, bare };
}

describe('the strategy pool names axis ids the dispatch accepts', () => {
  it('never names an id outside 1..count', () => {
    for (const definition of BOT_POOL) {
      const { techniques, forms } = axisParameters(definition);
      for (const id of techniques) {
        expect(id, `${definition.strategyId} named technique id ${String(id)}`).toBeGreaterThanOrEqual(1);
        expect(id, `${definition.strategyId} named technique id ${String(id)}`).toBeLessThanOrEqual(
          GRID_TECHNIQUES,
        );
      }
      for (const id of forms) {
        expect(id, `${definition.strategyId} named form id ${String(id)}`).toBeGreaterThanOrEqual(1);
        expect(id, `${definition.strategyId} named form id ${String(id)}`).toBeLessThanOrEqual(
          GRID_FORMS,
        );
      }
    }
  });

  it('reaches every technique and every form somewhere in the pool', () => {
    const techniques = new Set<number>();
    const forms = new Set<number>();
    for (const definition of BOT_POOL) {
      const named = axisParameters(definition);
      for (const id of named.techniques) techniques.add(id);
      for (const id of named.forms) forms.add(id);
    }
    for (let id = 1; id <= GRID_TECHNIQUES; id += 1) {
      expect(techniques.has(id), `no strategy ever names technique ${String(id)}`).toBe(true);
    }
    for (let id = 1; id <= GRID_FORMS; id += 1) {
      expect(forms.has(id), `no strategy ever names form ${String(id)}`).toBe(true);
    }
  });

  it('names the top id of each axis, which nothing did before', () => {
    // Split out from the sweep above because it is the specific claim the
    // re-measurement rests on: technique 5 and form 14 were dead grid.
    const techniques = new Set<number>();
    const forms = new Set<number>();
    for (const definition of BOT_POOL) {
      const named = axisParameters(definition);
      for (const id of named.techniques) techniques.add(id);
      for (const id of named.forms) forms.add(id);
    }
    expect(techniques.has(GRID_TECHNIQUES)).toBe(true);
    expect(forms.has(GRID_FORMS)).toBe(true);
  });

  /**
   * A recorded gap, not an assertion of correctness.
   *
   * `uniform-random-legal` draws its parameter from `candidateSlotCount`, which
   * is `0` for actions 1–7 — those are not §4.4 parameterized actions — so it
   * submits them **bare**. Every one is then refused inside the dispatch for a
   * missing parameter, invisibly. That is a second, larger confound than the
   * off-by-one this file pins, and fixing it means deciding what distribution
   * the noise floor draws a technique id from, which is a change to the floor's
   * declared distribution rather than a bug fix. It is pinned here so the next
   * measurement campaign finds it stated rather than rediscovering it.
   */
  it('records that the noise floor submits axis actions without a parameter', () => {
    const floor = BOT_POOL.find((definition) => definition.strategyId === 'uniform-random-legal');
    expect(floor).toBeDefined();
    const named = axisParameters(floor as StrategyDefinition);
    expect(named.bare.length).toBeGreaterThan(0);
    expect(named.techniques).toEqual([]);
    expect(named.forms).toEqual([]);
  });
});
