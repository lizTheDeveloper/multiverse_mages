/*
 * Multiverse Mages — the wire from knowledge to the economy, gated twice.
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
 * `universe-effects.ts`'s own module note tells the story this file pins down
 * with real content: before that module existed, `world-step.ts` passed
 * `resourceYieldBonuses: []` — a hardcoded empty array — so the 46 of 70 cells
 * carrying a `resource-yield` or `build-rate` effect at `target: "universe"`
 * reached nothing. Permitting a technique changed which nodes could be
 * *researched* and changed nothing a laborer did.
 *
 * `universeEconomyBonuses` is tested here directly rather than through the
 * whole world loop, because the loop's mage roster, autonomy scoring and rng
 * draws are all noise against the two questions this file actually asks:
 * **is a contribution known**, and **is its cell permitted**. Both are answered
 * by attaching one `KNOWLEDGE_INSTANCE` row by hand and reading the bonuses
 * back — no mage, no tick, no autonomy — which is what makes each case an
 * unambiguous statement about the gate rather than about everything else a
 * world tick does.
 *
 * ## Real content, not invented fixtures
 *
 * Every node named below is searched for in the shipped registry rather than
 * hardcoded by id, the same discipline `rules-magic/test/unit/effect-fixtures.ts`
 * documents: a node whose id changed on a content rename would fail loudly with
 * a message that names what went missing, rather than silently asserting
 * against whatever the renamed node happens to be.
 *
 * ## W53 added a third gate to `resource-yield`, and it is a practitioner
 *
 * The two gates above answer *is it castable* and *is it permitted*. Neither
 * answers *is anybody casting it*, and W49 measured what that omission cost: an
 * idle god's universe applied magic to its economy at 1.0001x the rate of a god
 * that funded universities and encouraged research, because application was
 * passive. So a `resource-yield` contribution now also requires the holder to be
 * committed to `GOAL.practice` on that node.
 *
 * `stateHolding` writes that commitment by default, because every positive case
 * in this file is about the *other two* gates and would otherwise be testing the
 * new one by accident. The case that is about the new gate says so.
 *
 * `build-rate` is deliberately not gated — see `universe-effects.ts` — and the
 * discriminating test below is the pin on that asymmetry.
 *
 * ## The failure this file exists to catch
 *
 * `universe-effects.ts`'s module note is explicit that an *earlier draft*
 * gated on **presence** — an instance exists anywhere — rather than on being
 * castable. That draft would pass a naive "the wire produces something" test
 * and fail every negative case below: a book on a shelf would raise the
 * harvest, a node discovered a tick ago at floor mastery would deliver full
 * yield, and an interdiction would still leave last month's income in place
 * one gate short of "off." The negative cases are the point.
 */

import { describe, expect, it } from 'vitest';

import { createState } from '@mm/sim-core';
import type { EntityHandle, SimState } from '@mm/sim-core';
import type { Ruleset } from '@mm/state';
import {
  EDICT_KIND,
  GRID_FORM_COUNT,
  GRID_TECHNIQUE_COUNT,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  attachRecord,
  collectRecords,
  defineWorldStateSchema,
} from '@mm/state';
import { MASTERY_ACTIVATION_THRESHOLD } from '@mm/rules-magic';
import { GOAL, writeCommitment } from '@mm/rules-world';

import type { UniverseEconomyBonuses, UniverseEffectIndex } from '../../src/index.js';
import { universeEconomyBonuses, universeEffectIndex } from '../../src/index.js';

import { catalogAndCells, registry } from './world-fixtures.js';

/** Every technique and every form permitted, and no edicts. */
function permissiveRuleset(): Ruleset {
  // Written as expressions over the axis counts, as `effect-fixtures.ts` does,
  // so a grid resize does not leave a stale literal permitting the wrong set.
  return {
    permittedTechniques: (1 << GRID_TECHNIQUE_COUNT) - 1,
    permittedForms: (1 << GRID_FORM_COUNT) - 1,
    edicts: [],
  };
}

/** The permissive ruleset with one cell interdicted. */
function rulesetInterdicting(cellId: number): Ruleset {
  return { ...permissiveRuleset(), edicts: [{ cellId, kind: EDICT_KIND.interdiction }] };
}

