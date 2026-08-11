/*
 * Multiverse Mages — verifier 2: every declared constraint rejects something.
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
 * A keyword can be implemented and a constraint still be decoration.
 *
 * `minLength: 1` beside `pattern: "^[a-z0-9]+(-[a-z0-9]+)*$"` is enforced, in
 * the sense that the interpreter reads it — and it will never reject anything,
 * because the pattern already requires a character. Deleting it changes no
 * outcome for any content that could ever be written. That is what this file is
 * for, and set-membership checks cannot see it.
 *
 * ## How each constraint is proven
 *
 * For every constraint in the seven schemas, enumerated by walking the documents
 * rather than by a list:
 *
 *  1. Find a place the constraint was actually applied to shipped content — the
 *     walk in `schema-verifier-support.ts` records which instance each subschema
 *     position judged, following `$ref` the way the interpreter does.
 *  2. Mutate that one value so it violates that one constraint, and assert
 *     **`loadContent` hard-fails** with a `schema` diagnostic at that pointer.
 *  3. Compile the same schema **with that one constraint deleted**, and assert
 *     the same mutated document is now clean at that pointer.
 *
 * Step 3 is the whole point. Without it a dead constraint standing next to a
 * live one passes: the loader rejects the mutation, just not for the reason
 * claimed. With it, "this constraint rejects something nothing else does" is
 * what gets asserted.
 *
 * ## What it cannot do, stated rather than skipped
 *
 * Two constraint sites have no instance in the shipped content at all — no cell
 * carries `edicts`, no species carries `personality` — so there is nothing to
 * mutate in place. {@link SYNTHESIZED} injects a valid value for each, and the
 * suite asserts the list is both *sufficient* (no site is left without an
 * instance) and *necessary* (every entry is genuinely absent from shipped
 * content). A third constraint is unreachable by construction and is named in
 * {@link SHADOWED} with the reason.
 *
 * Everything else is proven. The counts are printed by the last test in the
 * file, computed rather than claimed.
 */

import { describe, expect, it } from 'vitest';

import type { ContentDiagnostic, ContentFileName } from '@mm/content';
import { CONTENT_FILES, CompiledSchema, loadContent, memorySource, validateContent } from '@mm/content';

import type { Constraint, DocumentBox, InstancePointer, SchemaObject } from './schema-verifier-support.js';
import {
  constraintsOf,
  describeConstraint,
  instanceSites,
  isPlainObject,
  lastSegment,
  parentPointer,
  readAt,
  schemaFileFor,
  schemaWithoutConstraint,
  shippedContentDocuments,
  shippedSchemaDocuments,
  writeAt,
  deleteAt,
} from './schema-verifier-support.js';

const schemas = shippedSchemaDocuments();

// ---------------------------------------------------------------------------
// The base document set: shipped content, plus the optional fields nothing uses

/**
 * Valid values injected into the shipped content so that optional subschemas
 * nobody authors can still be mutated.
 *
 * Each entry is asserted below to be genuinely absent from the shipped files. If
 * an author adds `edicts` to a cell, that assertion fails and says to delete the
 * entry — an allowance nobody is forced to revisit is an allowance that becomes
 * permanent.
 */
const SYNTHESIZED: readonly {
  readonly file: ContentFileName;
  readonly pointer: InstancePointer;
  readonly value: unknown;
  readonly why: string;
}[] = [
  {
    file: 'cell.json',
    pointer: '/0/edicts',
    value: ['dispensation'],
    why: 'no shipped cell seeds a starting edict, so the whole `edicts` subschema is unexercised',
  },
  {
    file: 'species.json',
    pointer: '/0/personality',
    value: { curiosity: 1024, ambition: 1024, caution: 1024 },
    why: 'no shipped species declares `personality`; contracts.md §2.4 documents it as optional',
  },
];

/**
 * Constraints that no content could violate, with the reason each is
 * unreachable. These are decoration — reported, not silently passed over.
 */
