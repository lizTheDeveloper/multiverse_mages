/*
 * Multiverse Mages — the design-dashboard payload is built, and this is what it must hold.
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
 * `ui/design-dashboard/data.json` is the whole content of the design dashboard.
 * It is a pure function of the repository, and it is now **built and gitignored**
 * rather than committed — `npm run ui:dashboard` writes it, and
 * `npm run check:generated` gates the two properties that lets rest on: the
 * generator is deterministic, and the artifact is not tracked.
 *
 * ## Why the byte-for-byte pin that used to live here is gone
 *
 * It was defended three times by projecting a field out of the equality —
 * `fileSeal` after #72's baseline refresh landed mid-build, the reachability
 * totals and line numbers after the same thing recurred, and finally the finding
 * rows and `findingCount` after #156 *fixed* a finding and turned `main` red for
 * it. Three projections in a row is the shape being wrong, not the fields.
 *
 * And by the third one the pin had gone blind. Measured on 63f44ced, the tip of
 * `main`: the committed payload disagreed with fresh output in
 * `examinedSymbolCount` (858 against 864), `productionFileCount` (309 against
 * 313) and `NO_DEMAND`'s line number (84 against 132) — **exactly** the fields
 * the last projection had carved out. The file this test existed to keep current
 * was stale, and this test was green over it. `scripts/check-generated-artifacts.mjs`
 * carries the full argument.
 *
 * The staleness the pin was for cannot happen to a payload that is regenerated
 * on every read, so it is not preserved here; it is removed.
 *
 * ## What this test is now
 *
 * The other half of the old file, which was never about equality: **does the
 * generator produce a payload the page can actually draw?** Every assertion below
 * is a field some panel renders by name, or a structural property whose failure
 * would make a panel render something wrong rather than nothing — the second kind
 * being what the two projections above were really protecting, restated as
 * properties instead of as literals.
 *
 * It runs the generator rather than reimplementing it, as before: a test that
 * reimplements the builder can agree with itself while both have drifted from
 * `build-design-dashboard.mjs`, which is the one comparison that matters.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const scratch = mkdtempSync(path.join(tmpdir(), 'mm-design-dashboard-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

interface Payload {
  readonly provenance: {
    readonly generatedBy: string;
    readonly command: string;
    readonly checkedBy: string;
    readonly contentRevision: string;
    readonly contentCounts: Readonly<Record<string, number>>;
    readonly metricRegistrySize: number;
  };
  readonly grid: {
    readonly techniques: readonly { readonly id: string }[];
    readonly forms: readonly { readonly id: string }[];
    readonly cells: readonly {
      readonly id: string;
      readonly technique: string;
      readonly form: string;
      readonly enabled: boolean;
      readonly nodeCount: number;
    }[];
    readonly totals: { readonly cells: number; readonly enabledCells: number; readonly nodes: number };
  };
  readonly primitives: {
    readonly source: string;
    readonly rows: readonly { readonly id: string; readonly status: string }[];
    readonly unconsumed: readonly string[];
  };
  readonly species: { readonly rows: readonly { readonly id: string; readonly name: string }[] };
  readonly metrics: {
    readonly rows: readonly { readonly id: string; readonly disprovedBy: string }[];
    readonly gateMetricIds: readonly string[];
    readonly baselines: readonly {
      readonly file: string;
      readonly sweepId: string;
      readonly kind: string;
      readonly runCount: number;
      readonly fileSeal: string;
      readonly contentRevision: string;
      readonly metricIds: readonly string[];
    }[];
    readonly contractMetricsWithCommittedValue: readonly string[];
  };
  readonly reachability: {
    readonly findingCount: number;
    readonly examinedSymbolCount: number;
    readonly productionFileCount: number;
    readonly unreached: readonly { readonly name: string; readonly file: string; readonly line: number }[];
    readonly reachedOnlyByUnreached: readonly Record<string, unknown>[];
    readonly untouchedComponents: readonly Record<string, unknown>[];
    readonly unconsumedConstants: readonly Record<string, unknown>[];
    readonly constantsBehindDeadCode: readonly Record<string, unknown>[];
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

/** One build of the payload, at the generator's own defaults. Costs about 0.7 s. */
const payload = ((): Payload => {
  const out = path.join(scratch, 'data.json');
  execFileSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'build-design-dashboard.mjs'), '--out', out],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  return JSON.parse(readFileSync(out, 'utf8')) as Payload;
})();

/**
 * The row keys each reachability table renders, per block.
 *
 * This is what the old `reachabilityShape` projection asserted — it reduced every
 * row to its sorted key list and compared *that* — restated as a property so it
 * says which keys, and so a failure names the block. It is deliberately **not**
 * the findings themselves: a reachability finding being fixed is the best
 * possible reason for this payload to change and the worst possible reason for
 * `main` to break, and the findings have a gate of their own in
 * `npm run check:reachability:ratchet`.
 *
 * `constantsBehindDeadCode` is here and was not in the old projection — it was
 * pinned *literally* instead, which made it one of the redness sources this file
 * is being rewritten to remove. The page has rendered it since it existed.
 */
