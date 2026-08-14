#!/usr/bin/env node
/*
 * Multiverse Mages — the reachability check: which rules-path symbols the
 * production code actually calls.
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
 * ## The question, and why it is the right one
 *
 * `check:coverage` asks who *authored* a primitive. `check:consumption` asks
 * whether what the academics know can *move* one. Both are questions about
 * content. **Nothing asked the same question about code**, and the campaign
 * record (`docs/design/campaign-plan.md`, W85) is what that cost:
 *
 * > `advanceConstruction` — definition only, no production caller. So
 * > `BUILD_PROGRESS_PER_LABOR_MONTH`, `MATERIALS_PER_LABOR_MONTH`,
 * > `laborAffinity` and the entire `build-rate` primitive have no simulation
 * > path.
 *
 * Three subsystems were built, tested, exported, documented in prose, named in
 * a design doc — and never invoked. The general lesson recorded there is the
 * one this script mechanises:
 *
 * > **"The symbol exists" and "a test covers it" are both compatible with
 * > "the game never runs it."**
 *
 * So this check asks, for every exported value in the rules path:
 *
 * > Does any code that is not a test call this?
 *
 * A `no` is not automatically a defect. It is automatically a **claim someone
 * has to make**: either this is staged ahead of its consumer, or it is public
 * API consumed from outside this repository, or the simulation is missing a
 * mechanic it looks like it has. The check's job is to force one of those three
 * sentences to be written down, because the third one is invisible otherwise —
 * a mechanic that is implemented and not in the game reads as *done* to anyone
 * grepping for the symbol and does nothing at all to anyone playing.
 *
 * ## Why the TypeScript AST, and not grep
 *
 * This repository's doc culture is the reason. Comments here name symbols
 * constantly and argumentatively: `world-step.ts` discussed `advanceConstruction`
 * in prose *before* anything called it, `capital.ts` still discusses
 * `applyLibraryUpkeep` in three separate module notes, and `strategies.ts`
 * quotes the W85 finding inside a **string literal**. A grep for
 * `advanceConstruction` returns callers, comments and quoted findings without
 * distinguishing them, and would have reported the flagship defect as reached.
 *
 * A check a docstring can satisfy is not a check. So every file is parsed and
 * only identifiers in **value positions** count. Comments never do. String
 * literals never do. This is the same argument `consumption.ts` makes about
 * `ward` matching *toward* and *forward*, one level up: there the noise is
 * substrings, here it is prose.
 *
 * Three further exclusions follow from the same principle, and each is a
 * position in which a name appears without anything running:
 *
 * - **Import and re-export specifiers.** `export { worldSystem } from
 *   './world-step.js'` moves a name; it does not call it. An index barrel that
 *   counted as a consumer would make every export of every package reachable by
 *   construction, which is the failure mode of every dead-code tool that has
 *   ever been pointed at a monorepo.
 * - **Type positions**, including `typeof X`. `KeysMatch<UniversityStaffRecord,
 *   typeof UNIVERSITY_STAFF>` is a compile-time assertion. It is checked by
 *   `tsc` and it cannot move a number at run time, so it is not a consumer of
 *   `UNIVERSITY_STAFF` in the sense this check means. That distinction is not
 *   academic: it is exactly what made `UNIVERSITY_STAFF` look used.
 * - **The symbol's own body.** A recursive function does not call itself into
 *   existence.
 *
 * What *does* count is a reference from **any other top-level symbol**,
 * including one in the same file. `worldSystem` is called only by
 * `defineWorldSimulation`, thirty lines above it, and that is a real call site.
 * An earlier draft required a cross-file caller and flagged `worldSystem` — the
 * loop of the entire game — as unreached. A check whose loudest finding is
 * false teaches its readers to stop reading it.
 *
 * ## Values, not types
 *
 * Only functions, classes, enums and `const`s are examined. An unused interface
 * is clutter; an unused function is a silent mechanic. All five W85 findings
 * were values, and all five are reproduced by this check on the tree it was
 * written against.
 *
 * ## What this check is not
 *
 * It answers *"does any non-test code call this"*, by name, one hop. It does
 * **not** answer *"does the assembled simulation reach this"* — that is
 * `check:consumption`'s question, and it answers it for primitives by building
 * a real universe rather than by reading source. The two are complementary and
 * neither subsumes the other: this one is cheap, total over the rules path, and
 * blind to a caller that is itself dead beyond one level; that one is exact,
 * anchored on a running composition, and covers fourteen primitives.
 *
 * Name matching without a type checker resolves conservatively: a same-named
 * local in an unrelated file counts as a reference. That errs toward reporting
 * a symbol as **reached**, which is the safe direction — this check under-reports
 * rather than crying wolf, and every finding it does print is one a reader can
 * confirm with a single grep.
 *
 * The declaration table is keyed by name alone for the same reason, and has the
 * same bias: two exports of the same name in different files collide, the later
 * file wins, and one of the two is not examined. It suppresses findings; it
 * cannot manufacture one.
 *
 * ## The three sub-checks, and the holes each was written for
 *
 * 1. **Unreached exported values** — `advanceConstruction`'s shape.
 * 2. **Declared components never read or written** — `UNIVERSITY_STAFF`'s
 *    shape. A component's membership of `WORLD_COMPONENTS` is *registration*,
 *    not a read: it reserves a section in every snapshot and stores exactly
 *    nothing. Counting it would make the sub-check green on the one bug it
 *    exists to catch.
 * 3. **Resolved constants never consumed** — `legacy-archive-max-tier`'s shape.
 *    Every god constant is resolved into a `GodConstants` field by
 *    `god/constants.ts` whether or not anything reads it, so a content author
 *    gets no signal at all. "Consumed" here means *read off the resolved
 *    object*: `worship-max` is checked by the content loader against the sum of
 *    the three class caps and is still reported, because the loader validating
 *    an identity is not the simulation using a number.
 *
 * Sub-check 3 also reports **"consumed only by unreached code"** separately,
 * because `legacy-baseline-favor` is read by `legacyGrant`, and `legacyGrant`
 * has no caller. One level of transitivity, deliberately: it is enough to catch
 * a whole dead mechanism hiding behind its own entry point, and a full fixed
 * point over a package graph whose roots are barrel files would converge on
 * "everything is alive".
 *
 * ## Usage
 *
 *     node scripts/check-reachability.mjs            # this repository
 *     node scripts/check-reachability.mjs <root>     # any directory like it
 *
 * The optional root exists for the reason `check-purity.mjs` gives for its own:
 * with the root hard-coded, the failing branch is unreachable from a test, and
 * a check nobody has watched fail is not a check.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// ---------------------------------------------------------------------------
// Scope.
// ---------------------------------------------------------------------------

/**
 * The packages whose exports are *examined*.
 *
 * `check-purity.mjs`'s pure list plus `scenario`. These are the packages loaded
 * by the client, the server and the Monte Carlo workers alike — the rules path
 * in full — and they are the packages in which "exists but never runs" is a
 * statement about the game rather than about an API.
 */
