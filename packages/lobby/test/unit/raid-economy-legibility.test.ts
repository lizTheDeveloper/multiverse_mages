/*
 * Multiverse Mages — passage, the portal's cooldown and the producers, as a lobby page sees them.
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
 * Playtest round 4: passage — the raid currency — "has no visible source", a
 * raid cost no tempo, and the ECONOMY panel listed `magesApplying` and
 * `economicNodes` and nothing a player could act on. Held at the lobby's seam,
 * against the frames a page actually reads:
 *
 * - after a raid, the frame carries the portal's recharge and the page's own
 *   blocker names it, and the next press is refused without charging;
 * - the page's producer list names who makes passage (threshold keepers) and
 *   insight (research), and says what would make passage when nothing does.
 */

import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { GOD_ACTION } from '@mm/agent-api';
import { referenceContent } from '@mm/scenario';
import { manualClock } from '@mm/server';

import { frameDocument } from '../../../../scripts/lib/frame-document.mjs';
import { Lobby } from '../../src/lobby.js';

const explain = (await import(
  // @ts-expect-error -- ui/ is a set of static files with no types to resolve.
  '../../../../ui/app/explain.js'
)) as unknown as {
  portalWhy: (f: unknown, content: unknown) => { text: string; blocks: boolean }[];
  economyProducers: (fl: unknown) => { kind: string; sources: string[] }[];
};
const { economyProducers, portalWhy } = explain;

const shipped = referenceContent();
const COOLDOWN = shipped.deps.god?.content.constants.raidCooldownTicks ?? 0;
const doc = frameDocument(shipped, 'lobby');
const cfg = {
  species: 'human',
  tradition: 'true-naming',
  techniques: ['rego', 'intellego'],
  forms: ['limen', 'ignem'],
  seed: 11,
  tickCap: 400,
  foundingPortalMagic: 1,
};

type Basket = Record<string, number>;
interface Frame {
  mask: number[];
  candidates: Record<string, { params: number[] }[]>;
  candidateDetail: { byAction: Record<string, { handle?: number; toRoleId?: number }[]> };
  portal?: { recharge?: number; refusal: string; holders: unknown[]; raiders: number };
  stocks: Basket;
  flow?: { land: Basket; applied: Basket; tended?: Basket; producers: Record<string, number>; opening: Basket };
}

let server: Server | undefined;
let base = '';
let lobby: Lobby;

afterEach(
  () =>
    new Promise<void>((r) => {
      if (server === undefined) r();
      else server.close(() => r());
      server = undefined;
    }),
);

const tokens = new Map<string, string>();
const getJson = async <T>(p: string): Promise<T> => (await (await fetch(base + p)).json()) as T;
const latest = async (id: string): Promise<Frame> => {
  const d = await getJson<{ frames: Frame[] }>(`/u/${id}/live/frames?since=0`);
  return d.frames[d.frames.length - 1]!;
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function create(): Promise<string> {
  const res = await fetch(`${base}/api/create`, { method: 'POST', body: JSON.stringify(cfg) });
  const made = (await res.json()) as { universeId: string; token: string };
  tokens.set(made.universeId, made.token);
  return made.universeId;
}
async function submit(id: string, body: unknown): Promise<{ admitted: boolean; rejection?: string }> {
  const pending = fetch(`${base}/u/${id}/live/submit`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'x-universe-token': tokens.get(id)! },
  });
  for (let i = 0; i < 500 && lobby.universe(id)?.hasQueued !== true; i += 1) await sleep(2);
  lobby.tickAll();
  return (await (await pending).json()) as { admitted: boolean; rejection?: string };
}

/** The flow sidecar in display units, as `ui/shared/session.js` decodes it. */
function decoded(f: Frame): unknown {
  const fl = f.flow!;
  const u = (b: Basket | undefined): Basket | undefined =>
    b === undefined ? undefined : Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v / 1024]));
  return { kinds: Object.keys(fl.opening), land: u(fl.land), applied: u(fl.applied), tended: u(fl.tended), producers: fl.producers };
}

