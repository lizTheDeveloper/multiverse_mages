/*
 * Multiverse Mages — the mage lifecycle, from promotion to death.
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
 * The whole of a mage's existence as mechanism: promoted out of a student
 * cohort by arithmetic rather than by per-person draws, born with a personality
 * rolled from her species' means, aged by subtraction rather than by a stored
 * counter, killed by a per-tick hazard that a long lifespan cannot round away,
 * and survived by her books but not by her mind.
 *
 * Four rules run through all of it, and each is stated where it applies:
 *
 * - **Only mages are individuals** (`contracts.md` §1.3). Promotion is the one
 *   crossing from the aggregate, and it costs one draw per cohort.
 * - **Age is derived, never stored** (§1.2). So is lifespan variance, and so is
 *   the effect of the `lifespan` primitive.
 * - **Extended precision is mandatory** wherever a per-tick rate comes from a
 *   lifespan (§3). At `fp` scale the naive division makes four of the six
 *   shipped species immortal through their entire youth.
 * - **Randomness is stream-split and keyed on stable identity** (§6). Births and
 *   personalities draw on stream 1, mortality on stream 2, always against an
 *   entity handle.
 */

export { ageInMonths, normalizedAge } from './age.js';

export type { NewMageInput } from './create.js';
export { BASE_MAX_VIGOR, MAGE_VIGOR_TUNING_STATUS, createMage, newMageRecord } from './create.js';

export type { MageDeathOutcome, MageDeathPort } from './death.js';
export { isWorkingMage, killMage } from './death.js';

export type { HazardKnot } from './hazard-table.js';
export { HAZARD_TABLE, HAZARD_TABLE_TUNING_STATUS, hazardAt } from './hazard-table.js';

export type { EffectiveLifespan, EffectiveLifespanInput } from './lifespan.js';
export {
  MIN_EFFECTIVE_LIFESPAN_MONTHS,
  effectiveLifespan,
  lifespanVarianceOffsetMonths,
} from './lifespan.js';

export type { ExtendedRate, HazardInput } from './mortality.js';
export { hazardNumerator, perTickHazard, rollMortality } from './mortality.js';

export type { Personality } from './personality.js';
export {
  PERSONALITY_CEILING,
  PERSONALITY_DEVIATION,
  PERSONALITY_FLOOR,
  PERSONALITY_TUNING_STATUS,
  personalityMeans,
  rollPersonality,
} from './personality.js';

export type { PromotionOutcome } from './promotion.js';
export { maxPromotableCount, promoteStudentCohort } from './promotion.js';

export type { StepRng } from './rng.js';

export {
  DEFAULT_MAGE_ROLE,
  MAGE_ROLE_VALUES,
  assignRole,
  changeAffiliation,
  isMageRole,
} from './roles.js';