const RULES_PATH_PACKAGES = [
  'sim-core',
  'content',
  'state',
  'primitives',
  'rules-magic',
  'rules-world',
  'rules-raid',
  'coordination',
  'scenario',
];

/**
 * Packages whose exports are **not** examined, each for a stated reason.
 *
 * Their code still counts as a *consumer*: a call from `mc-harness` into
 * `rules-world` reaches the symbol it calls. What is skipped is asking whether
 * *their own* exports have in-repo callers, because for all four the answer is
 * uninformative — their consumers are outside this repository by design.
 */
const EXCLUDED_PACKAGES = [
  {
    name: 'agent-api',
    reason:
      'contracts.md §4 makes this the observation/action boundary. Its consumers are the ' +
      'Electron client, the authoritative server and the Python RL bridge; an export with no ' +
      'in-repo caller is the normal case, not a finding.',
  },
  {
    name: 'mc-harness',
    reason:
      'The balance instrument. Its entry points are `bin/` scripts and worker processes ' +
      'spawned by path, so static call sites systematically under-count what runs.',
  },
  {
    name: 'server',
    reason:
      'The authoritative PvP server. It is a leaf that speaks a wire protocol; nothing in this ' +
      'repository imports it, and that is the boundary the package exists to be.',
  },
  {
    name: 'gym-bridge',
    reason:
      'The RL bridge. Same shape as `server` — its client is a Python process on the other end ' +
      'of a socket, which no source scan can see.',
  },
];

