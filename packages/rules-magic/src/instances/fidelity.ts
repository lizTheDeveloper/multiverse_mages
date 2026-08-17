/*
 * Multiverse Mages — the telephone problem: what a copy of a copy is worth.
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
 * `docs/design/scribing-fidelity.md`, turned into arithmetic.
 *
 * Two failures live here and they are deliberately different in kind.
 *
 * **Fidelity loss is gradual, legible, and a function of distance.** Every
 * scribing pushes a copy further from the mind that held the knowledge, and the
 * mētis fraction is read off a curve over that distance. *"Fresh from a living
 * holder: full. One copy out: fine."*
 *
 * **Corruption is binary and hidden.** A corrupted instance looks exactly like a
 * sound one until someone tries to learn from it and fails.
 *
 * ## Why distance is stored and the fraction is derived
 *
 * The obvious implementation is a per-generation multiplier on a stored
 * fraction, and the design rejects it in advance: a multiplier decays from the
 * *first* copy, and the design says the first copy is fine. What it asks for is
 * a **plateau and then a fall**.
 *
 * Storing a fraction and multiplying it makes that shape a property of a
 * coefficient somebody chose — get the coefficient wrong and the plateau
 * vanishes silently. Storing an accumulated **distance** and reading the
 * fraction off {@link fidelityAt} makes the plateau structural: there is a range
 * of the input over which the output is literally the constant `FP_ONE`, and no
 * choice of the other constants can erode it.
 *
 * It also makes the dwarf question fall out rather than needing a mechanism.
 * Distance accumulates by addition, and how much distance one copy costs is
 * {@link generationStep} — so a better scribe simply *advances less far per
 * copy*, and travels the same plateau over more copies.
 *
 * ## Nothing here draws
 *
 * Both the curve and the curiosity check are deterministic functions of state
 * and content. `contracts.md` §6's stream table is untouched and no baseline
 * moves because of an inserted draw — only because behaviour changed, which is
 * the only reason a baseline is allowed to move.
 */

import type { Fp, KnowledgeKind } from '@mm/content';
import type { SimState } from '@mm/sim-core';
import type { Enum8, Handle } from '@mm/state';
import { KNOWLEDGE_FIDELITY, attachRecord, componentOf, readRecord } from '@mm/state';
import { FP_ONE, floorDiv, mul } from '@mm/sim-core';


/**
 * What a reader knows about an instance's soundness.
 *
 * One field rather than two booleans: a `corrupted` flag beside a `discovered`
 * flag makes "sound, but marked corrupt" representable, and nothing may produce
 * it. See `KNOWLEDGE_FIDELITY`'s note in `@mm/state`.
 */
export const CORRUPTION = {
  /** Says what it says. The default, and what an absent row means. */
  sound: 0,
  /** Silently wrong. Indistinguishable from `sound` to anyone who has not read it. */
  hidden: 1,
  /** Silently wrong, and somebody competent failed against it and said so. */
  marked: 2,
} as const;

export type CorruptionValue = (typeof CORRUPTION)[keyof typeof CORRUPTION];

/** Whether a value names a corruption state. */
export function isCorruptionValue(value: number): value is CorruptionValue {
  return value === CORRUPTION.sound || value === CORRUPTION.hidden || value === CORRUPTION.marked;
}

// ---------------------------------------------------------------------------
// The curve. Every constant below is untuned.
// ---------------------------------------------------------------------------

/**
 * Copy distance the plateau extends to, in `fp` generations. **Untuned.**
 *
 * `fp(2048)` is two whole generations, and it is the design sentence turned into
 * a number: a book scribed from a mind that never read a book sits at one
 * generation — *"fresh from a living holder: full"* — and a book copied from
 * *that* book, by way of a mind that studied it, sits at two — *"one copy out:
 * fine"*. Both are inside the plateau and both are worth the full fraction.
 *
 * The third book is the first one that is worse than its parent, which is where
 * the design says the loss bites.
 */
export const FIDELITY_PLATEAU_END: Fp = 2048;

