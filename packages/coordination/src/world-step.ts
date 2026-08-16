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
 *    from this tick's stock *and this tick's subsistence shortfall* — a
 *    universe that cannot feed the population it has carries fewer people, and
 *    the share it cannot cover is known here because phase 9 has not run yet.
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
 * tick's subsistence and this tick's library upkeep are set aside** — which is
 * how the priority order is honoured by a claimant that is paid out of order.
 * Upkeep joined that reserve when vision §6a's brake 4 was wired: it outranks
 * scribing in `CONSUMPTION_ORDER`, and a reserve that covered only subsistence
 * would have let a scribe spend the shelves' keep and then let phase 9 charge
 * it again.
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
import { FP_ONE as FP_UNIT, TIME_MODE, floorDiv, mul } from '@mm/sim-core';
import type { Handle, MageRecord, Ruleset } from '@mm/state';
import {
  EFFORT_KIND,
  MAGE,
  OCCUPATION,
  POPULACE_COHORT,
  MATERIAL_STOCK,
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
  ExclusionResolver,
  KnowledgeSubsystem,
  NodeCatalog,
  StorePolicy,
} from '@mm/rules-magic';
import { decayHeldKnowledge } from '@mm/rules-magic';
import type { AblationMask, RediscoveryClampCounter } from '@mm/primitives';
import { ClampCounters, createRediscoveryClampCounter } from '@mm/primitives';
import type {
  ApplicationWeights,
  CastingWeights,
  CapitalEmission,
  HiredLabourWeights,
  TeachingWeights,
  CohortDemography,
  ConservationBreach,
  MageGoalCommitment,
  MaterialAmounts,
  MaterialKind,
  ScaleFreeHazard,
  SpeciesAffinities,
  StepRng,
  TargetAppealWeights,
  TerritoryExtent,
} from '@mm/rules-world';
import {
  CohortStore,
  GOAL,
  GOAL_COUNT,
  LABORERS_PER_BUILD_UNIT,
  MATERIALS_PER_LABOR_MONTH,
  MATERIAL_KINDS,
  NO_STANDING_ARMY,
  advanceConstruction,
  appliedYield,
  applyStockCeiling,
  assertMaterialsConserved,
  conservationBreaches,
  CLAIMANT_KIND,
  CONSUMPTION_ORDER,
  applicationRations,
  applyLibraryUpkeep,
  assignStaff,
  staffingIndex,
  assertMaterialsNonNegative,
  carryingCapacity,
  clearCommitment,
  cohortBirths,
  computeOccupationDemand,
  affordableMageMonths,
  castingDemand,
  consumeMaterials,
  createMage,
  effectiveLifespan,
  fertilityBrake,
  fundedTeachingShare,
  hazardAt,
  hireableMonths,
  insertNewborns,
  insightTeachingBonus,
  killMage,
  libraryRateMultiplier,
  libraryUpkeep,
  materialsProduced,
  promoteStudentCohort,
  readCommitment,
  rollMortality,
  scribingThroughput,
  stepMageAutonomy,
  stepPopulace,
  subsistenceDemand,
  teachingInsightDemand,
  totalAmount,
  landTotal,
  zeroAmounts,
} from '@mm/rules-world';

import type { UniverseEconomyBonuses, UniverseEffectIndex } from './universe-effects.js';
import { NO_ECONOMY_BONUSES, universeEconomyBonuses } from './universe-effects.js';
import type { AcademicEffectIndex, AcademicRateBonuses } from './academic-effects.js';
import { NO_ACADEMIC_BONUSES, academicRateBonuses } from './academic-effects.js';
import type { VitalityBonuses, VitalityIndex } from './knowledge-vitality.js';
import { NO_VITALITY_BONUSES, lifespanBonusesFor, vitalityBonuses } from './knowledge-vitality.js';
import type { LibraryCapital } from './capital.js';
import { libraryCapital } from './capital.js';
import { EffortLedger } from './effort-store.js';
import { cellNodeIndex } from './frontier-index.js';
import { CoordinatingKnowledgeGateway } from './gateway.js';
import type { MageRates } from './gateway.js';
import type { NodeFacetResolver } from './node-facets.js';
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
 * What scales it is every source of `research-rate`, `teach-rate` and
 * `scribe-rate` there is, stacked once into `(1 + Σ)` and clamped once at
 * `fp(4096)` — a blessing, an encouragement, the depth of the library the mage
 * works in (vision §6a), and **what the mage herself knows**
 * (`academic-effects.ts`). The last of those is the newest and was the longest
 * missing: until it arrived a god could bless a mage into productivity and a
 * century of scholarship could not. A mage's `vigor` and a professor's teaching
 * load are still absent, and still belong to mechanisms that are not built.
 */
const MAGE_MONTHS_PER_TICK: Fixed = FP_ONE;

