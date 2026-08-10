/*
 * Multiverse Mages — snapshot serialization, hashing, and migration tests.
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

import { TIME_MODE } from '../../src/clock.js';
import { rngFromRootSeed } from '../../src/rng/source.js';
import { hashBytes } from '../../src/snapshot/hash.js';
import { MigrationRegistry } from '../../src/snapshot/migrations.js';
import {
  SNAPSHOT_VERSION,
  decodeSnapshot,
  deserializeState,
  encodeSnapshot,
  serializeState,
  snapshotHash,
} from '../../src/snapshot/snapshot.js';
import type { System } from '../../src/state.js';
import { createState, defineWorld } from '../../src/state.js';
import { CORE_ACTION, step } from '../../src/step.js';

const vitality = { name: 'vitality', fields: { hp: 'i32', age: 'u16' } } as const;
const wealth = { name: 'wealth', fields: { coins: 'u32' } } as const;

const ageing: System = {
  name: 'ageing',
  run(ctx) {
    const component = ctx.state.component('vitality');
    const hp = component.field('hp');
    component.forEach((row) => {
      hp[row] = (hp[row] as number) + 1;
    });
  },
};

const world = defineWorld({ components: [vitality, wealth], systems: [ageing] });

/** A state with a non-trivial history: churned slots, sparse components, a mode change. */
function populated(): ReturnType<typeof createState> {
  const state = createState({ rootSeed: 4242, schema: world, contentRevision: 0xabcdef01 });
  const handles = [];
  for (let i = 0; i < 8; i += 1) {
    handles.push(state.entities.create());
  }
  state.entities.destroy(handles[2]!);
  state.entities.destroy(handles[5]!);
  const recycled = state.entities.create();

  const vit = state.component('vitality');
  const wea = state.component('wealth');
  for (const handle of [handles[0]!, handles[3]!, handles[7]!, recycled]) {
    vit.add(handle);
    vit.set(handle, 'hp', 100 + (handle & 0xff));
    vit.set(handle, 'age', handle & 0xffff);
  }
  wea.add(handles[7]!);
  wea.set(handles[7]!, 'coins', 4000000000);
  return state;
}

describe('round trip', () => {
  it('restores a state whose hash equals the original', () => {
    const state = populated();
    const restored = deserializeState(serializeState(state), world);
    expect(snapshotHash(restored)).toBe(snapshotHash(state));
  });

  it('restores every field value, signed and unsigned alike', () => {
    const state = populated();
    const restored = deserializeState(serializeState(state), world);

    state.component('vitality').forEach((_row, handle) => {
      expect(restored.component('vitality').get(handle, 'hp')).toBe(
        state.component('vitality').get(handle, 'hp'),
      );
      expect(restored.component('vitality').get(handle, 'age')).toBe(
        state.component('vitality').get(handle, 'age'),
      );
    });
    // 4e9 exceeds int32 — a u32 field must survive as itself.
    state.component('wealth').forEach((_row, handle) => {
      expect(restored.component('wealth').get(handle, 'coins')).toBe(4000000000);
    });
  });

  it('restores the clock, seed, revision, and illegal-action counter', () => {
    let state = createState({ rootSeed: 77, schema: world, contentRevision: 5 });
    state = step(state, [], rngFromRootSeed(77));
    state = step(state, [{ kind: CORE_ACTION.enterEngagement }], rngFromRootSeed(77));
    state = step(state, [{ kind: CORE_ACTION.enterEngagement }], rngFromRootSeed(77));

    const restored = deserializeState(serializeState(state), world);
    expect(restored.clock.mode).toBe(TIME_MODE.engagement);
    expect(restored.clock.worldTick).toBe(state.clock.worldTick);
    expect(restored.clock.engagementTick).toBe(state.clock.engagementTick);
    expect(restored.rootSeed).toBe(77);
    expect(restored.contentRevision).toBe(5);
    expect(restored.illegalActionCount).toBe(1);
  });

  it('restores liveness and staleness exactly', () => {
    const state = createState({ rootSeed: 1, schema: world });
    const a = state.entities.create();
    const b = state.entities.create();
    state.entities.destroy(a);

    const restored = deserializeState(serializeState(state), world);
    expect(restored.entities.isAlive(b)).toBe(true);
    expect(restored.entities.isStale(a)).toBe(true);
    expect(restored.entities.liveCount).toBe(1);
    expect(restored.entities.slotCount).toBe(2);
  });

  it('restores the free list so the next allocation matches', () => {
    const state = populated();
    const restored = deserializeState(serializeState(state), world);
    expect(restored.entities.create()).toBe(state.entities.create());
  });

  it('produces a state that simulates identically', () => {
    let original = populated();
    let restored = deserializeState(serializeState(original), world);

    for (let i = 0; i < 20; i += 1) {
      original = step(original, [], rngFromRootSeed(original.rootSeed));
      restored = step(restored, [], rngFromRootSeed(restored.rootSeed));
    }
    expect(snapshotHash(restored)).toBe(snapshotHash(original));
  });
});

