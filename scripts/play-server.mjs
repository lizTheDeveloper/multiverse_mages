#!/usr/bin/env node
/*
 * Multiverse Mages — the local play server. Dev tooling, not the core.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the GNU
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * `npm run play` — one command, a browser, and a universe that is actually
 * running.
 *
 *     npm run play                  # http://localhost:8300/
 *     npm run play -- --port 9001 --seed 7 --ticks 4000
 *
 * ## What this is, and what it deliberately is not
 *
 * Every page under `ui/` reads `ui/session.json`, a recording. A recording
 * cannot be *acted on*: the whole point of the god's console is that a person
 * presses something and the world is different afterwards. This holds one live
 * `AgentSession` in memory — built exactly the way `scripts/record-session.mjs`
 * builds one, from `referenceScenario` over `referenceContent` — and serves it
 * over HTTP in **the same document shape the recording has**, so the pages that
 * already parse a recording parse this without learning a second format.
 *
 * ## Why not `@mm/server`
 *
 * `packages/server` is the *authoritative multiplayer* server: match lifecycle,
 * admission of several clients' batches into one canonical ordering, snapshot
 * codec, desync detection by hash. Every one of those exists to solve a problem
 * a single local player does not have — there is one action source, one clock,
 * and no peer to desync from. Using `Match` here would mean standing up a
 * two-party protocol to talk to itself. It is the right thing to reuse when
 * `pvp-server` ships, and a detour tonight.
 *
 * ## The boundary, stated
 *
 * This file is **dev tooling**. It reads a wall clock (nothing does — the client
 * paces itself), it is not imported by any package, and it lives in `scripts/`
 * for the same reason `record-session.mjs` does. It drives `AgentSession` and
 * never reaches past it into `sim-core`. The simulation is untouched: this
 * calls `submit()` and reads `observe()`, and that is the whole of its contact
 * with the rules.
 *
 * ## The recorder's `{ id: }` bug, and why this file does not copy it
 *
 * `record-session.mjs` submits `{ id: GOD_ACTION.noop }`. `admit()` reads
 * `action.kind`, so **every one of those 400 ticks is rejected
 * `unknown-action`** and increments `noteIllegalAction()`. Measured: 40 ticks of
 * `{ id: 0 }` gives snapshot `07466680da25d689` and `illegalActionCount 40`;
 * 40 ticks of `{ kind: 0 }` gives `70664c0580e14131` and `0`. This file submits
 * `{ kind }`, which means **a live run at seed S is not the same episode as the
 * recording at seed S.** That is the recorder's defect to fix, not this one's to
 * reproduce — fixing it moves `ui/session.json` and its golden, which is a
 * separate change.
 */

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  CANDIDATE_SLOTS,
  GOD_ACTION,
  OBSERVATION_BLOCKS,
  OBSERVATION_DESCRIPTORS,
  OBSERVATION_LAYOUT_DIGEST,
  OBSERVATION_SCHEMA_VERSION,
  createSession,
} from '../packages/agent-api/dist/index.js';
import { referenceContent, referenceScenario } from '../packages/scenario/dist/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const PORT = Number(arg('port', '8300'));
const DEFAULT_SEED = Number(arg('seed', '20260813'));
const DEFAULT_CAP = Number(arg('ticks', '4000'));

/* ------------------------------------------------------------------ the run */

/**
 * The content and the registry are built once. `referenceScenario` is rebuilt
 * per run because `reset()` re-seeds an episode but the scenario carries the
 * catalogue and the portal targets the session was constructed with.
 */
const content = referenceContent();
const { registry } = content;

/** The one non-invertible-rule guard `record-session.mjs` documents at length. */
const INVERTIBLE = new Set(['ratio', 'flag']);
const nonInvertible = OBSERVATION_DESCRIPTORS.map((d, i) => [i, d]).filter(
  ([, d]) => !INVERTIBLE.has(d.rule),
);
if (nonInvertible.length > 0) {
  throw new Error(
    `Slots ${nonInvertible.map(([i]) => i).join(', ')} use a normalization rule this server ` +
      'cannot invert, so the integers it publishes would be plausible and wrong.',
  );
}

