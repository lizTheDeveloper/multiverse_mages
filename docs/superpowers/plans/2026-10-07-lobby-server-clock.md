# Lobby with a Server Clock: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `mages.multiversegames.ai` runs the lobby, not `scripts/play-server.mjs`. Each player gets their own universe, built from the species, tradition and opening square they chose, and **the server keeps time**. No browser can advance, pause or reset a universe.

**Architecture:** `packages/lobby` becomes the server. `UniverseHost` builds the chosen starting position and owns a frame spine. `Lobby.tickAll()` steps every live universe once per world tick, driven by an interval in the bin and by direct calls in tests. Per-universe routes (`/u/<id>/live/*`) publish the **same document shape** `ui/shared/session.js` already reads, so `liveControls` works unchanged with `base = /u/<id>`. The frame encoder moves out of `play-server.mjs` into one shared module that both servers import.

**Tech Stack:** TypeScript (lobby), plain ESM `.mjs` (scripts, bin), vitest, Node 22 `http`. No new dependencies.

**Spec:**
- `openspec/changes/pvp-server/specs/authoritative-lockstep/spec.md`: "The wall clock is confined to pacing and admission" (l.97) and "Real-time pacing is scoped per layer" (l.115).
- `packages/server/src/clock.ts`: `Clock`, `manualClock`, `DEFAULT_PACING.world.tickIntervalMs = 1000`.
- `docs/design/vision.md` §8b and §13: bubbles, tiers, rejoin.

**Evidence this plan argues from (playtest, 2026-10-05, `origin/main` @ `4db6666c`):**
- Hosted provenance says `recordedBy: scripts/play-server.mjs`, and `/api/bubbles` returns 404. The lobby isn't deployed.
- `play-server.mjs` has no timer; browsers drive time. With one tab open the universe moved 108 ticks in 20 s. With the tab closed it moved 0 ticks in 25 s.
- Begin calls `/live/reset`, which replaces the one shared universe for every visitor.
- Begin sends forbids only. Species and tradition are dropped (`ui/app/index.html` "SETUP SCREEN" section). The server pays for each forbid with 80 or 40 noop ticks, so the game opens around year 63.
- `UniverseHost` seeds with `Date.now()`, which is above `0xffff_ffff`, so `session.reset` throws `RangeError` on every `/api/create` that names no seed.
- `play-server.mjs:432` names `scripts/play-control.mjs --shape` as its shape guard. That file doesn't exist.

## Global Constraints

- Every new source file carries the AGPL-3.0-or-later header with copyright **Ann Kelner**, copied from `packages/lobby/src/lobby.ts:1-5`.
- No new runtime dependency. The lobby uses `node:` built-ins and `@mm/*` only.
- Wall-clock reads go through an injected `Clock` (`@mm/server`). No `Date.now()` in `packages/lobby/src`. The bin passes `systemClock`.
- The sim core is not touched: no change to `sim-core`, `state`, `rules-*`, `coordination`, `agent-api` or `scenario` src. Every golden and baseline must stay byte-identical. **Never run `npm run goldens:regen`.**
- The gate is `npm run verify`, run in the worktree after `npm ci`.
- Work in `.claude/worktrees/playtest` on branch `lobby-server-clock`. Never use `git stash`. Commits are authored by `lizTheDeveloper`.
- This repo is public. No hostnames beyond the SSH alias `games`, no IPs, no tokens in commits.
- World pacing is **1 tick per 1000 ms** (`DEFAULT_PACING.world.tickIntervalMs`) and the default tick cap is **4000**.

## Review Focus

1. **Reload mid-game.** The page must rejoin the same universe through `localStorage`, not send you to setup. Owned by Task 5, step 6.
2. **Server restart.** Universes live in memory, so a stored id then 404s. The page must return to setup and say why, not show an error wall. Owned by Task 3 (404 test) and Task 5 (`?gone=1`).
3. **Two submissions in one tick** (two tabs, or a double click). The second gets `409` naming the queued action, and neither tab advances time. Owned by Task 3.
4. **A universe reaches its cap or dies.** It stops ticking, `frames?since=` returns nothing new, the end overlay shows, and it is evicted after `evictAfterMs`. Owned by Task 3.
5. **Memory.** Each universe holds its whole frame spine. A create above `maxUniverses` must answer `503` with a message, not take the box down. Task 3 tests it, and Task 6 measures heap at 4000 ticks to set the default.

## Not in this plan (found, deliberately left)

- Cross-universe raids through bubbles. `Bubble` groups universes and nothing else; portals still target `rival-universe`.
- Persistence across restarts (`universe-persistence/spec.md`).
- The 30 MB `session.json` on a late rejoin.
- Dark-on-teal text on selected tradition cards and form toggles.
- The research stall: 21 nodes out of 36 for 20 years in a 2×2 opening.
- `packages/bubble` and `packages/universe-host` duplicate the lobby's classes.

---

### Task 1: One frame encoder, shared by both servers

**Files:**
- Create: `scripts/lib/frame-document.mjs`
- Create: `scripts/lib/frame-document.d.mts`
- Modify: `scripts/play-server.mjs` (import the module; delete the moved code; fix the `play-control.mjs` comment)
- Create: `packages/lobby/test/unit/frame-document.test.ts`
- Create: `packages/lobby/tsconfig.test.json`
- Modify: `tsconfig.json` (reference the new test project)

