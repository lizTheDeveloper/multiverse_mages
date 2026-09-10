/*
 * Multiverse Mages — the primitive registry and the contract table cannot drift.
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
 * `docs/design/contracts.md` §3 is normative and says so: "the table there is
 * normative and this file must match it". A normative table that nothing checks
 * is a table that is right on the day it is written and quietly wrong three
 * changes later, and the drift is invisible because both artefacts read
 * plausibly on their own — the doc says `ward` caps at 90%, the data says 922,
 * and only someone holding both at once notices when one moves.
 *
 * So this test parses the *actual markdown table* out of the *actual document*
 * and compares it against the *actual data file*. There is deliberately no
 * third copy of the table here: a hard-coded expectation would be one more
 * thing to drift, and the check would then be measuring its own opinion.
 *
 * The comparison is exact in both directions — every primitive in the document
 * is in the registry and every primitive in the registry is in the document.
 * Not a subset, not a superset.
 *
 * ## The two places prose has to be turned into data
 *
 * The document is written for humans, so two small translations are unavoidable
 * and both are kept mechanical and total rather than table-driven:
 *
 * - **Units** are prose ("HP per application") against kebab slugs
 *   (`hp-per-application`). {@link slugify} is a single rule applied to every
 *   row; where the data did not match it, the *data* was changed, so there is
 *   no per-primitive exception list to fall out of date.
 * - **Stacking rules** are English phrases against an enum. {@link stackingOf}
 *   recognises one phrase per rule and throws on anything it does not
 *   recognise, so rewording a cell fails loudly here instead of silently
 *   passing.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { shippedDataDirectory } from '@mm/content';
import type { PrimitiveCap, PrimitiveRecord, PrimitiveStacking } from '@mm/content';

/**
 * `PrimitiveStacking` plus `diminishing` (`lifespan`'s W20 stacking rule,
 * `docs/design/compositional-content.md` §3.3). `@mm/content`'s own enum does
 * not list it yet — see the identical widening, and the identical reason,
 * in `packages/primitives/src/stacking.ts`'s `PrimitiveStackingRule`.
 */
type StackingRule = PrimitiveStacking | 'diminishing';

/** From packages/content/test/unit/ up to the repository root. */
const repoRoot = new URL('../../../../', import.meta.url);
const contractsPath = fileURLToPath(new URL('docs/design/contracts.md', repoRoot));

const contracts = readFileSync(contractsPath, 'utf8');

/**
 * `floor` (W20, `docs/design/compositional-content.md` §3.3) is authored in
 * `primitive.json` and stated in §3's table, but `@mm/content`'s `PrimitiveRecord`
 * does not declare it yet — the loader passes it through untyped rather than
 * stripping it, so this local extension reads real data without waiting on that
 * package's own types to catch up.
 */
type PrimitiveRecordWithFloor = PrimitiveRecord & { readonly floor?: PrimitiveCap };

/** The shipped data file itself, not the loaded registry: this check is about
 * what is written down, so it must not be filtered through the loader. */
const registry = JSON.parse(
  readFileSync(join(shippedDataDirectory(), 'primitive.json'), 'utf8'),
) as readonly PrimitiveRecordWithFloor[];

/** The scale column's three permitted values, per contracts.md §3. */
type Scale = 'world' | 'engagement' | 'both';

interface ContractCap {
  readonly kind: 'none' | 'fp' | 'fraction-of-species-base' | 'count-per-side';
  /** Absent when the document states a cap exists but not what it is. */
  readonly value?: number;
}

interface ContractRow {
  readonly id: string;
  readonly unit: string;
  readonly scale: Scale;
  readonly stacking: StackingRule;
  readonly cap: ContractCap;
  /** Absent when the document's Floor cell reads "—": the primitive has none. */
  readonly floor: ContractCap | undefined;
  /** The raw stacking cell, so a failure message can show what was read. */
  readonly source: string;
}

/**
 * Prose to kebab slug. One rule, applied to every unit cell:
 *
 * - `/` becomes " or ", so "targeting/detection" reads as a disjunction rather
 *   than losing the boundary between two words;
 * - anything that is not a letter, digit, space, or hyphen becomes a space,
 *   which is what drops the punctuation and the parentheses;
 * - runs of space and hyphen collapse to a single hyphen.
 */
function slugify(prose: string): string {
  return prose
    .toLowerCase()
    .replaceAll('/', ' or ')
    .replace(/[^a-z0-9 -]+/gu, ' ')
    .trim()
    .replace(/[\s-]+/gu, '-');
}

/**
 * The one phrase that identifies each stacking rule, most specific first.
 *
 * `additive into` must precede bare `additive`, since the rate rows contain
 * both words and mean the multiplier form. This ordering is the only reason
 * this is a list rather than a map.
 */
