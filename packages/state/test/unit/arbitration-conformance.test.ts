/*
 * Multiverse Mages — the conformance check that ruleset arbitration is
 * computed in exactly one place.
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
 * `state-schema`, *"No consumer reimplements arbitration"*: **WHEN** any package
 * evaluates technique or form bitmasks directly instead of calling `permits`,
 * **THEN** the conformance check fails and names the file. This is that check.
 *
 * It is also the measurement behind a **release claim**. `release-plan.md` for
 * `0.2.0` says:
 *
 * > **Claim:** Ruleset legality is computed in exactly one place.
 * > *Disproved by:* the conformance check finding any direct technique/form
 * > bitmask evaluation outside `permits()`. Expected count: zero.
 * > *Collected:* **yes**.
 *
 * "Collected: yes" was not true until this file existed. A claim whose disproof
 * condition names a check nobody wrote is a claim nothing could falsify, which
 * is the failure mode `release-plan.md` is otherwise built to prevent.
 *
 * ## Why it lives in `@mm/state`'s suite
 *
 * It is a workspace-level check, so it has no package of its own — the same
 * problem `module-boundaries.test.ts` records in `packages/sim-core/test/unit/`,
 * and the same resolution: put it with the code whose contract it is. The rule
 * here is about `permits()`, `permits()` lives in `packages/state/src/`, and the
 * `permitted*` bitmask fields are declared in `packages/state/src/components.ts`.
 * A reader who changes either of those is already in this package's tests. That
 * is a stronger tie than `module-boundaries` could claim for itself, so the
 * precedent is followed rather than merely cited.
 *
 * ## The rule is about cells, not about bitmasks
 *
 * The naive reading — *nothing outside `permits.ts` may touch
 * `permittedTechniques` or `permittedForms`* — is wrong, and enforcing it would
 * break two correct call sites. `contracts.md` §1.1 defines arbitration as a
 * question about **a cell**:
 *
 * ```
 * permits(universe, cellId) =
 *     if edicts contains (cellId, interdiction) -> false
 *     if edicts contains (cellId, dispensation) -> true
 *     else techniqueBit(cellId) ∈ permittedTechniques AND formBit(cellId) ∈ permittedForms
 * ```
 *
 * The danger the rule guards against is a *second implementation of that
 * precedence*: an axis test that forgets edicts, so the client greys out a cell
 * the server would allow. Edicts are the part that gets forgotten, and they are
 * only in scope once a cell is.
 *
 * So the operational rule is:
 *
 * > A bitwise evaluation of `permittedTechniques` or `permittedForms` is a
 * > violation when the expression is **cell-scoped** — when the value it tests
 * > against reaches a cell — and only `packages/state/src/permits.ts` may
 * > contain one. An **axis-scoped** evaluation, one that reaches no cell, is
 * > permitted anywhere.
 *
 * "Reaches a cell" is decided mechanically: the identifiers inside the bitwise
 * expression, followed through local `const`/`let` aliases in the enclosing
 * function, contain a name matching `/cell/i` or one of the state package's
 * cell→axis helpers ({@link CELL_TO_AXIS_HELPERS}). Bare *mentions* of the
 * fields are not evaluations and never fire: `components.ts` declares them and
 * `universe.ts` copies them into a snapshot, neither of which decides anything.
 *
 * ## The two real axis-scoped sites, and why they are not violations
 *
 * The coverage audit that commissioned this check named one; there are two, and
 * both are in `@mm/agent-api`.
 *
 * 1. **`mask.ts` — axis saturation.** `(record.permittedTechniques &
 *    techniqueMask) === techniqueMask` asks *"is every technique already
 *    permitted?"*, to decide whether action 1 has anything left to do. Routing
 *    this through `permits()` would be **wrong, not merely awkward**, because
 *    `permits()` folds edicts in: a universe with every technique forbidden but
 *    one live dispensation has `permits()` returning `true` for that cell while
 *    *"permit a technique"* must obviously still be legal. Saturation is a
 *    question about the raw axis by definition, and there is no cell it could be
 *    asked about.
 * 2. **`observation.ts` — the ruleset block projection.** §4.1 pins that block's
 *    contents as *"technique bits, form bits, 8 edict slots (cellId, kind)"* —
 *    bits and edicts occupy **separate** slots, and the RL agent is handed both
 *    so it can learn the precedence itself. Projecting the bits through
 *    `permits()` would fold the edicts into the bit slots *and* leave them in
 *    their own, changing an exported observation contract that §4.1 calls a
 *    contract precisely because every trained policy depends on it.
 *
 * Neither is an arbitration decision, and neither could be expressed through
 * `permits()` without changing what it means. So they stay, and the check
 * describes the shape that makes them different rather than naming their files
 * — a future author gets a rule to satisfy, not an exemption list to append to.
 *
 * ## What this cannot see
 *
 * A determined author can defeat the cell-scope test by renaming `cellId` to
 * `c`, or by reimplementing bit extraction with division instead of shifts.
 * That is accepted: a conformance check catches **drift**, not an adversary,
 * and the shapes it does catch are the shapes a reimplementation is actually
 * written in. Where it can, it fails closed — the classifier is exercised
 * against `permits.ts` itself below, so a classifier that quietly stopped
 * recognising arbitration fails rather than passing everything.
 *
 * `test/` is deliberately outside the scan. `permits.test.ts` legitimately
 * asserts bit arithmetic against hand-computed expectations, and *this file*
 * contains synthetic violations as string literals for its own controls —
 * scanning tests would report both as reimplementations.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** From packages/state/test/unit/ up to the repository root. */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * The one file permitted to arbitrate a cell. Written as a path because the
 * whole claim is "in exactly one place", and a place is a path.
 */
