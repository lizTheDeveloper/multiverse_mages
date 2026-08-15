/*
 * Multiverse Mages — the god-agency content tables: what an intervention costs,
 * and every magnitude the worship loop is made of.
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
 * Two content files that a JSON Schema cannot fully check, and the checks that
 * finish the job.
 *
 * A schema can say *"every record has an `actionId` between 0 and 15"*. It
 * cannot say *"there is exactly one record per action id"*, which is the
 * property every consumer actually depends on: a cost table missing action 13
 * would load, and the first tradition change of the first Monte Carlo run would
 * be free. Nor can it say *"permitting costs what forbidding costs"*, which is
 * the arithmetic form of vision pillar 1 — prohibiting is a peer strategy, not
 * a penalty — or *"`PRESTIGE_CAP` is the analytic limit of the carry-over
 * recurrence"*, which is what makes the meta-game's ceiling a property of the
 * arithmetic rather than a clamp a retune can quietly break.
 *
 * So the coverings and the identities live here, run as part of phase 3 of the
 * load, and fail the load rather than warning.
 *
 * ## Why the constant *names* are code and the constant *values* are data
 *
 * The rules read each constant by name. A name the rules do not read is a
 * number nobody applies, and a name the rules read that content does not
 * declare is a `0` arriving in the middle of a formula — a worship lag of zero
 * is a perfectly plausible-looking answer to a question nobody asked. So
 * {@link REQUIRED_GOD_CONSTANTS} is the contract, checked in both directions,
 * and every value behind it is an untuned placeholder the balance harness
 * moves.
 */

import type { ContentDiagnostic } from './diagnostics.js';
import type { GodConstantRecord, GodCostRecord } from './types.js';

/** `contracts.md` §0's fixed-point scale, spelled out where the identities read as arithmetic. */
const FP_ONE = 1024;

/** `contracts.md` §4.2 numbers the god's actions 0 through 15, inclusive. */
export const GOD_ACTION_ID_MAX = 16;

/**
 * Every magnitude the `god-agency` rules read, by name.
 *
 * **Append-only in practice, and checked in both directions.** A missing entry
 * fails the load naming the constant; an entry in `god-constant.json` that is
 * not on this list also fails the load, because an unread constant is a tuning
 * knob that does nothing and the sweep that turned it would report a null
 * result as a finding.
 */
export const REQUIRED_GOD_CONSTANTS: readonly string[] = Object.freeze([
  'ascension-canon-breadth',
  'ascension-canon-cells',
  'ascension-dependence-max',
  'ascension-era-count',
  'ascension-loss-fraction',
  'ascension-loss-max',
  'ascension-min-tick',
  'ascension-summit-cells',
  'ascension-summit-copies',
  'ascension-tier-gate',
  'bless-duration-ticks',
  'bless-lifespan-months',
  'bless-research-rate',
  'bless-teach-rate',
  'encourage-decay-per-tick',
  'encourage-magnitude',
  'encourage-max-cells',
  'favor-cap-base',
  'favor-cap-per-tier',
  'favor-per-worship',
  'favor-regen-base',
  'found-university-capacity',
  'found-university-cost',
  'founding-grant-accrual-nodes',
  'founding-grant-budget-cap',
  'founding-grant-budget-start',
  'fund-progress',
  'grant-mastery',
  'hysteresis-decay-ticks',
  'hysteresis-step',
  'mid-raid-revert-multiplier',
  'legacy-archive-max-tier',
  'legacy-archive-nodes',
  'legacy-baseline-favor',
  'legacy-baseline-materials',
  'legacy-baseline-populace',
  'legacy-cap',
  'legacy-half',
  'legacy-headstart-fraction',
  'legacy-reference-tick',
  'prestige-base-ascended',
  'prestige-base-cutoff',
  'prestige-base-stagnated',
  'prestige-cap',
  'prestige-earn-max',
  'prestige-per-era',
  'prestige-per-tier',
  'prestige-per-worship-tier',
  'prestige-retention',
  'stagnation-health-floor',
  'stagnation-mageless-ticks',
  'stagnation-stasis-ticks',
  'stagnation-worship-floor',
  'stagnation-worship-ticks',
  'tradition-shock',
  'tradition-shock-ticks',
  'upheaval-shock-floor',
  'upheaval-ticks',
  'worship-lag-fall',
  'worship-lag-rise',
  'worship-mage-blessed-bonus',
  'worship-mage-cap',
  'worship-mage-half',
  'worship-mage-per-head',
  'worship-max',
  'worship-populace-cap',
  'worship-populace-half',
  'worship-populace-per-head',
  'worship-tier-base',
  'worship-tier-count',
  'worship-university-cap',
  'worship-university-half',
  'worship-university-per-unit',
]);

