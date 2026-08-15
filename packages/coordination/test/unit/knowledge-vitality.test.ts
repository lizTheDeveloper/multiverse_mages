/*
 * Multiverse Mages — the wire from knowledge to bodies, and §4b's ceiling.
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
 * Three questions, and the third is the one with design weight.
 *
 * 1. **Does the gather see what the content authored?** `vitalityBonuses` is
 *    tested directly, one hand-attached instance at a time, for the reason
 *    `universe-effects.test.ts` gives: the loop's roster, autonomy scoring and
 *    rng draws are noise against *is it known* and *is its cell permitted*.
 * 2. **Does the loop spend it?** A gather nobody reads is the exact defect this
 *    campaign exists to remove, and a unit test of the gather cannot tell the
 *    difference. So each primitive also gets a world-loop test whose two arms
 *    differ **only** in whether `WorldStepDeps.vitality` is present — remove the
 *    wire from `world-step.ts` and the two arms become equal and the test fails.
 * 3. **Is `vision.md` §4b still honoured?** *"Extension therefore returns
 *    logarithmically, so that buying more life never makes a species' own
 *    lifespan irrelevant; the draconic 1,500 years must stay worth having next
 *    to a human who has bought her way upward."* The shipped implementation of
 *    that is the `fraction-of-species-base 512` cap, not a curve, and the last
 *    describe block puts **every authored `lifespan` magnitude in the registry**
 *    on one human and reads the answer off `effectiveLifespan` rather than
 *    reasoning about it.
 *
 * Every node below is found by id in the shipped registry and asserted to
 * exist, so a content rename fails loudly here instead of silently testing
 * whatever the renamed node became.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE, createState, step } from '@mm/sim-core';
import type { EntityHandle, SimState } from '@mm/sim-core';
import type { ContentId, NodeRecord } from '@mm/content';
import type { Ruleset } from '@mm/state';
import {
  EDICT_KIND,
  GRID_FORM_COUNT,
  GRID_TECHNIQUE_COUNT,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  attachRecord,
  componentOf,
  defineWorldStateSchema,
} from '@mm/state';
import { MASTERY_ACTIVATION_THRESHOLD } from '@mm/rules-magic';
import { effectiveLifespan } from '@mm/rules-world';

import type { VitalityIndex, WorldStepDeps } from '../../src/index.js';
import { defineWorldSimulation, vitalityBonuses, vitalityIndex } from '../../src/index.js';

import {
  catalogAndCells,
  registry,
  scribingTraditionId,
  seededWorld,
  sourceFor,
  speciesTable,
  worldDeps,
} from './world-fixtures.js';

/** One authored node, by content id, or a failure that names what went missing. */
function node(id: string): { contentId: ContentId; record: NodeRecord } {
  const found = registry().nodes.find((entry) => entry.record.id === id);
  if (found === undefined) {
    throw new Error(
      `no node "${id}" in the shipped registry. This test asserts against authored ` +
        'content by id; a rename should fail here rather than quietly test something else.',
    );
  }
  return { contentId: found.contentId, record: found.record };
}

/** Every technique and every form permitted, and no edicts. */
function permissiveRuleset(): Ruleset {
  return {
    permittedTechniques: (1 << GRID_TECHNIQUE_COUNT) - 1,
    permittedForms: (1 << GRID_FORM_COUNT) - 1,
    edicts: [],
  };
}

let cachedIndex: VitalityIndex | undefined;
function index(): VitalityIndex {
  cachedIndex ??= vitalityIndex(registry());
  return cachedIndex;
}

/** A bare state with one knowledge instance held by `holder`. */
function stateHolding(
  holder: number,
  nodeId: ContentId,
  overrides: { readonly locationKind?: number; readonly mastery?: number } = {},
): SimState {
  const state = createState({
    rootSeed: 1,
    schema: defineWorldStateSchema(),
    contentRevision: registry().contentRevision,
  });
  const instance = state.entities.create();
  attachRecord(state, KNOWLEDGE_INSTANCE, instance, {
    nodeId,
    locationKind: overrides.locationKind ?? LOCATION_KIND.mind,
    locationId: holder,
    mastery: overrides.mastery ?? FP_ONE,
    acquiredTick: 0,
    lastUsedTick: 0,
  });
  return state;
}

function bonusesFor(state: SimState, ruleset: Ruleset = permissiveRuleset()) {
  const { cells } = catalogAndCells();
  return vitalityBonuses(state, { index: index(), cells, ruleset });
}