const ARBITRATION_HOME = 'packages/state/src/permits.ts';

/** The `contracts.md` §1.1 bitmask fields, by their §1.1 names. */
const AXIS_MASK_FIELDS = new Set(['permittedTechniques', 'permittedForms']);

/**
 * `@mm/state`'s cell→axis helpers. Their presence in a bitmask expression is
 * proof a cell is being resolved to a bit, which is the arbitration shape.
 * `permits` and `isCellId` are here too: a bitwise expression that has already
 * called `permits` and then re-derives the axis bits is exactly the "second
 * opinion" this rule forbids.
 */
const CELL_TO_AXIS_HELPERS = new Set([
  'techniqueBitOf',
  'formBitOf',
  'cellAxesOf',
  'cellIdAt',
  'isCellId',
  'permits',
]);

/**
 * Names that indicate a cell is in the expression.
 *
 * Substring, not exact: the value arrives under many names — `cellId`, `cell`,
 * `targetCell`, `cellIds[i]` — and a rule that only knew one of them would be
 * satisfied by a rename that changed nothing about the code's meaning.
 */
const CELL_NAME = /cell/iu;

/** Every operator that reads a number as a bit pattern. */
const BITWISE_OPERATORS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.AmpersandToken,
  ts.SyntaxKind.BarToken,
  ts.SyntaxKind.CaretToken,
  ts.SyntaxKind.LessThanLessThanToken,
  ts.SyntaxKind.GreaterThanGreaterThanToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
]);

/** One bitwise evaluation of an axis mask, classified. */
export interface ArbitrationSite {
  /** Repo-relative, for the failure message the spec requires to name the file. */
  readonly path: string;
  /** 1-based, so it can be pasted into an editor. */
  readonly line: number;
  /** The expression as written, collapsed to one line. */
  readonly text: string;
  /** True when the expression reaches a cell — i.e. it arbitrates. */
  readonly cellScoped: boolean;
  /** The cell-derived names that decided it. Empty when axis-scoped. */
  readonly cellNames: readonly string[];
}

