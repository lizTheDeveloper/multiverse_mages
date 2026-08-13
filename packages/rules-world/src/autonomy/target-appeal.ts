/*
 * Multiverse Mages — what a node is worth to *this* mage, as a utility score.
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
 * ## The defect this module exists to remove
 *
 * `compareTargets` orders candidates by `remainingCost` and then by `nodeId`,
 * and in the v1 content set `researchCost` is a **pure function of tier** —
 * 2048, 4096, 8192, 16384, 32768 for tiers 1 to 5, with no within-tier
 * variation whatsoever. So target selection was exactly *"tier, then node id"*:
 * **one fixed total order shared by every mage of every species in every
 * universe.**
 *
 * `docs/design/strategy-dimensionality.md` measured what that costs. Over 84
 * runs and seven strategies the first principal component of the runs × nodes
 * matrix carried **91.4%** of the variance; every cross-strategy pair inside v1
 * had containment **1.000** — strategies did not merely converge, they
 * *nested*; and a run's held set was predictable from its **count alone** at
 * prefix fidelity **0.943**. Gnome and human, sharing only a depth ceiling and
 * differing in every other trait, reached the identical forty-nine nodes.
 *
 * The diagnosis in that document is one sentence: *"A mage's utility function
 * never asks what a node is worth to hold — only what it costs."*
 *
 * ## This is vision §7, implemented rather than invented
 *
 * > Mages act on **utility-scored goals shaped by species, age, personality,
 * > and their assigned standing role** (researcher, warden, professor, raider).
 * > You set the role; they decide everything else.
 *
 * Goal selection was already that (`terms.ts`, six terms, all four inputs).
 * Target selection never was, and target selection is what decides which magic
 * a universe ends up holding. Each term below names the sentence it comes from:
 *
 * | term | reads | vision |
 * |---|---|---|
 * | `effort` | `remainingCost` | §5 *"Research — a mage derives a new node from prerequisites they hold. **Slow.**"* |
 * | `affinity` | species `affinities`, cell key then form key | §6 *"Tuned on: … and **technique/form affinities**."* |
 * | `species` | `curiosity` × tier | §6 *"**curiosity** (rate of self-directed research)"* |
 * | `age` | age band × tier | §7 *"shaped by species, **age**, personality"* |
 * | `personality` | ambition and caution × tier | §7 *"…**personality**…"* |
 * | `role` | the node's authored effect primitives | §7 *"their assigned standing **role**"* |
 * | `emphasis` | the god's live `encourageResearch`, by cell | §4 *"the god… encourages research"* |
 *
 * The `effort` term is the old behaviour, kept and **demoted**: cheapest-first
 * was never wrong, it was merely the only thing being asked. Deleting it would
 * have produced a mage indifferent to how long her life's work takes.
 *
 * ## Which terms can actually reorder the queue, stated plainly
 *
 * `species`, `age` and `personality` are all proportional to **tier**, so on
 * their own each of them bends or reverses the tier gradient and yields another
 * total order over tiers. They matter — a gnome and a human end up wanting
 * different halves of one reachable set, and two mages of one species disagree
 * — but the terms that are *orthogonal* to tier are `affinity` (which cell),
 * `role` (what the node does) and `emphasis` (which cell the god named). Those
 * three are the ones that can make two universes hold genuinely different sets
 * rather than different prefixes of one set, and they are why this module reads
 * content nothing read before.
 *
 * ## The emphasis term is a verb moved, not a verb added
 *
 * `encourageResearch` is the god's only action that names a **cell** as a
 * preference, and it used to be spent entirely on `research-rate`: an encouraged
 * cell was researched *faster* and never *chosen sooner*. So the one ordinal-
 * shaped thing the god can say was implemented as a scalar, and
 * `strategy-dimensionality.md`'s headline followed arithmetically — if every
 * universe walks the same order, one held set always contains the other.
 *
 * The sharpest form of it, and the reason this term exists: species affinities
 * could reorder what a universe studies and the god could not.
 *
 * The rate contribution is **gone**, not kept alongside. A verb that is
 * simultaneously a preference and a speed cannot be attributed by an ablation —
 * the campaign has already been burned by exactly that, when an exploit margin
 * turned out to be `ascensionRate` under another name — and the two effects
 * would have had to be separated inside one arm rather than between two.
 *
 * **Uniform across every target-taking goal.** The scorer is goal-blind by
 * construction: `select.ts` hands it a candidate list without saying whether the
 * mage is researching, being taught, teaching or scribing. So an encouraged cell
 * is also the cell mages seek teaching in and write books about. That is a
 * choice and not an oversight — it amplifies the reorder, because a cell the god
 * names is pulled at every point knowledge moves rather than only where it is
 * created — and confining it to research would need a seam the appeal path does
 * not have.
 *
 * ## Breadth is bounded by the god's own constant, not by a second one
 *
 * How many cells can carry an emphasis at once is `encourage-max-cells`, which
 * `encouragePlan` already enforces by masking the fourth encouragement. Nothing
 * here re-bounds it. What this file bounds is *strength*, and the loader checks
 * that strength against the five mage-owned bounds.
 *
 * ## Determinism: no draw, and `nodeId` is still the last word
 *
 * Nothing here takes randomness. Two targets with equal appeal fall to
 * {@link compareTargets} — `remainingCost`, then `nodeId` — so the order is
 * **total** and no RNG stream moves. That matters more than it looks: a draw
 * added to target selection would re-roll stream 7 for every mage on every
 * evaluation and silently rot every committed balance baseline
 * (`CLAUDE.md`, constraint 3).
 *
 * All arithmetic is integer. `floorDiv` is the one division, for the reason
 * `terms.ts` gives: it floors toward negative infinity for both signs, while a
 * shift would round the other way on a negative and make the score
 * sign-dependent.
 *
 * ## Every magnitude is content, and none of it is tuned
 *
 * `autonomy-weight.json`. The loader checks the scalar set in both directions
 * and enforces the dominance invariant — the role bound is strictly below the
 * sum of the other five — so *"you set the role; they decide everything else"*
 * is arithmetic that fails a load rather than an intention that fails quietly.
 */

