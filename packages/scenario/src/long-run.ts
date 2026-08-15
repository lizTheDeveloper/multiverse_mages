/*
 * Multiverse Mages — the two-hundred-year reference run, and the instruments
 * that read it.
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
 * `mages-and-species` task 9.2 — *"implement the 200-world-year deterministic
 * long-run test"* — and the six measurements tasks 9.3 to 9.9 assert against.
 * The assertions live next door in `test/unit/reference-long-run.test.ts`; this
 * file only produces numbers, so that a reader can see what was measured
 * separately from what was claimed about it.
 *
 * ## Why this does not go through a session, when `executor.ts` does
 *
 * `census.ts` argues at length that a measurement destined for a committed
 * baseline must come through `agent-api`'s observation, because a measurement
 * the observation cannot express is a finding about §4.1 rather than a licence
 * to read the state. That argument is kept: every **stock** below —
 * population by species and by occupation, mages by species and tier, nodes
 * known, library depth, grimoires — is read out of the §4.1 observation, at the
 * same offsets `census.ts` reads.
 *
 * Two things change, and both are deliberate.
 *
 * 1. **The raw observation, not the normalized one.** `normalizedObservation`
 *    exports each `ratio` channel as `n / divisor` clamped at its maximum, and
 *    a two-hundred-year run is exactly where a count clears its divisor: the
 *    population channels carry tens of thousands. A saturated channel reads
 *    back as its divisor, so `censusOf` would report a floor and flag it. The
 *    long run therefore reads {@link rawObservation}, which is the same layout
 *    and the same blocks before normalization — an exact integer per channel.
 * 2. **The state is driven directly, not through a session.** Task 9.6 wants a
 *    byte-identical **snapshot hash**, and a session deliberately does not hand
 *    its state out. This package is the composition root that builds the state
 *    in the first place, so it steps it with `sim-core`'s own `step` — the same
 *    call `agent-api`'s session makes, with an empty action list, which is what
 *    *"zero player input"* means when the god has verbs.
 *
 * The **flows** — births, deaths, lessons, books — are not in the observation
 * at all. §4.1 is a vector of levels; a tick's births are not a level of
 * anything. They come from `coordination`'s {@link WorldStepReport}, which
 * `contracts.md` §4.4 makes an explain channel that no rule may read back. That
 * is the right door for them and the only one there is.
 *
 * ## The horizon is two hundred world years because the mechanisms are slow
 *
 * `contracts.md` §0 makes a world tick one month, so 2,400 ticks. Read against
 * the shipped species that is not a round number: a draconic matures at 3,600
 * months, so **no draconic is ever promoted within this run** and the species'
 * mages are its founders for the whole two centuries. An elf matures at 1,800
 * months — one generation and a half. A run short enough to be cheap is a run
 * in which four of the six species have not yet done anything.
 */

import type { ContentId } from '@mm/content';
import type { Fixed, SimState } from '@mm/sim-core';
import { rngFromRootSeed, snapshotHash, step } from '@mm/sim-core';
import {
  MAGE_TIER_SLOTS,
  OBSERVATION_KNOWLEDGE_CHANNELS,
  OBSERVATION_OCCUPATION_COUNT,
  OBSERVATION_SPECIES_COUNT,
  observationBlock,
  rawObservation,
} from '@mm/agent-api';
import { GRID_CELL_COUNT, MAGE, collectRecords, componentOf } from '@mm/state';
import { libraryContribution, maxCarryingCapacity } from '@mm/rules-world';
import type { WorldStepReport } from '@mm/coordination';
import { defineWorldSimulation } from '@mm/coordination';

import type { ReferenceContent, ReferenceOptions } from './reference-universe.js';
import { buildReferenceState, referenceContent } from './reference-universe.js';

/** World ticks in a world year (`contracts.md` §0: a tick is a month). */
export const TICKS_PER_WORLD_YEAR = 12;

/** The horizon task 9.2 names. */
export const LONG_RUN_YEARS = 200;

/** {@link LONG_RUN_YEARS} in world ticks. */
export const LONG_RUN_TICKS = LONG_RUN_YEARS * TICKS_PER_WORLD_YEAR;

