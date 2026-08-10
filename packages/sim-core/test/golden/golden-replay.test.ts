/*
 * Multiverse Mages — the golden replay suite.
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

import { describe, expect, it } from 'vitest';

import { TIME_MODE, replay, replayAndLocate, snapshotHash } from '@mm/sim-core';

import { FIXTURE_DIR, loadFixtures, toRecording } from './fixture.ts';
import { GOLDEN_ACTION } from './worlds.ts';

/**
 * ## What this suite is for
 *
 * A recorded run must reproduce a byte-identical final snapshot hash. Every
 * committed fixture runs here, on every `npm test`, so any nondeterminism a
 * future change introduces fails in the change that introduced it — which is
 * the only time it is cheap to fix.
 *
 * Two properties of the harness matter as much as the assertions:
 *
 * 1. **It is directory-driven.** `loadFixtures` reads whatever is in
 *    `fixtures/`, so "every committed fixture is executed" is literally true
 *    and dropping one in needs no edit here.
 * 2. **It never writes.** There is no update flag and no import of
 *    `regenerate.ts`. A failing fixture stays failing until somebody runs the
 *    regeneration command on purpose and defends the diff.
 */

const loaded = loadFixtures();

/** Every action kind that appears anywhere in a fixture's log. */
function actionKinds(fixture: (typeof loaded)[number]['fixture']): Set<number> {
  const kinds = new Set<number>();
  for (const tick of fixture.actionLog.ticks) {
    for (const action of tick) {
      kinds.add(action.kind);
    }
  }
  return kinds;
}

/** The exact bytes of every fixture file, for proving the suite left them alone. */
function fixtureFilesOnDisk(): Map<string, string> {
  const contents = new Map<string, string>();
  for (const name of readdirSync(FIXTURE_DIR).sort()) {
    contents.set(name, readFileSync(join(FIXTURE_DIR, name), 'utf8'));
  }
  return contents;
}

describe('the golden suite verifies something', () => {
  it('found the committed fixtures', () => {
    expect(loaded.length).toBeGreaterThanOrEqual(3);
  });

  it('covers world time, an engagement transition, and heavy entity churn', () => {
    // Named rather than counted: three fixtures that all did the same thing
    // would satisfy a count and cover nothing.
    expect(loaded.map((entry) => entry.fixture.name).sort()).toEqual([
      'engagement-transition',
      'entity-churn',
      'world-time-only',
    ]);
  });
});

describe('every committed fixture reproduces its recorded hash', () => {
  for (const { fixture, fileName, schema } of loaded) {
    it(`reproduces ${fixture.name} (${fileName})`, () => {
      const result = replayAndLocate(toRecording(fixture), schema);

      if (result.diverged) {
        // Thrown rather than asserted so the failure headline carries both facts
        // the spec asks a golden failure to carry: which fixture, and where.
        throw new Error(
          `Golden fixture "${fixture.name}" (${fileName}) did not reproduce.\n` +
            (result.tick === null
              ? '  The diverging tick could not be identified.\n'
              : `  Earliest diverging tick: ${String(result.tick)}.\n`) +
            `  ${result.reason ?? 'No further detail.'}\n` +
            '  If this change was intentional, regenerate with ' +
            '`npm run golden:regen --workspace @mm/sim-core` and defend the diff.',
        );
      }

      expect(snapshotHash(result.state)).toBe(fixture.expectedFinalHash);
    });
  }
});

/**
 * These assertions are about what a fixture *covers*, not about whether it
 * reproduces, so they run through `replay` rather than `replayAndLocate`.
 * `replayAndLocate` stops at the first divergence and hands back the state it
 * stopped at — correct for locating a bug, and useless for asking what the run
 * exercised. Using it here would make one real regression cascade into a page
 * of unrelated failures about slot counts.
 */
describe('each fixture still exhibits the coverage it claims', () => {
  const byName = new Map(loaded.map((entry) => [entry.fixture.name, entry]));

  it('world-time-only never leaves world scale', () => {
    const entry = byName.get('world-time-only');
    expect(entry).toBeDefined();
    const kinds = actionKinds(entry!.fixture);
    // 65534 and 65535 are the core's clock transitions; naming the numbers
    // rather than importing them keeps this an assertion about the fixture's
    // bytes rather than about whatever the constants currently say.
    expect(kinds.has(65534)).toBe(false);
    expect(kinds.has(65535)).toBe(false);

    const state = replay(toRecording(entry!.fixture), entry!.schema);
    expect(state.clock.mode).toBe(TIME_MODE.world);
    expect(state.clock.worldTick).toBe(entry!.fixture.tickCount);
  });

  it('engagement-transition enters and leaves engagement, and freezes world time while there', () => {
    const entry = byName.get('engagement-transition');
    expect(entry).toBeDefined();
    const kinds = actionKinds(entry!.fixture);
    expect(kinds.has(65534)).toBe(true);
    expect(kinds.has(65535)).toBe(true);

    const state = replay(toRecording(entry!.fixture), entry!.schema);
    // World time advanced on fewer ticks than were stepped, because the
    // engagement ticks did not age the world.
    expect(state.clock.worldTick).toBeLessThan(entry!.fixture.tickCount);
    expect(state.clock.worldTick).toBeGreaterThan(0);
  });

  it('entity-churn recycles slots rather than only allocating them', () => {
    const entry = byName.get('entity-churn');
    expect(entry).toBeDefined();
    const kinds = actionKinds(entry!.fixture);
    expect(kinds.has(GOLDEN_ACTION.cull)).toBe(true);

    const state = replay(toRecording(entry!.fixture), entry!.schema);
    // More entities were created than slots exist: the difference is reuse.
    expect(state.entities.slotCount).toBeGreaterThan(16);
    expect(state.entities.liveCount).toBeLessThan(state.entities.slotCount);
    expect(state.entities.freeCount).toBeGreaterThan(0);
  });
});

describe('a failing fixture fails loudly and changes nothing', () => {
  it('reports the earliest diverging tick, not merely that it diverged', () => {
    const entry = loaded[0]!;
    const tampered = {
      ...entry.fixture,
      tickHashes: entry.fixture.tickHashes.map((hash, tick) =>
        tick >= 3 ? '0000000000000000' : hash,
      ),
    };

    const result = replayAndLocate(toRecording(tampered), entry.schema);
    expect(result.diverged).toBe(true);
    expect(result.tick).toBe(3);
    expect(result.reason).toContain('tick 3');
  });

  it('leaves every fixture file byte-identical while a fixture is failing', () => {
    const before = fixtureFilesOnDisk();

    const entry = loaded[0]!;
    const broken = { ...entry.fixture, expectedFinalHash: '0123456789abcdef', tickHashes: [] };
    const result = replayAndLocate(
      { ...toRecording(entry.fixture), finalHash: broken.expectedFinalHash, tickHashes: [] },
      entry.schema,
    );

    // The verdict is a failure — which is what makes the suite exit non-zero —
    // and the files are untouched, because nothing in this directory writes.
    expect(result.diverged).toBe(true);
    expect(fixtureFilesOnDisk()).toEqual(before);
  });
});
