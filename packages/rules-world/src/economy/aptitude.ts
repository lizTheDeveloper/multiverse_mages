/*
 * Multiverse Mages — what a species is good at digging up, derived from what its
 * magic is about.
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
 * ## "Dwarves are good at digging" meant "dwarves are good at *learning about*
 * digging"
 *
 * `species.json` gives the dwarf `terram: 1536` and the orc `terram: 1280`, and
 * vision §6 counts *"technique/form affinities"* among the seven traits a
 * species is tuned on. Measured on `integration/all-branches` @ `4621db1a`:
 * **every consumer of `affinities` is in the research-targeting path**
 * (`autonomy/target-appeal.ts`), and there is not one under `economy/` or
 * `universities/`. So a dwarven affinity for earth biased which node a dwarf
 * chose to *study* and moved not one unit of what she *produced*. The author's
 * sentence — *"Dwarves are more likely to be good at digging stuff up out of the
 * ground"* — was true of the library and false of the quarry.
 *
 * ## The mapping already existed, in `form.json`
 *
 * A species affinity is keyed on a **form**; production is denominated in
 * **material kinds**. The table that converts one to the other is
 * `yieldWeights`, which is exactly what `routeYieldByForm` uses to decide that a
 * Terram working yields stone. So a species' aptitude for a *kind* is its
 * affinity for the forms that make that kind, weighted by how much of that kind
 * each form makes:
 *
 *     aptitude[kind] = Σ_forms (yieldWeights[form][kind] × affinity[form])
 *                      ------------------------------------------------
 *                            Σ_forms  yieldWeights[form][kind]
 *
 * with a missing affinity reading `fp(1)`, which is `affinityTerm`'s own
 * convention next door. No new content field, no schema revision, and no second
 * table for somebody to keep in step with the first: the claim *"a species is
 * good at the material its magic is about"* is derived rather than authored
 * twice.
 *
 * **Only the form key is read, and that is a decision rather than an
 * oversight.** `coordination.ts` says an `affinities` key may name *either* a
 * cell or a form, and `target-appeal.ts` resolves both. This looks up the form
 * alone, because the material claim lives on the form: a cell is technique ×
 * form, and `creo-terram` and `perdo-terram` are two things you can do to the
 * same stuff. A species affinity for one *technique's* worth of earth is a
 * statement about how it prefers to work, not about what earth is made of, and
 * `routeYieldByForm` — which is the table this derivation borrows — is keyed on
 * the form for exactly the same reason. All thirteen shipped entries are
 * form-keyed today; a cell-keyed one would bias research and derive no tilt,
 * which `production-aptitude.test.ts` pins so the reading cannot become silent.
 *
 * **The coupling is deliberate and worth stating.** Re-authoring `form.json`
 * therefore moves species aptitude as well as routing. That is the intended
 * reading — a form's weights *are* the statement of what that form is made of,
 * and a species tuned toward the form is tuned toward the material — but a
 * balance sweep moving a yield weight should expect two things to move.
 *
 * ## What this is *not*
 *
 * It is not a magnitude. {@link speciesLandAptitude} returns a **tilt**, and
 * `materialsProduced` renormalizes the tilted shares back to `fp(1024)`, so a
 * cohort's total land output is exactly what `laborAffinity` and headcount say
 * it is. A species good at stone makes *more stone and less grain* from the same
 * month, not more of everything. Magnitude stays in `laborAffinity`, which is
 * the one knob §2.4 gives for it and which `combatants.ts` already leans on.
 *
 * It also does not reach **construction**. A crew on a building site works at
 * `laborAffinity` alone. Building consumes `stone` and `labor` rather than
 * producing a mix, so there is no mix for a tilt to move, and inventing a
 * second reading of the same trait for the site would be the arithmetic
 * authoring the fiction.
 *
 * A species declaring no form affinity at all gets `fp(1)` for every kind, and
 * the renormalization is then exactly the identity — see
 * {@link NEUTRAL_LAND_APTITUDE}. That is the migration path and the positive
 * control in one.
 *
 * ## The seam left open, and what was assumed
 *
 * The author's third case is **not** built here: *"Elves are just real good at
 * magic and that gives them the ability to do all kinds of other shit, but
 * because magic … they have laborers, but all the laborers are also mages."*
 * That is a structural change to the populace/mage split — a cohort whose
 * members occupy `OCCUPATION.laborer` and hold knowledge at the same time — and
 * it is not a number on this axis. A sibling is speccing it in
 * `docs/design/species-and-materials.md`, which does not exist on this branch
 * yet.
 *
 * What this file assumes, so that the sibling can contradict it deliberately
 * rather than by accident:
 *
 * 1. **A laborer produces materials and nothing else.** `insight`, `essence`
 *    and `passage` come out of `application.ts` and a mage's month; a tilt over
 *    the three land kinds cannot express a cohort that also casts. An
 *    every-laborer-is-a-mage species needs a second faucet, not a larger tilt.
 * 2. **Elf and draconic are tilted here only by the affinities they already
 *    author** (`herbam`, `mentem` for the elf; `ignem`, `vim`, `nomen` for the
 *    draconic). Nothing was invented for them. Their `laborAffinity` — 768 and
 *    512, the two lowest in the shipped set — is left exactly where it was,
 *    because raising it to model "our laborers are better because they are
 *    mages" would model it in the one place that cannot tell a mage from a
 *    farmhand.
 * 3. **`prevalence` is untouched.** Elf and draconic author `fp(1.0)`, human
 *    `102` and orc `51`; dwarf and gnome fall back to `PREVALENCE_WHEN_UNAUTHORED`,
 *    which the code itself labels as not an authored number. That gap is
 *    reported rather than filled: authoring a value to make an assertion here
 *    pass would put an author's number and a stand-in in the same table with
 *    nothing to tell them apart, which is the reason the stand-in is greppable
 *    in the first place.
 */

