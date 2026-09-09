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
  /**
   * What shape the strategy space is in — **not** how good it is.
   *
   * `width` alone is the wrong thing to maximise, and this exists to say so in
   * a number. A design where *everything* works is not balanced, it is **flat**,
   * and flat is the state this project has actually been in: `passive-control`
   * reaching the same fifty-one nodes as an archivist who built thirteen
   * hundred universities.
   *
   * What is wanted is a **wide** space — many genuinely viable ways to play and
   * a large surrounding region of ways that do not work, with the not-working
   * legible. **A cell nobody should play is content, provided a player can find
   * out why**, and {@link ArchiveCell.failedRung} is what makes that findable.
   */
  readonly shape: MetaShape;
}

/** The four states a strategy space can be in, only one of which is wanted. */
export const META_SHAPE = {
  /** Nothing clears the null ladder. No game. */
  dead: 'dead',
  /**
   * Everything reached clears it. No wrong answers, therefore no right ones —
   * and no reason to prefer one opening over another.
   */
  flat: 'flat',
  /** Both populated: many ways to play, many ways not to. **The target.** */
  wide: 'wide',
  /** Too few cells reached to say. Not a verdict; a request for more search. */
  unresolved: 'unresolved',
  /**
   * Nothing cleared the ladder **and nothing ascended at all** — so the run
   * ended before the win condition was reachable, and the sweep has measured
   * its own `--ticks` rather than the strategies.
   *
   * Distinct from {@link META_SHAPE.dead}, which is the real verdict: strategies
   * *did* reach the summit and the nulls matched them. Both used to report
   * `dead`, and the ambiguity is load-bearing — `search-strategies.mjs` says so
   * in the warning it prints, and this project spent a night reading one for the
   * other. Measured 2026-08-15: at `--ticks 900` against `ascension-min-tick`
   * 600, three separate `--search-seed`s all give zero ascensions; at 1350, one
   * seed of three gives `dead` **with** four ascensions, which is the genuine
   * case.
   */
  horizonBound: 'horizon-bound',
} as const;

export type MetaShape = (typeof META_SHAPE)[keyof typeof META_SHAPE];

/**
 * Fewest reached cells from which `flat` or `wide` may be claimed.
 *
 * Three, because two cells can be one-and-one by luck. Below this the honest
 * answer is `unresolved`, and reporting `wide` off two cells would be the same
 * error as the first run of this search calling a coin landing heads once a
 * width of one.
 */
export const MIN_CELLS_TO_JUDGE_SHAPE = 3;

/** The shape a set of cells is in. Pure, so the thresholds are testable. */
/**
 * @param ascensions Total ascensions across **every** run in the sweep, nulls
 *   included. Required rather than optional with a default: a default would let
 *   an existing caller keep the old conflation silently, and separating those
 *   two cases is the entire reason this parameter exists. Nulls count because
 *   the question is whether the horizon was long enough for *anyone* to win —
 *   if `idle-then-declare` reached the summit, the run was long enough, and a
 *   field that failed to is a real result.
 */
export function shapeOf(
  occupied: number,
  notWorthPlaying: number,
  ascensions: number,
): MetaShape {
  const reached = occupied + notWorthPlaying;
  if (occupied === 0) {
    return ascensions === 0 ? META_SHAPE.horizonBound : META_SHAPE.dead;
  }
  if (reached < MIN_CELLS_TO_JUDGE_SHAPE) return META_SHAPE.unresolved;
  if (notWorthPlaying === 0) return META_SHAPE.flat;
  return META_SHAPE.wide;
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
    // Summed over candidates **and** nulls. A null that ascends proves the
    // horizon was sufficient just as well as a candidate that does, and it is
    // exactly the case that separates a real `dead` from a short run: on
    // search seed 40260901 at 1350 ticks the only ascensions in the sweep were
    // the ladder's.
    shape: shapeOf(
      occupied.length,
      cells.length - occupied.length,
      candidates.reduce((total, candidate) => total + candidate.ascended, 0) +
        Object.values(nulls).reduce((total, outcome) => total + outcome.ascended, 0),
    ),
  };
}

// ---------------------------------------------------------------------------
// Phases, and why a strategy that never changes is one strategy.
// ---------------------------------------------------------------------------

/**
 * The three phases a strategy must play differently.
 *
 * ## Why this exists
 *
 * The archive above measures whether two *strategies* differ. It cannot see
 * whether **one** strategy differs from itself over time — and a god who opens
 * the same cells at tick 100 and tick 2000 is playing one move slowly, not
 * three moves in sequence.
 *
 * This is the same degeneracy the campaign spent weeks on, in the other
 * dimension. Spatially, every universe held the same nodes. Temporally, every
 * strategy does the same thing throughout. **The measured example is already in
 * the pool**: `permit-then-idle` permits the grid for 140 of 2400 ticks and
 * then submits nothing for the remaining 2260, and it won 40/40. That *is* a
 * phase change — from acting to not acting — and it is the degenerate one every
 * candidate has to beat.
 *
 * ## Why late is weighted heaviest
 *
 * Early play is the most constrained and therefore the most forced: a universe
 * with nine nodes and one academy has few legal things to do and they are
 * mostly the same few. **Diversity there is cheap and means least.** By the
 * late game the constraints have lifted and what remains is what the player
 * chose, so a difference that survives to the late game is a difference the
 * design actually offers. Mid sits between and is weighted between.
 *
 * The weights are declared, not derived, and they are a design statement rather
 * than a measurement — which is why they are here, named, and easy to argue
 * with, instead of folded into a scoring expression.
 */
