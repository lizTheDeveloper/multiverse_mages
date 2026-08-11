/*
 * Multiverse Mages — primitive semantics public surface.
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
 * `@mm/primitives` — `docs/design/contracts.md` §3 in code.
 *
 * The registry itself is data and lives in `@mm/content`
 * (`data/primitive.json`, checked against the contract table by
 * `packages/content/test/unit/primitive-contract.test.ts`). This package is the
 * arithmetic that reads it: one implementation of each declared stacking rule,
 * one cap clamp, one place clamps are counted.
 *
 * It sits between `sim-core` and the rules packages because it is the only
 * thing `rules-magic`, `rules-world`, and `rules-raid` must agree on
 * numerically. `contracts.md` §5 does not list it — that is a deliberate
 * deviation, recorded here rather than left implicit: the arithmetic cannot
 * live in `content` (which is dependency-free by mechanical check, and so
 * cannot reach `sim-core`'s single shared `floorDiv`), and duplicating it into
 * each rules package is the exact failure §3 exists to prevent.
 *
 * `rediscovery.ts` is here for the same reason stated the other way round: the
 * effective rediscovery multiplier is a number `rules-magic` and `rules-world`
 * must agree on, §5 rule 3 forbids either importing the other, and they had in
 * fact drifted into computing opposite things. See that module's note.
 */

export type { AblationMask } from './ablation.js';
export {
  NEUTRALIZED_MAGNITUDE,
  NO_ABLATION,
  ablationMaskFor,
  neutralizedMagnitude,
  neutralizing,
} from './ablation.js';

export type {
  AblationConformanceProblem,
  AblationConformanceReport,
  AblationConformanceRow,
} from './conformance.js';
export { ablationConformance } from './conformance.js';

export type { CapContext, CapOutcome } from './caps.js';
export { ClampCounters, applyCap, capLimit } from './caps.js';

export {
  additive,
  additiveIntoMultiplier,
  applyWard,
  maxOf,
  multiplicativeOnRemainder,
  presence,
} from './stacking.js';

export type { StackOptions, StackOutcome } from './stack.js';
export { stackMagnitudes } from './stack.js';

export type { ProbabilityRoll } from './probability.js';
export { rollStackedProbability } from './probability.js';

export type { RediscoveryClampCounter } from './rediscovery.js';
export {
  REDISCOVERY_FLOOR,
  createRediscoveryClampCounter,
  effectiveRediscoveryMultiplier,
  speciesRediscoveryMultiplier,
} from './rediscovery.js';