/**
 * Copy distance at which the mētis fraction reaches zero, in `fp`. **Untuned.**
 *
 * `fp(5120)` — five generations. Between {@link FIDELITY_PLATEAU_END} and here
 * the fraction falls linearly, so a human scribing mētis gets two good copies, a
 * third at two thirds, a fourth at a third, and a fifth that carries none of the
 * craft at all.
 *
 * **Zero is not a refusal.** The design is explicit that a spent book is *"very
 * hard to learn from"* and *"not a brick"* — see {@link masteryFromBook}, which
 * floors what a reader takes away rather than turning the read into a failure.
 * A zero-fraction book still transmits the *episteme*: the shape of the thing,
 * and none of the practice.
 */
export const FIDELITY_ZERO_AT: Fp = 5120;

/**
 * Copy distance one scribing costs at `fp(1024)` scribe affinity, before the
 * knowledge-kind multiplier. **Untuned.**
 */
export const GENERATION_STEP_BASE: Fp = FP_ONE;

/** Floor on {@link generationStep}, so no affinity can make copying free. **Untuned.** */
export const GENERATION_STEP_MIN: Fp = 256;

/** Ceiling on {@link generationStep}, so a poor scribe's copy is bad and not void. **Untuned.** */
export const GENERATION_STEP_MAX: Fp = 2048;

/**
 * Multiplier on the copy distance a scribing costs, by the node's
 * `knowledgeKind`. **Untuned.**
 *
 * This is the one place the shipped content axis becomes load-bearing.
 * `knowledgeKind` is authored on all three hundred nodes — 271 `episteme`, 29
 * `metis` — and until now was read by nothing in the rules path.
 *
 * The design's framing is that the two are *one concept at two scales*: the node
 * kind decides whether a book can carry the knowledge at all, the instance's
 * distance decides how much of it this particular book still has. So they are
 * not separate curves; they are the same curve travelled at different speeds. A
 * formula copies out nearly intact. A craft evaporates.
 */
export const KNOWLEDGE_KIND_STEP: Readonly<Record<KnowledgeKind, Fp>> = {
  /** Half a generation per copy: a written procedure survives being rewritten. */
  episteme: 512,
  /**
   * A whole generation per copy: the practice is what the page cannot hold.
   *
   * Mētis is the **unit**, and episteme is the discount, rather than the other
   * way round. That is forced by the design sentence and was measured rather
   * than reasoned: at two generations per copy the first probe run gave a human
   * scriptorium `100% / 33% / 0%`, which is *"fresh from a living holder: full"*
   * and then straight over the cliff — no *"one copy out: fine"* at all. At one
   * generation per copy it gives `100% / 100% / 67% / 33% / 0%`, which is the
   * sentence: full, fine, and then the loss biting on copies-of-copies.
   */
  metis: FP_ONE,
};

/**
 * Copy distance one scribing adds, from the scribe's species and the node's kind.
 *
 * Inversely proportional to `scribeAffinity`, then scaled by the kind. A dwarf
 * at `fp(1792)` pays `1024 * 1024 / 1792 = 585` — well under one generation per
 * copy — where an orc at `fp(384)` runs into {@link GENERATION_STEP_MAX}.
 *
 * **This is the answer to the design's one open question**, and it is the cheap
 * branch of it deliberately. The doc asks whether dwarves get a *medium* — stone
 * rather than vellum, with a lower loss per generation — or whether
 * `scribeAffinity` simply reduces the loss. A medium is only the more expressive
 * of the two if something in the game can *choose* it, and nothing can: no god
 * action, no mage goal, and no raid intent names a medium, so a `medium` field
 * would be set from the scribe's species on every path that writes it and would
 * be a species stat wearing a costume. And the durable-object half of the
 * fiction already shipped under another name — `GRIMOIRE.durability`, which is
 * `mul(SCRIBE_DURABILITY_BASE, scribeAffinity)` and is exactly *"dwarven books
 * resist burning"*. A second per-book persistence property computed from the
 * same input would be the same idea twice.
 */
export function generationStep(scribeAffinity: Fp, kind: KnowledgeKind): Fp {
  const affinity = Math.max(scribeAffinity, 1);
  const fromAffinity = floorDiv(GENERATION_STEP_BASE * FP_ONE, affinity);
  const scaled = mul(fromAffinity, KNOWLEDGE_KIND_STEP[kind]);
  return Math.min(Math.max(scaled, GENERATION_STEP_MIN), GENERATION_STEP_MAX);
}