describe('the raid economy is on the page', () => {
  it('names who makes passage and insight, and what would make passage when nothing does', async () => {
    lobby = new Lobby({ doc, clock: manualClock(0), maxUniverses: 4, quiet: true, bubbleSize: 2, tickMs: 250 });
    server = await lobby.listen(0);
    const addr = server.address();
    base = `http://127.0.0.1:${String(typeof addr === 'object' && addr ? addr.port : 0)}`;
    const id = await create();
    let sawKeeper = false;
    let sawResearch = false;
    for (let i = 0; i < 40 && !(sawKeeper && sawResearch); i += 1) {
      lobby.tickAll();
      const rows = economyProducers(decoded(await latest(id)));
      const of = (kind: string): string => rows.find((r) => r.kind === kind)?.sources.join(' ; ') ?? '';
      if (/keeping a portal threshold/u.test(of('passage'))) sawKeeper = true;
      if (/research/u.test(of('insight'))) sawResearch = true;
    }
    expect(sawKeeper).toBe(true);
    expect(sawResearch).toBe(true);

    // Nothing makes passage: the page says what would.
    const none = economyProducers({ kinds: ['passage'], land: { passage: 0 }, applied: { passage: 0 }, tended: { passage: 0 }, producers: {} });
    expect(none[0]?.sources[0]).toMatch(/^nothing — a mage who holds a portal node keeps a threshold/u);
  }, 120_000);

  it('after a raid, publishes the recharge, blocks the press on it, and charges nothing for a refused one', async () => {
    lobby = new Lobby({ doc, clock: manualClock(0), maxUniverses: 4, quiet: true, bubbleSize: 2, tickMs: 250 });
    server = await lobby.listen(0);
    const addr = server.address();
    base = `http://127.0.0.1:${String(typeof addr === 'object' && addr ? addr.port : 0)}`;
    const a = await create();
    await create();
    const head = await getJson<{ content: { mageRoles: Record<string, string> } & Record<string, unknown> }>(
      `/u/${a}/live/session.json`,
    );
    const raider = Number(Object.entries(head.content.mageRoles).find(([, n]) => n === 'raider')![0]);
    for (let i = 0; i < 4; i += 1) lobby.tickAll();
    const roles = (await latest(a)).candidateDetail.byAction[String(GOD_ACTION.assignRole)]!;
    const slot = roles.findIndex((r) => r.toRoleId === raider);
    expect((await submit(a, { kind: GOD_ACTION.assignRole, params: [slot], expect: [roles[slot]!.handle, raider] })).admitted).toBe(true);

    // Wait for the favor and the offer, then press once.
    let f = await latest(a);
    for (let i = 0; i < 200 && f.mask[GOD_ACTION.openPortal] !== 1; i += 1) {
      lobby.tickAll();
      f = await latest(a);
    }
    expect(f.mask[GOD_ACTION.openPortal]).toBe(1);
    expect(f.portal?.recharge).toBe(0);
    const seat = (f.candidates[String(GOD_ACTION.openPortal)] ?? []).findIndex((c) => c.params[0] === 1);
    expect((await submit(a, { kind: GOD_ACTION.openPortal, params: [seat] })).admitted).toBe(true);

    f = await latest(a);
    expect(f.portal?.recharge).toBe(COOLDOWN - 1);
    expect(f.mask[GOD_ACTION.openPortal]).toBe(0);
    const why = portalWhy({ raw: f, isLegal: () => false }, head.content);
    expect(why.some((w) => w.blocks && /recharging — \d+ years?/u.test(w.text))).toBe(true);

    // A press inside the cooldown is refused at the gate and takes nothing.
    const passageBefore = f.stocks.passage;
    const refused = await submit(a, { kind: GOD_ACTION.openPortal, params: [0] });
    expect(refused.admitted).toBe(false);
    const after = await latest(a);
    expect(after.stocks.passage).toBeGreaterThanOrEqual(passageBefore ?? 0);
  }, 120_000);
});
