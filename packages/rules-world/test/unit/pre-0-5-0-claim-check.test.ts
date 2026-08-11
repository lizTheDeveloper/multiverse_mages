/*
 * Multiverse Mages — no test may claim a species magnitude is balanced yet.
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
 * `docs/design/release-plan.md` pivots on one rule: **releases 0.1.0 through
 * 0.4.0 can only make mechanical claims**, because there is no balance harness
 * until 0.5.0 and no measurement to disprove a balance claim with. The
 * `species-traits` spec turns that into a check: *"a test asserts a target win
 * rate, fairness property, or balance band over species traits → the pre-0.5.0
 * claim check fails."*
 *
 * ## Why a test that fails other tests
 *
 * Every species magnitude in this change is a placeholder somebody guessed. The
 * failure mode is not that a guess is wrong — it is that a guess acquires a
 * green test around it, and a green test reads as evidence. Six months later
 * the number is load-bearing for a suite nobody wants to break, and the balance
 * harness arrives to find its conclusions pre-committed. `release-plan.md`'s
 * whole point is that a claim needs a measurement that could disprove it, and
 * before 0.5.0 that measurement does not exist.
 *
 * The check is deliberately narrow: it fires only where a *balance* vocabulary
 * and a *species* vocabulary meet inside one assertion. Differentiation
 * assertions — "these two species differ", "this trait is higher than that one"
 * — are mechanical and explicitly permitted; they are the 0.4.0 claim. Balance
 * vocabulary elsewhere is fine too, and there is plenty of it: the repository is
 * full of comments and diagnostics that explain what a balance baseline is.
 * Requiring the two to co-occur inside a single `expect()` is what separates
 * "this test asserts species are fair" from "this test mentions fairness".
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadContent, shippedContentSource } from '@mm/content';
import ts from 'typescript';

import { repoRoot, wordsIn } from './species-fixtures.js';

const CONTENT = loadContent(shippedContentSource());
const SPECIES_IDS = CONTENT.species.map((entry) => entry.record.id);
const TRADITION_IDS = CONTENT.traditions.map((entry) => entry.record.id);

/**
 * Words that name a property only the balance harness can measure.
 *
 * Every one is either a metric from `contracts.md` §7 or the vocabulary
 * `release-plan.md` uses for the claims it forbids before 0.5.0. Deliberately
 * not "differ", "greater", or "ordering", all of which describe the mechanical
 * claims 0.4.0 *is* allowed to make.
 */
const BALANCE_TERMS = [
  'balanced',
  'balance',
  'fair',
  'fairness',
  'winrate',
  'wins',
  'snowball',
  'ascensionrate',
  'targetband',
  'gini',
  'overpowered',
  'underpowered',
];

/**
 * Words too generic to identify a subject, stripped out of the content ids
 * below.
 *
 * `true-naming` contributes `true`; `art-of-memory` contributes `art` and `of`.
 * A subject term matching `true` would fire on half the assertions in the
 * workspace and the check would be relaxed until it meant nothing — which is
 * the failure mode this whole file exists to prevent, arriving from the other
 * direction.
 */
const TOO_GENERIC = new Set(['true', 'of', 'art', 'the', 'a', 'an']);

/** The distinctive words of each shipped tradition's id. */
const TRADITION_WORDS = [...new Set(TRADITION_IDS.flatMap(wordsIn))].filter(
  (word) => !TOO_GENERIC.has(word),
);

/**
 * Words that mean "this assertion is about something this release ships".
 *
 * **Widened from species alone.** The rule `release-plan.md` states is about
 * *balance claims before 0.5.0*, not about species specifically; the species
 * list was simply what `species-traits` happened to name when the check was
 * written. That made it incidental to `knowledge-model`, whose subject matter
 * is traditions, nodes, primitives and the grid — so a test asserting that the
 * three traditions are balanced against each other, or that a primitive's
 * magnitude sits in a target band, passed this scan untouched while being
 * exactly the pre-committed conclusion the balance harness must be free to
 * contradict at 0.5.0.
 *
 * Species ids stay whole-word matched for the reason recorded below — "orc" is
 * a substring of "orchestrate" — and every term added here is matched the same
 * way, which is why `node` and `cell` are safe to include: `nodeId` splits into
 * `node` and `id`, while `encoded` does not split at all.
 */
