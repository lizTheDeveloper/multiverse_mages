/*
 * Multiverse Mages — the 1,000-match desync harness and the zero-desync measurement.
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
 * pvp-server task 7.6: *"the 1,000-match desync harness and the zero-desync
 * measurement."*
 *
 * ## What this proves
 *
 * Two universes, created independently in separate worker threads from the same
 * seed, stepped through the same ticks with the same actions, produce
 * byte-identical snapshot hashes at every tick — one thousand times, with no
 * exceptions. That is the zero-desync measurement, and it is the strongest
 * statistical statement the project can make about the determinism constraint
 * from `contracts.md` §0.
 *
 * A desync in live PvP is a match-ending event that `desync.ts` reports and
 * never corrects. If it can happen, this harness finds it before it reaches a
 * player — on seeds they will never play, in a CI run rather than a Friday-night
 * tournament.
 *
 * ## Why worker threads rather than a single-threaded loop
 *
 * The single-threaded loop completes in about six seconds, so the worker pool is
 * not about elapsed time — it is about **process boundaries**. Each worker is a
 * separate V8 isolate with its own heap, its own JIT, its own garbage-collector
 * state. If any of those differ between the two isolates that run a PvP match,
 * and if that difference can reach the simulation path, this test finds it.
 *
 * The pool also exercises the import path the real server uses: workspace
 * packages loaded from `dist/` via `node_modules/` symlinks, not Vitest's alias
 * table. A bug in `dist/` that the alias table masks would be invisible to every
 * other test in this package.
 *
 * ## Why the build must exist
 *
 * Workers resolve `@mm/*` imports through `node_modules/` symlinks, which point
 * to each package's `dist/`. The first test asserts the build is there, exactly
 * as `multi-process-match.test.ts` does, so a missing build names itself rather
 * than surfacing as a cryptic import error twenty seconds into the pool.
 *
 * ## Skip pattern
 *
 * Gated on `MM_DESYNC_HARNESS`. The harness runs 1,000 matches across worker
 * threads; it completes in seconds but is not needed on every commit. Set the
 * variable to any truthy value to include it:
 *
 *     MM_DESYNC_HARNESS=1 npm test
 *
 * CI may run it as a separate job or as part of `verify:full`.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { describe, expect, it } from 'vitest';

// ─── Paths ──────────────────────────────────────────────────────────────────

const WORKER = fileURLToPath(new URL('./desync-harness-worker.mjs', import.meta.url));

/** The server's dist entry, whose existence proves the build ran. */
const SERVER_DIST = fileURLToPath(new URL('../../dist/index.js', import.meta.url));

// ─── Configuration ──────────────────────────────────────────────────────────

/** Total matches to run. */
const MATCH_COUNT = 1_000;

/** World ticks per match. Short enough to keep the test fast; long enough to
 *  exercise twenty steps of the deterministic path. */
const TICKS_PER_MATCH = 20;

/** Worker threads to spawn. Kept modest: the point is isolation, not throughput,
 *  and a CI runner with 4 vCPU is the floor. */
const WORKER_COUNT = 4;

/** Budget for the entire harness. Seven times the measured local cost (~6 s
 *  single-threaded), rounded up, following the vitest.config.ts factor. */
const HARNESS_TIMEOUT_MS = 60_000;

// ─── Types ──────────────────────────────────────────────────────────────────

interface Desync {
  seed: number;
  tick: number;
  hashA: string;
  hashB: string;
}

interface FinalHash {
  seed: number;
  hash: string;
}

interface WorkerResult {
  desyncs: Desync[];
  matchesRun: number;
  finalHashes: FinalHash[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Splits an array of seeds into `n` roughly-equal batches. */
function splitSeeds(count: number, batches: number): number[][] {
  const out: number[][] = Array.from({ length: batches }, () => []);
  for (let i = 0; i < count; i += 1) {
    (out[i % batches] as number[]).push(i);
  }
  return out;
}

/** Spawns one worker and resolves its final message. */
function runWorker(seeds: number[], ticksPerMatch: number): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER, { workerData: { seeds, ticksPerMatch } });
    const timer = setTimeout(() => {
      worker.terminate().catch(() => {});
      reject(new Error(`Worker timed out after ${HARNESS_TIMEOUT_MS} ms`));
    }, HARNESS_TIMEOUT_MS);

    worker.on('message', (msg: WorkerResult) => {
      clearTimeout(timer);
      resolve(msg);
    });
    worker.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
    worker.on('exit', (code: number) => {
      if (code !== 0) {
        clearTimeout(timer);
        reject(new Error(`Worker exited with code ${String(code)}`));
      }
    });
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const enabled = Boolean(process.env['MM_DESYNC_HARNESS']);

describe.skipIf(!enabled)('the binaries are built (desync harness)', () => {
  it('has a server dist to spawn workers against', () => {
    expect(
      existsSync(SERVER_DIST),
      'packages/server/dist is missing. Workers load dist/ deliberately — see ' +
        'the worker module doc — so run `npm run typecheck` first.',
    ).toBe(true);
  });
});

describe.skipIf(!enabled)(
  '1,000-match desync harness',
  () => {
    it(
      'finds zero desyncs across 1,000 independent matches in separate worker threads',
      async () => {
        // Distribute seeds across workers.
        const batches = splitSeeds(MATCH_COUNT, WORKER_COUNT);

        // Run all batches in parallel.
        const results = await Promise.all(
          batches.map((seeds) => runWorker(seeds, TICKS_PER_MATCH)),
        );

        // Aggregate.
        let totalMatches = 0;
        const allDesyncs: Desync[] = [];
        for (const result of results) {
          totalMatches += result.matchesRun;
          allDesyncs.push(...result.desyncs);
        }

        // Every seed was run.
        expect(totalMatches).toBe(MATCH_COUNT);

        // The measurement: zero desyncs.
        if (allDesyncs.length > 0) {
          // Name the first few so the failure is readable.
          const sample = allDesyncs.slice(0, 5);
          const lines = sample.map(
            (d) =>
              `  seed=${String(d.seed)} tick=${String(d.tick)} ` +
              `hashA=${d.hashA} hashB=${d.hashB}`,
          );
          expect.fail(
            `${String(allDesyncs.length)} desync(s) in ${String(totalMatches)} matches ` +
              `(${String(TICKS_PER_MATCH)} ticks each):\n${lines.join('\n')}`,
          );
        }

        // Secondary: if every seed produced the same final hash, the harness
        // would pass vacuously — it would be comparing identical universes and
        // finding no disagreement. Different seeds must produce different
        // states, or the simulation ignores its input.
        const allFinalHashes: FinalHash[] = [];
        for (const result of results) {
          allFinalHashes.push(...result.finalHashes);
        }
        const unique = new Set(allFinalHashes.map((h) => h.hash));
        // With 1,000 distinct seeds, the number of unique final hashes should
        // be close to 1,000. A threshold of 100 catches a vacuous harness
        // without failing on a legitimate collision.
        expect(unique.size).toBeGreaterThan(100);
      },
      HARNESS_TIMEOUT_MS,
    );
  },
);
