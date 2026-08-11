#!/usr/bin/env node
/*
 * Multiverse Mages — the audio generation batch driver.
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
 * Drives ElevenLabs generation from the validated audio content
 * (`packages/content/data/audio`), using `planRequests` from
 * `@mm/content`'s built `audio-generation.js` for the pure request shaping.
 *
 * This is the only thing in this repository that holds a credential, and the
 * repository is public. `ELEVENLABS_API_KEY` is read from the environment,
 * never written to a file, and every error path routes the message through
 * `redact()` before it reaches `console.error`. Do not add a log line, a
 * thrown error, or a written file that has not passed through `redact()`.
 *
 * Resumes by skipping any output path that already exists. The API is
 * metered, so a batch that dies partway through must not re-bill requests it
 * already paid for.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';

import { loadAudioContent, directorySource, shippedAudioDirectory } from '../packages/content/dist/index.js';
import { planRequests, redact } from '../packages/content/dist/audio-generation.js';

const KEY = process.env.ELEVENLABS_API_KEY;
const BASE = 'https://api.elevenlabs.io/v1';

function fail(message) {
  console.error(redact(message, KEY ?? ''));
  process.exit(1);
}

if (!KEY) {
  fail('ELEVENLABS_API_KEY is not set. Export it in your shell; never write it to a file in this repo.');
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const takes = Number(args.find((a) => a.startsWith('--takes='))?.slice(8) ?? 6);
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const voiceId = process.env.ELEVENLABS_VOICE_ID ?? '';

const { cues, banks } = loadAudioContent(directorySource(shippedAudioDirectory(), 'data/audio'));
let requests = planRequests(cues, banks, { takes });
if (only) requests = requests.filter((r) => r.id.startsWith(only));

console.log(`${requests.length} requests planned (${takes} takes each).`);
if (dryRun) {
  for (const request of requests.slice(0, 20)) console.log(`  ${request.endpoint}  ${request.outputPath}`);
  if (requests.length > 20) console.log(`  ... and ${requests.length - 20} more`);
  process.exit(0);
}

let generated = 0;
let skipped = 0;

for (const request of requests) {
  if (existsSync(request.outputPath)) {
    skipped += 1;
    continue;
  }
  const url =
    request.endpoint === 'sound-effect'
      ? `${BASE}/sound-generation`
      : `${BASE}/text-to-speech/${voiceId}`;

  if (request.endpoint === 'text-to-speech' && !voiceId) {
    fail('ELEVENLABS_VOICE_ID is not set, and voice lines were planned. Set it, or use --only= to generate cues.');
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
      body: JSON.stringify(request.body),
    });
  } catch (error) {
    fail(`network error on ${request.id}: ${error.message}`);
  }

  if (!response.ok) {
    const detail = await response.text();
    fail(`${request.id} failed: ${response.status} ${redact(detail, KEY)}`);
  }

  mkdirSync(dirname(request.outputPath), { recursive: true });
  writeFileSync(request.outputPath, Buffer.from(await response.arrayBuffer()));
  generated += 1;
  console.log(`  ${generated}/${requests.length}  ${request.outputPath}`);
}

console.log(`Done. ${generated} generated, ${skipped} already present.`);
