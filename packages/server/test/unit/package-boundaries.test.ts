/*
 * Multiverse Mages — the boundaries this package promises about itself.
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
 * `sim-core/test/unit/module-boundaries.test.ts` owns the §5 dependency graph
 * for the whole workspace, and this package is in its table. What is asserted
 * *here* are the promises only this package makes — the ones a workspace-wide
 * scanner has no way to know about:
 *
 * - **Zero third-party runtime dependencies.** `CLAUDE.md` makes the AGPL
 *   network clause the point of this package, and the proposal requires a
 *   stranger to be able to stand up an identical server from source. Every
 *   dependency is a licence they must check and a supply chain they must trust.
 * - **The wall clock lives in exactly one file.** The determinism constraints
 *   exist because of live PvP; a `Date.now()` that drifted into the tick path
 *   would make the zero-desync claim unmeasurable while everything still
 *   appeared to work.
 * - **No floats and no `Math.random` in the tick path**, for the same reason.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
const MANIFEST = fileURLToPath(new URL('../../package.json', import.meta.url));

/** Every `.ts` file in `src/`, by name. */
function sourceFiles(): string[] {
  return readdirSync(SRC).filter((name) => name.endsWith('.ts'));
}

const read = (name: string): string => readFileSync(`${SRC}${name}`, 'utf8');

/**
 * A file's source with its comments removed.
 *
 * Every ban below is a ban on *doing* something, and this package documents its
 * bans at length in the places they apply — `clock.ts` explains why `Date.now`
 * is confined to it, `host.ts` explains why match ids come from a counter
 * rather than `Math.random`, `desync.ts` names FNV-1a to say it is reused
 * rather than reimplemented. Scanning raw text would make every one of those
 * explanations a violation, and the obvious fix — deleting the explanation —
 * would be strictly worse than the thing being prevented.
 *
 * Deliberately crude: this is a comment stripper, not a parser, and it is
 * allowed to be wrong about a `//` inside a string literal because a false
 * positive here costs a confusing test failure rather than a shipped bug.
 */
function code(name: string): string {
  return read(name)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the manifest', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, unknown>;

  it('declares the AGPL and names Ann Kelner', () => {
    expect(manifest['license']).toBe('AGPL-3.0-or-later');
    expect(manifest['author']).toBe('Ann Kelner');
  });

  it('takes no third-party runtime dependency', () => {
    for (const field of [
      'dependencies',
      'peerDependencies',
      'optionalDependencies',
      'bundledDependencies',
    ]) {
      const declared = manifest[field];
      if (declared === undefined) continue;
      for (const name of Object.keys(declared as Record<string, string>)) {
        expect(
          name.startsWith('@mm/'),
          `${field} declares ${name}. This package's transport is Node's own net module ` +
            'deliberately: the AGPL source offer is only worth something if a stranger can build ' +
            'what they were offered. A dependency here needs an argument in the report, by name ' +
            'and by licence.',
        ).toBe(true);
      }
    }
  });

  it('depends on agent-api and on nothing else in the workspace', () => {
    // contracts.md §5: `server  authoritative lockstep, Hetzner deployment. → agent-api`.
    expect(Object.keys((manifest['dependencies'] ?? {}) as Record<string, string>)).toEqual([
      '@mm/agent-api',
    ]);
  });
});

describe('every source file carries the AGPL header', () => {
  it.each(sourceFiles())('%s', (name) => {
    const head = read(name).slice(0, 800);
    expect(head).toContain('Multiverse Mages');
    expect(head).toContain('Copyright (C) 2026 Ann Kelner');
    expect(head).toContain('SPDX-License-Identifier: AGPL-3.0-or-later');
  });
});

describe('the wall clock is a place, not a habit', () => {
  it('reads Date.now in clock.ts and nowhere else', () => {
    const offenders = sourceFiles().filter(
      (name) => name !== 'clock.ts' && /\bDate\s*\.\s*now\b/.test(code(name)),
    );
    expect(
      offenders,
      'contracts.md §0 puts real-time pacing outside the core and §8 makes the server its owner, ' +
        'but the ownership is only meaningful if the clock is reachable from one place. Take a ' +
        '`Clock` instead — see the note at the top of clock.ts.',
    ).toEqual([]);
  });

  it('reads it exactly once even there', () => {
    const hits = code('clock.ts').match(/\bDate\s*\.\s*now\b/g) ?? [];
    expect(hits).toHaveLength(1);
  });

  it('keeps the tick path clock-free', () => {
    // `match.ts` and `ordering.ts` decide what a tick contains. If either could
    // see the time, a recorded match would stop replaying to the same hashes and
    // the release plan's zero-desync claim would become unmeasurable.
    for (const name of ['match.ts', 'ordering.ts', 'desync.ts']) {
      expect(code(name)).not.toMatch(/\bDate\b|\bperformance\s*\.\s*now\b|\bsetTimeout\b/);
      expect(code(name)).not.toContain("from './clock.js'");
    }
  });

  it('keeps Math.random out of the package entirely', () => {
    for (const name of sourceFiles()) {
      expect(code(name), `${name} reaches for Math.random.`).not.toMatch(/\bMath\s*\.\s*random\b/);
    }
  });
});

describe('the wire carries no second serialization', () => {
  it('names sim-core’s encoding rather than inventing one', () => {
    const protocol = read('protocol.ts');
    // The snapshot payload's encoding tag is pinned, so a payload can never be
    // mistaken for "some JSON of the state".
    expect(protocol).toContain("SNAPSHOT_ENCODING = 'mmsn-base64'");
  });

  it('hashes nothing of its own', () => {
    // Desync detection reuses `AgentSession.snapshotHash()`, which is sim-core's
    // hash over its own bytes. A hash function appearing in this package would
    // be the second integrity mechanism the proposal forbids.
    for (const name of sourceFiles()) {
      const text = code(name);
      expect(text, `${name} defines a digest.`).not.toMatch(
        /\bcreateHash\b|\bfnv\b|function\s+hash\s*\(/i,
      );
    }
  });
});
