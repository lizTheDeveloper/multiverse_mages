/*
 * Multiverse Mages — tournament scheduling and the pairwise outcome matrix.
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
 * Tasks 5.7 and 5.8, and the three capability scenarios they answer:
 * *"Pairings share seeds"*, *"Slot assignments are mirrored"*, and *"Pool
 * dominance is reported, not hidden"*.
 */

import type { RunRecord, SweepRegistries, SweepSpec } from '@mm/mc-harness';
import {
  BOT_POOL,
  BOT_POOL_REGISTRY,
  DOMINANCE_STATUS,
  RECORDED_STATUSES,
  TOURNAMENT_WORLD_SEED_FACTOR,
  describeMatrix,
  deriveRunSeed,
  expandSweep,
  factorRegistry,
  metricRegistry,
  orderedPairings,
  pairwiseMatrix,
  runSweep,
  tournamentSchedule,
  tournamentSpec,
  validateSweep,
} from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import { FIXTURE_PROVENANCE } from './fixtures.js';
import { SCRIPTED_PROVENANCE, makeScriptedExecutor } from '../fixtures/scripted-world.js';

/** Three of the eight, which keeps the ordered-pairing count at six. */
const TRIO = ['passive-control', 'archivist', 'portal-rush'] as const;

const REGISTRIES: SweepRegistries = {
  metrics: metricRegistry([
    { id: 'toyTicks', definitionVersion: 1, aggregation: 'mean', unit: 'world ticks' },
  ]),
  strategies: BOT_POOL_REGISTRY,
  factors: factorRegistry([TOURNAMENT_WORLD_SEED_FACTOR, 'growth']),
};

function trioSpec(overrides: Partial<Parameters<typeof tournamentSpec>[0]> = {}): SweepSpec {
  return tournamentSpec({
    sweepId: 'trio-tournament',
    rootSeed: 20260811,
    strategies: [...TRIO],
    worldSeeds: [11, 22, 33, 44],
    roundsPerPairing: 2,
    termination: { worldTickCap: 240, perRunTimeoutMs: 5000 },
    metrics: ['toyTicks'],
    ...overrides,
  });
}

describe('a tournament specification is a valid sweep (task 5.7)', () => {
  it('validates against the registries, with the bot pool as its strategy set', () => {
    expect(validateSweep(trioSpec(), REGISTRIES)).toEqual([]);
  });

  it('declares the mirrored assignment over exactly two slots', () => {
    const spec = trioSpec();
    expect(spec.agentPool.assignment).toBe('mirrored');
    expect(spec.agentPool.slots).toBe(2);
    // Six ordered pairings over three strategies, twice each.
    expect(spec.replicates).toBe(orderedPairings([...TRIO]).length * 2);
  });

  it('refuses a one-strategy tournament and an empty world-seed list', () => {
    expect(() => trioSpec({ strategies: ['archivist'] })).toThrow(/at least two strategies/);
    expect(() => trioSpec({ worldSeeds: [] })).toThrow(/at least one world seed/);
    expect(() => trioSpec({ roundsPerPairing: 0 })).toThrow(/positive integer/);
  });
});

describe('every pairing is played in both slot orders (task 5.7)', () => {
  it('gives every ordered pairing the same number of runs', () => {
    const schedule = tournamentSchedule(trioSpec());
    const counts = Object.values(schedule.runsByPairing);
    expect(counts).toHaveLength(orderedPairings([...TRIO]).length);
    expect(new Set(counts).size).toBe(1);
    // 4 world seeds × 6 pairings × 2 rounds = 48 runs, 8 per pairing.
    expect(schedule.runs).toHaveLength(48);
    expect(counts[0]).toBe(8);
  });

  it('plays each unordered pairing in both directions equally', () => {
    const schedule = tournamentSchedule(trioSpec());
    for (const [a, b] of orderedPairings([...TRIO])) {
      expect(schedule.runsByPairing[`${a} vs ${b}`]).toBe(schedule.runsByPairing[`${b} vs ${a}`]);
    }
  });

  it('derives pairwise-distinct run seeds, as the seed rule requires', () => {
    const schedule = tournamentSchedule(trioSpec());
    const seeds = new Set(schedule.runs.map((run) => run.runSeed));
    expect(seeds.size).toBe(schedule.runs.length);
    // And each is the published derivation of its own coordinates, so a record
    // is recomputable from the four inputs it carries.
    for (const run of schedule.runs) {
      expect(run.runSeed).toBe(
        deriveRunSeed({
          rootSeed: 20260811,
          sweepId: 'trio-tournament',
          cellIndex: run.cellIndex,
          replicateIndex: run.replicateIndex,
        }),
      );
    }
  });
});

