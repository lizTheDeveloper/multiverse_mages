/*
 * Multiverse Mages — god-agency's public surface: the player's verbs.
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
 * `god-agency`, and why it lives in the coordinating layer.
 *
 * The proposal puts the favor, worship, intervention-dispatch, ascension and
 * prestige subsystems in `packages/rules-world`. They are here instead, and the
 * reason is a shipped conformance test rather than a preference:
 * `rules-world`'s `economy` capability states that *"favor and worship are the
 * god's currency and are owned by `god-agency`; this capability MAY expose the
 * counts worship is computed from but MUST NOT define or compute worship"*, and
 * `economy-three-inputs.test.ts` scans every file under `rules-world/src` for a
 * write to `favor`, `worship`, `worshipTier` or `favorCap` and fails on one.
 *
 * The second reason is structural and would have forced the same move anyway.
 * Granting founding knowledge creates a knowledge instance, which is
 * `@mm/rules-magic`'s, and `contracts.md` §5 rule 3 forbids `rules-world` from
 * importing it. The coordinating layer is the one place that may name both — it
 * exists precisely for interactions of this shape — so the dispatch could not
 * have lived anywhere else without a cycle.
 *
 * Recorded as a deviation in `contracts.md` §5 rather than left implicit.
 *
 * ## No new RNG stream, and that is a claim rather than an omission
 *
 * `contracts.md` §6's registry is append-only and reusing or renumbering an id
 * invalidates every committed balance baseline. `god-agency` adds no id,
 * because **no god action draws**: every intervention is a deterministic
 * function of the state and the submission, worship is a measurement, favor
 * regeneration is arithmetic, and both terminal conditions are predicates. The
 * one place randomness might plausibly have entered — which mage a blessing
 * lands on, which cell an encouragement helps — is the agent's decision rather
 * than the world's, and `agent-api` already has its own generator outside the
 * §6 registry for exactly that.
 *
 * The consequence is worth stating because it is the good one: adding this
 * whole capability re-rolls nothing. Every draw in every existing subsystem
 * lands where it landed before, so the balance baselines taken against
 * `mages-and-species` remain comparable and the difference a sweep sees is the
 * god acting rather than the streams moving.
 */

export type { GodConstants, GodContent, GodCosts } from './constants.js';
export { resolveGodConstants, resolveGodContent, resolveGodCosts } from './constants.js';

export type {
  WorshipClassContribution,
  WorshipSources,
  WorshipTarget,
} from './worship.js';
export {
  edictBudgetFor,
  favorCapFor,
  laggedWorship,
  sat,
  shockedTarget,
  strongestDeclaredShock,
  worshipTarget,
  worshipTierOf,
} from './worship.js';

export type { FavorLedgerEntry, RegenerationOutcome, UpkeepOutcome } from './favor.js';
export {
  applyRegeneration,
  applyStewardship,
  favorRegeneration,
  hysteresisMultiplier,
  inertFraction,
  interventionCost,
  ledgerBalances,
  stewardshipUpkeep,
  upheavalShock,
  worshipShareOfRegeneration,
} from './favor.js';

export type { AxisRef, StewardshipReport } from './stewardship.js';
export { axisCount, axisToLapse, permittedAxes } from './stewardship.js';

export type { GodEffectDeps, GodEffectHooks } from './effects.js';
export { godEffectHooks } from './effects.js';

export type { InterventionDeps, InterventionReport } from './interventions.js';
export { ACTION, emphasisAt, resolveInterventions } from './interventions.js';

export type {
  ApotheosisFacts,
  DeepestByCell,
  EraBoundaryFacts,
  LegacyChannel,
  LegacyGrant,
  PrestigeInputs,
  StagnationInputs,
  StagnationOutcome,
} from './ascension.js';
export {
  LEGACY_CHANNELS,
  apotheosisSatisfied,
  canonSatisfied,
  carriedPrestige,
  deepestNodesByCell,
  eraBoundaryPassed,
  legacyBudget,
  legacyGrant,
  libraryDependence,
  lossAllowance,
  masteredCellCount,
  prestigeEarned,
  qualifyingPath,
  stepStagnation,
} from './ascension.js';

export { godState, writeGodState } from './god-state.js';

export type { GodDeps, GodSimulation, GodTickReport } from './system.js';
export { frozenWhenTerminal, godSystems } from './system.js';
