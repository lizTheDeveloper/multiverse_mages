/*
 * Multiverse Mages — what kind of mage a graduate becomes.
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
 * ## What `mageAptitude` is for
 *
 * The trait spent its whole life gating *whether* somebody became a mage — first
 * at graduation, then (W193) at enrolment, multiplied into `prevalence`. Both
 * were the wrong job, and the second was the same job twice: two gates deciding
 * one thing, so that raising the count meant fighting a trait whose name says
 * nothing about counts.
 *
 * The owner's design, recorded 2026-08-14:
 *
 * > *"The mage aptitude was really just supposed to be like the very best mages
 * > become battle mages and professors, and mages that are only okay just go and
 * > participate in the economy. And that is the difference between the career
 * > academic and someone who graduated college. The point of the mage aptitude
 * > was to create **something for the other half of people to do**, and also to
 * > give an uncertainty feel to some of the mage careers as you get better."*
 *
 * So the three dials divide cleanly and none of them overlaps another:
 *
 * | dial | job |
 * | --- | --- |
 * | `prevalence` (species content) | **how many** mages exist |
 * | seats × universities | **who** gets educated |
 * | `mageAptitude` (species content) | **what kind** of mage a graduate becomes |
 *
 * Nothing here can make a mage not exist. A student who is magical and educated
 * graduates; this module only decides what she graduates *into*.
 *
 * ## The economy caster is the wanted outcome, not the failure state
 *
 * `magical-prevalence.md`, from the same conversation: *"You need low-level
 * spellcasters to stay in the population to continuously cast — identify
 * objects, so they can keep the economy running."* A universe whose graduates
 * are all researchers has nobody doing the small continuous work, and *"my mages
 * are all very advanced"* is meant to be as legible a failure as *"my mages are
 * all novices"*.
 *
 * That is why {@link MAGE_ROLE.populace} is a role and not an absence, why it
 * has its own `ROLE_BIAS` row leaning on `GOAL.applyMagic`, and why it defends a
 * portal exactly as the four standing roles do. A populace mage is employed, not
 * discarded.
 *
 * ## The distribution, and why it never reaches certainty
 *
 * ```
 * chance = midpoint + (aptitude - midpoint) / 2   +  schooling nudge
 *        = (aptitude + FP_ONE/2) / 2              +  schooling nudge
 * ```
 *
 * **The species' aptitude, pulled halfway toward a coin flip.** One shape, two
 * properties, and both were asked for:
 *
 * - *"Something for the other half of people to do."* Human aptitude is `512` —
 *   exactly the fixed-point half, and the species the author calls the baseline
 *   — and it maps to exactly `512`. Half of human graduates join the populace.
 *   That is the sentence, arithmetically.
 * - *"An uncertainty feel to some of the mage careers as you get better."* The
 *   pull toward the midpoint means **no aptitude reaches certainty in either
 *   direction**: at the shipped content the band is `352` (orc) to `704`
 *   (draconic), so roughly a third of dragons join the populace and a third of
 *   orcs do not. A high-aptitude mage is *not guaranteed* the academic track,
 *   which is the property the owner named and which a bare `draw < aptitude`
 *   would not have.
 *
 * Be precise about what "uncertainty" means here, because the arithmetic will
 * not support the other reading: this is a Bernoulli indicator, so its variance
 * `p(1-p)` is **greatest in the middle of the band and least at its ends** — it
 * does not grow monotonically with aptitude. What grows with a mage's standing
 * is the *stake*: a graduate whose species says she should be an academic has an
 * outcome that can still surprise, and {@link ACADEMIC_SCHOOLING_NUDGE} makes
 * two graduates of the same species differ by what they were actually taught.
 * Read "uncertainty as you get better" as *the outcome you were counting on is
 * never assured*, which is what the ceiling delivers.
 *
 * ## Every constant here is a placeholder awaiting the balance harness
 *
 * `magical-prevalence.md` warns in its own voice that *"writing a plausible
 * formula into code is how a placeholder becomes a balance constant nobody
 * remembers inventing"*. So: {@link ACADEMIC_CHANCE_PULL},
 * {@link ACADEMIC_SCHOOLING_NUDGE} and {@link SCHOOLING_FULL_MARKS} are the
 * author's to set, they are named rather than inline, and
 * {@link CAREER_TUNING_STATUS} says out loud that nobody has tuned them. The
 * *shape* — a band that excludes certainty at both ends, anchored so that the
 * baseline species splits in half — is the part traceable to the owner's words.
 */

import type { EntityHandle, Fixed } from '@mm/sim-core';
import { FP_ONE, RNG_STREAM, floorDiv, nextBounded } from '@mm/sim-core';
import type { MageRoleValue } from '@mm/state';
import { MAGE_ROLE } from '@mm/state';

import type { StepRng } from './rng.js';

/** Announces that the numbers below have never been through the balance harness. */
export const CAREER_TUNING_STATUS = 'untuned' as const;

