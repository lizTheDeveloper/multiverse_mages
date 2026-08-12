/*
 * Multiverse Mages — every strategy's ascension stance is declared, and the
 * declaration is what decides whether it ever presses the button.
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
 * ## The measurement this file exists to make possible
 *
 * At 2400 world ticks, against `main` @ `71261e9`, `uniform-random-legal`
 * ascended 10 runs of 10 and every other strategy ascended 0 of 10. The cause
 * was not play. `policyFor` submits the first preference the mask permits; only
 * `portal-rush` listed `declareAscension` at all, and it sat behind
 * `encourageResearch` and `permitTechnique`, which are always legal. Seven of
 * eight strategies therefore *could not win*, whatever they did, and the eighth
 * won by drawing action 15 uniformly about one round in sixteen.
 *
 * A tournament run under that arrangement measures preference-list ordering.
 * That is the whole finding, and the fix is not to move `declareAscension` up
 * six lists by hand — that would leave the same accident in place with a
 * different outcome. It is to make *when this strategy would declare* a field
 * that a strategy must fill in, that the registry refuses to accept empty, and
 * that a reader can compare against the strategy's own hypothesis.
 *
 * So: `never` is a stance, and silence is a bug. The assertions below are about
 * the stance being **load-bearing** — that the declared stance is what decides
 * the emitted action — rather than about any particular strategy winning.
 */

import { ACTION_SPACE_SIZE, GOD_ACTION, agentRng, isLegal } from '@mm/agent-api';
import type { ActionSubmission, StrategyDefinition } from '@mm/mc-harness';
import {
  ASCENSION_STANCE,
  BOT_POOL,
  BOT_POOL_REGISTRY,
  botStrategyRegistry,
  effectivePreferences,
  policyFor,
} from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

function contextFor(strategyId: string, runSeed = 4242, agentSlotIndex = 0) {
  return { runSeed, agentSlotIndex, rng: agentRng({ runSeed, agentSlotIndex, strategyId }) };
}

function blankObservation(): Float64Array {
  return new Float64Array(400);
}

/** Every action legal — the shape a mask takes once eligibility has opened. */
function eligibleMask(): Uint8Array {
  return new Uint8Array(ACTION_SPACE_SIZE).fill(1);
}

/**
 * Everything legal *except* declaring — the shape `mask.ts` produces for every
 * tick before `ascensionPath` leaves `none`, which is most of a run.
 */
function ineligibleMask(): Uint8Array {
  const mask = eligibleMask();
  mask[GOD_ACTION.declareAscension] = 0;
  return mask;
}

/** What a policy submits over `rounds` rounds against a fixed mask. */
function play(definition: StrategyDefinition, mask: Uint8Array, rounds: number): number[] {
  const policy = policyFor(definition, contextFor(definition.strategyId));
  const actions: number[] = [];
  for (let round = 0; round < rounds; round += 1) {
    actions.push((policy(blankObservation(), mask, 0) as ActionSubmission).action);
  }
  return actions;
}

const stub: StrategyDefinition = {
  strategyId: 'stub',
  version: 1,
  hypothesis: 'Whether a stub can be registered.',
  ascension: { when: ASCENSION_STANCE.never, because: 'A stub has no thesis to end a run for.' },
  signatureActions: [],
  preferences: () => [],
};

