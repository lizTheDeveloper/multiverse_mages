/*
 * Multiverse Mages — versioned, self-describing binary snapshots.
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

import { TIME_MODE } from '../clock.js';
import type { TimeMode } from '../clock.js';
import type { ComponentFieldKind, ComponentFields } from '../component.js';
import type { ComponentStore } from '../component.js';
import { NULL_ENTITY } from '../handle.js';
import type { MigrationRegistry } from './migrations.js';
import { SimState } from '../state.js';
import type { WorldSchema } from '../state.js';
import { hashBytes } from './hash.js';

/**
 * ## What a snapshot is, and what it is not
 *
 * A snapshot is everything the simulation *is* at one instant, in a byte layout
 * that two independent processes will agree on exactly. It is deliberately not
 * everything the simulation *does*: systems are functions and live in the world
 * schema, never in the buffer. That split is what makes a golden fixture
 * meaningful — replaying yesterday's snapshot against today's rules is how a
 * behaviour change announces itself, and it can only announce itself if the
 * rules were not smuggled along inside the save file.
 *
 * `contracts.md` §1.6 draws the other line: engagement-only entities —
 * combatants, the raid's objectives, portal stability — are discarded at raid
 * resolution and are **not** written to world snapshots, while `clock.mode` and
 * `clock.engagementTick` *are*. This module honours both halves of that today
 * by construction: the clock is serialized in full, and the only entity storage
 * that exists here is the world store. When `raid-engagement` adds its
 * short-lived store, it is that store's absence from this file that keeps the
 * contract, so nothing here should ever grow a generic "serialize every store"
 * loop.
 *
 * ## Why a binary format and not JSON
 *
 * `design.md` argues it: `JSON.stringify` key ordering is stable in V8 for
 * string keys but is not a *specified* guarantee, and byte-identity assertions
 * are the entire point. A hand-rolled layout with an explicit field order is
 * something a second implementation — a replay tool, a Rust server — can be
 * written against from the description below.
 *
 * ## The layout
 *
 * All multi-byte integers are little-endian, written one at a time through a
 * `DataView`. Never by aliasing a typed array's `ArrayBuffer`: that would emit
 * the host's byte order, and a big-endian peer would then compute a different
 * snapshot hash for a state it agrees with in every other respect.
 *
 * ```text
 * header      magic "MMSN" (4 bytes, order-free)
 *             u16 schemaVersion          <- offset 4, the version every reader checks first
 *             u16 reserved (0)
 *             u32 rootSeed
 *             u32 contentRevision        <- contracts.md §0: the gate on inter-universe interaction
 *             u32 illegalActionCount
 *             u32 worldTick
 *             u32 engagementTick
 *             u8  clockMode
 *             u8  reserved (0)
 *             u16 componentCount
 * entities    u32 slotCount, u32 freeCount
 *             slotCount × u16 generation
 *             slotCount × u8  alive
 *             freeCount × u32 freed slot, in free-list order (LIFO, top last)
 * components  componentCount × {
 *               u8 nameLength, name bytes (ASCII)
 *               u8 fieldCount
 *               fieldCount × { u8 nameLength, name bytes, u8 kindCode }
 *               u32 rowCount
 *               rowCount × u32 slot, ascending
 *               fieldCount × rowCount values, at each field's natural width,
 *                 field-major — every value of field 0, then of field 1, …
 *             }
 * ```
 *
 * Three properties of that layout are load-bearing:
 *
 * 1. **Rows are written in ascending slot order, never storage order.** The
 *    component store swap-removes, so row order is a function of the destroy
 *    history rather than of the state. Two peers that reached the same world by
 *    different routes must produce the same bytes, and this is where that is
 *    made true.
 * 2. **The free list is written verbatim, top last.** Its *order* decides which
 *    slot the next `create` returns; rebuilding it from the dead slots would
 *    hand out different entity IDs after a save/load, which is a desync
 *    discovered a month later.
 * 3. **The tag table is self-describing.** Component and field names and widths
 *    travel with the payload, so a snapshot loaded against the wrong world
 *    fails by name instead of by silently reinterpreting `hp` as `age`.
 *
 * ## Field values are stored as unsigned bit patterns
 *
 * A field's value is masked to its own width — `-5` in an `i16` is written as
 * `0xfffb` — and restored by assigning that number straight back into the typed
 * array, which reapplies the signed interpretation. Carrying signedness only in
 * the tag table, never in the value, is what makes `decode(encode(x)) === x`
 * exactly rather than approximately, and it is what lets a migration written
 * against {@link SnapshotEnvelope} do arithmetic on `values` without first
 * knowing which fields were signed.
 */