/**
 * The mētis fraction an instance at this copy distance still carries, in `fp`.
 *
 * Flat at `FP_ONE` out to {@link FIDELITY_PLATEAU_END}, then linear to zero at
 * {@link FIDELITY_ZERO_AT}, then zero. Piecewise and integer throughout: the
 * plateau is a literal range of the input mapping to a literal constant, which
 * is the property that makes *"one copy out: fine"* a structural fact rather
 * than a consequence of a coefficient.
 */
export function fidelityAt(copyGeneration: Fp): Fp {
  if (copyGeneration <= FIDELITY_PLATEAU_END) return FP_ONE;
  if (copyGeneration >= FIDELITY_ZERO_AT) return 0;
  const travelled = copyGeneration - FIDELITY_PLATEAU_END;
  const span = FIDELITY_ZERO_AT - FIDELITY_PLATEAU_END;
  return FP_ONE - floorDiv(travelled * FP_ONE, span);
}

// ---------------------------------------------------------------------------
// Reading a corrupted text.
// ---------------------------------------------------------------------------

/**
 * Curiosity a reader needs to read through corruption at tier 1. **Untuned.**
 *
 * Chosen against the shipped species table rather than in the abstract: at tier
 * 1 the bar is `512 + 192 = 704`, which gnome (1792), human (1152) and elf (896)
 * clear and dwarf (512), orc (384) and draconic (256) do not.
 */
export const CORRUPTION_READ_BASE: Fp = 512;

/**
 * Extra curiosity each tier of depth demands of a reader. **Untuned.**
 *
 * At tier 6 the bar is `512 + 6 * 192 = 1664`, which **only** gnome clears. That
 * is the design's conclusion made arithmetic: *"a bunch of curious gnomes to fix
 * the situation"* is a build order, and there is no substitute for them at the
 * bottom of a deep library.
 */
export const CORRUPTION_READ_PER_TIER: Fp = 192;

/** The curiosity needed to read through a corrupted text of this tier. */
export function corruptionReadBar(tier: number): Fp {
  return CORRUPTION_READ_BASE + CORRUPTION_READ_PER_TIER * tier;
}

/**
 * Whether this reader can read through a corrupted text and repair it.
 *
 * Deterministic, and that is a decision rather than a simplification. A roll
 * here would need a thirteenth RNG stream, and it would make *"prescriptive
 * species cannot recover corrupted books"* a statistical claim when the design
 * states it as a fact about species. A dwarf who occasionally repairs a tier-6
 * text is a different design from the one written down.
 */
export function readsThroughCorruption(curiosity: Fp, tier: number): boolean {
  return curiosity >= corruptionReadBar(tier);
}

/**
 * Whether a reader who failed can tell *why* — the discovery gate.
 *
 * *"The newest students can't discover corruption."* A novice failing against a
 * tier-4 text cannot distinguish *"this book is wrong"* from *"I am not good
 * enough yet"*, and that is correct rather than a limitation: it is what makes
 * the deepest, rarest knowledge the most likely to be silently gone, because the
 * only readers who can audit it are the few who barely need it.
 *
 * The gate is the reader's own depth — the deepest tier she already holds — and
 * the bar is the text's tier. Reaching a tier means having seen enough of that
 * stratum to know what a sound text of it looks like.
 */
export function canDiscoverCorruption(readerDeepestTier: number, tier: number): boolean {
  return readerDeepestTier >= tier;
}

// ---------------------------------------------------------------------------
// Scribal error: where a corrupted book comes from when nobody attacked you.
// ---------------------------------------------------------------------------

/**
 * Probability a tier-1 book by a `fp(1024)` scribe comes out silently wrong,
 * in `fp` out of {@link FP_ONE}. **Untuned.**
 *
 * The design names two sources of corruption and this is the ambient one —
 * *"there's also some error rate… a scribe can mess up one spell but not others
 * for that grimoire."* It is deliberately small: the interesting corruption is
 * the **attack**, and an ambient rate high enough to be felt would drown the
 * signal a raid is supposed to leave.
 *
 * It matters that it is not zero, though. A universe where the only corrupted
 * books arrive by raid is a universe where finding one is a *proof* of attack,
 * and the design wants the opposite — *"if no one is constantly turning over
 * your books, you have no idea if they're good or not."* Ambient error is what
 * makes an unread library genuinely unknown rather than merely unattacked.
 */
