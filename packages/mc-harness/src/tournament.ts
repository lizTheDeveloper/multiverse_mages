/*
 * Multiverse Mages — tournament scheduling under common random numbers, and the
 * pairwise outcome matrix.
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
 * Tasks 5.7 and 5.8.
 *
 * ## Common random numbers, and the one place the spec asks for something the
 * seed derivation forbids
 *
 * The capability spec asks that *"every pairing of interest is played on the
 * same set of derived run seeds"* and, in its scenario, that *"all three
 * strategies encounter the same set of derived run seeds."* Taken literally
 * against `deriveRunSeed`, that is impossible and the same spec says so two
 * requirements earlier: *"distinct cells and replicates get distinct seeds"* —
 * the 1000 seeds of a 20×50 sweep must be **pairwise distinct**. Two runs
 * cannot share a derived run seed, so two pairings cannot either.
 *
 * The tension is real and it is resolved rather than papered over, by
 * separating two things the phrase "run seed" was conflating:
 *
 * - **The world's seed** is a *factor level*. {@link TOURNAMENT_WORLD_SEED_FACTOR}
 *   is a declared sweep factor whose levels are the worlds the tournament is
 *   played on; the scenario builds its `SimState` from that level. Every
 *   strategy plays every level, so *"all three strategies encounter the same
 *   set"* is literally true of the numbers that decide what world each run is.
 * - **The derived run seed** stays pairwise distinct and drives the *agent-side*
 *   generator, which is what it is for: `agent-rng.ts` derives from
 *   `(runSeed, agentSlotIndex, strategyId)`, and two strategies drawing
 *   identical tie-breaks would be two arms sharing a nuisance variable rather
 *   than controlling for one.
 *
 * That is what common random numbers means in a variance-reduction sense: the
 * *stochastic environment* is shared across arms and the *decisions* are not.
 * A caller whose scenario ignores the factor and seeds its world from `runSeed`
 * gets a tournament with no variance reduction at all and no error anywhere, so
 * {@link tournamentSchedule} reports the property it can check —
 * {@link TournamentSchedule.worldSeedsByStrategy} — and a test asserts set
 * equality across the pool.
 *
 * ## Mirrored slots
 *
 * `assignStrategies` already implements the arithmetic: `mirrored` enumerates
 * every **ordered** pair `(a, b)` with `a !== b` and indexes it by
 * `(cellIndex * slots + replicateIndex) % pairs.length`. Ordered is the whole
 * point — `(a, b)` and `(b, a)` are both in the list, so slot bias cancels — and
 * it is reused here rather than reimplemented.
 *
 * The one constraint that arithmetic imposes, and that this module enforces
 * rather than discovers: **`replicates` must be a whole multiple of the ordered
 * pair count.** Otherwise the modulo stops partway round and the pairings at the
 * front of the list get one more run each than the pairings at the back. The
 * pairwise matrix would then have unequal sample sizes per cell, and the
 * difference between two cells would be partly a difference in *n* — which is
 * the confound a matched design exists to remove.
 *
 * ## Why the matrix reports no winner
 *
 * Task 5.8 asks for the pairwise matrix *"whether or not a strategy dominates"*.
 * At this build nothing dominates, and more importantly nothing *could*: a run
 * holds one universe (§1.1) with agent slots inside it, so there is no per-arm
 * outcome to compare. `ascended` is a property of the run, not of slot 0. The
 * matrix therefore reports terminal-status counts per ordered pairing — which is
 * real, complete, and reproducible — and the dominance verdict carries an
 * explicit {@link DOMINANCE_STATUS} rather than a number nobody could defend.
 * Reporting a win rate computed by assigning the run's outcome to slot 0 would
 * be a balance claim, at a version that is not allowed to make one.
 */

import { TERMINAL_STATUS } from './session.js';
import type { TerminalStatus } from './session.js';
import type { RunRecord } from './records.js';
import type { AgentPoolSpec, SweepFactor, SweepSpec } from './sweep-spec.js';
import { ASSIGNMENT_RULE, assignStrategies } from './sweep-spec.js';
import { deriveRunSeed } from './seed.js';

/**
 * The factor a tournament declares its shared worlds under.
 *
 * A name rather than a convention, so that a scenario reading the wrong key is
 * caught by the factor registry (`metrics.ts` explains why an unread factor is
 * the one sweep mistake that produces plausible numbers instead of an error).
 */
