#!/usr/bin/env node
/* global console, setTimeout */
/*
 * Multiverse Mages — universe server binary.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 *     node packages/universe-host/bin/serve.mjs --port 9001 --id uni-001 --bubble bubble-0
 */

import process from 'node:process';
import { UniverseHost } from '../dist/index.js';
import { WsTransport } from '../dist/transport-ws.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const PORT = Number(arg('port', '9001'));
const ID = arg('id', `uni-${Date.now().toString(36)}`);
const BUBBLE_ID = arg('bubble', 'bubble-0');
const SEED = Number(arg('seed', String(Date.now())));
const TICK_CAP = Number(arg('ticks', '4000'));
const WARM = Number(arg('warm', '40'));

const universe = new UniverseHost({
  id: ID,
  bubbleId: BUBBLE_ID,
  seed: SEED,
  tickCap: TICK_CAP,
  warmTicks: WARM,
});

const transport = new WsTransport({
  port: PORT,
  onGodConnect: (send) => {
    console.log(`[${ID}] god connected`);
    universe.connectGod(send);
  },
  onGodMessage: (msg) => {
    universe.handleGodMessage(msg);
  },
  onGodDisconnect: () => {
    console.log(`[${ID}] god disconnected`);
    universe.disconnectGod();
  },
});

await transport.listen();
console.log(`[${ID}] universe server listening on port ${PORT} (bubble ${BUBBLE_ID}, seed ${SEED})`);
console.log(`[${ID}] ${universe.currentTick} ticks warm, ready for a god`);

// Start ticking when a god connects (or immediately for headless mode)
if (process.argv.includes('--headless')) {
  universe.startTicking();
  console.log(`[${ID}] headless mode — ticking without a god`);
}

process.on('SIGINT', async () => {
  console.log(`[${ID}] shutting down`);
  universe.stopTicking();
  await transport.close();
  process.exit(0);
});
