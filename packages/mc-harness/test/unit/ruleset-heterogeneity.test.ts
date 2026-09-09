/*
 * Multiverse Mages — the pool's gods disagree about what magic may exist.
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
 * W18, item E.
 *
 * An external review's point, and it is a defect in the instrument rather than
 * in the game: **if every bot declares the same twelve cells, looting cannot
 * create diversity, because there is nothing foreign to loot.** Raids move
 * copies; they can only move *knowledge* when the victim holds something the
 * raider's own god forbade.
 *
 * The property is asserted from the **emitted action stream** rather than from
 * the `SECT_RULESETS` table, so a preference list that stops emitting what the
 * table claims fails here. What is derived is each sect's resulting ruleset:
 * the v1 rectangle, plus what the sect permits, minus what it forbids.
 *
 * What this does **not** claim: nothing here has been observed looting anything.
 * Raids are on `w8/raid-engagement-live` and not on this branch. This is pool
 * composition and an executable statement of the precondition.
 */

import { describe, expect, it } from 'vitest';

import { BOT_POOL_REGISTRY, SECT_RULESETS, SECT_STRATEGIES, effectivePreferences } from '../../src/strategies.js';
import type { StrategyDefinition } from '../../src/strategies.js';
import { ACTION_SPACE_SIZE, GOD_ACTION, agentRng } from '@mm/agent-api';

/**
 * The v1 rectangle as 1-based axis ids, read off `packages/content/data`:
 * `intellego`(bit 1), `perdo`(3), `rego`(4) × `mentem`(7), `terram`(8),
 * `limen`(12), `nomen`(13). The god actions are 1-based, so add one.
 *
 * Written here rather than imported because §5 grants the harness no edge to
 * `@mm/content` — the same reason `GRID_TECHNIQUES` and `GRID_FORMS` are
 * literals in `strategies.ts`. If content moves the rectangle this test
 * describes a rectangle that no longer exists, which is a visible failure rather
 * than a silent one.
 */
const V1_TECHNIQUES = new Set([2, 4, 5]);
const V1_FORMS = new Set([8, 9, 13, 14]);

const ROUNDS = 200;

/** Every submission a strategy would most-prefer over `ROUNDS` rounds. */
function emitted(definition: StrategyDefinition): { action: number; parameter?: number }[] {
  const context = { runSeed: 7, agentSlotIndex: 0, rng: agentRng({ runSeed: 7, agentSlotIndex: 0, strategyId: definition.strategyId }) };
  const mask = new Uint8Array(ACTION_SPACE_SIZE).fill(1);
  const observation = new Float64Array(64);
  const out: { action: number; parameter?: number }[] = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    for (const preference of effectivePreferences(definition, { observation, mask, round, candidates: new Map(), context })) {
      out.push(preference);
    }
  }
  return out;
}

/** Parameters a strategy named for one action, as a set. */
function parametersFor(definition: StrategyDefinition, action: number): Set<number> {
  return new Set(
    emitted(definition)
      .filter((entry) => entry.action === action && entry.parameter !== undefined)
      .map((entry) => entry.parameter as number),
  );
}

/** The ruleset a sect ends up holding: v1, plus what it permits, minus what it forbids. */
function resultingRuleset(definition: StrategyDefinition): {
  techniques: Set<number>;
  forms: Set<number>;
  forbidden: Set<number>;
} {
  const techniques = new Set(V1_TECHNIQUES);
  for (const id of parametersFor(definition, GOD_ACTION.permitTechnique)) techniques.add(id);
  const forms = new Set(V1_FORMS);
  for (const id of parametersFor(definition, GOD_ACTION.permitForm)) forms.add(id);
  const forbidden = parametersFor(definition, GOD_ACTION.forbidForm);
  for (const id of forbidden) forms.delete(id);
  return { techniques, forms, forbidden };
}

const difference = (left: Set<number>, right: Set<number>): number[] =>
  [...left].filter((value) => !right.has(value)).sort((a, b) => a - b);

