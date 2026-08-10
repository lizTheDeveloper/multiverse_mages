/*
 * Multiverse Mages — the effect application pipeline's public surface.
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
 * Gather, route, stack — in that order, and only that order.
 *
 * ```
 * instances ──gatherEffects──▶ contributions ──stackContributions──▶ outcomes
 *              ▲                                 ▲
 *              │ legality, mastery, location,    │ @mm/primitives owns every
 *              │ and scale are decided here      │ rule, cap and rounding
 * ```
 *
 * The two halves are separate exports rather than one `applyEffects` because
 * they have different callers. `rules-world` stacks a mage's world-scale rates
 * once per tick; `rules-raid` stacks per target per engagement tick and has to
 * interleave `applyWard` between the damage stack and the ward stack. A single
 * fused entry point would have grown a mode flag, and the flag would have
 * decided which arithmetic ran — which is the thing `contracts.md` §3 is trying
 * to stop being a per-call-site judgement.
 *
 * `packages/rules-magic/src/index.ts` is not this file. It belongs to the
 * package as a whole and is written once every task group has landed; until
 * then this directory is imported by path.
 */

export type { EffectContribution, EffectSourceInstance } from './contribution.js';
export {
  CONTRIBUTING_LOCATION_KINDS,
  MASTERY_ACTIVATION_THRESHOLD,
} from './contribution.js';

export type { EffectGatherContext } from './gather.js';
export { gatherEffects } from './gather.js';

export { appliesInMode, primitiveAppliesInMode } from './scale.js';

export type { EffectStackContext } from './stack.js';
export { stackContributions } from './stack.js';

// `requireNode` is deliberately not re-exported here: the instances subsystem
// exports a function of the same name over a different catalog shape, and two
// same-named lookups in one barrel is an ambiguity a caller resolves by guessing.
// The package barrel exposes this one as `requireRegistryNode`.
export { primitiveIndex, requirePrimitive } from './registry-lookup.js';

export type { PrimitiveCoverageEntry, PrimitiveCoverageReport } from './coverage.js';
export {
  PORTAL_HOME_CELL_ID,
  PORTAL_PRIMITIVE_ID,
  PRIMITIVE_COVERAGE_EXCLUSIONS,
  checkPrimitiveCoverage,
  formatPrimitiveCoverageReport,
} from './coverage.js';