describe('the vitality index is a fetch, not a declaration', () => {
  it('finds every authored lifespan and fertility node', () => {
    // The numbers are the content's, and a content change should move them —
    // but a *drop to zero* is the failure this campaign is about, so the
    // assertion is that both are non-empty and that the named nodes are in.
    expect(index().lifespanNodeCount).toBeGreaterThan(0);
    expect(index().fertilityNodeCount).toBeGreaterThan(0);
    expect(index().lifespanNodes.has(node('mc-the-long-body').contentId)).toBe(true);
    expect(index().fertilityNodes.has(node('can-the-fat-year').contentId)).toBe(true);
  });
});

describe('what the gather sees', () => {
  it('routes a target: "self" lifespan node to its holder alone', () => {
    const long = node('mc-the-long-body');
    expect(long.record.effects.some((e) => e.primitive === 'lifespan' && e.target === 'self')).toBe(
      true,
    );

    const bonuses = bonusesFor(stateHolding(7, long.contentId));
    expect([...(bonuses.lifespanBySelf.get(7) ?? [])]).toEqual([240]);
    expect([...bonuses.lifespanUniverse]).toEqual([]);
    // Nobody else gets it, which is what `self` means.
    expect(bonuses.lifespanBySelf.get(8)).toBeUndefined();
  });

  it('routes a target: "universe" lifespan node to everyone', () => {
    const mended = node('cc-the-mended-decade');
    const bonuses = bonusesFor(stateHolding(7, mended.contentId));
    expect([...bonuses.lifespanUniverse]).toEqual([96]);
    expect(bonuses.lifespanBySelf.size).toBe(0);
  });

  it('collects a target: "universe" fertility node', () => {
    const fat = node('can-the-fat-year');
    expect([...bonusesFor(stateHolding(7, fat.contentId)).fertility]).toEqual([256]);
  });

  it('leaves target: "single" lifespan nodes alone, deliberately', () => {
    // The decision recorded in `knowledge-vitality.ts`: a `single` effect names
    // one other body, and no mechanism in the simulation selects one. Five
    // authored nodes are affected. If a targeting mechanic is ever built, this
    // is the test that should change with it.
    const wound = node('cc-close-the-wound');
    expect(
      wound.record.effects.some((e) => e.primitive === 'lifespan' && e.target === 'single'),
    ).toBe(true);

    const bonuses = bonusesFor(stateHolding(7, wound.contentId));
    expect(bonuses.contributingNodes).toBe(0);
    expect(bonuses.lifespanBySelf.size).toBe(0);
    expect([...bonuses.lifespanUniverse]).toEqual([]);
  });
});

