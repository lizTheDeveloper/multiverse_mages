/*
 * Multiverse Mages — universities, their libraries, and what both are worth.
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
 * Institutions: the places knowledge is concentrated into, which is what makes
 * them worth raiding.
 *
 * Four rules run through the directory:
 *
 * - **A university is nothing until it is finished** (`construction.ts`).
 *   Effective capacity is decided in one place, so "is this place open" has one
 *   answer.
 * - **Refusal is information** (`capacity.ts`). Truncating admissions and
 *   refusing them admit the same students; only one of them leaves a number
 *   behind.
 * - **A library is what is shelved in it** (`library.ts`). No membership list,
 *   no second instance for a shelved book, and depth counted per tier in a
 *   fixed-size array.
 * - **What a university is good at is never written down** (`profile.ts`).
 *   Vision §13's open question, answered by having no field — which is also
 *   what makes burning a library take the identity with it.
 *
 * Every magnitude here is **untuned**; no release before 0.5.0 may claim
 * otherwise (`docs/design/release-plan.md`).
 */

export type { AdmissionOutcome } from './capacity.js';
export { AdmissionRefusals, admitStudents } from './capacity.js';

export type { ConstructionInput, ConstructionOutcome } from './construction.js';
export {
  BUILD_COMPLETE,
  BUILD_PROGRESS_PER_LABOR_MONTH,
  MATERIALS_PER_LABOR_MONTH,
  advanceConstruction,
  buildRateMultiplier,
  createUniversity,
  effectiveCapacity,
  isComplete,
  readUniversity,
} from './construction.js';

export type { LibraryDepth, TierLookup } from './library.js';
export {
  LIBRARY_UPKEEP_PER_INSTANCE,
  TIER_COUNT,
  libraryDepth,
  libraryUpkeep,
  relevantDepth,
} from './library.js';

export type { CellLookup, ProfileEntry, UniversityProfile } from './profile.js';
export { dominantCell, universityProfile } from './profile.js';

export type { ScribingInput } from './scribing.js';
export { SCRIBE_MONTHS_PER_SCRIBE, scribeRateMultiplier, scribingThroughput } from './scribing.js';
