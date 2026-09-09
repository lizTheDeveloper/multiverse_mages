/*
 * Multiverse Mages — the applied-work wire: a mage spends the month casting, and
 * the world has the materials.
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
 * `universe-effects.ts` wired knowledge to the economy as an **ambient**
 * multiplier: a castable, permitted `resource-yield` node raises what every
 * laborer produces, and it costs the mage who knows it nothing. She contributes
 * it while asleep. So a mage could *hold* a node and could never *work* one, and
 * every one of her nine goals was about knowledge.
 *
 * `GOAL.applyMagic` is the tenth and it is the missing verb. What this file
 * pins is the difference between the two channels, because a reader who
 * conflates them will eventually delete one:
 *
 * - the ambient multiplier scales **other people's** output and is free;
 * - applied work is output **she** produced, and it costs her month and her
 *   rations.
 *
 * The negative cases are the point, exactly as they are next door. An
 * interdiction must switch the verb off without destroying what she knows; a
 * node she has not mastered must not be castable; a build with no economy index
 * must behave like the inert world it already was.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle, SimState } from '@mm/sim-core';
import { rngFromRootSeed, step } from '@mm/sim-core';
import {
  EDICT,
  EDICT_KIND,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  MATERIAL_STOCK,
  attachRecord,
  componentOf,
  findUniverse,
} from '@mm/state';
import type { MaterialKind } from '@mm/rules-world';
import {
  GOAL,
  MATERIAL_KINDS,
  formRoutesToMaterials,
  readCommitment,
  zeroAmounts,
} from '@mm/rules-world';

import type { WorldStepDeps, WorldStepReport } from '../../src/index.js';
import { defineWorldSimulation, universeEffectIndex } from '../../src/index.js';

import { formMask, registry, scribingTraditionId, seededWorld, worldDeps } from './world-fixtures.js';

/**
 * The tradition whose `store` hook keeps written copies, as `world-step.test.ts`
 * picks it: the Art of Memory ships first and scribes nothing, and a universe
 * that cannot write is a universe where half the loop has nothing to do.
 */
function traditionId(): number {
  return scribingTraditionId();
}

const ROOT_SEED = 0x0a97_0001;
const TICKS = 24;

/**
 * A tier-1 *Creo Terram* node carrying a `resource-yield` effect at
 * `target: "universe"`, and the same node `universe-effects.test.ts` uses for
 * the ambient half. Terram's shipped weights route wholly to stone, so
 * everything this file asserts about applied output lands in one kind and a
 * routing mistake cannot hide in a split.
 */
const TERRAM_NODE = 'ct-make-the-brick';

/**
 * A tier-1 *Intellego Mentem* node, **inside the v1 opening square**, carrying
 * the `resource-yield` effect `material-economy` authored on it. Mentem's
 * weights route wholly to `insight`, and it is the only node in the whole
 * Mentem column that carries the primitive — which is what makes it usable
 * both for the faucet assertion and for the interdiction one.
 */
const MENTEM_NODE = 'im-weigh-the-attention';

/** A shipped node's interned id, or a loud failure naming what went missing. */
function nodeContentId(stringId: string): number {
  const found = registry().nodes.find((entry) => entry.record.id === stringId);
  if (found === undefined) {
    throw new Error(`node.json declares no "${stringId}"; the shipped content moved`);
  }
  return found.contentId;
}

/** The cell a node sits in, interned. */
function cellContentIdOf(stringId: string): number {
  const node = registry().nodes.find((entry) => entry.record.id === stringId);
  if (node === undefined) throw new Error(`node.json declares no "${stringId}"`);
  return registry().intern('cell', node.record.cell);
}

/** The shared deps, with the economy index wired. `world-fixtures` leaves it out. */
function depsWithEconomy(): WorldStepDeps {
  return { ...worldDeps(traditionId()), universeEffects: universeEffectIndex(registry()) };
}

/** Gives every seeded mage the node at full mastery, so applying is feasible at once. */
function grantToEveryMage(state: SimState, mages: readonly EntityHandle[], nodeId: number): void {
  for (const mage of mages) {
    const instance = state.entities.create();
    attachRecord(state, KNOWLEDGE_INSTANCE, instance, {
      nodeId,
      locationKind: LOCATION_KIND.mind,
      locationId: mage,
      acquiredTick: 0,
      // Full mastery rather than exactly the threshold: this file is about the
      // goal, and a node sitting on the boundary would make every assertion
      // also a test of the comparison's strictness. That boundary belongs to
      // `castableNodes`, and `gateway.test.ts` pins it there.
      mastery: 1024,
    });
  }
}

interface RunOutcome {
  readonly reports: readonly WorldStepReport[];
  readonly appliedStone: number;
  readonly applyingTicks: number;
  /** Everything applied over the run, per kind. */
  readonly appliedByKind: Record<MaterialKind, number>;
  readonly finalState: SimState;
}

