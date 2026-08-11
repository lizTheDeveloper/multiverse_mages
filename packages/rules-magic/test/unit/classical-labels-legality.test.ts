/*
 * Multiverse Mages — classical labels are display-only, proven from behaviour.
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
 * `magic-grid`, *"Classical labels are display-only"*, the first of its two
 * scenarios: **WHEN** two cells with identical techniques, forms, and edict
 * status differ only in their `classicalLabels` **THEN** `permits` returns the
 * same result for both.
 *
 * The second scenario — no read of `classicalLabels` anywhere in the rules path
 * — is proven by the source scan in `rules-path-conformance.test.ts`. A scan is
 * the broader guarantee of the two, but it is a guarantee about *text*: it would
 * still pass if a label reached a decision through a value threaded in from
 * `@mm/content` under another name. This file closes that from the behaviour
 * side, by asking the arbitration question of the shipped grid twice — once with
 * the authored labels, once with every cell's label status inverted — and
 * requiring the same answer.
 *
 * Inverting rather than clearing is deliberate. Clearing the labels would leave
 * a content set in which no cell is labelled at all, so an implementation that
 * keyed on "has any label" would agree with itself for the uninteresting reason
 * that it saw the same empty list both times.
 *
 * "Identical techniques, forms, and edict status" is read as *status*, not as
 * identity: no two distinct cells can share both axes, so each cell is asked
 * about its own axes and its own edict, and the answer is required to depend on
 * the case alone.
 */

import { loadContent, shippedContentSource } from '@mm/content';
import type { Edict, Ruleset } from '@mm/state';
import { EDICT_KIND } from '@mm/state';
import { describe, expect, it } from 'vitest';

import type { GridContent } from '@mm/rules-magic';
import { MagicGrid, cellAxes, isCellAvailable, isDormant } from '@mm/rules-magic';

const ALL_TECHNIQUES = 0b11111;
const ALL_FORMS = 0b11_1111_1111_1111;

const registry = loadContent(shippedContentSource());
const authored = MagicGrid.from(registry);

/** The shipped content with every cell's label status flipped, and nothing else. */
const inverted: GridContent = {
  techniques: registry.techniques,
  forms: registry.forms,
  cells: registry.cells.map((entry) => ({
    contentId: entry.contentId,
    record: {
      ...entry.record,
      classicalLabels: entry.record.classicalLabels.length > 0 ? [] : ['fixture-label'],
    },
  })),
  nodes: registry.nodes,
};
const relabelled = MagicGrid.from(inverted);

function ruleset(options: {
  techniques?: number;
  forms?: number;
  edicts?: readonly Edict[];
}): Ruleset {
  return {
    permittedTechniques: options.techniques ?? ALL_TECHNIQUES,
    permittedForms: options.forms ?? ALL_FORMS,
    edicts: options.edicts ?? [],
  };
}

/** Every cell id the shipped content addresses. */
const CELL_IDS = registry.cells.map((entry) => entry.contentId);

/** One of the four `contracts.md` §1.1 cases, posed against a cell's own axes. */
interface ArbitrationCase {
  readonly name: string;
  readonly expected: boolean;
  readonly rulesetFor: (cellId: number) => Ruleset;
}

const CASES: readonly ArbitrationCase[] = [
  {
    name: 'both axes permitted, no edict',
    expected: true,
    rulesetFor: () => ruleset({}),
  },
  {
    name: 'technique forbidden, dispensation on the cell',
    expected: true,
    rulesetFor: (cellId) =>
      ruleset({
        techniques: ALL_TECHNIQUES & ~(1 << cellAxes(cellId).techniqueBit),
        edicts: [{ cellId, kind: EDICT_KIND.dispensation }],
      }),
  },
  {
    name: 'both axes permitted, interdiction on the cell',
    expected: false,
    rulesetFor: (cellId) => ruleset({ edicts: [{ cellId, kind: EDICT_KIND.interdiction }] }),
  },
  {
    name: 'neither axis permitted, no edict',
    expected: false,
    rulesetFor: (cellId) => {
      const { techniqueBit, formBit } = cellAxes(cellId);
      return ruleset({
        techniques: ALL_TECHNIQUES & ~(1 << techniqueBit),
        forms: ALL_FORMS & ~(1 << formBit),
      });
    },
  },
];

describe('labels do not affect legality', () => {
  it('has labelled and unlabelled cells to compare, so the comparison is not vacuous', () => {
    const labelled = registry.cells.filter((entry) => entry.record.classicalLabels.length > 0);
    const unlabelled = registry.cells.filter((entry) => entry.record.classicalLabels.length === 0);
    expect(labelled.length).toBeGreaterThan(0);
    expect(unlabelled.length).toBeGreaterThan(0);

    // And the inversion really inverted: no cell kept its label status.
    for (const entry of inverted.cells) {
      const before = registry.cells.find((cell) => cell.contentId === entry.contentId);
      expect(entry.record.classicalLabels.length > 0).toBe(
        (before?.record.classicalLabels.length ?? 0) === 0,
      );
    }
  });

  for (const arbitration of CASES) {
    it(`answers ${arbitration.name} the same for every cell, labelled or not`, () => {
      for (const cellId of CELL_IDS) {
        expect(isCellAvailable(arbitration.rulesetFor(cellId), cellId)).toBe(arbitration.expected);
      }
    });
  }

  it('gives the same dormancy verdict for every shipped node under inverted labels', () => {
    // Dormancy is the grid-aware legality question — it is handed the grid, and
    // so it is the place a label could reach a decision if one ever did.
    const permissive = ruleset({});
    for (const node of registry.nodes) {
      const cellId = authored.cellOf(node.contentId);
      const interdicted = ruleset({ edicts: [{ cellId, kind: EDICT_KIND.interdiction }] });

      expect(isDormant(relabelled, permissive, node.contentId)).toBe(
        isDormant(authored, permissive, node.contentId),
      );
      expect(isDormant(relabelled, interdicted, node.contentId)).toBe(
        isDormant(authored, interdicted, node.contentId),
      );

      // Non-vacuity: the two rulesets genuinely disagree, so the equalities
      // above are not comparing one constant against itself.
      expect(isDormant(authored, permissive, node.contentId)).toBe(false);
      expect(isDormant(authored, interdicted, node.contentId)).toBe(true);
    }
  });
});
