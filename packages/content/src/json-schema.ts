/*
 * Multiverse Mages — the content package's JSON Schema interpreter.
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
 * A deliberately small interpreter for the JSON Schema subset the content
 * schemas use.
 *
 * **Why this exists rather than a library.** The loader is runtime code and this
 * package declares no runtime dependencies, so a third-party validator could
 * only ever be a test-side cross-check — content shipped to a player, a worker
 * in the Monte Carlo pool, or a server would still need a validator that is
 * always present. The subset is small because the schemas are: objects with
 * fixed keys, integers with ranges, kebab-case strings, and arrays of those.
 *
 * **The interpreter cannot silently fall behind the schemas.** Any keyword it
 * does not implement is a compile-time throw, not an ignored annotation. A
 * validator that quietly skips `maxItems` because nobody taught it that keyword
 * is worse than no validator: it reports success it did not establish.
 *
 * **Nor can a keyword it does implement be written somewhere it has no effect.**
 * There are four ways to do that, and all four compile clean in a naive reading:
 * a sibling of `$ref` (resolution replaces the whole subschema, so the sibling
 * is discarded), a `$ref` whose target is itself a `$ref` (resolution is one
 * lookup, so the second hop never happens), a `$defs` below the root (no `$ref`
 * can name it), and a keyword whose *value* has the wrong shape — `minItems:
 * "5"`, `uniqueItems: "true"`, `enum` as a string — which every assertion below
 * skips past its `typeof` guard without a word. Each is rejected at compile
 * time, for the same reason an unimplemented keyword is: a constraint that
 * enforces nothing while reading as though it did is worse than its absence.
 *
 * `type: "number"` is rejected outright. Content is fixed-point integers at
 * scale 1024 (`docs/design/contracts.md` §0); a schema that admits a float is a
 * schema that admits a determinism bug.
 *
 * **`oneOf` is interpreted with one deliberate deviation from draft 2020-12.**
 * `node.schema.json`'s `condition` def writes `additionalProperties: false` at
 * the parent level with no sibling `properties`, and puts each variant's extra
 * fields (`cell`, `minNodes`, …) inside its `oneOf` branch. Under a strict
 * reading `additionalProperties` only ever sees the *parent's own* `properties`,
 * so the schema would reject every instance, including the ones it exists to
 * accept — `kind: "holds-cell"` would fail for carrying `cell` at all. Since the
 * schema is normative and frozen, the interpreter instead resolves the single
 * matching branch first and folds its `properties` and `required` into the
 * parent's before running the usual object check — so `additionalProperties`
 * sees the variant's fields as declared, the way `unevaluatedProperties` would
 * in a stricter dialect this interpreter does not implement. When no branch
 * matches, this reports the closest branch's own diagnostics rather than every
 * branch's — a three-way cascade for one wrong `kind` would bury the one line
 * an author needs.
 */

import type { ContentDiagnostic } from './diagnostics.js';
import { pointerAppend } from './diagnostics.js';

/** Keywords this interpreter carries no assertion for, and merely tolerates. */
const ANNOTATION_KEYWORDS: ReadonlySet<string> = new Set([
  '$schema',
  '$id',
  'title',
  'description',
  '$comment',
]);

/** Keywords this interpreter implements. */
const ASSERTION_KEYWORDS: ReadonlySet<string> = new Set([
  '$ref',
  '$defs',
  'type',
  'enum',
  'const',
  'required',
  'properties',
  'additionalProperties',
  'propertyNames',
  'items',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'minProperties',
  'oneOf',
]);

/** Instance types the interpreter can assert. `number` is deliberately absent. */
const SUPPORTED_TYPES: ReadonlySet<string> = new Set([
  'object',
  'array',
  'string',
  'integer',
  'boolean',
  'null',
]);

/** Raised while compiling a schema document, never while validating content. */
export class SchemaCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaCompileError';
  }
}

