/*
 * Multiverse Mages — the workspace dependency-graph test of contracts.md §5.
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
 * `contracts.md` §5 rule 5: *"A dependency-graph test asserts all of the above
 * in CI. Boundaries that are only documented are boundaries that are already
 * broken."* This is that test.
 *
 * **Why it lives in `sim-core`'s suite.** It is a workspace-level check with no
 * package of its own, and the precedent is next door: `dependency-purity.test.ts`
 * already sits here while asserting things about `packages/content`. Rule 1 —
 * "sim-core depends on nothing" — is also a statement about this package
 * specifically, so this is the least arbitrary home available. The alternative,
 * a new root-level test project, would add build infrastructure to hold one
 * file.
 *
 * **Imports are parsed, never listed.** The specifiers come out of TypeScript's
 * own parser rather than a regex or a hand-maintained table, for three reasons
 * that each cost real time when they go wrong:
 *
 * 1. A hand-maintained list is a list that is accurate on the day it is written.
 *    The violation this test exists to catch is precisely the import somebody
 *    added without updating the documentation.
 * 2. A regex over raw text cannot tell an import from the *text* of an import.
 *    `purity-lint.test.ts`, two files away, contains `import { readFileSync }
 *    from 'node:fs'` inside a string literal — deliberately, as a probe fed to
 *    ESLint. A regex-based scanner reports that as sim-core importing `node:fs`
 *    and is then either wrong or weakened until it is useless.
 * 3. Only a real parse can see `import type`. §5 annotates `content → sim-core`
 *    as *types only*, and a type-only edge is genuinely different: it vanishes
 *    at runtime, so it cannot drag a Node-bound module into a browser bundle.
 *    That annotation is enforced here rather than trusted.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** From packages/sim-core/test/unit/ up to the repository root. */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

const WORKSPACE_SCOPE = '@mm/';

/**
 * Stands in for an import specifier that is present but not a literal string.
 *
 * Deliberately not a plausible module name: it must never accidentally match a
 * real package, and it must be obvious in a failure message that the problem is
 * the *shape* of the import rather than its target.
 */
const UNRESOLVED_SPECIFIER = '\u0000unresolved-specifier';

/** Directories inside a package that hold first-party TypeScript. */
const SCANNED_AREAS = ['src', 'test', 'bench'] as const;
type Area = (typeof SCANNED_AREAS)[number];

/**
 * `contracts.md` §5, transcribed. **This map is the contract**; everything else
 * in this file is machinery for comparing reality against it.
 *
 * `value` edges may be imported however the importer likes. `typeOnly` edges
 * must be written `import type` — they are erased at compile time and are not
 * permitted to become runtime coupling. `testOnly` edges may not appear in
 * `src` at all, in any form.
 *
 * **`testOnly` was added for `gym-bridge` and states something the two existing
 * columns could not.** A test area has always been allowed everything its
 * package is allowed, because a cross-package test legitimately pins a
 * type-only edge against its runtime counterpart. What had no expression was an
 * edge a package's *tests* need and its *source* must never have. The bridge is
 * the first package to need one: its release claim is that a recorded episode
 * replays to an identical snapshot hash, that claim is vacuous against a stubbed
 * session, and observing a real one requires `@mm/state`'s world schema to build
 * a universe at all. Building universes properly is `scenario`'s job and
 * `scenario` is a leaf nothing may import, so the choice was a test-only edge or
 * a claim nothing checks. Widening `value` would have been the quiet option and
 * would have licensed the bridge's *source* to reach into world state, which is
 * exactly the coupling §5 draws this package's single edge to prevent.
 *
 * Four packages here are not in §5's original list, all added for the same
 * underlying reason — §5 was written before anyone tried to satisfy it — and
 * all recorded beside the §5 diagram:
 *
 * - `state`: the shared world-state types have to live somewhere every
 *   `rules-*` package can reach. `sim-core` must stay content-agnostic, and
 *   putting them in `rules-magic` would force `rules-world` to import it and
 *   break rule 3.
 * - `primitives`: the stacking arithmetic needs `sim-core`'s fixed-point
 *   helpers *and* the registry that lives in `content`. `content` is in
 *   PURE_PACKAGES and may not take a runtime dependency, and §3 forbids
 *   re-deriving a floor outside the one shared helper, so it can live in
 *   neither and needs a package between them.
 * - `coordination`: rule 3's coordinating layer, for the **world** loop. The
 *   two places §5 offered both fail it — `rules-raid` is defined as the
 *   engagement space and would make a headless world tick load the combat
 *   package, and `agent-api` cannot be reached by `rules-raid` under rule 4.
 *   `rules-raid` is given an inbound edge to it, since a raid's consequences
 *   land in world state through the same layer.
 * - `scenario`: the composition root. Something has to load content, install
 *   the world loop, seed a starting position and hand it to `agent-api`'s
 *   session as a `Scenario`, and §5 named no package for it: `agent-api` may
 *   not load content (its surface must run in a browser), `mc-harness` has one
 *   edge on purpose, and `coordination` is rules-path code the client loads. It
 *   is a leaf — nothing here imports it — and this table is what keeps that
 *   true.
 */