export const PHASE = {
  early: 'early',
  mid: 'mid',
  late: 'late',
} as const;

export type Phase = (typeof PHASE)[keyof typeof PHASE];

/**
 * What one phase of width is worth.
 *
 * Late over mid over early, because a difference that survives the lifting of
 * early constraints is a difference the design offers rather than one the
 * opening position forced.
 */
export const PHASE_WEIGHT: Readonly<Record<Phase, number>> = Object.freeze({
  early: 1,
  mid: 2,
  late: 3,
});

/**
 * Phase boundaries as a fraction of the run, in `ERA_TICKS` terms.
 *
 * Fractions rather than absolute ticks because a 600-tick probe and a 2400-tick
 * gate must both have three phases, and "late" means *late in this run* rather
 * than "after tick 1800". A run too short to hold three eras reports fewer
 * phases rather than three overlapping ones — see {@link phaseOfTick}.
 */
export const PHASE_BOUNDS: Readonly<Record<Phase, readonly [number, number]>> = Object.freeze({
  early: [0, 1 / 3],
  mid: [1 / 3, 2 / 3],
  late: [2 / 3, 1],
});

/** The phase a tick falls in, given the run's horizon. */
export function phaseOfTick(tick: number, horizon: number): Phase {
  if (horizon <= 0) return PHASE.early;
  const share = tick / horizon;
  if (share < PHASE_BOUNDS.early[1]) return PHASE.early;
  if (share < PHASE_BOUNDS.mid[1]) return PHASE.mid;
  return PHASE.late;
}

/** One strategy's behaviour in one phase. */
export interface PhaseObservation {
  readonly phase: Phase;
  readonly descriptors: Readonly<Record<string, number>>;
}

/** A candidate observed across phases rather than once at the end. */
export interface PhasedCandidate extends CandidateOutcome {
  readonly phases: readonly PhaseObservation[];
}

/** What a phased archive is worth, and how mobile its occupants are. */
export interface PhasedArchive {
  /** Width within each phase, counting only cells that clear the ladder. */
  readonly widthByPhase: Readonly<Record<Phase, number>>;
  /**
   * `Σ width(phase) × weight(phase)`.
   *
   * **The score.** Late diversity is worth three early cells because early play
   * is mostly forced.
   */
  readonly weightedWidth: number;
  /**
   * Distinct coordinates each strategy occupies across its phases, by id.
   *
   * **1 means the strategy never changed** — it played one move for the whole
   * run, which is a strategy the design should not reward however well it
   * scores. 3 means it played a genuinely different game in each phase.
   */
  readonly mobilityByStrategy: Readonly<Record<string, number>>;
  /**
   * Strategies whose mobility is 1.
   *
   * Reported by name rather than counted, because a static strategy in the pool
   * is a finding about the *design* — it means the game did not require the
   * player to change — and the specific one matters.
   */
  readonly staticStrategies: readonly string[];
}

/**
 * Fold phased candidates into a per-phase archive.
 *
 * Each phase is scored independently against the same null ladder, because
 * "beats doing nothing in the late game" is the claim that matters and an
 * aggregate would let a strong early game pay for an absent late one.
 */
export function foldPhasedArchive(
  axes: readonly BehaviourAxis[],
  candidates: readonly PhasedCandidate[],
  nulls: NullOutcomes,
): PhasedArchive {
  const widthByPhase: Record<Phase, number> = { early: 0, mid: 0, late: 0 };
  const mobility: Record<string, number> = {};

  for (const phase of Object.values(PHASE)) {
    const inPhase: CandidateOutcome[] = [];
    for (const candidate of candidates) {
      const observation = candidate.phases.find((entry) => entry.phase === phase);
      // A candidate with no observation in this phase is absent from it, not
      // present at zero. A run that ended before its late phase has no late
      // behaviour, and inventing one at the origin would put every truncated
      // run in the same cell and read as agreement.
      if (observation === undefined) continue;
      inPhase.push({
        strategyId: candidate.strategyId,
        descriptors: observation.descriptors,
        ascended: candidate.ascended,
        runs: candidate.runs,
        illegalActionRate: candidate.illegalActionRate,
      });
    }
    widthByPhase[phase] = foldArchive(axes, inPhase, nulls).width;
  }

  for (const candidate of candidates) {
    const seen = new Set(
      candidate.phases.map((entry) => coordinateOf(axes, entry.descriptors)),
    );
    mobility[candidate.strategyId] = seen.size;
  }

  const weightedWidth = (Object.values(PHASE) as Phase[]).reduce(
    (sum, phase) => sum + widthByPhase[phase] * PHASE_WEIGHT[phase],
    0,
  );

  return {
    widthByPhase,
    weightedWidth,
    mobilityByStrategy: mobility,
    staticStrategies: Object.entries(mobility)
      .filter(([, count]) => count <= 1)
      .map(([id]) => id)
      .sort(),
  };
}
