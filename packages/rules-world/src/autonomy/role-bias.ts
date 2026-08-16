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
 * else."* `mages-and-species/design.md` rejects role-as-filter twice: it makes
 * the god a general, and a universe of assigned researchers with nobody willing
 * to teach starves its next generation, micromanagement the only recourse.
 *
 * An unbounded bias reintroduces the filter by the back door — `fp(100000)`
 * masks nothing and forces everything, arriving as a tuning edit rather than a
 * reviewed design decision. So the bound is {@link ROLE_BIAS_MAX}, checked in
 * CI: **every entry's magnitude is strictly less than the sum of the other five
 * terms' extremes**, so any combination of species, personality, age and
 * opportunity can outvote any role. That is "biases but never dictates" as a
 * number.
 *
 * `role-bias.test.ts` reads {@link ROLE_BIAS_MAX} against `terms.ts`'s bounds,
 * so raising one without the other fails rather than quietly widening the god's
 * authority.
 *
 * ## Every magnitude here is untuned
 *
 * No balance harness before 0.5.0 (`docs/design/release-plan.md`). These rows
 * encode an *ordering* — researcher prefers research, professor prefers
 * teaching — and claim nothing about being right.
 *
 * ## `idle` carries no bias from any role
 *
 * `idle` is the score floor and the guarantee the argmax is total. A role that
 * made idling attractive could produce a mage who does nothing on purpose; one
 * that made it *un*attractive would push the floor above zero and give the
 * clamp something to do. Both fail silently; the zero row does not.
 */

/** Mirrors `@mm/content`'s `TuningStatus` without importing a type for a constant. */
export const ROLE_BIAS_TUNING_STATUS = 'untuned';

/**
 * The largest magnitude any role bias entry may have, in fixed point.
 *
 * A *validated* bound, not a clamp on lookups. Clamping would let an
 * out-of-range entry sit in the table looking authored while behaving as
 * something else; the test rejects it instead, and names it.
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
    [GOAL.applyMagic]: 0,
    ...entries,
  };
}

/**
 * What each standing role makes more and less appealing. **Untuned.**
 *
 * Read the rows as dispositions rather than duties:
 *
 * - **researcher** leans on both kinds of self-directed work, away from
 *   standing watch. The default role, so this row is what an un-intervened
 *   universe behaves like.
 * - **warden** alone raises `ward-duty`, and raises `scribe` too: guarding a
 *   library and copying its contents are one instinct about one asset.
 * - **professor** raises `teach` most, `seek-teaching` second — a professor out
 *   of things to teach goes and learns some.
 * - **raider** raises `raid-readiness` and alone leans negative on `scribe`.
 *   Somebody has to be unwilling to sit still, or nobody goes through a portal.
 *
 * `apply-magic` is the ninth goal and **no role is for it** — a statement, not
 * an omission. The god's four roles are all about knowledge; the one leaning
 * toward applied work is the warden, because standing watch and turning a
 * hillside into a quarry are one instinct about using what the academy has
 * rather than adding to it. The professor leans hardest away: her month is
 * worth more in a classroom.
 */
export const ROLE_BIAS: Readonly<Record<MageRoleValue, RoleBiasRow>> = {
  [MAGE_ROLE.researcher]: row({
    [GOAL.researchNode]: 320,
    [GOAL.rediscoverNode]: 256,
    [GOAL.seekTeaching]: 64,
    [GOAL.wardDuty]: -128,
    [GOAL.applyMagic]: -64,
  }),
  [MAGE_ROLE.warden]: row({
    [GOAL.wardDuty]: 384,
    [GOAL.scribe]: 128,
    [GOAL.researchNode]: -64,
    [GOAL.raidReadiness]: 64,
    [GOAL.applyMagic]: 128,
  }),
  [MAGE_ROLE.professor]: row({
    [GOAL.teach]: 384,
    [GOAL.seekTeaching]: 192,
    [GOAL.scribe]: 128,
    [GOAL.raidReadiness]: -128,
    [GOAL.applyMagic]: -128,
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
 * `uint8` stores 7 happily, and returning zero for it would turn a corrupt role
 * into a mage with no dispositions — which reads in the histogram as an
 * unremarkable researcher.
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