/** Bitwise binary operators, and `~`. */
function isBitwiseEvaluation(node: ts.Node): boolean {
  if (ts.isBinaryExpression(node)) return BITWISE_OPERATORS.has(node.operatorToken.kind);
  return ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.TildeToken;
}

/**
 * Every identifier-ish name inside a subtree.
 *
 * String literals are included because `record['permittedTechniques']` and
 * `record.permittedTechniques` are the same read, and a check that saw only the
 * dotted form would be defeated by a formatter preference.
 */
function namesIn(node: ts.Node): string[] {
  const names: string[] = [];
  const walk = (current: ts.Node): void => {
    if (ts.isIdentifier(current) || ts.isPrivateIdentifier(current)) names.push(current.text);
    else if (ts.isStringLiteralLike(current)) names.push(current.text);
    ts.forEachChild(current, walk);
  };
  walk(node);
  return names;
}

/** Whether a subtree reads one of the §1.1 axis bitmask fields at all. */
function readsAxisMask(node: ts.Node): boolean {
  return namesIn(node).some((name) => AXIS_MASK_FIELDS.has(name));
}

/** The function-ish node a site sits in, or the file when it sits at top level. */
function enclosingScope(node: ts.Node): ts.Node {
  let current: ts.Node | undefined = node.parent;
  while (current !== undefined) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isConstructorDeclaration(current) ||
      ts.isGetAccessor(current) ||
      ts.isSetAccessor(current) ||
      ts.isSourceFile(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return node.getSourceFile();
}

/**
 * Local `const`/`let`/`var` initializers in a scope, by declared name.
 *
 * This is what lets the check see through the alias in
 * `const techniqueMask = (1 << GRID_TECHNIQUE_COUNT) - 1;` — and equally through
 * `const bit = techniqueBitOf(cellId);`, which is the same code as the
 * arbitration formula with a variable in the middle. Without it, one extracted
 * local would hide a reimplementation.
 */
function localInitializers(scope: ts.Node): Map<string, ts.Node> {
  const initializers = new Map<string, ts.Node>();
  const walk = (current: ts.Node): void => {
    if (
      ts.isVariableDeclaration(current) &&
      ts.isIdentifier(current.name) &&
      current.initializer !== undefined
    ) {
      initializers.set(current.name.text, current.initializer);
    }
    ts.forEachChild(current, walk);
  };
  ts.forEachChild(scope, walk);
  return initializers;
}

/**
 * The cell-derived names a bitwise expression reaches, following local aliases.
 *
 * A worklist rather than a fixed number of hops, with a `seen` set so a
 * self-referential or mutually-referential pair of locals terminates instead of
 * spinning. Depth is not the interesting variable — reachability is.
 */
function cellNamesReachedBy(site: ts.Node, scope: ts.Node): string[] {
  const initializers = localInitializers(scope);
  const seen = new Set<string>();
  const queue = namesIn(site);
  const found = new Set<string>();

  while (queue.length > 0) {
    const name = queue.pop() as string;
    if (seen.has(name)) continue;
    seen.add(name);
    if (CELL_NAME.test(name) || CELL_TO_AXIS_HELPERS.has(name)) found.add(name);
    const initializer = initializers.get(name);
    if (initializer !== undefined) queue.push(...namesIn(initializer));
  }

  return [...found].sort();
}

/**
 * Every classified axis-mask evaluation in one file.
 *
 * Only the **outermost** bitwise expression containing a read is recorded.
 * `(a & (1 << b)) !== 0` would otherwise be reported twice, and the inner report
 * would have a smaller expression to classify — so the nested one could come out
 * axis-scoped while the real expression around it was not.
 *
 * Exported so the controls below can feed it synthetic source. A checker that
 * can only be run against the real tree is a checker whose behaviour on a
 * violation nobody has observed.
 */
export function arbitrationSitesOf(path: string, source: string): ArbitrationSite[] {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const sites: ArbitrationSite[] = [];

  const visit = (node: ts.Node, insideSite: boolean): void => {
    let nowInside = insideSite;
    if (!insideSite && isBitwiseEvaluation(node) && readsAxisMask(node)) {
      const cellNames = cellNamesReachedBy(node, enclosingScope(node));
      const { line } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
      sites.push({
        path,
        line: line + 1,
        text: node.getText(parsed).replace(/\s+/gu, ' '),
        cellScoped: cellNames.length > 0,
        cellNames,
      });
      nowInside = true;
    }
    ts.forEachChild(node, (child) => {
      visit(child, nowInside);
    });
  };

  visit(parsed, false);
  return sites;
}

/**
 * Every way the observed sites break the single-arbitration rule.
 *
 * A list rather than a throw on the first, for `module-boundaries.test.ts`'s
 * reason: a check that reports one site per run turns a change that added three
 * into three CI cycles, and the third is where somebody deletes the check.
 */
export function arbitrationViolations(sites: readonly ArbitrationSite[]): string[] {
  return sites
    .filter((site) => site.cellScoped && site.path !== ARBITRATION_HOME)
    .map(
      (site) =>
        `${site.path}:${String(site.line)} evaluates a technique/form bitmask against a cell — ` +
        `\`${site.text}\`, reaching ${site.cellNames.join(', ')}. contracts.md §1.1 gives ` +
        `ruleset legality exactly one implementation, in ${ARBITRATION_HOME}, and this is a ` +
        'second one. It will not have the edict precedence — interdiction beats dispensation, ' +
        'both beat the axis bits — because that is the part every reimplementation forgets, and ' +
        'the symptom is a client greying out a cell the server would allow. Call permits().',
    )
    .sort();
}

// ---------------------------------------------------------------------------
// Reading the real workspace.
// ---------------------------------------------------------------------------

function listTypeScript(dir: string): string[] {
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
    if (statSync(full).isDirectory()) found.push(...listTypeScript(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) found.push(full);
  }
  return found;
}

/** Every `packages/*&#47;src` TypeScript file, repo-relative path and text. */
function scanWorkspaceSource(): { path: string; source: string }[] {
  const packagesDir = join(repoRoot, 'packages');
  const files: { path: string; source: string }[] = [];
  for (const pkg of readdirSync(packagesDir).sort()) {
    if (!statSync(join(packagesDir, pkg)).isDirectory()) continue;
    for (const full of listTypeScript(join(packagesDir, pkg, 'src'))) {
      files.push({
        path: relative(repoRoot, full).split(sep).join('/'),
        source: readFileSync(full, 'utf8'),
      });
    }
  }
  return files;
}

const sourceFiles = scanWorkspaceSource();
const workspaceSites = sourceFiles.flatMap((file) => arbitrationSitesOf(file.path, file.source));

describe('ruleset legality is computed in exactly one place', () => {
  it('found source and arbitration sites to analyse, so the assertion is not vacuous', () => {
    // The assertion below is "no violations". If the scan returned nothing — a
    // moved directory, a renamed field, a classifier that silently matches
    // nothing — it would pass while checking nothing at all.
    expect(sourceFiles.length).toBeGreaterThan(20);
    expect(sourceFiles.map((file) => file.path)).toContain(ARBITRATION_HOME);
    expect(workspaceSites.length).toBeGreaterThanOrEqual(3);
  });

  it('still recognises arbitration when it sees it, in permits() itself', () => {
    // The positive control against real code, and the reason the check cannot
    // rot into "everything is axis-scoped". permits() is the one true
    // arbitration site; if the classifier stops calling it cell-scoped, it has
    // stopped being able to recognise a reimplementation either.
    const home = workspaceSites.filter((site) => site.path === ARBITRATION_HOME);
    expect(home.length).toBeGreaterThanOrEqual(2); // one per axis
    for (const site of home) {
      expect(site.cellScoped).toBe(true);
    }
    expect(home.flatMap((site) => site.cellNames)).toContain('cellId');
  });

  it('finds no direct technique/form bitmask evaluation outside permits()', () => {
    // The 0.2.0 release claim, as a number. Expected count: zero.
    expect(arbitrationViolations(workspaceSites)).toEqual([]);
  });

  it('records the axis-scoped readers that are legitimately outside permits()', () => {
    // Not a rule, a ledger. Every site the check clears is listed here, so
    // clearing a *new* one is a visible diff in review rather than a silent
    // pass. If this fails because a site was added or removed, read the header:
    // the question is whether the new expression asks about an axis or about a
    // cell.
    const cleared = workspaceSites
      .filter((site) => !site.cellScoped)
      .map((site) => site.path)
      .sort();
    expect([...new Set(cleared)]).toEqual([
      'packages/agent-api/src/mask.ts',
      'packages/agent-api/src/observation.ts',
    ]);
  });
});

describe('the arbitration check would catch a reimplementation', () => {
  // Without these, "no violations found" is indistinguishable from "the checker
  // returns an empty array for every input".

  const probe = 'packages/rules-magic/src/probe.ts';

  it('catches the §1.1 formula transcribed into another package', () => {
    const sites = arbitrationSitesOf(
      probe,
      [
        'import { formBitOf, techniqueBitOf } from "@mm/state";',
        'export function castable(ruleset: Ruleset, cellId: number): boolean {',
        '  const technique = (ruleset.permittedTechniques & (1 << techniqueBitOf(cellId))) !== 0;',
        '  const form = (ruleset.permittedForms & (1 << formBitOf(cellId))) !== 0;',
        '  return technique && form;',
        '}',
      ].join('\n'),
    );
    const problems = arbitrationViolations(sites);
    expect(problems).toHaveLength(2);
    for (const problem of problems) {
      // "the conformance check fails and names the file" — state-schema spec.
      expect(problem).toContain(probe);
      expect(problem).toContain('permits()');
    }
    // Both axes, each named by the expression it appears in — a check that
    // reported the technique test and stopped would leave half a
    // reimplementation in place.
    expect(problems.join('\n')).toContain('permittedTechniques');
    expect(problems.join('\n')).toContain('permittedForms');
  });

  it('catches it when the cell bit is extracted into a local first', () => {
    // The alias hop. Without following local initializers, this reads as an
    // anonymous `bit` and comes out axis-scoped — which is how a reimplementation
    // survives a check that only looks at one expression.
    const sites = arbitrationSitesOf(
      probe,
      [
        'export function legal(ruleset: Ruleset, cellId: number): boolean {',
        '  const bit = techniqueBitOf(cellId);',
        '  return (ruleset.permittedTechniques & (1 << bit)) !== 0;',
        '}',
      ].join('\n'),
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]?.cellScoped).toBe(true);
    expect(arbitrationViolations(sites)).toHaveLength(1);
  });

  it('catches a shift-and-test written without a mask constant', () => {
    const sites = arbitrationSitesOf(
      probe,
      [
        'export function legal(ruleset: Ruleset, targetCell: number): number {',
        '  return (ruleset.permittedForms >> formBitOf(targetCell)) & 1;',
        '}',
      ].join('\n'),
    );
    expect(arbitrationViolations(sites)).toHaveLength(1);
    expect(sites[0]?.cellNames).toEqual(['formBitOf', 'targetCell']);
  });

  it('reports one site per expression, not one per nested operator', () => {
    // The outermost-only rule. `(a & (1 << b)) !== 0` holds two bitwise
    // operators; two reports would be noise, and worse, the inner one is
    // classified against a smaller expression than the code actually evaluates.
    const sites = arbitrationSitesOf(
      probe,
      'export const ok = (r.permittedForms & (1 << formBitOf(cellId))) !== 0;\n',
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]?.line).toBe(1);
  });

  it('does not fire on the same file when the cell is taken out of it', () => {
    // The pair of the test above: identical shape, no cell. If this were also
    // reported, the check would be rejecting every bitmask read and its green
    // runs would prove nothing about arbitration specifically.
    const sites = arbitrationSitesOf(
      probe,
      'export const ok = (r.permittedForms & (1 << formBit)) !== 0;\n',
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]?.cellScoped).toBe(false);
    expect(arbitrationViolations(sites)).toEqual([]);
  });
});

