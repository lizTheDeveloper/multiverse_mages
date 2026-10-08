/*
 * Multiverse Mages — the lobby keeps time; a browser only watches and asks.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { GOD_ACTION } from '@mm/agent-api';
import { referenceContent } from '@mm/scenario';
import { manualClock, type ManualClock } from '@mm/server';

import { frameDocument } from '../../../../scripts/lib/frame-document.mjs';
import { Lobby, type LobbyOptions } from '../../src/lobby.js';

const doc = frameDocument(referenceContent(), 'lobby');
const cfg = { species: 'elf', tradition: 'true-naming', techniques: ['creo'], forms: ['ignem'], seed: 3, tickCap: 50 };

interface Frame {
  mask: number[];
  candidates: Record<string, { params: number[] }[]>;
  status: string;
}

let server: Server | undefined;
let base = '';
let lobby: Lobby;
let clock: ManualClock;

async function start(opts: Partial<LobbyOptions> = {}): Promise<void> {
  clock = manualClock(0);
  lobby = new Lobby({ doc, clock, maxUniverses: 2, evictAfterMs: 1000, quiet: true, ...opts });
  server = await lobby.listen(0);
  const addr = server.address();
  base = `http://127.0.0.1:${String(typeof addr === 'object' && addr ? addr.port : 0)}`;
}

afterEach(
  () =>
    new Promise<void>((r) => {
      if (server === undefined) r();
      else server.close(() => r());
      server = undefined;
    }),
);

const post = (p: string, body: unknown): Promise<Response> =>
  fetch(base + p, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const getJson = async <T = Record<string, unknown>>(p: string): Promise<T> => (await (await fetch(base + p)).json()) as T;
const create = async (over: Record<string, unknown> = {}): Promise<string> =>
  ((await (await post('/api/create', { ...cfg, ...over })).json()) as { universeId: string }).universeId;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
/** Waits until the server has queued a submit on `id` — no fixed sleep to race. */
const queued = async (id: string): Promise<void> => {
  for (let i = 0; i < 500 && lobby.universe(id)?.hasQueued !== true; i += 1) await sleep(2);
  expect(lobby.universe(id)?.hasQueued).toBe(true);
};

