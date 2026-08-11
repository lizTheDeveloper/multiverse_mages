/*
 * Multiverse Mages — the sweep specification format, its validator, and its
 * factorial expansion.
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
 * Tasks 3.4 and 3.5.
 *
 * A sweep is declared in a committed file, not assembled by a script, because
 * the file is the experiment: it is what a reader compares two baselines
 * against, and what the configuration hash in the summary is taken over. Every
 * field the capability spec names is required — there is no default for
 * "replicate count" or "world-tick cap", since a default is a decision nobody
 * made appearing in a record as though someone had.
 *
 * ## Validation happens before dispatch, always
 *
 * {@link validateSweep} returns *every* problem it finds rather than throwing on
 * the first. A sweep file with three typos should cost one round trip, not
 * three; the alternative is the pattern where the third failure is the one
 * where somebody stops reading the message.
 *
 * ## Canonical factor order, and the footgun it removes
 *
 * Factors are expanded **sorted by id**, not in the order they appear in the
 * file, with the last factor varying fastest. The alternative — file order — has
 * a quiet failure: moving two factor blocks past each other in an editor
 * re-maps every `cellIndex` to a different level combination, so the seeds stay
 * the same, the runs stay the same, and every number in the sweep now describes
 * a different cell. Sorting makes `cellIndex -> levels` a function of the
 * factor *set*, which is what a reader assumes it already is.
 *
 * Level order within a factor is significant and is preserved: levels are
 * ordered data (`0.5, 1.0, 2.0`), and re-ordering them is a change to the
 * experiment. The configuration hash covers the whole specification, so that
 * change is visible in the summary either way.
 */

import { canonicalHash } from './canonical.js';
import type { JsonValue } from './canonical.js';
import type { FactorRegistry, MetricRegistry, StrategyRegistry } from './metrics.js';
import { MAX_CELL_INDEX, MAX_REPLICATE_INDEX } from './seed.js';

/** A parameter factor and the levels it takes. */
export interface SweepFactor {
  /** Stable identifier. Scenario configuration is keyed on it. */
  readonly id: string;
  /** At least one level. Order is significant and preserved. */
  readonly levels: readonly JsonValue[];
}

/** How strategies are assigned to the agent slots of a run. */
export const ASSIGNMENT_RULE = {
  /** Every slot gets the first strategy. The single-agent case. */
  fixed: 'fixed',
  /** Slot *i* of run *n* gets strategy `(n + i) mod poolSize`. */
  roundRobin: 'round-robin',
  /** Every ordered pairing, each played in both slot assignments. */
  mirrored: 'mirrored',
} as const;

/** Any rule from {@link ASSIGNMENT_RULE}. */
export type AssignmentRule = (typeof ASSIGNMENT_RULE)[keyof typeof ASSIGNMENT_RULE];

/** The agent pool a sweep draws from, and how it fills slots. */
export interface AgentPoolSpec {
  /** Strategy ids, each of which must exist in the strategy registry. */
  readonly strategies: readonly string[];
  readonly assignment: AssignmentRule;
  /** How many agent slots a run has. At least one. */
  readonly slots: number;
}

/** When a run ends, and when the harness gives up on it. */
export interface TerminationSpec {
  /**
   * The world-tick cap. A run still running at the cap ends with status
   * `truncated` and stays in the denominator of every rate metric.
   */
  readonly worldTickCap: number;
  /**
   * Wall-clock milliseconds after which a dispatched run is abandoned, its
   * worker replaced, and the run recorded `failed` with reason `timeout`.
   */
  readonly perRunTimeoutMs: number;
}

/** Ablation configuration. Task group 7 gives the modes meaning. */
export interface AblationSpec {
  /** `none`, or one-sided mirrored ablation over the named primitives. */
  readonly mode: 'none' | 'one-sided';
  /** Primitive ids to ablate. Must be empty when `mode` is `none`. */
  readonly primitives: readonly string[];
}

/** Whether a sweep is the per-commit gate or the full release sweep. */
export const SWEEP_KIND = { gate: 'gate', full: 'full' } as const;
/** Any kind from {@link SWEEP_KIND}. */
export type SweepKind = (typeof SWEEP_KIND)[keyof typeof SWEEP_KIND];

