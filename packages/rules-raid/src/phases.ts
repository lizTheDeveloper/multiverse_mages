/*
 * Multiverse Mages — the three phases of an engagement, and the agency that
 * decays across them.
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
 * `docs/design/raid-engagement.md` §2: **muster → contact → resolution**, and
 * the author's rule for the split — *"there is a phase of time where you just
 * watch it unfold, but that isn't until the very end."*
 *
 * ## What a phase gates, and what it emphatically does not
 *
 * A phase gates the **player's verbs** and nothing else. No combatant reads it,
 * no intent consults it, no magnitude scales by it. That is deliberate and it is
 * the reason this module can be added to a finished engine without moving a
 * single existing number: `stepEngagement` behaves identically whether or not
 * anybody ever asks which phase a raid is in.
 *
 * The alternative — phases that also change how combatants fight — would have
 * made every raid metric in the project incomparable with its own history, for
 * a design that is about what the *god* may do.
 *
 * ## Derived every time, stored never
 *
 * There is no `phase` field on `RaidState` and there should not be. A stored
 * phase is a second source of truth for something computable from three numbers
 * already in the raid, and the failure mode of a stale one is a player offered a
 * verb the engine will refuse — the exact class of defect `permits()` exists in
 * one copy to prevent.
 *
 * ## The three rules, and why each boundary is where it is
 *
 * - **Resolution is checked first.** It is stability-driven, so it wins over
 *   everything: a raid whose portal is nearly gone is in its last act whatever
 *   else is true. `allObjectivesResolved` also enters resolution, because a raid
 *   with nothing left to take has already decided what it was going to decide.
 * - **Muster is "contact has not happened yet", with a ceiling.** The natural
 *   definition is the design's own — *"portal is open, contact has not
 *   happened"* — and it is observable: {@link Raid.contactTick} is written the
 *   first time damage is ledgered or a cast resolves. The authored ceiling
 *   exists because the natural definition alone has a degenerate case: two
 *   sides that never meet, or a raid where every objective is undefended, would
 *   sit in muster for three thousand ticks with the full verb set available.
 *   A raid that is entirely muster is a raid with no back-loaded resolution,
 *   which is the shape the design is explicitly not.
 * - **Contact is everything else**, which is where a raid spends most of itself.
 *
 * Note that a detachment's intrinsic attack counts as contact even though it is
 * not a cast. It is soldiers meeting soldiers; a definition of contact that only
 * a mage could trigger would leave a purely martial engagement permanently in
 * muster.
 */

/**
 * The three phases, in the order agency decays.
 *
 * Numbered ascending so that "later phase" is `>`, which is what the verb
 * gate in `verbs.ts` compares. The numbers are a public contract — a client
 * renders them — so they are append-only in the same sense the RNG stream
 * registry is.
 */
export const ENGAGEMENT_PHASE = {
  /** Portal open, contact not yet made. The full verb set. */
  muster: 0,
  /** Combatants engaged. Fewer, sharper interventions. */
  contact: 1,
  /** The engagement plays out. The player watches. */
  resolution: 2,
} as const;

export type EngagementPhaseValue = (typeof ENGAGEMENT_PHASE)[keyof typeof ENGAGEMENT_PHASE];

/** Human-readable names, for reports and for the client. Index by phase value. */
export const ENGAGEMENT_PHASE_NAMES: readonly ['muster', 'contact', 'resolution'] = Object.freeze([
  'muster',
  'contact',
  'resolution',
]);

/**
 * Everything {@link phaseOf} reads.
 *
 * A structural parameter rather than the whole `Raid`, for the reason
 * `permits()` takes a `Ruleset` rather than a universe: a test, a client
 * projecting an observation, and the engine itself should all be asking the same
 * function, and only one of those three has a `Raid` to hand.
 */
export interface PhaseInputs {
  /** Engagement ticks stepped so far. */
  readonly engagementTick: number;
  /** The engagement tick contact was first observed on, or `-1` for none yet. */
  readonly contactTick: number;
  /** Remaining portal stability, raw. */
  readonly portalStability: number;
  /** Every objective is captured, looted, or destroyed. */
  readonly allObjectivesResolved: boolean;
  /** Authored: the tick muster ends on regardless of contact. */
  readonly musterCeilingTicks: number;
  /** Authored: stability at or below which the raid is in its last act. Raw. */
  readonly resolutionStabilityMargin: number;
}

/** Which phase an engagement is in. Pure, total, and stored nowhere. */
export function phaseOf(inputs: PhaseInputs): EngagementPhaseValue {
  if (
    inputs.portalStability <= inputs.resolutionStabilityMargin ||
    inputs.allObjectivesResolved
  ) {
    return ENGAGEMENT_PHASE.resolution;
  }
  if (inputs.contactTick < 0 && inputs.engagementTick < inputs.musterCeilingTicks) {
    return ENGAGEMENT_PHASE.muster;
  }
  return ENGAGEMENT_PHASE.contact;
}

/**
 * Whether the player may act at all.
 *
 * Resolution is watch-only by definition, so this is one comparison rather than
 * a table. The per-verb question — *which* of the verbs a phase leaves — belongs
 * with the verbs, and lives in `verbs.ts`.
 */
export function phaseAdmitsAction(phase: EngagementPhaseValue): boolean {
  return phase !== ENGAGEMENT_PHASE.resolution;
}