/**
 * The schema version this build writes and reads.
 *
 * Bumped whenever the byte layout or the meaning of a field changes, and never
 * for a change that leaves both alone. Every bump owes the migration registry a
 * step from the previous version, or every save from before the bump becomes
 * unreadable — see `migrations.ts`.
 */
export const SNAPSHOT_VERSION = 1;

/** `MMSN` — Multiverse Mages SNapshot. Written as bytes, so it has no endianness. */
const MAGIC = [0x4d, 0x4d, 0x53, 0x4e] as const;

const HEADER_RESERVED = 0;

/** 2^32, the exclusive bound on every `u32` the header carries. */
const UINT32_COUNT = 4294967296;

/** Longest ASCII name a tag table entry may carry, because the length is a `u8`. */
const MAX_NAME_LENGTH = 255;

/** Highest code point a tag-table name may use. Names are ASCII by construction. */
const MAX_ASCII = 127;

/**
 * On-the-wire codes for field widths.
 *
 * Explicit and stable: these are serialized, so the numbers are part of the
 * format and may never be reassigned. A new width gets the next unused code.
 */
const KIND_CODE: Readonly<Record<ComponentFieldKind, number>> = {
  i8: 1,
  u8: 2,
  i16: 3,
  u16: 4,
  i32: 5,
  u32: 6,
};

const CODE_KIND: readonly (ComponentFieldKind | undefined)[] = [
  undefined,
  'i8',
  'u8',
  'i16',
  'u16',
  'i32',
  'u32',
];

/** Bytes one value of each width occupies in the payload. */
const KIND_BYTES: Readonly<Record<ComponentFieldKind, number>> = {
  i8: 1,
  u8: 1,
  i16: 2,
  u16: 2,
  i32: 4,
  u32: 4,
};

/**
 * A typed array seen as plain indexed integers.
 *
 * `ComponentStore.field` is generic over the field's declared width, which is
 * exactly the right type for rules code and exactly the wrong one here: the
 * serializer is deliberately width-agnostic and reads the width from the tag
 * table instead. Narrowing through this alias keeps that intent explicit and
 * keeps `any` — which the core bans — out of the file.
 */
interface IndexedInts {
  [index: number]: number;
  readonly length: number;
}

/** One field of a component, as the tag table describes it. */
export interface SnapshotField {
  readonly name: string;
  readonly kind: ComponentFieldKind;
}

/**
 * One component's contribution to a snapshot.
 *
 * `values` is field-major and `slots.length` long per field, so the value of
 * field `f` for the entity in `slots[i]` is `values[f * slots.length + i]`.
 * Field-major rather than row-major because migrations are written per field —
 * "the wealth component gained its coins by doubling" touches one contiguous
 * run — and because it is the same struct-of-arrays shape the live store uses.
 */
export interface SnapshotComponent {
  readonly name: string;
  readonly fields: readonly SnapshotField[];
  /** Slot indices carrying this component, strictly ascending. */
  readonly slots: Uint32Array;
  /** Masked, unsigned field values, field-major. Length is `fields.length * slots.length`. */
  readonly values: Uint32Array;
}

/** The clock, as a snapshot carries it. */
export interface SnapshotClock {
  readonly worldTick: number;
  readonly engagementTick: number;
  readonly mode: TimeMode;
}

/** The entity store's slot bookkeeping, as a snapshot carries it. */
export interface SnapshotEntities {
  readonly generations: Uint16Array;
  readonly alive: Uint8Array;
  /** Freed slots in free-list order: the next `create` takes the last one. */
  readonly freeList: Uint32Array;
}