/**
 * The coin flip the band is anchored on: `FP_ONE / 2`.
 *
 * Not a tuning knob. It is the fixed-point half, and the anchor is load-bearing
 * only because human `mageAptitude` is also exactly `1024 / 2` — which is what
 * makes *"the other half of people"* an arithmetic property of the shipped
 * content rather than a coincidence that a later edit could quietly break.
 */
export const ACADEMIC_CHANCE_MIDPOINT: Fixed = FP_ONE / 2;

/**
 * How much of the distance from the midpoint an aptitude actually keeps, in
 * fixed point. `512` is half.
 *
 * **This is the knob that forbids certainty.** At `FP_ONE` the chance would be
 * the raw aptitude, and a species at aptitude `1024` — *"all dragons learn
 * magic"* is prevalence, but nothing stops a later species reaching the aptitude
 * ceiling — would take the academic track every time, which is exactly the
 * guarantee the owner asked not to exist. At `0` aptitude would stop mattering
 * and every species would split evenly.
 */
export const ACADEMIC_CHANCE_PULL: Fixed = 512;

/**
 * How many nodes a graduate must hold for her schooling to count for full
 * marks.
 *
 * A count of held nodes rather than any measure of depth or mastery, because it
 * is the only progression quantity that exists at graduation on this ref —
 * `w196/mastery-rises` is the branch making mastery move at all, and reading a
 * quantity nothing raises would be a term pinned at its floor.
 *
 * ## `24` is measured, not chosen, and here is the measurement
 *
 * Instrumented over the reference universe, 1,200 ticks, on
 * `w197/aptitude-sorts-careers` at `652db99` (2026-08-14), **after** the same
 * branch stopped applying `prevalence` twice:
 *
 * | seed | graduations | min | median | p75 | max |
 * | --- | ---: | ---: | ---: | ---: | ---: |
 * | 589825 | 110 | 6 | 6 | 24 | 42 |
 * | 1234567 | 163 | 6 | 23 | 29 | 43 |
 *
 * The first value tried was `8`, measured before that fix, and it was wrong for
 * a reason worth writing down — at full marks of 8, fifty of sixty-three
 * graduates saturated the term, so a knob meant to differentiate shallow schools
 * from deep ones was instead a **constant `+128` on almost everybody**. A term
 * pinned at its ceiling is the same defect as one pinned at its floor, and it is
 * harder to see because the numbers all move.
 *
 * At `24` the neutral point is 12 nodes, which sits inside the observed spread
 * on both seeds: the shallowest quartile takes `-64`, a mid-depth graduate takes
 * roughly `0`, and only the deep tail reaches `+128`. That is the term doing the
 * job it was added for.
 *
 * **Re-measure this if graduation changes.** It is a statement about one ref and
 * two seeds, and `w196/mastery-rises` and #170's reading edge both change what a
 * student comes out holding.
 */
export const SCHOOLING_FULL_MARKS = 24;

/**
 * The most a graduate's schooling can move her career chance, in fixed point,
 * in **either** direction.
 *
 * ## Symmetric on purpose, around half of {@link SCHOOLING_FULL_MARKS}
 *
 * A graduate holding `SCHOOLING_FULL_MARKS / 2` nodes gets no adjustment, one
 * holding none gets `-ACADEMIC_SCHOOLING_NUDGE`, one holding full marks gets
 * `+ACADEMIC_SCHOOLING_NUDGE`. A one-sided bonus would have raised the academic
 * share of *every* species by an amount nobody chose, folding a tuning decision
 * into a term that was supposed to be about differentiation.
 *
 * ## What it buys
 *
 * *"University depth becomes the thing that matters, not just capacity"*
 * (`magical-prevalence.md`). Two graduates of one species now differ by what
 * their institution could actually teach them, so a god who funds a deeper
 * school gets more academics out of it and a shallow one keeps producing the
 * base of the pyramid. It is also the sharpest available reading of *"as you get
 * better"*: what a mage learned, not what her species is.
 */
export const ACADEMIC_SCHOOLING_NUDGE: Fixed = 128;

/**
 * Hard bounds on the resulting chance, applied after every term.
 *
 * Belt and braces over {@link ACADEMIC_CHANCE_PULL}: the pull already keeps the
 * band away from `0` and `FP_ONE` at every aptitude the schema permits, and
 * these exist so that a later term — a golem bonus, a god edict, a tradition
 * hook — cannot reach certainty by accident. A clamp that never binds is the
 * intended state; a test asserts the shipped content does not reach it.
 */
export const ACADEMIC_CHANCE_FLOOR: Fixed = 64;
/** @see ACADEMIC_CHANCE_FLOOR */
export const ACADEMIC_CHANCE_CEILING: Fixed = 960;

/** The role a graduate who cleared the draw takes. */
export const ACADEMIC_CAREER_ROLE: MageRoleValue = MAGE_ROLE.researcher;

