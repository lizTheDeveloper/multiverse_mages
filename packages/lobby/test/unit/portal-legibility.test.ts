/*
 * Multiverse Mages — the portal gate, a raider's name and a target's slot, as a page sees them.
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
 * Playtest round 3, findings 1, 2 and 6, held at the lobby's seam.
 *
 * 1. The open-portal blocker said nobody held a portal node while eleven mages
 *    did: the gate that refused was mastery, and mastery was published nowhere.
 *    Frames now carry `portal` — the gate's own refusal, holders with mastery —
 *    and the header carries the threshold.
 * 2. "Naming a raider did not stick." Measured: the role held; the server's
 *    count of living raiders is now published so a page can say so (and say
 *    when one dies).
 * 6. A target list that re-ranked between the page's frame and the server's
 *    tick sent a click to another target. A submit may now carry `expect`, the
 *    candidate's own params, and the lobby re-finds the slot by them.
 */

import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { GOD_ACTION } from '@mm/agent-api';
import * as scenarioModule from '@mm/scenario';
import { referenceContent } from '@mm/scenario';
import { manualClock } from '@mm/server';

import { frameDocument } from '../../../../scripts/lib/frame-document.mjs';
import { Lobby } from '../../src/lobby.js';
import { resolveSlot } from '../../src/universe-host.js';

/**
 * The page's own words, run against the frames the lobby publishes — imported,
 * not transcribed, by a literal path for the reason `ui-recording.test.ts`
 * gives: `ui/` is build-free and has no declarations.
 */
const explain = (await import(
  // @ts-expect-error -- ui/ is a set of static files with no types to resolve.
  '../../../../ui/app/explain.js'
)) as unknown as {
  portalStanding: (f: unknown, content: unknown) => { best: { pct: number } | null; needPct: number } | null;
  portalWhy: (f: unknown, content: unknown) => { text: string; blocks: boolean }[];
  portalPrerequisiteText: (content: unknown, permitted: readonly number[], whose?: string) => string | null;
};
const { portalPrerequisiteText, portalStanding, portalWhy } = explain;

const doc = frameDocument(referenceContent(), 'lobby');
const portalCfg = {
  species: 'human',
  tradition: 'true-naming',
  techniques: ['rego', 'intellego'],
  forms: ['limen', 'ignem'],
  seed: 11,
  tickCap: 400,
  foundingPortalMagic: 1,
};

interface PortalSidecar {
  refusal: string;
  held: number;
  usable: number;
  byNode: Record<string, [number, number]>;
  holders: [number, number, number, number][];
  raiders: number;
  raiderDrillsPortal: boolean;
}
interface Frame {
  mask: number[];
  candidates: Record<string, { params: number[] }[]>;
  candidateDetail: { byAction: Record<string, { handle?: number; toRoleId?: number; cellId?: number }[]> };
  academy: { permittedCells: number[] };
  portal?: PortalSidecar;
  encouraged?: [number, number][];
  status: string;
}

let server: Server | undefined;
let base = '';
let lobby: Lobby;

