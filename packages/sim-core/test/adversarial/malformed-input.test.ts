/*
 * Multiverse Mages — adversarial: hand-crafted malformed snapshot buffers.
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

/** Bytes of fixed snapshot header, mirrored from snapshot.ts so offsets stay honest. */
const HEADER_BYTES = 40;

import { createState } from '../../src/state.js';
import {
  decodeSnapshot,
  deserializeState,
  encodeSnapshot,
  serializeState,
  stateToEnvelope,
} from '../../src/snapshot/snapshot.js';
import { world } from './fixtures.js';

/** A small populated state, and its serialized bytes, reused across cases below. */
function populated() {
  const state = createState({ rootSeed: 7, schema: world });
  const a = state.entities.create();
  const b = state.entities.create();
  state.component('vitality').add(a);
  state.component('vitality').set(a, 'hp', 10);
  state.component('vitality').set(a, 'age', 3);
  state.component('wealth').add(b);
  state.component('wealth').set(b, 'coins', 42);
  return { state, buffer: serializeState(state) };
}

describe('payloadLength lies in both directions', () => {
  it('rejects a payloadLength larger than the actual remaining bytes (lies short)', () => {
    const { buffer } = populated();
    const tampered = buffer.slice();
    const view = new DataView(tampered.buffer, tampered.byteOffset, tampered.byteLength);
    const declared = view.getUint32(8, true);
    view.setUint32(8, declared + 1000, true); // claims far more payload than exists
    expect(() => deserializeState(tampered, world)).toThrow(/truncated|payload/i);
  });

  it('rejects a payloadLength smaller than the actual remaining bytes (lies long / trailing data)', () => {
    const { buffer } = populated();
    const tampered = buffer.slice();
    const view = new DataView(tampered.buffer, tampered.byteOffset, tampered.byteLength);
    const declared = view.getUint32(8, true);
    view.setUint32(8, Math.max(0, declared - 8), true); // claims less payload than exists
    expect(() => deserializeState(tampered, world)).toThrow(/truncated|payload|trailing/i);
  });
});

describe('component name length lies past the buffer', () => {
  it('a component name length byte claiming more bytes than remain in the buffer', () => {
    const { state } = populated();
    const envelope = stateToEnvelope(state);
    const buffer = encodeSnapshot(envelope);
    // Locate the byte for the first component's name-length prefix and inflate
    // it so the claimed name runs past the end of the buffer. We do this by
    // truncating the buffer immediately after a valid name-length byte instead
    // of hunting for the exact offset — either way, decode must fail cleanly
    // rather than read garbage or crash on an out-of-bounds access.
    const componentCountOffset = HEADER_BYTES /* header */
      + 4 /* slotCount */
      + envelope.entities.generations.length * 2
      + envelope.entities.alive.length
      + 4 /* freeCount */
      + envelope.entities.freeList.length * 4
      + 2; /* component count u16 */
    const nameLenOffset = componentCountOffset; // first component's name-length byte
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const originalLen = view.getUint8(nameLenOffset);
    view.setUint8(nameLenOffset, originalLen + 200); // claim a name far longer than remains
    expect(() => deserializeState(buffer, world)).toThrow(/truncated|past the end/i);
  });
});

describe('a name byte outside printable ASCII', () => {
  it('rejects a component name containing a NUL byte', () => {
    const { state } = populated();
    const envelope = stateToEnvelope(state);
    const buffer = encodeSnapshot(envelope);
    const componentCountOffset =
      HEADER_BYTES + 4 + envelope.entities.generations.length * 2 + envelope.entities.alive.length + 4 + envelope.entities.freeList.length * 4 + 2;
    const firstNameByteOffset = componentCountOffset + 1; // past the length byte
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    view.setUint8(firstNameByteOffset, 0x00); // NUL
    expect(() => deserializeState(buffer, world)).toThrow(/printable ASCII|not printable/i);
  });

  it('rejects a component name containing a byte above 127', () => {
    const { state } = populated();
    const envelope = stateToEnvelope(state);
    const buffer = encodeSnapshot(envelope);
    const componentCountOffset =
      HEADER_BYTES + 4 + envelope.entities.generations.length * 2 + envelope.entities.alive.length + 4 + envelope.entities.freeList.length * 4 + 2;
    const firstNameByteOffset = componentCountOffset + 1;
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    view.setUint8(firstNameByteOffset, 0xff);
    expect(() => deserializeState(buffer, world)).toThrow(/printable ASCII|not printable/i);
  });
});

