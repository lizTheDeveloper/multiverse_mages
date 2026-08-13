/*
 * Multiverse Mages — the reference universe: what a world looks like at tick
 * zero, and the loop that advances it.
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
 * `mages-and-species` task 9.1 — *"author the committed reference scenario
 * seeded with all six species and zero player input"* — expressed as
 * `agent-api`'s {@link Scenario}, so that the Monte Carlo harness, a scripted
 * bot, and a later RL bridge all get the same universe through the same five
 * calls.
 *
 * ## A starting position is not a rule
 *
 * `coordination`'s world loop deliberately founds no universities and grants no
 * founding knowledge: both are god actions (`contracts.md` §4.2, actions 11 and
 * 8) and a loop that quietly did them would be a rules layer taking the player's
 * turn. This file does both — and that is legitimate here in a way it would not
 * be there, because a scenario *is* the set of initial conditions. Nothing below
 * runs during a tick; it all happens before tick 0 exists.
 *
 * ## What the universe can and cannot do at this build, stated plainly
 *
 * Three limits shape every number this scenario produces, and none of them is
 * papered over:
 *
 * 1. **A god action now has an effect, but nothing here takes one.** `god-agency`
 *    installed the intervention and outcome systems — `worldDeps` supplies
 *    `deps.god`, so `ctx.actions` is read, worship accumulates, favor
 *    regenerates and a universe can ascend or stagnate. What has not changed is
 *    this scenario's *starting position*: it seeds zero favor, zero worship and
 *    zero prestige, so a sweep of the passive control still measures the
 *    simulation's own evolution. Substituting a strategy that acts is now a
 *    different experiment rather than the same one.
 * 2. **There is no study loop.** A researched instance is created at
 *    `DEFAULT_INITIAL_MASTERY` (`fp(256)`) and from there only decays, while the
 *    teach threshold is `fp(512)` — so a mage can never teach what she worked
 *    out herself. Knowledge spreads *only* from the founding grants below, which
 *    is why they are granted at {@link MASTERY_MAX} and why granting more of
 *    them is a sweep factor rather than a constant.
 * 3. **Scribing needs a university.** `isFeasible` masks `scribe` when a mage's
 *    scribe throughput is zero, and throughput is zero for an unaffiliated mage.
 *    Hence the founding academy.
 *
 * ## Every invented number is here, and each says why
 *
 * A scenario is made of choices that content cannot make for it. They are
 * collected as named constants rather than scattered through the builder, so a
 * reader can see the whole starting position at once and a later tuning pass has
 * one place to argue with.
 */

import type { ContentId, ContentRegistry } from '@mm/content';
import type { EntityHandle, SimState, StepContext, WorldSchema } from '@mm/sim-core';
import { createState, rngFromRootSeed } from '@mm/sim-core';
import type { Scenario, ScenarioConfig } from '@mm/agent-api';
import {
  GRANT_BUDGET,
  LIBRARY,
  LOCATION_KIND,
  MAGE,
  OCCUPATION,
  POPULACE_COHORT,
  UNIVERSITY,
  attachRecord,
  createUniverse,
  findUniverse,
} from '@mm/state';
import { KnowledgeSubsystem, MASTERY_MAX } from '@mm/rules-magic';
import { createMage } from '@mm/rules-world';
import type { GodConstants, GodTickReport, WorldStepReport } from '@mm/coordination';
import { defineWorldSimulation, resolveGodContent } from '@mm/coordination';

import type { RulesetAxes } from './content-set.js';
import {
  contentCatalogue,
  foundingCandidates,
  scribingTraditionId,
  shippedContent,
  speciesTable,
  v1RulesetAxes,
  worldDeps,
} from './content-set.js';

/** `fp(1.0)`, spelled out where a record reads as a game value. */
const FP_ONE = 1024;

/**
 * The starting materials stock, `fp`.
 *
 * A working stock, not a lever on carrying capacity: `K` comes from the shipped
 * territory (`contracts.md` §2.7) and sits orders of magnitude above anything a
 * founding population reaches, so materials only modulate it within the bound
 * `carrying-capacity.ts` states. It exists so that the first tick's subsistence
 * and the first book are payable before the first harvest is in.
 */
const STARTING_MATERIALS = 1000 * FP_ONE;