**Interfaces:**
- Produces: `frameDocument(content, recordedBy: string): { encodeFrame(session): Frame; header(run: FrameRun): Header }`, where `FrameRun = { seed, cap, session, frames, sandbox, sheet }`. This is exactly the `r` object `play-server.mjs` already passes to `header(r)`, so `sandbox`/`sheet` are `null` on an honest run.

- [ ] **Step 1: Write the failing shape test.** It compares the module's output against what `record-session.mjs` writes, because the recorder is the shape every `ui/` page was built against.

```ts
/*
 * Multiverse Mages — the lobby publishes the document shape every ui/ page reads.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { createSession } from '@mm/agent-api';
import { referenceContent, referenceScenario } from '@mm/scenario';
import { frameDocument } from '../../../../scripts/lib/frame-document.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const scratch = mkdtempSync(path.join(tmpdir(), 'mm-frame-doc-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const keys = (o: object) => Object.keys(o).sort();

describe('frameDocument', () => {
  it('builds the keys record-session.mjs builds, at every level a page reads', () => {
    const out = path.join(scratch, 'session.json');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'record-session.mjs'), '--out', out], {
      cwd: ROOT,
      stdio: 'pipe',
    });
    const recorded = JSON.parse(readFileSync(out, 'utf8'));

    const content = referenceContent();
    const session = createSession({ scenario: referenceScenario(content).scenario, strategyId: 't' });
    session.reset(7, { worldTickCap: 50 });
    const doc = frameDocument(content, 'test');
    const frame = doc.encodeFrame(session);
    const live = { ...doc.header({ seed: 7, cap: 50, session, frames: [frame], sandbox: null, sheet: null }), frames: [frame] };

    expect(keys(live)).toEqual(keys(recorded));
    expect(keys(live.content)).toEqual(expect.arrayContaining(keys(recorded.content)));
    expect(keys(live.frames[0])).toEqual(keys(recorded.frames[0]));
    expect(live.provenance.recordedBy).toBe('test');
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run packages/lobby/test/unit/frame-document.test.ts`. Expected: FAIL, `Cannot find module '../../../../scripts/lib/frame-document.mjs'`.

- [ ] **Step 3: Extract the module.** Move into `scripts/lib/frame-document.mjs`, **verbatim**, everything `play-server.mjs` uses to encode a frame or a header:
  - the `cellIdByStringId` / `nodeIdByStringId` / `internPrerequisites` tables
  - the `INVERTIBLE` / `nonInvertible` startup guard
  - `declaredCheats`, `encodeFrame`, `encodeAcademy`, `encodeCandidateDetail`, `header`
  - the imports they need, from `../../packages/*/dist/index.js` (one more `../` than in `play-server.mjs`)

  Wrap the module-level `content`/`registry` uses in a factory so the content is a parameter, not a global:

```js
export function frameDocument(content, recordedBy) {
  const { registry } = content;
  // ...moved tables and functions, unchanged except:
  //    header(r).provenance.recordedBy = recordedBy   (was the literal 'scripts/play-server.mjs')
  return { encodeFrame, header, declaredCheats };
}
```

  Then in `play-server.mjs`:

```js
import { frameDocument } from './lib/frame-document.mjs';
const { encodeFrame, header, declaredCheats } = frameDocument(content, 'scripts/play-server.mjs');
```

  Keep `observeInto`, `tick`, `controlExperiment` and the routes where they are. Replace the comment that cites `scripts/play-control.mjs --shape` with: `` Held equivalent to `record-session.mjs` by `packages/lobby/test/unit/frame-document.test.ts`. ``

- [ ] **Step 4: Add the type declaration.** `scripts/lib/frame-document.d.mts` (header as above):

```ts
import type { AgentSession } from '@mm/agent-api';
import type { ReferenceContent } from '@mm/scenario';

export interface FrameRun {
  readonly seed: number;
  readonly cap: number;
  readonly session: AgentSession;
  readonly frames: readonly unknown[];
  readonly sandbox: null;
  readonly sheet: null;
}
export interface FrameHeader {
  provenance: Record<string, unknown> & { recordedBy: string; ticks: number };
  layout: unknown;
  actions: unknown;
  content: Record<string, unknown>;
}
export interface FrameDocument {
  encodeFrame(session: AgentSession): Record<string, unknown>;
  header(run: FrameRun): FrameHeader;
  declaredCheats(spec: unknown): string[];
}
export function frameDocument(content: ReferenceContent, recordedBy: string): FrameDocument;
```

  `packages/lobby/tsconfig.test.json` is a copy of `packages/server/tsconfig.test.json` with `outDir` `../../.tsbuild/lobby-test`, `tsBuildInfoFile` `../../.tsbuild/lobby-test.tsbuildinfo`, and `references: [{ "path": "./tsconfig.json" }]`. Add `{ "path": "./packages/lobby/tsconfig.test.json" }` to the root `tsconfig.json` next to the lobby entry.

- [ ] **Step 5: Run.** `npx tsc --build && npx vitest run packages/lobby/test/unit/frame-document.test.ts`. Expected: PASS. Then `npm run play -- --port 8318` and confirm `curl -s localhost:8318/live/session.json | head -c 300` still shows `"recordedBy":"scripts/play-server.mjs"`.

- [ ] **Step 6: Commit.**

```bash
git add scripts/lib scripts/play-server.mjs packages/lobby/test packages/lobby/tsconfig.test.json tsconfig.json
git commit -m "refactor(play): one frame encoder, shared — and a shape test where a missing script was cited"
```

---

### Task 2: A universe built from what the player chose, ticked by its owner