const SUBJECT_TERMS = [
  ...SPECIES_IDS,
  'species',
  ...TRADITION_WORDS,
  'tradition',
  'traditions',
  'node',
  'nodes',
  'primitive',
  'primitives',
  'grid',
  'cell',
  'cells',
];

/**
 * The metric identifiers `contracts.md` §7 tabulates.
 *
 * Parsed from the document rather than imported, because §5 grants `rules-world`
 * no edge to `mc-harness` and this check must not be the reason one appears.
 * The same table is parsed by `mc-harness`'s own registry conformance check; two
 * parsers of one table is the cost of the boundary and is cheaper than the edge.
 */
const SECTION_7_METRIC_IDS: readonly string[] = (() => {
  const markdown = readFileSync(join(repoRoot, 'docs/design/contracts.md'), 'utf8');
  const start = markdown.indexOf('## 7. Balance Metrics');
  if (start < 0) throw new Error('contracts.md has no §7 to read metric names from.');
  const rest = markdown.slice(start);
  const end = rest.indexOf('\n## ', 1);
  const section = end < 0 ? rest : rest.slice(0, end);
  const ids = [...section.matchAll(/^\|\s*`([A-Za-z][A-Za-z0-9]*)`\s*\|/gmu)].map(
    (match) => match[1] as string,
  );
  if (ids.length === 0) throw new Error('contracts.md §7 parsed to no metric names.');
  return ids;
})();

/**
 * The package where a §7 metric name is the *subject under test*, not a claim.
 *
 * `mc-harness` is the measurement layer 0.5.0 exists to build. Its tests
 * necessarily write `collectWinRateByPrimitive`, `worshipSnowball` and
 * `timeToTierBySpecies` — every one of which welds a balance word to a subject
 * word inside a single identifier, and every one of which this scan therefore
 * read as a claim that primitives are balanced.
 *
 * They are the opposite of that claim. The assertions those names appear in
 * check that the metric reports `mechanic-absent`, that its key is present, that
 * an unavailable value does not fold into a mean — i.e. that **no number is
 * being claimed**. A check that forbade the harness from naming the metrics it
 * registers would forbid 0.5.0 from being implemented at all, and would be
 * deleted rather than fixed.
 *
 * So inside this one path, and only there, a §7 metric identifier is stripped
 * out of a name before the vocabularies are matched. Nothing else changes:
 * `expect(dwarfWinRate)` inside `mc-harness` still fires, and a §7 metric name
 * inside any *other* package still fires, which is what stops a rules package
 * from laundering a balance claim through a metric name. Both are asserted in
 * the controls below.
 */
const MEASUREMENT_PACKAGE_PREFIX = 'packages/mc-harness/';

/** Removes §7 metric identifiers from a collected name, longest first. */
function withoutMetricNames(name: string): string {
  let stripped = name;
  for (const id of [...SECTION_7_METRIC_IDS].sort((a, b) => b.length - a.length)) {
    stripped = stripped.replace(new RegExp(id, 'giu'), ' ');
  }
  return stripped;
}