/**
 * Student seats in the founding academy.
 *
 * Invented: `contracts.md` §1.4 gives a university a `capacity` and no content
 * field supplies one, because founding a university is god action 11 and the
 * god has not been given verbs yet. Sixty-four is comfortably above any founding
 * cohort this scenario seeds, so capacity is not the thing under test.
 */
const ACADEMY_CAPACITY = 64;

/** The edict budget a universe starts with (`contracts.md` §1.1). Unused: no god acts. */
const STARTING_EDICT_BUDGET = 4;

/** Members per starting cohort, per species, per seeded occupation. */
const DEFAULT_COHORT_SIZE = 4;

/** Founding mages per species. */
const DEFAULT_FOUNDING_MAGES = 1;

/** Nodes granted at full mastery across the founding mages. */
const DEFAULT_FOUNDING_NODES = 1;

/**
 * The occupations a founding population is seeded into.
 *
 * Laborers produce the materials, students are what a mage is promoted from, and
 * scribes are what a university's scriptorium is made of — the three the loop
 * has phases for. The other two occupations (`idle`, `soldier`) are reached by
 * the reallocation phase and by mechanics that do not exist, so seeding them
 * would be inventing a labour market rather than starting one.
 */
const SEEDED_OCCUPATIONS = [OCCUPATION.laborer, OCCUPATION.student, OCCUPATION.scribe] as const;

/**
 * The tick founding draws are taken at.
 *
 * Zero, because `deriveStream` requires an unsigned tick and there is no tick
 * before the first one. It cannot collide with the loop's own tick-0 draws:
 * personality is drawn on stream 1 keyed on the mage's *own handle*
 * (`contracts.md` §6 and `rollPersonality`), and the handles this file creates
 * exist before the loop runs, so no mage the promotion phase creates can share
 * one.
 */
const FOUNDING_TICK = 0;

/** The knobs a sweep may turn. Every one is read by {@link buildReferenceState}. */
export interface ReferenceOptions {
  /** Members per starting cohort, per species, per seeded occupation. */
  readonly cohortSize: number;
  /** Founding mages per species. */
  readonly foundingMages: number;
  /**
   * Nodes granted at full mastery, dealt round-robin across the founding mages.
   *
   * The one knob that moves what the universe *knows* at tick zero, and
   * therefore the only one that can move what it can teach — see limit 2 in the
   * module note.
   *
   * **Outside the grant budget, and counted against its accrual.** These are the
   * scenario's own seeding, not the god's play, and folding them into the budget
   * would make one factor silently clamp another — a cell asking for four
   * founding nodes and a budget of two would run as a duplicate of the
   * two-node cell while reporting itself as a distinct observation, which is the
   * exact failure `readCount` refuses a mistyped level to prevent. They are
   * recorded as `seededNodes` so that the accrual does not count a god's own
   * gifts as the universe having discovered something.
   */
  readonly foundingNodes: number;
  /**
   * Founding grants the god may make, before anything is discovered.
   *
   * Absent means the shipped `founding-grant-budget-start`, which is the point:
   * a sweep file that does not name this factor produces byte-identical runs to
   * one written before the factor existed.
   */
  readonly grantBudgetStart?: number | undefined;
  /** Self-discovered nodes that earn one further grant; `0` disables accrual. */
  readonly grantAccrualNodes?: number | undefined;
  /** Ceiling on grants ever authorized. */
  readonly grantBudgetCap?: number | undefined;
}

/**
 * The factor ids a sweep may name. Exactly the keys of {@link ReferenceOptions}.
 *
 * The three grant-budget ids are here so the budget is a **swept parameter**
 * rather than a number somebody guessed. `worldDeps` resolves the god constants
 * once per worker and shares the frozen struct across every run that worker
 * executes, so a per-arm budget cannot come from content at read time; it is
 * seeded into state at founding instead, from content by default and from these
 * levels when a sweep names them.
 */
export const REFERENCE_FACTOR_IDS: readonly string[] = Object.freeze([
  'cohortSize',
  'foundingMages',
  'foundingNodes',
  'grantBudgetStart',
  'grantAccrualNodes',
  'grantBudgetCap',
]);

/**
 * Reads one option out of a scenario config, or refuses.
 *
 * Refuses rather than defaults when the key is *present and wrong*: a sweep file
 * that says `"cohortSize": "12"` would otherwise run to completion measuring the
 * default, and every cell of it would be a duplicate of its neighbour reported
 * as a separate observation. An absent key is a different thing and takes the
 * documented default.
 */