**Files:**
- Modify: `packages/lobby/src/universe-host.ts` (rewrite)
- Create: `packages/lobby/test/unit/universe-host.test.ts`

**Interfaces:**
- Consumes: `FrameDocument` (Task 1).
- Produces:

```ts
export interface UniverseConfig {
  species: string; tradition: string; techniques: string[]; forms: string[];
  seed?: number; tickCap?: number;
}
export interface GodAction { kind: number; params?: number[] }
export interface Outcome { admitted: boolean; rejection?: string; status: string }
export class UniverseHost implements FrameRun {
  constructor(config: UniverseConfig, doc: FrameDocument, now: number);
  readonly id: string; readonly seed: number; readonly cap: number;
  readonly session: AgentSession; readonly frames: Record<string, unknown>[];
  readonly sandbox: null; readonly sheet: null;
  readonly ref: UniverseRef;
  lastTouched: number;
  get isAlive(): boolean;            // session.status() === 'running'
  enqueue(action: GodAction): { from: number; outcome: Promise<Outcome> } | null; // null = one already queued
  tick(): void;                      // consumes the queued action or a no-op; appends one frame
}
export function validateConfig(raw: unknown): UniverseConfig; // throws Error naming the bad field
```

- [ ] **Step 1: Write the failing tests.** The observation layout is confirmed from a live frame: `obs[0..4]` are the five technique flags in content order, `obs[5..18]` the fourteen form flags, `obs[35]` the tradition. The mage block is located by name, never by offset.

```ts
/*
 * Multiverse Mages — a universe is founded holding what the player chose.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { describe, expect, it } from 'vitest';
import { OBSERVATION_BLOCKS, GOD_ACTION } from '@mm/agent-api';
import { referenceContent } from '@mm/scenario';
import { frameDocument } from '../../../../scripts/lib/frame-document.mjs';
import { UniverseHost, validateConfig } from '../../src/universe-host.js';

const doc = frameDocument(referenceContent(), 'test');
const base = { species: 'dwarf', tradition: 'art-of-memory', techniques: ['intellego', 'rego'], forms: ['mentem', 'terram'], seed: 11, tickCap: 200 };
const obs = (h: UniverseHost) => h.frames[h.frames.length - 1]!.obs as number[];
const mages = OBSERVATION_BLOCKS.find((b) => b.name === 'mages')!;

describe('UniverseHost', () => {
  it('opens on exactly the chosen square', () => {
    const o = obs(new UniverseHost(base, doc, 0));
    expect(o.slice(0, 5)).toEqual([0, 1, 0, 0, 1]);          // intellego, rego
    expect(o.slice(5, 19).map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([7, 8]); // mentem, terram
  });

  it('founds one species only', () => {
    const o = obs(new UniverseHost(base, doc, 0));
    const perSpecies = [...Array(6).keys()].map((s) => o.slice(mages.offset + s * 8, mages.offset + s * 8 + 8).reduce((a, b) => a + b, 0));
    expect(perSpecies.filter((n) => n > 0)).toHaveLength(1);
    expect(perSpecies[2]).toBeGreaterThan(0);                // dwarf is index 2 in species.json
  });

  it('holds the chosen tradition', () => {
    const a = obs(new UniverseHost({ ...base, tradition: 'true-naming' }, doc, 0))[35];
    const b = obs(new UniverseHost(base, doc, 0))[35];
    expect(a).not.toBe(b);
  });

  it('seeds inside uint32 when no seed is named', () => {
    const { seed: _s, ...noSeed } = base;
    const h = new UniverseHost(noSeed, doc, 0);
    expect(h.seed).toBeGreaterThanOrEqual(0);
    expect(h.seed).toBeLessThanOrEqual(0xffff_ffff);
  });

  it('does not move time on enqueue; tick consumes the action and resolves it', async () => {
    const h = new UniverseHost(base, doc, 0);
    const q = h.enqueue({ kind: GOD_ACTION.noop })!;
    expect(h.frames).toHaveLength(1);
    expect(h.enqueue({ kind: GOD_ACTION.noop })).toBeNull();  // one per tick
    h.tick();
    expect(h.frames).toHaveLength(2);
    await expect(q.outcome).resolves.toMatchObject({ admitted: true });
  });

  it('stops at its cap and refuses what is queued after', async () => {
    const h = new UniverseHost({ ...base, tickCap: 3 }, doc, 0);
    for (let i = 0; i < 5; i += 1) h.tick();
    expect(h.isAlive).toBe(false);
    const n = h.frames.length;
    h.tick();
    expect(h.frames).toHaveLength(n);
  });

  it.each([
    [{ ...base, species: 'hobbit' }, /species/],
    [{ ...base, tradition: 'x' }, /tradition/],
    [{ ...base, techniques: [] }, /technique/],
    [{ ...base, forms: ['ignem', 'ignem', 'vim'] }, /form/],
    [null, /config/],
  ])('rejects %j', (raw, msg) => expect(() => validateConfig(raw)).toThrow(msg));
});
```

- [ ] **Step 2: Run.** `npx vitest run packages/lobby/test/unit/universe-host.test.ts`. Expected: FAIL (constructor signature, `enqueue` missing).

- [ ] **Step 3: Implement** `packages/lobby/src/universe-host.ts` (keep the header):

