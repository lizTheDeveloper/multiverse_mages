#!/usr/bin/env node
/*
 * Multiverse Mages — the bridge process: argv, a scenario module, and two pipes.
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
 * The two things `src/` cannot own: `process.argv`, and the dynamic `import()`
 * that loads the caller's scenario module.
 *
 * The import is genuinely dynamic — the module to load is named on the command
 * line — and it lives outside `src/` deliberately, for the reason
 * `mc-harness/src/cli.ts` records for the same split: `contracts.md` §5's
 * boundary scanner cannot read a computed specifier and correctly refuses to
 * guess. Putting the one computed import where the scanner does not run is not
 * evading it; it is putting it where a reader will look for it.
 *
 * Run `npm run typecheck` first — this loads `dist/`.
 *
 *     node packages/gym-bridge/bin/serve.mjs \
 *       --scenario ./packages/scenario/bin/scenario.mjs \
 *       --envs 8
 *
 * ## What this command is not
 *
 * It runs no sweep, aggregates nothing, and writes no baseline. Work with no
 * learned policy in the loop — baselines, gates, tournaments, ablation —
 * belongs to `mm-run-sweep`, which already has the `worker_threads` pool, the
 * published seed derivation and the canonical-order aggregation. See
 * `src/vector.ts` for why hosting a stepping session inside that pool would
 * give this repository two ways to drive a universe.
 *
 * ## Concurrency
 *
 * `--envs N` hosts N universes in this process and steps them in one frame,
 * which amortizes the JSON round trip. It does not use a second core. For
 * cores, run several of these; `subprocess` is in the Python standard library
 * and the reference client's `VectorMageEnv` does exactly that.
 */

import process from 'node:process';
import { URL } from 'node:url';

import { createBridge, LineReader } from '../dist/index.js';

const USAGE = `mm-gym-bridge — the JSON-over-stdio agent boundary (contracts.md §4).

  --scenario <module>   Module exporting createScenario() or scenario. Required.
  --envs <n>            Universes hosted in this process. Default 1.
  --build <version>     Recorded in the contract. Default: the scenario's, else "unknown".
  --content <hash>      §0 content revision. Default: the scenario's, else "unknown".
  --help                This text.

Frames go to stdout, one JSON object per line. Everything else goes to stderr.

For sweeps, baselines, gates or tournaments use packages/mc-harness/bin/run-sweep.mjs:
it has the worker pool, the published seed derivation and canonical aggregation,
and this bridge deliberately ships none of them.`;

/** argv as a flag map. Unknown flags are refused rather than ignored. */
function parseArgs(argv) {
  const known = new Set(['--scenario', '--envs', '--build', '--content']);
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (!known.has(flag)) {
      throw new Error(`Unknown option ${flag}. Run with --help.`);
    }
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`${flag} needs a value.`);
    args[flag.slice(2)] = value;
    index += 1;
  }
  return args;
}

/**
 * Loads a scenario module and returns its `Scenario`.
 *
 * Two accepted shapes, deliberately a superset of what `mm-run-sweep` already
 * loads, so that one module can serve both commands.
 */
async function loadScenario(specifier) {
  const resolved = new URL(specifier, `file://${process.cwd()}/`);
  const module = await import(resolved.href);
  const built =
    typeof module.createScenario === 'function'
      ? module.createScenario()
      : (module.scenario ?? module.default?.scenario);
  if (built === undefined || typeof built.create !== 'function') {
    throw new Error(
      `${specifier} exports no scenario. Export either createScenario(): Scenario or a ` +
        '`scenario` object with { scenarioId, catalogue, create(runSeed, config) }. A bridge ' +
        'that invented a world would answer every question about a universe nobody asked for.',
    );
  }
  return { scenario: built, provenance: module.provenance };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${String(error.message ?? error)}\n`);
    process.exit(2);
  }
  if (args.help) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(0);
  }
  if (args.scenario === undefined) {
    process.stderr.write(`--scenario is required.\n\n${USAGE}\n`);
    process.exit(2);
  }

  let loaded;
  try {
    loaded = await loadScenario(args.scenario);
  } catch (error) {
    // Stderr and a non-zero exit, and **no frame on stdout**. A client reading
    // stdout must never see a partial handshake from a bridge that has no world.
    process.stderr.write(`${String(error?.stack ?? error)}\n`);
    process.exit(2);
  }

  const envCount = args.envs === undefined ? 1 : Number.parseInt(args.envs, 10);
  const bridge = createBridge({
    scenario: loaded.scenario,
    envCount,
    buildVersion: args.build ?? loaded.provenance?.buildVersion ?? 'unknown',
    contentHash: args.content ?? loaded.provenance?.contentHash ?? 'unknown',
  });

  const reader = new LineReader();
  let stopped = false;

  /**
   * Ends the process without `process.exit`.
   *
   * `process.exit` is deliberately avoided here: stdout to a pipe is
   * asynchronous in Node, and exiting drops whatever is still buffered. The one
   * frame a fatal refusal writes is precisely the frame a client needs, so the
   * refusal has to survive its own exit. Setting `exitCode` and releasing stdin
   * lets the loop drain and Node leave on its own.
   */
  const stop = (code) => {
    if (stopped) return;
    stopped = true;
    process.exitCode = code;
    process.stdin.pause();
    process.stdin.destroy();
  };

  const consume = (lines) => {
    for (const line of lines) {
      if (stopped) return;
      const reply = bridge.handleLine(line);
      for (const frame of reply.lines) process.stdout.write(frame);
      if (reply.fatal) return stop(1);
      if (reply.closed) return stop(0);
    }
  };

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    consume(reader.push(chunk));
  });
  process.stdin.on('end', () => {
    consume(reader.flush());
  });

  // A client that dies mid-episode is an ordinary end, not an error: nothing
  // this process was doing was going to be recorded by it anyway.
  process.stdout.on('error', (error) => {
    if (error?.code === 'EPIPE') stop(0);
    else throw error;
  });
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack ?? error)}\n`);
  // Deliberately not an error frame: a failure here is a failure of the process
  // rather than of a request, and writing a frame would leave the client unsure
  // whether the stream is still a protocol stream.
  process.exit(1);
});
