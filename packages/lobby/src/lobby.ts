/*
 * Multiverse Mages — MMO lobby service.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The player's entry point. Creates universes, matches them into bubbles,
 * keeps time for all of them, and serves the UI. Zero runtime dependencies.
 */

/**
 * ## The server keeps time
 *
 * {@link Lobby.tickAll} steps every live universe once. The bin calls it from
 * one interval (`--tick-ms`, default `DEFAULT_PACING.world.tickIntervalMs`);
 * tests call it directly. No route moves time: a browser reads frames and
 * queues at most one god action per universe per tick, which the next
 * `tickAll` applies. `advance`, `reset`, `control` and `sandbox` are `403`.
 *
 * The wall clock enters only through the injected {@link Clock}, and only for
 * pacing and admission (`authoritative-lockstep` spec): eviction of ended,
 * untouched universes, and the timestamps the API reports.
 *
 * ## Per-universe routes
 *
 * `/u/<id>/live/*` publishes the same document shape `scripts/play-server.mjs`
 * does at `/live/*`, so `ui/shared/session.js` reads either with
 * `openSession({ live: base })`.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { Clock } from '@mm/server';

import type { FrameDocument } from '../../../scripts/lib/frame-document.mjs';
import { Bubble, type BubbleInfo } from './bubble.js';
import { BodyTooLarge, Router, json, readBody, text } from './router.js';
import { UniverseHost, validateConfig, type GodAction } from './universe-host.js';

/** Vision §13: "small clears fast and churns tiers while large makes raids
 * frequent and promotion rare." Start with 4. */
const BUBBLE_SIZE = 4;
const MAX_UNIVERSES = 16;
/** The ranges a caller may configure. Out of range is a thrown error, never a clamp. */
export const LOBBY_LIMITS = Object.freeze({
  bubbleSize: { min: 2, max: 16 },
  maxUniverses: { min: 1, max: 1024 },
  evictAfterMs: { min: 0, max: 30 * 24 * 3_600_000 },
});

/**
 * An option as an integer inside its range, or a thrown `RangeError`.
 *
 * Refuses rather than defaults: `size >= NaN` is always false, so a cap that
 * parsed to `NaN` would quietly be no cap at all.
 */
function bounded(name: keyof typeof LOBBY_LIMITS, value: number | undefined, fallback: number): number {
  const v = value ?? fallback;
  const { min, max } = LOBBY_LIMITS[name];
  if (!Number.isSafeInteger(v) || v < min || v > max) {
    throw new RangeError(`${name} must be an integer in ${String(min)}..${String(max)}, not ${String(v)}`);
  }
  return v;
}
const EVICT_AFTER_MS = 3_600_000;

const READ_ONLY =
  'This server keeps time. A universe advances one month per tick whether or not anyone is ' +
  'watching; there is no advance, reset, pause or control here.';
const GONE = 'universe not found — the server may have restarted';
const TOKEN_HEADER = 'x-universe-token';
const FULL = 'The server is full — every universe slot is taken. Try again when one ends.';

interface TierEntry {
  bubbleId: string;
  winnerId: string;
  promotedAt: number;
}

export interface LobbyOptions {
  doc: FrameDocument;
  clock: Clock;
  uiRoot?: string;
  /** Universes per bubble. Default {@link BUBBLE_SIZE}; 2 is a duel. */
  bubbleSize?: number;
  /** Live universes held at once. A create above it is `503`. Default 16 (see the bin). */
  maxUniverses?: number;
  /** An ended universe untouched this long is dropped. Default one hour. */
  evictAfterMs?: number;
  /** Suppress the startup banner (tests). */
  quiet?: boolean;
}

/** A submitted action, validated so a typo is a 400 and not a stack trace. */
const toAction = (body: unknown, actionSpaceSize: number): GodAction | null => {
  if (body === null || typeof body !== 'object') return null;
  const b = body as { kind?: unknown; params?: unknown };
  const kind = Number(b.kind);
  if (!Number.isInteger(kind) || kind < 0 || kind >= actionSpaceSize) return null;
  const raw: unknown[] = Array.isArray(b.params) ? (b.params as unknown[]) : [];
  const params = raw.map(Number);
  if (!params.every(Number.isInteger)) return null;
  return { kind, params };
};

const parse = (body: string): unknown => {
  if (body.trim() === '') return {};
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
};

export class Lobby {
  private universes = new Map<string, UniverseHost>();
  private bubbles = new Map<string, Bubble>();
  private waiting: UniverseHost[] = [];
  /**
   * Each universe's owner token: 32 random bytes, never derived from the id.
   * Universe ids are public — `/api/bubbles` lists them and a bubble-mate's
   * `seats` names them — so the id alone must not let anyone act on a universe.
   */
  private tokens = new Map<string, Buffer>();
  private ladder: TierEntry[] = [];
  private router = new Router();
  private readonly uiRoot: string;
  private readonly bubbleSize: number;
  private readonly doc: FrameDocument;
  private readonly clock: Clock;
  private readonly maxUniverses: number;
  private readonly evictAfterMs: number;
  private readonly quiet: boolean;