const SHADOWED: readonly { readonly constraint: string; readonly why: string }[] = [
  ...(['technique', 'form', 'cell', 'node', 'species', 'tradition', 'primitive'] as const).map(
    (name) => ({
      constraint: `${name}.schema.json#/$defs/contentId minLength`,
      why:
        'minLength is 1 and the sibling pattern ^[a-z0-9]+(-[a-z0-9]+)*$ already requires at least ' +
        'one character, so no string violates minLength without also violating pattern',
    }),
  ),
  {
    constraint: 'cell.schema.json#/$defs/cell/properties/edicts maxItems',
    why:
      'maxItems is 2, the item enum has exactly 2 members, and uniqueItems is true — a third ' +
      'element is necessarily a duplicate, so maxItems can never be the only thing violated',
  },
  // `type: "string"` beside a string `enum` asserts nothing the enum does not
  // already assert: every non-string is outside the enum too. Idiomatic, and
  // still decoration — recorded so the claim "every constraint rejects
  // something" stays true as written.
  ...[
    'cell.schema.json#/$defs/cell/properties/edicts/items',
    'node.schema.json#/$defs/node/properties/tuningStatus',
    'node.schema.json#/$defs/effect/properties/target',
    'species.schema.json#/$defs/species/properties/tuningStatus',
    'primitive.schema.json#/$defs/primitive/properties/scale',
    'primitive.schema.json#/$defs/primitive/properties/stacking',
    'primitive.schema.json#/$defs/cap/properties/kind',
  ].map((pointer) => ({
    constraint: `${pointer} type`,
    why:
      'the sibling enum lists only strings, so any value that violates `type: "string"` violates ' +
      'the enum as well and the type assertion never fires alone',
  })),
];

const shipped = shippedContentDocuments();

function baseDocuments(): Map<ContentFileName, unknown> {
  const out = new Map<ContentFileName, unknown>();
  for (const file of CONTENT_FILES) out.set(file, structuredClone(shipped.get(file)));
  for (const injection of SYNTHESIZED) {
    const box: DocumentBox = { root: out.get(injection.file) };
    writeAt(box, injection.pointer, structuredClone(injection.value));
    out.set(injection.file, box.root);
  }
  return out;
}

function sourceOf(documents: ReadonlyMap<ContentFileName, unknown>): ReturnType<typeof memorySource> {
  const files: Record<string, string> = {};
  for (const file of CONTENT_FILES) files[file] = JSON.stringify(documents.get(file));
  return memorySource(files, 'constraint-liveness');
}

// ---------------------------------------------------------------------------
// Enumerating constraints and the content each one judged

const constraints: Constraint[] = [...schemas].flatMap(([file, document]) =>
  constraintsOf(file, document),
);

const sitesByFile = new Map<ContentFileName, Map<string, { pointer: string; isKey: boolean }[]>>();
{
  const documents = baseDocuments();
  for (const [file, document] of schemas) {
    sitesByFile.set(file, instanceSites(document, documents.get(file)));
  }
}

/**
 * The instances this constraint could be proven against, richest first.
 *
 * More than one is needed because the first record in a file is not always a
 * usable specimen: `cell.json`'s first cell has an empty `classicalLabels`, and
 * an empty array cannot demonstrate `uniqueItems`. Ordering by size means the
 * first candidate is almost always the one that works, so the extra candidates
 * cost nothing in the common case.
 *
 * Key sites — the property *names* `propertyNames` judges — sort last: a
 * constraint is better demonstrated on a value than on a rename.
 */
function targetsFor(constraint: Constraint): string[] {
  const sites = sitesByFile.get(constraint.contentFile)?.get(constraint.pointer) ?? [];
  const documents = baseDocuments();
  const box: DocumentBox = { root: documents.get(constraint.contentFile) };

  const size = (pointer: string): number => {
    const value = readAt(box, pointer);
    if (Array.isArray(value)) return value.length;
    if (isPlainObject(value)) return Object.keys(value).length;
    return 0;
  };

  return [...sites]
    .sort((a, b) => {
      if (a.isKey !== b.isKey) return a.isKey ? 1 : -1;
      return size(b.pointer) - size(a.pointer);
    })
    .map((site) => site.pointer)
    .slice(0, MAX_CANDIDATE_SITES);
}

/**
 * How many instances one constraint may be tried against.
 *
 * A cap rather than "all of them" because `#/$defs/contentId` is judged at over
 * a thousand places in `node.json` alone, and running the whole loader against
 * each would turn a proof into a benchmark. Candidates are sorted richest-first,
 * so a constraint that cannot be proven in thirty tries is not going to be
 * proven in the thousandth.
 */
const MAX_CANDIDATE_SITES = 30;

// ---------------------------------------------------------------------------
// Mutations: one per constraint kind, each violating exactly that constraint

/** A fresh id that satisfies every `contentId` bound, for growing arrays. */
const FILLER_ID = 'zzz-filler-zzz';

/** A string that satisfies the length bounds in use but no id pattern. */
const NOT_AN_ID = 'Not An Id';

