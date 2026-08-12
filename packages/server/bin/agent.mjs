#!/usr/bin/env node
/*
 * Multiverse Mages — a reference participant: one process, one universe, one
 * mirror simulation.
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
 * The client half of the contract, written out so the protocol has a second
 * implementation that is not the server's.
 *
 * ## Why this simulates
 *
 * `docs/design/release-plan.md`'s 0.15.0 claim is that *"across 1,000 automated
 * matches, both **clients** produce identical final snapshot hashes."* A client
 * that echoed back the hash the server sent it would satisfy that sentence and
 * measure nothing — the proposal says so in as many words: *"If clients do not
 * simulate, the desync claim degenerates into comparing the server against
 * itself."*
 *
 * So this process builds its own universe from the scenario module and the seed
 * the server named, applies the canonical batch to it tick by tick, and reports
 * a hash it computed itself. Everything it sends is derived from its own state.
 * The only thing it takes from the server is *which actions were applied and in
 * what order* — which is the one thing an authoritative server is for.
 *
 * ## What it is not
 *
 * Not a policy worth studying. It picks the lowest legal action, which is a
 * deterministic way to make a universe move and nothing more. `agent-interface`
 * owns strategies; this owns the wire.
 *
 * Run `npm run typecheck` first — this loads `dist/`.
 *
 *     node packages/server/bin/agent.mjs \
 *       --scenario ./packages/scenario/bin/scenario.mjs \
 *       --port 8080 --name alice --challenge bob --seed 7 --steps 12
 */

import { connect } from 'node:net';
import process from 'node:process';
import { URL } from 'node:url';

import {
  ACTION_SPACE_SIZE,
  OBSERVATION_LAYOUT_DIGEST,
  OBSERVATION_SCHEMA_VERSION,
  OBSERVATION_SIZE,
  createSession,
} from '@mm/agent-api';

import { BoundedLineReader, encodeFrame, PROTOCOL_VERSION } from '../dist/index.js';

const USAGE = `mm-agent — a reference participant that mirror-simulates.

  --scenario <module>   Module exporting createScenario() or scenario. Required.
  --port <n>            Server port. Required.
  --bind <address>      Server address. Default 127.0.0.1.
  --name <id>           This participant's name. Required.
  --challenge <name>    Challenge this opponent once connected. Omit to wait.
  --seed <n>            Match root seed, when challenging. Default 1.
  --steps <n>           Step limit, when challenging. Default 8.
  --corrupt-at <tick>   Report a wrong hash at this tick. For the desync test.
  --revision <hex>      Override the declared contentRevision. For refusal tests.
  --policy <lowest|highest>  Which legal action to take. Default lowest.
  --universe <id>       Persisted universe id. Defaults to one derived from --name.
  --cluster <id>        Group of multiverses this universe is in. Default cluster-0.

Writes one JSON summary line to stdout at the end. Everything else is stderr.`;

