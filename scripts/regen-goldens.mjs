#!/usr/bin/env node
/*
 * Multiverse Mages — deliberate regeneration of the golden replay fixtures.
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
 * Re-records every scenario in `packages/sim-core/test/golden/scenarios.ts` and
 * writes the result to `.../fixtures/*.json`.
 *
 * **This command is the whole point of the golden harness.** Regenerating a
 * fixture is a claim that the simulation's behaviour changed *on purpose*: the
 * committed hashes are the only record of what the rules used to do, and
 * overwriting them destroys the evidence that anything moved. So it is a
 * separate command a human types, never a test side effect and never an
 * automatic repair — a suite that regenerated on failure would report success
 * for every determinism regression it was built to catch.
 *
 * Reviewers should read a fixture diff as a behaviour diff and ask what changed
 * and why, exactly as they would read a diff to the rules themselves.
 *
 * This script is tooling, not simulation code: it may use Node built-ins.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Lets Node's native type stripping load the core's TypeScript directly.
 *
 * The core's sources import each other as `./thing.js`, which is what
 * `NodeNext` module resolution requires of a project that compiles to ESM. Node
 * takes those specifiers literally and looks for a `.js` that only exists after
 * a build. Mapping them to the `.ts` beside them is the entire gap, and closing
 * it here costs fifteen lines instead of a TypeScript loader dependency — which
 * matters, because a dependency in the regeneration path is a dependency that
 * gets a vote on what the committed fixtures say.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL !== undefined &&
      specifier.endsWith('.js') &&
      (specifier.startsWith('./') || specifier.startsWith('../'))
    ) {
      const candidate = new URL(`${specifier.slice(0, -'.js'.length)}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

const GOLDEN_DIR = new URL('../packages/sim-core/test/golden/', import.meta.url);
const CORE_SRC = new URL('../packages/sim-core/src/', import.meta.url);
const COMMITTED_FIXTURES_DIR = fileURLToPath(new URL('./fixtures/', GOLDEN_DIR));

/**
 * Where fixtures are written. Defaults to the committed directory — typing
 * `npm run goldens:regen` must keep meaning exactly what it has always meant.
 *
 * `--fixtures <dir>` exists so the tests covering *this command's* behaviour
 * (that it rewrites a changed fixture and names it, and writes nothing at all
 * when nothing changed) can run against a throwaway copy. Those properties are
 * only observable on a run that actually writes something, and the one
 * directory a test may never make it write to is this repository's.
 *
 * Note what the flag does not do: it does not let a test regenerate the
 * committed fixtures by omission or accident, because omitting it is the safe
 * case and supplying it is the deliberate one.
 */
