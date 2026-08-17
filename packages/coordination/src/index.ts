/*
 * Multiverse Mages — coordinating layer public surface.
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
 * `@mm/coordination` — the world step loop, and the adapter that lets world
 * rules reach knowledge rules without a cycle.
 *
 * ## Why this package exists, when §5 did not list it
 *
 * `contracts.md` §5 rule 3: where `rules-magic` and `rules-world` interact,
 * *"the interaction lives in a coordinating layer, not in a cycle"*. §5's list
 * offered two candidates, and neither fits a **world** loop:
 *
 * - **`rules-raid`** may import both, and the module-boundaries test names it as
 *   the example — but §5 defines it as *"engagement space, combat, objectives,
 *   consequences"*, none of which is a world tick. The loop there would make
 *   every consumer that never raids — the headless Monte Carlo worker, a
 *   single-player client between portals — load the engagement package to
 *   advance a month, and hand 0.4.0's central loop to `raid-engagement`, a
 *   capability that has not started. It also inverts §0's clock: an engagement
 *   *freezes* world time, so the raid layer pauses the world loop, and a module
 *   cannot cleanly be both paused and pausing.
 * - **`agent-api`** may import every `rules-*` package and holds §4's
 *   observation. Ruled out by §5 rule 4 from the other side: rules packages
 *   never import `agent-api`, so `rules-raid` could not reach a loop living
 *   there when a raid writes consequences back into world state. The observation
 *   layer must not become an input to the rules it observes.
 *
 * So the coordinating layer gets its own package, named for the role §5 rule 3
 * gives it, above both rules packages and below `agent-api`. The **third
 * deviation from §5 as originally drawn**, after `state` and `primitives`,
 * recorded beside them for the same reason: §5 was written before anyone tried
 * to satisfy it.
 *
 * ## What is here
 *
 * - {@link CoordinatingKnowledgeGateway} — `rules-world`'s knowledge port,
 *   implemented over `rules-magic`. The only file in the repository that names
 *   both packages.
 * - {@link cellNodeIndex} — `cellOf` inverted, so the frontier scan is bounded
 *   by what the ruleset permits rather than by a range of interned ids.
 * - {@link EffortLedger} — where partial research, teaching and scribing live
 *   between two ticks, so that progress outlives a goal switch.
 * - {@link buildOutlook} — one mage's situation, assembled from both halves.
 * - {@link worldSystem} / {@link defineWorldSimulation} — the tick itself, as a
 *   `System`, so the pure `step(state, actions, rng) -> state` stays
 *   `@mm/sim-core`'s rather than being reimplemented here.
 */

export type { LibraryCapital, LibraryCapitalDeps } from './capital.js';
export { libraryCapital } from './capital.js';

export type { ActiveHooks, TraditionHooks, TraditionResolver } from './traditions.js';

export type { EffortKey, EffortRow } from './effort-store.js';
export { EffortLedger, MAX_EFFORTS_PER_MAGE } from './effort-store.js';

export type { CellNodeIndex } from './frontier-index.js';
export { cellNodeIndex } from './frontier-index.js';

export type {
  CompletedEffort,
  GatewayDeps,
  LivingMage,
  MageRates,
  MaterialsAccess,
} from './gateway.js';
export {
  CoordinatingKnowledgeGateway,
  MAX_TEACHING_COUNTERPARTIES,
  effortKey,
  isHeldAtMind,
} from './gateway.js';

export type { EnvelopeResolver } from './envelopes.js';
export { envelopeResolver } from './envelopes.js';

export type { NodeFacetResolver, NodeFacets } from './node-facets.js';
export { UNKNOWN_NODE_FACETS, nodeFacetsFrom } from './node-facets.js';

export type { OutlookDeps } from './outlook.js';
export { buildOutlook, universityPreference } from './outlook.js';

export type { AdmissionOptions, StudentAdmissions, StudentRefusal } from './admissions.js';
export { admitStudentBodies } from './admissions.js';

/**
 * `god-agency` — the player's verbs, and the loop that pays for them.
 *
 * Re-exported wholesale: `god/index.ts` is already an explicit list rather than
 * a star, and carries the argument for why the capability lives here rather
 * than in `rules-world`.
 */
export * from './god/index.js';

/**
 * `@mm/primitives`' ablation mask, re-exported.
 *
 * `WorldStepDeps.ablation` is a field of this package's interface, and
 * `contracts.md` §5 grants `scenario` an edge to `coordination` and none to
 * `primitives`. Without this, a composition root — or the causal-chain test
 * proving a world-scale primitive can be ablated at all — could name the field
 * and not construct a value for it: a configuration surface with a hole in it.
 *
 * Re-exported, not reimplemented, so exactly one definition of neutralizing a
 * primitive survives. `ablation.ts` owns the rule; this is a door into it for
 * the packages §5 puts on the far side of the wall.
 */
export type { AblationMask } from '@mm/primitives';
export { NO_ABLATION, ablationMaskFor, neutralizing } from '@mm/primitives';

export type {
  AppliedNodeYield,
  UniverseEconomyBonuses,
  UniverseEconomyDeps,
  UniverseEffectIndex,
} from './universe-effects.js';
export {
  NO_ECONOMY_BONUSES,
  summedYield,
  universeEconomyBonuses,
  universeEffectIndex,
} from './universe-effects.js';

export type {
  AcademicEffectIndex,
  AcademicRateBonuses,
  AcademicRateDeps,
} from './academic-effects.js';
export { NO_ACADEMIC_BONUSES, academicRateBonuses, academicEffectIndex } from './academic-effects.js';
export type {
  VitalityBonuses,
  VitalityDeps,
  VitalityIndex,
} from './knowledge-vitality.js';
export {
  NO_VITALITY_BONUSES,
  lifespanBonusesFor,
  vitalityBonuses,
  vitalityIndex,
} from './knowledge-vitality.js';

export type {
  ClaimantFlow,
  WorldSimulation,
  WorldStepDeps,
  WorldStepReport,
} from './world-step.js';
export { defineWorldSimulation, worldSystem } from './world-step.js';
/**
 * The scribing queue the world loop asks the populace for — §5's written record,
 * as a count of what has not been written yet.
 *
 * Exported for one reason: `agent-api`'s `knowledgeCensus` reports the identical
 * figure as `unwrittenNodeIds.length`, and the rules path may not import a §4.4
 * diagnostic to get it. Two implementations of one definition need a test that
 * they agree, and that test needs to be able to call this one.
 */
export { unwrittenNodeCount } from './world-step.js';
