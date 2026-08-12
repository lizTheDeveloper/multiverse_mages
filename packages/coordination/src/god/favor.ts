/*
 * Multiverse Mages — the favor economy: regeneration, the pool cap, the cost
 * table, and the hysteresis that prices a repeated flip.
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
 * One currency, one regeneration path, one cost table.
 *
 * ## The pool is capped, and the overflow is counted rather than banked
 *
 * An uncapped pool converts a temporary worship lead into a permanent, bankable
 * one: the god idles for fifty ticks and then buys the entire ruleset at once.
 * The cap makes surplus worship worthless past a point, which turns the top of
 * the worship curve from *power* into *tempo* — a high-worship god cannot do
 * more things than a mid-worship god, only sooner.
 *
 * Discarded regeneration accumulates into `favorWasted`, which is the direct
 * signal that a strategy has outgrown its spending and moves long before a Gini
 * coefficient does.
 *
 * The alternative — an uncapped pool with escalating intervention costs to
 * absorb the surplus — was rejected because cost escalation punishes the
 * *action*, so it also punishes the small god who finally saved enough for one
 * grant. A pool cap punishes only the surplus.
 *
 * ## A tier loss does not truncate what is already held
 *
 * {@link applyRegeneration} caps the *result of regenerating*, never the
 * opening balance. A universe that falls a worship tier while holding favor
 * above its new cap keeps every unit of it and simply regenerates nothing until
 * it has spent back below the line. Truncating instead would take favor a
 * player earned and delete it for a reason they could not have anticipated, and
 * would do it silently.
 *
 * ## `worship-yield` multiplies the rate and never the cap
 *
 * The one licensed multiplier on regeneration, stacked additively into
 * `(1 + Σ)` and capped at `fp(2048)` by `contracts.md` §3, through the shared
 * arithmetic in `@mm/primitives`. It does not raise `favorCap`, so a god who
 * over-invests in it simply wastes more, visibly. That is the whole route from
 * the §6a knowledge loop into the favor economy, and it is a capped one.
 */

import type { PrimitiveRecord } from '@mm/content';
import type { Fixed } from '@mm/sim-core';
import { FP_ONE, floorDiv, mul } from '@mm/sim-core';
import type { ClampCounters } from '@mm/primitives';
import { stackMagnitudes } from '@mm/primitives';

import type { GodConstants, GodCosts } from './constants.js';

/**
 * Favor regenerated in one world tick, before the pool cap.
 *
 * `base + worship × perWorship / fp(1024)`, then multiplied by the stacked
 * `worship-yield` channel.
 *
 * **The base is deliberately non-zero.** The god of a dead universe still
 * receives a trickle, because a zero floor makes a bad start unrecoverable and
 * produces long, uninformative Monte Carlo runs — a universe that can never act
 * again is a run that spends two thousand ticks proving a decision made at tick
 * forty.
 *
 * `mul` is the right operation for the worship term: `perWorship` is a
 * dimensionless `fp` rate and `worship` is `fp`, so the product wants the
 * `/ FP_ONE` that fixed-point multiplication performs. It floors, which favours
 * nobody in particular here — the term is at least `fp(0)` and at most
 * `fp(4608)` at the worship ceiling — and the base keeps the total off zero
 * regardless, so there is no rate this can floor away.
 */
export function favorRegeneration(
  worship: Fixed,
  constants: GodConstants,
  yieldSources: readonly Fixed[],
  primitive: PrimitiveRecord,
  counters?: ClampCounters,
): Fixed {
  const raw = constants.favorRegenBase + mul(Math.max(worship, 0), constants.favorPerWorship);
  if (yieldSources.length === 0) return raw;
  const stacked = stackMagnitudes(
    primitive,
    yieldSources,
    counters === undefined ? {} : { counters },
  );
  return mul(raw, stacked.value);
}

/** What one tick of regeneration did to the pool. */
export interface RegenerationOutcome {
  /** The pool after regeneration, never above the cap and never below where it started. */
  readonly favor: Fixed;
  /** What was actually added. */
  readonly gained: Fixed;
  /** What the cap threw away. Accumulates into `favorWasted`. */
  readonly discarded: Fixed;
}

/**
 * Adds a tick's regeneration to the pool, discarding whatever the cap refuses.
 *
 * Total over every arrangement of its inputs, including the one that matters:
 * a pool already at or above the cap gains nothing and discards the whole
 * amount, rather than being pulled *down* to the cap.
 */
export function applyRegeneration(
  favor: Fixed,
  regenerated: Fixed,
  favorCap: Fixed,
): RegenerationOutcome {
  const headroom = Math.max(favorCap - favor, 0);
  const gained = Math.min(Math.max(regenerated, 0), headroom);
  return { favor: favor + gained, gained, discarded: Math.max(regenerated, 0) - gained };
}

/**
 * The cost multiplier an axis's recent-change counter produces.
 *
 * `fp(1024) + counter × HYSTERESIS_STEP`: the second flip inside the decay
 * window costs double, the third triple. The counter is incremented when the
 * axis is toggled and decremented once every `hysteresisDecayTicks`.
 *
 * This closes the degenerate line the portal rule invites — permit a technique,
 * raid with it, forbid it before the counter-raid — without a hard cooldown.
 * The lockout was the alternative and was rejected for a reinforcement-learning
 * reason: a lockout is a discontinuity in the legality mask that an agent has to
 * learn to model as a hidden timer, where an escalating price is a smooth
 * gradient the agent sees directly in the affordability mask, and it leaves the
 * option open to a god who genuinely needs it and will pay.
 */
export function hysteresisMultiplier(changeCount: number, constants: GodConstants): Fixed {
  return FP_ONE + Math.max(changeCount, 0) * constants.hysteresisStep;
}