export const TOURNAMENT_WORLD_SEED_FACTOR = 'worldSeed';

/** Every ordered pairing of a pool, in the order `assignStrategies` builds them. */
export function orderedPairings(strategies: readonly string[]): readonly (readonly [string, string])[] {
  const pairs: (readonly [string, string])[] = [];
  for (const a of strategies) {
    for (const b of strategies) {
      if (a !== b) pairs.push([a, b] as const);
    }
  }
  return Object.freeze(pairs);
}

/** One scheduled run of a tournament. */
export interface TournamentRun {
  readonly cellIndex: number;
  readonly replicateIndex: number;
  /** The derived run seed. Pairwise distinct, and agent-side only. */
  readonly runSeed: number;
  /** The world this run is played on — the shared random number. */
  readonly worldSeed: number;
  /** Strategy per slot, in slot order. */
  readonly strategies: readonly string[];
}

/** What {@link tournamentSchedule} worked out, before a single run is dispatched. */
export interface TournamentSchedule {
  readonly sweepId: string;
  readonly strategies: readonly string[];
  readonly pairings: readonly (readonly [string, string])[];
  readonly runs: readonly TournamentRun[];
  /** Runs per ordered pairing, keyed `"a vs b"`. Equal across pairings by construction. */
  readonly runsByPairing: Readonly<Record<string, number>>;
  /**
   * The world seeds each strategy encountered, ascending and deduplicated.
   *
   * The common-random-numbers property, in the form a test can assert: every
   * strategy's list must be the same list.
   */
  readonly worldSeedsByStrategy: Readonly<Record<string, readonly number[]>>;
}

function pairingKey(pair: readonly [string, string]): string {
  return `${pair[0]} vs ${pair[1]}`;
}

/**
 * Builds a tournament sweep specification over a pool.
 *
 * Everything not named here is the caller's: metrics, termination, the failure
 * threshold. This function owns exactly the fields that make a sweep a
 * *tournament* — the pool, the mirrored assignment, the shared-world factor, and
 * a replicate count that keeps the pairings balanced.
 *
 * @throws Error if the pool has fewer than two strategies. A one-strategy
 * tournament has one self-pairing and an empty matrix, and it is far more likely
 * to be a typo than a deliberate experiment.
 */
export function tournamentSpec(input: {
  readonly sweepId: string;
  readonly rootSeed: number;
  readonly strategies: readonly string[];
  /** The worlds every pairing is played on. At least one. */
  readonly worldSeeds: readonly number[];
  /** Times each ordered pairing plays each world. At least one. */
  readonly roundsPerPairing: number;
  readonly termination: SweepSpec['termination'];
  readonly metrics: readonly string[];
  readonly kind?: SweepSpec['kind'];
  readonly failureThreshold?: number;
  /** Extra factors crossed with the world seed. Optional. */
  readonly factors?: readonly SweepFactor[];
}): SweepSpec {
  if (input.strategies.length < 2) {
    throw new Error(
      `A tournament needs at least two strategies; received ${String(input.strategies.length)}. ` +
        'With one there are no ordered pairings, so the pairwise matrix would be empty and the ' +
        'mirrored assignment would play that strategy against itself forever.',
    );
  }
  if (input.worldSeeds.length === 0) {
    throw new Error(
      'A tournament needs at least one world seed. It is the shared random number every pairing ' +
        'is played on, and a tournament without one is a set of unmatched samples.',
    );
  }
  if (!Number.isInteger(input.roundsPerPairing) || input.roundsPerPairing < 1) {
    throw new Error(
      `roundsPerPairing must be a positive integer; received ${String(input.roundsPerPairing)}.`,
    );
  }

  const agentPool: AgentPoolSpec = {
    strategies: [...input.strategies],
    assignment: ASSIGNMENT_RULE.mirrored,
    // `mirrored` is validated to exactly two slots by `validateSweep`: slot bias
    // cancels by swapping two sides, and there is nothing to swap with three.
    slots: 2,
  };

  return {
    sweepId: input.sweepId,
    rootSeed: input.rootSeed,
    factors: [
      { id: TOURNAMENT_WORLD_SEED_FACTOR, levels: [...input.worldSeeds] },
      ...(input.factors ?? []),
    ],
    // One replicate per ordered pairing per round, so every pairing plays every
    // world exactly `roundsPerPairing` times. See the module note.
    replicates: orderedPairings(input.strategies).length * input.roundsPerPairing,
    agentPool,
    termination: input.termination,
    metrics: [...input.metrics],
    ablation: { mode: 'none', primitives: [] },
    kind: input.kind ?? 'full',
    failureThreshold: input.failureThreshold ?? 0,
  };
}