/** Runs a seeded universe for {@link TICKS}, optionally interdicting one cell. */
function run(
  options: {
    grant?: boolean;
    interdictCell?: number;
    deps?: WorldStepDeps;
    node?: string;
    /** Narrow the ruleset, so a per-kind assertion is about routing. */
    permittedForms?: number;
  } = {},
): RunOutcome {
  const deps = options.deps ?? depsWithEconomy();
  const simulation = defineWorldSimulation(deps);
  const { state, mages } = seededWorld(simulation.schema, {
    rootSeed: ROOT_SEED,
    ...(options.permittedForms === undefined ? {} : { permittedForms: options.permittedForms }),
  });
  if (options.grant !== false) grantToEveryMage(state, mages, nodeContentId(options.node ?? TERRAM_NODE));
  if (options.interdictCell !== undefined) {
    // §1.1's `edicts` list is a component with one row per edict, which is how
    // `readRulesetForObservation` assembles the ruleset every tick.
    attachRecord(state, EDICT, state.entities.create(), {
      cellId: options.interdictCell,
      kind: EDICT_KIND.interdiction,
    });
  }

  const reports: WorldStepReport[] = [];
  let current = state;
  let appliedStone = 0;
  let applyingTicks = 0;
  const appliedByKind = zeroAmounts();
  for (let tick = 0; tick < TICKS; tick += 1) {
    current = step(current, [], rngFromRootSeed(ROOT_SEED));
    const report = simulation.lastReport();
    if (report === undefined) continue;
    reports.push(report);
    appliedStone += report.appliedByKind.stone;
    for (const kind of MATERIAL_KINDS) appliedByKind[kind] += report.appliedByKind[kind];
    if (report.magesApplying > 0) applyingTicks += 1;
  }
  return { reports, appliedStone, applyingTicks, appliedByKind, finalState: current };
}

describe('a mage who can cast something the world can feel will spend a month on it', () => {
  const applied = run();

  it('puts materials into the stocks that no laborer produced', () => {
    expect(applied.applyingTicks).toBeGreaterThan(0);
    expect(applied.appliedStone).toBeGreaterThan(0);
  });

  it('lands the output in the kind the node’s form is made of, and nowhere else', () => {
    // Terram routes wholly to stone. A mage casting it who also produced food
    // would mean the routing table was bypassed — which is the mistake that
    // makes *Creo Herbam* and *Rego Terram* interchangeable and no ruleset
    // worth choosing over another.
    for (const report of applied.reports) {
      expect(report.appliedByKind.food).toBe(0);
      expect(report.appliedByKind.vellum).toBe(0);
    }
  });

  it('charges her rations, so a producer is also a mouth', () => {
    const withMages = applied.reports.filter((report) => report.magesApplying > 0);
    expect(withMages.length).toBeGreaterThan(0);
    for (const report of withMages) expect(report.applicationRations).toBeGreaterThan(0);
  });

  it('reports the total and the per-kind split as the same materials', () => {
    // Every kind, not the three land ones. `materialsApplied` is `totalAmount`
    // and `totalAmount` is now seven wide; summing three here would agree with
    // it only for as long as no mage ever cast a Mentem node, which is exactly
    // the case this change exists to make possible.
    for (const report of applied.reports) {
      let summed = 0;
      for (const kind of MATERIAL_KINDS) summed += report.appliedByKind[kind];
      expect(report.materialsApplied).toBe(summed);
    }
  });

  it('leaves at least one mage committed to it rather than passing through', () => {
    // A goal nobody holds for longer than the tick it was scored in would be a
    // goal that never actually displaced anything, and the whole claim of this
    // change is that a month spent applying is a month not spent studying.
    const mages = componentOf(applied.finalState, MAGE);
    const alive = mages.field('alive');
    let holding = 0;
    mages.forEach((row, handle) => {
      if ((alive[row] as number) === 0) return;
      if (readCommitment(applied.finalState, handle)?.goalId === GOAL.applyMagic) holding += 1;
    });
    expect(holding).toBeGreaterThan(0);
  });
});