import type { ContentId, Fp, SpeciesRecord } from '@mm/content';
import type { Fixed } from '@mm/sim-core';
import { FP_ONE, floorDiv } from '@mm/sim-core';
import type { MageRoleValue } from '@mm/state';
import { MAGE_ROLE } from '@mm/state';

import type { KnowledgeTarget } from '../coordination.js';
import type { AgeBandValue } from './age-bands.js';
import { AGE_BAND, ageBandOf } from './age-bands.js';
import { compareNovelty, compareTargets } from './candidates.js';
import type { MageOutlook } from './outlook.js';

/** Mirrors `@mm/content`'s `TuningStatus` without importing a type for a constant. */
export const TARGET_APPEAL_TUNING_STATUS = 'untuned';

/** The seven terms, in the order the table above writes them. */
export const TARGET_TERM_KINDS = [
  'effort',
  'affinity',
  'species',
  'age',
  'personality',
  'role',
  'emphasis',
] as const;

/** One of the six. Also the ablation selector. */
export type TargetTermKind = (typeof TARGET_TERM_KINDS)[number];

/** One target's appeal, taken apart. */
export type TargetTerms = Readonly<Record<TargetTermKind, Fixed>>;

/**
 * A species' `affinities` table, resolved from author-facing strings to
 * interned ids.
 *
 * Two maps rather than one because the namespaces are **separately interned**:
 * a cell id and a form id are both small integers and a single map keyed on the
 * raw number would have `terram` collide with whichever cell happened to intern
 * to the same value. The loader (`load.ts`, `checkSpecies`) accepts an affinity
 * key that is either a form id or a cell id, and both are kept because a cell
 * key is the finer statement — *"this species is good at rego terram"* rather
 * than *"…at terram"* — and the finer statement should win.
 */
export interface SpeciesAffinities {
  readonly byCell: ReadonlyMap<ContentId, Fp>;
  readonly byForm: ReadonlyMap<ContentId, Fp>;
}

