/*
 * Multiverse Mages — the committed design-dashboard payload is a golden.
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
 * `ui/design-dashboard/data.json` is the whole content of the design dashboard,
 * and it is committed so a fresh clone can open the page. That makes it exactly
 * the kind of generated artefact that rots in silence — the file keeps loading,
 * every table keeps rendering, and the repository it describes stopped being
 * this one some commits ago. The dashboard's entire argument is that its numbers
 * are current; a stale payload does not break it, it makes it *lie*.
 *
 * So it gets the treatment `ui/session.json` already has and that `CLAUDE.md`
 * gives golden replay fixtures: regenerated only by explicit command
 * (`npm run ui:dashboard`), and a diff is a claim that something changed on
 * purpose.
 *
 * This runs the generator rather than reimplementing it, for the reason
 * `ui-recording.test.ts` gives about the recorder: a test that reimplements the
 * builder can agree with the committed file while both have drifted from
 * `build-design-dashboard.mjs`, which is the one comparison that matters.
 *
 * ## Why the byte comparison is possible at all
 *
 * The payload carries no clock reading and no `git` call — see the module note
 * on the generator for why both were rejected. That is what makes "re-run it and
 * compare" a test rather than a guaranteed failure, and it is also what lets the
 * page claim to be a statement about the commit you are reading it on.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const COMMITTED = path.join(ROOT, 'ui', 'design-dashboard', 'data.json');
const scratch = mkdtempSync(path.join(tmpdir(), 'mm-design-dashboard-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

interface Payload {
  readonly provenance: {
    readonly generatedBy: string;
    readonly pinnedBy: string;
    readonly contentRevision: string;
  };
  readonly grid: {
    readonly cells: readonly { readonly id: string; readonly enabled: boolean }[];
    readonly totals: { readonly cells: number; readonly enabledCells: number; readonly nodes: number };
  };
  readonly primitives: {
    readonly rows: readonly { readonly id: string; readonly status: string }[];
    readonly unconsumed: readonly string[];
  };
  readonly species: { readonly rows: readonly { readonly id: string }[] };
  readonly metrics: {
    readonly rows: readonly { readonly id: string; readonly disprovedBy: string }[];
    readonly baselines: readonly { readonly sweepId: string; readonly contentRevision: string }[];
    readonly contractMetricsWithCommittedValue: readonly string[];
  };
  readonly reachability: { readonly findingCount: number; readonly examinedSymbolCount: number };
  readonly decisions: {
    readonly statedDate: string | null;
    readonly statedRef: { readonly branch: string; readonly commit: string } | null;
    readonly items: readonly { readonly heading: string; readonly recommendation: string | null }[];
  };
  readonly measurements: {
    readonly speciesSeparation: {
      readonly statedDate: string | null;
      readonly refs: readonly { readonly ref: string; readonly commit: string }[];
    };
  };
  readonly openQuestions: readonly { readonly id: string; readonly detail: string }[];
}

const committed = JSON.parse(readFileSync(COMMITTED, 'utf8')) as Payload;

describe('ui/design-dashboard/data.json', () => {
  it('is what `npm run ui:dashboard` produces today', () => {
    const out = path.join(scratch, 'data.json');
    execFileSync(
      process.execPath,
      [path.join(ROOT, 'scripts', 'build-design-dashboard.mjs'), '--out', out],
      { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    const fresh = JSON.parse(readFileSync(out, 'utf8')) as Payload;

    // Section by section rather than as one object, so a failure says *what*
    // moved instead of diffing two 110 KB structures. The grid moving is a
    // content change; the metric registry moving is a §7 change; reachability
    // moving is a code change. Those are three different reviews.
    expect(fresh.provenance).toEqual(committed.provenance);
    expect(fresh.grid).toEqual(committed.grid);
    expect(fresh.primitives).toEqual(committed.primitives);
    expect(fresh.species).toEqual(committed.species);
    expect(fresh.metrics).toEqual(committed.metrics);
    expect(fresh.reachability).toEqual(committed.reachability);
    expect(fresh.decisions).toEqual(committed.decisions);
    expect(fresh.measurements).toEqual(committed.measurements);
    expect(fresh.openQuestions).toEqual(committed.openQuestions);
  });

  it('carries what the page reads it for', () => {
    // Guards against a payload that is fresh and useless. Every assertion here
    // is a field some panel renders by name, and a missing one draws an empty
    // box that reads as "nothing to report".
    expect(committed.grid.totals.cells).toBe(70);
    expect(committed.grid.cells).toHaveLength(70);
    expect(committed.grid.totals.enabledCells).toBeGreaterThan(0);
    expect(committed.grid.totals.nodes).toBeGreaterThan(0);

    expect(committed.primitives.rows.length).toBeGreaterThan(0);
    for (const row of committed.primitives.rows) {
      expect(['node-driven', 'non-node', 'unconsumed']).toContain(row.status);
    }

    expect(committed.species.rows).toHaveLength(6);
    expect(committed.reachability.examinedSymbolCount).toBeGreaterThan(0);

    expect(committed.metrics.rows.length).toBeGreaterThan(0);
    for (const row of committed.metrics.rows) {
      // The registry requires one on every entry; the dashboard prints them in
      // a column, and a blank cell there would read as "nothing would disprove
      // this", which is the opposite of what an empty string means.
      expect(row.disprovedBy.length, `${row.id} has no disprovedBy`).toBeGreaterThan(0);
    }
    expect(committed.metrics.baselines).toHaveLength(4);

    expect(committed.openQuestions.length).toBeGreaterThan(0);
  });

  it('dates and refs every figure it lifted from a document', () => {
    // `CLAUDE.md`: an undated measurement in the present tense is read as
    // current for as long as it survives, and that has cost this project twice.
    // The generator itself takes no clock reading, so the only dates in the
    // payload are the ones the source documents state — and a document-derived
    // section that lost its date would look exactly like a live one.
    expect(committed.decisions.statedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(committed.decisions.statedRef?.commit).toBeTruthy();
    expect(committed.decisions.items.length).toBeGreaterThan(0);

    const separation = committed.measurements.speciesSeparation;
    expect(separation.statedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(separation.refs.length).toBeGreaterThan(0);
    for (const ref of separation.refs) expect(ref.commit).toBeTruthy();
  });

  it('carries no wall-clock stamp, so the pin above is a check and not a false alarm', () => {
    // The obvious provenance — a timestamp — would make the byte comparison
    // fail on every run, and the first response to that would be to delete the
    // comparison. Asserted rather than trusted, because adding a date to a
    // provenance block is a natural-looking edit.
    // A date in a *relayed* document field is legitimate and required; one in
    // provenance is not, so only the provenance block is searched. Matched as an
    // ISO date rather than as a year, because a content hash is hex and will
    // contain `2026` sooner or later.
    expect(JSON.stringify(committed.provenance)).not.toMatch(/\d{4}-\d{2}-\d{2}/u);
    expect(readFileSync(COMMITTED, 'utf8')).not.toContain('generatedAt');
  });

  it('names itself and this test, so a reader of the file can find both ends', () => {
    expect(committed.provenance.generatedBy).toBe('scripts/build-design-dashboard.mjs');
    expect(committed.provenance.pinnedBy).toBe(
      'packages/content/test/unit/design-dashboard-payload.test.ts',
    );
  });
});
