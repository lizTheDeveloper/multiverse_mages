#!/usr/bin/env node
/*
 * Multiverse Mages — lobby server binary.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 *     node packages/lobby/bin/lobby.mjs --port 8300 [--tick-ms 1000]
 *         [--max-universes 16] [--bubble-size 4] [--idle-ms 900000] [--match-ms 60000]
 *
 * The interval below is the **only** thing that moves time in any universe this
 * process hosts. No route advances, resets or pauses one.
 *
 * ## `--max-universes`, and the number it comes from
 *
 * Each universe holds its whole frame spine in memory. Measured 2026-10-08 on
 * branch `lobby-server-clock-impl` (base `origin/main` @ 95738881): **~21 KB of
 * heap per frame**, 0.6 MB at creation, so **~84 MB for a universe that reaches
 * the 4000-tick cap**. In practice no universe measured got there unplayed —
 * four untouched openings ended `stagnated` between 550 and 790 ticks, i.e. at
 * 12–17 MB — but the default is sized for the worst case: 16 × 84 MB ≈ 1.3 GB,
 * half of a 2.7 GB budget. Raise it with the flag on a box known to have more.
 */

import process from 'node:process';
import { setInterval } from 'node:timers';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_PACING, systemClock } from '@mm/server';
import { referenceContent } from '@mm/scenario';

import { LOBBY_LIMITS, Lobby } from '../dist/index.js';
import { frameDocument } from '../../../scripts/lib/frame-document.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');

const USAGE = `usage: node packages/lobby/bin/lobby.mjs [options]

Serves the lobby and every universe it hosts, and ticks them on one clock.

  --port <n>            TCP port to listen on (0..65535, default 8400)
  --tick-ms <n>         milliseconds between world ticks (50..3600000)
  --max-universes <n>   universes hosted at once (default 16)
  --bubble-size <n>     universes per raid bubble (default 4)
  --idle-ms <n>         a universe left alone this long gives its slot back
                        (default 900000)
  -h, --help            print this message and exit
`;
// Before anything binds a port: `--help` must never start a server.
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
/**
 * A numeric flag as an integer in `[min, max]`, or exit 2 naming the flag.
 *
 * Refuses rather than defaults. `--max-universes foo` parsing to `NaN` would be
 * no cap at all (`size >= NaN` is always false), and `--tick-ms 0` a hot loop.
 */
const integer = (name, fallback, min, max) => {
  const raw = arg(name, String(fallback));
  const n = /^-?\d+$/u.test(String(raw)) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    process.stderr.write(
      `--${name} must be an integer in ${String(min)}..${String(max)}, not ${JSON.stringify(raw ?? null)}\n`,
    );
    process.exit(2);
  }
  return n;
};

const port = integer('port', 8400, 0, 65535);
const tickMs = integer('tick-ms', DEFAULT_PACING.world.tickIntervalMs, 50, 3_600_000);
const maxUniverses = integer('max-universes', 16, LOBBY_LIMITS.maxUniverses.min, LOBBY_LIMITS.maxUniverses.max);
const bubbleSize = integer('bubble-size', 4, LOBBY_LIMITS.bubbleSize.min, LOBBY_LIMITS.bubbleSize.max);
// A running universe its owner has left alone this long gives its slot back.
const idleMs = integer('idle-ms', 15 * 60_000, LOBBY_LIMITS.idleAfterMs.min, LOBBY_LIMITS.idleAfterMs.max);
// A universe that finds no open seat for this long joins whoever else is waiting.
const matchMs = integer('match-ms', 60_000, LOBBY_LIMITS.matchAfterMs.min, LOBBY_LIMITS.matchAfterMs.max);

const lobby = new Lobby({
  doc: frameDocument(referenceContent(), 'packages/lobby'),
  clock: systemClock,
  uiRoot: path.join(ROOT, 'ui'),
  maxUniverses,
  bubbleSize,
  idleAfterMs: idleMs,
  matchAfterMs: matchMs,
});
await lobby.listen(port);
// The one wall-clock driver: pacing only (authoritative-lockstep spec, l.97).
setInterval(() => lobby.tickAll(), tickMs);
process.stdout.write(
  `  world tick every ${String(tickMs)} ms, at most ${String(maxUniverses)} universes, bubbles of ${String(bubbleSize)}\n`,
);