/**
 * Which cells the god has encouraged, and how strongly, as of one world tick.
 *
 * Keyed by interned cell id, valued in `fp` — `emphasisAt`'s derived magnitude.
 * A cell that is absent carries no instruction. Built once per tick by whoever
 * can see `ENCOURAGED_CELL` rows and handed down, for the reason every other
 * derived input on an outlook is: the scoring path may not read the entity
 * store, and rebuilding this per mage would scan every encouragement for every
 * mage in the universe on every evaluation.
 */
export type CellEmphasis = ReadonlyMap<ContentId, Fixed>;

/** A universe whose god has encouraged nothing. Every universe, most ticks. */
export const NO_EMPHASIS: CellEmphasis = Object.freeze(new Map<ContentId, Fixed>());

/** A species with no declared affinity at all. Human's, in the shipped set. */
export const NO_AFFINITIES: SpeciesAffinities = Object.freeze({
  byCell: new Map<ContentId, Fp>(),
  byForm: new Map<ContentId, Fp>(),
});

/** The part of `@mm/content`'s registry this module reads. */
export interface TargetAppealSource {
  autonomyWeight(id: string): number;
  roleAppeal(role: string, primitiveId: string): number;
  readonly primitives: readonly {
    readonly contentId: ContentId;
    readonly record: { readonly id: string };
  }[];
}

/**
 * Every magnitude target selection is made of, read once from content.
 *
 * Read once and carried, for the reason `rules-raid`'s `readRaidTuning` is:
 * a registry lookup per candidate per goal per mage per tick is the hot loop
 * the Monte Carlo harness runs millions of times, and a hot-reloaded registry
 * that changed a divisor mid-run would be a universe whose mages changed their
 * minds about what magic is for without anything having happened.
 */
export interface TargetAppealWeights {
  readonly effortDivisor: number;
  readonly affinityDivisor: number;
  readonly curiosityDivisor: number;
  readonly ambitionDivisor: number;
  readonly cautionDivisor: number;
  readonly emphasisDivisor: number;
  readonly agePerTier: Readonly<Record<AgeBandValue, Fixed>>;
  readonly bound: Readonly<Record<TargetTermKind, Fixed>>;
  readonly ceiling: Fixed;
  /** What one role thinks of one interned effect primitive. `0` when unpriced. */
  roleAppealOf(roleId: MageRoleValue, primitiveId: ContentId): Fixed;
}

/** The four role names, in role-id order, so the lookup is an index and not a search. */
const ROLE_NAMES: readonly string[] = (() => {
  const names: string[] = [];
  for (const [name, value] of Object.entries(MAGE_ROLE)) names[value] = name;
  return names;
})();

/**
 * Reads the whole table, once.
 *
 * Eager, like `readRaidTuning`: `autonomyWeight` throws on an id the table does
 * not declare, so an eager read turns a content mistake into a failure before a
 * single mage has chosen anything, rather than on whichever tick first needed
 * the missing number.
 *
 * The role × primitive table is flattened into a dense array at read time
 * because the rules path holds interned ids and the content table is keyed by
 * author-facing strings. Resolving that per lookup would put string hashing
 * inside candidate scoring — the same argument `catalog.ts` makes about interning
 * prerequisites.
 */
