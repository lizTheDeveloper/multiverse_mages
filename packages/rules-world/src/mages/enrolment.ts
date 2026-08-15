/*
 * Multiverse Mages — who is born able, who is found, and how many fit in a room.
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
 * ## The three-stage pipeline, and why it is three and not one
 *
 * `docs/design/magical-prevalence.md` states it as three quantities and says
 * plainly that **the gap between them is the game**:
 *
 * ```
 * population                                        <- already modelled
 * latent     = population × prevalence[species]      <- content; the species ceiling
 * discovered = latent × mageAptitude[species]        <- "some never get discovered
 *                                                       because their skills are weak"
 * enrolled   = min(discovered, free seats)           <- state; the god's to move
 * ```
 *
 * Before this module there was **one** stage and it was in the wrong place.
 * `populace/demand.ts` asked for exactly `universityCapacity` students — intake
 * was *seats*, not population — and `promotion.ts` then applied `mageAptitude`
 * at **graduation**, so ninety percent of a human intake spent a childhood in a
 * seat and came out as nothing. Aptitude was gating the wrong end of the pipe.
 *
 * So `prevalence` and `mageAptitude` are **not** two spellings of one idea and
 * are not two overlapping gates. They answer different questions — *born able?*
 * and *strong enough to be noticed?* — they multiply, and they are both applied
 * at **enrolment**, where a fraction of a population belongs. Nothing applies a
 * fraction at graduation any more; see `roles.ts` for what decides that instead.
 *
 * ## The two absences, and why they are absences
 *
 * The author gave four of the six species — *"all dragons learn magic, all elves
 * learn magic, few orcs learn magic, one in ten humans"* — and deliberately left
 * **dwarf and gnome unstated**, on the recorded grounds that inventing them
 * *"would put an author's number and a machine's number in the same table with
 * nothing to tell them apart"*.
 *
 * {@link PREVALENCE_WHEN_UNAUTHORED} is therefore the only stand-in in the
 * codebase, it is named so that it is greppable, and it is **not** authored
 * content. `species.json` carries four values and two absences, which is what
 * the design document says it should carry.
 */

import type { SpeciesRecord } from '@mm/content';
import type { Fixed } from '@mm/sim-core';
import { FP_ONE, floorDiv } from '@mm/sim-core';

/**
 * The prevalence used for a species whose record does not author one.
 *
 * **This is not an authored number.** It is the human figure — one in ten —
 * standing in for dwarf and gnome, which `magical-prevalence.md` leaves blank on
 * purpose. It lives here, under a name that says what it is, so that a reader
 * asking *"where did the dwarven prevalence come from?"* gets the honest answer
 * from one grep instead of finding a plausible literal in `species.json` that
 * looks exactly like the four the author gave.
 *
 * The idiom is the repository's own: `grant-budget`'s absent row means
 * unbounded, and the absence carries meaning there for the same reason it does
 * here.
 */
export const PREVALENCE_WHEN_UNAUTHORED: Fixed = 102;

/**
 * The fraction of this species born able to do magic at all.
 *
 * @param species - The content record. An absent `prevalence` yields
 * {@link PREVALENCE_WHEN_UNAUTHORED}, which is a stand-in and not a value the
 * author wrote.
 */
export function prevalenceOf(species: SpeciesRecord): Fixed {
  return species.prevalence ?? PREVALENCE_WHEN_UNAUTHORED;
}

/**
 * The fraction of a matured cohort that reaches a seat: born able **and** found.
 *
 * One product, deliberately, because {@link promoteStudentCohort} takes exactly
 * one draw on the combined remainder. Two multiplications applied in sequence
 * would invite two draws — one per gate — and the draw count is the thing
 * `contracts.md` §1.3's performance contract is actually about. See
 * `promotion.ts`, whose `draws: 1` is asserted rather than commented.
 *
 * Both inputs are fractions of one, so the product is too, and the result never
 * exceeds either factor. It **can** floor to zero for an orc (`51 × 192 / 1024`
 * is 9, not 0) but never does at the shipped numbers; the remainder draw is what
 * keeps a small fraction from truncating a rare species out of existence
 * entirely, which is `promotion.ts`'s own argument.
 */
export function enrolmentFraction(prevalence: Fixed, mageAptitude: Fixed): Fixed {
  assertFraction(prevalence, 'prevalence');
  if (!Number.isInteger(mageAptitude) || mageAptitude <= 0) {
    throw new RangeError(
      `mageAptitude must be a positive fixed-point integer, received ${String(mageAptitude)}`,
    );
  }
  return Math.max(1, floorDiv(prevalence * mageAptitude, FP_ONE));
}

function assertFraction(value: Fixed, role: string): void {
  if (!Number.isInteger(value) || value <= 0 || value > FP_ONE) {
    throw new RangeError(
      `${role} must be a fixed-point fraction in (0, ${String(FP_ONE)}], received ${String(value)}`,
    );
  }
}

/**
 * The human baseline the author named: *"a class of 12 is the practical limit
 * for humans"*.
 */
export const BASE_CLASS_CAPACITY = 12;

/**
 * How many students of one species one university may take in **per tick**.
 *
 * ## Derived from shipped content rather than authored, and that was the point
 *
 * *"Gnomes forget, dwarves remember — so gnomes have smaller classes and are
 * more curious than dwarves, but dwarves have larger class capacity because of
 * their better bookkeeping."* `retention` already says exactly that, on `main`,
 * unprompted: gnome 512, human 1024, dwarf and draconic 1536. So
 * `12 × retention / 1024` gives **dwarf and draconic 18, elf 15, human 12, orc
 * 10, gnome 6** without anybody inventing a seventh column, and
 * `magical-prevalence.md` proposes precisely that derivation.
 *
 * `retention` alone rather than `retention` combined with `scribeAffinity`. The
 * document flags the two as indistinguishable on dwarf and sharply different on
 * draconic, and leaves the choice to the author; `retention` is the narrower
 * reading of *"remember"*, and a combined term would fold *"dwarven books resist
 * burning"* into how many people fit in a lecture hall.
 *
 * ## A rate, not a stock — and the difference matters
 *
 * `UNIVERSITY.capacity` already bounds how many students an institution holds at
 * once. A second concurrent bound would be the same idea twice; what did not
 * exist is a bound on **intake**, and a per-tick intake cap is what makes the
 * spread a difference in *trajectory* rather than a multiplier on a stat. A
 * gnomish academy fills slowly and a dwarven one fills fast, and at equilibrium
 * both are full.
 *
 * ## The golem seam, left open and deliberately not built
 *
 * *"When you have administrative golems — aka AIs — you can manage more students
 * at a time."* That is discoverable technology and a later change: it would
 * arrive as a bonus term folded in here, sourced from a node-driven primitive,
 * exactly the way `build-rate` reaches `advanceConstruction`. There is no
 * `class-capacity` primitive in the registry yet and inventing one to leave
 * unread would be dead content.
 */
export function classCapacityOf(species: SpeciesRecord): number {
  return Math.max(1, floorDiv(BASE_CLASS_CAPACITY * species.retention, FP_ONE));
}