describe('common random numbers across the pool (task 5.7)', () => {
  it('has every strategy encounter the same set of world seeds', () => {
    const schedule = tournamentSchedule(trioSpec());
    const sets = TRIO.map((strategyId) => schedule.worldSeedsByStrategy[strategyId]);
    expect(sets[0]).toEqual([11, 22, 33, 44]);
    for (const set of sets) expect(set).toEqual(sets[0]);
  });

  it('resolves a cell to the same world seed the sweep expansion does', () => {
    // The schedule re-derives the odometer rather than importing `expandSweep`,
    // because the two live at different layers. This is what stops them
    // drifting: a strategy would otherwise be matched on a world seed that is
    // not the level the scenario is handed.
    const spec = trioSpec({ factors: [{ id: 'growth', levels: [0, 5] }] });
    const plan = expandSweep(spec, REGISTRIES);
    const schedule = tournamentSchedule(spec);
    for (const cell of plan.cells) {
      const run = schedule.runs.find((entry) => entry.cellIndex === cell.cellIndex);
      expect(run?.worldSeed).toBe(cell.levels[TOURNAMENT_WORLD_SEED_FACTOR]);
    }
    // Crossed with a second factor, every strategy still sees every world seed.
    for (const strategyId of TRIO) {
      expect(schedule.worldSeedsByStrategy[strategyId]).toEqual([11, 22, 33, 44]);
    }
  });

  it('refuses a schedule whose replicates do not divide the pairing count', () => {
    const spec = { ...trioSpec(), replicates: 7 };
    expect(() => tournamentSchedule(spec)).toThrow(/does not divide/);
  });

  it('refuses a non-mirrored assignment and a missing world-seed factor', () => {
    expect(() =>
      tournamentSchedule({
        ...trioSpec(),
        agentPool: { ...trioSpec().agentPool, assignment: 'round-robin' },
      }),
    ).toThrow(/not "mirrored"/);
    expect(() =>
      tournamentSchedule({ ...trioSpec(), factors: [{ id: 'growth', levels: [0] }] }),
    ).toThrow(/declares no "worldSeed" factor/);
  });
});

// ---------------------------------------------------------------------------
// The pairwise matrix.
// ---------------------------------------------------------------------------

let recordCounter = 0;

/** A run record naming a pairing and a terminal status. */
function record(slot0: string, slot1: string, status: RunRecord['status']): RunRecord {
  const coordinates = {
    rootSeed: 1,
    sweepId: 'trio-tournament',
    cellIndex: 0,
    replicateIndex: recordCounter,
  };
  recordCounter += 1;
  return {
    recordFormatVersion: 1,
    coordinates,
    runSeed: deriveRunSeed(coordinates),
    seedDerivationVersion: 1,
    levels: { [TOURNAMENT_WORLD_SEED_FACTOR]: 11 },
    strategies: [slot0, slot1],
    status,
    terminalReason: status === 'ascended' ? 1 : status === 'stagnated' ? 3 : 0,
    ticksRun: 10,
    metrics: {},
    accounting: { submissions: 0, rejections: 0, byActionId: {} },
    provenance: FIXTURE_PROVENANCE,
  };
}

describe('the pairwise outcome matrix is reported whether or not anything dominates (5.8)', () => {
  it('covers every ordered pairing, including those with no runs', () => {
    const matrix = pairwiseMatrix([record('archivist', 'portal-rush', 'ascended')], [...TRIO]);
    expect(matrix.outcomes).toHaveLength(orderedPairings([...TRIO]).length);
    const empty = matrix.outcomes.filter((outcome) => outcome.runs === 0);
    // Five of the six pairings never ran, and they are in the matrix anyway: a
    // pairing missing from the matrix is indistinguishable from a pairing that
    // drew zero, which is a different fact about a tournament.
    expect(empty).toHaveLength(5);
    for (const outcome of empty) expect(outcome.ascensionRate).toBeNull();
  });

  it('keeps truncated runs in the denominator and excludes failed ones', () => {
    const matrix = pairwiseMatrix(
      [
        record('archivist', 'portal-rush', 'ascended'),
        record('archivist', 'portal-rush', 'truncated'),
        record('archivist', 'portal-rush', 'stagnated'),
        record('archivist', 'portal-rush', 'stagnated'),
        record('archivist', 'portal-rush', 'failed'),
      ],
      [...TRIO],
    );
    const played = matrix.outcomes.find(
      (entry) => entry.slot0 === 'archivist' && entry.slot1 === 'portal-rush',
    );
    expect(played?.runs).toBe(5);
    expect(played?.countsByStatus).toMatchObject({
      ascended: 1,
      truncated: 1,
      stagnated: 2,
      failed: 1,
    });
    // One ascension over the four that completed — the truncated run counts,
    // the failed one does not. §7's denominator rule, as arithmetic over
    // fabricated records: nothing here measures the game.
    expect(played?.ascensionRate).toBe(0.25);
  });

  it('reports a dominance status with a reason rather than a winner it cannot defend', () => {
    const matrix = pairwiseMatrix(
      [
        record('archivist', 'portal-rush', 'ascended'),
        record('portal-rush', 'archivist', 'stagnated'),
      ],
      [...TRIO],
    );
    expect(matrix.dominance.status).toBe(DOMINANCE_STATUS.notAttributable);
    expect(matrix.dominance.reason).toMatch(/one universe/);
    expect(matrix.dominance.strategyId).toBeUndefined();
  });

  it('counts a record naming a strategy outside the pool rather than folding it in', () => {
    const matrix = pairwiseMatrix(
      [
        record('archivist', 'portal-rush', 'ascended'),
        record('archivist', 'a-strategy-that-was-renamed', 'ascended'),
      ],
      [...TRIO],
    );
    expect(matrix.unmatchedRuns).toBe(1);
    const total = matrix.outcomes.reduce((sum, outcome) => sum + outcome.runs, 0);
    expect(total).toBe(1);
  });

  it('describes itself as one line per pairing plus the dominance verdict', () => {
    const lines = describeMatrix(
      pairwiseMatrix([record('archivist', 'portal-rush', 'ascended')], [...TRIO]),
    );
    expect(lines[0]).toContain('pairwise outcome matrix over 3 strategies');
    expect(lines).toHaveLength(orderedPairings([...TRIO]).length + 2);
    expect(lines.at(-1)).toContain('not-attributable');
    expect(lines.some((line) => line.includes('archivist vs portal-rush: n=1'))).toBe(true);
  });
});

