/*
 * Multiverse Mages — append-only result storage.
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
 * Task 4.7.
 *
 * ## Append-only, and what that has to mean mechanically
 *
 * "A sweep re-executed with the same output directory writes to a new file
 * rather than modifying an existing one, or exits non-zero." Both halves are
 * offered, because they answer different needs: a sweep run repeatedly on a
 * schedule wants `new-file`, and a release gate that must not quietly produce a
 * second answer wants `refuse`.
 *
 * The enforcement is the `wx` open flag — create, and fail if it exists —
 * rather than a `existsSync` check followed by a write. The check-then-write
 * version is a race, and the race it loses is two sweeps started a second apart
 * on a build machine, one of which silently truncates the other's results. `wx`
 * makes the operating system arbitrate.
 *
 * Once created, the handle is only ever appended to. Nothing in this module can
 * seek, rewrite a line, or reopen a file for writing.
 *
 * ## Why the run number is in the filename
 *
 * `<sweepId>.<n>.runs.ndjson`. A timestamp would be the obvious choice and it is
 * the wrong one twice over: it makes the filename a function of wall-clock time
 * in a package whose entire product is freedom from wall-clock time, and it
 * sorts wrongly the moment anyone crosses a timezone. A monotone integer sorts
 * correctly forever and says exactly what it means — this is the *n*th execution
 * of this sweep in this directory.
 */

import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, writeSync } from 'node:fs';
import { join } from 'node:path';

import type { RunRecord, SweepSummary } from './records.js';
import { decodeRecord, encodeRecord, encodeSummary } from './records.js';

/** What to do when this sweep has already been executed into this directory. */
export const OUTPUT_MODE = {
  /** Take the next unused execution number. */
  newFile: 'new-file',
  /** Refuse, so the caller exits non-zero. */
  refuse: 'refuse',
} as const;

/** Any mode from {@link OUTPUT_MODE}. */
export type OutputMode = (typeof OUTPUT_MODE)[keyof typeof OUTPUT_MODE];

/** An open, append-only pair of files for one sweep execution. */
export interface SweepOutput {
  readonly runsPath: string;
  readonly summaryPath: string;
  /** Which execution of this sweep in this directory this is, from 0. */
  readonly executionIndex: number;
  appendRecord(record: RunRecord): void;
  writeSummary(summary: SweepSummary): void;
  close(): void;
}

const RUNS_SUFFIX = '.runs.ndjson';
const SUMMARY_SUFFIX = '.summary.json';

function runsFileName(sweepId: string, executionIndex: number): string {
  return `${sweepId}.${String(executionIndex)}${RUNS_SUFFIX}`;
}

function summaryFileName(sweepId: string, executionIndex: number): string {
  return `${sweepId}.${String(executionIndex)}${SUMMARY_SUFFIX}`;
}

/** Execution indices already present in `directory` for `sweepId`, ascending. */
export function existingExecutions(directory: string, sweepId: string): number[] {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return [];
  }
  const prefix = `${sweepId}.`;
  const found: number[] = [];
  for (const entry of entries) {
    if (!entry.startsWith(prefix) || !entry.endsWith(RUNS_SUFFIX)) continue;
    const middle = entry.slice(prefix.length, entry.length - RUNS_SUFFIX.length);
    if (!/^\d+$/.test(middle)) continue;
    found.push(Number.parseInt(middle, 10));
  }
  return found.sort((a, b) => a - b);
}

/**
 * Opens the output files for one sweep execution.
 *
 * @throws Error when `mode` is `refuse` and this sweep already has results in
 * `directory`, or when the exclusive create loses to a concurrent writer.
 */
export function openSweepOutput(options: {
  readonly directory: string;
  readonly sweepId: string;
  readonly mode: OutputMode;
}): SweepOutput {
  const { directory, sweepId, mode } = options;
  mkdirSync(directory, { recursive: true });

  const existing = existingExecutions(directory, sweepId);
  if (mode === OUTPUT_MODE.refuse && existing.length > 0) {
    throw new Error(
      `Sweep ${sweepId} already has results in ${directory} (executions ${existing.join(', ')}) ` +
        'and the output mode is "refuse". Results are append-only: nothing here rewrites a ' +
        'previous execution. Point at a different directory, delete the old results ' +
        'deliberately, or use the "new-file" mode.',
    );
  }

  const executionIndex = existing.length === 0 ? 0 : (existing[existing.length - 1] as number) + 1;
  const runsPath = join(directory, runsFileName(sweepId, executionIndex));
  const summaryPath = join(directory, summaryFileName(sweepId, executionIndex));

  // 'wx' — create, and fail if it already exists. Never 'w', which truncates.
  const handle = openSync(runsPath, 'wx');
  let closed = false;

  return {
    runsPath,
    summaryPath,
    executionIndex,
    appendRecord(record: RunRecord): void {
      if (closed) throw new Error(`Results file ${runsPath} is closed.`);
      writeSync(handle, `${encodeRecord(record)}\n`);
    },
    writeSummary(summary: SweepSummary): void {
      const summaryHandle = openSync(summaryPath, 'wx');
      try {
        writeSync(summaryHandle, `${encodeSummary(summary)}\n`);
      } finally {
        closeSync(summaryHandle);
      }
    },
    close(): void {
      if (closed) return;
      closed = true;
      closeSync(handle);
    },
  };
}

/**
 * Reads a results file back.
 *
 * Blank lines are skipped so that a file ending in a newline — which every file
 * this module writes does — reads back as exactly the records it contains.
 */
export function readRunRecords(path: string): RunRecord[] {
  const text = readFileSync(path, 'utf8');
  const records: RunRecord[] = [];
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue;
    records.push(decodeRecord(line));
  }
  return records;
}

/** Reads a summary file back. */
export function readSweepSummary(path: string): SweepSummary {
  return JSON.parse(readFileSync(path, 'utf8')) as SweepSummary;
}
