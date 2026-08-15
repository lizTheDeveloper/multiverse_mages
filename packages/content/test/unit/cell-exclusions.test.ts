/*
 * Multiverse Mages — anti-requisites are authored on cells, and validated there.
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
 * `vision.md` §4b decides the rule and `vision.md` §13 left the content shape
 * open: *"whether exclusion is authored on nodes, on cells, or on a named school
 * region is undecided."* It is cells, because that is how §4b speaks — *"if you
 * use light magic you can't also use dark magic"* is a claim about bodies of
 * magic, not about individual workings — and because no *school* entity exists
 * anywhere in `content` or `state`, so the third option invents a concept the
 * codebase has never had.
 *
 * §4b's rule carries its own validation, and this file is where it is enforced:
 *
 * > *"Every exclusion carries its **reason**, and symmetry follows from the
 * > reason rather than being asserted alongside it — an exclusion whose reason
 * > does not run both ways is not yet an exclusion."*
 *
 * So a one-sided exclusion is a **hard load failure**, not a warning. The
 * alternative — inferring the reverse edge — would silently author content
 * nobody wrote, and `contracts.md` §2 rejects that shape everywhere else.
 *
 * The `intellego` guard is §4b's other named constraint: *"Intellego is the
 * grid's perception trunk, so excluding it costs a mage two-thirds of the grid
 * rather than a school, and it is therefore not a candidate."*
 */

import { describe, expect, it } from 'vitest';

import { ContentValidationError, loadContent, validateContent } from '@mm/content';
import type { ContentDiagnostic } from '@mm/content';

import { brokenSource, recordById } from './fixtures.js';

function expectHardFail(source: Parameters<typeof loadContent>[0]): readonly ContentDiagnostic[] {
  expect(() => loadContent(source)).toThrow(ContentValidationError);
  const result = validateContent(source);
  expect(result.registry).toBeUndefined();
  expect(result.diagnostics.length).toBeGreaterThan(0);
  return result.diagnostics;
}

describe('exclusions are authored on cells', () => {
  it('accepts a symmetric, reason-bearing pair', () => {
    const source = brokenSource((documents) => {
      recordById(documents, 'cell.json', 'creo-ignem')['excludes'] = [
        {
          cell: 'creo-umbra',
          reason: 'A light thrown by nothing and a shadow cast by nothing are one claim about causation, pointed opposite ways.',
          resolution: 'destructive',
        },
      ];
      recordById(documents, 'cell.json', 'creo-umbra')['excludes'] = [
        {
          cell: 'creo-ignem',
          reason: 'A light thrown by nothing and a shadow cast by nothing are one claim about causation, pointed opposite ways.',
          resolution: 'destructive',
        },
      ];
    });
    expect(() => loadContent(source)).not.toThrow();
  });

  it('rejects a one-sided exclusion, naming both cells', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        recordById(documents, 'cell.json', 'creo-ignem')['excludes'] = [
          { cell: 'creo-umbra', reason: 'one-sided on purpose', resolution: 'refused' },
        ];
      }),
    );
    const message = diagnostics.map((d) => d.message).join('\n');
    expect(message).toContain('creo-ignem');
    expect(message).toContain('creo-umbra');
    expect(diagnostics.some((d) => d.code === 'asymmetric-exclusion')).toBe(true);
  });

  it('rejects a pair whose two halves disagree about the resolution', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        recordById(documents, 'cell.json', 'creo-ignem')['excludes'] = [
          { cell: 'creo-umbra', reason: 'same reason', resolution: 'destructive' },
        ];
        recordById(documents, 'cell.json', 'creo-umbra')['excludes'] = [
          { cell: 'creo-ignem', reason: 'same reason', resolution: 'refused' },
        ];
      }),
    );
    expect(diagnostics.some((d) => d.code === 'asymmetric-exclusion')).toBe(true);
  });

  it('rejects a cell excluding itself', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        recordById(documents, 'cell.json', 'creo-ignem')['excludes'] = [
          { cell: 'creo-ignem', reason: 'nonsense', resolution: 'refused' },
        ];
      }),
    );
    expect(diagnostics.some((d) => d.code === 'self-exclusion')).toBe(true);
  });

  it('rejects an exclusion naming a cell that does not exist', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        recordById(documents, 'cell.json', 'creo-ignem')['excludes'] = [
          { cell: 'creo-nonesuch', reason: 'unknown', resolution: 'refused' },
        ];
      }),
    );
    expect(diagnostics.some((d) => d.code === 'unknown-reference')).toBe(true);
  });

  it('refuses to exclude the perception trunk, because §4b says it is not a candidate', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        recordById(documents, 'cell.json', 'creo-ignem')['excludes'] = [
          { cell: 'intellego-ignem', reason: 'costs two-thirds of the grid', resolution: 'refused' },
        ];
        recordById(documents, 'cell.json', 'intellego-ignem')['excludes'] = [
          { cell: 'creo-ignem', reason: 'costs two-thirds of the grid', resolution: 'refused' },
        ];
      }),
    );
    expect(diagnostics.some((d) => d.code === 'intellego-exclusion')).toBe(true);
  });

  it('ships exactly one pair, and it is symmetric', () => {
    // **Authoring a pair here was forced, and the constraint that forced it is a
    // good one.** The plan was to ship the machinery with zero pairs so that
    // this change moved no baseline and the pairs arrived with the content that
    // needs them. `schema-constraint-liveness` refused: it proves every schema
    // constraint by finding shipped content the constraint was applied to,
    // mutating it, and asserting the load fails *for that reason*. A schema
    // nothing instantiates cannot be proven live, and an unproven constraint is
    // exactly the decoration that file exists to catch.
    //
    // So the smallest real pair ships with the machinery: `vision.md` §4b's own
    // example, which is also the one `content/deep-magic` authors nodes for.
    const registry = loadContent(brokenSource(() => {}));
    const withExclusions = registry.cells
      .filter((entry) => (entry.record.excludes ?? []).length > 0)
      .map((entry) => entry.record.id)
      .sort();
    expect(withExclusions).toEqual(['creo-ignem', 'creo-umbra']);

    const light = registry.cells.find((entry) => entry.record.id === 'creo-ignem')?.record;
    const shadow = registry.cells.find((entry) => entry.record.id === 'creo-umbra')?.record;
    expect(light?.excludes?.[0]?.cell).toBe('creo-umbra');
    expect(shadow?.excludes?.[0]?.cell).toBe('creo-ignem');
    // The two halves agree on both fields the loader checks, which is what
    // makes this a pair rather than two edges that happen to point at each
    // other.
    expect(light?.excludes?.[0]?.reason).toBe(shadow?.excludes?.[0]?.reason);
    expect(light?.excludes?.[0]?.resolution).toBe(shadow?.excludes?.[0]?.resolution);
    expect(light?.excludes?.[0]?.resolution).toBe('destructive');
  });
});
