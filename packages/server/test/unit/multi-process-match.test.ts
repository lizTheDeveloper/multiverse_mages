/*
 * Multiverse Mages — several OS processes, one authoritative server, one match.
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
 * The integration path: **real processes, a real socket, and the reference
 * universe.**
 *
 * Everything else in this suite drives `MatchHost` in memory, which is the right
 * unit for a protocol decision and is deliberately the same code this test
 * exercises — `MatchHost` never imports `node:net`. What only a process can
 * show is the part that is not the host's: that two independently built
 * universes, in separate address spaces, each simulating for themselves, arrive
 * at the same snapshot hash the server did.
 *
 * ## Why the reference universe rather than the probe fixture
 *
 * §5 forbids this package a static edge to `@mm/scenario` — it is a leaf, and
 * the dependency-graph test asserts the leaf property by name. A spawned
 * process is under no such constraint: it loads the scenario module by path,
 * exactly as `bin/serve.mjs` documents and exactly as `mm-run-sweep` already
 * does. So this is the one test in the package that runs against the universe
 * the game is actually about, and it gets there without a forbidden import.
 *
 * ## Why the port is 0
 *
 * The OS picks a free one and the server prints it. A hard-coded port makes two
 * parallel runs fight, and the failure reads as a flaky server rather than as a
 * port collision.
 *
 * ## What must exist first
 *
 * The binaries load `dist/`, so `npm run typecheck` must have run. `npm run
 * verify` runs it before the suite. The first test asserts the build is there,
 * rather than letting its absence surface as a socket timeout three tests later.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const SERVE = fileURLToPath(new URL('../../bin/serve.mjs', import.meta.url));
const AGENT = fileURLToPath(new URL('../../bin/agent.mjs', import.meta.url));
const SCENARIO = './packages/scenario/bin/scenario.mjs';
const SERVER_DIST = fileURLToPath(new URL('../../dist/index.js', import.meta.url));

/** What one agent process reported about its own universe when it finished. */
interface AgentSummary {
  readonly participant: string;
  readonly slot: number;
  readonly ticksApplied: number;
  readonly finalHash: string;
  readonly reason: string;
}

const alive: ChildProcessWithoutNullStreams[] = [];

function launch(command: string, args: readonly string[]): ChildProcessWithoutNullStreams {
  const child = spawn(process.execPath, [command, ...args], { cwd: REPO });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  alive.push(child);
  return child;
}

afterEach(() => {
  for (const child of alive.splice(0)) child.kill('SIGKILL');
});

/** Starts the server and resolves the port it printed. */
async function startServer(extra: readonly string[] = []): Promise<{
  child: ChildProcessWithoutNullStreams;
  port: number;
  stderr: () => string;
}> {
  const child = launch(SERVE, ['--scenario', SCENARIO, '--port', '0', ...extra]);
  let errors = '';
  child.stderr.on('data', (chunk: string) => {
    errors += chunk;
  });

  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`The server never printed a port. stderr was:\n${errors}`));
    }, 20_000);
    let out = '';
    child.stdout.on('data', (chunk: string) => {
      out += chunk;
      const match = /listening (\d+)/.exec(out);
      if (match !== null) {
        clearTimeout(timer);
        resolve(Number.parseInt(match[1] as string, 10));
      }
    });
  });
  return { child, port, stderr: () => errors };
}

