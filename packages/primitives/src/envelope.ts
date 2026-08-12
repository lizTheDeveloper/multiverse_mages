/*
 * Multiverse Mages — the technique envelope: a cost curve over an acquisition's own duration.
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
 * `docs/design/sound-design.md` §4.1 — *"Techniques are envelopes"* — made
 * arithmetic.
 *
 * ## What the design says, and what the game said back
 *
 * §4.1 gives the five techniques five different *shapes over time*: Creo is
 * *"the only technique whose energy increases across its duration"*, Perdo is
 * *"subtractive… Perdo's signature is a hole"*, Muto *"begins as one material
 * and ends as another"*, Intellego has *"no impact at all; a filter opens…
 * nothing is struck"*, and Rego is *"hard-quantized. Snap, lock, gate. Zero
 * attack"*.
 *
 * The game expressed all five as the same thing. Every effect is
 * `{primitive, magnitude, target, durationTicks}`, a flat scalar, and no rule
 * anywhere in the tree branches on technique identity — grepping the five ids
 * across `packages/*​/src` finds one comment. This module is the first
 * per-technique dispatch point in the project.
 *
 * ## Why the curve is over *acquisition*, not over an effect's duration
 *
 * The obvious reading is that the envelope shapes an effect across its
 * `durationTicks`. That reading is dead on arrival in the shipped content:
 * `packages/content/data/node.json` holds 300 nodes and 407 effects, and
 * **369 of them have `durationTicks: 0`**. The 38 that do not are `area-denial`
 * fields, which `rules-raid` reads straight off the node without passing
 * through the gather/stack pipeline at all. An envelope there would be inert
 * for 91% of content and observable only inside a raid.
 *
 * The duration that *does* exist, is long, and is where the whole game lives is
 * the one an acquisition takes: a node's `researchCost` is authored in
 * mage-months and a mage grinds it out over many world ticks, with `progress`
 * banked against a `required`. That ratio — `progress / required` — is a real
 * position within a real duration, and it is what this curve is indexed on.
 *
 * ## The invariant: a curve redistributes work, it never discounts it
 *
 * A curve that made a technique cheaper would be a balance change wearing a
 * design change's clothes. So the shipped tables are **harmonic-mean
 * normalised**: under constant effort, months-to-completion is equal across all
 * five curves.
 *
 * The reason it is the *harmonic* mean and not the arithmetic one is the
 * feedback: a slot with multiplier `m` is crossed at rate `m`, so it consumes
 * months proportional to `1 / m`. Total months is therefore `Σ 1/mᵢ`, and
 * holding *that* fixed is what "same cost, different shape" means. An
 * arithmetic-mean normalisation would have made every technique but Rego
 * strictly slower, by Cauchy–Schwarz, and the nerf would have looked like a
 * tuning artefact for months.
 *
 * {@link ENVELOPE_HARMONIC_TARGET} states the invariant and
 * {@link envelopeHarmonicSum} computes it; the shipped tables hit it *exactly*,
 * which is why the slots are not round numbers.
 *
 * This is also why {@link ENVELOPE_SLOT_FLOOR} exists. Intellego's *"nothing is
 * struck"* wants a zero attack slot, and `1/0` diverges: a zero would not be a
 * technique that starts slowly, it would be a technique that never finishes.
 * The attack slot is a small positive multiplier and the tail pays for it.
 *
 * ## Where it bites, and why that is not nowhere
 *
 * Harmonic normalisation deliberately makes the constant-effort case a no-op,
 * so it is worth writing down what is left, because "the mechanic is
 * decorative" was a live possibility this had to survive:
 *
 * - **Rates move mid-project.** A blessing, an `encouragedCells` emphasis
 *   decaying linearly, a university's library depth growing — all recomputed
 *   live on every tick, none frozen at commitment. Under a flat curve only the
 *   integral of the rate matters; under a shaped one, *when* the rate arrives
 *   matters too.
 * - **Banked progress is read, not just compared.** `researchFrontier`
 *   subtracts it from the requirement on every autonomy evaluation to score
 *   whether resuming beats starting something else. So a curve changes what
 *   mages *choose to work on*: a `swell` node looks hopeless for most of its
 *   life and then blooms, while a `hole` node looks nearly finished and then
 *   drags. That is the difference between a cost curve and a cost.
 * - **Progress outlives a goal switch and dies with its mage.** Which makes the
 *   shape interact with species lifespan, and that interaction is a strategy
 *   dimension the balance campaign has looked for and never found.
 *
 * ## Not a tradition hook
 *
 * Vision §4a confines a tradition to four hooks — acquire, store, cast, cost —
 * and sound-design §4.4 says a tradition recolours *cast and cost*, which is
 * where a cost curve lives. It would have been easy to make the curve a fifth
 * hook. It is not one: it is **technique content**, and it composes with the
 * existing `acquire` hook multiplicatively — `acquire` prices the node, the
 * curve redistributes the effort across that price. Neither shadows the other,
 * and a test in `rules-magic` pins that.
 */