describe('the pool no longer declares one ruleset', () => {
  it('registers three sects, and the shipped eight are untouched', () => {
    expect(SECT_STRATEGIES).toHaveLength(3);
    for (const sect of SECT_STRATEGIES) {
      expect(BOT_POOL_REGISTRY.has(sect.strategyId)).toBe(true);
    }
    // The eight the ascension gate names must be exactly what they were, or a
    // committed baseline moves for a reason nobody declared.
    for (const id of [
      'passive-control',
      'uniform-random-legal',
      'permissive-breadth',
      'narrow-depth',
      'denial-warden',
      'archivist',
      'portal-rush',
      'worship-maximizer',
    ]) {
      expect(BOT_POOL_REGISTRY.has(id)).toBe(true);
    }
  });

  it('gives every sect a resulting ruleset no other sect holds', () => {
    const rulesets = SECT_STRATEGIES.map((definition) => ({
      id: definition.strategyId,
      ...resultingRuleset(definition),
    }));
    for (const left of rulesets) {
      for (const right of rulesets) {
        if (left.id === right.id) continue;
        expect(
          difference(left.forms, right.forms),
          `${left.id} permits nothing ${right.id} does not`,
        ).not.toEqual([]);
      }
    }
  });

  it('gives every sect a form band the others never permit', () => {
    const bands = SECT_STRATEGIES.map((definition) => ({
      id: definition.strategyId,
      permitted: parametersFor(definition, GOD_ACTION.permitForm),
    }));
    for (const left of bands) {
      expect(left.permitted.size, `${left.id} permits no form at all`).toBeGreaterThan(0);
      for (const right of bands) {
        if (left.id === right.id) continue;
        const overlap = [...left.permitted].filter((id) => right.permitted.has(id));
        expect(overlap, `${left.id} and ${right.id} claim the same form`).toEqual([]);
      }
    }
  });

  it('is the property that makes a raid able to bring home forbidden magic', () => {
    // For every sect, everything it forbade is held by at least one other sect.
    // That is exactly "a raid can bring back something the raider's own god
    // forbade", stated over the pool rather than over one pairing.
    const rulesets = SECT_STRATEGIES.map((definition) => ({
      id: definition.strategyId,
      ...resultingRuleset(definition),
    }));
    for (const raider of rulesets) {
      expect(raider.forbidden.size, `${raider.id} forbids nothing`).toBeGreaterThan(0);
      for (const forbidden of raider.forbidden) {
        const holders = rulesets
          .filter((other) => other.id !== raider.id && other.forms.has(forbidden))
          .map((other) => other.id);
        expect(
          holders,
          `${raider.id} forbids form ${String(forbidden)} and no rival holds it, so a raid could ` +
            'never bring it home',
        ).not.toEqual([]);
      }
    }
  });

  it('makes each sect forbid something the v1 rectangle starts with', () => {
    // Difference upward alone would leave every sect a superset of the shared
    // twelve cells, and a superset holds nothing foreign.
    for (const definition of SECT_STRATEGIES) {
      const forbidden = parametersFor(definition, GOD_ACTION.forbidForm);
      const fromV1 = [...forbidden].filter((id) => V1_FORMS.has(id));
      expect(fromV1, `${definition.strategyId} forbids nothing the universe starts with`).not.toEqual([]);
    }
  });

  it('emits all four of its signature actions, so no preference is starved by fall-through', () => {
    // `policyFor` submits the first preference the mask permits, and
    // permitTechnique is legal in almost every round — which is how portal-rush
    // came to have a third preference no sweep ever reached. The sects rotate
    // which action is most-preferred instead of listing all four at once, and
    // this is the assertion that the rotation works.
    for (const definition of SECT_STRATEGIES) {
      const firsts = new Set<number>();
      const context = {
        runSeed: 7,
        agentSlotIndex: 0,
        rng: agentRng({ runSeed: 7, agentSlotIndex: 0, strategyId: definition.strategyId }),
      };
      const mask = new Uint8Array(ACTION_SPACE_SIZE).fill(1);
      const observation = new Float64Array(64);
      for (let round = 0; round < ROUNDS; round += 1) {
        const list = effectivePreferences(definition, { observation, mask, round, candidates: new Map(), context });
        // Index 0 is the ascension stance's DECLARE, which is prepended.
        const own = list.filter((entry) => entry.action !== GOD_ACTION.declareAscension);
        if (own.length > 0) firsts.add((own[0] as { action: number }).action);
      }
      for (const action of definition.signatureActions) {
        expect(
          firsts.has(action),
          `${definition.strategyId} declares ${String(action)} a signature action and never makes ` +
            'it its first preference, so no round of any sweep would ever submit it',
        ).toBe(true);
      }
    }
  });

  it('declares permitTechnique a signature only where a sect claims a technique', () => {
    for (const sect of SECT_RULESETS) {
      const definition = BOT_POOL_REGISTRY.get(sect.strategyId) as StrategyDefinition;
      expect(definition.signatureActions.includes(GOD_ACTION.permitTechnique)).toBe(
        sect.permitTechniques.length > 0,
      );
    }
  });
});