/** Everything the loop needs that is content or configuration rather than state. */
export interface WorldStepDeps {
  /** The species behind an interned id, or `undefined` for one this content lacks. */
  readonly speciesOf: (speciesId: number) => SpeciesRecord | undefined;
  readonly catalog: NodeCatalog;
  /**
   * Widened to {@link ExclusionResolver} rather than the bare `CellResolver`: the
   * knowledge subsystem needs a cell's anti-requisites (`vision.md` §4b) on the
   * acquisition path, and `MagicGrid` supplies both from one object. Every
   * consumer that only wanted `cellOf` is unaffected — this is a superset.
   */
  readonly cells: ExclusionResolver;
  /**
   * A node's cell, form and effect primitives, and a species' resolved
   * affinities.
   *
   * The two content projections vision §7's utility-scored target selection
   * needs and nothing else in the loop does. Both are pure functions of the
   * registry, built once at the composition root — see `node-facets.ts` and
   * `resolveSpeciesAffinities`.
   */
  readonly facets: NodeFacetResolver;
  readonly affinitiesOf: (species: SpeciesRecord) => SpeciesAffinities;
  /**
   * Every magnitude target selection is made of, read once from
   * `autonomy-weight.json`.
   *
   * On the deps rather than read per tick for the reason `readRaidTuning` gives:
   * a run is a reproducible function of its seed and its content revision, and
   * content is not one of the inputs a tick is allowed to re-read.
   */
  readonly appeal: TargetAppealWeights;
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
  /**
   * What this universe's land yields, as shares over the three material kinds
   * summing to `fp(1024)` — `territoryYieldShares` of the same content records
   * {@link WorldStepDeps.territory} was summed from.
   *
   * Beside the extent and for the same reason: it is a function of content that
   * is fixed for the length of a run, so recomputing it per tick would invite
   * somebody to make it depend on something that is not. It is what makes a
   * supply chain **sited** — a universe of river delta and one of highland waste
   * put the same person-months in and get differently-shaped baskets out —
   * without any entity acquiring a coordinate (vision §7a).
   */
  readonly yieldShares: MaterialAmounts;
  /**
   * Every node's universe-scoped economic effect, precomputed from content.
   *
   * The wire `universe-effects.ts` describes at length: without it the shipped
   * content's 46 economically-weighted cells reach nothing, `resource-yield` is
   * an empty array and `build-rate` has no consumer. Optional so that a caller
   * building a world for a knowledge test need not supply one — and when it is
   * absent the economy is exactly the inert one this change replaced, which is
   * a thing a test can assert against rather than a silent degradation.
   */
  readonly universeEffects?: UniverseEffectIndex | undefined;
  /**
   * Every node's personally-targeted academic effect, precomputed from content.
   *
   * The companion wire to `universeEffects`, and the one that took longer to
   * notice because its primitives were not *unconsumed* — they were consumed by
   * the god and by nobody else. `academic-effects.ts` is the long version;
   * the short one is that a blessing could make a mage research faster and
   * a lifetime of scholarship could not.
   *
   * Optional for the same reason `universeEffects` is: a caller building a world
   * for a knowledge test need not supply one, and when it is absent every rate is
   * exactly the god-and-library-only rate this change replaced — a thing a test
   * can assert against rather than a silent degradation.
   */
  readonly academicEffects?: AcademicEffectIndex | undefined;
  /**
   * The wire from knowledge to bodies: `lifespan` and `fertility`.
   *
   * Sibling of {@link WorldStepDeps.universeEffects} and optional for the same
   * reason — a world built for a knowledge test need not supply one, and its
   * absence is exactly the inert behaviour this wire replaced, which is a thing
   * a test can assert against rather than a silent degradation. Absent means
   * `fertilityBonuses: []` and a mage's `lifespan` coming from god blessings
   * alone, which is what every build before it did.
   */
  readonly vitality?: VitalityIndex | undefined;
  /**
   * What a mage-month of magical work costs the archive, read from content.
   *
   * `substrate.md` §6's `casting` claim. Required rather than optional, unlike
   * the effect indices beside it: an absent cost is not a degraded behaviour a
   * test can assert against, it is magic going back to being free, which is the
   * thing this exists to end.
   */
  readonly casting: CastingWeights;
  /**
   * What a month of applied magic makes and what it eats, read from content.
   *
   * Two scalars out of `autonomy-weight.json`. Required rather than defaulted,
   * for the reason {@link WorldStepDeps.appeal} is: a default would have to be a
   * literal, and a universe running on numbers nobody authored passes every test
   * that supplied one.
   */
  readonly application: ApplicationWeights;
  /**
   * What a mage-month of teaching draws from the `insight` stock, and what a
   * funded month adds to `teach-rate`. Read from content.
   *
   * `material-economy`'s sink for `insight`. Required rather than optional, for
   * the reason {@link WorldStepDeps.casting} is: an absent price is not a
   * degraded behaviour a test can assert against, it is a stock with a faucet
   * and no drain — which `economy-flow-models.md` §4 says is not a resource at
   * all, only a label on one.
   */
  readonly teaching: TeachingWeights;
  /**
   * What hiring one extra person-month onto a building site costs in `labor`.
   *
   * `material-economy`'s sink for `labor`. Required for the same reason.
   */
  readonly hiredLabour: HiredLabourWeights;
  /**
   * A deliberately unrecorded drain, for testing the conservation assertion.
   *
   * **The positive control on {@link assertMaterialsConserved}**, and it lives
   * on the shipped path on purpose. A checker that has never failed is not known
   * to work, and a control that re-implements the tick can agree with itself
   * while both have drifted from the real loop. This makes the real loop leak.
   *
   * Absent on every ordinary run. Supplying it takes the named amount out of the
   * closing stock without recording it as a sink, so the ledger must fail by
   * exactly that amount and name that kind.
   */
  readonly leak?: { readonly kind: MaterialKind; readonly perTick: Fixed } | undefined;
  /**
   * §9's ablation mask, neutralizing at most one primitive across the world loop.
   *
   * Absent is the control arm and is what every ordinary run uses.
   *
   * It exists because a causal claim needs a counterfactual that isolates **one**
   * cause. Forbidding *Terram* removes that form's `build-rate` **and** its
   * `resource-yield` **and** stops mages researching in it at all, so an outcome
   * that moves when the cell is forbidden has three candidate explanations.
   * Neutralizing `build-rate` with the ruleset untouched leaves exactly one: the
   * magic is researched, taught, paid for, and does nothing.
   */
  readonly ablation?: AblationMask | undefined;
  /**
   * Primitive records, for the stacking rules and caps their magnitudes obey.
   *
   * `researchRate` and `teachRate` join the list with vision §6a's loop: the
   * library's contribution is a bonus into the *same* `(1 + Σ)` accumulator as
   * every node-sourced and god-sourced bonus, so this file has to hold the
   * registry records that declare how that accumulator stacks and where it caps.
   * *"Node-sourced"* was aspirational when that sentence was written and is
   * literally true since `academic-effects.ts`.
   * Before the loop, the two were held only by `god/effects.ts`, which stacked
   * its own sources and handed back a finished multiplier — and a finished
   * multiplier is exactly what cannot be added to.
   */
  readonly primitives: {
    readonly lifespan: PrimitiveRecord;
    readonly resourceYield: PrimitiveRecord;
    /** `build-rate`, for its stacking rule and cap. Construction's only multiplier. */
    readonly buildRate: PrimitiveRecord;
    readonly researchRate: PrimitiveRecord;
    readonly teachRate: PrimitiveRecord;
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
   * Per-mage `research-rate` and `teach-rate` **magnitudes** the god's
   * interventions contribute, `fp`, unstacked.
   *
   * The two seams this file already named as `god-agency`'s, and they changed
   * shape when the §6a loop arrived. They used to hand back a *stacked
   * multiplier*, which was correct while the god was the only source: one
   * accumulator, one cap, one answer.
   *
   * A library is a second source of the same primitives, and the mage's own
   * castable knowledge is a **third** ({@link WorldStepDeps.academicEffects}).
   * Multiplying a stacked god multiplier by a stacked library multiplier would
   * be two `(1 + Σ)` channels and two `fp(4096)` caps on one quantity, which
   * `mages-and-species/design.md` rejects by name: *"two caps on the same
   * quantity is how a rate ends up at 4.0 × 2.0 without anyone deciding it
   * should be 8.0."* Three sources make the argument three times over. So the
   * god hands over its magnitudes, the library's contribution and the mage's
   * node-sourced magnitudes join them in one array, and `libraryRateMultiplier`
   * stacks and clamps the lot exactly once.
   *
   * An empty array is an unaffected mage, so a world with no god is a world
   * where every month is a month.
   */
  readonly researchBonusesFor?:
    | ((state: SimState, worldTick: number, mage: Handle, nodeId: number) => readonly Fixed[])
    | undefined;
  readonly teachBonusesFor?:
    | ((state: SimState, worldTick: number, mage: Handle) => readonly Fixed[])
    | undefined;
  /** `lifespan` effect magnitudes in force on one mage, for the shared stacking. */
  readonly lifespanEffectsFor?:
    | ((state: SimState, worldTick: number, mage: Handle) => readonly Fixed[])
    | undefined;
}

/** What one world tick did. Reporting only; never an input to any rule. */
export interface WorldStepReport {
  readonly worldTick: number;
  /** Every kind summed. Kept so a reader comparing runs across this change has one series that means the same thing on both sides. */
  readonly materialsProduced: Fixed;
  /** Every kind summed, after consumption. */
  readonly materialsRemaining: Fixed;
  /**
   * Production by kind, `fp` — and the reason the change was made.
   *
   * A single number could not say whether a universe was short of **food** or
   * short of **vellum**, and those are opposite problems with opposite fixes:
   * one is relieved by *Creo Herbam* and the other by *Creo Animal*. The two
   * per-kind series below are what makes the bottleneck nameable, which is what
   * makes a spell worth casting.
   */
  readonly producedByKind: MaterialAmounts;
  /** The closing stocks by kind, `fp`. */
  readonly remainingByKind: MaterialAmounts;
  /** Which kinds could not pay a claimant this tick. */
  readonly shortKinds: Readonly<Record<MaterialKind, boolean>>;
  /**
   * Distinct known, permitted nodes that contributed a universe-scoped economic
   * effect this tick.
   *
   * Emitted because "the economy did not move" and "no node reached it" look
   * identical in every other series, and the entire history of this seam is a
   * bonus list nobody noticed was empty for three releases.
   */
  readonly economicNodes: number;
  /**
   * Contributions that reached a **body** this tick: `lifespan` and `fertility`
   * magnitudes from castable, permitted knowledge.
   *
   * The sibling of {@link WorldStepReport.economicNodes}, emitted for the same
   * reason. Both primitives were declared exclusions in the consumption check
   * until `knowledge-vitality.ts`, and under v1 content this figure is **zero**
   * on every tick — every node authoring either sits outside the twelve enabled
   * cells, so `permits()` refuses it. A zero here and a zero in the birth rate
   * therefore mean different things, and without this counter they would look
   * the same.
   */
  readonly vitalityContributions: number;
  /**
   * `build-rate` magnitudes reaching construction this tick.
   *
   * Separated from {@link economicNodes} because the two answer different
   * questions and the first one anybody asks of this change is *did* `build-rate`
   * *stop being inert*. A run where this is zero for every tick is a run where it
   * did not, whatever the totals say.
   */
  readonly buildRateSources: number;
  /**
   * The `build-rate` magnitudes themselves, so a caller can check **attribution**
   * rather than presence.
   *
   * A count says a number arrived. The magnitudes say *which authored node* it
   * came from, because every one of them must be a magnitude some node in the
   * content set declares — and a wire that invented its own numbers would pass
   * a count and fail this. The list this tick, not cumulative.
   */
  readonly buildRateMagnitudes: readonly Fixed[];
  /** `buildProgress` added by laborers this tick, `fp`. Excludes the god's funding. */
  readonly buildProgressAdded: Fixed;
  /** Universities finished by that labour this tick. */
  readonly universitiesCompleted: number;
  /**
   * Universities standing at the end of the tick, finished or not.
   *
   * A census, not an event, and the difference is the reason it exists.
   * {@link universitiesCompleted} counts only the ones **laborers** finished, so
   * a site the god's fourth funding action completed is invisible to it, and
   * nothing at all reported a *founding*: §4.2 gives founding and funding one
   * action id, so `spentByAction[11]` cannot say which purchase resolved, and
   * `candidates` is capped at the action's slot count and stops counting at
   * seven. A universe that founded a thousand universities and one that founded
   * eight were the same number everywhere a caller could look — which is the
   * same blindness {@link universitiesUnstaffed} was added for, one question
   * earlier: *how many are there at all.*
   *
   * Read once per tick off the component that owns the answer. Nothing hashes
   * it and no rule reads it back.
   */
  readonly universitiesStanding: number;
  /** Stone construction asked for this tick, `fp`. */
  readonly constructionStoneOwed: Fixed;
  /** Stone construction was actually paid, `fp`. Below `owed` means the quarry is the bottleneck. */
  readonly constructionStonePaid: Fixed;
  /**
   * `labor` the hired person-months cost this tick, `fp`.
   *
   * `material-economy`'s sink for `labor`, reported rather than inferred: a
   * hire raises `buildProgressAdded` and spends a stock, and with only those
   * two series a reader cannot tell a fast build funded by Corpus magic from a
   * fast build funded by a big crew.
   */
  readonly constructionLaborPaid: Fixed;
  /** `insight` this tick's teaching drew, `fp`. The sink `insight` earns its slot with. */
  readonly teachingInsightPaid: Fixed;
  /**
   * The share of this tick's teaching the `insight` stock funded, `fp`.
   *
   * `FP_ONE` when the stock covered every teaching month, less when it did not,
   * and `FP_ONE` again when nobody taught at all. Emitted because a fully
   * funded faculty and an unfunded one produce the same lesson *count* and
   * different rates — *"the economy did not move"* and *"nothing reached it"*
   * look identical in every other series.
   */
  readonly teachingFundedShare: Fixed;
  /**
   * What each kind lost to {@link MATERIAL_STOCK_CEILING} this tick, `fp`.
   *
   * Zero on every run this repository has measured, and reported anyway:
   * `economy-flow-models.md` §3.3 says a cap that truncates silently *"destroys
   * the signal that would feed back to whatever is overproducing"*, and a spill
   * nothing reports is a truncation with extra steps. Group 6's ledger puts
   * this on the sink side of `delta == faucet - sink`.
   */
  readonly spilledByKind: MaterialAmounts;
  /**
   * Everything the tick **created**, per kind, `fp` — the land and applied magic.
   *
   * With {@link sinkByKind} this is `economy-flow-models.md` §5.2's missing
   * class: *"Every metric in the registry measures a level, a rate, or a
   * distribution at a checkpoint. None reconciles flows."* Reported rather than
   * only asserted, because §3.4 asks for the conservation check to be a
   * **series** and a function that can only throw cannot be one — a run that
   * balances every tick and one that was never asked look identical otherwise.
   */
  readonly faucetByKind: MaterialAmounts;
  /**
   * Everything the tick **destroyed**, per kind, `fp` — every claimant, the
   * scribes paid at the desk, and the ceiling spill.
   *
   * The spill is included here rather than reported only on its own, because
   * that is the side of `delta == faucet - sink` it has to be on for a capped
   * inflow to balance. {@link spilledByKind} remains separately readable, since
   * "spent" and "lost to a ceiling" are different facts about the economy.
   */
  readonly sinkByKind: MaterialAmounts;
  /**
   * Kinds whose stock did not move by exactly `faucet - sink` this tick.
   *
   * **Always empty on a correct build**, and reported so that a sweep can carry
   * it as a metric instead of discovering it only when an assertion throws. A
   * checker that can only fail loudly gives no evidence while it is passing;
   * this is the series that says it was asked and answered.
   */
  readonly conservationBreaches: readonly ConservationBreach[];
  readonly carryingCapacity: number;
  readonly mageDeaths: number;
  readonly magesPromoted: number;
  readonly births: number;
  /**
   * Populace members lost to the cohort hazard table this tick.
   *
   * Reported beside {@link births} because the question `mages-and-species`
   * task 8.7 asks — *do births and deaths balance at carrying capacity* — was
   * not answerable from this report at all while only one side of it was
   * emitted. A caller could see a population that stopped growing and could not
   * tell a universe in equilibrium from one where nothing happens.
   *
   * Cohort deaths only. Mages are counted by {@link mageDeaths} and are not
   * members of a cohort once promoted, so adding the two would be the right
   * total for "people who died" and the wrong total for either mechanism.
   */
  readonly populaceDeaths: number;
  /** Members moved into `idle` this tick because they passed retirement age. */
  readonly populaceRetired: number;
  /**
   * The share of this tick's subsistence demand the stock could not cover,
   * `fp` in `[0, fp(1024)]`, as it was when `K` was computed.
   *
   * Emitted because it is the input that makes {@link carryingCapacity} fall,
   * and a `K` that drops for no visible reason is a `K` nobody can argue with.
   */
  readonly subsistenceShortfallShare: Fixed;
  readonly population: number;
  readonly livingMages: number;
  /** Nodes whose last instance was destroyed this tick, by death or by decay. */
  readonly nodesLost: number;
  readonly goalSwitches: number;
  /**
   * Mage-months the work phase spent under each goal this tick, indexed by goal
   * id, length `GOAL_COUNT`.
   *
   * ## A goal every mage picks and that does nothing looks like a goal nobody picks
   *
   * `goalSwitches` was the only goal-shaped number this report carried, and it
   * counts *changes*. The per-goal histogram `stepMageAutonomy` builds every
   * tick — `GoalHistogram`, three integers a cell, written precisely so an
   * emergent monoculture is *"visible as a number rather than as an unexplained
   * flat line"* — was read for that one scalar and dropped. So the loop had no
   * standing answer to "what is mage-life actually being spent on", and the one
   * question it could not answer is the one that went wrong: on `08ca5368`,
   * over 600 ticks of the reference universe, **36.5 % of committed mage-months
   * were held on `affiliate`**, a goal {@link workOne} has no arm for and which
   * therefore fell through to `return undefined`. Nothing in the report moved
   * when it did, and nothing in the report would have moved had it been fixed.
   *
   * Counted in the **work** phase rather than taken from the autonomy
   * histogram, and the difference is the point. The histogram answers *what did
   * mages choose*; this answers *what did the month go to* — the same commitment
   * the phase actually consumed, written last tick, including the mages whose
   * goal spent nothing. Put beside {@link researchCompleted},
   * {@link lessonsTaught} and {@link grimoiresScribed}, a large entry with no
   * matching movement is the signature of a verb the rules do not implement.
   *
   * A mage with no commitment row is in no bucket: the sum is at most
   * {@link livingMages} and is smaller for as long as autonomy has not reached
   * a newly promoted mage.
   */
  readonly monthsByGoal: readonly number[];
  /** Research projects that reached their requirement and became instances. */
  readonly researchCompleted: number;
  /** Teaching projects that paid `teachCost` and transmitted the node. */
  readonly lessonsTaught: number;
  /** Books finished this tick. */
  readonly grimoiresScribed: number;
  /** Materials those books cost, deducted at the desk. `fp`. */
  readonly materialsScribed: Fixed;
  /**
   * Materials the mages who cast at the world made this tick, `fp`.
   *
   * The series that says whether the applied channel is *running*, as distinct
   * from whether anything downstream moved. `economicNodes` next door does the
   * same job for the ambient multiplier, and it exists for the reason stated
   * there: *"the economy did not move" and "nothing reached it" look identical
   * in every other series*, and the whole history of this seam is a number
   * nobody noticed was zero for three releases.
   */
  readonly materialsApplied: Fixed;
  /** The same, split by kind, so a stone universe reads apart from a fed one. */
  readonly appliedByKind: MaterialAmounts;
  /** Mages who spent this month applying magic rather than studying it. */
  readonly magesApplying: number;
  /** Food those mages ate, `fp`. Part of this tick's subsistence claim. */
  readonly applicationRations: Fixed;
  /** Projects with progress banked at the end of the tick, finished or not. */
  readonly effortsInFlight: number;
  /**
   * Materials every library's shelves asked for this tick, `fp`. Brake 4.
   *
   * Reported beside {@link libraryUpkeepPaid} because the pair is the whole of
   * the brake: benefit is concave in distinct nodes and cost is linear in
   * instances, so a universe that hoards duplicates pays for every one of them
   * and is paid for none.
   */
  readonly libraryUpkeepOwed: Fixed;
  readonly libraryUpkeepPaid: Fixed;
  /**
   * Shelved instances lost this tick because their library could not be kept.
   *
   * The first channel in the build by which a *written* copy leaves a universe
   * without a raid. Everything else that removes knowledge removes it from a
   * mind: decay only visits held locations, and a mage's death takes her mind
   * and her memory palace and leaves her books standing.
   */
  readonly libraryInstancesDegraded: number;
  /**
   * `contracts.md` §7's `capitalSnowball` inputs, per university, this tick.
   *
   * The `universities` spec requires the metric be computable *"with no
   * additional instrumentation added to the simulation"*, which is why the
   * per-tier array travels rather than only the total: a Gini coefficient over
   * library depth is taken across universes at a fixed tick, and a later
   * question about which tiers carried it cannot be answered from a scalar.
   */
  readonly capital: readonly CapitalEmission[];
  /**
   * Scribe cohorts newly put on a university's staff this tick.
   *
   * `UNIVERSITY_STAFF` shipped in `WORLD_COMPONENTS` with no writer, and this
   * is the writer. Reported because a universe that assigns a cohort every tick
   * is a universe whose cohorts are churning — `contracts.md` §1.3 buckets
   * cohorts by decade of birth, so a steady population re-keys its scribes
   * every ten years and re-staffs then, and a figure that never settles is a
   * populace defect wearing a staffing costume.
   */
  readonly staffAssigned: number;
  /** Staff links dropped this tick because their cohort no longer existed. */
  readonly staffPruned: number;
  /**
   * Completed universities that ended the tick with no staff at all.
   *
   * The number the god's build strategy could not see. Under the global scribe
   * pool every university reported the whole universe's scribes as its own, so
   * founding the thousandth one looked exactly as productive as founding the
   * first. This is the count that says otherwise, and it is the reason the
   * `archivist` strategy could build 1,300 universities and reach the node
   * count that doing nothing reaches.
   */
  readonly universitiesUnstaffed: number;
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
      // What the universe's knowledge is worth to its economy, read once. This
      // is the wire `universe-effects.ts` exists to run: before it, this line's
      // predecessor passed a hardcoded empty array and every `resource-yield`
      // node in the shipped content reached nothing.
      const economy: UniverseEconomyBonuses =
        deps.universeEffects === undefined
          ? NO_ECONOMY_BONUSES
          : universeEconomyBonuses(state, {
              index: deps.universeEffects,
              cells: deps.cells,
              ruleset,
            });

