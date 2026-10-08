/*
 * Multiverse Mages — bubbles refill, short bubbles form after a wait, seats never shuffle.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { OBSERVATION_BLOCKS } from '@mm/agent-api';
import type { RaidRecord } from '@mm/scenario';
import { referenceContent } from '@mm/scenario';
import { manualClock, type ManualClock } from '@mm/server';

import { frameDocument } from '../../../../scripts/lib/frame-document.mjs';
import { Lobby, type LobbyOptions } from '../../src/lobby.js';

const doc = frameDocument(referenceContent(), 'matchmaking');
const cfg = { species: 'elf', tradition: 'true-naming', techniques: ['creo'], forms: ['ignem'], seed: 3, tickCap: 400 };

let server: Server | undefined;
let base = '';
let lobby: Lobby;
let clock: ManualClock;

async function start(opts: Partial<LobbyOptions>): Promise<void> {
  clock = manualClock(0);
  lobby = new Lobby({ doc, clock, maxUniverses: 32, quiet: true, ...opts });
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

const tokens = new Map<string, string>();
interface Made {
  universeId: string;
  name: string;
  bubbleId: string | null;
  waiting: number;
}
const createRaw = (body: Record<string, unknown>): Promise<Response> =>
  fetch(`${base}/api/create`, { method: 'POST', body: JSON.stringify({ ...cfg, ...body }) });
const create = async (over: Record<string, unknown> = {}): Promise<Made> => {
  const res = await createRaw(over);
  expect(res.status).toBe(200);
  const made = (await res.json()) as Made & { token: string };
  tokens.set(made.universeId, made.token);
  return made;
};
/** "New universe": create one, retiring `old` with its token. */
const replace = (old: string, over: Record<string, unknown> = {}): Promise<Made> =>
  create({ ...over, retire: { universeId: old, token: tokens.get(old) } });
type Seats = Record<string, { universeId: string; name: string; species: string } | null>;
const seats = async (id: string): Promise<Seats> =>
  ((await (await fetch(`${base}/u/${id}/live/raids`)).json()) as { seats: Seats }).seats;
/** Seat number → occupant id, the shape stability is judged on. */
const seatIds = async (id: string): Promise<Record<string, string | null>> =>
  Object.fromEntries(Object.entries(await seats(id)).map(([k, v]) => [k, v?.universeId ?? null]));
const bubbleOf = (id: string): string => lobby.universe(id)!.ref.bubbleId;

