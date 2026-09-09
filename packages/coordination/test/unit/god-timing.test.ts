/*
 * Multiverse Mages — when an intervention lands changes what it costs, deterministically.
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
 * `sound-design.md` §3 and §5.2's timing rule, and the four properties that make
 * it safe to have at all.
 *
 * The mechanic: *when* a constitutional act is committed, relative to the last
 * one, changes what it costs. The four properties, each a `describe` below:
 *
 * 1. **Timing changes the outcome.** Otherwise it is decoration.
 * 2. **It is a function of simulation state, never of a wall clock.** The tick
 *    is the only clock, and the row is the only memory.
 * 3. **A replay reproduces it byte-identically.** `contracts.md` §0's whole
 *    point, and the thing a timing mechanic is most likely to break.
 * 4. **Raid time has no quantization.** §3.4, honoured structurally.
 */

import { describe, expect, it } from 'vitest';

import type { Action, EntityHandle, SimState } from '@mm/sim-core';
import { FP_ONE, TIME_MODE, rngFromRootSeed, snapshotHash } from '@mm/sim-core';
import { BAR_PHASE, UNIVERSE, componentOf, defineWorldStateSchema } from '@mm/state';
import { KnowledgeSubsystem } from '@mm/rules-magic';

import type { InterventionDeps } from '../../src/index.js';
import { ACTION, resolveInterventions } from '../../src/index.js';
import {
  ON_THE_BEAT,
  SUBDIVISION,
  SUBDIVISION_OF_ACTION,
  interventionPhase,
  isConstitutional,
} from '../../src/god/timing.js';

import { catalogAndCells } from './world-fixtures.js';
import { constants, costs, godWorld, nodesCarrying } from './god-fixtures.js';

const C = constants();
const COSTS = costs();
const SCHEMA = defineWorldStateSchema([]);

/** As `god-grant-budget.test.ts` builds it: nothing here keys a draw on a tick. */
const TEST_RNG = {
  rootSeed: 1,
  stream: (subsystemId: number) => rngFromRootSeed(1).stream(subsystemId, 0),
  actorStream: (subsystemId: number, actorKey: number) =>
    rngFromRootSeed(1).actorStream(subsystemId, 0, actorKey),
};

interface Bench {
  readonly state: SimState;
  readonly universe: EntityHandle;
  readonly deps: InterventionDeps;
}

function bench(): Bench {
  const world = godWorld(SCHEMA, { favor: 1_000_000 });
  const { catalog, cells } = catalogAndCells();
  const deps: InterventionDeps = {
    god: { constants: C, costs: COSTS },
    catalog,
    cells,
    knowledge: KnowledgeSubsystem.fromState(world.state, catalog.nodeCount),
    edictBudgetMax: 8,
    portalNodes: new Set(nodesCarrying('portal').keys()),
    // The three `InterventionDeps` fields `w109/alliances` added after this
    // file was written. Empty/inert, because nothing in this suite invites a
    // scholar — it is about §5.2's bar, not about action 16 — but the type
    // requires them and omitting them was a compile error on the merge.
    invitableSpecies: new Set<number>(),
    speciesOf: () => undefined,
    rng: TEST_RNG,
    requestEngagement: () => {},
  };
  return { state: world.state, universe: world.universe, deps };
}

function favorOf(b: Bench): number {
  return componentOf(b.state, UNIVERSE).get(b.universe, 'favor');
}

function resolve(b: Bench, actions: readonly Action[], worldTick: number, mode = TIME_MODE.world) {
  return resolveInterventions(b.state, actions, worldTick, mode, b.deps);
}

/** What one action cost, resolved at a given tick. */
function priceAt(b: Bench, action: Action, worldTick: number): number {
  const before = favorOf(b);
  const report = resolve(b, [action], worldTick);
  expect(report.applied).toBe(1);
  return before - favorOf(b);
}