type SchemaObject = Readonly<Record<string, unknown>>;

/**
 * A schema document, checked once for keywords this interpreter understands and
 * then reusable against many instances.
 */
export class CompiledSchema {
  readonly #root: SchemaObject;
  readonly #defs: ReadonlyMap<string, SchemaObject>;
  /** Where the schema document itself came from, for compile errors. */
  readonly #origin: string;

  constructor(document: unknown, origin: string) {
    if (!isPlainObject(document)) {
      throw new SchemaCompileError(`${origin}: schema document must be a JSON object`);
    }
    this.#origin = origin;
    this.#root = document;

    const defs = new Map<string, SchemaObject>();
    const rawDefs = document['$defs'];
    if (rawDefs !== undefined) {
      if (!isPlainObject(rawDefs)) {
        throw new SchemaCompileError(`${origin}: "$defs" must be an object`);
      }
      for (const [name, value] of Object.entries(rawDefs)) {
        if (!isPlainObject(value)) {
          throw new SchemaCompileError(`${origin}: "$defs/${name}" must be an object`);
        }
        defs.set(name, value);
      }
    }
    this.#defs = defs;

    this.#compileCheck(document, '#');
    for (const [name, value] of defs) this.#compileCheck(value, `#/$defs/${name}`);
  }

  /**
   * Rejects a keyword whose value has a shape the assertion cannot read.
   *
   * Every check in `validate` is guarded by `typeof`, so `minItems: "5"` is not
   * an error there — it is a silent no-op, and the schema still reads as though
   * the bound existed. That is the same defect as an unimplemented keyword,
   * arrived at by a typo instead of an omission.
   */
  #checkKeywordShapes(schema: SchemaObject, where: string): void {
    const bad = (keyword: string, wanted: string): never => {
      throw new SchemaCompileError(
        `${this.#origin}: "${keyword}" at ${where} must be ${wanted}, got ` +
          `${JSON.stringify(schema[keyword]) ?? 'undefined'}. A keyword the assertions cannot read ` +
          'is skipped in silence, which is a constraint that enforces nothing.',
      );
    };

    for (const keyword of ['minimum', 'maximum'] as const) {
      const value = schema[keyword];
      if (value !== undefined && !Number.isInteger(value)) bad(keyword, 'an integer');
    }
    for (const keyword of ['minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties'] as const) {
      const value = schema[keyword];
      if (value === undefined) continue;
      if (!Number.isInteger(value) || (value as number) < 0) bad(keyword, 'a non-negative integer');
    }

    const unique = schema['uniqueItems'];
    if (unique !== undefined && typeof unique !== 'boolean') bad('uniqueItems', 'a boolean');

    const enumValues = schema['enum'];
    if (enumValues !== undefined && (!Array.isArray(enumValues) || enumValues.length === 0)) {
      bad('enum', 'a non-empty array');
    }

    const required = schema['required'];
    if (required !== undefined) {
      if (!Array.isArray(required) || required.some((name) => typeof name !== 'string')) {
        bad('required', 'an array of strings');
      }
    }