function wrongTypeValue(type: unknown): unknown {
  // Chosen so that with `type` deleted, every sibling assertion is inapplicable:
  // string checks skip a number, numeric checks skip a string, and neither array
  // nor object checks fire on a scalar.
  return type === 'integer' ? 'not an integer' : 0;
}

/** Applies the mutation for one constraint, or explains why it cannot. */
function mutate(box: DocumentBox, constraint: Constraint, pointer: InstancePointer): string | undefined {
  const schema = constraint.schema;
  const current = readAt(box, pointer);

  switch (constraint.keyword) {
    case 'type': {
      writeAt(box, pointer, wrongTypeValue(schema['type']));
      return undefined;
    }
    case 'const': {
      writeAt(box, pointer, 'a value that is not the const');
      return undefined;
    }
    case 'enum': {
      const values = schema['enum'];
      if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
        return 'enum members are not all strings, so no substitute value can be generated';
      }
      writeAt(box, pointer, 'zzz-not-in-this-enum');
      return undefined;
    }
    case 'minimum': {
      writeAt(box, pointer, (schema['minimum'] as number) - 1);
      return undefined;
    }
    case 'maximum': {
      writeAt(box, pointer, (schema['maximum'] as number) + 1);
      return undefined;
    }
    case 'minLength': {
      writeAt(box, pointer, 'a'.repeat((schema['minLength'] as number) - 1));
      return undefined;
    }
    case 'maxLength': {
      writeAt(box, pointer, 'a'.repeat((schema['maxLength'] as number) + 1));
      return undefined;
    }
    case 'pattern': {
      const minLength = (schema['minLength'] as number | undefined) ?? 0;
      const maxLength = (schema['maxLength'] as number | undefined) ?? Number.MAX_SAFE_INTEGER;
      if (NOT_AN_ID.length < minLength || NOT_AN_ID.length > maxLength) {
        return `no pattern-violating string fits the length bounds [${String(minLength)}, ${String(maxLength)}]`;
      }
      writeAt(box, pointer, NOT_AN_ID);
      return undefined;
    }
    case 'minItems': {
      if (!Array.isArray(current)) return 'the instance is not an array';
      writeAt(box, pointer, current.slice(0, (schema['minItems'] as number) - 1));
      return undefined;
    }
    case 'maxItems': {
      if (!Array.isArray(current)) return 'the instance is not an array';
      const maxItems = schema['maxItems'] as number;
      const grown = growTo(current, maxItems + 1, schema);
      if (typeof grown === 'string') return grown;
      writeAt(box, pointer, grown);
      return undefined;
    }
    case 'uniqueItems': {
      if (!Array.isArray(current)) return 'the instance is not an array';
      if (current.length >= 2) {
        const copy = [...current];
        copy[1] = structuredClone(copy[0]);
        writeAt(box, pointer, copy);
        return undefined;
      }
      if (current.length === 1) {
        const maxItems = (schema['maxItems'] as number | undefined) ?? Number.MAX_SAFE_INTEGER;
        if (maxItems < 2) return 'maxItems forbids the second element a duplicate would need';
        writeAt(box, pointer, [current[0], structuredClone(current[0])]);
        return undefined;
      }
      return 'the array is empty, so no element can be repeated';
    }
    case 'additionalProperties': {
      if (!isPlainObject(current)) return 'the instance is not an object';
      writeAt(box, pointer, { ...current, zzUndeclaredProperty: 0 });
      return undefined;
    }
    case 'propertyNames': {
      if (!isPlainObject(current)) return 'the instance is not an object';
      const [first] = Object.keys(current);
      if (first === undefined) return 'the object has no keys to rename';
      const renamed: Record<string, unknown> = { ...current };
      renamed[NOT_AN_ID] = renamed[first];
      delete renamed[first];
      writeAt(box, pointer, renamed);
      return undefined;
    }
    case 'required': {
      if (!isPlainObject(current)) return 'the instance is not an object';
      if (constraint.requiredName === undefined) return 'no field named';
      if (!Object.hasOwn(current, constraint.requiredName)) {
        return `the chosen record does not carry "${constraint.requiredName}" to delete`;
      }
      deleteAt(box, `${pointer}/${constraint.requiredName}`);
      return undefined;
    }
    default:
      return `no mutation is defined for "${constraint.keyword}"`;
  }
}

/**
 * Grows an array past a `maxItems` bound with elements that are otherwise valid.
 *
 * Fillers are modelled on the elements already present, because "valid element"
 * is a property of the `items` subschema and copying one is the only way to get
 * it right without reimplementing the schema. When the array also declares
 * `uniqueItems`, each filler is made distinct — otherwise the mutation would
 * violate two constraints and the differential would call `maxItems` shadowed
 * when it is not.
 */
