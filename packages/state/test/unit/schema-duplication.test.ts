/*
 * Multiverse Mages — the conformance check that world-state types are shared,
 * not redeclared.
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
 * `state-schema`, *"Types are shared, not duplicated"*: **WHEN** a rules package
 * declares a structural type describing an entity already defined in the state
 * schema, **THEN** the contract-conformance check fails and names the duplicated
 * type. This is that check.
 *
 * Nothing detected this before, which meant the requirement it belongs to — *"The
 * project SHALL publish a single set of TypeScript type definitions for world
 * state… Every rules package MUST consume these types rather than declaring its
 * own"* — could be violated by a package with a fully green suite. A second
 * `MageRecord` with one extra field compiles, tests, and ships; what it does not
 * do is agree with the component layout, so the field it adds is written and
 * never serialized. That is the defect this exists to make loud.
 *
 * ## Placement
 *
 * Same reasoning as `arbitration-conformance.test.ts` beside it, and as
 * `module-boundaries.test.ts` in `packages/sim-core/test/unit/`: a
 * workspace-wide check has no package of its own, so it goes with the code whose
 * contract it is. `@mm/state` is the single publisher these types must come
 * from, and `components.ts` is the file this check is derived from at runtime.
 *
 * ## Making "describing an entity already defined" operational
 *
 * That phrase cannot be executed. It is made concrete here as **two independent
 * tests**, either of which is a violation, and both are stated in the failure
 * message so a reader knows which one fired:
 *
 * 1. **Name collision.** A package other than `@mm/state` exports an interface
 *    or type alias whose name equals one of `@mm/state`'s own record type names
 *    ({@link stateRecordNames}), with or without the `Record` suffix — so both
 *    `MageRecord` and a bare `Mage` count. The names are **read out of
 *    `packages/state/src` at run time**, not transcribed, so renaming a record
 *    there moves the rule with it. `state-schema` names nine entities
 *    (`Universe`, `Mage`, `PopulaceCohort`, `University`, `Library`, `Grimoire`,
 *    `KnowledgeInstance`, `Combatant`, `Objective`); reading them from source
 *    covers those and the records §1 added later, such as `EverKnownRecord`.
 *
 * 2. **Field superset.** A package other than `@mm/state` declares a structural
 *    type whose field names are a superset of **any** type `@mm/state`
 *    publishes — the shape of the duplication that renames its way past test 1.
 *    A duplicate is usually a *superset* rather than an equal set, because the
 *    reason someone redeclares is to add a field.
 *
 *    Deliberately **not** restricted to the `*Record` types the name test
 *    covers. The most damaging type to duplicate is `Ruleset`
 *    (`{permittedTechniques, permittedForms, edicts}`), because a hand-rolled
 *    copy of it is step one of reimplementing `permits()` — and it has no
 *    `Record` suffix, so a Records-only comparison would let exactly that one
 *    through both tests. See {@link comparableByShape}.
 *
 *    Only types with **at least {@link MIN_COMPARABLE_FIELDS} fields** are
 *    compared. `EdictComponentRecord` is `{cellId, kind}`; at two fields,
 *    "superset" stops being evidence of anything and starts matching unrelated
 *    types that happen to have a `kind`. The threshold buys precision at the
 *    cost of not catching a duplicate of a two-field record by shape alone —
 *    which test 1 still catches by name.
 *
 * ## What is deliberately not a violation
 *
 * - **Re-exporting** a state type (`export type { MageRecord } from '@mm/state'`)
 *   is sharing, and only `interface`/`type` *declarations* are scanned.
 * - **Being unexported** is not a defence, and the `export` keyword is not
 *   consulted at all: the spec says *declares*, and a file-private duplicate
 *   drifts from the component layout just as far.
 * - **Extending** one (`interface Foo extends MageRecord`) is sharing too: only
 *   locally declared members are counted, so the inherited fields are not
 *   attributed to the extender.
 * - **Types that are not object shapes** — unions, mapped types, function types,
 *   `keyof` — have no field set to compare and are checked by name only. They
 *   are recorded as such rather than dropped, and {@link fieldComparableCount}
 *   is asserted below so that a change making everything non-comparable fails
 *   instead of passing.
 * - **`packages/state/src` itself**, which is where these types are supposed to
 *   be, and `test/` everywhere, which is where this file's own synthetic
 *   duplicates live.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** From packages/state/test/unit/ up to the repository root. */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/** The package that owns the world-state types. Everything else consumes them. */