/**
 * What an intervention costs, all in.
 *
 * `base × hysteresis / fp(1024) × tier`, where the tier factor is 1 for every
 * action but a founding grant. Written as one function so that the legality
 * mask, the ledger, and the resolution path cannot disagree about a price —
 * which is the failure §1.1's *"single arbitration function"* argument makes
 * about legality, applied to money.
 *
 * @param nodeTier - The granted node's tier, for action 8. `1` elsewhere.
 */
export function interventionCost(
  actionId: number,
  costs: GodCosts,
  options: { readonly hysteresis?: Fixed; readonly nodeTier?: number } = {},
): Fixed {
  const base = costs.byAction[actionId] ?? 0;
  if (base === 0) return 0;
  const multiplier = options.hysteresis ?? FP_ONE;
  const tier = Math.max(options.nodeTier ?? 1, 1);
  // The tier factor multiplies the *base* before the hysteresis division, so a
  // tier-4 grant is exactly four tier-1 grants rather than four floors of a
  // quarter each.
  return mul(base * tier, multiplier);
}

/**
 * What unmaking a mid-raid ruleset change costs.
 *
 * `raid-engagement.md` §1: *"after the raid, reverting a mid-raid change costs
 * substantially more favor than the change did."* Two readings of "than the
 * change did" are available and this takes both — the base is the larger of the
 * ordinary price of the reverting action and what the change actually cost
 * inside the engagement, and the multiplier is applied to that.
 *
 * Taking the maximum rather than only the paid cost matters because a change
 * made with a verb the balance harness later prices at zero would otherwise be
 * free to unmake, which would quietly delete the mechanic. Taking the maximum
 * rather than only the base matters because a god who spent heavily under fire
 * should not find the walk-back cheap.
 *
 * This is deliberately **not** folded into {@link interventionCost}. That
 * function prices an action; this prices a *history*, and the two multiply
 * together at the call site so that a reverting action is priced by both its own
 * hysteresis and the raid that made it necessary.
 */
export function revertSurcharge(base: Fixed, paidCost: Fixed, multiplier: Fixed): Fixed {
  return mul(Math.max(base, Math.max(paidCost, 0)), multiplier);
}

/**
 * The share of a tick's regeneration attributable to worship alone.
 *
 * Exposed for the harness rather than for the rules: §7's `worshipSnowball` is
 * *"the Gini coefficient of favor regen"*, and a coefficient taken over a
 * quantity with a large constant floor in it measures mostly the floor. This is
 * the term that actually varies with the thing being measured, and reporting
 * both lets a sweep say whether dispersion is in the worship or in the base.
 */
export function worshipShareOfRegeneration(regenerated: Fixed, constants: GodConstants): Fixed {
  return Math.max(regenerated - constants.favorRegenBase, 0);
}

/**
 * The per-tick favor ledger: what came in, what the cap refused, what went out.
 *
 * **Not stored in state, and that is a requirement rather than an omission.**
 * The favor-economy spec asks that the ledger *"be derivable from state and
 * actions alone so that a replay reproduces it exactly"* and that it *"not be
 * stored in world snapshots"*. A projection inside a snapshot is inside every
 * hash, at which point two peers can desync over a number no rule reads — the
 * same argument `world-step.ts` makes for handing its report back through a
 * closure.
 */
export interface FavorLedgerEntry {
  readonly worldTick: number;
  readonly opening: Fixed;
  readonly regenerated: Fixed;
  readonly discarded: Fixed;
  /** Favor spent, by `contracts.md` §4.2 action id. */
  readonly spentByAction: Readonly<Record<number, Fixed>>;
  readonly closing: Fixed;
}

/**
 * Whether a ledger entry balances: `closing == opening + regenerated −
 * discarded − Σ spends`.
 *
 * A separate function rather than an assertion inside the loop, so the harness
 * and the tests can both ask. The loop calls it too — a ledger that does not
 * balance means favor was created or destroyed outside the two paths that are
 * allowed to, and that is a rules defect worth failing loudly on rather than a
 * reporting nit.
 */
export function ledgerBalances(entry: FavorLedgerEntry): boolean {
  let spent = 0;
  for (const amount of Object.values(entry.spentByAction)) spent += amount;
  return entry.closing === entry.opening + entry.regenerated - entry.discarded - spent;
}

/**
 * The fraction of known nodes an upheaval rendered inert, as `fp`.
 *
 * Separate from the shock it produces so that the ratio — which is the thing a
 * reader wants to check — is not tangled with the interpolation. Floors, so a
 * change that strands a handful of nodes out of hundreds reads as zero
 * disruption, which is the honest answer.
 */
export function inertFraction(inertNodes: number, knownNodes: number): Fixed {
  if (knownNodes <= 0 || inertNodes <= 0) return 0;
  return floorDiv(Math.min(inertNodes, knownNodes) * FP_ONE, knownNodes);
}

/**
 * The worship shock a forbidding produces, given how much of the civilization
 * it stranded.
 *
 * Linear between "no disruption, no shock" (`fp(1024)`, a multiplier that
 * changes nothing) and "everything stranded, the declared floor". So forbidding
 * an axis nobody has ever studied is nearly free in worship, and forbidding the
 * axis the civilization was built on approximately halves worship for two
 * years — which is the requirement stated as arithmetic rather than as an
 * intention.
 */
export function upheavalShock(fraction: Fixed, constants: GodConstants): Fixed {
  const clamped = Math.max(Math.min(fraction, FP_ONE), 0);
  return FP_ONE - mul(FP_ONE - constants.upheavalShockFloor, clamped);
}