function growTo(current: readonly unknown[], target: number, schema: SchemaObject): unknown[] | string {
  const unique = schema['uniqueItems'] === true;
  const model = current[current.length - 1];
  if (model === undefined) return 'the array is empty, so no valid filler element can be modelled';

  const grown = [...current];
  for (let index = 0; grown.length < target; index += 1) {
    const filler = unique ? distinctFiller(model, index) : structuredClone(model);
    if (filler === undefined) {
      return `cannot generate ${String(target)} distinct elements for a uniqueItems array`;
    }
    grown.push(filler);
  }
  return grown;
}

/** A clone of `model` altered so that it is not equal to any other filler. */
function distinctFiller(model: unknown, index: number): unknown {
  const suffix = `${FILLER_ID}-${String(index)}`;
  if (typeof model === 'string') return suffix;
  if (typeof model === 'number') return model + index + 1;
  if (isPlainObject(model) && typeof model['id'] === 'string') {
    return { ...structuredClone(model), id: suffix };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Running one constraint through the loader and through the differential

interface Outcome {
  readonly pointer: InstancePointer;
  readonly rejected: readonly ContentDiagnostic[];
  readonly withoutConstraint: readonly ContentDiagnostic[];
}

/**
 * The best result over every candidate instance: a proof if one exists, and
 * otherwise the most informative failure, so the message names a real attempt
 * rather than "nothing worked".
 */
function proveConstraint(constraint: Constraint): Outcome | string {
  let firstFailure: Outcome | string | undefined;
  for (const pointer of targetsFor(constraint)) {
    const outcome = attempt(constraint, pointer);
    if (typeof outcome !== 'string' && outcome.rejected.length > 0 && outcome.withoutConstraint.length === 0) {
      return outcome;
    }
    firstFailure ??= outcome;
  }
  return firstFailure ?? 'no instance of this subschema exists in the content';
}

function attempt(constraint: Constraint, pointer: InstancePointer): Outcome | string {
  const documents = baseDocuments();
  const box: DocumentBox = { root: documents.get(constraint.contentFile) };
  const refusal = mutate(box, constraint, pointer);
  if (refusal !== undefined) return refusal;
  documents.set(constraint.contentFile, box.root);

  const result = validateContent(sourceOf(documents));
  const rejected = result.diagnostics.filter(
    (diagnostic) =>
      diagnostic.code === 'schema' &&
      diagnostic.file === constraint.contentFile &&
      isAtOrUnder(diagnostic.pointer, pointer),
  );

  const relaxed = new CompiledSchema(
    schemaWithoutConstraint(schemas.get(constraint.contentFile) as SchemaObject, constraint),
    `relaxed/${schemaFileFor(constraint.contentFile)}`,
  );
  const withoutConstraint = relaxed
    .validate(box.root, constraint.contentFile)
    .filter((diagnostic) => isAtOrUnder(diagnostic.pointer, pointer));

  return { pointer, rejected, withoutConstraint };
}

/**
 * A diagnostic counts when it lands on the mutated value, on the record that
 * contains it, or on a child of it.
 *
 * `required` reports at the object, `propertyNames` at the renamed key, and
 * `items` at the element — all three are the same violation seen from different
 * heights, and pinning the comparison to exact equality would reject two of them
 * for being correct.
 */
function isAtOrUnder(diagnosticPointer: string, mutatedPointer: string): boolean {
  return (
    diagnosticPointer === mutatedPointer ||
    diagnosticPointer.startsWith(`${mutatedPointer}/`) ||
    mutatedPointer.startsWith(`${diagnosticPointer}/`)
  );
}

// ---------------------------------------------------------------------------
// The suite

describe('the constraint walk is looking at real schemas and real content', () => {
  it('enumerated constraints in all seven schemas', () => {
    expect(schemas.size).toBe(7);
    for (const file of CONTENT_FILES) {
      expect(
        constraints.filter((constraint) => constraint.contentFile === file).length,
        `no constraints found in ${schemaFileFor(file)}`,
      ).toBeGreaterThan(5);
    }
  });

  it('starts from content that loads clean, so every rejection below is the mutation', () => {
    // Including the synthesized optional fields. If the base set were already
    // invalid, every "the loader rejected it" assertion would pass for free.
    expect(validateContent(sourceOf(baseDocuments())).diagnostics).toEqual([]);
    expect(() => loadContent(sourceOf(baseDocuments()))).not.toThrow();
  });

  it('injects only fields the shipped content genuinely lacks', () => {
    for (const injection of SYNTHESIZED) {
      const box: DocumentBox = { root: shipped.get(injection.file) };
      const owner = readAt(box, parentPointer(injection.pointer));
      const field = lastSegment(injection.pointer);
      expect(isPlainObject(owner), `${injection.file}${injection.pointer} has no owning record`).toBe(
        true,
      );
      expect(
        readAt(box, injection.pointer),
        `shipped content now carries ${injection.file}${injection.pointer}. The injection is no ` +
          'longer needed — delete it from SYNTHESIZED so this verifier mutates real content.',
      ).toBeUndefined();
      expect(field.length).toBeGreaterThan(0);
    }
  });

  it('leaves no constraint without an instance to mutate', () => {
    const orphans = constraints
      .filter((constraint) => targetsFor(constraint).length === 0)
      .map(describeConstraint)
      .sort();
    expect(
      orphans,
      'these constraints were never applied to any shipped record, so nothing here proves they do ' +
        'anything. Add a SYNTHESIZED entry that gives each one a value to judge.',
    ).toEqual([]);
  });
});

describe('every declared constraint rejects something nothing else rejects', () => {
  const shadowedNames = new Set(SHADOWED.map((entry) => entry.constraint));

  const cases = constraints.map((constraint) => ({
    name: describeConstraint(constraint),
    constraint,
  }));

  it.each(cases.filter((entry) => !shadowedNames.has(entry.name)))('$name', ({ constraint }) => {
    const outcome = proveConstraint(constraint);

    expect(
      typeof outcome,
      `no mutation could be generated for this constraint: ${String(outcome)}. Say so in SHADOWED ` +
        'rather than leaving it unproven.',
    ).not.toBe('string');
    const proven = outcome as Outcome;

    expect(
      proven.rejected.length,
      `the loader accepted content violating this constraint at ${proven.pointer}. The constraint ` +
        'is decoration: it is written in the schema and enforces nothing.',
    ).toBeGreaterThan(0);

    expect(
      proven.withoutConstraint,
      `deleting this constraint from the schema did not make the violating content clean at ` +
        `${proven.pointer}, so a sibling constraint is what rejected it and this constraint ` +
        'remains unproven. Classify it in SHADOWED, with the reason.',
    ).toEqual([]);
  });
});

describe('the constraints that cannot be proven are named, not skipped', () => {
  it.each(SHADOWED)('$constraint is unreachable: $why', ({ constraint: name }) => {
    const constraint = constraints.find((entry) => describeConstraint(entry) === name);
    expect(constraint, `SHADOWED names ${name}, which no schema declares`).toBeDefined();

    // The allowance deletes itself. A shadowed constraint that becomes
    // reachable — the pattern relaxed, the enum widened — fails here, and the
    // fix is to remove the entry so the differential covers it again.
    const outcome = proveConstraint(constraint as Constraint);
    const stillShadowed =
      typeof outcome === 'string' ||
      outcome.rejected.length === 0 ||
      outcome.withoutConstraint.length > 0;
    expect(
      stillShadowed,
      `${name} can now be violated on its own. Remove it from SHADOWED; the differential proves it.`,
    ).toBe(true);
  });
});

describe('the coverage this verifier claims is computed, not asserted', () => {
  it('reports how many constraints are proven, shadowed, and synthesized', () => {
    const shadowedNames = new Set(SHADOWED.map((entry) => entry.constraint));
    const proven = constraints.filter((entry) => !shadowedNames.has(describeConstraint(entry)));

    const byKeyword = new Map<string, number>();
    for (const constraint of constraints) {
      byKeyword.set(constraint.keyword, (byKeyword.get(constraint.keyword) ?? 0) + 1);
    }

    const report = [
      `constraints enumerated: ${String(constraints.length)}`,
      `proven by mutation + deletion differential: ${String(proven.length)}`,
      `shadowed (named in SHADOWED): ${String(shadowedNames.size)}`,
      `sites needing a synthesized value: ${String(SYNTHESIZED.length)}`,
      `by keyword: ${[...byKeyword]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([keyword, count]) => `${keyword}=${String(count)}`)
        .join(' ')}`,
    ].join('\n  ');
    process.stdout.write(`\n  ${report}\n`);

    expect(proven.length + shadowedNames.size).toBe(constraints.length);
    expect(proven.length).toBeGreaterThan(shadowedNames.size);
  });
});