const SCHEMA_PACKAGE = 'state';

/**
 * Below this many fields, "is a superset of" is coincidence rather than
 * evidence. Three is the smallest size at which an accidental match is
 * implausible: two-field records in §1 are `{cellId, kind}`-shaped and their
 * field names are the common vocabulary of the whole schema.
 */
const MIN_COMPARABLE_FIELDS = 3;

/** One exported type declaration. */
export interface DeclaredType {
  /** Package directory name, e.g. `rules-world`. */
  readonly pkg: string;
  /** Repo-relative, for the failure message the spec requires. */
  readonly path: string;
  readonly name: string;
  /**
   * Locally declared field names, sorted — or `undefined` when the declaration
   * is not an object shape and therefore has no fields to compare.
   */
  readonly fields: readonly string[] | undefined;
}

/** A member's name, when it has a comparable one. */
function memberName(member: ts.TypeElement): string | undefined {
  const name = member.name;
  if (name === undefined) return undefined; // index signature, call signature
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined; // computed key — not a fixed field
}

/** Field names of an object-shaped type, or `undefined` if it is not one. */
function fieldsOf(members: ts.NodeArray<ts.TypeElement>): string[] {
  return members
    .map(memberName)
    .filter((name): name is string => name !== undefined)
    .sort();
}

/**
 * Every interface and type alias in one file, exported or not.
 *
 * The `export` keyword is deliberately not consulted. `state-schema` says *"a
 * rules package **declares** a structural type describing an entity already
 * defined in the state schema"*, and a file-private `interface Mage` drifts from
 * the component layout exactly as far as a published one does — it is just
 * harder to find later. Filtering on `export` would also make the rule turn on
 * whether a duplicate happened to be re-used, which is not what makes it a
 * duplicate.
 *
 * Exported so the controls below can feed it synthetic source — a checker that
 * only runs against the real tree is a checker whose behaviour on a violation
 * nobody has watched.
 */