function problem(file: string, pointer: string, message: string): ContentDiagnostic {
  return { file, pointer, code: 'content-invariant', message };
}

/**
 * Checks the cost table covers §4.2 exactly, and that its two load-bearing
 * price relationships hold.
 *
 * The three relationships, and what each would break:
 *
 * - **One entry per action id, 0–15.** A missing entry is a free action; a
 *   duplicate is two prices for one verb and whichever the lookup found first.
 * - **Permitting costs exactly what forbidding costs, on both axes.** Vision
 *   pillar 1 rests on the decision being symmetric — *"prohibiting something is
 *   a real strategic option, not a penalty"*. Any price asymmetry converts that
 *   into a default with an exception, and the denial play stops being a peer
 *   strategy.
 * - **Assigning a role is strictly the cheapest non-zero action.** It is the
 *   verb the god performs constantly, and a priced one would make the action
 *   space mostly unaffordable no-ops, inflating `illegalActionRate` (§7) into
 *   noise about the price rather than about the spec.
 */
export function checkGodCosts(records: readonly GodCostRecord[]): readonly ContentDiagnostic[] {
  const file = 'god-cost.json';
  const out: ContentDiagnostic[] = [];
  const byAction = new Map<number, GodCostRecord>();

  records.forEach((record, index) => {
    const existing = byAction.get(record.actionId);
    if (existing !== undefined) {
      out.push(
        problem(
          file,
          `/${String(index)}`,
          `record "${record.id}" declares action id ${String(record.actionId)}, which "` +
            `${existing.id}" already declares. contracts.md §4.2 gives each action one price; two ` +
            'records means the price is whichever the lookup happens to find.',
        ),
      );
      return;
    }
    byAction.set(record.actionId, record);
  });

  for (let actionId = 0; actionId <= GOD_ACTION_ID_MAX; actionId += 1) {
    if (byAction.has(actionId)) continue;
    out.push(
      problem(
        file,
        '',
        `no cost is declared for action id ${String(actionId)}. contracts.md §4.2's table runs 0 ` +
          'through 15 and an action with no declared price is an action that is free.',
      ),
    );
  }

  const costOf = (actionId: number): number | undefined => byAction.get(actionId)?.favorCost;

  const symmetric = (permit: number, forbid: number, axis: string): void => {
    const a = costOf(permit);
    const b = costOf(forbid);
    if (a === undefined || b === undefined || a === b) return;
    out.push(
      problem(
        file,
        '',
        `permitting a ${axis} costs ${String(a)} and forbidding one costs ${String(b)}. They must ` +
          'be equal: vision pillar 1 rests on the permit/forbid decision being symmetric, and a ' +
          'price difference makes denial a penalty rather than a peer strategy.',
      ),
    );
  };
  symmetric(1, 2, 'technique');
  symmetric(3, 4, 'form');

  const assignRole = costOf(10);
  if (assignRole !== undefined) {
    for (const record of records) {
      if (record.actionId === 10 || record.favorCost === 0) continue;
      if (record.favorCost > assignRole) continue;
      out.push(
        problem(
          file,
          '',
          `"${record.id}" costs ${String(record.favorCost)}, which is not more than the ` +
            `${String(assignRole)} that assigning a role costs. Assignment must be strictly the ` +
            'cheapest non-zero intervention: it is the routine verb, and a priced one turns most ' +
            'of the action space into unaffordable no-ops.',
        ),
      );
    }
  }

  return out;
}

