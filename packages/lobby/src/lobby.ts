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
 * pacing and admission (`authoritative-lockstep` spec): eviction — an ended
 * universe a fixed time after it ended, a running one its owner has left — and
 * the timestamps the API reports. Only a request carrying the owner token
 * counts as the owner touching a universe; ids are public and reads are not.
 *
 * ## Per-universe routes
 *
 * `/u/<id>/live/*` publishes the same document shape `scripts/play-server.mjs`
 * does at `/live/*`, so `ui/shared/session.js` reads either with
 * `openSession({ live: base })`.
 */

import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { LegacyRecord } from '@mm/scenario';
import type { Clock } from '@mm/server';

import type { FrameDocument } from '../../../scripts/lib/frame-document.mjs';
import { Bubble, type SeatOccupant } from './bubble.js';
import { BodyTooLarge, Router, json, readBody, text } from './router.js';
import { packHistory, slimFrame } from './history.js';
import { DEFAULT_CAP, UniverseHost, validateConfig, type GodAction } from './universe-host.js';

/** Vision §13: "small clears fast and churns tiers while large makes raids
 * frequent and promotion rare." Start with 4. */
const BUBBLE_SIZE = 4;
const MAX_UNIVERSES = 16;
/** The ranges a caller may configure. Out of range is a thrown error, never a clamp. */
export const LOBBY_LIMITS = Object.freeze({
  bubbleSize: { min: 2, max: 16 },
  // tickAll steps every universe inside one tick interval; measured ~1.4 ms per
  // universe, so 256 is ~360 ms of a 1000 ms tick.
  maxUniverses: { min: 1, max: 256 },
  evictAfterMs: { min: 0, max: 30 * 24 * 3_600_000 },
  idleAfterMs: { min: 1_000, max: 7 * 24 * 3_600_000 },
  matchAfterMs: { min: 0, max: 24 * 3_600_000 },
  tickCap: { min: 1, max: DEFAULT_CAP },
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
/** A running universe its owner has not touched for this long is retired. */
const IDLE_AFTER_MS = 15 * 60_000;
/** A universe that has waited this long for a bubble takes whoever else is waiting. */
const MATCH_AFTER_MS = 60_000;

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
  /**
   * An ended universe is dropped this long after it **ended**, whoever reads it
   * meanwhile. Default one hour.
   */
  evictAfterMs?: number;
  /**
   * A running universe whose **owner** (token-bearing requests only) has not
   * touched it for this long is dropped. Default 15 minutes.
   */
  idleAfterMs?: number;
  /**
   * A universe that has found no open seat for this long is put in a bubble
   * with whoever else is waiting (two or more), which later arrivals top up.
   * Default one minute.
   */
  matchAfterMs?: number;
  /**
   * The server's world-tick cap. A create may ask for less, never more; only a
   * universe that reaches this cap is paid the cutoff ending's legacy.
   * Default {@link DEFAULT_CAP}.
   */
  tickCap?: number;
  /** Suppress the startup banner (tests). */
  quiet?: boolean;
  /**
   * How many of each universe's newest frames keep their §4.4 sidecars; older
   * ones are slimmed (`history.ts`). Default `FULL_FRAMES`. Tests set a huge
   * one to hold an unslimmed run beside a slimmed one.
   */
  fullFrames?: number;
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
  /** When each waiting universe started waiting, by the lobby clock. */
  private queuedAt = new Map<string, number>();
  /**
   * Universes a waiting universe should not be seated beside: those that
   * raided the universe its player retired to make it (vision §8b — a lost
   * universe's player rejoins a fresh bubble).
   */
  private avoid = new Map<string, ReadonlySet<string>>();
  /**
   * Each universe's owner token: 32 random bytes, never derived from the id.
   * Universe ids are public — a bubble-mate's
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
  private readonly idleAfterMs: number;
  private readonly matchAfterMs: number;
  private readonly tickCap: number;
  private readonly quiet: boolean;
  private readonly fullFrames: number | undefined;
  /** When each ended universe was first seen ended, by the lobby clock. */
  private endedAt = new Map<string, number>();

  constructor(opts: LobbyOptions) {
    this.doc = opts.doc;
    this.clock = opts.clock;
    this.uiRoot = opts.uiRoot ?? path.resolve('ui');
    this.bubbleSize = bounded('bubbleSize', opts.bubbleSize, BUBBLE_SIZE);
    this.maxUniverses = bounded('maxUniverses', opts.maxUniverses, MAX_UNIVERSES);
    this.evictAfterMs = bounded('evictAfterMs', opts.evictAfterMs, EVICT_AFTER_MS);
    this.idleAfterMs = bounded('idleAfterMs', opts.idleAfterMs, IDLE_AFTER_MS);
    this.matchAfterMs = bounded('matchAfterMs', opts.matchAfterMs, MATCH_AFTER_MS);
    this.tickCap = bounded('tickCap', opts.tickCap, DEFAULT_CAP);
    this.quiet = opts.quiet ?? false;
    if (opts.fullFrames !== undefined && !(Number.isSafeInteger(opts.fullFrames) && opts.fullFrames >= 1)) {
      throw new RangeError(`fullFrames must be a positive integer, not ${String(opts.fullFrames)}`);
    }
    this.fullFrames = opts.fullFrames;
    this.setupRoutes();
  }

  /**
   * One world tick for every live universe, in creation order, then eviction.
   *
   * An ended universe is not stepped, but any submit queued on it is answered
   * `episode-<status>`. It is dropped `evictAfterMs` after it ended — reads do
   * not extend that, because ids are public and anyone can read. A running
   * universe is dropped once its owner has not touched it (a request carrying
   * its token) for `idleAfterMs`. Either way its bubble seat stays, empty.
   */
  tickAll(): void {
    const now = this.clock.now();
    for (const [id, host] of this.universes) {
      host.tick();
      if (host.isAlive) {
        if (now - host.lastTouched > this.idleAfterMs) this.evict(id);
        continue;
      }
      const ended = this.endedAt.get(id) ?? now;
      this.endedAt.set(id, ended);
      if (now - ended > this.evictAfterMs) this.evict(id);
    }
    this.match();
  }

  /** Drops a universe and frees its slot. Its bubble seat stays, empty. */
  private evict(id: string): void {
    const host = this.universes.get(id);
    if (host === undefined) return;
    this.universes.delete(id);
    this.tokens.delete(id);
    this.endedAt.delete(id);
    this.waiting = this.waiting.filter((h) => h.id !== id);
    this.queuedAt.delete(id);
    this.avoid.delete(id);
    const bubble = this.bubbles.get(host.ref.bubbleId);
    if (bubble !== undefined) {
      bubble.remove(id);
      if (bubble.size === 0) this.bubbles.delete(bubble.id);
    }
  }

  /** Whether `token` (hex) is `id`'s owner token. Constant-time; never logged. */
  private ownerToken(id: string, token: unknown): boolean {
    if (typeof token !== 'string') return false;
    const expected = this.tokens.get(id);
    const given = /^[0-9a-f]{64}$/u.test(token) ? Buffer.from(token, 'hex') : Buffer.alloc(0);
    return expected !== undefined && given.length === expected.length && timingSafeEqual(given, expected);
  }

  /**
   * Refreshes `lastTouched` when, and only when, the request carries the
   * owner's token. A read without one is served but is not a touch.
   */
  private touchIfOwner(host: UniverseHost, req: IncomingMessage): void {
    if (this.ownerToken(host.id, req.headers[TOKEN_HEADER])) host.lastTouched = this.clock.now();
  }

  /** A hosted universe by id, or `undefined` (never created, or evicted). */
  universe(id: string): UniverseHost | undefined {
    return this.universes.get(id);
  }

  private setupRoutes(): void {
    this.router.post('/api/create', (_req, res, body) => {
      const raw = parse(body);
      let config;
      try {
        config = validateConfig(raw, this.tickCap);
      } catch (e) {
        json(res, 400, { error: (e as Error).message });
        return;
      }
      // `retire: {universeId, token}` — the universe this player is leaving.
      // Dropped at once, with its owner's token, so "new universe" frees the
      // slot it held instead of leaving it to idle out.
      const retire = (raw as { retire?: { universeId?: unknown; token?: unknown } }).retire;
      //
      // Only the owner's token retires one, and only then does its ending carry
      // over (vision §8a): an **ended** universe's legacy seeds the new one. A
      // universe retired while still running leaves nothing — abandoning a run
      // is not an ending, and paying for it would make "new universe" a way to
      // mint prestige. A legacy is paid once: it is read and the universe (and
      // its token) dropped in this one synchronous block, with no await between,
      // so a second retire of the same id finds nothing to carry.
      let raiders: ReadonlySet<string> = new Set();
      let legacy: LegacyRecord | undefined;
      if (retire !== undefined && retire !== null && typeof retire === 'object') {
        const old = typeof retire.universeId === 'string' ? retire.universeId : '';
        const previous = this.universes.get(old);
        if (previous !== undefined && this.ownerToken(old, retire.token)) {
          raiders = new Set(previous.inbound.map((r) => r.fromUniverseId));
          legacy = previous.legacy();
          this.evict(old);
        }
      }
      if (this.universes.size >= this.maxUniverses) {
        json(res, 503, { error: FULL });
        return;
      }
      const host = new UniverseHost(config, this.doc, this.clock.now(), {
        seats: this.bubbleSize - 1,
        seatOf: (self, seat) => this.seatOf(self, seat),
      }, { legacy, serverCap: this.tickCap, ...(this.fullFrames === undefined ? {} : { fullFrames: this.fullFrames }) });
      this.universes.set(host.id, host);
      const token = randomBytes(32);
      this.tokens.set(host.id, token);
      this.waiting.push(host);
      this.queuedAt.set(host.id, this.clock.now());
      if (raiders.size > 0) this.avoid.set(host.id, raiders);
      this.match();

      json(res, 200, {
        universeId: host.id,
        name: host.name,
        token: token.toString('hex'),
        // What the retired universe's ending carried in; `null` when nothing did.
        carriedPrestige: legacy?.carriedPrestige ?? null,
        bubbleId: host.ref.bubbleId || null,
        worldTick: host.worldTick,
        bubbleSize: this.bubbleSize,
        waiting: this.waiting.length,
      });
    });

    this.router.post('/api/rejoin', (req, res, body) => {
      const parsed = parse(body) as { universeId?: unknown } | null;
      const id = typeof parsed?.universeId === 'string' ? parsed.universeId : '';
      const host = this.universes.get(id);
      if (!host) {
        json(res, 404, { error: GONE });
        return;
      }
      this.touchIfOwner(host, req);
      json(res, 200, {
        universeId: host.id,
        name: host.name,
        bubbleId: host.ref.bubbleId || null,
        worldTick: host.worldTick,
        alive: host.isAlive,
      });
    });

    // Aggregates only. A per-bubble roster (ids, names, who is alive) is a map
    // for an attacker choosing whom to be seated beside; a player learns their
    // own bubble-mates from their own `/u/<id>/live/raids`.
    this.router.get('/api/bubbles', (_req, res) => {
      let seated = 0;
      let alive = 0;
      for (const bubble of this.bubbles.values()) {
        seated += bubble.size;
        alive += bubble.aliveCount;
      }
      json(res, 200, {
        bubbles: this.bubbles.size,
        seated,
        alive,
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

  /**
   * Seats waiting universes, oldest first. Called on every create and every
   * tick.
   *
   * 1. An open seat in a bubble holding at least one live universe — the
   *    loneliest such bubble first, so the player with nobody to raid gets
   *    company first, with ties broken by `crypto.randomInt` so a newcomer
   *    cannot predict whose bubble it lands in — unless a universe that
   *    raided this player's last one sits there. That avoidance is **per
   *    universe, not per player**: the lobby has no player identity, only the
   *    retired universe's inbound raid log, so it knows "this universe was
   *    raided by those" and nothing about who is behind either.
   * 2. A full `bubbleSize` batch of waiters forms a new bubble.
   * 3. Once anyone has waited `matchAfterMs`, two or more waiters form a short
   *    bubble; step 1 tops it up as others arrive.
   * 4. A lone waiter past `matchAfterMs` takes a seat even beside its raider:
   *    the avoidance is a preference, not a reason to wait forever.
   *
   * An ended universe is never seated, and its seat is open at once: it can
   * neither act nor be raided again (`status` never returns to `running`), so
   * holding the seat until eviction — an hour by default — would only leave
   * its live bubble-mates with nobody to raid. Its own history lives on its
   * host, not on the seat.
   */
  private match(): void {
    const now = this.clock.now();
    const overdue = (h: UniverseHost): boolean => now - (this.queuedAt.get(h.id) ?? now) >= this.matchAfterMs;
    this.waiting = this.waiting.filter((h) => h.isAlive && !this.seatInBubble(h, false));
    while (this.waiting.length >= this.bubbleSize) this.formBubble(this.waiting.splice(0, this.bubbleSize));
    if (this.waiting.length >= 2 && this.waiting.some(overdue)) this.formBubble(this.waiting.splice(0));
    this.waiting = this.waiting.filter((h) => !(overdue(h) && this.seatInBubble(h, true)));
  }

  /** Step 1 (and 4, with `besideRaiders`) of {@link match}: true when `host` was seated. */
  private seatInBubble(host: UniverseHost, besideRaiders: boolean): boolean {
    const avoid = besideRaiders ? undefined : this.avoid.get(host.id);
    let loneliest: Bubble[] = [];
    let fewest = Number.POSITIVE_INFINITY;
    for (const bubble of this.bubbles.values()) {
      const alive = bubble.aliveCount;
      if (alive === 0 || !bubble.hasRoom) continue;
      if (avoid !== undefined && [...avoid].some((id) => bubble.has(id) && bubble.get(id)?.isAlive === true)) continue;
      if (alive < fewest) {
        fewest = alive;
        loneliest = [bubble];
      } else if (alive === fewest) {
        loneliest.push(bubble);
      }
    }
    if (loneliest.length === 0) return false;
    // Server-side randomness, outside the rules path: no universe's state
    // depends on it, only which bubble a newcomer joins.
    const best = loneliest.length === 1 ? loneliest[0]! : loneliest[randomInt(loneliest.length)]!;
    best.add(host);
    this.queuedAt.delete(host.id);
    this.avoid.delete(host.id);
    return true;
  }

  /** A new bubble of `batch`, positioned in id order. */
  private formBubble(batch: UniverseHost[]): void {
    const bubble = new Bubble(this.clock.now(), this.bubbleSize, 0);
    for (const host of [...batch].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
      bubble.add(host);
      this.queuedAt.delete(host.id);
      this.avoid.delete(host.id);
    }
    this.bubbles.set(bubble.id, bubble);
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
    if (!this.ownerToken(id, sent)) {
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
    this.touchIfOwner(host, req);

    switch (`${req.method ?? 'GET'} ${route}`) {
      case 'GET session.json': {
        // `?pack=1`: every frame but the newest slimmed and sent as deltas
        // (`history.ts`), the newest whole as `frames`, starting at `from`.
        // What `ui/shared/session.js` asks for: a page paints from the newest
        // frame and reads history through `obs` alone. Without it, every frame
        // as stored — the shape `scripts/play-server.mjs` serves.
        if (url.searchParams.get('pack') === '1') {
          const from = host.frames.length - 1;
          json(res, 200, {
            ...this.doc.header(host),
            history: packHistory(host.frames.slice(0, from).map(slimFrame)),
            from,
            frames: host.frames.slice(from),
          });
          return;
        }
        json(res, 200, { ...this.doc.header(host), frames: host.frames });
        return;
      }
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
        const seats: Record<string, SeatOccupant | null> = {};
        for (let seat = 1; seat <= host.seatCount; seat += 1) seats[String(seat)] = null;
        json(res, 200, {
          universeId: host.id,
          name: host.name,
          species: host.speciesName,
          bubbleId: host.ref.bubbleId || null,
          worldTick: host.worldTick,
          seats: bubble === undefined ? seats : bubble.seats(host.id, host.seatCount),
          log: host.raidLog().map((r) => {
            const target = r.outbound ? host.raidTarget(r.raidId) : undefined;
            return target === undefined ? r : { ...r, target };
          }),
          inbound: host.inbound,
        });
        return;
      }
      case 'GET legacy': {
        // What this universe would carry into its player's next one if they
        // left it now (vision §8a), read by the ending screen and by setup
        // before "Weave a new universe" spends it. `legacy: null` while it is
        // still running, or when it stopped short of the server's cap — the
        // same answer `/api/create`'s retire would act on, from the same
        // `legacy()`. `carriedIn` is what this universe itself began with.
        const legacy = host.legacy();
        json(res, 200, {
          universeId: host.id,
          name: host.name,
          status: host.session.status(),
          worldTick: host.worldTick,
          serverCap: host.serverCap,
          legacy: legacy ?? null,
          carriedIn: host.carriedIn,
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
    const server = createServer({ requestTimeout: 30_000, headersTimeout: 10_000 }, (req, res) => {
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
        console.log(`  /api/bubbles       — bubble and universe counts`);
        console.log(`  /u/<id>/live/*     — one universe, read-only but for submit`);
        console.log(`  /ui/app/           — play the game`);
        resolve(server);
      });
    });
  }
}
