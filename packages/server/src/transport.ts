/*
 * Multiverse Mages — the socket. Node's own `net`, and nothing else.
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

import { createServer, type Server, type Socket } from 'node:net';

import { BoundedLineReader, encodeFrame, FrameTooLongError } from './codec.js';
import type { MatchHost } from './host.js';
import type { ServerFrame } from './protocol.js';

/**
 * The transport, kept deliberately thin and deliberately dependency-free.
 *
 * ## Why `node:net` and not a WebSocket or a framework
 *
 * Zero runtime dependencies, and the reason is legal as much as technical.
 * `CLAUDE.md` makes the AGPL network clause *"the point"* of this package:
 * anyone running a modified server as a service must be able to offer its source
 * to users, and the proposal adds that the deployment must be reproducible by a
 * stranger — *"no proprietary deployment dependency, no service-only
 * component."* A source offer a stranger can act on is one they can build. Every
 * dependency added here is a licence someone downstream has to check and a
 * supply chain they have to trust, for a protocol that is one JSON object per
 * line over TCP. Node ships `net`; a dependency would have to be better than
 * "already installed and already AGPL-compatible by virtue of not existing".
 *
 * A WebSocket becomes worth its dependency when a browser must connect. Vision
 * §10 puts the client in Electron and §12 puts a web client out of scope for v1,
 * so that day is not today — and `electron-client` can reach a TCP socket from
 * its main process without any of this changing.
 *
 * ## What this file may not do
 *
 * Decide anything. It turns bytes into lines and lines into
 * {@link MatchHost.receive} calls, and turns frames into bytes. Every refusal,
 * every ordering decision and every hash comparison lives above it, which is
 * what lets the unit tests exercise the whole host with no socket at all.
 */

/** How the listener is configured. */
export interface ListenOptions {
  /**
   * The TCP port. **`0` asks the operating system for a free one**, which is
   * what the tests use — a hard-coded port makes two parallel test runs fight
   * over it, and the failure reads as a flaky server rather than as a port
   * collision. Read the real port from {@link MatchServer.port} afterwards.
   */
  readonly port: number;
  /**
   * The interface to bind. Defaults to loopback.
   *
   * Loopback by default on purpose: a server that binds every interface the
   * moment it is started is a server that is exposed by a typo. An operator who
   * wants it reachable says so, and `deployment.md` says what else they must
   * have in place first.
   */
  readonly host?: string;
  /** Wall-clock milliseconds between {@link MatchHost.pump} calls. */
  readonly pumpIntervalMs?: number;
}

/**
 * A listening authoritative server.
 *
 * One `MatchHost`, one TCP listener, and a timer that pumps the host. Nothing
 * else.
 */
export class MatchServer {
  private readonly server: Server;
  private timer: NodeJS.Timeout | undefined;
  private connectionCounter = 0;
  private readonly sockets = new Set<Socket>();

  constructor(
    private readonly host: MatchHost,
    private readonly options: ListenOptions,
  ) {
    this.server = createServer((socket) => {
      this.accept(socket);
    });
  }

  /** The port actually bound. Meaningful only after {@link listen} resolves. */
  get port(): number {
    const address = this.server.address();
    return address === null || typeof address === 'string' ? 0 : address.port;
  }

  /** Binds and starts pumping. */
  async listen(): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.options.port, this.options.host ?? '127.0.0.1', () => {
        this.server.removeListener('error', reject);
        resolve();
      });
    });
    const interval = this.options.pumpIntervalMs ?? 5;
    this.timer = setInterval(() => {
      this.host.pump();
    }, interval);
    // The pump timer must not be the reason the process stays alive; the
    // listener already is. Otherwise a server whose listener closed would hang
    // on a timer nobody is waiting for.
    this.timer.unref();
    return this.port;
  }

  /** Stops listening and drops every connection. */
  async close(): Promise<void> {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  private accept(socket: Socket): void {
    this.connectionCounter += 1;
    const id = `conn-${this.connectionCounter}`;
    this.sockets.add(socket);
    socket.setEncoding('utf8');
    // Frames are small and latency matters more than packing: without this a
    // 40 ms submission deadline meets a 40 ms delayed-ACK and every tick
    // substitutes a no-op for an action that was sent on time.
    socket.setNoDelay(true);

    const reader = new BoundedLineReader();
    this.host.connect({
      id,
      send: (frame: ServerFrame): void => {
        if (!socket.destroyed) socket.write(encodeFrame(frame));
      },
      close: (): void => {
        // `end` rather than `destroy`: a refusal frame written immediately
        // before this must reach the peer, and destroying the socket drops
        // whatever is still in the kernel's buffer. A client told nothing about
        // why it was refused reconnects and is refused again.
        socket.end();
      },
    });

    socket.on('data', (chunk: string) => {
      let lines: string[];
      try {
        lines = reader.push(chunk);
      } catch (error) {
        if (error instanceof FrameTooLongError) {
          socket.destroy();
          this.host.disconnect(id);
          return;
        }
        throw error;
      }
      for (const line of lines) this.host.receive(id, line);
      // Pumped here as well as on the timer so that a tick whose last
      // submission just arrived closes immediately rather than waiting for the
      // next interval. It cannot change what the tick contains — see host.ts on
      // why closing early is safe — only when it closes.
      this.host.pump();
    });

    const drop = (): void => {
      this.sockets.delete(socket);
      this.host.disconnect(id);
    };
    socket.on('close', drop);
    socket.on('error', drop);
  }
}
