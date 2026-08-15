/*
 * Multiverse Mages — the enumerations and structural constants of state.
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
 * Every enumerated `uint8` in `docs/design/contracts.md` §1, plus the two
 * structural constants that pin the shape of state.
 *
 * **How the numbers were chosen, since §1 lists most members without numbering
 * them.** The rule applied throughout is *document listing order, zero-based*,
 * with one deliberate exception recorded below. Two of these are already
 * numbered by the document (`EDICT_KIND`, `LOCATION_KIND`, `SIDE`) and are
 * transcribed exactly.
 *
 * The exception is {@link HOLDER_KIND}. Listing order would put `mage` at 0 and
 * `unowned` at 3, which collides with how component storage works: a row is
 * zeroed when it is attached, so a grimoire whose holder was never written
 * would read as *held by mage 0*. Handle 0 is the reserved null (§0), so that
 * is a self-contradictory record which nothing would reject — a book owned by
 * nobody, reported as owned. Putting `unowned` at 0 makes the zero row mean
 * exactly what a zero row is. The same reasoning does **not** apply to
 * {@link SOURCE_KIND}: there, listing order leaves `mage` at 0, and a zeroed
 * combatant row reads as "a mage combatant sourced from handle 0", which is
 * detectably wrong. Had `summon` been 0 it would have read as a *valid* summon,
 * since §1.6 gives summons `sourceId` 0 by design.
 */

/** `contracts.md` §1.1: the two kinds of edict, numbered by the document. */
export const EDICT_KIND = {
  dispensation: 0,
  interdiction: 1,
} as const;

export type EdictKindValue = (typeof EDICT_KIND)[keyof typeof EDICT_KIND];

/**
 * `contracts.md` §1.1: `EDICT_BUDGET_MAX` is a permanent structural constant,
 * distinct from a universe's current `edictBudget`.
 *
 * Raising it is a breaking contract change, because §4.1 sizes the observation
 * vector's ruleset block as `19 + 2 × EDICT_BUDGET_MAX` and every trained policy
 * depends on that width. It is pinned here rather than derived from a tuning
 * value in `god-agency` for exactly that reason.
 */
export const EDICT_BUDGET_MAX = 8;

/** `contracts.md` §1.2: a mage's role. */
export const MAGE_ROLE = {
  researcher: 0,
  warden: 1,
  professor: 2,
  raider: 3,
} as const;

export type MageRoleValue = (typeof MAGE_ROLE)[keyof typeof MAGE_ROLE];

/** `contracts.md` §1.3: what a populace cohort spends its months doing. */
export const OCCUPATION = {
  laborer: 0,
  scribe: 1,
  student: 2,
  soldier: 3,
  idle: 4,
} as const;

export type OccupationValue = (typeof OCCUPATION)[keyof typeof OCCUPATION];

/**
 * `contracts.md` §1.5: where a knowledge instance lives, numbered by the
 * document. `0` is left unassigned, consistent with §0's null convention — an
 * instance with location kind 0 is a malformed record, not a valid one.
 */
export const LOCATION_KIND = {
  mind: 1,
  grimoire: 2,
  library: 3,
  palace: 4,
} as const;

export type LocationKindValue = (typeof LOCATION_KIND)[keyof typeof LOCATION_KIND];

/**
 * `contracts.md` §1.5: who holds a grimoire.
 *
 * `unowned` is 0 rather than last — see this module's opening note. A dead
 * unaffiliated mage's books are genuinely unowned, and that is the state a
 * freshly zeroed row should describe.
 */
export const HOLDER_KIND = {
  unowned: 0,
  mage: 1,
  library: 2,
  inTransit: 3,
} as const;

export type HolderKindValue = (typeof HOLDER_KIND)[keyof typeof HOLDER_KIND];

/** `contracts.md` §1.1: how a run ended. `none` is 0, per §0's null convention. */
export const TERMINAL_REASON = {
  none: 0,
  ascensionApotheosis: 1,
  ascensionCanon: 2,
  stagnation: 3,
  truncated: 4,
} as const;