describe('timing changes an intervention’s outcome', () => {
  it('charges more for a law changed inside the last law’s eight bars', () => {
    // §5.2: the permit chord's low partial *"decays over about eight bars"*.
    // Two runs, identical but for the tick the second act lands on.
    const early = bench();
    const first = priceAt(early, { kind: ACTION.forbidTechnique, params: [1] }, 0);
    const crowded = priceAt(early, { kind: ACTION.forbidForm, params: [1] }, 1);

    const patient = bench();
    priceAt(patient, { kind: ACTION.forbidTechnique, params: [1] }, 0);
    const spaced = priceAt(patient, { kind: ACTION.forbidForm, params: [1] }, C.uneaseBars);

    expect(first).toBeGreaterThan(0);
    expect(crowded).toBeGreaterThan(spaced);
    // Seven bars still ringing on the tick after the act, priced exactly.
    expect(crowded).toBe(spaced + ((C.uneaseBars - 1) * C.uneaseStep * spaced) / FP_ONE);
  });

  it('decays to nothing, bar by bar, exactly as §5.2 says', () => {
    const prices: number[] = [];
    for (let gap = 1; gap <= C.uneaseBars; gap += 1) {
      const b = bench();
      priceAt(b, { kind: ACTION.forbidTechnique, params: [1] }, 0);
      prices.push(priceAt(b, { kind: ACTION.forbidForm, params: [1] }, gap));
    }
    // Strictly falling as the gap widens, and flat at the base once the phrase
    // is over — a decay, not a cliff, which is the reason `god-agency` chose an
    // escalating price over a lockout in the first place.
    for (let i = 1; i < prices.length; i += 1) {
      expect(prices[i] as number).toBeLessThan(prices[i - 1] as number);
    }
    const untouched = bench();
    expect(prices[prices.length - 1]).toBe(
      priceAt(untouched, { kind: ACTION.forbidForm, params: [1] }, 0),
    );
  });

  it('prices churn across axes, which the axis-change counter cannot', () => {
    // §1.1's `axisChangeCounters` needs *one axis flipped twice*. A god who
    // touches nineteen different switches once each never trips it — which is
    // exactly what the pool's winning strategy does — and this is the rule that
    // does see it.
    const b = bench();
    const base = priceAt(b, { kind: ACTION.forbidTechnique, params: [1] }, 0);
    const second = priceAt(b, { kind: ACTION.forbidForm, params: [1] }, 1);
    const third = priceAt(b, { kind: ACTION.forbidForm, params: [2] }, 2);
    // Three different axes, so hysteresis is 1x on all three, and every
    // difference here is the unease.
    expect(second).toBeGreaterThan(base);
    expect(third).toBeGreaterThan(base);
  });

  it('starts the eight bars only once the law has actually changed', () => {
    // An act refused for want of favor changed nothing, so it may not make the
    // next one more expensive.
    const b = bench();
    componentOf(b.state, UNIVERSE).set(b.universe, 'favor', 0);
    expect(resolve(b, [{ kind: ACTION.forbidTechnique, params: [1] }], 0).applied).toBe(0);
    expect(componentOf(b.state, BAR_PHASE).has(b.universe)).toBe(false);
  });

  it('leaves a universe that has never legislated with no row at all', () => {
    const b = bench();
    expect(componentOf(b.state, BAR_PHASE).has(b.universe)).toBe(false);
    resolve(b, [{ kind: ACTION.assignRole, params: [0, 1] }], 0);
    // A clerical action is not a change to the law and does not start a phrase.
    expect(componentOf(b.state, BAR_PHASE).has(b.universe)).toBe(false);
  });
});

describe('the rule is a function of simulation state and nothing else', () => {
  it('gives the same answer for the same state, however many times it is asked', () => {
    const b = bench();
    resolve(b, [{ kind: ACTION.forbidTechnique, params: [1] }], 0);
    const answers = Array.from({ length: 8 }, () =>
      interventionPhase(b.state, b.universe, ACTION.forbidForm, 3, C),
    );
    for (const answer of answers) expect(answer).toEqual(answers[0]);
  });

  it('reads the tick, and nothing that is not the tick', () => {
    const b = bench();
    resolve(b, [{ kind: ACTION.forbidTechnique, params: [1] }], 100);
    // The whole state of the rule, restated: one stored integer against one
    // clock reading. There is no wall clock to consult and no draw to take —
    // `contracts.md` §6 is append-only and there is no stream 12.
    const row = componentOf(b.state, BAR_PHASE);
    expect(row.get(b.universe, 'lastConstitutionalTick')).toBe(100);
    expect(row.get(b.universe, 'uneaseUntilTick')).toBe(100 + C.uneaseBars);
    expect(interventionPhase(b.state, b.universe, ACTION.forbidForm, 100, C).uneaseBars).toBe(
      C.uneaseBars,
    );
    expect(
      interventionPhase(b.state, b.universe, ACTION.forbidForm, 100 + C.uneaseBars, C).uneaseBars,
    ).toBe(0);
  });

  it('never asks a non-constitutional action for an unease it does not owe', () => {
    const b = bench();
    resolve(b, [{ kind: ACTION.forbidTechnique, params: [1] }], 0);
    for (const kind of [ACTION.blessMage, ACTION.fundUniversity, ACTION.assignRole]) {
      expect(interventionPhase(b.state, b.universe, kind, 1, C).uneaseBars).toBe(0);
      expect(interventionPhase(b.state, b.universe, kind, 1, C).multiplier).toBe(FP_ONE);
    }
  });

  it('classifies exactly §5.1’s tier 3 as constitutional', () => {
    const constitutional = [1, 2, 3, 4, 5, 6, 7];
    for (let kind = 0; kind <= 15; kind += 1) {
      expect(isConstitutional(kind), `action ${String(kind)}`).toBe(constitutional.includes(kind));
    }
  });
});

