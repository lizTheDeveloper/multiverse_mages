/*
 * Multiverse Mages — one world tick, in a fixed order, across both halves of
 * the rules.
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
 * ## This is a `System`, so the pure step is `@mm/sim-core`'s and not a second
 * one
 *
 * `contracts.md` names one step contract — `step(state, actions, rng) -> state`,
 * which clones, runs the schema's systems against the tick the state arrived
 * with, applies any mode change, and advances the clock exactly once. A world
 * loop that wrapped its own clone-and-advance around that would be a second
 * implementation of the same five steps, and the day the two disagreed about
 * whether entering an engagement also ages the world by a month, both would be
 * individually defensible.
 *
 * So the loop is a system, {@link worldSystem}, and
 * {@link defineWorldSimulation} hands it to `@mm/state`'s world schema. The
 * entry point stays `step` from `@mm/sim-core`. Purity, determinism, the clock
 * and the per-step RNG binding are inherited rather than re-argued.
 *
 * ## Phase order is a rule
 *
 * `defineWorld` says system order is *"the order rules resolve in, so reordering
 * it changes the game"*, and inside one system the phases have the same
 * property. In order, with the dependency that fixes each:
 *
 * 1. **Materials production.** Before anything spends, so a tick's income is
 *    available to the tick that earned it.
 * 2. **Populace: mortality, retirement, reallocation.** Mortality first so the
 *    labour market allocates the living, and the whole phase before mage
 *    mortality because a cohort is where a mage comes from.
 * 3. **Mage mortality, and its consequences.** Deaths route through `killMage`,
 *    the single path: it abandons the goal, destroys mind and palace instances
 *    through the gateway, and asks which nodes the universe has now lost —
 *    *after* the destruction, because before it every one of them still had at
 *    least this mage's copy.
 * 4. **Promotion.** After deaths, so a mage promoted this tick is not judged
 *    against a hazard computed before she existed.
 * 5. **Autonomy.** After promotion, so a new mage decides in the tick she
 *    appears. She carries no commitment, so she reads as `no-incumbent` and
 *    evaluates immediately — which is what the absent component means.
 * 6. **Knowledge decay.** After autonomy, so a decision is made against the
 *    mastery the mage had when the tick began.
 * 7. **Births.** After the deaths, so newborns are not aged, reallocated or
 *    killed in the tick they arrive, and against a carrying capacity computed
 *    from this tick's stock.
 * 8. **Consumption, then the non-negative invariant.** Last, because every other
 *    phase is a claimant: subsistence is charged for the population that
 *    survived, and upkeep for the shelves that survived.
 *
 * ## What this loop deliberately does not do
 *
 * **It accrues no work.** Research, teaching and scribing progress have nowhere
 * to persist — `gateway.ts` explains at length, and the three `contribute*`
 * methods throw rather than pretend. Mages here choose goals, hold them through
 * hysteresis, and lose knowledge to decay and death; they do not yet complete
 * anything. That is the next decision, and it has the same shape as the
 * goal-commitment one: a component, a schema revision, a migration.
 *
 * **It founds no universities and grants no founding knowledge.** Both are god
 * actions (`contracts.md` §4.2, actions 11 and 8) and belong to `god-agency`. A
 * loop that quietly founded a university because a scenario needed one would be
 * a rules layer taking the player's turn.
 *
 * **It does not run in engagement mode.** §0 freezes world time for the two
 * universes in an engagement, so the system returns immediately when the clock
 * is not in world mode. What happens instead is `rules-raid`'s.
 */

