/*
 * Multiverse Mages — one world tick of mage autonomy, over persisted
 * commitments.
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
 * The loop `select.ts` was written to be called from.
 *
 * Everything upstream of here is a pure function of one mage's outlook and one
 * commitment; this is the only place that reads the world, and its whole job is
 * the two edges of a tick: fetch each living mage's incumbent commitment out of
 * state, and put the resulting one back. Hysteresis and the stagger both work
 * only because those two happen against a **persisted** commitment — a
 * per-process value would make every mage's commitment clock restart on load.
 *
 * ## Ascending slot order, and no other order
 *
 * Mages are visited through `ComponentStore.forEach`, which is slot-ordered by
 * construction. Row order is a function of the destroy history, so a loop over
 * rows would visit two identical universes in different orders — and since the
 * histogram accumulates and a tie-break draws, that is a divergence between two
 * states that are equal as states. The same argument the snapshot encoder makes
 * about canonical order, one level up.
 *
 * ## Ordering does not affect the draws, and that is stream 7's doing
 *
 * `contracts.md` §6 keys stream 7 on the mage's handle, so a tie-break in one
 * mage's evaluation cannot move another's sequence whatever order they ran in,
 * and a mage who was not evaluated at all draws nothing. Adding this loop
 * therefore adds draws to stream 7 only, keyed per actor — no other subsystem's
 * sequence moves, which is the property `rng-insertion-invariance` exists to
 * hold.
 *
 * ## The outlook is supplied, never built here
 *
 * Building one needs the knowledge gateway, and this package may not reach
 * `@mm/rules-magic` (`contracts.md` §5 rule 3). So the caller — the coordinating
 * layer, which is permitted to import both — supplies an outlook per mage, and
 * a mage the caller declines to describe is skipped rather than guessed at.
 */

import type { EntityHandle, SimState } from '@mm/sim-core';
import type { MageRoleValue } from '@mm/state';
import { MAGE, componentOf } from '@mm/state';

import type { MageHandle } from '../coordination.js';
import { readCommitment, writeCommitment } from './commitment-store.js';
import { GoalHistogram } from './histogram.js';
import type { MageOutlook } from './outlook.js';
import type { MageGoalCommitment, ScheduleOptions } from './schedule.js';
import type { Selection } from './select.js';
import { selectGoal } from './select.js';
import type { ScoringOptions } from './scoring.js';
import type { TargetAppealWeights } from './target-appeal.js';
import type { GoalAppealWeights } from './terms.js';
import type { StepRng } from '../mages/rng.js';

/** Everything one tick of autonomy needs from outside this package. */
export interface AutonomyTickInput {
  readonly state: SimState;
  readonly worldTick: number;
  readonly rng: StepRng;
  /**
   * The mage's situation this tick, or `undefined` to skip her.
   *
   * `undefined` is a real answer, not a failure: a mage the coordinating layer
   * cannot describe — an unknown species id, a mage created by a test that
   * never gave her one — has no outlook to score, and inventing a default one
   * would have her make decisions from numbers nobody authored.
   */
  readonly outlookFor: (mage: MageHandle) => MageOutlook | undefined;
  /**
   * Whether the mage's committed goal finished this tick.
   *
   * The caller's judgement, per `select.ts`: completion is a fact about the
   * work — research reaching its requirement, a grimoire finished — and the
   * work is accrued through the knowledge gateway, which is the coordinating
   * layer's side of the port. Defaults to "not complete".
   */
  readonly isComplete?: ((mage: MageHandle, commitment: MageGoalCommitment) => boolean) | undefined;
  /** Target-selection weights, read once from content by the caller. */
  readonly appeal: TargetAppealWeights;
  /** Goal-selection weights, read once from the same file by the same caller. */
  readonly goalAppeal: GoalAppealWeights;
  readonly scoring?: ScoringOptions | undefined;
  readonly schedule?: ScheduleOptions | undefined;
}

/** One mage's decision, with her identity, for the explain channel and tests. */
export interface MageDecision {
  readonly mage: MageHandle;
  readonly selection: Selection;
}

/** What one tick of autonomy did. */
export interface AutonomyTickReport {
  /** The per-tick goal histogram by species and role, plus the switch counter. */
  readonly histogram: GoalHistogram;
  /** Living mages considered. */
  readonly considered: number;
  /** Mages skipped because the caller supplied no outlook. */
  readonly skipped: number;
  /** Every decision, in ascending slot order. Never an input to any rule. */
  readonly decisions: readonly MageDecision[];
}

/**
 * Runs goal selection for every living mage and persists the result.
 *
 * The returned decisions are a report — `contracts.md` §4.4's explain channel is
 * built from exactly this kind of projection — and nothing in the rules path may
 * read them back. What the rules read is the component this function wrote.
 */
export function stepMageAutonomy(input: AutonomyTickInput): AutonomyTickReport {
  const { state, worldTick, rng } = input;
  const mages = componentOf(state, MAGE);
  const alive = mages.field('alive');
  const speciesIds = mages.field('speciesId');
  const roleIds = mages.field('roleId');

  const histogram = new GoalHistogram();
  const decisions: MageDecision[] = [];
  let considered = 0;
  let skipped = 0;

  // Collected before anything is written. `writeCommitment` attaches a row to a
  // *different* component, so it cannot move a mage row underneath this walk —
  // but relying on that would make this loop correct by a fact about a
  // neighbouring file, and the day a decision also writes a mage field is the
  // day it silently stops being.
  const roster: { mage: EntityHandle; speciesId: number; roleId: MageRoleValue }[] = [];
  mages.forEach((row, handle) => {
    if ((alive[row] as number) === 0) return;
    roster.push({
      mage: handle,
      speciesId: speciesIds[row] as number,
      roleId: roleIds[row] as MageRoleValue,
    });
  });

  for (const entry of roster) {
    const outlook = input.outlookFor(entry.mage);
    if (outlook === undefined) {
      skipped += 1;
      continue;
    }
    considered += 1;

    const incumbent = readCommitment(state, entry.mage);
    const selection = selectGoal({
      outlook,
      worldTick,
      incumbent,
      incumbentComplete:
        incumbent !== undefined && (input.isComplete?.(entry.mage, incumbent) ?? false),
      rng,
      appeal: input.appeal,
      goalAppeal: input.goalAppeal,
      scoring: input.scoring,
      schedule: input.schedule,
    });

    writeCommitment(state, entry.mage, selection.commitment);
    histogram.record(entry.speciesId, entry.roleId, selection.commitment.goalId, {
      switched: selection.switched,
      evaluated: selection.evaluated,
      maskedCount: selection.maskedCount,
    });
    decisions.push({ mage: entry.mage, selection });
  }

  return { histogram, considered, skipped, decisions };
}