/**
 * Directory names that never hold production code.
 *
 * `test` is the whole point: a symbol its own tests are the only callers of is
 * precisely the defect this check reports. `dist` would double-count every
 * source file as its own consumer. `bench` is measurement, not simulation.
 */
const NON_PRODUCTION_DIRS = new Set(['test', 'dist', 'bench', 'node_modules', 'fixtures']);

/**
 * Directories under a package that hold production code, in scan order.
 *
 * `bin/` is included because a package's CLI entry point is production: it is
 * how `scenario` and `mc-harness` are actually run. `scripts/` at the repository
 * root is scanned separately for the same reason — `check-primitive-coverage.mjs`
 * is the only caller `checkPrimitiveCoverage` has, and it is a real one.
 */
const PACKAGE_SOURCE_DIRS = ['src', 'bin'];

// ---------------------------------------------------------------------------
// Exclusions. The reason is the deliverable.
// ---------------------------------------------------------------------------

/**
 * Whole *kinds* of symbol that cannot have a run-time consumer by construction.
 *
 * These are rules rather than entries because they describe a shape, not a
 * decision about one symbol, and a rule that names a shape cannot rot into a
 * silencer for an unrelated finding the way a growing allowlist can. Each is
 * matched on the declared name and each states why no caller is expected.
 */
const STRUCTURAL_EXCLUSIONS = [
  {
    id: 'fields-match',
    matches: (name) => name.endsWith('_FIELDS_MATCH'),
    reason:
      'A `KeysMatch<Record, typeof COMPONENT>` assertion. Its consumer is `tsc`: it fails the ' +
      'build if a component spec and its record interface disagree about a field, and it does ' +
      'nothing at run time. One with a caller would be the surprise.',
  },
  {
    id: 'tuning-status',
    matches: (name) => name.endsWith('_TUNING_STATUS'),
    reason:
      "Mirrors `@mm/content`'s `TuningStatus` for a table of magnitudes that release-plan.md " +
      'records as untuned. It is an authored claim about balance provenance, asserted by the ' +
      "table's own tests. It is not an input to anything and must not become one.",
  },
];

/**
 * Individually excluded symbols, each with the argument for excluding it.
 *
 * Deliberately short. Every entry here is a finding this check will never make
 * again, so an entry added to quiet the output is a defect converted into
 * silence — the exact failure `coverage.ts` and `consumption.ts` both warn
 * about in their own exclusion notes. The number of unreached symbols going
 * down is the progress; this list getting longer is not.
 *
 * Both failure directions are checked: an entry naming a symbol that no longer
 * exists fails, and so does an entry whose symbol has since acquired a caller.
 * A one-directional exclusion list passes forever while quietly becoming a lie.
 */
const DECLARED_EXCLUSIONS = [
  {
    symbol: 'FP_SHIFT',
    file: 'packages/sim-core/src/fixed-point/fixed-point.ts',
    reason:
      'The scale exponent that *defines* the 1/1024 fixed point. Production arithmetic uses the ' +
      'derived `FP_ONE`, and it should: shifting by a named constant in the rules path is how a ' +
      'scale error gets written. Both must exist for `1 << FP_SHIFT === FP_ONE` to be a ' +
      'checkable relationship rather than a comment, and that assertion is the symbol\'s job.',
  },
  {
    symbol: 'MigrationRegistry',
    file: 'packages/sim-core/src/snapshot/migrations.ts',
    reason:
      'Snapshot migration machinery, staged ahead of its first consumer on purpose. ' +
      "`SNAPSHOT_VERSION` has never moved — CLAUDE.md records that two world-schema revisions " +
      'were deliberately kept out of it because the version sits inside the hashed header — so ' +
      'there is no migration to register yet. The registry exists so that the first one is a ' +
      'registration rather than a redesign under time pressure.',
  },
];

// ---------------------------------------------------------------------------
// Source discovery.
// ---------------------------------------------------------------------------