/**
 * The seed the committed long run is taken at.
 *
 * One seed, not a distribution. A long run is an existence instrument — *does
 * a universe left alone for two centuries lose a species, exceed its bound,
 * stop learning, oscillate* — and every one of those questions is answered
 * about a specific universe. The cross-seed question is the balance harness's
 * and belongs to 0.5.0; {@link timeToTierBySpecies} is the one measurement here
 * that needs a spread, and its callers supply their own seeds.
 */
export const LONG_RUN_SEED = 0x0009_0001;

/**
 * The starting position the long run is taken at, and why it is not the
 * shakedown sweep's.
 *
 * `foundingNodes: 6` — **one grant per founder**. The grants are dealt
 * round-robin, so at the sweep's four nodes two of the six species begin with
 * no knowledge at all, and any difference in how fast a species reaches a tier
 * would then be a difference in who got a book. Six removes that confound,
 * which is what makes task 9.9 a measurement of species rather than of
 * dealing order. Every candidate is a root node of a v1 cell and every one of
 * them is tier 1 (`foundingCandidates`), so no species is handed a tier either.
 *
 * `cohortSize: 12` — the sweep's larger level. The smaller one seeds four
 * members per species per occupation, and a draconic cohort of four that never
 * matures is four people carrying a species for two hundred years; task 9.3
 * would then be measuring a hazard roll.
 */
export const LONG_RUN_OPTIONS: ReferenceOptions = Object.freeze({
  cohortSize: 12,
  foundingMages: 1,
  foundingNodes: 6,
  // The v1 rectangle, which is what the long run has always opened on. A long
  // run exists to measure two hundred years of one universe, so drawing its
  // opening square from the seed would make every reading a reading of a
  // different game.
  openingTechniqueCount: 0,
  openingFormCount: 0,
  openingSquareSeeded: 0,
  // Every species founds the long run, which is what it has always done and what
  // task 9.9's per-species time-to-tier measurement requires.
  foundingSpeciesMask: 0,
  // One academy, which is what the long run has always founded and what every
  // committed baseline was measured against. The two-academy starting position
  // is `scripts/w78-university-divergence.mjs`'s, not this one's.
  foundingUniversities: 1,
});

/** One world tick of the long run, stocks and flows together. */
export interface LongRunTick {
  /** Ticks elapsed **after** this step. The first entry is tick 1. */
  readonly worldTick: number;
  /** Everybody alive, all species, all occupations. */
  readonly population: number;
  /** Population per species, indexed by `speciesId - 1`. */
  readonly populationBySpecies: readonly number[];
  /** Population per occupation, in `OCCUPATION` order. */
  readonly populationByOccupation: readonly number[];
  /** Living mages per species, indexed by `speciesId - 1`. */
  readonly magesBySpecies: readonly number[];
  /**
   * The deepest tier any living mage of a species holds, or `0` for a species
   * with no mage or none who knows anything.
   *
   * Read off the mage block, whose slots are `(species, highest tier)` pairs —
   * so this is exactly what §4.1 exports and not a richer thing computed beside
   * it.
   */
  readonly deepestTierBySpecies: readonly number[];
  /** Distinct nodes of which the universe holds at least one instance. */
  readonly nodesKnown: number;
  /** Distinct nodes held in libraries. §7's `capitalSnowball` channel. */
  readonly libraryDepth: number;
  /** Grimoires in existence. */
  readonly grimoires: number;
  /**
   * The universe's total effective knowledge capital, `fp`.
   *
   * `libraryContribution(libraryDepth)`, summed over universities — of which
   * the reference universe has exactly one, so the sum is the term. Ungated:
   * `contributionFor` would first cut the depth to the learner's
   * `depthCeiling`, and a universe with six species has six answers. The
   * ungated figure is the largest of them, so a flat ungated series bounds
   * every gated one, which is all task 9.8 needs of it.
   */
  readonly capitalContribution: Fixed;
  /** What the loop reported about this tick. */
  readonly report: WorldStepReport;
}