export function exportedTypesOf(pkg: string, path: string, source: string): DeclaredType[] {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const declared: DeclaredType[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node)) {
      // Only locally declared members: `extends MageRecord` is consumption of
      // the shared type, which is what the requirement asks for.
      declared.push({ pkg, path, name: node.name.text, fields: fieldsOf(node.members) });
    } else if (ts.isTypeAliasDeclaration(node)) {
      declared.push({
        pkg,
        path,
        name: node.name.text,
        fields: ts.isTypeLiteralNode(node.type) ? fieldsOf(node.type.members) : undefined,
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(parsed);
  return declared;
}

/**
 * The names `@mm/state` publishes for §1's entity records, plus their stems.
 *
 * Derived rather than transcribed: a transcribed list is a list that is correct
 * on the day it is written, and the violation this check exists to catch is
 * precisely the type somebody declared without reading the schema.
 */
export function stateRecordNames(stateTypes: readonly DeclaredType[]): Set<string> {
  const names = new Set<string>();
  for (const type of stateTypes) {
    if (!type.name.endsWith('Record')) continue;
    names.add(type.name);
    names.add(type.name.slice(0, -'Record'.length)); // the bare entity name
  }
  return names;
}

/**
 * Whether a `@mm/state` type is big enough and concrete enough to compare by
 * shape.
 *
 * **Not restricted to `*Record` types.** The name test covers the §1 entity
 * records; the shape test has to cover everything `@mm/state` publishes,
 * because the type most damaging to duplicate is `Ruleset` —
 * `{permittedTechniques, permittedForms, edicts}` — and a hand-rolled copy of
 * it is step one of reimplementing `permits()`. It carries no `Record` suffix,
 * so a Records-only comparison would let the one duplicate that matters most
 * walk past both tests.
 */
export function comparableByShape(type: DeclaredType): boolean {
  return type.fields !== undefined && type.fields.length >= MIN_COMPARABLE_FIELDS;
}

/**
 * Every way the observed declarations duplicate the state schema.
 *
 * A list rather than a throw on the first: a package that redeclared three
 * records should learn that in one CI cycle, not three.
 */
export function duplicationViolations(
  stateTypes: readonly DeclaredType[],
  otherTypes: readonly DeclaredType[],
): string[] {
  const reserved = stateRecordNames(stateTypes);
  const comparable = stateTypes.filter(comparableByShape);
  const problems: string[] = [];

  for (const type of otherTypes) {
    if (reserved.has(type.name)) {
      problems.push(
        `${type.path} declares \`${type.name}\`, a name @mm/state already publishes for a ` +
          'contracts.md §1 record. state-schema requires one set of world-state type ' +
          'definitions that every rules package consumes: import it from @mm/state, or extend ' +
          'it, rather than declaring a second one that nothing keeps in step with the component ' +
          'layout.',
      );
      continue;
    }

    if (type.fields === undefined) continue;
    const own = new Set(type.fields);
    for (const record of comparable) {
      const fields = record.fields as readonly string[];
      if (!fields.every((field) => own.has(field))) continue;
      problems.push(
        `${type.path} declares \`${type.name}\`, whose fields are a superset of @mm/state's ` +
          `\`${record.name}\` (${fields.join(', ')}). state-schema calls that a duplicated type ` +
          'however it is named: two declarations of one §1 entity drift, and the field the copy ' +
          'adds is one the component layout never serializes — written every tick, absent from ' +
          'every snapshot. Consume the shared type, or extend it.',
      );
      break; // one report per duplicate, naming the closest match
    }
  }

  return problems.sort();
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

/** Every exported type declared in any `packages/*&#47;src`. */
function scanWorkspaceTypes(): DeclaredType[] {
  const packagesDir = join(repoRoot, 'packages');
  const declared: DeclaredType[] = [];
  for (const pkg of readdirSync(packagesDir).sort()) {
    if (!statSync(join(packagesDir, pkg)).isDirectory()) continue;
    for (const full of listTypeScript(join(packagesDir, pkg, 'src'))) {
      const path = relative(repoRoot, full).split(sep).join('/');
      declared.push(...exportedTypesOf(pkg, path, readFileSync(full, 'utf8')));
    }
  }
  return declared;
}

const workspaceTypes = scanWorkspaceTypes();
const stateTypes = workspaceTypes.filter((type) => type.pkg === SCHEMA_PACKAGE);
const otherTypes = workspaceTypes.filter((type) => type.pkg !== SCHEMA_PACKAGE);

/** Object-shaped state types big enough to compare by field set. */
const fieldComparable = stateTypes.filter(comparableByShape);

describe('world-state types are shared, not duplicated', () => {
  it('found types on both sides of the comparison, so the assertion is not vacuous', () => {
    // Every assertion here is "no duplicates found". If either side of the
    // comparison came back empty — a moved directory, an extractor that stopped
    // recognising `export interface` — it would pass while comparing nothing.
    expect(stateTypes.length).toBeGreaterThan(15);
    expect(otherTypes.length).toBeGreaterThan(10);
    expect(fieldComparable.length).toBeGreaterThanOrEqual(9);
  });

  it('compares Ruleset by shape, not only the §1 entity records', () => {
    // The type it would be worst to duplicate, and the reason the shape test is
    // not restricted to `*Record`: a hand-rolled
    // `{permittedTechniques, permittedForms, edicts}` is step one of a second
    // permits(), and it carries no suffix for the name test to catch.
    expect(fieldComparable.map((type) => type.name)).toContain('Ruleset');
  });

  it('reads §1 record names out of @mm/state rather than a transcribed list', () => {
    // The nine entities state-schema names. Asserted against the derived set so
    // that a record renamed in components.ts without the spec being updated
    // fails here, rather than quietly leaving the rule pointed at a dead name.
    const reserved = stateRecordNames(stateTypes);
    for (const entity of [
      'Universe',
      'Mage',
      'PopulaceCohort',
      'University',
      'Library',
      'Grimoire',
      'KnowledgeInstance',
      'Combatant',
      'Objective',
    ]) {
      expect(reserved).toContain(entity);
      expect(reserved).toContain(`${entity}Record`);
    }
  });

  it('finds no package redeclaring a type @mm/state already defines', () => {
    expect(duplicationViolations(stateTypes, otherTypes)).toEqual([]);
  });
});

describe('the duplication check would catch a redeclared type', () => {
  // Without these, "no duplicates found" is indistinguishable from "the checker
  // returns an empty array for every input".

  const probe = 'packages/rules-world/src/probe.ts';
  const declare = (source: string): DeclaredType[] =>
    exportedTypesOf('rules-world', probe, source);

  it('catches a record redeclared under its own name', () => {
    const problems = duplicationViolations(
      stateTypes,
      declare('export interface MageRecord { speciesId: number; alive: number; }\n'),
    );
    expect(problems).toHaveLength(1);
    // "names the duplicated type" — state-schema. And the file, so it can be
    // opened.
    expect(problems[0]).toContain('MageRecord');
    expect(problems[0]).toContain(probe);
  });

  it('catches it under the bare entity name too', () => {
    const problems = duplicationViolations(stateTypes, declare('export interface Mage { x: 1 }\n'));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('`Mage`');
  });

  it('catches a renamed copy by its field set, which is the shape that hides', () => {
    // The duplication that gets written in practice: same fields as the schema
    // record, a new name, and one extra field — which is the whole reason
    // somebody redeclared instead of importing.
    const mage = stateTypes.find((type) => type.name === 'MageRecord');
    const fields = (mage?.fields ?? []).map((field) => `${field}: number;`).join(' ');
    const problems = duplicationViolations(
      stateTypes,
      declare(`export interface Wizard { ${fields} nickname: number; }\n`),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('superset');
    expect(problems[0]).toContain('MageRecord');
    expect(problems[0]).toContain('Wizard');
  });

  it('catches a hand-rolled Ruleset, the copy that precedes a second permits()', () => {
    // Not a `*Record`, so only the shape test can see it — and it is the one
    // duplicate with a rule attached: contracts.md §1.1 gives ruleset legality
    // exactly one implementation, and a private copy of its input type is how a
    // second one starts.
    const problems = duplicationViolations(
      stateTypes,
      declare(
        'interface LocalRuleset { permittedTechniques: number; permittedForms: number; ' +
          'edicts: readonly unknown[]; traditionId: number; }\n',
      ),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('LocalRuleset');
    expect(problems[0]).toContain('Ruleset');
  });

  it('catches a duplicate that was never exported', () => {
    const problems = duplicationViolations(
      stateTypes,
      declare('interface MageRecord { speciesId: number; }\n'),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('MageRecord');
  });

  it('catches a type alias as readily as an interface', () => {
    const problems = duplicationViolations(
      stateTypes,
      declare('export type UniverseRecord = { favor: number };\n'),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('UniverseRecord');
  });

  it('reports every duplicate in one run, not the first', () => {
    const problems = duplicationViolations(
      stateTypes,
      declare(
        'export interface MageRecord { a: 1 }\nexport interface GrimoireRecord { b: 1 }\n' +
          'export interface Combatant { c: 1 }\n',
      ),
    );
    expect(problems).toHaveLength(3);
  });
});

describe('the duplication check leaves sharing alone', () => {
  // The positive controls. A checker that rejected every exported type would
  // pass every negative assertion above and would also forbid the packages from
  // declaring anything at all.

  const probe = 'packages/rules-world/src/probe.ts';
  const declare = (source: string): DeclaredType[] =>
    exportedTypesOf('rules-world', probe, source);

  it('allows extending a shared record, which is consumption', () => {
    // Only locally declared members count, so the inherited fields are not
    // attributed to the extender and the superset test does not fire.
    expect(
      duplicationViolations(
        stateTypes,
        declare('export interface StaffedMage extends MageRecord { postId: number; }\n'),
      ),
    ).toEqual([]);
  });

  it('allows a type of the package’s own that shares a field name or two', () => {
    expect(
      duplicationViolations(
        stateTypes,
        declare('export interface ResearchProgress { nodeId: number; progress: number; }\n'),
      ),
    ).toEqual([]);
  });

  it('allows a union or function type, which has no field set to compare', () => {
    const declared = declare(
      'export type Outcome = "ok" | "lost";\nexport type Score = (mage: number) => number;\n',
    );
    expect(declared.map((type) => type.fields)).toEqual([undefined, undefined]);
    expect(duplicationViolations(stateTypes, declared)).toEqual([]);
  });

  it('ignores a re-export of the shared type, which is exactly what is wanted', () => {
    expect(declare('export type { MageRecord } from "@mm/state";\n')).toEqual([]);
  });

  it('ignores a type that is only the text of a type', () => {
    expect(
      declare(
        'const probe = `export interface MageRecord { a: 1 }`;\n' +
          '// export interface Combatant { b: 1 }\n' +
          'export { probe };\n',
      ),
    ).toEqual([]);
  });
});