describe('a replay reproduces the surcharge byte for byte', () => {
  it('produces the same state hash from the same action log, twice', () => {
    // Not a re-run of one function: two universes built independently from the
    // same recipe, driven by the same log of `(action, tick)` pairs. A rule that
    // reached anything outside state — a wall clock, a draw, a module-level
    // counter — diverges here.
    const log: readonly (readonly [Action, number])[] = [
      [{ kind: ACTION.forbidTechnique, params: [1] }, 0],
      [{ kind: ACTION.forbidForm, params: [1] }, 1],
      [{ kind: ACTION.forbidForm, params: [2] }, 2],
      [{ kind: ACTION.permitTechnique, params: [1] }, 9],
      [{ kind: ACTION.forbidForm, params: [3] }, 10],
    ];

    const run = (): string => {
      const b = bench();
      for (const [action, tick] of log) resolve(b, [action], tick);
      return snapshotHash(b.state);
    };

    expect(run()).toBe(run());
  });

  it('produces a different history when only the timing differs', () => {
    // The control for the test above. If the two agreed, the replay assertion
    // would be reproducing a rule that does nothing.
    const spend = (ticks: readonly number[]): number => {
      const b = bench();
      const before = favorOf(b);
      resolve(b, [{ kind: ACTION.forbidTechnique, params: [1] }], ticks[0] as number);
      resolve(b, [{ kind: ACTION.forbidForm, params: [1] }], ticks[1] as number);
      return before - favorOf(b);
    };
    expect(spend([0, 1])).not.toBe(spend([0, C.uneaseBars]));
  });
});

describe('§3.4: raid time has no quantization', () => {
  it('answers on the beat while the clock is in engagement', () => {
    const b = bench();
    resolve(b, [{ kind: ACTION.forbidTechnique, params: [1] }], 0);
    b.state.clock.mode = TIME_MODE.engagement;
    // §3.4: *"Inside a raid, the grid is gone. No tempo, no subdivisions, no
    // snapping."* There is nothing to quantize because §4.2 masks every god
    // action but no-op in engagement — the rule is never reached from a raid,
    // and says so if it is.
    expect(interventionPhase(b.state, b.universe, ACTION.forbidForm, 1, C)).toEqual(ON_THE_BEAT);
  });
});

describe('§3.1’s subdivisions, as vocabulary', () => {
  it('gives every one of the sixteen actions a subdivision', () => {
    for (let kind = 0; kind <= 15; kind += 1) {
      expect(SUBDIVISION_OF_ACTION[kind], `action ${String(kind)}`).toBeDefined();
    }
  });

  it('puts the two interventions that put knowledge in a head on the backbeat', () => {
    // The one row of the table the design calls obvious. §3.1: teaching is
    // *"mind to mind... the thing that keeps knowledge alive against
    // mortality"*, and §5.3 calls a founding grant a birth into a mind.
    expect(SUBDIVISION_OF_ACTION[ACTION.blessMage]).toBe(SUBDIVISION.teaching);
    expect(SUBDIVISION_OF_ACTION[ACTION.grantFoundingKnowledge]).toBe(SUBDIVISION.teaching);
  });

  it('reports a subdivision on every phase, and charges only the unease', () => {
    // The off-grid surcharge is a *predicate*, not yet a price — see
    // `timing.ts`. This pins that it is reported and not charged, so the day it
    // is charged is a deliberate change and not a drift.
    const b = bench();
    const phase = interventionPhase(b.state, b.universe, ACTION.blessMage, 0, C);
    expect(phase.subdivision).toBe(SUBDIVISION.teaching);
    expect(typeof phase.inPhase).toBe('boolean');
    expect(phase.multiplier).toBe(FP_ONE);
  });
});