```ts
import { randomInt, randomUUID } from 'node:crypto';

import { GOD_ACTION, createSession, type AgentSession } from '@mm/agent-api';
import {
  explicitOpeningAxes, foundingCandidates, referenceContent, referenceScenario, speciesTable,
} from '@mm/scenario';
import type { UniverseRef as ServerUniverseRef } from '@mm/server';
import type { FrameDocument, FrameRun } from '../../../scripts/lib/frame-document.mjs';

export interface UniverseRef extends Omit<ServerUniverseRef, 'universeId' | 'bubbleId'> {
  universeId: string;
  bubbleId: string;
}
export interface UniverseConfig {
  species: string; tradition: string; techniques: string[]; forms: string[];
  seed?: number; tickCap?: number;
}
export interface GodAction { kind: number; params?: number[] }
export interface Outcome { admitted: boolean; rejection?: string; status: string }

/** A god picks two techniques and two forms (setup screen). */
const OPENING_MAX = 2;
const DEFAULT_CAP = 4000;
const shipped = referenceContent();

const strings = (v: unknown, field: string, allowed: readonly string[]): string[] => {
  if (!Array.isArray(v) || v.length < 1 || v.length > OPENING_MAX || new Set(v).size !== v.length
      || v.some((x) => typeof x !== 'string' || !allowed.includes(x))) {
    throw new Error(`${field} must be 1-${OPENING_MAX} distinct ids from: ${allowed.join(', ')}`);
  }
  return v as string[];
};

export function validateConfig(raw: unknown): UniverseConfig {
  if (raw === null || typeof raw !== 'object') throw new Error('config must be a JSON object');
  const c = raw as Record<string, unknown>;
  const ids = (list: readonly { record: { id: string } }[]) => list.map((e) => e.record.id);
  const r = shipped.registry;
  if (typeof c.species !== 'string' || !ids(r.species).includes(c.species)) {
    throw new Error(`species must be one of: ${ids(r.species).join(', ')}`);
  }
  if (typeof c.tradition !== 'string' || !ids(r.traditions).includes(c.tradition)) {
    throw new Error(`tradition must be one of: ${ids(r.traditions).join(', ')}`);
  }
  const out: UniverseConfig = {
    species: c.species, tradition: c.tradition,
    techniques: strings(c.techniques, 'techniques', ids(r.techniques)),
    forms: strings(c.forms, 'forms', ids(r.forms)),
  };
  if (c.seed !== undefined) {
    if (!Number.isInteger(c.seed) || (c.seed as number) < 0 || (c.seed as number) > 0xffff_ffff) throw new Error('seed must be a uint32');
    out.seed = c.seed as number;
  }
  if (c.tickCap !== undefined) {
    if (!Number.isInteger(c.tickCap) || (c.tickCap as number) < 1 || (c.tickCap as number) > 100_000) throw new Error('tickCap must be 1..100000');
    out.tickCap = c.tickCap as number;
  }
  return out;
}

export class UniverseHost implements FrameRun {
  readonly id = randomUUID();
  readonly ref: UniverseRef;
  readonly seed: number;
  readonly cap: number;
  readonly session: AgentSession;
  readonly frames: Record<string, unknown>[] = [];
  readonly sandbox = null;
  readonly sheet = null;
  lastTouched: number;
  #queued: { action: GodAction; resolve: (o: Outcome) => void } | null = null;

  constructor(config: UniverseConfig, private readonly doc: FrameDocument, now: number) {
    const base = referenceContent(undefined, config.tradition);
    const axes = explicitOpeningAxes(base.registry, config.techniques, config.forms);
    const content = { ...base, axes, foundingNodeIds: foundingCandidates(base.registry, axes) };
    this.session = createSession({ scenario: referenceScenario(content, { raids: true }).scenario, strategyId: 'lobby-universe' });

    const { ids } = speciesTable(base.registry);
    const wanted = base.registry.species.find((e) => e.record.id === config.species)!.contentId;
    const foundingSpeciesMask = 1 << ids.indexOf(wanted);

    this.seed = config.seed ?? randomInt(0, 0xffff_ffff);
    this.cap = config.tickCap ?? DEFAULT_CAP;
    this.session.reset(this.seed, { worldTickCap: this.cap, options: { foundingSpeciesMask } });
    this.ref = { universeId: this.id, bubbleId: '', prestige: 0 };
    this.lastTouched = now;
    this.frames.push(doc.encodeFrame(this.session));
  }

  get isAlive(): boolean {
    return this.session.status() === 'running';
  }

  enqueue(action: GodAction): { from: number; outcome: Promise<Outcome> } | null {
    if (this.#queued !== null) return null;
    let resolve!: (o: Outcome) => void;
    const outcome = new Promise<Outcome>((r) => { resolve = r; });
    this.#queued = { action, resolve };
    return { from: this.frames.length, outcome };
  }

  tick(): void {
    const queued = this.#queued;
    this.#queued = null;
    if (!this.isAlive) {
      const status = this.session.status();
      queued?.resolve({ admitted: false, rejection: `episode-${status}`, status });
      return;
    }
    const action = queued?.action ?? { kind: GOD_ACTION.noop };
    const result = this.session.submit({ kind: action.kind, params: action.params ?? [] });
    this.frames.push(this.doc.encodeFrame(this.session));
    queued?.resolve({
      admitted: result.admitted,
      ...(result.rejection === undefined ? {} : { rejection: String(result.rejection) }),
      status: String(result.status),
    });
  }
}
```

  If `ScenarioConfig` doesn't accept `options` in this shape, or `speciesTable` returns something else, read the type in `packages/scenario/src/reference-universe.ts` and fix the call. **Don't change scenario.** `opening-square.test.ts:125-140` is the working precedent for the explicit-axes call.

