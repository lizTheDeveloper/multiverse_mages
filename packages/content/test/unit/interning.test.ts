/*
 * Multiverse Mages — interning is deterministic, and contentRevision gates it.
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
 * **How "stable across processes" is actually tested.** Spawning a second
 * process would only re-run the same code, so it would demonstrate nothing that
 * a second in-process load does not. What can differ between processes is the
 * *input order* — a content file reordered by a merge, a directory listing, a
 * hash-map iteration — and the *environment*, through locale-sensitive
 * collation. Both are tested directly:
 *
 * 1. Interning is invariant under reordering every content file.
 * 2. The whole mapping is pinned against a committed golden table, so any build
 *    on any machine that produces a different integer for a string fails here
 *    rather than in a desynchronised multiplayer match.
 */

import { describe, expect, it } from 'vitest';

import {
  CONTENT_FILES,
  cellAxes,
  internSorted,
  loadContent,
  shippedContentSource,
} from '@mm/content';
import type { ContentNamespace, ContentRegistry } from '@mm/content';

import { shippedDocuments, sourceOf } from './fixtures.js';

const NAMESPACES: readonly ContentNamespace[] = [
  'technique',
  'form',
  'cell',
  'node',
  'species',
  'tradition',
  'primitive',
  'territory',
];

/** Every string id to its integer, across every namespace. */
function fullMapping(registry: ContentRegistry): Record<string, number> {
  const mapping: Record<string, number> = {};
  const namespaced = [
    ['technique', registry.techniques],
    ['form', registry.forms],
    ['cell', registry.cells],
    ['node', registry.nodes],
    ['species', registry.species],
    ['tradition', registry.traditions],
    ['primitive', registry.primitives],
    ['territory', registry.territories],
  ] as const;
  for (const [namespace, entries] of namespaced) {
    for (const entry of entries) mapping[`${namespace}:${entry.record.id}`] = entry.contentId;
  }
  return mapping;
}

/** The shipped content with every file's records reversed. */
function reversedSource(): ReturnType<typeof sourceOf> {
  const documents = shippedDocuments();
  for (const fileName of CONTENT_FILES) {
    documents[fileName] = [...(documents[fileName] as unknown[])].reverse();
  }
  return sourceOf(documents, 'reversed');
}

const registry = loadContent(shippedContentSource());