function parseArgs(argv) {
  const known = new Set([
    '--scenario',
    '--port',
    '--bind',
    '--name',
    '--challenge',
    '--seed',
    '--steps',
    '--corrupt-at',
    '--revision',
    '--policy',
    '--universe',
    '--cluster',
  ]);
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

async function loadScenario(specifier) {
  const resolved = new URL(specifier, `file://${process.cwd()}/`);
  const module = await import(resolved.href);
  const build = () =>
    typeof module.createScenario === 'function'
      ? module.createScenario()
      : (module.scenario ?? module.default?.scenario);
  return { build, probe: build(), provenance: module.provenance };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(0);
  }
  for (const required of ['scenario', 'port', 'name']) {
    if (args[required] === undefined) {
      process.stderr.write(`--${required} is required.\n\n${USAGE}\n`);
      process.exit(2);
    }
  }

  const loaded = await loadScenario(args.scenario);
  const name = args.name;
  const corruptAt = args['corrupt-at'] === undefined ? -1 : Number.parseInt(args['corrupt-at'], 10);
  const policy = args.policy ?? 'lowest';

  /** This process's own universe. Built after `match-start` names the seed. */
  let session;
  let slot = -1;
  let sequence = 0;
  let applied = 0;
  let lastHash = '';
  let ended;

  const socket = connect(
    { port: Number.parseInt(args.port, 10), host: args.bind ?? '127.0.0.1' },
    () => {
      socket.setNoDelay(true);
      send({
        type: 'hello',
        participant: name,
        contract: {
          protocolVersion: PROTOCOL_VERSION,
          observationSchemaVersion: OBSERVATION_SCHEMA_VERSION,
          observationLayoutDigest: OBSERVATION_LAYOUT_DIGEST,
          observationSize: OBSERVATION_SIZE,
          actionSpaceSize: ACTION_SPACE_SIZE,
          contentRevision: args.revision ?? loaded.provenance?.contentHash ?? 'unknown',
          scenarioId: loaded.probe.scenarioId,
          buildVersion: loaded.provenance?.buildVersion ?? 'unknown',
        },
        // The persisted identity this universe plays under. Announced even
        // though nothing stores it yet, because reachability is decided from
        // `clusterId` and a client that never sent one would have to start
        // when the persistence layer arrives.
        ...(args.universe === undefined && args.cluster === undefined
          ? {}
          : {
              universe: {
                universeId: args.universe ?? `unpersisted:${name}`,
                clusterId: args.cluster ?? 'cluster-0',
              },
            }),
      });
    },
  );
  socket.setEncoding('utf8');

  function send(frame) {
    if (!socket.destroyed) socket.write(encodeFrame(frame));
  }

  /**
   * The lowest or the highest legal action. A way to make a universe move, not
   * a strategy.
   *
   * Two of them, and that is the point rather than variety for its own sake: if
   * both participants played identically their universes would stay identical,
   * every slot's hash would match every other slot's, and a server that applied
   * slot 0's action to slot 1's universe would pass the end-to-end test. Two
   * different policies make the hashes diverge by slot, so the test can tell
   * whether each action reached the universe it was for.
   */
  function choose() {
    const mask = session.legalActions();
    if (policy === 'highest') {
      for (let id = mask.length - 1; id >= 1; id -= 1) {
        if (mask[id] === 1) return { kind: id, params: [0] };
      }
      return { kind: 0 };
    }
    for (let id = 1; id < mask.length; id += 1) {
      if (mask[id] === 1) return { kind: id, params: [0] };
    }
    return { kind: 0 };
  }

  /** Submits this participant's action for a tick. */
  function act(matchId, tick) {
    sequence += 1;
    send({ type: 'action', matchId, tick, sequence, action: choose() });
  }

  function finish(reason) {
    if (ended !== undefined) return;
    ended = reason;
    // One JSON line, on stdout, so the harness that spawned this process can
    // compare what this universe believes against what the server broadcast
    // without parsing operator prose.
    process.stdout.write(
      `${JSON.stringify({ participant: name, slot, ticksApplied: applied, finalHash: lastHash, reason })}\n`,
    );
    socket.end();
  }

  const reader = new BoundedLineReader();
  socket.on('data', (chunk) => {
    for (const line of reader.push(chunk)) {
      let frame;
      try {
        frame = JSON.parse(line);
      } catch {
        continue;
      }
      handle(frame);
    }
  });

  function handle(frame) {
    switch (frame.type) {
      case 'welcome':
        if (args.challenge !== undefined) {
          send({
            type: 'challenge',
            opponent: args.challenge,
            runSeed: args.seed === undefined ? 1 : Number.parseInt(args.seed, 10),
            stepLimit: args.steps === undefined ? 8 : Number.parseInt(args.steps, 10),
          });
        }
        return;

      case 'challenged':
        send({ type: 'accept', challengeId: frame.challengeId });
        return;

      case 'match-start': {
        slot = frame.slot;
        // The mirror. Same scenario module, same seed, same cap — which is the
        // whole of what the wire carries about the world. See this file's note.
        session = createSession({ scenario: loaded.build(), agentSlotIndex: slot });
        session.reset(frame.runSeed, { worldTickCap: frame.stepLimit });
        lastHash = session.snapshotHash();
        if (frame.initialHashes[slot] !== lastHash) {
          // Refused before a single tick: two processes that disagree about
          // tick zero disagree about the scenario, and playing on would produce
          // a desync report that blamed the netcode for a build mismatch.
          process.stderr.write(
            `initial-state-mismatch slot=${slot} server=${frame.initialHashes[slot]} own=${lastHash}\n`,
          );
          finish('initial-state-mismatch');
          return;
        }
        act(frame.matchId, 0);
        return;
      }

      case 'tick': {
        const mine = frame.batch.entries.find((entry) => entry.slot === slot);
        if (mine !== undefined) {
          session.submit(
            mine.action.params === undefined
              ? { kind: mine.action.kind }
              : { kind: mine.action.kind, params: mine.action.params },
          );
          applied += 1;
          lastHash = session.snapshotHash();
        }
        const reported = frame.tick === corruptAt ? 'deadbeefdeadbeef' : lastHash;
        send({ type: 'checkpoint', matchId: frame.matchId, tick: frame.tick, slot, hash: reported });
        if (frame.end === undefined) act(frame.matchId, frame.tick + 1);
        return;
      }

      case 'desync':
        process.stderr.write(
          `desync tick=${frame.tick} slot=${frame.slot} authoritative=${frame.authoritativeHash} ` +
            `reported=${frame.reportedHash} corrected=${frame.corrected}\n`,
        );
        return;

      case 'match-end':
        finish(frame.reason);
        return;

      case 'error':
        process.stderr.write(`error code=${frame.code} ${frame.message}\n`);
        if (frame.fatal) {
          finish(`error:${frame.code}`);
          return;
        }
        // A refused challenge is not fatal to the connection — the participant
        // may challenge someone else — but this reference client has exactly
        // one opponent in mind, named on its command line. With that challenge
        // refused it has nothing left to do, and staying connected would make
        // it look like a participant waiting for a match that is never coming.
        if (frame.code === 'ineligible' && args.challenge !== undefined) {
          finish(`refused:${frame.ineligibility ?? frame.code}`);
        }
        return;

      default:
        return;
    }
  }

  socket.on('close', () => {
    finish('closed');
    process.exit(0);
  });
  socket.on('error', (error) => {
    process.stderr.write(`socket ${String(error.message ?? error)}\n`);
    finish('socket-error');
    process.exit(1);
  });
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack ?? error)}\n`);
  process.exit(1);
});
