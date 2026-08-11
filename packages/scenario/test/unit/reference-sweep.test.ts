/*
 * Multiverse Mages — the Monte Carlo harness, pointed at real universes.
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
 * The claim this file makes: **the harness runs the game.** Forty-eight real
 * universes — shipped content, `coordination`'s world loop, `agent-api`'s
 * session — are dispatched across real worker threads, recorded, aggregated,
 * written to disk, and reproduced one at a time from four numbers.
 *
 * Three properties, each of which a Monte Carlo instrument is worthless
 * without, and each of which the harness previously demonstrated only over a
 * toy world that says of itself *"it is **not** a universe"*:
 *
 * 1. Two executions of the same sweep are byte-identical.
 * 2. Worker count does not change results — one worker and four agree.
 * 3. A single run reproduces alone, in this thread, from its own coordinates.
 *
 * ## The sweeps are executed once and asserted many times
 *
 * A forty-eight-universe sweep is seconds of real simulation, and running one
 * per `it` would spend minutes proving the same three sweeps behave. They are
 * executed once, lazily, and each assertion reads the results — which also means
 * the byte-identity claim is made against sweeps that ran in different processes
 * at different times rather than against two calls in one expression.
 */

import { rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RunRecord, SweepResult } from '@mm/mc-harness';
import {
  OUTPUT_MODE,
  compareToRecord,
  encodeRecord,
  readRunRecords,
  reaggregate,
  reproduceRun,
  reproducibleSummary,
  runSweep,
} from '@mm/mc-harness';
import {
  REFERENCE_REGISTRIES,
  REFERENCE_SWEEP,
  makeReferenceExecutor,
  referenceContent,
  referenceProvenance,
} from '@mm/scenario';
import { afterAll, describe, expect, it } from 'vitest';

/** The worker entry point the pool spawns. Runs against source; see the fixture. */
const WORKER_URL = new URL('../fixtures/sweep-worker.mjs', import.meta.url);

/** Generous: a worker boots Node, resolves the workspace, and loads 300 nodes. */
const SWEEP_TIMEOUT_MS = 300_000;

const content = referenceContent();
const provenance = referenceProvenance(content);

const outputDirectory = mkdtempSync(join(tmpdir(), 'mm-reference-sweep-'));
afterAll(() => {
  rmSync(outputDirectory, { recursive: true, force: true });
});

/** Records as bytes, which is the comparison the reproducibility claim makes. */
function bytes(records: readonly RunRecord[]): string[] {
  return records.map((record) => encodeRecord(record));
}

/** Runs the committed sweep on `workerCount` workers. */
async function sweepOn(workerCount: number, write = false): Promise<SweepResult> {
  return await runSweep({
    spec: REFERENCE_SWEEP,
    registries: REFERENCE_REGISTRIES,
    execution: { mode: 'workers', workerUrl: WORKER_URL, workerCount },
    provenance,
    ...(write ? { output: { directory: outputDirectory, mode: OUTPUT_MODE.newFile } } : {}),
    // Pinned so the summary's performance section cannot make two executions
    // differ. Task 4.9 excludes it from the comparison anyway; this makes the
    // whole summary comparable, which is a stronger statement.
    now: () => 0,
  });
}

let firstOnFour: Promise<SweepResult> | undefined;
let secondOnFour: Promise<SweepResult> | undefined;
let onOne: Promise<SweepResult> | undefined;

const executions = {
  firstOnFour: () => (firstOnFour ??= sweepOn(4, true)),
  secondOnFour: () => (secondOnFour ??= sweepOn(4)),
  onOne: () => (onOne ??= sweepOn(1)),
};

