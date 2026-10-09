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
  GOD_ACTION,
  OBSERVATION_BLOCKS,
  OBSERVATION_LAYOUT_DIGEST,
  createSession,
} from '../packages/agent-api/dist/index.js';
import {
  SANDBOX_CHEAT,
  SANDBOX_CLAIMANTS,
  SANDBOX_CLAIMANT_KIND,
  SANDBOX_MATERIAL_KINDS,
  SANDBOX_SATISFY_FLOOR,
  normalizeSandbox,
  referenceContent,
  referenceScenario,
} from '../packages/scenario/dist/index.js';

import { frameDocument } from './lib/frame-document.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const PORT = Number(arg('port', '8300'));
const DEFAULT_SEED = Number(arg('seed', '20260813'));
const DEFAULT_CAP = Number(arg('ticks', '100000'));
/**
 * Ticks the universe runs before anyone can look at it. `--warm 0` for none.
 *
 * **Tick 0 is not a playable position, and pretending otherwise wastes the first
 * minute of every session.** The god starts with no favor, `mask.ts` folds
 * affordability into the same bit as legality, and measured on the reference
 * scenario exactly **one** of sixteen actions is legal at tick 0 — the no-op.
 * Twelve are legal by tick 10 and thirteen by tick 25. So the run opens on a
 * world that has already been going a while, the way a god arriving at a
 * universe would.
 *
 * These are **real ticks in the real run**: they are on the spine, they are in
 * the action log, and the control replays them like any others. Nothing is
 * skipped or fabricated to make the opening screen look better.
 */
const WARM = Math.max(0, Math.min(2000, Number(arg('warm', '40'))));

/**
 * Whether the cheat routes exist at all. `npm run play -- --sandbox`.
 *
 * **Off by default, and off means the route is a 403, not a no-op.** A cheat
 * endpoint that quietly did nothing would be the worst of both: an operator
 * would believe a grant landed, and the run would be honest while the screen
 * said otherwise. So the flag gates the write route and `GET /live/sandbox`
 * reports `enabled: false` so the console can say why the panel is inert.
 *
 * It is a flag rather than always-on because a person can leave this server
 * running for hours and the whole value of the layer depends on nobody being
 * able to cheat a run they later quote. Turning it on is a deliberate act with
 * a visible consequence — the banner, the scenario id, the brand in the bytes.
 */
const SANDBOX = process.argv.includes('--sandbox');

/* ------------------------------------------------------------------ the run */

/**
 * The content and the registry are built once. `referenceScenario` is rebuilt
 * per run because `reset()` re-seeds an episode but the scenario carries the
 * catalogue and the portal targets the session was constructed with.
 */
const content = referenceContent();
const { encodeFrame, header, declaredCheats } = frameDocument(content, 'scripts/play-server.mjs');

const observeInto = (r) => {
  r.frames.push(encodeFrame(r.session, { godReport: r.godReport }));
};

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

/**
 * A run, optionally cheated.
 *
 * The cheat sheet belongs to **the run**, not to a moment in it, and that is a
 * deliberate restriction rather than a shortcut. Two reasons, and the second is
 * the one that would have bitten:
 *
 * 1. Every founding cheat is a *starting position*, which is the only place a
 *    scenario is allowed to write one. Applying a grant to a running episode
 *    would mean reaching past `AgentSession` into the state it owns.
 * 2. {@link controlExperiment} answers *"and what if you had not?"* by replaying
 *    this run's action log into fresh sessions. A cheat applied mid-run is not
 *    in that log, so both control arms would silently diverge from the run they
 *    claim to be about — a checker answering about the wrong input, which is a
 *    shape this repository has found five of. Rebuilding the run instead keeps
 *    the control exact: `fresh()` builds the scenario from the same sheet.
 *
 * So `POST /live/sandbox` starts a new universe. It says so, and the response
 * carries the new provenance.
 */