- [ ] **Step 4: Run.** `npx tsc --build && npx vitest run packages/lobby/test/unit/universe-host.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add packages/lobby/src/universe-host.ts packages/lobby/test/unit/universe-host.test.ts
git commit -m "feat(lobby): a universe is founded on the player's species, tradition and square — and ticks only when told"
```

---

### Task 3: The lobby keeps time and publishes each universe where the UI already looks

**Files:**
- Modify: `packages/lobby/src/lobby.ts`
- Modify: `packages/lobby/src/index.ts` (export `validateConfig`, types)
- Create: `packages/lobby/test/unit/lobby.test.ts`

**Interfaces:**
- Consumes: `UniverseHost`, `validateConfig` (Task 2); `FrameDocument` (Task 1); `Clock`, `manualClock` (`@mm/server`).
- Produces:

```ts
export interface LobbyOptions {
  doc: FrameDocument; clock: Clock; uiRoot?: string;
  maxUniverses?: number;   // default 32
  evictAfterMs?: number;   // default 3_600_000; ended AND untouched this long → dropped
}
class Lobby {
  tickAll(): void;                                   // one world tick for every live universe
  listen(port: number): Promise<import('node:http').Server>;  // resolves once bound; port 0 allowed
}
```

  HTTP surface:

| Route | Answer |
|---|---|
| `GET /` | `302` → `/ui/app/` |
| `POST /api/create` | `200 {universeId, bubbleId, worldTick}` · `400 {error}` bad config · `503 {error}` at `maxUniverses` |
| `POST /api/rejoin` | `200 {universeId, alive, worldTick}` · `404` |
| `GET /u/<id>/live/session.json` | `{...header, frames}`. Same shape as play-server. Touches `lastTouched`. |
| `GET /u/<id>/live/frames?since=N` | `{provenance, from, frames}` |
| `POST /u/<id>/live/submit` | waits for the next tick, then `{admitted, rejection?, status, from, frames}` · `409` already queued or episode over · `400` bad action |
| `POST /u/<id>/live/{advance,reset,control,sandbox}` | `403 {error: 'This server keeps time…'}` |
| unknown `<id>` | `404 {error: 'universe not found — the server may have restarted'}` |

  `/api/universe/*` is **deleted**. Nothing calls it (grep `ui/` before deleting) and `advance` is exactly what this change forbids.

- [ ] **Step 1: Write the failing tests.** Use a real server on port 0 and `fetch`. Time moves only via `tickAll()`.

```ts
/*
 * Multiverse Mages — the lobby keeps time; a browser only watches and asks.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GOD_ACTION } from '@mm/agent-api';
import { manualClock } from '@mm/server';
import { referenceContent } from '@mm/scenario';
import { frameDocument } from '../../../../scripts/lib/frame-document.mjs';
import { Lobby } from '../../src/lobby.js';

const cfg = { species: 'elf', tradition: 'true-naming', techniques: ['creo'], forms: ['ignem'], seed: 3, tickCap: 50 };
let server: Server; let base: string; let lobby: Lobby; const clock = manualClock(0);

beforeEach(async () => {
  lobby = new Lobby({ doc: frameDocument(referenceContent(), 'lobby'), clock, maxUniverses: 2, evictAfterMs: 1000 });
  server = await lobby.listen(0);
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

const post = (p: string, body: unknown) => fetch(base + p, { method: 'POST', body: JSON.stringify(body) });
const create = async () => (await (await post('/api/create', cfg)).json()).universeId as string;

describe('Lobby', () => {
  it('does not move time on reads, only on tickAll', async () => {
    const id = await create();
    const a = await (await fetch(`${base}/u/${id}/live/session.json`)).json();
    await fetch(`${base}/u/${id}/live/frames?since=0`);
    expect(a.frames).toHaveLength(1);
    lobby.tickAll(); lobby.tickAll();
    const b = await (await fetch(`${base}/u/${id}/live/frames?since=1`)).json();
    expect(b.from).toBe(1);
    expect(b.frames).toHaveLength(2);
  });

  it('refuses every route that would let a browser drive time', async () => {
    const id = await create();
    for (const r of ['advance', 'reset', 'control', 'sandbox']) {
      expect((await post(`/u/${id}/live/${r}`, { ticks: 500 })).status).toBe(403);
    }
  });

  it('applies a submit on the next tick and answers with that frame', async () => {
    const id = await create();
    const pending = post(`/u/${id}/live/submit`, { kind: GOD_ACTION.noop, params: [] });
    await new Promise((r) => setTimeout(r, 20));
    expect((await post(`/u/${id}/live/submit`, { kind: GOD_ACTION.noop })).status).toBe(409);
    lobby.tickAll();
    const res = await (await pending).json();
    expect(res).toMatchObject({ admitted: true, from: 1 });
    expect(res.frames).toHaveLength(1);
  });

  it('answers 400 to a malformed action and to a bad config', async () => {
    const id = await create();
    expect((await post(`/u/${id}/live/submit`, { kind: 999 })).status).toBe(400);
    expect((await post('/api/create', { ...cfg, species: 'hobbit' })).status).toBe(400);
  });

  it('caps the number of universes with 503', async () => {
    await create(); await create();
    const r = await post('/api/create', cfg);
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/full/i);
  });

  it('404s an unknown universe with a reason', async () => {
    const r = await fetch(`${base}/u/00000000-0000-0000-0000-000000000000/live/session.json`);
    expect(r.status).toBe(404);
    expect((await r.json()).error).toMatch(/restart/);
  });

  it('stops ticking an ended universe and evicts it once untouched', async () => {
    const id = (await (await post('/api/create', { ...cfg, tickCap: 2 })).json()).universeId;
    for (let i = 0; i < 5; i += 1) lobby.tickAll();
    const n = (await (await fetch(`${base}/u/${id}/live/session.json`)).json()).frames.length;
    lobby.tickAll();
    expect((await (await fetch(`${base}/u/${id}/live/frames?since=${n}`)).json()).frames).toHaveLength(0);
    clock.advance(1001); lobby.tickAll();
    expect((await post('/api/rejoin', { universeId: id })).status).toBe(404);
  });

  it('redirects / to the game', async () => {
    const r = await fetch(base + '/', { redirect: 'manual' });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/ui/app/');
  });
});
```

