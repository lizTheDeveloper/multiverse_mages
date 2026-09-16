/*
 * Multiverse Mages — MMO lobby service.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The player's entry point. Creates universes, matches them into bubbles,
 * routes WebSocket connections, and serves the UI. Zero runtime dependencies.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { Router, json, text } from './router.js';
import { UniverseHost, type UniverseConfig } from './universe-host.js';
import { Bubble, type BubbleInfo } from './bubble.js';

/** Vision §13: "small clears fast and churns tiers while large makes raids
 * frequent and promotion rare." Start with 4. */
const BUBBLE_SIZE = 4;

interface PendingUniverse {
  host: UniverseHost;
  config: UniverseConfig;
  createdAt: number;
}

interface TierEntry {
  bubbleId: string;
  winnerId: string;
  promotedAt: number;
}

export interface LobbyOptions {
  port?: number;
  uiRoot?: string;
}

export class Lobby {
  private universes = new Map<string, UniverseHost>();
  private bubbles = new Map<string, Bubble>();
  private waiting: PendingUniverse[] = [];
  private ladder: TierEntry[] = [];
  private router = new Router();
  private uiRoot: string;

  constructor(opts: LobbyOptions = {}) {
    this.uiRoot = opts.uiRoot ?? path.resolve('ui');
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.post('/api/create', async (_req, res, body) => {
      try {
        const config: UniverseConfig = JSON.parse(body);
        const host = new UniverseHost(config);
        this.universes.set(host.id, host);

        this.waiting.push({ host, config, createdAt: Date.now() });
        this.tryFormBubble();

        json(res, 200, {
          universeId: host.id,
          bubbleId: host.ref.bubbleId || null,
          worldTick: host.worldTick,
          bubbleSize: BUBBLE_SIZE,
          waiting: this.waiting.length,
        });
      } catch (e) {
        json(res, 400, { error: (e as Error).message });
      }
    });

    this.router.post('/api/rejoin', async (_req, res, body) => {
      try {
        const { universeId } = JSON.parse(body);
        const host = this.universes.get(universeId);
        if (!host) {
          json(res, 404, { error: 'universe not found' });
          return;
        }
        json(res, 200, {
          universeId: host.id,
          bubbleId: host.ref.bubbleId,
          worldTick: host.worldTick,
          alive: host.isAlive,
        });
      } catch (e) {
        json(res, 400, { error: (e as Error).message });
      }
    });

    this.router.get('/api/bubbles', async (_req, res) => {
      const infos: BubbleInfo[] = [];
      for (const bubble of this.bubbles.values()) {
        infos.push(bubble.info());
      }
      json(res, 200, { bubbles: infos, waiting: this.waiting.length });
    });

    this.router.get('/api/ladder', async (_req, res) => {
      json(res, 200, { ladder: this.ladder });
    });

    // Universe-specific API — mirrors play-server.mjs
    this.router.post('/api/universe/submit', async (_req, res, body) => {
      try {
        const { universeId, kind, params } = JSON.parse(body);
        const host = this.universes.get(universeId);
        if (!host) { json(res, 404, { error: 'not found' }); return; }
        host.submit(kind, params ?? []);
        json(res, 200, { ok: true, tick: host.worldTick });
      } catch (e) {
        json(res, 400, { error: (e as Error).message });
      }
    });

    this.router.post('/api/universe/advance', async (_req, res, body) => {
      try {
        const { universeId, ticks } = JSON.parse(body);
        const host = this.universes.get(universeId);
        if (!host) { json(res, 404, { error: 'not found' }); return; }
        host.advance(ticks ?? 1);
        json(res, 200, { ok: true, tick: host.worldTick });
      } catch (e) {
        json(res, 400, { error: (e as Error).message });
      }
    });

    this.router.get('/api/universe/observe', async (req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const universeId = url.searchParams.get('universeId');
      if (!universeId) { json(res, 400, { error: 'missing universeId' }); return; }
      const host = this.universes.get(universeId);
      if (!host) { json(res, 404, { error: 'not found' }); return; }
      const { obs, mask } = host.observe();
      json(res, 200, { universeId, tick: host.worldTick, obs, mask });
    });

    this.router.get('/api/universe/portal-targets', async (req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const universeId = url.searchParams.get('universeId');
      if (!universeId) { json(res, 400, { error: 'missing universeId' }); return; }
      const host = this.universes.get(universeId);
      if (!host) { json(res, 404, { error: 'not found' }); return; }
      const bubble = this.findBubble(host.ref.bubbleId);
      if (!bubble) { json(res, 200, { targets: [] }); return; }
      const targets = bubble.portalTargets(universeId).map((t) => ({
        universeId: t.id,
        alive: t.isAlive,
        tick: t.worldTick,
      }));
      json(res, 200, { targets });
    });
  }

  private tryFormBubble(): void {
    while (this.waiting.length >= BUBBLE_SIZE) {
      const batch = this.waiting.splice(0, BUBBLE_SIZE);
      const bubble = new Bubble(0);
      for (const { host } of batch) {
        bubble.add(host);
      }
      this.bubbles.set(bubble.id, bubble);
    }
  }

  private findBubble(bubbleId: string): Bubble | undefined {
    return this.bubbles.get(bubbleId);
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (await this.router.handle(req, res)) return;

    // Static file serving for the UI
    const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
    await this.serveStatic(urlPath, res);
  }

  private async serveStatic(urlPath: string, res: ServerResponse): Promise<void> {
    const root = path.resolve(this.uiRoot, '..');
    const decoded = decodeURIComponent(urlPath).replace(/\0/g, '');
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
        '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
        '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
        '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
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

  listen(port: number): void {
    const server = createServer((req, res) => {
      this.handleRequest(req, res).catch((e) => {
        console.error('request error:', e);
        if (!res.headersSent) text(res, 500, 'internal error');
      });
    });
    server.listen(port, () => {
      console.log(`Multiverse Mages lobby on http://localhost:${port}/`);
      console.log(`  /api/create  — start a universe`);
      console.log(`  /api/bubbles — list active bubbles`);
      console.log(`  /ui/app/     — play the game`);
    });
  }
}
