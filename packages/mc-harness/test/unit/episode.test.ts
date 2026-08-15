/*
 * Multiverse Mages — bounded run termination, task 3.6.
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

import type { AgentSession, TerminalStatus } from '@mm/mc-harness';
import { RECORDED_STATUSES, TERMINAL_STATUS, runEpisode, runSweep } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import { POOL_WORKER_URL, TOY_REGISTRIES, toySweep } from './fixtures.js';
import { ToySession, makeToyExecutor, toyPolicy } from '../fixtures/toy-world.js';

const provenance = {
  buildVersion: 'mc-harness-test-0',
  contentHash: 'toy-content-0000',
  rngRegistryHash: 'toy-rng-registry-0',
  observationSchemaVersion: 1,
  observationLayoutDigest: 'toy-layout-0000',
  metricDefinitionVersions: { toyFinalWealth: 1, toyTicks: 1, toyAbsentMechanic: 1 },
};

/** A session that never terminates on its own. The cap is the only thing that can end it. */
class NeverEndingSession implements AgentSession<Record<string, never>> {
  submissions = 0;
  reset(): void {
    this.submissions = 0;
  }
  observe(): Float64Array {
    return new Float64Array(1);
  }
  /** No parameterized actions in this double; the loop only counts submissions. */
  candidates(): ReadonlyMap<number, readonly never[]> {
    return new Map();
  }
  legalActions(): Uint8Array {
    return Uint8Array.of(1);
  }
  submit(): void {
    this.submissions += 1;
  }
  status(): TerminalStatus {
    return TERMINAL_STATUS.running;
  }
  /** Nothing ended, so §1.1's `none` — the honest answer for a live universe. */
  terminalReason(): number {
    return 0;
  }
  accounting() {
    return { submissions: this.submissions, rejections: 0, byActionId: {} };
  }
}

/** A session that is already over before the first observation. */
class AlreadyOverSession extends NeverEndingSession {
  override status(): TerminalStatus {
    return TERMINAL_STATUS.ascended;
  }
}

describe('the cap ends a non-terminating run', () => {
  it('records truncated, at exactly the cap, having stepped the cap many ticks', () => {
    const session = new NeverEndingSession();
    const outcome = runEpisode({
      session,
      runSeed: 1,
      scenarioConfig: {},
      policies: [() => 0],
      worldTickCap: 25,
    });
    expect(outcome.status).toBe(TERMINAL_STATUS.truncated);
    expect(outcome.ticksRun).toBe(25);
    expect(session.submissions).toBe(25);
  });

  it('does not step a session that is already terminal', () => {
    const outcome = runEpisode({
      session: new AlreadyOverSession(),
      runSeed: 1,
      scenarioConfig: {},
      policies: [() => 0],
      worldTickCap: 25,
    });
    expect(outcome.status).toBe(TERMINAL_STATUS.ascended);
    expect(outcome.ticksRun).toBe(0);
  });

  it('refuses an action id that is not an integer rather than coercing it', () => {
    expect(() =>
      runEpisode({
        session: new NeverEndingSession(),
        runSeed: 1,
        scenarioConfig: {},
        policies: [() => Number.NaN],
        worldTickCap: 4,
      }),
    ).toThrow(/not an action id/);
  });
});

describe('every completed run carries exactly one terminal status from the set', () => {
  it('reaches ascended, stagnated and truncated across a real sweep', async () => {
    const spec = toySweep({
      factors: [
        { id: 'growth', levels: [-30, 0, 6] },
        { id: 'ascendAt', levels: [130, 100000] },
      ],
      replicates: 6,
      termination: { worldTickCap: 12, perRunTimeoutMs: 5000 },
    });
    const result = await runSweep({
      spec,
      registries: TOY_REGISTRIES,
      execution: { mode: 'workers', workerUrl: POOL_WORKER_URL, workerCount: 4 },
      provenance,
      now: () => 0,
    });

    for (const record of result.records) {
      expect(RECORDED_STATUSES).toContain(record.status);
    }
    const seen = new Set(result.records.map((record) => record.status));
    expect(seen).toContain('ascended');
    expect(seen).toContain('stagnated');
    expect(seen).toContain('truncated');

    // Truncated runs stay in the denominator: they are recorded, not dropped.
    expect(result.summary.runCount).toBe(result.records.length);
    const counted = Object.values(result.summary.countsByStatus).reduce((a, b) => a + b, 0);
    expect(counted).toBe(result.records.length);
  }, 60_000);

  it('collects a truncated run metrics up to the cap rather than discarding them', async () => {
    const spec = toySweep({
      factors: [{ id: 'growth', levels: [0] }, { id: 'ascendAt', levels: [100000] }],
      replicates: 2,
      termination: { worldTickCap: 9, perRunTimeoutMs: 5000 },
    });
    const result = await runSweep({
      spec,
      registries: TOY_REGISTRIES,
      execution: { mode: 'inline', execute: makeToyExecutor() },
      provenance,
      now: () => 0,
    });
    for (const record of result.records) {
      expect(record.status).toBe('truncated');
      expect(record.ticksRun).toBe(9);
      expect(record.metrics['toyTicks']).toEqual({ status: 'measured', value: 9 });
    }
  });
});

describe('illegal-action accounting survives to the record', () => {
  it('reports submissions, rejections and the per-action-id breakdown', () => {
    const session = new ToySession();
    const outcome = runEpisode({
      session,
      runSeed: 7,
      scenarioConfig: { growth: 0, ascendAt: 100000 },
      // The greedy policy always reaches for action 2, which is masked while poor.
      policies: [toyPolicy('toy-greedy')],
      worldTickCap: 20,
    });
    expect(outcome.status).toBe('truncated');
    expect(outcome.accounting.submissions).toBe(20);
    expect(outcome.accounting.rejections).toBeGreaterThan(0);
    expect(Object.keys(outcome.accounting.byActionId)).toEqual(['2']);

    // The control: a passive policy submits a legal action every tick and is
    // never refused, so a non-zero rejection count above means something.
    const passive = runEpisode({
      session: new ToySession(),
      runSeed: 7,
      scenarioConfig: { growth: 0, ascendAt: 100000 },
      policies: [toyPolicy('toy-passive')],
      worldTickCap: 20,
    });
    expect(passive.accounting.rejections).toBe(0);
  });
});

describe('the episode loop and the fixture worker agree', () => {
  it('produces the same status and tick count through both paths', async () => {
    // `toy-world.ts` inlines the loop because a bare Node worker cannot import
    // it. This is the test that keeps the copy honest — without it, the two
    // could drift and every worker-based result would describe a slightly
    // different game from every in-process one.
    const executor = makeToyExecutor();
    for (const runSeed of [1, 2, 3, 99, 123456]) {
      for (const strategyId of ['toy-passive', 'toy-greedy', 'toy-alternating']) {
        const viaExecutor = await executor({
          coordinates: { rootSeed: 1, sweepId: 's', cellIndex: 0, replicateIndex: 0 },
          runSeed,
          levels: { growth: 1, ascendAt: 300 },
          strategies: [strategyId],
          worldTickCap: 50,
          metrics: ['toyTicks'],
          ablatedPrimitives: [],
        });
        const viaLoop = runEpisode({
          session: new ToySession(),
          runSeed,
          scenarioConfig: { growth: 1, ascendAt: 300 },
          policies: [toyPolicy(strategyId)],
          worldTickCap: 50,
        });
        expect({ status: viaExecutor.status, ticks: viaExecutor.ticksRun }).toEqual({
          status: viaLoop.status,
          ticks: viaLoop.ticksRun,
        });
      }
    }
  });
});