/**
 * A decoded snapshot, before it becomes a state.
 *
 * This is the surface migrations are written against, and it exists precisely
 * so they can be. A migration that had to work on raw bytes would have to
 * re-implement the parser; one that had to work on a live `SimState` could not
 * run at all, because the state it is migrating *to* is the only one the
 * current build knows how to construct. The envelope is the layer where a
 * snapshot is structured but not yet interpreted.
 */
export interface SnapshotEnvelope {
  readonly version: number;
  readonly rootSeed: number;
  readonly contentRevision: number;
  readonly illegalActionCount: number;
  readonly clock: SnapshotClock;
  readonly entities: SnapshotEntities;
  readonly components: readonly SnapshotComponent[];
}

export interface DeserializeOptions {
  /**
   * Migrations to apply when the buffer is older than {@link SNAPSHOT_VERSION}.
   *
   * Optional, and an older snapshot without one is an error rather than a
   * best-effort load. `world-persistence` requires the missing step to be
   * named: a save that silently loads as something else is worse than a save
   * that refuses to load.
   */
  readonly migrations?: MigrationRegistry;
}

/** Writes little-endian integers into a buffer that grows as needed. */
class ByteWriter {
  #bytes = new Uint8Array(256);
  #view = new DataView(this.#bytes.buffer);
  #offset = 0;

  get length(): number {
    return this.#offset;
  }

  u8(value: number): void {
    this.#reserve(1);
    this.#view.setUint8(this.#offset, value);
    this.#offset += 1;
  }

  u16(value: number): void {
    this.#reserve(2);
    this.#view.setUint16(this.#offset, value, true);
    this.#offset += 2;
  }

  u32(value: number): void {
    this.#reserve(4);
    this.#view.setUint32(this.#offset, value, true);
    this.#offset += 4;
  }

  /** Writes a value at one of the component field widths. */
  atWidth(bytes: number, value: number): void {
    if (bytes === 1) {
      this.u8(value);
      return;
    }
    if (bytes === 2) {
      this.u16(value);
      return;
    }
    this.u32(value);
  }

  /** A length-prefixed ASCII name, as the tag table stores it. */
  name(value: string, role: string): void {
    if (value.length < 1 || value.length > MAX_NAME_LENGTH) {
      throw new RangeError(
        `Snapshot ${role} name "${value}" is ${value.length} characters; names must be 1..${MAX_NAME_LENGTH}.`,
      );
    }
    this.u8(value.length);
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      if (code > MAX_ASCII) {
        throw new RangeError(
          `Snapshot ${role} name "${value}" contains a non-ASCII character; the tag table is ASCII.`,
        );
      }
      this.u8(code);
    }
  }

  /** An independent copy of the bytes written, exactly as long as they are. */
  toBytes(): Uint8Array {
    return this.#bytes.slice(0, this.#offset);
  }

  #reserve(needed: number): void {
    const required = this.#offset + needed;
    if (required <= this.#bytes.length) {
      return;
    }
    let capacity = this.#bytes.length;
    while (capacity < required) {
      capacity *= 2;
    }
    const grown = new Uint8Array(capacity);
    grown.set(this.#bytes);
    this.#bytes = grown;
    this.#view = new DataView(grown.buffer);
  }
}

/**
 * Reads little-endian integers, refusing to read past the end.
 *
 * Every read names what it was reading. A snapshot is an input from outside the
 * process — off disk, or off a network in `pvp-server` — so "the buffer ended"
 * is a message someone will have to act on, and "at the seventh component's
 * third field name" is the difference between a five-minute diagnosis and an
 * afternoon with a hex editor.
 */