describe('interning', () => {
  it('produces the same mapping on a second load', () => {
    const second = loadContent(shippedContentSource());
    expect(fullMapping(second)).toEqual(fullMapping(registry));
  });

  it('is invariant under reordering every content file', () => {
    const reversed = loadContent(reversedSource());
    expect(fullMapping(reversed)).toEqual(fullMapping(registry));
    expect(reversed.contentRevision).toBe(registry.contentRevision);
  });

  it('never assigns the reserved id 0, and assigns each id exactly once', () => {
    for (const namespace of NAMESPACES) {
      const ids = new Set<number>();
      const entries = Object.entries(fullMapping(registry)).filter(([key]) =>
        key.startsWith(`${namespace}:`),
      );
      for (const [, contentId] of entries) {
        expect(contentId).toBeGreaterThan(0);
        expect(ids.has(contentId)).toBe(false);
        ids.add(contentId);
      }
    }
  });

  it('returns 0 for an id that is not in the namespace', () => {
    expect(registry.intern('node', 'no-such-node')).toBe(0);
    expect(registry.intern('cell', 'rego-limen')).toBeGreaterThan(0);
  });

  it('derives cell ids from the grid, so every axis pair is addressable', () => {
    for (const entry of registry.cells) {
      const { techniqueBit, formBit } = cellAxes(entry.contentId);
      expect(registry.cellAt(techniqueBit + 1, formBit + 1)).toBe(entry.contentId);
    }
    expect(registry.intern('cell', 'rego-limen')).toBe(4 * 14 + 12 + 1);
  });

  it('sorts by code unit, never by locale collation', () => {
    // A locale-aware sort can place "co-op" and "coop" differently depending on
    // the ICU build, which is exactly the cross-machine divergence banned in
    // CLAUDE.md. The code-unit order is fixed: "-" (0x2D) precedes any letter.
    const table = internSorted(['coop', 'co-op', 'zz', 'aa']);
    expect([...table.entries()]).toEqual([
      ['aa', 1],
      ['co-op', 2],
      ['coop', 3],
      ['zz', 4],
    ]);
  });

  it('pins the interned integers of the shipped content set', () => {
    // A golden table, deliberately spanning all eight namespaces. If a future
    // change renumbers content, this fails and the fix is a considered decision
    // about whether the contentRevision bump is acceptable — not a surprise.
    expect(registry.intern('technique', 'rego')).toBe(5);
    expect(registry.intern('form', 'nomen')).toBe(14);
    expect(registry.intern('cell', 'creo-animal')).toBe(1);
    expect(registry.intern('cell', 'rego-nomen')).toBe(70);
    expect(registry.intern('node', 'can-call-the-pack')).toBe(1);
    // 300, not 299: pre-authoring the other 58 cells brought 249 nodes, and
    // `knowledge-model` task 2.5's `rn-keep-the-name-close` is the one neither
    // side of that merge shared. Node ids intern in sort order, so it lands at
    // 285 and every node after it shifts by one — the renumbering these
    // assertions exist to surface.
    expect(registry.intern('node', 'rn-keep-the-name-close')).toBe(285);
    expect(registry.intern('node', 'rv-turn-the-casting')).toBe(300);
    expect(registry.intern('species', 'draconic')).toBe(1);
    expect(registry.intern('tradition', 'art-of-memory')).toBe(1);
    expect(registry.intern('primitive', 'area-denial')).toBe(1);
    expect(registry.intern('territory', 'arable-lowland')).toBe(1);
  });

  it('round-trips an interned id back to its string', () => {
    for (const namespace of NAMESPACES) {
      for (const [key, contentId] of Object.entries(fullMapping(registry))) {
        if (!key.startsWith(`${namespace}:`)) continue;
        expect(registry.idOf(namespace, contentId)).toBe(key.slice(namespace.length + 1));
      }
    }
  });
});

