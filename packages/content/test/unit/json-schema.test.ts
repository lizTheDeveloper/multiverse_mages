/*
 * Multiverse Mages — the schema interpreter cannot silently under-enforce.
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

import { describe, expect, it } from 'vitest';

import { CompiledSchema, SchemaCompileError, canonicalJson, contentSchemas } from '@mm/content';

describe('the schema interpreter', () => {
  it('compiles every shipped schema', () => {
    expect([...contentSchemas().keys()]).toHaveLength(7);
  });

  it('refuses a keyword it does not implement, rather than ignoring it', () => {
    // The failure mode this prevents: a schema gains `multipleOf`, the
    // interpreter skips it, and validation reports a success it never
    // established. Silence is the defect, so silence is impossible.
    expect(() => new CompiledSchema({ type: 'integer', multipleOf: 2 }, 'test')).toThrow(
      SchemaCompileError,
    );
    expect(() => new CompiledSchema({ type: 'integer', multipleOf: 2 }, 'test')).toThrow(
      /unsupported JSON Schema keyword "multipleOf"/u,
    );
  });

  it('refuses type "number", because content carries no floats', () => {
    expect(() => new CompiledSchema({ type: 'number' }, 'test')).toThrow(/scale 1024/u);
  });

  it('refuses a $ref that does not resolve locally', () => {
    expect(() => new CompiledSchema({ $ref: '#/$defs/missing' }, 'test')).toThrow(
      /names a missing def/u,
    );
    expect(() => new CompiledSchema({ $ref: 'https://elsewhere/schema.json' }, 'test')).toThrow(
      /local "#\/\$defs\/<name>" reference/u,
    );
  });

  it('reports every violation in one instance, with pointers', () => {
    const schema = new CompiledSchema(
      {
        type: 'object',
        additionalProperties: false,
        required: ['a', 'b'],
        properties: {
          a: { type: 'integer', minimum: 1 },
          b: { type: 'string', pattern: '^[a-z]+$' },
        },
      },
      'test',
    );
    const diagnostics = schema.validate({ a: 0, b: 'NOPE', c: 1 }, 'thing.json');
    expect(diagnostics.map((d) => d.pointer).sort()).toEqual(['', '/a', '/b']);
    expect(diagnostics.every((d) => d.file === 'thing.json')).toBe(true);
  });

  it('stops descending once a type mismatch is reported', () => {
    const schema = new CompiledSchema(
      { type: 'array', minItems: 3, items: { type: 'integer' } },
      'test',
    );
    // One clear message, not a cascade of derived ones.
    expect(schema.validate('not an array', 'thing.json')).toHaveLength(1);
  });

  it('renders canonical JSON with keys in code-unit order', () => {
    expect(canonicalJson({ b: 1, a: [3, { d: 4, c: 5 }] })).toBe('{"a":[3,{"c":5,"d":4}],"b":1}');
  });
});