describe('duplicate component names in one snapshot', () => {
  it('encodeSnapshot rejects an envelope declaring the same component twice', () => {
    const { state } = populated();
    const envelope = stateToEnvelope(state);
    const dup = { ...envelope, components: [envelope.components[0]!, envelope.components[0]!] };
    expect(() => encodeSnapshot(dup)).toThrow(/more than once/i);
  });

  it('a byte-level buffer with a duplicate component name is rejected on load, not just on encode', () => {
    // decodeSnapshot performs no duplicate check at all (it is schema- and
    // shape-agnostic by design, per its own docstring). The duplicate check
    // lives in validateEnvelopeShape, called by envelopeToState. This test
    // constructs the duplicate at the byte level — bypassing encodeSnapshot's
    // guard entirely — so it exercises the decode -> envelopeToState path a
    // hostile or corrupted peer would actually hit, not just this build's own
    // encoder refusing to produce such bytes in the first place.
    const { state } = populated();
    const envelope = stateToEnvelope(state);
    const single = { ...envelope, components: [envelope.components[0]!] };
    const buffer = encodeSnapshot(single);

    // The component-table section starts right after the entity tables and
    // the u16 component count. Locate it, then duplicate those bytes in place
    // of the trailing nothing (there is only one component), doubling the
    // component count to 2 while appending a byte-identical second copy.
    const entityBytes =
      4 /* slotCount */ +
      envelope.entities.generations.length * 2 +
      envelope.entities.alive.length +
      4 /* freeCount */ +
      envelope.entities.freeList.length * 4;
    const componentTableStart = HEADER_BYTES + entityBytes + 2; // header + entities + u16 count
    const componentBytes = buffer.subarray(componentTableStart);

    const doubled = new Uint8Array(buffer.length + componentBytes.length);
    doubled.set(buffer.subarray(0, componentTableStart));
    doubled.set(componentBytes, componentTableStart);
    doubled.set(componentBytes, componentTableStart + componentBytes.length);

    const view = new DataView(doubled.buffer);
    view.setUint16(componentTableStart - 2, 2, true); // component count: 1 -> 2
    view.setUint32(8, doubled.length - HEADER_BYTES, true); // payloadLength must match the new size

    expect(() => deserializeState(doubled, world)).toThrow(/more than once/i);
  });
});

describe('slots that are descending, equal, or duplicated', () => {
  it('rejects component rows out of ascending slot order (descending)', () => {
    const { state } = populated();
    const envelope = stateToEnvelope(state);
    const component = envelope.components.find((c) => c.slots.length >= 1)!;
    // Slots 1, 0: unambiguously descending regardless of what the fixture
    // originally carried.
    const rigged = Uint32Array.from([1, 0]);
    const tamperedComponent = {
      ...component,
      slots: rigged,
      values: new Uint32Array(rigged.length * component.fields.length),
    };
    const tampered = {
      ...envelope,
      components: envelope.components.map((c) => (c.name === component.name ? tamperedComponent : c)),
    };
    expect(() => deserializeState(encodeSnapshot(tampered), world)).toThrow(/ascending|slot/i);
  });

  it('rejects component rows naming the same slot twice (equal, not ascending)', () => {
    const { state } = populated();
    const envelope = stateToEnvelope(state);
    const component = envelope.components.find((c) => c.slots.length >= 1)!;
    const slot = component.slots[0]!;
    const tamperedComponent = {
      ...component,
      slots: Uint32Array.from([slot, slot]),
      values: new Uint32Array(2 * component.fields.length),
    };
    const tampered = {
      ...envelope,
      components: envelope.components.map((c) => (c.name === component.name ? tamperedComponent : c)),
    };
    expect(() => deserializeState(encodeSnapshot(tampered), world)).toThrow(/ascending|slot/i);
  });
});

describe('non-zero padding and flags bytes', () => {
  it('rejects a non-zero flags field', () => {
    const { buffer } = populated();
    const tampered = buffer.slice();
    new DataView(tampered.buffer, tampered.byteOffset, tampered.byteLength).setUint16(6, 1, true);
    expect(() => deserializeState(tampered, world)).toThrow(/flags/i);
  });

  it('rejects non-zero header padding bytes', () => {
    const { buffer } = populated();
    const tampered = buffer.slice();
    new DataView(tampered.buffer, tampered.byteOffset, tampered.byteLength).setUint8(33, 1); // first padding byte
    expect(() => deserializeState(tampered, world)).toThrow(/reserved|padding/i);
  });
});

describe('rowCount inflated far beyond the buffer (would-be OOM guard)', () => {
  it('rejects a component claiming close to UINT32_MAX rows without attempting to allocate', () => {
    const { state } = populated();
    const envelope = stateToEnvelope(state);
    const component = envelope.components[0]!;
    // Force the row count itself (not the array length) to lie by encoding a
    // component whose declared slots array is empty, then patching the
    // on-wire row-count field to a huge value post-encode. If `expectRun`
    // were not checked before allocation, this would attempt a multi-GB
    // Uint32Array allocation instead of failing cleanly.
    const validComponent = { ...component, slots: new Uint32Array([]), values: new Uint32Array([]) };
    const tampered = {
      ...envelope,
      components: envelope.components.map((c) => (c.name === component.name ? validComponent : c)),
    };
    const buffer = encodeSnapshot(tampered);

    const nameLen = validComponent.name.length;
    let offset =
      HEADER_BYTES +
      4 +
      envelope.entities.generations.length * 2 +
      envelope.entities.alive.length +
      4 +
      envelope.entities.freeList.length * 4 +
      2;
    offset += 1 + nameLen + 1; // name length, name, field count
    for (const field of validComponent.fields) {
      offset += 1 + field.name.length + 1;
    }
    // offset now points at the row-count u32 for this (zero-row) component.
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    view.setUint32(offset, 0xfffffffe, true);
    expect(() => deserializeState(buffer, world)).toThrow(/truncated|declares/i);
  });
});

describe('decodeSnapshot accepts any version, deferring the policy to deserializeState', () => {
  it('decodeSnapshot does not throw for version 0', () => {
    const { buffer } = populated();
    const tampered = buffer.slice();
    new DataView(tampered.buffer, tampered.byteOffset, tampered.byteLength).setUint16(4, 0, true);
    expect(() => decodeSnapshot(tampered)).not.toThrow();
    expect(decodeSnapshot(tampered).version).toBe(0);
  });
});
