/*
 * Multiverse Mages — cap clamping, and the counters that make a cap visible.
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
 * ## Why the counters are not optional decoration
 *
 * `docs/design/contracts.md` §3 and the change's design note say the same
 * thing, and it is easy to skim past: **the caps are set to be reachable**, so
 * the balance harness measures behaviour at the cap rather than discovering it
 * in live play.
 *
 * That intent has a consequence nobody enforces by accident. A cap that binds
 * on every single evaluation and a cap that never binds at all produce
 * *identical* output — a number that is simply always 4096, or simply never
 * 4096. Nothing in the state distinguishes "this rate saturated three ticks in"
 * from "this rate is comfortably below its ceiling". Without a counter, a
 * primitive whose cap is permanently pinned looks exactly like a primitive
 * whose cap is well chosen, and the balance finding — that the cap, not the
 * design, is deciding the game — is invisible.
 *
 * So every clamp increments a per-primitive counter, and the counter is part of
 * what the harness reports. That is the whole justification for
 * {@link ClampCounters} existing rather than the clamp being a bare `Math.min`.
 */

import { fromInt, mul } from '@mm/sim-core';
import type { Fixed } from '@mm/sim-core';
import type { PrimitiveCap, PrimitiveStacking } from '@mm/content';

/**
 * What a cap needs from the caller that the registry cannot know.
 *
 * Only `fraction-of-species-base` needs anything: `lifespan` is capped at "+50%
 * of species base", and the base belongs to the cohort being evaluated, not to
 * the primitive.
 */
export interface CapContext {
  /**
   * The species' base value a `fraction-of-species-base` cap is a fraction of —
   * for `lifespan`, the species' base lifespan in fp months.
   */
  readonly speciesBase?: Fixed;
}

/** The outcome of a clamp: the value that survived, and whether it was cut. */
export interface CapOutcome {
  readonly value: Fixed;
  /** True exactly when the cap bound. This is what gets counted. */
  readonly clamped: boolean;
}

/**
 * The effective ceiling for a cap, in the primitive's own units, or `undefined`
 * when the primitive is uncapped.
 *
 * The three capped kinds read their `value` field differently, which is the
 * kind of thing that gets assumed wrong once and never revisited:
 *
 * - **`fp`** — the ceiling itself, already at scale 1024. `fp(4096)` is 4.0×.
 * - **`fraction-of-species-base`** — a *fraction*, `fp(512)` meaning "half",
 *   multiplied by the caller's base. The `+50%` in the contract table caps the
 *   bonus at half the base, not the total at one and a half times it, because
 *   `lifespan`'s unit is "additive months" — the magnitude being stacked is the
 *   bonus.
 * - **`count-per-side`** — a whole count of combatants, not an fp value.
 *   `summon` magnitudes are fp counts (`fp(1024)` is one combatant, per
 *   `node.json`), so the count is converted with `fromInt` before comparison.
 *   A cap of `8` read as an fp value would be eight one-thousand-and-twenty-
 *   fourths of a combatant, i.e. an effective ban on summoning.
 *
 * @throws RangeError if a capped kind carries no value, which the schema
 * permits structurally and the contract does not.
 */
export function capLimit(cap: PrimitiveCap, context: CapContext = {}): Fixed | undefined {
  if (cap.kind === 'none') {
    return undefined;
  }

  const value = cap.value;
  if (value === undefined) {
    throw new RangeError(
      `a "${cap.kind}" cap must declare a value; primitive.json omitted it. ` +
        'contracts.md §3 states a number for every cap that is not "none".',
    );
  }

  switch (cap.kind) {
    case 'fp':
      return value;
    case 'count-per-side':
      return fromInt(value);
    case 'fraction-of-species-base': {
      const base = context.speciesBase;
      if (base === undefined) {
        throw new RangeError(
          'a "fraction-of-species-base" cap needs the species base it is a fraction of. ' +
            'Pass speciesBase; the registry cannot know which cohort is being evaluated.',
        );
      }
      return mul(base, value);
    }
  }
}

/** The outcome of a floor: the value that survived, and whether it was raised. */
export interface FloorOutcome {
  readonly value: Fixed;
  /** True exactly when the floor bound. Counted separately from a clamp. */
  readonly floored: boolean;
}

/**
 * The lower bound a stacking rule imposes, or `undefined` when it imposes none.
 *
 * ## Why this is a property of the rule and not of the primitive
 *
 * `contracts.md` §3 states a ceiling for every rate multiplier and no floor,
 * which was sound for exactly as long as every authored magnitude was positive.
 * Once a node can express a **cost**, `(1 + Σ)` can cross zero, and a negative
 * multiplier does not slow a rate — it reverses it. Research progress would run
 * backwards, `scribingThroughput` would return negative scribe-months, and
 * `expectedBirths` would hand a cohort a negative headcount.
 *
 * `additive-into-multiplier` is the only rule with a `(1 + Σ)` to cross, so it
 * is the only one with a floor. Every other rule keeps the behaviour it always
 * had:
 *
 * - `additive` stays unfloored. `lifespan` is additive and its floor belongs to
 *   `effectiveLifespan`, which knows the species base a floor is relative to —
 *   a bound imposed here would be a bound on the *bonus* rather than on the
 *   life, and those are different numbers.
 * - `multiplicative-on-remainder`, `max` and `presence` never see a negative:
 *   the content loader refuses to author one on them, for reasons written down
 *   at the check itself.
 *
 * **Zero, not a small positive number.** A floor above zero would be a balance
 * magnitude living in code with no `tuningStatus` beside it, and it would cap
 * how strong a cost an author may write — the same class of defect as the
 * `"minimum": 1` this change removes. Zero says only what has to be true: the
 * work does not happen. What a zero rate *means* is then each consumer's to
 * honour, and all three do it the same way — the month produces nothing.
 */
