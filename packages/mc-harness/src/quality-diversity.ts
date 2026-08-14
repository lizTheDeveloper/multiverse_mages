/*
 * Multiverse Mages — quality-diversity search over the strategy space.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the GNU
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * A behaviour archive over the strategy space, scored by **width** rather than
 * by fitness — and floored by whether playing beats not playing.
 *
 * ## Why not fitness
 *
 * `tuner.ts`'s {@link varietyOf} is the entropy of *who wins*. Maximising it
 * produces a pool whose members win equally often, which is not what this
 * project wants and never was: **eight strategies that walk the same queue at
 * different speeds score entropy near 1 and width 1.** The campaign's real
 * target is how many genuinely different ways there are to play.
 *
 * So an elite earns its cell by being **different**, not by being better, and
 * the archive's score is the number of cells occupied. A candidate that wins
 * the same way as an incumbent adds nothing.
 *
 * ## Why the null ladder is a floor and not a term
 *
 * Every one of the four nulls has beaten a designed strategy in this project's
 * measured history, and each time it was found by accident rather than by a
 * standing check:
 *
 * - `permit-then-idle` won **40/40** by permitting the grid for 140 of 2400
 *   ticks and submitting nothing for the remaining 2260, beating a strategy
 *   that also funds, blesses and encourages.
 * - `passive-control` reaches **51 nodes doing nothing at all** — the same 51
 *   an archivist reaches after building roughly thirteen hundred universities.
 * - `uniform-random-legal` once ascended **80/80** against designed strategies
 *   at 0/80, because it drew the button they never pressed.
 *
 * A weighted term would let a large enough width score outvote the floor. It is
 * therefore a **gate**: a cell reached only by strategies that lose to the
 * ladder is recorded as {@link CELL_STATUS.reachableNotWorthPlaying} and does
 * not count toward width. The reachability fact is kept — it is a true
 * statement about the action space — and it does not inflate the number.
 *
 * ## What is deliberately not here
 *
 * No simulation. This module decides *what to evaluate* and *what to keep*, and
 * a caller supplies outcomes. That is the same separation `candidatesForAxis`
 * keeps and for the same reason: the properties worth testing — that a
 * descriptor maps to one cell, that an elite never displaces a better one, that
 * the ladder is applied before width is counted — are statements about these
 * functions alone, provable without a sweep.
 */

/** Which rung of the null ladder a candidate failed, or that it cleared them. */
export const NULL_RUNG = {
  /** Cleared every rung. */
  none: 0,
  /** Lost to `passive-control`: acting does not beat not acting. */
  passive: 1,
  /** Lost to `permit-then-idle`: the ruleset is the whole game. */
  rulesetOnly: 2,
  /** Lost to `uniform-random-legal`: the verbs do something a coin could do. */
  randomFloor: 3,
  /** Lost to `idle-then-declare`: the win condition is a button. */
  buttonOnly: 4,
} as const;

export type NullRung = (typeof NULL_RUNG)[keyof typeof NULL_RUNG];

/** The ladder in the order it is applied. Rung order is diagnostic, not arbitrary. */
export const NULL_LADDER: readonly { readonly rung: NullRung; readonly strategyId: string }[] =
  Object.freeze([
    { rung: NULL_RUNG.passive, strategyId: 'passive-control' },
    { rung: NULL_RUNG.rulesetOnly, strategyId: 'permit-then-idle' },
    { rung: NULL_RUNG.randomFloor, strategyId: 'uniform-random-legal' },
    { rung: NULL_RUNG.buttonOnly, strategyId: 'idle-then-declare' },
  ]);

/** What an occupied coordinate is worth. */
export const CELL_STATUS = {
  /** An elite that clears the ladder. Counts toward width. */
  occupied: 'occupied',
  /**
   * Reached, and by nothing that beats doing nothing.
   *
   * Kept because reachability is a fact about the action space, and excluded
   * from width because a cell nobody should play is not a way to play.
   */
  reachableNotWorthPlaying: 'reachable-not-worth-playing',
} as const;

export type CellStatus = (typeof CELL_STATUS)[keyof typeof CELL_STATUS];

/**
 * One axis of the behaviour space.
 *
 * `edges` are the interior boundaries, ascending; a descriptor falls in bin `i`
 * when it is below `edges[i]`, and in the last bin when it is above them all.
 * Bins rather than raw values because two strategies differing by one node are
 * not two ways to play.
 */
export interface BehaviourAxis {
  readonly id: string;
  readonly edges: readonly number[];
}

/** One candidate's measured behaviour and outcome, supplied by the caller. */
export interface CandidateOutcome {
  readonly strategyId: string;
  /** Descriptor value per axis, keyed by {@link BehaviourAxis.id}. */
  readonly descriptors: Readonly<Record<string, number>>;
  /** Runs in which this candidate ascended, over the paired seed set. */
  readonly ascended: number;
  /** Runs attempted. Every candidate and every null sees the same seeds. */
  readonly runs: number;
  /**
   * Fraction of submissions the mask rejected.
   *
   * A disqualifier, not a penalty: a candidate that reaches an empty cell by
   * submitting illegal actions has found a hole in the mask, which is a bug
   * report rather than a way to play.
   */
  readonly illegalActionRate: number;
}

/** The four nulls' results over the *same* seeds, keyed by strategy id. */
export type NullOutcomes = Readonly<Record<string, CandidateOutcome>>;

