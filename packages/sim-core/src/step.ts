/*
 * Multiverse Mages — the pure step contract.
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

import type { TimeMode } from './clock.js';
import { TIME_MODE, advanceClock, currentTick, enterEngagement, leaveEngagement } from './clock.js';
import type { RngSource } from './rng/source.js';
import type { Action, StepContext, StepRng, SimState } from './state.js';

export type { Action, StepContext, System } from './state.js';

/**
 * Action kinds the core itself understands.
 *
 * Numbered from the top of the `uint16` range so they cannot collide with the
 * god's action space, which `contracts.md` §4.2 numbers from 0 and which
 * `god-agency` owns. The core knows about exactly three things: doing nothing,
 * and the two clock transitions.
 */
export const CORE_ACTION = {
  /** Does nothing, legally. Not counted as illegal. */
  noop: 0,
  /** Enters engagement mode at the end of this tick. */
  enterEngagement: 65534,
  /** Returns to world time at the end of this tick. */
  leaveEngagement: 65535,
} as const;

/**
 * Tracks the mode this tick is heading for, evaluating each request in
 * submission order against the mode that would hold when it arrived.
 *
 * The obvious implementation — fold every request into one "final wish" and
 * apply it at the end — was what this did first, and adversarial testing found
 * two things wrong with it, neither of which the spec settles:
 *
 * 1. Ten illegal `enterEngagement` actions in one tick counted as **one**
 *    illegal action. `contracts.md` §4.2 says an agent that submits an illegal
 *    action gets a no-op and a counter increment — per action. Undercounting
 *    makes `illegalActionRate` (§7) quietly wrong against any per-submission
 *    denominator, which is a balance metric nobody would think to distrust.
 * 2. Worse: submitting `[enterEngagement, leaveEngagement]` from world mode
 *    applied *neither*. Last-one-wins made the illegal `leaveEngagement` the
 *    final wish, so the **legal** `enterEngagement` produced no effect and left
 *    no trace anywhere — not in the clock, not in the counter. A legal action
 *    that silently does nothing is the worst outcome available: an agent
 *    cannot learn from it and a human cannot debug it.
 *
 * Sequential evaluation fixes both and costs one integer. A tick may now
 * legally return to the mode it started in, having transitioned twice; that
 * nets to no clock change, which is correct — it is what the caller asked for.
 */
class PendingMode {
  #mode: TimeMode;
  #transitions = 0;
  readonly #initial: TimeMode;

  constructor(mode: TimeMode) {
    this.#mode = mode;
    this.#initial = mode;
  }

  /** Whether the mode ends the tick somewhere other than it started. */
  get changed(): boolean {
    return this.#mode !== this.#initial;
  }

  /**
   * Whether the tick left and re-entered the mode it started in.
   *
   * Distinguished from {@link changed} because the two need different handling
   * and conflating them was a bug: `[leaveEngagement, enterEngagement]` in one
   * tick is two legal actions that end where they began, so nothing was
   * applied and `engagementTick` kept counting from the old engagement — a
   * *new* engagement silently continuing the old one's clock, in flat
   * contradiction of `enterEngagement`'s documented contract.
   */
  get cycled(): boolean {
    return !this.changed && this.#transitions > 0;
  }

  get target(): TimeMode {
    return this.#mode;
  }

  /** Requests a mode. Returns `false` — meaning illegal — if already there. */
  request(mode: TimeMode): boolean {
    if (this.#mode === mode) {
      return false;
    }
    this.#mode = mode;
    this.#transitions += 1;
    return true;
  }
}