export function stackingFloor(stacking: PrimitiveStacking): Fixed | undefined {
  return stacking === 'additive-into-multiplier' ? 0 : undefined;
}

/**
 * Raises a stacked value to its floor.
 *
 * Separate from {@link applyCap} rather than folded into a two-sided clamp,
 * because the two bounds come from different places and are counted separately:
 * the ceiling is the primitive's authored `cap`, the floor is its stacking
 * rule's, and a report that mixed them would make "this rate is pinned at its
 * ceiling" and "this rate has been costed into the ground" the same row.
 */
export function applyFloor(floor: Fixed | undefined, value: Fixed): FloorOutcome {
  if (floor === undefined || value >= floor) {
    return { value, floored: false };
  }
  return { value: floor, floored: true };
}

/**
 * Clamps a stacked value to its cap.
 *
 * Clamping here is one-sided on purpose: a cap is a ceiling, and a magnitude
 * below it — including a negative one from a debuff — is left exactly as it is.
 * The contract states no floor for a *cap*, and inventing one here would
 * quietly make debuffs unable to push a rate below its nominal value.
 *
 * The lower bound that does exist is {@link stackingFloor}'s, applied by
 * {@link import('./stack.js').stackMagnitudes} before this function and counted
 * in its own series. It bounds only the one rule whose `(1 + Σ)` can go
 * negative, which is a different statement from "every primitive has a floor".
 */
export function applyCap(
  cap: PrimitiveCap,
  value: Fixed,
  context: CapContext = {},
): CapOutcome {
  const limit = capLimit(cap, context);
  if (limit === undefined || value <= limit) {
    return { value, clamped: false };
  }
  return { value: limit, clamped: true };
}

/**
 * Per-primitive counts of how often a cap bound.
 *
 * Mutable and passed in by the caller rather than global, so a Monte Carlo
 * worker's counts belong to its run and two runs in one process cannot pollute
 * each other's metrics.
 */
export class ClampCounters {
  readonly #counts = new Map<string, number>();
  readonly #floors = new Map<string, number>();

  /** Records one clamp of `primitiveId`. */
  record(primitiveId: string): void {
    this.#counts.set(primitiveId, (this.#counts.get(primitiveId) ?? 0) + 1);
  }

  /**
   * Records one *floor* of `primitiveId`, in its own series.
   *
   * Kept apart from {@link record} rather than folded into it, and the reason
   * is the same one that makes the class exist. A ceiling that binds says *the
   * cap, not the design, is deciding the game*; a floor that binds says *a
   * stack of authored costs has stopped this rate entirely*. Those are opposite
   * findings, and `world-step.ts` already reports `rateClamps.total()` into the
   * capital emission — a floor arriving in that series would silently re-scale
   * a number that four releases of measurement are written against.
   */
  recordFloor(primitiveId: string): void {
    this.#floors.set(primitiveId, (this.#floors.get(primitiveId) ?? 0) + 1);
  }

  /** How many times `primitiveId` was clamped at its ceiling. `0` if never. */
  count(primitiveId: string): number {
    return this.#counts.get(primitiveId) ?? 0;
  }

  /** How many times `primitiveId` was raised to its floor. `0` if never. */
  floorCount(primitiveId: string): number {
    return this.#floors.get(primitiveId) ?? 0;
  }

  /** Ceiling clamps across all primitives. */
  total(): number {
    let sum = 0;
    for (const count of this.#counts.values()) {
      sum += count;
    }
    return sum;
  }

  /** Floors across all primitives. */
  floorTotal(): number {
    let sum = 0;
    for (const count of this.#floors.values()) {
      sum += count;
    }
    return sum;
  }

  /**
   * Every counted primitive and its count, **sorted by primitive id**.
   *
   * Sorted rather than insertion-ordered because this is a reported metric: a
   * harness report whose row order depended on which primitive happened to
   * clamp first would differ between two runs of the same seed, and a diff
   * that moves is a diff nobody reads.
   */
  entries(): readonly (readonly [string, number])[] {
    return [...this.#counts.entries()].sort(([left], [right]) => (left < right ? -1 : 1));
  }

  /** Every floored primitive and its count, sorted by primitive id, for the same reason. */
  floorEntries(): readonly (readonly [string, number])[] {
    return [...this.#floors.entries()].sort(([left], [right]) => (left < right ? -1 : 1));
  }

  /** Drops every count, ceilings and floors alike. For reusing a counter between runs. */
  reset(): void {
    this.#counts.clear();
    this.#floors.clear();
  }
}
