/*
 * Multiverse Mages — the golden replay harness, extracted so its own safety
 * properties can be tested rather than merely trusted.
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
 * ## Why this is a module and not a hundred lines inside `golden.test.ts`
 *
 * The harness's *safety* properties — the failure message names the fixture and
 * the tick, and a failing run rewrites nothing — are properties of the failing
 * path. In a green repository nothing ever fails, so a harness that inlines its
 * own logic can only ever check those properties on the path they are not
 * about. Task 9.5's coverage audit found exactly that: the message builder ran
 * only when there was nothing to report, and the immutability test ran only
 * where nothing was tempted to write.
 *
 * Pulling the logic out here makes the failing path reachable. Two seams do all
 * the work, and both default to exactly what the committed suite does:
 *
 * - **`fixturesDir`** lets a test copy the real fixtures somewhere temporary,
 *   damage one, and watch what the harness does — without the committed
 *   fixtures ever being at risk.
 * - **`resolveWorld`** lets a test replay a genuine fixture against a world
 *   whose rules deliberately change at a known tick, which is the only
 *   executable form of "a change introduced nondeterminism".
 *
 * Neither seam is used by the committed suite. `golden.test.ts` calls these
 * functions with no options at all, so the default behaviour is the behaviour,
 * and a bug in the seams cannot make the real gate pass.
 */

import { copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect } from 'vitest';

import type { DivergenceResult } from '../../src/replay/replayer.js';
import { replayAndLocate } from '../../src/replay/replayer.js';
import type { WorldSchema } from '../../src/state.js';
import type { GoldenFixture } from './fixture-format.js';
import { parseFixture, recordingOf } from './fixture-format.js';
import { worldById } from './worlds.js';

/** The committed fixtures. The only directory the real suite ever reads. */
export const DEFAULT_FIXTURES_DIR = fileURLToPath(new URL('./fixtures/', import.meta.url));

export interface HarnessOptions {
  /** Defaults to {@link DEFAULT_FIXTURES_DIR}. */
  readonly fixturesDir?: string;
  /** Defaults to the registry in `worlds.ts`. */
  readonly resolveWorld?: (worldId: string) => WorldSchema;
}

/**
 * Every fixture on disk, discovered rather than listed.
 *
 * A hardcoded list is worse than no harness at all: a fixture dropped from the
 * list keeps sitting in the repository looking like coverage while silently
 * verifying nothing, and nobody notices until a desync ships. Reading the
 * directory means the only way to stop running a fixture is to delete it, which
 * shows up in review as a deletion.
 *
 * Sorted so that failure output is in the same order on every machine.
 */
export function fixtureFiles(fixturesDir: string = DEFAULT_FIXTURES_DIR): string[] {
  return readdirSync(fixturesDir)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

export function readFixture(
  file: string,
  fixturesDir: string = DEFAULT_FIXTURES_DIR,
): GoldenFixture {
  return parseFixture(readFileSync(join(fixturesDir, file), 'utf8'), file);
}

/**
 * The message a failing fixture prints.
 *
 * Exported, and tested directly, because this string *is* the harness's output.
 * Everything else the gate does is a boolean; this is the only part that tells
 * a future engineer which fixture broke and where — the two facts that decide
 * whether the next hour is spent reading one tick's worth of rules or bisecting
 * a whole run by hand. An untested failure message is a failure message that
 * can rot into "expected true to be false" without a single test going red,
 * and it would rot on the one run where nobody can afford it.
 *
 * Only ever called with a diverged result; the caller decides that.
 */
export function describeDivergence(
  file: string,
  fixture: GoldenFixture,
  result: DivergenceResult,
): string {
  return [
    `Golden fixture "${file}" no longer reproduces.`,
    `  covers: ${fixture.description}`,
    `  world:  ${fixture.worldId}, root seed ${fixture.rootSeed}, ${fixture.tickCount} ticks`,
    `  diverging tick: ${result.tick === null ? '(not located)' : String(result.tick)}`,
    `  ${result.reason ?? ''}`,
    '',
    'If this behaviour change was intended, run `npm run goldens:regen` and review the diff.',
    'A regenerated fixture is a claim that behaviour changed on purpose.',
  ].join('\n');
}

export interface FixtureCheck {
  readonly fixture: GoldenFixture;
  readonly result: DivergenceResult;
  /** The rendered failure message, or `''` when the fixture reproduced. */
  readonly detail: string;
}

/**
 * Replays one fixture and renders the verdict, without asserting anything.
 *
 * Separated from {@link verifyFixture} so a test can inspect the message the
 * harness *would* print. Assertion and reporting are different jobs, and the
 * reporting half is the half nothing was checking.
 */
export function checkFixture(file: string, options: HarnessOptions = {}): FixtureCheck {
  const fixture = readFixture(file, options.fixturesDir ?? DEFAULT_FIXTURES_DIR);
  const resolve = options.resolveWorld ?? worldById;
  const result = replayAndLocate(recordingOf(fixture), resolve(fixture.worldId));
  return { fixture, result, detail: result.diverged ? describeDivergence(file, fixture, result) : '' };
}

/** Replays one fixture and fails, naming the fixture and the tick, if it diverged. */
export function verifyFixture(file: string, options: HarnessOptions = {}): void {
  const { result, detail } = checkFixture(file, options);
  expect(result.diverged, detail).toBe(false);
}

/**
 * Copies every fixture file into `destination` and returns their names.
 *
 * The one operation that makes the failing path safe to test. Tests damage
 * copies; the committed fixtures are read and never written, because a suite
 * that could write them is a suite that could repair away the very regression
 * the goldens exist to catch.
 */
export function copyFixturesInto(
  destination: string,
  fixturesDir: string = DEFAULT_FIXTURES_DIR,
): string[] {
  const files = fixtureFiles(fixturesDir);
  for (const file of files) {
    copyFileSync(join(fixturesDir, file), join(destination, file));
  }
  return files;
}

/** Reads every `*.json` in a directory as raw bytes, keyed by filename. */
export function snapshotDirectoryBytes(directory: string): Map<string, Buffer> {
  return new Map(
    fixtureFiles(directory).map((file) => [file, readFileSync(join(directory, file))]),
  );
}
