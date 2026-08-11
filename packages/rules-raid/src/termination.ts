/*
 * Multiverse Mages — the one writer of portal stability, and the proof that a
 * raid ends.
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
 * Termination is a **proof obligation**, not a hope. A raid that can run forever
 * is a hung Monte Carlo worker and a desynced PvP match, and neither announces
 * itself as a bug — the run simply never comes back.
 *
 * Four properties together make a non-terminating raid impossible to construct,
 * and each is enforced somewhere a mistake is cheap to meet:
 *
 * 1. **Exactly one writer.** {@link decayStability} below is the only function
 *    in this repository that assigns `portalStability`, and it is called from
 *    exactly one phase with no conditional guarding the write.
 *    `packages/rules-raid/test/unit/termination-conformance.test.ts` scans the
 *    tree and fails naming any other assignment site.
 * 2. **No primitive can touch it.** `contracts.md` §3's table contains nothing
 *    that affects portal stability, and §1.6 says the absence is load-bearing:
 *    *"content declaring any stability increase or decay reduction is a hard
 *    load failure."* This change depends on that absence and adds nothing to it.
 * 3. **The decay rate is an authored integer, never a derived one.** Validated
 *    at content load — see `packages/content/src/raid.ts` for the specific trap
 *    (`div` rounds toward negative infinity, so a decay expressed as
 *    "stability ÷ desired length" becomes `0` whenever the divisor exceeds the
 *    numerator).
 * 4. **A hard ceiling above the arithmetic bound.** `MAX_ENGAGEMENT_TICKS` is a
 *    compile-time constant the loader checks content against. At runtime a raid
 *    reaching it resolves immediately **and** raises an invariant violation:
 *    reaching the ceiling proves property 3 has been broken somewhere, and the
 *    correct response is a failing test rather than a quietly truncated raid.
 *
 * The deliberate omission is worth stating. An obvious, thematic mechanic —
 * "shore up the gate", a spell that extends the portal — is **rejected**. Any
 * mechanism that increases stability turns termination from a proof into an
 * inequality between a decay rate and a regeneration rate, and the release claim
 * degrades from "every raid terminates" to "no raid exceeded the bound in the
 * runs we did". If it is ever wanted, the correct shape is a reduction of the
 * decay applied only to a prepaid tick budget fixed at portal open, so that the
 * bound stays computable at entry.
 */

import { floorDiv } from '@mm/sim-core';
import type { RaidSideValue } from '@mm/state';
import { RAID_SIDE } from '@mm/state';
import type { RaidState } from '@mm/state';

/**
 * The hard ceiling on engagement ticks, as a compile-time constant.
 *
 * **Declared here as well as in `packages/content/src/raid.ts`, on purpose.**
 * The loader needs it to refuse content that could outlast it, and the engine
 * needs it to trip over; and `rules-raid` may not take a *value* import on
 * `@mm/content`, whose public surface re-exports a filesystem loader while this
 * package has to run unchanged in a browser (`contracts.md` §5, the same
 * reasoning `@mm/state` and `@mm/agent-api` record).
 *
 * Two literals is a drift hazard, so it is closed the way this project closes
 * the others: `packages/rules-raid/test/unit/termination.test.ts` asserts the
 * two constants are equal and that {@link maxEngagementTicks} agrees with the
 * loader's `engagementTickBound` across a range of inputs. A shared import would
 * be tidier and would prove less — the test compares the two implementations,
 * not one implementation with itself.
 */
export const MAX_ENGAGEMENT_TICKS = 8192;

/** Why a raid ended. Exactly one of these, and never `undefined`. */
export const RAID_END_REASON = {
  /** Portal stability reached zero. The ordinary ending. */
  portalCollapsed: 1,
  /** Every objective was captured, looted, or destroyed. */
  objectivesResolved: 2,
  /** One side has no living combatant left. */
  sideEliminated: 3,
  /**
   * The compile-time ceiling was reached, which proves the decrement guarantee
   * has been broken. Always accompanied by a raised invariant violation.
   */
  ceilingReached: 4,
} as const;

export type RaidEndReasonValue = (typeof RAID_END_REASON)[keyof typeof RAID_END_REASON];

/**
 * The maximum number of engagement ticks this raid can run, computable from
 * `RaidState` alone before the first tick is stepped.
 *
 * @throws RangeError if the raid's own bound exceeds the compile-time ceiling.
 * The loader has already refused such content; reaching here means a raid was
 * constructed with hand-built numbers, and the honest response is to refuse to
 * start it rather than to start something with no bound.
 */
export function maxEngagementTicks(raid: RaidState): number {
  if (!Number.isInteger(raid.stabilityDecayPerTick) || raid.stabilityDecayPerTick < 1) {
    throw new RangeError(
      `This raid's stability decay is ${String(raid.stabilityDecayPerTick)}. It must be an ` +
        'authored integer of at least 1: a decay of 0 gives a raid with no bound at all, and ' +
        'there is no number this function could return that would be honest about that.',
    );
  }
  // `ceil` through the one division helper §3 admits. A floor here would report
  // a bound one tick short of the truth, and a bound that is nearly right is
  // the worst kind — every raid would look compliant except the ones that were
  // not.
  const bound = -floorDiv(-raid.portalStability, raid.stabilityDecayPerTick);
  if (bound > MAX_ENGAGEMENT_TICKS) {
    throw new RangeError(
      `This raid opens at ${String(raid.portalStability)} and decays by ` +
        `${String(raid.stabilityDecayPerTick)}, so it could run for ${String(bound)} engagement ` +
        `ticks — beyond the ${String(MAX_ENGAGEMENT_TICKS)} ceiling. The content loader refuses ` +
        'such a set, so this raid was built by hand, and starting it would be starting something ' +
        'with no bound anybody has checked.',
    );
  }
  return bound;
}