function readCount(config: ScenarioConfig, key: keyof ReferenceOptions, fallback: number): number {
  const value = config.options?.[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(
      `Scenario option ${key} is ${JSON.stringify(value)}, which is not a non-negative integer. ` +
        'A level the scenario cannot read would produce a cell identical to its neighbour and a ' +
        'record claiming the two differ.',
    );
  }
  return value;
}

/**
 * One option that has no scenario-level default, because content holds it.
 *
 * Returns `undefined` for an absent key rather than a number, so that
 * {@link buildReferenceState} can fall back to the god constants — the authority
 * for every other magnitude the god has, and the one place a reader should look
 * to find out what a budget is by default. A *present and wrong* value is
 * refused exactly as {@link readCount} refuses one, and for the same reason.
 */
function readOptionalCount(
  config: ScenarioConfig,
  key: keyof ReferenceOptions,
): number | undefined {
  const value = config.options?.[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(
      `Scenario option ${key} is ${JSON.stringify(value)}, which is not a non-negative integer. ` +
        'A level the scenario cannot read would produce a cell identical to its neighbour and a ' +
        'record claiming the two differ.',
    );
  }
  return value;
}

/** The options a config names, with the documented defaults filled in. */
export function referenceOptions(config: ScenarioConfig): ReferenceOptions {
  return {
    cohortSize: readCount(config, 'cohortSize', DEFAULT_COHORT_SIZE),
    foundingMages: readCount(config, 'foundingMages', DEFAULT_FOUNDING_MAGES),
    foundingNodes: readCount(config, 'foundingNodes', DEFAULT_FOUNDING_NODES),
    grantBudgetStart: readOptionalCount(config, 'grantBudgetStart'),
    grantAccrualNodes: readOptionalCount(config, 'grantAccrualNodes'),
    grantBudgetCap: readOptionalCount(config, 'grantBudgetCap'),
  };
}

/**
 * The content facts a reference universe is built from, resolved once.
 *
 * Held apart from {@link referenceScenario} so that a worker resolves the node
 * graph, the grid and the territory once and reuses them across the thousands of
 * runs it executes. Everything in it is read-only.
 */
export interface ReferenceContent {
  readonly registry: ContentRegistry;
  /** The tradition the universe holds. See `content-set.ts` for why this one. */
  readonly traditionId: ContentId;
  readonly axes: RulesetAxes;
  /** Interned node ids a founding grant may name, ascending. */
  readonly foundingNodeIds: readonly ContentId[];
  readonly catalogue: ReturnType<typeof contentCatalogue>;
  readonly deps: ReturnType<typeof worldDeps>;
  /**
   * `PRESTIGE_CAP`, `fp` — the analytic limit of the carry-forward recurrence.
   *
   * Surfaced here rather than re-resolved by the executor because it is the one
   * number §7's `prestigeAdvantage` needs and cannot invent, and because
   * resolving it twice is two places that could read different content.
   */
  readonly prestigeCap: number;
}

/** Resolves everything a reference universe needs out of a content registry. */
export function referenceContent(registry: ContentRegistry = shippedContent()): ReferenceContent {
  const traditionId = scribingTraditionId(registry);
  return {
    registry,
    traditionId,
    axes: v1RulesetAxes(registry),
    foundingNodeIds: foundingCandidates(registry),
    catalogue: contentCatalogue(registry),
    deps: worldDeps(registry, traditionId),
    prestigeCap: resolveGodContent(registry).constants.prestigeCap,
  };
}

/**
 * Builds the tick-zero state: a universe, an academy, six species, and whatever
 * founding knowledge the options ask for.
 *
 * **A pure function of `(runSeed, options, content)`**, which is what
 * `Scenario.create`'s contract requires of its two arguments and what makes a
 * recorded run reproducible from its coordinates alone. The only randomness is
 * `runSeed`'s own: founding personalities are rolled from it, so two replicates
 * of one cell differ in their founders rather than being one sample counted
 * twice.
 */
