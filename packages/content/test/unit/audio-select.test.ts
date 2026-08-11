/*
 * Multiverse Mages — audio variant selection tests.
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
 * sound-design §0.2: audio variation must never take an RNG stream. Contracts §6
 * makes the stream registry append-only and baseline-coupled, so an audio stream
 * would have rotted every committed balance baseline the first time somebody
 * added a sound — silently, and months before anyone looked.
 *
 * Hashing state instead costs nothing and buys replay-identical audio: the same
 * golden fixture plays the same barks in the same order every time, which is what
 * makes "it sounded wrong here" a reproducible bug report.
 *
 * The committed vectors exist because the client is a different package written
 * later. A function that is merely described gets reimplemented subtly
 * differently; a function with vectors does not.
 */

import { describe, expect, it } from 'vitest';

import { audioSelect } from '@mm/content';

import vectors from '../fixtures/audio-select-vectors.json' with { type: 'json' };

describe('audioSelect', () => {
  it('matches the committed vectors', () => {
    for (const v of vectors) {
      expect(
        audioSelect(v.rootSeed, v.tick, v.entityId, v.kind, v.repeat, v.variantCount),
        JSON.stringify(v),
      ).toBe(v.expected);
    }
  });

  it('is deterministic across calls', () => {
    const once = audioSelect(12345, 700, 42, 'selection', 3, 5);
    const twice = audioSelect(12345, 700, 42, 'selection', 3, 5);
    expect(once).toBe(twice);
  });

  it('stays in range for every variant count', () => {
    for (let variantCount = 1; variantCount <= 16; variantCount += 1) {
      for (let tick = 0; tick < 200; tick += 1) {
        const index = audioSelect(7, tick, 3, 'annoyance-polite', 0, variantCount);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(variantCount);
      }
    }
  });

  it('depends on every one of its inputs', () => {
    // Vary one argument at a time across many values, holding the rest fixed.
    // A hash that ignores an argument yields exactly one distinct result for
    // that argument's sweep, which fails here — where a "3 of 5 mutations
    // differ" threshold does not, because the four live arguments clear it on
    // their own.
    const distinct = (values: readonly number[], select: (v: number) => number): number =>
      new Set(values.map(select)).size;

    const sweep = Array.from({ length: 64 }, (_, i) => i + 1);

    expect(distinct(sweep, (v) => audioSelect(v, 7, 3, 'selection', 1, 8)), 'rootSeed').toBeGreaterThan(1);
    expect(distinct(sweep, (v) => audioSelect(5, v, 3, 'selection', 1, 8)), 'tick').toBeGreaterThan(1);
    expect(distinct(sweep, (v) => audioSelect(5, 7, v, 'selection', 1, 8)), 'entityId').toBeGreaterThan(1);
    expect(distinct(sweep, (v) => audioSelect(5, 7, 3, 'selection', v, 8)), 'repeat').toBeGreaterThan(1);

    // `kind` is a string, so sweep it separately over real cue and bark kinds.
    const kinds = ['selection', 'death', 'annoyance-unhinged', 'click-tick', 'last-copy'];
    expect(new Set(kinds.map((k) => audioSelect(5, 7, 3, k, 1, 8))).size, 'kind').toBeGreaterThan(1);
  });

  it('spreads roughly evenly across variants', () => {
    const counts = new Array<number>(5).fill(0);
    for (let tick = 0; tick < 5000; tick += 1) {
      const index = audioSelect(99, tick, 1, 'selection', 0, 5);
      counts[index] = (counts[index] ?? 0) + 1;
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(1200);
    }
  });
});