/** A complete sweep specification, as committed. */
export interface SweepSpec {
  /** Stable across regenerations of the sweep. Part of the seed derivation. */
  readonly sweepId: string;
  /** Unsigned 32-bit. The one number that makes the whole sweep reproducible. */
  readonly rootSeed: number;
  readonly factors: readonly SweepFactor[];
  /** Runs per parameter cell. At least one. */
  readonly replicates: number;
  readonly agentPool: AgentPoolSpec;
  readonly termination: TerminationSpec;
  /** Metric ids to collect. Each must exist in the metric registry. */
  readonly metrics: readonly string[];
  readonly ablation: AblationSpec;
  readonly kind: SweepKind;
  /**
   * Failed runs beyond this count disqualify the sweep: it completes, it is
   * reported, and it is not eligible to produce a baseline (task 3.8).
   */
  readonly failureThreshold: number;
}

/** One parameter cell of the factorial expansion. */
export interface SweepCell {
  readonly cellIndex: number;
  /** Factor id to chosen level, for every factor. */
  readonly levels: Readonly<Record<string, JsonValue>>;
}

/** What a validated sweep will cost, reported before any run is dispatched. */
export interface SweepPlan {
  readonly sweepId: string;
  readonly kind: SweepKind;
  readonly cellCount: number;
  readonly runCount: number;
  readonly cells: readonly SweepCell[];
  /** SHA-256 over the canonical form of the whole specification. */
  readonly configurationHash: string;
}

/** The registries a sweep is validated against. */
export interface SweepRegistries {
  readonly metrics: MetricRegistry;
  readonly strategies: StrategyRegistry;
  /** The factors the scenario actually reads. See {@link FactorRegistry}. */
  readonly factors: FactorRegistry;
}

const ASSIGNMENT_RULES: readonly string[] = Object.values(ASSIGNMENT_RULE);
const SWEEP_KINDS: readonly string[] = Object.values(SWEEP_KIND);

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Every way `spec` fails the format, as human-readable lines, sorted.
 *
 * Sorted so that two runs of the validator over the same broken file produce
 * the same message in the same order — a validator whose output shuffles is one
 * whose diffs are unreadable.
 */