- [ ] **Step 2: Run.** `npx vitest run packages/lobby/test/unit/lobby.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement in `lobby.ts`.**
  - Constructor takes `LobbyOptions`. Replace every `Date.now()` with `this.clock.now()`.
  - `/api/create` runs `validateConfig(JSON.parse(body))`; at `universes.size >= maxUniverses` answer `503 {error: 'The server is full — every universe slot is taken. Try again when one ends.'}`. Then `new UniverseHost(config, this.doc, this.clock.now())`.
  - Delete the four `/api/universe/*` routes.
  - `tickAll()`:

```ts
tickAll(): void {
  const now = this.clock.now();
  for (const [id, host] of this.universes) {
    if (host.isAlive) { host.tick(); continue; }
    host.tick(); // resolves any submit queued after the end with episode-<status>
    if (now - host.lastTouched > this.evictAfterMs) {
      this.universes.delete(id);
      this.bubbles.get(host.ref.bubbleId)?.remove(id);
    }
  }
}
```

  - In `handleRequest`, before the router: `/` → 302. Then match `^/u/([0-9a-f-]{36})/live/([a-z.]+)$`. Unknown id → 404 with the reason above. Set `host.lastTouched = this.clock.now()`. Then dispatch:

```ts
const READ_ONLY = 'This server keeps time. A universe advances one month per second whether or not anyone is watching; there is no advance, reset, pause or control here.';
switch (`${req.method} ${route}`) {
  case 'GET session.json': json(res, 200, { ...this.doc.header(host), frames: host.frames }); return;
  case 'GET frames': {
    const since = Math.max(0, Number(url.searchParams.get('since') ?? '0') || 0);
    const from = Math.min(since, host.frames.length);
    json(res, 200, { provenance: this.doc.header(host).provenance, from, frames: host.frames.slice(from) });
    return;
  }
  case 'POST submit': {
    const action = toAction(await readBody(req), host.session.actionSpaceSize);
    if (action === null) { json(res, 400, { error: 'body must be {kind:int within the action space, params:int[]}' }); return; }
    if (!host.isAlive) { json(res, 409, { error: `the episode is over (${host.session.status()})` }); return; }
    const q = host.enqueue(action);
    if (q === null) { json(res, 409, { error: 'an action is already queued for this tick — one god action per month' }); return; }
    const outcome = await q.outcome;
    json(res, 200, { ...outcome, from: q.from, frames: host.frames.slice(q.from) });
    return;
  }
  default:
    if (req.method === 'POST' && ['advance', 'reset', 'control', 'sandbox'].includes(route)) { json(res, 403, { error: READ_ONLY }); return; }
    json(res, 405, { error: `${req.method} ${route} is not a route here` });
}
```

  `readBody` caps at 64 KiB, answering `413` above that. `toAction` is copied from `play-server.mjs` (`const toAction`): kind is an integer in `[0, actionSpaceSize)`, params is an integer array.
  - `listen(port)` returns `new Promise(resolve => server.listen(port, () => resolve(server)))` and keeps the log lines.

- [ ] **Step 4: Run.** `npx tsc --build && npx vitest run packages/lobby`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add packages/lobby
git commit -m "feat(lobby): the server keeps time — per-universe live routes, no browser-driven advance"
```

---

### Task 4: The bin runs the clock; the image runs the lobby

**Files:**
- Modify: `packages/lobby/bin/lobby.mjs`
- Create: `Dockerfile` (repo root; `deploy/mmo-compose.yml` already builds `..`)
- Create: `.dockerignore`
- Modify: `deploy/mmo-compose.yml` (command flags)

**Interfaces:**
- Consumes: `Lobby` (Task 3), `systemClock`, `DEFAULT_PACING` (`@mm/server`, exported at `packages/server/src/index.ts:62-65`).

- [ ] **Step 1: The bin.**

```js
#!/usr/bin/env node
/* header */
import process from 'node:process';
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

const port = Number(arg('port', '8400'));
const tickMs = Number(arg('tick-ms', String(DEFAULT_PACING.world.tickIntervalMs)));
const maxUniverses = Number(arg('max-universes', '32'));

