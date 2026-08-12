#!/usr/bin/env node
/*
 * Multiverse Mages — audition server.
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
 * A local tool for auditioning generated takes and choosing one per asset.
 *
 * It exists as a server rather than a static page for one reason that is not
 * negotiable: regenerating a take needs the generation API key, and a browser
 * that holds the key is a browser that leaks it. The key stays in this process
 * and never reaches the page.
 *
 * It also fixes two failures the folder-picker version had, both of which only
 * appear at real scale. Worktrees live under `.claude/`, which macOS hides from
 * every file dialog, so the picker could not reach the assets at all. And one
 * asset at a time with no jump is unusable past a couple of hundred assets.
 *
 * Nothing here ships in the game. No dependencies: `node:http` is enough.
 */

import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import process from 'node:process';

const ROOT = 'assets/candidates';
const SELECTIONS = 'assets/selections.json';
const PORT = Number(process.argv.find((a) => a.startsWith('--port='))?.slice(7) ?? 8123);
const KEY = process.env.ELEVENLABS_API_KEY ?? '';

const MIME = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };

/** Every asset on disk, with its takes, newest scan each request. */
function scan() {
  if (!existsSync(ROOT)) return [];
  return readdirSync(ROOT)
    .filter((n) => { try { return statSync(`${ROOT}/${n}`).isDirectory(); } catch { return false; } })
    .map((id) => ({
      id,
      takes: readdirSync(`${ROOT}/${id}`).filter((f) => /\.(mp3|wav|ogg)$/u.test(f)).sort(),
    }))
    .filter((a) => a.takes.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The text or prompt behind each asset, so you can read what you are hearing.
 *
 * Auditioning a bark without its line is guesswork — you cannot tell a flat
 * read from a line that was never funny.
 */
function context() {
  const out = {};
  try {
    for (const cue of JSON.parse(readFileSync('packages/content/data/audio/audio-cue.json', 'utf8'))) {
      out[cue.id] = { kind: 'cue', text: cue.prompt, note: cue.post, meta: `${cue.kind} · ${cue.band} · ${cue.grid} · §${cue.source}` };
    }
  } catch { /* cues are optional context */ }
  try {
    for (const bank of JSON.parse(readFileSync('packages/content/data/audio/voice-line.json', 'utf8'))) {
      for (const line of bank.lines) {
        out[line.id] = {
          kind: 'line', text: line.text, note: bank.voicePrompt,
          meta: `${bank.speaker} · ${line.tier}${line.about ? ` · about ${line.about}` : ''}`,
        };
      }
    }
  } catch { /* lines are optional context */ }
  return out;
}

const readSelections = () => (existsSync(SELECTIONS) ? JSON.parse(readFileSync(SELECTIONS, 'utf8')) : {});

function body(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
  });
}

const json = (res, code, value) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(value));
};

/** Adds takes to one asset by re-running the generator above its current count. */
function regenerate(assetId, extra) {
  return new Promise((resolve) => {
    if (!KEY) { resolve({ ok: false, error: 'ELEVENLABS_API_KEY is not set in the server process' }); return; }
    if (!/^[a-z0-9-]+$/u.test(assetId)) { resolve({ ok: false, error: 'bad asset id' }); return; }
    const have = existsSync(`${ROOT}/${assetId}`)
      ? readdirSync(`${ROOT}/${assetId}`).filter((f) => /take(\d+)\./u.test(f))
          .reduce((m, f) => Math.max(m, Number(/take(\d+)\./u.exec(f)?.[1] ?? 0)), 0)
      : 0;
    // The generator skips takes already on disk, so asking for a higher count
    // appends rather than replacing — a chosen take is never destroyed.
    const target = have + extra;
    const child = spawn('node', ['scripts/generate-audio.mjs', `--only=${assetId}`, `--takes=${target}`], {
      env: { ...process.env, ELEVENLABS_API_KEY: KEY },
    });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve(code === 0 ? { ok: true, from: have, to: target } : { ok: false, error: err.slice(0, 400) }));
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = decodeURIComponent(url.pathname);

  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync('tools/audition/index.html'));
    return;
  }
  // The page imports the same pure merge module the tests cover, so the tool's
  // logic and the tested logic stay the same code. It is a leaf module with no
  // imports of its own — never serve dist/index.js here, which pulls in the
  // filesystem loader and dies in a browser.
  if (path === '/packages/content/dist/audio-selection-merge.js') {
    const file = 'packages/content/dist/audio-selection-merge.js';
    if (!existsSync(file)) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('run `npm run typecheck` first — dist/ is built, not committed');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end(readFileSync(file));
    return;
  }
  if (path === '/api/assets') { json(res, 200, { assets: scan(), context: context(), selections: readSelections() }); return; }
  if (path === '/api/select' && req.method === 'POST') {
    const { assetId, take } = await body(req);
    const sel = readSelections();
    if (take === null) delete sel[assetId]; else sel[assetId] = take;
    writeFileSync(SELECTIONS, `${JSON.stringify(sel, null, 2)}\n`);
    json(res, 200, { ok: true, chosen: Object.keys(sel).length });
    return;
  }
  if (path === '/api/regen' && req.method === 'POST') {
    const { assetId, extra } = await body(req);
    json(res, 200, await regenerate(assetId, Math.min(Number(extra) || 4, 8)));
    return;
  }
  if (path.startsWith('/audio/')) {
    const rel = path.slice('/audio/'.length);
    if (rel.includes('..')) { res.writeHead(400); res.end(); return; }
    const file = `${ROOT}/${rel}`;
    if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[rel.slice(rel.lastIndexOf('.'))] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(404); res.end('not found');
}).listen(PORT, () => {
  const assets = scan();
  console.log(`audition server: http://localhost:${PORT}`);
  console.log(`  ${assets.length} assets, ${assets.reduce((n, a) => n + a.takes.length, 0)} takes`);
  console.log(`  regeneration ${KEY ? 'enabled' : 'DISABLED — set ELEVENLABS_API_KEY to enable'}`);
});