/** A finished long run. */
export interface LongRunResult {
  /** Every tick, ascending. Length is the tick count the run was given. */
  readonly ticks: readonly LongRunTick[];
  /**
   * The reading taken before tick 1, so a caller can name a founding level.
   *
   * No `report`, and that absence is the honest shape: a report describes what
   * a tick *did*, and tick zero is a starting position rather than a tick.
   */
  readonly founding: Omit<LongRunTick, 'report'>;
  /** `snapshotHash` of the final state — what task 9.6 compares. */
  readonly finalSnapshotHash: string;
  /** The largest population seen at any tick, including the founding reading. */
  readonly peakPopulation: number;
  /** `maxCarryingCapacity` of the territory the run was given. Content alone. */
  readonly populationBound: number;
  /** Species ids in the order every per-species array above is indexed. */
  readonly speciesIds: readonly ContentId[];
  /** What the loss shock removed, or absent when the run was not shocked. */
  readonly shock?: LossShockOutcome;
}

/** What {@link runLongReference} may be told. */
export interface LongRunOptions {
  readonly runSeed?: number;
  readonly ticks?: number;
  readonly options?: ReferenceOptions;
  readonly content?: ReferenceContent;
  /** A deterministic mage cull to apply mid-run. See {@link LossShock}. */
  readonly shock?: LossShock;
}

/**
 * A deterministic cull of living mages, applied between two `step` calls.
 *
 * ## Why it takes no draw
 *
 * `contracts.md` §6: adding a draw in one subsystem must not re-roll any other,
 * and every committed balance baseline depends on that. A shock that sampled
 * which mages to kill would consume from some stream and shift every subsequent
 * value behind it, so the selection is positional instead — **every k-th living
 * mage by ascending entity handle**. Handles are stable identities, not array
 * indices, so the same run seed culls the same mages every time, and the mages
 * left alive keep their own handle-keyed mortality streams untouched.
 *
 * ## Why it writes `alive` directly
 *
 * This is the same pair of writes `rules-raid`'s `applyConsequences` uses for a
 * casualty, and it has the same known gap: it does not run `killMage`, so goal
 * abandonment, university slot release and grimoire inheritance do not happen.
 * Matching the raid path was the choice — a second, tidier way to kill a mage
 * would be a third behaviour for the measurement to diverge from — but a
 * recovery time read from this is a recovery of *headcount*, and slots held by
 * the culled are a known distortion rather than a silent one.
 */
export interface LossShock {
  /** The world tick, 1-based in step order, at which the cull lands. */
  readonly atTick: number;
  /** Kill every k-th living mage by ascending handle. `2` halves the roster. */
  readonly everyKth: number;
}

/** What the cull actually did, so the metric is not told to trust it. */
export interface LossShockOutcome {
  readonly atTick: number;
  readonly everyKth: number;
  /** Living mages per species immediately before the cull. */
  readonly preShockBySpecies: readonly number[];
  /** Living mages per species immediately after it. */
  readonly postShockBySpecies: readonly number[];
  /** Handles culled, ascending. Named so a reviewer can reproduce the selection. */
  readonly culled: readonly number[];
}

/**
 * Applies the cull and reports what it removed.
 *
 * Species counts are read off the mage rows rather than off the observation,
 * because the observation's mage block is keyed on `(species, highest tier)` and
 * a mage holding nothing does not appear in it — which would make the pre-shock
 * roster smaller than the number of mages actually alive.
 */
function applyLossShock(
  state: SimState,
  shock: LossShock,
  speciesCount: number,
): LossShockOutcome {
  const pre = Array.from({ length: speciesCount }, () => 0);
  const post = Array.from({ length: speciesCount }, () => 0);
  const culled: number[] = [];

  const living = collectRecords(state, MAGE)
    .filter((entry) => entry.row.alive === 1)
    .sort((a, b) => a.handle - b.handle);

  const mages = componentOf(state, MAGE);
  living.forEach((entry, index) => {
    const speciesIndex = entry.row.speciesId - 1;
    const counted = speciesIndex >= 0 && speciesIndex < speciesCount;
    if (counted) pre[speciesIndex] = (pre[speciesIndex] ?? 0) + 1;
    if ((index + 1) % shock.everyKth === 0) {
      mages.set(entry.handle, 'alive', 0);
      culled.push(entry.handle);
      return;
    }
    if (counted) post[speciesIndex] = (post[speciesIndex] ?? 0) + 1;
  });

  return {
    atTick: shock.atTick,
    everyKth: shock.everyKth,
    preShockBySpecies: Object.freeze(pre),
    postShockBySpecies: Object.freeze(post),
    culled: Object.freeze(culled),
  };
}

