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

/**
 * `contracts.md` §1.2: a mage's role.
 *
 * ## `populace` is the sixth, and it is the base of the pyramid
 *
 * *"Not all mages are the same or should be created equal. You need low-level
 * spellcasters to stay in the population to continuously cast — identify
 * objects, so they can keep the economy running"* —
 * `docs/design/magical-prevalence.md`, which names **populace mage** as one of
 * the taxonomy's end states and warns that whoever implements it must
 * *"reconcile the two lists deliberately rather than appending"*.
 *
 * The reconciliation, W197: the four standing roles are all *institutional* —
 * they describe what a mage does inside a university, and every one of them is
 * a career academic in the sense the author drew. `populace` is the other half,
 * the graduate who leaves and casts for a living, and there was no role that
 * meant it. `researcher` was doing the job by default, which is why *"my mages
 * are all very advanced"* was not a state the simulation could reach or report.
 *
 * **This is not a failure state.** A universe with no populace mages has nobody
 * doing the small continuous work; the design wants the *shape of the pyramid*
 * managed, not maximised.
 *
 * Like `student` it is **absent from {@link GOD_ASSIGNABLE_MAGE_ROLES}**, and
 * the asymmetry is the design rather than an oversight: graduation sorts mages
 * down into the populace, and the god's action 10 is how he pulls one back out
 * — *"the interesting question becomes who gets to keep going, which is a
 * decision a god makes with limited seats"*. A one-way valve the god opens, at
 * no cost to action 10's candidate space, which every trained policy is sized
 * against.
 *
 * ## `student` is the fifth, and it is not the god's to assign
 *
 * *"Students are immediately mages. They're just student mages until they
 * become battle mages, populace mages"* — `docs/design/magical-prevalence.md`.
 * A student is therefore **a mage in an early role, not a new entity kind**,
 * which is the whole of why she can hold knowledge instances, be taught, read a
 * shelf and be affiliated: she has a handle, and everything that takes a mage
 * handle already works.
 *
 * It is appended rather than inserted, because the numbering is §1.2's listing
 * order and it is read out of a `uint8` in every save.
 *
 * **`student` is deliberately absent from {@link GOD_ASSIGNABLE_MAGE_ROLES}.**
 * The god's assign-role action moves a mage between the four *standing* roles;
 * un-graduating somebody is not one of the levers §7 gives him, and admitting it
 * would also have widened the action-10 candidate space that every trained
 * policy is sized against. Enrolment writes this role and graduation clears it,
 * and those are the only two writers.
 */
export const MAGE_ROLE = {
  researcher: 0,
  warden: 1,
  professor: 2,
  raider: 3,
  /** Enrolled at a university and not yet graduated. Written by enrolment only. */
  student: 4,
  /**
   * Graduated, and casting for a living rather than for an institution. Written
   * by graduation's career sort only; cleared by the god's action 10.
   */
  populace: 5,
} as const;

export type MageRoleValue = (typeof MAGE_ROLE)[keyof typeof MAGE_ROLE];

/**
 * The four roles the god's action 10 may assign, ascending.
 *
 * Exported from `@mm/state` rather than from a rules package because **two
 * independent call sites need the same answer** — `@mm/agent-api`'s candidate
 * enumeration and `@mm/coordination`'s intervention validator — and before the
 * student role existed both wrote `Object.values(MAGE_ROLE)`, which was correct
 * only for as long as every role was assignable. A list that has to be derived
 * the same way in two places is a list that eventually is not.
 *
 * **Still four after W197 added `populace`.** The god may assign a populace mage
 * *into* any of these — that is the "who gets to keep going" lever — but he may
 * not assign `populace` itself, so action 10's candidate space is exactly the
 * width it was before either role was appended.
 */
export const GOD_ASSIGNABLE_MAGE_ROLES: readonly MageRoleValue[] = [
  MAGE_ROLE.researcher,
  MAGE_ROLE.warden,
  MAGE_ROLE.professor,
  MAGE_ROLE.raider,
];

/** Whether the god's assign-role action may write this role. */
export function isGodAssignableRole(value: number): value is MageRoleValue {
  return GOD_ASSIGNABLE_MAGE_ROLES.includes(value as MageRoleValue);
}

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
 * What a ruleset change was made *to* (`docs/design/raid-engagement.md` §1).
 *
 * The three scopes a god can change legality at, which are exactly the three
 * §4.2 already has actions for: a technique's row, a form's column, and one
 * cell through an edict. `0` is unassigned, per §0's null convention — a zeroed
 * row is a malformed record rather than a change to nothing.
 */
export const RULE_SCOPE = {
  technique: 1,
  form: 2,
  cell: 3,
} as const;

export type RuleScopeValue = (typeof RULE_SCOPE)[keyof typeof RULE_SCOPE];

/**
 * Which direction a ruleset change moved legality.
 *
 * Named by what it did rather than by which action did it, because the same
 * direction is reached by two different §4.2 actions depending on scope —
 * forbidding a cell is an interdiction, forbidding a technique is action 2 —
 * and the lock, and the revert surcharge after it, care only about the
 * direction.
 */
export const RULE_CHANGE_KIND = {
  /** Made something illegal that was legal. */
  forbid: 1,
  /** Made something legal that was illegal. */
  permit: 2,
} as const;

export type RuleChangeKindValue = (typeof RULE_CHANGE_KIND)[keyof typeof RULE_CHANGE_KIND];

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