export const SCRIBAL_ERROR_BASE: Fp = 16;

/** Ceiling on {@link scribalErrorChance}, so no scribe is hopeless. **Untuned.** */
export const SCRIBAL_ERROR_MAX: Fp = 256;

/**
 * The chance this book comes out silently wrong, in `fp` out of {@link FP_ONE}.
 *
 * Rises with tier — a deeper text has more to get wrong, and is the one nobody
 * will read for a century — and falls with `scribeAffinity`. A dwarf at tier 6
 * errs at `16 * 6 * 1024 / 1792 = 54`, about 5%; an orc at the same tier hits
 * the cap at 25%.
 */
export function scribalErrorChance(scribeAffinity: Fp, tier: number): Fp {
  const affinity = Math.max(scribeAffinity, 1);
  const raw = floorDiv(SCRIBAL_ERROR_BASE * tier * FP_ONE, affinity);
  return Math.min(raw, SCRIBAL_ERROR_MAX);
}

// ---------------------------------------------------------------------------
// What a reader takes away.
// ---------------------------------------------------------------------------

/**
 * Mastery a reader acquires from a written instance at this fidelity. **Untuned.**
 *
 * The floor is the design's *"not a brick"*: a book whose mētis fraction has
 * reached zero still transmits something, because the *episteme* — the shape of
 * the working, the names, the diagram — is what the page held in the first place
 * and is not what degrades. What is gone is the practice.
 */
export const BOOK_MASTERY_FLOOR: Fp = 32;

/**
 * Mastery a perfect book adds on top of {@link BOOK_MASTERY_FLOOR}. **Untuned.**
 *
 * Set so a full-fidelity book lands at `288`, a shade above research's
 * `DEFAULT_INITIAL_MASTERY` of 256 and well below the `512` teach threshold. A
 * fresh text is the best start available and still not a substitute for a
 * teacher, which is the design's *"scribing from a living holder beats scribing
 * from a grimoire"* seen from the reader's side.
 */
export const BOOK_MASTERY_SPAN: Fp = 256;

/** What a reader's new instance is created at, given the source's fidelity. */
export function masteryFromBook(fidelity: Fp): Fp {
  return BOOK_MASTERY_FLOOR + mul(BOOK_MASTERY_SPAN, fidelity);
}

// ---------------------------------------------------------------------------
// The component, read and written.
// ---------------------------------------------------------------------------

/** An instance's fidelity row, defaulted. An absent row is generation 0 and sound. */
export interface Fidelity {
  readonly copyGeneration: Fp;
  readonly corruption: CorruptionValue;
}

/** What every instance that has no row is. */
export const PRISTINE: Fidelity = { copyGeneration: 0, corruption: CORRUPTION.sound };

/**
 * Reads an instance's fidelity, or {@link PRISTINE} when it carries no row.
 *
 * The default is not a convenience. It is what makes the world-schema migration
 * a one-line append: every instance in every save written before revision 7 is
 * straight out of a living mind and sound, which is the only honest reading of a
 * state that recorded nothing about either.
 */
export function fidelityOf(state: SimState, instance: Handle): Fidelity {
  if (!componentOf(state, KNOWLEDGE_FIDELITY).has(instance)) return PRISTINE;
  const row = readRecord(state, KNOWLEDGE_FIDELITY, instance);
  const corruption = row.corruption as number;
  return {
    copyGeneration: row.copyGeneration,
    corruption: isCorruptionValue(corruption) ? corruption : CORRUPTION.sound,
  };
}

/** Writes an instance's fidelity row. Absent fields keep what is already there. */
export function setFidelity(
  state: SimState,
  instance: Handle,
  next: Partial<Fidelity>,
): Fidelity {
  const current = fidelityOf(state, instance);
  const merged: Fidelity = {
    copyGeneration: next.copyGeneration ?? current.copyGeneration,
    corruption: next.corruption ?? current.corruption,
  };
  attachRecord(state, KNOWLEDGE_FIDELITY, instance, {
    copyGeneration: merged.copyGeneration,
    corruption: merged.corruption as Enum8,
  });
  return merged;
}
