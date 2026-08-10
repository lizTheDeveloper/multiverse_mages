/*
 * Multiverse Mages — ruleset arbitration across all four cases.
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
 * Task 1.7 and the `state-schema` scenarios for arbitration: both axes
 * permitted, dispensation, interdiction, and neither.
 *
 * The cases are exercised through the real cell-id encoding rather than through
 * hand-picked integers, because half of what `permits` does is decode a cell id
 * into two bit positions. A test that passed bit positions directly would leave
 * the decoding — the part that can be off by one for the whole grid at once —
 * unexercised.
 */

import { describe, expect, it } from 'vitest';

import type { Edict, Ruleset } from '@mm/state';
import {
  EDICT_KIND,
  GRID_CELL_COUNT,
  assertNoEdictConflict,
  cellIdAt,
  findEdictConflict,
  formBitOf,
  permits,
  techniqueBitOf,
} from '@mm/state';

/** `rego` at technique bit 4, `corpus` at form bit 3 — §2.1's own example. */
const REGO_BIT = 4;
const CORPUS_BIT = 3;
const REGO_CORPUS = cellIdAt(REGO_BIT, CORPUS_BIT);

/** A different cell, sharing neither axis, for "the edict applies to one cell". */
const OTHER_TECHNIQUE_BIT = 1;
const OTHER_FORM_BIT = 7;
const OTHER_CELL = cellIdAt(OTHER_TECHNIQUE_BIT, OTHER_FORM_BIT);

function ruleset(
  techniqueBits: readonly number[],
  formBits: readonly number[],
  edicts: readonly Edict[] = [],
): Ruleset {
  let permittedTechniques = 0;
  for (const bit of techniqueBits) permittedTechniques |= 1 << bit;
  let permittedForms = 0;
  for (const bit of formBits) permittedForms |= 1 << bit;
  return { permittedTechniques, permittedForms, edicts };
}

describe('permits arbitrates the four cases of contracts.md §1.1', () => {
  it('permits a cell whose technique and form are both permitted', () => {
    expect(permits(ruleset([REGO_BIT], [CORPUS_BIT]), REGO_CORPUS)).toBe(true);
  });

  it('permits a cell named by a dispensation even though its technique is forbidden', () => {
    const rules = ruleset([], [CORPUS_BIT], [{ cellId: REGO_CORPUS, kind: EDICT_KIND.dispensation }]);
    expect(permits(rules, REGO_CORPUS)).toBe(true);
  });

  it('forbids a cell named by an interdiction even though both axes are permitted', () => {
    const rules = ruleset(
      [REGO_BIT],
      [CORPUS_BIT],
      [{ cellId: REGO_CORPUS, kind: EDICT_KIND.interdiction }],
    );
    expect(permits(rules, REGO_CORPUS)).toBe(false);
  });

  it('forbids a cell whose technique and form are both forbidden', () => {
    expect(permits(ruleset([], []), REGO_CORPUS)).toBe(false);
  });
});

describe('permits resolves precedence the same way regardless of issue order', () => {
  const both: readonly Edict[] = [
    { cellId: REGO_CORPUS, kind: EDICT_KIND.dispensation },
    { cellId: REGO_CORPUS, kind: EDICT_KIND.interdiction },
  ];

  it('lets interdiction beat dispensation whichever was issued first', () => {
    // The precedence rule is the reason the loop cannot return on the first
    // match it finds. If it did, the answer would depend on the order edicts
    // happen to sit in — and two peers whose edict entities were created in
    // different orders would arbitrate the same ruleset differently.
    expect(permits(ruleset([REGO_BIT], [CORPUS_BIT], both), REGO_CORPUS)).toBe(false);
    expect(permits(ruleset([REGO_BIT], [CORPUS_BIT], [...both].reverse()), REGO_CORPUS)).toBe(false);
  });

  it('reports the conflicted cell rather than tolerating it', () => {
    expect(findEdictConflict(both)).toBe(REGO_CORPUS);
    expect(() => {
      assertNoEdictConflict(both);
    }).toThrow(/both an interdiction and a dispensation/);
  });

  it('reports no conflict when a cell carries only one kind', () => {
    expect(findEdictConflict([{ cellId: REGO_CORPUS, kind: EDICT_KIND.interdiction }])).toBe(0);
    expect(findEdictConflict([])).toBe(0);
  });
});

describe('an edict applies to one cell, not to an axis', () => {
  it('does not lift a forbidden technique for the cell next door', () => {
    const rules = ruleset(
      [],
      [CORPUS_BIT, OTHER_FORM_BIT],
      [{ cellId: REGO_CORPUS, kind: EDICT_KIND.dispensation }],
    );
    expect(permits(rules, REGO_CORPUS)).toBe(true);
    expect(permits(rules, cellIdAt(REGO_BIT, OTHER_FORM_BIT))).toBe(false);
  });

  it('does not forbid the cell next door when one cell is interdicted', () => {
    const rules = ruleset(
      [REGO_BIT, OTHER_TECHNIQUE_BIT],
      [CORPUS_BIT, OTHER_FORM_BIT],
      [{ cellId: REGO_CORPUS, kind: EDICT_KIND.interdiction }],
    );
    expect(permits(rules, REGO_CORPUS)).toBe(false);
    expect(permits(rules, OTHER_CELL)).toBe(true);
  });
});

describe('permits decodes cell ids over the whole grid', () => {
  it('agrees with the axis bitmasks for all 70 cells', () => {
    // The exhaustive version of the first four cases. A decoding that was off
    // by one would still pass a single hand-picked cell, and would forbid or
    // permit a whole diagonal of the grid.
    const permittedTechniques = 0b10101;
    const permittedForms = 0b10101010101010;
    const rules: Ruleset = { permittedTechniques, permittedForms, edicts: [] };

    for (let cellId = 1; cellId <= GRID_CELL_COUNT; cellId += 1) {
      const expected =
        (permittedTechniques & (1 << techniqueBitOf(cellId))) !== 0 &&
        (permittedForms & (1 << formBitOf(cellId))) !== 0;
      expect(permits(rules, cellId), `cell ${cellId}`).toBe(expected);
    }
  });

  it('rejects an id that does not name a cell rather than answering false', () => {
    const rules = ruleset([REGO_BIT], [CORPUS_BIT]);
    // Answering `false` would make a mis-derived cell id look like a design
    // decision: every spell in that cell would silently become illegal.
    expect(() => permits(rules, 0)).toThrow(RangeError);
    expect(() => permits(rules, GRID_CELL_COUNT + 1)).toThrow(RangeError);
    expect(() => permits(rules, -1)).toThrow(RangeError);
    expect(() => permits(rules, 1.5)).toThrow(RangeError);
  });
});