interface Claim {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

/** How a file is scanned. */
export interface ClaimScanOptions {
  /**
   * Whether a `contracts.md` §7 metric identifier names the subject under test
   * rather than a magnitude being claimed. True only for
   * {@link MEASUREMENT_PACKAGE_PREFIX}; see its note.
   */
  readonly metricNamesAreSubjectsUnderTest?: boolean;
}

/**
 * Assertions that pair a balance term with a subject term.
 *
 * Exported so the controls can feed it synthetic source. The scan reads parsed
 * syntax and only inside an `expect(...)` call, so a comment explaining balance
 * methodology is invisible to it — which matters, because the alternative is a
 * check that fires on this file's own docstring.
 */
export function balanceClaims(
  path: string,
  source: string,
  options: ClaimScanOptions = {},
): Claim[] {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: Claim[] = [];

  const namesIn = (node: ts.Node): string[] => {
    const collected: string[] = [];
    const walk = (child: ts.Node): void => {
      // `expect(actual, message)`: the second argument is prose explaining what
      // a failure would mean, not part of the claim. Excluding it is
      // load-bearing rather than tidy — the most careful assertions in this
      // repository explain themselves at length, and the first two files this
      // check ever ran against were caught by their own messages saying that
      // species magnitudes are not balanced. A conformance check that fails on
      // the sentence describing the rule is a check that gets deleted.
      if (
        ts.isCallExpression(child) &&
        ts.isIdentifier(child.expression) &&
        child.expression.text === 'expect' &&
        child.arguments.length > 1
      ) {
        collected.push(child.expression.text);
        const actual = child.arguments[0];
        if (actual !== undefined) walk(actual);
        return;
      }
      if (ts.isIdentifier(child) || ts.isPrivateIdentifier(child)) collected.push(child.text);
      else if (ts.isStringLiteralLike(child)) collected.push(child.text);
      ts.forEachChild(child, walk);
    };
    walk(node);
    return collected;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && rootCalleeName(node) === 'expect') {
      const names = (options.metricNamesAreSubjectsUnderTest ?? false)
        ? namesIn(node).map(withoutMetricNames)
        : namesIn(node);
      // Balance terms match as substrings of a name, because the vocabulary
      // arrives welded into identifiers — `winRateOf`, `speciesFairnessIndex`,
      // `isBalanced` — and each of them is distinctive enough that a substring
      // hit is not a coincidence. Species terms match as whole words for the
      // opposite reason: "orc" is a substring of "orchestrate".
      const compact = names.map((name) => name.toLowerCase().replace(/[^a-z]/gu, ''));
      const balance = BALANCE_TERMS.filter((term) =>
        compact.some((name) => name.includes(term)),
      );
      const wordSet = new Set(names.flatMap(wordsIn));
      const subject = SUBJECT_TERMS.filter((term) => wordSet.has(term));
      if (balance.length > 0 && subject.length > 0) {
        const { line } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
        found.push({
          path,
          line: line + 1,
          text: `asserts ${balance.join('/')} over ${subject.join('/')}`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(parsed);

  // `expect(a).toBe(b)` is two nested call expressions that both root at
  // `expect`, so a matching assertion is found twice — once for the whole chain
  // and once for the bare `expect(a)` inside it. Traversal reaches the outer
  // one first and it carries the more complete vocabulary, so the first hit per
  // line is the one worth reporting.
  const seen = new Set<string>();
  return found.filter((claim) => {
    const key = `${claim.path}:${String(claim.line)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** `expect(x).toBe(y)` roots at `expect`; this walks back down the member chain. */
function rootCalleeName(node: ts.CallExpression): string | undefined {
  let current: ts.Expression = node.expression;
  for (;;) {
    if (ts.isIdentifier(current)) return current.text;
    if (ts.isPropertyAccessExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isCallExpression(current)) {
      current = current.expression;
      continue;
    }
    return undefined;
  }
}

function listTests(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries.sort()) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...listTests(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) found.push(full);
  }
  return found;
}

const testFiles = readdirSync(join(repoRoot, 'packages'))
  .filter((entry) => statSync(join(repoRoot, 'packages', entry)).isDirectory())
  .sort()
  .flatMap((pkg) => listTests(join(repoRoot, 'packages', pkg, 'test')))
  .map((full) => ({
    path: relative(repoRoot, full).split(sep).join('/'),
    source: readFileSync(full, 'utf8'),
  }));

describe('no test asserts a balance property over an untuned magnitude', () => {
  it('found tests to scan, so the assertion below is not vacuous', () => {
    expect(testFiles.length).toBeGreaterThan(20);
    expect(testFiles.map((file) => file.path)).toContain(
      'packages/rules-world/test/unit/species-traits.test.ts',
    );
    // And the release whose subject matter the widening was for.
    expect(testFiles.map((file) => file.path)).toContain(
      'packages/rules-magic/test/unit/tradition-differentiation.test.ts',
    );
  });

  it('knows the vocabulary of both releases it now covers', () => {
    // A derived term list can go empty without anything failing: rename the
    // content field and `TRADITION_WORDS` becomes `[]`, and the check quietly
    // stops covering traditions while every assertion stays green.
    expect(SUBJECT_TERMS).toContain('species');
    expect(SUBJECT_TERMS).toContain('tradition');
    expect(SUBJECT_TERMS).toContain('vancian');
    expect(SUBJECT_TERMS.length).toBeGreaterThan(SPECIES_IDS.length + 5);
  });

  it('finds no pre-0.5.0 balance claim anywhere in the workspace suite', () => {
    const claims = testFiles.flatMap((file) =>
      balanceClaims(file.path, file.source, {
        metricNamesAreSubjectsUnderTest: file.path.startsWith(MEASUREMENT_PACKAGE_PREFIX),
      }),
    );
    expect(
      claims.map((claim) => `${claim.path}:${String(claim.line)} ${claim.text}`),
      'No balance measurement exists before agent-interface at 0.5.0, so no test may assert that a ' +
        'species trait, tradition, node, primitive or grid magnitude is balanced, fair, or on ' +
        'target. Every one of those numbers is an untuned placeholder (release-plan.md). Assert ' +
        'differentiation, ordering, or arithmetic instead.',
    ).toEqual([]);
  });
});

describe('the pre-0.5.0 claim check would catch a violation', () => {
  it('catches a target win rate over a named species', () => {
    const claims = balanceClaims(
      'packages/rules-world/test/unit/__probe__.test.ts',
      "expect(winRateOf('dwarf')).toBeGreaterThan(400);\n",
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]?.text).toContain('dwarf');
  });

  it('catches a fairness assertion over species', () => {
    const claims = balanceClaims(
      'packages/rules-world/test/unit/__probe__.test.ts',
      'expect(speciesFairnessIndex).toBeLessThan(350);\n',
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]?.text).toContain('fairness');
  });

  it('catches a claim that species magnitudes are balanced', () => {
    const claims = balanceClaims(
      'packages/rules-world/test/unit/__probe__.test.ts',
      "expect(speciesTable.balanced).toBe(true);\n",
    );
    expect(claims).toHaveLength(1);
  });

  it('catches a balance claim about a tradition, which is this release’s subject', () => {
    // The hole the widening closes. Before it, every assertion below passed
    // this scan without a word, because the vocabulary knew only about species.
    const claims = balanceClaims(
      'packages/rules-magic/test/unit/__probe__.test.ts',
      'expect(traditionWinRate).toBeGreaterThan(400);\n',
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]?.text).toContain('tradition');
  });

  it('catches a balance claim naming a shipped tradition by id', () => {
    const claims = balanceClaims(
      'packages/rules-magic/test/unit/__probe__.test.ts',
      "expect(winRateOf('vancian-memorization')).toBeGreaterThan(400);\n",
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]?.text).toContain('vancian');
  });

  it('catches balance claims over nodes, primitives and the grid', () => {
    for (const [source, subject] of [
      ['expect(nodeSnowball).toBeLessThan(200);\n', 'node'],
      ['expect(primitiveStacking.balanced).toBe(true);\n', 'primitive'],
      ['expect(gridFairnessIndex).toBeLessThan(350);\n', 'grid'],
      ["expect(cellWinRate('perdo-mentem')).toBe(512);\n", 'cell'],
    ] as const) {
      const claims = balanceClaims('packages/rules-magic/test/unit/__probe__.test.ts', source);
      expect(claims, subject).toHaveLength(1);
      expect(claims[0]?.text).toContain(subject);
    }
  });

  it('reads the §7 metric names out of the document rather than a copy', () => {
    // If this list ever parses to nothing the exemption below silently stops
    // exempting anything and the harness suite fails for a reason nobody would
    // connect to a table format change.
    //
    // The two names are held in a variable rather than written inside the
    // `expect()` for the reason this whole file is about: the scan reads its own
    // source, and an assertion literally containing `winRateByPrimitive` in a
    // rules package is — correctly — a balance claim about a primitive. The
    // check catching its own control is the failure mode the opening note
    // warns about, and the indirection is how every other control here avoids it.
    const namesTheExemptionDependsOn = ['winRateByPrimitive', 'timeToTierBySpecies'];
    expect(
      namesTheExemptionDependsOn.filter((id) => !SECTION_7_METRIC_IDS.includes(id)),
    ).toEqual([]);
    expect(SECTION_7_METRIC_IDS.length).toBeGreaterThanOrEqual(12);
  });

  it('treats a §7 metric name as a claim outside the measurement package', () => {
    // The hole the exemption could have opened: a rules package laundering a
    // balance claim through a §7 metric name. It stays shut.
    const claims = balanceClaims(
      'packages/rules-magic/test/unit/__probe__.test.ts',
      'expect(winRateByPrimitive).toBeGreaterThan(400);\n',
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]?.text).toContain('primitive');
  });

  it('permits the measurement package to name the metrics it registers', () => {
    // What the harness's own tests say about those names: not a number, an
    // absence. Forbidding this would forbid 0.5.0 from being implemented.
    const claims = balanceClaims(
      'packages/mc-harness/test/unit/__probe__.test.ts',
      [
        "expect(collectWinRateByPrimitive(arm())).toMatchObject({ reason: 'mechanic-absent' });",
        "expect(entries['worshipSnowball']).toMatchObject({ status: 'unavailable' });",
        'expect(collectTimeToTierBySpecies(telemetry()).status).toBe(“censored”);',
      ]
        .join('\n')
        .replace(/[“”]/gu, "'"),
      { metricNamesAreSubjectsUnderTest: true },
    );
    expect(claims).toEqual([]);
  });

  it('still catches a real balance claim inside the measurement package', () => {
    // The exemption is one identifier wide, not one package wide. A harness test
    // asserting that dwarves win often enough is still a pre-0.5.0 claim.
    const claims = balanceClaims(
      'packages/mc-harness/test/unit/__probe__.test.ts',
      "expect(winRateOf('dwarf')).toBeGreaterThan(400);\n",
      { metricNamesAreSubjectsUnderTest: true },
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]?.text).toContain('dwarf');
  });

  it('permits a tradition differentiation assertion, which is the 0.3.0 claim', () => {
    // The positive control for the widening, and the one that matters most:
    // 0.3.0's release claim *is* that each tradition changes measurable
    // behaviour. A check that also rejected its own release's evidence would be
    // reverted rather than fixed.
    const claims = balanceClaims(
      'packages/rules-magic/test/unit/__probe__.test.ts',
      [
        'expect(outcomes.get(left)).not.toEqual(outcomes.get(right));',
        'expect(traditionOutcome.researchCost).toBeGreaterThan(other.researchCost);',
        'expect(new Set(nodeTiers).size).toBeGreaterThan(1);',
      ].join('\n'),
    );
    expect(claims).toEqual([]);
  });

  it('permits the differentiation assertion 0.4.0 is allowed to make', () => {
    // The positive control, and the one that matters most: the 0.4.0 release
    // claim *is* that species differ measurably. A check that also rejected
    // this would forbid the release's own evidence.
    const claims = balanceClaims(
      'packages/rules-world/test/unit/__probe__.test.ts',
      [
        "expect(timeToTier('gnome')).not.toBe(timeToTier('orc'));",
        'expect(new Set(speciesValues).size).toBeGreaterThan(1);',
      ].join('\n'),
    );
    expect(claims).toEqual([]);
  });

  it("permits an assertion whose failure message explains the balance rule", () => {
    // The control for the message exclusion. Both conformance checks in this
    // package explain, in the message a reader sees on failure, that species
    // magnitudes are untuned and unbalanced — and without this exclusion the
    // check reported both of them as balance claims about species.
    const claims = balanceClaims(
      'packages/rules-world/test/unit/__probe__.test.ts',
      "expect(values, 'no species magnitude is balanced before 0.5.0').toEqual([]);\n",
    );
    expect(claims).toEqual([]);
  });

  it('still reads the actual value when a message is present', () => {
    const claims = balanceClaims(
      'packages/rules-world/test/unit/__probe__.test.ts',
      "expect(speciesWinRate, 'a harmless note').toBe(512);\n",
    );
    expect(claims).toHaveLength(1);
  });

  it('permits balance vocabulary that is not an assertion about species', () => {
    // The repository is full of it — diagnostics and messages explaining what a
    // committed balance baseline is. Only the co-occurrence inside one
    // assertion is a claim.
    const claims = balanceClaims(
      'packages/rules-world/test/unit/__probe__.test.ts',
      [
        "expect(problems[0]).toContain('balance baseline');",
        'expect(speciesIds).toHaveLength(6);',
      ].join('\n'),
    );
    expect(claims).toEqual([]);
  });
});
