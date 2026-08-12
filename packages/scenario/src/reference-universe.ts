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
  LIBRARY,
  LOCATION_KIND,
  MAGE,
  OCCUPATION,
  POPULACE_COHORT,
  UNIVERSITY,
  attachRecord,
  createUniverse,
  defineWorldStateSchema,
} from '@mm/state';
import { KnowledgeSubsystem, MASTERY_MAX, MagicGrid } from '@mm/rules-magic';
import { readRaidTuning } from '@mm/rules-raid';
import { createMage } from '@mm/rules-world';
import type { GodTickReport, WorldStepReport } from '@mm/coordination';
import { defineWorldSimulation, resolveGodContent } from '@mm/coordination';

import type { RulesetAxes } from './content-set.js';
import {
  contentCatalogue,
  foundingCandidates,
  fullGridRulesetAxes,
  scribingTraditionId,
  shippedContent,
  speciesTable,
  traditionIdNamed,
  v1RulesetAxes,
  worldDeps,
} from './content-set.js';
import type { RaidRecord } from './raids.js';
import { raidSystem } from './raids.js';
import { portalTargetIds, readRivalConstants } from './rival-universe.js';

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
 * Every species founds the universe.
 *
 * Zero, and zero means "all of them" rather than "none of them", which is the
 * one thing about this knob worth reading twice. The alternative encoding — a
 * default of `(1 << speciesCount) - 1` — would have hardcoded the species count
 * into a default, and `CLAUDE.md` puts species in validated content data. Zero
 * is the only value that means *whatever the content declares* without knowing
 * how many that is, and it makes the absent option and the documented default
 * the same universe byte for byte.
 */
const DEFAULT_FOUNDING_SPECIES_MASK = 0;

/**
 * Zero: the twelve `v1`-flagged cells, which is what every recorded run before
 * this option used. Deliberately not `1` — a default that widened the grid would
 * move all three committed balance baselines as a side effect of adding an
 * instrument, which is the failure `foundingSpeciesMask` was careful to avoid.
 */
const DEFAULT_FULL_GRID_AT_FOUNDING = 0;

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
   */
  readonly foundingNodes: number;
  /**
   * Which species found the universe, as a bitmask over content order.
   *
   * Bit *i* selects the *i*th species `speciesTable` enumerates. **Zero selects
   * every species**, which is what this scenario has always done, so an absent
   * option and this default build the identical state.
   *
   * It exists because there was no founding-mix knob at all and the campaign's
   * D7 — *"varying the founding species mix changes which strategy wins"* — is
   * not measurable without one. It is an **instrument**, not a magnitude: it
   * turns no constant and changes no rule. A bitmask rather than a list because
   * `ScenarioConfig.options` is restricted to scalars, so that a sweep can hash
   * a config into a run record without inventing a serialization.
   *
   * A mask that selects nothing is refused rather than silently building an
   * empty universe — see {@link buildReferenceState}.
   */
  readonly foundingSpeciesMask: number;
  /**
   * `1` starts the universe permitting the whole 5 × 14 grid; `0` (the default)
   * permits the twelve `v1`-flagged cells, exactly as before this field existed.
   *
   * An **instrument**, like `foundingSpeciesMask`: it turns no constant and
   * changes no rule, and its default reproduces the previous behaviour
   * byte-for-byte so no committed baseline moves because it exists.
   *
   * It is here because *"the v1 subset is not too small, acquisition is too
   * easy"* is the campaign's thesis and the measurement that would separate it
   * from its rival — *"51 nodes is simply content exhaustion"* — is a sweep that
   * varies enablement **and nothing else**. Without a knob there is no such
   * sweep, only two branches of a repository that also differ in other ways.
   *
   * A scalar rather than a boolean because `ScenarioConfig.options` is
   * restricted to scalars, for the reason `foundingSpeciesMask` records.
   */
  readonly fullGridAtFounding: number;
}

/**
 * The factor ids a sweep may name.
 *
 * `tradition` is the one entry that is **not** a key of {@link ReferenceOptions}:
 * it is resolved while the executor picks content, before the tick-zero state is
 * built at all. See {@link TRADITION_FACTOR_ID}.
 */