import type { Fixed } from '@mm/sim-core';
import { FP_ONE, floorDiv } from '@mm/sim-core';
import type { FormRecord, SpeciesRecord } from '@mm/content';

import type { LandMaterialKind } from './kinds.js';
import { LAND_MATERIAL_KINDS } from './kinds.js';

/**
 * A species' tilt across the three kinds land yields, `fp`.
 *
 * `fp(1)` is neutral in every slot; higher means this species turns a larger
 * part of the same month toward that kind. Never a magnitude — see the module
 * note.
 */
export type LandAptitude = Readonly<Record<LandMaterialKind, Fixed>>;

/**
 * No tilt in any direction, and the identity under the renormalization in
 * `materialsProduced`.
 *
 * Asserted rather than assumed: `production-aptitude.test.ts` steps the tilt
 * with this and requires the produced basket to be **equal**, not merely close,
 * to the untilted one. A "neutral" that moved a single unit would make every
 * absent-aptitude caller a silent behaviour change.
 */
export const NEUTRAL_LAND_APTITUDE: LandAptitude = Object.freeze({
  food: FP_ONE,
  stone: FP_ONE,
  vellum: FP_ONE,
});

/**
 * One species' aptitude for each land kind, derived from its form affinities.
 *
 * @param forms - Every form in the content set. All of them, not the permitted
 * ones: a species' aptitude is a fact about the species, and making it depend on
 * the god's opening square would mean a cohort's output changed when a cell was
 * permitted for reasons having nothing to do with that cohort.
 *
 * @returns A tilt in `fp`. A kind no form yields at all — impossible in shipped
 * content, where the loader refuses a form yielding nothing, but reachable in a
 * hand-built fixture — reads neutral rather than dividing by zero.
 */
export function speciesLandAptitude(
  species: SpeciesRecord,
  forms: readonly FormRecord[],
): LandAptitude {
  const aptitude: Record<LandMaterialKind, Fixed> = { food: FP_ONE, stone: FP_ONE, vellum: FP_ONE };
  for (const kind of LAND_MATERIAL_KINDS) {
    let weighted = 0;
    let total = 0;
    for (const form of forms) {
      const weight = Math.max(0, form.yieldWeights[kind]);
      if (weight === 0) continue;
      // A missing key is `fp(1)`, which is `affinityTerm`'s convention: an
      // undeclared affinity is *no opinion*, never a penalty. Reading it as zero
      // here would make a species with one authored entry catastrophically bad
      // at every material it had not been given an opinion about.
      const affinity = Math.max(0, species.affinities[form.id] ?? FP_ONE);
      weighted += weight * affinity;
      total += weight;
    }
    if (total > 0) aptitude[kind] = floorDiv(weighted, total);
  }
  return Object.freeze(aptitude);
}

/**
 * Every species' aptitude, resolved once against a content set.
 *
 * The composition root builds this and the world step reads it, for the reason
 * `affinitiesOf` next door is resolved the same way: it is a pure projection of
 * two content files, so recomputing it per cohort per tick would be an
 * `O(species × forms)` pass to get the same answer the content already fixed.
 */
export function landAptitudeTable(
  species: readonly SpeciesRecord[],
  forms: readonly FormRecord[],
): ReadonlyMap<string, LandAptitude> {
  return new Map(species.map((record) => [record.id, speciesLandAptitude(record, forms)]));
}