interface PackageEdges {
  readonly value: readonly string[];
  readonly typeOnly: readonly string[];
  /** Reachable from `test/` only. Never from `src/`, in any form. */
  readonly testOnly?: readonly string[];
}

const ALLOWED: Readonly<Record<string, PackageEdges>> =
  {
    'sim-core': { value: [], typeOnly: [] },
    content: { value: [], typeOnly: ['sim-core'] },
    state: { value: ['sim-core'], typeOnly: ['content'] },
    primitives: { value: ['sim-core'], typeOnly: ['content'] },
    'rules-magic': { value: ['sim-core', 'content', 'state', 'primitives'], typeOnly: [] },
    'rules-world': { value: ['sim-core', 'content', 'state', 'primitives'], typeOnly: [] },
    'rules-raid': {
      value: [
        'sim-core',
        'content',
        'state',
        'primitives',
        'rules-magic',
        'rules-world',
        'coordination',
      ],
      typeOnly: [],
    },
    coordination: {
      value: ['sim-core', 'content', 'state', 'primitives', 'rules-magic', 'rules-world'],
      typeOnly: [],
    },
    'agent-api': {
      value: [
        'sim-core',
        'content',
        'state',
        'primitives',
        'rules-magic',
        'rules-world',
        'rules-raid',
        'coordination',
      ],
      typeOnly: [],
    },
    'mc-harness': { value: ['agent-api'], typeOnly: [] },
    // §5's own last line: `gym-bridge  JSON-over-stdio RL wrapper. → agent-api`.
    // One value edge, and that is the whole of what the transport may reach.
    // `sim-core` and `state` are `testOnly`: the fixture universe the replay
    // claim is measured against needs both to exist at all, and the bridge's
    // source needs neither — see the note on {@link PackageEdges.testOnly}.
    'gym-bridge': { value: ['agent-api'], typeOnly: [], testOnly: ['sim-core', 'state'] },
    // §5: `server  authoritative lockstep, Hetzner deployment. → agent-api`.
    // The same single edge `mc-harness` has, and taken literally: the server
    // drives an `AgentSession` — `reset`, `submit`, `snapshotHash` — and never
    // reaches past it. That is deliberate rather than incidental. A direct
    // `sim-core` edge would have been a fifth deviation from §5 as drawn, and
    // it buys nothing: the one thing the server needs from the core is the
    // snapshot hash, and the session already publishes it. Reaching for
    // `serializeState` here would also have put a second serialization one
    // import away, which is exactly what `pvp-server`'s proposal forbids.
    // `sim-core` and `state` are `testOnly` for gym-bridge's reason: the
    // fixture universe a match is measured against needs both to exist at all,
    // and the server's source needs neither.
    server: { value: ['agent-api'], typeOnly: [], testOnly: ['sim-core', 'state'] },
    scenario: {
      value: [
        'sim-core',
        'content',
        'state',
        'rules-magic',
        'rules-world',
        // §5 gives `scenario` *"everything above; a leaf"*, and `rules-raid` is
        // above it in that list. The edge went unlisted here only because
        // nothing had reached for it: `rules-raid` shipped complete and
        // uncalled, so the composition root had no portal to open. It does now
        // — `raids.ts` drives `openPortal` through `applyRaidOutcome` — and the
        // edge is safe for the same reason every other one in this entry is,
        // which is that nothing imports `scenario`. The leaf test below is what
        // holds that up.
        'rules-raid',
        'coordination',
        'agent-api',
        'mc-harness',
      ],
      typeOnly: [],
    },
  };

