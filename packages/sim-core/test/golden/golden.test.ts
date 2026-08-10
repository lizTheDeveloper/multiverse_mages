/*
 * Multiverse Mages — the golden replay verification suite.
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

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { replayAndLocate } from '../../src/replay/replayer.js';
import type { GoldenFixture } from './fixture-format.js';
import { parseFixture, recordingOf } from './fixture-format.js';
import { worldById } from './worlds.js';

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/', import.meta.url));

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
function fixtureFiles(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

function readFixture(file: string): GoldenFixture {
  return parseFixture(readFileSync(join(FIXTURES_DIR, file), 'utf8'), file);
}

/** Replays one fixture and throws a message naming the fixture and the tick. */
function verifyFixture(file: string): void {
  const fixture = readFixture(file);
  const result = replayAndLocate(recordingOf(fixture), worldById(fixture.worldId));

  const detail = result.diverged
    ? [
        `Golden fixture "${file}" no longer reproduces.`,
        `  covers: ${fixture.description}`,
        `  world:  ${fixture.worldId}, root seed ${fixture.rootSeed}, ${fixture.tickCount} ticks`,
        `  diverging tick: ${result.tick === null ? '(not located)' : String(result.tick)}`,
        `  ${result.reason ?? ''}`,
        '',
        'If this behaviour change was intended, run `npm run goldens:regen` and review the diff.',
        'A regenerated fixture is a claim that behaviour changed on purpose.',
      ].join('\n')
    : '';

  expect(result.diverged, detail).toBe(false);
}

const files = fixtureFiles();

describe('the golden fixture directory', () => {
  it('is not empty', () => {
    // A harness that verifies nothing passes every check ever written for it.
    // This is the assertion that makes an empty directory loud.
    expect(files.length).toBeGreaterThan(0);
  });

  it('still covers world time, an engagement transition, and entity churn', () => {
    // Not the discovery mechanism — that is `fixtureFiles`. This is the floor:
    // the three shapes `sim-core-foundation` task 8.4 requires must exist, so
    // that deleting one is a failing test rather than a quiet loss of coverage.
    expect(files).toEqual(
      expect.arrayContaining([
        'world-time-only.json',
        'engagement-transition.json',
        'entity-churn.json',
      ]),
    );
  });

  it('names each fixture after its file', () => {
    for (const file of files) {
      expect(readFixture(file).name, file).toBe(file.slice(0, -'.json'.length));
    }
  });
});

describe.each(files)('golden fixture %s', (file) => {
  it('replays to the recorded hashes, tick for tick', () => {
    verifyFixture(file);
  });
});

describe('regeneration is a separate command', () => {
  /**
   * The determinism gate is only worth anything if a failing fixture *stays*
   * failing. A suite that rewrote fixtures on mismatch would turn every
   * behaviour change into a silent pass, and the first anyone would hear of a
   * desync is a player reporting one.
   *
   * Checked by bytes rather than by reading the code, because the property that
   * matters is what happens to the files, not which functions were called.
   *
   * Divergence is swallowed rather than propagated, and that is the whole point
   * of the test rather than a shortcut. The spec requires the files to be
   * unchanged *while a fixture is failing* — which is precisely the run a
   * regenerate-on-failure repair would fire on. Letting the throw escape would
   * skip the byte comparison in the only case that can catch that, and would
   * leave this test re-reporting a divergence the per-fixture tests already
   * reported instead of answering its own question.
   */
  it('leaves every fixture file byte-identical after the suite has run them', () => {
    const before = new Map(files.map((file) => [file, readFileSync(join(FIXTURES_DIR, file))]));

    for (const file of files) {
      try {
        verifyFixture(file);
      } catch {
        // Reporting the divergence belongs to the tests above. This one asks
        // only whether replaying — passing or failing — wrote anything.
      }
    }

    expect(fixtureFiles(), 'the suite added or removed a fixture file').toEqual(files);
    for (const file of files) {
      const after = readFileSync(join(FIXTURES_DIR, file));
      expect(after.equals(before.get(file) as Uint8Array), `${file} was rewritten`).toBe(true);
    }
  });
});