/** The effect index, built once for the whole file — it is a pure projection of content. */
let cachedIndex: UniverseEffectIndex | undefined;
function effectIndex(): UniverseEffectIndex {
  cachedIndex ??= universeEffectIndex(registry());
  return cachedIndex;
}

/** A shipped node's interned id, by its string id, or a loud failure. */
function nodeContentId(stringId: string): number {
  const found = registry().nodes.find((entry) => entry.record.id === stringId);
  if (found === undefined) {
    throw new Error(`node.json declares no "${stringId}"; the shipped content moved`);
  }
  return found.contentId;
}

/**
 * A tier-1 *Creo Terram* node that names a `resource-yield` effect at
 * `target: "universe"` — `docs/design/sound-design.md` §4.2's own worked
 * example, "Rego Terram letting universities go up faster," one technique
 * over. `form.json`'s `terram` weights are `{ food: 0, stone: 1024, vellum: 0
 * }`, so this node is also Group B's "routes to stone and nowhere else" case.
 */
const TERRAM_NODE = 'ct-make-the-brick';

/**
 * A *Creo Herbam* node with the same shape of effect. `form.json`'s `herbam`
 * weights are `{ food: 512, stone: 0, vellum: 512 }` — Group B's "routes to
 * food and vellum, never stone" case, and the form `kinds.ts`'s module note
 * gives by name as deliberately not partitioned: the same herd is dinner and
 * parchment.
 */
const HERBAM_NODE = 'ch-quicken-the-seed';

/** A fresh, otherwise-empty state, for one knowledge instance to live in. */
function bareState(rootSeed: number): SimState {
  return createState({
    rootSeed,
    schema: defineWorldStateSchema(),
    contentRevision: registry().contentRevision,
  });
}

/**
 * One knowledge instance of `nodeId`, held as described, in a fresh state.
 *
 * A fresh state per call rather than one shared state mutated between calls,
 * because `universeEconomyBonuses` memoizes on the `SimState` object itself
 * (`universe-effects.ts`'s module note: *"an old state is collectable, and
 * there is no invalidation rule for anyone to forget"*) — asking twice about
 * the same object under two different rulesets would answer the second
 * question with the first question's cached result, which is not a defect in
 * the function under test, only a trap for a test that reused one.
 */
function stateHolding(
  nodeId: number,
  locationKind: number,
  mastery: number,
  rootSeed: number,
  options: { practising?: boolean } = {},
): { state: SimState; instance: EntityHandle; holder: EntityHandle } {
  const state = bareState(rootSeed);
  const instance = state.entities.create();
  const holder = state.entities.create();
  attachRecord(state, KNOWLEDGE_INSTANCE, instance, {
    nodeId,
    locationKind,
    locationId: holder,
    acquiredTick: 0,
    mastery,
  });
  // The practitioner gate, satisfied by default. See the module note: the other
  // cases in this file are about the castable and permitted gates, and a fixture
  // that failed the practitioner gate would make every one of them pass for the
  // wrong reason.
  if (options.practising !== false) {
    writeCommitment(state, holder, {
      goalId: GOAL.practice,
      targetNodeId: nodeId,
      adoptedTick: 0,
      score: 0,
    });
  }
  return { state, instance, holder };
}

/** `universeEconomyBonuses`, with the shipped content and a caller-supplied ruleset. */
function bonusesFor(state: SimState, ruleset: Ruleset): UniverseEconomyBonuses {
  const { cells } = catalogAndCells();
  return universeEconomyBonuses(state, { index: effectIndex(), cells, ruleset });
}

