#!/usr/bin/env node
/*
 * Multiverse Mages — the server process: argv, a scenario module, and a socket.
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
 * The three things `src/` cannot own: `process.argv`, the dynamic `import()`
 * that loads the caller's scenario module, and the process's own lifetime.
 *
 * The import is genuinely dynamic — the module is named on the command line —
 * and it lives outside `src/` for the reason `gym-bridge/bin/serve.mjs` and
 * `mc-harness/src/cli.ts` both record: `contracts.md` §5's boundary scanner
 * cannot read a computed specifier and correctly refuses to guess. It matters
 * more here than there, because §5 makes `scenario` a **leaf that nothing may
 * statically import** — a static edge would break the property its own
 * dependency test asserts by name. Loading it by path at runtime is how the
 * server gets a world without becoming something the graph forbids.
 *
 * Run `npm run typecheck` first — this loads `dist/`.
 *
 *     node packages/server/bin/serve.mjs \
 *       --scenario ./packages/scenario/bin/scenario.mjs \
 *       --port 0
 *
 * ## Configuration and secrets
 *
 * There are no secrets here, and the design is arranged so there is nowhere for
 * one to go. Everything this process needs is a port, a bind address and a
 * module path, all of which are non-sensitive and all of which are passed as
 * arguments. `CLAUDE.md` makes this a public repository in which a committed
 * secret is permanently compromised, so the rule this binary follows is that a
 * secret is never a file in this tree: an operator who later needs one supplies
 * it through the process environment at run time, and `deployment.md` says how.
 * Nothing here reads a credential, writes one, or has a default that looks like
 * one.
 */

import process from 'node:process';
import { URL } from 'node:url';

import {
  ACTION_SPACE_SIZE,
  OBSERVATION_LAYOUT_DIGEST,
  OBSERVATION_SCHEMA_VERSION,
  OBSERVATION_SIZE,
  createSession,
} from '@mm/agent-api';

import { MatchHost, MatchServer, PROTOCOL_VERSION } from '../dist/index.js';

const USAGE = `mm-server — the authoritative match server (contracts.md §5, §8).

  --scenario <module>   Module exporting createScenario() or scenario. Required.
  --port <n>            TCP port. 0 asks the OS for a free one. Default 0.
  --bind <address>      Interface to bind. Default 127.0.0.1 (loopback).
  --tick-ms <n>         Wall-clock ms between authoritative ticks.
  --deadline-ms <n>     Wall-clock ms a participant has to answer a tick.
  --help                This text.

The bound port is printed to stdout as "listening <port>" and nothing else ever
is; operator logs go to stderr, so a supervisor can read the port from a pipe.`;

/** argv as a flag map. Unknown flags are refused rather than ignored. */
function parseArgs(argv) {
  const known = new Set(['--scenario', '--port', '--bind', '--tick-ms', '--deadline-ms']);
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (!known.has(flag)) throw new Error(`Unknown option ${flag}. Run with --help.`);
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`${flag} needs a value.`);
    args[flag.slice(2)] = value;
    index += 1;
  }
  return args;
}

/**
 * Loads a scenario module and returns a **factory**, not a scenario.
 *
 * One scenario per session, never one per process: `scenario/bin/scenario.mjs`
 * records why — the world simulation it installs holds a per-run report closure
 * and a rediscovery-clamp counter, so two sessions sharing one would describe
 * whichever episode stepped last. A match is two sessions by definition, which
 * makes this the first caller for whom that distinction is load-bearing rather
 * than theoretical.
 */
async function loadScenario(specifier) {
  const resolved = new URL(specifier, `file://${process.cwd()}/`);
  const module = await import(resolved.href);
  const build = () =>
    typeof module.createScenario === 'function'
      ? module.createScenario()
      : (module.scenario ?? module.default?.scenario);
  const probe = build();
  if (probe === undefined || typeof probe.create !== 'function') {
    throw new Error(
      `${specifier} exports no scenario. Export either createScenario(): Scenario or a ` +
        '`scenario` object with { scenarioId, catalogue, create(runSeed, config) }. A server ' +
        'that invented a world would host a match in a universe neither player agreed to.',
    );
  }
  return { build, probe, provenance: module.provenance };
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
    process.stderr.write(`${String(error?.stack ?? error)}\n`);
    process.exit(2);
  }

  const contentRevision = loaded.provenance?.contentHash;
  if (typeof contentRevision !== 'string' || !/^[0-9a-f]{32}$/.test(contentRevision)) {
    // §0 pins the revision at 128 bits carried as 32 lowercase hex, end to end,
    // and calls narrowing it anywhere a breaking contract change. A server that
    // started without one would admit two universes to a match on the strength
    // of a comparison between two "unknown"s.
    process.stderr.write(
      `The scenario module declares contentHash ${JSON.stringify(contentRevision)}, which is not ` +
        'the 32 lowercase hex characters contracts.md §0 requires. Two universes may only ' +
        'interact if their contentRevision values are equal, and this server cannot check that.\n',
    );
    process.exit(2);
  }

  const contract = {
    protocolVersion: PROTOCOL_VERSION,
    observationSchemaVersion: OBSERVATION_SCHEMA_VERSION,
    observationLayoutDigest: OBSERVATION_LAYOUT_DIGEST,
    observationSize: OBSERVATION_SIZE,
    actionSpaceSize: ACTION_SPACE_SIZE,
    contentRevision,
    scenarioId: loaded.probe.scenarioId,
    buildVersion: loaded.provenance?.buildVersion ?? 'unknown',
  };

  const pacing = {};
  if (args['tick-ms'] !== undefined) pacing.tickIntervalMs = Number.parseInt(args['tick-ms'], 10);
  if (args['deadline-ms'] !== undefined) {
    pacing.actionDeadlineMs = Number.parseInt(args['deadline-ms'], 10);
  }

  const host = new MatchHost({
    contract,
    createSession: (slot) => createSession({ scenario: loaded.build(), agentSlotIndex: slot }),
    // Operator lines to stderr. stdout carries the port line and nothing else,
    // so a supervisor parsing it never has to guess which lines are structured.
    log: (line) => process.stderr.write(`${line}\n`),
    ...(pacing.tickIntervalMs === undefined && pacing.actionDeadlineMs === undefined
      ? {}
      : {
          pacing: {
            tickIntervalMs: pacing.tickIntervalMs ?? 50,
            actionDeadlineMs: pacing.actionDeadlineMs ?? 40,
          },
        }),
  });

  const server = new MatchServer(host, {
    port: args.port === undefined ? 0 : Number.parseInt(args.port, 10),
    ...(args.bind === undefined ? {} : { host: args.bind }),
  });

  const port = await server.listen();
  process.stdout.write(`listening ${port}\n`);
  process.stderr.write(
    `mm-server scenario=${contract.scenarioId} contentRevision=${contentRevision} ` +
      `protocol=${PROTOCOL_VERSION}\n`,
  );

  const stop = () => {
    server.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack ?? error)}\n`);
  process.exit(1);
});
