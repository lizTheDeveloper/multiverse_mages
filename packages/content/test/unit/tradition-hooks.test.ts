/*
 * Multiverse Mages — the tradition hook cap, checked against the contract.
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
 * `vision.md` §4a gives the four-hook cap a reason that is not tidiness:
 * bespoke tradition code is the fun of the game *and* is precisely what defeats
 * primitive-level Monte Carlo balancing. The cap is only real if content cannot
 * widen it, so this suite attacks it from both sides — the enumeration must
 * agree with the document that declares it (`knowledge-model` task 6.2), and
 * content that tries to step outside it must fail the load rather than warn
 * (task 6.3).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ContentValidationError,
  HOOK_KINDS,
  HOOK_POINTS,
  loadContent,
  shippedContentSource,
} from '@mm/content';

import { brokenSource, recordsOf, shippedDocuments, sourceOf } from './fixtures.js';

const CONTRACTS_PATH = fileURLToPath(
  new URL('../../../../docs/design/contracts.md', import.meta.url),
);

/** Every message from a failed load, joined — assertions read the whole set. */
function diagnosticsOf(source: Parameters<typeof loadContent>[0]): string {
  try {
    loadContent(source);
  } catch (error) {
    if (error instanceof ContentValidationError) {
      return error.diagnostics.map((d) => `${d.file}${d.pointer}: ${d.message}`).join('\n');
    }
    throw error;
  }
  throw new Error('expected the load to fail, but it succeeded');
}

/**
 * The kinds `contracts.md` §2.5 declares for each hook.
 *
 * Parsed rather than transcribed. A transcription is a third copy of the
 * enumeration, and a check whose expectation is a copy of the thing it checks
 * cannot fail for the reason it exists.
 */
function documentedKinds(): Map<string, string[]> {
  const document = readFileSync(CONTRACTS_PATH, 'utf8');
  const section = document.slice(document.indexOf('### 2.5 `tradition.json`'));
  const body = section.slice(0, section.indexOf('### 2.6'));

  const rows = new Map<string, string[]>();
  for (const line of body.split('\n')) {
    const match = /^\|\s*`(\w+)`\s*\|\s*(.+?)\s*\|$/.exec(line.trim());
    if (match === null) continue;
    const [, hook = '', kindCell = ''] = match;
    rows.set(
      hook,
      kindCell.split(',').map((cell) => cell.trim().replaceAll('`', '')),
    );
  }
  return rows;
}

describe('the hook enumeration and contracts.md §2.5 are the same enumeration', () => {
  it('declares exactly the four hook points the document declares', () => {
    expect([...documentedKinds().keys()].sort()).toEqual([...HOOK_POINTS].sort());
  });

  it.each([...HOOK_POINTS])('declares the same kinds for %s in both places', (point) => {
    const documented = documentedKinds().get(point);
    expect(documented, `contracts.md §2.5 declares no kinds for "${point}"`).toBeDefined();
    expect([...(documented ?? [])].sort()).toEqual(Object.keys(HOOK_KINDS[point]).sort());
  });

  it('would fail if a kind were added in code only', () => {
    // The failure this check exists to catch, staged rather than asserted about:
    // a sixth kind in code with no row added to the document. Run against a
    // copy, because the point is that the comparison notices, not that the real
    // enumeration changes.
    const withNewKind = [...Object.keys(HOOK_KINDS.cast), 'goetic-pact'].sort();
    expect(withNewKind).not.toEqual([...(documentedKinds().get('cast') ?? [])].sort());
  });

  it("carries a §2.5 example that would actually load", () => {
    // The document's worked example is content an author will copy. It has been
    // wrong before — it omitted `name` and the required `libraryDepthCoefficient`
    // param, so pasting it into tradition.json produced two hard load failures.
    const document = readFileSync(CONTRACTS_PATH, 'utf8');
    const section = document.slice(document.indexOf('### 2.5 `tradition.json`'));
    const fence = section.slice(section.indexOf('```jsonc') + '```jsonc'.length);
    const example: unknown = JSON.parse(fence.slice(0, fence.indexOf('```')));

    const documents = shippedDocuments();
    documents['tradition.json'] = [example];
    // The shipped universe content names a tradition by id; swapping the whole
    // file for the example keeps that reference satisfiable only if the example
    // is the Art of Memory, which it is.
    expect(() => loadContent(sourceOf(documents))).not.toThrow();
  });
});

