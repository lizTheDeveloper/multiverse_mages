/*
 * Multiverse Mages — availability, dormancy, and what a dormant instance may
 * not do.
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
 * `magic-grid`, the two requirements that need a universe: *"Cell availability
 * is decided by the arbitration function alone"* and *"Dormancy in a forbidden
 * cell"*.
 *
 * The load-bearing test in this file is the last one. Everything else describes
 * what dormancy *does*; that one demonstrates that it is not *stored* — the
 * holdings are frozen, nothing is given the chance to write to them, and an
 * instance goes usable → dormant → usable because the ruleset argument changed
 * and for no other reason.
 */

import type { Edict, Ruleset } from '@mm/state';
import { EDICT_KIND } from '@mm/state';
import { describe, expect, it } from 'vitest';

import {
  KNOWLEDGE_USE,
  MagicGrid,
  dormancyRefusal,
  heldNodes,
  isCellAvailable,
  isDormant,
  isUsable,
  prerequisiteStatusFor,
  usableHolding,
} from '@mm/rules-magic';

import { fixtureNodeId, gridContentFixture } from './fixtures.js';

/** Technique and form bit positions, as `contracts.md` §2.1 fixes them. */
const BIT = {
  intellego: 1,
  perdo: 3,
  rego: 4,
  mentem: 7,
  terram: 8,
  limen: 12,
  nomen: 13,
} as const;

const ALL_TECHNIQUES = 0b11111;
const ALL_FORMS = 0b11_1111_1111_1111;

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

const content = gridContentFixture({
  v1Cells: ['perdo-mentem', 'perdo-nomen', 'perdo-terram', 'perdo-limen', 'rego-limen'],
  nodes: [
    { id: 'pm-unmake', cell: 'perdo-mentem', tier: 1 },
    { id: 'pm-erase', cell: 'perdo-mentem', tier: 2, prerequisites: ['pm-unmake'] },
    { id: 'rl-portal', cell: 'rego-limen', tier: 2, prerequisites: ['pm-unmake'] },
  ],
});
const grid = MagicGrid.from(content);
const nodeId = (id: string): number => fixtureNodeId(content, id);
const cellId = (name: string): number => grid.cellByName(name).cellId;

describe('cell availability is decided by the arbitration function alone', () => {
  // The four cases of `contracts.md` §1.1's precedence rule, against a v1 cell.

  it('is available when both axes are permitted and no edict names the cell', () => {
    expect(isCellAvailable(ruleset({}), cellId('perdo-mentem'))).toBe(true);
  });

  it('is available under a dispensation, while its siblings are not', () => {
    const forbidPerdo = ruleset({
      techniques: ALL_TECHNIQUES & ~(1 << BIT.perdo),
      edicts: [{ cellId: cellId('perdo-mentem'), kind: EDICT_KIND.dispensation }],
    });
    expect(isCellAvailable(forbidPerdo, cellId('perdo-mentem'))).toBe(true);
    for (const sibling of ['perdo-nomen', 'perdo-terram', 'perdo-limen']) {
      expect(isCellAvailable(forbidPerdo, cellId(sibling))).toBe(false);
    }
  });

  it('is unavailable under an interdiction, while its siblings stay available', () => {
    const interdicted = ruleset({
      edicts: [{ cellId: cellId('perdo-mentem'), kind: EDICT_KIND.interdiction }],
    });
    expect(isCellAvailable(interdicted, cellId('perdo-mentem'))).toBe(false);
    for (const sibling of ['perdo-nomen', 'perdo-terram', 'perdo-limen']) {
      expect(isCellAvailable(interdicted, cellId(sibling))).toBe(true);
    }
  });

  it('is unavailable when neither axis is permitted', () => {
    const neither = ruleset({
      techniques: ALL_TECHNIQUES & ~(1 << BIT.perdo),
      forms: ALL_FORMS & ~(1 << BIT.mentem),
    });
    expect(isCellAvailable(neither, cellId('perdo-mentem'))).toBe(false);
    // And when only one axis is missing, which is the case a technique-only
    // reading of the rule would get wrong.
    expect(
      isCellAvailable(ruleset({ forms: ALL_FORMS & ~(1 << BIT.mentem) }), cellId('perdo-mentem')),
    ).toBe(false);
  });

  it('rejects a cell id that names no cell rather than reporting it forbidden', () => {
    expect(() => isCellAvailable(ruleset({}), 0)).toThrow(RangeError);
  });
});