describe('a tournament runs end to end over the shipped pool', () => {
  /** The whole registered pool. Kept to one world seed for speed. */
  const POOL = BOT_POOL.map((definition) => definition.strategyId);

  const fullPoolSpec = (overrides: Partial<SweepSpec> = {}): SweepSpec => ({
    ...tournamentSpec({
      sweepId: 'full-pool-tournament',
      rootSeed: 424242,
      strategies: POOL,
      worldSeeds: [101, 202],
      roundsPerPairing: 1,
      termination: { worldTickCap: 60, perRunTimeoutMs: 20_000 },
      metrics: ['toyTicks'],
    }),
    ...overrides,
  });

  it('completes against a build where every god action is masked out (task 5.9)', async () => {
    const spec = fullPoolSpec();
    const result = await runSweep({
      spec,
      registries: REGISTRIES,
      execution: { mode: 'inline', execute: makeScriptedExecutor({ maskEverything: true }) },
      provenance: SCRIPTED_PROVENANCE,
      now: () => 0,
    });

    // 2 world seeds × every ordered pairing of the pool, and every one of them
    // ends with a status from the recorded set. Nothing stalls, nothing raises.
    //
    // Derived from BOT_POOL rather than written as 112, because the count is
    // `2 × k × (k − 1)` and the literal silently encoded k = 8. The two
    // adversarial probes are appended to the pool; a literal here turns "the
    // pool grew" into a failure that reads as a tournament defect.
    expect(result.records).toHaveLength(2 * POOL.length * (POOL.length - 1));
    for (const record of result.records) {
      expect(RECORDED_STATUSES).toContain(record.status);
      expect(record.status).not.toBe('failed');
      // Only no-op was ever legal, so nothing was refused.
      expect(record.accounting.rejections).toBe(0);
    }
    expect(result.summary.disqualified).toBe(false);
  }, 60_000);

  it('reports the pairwise matrix over the whole pool (task 5.8)', async () => {
    const spec = fullPoolSpec();
    const result = await runSweep({
      spec,
      registries: REGISTRIES,
      execution: { mode: 'inline', execute: makeScriptedExecutor({ ascendAt: 40 }) },
      provenance: SCRIPTED_PROVENANCE,
      now: () => 0,
    });

    const matrix = pairwiseMatrix(result.records, POOL);
    expect(matrix.strategies).toEqual([...POOL].sort());
    expect(matrix.outcomes).toHaveLength(orderedPairings([...POOL].sort()).length);
    expect(matrix.unmatchedRuns).toBe(0);
    // Every pairing ran, and every pairing ran the same number of times: the
    // matched design the schedule promised, observed in the records it made.
    expect(new Set(matrix.outcomes.map((outcome) => outcome.runs))).toEqual(new Set([2]));

    // The matrix is reported whether or not anything dominates, and at this
    // build nothing can — see the dominance reason.
    expect(matrix.dominance.status).toBe(DOMINANCE_STATUS.notAttributable);
    expect(describeMatrix(matrix)).toHaveLength(matrix.outcomes.length + 2);
  }, 60_000);

  it('is exactly reproducible across two executions', async () => {
    const run = async (): Promise<readonly RunRecord[]> =>
      (
        await runSweep({
          spec: fullPoolSpec(),
          registries: REGISTRIES,
          execution: { mode: 'inline', execute: makeScriptedExecutor({ ascendAt: 40 }) },
          provenance: SCRIPTED_PROVENANCE,
          now: () => 0,
        })
      ).records;
    expect(await run()).toEqual(await run());
  }, 60_000);
});
