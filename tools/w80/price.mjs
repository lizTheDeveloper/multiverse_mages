/*
 * Multiverse Mages — W80: the within-tier price curve, and the claim it makes.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the GNU
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * # What this file claims
 *
 * **A node's price is what it commands and where on the grid it sits — not
 * merely how deep its prerequisites run.**
 *
 * Until now `researchCost` was `2048 << (tier - 1)` for all three hundred nodes
 * and nothing else, so it carried no information `tier` did not already carry.
 * `compareTargets` orders candidates by cost and breaks ties on **node id**, and
 * node id is what `intern` happened to assign when it walked `node.json` — so
 * "cheapest first" was "alphabetically first" and every universe opened the
 * same doors in the same order. This file replaces the tie-break with a
 * statement about the node.
 *
 * ## The ladder is preserved; only the rungs get width
 *
 * Tier still sets the octave: `base(t) = 2048 << (t - 1)`. Within a tier the
 * price moves over **exactly one octave centred on that base**, `[base/√2,
 * base·√2]`, so the bands **tile without overlapping** — the dearest tier-1
 * node costs exactly what the cheapest tier-2 node costs and never more. That
 * is the deliberate half of the choice the brief poses. Tier is *prerequisite
 * depth*, and depth is the one thing every other per-tier term in the game
 * already reads: `speciesTargetTerm` pays curiosity per tier, `ageTargetTerm`
 * pays age per tier, `withinDepthCeiling` gates on tier outright. If a tier-2
 * node could undercut a tier-1 node, every one of those terms would begin
 * lying about what it is paying for. Overlapping bands are defensible and would
 * give cost a louder voice; they are not worth making four other mechanisms
 * ambiguous to buy it.
 *
 * The band is **geometric-mean preserving**: `2^(g/64 - 1/2)` averages to 1
 * across a symmetric grade distribution, so the mean price per tier does not
 * move and this change is about *order*, not about *pace*. Anything the
 * measurement shows is therefore attributable to which door was opened first
 * rather than to research having become cheaper or dearer overall.
 *
 * ## The grade, in five named terms
 *
 * Grade runs 0..64 and starts at 32, the band's centre. Every term reads only
 * fields the node already authors — no node id, no hash of a node id (which
 * would re-import the interning artifact through the back door), and no
 * randomness (a jitter would break the tie without making any cell *worth*
 * choosing, which is the whole objection to a jitter).
 *
 * 1. **reach** — *a working that touches the world costs more than one that
 *    touches only the caster.* The widest `target` any of the node's effects
 *    takes: `self` -10, `single` -3, `area` +3, `side` +5, `universe` +10.
 * 2. **payload** — *doing two things at once is harder than doing one, and
 *    making an effect persist is harder than making it happen.* +3 per effect
 *    beyond the first (capped at +6), +3 if any effect has a duration.
 * 3. **technique** — *seeing is the cheapest verb and making from nothing the
 *    dearest.* `intellego` -10, `perdo` -3, `rego` 0, `muto` +5, `creo` +10.
 *    This is the classical Hermetic ordering, and it is a claim about the game
 *    someone may well want to argue with; it is written here in one line so
 *    that arguing with it is a one-line edit.
 * 4. **form** — *the forms run from what a hand can touch to what only a theory
 *    can reach.* An authored rank over all fourteen forms, less 6, so the term
 *    spans -6..+7. Fourteen distinct ranks rather than four bands, because the
 *    point of the exercise is to stop nodes tying.
 * 5. **metis** — *tacit craft is picked up in the doing.* -4 for `metis`. The
 *    price of that discount is paid elsewhere and on purpose: codification
 *    destroys metis, so a cheap door is also a leaky one.
 *
 * The grade is clamped to the band. A clamp is reported rather than hidden;
 * {@link report} prints how many nodes hit either rail.
 */

/** `target` → reach adjustment. */
const REACH = { self: -10, single: -3, area: 3, side: 5, universe: 10 };

/** Technique id → adjustment. Perceive cheap, create dear. */
const TECHNIQUE = { intellego: -10, perdo: -3, rego: 0, muto: 5, creo: 10 };

/**
 * The fourteen forms, ordered from what a hand can touch to what only a theory
 * can reach. The index is the rank; the adjustment is `rank - 6`.
 */
const FORM_ORDER = [
  'terram',
  'aquam',
  'herbam',
  'animal',
  'corpus',
  'ignem',
  'auram',
  'imaginem',
  'mentem',
  'umbra',
  'limen',
  'nomen',
  'fatum',
  'vim',
];

/** The band's centre grade, and its width in grades. One octave, √2 either way. */
export const GRADE_CENTRE = 32;
export const GRADE_SPAN = 64;

/** `base(t) = 2048 << (t - 1)` — the ladder as authored before this change. */
export function tierBase(tier) {
  return 2048 * 2 ** (tier - 1);
}

/** The five terms, kept separate so a report can print them. */
export function gradeTerms(node, cell) {
  const reach = Math.max(...node.effects.map((effect) => REACH[effect.target]));
  const extra = Math.min(2, node.effects.length - 1) * 3;
  const persists = node.effects.some((effect) => effect.durationTicks > 0) ? 3 : 0;
  const technique = TECHNIQUE[cell.technique];
  const formRank = FORM_ORDER.indexOf(cell.form);
  if (formRank < 0) throw new Error(`form "${cell.form}" is not in FORM_ORDER`);
  const metis = node.knowledgeKind === 'metis' ? -4 : 0;
  return { reach, payload: extra + persists, technique, form: formRank - 6, metis };
}

/** The clamped 0..64 grade. */
export function gradeOf(node, cell) {
  const terms = gradeTerms(node, cell);
  const raw =
    GRADE_CENTRE + terms.reach + terms.payload + terms.technique + terms.form + terms.metis;
  return { raw, grade: Math.min(GRADE_SPAN, Math.max(0, raw)), terms };
}

/**
 * The price. `Fp` at scale 1/1024 throughout — `tierBase` is already fixed
 * point (2048 is fp(2), not 2048 mage-months), and the multiplier is applied to
 * it, so the result is fixed point too and never needs a second scaling.
 */
export function priceOf(node, cell) {
  const { grade, raw, terms } = gradeOf(node, cell);
  const cost = Math.round(tierBase(node.tier) * 2 ** ((grade - GRADE_CENTRE) / GRADE_SPAN));
  return { cost, grade, raw, terms };
}
