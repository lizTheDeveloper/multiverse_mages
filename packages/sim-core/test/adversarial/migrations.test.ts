/*
 * Multiverse Mages — adversarial: migration registry edge cases.
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

import { createState } from '../../src/state.js';
import { MigrationRegistry } from '../../src/snapshot/migrations.js';
import { SNAPSHOT_VERSION, deserializeState, serializeState, stateToEnvelope } from '../../src/snapshot/snapshot.js';
import { world } from './fixtures.js';

const baseEnvelope = () => stateToEnvelope(createState({ rootSeed: 1, schema: world }));

describe('a migration that does not advance the version', () => {
  it('returning the SAME version throws rather than looping forever', () => {
    const registry = new MigrationRegistry();
    registry.register(0, (envelope) => ({ ...envelope, version: 0 })); // no-op version
    const envelope = { ...baseEnvelope(), version: 0 };
    expect(() => registry.migrate(envelope, 1)).toThrow(/does not advance/i);
  });

  it('returning a LOWER version throws', () => {
    const registry = new MigrationRegistry();
    registry.register(1, (envelope) => ({ ...envelope, version: 0 }));
    const envelope = { ...baseEnvelope(), version: 1 };
    expect(() => registry.migrate(envelope, 2)).toThrow(/does not advance/i);
  });
});

describe('a migration that overshoots the target', () => {
  it('skipping past the target version throws', () => {
    const registry = new MigrationRegistry();
    registry.register(0, (envelope) => ({ ...envelope, version: 5 }));
    const envelope = { ...baseEnvelope(), version: 0 };
    expect(() => registry.migrate(envelope, 2)).toThrow(/overshoot/i);
  });
});

describe('a migration that throws', () => {
  it('propagates the migration step error rather than swallowing it', () => {
    const registry = new MigrationRegistry();
    registry.register(0, () => {
      throw new Error('deliberately broken migration step');
    });
    const envelope = { ...baseEnvelope(), version: 0 };
    expect(() => registry.migrate(envelope, 1)).toThrow(/deliberately broken/);
  });
});

/**
 * A migration is a plain function returning a plain object; nothing in
 * `MigrationRegistry.migrate` validates the SHAPE of what it returns (see
 * snapshot.ts's comment on `validateEnvelopeShape`: it runs at
 * `encodeSnapshot` and `envelopeToState`, deliberately not inside `migrate`
 * itself, because a migration chain must be able to pass through an
 * intermediate representation freely). This is a defensible reading of
 * "migrations MUST be pure functions and MUST be individually testable"
 * (world-persistence spec) — testability is about the function signature, not
 * about the registry re-validating every intermediate. The actual schema gate
 * is `envelopeToState`, exercised here via `deserializeState`, which is where
 * the spec's "corrupt snapshot rejected" guarantee is actually enforced.
 */
describe('a migration that returns a shape-invalid envelope', () => {
  it('is caught at load time by envelopeToState, one layer up from migrate() itself', () => {
    const registry = new MigrationRegistry();
    registry.register(0, (envelope) => ({
      ...envelope,
      version: SNAPSHOT_VERSION,
      // Duplicate component names: shape-invalid per validateEnvelopeShape.
      components: [...envelope.components, ...envelope.components],
    }));

    const state = createState({ rootSeed: 1, schema: world });
    const buffer = serializeState(state);
    new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).setUint16(4, 0, true);

    expect(() => deserializeState(buffer, world, { migrations: registry })).toThrow(/more than once/i);
  });

  it('migrate() itself does not validate shape — this documents the boundary, it is not a defect', () => {
    const registry = new MigrationRegistry();
    registry.register(0, (envelope) => ({
      ...envelope,
      version: 1,
      components: [...envelope.components, ...envelope.components],
    }));
    const envelope = { ...baseEnvelope(), version: 0 };
    // migrate() succeeds even though the result is shape-invalid — by design,
    // per the module comment. envelopeToState is the enforcement point.
    const result = registry.migrate(envelope, 1);
    expect(result.components.length).toBe(envelope.components.length * 2);
  });
});

describe('registering two migrations from the same source version', () => {
  it('the second registration throws rather than silently overwriting the first', () => {
    const registry = new MigrationRegistry();
    registry.register(1, (envelope) => ({ ...envelope, version: 2 }));
    expect(() => registry.register(1, (envelope) => ({ ...envelope, version: 2 }))).toThrow(
      /already registered/i,
    );
  });
});

describe('migrating to a target below the envelope version', () => {
  it('throws rather than downgrading', () => {
    const registry = new MigrationRegistry();
    const envelope = { ...baseEnvelope(), version: 5 };
    expect(() => registry.migrate(envelope, 3)).toThrow(/newer than the requested target/i);
  });
});

describe('an empty registry', () => {
  it('has() reports false for every version', () => {
    const registry = new MigrationRegistry();
    expect(registry.has(0)).toBe(false);
    expect(registry.has(SNAPSHOT_VERSION)).toBe(false);
  });

  it('migrate() from an older version throws naming the missing step', () => {
    const registry = new MigrationRegistry();
    const envelope = { ...baseEnvelope(), version: 0 };
    expect(() => registry.migrate(envelope, 1)).toThrow(/no migration registered/i);
  });

  it('migrate() at the target version is a no-op returning the SAME object', () => {
    const registry = new MigrationRegistry();
    const envelope = { ...baseEnvelope(), version: 3 };
    expect(registry.migrate(envelope, 3)).toBe(envelope); // reference equality, per the docstring
  });
});

describe('register() rejects invalid source versions', () => {
  it('a negative fromVersion throws', () => {
    const registry = new MigrationRegistry();
    expect(() => registry.register(-1, (e) => e)).toThrow(RangeError);
  });

  it('a non-integer fromVersion throws', () => {
    const registry = new MigrationRegistry();
    expect(() => registry.register(1.5, (e) => e)).toThrow(RangeError);
  });
});

describe('migrate() rejects invalid target versions', () => {
  it('a negative targetVersion throws', () => {
    const registry = new MigrationRegistry();
    const envelope = { ...baseEnvelope(), version: 0 };
    expect(() => registry.migrate(envelope, -1)).toThrow(RangeError);
  });
});