const STACKING_PHRASES: readonly (readonly [string, StackingRule])[] = [
  ['ward factor applied to the sum', 'summed-then-single-ward'],
  ['multiplicative on the remainder', 'multiplicative-on-remainder'],
  ['additive into', 'additive-into-multiplier'],
  ['diminishing returns', 'diminishing'],
  ['max, not sum', 'max'],
  ['presence only', 'presence'],
  ['additive', 'additive'],
];

function stackingOf(cell: string, id: string): StackingRule {
  const prose = cell.replaceAll('**', '');
  for (const [phrase, rule] of STACKING_PHRASES) {
    if (prose.includes(phrase)) {
      return rule;
    }
  }
  throw new Error(
    `contracts.md §3 describes "${id}" stacking as ${JSON.stringify(cell)}, which does not ` +
      'contain any recognised rule phrase. Either the table was reworded or a stacking rule was ' +
      'added; update STACKING_PHRASES and primitive.schema.json together.',
  );
}

/**
 * Reads the cap out of the same cell the stacking rule came from.
 *
 * `fp(N)` is literal. `+N% of species base` converts to the fraction the
 * registry stores: the contract writes it as a percentage, the data stores it
 * at scale 1024, so `+50%` is `fp(512)`. The conversion is asserted to be exact
 * rather than rounded, because a cap that is 51.2% "because of rounding" is a
 * balance number nobody chose.
 */
function capOf(cell: string, id: string): ContractCap {
  const fp = /`fp\((\d+)\)`/u.exec(cell);
  if (fp?.[1] !== undefined) {
    return { kind: 'fp', value: Number(fp[1]) };
  }

  const percentOfBase = /cap\s+`\+(\d+)%`\s+of species base/u.exec(cell);
  if (percentOfBase?.[1] !== undefined) {
    const percent = Number(percentOfBase[1]);
    const scaled = (percent * 1024) / 100;
    if (!Number.isInteger(scaled)) {
      throw new Error(
        `contracts.md §3 caps "${id}" at +${String(percent)}% of species base, which is not ` +
          'exactly representable at scale 1024. State the cap as an fp value instead.',
      );
    }
    return { kind: 'fraction-of-species-base', value: scaled };
  }

  if (/capped per side/u.test(cell)) {
    // No number in the document. See the dedicated test below.
    return { kind: 'count-per-side' };
  }

  return { kind: 'none' };
}

/**
 * Reads the Floor column. Unlike the cap, which is always present as at least
 * `{ kind: "none" }`, a primitive with no floor omits the field entirely in
 * `primitive.json` — so the document's "—" parses to `undefined`, not to a
 * `{ kind: "none" }` object, and the per-row check below compares presence
 * directly rather than kind.
 */
function floorOf(cell: string, id: string): ContractCap | undefined {
  const trimmed = cell.trim();
  if (trimmed === '—' || trimmed.toLowerCase() === 'none') {
    return undefined;
  }

  const fp = /`fp\((\d+)\)`/u.exec(cell);
  if (fp?.[1] !== undefined) {
    return { kind: 'fp', value: Number(fp[1]) };
  }

  throw new Error(
    `contracts.md §3 gives "${id}" an unrecognised Floor cell: ${JSON.stringify(cell)}. ` +
      'Expected "—" or a `fp(N)` value.',
  );
}

/**
 * Extracts §3's table.
 *
 * Bounded by the section heading and the next heading of any level, so a table
 * added elsewhere in the document cannot be picked up by accident, and a §3
 * that stops containing a table fails rather than silently comparing nothing.
 */
function contractRows(): readonly ContractRow[] {
  const section = /^## 3\. Effect Primitive Semantics$(?<body>[\s\S]*?)^## /mu.exec(contracts);
  const body = section?.groups?.['body'];
  if (body === undefined) {
    throw new Error('contracts.md has no "## 3. Effect Primitive Semantics" section to check against');
  }

  const rows: ContractRow[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;

    const cells = trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
    if (cells.length !== 5) {
      throw new Error(
        `contracts.md §3 table row has ${String(cells.length)} columns, expected 5: ${trimmed}`,
      );
    }

    const [primitive, unit, scale, stacking, floor] = cells as [
      string,
      string,
      string,
      string,
      string,
    ];
    if (primitive === 'Primitive' || primitive.startsWith('---')) continue;

    const id = primitive.replaceAll('`', '');
    if (scale !== 'world' && scale !== 'engagement' && scale !== 'both') {
      throw new Error(`contracts.md §3 gives "${id}" the scale ${JSON.stringify(scale)}`);
    }

    rows.push({
      id,
      unit: slugify(unit),
      scale,
      stacking: stackingOf(stacking, id),
      cap: capOf(stacking, id),
      floor: floorOf(floor, id),
      source: stacking,
    });
  }

  if (rows.length === 0) {
    throw new Error('contracts.md §3 was found but yielded no table rows');
  }
  return rows;
}