export function readTargetAppeal(source: TargetAppealSource): TargetAppealWeights {
  const at = (id: string): number => source.autonomyWeight(id);

  let maxPrimitiveId = 0;
  for (const entry of source.primitives) {
    if (entry.contentId > maxPrimitiveId) maxPrimitiveId = entry.contentId;
  }
  const stride = maxPrimitiveId + 1;
  const table = new Int32Array(ROLE_NAMES.length * stride);
  for (let roleId = 0; roleId < ROLE_NAMES.length; roleId += 1) {
    const roleName = ROLE_NAMES[roleId];
    if (roleName === undefined) continue;
    for (const entry of source.primitives) {
      table[roleId * stride + entry.contentId] = source.roleAppeal(roleName, entry.record.id);
    }
  }

  return Object.freeze({
    effortDivisor: at('target-effort-divisor'),
    affinityDivisor: at('target-affinity-divisor'),
    curiosityDivisor: at('target-curiosity-divisor'),
    ambitionDivisor: at('target-ambition-divisor'),
    cautionDivisor: at('target-caution-divisor'),
    emphasisDivisor: at('target-emphasis-divisor'),
    agePerTier: Object.freeze({
      [AGE_BAND.young]: at('target-age-young-per-tier'),
      [AGE_BAND.prime]: at('target-age-prime-per-tier'),
      [AGE_BAND.senescent]: at('target-age-senescent-per-tier'),
    }),
    bound: Object.freeze({
      effort: at('target-bound-effort'),
      affinity: at('target-bound-affinity'),
      species: at('target-bound-species'),
      age: at('target-bound-age'),
      personality: at('target-bound-personality'),
      role: at('target-bound-role'),
      emphasis: at('target-bound-emphasis'),
    }),
    ceiling: at('target-appeal-ceiling'),
    roleAppealOf(roleId: MageRoleValue, primitiveId: ContentId): Fixed {
      if (primitiveId < 1 || primitiveId > maxPrimitiveId) return 0;
      return table[roleId * stride + primitiveId] ?? 0;
    },
  });
}

/**
 * Resolves one species' authored `affinities` onto interned ids.
 *
 * Done once per species rather than per candidate, and done by whoever holds
 * the registry — `contracts.md` §5 lets `rules-world` see `@mm/content`, but a
 * string lookup per candidate per tick is the cost this shape exists to avoid.
 */
export function resolveSpeciesAffinities(
  species: SpeciesRecord,
  registry: { intern(namespace: 'cell' | 'form', id: string): ContentId },
): SpeciesAffinities {
  const byCell = new Map<ContentId, Fp>();
  const byForm = new Map<ContentId, Fp>();
  for (const key of Object.keys(species.affinities).sort()) {
    const value = species.affinities[key];
    if (value === undefined) continue;
    const cellId = registry.intern('cell', key);
    if (cellId !== 0) {
      byCell.set(cellId, value);
      continue;
    }
    const formId = registry.intern('form', key);
    // A key that is neither is refused at content load (`checkSpecies`), so
    // reaching here means the registry and the species record disagree — which
    // is worth dropping silently rather than crashing a live universe, because
    // the load that would have caught it has already happened.
    if (formId !== 0) byForm.set(formId, value);
  }
  return { byCell, byForm };
}

/** One target's appeal, with its arithmetic still visible. */
export interface TargetScore {
  readonly nodeId: ContentId;
  /** The clamped appeal. This is what selection compares. */
  readonly appeal: Fixed;
  /** The six terms, before summation. Sums to the *unclamped* total. */
  readonly terms: TargetTerms;
  readonly rawTotal: Fixed;
  readonly clamped: boolean;
}

/** How a caller asks for a term to be left out, for §7's ablation methodology. */
export interface TargetAppealOptions {
  readonly ablate?: TargetTermKind | undefined;
}

/** Clamps a term onto its own axis. Symmetric: every term may be negative. */
function boundTerm(kind: TargetTermKind, value: Fixed, weights: TargetAppealWeights): Fixed {
  const bound = weights.bound[kind];
  return Math.min(bound, Math.max(-bound, value));
}

/**
 * The effort term. The old ordering, kept as one input among six.
 *
 * Negative, because `remainingCost` is a price. A mage still prefers the
 * project she can finish, all else equal — what changed is that all else is no
 * longer equal.
 */
export function effortTerm(target: KnowledgeTarget, weights: TargetAppealWeights): Fixed {
  return boundTerm('effort', -floorDiv(target.remainingCost, weights.effortDivisor), weights);
}

/**
 * The affinity term: §6's *"technique/form affinities"*, consulted for the
 * first time by anything that decides what gets learned.
 *
 * A cell-keyed affinity beats a form-keyed one because it is the more specific
 * authored claim. `fp(1024)` is neutral, so a species that declares nothing
 * scores zero here rather than scoring badly — which is the difference between
 * "no opinion" and "averse", and human declares nothing at all.
 */