/**
 * A run: the session, every frame observed so far, and **the log of what was
 * submitted**.
 *
 * The log is what makes {@link controlExperiment} possible. A candidate slot
 * index resolves against the state of the tick it was submitted on, so replaying
 * the same slot indices from the same seed reproduces the same admitted actions
 * — which is what lets the server answer *"and what would have happened if you
 * had not?"* without ever mutating the run the player is in.
 */
let run = null;

function newRun(seed, cap) {
  const { scenario } = referenceScenario(content, { raids: true });
  const session = createSession({ scenario, strategyId: 'play-server' });
  session.reset(seed, { worldTickCap: cap });
  return { seed, cap, session, frames: [], log: [], startedAt: Date.now() };
}

/** One tick, encoded the way `record-session.mjs` encodes one. */
function encodeFrame(session) {
  const normalized = session.observe();
  const mask = session.legalActions();
  const candidates = session.candidates();
  const sat = [];
  const obs = [];
  for (let i = 0; i < normalized.length; i += 1) {
    const v = normalized[i];
    const d = OBSERVATION_DESCRIPTORS[i];
    if (v >= 1 && d.rule === 'ratio') sat.push(i);
    obs.push(Math.round(v * d.divisor));
  }
  return {
    obs,
    sat,
    mask: [...mask],
    candidates: Object.fromEntries(
      [...candidates].map(([action, list]) => [action, [...(list ?? [])]]),
    ),
    status: session.status(),
  };
}

const observeInto = (r) => {
  r.frames.push(encodeFrame(r.session));
};

/**
 * The static half of the document: everything `ui/shared/session.js` reads that
 * is not a frame.
 *
 * Duplicated from `record-session.mjs` rather than extracted into a shared
 * module, deliberately. That script has a golden test that re-runs it, and
 * sharing code with it would make a change here a change to a fixture. The two
 * are held equivalent by `scripts/play-control.mjs --shape`, which builds a live
 * document and a recorded one and diffs their keys.
 */
function header(r) {
  return {
    provenance: {
      seed: r.seed,
      ticks: r.frames.length - 1,
      tickCap: r.cap,
      scenarioId: r.session.scenarioId,
      observationSchemaVersion: OBSERVATION_SCHEMA_VERSION,
      observationLayoutDigest: OBSERVATION_LAYOUT_DIGEST,
      actionSpaceSize: r.session.actionSpaceSize,
      snapshotHash: r.session.snapshotHash(),
      recordedBy: 'scripts/play-server.mjs',
      /** The one field a recording does not have. Views use it to say LIVE. */
      live: true,
    },
    layout: OBSERVATION_BLOCKS.map((b) => ({ name: b.name, offset: b.offset, size: b.size })),
    actions: Object.fromEntries(Object.entries(GOD_ACTION).map(([k, v]) => [v, k])),
    content: {
      techniques: registry.techniques.map(({ record: t }) => ({ bit: t.bit, id: t.id, name: t.name })),
      forms: registry.forms.map(({ record: f }) => ({ bit: f.bit, id: f.id, name: f.name })),
      cells: registry.cells.map(({ contentId, record: c }) => ({
        cellId: contentId,
        id: c.id,
        technique: c.technique,
        form: c.form,
      })),
      species: registry.species.map(({ contentId, record: s }) => ({
        speciesId: contentId,
        id: s.id,
        name: s.name,
      })),
      actionCosts: Object.fromEntries(
        registry.godCosts.map(({ record: g }) => [g.actionId, g.favorCost]),
      ),
      candidateSlots: { ...CANDIDATE_SLOTS },
      /**
       * The traditions, so the console can name action 13's parameter. Not in a
       * recording's content block; additive, and `session.js` reads it with `??`.
       */
      traditions: registry.traditions.map(({ contentId, record: t }) => ({
        traditionId: contentId,
        id: t.id,
        name: t.name ?? t.id,
      })),
    },
  };
}

/* ------------------------------------------------------------ playing a tick */

