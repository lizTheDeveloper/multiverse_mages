/*
 * Multiverse Mages — the allocation pair's controlled-comparison properties.
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
 * W27's two bots exist to differ in **exactly one** thing. Every claim that
 * makes them a controlled comparison rather than two strategies measured
 * together is asserted here, because each of them is a property a later edit
 * could silently break while both bots kept running and kept producing numbers.
 *
 * That is the specific failure mode worth guarding: a broken control does not
 * throw. It reports.
 */

import { GOD_ACTION, agentRng } from '@mm/agent-api';
import type { ActionSubmission } from '@mm/mc-harness';
import { BOT_POOL_REGISTRY, effectivePreferences } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

const CONCENTRATE = 'allocate-concentrate';
const SPREAD = 'allocate-spread';
const IDLE = 'permit-then-idle';

/** The permit phase, transcribed from `strategies.ts`. */
const PERMIT_ROUNDS = 140;
/** A full run at the sweep's cap, so the assertions cover the whole horizon. */
const HORIZON = 2400;

function definitionOf(strategyId: string) {
  const definition = BOT_POOL_REGISTRY.get(strategyId);
  if (definition === undefined) throw new Error(`${strategyId} is not in the pool.`);
  return definition;
}

/**
 * What a strategy asks for on a round.
 *
 * The observation and mask are the zero vectors: none of the three strategies
 * conditions its *schedule* on either — that is itself one of the properties
 * being asserted, since a schedule that read the world would not be shared —
 * and using a constant world keeps the comparison between the two bots and
 * nothing else.
 */
function preferencesAt(strategyId: string, round: number): readonly ActionSubmission[] {
  const definition = definitionOf(strategyId);
  return effectivePreferences(definition, {
    observation: new Float64Array(256),
    mask: new Uint8Array(16).fill(1),
    round,
    candidates: new Map(),
    context: {
      runSeed: 1,
      agentSlotIndex: 0,
      rng: agentRng({ runSeed: 1, agentSlotIndex: 0, strategyId }),
    },
  });
}

/** The strategy's own preferences, with the ascension stance's entry removed. */
function ownPreferences(strategyId: string, round: number): readonly ActionSubmission[] {
  return preferencesAt(strategyId, round).filter(
    (preference) => preference.action !== GOD_ACTION.declareAscension,
  );
}

