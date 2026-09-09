/*
 * Multiverse Mages — a working that stands, expires, and must be renewed.
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
 * `durationTicks`, finally read.
 *
 * ## What the content has been saying
 *
 * Every effect entry in `packages/content/data/node.json` carries a
 * `durationTicks`. Three hundred and eighty-one of four hundred and nineteen
 * read `0`, and every one of the thirty-eight that does not belongs to
 * `area-denial` — a field a raid reads straight off the node, outside this
 * pipeline entirely. Before this module `git grep -n durationTicks -- packages`
 * returned content rows, a schema line, a type alias and two module comments:
 * the field was authored and read by nothing.
 *
 * What the glosses wanted from it is not subtle. Muto states it as its premise —
 * *"the change is **worn, not granted**"*, *"every animal so held is **counting
 * down to its own shape**"*, *"renewed about as often as **a sentry is
 * changed**"*, *"a wall you have **agreed to build twice**"* — and Rego answers
 * from the other side: `rv-the-working-kept-in-iron` binds a working into a
 * thing *"so that it goes on being cast without being cast again"*, which is
 * only a sentence worth writing if the default is that it does not.
 *
 * ## `0` means instantaneous or permanent, and it must go on meaning that
 *
 * This is the single most dangerous line in the change and it is therefore the
 * first rule stated. An effect authored `durationTicks: 0` is **not** a working
 * that expires immediately. It is the effect this game has always had: applied
 * for as long as its holder can cast it and its cell is permitted, needing no
 * upkeep and producing no working. The alternative reading — zero is an expiry
 * at the tick it was cast — would silently switch off 381 of 419 authored
 * effects and would look, from every series the harness records, like a balance
 * change.
 *
 * {@link requiresWorking} is the one place that distinction is made, and
 * `zero-duration-is-not-expiry.test.ts` pins it from both ends: the byte-identical
 * arm proves nothing moved for zero, and the positive control proves the gate
 * can move something at all.
 *
 * ## Liveness is a half-open interval
 *
 * A working lit at `t` with duration `d` stands for exactly `d` ticks — `t`
 * through `t + d - 1` — and lapses **on** `t + d`. Half-open, because the
 * closed reading gives a one-month working two months and the difference is
 * invisible in every aggregate. {@link isLive} and {@link hasLapsed} are exact
 * complements over the same record, which is asserted rather than assumed:
 * two predicates that disagree about the boundary tick is how a working both
 * contributes and reverts in the same step.
 */

import type { ContentId } from '@mm/content';
import type { Handle } from '@mm/state';

/**
 * Whether an authored effect needs a working standing behind it.
 *
 * `!== 0` rather than `> 0`, deliberately. `node.schema.json` sets
 * `"minimum": 0`, so the two are equivalent on shipped content and would stay
 * equivalent right up until somebody widened the schema — at which point `> 0`
 * quietly readmits a negative duration as a permanent effect. The campaign this
 * change belongs to found a merge that had turned a `!== 0` into a `> 0` and
 * nothing caught it, so the narrower test is written and the reason with it.
 */
export function requiresWorking(durationTicks: number): boolean {
  return durationTicks !== 0;
}

/**
 * The tick a working lit at `litTick` for `durationTicks` stops standing on.
 *
 * Integer addition in ticks, not fixed point: a duration is a count of world
 * months, and `contracts.md` §0's scale is for magnitudes.
 */
export function expiryTickOf(litTick: number, durationTicks: number): number {
  if (!requiresWorking(durationTicks)) {
    throw new RangeError(
      'expiryTickOf was asked for the expiry of a zero-duration effect. Zero means instantaneous ' +
        'or permanent — no working is established for it and none expires — and computing an ' +
        'expiry at all is how zero silently becomes "expires on the tick it was cast".',
    );
  }
  return litTick + durationTicks;
}

/** The part of a `standing-working` row liveness is decided from. */
export interface StandingWorkingLike {
  readonly expiresTick: number;
}

/** Whether the working still stands on `worldTick`. Half-open: `[lit, expires)`. */
export function isLive(working: StandingWorkingLike, worldTick: number): boolean {
  return worldTick < working.expiresTick;
}

/** Whether the working has lapsed by `worldTick`. The exact complement of {@link isLive}. */
export function hasLapsed(working: StandingWorkingLike, worldTick: number): boolean {
  return !isLive(working, worldTick);
}