class ByteReader {
  readonly #bytes: Uint8Array;
  readonly #view: DataView;
  #offset = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get offset(): number {
    return this.#offset;
  }

  get remaining(): number {
    return this.#bytes.length - this.#offset;
  }

  u8(role: string): number {
    this.#need(1, role);
    const value = this.#view.getUint8(this.#offset);
    this.#offset += 1;
    return value;
  }

  u16(role: string): number {
    this.#need(2, role);
    const value = this.#view.getUint16(this.#offset, true);
    this.#offset += 2;
    return value;
  }

  u32(role: string): number {
    this.#need(4, role);
    const value = this.#view.getUint32(this.#offset, true);
    this.#offset += 4;
    return value;
  }

  atWidth(bytes: number, role: string): number {
    if (bytes === 1) {
      return this.u8(role);
    }
    if (bytes === 2) {
      return this.u16(role);
    }
    return this.u32(role);
  }

  name(role: string): string {
    const length = this.u8(`${role} name length`);
    if (length === 0) {
      throw new Error(`Snapshot ${role} name is empty at offset ${this.#offset - 1}.`);
    }
    this.#need(length, `${role} name`);
    let value = '';
    for (let i = 0; i < length; i += 1) {
      value += String.fromCharCode(this.#view.getUint8(this.#offset + i));
    }
    this.#offset += length;
    return value;
  }

  #need(bytes: number, role: string): void {
    if (this.#offset + bytes > this.#bytes.length) {
      throw new Error(
        `Snapshot is truncated: reading ${role} needs ${bytes} more byte(s) at offset ` +
          `${this.#offset}, but the buffer ends at ${this.#bytes.length}.`,
      );
    }
  }
}

function assertUint32(value: number, role: string): number {
  if (!Number.isInteger(value) || value < 0 || value >= UINT32_COUNT) {
    throw new RangeError(
      `Snapshot ${role} must be an integer in [0, 4294967295], received ${String(value)}.`,
    );
  }
  return value;
}

/** The declared width of a live field, read back from the array backing it. */
function kindOfArray(array: unknown, component: string, field: string): ComponentFieldKind {
  if (array instanceof Int8Array) return 'i8';
  if (array instanceof Uint8Array) return 'u8';
  if (array instanceof Int16Array) return 'i16';
  if (array instanceof Uint16Array) return 'u16';
  if (array instanceof Int32Array) return 'i32';
  if (array instanceof Uint32Array) return 'u32';
  throw new Error(`Component "${component}" field "${field}" is backed by an unknown array type.`);
}

/** A component's field array, seen as plain indexed integers. */
function fieldInts(component: ComponentStore<ComponentFields>, field: string): IndexedInts {
  return component.field(field) as unknown as IndexedInts;
}

/** A field value as its own width's unsigned bit pattern. */
function maskToWidth(value: number, kind: ComponentFieldKind): number {
  const bytes = KIND_BYTES[kind];
  if (bytes === 1) {
    return value & 0xff;
  }
  if (bytes === 2) {
    return value & 0xffff;
  }
  return value >>> 0;
}

/**
 * Projects a live state into the structured form the format encodes.
 *
 * Exported because it is the seam a tool wants: a debugger that wants to read a
 * state's contents, or a future delta-compressor for `pvp-server`, should work
 * on envelopes rather than re-deriving the layout from this file.
 */
export function stateToEnvelope(state: SimState): SnapshotEnvelope {
  const slotState = state.entities.rawSlotState();

  const components: SnapshotComponent[] = [];
  for (const spec of state.schema.components) {
    const store = state.component(spec.name);

    const fields: SnapshotField[] = store.fieldNames.map((fieldName) => ({
      name: fieldName,
      kind: kindOfArray(store.field(fieldName), spec.name, fieldName),
    }));

    // Ascending slot order, not row order: rows move under swap-removal, so row
    // order records how the state was reached rather than what it is.
    const slots: number[] = [];
    const rows: number[] = [];
    store.forEach((row, _handle, slot) => {
      slots.push(slot);
      rows.push(row);
    });

    const values = new Uint32Array(fields.length * rows.length);
    for (let f = 0; f < fields.length; f += 1) {
      const field = fields[f] as SnapshotField;
      const array = fieldInts(store, field.name);
      const base = f * rows.length;
      for (let i = 0; i < rows.length; i += 1) {
        values[base + i] = maskToWidth(array[rows[i] as number] as number, field.kind);
      }
    }

    components.push({ name: spec.name, fields, slots: Uint32Array.from(slots), values });
  }

  return {
    version: SNAPSHOT_VERSION,
    rootSeed: state.rootSeed,
    contentRevision: state.contentRevision,
    illegalActionCount: state.illegalActionCount,
    clock: {
      worldTick: state.clock.worldTick,
      engagementTick: state.clock.engagementTick,
      mode: state.clock.mode,
    },
    entities: {
      generations: slotState.generations.slice(),
      alive: slotState.alive.slice(),
      freeList: slotState.freeList.slice(),
    },
    components,
  };
}