export function validateSweep(spec: SweepSpec, registries: SweepRegistries): string[] {
  const problems: string[] = [];

  if (typeof spec.sweepId !== 'string' || spec.sweepId.length === 0) {
    problems.push('sweepId must be a non-empty string — it is part of every run seed.');
  }
  if (
    typeof spec.rootSeed !== 'number' ||
    !Number.isInteger(spec.rootSeed) ||
    spec.rootSeed < 0 ||
    spec.rootSeed > 4294967295
  ) {
    problems.push('rootSeed must be an integer in [0, 4294967295].');
  }

  if (!Array.isArray(spec.factors) || spec.factors.length === 0) {
    problems.push(
      'factors must list at least one factor. A sweep with no factors is a single cell, which is ' +
        'a legitimate experiment — declare it as one factor with one level so the record says so.',
    );
  } else {
    const seen = new Set<string>();
    for (const factor of spec.factors) {
      if (typeof factor.id !== 'string' || factor.id.length === 0) {
        problems.push('every factor needs a non-empty id.');
        continue;
      }
      if (seen.has(factor.id)) {
        problems.push(`factor ${factor.id} is declared twice.`);
      }
      seen.add(factor.id);
      if (!registries.factors.has(factor.id)) {
        problems.push(
          `factor ${factor.id} is not one the scenario reads. Registered: ` +
            `${registries.factors.ids.join(', ') || '(none)'}. A factor nothing reads still ` +
            'multiplies the cell count, and every cell it produces is a duplicate of its ' +
            'neighbour reported as a separate measurement.',
        );
      }
      if (!Array.isArray(factor.levels) || factor.levels.length === 0) {
        problems.push(`factor ${factor.id} must declare at least one level.`);
        continue;
      }
      const encoded = factor.levels.map((level: JsonValue) => JSON.stringify(level));
      if (new Set(encoded).size !== encoded.length) {
        problems.push(
          `factor ${factor.id} declares the same level twice. Two cells differing in nothing are ` +
            'two cells whose difference no aggregate can explain.',
        );
      }
    }
  }

  if (!isPositiveInteger(spec.replicates)) {
    problems.push('replicates must be a positive integer.');
  } else if (spec.replicates > MAX_REPLICATE_INDEX + 1) {
    problems.push(
      `replicates is ${String(spec.replicates)}, beyond the ${String(MAX_REPLICATE_INDEX + 1)} the ` +
        'seed derivation can distinguish. See deriveRunSeed.',
    );
  }

  const pool = spec.agentPool;
  if (pool === undefined || typeof pool !== 'object') {
    problems.push('agentPool is required: strategies, assignment rule, and slot count.');
  } else {
    if (!Array.isArray(pool.strategies) || pool.strategies.length === 0) {
      problems.push('agentPool.strategies must name at least one strategy.');
    } else {
      for (const strategyId of pool.strategies) {
        if (!registries.strategies.has(strategyId)) {
          problems.push(
            `agentPool names strategy ${strategyId}, which is not in the strategy registry. ` +
              `Registered: ${registries.strategies.ids.join(', ') || '(none)'}.`,
          );
        }
      }
      if (new Set(pool.strategies).size !== pool.strategies.length) {
        problems.push('agentPool.strategies names the same strategy twice.');
      }
    }
    if (!ASSIGNMENT_RULES.includes(pool.assignment)) {
      problems.push(
        `agentPool.assignment must be one of ${ASSIGNMENT_RULES.join(', ')}, received ` +
          `${String(pool.assignment)}.`,
      );
    }
    if (!isPositiveInteger(pool.slots)) {
      problems.push('agentPool.slots must be a positive integer.');
    }
    if (pool.assignment === ASSIGNMENT_RULE.mirrored && pool.slots !== 2) {
      problems.push(
        'agentPool.assignment "mirrored" mirrors a two-slot pairing, so slots must be 2. Slot bias ' +
          'cancels by swapping two sides; there is nothing to swap with one or three.',
      );
    }
  }

  const termination = spec.termination;
  if (termination === undefined || typeof termination !== 'object') {
    problems.push('termination is required: worldTickCap and perRunTimeoutMs.');
  } else {
    if (!isPositiveInteger(termination.worldTickCap)) {
      problems.push(
        'termination.worldTickCap must be a positive integer. Every run must terminate, and the ' +
          "simulation's own terminal conditions are not enough to promise it.",
      );
    }
    if (!isPositiveInteger(termination.perRunTimeoutMs)) {
      problems.push('termination.perRunTimeoutMs must be a positive integer.');
    }
  }

  if (!Array.isArray(spec.metrics)) {
    problems.push('metrics must be an array of metric ids.');
  } else {
    for (const metricId of spec.metrics) {
      if (!registries.metrics.has(metricId)) {
        problems.push(
          `metrics names ${metricId}, which is not in the metric registry. Registered: ` +
            `${registries.metrics.ids.join(', ') || '(none)'}.`,
        );
      }
    }
    if (new Set(spec.metrics).size !== spec.metrics.length) {
      problems.push('metrics names the same metric twice.');
    }
  }

  const ablation = spec.ablation;
  if (ablation === undefined || typeof ablation !== 'object') {
    problems.push('ablation is required. Declare {"mode": "none", "primitives": []} for no ablation.');
  } else {
    if (ablation.mode !== 'none' && ablation.mode !== 'one-sided') {
      problems.push(`ablation.mode must be "none" or "one-sided", received ${String(ablation.mode)}.`);
    }
    if (!Array.isArray(ablation.primitives)) {
      problems.push('ablation.primitives must be an array.');
    } else if (ablation.mode === 'none' && ablation.primitives.length > 0) {
      problems.push('ablation.mode is "none" but primitives are named. One of the two is a mistake.');
    } else if (ablation.mode === 'one-sided' && ablation.primitives.length === 0) {
      problems.push('ablation.mode is "one-sided" but no primitive is named to ablate.');
    }
  }

  if (!SWEEP_KINDS.includes(spec.kind)) {
    problems.push(
      `kind must be one of ${SWEEP_KINDS.join(', ')}. The gate sweep and the full sweep have ` +
        'different sample sizes and therefore different tolerances; a sweep that does not say ' +
        'which it is cannot be compared against either baseline.',
    );
  }

  if (!isNonNegativeInteger(spec.failureThreshold)) {
    problems.push('failureThreshold must be a non-negative integer.');
  }

  // Only meaningful once the factors themselves validate.
  if (problems.length === 0) {
    const cellCount = spec.factors.reduce((count, factor) => count * factor.levels.length, 1);
    if (cellCount > MAX_CELL_INDEX + 1) {
      problems.push(
        `the factorial expansion is ${String(cellCount)} cells, beyond the ` +
          `${String(MAX_CELL_INDEX + 1)} the seed derivation can distinguish. See deriveRunSeed.`,
      );
    }
  }

  return problems.sort();
}