/**
 * §5 rule 2. Listed by name rather than by "packages that do not exist", so the
 * rule keeps meaning something on the day `client-electron` and `server` are
 * created — which is the only day it matters.
 */
const NEVER_DEPENDED_ON = ['client-electron', 'server'];

/**
 * Node's built-in modules, with and without the `node:` prefix.
 *
 * Read from the running Node rather than transcribed, for the same reason the
 * imports themselves are parsed rather than listed: a hand-copied list silently
 * stops covering whatever built-in ships next. `eslint.config.mjs` builds its
 * ban from the same source, so lint and this test cannot drift apart.
 */
const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

/** One first-party source file, as the analyzer sees it. */
interface ScannedFile {
  /** Package directory name, e.g. `rules-magic`. */
  readonly pkg: string;
  readonly area: Area;
  /** Repo-relative, for error messages. */
  readonly path: string;
  readonly source: string;
}

/** One import edge found in one file. */
interface ImportEdge {
  readonly pkg: string;
  readonly area: Area;
  readonly path: string;
  readonly specifier: string;
  readonly typeOnly: boolean;
}

/**
 * Every module specifier in one file, with its type-only flag.
 *
 * Covers static imports and re-exports, `import type`, inline `{ type Foo }`
 * specifiers, `import()` expressions, and `require()` calls. The last two are
 * not idiomatic here and are exactly how a boundary gets crossed quietly, since
 * neither is visible to a scanner that only walks import declarations.
 *
 * **A specifier this cannot read is reported, not skipped.** It used to drop
 * anything that was not a plain string literal, so `require('@mm/' + name)` or
 * an interpolated `import()` produced no edge at all and therefore no
 * violation, whatever package it reached. That is the worst possible default
 * for a boundary check: the one import written to be hard to see is the one it
 * waved through. Unreadable specifiers now surface as
 * {@link UNRESOLVED_SPECIFIER} and are reported by name, because a scanner that
 * cannot prove an import safe must not call it safe.
 */
