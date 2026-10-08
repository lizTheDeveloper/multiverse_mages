#!/usr/bin/env node
/*
 * Multiverse Mages — lobby server binary.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 *     node packages/lobby/bin/lobby.mjs --port 8300 [--tick-ms 1000]
 *         [--max-universes 16] [--bubble-size 4]
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

import { Lobby } from '../dist/index.js';
import { frameDocument } from '../../../scripts/lib/frame-document.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const positive = (name, fallback) => {
  const n = Number(arg(name, String(fallback)));
  if (!Number.isInteger(n) || n < 1) {
    process.stderr.write(`--${name} must be a positive integer, not ${String(arg(name, ''))}\n`);
    process.exit(2);
  }
  return n;
};

const port = Number(arg('port', '8400'));
const tickMs = positive('tick-ms', DEFAULT_PACING.world.tickIntervalMs);
const maxUniverses = positive('max-universes', 16);
const bubbleSize = positive('bubble-size', 4);

const lobby = new Lobby({
  doc: frameDocument(referenceContent(), 'packages/lobby'),
  clock: systemClock,
  uiRoot: path.join(ROOT, 'ui'),
  maxUniverses,
  bubbleSize,
});
await lobby.listen(port);
// The one wall-clock driver: pacing only (authoritative-lockstep spec, l.97).
setInterval(() => lobby.tickAll(), tickMs);
process.stdout.write(
  `  world tick every ${String(tickMs)} ms, at most ${String(maxUniverses)} universes, bubbles of ${String(bubbleSize)}\n`,
);