    const pattern = schema['pattern'];
    if (typeof pattern === 'string') {
      try {
        new RegExp(pattern, 'u');
      } catch {
        throw new SchemaCompileError(
          `${this.#origin}: "pattern" at ${where} is not a valid regular expression: ${pattern}. ` +
            'Left to validation it would throw from inside whichever record was checked first.',
        );
      }
    }
  }

  /**
   * Walks a subschema rejecting anything the interpreter would not enforce.
   * Called for its throws; it returns nothing.
   */
  #compileCheck(schema: SchemaObject, where: string): void {
    for (const keyword of Object.keys(schema)) {
      if (ANNOTATION_KEYWORDS.has(keyword) || ASSERTION_KEYWORDS.has(keyword)) continue;
      throw new SchemaCompileError(
        `${this.#origin}: unsupported JSON Schema keyword "${keyword}" at ${where}. ` +
          `This interpreter enforces only ${[...ASSERTION_KEYWORDS].sort().join(', ')}; ` +
          'add the keyword to json-schema.ts before using it in a schema, so that no ' +
          'schema constraint can be silently unenforced.',
      );
    }

    const type = schema['type'];
    if (type !== undefined) {
      if (typeof type !== 'string' || !SUPPORTED_TYPES.has(type)) {
        throw new SchemaCompileError(
          `${this.#origin}: unsupported "type" ${JSON.stringify(type)} at ${where}. ` +
            `Supported: ${[...SUPPORTED_TYPES].sort().join(', ')}. ` +
            '"number" is excluded on purpose — content is fixed-point integers at scale 1024.',
        );
      }
    }

    if (Object.hasOwn(schema, '$defs') && where !== '#') {
      throw new SchemaCompileError(
        `${this.#origin}: "$defs" at ${where} is not at the document root. Only "#/$defs/<name>" ` +
          'references resolve, so nothing can ever reach a nested definition and any constraint ' +
          'written inside one is dead.',
      );
    }

    const ref = schema['$ref'];
    if (ref !== undefined) {
      if (typeof ref !== 'string' || !ref.startsWith('#/$defs/')) {
        throw new SchemaCompileError(
          `${this.#origin}: "$ref" at ${where} must be a local "#/$defs/<name>" reference, got ${JSON.stringify(ref)}`,
        );
      }
      const target = this.#defs.get(ref.slice('#/$defs/'.length));
      if (target === undefined) {
        throw new SchemaCompileError(`${this.#origin}: "$ref" at ${where} names a missing def: ${ref}`);
      }

      // Resolution replaces the subschema wholesale, so anything written beside
      // a `$ref` is discarded. `$defs` and the annotations are exempt: they are
      // not assertions, and a root `$ref` has to be able to sit beside `$defs`.
      const siblings = Object.keys(schema).filter(
        (keyword) => keyword !== '$ref' && keyword !== '$defs' && !ANNOTATION_KEYWORDS.has(keyword),
      );
      if (siblings.length > 0) {
        throw new SchemaCompileError(
          `${this.#origin}: "$ref" at ${where} carries sibling keyword(s) ${siblings.sort().join(', ')}. ` +
            'Resolution replaces the subschema with the definition, so a sibling assertion is ' +
            'silently discarded — move it into the definition, or inline the definition here.',
        );
      }

      // Resolution is a single lookup, not a loop, so a definition that is
      // itself a `$ref` enforces nothing at all.
      if (typeof target['$ref'] === 'string') {
        throw new SchemaCompileError(
          `${this.#origin}: "$ref" at ${where} resolves to ${ref}, which is itself a "$ref". ` +
            'Resolution does not chain, so the second definition is never applied.',
        );
      }
    }

    const pattern = schema['pattern'];
    if (pattern !== undefined && typeof pattern !== 'string') {
      throw new SchemaCompileError(`${this.#origin}: "pattern" at ${where} must be a string`);
    }

    this.#checkKeywordShapes(schema, where);

    for (const nested of ['items', 'propertyNames'] as const) {
      const value = schema[nested];
      if (value === undefined) continue;
      if (!isPlainObject(value)) {
        throw new SchemaCompileError(`${this.#origin}: "${nested}" at ${where} must be a schema object`);
      }
      this.#compileCheck(value, `${where}/${nested}`);
    }

    const properties = schema['properties'];
    if (properties !== undefined) {
      if (!isPlainObject(properties)) {
        throw new SchemaCompileError(`${this.#origin}: "properties" at ${where} must be an object`);
      }
      for (const [name, value] of Object.entries(properties)) {
        if (!isPlainObject(value)) {
          throw new SchemaCompileError(
            `${this.#origin}: "properties/${name}" at ${where} must be a schema object`,
          );
        }
        this.#compileCheck(value, `${where}/properties/${name}`);
      }
    }

    const oneOf = schema['oneOf'];
    if (oneOf !== undefined) {
      if (!Array.isArray(oneOf) || oneOf.length === 0) {
        throw new SchemaCompileError(`${this.#origin}: "oneOf" at ${where} must be a non-empty array`);
      }
      for (let index = 0; index < oneOf.length; index += 1) {
        const branch = oneOf[index];
        if (!isPlainObject(branch)) {
          throw new SchemaCompileError(
            `${this.#origin}: "oneOf/${String(index)}" at ${where} must be a schema object`,
          );
        }
        this.#compileCheck(branch, `${where}/oneOf/${String(index)}`);
      }
    }

    const additional = schema['additionalProperties'];
    if (additional !== undefined && additional !== false) {
      if (!isPlainObject(additional)) {
        throw new SchemaCompileError(
          `${this.#origin}: "additionalProperties" at ${where} must be false or a schema object`,
        );
      }
      this.#compileCheck(additional, `${where}/additionalProperties`);
    }
  }

  /** Validates one instance, returning every violation found. */
  validate(instance: unknown, file: string): ContentDiagnostic[] {
    const out: ContentDiagnostic[] = [];
    this.#check(this.#root, instance, '', file, out);
    return out;
  }

  #resolve(schema: SchemaObject): SchemaObject {
    const ref = schema['$ref'];
    if (typeof ref !== 'string') return schema;
    const target = this.#defs.get(ref.slice('#/$defs/'.length));
    // Compile-time checks guarantee the target exists.
    return target ?? schema;
  }

  #check(
    rawSchema: SchemaObject,
    instance: unknown,
    pointer: string,
    file: string,
    out: ContentDiagnostic[],
  ): void {
    const schema = this.#resolve(rawSchema);
    const fail = (message: string): void => {
      out.push({ file, pointer, code: 'schema', message });
    };

    const type = schema['type'];
    if (typeof type === 'string' && !matchesType(type, instance)) {
      fail(`expected ${type}, got ${describeType(instance)}`);
      // Every remaining assertion assumes the type held; reporting them too
      // would bury the one line the author needs under derived noise.
      return;
    }

    const constValue = schema['const'];
    if (constValue !== undefined && !sameJson(instance, constValue)) {
      fail(`must equal ${JSON.stringify(constValue)}`);
    }

    const enumValues = schema['enum'];
    if (Array.isArray(enumValues) && !enumValues.some((candidate) => sameJson(instance, candidate))) {
      fail(`must be one of ${enumValues.map((v) => JSON.stringify(v)).join(', ')}, got ${JSON.stringify(instance)}`);
    }

    if (typeof instance === 'string') this.#checkString(schema, instance, fail);
    if (typeof instance === 'number') this.#checkNumber(schema, instance, fail);
    if (Array.isArray(instance)) this.#checkArray(schema, instance, pointer, file, out, fail);
    if (isPlainObject(instance)) {
      const oneOf = schema['oneOf'];
      if (Array.isArray(oneOf)) {
        this.#checkOneOf(schema, oneOf as readonly SchemaObject[], instance, pointer, file, out);
      } else {
        this.#checkObject(schema, instance, pointer, file, out, fail);
      }
    }
  }

  #checkString(schema: SchemaObject, instance: string, fail: (message: string) => void): void {
    const minLength = schema['minLength'];
    if (typeof minLength === 'number' && instance.length < minLength) {
      fail(`string is shorter than minLength ${String(minLength)}`);
    }
    const maxLength = schema['maxLength'];
    if (typeof maxLength === 'number' && instance.length > maxLength) {
      fail(`string is longer than maxLength ${String(maxLength)}`);
    }
    const pattern = schema['pattern'];
    if (typeof pattern === 'string' && !new RegExp(pattern, 'u').test(instance)) {
      fail(`${JSON.stringify(instance)} does not match pattern ${pattern}`);
    }
  }

  #checkNumber(schema: SchemaObject, instance: number, fail: (message: string) => void): void {
    const minimum = schema['minimum'];
    if (typeof minimum === 'number' && instance < minimum) {
      fail(`${String(instance)} is below minimum ${String(minimum)}`);
    }
    const maximum = schema['maximum'];
    if (typeof maximum === 'number' && instance > maximum) {
      fail(`${String(instance)} is above maximum ${String(maximum)}`);
    }
  }

  #checkArray(
    schema: SchemaObject,
    instance: readonly unknown[],
    pointer: string,
    file: string,
    out: ContentDiagnostic[],
    fail: (message: string) => void,
  ): void {
    const minItems = schema['minItems'];
    if (typeof minItems === 'number' && instance.length < minItems) {
      fail(`expected at least ${String(minItems)} items, got ${String(instance.length)}`);
    }
    const maxItems = schema['maxItems'];
    if (typeof maxItems === 'number' && instance.length > maxItems) {
      fail(`expected at most ${String(maxItems)} items, got ${String(instance.length)}`);
    }
    if (schema['uniqueItems'] === true) {
      const seen = new Set<string>();
      for (let index = 0; index < instance.length; index += 1) {
        const key = canonicalJson(instance[index]);
        if (seen.has(key)) {
          out.push({
            file,
            pointer: pointerAppend(pointer, index),
            code: 'schema',
            message: `duplicate item ${key} in a uniqueItems array`,
          });
        }
        seen.add(key);
      }
    }
    const items = schema['items'];
    if (isPlainObject(items)) {
      for (let index = 0; index < instance.length; index += 1) {
        this.#check(items, instance[index], pointerAppend(pointer, index), file, out);
      }
    }
  }

  /**
   * Resolves `oneOf` against an object instance, deviating from strict
   * draft 2020-12 semantics for the reason documented at the top of this file.
   *
   * The instance is matched to a branch by its `const`-declared properties —
   * the discriminator every branch in the shipped schemas carries (`kind`) —
   * rather than by which branch validates cleanly. That is deliberate: a branch
   * whose discriminator matches but which is otherwise invalid (`kind:
   * "holds-cell"` missing `minNodes`) must report *that* defect, not be
   * discarded in favour of a sibling branch that merely has fewer complaints.
   */
  #checkOneOf(
    schema: SchemaObject,
    branches: readonly SchemaObject[],
    instance: Readonly<Record<string, unknown>>,
    pointer: string,
    file: string,
    out: ContentDiagnostic[],
  ): void {
    const candidates = branches.filter((branch) => branchDiscriminatorMatches(branch, instance));
    const pool = candidates.length > 0 ? candidates : branches;

    let chosen = pool[0] as SchemaObject;
    let fewest = Number.POSITIVE_INFINITY;
    for (const branch of pool) {
      const local: ContentDiagnostic[] = [];
      this.#check(branch, instance, pointer, file, local);
      if (local.length < fewest) {
        fewest = local.length;
        chosen = branch;
      }
      if (fewest === 0) break;
    }

    if (candidates.length === 0) {
      // No branch's discriminator matches: report the closest branch's own
      // diagnostics rather than every branch's — see the file header.
      this.#check(chosen, instance, pointer, file, out);
      return;
    }

    // Fold the matching branch's `properties` and `required` into the parent's
    // so `additionalProperties: false` at the parent sees the branch's fields
    // as declared. See the file header for why this departs from strict
    // `oneOf` semantics.
    const parentProperties = isPlainObject(schema['properties']) ? schema['properties'] : {};
    const branchProperties = isPlainObject(chosen['properties']) ? chosen['properties'] : {};
    const parentRequired = Array.isArray(schema['required']) ? schema['required'] : [];
    const branchRequired = Array.isArray(chosen['required']) ? chosen['required'] : [];
    const merged: SchemaObject = {
      ...schema,
      properties: { ...parentProperties, ...branchProperties },
      required: [...new Set([...parentRequired, ...branchRequired])],
    };
    const fail = (message: string): void => {
      out.push({ file, pointer, code: 'schema', message });
    };
    this.#checkObject(merged, instance, pointer, file, out, fail);
  }

  #checkObject(
    schema: SchemaObject,
    instance: Readonly<Record<string, unknown>>,
    pointer: string,
    file: string,
    out: ContentDiagnostic[],
    fail: (message: string) => void,
  ): void {
    const minProperties = schema['minProperties'];
    if (typeof minProperties === 'number' && Object.keys(instance).length < minProperties) {
      fail(`expected at least ${String(minProperties)} propert${minProperties === 1 ? 'y' : 'ies'}, got ${String(Object.keys(instance).length)}`);
    }

    const required = schema['required'];
    if (Array.isArray(required)) {
      for (const name of required) {
        if (typeof name === 'string' && !Object.hasOwn(instance, name)) {
          out.push({
            file,
            pointer,
            code: 'schema',
            message: `missing required property "${name}"`,
          });
        }
      }
    }

    const properties = isPlainObject(schema['properties']) ? schema['properties'] : {};
    const additional = schema['additionalProperties'];
    const propertyNames = schema['propertyNames'];

    for (const [name, value] of Object.entries(instance)) {
      const childPointer = pointerAppend(pointer, name);

      if (isPlainObject(propertyNames)) {
        this.#check(propertyNames, name, childPointer, file, out);
      }

      const declared = properties[name];
      if (isPlainObject(declared)) {
        this.#check(declared, value, childPointer, file, out);
        continue;
      }

      if (additional === false) {
        fail(`unexpected property "${name}"`);
        continue;
      }
      if (isPlainObject(additional)) {
        this.#check(additional, value, childPointer, file, out);
      }
    }
  }
}