/** Runs one agent process and resolves the summary line it wrote. */
function runAgent(args: readonly string[]): Promise<{ summary: AgentSummary; stderr: string }> {
  const child = launch(AGENT, ['--scenario', SCENARIO, ...args]);
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk: string) => {
    out += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    err += chunk;
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Agent did not finish. stdout:\n${out}\nstderr:\n${err}`));
    }, 40_000);
    child.on('close', () => {
      clearTimeout(timer);
      const line = out.trim().split('\n').filter(Boolean).pop();
      if (line === undefined) {
        reject(new Error(`Agent wrote no summary. stderr:\n${err}`));
        return;
      }
      resolve({ summary: JSON.parse(line) as AgentSummary, stderr: err });
    });
  });
}

describe('the binaries are built', () => {
  it('has a server dist to spawn', () => {
    // Not vacuous: every test below would otherwise fail as a socket timeout,
    // twenty seconds at a time, for a reason none of them would name.
    expect(
      existsSync(SERVER_DIST),
      'packages/server/dist is missing. The binaries load dist/ deliberately — see ' +
        'bin/serve.mjs — so run `npm run typecheck` first. `npm run verify` does.',
    ).toBe(true);
  });
});

describe('two independent agent processes play one authoritative match', () => {
  it('agrees, in three address spaces, on every slot’s final snapshot hash', async () => {
    const { port, stderr } = await startServer();

    // The defender connects first and waits; the challenger issues the
    // challenge. Vision §12: direct challenge, no queue to join.
    const defender = runAgent(['--port', String(port), '--name', 'bob', '--policy', 'highest']);
    await new Promise((r) => setTimeout(r, 500));
    const challenger = runAgent([
      '--port',
      String(port),
      '--name',
      'alice',
      '--challenge',
      'bob',
      '--seed',
      '7',
      '--steps',
      '6',
      '--policy',
      'lowest',
    ]);

    const [a, b] = await Promise.all([challenger, defender]);

    // Both played the whole match and neither bailed out.
    expect(a.summary.reason).toBe('truncated');
    expect(b.summary.reason).toBe('truncated');
    expect(a.summary.ticksApplied).toBe(6);
    expect(b.summary.ticksApplied).toBe(6);
    expect(a.summary.slot).toBe(0);
    expect(b.summary.slot).toBe(1);

    // Each agent computed this from a universe it built itself, in its own
    // process, by applying the canonical batch to its own core instance. The
    // server never sent either of them a state.
    expect(a.summary.finalHash).toMatch(/^[0-9a-f]{16}$/);
    expect(b.summary.finalHash).toMatch(/^[0-9a-f]{16}$/);

    // The server saw no disagreement. Every checkpoint either matched the
    // authoritative hash or would have produced a `desync` line here.
    expect(stderr()).not.toContain('desync ');
    expect(stderr()).toContain('match-end');

    // The two agents played different policies, so their universes diverged.
    // Without this the test would pass on a server that applied one slot's
    // action to both universes.
    expect(a.summary.finalHash).not.toBe(b.summary.finalHash);

    // Neither agent refused its own build: the initial-hash check in agent.mjs
    // compares the universe it constructed against the server's before tick 0.
    expect(a.stderr).not.toContain('initial-state-mismatch');
    expect(b.stderr).not.toContain('initial-state-mismatch');
  }, 90_000);

  it('reports a desync, over a real socket, and corrects nothing', async () => {
    const { port, stderr } = await startServer();

    const defender = runAgent(['--port', String(port), '--name', 'bob']);
    await new Promise((r) => setTimeout(r, 500));
    // Alice lies about her hash at tick 1.
    const liar = runAgent([
      '--port',
      String(port),
      '--name',
      'alice',
      '--challenge',
      'bob',
      '--seed',
      '3',
      '--steps',
      '6',
      '--corrupt-at',
      '1',
    ]);

    const [a, b] = await Promise.all([liar, defender]);

    // Logged by the operator-facing path, with both hashes and the tick.
    const log = stderr();
    expect(log).toContain('desync ');
    expect(log).toContain('tick=1');
    expect(log).toContain('corrected=false');

    // Both participants were told, over the wire, and both saw `corrected=false`.
    expect(a.stderr).toContain('corrected=false');
    expect(b.stderr).toContain('corrected=false');

    // Hard: the match ended on the desync rather than running to its step limit.
    expect(a.summary.reason).toBe('desync');
    expect(b.summary.reason).toBe('desync');
    // It stopped where the lie was, not six ticks later.
    expect(a.summary.ticksApplied).toBeLessThan(6);
  }, 90_000);

  it('refuses a challenge across clusters, over a real socket', async () => {
    const { port } = await startServer();

    // Swallowed deliberately: bob is never challenged, so he waits until
    // afterEach kills him. An unhandled rejection from that kill would surface
    // as a failure in whichever test happened to be running next.
    const southern = runAgent([
      '--port', String(port), '--name', 'bob',
      '--universe', 'u-bob', '--cluster', 'south',
    ]).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 500));
    const northern = await runAgent([
      '--port', String(port), '--name', 'alice',
      '--universe', 'u-alice', '--cluster', 'north',
      '--challenge', 'bob', '--seed', '1', '--steps', '4',
    ]);

    // The challenge is refused rather than played, and the refusal names the
    // predicate. Nothing about this is a queue — vision §12 keeps matchmaking
    // out of v1 — it is whether the portal between these two could exist.
    expect(northern.stderr).toContain('ineligible');
    expect(northern.stderr).toContain('cluster');
    // Not fatal, so the connection stayed open and no match was ever started.
    expect(northern.summary.slot).toBe(-1);
    expect(northern.summary.ticksApplied).toBe(0);
    expect(northern.summary.reason).toBe('refused:cluster');
    void southern;
  }, 60_000);

  it('refuses a participant whose content revision differs, naming both', async () => {
    const { port } = await startServer();
    const refused = await runAgent([
      '--port',
      String(port),
      '--name',
      'stranger',
      '--revision',
      'ffffffffffffffffffffffffffffffff',
    ]);

    // §0: refusal, not negotiation, and the refusal says what disagreed.
    expect(refused.summary.reason).toBe('error:content-revision-mismatch');
    expect(refused.stderr).toContain('content-revision-mismatch');
    expect(refused.stderr).toContain('§0');
  }, 60_000);
});
