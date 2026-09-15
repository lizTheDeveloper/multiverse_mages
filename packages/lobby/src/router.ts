/*
 * Multiverse Mages — zero-dependency HTTP router.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body: string,
) => void | Promise<void>;

interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];

  get(path: string, handler: RouteHandler): this {
    this.routes.push({ method: 'GET', path, handler });
    return this;
  }

  post(path: string, handler: RouteHandler): this {
    this.routes.push({ method: 'POST', path, handler });
    return this;
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';
    const path = url.split('?')[0];

    const route = this.routes.find(
      (r) => r.method === method && r.path === path,
    );
    if (!route) return false;

    const body = await readBody(req);
    await route.handler(req, res, body);
    return true;
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX = 64 * 1024;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX) {
        req.destroy();
        reject(new Error('body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

export function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

export function text(res: ServerResponse, status: number, msg: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain',
    'Content-Length': Buffer.byteLength(msg),
  });
  res.end(msg);
}