/**
 * Whether a `oneOf` branch's own `const`-declared properties are consistent
 * with an instance.
 *
 * A branch that declares no `const` property at all never conflicts — it is
 * not using the discriminator pattern, so it stays a candidate. A branch that
 * declares one and disagrees with the instance's value is ruled out. This is
 * deliberately about *disagreement*, not full validity: a branch can match the
 * discriminator and still be invalid in some other way, which is exactly the
 * case {@link CompiledSchema.#checkOneOf} exists to report accurately.
 */
function branchDiscriminatorMatches(
  branch: SchemaObject,
  instance: Readonly<Record<string, unknown>>,
): boolean {
  const properties = branch['properties'];
  if (!isPlainObject(properties)) return true;
  for (const [name, subschema] of Object.entries(properties)) {
    if (!isPlainObject(subschema)) continue;
    const constValue = subschema['const'];
    if (constValue === undefined) continue;
    if (!Object.hasOwn(instance, name)) continue;
    if (!sameJson(instance[name], constValue)) return false;
  }
  return true;
}

function matchesType(type: string, instance: unknown): boolean {
  switch (type) {
    case 'object':
      return isPlainObject(instance);
    case 'array':
      return Array.isArray(instance);
    case 'string':
      return typeof instance === 'string';
    case 'integer':
      return typeof instance === 'number' && Number.isInteger(instance);
    case 'boolean':
      return typeof instance === 'boolean';
    case 'null':
      return instance === null;
    default:
      return false;
  }
}

function describeType(instance: unknown): string {
  if (instance === null) return 'null';
  if (Array.isArray(instance)) return 'array';
  if (typeof instance === 'number') {
    return Number.isInteger(instance) ? 'integer' : 'a non-integer number';
  }
  return typeof instance;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/**
 * JSON with object keys in code-unit order.
 *
 * Used for equality comparison here and, more consequentially, as the preimage
 * of `contentRevision` — so it must be a pure function of the value and never of
 * insertion order.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}
