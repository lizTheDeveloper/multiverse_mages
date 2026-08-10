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

import { TIME_MODE, advanceClock, currentTick, enterEngagement, leaveEngagement } from './clock.js';
import type { RngSource } from './rng/source.js';
import type { Action, StepContext, SimState } from './state.js';

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

/** No transition requested this tick. */
const NO_TRANSITION = 0;
const TO_ENGAGEMENT = 1;
const TO_WORLD = 2;

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
 * 2. Run systems in schema order, each seeing the tick the state *arrived*
 *    with. A system that draws randomness keys on that tick, so what a
 *    subsystem rolls is a function of when it rolled, not of how many systems
 *    ran before it.
 * 3. Apply at most one mode transition.
 * 4. Advance the clock exactly once.
 *
 * Steps 3 and 4 in that order are why entering engagement does not also age the
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

  let transition = NO_TRANSITION;
  const context: StepContext = {
    state: next,
    actions,
    rng,
    tick,
    mode,
    requestEngagement() {
      transition = TO_ENGAGEMENT;
    },
    requestWorldTime() {
      transition = TO_WORLD;
    },
  };

  for (const action of actions) {
    switch (action.kind) {
      case CORE_ACTION.enterEngagement:
        transition = TO_ENGAGEMENT;
        break;
      case CORE_ACTION.leaveEngagement:
        transition = TO_WORLD;
        break;
      default:
        // Every other kind belongs to a rules layer, which reads `ctx.actions`
        // itself. The core does not know what they mean and does not judge
        // them — an unrecognised kind here is not illegal, it is somebody
        // else's vocabulary.
        break;
    }
  }

  for (const system of next.schema.systems) {
    system.run(context);
  }

  applyTransition(next, transition);

  advanceClock(next.clock);
  return next;
}

/**
 * Applies a requested mode transition, counting a redundant one as illegal.
 *
 * Redundant rather than exceptional: `contracts.md` §4.2 requires an illegal
 * action to be a cheap no-op and a counter increment. An agent that has not
 * learned the clock yet will ask to enter an engagement it is already in
 * thousands of times per training run, and each one must cost a branch and a
 * increment, not a thrown error and an unwound step.
 */
function applyTransition(state: SimState, transition: number): void {
  if (transition === NO_TRANSITION) {
    return;
  }

  const inEngagement = state.clock.mode === TIME_MODE.engagement;
  if (transition === TO_ENGAGEMENT) {
    if (inEngagement) {
      state.illegalActionCount += 1;
      return;
    }
    enterEngagement(state.clock);
    return;
  }

  if (!inEngagement) {
    state.illegalActionCount += 1;
    return;
  }
  leaveEngagement(state.clock);
}