import type { PrimitiveRecord, SpeciesRecord } from '@mm/content';
import type { EntityHandle, Fixed, SimState, System } from '@mm/sim-core';
import { TIME_MODE } from '@mm/sim-core';
import type { Handle, MageRecord, Ruleset } from '@mm/state';
import {
  MAGE,
  OCCUPATION,
  POPULACE_COHORT,
  UNIVERSE,
  UNIVERSITY,
  attachRecord,
  collectRecords,
  componentOf,
  defineWorldStateSchema,
  findUniverse,
  readRecord,
  readRulesetForObservation,
} from '@mm/state';
import type { CellResolver, KnowledgeSubsystem, NodeCatalog, StorePolicy } from '@mm/rules-magic';
import { decayHeldKnowledge } from '@mm/rules-magic';
import type { CohortDemography, ScaleFreeHazard, StepRng } from '@mm/rules-world';
import {
  CohortStore,
  assertMaterialsNonNegative,
  carryingCapacity,
  clearCommitment,
  cohortBirths,
  computeOccupationDemand,
  consumeMaterials,
  createMage,
  effectiveLifespan,
  fertilityBrake,
  hazardAt,
  insertNewborns,
  killMage,
  materialsProduced,
  promoteStudentCohort,
  rollMortality,
  scribingThroughput,
  stepMageAutonomy,
  stepPopulace,
  subsistenceDemand,
} from '@mm/rules-world';

import { CoordinatingKnowledgeGateway } from './gateway.js';
import type { MageRates } from './gateway.js';
import { buildOutlook } from './outlook.js';

/** `fp(1.0)`. `buildProgress` at which a university is complete (`contracts.md` §1.4). */
const FP_ONE = 1024;

/** Everything the loop needs that is content or configuration rather than state. */
export interface WorldStepDeps {
  /** The species behind an interned id, or `undefined` for one this content lacks. */
  readonly speciesOf: (speciesId: number) => SpeciesRecord | undefined;
  readonly catalog: NodeCatalog;
  readonly cells: CellResolver;
  /** The universe's resolved `store` hook, from its tradition. */
  readonly store: StorePolicy;
  /** Primitive records, for the stacking rules and caps their magnitudes obey. */
  readonly primitives: {
    readonly lifespan: PrimitiveRecord;
    readonly resourceYield: PrimitiveRecord;
    readonly scribeRate: PrimitiveRecord;
    readonly fertility: PrimitiveRecord;
  };
  /**
   * A knowledge subsystem over the state being stepped.
   *
   * A factory rather than an instance, because `step` clones the state every
   * tick: a subsystem built against last tick's state would index rows that the
   * clone no longer has. `KnowledgeSubsystem.fromState` rebuilds every index it
   * keeps, so the cost is linear in instances per tick — acceptable at 0.4.0 and
   * the first thing to measure when the benchmark reaches this layer.
   */
  readonly knowledgeFor: (state: SimState) => KnowledgeSubsystem;
  /** The scale-free mortality hazard. Defaults to the shipped table. */
  readonly hazard?: ScaleFreeHazard | undefined;
}

/** What one world tick did. Reporting only; never an input to any rule. */
export interface WorldStepReport {
  readonly worldTick: number;
  readonly materialsProduced: Fixed;
  readonly materialsRemaining: Fixed;
  readonly carryingCapacity: number;
  readonly mageDeaths: number;
  readonly magesPromoted: number;
  readonly births: number;
  readonly population: number;
  readonly livingMages: number;
  /** Nodes whose last instance was destroyed this tick, by death or by decay. */
  readonly nodesLost: number;
  readonly goalSwitches: number;
}

/** A world schema with the coordinating loop installed, and its last report. */
export interface WorldSimulation {
  readonly schema: ReturnType<typeof defineWorldStateSchema>;
  /** The last tick's report, or `undefined` before the first step. */
  lastReport: () => WorldStepReport | undefined;
}

/**
 * Builds the schema a world simulation is stepped against.
 *
 * The report is handed back through a closure rather than written into state: a
 * `System` returns nothing, and a projection stored in state would be inside
 * every snapshot and therefore inside every hash — at which point two peers
 * could "desync" over a number no rule reads.
 */
export function defineWorldSimulation(deps: WorldStepDeps): WorldSimulation {
  let last: WorldStepReport | undefined;
  const system = worldSystem(deps, (report) => {
    last = report;
  });
  return { schema: defineWorldStateSchema([system]), lastReport: () => last };
}