/**
 * **The only assignment to `portalStability` anywhere in this repository.**
 *
 * Unconditional. There is no `if` in this function and there must never be one:
 * every guard added here is a case in which a raid does not decay, and the union
 * of those cases is a raid that runs forever. The clamp at zero is not a guard —
 * it bounds the value, not the write.
 *
 * `@mm/state`'s `decayPortal` does the same arithmetic and is deliberately not
 * called: routing through it would put the assignment in a second package and
 * make "exactly one writer" a claim about two files. This function is the writer;
 * the conformance scan is what keeps that true.
 */
export function decayStability(raid: RaidState): void {
  const remaining = raid.portalStability - raid.stabilityDecayPerTick;
  raid.portalStability = remaining > 0 ? remaining : 0;
}

/** What the termination predicate found, or `undefined` while the raid runs. */
export interface Termination {
  readonly reason: RaidEndReasonValue;
  /** Set only for {@link RAID_END_REASON.sideEliminated}. */
  readonly eliminated?: RaidSideValue;
}

/**
 * Whether the raid ends on this tick, and why.
 *
 * Evaluated in the cleanup phase, after removal, so that "one side has no living
 * combatant" is asked of the state the tick actually produced. The clauses are
 * ordered so that the ceiling is checked first: if it has been reached, every
 * other answer is a description of a raid that should already have ended.
 */
export function terminationOf(input: {
  readonly raid: RaidState;
  readonly engagementTick: number;
  readonly maxTicks: number;
  readonly allObjectivesResolved: boolean;
  readonly livingAttackers: number;
  readonly livingDefenders: number;
}): Termination | undefined {
  if (input.engagementTick >= MAX_ENGAGEMENT_TICKS) {
    return { reason: RAID_END_REASON.ceilingReached };
  }
  if (input.raid.portalStability <= 0) return { reason: RAID_END_REASON.portalCollapsed };
  if (input.allObjectivesResolved) return { reason: RAID_END_REASON.objectivesResolved };
  if (input.livingAttackers === 0) {
    return { reason: RAID_END_REASON.sideEliminated, eliminated: RAID_SIDE.attacker };
  }
  if (input.livingDefenders === 0) {
    return { reason: RAID_END_REASON.sideEliminated, eliminated: RAID_SIDE.defender };
  }
  return undefined;
}

/**
 * The invariant violation raised when a raid reaches the compile-time ceiling.
 *
 * A distinct error type, because reaching the ceiling is not an ordinary
 * failure: it is proof that the decrement guarantee has been broken somewhere,
 * and a test that swallowed it as "a long raid" would let the whole termination
 * argument rot. It is thrown *after* the raid has been resolved, so a caller
 * that catches it still holds a complete outcome record rather than a half-run
 * battle.
 */
export class EngagementCeilingReached extends Error {
  constructor(engagementTick: number) {
    super(
      `A raid reached engagement tick ${String(engagementTick)}, the MAX_ENGAGEMENT_TICKS ` +
        'ceiling. That is not a long raid — it is proof that the portal stability decrement did ' +
        'not run on every tick, or that the decay was not the authored integer the content loader ' +
        'checked. The raid has been resolved so that no caller is left holding half a battle, and ' +
        'this is raised so that the suite fails at the cause rather than reporting a suspicious ' +
        'raidLengthDistribution three releases later.',
    );
    this.name = 'EngagementCeilingReached';
  }
}

/**
 * Victory, as a **total function** of the final state.
 *
 * The attacker wins when the value she took reaches the threshold — a fraction
 * of the total on the field — and the defender wins otherwise. There is no
 * third answer: no draw, no undetermined, no both. That is not a stylistic
 * choice. `winRateByPrimitive` is a *rate*, and a rate whose denominator
 * silently excludes the raids that ended in some other way is a measurement of
 * whatever subset happened not to be excluded.
 *
 * "Otherwise" doing the work is deliberate. An attacker who is wiped out, an
 * attacker who runs out of time, and an attacker who never left the deployment
 * zone are the same outcome from the defender's point of view — the raid was
 * survived — and the outcome record carries the reason separately for anyone
 * who wants to tell them apart.
 */
export function victorOf(input: {
  readonly takenValue: number;
  readonly totalValue: number;
  readonly victoryThresholdFraction: number;
}): RaidSideValue {
  // Cross-multiplied rather than divided: `taken / total >= threshold / 1024`
  // with no division at all, so there is no rounding to argue about and a total
  // of zero cannot produce a division by zero. A universe with nothing to take
  // is a universe the attacker cannot win against, which is the right answer
  // and falls out of the arithmetic rather than needing a special case.
  const reached = input.takenValue * 1024 >= input.totalValue * input.victoryThresholdFraction;
  const attackerHasSomethingToWin = input.totalValue > 0;
  return reached && attackerHasSomethingToWin ? RAID_SIDE.attacker : RAID_SIDE.defender;
}
