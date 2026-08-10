/*
 * Multiverse Mages — the scripts the golden fixtures were recorded from.
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

import type { Action } from '@mm/sim-core';
import { CORE_ACTION } from '@mm/sim-core';

import { GOLDEN_ACTION } from './worlds.ts';

/**
 * ## What a scenario is, and what reads it
 *
 * A scenario is the recipe a fixture was baked from: which world, which seed,
 * and what was submitted on each tick. **The test suite never reads this file.**
 * It reads the committed fixture, because the fixture is the frozen artifact and
 * the recipe is not — a check that re-derived its own expectation from the same
 * code it is checking would pass unconditionally.
 *
 * The recipes are committed anyway, for two reasons. A reviewer looking at a
 * regenerated fixture needs to see whether the *scenario* changed or the
 * *behaviour* did, and that is a diff of this file against a diff of the JSON.
 * And a scenario is where the claim "these three fixtures cover world time, an
 * engagement transition, and heavy entity churn" is actually made good; the
 * golden suite asserts each fixture still exhibits its coverage, but this is
 * where it is arranged.
 *
 * ## Why the scripts are computed rather than written out
 *
 * The recorded action log lands in the fixture verbatim, so nothing here has to
 * be reproducible later — it runs once, at regeneration. Computing the scripts
 * from integer recurrences keeps them long enough to be interesting (eighty
 * ticks of churn is a hundred-odd actions) without a hundred lines of literal
 * JSON in the repository, and keeps the intent legible: "cull the slot two
 * behind the write head" says what it does in a way a table of slot numbers
 * does not.
 */

export interface Scenario {
  readonly name: string;
  readonly fileName: string;
  readonly description: string;
  /** Key into `GOLDEN_WORLDS`. */
  readonly world: string;
  readonly rootSeed: number;
  /** Content revision the recorded state was created with. */
  readonly contentRevision: number;
  /** One entry per step, in submission order within the step. */
  script(): readonly (readonly Action[])[];
}

const spawn = (): Action => ({ kind: GOLDEN_ACTION.spawn });
const cull = (slot: number): Action => ({ kind: GOLDEN_ACTION.cull, params: [slot] });
const promote = (slot: number): Action => ({ kind: GOLDEN_ACTION.promote, params: [slot] });

/**
 * World time only: months pass, realms grow, and the clock never leaves world
 * scale.
 *
 * The plainest thing the substrate does, and therefore the fixture most likely
 * to catch a change nobody thought was risky — a different rounding in `mul`, a
 * reordered draw in a per-tick stream, an era boundary computed one tick early.
 */
const worldTimeOnly: Scenario = {
  name: 'world-time-only',
  fileName: 'world-time-only.json',
  description:
    'Forty-eight world ticks in the chronicle world, with no engagement and no destruction: ' +
    'population growth through fixed-point multiplication, a per-tick populace stream, and an ' +
    'era boundary crossed by the clock rather than counted by a system.',
  world: 'chronicle',
  rootSeed: 909090,
  contentRevision: 0x0c0ffee1,
  script() {
    const ticks: Action[][] = [];
    for (let tick = 0; tick < 48; tick += 1) {
      // Three realms at the start, then one more at each of two later moments,
      // so the component gains rows after slots have already been written.
      if (tick === 0) {
        ticks.push([spawn(), spawn(), spawn()]);
      } else if (tick === 11 || tick === 29) {
        ticks.push([spawn()]);
      } else {
        ticks.push([]);
      }
    }
    return ticks;
  },
};

/**
 * A raid, twice: world time freezes, engagement ticks run, and world time
 * resumes from exactly where it stopped.
 *
 * Two transitions rather than one, because a single one cannot distinguish
 * "engagement time works" from "the clock happens to be monotonic". The second
 * entry also re-enters at a non-zero engagement history, which is where a
 * snapshot that restored `engagementTick` instead of resetting it would show up.
 */
const engagementTransition: Scenario = {
  name: 'engagement-transition',
  fileName: 'engagement-transition.json',
  description:
    'Forty ticks in the warband world spanning two engagements. World time freezes across each, ' +
    'combat draws from per-actor streams at engagement rates, warriors fall and are buried, and ' +
    'world time resumes at the tick it stopped on.',
  world: 'warband',
  rootSeed: 313131,
  contentRevision: 0x0c0ffee1,
  script() {
    const ticks: Action[][] = [];
    for (let tick = 0; tick < 40; tick += 1) {
      const actions: Action[] = [];
      if (tick < 4) {
        actions.push(spawn(), spawn());
      }
      if (tick === 8 || tick === 28) {
        actions.push({ kind: CORE_ACTION.enterEngagement });
      }
      if (tick === 20 || tick === 34) {
        actions.push({ kind: CORE_ACTION.leaveEngagement });
      }
      // Reinforcements arrive mid-raid, so entity creation happens on the
      // engagement scale as well as the world one.
      if (tick === 12 || tick === 16 || tick === 31) {
        actions.push(spawn());
      }
      if (tick === 22 || tick === 26) {
        actions.push(promote(tick % 8));
      }
      ticks.push(actions);
    }
    return ticks;
  },
};

/**
 * Heavy churn: create and destroy hard enough that slot reuse, generation
 * bumps, and swap-removal all happen constantly.
 *
 * This is the fixture that would catch a snapshot which rebuilt the free list
 * from the dead slots instead of preserving its order. Everything looks correct
 * on restore; the very next `create` returns a different slot, and every hash
 * after that disagrees.
 */
const entityChurn: Scenario = {
  name: 'entity-churn',
  fileName: 'entity-churn.json',
  description:
    'Eighty ticks in the warband world with two or three musters and up to two culls every tick, ' +
    'plus combat deaths. Slots are recycled continuously, so the free list order, the generation ' +
    'counters, and the component stores swap-removal are all exercised across the snapshot.',
  world: 'warband',
  rootSeed: 777001,
  contentRevision: 0x0c0ffee1,
  script() {
    const ticks: Action[][] = [];
    // A plain integer recurrence, not randomness: the log is committed
    // verbatim, so all this has to do is vary.
    let walk = 5;
    for (let tick = 0; tick < 80; tick += 1) {
      walk = (walk * 31 + 17) % 251;
      const actions: Action[] = [spawn(), spawn()];
      if (walk % 3 === 0) {
        actions.push(spawn());
      }
      if (tick >= 4) {
        actions.push(cull(walk % 24));
        if (walk % 5 === 0) {
          actions.push(cull((walk + 7) % 24));
        }
      }
      if (tick % 9 === 0) {
        actions.push(promote(walk % 16));
      }
      // One engagement in the middle, so churn is exercised at both scales.
      if (tick === 40) {
        actions.push({ kind: CORE_ACTION.enterEngagement });
      }
      if (tick === 52) {
        actions.push({ kind: CORE_ACTION.leaveEngagement });
      }
      ticks.push(actions);
    }
    return ticks;
  },
};

export const SCENARIOS: readonly Scenario[] = [worldTimeOnly, engagementTransition, entityChurn];
