/*
 * Multiverse Mages — the page's live session against a real lobby.
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

/**
 * A page polls once a second; the lobby may tick faster. So when a player
 * clicks a target the page is usually some frames behind, and the submit's
 * answer starts at the server's frame index (`from`), past the page's end.
 * `ui/shared/session.js` used to set `doc.frames.length = from` there, which
 * left holes, and every paint after read `.obs` off one: "Cannot read
 * properties of undefined (reading 'obs')". These run the shipped client code
 * against the shipped lobby, over HTTP.
 */
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { GOD_ACTION } from '@mm/agent-api';
import { referenceContent } from '@mm/scenario';
import { manualClock } from '@mm/server';

import { frameDocument } from '../../../../scripts/lib/frame-document.mjs';
import { Lobby } from '../../src/lobby.js';

interface LiveSession {
  readonly frameCount: number;
  frame: (i: number) => { raw: unknown; knowledge: () => unknown };
  submit: (kind: number, params?: readonly number[]) => Promise<{ admitted: boolean; from: number }>;
  poll: () => Promise<number>;
}

const uiSession = (await import(
  // @ts-expect-error -- ui/ is a set of static files with no types to resolve.
  '../../../../ui/shared/session.js'
)) as unknown as {
  openSession: (source: { readonly live: string; readonly headers?: () => Record<string, string> }) => Promise<LiveSession>;
};

const doc = frameDocument(referenceContent(), 'lobby');
const cfg = { species: 'elf', tradition: 'true-naming', techniques: ['creo'], forms: ['ignem'], seed: 3, tickCap: 50 };

let server: Server | undefined;
afterEach(
  () =>
    new Promise<void>((r) => {
      if (server === undefined) r();
      else server.close(() => r());
      server = undefined;
    }),
);

async function setup(): Promise<{ lobby: Lobby; id: string; session: LiveSession }> {
  const lobby = new Lobby({ doc, clock: manualClock(0), maxUniverses: 2, evictAfterMs: 1000, quiet: true });
  server = await lobby.listen(0);
  const addr = server.address();
  const base = `http://127.0.0.1:${String(typeof addr === 'object' && addr ? addr.port : 0)}`;
  const made = (await (await fetch(`${base}/api/create`, { method: 'POST', body: JSON.stringify(cfg) })).json()) as {
    universeId: string;
    token: string;
  };
  const session = await uiSession.openSession({
    live: `${base}/u/${made.universeId}`,
    headers: () => ({ 'x-universe-token': made.token }),
  });
  return { lobby, id: made.universeId, session };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Every frame the page holds is a real frame — no hole a paint could read. */
function expectNoHoles(session: LiveSession): void {
  for (let i = 0; i < session.frameCount; i += 1) {
    expect(session.frame(i).raw, `frame ${String(i)}`).toBeDefined();
    expect(() => session.frame(i).knowledge()).not.toThrow();
  }
}

describe('ui/shared/session.js over a live lobby', () => {
  it('a submit made while the page is frames behind fills the gap instead of leaving holes', async () => {
    const { lobby, id, session } = await setup();
    expect(session.frameCount).toBe(1);
    // The server moves on; the page has not polled.
    lobby.tickAll();
    lobby.tickAll();
    lobby.tickAll();
    const pending = session.submit(GOD_ACTION.noop, []);
    for (let i = 0; i < 500 && lobby.universe(id)?.hasQueued !== true; i += 1) await sleep(2);
    expect(lobby.universe(id)?.hasQueued).toBe(true);
    lobby.tickAll();
    const answer = await pending;
    // The answer starts past the page's end: the case that broke.
    expect(answer.from).toBe(4);
    expect(session.frameCount).toBe(5);
    expectNoHoles(session);
  });

  it('a stale poll delivered after a submit never shortens what the page has', async () => {
    const { lobby, id, session } = await setup();
    const pending = session.submit(GOD_ACTION.noop, []);
    for (let i = 0; i < 500 && lobby.universe(id)?.hasQueued !== true; i += 1) await sleep(2);
    lobby.tickAll();
    await pending;
    expect(session.frameCount).toBe(2);
    expect(await session.poll()).toBe(0);
    lobby.tickAll();
    expect(await session.poll()).toBe(1);
    expect(session.frameCount).toBe(3);
    expectNoHoles(session);
  });
});