describe('serialization is stable', () => {
  it('produces byte-identical buffers for repeated serialization', () => {
    const state = populated();
    expect(Array.from(serializeState(state))).toEqual(Array.from(serializeState(state)));
  });

  it('produces byte-identical buffers for states reached by different routes', () => {
    // Row order inside a component depends on the destroy history, so two
    // equal states can hold different internal layouts. The format has to be
    // canonical, or two peers would compute different hashes for the same game.
    const direct = createState({ rootSeed: 3, schema: world });
    const a1 = direct.entities.create();
    const b1 = direct.entities.create();
    direct.component('vitality').add(a1);
    direct.component('vitality').add(b1);
    direct.component('vitality').set(a1, 'hp', 11);
    direct.component('vitality').set(b1, 'hp', 22);

    const roundabout = createState({ rootSeed: 3, schema: world });
    const a2 = roundabout.entities.create();
    const b2 = roundabout.entities.create();
    roundabout.component('vitality').add(b2);
    roundabout.component('vitality').add(a2);
    roundabout.component('vitality').set(b2, 'hp', 22);
    roundabout.component('vitality').set(a2, 'hp', 11);

    expect(Array.from(serializeState(roundabout))).toEqual(Array.from(serializeState(direct)));
    expect(snapshotHash(roundabout)).toBe(snapshotHash(direct));
  });
});