/** Sums a run of raw observation channels. */
function sumChannels(
  raw: Int32Array,
  offset: number,
  length: number,
  stride = 1,
): number {
  let total = 0;
  for (let index = 0; index < length; index += 1) total += raw[offset + index * stride] ?? 0;
  return total;
}

/** Everything the observation says about one tick. */
function readObservation(state: SimState, content: ReferenceContent): Omit<LongRunTick, 'report'> {
  const raw = rawObservation({ state, catalogue: content.catalogue });

  const populationOffset = observationBlock('population').offset;
  const populationBySpecies: number[] = [];
  const populationByOccupation = Array.from({ length: OBSERVATION_OCCUPATION_COUNT }, () => 0);
  let population = 0;
  for (let species = 0; species < OBSERVATION_SPECIES_COUNT; species += 1) {
    let ofSpecies = 0;
    for (let occupation = 0; occupation < OBSERVATION_OCCUPATION_COUNT; occupation += 1) {
      const value = raw[populationOffset + species * OBSERVATION_OCCUPATION_COUNT + occupation] ?? 0;
      ofSpecies += value;
      populationByOccupation[occupation] = (populationByOccupation[occupation] ?? 0) + value;
    }
    populationBySpecies.push(ofSpecies);
    population += ofSpecies;
  }

  const mageOffset = observationBlock('mages').offset;
  const magesBySpecies: number[] = [];
  const deepestTierBySpecies: number[] = [];
  for (let species = 0; species < OBSERVATION_SPECIES_COUNT; species += 1) {
    let mages = 0;
    let deepest = 0;
    for (let tier = 0; tier < MAGE_TIER_SLOTS; tier += 1) {
      const value = raw[mageOffset + species * MAGE_TIER_SLOTS + tier] ?? 0;
      mages += value;
      if (value > 0 && tier > deepest) deepest = tier;
    }
    magesBySpecies.push(mages);
    deepestTierBySpecies.push(deepest);
  }

  const knowledgeOffset = observationBlock('knowledge').offset;
  const nodesKnown = sumChannels(
    raw,
    knowledgeOffset,
    GRID_CELL_COUNT,
    OBSERVATION_KNOWLEDGE_CHANNELS,
  );

  const institutions = observationBlock('institutions').offset;
  const libraryDepth = raw[institutions + 2] ?? 0;
  const grimoires = raw[institutions + 3] ?? 0;

  return {
    worldTick: raw[observationBlock('clock').offset] ?? 0,
    population,
    populationBySpecies: Object.freeze(populationBySpecies),
    populationByOccupation: Object.freeze(populationByOccupation),
    magesBySpecies: Object.freeze(magesBySpecies),
    deepestTierBySpecies: Object.freeze(deepestTierBySpecies),
    nodesKnown,
    libraryDepth,
    grimoires,
    capitalContribution: libraryContribution(libraryDepth),
  };
}

/**
 * Runs the reference universe for {@link LONG_RUN_TICKS} world ticks and
 * records every one of them.
 *
 * **No actions are submitted, ever.** Task 9.1 asks for a scenario with zero
 * player input, and since `god-agency` landed that is a claim with teeth: the
 * god has verbs and the intervention system reads `ctx.actions`. An empty list
 * every tick is the only way to keep measuring the simulation's own evolution.
 *
 * ## Why an asynchronous function around synchronous work
 *
 * Nothing here awaits anything: the simulation is synchronous, the yield below
 * has no effect on any number produced, and two calls with the same arguments
 * return equal results whatever else the process is doing. The `await` exists
 * because two thousand four hundred ticks is fifteen-odd seconds of unbroken
 * synchronous work, and a test runner that talks to its worker over an RPC
 * channel treats a worker that has not answered in that long as a worker that
 * has died. Yielding once a world year — two hundred times over the run — costs
 * nothing measurable and lets the worker answer.
 */