      // The same shape, one primitive pair over: what the universe's castable,
      // permitted knowledge is worth to its bodies rather than to its economy.
      // Read here, beside the economy, because both are functions of the tick's
      // ruleset and both are memoized on the state object.
      const vitality: VitalityBonuses =
        deps.vitality === undefined
          ? NO_VITALITY_BONUSES
          : vitalityBonuses(state, { index: deps.vitality, cells: deps.cells, ruleset });

      // Labour is exclusive between the fields and the building sites, so the
      // split is decided once, here, before either phase spends it.
      // The opening stone is read before production because a crew is hired at
      // the start of the month out of what is already in the yard, not out of
      // what the quarry will deliver by the end of it.
      // And what it is worth to the scholars themselves. Read here rather than
      // in the work phase because the ruleset is here: the permission gate is
      // re-asked every tick, so an interdiction switches a scholar's own
      // acceleration off without destroying what she knows — the same
      // application-time reading `universe-effects.ts` argues for at length.
      const academic: AcademicRateBonuses =
        deps.academicEffects === undefined
          ? NO_ACADEMIC_BONUSES
          : academicRateBonuses(state, {
              index: deps.academicEffects,
              cells: deps.cells,
              ruleset,
            });

      const labour = planConstructionLabour(
        state,
        cohorts,
        readMaterialStock(state, universe).stone,
        deps,
      );
      const produced = produceMaterials(cohorts, deps, economy, labour.onSites);
      const opening = readMaterialStock(state, universe);
      const stock = zeroAmounts();
      for (const kind of MATERIAL_KINDS) stock[kind] = opening[kind] + produced[kind];

      // Every library's shelves, read once for the whole tick. Vision §6a's
      // capital is a function of what is *already* written down, so a book
      // finished in the work phase deepens the library for the next month and
      // not for the one that produced it — and every mage in a tick studies the
      // same shelves whatever order the roster is walked in.
      const capital = libraryCapital(state, {
        catalog: deps.catalog,
        cells: deps.cells,
        ruleset,
      });
      // One counter per tick, for the §7 emission. `contracts.md` §3's cap is
      // the only bound on the capital loop, so how often it binds is the
      // measurement that says whether the brakes are doing anything.
      const rateClamps = new ClampCounters();