describe('the wire works, and only when knowledge is both castable and permitted', () => {
  it('a node held at a mind above the activation threshold, in a permitted cell, produces a bonus', () => {
    const nodeId = nodeContentId(TERRAM_NODE);
    const { state } = stateHolding(
      nodeId,
      LOCATION_KIND.mind,
      MASTERY_ACTIVATION_THRESHOLD,
      0x0eff_a001,
    );

    const bonuses = bonusesFor(state, permissiveRuleset());

    // Terram routes wholly to stone (`form.json`), so the terram node's own
    // form is where the non-empty list has to appear.
    expect(bonuses.resourceYield.stone.length).toBeGreaterThan(0);
    expect(bonuses.contributingNodes).toBe(1);
  });

  it.each([
    ['grimoire', LOCATION_KIND.grimoire],
    ['library', LOCATION_KIND.library],
  ])(
    'the same node held only in a %s produces nothing — written instances do not contribute',
    (_label, locationKind) => {
      // `magic-primitives` requires that written instances produce no direct
      // contribution: "a shelf full of `research-rate` grimoires that nobody
      // has read is exactly as magical as a shelf." An earlier draft of
      // `universe-effects.ts` gated on presence rather than on
      // `CONTRIBUTING_LOCATION_KINDS`, and this is the exact case it got wrong.
      const nodeId = nodeContentId(TERRAM_NODE);
      const { state } = stateHolding(nodeId, locationKind, MASTERY_ACTIVATION_THRESHOLD, 0x0eff_a002);

      const bonuses = bonusesFor(state, permissiveRuleset());

      expect(bonuses.resourceYield.stone).toEqual([]);
      expect(bonuses.resourceYield.food).toEqual([]);
      expect(bonuses.resourceYield.vellum).toEqual([]);
      expect(bonuses.contributingNodes).toBe(0);
    },
  );

  it('the same node held at a mind below the activation threshold produces nothing', () => {
    // "A civilization that learns broadly and shallowly holds a great deal of
    // knowledge that does nothing yet" (`contribution.ts`). Without this gate,
    // the tick a research operation completes would deliver full economic
    // yield immediately, and decay toward the mastery floor would reduce
    // nothing — mastery would govern only teaching fidelity.
    const nodeId = nodeContentId(TERRAM_NODE);
    const { state } = stateHolding(
      nodeId,
      LOCATION_KIND.mind,
      MASTERY_ACTIVATION_THRESHOLD - 1,
      0x0eff_a003,
    );

    const bonuses = bonusesFor(state, permissiveRuleset());

    expect(bonuses.resourceYield.stone).toEqual([]);
    expect(bonuses.contributingNodes).toBe(0);
  });

  it('a cell the ruleset forbids contributes nothing, and forbidding it does not destroy the instance', () => {
    // §1.1: legality gates acquisition and casting; it is not an invariant
    // over stored knowledge. An interdiction switches the economy off without
    // unmaking what anyone knows — "Mentem is open to my scholars, but none
    // shall unmake a mind" — and this is the economic reading of that
    // sentence: the ruleset is evaluated at application time, not baked into
    // the instance when it was acquired.
    const nodeId = nodeContentId(TERRAM_NODE);
    const { cells } = catalogAndCells();
    const cellId = cells.cellOf(nodeId);
    const { state } = stateHolding(
      nodeId,
      LOCATION_KIND.mind,
      MASTERY_ACTIVATION_THRESHOLD,
      0x0eff_a004,
    );

    const bonuses = bonusesFor(state, rulesetInterdicting(cellId));

    expect(bonuses.resourceYield.stone).toEqual([]);
    expect(bonuses.contributingNodes).toBe(0);
    // The instance itself is untouched. Nothing in this pure, read-only
    // function may destroy state, and this is the assertion that would catch
    // it if a future implementation forgot that and tried to "clean up"
    // knowledge an interdiction made dormant.
    const instances = collectRecords(state, KNOWLEDGE_INSTANCE);
    expect(instances).toHaveLength(1);
    expect(instances[0]?.row.nodeId).toBe(nodeId);
  });
});