describe('the verb is taken away by an interdiction and by an absent economy', () => {
  it('produces nothing when the cell is interdicted, though nobody forgets anything', () => {
    // The distinction an interdiction is for: *"Mentem is open to my scholars,
    // but none shall unmake a mind."* The knowledge is untouched — every mage
    // still holds the instance — and the verb is gone.
    //
    // **Mentem rather than Terram, and the swap is a fix rather than a
    // relabelling.** This ran on `ct-make-the-brick` with every form permitted
    // and asserted `applyingTicks === 0`. Terram has *nine* nodes carrying
    // `resource-yield` at universe scale across three cells, so interdicting
    // one of the three never removed the form's applicability — the assertion
    // held only because no mage happened to research one of the other eight
    // inside twenty-four ticks. `material-economy`'s producer nodes shortened
    // every frontier, one of them got researched, and the test reported a
    // defect that was really a fixture resting on a coincidence.
    //
    // Mentem has exactly one such node, `im-weigh-the-attention`. With Mentem
    // the only permitted form and its cell interdicted, there is no applicable
    // node in the universe at all, which is what the assertion was always
    // meant to say.
    const interdicted = run({
      node: MENTEM_NODE,
      interdictCell: cellContentIdOf(MENTEM_NODE),
      permittedForms: formMask('mentem'),
    });
    expect(interdicted.applyingTicks).toBe(0);
    expect(interdicted.appliedByKind.insight).toBe(0);
    expect(componentOf(interdicted.finalState, KNOWLEDGE_INSTANCE).size).toBeGreaterThan(0);
  });

  it('produces nothing on a build with no economy index, which is the world it replaced', () => {
    // `world-fixtures`' default deps leave `universeEffects` out on purpose.
    // Applicability needs the authored index, so on such a build no node is
    // applicable and `apply-magic` is masked for every mage — the same inert
    // economy that build already had, rather than a silent half-wire.
    const inert = run({ deps: worldDeps(traditionId()) });
    expect(inert.applyingTicks).toBe(0);
    expect(inert.appliedStone).toBe(0);
  });
});

describe('the applied index is a projection of authored content and nothing else', () => {
  const index = universeEffectIndex(registry());

  it('answers for a node carrying resource-yield into a material form', () => {
    const authored = index.appliedYieldOf(nodeContentId(TERRAM_NODE));
    expect(authored).toBeDefined();
    expect(authored?.form.id).toBe('terram');
    expect((authored?.magnitudes ?? []).length).toBeGreaterThan(0);
  });

  it('declines a node whose form is not a material, however it is weighted', () => {
    // Every applicable node routes somewhere. Asserted over the whole content
    // set rather than on one example, because the failure mode is a mage
    // committing a career to a node that makes nothing.
    for (const entry of registry().nodes) {
      const authored = index.appliedYieldOf(entry.contentId);
      if (authored === undefined) continue;
      // Asked through `formRoutesToMaterials` rather than by summing three
      // fields. The three-term sum was the same question while the economy had
      // three kinds; now it answers `0` for a Mentem node that yields `insight`
      // and would fail the assertion for a node that routes perfectly well.
      expect(formRoutesToMaterials(authored.form)).toBe(true);
    }
  });

  it('counts fewer applicable nodes than economically weighted ones', () => {
    // `weightedNodeCount` also counts `build-rate`, which is a rate on somebody
    // else's construction rather than a quantity a mage can hand over, and it
    // counts nodes in forms that route nowhere. The applied set is strictly
    // smaller, and a build where the two agreed would mean one of the two
    // filters had stopped filtering.
    expect(index.applicableNodeCount).toBeGreaterThan(0);
    expect(index.applicableNodeCount).toBeLessThan(index.weightedNodeCount);
  });
});


/**
 * The faucet for the four kinds `material-economy` added, exercised end to end
 * rather than through `appliedYield` alone.
 *
 * `im-weigh-the-attention` is a tier-1 *Intellego Mentem* node — **inside the
 * v1 opening square** — and Mentem's weights route wholly to `insight`. So this
 * is the proposal's opening sentence made into a run: *"a god who opens on
 * mind-magic and thresholds generates no economy at all"*, and now does not.
 *
 * The negative half of the assertion is the load-bearing one. `insight` must
 * rise and **every other kind must stay at zero**, because the failure that
 * makes the whole seven-kind economy pointless is a routing table that credits
 * one pot whatever the form.
 */
describe('a Mentem month fills the stock Mentem is made of, and no other', () => {
  const MENTEM_NODE = 'im-weigh-the-attention';
  // Mentem alone. See `SeedOptions.permittedForms`: with all fourteen open a
  // mage may research and apply a Corpus node the test is not about, and
  // "every other kind is zero" would then be a claim about the roster's
  // reading habits rather than about `routeYieldByForm`.
  const insight = run({ node: MENTEM_NODE, permittedForms: formMask('mentem') });

  it('raises insight from a cell the shipped opening actually permits', () => {
    expect(insight.applyingTicks).toBeGreaterThan(0);
    expect(insight.appliedByKind.insight).toBeGreaterThan(0);
  });

  it('leaves every other kind at exactly zero', () => {
    for (const kind of MATERIAL_KINDS) {
      if (kind === 'insight') continue;
      expect(insight.appliedByKind[kind], `applied ${kind}`).toBe(0);
    }
  });

  it('lands it in the universe stock rather than only in the report', () => {
    // The report is the explain channel and `contracts.md` §4.4 forbids any
    // rule reading it back. A number that only ever appears there would be a
    // faucet that fills a log.
    const stocks = componentOf(insight.finalState, MATERIAL_STOCK);
    const universe = findUniverse(insight.finalState);
    expect(stocks.has(universe)).toBe(true);
    expect(stocks.get(universe, 'insight')).toBeGreaterThan(0);
  });
});
