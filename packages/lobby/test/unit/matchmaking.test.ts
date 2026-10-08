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
    /**
     * Bubbles of four. X = {a, b, c, d}, then d ends, so after a retires X
     * holds two live universes; Y = {e, f, g} holds three with one open seat.
     * The loneliest rule alone sends a newcomer to X, deterministically.
     */
    async function twoBubbles(): Promise<{ a: string; b: string; x: string; y: string }> {
      await start({ bubbleSize: 4, matchAfterMs: 0 });
      const [a, b] = [await create(), await create(), await create(), await create({ tickCap: 2 })].map(
        (m) => m.universeId,
      );
      const e = (await create()).universeId;
      await create();
      await create();
      for (let i = 0; i < 3; i += 1) lobby.tickAll();
      return { a: a!, b: b!, x: bubbleOf(a!), y: bubbleOf(e) };
    }
    const raidedBy = (victim: string, attacker: string): void => {
      lobby.universe(victim)!.inbound.push({ fromUniverseId: attacker, fromName: 'x', record: {} as RaidRecord });
    };

    it('is placed in the loneliest open bubble when nobody raided them (control)', async () => {
      const { a, x, y } = await twoBubbles();
      expect(x).not.toBe(y);
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

  it('seats a newcomer in the loneliest bubble, not the oldest one with room', async () => {
    await start({ bubbleSize: 3, matchAfterMs: 0 });
    // X (older) = {a, b, c}; Y (newer) = {d, e}. Then c and e end.
    const [a] = [await create(), await create(), await create({ tickCap: 2 })].map((m) => m.universeId);
    const d = (await create()).universeId;
    await create({ tickCap: 2 });
    const x = bubbleOf(a!);
    const y = bubbleOf(d);
    expect(x).not.toBe(y);
    for (let i = 0; i < 3; i += 1) lobby.tickAll();
    // X: two live and one open; Y: one live and two open.
    expect((await create()).bubbleId).toBe(y);
  });

  it('breaks a tie between equally lonely bubbles at random, so a newcomer cannot aim', async () => {
    const landed = new Set<string>();
    for (let trial = 0; trial < 24 && landed.size < 2; trial += 1) {
      await start({ bubbleSize: 3, matchAfterMs: 0 });
      // X = {a, b} and Y = {c, d}: two live each, one open each.
      const a = (await create()).universeId;
      await create();
      await create({ tickCap: 2 });
      const c = (await create()).universeId;
      await create();
      await create({ tickCap: 2 });
      for (let i = 0; i < 3; i += 1) lobby.tickAll();
      const x = bubbleOf(a);
      const y = bubbleOf(c);
      expect(x).not.toBe(y);
      const made = await create();
      expect([x, y]).toContain(made.bubbleId);
      landed.add(made.bubbleId === x ? 'older' : 'newer');
      await new Promise<void>((r) => (server === undefined ? r() : server.close(() => r())));
      server = undefined;
    }
    // A fixed tie-break lands the same side all 24 times; chance of that at random is 2^-23.
    expect(landed).toEqual(new Set(['older', 'newer']));
  }, 60_000);

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
    // The public count route names nobody.
    expect(await (await fetch(`${base}/api/bubbles`)).text()).not.toContain('Ember');
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
    const constants = referenceContent().deps.god!.content.constants;
    /** The universe row's prestige as the page reads it: `resources[4]` of the newest frame. */
    const prestige = (id: string): number => {
      const frames = lobby.universe(id)!.frames;
      return (frames[frames.length - 1]!.obs as number[])[resources.offset + 4]!;
    };
    const carriedOf = (made: Made): number | null =>
      (made as unknown as { carriedPrestige: number | null }).carriedPrestige;
    /** Ticks until `id` ends by the rules (an untouched opening stagnates near tick 620). */
    const runOut = (id: string): void => {
      for (let i = 0; i < 4000 && lobby.universe(id)!.isAlive; i += 1) lobby.tickAll();
      expect(lobby.universe(id)!.session.status()).toBe('stagnated');
    };
    async function ended(): Promise<string> {
      await start({ bubbleSize: 2, idleAfterMs: 7 * 24 * 3_600_000 });
      const old = (await create({ tickCap: undefined })).universeId;
      runOut(old);
      return old;
    }

    it('seeds the new universe with the prestige its ended predecessor earned', async () => {
      const old = await ended();
      const expected = lobby.universe(old)!.legacy()!.carriedPrestige;
      const res = await replace(old, { tickCap: undefined });
      expect(carriedOf(res)).toBe(expected);
      expect(expected).toBeGreaterThan(0);
      expect(prestige(res.universeId)).toBeGreaterThan(0);
      expect(lobby.universe(old)).toBeUndefined();
    }, 60_000);

    it('pays a legacy once: retiring the same universe again carries nothing', async () => {
      const old = await ended();
      const token = tokens.get(old)!;
      const first = await create({ retire: { universeId: old, token } });
      expect(carriedOf(first)).toBeGreaterThan(0);
      const second = await create({ retire: { universeId: old, token } });
      expect(carriedOf(second)).toBeNull();
      expect(prestige(second.universeId)).toBe(0);
    }, 60_000);

    it('carries nothing without the owner’s token, and leaves the universe in place', async () => {
      const old = await ended();
      const forged = await create({ retire: { universeId: old, token: 'ab'.repeat(32) } });
      expect(carriedOf(forged)).toBeNull();
      expect(prestige(forged.universeId)).toBe(0);
      expect(lobby.universe(old)).toBeDefined();
    }, 60_000);

    it('carries nothing from a universe retired while still running', async () => {
      await start({ bubbleSize: 2 });
      const running = (await create()).universeId;
      for (let i = 0; i < 5; i += 1) lobby.tickAll();
      const fresh = await replace(running);
      expect(carriedOf(fresh)).toBeNull();
      expect(prestige(fresh.universeId)).toBe(0);
    });

    it('carries nothing from a universe the client cut short with its own tickCap', async () => {
      await start({ bubbleSize: 2 });
      const short = (await create({ tickCap: 1 })).universeId;
      lobby.tickAll();
      lobby.tickAll();
      expect(lobby.universe(short)!.session.status()).toBe('truncated');
      const fresh = await replace(short);
      expect(carriedOf(fresh)).toBeNull();
      expect(prestige(fresh.universeId)).toBe(0);
    });

    it('a chain of quick deaths converges under the cap instead of stacking without bound', async () => {
      await start({ bubbleSize: 2, idleAfterMs: 7 * 24 * 3_600_000 });
      let id = (await create({ tickCap: undefined })).universeId;
      const chain: number[] = [];
      const earnedMax = constants.prestigeEarnMax;
      for (let n = 0; n < 4; n += 1) {
        runOut(id);
        const made = await replace(id, { tickCap: undefined });
        chain.push(carriedOf(made)!);
        id = made.universeId;
      }
      // Each link replaces the last (prestige × retention + earned), so the
      // gains shrink geometrically and the whole chain sits under both the
      // content's cap and the recurrence's own fixed point.
      const fixedPoint = Math.floor((earnedMax * 1024) / (1024 - constants.prestigeRetention));
      for (const c of chain) {
        expect(c).toBeGreaterThan(0);
        expect(c).toBeLessThanOrEqual(constants.prestigeCap);
        expect(c).toBeLessThanOrEqual(fixedPoint);
      }
      for (let n = 2; n < chain.length; n += 1) {
        expect(chain[n]! - chain[n - 1]!).toBeLessThan(chain[n - 1]! - chain[n - 2]!);
      }
    }, 120_000);
  });
});