describe('the harness runs a sweep of real universes', () => {
  it(
    'dispatches every run, records every one, and fails none',
    async () => {
      const result = await executions.firstOnFour();

      expect(result.plan.cellCount).toBe(4);
      expect(result.plan.runCount).toBe(48);
      expect(result.records).toHaveLength(48);
      expect(result.summary.failureCount).toBe(0);
      expect(result.summary.disqualified).toBe(false);

      // Every run reached the cap rather than resolving: at this build nothing
      // ends a universe. `ascended` and `stagnated` need `god-agency`'s terminal
      // conditions, so a truncated sweep is the honest outcome and not a defect.
      expect(result.summary.countsByStatus).toEqual({ truncated: 48 });
      for (const record of result.records) {
        expect(record.ticksRun).toBe(REFERENCE_SWEEP.termination.worldTickCap);
      }

      // One record per derived seed, no duplicates and no omissions.
      expect(new Set(result.records.map((record) => record.runSeed)).size).toBe(48);
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    'measures a universe that moved, in every cell',
    async () => {
      const result = await executions.firstOnFour();
      const aggregate = (metricId: string) => {
        const found = result.summary.aggregates.find((entry) => entry.metricId === metricId);
        if (found === undefined) throw new Error(`no aggregate for ${metricId}`);
        expect(found.sampleCount).toBe(48);
        return found.value ?? 0;
      };

      // Printed so the sweep is readable as an experiment rather than as a
      // pass. These are vital signs, not balance numbers — see `measures.ts`.
      for (const entry of result.summary.aggregates) {
        console.log(
          `${entry.metricId.padEnd(28)} ${entry.aggregation.padEnd(5)} ` +
            `${String(entry.value)} ${entry.unit}`,
        );
      }

      expect(aggregate('referenceNodesGained')).toBeGreaterThan(0);
      expect(aggregate('referenceLivingMages')).toBeGreaterThan(0);
      expect(aggregate('referenceKnowledgeInstances')).toBeGreaterThan(0);
      expect(aggregate('referencePeakPopulation')).toBeGreaterThan(0);
    },
    SWEEP_TIMEOUT_MS,
  );
});

describe('two executions of the same sweep are the same sweep', () => {
  it(
    'produces byte-identical records and an identical summary',
    async () => {
      const first = await executions.firstOnFour();
      const second = await executions.secondOnFour();

      expect(bytes(second.records)).toEqual(bytes(first.records));
      expect(reproducibleSummary(second.summary)).toEqual(reproducibleSummary(first.summary));
    },
    SWEEP_TIMEOUT_MS,
  );
});

describe('worker count is a scheduling decision and nothing else', () => {
  it(
    'produces identical records and aggregates on 1 worker and on 4',
    async () => {
      const many = await executions.firstOnFour();
      const single = await executions.onOne();

      expect(bytes(single.records)).toEqual(bytes(many.records));
      expect(single.summary.aggregates).toEqual(many.summary.aggregates);
      expect(single.summary.countsByStatus).toEqual(many.summary.countsByStatus);
    },
    SWEEP_TIMEOUT_MS,
  );
});

describe('one run out of forty-eight reproduces alone', () => {
  it(
    'rebuilds a stored record from its coordinates, in this thread, byte for byte',
    async () => {
      const sweep = await executions.firstOnFour();
      expect(sweep.runsPath).toBeDefined();
      const stored = readRunRecords(sweep.runsPath as string);
      expect(stored).toHaveLength(48);

      // A cell in the middle and a replicate that is not the first, so that a
      // reproduction which quietly rebuilt run zero would fail rather than pass.
      const select = { cellIndex: 2, replicateIndex: 7 };
      const target = stored.find(
        (record) =>
          record.coordinates.cellIndex === select.cellIndex &&
          record.coordinates.replicateIndex === select.replicateIndex,
      );
      expect(target).toBeDefined();

      const reproduction = await reproduceRun({
        spec: REFERENCE_SWEEP,
        registries: REFERENCE_REGISTRIES,
        select,
        // Inline and single-threaded: the reproduction path shares nothing with
        // the pool that produced the record it is being compared against.
        execute: makeReferenceExecutor({ content }),
        provenance,
      });

      expect(compareToRecord(reproduction.record, target as RunRecord)).toEqual([]);
      expect(encodeRecord(reproduction.record)).toBe(encodeRecord(target as RunRecord));
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    're-aggregates the stored file into the aggregates the sweep reported',
    async () => {
      const sweep = await executions.firstOnFour();
      const stored = readRunRecords(sweep.runsPath as string);
      const offline = reaggregate(stored, REFERENCE_SWEEP, REFERENCE_REGISTRIES);
      expect(offline.aggregates).toEqual(sweep.summary.aggregates);
      expect(offline.countsByStatus).toEqual(sweep.summary.countsByStatus);
    },
    SWEEP_TIMEOUT_MS,
  );
});