describe('Lobby', () => {
  it('does not move time on reads, only on tickAll', async () => {
    await start();
    const id = await create();
    const a = await getJson<{ frames: unknown[] }>(`/u/${id}/live/session.json`);
    await fetch(`${base}/u/${id}/live/frames?since=0`);
    await getJson(`/u/${id}/live/raids`);
    expect(a.frames).toHaveLength(1);
    lobby.tickAll();
    lobby.tickAll();
    const b = await getJson<{ from: number; frames: unknown[] }>(`/u/${id}/live/frames?since=1`);
    expect(b.from).toBe(1);
    expect(b.frames).toHaveLength(2);
  });

  it('refuses every route that would let a browser drive time', async () => {
    await start();
    const id = await create();
    for (const r of ['advance', 'reset', 'control', 'sandbox']) {
      const res = await post(`/u/${id}/live/${r}`, { ticks: 500 });
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: string }).error).toMatch(/keeps time/);
    }
    // ...and none of them moved it.
    expect((await getJson<{ frames: unknown[] }>(`/u/${id}/live/session.json`)).frames).toHaveLength(1);
  });

  it('applies a submit on the next tick and answers with that frame', async () => {
    await start();
    const id = await create();
    const pending = post(`/u/${id}/live/submit`, { kind: GOD_ACTION.noop, params: [] });
    await queued(id);
    const second = await post(`/u/${id}/live/submit`, { kind: GOD_ACTION.noop });
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: string }).error).toMatch(/already queued/);
    lobby.tickAll();
    const res = (await (await pending).json()) as { admitted: boolean; from: number; frames: unknown[] };
    expect(res).toMatchObject({ admitted: true, from: 1 });
    expect(res.frames).toHaveLength(1);
  });

  it('answers 400 to a malformed action and to a bad config, and 413 to a huge body', async () => {
    await start();
    const id = await create();
    expect((await post(`/u/${id}/live/submit`, { kind: 999 })).status).toBe(400);
    expect((await post(`/u/${id}/live/submit`, 'not json')).status).toBe(400);
    expect((await post('/api/create', { ...cfg, species: 'hobbit' })).status).toBe(400);
    expect((await post('/api/create', 'not json')).status).toBe(400);
    expect((await post(`/u/${id}/live/submit`, 'x'.repeat(70 * 1024))).status).toBe(413);
  });

  it('caps the number of universes with 503', async () => {
    await start();
    await create();
    await create();
    const r = await post('/api/create', cfg);
    expect(r.status).toBe(503);
    expect(((await r.json()) as { error: string }).error).toMatch(/full/i);
  });

  it('404s an unknown universe with a reason', async () => {
    await start();
    const r = await fetch(`${base}/u/00000000-0000-0000-0000-000000000000/live/session.json`);
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: string }).error).toMatch(/restart/);
    expect((await post('/api/rejoin', { universeId: 'nope' })).status).toBe(404);
  });

  it('rejoins a live universe', async () => {
    await start();
    const id = await create();
    lobby.tickAll();
    const r = await post('/api/rejoin', { universeId: id });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ universeId: id, alive: true, worldTick: 1 });
  });

  it('stops ticking an ended universe and evicts it once untouched', async () => {
    await start();
    const id = await create({ tickCap: 2 });
    for (let i = 0; i < 5; i += 1) lobby.tickAll();
    const n = (await getJson<{ frames: unknown[] }>(`/u/${id}/live/session.json`)).frames.length;
    lobby.tickAll();
    expect((await getJson<{ frames: unknown[] }>(`/u/${id}/live/frames?since=${String(n)}`)).frames).toHaveLength(0);
    expect((await post(`/u/${id}/live/submit`, { kind: GOD_ACTION.noop })).status).toBe(409);
    // Touched just now, so one more tick does not evict it...
    lobby.tickAll();
    expect((await post('/api/rejoin', { universeId: id })).status).toBe(200);
    // ...but an hour (here: a second) of nobody looking does.
    clock.advance(1001);
    lobby.tickAll();
    expect((await post('/api/rejoin', { universeId: id })).status).toBe(404);
    // And the slot is free again.
    expect((await post('/api/create', cfg)).status).toBe(200);
  });

  it('redirects / to the game', async () => {
    await start();
    const r = await fetch(base + '/', { redirect: 'manual' });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/ui/app/');
  });

  it('lists bubbles, and forms one when enough universes wait', async () => {
    await start({ bubbleSize: 2 });
    expect(await getJson('/api/bubbles')).toMatchObject({ bubbles: [], waiting: 0 });
    const a = await create();
    expect(await getJson('/api/bubbles')).toMatchObject({ bubbles: [], waiting: 1 });
    const b = await create();
    const listed = await getJson<{ bubbles: { members: { universeId: string }[] }[]; waiting: number }>('/api/bubbles');
    expect(listed.waiting).toBe(0);
    expect(listed.bubbles).toHaveLength(1);
    expect(listed.bubbles[0]!.members.map((m) => m.universeId).sort()).toEqual([a, b].sort());
    expect((await getJson<{ seats: unknown }>(`/u/${a}/live/raids`)).seats).toEqual({ '1': b });
    expect((await getJson<{ seats: unknown }>(`/u/${b}/live/raids`)).seats).toEqual({ '1': a });
  });

  it('shows an empty seat before the bubble forms', async () => {
    await start({ bubbleSize: 3 });
    const a = await create();
    expect(await getJson(`/u/${a}/live/raids`)).toMatchObject({ seats: { '1': null, '2': null }, log: [], inbound: [] });
  });

  it('lets two bubble-mates raid each other over /u/<id>/live/*', async () => {
    await start({ bubbleSize: 2 });
    const portal = {
      foundingPortalMagic: 1,
      tickCap: 4000,
      species: 'human',
      // Portal magic is `rego-limen`: a square without that cell can never open
      // one, however many raiders it names.
      techniques: ['creo', 'rego'],
      forms: ['ignem', 'limen'],
    };
    const a = await create({ ...portal, seed: 1 });
    const b = await create({ ...portal, seed: 2 });

    let frames = 1;
    const latest = async (id: string): Promise<Frame> => {
      const r = await getJson<{ from: number; frames: Frame[] }>(`/u/${id}/live/frames?since=${String(frames - 1)}`);
      frames = r.from + r.frames.length;
      return r.frames[r.frames.length - 1]!;
    };
    /** One tick for every universe, with `action` queued on A. */
    const submit = async (kind: number, params: number[]): Promise<{ admitted: boolean }> => {
      const pending = post(`/u/${a}/live/submit`, { kind, params });
      await queued(a);
      lobby.tickAll();
      return (await (await pending).json()) as { admitted: boolean };
    };

    // The role's number, read off the published header the way a page reads it.
    const roles = (await getJson<{ content: { mageRoles: Record<string, string> } }>(`/u/${a}/live/session.json`))
      .content.mageRoles;
    const raider = Number(Object.entries(roles).find(([, name]) => name === 'raider')![0]);

    for (let i = 0; i < 12; i += 1) lobby.tickAll();
    // Name raiders until the portal is open to us. The founder's portal node
    // does not last — measured, its window here is roughly ticks 14-65 — so the
    // loop stops naming the moment one raider and an open portal coincide.
    let named = 0;
    let f = await latest(a);
    for (let i = 0; i < 60 && !(named >= 1 && f.mask[GOD_ACTION.openPortal] === 1); i += 1) {
      const slot = (f.candidates[String(GOD_ACTION.assignRole)] ?? []).findIndex((c) => c.params[1] === raider);
      if (slot >= 0 && f.mask[GOD_ACTION.assignRole] === 1 && named < 6) {
        if ((await submit(GOD_ACTION.assignRole, [slot])).admitted) named += 1;
      } else {
        lobby.tickAll();
      }
      f = await latest(a);
    }
    // A one-species founding has fewer mages to spare than the all-species
    // universe `peer-raid.test.ts` arms; one raider is enough to open a portal.
    expect(named).toBeGreaterThanOrEqual(1);
    expect(f.mask[GOD_ACTION.openPortal]).toBe(1);
    expect(frames).toBeGreaterThan(1);

    expect((await submit(GOD_ACTION.openPortal, [0])).admitted).toBe(true);

    const attacker = await getJson<{ seats: Record<string, string | null>; log: { outbound: boolean }[] }>(
      `/u/${a}/live/raids`,
    );
    expect(attacker.seats).toEqual({ '1': b });
    expect(attacker.log.filter((r) => r.outbound)).toHaveLength(1);

    const defender = await getJson<{ inbound: { fromUniverseId: string; record: { outbound: boolean } }[] }>(
      `/u/${b}/live/raids`,
    );
    expect(defender.inbound).toHaveLength(1);
    expect(defender.inbound[0]!.fromUniverseId).toBe(a);
    expect(defender.inbound[0]!.record.outbound).toBe(true);
  }, 120_000);
});
