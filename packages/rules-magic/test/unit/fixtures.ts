/*
 * Multiverse Mages — synthetic content for the grid and dormancy tests.
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
 * A hand-built content set, shaped exactly like `@mm/content`'s registry but
 * owing nothing to the shipped data files.
 *
 * **Why not just load the real content.** The v1 node graphs are being authored
 * in the same change these tests belong to, so a test that asserted anything
 * about `rego-limen`'s third node would break every time a content author added
 * one — and would then be "fixed" by editing the assertion, which is how a suite
 * stops testing behaviour and starts transcribing data. The grid rules under
 * test are about *any* content: seventy addressable cells, prerequisites that
 * may cross them, dormancy that follows the ruleset. The fixture supplies the
 * smallest content set in which each of those is observable.
 *
 * The technique and form ids and their `bit` values are the real ones, because
 * cell ids are grid coordinates (`contracts.md` §2.1) and a fixture with
 * invented axes would exercise a different arithmetic than the game runs. The
 * *nodes* are invented, and deliberately look it.
 */

import type {
  CellRecord,
  FormRecord,
  Interned,
  NodeRecord,
  TechniqueRecord,
} from '@mm/content';

import type { GridContent } from '@mm/rules-magic';

/** The five techniques and their §2.1 bit positions, in authored order. */
export const FIXTURE_TECHNIQUES: readonly (readonly [string, number])[] = [
  ['creo', 0],
  ['intellego', 1],
  ['muto', 2],
  ['perdo', 3],
  ['rego', 4],
];

/** The fourteen forms and their §2.1 bit positions, in authored order. */
export const FIXTURE_FORMS: readonly (readonly [string, number])[] = [
  ['animal', 0],
  ['aquam', 1],
  ['auram', 2],
  ['corpus', 3],
  ['herbam', 4],
  ['ignem', 5],
  ['imaginem', 6],
  ['mentem', 7],
  ['terram', 8],
  ['vim', 9],
  ['umbra', 10],
  ['fatum', 11],
  ['limen', 12],
  ['nomen', 13],
];

/** One invented node: everything the grid reads, and nothing else. */
export interface FixtureNode {
  readonly id: string;
  readonly cell: string;
  readonly tier?: number;
  readonly prerequisites?: readonly string[];
}

export interface FixtureOptions {
  /** Cell ids to flag `"v1": true`. Everything else loads as non-v1 and empty. */
  readonly v1Cells?: readonly string[];
  readonly nodes?: readonly FixtureNode[];
  /** Cell ids to omit from the cell list entirely — content that never authored them. */
  readonly omitCells?: readonly string[];
}

/** Interns technique and form ids from the authored bit, as `@mm/content` does. */
function internFromBit(bit: number): number {
  return bit + 1;
}

/** Interns a cell from its grid position, as `@mm/content` does. */
function internCell(techniqueBit: number, formBit: number): number {
  return techniqueBit * FIXTURE_FORMS.length + formBit + 1;
}

/**
 * Code-unit sort, matching `@mm/content`'s `internSorted`.
 *
 * `<` rather than `localeCompare` for the reason the loader gives: collation
 * varies with the ICU build, and a fixture that interned differently on another
 * machine would make these tests machine-dependent in exactly the way the whole
 * project forbids.
 */
function internSorted(ids: readonly string[]): ReadonlyMap<string, number> {
  const sorted = [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return new Map(sorted.map((id, index) => [id, index + 1]));
}

/** A full 5 × 14 synthetic content set. */
export function gridContentFixture(options: FixtureOptions = {}): GridContent {
  const v1 = new Set(options.v1Cells ?? []);
  const omitted = new Set(options.omitCells ?? []);
  const nodes = options.nodes ?? [];

  const techniques: Interned<TechniqueRecord>[] = FIXTURE_TECHNIQUES.map(([id, bit]) => ({
    contentId: internFromBit(bit),
    record: { id, name: id, gloss: `${id} (fixture)`, bit },
  }));

  const forms: Interned<FormRecord>[] = FIXTURE_FORMS.map(([id, bit]) => ({
    contentId: internFromBit(bit),
    record: { id, name: id, gloss: `${id} (fixture)`, bit },
  }));

  const nodesByCell = new Map<string, string[]>();
  for (const node of nodes) {
    const existing = nodesByCell.get(node.cell);
    if (existing === undefined) nodesByCell.set(node.cell, [node.id]);
    else existing.push(node.id);
  }

  const cells: Interned<CellRecord>[] = [];
  for (const [technique, techniqueBit] of FIXTURE_TECHNIQUES) {
    for (const [form, formBit] of FIXTURE_FORMS) {
      const id = `${technique}-${form}`;
      if (omitted.has(id)) continue;
      cells.push({
        contentId: internCell(techniqueBit, formBit),
        record: {
          id,
          technique,
          form,
          classicalLabels: [],
          nodes: nodesByCell.get(id) ?? [],
          ...(v1.has(id) ? { v1: true } : {}),
        },
      });
    }
  }

  const nodeIds = internSorted(nodes.map((node) => node.id));
  const internedNodes: Interned<NodeRecord>[] = nodes.map((node) => ({
    contentId: nodeIds.get(node.id) as number,
    record: {
      id: node.id,
      cell: node.cell,
      name: node.id,
      gloss: `${node.id} (fixture)`,
      tier: node.tier ?? 1,
      prerequisites: node.prerequisites ?? [],
      researchCost: 1024,
      teachCost: 1024,
      scribeCost: 1024,
      rediscoveryMultiplier: 5376,
      effects: [],
      tuningStatus: 'untuned',
    },
  }));

  return { techniques, forms, cells, nodes: internedNodes };
}

/** The interned id a fixture gave a node, by its authored string id. */
export function fixtureNodeId(content: GridContent, id: string): number {
  const found = content.nodes.find((node) => node.record.id === id);
  if (found === undefined) throw new Error(`fixture has no node ${id}`);
  return found.contentId;
}