/**
 * Expands a sweep into its parameter cells, in canonical order.
 *
 * The odometer runs with the **last** sorted factor varying fastest, which is
 * the ordering a nested-loop reader expects and the one `cellIndex` is defined
 * against. It is stated here and pinned by a test because it is part of the
 * seed derivation's meaning: the same `cellIndex` must name the same level
 * combination in every execution, forever.
 *
 * @throws Error if the specification does not validate. Expansion of an invalid
 * sweep would report a cell count for an experiment nobody could run.
 */
export function expandSweep(spec: SweepSpec, registries: SweepRegistries): SweepPlan {
  const problems = validateSweep(spec, registries);
  if (problems.length > 0) {
    throw new Error(
      `Sweep ${String(spec.sweepId)} is not valid and no run was dispatched:\n  ${problems.join('\n  ')}`,
    );
  }

  const ordered = [...spec.factors].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const cellCount = ordered.reduce((count, factor) => count * factor.levels.length, 1);

  const cells: SweepCell[] = [];
  for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
    const levels: Record<string, JsonValue> = {};
    let remainder = cellIndex;
    // Walk the factors from last to first so the last one varies fastest.
    for (let position = ordered.length - 1; position >= 0; position -= 1) {
      const factor = ordered[position] as SweepFactor;
      const width = factor.levels.length;
      levels[factor.id] = factor.levels[remainder % width] as JsonValue;
      remainder = Math.floor(remainder / width);
    }
    cells.push({ cellIndex, levels });
  }

  return {
    sweepId: spec.sweepId,
    kind: spec.kind,
    cellCount,
    runCount: cellCount * spec.replicates,
    cells,
    configurationHash: sweepConfigurationHash(spec),
  };
}

/**
 * SHA-256 over the canonical form of the whole specification.
 *
 * Everything is included, including the fields that do not change what runs —
 * `kind`, `failureThreshold`, `perRunTimeoutMs`. A hash that covered only the
 * "meaningful" fields would be a hash that silently called the gate sweep and
 * the full sweep the same experiment, and the summary's whole job is to say
 * which experiment produced these numbers.
 */
export function sweepConfigurationHash(spec: SweepSpec): string {
  return canonicalHash(spec as unknown as JsonValue, 'sweep');
}

/**
 * Assigns strategies to the agent slots of one run.
 *
 * A pure function of the pool and the run's coordinates, for the same reason
 * seeds are: an assignment that depended on dispatch order would make the
 * tournament's pairings a function of how busy the machine was.
 */
export function assignStrategies(
  pool: AgentPoolSpec,
  cellIndex: number,
  replicateIndex: number,
): readonly string[] {
  const size = pool.strategies.length;
  const slots: string[] = [];
  switch (pool.assignment) {
    case ASSIGNMENT_RULE.fixed:
      for (let slot = 0; slot < pool.slots; slot += 1) {
        slots.push(pool.strategies[0] as string);
      }
      return slots;
    case ASSIGNMENT_RULE.roundRobin: {
      for (let slot = 0; slot < pool.slots; slot += 1) {
        slots.push(pool.strategies[(replicateIndex + slot) % size] as string);
      }
      return slots;
    }
    case ASSIGNMENT_RULE.mirrored: {
      // Every ordered pair (a, b) with a !== b, cycled by replicate. Ordered
      // rather than unordered, so each pairing appears in both slot
      // assignments and side bias cancels over the replicates of a cell.
      const pairs: [string, string][] = [];
      for (const a of pool.strategies) {
        for (const b of pool.strategies) {
          if (a !== b) pairs.push([a, b]);
        }
      }
      if (pairs.length === 0) {
        // A one-strategy pool mirrored against itself: legitimate, and the
        // self-pairing is the only one available.
        const only = pool.strategies[0] as string;
        return [only, only];
      }
      const pair = pairs[(cellIndex * pool.slots + replicateIndex) % pairs.length] as [string, string];
      return [pair[0], pair[1]];
    }
    default:
      throw new Error(`Unknown assignment rule ${String(pool.assignment)}.`);
  }
}
