/*
 * Multiverse Mages — the magic grid: addressing, v1 membership, prerequisites.
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
 * `magic-grid`, the addressing and prerequisite requirements. The dormancy and
 * availability halves of the same capability are next door in
 * `dormancy.test.ts`, because they need a ruleset and these do not — the grid is
 * a fact about content, and no assertion in this file mentions a universe.
 */

import { REQUIRED_V1_CELL, loadContent, shippedContentSource } from '@mm/content';
import { GRID_CELL_COUNT, GRID_FORM_COUNT, GRID_TECHNIQUE_COUNT } from '@mm/state';
import { describe, expect, it } from 'vitest';

import { MagicGrid, heldNodes } from '@mm/rules-magic';

import { FIXTURE_FORMS, FIXTURE_TECHNIQUES, fixtureNodeId, gridContentFixture } from './fixtures.js';

const V1 = ['rego-limen', 'intellego-limen', 'perdo-mentem'];

/** A grid with a two-step chain in one cell and a cross-cell prerequisite. */
function chainGrid(): MagicGrid {
  return MagicGrid.from(
    gridContentFixture({
      v1Cells: V1,
      nodes: [
        { id: 'il-sense', cell: 'intellego-limen', tier: 1 },
        { id: 'il-count', cell: 'intellego-limen', tier: 2, prerequisites: ['il-sense'] },
        { id: 'rl-step', cell: 'rego-limen', tier: 2, prerequisites: ['il-sense'] },
        {
          id: 'rl-gate',
          cell: 'rego-limen',
          tier: 3,
          prerequisites: ['il-count', 'rl-step'],
        },
        // A deeper node with no prerequisites at all, for the tier control.
        { id: 'rl-deep', cell: 'rego-limen', tier: 4 },
      ],
    }),
  );
}

describe('grid addressing covers all seventy cells', () => {
  const grid = chainGrid();

  it('resolves every (techniqueId, formId) pair to a distinct cell', () => {
    const seen = new Set<number>();
    for (const [, techniqueBit] of FIXTURE_TECHNIQUES) {
      for (const [, formBit] of FIXTURE_FORMS) {
        const cellId = grid.cellAt(techniqueBit + 1, formBit + 1);
        expect(cellId).toBeGreaterThanOrEqual(1);
        expect(cellId).toBeLessThanOrEqual(GRID_CELL_COUNT);
        seen.add(cellId);
      }
    }
    expect(seen.size).toBe(GRID_TECHNIQUE_COUNT * GRID_FORM_COUNT);
    expect(seen.size).toBe(GRID_CELL_COUNT);
  });

  it('resolves every cell id, and reports the axes it came from', () => {
    for (let cellId = 1; cellId <= GRID_CELL_COUNT; cellId += 1) {
      const cell = grid.cell(cellId);
      expect(cell.cellId).toBe(cellId);
      expect(grid.cellAt(cell.techniqueId, cell.formId)).toBe(cellId);
    }
  });

  it('reports a cell outside the v1 subset as addressable but empty', () => {
    const creoIgnem = grid.cellByName('creo-ignem');
    expect(creoIgnem.v1).toBe(false);
    expect(creoIgnem.nodeIds).toEqual([]);
  });

  it('resolves a cell content never authored at all — addressing is total', () => {
    // Totality is a property of the 5 × 14 space, not of the data. A build whose
    // content omitted a cell record must still address its position, or every
    // caller needs a null check that the schema says it does not need.
    const sparse = MagicGrid.from(gridContentFixture({ omitCells: ['muto-vim'] }));
    const cellId = sparse.cellAt(
      // muto = bit 2, vim = bit 9.
      3,
      10,
    );
    const cell = sparse.cell(cellId);
    expect(cell.v1).toBe(false);
    expect(cell.nodeIds).toEqual([]);
    expect(cell.authored).toBe(false);
  });

  it('rejects an axis id that names no technique or form', () => {
    // Returning the null cell would be worse than throwing: the caller's next
    // question is "does the universe permit this cell", and cell 0 would answer
    // it with a RangeError from permits() one frame later, in a stack that no
    // longer mentions the bad axis id.
    expect(() => grid.cellAt(0, 1)).toThrow(RangeError);
    expect(() => grid.cellAt(GRID_TECHNIQUE_COUNT + 1, 1)).toThrow(RangeError);
    expect(() => grid.cellAt(1, GRID_FORM_COUNT + 1)).toThrow(RangeError);
  });

  it('rejects a cell id outside 1..70, including the reserved null', () => {
    expect(() => grid.cell(0)).toThrow(RangeError);
    expect(() => grid.cell(GRID_CELL_COUNT + 1)).toThrow(RangeError);
  });

  it('reports v1 membership from content, per cell', () => {
    expect(grid.cellByName('rego-limen').v1).toBe(true);
    expect(grid.cellByName('rego-terram').v1).toBe(false);
    expect(grid.v1CellIds()).toEqual(
      V1.map((name) => grid.cellByName(name).cellId).sort((a, b) => a - b),
    );
  });

  it('lists a cell’s nodes ascending, from the nodes themselves', () => {
    const cell = grid.cellByName('rego-limen');
    const ascending = [...cell.nodeIds].sort((a, b) => a - b);
    expect(cell.nodeIds).toEqual(ascending);
    expect(cell.nodeIds.map((id) => grid.nodeName(id)).sort()).toEqual([
      'rl-deep',
      'rl-gate',
      'rl-step',
    ]);
  });

  it('maps every node to the cell it was authored in', () => {
    const content = gridContentFixture({
      v1Cells: V1,
      nodes: [{ id: 'pm-unmake', cell: 'perdo-mentem' }],
    });
    const sparse = MagicGrid.from(content);
    expect(sparse.cellOf(fixtureNodeId(content, 'pm-unmake'))).toBe(
      sparse.cellByName('perdo-mentem').cellId,
    );
    expect(() => sparse.cellOf(99)).toThrow(RangeError);
  });

  it('rejects content whose node names a cell that does not exist', () => {
    // The loader rejects this too, but the grid is handed a registry by its
    // caller and cannot assume the caller loaded it. A node with no cell has no
    // dormancy answer, and a dormancy answer of "false by default" is a mage
    // casting a forbidden spell.
    expect(() =>
      MagicGrid.from(
        gridContentFixture({ nodes: [{ id: 'nowhere', cell: 'creo-elsewhere' }] }),
      ),
    ).toThrow(/creo-elsewhere/u);
  });

  it('rejects content whose prerequisite names no node', () => {
    expect(() =>
      MagicGrid.from(
        gridContentFixture({
          nodes: [{ id: 'rl-gate', cell: 'rego-limen', prerequisites: ['missing'] }],
        }),
      ),
    ).toThrow(/missing/u);
  });
});

