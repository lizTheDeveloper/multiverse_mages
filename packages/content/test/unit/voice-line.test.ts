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
const populaceBanks = banks.filter((b) => b.speakerKind === 'populace');

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

  it('gives every populace role a non-empty bank of uniquely-id\'d lines (vision §6, sound-design §8.10)', () => {
    // No line-count floor here, unlike the species banks above: the shipped
    // counts (6/5/5/4) faithfully reflect §8.10's own enumerated lines, and a
    // floor pinned to today's count would just be re-deriving that number.
    // Listed rather than imported from `state`'s OCCUPATION enum, which would
    // keep them in step automatically: contracts §5 runs that dependency the
    // other way — `state` depends on `content` — so importing it here inverts
    // a module boundary, and the tests would pass only because vitest aliases
    // the workspace.
    //
    // The cost of a literal list is real and was paid: `idle` was the fifth
    // occupation for as long as the enum has existed and had no bank at all,
    // because a four-name list here never objected. This comment is the thing
    // that must be read when a sixth occupation is added.
    const expectedRoles = ['scribe', 'student', 'laborer', 'soldier', 'idle'].sort();
    expect(populaceBanks.map((b) => b.speaker).sort()).toEqual(expectedRoles);
    for (const bank of populaceBanks) {
      expect(bank.lines.length, `${bank.speaker} bank size`).toBeGreaterThan(0);
      const ids = bank.lines.map((l) => l.id);
      expect(new Set(ids).size, `${bank.speaker} unique line ids`).toBe(ids.length);
    }
  });

  it('casts every bank, and gives no two banks the same voice', () => {
    // §9.5 writes ten distinct voice directions and §8.1a makes each species'
    // comedic register distinct. Two banks sharing a voice would collapse two
    // registers into one performance, which is the failure this whole design
    // exists to avoid — and it is invisible until someone listens.
    for (const bank of banks) {
      expect(bank.voiceId, `${bank.speaker} has no voice assigned`).not.toBe('');
    }
    // Uniqueness applies to distinct *performers*, not to every bank. A
    // `populace-flavour` bank is the same species heard in a different job, so
    // it deliberately reuses that species' voice — a dwarf who lays stone
    // should sound like a dwarf. Requiring a unique voice there would mean
    // inventing six more voices nobody chose, to say the opposite of what the
    // content means.
    const cast = banks.filter((b) => b.speakerKind !== 'populace-flavour').map((b) => b.voiceId);
    expect(new Set(cast).size, 'two cast banks share a voice').toBe(cast.length);
    for (const bank of banks.filter((b) => b.speakerKind === 'populace-flavour')) {
      const species = banks.find((b) => b.speaker === bank.speaker && b.speakerKind === 'species');
      expect(species, `${bank.speaker} flavour bank has no species bank`).toBeDefined();
      expect(bank.voiceId, `${bank.speaker} flavour must reuse its species voice`).toBe(species?.voiceId);
    }
  });

  it('gives every species a flavour line for every occupation', () => {
    // contracts §1.3 keys a populace cohort by species AND occupation, so a
    // dwarf laborer and an orc laborer are different cohorts. Without this,
    // every non-mage of every species says the same five lines — which is what
    // shipped until someone noticed that not all laborers are human.
    const roles = ['scribe', 'student', 'laborer', 'soldier', 'idle'].sort();
    const flavour = banks.filter((b) => b.speakerKind === 'populace-flavour');
    const species = banks.filter((b) => b.speakerKind === 'species').map((b) => b.speaker).sort();
    expect(flavour.map((b) => b.speaker).sort()).toEqual(species);
    for (const bank of flavour) {
      const covered = bank.lines.map((l) => l.about).sort();
      expect(covered, `${bank.speaker} occupation coverage`).toEqual(roles);
      for (const line of bank.lines) {
        expect(line.tier, `${line.id} tier`).toBe('flavour');
      }
    }
  });

  it('has no duplicate line ids across all banks', () => {
    const ids = banks.flatMap((b) => b.lines.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