      // Scribing is paid at the desk rather than in phase 9 — see the module
      // note — so what a scribe may spend is the **vellum** stock less this
      // tick's library upkeep, which outranks her in `CONSUMPTION_ORDER` and is
      // the only claimant that still shares a stock with her.
      //
      // Subsistence used to be subtracted here too and is not any more, because
      // it is no longer made of the same stuff. That is one of the two places
      // this change is visible as a behaviour difference rather than as a
      // refactor: a hungry universe can now still write its books, and a
      // universe with thin herds cannot write them however well it eats.
      // Brake 4, owed on the shelves as they stand at the top of the tick. Owed
      // on *instances*, so a second copy of a node the library already holds
      // costs upkeep forever and contributes nothing to depth — which is the
      // asymmetry that makes "hoard everything" a losing line.
      const upkeepOwed = capital.libraries.reduce(
        (total, entry) => total + libraryUpkeep(entry.depth),
        0,
      );
      let materialsScribed = 0;
      // Scribing spends **vellum**, and so does library upkeep; subsistence
      // spends food and no longer competes with either. So the reserve a scribe
      // must leave behind is the upkeep alone — `subsistenceReserve` is still
      // read, because phase 8 needs it, but it is no longer subtracted here.
      // That is the differentiated economy doing its first useful thing: a
      // universe can no longer be unable to write a page because it is hungry,
      // and can absolutely be unable to write one because its herds are thin.
      const materialsAccess = {
        available: () => Math.max(stock.vellum - upkeepOwed, 0),
        consume: (amount: Fixed) => {
          stock.vellum -= amount;
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
          facets: deps.facets,
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
          // Zero, by citation rather than by omission. `ages-of-magic.md` §2b:
          // *"A university's stationed mages are its faculty, its researchers
          // and its garrison at once. There is no separate military."* The
          // constant carries the rest of the argument, and the three things
          // that would have to exist before this becomes a number.
          standingSoldierTarget: NO_STANDING_ARMY,
        }),
      });

      // ---- 2a. Staffing -------------------------------------------------
      // Between populace and work, and the position is the whole of the
      // correctness argument. Cohorts are created, merged and emptied in phase
      // 2, so a staff link written before it can name a cohort that no longer
      // exists; and phase 5 reads the links to decide what each university's
      // scribes produce, so they must be settled before it runs.
      //
      // `staff.ts` carries the reasoning for what this phase *is*. The short
      // version: until it existed, `scribeThroughputFor` handed every
      // university the universe's entire scribe population, which its own
      // comment conceded was a placeholder. An institution that cannot own its
      // staff is not an institution, and a thousand of them are not a
      // civilisation.
      const staffing = assignStaff(
        state,
        cohorts
          .handles()
          .filter((handle) => cohorts.keyOf(handle).occupation === OCCUPATION.scribe)
          .map((handle) => ({ cohort: handle, count: cohorts.countOf(handle) })),
        (handle) => cohorts.isLive(handle),
      );
      // One pass over the link component for the whole tick. Phase 5 asks for a
      // university's scribes once per mage, and `mages × links` is the cost
      // shape `libraryDepths` exists to collapse — see `staffingIndex`.
      const staffedBy = staffingIndex(state, (handle) => cohorts.isLive(handle));

      // ---- 3. Mage mortality, and what a death costs -----------------------
      const mortality = killTheDead(state, {
        rng,
        worldTick,
        gateway: gatewayFor(),
        efforts,
        deps,
        vitality,
      });

      // ---- 4. Promotion -----------------------------------------------------
      const promoted = promoteMaturedStudents(state, cohorts, { rng, worldTick, deps });

      // ---- 5. Work -----------------------------------------------------------
      const work = spendTheMonth(
        state,
        gatewayFor(),
        deps,
        worldTick,
        capital,
        rateClamps,
        academic,
        stock.vellum,
        stock.insight,
      );

      // ---- 5a. What the mages who cast at the world made ----------------------
      // Banked through the phase and settled once, so that a mage adding vellum
      // cannot change what a scribe visited later in the same walk could afford.
      // Added to the stock **here**, before births read it, because that is the
      // whole point: `carryingCapacity` and `subsistenceShortfallShare` both read
      // `stock.food` in phase 8, and a harvest that landed after them would be a
      // harvest nobody could eat until next month.
      //
      // Production in phase 1 is not the place for it either. That phase is
      // laborers on land and runs before anybody has spent a month; applied
      // magic is a month, and a month has to be spent before it has made
      // anything.
      const applicationRationsOwed = applicationRations(work.applyingMages, deps.application);
      for (const kind of MATERIAL_KINDS) stock[kind] += work.applied[kind];

      // ---- 6. Autonomy -------------------------------------------------------
      // What a mage believes the treasury holds when she chooses a goal.
      //
      // **The three land kinds, not all seven, and the narrowing is deliberate.**
      // The line used to read `totalAmount(stock)` with the note *"every kind
      // summed, because a goal is scored against 'can this universe afford to do
      // things', not against a particular shelf"* — sound while the only kinds
      // were the three her claimants are paid in. `material-economy` added four
      // that no claimant a mage can see is paid in: `insight` funds her
      // teaching (and is reserved before she chooses), `labor` hires builders,
      // and `essence` and `passage` are the god's to spend. Folding those in
      // would make a scholar more optimistic about her prospects because her god
      // is saving up for a portal, which is not a thing she can observe and not
      // a thing that feeds her.
      const stockAtDecisionTime = landTotal(stock);
      const gateway = gatewayFor();
      // One scan of the shelves for the whole phase, not one per mage. See
      // `universityPreference`.
      const preferredUniversityFor = universityPreference(state);
      const autonomy = stepMageAutonomy({
        state,
        worldTick,
        rng,
        appeal: deps.appeal,
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
              lifespanMonths(state, handle, record, species, deps, vitality),
            materials: stockAtDecisionTime,
            scribeThroughputOf: (universityId) =>
              scribeThroughputFor(state, universityId, staffedBy, cohorts, deps),
            tierOf: (nodeId) => deps.catalog.node(nodeId)?.tier ?? 1,
            facetsOf: deps.facets,
            affinitiesOf: deps.affinitiesOf,
            preferredUniversityFor,
            // The authored half of applicability. Absent on a build with no
            // economy index, which makes `apply-magic` masked for every mage —
            // the same inert world such a build already had.
            ...(deps.universeEffects === undefined
              ? {}
              : { universeEffects: deps.universeEffects }),
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
      // A universe that cannot feed itself carries fewer people, and until this
      // tick the loop never said so. `carrying-capacity.ts` has taken a
      // `subsistenceShortfallShare` since task 8.5 and no caller ever passed
      // one, so the shipped `K` was the well-fed `K` for the length of any run
      // — which the 200-year reference run makes visible: the stock empties
      // around world-year seventy and nothing changes.
      //
      // The share is computed **here** rather than read back out of phase 9,
      // because phase 9 runs after births. Reading it back would mean either
      // storing last tick's share in state — a world-schema revision for a
      // number no rule outside this line reads — or reordering consumption
      // ahead of birth, which would charge subsistence for a population and
      // then let that population grow inside the same tick.
      // Populace *and* the mages who spent the month casting. `application.ts`
      // says why the rations join the subsistence claim rather than becoming a
      // fifth claimant, and this is the line where it matters most: a mage who
      // makes food is now in both the numerator and the denominator of the
      // shortfall, so applied food is a channel that can move carrying capacity
      // and applied stone is not one that can move it for free.
      const subsistenceThisTick =
        subsistenceDemand(cohorts.totalCount()) + applicationRationsOwed;
      const subsistenceShortfallShare =
        subsistenceThisTick <= 0
          ? 0
          : Math.min(
              FP_UNIT,
              floorDiv(
                Math.max(0, subsistenceThisTick - Math.max(0, stock.food)) * FP_UNIT,
                subsistenceThisTick,
              ),
            );
      const capacity = carryingCapacity({
        territory: deps.territory,
        // Food, not the three kinds summed. `carrying-capacity.ts` says why: a
        // country holds more people because there is more to eat, and a heap of
        // quarried stone should raise what a universe can build rather than
        // what it can feed.
        food: stock.food,
        completedCapacity: completedCapacity(state),
        subsistenceShortfallShare,
      });
      const births = deliverBirths(cohorts, {
        rng,
        worldTick,
        brake: fertilityBrake(cohorts.totalCount(), capacity),
        deps,
        fertility: vitality.fertility,
      });

      // ---- 8a. Construction ---------------------------------------------------
      // Laborers raise buildings, and until this phase existed they did not.
      // `advanceConstruction` shipped in `rules-world` with **no caller outside
      // its own tests** — the Monte Carlo harness recorded the consequence as
      // *"universities-are-founded-and-never-finished"* — so `build-rate` had no
      // consumer at all and the god's `fundUniversity` was the only thing that
      // could ever finish a site.
      //
      // The god's flat funding is untouched and still applies. What is added is
      // the ordinary path: person-months of laborer time, paid for in **stone**,
      // multiplied by whatever `build-rate` magic the universe knows.
      const construction = advanceUniversities(state, {
        stone: stock.stone,
        // `material-economy`'s sink for `labor`: person-months hired onto a
        // site over and above the crew the populace supplied. Zero on every
        // world written before this change, and a zero budget hires nobody, so
        // construction there is bit-for-bit what it was.
        //
        // The **whole** stock is handed over, not the stock less the reserve.
        // `hireableMonths` applies `HiredLabourWeights.reserve` itself, once,
        // and subtracting it here as well would floor the drain at twice the
        // declared price — which is what the first draft did, and the trace
        // caught it stalling at 8192 against a reserve of 4096. One subtraction,
        // in the rules package, so that every caller of `hireableMonths`
        // inherits the same floor instead of each remembering to pre-subtract.
        //
        // The floor is on this drain and not on the verb: the hire still draws
        // proportionally above the reserve and simply stops there, so nothing
        // is gated and nothing is held anywhere the ledger cannot see it — a
        // stock held back by a floor is still in the stock.
        labor: stock.labor,
        deps,
        crew: labour.crew,
        buildRateBonuses: economy.buildRate,
        counters: rateClamps,
      });

      // ---- 9. Consumption, then the invariant ---------------------------------
      const consumption = consumeMaterials(stock, {
        // `cohorts.totalCount()` **re-read**, not `subsistenceThisTick` reused,
        // and the difference is one tick's newborns. Phase 8 computes its figure
        // before `deliverBirths` because the birth brake cannot be charged for a
        // population that does not exist yet; this claim is settled afterwards
        // and has always charged for the babies. Reusing the phase-8 number here
        // would be tidier to read and would quietly stop feeding every child born
        // this month — a second behaviour change riding along with this one.
        subsistence: subsistenceDemand(cohorts.totalCount()) + applicationRationsOwed,
        // `substrate.md` §6's spell materials, and the figure the work phase
        // already granted rather than the one it wanted: a researcher whose
        // month the archive could not supply did not spend it, so charging the
        // full demand here would bill for work that never happened. The unmet
        // remainder is reported as `castingShortfall`, not hidden.
        casting: work.castingGranted,
        // What the lessons that actually happened drew from the `insight`
        // stock, at the share they were funded at. Reserved before the work
        // phase and spent during it, exactly as scribing is — see
        // `WorkPhaseOutcome.insightSpent` — so this figure is payable in full
        // by construction and a shortfall here would be a defect rather than a
        // hungry universe.
        teaching: work.insightSpent,
        // Brake 4, charged once. The same figure the work phase reserved out of
        // the scribes' stock at the top of the tick, so the priority order is
        // honoured by a claimant paid out of order and by one paid in it.
        libraryUpkeep: upkeepOwed,
        // Zero because scribing has already been paid, at the desk, in phase 5.
        // Charging it twice is the obvious mistake here; the tick's spend is
        // reported as `materialsScribed` rather than hidden.
        scribing: 0,
        // Charged here rather than deducted in phase 8a, for the reason
        // `advanceConstruction`'s own header gives: the stocks have one writer,
        // and a phase that reached for `stock.stone` itself would be the second.
        construction: construction.stoneOwed,
        // The hired half of the same work, in the kind a body is made of.
        // Zero whenever no site hired anybody, which is every world that holds
        // no `labor` at all.
        constructionLabor: construction.laborOwed,
      });
      // ---- 9a. The ceiling, which spills rather than truncating ------------
      //
      // `economy-flow-models.md` §3.3's corollary: a cap that silently drops the
      // excess *"both breaks conservation and destroys the signal that would
      // feed back to whatever is overproducing"*. So the one place a stock can
      // meet a ceiling returns what did not fit, and the tick reports it. It
      // does not bind on any run this repository has measured — see
      // `MATERIAL_STOCK_CEILING` — and exists because the columns are `i32` and
      // a wrap would surface as a negative stock several phases later.
      const bounded = applyStockCeiling(consumption.remaining);
      const closing = bounded.stock;
      assertMaterialsNonNegative(closing);

      // ---- 9b. The ledger, which is the part that can fail loudly ----------
      //
      // `economy-flow-models.md` §5.2: every other metric here is a *level*, and
      // a level cannot tell material that was spent from material that was lost.
      // So the tick's flows are totted up per kind and the stock's movement is
      // asserted against them — `delta == faucet - sink`, exactly, no epsilon,
      // because every quantity is a fixed-point integer and a tolerance would
      // hide the slow one-unit leak this exists to find.
      //
      // The three faucets and the four sinks are enumerated here rather than
      // accumulated as the tick runs, and that is the whole point: this
      // arithmetic is written from the *stock mutations* — there are exactly
      // three in this function — so a fourth added later without a line here
      // fails the assertion instead of quietly unbalancing the economy.
      const faucet = zeroAmounts();
      const sink = zeroAmounts();
      for (const kind of MATERIAL_KINDS) {
        // Faucets: the land (phase 1) and applied magic (phase 5a).
        faucet[kind] = produced[kind] + work.applied[kind];
        // Sinks: every claimant paid in phase 9, plus the ceiling spill. A
        // spill is on this side because `applyStockCeiling` **returns** what did
        // not fit rather than dropping it; a silent truncation would read here
        // as a leak, which is a diagnosis a reader would then have to un-make.
        sink[kind] = bounded.spilled[kind];
      }
      // Scribing is paid at the desk in phase 5 and so is not in `consumption`.
      // It comes out of vellum, and omitting it would make vellum the one kind
      // that never balances.
      sink.vellum += materialsScribed;
      for (const claimant of CONSUMPTION_ORDER) {
        sink[CLAIMANT_KIND[claimant]] += consumption.spent[claimant];
      }
      // §9's leak injector, and the reason it is in the shipped path rather
      // than in a test's copy of it. `assertMaterialsConserved` is a checker
      // that had never failed on real input, and this campaign has now shipped
      // five checkers that answered confidently about the wrong thing. A
      // control that re-implements the loop can agree with itself while both
      // have drifted; this one makes the **real** tick lose material, so the
      // assertion is exercised exactly where it runs in production.
      //
      // Absent on every ordinary run, which is every run that does not ask for
      // it by name.
      const leaked = zeroAmounts();
      for (const kind of MATERIAL_KINDS) leaked[kind] = closing[kind];
      if (deps.leak !== undefined) {
        const kind = deps.leak.kind;
        // Taken out of the closing stock and recorded **nowhere**, which is
        // precisely the defect shape: a flow that changes a stock without
        // telling the ledger. `delta` falls by `stolen` while `faucet - sink`
        // does not move, so the breach is exactly `-stolen`.
        leaked[kind] -= Math.min(Math.max(0, deps.leak.perTick), leaked[kind]);
      }

      const ledger = { opening, closing: leaked, faucet, sink };
      assertMaterialsConserved(ledger, worldTick);

      // The **leaked** figure is written, not the clean one, so an injected leak
      // is a real loss of material rather than a cosmetic one the assertion
      // notices and the world does not. Identical to `closing` on every run that
      // asks for no leak.
      writeMaterialStock(state, universe, leaked);

      // The shortfall, apportioned per library and settled in ascending handle
      // order — `applyLibraryUpkeep`'s documented order, and the reason it is
      // handed the stock rather than the total. The universe's stock is already
      // spent by `consumeMaterials` above; what this second call decides is
      // *which* library went short, which is a question about a shared stock
      // that the four-claimant order cannot answer on its own.
      const degraded = degradeUnkeptLibraries(capital, consumption.spent.libraryUpkeep, {
        gateway: gatewayFor(),
        worldTick,
      });

      onReport?.({
        worldTick,
        materialsProduced: totalAmount(produced),
        materialsRemaining: totalAmount(closing),
        producedByKind: produced,
        remainingByKind: closing,
        shortKinds: consumption.shortKinds,
        economicNodes: economy.contributingNodes,
        vitalityContributions: vitality.contributingNodes,
        buildRateSources: economy.buildRate.length,
        buildRateMagnitudes: economy.buildRate,
        buildProgressAdded: construction.progressAdded,
        universitiesCompleted: construction.completed,
        universitiesStanding: componentOf(state, UNIVERSITY).size,
        constructionStoneOwed: construction.stoneOwed,
        constructionStonePaid: consumption.spent.construction,
        constructionLaborPaid: consumption.spent.constructionLabor,
        teachingInsightPaid: consumption.spent.teaching,
        teachingFundedShare: work.teachingShare,
        spilledByKind: bounded.spilled,
        faucetByKind: faucet,
        sinkByKind: sink,
        // Empty on every correct tick. Recomputed rather than carried out of the
        // assertion above so that the reported series and the thrown error can
        // never disagree about the same tick.
        conservationBreaches: conservationBreaches(ledger),
        carryingCapacity: capacity,
        mageDeaths: mortality.deaths,
        magesPromoted: promoted,
        births,
        populaceDeaths: populace.mortality.deaths,
        populaceRetired: populace.retired,
        subsistenceShortfallShare,
        population: populace.population,
        livingMages: countLivingMages(state),
        nodesLost: mortality.nodesLost + decayed.length + degraded.nodesLost,
        goalSwitches: autonomy.histogram.goalSwitches,
        monthsByGoal: work.monthsByGoal,
        researchCompleted: work.researchCompleted,
        lessonsTaught: work.lessonsTaught,
        grimoiresScribed: work.grimoiresScribed,
        materialsScribed,
        staffAssigned: staffing.assigned.length,
        staffPruned: staffing.pruned,
        universitiesUnstaffed: staffing.unstaffed,
        materialsApplied: totalAmount(work.applied),
        appliedByKind: work.applied,
        magesApplying: work.applyingMages,
        applicationRations: applicationRationsOwed,
        effortsInFlight: efforts.size,
        libraryUpkeepOwed: upkeepOwed,
        libraryUpkeepPaid: consumption.spent.libraryUpkeep,
        libraryInstancesDegraded: degraded.instances,
        // One depth ceiling for the reported contribution, and the per-tier
        // array beside it so the others are recoverable. `emitCapital` says why:
        // *"a universe with several species has several answers; the emission
        // reports one and the per-tier array carries enough to recompute the
        // others."* `TIER_COUNT` is that one — the deepest ceiling any species
        // can hold — so the reported figure is the loop's ceiling rather than an
        // average over a population the metric does not know about.
        capital: capital.emissions(CAPITAL_REPORT_CEILING, rateClamps.total()),
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
function produceMaterials(
  cohorts: CohortStore,
  deps: WorldStepDeps,
  economy: UniverseEconomyBonuses,
  onSites: ReadonlyMap<EntityHandle, number>,
): MaterialAmounts {
  const produced = zeroAmounts();
  cohorts.forEach((handle, key, count) => {
    if (key.occupation !== OCCUPATION.laborer) return;
    const species = deps.speciesOf(key.speciesId);
    if (species === undefined) return;
    // Labour is exclusive. A laborer on a building site is not also in a field
    // this month, and letting her be both would make founding a university free
    // — which is the shape of bug that reads as a balance problem for a year.
    const inFields = Math.max(0, count - (onSites.get(handle) ?? 0));
    if (inFields === 0) return;
    const share = materialsProduced({
      laborerCount: inFields,
      laborAffinity: species.laborAffinity,
      shares: deps.yieldShares,
      resourceYield: deps.primitives.resourceYield,
      resourceYieldBonuses: economy.resourceYield,
      ...(deps.ablation === undefined ? {} : { ablation: deps.ablation }),
    });
    for (const kind of MATERIAL_KINDS) produced[kind] += share[kind];
  });
  return produced;
}

/**
 * Which laborers stand on a building site this tick, and how many.
 *
 * ## Why the plan is made before production rather than after
 *
 * Production runs in phase 1 and construction in phase 8a, and labour is
 * exclusive between them, so the split has to be decided before either spends
 * it. Deciding it here — from the construction backlog and the laborer
 * headcount, both of which are settled at the top of the tick — is what lets
 * phase 1 subtract and phase 8a add without either reading the other's result.
 *
 * ## Ascending cohort handle, and no average anywhere
 *
 * Sites are filled from the laborer cohorts in **ascending handle order**,
 * which is a total order over stable identities rather than over whatever
 * sequence a scan happened to produce. Each cohort then builds at its **own**
 * `laborAffinity`: `materials.ts` rejects averaging across cohorts by name —
 * *"an average would let one high-affinity cohort raise the output of every
 * other"* — and building is the same question wearing different clothes. A
 * universe whose orcs do the building really does build faster than one whose
 * elves do.
 *
 * ## The crew carries its own affinity, and a stale handle is why
 *
 * The plan is made in phase 1 and spent in phase 8a, and the **populace phase
 * runs in between**: cohorts lose members, empty ones are destroyed, and their
 * slots go back on the free list. A plan that stored only handles and looked the
 * species up later therefore read a handle whose generation had moved, and the
 * entity store refused it — `StaleHandleError` inside `CohortStore.keyOf`, on
 * the archivist strategy, five runs out of thirty-two in the ascension sweep,
 * every one of them at tick zero of its own accounting.
 *
 * That is a good failure and a lucky one: the store's generation check turned a
 * would-be silent misattribution — one species' laborers building at another
 * species' affinity — into a loud refusal. The fix is to resolve everything the
 * construction phase needs **while the handles are still valid**, so the crew
 * that leaves phase 1 is a list of person-months and affinities and holds no
 * reference to a cohort at all.
 *
 * @returns `onSites` for the production phase, which runs immediately and may
 * still key on handles, and `crew` for the construction phase, which may not.
 */
function planConstructionLabour(
  state: SimState,
  cohorts: CohortStore,
  stone: Fixed,
  deps: WorldStepDeps,
): {
  readonly onSites: ReadonlyMap<EntityHandle, number>;
  readonly crew: readonly { readonly affinity: Fixed; months: number }[];
  readonly total: number;
} {
  const backlog = constructionBacklog(state);
  const onSites = new Map<EntityHandle, number>();
  const crew: { readonly affinity: Fixed; months: number }[] = [];
  if (backlog <= 0) return { onSites, crew, total: 0 };

  // Rounded **up**, and this is not a rounding preference. Flooring here is a
  // Zeno stall with a work crew: `LABORERS_PER_BUILD_UNIT` is forty laborers per
  // whole university, so a site with 22 `fp` of work left asks for
  // `floor(22 × 40 / 1024)` = **zero** people and stops forever, two per cent
  // short, with materials in the barn and laborers idle. Measured: the probe in
  // `tools/w29` froze every site at 1002 of 1024 and reported no completions in
  // 200 ticks. Rounding up means any backlog at all summons at least one person,
  // which is both the arithmetic fix and the sentence a reader would expect.
  // Integer ceil-div, not `Math.ceil(a / b)`. Division by 1024 is exact in a
  // double and that is not the point: `CLAUDE.md` forbids floating-point
  // arithmetic in the rules path categorically, because the constraint is only
  // worth anything if nobody has to audit which divisions happen to be safe.
  //
  // And bounded by what the stone can pay for, which is the difference between
  // a famine somebody chose and a waste nobody did. Labour is exclusive: a
  // laborer on a site is not in a field. Sizing the crew from the backlog alone
  // would send the whole workforce to stand at sites there is no stone to build,
  // producing neither buildings nor food — the one arrangement with nothing to
  // recommend it. `advanceConstruction` already computes exactly this bound for
  // itself (`affordableMonths`); applying it before anyone leaves the field is
  // the same rule asked one step earlier, where it can still change an answer.
  //
  // What this deliberately does **not** do is cap the share of the workforce a
  // god may divert. Measured with `tools/w29/over-founding.mjs`: founding a
  // hundred sites at once takes food production to exactly **zero** for as long
  // as they are building, and finishes eighty-four of them in a hundred and
  // fifty months. That is a real decision with a real cost, and inventing a cap
  // would be this file deciding how much rope a player gets. It is raised as an
  // author question instead.
  let wanted = Math.min(
    floorDiv(backlog * LABORERS_PER_BUILD_UNIT + FP_UNIT - 1, FP_UNIT),
    floorDiv(Math.max(0, stone), MATERIALS_PER_LABOR_MONTH),
  );
  if (wanted <= 0) return { onSites, crew, total: 0 };

  let total = 0;
  const laborers: { handle: EntityHandle; count: number; affinity: Fixed }[] = [];
  cohorts.forEach((handle, key, count) => {
    if (key.occupation !== OCCUPATION.laborer || count <= 0) return;
    const species = deps.speciesOf(key.speciesId);
    if (species === undefined) return;
    laborers.push({ handle, count, affinity: species.laborAffinity });
  });
  // Ascending handle: a total order over stable identities, rather than over
  // whatever sequence a scan happened to produce.
  laborers.sort((a, b) => a.handle - b.handle);

  for (const cohort of laborers) {
    if (wanted <= 0) break;
    const taken = Math.min(cohort.count, wanted);
    onSites.set(cohort.handle, taken);
    crew.push({ affinity: cohort.affinity, months: taken });
    wanted -= taken;
    total += taken;
  }
  return { onSites, crew, total };
}

/** What one tick of building did, across every unfinished site. */
interface ConstructionPhase {
  /** `buildProgress` added this tick, `fp`. */
  readonly progressAdded: Fixed;
  /** Sites finished by this labour. Excludes any the god funded to completion. */
  readonly completed: number;
  /** Stone the work cost, `fp`. Settled by `consumeMaterials`, not deducted here. */
  readonly stoneOwed: Fixed;
  /** Person-months that went unspent for want of stone. */
  readonly labourStalled: number;
  /**
   * `labor` the hired months actually cost, `fp`.
   *
   * Charged for months a site **used**, never for months it was offered: the
   * months a site buys are attributed to its crew first and only the excess to
   * the stock. `construction.ts` records what the other attribution costs — a
   * site one month from done, handed ten thousand person-months, *"deducted
   * forty thousand materials for two `fp` of building"* while no counter moved.
   */
  readonly laborOwed: Fixed;
}

interface ConstructionInputs {
  readonly stone: Fixed;
  /** The `labor` stock available to hire extra person-months from, `fp`. */
  readonly labor: Fixed;
  readonly deps: WorldStepDeps;
  /**
   * Person-months and the affinity they work at, resolved in phase 1.
   *
   * Deliberately not cohort handles. See {@link planConstructionLabour}: the
   * populace phase runs between the plan and this, so a handle held across it
   * may name a destroyed cohort.
   */
  readonly crew: readonly { readonly affinity: Fixed; months: number }[];
  readonly buildRateBonuses: readonly Fixed[];
  readonly counters: ClampCounters;
}

/**
 * Advances every unfinished university by one tick of laborer time.
 *
 * Sites are walked in **ascending university handle** and cohorts in ascending
 * cohort handle, for the reason `applyLibraryUpkeep` walks libraries that way:
 * which site goes short is a question about a shared stock, and answering it in
 * whatever order a scan produced would make the answer depend on the history
 * that reached the state rather than on the state.
 *
 * The stone budget is spent down as it is committed, so the *first* site is the
 * one that gets built when there is not enough for all of them. That is a
 * decision and not an accident: spreading a shortage evenly would leave every
 * site permanently unfinished, which is the failure mode
 * `universities-are-founded-and-never-finished` already recorded from the other
 * direction.
 */
function advanceUniversities(state: SimState, input: ConstructionInputs): ConstructionPhase {
  let progressAdded = 0;
  let completed = 0;
  let stoneOwed = 0;
  let labourStalled = 0;
  let laborOwed = 0;
  let budget = Math.max(0, input.stone);
  let laborBudget = Math.max(0, input.labor);

  // A working copy: the phase spends `months` down, and the plan it was handed
  // belongs to the caller.
  const assignments = input.crew.map((entry) => ({ affinity: entry.affinity, months: entry.months }));
  if (assignments.length === 0) {
    return { progressAdded: 0, completed: 0, stoneOwed: 0, labourStalled: 0, laborOwed: 0 };
  }

  const sites = [...collectRecords(state, UNIVERSITY)]
    .filter(({ row }) => row.buildProgress < FP_UNIT)
    .sort((a, b) => a.handle - b.handle);

  const store = componentOf(state, UNIVERSITY);
  for (const site of sites) {
    for (const assignment of assignments) {
      if (assignment.months <= 0) continue;
      // Hired months, capped at the crew's own: `labor` accelerates a workforce
      // and does not replace one, so a site with nobody on it hires nobody
      // however deep the stock. That cap is what makes the claim exactly zero
      // whenever there is no construction happening, which is the property a
      // new claimant needs if it is not to record a shortfall every tick on
      // every world that has never held any of the kind.
      const hired = hireableMonths(assignment.months, laborBudget, input.deps.hiredLabour);
      const outcome = advanceConstruction(site.row, {
        laborMonths: assignment.months + hired,
        laborAffinity: assignment.affinity,
        materials: budget,
        buildRate: input.deps.primitives.buildRate,
        buildRateBonuses: input.buildRateBonuses,
        counters: input.counters,
        ...(input.deps.ablation === undefined ? {} : { ablation: input.deps.ablation }),
      });
      progressAdded += outcome.progressAdded;
      stoneOwed += outcome.materialsSpent;
      budget -= outcome.materialsSpent;
      // The months the site actually bought, read off what it paid for them —
      // the one figure `advanceConstruction` guarantees is the work that
      // happened.
      const usedMonths = floorDiv(outcome.materialsSpent, MATERIALS_PER_LABOR_MONTH);
      const crewUsed = Math.min(usedMonths, assignment.months);
      const hiredUsed = Math.max(0, usedMonths - crewUsed);
      const hiredCost = hiredUsed * Math.max(0, input.deps.hiredLabour.laborPerMonth);
      laborOwed += hiredCost;
      laborBudget -= hiredCost;
      // The crew's own leftover, not the offered leftover. A hired month that
      // went unused was never bought, so it is not a laborer standing idle and
      // must not be handed to the next site as one.
      const crewLeft = assignment.months - crewUsed;
      // Person-months the site could not use are returned to the pool for the
      // next site rather than burned, which is what makes a surplus of laborers
      // finish two universities in a tick instead of one and a half.
      assignment.months = crewLeft;
      // Stalled means *for want of stone*, and the counter has one reader who
      // treats it as "produce more materials". Bounded by the crew's own idle
      // months so that unbought hires cannot inflate it.
      labourStalled += Math.min(outcome.labourStalled, crewLeft);
      if (outcome.completed) {
        completed += 1;
        break;
      }
    }
    store.set(site.handle, 'buildProgress', site.row.buildProgress);
  }

  return { progressAdded, completed, stoneOwed, labourStalled, laborOwed };
}

/** The universe's seven spendable stocks, or zeros if no row has been written yet. */
function readMaterialStock(state: SimState, universe: EntityHandle): MaterialAmounts {
  const store = componentOf(state, MATERIAL_STOCK);
  const stock = zeroAmounts();
  if (!store.has(universe)) return stock;
  for (const kind of MATERIAL_KINDS) stock[kind] = store.get(universe, kind);
  return stock;
}

/**
 * Writes the seven stocks back, creating the row on first use.
 *
 * Lazy creation rather than a row seeded at world build, for the reason
 * `god-state` is lazy: a universe that has never been stepped has no economy to
 * record, and a row of zeros is indistinguishable from a universe that spent
 * everything.
 *
 * ## All seven now, and the reason the previous three-field version was right
 * ## at the time
 *
 * Its comment read: *"the four kinds `material-economy` added are written at
 * zero on creation and **not written again below**… a row written whole every
 * tick would silently zero them the moment something else did."* That was the
 * correct shape for a tree in which the four stocks existed and nothing
 * produced or spent them. This tick now does both — `work.applied` fills them
 * through `routeYieldByForm`, and the god's material costs and the teaching
 * subsidy drain them — so the closing figure this function is handed **is** the
 * whole seven-kind stock, and writing three of them would be the mirror-image
 * defect: a stock produced this tick and dropped on the way back to the row.
 *
 * The god's intervention system runs **before** the world system in the same
 * step (`installWorldLoop`'s schema order), so a material cost it deducted is
 * already in the row `readMaterialStock` opened the tick with. Sequential, not
 * concurrent: there is still exactly one writer per phase.
 */
function writeMaterialStock(
  state: SimState,
  universe: EntityHandle,
  stock: MaterialAmounts,
): void {
  const store = componentOf(state, MATERIAL_STOCK);
  if (!store.has(universe)) {
    attachRecord(state, MATERIAL_STOCK, universe, { ...stock });
    return;
  }
  for (const kind of MATERIAL_KINDS) store.set(universe, kind, stock[kind]);
}

interface MortalityPhase {
  readonly rng: StepRng;
  readonly worldTick: number;
  readonly gateway: CoordinatingKnowledgeGateway;
  readonly efforts: EffortLedger;
  readonly deps: WorldStepDeps;
  /**
   * This tick's `lifespan` contributions from knowledge, gathered once at the
   * top of the step under the tick's ruleset.
   *
   * Passed rather than re-read, so that a hazard roll cannot be taken against a
   * different reading from the one the rest of the tick saw — `vitalityBonuses`
   * memoizes on the state and would agree, but a value that is *handed over*
   * cannot disagree, and a mage's death is the worst place to discover that it
   * could.
   */
  readonly vitality: VitalityBonuses;
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
    const months = lifespanMonths(state, handle, row, species, phase.deps, phase.vitality);
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
  /**
   * What the mages who cast at the world this month made, by kind, `fp`.
   *
   * Returned rather than added to the stock inside the walk, and the difference
   * is a determinism one. Scribing spends out of `stock.vellum` *during* this
   * phase, so a mage who added vellum mid-walk would change what every scribe
   * visited after her could afford — a real behaviour, keyed on slot order, that
   * nobody chose. The basket is banked and settled once the phase is over.
   */
  readonly applied: MaterialAmounts;
  /**
   * Vellum the tick's magical work owes, and what it could be granted, `fp`.
   *
   * Both are returned rather than settled inside the walk, for the reason
   * {@link WorkPhaseOutcome.applied} gives: a claim taken mid-walk would change
   * what every mage visited afterwards could afford, keyed on slot order.
   */
  readonly castingOwed: Fixed;
  readonly castingGranted: Fixed;
  /**
   * `insight` the tick's teaching actually spent, `fp`.
   *
   * Reserved before the walk and charged after it — the share is settled from
   * the *committed* teaching months so that no teacher's rate depends on slot
   * order, and the spend is measured from the lessons that actually paired, so
   * a teacher with no student costs nothing. The first is never smaller than
   * the second, which is what makes the claim payable in phase 9 by
   * construction.
   */
  readonly insightSpent: Fixed;
  /**
   * The fraction of this tick's teaching the `insight` stock funded, `fp`.
   *
   * Reported, because `FP_ONE` and `0` produce the same lesson count and very
   * different rates, and *"the economy did not move"* and *"nothing reached
   * it"* look identical in every other series.
   */
  readonly teachingShare: Fixed;
  /** Mages who spent the month applying magic. What the rations are owed for. */
  readonly applyingMages: number;
  /** Mage-months spent under each goal, indexed by goal id. */
  readonly monthsByGoal: readonly number[];
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
  capital: LibraryCapital,
  rateClamps: ClampCounters,
  academic: AcademicRateBonuses,
  vellumOnHand: Fixed,
  insightOnHand: Fixed,
): WorkPhaseOutcome {
  // The `alive` column and the handle, rather than a `MageRecord` per mage: the
  // two fields below are all this phase reads, and `collectRecords` builds an
  // object carrying every field of §1.2 to supply one of them. Same component,
  // same ascending slot order — `collectRecords` gets its order from this very
  // `forEach` — and this phase adds and removes no mage, so the walk cannot be
  // disturbed by what it does.
  const mages = componentOf(state, MAGE);
  const alive = mages.field('alive');
  const applied = zeroAmounts();
  let applyingMages = 0;
  // One counter per goal, filled on the walk this phase already makes. The
  // commitment is read here for every living mage regardless, so the tally is
  // an increment and no second pass — see `WorldStepReport.monthsByGoal` for
  // why the number has to exist at all.
  const monthsByGoal = new Array<number>(GOAL_COUNT).fill(0);
  // Months of teaching that **actually happened**, which is not the same as
  // months committed to it: a teacher whose student the gateway could not pair
  // her with this tick contributes nothing, and charging her insight would bill
  // for a lesson nobody attended. The reserve above is taken against the
  // committed figure and is therefore never smaller than what is spent here.
  let taughtMonths = 0;

  // `monthsByGoal` above is filled *during* the walk; the pre-pass below has to
  // finish *before* it, so the two cannot be folded into one traversal however
  // similar they look. The affordable share is an input to the first mage's
  // month, and a tally taken on the way past cannot be.

  // ---- The `casting` claim, decided before a single month is spent. ----
  //
  // `substrate.md` §6: magical work costs materials, or it is free and the
  // whole economy is priced as though the academy were weightless. The claim is
  // on the **act** — mage-months of research actually spent — and never on the
  // standing effects a universe holds, which would be an upkeep on knowledge
  // and would make forgetting a node a saving.
  //
  // **A pre-pass, and that is not an optimisation.** The affordable share has
  // to be known before any mage is granted her month, or the grant depends on
  // slot order: the researchers the walk happened to reach first would be paid
  // in full and the rest would starve, which is exactly the order-keyed
  // outcome `contracts.md` §6 spends real effort preventing. Counting first and
  // scaling everyone by one fraction is order-independent by construction.
  let researchMonths = 0;
  // ---- The `teaching` claim, decided in the same pre-pass and for the same
  // ---- reason.
  //
  // `insight` is what a faculty teaches out of, and `material-economy`'s sink
  // for it is university teaching throughput. The share has to be settled
  // before any lesson is given, exactly as the casting share does: a budget
  // spent down the roster would fund whichever teachers the walk reached first
  // and leave the rest at the base rate, which is the order-keyed outcome
  // `contracts.md` §6 spends real effort preventing.
  //
  // **Both halves of a lesson are counted.** §2.3 prices a lesson as the pair's
  // cost and has each of the two push her own half at her own rate, so a month
  // at the lectern and a month at the desk are each a month of teaching
  // throughput and each draws insight. Crediting only the teacher would make a
  // lesson cost half as much when the student happened to be committed too.
  let teachingMonths = 0;
  mages.forEach((row, handle) => {
    if ((alive[row] as number) === 0) return;
    const commitment = readCommitment(state, handle);
    if (commitment === undefined) return;
    if (commitment.goalId === GOAL.researchNode || commitment.goalId === GOAL.rediscoverNode) {
      researchMonths += MAGE_MONTHS_PER_TICK;
    }
    if (commitment.goalId === GOAL.teach || commitment.goalId === GOAL.seekTeaching) {
      teachingMonths += MAGE_MONTHS_PER_TICK;
    }
  });
  // The share the stock can fund, and the `teach-rate` magnitude it buys. The
  // magnitude is the same for every teacher this tick, and it joins the array
  // `workOne` already builds from the god's blessing and the mage's own
  // knowledge — **one array, one `stackMagnitudes`, one `fp(4096)` cap**. That
  // is `material-economy` precondition 0.4's condition, not a stylistic
  // preference: routed as its own multiplier, or into `research-rate`, insight
  // would be a third lever on an outcome `encourage-research` already moves.
  const teachingShare = fundedTeachingShare(teachingMonths, Math.max(0, insightOnHand), deps.teaching);
  const teachingSubsidy = insightTeachingBonus(teachingShare, deps.teaching);
  const castingOwed = castingDemand(researchMonths, deps.casting);
  // What is left for casting after the claimants ahead of it in
  // `CONSUMPTION_ORDER` that share its kind. Casting is the *first* vellum
  // claimant, so nothing shares the stock ahead of it — subsistence is food —
  // and the whole shelf is available. Written as a subtraction anyway so that
  // inserting a vellum claimant before casting is a one-line change here rather
  // than a silent over-draw.
  const castingAvailable = Math.max(vellumOnHand, 0);
  const grantedMonths = affordableMageMonths(researchMonths, castingAvailable, deps.casting);
  const castingGranted = castingDemand(grantedMonths, deps.casting);
  // The fraction every researcher's month is scaled by. `FP_ONE` when the
  // archive can carry the work, less when it cannot, and the same number for
  // everybody.
  const castingShare =
    researchMonths <= 0 ? FP_ONE : floorDiv(grantedMonths * FP_ONE, researchMonths);

  mages.forEach((row, handle) => {
    if ((alive[row] as number) === 0) return;
    const commitment = readCommitment(state, handle);
    if (commitment === undefined) return;
    // Before `workOne`, and unconditionally: a goal with no arm returns from it
    // without touching anything, and a tally taken on the way out would count
    // exactly the goals that are working and miss exactly the ones that are not.
    monthsByGoal[commitment.goalId] = (monthsByGoal[commitment.goalId] ?? 0) + 1;
    const cast = workOne(
      state,
      handle,
      commitment,
      gateway,
      deps,
      worldTick,
      capital,
      rateClamps,
      academic,
      castingShare,
      teachingSubsidy,
      () => {
        taughtMonths += MAGE_MONTHS_PER_TICK;
      },
    );
    if (cast === undefined) return;
    applyingMages += 1;
    for (const kind of MATERIAL_KINDS) applied[kind] += cast[kind];
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
  return {
    castingOwed,
    castingGranted,
    // What the lessons that happened cost, at the share they were funded at.
    // `mul` before the price rather than after, so a partly funded faculty is
    // charged for exactly the acceleration it was given.
    insightSpent: teachingInsightDemand(mul(taughtMonths, teachingShare), deps.teaching),
    teachingShare,
    completedBy,
    researchCompleted,
    lessonsTaught,
    grimoiresScribed,
    applied,
    applyingMages,
    monthsByGoal,
  };
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
 *
 * `apply-magic` is the one arm that does not accrue anything, and that is what
 * makes it a different kind of goal rather than a fifth kind of project. There
 * is no `EFFORT_PROGRESS` row and no completion: a month of casting delivers a
 * month of materials and the world has them. She is never *finished* applying
 * magic, which is why `select.ts` never sees her commitment complete and the
 * ordinary evaluation schedule is the only thing that moves her off it.
 *
 * @returns The materials one applying mage made, or `undefined` for every other
 * goal. `undefined` rather than a zero basket, because the caller counts the
 * mages who applied and a mage who cast a node into a form that routes nowhere
 * would otherwise be indistinguishable from one who researched.
 */
function workOne(
  state: SimState,
  mage: Handle,
  commitment: MageGoalCommitment,
  gateway: CoordinatingKnowledgeGateway,
  deps: WorldStepDeps,
  worldTick: number,
  capital: LibraryCapital,
  rateClamps: ClampCounters,
  academic: AcademicRateBonuses,
  castingShare: Fixed,
  /**
   * The `teach-rate` magnitude this tick's `insight` funding buys, `fp`.
   *
   * Appended to the same array the god's blessing and the mage's own knowledge
   * go into, at both ends of a lesson, so it is capped once with them. See the
   * pre-pass in {@link spendTheMonth}, and `material-economy` precondition 0.4.
   */
  teachingSubsidy: Fixed,
  /** Called once for each half of a lesson that actually paired and pushed. */
  noteTaughtMonth: () => void,
): MaterialAmounts | undefined {
  const nodeId = commitment.targetNodeId;
  if (nodeId === 0) return undefined;

  // Vision §6a, arriving as arithmetic: *"a university's output scales with the
  // depth of its library."* The mage's own shelves and her own species ceiling —
  // brake 2, *"a draconic-deep library accelerates nothing for orcs"* — and
  // `undefined` for a mage who works alone, which is most of a young universe.
  const store = componentOf(state, MAGE);
  const row = store.has(mage as EntityHandle)
    ? {
        universityId: store.get(mage as EntityHandle, 'universityId'),
        species: deps.speciesOf(store.get(mage as EntityHandle, 'speciesId')),
      }
    : undefined;
  const shelves = row === undefined ? undefined : capital.depthFor(row.universityId);
  const ceiling = row?.species?.depthCeiling ?? 0;

  /**
   * The stacked, capped multiplier for one primitive on this mage this month.
   *
   * The god's magnitudes, **the mage's own castable knowledge**, and the
   * library's contribution go into one array and through `stackMagnitudes`
   * once, so `contracts.md` §3's `(1 + Σ)` rule and its `fp(4096)` cap apply to
   * their sum. That is the whole of the bound on the §6a loop, and it is a
   * contract already committed rather than a second cap invented for the
   * occasion.
   *
   * The mask reaches `stackMagnitudes` through the same call, which is the only
   * place §9 permits it to be applied. Before `academic-effects.ts` there was
   * nothing here for a mask naming one of these three rates to neutralize, so
   * the omission cost nothing; it would cost a false negative now.
   */
  const rate = (primitive: PrimitiveRecord, bonuses: readonly Fixed[]): Fixed =>
    libraryRateMultiplier(primitive, bonuses, shelves, ceiling, rateClamps, deps.ablation)
      .multiplier;

  /**
   * The god's magnitudes and the mage's own, in one array for one accumulator.
   *
   * Concatenated rather than stacked: combining two sources of one primitive is
   * `stackMagnitudes`' job and `BAN_INLINE_PRIMITIVE_STACKING` says so. An
   * empty result is an unblessed mage who knows nothing relevant, which is most
   * of a young universe, and `rate` then returns the identity.
   */
  const withKnown = (
    godBonuses: readonly Fixed[],
    known: readonly Fixed[],
  ): readonly Fixed[] => {
    if (known.length === 0) return godBonuses;
    if (godBonuses.length === 0) return known;
    return [...godBonuses, ...known];
  };

  /**
   * The `insight` subsidy, appended to the array rather than applied to its
   * result.
   *
   * The whole of `material-economy` precondition 0.4 is in the word *appended*.
   * `academic-effects.ts` records the rule this follows —
   * *"the magnitudes it returns join the god's in **one array**, through
   * **one** `stackMagnitudes`, under **one** `fp(4096)` cap"* — quoting
   * `mages-and-species/design.md`: *"two caps on the same quantity is how a
   * rate ends up at 4.0 × 2.0 without anyone deciding it should be 8.0."*
   * A universe that has saturated `teach-rate` from its god and its scholars
   * gets nothing more from a deep insight stock, which is the correct answer
   * and the one a separate multiplier would have got wrong.
   */
  const withInsight = (bonuses: readonly Fixed[], subsidy: Fixed): readonly Fixed[] => {
    if (subsidy <= 0) return bonuses;
    return [...bonuses, subsidy];
  };

  switch (commitment.goalId) {
    case GOAL.researchNode:
    case GOAL.rediscoverNode:
      // One accrual for both, because they are one operation: `rules-magic`'s
      // `research` decides for itself whether a node is a rediscovery, from the
      // ever-known record, and a second code path here could disagree with it.
      //
      // The month is a month and the *rate* travels separately, because
      // `research.ts` scales the requirement rather than the progress. Teaching
      // and scribing below have no such seam in `rules-magic` — their accruals
      // are compared against an authored cost directly — so there the rate
      // scales the months, which is what the god's own multiplier already did.
      gateway.contributeResearch(
        mage,
        nodeId,
        // Scaled by what the archive could supply. `FP_ONE` in the ordinary
        // case; less when the vellum ran thin, and the same fraction for every
        // researcher this tick. A month that cannot be paid for is a month that
        // does not accrue — the banked effort stays banked and the frontier
        // stalls until the economy can carry it, which is `casting.ts`'s
        // deliberately gentle shortfall rather than a voided project.
        mul(MAGE_MONTHS_PER_TICK, castingShare),
        rate(
          deps.primitives.researchRate,
          withKnown(
            deps.researchBonusesFor?.(state, worldTick, mage, nodeId) ?? NO_BONUSES,
            academic.researchRate(mage),
          ),
        ),
      );
      return undefined;
    case GOAL.teach: {
      const student = gateway.studentFor(mage, nodeId);
      if (student !== undefined) {
        // The *teacher's* rate, on the teacher's half of the pair. §2.3 prices a
        // lesson as the pair's cost and both push the same row, so a teacher at
        // a deep library advances it faster and a student at one advances her
        // own half faster — which is what "one project with two people pushing
        // it" means when the two do not study in the same place.
        noteTaughtMonth();
        gateway.contributeTeaching(
          mage,
          student,
          nodeId,
          mul(
            MAGE_MONTHS_PER_TICK,
            rate(
              deps.primitives.teachRate,
              withInsight(
                withKnown(
                  deps.teachBonusesFor?.(state, worldTick, mage) ?? NO_BONUSES,
                  academic.teachRate(mage),
                ),
                teachingSubsidy,
              ),
            ),
          ),
        );
      }
      return undefined;
    }
    case GOAL.seekTeaching: {
      const teacher = gateway.teacherFor(mage, nodeId);
      if (teacher !== undefined) {
        noteTaughtMonth();
        gateway.contributeTeaching(
          teacher,
          mage,
          nodeId,
          mul(
            MAGE_MONTHS_PER_TICK,
            rate(
              deps.primitives.teachRate,
              withInsight(
                withKnown(
                  deps.teachBonusesFor?.(state, worldTick, mage) ?? NO_BONUSES,
                  academic.teachRate(mage),
                ),
                teachingSubsidy,
              ),
            ),
          ),
        );
      }
      return undefined;
    }
    case GOAL.scribe:
      // The `universities` requirement names three rates and this is the third.
      // The ceiling gating it is the **author's**, not the reader's: the mage at
      // the desk is the one the library is helping, and she cannot copy out of a
      // book she could not read.
      //
      // No god hook here, and that is not an omission: no god action contributes
      // `scribe-rate`. This line passed a literal `NO_BONUSES` until W18, so the
      // primitive stacked to the identity every tick and neither node nor god
      // could move it — `content-set.ts` recorded that as a deliberate
      // non-registration, and it is now the mage's own knowledge that fills it.
      gateway.contributeScribing(
        mage,
        nodeId,
        mul(
          MAGE_MONTHS_PER_TICK,
          rate(deps.primitives.scribeRate, academic.scribeRate(mage)),
        ),
      );
      return undefined;
    case GOAL.applyMagic: {
      // Both gates re-asked **at work time**, exactly as `universe-effects.ts`
      // re-asks them per tick rather than trusting the moment of acquisition. A
      // month is long enough for a god to interdict a cell or for the node to
      // decay below the activation threshold, and a mage who lost the ability to
      // cast during the month spends nothing rather than harvesting from a spell
      // she can no longer perform. She is not moved off the goal here — the
      // feasibility mask does that at her next evaluation, which is where every
      // other goal's "the world changed underneath me" is handled too.
      const authored = deps.universeEffects?.appliedYieldOf(nodeId);
      if (authored === undefined) return undefined;
      if (!gateway.castableNodes(mage).includes(nodeId)) return undefined;
      // The library does **not** multiply this. §6a's loop is about the rates at
      // which a mage learns, teaches and copies — `libraryRateMultiplier` is
      // named for exactly those three — and a deep shelf making the harvest
      // larger would be a fourth reading of the capital term that no balance
      // assertion is written over. The only multiplier on applied work is the
      // node's own, which is what `resource-yield` means.
      return appliedYield({
        weights: deps.application,
        months: MAGE_MONTHS_PER_TICK,
        form: authored.form,
        resourceYield: deps.primitives.resourceYield,
        magnitudes: authored.magnitudes,
        counters: rateClamps,
        ...(deps.ablation === undefined ? {} : { ablation: deps.ablation }),
      });
    }
    default:
      return undefined;
  }
}

/** No source of a rate applies. Shared so the empty case allocates nothing. */
const NO_BONUSES: readonly Fixed[] = Object.freeze([]);

/**
 * The depth ceiling the per-tick capital emission is reported at.
 *
 * `TIER_COUNT` — the deepest any species reaches — so the reported contribution
 * is the loop's own ceiling. A population average would be a number about the
 * species mix rather than about the library, and `capitalSnowball` is a Gini
 * coefficient *over libraries*.
 */
const CAPITAL_REPORT_CEILING = 7;

/**
 * Settles which library went short of upkeep, and takes what it could not keep.
 *
 * Two things happen here that `consumeMaterials` cannot do on its own. It pays a
 * *total* down a priority order and knows nothing about who the total was for;
 * `applyLibraryUpkeep` apportions that total across libraries in ascending
 * handle order and says how many instances each one must give up. Splitting them
 * is what keeps the four-claimant order and the per-library order in one place
 * each.
 *
 * **Which instance is destroyed is the knowledge side's decision** —
 * `contracts.md` §5 rule 3 keeps `rules-world` out of `rules-magic`, and
 * `capital.ts` says so where it returns a count rather than a list of handles.
 * So this function asks the gateway, and the gateway takes them in ascending
 * instance handle, which is a total order over stable identities.
 */
function degradeUnkeptLibraries(
  capital: LibraryCapital,
  paid: Fixed,
  phase: { gateway: CoordinatingKnowledgeGateway; worldTick: number },
): { instances: number; nodesLost: number } {
  if (capital.libraries.length === 0) return { instances: 0, nodesLost: 0 };
  const { outcomes } = applyLibraryUpkeep(capital.libraries, paid);

  let instances = 0;
  let nodesLost = 0;
  for (const outcome of outcomes) {
    if (outcome.degradedInstances <= 0) continue;
    const lost = phase.gateway.degradeLibrary(
      outcome.library,
      outcome.degradedInstances,
      phase.worldTick,
    );
    instances += lost.destroyed;
    nodesLost += lost.nodesLost;
  }
  return { instances, nodesLost };
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
  /**
   * `fertility` magnitudes from castable, permitted knowledge, unstacked.
   *
   * Handed in rather than gathered here, because the gather is memoized on the
   * state and the same reading is the one the rest of the tick saw. Empty is
   * the ordinary case and the only case under v1 content.
   */
  readonly fertility: readonly Fixed[];
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
      fertilityBonuses: phase.fertility,
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
  vitality: VitalityBonuses,
): number {
  return effectiveLifespan({
    species,
    mage,
    birthTick: row.birthTick,
    rootSeed: state.rootSeed,
    lifespanPrimitive: deps.primitives.lifespan,
    // Two sources, **one list**, because `contracts.md` §3's cap bounds the
    // stack rather than each contributor: a god's blessing and a mage's own
    // extension magic share one `additive` fold and one
    // `fraction-of-species-base` ceiling. Capping them separately would be two
    // ceilings on one quantity, which is the arithmetic
    // `mages-and-species/design.md` rejects by name.
    //
    // `god-agency` issues the first — a blessing contributes to `lifespan` —
    // but only when a god was installed. The second is `knowledge-vitality.ts`:
    // `target: "self"` nodes the mage can cast, plus `target: "universe"` ones
    // anybody in the universe can. Both are empty in the ordinary case, and the
    // second is empty in every v1 universe, because no v1 node authors the
    // primitive.
    //
    // `vitalityBonuses` is memoized on the state object, so this is the same
    // reading the birth phase took and costs one `WeakMap` hit.
    effectMagnitudes: [
      ...(deps.lifespanEffectsFor?.(state, state.clock.worldTick, mage) ?? []),
      ...lifespanBonusesFor(vitality, mage),
    ],
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
 * Scribe-months a university produces this tick, **from its own staff**.
 *
 * ## What this used to be, and why it mattered more than it looked
 *
 * Until phase 2a existed this function summed the *universe's* whole scribe
 * population for every university it was asked about, and said so: *"Taking the
 * whole scribe population is the honest placeholder … it is wrong in the
 * direction of over-supply."* The direction was right and the magnitude was
 * not. Over-supply per university is over-supply *multiplied by the number of
 * universities*, so founding the second one doubled the universe's scribing for
 * the price of some stone, and founding the thousandth multiplied it by a
 * thousand. That is the arithmetic under `archivist` building roughly 1,300
 * universities and reaching the same node count as doing nothing: the strategy
 * was not wrong about universities being cheap, it was reading a number that
 * could not tell it they were worthless.
 *
 * It was also the second reason the `w78` teaching boundary showed nothing.
 * Two universities with different libraries and different professors still
 * scribed at exactly the same rate, because the one input that was supposed to
 * distinguish them was a universe-wide constant. There was no channel left for
 * them to diverge through.
 *
 * ## Now
 *
 * Only cohorts linked to *this* university through `UNIVERSITY_STAFF`, and only
 * ones the cohort store still recognises. A completed university that phase 2a
 * had no free cohort for produces nothing, which is a supported state with a
 * downstream consumer — `scribing.ts` says so, and the `mage-autonomy` mask
 * reads that zero to take `scribe` off the goal list of a mage affiliated only
 * with it. The zero was always reachable in principle; this is the first build
 * in which it is reachable in fact.
 */
function scribeThroughputFor(
  state: SimState,
  universityId: Handle,
  staffedBy: ReadonlyMap<EntityHandle, readonly EntityHandle[]>,
  cohorts: CohortStore,
  deps: WorldStepDeps,
): Fixed {
  if (universityId === 0) return 0;
  const store = componentOf(state, UNIVERSITY);
  if (!store.has(universityId as EntityHandle)) return 0;

  let scribes = 0;
  let affinity = 0;
  // Absent from the index means nobody on staff, which `staffingIndex`
  // documents and `scribingThroughput` already answers with a supported zero.
  for (const cohort of staffedBy.get(universityId as EntityHandle) ?? []) {
    const key = cohorts.keyOf(cohort);
    if (key.occupation !== OCCUPATION.scribe) continue;
    const species = deps.speciesOf(key.speciesId);
    if (species === undefined) continue;
    scribes += cohorts.countOf(cohort);
    // The best affinity present, not an average: an average would make one
    // clumsy cohort slow down a dwarven scriptorium.
    if (species.scribeAffinity > affinity) affinity = species.scribeAffinity;
  }
  if (scribes === 0) return 0;

  return scribingThroughput(readRecord(state, UNIVERSITY, universityId as EntityHandle), {
    scribeCount: scribes,
    scribeAffinity: affinity,
    scribeRate: deps.primitives.scribeRate,
    scribeRateBonuses: [],
  });
}