/**
 * One world tick, as a `System`.
 *
 * @param onReport - Called once per world tick with what happened. Optional, and
 * nothing in the rules path may read what it is given: `contracts.md` §4.4 makes
 * the explain channel *"never an input to any rules computation"*, and a report
 * a rule could read back would be exactly that.
 */
export function worldSystem(
  deps: WorldStepDeps,
  onReport?: (report: WorldStepReport) => void,
): System {
  const hazard: ScaleFreeHazard = deps.hazard ?? hazardAt;

  return {
    name: 'world-tick',
    run(ctx) {
      // §0: entering an engagement freezes world time for the participants. The
      // clock is the authority on which scale a tick is, and a world phase that
      // ran during a raid would age a universe that is supposed to be frozen.
      if (ctx.mode !== TIME_MODE.world) return;

      const state = ctx.state;
      const rng: StepRng = ctx.rng;
      const worldTick = ctx.tick;

      const universe = findUniverse(state);
      if (universe === 0) return;
      const ruleset: Ruleset = readRulesetForObservation(state, universe);

      const knowledge = deps.knowledgeFor(state);
      const cohorts = new CohortStore(state.entities, componentOf(state, POPULACE_COHORT));

      // A gateway memoizes its scans and is therefore a view of one phase, not
      // of one tick — see `gateway.ts`. One is built for each phase that runs
      // after the world has changed, rather than one per tick with an
      // invalidate-me method whose correctness depends on somebody remembering
      // to call it.
      const gatewayFor = (): CoordinatingKnowledgeGateway =>
        new CoordinatingKnowledgeGateway({
          state,
          knowledge,
          catalog: deps.catalog,
          cells: deps.cells,
          ruleset,
          ratesOf: (mage) => ratesOf(state, mage, deps),
          store: deps.store,
        });

      // ---- 1. Materials production ---------------------------------------
      const produced = produceMaterials(cohorts, deps);
      let materials = readRecord(state, UNIVERSE, universe).materials + produced;

      // ---- 2. Populace ----------------------------------------------------
      const populace = stepPopulace(cohorts, {
        hazard,
        species: (speciesId) => demographyOf(speciesId, deps),
        rng,
        worldTick,
        demand: computeOccupationDemand({
          constructionBacklog: constructionBacklog(state),
          scribingQueueDepth: 0,
          universityCapacity: completedCapacity(state),
          standingSoldierTarget: 0,
        }),
      });

      // ---- 3. Mage mortality, and what a death costs -----------------------
      const mortality = killTheDead(state, { rng, worldTick, gateway: gatewayFor(), deps });

      // ---- 4. Promotion -----------------------------------------------------
      const promoted = promoteMaturedStudents(state, cohorts, { rng, worldTick, deps });

      // ---- 5. Autonomy -------------------------------------------------------
      const stockAtDecisionTime = materials;
      const gateway = gatewayFor();
      const autonomy = stepMageAutonomy({
        state,
        worldTick,
        rng,
        outlookFor: (mage) => {
          const row = mageRowOf(state, mage);
          if (row === undefined || row.alive === 0) return undefined;
          return buildOutlook(mage, row, {
            state,
            gateway,
            worldTick,
            speciesOf: deps.speciesOf,
            effectiveLifespanOf: (handle, record, species) =>
              lifespanMonths(state, handle, record, species, deps),
            materials: stockAtDecisionTime,
            scribeThroughputOf: (universityId) =>
              scribeThroughputFor(state, universityId, cohorts, deps),
            tierOf: (nodeId) => deps.catalog.node(nodeId)?.tier ?? 1,
          });
        },
      });

      // ---- 6. Knowledge decay ------------------------------------------------
      const decayed = decayHeldKnowledge({
        knowledge,
        cells: deps.cells,
        ruleset,
        elapsedTicks: 1,
        worldTick,
        retentionOf: (holder) => retentionOf(state, holder, deps),
      });

      // ---- 7. Births ----------------------------------------------------------
      const capacity = carryingCapacity({
        materials,
        completedCapacity: completedCapacity(state),
      });
      const births = deliverBirths(cohorts, {
        rng,
        worldTick,
        brake: fertilityBrake(cohorts.totalCount(), capacity),
        deps,
      });

      // ---- 8. Consumption, then the invariant ---------------------------------
      const consumption = consumeMaterials(materials, {
        subsistence: subsistenceDemand(cohorts.totalCount()),
        libraryUpkeep: 0,
        scribing: 0,
        construction: 0,
      });
      materials = consumption.materialsRemaining;
      assertMaterialsNonNegative(materials);
      componentOf(state, UNIVERSE).set(universe, 'materials', materials);

      onReport?.({
        worldTick,
        materialsProduced: produced,
        materialsRemaining: materials,
        carryingCapacity: capacity,
        mageDeaths: mortality.deaths,
        magesPromoted: promoted,
        births,
        population: populace.population,
        livingMages: countLivingMages(state),
        nodesLost: mortality.nodesLost + decayed.length,
        goalSwitches: autonomy.histogram.goalSwitches,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Phases, each small enough to read in one sitting.
// ---------------------------------------------------------------------------

/**
 * Materials every laborer cohort produces this tick.
 *
 * Per cohort and summed, never averaged: `laborAffinity` is a species trait and
 * a universe holds several species, so an average would let one able cohort
 * raise the output of every other.
 */
function produceMaterials(cohorts: CohortStore, deps: WorldStepDeps): Fixed {
  let produced = 0;
  cohorts.forEach((_handle, key, count) => {
    if (key.occupation !== OCCUPATION.laborer) return;
    const species = deps.speciesOf(key.speciesId);
    if (species === undefined) return;
    produced += materialsProduced({
      laborerCount: count,
      laborAffinity: species.laborAffinity,
      resourceYield: deps.primitives.resourceYield,
      resourceYieldBonuses: [],
    });
  });
  return produced;
}

interface MortalityPhase {
  readonly rng: StepRng;
  readonly worldTick: number;
  readonly gateway: CoordinatingKnowledgeGateway;
  readonly deps: WorldStepDeps;
}

/**
 * Rolls every living mage's hazard, then settles the deaths.
 *
 * Rolled first and settled second, over a collected roster. A death destroys
 * knowledge instances, which moves rows in components this phase is walking;
 * settling inside the walk would make the visit sequence depend on which mage
 * happened to die first, which is a divergence between two peers whose
 * populations differ by nothing at all.
 */
function killTheDead(
  state: SimState,
  phase: MortalityPhase,
): { deaths: number; nodesLost: number } {
  const doomed: { mage: EntityHandle; row: MageRecord }[] = [];

  for (const { handle, row } of collectRecords(state, MAGE)) {
    if (row.alive === 0) continue;
    const species = phase.deps.speciesOf(row.speciesId);
    if (species === undefined) continue;
    const months = lifespanMonths(state, handle, row, species, phase.deps);
    const dies = rollMortality(phase.rng, handle, {
      worldTick: phase.worldTick,
      birthTick: row.birthTick,
      effectiveLifespanMonths: months,
    });
    if (dies) doomed.push({ mage: handle, row });
  }

  let nodesLost = 0;
  const mages = componentOf(state, MAGE);
  for (const entry of doomed) {
    killMage(entry.mage, entry.row, {
      knowledge: phase.gateway,
      heldNodes: (mage) => phase.gateway.heldNodes(mage),
      onNodeInstanceCountZero: () => {
        nodesLost += 1;
      },
      releaseSlots: () => {
        // A university holds no per-mage slot at 0.4.0: §1.4's `capacity` counts
        // students, and a resident-mage slot is not a field §1 declares. A
        // no-op rather than an invention, and the port keeps the obligation
        // visible for whoever adds one.
      },
      abandonGoal: (mage) => {
        clearCommitment(state, mage);
      },
    });
    // The entity survives its owner — a grimoire naming her as its last holder
    // keeps the handle valid — so `alive` is the field that answers "is this
    // mage living" (`components.ts`), and it is cleared here rather than by
    // destroying the row.
    mages.set(entry.mage, 'alive', 0);
    mages.set(entry.mage, 'universityId', 0);
  }

  return { deaths: doomed.length, nodesLost };
}

interface PromotionPhase {
  readonly rng: StepRng;
  readonly worldTick: number;
  readonly deps: WorldStepDeps;
}

/**
 * Promotes matured student cohorts, one stream-1 draw per cohort.
 *
 * The unpromoted **do not stay students** — `promoteStudentCohort` says so and
 * returns their count so that forgetting is visible rather than silent — so they
 * move to `laborer`, which is what a matured adult without magical aptitude is.
 * That is an economy decision rather than a mage-lifecycle one, and it is made
 * here because here is where the two meet.
 */
function promoteMaturedStudents(
  state: SimState,
  cohorts: CohortStore,
  phase: PromotionPhase,
): number {
  const matured: { cohort: EntityHandle; speciesId: number; count: number }[] = [];
  cohorts.forEach((handle, key, count) => {
    if (key.occupation !== OCCUPATION.student || count === 0) return;
    const species = phase.deps.speciesOf(key.speciesId);
    if (species === undefined) return;
    if (phase.worldTick - key.birthTickBucket < species.maturityMonths) return;
    matured.push({ cohort: handle, speciesId: key.speciesId, count });
  });

  let promoted = 0;
  for (const entry of matured) {
    const species = phase.deps.speciesOf(entry.speciesId);
    if (species === undefined) continue;
    const outcome = promoteStudentCohort(
      phase.rng,
      entry.cohort,
      entry.count,
      species.mageAptitude,
    );

    // Removed before the mages are created, so the cohort's members are in
    // exactly one place at every moment of the phase.
    if (outcome.promoted > 0) cohorts.remove(entry.cohort, outcome.promoted);
    if (outcome.notPromoted > 0) {
      cohorts.transfer(entry.cohort, OCCUPATION.laborer, outcome.notPromoted);
    }

    for (let index = 0; index < outcome.promoted; index += 1) {
      const mage = state.entities.create();
      attachRecord(
        state,
        MAGE,
        mage,
        createMage(phase.rng, mage, species, entry.speciesId, phase.worldTick),
      );
      promoted += 1;
    }
  }
  return promoted;
}

interface BirthPhase {
  readonly rng: StepRng;
  readonly worldTick: number;
  readonly brake: Fixed;
  readonly deps: WorldStepDeps;
}

/**
 * Births, one stream-6 draw per fertile cohort, into the youngest `idle` bucket.
 *
 * `idle` because §1.3's occupation list makes it cover the pre-maturity, and a
 * newborn allocated to work is a newborn the labour market will try to move
 * before she can walk. The roster is collected before any insertion, because
 * `insertNewborns` adds a cohort and a walk that saw its own newborns would
 * breed them in the tick they were born.
 *
 * **Extinction is absorbing.** No founding population is synthesised: a species
 * with no cohorts left produces no births, and the loop does not resurrect it.
 */
function deliverBirths(cohorts: CohortStore, phase: BirthPhase): number {
  const fertile: { cohort: EntityHandle; speciesId: number; count: number }[] = [];
  cohorts.forEach((handle, key, count) => {
    if (count === 0) return;
    fertile.push({ cohort: handle, speciesId: key.speciesId, count });
  });

  let born = 0;
  for (const entry of fertile) {
    const species = phase.deps.speciesOf(entry.speciesId);
    if (species === undefined) continue;
    const count = cohortBirths(phase.rng, entry.cohort, {
      count: entry.count,
      fertility: species.fertility,
      fertilityPrimitive: phase.deps.primitives.fertility,
      fertilityBonuses: [],
      brake: phase.brake,
    });
    if (count > 0) {
      insertNewborns(cohorts, entry.speciesId, count, phase.worldTick);
      born += count;
    }
  }
  return born;
}

// ---------------------------------------------------------------------------
// Small projections. None is cached, and none is written to state.
// ---------------------------------------------------------------------------

function ratesOf(state: SimState, mage: Handle, deps: WorldStepDeps): MageRates | undefined {
  const row = mageRowOf(state, mage);
  const species = row === undefined ? undefined : deps.speciesOf(row.speciesId);
  if (species === undefined) return undefined;
  return {
    learnRate: species.learnRate,
    rediscoveryAffinity: species.rediscoveryAffinity,
    depthCeiling: species.depthCeiling,
  };
}

function demographyOf(speciesId: number, deps: WorldStepDeps): CohortDemography | undefined {
  const species = deps.speciesOf(speciesId);
  if (species === undefined) return undefined;
  return { lifespanMonths: species.lifespanMonths, maturityMonths: species.maturityMonths };
}

/** This mage's effective lifespan, recomputed rather than stored (`§1.2`, §3). */
function lifespanMonths(
  state: SimState,
  mage: EntityHandle,
  row: MageRecord,
  species: SpeciesRecord,
  deps: WorldStepDeps,
): number {
  return effectiveLifespan({
    species,
    mage,
    birthTick: row.birthTick,
    rootSeed: state.rootSeed,
    lifespanPrimitive: deps.primitives.lifespan,
    // Empty is the ordinary case: `lifespan` effects come from blessings and
    // curses, which are `god-agency`'s to issue.
    effectMagnitudes: [],
  }).months;
}

function retentionOf(state: SimState, holder: Handle, deps: WorldStepDeps): number {
  const row = mageRowOf(state, holder);
  if (row === undefined) return 0;
  return deps.speciesOf(row.speciesId)?.retention ?? 0;
}

function mageRowOf(state: SimState, mage: Handle): MageRecord | undefined {
  const store = componentOf(state, MAGE);
  if (!store.has(mage as EntityHandle)) return undefined;
  return readRecord(state, MAGE, mage as EntityHandle);
}

function countLivingMages(state: SimState): number {
  let count = 0;
  const store = componentOf(state, MAGE);
  const alive = store.field('alive');
  store.forEach((row) => {
    if ((alive[row] as number) !== 0) count += 1;
  });
  return count;
}

/** Summed remaining `buildProgress` across unfinished universities, `fp`. */
function constructionBacklog(state: SimState): Fixed {
  let backlog = 0;
  for (const { row } of collectRecords(state, UNIVERSITY)) {
    if (row.buildProgress < FP_ONE) backlog += FP_ONE - row.buildProgress;
  }
  return backlog;
}

/** Student seats across completed universities. Unfinished ones carry nobody. */
function completedCapacity(state: SimState): number {
  let total = 0;
  for (const { row } of collectRecords(state, UNIVERSITY)) {
    if (row.buildProgress >= FP_ONE) total += row.capacity;
  }
  return total;
}

/**
 * Scribe-months a university produces this tick.
 *
 * The scribe cohorts are the universe's, not the university's: §1.4 gives a
 * university `staffCohorts`, and until `god-agency` staffs one there is no
 * assignment to read. Taking the whole scribe population is the honest
 * placeholder — it is wrong in the direction of over-supply, which shows up as
 * scribing being too easy rather than as a mask that never lifts, and it is
 * marked here rather than buried.
 */
function scribeThroughputFor(
  state: SimState,
  universityId: Handle,
  cohorts: CohortStore,
  deps: WorldStepDeps,
): Fixed {
  if (universityId === 0) return 0;
  const store = componentOf(state, UNIVERSITY);
  if (!store.has(universityId as EntityHandle)) return 0;

  let scribes = 0;
  let affinity = 0;
  cohorts.forEach((_handle, key, count) => {
    if (key.occupation !== OCCUPATION.scribe) return;
    const species = deps.speciesOf(key.speciesId);
    if (species === undefined) return;
    scribes += count;
    // The best affinity present, not an average: an average would make one
    // clumsy cohort slow down a dwarven scriptorium.
    if (species.scribeAffinity > affinity) affinity = species.scribeAffinity;
  });
  if (scribes === 0) return 0;

  return scribingThroughput(readRecord(state, UNIVERSITY, universityId as EntityHandle), {
    scribeCount: scribes,
    scribeAffinity: affinity,
    scribeRate: deps.primitives.scribeRate,
    scribeRateBonuses: [],
  });
}
