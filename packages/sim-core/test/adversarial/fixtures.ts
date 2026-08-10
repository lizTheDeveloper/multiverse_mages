/*
 * Multiverse Mages — shared fixtures for the adversarial snapshot test suite.
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

import type { WorldSchema } from '../../src/state.js';
import { defineWorld } from '../../src/state.js';

/** A component whose fields span every declared storage width, for boundary tests. */
export const widths = {
  name: 'widths',
  fields: {
    i8: 'i8',
    u8: 'u8',
    i16: 'i16',
    u16: 'u16',
    i32: 'i32',
    u32: 'u32',
  },
} as const;

export const vitality = { name: 'vitality', fields: { hp: 'i32', age: 'u16' } } as const;
export const wealth = { name: 'wealth', fields: { coins: 'u32' } } as const;
/** A component nobody in a given test attaches. */
export const untouched = { name: 'untouched', fields: { flag: 'u8' } } as const;

/** The standard multi-component world most tests build states against. */
export const world: WorldSchema = defineWorld({
  components: [vitality, wealth],
  systems: [],
});

/** A world including a field-width-spanning component, for boundary-value tests. */
export const widthWorld: WorldSchema = defineWorld({
  components: [widths],
  systems: [],
});

/** A world with a component nothing ever attaches, for the "nobody carries it" case. */
export const withUntouched: WorldSchema = defineWorld({
  components: [vitality, untouched],
  systems: [],
});

/** A world declaring no components at all. */
export const emptyWorld: WorldSchema = defineWorld({
  components: [],
  systems: [],
});
