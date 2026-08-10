/*
 * Multiverse Mages — the validation CLI reports every violation in a run.
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
 * A validator that stops at the first error is a validator people route around:
 * fixing a content set becomes an interactive game, so it stops being run before
 * committing and starts being discovered in CI. These tests seed *k* independent
 * violations and assert all *k* are reported in one run, with file and pointer.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTENT_FILES, runValidation, validateContent } from '@mm/content';
import type { CliOutput, ContentFileName } from '@mm/content';

import { recordById, shippedDocuments, sourceOf } from './fixtures.js';

/** Collects CLI output as lines instead of writing to the process streams. */
function capture(): CliOutput & { readonly lines: string[]; readonly errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    out: (line) => lines.push(line),
    err: (line) => errors.push(line),
  };
}

/**
 * Six independent defects, each in a different content file or a different
 * check, so that no one of them could mask another.
 */
const SEEDED_VIOLATIONS = [
  'unknown-reference', // a prerequisite that does not exist
  'inverted-tier', // a prerequisite deeper than the node it gates
  'prerequisite-cycle', // a two-node ring
  'edict-conflict', // a cell carrying both edict kinds
  'node-outside-v1', // a node authored in an unflagged cell
  'species-invariant', // a species that matures after it dies
] as const;

function sixViolationDocuments(): Record<ContentFileName, unknown> {
  const documents = shippedDocuments();

  // 1. unknown reference
  recordById(documents, 'node.json', 'rl-step-across')['prerequisites'] = ['rl-nonexistent'];

  // 2. inverted tier: a tier-3 node gated behind a tier-4 one
  recordById(documents, 'node.json', 'im-follow-the-thought')['tier'] = 4;

  // 3. cycle, at equal tiers so it is unambiguously a cycle diagnostic
  recordById(documents, 'node.json', 'rm-hold-the-attention')['prerequisites'] = [
    'rm-the-patient-lesson',
  ];
  recordById(documents, 'node.json', 'rm-the-patient-lesson')['tier'] = 1;

  // 4. a cell carrying both an interdiction and a dispensation
  recordById(documents, 'cell.json', 'perdo-mentem')['edicts'] = ['dispensation', 'interdiction'];

  // 5. a node authored outside the v1 subset
  const strayNode = recordById(documents, 'node.json', 'pt-crumble');
  strayNode['cell'] = 'muto-aquam';
  recordById(documents, 'cell.json', 'muto-aquam')['nodes'] = ['pt-crumble'];
  const formerCell = recordById(documents, 'cell.json', 'perdo-terram');
  formerCell['nodes'] = (formerCell['nodes'] as string[]).filter((id) => id !== 'pt-crumble');

  // 6. a species that matures after it dies
  recordById(documents, 'species.json', 'orc')['maturityMonths'] = 720;

  return documents;
}

describe('validation reports every violation in a run', () => {
  it('reports all six seeded violations, not the first', () => {
    const result = validateContent(sourceOf(sixViolationDocuments()));
    const codes = result.diagnostics.map((d) => d.code).sort();
    expect(codes).toEqual([...SEEDED_VIOLATIONS].sort());
    expect(result.registry).toBeUndefined();
  });

  it('gives every diagnostic a file path and a JSON pointer', () => {
    const result = validateContent(sourceOf(sixViolationDocuments()));
    for (const diagnostic of result.diagnostics) {
      expect(CONTENT_FILES).toContain(diagnostic.file);
      expect(diagnostic.pointer).toMatch(/^(\/.*)?$/u);
      expect(diagnostic.message.length).toBeGreaterThan(0);
    }
    // The three that point at a specific record point at a specific record.
    const pointers = Object.fromEntries(result.diagnostics.map((d) => [d.code, d.pointer]));
    expect(pointers['unknown-reference']).toMatch(/^\/\d+\/prerequisites\/0$/u);
    expect(pointers['edict-conflict']).toMatch(/^\/\d+\/edicts$/u);
    expect(pointers['species-invariant']).toMatch(/^\/\d+\/maturityMonths$/u);
  });

  it('reports the same violations in the same order on a second run', () => {
    const first = validateContent(sourceOf(sixViolationDocuments())).diagnostics;
    const second = validateContent(sourceOf(sixViolationDocuments())).diagnostics;
    expect(second).toEqual(first);
  });

  it('exits non-zero and prints all six through the CLI', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mm-content-'));
    const documents = sixViolationDocuments();
    for (const fileName of CONTENT_FILES) {
      writeFileSync(join(directory, fileName), JSON.stringify(documents[fileName], null, 2));
    }

    const output = capture();
    const code = runValidation([directory], output);

    expect(code).toBe(1);
    const report = output.errors.join('\n');
    for (const violation of SEEDED_VIOLATIONS) {
      expect(report).toContain(`[${violation}]`);
    }
    expect(report).toContain('FAILED with 6 violation(s)');
    expect(report).toContain(directory);
    expect(output.lines).toEqual([]);
  });

  it('exits zero and reports the counts for the shipped content set', () => {
    const output = capture();
    const code = runValidation([], output);

    expect(code).toBe(0);
    expect(output.errors).toEqual([]);
    expect(output.lines.join('\n')).toContain(
      'OK — 5 techniques, 14 forms, 70 cells (12 flagged v1), 50 nodes, 6 species, ' +
        '3 traditions, 16 primitives',
    );
    expect(output.lines.join('\n')).toMatch(/contentRevision [0-9a-f]{32}/u);
  });
});
