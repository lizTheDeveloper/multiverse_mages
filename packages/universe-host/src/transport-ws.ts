/*
 * Multiverse Mages — HTTP transport for the universe server.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Zero third-party dependencies. Uses Node's built-in HTTP server.
 * The god connects via the same HTTP API the play server established,
 * so the existing UI works unchanged.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';

/**
 * A message the god sends over HTTP.
 *
 * Compatible with what `ui/app/index.html` already speaks.
 */
export interface GodMessage {
  readonly type: 'submit' | 'advance' | 'reset' | 'observe';
  readonly kind?: number;
  readonly params?: readonly number[];
  readonly ticks?: number;
  readonly seed?: number;
}

/**
 * A message the server sends to the god.
 */
export interface ServerMessage {
  readonly type: 'frame' | 'status' | 'error';
  readonly [key: string]: unknown;
}

export interface WsTransportOptions {
  readonly port: number;
  readonly onGodConnect: (send: (msg: ServerMessage) => void) => void;
  readonly onGodMessage: (msg: GodMessage) => void;
  readonly onGodDisconnect: () => void;
  readonly onHttpRequest?: (req: IncomingMessage, res: ServerResponse) => void;
}

/**
 * HTTP server that accepts god actions via POST and serves observation
 * frames via GET — the same API shape as `scripts/play-server.mjs`.
 *
 * No WebSocket, no third-party deps. The existing UI already speaks this.
 */
export class WsTransport {
  private httpServer: Server;
  private opts: WsTransportOptions;
  private godConnected = false;

  constructor(opts: WsTransportOptions) {
    this.opts = opts;
    this.httpServer = createServer((req, res) => {
      this.handleRequest(req, res);
    });
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://localhost`);

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === '/live/submit' && req.method === 'POST') {
      this.readJson(req).then((body) => {
        if (!this.godConnected) {
          this.godConnected = true;
          this.opts.onGodConnect(() => {});
        }
        this.opts.onGodMessage({
          type: 'submit',
          kind: body.kind as number,
          params: body.params as number[],
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }).catch(() => {
        res.writeHead(400);
        res.end('Bad request');
      });
    } else if (url.pathname === '/live/advance' && req.method === 'POST') {
      this.readJson(req).then((body) => {
        this.opts.onGodMessage({
          type: 'advance',
          ticks: (body.ticks as number) ?? 1,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }).catch(() => {
        res.writeHead(400);
        res.end('Bad request');
      });
    } else if (url.pathname === '/live/observe' && req.method === 'GET') {
      this.opts.onGodMessage({ type: 'observe' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } else if (this.opts.onHttpRequest) {
      this.opts.onHttpRequest(req, res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }

  private readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  listen(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.opts.port, () => resolve());
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.close(() => resolve());
    });
  }

  get connected(): boolean {
    return this.godConnected;
  }
}
