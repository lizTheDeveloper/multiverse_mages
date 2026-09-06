/*
 * Multiverse Mages — golden raid replay fixture.
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
 * Task 10.1 — a committed fixture that records a deterministic raid outcome.
 *
 * The sim-core golden fixtures replay a step-by-step simulation and compare
 * per-tick hashes. A raid is a function of three things and nothing else —
 * `(attacker snapshot, host snapshot, raidSeed)` — so the equivalent here is
 * simpler: rebuild the raid from the fixture's parameters, run it, and compare
 * the outcome JSON byte-for-byte against the committed record.
 *
 * The fixture covers terrain generation, deployment (soldiers and detachments),
 * combat (direct-damage across 157 applications), the theft system
 * (`im-read-the-surface` carried by the raider), library objectives, and
 * resolution with an attacker victory. The seed (42) was chosen because it
 * produces the richest combination of those paths.
 *
 * ## Why this is not a test that regenerates itself
 *
 * CLAUDE.md's fourth constraint: *"Golden replay fixtures are regenerated only
 * by explicit command, never as a test side effect."* A fixture diff is a claim
 * that behaviour changed on purpose. The test reads the committed file and
 * compares; it never writes.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runRaid } from '@mm/rules-raid';

import { buildRaid } from './raid-fixture.js';

/** The directory holding committed raid fixtures. */
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/', import.meta.url));

/** Reads and parses a fixture file. */
interface RaidFixture {
  readonly formatVersion: number;
  readonly name: string;
  readonly description: string;
  readonly raidSeed: number;
  readonly raiderNodes: readonly string[];
  readonly hostNodes: readonly string[];
  readonly withSoldiers: boolean;
  readonly outcome: unknown;
}

function readFixture(file: string): RaidFixture {
  const text = readFileSync(join(FIXTURES_DIR, file), 'utf8');
  return JSON.parse(text) as RaidFixture;
}

function fixtureFiles(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

/** Rebuilds a raid from the fixture's parameters and returns the outcome JSON. */
function replayFixture(fixture: RaidFixture): string {
  const built = buildRaid({
    raiderNodes: [...fixture.raiderNodes],
    hostNodes: [...fixture.hostNodes],
    withSoldiers: fixture.withSoldiers,
    seed: fixture.raidSeed,
  });
  const outcome = runRaid(built.raid);
  return JSON.stringify(outcome);
}

describe('the golden raid fixture directory', () => {
  const files = fixtureFiles();

  it('is not empty', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('still contains the full-raid fixture', () => {
    expect(files).toContain('full-raid.json');
  });
});

describe.each(fixtureFiles())('golden raid fixture %s', (file) => {
  it('replays to a byte-identical outcome', () => {
    const fixture = readFixture(file);
    expect(fixture.formatVersion).toBe(1);

    const replayed = replayFixture(fixture);
    const committed = JSON.stringify(fixture.outcome);

    expect(
      replayed,
      `Golden raid fixture "${file}" no longer reproduces.\n` +
        `  ${fixture.description}\n` +
        `  seed: ${String(fixture.raidSeed)}\n\n` +
        'If this behaviour change was intended, regenerate the fixture and review the diff.\n' +
        'A regenerated fixture is a claim that behaviour changed on purpose.',
    ).toBe(committed);
  });

  it('produces a different result from a different seed, so the comparison is not vacuous', () => {
    const fixture = readFixture(file);
    const altered = buildRaid({
      raiderNodes: [...fixture.raiderNodes],
      hostNodes: [...fixture.hostNodes],
      withSoldiers: fixture.withSoldiers,
      seed: fixture.raidSeed + 1,
    });
    const different = JSON.stringify(runRaid(altered.raid));
    const committed = JSON.stringify(fixture.outcome);
    expect(different).not.toBe(committed);
  });
});

describe('regeneration is a separate command', () => {
  it('leaves every fixture file byte-identical after the suite has run', () => {
    const files = fixtureFiles();
    const before = new Map(
      files.map((file) => [file, readFileSync(join(FIXTURES_DIR, file))]),
    );

    for (const file of files) {
      try {
        const fixture = readFixture(file);
        replayFixture(fixture);
      } catch {
        // The per-fixture tests above report divergence. This one asks only
        // whether replaying — passing or failing — wrote anything.
      }
    }

    for (const file of files) {
      const after = readFileSync(join(FIXTURES_DIR, file));
      expect(after.equals(before.get(file) as Uint8Array), `${file} was rewritten`).toBe(true);
    }
  });
});