/**
 * Encodes an envelope to bytes.
 *
 * Validates the envelope's internal consistency first. An envelope is a
 * structured document that a migration may have rewritten by hand, and a
 * component whose tag table promises more rows than its payload carries would
 * otherwise be written out as a snapshot that is corrupt at rest — the one
 * shape of bug that survives every later check by looking well-formed.
 */
export function encodeSnapshot(envelope: SnapshotEnvelope): Uint8Array {
  const writer = new ByteWriter();

  for (const byte of MAGIC) {
    writer.u8(byte);
  }
  if (assertUint32(envelope.version, 'schema version') > 0xffff) {
    throw new RangeError(`Snapshot schema version ${envelope.version} does not fit in 16 bits.`);
  }
  writer.u16(envelope.version);
  writer.u16(HEADER_RESERVED);
  writer.u32(assertUint32(envelope.rootSeed, 'root seed'));
  writer.u32(assertUint32(envelope.contentRevision, 'content revision'));
  writer.u32(assertUint32(envelope.illegalActionCount, 'illegal action count'));
  writer.u32(assertUint32(envelope.clock.worldTick, 'world tick'));
  writer.u32(assertUint32(envelope.clock.engagementTick, 'engagement tick'));
  writer.u8(assertUint32(envelope.clock.mode, 'clock mode'));
  writer.u8(HEADER_RESERVED);
  if (envelope.components.length > 0xffff) {
    throw new RangeError(`Snapshot declares ${envelope.components.length} components; the limit is 65535.`);
  }
  writer.u16(envelope.components.length);

  const { generations, alive, freeList } = envelope.entities;
  if (generations.length !== alive.length) {
    throw new Error(
      `Snapshot entity table is inconsistent: ${generations.length} generations but ` +
        `${alive.length} liveness flags.`,
    );
  }
  writer.u32(generations.length);
  writer.u32(freeList.length);
  for (let slot = 0; slot < generations.length; slot += 1) {
    writer.u16(generations[slot] as number);
  }
  for (let slot = 0; slot < alive.length; slot += 1) {
    writer.u8(alive[slot] as number);
  }
  for (let i = 0; i < freeList.length; i += 1) {
    writer.u32(freeList[i] as number);
  }

  for (const component of envelope.components) {
    const rowCount = component.slots.length;
    const expectedValues = component.fields.length * rowCount;
    if (component.values.length !== expectedValues) {
      throw new Error(
        `Snapshot component "${component.name}" declares ${rowCount} slot(s) across ` +
          `${component.fields.length} field(s), which needs ${expectedValues} value(s), ` +
          `but it carries ${component.values.length}.`,
      );
    }
    if (component.fields.length < 1 || component.fields.length > 0xff) {
      throw new RangeError(
        `Snapshot component "${component.name}" declares ${component.fields.length} fields; the range is 1..255.`,
      );
    }

    writer.name(component.name, 'component');
    writer.u8(component.fields.length);
    for (const field of component.fields) {
      writer.name(field.name, `component "${component.name}" field`);
      const code = KIND_CODE[field.kind];
      if (code === undefined) {
        throw new Error(
          `Snapshot component "${component.name}" field "${field.name}" has unknown width "${String(field.kind)}".`,
        );
      }
      writer.u8(code);
    }

    writer.u32(rowCount);
    for (let i = 0; i < rowCount; i += 1) {
      writer.u32(component.slots[i] as number);
    }
    for (let f = 0; f < component.fields.length; f += 1) {
      const bytes = KIND_BYTES[(component.fields[f] as SnapshotField).kind];
      const base = f * rowCount;
      for (let i = 0; i < rowCount; i += 1) {
        writer.atWidth(bytes, component.values[base + i] as number);
      }
    }
  }

  return writer.toBytes();
}