const rows = contractRows();
const rowById = new Map(rows.map((row) => [row.id, row]));
const recordById = new Map(registry.map((record) => [record.id, record]));

describe('the primitive registry matches contracts.md §3', () => {
  it('parses a table that is worth comparing against', () => {
    // Non-vacuity. If the parser silently found nothing — a renamed heading, a
    // reformatted table — every per-primitive check below would pass by
    // iterating an empty list.
    expect(rows.length).toBeGreaterThan(10);
    expect(rowById.get('ward')?.cap).toEqual({ kind: 'fp', value: 922 });
    expect(rowById.get('blink')?.stacking).toBe('max');
  });

  it('declares exactly the same primitives, in neither direction a subset', () => {
    const documented = rows.map((row) => row.id).sort();
    const implemented = registry.map((record) => record.id).sort();
    expect(implemented).toEqual(documented);
  });

  it.each(rows.map((row) => [row.id, row] as const))('matches %s', (id, row) => {
    const record = recordById.get(id);
    expect(record, `primitive.json has no "${id}"`).toBeDefined();
    if (record === undefined) return;

    expect(record.unit, `unit for ${id}`).toBe(row.unit);
    expect(record.scale, `scale for ${id}`).toBe(row.scale);
    expect(record.stacking, `stacking for ${id} (from ${JSON.stringify(row.source)})`).toBe(
      row.stacking,
    );
    expect(record.cap.kind, `cap kind for ${id}`).toBe(row.cap.kind);

    if (row.cap.value === undefined) {
      // The document names a cap but no number — only `summon`. Asserting the
      // kind is all the contract supports; see the test below.
      expect(record.cap.kind).not.toBe('fp');
    } else {
      expect(record.cap.value, `cap value for ${id}`).toBe(row.cap.value);
    }

    if (row.floor === undefined) {
      expect(record.floor, `${id} should have no authored floor`).toBeUndefined();
    } else {
      expect(record.floor, `${id} should have an authored floor`).toEqual(row.floor);
    }
  });

  it('gives every world-scale rate primitive named in W20 a floor, and no other primitive one', () => {
    // docs/design/compositional-content.md §3.3: a Perdo `remove` (or a
    // draining `transform`) now contributes a negative magnitude into these
    // seven `additive-into-multiplier` folds, and an uncapped-below rate is a
    // division hazard. This is the seven-primitive enumeration, checked by
    // name rather than trusted to "every additive-into-multiplier row",
    // because `build-rate` et al. sharing a stacking rule with a
    // floor-bearing primitive is a coincidence the schema does not enforce.
    const floored = ['build-rate', 'resource-yield', 'research-rate', 'teach-rate', 'scribe-rate', 'fertility', 'worship-yield'];
    for (const id of floored) {
      expect(rowById.get(id)?.floor, `${id} should be floored in contracts.md §3`).toEqual({
        kind: 'fp',
        value: 256,
      });
      expect(recordById.get(id)?.floor, `${id} should be floored in primitive.json`).toEqual({
        kind: 'fp',
        value: 256,
      });
    }

    for (const row of rows) {
      if (floored.includes(row.id)) continue;
      expect(row.floor, `${row.id} should not carry a floor`).toBeUndefined();
    }
  });

  it('converts the species-base cap from percent to scale 1024', () => {
    // +50% of species base is fp(512). Spelled out because it is the one row
    // where the document's unit and the registry's unit differ.
    expect(rowById.get('lifespan')?.cap).toEqual({
      kind: 'fraction-of-species-base',
      value: 512,
    });
    expect(recordById.get('lifespan')?.cap).toEqual({
      kind: 'fraction-of-species-base',
      value: 512,
    });
  });

  it('records that summon’s per-side count is chosen by the data, not the contract', () => {
    // contracts.md §3 says `summon` is "additive, capped per side" and gives no
    // number; primitive.json picks 8. That is an unratified choice, not a
    // match, and this test exists to say so out loud rather than let the
    // kind-only comparison above look like agreement.
    //
    // If a number is ever written into the document, `row.cap.value` becomes
    // defined, this assertion fails, and the per-primitive check above starts
    // requiring the two to agree. That is the intended way for this to end.
    const row = rowById.get('summon');
    expect(row?.cap.kind).toBe('count-per-side');
    expect(row?.cap.value).toBeUndefined();

    const record = recordById.get('summon');
    expect(record?.cap.kind).toBe('count-per-side');
    expect(Number.isInteger(record?.cap.value)).toBe(true);
    expect(record?.cap.value).toBeGreaterThan(0);
  });
});
