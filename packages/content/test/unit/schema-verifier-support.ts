/*
 * Multiverse Mages — shared machinery for the three schema verifiers.
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
 * The eight content schemas are enforcement machinery, and this repository has
 * shipped three enforcement rules that read correctly and enforced nothing. A
 * JSON Schema fails that way twice over: a keyword the interpreter does not
 * implement, and a constraint no content could ever violate.
 *
 * This module holds what the verifiers share — a structural walk of the schema
 * documents, a walk of the shipped content *against* those documents that
 * records which instance each subschema actually judged, and pointer-directed
 * mutation. Nothing here asserts; the assertions live in the three
 * `schema-*-liveness` / `schema-doc-agreement` suites.
 *
 * Everything is derived by walking, never by a hand-written list. A hand-written
 * list of "the keywords we use" is the exact artefact that goes stale silently.
 */

import { readFileSync } from 'node:fs';

import type { ContentFileName } from '@mm/content';
import { CONTENT_FILES, shippedDataDirectory, shippedSchemaDirectory } from '@mm/content';

export type SchemaObject = Record<string, unknown>;

/** JSON pointer into a *schema document*, rooted at `#`. */
export type SchemaPointer = string;

/** JSON pointer into a *content document*. `''` is the document itself. */
export type InstancePointer = string;

export function isPlainObject(value: unknown): value is SchemaObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Reading the shipped schemas and content

/** The schema file name that governs a content file. */
export function schemaFileFor(contentFile: ContentFileName): string {
  return contentFile.replace(/\.json$/u, '.schema.json');
}

/** Parses the eight shipped schema documents, keyed by the content file. */
export function shippedSchemaDocuments(): Map<ContentFileName, SchemaObject> {
  const directory = shippedSchemaDirectory();
  const out = new Map<ContentFileName, SchemaObject>();
  for (const contentFile of CONTENT_FILES) {
    const text = readFileSync(`${directory}/${schemaFileFor(contentFile)}`, 'utf8');
    const parsed: unknown = JSON.parse(text);
    if (!isPlainObject(parsed)) throw new Error(`${schemaFileFor(contentFile)} is not an object`);
    out.set(contentFile, parsed);
  }
  return out;
}