function fixturesDirFromArgv(argv) {
  const flag = argv.indexOf('--fixtures');
  if (flag === -1) {
    return COMMITTED_FIXTURES_DIR;
  }
  const value = argv[flag + 1];
  if (value === undefined || value.startsWith('--')) {
    console.error('--fixtures requires a directory path.');
    process.exit(2);
  }
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

const FIXTURES_DIR = fixturesDirFromArgv(process.argv.slice(2));

/** Dynamic, because the hooks above must be registered before anything resolves. */
const { GOLDEN_SCENARIOS } = await import(new URL('./scenarios.ts', GOLDEN_DIR).href);
const { worldById } = await import(new URL('./worlds.ts', GOLDEN_DIR).href);
const { fixtureFromRecording, recordingOf, renderFixture } = await import(
  new URL('./fixture-format.ts', GOLDEN_DIR).href
);
const { createState } = await import(new URL('./state.ts', CORE_SRC).href);
const { step } = await import(new URL('./step.ts', CORE_SRC).href);
const { Recorder } = await import(new URL('./replay/recorder.ts', CORE_SRC).href);
const { replayAndLocate } = await import(new URL('./replay/replayer.ts', CORE_SRC).href);
const { rngFromRootSeed } = await import(new URL('./rng/source.ts', CORE_SRC).href);

/**
 * Records one scenario and returns the fixture it produces.
 *
 * The prelude runs through plain `step`, outside the recorder, so the state it
 * leaves becomes the fixture's *initial snapshot* rather than part of its action
 * log. That is what gives at least one fixture a non-empty starting world.
 */
function record(scenario) {
  const world = worldById(scenario.worldId);
  let state = createState({ rootSeed: scenario.rootSeed, schema: world });
  for (const actions of scenario.prelude) {
    state = step(state, actions, rngFromRootSeed(scenario.rootSeed));
  }

  const recorder = new Recorder(state, { traceHashes: true });
  for (const actions of scenario.script) {
    recorder.step(actions, rngFromRootSeed(scenario.rootSeed));
  }

  const fixture = fixtureFromRecording(
    {
      name: scenario.name,
      description: scenario.description,
      worldId: scenario.worldId,
    },
    recorder.recording,
  );

  // Replay what is about to be written, from the encoded bytes, before writing
  // it. A fixture that cannot reproduce itself would be committed as green and
  // then fail on the next CI run for reasons that have nothing to do with the
  // change under review.
  const check = replayAndLocate(recordingOf(fixture), world);
  if (check.diverged) {
    throw new Error(
      `Refusing to write "${scenario.name}": the freshly recorded fixture does not replay from ` +
        `its own bytes. ${check.reason ?? ''}`,
    );
  }

  return fixture;
}

if (!existsSync(FIXTURES_DIR)) {
  mkdirSync(FIXTURES_DIR, { recursive: true });
}

if (FIXTURES_DIR !== COMMITTED_FIXTURES_DIR) {
  console.log(`Writing to ${FIXTURES_DIR} — NOT the committed fixtures.\n`);
}

/** @type {{ file: string, status: string }[]} */
const results = [];
const written = new Set();

for (const scenario of GOLDEN_SCENARIOS) {
  const file = `${scenario.name}.json`;
  const path = join(FIXTURES_DIR, file);
  const text = renderFixture(record(scenario));
  written.add(file);

  const existed = existsSync(path);
  const previous = existed ? readFileSync(path, 'utf8') : undefined;

  if (previous === text) {
    // Writing an identical file anyway would churn mtimes and, on some
    // editors and watchers, look like a change. "Unchanged" should be
    // observably nothing happening.
    results.push({ file, status: 'unchanged' });
    continue;
  }

  writeFileSync(path, text, 'utf8');
  results.push({ file, status: existed ? 'UPDATED' : 'added' });
}

const orphans = readdirSync(FIXTURES_DIR)
  .filter((name) => name.endsWith('.json') && !written.has(name))
  .sort();

for (const result of results) {
  console.log(`  ${result.status.padEnd(9)} ${result.file}`);
}
for (const orphan of orphans) {
  console.log(`  ORPHAN    ${orphan}`);
}

const updated = results.filter((result) => result.status === 'UPDATED');
const added = results.filter((result) => result.status === 'added');

console.log(
  `\n${results.length} scenario(s): ${added.length} added, ${updated.length} updated, ` +
    `${results.length - added.length - updated.length} unchanged.`,
);

if (orphans.length > 0) {
  // Not deleted. A fixture nobody generates might be a leftover, or it might be
  // a hand-written case somebody committed on purpose — and the verification
  // suite runs it either way. Deleting it silently would be the one outcome
  // that loses coverage without anyone deciding to.
  console.log(
    `\n${orphans.length} fixture file(s) are still verified but no scenario generates them.\n` +
      'Either add a scenario in scenarios.ts or delete the file deliberately.',
  );
}

if (updated.length > 0) {
  console.log(
    '\nA regenerated golden fixture is a CLAIM THAT BEHAVIOUR CHANGED ON PURPOSE.\n' +
      'Read the diff as a behaviour diff, and say in the commit message what changed and why.',
  );
} else if (added.length === 0) {
  console.log('\nNo fixture changed: the simulation reproduces every committed run exactly.');
}