export const REFERENCE_FACTOR_IDS: readonly string[] = Object.freeze([
  'cohortSize',
  'foundingMages',
  'foundingNodes',
  'foundingSpeciesMask',
  'fullGridAtFounding',
  'tradition',
]);

/**
 * The factor naming the universe's tradition (`vision.md` §4a).
 *
 * Unlike the other three it is not a {@link ReferenceOptions} field, because it
 * is not read when the tick-zero state is built: the tradition's `store` and
 * `acquire` hooks are baked into `WorldStepDeps` before `Scenario.create` is
 * called at all. The executor therefore reads this level while resolving
 * content, not while building state. See `executor.ts`.
 *
 * **A warning for whoever sweeps it next.** A run's seed is a function of its
 * `cellIndex` (`mc-harness/src/seed.ts`), and each level of a factor takes its
 * own cell. Declaring `tradition` with three levels in one sweep file therefore
 * compares three traditions *and* three different sets of universes, and the
 * tradition effect cannot be separated from the seed effect. To hold common
 * random numbers, give this factor **one** level and write one file per
 * tradition, all sharing a `sweepId` and `rootSeed`.
 */
export const TRADITION_FACTOR_ID = 'tradition';

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

/** The options a config names, with the documented defaults filled in. */
export function referenceOptions(config: ScenarioConfig): ReferenceOptions {
  return {
    cohortSize: readCount(config, 'cohortSize', DEFAULT_COHORT_SIZE),
    foundingMages: readCount(config, 'foundingMages', DEFAULT_FOUNDING_MAGES),
    foundingNodes: readCount(config, 'foundingNodes', DEFAULT_FOUNDING_NODES),
    foundingSpeciesMask: readCount(config, 'foundingSpeciesMask', DEFAULT_FOUNDING_SPECIES_MASK),
    fullGridAtFounding: readCount(config, 'fullGridAtFounding', DEFAULT_FULL_GRID_AT_FOUNDING),
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
  /** Every axis the content declares. Selected by `fullGridAtFounding`. */
  readonly fullAxes: RulesetAxes;
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

/**
 * Resolves everything a reference universe needs out of a content registry.
 *
 * @param traditionName - The `tradition.json` id the universe should hold, or
 * `undefined` for {@link scribingTraditionId}'s pick. Named rather than interned
 * because the interned ids are assigned by sorting the id strings, so the number
 * that means "True Naming" is a fact about the alphabet and would move the day a
 * tradition is added — a sweep file that named `2` would then silently be an arm
 * for something else. Absent means byte-identical to the behaviour before this
 * parameter existed, which is what keeps the committed baselines meaningful.
 *
 * **W7 arrived with a second selector, `traditionIndex`, doing this same job by
 * ordinal.** The integration merge kept exactly one, and kept this one: an
 * ordinal into content order is the hazard that made the reference universe run
 * True Naming by accident of the alphabet in the first place, and a committed
 * sweep file naming `2` is that hazard with a baseline attached. See
 * `docs/superpowers/plans/integration-round-2.md`, collision 5.
 */
export function referenceContent(
  registry: ContentRegistry = shippedContent(),
  traditionName?: string,
): ReferenceContent {
  const traditionId =
    traditionName === undefined
      ? scribingTraditionId(registry)
      : traditionIdNamed(registry, traditionName);
  return {
    registry,
    traditionId,
    axes: v1RulesetAxes(registry),
    fullAxes: fullGridRulesetAxes(registry),
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

  // The whole grid, or the twelve-cell rectangle. Zero is the default and
  // reproduces every recorded run that predates this option.
  const axes = options.fullGridAtFounding === 0 ? content.axes : content.fullAxes;

  createUniverse(state, {
    permittedTechniques: axes.permittedTechniques,
    permittedForms: axes.permittedForms,
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
  // Zero means every species; see DEFAULT_FOUNDING_SPECIES_MASK. Refused rather
  // than defaulted when a non-zero mask selects nothing the content declares: a
  // universe founded with no species is a run of two hundred silent years that
  // would be recorded as an ordinary observation.
  const mask = options.foundingSpeciesMask;
  if (mask !== 0 && (mask & ((1 << ids.length) - 1)) === 0) {
    throw new Error(
      `foundingSpeciesMask ${String(mask)} selects none of the ${String(ids.length)} species the ` +
        'content declares. An empty founding population is not a starting position, and a run ' +
        'taken from one would be recorded as a measurement of something.',
    );
  }
  const founders: EntityHandle[] = [];
  for (const [speciesIndex, speciesId] of ids.entries()) {
    if (mask !== 0 && (mask & (1 << speciesIndex)) === 0) continue;
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

  grantFoundingKnowledge(state, {
    founders,
    nodeIds: content.foundingNodeIds.slice(0, options.foundingNodes),
    nodeCount: content.deps.catalog.nodeCount,
  });

  return state;
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
  /**
   * Every raid this run resolved, in resolution order.
   *
   * Empty on a scenario built with `raids: false`, and empty on a run that
   * simply had none. §7 needs those two cases distinguished, and the flag that
   * distinguishes them is `MechanicAvailability.raidEngagement` — a declaration
   * the build makes, not something a collector infers from an empty list.
   */
  raids: () => readonly RaidRecord[];
}

/** The scenario id every reference run records. Stable; a baseline is keyed on it. */
export const REFERENCE_SCENARIO_ID = 'reference-universe-v1';

/** How a reference scenario is built. */
export interface ReferenceScenarioOptions {
  /**
   * Whether portals open and raids resolve. Default `true`.
   *
   * A switch rather than a permanent truth, because it is the only honest way
   * to A/B a mechanic that moves every balance baseline: `false` reproduces the
   * pre-raid build byte for byte — no portal targets, so action 14 stays
   * masked, and no arrival roll, so stream 10 is never touched — and that
   * identity is asserted in `test/unit/raid-engagement.test.ts` rather than
   * assumed. Everything shipped runs with it `true`.
   */
  readonly raids?: boolean;
}

/**
 * Builds one reference scenario.
 *
 * **One per run, not one per process.** The world simulation it installs holds a
 * report closure and a rediscovery-clamp counter, both of which are per-run
 * measurements; sharing one across the runs a worker executes would be exactly
 * the shared mutable state the harness's second capability scenario forbids, and
 * the symptom would be a census describing whichever run finished last. The raid
 * record below is a third such closure and inherits the same rule.
 */
export function referenceScenario(
  content: ReferenceContent = referenceContent(),
  options: ReferenceScenarioOptions = {},
): ReferenceRun {
  const simulation = defineWorldSimulation(content.deps);
  const raiding = options.raids ?? true;

  if (!raiding) {
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
      raids: () => [],
    };
  }

  const records: RaidRecord[] = [];
  const constants = readRivalConstants(content.registry);

  // The raid system is appended to the schema `defineWorldSimulation` built
  // rather than installed inside it, and the reason is a package boundary:
  // `coordination` may not import `rules-raid` — §5 runs that edge the other
  // way, because a raid's consequences land in world state *through*
  // `coordination`. This package is the composition root and is the one place
  // both are in scope.
  //
  // Last in the list, so the god's action 14 has already been resolved and paid
  // for by the time this reads it.
  const schema = defineWorldStateSchema([
    ...simulation.schema.systems,
    raidSystem({
      content,
      grid: MagicGrid.from(content.registry),
      tuning: readRaidTuning(content.registry),
      constants,
      // `simulation.schema`, deliberately: a rival is never stepped — nothing
      // advances its world tick, and its only job is to hold mages, knowledge
      // and a library for the raid to read and write. Giving it the raid system
      // as well would let a rival open a portal of its own if anything ever did
      // step it, which is a second, unowned arrival process.
      schema: simulation.schema,
      onRaid: (record) => records.push(record),
      raidsSoFar: () => records,
    }),
  ]);

  return {
    scenario: {
      scenarioId: REFERENCE_SCENARIO_ID,
      catalogue: content.catalogue,
      portalTargets: portalTargetIds(constants),
      create: (runSeed: number, config: ScenarioConfig): SimState => {
        // A new episode is a new run: the raid log belongs to one, and a
        // scenario reused across two would report the first one's raids in the
        // second one's record.
        records.length = 0;
        return buildReferenceState({
          runSeed,
          options: referenceOptions(config),
          content,
          schema,
        });
      },
    },
    lastReport: simulation.lastReport,
    lastGodReport: simulation.lastGodReport,
    raids: () => records,
  };
}
