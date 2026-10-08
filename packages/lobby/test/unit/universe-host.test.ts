/*
 * Multiverse Mages — a universe is founded holding what the player chose.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { describe, expect, it } from 'vitest';

import { GOD_ACTION, MAGE_TIER_SLOTS, OBSERVATION_BLOCKS, speciesSlot } from '@mm/agent-api';
import { referenceContent } from '@mm/scenario';

import { frameDocument } from '../../../../scripts/lib/frame-document.mjs';
import {
  UniverseHost,
  defaultUniverseName,
  validateConfig,
  validateName,
  type UniverseConfig,
} from '../../src/universe-host.js';

const shipped = referenceContent();
const doc = frameDocument(shipped, 'test');
const base: UniverseConfig = {
  species: 'dwarf',
  tradition: 'art-of-memory',
  techniques: ['intellego', 'rego'],
  forms: ['mentem', 'terram'],
  seed: 11,
  tickCap: 200,
};
const obs = (h: UniverseHost): number[] => h.frames[h.frames.length - 1]!.obs as number[];
const mages = OBSERVATION_BLOCKS.find((b) => b.name === 'mages')!;

describe('UniverseHost', () => {
  it('opens on exactly the chosen square', () => {
    const o = obs(new UniverseHost(base, doc, 0));
    expect(o.slice(0, 5)).toEqual([0, 1, 0, 0, 1]); // intellego, rego
    expect(o.slice(5, 19).map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([7, 8]); // mentem, terram
  });

  it.each(['dwarf', 'elf'])('founds %s and no other species', (species) => {
    const o = obs(new UniverseHost({ ...base, species }, doc, 0));
    const slots = mages.size / MAGE_TIER_SLOTS;
    const perSpecies = [...Array(slots).keys()].map((s) =>
      o
        .slice(mages.offset + s * MAGE_TIER_SLOTS, mages.offset + (s + 1) * MAGE_TIER_SLOTS)
        .reduce((a, b) => a + b, 0),
    );
    expect(perSpecies.filter((n) => n > 0)).toHaveLength(1);
    // The slot is resolved from content, not assumed from file order.
    const id = shipped.registry.species.find((e) => e.record.id === species)!.contentId;
    expect(perSpecies[speciesSlot(id)]).toBeGreaterThan(0);
  });

  it('holds the chosen tradition', () => {
    const a = obs(new UniverseHost({ ...base, tradition: 'true-naming' }, doc, 0))[35];
    const b = obs(new UniverseHost(base, doc, 0))[35];
    expect(a).not.toBe(b);
  });

  it('seeds inside uint32 when no seed is named', () => {
    const noSeed: UniverseConfig = { ...base };
    delete noSeed.seed;
    const h = new UniverseHost(noSeed, doc, 0);
    expect(h.seed).toBeGreaterThanOrEqual(0);
    expect(h.seed).toBeLessThanOrEqual(0xffff_ffff);
  });

  it('does not move time on enqueue; tick consumes the action and resolves it', async () => {
    const h = new UniverseHost(base, doc, 0);
    const q = h.enqueue({ kind: GOD_ACTION.noop })!;
    expect(h.frames).toHaveLength(1);
    expect(h.enqueue({ kind: GOD_ACTION.noop })).toBeNull(); // one per tick
    h.tick();
    expect(h.frames).toHaveLength(2);
    await expect(q.outcome).resolves.toMatchObject({ admitted: true });
  });

  it('stops at its cap and refuses what is queued after', async () => {
    const h = new UniverseHost({ ...base, tickCap: 3 }, doc, 0);
    for (let i = 0; i < 5; i += 1) h.tick();
    expect(h.isAlive).toBe(false);
    const n = h.frames.length;
    const q = h.enqueue({ kind: GOD_ACTION.noop })!;
    h.tick();
    expect(h.frames).toHaveLength(n);
    await expect(q.outcome).resolves.toMatchObject({ admitted: false });
  });

  it.each([
    [{ ...base, species: 'hobbit' }, /species/],
    [{ ...base, tradition: 'x' }, /tradition/],
    [{ ...base, techniques: [] }, /technique/],
    [{ ...base, forms: ['ignem', 'ignem', 'vim'] }, /form/],
    [{ ...base, seed: Date.UTC(2026, 0, 1) }, /seed/],
    [{ ...base, foundingPortalMagic: 2 }, /foundingPortalMagic/],
    [null, /config/],
  ])('rejects %j', (raw, msg) => expect(() => validateConfig(raw)).toThrow(msg));

  it('caps tickCap at the default unless a test raises it', () => {
    expect(() => validateConfig({ ...base, tickCap: 4001 })).toThrow(/tickCap/u);
    expect(validateConfig({ ...base, tickCap: 4001 }, 10_000).tickCap).toBe(4001);
  });

  it('accepts a valid config with foundingPortalMagic', () => {
    expect(validateConfig({ ...base, foundingPortalMagic: 1 })).toEqual({ ...base, foundingPortalMagic: 1 });
  });

  it('keeps a chosen name, and generates a stable one from the id otherwise', () => {
    expect(new UniverseHost({ ...base, name: 'Quiet Fen' }, doc, 0).name).toBe('Quiet Fen');
    const h = new UniverseHost(base, doc, 0);
    expect(h.speciesName).toBe('Dwarf');
    expect(h.name).toBe(defaultUniverseName(h.id, 'Dwarf'));
    expect(defaultUniverseName('00000000-0000-4000-8000-000000000000', 'Elf')).toBe(
      defaultUniverseName('00000000-0000-4000-8000-000000000000', 'Elf'),
    );
    // Different ids reach different nouns: the hash is not a constant.
    const nouns = new Set(Array.from({ length: 64 }, (_, i) => defaultUniverseName(`id-${String(i)}`, 'Elf')));
    expect(nouns.size).toBeGreaterThan(8);
  });
});

describe('validateName', () => {
  it.each([
    ['Quiet Fen', 'Quiet Fen'],
    ['  The   Ember  Court ', 'The Ember Court'],
    ["Ka'thar (II) & Co.", "Ka'thar (II) & Co."],
    ['Île-de-Flamme', 'Île-de-Flamme'],
    ['x'.repeat(32), 'x'.repeat(32)],
    [undefined, undefined],
    ['   ', undefined],
  ])('accepts %j as %j', (raw, want) => {
    expect(validateName(raw)).toBe(want);
  });

  it.each([
    ['<script>alert(1)</script>'],
    ['a<b'],
    ['line\nbreak'],
    ['nul\u0000'],
    ['bell\u0007'],
    ['bidi\u202Eflip'],
    ['zero\u200Bwidth'],
    ['zalgo\u0301\u0301'],
    ['emoji \u{1F525}'],
    ['x'.repeat(33)],
    ['x'.repeat(200)],
    ['---'],
    [7],
    [{}],
  ])('refuses %j', (raw) => {
    expect(() => validateName(raw)).toThrow(/name/u);
  });
});

