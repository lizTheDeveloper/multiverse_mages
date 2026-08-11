/*
 * Multiverse Mages — the reference scenario package's public surface.
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
 * `@mm/scenario` — what a universe looks like at tick zero, and the run
 * executor that hands it to the Monte Carlo harness.
 *
 * ## Why this package exists, in one paragraph
 *
 * `contracts.md` §5 gives `mc-harness` exactly one edge, to `agent-api`, and
 * `agent-api` builds no worlds: its session takes a caller-supplied `Scenario`
 * and says, in as many words, that *"a session does not know how to build a
 * world"*. §5 therefore names no package for the caller — the thing that loads
 * content, installs `coordination`'s world loop, seeds a starting position, and
 * joins the two halves of that boundary without either side reaching across it.
 * This is that package, recorded as the fourth deviation beside the §5 diagram.
 * It is a **leaf**: nothing in this workspace imports it, and the
 * dependency-graph test is what keeps that true.
 *
 * ## What it is honest about
 *
 * A reference run measures the simulation's own evolution and nothing about
 * play. No god action has any effect at this build, nothing raises mastery, and
 * knowledge spreads only from founding grants. All three are stated where they
 * bite — `reference-universe.ts` — rather than smoothed over by a scenario that
 * quietly supplies what the rules do not.
 */

export type { RulesetAxes } from './content-set.js';
export {
  catalogAndCells,
  contentCatalogue,
  foundingCandidates,
  primitiveNamed,
  scribingTraditionId,
  shippedContent,
  speciesTable,
  storeHookOf,
  v1RulesetAxes,
  worldDeps,
} from './content-set.js';

export type { CensusSample } from './census.js';
export { censusLine, censusOf } from './census.js';

export type { ReferenceMeasure, RunMeasurement } from './measures.js';
export {
  FINAL_WINDOW_DENOMINATOR,
  REFERENCE_MEASURES,
  REFERENCE_METRIC_IDS,
  REFERENCE_METRIC_VERSIONS,
  collectReferenceMetrics,
} from './measures.js';

export type { ReferenceContent, ReferenceOptions, ReferenceRun } from './reference-universe.js';
export {
  REFERENCE_FACTOR_IDS,
  REFERENCE_SCENARIO_ID,
  buildReferenceState,
  referenceContent,
  referenceOptions,
  referenceScenario,
} from './reference-universe.js';

export type { ReferenceExecutorOptions, ReferenceRunResult } from './executor.js';
export {
  CENSUS_INTERVAL_TICKS,
  SCENARIO_BUILD_VERSION,
  executeReferenceRun,
  makeReferenceExecutor,
  referenceProvenance,
} from './executor.js';

export { REFERENCE_REGISTRIES, REFERENCE_SWEEP } from './sweep.js';

export type {
  LongRunOptions,
  LongRunResult,
  LongRunTick,
  RunWindow,
  WindowActivity,
} from './long-run.js';
export {
  LONG_RUN_OPTIONS,
  LONG_RUN_SEED,
  LONG_RUN_TICKS,
  LONG_RUN_YEARS,
  TICKS_PER_WORLD_YEAR,
  activityIn,
  longRunLines,
  longestOccupationAlternation,
  runLongReference,
  timeToTierBySpecies,
  windowsOf,
} from './long-run.js';