/**
 * Parses bytes into an envelope, without judging the version.
 *
 * Version *policy* lives in {@link deserializeState}, not here, and the
 * separation is what makes migration possible at all: to migrate a version-`N-1`
 * snapshot you must first be able to read one, and a parser that refused
 * anything but the current version would leave the migration registry with
 * nothing to operate on. What this function does enforce is that the bytes are
 * structurally a snapshot: the magic matches, no read runs past the end, and
 * nothing is left over at the end.
 */
export function decodeSnapshot(bytes: Uint8Array): SnapshotEnvelope {
  if (bytes.length < MAGIC.length) {
    throw new Error(
      `Buffer of ${bytes.length} byte(s) is not a Multiverse Mages snapshot: it is too short to ` +
        'even carry the magic number.',
    );
  }
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (bytes[i] !== MAGIC[i]) {
      throw new Error(
        'Buffer is not a Multiverse Mages snapshot: expected the magic bytes 4d 4d 53 4e ("MMSN"), ' +
          `found ${byteHex(bytes, MAGIC.length)}.`,
      );
    }
  }

  const reader = new ByteReader(bytes);
  for (let i = 0; i < MAGIC.length; i += 1) {
    reader.u8('magic');
  }

  const version = reader.u16('schema version');
  reader.u16('reserved header word');
  const rootSeed = reader.u32('root seed');
  const contentRevision = reader.u32('content revision');
  const illegalActionCount = reader.u32('illegal action count');
  const worldTick = reader.u32('world tick');
  const engagementTick = reader.u32('engagement tick');
  const mode = reader.u8('clock mode');
  reader.u8('reserved header byte');
  const componentCount = reader.u16('component count');

  if (mode !== TIME_MODE.world && mode !== TIME_MODE.engagement) {
    throw new Error(
      `Snapshot declares clock mode ${mode}; the only modes are ${TIME_MODE.world} (world) and ` +
        `${TIME_MODE.engagement} (engagement).`,
    );
  }

  const slotCount = reader.u32('entity slot count');
  const freeCount = reader.u32('entity free-list length');

  const generations = new Uint16Array(slotCount);
  for (let slot = 0; slot < slotCount; slot += 1) {
    generations[slot] = reader.u16(`generation of slot ${slot}`);
  }
  const alive = new Uint8Array(slotCount);
  for (let slot = 0; slot < slotCount; slot += 1) {
    alive[slot] = reader.u8(`liveness of slot ${slot}`);
  }
  const freeList = new Uint32Array(freeCount);
  for (let i = 0; i < freeCount; i += 1) {
    freeList[i] = reader.u32(`free-list entry ${i}`);
  }

  const components: SnapshotComponent[] = [];
  for (let c = 0; c < componentCount; c += 1) {
    const name = reader.name(`component ${c}`);
    const fieldCount = reader.u8(`component "${name}" field count`);
    if (fieldCount === 0) {
      throw new Error(`Snapshot component "${name}" declares no fields.`);
    }

    const fields: SnapshotField[] = [];
    for (let f = 0; f < fieldCount; f += 1) {
      const fieldName = reader.name(`component "${name}" field ${f}`);
      const code = reader.u8(`component "${name}" field "${fieldName}" width`);
      const kind = CODE_KIND[code];
      if (kind === undefined) {
        throw new Error(
          `Snapshot component "${name}" field "${fieldName}" declares unknown width code ${code}.`,
        );
      }
      fields.push({ name: fieldName, kind });
    }

    const rowCount = reader.u32(`component "${name}" row count`);
    const slots = new Uint32Array(rowCount);
    for (let i = 0; i < rowCount; i += 1) {
      slots[i] = reader.u32(`component "${name}" slot ${i}`);
    }

    const values = new Uint32Array(fieldCount * rowCount);
    for (let f = 0; f < fieldCount; f += 1) {
      const field = fields[f] as SnapshotField;
      const width = KIND_BYTES[field.kind];
      const base = f * rowCount;
      for (let i = 0; i < rowCount; i += 1) {
        values[base + i] = reader.atWidth(width, `component "${name}" field "${field.name}" value ${i}`);
      }
    }

    components.push({ name, fields, slots, values });
  }

  if (reader.remaining !== 0) {
    throw new Error(
      `Snapshot has ${reader.remaining} unread trailing byte(s) after ${componentCount} component(s). ` +
        'The format is fully determined by its header, so trailing bytes mean the buffer is not what it claims.',
    );
  }

  return {
    version,
    rootSeed,
    contentRevision,
    illegalActionCount,
    clock: { worldTick, engagementTick, mode },
    entities: { generations, alive, freeList },
    components,
  };
}