/**
 * Advances the simulation by one tick.
 *
 * **The signature is the contract.** Three inputs, one output, no ambient
 * state: no wall-clock read, no I/O, no module-level mutable anything. That is
 * what lets four independent consumers — the Monte Carlo harness, the Electron
 * client, the PvP server, and the RL bridge — agree exactly on what the
 * simulation does while driving it at completely different rates.
 *
 * The order within a tick is fixed and worth stating, because every rules
 * author will depend on it:
 *
 * 1. Clone. Nothing below can be observed by the caller's state.
 * 2. Read the clock actions in submission order, each judged against the mode
 *    the ones before it asked for. See {@link PendingMode}.
 * 3. Run systems in schema order, each seeing the tick the state *arrived*
 *    with. A system that draws randomness keys on that tick, so what a
 *    subsystem rolls is a function of when it rolled, not of how many systems
 *    ran before it.
 * 4. Apply the net mode change, if the tick ends somewhere it did not begin.
 * 5. Advance the clock exactly once.
 *
 * Steps 4 and 5 in that order are why entering engagement does not also age the
 * world by a month: the transition lands first, so the advance that follows is
 * an engagement tick.
 *
 * @param state - The state to advance. Never mutated.
 * @param actions - Actions submitted for this tick, in submission order.
 * @param rng - Seeded randomness whose root seed matches the state's.
 * @returns A new state one tick later.
 */
export function step(state: SimState, actions: readonly Action[], rng: RngSource): SimState {
  if (rng.rootSeed !== state.rootSeed) {
    throw new Error(
      `Root seed mismatch: the state was created with ${state.rootSeed} but the rng draws from ` +
        `${rng.rootSeed}. Every draw in a run must derive from one root seed, or the run is not ` +
        'reproducible from it.',
    );
  }

  const next = state.clone();
  const tick = currentTick(next.clock);
  const mode = next.clock.mode;

  const pending = new PendingMode(mode);

  /**
   * A request from a submitted action. A redundant one is an illegal *agent*
   * action and is counted as such.
   */
  const requestByAction = (target: TimeMode): void => {
    if (!pending.request(target)) {
      next.noteIllegalAction();
    }
  };

  /**
   * A request from a system. Deliberately *not* counted.
   *
   * `illegalActionCount` means "agent submissions the core rejected" — it is
   * what `illegalActionRate` (contracts.md §7) is computed from, against a
   * per-submission denominator. A system asking to stay in the mode it is
   * already in is the rules being idempotent, not an agent making a mistake,
   * and counting it made a world whose only system calls `requestWorldTime()`
   * report one illegal action per tick with no agent in the loop at all.
   */
  const requestBySystem = (target: TimeMode): void => {
    pending.request(target);
  };

  // Actions first, then systems. A system therefore sees the mode the god's
  // actions have already asked for, and can override it — a raid that must
  // begin as a rules consequence outranks a request to stay in world time.
  // Stated because it is precedence, and undocumented precedence is a bug
  // waiting for two readers to disagree.
  for (const action of actions) {
    switch (action.kind) {
      case CORE_ACTION.enterEngagement:
        requestByAction(TIME_MODE.engagement);
        break;
      case CORE_ACTION.leaveEngagement:
        requestByAction(TIME_MODE.world);
        break;
      default:
        // Every other kind belongs to a rules layer, which reads `ctx.actions`
        // itself. The core does not know what they mean and does not judge
        // them — an unrecognised kind here is not illegal, it is somebody
        // else's vocabulary.
        break;
    }
  }

  // Bound to the step ordinal, not to `tick`. See `StepRng` and `Clock.stepOrdinal`.
  const ordinal = next.clock.stepOrdinal;
  const boundRng: StepRng = {
    rootSeed: rng.rootSeed,
    stream: (subsystemId) => rng.stream(subsystemId, ordinal),
    actorStream: (subsystemId, actorKey) => rng.actorStream(subsystemId, ordinal, actorKey),
  };

  const context: StepContext = {
    state: next,
    actions,
    rng: boundRng,
    tick,
    mode,
    requestEngagement() {
      requestBySystem(TIME_MODE.engagement);
    },
    requestWorldTime() {
      requestBySystem(TIME_MODE.world);
    },
  };

  for (const system of next.schema.systems) {
    system.run(context);
  }

  if (pending.changed) {
    if (pending.target === TIME_MODE.engagement) {
      enterEngagement(next.clock);
    } else {
      leaveEngagement(next.clock);
    }
  } else if (pending.cycled && pending.target === TIME_MODE.engagement) {
    // Left and re-entered within one tick: a new engagement, so its clock
    // starts at zero like any other. Without this the second engagement would
    // silently inherit the first one's tick count.
    leaveEngagement(next.clock);
    enterEngagement(next.clock);
  }

  advanceClock(next.clock);
  return next;
}
