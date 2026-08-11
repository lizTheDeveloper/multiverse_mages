/*
 * Multiverse Mages — what the whole mage population chose this tick, as a
 * number rather than as a flat line in a later metric.
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

import { floorDiv } from '@mm/sim-core';
import type { ContentId, MageRoleValue } from '@mm/state';

import type { GoalId } from './goals.js';
import { GOALS_IN_ORDER, GOAL_COUNT } from './goals.js';

/**
 * ## Why this is not behind a debug flag
 *
 * The `mage-autonomy` spec: *"These outputs MUST be available without enabling
 * a debug mode."* `mages-and-species/design.md` says what the flag would cost:
 * the utility-AI *"will produce behaviour nobody predicted. That is the feature
 * … but it is also how a civilization deadlocks"*, mitigated *"by a
 * goal-selection histogram emitted per tick so an emergent monoculture is
 * visible as a number rather than as an unexplained flat line in
 * `timeToTierBySpecies`."*
 *
 * A histogram you have to turn on is a histogram nobody had on during the run
 * that went wrong. The counter is three integers per (species, role, goal) cell
 * and is written once per evaluation, which is cheap enough that the question
 * of whether to pay for it does not arise.
 *
 * ## Keying, and the iteration-order rule again
 *
 * Cells are addressed by a packed integer, and {@link entries} walks the cells
 * in ascending packed order. `Map` insertion order would be reproducible in
 * practice and still wrong in principle for the reason `select.ts` gives: it
 * makes a report depend on the history that reached a state rather than on the
 * state. A histogram is read by a balance analyst comparing two runs, so an
 * order that depends on who was promoted first is an order that makes two equal
 * runs look different.
 */

/** A cell: one species, one role, one goal. */
export interface HistogramCell {
  readonly speciesId: ContentId;
  readonly roleId: MageRoleValue;
  readonly goal: GoalId;
  readonly count: number;
}

/**
 * Packs a cell address into one integer.
 *
 * `roleId` is a `uint8` and a goal id fits in the same, so the two low fields
 * take 8 bits each and the species id takes the rest. Multiplication rather
 * than shifting, because a species id near the top of its `uint16` range shifted
 * left by 16 would leave the 32-bit signed range that `<<` operates in and come
 * back negative.
 */
function packCell(speciesId: ContentId, roleId: MageRoleValue, goal: GoalId): number {
  return (speciesId * 256 + roleId) * 256 + goal;
}

/**
 * The per-tick goal histogram and goal-switch counter.
 *
 * Mutable and accumulated, rather than returned per mage and summed by the
 * caller: the caller is a loop over every living mage, and a per-mage return
 * value that must be folded is a fold every call site can get wrong differently.
 */
export class GoalHistogram {
  private readonly cells = new Map<number, number>();
  private switches = 0;
  private evaluations = 0;
  private maskedTotal = 0;
  private selections = 0;

  /**
   * Records one mage's decision.
   *
   * @param evaluated - Whether goals were scored, as opposed to the phase
   * holding. Counted separately so that "a third of mages re-evaluated" is
   * checkable from the histogram rather than by instrumenting the scheduler.
   * @param maskedCount - Goals removed as infeasible in that evaluation.
   */
  record(
    speciesId: ContentId,
    roleId: MageRoleValue,
    goal: GoalId,
    options: {
      switched?: boolean | undefined;
      evaluated?: boolean | undefined;
      maskedCount?: number | undefined;
    } = {},
  ): void {
    const key = packCell(speciesId, roleId, goal);
    this.cells.set(key, (this.cells.get(key) ?? 0) + 1);
    this.selections += 1;
    if (options.switched === true) this.switches += 1;
    if (options.evaluated === true) this.evaluations += 1;
    this.maskedTotal += options.maskedCount ?? 0;
  }

  /** How many mages selected one goal, across every species and role. */
  countOf(goal: GoalId): number {
    let total = 0;
    for (const [key, count] of this.cells) {
      if (key % 256 === goal) total += count;
    }
    return total;
  }

  /** How many mages of one species and role selected one goal. */
  countIn(speciesId: ContentId, roleId: MageRoleValue, goal: GoalId): number {
    return this.cells.get(packCell(speciesId, roleId, goal)) ?? 0;
  }

  /** Every non-empty cell, in ascending packed order. */
  entries(): readonly HistogramCell[] {
    const keys = [...this.cells.keys()].sort((a, b) => a - b);
    return keys.map((key) => {
      const goal = key % 256;
      const roleId = floorDiv(key, 256) % 256;
      const speciesId = floorDiv(key, 65536);
      return {
        speciesId,
        roleId: roleId as MageRoleValue,
        goal: goal as GoalId,
        count: this.cells.get(key) ?? 0,
      };
    });
  }

  /** Mages who changed goal this tick. */
  get goalSwitches(): number {
    return this.switches;
  }

  /** Mages who scored their options this tick, as opposed to holding. */
  get evaluationCount(): number {
    return this.evaluations;
  }

  /** Goals masked as infeasible, summed over this tick's evaluations. */
  get maskedGoalCount(): number {
    return this.maskedTotal;
  }

  /** Mages recorded this tick, whether they re-evaluated or held. */
  get total(): number {
    return this.selections;
  }

  /**
   * The share of this tick's mages that chose the most popular goal, in fixed
   * point, and which goal it was.
   *
   * The monoculture detector the spec's last scenario asks for. Returns
   * `fp(1024)` for a universe where every mage is doing the same thing and
   * `fp(0)` for an empty one — an empty tick is not a monoculture, and reporting
   * it as total agreement would fire the alarm on a universe with no mages left,
   * which is a different and much worse problem with its own signal.
   */
  dominant(): { goal: GoalId; share: number } {
    if (this.selections === 0) return { goal: GOALS_IN_ORDER[0] ?? 0, share: 0 };
    let bestGoal: GoalId = GOALS_IN_ORDER[0] ?? 0;
    let bestCount = -1;
    for (const goal of GOALS_IN_ORDER) {
      const count = this.countOf(goal);
      if (count > bestCount) {
        bestCount = count;
        bestGoal = goal;
      }
    }
    return { goal: bestGoal, share: floorDiv(bestCount * 1024, this.selections) };
  }
}

/**
 * The share of living mages on one goal past which a tick counts as a
 * monoculture. **Untuned.**
 *
 * `fp(896)` is seven eighths. Documented as a constant rather than left to the
 * reader because the spec's scenario says "more than a documented fraction",
 * and a fraction documented only in prose is one no test can be written
 * against.
 */
export const MONOCULTURE_SHARE = 896;

/** Sustained ticks above {@link MONOCULTURE_SHARE} before it is worth reporting. **Untuned.** */
export const MONOCULTURE_SUSTAINED_TICKS = 12;

/** How many cells a fully populated histogram could hold, for a sizing sanity check. */
export function histogramCellCount(speciesCount: number, roleCount: number): number {
  return speciesCount * roleCount * GOAL_COUNT;
}