describe('node prerequisite satisfaction', () => {
  const content = gridContentFixture({
    v1Cells: V1,
    nodes: [
      { id: 'il-sense', cell: 'intellego-limen', tier: 1 },
      { id: 'il-count', cell: 'intellego-limen', tier: 2, prerequisites: ['il-sense'] },
      { id: 'rl-step', cell: 'rego-limen', tier: 2, prerequisites: ['il-sense'] },
      { id: 'rl-gate', cell: 'rego-limen', tier: 3, prerequisites: ['il-count', 'rl-step'] },
      { id: 'rl-deep', cell: 'rego-limen', tier: 4 },
    ],
  });
  const grid = MagicGrid.from(content);
  const nodeId = (id: string): number => fixtureNodeId(content, id);

  it('is satisfied when the subject holds every prerequisite', () => {
    const held = heldNodes([nodeId('il-count'), nodeId('rl-step')]);
    const result = grid.prerequisiteStatus(nodeId('rl-gate'), held);
    expect(result.satisfied).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('names the prerequisite the subject is missing', () => {
    const held = heldNodes([nodeId('il-count')]);
    const result = grid.prerequisiteStatus(nodeId('rl-gate'), held);
    expect(result.satisfied).toBe(false);
    expect(result.missing).toEqual([nodeId('rl-step')]);
  });

  it('crosses cells without imposing a same-cell requirement', () => {
    // rl-step lives in rego-limen and depends on il-sense in intellego-limen.
    const held = heldNodes([nodeId('il-sense')]);
    const result = grid.prerequisiteStatus(nodeId('rl-step'), held);
    expect(result.satisfied).toBe(true);
    expect(grid.cellOf(nodeId('rl-step'))).not.toBe(grid.cellOf(nodeId('il-sense')));
  });

  it('never infers satisfaction from tier', () => {
    // The subject holds the deepest node in the cell — tier 4 — and still may
    // not research the tier-3 node, because prerequisites are a graph and tier
    // is a label on it. Inferring one from the other would let a mage skip the
    // whole chain by learning its end.
    const held = heldNodes([nodeId('rl-deep')]);
    const result = grid.prerequisiteStatus(nodeId('rl-gate'), held);
    expect(result.satisfied).toBe(false);
    expect(result.missing.length).toBe(2);
  });

  it('is satisfied vacuously for a node with no prerequisites', () => {
    const result = grid.prerequisiteStatus(nodeId('il-sense'), heldNodes([]));
    expect(result.satisfied).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('reports the prerequisites of a node in ascending id order', () => {
    const required = grid.prerequisitesOf(nodeId('rl-gate'));
    expect([...required].sort((a, b) => a - b)).toEqual([...required]);
    expect(required).toHaveLength(2);
  });
});

describe('the grid built from the shipped content set', () => {
  // Two assertions only, and both are about facts the loader itself enforces —
  // the 5 × 14 space and `rego-limen`'s membership (contracts.md §8). The v1
  // subset and the node graphs are being authored in this same change; a test
  // that asserted their contents would be a copy of the data files, and a copy
  // is what goes stale.
  const registry = loadContent(shippedContentSource());
  const grid = MagicGrid.from(registry);

  it('addresses all seventy cells', () => {
    for (let cellId = 1; cellId <= GRID_CELL_COUNT; cellId += 1) {
      expect(grid.cell(cellId).cellId).toBe(cellId);
    }
  });

  it('agrees with the registry about every cell id', () => {
    for (const cell of registry.cells) {
      const view = grid.cellByName(cell.record.id);
      expect(view.cellId).toBe(cell.contentId);
      expect(registry.cellAt(view.techniqueId, view.formId)).toBe(cell.contentId);
    }
  });

  it('agrees with the registry about which cell each node is in', () => {
    for (const node of registry.nodes) {
      expect(grid.cellOf(node.contentId)).toBe(registry.intern('cell', node.record.cell));
    }
  });

  it('has rego-limen in the v1 subset', () => {
    expect(grid.cellByName(REQUIRED_V1_CELL).v1).toBe(true);
  });

  it('gives a cell the same id on a second, independent load', () => {
    const second = MagicGrid.from(loadContent(shippedContentSource()));
    for (const cell of registry.cells) {
      expect(second.cellByName(cell.record.id).cellId).toBe(grid.cellByName(cell.record.id).cellId);
    }
  });
});
