/*
 * Multiverse Mages — what a reload of a late-game universe costs.
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
 * A reload used to download a universe's whole history with every frame's
 * sidecars — about 115 MB at the 4,000-tick cap. The lobby now keeps sidecars
 * on its newest frames only and ships the rest as `obs` deltas
 * (`src/history.ts`). These hold two things: the payload is under budget at
 * the cap, and what the page derives from history on a reload is exactly what
 * it derives from the unslimmed run — read through the shipped client,
 * `ui/shared/session.js`, against the shipped lobby, over HTTP.
 */
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { referenceContent } from '@mm/scenario';
import { manualClock } from '@mm/server';

import { frameDocument } from '../../../../scripts/lib/frame-document.mjs';
import { FULL_FRAMES, packHistory, slimFrame } from '../../src/history.js';
import { Lobby } from '../../src/lobby.js';

interface Reader {
  raw: Record<string, unknown>;
  knowledge: () => { nodesKnown: number; deepestTier: number; live: boolean; technique: string; form: string }[];
  mageBuckets: () => { name: string; living: number }[];
  institutions: () => { libraryDepth: number; grimoires: number; universities: number };
  clock: () => { worldTick: number };
  resources: () => Record<string, unknown>;
  ruleset: () => unknown;
  actions: () => unknown;
  status: () => string;
  candidateLists: () => Map<number, unknown>;
}
interface Session {
  readonly frameCount: number;
  frame: (i: number) => Reader;
  last: () => Reader;
  content: Record<string, unknown>;
}

const ui = (await import(
  // @ts-expect-error -- ui/ is a set of static files with no types to resolve.
  '../../../../ui/shared/session.js'
)) as unknown as {
  openSession: (s: { live?: string; recording?: string; headers?: () => Record<string, string> }) => Promise<Session>;
  unpackHistory: (doc: Record<string, unknown>) => { frames: Record<string, unknown>[] };
};
const explain = (await import(
  // @ts-expect-error -- as above.
  '../../../../ui/app/explain.js'
)) as unknown as {
  stagnationReading: (s: Session) => unknown;
  ascensionChecklist: (f: Reader, content: unknown) => unknown;
};

const doc = frameDocument(referenceContent(), 'lobby');
const BASE_CFG = { species: 'elf', tradition: 'true-naming', techniques: ['creo'], forms: ['ignem'], seed: 3 };

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

interface Run {
  lobby: Lobby;
  base: string;
  id: string;
  token: string;
}

async function lobbyWith(fullFrames?: number): Promise<Run> {
  const lobby = new Lobby({
    doc,
    clock: manualClock(0),
    maxUniverses: 2,
    quiet: true,
    ...(fullFrames === undefined ? {} : { fullFrames }),
  });
  const server = await lobby.listen(0);
  servers.push(server);
  const addr = server.address();
  const base = `http://127.0.0.1:${String(typeof addr === 'object' && addr ? addr.port : 0)}`;
  const made = (await (await fetch(`${base}/api/create`, { method: 'POST', body: JSON.stringify(BASE_CFG) })).json()) as {
    universeId: string;
    token: string;
  };
  return { lobby, base, id: made.universeId, token: made.token };
}

/**
 * `ticks` months, a god action queued every twelfth — the first of bless,
 * fund, grant, assign that is legal with a target — so the universe neither
 * stagnates nor stays empty. Chosen from the session's own state, so two
 * lobbies with the same seed act identically.
 */
function drive(run: Run, ticks: number): void {
  for (let t = 0; t < ticks; t += 1) {
    const host = run.lobby.universe(run.id);
    if (host === undefined) throw new Error('universe evicted mid-drive');
    if (t % 12 === 0 && host.isAlive) {
      const mask = host.session.legalActions();
      const cands = host.session.candidates();
      for (const kind of [9, 11, 8, 10]) {
        if (mask[kind] === 1 && (cands.get(kind)?.length ?? 0) > 0) {
          host.enqueue({ kind, params: [0] });
          break;
        }
      }
    }
    run.lobby.tickAll();
  }
}

const open = (run: Run): Promise<Session> =>
  ui.openSession({ live: `${run.base}/u/${run.id}`, headers: () => ({ 'x-universe-token': run.token }) });

/**
 * The activity feed's input, per frame: `snapshotFrame` in `ui/app/index.html`
 * reads exactly these readers, and the feed is a diff of consecutive ones. If
 * these agree frame for frame, the feed a reload rebuilds agrees.
 */
const feedInput = (f: Reader): unknown => ({
  tick: f.clock().worldTick,
  cells: f.knowledge().map((c) => [c.technique, c.form, c.nodesKnown, c.deepestTier, c.live]),
  species: f.mageBuckets().map((s) => [s.name, s.living]),
  inst: f.institutions(),
});

