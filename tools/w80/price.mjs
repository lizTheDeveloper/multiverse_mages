/*
 * Multiverse Mages — W80: the within-tier price curve, and the claim it makes.
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
 * ## A price is a *relative standing*, so it is measured against its tier
 *
 * The first version of this file summed the five terms into an absolute grade
 * and priced straight off it, expecting the octave to be mean-preserving
 * because the terms are roughly symmetric. **They are not, and the asymmetry
 * cost 20% of the late game.** Deep tiers are where the `creo`, `muto`, `vim`
 * and universe-scoped content lives, so their grades skew dear: the per-tier
 * geometric mean drifted +12.3% at tier 5 and +41.4% at tier 6, and
 * `referenceNodesGainedFinalQuarter` fell from 7.645 to 6.105 — a **global
 * pacing change arriving as a side effect of a content judgement about
 * individual nodes.** Those are two different decisions and one edit should not
 * make both.
 *
 * So the grade is not a price. It is scored against the **datum**: the mean
 * grade of the node's own tier. `deviation = grade - datum(tier)`, clamped to
 * ±32, and the price is `base(t) · 2^(deviation/64)`. The per-tier geometric
 * mean is then *exactly* `base(t)` rather than approximately, the ladder does
 * the pacing on its own, and everything this file claims is a claim about
 * ordering.
 *
 * ### The locality this costs, which an author will meet before this docstring
 *
 * **Editing one node's grade moves every other price in its tier.** Make one
 * tier-3 node `universe`-scoped and its own price rises — and the datum rises
 * with it, so the other twelve tier-3 nodes get *cheaper* without being
 * touched. A diff of one node is a diff of thirteen prices. That is a real loss
 * for whoever is authoring, and it will look like a bug the first time.
 *
 * It is nevertheless the right property, because **the thing a price is meant
 * to encode here is relative standing, and relative standing is inherently a
 * property of the set.** "This node is dear" is not a statement a node can make
 * alone; it means "dearer than its tier-mates", and a formula that pretends
 * otherwise is smuggling a claim about the tier's overall pace into what looks
 * like a claim about one node. The tier with a single member proves the point
 * from the other end: `cv-the-made-vis` is the only tier-6 node, has nothing to
 * be dearer than, and prices at exactly `base(6)`.
 *
 * The practical consequence for an author is small and worth stating plainly:
 * **regenerate the whole tier, never hand-edit one price**, which is what
 * `apply-price.mjs` does and why the generated table is committed alongside the
 * data rather than in place of it.
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
 * The **deviation** is clamped to the band, not the grade. A clamp is reported
 * rather than hidden: `apply-price.mjs` prints how many nodes hit either rail
 * and what the residual per-tier drift is once they have.
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

/**
 * The node's grade: the five terms summed onto the band's centre. Unbounded and
 * **not a price** — it means nothing until it is read against its tier's datum.
 */
export function gradeOf(node, cell) {
  const terms = gradeTerms(node, cell);
  const grade =
    GRADE_CENTRE + terms.reach + terms.payload + terms.technique + terms.form + terms.metis;
  return { grade, terms };
}

/** Mean grade per tier — the datum each node's price is a deviation from. */
export function tierData(nodes, cellOf) {
  const sums = new Map();
  for (const node of nodes) {
    const { grade } = gradeOf(node, cellOf(node));
    const entry = sums.get(node.tier) ?? { total: 0, count: 0 };
    sums.set(node.tier, { total: entry.total + grade, count: entry.count + 1 });
  }
  return new Map([...sums].map(([tier, entry]) => [tier, entry.total / entry.count]));
}

/**
 * Every node's price, keyed by node id.
 *
 * Takes the whole set rather than one node, which is the locality cost stated
 * in this file's header made unavoidable in the signature: a price cannot be
 * computed from a node alone, because it is a statement about that node's
 * standing among its tier-mates.
 *
 * `Fp` at scale 1/1024 throughout — `tierBase` is already fixed point (2048 is
 * fp(2), not 2048 mage-months) and the multiplier is applied to it, so the
 * result is fixed point too and never needs a second scaling.
 */
export function priceTable(nodes, cellOf) {
  const data = tierData(nodes, cellOf);
  const table = new Map();
  for (const node of nodes) {
    const { grade, terms } = gradeOf(node, cellOf(node));
    const datum = data.get(node.tier);
    const raw = grade - datum;
    const deviation = Math.min(GRADE_CENTRE, Math.max(-GRADE_CENTRE, raw));
    table.set(node.id, {
      cost: Math.round(tierBase(node.tier) * 2 ** (deviation / GRADE_SPAN)),
      grade,
      datum,
      raw,
      deviation,
      clamped: raw !== deviation,
      terms,
    });
  }
  return table;
}
