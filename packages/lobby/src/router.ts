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

/** A request body above {@link MAX_BODY}. Answered `413`, not `500`. */
export class BodyTooLarge extends Error {
  constructor() {
    super(`request body is larger than ${String(MAX_BODY)} bytes`);
  }
}

export const MAX_BODY = 64 * 1024;

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

/**
 * Reads a request body, refusing more than {@link MAX_BODY} bytes.
 *
 * Drains the rest rather than destroying the socket, so the caller can still
 * answer `413` on it.
 */
export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_BODY) reject(new BodyTooLarge());
      else resolve(Buffer.concat(chunks).toString());
    });
    req.on('error', reject);
  });
}

export function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
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