describe('resource-yield is routed by the node\'s form, and the routing discriminates', () => {
  it('a Terram node routes to stone and not to food', () => {
    const nodeId = nodeContentId(TERRAM_NODE);
    const { state } = stateHolding(
      nodeId,
      LOCATION_KIND.mind,
      MASTERY_ACTIVATION_THRESHOLD,
      0x0eff_b001,
    );

    const bonuses = bonusesFor(state, permissiveRuleset());

    expect(bonuses.resourceYield.stone.length).toBeGreaterThan(0);
    expect(bonuses.resourceYield.food).toEqual([]);
    expect(bonuses.resourceYield.vellum).toEqual([]);
  });

  it('a Herbam node routes to food, vellum and a little stone — a field, a page, and a beam', () => {
    // `kinds.ts`'s module note names Herbam by hand as one of the forms that
    // is deliberately not partitioned across kinds: "the same herd is dinner
    // and parchment." A test that expected exactly one kind would be
    // asserting a constraint the design explicitly declines to hold.
    //
    // **This assertion read `stone: []` until 2026-08-16, and the change is
    // deliberate.** `form.json`'s fourteen rows carried only nine distinct
    // baskets — `animal == herbam`, `ignem == terram`, `imaginem == mentem`,
    // `umbra == fatum == limen` — so five forms were invisible to the economy
    // and the herder and the farmhand were the same worker. Herbam's re-author
    // is 640 food / 128 stone / 256 vellum: grain first, then fibre, then the
    // beam, and the construction stock is what a building is made of.
    //
    // Its **dominance** is what carries the meaning, and that is what is
    // asserted now: a Herbam working is a food working with two side-products,
    // never a quarry. `shipped-content.test.ts` pins the row itself.
    const nodeId = nodeContentId(HERBAM_NODE);
    const { state } = stateHolding(
      nodeId,
      LOCATION_KIND.mind,
      MASTERY_ACTIVATION_THRESHOLD,
      0x0eff_b002,
    );

    const bonuses = bonusesFor(state, permissiveRuleset());

    const sum = (magnitudes: readonly number[]): number =>
      magnitudes.reduce((total, magnitude) => total + magnitude, 0);

    expect(bonuses.resourceYield.food.length).toBeGreaterThan(0);
    expect(bonuses.resourceYield.vellum.length).toBeGreaterThan(0);
    expect(sum(bonuses.resourceYield.food)).toBeGreaterThan(sum(bonuses.resourceYield.vellum));
    expect(sum(bonuses.resourceYield.vellum)).toBeGreaterThan(sum(bonuses.resourceYield.stone));
    // Nothing at all in the four kinds only a mage's month can make. That half
    // of the old assertion is untouched and is the one that would catch a
    // routing table wired to the wrong column.
    for (const kind of ['labor', 'essence', 'insight', 'passage'] as const) {
      expect(bonuses.resourceYield[kind]).toEqual([]);
    }
  });

  it('permitting Creo Herbam and permitting Rego Terram are no longer the same move', () => {
    // The whole point of the change, restated as one assertion: two nodes in
    // differently-formed cells contribute to *differently shaped* baskets, so
    // which cells a ruleset permits now changes *what* a universe's economy can
    // produce and not merely *how much*.
    //
    // Phrased as a shape comparison rather than as disjointness, and that is the
    // 2026-08-16 re-author again. Disjointness was never the claim the design
    // makes — `kinds.ts` says outright that "forms are deliberately not
    // partitioned" — and it was only ever true here because Herbam happened to
    // route nothing to stone. It now routes a little, for the beam, while
    // Terram routes *everything* to stone. Asserting the shape keeps the claim
    // true under any future retune that keeps the forms distinct, which
    // disjointness would not.
    const terram = bonusesFor(
      stateHolding(nodeContentId(TERRAM_NODE), LOCATION_KIND.mind, MASTERY_ACTIVATION_THRESHOLD, 0x0eff_b003)
        .state,
      permissiveRuleset(),
    );
    const herbam = bonusesFor(
      stateHolding(nodeContentId(HERBAM_NODE), LOCATION_KIND.mind, MASTERY_ACTIVATION_THRESHOLD, 0x0eff_b004)
        .state,
      permissiveRuleset(),
    );

    const sum = (magnitudes: readonly number[]): number =>
      magnitudes.reduce((total, magnitude) => total + magnitude, 0);
    const share = (bonuses: typeof terram, kind: 'food' | 'stone' | 'vellum'): number => {
      const total = sum(bonuses.resourceYield.food) + sum(bonuses.resourceYield.stone) +
        sum(bonuses.resourceYield.vellum);
      return total === 0 ? 0 : Math.round((sum(bonuses.resourceYield[kind]) * 1024) / total);
    };

    // Terram is still the pure quarry: everything it routes is stone.
    expect(terram.resourceYield.stone.length).toBeGreaterThan(0);
    expect(terram.resourceYield.food).toEqual([]);
    expect(share(terram, 'stone')).toBe(1024);

    // Herbam feeds and writes and barely quarries, which is the opposite
    // universe on the same two axes.
    expect(share(herbam, 'food')).toBeGreaterThan(share(terram, 'food'));
    expect(share(herbam, 'stone')).toBeLessThan(share(terram, 'stone'));
    expect(share(herbam, 'vellum')).toBeGreaterThan(share(terram, 'vellum'));
  });
});