/** The repository this script lives in — the no-argument behaviour CI depends on. */
const DEFAULT_ROOT = fileURLToPath(new URL('../', import.meta.url));

function resolveRoot(args) {
  const [root] = args;
  return root === undefined ? DEFAULT_ROOT : root;
}

const REPO_ROOT = resolveRoot(process.argv.slice(2));

/** Every production source file under `dir`, recursively. */
function sourceFilesUnder(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (NON_PRODUCTION_DIRS.has(entry.name)) continue;
      sourceFilesUnder(path, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    if (!/\.(?:ts|mts|cts|mjs|cjs|js)$/.test(entry.name)) continue;
    out.push(path);
  }
  return out;
}

function directoryExists(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

const examinedPackages = RULES_PATH_PACKAGES;
const consumerPackages = [...RULES_PATH_PACKAGES, ...EXCLUDED_PACKAGES.map((entry) => entry.name)];

const missingPackages = examinedPackages.filter(
  (name) => !directoryExists(join(REPO_ROOT, 'packages', name, 'src')),
);
if (missingPackages.length > 0) {
  // Fail rather than silently examine a smaller rules path. A guarded package
  // that vanished is exactly what the guard is for — `check-purity.mjs` takes
  // the same line for the same reason.
  console.error('Reachability check could not find these rules-path packages:\n');
  for (const name of missingPackages) console.error(`  - packages/${name}/src`);
  console.error(`\nLooked under ${REPO_ROOT}.`);
  process.exit(1);
}

const productionFiles = [];
for (const name of consumerPackages) {
  for (const dir of PACKAGE_SOURCE_DIRS) {
    sourceFilesUnder(join(REPO_ROOT, 'packages', name, dir), productionFiles);
  }
}
sourceFilesUnder(join(REPO_ROOT, 'scripts'), productionFiles);

// ---------------------------------------------------------------------------
// Parse, and collect declarations and references.
// ---------------------------------------------------------------------------

/** `name -> { file, kind, line }` for every exported value in any scanned file. */
const declarations = new Map();
/** `name -> Set('<file>::<enclosing top-level symbol>')`. */
const valueReferences = new Map();
/** `propertyName -> Set('<file>::<enclosing top-level symbol>')`. */
const propertyReferences = new Map();
/** `file -> the parsed source`, kept for the sub-checks that re-walk one file. */
const parsedByRelativePath = new Map();

function record(map, key, site) {
  let sites = map.get(key);
  if (sites === undefined) {
    sites = new Set();
    map.set(key, sites);
  }
  sites.add(site);
}

/**
 * True when `node` sits inside a type annotation, a type argument, or a
 * `typeof` query.
 *
 * `typeof X` is the interesting case and it is treated as a *type* position on
 * purpose: it reads a value's type at compile time and emits nothing. See the
 * module note — this is what stopped `UNIVERSITY_STAFF_FIELDS_MATCH` from
 * counting as a read of `UNIVERSITY_STAFF`.
 */
function inTypePosition(node) {
  for (let parent = node.parent; parent !== undefined; parent = parent.parent) {
    if (ts.isSourceFile(parent)) return false;
    if (ts.isTypeQueryNode(parent) || ts.isTypeNode(parent)) return true;
  }
  return false;
}

/** True when `node` is the *name* being declared rather than a use of a name. */
function isDeclarationName(node) {
  const parent = node.parent;
  if (parent === undefined || parent.name !== node) return false;
  return (
    ts.isFunctionDeclaration(parent) ||
    ts.isClassDeclaration(parent) ||
    ts.isVariableDeclaration(parent) ||
    ts.isParameter(parent) ||
    ts.isEnumDeclaration(parent) ||
    ts.isEnumMember(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isInterfaceDeclaration(parent) ||
    ts.isTypeAliasDeclaration(parent) ||
    ts.isModuleDeclaration(parent)
  );
}

function isExported(node) {
  return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
}

/** The top-level symbol a statement belongs to, for attributing its references. */
function enclosingSymbolName(statement) {
  if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) return statement.name.text;
  if (ts.isClassDeclaration(statement) && statement.name !== undefined) return statement.name.text;
  if (ts.isEnumDeclaration(statement)) return statement.name.text;
  if (ts.isVariableStatement(statement)) {
    const first = statement.declarationList.declarations[0];
    if (first !== undefined && ts.isIdentifier(first.name)) return first.name.text;
  }
  // Module-level side-effecting code: an `if`, a loop, a bare call. It is
  // always live, so anything it names is reached.
  return '<module>';
}

for (const file of productionFiles) {
  const text = readFileSync(file, 'utf8');
  const relativePath = relative(REPO_ROOT, file).split(sep).join('/');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  parsedByRelativePath.set(relativePath, source);

  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  for (const statement of source.statements) {
    if (!isExported(statement)) continue;
    if ((ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Ambient) !== 0) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      declarations.set(statement.name.text, {
        file: relativePath,
        kind: 'function',
        line: lineOf(statement.name),
      });
    } else if (ts.isClassDeclaration(statement) && statement.name !== undefined) {
      declarations.set(statement.name.text, {
        file: relativePath,
        kind: 'class',
        line: lineOf(statement.name),
      });
    } else if (ts.isEnumDeclaration(statement)) {
      declarations.set(statement.name.text, {
        file: relativePath,
        kind: 'enum',
        line: lineOf(statement.name),
      });
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        declarations.set(declaration.name.text, {
          file: relativePath,
          kind: 'const',
          line: lineOf(declaration.name),
        });
      }
    }
  }

  const visit = (node, enclosing) => {
    // A name moved by an import or a re-export is not a name called. See the
    // module note: counting a barrel as a consumer makes every export reachable.
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isImportEqualsDeclaration(node)) {
      return;
    }
    const site = `${relativePath}::${enclosing}`;

    if (ts.isPropertyAccessExpression(node)) {
      record(propertyReferences, node.name.text, site);
      visit(node.expression, enclosing);
      return;
    }
    if (ts.isBindingElement(node)) {
      if (node.propertyName !== undefined && ts.isIdentifier(node.propertyName)) {
        record(propertyReferences, node.propertyName.text, site);
      } else if (ts.isIdentifier(node.name) && ts.isObjectBindingPattern(node.parent)) {
        // `const { legacyCap } = constants` reads a property under a name that
        // is also a binding. Both facts are true and the read is the one that
        // matters here.
        record(propertyReferences, node.name.text, site);
      }
    }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      // `{ scribing: 0 }` names a key, not a symbol. Only the value is a use.
      visit(node.initializer, enclosing);
      return;
    }
    if (ts.isIdentifier(node)) {
      if (!isDeclarationName(node) && !inTypePosition(node)) {
        record(valueReferences, node.text, site);
      }
      return;
    }
    node.forEachChild((child) => visit(child, enclosing));
  };

  for (const statement of source.statements) {
    visit(statement, enclosingSymbolName(statement));
  }
}