describe('dormancy in a forbidden cell', () => {
  const permitted = ruleset({});
  const interdicted = ruleset({
    edicts: [{ cellId: cellId('perdo-mentem'), kind: EDICT_KIND.interdiction }],
  });

  it('is exactly the negation of availability for the node’s cell', () => {
    expect(isDormant(grid, permitted, nodeId('pm-unmake'))).toBe(false);
    expect(isDormant(grid, interdicted, nodeId('pm-unmake'))).toBe(true);
    expect(isUsable(grid, interdicted, nodeId('pm-unmake'))).toBe(false);
    // A node in another cell is untouched by the edict.
    expect(isDormant(grid, interdicted, nodeId('rl-portal'))).toBe(false);
  });

  it('refuses every use of a dormant node, naming dormancy as the reason', () => {
    for (const use of Object.values(KNOWLEDGE_USE)) {
      const refusal = dormancyRefusal(grid, interdicted, nodeId('pm-unmake'), use);
      expect(refusal).toBeDefined();
      expect(refusal?.reason).toBe('dormancy');
      expect(refusal?.use).toBe(use);
      expect(refusal?.nodeId).toBe(nodeId('pm-unmake'));
      expect(refusal?.cellId).toBe(cellId('perdo-mentem'));
    }
  });

  it('covers casting, teaching, scribing, preparation, prerequisites, and effects', () => {
    // The enumeration itself is the requirement — a use that is missing from it
    // is a use nothing refuses. Spelled out rather than derived so that adding a
    // seventh use has to touch this assertion.
    expect(Object.keys(KNOWLEDGE_USE).sort()).toEqual([
      'cast',
      'effect',
      'prepare',
      'prerequisite',
      'scribe',
      'teach',
    ]);
  });

  it('refuses nothing while the cell is permitted', () => {
    for (const use of Object.values(KNOWLEDGE_USE)) {
      expect(dormancyRefusal(grid, permitted, nodeId('pm-unmake'), use)).toBeUndefined();
    }
  });

  it('leaves the node in existence — dormant is not destroyed', () => {
    // The instances are the subsystem's, not this function's: dormancy answers
    // a question and touches nothing. What this asserts is that the holding a
    // caller passed in is still reported as held while dormant, so a node with
    // one dormant instance has not left the universe.
    const held = heldNodes([nodeId('pm-unmake')]);
    expect(held.holds(nodeId('pm-unmake'))).toBe(true);
    expect(isDormant(grid, interdicted, nodeId('pm-unmake'))).toBe(true);
    expect(held.holds(nodeId('pm-unmake'))).toBe(true);
  });

  it('does not let a dormant instance satisfy a prerequisite', () => {
    // pm-erase and rl-portal both require pm-unmake. Interdicting perdo-mentem
    // makes the held instance unusable as a prerequisite in *both* cells —
    // including the permitted one, which is the case that stops a god from
    // routing research around their own interdiction.
    const held = heldNodes([nodeId('pm-unmake')]);
    expect(prerequisiteStatusFor(grid, permitted, nodeId('rl-portal'), held).satisfied).toBe(true);

    const blocked = prerequisiteStatusFor(grid, interdicted, nodeId('rl-portal'), held);
    expect(blocked.satisfied).toBe(false);
    expect(blocked.missing).toEqual([nodeId('pm-unmake')]);
    expect(blocked.dormant).toEqual([nodeId('pm-unmake')]);
  });

  it('distinguishes a prerequisite that is dormant from one that was never held', () => {
    const nothing = prerequisiteStatusFor(grid, permitted, nodeId('rl-portal'), heldNodes([]));
    expect(nothing.missing).toEqual([nodeId('pm-unmake')]);
    expect(nothing.dormant).toEqual([]);
  });

  it('filters a holding down to its usable members without copying state', () => {
    const held = heldNodes([nodeId('pm-unmake'), nodeId('rl-portal')]);
    const usable = usableHolding(grid, interdicted, held);
    expect(usable.holds(nodeId('pm-unmake'))).toBe(false);
    expect(usable.holds(nodeId('rl-portal'))).toBe(true);
    // The underlying holding is unchanged: the filter is a view, not a rewrite.
    expect(held.holds(nodeId('pm-unmake'))).toBe(true);
  });
});

describe('re-permitting an interdicted cell restores surviving instances', () => {
  it('needs no migration step — only the ruleset argument changes', () => {
    // The whole claim of "dormancy is derived, stored nowhere", as a test.
    //
    // `held` is frozen and is the same object in all three phases. No function
    // in this package is handed anything it could write dormancy into: if a
    // flag were being set on interdiction, restoring would need something to
    // clear it, and there is nowhere for that something to be called from.
    const held = Object.freeze(heldNodes([nodeId('pm-unmake'), nodeId('pm-erase')]));
    const surviving = [nodeId('pm-unmake'), nodeId('pm-erase')];

    const before = ruleset({});
    const during = ruleset({
      edicts: [{ cellId: cellId('perdo-mentem'), kind: EDICT_KIND.interdiction }],
    });
    // Revocation is the removal of the edict, which is `god-agency`'s action.
    // The restored ruleset is therefore literally the one from before.
    const after = ruleset({});

    for (const node of surviving) {
      expect(isUsable(grid, before, node)).toBe(true);
      expect(held.holds(node)).toBe(true);
    }

    for (const node of surviving) {
      expect(isUsable(grid, during, node)).toBe(false);
      // Survival: the interdiction did not destroy anything.
      expect(held.holds(node)).toBe(true);
    }

    for (const node of surviving) {
      expect(isUsable(grid, after, node)).toBe(true);
      expect(dormancyRefusal(grid, after, node, KNOWLEDGE_USE.cast)).toBeUndefined();
      expect(prerequisiteStatusFor(grid, after, nodeId('pm-erase'), held).satisfied).toBe(true);
    }
  });

  it('gives the same answer on repeated calls — nothing is memoized between them', () => {
    // A cache would pass every assertion above and fail this one, because the
    // first answer under `during` would be the answer forever.
    const node = nodeId('pm-unmake');
    const during = ruleset({
      edicts: [{ cellId: cellId('perdo-mentem'), kind: EDICT_KIND.interdiction }],
    });
    const permitted = ruleset({});
    const observed: boolean[] = [];
    for (const rules of [permitted, during, permitted, during, permitted]) {
      observed.push(isDormant(grid, rules, node));
    }
    expect(observed).toEqual([false, true, false, true, false]);
  });
});
