/*
 * Multiverse Mages — the favor economy: regeneration, the cap, and the price of
 * changing your mind twice.
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
 * The `favor-economy` spec, asserted — the arithmetic here, the tick-level
 * behaviour in `god-loop.test.ts`.
 *
 * ## The overflow test is the one that cannot be satisfied vacuously
 *
 * "The pool never exceeds its cap" is trivially true of an implementation that
 * simply never regenerates, which is the same shape of vacuous pass
 * `CLAUDE.md` records for carrying capacity. So overflow is asserted as a
 * *conservation law* instead: what was regenerated equals what was banked plus
 * what was discarded, at every arrangement of pool and cap including the ones
 * where one of the two terms is zero. An implementation that stopped
 * regenerating would fail the "gained is positive below the cap" half, and one
 * that banked past the cap would fail the other.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE, mul } from '@mm/sim-core';
import { ClampCounters, stackMagnitudes } from '@mm/primitives';

import {
  ACTION,
  applyRegeneration,
  favorCapFor,
  favorRegeneration,
  hysteresisMultiplier,
  inertFraction,
  interventionCost,
  ledgerBalances,
  upheavalShock,
  worshipShareOfRegeneration,
} from '../../src/index.js';

import { constants, costs, worshipMax, worshipYieldPrimitive } from './god-fixtures.js';

const C = constants();
const COSTS = costs();
const YIELD = worshipYieldPrimitive();

/** Regeneration with no `worship-yield` sources at all. */
function bare(worship: number): number {
  return favorRegeneration(worship, C, [], YIELD);
}