describe('an ascension stance is a declared field, not a preference-list accident', () => {
  it('gives every shipped strategy a stance with a reason', () => {
    for (const definition of BOT_POOL) {
      const stance = definition.ascension;
      expect(stance, `${definition.strategyId} declares no ascension stance`).toBeDefined();
      expect(Object.values(ASCENSION_STANCE)).toContain(stance.when);
      // A reason, not a label. The same standard the hypothesis is held to:
      // "never" is an answer, "" is a missing answer wearing one.
      expect(
        stance.because.trim().length,
        `${definition.strategyId}'s stance needs a reason, not a label`,
      ).toBeGreaterThan(60);
    }
  });

  it('refuses a strategy with no stance, an unknown stance, or an unexplained one', () => {
    expect(() =>
      botStrategyRegistry([{ ...stub, ascension: undefined } as unknown as StrategyDefinition]),
    ).toThrow(/ascension stance/i);
    expect(() =>
      botStrategyRegistry([
        { ...stub, ascension: { when: 'sometimes', because: 'x'.repeat(80) } } as unknown as StrategyDefinition,
      ]),
    ).toThrow(/ascension stance/i);
    expect(() =>
      botStrategyRegistry([{ ...stub, ascension: { when: ASCENSION_STANCE.never, because: '   ' } }]),
    ).toThrow(/ascension stance/i);
  });

  it('refuses an after-rounds stance without a whole, non-negative round to wait for', () => {
    for (const notBefore of [-1, 1.5, Number.NaN]) {
      expect(() =>
        botStrategyRegistry([
          {
            ...stub,
            ascension: {
              when: ASCENSION_STANCE.afterRounds,
              notBefore,
              because: 'A patient strategy still has to say how patient it is, in whole rounds.',
            },
          },
        ]),
      ).toThrow(/ascension stance/i);
    }
  });
});

describe('the stance decides what is submitted', () => {
  it('never lets a "never" strategy submit action 15, under any mask', () => {
    const nevers = BOT_POOL.filter((d) => d.ascension.when === ASCENSION_STANCE.never);
    expect(nevers.length, 'no strategy declares "never", so this asserts nothing').toBeGreaterThan(0);
    for (const definition of nevers) {
      expect(play(definition, eligibleMask(), 32)).not.toContain(GOD_ACTION.declareAscension);
    }
  });

  it('makes a "when-eligible" strategy declare on the first round the mask permits it', () => {
    const eager = BOT_POOL.filter((d) => d.ascension.when === ASCENSION_STANCE.whenEligible);
    expect(eager.length).toBeGreaterThan(0);
    for (const definition of eager) {
      // Ineligible: it plays its own game and never reaches for the summit.
      expect(
        play(definition, ineligibleMask(), 8),
        `${definition.strategyId} reached for a summit that was masked`,
      ).not.toContain(GOD_ACTION.declareAscension);
      // Eligible: the very first submission is the declaration.
      expect(
        play(definition, eligibleMask(), 1),
        `${definition.strategyId} declares "when-eligible" and then did not`,
      ).toEqual([GOD_ACTION.declareAscension]);
    }
  });

  it('makes an "after-rounds" strategy wait exactly as long as it said it would', () => {
    const patient = BOT_POOL.filter((d) => d.ascension.when === ASCENSION_STANCE.afterRounds);
    expect(patient.length).toBeGreaterThan(0);
    for (const definition of patient) {
      const stance = definition.ascension;
      if (stance.when !== ASCENSION_STANCE.afterRounds) continue;
      const actions = play(definition, eligibleMask(), stance.notBefore + 2);
      expect(
        actions.slice(0, stance.notBefore),
        `${definition.strategyId} declared before round ${String(stance.notBefore)}`,
      ).not.toContain(GOD_ACTION.declareAscension);
      expect(actions[stance.notBefore]).toBe(GOD_ACTION.declareAscension);
    }
  });

  it('leaves an "as-drawn" strategy drawing from its own distribution', () => {
    const drawn = BOT_POOL.filter((d) => d.ascension.when === ASCENSION_STANCE.asDrawn);
    expect(drawn.length).toBeGreaterThan(0);
    for (const definition of drawn) {
      // The point of a noise floor is that its distribution is stated. If the
      // stance prepended a declaration, action 15 would be submitted every
      // round and the floor would be a different bot.
      const actions = play(definition, eligibleMask(), 64);
      expect(new Set(actions).size, `${definition.strategyId} stopped being a uniform draw`).toBeGreaterThan(4);
      // It can still draw the declaration, because it is a legal action and
      // "uniform over what is legal" includes it. That is not a stance.
      expect(effectivePreferences(definition, {
        observation: blankObservation(),
        mask: eligibleMask(),
        round: 0,
        context: contextFor(definition.strategyId),
      })).toEqual(
        definition.preferences({
          observation: blankObservation(),
          mask: eligibleMask(),
          round: 0,
          context: contextFor(definition.strategyId),
        }),
      );
    }
  });
});

