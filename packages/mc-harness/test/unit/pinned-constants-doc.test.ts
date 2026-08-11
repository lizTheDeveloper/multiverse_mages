/*
 * Multiverse Mages — task 10.6: the pinned-constants note is checked against
 * the registry, in both directions.
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
 * Task 10.6 asks for the constants this change pinned to be *recorded* — in
 * `contracts.md` §7 or in a note referenced from it. A recorded list that
 * nothing checks is a list that is true on the day it is written, and the whole
 * argument for pinning constants at all is that a silent divergence between the
 * code and the document is what makes a green baseline meaningless.
 *
 * So the note is checked. Both directions, for the same reason
 * `registryConformance` checks §7's metric names both ways:
 *
 * - a constant in the registry and **not** in the note is a decision nobody
 *   wrote down, which is the state task 10.6 exists to end;
 * - a row in the note for a constant the registry does **not** declare is a
 *   promise about behaviour nothing implements, and it is worse than an omission
 *   because a reader has no reason to doubt it.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { BALANCE_METRIC_REGISTRY, contractSection7MetricIds } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const read = (path: string): string => readFileSync(join(repoRoot, path), 'utf8');

const NOTE_PATH = 'docs/design/metric-constants.md';
const note = read(NOTE_PATH);
const contracts = read('docs/design/contracts.md');

/** Every `| \`metric\` | \`constant\` | \`value\` |` row of the note. */
function noteRows(markdown: string): { metricId: string; constant: string; value: string }[] {
  const rows: { metricId: string; constant: string; value: string }[] = [];
  for (const line of markdown.split('\n')) {
    const match = /^\|\s*`([A-Za-z][A-Za-z0-9]*)`\s*\|\s*`([A-Za-z][A-Za-z0-9]*)`\s*\|\s*`(.*)`\s*\|$/.exec(
      line,
    );
    if (match !== null) {
      rows.push({
        metricId: match[1] as string,
        constant: match[2] as string,
        value: match[3] as string,
      });
    }
  }
  return rows;
}

/** Every `metricId.constant` the registry declares, sorted. */
function registryKeys(): string[] {
  const keys: string[] = [];
  for (const definition of BALANCE_METRIC_REGISTRY.definitions) {
    for (const constant of Object.keys(definition.pinnedConstants)) {
      keys.push(`${definition.id}.${constant}`);
    }
  }
  return keys.sort();
}

describe('the pinned-constants note is reachable from the contract', () => {
  it('is referenced from contracts.md, so §7 leads a reader to it', () => {
    expect(contracts).toContain('metric-constants.md');
  });

  it('names every §7 metric somewhere in it', () => {
    // Not "every metric has a constant" — `inboundRaidTempoLoss` pins one thing
    // and that is honest. It is "no metric is missing from the note entirely",
    // which is what would happen if a metric were added and forgotten.
    for (const metricId of contractSection7MetricIds(contracts)) {
      expect(note, `${metricId} is absent from ${NOTE_PATH}`).toContain(`\`${metricId}\``);
    }
  });
});

describe('every pinned constant is recorded, and nothing else is', () => {
  const rows = noteRows(note);

  it('parsed a table at all', () => {
    // Guards the check itself: a regex that matched nothing would make both
    // assertions below pass against an empty document.
    expect(rows.length).toBeGreaterThan(30);
  });

  it('records exactly the registry’s pinned constants', () => {
    const documented = rows.map((row) => `${row.metricId}.${row.constant}`).sort();
    expect(documented).toEqual(registryKeys());
  });

  it('records each constant’s current value verbatim', () => {
    for (const row of rows) {
      const definition = BALANCE_METRIC_REGISTRY.balance(row.metricId);
      expect(definition, `${row.metricId} is not in the registry`).toBeDefined();
      const value = definition?.pinnedConstants[row.constant];
      // JSON, so `12` and `"12"` cannot both satisfy the row — the difference
      // between a tick count and a label is exactly the kind of drift a
      // documented constant is supposed to make visible.
      expect(JSON.stringify(value), `${row.metricId}.${row.constant}`).toBe(row.value);
    }
  });
});
