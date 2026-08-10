/*
 * Multiverse Mages — the golden fixture regeneration command.
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

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Recorder, createState, rngFromRootSeed } from '@mm/sim-core';

import type { GoldenFixture } from './fixture.ts';
import { FIXTURE_DIR, FIXTURE_FORMAT_VERSION, fixtureToText, toBase64 } from './fixture.ts';
import { SCENARIOS } from './scenarios.ts';
import { worldNamed } from './worlds.ts';

/**
 * ## Why this is a command and not a flag
 *
 * `deterministic-replay` requires that regenerating a golden fixture take an
 * explicit, separate command and never happen as a side effect of running
 * tests. This file is that command, and the enforcement is structural rather
 * than conditional: nothing in the Vitest suite imports it, and Vitest's
 * `include` globs only collect `*.test.ts`, so there is no environment variable
 * or `--update` flag that could reach it. A harness with an update flag is a
 * harness where a failing determinism check is one keystroke from being
 * rewritten into a passing one, usually at the end of a long afternoon.
 *
 * Run it deliberately:
 *
 * ```sh
 * npm run golden:regen --workspace @mm/sim-core
 * ```
 *
 * and read the diff. A regenerated fixture is a claim that behaviour changed on
 * purpose. If you cannot say which change moved the hash, the honest conclusion
 * is that something is nondeterministic, not that the fixture was stale.
 *
 * ## Why it runs against `dist`
 *
 * The command imports `@mm/sim-core` by name, which resolves to the package's
 * built output — so `npm run golden:regen` builds first. That is deliberate: a
 * fixture is a claim about what the shipped core does, and generating one from
 * a source tree the build has never seen would let a fixture encode behaviour
 * that never survives compilation. The test suite, by contrast, runs against
 * source through Vitest's alias, so the two agree only when the build is honest.
 */
function regenerate(): void {
  mkdirSync(FIXTURE_DIR, { recursive: true });

  for (const scenario of SCENARIOS) {
    const schema = worldNamed(scenario.world);
    const initial = createState({
      rootSeed: scenario.rootSeed,
      schema,
      contentRevision: scenario.contentRevision,
    });

    // `traceHashes` is on because the fixture carries a hash per tick, which is
    // what lets a failure name the diverging tick rather than only the run.
    const recorder = new Recorder(initial, { traceHashes: true });
    for (const actions of scenario.script()) {
      recorder.step(actions, rngFromRootSeed(scenario.rootSeed));
    }

    const recording = recorder.recording;
    const tickHashes = recording.tickHashes;
    if (tickHashes === undefined) {
      throw new Error(
        `Scenario "${scenario.name}" recorded no per-tick hashes, so its fixture could not name a ` +
          'diverging tick. The recorder was asked for them; this is a bug in the recorder.',
      );
    }

    const fixture: GoldenFixture = {
      formatVersion: FIXTURE_FORMAT_VERSION,
      name: scenario.name,
      description: scenario.description,
      world: scenario.world,
      rootSeed: scenario.rootSeed,
      tickCount: recording.tickCount,
      initialSnapshot: toBase64(recording.initialSnapshot),
      actionLog: recording.actionLog.toJSON(),
      expectedFinalHash: recording.finalHash,
      tickHashes: [...tickHashes],
    };

    const target = join(FIXTURE_DIR, scenario.fileName);
    writeFileSync(target, fixtureToText(fixture), 'utf8');
    process.stdout.write(
      `regenerated ${scenario.fileName}: ${String(fixture.tickCount)} ticks, final hash ${fixture.expectedFinalHash}\n`,
    );
  }

  process.stdout.write(
    `\n${String(SCENARIOS.length)} fixture(s) written to ${FIXTURE_DIR}\n` +
      'Review the diff before committing: a changed hash is a claim that behaviour changed on purpose.\n',
  );
}

regenerate();