describe('the axis-scoped shapes stay legal wherever they appear', () => {
  // The positive controls. A checker that rejected every bitmask evaluation
  // would pass every negative assertion above and would also forbid the two
  // things §4.1 and §4.2 require agent-api to do. These are written as source
  // rather than asserted about the real files so they keep meaning something if
  // agent-api is refactored.

  const probe = 'packages/agent-api/src/probe.ts';

  it('permits axis saturation — "is there a technique left to permit?"', () => {
    const sites = arbitrationSitesOf(
      probe,
      [
        'export function maskOf(record: UniverseRecord): number {',
        '  const techniqueMask = (1 << GRID_TECHNIQUE_COUNT) - 1;',
        '  return (record.permittedTechniques & techniqueMask) === techniqueMask ? 0 : 1;',
        '}',
      ].join('\n'),
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]?.cellScoped).toBe(false);
    expect(arbitrationViolations(sites)).toEqual([]);
  });

  it('permits projecting the whole axis bit by bit, as §4.1 pins the observation', () => {
    const sites = arbitrationSitesOf(
      probe,
      [
        'export function writeRuleset(view: Int32Array, record: UniverseRecord): void {',
        '  for (let bit = 0; bit < GRID_TECHNIQUE_COUNT; bit += 1) {',
        '    view[bit] = (record.permittedTechniques & (1 << bit)) === 0 ? 0 : 1;',
        '  }',
        '}',
      ].join('\n'),
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]?.cellScoped).toBe(false);
    expect(arbitrationViolations(sites)).toEqual([]);
  });

  it('permits mentioning the fields without evaluating them', () => {
    // captureRuleset copies both into a snapshot, and components.ts declares
    // them. Neither decides anything, and a check that fired on a mention would
    // make the schema unwritable.
    const sites = arbitrationSitesOf(
      'packages/state/src/probe.ts',
      [
        'export function capture(record: UniverseRecord): Ruleset {',
        '  return {',
        '    permittedTechniques: record.permittedTechniques,',
        '    permittedForms: record.permittedForms,',
        '    edicts: readEdicts(state),',
        '  };',
        '}',
      ].join('\n'),
    );
    expect(sites).toEqual([]);
  });
});

describe('the scanner reads real syntax, not text that looks like it', () => {
  it('ignores an evaluation that is only the text of an evaluation', () => {
    // This test file is full of synthetic violations written as string
    // literals, and so is the workspace-scanning machinery above. A regex-based
    // check would report every one of them.
    const sites = arbitrationSitesOf(
      'packages/rules-world/src/probe.ts',
      [
        'const probe = `(r.permittedForms & (1 << formBitOf(cellId))) !== 0`;',
        '// (r.permittedTechniques & (1 << techniqueBitOf(cellId))) !== 0',
        '/* (r.permittedForms & 1) */',
        'export { probe };',
      ].join('\n'),
    );
    expect(sites).toEqual([]);
  });

  it('sees a bracketed field read as the same read as a dotted one', () => {
    const sites = arbitrationSitesOf(
      'packages/rules-world/src/probe.ts',
      'export const ok = (r["permittedTechniques"] & (1 << techniqueBitOf(cellId))) !== 0;\n',
    );
    expect(arbitrationViolations(sites)).toHaveLength(1);
  });
});
