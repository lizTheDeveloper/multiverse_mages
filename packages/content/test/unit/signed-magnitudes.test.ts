/*
 * Multiverse Mages — which primitives may carry a cost, and which may not.
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
 * `node.schema.json` read `"minimum": 1` for as long as there was content, so
 * all 407 shipped effects were positive and **no node could express a cost**.
 * Every deep spell degenerated into a bonus. That is not a balance finding, it
 * is a vocabulary that has no word for the other half of a tradeoff, and it is
 * why wiring a rate primitive to node effects produced a pure output boost.
 *
 * Dropping the minimum is one line. The invariants that keep it sound are the
 * rest of this file, and they are asserted here rather than in the schema
 * because the sign rule is a *cross-file* fact — it depends on the stacking
 * rule the primitive registry declares, which `node.schema.json` cannot see.
 *
 * ## The rule
 *
 * A negative magnitude is permitted exactly when the primitive's declared
 * stacking is `additive-into-multiplier`. Those are the seven world-scale rate
 * multipliers, they fold through `(1 + Σ)`, and `@mm/primitives` floors that
 * fold at zero so a cost can stop a rate and can never reverse it.
 *
 * Every other rule is refused, and each refusal is a defect that would have
 * been silent:
 *
 * - **`presence`** (`portal`) — the magnitude carries no meaning at all, so a
 *   negative one still opens the portal while reading like a prohibition.
 * - **`multiplicative-on-remainder`** (`ward`, `concealment`) — the value is a
 *   prevented fraction. A negative one makes `applyWard` *amplify* damage with
 *   no bound, and there is no cap in that direction because a cap is a ceiling.
 * - **`max`** (`blink`, `knowledge-steal`) — `knowledge-steal` is an fp
 *   probability and `rollStackedProbability` compares `draw < value` against an
 *   unclamped stack, so a negative probability is silently always-false.
 * - **`additive`** and **`summed-then-single-ward`** (`direct-damage`,
 *   `area-denial`, `summon`, `lifespan`) — each needs a floor of its own that
 *   nothing here can supply: a negative `summon` has no count floor, and a
 *   negative `direct-damage` is healing, which is a design decision and not a
 *   sign convention.
 *
 * `lifespan` is the near miss worth naming: `effectiveLifespan` already floors
 * a curse at `MIN_EFFECTIVE_LIFESPAN_MONTHS` and its own comment says so. It is
 * still refused here, because enabling it is an author's decision about content
 * scale rather than a consequence of this one.
 *
 * ## Zero
 *
 * `"minimum": 1` also forbade zero, and dropping it would quietly permit an
 * effect that does nothing while reading as an authored intent. The loader
 * refuses it instead, because the interpreter behind these schemas implements
 * neither `not` nor `exclusiveMinimum`.
 */

import { describe, expect, it } from 'vitest';

import type { ContentDiagnostic } from '@mm/content';
import { ContentValidationError, loadContent, shippedContentSource, validateContent } from '@mm/content';

import { brokenSource, recordById } from './fixtures.js';

const registry = loadContent(shippedContentSource());

function diagnosticsOf(source: Parameters<typeof loadContent>[0]): readonly ContentDiagnostic[] {
  let thrown: unknown;
  try {
    loadContent(source);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ContentValidationError);
  expect(validateContent(source).registry).toBeUndefined();
  return (thrown as ContentValidationError).diagnostics;
}

/** The stacking rule the shipped registry declares for a primitive. */
function stackingOf(primitiveId: string): string {
  const found = registry.primitives.find((entry) => entry.record.id === primitiveId);
  if (found === undefined) throw new Error(`shipped content has no primitive "${primitiveId}"`);
  return found.record.stacking;
}