function newRun(seed, cap, sandbox = null) {
  const { scenario, sandbox: sheet, lastGodReport } = referenceScenario(content, {
    raids: true,
    ...(sandbox === null ? {} : { sandbox }),
  });
  const session = createSession({ scenario, strategyId: 'play-server' });
  session.reset(seed, { worldTickCap: cap });
  return {
    seed,
    cap,
    session,
    sandbox,
    sheet: sheet ?? null,
    godReport: lastGodReport,
    frames: [],
    log: [],
    startedAt: Date.now(),
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
    // The same sheet, deliberately. A control built without it would compare
    // the player's cheated universe against an honest one and report the whole
    // difference as the action's doing.
    const { scenario } = referenceScenario(content, {
      raids: true,
      ...(r.sandbox === null ? {} : { sandbox: r.sandbox }),
    });
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
const toAction = (body, actionSpaceSize) => {
  const kind = Number(body?.kind);
  // The bound is the session's, not a literal. `w109/alliances` took the action
  // space from 16 to 17, and a hardcoded 16 made `inviteScholar` a dead button:
  // the mask reported it legal, the console offered it, and this returned 400.
  if (!Number.isInteger(kind) || kind < 0 || kind >= actionSpaceSize) return null;
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
    res.writeHead(302, { location: '/ui/app/' });
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
    const action = toAction(body, run.session.actionSpaceSize);
    if (action === null) {
      json(res, 400, { error: 'body must be {kind:int within the session action space, params:int[]}' });
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
    const action = toAction(body, run.session.actionSpaceSize);
    if (action === null) {
      json(res, 400, { error: 'body must be {kind:int within the session action space, params:int[]}' });
      return;
    }
    const settle = Math.max(0, Math.min(200, Number(body?.settle ?? 30)));
    json(res, 200, controlExperiment(run, action, settle));
    return;
  }

  if (route === '/live/sandbox' && req.method === 'GET') {
    json(res, 200, {
      enabled: SANDBOX,
      // Derived from the component's field list, never listed here: three kinds
      // today, seven on the material-economy branch, and a console that spelled
      // them out would offer three of seven with no error anywhere.
      materialKinds: SANDBOX_MATERIAL_KINDS,
      claimants: SANDBOX_CLAIMANTS,
      claimantKind: SANDBOX_CLAIMANT_KIND,
      cheatBits: SANDBOX_CHEAT,
      satisfyFloor: SANDBOX_SATISFY_FLOOR,
      active: run.sandbox,
      digest: run.sheet?.digest ?? null,
      cheats: declaredCheats(run.sandbox),
      ...(SANDBOX
        ? {}
        : {
            why: 'Start the server with --sandbox to enable the cheat routes. Off is not a no-op: this route refuses rather than pretending.',
          }),
    });
    return;
  }

  if (route === '/live/sandbox' && req.method === 'POST') {
    if (!SANDBOX) {
      json(res, 403, {
        error:
          'The sandbox is off. Restart with `npm run play -- --sandbox`. This refuses rather than ' +
          'silently doing nothing, because an operator who believed a grant landed on an honest ' +
          'run is the failure the whole layer exists to prevent.',
      });
      return;
    }
    const body = await readBody(req);
    if (body === null || typeof body !== 'object') {
      json(res, 400, { error: 'body must be JSON' });
      return;
    }
    const spec = body.spec ?? {};
    let sheet;
    try {
      // Validated before anything is rebuilt, so a typo'd material kind is a 400
      // naming the kinds that exist rather than a universe that quietly ignored
      // half the request.
      sheet = normalizeSandbox(spec);
    } catch (err) {
      json(res, 400, { error: String(err?.message ?? err) });
      return;
    }
    const seed = Number.isInteger(Number(body.seed)) ? Number(body.seed) : run.seed;
    const cap = Math.max(1, Math.min(100000, Number(body.ticks ?? run.cap)));
    const warm = Math.max(0, Math.min(2000, Number(body.warm ?? WARM)));
    run = newRun(seed, cap, spec);
    observeInto(run);
    for (let i = 0; i < warm; i += 1) tick(run, { kind: GOD_ACTION.noop });
    process.stderr.write(
      `  SANDBOX: a new universe, seed ${seed}, cheats [${declaredCheats(spec).join(', ')}], ` +
        `digest ${sheet.digest}. Every run from here is branded.\n`,
    );
    json(res, 200, {
      restarted: true,
      note: 'A cheat sheet is a starting position, so this is a NEW universe at the same seed — the previous run is gone, not converted.',
      ...header(run),
      frames: run.frames,
    });
    return;
  }

  if (route === '/live/reset' && req.method === 'POST') {
    const body = await readBody(req);
    const seed = Number.isInteger(Number(body?.seed)) ? Number(body.seed) : DEFAULT_SEED;
    const cap = Math.max(1, Math.min(100000, Number(body?.ticks ?? DEFAULT_CAP)));
    // A reset **keeps the cheat sheet** unless the caller clears it explicitly.
    // The alternative — a reset that quietly returns to an honest universe —
    // would let a person cheat, reset, and take a measurement believing the two
    // runs were comparable. `{"sandbox": null}` is how you leave the sandbox,
    // and it is a new universe when you do.
    const sheet = body?.sandbox === null ? null : run.sandbox;
    run = newRun(seed, cap, sheet);
    observeInto(run);
    // A restart that dropped the player back on the unplayable tick 0 would be a
    // worse button than no button.
    const warm = Math.max(0, Math.min(2000, Number(body?.warm ?? WARM)));
    for (let i = 0; i < warm; i += 1) tick(run, { kind: GOD_ACTION.noop });

    // Apply initial ruleset: submit forbids one per tick with noops between
    // to let favor regenerate. Each forbid-technique costs 8192, forbid-form
    // costs 4096 — the god starts with ~40 and needs warmup to afford them.
    const forbidT = Array.isArray(body?.forbidTechniques) ? body.forbidTechniques : [];
    const forbidF = Array.isArray(body?.forbidForms) ? body.forbidForms : [];
    for (const idx of forbidT) {
      // Advance enough ticks to regenerate favor for one forbid-technique (8192)
      for (let i = 0; i < 80; i += 1) tick(run, { kind: GOD_ACTION.noop });
      tick(run, { kind: GOD_ACTION.forbidTechnique, params: [Number(idx)] });
    }
    for (const idx of forbidF) {
      // Advance enough ticks to regenerate favor for one forbid-form (4096)
      for (let i = 0; i < 40; i += 1) tick(run, { kind: GOD_ACTION.noop });
      tick(run, { kind: GOD_ACTION.forbidForm, params: [Number(idx)] });
    }

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
for (let i = 0; i < WARM; i += 1) tick(run, { kind: GOD_ACTION.noop });

server.listen(PORT, () => {
  const at = run.frames.length - 1;
  const legal = run.frames[at].mask.reduce((n, m) => n + m, 0);
  process.stderr.write(
    `\n  Multiverse Mages — a live universe, seed ${run.seed}, cap ${run.cap} ticks.\n\n` +
      `    http://localhost:${PORT}/\n\n` +
      `  ${run.frames[at].obs.length} observation slots, layout ${OBSERVATION_LAYOUT_DIGEST.slice(0, 12)}…\n` +
      `  Opened at tick ${at}${WARM > 0 ? ` — it ran ${WARM} ticks on its own first, because tick 0 is not a playable position` : ''}.\n` +
      // The session's own size, not a literal. This is the second half of the
      // bug #195 fixed in `toAction`: `inviteScholar` widened the space from 16
      // to 17, the submit path was corrected, and this banner was not — so the
      // first thing the operator reads on startup undercounts the action space
      // by one and can never say more than "16 of 16".
      `  ${legal} of ${run.session.actionSpaceSize} actions legal right now. ` +
      'Advance time and more open up.\n' +
      (SANDBOX
        ? '  SANDBOX ROUTES ARE ON. Any run you cheat is branded in its snapshot, refuses to\n' +
          '  load into an honest build, and is refused by the balance harness. Do not quote it.\n'
        : '') +
      '  Ctrl-C to end the universe.\n\n',
  );
});

export { controlExperiment, header, newRun, observeInto, tick };
