/*
 * Multiverse Mages — world rules package public surface.
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
 * `@mm/rules-world` — mages and their autonomy, species, populace cohorts,
 * universities, and the materials economy.
 *
 * What is here so far is the species layer of `mages-and-species`: the trait
 * registry that makes "higher is better" a checkable property rather than a
 * convention, the rediscovery floor that keeps the shipped 0.3.0 claim true,
 * the extended-scale division that stops long-lived species from becoming
 * immortal by rounding, and the port through which this package reaches
 * knowledge without importing `@mm/rules-magic`.
 *
 * `contracts.md` §5 forbids this package from importing `@mm/rules-magic` or
 * `@mm/agent-api`, and the dependency-graph test
 * (`packages/sim-core/test/unit/module-boundaries.test.ts`) asserts those edges
 * against these directories. The utility-AI scoring functions for mage autonomy
 * are deliberately left open by `contracts.md` §8 and are this package's to fix.
 *
 * **Every species magnitude is content, and every one of them is untuned.**
 * Nothing in this package may carry a number keyed to a named species; a
 * conformance test over `src/` enforces that, and `release-plan.md`'s
 * measurement pivot forbids any claim that those magnitudes are balanced before
 * 0.5.0.
 */

/**
 * The utility-AI. One re-export rather than a named list, so that growing the
 * goal set touches `autonomy/index.ts` and not this file — the same reason the
 * populace layer is re-exported wholesale below.
 */
export * from './autonomy/index.js';

export type {
  KnowledgeGateway,
  KnowledgeTarget,
  MageHandle,
  UniversityHandle,
} from './coordination.js';
export { NO_INHERITOR } from './coordination.js';

export {
  LIFESPAN_RATE_ONE,
  LIFESPAN_RATE_SHIFT,
  naivePerLifespanRate,
  narrowToFixed,
  perLifespanRate,
} from './lifespan-rate.js';

/**
 * The mage lifecycle: promotion, personality, derived age, the mortality
 * hazard, and death. Re-exported wholesale because `mages/index.ts` is already
 * an explicit list rather than a star, so nothing reaches this surface without
 * having been named once.
 */
export * from './mages/index.js';

/*
 * The rediscovery multiplier is **not** re-exported here, and its absence is
 * deliberate. It used to live in `./rediscovery.js`, and `rules-magic` had a
 * second copy computing the opposite direction; both are gone and the one
 * survivor is `@mm/primitives`' `effectiveRediscoveryMultiplier`. Re-exporting
 * it from this package would offer a second import path for the same function
 * and start the drift over — `contracts.md` §5 rule 3 means `rules-magic`
 * cannot follow that path anyway. Import it from `@mm/primitives`.
 */

// Counted populace: cohorts, occupations, cohort mortality. One re-export
// rather than a named list, so that growing the populace layer touches
// `populace/index.ts` and not this file, which several capabilities share.
export * from './populace/index.js';

export type {
  SpeciesFpTrait,
  SpeciesTraitDescriptor,
  TraitApplication,
  TraitOutputKind,
} from './traits.js';
export {
  SPECIES_FP_TRAITS,
  SPECIES_TRAIT_REGISTRY,
  TRAIT_NEUTRAL,
  advantageOf,
  applySpeciesTrait,
  traitValueOf,
} from './traits.js';