export function affinityTerm(
  target: KnowledgeTarget,
  outlook: MageOutlook,
  weights: TargetAppealWeights,
): Fixed {
  const { byCell, byForm } = outlook.affinities;
  const declared = byCell.get(target.cellId) ?? byForm.get(target.formId) ?? FP_ONE;
  return boundTerm('affinity', floorDiv(declared - FP_ONE, weights.affinityDivisor), weights);
}

/**
 * The species term: curiosity as an appetite for depth.
 *
 * §6 defines curiosity as the *"rate of self-directed research"* and the species
 * table calls the gnome *"highest curiosity"* and the draconic *"barely
 * curious"*. A curious civilization reaches for the harder node; an incurious
 * one takes the one in front of it. Multiplied by tier rather than added,
 * because the claim is about how steeply the price of depth is discounted, not
 * about a flat preference.
 */
export function speciesTargetTerm(
  target: KnowledgeTarget,
  outlook: MageOutlook,
  weights: TargetAppealWeights,
): Fixed {
  const perTier = floorDiv(outlook.species.curiosity - FP_ONE, weights.curiosityDivisor);
  return boundTerm('species', perTier * target.tier, weights);
}

/**
 * The age term.
 *
 * A young mage has a life in which to finish a deep project; a senescent one
 * may not, and a knowledge instance in a mind dies with its holder (§5). The
 * prime row is zero, which makes the other two shifts away from the middle of a
 * life rather than three independent claims.
 */
export function ageTargetTerm(
  target: KnowledgeTarget,
  outlook: MageOutlook,
  weights: TargetAppealWeights,
): Fixed {
  const band = ageBandOf(outlook.normalizedAge);
  return boundTerm('age', weights.agePerTier[band] * target.tier, weights);
}

/**
 * The personality term: the within-universe disagreement.
 *
 * Ambition reaches for the summit — prestige reads the **deepest** tier a
 * living mage holds and never a sum (§8a), so the ambitious mage is right about
 * her own incentives. Caution pushes the other way, toward the project that
 * will certainly be finished. Opposite signs on purpose: a mage high in both is
 * where she started, which is what makes the two axes separable in an ablation
 * rather than two names for one number.
 *
 * `personality.curiosity` is deliberately **not** read here. It is the species
 * term's input, and reading the same axis in two terms would make the ablation
 * report attribute one effect twice.
 */
export function personalityTargetTerm(
  target: KnowledgeTarget,
  outlook: MageOutlook,
  weights: TargetAppealWeights,
): Fixed {
  const { ambition, caution } = outlook.personality;
  const perTier =
    floorDiv(ambition - FP_ONE, weights.ambitionDivisor) -
    floorDiv(caution - FP_ONE, weights.cautionDivisor);
  return boundTerm('personality', perTier * target.tier, weights);
}

/**
 * The role term: what the god's one instruction is actually worth.
 *
 * Summed over the node's **authored effect primitives**, which is the only
 * place in the content set that says what a node is *for*. A warden wanting a
 * ward and a raider wanting a blink is the difference vision §7 promises and
 * the build did not have: before this, a warden and a researcher handed the
 * same candidate list wanted the same node in the same order, which is a
 * straightforward contradiction of the sentence.
 *
 * Bounded, and the bound is checked at content load against the sum of the
 * other five. A role that could outvote everything else would be an order.
 */
export function roleTargetTerm(
  target: KnowledgeTarget,
  outlook: MageOutlook,
  weights: TargetAppealWeights,
): Fixed {
  let total = 0;
  for (const primitiveId of target.primitives) {
    total += weights.roleAppealOf(outlook.roleId, primitiveId);
  }
  return boundTerm('role', total, weights);
}