export function buildReferenceState(input: {
  readonly runSeed: number;
  readonly options: ReferenceOptions;
  readonly content: ReferenceContent;
  readonly schema: WorldSchema;
}): SimState {
  const { content, options } = input;
  const state = createState({
    rootSeed: input.runSeed,
    schema: input.schema,
    contentRevision: content.registry.contentRevision,
  });

  const source = rngFromRootSeed(input.runSeed);
  const rng: StepContext['rng'] = {
    rootSeed: input.runSeed,
    stream: (subsystemId: number) => source.stream(subsystemId, FOUNDING_TICK),
    actorStream: (subsystemId: number, actorKey: number) =>
      source.actorStream(subsystemId, FOUNDING_TICK, actorKey),
  };

  createUniverse(state, {
    permittedTechniques: content.axes.permittedTechniques,
    permittedForms: content.axes.permittedForms,
    edictBudget: STARTING_EDICT_BUDGET,
    traditionId: content.traditionId,
    // Zero player input: favor, worship and prestige are `god-agency`'s to move,
    // and a scenario that pre-loaded them would be measuring a god's opening.
    favor: 0,
    worship: 0,
    worshipTier: 0,
    materials: STARTING_MATERIALS,
    prestige: 0,
    prestigeEarned: 0,
    terminalReason: 0,
    favorCap: 0,
    ascended: 0,
  });

  const library = state.entities.create();
  attachRecord(state, LIBRARY, library, { foundedTick: 0 });
  const university = state.entities.create();
  attachRecord(state, UNIVERSITY, university, {
    libraryId: library,
    capacity: ACADEMY_CAPACITY,
    // Complete at tick zero. An academy still under construction would carry no
    // students and no scriptorium, and the construction mechanic that would
    // finish it is not built.
    buildProgress: FP_ONE,
  });

  const { speciesOf, ids } = speciesTable(content.registry);
  const founders: EntityHandle[] = [];
  for (const speciesId of ids) {
    const species = speciesOf(speciesId);
    if (species === undefined) continue;

    for (const occupation of SEEDED_OCCUPATIONS) {
      const cohort = state.entities.create();
      attachRecord(state, POPULACE_COHORT, cohort, {
        speciesId,
        occupation,
        count: options.cohortSize,
        // Born a maturity ago, so the student cohorts are promotable from the
        // first tick rather than after a century in which nothing happens.
        birthTickBucket: -species.maturityMonths,
      });
    }

    for (let index = 0; index < options.foundingMages; index += 1) {
      const mage = state.entities.create();
      attachRecord(
        state,
        MAGE,
        mage,
        createMage(rng, mage, species, speciesId, -species.maturityMonths, university),
      );
      founders.push(mage);
    }
  }

  const seeded = content.foundingNodeIds.slice(0, options.foundingNodes);
  grantFoundingKnowledge(state, {
    founders,
    nodeIds: seeded,
    nodeCount: content.deps.catalog.nodeCount,
  });

  attachGrantBudget(state, {
    universe: findUniverse(state),
    // `worldDeps` always supplies the god block; the optionality on `WorldStepDeps`
    // is for callers that install no god systems at all, and such a caller has no
    // budget to seed either.
    constants: content.deps.god?.content.constants,
    options,
    // Distinct node ids, every one of them newly ever-known: the universe was
    // created three statements ago and has never held anything.
    seededNodes: new Set(seeded).size,
  });

  return state;
}

/**
 * Seeds §1.1's founding-grant budget, from content unless a sweep says otherwise.
 *
 * Written here rather than inside `createUniverse` because `@mm/state` has no
 * edge to `@mm/content` and must not grow one: the universe row is a shape, and
 * what a budget *is* by default is a god magnitude. This is the composition root
 * and resolving content into state is exactly its job.
 *
 * `seededNodes` carries the tick-zero grants so the accrual cannot count them.
 * Without it a cell running `foundingNodes: 4` would begin life already credited
 * with four discoveries it did not make, and the richer cells of every sweep
 * would quietly mint budget the poorer ones did not — a factor interaction
 * nobody declared, in the direction that flatters the mechanic.
 */
function attachGrantBudget(
  state: SimState,
  input: {
    readonly universe: EntityHandle;
    readonly constants: GodConstants | undefined;
    readonly options: ReferenceOptions;
    readonly seededNodes: number;
  },
): void {
  const { constants, options } = input;
  if (input.universe === 0 || constants === undefined) return;
  attachRecord(state, GRANT_BUDGET, input.universe, {
    startingGrants: options.grantBudgetStart ?? constants.foundingGrantBudgetStart,
    accrualNodes: options.grantAccrualNodes ?? constants.foundingGrantAccrualNodes,
    cap: options.grantBudgetCap ?? constants.foundingGrantBudgetCap,
    grantsUsed: 0,
    seededNodes: input.seededNodes,
  });
}