/**
 * The share of a working's duration that must have elapsed before a mage will
 * consider spending a month on it, as a divisor.
 *
 * `3` means *the last third*: a twenty-four-month working becomes a candidate
 * for renewal in its final eight months.
 *
 * ## Why candidacy and not appeal
 *
 * The first draft of this made upkeep unattractive instead — a low
 * `GOAL_BASE_APPEAL` plus an urgency term that rose toward the expiry — and it
 * produced a mechanism that could never start. Measured over a sixty-tick
 * seeded universe with nine durable nodes granted at full mastery: **zero**
 * months of upkeep, zero workings lit, ever. Urgency can only rise once
 * something is standing, nothing was ever standing, and the goal lost every
 * argmax it was ever scored in. The wiring was complete and the game never ran
 * it, which is the exact defect class the reachability check exists to find and
 * which no reachability check could have seen: every symbol had a caller.
 *
 * So the rota is structural. A mage whose working has years left has **no
 * candidate** and the goal is masked for her, which frees the base appeal to
 * sit level with the other two goals that spend a month on a node she already
 * holds. *"Renewed about as often as a sentry is changed"* is a statement about
 * when the watch ends, not about how much a sentry wants the job.
 *
 * **Untuned.** A third is the coarsest fraction that is not a half, chosen so
 * that a mage has room to lose an argmax twice before the working goes out. The
 * sweep should move it.
 */
export const RENEWAL_WINDOW_DENOMINATOR = 3;

/**
 * Whether a standing working is close enough to lapsing to be worth a month.
 *
 * Integer arithmetic, and multiplication rather than division, so there is no
 * rounding decision to get wrong at the boundary: the window opens when
 * `remaining × 3 <= duration`.
 *
 * A working already lapsed answers `true` — it is maximally worth relighting —
 * and one that has never been lit is not this function's question at all, since
 * there is no `remaining` for it. The caller answers that one by having no row.
 */
export function needsRenewal(remainingTicks: number, durationTicks: number): boolean {
  if (durationTicks <= 0) return false;
  return remainingTicks * RENEWAL_WINDOW_DENOMINATOR <= durationTicks;
}

/**
 * The one question `gatherEffects` asks about workings.
 *
 * An interface rather than a function so that a call site reads
 * `standing.standsAt(...)` and a reader can see *which* of the four gates is
 * being asked. `contribution.ts` argues that a legality field carried on a
 * contribution is worse than absent because two consumers end up testing it
 * differently; the same argument applies to a bare predicate parameter with no
 * name.
 *
 * **An absent row answers `false`, and that is not the same as a lapse.** A
 * working that was never lit contributes nothing and reverts nothing. The
 * distinction is `world-step`'s to make, when it sweeps rows that have expired
 * and reports them; nothing here can tell the two apart and nothing here needs
 * to.
 */
export interface StandingWorkings {
  /** Does a working over `nodeId`, held up by `holder`, stand at this moment? */
  standsAt(holder: Handle, nodeId: ContentId): boolean;
}

/**
 * The view in which nothing stands.
 *
 * Exported so a caller that means *"this universe has no workings"* can say so
 * by name. It is the honest answer for a hand-built test world, for a raid's
 * captured ruleset — an engagement has its own clock and vision §13 has not
 * settled whether a working binds at raid scale — and for any consumer that has
 * not been wired.
 *
 * Deliberately **not** a default on {@link StandingWorkings}. A default would
 * make an unwired consumer look wired, which is the defect class this whole
 * campaign has been finding: a checker that answers confidently about the wrong
 * input. The field is required, so adding a consumer is a compile error until
 * somebody writes down which of the two answers they mean.
 */
export const NO_WORKINGS_STAND: StandingWorkings = Object.freeze({
  standsAt: () => false,
});

/**
 * The authored duration a working over this node is lit for.
 *
 * `0` when the node carries no duration-bearing effect at all — which is what
 * 381 of the 419 shipped effect entries say, and which means *no working is
 * ever established for this node*.
 *
 * **Every non-zero duration on one node must be the same number.** A node with a
 * two-year effect and a ten-year effect would need two workings, or one working
 * whose expiry silently extends the shorter effect; both are worse than
 * refusing, and `content`'s loader refuses. This function therefore takes the
 * first non-zero it finds rather than a maximum: a maximum would keep working
 * on content the loader would have rejected, and would be the thing that hid
 * the mistake.
 */
export function authoredDurationOf(effects: readonly { readonly durationTicks: number }[]): number {
  for (const effect of effects) {
    if (requiresWorking(effect.durationTicks)) return effect.durationTicks;
  }
  return 0;
}