/**
 * Expands a tournament specification into its runs, without executing any.
 *
 * Deliberately independent of `expandSweep`: this reports the *tournament's*
 * properties — pairing balance and shared worlds — which are the two things a
 * reader has to believe before the pairwise matrix means anything, and which
 * the general sweep planner has no reason to know about.
 *
 * @throws Error if the replicate count is not a whole multiple of the ordered
 * pairing count, naming both numbers. See the module note for why an unbalanced
 * tournament is worse than no tournament.
 */
export function tournamentSchedule(spec: SweepSpec): TournamentSchedule {
  const strategies = [...spec.agentPool.strategies];
  const pairings = orderedPairings(strategies);
  if (spec.agentPool.assignment !== ASSIGNMENT_RULE.mirrored) {
    throw new Error(
      `Sweep ${spec.sweepId} assigns strategies by "${spec.agentPool.assignment}", not "mirrored". ` +
        'A tournament schedule is a claim that every pairing was played in both slot orders, and ' +
        'no other assignment rule makes that claim true.',
    );
  }
  if (pairings.length > 0 && spec.replicates % pairings.length !== 0) {
    throw new Error(
      `Sweep ${spec.sweepId} declares ${String(spec.replicates)} replicates over ` +
        `${String(pairings.length)} ordered pairings, which does not divide. The mirrored ` +
        'assignment cycles the pairing list by replicate index, so a partial cycle gives the ' +
        'pairings at the front of the list one more run each than those at the back — and every ' +
        'difference the matrix then shows is partly a difference in sample size.',
    );
  }

  const worldSeedFactor = spec.factors.find((factor) => factor.id === TOURNAMENT_WORLD_SEED_FACTOR);
  if (worldSeedFactor === undefined) {
    throw new Error(
      `Sweep ${spec.sweepId} declares no "${TOURNAMENT_WORLD_SEED_FACTOR}" factor. Without it the ` +
        'runs of two pairings are played on unrelated worlds, which is the unmatched design ' +
        'common random numbers exists to replace.',
    );
  }

  // `expandSweep` sorts factors by id and runs the last one fastest, so the
  // world seed's level for a cell is derived the same way here rather than
  // guessed. Re-derived rather than imported so this stays readable next to the
  // arithmetic it explains; `tournament.test.ts` pins the two against each other.
  const ordered = [...spec.factors].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const cellCount = ordered.reduce((count, factor) => count * factor.levels.length, 1);

  const levelOfWorldSeed = (cellIndex: number): number => {
    let remainder = cellIndex;
    for (let position = ordered.length - 1; position >= 0; position -= 1) {
      const factor = ordered[position] as SweepFactor;
      const width = factor.levels.length;
      const level = factor.levels[remainder % width];
      if (factor.id === TOURNAMENT_WORLD_SEED_FACTOR) return Number(level);
      remainder = Math.floor(remainder / width);
    }
    // Unreachable: the factor's presence was checked above.
    throw new Error(`Cell ${String(cellIndex)} resolved no world seed.`);
  };

  const runs: TournamentRun[] = [];
  const runsByPairing: Record<string, number> = {};
  const worldSeedsByStrategy = new Map<string, Set<number>>();
  for (const strategyId of strategies) worldSeedsByStrategy.set(strategyId, new Set<number>());
  for (const pair of pairings) runsByPairing[pairingKey(pair)] = 0;

  for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
    const worldSeed = levelOfWorldSeed(cellIndex);
    for (let replicateIndex = 0; replicateIndex < spec.replicates; replicateIndex += 1) {
      const assigned = assignStrategies(spec.agentPool, cellIndex, replicateIndex);
      runs.push({
        cellIndex,
        replicateIndex,
        runSeed: deriveRunSeed({
          rootSeed: spec.rootSeed,
          sweepId: spec.sweepId,
          cellIndex,
          replicateIndex,
        }),
        worldSeed,
        strategies: assigned,
      });
      const key = `${assigned[0] ?? ''} vs ${assigned[1] ?? ''}`;
      runsByPairing[key] = (runsByPairing[key] ?? 0) + 1;
      for (const strategyId of assigned) worldSeedsByStrategy.get(strategyId)?.add(worldSeed);
    }
  }

  const seedsByStrategy: Record<string, readonly number[]> = {};
  for (const [strategyId, seeds] of worldSeedsByStrategy) {
    seedsByStrategy[strategyId] = Object.freeze([...seeds].sort((a, b) => a - b));
  }

  return {
    sweepId: spec.sweepId,
    strategies,
    pairings,
    runs: Object.freeze(runs),
    runsByPairing: Object.freeze(runsByPairing),
    worldSeedsByStrategy: Object.freeze(seedsByStrategy),
  };
}

