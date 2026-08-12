/*
 * Multiverse Mages — the seed derivation, task 3.3.
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
 * The derivation is the crux of the whole change, so it is pinned four ways:
 * by known answers, by an exhaustive distinctness argument, by a separate
 * process, and by the negative controls that show the checks would fail.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  MAX_CELL_INDEX,
  MAX_REPLICATE_INDEX,
  SEED_DERIVATION_VERSION,
  deriveRunSeed,
  fnv1a32,
  seedMatchesCoordinates,
} from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

describe('a run seed is a pure function of its four coordinates', () => {
  it('gives the same answer every time it is asked', () => {
    const coordinates = { rootSeed: 12345, sweepId: 'gate', cellIndex: 7, replicateIndex: 3 };
    const first = deriveRunSeed(coordinates);
    for (let repeat = 0; repeat < 100; repeat += 1) {
      expect(deriveRunSeed({ ...coordinates })).toBe(first);
    }
  });

  it('is recomputable from a record and detects a record whose seed was edited', () => {
    const coordinates = { rootSeed: 999, sweepId: 'full', cellIndex: 19, replicateIndex: 41 };
    const seed = deriveRunSeed(coordinates);
    expect(seedMatchesCoordinates(coordinates, seed)).toBe(true);
    // The negative control. Without it, `seedMatchesCoordinates` returning true
    // is indistinguishable from a function that returns true unconditionally.
    expect(seedMatchesCoordinates(coordinates, (seed + 1) >>> 0)).toBe(false);
  });

  it('answers in the unsigned 32-bit range', () => {
    for (let cellIndex = 0; cellIndex < 40; cellIndex += 1) {
      const seed = deriveRunSeed({ rootSeed: 3, sweepId: 's', cellIndex, replicateIndex: 0 });
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(4294967295);
    }
  });

  it('changes when any one of the four coordinates changes', () => {
    const base = { rootSeed: 5, sweepId: 'a', cellIndex: 1, replicateIndex: 1 };
    const seed = deriveRunSeed(base);
    expect(deriveRunSeed({ ...base, rootSeed: 6 })).not.toBe(seed);
    expect(deriveRunSeed({ ...base, sweepId: 'b' })).not.toBe(seed);
    expect(deriveRunSeed({ ...base, cellIndex: 2 })).not.toBe(seed);
    expect(deriveRunSeed({ ...base, replicateIndex: 2 })).not.toBe(seed);
  });
});

describe('distinct cells and replicates get distinct seeds', () => {
  it('produces 1000 pairwise distinct seeds for 20 cells × 50 replicates', () => {
    // The capability spec's own numbers.
    const seeds = new Set<number>();
    for (let cellIndex = 0; cellIndex < 20; cellIndex += 1) {
      for (let replicateIndex = 0; replicateIndex < 50; replicateIndex += 1) {
        seeds.add(deriveRunSeed({ rootSeed: 42, sweepId: 'gate', cellIndex, replicateIndex }));
      }
    }
    expect(seeds.size).toBe(1000);
  });

  it('is injective over a much larger grid than any sweep will ever run', () => {
    // 200 × 200 = 40 000 seeds. A hash-based derivation would be expected to
    // collide about once here (birthday, 40000²/2/2^32 ≈ 0.19 — and rising
    // quadratically), which is exactly why the derivation is a bijection on the
    // run key rather than a hash of it. This test is a claim about the
    // construction, not about luck.
    const seeds = new Set<number>();
    for (let cellIndex = 0; cellIndex < 200; cellIndex += 1) {
      for (let replicateIndex = 0; replicateIndex < 200; replicateIndex += 1) {
        seeds.add(deriveRunSeed({ rootSeed: 7, sweepId: 'full', cellIndex, replicateIndex }));
      }
    }
    expect(seeds.size).toBe(40000);
  });

  it('refuses indices beyond the pairing rather than wrapping two runs together', () => {
    expect(() =>
      deriveRunSeed({ rootSeed: 1, sweepId: 's', cellIndex: MAX_CELL_INDEX + 1, replicateIndex: 0 }),
    ).toThrow(/cellIndex/);
    expect(() =>
      deriveRunSeed({
        rootSeed: 1,
        sweepId: 's',
        cellIndex: 0,
        replicateIndex: MAX_REPLICATE_INDEX + 1,
      }),
    ).toThrow(/replicateIndex/);
  });

  it('refuses a root seed outside the unsigned 32-bit domain, and an empty sweep id', () => {
    expect(() => deriveRunSeed({ rootSeed: -1, sweepId: 's', cellIndex: 0, replicateIndex: 0 })).toThrow(
      /rootSeed/,
    );
    expect(() =>
      deriveRunSeed({ rootSeed: 4294967296, sweepId: 's', cellIndex: 0, replicateIndex: 0 }),
    ).toThrow(/rootSeed/);
    expect(() => deriveRunSeed({ rootSeed: 1, sweepId: '', cellIndex: 0, replicateIndex: 0 })).toThrow(
      /sweepId/,
    );
  });
});

describe('the derivation is frozen, and says so', () => {
  it('matches its known-answer vectors', () => {
    // Regenerating these to make a test pass is the same act as regenerating a
    // golden fixture to make a test pass: it silently reinterprets every
    // committed balance number taken at this SEED_DERIVATION_VERSION.
    expect(SEED_DERIVATION_VERSION).toBe(1);
    expect(fnv1a32('')).toBe(2166136261);
    expect(fnv1a32('a')).toBe(3826002220);
    expect(fnv1a32('foobar')).toBe(3214735720);

    const vectors: [number, string, number, number][] = [
      [0, 'gate', 0, 0],
      [1, 'gate', 0, 0],
      [0, 'full', 0, 0],
      [20260805, 'toy-sweep', 3, 2],
      [4294967295, 'gate', 65535, 65535],
    ];
    const answers = vectors.map(([rootSeed, sweepId, cellIndex, replicateIndex]) =>
      deriveRunSeed({ rootSeed, sweepId, cellIndex, replicateIndex }),
    );
    expect(answers).toEqual([1834721283, 2035351135, 2664851571, 2228829778, 1689453147]);
  });

  it('hashes a sweep id by its UTF-8 bytes, so a non-ASCII name is portable', () => {
    // Two encodings of the same character must not be two different sweeps, and
    // hashing UTF-16 code units would make the answer depend on JavaScript's
    // internal string representation rather than on the text.
    const bytes = new TextEncoder().encode('ω');
    expect([...bytes]).toEqual([207, 137]);
    let expected = 2166136261;
    for (const byte of bytes) expected = Math.imul(expected ^ byte, 0x01000193) >>> 0;
    expect(fnv1a32('ω')).toBe(expected);
  });
});

describe('the derivation is stable across processes', () => {
  it('agrees with a seed derived in a separate Node process', () => {
    // "Two separate processes on two machines" is not testable here, but the
    // half that is — a fresh process, a fresh module graph, no shared state —
    // is, and it is the half that catches a derivation that accidentally
    // depended on module-level mutable state.
    const modulePath = fileURLToPath(new URL('../../src/seed.ts', import.meta.url));
    const script = [
      `const { deriveRunSeed } = await import(${JSON.stringify(modulePath)});`,
      'const out = [];',
      'for (let c = 0; c < 5; c += 1) {',
      "  out.push(deriveRunSeed({ rootSeed: 20260805, sweepId: 'toy-sweep', cellIndex: c, replicateIndex: 2 }));",
      '}',
      'process.stdout.write(JSON.stringify(out));',
    ].join('\n');

    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    });
    const fromChild = JSON.parse(stdout) as number[];

    const here = [0, 1, 2, 3, 4].map((cellIndex) =>
      deriveRunSeed({ rootSeed: 20260805, sweepId: 'toy-sweep', cellIndex, replicateIndex: 2 }),
    );
    expect(fromChild).toEqual(here);
  });
});