  constructor(opts: LobbyOptions) {
    this.doc = opts.doc;
    this.clock = opts.clock;
    this.uiRoot = opts.uiRoot ?? path.resolve('ui');
    this.bubbleSize = bounded('bubbleSize', opts.bubbleSize, BUBBLE_SIZE);
    this.maxUniverses = bounded('maxUniverses', opts.maxUniverses, MAX_UNIVERSES);
    this.evictAfterMs = bounded('evictAfterMs', opts.evictAfterMs, EVICT_AFTER_MS);
    this.quiet = opts.quiet ?? false;
    this.setupRoutes();
  }

  /**
   * One world tick for every live universe, in creation order.
   *
   * An ended universe is not stepped, but any submit queued on it is answered
   * `episode-<status>`; once it has also gone untouched for `evictAfterMs` it
   * is dropped. Its bubble seat stays, empty.
   */
  tickAll(): void {
    const now = this.clock.now();
    for (const [id, host] of this.universes) {
      if (host.isAlive) {
        host.tick();
        continue;
      }
      host.tick();
      if (now - host.lastTouched > this.evictAfterMs) {
        this.universes.delete(id);
        this.tokens.delete(id);
        this.waiting = this.waiting.filter((h) => h.id !== id);
        const bubble = this.bubbles.get(host.ref.bubbleId);
        if (bubble !== undefined) {
          bubble.remove(id);
          if (bubble.size === 0) this.bubbles.delete(bubble.id);
        }
      }
    }
  }

  /** A hosted universe by id, or `undefined` (never created, or evicted). */
  universe(id: string): UniverseHost | undefined {
    return this.universes.get(id);
  }

  private setupRoutes(): void {
    this.router.post('/api/create', (_req, res, body) => {
      let config;
      try {
        config = validateConfig(parse(body));
      } catch (e) {
        json(res, 400, { error: (e as Error).message });
        return;
      }
      if (this.universes.size >= this.maxUniverses) {
        json(res, 503, { error: FULL });
        return;
      }
      const host = new UniverseHost(config, this.doc, this.clock.now(), {
        seats: this.bubbleSize - 1,
        seatOf: (self, seat) => this.seatOf(self, seat),
      });
      this.universes.set(host.id, host);
      const token = randomBytes(32);
      this.tokens.set(host.id, token);
      this.waiting.push(host);
      this.tryFormBubble();

      json(res, 200, {
        universeId: host.id,
        token: token.toString('hex'),
        bubbleId: host.ref.bubbleId || null,
        worldTick: host.worldTick,
        bubbleSize: this.bubbleSize,
        waiting: this.waiting.length,
      });
    });

    this.router.post('/api/rejoin', (_req, res, body) => {
      const parsed = parse(body) as { universeId?: unknown } | null;
      const id = typeof parsed?.universeId === 'string' ? parsed.universeId : '';
      const host = this.universes.get(id);
      if (!host) {
        json(res, 404, { error: GONE });
        return;
      }
      host.lastTouched = this.clock.now();
      json(res, 200, {
        universeId: host.id,
        bubbleId: host.ref.bubbleId || null,
        worldTick: host.worldTick,
        alive: host.isAlive,
      });
    });

    this.router.get('/api/bubbles', (_req, res) => {
      const infos: BubbleInfo[] = [];
      for (const bubble of this.bubbles.values()) {
        infos.push(bubble.info());
      }
      json(res, 200, {
        bubbles: infos,
        waiting: this.waiting.length,
        universes: this.universes.size,
        maxUniverses: this.maxUniverses,
        bubbleSize: this.bubbleSize,
      });
    });

    this.router.get('/api/ladder', (_req, res) => {
      json(res, 200, { ladder: this.ladder });
    });
  }

  private tryFormBubble(): void {
    while (this.waiting.length >= this.bubbleSize) {
      const batch = this.waiting.splice(0, this.bubbleSize);
      const bubble = new Bubble(this.clock.now(), 0);
      for (const host of batch) {
        bubble.add(host);
      }
      this.bubbles.set(bubble.id, bubble);
    }
  }

  /**
   * The universe in `self`'s portal seat `seat` (1-based): its bubble-mates,
   * by id, with itself left out. Empty until the bubble forms.
   */
  private seatOf(self: UniverseHost, seat: number): UniverseHost | undefined {
    return this.bubbles.get(self.ref.bubbleId)?.seatOf(self.id, seat);
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://lobby.invalid');
    if (url.pathname === '/') {
      res.writeHead(302, { location: '/ui/app/' });
      res.end();
      return;
    }

    const live = /^\/u\/([^/]+)\/live\/([a-z.]+)$/u.exec(url.pathname);
    if (live !== null) {
      await this.handleLive(live[1] ?? '', live[2] ?? '', req, res, url);
      return;
    }

    if (await this.router.handle(req, res)) return;

    // Static file serving for the UI
    await this.serveStatic(url.pathname, res);
  }