async function start(extra: { fullFrames?: number } = {}): Promise<void> {
  lobby = new Lobby({ doc, clock: manualClock(0), maxUniverses: 4, quiet: true, bubbleSize: 2, tickMs: 250, ...extra });
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
const create = async (over: Record<string, unknown> = {}): Promise<string> => {
  const res = await fetch(`${base}/api/create`, { method: 'POST', body: JSON.stringify({ ...portalCfg, ...over }) });
  const made = (await res.json()) as { universeId: string; token: string };
  tokens.set(made.universeId, made.token);
  return made.universeId;
};
const getJson = async <T>(p: string): Promise<T> => (await (await fetch(base + p)).json()) as T;
const latest = async (id: string): Promise<Frame> => {
  const d = await getJson<{ frames: Frame[] }>(`/u/${id}/live/frames?since=0`);
  return d.frames[d.frames.length - 1]!;
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
/** One submit, ticked through: resolves to the gate's answer. */
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

describe('the portal gate is published', () => {
  it('puts the threshold and the portal nodes in the header, and the gate on every frame', async () => {
    await start();
    const id = await create();
    const head = await getJson<{ content: { portal: { nodeIds: number[]; usableMastery: number; masteryMax: number } } }>(
      `/u/${id}/live/session.json`,
    );
    expect(head.content.portal.usableMastery).toBe(512);
    expect(head.content.portal.masteryMax).toBe(1024);
    expect(head.content.portal.nodeIds.length).toBeGreaterThan(0);
    // The same content block, alone, for a page with no universe yet.
    const alone = await getJson<{ content: { portal: unknown } }>('/api/content');
    expect(alone.content.portal).toEqual(head.content.portal);

    lobby.tickAll();
    const f = await latest(id);
    expect(f.portal).toBeDefined();
    const p = f.portal!;
    // `foundingPortalMagic: 1` puts a portal node in a founder's mind.
    expect(p.held).toBeGreaterThanOrEqual(1);
    expect(p.holders[0]![2]).toBeGreaterThan(0);
    expect(Object.values(p.byNode).reduce((n, [held]) => n + held, 0)).toBe(p.held);
    expect(p.raiders).toBe(0);
    // Pinned against an independent sign of the raid-readiness drill, so a
    // renamed `raidKitPrimitives` cannot leave the flag silently false.
    // #251 ships the drill with `scenario`'s `RAID_KIT_PRIMITIVE_NAMES`.
    const kitNames = (scenarioModule as Record<string, unknown>)['RAID_KIT_PRIMITIVE_NAMES'];
    const drillShipped = Array.isArray(kitNames) && kitNames.includes('portal');
    expect(p.raiderDrillsPortal).toBe(drillShipped);
  });

  it('says mastery, not absence, when the gate refuses for knowledge — the round-3 blocker', async () => {
    await start();
    const id = await create();
    const head = await getJson<{ content: Record<string, unknown> }>(`/u/${id}/live/session.json`);
    // The founder's portal node decays below the usable mastery within a few
    // hundred ticks while staying held: the exact state the playtest sat in.
    let f = await latest(id);
    for (let i = 0; i < 380 && !(f.portal?.refusal === 'knowledge-lost' && f.portal.held > 0); i += 1) {
      lobby.tickAll();
      f = await latest(id);
    }
    expect(f.portal?.refusal).toBe('knowledge-lost');
    expect(f.portal!.held).toBeGreaterThan(0);
    expect(f.portal!.usable).toBe(0);

    const frame = { raw: f, isLegal: () => false };
    const standing = portalStanding(frame, head.content)!;
    expect(standing.needPct).toBe(50);
    expect(standing.best!.pct).toBeLessThan(50);
    const why = portalWhy(frame, head.content);
    const blocker = why.find((w) => w.blocks)!;
    expect(blocker.text).toMatch(/is held by \d+ mages?, best mastery \d+% — a portal needs one at 50% or more/u);
    expect(blocker.text).not.toMatch(/no living mage/u);
    // The lever is worded for what this server does: a drill only if published.
    const lever = why.find((w) => !w.blocks);
    if (f.portal!.raiderDrillsPortal) expect(lever?.text).toMatch(/name one of the mages who knows/u);
    else expect(lever?.text).toMatch(/does not drill portal magic/u);
  }, 120_000);

  it('names the cells a portal needs, from the research graph', async () => {
    await start();
    const content = (await getJson<{ content: { cells: { cellId: number; technique: string; form: string }[] } }>('/api/content'))
      .content;
    const square = (ts: string[], fs: string[]): number[] =>
      content.cells.filter((c) => ts.includes(c.technique) && fs.includes(c.form)).map((c) => c.cellId);
    expect(portalPrerequisiteText(content, square(['perdo', 'rego'], ['limen', 'corpus']), 'your opening')).toBe(
      'A portal needs Intellego Limen and Rego Limen (Open the Portal and what it builds on); your opening permits Rego Limen only.',
    );
    expect(portalPrerequisiteText(content, square(['rego', 'intellego'], ['limen', 'ignem']), 'your opening')).toBeNull();
  });
});

describe('a raider named is a raider', () => {
  it('counts the raider on the next frame, in the server-published count', async () => {
    await start();
    const id = await create({ foundingPortalMagic: 0 });
    for (let i = 0; i < 6; i += 1) lobby.tickAll();
    const roles = (await getJson<{ content: { mageRoles: Record<string, string> } }>(`/u/${id}/live/session.json`))
      .content.mageRoles;
    const raider = Number(Object.entries(roles).find(([, n]) => n === 'raider')![0]);
    const f = await latest(id);
    const rows = f.candidateDetail.byAction[String(GOD_ACTION.assignRole)]!;
    const slot = rows.findIndex((r) => r.toRoleId === raider);
    expect(slot).toBeGreaterThanOrEqual(0);
    const answer = await submit(id, { kind: GOD_ACTION.assignRole, params: [slot], expect: [rows[slot]!.handle, raider] });
    expect(answer.admitted).toBe(true);
    expect((await latest(id)).portal?.raiders).toBe(1);
  });
});

describe('a submit with expect lands on the target the page chose', () => {
  it('re-finds a slot that moved, and refuses one that is gone, spending nothing', async () => {
    await start();
    const id = await create({ foundingPortalMagic: 0 });
    for (let i = 0; i < 6; i += 1) lobby.tickAll();
    const f = await latest(id);
    const list = f.candidates[String(GOD_ACTION.encourageResearch)]!;
    expect(list.length).toBeGreaterThan(1);
    const want = list[list.length - 1]!.params;
    // The slot the lobby will submit for a stale slot 0 carrying the params the
    // player actually clicked: the one that holds them now, not slot 0.
    const host = lobby.universe(id)!;
    expect(resolveSlot(host.session, GOD_ACTION.encourageResearch, 0, want)).toBe(list.length - 1);
    expect(resolveSlot(host.session, GOD_ACTION.encourageResearch, list.length - 1, want)).toBe(list.length - 1);
    expect(resolveSlot(host.session, GOD_ACTION.encourageResearch, 0, [999_999])).toBeUndefined();
    const moved = await submit(id, { kind: GOD_ACTION.encourageResearch, params: [0], expect: want });
    expect(moved.admitted).toBe(true);
    // And the encouragement landed on the cell the player clicked, not on the
    // stale slot 0's cell — read off the world itself.
    const encouraged = ((await latest(id)).encouraged ?? []).map(([cellId]) => cellId);
    expect(encouraged).toContain(want[0]);
    if (list[0]!.params[0] !== want[0]) expect(encouraged).not.toContain(list[0]!.params[0]);

    const favorBefore = (await getJson<{ frames: { obs: number[] }[] }>(`/u/${id}/live/frames?since=0`)).frames.at(-1)!.obs[36];
    const gone = await submit(id, { kind: GOD_ACTION.encourageResearch, params: [0], expect: [999_999] });
    expect(gone).toMatchObject({ admitted: false, rejection: 'target-moved' });
    const favorAfter = (await getJson<{ frames: { obs: number[] }[] }>(`/u/${id}/live/frames?since=0`)).frames.at(-1)!.obs[36];
    expect(favorAfter).toBeGreaterThanOrEqual(favorBefore!);
  });

  it('keeps slimming history while every tick is a target-moved refusal', async () => {
    // Review of #254: a target-moved tick returned before the slimming step,
    // so a client sending a vanished target every tick kept every frame full.
    await start({ fullFrames: 5 });
    const id = await create({ foundingPortalMagic: 0 });
    for (let i = 0; i < 40; i += 1) {
      const answer = await submit(id, { kind: GOD_ACTION.encourageResearch, params: [0], expect: [999_999] });
      expect(answer.rejection).toBe('target-moved');
    }
    const frames = lobby.universe(id)!.frames;
    expect(frames.length).toBe(41);
    const full = frames.filter((f) => 'candidateDetail' in f).length;
    expect(full).toBeLessThanOrEqual(5 + 1);
  });

  it('publishes the tick interval it was given', async () => {
    await start();
    expect((await getJson<{ tickMs: number }>('/api/bubbles')).tickMs).toBe(250);
  });
});