// ---------------------------------------------------------------------------
// The pairwise outcome matrix (task 5.8).
// ---------------------------------------------------------------------------

/** Why a tournament can or cannot name a dominant strategy. */
export const DOMINANCE_STATUS = {
  /** A dominant strategy was identified. Nothing emits this yet; see below. */
  identified: 'identified',
  /** The matrix was computed and no strategy separated from the pool. */
  noneDetected: 'none-detected',
  /**
   * A per-arm outcome does not exist in this build, so no pairing has a winner.
   *
   * §1.1: *"one simulation instance holds one universe"*. A run's terminal
   * status is the universe's, not slot 0's, and assigning it to a slot would
   * invent an attribution the simulation never made. Raids (0.9.0) are what
   * give two arms distinguishable outcomes.
   */
  notAttributable: 'not-attributable',
} as const;

/** Any status from {@link DOMINANCE_STATUS}. */
export type DominanceStatus = (typeof DOMINANCE_STATUS)[keyof typeof DOMINANCE_STATUS];

/**
 * One entry of the pairwise matrix: what happened when these two played.
 *
 * Named an *outcome* rather than a *cell* because a cell already means
 * something else in this package — `SweepCell` is a parameter cell of the
 * factorial expansion, and a matrix whose entries were also called cells would
 * make `cell.ascensionRate` ambiguous between "this pairing" and "this
 * parameter combination".
 */
export interface PairwiseOutcome {
  /** The strategy in agent slot 0. */
  readonly slot0: string;
  /** The strategy in agent slot 1. */
  readonly slot1: string;
  readonly runs: number;
  /** Counts by terminal status. Every recorded status has a key, including zeros. */
  readonly countsByStatus: Readonly<Record<TerminalStatus, number>>;
  /**
   * Ascensions over runs that completed, or `null` when there were none.
   *
   * `failed` runs are excluded from the denominator and `truncated` runs are
   * kept in it, matching §7's `ascensionRate` rule exactly — a truncated run is
   * a universe that did not resolve, and dropping it would compute a rate over
   * a population selected on the outcome it measures.
   *
   * **This is not a win rate.** It is a property of the run both slots shared;
   * see {@link DOMINANCE_STATUS.notAttributable}.
   */
  readonly ascensionRate: number | null;
}

/** The tournament summary's matrix section. */
export interface PairwiseMatrix {
  /** Pool members, sorted, so the matrix has a stable axis order. */
  readonly strategies: readonly string[];
  /** Every ordered pairing of the pool, in `(slot0, slot1)` lexicographic order. */
  readonly outcomes: readonly PairwiseOutcome[];
  /** Records that named a pairing outside the pool, which would confound the matrix. */
  readonly unmatchedRuns: number;
  readonly dominance: {
    readonly status: DominanceStatus;
    /** Why, in one sentence, always present. */
    readonly reason: string;
    /** The dominant strategy, when there is one. */
    readonly strategyId?: string;
  };
}

const ZERO_COUNTS: Readonly<Record<TerminalStatus, number>> = Object.freeze({
  [TERMINAL_STATUS.running]: 0,
  [TERMINAL_STATUS.ascended]: 0,
  [TERMINAL_STATUS.stagnated]: 0,
  [TERMINAL_STATUS.truncated]: 0,
  [TERMINAL_STATUS.failed]: 0,
});