/** Advances one tick with one submission. Returns what the gate said. */
function tick(r, action) {
  if (r.session.status() !== 'running') {
    return { admitted: false, rejection: `episode-${r.session.status()}` };
  }
  const result = r.session.submit(action);
  r.log.push(action);
  observeInto(r);
  return {
    admitted: result.admitted,
    ...(result.rejection === undefined ? {} : { rejection: result.rejection }),
    status: result.status,
  };
}

/**
 * The honesty control: the same seed, the same log, one tick played two ways.
 *
 * Replays this run's whole action log into two fresh sessions, then gives one of
 * them `action` and the other a no-op, runs both `settle` further no-op ticks,
 * and reports the snapshot hashes and **which observation slots differ**.
 *
 * The two numbers answer different questions and both are worth having.
 * A differing hash proves the action reached the simulation. Differing
 * observation slots prove it reached something a player can *see*. Measured on
 * `main`, `assignRole` moves the hash and moves **zero** drawn slots — the
 * action is admitted, the world diverges, and no pane in the console changes.
 * That is a finding about the read path, not a broken control.
 *
 * **A refused action moves the hash too**, and that is not a bug in this: a
 * rejection calls `state.noteIllegalAction()`, and `illegalActionCount` is
 * inside the hashed snapshot. So the hash answers *"did the submission reach the
 * simulation"* and not *"did it do anything"*. The two questions are reported
 * separately for exactly that reason, and `admitted` is the one that separates
 * them.
 */
function controlExperiment(r, action, settle = 30) {
  const fresh = () => {
    const { scenario } = referenceScenario(content, { raids: true });
    const s = createSession({ scenario, strategyId: 'play-control' });
    s.reset(r.seed, { worldTickCap: r.cap });
    for (const a of r.log) s.submit(a);
    return s;
  };
  const withIt = fresh();
  const without = fresh();
  /* The third replay is the **null control**, and it is the difference between a
     checker and a checker you have reason to believe. It does exactly what
     `without` does, so it must come back byte-identical to it. If it ever does
     not, the replay is nondeterministic and every number below is noise — which
     is a third answer, not a quiet "yes". */
  const nul = fresh();
  const submission = withIt.submit(action);
  without.submit({ kind: GOD_ACTION.noop });
  nul.submit({ kind: GOD_ACTION.noop });
  for (let i = 0; i < settle; i += 1) {
    if (withIt.status() === 'running') withIt.submit({ kind: GOD_ACTION.noop });
    if (without.status() === 'running') without.submit({ kind: GOD_ACTION.noop });
    if (nul.status() === 'running') nul.submit({ kind: GOD_ACTION.noop });
  }
  const admitted = submission.admitted;
  const a = withIt.observe();
  const b = without.observe();
  const blockOf = (i) =>
    OBSERVATION_BLOCKS.find((x) => i >= x.offset && i < x.offset + x.size)?.name ?? 'unknown';
  const slots = [];
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) slots.push({ slot: i, block: blockOf(i) });
  }
  return {
    action,
    admitted,
    ...(submission.rejection === undefined ? {} : { rejection: submission.rejection }),
    atTick: r.log.length,
    settle,
    withHash: withIt.snapshotHash(),
    withoutHash: without.snapshotHash(),
    hashDiffers: withIt.snapshotHash() !== without.snapshotHash(),
    /**
     * `true` when the null replay matched its twin, which is what makes the row
     * above mean anything. `false` is *"do not believe this measurement"*.
     */
    nullControlHeld: nul.snapshotHash() === without.snapshotHash(),
    slotsDiffering: slots.length,
    slots: slots.slice(0, 40),
    blocks: [...new Set(slots.map((s) => s.block))],
  };
}

/* ---------------------------------------------------------------- the server */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const json = (res, code, body) => {
  const text = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(text);
};

const readBody = async (req) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
};

/** A submitted action, validated here so a typo is a 400 and not a stack trace. */
const toAction = (body) => {
  const kind = Number(body?.kind);
  if (!Number.isInteger(kind) || kind < 0 || kind >= 16) return null;
  const raw = Array.isArray(body?.params) ? body.params : [];
  const params = raw.map(Number);
  if (!params.every(Number.isInteger)) return null;
  return { kind, params };
};

