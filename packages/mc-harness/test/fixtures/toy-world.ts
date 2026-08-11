/*
 * Multiverse Mages — a deterministic toy universe for exercising the harness.
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
 * ## What this is, and what it is honestly not
 *
 * It is a session that satisfies `AgentSession` structurally, is a pure function
 * of its run seed, and reaches all three non-failure terminal statuses. That is
 * enough to exercise every mechanism task groups 3 and 4 own: the episode loop
 * and its tick cap, the pool, the record builder, the aggregation, the storage,
 * and the two reproduction paths.
 *
 * It is **not** a universe. The real executor will drive `agent-api`'s session
 * over `coordination`'s world loop, and it cannot be written here — `contracts.md`
 * §5 grants `mc-harness` one edge, to `agent-api`, whose session API is being
 * built in parallel with this file, and the world loop's research, teaching and
 * scribing paths still throw. So the harness is proven against a world it can
 * actually run, and the day the real one is available it is swapped in at
 * exactly one place: the `RunExecutor` a caller supplies.
 *
 * ## Two constraints on this file that are not obvious
 *
 * **No runtime relative imports.** It is loaded by a bare Node process inside a
 * worker (see `pool-worker.mjs`), where Node strips types but does not rewrite
 * `./x.js` into `./x.ts`. Every import here is `import type`, which is erased.
 *
 * **The toy is integer-only and reads no clock**, not because the harness
 * requires it — the harness is host-side tooling — but because a fixture that
 * was itself irreproducible would make every reproducibility test in this
 * package prove nothing.
 */

import process from 'node:process';

import type {
  AgentSession,
  IllegalActionAccounting,
  MetricEntries,
  Provenance,
  RunOutcome,
  RunTask,
  SlotPolicy,
  TerminalStatus,
} from '@mm/mc-harness';

/** The scenario configuration a toy session is reset with. */
export interface ToyConfig {
  /** Per-tick drift. Comes from a sweep factor level. */
  readonly growth: number;
  /** Wealth at which the toy universe "ascends". */
  readonly ascendAt: number;
}

/** Metric ids the toy reports. Registered in `fixtures.ts`. */
export const TOY_METRICS = {
  finalWealth: 'toyFinalWealth',
  ticks: 'toyTicks',
  /** Always unavailable, so the `mechanic-absent` path is exercised for real. */
  absentMechanic: 'toyAbsentMechanic',
} as const;

/** A 32-bit LCG. Integer-only, and enough to make runs differ by seed. */
function nextState(state: number): number {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0;
}

/** The toy session. Deterministic in `(runSeed, config)` and nothing else. */
export class ToySession implements AgentSession<ToyConfig> {
  private rngState = 0;
  private wealth = 0;
  private ascendAt = 0;
  private growth = 0;
  private ticks = 0;
  private submissions = 0;
  private rejections = 0;
  private byActionId: Record<string, number> = {};

  reset(runSeed: number, config: ToyConfig): void {
    this.rngState = runSeed >>> 0;
    this.wealth = 100 + (runSeed % 64);
    this.growth = config.growth;
    this.ascendAt = config.ascendAt;
    this.ticks = 0;
    this.submissions = 0;
    this.rejections = 0;
    this.byActionId = {};
  }

  observe(): Float64Array {
    const view = new Float64Array(4);
    view[0] = Math.min(1, this.wealth / 1024);
    view[1] = Math.min(1, this.ticks / 1024);
    view[2] = this.wealth >= this.ascendAt ? 1 : 0;
    view[3] = this.growth / 8;
    return view;
  }

  legalActions(): Uint8Array {
    const mask = new Uint8Array(3);
    mask[0] = 1; // pass is always legal
    mask[1] = 1;
    // The "invest" action is masked until the toy universe can afford it, so a
    // policy that always prefers it produces genuine illegal-action counts.
    mask[2] = this.wealth >= 150 ? 1 : 0;
    return mask;
  }

  submit(actionId: number): void {
    if (this.status() !== 'running') {
      throw new Error('submit() on a terminated session.');
    }
    this.submissions += 1;
    const mask = this.legalActions();
    if (mask[actionId] !== 1) {
      this.rejections += 1;
      const key = String(actionId);
      this.byActionId[key] = (this.byActionId[key] ?? 0) + 1;
      return;
    }
    // The world only advances on a legal action, which is what makes an
    // all-illegal policy a `truncated` run rather than a hang.
    this.rngState = nextState(this.rngState);
    const drift = (this.rngState >>> 24) % 9;
    this.wealth += this.growth + drift - 4;
    if (actionId === 2) this.wealth += 3;
    this.ticks += 1;
  }

  status(): TerminalStatus {
    if (this.wealth >= this.ascendAt) return 'ascended';
    if (this.wealth <= 0) return 'stagnated';
    return 'running';
  }

  accounting(): IllegalActionAccounting {
    const sorted: Record<string, number> = {};
    for (const key of Object.keys(this.byActionId).sort()) {
      sorted[key] = this.byActionId[key] as number;
    }
    return { submissions: this.submissions, rejections: this.rejections, byActionId: sorted };
  }

  /** Reporting only — the metric collectors read it at episode end. */
  finalWealth(): number {
    return this.wealth;
  }
}

/** The strategies the toy pool offers. Task group 5 owns the real ones. */
export const TOY_STRATEGIES = ['toy-passive', 'toy-greedy', 'toy-alternating'] as const;

/** A strategy id to its policy. Deterministic, and different from each other. */
export function toyPolicy(strategyId: string): SlotPolicy {
  switch (strategyId) {
    case 'toy-greedy':
      // Always reaches for the maskable action, so it accrues rejections while
      // poor. That is the "was refused" half of the illegal-action signal.
      return () => 2;
    case 'toy-alternating':
      return (observation) => ((observation[1] as number) * 1024) % 2 === 0 ? 1 : 2;
    default:
      return () => 0;
  }
}