/** The first few bytes as hex, for a "this is not a snapshot" message. */
function byteHex(bytes: Uint8Array, count: number): string {
  const parts: string[] = [];
  for (let i = 0; i < count && i < bytes.length; i += 1) {
    parts.push((bytes[i] as number).toString(16).padStart(2, '0'));
  }
  return parts.join(' ');
}

/**
 * Rebuilds a live state from an envelope, against the world it must fit.
 *
 * The schema is a parameter rather than something the snapshot carries, and
 * every mismatch is an error rather than a coercion. A snapshot that named a
 * component this world does not declare could plausibly be loaded by ignoring
 * it; a snapshot whose `age` is `u16` where this world says `u32` could
 * plausibly be widened. Both "plausibly"s are how a save file quietly becomes a
 * different game, so both are refused by name.
 */
export function envelopeToState(envelope: SnapshotEnvelope, schema: WorldSchema): SimState {
  if (envelope.version !== SNAPSHOT_VERSION) {
    throw new Error(
      `Cannot build a state from a snapshot at schema version ${envelope.version}; this build ` +
        `constructs states from version ${SNAPSHOT_VERSION}. Migrate it first.`,
    );
  }

  const state = SimState.create({
    rootSeed: envelope.rootSeed,
    schema,
    contentRevision: envelope.contentRevision,
  });
  state.illegalActionCount = envelope.illegalActionCount;
  state.clock.worldTick = envelope.clock.worldTick;
  state.clock.engagementTick = envelope.clock.engagementTick;
  state.clock.mode = envelope.clock.mode;

  // Validation of the slot bookkeeping — a free list naming a live slot, a
  // generation outside the encodable range — belongs to the entity store, which
  // owns those invariants. Duplicating it here would give two checks that drift.
  state.entities.restoreSlotState({
    generations: envelope.entities.generations,
    alive: envelope.entities.alive,
    freeList: envelope.entities.freeList,
  });

  const declared = new Set(schema.components.map((spec) => spec.name));
  const carried = new Map<string, SnapshotComponent>();
  for (const component of envelope.components) {
    if (!declared.has(component.name)) {
      throw new Error(
        `Snapshot carries component "${component.name}", which this world does not declare. ` +
          `Declared: ${[...declared].join(', ') || '(none)'}.`,
      );
    }
    if (carried.has(component.name)) {
      throw new Error(`Snapshot carries component "${component.name}" twice.`);
    }
    carried.set(component.name, component);
  }

  for (const spec of schema.components) {
    const component = carried.get(spec.name);
    if (component === undefined) {
      throw new Error(
        `Snapshot carries no component "${spec.name}", which this world declares. A snapshot must ` +
          'describe every component of the world it is loaded into.',
      );
    }
    restoreComponent(state, component);
  }

  return state;
}