// ---------------------------------------------------------------------------
// Sub-check 0: whole packages nothing depends on.
// ---------------------------------------------------------------------------

/**
 * A package no other workspace package depends on is one orphan, not N.
 *
 * `consumption.ts` already records this about `@mm/rules-raid`: it holds a
 * complete node-effect consumption path and *"no package depends on
 * @mm/rules-raid"*, so its seven primitive consumers are real code on an
 * orphaned branch of the graph. Enumerating its individual exports would bury
 * every other finding under a package-shaped one, and would say the same thing
 * seven times.
 */
function orphanedPackages() {
  const dependents = new Map(examinedPackages.map((name) => [name, []]));
  for (const name of consumerPackages) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'packages', name, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      const bare = dependency.replace(/^@mm\//, '');
      const list = dependents.get(bare);
      if (list !== undefined && bare !== name) list.push(name);
    }
  }
  const orphans = [];
  for (const [name, list] of dependents) {
    if (list.length > 0) continue;
    // A package with a `bin/` is its own entry point, and `scenario` is the
    // composition root every harness spawns. Neither is orphaned by having no
    // importer.
    if (directoryExists(join(REPO_ROOT, 'packages', name, 'bin'))) continue;
    orphans.push(name);
  }
  return orphans.sort();
}

const orphanPackages = orphanedPackages();
const orphanPackageDirs = orphanPackages.map((name) => `packages/${name}/`);