/**
 * The third gate, and the one primitive that does not have it.
 *
 * `AQUAM_NODE` carries **both** economic primitives at `target: "universe"`,
 * which is what makes the asymmetry testable on a single instance: one holder,
 * one node, one tick, and the two primitives answer differently.
 */
const AQUAM_NODE = 'caq-turn-the-channel';

describe('resource-yield needs a practitioner; build-rate does not', () => {
  it('yields nothing from a castable, permitted node nobody is practising', () => {
    // The instance is held at a mind, above the activation threshold, in a
    // permitted cell — every gate the 0.4.x economy had. Before W53 this was a
    // full contribution, and that is precisely why `permit-then-idle` scored
    // 1.0001x `permissive-breadth`: a universe that does nothing still holds
    // knowledge, and holding was the whole test.
    const { state } = stateHolding(
      nodeContentId(AQUAM_NODE),
      LOCATION_KIND.mind,
      MASTERY_ACTIVATION_THRESHOLD,
      0x0eff_c001,
      { practising: false },
    );

    const bonuses = bonusesFor(state, permissiveRuleset());

    expect(bonuses.practisedInstances).toBe(0);
    expect(bonuses.resourceYield.food).toEqual([]);
    expect(bonuses.resourceYield.stone).toEqual([]);
    expect(bonuses.resourceYield.vellum).toEqual([]);
  });

  it('still lets that same node reach construction, because build-rate is the control', () => {
    const { state } = stateHolding(
      nodeContentId(AQUAM_NODE),
      LOCATION_KIND.mind,
      MASTERY_ACTIVATION_THRESHOLD,
      0x0eff_c002,
      { practising: false },
    );

    const bonuses = bonusesFor(state, permissiveRuleset());

    // One primitive moves per change, so the delta is attributable. A run where
    // both went dark would be two balance movements measured as one.
    expect(bonuses.buildRate.length).toBeGreaterThan(0);
  });

  it('yields from the same node the moment its holder commits to practising it', () => {
    const { state } = stateHolding(
      nodeContentId(AQUAM_NODE),
      LOCATION_KIND.mind,
      MASTERY_ACTIVATION_THRESHOLD,
      0x0eff_c003,
    );

    const bonuses = bonusesFor(state, permissiveRuleset());

    expect(bonuses.practisedInstances).toBe(1);
    // Aquam routes wholly to food (`form.json`), so this is where it lands.
    expect(bonuses.resourceYield.food.length).toBeGreaterThan(0);
  });

  it('is keyed on the node, not on the goal: practising something else yields nothing', () => {
    // The sharpest form of "work performed". A mage practising her Terram is
    // not thereby irrigating, and a gate that only asked "is she practising
    // anything" would have made the target node decorative.
    const nodeId = nodeContentId(AQUAM_NODE);
    const { state, holder } = stateHolding(
      nodeId,
      LOCATION_KIND.mind,
      MASTERY_ACTIVATION_THRESHOLD,
      0x0eff_c004,
      { practising: false },
    );
    writeCommitment(state, holder, {
      goalId: GOAL.practice,
      targetNodeId: nodeContentId(TERRAM_NODE),
      adoptedTick: 0,
      score: 0,
    });

    const bonuses = bonusesFor(state, permissiveRuleset());

    expect(bonuses.practisedInstances).toBe(0);
    expect(bonuses.resourceYield.food).toEqual([]);
  });

  it('is keyed on the goal, not on the target: researching that node yields nothing', () => {
    const nodeId = nodeContentId(AQUAM_NODE);
    const { state, holder } = stateHolding(
      nodeId,
      LOCATION_KIND.mind,
      MASTERY_ACTIVATION_THRESHOLD,
      0x0eff_c005,
      { practising: false },
    );
    writeCommitment(state, holder, {
      goalId: GOAL.researchNode,
      targetNodeId: nodeId,
      adoptedTick: 0,
      score: 0,
    });

    const bonuses = bonusesFor(state, permissiveRuleset());

    expect(bonuses.practisedInstances).toBe(0);
    expect(bonuses.resourceYield.food).toEqual([]);
  });
});
