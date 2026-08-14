#!/usr/bin/env node
/*
 * Multiverse Mages — the character forge.
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
 * Create and edit named mages: identity, voice, lines, portrait.
 *
 * A server rather than a static page for the same reason the audition tool is
 * one — generating anything needs API keys, and a browser holding a key is a
 * browser leaking it. Both keys stay in this process.
 *
 * The forge's real job is **staying current**. Every generated asset stores a
 * hash of the inputs that produced it, so when a character's fields change — or
 * when a new per-mage detail is added to `ASSET_INPUTS` — the asset reports
 * STALE and can be regenerated. Nobody has to remember what was affected.
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';

import { assetInputHash, assetKinds, isStale } from '../packages/content/dist/character.js';

const CHARACTERS = 'packages/content/data/character/character.json';
const VOICE_LINES = 'packages/content/data/audio/voice-line.json';
const SPECIES = 'packages/content/data/species.json';
const PORTRAITS = 'assets/portraits';
const PORT = Number(process.argv.find((a) => a.startsWith('--port='))?.slice(7) ?? 8155);

const EL_KEY = process.env.ELEVENLABS_API_KEY ?? '';
const PX_KEY = process.env.PIXELLAB_API_KEY ?? '';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const save = (chars) => writeFileSync(CHARACTERS, `${JSON.stringify(chars, null, 2)}\n`);
const redact = (text) => [EL_KEY, PX_KEY].filter(Boolean).reduce((t, k) => t.split(k).join('[redacted]'), text);

const json = (res, code, value) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(value));
};
const body = (req) => new Promise((resolve) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
});

/** Everything the editor needs: characters, their staleness, and the pools. */
function state() {
  const characters = read(CHARACTERS);
  const banks = read(VOICE_LINES);
  const species = read(SPECIES).map((s) => ({ id: s.id, name: s.name }));
  // The voice pool per species: the species' own cast voice plus any voice
  // already assigned to one of its characters. New ones join by being used.
  const pool = {};
  for (const s of species) {
    const bank = banks.find((b) => b.speaker === s.id && b.speakerKind === 'species');
    pool[s.id] = [...new Set([
      ...(bank ? [bank.voiceId] : []),
      ...characters.filter((c) => c.species === s.id).map((c) => c.voiceId),
    ])];
  }
  return {
    characters: characters.map((c) => ({
      ...c,
      stale: assetKinds().filter((k) => isStale(c, k)),
    })),
    species,
    pool,
    lines: Object.fromEntries(species.map((s) => {
      const bank = banks.find((b) => b.speaker === s.id && b.speakerKind === 'species');
      return [s.id, bank ? bank.lines.map((l) => ({ id: l.id, tier: l.tier, text: l.text })) : []];
    })),
    keys: { elevenlabs: Boolean(EL_KEY), pixellab: Boolean(PX_KEY) },
  };
}

/** Designs three candidate voices from a description; the caller picks one. */
async function designVoice(description, sample) {
  if (!EL_KEY) return { ok: false, error: 'ELEVENLABS_API_KEY is not set in the forge process' };
  // The API requires at least 100 characters of preview text, so short barks
  // must be padded with more of the same character's lines rather than repeated.
  if (sample.length < 100) return { ok: false, error: 'preview text must be at least 100 characters' };
  const res = await fetch('https://api.elevenlabs.io/v1/text-to-voice/design', {
    method: 'POST',
    headers: { 'xi-api-key': EL_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ voice_description: description, text: sample }),
  });
  if (!res.ok) return { ok: false, error: redact(await res.text()).slice(0, 300) };
  const data = await res.json();
  return {
    ok: true,
    previews: (data.previews ?? []).map((p) => ({
      generatedVoiceId: p.generated_voice_id,
      audio: p.audio_base_64,
    })),
  };
}

/** Keeps a designed voice, which is what turns it into a usable voice id. */
async function keepVoice(generatedVoiceId, name, description) {
  if (!EL_KEY) return { ok: false, error: 'ELEVENLABS_API_KEY is not set' };
  const res = await fetch('https://api.elevenlabs.io/v1/text-to-voice', {
    method: 'POST',
    headers: { 'xi-api-key': EL_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ voice_name: name, voice_description: description, generated_voice_id: generatedVoiceId }),
  });
  if (!res.ok) return { ok: false, error: redact(await res.text()).slice(0, 300) };
  const data = await res.json();
  return { ok: true, voiceId: data.voice_id };
}