/**
 * The emphasis term: the god's one ordinal verb, spent on order.
 *
 * Reads the live emphasis on the candidate's **cell** — `emphasisAt`'s linearly
 * decaying magnitude, which is `encourage-magnitude` on the tick the
 * encouragement is issued and zero once it lapses. A cell nobody encouraged is
 * absent from the map and scores zero, which is *"no instruction"* rather than
 * *"discouraged"*: there is no verb for the god to say don't, and inventing one
 * out of an absent map entry would give every unnamed cell a penalty nobody
 * authored.
 *
 * Positive only, because `emphasisAt` is. The bound is symmetric like every
 * other term's because {@link boundTerm} is one function, not because a negative
 * emphasis is reachable.
 *
 * **The decay is what makes this a preference and not a decree.** A fresh
 * encouragement is worth its whole axis; sixty-four ticks later it is worth
 * nothing, and a mage who committed to an encouraged project keeps it because
 * `select.ts` holds a commitment rather than re-deciding every tick. So the god
 * moves the front of the queue and does not own it.
 */
export function emphasisTerm(
  target: KnowledgeTarget,
  outlook: MageOutlook,
  weights: TargetAppealWeights,
): Fixed {
  const live = outlook.emphasis.get(target.cellId);
  if (live === undefined || live <= 0) return 0;
  return boundTerm('emphasis', floorDiv(live, weights.emphasisDivisor), weights);
}

/** All seven terms for one target, before summation. */
export function targetTerms(
  target: KnowledgeTarget,
  outlook: MageOutlook,
  weights: TargetAppealWeights,
): TargetTerms {
  return {
    effort: effortTerm(target, weights),
    affinity: affinityTerm(target, outlook, weights),
    species: speciesTargetTerm(target, outlook, weights),
    age: ageTargetTerm(target, outlook, weights),
    personality: personalityTargetTerm(target, outlook, weights),
    role: roleTargetTerm(target, outlook, weights),
    emphasis: emphasisTerm(target, outlook, weights),
  };
}

/**
 * Sums the seven terms and applies the single clamp.
 *
 * One clamp, at the end — the position `scoring.ts` fixes for goal scores and
 * for the same reason: clamping each addend as it lands is the natural way to
 * write this and produces a different, order-dependent number. The clamp is
 * symmetric here because appeal may legitimately be negative; a node can be
 * worth less than nothing to a mage who has better things to do.
 */
export function targetAppeal(
  target: KnowledgeTarget,
  outlook: MageOutlook,
  weights: TargetAppealWeights,
  options: TargetAppealOptions = {},
): TargetScore {
  const raw = targetTerms(target, outlook, weights);
  const terms = options.ablate === undefined ? raw : { ...raw, [options.ablate]: 0 };
  let rawTotal = 0;
  for (const kind of TARGET_TERM_KINDS) rawTotal += terms[kind];

  const ceiling = weights.ceiling;
  const appeal = Math.min(ceiling, Math.max(-ceiling, rawTotal));
  return {
    nodeId: target.nodeId,
    appeal,
    terms,
    rawTotal,
    clamped: appeal !== rawTotal,
  };
}

/**
 * Orders two scored candidates: **novel first**, then higher appeal, then
 * {@link compareTargets}.
 *
 * Novelty is ahead of appeal rather than inside it, and `candidates.ts`'
 * {@link compareNovelty} carries the argument for why. In one line: a shelf that
 * already holds a node gains nothing from a second copy that the capital loop
 * can read, and that is a fact about the shelf rather than a preference of the
 * mage's — it partitions the list, and the utility score decides inside the
 * partition. It is inert for every research and teaching candidate, where
 * `libraryHolds` is absent.
 *
 * **`nodeId` is still the final tie-break.** Appeal is an integer and ties are
 * ordinary, so the fallback is not decoration — it is what keeps the order
 * total and keeps two states that are equal as states from resolving
 * differently.
 */
export function compareAppeal(
  a: { readonly score: TargetScore; readonly target: KnowledgeTarget },
  b: { readonly score: TargetScore; readonly target: KnowledgeTarget },
): number {
  const novelty = compareNovelty(a.target, b.target);
  if (novelty !== 0) return novelty;
  if (a.score.appeal !== b.score.appeal) return b.score.appeal - a.score.appeal;
  return compareTargets(a.target, b.target);
}
