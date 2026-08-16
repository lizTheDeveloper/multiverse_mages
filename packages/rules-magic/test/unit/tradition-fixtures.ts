/*
 * Multiverse Mages — shared setup for the tradition suites.
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

import { loadContent, shippedContentSource } from '@mm/content';
import type { ContentRegistry, HookPoint } from '@mm/content';

import type { ResolvedHook, TraditionTable } from '../../src/traditions/index.js';
import { hookFor, traditionTableFrom } from '../../src/traditions/index.js';

/**
 * The shipped content set, loaded once.
 *
 * Tests run against the real traditions rather than hand-written stubs. A stub
 * tradition would let a suite pass while the authored records said something
 * else entirely, and the three v1 records are content the release claims
 * things about.
 */
export const CONTENT: ContentRegistry = loadContent(shippedContentSource());

/** The lookup every arbitration in these suites goes through. */
export const TRADITIONS: TraditionTable = traditionTableFrom(CONTENT);

/** Interned id of a v1 tradition, by its content id. */
export function traditionId(id: string): number {
  const found = CONTENT.traditions.find((entry) => entry.record.id === id);
  if (found === undefined) throw new Error(`content ships no tradition "${id}"`);
  return found.contentId;
}

export const VANCIAN = traditionId('vancian-memorization');
export const TRUE_NAMING = traditionId('true-naming');
export const ART_OF_MEMORY = traditionId('art-of-memory');

/** Every v1 tradition, for the suites that must cover all three. */
export const V1_TRADITIONS: readonly (readonly [string, number])[] = [
  ['vancian-memorization', VANCIAN],
  ['true-naming', TRUE_NAMING],
  ['art-of-memory', ART_OF_MEMORY],
];

/** One hook of a tradition acting in its own sky. */
export function ownHook(hook: HookPoint, tradition: number): ResolvedHook {
  return hookFor(hook, tradition, tradition, TRADITIONS);
}