export async function runLongReference(input: LongRunOptions = {}): Promise<LongRunResult> {
  // No tradition named, so this resolves `scribingTraditionId`'s pick — the
  // tradition every measurement in this file has ever been taken under. The
  // tradition is a content fact, not a `ReferenceOptions` field, so pinning it
  // is done here and not in `LONG_RUN_OPTIONS`.
  const content = input.content ?? referenceContent();
  const ticks = input.ticks ?? LONG_RUN_TICKS;
  const simulation = defineWorldSimulation(content.deps);

  let state = buildReferenceState({
    runSeed: input.runSeed ?? LONG_RUN_SEED,
    options: input.options ?? LONG_RUN_OPTIONS,
    content,
    schema: simulation.schema,
  });

  const foundingObservation = readObservation(state, content);
  let peakPopulation = foundingObservation.population;
  const recorded: LongRunTick[] = [];
  let shockOutcome: LossShockOutcome | undefined;

  for (let index = 0; index < ticks; index += 1) {
    if (index > 0 && index % TICKS_PER_WORLD_YEAR === 0) {
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    const report = simulation.lastReport();
    if (report === undefined) {
      throw new Error(
        `The world loop produced no report on tick ${String(index + 1)}. Every measurement below ` +
          'is read off that report or off the observation of the state it produced, so a missing ' +
          'one is a hole in the record rather than a tick that did nothing.',
      );
    }
    const observed = readObservation(state, content);
    peakPopulation = Math.max(peakPopulation, observed.population);
    recorded.push({ ...observed, report });

    // After the tick, so `atTick` names a tick that has happened and the next
    // step is the first one the shortened roster lives through.
    if (input.shock !== undefined && index + 1 === input.shock.atTick) {
      shockOutcome = applyLossShock(state, input.shock, content.registry.species.length);
    }
  }

  return {
    ticks: recorded,
    founding: foundingObservation,
    finalSnapshotHash: snapshotHash(state),
    peakPopulation,
    populationBound: maxCarryingCapacity(content.deps.territory),
    speciesIds: Object.freeze([...content.registry.species.map((entry) => entry.contentId)]),
    ...(shockOutcome === undefined ? {} : { shock: shockOutcome }),
  };
}

// ---------------------------------------------------------------------------
// The instruments. Each answers exactly one of tasks 9.3 to 9.9.
// ---------------------------------------------------------------------------

/** A slice of the run, in ticks, closed at both ends. */
export interface RunWindow {
  readonly fromTick: number;
  readonly toTick: number;
  readonly ticks: readonly LongRunTick[];
}

/**
 * Cuts a run into equal windows of `windowYears` world years.
 *
 * Windowed rather than pointwise because every activity question in task 9.5 is
 * about a *rate*: research completes a handful of times a year, so "did the
 * universe research this tick" is almost always no and says nothing.
 */
export function windowsOf(result: LongRunResult, windowYears: number): readonly RunWindow[] {
  const span = windowYears * TICKS_PER_WORLD_YEAR;
  const windows: RunWindow[] = [];
  for (let start = 0; start < result.ticks.length; start += span) {
    const slice = result.ticks.slice(start, start + span);
    const first = slice[0];
    const last = slice[slice.length - 1];
    if (first === undefined || last === undefined) continue;
    windows.push({ fromTick: first.worldTick, toTick: last.worldTick, ticks: slice });
  }
  return windows;
}

/** Totals of the four flows that say whether a universe is still working. */
export interface WindowActivity {
  readonly window: RunWindow;
  readonly researchCompleted: number;
  readonly lessonsTaught: number;
  readonly grimoiresScribed: number;
  readonly births: number;
  readonly populaceDeaths: number;
}

/** Sums each flow over one window. */
export function activityIn(window: RunWindow): WindowActivity {
  let researchCompleted = 0;
  let lessonsTaught = 0;
  let grimoiresScribed = 0;
  let births = 0;
  let populaceDeaths = 0;
  for (const tick of window.ticks) {
    researchCompleted += tick.report.researchCompleted;
    lessonsTaught += tick.report.lessonsTaught;
    grimoiresScribed += tick.report.grimoiresScribed;
    births += tick.report.births;
    populaceDeaths += tick.report.populaceDeaths;
  }
  return { window, researchCompleted, lessonsTaught, grimoiresScribed, births, populaceDeaths };
}

/**
 * The longest run of consecutive ticks on which the occupation mix is a
 * two-tick alternation — task 9.7's quantity.
 *
 * A tick is *alternating* when the mix equals the mix two ticks ago and differs
 * from the mix one tick ago. One such tick is nothing: a rate-limited
 * controller that moves one person out and one person back is entitled to do
 * that once. A **sustained** alternation is a controller oscillating against
 * its own demand signal, and the length of the longest streak is the number
 * that tells the two apart.
 */
export function longestOccupationAlternation(result: LongRunResult): number {
  const same = (a: readonly number[], b: readonly number[]): boolean =>
    a.length === b.length && a.every((value, index) => value === b[index]);

  let longest = 0;
  let current = 0;
  for (let index = 2; index < result.ticks.length; index += 1) {
    const now = result.ticks[index]?.populationByOccupation;
    const previous = result.ticks[index - 1]?.populationByOccupation;
    const before = result.ticks[index - 2]?.populationByOccupation;
    if (now === undefined || previous === undefined || before === undefined) continue;
    if (same(now, before) && !same(now, previous)) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

/**
 * The first world tick at which a species held a mage of at least `tier`, per
 * species, or `undefined` where it never did.
 *
 * `undefined` rather than a sentinel tick, because a species that never got
 * there is **censored** and not slow: `contracts.md` §7's `timeToTierBySpecies`
 * is explicit that a censoring rule is part of the metric's definition, and a
 * large number standing in for "never" is the one encoding that makes a mean
 * over the column silently wrong.
 */
export function timeToTierBySpecies(
  result: LongRunResult,
  tier: number,
): readonly (number | undefined)[] {
  const reached: (number | undefined)[] = Array.from(
    { length: OBSERVATION_SPECIES_COUNT },
    () => undefined,
  );
  for (const tick of result.ticks) {
    for (let species = 0; species < OBSERVATION_SPECIES_COUNT; species += 1) {
      if (reached[species] !== undefined) continue;
      if ((tick.deepestTierBySpecies[species] ?? 0) >= tier) reached[species] = tick.worldTick;
    }
  }
  return Object.freeze(reached);
}

/**
 * A long run reduced to one printable line per year, so a reader can see what
 * the assertions were taken over.
 *
 * The census table `reference-universe.test.ts` prints exists for the same
 * reason and says so: *"a green sweep over a universe that sits still is worth
 * nothing, and the only way a reader can tell the difference is to see the
 * numbers."* Two hundred lines is too many, so this takes one per `everyYears`.
 */
export function longRunLines(result: LongRunResult, everyYears = 10): readonly string[] {
  const lines: string[] = [];
  const column = (value: number, width: number): string => String(value).padStart(width);
  for (const tick of result.ticks) {
    if (tick.worldTick % (everyYears * TICKS_PER_WORLD_YEAR) !== 0) continue;
    lines.push(
      `y${column(tick.worldTick / TICKS_PER_WORLD_YEAR, 3)}` +
        `  pop ${column(tick.population, 6)} [${tick.populationBySpecies.join('/')}]` +
        `  occ [${tick.populationByOccupation.join('/')}]` +
        `  K ${column(tick.report.carryingCapacity, 6)}` +
        `  mages [${tick.magesBySpecies.join('/')}]` +
        `  tiers [${tick.deepestTierBySpecies.join('/')}]` +
        `  nodes ${column(tick.nodesKnown, 3)}  libDepth ${tick.libraryDepth}` +
        `  books ${column(tick.grimoires, 5)}  capital ${tick.capitalContribution}`,
    );
  }
  return lines;
}
