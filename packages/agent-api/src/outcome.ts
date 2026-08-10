/*
 * Multiverse Mages — the outcome record, and reward as a pluggable function over it.
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
 * `docs/design/contracts.md` §4.3:
 *
 * > The core emits **no reward**. Reward is a property of a training objective,
 * > not of the game, and baking one in would make every trained agent a hostage
 * > to one researcher's choice.
 * >
 * > Instead the core emits, alongside each observation, an **outcome record**:
 * > terminal flag, terminal reason, era, and the balance-metric deltas since the
 * > previous step. The `agent-api` layer exposes a *pluggable* reward function
 * > over that record.
 *
 * So {@link outcomeOf} reports facts, {@link RewardFunction} is a parameter, and
 * {@link sparseTerminalReward} is one implementation among the many a
 * researcher may write — the *shipped default*, not the reward.
 *
 * ## Terminal and truncated are separate fields, deliberately
 *
 * §4.3: *"A truncated episode is flagged distinctly from a terminal one;
 * bootstrapping value estimates through the two differs, and conflating them is
 * a silent training bug."* The bug is silent in the strict sense — a policy
 * trained through a conflated boundary converges to something, just to the
 * wrong thing, and no test anywhere fails. Two booleans cost nothing and remove
 * the possibility.
 *
 * Note which side the truncation lives on: *"a step limit imposed by the
 * caller, never by the core."* Nothing in this package counts steps. The caller
 * passes `truncated` in, because the caller is the only party that knows.
 *
 * ## A raid does not end an episode
 *
 * §4.3: *"A raid is inside an episode, not its own episode. The clock changes
 * mode; the episode does not end."* Nothing here reads the clock mode, and that
 * absence is the implementation of that sentence.
 */

import type { SimState } from '@mm/sim-core';
import { eraOf } from '@mm/sim-core';
import { TERMINAL_REASON, findUniverse, readUniverse } from '@mm/state';

/**
 * The balance-metric deltas §4.3 asks for, by §7 metric name.
 *
 * **Empty today, and honestly so.** §7 says a metric whose mechanic does not
 * yet exist reports `{status: "unavailable", reason: "mechanic-absent"}` and
 * *"is never absent from the output"* — but §7 also puts the metric registry
 * and its `definitionVersion` in the `agent-interface` capability, which is a
 * later change. Populating this map now would mean inventing definitions here
 * that `agent-interface` then owns, and §7's whole warning is that *"a metric
 * whose definition drifts silently makes every committed baseline meaningless
 * while still appearing green"*. So the field exists, is typed, and is left for
 * the capability that owns the definitions to fill.
 */
export type BalanceMetricDeltas = Readonly<Record<string, number>>;

/** What §4.3 has the core emit alongside every observation. Facts only, no reward. */
export interface OutcomeRecord {
  /**
   * The run reached an end state of its own: ascension (vision §8a) or
   * stagnation as `god-agency` defines it.
   */
  readonly terminal: boolean;
  /**
   * The caller's step limit was reached. Distinct from {@link terminal} — see
   * this module's opening note.
   */
  readonly truncated: boolean;
  /** {@link TERMINAL_REASON}. `none` while the run is live. */
  readonly terminalReason: number;
  /** §1.1's derived era: `floor(worldTick / ERA_TICKS)`. */
  readonly era: number;
  /** Since the previous step. See {@link BalanceMetricDeltas}. */
  readonly metricDeltas: BalanceMetricDeltas;
}

/** Options for {@link outcomeOf}. */
export interface OutcomeInput {
  readonly state: SimState;
  /**
   * Whether the caller's step limit has been reached.
   *
   * A parameter and not a computation: §4.3 makes truncation *"a step limit
   * imposed by the caller, never by the core"*, and a package that decided it
   * for itself would be imposing one.
   */
  readonly truncated?: boolean;
}

/** Reads §4.3's outcome record out of state. */
export function outcomeOf(input: OutcomeInput): OutcomeRecord {
  const { state } = input;
  const universe = findUniverse(state);
  const era = eraOf(state.clock.worldTick);

  if (universe === 0) {
    return Object.freeze({
      terminal: false,
      truncated: input.truncated ?? false,
      terminalReason: TERMINAL_REASON.none,
      era,
      metricDeltas: Object.freeze({}),
    });
  }

  const record = readUniverse(state, universe);
  return Object.freeze({
    // Read off `terminalReason` rather than off `ascended`. §1.1 gives the
    // universe both, and `ascended` covers only one of the four ways a run can
    // end — a stagnated run has `ascended === 0` and is emphatically over.
    terminal: record.terminalReason !== TERMINAL_REASON.none,
    truncated: input.truncated ?? false,
    terminalReason: record.terminalReason,
    era,
    metricDeltas: Object.freeze({}),
  });
}

/**
 * A reward, as a training objective defines it.
 *
 * The signature takes the outcome record and nothing else on purpose. A reward
 * function handed the whole state could read anything — and the moment one
 * does, §4.3's separation between "what the game reports" and "what this
 * researcher is optimizing" stops being enforced by anything.
 */
export type RewardFunction = (outcome: OutcomeRecord) => number;

/**
 * The shipped default: **sparse and terminal**.
 *
 * §4.3: *"ascension `+1`, stagnation `0`, nothing in between."* Both ascension
 * reasons (§1.1's apotheosis and canon) score `+1`; the document says
 * "ascension" without distinguishing them, and vision §8a treats them as two
 * routes to the same end.
 *
 * A truncated episode scores `0` and is *not* terminal — the caller's
 * bootstrapping, not this function, is what has to treat it differently, which
 * is why {@link OutcomeRecord} carries the flag separately.
 *
 * This is a default, not a recommendation. A sparse terminal reward over a run
 * hundreds of world-years long is a hard credit-assignment problem, and a
 * researcher will almost certainly want shaping. The point of §4.3 is that they
 * write it rather than inherit ours.
 */
export const sparseTerminalReward: RewardFunction = (outcome) => {
  if (!outcome.terminal) return 0;
  switch (outcome.terminalReason) {
    case TERMINAL_REASON.ascensionApotheosis:
    case TERMINAL_REASON.ascensionCanon:
      return 1;
    default:
      return 0;
  }
};
