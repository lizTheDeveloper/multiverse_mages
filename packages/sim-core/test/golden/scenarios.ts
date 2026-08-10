/*
 * Multiverse Mages — the scenarios the committed golden fixtures are recorded from.
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

import type { Action } from '../../src/state.js';
import { CORE_ACTION } from '../../src/step.js';
import { ACADEMY_WORLD_ID, GOLDEN_ACTION } from './worlds.js';

/**
 * A recipe for one fixture.
 *
 * Read only by `scripts/regen-goldens.mjs`. The verification suite never sees
 * this file: it replays the *recorded* action log off disk, which is what makes
 * a fixture a record of what happened rather than a second chance to re-derive
 * it. If this module and a fixture ever disagree, the fixture is the fixture —
 * and disagreeing is precisely what regeneration is for.
 */
export interface GoldenScenario {
  /** Fixture file basename, without the extension. */
  readonly name: string;
  /** What this fixture is *for*. Copied into the fixture and read by reviewers. */
  readonly description: string;
  readonly worldId: string;
  readonly rootSeed: number;
  /**
   * Steps taken before recording begins, one entry per step.
   *
   * The state they leave behind becomes the fixture's initial snapshot, so a
   * fixture with a prelude starts from a populated world. That is worth having
   * for at least one fixture: a harness that ignored `initialSnapshot` and
   * replayed from a fresh state would still produce plausible-looking output
   * from an all-empty fixture, and would sail through.
   */
  readonly prelude: readonly (readonly Action[])[];
  /** The recorded steps, one entry per step, in order. */
  readonly script: readonly (readonly Action[])[];
}

const enroll: Action = { kind: GOLDEN_ACTION.enroll };
const graduate = (slot: number): Action => ({ kind: GOLDEN_ACTION.graduate, params: [slot] });
const endow = (slot: number, amount: number): Action => ({
  kind: GOLDEN_ACTION.endow,
  params: [slot, amount],
});

/** `count` steps that submit nothing. Time passing is itself a thing to record. */
const idle = (count: number): readonly (readonly Action[])[] =>
  Array.from({ length: count }, () => []);

/**
 * Two world years of ordinary time, and nothing else.
 *
 * The point is not the clock. Every one of these 24 steps runs `study` and
 * `attrition`, so every step draws from two seeded actor streams per scholar —
 * which is what makes this fixture the one that trips first when a float, an
 * unseeded draw, or a re-ordered stream reaches the rules path.
 */
const worldTimeOnly: GoldenScenario = {
  name: 'world-time-only',
  description:
    'Twenty-four world ticks with no mode change: seeded study and attrition draws every tick, ' +
    'plus one component write at a near-maximum uint32 to keep the unsigned width honest.',
  worldId: ACADEMY_WORLD_ID,
  rootSeed: 20260810,
  prelude: [],
  script: [
    [enroll, enroll, enroll, enroll],
    [enroll, enroll],
    [endow(0, 4000000000)],
    ...idle(21),
  ],
};

/**
 * World time, an engagement, and the return to world time.
 *
 * The return leg is half the requirement and the half that breaks: world time
 * must resume at exactly the tick it froze at, and `attrition` must go back to
 * biting at the world rate. A fixture that entered an engagement and stopped
 * would pass with the exit path completely broken.
 */
const engagementTransition: GoldenScenario = {
  name: 'engagement-transition',
  description:
    'Three world ticks, then an engagement entered by action, six engagement ticks (one of which ' +
    'enrolls, so entities are created at the engagement scale), then a return to world time and ' +
    'eleven more world ticks.',
  worldId: ACADEMY_WORLD_ID,
  rootSeed: 991733,
  prelude: [],
  script: [
    [enroll, enroll, enroll],
    [],
    [{ kind: CORE_ACTION.enterEngagement }],
    ...idle(2),
    [enroll],
    ...idle(2),
    [{ kind: CORE_ACTION.leaveEngagement }],
    ...idle(11),
  ],
};

/**
 * Sustained create/destroy pressure, so slots recycle through the free list.
 *
 * Interleaved rather than create-many-then-destroy-many. A bulk create followed
 * by a bulk destroy exercises neither the LIFO ordering of the free list nor
 * generation counters climbing past their first value; interleaving does both,
 * and those are the two mechanisms whose reproducibility everything downstream
 * of the entity store depends on.
 */
const entityChurn: GoldenScenario = {
  name: 'entity-churn',
  description:
    'Starts from a world populated by a twelve-scholar prelude, then thirty-six ticks that each ' +
    'enroll two scholars and graduate two slots, so slots are freed and reissued continuously and ' +
    'generation counters climb well past one.',
  worldId: ACADEMY_WORLD_ID,
  rootSeed: 5150,
  prelude: [[enroll, enroll, enroll, enroll], [enroll, enroll, enroll, enroll], [enroll, enroll, enroll, enroll]],
  script: Array.from({ length: 36 }, (_unused, tick) => [
    enroll,
    enroll,
    graduate((tick * 5) % 14),
    graduate((tick * 9) % 14),
  ]),
};

/**
 * Every scenario the regeneration command writes.
 *
 * Order here is the order fixtures are regenerated and reported in, nothing
 * more — the verification suite discovers fixture *files*, not this list, so a
 * fixture cannot quietly stop being checked by falling out of an array.
 */
export const GOLDEN_SCENARIOS: readonly GoldenScenario[] = [
  worldTimeOnly,
  engagementTransition,
  entityChurn,
];
