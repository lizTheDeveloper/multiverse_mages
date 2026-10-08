/*
 * Multiverse Mages — the play page names mages, cells and endings truthfully.
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
 * Regressions from two playtests, each a sentence a player read that was false.
 *
 * 1. **"Orc researcher" in an all-Human universe.** A mage's `speciesId` is a
 *    content id (`frame-document.mjs` publishes `speciesId: contentId`), and
 *    content ids are assigned in id order — draconic 1 … human 5, orc 6. The
 *    page indexed `content.species.map((s) => s.name)` with it, so Human (5)
 *    read as index 5, Orc. The vocabulary looks species up by id.
 * 2. **"1 cells live" right after a 2×2 setup**, and an ending screen that said
 *    "36 of 70 cells" under a grid that said "16 live". One census now, read
 *    by every surface.
 * 3. **A stagnation ending whose rule text contradicted its own summary.** The
 *    frame names no trigger, so the page reads the run for which rules the
 *    facts leave possible.
 *
 * The modules are imported, not transcribed, for the reason
 * `flow-ledger-client.test.ts` gives: a test that reimplemented them could
 * agree with itself while the page did something else.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Mage {
  handle: number;
  speciesId: number;
  ageTicks: number;
  roleId: number;
  universityId: number;
  curiosity: number;
  ambition: number;
  caution: number;
  vigor: number;
  maxVigor: number;
  nodesKnown: number;
  deepestTier: number;
  goal?: { goalId: number; targetNodeId: number; adoptedTick: number; score: number };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- ui/ is untyped static JS. */
const session = (await import(
  // @ts-expect-error -- ui/ is a set of static files with no types to resolve.
  '../../../../ui/shared/session.js'
)) as any;
const explain = (await import(
  // @ts-expect-error -- ui/ is a set of static files with no types to resolve.
  '../../../../ui/app/explain.js'
)) as any;

const UI = new URL('../../../../ui/', import.meta.url).pathname;

/** The species table exactly as the lobby publishes it: content-id order. */
const content = {
  species: [
    { speciesId: 1, id: 'draconic', name: 'Draconic', depthCeiling: 7 },
    { speciesId: 2, id: 'dwarf', name: 'Dwarf', depthCeiling: 5 },
    { speciesId: 3, id: 'elf', name: 'Elf', depthCeiling: 6 },
    { speciesId: 4, id: 'gnome', name: 'Gnome', depthCeiling: 4 },
    { speciesId: 5, id: 'human', name: 'Human', depthCeiling: 4 },
    { speciesId: 6, id: 'orc', name: 'Orc', depthCeiling: 3 },
  ],
  techniques: [{ bit: 0, id: 'intellego', name: 'Intellego' }],
  forms: [
    { bit: 0, id: 'mentem', name: 'Mentem' },
    { bit: 1, id: 'terram', name: 'Terram' },
  ],
  cells: [
    { cellId: 1, id: 'intellego-mentem', technique: 'intellego', form: 'mentem' },
    { cellId: 2, id: 'intellego-terram', technique: 'intellego', form: 'terram' },
  ],
  nodes: [
    { nodeId: 10, name: 'Weigh the Attention', cellId: 1, tier: 1, prerequisites: [] },
    { nodeId: 11, name: 'Set the Stone', cellId: 2, tier: 1, prerequisites: [] },
  ],
  mageRoles: { 0: 'researcher', 1: 'warden', 2: 'professor', 3: 'raider', 4: 'student', 5: 'populace' },
  goals: { 0: 'idle', 1: 'research-node', 4: 'teach' },
  traditions: [],
};

const human: Mage = {
  handle: (1 << 20) | 6,
  speciesId: 5,
  ageTicks: 262,
  roleId: 0,
  universityId: (1 << 20) | 2,
  curiosity: 1353,
  ambition: 916,
  caution: 1183,
  vigor: 1024,
  maxVigor: 1024,
  nodesKnown: 1,
  deepestTier: 1,
  goal: { goalId: 1, targetNodeId: 11, adoptedTick: 44, score: 1252 },
};