/**
 * Folds run records into the pairwise matrix.
 *
 * Reported **whether or not a strategy dominates**, which is task 5.8's whole
 * sentence: a tournament that printed a matrix only when it found a winner would
 * be a tournament whose silence a reader could not interpret. A flat matrix is a
 * result, and at this build it is the *expected* result — see
 * `strategies.ts`'s `POOL_BUILD_LIMITS`.
 *
 * Records are folded in the order given. Callers hand it `SweepResult.records`,
 * which `runSweep` has already sorted by `(cellIndex, replicateIndex)`; the only
 * floating-point fold here is the one division per cell, taken over integer
 * counts, so the order could not change the result even if it varied.
 */
export function pairwiseMatrix(
  records: readonly RunRecord[],
  pool: readonly string[],
): PairwiseMatrix {
  const members = new Set(pool);
  const strategies = [...members].sort();
  const byPairing = new Map<string, { counts: Record<TerminalStatus, number>; runs: number }>();
  let unmatchedRuns = 0;

  for (const pair of orderedPairings(strategies)) {
    byPairing.set(pairingKey(pair), { counts: { ...ZERO_COUNTS }, runs: 0 });
  }

  for (const record of records) {
    const slot0 = record.strategies[0];
    const slot1 = record.strategies[1];
    if (slot0 === undefined || slot1 === undefined || !members.has(slot0) || !members.has(slot1)) {
      unmatchedRuns += 1;
      continue;
    }
    const key = `${slot0} vs ${slot1}`;
    let cell = byPairing.get(key);
    if (cell === undefined) {
      // A self-pairing, which `mirrored` produces only for a one-strategy pool.
      cell = { counts: { ...ZERO_COUNTS }, runs: 0 };
      byPairing.set(key, cell);
    }
    cell.counts[record.status] += 1;
    cell.runs += 1;
  }

  const outcomes: PairwiseOutcome[] = [];
  for (const key of [...byPairing.keys()].sort()) {
    const entry = byPairing.get(key) as { counts: Record<TerminalStatus, number>; runs: number };
    const [slot0 = '', slot1 = ''] = key.split(' vs ');
    const completed = entry.runs - entry.counts[TERMINAL_STATUS.failed];
    outcomes.push({
      slot0,
      slot1,
      runs: entry.runs,
      countsByStatus: Object.freeze({ ...entry.counts }),
      ascensionRate: completed > 0 ? entry.counts[TERMINAL_STATUS.ascended] / completed : null,
    });
  }

  return {
    strategies,
    outcomes: Object.freeze(outcomes),
    unmatchedRuns,
    dominance: {
      status: DOMINANCE_STATUS.notAttributable,
      reason:
        'A run holds one universe (contracts.md §1.1) and its terminal status belongs to that ' +
        'universe, not to an agent slot, so no pairing has a winner to compute a dominance ' +
        'verdict from. The status counts above are reported in full regardless. A per-arm ' +
        'outcome arrives with raids (0.9.0); until then, naming a dominant strategy would mean ' +
        "assigning the universe's outcome to slot 0, which is an attribution the simulation " +
        'never made.',
    },
  };
}

/** The matrix as fixed-width lines, for a summary file or a console. */
export function describeMatrix(matrix: PairwiseMatrix): string[] {
  const lines = [
    `pairwise outcome matrix over ${String(matrix.strategies.length)} strategies ` +
      `(${String(matrix.outcomes.length)} ordered pairings)`,
  ];
  for (const entry of matrix.outcomes) {
    const counts = Object.entries(entry.countsByStatus)
      .filter(([status]) => status !== TERMINAL_STATUS.running)
      .map(([status, count]) => `${status}=${String(count)}`)
      .join(' ');
    lines.push(
      `  ${entry.slot0} vs ${entry.slot1}: n=${String(entry.runs)} ${counts} ` +
        `ascensionRate=${entry.ascensionRate === null ? 'n/a' : entry.ascensionRate.toFixed(4)}`,
    );
  }
  if (matrix.unmatchedRuns > 0) {
    lines.push(`  ${String(matrix.unmatchedRuns)} run(s) named a strategy outside the pool`);
  }
  lines.push(`  dominance: ${matrix.dominance.status} — ${matrix.dominance.reason}`);
  return lines;
}