// ---------------------------------------------------------------------------
// Sub-check 1: exported values with no production caller.
// ---------------------------------------------------------------------------

const examinedDirs = examinedPackages.map((name) => `packages/${name}/src/`);

function isExamined(entry) {
  return examinedDirs.some((dir) => entry.file.startsWith(dir));
}

/** Call sites of `name`, excluding the symbol's own body. */
function callersOf(name, entry) {
  const sites = valueReferences.get(name) ?? new Set();
  return [...sites].filter((site) => site !== `${entry.file}::${name}`);
}

const structuralReasonFor = (name) => STRUCTURAL_EXCLUSIONS.find((rule) => rule.matches(name));
const declaredExclusionFor = (name) => DECLARED_EXCLUSIONS.find((entry) => entry.symbol === name);

const examinedSymbols = [...declarations].filter(([, entry]) => isExamined(entry));

const unreached = [];
const structurallyExcluded = [];
for (const [name, entry] of examinedSymbols) {
  if (callersOf(name, entry).length > 0) continue;
  if (orphanPackageDirs.some((dir) => entry.file.startsWith(dir))) continue;
  const structural = structuralReasonFor(name);
  if (structural !== undefined) {
    structurallyExcluded.push({ name, ...entry, rule: structural.id });
    continue;
  }
  if (declaredExclusionFor(name) !== undefined) continue;
  unreached.push({ name, ...entry });
}

const unreachedNames = new Set(unreached.map((entry) => entry.name));

/** Symbols whose only callers are themselves unreached. One level, on purpose. */
const reachedOnlyByUnreached = [];
for (const [name, entry] of examinedSymbols) {
  if (unreachedNames.has(name)) continue;
  if (orphanPackageDirs.some((dir) => entry.file.startsWith(dir))) continue;
  if (structuralReasonFor(name) !== undefined || declaredExclusionFor(name) !== undefined) continue;
  const callers = callersOf(name, entry);
  if (callers.length === 0) continue;
  const callerNames = [...new Set(callers.map((site) => site.split('::')[1]))];
  if (callerNames.every((caller) => unreachedNames.has(caller))) {
    reachedOnlyByUnreached.push({ name, ...entry, via: callerNames.sort() });
  }
}

// ---------------------------------------------------------------------------
// Sub-check 2: components declared and never read or written.
// ---------------------------------------------------------------------------

/**
 * Lists whose membership is *registration*, not use.
 *
 * A component in `WORLD_COMPONENTS` gets a section in every snapshot and a
 * layout in the schema. It does not get a single read or write. `UNIVERSITY_STAFF`
 * sat in that list for the whole of `mages-and-species` while every university
 * drew from one global scribe pool, and any check that counted the list as a
 * consumer would have reported it green.
 */
const COMPONENT_REGISTRY_LISTS = new Set(['WORLD_COMPONENTS', 'ENGAGEMENT_COMPONENTS']);
const COMPONENTS_FILE = 'packages/state/src/components.ts';

function declaredComponents() {
  const source = parsedByRelativePath.get(COMPONENTS_FILE);
  if (source === undefined) return [];
  const found = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue;
      const initializer = declaration.initializer;
      if (!ts.isSatisfiesExpression(initializer) && !ts.isAsExpression(initializer)) continue;
      if (!/satisfies\s+ComponentSpec/.test(initializer.getText(source))) continue;
      found.push({
        name: declaration.name.text,
        line: source.getLineAndCharacterOfPosition(declaration.name.getStart(source)).line + 1,
      });
    }
  }
  return found;
}

const untouchedComponents = [];
for (const component of declaredComponents()) {
  const sites = [...(valueReferences.get(component.name) ?? new Set())].filter((site) => {
    const enclosing = site.split('::')[1];
    return !COMPONENT_REGISTRY_LISTS.has(enclosing) && enclosing !== component.name;
  });
  if (sites.length === 0) untouchedComponents.push(component);
}

// ---------------------------------------------------------------------------
// Sub-check 3: god constants resolved and never consumed.
// ---------------------------------------------------------------------------

const CONSTANTS_FILE = 'packages/coordination/src/god/constants.ts';