/** One coordinate of the archive. */
export interface ArchiveCell {
  readonly coordinate: string;
  readonly status: CellStatus;
  readonly elite: CandidateOutcome;
  /** Which rung rejected it, when the status is not `occupied`. */
  readonly failedRung: NullRung;
  /** Best null ascension count on these seeds — the bar the elite had to clear. */
  readonly nullBar: number;
}

/** The archive, and the one number that matters about it. */
export interface Archive {
  readonly cells: readonly ArchiveCell[];
  /** Cells that clear the ladder. **This is the score.** */
  readonly width: number;
  /** Cells reached by nothing worth playing. Reported, never scored. */
  readonly reachableNotWorthPlaying: number;
  /**
   * Best elite's ascension count minus the best null's, over paired seeds.
   *
   * The single most useful number the search publishes: if this is not growing,
   * nothing else in the archive matters.
   */
  readonly marginOverNull: number;
}

/** Maximum illegal-action rate an elite may carry. Above this it is a mask bug. */
export const MAX_ELITE_ILLEGAL_RATE = 0.01;

/**
 * The bin index of `value` on `axis`.
 *
 * Exported because "a descriptor maps to exactly one bin, and the bins tile the
 * line" is the property the archive rests on and is worth asserting directly.
 */
export function binOf(axis: BehaviourAxis, value: number): number {
  for (let index = 0; index < axis.edges.length; index += 1) {
    const edge = axis.edges[index];
    if (edge !== undefined && value < edge) return index;
  }
  return axis.edges.length;
}

/** The archive coordinate a descriptor set falls in. */
export function coordinateOf(
  axes: readonly BehaviourAxis[],
  descriptors: Readonly<Record<string, number>>,
): string {
  return axes.map((axis) => `${axis.id}:${binOf(axis, descriptors[axis.id] ?? 0)}`).join('|');
}

/**
 * The highest ascension count any null reached on these seeds.
 *
 * Recomputed every round from the nulls' own runs rather than stored, because
 * doing-nothing's score changes as the game changes — a stored bar would rot
 * exactly the way this project's stale documents did.
 */
export function nullBarOf(nulls: NullOutcomes): { bar: number; rung: NullRung } {
  let bar = 0;
  let rung: NullRung = NULL_RUNG.none;
  for (const entry of NULL_LADDER) {
    const outcome = nulls[entry.strategyId];
    if (outcome === undefined) continue;
    if (outcome.ascended > bar) {
      bar = outcome.ascended;
      rung = entry.rung;
    }
  }
  return { bar, rung };
}

/**
 * Whether a candidate may hold a cell, and which rung rejected it if not.
 *
 * Strictly greater than the bar: **tying with doing nothing is not beating it.**
 */
export function clearsLadder(
  candidate: CandidateOutcome,
  nulls: NullOutcomes,
): { clears: boolean; failedRung: NullRung; bar: number } {
  const { bar, rung } = nullBarOf(nulls);
  if (candidate.illegalActionRate > MAX_ELITE_ILLEGAL_RATE) {
    return { clears: false, failedRung: rung === NULL_RUNG.none ? NULL_RUNG.passive : rung, bar };
  }
  return { clears: candidate.ascended > bar, failedRung: bar === 0 ? NULL_RUNG.none : rung, bar };
}

/**
 * Fold candidates into an archive.
 *
 * Within a cell the incumbent is displaced only by a strictly higher ascension
 * count, so the fold is order-independent up to ties and a re-run of the same
 * candidates produces the same archive.
 */
export function foldArchive(
  axes: readonly BehaviourAxis[],
  candidates: readonly CandidateOutcome[],
  nulls: NullOutcomes,
): Archive {
  const best = new Map<string, ArchiveCell>();
  for (const candidate of candidates) {
    const coordinate = coordinateOf(axes, candidate.descriptors);
    const verdict = clearsLadder(candidate, nulls);
    const cell: ArchiveCell = {
      coordinate,
      status: verdict.clears ? CELL_STATUS.occupied : CELL_STATUS.reachableNotWorthPlaying,
      elite: candidate,
      failedRung: verdict.clears ? NULL_RUNG.none : verdict.failedRung,
      nullBar: verdict.bar,
    };
    const incumbent = best.get(coordinate);
    if (incumbent === undefined) {
      best.set(coordinate, cell);
      continue;
    }
    // An occupied cell is never displaced by one that is not, whatever it scored.
    const incumbentCounts = incumbent.status === CELL_STATUS.occupied;
    const cellCounts = cell.status === CELL_STATUS.occupied;
    if (cellCounts && !incumbentCounts) best.set(coordinate, cell);
    else if (cellCounts === incumbentCounts && cell.elite.ascended > incumbent.elite.ascended) {
      best.set(coordinate, cell);
    }
  }

  const cells = [...best.values()].sort((a, b) => (a.coordinate < b.coordinate ? -1 : 1));
  const occupied = cells.filter((cell) => cell.status === CELL_STATUS.occupied);
  const bestElite = occupied.reduce((max, cell) => Math.max(max, cell.elite.ascended), 0);
  return {
    cells,
    width: occupied.length,
    reachableNotWorthPlaying: cells.length - occupied.length,
    marginOverNull: bestElite - nullBarOf(nulls).bar,
  };
}