/** A frame-shaped object: just the accessors the helpers read. */
function frameOf(opts: {
  knowledge: { nodesKnown: number; deepestTier?: number; redundancy?: number }[];
  permitted: number[] | null;
  roster?: { handle: number; nodeIds: number[] }[];
  shelf?: { nodeId: number; copies: number; bestMastery: number }[];
  unaffiliated?: number;
}): any {
  const college = (1 << 20) | 2;
  return {
    doc: { content },
    knowledge: () =>
      opts.knowledge.map((k, index) => ({
        index,
        nodesKnown: k.nodesKnown,
        deepestTier: k.deepestTier ?? 0,
        redundancy: k.redundancy ?? 0,
        live: k.nodesKnown > 0,
      })),
    academy: () =>
      opts.permitted === null
        ? null
        : {
            handles: [college],
            university: () => ({ roster: opts.roster ?? [], shelf: opts.shelf ?? [] }),
            mage: (h: number) => (h === human.handle ? human : undefined),
            permittedCells: new Set(opts.permitted),
            unaffiliated: opts.unaffiliated ?? 0,
          },
  };
}

describe('species are looked up by content id, never by array index', () => {
  it('a Human (content id 5) is called Human, not Orc', () => {
    const vocab = session.mageVocabulary(content);
    expect(vocab.who(human)).toMatch(/^Human researcher, 21y$/u);
    expect(vocab.speciesName.get(5)).toBe('Human');
  });

  it('a bless-mage candidate row is labelled with her real species', () => {
    const namer = session.candidateNamer(content);
    const view = { slots: () => [{ kind: 'mage', handle: human.handle }], mage: () => human, university: () => undefined };
    const row = namer(view, 9, 0, [0]);
    expect(row.head).toBe('Human researcher, 21y');
    expect(row.sub).toContain('now researching Set the Stone');
  });

  it('an invite-scholar row names the species and a portal row names the seat — no ids, no JSON', () => {
    const namer = session.candidateNamer(content);
    const view = {
      slots: (a: number) => (a === 16 ? [{ kind: 'species', speciesId: 5 }] : [{ kind: 'portal-target', targetId: 2 }]),
      mage: () => undefined,
      university: () => undefined,
    };
    expect(namer(view, 16, 0, [5]).head).toBe('Human');
    const portal = namer(view, 14, 0, [2]).head;
    expect(portal).toBe('the universe in raid seat 2');
    expect(portal).not.toMatch(/[#{}]/u);
  });

  it('no page under ui/app indexes content.species with a species id', () => {
    const files = readdirSync(`${UI}app`).filter((f) => /\.(js|html)$/u.test(f));
    // Positive control: the scan reads the files it claims to.
    expect(files).toContain('index.html');
    for (const f of files) {
      const src = readFileSync(`${UI}app/${f}`, 'utf8');
      expect(src, f).not.toMatch(/species\.map\(\s*\(?s\)?\s*=>\s*s\.name\s*\)/u);
      expect(src, f).not.toMatch(/speciesNames\[/u);
      expect(src, f).not.toMatch(/JSON\.stringify\(c\)/u);
      // Debug fragments ("[candidates[14] is empty]") belong in a tooltip, not prose.
      expect(src, f).not.toMatch(/\[\$\{\w+\.source\}\]/u);
    }
  });
});

describe('cellCensus is the one definition of "cells with discoveries"', () => {
  it('a fresh 2×2 opening reads as four permitted cells, not "1 cell live"', () => {
    const c = session.cellCensus(frameOf({ knowledge: [{ nodesKnown: 1 }, { nodesKnown: 0 }], permitted: [1, 2] }));
    expect(c).toMatchObject({ total: 2, permitted: 2, withDiscoveries: 1, withDiscoveriesPermitted: 1, nodesKnown: 1 });
  });

  it('counts knowledge in a forbidden cell as discovered, and says how much of it is permitted', () => {
    const c = session.cellCensus(frameOf({ knowledge: [{ nodesKnown: 3 }, { nodesKnown: 2 }], permitted: [2] }));
    expect(c).toMatchObject({ permitted: 1, withDiscoveries: 2, withDiscoveriesPermitted: 1, nodesKnown: 5 });
  });

  it('says "unknown" rather than computing the rule when the frame has no academy sidecar', () => {
    const c = session.cellCensus(frameOf({ knowledge: [{ nodesKnown: 1 }, { nodesKnown: 0 }], permitted: null }));
    expect(c.permitted).toBeNull();
    expect(c.withDiscoveriesPermitted).toBeNull();
    expect(c.withDiscoveries).toBe(1);
  });
});

describe('nodeHolders reads minds and shelves, and lists what it cannot see', () => {
  it('names the mage holding a node and the library copies', () => {
    const f = frameOf({
      knowledge: [{ nodesKnown: 1, redundancy: 3 }, { nodesKnown: 0 }],
      permitted: [1, 2],
      roster: [{ handle: human.handle, nodeIds: [10] }],
      shelf: [{ nodeId: 10, copies: 2, bestMastery: 900 }],
      unaffiliated: 1,
    });
    const w = session.nodeHolders(f, 10);
    expect(w.visible).toBe(true);
    expect(w.minds.map((m: { mage: Mage }) => m.mage.speciesId)).toEqual([5]);
    expect(w.shelves.map((s: { copies: number }) => s.copies)).toEqual([2]);
    expect(w.cellCopies).toBe(3);
    expect(w.gaps.join(' ')).toMatch(/1 mage belongs to no college/u);
    expect(session.nodeHolders(f, 11).minds).toEqual([]);
  });
});

describe('stagnationReading rules out what the frames contradict', () => {
  /** A session-shaped object over per-tick `{living, known, worship}` rows. */
  const sessionOf = (rows: { living: number; known: number; worship: number }[]): any => {
    const frame = (i: number): any => ({
      clock: () => ({ worldTick: i * 12 }),
      mageBuckets: () => [{ living: rows[i]!.living }],
      knowledge: () => [{ nodesKnown: rows[i]!.known }],
      resources: () => ({ worship: rows[i]!.worship, worshipTier: 1 }),
    });
    return { frameCount: rows.length, frame, last: () => frame(rows.length - 1) };
  };

  it('with mages alive at the end, the no-mages rule is ruled out', () => {
    const r = explain.stagnationReading(sessionOf([
      { living: 5, known: 1, worship: 0.5 },
      { living: 7, known: 4, worship: 0.8 },
      { living: 7, known: 4, worship: 0.6 },
    ]));
    const byId = Object.fromEntries(r.rules.map((x: { id: string; possible: boolean }) => [x.id, x.possible]));
    expect(byId).toEqual({ mageless: false, 'no-worship': true, stasis: true });
    expect(r.lastNewKnowledgeTick).toBe(12);
    expect(r.livingAtEnd).toBe(7);
  });

  it('with no mage left, the no-mages rule is possible (positive control)', () => {
    const r = explain.stagnationReading(sessionOf([
      { living: 2, known: 1, worship: 0.5 },
      { living: 0, known: 1, worship: 0.1 },
    ]));
    expect(r.rules.find((x: { id: string }) => x.id === 'mageless').possible).toBe(true);
  });
});
describe('the ascension checklist reads each item from its own field', () => {
  it('universities, cells with knowledge and nodes known are three different numbers', () => {
    // 3 colleges (2 complete), 5 cells with knowledge, 11 nodes: every figure
    // distinct, so an item reading its neighbour's field cannot pass.
    const done = { college: { buildProgress: 1024 } };
    const frame = {
      clock: () => ({ worldTick: 100, era: 1 }),
      resources: () => ({ worshipTier: 2 }),
      knowledge: () => [3, 2, 2, 2, 2, 0].map((n, index) => ({ index, nodesKnown: n, deepestTier: n > 0 ? 1 : 0 })),
      raw: {
        mask: [],
        academy: { universities: { 1: done, 2: done, 3: { college: { buildProgress: 512 } } }, permittedCells: [1] },
      },
    };
    const c = explain.ascensionChecklist(frame, { ...content, ascension: { 'canon-breadth': 77, 'canon-cells': 18 } });
    const value = (label: RegExp): string => [...c.mastery, ...c.canon].find((x: { label: string }) => label.test(x.label)).value;
    expect(value(/^Completed universities$/u)).toBe('2');
    expect(value(/^Cells with any knowledge/u)).toBe('5');
    expect(value(/^Nodes known/u)).toBe('11');
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any */