/**
 * The role a graduate who did not takes.
 *
 * **Researcher is the academic outcome, not professor or raider**, and the
 * distinction matters more than it looks. The owner named *"battle mages and
 * professors"* as the top of the pyramid, but all four standing roles are
 * institutional and `researcher` is the one that carries `GOAL.researchNode`;
 * sorting the best graduates straight into professor or raider would empty the
 * population that discovers anything and would be a far larger balance move than
 * the one being made. So this module sorts **academic versus economy**, and
 * *which* academic — professor, warden, raider — stays the god's action 10.
 * That is what complementing the existing role lever looks like rather than
 * fighting it.
 */
export const POPULACE_CAREER_ROLE: MageRoleValue = MAGE_ROLE.populace;

/** One graduate's career sort, with the arithmetic left inspectable. */
export interface CareerOutcome {
  /** The role to write. {@link ACADEMIC_CAREER_ROLE} or {@link POPULACE_CAREER_ROLE}. */
  readonly role: MageRoleValue;
  /** Whether the draw put her on the academic track. */
  readonly academic: boolean;
  /** The fixed-point chance the draw was compared against, in `[0, FP_ONE)`. */
  readonly chance: Fixed;
  /** The draw itself, in `[0, FP_ONE)`. */
  readonly draw: Fixed;
  /**
   * Draws taken on the career stream by this call. Always exactly 1.
   *
   * A returned field rather than a comment, for `promotion.ts`'s reason: the
   * claim that a graduating class of a hundred costs a hundred draws and not a
   * hundred squared is one a test can read, and a comment is not.
   */
  readonly draws: number;
}

/**
 * How much of this graduate's schooling counts, in `[-nudge, +nudge]`.
 *
 * Integer arithmetic throughout: `nodesHeld` is a count, and the doubling before
 * the division is what keeps the neutral point at exactly half of
 * {@link SCHOOLING_FULL_MARKS} without a rounding step that would bias one way.
 */
export function schoolingNudge(nodesHeld: number): Fixed {
  if (!Number.isInteger(nodesHeld) || nodesHeld < 0) {
    throw new RangeError(
      `nodesHeld must be a non-negative integer, received ${String(nodesHeld)}`,
    );
  }
  const marks = Math.min(nodesHeld, SCHOOLING_FULL_MARKS);
  return floorDiv(ACADEMIC_SCHOOLING_NUDGE * (2 * marks - SCHOOLING_FULL_MARKS), SCHOOLING_FULL_MARKS);
}

/**
 * The chance this graduate takes the academic track, in fixed point.
 *
 * @param mageAptitude - The species' trait. A fraction of one, and the whole of
 * what it now does.
 * @param nodesHeld - What she came out of school actually holding.
 * @throws RangeError if `mageAptitude` is outside `(0, FP_ONE]`. A trait outside
 * that range means a content mistake, and the clamp below would hide it behind a
 * plausible number.
 */
export function academicChance(mageAptitude: Fixed, nodesHeld: number): Fixed {
  if (!Number.isInteger(mageAptitude) || mageAptitude <= 0 || mageAptitude > FP_ONE) {
    throw new RangeError(
      `mageAptitude must be a fixed-point fraction in (0, ${String(FP_ONE)}], received ` +
        String(mageAptitude),
    );
  }
  const pulled =
    ACADEMIC_CHANCE_MIDPOINT +
    floorDiv(ACADEMIC_CHANCE_PULL * (mageAptitude - ACADEMIC_CHANCE_MIDPOINT), FP_ONE);
  const withSchooling = pulled + schoolingNudge(nodesHeld);
  return Math.min(ACADEMIC_CHANCE_CEILING, Math.max(ACADEMIC_CHANCE_FLOOR, withSchooling));
}

/**
 * Sorts one graduate into a career. **One draw, on her own actor stream.**
 *
 * ## Why per-graduate and not per-cohort
 *
 * `promotion.ts` takes one draw per *cohort* because its subjects are counted
 * populace members and `contracts.md` §1.3 forbids simulating them individually.
 * A graduate is not one of those: she is already an entity with a handle, the
 * mortality and autonomy subsystems already draw for her by name, and a
 * per-cohort draw here would give every graduate in a tick the same career —
 * deleting exactly the uncertainty this function exists to add. The cost is
 * `O(graduates)`, which is bounded by seats.
 *
 * @param mage - Her **entity handle**, used as the actor key. Never a loop index
 * or a position in the student list: §6 requires a stable identity, and a
 * positional key means one extra graduate re-rolls the career of every graduate
 * behind her.
 */
export function sortGraduateCareer(
  rng: StepRng,
  mage: EntityHandle,
  mageAptitude: Fixed,
  nodesHeld: number,
): CareerOutcome {
  const chance = academicChance(mageAptitude, nodesHeld);
  const draw = nextBounded(rng.actorStream(RNG_STREAM.career, mage), FP_ONE);
  const academic = draw < chance;
  return {
    role: academic ? ACADEMIC_CAREER_ROLE : POPULACE_CAREER_ROLE,
    academic,
    chance,
    draw,
    draws: 1,
  };
}
