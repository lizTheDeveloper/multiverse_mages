/*
 * Multiverse Mages — the loader reports every violation, not merely the first.
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
 * This file exists to hold one release claim up to its own disproof condition.
 *
 * `docs/design/release-plan.md` states for 0.2.0: *"No content record is ever
 * silently skipped. Every schema violation fails the load and names its file
 * path and JSON pointer"* — and names what would disprove it: **"a fixture
 * seeded with k violations where the validator reports fewer than k."**
 *
 * Every other test in this package seeds exactly one violation, which
 * establishes that each rule fires but says nothing about `k`. A loader that
 * threw on the first problem would pass all of them, and would still be the
 * thing the claim denies: an author fixing a content file one error per run,
 * for as many runs as they have mistakes.
 *
 * That is not a hypothetical failure mode, it is the default one. Collecting
 * diagnostics rather than throwing at the first is a deliberate choice in
 * `load.ts`, and a deliberate choice with no test is a choice the next
 * refactor gets to reverse for free.
 */

import { describe, expect, it } from 'vitest';

import { ContentValidationError, loadContent, validateContent } from '@mm/content';
import type { ContentDiagnostic } from '@mm/content';

import { brokenSource, recordById, recordsOf } from './fixtures.js';

function diagnosticsOf(source: Parameters<typeof loadContent>[0]): readonly ContentDiagnostic[] {
  let thrown: unknown;
  try {
    loadContent(source);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ContentValidationError);
  // Whatever else is true, no partially populated registry escapes.
  expect(validateContent(source).registry).toBeUndefined();
  return (thrown as ContentValidationError).diagnostics;
}

describe('k seeded violations produce k reports', () => {
  it('reports every one of five schema violations in one pass', () => {
    // Five *independent* records, each broken a different way, so no single
    // diagnostic could plausibly be describing two of them at once.
    const broken = [
      'rl-open-the-portal',
      'rl-widen-the-way',
      'rl-hold-the-way',
      'rl-close-the-way',
      'rl-seal-the-breach',
    ];

    const diagnostics = diagnosticsOf(
      brokenSource((documents) => {
        const nodes = recordsOf(documents, 'node.json');
        const ids = nodes
          .map((node) => (node as { id?: unknown }).id)
          .filter((id): id is string => typeof id === 'string');
        // Use whichever five node ids actually ship, so this test does not
        // decay into a no-op if the v1 content is re-authored.
        const targets = broken.filter((id) => ids.includes(id));
        const chosen = (targets.length >= 5 ? targets : ids).slice(0, 5);
        expect(chosen).toHaveLength(5);

        for (const id of chosen) {
          delete (recordById(documents, 'node.json', id) as Record<string, unknown>)[
            'researchCost'
          ];
        }
      }),
    );

    const schemaFailures = diagnostics.filter((d) => d.code === 'schema');
    expect(schemaFailures).toHaveLength(5);

    // Each names its own record and its own pointer — five reports that all
    // said "a node is invalid" would satisfy a count and help nobody.
    const pointers = new Set(schemaFailures.map((d) => d.pointer));
    expect(pointers.size).toBe(5);
    for (const failure of schemaFailures) {
      expect(failure.file).toBe('node.json');
      expect(failure.message).toContain('researchCost');
      expect(failure.pointer).toMatch(/^\/\d+$/u);
    }
  });

  it('reports violations of different kinds together, rather than stopping at the first kind', () => {
    // A loader that ran its checks in phases and bailed after the first failing
    // phase would pass the test above and fail this one. Two different kinds,
    // in two different files, must both survive to the report.
    const diagnostics = diagnosticsOf(
      brokenSource((documents) => {
        const node = recordById(documents, 'node.json', String(
          (recordsOf(documents, 'node.json')[0] as { id: string }).id,
        ));
        delete (node as Record<string, unknown>)['researchCost'];

        const species = recordsOf(documents, 'species.json')[0] as Record<string, unknown>;
        delete species['id'];
      }),
    );

    const files = new Set(diagnostics.map((d) => d.file));
    expect(files.has('node.json')).toBe(true);
    expect(files.has('species.json')).toBe(true);
    expect(diagnostics.length).toBeGreaterThanOrEqual(2);
  });

  it('is not vacuous: the same fixture with nothing broken loads clean', () => {
    // The control. Without it, a `brokenSource` helper that silently failed to
    // apply its mutation would make both tests above pass for the wrong reason.
    expect(() => loadContent(brokenSource(() => undefined))).not.toThrow();
  });
});