describe('shipped content can express a cost', () => {
  it('authors at least one negative magnitude, so the path is not theoretical', () => {
    const negatives = registry.nodes.flatMap((node) =>
      node.record.effects
        .filter((effect) => effect.magnitude < 0)
        .map((effect) => ({ node: node.record.id, primitive: effect.primitive, magnitude: effect.magnitude })),
    );
    expect(negatives.length).toBeGreaterThan(0);
  });

  it('gives The Nameless the teaching cost its gloss already argues for', () => {
    // "ruinous to explain to an heir, and the reason some archmages have no
    // biography" — the node was authored with the cost in prose and none in
    // data, because data could not hold it.
    const node = registry.nodes.find((entry) => entry.record.id === 'pn-the-nameless');
    expect(node).toBeDefined();
    const teach = node?.record.effects.find((effect) => effect.primitive === 'teach-rate');
    expect(teach).toBeDefined();
    expect(teach?.magnitude).toBeLessThan(0);
    expect(teach?.target).toBe('single');
  });

  it('puts every shipped negative on a primitive whose rule can hold one', () => {
    for (const node of registry.nodes) {
      for (const effect of node.record.effects) {
        if (effect.magnitude >= 0) continue;
        expect(
          stackingOf(effect.primitive),
          `${node.record.id} authors a negative ${effect.primitive}`,
        ).toBe('additive-into-multiplier');
      }
    }
  });

  it('never authors a zero magnitude', () => {
    for (const node of registry.nodes) {
      for (const effect of node.record.effects) {
        expect(effect.magnitude, `${node.record.id}/${effect.primitive}`).not.toBe(0);
      }
    }
  });
});

describe('the loader refuses a negative on a rule that cannot hold one', () => {
  it('accepts a negative on every additive-into-multiplier primitive', () => {
    for (const entry of registry.primitives) {
      if (entry.record.stacking !== 'additive-into-multiplier') continue;
      const source = brokenSource((documents) => {
        const node = recordById(documents, 'node.json', 'in-hear-the-name-spoken');
        node['effects'] = [
          { primitive: entry.record.id, magnitude: -128, target: 'self', durationTicks: 0 },
        ];
      });
      expect(() => loadContent(source), entry.record.id).not.toThrow();
    }
  });

  for (const [primitiveId, why] of [
    ['portal', 'presence carries no magnitude to negate'],
    ['ward', 'a negative prevented fraction amplifies damage without bound'],
    ['concealment', 'a negative probability of evading is not a probability'],
    ['knowledge-steal', 'max over a negative probability is silently always-false'],
    ['blink', 'a negative displacement is not a shorter one'],
    ['direct-damage', 'negative damage is healing, which is a design decision'],
    ['area-denial', 'a negative field has no floor of its own'],
    ['summon', 'un-summoning has no count floor'],
    ['lifespan', 'a curse is an author decision about content scale'],
  ] as const) {
    it(`refuses a negative ${primitiveId}: ${why}`, () => {
      const source = brokenSource((documents) => {
        const node = recordById(documents, 'node.json', 'in-hear-the-name-spoken');
        node['effects'] = [
          { primitive: primitiveId, magnitude: -128, target: 'self', durationTicks: 0 },
        ];
      });
      const diagnostics = diagnosticsOf(source);
      const found = diagnostics.filter(
        (diagnostic) =>
          diagnostic.code === 'content-invariant' && diagnostic.message.includes(primitiveId),
      );
      expect(found.length).toBeGreaterThan(0);
      expect(found[0]?.file).toBe('node.json');
      expect(found[0]?.pointer).toContain('magnitude');
    });
  }

  it('refuses a zero magnitude, which the schema minimum used to forbid', () => {
    const source = brokenSource((documents) => {
      const node = recordById(documents, 'node.json', 'in-hear-the-name-spoken');
      node['effects'] = [
        { primitive: 'research-rate', magnitude: 0, target: 'self', durationTicks: 0 },
      ];
    });
    const diagnostics = diagnosticsOf(source);
    expect(
      diagnostics.some(
        (diagnostic) => diagnostic.code === 'content-invariant' && diagnostic.message.includes('zero'),
      ),
    ).toBe(true);
  });

  it('reports every offending effect, not merely the first', () => {
    const source = brokenSource((documents) => {
      const node = recordById(documents, 'node.json', 'in-hear-the-name-spoken');
      node['effects'] = [
        { primitive: 'ward', magnitude: -128, target: 'self', durationTicks: 0 },
        { primitive: 'blink', magnitude: -128, target: 'self', durationTicks: 0 },
        { primitive: 'research-rate', magnitude: 0, target: 'self', durationTicks: 0 },
      ];
    });
    const diagnostics = diagnosticsOf(source).filter(
      (diagnostic) => diagnostic.code === 'content-invariant' && diagnostic.file === 'node.json',
    );
    expect(diagnostics.length).toBeGreaterThanOrEqual(3);
  });
});