export function importsOf(path: string, source: string): { specifier: string; typeOnly: boolean }[] {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: { specifier: string; typeOnly: boolean }[] = [];

  const literalText = (node: ts.Expression | undefined): string | undefined => {
    if (node === undefined) return undefined;
    if (ts.isStringLiteralLike(node)) return node.text;
    // Present but unreadable — a concatenation, a template with substitutions,
    // an identifier. Fail closed.
    return UNRESOLVED_SPECIFIER;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const specifier = literalText(node.moduleSpecifier);
      if (specifier !== undefined) {
        found.push({ specifier, typeOnly: isTypeOnlyImportClause(node.importClause) });
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      const specifier = literalText(node.moduleSpecifier);
      if (specifier !== undefined) {
        found.push({ specifier, typeOnly: isTypeOnlyExportClause(node) });
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      const reference = node.moduleReference;
      if (ts.isExternalModuleReference(reference)) {
        const specifier = literalText(reference.expression);
        if (specifier !== undefined) found.push({ specifier, typeOnly: false });
      }
    } else if (ts.isCallExpression(node)) {
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const isDynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      if (isRequire || isDynamic) {
        const specifier = literalText(node.arguments[0]);
        if (specifier !== undefined) found.push({ specifier, typeOnly: false });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(parsed);
  return found;
}

/**
 * `import type X` and `import { type X }` are both type-only. The second form
 * matters: it is what a formatter or a "organise imports" command produces, so
 * treating only the first as erased would report a false violation the moment
 * somebody's editor tidied a file.
 */
function isTypeOnlyImportClause(clause: ts.ImportClause | undefined): boolean {
  if (clause === undefined) return false; // bare `import 'x'` — a side effect, so a value edge
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  if (bindings !== undefined && ts.isNamedImports(bindings) && clause.name === undefined) {
    return bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly);
  }
  return false;
}

function isTypeOnlyExportClause(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true;
  const clause = node.exportClause;
  if (clause !== undefined && ts.isNamedExports(clause)) {
    return clause.elements.length > 0 && clause.elements.every((element) => element.isTypeOnly);
  }
  return false;
}

/** Turns scanned files into workspace edges. Pure, so the control can feed it. */
export function edgesOf(files: readonly ScannedFile[]): ImportEdge[] {
  const edges: ImportEdge[] = [];
  for (const file of files) {
    for (const { specifier, typeOnly } of importsOf(file.path, file.source)) {
      edges.push({ pkg: file.pkg, area: file.area, path: file.path, specifier, typeOnly });
    }
  }
  return edges;
}

/**
 * Every way the observed graph violates §5, as human-readable lines.
 *
 * Returns a list rather than throwing on the first problem. A boundary check
 * that reports one edge per run turns a merge that crossed three boundaries
 * into three CI cycles, and the third one is where somebody deletes the test.
 */
export function violationsOf(edges: readonly ImportEdge[], packages: readonly string[]): string[] {
  const problems: string[] = [];

  for (const edge of edges) {
    if (edge.specifier !== UNRESOLVED_SPECIFIER) continue;
    problems.push(
      `${edge.path} imports a module whose specifier this check cannot read — it is built at ` +
        'runtime rather than written as a string literal. §5 boundaries are only as good as the ' +
        'scanner, so an import that cannot be proven safe is reported rather than assumed safe. ' +
        'Write the specifier as a literal.',
    );
  }

  for (const pkg of packages) {
    if (ALLOWED[pkg] === undefined) {
      problems.push(
        `packages/${pkg} exists but is not described by the §5 dependency graph. Add it to ` +
          'ALLOWED here and to the diagram in docs/design/contracts.md §5 — an undescribed ' +
          'package is one whose boundaries nothing checks.',
      );
    }
  }

  for (const edge of edges) {
    if (edge.specifier === UNRESOLVED_SPECIFIER) continue; // already reported above
    if (!edge.specifier.startsWith(WORKSPACE_SCOPE)) continue;
    const target = edge.specifier.slice(WORKSPACE_SCOPE.length).split('/')[0] as string;

    if (NEVER_DEPENDED_ON.includes(target)) {
      problems.push(
        `${edge.path} imports @mm/${target}. §5 rule 2: nothing depends on client-electron or ` +
          'server. They are leaves — the renderer and the authoritative host — and an inbound ' +
          'edge would put presentation or transport inside the simulation.',
      );
      continue;
    }

    if (target === edge.pkg) continue; // a package may reference itself by name

    if (edge.pkg === 'sim-core') {
      problems.push(
        `${edge.path} imports @mm/${target}. §5 rule 1: sim-core depends on nothing. Every ` +
          'consumer — the harness, the client, the server, the RL bridge — must agree ' +
          'bit-for-bit on what the simulation does, and each dependency is a surface on which ' +
          'they can disagree.',
      );
      continue;
    }

    if (target === 'agent-api' && edge.pkg.startsWith('rules-')) {
      problems.push(
        `${edge.path} imports @mm/agent-api. §5 rule 4: rules packages never import agent-api. ` +
          'The dependency runs one way, so that the observation layer can never become an input ' +
          'to the rules it observes.',
      );
      continue;
    }

    const cyclePartner = { 'rules-magic': 'rules-world', 'rules-world': 'rules-magic' }[edge.pkg];
    if (cyclePartner !== undefined && target === cyclePartner) {
      problems.push(
        `${edge.path} imports @mm/${target}. §5 rule 3: rules-magic and rules-world must not ` +
          'import each other. Where they interact — a mage learning a node — the interaction ' +
          'belongs in a coordinating layer that imports both, such as rules-raid.',
      );
      continue;
    }

    const allowed = ALLOWED[edge.pkg];
    if (allowed === undefined) continue; // already reported as an undescribed package

    // Tests may reach anything the package itself may reach, by value: they run
    // in Node against a built graph, and pinning a type-only edge against its
    // runtime counterpart is exactly what a cross-package test is for. They may
    // also reach the `testOnly` list, which `src` may not touch at all.
    const valueTargets =
      edge.area === 'src'
        ? allowed.value
        : [...allowed.value, ...allowed.typeOnly, ...(allowed.testOnly ?? [])];

    if (valueTargets.includes(target)) continue;

    if (allowed.typeOnly.includes(target)) {
      if (!edge.typeOnly) {
        problems.push(
          `${edge.path} imports @mm/${target} as a value, but §5 permits ${edge.pkg} → ` +
            `${target} as types only. A value import survives to runtime and drags whatever ` +
            `@mm/${target} loads along with it — which for content includes a filesystem read.`,
        );
      }
      continue;
    }

    if ((allowed.testOnly ?? []).includes(target)) {
      problems.push(
        `${edge.path} imports @mm/${target}, which §5 grants ${edge.pkg} for its tests only. A ` +
          'test-only edge exists so a claim can be measured against a real universe; letting it ' +
          'into src would give the package a capability its single §5 edge exists to withhold.',
      );
      continue;
    }

    problems.push(
      `${edge.path} imports @mm/${target}, an edge §5 does not grant ${edge.pkg}. Permitted: ` +
        `${[...allowed.value, ...allowed.typeOnly].map((name) => `@mm/${name}`).join(', ') || '(none)'}` +
        `${(allowed.testOnly ?? []).length > 0 ? ` (plus ${(allowed.testOnly ?? []).map((name) => `@mm/${name}`).join(', ')} in test/ only)` : ''}.`,
    );
  }

  return problems.sort();
}

/** Node built-ins reached from a file that is forbidden to have any. */
function nodeBuiltinViolations(edges: readonly ImportEdge[]): string[] {
  return edges
    .filter((edge) => NODE_BUILTINS.has(edge.specifier))
    .map(
      (edge) =>
        `${edge.path} imports ${edge.specifier}. §5 rule 1: sim-core imports no Node built-ins — ` +
        'it must run unchanged in Node, Electron, and a browser.',
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
    if (statSync(full).isDirectory()) {
      found.push(...listTypeScript(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      found.push(full);
    }
  }
  return found;
}

function packageDirectories(): string[] {
  return readdirSync(join(repoRoot, 'packages'))
    .filter((entry) => statSync(join(repoRoot, 'packages', entry)).isDirectory())
    .sort();
}

function scanWorkspace(): ScannedFile[] {
  const files: ScannedFile[] = [];
  for (const pkg of packageDirectories()) {
    for (const area of SCANNED_AREAS) {
      for (const full of listTypeScript(join(repoRoot, 'packages', pkg, area))) {
        files.push({
          pkg,
          area,
          path: relative(repoRoot, full).split(sep).join('/'),
          source: readFileSync(full, 'utf8'),
        });
      }
    }
  }
  return files;
}

const workspaceFiles = scanWorkspace();
const workspaceEdges = edgesOf(workspaceFiles);
const workspacePackages = packageDirectories();

describe('the workspace dependency graph matches contracts.md §5', () => {
  it('found source to analyse at all, so the assertions below are not vacuous', () => {
    // Every assertion in this file is "no violations were found". If the
    // scanner silently returned nothing — a renamed directory, a changed
    // layout — all of them would pass while checking nothing whatsoever.
    expect(workspaceFiles.length).toBeGreaterThan(50);
    expect(workspaceEdges.length).toBeGreaterThan(50);
    expect(workspacePackages).toContain('sim-core');
    expect(workspacePackages).toContain('rules-magic');
  });

  it('grants no package an edge §5 withholds', () => {
    expect(violationsOf(workspaceEdges, workspacePackages)).toEqual([]);
  });

  it('keeps rules-magic clear of rules-world and agent-api in the real tree (rules 3, 4)', () => {
    // `violationsOf` already covers this in general, and this asserts it
    // specifically, because `rules-magic` is the package whose two forbidden
    // edges are the *tempting* ones. Everything a knowledge operation wants —
    // a mage's `learnRate`, a species' `retention`, the materials balance —
    // lives in `rules-world`, and the one-line fix for needing it is the import
    // that makes the graph cyclic. The alternative §5 prescribes is that those
    // arrive as caller-supplied parameters, which is what
    // `packages/rules-magic/src/world-inputs.ts` exists to type.
    //
    // Named rather than left to the general check so that the failure message a
    // future author sees says which rule they broke, on the day they break it.
    const magic = workspaceEdges.filter((edge) => edge.pkg === 'rules-magic');

    // Not vacuous: rules-magic imports real workspace packages, so an empty
    // result below means "no forbidden edges", not "no edges parsed at all".
    const workspaceTargets = magic
      .filter((edge) => edge.specifier.startsWith(WORKSPACE_SCOPE))
      .map((edge) => edge.specifier.slice(WORKSPACE_SCOPE.length).split('/')[0]);
    expect(workspaceTargets.length).toBeGreaterThan(0);
    expect(new Set(workspaceTargets)).toContain('state');

    for (const forbidden of ['rules-world', 'agent-api']) {
      expect(
        magic.filter((edge) => edge.specifier.slice(WORKSPACE_SCOPE.length).split('/')[0] === forbidden),
      ).toEqual([]);
    }
  });

  it('keeps the scenario package a leaf', () => {
    // The §5 argument for giving the composition root a package of its own
    // rests on nothing depending on it: it may import both halves of the
    // boundary precisely because it is where a run is assembled and not
    // something the simulation, the observation layer or the harness can reach
    // back into. `ALLOWED` enforces that already — no other package lists it —
    // but the failure message would name a missing edge rather than the
    // property, and this is the property.
    const inbound = workspaceEdges.filter(
      (edge) => edge.pkg !== 'scenario' && edge.specifier.startsWith(`${WORKSPACE_SCOPE}scenario`),
    );
    expect(inbound.map((edge) => edge.path)).toEqual([]);
  });

  it('keeps the gym-bridge package a leaf', () => {
    // Same property as `scenario`'s above, for a different reason. §5 puts the
    // RL bridge downstream of the observation layer, and an inbound edge would
    // make some part of the simulation, the harness or the observation layer
    // depend on a *transport* — after which the wire format would be a
    // constraint on the game rather than a view of it.
    const inbound = workspaceEdges.filter(
      (edge) => edge.pkg !== 'gym-bridge' && edge.specifier.startsWith(`${WORKSPACE_SCOPE}gym-bridge`),
    );
    expect(inbound.map((edge) => edge.path)).toEqual([]);
  });

  it('keeps sim-core free of workspace and Node built-in imports (rule 1)', () => {
    const coreSource = workspaceEdges.filter(
      (edge) => edge.pkg === 'sim-core' && edge.area !== 'test',
    );
    expect(nodeBuiltinViolations(coreSource)).toEqual([]);
    expect(coreSource.filter((edge) => edge.specifier.startsWith(WORKSPACE_SCOPE))).toEqual([]);
  });

  it('keeps sim-core free of runtime dependencies (rule 1)', () => {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, 'packages', 'sim-core', 'package.json'), 'utf8'),
    ) as Record<string, unknown>;
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      expect(manifest[field] ?? {}).toEqual({});
    }
  });

  it('lets rules-raid import both rules-magic and rules-world (the coordinating layer)', () => {
    // The positive control for rule 3. A checker that rejected every cross-rules
    // edge would pass all the negative assertions above and would also forbid
    // the arrangement §5 explicitly prescribes for cross-cutting interactions.
    const coordinating: ImportEdge[] = [
      edge('rules-raid', 'src', '@mm/rules-magic'),
      edge('rules-raid', 'src', '@mm/rules-world'),
    ];
    expect(violationsOf(coordinating, workspacePackages)).toEqual([]);
  });
});

/** A synthetic edge, for the controls below. */
function edge(pkg: string, area: Area, specifier: string, typeOnly = false): ImportEdge {
  return { pkg, area, path: `packages/${pkg}/${area}/probe.ts`, specifier, typeOnly };
}

describe('the dependency-graph check would catch a violation', () => {
  // Without these, "no violations found" is indistinguishable from "the checker
  // returns an empty array for every input" — which is the state every
  // boundary test decays into and the state no green run reveals.

  it('catches sim-core importing another package (rule 1)', () => {
    const problems = violationsOf([edge('sim-core', 'src', '@mm/content')], workspacePackages);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('sim-core depends on nothing');
  });

  it('catches an import of client-electron or server (rule 2)', () => {
    for (const forbidden of NEVER_DEPENDED_ON) {
      const problems = violationsOf(
        [edge('agent-api', 'src', `@mm/${forbidden}`)],
        workspacePackages,
      );
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(`@mm/${forbidden}`);
      expect(problems[0]).toContain('rule 2');
    }
  });

  it('catches the rules-magic / rules-world cycle in both directions (rule 3)', () => {
    const forward = violationsOf([edge('rules-magic', 'src', '@mm/rules-world')], workspacePackages);
    const backward = violationsOf([edge('rules-world', 'src', '@mm/rules-magic')], workspacePackages);
    expect(forward).toHaveLength(1);
    expect(backward).toHaveLength(1);
    expect(forward[0]).toContain('must not');
    expect(backward[0]).toContain('must not');
    expect(forward[0]).toContain('packages/rules-magic/src/probe.ts');
    expect(backward[0]).toContain('packages/rules-world/src/probe.ts');
  });

  it('catches a test-only edge reaching into src, and permits it in test', () => {
    // Both halves, because a column that permitted everything everywhere would
    // pass the positive half and would be no boundary at all.
    const inSource = violationsOf([edge('gym-bridge', 'src', '@mm/state')], workspacePackages);
    expect(inSource).toHaveLength(1);
    expect(inSource[0]).toContain('for its tests only');

    expect(violationsOf([edge('gym-bridge', 'test', '@mm/state')], workspacePackages)).toEqual([]);
  });

  it('catches a rules package importing agent-api (rule 4)', () => {
    for (const pkg of ['rules-magic', 'rules-world', 'rules-raid']) {
      const problems = violationsOf([edge(pkg, 'src', '@mm/agent-api')], workspacePackages);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('rule 4');
    }
  });

  it('catches a value import on an edge §5 grants as types only', () => {
    const asValue = violationsOf([edge('state', 'src', '@mm/content')], workspacePackages);
    expect(asValue).toHaveLength(1);
    expect(asValue[0]).toContain('types only');

    const asType = violationsOf([edge('state', 'src', '@mm/content', true)], workspacePackages);
    expect(asType).toEqual([]);
  });

  it('catches a package that exists but is absent from the §5 graph', () => {
    const problems = violationsOf([], [...workspacePackages, 'rules-weather']);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('rules-weather');
  });

  it('catches a Node built-in reaching the core', () => {
    const problems = nodeBuiltinViolations([edge('sim-core', 'src', 'node:fs')]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no Node built-ins');
  });
});

describe('the import scanner reads real syntax, not text that looks like it', () => {
  it('sees static imports, re-exports, dynamic imports, and require()', () => {
    const found = importsOf(
      'probe.ts',
      [
        "import { a } from '@mm/one';",
        "import type { B } from '@mm/two';",
        "import { type C } from '@mm/three';",
        "export * from '@mm/four';",
        "export type { E } from '@mm/five';",
        "const f = await import('@mm/six');",
        "const g = require('@mm/seven');",
        "import '@mm/eight';",
      ].join('\n'),
    );
    expect(found.map((entry) => entry.specifier)).toEqual([
      '@mm/one',
      '@mm/two',
      '@mm/three',
      '@mm/four',
      '@mm/five',
      '@mm/six',
      '@mm/seven',
      '@mm/eight',
    ]);
    expect(found.filter((entry) => entry.typeOnly).map((entry) => entry.specifier)).toEqual([
      '@mm/two',
      '@mm/three',
      '@mm/five',
    ]);
  });

  it('ignores an import that is only the text of an import', () => {
    // The concrete case: purity-lint.test.ts hands ESLint synthetic core source
    // as a string. A text scanner reads those probes as real imports and
    // reports sim-core importing node:fs, which it does not.
    const found = importsOf(
      'probe.ts',
      [
        "const probe = `import { readFileSync } from 'node:fs';`;",
        "// import { x } from '@mm/server';",
        "/* import { y } from '@mm/client-electron'; */",
        "const s = \"import { z } from '@mm/agent-api';\";",
        'export { probe, s };',
      ].join('\n'),
    );
    expect(found).toEqual([]);
  });
});
