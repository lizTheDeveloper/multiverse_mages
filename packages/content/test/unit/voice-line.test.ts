/*
 * Multiverse Mages — voice line bank tests.
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
 * The barks are the explain channel made audible (contracts §4.4): vision §7
 * makes mage autonomy a pillar, and without a data path autonomy reads as
 * randomness. They are also, per sound-design §8.2, the one place a sound does
 * mechanical work — the last-copy line is `libraryDependence` (contracts §7)
 * surfaced per-mage, which is why every species bank must carry exactly one.
 */

import { describe, expect, it } from 'vitest';

import {
  directorySource,
  loadAudioContent,
  loadContent,
  shippedAudioDirectory,
  shippedContentSource,
} from '@mm/content';

const banks = loadAudioContent(directorySource(shippedAudioDirectory(), 'data/audio')).banks;
const speciesBanks = banks.filter((b) => b.speakerKind === 'species');

describe('voice line banks', () => {
  it('gives every playable species a bank', () => {
    const species = loadContent(shippedContentSource()).species.map((s) => s.record.id).sort();
    expect(speciesBanks.map((b) => b.speaker).sort()).toEqual(species);
  });

  it('gives every species bank exactly one last-copy line', () => {
    for (const bank of speciesBanks) {
      const lastCopy = bank.lines.filter((l) => l.tier === 'last-copy');
      expect(lastCopy, `${bank.speaker} last-copy lines`).toHaveLength(1);
    }
  });

  it('escalates: every species bank carries all four annoyance tiers', () => {
    const tiers = [
      'annoyance-polite', 'annoyance-irritated',
      'annoyance-cracking', 'annoyance-unhinged',
    ] as const;
    for (const bank of speciesBanks) {
      for (const tier of tiers) {
        const count = bank.lines.filter((l) => l.tier === tier).length;
        expect(count, `${bank.speaker} ${tier}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('meets the §8.1 bank size floor', () => {
    for (const bank of speciesBanks) {
      expect(bank.lines.length, `${bank.speaker} bank size`).toBeGreaterThanOrEqual(28);
    }
  });

  it('points every cross-species line at a species that exists', () => {
    const speakers = new Set(speciesBanks.map((b) => b.speaker));
    for (const bank of banks) {
      for (const line of bank.lines.filter((l) => l.tier === 'cross-species')) {
        expect(speakers.has(line.about), `${line.id} -> ${line.about}`).toBe(true);
      }
    }
  });

  it('has no duplicate line ids across all banks', () => {
    const ids = banks.flatMap((b) => b.lines.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
