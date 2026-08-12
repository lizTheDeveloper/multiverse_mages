/*
 * Multiverse Mages — result records and provenance, tasks 4.1, 4.2 and 4.3.
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

import type { Provenance, RunRecord, RunTask } from '@mm/mc-harness';
import {
  buildRunRecord,
  canonicalJson,
  decodeRecord,
  deriveRunSeed,
  encodeRecord,
  provenanceDisagreements,
  provenanceProblems,
  reproducibleSummary,
  runSweep,
  seedMatchesCoordinates,
} from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import { FIXTURE_PROVENANCE, TOY_REGISTRIES, syntheticRecord, toySweep } from './fixtures.js';
import { makeToyExecutor } from '../fixtures/toy-world.js';

const coordinates = { rootSeed: 11, sweepId: 'toy-sweep', cellIndex: 2, replicateIndex: 1 };

function task(overrides: Partial<RunTask> = {}): RunTask {
  return {
    coordinates,
    runSeed: deriveRunSeed(coordinates),
    levels: { growth: 2, ascendAt: 400 },
    strategies: ['toy-passive'],
    worldTickCap: 32,
    metrics: ['toyFinalWealth', 'toyTicks'],
    ablatedPrimitives: [],
    ...overrides,
  };
}

describe('a record is self-describing', () => {
  it('identifies the build, content, metric definitions and seed with no other file', () => {
    const record = buildRunRecord({
      task: task(),
      status: 'ascended',
      ticksRun: 14,
      metrics: {
        toyFinalWealth: { status: 'measured', value: 401 },
        toyTicks: { status: 'measured', value: 14 },
      },
      accounting: { submissions: 14, rejections: 0, byActionId: {} },
      provenance: FIXTURE_PROVENANCE,
    });

    // The four derivation inputs, and a seed that recomputes from them.
    expect(record.coordinates).toEqual(coordinates);
    expect(seedMatchesCoordinates(record.coordinates, record.runSeed)).toBe(true);
    // Factor levels, strategies, status, and every metric entry.
    expect(record.levels).toEqual({ growth: 2, ascendAt: 400 });
    expect(record.strategies).toEqual(['toy-passive']);
    expect(record.status).toBe('ascended');
    expect(Object.keys(record.metrics).sort()).toEqual(['toyFinalWealth', 'toyTicks']);
    // The provenance block, in full.
    expect(record.provenance.buildVersion).toBe(FIXTURE_PROVENANCE.buildVersion);
    expect(record.provenance.contentHash).toBe(FIXTURE_PROVENANCE.contentHash);
    expect(record.provenance.rngRegistryHash).toBe(FIXTURE_PROVENANCE.rngRegistryHash);
    expect(record.provenance.observationSchemaVersion).toBe(1);
    expect(record.provenance.observationLayoutDigest).toBe(FIXTURE_PROVENANCE.observationLayoutDigest);
    expect(record.provenance.metricDefinitionVersions['toyTicks']).toBe(1);
  });

  it('round-trips through its newline-delimited form', () => {
    const record = syntheticRecord({
      cellIndex: 3,
      replicateIndex: 2,
      metrics: { toyTicks: { status: 'measured', value: 9 } },
    });
    const line = encodeRecord(record);
    expect(line).not.toContain('\n');
    expect(decodeRecord(line)).toEqual(record);
  });

  it('serializes with sorted keys, so equal content gives equal bytes', () => {
    const record = syntheticRecord({
      cellIndex: 0,
      replicateIndex: 0,
      metrics: { toyTicks: { status: 'measured', value: 1 } },
    });
    // The same record with its top-level keys inserted in a different order.
    const shuffled = Object.fromEntries(
      Object.entries(record as unknown as Record<string, unknown>).reverse(),
    ) as unknown as RunRecord;
    expect(encodeRecord(shuffled)).toBe(encodeRecord(record));
  });
});

describe('every registered metric has an entry', () => {
  it('refuses to build a completed record that is missing one', () => {
    expect(() =>
      buildRunRecord({
        task: task({ metrics: ['toyFinalWealth', 'toyTicks', 'toyAbsentMechanic'] }),
        status: 'stagnated',
        ticksRun: 3,
        metrics: { toyFinalWealth: { status: 'measured', value: 0 } },
        accounting: { submissions: 3, rejections: 0, byActionId: {} },
        provenance: FIXTURE_PROVENANCE,
      }),
    ).toThrow(/toyTicks, toyAbsentMechanic/);
  });

  it('accepts an explicit unavailable status in place of a measurement', () => {
    const record = buildRunRecord({
      task: task({ metrics: ['toyFinalWealth', 'toyAbsentMechanic'] }),
      status: 'stagnated',
      ticksRun: 3,
      metrics: {
        toyFinalWealth: { status: 'measured', value: 0 },
        toyAbsentMechanic: { status: 'unavailable', reason: 'mechanic-absent' },
      },
      accounting: { submissions: 3, rejections: 0, byActionId: {} },
      provenance: FIXTURE_PROVENANCE,
    });
    expect(record.metrics['toyAbsentMechanic']).toEqual({
      status: 'unavailable',
      reason: 'mechanic-absent',
    });
  });

  it('does not require metrics from a failed run, which produced none', () => {
    const record = buildRunRecord({
      task: task(),
      status: 'failed',
      ticksRun: 0,
      metrics: {},
      accounting: { submissions: 0, rejections: 0, byActionId: {} },
      provenance: FIXTURE_PROVENANCE,
      failure: { classification: 'threw', message: 'boom' },
    });
    expect(record.status).toBe('failed');
    expect(record.failure?.classification).toBe('threw');
  });

  it('refuses a record whose stored seed disagrees with its coordinates', () => {
    expect(() =>
      buildRunRecord({
        task: task({ runSeed: 1 }),
        status: 'stagnated',
        ticksRun: 1,
        metrics: {
          toyFinalWealth: { status: 'measured', value: 0 },
          toyTicks: { status: 'measured', value: 1 },
        },
        accounting: { submissions: 1, rejections: 0, byActionId: {} },
        provenance: FIXTURE_PROVENANCE,
      }),
    ).toThrow(/does not match its coordinates/);
  });
});

describe('the provenance block is checked, not trusted', () => {
  it('names every missing or malformed key', () => {
    expect(provenanceProblems(undefined)).toEqual(['provenance block is missing entirely.']);
    const broken = {
      buildVersion: '',
      contentHash: 'x',
      rngRegistryHash: 'y',
      observationSchemaVersion: 1.5,
      observationLayoutDigest: 'z',
      metricDefinitionVersions: { a: 'one' },
    } as unknown as Provenance;
    const problems = provenanceProblems(broken);
    expect(problems.some((p) => p.includes('buildVersion'))).toBe(true);
    expect(problems.some((p) => p.includes('observationSchemaVersion'))).toBe(true);
    expect(problems.some((p) => p.includes('metricDefinitionVersions.a'))).toBe(true);
  });

  it('accepts a complete block', () => {
    expect(provenanceProblems(FIXTURE_PROVENANCE)).toEqual([]);
  });

  it('refuses to dispatch a sweep whose provenance is incomplete', async () => {
    await expect(
      runSweep({
        spec: toySweep(),
        registries: TOY_REGISTRIES,
        execution: { mode: 'inline', execute: makeToyExecutor() },
        provenance: { ...FIXTURE_PROVENANCE, contentHash: '' },
      }),
    ).rejects.toThrow(/no run was dispatched/);
  });
});

describe('provenance mismatch within a sweep is a failure that names the runs', () => {
  it('names the differing run by cell and replicate', () => {
    const good = syntheticRecord({
      cellIndex: 0,
      replicateIndex: 0,
      metrics: { toyTicks: { status: 'measured', value: 1 } },
    });
    const drifted: RunRecord = {
      ...syntheticRecord({
        cellIndex: 1,
        replicateIndex: 3,
        metrics: { toyTicks: { status: 'measured', value: 1 } },
      }),
      provenance: { ...FIXTURE_PROVENANCE, contentHash: 'other-content' },
    };
    const problems = provenanceDisagreements([good, drifted]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('cell 1');
    expect(problems[0]).toContain('replicate 3');

    // The control: agreeing records report nothing.
    expect(provenanceDisagreements([good, good])).toEqual([]);
  });
});

describe('the summary separates the performance section', () => {
  it('drops only the performance section and keeps everything else', () => {
    const summary = {
      recordFormatVersion: 1,
      sweepId: 's',
      kind: 'gate',
      rootSeed: 1,
      configurationHash: 'h',
      cellCount: 1,
      runCount: 1,
      countsByStatus: { stagnated: 1 },
      countsByTerminalReason: { stagnation: 1 },
      failureCount: 0,
      failuresByClass: {},
      failureThreshold: 0,
      disqualified: false,
      aggregates: [],
      provenance: FIXTURE_PROVENANCE,
      performance: {
        wallClockMs: 12.5,
        runsPerSecond: 80,
        worldTicksPerSecond: 900,
        workerCount: 8,
        totalWorldTicks: 11,
      },
    };
    const stripped = reproducibleSummary(summary);
    expect('performance' in stripped).toBe(false);
    expect(canonicalJson(stripped)).toContain('"configurationHash":"h"');
    expect(canonicalJson(stripped)).not.toContain('wallClockMs');
  });
});
