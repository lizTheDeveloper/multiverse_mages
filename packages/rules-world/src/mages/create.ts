/*
 * Multiverse Mages — the component row a newly promoted mage starts life with.
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

import type { EntityHandle, Fixed } from '@mm/sim-core';
import { FP_ONE } from '@mm/sim-core';

import type { ContentId, SpeciesRecord } from '@mm/content';

import type { MageRecord } from '@mm/state';

import type { UniversityHandle } from '../coordination.js';
import type { Personality } from './personality.js';
import { rollPersonality } from './personality.js';
import type { StepRng } from './rng.js';
import { DEFAULT_MAGE_ROLE } from './roles.js';

/**
 * ## Every field of `contracts.md` §1.2, written once
 *
 * A component row is zeroed when it is attached, so a field nobody writes at
 * promotion is not absent — it holds a plausible-looking zero. Two of §1.2's
 * fields make that a real defect rather than a tidiness concern:
 *
 * - **`alive`** would be `0`, meaning the mage is born dead. Loud, and caught
 *   immediately.
 * - **`maxVigor`** would be `0`, meaning the tradition's `cost` hook has nothing
 *   to deduct from. §1.2 says exactly this about the pair: *"the resource a
 *   tradition's `cost` hook deducts from. Without it, `cost` has nothing to
 *   spend and the hook is decorative."* A universe whose `cost` hook silently
 *   costs nothing is not loud at all, and it makes every Vancian and prepaid
 *   tradition indistinguishable from `standard`.
 *
 * So this function writes all ten fields, and the mage layout's field list is
 * the checklist.
 *
 * ## The vigor magnitude is untuned, and it is a placeholder in a stronger sense
 *
 * `contracts.md` says a mage *has* vigor and says nothing about how much, and
 * no content field carries it. {@link BASE_MAX_VIGOR} is therefore a flat
 * starting pool, identical for every species, which is almost certainly not
 * where it ends up: casting cost is `rules-magic`'s and the tradition `cost`
 * hooks are the thing that will have an opinion about the scale. It is here so
 * that the field is non-zero and the hook is not decorative, and it is marked
 * untuned so no release before 0.5.0 can claim it is right.
 */

/** Machine-readable, for the same reason species content carries one. */
export const MAGE_VIGOR_TUNING_STATUS = 'untuned';

/**
 * The vigor pool a mage is promoted with, in fixed point.
 *
 * Species-flat on purpose: `contracts.md` §2.4 gives species eight `fp` traits
 * and none of them is about vigor, and inventing a ninth to differentiate this
 * would be exactly the "species trait that nothing reads, tuned against no
 * measurement" that §2.4 declines `martialAffinity` for.
 */
export const BASE_MAX_VIGOR: Fixed = FP_ONE;

/** What a promotion knows about the mage it is about to create. */
export interface NewMageInput {
  /** The interned species id for the mage's component row. */
  readonly speciesId: ContentId;
  /** The world tick of promotion. Age is derived from this and never stored. */
  readonly birthTick: number;
  /** From {@link rollPersonality}, drawn on stream 1 against the mage's own handle. */
  readonly personality: Personality;
  /**
   * The university she is promoted into, or `0` for unaffiliated.
   *
   * Defaults to unaffiliated. Admission is capacity-gated and belongs to the
   * universities layer, so a mage arriving here with a handle has already been
   * admitted; this function does not decide it.
   */
  readonly universityId?: UniversityHandle;
}

/**
 * A newly promoted mage's component row.
 *
 * The role is {@link DEFAULT_MAGE_ROLE} — researcher — because the
 * `mage-lifecycle` spec says a mage promoted with no god intervention receives
 * one, and because a mage with no role at all would need every role-bias lookup
 * to carry an "unassigned" branch that the god's assign-role action then makes
 * unreachable forever.
 */
export function newMageRecord(input: NewMageInput): MageRecord {
  return {
    speciesId: input.speciesId,
    birthTick: input.birthTick,
    roleId: DEFAULT_MAGE_ROLE,
    universityId: input.universityId ?? 0,
    curiosity: input.personality.curiosity,
    ambition: input.personality.ambition,
    caution: input.personality.caution,
    vigor: BASE_MAX_VIGOR,
    maxVigor: BASE_MAX_VIGOR,
    alive: 1,
  };
}

/**
 * Promotion's whole per-mage half: roll the personality against this mage's own
 * handle, then build her row.
 *
 * Separate from {@link promoteStudentCohort}, which decides *how many* mages a
 * cohort yields, because the two draw from stream 1 against different actor
 * keys — the cohort's handle for the count, each mage's own handle for her
 * personality. Fusing them would force one of the two onto the wrong key, and
 * the wrong key here is not a visible error; it is a correlation between a
 * mage's personality and the size of the cohort she came from.
 */
export function createMage(
  rng: StepRng,
  mage: EntityHandle,
  species: SpeciesRecord,
  speciesId: ContentId,
  birthTick: number,
  universityId: UniversityHandle = 0,
): MageRecord {
  return newMageRecord({
    speciesId,
    birthTick,
    personality: rollPersonality(rng, mage, species),
    universityId,
  });
}