describe('regeneration scales with worship and never reaches zero', () => {
  it('pays a worshipless universe the base and nothing else', () => {
    expect(bare(0)).toBe(C.favorRegenBase);
  });

  it('never pays zero, whatever the state of the universe', () => {
    // The floor is deliberate: a zero would make a bad start unrecoverable and
    // produce two thousand ticks of Monte Carlo proving a decision made at tick
    // forty.
    for (const worship of [-100_000, -1, 0, 1]) {
      expect(bare(worship)).toBeGreaterThan(0);
    }
  });

  it('spreads regeneration between a bare universe and one at the worship ceiling', () => {
    const top = bare(worshipMax());
    expect(top).toBe(C.favorRegenBase + mul(worshipMax(), C.favorPerWorship));
    expect(top).toBeGreaterThan(bare(0));
  });

  it('is monotonic in worship', () => {
    let previous = bare(0);
    for (const worship of [512, 2048, 4096, worshipMax()]) {
      const next = bare(worship);
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
  });

  it('separates the worship-driven share from the constant floor', () => {
    // §7's `worshipSnowball` is a Gini coefficient of regeneration, and a
    // coefficient taken over a quantity with a large constant in it measures
    // mostly the constant.
    expect(worshipShareOfRegeneration(bare(0), C)).toBe(0);
    expect(worshipShareOfRegeneration(bare(worshipMax()), C)).toBe(
      mul(worshipMax(), C.favorPerWorship),
    );
  });
});

describe('worship-yield is the one licensed multiplier, through the shared channel', () => {
  it('stacks additively into (1 + Sigma) rather than as a product of multipliers', () => {
    const sources = [300, 400];
    const stacked = stackMagnitudes(YIELD, sources);
    // The shared arithmetic's answer, not this test's: asserting `1724` here
    // would be a second implementation of the stacking rule, which is what
    // `contracts.md` §3 exists to prevent.
    expect(stacked.value).toBe(FP_ONE + 300 + 400);
    expect(YIELD.stacking).toBe('additive-into-multiplier');
    expect(favorRegeneration(4096, C, sources, YIELD)).toBe(mul(bare(4096), stacked.value));
  });

  it('is capped by the registry, and the clamp is counted', () => {
    // §3 caps `worship-yield` at `fp(2048)` — 2x — and that cap is the whole
    // reason the knowledge loop is allowed a door into the favor economy at
    // all. Read off the registry rather than written here, so a retune of the
    // cap moves the assertion with it.
    expect(YIELD.cap.kind).toBe('fp');
    const cap = YIELD.cap.value ?? 0;
    const counters = new ClampCounters();
    const huge = Array.from({ length: 16 }, () => cap);
    expect(favorRegeneration(4096, C, huge, YIELD, counters)).toBe(mul(bare(4096), cap));
    expect(counters.count(YIELD.id)).toBeGreaterThan(0);
  });

  it('raises the rate of approach and never the pool cap itself', () => {
    // The whole shape of the decision: knowledge can buy favor, but only
    // through a capped door, and a god who over-invests simply wastes more,
    // visibly, in `favorWasted`. `favorCapFor` takes a tier and the constants
    // and nothing else — there is no argument through which `worship-yield`
    // could reach it — and the pool cap is unchanged while the rate is not.
    const cap = YIELD.cap.value ?? 0;
    const stackedRegen = favorRegeneration(4096, C, [cap], YIELD);
    expect(stackedRegen).toBeGreaterThan(bare(4096));
    for (let tier = 0; tier <= C.worshipTierCount; tier += 1) {
      expect(favorCapFor(tier, C)).toBe(C.favorCapBase + tier * C.favorCapPerTier);
    }
  });
});

describe('the pool is capped, and the overflow is counted rather than banked', () => {
  it('conserves: everything regenerated is either banked or discarded', () => {
    const cap = favorCapFor(0, C);
    for (const favor of [0, cap - 1, cap, cap + 5000]) {
      for (const regenerated of [0, 1, 1024, cap * 2]) {
        const outcome = applyRegeneration(favor, regenerated, cap);
        expect(outcome.gained + outcome.discarded).toBe(regenerated);
        expect(outcome.favor).toBe(favor + outcome.gained);
      }
    }
  });

  it('gains something whenever there is headroom, so the law is not satisfied by doing nothing', () => {
    const cap = favorCapFor(0, C);
    const outcome = applyRegeneration(0, 1024, cap);
    expect(outcome.gained).toBe(1024);
    expect(outcome.discarded).toBe(0);
  });

  it('discards exactly the part that does not fit', () => {
    const cap = favorCapFor(0, C);
    const outcome = applyRegeneration(cap - 480, 1024, cap);
    expect(outcome.favor).toBe(cap);
    expect(outcome.discarded).toBe(1024 - 480);
  });

  it('never pulls a pool above the cap back down to it', () => {
    // A tier loss leaves a universe holding more than its new cap allows, and
    // truncating would delete favor a player earned for a reason they could not
    // have anticipated.
    const cap = favorCapFor(2, C);
    const held = favorCapFor(4, C);
    const outcome = applyRegeneration(held, 100_000, cap);
    expect(outcome.favor).toBe(held);
    expect(outcome.gained).toBe(0);
    expect(outcome.discarded).toBe(100_000);
  });

  it('raises the cap by one step when a tier is crossed', () => {
    expect(favorCapFor(3, C) - favorCapFor(2, C)).toBe(C.favorCapPerTier);
  });
});

describe('hysteresis prices a repeated flip, per axis', () => {
  it('leaves an untouched axis at the base price', () => {
    expect(hysteresisMultiplier(0, C)).toBe(FP_ONE);
    expect(interventionCost(ACTION.forbidTechnique, COSTS)).toBe(
      COSTS.byAction[ACTION.forbidTechnique],
    );
  });

  it('doubles the second flip and triples the third', () => {
    const base = COSTS.byAction[ACTION.forbidTechnique] ?? 0;
    expect(
      interventionCost(ACTION.forbidTechnique, COSTS, { hysteresis: hysteresisMultiplier(1, C) }),
    ).toBe(base * 2);
    expect(
      interventionCost(ACTION.forbidTechnique, COSTS, { hysteresis: hysteresisMultiplier(2, C) }),
    ).toBe(base * 3);
  });

  it('treats a negative counter as an untouched axis rather than a discount', () => {
    expect(hysteresisMultiplier(-4, C)).toBe(FP_ONE);
  });

  it('declares a decay window, so escalation is memory and not a permanent tax', () => {
    expect(C.hysteresisDecayTicks).toBeGreaterThan(0);
    expect(C.hysteresisStep).toBeGreaterThan(0);
  });
});

describe('the cost table is symmetric where vision pillar 1 requires it', () => {
  it('prices permitting a technique exactly as it prices forbidding one', () => {
    expect(COSTS.byAction[ACTION.permitTechnique]).toBe(COSTS.byAction[ACTION.forbidTechnique]);
    expect(COSTS.byAction[ACTION.permitForm]).toBe(COSTS.byAction[ACTION.forbidForm]);
  });

  it('makes the no-op and the ascension declaration free', () => {
    expect(COSTS.byAction[ACTION.noop]).toBe(0);
    expect(COSTS.byAction[ACTION.declareAscension]).toBe(0);
  });

  it('keeps assigning a role the cheapest non-zero verb', () => {
    // The routine verb. Priced like the others it would make the action space
    // mostly unaffordable no-ops and inflate `illegalActionRate` into noise.
    const assign = COSTS.byAction[ACTION.assignRole] ?? 0;
    expect(assign).toBeGreaterThan(0);
    for (const [actionId, price] of COSTS.byAction.entries()) {
      if (actionId === ACTION.assignRole || price === 0) continue;
      expect(price).toBeGreaterThan(assign);
    }
  });

  it('scales a founding grant linearly with node tier, with no floor eating the small ones', () => {
    const one = interventionCost(ACTION.grantFoundingKnowledge, COSTS, { nodeTier: 1 });
    expect(interventionCost(ACTION.grantFoundingKnowledge, COSTS, { nodeTier: 4 })).toBe(one * 4);
    expect(one).toBeGreaterThan(0);
  });

  it('prices changing tradition above the favor cap of every tier below the top', () => {
    // The structural gate: the ruinous action is not merely expensive, it is
    // unavailable to a young universe, which is vision §4a's "at enormous cost"
    // without a separate check to forget.
    const tradition = COSTS.byAction[ACTION.changeTradition] ?? 0;
    for (let tier = 0; tier < C.worshipTierCount; tier += 1) {
      expect(favorCapFor(tier, C)).toBeLessThan(tradition);
    }
  });
});

describe('the ledger balances, and it is arithmetic rather than a record', () => {
  it('accepts an entry whose closing balance is its opening plus income less outgoings', () => {
    expect(
      ledgerBalances({
        worldTick: 7,
        opening: 10_000,
        regenerated: 1500,
        discarded: 500,
        spentByAction: { [ACTION.blessMage]: 2048, [ACTION.assignRole]: 256 },
        closing: 10_000 + 1500 - 500 - 2048 - 256,
      }),
    ).toBe(true);
  });

  it('rejects an entry that created favor out of nothing', () => {
    expect(
      ledgerBalances({
        worldTick: 7,
        opening: 10_000,
        regenerated: 1500,
        discarded: 0,
        spentByAction: {},
        closing: 12_000,
      }),
    ).toBe(false);
  });

  it('rejects an entry that lost favor nobody spent', () => {
    expect(
      ledgerBalances({
        worldTick: 7,
        opening: 10_000,
        regenerated: 0,
        discarded: 0,
        spentByAction: {},
        closing: 9_000,
      }),
    ).toBe(false);
  });
});

describe('upheaval is proportional to what the civilization actually relied on', () => {
  it('is no shock at all when nothing was stranded', () => {
    expect(inertFraction(0, 300)).toBe(0);
    expect(upheavalShock(0, C)).toBe(FP_ONE);
  });

  it('reaches the declared floor when everything was stranded', () => {
    expect(inertFraction(300, 300)).toBe(FP_ONE);
    expect(upheavalShock(FP_ONE, C)).toBe(C.upheavalShockFloor);
  });

  it('is monotonic in between, so a bigger disruption is never a smaller shock', () => {
    let previous = upheavalShock(0, C);
    for (const stranded of [1, 30, 150, 299, 300]) {
      const next = upheavalShock(inertFraction(stranded, 300), C);
      expect(next).toBeLessThanOrEqual(previous);
      previous = next;
    }
  });

  it('cannot be told that more nodes went inert than the universe knew', () => {
    expect(inertFraction(9000, 300)).toBe(FP_ONE);
  });

  it('reads a universe that knows nothing as undisrupted rather than as ruined', () => {
    expect(inertFraction(5, 0)).toBe(0);
  });
});