const lobby = new Lobby({
  doc: frameDocument(referenceContent(), 'packages/lobby'),
  clock: systemClock,
  uiRoot: path.join(ROOT, 'ui'),
  maxUniverses,
});
await lobby.listen(port);
// The one wall-clock driver: pacing only (authoritative-lockstep spec, l.97).
setInterval(() => lobby.tickAll(), tickMs);
console.log(`  world tick every ${tickMs} ms, at most ${maxUniverses} universes`);
```

- [ ] **Step 2: Dockerfile.** Base it on the hand-built one on `games` at `/opt/mm-play/Dockerfile`; read it with `ssh games cat /opt/mm-play/Dockerfile`. Copy every `packages/*/package.json` that exists on this branch (`ls packages`), `RUN npm ci --ignore-scripts`, `COPY . .`, `RUN npx tsc --build`, and a runtime stage with `CMD ["node", "packages/lobby/bin/lobby.mjs", "--port", "8300"]`. `.dockerignore`: `node_modules`, `**/dist`, `.claude`, `.playwright-mcp`, `mc-results`, `*.png` at root, `.tsbuild`.

- [ ] **Step 3: Compose.** Change the `deploy/mmo-compose.yml` command to `node packages/lobby/bin/lobby.mjs --port 8300 --max-universes 32`. Drop `--bubble-size`, which the bin never read.

- [ ] **Step 4: Run locally.** `docker build -t mm-lobby . && docker run --rm -p 8319:8300 mm-lobby`. Then:

```bash
id=$(curl -s -XPOST localhost:8319/api/create -d '{"species":"dwarf","tradition":"art-of-memory","techniques":["intellego","rego"],"forms":["mentem","terram"]}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).universeId')
t(){ curl -s localhost:8319/u/$id/live/frames?since=0 | node -pe 'JSON.parse(require("fs").readFileSync(0)).frames.length'; }
t; sleep 10; t     # expected: second number ≈ first + 10, with no browser open
curl -s -o /dev/null -w '%{http_code}\n' -XPOST localhost:8319/u/$id/live/advance   # expected 403
```

- [ ] **Step 5: Commit.**

```bash
git add packages/lobby/bin/lobby.mjs Dockerfile .dockerignore deploy/mmo-compose.yml
git commit -m "feat(deploy): the image runs the lobby, and the lobby's interval is the only clock"
```

---

### Task 5: The page joins a universe; it never drives one

**Files:**
- Create: `ui/app/setup.html` (the setup screen, moved)
- Modify: `ui/app/index.html`
- Modify: `packages/content/test/unit/ui-index.test.ts` only if it asserts on setup markup (read it first)

**Interfaces:**
- Consumes: `/api/create`, `/api/rejoin`, `/u/<id>/live/*` (Task 3); `openSession({ live: base })` and `session.poll()` (`ui/shared/session.js`, unchanged).
- Produces: `localStorage['mm.universeId']`; `setup.html?gone=1` shows "That universe no longer exists — the server may have restarted. Choose again."

- [ ] **Step 1: Move the setup screen to its own page.** `setup.html` gets:
  - the doctype, head and theme link from `index.html` (copy lines 1-21 and keep `../shared/theme.css`)
  - the CSS from `/* ===… SETUP SCREEN */` through `.begin-btn:focus-visible`
  - the weave overlay CSS and markup
  - the `#setup-screen` markup
  - the JS under `// ===… SETUP SCREEN`, minus its Begin handler

  The new Begin handler:

```js
el('begin-btn').addEventListener('click', async () => {
  const btn = el('begin-btn');
  btn.disabled = true;
  el('weave-overlay').removeAttribute('hidden');
  try {
    const res = await fetch('/api/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        species: setup.species,
        tradition: TRADITIONS[setup.tradition].id,
        techniques: [...setup.techniques],
        forms: [...setup.forms],
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `create failed (${res.status})`);
    try { localStorage.setItem('mm.universeId', body.universeId); } catch { /* private window: the URL carries it */ }
    location.href = `./?u=${body.universeId}`;
  } catch (e) {
    el('setup-error').textContent = e.message;   // add <p id="setup-error" role="alert"> under Begin
    btn.disabled = false;
    el('weave-overlay').setAttribute('hidden', '');
  }
});
if (new URLSearchParams(location.search).has('gone')) {
  el('setup-error').textContent = 'That universe no longer exists — the server may have restarted. Choose again.';
}
```

  Delete the moved blocks from `index.html`, including both `el('setup-screen').hidden = …` sites and the `#app hidden` attribute.

- [ ] **Step 2: Boot joins, or goes to setup.** Replace the `// ===… BOOT` block's `openSession` attempts:

```js
const KEY = 'mm.universeId';
const fromUrl = new URLSearchParams(location.search).get('u');
let stored = null;
try { stored = localStorage.getItem(KEY); } catch { /* ignore */ }
const universeId = fromUrl ?? stored;
if (!universeId) { location.replace('./setup.html'); throw new Error('no universe yet'); }
let session;
const isLive = true;
try {
  session = await openSession({ live: `/u/${universeId}` });
  try { localStorage.setItem(KEY, universeId); } catch { /* ignore */ }
} catch {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  location.replace('./setup.html?gone=1');
  throw new Error('universe gone');
}
```

  `isLive` stays a constant `true`, so the many `isLive ?` branches keep their live arm. Removing those branches is a separate cleanup.

- [ ] **Step 3: Delete the client clock.** Remove:
  - the `// ===… ADVANCE CONTROLS (live mode)` block and its `.advance-btn` markup
  - in `// ===… THE CLOCK RUNS`: `RUN_MS`, `RUN_TICKS`, `lastAdvanceAt`, the `setInterval` that calls `session.advance`, `setRunning`, `updateRunBtn`, the space-bar handler, and the `#run-btn` markup

  Add a poll at the same place:

```js
// The server keeps time (lobby tickAll, 1 tick/s). The page only reads.
const POLL_MS = 1000;
setInterval(async () => {
  if (document.hidden || state.ended) return;
  try {
    if ((await session.poll()) > 0) paint();
  } catch { /* transient; the next poll retries */ }
}, POLL_MS);
```

  Status line text becomes `'The world runs on the server — one month per second, whether or not you are watching.'`.