/** Everything the page reads off a historical frame. */
const historyView = (s: Session): unknown[] =>
  Array.from({ length: s.frameCount }, (_, i) => {
    const f = s.frame(i);
    return { feed: feedInput(f), resources: f.resources(), ruleset: f.ruleset(), actions: f.actions(), status: f.status() };
  });

describe('session.json?pack=1', () => {
  it('pack and unpack are inverses over slim frames', async () => {
    const run = await lobbyWith(Number.MAX_SAFE_INTEGER);
    drive(run, 150);
    const full = run.lobby.universe(run.id)?.frames ?? [];
    const slim = full.map(slimFrame);
    const back = ui.unpackHistory({ history: packHistory(slim), frames: [] }).frames;
    expect(back).toEqual(slim.map((f) => ({ ...f, sat: f.sat ?? [] })));
  });

  it('a reload derives the same history as the unslimmed run (positive control included)', async () => {
    const ticks = FULL_FRAMES * 4;
    const slimRun = await lobbyWith();
    const fullRun = await lobbyWith(Number.MAX_SAFE_INTEGER);
    drive(slimRun, ticks);
    drive(fullRun, ticks);

    // The slimmed host really slimmed, and the control really did not.
    const slimHost = slimRun.lobby.universe(slimRun.id);
    const fullHost = fullRun.lobby.universe(fullRun.id);
    expect(slimHost?.frames[0]?.academy).toBeUndefined();
    expect(fullHost?.frames[0]?.academy).toBeDefined();
    expect(slimHost?.frames.at(-1)?.academy).toBeDefined();

    // The reload goes the page's way — `?pack=1`, unpacked by the client. The
    // control does not: it is the unslimmed run's every frame, whole, read as
    // a plain document, so a packing bug cannot cancel out on both sides.
    const reloaded = await open(slimRun);
    const control = await ui.openSession({ recording: `${fullRun.base}/u/${fullRun.id}/live/session.json` });
    expect(reloaded.frameCount).toBe(ticks + 1);
    expect(control.frameCount).toBe(ticks + 1);

    const a = historyView(reloaded);
    const b = historyView(control);
    expect(a).toEqual(b);
    // …and that history has something in it for a feed to report: months on
    // which knowledge, population or institutions moved.
    const feedOnly = (v: unknown): string => {
      const { cells, species, inst } = (v as { feed: { cells: unknown; species: unknown; inst: unknown } }).feed;
      return JSON.stringify([cells, species, inst]);
    };
    const events = b.filter((v, i) => i > 0 && feedOnly(v) !== feedOnly(b[i - 1])).length;
    expect(events).toBeGreaterThan(10);
    // The views the page builds from all of history, and from the newest frame.
    expect(explain.stagnationReading(reloaded)).toEqual(explain.stagnationReading(control));
    expect(explain.ascensionChecklist(reloaded.last(), reloaded.content)).toEqual(
      explain.ascensionChecklist(control.last(), control.content),
    );
    // The newest frame — the one every panel paints from — is whole.
    expect(reloaded.last().raw).toEqual(control.last().raw);
    expect(reloaded.last().raw.academy).toBeDefined();
    // A slim frame reads as "no candidates", not as a crash.
    expect(reloaded.frame(0).candidateLists().size).toBe(0);

    // Positive control: the comparison above can fail. One historical frame
    // whose observation is off by one in every slot must show up in the view.
    const raw = reloaded.frame(10).raw as { obs: number[] };
    const saved = [...raw.obs];
    raw.obs.forEach((v, i) => (raw.obs[i] = v + 1));
    try {
      expect(historyView(reloaded)).not.toEqual(b);
    } finally {
      saved.forEach((v, i) => (raw.obs[i] = v));
    }
  });

  it('a universe at the 4,000-tick cap reloads in under 3 MB', async () => {
    const run = await lobbyWith();
    drive(run, 4000);
    const host = run.lobby.universe(run.id);
    // Driven to the cap, not stagnated short of it: the budget is about the cap.
    expect(host?.frames.length).toBe(4001);

    const res = await fetch(`${run.base}/u/${run.id}/live/session.json?pack=1`, {
      headers: { 'x-universe-token': run.token },
    });
    const body = await res.text();
    const bytes = Buffer.byteLength(body);
    expect(bytes).toBeLessThan(3_000_000);
    const unpacked = ui.unpackHistory(JSON.parse(body) as Record<string, unknown>);
    expect(unpacked.frames).toHaveLength(4001);

    // Control: the budget discriminates. The unpacked route carries the same
    // frames and is over it, so passing is a property of the packing.
    const plain = await (await fetch(`${run.base}/u/${run.id}/live/session.json`)).text();
    expect(Buffer.byteLength(plain)).toBeGreaterThan(3_000_000);
  }, 180_000);
});
