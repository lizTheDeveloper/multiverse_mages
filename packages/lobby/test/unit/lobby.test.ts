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

/** Owner tokens by universe id, as `/api/create` handed them out. */
const tokens = new Map<string, string>();
const post = (p: string, body: unknown, token?: string): Promise<Response> =>
  fetch(base + p, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...(token === undefined ? {} : { headers: { 'x-universe-token': token } }),
  });
/** A submit, carrying the universe's own token. */
const submitAs = (id: string, body: unknown): Promise<Response> => post(`/u/${id}/live/submit`, body, tokens.get(id));
const getJson = async <T = Record<string, unknown>>(p: string): Promise<T> => (await (await fetch(base + p)).json()) as T;
const create = async (over: Record<string, unknown> = {}): Promise<string> => {
  const made = (await (await post('/api/create', { ...cfg, ...over })).json()) as { universeId: string; token: string };
  tokens.set(made.universeId, made.token);
  return made.universeId;
};
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
    const pending = submitAs(id, { kind: GOD_ACTION.noop, params: [] });
    await queued(id);
    const second = await submitAs(id, { kind: GOD_ACTION.noop });
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
    expect((await submitAs(id, { kind: 999 })).status).toBe(400);
    expect((await submitAs(id, 'not json')).status).toBe(400);
    expect((await post('/api/create', { ...cfg, species: 'hobbit' })).status).toBe(400);
    expect((await post('/api/create', 'not json')).status).toBe(400);
    expect((await submitAs(id, 'x'.repeat(70 * 1024))).status).toBe(413);
  });

  it('takes a submit only from the universe owner', async () => {
    await start();
    const mine = await create();
    const theirs = await create();
    const token = tokens.get(mine)!;
    expect(token).toMatch(/^[0-9a-f]{64}$/u);
    expect(token).not.toContain(mine.replace(/-/gu, ''));
    expect(tokens.get(theirs)).not.toBe(token);

    const noop = { kind: GOD_ACTION.noop };
    expect((await post(`/u/${mine}/live/submit`, noop)).status).toBe(401);
    expect((await post(`/u/${mine}/live/submit`, noop, tokens.get(theirs))).status).toBe(403);
    expect((await post(`/u/${mine}/live/submit`, noop, 'not-hex')).status).toBe(403);
    // Neither refusal queued anything: the owner's own submit is not a 409.
    const pending = post(`/u/${mine}/live/submit`, noop, token);
    await queued(mine);
    lobby.tickAll();
    expect((await pending).status).toBe(200);
    // The token never appears on a public read.
    for (const route of ['session.json', 'frames?since=0', 'raids']) {
      expect(await (await fetch(`${base}/u/${mine}/live/${route}`)).text()).not.toContain(token);
    }
    expect(await (await fetch(`${base}/api/bubbles`)).text()).not.toContain(token);
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

  it('stops ticking an ended universe and evicts it a fixed time after it ended', async () => {
    await start();
    const id = await create({ tickCap: 2 });
    for (let i = 0; i < 5; i += 1) lobby.tickAll();
    const n = (await getJson<{ frames: unknown[] }>(`/u/${id}/live/session.json`)).frames.length;
    lobby.tickAll();
    expect((await getJson<{ frames: unknown[] }>(`/u/${id}/live/frames?since=${String(n)}`)).frames).toHaveLength(0);
    expect((await submitAs(id, { kind: GOD_ACTION.noop })).status).toBe(409);
    expect((await post('/api/rejoin', { universeId: id })).status).toBe(200);
    clock.advance(1001);
    lobby.tickAll();
    expect((await post('/api/rejoin', { universeId: id })).status).toBe(404);
    // And the slot is free again.
    expect((await post('/api/create', cfg)).status).toBe(200);
  });

  it('does not let anyone keep an ended universe alive by reading it (slot squatting)', async () => {
    await start();
    const id = await create({ tickCap: 2 });
    for (let i = 0; i < 4; i += 1) lobby.tickAll(); // ended
    // A stranger, without the token, polls it every 300 ms of lobby time...
    for (let i = 0; i < 5; i += 1) {
      clock.advance(300);
      await fetch(`${base}/u/${id}/live/frames?since=0`);
      await fetch(`${base}/u/${id}/live/session.json`);
      await post('/api/rejoin', { universeId: id });
      lobby.tickAll();
    }
    // ...and it is gone anyway, 1000 ms after it ended.
    expect(lobby.universe(id)).toBeUndefined();
    // Even its owner's reads do not extend an ended universe.
    const owned = await create({ tickCap: 2 });
    for (let i = 0; i < 4; i += 1) lobby.tickAll();
    for (let i = 0; i < 5; i += 1) {
      clock.advance(300);
      await fetch(`${base}/u/${owned}/live/frames?since=0`, { headers: { 'x-universe-token': tokens.get(owned)! } });
      lobby.tickAll();
    }
    expect(lobby.universe(owned)).toBeUndefined();
  });

  it('retires a running universe its owner has left, however often strangers read it', async () => {
    await start({ idleAfterMs: 5000 });
    const mine = await create();
    const theirs = await create();
    for (let i = 0; i < 6; i += 1) {
      clock.advance(1000);
      // The owner of `mine` keeps polling with the token; `theirs` is only read by strangers.
      await fetch(`${base}/u/${mine}/live/frames?since=0`, { headers: { 'x-universe-token': tokens.get(mine)! } });
      await fetch(`${base}/u/${theirs}/live/frames?since=0`);
      await post('/api/rejoin', { universeId: theirs });
      lobby.tickAll();
    }
    expect(lobby.universe(mine)?.isAlive).toBe(true);
    expect(lobby.universe(theirs)).toBeUndefined();
  });

  it('retires the universe a player leaves when they create the next', async () => {
    await start();
    const old = await create();
    await create(); // the server is now full (maxUniverses 2)
    expect((await post('/api/create', cfg)).status).toBe(503);
    // Naming a universe without its token retires nothing.
    expect((await post('/api/create', { ...cfg, retire: { universeId: old, token: 'f'.repeat(64) } })).status).toBe(503);
    expect(lobby.universe(old)).toBeDefined();
    // With it, the old one goes and the new one takes its slot.
    const r = await post('/api/create', { ...cfg, retire: { universeId: old, token: tokens.get(old) } });
    expect(r.status).toBe(200);
    expect(lobby.universe(old)).toBeUndefined();
  });

  it('refuses a tickCap above the default over HTTP', async () => {
    await start();
    const r = await post('/api/create', { ...cfg, tickCap: 100_000 });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toMatch(/tickCap must be 1\.\.4000/u);
    expect((await post('/api/create', { ...cfg, tickCap: 4000 })).status).toBe(200);
  });

  it('redirects / to the game', async () => {
    await start();
    const r = await fetch(base + '/', { redirect: 'manual' });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/ui/app/');
  });

  it('counts bubbles without naming who is in them, and forms one when enough universes wait', async () => {
    await start({ bubbleSize: 2 });
    expect(await getJson('/api/bubbles')).toMatchObject({ bubbles: 0, waiting: 0 });
    const a = await create();
    expect(await getJson('/api/bubbles')).toMatchObject({ bubbles: 0, waiting: 1 });
    const b = await create();
    const raw = await (await fetch(`${base}/api/bubbles`)).text();
    expect(JSON.parse(raw)).toMatchObject({ bubbles: 1, seated: 2, alive: 2, waiting: 0, universes: 2 });
    // Aggregates only: no id, no name, nothing to pick a victim by.
    for (const id of [a, b]) expect(raw).not.toContain(id);
    expect(raw).not.toMatch(/name|members|universeId/u);
    const seat = (id: string): unknown => ({ universeId: id, name: expect.any(String), species: 'Elf' });
    expect((await getJson<{ seats: unknown }>(`/u/${a}/live/raids`)).seats).toEqual({ '1': seat(b) });
    expect((await getJson<{ seats: unknown }>(`/u/${b}/live/raids`)).seats).toEqual({ '1': seat(a) });
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
    const a = await create({ ...portal, seed: 1, name: 'The Ember Court' });
    const b = await create({ ...portal, seed: 2, name: 'Quiet Fen' });

    let frames = 1;
    const latest = async (id: string): Promise<Frame> => {
      const r = await getJson<{ from: number; frames: Frame[] }>(`/u/${id}/live/frames?since=${String(frames - 1)}`);
      frames = r.from + r.frames.length;
      return r.frames[r.frames.length - 1]!;
    };
    /** One tick for every universe, with `action` queued on A. */
    const submit = async (kind: number, params: number[]): Promise<{ admitted: boolean }> => {
      const pending = submitAs(a, { kind, params });
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

    const attacker = await getJson<{ seats: Record<string, unknown>; log: { outbound: boolean; target?: unknown }[] }>(
      `/u/${a}/live/raids`,
    );
    expect(attacker.seats).toEqual({ '1': { universeId: b, name: 'Quiet Fen', species: 'Human' } });
    expect(attacker.log.filter((r) => r.outbound)).toHaveLength(1);
    // The report names whom it hit, as they were when the portal opened.
    expect(attacker.log.find((r) => r.outbound)!.target).toEqual({ universeId: b, name: 'Quiet Fen', species: 'Human' });

    const defender = await getJson<{
      inbound: { fromUniverseId: string; fromName: string; record: { outbound: boolean } }[];
    }>(`/u/${b}/live/raids`);
    expect(defender.inbound).toHaveLength(1);
    expect(defender.inbound[0]!.fromUniverseId).toBe(a);
    expect(defender.inbound[0]!.fromName).toBe('The Ember Court');
    expect(defender.inbound[0]!.record.outbound).toBe(true);
  }, 120_000);
});