describe('hashing', () => {
  it('gives equal hashes to equal content', () => {
    const build = () => {
      const state = createState({ rootSeed: 3, schema: world });
      const handle = state.entities.create();
      state.component('vitality').add(handle);
      state.component('vitality').set(handle, 'hp', 50);
      return state;
    };
    expect(snapshotHash(build())).toBe(snapshotHash(build()));
  });

  it('changes when any single component value changes', () => {
    const state = populated();
    const before = snapshotHash(state);
    const handle = state.component('vitality').handleOfRow(0);
    state.component('vitality').set(handle, 'hp', state.component('vitality').get(handle, 'hp') + 1);
    expect(snapshotHash(state)).not.toBe(before);
  });

  it('changes when the clock changes', () => {
    const state = populated();
    const before = snapshotHash(state);
    state.clock.worldTick += 1;
    expect(snapshotHash(state)).not.toBe(before);
  });

  it('is a fixed-width lowercase hex string', () => {
    expect(snapshotHash(populated())).toMatch(/^[0-9a-f]{16}$/);
  });

  it('separates adjacent fields, so moving a byte changes the hash', () => {
    expect(hashBytes(new Uint8Array([1, 0]))).not.toBe(hashBytes(new Uint8Array([0, 1])));
    expect(hashBytes(new Uint8Array([]))).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('the format is versioned and self-describing', () => {
  it('rejects a snapshot from a future schema version, naming both versions', () => {
    const buffer = serializeState(populated());
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    view.setUint16(4, SNAPSHOT_VERSION + 7, true);

    expect(() => deserializeState(buffer, world)).toThrow(
      new RegExp(`${SNAPSHOT_VERSION + 7}[\\s\\S]*${SNAPSHOT_VERSION}`),
    );
  });

  it('rejects a buffer that is not a snapshot at all', () => {
    expect(() => deserializeState(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), world)).toThrow(
      /magic|not a .*snapshot/i,
    );
  });

  it('rejects a truncated buffer rather than returning a partial state', () => {
    const buffer = serializeState(populated());
    for (const cut of [8, 16, 32, buffer.length - 1]) {
      expect(() => deserializeState(buffer.subarray(0, cut), world)).toThrow(
        /truncated|too short|past the end/i,
      );
    }
  });

  it('rejects a component tag table inconsistent with its payload', () => {
    const state = populated();
    const envelope = decodeSnapshot(serializeState(state));
    const component = envelope.components[0]!;
    // Claim one more row than the payload carries.
    const tampered = {
      ...envelope,
      components: [
        { ...component, slots: new Uint32Array([...component.slots, 999]) },
        ...envelope.components.slice(1),
      ],
    };
    expect(() => deserializeState(encodeSnapshot(tampered), world)).toThrow(/999|slot/i);
  });

  it('rejects a snapshot whose components do not match the schema', () => {
    const other = defineWorld({ components: [wealth], systems: [] });
    expect(() => deserializeState(serializeState(populated()), other)).toThrow(/vitality/);
  });

  it('rejects a snapshot whose field widths do not match the schema', () => {
    const widened = defineWorld({
      components: [{ name: 'vitality', fields: { hp: 'i32', age: 'u32' } }, wealth],
      systems: [],
    });
    expect(() => deserializeState(serializeState(populated()), widened)).toThrow(/age|u16|u32/);
  });

  it('rejects a free list naming a live slot', () => {
    const envelope = decodeSnapshot(serializeState(populated()));
    const tampered = { ...envelope, entities: { ...envelope.entities, freeList: new Uint32Array([0]) } };
    expect(() => deserializeState(encodeSnapshot(tampered), world)).toThrow(/live/i);
  });
});

describe('migration', () => {
  /**
   * ## The two steps do not commute, and that is the whole design
   *
   * The chain used to be "one step doubles `wealth.values`, the other rebases
   * `contentRevision`" — two edits to disjoint fields, which produce the same
   * envelope in either order. A registry that walked its steps backwards, or in
   * registration order, or in `Map` insertion order, passed that test. The
   * scenario `world-persistence` states is *"migrations are applied in ascending
   * version order"*, and a test that cannot tell ascending from descending is
   * not evidence for it.
   *
   * So both steps now write the same two fields with operations that disagree
   * under composition: doubling then adding is not adding then doubling. The
   * ascending answer and the descending answer are different numbers, and the
   * test asserts the first and rejects the second by name.
   *
   * They are also registered high-to-low, so an implementation applying steps in
   * the order they were handed to it lands on the descending answer rather than
   * stumbling onto the right one.
   */
  type Envelope = ReturnType<typeof decodeSnapshot>;

  const DOUBLED = (value: number): number => (value * 2) >>> 0;
  /** Added to every coin balance by the v2 -> v3 step. */
  const BONUS = 7;
  /** Added to the content revision by the same step. */
  const BONUS_REVISION = 1;

  /** Rewrites every value of the wealth component, leaving every other field alone. */
  const remapWealth = (
    components: Envelope['components'],
    f: (value: number) => number,
  ): Envelope['components'] =>
    components.map((component) =>
      component.name === 'wealth' ? { ...component, values: component.values.map(f) } : component,
    );

  const registry = new MigrationRegistry();
  // v2 -> v3: every balance gained a flat joining bonus, and the content
  // revision ticked by one.
  registry.register(2, (envelope) => ({
    ...envelope,
    version: 3,
    contentRevision: (envelope.contentRevision + BONUS_REVISION) >>> 0,
    components: remapWealth(envelope.components, (value) => (value + BONUS) >>> 0),
  }));
  // v1 -> v2: the wealth component gained its coins by doubling, and the
  // content revision doubled with them.
  registry.register(1, (envelope) => ({
    ...envelope,
    version: 2,
    contentRevision: DOUBLED(envelope.contentRevision),
    components: remapWealth(envelope.components, DOUBLED),
  }));

  const atVersion = (version: number) => {
    const buffer = serializeState(populated());
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    view.setUint16(4, version, true);
    return buffer;
  };

  /** What `populated()` writes, and what the two steps together must produce. */
  const OLD_COINS = 4000000000;
  const OLD_REVISION = 0xabcdef01;
  const ASCENDING_COINS = (DOUBLED(OLD_COINS) + BONUS) >>> 0;
  const ASCENDING_REVISION = (DOUBLED(OLD_REVISION) + BONUS_REVISION) >>> 0;
  /** What applying the same two steps in the wrong order would produce. */
  const DESCENDING_COINS = DOUBLED(OLD_COINS + BONUS);
  const DESCENDING_REVISION = DOUBLED(OLD_REVISION + BONUS_REVISION);

  const wealthOf = (envelope: Envelope) =>
    envelope.components.find((component) => component.name === 'wealth')!;

  it('applies a single registered migration', () => {
    const envelope = registry.migrate(decodeSnapshot(atVersion(1)), 2);
    expect(envelope.version).toBe(2);
    expect(wealthOf(envelope).values[0]).toBe(DOUBLED(OLD_COINS));
  });

  it('applies a chain in ascending version order, not in registration order', () => {
    const envelope = registry.migrate(decodeSnapshot(atVersion(1)), 3);
    expect(envelope.version).toBe(3);
    expect(wealthOf(envelope).values[0]).toBe(ASCENDING_COINS);
    expect(envelope.contentRevision).toBe(ASCENDING_REVISION);

    // Stated as its own assertion rather than left implicit in the numbers
    // above, so that the next person to read this can see what it is ruling
    // out. The steps were registered 2 first, 1 second; these are the values a
    // registry that ran them in that order would produce.
    expect(DESCENDING_COINS).not.toBe(ASCENDING_COINS);
    expect(DESCENDING_REVISION).not.toBe(ASCENDING_REVISION);
    expect(wealthOf(envelope).values[0]).not.toBe(DESCENDING_COINS);
    expect(envelope.contentRevision).not.toBe(DESCENDING_REVISION);
  });

  it('lands on exactly the envelope a snapshot authored at the current version decodes to', () => {
    // The scenario's second clause: *"the result matches a snapshot authored
    // directly at the current version"*. Asserting the two fields the
    // migrations touch would leave the interesting failure uncovered — a step
    // that dropped a component, reordered the entity tables, or quietly
    // resized the free list would still show the right coin balance. Whole-
    // envelope equality is the only form of the claim that catches those.
    //
    // The authored side is built and serialized independently, then decoded
    // from its own bytes: it is a snapshot this build would have written, not
    // the migrated object with the same fields patched in.
    const base = decodeSnapshot(serializeState(populated()));
    const authored = decodeSnapshot(
      encodeSnapshot({
        ...base,
        version: 3,
        contentRevision: ASCENDING_REVISION,
        // `populated()` gives wealth exactly one row of one field, so setting
        // every value is setting the one value.
        components: remapWealth(base.components, () => ASCENDING_COINS),
      }),
    );

    expect(registry.migrate(decodeSnapshot(atVersion(1)), 3)).toEqual(authored);
  });

  it('names the missing step when no migration path exists', () => {
    const sparse = new MigrationRegistry();
    sparse.register(2, (envelope) => ({ ...envelope, version: 3 }));
    expect(() => sparse.migrate(decodeSnapshot(atVersion(1)), 3)).toThrow(/1.*2|migration from 1/);
  });

  it('refuses to migrate a snapshot newer than the target', () => {
    expect(() => registry.migrate(decodeSnapshot(atVersion(5)), 3)).toThrow(/5[\s\S]*3/);
  });

  it('leaves a snapshot already at the target version untouched', () => {
    const envelope = decodeSnapshot(serializeState(populated()));
    expect(registry.migrate(envelope, SNAPSHOT_VERSION)).toEqual(envelope);
  });

  it('runs a registered migration during deserialization', () => {
    const older = new MigrationRegistry();
    older.register(SNAPSHOT_VERSION - 1, (envelope) => ({
      ...envelope,
      version: SNAPSHOT_VERSION,
      contentRevision: 123,
    }));
    const buffer = serializeState(populated());
    new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).setUint16(
      4,
      SNAPSHOT_VERSION - 1,
      true,
    );

    const restored = deserializeState(buffer, world, { migrations: older });
    expect(restored.contentRevision).toBe(123);
  });

  it('fails an older snapshot when no registry is supplied', () => {
    const buffer = serializeState(populated());
    new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).setUint16(
      4,
      SNAPSHOT_VERSION - 1,
      true,
    );
    expect(() => deserializeState(buffer, world)).toThrow(/migration/i);
  });
});