/** The provenance every toy run reports. Fixed, so records agree. */
export const TOY_PROVENANCE: Provenance = {
  buildVersion: 'mc-harness-test-0',
  contentHash: 'toy-content-0000',
  rngRegistryHash: 'toy-rng-registry-0',
  observationSchemaVersion: 1,
  observationLayoutDigest: 'toy-layout-0000',
  metricDefinitionVersions: {
    [TOY_METRICS.finalWealth]: 1,
    [TOY_METRICS.ticks]: 1,
    [TOY_METRICS.absentMechanic]: 1,
  },
};

/** How a toy executor may be perturbed, to prove the perturbation changes nothing. */
export interface ToyExecutorOptions {
  /**
   * Sleep a pseudo-random number of milliseconds before answering, so runs
   * complete in a different order than they were dispatched. Task 4.8.
   */
  readonly jitterMs?: number;
  /** Coordinates whose run should throw, to exercise failure isolation. */
  readonly throwOn?: readonly { readonly cellIndex: number; readonly replicateIndex: number }[];
  /** Coordinates whose run should hang forever, to exercise the per-run timeout. */
  readonly hangOn?: readonly { readonly cellIndex: number; readonly replicateIndex: number }[];
  /** Coordinates whose run should kill its worker, to exercise replacement. */
  readonly crashOn?: readonly { readonly cellIndex: number; readonly replicateIndex: number }[];
}

function matches(
  list: readonly { readonly cellIndex: number; readonly replicateIndex: number }[] | undefined,
  task: RunTask,
): boolean {
  if (list === undefined) return false;
  return list.some(
    (entry) =>
      entry.cellIndex === task.coordinates.cellIndex &&
      entry.replicateIndex === task.coordinates.replicateIndex,
  );
}

/**
 * The episode loop, inlined.
 *
 * `runEpisode` from `@mm/mc-harness` is what a real executor calls, and
 * `episode.test.ts` drives it directly. This fixture cannot import it: it is
 * loaded by a bare Node worker where a runtime relative import would not
 * resolve. The two are kept in step by `episode-parity.test.ts`, which runs the
 * same session through both and requires identical outcomes — so the duplication
 * is checked rather than trusted.
 */
function runToyEpisode(
  session: ToySession,
  runSeed: number,
  config: ToyConfig,
  policies: readonly SlotPolicy[],
  worldTickCap: number,
): { status: TerminalStatus; ticksRun: number } {
  session.reset(runSeed, config);
  let ticksRun = 0;
  while (session.status() === 'running') {
    if (ticksRun >= worldTickCap) return { status: 'truncated', ticksRun };
    const observation = session.observe();
    const mask = session.legalActions();
    for (let slot = 0; slot < policies.length; slot += 1) {
      session.submit((policies[slot] as SlotPolicy)(observation, mask, slot));
      if (session.status() !== 'running') break;
    }
    ticksRun += 1;
  }
  return { status: session.status(), ticksRun };
}

/** Builds the metric entries for a finished toy episode. */
function toyMetrics(session: ToySession, ticksRun: number, requested: readonly string[]): MetricEntries {
  const all: MetricEntries = {
    [TOY_METRICS.finalWealth]: { status: 'measured', value: session.finalWealth() },
    [TOY_METRICS.ticks]: { status: 'measured', value: ticksRun },
    [TOY_METRICS.absentMechanic]: { status: 'unavailable', reason: 'mechanic-absent' },
  };
  const entries: Record<string, MetricEntries[string]> = {};
  for (const metricId of requested) {
    const entry = all[metricId];
    if (entry !== undefined) entries[metricId] = entry;
  }
  return entries;
}

/**
 * Builds a run executor over the toy universe.
 *
 * Written as a factory taking plain data so the same construction works on the
 * main thread and inside a worker, where the options arrive through
 * `workerData` and therefore have to survive structured cloning.
 */
export function makeToyExecutor(
  options: ToyExecutorOptions = {},
): (task: RunTask) => Promise<RunOutcome> {
  return async (task: RunTask): Promise<RunOutcome> => {
    if (matches(options.crashOn, task)) {
      // Kills the worker outright rather than throwing: the pool has to notice
      // the exit, replace the worker, and carry on.
      process.exit(7);
    }
    if (matches(options.hangOn, task)) {
      await new Promise(() => {
        /* never settles — the per-run timeout is what ends this run */
      });
    }
    if (matches(options.throwOn, task)) {
      throw new Error(
        `toy executor refused cell ${String(task.coordinates.cellIndex)} replicate ` +
          `${String(task.coordinates.replicateIndex)}`,
      );
    }
    if (options.jitterMs !== undefined && options.jitterMs > 0) {
      // Deliberately wall-clock and deliberately unseeded: the point of this
      // knob is to make completion order differ between executions, which is
      // exactly what the results must be immune to.
      const delay = Math.random() * options.jitterMs;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const config: ToyConfig = {
      growth: Number(task.levels['growth'] ?? 0),
      ascendAt: Number(task.levels['ascendAt'] ?? 400),
    };
    const session = new ToySession();
    const policies = task.strategies.map((strategyId) => toyPolicy(strategyId));
    const { status, ticksRun } = runToyEpisode(
      session,
      task.runSeed,
      config,
      policies,
      task.worldTickCap,
    );

    return {
      status,
      ticksRun,
      metrics: toyMetrics(session, ticksRun, task.metrics),
      accounting: session.accounting(),
      provenance: TOY_PROVENANCE,
    };
  };
}