/** Fills one component's rows from the snapshot, validating shape and slots. */
function restoreComponent(state: SimState, snapshot: SnapshotComponent): void {
  const store = state.component(snapshot.name);

  if (snapshot.fields.length !== store.fieldNames.length) {
    throw new Error(
      `Snapshot component "${snapshot.name}" carries ${snapshot.fields.length} field(s), but this ` +
        `world declares ${store.fieldNames.length}.`,
    );
  }
  for (let f = 0; f < snapshot.fields.length; f += 1) {
    const field = snapshot.fields[f] as SnapshotField;
    const declaredName = store.fieldNames[f] as string;
    if (field.name !== declaredName) {
      throw new Error(
        `Snapshot component "${snapshot.name}" field ${f} is "${field.name}", but this world ` +
          `declares "${declaredName}" there. Field order is part of the format.`,
      );
    }
    const declaredKind = kindOfArray(store.field(declaredName), snapshot.name, declaredName);
    if (field.kind !== declaredKind) {
      throw new Error(
        `Snapshot component "${snapshot.name}" field "${field.name}" is ${field.kind}, but this ` +
          `world declares ${declaredKind}. Widening a field is a schema change and needs a migration.`,
      );
    }
  }

  const rowCount = snapshot.slots.length;
  if (snapshot.values.length !== snapshot.fields.length * rowCount) {
    throw new Error(
      `Snapshot component "${snapshot.name}" declares ${rowCount} slot(s) across ` +
        `${snapshot.fields.length} field(s) but carries ${snapshot.values.length} value(s); its tag ` +
        'table does not match its payload.',
    );
  }

  const rows = new Int32Array(rowCount);
  let previous = -1;
  for (let i = 0; i < rowCount; i += 1) {
    const slot = snapshot.slots[i] as number;
    if (slot <= previous) {
      throw new Error(
        `Snapshot component "${snapshot.name}" lists slot ${slot} after slot ${previous}; slots must ` +
          'be strictly ascending, or two peers would restore the same state into different row orders.',
      );
    }
    previous = slot;

    const handle = state.entities.handleAt(slot);
    if (handle === NULL_ENTITY) {
      throw new Error(
        `Snapshot component "${snapshot.name}" names slot ${slot}, which holds no live entity.`,
      );
    }
    rows[i] = store.add(handle);
  }

  for (let f = 0; f < snapshot.fields.length; f += 1) {
    const field = snapshot.fields[f] as SnapshotField;
    // Re-fetched per field and after every `add` above: growing a component
    // replaces its backing arrays.
    const array = fieldInts(store, field.name);
    const base = f * rowCount;
    for (let i = 0; i < rowCount; i += 1) {
      array[rows[i] as number] = snapshot.values[base + i] as number;
    }
  }
}

/** Serializes a complete state to bytes. */
export function serializeState(state: SimState): Uint8Array {
  return encodeSnapshot(stateToEnvelope(state));
}

/**
 * Restores a state from bytes, migrating it forward if it is older.
 *
 * The three version outcomes are deliberately different in kind:
 *
 * - **Newer than this build.** Refused, naming both versions. A future
 *   snapshot may contain fields with no meaning here; loading it partially
 *   would produce a state that is wrong in ways nothing downstream can detect.
 * - **Older than this build.** Migrated, or refused naming the missing step.
 * - **Current.** Loaded.
 */
export function deserializeState(
  bytes: Uint8Array,
  schema: WorldSchema,
  options: DeserializeOptions = {},
): SimState {
  const envelope = decodeSnapshot(bytes);

  if (envelope.version > SNAPSHOT_VERSION) {
    throw new Error(
      `Snapshot is at schema version ${envelope.version}, which is newer than the version ` +
        `${SNAPSHOT_VERSION} this build supports. Upgrade before loading it — a newer snapshot ` +
        'cannot be read by an older build, because migrations only run forward.',
    );
  }

  if (envelope.version === SNAPSHOT_VERSION) {
    return envelopeToState(envelope, schema);
  }

  const migrations = options.migrations;
  if (migrations === undefined) {
    throw new Error(
      `Snapshot is at schema version ${envelope.version}, but this build reads version ` +
        `${SNAPSHOT_VERSION}, and no migration registry was supplied. Loading it requires ` +
        `migrations from ${envelope.version} to ${SNAPSHOT_VERSION}.`,
    );
  }

  return envelopeToState(migrations.migrate(envelope, SNAPSHOT_VERSION), schema);
}

/**
 * The deterministic content hash of a state, as 16 lowercase hex characters.
 *
 * Defined as the hash of the state's serialized bytes, which is what makes it
 * comparable between processes at all: it is a function of the published byte
 * layout above, not of this build's object graph. `hash.ts` argues why FNV-1a
 * is the right function and why its arithmetic is exact on every engine.
 */
export function snapshotHash(state: SimState): string {
  return hashBytes(serializeState(state));
}