/**
 * God action 8, applied before the world starts.
 *
 * Routed through {@link KnowledgeSubsystem} rather than by attaching component
 * rows directly, because the subsystem is the only writer that records a node as
 * **ever-known** — and ever-known is not derivable. A grant written around it
 * would leave a node that, once its last instance decayed, could be re-derived
 * at ordinary cost forever after, silently turning off the 3× rediscovery
 * penalty that is one of 0.3.0's two release claims.
 *
 * Dealt round-robin so that a grant of six nodes to six founders gives each one
 * node rather than giving the first founder all six: a single scholar holding
 * everything is one death away from an empty universe, which would make the
 * knowledge-loss metrics a measurement of that one mage's hazard roll.
 */
function grantFoundingKnowledge(
  state: SimState,
  input: {
    readonly founders: readonly EntityHandle[];
    readonly nodeIds: readonly ContentId[];
    readonly nodeCount: number;
  },
): void {
  if (input.founders.length === 0 || input.nodeIds.length === 0) return;
  const knowledge = new KnowledgeSubsystem(state, input.nodeCount);
  input.nodeIds.forEach((nodeId, index) => {
    const holder = input.founders[index % input.founders.length] as EntityHandle;
    knowledge.createInstance({
      nodeId,
      locationKind: LOCATION_KIND.mind,
      locationId: holder,
      acquiredTick: 0,
      // Full mastery, not the research default: a grant is knowledge a god put
      // there, and at `fp(256)` it would sit below the teach threshold and could
      // never leave the founder's head.
      mastery: MASTERY_MAX,
    });
  });
}

/** A reference scenario, plus the per-tick report its world loop produced. */
export interface ReferenceRun {
  /** What a session is constructed with. */
  readonly scenario: Scenario;
  /** The last tick's report, or `undefined` before the first step. */
  lastReport: () => WorldStepReport | undefined;
  /**
   * The last tick's god report, or `undefined` before the first step.
   *
   * The only place a favor *rate* exists. §7's `worshipSnowball` is the Gini
   * coefficient of *"instantaneous favor regeneration per world tick"*, and the
   * §4.1 observation carries the favor **pool**, not its derivative — a universe
   * at its `favorCap` regenerates steadily while its pool does not move at all,
   * which is exactly the case §7's own scenario names ("a run has accumulated
   * large favor but its regeneration rate at the checkpoint is small"). The
   * ledger's `regenerated` is that rate, computed once by the rule that applies
   * it, and re-deriving it from two observations would be a second answer to a
   * question that already has one.
   *
   * This is a report, not state: `census.ts` refuses to read `SimState` because
   * a *vital sign* an agent cannot see would overstate what §4.1 supports, and
   * that argument holds. It does not extend to §7's balance metrics, which
   * `RunTelemetry` already defines in terms of per-node and per-`(species,
   * tier)` quantities the observation was never meant to carry.
   */
  lastGodReport: () => GodTickReport | undefined;
}

/** The scenario id every reference run records. Stable; a baseline is keyed on it. */
export const REFERENCE_SCENARIO_ID = 'reference-universe-v1';

/**
 * Builds one reference scenario.
 *
 * **One per run, not one per process.** The world simulation it installs holds a
 * report closure and a rediscovery-clamp counter, both of which are per-run
 * measurements; sharing one across the runs a worker executes would be exactly
 * the shared mutable state the harness's second capability scenario forbids, and
 * the symptom would be a census describing whichever run finished last.
 */
export function referenceScenario(content: ReferenceContent = referenceContent()): ReferenceRun {
  const simulation = defineWorldSimulation(content.deps);
  return {
    scenario: {
      scenarioId: REFERENCE_SCENARIO_ID,
      catalogue: content.catalogue,
      create: (runSeed: number, config: ScenarioConfig): SimState =>
        buildReferenceState({
          runSeed,
          options: referenceOptions(config),
          content,
          schema: simulation.schema,
        }),
    },
    lastReport: simulation.lastReport,
    lastGodReport: simulation.lastGodReport,
  };
}