/** Confirms a voice id actually synthesises, which a lookup cannot tell you. */
async function probeVoice(voiceId) {
  if (!EL_KEY) return { ok: false, error: 'ELEVENLABS_API_KEY is not set' };
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': EL_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Three copies. One to use, one to lose, and one nobody touches.', model_id: 'eleven_multilingual_v2' }),
  });
  // A shared-library voice is absent from /v1/voices and synthesises perfectly,
  // so the endpoint that matters is this one.
  return res.ok ? { ok: true } : { ok: false, error: redact(await res.text()).slice(0, 200) };
}

/** Generates a portrait. Costs PixelLab credits, so it is never automatic. */
async function makePortrait(character) {
  if (!PX_KEY) return { ok: false, error: 'PIXELLAB_API_KEY is not set in the forge process' };
  // Two lessons from the first generated portrait, which came back as Santa
  // Claus. The age bracket was joined with a comma into "middle, aged" — two
  // useless tokens rather than one — and the character's `note` is flavour
  // prose written for a reader ("keeps blank requisition forms in a coat
  // pocket"), which the generator read as costume and combined with "dwarf"
  // and "beard" into Christmas. A generator needs a visual description, and
  // that is a different field from the one a person reads.
  const AGE = { young: 'young', middle: 'middle-aged', old: 'elderly' };
  const desc = [
    'fantasy character portrait, head and shoulders, facing viewer',
    `${AGE[character.ageBracket ?? 'middle']} ${character.species}`,
    character.look ?? '',
    'scholarly robes, muted earth tones, neutral dark background',
  ].filter(Boolean).join(', ');
  const negative = 'santa claus, christmas, red suit, red hat, holiday, snow, gift, modern clothing, text, watermark';
  const res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PX_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      description: desc,
      negative_description: negative,
      image_size: { width: 64, height: 64 },
    }),
  });
  if (!res.ok) return { ok: false, error: redact(await res.text()).slice(0, 300) };
  const data = await res.json();
  const b64 = data.image?.base64 ?? data.image_base64;
  if (!b64) return { ok: false, error: 'no image in response' };
  const path = `${PORTRAITS}/${character.id}.png`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(b64, 'base64'));
  return { ok: true, path };
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = decodeURIComponent(url.pathname);

  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync('tools/character-forge/index.html'));
    return;
  }
  if (path === '/api/state') { json(res, 200, state()); return; }

  if (path === '/api/save' && req.method === 'POST') {
    const incoming = await body(req);
    const characters = read(CHARACTERS);
    const at = characters.findIndex((c) => c.id === incoming.id);
    const record = { ...incoming, assets: incoming.assets ?? {} };
    if (at >= 0) characters[at] = record; else characters.push(record);
    save(characters);
    json(res, 200, { ok: true });
    return;
  }
  if (path === '/api/delete' && req.method === 'POST') {
    const { id } = await body(req);
    save(read(CHARACTERS).filter((c) => c.id !== id));
    json(res, 200, { ok: true });
    return;
  }
  if (path === '/api/voice/design' && req.method === 'POST') {
    const { description, sample } = await body(req);
    json(res, 200, await designVoice(description ?? '', sample ?? ''));
    return;
  }
  if (path === '/api/voice/keep' && req.method === 'POST') {
    const { generatedVoiceId, name, description } = await body(req);
    json(res, 200, await keepVoice(generatedVoiceId, name ?? 'Multiverse Mages voice', description ?? ''));
    return;
  }
  if (path === '/api/voice/probe' && req.method === 'POST') {
    const { voiceId } = await body(req);
    json(res, 200, await probeVoice(voiceId));
    return;
  }
  if (path === '/api/portrait' && req.method === 'POST') {
    const { id } = await body(req);
    const characters = read(CHARACTERS);
    const character = characters.find((c) => c.id === id);
    if (!character) { json(res, 404, { ok: false, error: 'no such character' }); return; }
    const made = await makePortrait(character);
    if (made.ok) {
      character.assets = { ...character.assets, portrait: { path: made.path, inputHash: assetInputHash(character, 'portrait') } };
      save(characters);
    }
    json(res, 200, made);
    return;
  }
  if (path.startsWith('/portrait/')) {
    const file = `${PORTRAITS}/${path.slice('/portrait/'.length)}`;
    if (path.includes('..') || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'image/png' });
    createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(404); res.end('not found');
}).listen(PORT, () => {
  const s = state();
  console.log(`character forge: http://localhost:${PORT}`);
  console.log(`  ${s.characters.length} characters, ${s.characters.filter((c) => c.stale.length).length} with stale assets`);
  console.log(`  elevenlabs ${EL_KEY ? 'ready' : 'MISSING'} · pixellab ${PX_KEY ? 'ready' : 'MISSING'}`);
});