describe('Lobby matchmaking', () => {
  it('fills a retired universe’s seat at once instead of queueing the newcomer', async () => {
    await start({ bubbleSize: 3 });
    const [a, b, c] = [await create(), await create(), await create()];
    const bubble = bubbleOf(a.universeId);
    expect(bubble).not.toBe('');

    // The playtest: two of three players press "new universe".
    const b2 = await replace(b.universeId);
    const c2 = await replace(c.universeId);
    expect(b2.bubbleId).toBe(bubble);
    expect(c2.bubbleId).toBe(bubble);
    expect(c2.waiting).toBe(0);
    const aSeats = Object.values(await seatIds(a.universeId)).sort();
    expect(aSeats).toEqual([b2.universeId, c2.universeId].sort());
  });

  it('keeps every member’s seat numbers when a mate leaves and another joins', async () => {
    await start({ bubbleSize: 4 });
    const made = [await create(), await create(), await create(), await create()];
    const ids = made.map((m) => m.universeId);
    const before = new Map<string, Record<string, string | null>>();
    for (const id of ids) before.set(id, await seatIds(id));

    // Pick a leaver that sorts first, so a list re-sorted on join or leave
    // would move every other member's mates.
    const leaver = [...ids].sort()[0]!;
    const stayers = ids.filter((id) => id !== leaver);
    const joined = await replace(leaver);
    expect(joined.bubbleId).toBe(bubbleOf(stayers[0]!));

    for (const id of stayers) {
      const was = before.get(id)!;
      const now = await seatIds(id);
      for (const [seat, occupant] of Object.entries(was)) {
        expect(now[seat]).toBe(occupant === leaver ? joined.universeId : occupant);
      }
    }
  });

  it('forms a short bubble after the wait, and later arrivals top it up', async () => {
    await start({ bubbleSize: 3, matchAfterMs: 60_000 });
    const a = await create();
    clock.advance(10_000);
    const b = await create();
    expect(b.bubbleId).toBeNull();
    clock.set(59_999);
    lobby.tickAll();
    expect(bubbleOf(a.universeId)).toBe('');

    clock.set(60_000);
    lobby.tickAll();
    const bubble = bubbleOf(a.universeId);
    expect(bubble).not.toBe('');
    expect(bubbleOf(b.universeId)).toBe(bubble);
    const aBefore = await seatIds(a.universeId);
    expect(Object.values(aBefore).filter((v) => v !== null)).toEqual([b.universeId]);

    clock.advance(40_000);
    const c = await create();
    expect(c.bubbleId).toBe(bubble);
    expect(c.waiting).toBe(0);
    // a's existing seat kept b; the empty one took c.
    const aAfter = await seatIds(a.universeId);
    for (const [seat, occupant] of Object.entries(aBefore)) {
      expect(aAfter[seat]).toBe(occupant ?? c.universeId);
    }
  });

  it('never forms a bubble of one, however long a lone universe waits', async () => {
    await start({ bubbleSize: 3, matchAfterMs: 1_000 });
    const a = await create();
    clock.advance(600_000);
    lobby.tickAll();
    expect(bubbleOf(a.universeId)).toBe('');
    expect(Object.values(await seats(a.universeId))).toEqual([null, null]);
  });

  it('reuses an ended universe’s seat at once, and the ended one sees empty seats', async () => {
    await start({ bubbleSize: 2 });
    const doomed = await create({ tickCap: 2 });
    const b = await create();
    const bubble = bubbleOf(b.universeId);
    for (let i = 0; i < 3; i += 1) lobby.tickAll();
    expect(lobby.universe(doomed.universeId)!.isAlive).toBe(false);
    expect(lobby.universe(doomed.universeId)).toBeDefined(); // ended, not yet evicted

    const c = await create();
    expect(c.bubbleId).toBe(bubble);
    expect(await seatIds(b.universeId)).toEqual({ '1': c.universeId });
    expect(await seatIds(doomed.universeId)).toEqual({ '1': null });
  });

  it('does not seat a newcomer in a bubble whose every universe has ended', async () => {
    await start({ bubbleSize: 2 });
    await create({ tickCap: 2 });
    await create({ tickCap: 2 });
    for (let i = 0; i < 3; i += 1) lobby.tickAll();
    const c = await create();
    expect(c.bubbleId).toBeNull();
    expect(c.waiting).toBe(1);
  });

  describe('a player whose universe was raided', () => {
    /** X = {a, b, c} full; Y = {d, e}, short, with room. */
    async function twoBubbles(): Promise<{ a: string; b: string; x: string; y: string }> {
      await start({ bubbleSize: 3, matchAfterMs: 0 });
      const [a, b] = [await create(), await create(), await create()].map((m) => m.universeId);
      const d = (await create()).universeId;
      await create();
      return { a: a!, b: b!, x: bubbleOf(a!), y: bubbleOf(d) };
    }
    const raidedBy = (victim: string, attacker: string): void => {
      lobby.universe(victim)!.inbound.push({ fromUniverseId: attacker, fromName: 'x', record: {} as RaidRecord });
    };

    it('is placed in the loneliest open bubble when nobody raided them (control)', async () => {
      const { a, x, y } = await twoBubbles();
      expect(x).not.toBe(y);
      // Both bubbles hold two live universes after a leaves X; the older wins the tie.
      expect((await replace(a)).bubbleId).toBe(x);
    });

    it('is placed away from the universe that raided them when another bubble has room', async () => {
      const { a, b, y } = await twoBubbles();
      raidedBy(a, b);
      expect((await replace(a)).bubbleId).toBe(y);
    });

    it('still lands beside the raider once the wait is over, if that is the only open seat', async () => {
      await start({ bubbleSize: 3, matchAfterMs: 60_000 });
      const [a, b] = [await create(), await create(), await create()].map((m) => m.universeId);
      const x = bubbleOf(a!);
      raidedBy(a!, b!);
      const a2 = await replace(a!);
      expect(a2.bubbleId).toBeNull();
      clock.advance(60_000);
      lobby.tickAll();
      expect(bubbleOf(a2.universeId)).toBe(x);
    });
  });

  it('names every seat: chosen names, and generated ones for the rest', async () => {
    await start({ bubbleSize: 3 });
    const a = await create({ name: '  The   Ember Court ' });
    const b = await create({ species: 'dwarf' });
    const c = await create();
    expect(a.name).toBe('The Ember Court');
    expect(b.name).toMatch(/^Dwarf [A-Z][a-z]+$/u);
    const view = Object.values(await seats(c.universeId));
    expect(view).toContainEqual({ universeId: a.universeId, name: 'The Ember Court', species: 'Elf' });
    expect(view).toContainEqual({ universeId: b.universeId, name: b.name, species: 'Dwarf' });
    const listed = (await (await fetch(`${base}/api/bubbles`)).json()) as { bubbles: { members: { name: string }[] }[] };
    expect(listed.bubbles[0]!.members.map((m) => m.name)).toContain('The Ember Court');
  });

  it.each([
    ['<script>alert(1)</script>'],
    ['bad\u0000name'],
    ['tab\there'],
    ['right‮left'],
    ['x'.repeat(200)],
    ['...'],
    [42],
  ])('refuses the universe name %j with a 400', async (name) => {
    await start({ bubbleSize: 3 });
    const res = await createRaw({ name });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/name/u);
    expect(((await (await fetch(`${base}/api/bubbles`)).json()) as { universes: number }).universes).toBe(0);
  });

  describe('re-entry carries the ended universe’s legacy (vision §8a)', () => {
    const resources = OBSERVATION_BLOCKS.find((b) => b.name === 'resources')!;
    /** The universe row's prestige as the page reads it: `resources[4]` of the newest frame. */
    const prestige = (id: string): number => {
      const frames = lobby.universe(id)!.frames;
      return (frames[frames.length - 1]!.obs as number[])[resources.offset + 4]!;
    };
    async function ended(): Promise<string> {
      await start({ bubbleSize: 2 });
      const old = (await create({ tickCap: 2 })).universeId;
      for (let i = 0; i < 3; i += 1) lobby.tickAll();
      expect(lobby.universe(old)!.isAlive).toBe(false);
      return old;
    }

    it('seeds the new universe with the prestige its ended predecessor earned', async () => {
      const old = await ended();
      const res = await replace(old);
      const carried = (res as unknown as { carriedPrestige: number | null }).carriedPrestige;
      expect(carried).toBeGreaterThan(0);
      expect(prestige(res.universeId)).toBeGreaterThan(0);
      expect(lobby.universe(old)).toBeUndefined();
    });

    it('carries nothing without the owner’s token, and nothing from a universe still running', async () => {
      const old = await ended();
      const forged = await create({ retire: { universeId: old, token: 'ab'.repeat(32) } });
      expect((forged as unknown as { carriedPrestige: unknown }).carriedPrestige).toBeNull();
      expect(prestige(forged.universeId)).toBe(0);
      expect(lobby.universe(old)).toBeDefined(); // not retired either

      const running = (await create()).universeId;
      const fresh = await replace(running);
      expect((fresh as unknown as { carriedPrestige: unknown }).carriedPrestige).toBeNull();
      expect(prestige(fresh.universeId)).toBe(0);
    });
  });
});