/**
 * `{ legacyCap: value('legacy-cap') }` — the authored id and the field it
 * becomes.
 *
 * Read from the resolver rather than from the content schema because the
 * resolver is where the promise is made: a constant listed in
 * `REQUIRED_GOD_CONSTANTS` and resolved here looks, to a content author, like a
 * knob. The check is whether anything turns it.
 */
function resolvedConstants() {
  const source = parsedByRelativePath.get(CONSTANTS_FILE);
  if (source === undefined) return [];
  const found = [];
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.arguments.length > 0
    ) {
      const argument = node.initializer.arguments[0];
      if (ts.isStringLiteral(argument)) {
        found.push({
          field: node.name.text,
          id: argument.text,
          line: source.getLineAndCharacterOfPosition(node.name.getStart(source)).line + 1,
        });
      }
    }
    node.forEachChild(visit);
  };
  source.forEachChild(visit);
  return found;
}

const unconsumedConstants = [];
const constantsBehindDeadCode = [];
for (const constant of resolvedConstants()) {
  const sites = [...(propertyReferences.get(constant.field) ?? new Set())].filter(
    (site) => !site.startsWith(`${CONSTANTS_FILE}::`),
  );
  if (sites.length === 0) {
    unconsumedConstants.push(constant);
    continue;
  }
  const readers = [...new Set(sites.map((site) => site.split('::')[1]))].sort();
  if (readers.every((reader) => unreachedNames.has(reader))) {
    constantsBehindDeadCode.push({ ...constant, via: readers });
  }
}

// ---------------------------------------------------------------------------
// Exclusion hygiene: both failure directions.
// ---------------------------------------------------------------------------

const staleExclusions = [];
const closedExclusions = [];
/**
 * The exclusion list is a claim about *this* repository's source, so it is only
 * audited when the check is pointed at this repository.
 *
 * Against an arbitrary root — a temporary tree in a test, another checkout laid
 * out the same way — every entry would read as stale, because the files it
 * names are not there. That failure says nothing about the list and would make
 * the passing branch unreachable from any test, which is the exact defect the
 * root argument exists to fix.
 */
