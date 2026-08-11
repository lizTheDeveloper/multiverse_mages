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
 * 5. **Work.** Every mage who has held a goal since last tick spends her month
 *    on it. Before autonomy, because `selectGoal` asks the caller whether the
 *    incumbent goal *completed* — so the work has to have happened before the
 *    question is asked, or a mage would defend a finished project for a whole
 *    commitment period. After promotion and after the deaths, so that the tick's
 *    labour is the living mages' and a mage who died this month contributes
 *    nothing, which `mage-lifecycle` states as a scenario.
 * 6. **Autonomy.** After work, so a new mage decides in the tick she appears and
 *    a finishing mage decides in the tick she finishes. A newly promoted mage
 *    carries no commitment, so she reads as `no-incumbent` and evaluates
 *    immediately — which is what the absent component means.
 * 7. **Knowledge decay.** After autonomy, so a decision is made against the
 *    mastery the mage had when the tick began.
 * 8. **Births.** After the deaths, so newborns are not aged, reallocated or
 *    killed in the tick they arrive, and against a carrying capacity computed
 *    from this tick's stock.
 * 9. **Consumption, then the non-negative invariant.** Last, because every other
 *    phase is a claimant: subsistence is charged for the population that
 *    survived, and upkeep for the shelves that survived.
 *
 * ## Scribing is the one claimant that pays at the desk
 *
 * Every other cost is settled in phase 9 through `consumeMaterials`, which pays
 * the four claimants down a fixed priority order. Scribing cannot wait for it: a
 * grimoire either exists at the end of the tick or does not, and a book charged
 * after the fact could be charged against a stock that phase 9 had already
 * emptied. So the work phase deducts a finished book's `scribeCost` at the
 * moment it is written, and only ever offers a scribe what is left **after this
 * tick's subsistence is set aside** — which is how the priority order is
 * honoured by a claimant that is paid out of order.
 *
 * ## What this loop deliberately does not do
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
import { FP_ONE as FP_UNIT, TIME_MODE, mul } from '@mm/sim-core';
import type { Handle, MageRecord, Ruleset } from '@mm/state';
import {
  EFFORT_KIND,
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
import type {
  AcquirePolicy,
  CellResolver,
  KnowledgeSubsystem,
  NodeCatalog,
  StorePolicy,
} from '@mm/rules-magic';
import { decayHeldKnowledge } from '@mm/rules-magic';
import type { RediscoveryClampCounter } from '@mm/primitives';
import { createRediscoveryClampCounter } from '@mm/primitives';
import type {
  CohortDemography,
  MageGoalCommitment,
  ScaleFreeHazard,
  StepRng,
  TerritoryExtent,
} from '@mm/rules-world';
import {
  CohortStore,
  GOAL,
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
  readCommitment,
  rollMortality,
  scribingThroughput,
  stepMageAutonomy,
  stepPopulace,
  subsistenceDemand,
} from '@mm/rules-world';

import { EffortLedger } from './effort-store.js';
import { cellNodeIndex } from './frontier-index.js';
import { CoordinatingKnowledgeGateway } from './gateway.js';
import type { MageRates } from './gateway.js';
import type { GodDeps, GodTickReport } from './god/index.js';
import { frozenWhenTerminal, godSystems } from './god/index.js';
import { buildOutlook, universityPreference } from './outlook.js';

/** `fp(1.0)`. `buildProgress` at which a university is complete (`contracts.md` §1.4). */
const FP_ONE = FP_UNIT;

/**
 * What one mage contributes to her committed project in one world tick.
 *
 * `fp(1)` — one mage-month per month, which is the definition of the unit rather
 * than a tuning value: `contracts.md` §0 makes a world tick a month, and §2.3
 * authors `researchCost` and `teachCost` in mage-months. A mage who worked at
 * some other rate would be a mage whose month was not a month.
 *
 * What *is* untuned, and deliberately absent, is every multiplier that should
 * eventually scale it: a library's `research-rate` contribution, a mage's
 * `vigor`, a professor's teaching load. Each belongs to a mechanism that is not
 * built, and a placeholder factor here would be a balance number nobody authored
 * sitting in the middle of the one loop every later measurement runs through.
 */
const MAGE_MONTHS_PER_TICK: Fixed = FP_ONE;

/** Everything the loop needs that is content or configuration rather than state. */
export interface WorldStepDeps {
  /** The species behind an interned id, or `undefined` for one this content lacks. */
  readonly speciesOf: (speciesId: number) => SpeciesRecord | undefined;
  readonly catalog: NodeCatalog;
  readonly cells: CellResolver;
  /** The universe's resolved `store` hook, from its tradition. */
  readonly store: StorePolicy;
  /**
   * The universe's resolved `acquire` hook, from its tradition.
   *
   * Beside `store` because it arrives the same way and for the same reason: the
   * loop may not read a tradition id, so arbitration happens once at the
   * composition root and what reaches here is a resolved hook. What it governs
   * is `GatewayDeps.acquire`'s to say.
   */
  readonly acquire: AcquirePolicy;
  /**
   * The universe's territory, summed from content by `territoryExtent`.
   *
   * Carried on the deps rather than read from state because it is fixed for the
   * length of a run (`contracts.md` §2.7) — and because `carrying-capacity.ts`
   * derives `K` from it precisely so that `K` cannot be moved by anything the
   * loop below produces.
   */
  readonly territory: TerritoryExtent;
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
  /**
   * `god-agency`'s two systems, or `undefined` for a world with no god in it.
   *
   * Optional so that every caller written before the god had verbs — the unit
   * fixtures, the throughput benchmark, anything measuring the loop in
   * isolation — keeps building exactly the world it built before, with the same
   * systems in the same order. Supplying it installs {@link godSystems} either
   * side of this loop and wraps this loop so that a terminated universe stops.
   *
   * See `god/system.ts` for why the god is two systems and why they sit where
   * they do.
   */
  readonly god?: GodDeps | undefined;
  /**
   * Per-mage multipliers the god's interventions contribute, `fp`.
   *
   * The two seams this file already named as `god-agency`'s. `MAGE_MONTHS_PER_TICK`
   * says every multiplier that should eventually scale a mage's month *"belongs
   * to a mechanism that is not built"*, and `lifespanMonths` says `lifespan`
   * effects *"come from blessings and curses, which are `god-agency`'s to
   * issue"*. These are those mechanisms arriving, as callbacks rather than as
   * imports, so that this file gains no knowledge of what a blessing is.
   *
   * `researchMultiplierFor` returns `fp(1024)` for an unaffected mage, so a
   * world with no god is a world where every month is a month.
   */
  readonly researchMultiplierFor?:
    | ((state: SimState, worldTick: number, mage: Handle, nodeId: number) => Fixed)
    | undefined;
  readonly teachMultiplierFor?:
    | ((state: SimState, worldTick: number, mage: Handle) => Fixed)
    | undefined;
  /** `lifespan` effect magnitudes in force on one mage, for the shared stacking. */
  readonly lifespanEffectsFor?:
    | ((state: SimState, worldTick: number, mage: Handle) => readonly Fixed[])
    | undefined;
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
  /** Research projects that reached their requirement and became instances. */
  readonly researchCompleted: number;
  /** Teaching projects that paid `teachCost` and transmitted the node. */
  readonly lessonsTaught: number;
  /** Books finished this tick. */
  readonly grimoiresScribed: number;
  /** Materials those books cost, deducted at the desk. `fp`. */
  readonly materialsScribed: Fixed;
  /** Projects with progress banked at the end of the tick, finished or not. */
  readonly effortsInFlight: number;
}

/** A world schema with the coordinating loop installed, and its last report. */
export interface WorldSimulation {
  readonly schema: ReturnType<typeof defineWorldStateSchema>;
  /** The last tick's report, or `undefined` before the first step. */
  lastReport: () => WorldStepReport | undefined;
  /**
   * How often the `fp(3072)` rediscovery floor discarded species affinity, over
   * the whole run so far. A snapshot of the counter, so a caller cannot advance
   * it. Reporting only, like every other projection here.
   */
  rediscoveryClamps: () => RediscoveryClampCounter;
  /**
   * The last tick's god report, or `undefined` — before the first tick, or for
   * a world built without `deps.god`.
   */
  lastGodReport: () => GodTickReport | undefined;
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
  // One counter for the whole simulation, not one per tick. `primitives` is
  // explicit that the figure worth having is the *share* of rediscovery
  // evaluations the `fp(3072)` floor ate over a run, and a counter rebuilt every
  // phase reads zero forever while looking like it is measuring something.
  const clampCounter = createRediscoveryClampCounter();
  const system = worldSystem(deps, (report) => {
    last = report;
  }, clampCounter);

  // ---- god-agency: three systems where there was one --------------------
  // The god acts before the tick and is paid after it. `frozenWhenTerminal`
  // stops this loop for a universe that has ascended or stagnated, which is a
  // wrapper at the composition point rather than a guard inside the loop —
  // see `god/system.ts`.
  if (deps.god === undefined) {
    return {
      schema: defineWorldStateSchema([system]),
      lastReport: () => last,
      rediscoveryClamps: () => ({ ...clampCounter }),
      lastGodReport: () => undefined,
    };
  }
  // The god's outcome system needs this tick's node losses, and the world loop
  // has just computed them. Supplied here rather than by the caller because
  // this function owns the report closure, and a caller wiring its own would be
  // a second place the two could disagree about which tick a count belongs to.
  const god = godSystems({
    ...deps.god,
    nodesLostThisTick: (worldTick) => (last?.worldTick === worldTick ? last.nodesLost : 0),
  });
  return {
    schema: defineWorldStateSchema([god.intervention, frozenWhenTerminal(system), god.outcome]),
    lastReport: () => last,
    rediscoveryClamps: () => ({ ...clampCounter }),
    lastGodReport: god.lastReport,
  };
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
  clampCounter: RediscoveryClampCounter = createRediscoveryClampCounter(),
): System {
  const hazard: ScaleFreeHazard = deps.hazard ?? hazardAt;
  // `cellOf` inverted, once for the whole system rather than once per gateway.
  // It is a function of the content set alone — see `frontier-index.ts` — and
  // `deps` is fixed at install time, so a per-phase rebuild would be an
  // `O(catalog)` pass three times a tick to compute the same answer.
  const nodesByCell = cellNodeIndex(deps.catalog, deps.cells);

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
      // One ledger per tick, for the reason the gateway is one per phase: it
      // keys an index off the component's rows, and it is the only writer, so it
      // stays correct exactly as long as nothing else touches them.
      const efforts = new EffortLedger(state);

      // ---- 1. Materials production ---------------------------------------
      const produced = produceMaterials(cohorts, deps);
      let materials = readRecord(state, UNIVERSE, universe).materials + produced;

      // Scribing is paid at the desk rather than in phase 9 — see the module
      // note — so what a scribe may spend is the stock less this tick's
      // subsistence, which outranks her in `CONSUMPTION_ORDER`. Read once,
      // before the populace phase changes the headcount, so that every scribe in
      // a tick is offered the same stock.
      const subsistenceReserve = subsistenceDemand(cohorts.totalCount());
      let materialsScribed = 0;
      const materialsAccess = {
        available: () => Math.max(materials - subsistenceReserve, 0),
        consume: (amount: Fixed) => {
          materials -= amount;
          materialsScribed += amount;
        },
      };

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
          nodesByCell,
          ruleset,
          ratesOf: (mage) => ratesOf(state, mage, deps),
          store: deps.store,
          acquire: deps.acquire,
          effort: efforts,
          rng,
          materials: materialsAccess,
          clampCounter,
        });

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
      const mortality = killTheDead(state, {
        rng,
        worldTick,
        gateway: gatewayFor(),
        efforts,
        deps,
      });

      // ---- 4. Promotion -----------------------------------------------------
      const promoted = promoteMaturedStudents(state, cohorts, { rng, worldTick, deps });

      // ---- 5. Work -----------------------------------------------------------
      const work = spendTheMonth(state, gatewayFor(), deps, worldTick);

      // ---- 6. Autonomy -------------------------------------------------------
      const stockAtDecisionTime = materials;
      const gateway = gatewayFor();
      // One scan of the shelves for the whole phase, not one per mage. See
      // `universityPreference`.
      const preferredUniversityFor = universityPreference(state);
      const autonomy = stepMageAutonomy({
        state,
        worldTick,
        rng,
        // The caller's judgement, which is exactly how `select.ts` asks for it:
        // completion is a fact about the work, and the work happened one phase
        // ago. A mage who finished this month reconsiders this month rather than
        // guarding a project that no longer exists for a commitment period.
        isComplete: (mage) => work.completedBy.has(mage),
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
            preferredUniversityFor,
          });
        },
      });

      // ---- 7. Knowledge decay ------------------------------------------------
      const decayed = decayHeldKnowledge({
        knowledge,
        cells: deps.cells,
        ruleset,
        elapsedTicks: 1,
        worldTick,
        retentionOf: (holder) => retentionOf(state, holder, deps),
      });

      // ---- 8. Births ----------------------------------------------------------
      const capacity = carryingCapacity({
        territory: deps.territory,
        materials,
        completedCapacity: completedCapacity(state),
      });
      const births = deliverBirths(cohorts, {
        rng,
        worldTick,
        brake: fertilityBrake(cohorts.totalCount(), capacity),
        deps,
      });

      // ---- 9. Consumption, then the invariant ---------------------------------
      const consumption = consumeMaterials(materials, {
        subsistence: subsistenceDemand(cohorts.totalCount()),
        libraryUpkeep: 0,
        // Zero because scribing has already been paid, at the desk, in phase 5.
        // Charging it twice is the obvious mistake here; the tick's spend is
        // reported as `materialsScribed` rather than hidden.
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
        researchCompleted: work.researchCompleted,
        lessonsTaught: work.lessonsTaught,
        grimoiresScribed: work.grimoiresScribed,
        materialsScribed,
        effortsInFlight: efforts.size,
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
  readonly efforts: EffortLedger;
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
        // And everything she had set down. A dead mage's entity is retained so
        // that a grimoire naming her as its last holder keeps a valid handle,
        // which means her effort rows would otherwise sit there describing work
        // nobody is doing — and a teaching row she was half of would leave a
        // student paired with a corpse, which `mage-lifecycle` forbids in as
        // many words.
        phase.efforts.clearSubject(mage);
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

/** What the work phase did, and who it freed to reconsider. */
interface WorkPhaseOutcome {
  /** Mages whose committed project finished this tick, either side of a lesson. */
  readonly completedBy: ReadonlySet<Handle>;
  readonly researchCompleted: number;
  readonly lessonsTaught: number;
  readonly grimoiresScribed: number;
}

/**
 * Every living mage spends her month on whatever she committed to.
 *
 * ## Only a held commitment is worked
 *
 * The commitment read here is the one written *last* tick, because this phase
 * runs before autonomy. That is what makes a month of work a month: a mage who
 * decided and worked in the same tick would be paid for a decision she had not
 * made when the month began, and a mage who switched goals would be paid twice.
 *
 * ## Ascending slot order, and the draws do not care
 *
 * Mages are visited through a slot-ordered roster, for the reason
 * `stepMageAutonomy` gives: row order is a function of the destroy history, so
 * two identical universes would work in different orders. The RNG is unaffected
 * either way — `contracts.md` §6 keys research on the subject, teaching on the
 * teacher and scribing on the scribe, so no mage's draws can move another's, and
 * a mage who is idle draws nothing at all.
 *
 * ## A lesson is one project with two people pushing it
 *
 * `teach` and `seek-teaching` are the two ends of the same work, and the effort
 * row is keyed on the pair. So a teacher and her student each spend a month and
 * the row advances by two, which is what `teachCost` being *the pair's* cost
 * means. Neither goal requires the other to exist: a teacher with a willing
 * student advances the lesson alone, at half speed.
 */
function spendTheMonth(
  state: SimState,
  gateway: CoordinatingKnowledgeGateway,
  deps: WorldStepDeps,
  worldTick: number,
): WorkPhaseOutcome {
  // The `alive` column and the handle, rather than a `MageRecord` per mage: the
  // two fields below are all this phase reads, and `collectRecords` builds an
  // object carrying every field of §1.2 to supply one of them. Same component,
  // same ascending slot order — `collectRecords` gets its order from this very
  // `forEach` — and this phase adds and removes no mage, so the walk cannot be
  // disturbed by what it does.
  const mages = componentOf(state, MAGE);
  const alive = mages.field('alive');
  mages.forEach((row, handle) => {
    if ((alive[row] as number) === 0) return;
    const commitment = readCommitment(state, handle);
    if (commitment === undefined) return;
    workOne(state, handle, commitment, gateway, deps, worldTick);
  });

  const completedBy = new Set<Handle>();
  let researchCompleted = 0;
  let lessonsTaught = 0;
  let grimoiresScribed = 0;
  for (const done of gateway.completions()) {
    completedBy.add(done.subject);
    if (done.counterparty !== 0) completedBy.add(done.counterparty);
    if (done.kind === EFFORT_KIND.research) researchCompleted += 1;
    else if (done.kind === EFFORT_KIND.teaching) lessonsTaught += 1;
    else grimoiresScribed += 1;
  }
  return { completedBy, researchCompleted, lessonsTaught, grimoiresScribed };
}

/**
 * One mage's month, routed to the accrual her goal names.
 *
 * A goal with no accrual behind it — `idle`, `affiliate`, `ward-duty`,
 * `raid-readiness` — falls through and spends nothing, which is honest: two of
 * those wait on capabilities that do not exist, and `affiliate` completes
 * through `completeAffiliation` rather than by accumulating months. A mage whose
 * committed goal needs a counterparty and has none this tick also spends
 * nothing; the feasibility mask moves her on at her next evaluation.
 */
function workOne(
  state: SimState,
  mage: Handle,
  commitment: MageGoalCommitment,
  gateway: CoordinatingKnowledgeGateway,
  deps: WorldStepDeps,
  worldTick: number,
): void {
  const nodeId = commitment.targetNodeId;
  if (nodeId === 0) return;

  // The god's contribution to this month, through the shared `research-rate`
  // and `teach-rate` channels and their caps. `fp(1024)` — a month is a month —
  // for a world with no god, so nothing below changes for a caller that did not
  // ask for one.
  const researched = mul(
    MAGE_MONTHS_PER_TICK,
    deps.researchMultiplierFor?.(state, worldTick, mage, nodeId) ?? FP_ONE,
  );

  switch (commitment.goalId) {
    case GOAL.researchNode:
    case GOAL.rediscoverNode:
      // One accrual for both, because they are one operation: `rules-magic`'s
      // `research` decides for itself whether a node is a rediscovery, from the
      // ever-known record, and a second code path here could disagree with it.
      gateway.contributeResearch(mage, nodeId, researched);
      return;
    case GOAL.teach: {
      const student = gateway.studentFor(mage, nodeId);
      if (student !== undefined) {
        // The *teacher's* multiplier, on the teacher's half of the pair. §2.3
        // prices a lesson as the pair's cost and both push the same row, so a
        // blessed teacher advances it faster and a blessed student advances her
        // own half faster — which is what "one project with two people pushing
        // it" means when the two are not equally favoured.
        gateway.contributeTeaching(
          mage,
          student,
          nodeId,
          mul(MAGE_MONTHS_PER_TICK, deps.teachMultiplierFor?.(state, worldTick, mage) ?? FP_ONE),
        );
      }
      return;
    }
    case GOAL.seekTeaching: {
      const teacher = gateway.teacherFor(mage, nodeId);
      if (teacher !== undefined) {
        gateway.contributeTeaching(
          teacher,
          mage,
          nodeId,
          mul(MAGE_MONTHS_PER_TICK, deps.teachMultiplierFor?.(state, worldTick, mage) ?? FP_ONE),
        );
      }
      return;
    }
    case GOAL.scribe:
      gateway.contributeScribing(mage, nodeId, MAGE_MONTHS_PER_TICK);
      return;
    default:
      return;
  }
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
  const store = componentOf(state, MAGE);
  const species = store.has(mage as EntityHandle)
    ? deps.speciesOf(store.get(mage as EntityHandle, 'speciesId'))
    : undefined;
  if (species === undefined) return undefined;
  return {
    learnRate: species.learnRate,
    rediscoveryAffinity: species.rediscoveryAffinity,
    depthCeiling: species.depthCeiling,
    scribeAffinity: species.scribeAffinity,
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
    // `god-agency` issues these now — a blessing contributes to `lifespan`
    // through the shared stacking arithmetic — but only when a god was
    // installed. Empty stays the ordinary case for a world without one.
    effectMagnitudes: deps.lifespanEffectsFor?.(state, state.clock.worldTick, mage) ?? [],
  }).months;
}

/**
 * This holder's species retention, or `0` for a handle that is not a mage.
 *
 * Reads the one field it needs rather than the whole `MAGE` row. The decay
 * phase asks this once per held instance, which is tens of thousands of times a
 * tick in a mature universe, and `readRecord` builds an object carrying every
 * field of §1.2 to answer a question about one of them.
 */
function retentionOf(state: SimState, holder: Handle, deps: WorldStepDeps): number {
  const store = componentOf(state, MAGE);
  if (!store.has(holder as EntityHandle)) return 0;
  return deps.speciesOf(store.get(holder as EntityHandle, 'speciesId'))?.retention ?? 0;
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