- [ ] **Step 4: Restart means a new universe.** `weaveNewUniverse()` becomes:

```js
function weaveNewUniverse() {
  try { localStorage.removeItem('mm.universeId'); } catch { /* ignore */ }
  location.href = './setup.html';
}
```

  Delete the `session.restart` call and the overlay juggling around it. Keep the `#restart-btn` wiring and relabel the button `new universe`.

- [ ] **Step 5: Update the guide.**
  - In `#help-modal` "TIME": replace the season/1.5 s line and the `+1 month… +20 years` line with "The server keeps time: one month per second, even when you close the tab. You can't pause it; that is the point."
  - Change "Every god action also advances time by one month" to "A god action takes effect on the next month."
  - Delete "Pause (topbar button or space) to think."

- [ ] **Step 6: Verify in a browser against the local lobby.** Run `npm run build -w @mm/lobby 2>/dev/null; npx tsc --build && node packages/lobby/bin/lobby.mjs --port 8320`, then use Playwright:
  1. `/` lands on `setup.html`, and nothing ticks. `curl /api/bubbles` shows `waiting: 0`.
  2. Pick Dwarf / Art of Memory / intellego+rego / mentem+terram and press Begin. The URL has `?u=`, the year counter starts near 0, and the population panel lists **Dwarf only**.
  3. With no clicks for 10 s, the year moves by about 10 months.
  4. Reload: the same universe comes back and the year is still moving.
  5. Close the tab for 15 s and reopen: the year jumped about 15 months (server time).
  6. Click encourage research and pick a candidate: a toast appears and the activity feed updates within 1-2 s.
  7. Kill and restart the lobby, then reload: you land on `setup.html?gone=1` with the message.
  8. `curl -XPOST localhost:8320/u/<id>/live/advance` returns 403.

  Save screenshots under `.playwright-mcp/` (gitignored). They're evidence for the PR, not committed.

- [ ] **Step 7: Commit.**

```bash
git add ui/app
git commit -m "feat(ui): join a server-timed universe — setup is its own page, the page polls and never advances"
```

---

### Task 6: Gate, measure, document, then ask before deploying

**Files:**
- Modify: `docs/devops/ci-and-deploy.md` (the "Deployment: nothing to deploy yet" section is false)
- Modify: `ui/README.md` (the `npm run play` section: add the lobby)
- Modify: `package.json` scripts: `"lobby": "node packages/lobby/bin/lobby.mjs --port 8300"`

- [ ] **Step 1: Measure memory for Review Focus 5.**

```bash
node --expose-gc --input-type=module -e '
const { referenceContent } = await import("./packages/scenario/dist/index.js");
const { frameDocument } = await import("./scripts/lib/frame-document.mjs");
const { UniverseHost } = await import("./packages/lobby/dist/index.js");
gc(); const before = process.memoryUsage().heapUsed;
const h = new UniverseHost({species:"human",tradition:"vancian-memorization",techniques:["creo","rego"],forms:["ignem","terram"],seed:1}, frameDocument(referenceContent(),"m"), 0);
for (let i=0;i<4000;i++) h.tick();
gc(); console.log("MB per universe at cap:", ((process.memoryUsage().heapUsed-before)/1e6).toFixed(1));'
```

  Set the `--max-universes` default to `floor(0.5 × container memory ÷ that number)` and write the number, dated and with its ref, into the bin's comment.

- [ ] **Step 2: Gate.** `npm ci && npm run verify` in the worktree. Expected: green. If a balance gate moves, **stop**: this change must not touch the rules path.

- [ ] **Step 3: Docs.** In `ci-and-deploy.md`, replace "Deployment: nothing to deploy yet" with what is true, dated 2026-10-07:
  - `mages.multiversegames.ai` is served from `games` by a hand-built compose project.
  - From this change it runs `packages/lobby` via the repo `Dockerfile`.
  - There is still no CI-triggered deploy.

  Name no paths beyond the SSH alias. In `ui/README.md`, add `npm run lobby` next to `npm run play` with one line: play = one shared universe for development; lobby = per-player, server-timed.

- [ ] **Step 4: Commit and open the PR.**

```bash
git add docs/devops/ci-and-deploy.md ui/README.md package.json packages/lobby/bin/lobby.mjs
git commit -m "docs(deploy): say what actually serves mages.multiversegames.ai"
git push -u origin lobby-server-clock
gh pr create --title "The server keeps time: lobby with per-player universes replaces play-server on the hosted game" --body-file "$SCRATCH/pr-body.md"   # body: what changed, the claim below, the Task 5 screenshots, the AI attribution line
```

  The PR body states the claim and how it could be disproved: "With no browser open, a hosted universe advances 1 tick/s (measure: two `frames?since` reads 60 s apart differ by 60±2), and `POST …/advance` is 403."

- [ ] **Step 5: Deploy. Requires the author's explicit go-ahead first.** It is outward-facing and ends the universe currently hosted. When approved, on `games`:
  1. `git -C /opt/mm-play fetch && git -C /opt/mm-play checkout <merged main sha>`
  2. Swap the project's compose command to the lobby (or point it at `deploy/mmo-compose.yml`), then `docker compose up -d --build`.
  3. Run the Task 4 step 4 checks against `https://mages.multiversegames.ai`.

  Separately, ask the author about the bare `node scripts/play-server.mjs --port 8300` process that has run as root on `games` since Sep 24, outside Docker. **Don't kill it unasked.**