describe('content cannot step outside the enumeration', () => {
  it('rejects a tradition missing a hook, naming the tradition and the hook', () => {
    const messages = diagnosticsOf(
      brokenSource((documents) => {
        const record = recordsOf(documents, 'tradition.json')[2] as {
          hooks: Record<string, unknown>;
        };
        delete record.hooks['cost'];
      }),
    );
    expect(messages).toContain('cost');
    expect(messages).toMatch(/tradition\.json/);
  });

  it('rejects a fifth hook key, naming the disallowed key', () => {
    const messages = diagnosticsOf(
      brokenSource((documents) => {
        const record = recordsOf(documents, 'tradition.json')[0] as {
          hooks: Record<string, unknown>;
        };
        record.hooks['mortality'] = { kind: 'standard' };
      }),
    );
    expect(messages).toContain('mortality');
  });

  it('rejects an unknown kind and lists what acquire does permit', () => {
    const messages = diagnosticsOf(
      brokenSource((documents) => {
        const record = recordsOf(documents, 'tradition.json')[0] as {
          hooks: Record<string, { kind: string }>;
        };
        record.hooks['acquire'] = { kind: 'pact' };
      }),
    );
    expect(messages).toContain('"pact"');
    expect(messages).toContain('standard');
    expect(messages).toContain('true-name');
  });

  it("rejects a cast kind declared on store, and says whose kind it is", () => {
    const messages = diagnosticsOf(
      brokenSource((documents) => {
        const record = recordsOf(documents, 'tradition.json')[0] as {
          hooks: Record<string, { kind: string; params?: unknown }>;
        };
        record.hooks['store'] = { kind: 'prepared', params: { slotsPerMage: 4 } };
      }),
    );
    expect(messages).toContain('"prepared" is a "cast" kind, not a "store" kind');
  });

  it('rejects a param the kind does not declare', () => {
    const messages = diagnosticsOf(
      brokenSource((documents) => {
        const record = recordsOf(documents, 'tradition.json')[2] as {
          hooks: Record<string, { kind: string; params: Record<string, unknown> }>;
        };
        const store = record.hooks['store'];
        if (store !== undefined) store.params['burnsOnTuesday'] = true;
      }),
    );
    expect(messages).toContain('burnsOnTuesday');
  });

  it('accepts a params-only edit, because params are data and kinds are not', () => {
    // `magic-traditions`: "a tradition's hook params are changed without
    // touching code — the simulation loads and behaves differently, and no new
    // kind was introduced." The behavioural half lives in `@mm/rules-magic`;
    // this is the half the loader owns.
    const documents = shippedDocuments();
    const record = recordsOf(documents, 'tradition.json')[2] as {
      hooks: Record<string, { kind: string; params: Record<string, unknown> }>;
    };
    const store = record.hooks['store'];
    if (store !== undefined) store.params['libraryDepthCoefficient'] = 0;

    const registry = loadContent(sourceOf(documents));
    const artOfMemory = registry.traditions.find((t) => t.record.id === 'art-of-memory');
    expect(artOfMemory?.record.hooks.store.kind).toBe('palace');
    expect(artOfMemory?.record.hooks.store.params?.['libraryDepthCoefficient']).toBe(0);
  });
});

describe('the three v1 traditions are authored and each stresses a different hook', () => {
  const registry = loadContent(shippedContentSource());
  const byId = new Map(registry.traditions.map(({ record }) => [record.id, record]));

  it('ships exactly the three v1 traditions', () => {
    expect([...byId.keys()].sort()).toEqual(['art-of-memory', 'true-naming', 'vancian-memorization']);
  });

  it('gives Vancian memorization the cast and cost hooks', () => {
    const record = byId.get('vancian-memorization');
    expect(record?.hooks.acquire.kind).toBe('standard');
    expect(record?.hooks.store.kind).toBe('standard');
    expect(record?.hooks.cast.kind).toBe('prepared');
    expect(record?.hooks.cost.kind).toBe('prepaid');
  });

  it('gives True Naming the acquire hook and nothing else', () => {
    const record = byId.get('true-naming');
    expect(record?.hooks.acquire.kind).toBe('true-name');
    expect(record?.hooks.store.kind).toBe('standard');
    expect(record?.hooks.cast.kind).toBe('standard');
    expect(record?.hooks.cost.kind).toBe('standard');
    // A name is either known or not, so an instance arrives whole.
    expect(record?.hooks.acquire.params?.['instanceMastery']).toBe(1024);
  });

  it('gives the Art of Memory the store hook and nothing else', () => {
    const record = byId.get('art-of-memory');
    expect(record?.hooks.acquire.kind).toBe('standard');
    expect(record?.hooks.store.kind).toBe('palace');
    expect(record?.hooks.cast.kind).toBe('standard');
    expect(record?.hooks.cost.kind).toBe('standard');
    expect(record?.hooks.store.params?.['lootable']).toBe(false);
    expect(record?.hooks.store.params?.['burnable']).toBe(false);
  });

  it('leaves every v1 hook kind exercised by at least one shipped tradition', () => {
    // A kind nothing declares is a kind nobody has tested, which is how the
    // cross-portal split ships broken and is found five releases later
    // (`design.md`, "Vancian deliberately declares two non-standard hooks").
    const declared = new Set<string>();
    for (const { record } of registry.traditions) {
      for (const point of HOOK_POINTS) declared.add(`${point}:${record.hooks[point].kind}`);
    }
    for (const point of HOOK_POINTS) {
      for (const kind of Object.keys(HOOK_KINDS[point])) {
        expect(declared, `no v1 tradition declares ${point}: ${kind}`).toContain(`${point}:${kind}`);
      }
    }
  });
});
