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
import type { EntityHandle, SimState, StepContext, System, WorldSchema } from '@mm/sim-core';
import { RNG_STREAM, createState, rngFromRootSeed } from '@mm/sim-core';
import type { Scenario, ScenarioConfig } from '@mm/agent-api';
import {
  GRANT_BUDGET,
  LIBRARY,
  MATERIAL_STOCK,
  LOCATION_KIND,
  MAGE,
  OCCUPATION,
  POPULACE_COHORT,
  UNIVERSITY,
  attachRecord,
  createUniverse,
  defineWorldStateSchema,
  findUniverse,
} from '@mm/state';
import { KnowledgeSubsystem, MASTERY_MAX, MagicGrid } from '@mm/rules-magic';
import { readRaidTuning } from '@mm/rules-raid';
import { createMage } from '@mm/rules-world';
import type {
  AblationMask,
  GodConstants,
  GodTickReport,
  WorldStepReport,
} from '@mm/coordination';
import { defineWorldSimulation, resolveGodContent } from '@mm/coordination';

import type { RulesetAxes } from './content-set.js';
import {
  contentCatalogue,
  foundingCandidates,
  seededOpeningAxes,
  scribingTraditionId,
  shippedContent,
  speciesTable,
  standardOpeningAxes,
  traditionIdNamed,
  v1RulesetAxes,
  worldDeps,
} from './content-set.js';
import { withAxisPriceScale } from './axis-price.js';
import type { NormalizedSandbox, SandboxSpec } from './sandbox.js';
import {
  applyFoundingCheats,
  defineSandboxWorldSchema,
  normalizeSandbox,
  sandboxScenarioId,
  sandboxSystem,
} from './sandbox.js';
import { BalanceTelemetryRecorder, balanceTelemetrySystem } from './balance-telemetry.js';
import type { BalanceRunTelemetry } from './balance-telemetry.js';
import type { RaidRecord } from './raids.js';
import { raidSystem } from './raids.js';
import { portalTargetIds, readRivalConstants } from './rival-universe.js';

/** `fp(1.0)`, spelled out where a record reads as a game value. */
const FP_ONE = 1024;

/**
 * The starting stock of **each** material kind, `fp`.
 *
 * A working stock, not a lever on carrying capacity: `K` comes from the shipped
 * territory (`contracts.md` §2.7) and sits orders of magnitude above anything a
 * founding population reaches, so food only modulates it within the bound
 * `carrying-capacity.ts` states. It exists so that the first tick's subsistence,
 * the first book and the first course of stone are payable before the first
 * harvest is in.
 *
 * Split evenly across the three rather than weighted, and the reason is the same
 * one `splitMaterialsByKind` gives for its thirds: a founding endowment is not a
 * measurement of anything, so any weighting would be a claim about a starting
 * position nobody made. The total is unchanged from the single-stock scenario at
 * 3,000, which keeps the opening comparable across this change.
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
 * The opening square a universe takes when a sweep names none.
 *
 * Zero, meaning **the v1 rectangle** — `contracts.md` §2.2's twelve cells,
 * three techniques by four forms. It is not a magic number standing in for
 * `3` and `4`: it selects a different code path, `v1RulesetAxes`, which reads
 * the rectangle out of the content flags. The day content moves the rectangle,
 * the default moves with it, and no sweep file has to be edited.
 */
const DEFAULT_OPENING_AXIS_COUNT = 0;

/**
 * Who chooses the opening square when a sweep does not say.
 *
 * Zero: **the god chooses**. The owner's sentence is that the square "shouldn't
 * be hard-coded — that's for the player to decide", and a default of "the RNG
 * decides" would be the same abdication in a different direction. A seeded
 * square is still one flag away, and W82's arms take it.
 */