const auditingOwnExclusions = REPO_ROOT === DEFAULT_ROOT;
for (const exclusion of auditingOwnExclusions ? DECLARED_EXCLUSIONS : []) {
  const entry = declarations.get(exclusion.symbol);
  if (entry === undefined || entry.file !== exclusion.file) {
    staleExclusions.push(exclusion);
    continue;
  }
  if (callersOf(exclusion.symbol, entry).length > 0) closedExclusions.push(exclusion);
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------

const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const byLocation = (left, right) =>
  compare(left.file, right.file) || compare(left.name, right.name);

unreached.sort(byLocation);
reachedOnlyByUnreached.sort(byLocation);

const findingCount =
  orphanPackages.length +
  unreached.length +
  reachedOnlyByUnreached.length +
  untouchedComponents.length +
  unconsumedConstants.length +
  constantsBehindDeadCode.length +
  staleExclusions.length +
  closedExclusions.length;

const lines = [];
lines.push(
  findingCount === 0
    ? 'Reachability check PASSED.'
    : `Reachability check FAILED: ${findingCount} finding(s).`,
);
lines.push('');
lines.push(
  `Examined ${examinedSymbols.length} exported value(s) across ${examinedPackages.length} ` +
    `rules-path package(s), against ${productionFiles.length} production source file(s).`,
);
lines.push('');

if (orphanPackages.length > 0) {
  lines.push(`Packages nothing depends on (${orphanPackages.length}) — collapsed to one finding each:`);
  for (const name of orphanPackages) {
    const count = [...declarations.values()].filter((entry) =>
      entry.file.startsWith(`packages/${name}/src/`),
    ).length;
    lines.push(
      `  - @mm/${name}: no workspace package declares it as a dependency, and it has no bin/ ` +
        `entry point. Its ${count} exported value(s) are not listed individually; the package ` +
        `is the finding.`,
    );
  }
  lines.push('');
}

if (unreached.length > 0) {
  lines.push(`Exported values with no production caller (${unreached.length}):`);
  let currentFile = '';
  for (const entry of unreached) {
    if (entry.file !== currentFile) {
      currentFile = entry.file;
      lines.push(`  ${currentFile}`);
    }
    lines.push(`    :${entry.line}  ${entry.name}  (${entry.kind})`);
  }
  lines.push('');
}

if (reachedOnlyByUnreached.length > 0) {
  lines.push(`Called only by symbols that are themselves unreached (${reachedOnlyByUnreached.length}):`);
  for (const entry of reachedOnlyByUnreached) {
    lines.push(`  ${entry.file}:${entry.line}  ${entry.name}  — via ${entry.via.join(', ')}`);
  }
  lines.push('');
}

if (untouchedComponents.length > 0) {
  lines.push(`Components declared and never read or written (${untouchedComponents.length}):`);
  for (const component of untouchedComponents) {
    lines.push(
      `  ${COMPONENTS_FILE}:${component.line}  ${component.name}  — registered in a schema list, ` +
        'and touched by nothing.',
    );
  }
  lines.push('');
}

if (unconsumedConstants.length > 0) {
  lines.push(
    `God constants resolved into GodConstants and never read off it (${unconsumedConstants.length}):`,
  );
  for (const constant of unconsumedConstants) {
    lines.push(`  ${constant.id}  (resolved as ${constant.field}, ${CONSTANTS_FILE}:${constant.line})`);
  }
  lines.push('');
}

if (constantsBehindDeadCode.length > 0) {
  lines.push(`God constants read only by unreached code (${constantsBehindDeadCode.length}):`);
  for (const constant of constantsBehindDeadCode) {
    lines.push(`  ${constant.id}  (as ${constant.field})  — read by ${constant.via.join(', ')}`);
  }
  lines.push('');
}

if (staleExclusions.length > 0) {
  lines.push(`Declared exclusions naming a symbol that is not there (${staleExclusions.length}):`);
  for (const exclusion of staleExclusions) {
    lines.push(`  ${exclusion.symbol}  (expected at ${exclusion.file})`);
  }
  lines.push('');
}

if (closedExclusions.length > 0) {
  lines.push(`Declared exclusions that now have a caller (${closedExclusions.length}) — delete them:`);
  for (const exclusion of closedExclusions) {
    lines.push(`  ${exclusion.symbol}  (${exclusion.file})`);
  }
  lines.push('');
}

lines.push(
  `Excluded by rule (${structurallyExcluded.length}), because these cannot have a run-time caller:`,
);
for (const rule of STRUCTURAL_EXCLUSIONS) {
  const count = structurallyExcluded.filter((entry) => entry.rule === rule.id).length;
  lines.push(`  ${rule.id} (${count}): ${rule.reason}`);
}
lines.push('');
lines.push(`Excluded by name (${DECLARED_EXCLUSIONS.length}), each with its argument:`);
for (const exclusion of DECLARED_EXCLUSIONS) {
  lines.push(`  ${exclusion.symbol} — ${exclusion.file}`);
  lines.push(`    ${exclusion.reason}`);
}
lines.push('');
lines.push(`Packages not examined (${EXCLUDED_PACKAGES.length}), though their code still counts as a caller:`);
for (const entry of EXCLUDED_PACKAGES) {
  lines.push(`  @mm/${entry.name} — ${entry.reason}`);
}

const text = lines.join('\n');

if (findingCount === 0) {
  console.log(text);
} else {
  console.error(text);
  console.error(
    '\nA symbol here is not automatically a bug. It is automatically a sentence someone owes:\n' +
      'this is staged ahead of its consumer, or it is API consumed outside this repository, or\n' +
      'the simulation is missing a mechanic it looks like it already has. The third one is the\n' +
      'reason this check exists — `advanceConstruction`, `applyLibraryUpkeep` and\n' +
      '`UNIVERSITY_STAFF` were each built, tested, exported and never invoked, and each read as\n' +
      'done to anyone grepping for the symbol. "The symbol exists" and "a test covers it" are\n' +
      'both compatible with "the game never runs it."\n\n' +
      'The fix is a caller, or a deletion. Adding an entry to DECLARED_EXCLUSIONS to make this\n' +
      'green converts a defect into silence, which is the one outcome worse than the finding.\n',
  );
  process.exit(1);
}
