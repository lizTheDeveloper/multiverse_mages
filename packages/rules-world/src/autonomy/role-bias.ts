/*
 * Multiverse Mages — the role bias table, as data, bounded so a role can never
 * become an order.
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

import type { Fixed } from '@mm/sim-core';
import type { MageRoleValue } from '@mm/state';
import { MAGE_ROLE } from '@mm/state';

import type { GoalId } from './goals.js';
import { GOAL } from './goals.js';

/**
 * ## The bound is the design pillar, expressed as arithmetic
 *
 * `docs/design/vision.md` §7: *"You set the role; they decide everything
 * else."* `mages-and-species/design.md` rejects role-as-filter twice over — it
 * makes the god a general, and a universe of assigned researchers with nobody
 * willing to teach starves its own next generation with micromanagement as the
 * only recourse.
 *
 * A bias term with no bound reintroduces the filter by the back door. An entry
 * of `fp(100000)` masks nothing and forces everything, and it would arrive as a
 * tuning edit rather than as a design decision anyone reviewed. So the bound is
 * {@link ROLE_BIAS_MAX} and it is checked in CI: **every entry's magnitude is
 * strictly less than the sum of the other five terms' extremes**, so any
 * combination of species, personality, age and opportunity can outvote any
 * role. That is what "biases but never dictates" means when written down as a
 * number.
 *
 * The check lives in `role-bias.test.ts` and reads {@link ROLE_BIAS_MAX}
 * against the term bounds in `terms.ts`, so raising one without the other fails
 * rather than quietly widening the god's authority.
 *
 * ## Every magnitude here is untuned
 *
 * There is no balance harness before 0.5.0 (`docs/design/release-plan.md`).
 * These rows encode an *ordering* — a researcher prefers research, a professor
 * prefers teaching — and claim nothing about being right.
 *
 * ## `idle` carries no bias from any role
 *
 * `idle` is the score floor and the guarantee that the argmax is total. A role
 * that made idling attractive would be a role that can produce a mage who does
 * nothing on purpose, and a role that made it *un*attractive would push the
 * floor above zero and give the clamp something to do. Both are silent; the
 * zero row is neither.
 */

/** Mirrors `@mm/content`'s `TuningStatus` without importing a type for a constant. */
export const ROLE_BIAS_TUNING_STATUS = 'untuned';

/**
 * The largest magnitude any role bias entry may have, in fixed point.
 *
 * Not a clamp applied to lookups — a *validated* bound. Clamping would let an
 * out-of-range entry sit in the table looking authored while behaving as
 * something else; the test rejects the entry instead, and names it.
 */
export const ROLE_BIAS_MAX: Fixed = 384;

/** A bias per goal, for one role. */
export type RoleBiasRow = Readonly<Record<GoalId, Fixed>>;

function row(entries: Partial<Record<GoalId, Fixed>>): RoleBiasRow {
  return {
    [GOAL.idle]: 0,
    [GOAL.researchNode]: 0,
    [GOAL.rediscoverNode]: 0,
    [GOAL.seekTeaching]: 0,
    [GOAL.teach]: 0,
    [GOAL.scribe]: 0,
    [GOAL.affiliate]: 0,
    [GOAL.wardDuty]: 0,
    [GOAL.raidReadiness]: 0,
    ...entries,
  };
}

/**
 * What each standing role makes more and less appealing. **Untuned.**
 *
 * Read the rows as dispositions rather than duties:
 *
 * - **researcher** leans on both kinds of self-directed work and away from
 *   standing watch. It is the default role, so this row is what an
 *   un-intervened universe behaves like.
 * - **warden** is the only row that raises `ward-duty`, and it raises `scribe`
 *   too: guarding a library and copying its contents are the same instinct
 *   about the same asset.
 * - **professor** raises `teach` most and `seek-teaching` second — a professor
 *   who has run out of things to teach goes and learns some.
 * - **raider** raises `raid-readiness` and, alone among the rows, leans
 *   negative on `scribe`. Somebody has to be unwilling to sit still, or the
 *   universe has no one to send through a portal.
 */
export const ROLE_BIAS: Readonly<Record<MageRoleValue, RoleBiasRow>> = {
  [MAGE_ROLE.researcher]: row({
    [GOAL.researchNode]: 320,
    [GOAL.rediscoverNode]: 256,
    [GOAL.seekTeaching]: 64,
    [GOAL.wardDuty]: -128,
  }),
  [MAGE_ROLE.warden]: row({
    [GOAL.wardDuty]: 384,
    [GOAL.scribe]: 128,
    [GOAL.researchNode]: -64,
    [GOAL.raidReadiness]: 64,
  }),
  [MAGE_ROLE.professor]: row({
    [GOAL.teach]: 384,
    [GOAL.seekTeaching]: 192,
    [GOAL.scribe]: 128,
    [GOAL.raidReadiness]: -128,
  }),
  [MAGE_ROLE.raider]: row({
    [GOAL.raidReadiness]: 384,
    [GOAL.wardDuty]: 128,
    [GOAL.scribe]: -128,
    [GOAL.teach]: -64,
  }),
};

/**
 * The bias one role gives one goal.
 *
 * @throws RangeError on a role outside `contracts.md` §1.2's enumeration. A
 * `uint8` field stores 7 happily, and a lookup that returned zero for it would
 * turn a corrupt role into a mage with no dispositions at all — which reads in
 * the histogram as an unremarkable researcher.
 */
export function roleBiasFor(roleId: MageRoleValue, goal: GoalId): Fixed {
  const biases = ROLE_BIAS[roleId];
  if (biases === undefined) {
    throw new RangeError(
      `${String(roleId)} is not a mage role; contracts.md §1.2 enumerates researcher, warden, ` +
        'professor and raider',
    );
  }
  return biases[goal];
}