/** Parses the seven shipped content documents. */
export function shippedContentDocuments(): Map<ContentFileName, unknown> {
  const directory = shippedDataDirectory();
  const out = new Map<ContentFileName, unknown>();
  for (const contentFile of CONTENT_FILES) {
    out.set(contentFile, JSON.parse(readFileSync(`${directory}/${contentFile}`, 'utf8')));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Structural walk of a schema document

/**
 * Every subschema position in a document, keyed by its pointer.
 *
 * The walk is *structural*, not `$ref`-following: `#/$defs/contentId` appears
 * once, under its own pointer, however many places reference it. Positions are
 * exactly the places the interpreter's own `#compileCheck` descends into, so a
 * position this walk misses would be a position the interpreter never checked
 * either — and that symmetry is itself asserted in the keyword-liveness suite.
 */
export function subschemaPositions(document: SchemaObject): Map<SchemaPointer, SchemaObject> {
  const out = new Map<SchemaPointer, SchemaObject>();
  descend(document, '#', out);

  const defs = document['$defs'];
  if (isPlainObject(defs)) {
    for (const [name, value] of Object.entries(defs)) {
      if (isPlainObject(value)) descend(value, `#/$defs/${name}`, out);
    }
  }
  return out;
}

function descend(schema: SchemaObject, pointer: SchemaPointer, out: Map<SchemaPointer, SchemaObject>): void {
  out.set(pointer, schema);

  for (const nested of ['items', 'propertyNames'] as const) {
    const value = schema[nested];
    if (isPlainObject(value)) descend(value, `${pointer}/${nested}`, out);
  }

  const properties = schema['properties'];
  if (isPlainObject(properties)) {
    for (const [name, value] of Object.entries(properties)) {
      if (isPlainObject(value)) descend(value, `${pointer}/properties/${name}`, out);
    }
  }

  const additional = schema['additionalProperties'];
  if (isPlainObject(additional)) descend(additional, `${pointer}/additionalProperties`, out);
}

/** One keyword, at one position, in one schema document. */
export interface KeywordOccurrence {
  readonly contentFile: ContentFileName;
  readonly schemaFile: string;
  readonly pointer: SchemaPointer;
  readonly keyword: string;
}

/**
 * Every keyword actually written in a schema document.
 *
 * Structure-aware on purpose: keys under `properties` and `$defs` are *names*,
 * and `enum` members are *values*. A naive `JSON.stringify`-and-grep walker
 * would report a property named `pattern` as a use of the `pattern` keyword,
 * and the report would be wrong in the direction that hides a real gap.
 */
export function keywordOccurrences(
  contentFile: ContentFileName,
  document: SchemaObject,
): KeywordOccurrence[] {
  const schemaFile = schemaFileFor(contentFile);
  const out: KeywordOccurrence[] = [];
  for (const [pointer, schema] of subschemaPositions(document)) {
    for (const keyword of Object.keys(schema)) {
      out.push({ contentFile, schemaFile, pointer, keyword });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Constraints

/**
 * One assertion a schema makes, at one position.
 *
 * `required` produces one constraint *per named field*, because "the schema has
 * a required list" and "the schema will reject content missing `tier`" are
 * different claims and only the second one is worth anything.
 */
export interface Constraint {
  readonly contentFile: ContentFileName;
  readonly pointer: SchemaPointer;
  readonly keyword: string;
  /** Set only for `required`: the field name this constraint is about. */
  readonly requiredName?: string;
  readonly schema: SchemaObject;
}

/** Keywords that carry an assertion, as opposed to structure or annotation. */
const CONSTRAINT_KEYWORDS = [
  'type',
  'enum',
  'const',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'pattern',
  'minItems',
  'maxItems',
  'uniqueItems',
  'additionalProperties',
  'propertyNames',
  'required',
] as const;

/** Keywords that only carry structure, and are asserted through their children. */
export const STRUCTURAL_KEYWORDS: ReadonlySet<string> = new Set([
  '$ref',
  '$defs',
  'properties',
  'items',
]);

/**
 * Every constraint a schema document declares.
 *
 * `additionalProperties` counts only when it is `false` — as a subschema it is
 * structure, and its own constraints are enumerated at its own position.
 * `uniqueItems` counts only when it is `true`, since `false` asserts nothing.
 */
export function constraintsOf(contentFile: ContentFileName, document: SchemaObject): Constraint[] {
  const out: Constraint[] = [];
  for (const [pointer, schema] of subschemaPositions(document)) {
    for (const keyword of CONSTRAINT_KEYWORDS) {
      if (!Object.hasOwn(schema, keyword)) continue;
      const value = schema[keyword];

      if (keyword === 'additionalProperties' && value !== false) continue;
      if (keyword === 'uniqueItems' && value !== true) continue;

      if (keyword === 'required') {
        if (!Array.isArray(value)) continue;
        for (const name of value) {
          if (typeof name === 'string') {
            out.push({ contentFile, pointer, keyword, requiredName: name, schema });
          }
        }
        continue;
      }

      out.push({ contentFile, pointer, keyword, schema });
    }
  }
  return out;
}

/** `cell.json#/$defs/cell/properties/tier maxItems` — one line, greppable. */
export function describeConstraint(constraint: Constraint): string {
  const suffix = constraint.requiredName === undefined ? '' : `:${constraint.requiredName}`;
  return `${schemaFileFor(constraint.contentFile)}${constraint.pointer} ${constraint.keyword}${suffix}`;
}

// ---------------------------------------------------------------------------
// Walking content against a schema, to learn which instance each position judged

/** One place a subschema position was actually applied to shipped content. */
export interface InstanceSite {
  readonly pointer: InstancePointer;
  /**
   * True when the "instance" is a property *name* rather than a value, which is
   * what `propertyNames` judges. Mutating one means renaming a key, so value
   * sites are preferred wherever both exist.
   */
  readonly isKey: boolean;
}

/**
 * Maps each subschema pointer to every content location it judged.
 *
 * This mirrors the interpreter's own descent, including the way `$ref` replaces
 * the position with the target def: a constraint written in `#/$defs/contentId`
 * is enforced at every id in the file, and the verifier needs to know that so
 * it can mutate one of them.
 */
export function instanceSites(
  document: SchemaObject,
  instance: unknown,
): Map<SchemaPointer, InstanceSite[]> {
  const out = new Map<SchemaPointer, InstanceSite[]>();
  walkInstance(document, document, '#', instance, '', false, out);
  return out;
}

function walkInstance(
  document: SchemaObject,
  rawSchema: SchemaObject,
  rawPointer: SchemaPointer,
  instance: unknown,
  instancePointer: InstancePointer,
  isKey: boolean,
  out: Map<SchemaPointer, InstanceSite[]>,
): void {
  let schema = rawSchema;
  let pointer = rawPointer;

  const ref = rawSchema['$ref'];
  if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
    const name = ref.slice('#/$defs/'.length);
    const defs = document['$defs'];
    const target = isPlainObject(defs) ? defs[name] : undefined;
    if (!isPlainObject(target)) return;
    schema = target;
    pointer = `#/$defs/${name}`;
  }

  const existing = out.get(pointer);
  if (existing === undefined) out.set(pointer, [{ pointer: instancePointer, isKey }]);
  else existing.push({ pointer: instancePointer, isKey });

  if (Array.isArray(instance)) {
    const items = schema['items'];
    if (isPlainObject(items)) {
      for (let index = 0; index < instance.length; index += 1) {
        walkInstance(
          document,
          items,
          `${pointer}/items`,
          instance[index],
          `${instancePointer}/${String(index)}`,
          false,
          out,
        );
      }
    }
    return;
  }

  if (!isPlainObject(instance)) return;

  const properties = schema['properties'];
  const declaredProperties = isPlainObject(properties) ? properties : {};
  const additional = schema['additionalProperties'];
  const propertyNames = schema['propertyNames'];

  for (const [name, value] of Object.entries(instance)) {
    const childPointer = `${instancePointer}/${escapePointerSegment(name)}`;

    if (isPlainObject(propertyNames)) {
      walkInstance(document, propertyNames, `${pointer}/propertyNames`, name, childPointer, true, out);
    }

    const declared = declaredProperties[name];
    if (isPlainObject(declared)) {
      walkInstance(document, declared, `${pointer}/properties/${name}`, value, childPointer, false, out);
      continue;
    }
    if (isPlainObject(additional)) {
      walkInstance(document, additional, `${pointer}/additionalProperties`, value, childPointer, false, out);
    }
  }
}

/** RFC 6901 §3 escaping, matching `diagnostics.ts`. */
export function escapePointerSegment(name: string): string {
  return name.replaceAll('~', '~0').replaceAll('/', '~1');
}

// ---------------------------------------------------------------------------
// Pointer-directed reads and writes on a content document

/** Splits an RFC 6901 pointer into unescaped segments. `''` yields `[]`. */
export function pointerSegments(pointer: InstancePointer): string[] {
  if (pointer === '') return [];
  return pointer
    .slice(1)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
}

/** A document under mutation. The box exists so the root itself can be replaced. */
export interface DocumentBox {
  root: unknown;
}

export function readAt(box: DocumentBox, pointer: InstancePointer): unknown {
  let cursor: unknown = box.root;
  for (const segment of pointerSegments(pointer)) {
    if (Array.isArray(cursor)) cursor = cursor[Number(segment)];
    else if (isPlainObject(cursor)) cursor = cursor[segment];
    else return undefined;
  }
  return cursor;
}

export function writeAt(box: DocumentBox, pointer: InstancePointer, value: unknown): void {
  const segments = pointerSegments(pointer);
  if (segments.length === 0) {
    box.root = value;
    return;
  }
  const parent = readAt(box, parentPointer(pointer));
  const last = segments[segments.length - 1] as string;
  if (Array.isArray(parent)) parent[Number(last)] = value;
  else if (isPlainObject(parent)) parent[last] = value;
  else throw new Error(`cannot write ${pointer}: its parent is not a container`);
}

export function deleteAt(box: DocumentBox, pointer: InstancePointer): void {
  const segments = pointerSegments(pointer);
  const parent = readAt(box, parentPointer(pointer));
  const last = segments[segments.length - 1] as string;
  if (Array.isArray(parent)) parent.splice(Number(last), 1);
  else if (isPlainObject(parent)) delete parent[last];
  else throw new Error(`cannot delete ${pointer}: its parent is not a container`);
}

export function parentPointer(pointer: InstancePointer): InstancePointer {
  const at = pointer.lastIndexOf('/');
  return at <= 0 ? '' : pointer.slice(0, at);
}

/** Last segment of a pointer, unescaped. */
export function lastSegment(pointer: InstancePointer): string {
  const segments = pointerSegments(pointer);
  return segments[segments.length - 1] ?? '';
}

// ---------------------------------------------------------------------------
// Schema surgery, for the constraint-deletion differential

/**
 * A copy of the document with exactly one constraint removed.
 *
 * This is what turns "the loader rejected my mutation" into "the loader rejected
 * my mutation *because of this constraint*". Without it a dead `minLength` looks
 * alive whenever a live `pattern` sits beside it.
 */
export function schemaWithoutConstraint(
  document: SchemaObject,
  constraint: Constraint,
): SchemaObject {
  const copy = structuredClone(document);
  const target = navigateSchema(copy, constraint.pointer);

  if (constraint.keyword === 'required' && constraint.requiredName !== undefined) {
    const required = target['required'];
    if (Array.isArray(required)) {
      target['required'] = required.filter((name) => name !== constraint.requiredName);
    }
    return copy;
  }

  delete target[constraint.keyword];
  return copy;
}

function navigateSchema(document: SchemaObject, pointer: SchemaPointer): SchemaObject {
  let cursor: SchemaObject = document;
  for (const segment of pointer.split('/').slice(1)) {
    const next = cursor[segment];
    if (!isPlainObject(next)) throw new Error(`schema pointer ${pointer} does not resolve`);
    cursor = next;
  }
  return cursor;
}
