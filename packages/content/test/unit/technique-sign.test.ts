/*
 * Multiverse Mages — the sign of a working follows from its technique.
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
 * `docs/design/substrate.md` §2 makes the five techniques five operations on
 * one conserved quantity — Creo adds, Perdo removes, Muto and Rego conserve,
 * Intellego reads. This file is the §8 test that document set for itself:
 *
 * > *"an elegant substrate adopted in prose and ignored in code is exactly what
 * > `check:consumption` exists to catch, one level up. The test of this document
 * > is whether the sign rule and the conservation invariants end up in
 * > `load.ts` as diagnostics."*
 *
 * The sign half is now in `load.ts`. The conservation half is not, and is not
 * claimed here.
 */

import { describe, expect, it } from 'vitest';

import { ContentValidationError, loadContent, validateContent } from '@mm/content';

import { brokenSource, recordById, recordsOf } from './fixtures.js';

/** The first node of a cell on the named technique, as a loose record. */
function nodeOfTechnique(
  documents: Parameters<typeof recordsOf>[0],
  technique: string,
): Record<string, unknown> {
  const cells = recordsOf(documents, 'cell.json');
  const cellIds = new Set(
    cells.filter((cell) => cell['technique'] === technique).map((cell) => cell['id']),
  );
  const node = recordsOf(documents, 'node.json').find((entry) => cellIds.has(entry['cell']));
  if (node === undefined) throw new Error(`fixture found no ${technique} node`);
  return node;
}

describe('the sign of a working follows from its technique', () => {
  it('rejects a Perdo working that adds to a world-scale flow', () => {
    const source = brokenSource((documents) => {
      const node = nodeOfTechnique(documents, 'perdo');
      // `resource-yield` is world scale. A Perdo node adding to it is the claim
      // that destruction creates.
      node['effects'] = [
        { primitive: 'resource-yield', magnitude: 256, target: 'universe', durationTicks: 0 },
      ];
    });
    expect(() => loadContent(source)).toThrow(ContentValidationError);
    const { diagnostics } = validateContent(source);
    expect(diagnostics.some((d) => d.code === 'technique-sign')).toBe(true);
    expect(diagnostics.map((d) => d.message).join('\n')).toContain('Perdo');
  });

  it('rejects a Creo working that subtracts from a world-scale flow', () => {
    const source = brokenSource((documents) => {
      const node = nodeOfTechnique(documents, 'creo');
      node['effects'] = [
        { primitive: 'resource-yield', magnitude: -256, target: 'universe', durationTicks: 0 },
      ];
    });
    expect(() => loadContent(source)).toThrow(ContentValidationError);
    const { diagnostics } = validateContent(source);
    expect(diagnostics.some((d) => d.code === 'technique-sign')).toBe(true);
    expect(diagnostics.map((d) => d.message).join('\n')).toContain('Creo');
  });

  it('permits a Perdo working that subtracts, which is the whole point', () => {
    // The positive control. Without it the two refusals above could both be
    // satisfied by a rule that rejects every Perdo world-scale effect, which
    // would forbid the one thing signed magnitudes exist to allow.
    const source = brokenSource((documents) => {
      const node = nodeOfTechnique(documents, 'perdo');
      node['effects'] = [
        { primitive: 'resource-yield', magnitude: -256, target: 'universe', durationTicks: 0 },
      ];
    });
    expect(() => loadContent(source)).not.toThrow();
  });

  it('permits a Perdo working that adds to an ENGAGEMENT primitive', () => {
    // The refutation that produced the rule's shape, pinned so it cannot be
    // tightened back. 18 shipped Perdo effects are positive and every one is an
    // engagement primitive: unmaking a scent trail produces concealment, and
    // the concealment is positive because it is what the unmaking achieved.
    // A rule that bound on scale-agnostic sign would delete all of them.
    const source = brokenSource((documents) => {
      const node = nodeOfTechnique(documents, 'perdo');
      node['effects'] = [
        { primitive: 'concealment', magnitude: 256, target: 'self', durationTicks: 0 },
      ];
    });
    expect(() => loadContent(source)).not.toThrow();
  });

  it('leaves Intellego unconstrained, because perception is Maxwell’s demon', () => {
    // 19 shipped Intellego nodes carry positive `resource-yield` — *"know how
    // many, of what ages, and which of them will not see the winter"*. None of
    // them creates food; they are information reducing waste in a process that
    // was already running, so the same labour yields more. Extracting more
    // useful work from an existing flow is not adding to it.
    const source = brokenSource((documents) => {
      const node = nodeOfTechnique(documents, 'intellego');
      node['effects'] = [
        { primitive: 'resource-yield', magnitude: 256, target: 'universe', durationTicks: 0 },
      ];
    });
    expect(() => loadContent(source)).not.toThrow();
  });

  it('holds over the shipped content set with zero exceptions', () => {
    // **The rule was obeyed before it existed, and this is the assertion that
    // says so.** Creo, Intellego, Muto and Rego carry 220 world-scale effects
    // between them and every one is positive; Perdo carries exactly one, and it
    // is negative. Nothing enforced that — the authors were following the
    // cosmology before it was written down.
    const registry = loadContent(brokenSource(() => {}));
    const cellById = new Map(registry.cells.map((entry) => [entry.record.id, entry.record]));
    const primitiveById = new Map(registry.primitives.map((e) => [e.record.id, e.record]));

    let perdoWorldEffects = 0;
    for (const { record: node } of registry.nodes) {
      const technique = cellById.get(node.cell)?.technique;
      for (const effect of node.effects) {
        if (primitiveById.get(effect.primitive)?.scale !== 'world') continue;
        if (technique === 'perdo') {
          perdoWorldEffects += 1;
          expect(effect.magnitude, `${node.id} is Perdo and adds to ${effect.primitive}`).toBeLessThan(0);
        }
        if (technique === 'creo') {
          expect(effect.magnitude, `${node.id} is Creo and subtracts from ${effect.primitive}`).toBeGreaterThan(0);
        }
      }
    }
    // Not vacuous: there is a Perdo world-scale effect to have checked. Before
    // signed magnitudes there was none, because every magnitude had to be
    // positive and a positive Perdo world effect is incoherent — so authors
    // never wrote one at all.
    expect(perdoWorldEffects).toBeGreaterThan(0);
  });
});