import type { Fp } from '@mm/content';
import type { Fixed } from '@mm/sim-core';
import { FP_ONE, floorDiv, mul } from '@mm/sim-core';

/**
 * Slots a curve is divided into over `progress / required`.
 *
 * Eight, because §3.1's bar is divided into 8th notes and 16ths and eight is
 * the coarser of the two — fine enough that a shape is a shape and not a step,
 * coarse enough that a content author can read the table and see the curve. It
 * is a structural constant, not a tuning value: every shipped table has exactly
 * this many entries and the loader refuses one that does not.
 */
export const ENVELOPE_SLOTS = 8;

/**
 * The harmonic invariant, in fixed point.
 *
 * `Σ floorDiv(FP_ONE × FP_ONE, mᵢ)` over the slots must equal this. It is
 * `ENVELOPE_SLOTS × FP_ONE` — the value the flat curve produces — so the claim
 * it encodes is exactly *"this curve costs what flat costs"*.
 */
export const ENVELOPE_HARMONIC_TARGET: Fixed = ENVELOPE_SLOTS * FP_ONE;

/**
 * The smallest multiplier a slot may carry.
 *
 * Guards two things at once. A zero slot diverges under the harmonic sum, and a
 * near-zero one makes a technique's attack arbitrarily long — Intellego's
 * *"nothing is struck"* is a hesitation, not a wall. `fp(64)` is one sixteenth
 * of the flat rate, so the slowest admissible attack crosses its eighth of a
 * project in sixteen times the flat months.
 */
export const ENVELOPE_SLOT_FLOOR: Fixed = 64;

/** The largest multiplier a slot may carry. Symmetric with the floor's reason. */
export const ENVELOPE_SLOT_CEILING: Fixed = 16 * FP_ONE;

/**
 * One technique's envelope: `sound-design.md` §4.1's shape, as content.
 *
 * Carries its own `gloss` and `tuningStatus` for the same reason every other
 * magnitude in the project does — `contracts.md` §2.3 — because every number in
 * `slots` is a placeholder awaiting the balance harness, and a table that did
 * not say so would read as tuned.
 */
export interface EffortEnvelope {
  /** Curve id: `rigid` | `swell` | `hole` | `bend` | `open`. */
  readonly id: string;
  readonly gloss: string;
  /** Exactly {@link ENVELOPE_SLOTS} fp multipliers, in order. */
  readonly slots: readonly Fp[];
  readonly tuningStatus: 'untuned' | 'tuned';
}

/**
 * The flat curve: Rego's, and the answer for every caller that supplies none.
 *
 * §4.1 calls Rego *"hard-quantized. Snap, lock, gate. Zero attack, gated
 * release, rhythmically rigid"*. Zero attack is full rate from the first month
 * and rigid is no curvature, so flat is not a placeholder for Rego — it is
 * Rego's shape, and it doubles as the control the other four are measured
 * against. A caller that omits an envelope gets behaviour bit-identical to the
 * tree before this module existed, which is what makes threading it through an
 * optional parameter safe.
 */
export const RIGID_ENVELOPE: EffortEnvelope = {
  id: 'rigid',
  gloss:
    "sound-design.md §4.1, Rego: 'Zero attack, gated release, rhythmically rigid.' Flat is the " +
    'shape, and the control the other four are measured against.',
  slots: [FP_ONE, FP_ONE, FP_ONE, FP_ONE, FP_ONE, FP_ONE, FP_ONE, FP_ONE],
  tuningStatus: 'untuned',
};