const DEFAULT_OPENING_SQUARE_SEEDED = 0;

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
   * Whether the founding faculty is handed portal magic outright. **An
   * instrument, not a magnitude** — the same kind of thing
   * {@link ReferenceOptions.foundingSpeciesMask} is, and declared for the same
   * reason: a question that cannot be asked without it.
   *
   * The question is this. Action 16 is gated on a living mage holding a node
   * that carries the `portal` primitive, and both such nodes sit at tier 4 and
   * 5 of a seven-node chain across `rego-limen` and `intellego-limen`. Measured
   * over a hundred runs per species on this build, how often a universe ever
   * reaches that gate tracks species curiosity — gnome (1792) 17 runs, human
   * (1152) 14, elf (896) 16, dwarf (512) 3, orc (384) 0, draconic (256) 0. A
   * trend and **not** strict monotonicity: elf outreaches human from lower
   * curiosity.
   *
   * The load-bearing half needs no ordering at all: **the two least curious
   * species never reach the gate, and they are exactly the two the alliance
   * mechanic exists to rescue.** So the gate is a curiosity gate in disguise,
   * and its asymmetry runs opposite to the design intent.
   *
   * That is a finding about where the portal nodes sit in the grid, and it is
   * reported rather than patched. But it also makes the mechanic unmeasurable
   * for draconic through the front door: an arm that never opens the gate
   * cannot distinguish "the verb does nothing" from "the verb never ran". This
   * flag separates those two, by putting a universe *downstream* of the gate and
   * asking only what the invitation is worth once it is legal.
   *
   * `1` seeds one instance of the shallowest portal-carrying node into a
   * founding mage's mind at full mastery — the same shape and mastery every
   * other founding grant uses. Zero, the default, changes nothing: a sweep file
   * that does not name this factor produces byte-identical runs to one written
   * before it existed.
   */
  readonly foundingPortalMagic: number;
  /**
   * Techniques the universe is founded holding, or `0` for the v1 rectangle.
   *
   * The **opening square** (`campaign-plan.md`, "The 2×2 opening"). Non-zero
   * means the square is drawn from the universe's own seed on
   * `RNG_STREAM.openingSquare` — see {@link seededOpeningAxes} — so that two
   * universes in one sweep begin on different content and have no queue in
   * common to walk.
   *
   * **Zero is today's universe, byte for byte**, which is what keeps the
   * committed baselines meaningful and what makes the 3×4 arm of a size sweep a
   * real control rather than a re-implementation of one. The precedent is
   * `foundingSpeciesMask`, whose zero means the same thing for the same reason.
   *
   * A count without {@link openingFormCount} is refused rather than defaulted:
   * a 2-technique × 14-form opening is a legitimate square but almost certainly
   * not what a sweep file that wrote one number meant, and a run that silently
   * measured it would be recorded as a 2×2.
   */
  readonly openingTechniqueCount: number;
  /** Forms the universe is founded holding, or `0` for the v1 rectangle. */
  readonly openingFormCount: number;
  /**
   * Who chooses the square: `0` the god, non-zero the universe's own seed.
   *
   * **Zero is the default because the choice is the player's.** A size names a
   * square through `standardOpeningAxes` — content order, no draw — so two
   * universes at one size open on the same content and a size sweep varies size
   * alone. That is the arm a differentiation measurement wants: the alternative
   * moves *which* square as well as how big it is, and the two effects cannot
   * then be separated at any sample size.
   *
   * Non-zero is W82's arm: `seededOpeningAxes` draws the square from
   * `RNG_STREAM.openingSquare`, so every seed in a sweep opens on different
   * content. That is what a *content-dimensionality* measurement wants and it
   * is why the path is kept rather than replaced.
   *
   * Read only when both counts are non-zero. With no counts there is no square
   * to choose and the universe takes the v1 rectangle either way.
   */
  readonly openingSquareSeeded: number;
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
  'foundingPortalMagic',
  'openingTechniqueCount',
  'openingFormCount',
  'openingSquareSeeded',
  'tradition',
  'grantBudgetStart',
  'grantAccrualNodes',
  'grantBudgetCap',
  'axisPriceScale',
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
 * The factor pricing `permit-technique` and `permit-form` (`contracts.md` §4.2
 * actions 1–4), in `fp` — `1024` is the shipped price, `8192` is eight times it.
 *
 * The **second** entry that is not a {@link ReferenceOptions} field, and for
 * exactly {@link TRADITION_FACTOR_ID}'s reason: the price is read out of the
 * content registry when `worldDeps` and `contentCatalogue` are built, which
 * happens once per worker before any tick-zero state exists. So it is resolved
 * where the tradition is resolved, and it is memoized the same way — see
 * `executor.ts`, whose content cache is keyed on **both**.
 *
 * `0` and `1024` are the shipped price and are byte-identical to the behaviour
 * before this factor existed. See `axis-price.ts` for why all four axis actions
 * move together and why the registry rather than the resolver is the place the
 * scale is applied.
 *
 * The same common-random-numbers warning {@link TRADITION_FACTOR_ID} carries
 * applies here and is sharper, because this factor's whole purpose is a
 * *within-universe* comparison: declaring several levels in one sweep file gives
 * each level its own cell index and therefore its own seeds, and a price
 * difference measured that way is confounded with a seed difference. One level
 * per file, sharing a `sweepId` and `rootSeed` — or an out-of-band harness that
 * walks the identical coordinate grid, which is what `tools/w158` does.
 */