const REACHABILITY_ROW_KEYS: Readonly<Record<string, readonly string[]>> = {
  unreached: ['file', 'kind', 'line', 'name'],
  reachedOnlyByUnreached: ['file', 'line', 'name', 'via'],
  unconsumedConstants: ['field', 'file', 'id', 'line'],
  constantsBehindDeadCode: ['field', 'id', 'via'],
};

describe('the payload `npm run ui:dashboard` produces', () => {
  it('carries the grid the page draws', () => {
    // Five techniques by fourteen forms, and §2.2's twelve-cell rectangle inside
    // it. A payload that is fresh and empty renders seventy blank tiles, which
    // reads as "no content authored" rather than as a broken build.
    expect(payload.grid.totals.cells).toBe(70);
    expect(payload.grid.cells).toHaveLength(70);
    expect(payload.grid.techniques).toHaveLength(5);
    expect(payload.grid.forms).toHaveLength(14);
    expect(payload.grid.totals.enabledCells).toBeGreaterThan(0);
    expect(payload.grid.totals.nodes).toBeGreaterThan(0);

    // Every cell resolves to a technique and a form the payload also ships, so
    // the page never has to draw a row it cannot label. Cross-section
    // consistency of this kind is what a whole-object equality gave for free and
    // has to be stated once it is gone.
    const techniques = new Set(payload.grid.techniques.map((t) => t.id));
    const forms = new Set(payload.grid.forms.map((f) => f.id));
    const ids = new Set<string>();
    for (const cell of payload.grid.cells) {
      expect(techniques, `${cell.id} names an unknown technique`).toContain(cell.technique);
      expect(forms, `${cell.id} names an unknown form`).toContain(cell.form);
      ids.add(cell.id);
    }
    expect(ids.size, 'two cells share an id').toBe(70);
    expect(payload.grid.cells.reduce((n, c) => n + c.nodeCount, 0)).toBe(payload.grid.totals.nodes);
  });

  it('carries the primitive table, with every row in a status the page has a colour for', () => {
    expect(payload.primitives.rows.length).toBeGreaterThan(0);
    for (const row of payload.primitives.rows) {
      expect(['node-driven', 'non-node', 'unconsumed']).toContain(row.status);
    }
    const ids = new Set(payload.primitives.rows.map((r) => r.id));
    expect(ids.size, 'two primitive rows share an id').toBe(payload.primitives.rows.length);
    // The panel prints `unconsumed` as a headline list above the table. Every
    // name in it has to be a row, or the page names a primitive a reader then
    // cannot find.
    //
    // What is deliberately *not* asserted: that this list equals the rows whose
    // `status` is `unconsumed`. It does not, and the difference is the finding
    // the panel exists to show — the check calls a primitive unconsumed when no
    // authored *node* drives it, while `status` also distinguishes the ones a
    // non-node consumer moves. Three against one on this tree. An equality here
    // would have been a green invented over a real disagreement; it was written,
    // it failed, and this is what replaced it.
    for (const id of payload.primitives.unconsumed) {
      expect(ids, `unconsumed names ${id}, which has no row`).toContain(id);
    }
  });

  it('carries the species table', () => {
    expect(payload.species.rows).toHaveLength(6);
    for (const row of payload.species.rows) expect(row.name.length).toBeGreaterThan(0);
  });

  it('carries the §7 metric registry, with a falsifier on every row', () => {
    expect(payload.metrics.rows.length).toBeGreaterThan(0);
    for (const row of payload.metrics.rows) {
      // The registry requires one on every entry; the dashboard prints them in a
      // column, and a blank cell there would read as "nothing would disprove
      // this", which is the opposite of what an empty string means.
      expect(row.disprovedBy.length, `${row.id} has no disprovedBy`).toBeGreaterThan(0);
    }
    expect(payload.metrics.gateMetricIds.length).toBeGreaterThan(0);
    expect(payload.provenance.metricRegistrySize).toBe(payload.metrics.rows.length);
  });

  it('reads all four committed baselines, and keeps the fields that identify each', () => {
    // This is what the `withoutFileSeals` projection was really protecting. The
    // seal is a **tamper seal over a baseline file's own fields, not a content
    // hash**, so it moves whenever any row of any baseline moves — which is why
    // pinning its value reddened `main` on other people's work. Its *presence*
    // is what a reader checks a file against, and that is asserted here.
    //
    // What is deliberately not asserted: that all four share one
    // `contentRevision`. Three do and the ascension baseline does not, and the
    // page renders that disagreement as a warning of its own (`sameContent` in
    // index.html). Asserting equality would be inventing a green over a real
    // and displayed finding.
    expect(payload.metrics.baselines).toHaveLength(4);
    expect(payload.provenance.contentRevision).toMatch(/^[0-9a-f]{32}$/u);
    for (const baseline of payload.metrics.baselines) {
      expect(baseline.file, 'a baseline does not say which file it came from').toMatch(
        /^balance\/baselines\/.+\.json$/u,
      );
      expect(baseline.sweepId.length, `${baseline.file} has no sweepId`).toBeGreaterThan(0);
      expect(baseline.contentRevision, `${baseline.file} has no content revision`).toMatch(
        /^[0-9a-f]{32}$/u,
      );
      expect(baseline.fileSeal, `${baseline.file} has no file seal`).toMatch(/^[0-9a-f]{64}$/u);
      expect(baseline.runCount, `${baseline.file} reports no runs`).toBeGreaterThan(0);
      expect(baseline.metricIds.length, `${baseline.file} gates no metrics`).toBeGreaterThan(0);
    }
  });

  it('carries reachability as rows the tables can render, without pinning the findings', () => {
    // The counts move on any pull request that adds a file or an export, and the
    // findings move whenever one is fixed. Neither is this payload's business —
    // `check:reachability:ratchet` gates the finding set. What has to hold is
    // that the blocks exist, are arrays, and carry the keys each column reads.
    expect(payload.reachability.examinedSymbolCount).toBeGreaterThan(0);
    expect(payload.reachability.productionFileCount).toBeGreaterThan(0);
    expect(payload.reachability.findingCount).toBeGreaterThanOrEqual(0);

    for (const [block, keys] of Object.entries(REACHABILITY_ROW_KEYS)) {
      const rows = payload.reachability[block as keyof Payload['reachability']];
      expect(Array.isArray(rows), `reachability.${block} is not an array`).toBe(true);
      for (const row of rows as readonly Record<string, unknown>[]) {
        expect(Object.keys(row).sort(), `a row of reachability.${block} has the wrong keys`).toEqual(
          [...keys],
        );
      }
    }
    // `untouchedComponents` is empty on this tree, so its key set cannot be
    // observed the way the four above were. It is read out of the emitter
    // instead — `check-reachability.mjs` builds each row as `{ file, line, name }`
    // — rather than guessed, and the assertion starts biting the moment a row
    // appears. The array itself still has to exist: the page counts it.
    expect(Array.isArray(payload.reachability.untouchedComponents)).toBe(true);
    for (const row of payload.reachability.untouchedComponents) {
      expect(Object.keys(row).sort()).toEqual(['file', 'line', 'name']);
    }

    // The one property of a line number the page depends on: it prints them in a
    // column, and a zero there points a reader at the top of a file.
    for (const entry of payload.reachability.unreached) {
      expect(entry.line, `${entry.name} has no line`).toBeGreaterThan(0);
      expect(entry.file.length).toBeGreaterThan(0);
    }
  });

  it('dates and refs every figure it lifted from a document', () => {
    // `CLAUDE.md`: an undated measurement in the present tense is read as current
    // for as long as it survives, and that has cost this project twice. The
    // generator takes no clock reading, so the only dates in the payload are the
    // ones the source documents state — and a document-derived section that lost
    // its date would look exactly like a live one.
    expect(payload.decisions.statedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(payload.decisions.statedRef?.commit).toBeTruthy();
    expect(payload.decisions.items.length).toBeGreaterThan(0);

    const separation = payload.measurements.speciesSeparation;
    expect(separation.statedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(separation.refs.length).toBeGreaterThan(0);
    for (const ref of separation.refs) expect(ref.commit).toBeTruthy();

    expect(payload.openQuestions.length).toBeGreaterThan(0);
    for (const question of payload.openQuestions) {
      expect(question.detail.length, `${question.id} has no detail`).toBeGreaterThan(0);
    }
  });

  it('carries no wall-clock stamp, so the page is a statement about the tree', () => {
    // The property `npm run check:generated` rests on: the payload is a pure
    // function of the repository, so the file CI builds is the file you build,
    // and the page can say it describes whatever commit you are reading it on.
    // The check would catch a timestamp as non-determinism; this catches it with
    // a message that says what was added and why it is not allowed.
    //
    // A date in a *relayed* document field is legitimate and required; one in
    // provenance is not, so only the provenance block is searched. Matched as an
    // ISO date rather than as a year, because a content hash is hex and will
    // contain `2026` sooner or later.
    expect(JSON.stringify(payload.provenance)).not.toMatch(/\d{4}-\d{2}-\d{2}/u);
    expect(Object.keys(payload.provenance)).not.toContain('generatedAt');
  });

  it('names itself, the command that builds it, and the check that gates it', () => {
    // So a reader of the file can find every end of it without grepping.
    expect(payload.provenance.generatedBy).toBe('scripts/build-design-dashboard.mjs');
    expect(payload.provenance.command).toBe('npm run ui:dashboard');
    expect(payload.provenance.checkedBy).toBe('scripts/check-generated-artifacts.mjs');
  });
});
