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
 *
 * `v1-subset` appears twice and is not a seventh defect. Now that all seventy
 * cells are enabled, the only way to construct defect 5 — a playable node gated
 * behind content the release does not enable — is to withhold a cell's flag, and
 * withholding one is itself two `v1-subset` diagnostics: the count is no longer
 * exact and the subset is no longer a full rectangle. They are *consequences* of
 * expressing defect 5, listed here because this fixture's whole claim is that the
 * validator reports everything it finds in one run rather than the first thing,
 * and a fixture that quietly dropped two would be asserting the weaker property.
 */
const SEEDED_VIOLATIONS = [
  'unknown-reference', // a prerequisite that does not exist
  'inverted-tier', // a prerequisite deeper than the node it gates
  'prerequisite-cycle', // a two-node ring
  'edict-conflict', // a cell carrying both edict kinds
  'v1-unreachable-prerequisite', // a playable node gated behind disabled content
  'v1-subset', // and the two consequences of disabling a cell to build it:
  'v1-subset', // the count is short, and the subset is no longer a rectangle
  'species-invariant', // a species that matures after it dies
] as const;

function sixViolationDocuments(): Record<ContentFileName, unknown> {
  const documents = shippedDocuments();

  // 1. unknown reference
  recordById(documents, 'node.json', 'rl-step-across')['prerequisites'] = ['rl-nonexistent'];

  // 2. inverted tier: a tier-2 node gated behind a tier-4 one.
  //    Built from fresh records rather than by deepening a shipped node. Every cell of
  //    the grid is pre-authored now, so mutating a shipped node inverts it against every
  //    spell that gates on it -- a count that changes whenever anyone writes content,
  //    which would make this fixture's "exactly six" assertion quietly wrong.
  const donor = recordById(documents, 'node.json', 'rt-set-the-stone');
  const deep = { ...donor, id: 'mau-fixture-deep', cell: 'muto-auram', tier: 4, prerequisites: [] };
  const shallow = {
    ...donor,
    id: 'mau-fixture-shallow',
    cell: 'muto-auram',
    tier: 2,
    prerequisites: ['mau-fixture-deep'],
  };
  (documents['node.json'] as unknown[]).push(deep, shallow);
  const invertedCell = recordById(documents, 'cell.json', 'muto-auram');
  invertedCell['nodes'] = [
    ...(invertedCell['nodes'] as string[]),
    'mau-fixture-deep',
    'mau-fixture-shallow',
  ];

  // 3. cycle, at equal tiers so it is unambiguously a cycle diagnostic
  recordById(documents, 'node.json', 'rm-hold-the-attention')['prerequisites'] = [
    'rm-the-patient-lesson',
  ];
  recordById(documents, 'node.json', 'rm-the-patient-lesson')['tier'] = 1;

  // 4. a cell carrying both an interdiction and a dispensation
  recordById(documents, 'cell.json', 'perdo-mentem')['edicts'] = ['dispensation', 'interdiction'];

  // 5. a playable node gated behind a cell the release does not enable, so it can
  //    never be reached. Authoring outside v1 is fine; depending on it from v1 is not.
  const stranded = { ...recordById(documents, 'node.json', 'pt-crumble'), id: 'maq-stranded', cell: 'muto-aquam' };
  (documents['node.json'] as unknown[]).push(stranded);
  const strandedCell = recordById(documents, 'cell.json', 'muto-aquam');
  strandedCell['nodes'] = [...(strandedCell['nodes'] as string[]), 'maq-stranded'];
  //    Shipped content enables all seventy cells, so there is no disabled cell to
  //    strand a node in and the fixture has to make one. This is what puts the two
  //    `v1-subset` codes in SEEDED_VIOLATIONS; see the note there.
  strandedCell['v1'] = false;
  recordById(documents, 'node.json', 'pt-open-the-ground')['prerequisites'] = ['maq-stranded'];

  // 6. a species that matures after it dies
  recordById(documents, 'species.json', 'orc')['maturityMonths'] = 720;

  return documents;
}

describe('validation reports every violation in a run', () => {
  it('reports every seeded violation, not the first', () => {
    const result = validateContent(sourceOf(sixViolationDocuments()));
    const codes = result.diagnostics.map((d) => d.code).sort();
    expect(codes).toEqual([...SEEDED_VIOLATIONS].sort());
    expect(result.registry).toBeUndefined();
  });

  it('gives every diagnostic a file path and a JSON pointer', () => {
    const result = validateContent(sourceOf(sixViolationDocuments()));
    for (const diagnostic of result.diagnostics) {
      expect(CONTENT_FILES).toContain(diagnostic.file);
      // `v1-subset` is the one check whose subject is the *file* and not a
      // record: "there are sixty-nine flagged cells, not seventy" and "the
      // flagged set is not a full technique × form rectangle" are both claims
      // about the whole of cell.json, and RFC 6901's empty pointer is the correct
      // address for that. It is exempted here rather than given an arbitrary
      // record pointer, and the exemption is by code so that a record-level
      // diagnostic losing its pointer still fails. This fixture is the first to
      // seed the code at all — before all seventy cells were enabled, defect 5
      // could be built without disabling one.
      if (diagnostic.code === 'v1-subset') {
        expect(diagnostic.pointer).toBe('');
        expect(diagnostic.message.length).toBeGreaterThan(0);
        continue;
      }
      // At least one non-empty RFC 6901 segment. The previous pattern,
      // `/^(\/.*)?$/u`, was satisfied by the empty string — which is the one
      // value that means "no pointer at all" — so a validator that stopped
      // emitting pointers entirely would have kept this test green while
      // falsifying the 0.2.0 claim the test exists to hold. The empty pointer
      // is legal RFC 6901 (it addresses the whole document) and that is exactly
      // why it must not be accepted here: every diagnostic in a run over an
      // array-of-records file points at a record, so a root pointer is a
      // producer that gave up rather than a producer being precise.
      expect(diagnostic.pointer).toMatch(/^(\/[^/]+)+$/u);
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

  it('exits non-zero and prints every one of them through the CLI', () => {
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
    expect(report).toContain(`FAILED with ${String(SEEDED_VIOLATIONS.length)} violation(s)`);
    expect(report).toContain(directory);
    expect(output.lines).toEqual([]);
  });

  it('exits zero and reports the counts for the shipped content set', () => {
    const output = capture();
    const code = runValidation([], output);

    expect(code).toBe(0);
    expect(output.errors).toEqual([]);
    expect(output.lines.join('\n')).toContain(
      'OK — 5 techniques, 14 forms, 70 cells (70 flagged v1), 300 nodes, 6 species, ' +
        '3 traditions, 16 primitives',
    );
    expect(output.lines.join('\n')).toMatch(/contentRevision [0-9a-f]{32}/u);
  });
});