describe('the allocation pair is a controlled comparison (W27)', () => {
  it('permits identically to each other, and to permit-then-idle', () => {
    // The premise of the experiment: the two arms play the same ruleset. Not
    // "a similar prefix" — the same submissions, in the same order, on the same
    // rounds, as the negative control the pair is measured against.
    for (let round = 0; round < PERMIT_ROUNDS; round += 1) {
      const concentrate = ownPreferences(CONCENTRATE, round);
      const spread = ownPreferences(SPREAD, round);
      const idle = ownPreferences(IDLE, round);
      expect(concentrate, `round ${String(round)}`).toEqual(spread);
      expect(concentrate, `round ${String(round)}`).toEqual(idle);
      expect(concentrate.every((p) => p.action === GOD_ACTION.permitTechnique || p.action === GOD_ACTION.permitForm)).toBe(true);
    }
  });

  it('stops permitting the moment the allocation phase starts', () => {
    // A bot that kept permitting into the allocation phase would be varying the
    // ruleset alongside the allocation, and the experiment would be measuring
    // two things.
    for (const strategyId of [CONCENTRATE, SPREAD]) {
      for (let round = PERMIT_ROUNDS; round < HORIZON; round += 1) {
        for (const preference of ownPreferences(strategyId, round)) {
          expect(
            [GOD_ACTION.permitTechnique, GOD_ACTION.permitForm, GOD_ACTION.forbidTechnique, GOD_ACTION.forbidForm],
            `${strategyId} round ${String(round)}`,
          ).not.toContain(preference.action);
        }
      }
    }
  });

  it('spends on the identical verb on every identical round', () => {
    // This is the one-variable claim itself. `allocationVerb` is shared, so this
    // asserts the sharing survived rather than that two copies agree.
    for (let round = PERMIT_ROUNDS; round < HORIZON; round += 1) {
      const concentrate = ownPreferences(CONCENTRATE, round);
      const spread = ownPreferences(SPREAD, round);
      expect(concentrate.map((p) => p.action), `round ${String(round)}`).toEqual(
        spread.map((p) => p.action),
      );
    }
  });

  it('offers exactly one verb per allocation round, so a mask cannot change the mix', () => {
    // Cross-verb fall-through is right for every other strategy in the pool and
    // wrong for these two: it would let masking change *which* verbs an arm
    // bought, and the arms would then differ in what they spent on as well as
    // in where they spent it.
    for (const strategyId of [CONCENTRATE, SPREAD]) {
      for (let round = PERMIT_ROUNDS; round < HORIZON; round += 1) {
        expect(ownPreferences(strategyId, round).length, `${strategyId} round ${String(round)}`).toBe(1);
      }
    }
  });

  it('founds universities on the identical rule, at the identical price', () => {
    // `fundUniversity` slot 0 is "found new" and is priced by a different
    // constant than advancing. If the two bots founded on different schedules,
    // the spend difference would be the candidate list's and would be read as
    // allocation.
    const foundingRounds = (strategyId: string) => {
      const rounds: number[] = [];
      for (let round = PERMIT_ROUNDS; round < HORIZON; round += 1) {
        const [preference] = ownPreferences(strategyId, round);
        if (preference?.action === GOD_ACTION.fundUniversity && preference.parameter === 0) {
          rounds.push(round);
        }
      }
      return rounds;
    };
    const concentrate = foundingRounds(CONCENTRATE);
    expect(concentrate).toEqual(foundingRounds(SPREAD));
    expect(concentrate.length).toBeGreaterThan(0);
  });

  it('differs in slot index, and differs on every verb that has depth', () => {
    // The other side of the same coin: identical schedules would make the pair
    // two copies of one bot, and the experiment would return "flat" by
    // construction. Each verb is checked separately so a verb that silently
    // stopped differing is named rather than hidden by the others.
    const differing = new Map<number, number>();
    for (let round = PERMIT_ROUNDS; round < HORIZON; round += 1) {
      const [a] = ownPreferences(CONCENTRATE, round);
      const [b] = ownPreferences(SPREAD, round);
      if (a === undefined || b === undefined) continue;
      if (a.parameter !== b.parameter) differing.set(a.action, (differing.get(a.action) ?? 0) + 1);
    }
    for (const verb of [
      GOD_ACTION.grantFoundingKnowledge,
      GOD_ACTION.blessMage,
      GOD_ACTION.fundUniversity,
      GOD_ACTION.encourageResearch,
    ]) {
      expect(differing.get(verb) ?? 0, `verb ${String(verb)} never differs between the arms`).toBeGreaterThan(0);
    }
  });

  it('never names a negative or non-integer slot', () => {
    // The spreading arm derives its slot from a modulus, and an off-by-one there
    // would be an invalid submission rather than a different choice — which is
    // the design artifact G1 exists to catch, caught here instead.
    for (const strategyId of [CONCENTRATE, SPREAD]) {
      for (let round = 0; round < HORIZON; round += 1) {
        for (const preference of ownPreferences(strategyId, round)) {
          if (preference.parameter === undefined) continue;
          expect(Number.isInteger(preference.parameter), `${strategyId} round ${String(round)}`).toBe(true);
          expect(preference.parameter, `${strategyId} round ${String(round)}`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('takes the same ascension stance as each other and as the control', () => {
    // A stance difference is a second variable, and it is also what decides
    // when a run stops — which is what makes the tick-600 checkpoint the
    // guaranteed-common comparison point rather than a convenience.
    const stance = definitionOf(CONCENTRATE).ascension;
    expect(stance.when).toBe(definitionOf(SPREAD).ascension.when);
    expect(stance.when).toBe(definitionOf(IDLE).ascension.when);
  });
});