describe('contentRevision', () => {
  it('is a 32-character hex digest', () => {
    expect(registry.contentRevision).toMatch(/^[0-9a-f]{32}$/u);
  });

  it('is pinned to the digest of the shipped content set', () => {
    // The golden table above samples nine interned ids out of several hundred.
    // This is the whole-set fingerprint: one value that changes if *any* byte
    // of *any* shipped record changes, including the ones nobody sampled.
    //
    // §0 makes this load-bearing rather than decorative — two universes may
    // only interact if their `contentRevision` values are equal — so a silent
    // drift here is a silent refusal to raid, or worse, two builds that agree
    // on the hash and disagree on the content. The tests below prove the digest
    // *moves* when content changes; only a pinned literal proves it lands
    // where every other machine lands.
    //
    // A failure here is not a test to update reflexively. It says the shipped
    // content set changed, and the question is whether that was intended.
    //
    // It has moved twice, both deliberately:
    //
    // a3e246fb601bc6c3c19e9682cd94e1ea -> 5444a4e2727aa7ba20ffaa4ef67981d1,
    // when `knowledge-model` task 2.5 added the `rn-keep-the-name-close` node so
    // that `rego-nomen` carries `concealment`, which the task list requires of
    // that cell and which no rego cell previously supplied.
    //
    // 5444a4e2727aa7ba20ffaa4ef67981d1 -> 4f90d08940a3f0224893a2731eed41e9,
    // when the other 58 cells were pre-authored: 249 nodes and every cell's
    // `nodes` list. Nothing in the v1 subset changed, but the digest covers the
    // whole shipped set by design, so it moves anyway. That is the correct
    // behaviour and the reason `contentRevision` gates raiding rather than some
    // v1-only fingerprint — two universes disagreeing about the inert 58 cells
    // would disagree the moment either one enabled a cell.
    //
    // 4f90d08940a3f0224893a2731eed41e9 -> f813d90d3ddadb345c0a9d55505de432,
    // when `territory.json` was added as the eighth content file (§2.7) so that
    // carrying capacity could be derived from a fixed resource instead of from
    // the materials stock, which by construction only grows. Five new records
    // and a new namespace in the preimage; nothing existing changed a byte.
    //
    // f813d90d3ddadb345c0a9d55505de432 -> 0e63987b2823f4d991ea1c7a40944055,
    // when `god-agency` added `god-cost.json` and `god-constant.json` — the
    // price of every §4.2 action, and every magnitude of the worship loop, the
    // favor economy, ascension, stagnation and prestige. They are in the
    // preimage deliberately: two universes that disagreed about what forbidding
    // a technique costs, or about the worship saturation constants, would be
    // playing different games while their revisions agreed they were
    // compatible. Nothing existing changed a byte.
    //
    // 0e63987b2823f4d991ea1c7a40944055 -> f66b312c914c5c1159d12626bcf40ff8,
    // when `raid-engagement` added `raid-constant.json` (§2.10) — every
    // magnitude an engagement is made of, and with them the two authored
    // integers the termination proof rests on. They are in the preimage for the
    // reason the god tables are: two universes that disagreed about how long a
    // portal holds would fight two different battles while their revisions
    // agreed they were compatible. Nothing existing changed a byte.
    //
    // 2512ea02d2a7569d8d0bacc4c5a926ca -> ec506311ed7aadeb1aaf0e14f5750465,
    // when the ascension predicates were made to read positive achievement and
    // five constants joined `god-constant.json`: `ascension-summit-cells`,
    // `ascension-summit-copies`, `ascension-canon-breadth`,
    // `ascension-canon-cells` and `ascension-loss-fraction`. Unlike every move
    // above it, this one is *not* "nothing existing changed a byte" in effect —
    // no existing record changed, but the rules that read these constants decide
    // when a run ends, so two universes on either side of this revision would
    // disagree about whether a game was over. That is exactly what the revision
    // exists to make incompatible, and it is why the digest is checked rather
    // than the file list.
    //
    // ec506311ed7aadeb1aaf0e14f5750465 -> 61f6aa53e091684809765b1f9020ee96, when
    // `raid-engagement` added the constants that make a raid fire — the arrival
    // process, the loot count, and the rival stand-in a warband is drawn from.
    // They are in the preimage for the reason the god tables are: two universes
    // that disagreed about how long a portal holds, or about how many books come
    // off a shelf, would fight two different battles while their revisions agreed
    // they were compatible.
    //
    // W6 and W8 each recorded a successor to 2512ea02 on their own branches —
    // ec506311 and aeedc362 — because neither contained the other. This tree
    // contains both sets of constants, so it is a third revision, and that it is
    // neither of theirs is the whole point of a digest over the preimage rather
    // than a hand-maintained list.
    //
    // 61f6aa53e091684809765b1f9020ee96 -> a622452a3b55e38fd902a2d3264b44d7, when W17 added
    // `autonomy-weight.json` (§2.11) — every magnitude a mage's choice of *which
    // node to work on* is made of, including the role x primitive table that
    // makes vision §7's standing role a number. It is in the preimage for the
    // reason the other three tables are: two universes whose mages valued the
    // same node differently would be developing different magic while their
    // revisions agreed they were compatible. Nothing existing changed a byte.
    //
    // Three branches each recorded a successor to 2512ea02 — W6's ec506311,
    // W8's aeedc362 and W17's d37624e3 — because no two of them contained each
    // other. This is the revision of the tree that holds all three.
    //
    // a622452a3b55e38fd902a2d3264b44d7 -> 2c67315ae04ee6c74dfa204474af4eb6,
    // when the single undifferentiated materials stock was split into three
    // material kinds — `food`, `stone`, `vellum` — routed by form and produced
    // in differing mixes by territory. Unlike most entries above this one is
    // not "nothing existing changed a byte": every one of the fourteen
    // `form.json` records gained `yieldWeights` and `tuningStatus`, and every
    // one of the five `territory.json` records gained `yieldPerLandUnit`. Both
    // are in the preimage on purpose — two universes that disagreed about
    // what a form's magic actually yields, or about what a stretch of land
    // produces, would be running different economies while their revisions
    // agreed they were compatible.
    //
    // `main` reached this merge asserting d37624e3 — W17's successor, taken
    // there without W6's or W8's constants and without the material split. It
    // is not a competing claim about the same tree: it is a claim about a
    // smaller preimage, and this tree's preimage strictly contains it. The
    // digest moving from d37624e3 to 2c67315a across this merge is therefore
    // the union arriving, not a disagreement being settled.
    //
    // 2c67315ae04ee6c74dfa204474af4eb6 -> ba7be8d68b582e2985e0360bbc7e11b0,
    // when this branch merged `main` and took `main`'s
    // `max-summons-per-side`. On `main` that
    // edit reads `d37624e36be00f59cf21b87ff6eba144 ->
    // 6b18886a4b3a2803c0b1b92eb8f8fae8`: the cap came down from 16 to 8 to
    // agree with `primitive.json`'s `summon` cap, which is the same ceiling
    // authored twice and had disagreed with it since both files existed. It is
    // a *value* edit rather than a new file — the first one in this list that
    // is — which is the point of a revision over the values: two universes
    // that disagreed about how many summons a side may hold would fight two
    // different battles, and the digest says so instead of calling them
    // compatible.
    //
    // So neither 2c67315a nor 6b18886a survives the merge, and that is
    // correct rather than a lost claim. Each was a digest over a preimage the
    // other did not contain — this branch's material split, `main`'s summon
    // cap — and this tree is the first one holding both. A fourth value is
    // what a digest over the union is supposed to produce; a merge that kept
    // either side's literal would be asserting a revision no tree has.
    expect(registry.contentRevision).toBe('ba7be8d68b582e2985e0360bbc7e11b0');
  });

  it('is stable across loads of identical content', () => {
    expect(loadContent(shippedContentSource()).contentRevision).toBe(registry.contentRevision);
  });

  it('changes when any content value changes', () => {
    const documents = shippedDocuments();
    const nodes = documents['node.json'] as Record<string, unknown>[];
    const target = nodes.find((node) => node['id'] === 'rt-set-the-stone');
    (target?.['effects'] as Record<string, unknown>[])[0]!['magnitude'] = 193;
    const changed = loadContent(sourceOf(documents, 'tweaked'));
    expect(changed.contentRevision).not.toBe(registry.contentRevision);
  });

  it('changes when a record is renamed, because the interning changes too', () => {
    const documents = shippedDocuments();
    const nodes = documents['node.json'] as Record<string, unknown>[];
    const target = nodes.find((node) => node['id'] === 'rt-set-the-stone');
    if (target === undefined) throw new Error('fixture drifted');
    target['id'] = 'rt-set-the-stone-again';
    const cells = documents['cell.json'] as Record<string, unknown>[];
    const cell = cells.find((record) => record['id'] === 'rego-terram');
    cell!['nodes'] = (cell!['nodes'] as string[]).map((id) =>
      id === 'rt-set-the-stone' ? 'rt-set-the-stone-again' : id,
    );
    for (const node of nodes) {
      node['prerequisites'] = (node['prerequisites'] as string[]).map((id) =>
        id === 'rt-set-the-stone' ? 'rt-set-the-stone-again' : id,
      );
    }
    const renamed = loadContent(sourceOf(documents, 'renamed'));
    expect(renamed.contentRevision).not.toBe(registry.contentRevision);
  });
});
