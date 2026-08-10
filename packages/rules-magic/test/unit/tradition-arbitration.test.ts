/*
 * Multiverse Mages — hook arbitration across a portal.
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

import { describe, expect, it } from 'vitest';

import { HOOK_POINTS } from '@mm/content';

import {
  NO_TRADITION,
  hookFor,
  hookSourceFor,
  hooksOfTradition,
  portalHookSet,
} from '../../src/traditions/index.js';

import { ART_OF_MEMORY, TRADITIONS, TRUE_NAMING, V1_TRADITIONS, VANCIAN } from './tradition-fixtures.js';

describe('the clock split (vision.md §4a)', () => {
  it('keeps the world-time hooks with the raider', () => {
    expect(hookSourceFor('acquire')).toBe('home');
    expect(hookSourceFor('store')).toBe('home');
  });

  it('gives the engagement-time hooks to the host', () => {
    expect(hookSourceFor('cast')).toBe('host');
    expect(hookSourceFor('cost')).toBe('host');
  });

  it('assigns every hook point to exactly one clock', () => {
    // A point with no side would silently resolve to `undefined` and, further
    // down, to the host — the wrong answer, arrived at by omission.
    for (const point of HOOK_POINTS) {
      expect(['home', 'host']).toContain(hookSourceFor(point));
    }
  });
});

describe('hookFor', () => {
  it('takes acquire and store from a True Naming home in an Art of Memory sky', () => {
    expect(hookFor('acquire', TRUE_NAMING, ART_OF_MEMORY, TRADITIONS).kind).toBe('true-name');
    expect(hookFor('store', TRUE_NAMING, ART_OF_MEMORY, TRADITIONS).kind).toBe('standard');
  });

  it('takes cast and cost from an Art of Memory host, whoever the raider is', () => {
    expect(hookFor('cast', VANCIAN, ART_OF_MEMORY, TRADITIONS).kind).toBe('standard');
    expect(hookFor('cost', VANCIAN, ART_OF_MEMORY, TRADITIONS).kind).toBe('standard');
  });

  it('gives a raider in her own sky exactly her own four kinds', () => {
    for (const [, tradition] of V1_TRADITIONS) {
      const own = hooksOfTradition(tradition, TRADITIONS);
      for (const point of HOOK_POINTS) {
        expect(hookFor(point, tradition, tradition, TRADITIONS).kind).toBe(own[point].kind);
      }
    }
  });

  it('is pure — the same arguments give the same answer, and nothing is cached', () => {
    const first = hookFor('store', ART_OF_MEMORY, VANCIAN, TRADITIONS);
    const second = hookFor('store', ART_OF_MEMORY, VANCIAN, TRADITIONS);
    expect(second).toEqual(first);
    // Asking about a different pair in between must not perturb the answer.
    hookFor('store', VANCIAN, ART_OF_MEMORY, TRADITIONS);
    expect(hookFor('store', ART_OF_MEMORY, VANCIAN, TRADITIONS)).toEqual(first);
  });

  it('carries a hook’s params through with its kind', () => {
    const store = hookFor('store', ART_OF_MEMORY, VANCIAN, TRADITIONS);
    expect(store.params['slotsPerMage']).toBe(12);
    expect(store.params['lootable']).toBe(false);
  });

  it('refuses a universe with no tradition rather than defaulting to standard', () => {
    // contracts.md §1.1: exactly one, never 0. A zeroed universe row that
    // resolved to "standard everything" would be a plausible answer to an
    // unconstructed question, and would hide the missing selection indefinitely.
    expect(() => hookFor('acquire', NO_TRADITION, VANCIAN, TRADITIONS)).toThrow(/no tradition/i);
    expect(() => hookFor('cast', VANCIAN, NO_TRADITION, TRADITIONS)).toThrow(/no tradition/i);
  });

  it('refuses an id no loaded content declares, and says why that is not a default', () => {
    expect(() => hookFor('cost', VANCIAN, 9999, TRADITIONS)).toThrow(/contentRevision/);
  });

  it('names which side was at fault', () => {
    expect(() => hookFor('acquire', NO_TRADITION, VANCIAN, TRADITIONS)).toThrow(/home/);
    expect(() => hookFor('cast', VANCIAN, NO_TRADITION, TRADITIONS)).toThrow(/host/);
  });
});

describe('portalHookSet', () => {
  it('resolves the raider’s own cast kind for readying, and the host’s for spending', () => {
    // contracts.md §1.6: "readied at home, spent abroad" — the one place `cast`
    // resolves twice, to two different universes.
    const set = portalHookSet(VANCIAN, ART_OF_MEMORY, TRADITIONS);
    expect(set.homeCast.kind).toBe('prepared');
    expect(set.hostCast.kind).toBe('standard');
    expect(set.homeStore.kind).toBe('standard');
    expect(set.hostCost.kind).toBe('standard');
  });

  it('resolves the mirror case the other way round', () => {
    const set = portalHookSet(ART_OF_MEMORY, VANCIAN, TRADITIONS);
    expect(set.homeCast.kind).toBe('standard');
    expect(set.hostCast.kind).toBe('prepared');
    expect(set.homeStore.kind).toBe('palace');
    expect(set.hostCost.kind).toBe('prepaid');
  });

  it('collapses to one tradition at home', () => {
    const set = portalHookSet(VANCIAN, VANCIAN, TRADITIONS);
    expect(set.homeCast.kind).toBe(set.hostCast.kind);
  });
});
