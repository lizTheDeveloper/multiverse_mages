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
    // A golden table, deliberately spanning all seven namespaces. If a future
    // change renumbers content, this fails and the fix is a considered decision
    // about whether the contentRevision bump is acceptable — not a surprise.
    expect(registry.intern('technique', 'rego')).toBe(5);
    expect(registry.intern('form', 'nomen')).toBe(14);
    expect(registry.intern('cell', 'creo-animal')).toBe(1);
    expect(registry.intern('cell', 'rego-nomen')).toBe(70);
    expect(registry.intern('node', 'il-count-the-doors')).toBe(1);
    // 51, not 50: `knowledge-model` task 2.5 added `rn-keep-the-name-close` to
    // `rego-nomen`, and node ids intern in sort order, so every node after it
    // shifts by one. That is the renumbering this assertion exists to surface.
    expect(registry.intern('node', 'rt-the-vaulted-hall')).toBe(51);
    expect(registry.intern('species', 'draconic')).toBe(1);
    expect(registry.intern('tradition', 'art-of-memory')).toBe(1);
    expect(registry.intern('primitive', 'area-denial')).toBe(1);
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
    // It moved once, deliberately, from a3e246fb601bc6c3c19e9682cd94e1ea:
    // `knowledge-model` task 2.5 added the `rn-keep-the-name-close` node so that
    // `rego-nomen` carries `concealment`, which the task list requires of that
    // cell and which no rego cell previously supplied.
    expect(registry.contentRevision).toBe('5444a4e2727aa7ba20ffaa4ef67981d1');
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