export const AXIS_PRICE_FACTOR_ID = 'axisPriceScale';

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
    foundingSpeciesMask: readCount(config, 'foundingSpeciesMask', DEFAULT_FOUNDING_SPECIES_MASK),
    foundingPortalMagic: readCount(config, 'foundingPortalMagic', 0),
    openingTechniqueCount: readCount(config, 'openingTechniqueCount', DEFAULT_OPENING_AXIS_COUNT),
    openingFormCount: readCount(config, 'openingFormCount', DEFAULT_OPENING_AXIS_COUNT),
    openingSquareSeeded: readCount(config, 'openingSquareSeeded', DEFAULT_OPENING_SQUARE_SEEDED),
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
 *
 * @param axisPriceScale - {@link AXIS_PRICE_FACTOR_ID}'s level, in `fp`. Absent,
 * `0` and `1024` all mean the shipped price and return the registry unmodified
 * by identity, so a caller written before this parameter existed produces
 * byte-identical content. The scale is applied **before** anything is resolved
 * off the registry, so `deps.god.costs` and `catalogue.costs` — the resolver's
 * price and the mask's — cannot disagree about it.
 */
export function referenceContent(
  registry: ContentRegistry = shippedContent(),
  traditionName?: string,
  axisPriceScale = 0,
): ReferenceContent {
  const priced = withAxisPriceScale(registry, axisPriceScale);
  const traditionId =
    traditionName === undefined
      ? scribingTraditionId(priced)
      : traditionIdNamed(priced, traditionName);
  return {
    registry: priced,
    traditionId,
    axes: v1RulesetAxes(priced),
    foundingNodeIds: foundingCandidates(priced),
    catalogue: contentCatalogue(priced),
    deps: worldDeps(priced, traditionId),
    prestigeCap: resolveGodContent(priced).constants.prestigeCap,
  };
}

/**
 * The square this run opens on, and the founding grants it makes available.
 *
 * **One place decides what a universe starts holding**, and it decides it from
 * the axis masks alone — there is no second notion of "is this cell open" here
 * or anywhere else. `permits()` in `@mm/state` reads exactly these two numbers,
 * so a granted node, a legal cast, a research frontier and the agent's legality
 * mask all agree by construction rather than by three code paths staying in
 * step.
 *
 * **The god-chosen and seed-chosen openings are the same shape.** A size names
 * a square through `standardOpeningAxes`, which resolves it to content ids and
 * hands them to `explicitOpeningAxes` — the play verb, and now the default
 * path; `openingSquareSeeded` asks for W82's drawn square instead. Both arrive
 * here as a {@link RulesetAxes}, so the scenario layer expresses both without a
 * mode flag reaching the rules path.
 *
 * **Three sizes, three code paths, and the largest two agree by construction.**
 * No counts is `v1RulesetAxes`; the counts of the v1 rectangle itself is
 * `standardOpeningAxes` of the same size, and the two produce identical masks
 * because the standard order puts the rectangle's own axes first. That is
 * asserted in `test/unit/opening-square.test.ts`, which is what makes the
 * full-size arm of a sweep a control rather than a second implementation of
 * one.
 */
