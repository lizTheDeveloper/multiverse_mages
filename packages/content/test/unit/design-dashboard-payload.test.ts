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
  readonly reachability: {
    readonly findingCount: number;
    readonly examinedSymbolCount: number;
    readonly productionFileCount: number;
    readonly unreached: readonly { readonly name: string; readonly file: string; readonly line: number }[];
    readonly reachedOnlyByUnreached: readonly { readonly name: string; readonly line: number }[];
    readonly untouchedComponents: readonly { readonly name: string; readonly line: number }[];
    readonly unconsumedConstants: readonly { readonly id: string; readonly line: number }[];
  };
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

/**
 * The reachability block minus the fields that move without a finding moving.
 *
 * Built by deleting from a clone rather than by destructuring the omissions
 * away: the discard names would be unused bindings, and this repository's lint
 * rejects those — correctly, since a discard that stops matching a real field
 * silently starts comparing it again.
 */
/**
 * `measurements`, with every baseline's `fileSeal` projected out.
 *
 * **`fileSeal` is a tamper seal over a baseline file's own fields, not a content
 * hash** — this payload renames it for exactly that reason, and all four seals
 * differ while all four `provenance.contentHash` values are identical. So the seal
 * moves whenever *any row of any baseline* moves, which is precisely the class of
 * unrelated pull request `withoutLocations` above exists to keep out of this
 * equality.
 *
 * It cost a CI failure to learn: #72's baseline refresh landed mid-build and this
 * test went red on one seal, having asserted nothing about the dashboard. A pinning
 * test that reddens on other people's work gets regenerated to green without being
 * read, and then it pins nothing.
 *
 * The seal is still *displayed* — it is what a reader checks a file against. It is
 * simply not what this test is for. `provenance.contentHash` **stays pinned**,
 * because a change there means the content set moved and the dashboard genuinely is
 * stale.
 */
const withoutFileSeals = (block: Payload['metrics']): unknown => {
  const clone = JSON.parse(JSON.stringify(block)) as Record<string, unknown>;
  const strip = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) strip(entry);
      return;
    }
    if (value !== null && typeof value === 'object') {
      const row = value as Record<string, unknown>;
      delete row['fileSeal'];
      for (const nested of Object.values(row)) strip(nested);
    }
  };
  strip(clone);
  return clone;
};

const withoutLocations = (block: Payload['reachability']): unknown => {
  const clone = JSON.parse(JSON.stringify(block)) as Record<string, unknown>;
  delete clone['examinedSymbolCount'];
  delete clone['productionFileCount'];
  for (const key of [
    'unreached',
    'reachedOnlyByUnreached',
    'untouchedComponents',
    'unconsumedConstants',
  ]) {
    const rows = clone[key] as Record<string, unknown>[];
    for (const row of rows) delete row['line'];
  }
  return clone;
};

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
    expect(withoutFileSeals(fresh.metrics)).toEqual(withoutFileSeals(committed.metrics));
    // Reachability is compared with **line numbers and totals projected out**,
    // deliberately, and the reason is about what a red test teaches.
    //
    // `unreached` carries a line number for each of a hundred-odd symbols, and
    // `examinedSymbolCount` / `productionFileCount` move whenever anyone adds a
    // file or an export. Pinned literally, this test goes red on rules-path PRs
    // that changed nothing it is about — adding a comment line above an
    // unreached export is enough. The reflex fix for a test that is red for no
    // reason is to regenerate, and here regenerating would be *correct* most
    // times, which is worse than it being wrong: it trains exactly the habit
    // `CLAUDE.md` forbids around goldens.
    //
    // What stays pinned is what a reader would want to argue about — which
    // symbols, which components, which constants, and `findingCount`. The line
    // numbers stay in the payload because the page prints them in a column; they
    // are asserted below to exist, which is the property that would actually
    // break the table.
    expect(withoutLocations(fresh.reachability)).toEqual(withoutLocations(committed.reachability));
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
    // The one property of a line number the page depends on. Pinning the values
    // themselves is what the projection above declines to do, and this is the
    // half of that trade which still has to hold.
    for (const entry of committed.reachability.unreached) {
      expect(entry.line, `${entry.name} has no line`).toBeGreaterThan(0);
      expect(entry.file.length).toBeGreaterThan(0);
    }

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