describe('the gate is gatherEffects’, and every negative case holds', () => {
  const long = () => node('mc-the-long-body').contentId;

  it('a book on a shelf lengthens nobody’s life', () => {
    const bonuses = bonusesFor(
      stateHolding(7, long(), { locationKind: LOCATION_KIND.library }),
    );
    expect(bonuses.contributingNodes).toBe(0);
  });

  it('knowledge below the activation threshold contributes nothing', () => {
    const bonuses = bonusesFor(
      stateHolding(7, long(), { mastery: MASTERY_ACTIVATION_THRESHOLD - 1 }),
    );
    expect(bonuses.contributingNodes).toBe(0);
  });

  it('an interdicted cell switches it off without destroying it', () => {
    const { cells } = catalogAndCells();
    const cellId = cells.cellOf(long());
    const bonuses = bonusesFor(stateHolding(7, long()), {
      ...permissiveRuleset(),
      edicts: [{ cellId, kind: EDICT_KIND.interdiction }],
    });
    expect(bonuses.contributingNodes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The loop actually spends it. Remove the wire and these two fail.
// ---------------------------------------------------------------------------

/** Deps with the vitality index present or absent, and nothing else different. */
function depsWith(wired: boolean): WorldStepDeps {
  const base = worldDeps(scribingTraditionId());
  return wired ? { ...base, vitality: vitalityIndex(registry()) } : base;
}

/**
 * Steps a universe in which every mage holds `nodeId` at full mastery.
 *
 * The two arms share a root seed, so every stream is the same one and the only
 * thing that can move a number between them is the wire.
 *
 * `copies` and `ageFraction` exist for the `lifespan` arm and are documented
 * where it uses them.
 */
function runWith(
  wired: boolean,
  nodeId: ContentId,
  ticks: number,
  options: { readonly copies?: number; readonly ageFraction?: number } = {},
): { births: number; deaths: number; contributions: number } {
  const simulation = defineWorldSimulation(depsWith(wired));
  const { state: seeded, mages } = seededWorld(simulation.schema, {
    rootSeed: 0x5eed_1234,
    cohortSize: 60,
    magesPerSpecies: options.copies === undefined ? 6 : 2,
    traditionId: scribingTraditionId(),
  });

  const mageStore = componentOf(seeded, MAGE);
  const { speciesOf } = speciesTable();
  for (const mage of mages) {
    if (options.ageFraction !== undefined) {
      const species = speciesOf(mageStore.get(mage, 'speciesId'));
      if (species !== undefined) {
        mageStore.set(
          mage,
          'birthTick',
          -Math.floor(species.lifespanMonths * options.ageFraction),
        );
      }
    }
    for (let copy = 0; copy < (options.copies ?? 1); copy += 1) {
      const instance = seeded.entities.create();
      attachRecord(seeded, KNOWLEDGE_INSTANCE, instance, {
        nodeId,
        locationKind: LOCATION_KIND.mind,
        locationId: mage,
        mastery: FP_ONE,
        acquiredTick: 0,
        lastUsedTick: 0,
      });
    }
  }

  let state = seeded;
  let births = 0;
  let deaths = 0;
  let contributions = 0;
  const source = sourceFor(state.rootSeed);
  for (let tick = 0; tick < ticks; tick += 1) {
    state = step(state, [], source);
    const report = simulation.lastReport();
    if (report === undefined) throw new Error('the world loop produced no report');
    births += report.births;
    deaths += report.mageDeaths;
    contributions += report.vitalityContributions;
  }
  return { births, deaths, contributions };
}

describe('fertility reaches the birth rate', () => {
  it('a known, permitted fertility node raises births, and its absence does not', () => {
    const fat = node('can-the-fat-year').contentId;
    const wired = runWith(true, fat, 36);
    const unwired = runWith(false, fat, 36);

    // The wire is live at all: contributions are counted every tick.
    expect(wired.contributions).toBeGreaterThan(0);
    expect(unwired.contributions).toBe(0);
    // And it is *spent*: `can-the-fat-year` is a +25% multiplier on the cohort
    // birth rate, so a universe whose scholars know it has more children. This
    // is the assertion that fails if `deliverBirths` goes back to `[]`.
    expect(wired.births).toBeGreaterThan(unwired.births);
  });
});

describe('lifespan reaches the hazard', () => {
  /**
   * ## Why 1,500 copies rather than one
   *
   * Because of a measurement this test exists to keep visible. `lifespan`
   * magnitudes in `node.json` are `Fp` like every other magnitude — `caps.ts`
   * says so of `summon` in as many words, *"`fp(1024)` is one combatant, per
   * `node.json`"* — and the seventeen authored `lifespan` effects are written
   * as `24`, `96`, `240`, `480`. Read as fp those are **fractions of a month**:
   * the entire grid, learned in full, sums to `fp(2604)` and arrives at
   * `effectiveLifespan` as **2 months**, against a human cap of 480. The
   * numbers read exactly like whole months — two years, eight, twenty, forty —
   * so the content appears to be authored a factor of 1,024 low, and that is an
   * authoring decision for the author rather than something a wire may quietly
   * fix.
   *
   * The wire is nonetheless real, and this is where that is demonstrated. Each
   * held instance contributes its own magnitude — `universe-effects.ts`'s "per
   * contributing instance, not once per node" — so a stack large enough to
   * reach the cap makes the hazard visibly move. When the content is rescaled,
   * `copies` should come down to `1` and this test should keep passing, which
   * is the cheapest available signal that the rescale did what it claimed.
   */
  it('extension magic keeps mages alive who would otherwise have died', () => {
    const shape = node('mc-the-shape-that-holds').contentId;
    const options = { copies: 1500, ageFraction: 0.95 } as const;
    const wired = runWith(true, shape, 24, options);
    const unwired = runWith(false, shape, 24, options);

    // The gather runs inside the loop, and stops when the index is absent.
    expect(wired.contributions).toBeGreaterThan(0);
    expect(unwired.contributions).toBe(0);

    // And the hazard spends it. Remove `lifespanBonusesFor` from
    // `world-step.ts`'s `lifespanMonths` and these two numbers become equal.
    expect(unwired.deaths).toBeGreaterThan(0);
    expect(wired.deaths).toBeLessThan(unwired.deaths);
  });
});

// ---------------------------------------------------------------------------
// vision.md §4b, by execution rather than by argument.
// ---------------------------------------------------------------------------

describe('vision §4b: buying life never makes a species’ own lifespan irrelevant', () => {
  const lifespanPrimitive = () => {
    const found = registry().primitives.find((entry) => entry.record.id === 'lifespan');
    if (found === undefined) throw new Error('no "lifespan" primitive in the shipped registry');
    return found.record;
  };

  function speciesNamed(id: string) {
    const found = registry().species.find((entry) => entry.record.id === id);
    if (found === undefined) throw new Error(`no species "${id}" in the shipped registry`);
    return found.record;
  }

  /** Every `lifespan` magnitude authored anywhere in the shipped grid. */
  function everyAuthoredLifespanMagnitude(): number[] {
    const magnitudes: number[] = [];
    for (const entry of registry().nodes) {
      for (const effect of entry.record.effects) {
        if (effect.primitive === 'lifespan') magnitudes.push(effect.magnitude);
      }
    }
    return magnitudes;
  }

  function bonusFor(speciesId: string, magnitudes: readonly number[]) {
    return effectiveLifespan({
      species: speciesNamed(speciesId),
      mage: 1 as EntityHandle,
      birthTick: 0,
      rootSeed: 1,
      lifespanPrimitive: lifespanPrimitive(),
      effectMagnitudes: magnitudes,
    });
  }

  /**
   * A stack large enough that the ceiling is what decides the answer.
   *
   * The whole authored grid does not reach it — see the next test, which is the
   * measurement rather than the invariant. §4b is a statement about what
   * happens *at* the ceiling, so it is asked at the ceiling.
   */
  const ABSURD = Object.freeze(new Array<number>(64).fill(1024 * 1000));

  it('caps the bonus at half the species base, however much is stacked', () => {
    const human = bonusFor('human', ABSURD);
    expect(human.clamped).toBe(true);
    expect(human.bonusMonths).toBe(480);

    const dragon = bonusFor('draconic', ABSURD);
    expect(dragon.clamped).toBe(true);
    expect(dragon.bonusMonths).toBe(9000);
  });

  it('leaves the draconic 1,500 years worth having against a human who bought everything', () => {
    // §4b's sentence, as an assertion. The human is at her ceiling; the dragon
    // holds nothing at all and is still more than ten times her equal.
    const boughtHuman = bonusFor('human', ABSURD);
    const plainDragon = bonusFor('draconic', []);

    expect(boughtHuman.months).toBeLessThan(plainDragon.months);
    expect(boughtHuman.months * 10).toBeLessThan(plainDragon.months);
  });

  it('scales the ceiling with the species, which is why a ceiling stands in for a curve', () => {
    // A *flat* cap would be worth proportionally more the shorter-lived the
    // species, which is the exact inversion §4b refuses. A fraction of the
    // species base is not: extension is proportional, so the ordering of
    // species by lifespan is preserved no matter what anyone learns.
    const order = ['orc', 'human', 'dwarf', 'gnome', 'elf', 'draconic'];
    const bought = order.map((id) => bonusFor(id, ABSURD).months);
    const plain = order.map((id) => bonusFor(id, []).months);

    for (let index = 1; index < order.length; index += 1) {
      expect(bought[index] as number).toBeGreaterThan(bought[index - 1] as number);
      expect(plain[index] as number).toBeGreaterThan(plain[index - 1] as number);
    }
  });

  it('records what the shipped content actually buys, which is two months', () => {
    // **This is a measurement, not an invariant.** `lifespan` magnitudes are
    // `Fp`, and the seventeen authored effects are written as `24`, `96`,
    // `240`, `480` — which read as whole months and arrive as
    // `fp(2604) / 1024 = 2`. The cap does not come close to binding. See the
    // `lifespan reaches the hazard` block above for the full note; the number
    // is asserted here so that rescaling the content is a deliberate diff a
    // reviewer reads rather than a silent change in what a mage can buy.
    const magnitudes = everyAuthoredLifespanMagnitude();
    expect(magnitudes.length).toBe(17);

    const authored = bonusFor('human', magnitudes);
    expect(authored.bonusMonths).toBe(2);
    expect(authored.clamped).toBe(false);
  });
});