describe('the fall-through the pool was built on is untouched', () => {
  it('still submits the first legal entry of the effective list, and noop when there is none', () => {
    // The same assertion `strategy-pool.test.ts` makes of `preferences`, made
    // of the stance-composed list — which is what `policyFor` now walks. The
    // stance changes what is in the list; it does not change how the list is
    // read, and this is the test that says so.
    const masks = [eligibleMask(), ineligibleMask(), new Uint8Array(ACTION_SPACE_SIZE)];
    for (const definition of BOT_POOL) {
      for (const mask of masks) {
        const policy = policyFor(definition, contextFor(definition.strategyId, 99));
        const list = effectivePreferences(definition, {
          observation: blankObservation(),
          mask,
          round: 0,
          context: contextFor(definition.strategyId, 99),
        });
        const expected =
          list.find((preference) => isLegal(mask, preference.action)) ??
          ({ action: GOD_ACTION.noop } as ActionSubmission);
        expect(policy(blankObservation(), mask, 0)).toEqual(expected);
      }
    }
  });

  it('leaves the two strategies the committed gate baselines were taken with unchanged', () => {
    // `balance-gate.sweep.json` and `balance-gate-horizon.sweep.json` both run
    // `passive-control` fixed, and their baselines are committed numbers. A
    // stance that changed what the control emits would fail both gates, and the
    // correct response to that would be to fix the stance rather than to
    // regenerate a baseline. Asserted here so the failure names its cause.
    const control = BOT_POOL_REGISTRY.get('passive-control') as StrategyDefinition;
    expect(control.ascension.when).toBe(ASCENSION_STANCE.never);
    expect(control.version).toBe(1);
    expect(play(control, eligibleMask(), 16)).toEqual(Array<number>(16).fill(GOD_ACTION.noop));

    const floor = BOT_POOL_REGISTRY.get('uniform-random-legal') as StrategyDefinition;
    expect(floor.ascension.when).toBe(ASCENSION_STANCE.asDrawn);
    expect(floor.version).toBe(1);
  });
});

describe('the stance follows the hypothesis, strategy by strategy', () => {
  // Not a restatement of the implementation: the table is the claim that each
  // stance is the one that strategy's *written hypothesis* implies, and it is
  // the thing to argue with when someone wants to change a stance to make a
  // sweep come out differently.
  const EXPECTED: Readonly<Record<string, string>> = {
    'passive-control': ASCENSION_STANCE.never,
    'uniform-random-legal': ASCENSION_STANCE.asDrawn,
    'permissive-breadth': ASCENSION_STANCE.whenEligible,
    'narrow-depth': ASCENSION_STANCE.whenEligible,
    'denial-warden': ASCENSION_STANCE.whenEligible,
    archivist: ASCENSION_STANCE.afterRounds,
    'portal-rush': ASCENSION_STANCE.whenEligible,
    'worship-maximizer': ASCENSION_STANCE.whenEligible,
  };

  it.each(Object.entries(EXPECTED))('%s declares %s', (strategyId, when) => {
    expect((BOT_POOL_REGISTRY.get(strategyId) as StrategyDefinition).ascension.when).toBe(when);
  });

  it('leaves more than one strategy able to reach the summit at all', () => {
    // The falsifiable claim W1 is measured against is that at 2400 ticks more
    // than one strategy ascends and `uniform-random-legal` is no longer the only
    // winner. A sweep is what settles that; what a unit test can settle is the
    // precondition — that more than one strategy is *capable* of declaring.
    const capable = BOT_POOL.filter((d) => d.ascension.when !== ASCENSION_STANCE.never);
    expect(capable.length).toBeGreaterThan(1);
    expect(capable.map((d) => d.strategyId)).not.toEqual(['uniform-random-legal']);
  });
});