  /**
   * Whether `req` carries this universe's owner token. Answers `401` (none
   * sent) or `403` (wrong one) itself and returns false; the token is compared
   * in constant time and never echoed or logged.
   */
  private authorized(id: string, req: IncomingMessage, res: ServerResponse): boolean {
    const sent = req.headers[TOKEN_HEADER];
    if (typeof sent !== 'string' || sent === '') {
      json(res, 401, { error: `this route changes a universe; send its owner token in ${TOKEN_HEADER}` });
      return false;
    }
    const expected = this.tokens.get(id);
    const given = /^[0-9a-f]{64}$/u.test(sent) ? Buffer.from(sent, 'hex') : Buffer.alloc(0);
    if (expected === undefined || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      json(res, 403, { error: 'that is not this universe\'s owner token' });
      return false;
    }
    return true;
  }

  private async handleLive(
    id: string,
    route: string,
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    const host = this.universes.get(id);
    if (host === undefined) {
      json(res, 404, { error: GONE });
      return;
    }
    host.lastTouched = this.clock.now();

    switch (`${req.method ?? 'GET'} ${route}`) {
      case 'GET session.json':
        json(res, 200, { ...this.doc.header(host), frames: host.frames });
        return;
      case 'GET frames': {
        const since = Math.max(0, Number(url.searchParams.get('since') ?? '0') || 0);
        const from = Math.min(since, host.frames.length);
        json(res, 200, {
          provenance: this.doc.header(host).provenance,
          from,
          frames: host.frames.slice(from),
        });
        return;
      }
      case 'GET raids': {
        // What this universe opened, what was opened on it, and who sits in
        // each of its portal seats.
        const bubble = this.bubbles.get(host.ref.bubbleId);
        const seats: Record<string, string | null> = {};
        for (let seat = 1; seat <= host.seatCount; seat += 1) seats[String(seat)] = null;
        json(res, 200, {
          universeId: host.id,
          bubbleId: host.ref.bubbleId || null,
          worldTick: host.worldTick,
          seats: bubble === undefined ? seats : bubble.seatIds(host.id, host.seatCount),
          log: host.raidLog(),
          inbound: host.inbound,
        });
        return;
      }
      case 'POST submit': {
        if (!this.authorized(host.id, req, res)) return;
        const action = toAction(parse(await readBody(req)), host.session.actionSpaceSize);
        if (action === null) {
          json(res, 400, { error: 'body must be {kind:int within the session action space, params:int[]}' });
          return;
        }
        if (!host.isAlive) {
          json(res, 409, { error: `the episode is over (${host.session.status()})` });
          return;
        }
        const q = host.enqueue(action);
        if (q === null) {
          json(res, 409, { error: 'an action is already queued for this tick — one god action per month' });
          return;
        }
        const outcome = await q.outcome;
        json(res, 200, { ...outcome, from: q.from, frames: host.frames.slice(q.from) });
        return;
      }
      default:
        if (req.method === 'POST' && ['advance', 'reset', 'control', 'sandbox'].includes(route)) {
          json(res, 403, { error: READ_ONLY });
          return;
        }
        json(res, 405, { error: `${req.method ?? 'GET'} ${route} is not a route here` });
    }
  }

  private async serveStatic(urlPath: string, res: ServerResponse): Promise<void> {
    const root = path.resolve(this.uiRoot, '..');
    let decoded: string;
    try {
      decoded = decodeURIComponent(urlPath).replace(/\0/g, '');
    } catch {
      text(res, 400, 'bad path');
      return;
    }
    let filePath = path.resolve(root, '.' + path.posix.normalize(decoded));
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      text(res, 403, 'forbidden');
      return;
    }

    // Directory → index.html
    try {
      const s = await stat(filePath);
      if (s.isDirectory()) filePath = path.join(filePath, 'index.html');
    } catch { /* fall through to 404 */ }

    try {
      const data = await readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime: Record<string, string> = {
        '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
        '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
        '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
        '.woff2': 'font/woff2', '.wav': 'audio/wav', '.jpg': 'image/jpeg',
      };
      res.writeHead(200, {
        'Content-Type': mime[ext] ?? 'application/octet-stream',
        'Content-Length': data.length,
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch {
      text(res, 404, '404 not found');
    }
  }

  /** Binds `port` (0 for any free one) and resolves once listening. */
  listen(port: number): Promise<Server> {
    const server = createServer((req, res) => {
      this.handleRequest(req, res).catch((e: unknown) => {
        if (res.headersSent) return;
        if (e instanceof BodyTooLarge) {
          json(res, 413, { error: e.message });
          return;
        }
        console.error('request error:', e);
        text(res, 500, 'internal error');
      });
    });
    return new Promise((resolve) => {
      server.listen(port, () => {
        const addr = server.address();
        const bound = typeof addr === 'object' && addr !== null ? addr.port : port;
        if (this.quiet) {
          resolve(server);
          return;
        }
        console.log(`Multiverse Mages lobby on http://localhost:${String(bound)}/`);
        console.log(`  /api/create        — start a universe`);
        console.log(`  /api/bubbles       — list active bubbles`);
        console.log(`  /u/<id>/live/*     — one universe, read-only but for submit`);
        console.log(`  /ui/app/           — play the game`);
        resolve(server);
      });
    });
  }
}