function resolveOpeningSquare(
  content: ReferenceContent,
  options: ReferenceOptions,
  rng: StepContext['rng'],
): { readonly axes: RulesetAxes; readonly foundingNodeIds: readonly ContentId[] } {
  const { openingTechniqueCount, openingFormCount } = options;
  if (openingTechniqueCount === 0 && openingFormCount === 0) {
    // The default path, and it must stay draw-free. Touching the opening-square
    // stream here would still not disturb any other subsystem — streams are
    // split — but it would make the *seeded* arms depend on how many draws the
    // control arm happened to take, and the arms would stop being nested.
    return { axes: content.axes, foundingNodeIds: content.foundingNodeIds };
  }
  if (openingTechniqueCount === 0 || openingFormCount === 0) {
    throw new Error(
      `An opening square was asked for with ${String(openingTechniqueCount)} techniques and ` +
        `${String(openingFormCount)} forms. Naming one axis and leaving the other at zero would ` +
        'silently open the whole of the unnamed axis — a 2 × 14 opening recorded as a 2 × 2. ' +
        'Give both counts, or neither for the v1 rectangle.',
    );
  }
  const size = { techniqueCount: openingTechniqueCount, formCount: openingFormCount };
  // The god's square draws nothing. That is the whole reason the default is
  // this branch and not the other one: a standard opening touches no RNG
  // stream, so it can never re-roll a subsystem and can never force the
  // re-baseline event `contracts.md` §6 records against stream additions.
  const axes =
    options.openingSquareSeeded === 0
      ? standardOpeningAxes(content.registry, size)
      : seededOpeningAxes(content.registry, size, rng.stream(RNG_STREAM.openingSquare));
  return { axes, foundingNodeIds: foundingCandidates(content.registry, axes) };
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

  const opening = resolveOpeningSquare(content, options, rng);

  const universe = createUniverse(state, {
    permittedTechniques: opening.axes.permittedTechniques,
    permittedForms: opening.axes.permittedForms,
    edictBudget: STARTING_EDICT_BUDGET,
    traditionId: content.traditionId,
    // Zero player input: favor, worship and prestige are `god-agency`'s to move,
    // and a scenario that pre-loaded them would be measuring a god's opening.
    favor: 0,
    worship: 0,
    worshipTier: 0,
    prestige: 0,
    prestigeEarned: 0,
    terminalReason: 0,
    favorCap: 0,
    ascended: 0,
  });

  // The three stocks, on their own component since revision 5. Written here
  // rather than left for the loop to materialize, because a founding endowment
  // is a starting position and a starting position should be visible in the
  // scenario that declares it, not inferred from the absence of a row.
  attachRecord(state, MATERIAL_STOCK, universe, {
    food: STARTING_MATERIALS,
    stone: STARTING_MATERIALS,
    vellum: STARTING_MATERIALS,
  });

  const library = state.entities.create();
  attachRecord(state, LIBRARY, library, { foundedTick: 0 });
  const university = state.entities.create();
  attachRecord(state, UNIVERSITY, university, {
    libraryId: library,
    capacity: ACADEMY_CAPACITY,
    // Complete at tick zero, and still the right call now that construction is
    // built. The sentence that used to be here — *the construction mechanic that
    // would finish it is not built* — was true when it was written and is not
    // any more: laborers raise buildings from the world loop as of W29. What
    // stands is the other half of the argument. An academy still under
    // construction would carry no students and no scriptorium, so a universe
    // founded on one would spend its first years unable to teach or write, and
    // every knowledge measurement in the reference run would be measuring the
    // opening delay instead of the mechanism.
    //
    // A universe therefore builds nothing at all unless the god funds a site.
    // That is not a gap: it is what gives `fundUniversity` a marginal value it
    // did not have when nothing could finish what it founded.
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

  // One list, used twice, and it has to be one list.
  //
  // The opening square supplies the founding nodes — `opening.foundingNodeIds`
  // rather than `content.foundingNodeIds`, because a universe founded on a
  // sub-rectangle must be seeded from inside that rectangle or its first grants
  // name cells it cannot legally use.
  //
  // The grant budget then counts *these* nodes as already-seeded, so that its
  // accrual does not read a god's own grant as a discovery the mages made. Two
  // branches added those two readers independently and the merge briefly had
  // them disagree — the budget counting `content`'s list while the grants came
  // from `opening`'s. That would have credited a universe with discoveries it
  // never made, in exactly the amount the two lists differ.
  const seeded = opening.foundingNodeIds.slice(0, options.foundingNodes);
  grantFoundingKnowledge(state, {
    founders,
    nodeIds: seeded,
    nodeCount: content.deps.catalog.nodeCount,
  });

  seedPortalMagic(state, {
    founders,
    enabled: options.foundingPortalMagic !== 0,
    portalNodes: content.deps.god?.portalNodes,
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

/**
 * Puts portal magic in a founder's head, when the instrument asks for it.
 *
 * The **shallowest** portal-carrying node, by interned id, so that the arm is
 * placed exactly at the gate and not past it: `rl-the-standing-gate` is tier 5
 * and carries two further primitives, and seeding that instead would be handing
 * the universe a capability rather than a permission.
 *
 * `seededNodes` in {@link attachGrantBudget} deliberately does **not** count
 * this. That figure exists to stop the founding-grant accrual paying for
 * itself, and this node is not a founding grant — it is a starting position the
 * instrument declares. Counting it would make the diagnostic arms carry a
 * smaller grant budget than their controls, which is a second difference
 * between two arms that must differ by one thing.
 */
function seedPortalMagic(
  state: SimState,
  input: {
    readonly founders: readonly EntityHandle[];
    readonly enabled: boolean;
    readonly portalNodes: ReadonlySet<number> | undefined;
    readonly nodeCount: number;
  },
): void {
  if (!input.enabled) return;
  const holder = input.founders[0];
  if (holder === undefined) return;
  const shallowest = [...(input.portalNodes ?? [])].sort((a, b) => a - b)[0];
  if (shallowest === undefined) return;

  new KnowledgeSubsystem(state, input.nodeCount).createInstance({
    nodeId: shallowest,
    locationKind: LOCATION_KIND.mind,
    locationId: holder,
    acquiredTick: 0,
    mastery: MASTERY_MAX,
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
  /**
   * The §7 per-run telemetry this run produced — the knowledge census and the
   * per-`(species, tier)` first-reach table.
   *
   * A closure like the two above it, and per-run for the same reason. Call it
   * **after** the episode: `balanceTelemetry()` finalizes the run's last census
   * sample, which is the one a system cannot take. See `balance-telemetry.ts`.
   */
  balanceTelemetry: () => BalanceRunTelemetry;
  /**
   * The cheat sheet this run was built with, canonicalized, or `undefined` on
   * an honest run.
   *
   * Reported rather than inferred: a caller that wants to stamp a harness
   * provenance block, print a banner, or refuse to record a result needs the
   * digest, and re-normalizing the spec at each of those sites would be a
   * second answer to which cheats are in force.
   */
  readonly sandbox?: NormalizedSandbox;
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
  /**
   * Whether the §7 balance-telemetry system is installed. Default `true`.
   *
   * The **inertness control**, and it exists for the same reason `raids` does:
   * a claim that an instrument does not perturb what it measures is only worth
   * anything if the un-instrumented arm can actually be built and compared.
   * `balance-telemetry.test.ts` steps both arms from one seed and asserts
   * identical snapshot hashes; without this switch that assertion could only be
   * made against a hash somebody wrote down once.
   *
   * `false` is **not** a build to collect against: `balanceTelemetry()` then
   * returns an empty census, and §7's per-run collectors will honestly report
   * `no-observations` for a universe that was simply never watched. Everything
   * shipped runs with it `true`.
   */
  readonly telemetry?: boolean;
  /**
   * §9's ablation mask for this run, or absent for the control arm.
   *
   * Per **scenario**, not per `ReferenceContent`, and that placement is the
   * whole of the fix. A `ReferenceContent` is resolved once and memoized for the
   * life of a worker process — `CONTENT_BY_TRADITION` in `executor.ts` — so a
   * mask folded into `content.deps` would be shared by every subsequent run the
   * worker executed, and one ablation arm would silently neutralize the arms
   * scheduled after it. `referenceScenario` is already built once per run, for
   * exactly the reasons its own doc comment gives, so it is the object whose
   * lifetime matches a mask's.
   *
   * Absent is strictly not the same as {@link NO_ABLATION} here: absent leaves
   * `WorldStepDeps.ablation` undefined, so every control run, every golden
   * replay fixture and every committed baseline takes the byte-identical branch
   * at `world-step.ts`'s three `deps.ablation === undefined` sites. The two are
   * arithmetically equivalent and only one of them is a claim worth making on a
   * path with baselines attached.
   */
  readonly ablation?: AblationMask;
  /**
   * The sandbox cheat sheet, or absent for an honest universe. **Absent is the
   * default and absent is every shipped build.**
   *
   * The whole of the sandbox's contact with this file is this one optional
   * field and the four places below that read it. With it absent, every line of
   * this function is the line it ran before `sandbox.ts` existed — the same
   * `defineWorldStateSchema`, the same system list, the same
   * {@link REFERENCE_SCENARIO_ID}, the same state out of the builder — which is
   * what makes "off by default" a property with a snapshot-hash test rather
   * than an assurance. The precedent is
   * {@link ReferenceScenarioOptions.telemetry} and it is the same argument: an
   * inertness claim is worth nothing unless the other arm can be built and
   * compared.
   *
   * Present, the universe is built on a schema carrying `sandbox-brand`, is
   * branded before anybody sees it, and records a scenario id that is not the
   * reference one. See `sandbox.ts` for why none of that can be laundered off.
   */
  readonly sandbox?: SandboxSpec;
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
  const simulation = defineWorldSimulation(
    options.ablation === undefined ? content.deps : { ...content.deps, ablation: options.ablation },
  );
  const raiding = options.raids ?? true;

  // The sandbox, resolved once. Four reads follow — the schema builder, the
  // system list, the scenario id, the founding cheats — and every one of them
  // is a ternary whose absent branch is the expression that was there before.
  // Nothing further down this function, and nothing at all in `coordination` or
  // `rules-*`, knows the layer exists.
  const sandbox = options.sandbox === undefined ? undefined : normalizeSandbox(options.sandbox);
  const buildSchema = (systems: readonly System[]): WorldSchema =>
    sandbox === undefined ? defineWorldStateSchema(systems) : defineSandboxWorldSchema(systems);
  const sandboxSystems: readonly System[] = sandbox === undefined ? [] : [sandboxSystem(sandbox)];
  const scenarioId =
    sandbox === undefined
      ? REFERENCE_SCENARIO_ID
      : sandboxScenarioId(REFERENCE_SCENARIO_ID, sandbox.digest);
  const sandboxReport = sandbox === undefined ? {} : { sandbox };
  /**
   * Applies the founding cheats to a state the builder just produced.
   *
   * Inside `create`, deliberately: `Scenario.create` must be a pure function of
   * `(runSeed, config)` and this is one — the cheat sheet is fixed for the life
   * of the scenario, so two sessions reset with the same coordinates build the
   * same cheated universe. Doing it outside would mean handing out a state that
   * was honest for a moment and became cheated later, which is exactly the
   * window the brand exists to close.
   */
  const cheat = (state: SimState): SimState => {
    if (sandbox === undefined) return state;
    applyFoundingCheats(state, sandbox, {
      // `record.bit` is the axis's **index**, not its mask — `creo` is 0, not 1
      // — and `permittedTechniques` is a bitmask over those indices. ORing the
      // indices together instead of shifting them produced `0|1|2|3|4 = 7`,
      // which is a legitimate-looking mask naming three techniques that are not
      // the five the content declares. Caught by asserting the armed mask
      // against the registry rather than against itself.
      allTechniques: content.registry.techniques.reduce(
        (bits, { record }) => bits | (1 << record.bit),
        0,
      ),
      allForms: content.registry.forms.reduce((bits, { record }) => bits | (1 << record.bit), 0),
      nodeCount: content.deps.catalog.nodeCount,
    });
    return state;
  };

  // Per run, like the report closures and the raid log, and installed **first**
  // so that the tick it labels a sample with is the tick the state arrived at.
  // It writes nothing and draws nothing; see `balance-telemetry.ts`.
  const recorder = new BalanceTelemetryRecorder(content);
  const recording = options.telemetry ?? true;
  const telemetrySystems = recording ? [balanceTelemetrySystem(recorder)] : [];
  const balanceTelemetry = (): BalanceRunTelemetry => {
    if (recording) recorder.finish();
    return recorder.telemetry();
  };

  if (!raiding) {
    const raidlessSchema = buildSchema([
      ...sandboxSystems,
      ...telemetrySystems,
      ...simulation.schema.systems,
    ]);
    return {
      scenario: {
        scenarioId,
        catalogue: content.catalogue,
        create: (runSeed: number, config: ScenarioConfig): SimState => {
          const state = cheat(
            buildReferenceState({
              runSeed,
              options: referenceOptions(config),
              content,
              schema: raidlessSchema,
            }),
          );
          recorder.begin(state);
          return state;
        },
      },
      lastReport: simulation.lastReport,
      lastGodReport: simulation.lastGodReport,
      raids: () => [],
      balanceTelemetry,
      ...sandboxReport,
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
  const schema = buildSchema([
    ...sandboxSystems,
    ...telemetrySystems,
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
      // Per run, exactly like the mask handed to `defineWorldSimulation` above.
      // Without this line the world loop is ablatable and raids are not, so an
      // arm neutralizing a combat primitive would neutralize nothing and report
      // a null result for a wire that was live the whole time.
      ...(options.ablation === undefined ? {} : { ablation: options.ablation }),
    }),
  ]);

  return {
    scenario: {
      scenarioId,
      catalogue: content.catalogue,
      portalTargets: portalTargetIds(constants),
      // The roster the god may invite from, and it is every species the content
      // declares. `invitePlan` refuses one already living here, so a
      // single-species universe sees five candidates and an all-six universe
      // sees none — which is the asymmetry the mechanic is for.
      invitableSpecies: [...(content.deps.god?.invitableSpecies ?? [])],
      // Action 16's gate, so the mask can see it. Without this the mask would
      // be optimistic by one predicate and a policy listing the invitation
      // first would burn every round on a refusal — measured, and documented on
      // `inviteScholarCandidates`.
      portalNodes: [...(content.deps.god?.portalNodes ?? [])],
      create: (runSeed: number, config: ScenarioConfig): SimState => {
        // A new episode is a new run: the raid log belongs to one, and a
        // scenario reused across two would report the first one's raids in the
        // second one's record.
        records.length = 0;
        const state = cheat(
          buildReferenceState({
            runSeed,
            options: referenceOptions(config),
            content,
            schema,
          }),
        );
        // The census belongs to one episode too, and for the identical reason.
        recorder.begin(state);
        return state;
      },
    },
    lastReport: simulation.lastReport,
    lastGodReport: simulation.lastGodReport,
    raids: () => records,
    balanceTelemetry,
    ...sandboxReport,
  };
}