/**
 * The slot a given position within an acquisition falls in.
 *
 * `floor(progress × ENVELOPE_SLOTS / required)`, clamped into range. Division
 * goes through the single shared `floorDiv` — `contracts.md` §3's *"all `fp`
 * division rounds toward negative infinity via the single shared helper. No
 * exceptions"* — because a curve that rounded its own way would put a replay
 * one slot out on exactly the ticks a project changes slot.
 *
 * A non-positive `required` is a degenerate acquisition rather than a question,
 * and answers slot 0.
 */
export function envelopeSlotAt(progress: Fixed, required: Fixed): number {
  if (required <= 0) return 0;
  const raw = floorDiv(Math.max(progress, 0) * ENVELOPE_SLOTS, required);
  if (raw < 0) return 0;
  return raw >= ENVELOPE_SLOTS ? ENVELOPE_SLOTS - 1 : raw;
}

/**
 * The multiplier a curve applies to effort delivered at this position.
 *
 * The whole of the per-technique arithmetic, in one function, so that the three
 * call sites — research, teaching, scribing — cannot drift into three curves.
 * That is the same argument `stackMagnitudes` makes for stacking and
 * {@link effectiveRediscoveryMultiplier} makes for rediscovery, and the reason
 * all three live in this package rather than in the rules packages that use
 * them.
 */
export function envelopeMultiplier(
  envelope: EffortEnvelope | undefined,
  progress: Fixed,
  required: Fixed,
): Fixed {
  if (envelope === undefined) return FP_ONE;
  const slot = envelope.slots[envelopeSlotAt(progress, required)];
  return slot === undefined ? FP_ONE : slot;
}

/**
 * Effort, shaped.
 *
 * The one call a rules package makes. Kept separate from
 * {@link envelopeMultiplier} so that a caller which wants to *report* the
 * multiplier — the explain channel, a sweep — does not have to reconstruct it
 * by division, which is where a rounding disagreement would come from.
 */
export function shapedEffort(
  envelope: EffortEnvelope | undefined,
  effort: Fixed,
  progress: Fixed,
  required: Fixed,
): Fixed {
  if (envelope === undefined) return effort;
  return mul(effort, envelopeMultiplier(envelope, progress, required));
}

/**
 * The harmonic sum a curve's slots produce.
 *
 * Equal to {@link ENVELOPE_HARMONIC_TARGET} exactly when the curve costs what
 * flat costs. Exported rather than kept private because the loader checks it on
 * shipped content and a test checks it on the tables — the invariant is only
 * worth having if the thing that enforces it is the thing that defines it.
 */
export function envelopeHarmonicSum(slots: readonly Fp[]): Fixed {
  let total = 0;
  for (const slot of slots) {
    if (slot <= 0) return Number.MAX_SAFE_INTEGER;
    total += floorDiv(FP_ONE * FP_ONE, slot);
  }
  return total;
}

/** Why a curve was refused. One string per rule, for a diagnostic a human reads. */
export type EnvelopeProblem =
  | 'slot-count'
  | 'slot-below-floor'
  | 'slot-above-ceiling'
  | 'harmonic-imbalance';

/**
 * Every rule a shipped curve must satisfy, in one place.
 *
 * Returns the problems rather than throwing, because `@mm/content`'s loader
 * reports *all* diagnostics at once — `all-violations-reported.test.ts` pins
 * that — and a validator that threw on the first would turn a content review
 * into eight round trips.
 */
export function envelopeProblems(slots: readonly Fp[]): EnvelopeProblem[] {
  const problems: EnvelopeProblem[] = [];
  if (slots.length !== ENVELOPE_SLOTS) problems.push('slot-count');
  if (slots.some((slot) => slot < ENVELOPE_SLOT_FLOOR)) problems.push('slot-below-floor');
  if (slots.some((slot) => slot > ENVELOPE_SLOT_CEILING)) problems.push('slot-above-ceiling');
  if (
    slots.length === ENVELOPE_SLOTS &&
    !slots.some((slot) => slot <= 0) &&
    envelopeHarmonicSum(slots) !== ENVELOPE_HARMONIC_TARGET
  ) {
    problems.push('harmonic-imbalance');
  }
  return problems;
}