export type TerminalReasonValue = (typeof TERMINAL_REASON)[keyof typeof TERMINAL_REASON];

/**
 * Which ascension path a universe currently satisfies (`god-agency`).
 *
 * `0` is "none", per §0's null convention, so a zeroed god-state row is a
 * universe that qualifies for nothing — which is what a universe that has never
 * been evaluated is. The two named paths line up with
 * {@link TERMINAL_REASON.ascensionApotheosis} and
 * {@link TERMINAL_REASON.ascensionCanon} deliberately: a declaration records
 * *which* path it was declared on, and `ascensionRateByPath` (§7) is the
 * difference between them.
 */
export const ASCENSION_PATH = {
  none: 0,
  apotheosis: 1,
  canon: 2,
} as const;

export type AscensionPathValue = (typeof ASCENSION_PATH)[keyof typeof ASCENSION_PATH];

/** `contracts.md` §1.1: which axis an entry in `axisChangeCounters` counts. */
export const AXIS_KIND = {
  technique: 0,
  form: 1,
} as const;

export type AxisKindValue = (typeof AXIS_KIND)[keyof typeof AXIS_KIND];

/**
 * What kind of unfinished work a `effort-progress` row is accumulating
 * (`contracts.md` §1.2, "Effort progress").
 *
 * `0` is left unassigned, per §0's null convention: a zeroed row is a malformed
 * record rather than a research project nobody started. The three members are
 * the three operations `rules-magic` takes accumulated progress for, and there
 * is no fourth because there is no fourth such operation — a goal that needs no
 * accrual (`idle`, `affiliate`, `ward-duty`, `raid-readiness`) has no row.
 *
 * **A discriminator is required and not decorative.** A mage who holds a node
 * can be part-way through teaching it *and* part-way through writing it down at
 * the same moment, and those two projects have different costs — `teachCost`
 * against `scribeCost`. Keying an effort on `(subject, nodeId)` alone would let
 * a month at the writing desk finish a student's education.
 */
export const EFFORT_KIND = {
  research: 1,
  teaching: 2,
  scribing: 3,
  /**
   * Reading a written instance back into a mind.
   *
   * Appended, and the id matters for the same reason the others' do: an
   * `effort-progress` row carries this value, so a save written before study
   * existed must keep reading `3` as scribing. Nothing renumbers.
   */
  study: 4,
} as const;

export type EffortKindValue = (typeof EFFORT_KIND)[keyof typeof EFFORT_KIND];

/** `contracts.md` §1.6: what a combatant was made from. */
export const COMBATANT_SOURCE_KIND = {
  mage: 0,
  soldierDetachment: 1,
  summon: 2,
} as const;

export type CombatantSourceKindValue =
  (typeof COMBATANT_SOURCE_KIND)[keyof typeof COMBATANT_SOURCE_KIND];

/** `contracts.md` §1.6: which side of a raid, numbered by the document. */
export const RAID_SIDE = {
  attacker: 0,
  defender: 1,
} as const;

export type RaidSideValue = (typeof RAID_SIDE)[keyof typeof RAID_SIDE];

/**
 * `contracts.md` §1.6: an objective's status.
 *
 * The distinction the document insists on is `looted` versus `destroyed` — a
 * looted library still stands, a burned one does not — so the two are separate
 * members rather than one "taken" flag with a side channel.
 */
export const OBJECTIVE_STATUS = {
  held: 0,
  captured: 1,
  looted: 2,
  destroyed: 3,
} as const;

export type ObjectiveStatusValue = (typeof OBJECTIVE_STATUS)[keyof typeof OBJECTIVE_STATUS];

/**
 * Objective *kinds* are deliberately not enumerated here.
 *
 * §1.6 gives an objective a `kind` field and never says what its values are,
 * and §8 leaves raid content to `raid-engagement`. Inventing a list would fix a
 * design decision this layer has no basis for, in a document that everything
 * else is built against. The field is a `uint8`; `raid-engagement` names it.
 */
export const OBJECTIVE_KIND_UNSPECIFIED = 0;