/**
 * Checks the constant table declares exactly the set the rules read, and that
 * the three identities among those constants hold.
 *
 * The identities are the ones a retune can break silently:
 *
 * - **`worship-max` equals the three class caps summed.** The design's claim is
 *   that the ceiling is *"a property of the formula, not a clamp applied
 *   afterwards"*. Lowering one cap without lowering the stated ceiling turns
 *   that sentence into a comment.
 * - **`prestige-cap × (fp(1024) − prestige-retention) == prestige-earn-max ×
 *   fp(1024)`.** This is `god-agency` task 1.7, and it is what makes the
 *   meta-game's bound arithmetic: `PRESTIGE_CAP` is the analytic limit of the
 *   carry-over recurrence at maximum earning, so an endless winning streak
 *   approaches it and never exceeds it. A retune that moved retention and left
 *   the cap would leave a clamp wearing a proof's clothes.
 * - **`worship-lag-fall` exceeds `worship-lag-rise`.** The asymmetry *is* the
 *   damping; equal rates would leave the loop undamped while every constant
 *   still looked reasonable.
 */
export function checkGodConstants(
  records: readonly GodConstantRecord[],
): readonly ContentDiagnostic[] {
  const file = 'god-constant.json';
  const out: ContentDiagnostic[] = [];
  const byId = new Map<string, GodConstantRecord>();

  records.forEach((record, index) => {
    if (byId.has(record.id)) {
      out.push(problem(file, `/${String(index)}`, `constant "${record.id}" is declared twice.`));
      return;
    }
    byId.set(record.id, record);
  });

  for (const required of REQUIRED_GOD_CONSTANTS) {
    if (byId.has(required)) continue;
    out.push(
      problem(
        file,
        '',
        `constant "${required}" is not declared, and the god-agency rules read it by name. An ` +
          'absent constant would arrive in a formula as 0 — a worship lag of zero is a ' +
          'plausible-looking answer to a question nobody asked.',
      ),
    );
  }

  const known = new Set(REQUIRED_GOD_CONSTANTS);
  for (const record of records) {
    if (known.has(record.id)) continue;
    out.push(
      problem(
        file,
        '',
        `constant "${record.id}" is declared but nothing reads it. An unread constant is a tuning ` +
          'knob that does nothing, and the sweep that turned it would report the null result as a ' +
          'finding about the game.',
      ),
    );
  }

  const value = (id: string): number | undefined => byId.get(id)?.value;

  const mageCap = value('worship-mage-cap');
  const universityCap = value('worship-university-cap');
  const populaceCap = value('worship-populace-cap');
  const worshipMax = value('worship-max');
  if (
    mageCap !== undefined &&
    universityCap !== undefined &&
    populaceCap !== undefined &&
    worshipMax !== undefined &&
    mageCap + universityCap + populaceCap !== worshipMax
  ) {
    out.push(
      problem(
        file,
        '',
        `worship-max is ${String(worshipMax)} but the three class caps sum to ` +
          `${String(mageCap + universityCap + populaceCap)}. The ceiling must be the sum, because ` +
          'the design claims it is a property of the formula rather than a clamp applied after ' +
          'the fact — and a stated ceiling above the reachable sum makes every tier threshold ' +
          'derived from it wrong.',
      ),
    );
  }

  const cap = value('prestige-cap');
  const retention = value('prestige-retention');
  const earnMax = value('prestige-earn-max');
  if (cap !== undefined && retention !== undefined && earnMax !== undefined) {
    if (retention >= FP_ONE) {
      out.push(
        problem(
          file,
          '',
          `prestige-retention is ${String(retention)}, at or above fp(1024). The carry-over ` +
            'recurrence only converges while retention is strictly below 1, and at 1 an endless ' +
            'streak grows without bound.',
        ),
      );
    } else if (cap * (FP_ONE - retention) !== earnMax * FP_ONE) {
      out.push(
        problem(
          file,
          '',
          `prestige-cap × (fp(1024) − prestige-retention) is ${String(cap * (FP_ONE - retention))} ` +
            `but prestige-earn-max × fp(1024) is ${String(earnMax * FP_ONE)}. The cap must be the ` +
            'analytic limit of the carry-over recurrence at maximum earning, or the meta-game ' +
            'ceiling is an arbitrary clamp rather than a property of the arithmetic.',
        ),
      );
    }
  }

  const rise = value('worship-lag-rise');
  const fall = value('worship-lag-fall');
  if (rise !== undefined && fall !== undefined && fall <= rise) {
    out.push(
      problem(
        file,
        '',
        `worship-lag-fall (${String(fall)}) must exceed worship-lag-rise (${String(rise)}). The ` +
          'asymmetry is the worship loop\'s damping: a leader who loses a cohort takes the full ' +
          'hit in a few ticks and spends four times as long earning it back. Equal rates leave ' +
          'the loop undamped while every constant still looks reasonable.',
      ),
    );
  }

  const rise2 = value('worship-lag-rise');
  if (rise2 !== undefined && rise2 <= 0) {
    out.push(
      problem(
        file,
        '',
        'worship-lag-rise must be positive, or worship never rises toward its target at all.',
      ),
    );
  }

  const decay = value('encourage-decay-per-tick');
  if (decay !== undefined && decay <= 0) {
    out.push(
      problem(
        file,
        '',
        'encourage-decay-per-tick must be positive. A zero decay makes a research emphasis ' +
          'permanent, which turns a bounded, decaying nudge into a rate the god buys once.',
      ),
    );
  }

  // ---- The ascension predicates' own invariants ---------------------------
  //
  // Both paths now gate on quantities the god's play produces, and every one of
  // the four checks below pins a way of setting those constants that would make
  // a summit *unreachable* rather than merely hard. §8a asks for "reachable but
  // not routine", and an unreachable ending is the failure mode that costs a
  // whole sweep to notice — the runs simply all truncate and the rate reads 0.

  const summitCopies = value('ascension-summit-copies');
  if (summitCopies !== undefined && summitCopies < 1) {
    out.push(
      problem(
        file,
        '',
        `ascension-summit-copies is ${String(summitCopies)}. A cell cannot stand at its floor on ` +
          'fewer than one surviving instance of its deepest node, and at zero the conjunct is ' +
          'satisfied by a node nobody holds — which reads as mastery and is the opposite of it.',
      ),
    );
  }

  const summitCells = value('ascension-summit-cells');
  if (summitCells !== undefined && summitCells < 1) {
    out.push(
      problem(
        file,
        '',
        `ascension-summit-cells is ${String(summitCells)}, so Path A is satisfied by mastering no ` +
          'cell at all. The apotheosis path would then be a worship-tier clock, which is exactly ' +
          'the defect the constant was introduced to close.',
      ),
    );
  }

  const canonBreadth = value('ascension-canon-breadth');
  const canonCells = value('ascension-canon-cells');
  if (canonBreadth !== undefined && canonCells !== undefined && canonCells > canonBreadth) {
    out.push(
      problem(
        file,
        '',
        `ascension-canon-cells is ${String(canonCells)} and ascension-canon-breadth is ` +
          `${String(canonBreadth)}. A universe cannot know nodes in more cells than it knows ` +
          'nodes, so this setting makes Path B unsatisfiable by arithmetic rather than by ' +
          'difficulty, and every run would truncate with the rate reading a flat zero.',
      ),
    );
  }

  const lossFraction = value('ascension-loss-fraction');
  if (lossFraction !== undefined && (lossFraction < 0 || lossFraction > FP_ONE)) {
    out.push(
      problem(
        file,
        '',
        `ascension-loss-fraction is ${String(lossFraction)}, outside [0, fp(1024)]. Below zero it ` +
          'would subtract from the authored floor; above fp(1024) a passing era could lose more ' +
          'nodes than the universe knows, which is not an allowance but the absence of one.',
      ),
    );
  }

  return out;
}