const server = createServer((req, res) => {
  void handle(req, res).catch((err) => {
    json(res, 500, { error: String(err?.message ?? err) });
  });
});

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = url.pathname;

  if (route === '/') {
    res.writeHead(302, { location: '/ui/console/' });
    res.end();
    return;
  }

  /* ------------------------------------------------------------- live routes */

  if (route === '/live/session.json' && req.method === 'GET') {
    json(res, 200, { ...header(run), frames: run.frames });
    return;
  }

  if (route === '/live/frames' && req.method === 'GET') {
    // Incremental: a client that already holds N frames asks for the rest, so a
    // long run does not re-ship 4,000 frames on every button press.
    const since = Math.max(0, Number(url.searchParams.get('since') ?? '0'));
    json(res, 200, {
      provenance: header(run).provenance,
      from: Math.min(since, run.frames.length),
      frames: run.frames.slice(since),
    });
    return;
  }

  if (route === '/live/submit' && req.method === 'POST') {
    const body = await readBody(req);
    const action = toAction(body);
    if (action === null) {
      json(res, 400, { error: 'body must be {kind:int 0..15, params:int[]}' });
      return;
    }
    const from = run.frames.length;
    const outcome = tick(run, action);
    json(res, 200, { ...outcome, from, frames: run.frames.slice(from) });
    return;
  }

  if (route === '/live/advance' && req.method === 'POST') {
    const body = await readBody(req);
    // Capped so a fat-fingered 10,000 cannot wedge the event loop for a minute.
    const n = Math.max(1, Math.min(500, Number(body?.ticks ?? 1)));
    const from = run.frames.length;
    let last = { admitted: true, status: run.session.status() };
    for (let i = 0; i < n; i += 1) {
      if (run.session.status() !== 'running') break;
      last = tick(run, { kind: GOD_ACTION.noop });
    }
    json(res, 200, { ...last, from, frames: run.frames.slice(from) });
    return;
  }

  if (route === '/live/control' && req.method === 'POST') {
    const body = await readBody(req);
    const action = toAction(body);
    if (action === null) {
      json(res, 400, { error: 'body must be {kind:int 0..15, params:int[]}' });
      return;
    }
    const settle = Math.max(0, Math.min(200, Number(body?.settle ?? 30)));
    json(res, 200, controlExperiment(run, action, settle));
    return;
  }

  if (route === '/live/reset' && req.method === 'POST') {
    const body = await readBody(req);
    const seed = Number.isInteger(Number(body?.seed)) ? Number(body.seed) : DEFAULT_SEED;
    const cap = Math.max(1, Math.min(100000, Number(body?.ticks ?? DEFAULT_CAP)));
    run = newRun(seed, cap);
    observeInto(run);
    json(res, 200, { ...header(run), frames: run.frames });
    return;
  }

  /* ----------------------------------------------------------- static files */

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    json(res, 405, { error: `${req.method} is not a method this server has` });
    return;
  }

  // Resolve under the repo root and refuse anything that escapes it. `ui/` pages
  // import `../shared/session.js`, so the root has to be the repo and not `ui/`.
  const decoded = decodeURIComponent(route);
  let file = path.normalize(path.join(ROOT, decoded));
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
    json(res, 403, { error: 'outside the served root' });
    return;
  }
  if (decoded.endsWith('/')) file = path.join(file, 'index.html');

  try {
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      // A dev server that caches is a dev server that lies about your last edit.
      'cache-control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    json(res, 404, { error: `no file at ${decoded}` });
  }
}

run = newRun(DEFAULT_SEED, DEFAULT_CAP);
observeInto(run);

server.listen(PORT, () => {
  const legal = run.frames[0].mask.reduce((n, m) => n + m, 0);
  process.stderr.write(
    `\n  Multiverse Mages — a live universe, seed ${run.seed}, cap ${run.cap} ticks.\n\n` +
      `    http://localhost:${PORT}/\n\n` +
      `  ${run.frames[0].obs.length} observation slots, layout ${OBSERVATION_LAYOUT_DIGEST.slice(0, 12)}…\n` +
      `  ${legal} of 16 actions legal at tick 0. Advance time and more open up.\n` +
      '  Ctrl-C to end the universe.\n\n',
  );
});

export { controlExperiment, header, newRun, observeInto, tick };
