/*
 * Multiverse Mages — canonical binary snapshots of simulation state.
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
import type { ComponentFieldKind, ComponentSpec, ComponentFields } from '../component.js';
import type { SimState, WorldSchema } from '../state.js';
import { createState } from '../state.js';
import { hashBytes } from './hash.js';
import type { MigrationRegistry } from './migrations.js';

/**
 * ## Canonicality is the whole point
 *
 * A snapshot is not just "state, written down". It is the *only* definition of
 * what it means for two simulations to be in the same state, because
 * `snapshotHash` is what the replay harness compares, what a golden fixture
 * records, and what the authoritative PvP server will compare against each
 * peer at 0.16.0 to decide that a desync happened. So the encoding has one
 * obligation above every other: **two states with the same content must
 * produce byte-identical buffers, no matter how they got there.**
 *
 * That obligation is not free, because the in-memory layout deliberately is
 * *not* canonical. `ComponentStore` swap-removes on detach, so a component's
 * row order is a function of the destroy history: build the same two rows in a
 * different order, or destroy and recreate an entity, and the same content sits
 * in transposed rows. `SimState.clone` copies that raw layout on purpose (see
 * its comment — a canonical re-sort per component per tick would make the Monte
 * Carlo harness pay for a property only the serializer needs). The cost is paid
 * here instead, exactly once, at the boundary:
 *
 * - **Component rows are always emitted in ascending slot index order**, via
 *   `ComponentStore.forEach`, which is slot-ordered by construction. Raw row
 *   order is never read and must never be — that is the single mistake that
 *   would make every hash comparison in the project quietly meaningless while
 *   all the tests still passed on one machine.
 * - **Components are emitted in schema declaration order.** `WorldSchema` says
 *   that order is load-bearing for exactly this reason.
 * - **The free list is emitted verbatim, LIFO order included.** It is content,
 *   not bookkeeping: it decides which slot the next `create()` returns, so a
 *   "tidied" free list restores a state that allocates different entity IDs
 *   than the original for the same subsequent actions.
 *
 * ## Why a hand-rolled binary format
 *
 * JSON would be shorter to write and would betray us three ways: key order is
 * an engine detail, numbers round-trip through a decimal float, and a typed
 * array has no JSON form that survives without a schema. Structured clone is
 * not a format at all. So: a fixed little-endian binary layout, read and
 * written through `DataView` with explicit byte offsets and an explicit
 * endianness argument on every access. Nothing here assumes alignment — the
 * sections pack tight, so a `u32` routinely lands on an odd offset, which a
 * typed-array view over the buffer would either mis-read or refuse to create.
 * Little-endian is chosen once and stated everywhere rather than inherited from
 * the host, because a big-endian consumer must produce the same bytes.
 *
 * ## Layout
 *
 * Header, 36 bytes:
 *
 * | off | size | field                                    |
 * | --- | ---- | ---------------------------------------- |
 * |   0 |    4 | magic `MMSN`, ASCII                      |
 * |   4 |    2 | u16 format version                       |
 * |   6 |    2 | u16 flags, reserved, must be 0           |
 * |   8 |    4 | u32 payload length, bytes after header   |
 * |  12 |    4 | u32 root seed                            |
 * |  16 |    4 | u32 content revision                     |
 * |  20 |    4 | u32 illegal action count                 |
 * |  24 |    4 | u32 world tick                           |
 * |  28 |    4 | u32 engagement tick                      |
 * |  32 |    1 | u8 time mode                             |
 * |  33 |    3 | padding, zero                            |
 * |  36 |    4 | u32 step ordinal                         |
 *
 * Payload: `u32 slotCount`, `slotCount x u16` generations, `slotCount x u8`
 * liveness, `u32 freeCount`, `freeCount x u32` free slots; then `u16`
 * component count and, per component, a length-prefixed ASCII name, a
 * length-prefixed field table of (name, kind code), a `u32` row count,
 * `rowCount x u32` ascending slot indices, and `rowCount * fieldCount x u32`
 * values in row-major order.
 *
 * `payloadLength` is redundant with the buffer length and is stored anyway: it
 * is the check that catches a buffer truncated at its very last byte, where
 * every internal count still agrees and only the final value is missing.
 *
 * ## Values are raw bits, not numbers
 *
 * Every field value is stored as the raw 32-bit two's-complement pattern
 * (`value >>> 0` on write) regardless of the field's declared width, and is
 * assigned straight back into the destination typed array on read, which
 * reinterprets it. That is what lets one code path carry both an `i32` of -1
 * and a `u32` of 4294967295 — the same bits — without a per-kind branch that
 * could disagree with itself in one direction. A signed intermediate would
 * silently destroy any `u32` above 2^31, which is a value the game genuinely
 * uses (accumulated knowledge counters) and which no small test would notice.
 *
 * ## What is *not* serialized
 *
 * Systems. They are functions, they live in the `WorldSchema`, and they are
 * supplied by the binary doing the loading — hence `schema` being a required
 * argument to `deserializeState`. A snapshot records what a world *is*; the
 * program it is loaded into decides what that world *does*. The schema is also
 * the thing validated against, which is why loading a save into a build whose
 * components have drifted fails loudly here instead of producing a state whose
 * fields are shifted by one.
 */

/** The format version written by this build. Bumping it obsoletes fixtures. */
export const SNAPSHOT_VERSION = 1;

/** File magic. Four ASCII bytes, so a wrong buffer fails on byte 0, not byte 400. */
const MAGIC = 'MMSN';

/** Bytes of fixed header before the payload begins. */
const HEADER_BYTES = 40;

/** Zero bytes after the mode byte, so the payload starts on a 4-byte boundary. */
const HEADER_PADDING_BYTES = 3;

/** Reserved for future use; a non-zero value means a format this build cannot read. */
const FLAGS_NONE = 0;

const MAX_UINT8 = 0xff;
const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;

const BYTES_PER_U8 = 1;
const BYTES_PER_U16 = 2;
const BYTES_PER_U32 = 4;

/** Printable ASCII, the only bytes a component or field name may contain. */
const MIN_NAME_BYTE = 0x20;
const MAX_NAME_BYTE = 0x7e;

/**
 * Field width, as a number on the wire.
 *
 * The codes are part of the format and must never be reassigned: an old
 * snapshot's `4` has to keep meaning `i32` forever. Adding a width appends a
 * code; it never renumbers one. The reverse table is indexed by code, so the
 * two directions cannot drift apart the way two hand-written maps would.
 */
const KIND_BY_CODE: readonly ComponentFieldKind[] = ['i8', 'u8', 'i16', 'u16', 'i32', 'u32'];

const codeOfKind = (kind: ComponentFieldKind): number => KIND_BY_CODE.indexOf(kind);

/**
 * The typed arrays a component field can be backed by.
 *
 * Declared locally rather than imported because `component.ts` keeps it
 * private; what this module needs is only the shared "indexable by number"
 * shape, and restating it here costs one line and adds no coupling.
 */
type FieldArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array;

/** One component's rows, flattened, in the canonical ascending-slot order. */
export interface SnapshotComponent {
  readonly name: string;
  readonly fields: readonly { readonly name: string; readonly kind: ComponentFieldKind }[];
  /** Ascending slot indices, one per row. Ascending is a format requirement. */
  readonly slots: Uint32Array;
  /** Row-major, `slots.length * fields.length` entries, raw two's-complement bits. */
  readonly values: Uint32Array;
}

/**
 * A snapshot as structured data, one decode away from bytes and one build away
 * from a `SimState`.
 *
 * The envelope exists so migrations have something to be pure functions *of*.
 * A migration that took a `SimState` could not run at all for a snapshot whose
 * components no longer match any schema this build declares — which is the
 * exact situation a migration exists to resolve.
 */
export interface SnapshotEnvelope {
  readonly version: number;
  readonly rootSeed: number;
  readonly contentRevision: number;
  readonly illegalActionCount: number;
  readonly clock: {
    readonly worldTick: number;
    readonly engagementTick: number;
    readonly stepOrdinal: number;
    readonly mode: number;
  };
  readonly entities: {
    readonly generations: Uint16Array;
    readonly alive: Uint8Array;
    readonly freeList: Uint32Array;
  };
  readonly components: readonly SnapshotComponent[];
}

/** Options for {@link deserializeState}. */
export interface DeserializeOptions {
  /** Steps that bring an older snapshot forward. Absent means "current only". */
  readonly migrations?: MigrationRegistry;
}

/**
 * Sequential little-endian writer over a pre-sized buffer.
 *
 * Pre-sized rather than growable on purpose: {@link measurePayload} computes the
 * exact byte count from the same envelope this writes, so a size mismatch is a
 * bug in one of the two and {@link encodeSnapshot} asserts they agree. A
 * growable writer would paper over that disagreement by reallocating, and the
 * first symptom would be a fixture that changed size for no reason.
 */
class SnapshotWriter {
  readonly #view: DataView;
  #offset = 0;

  constructor(bytes: Uint8Array) {
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get offset(): number {
    return this.#offset;
  }

  u8(value: number): void {
    this.#view.setUint8(this.#offset, value & MAX_UINT8);
    this.#offset += BYTES_PER_U8;
  }

  u16(value: number): void {
    this.#view.setUint16(this.#offset, value & MAX_UINT16, true);
    this.#offset += BYTES_PER_U16;
  }

  u32(value: number): void {
    this.#view.setUint32(this.#offset, value >>> 0, true);
    this.#offset += BYTES_PER_U32;
  }

  /**
   * Writes a string one char code at a time.
   *
   * Deliberately not `TextEncoder`: the core compiles with `types: []` against
   * the ES2022 lib alone, where `TextEncoder` does not exist, and even where it
   * does it is a host object whose behaviour is a platform question. Names are
   * validated as printable ASCII before they reach here, so a char code is a
   * byte and there is nothing left to encode.
   */
  ascii(text: string): void {
    for (let index = 0; index < text.length; index += 1) {
      this.u8(text.charCodeAt(index));
    }
  }

  /** Leaves bytes at their zero-initialised value. Only used for header padding. */
  skip(count: number): void {
    this.#offset += count;
  }
}

/**
 * Sequential little-endian reader that bounds-checks every access.
 *
 * A snapshot is an input from outside the process — off disk, or off a network
 * in `pvp-server`. Every read is therefore checked, and every failure names the
 * field it was reading and the offset it was reading at, because "unexpected
 * end of buffer" tells a support ticket nothing. Reads are element-wise through
 * `DataView` rather than by wrapping a typed array around the buffer: the
 * sections pack tight so offsets are routinely unaligned, and a typed-array
 * view would additionally inherit the host's endianness.
 */
class SnapshotReader {
  readonly #view: DataView;
  #offset: number;

  constructor(bytes: Uint8Array, offset: number) {
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.#offset = offset;
  }

  get offset(): number {
    return this.#offset;
  }

  /**
   * Checks that a declared run of elements actually fits *before* anything is
   * allocated for it. Without this, a corrupt `rowCount` of four billion would
   * try to allocate sixteen gigabytes and die as an out-of-memory crash rather
   * than as the descriptive failure the spec requires.
   */
  expectRun(count: number, stride: number, what: string): void {
    const needed = count * stride;
    const remaining = this.#view.byteLength - this.#offset;
    if (needed > remaining) {
      throw new Error(
        `Snapshot is truncated: ${what} declares ${count} entries of ${stride} byte(s), needing ` +
          `${needed} bytes, but only ${remaining} remain — the run would read past the end.`,
      );
    }
  }

  u8(what: string): number {
    return this.#view.getUint8(this.#take(BYTES_PER_U8, what));
  }

  u16(what: string): number {
    return this.#view.getUint16(this.#take(BYTES_PER_U16, what), true);
  }

  u32(what: string): number {
    return this.#view.getUint32(this.#take(BYTES_PER_U32, what), true);
  }

  /**
   * Consumes reserved bytes, which are zero by format.
   *
   * Checked rather than skipped: a non-zero reserved byte means the buffer was
   * written by something that uses those bits, so this build is about to read a
   * layout it does not implement. Cheaper to say so than to mis-read the
   * payload that follows.
   */
  padding(count: number, what: string): void {
    const at = this.#take(count, what);
    for (let index = 0; index < count; index += 1) {
      const byte = this.#view.getUint8(at + index);
      if (byte !== 0) {
        throw new Error(
          `Snapshot ${what} has byte 0x${byte.toString(16)} at position ${index}; reserved bytes ` +
            'are zero by format, so this buffer uses a layout this build does not implement.',
        );
      }
    }
  }

  ascii(length: number, what: string): string {
    const at = this.#take(length, what);
    let text = '';
    for (let index = 0; index < length; index += 1) {
      const code = this.#view.getUint8(at + index);
      if (code < MIN_NAME_BYTE || code > MAX_NAME_BYTE) {
        throw new Error(
          `Snapshot ${what} contains byte 0x${code.toString(16)} at position ${index}, which is ` +
            'not printable ASCII. Component and field names are ASCII by format.',
        );
      }
      text += String.fromCharCode(code);
    }
    return text;
  }

  #take(size: number, what: string): number {
    const at = this.#offset;
    if (at + size > this.#view.byteLength) {
      throw new Error(
        `Snapshot is truncated: reading ${what} needs ${size} byte(s) at offset ${at}, past the ` +
          `end of a ${this.#view.byteLength}-byte buffer.`,
      );
    }
    this.#offset = at + size;
    return at;
  }
}

/**
 * Captures a state as an envelope, in canonical order.
 *
 * Every array is copied rather than aliased. `EntityStore.rawSlotState` hands
 * back live subarray views, and an envelope outlives the call that made it —
 * an aliased envelope would appear to mutate whenever the state it came from
 * was stepped, which is the most confusing possible form of "the hash changed
 * and nothing changed it".
 */
export function stateToEnvelope(state: SimState): SnapshotEnvelope {
  const slotState = state.entities.rawSlotState();
  const components: SnapshotComponent[] = [];

  // Schema order, not map-iteration order: the schema says component order is
  // part of the format, and a Map's order would depend on registration.
  for (const spec of state.schema.components) {
    const store = state.component(spec.name);
    const fields = fieldsOfSpec(spec);
    const fieldCount = fields.length;
    const arrays: FieldArray[] = fields.map((field) => store.field(field.name) as FieldArray);

    const slots = new Uint32Array(store.size);
    const values = new Uint32Array(store.size * fieldCount);

    // forEach is ascending slot order. Raw row order is never read here — see
    // this module's opening comment for why that is the load-bearing rule.
    let index = 0;
    store.forEach((row, _handle, slot) => {
      slots[index] = slot;
      const base = index * fieldCount;
      for (let field = 0; field < fieldCount; field += 1) {
        values[base + field] = ((arrays[field] as FieldArray)[row] as number) >>> 0;
      }
      index += 1;
    });

    components.push({ name: spec.name, fields, slots, values });
  }

  return {
    version: SNAPSHOT_VERSION,
    rootSeed: state.rootSeed,
    contentRevision: state.contentRevision,
    illegalActionCount: state.illegalActionCount,
    clock: {
      worldTick: state.clock.worldTick,
      engagementTick: state.clock.engagementTick,
      stepOrdinal: state.clock.stepOrdinal,
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

/** Encodes an envelope to its canonical bytes. */
export function encodeSnapshot(envelope: SnapshotEnvelope): Uint8Array {
  validateEnvelopeShape(envelope);

  const payloadLength = measurePayload(envelope);
  const bytes = new Uint8Array(HEADER_BYTES + payloadLength);
  const writer = new SnapshotWriter(bytes);

  writer.ascii(MAGIC);
  writer.u16(envelope.version);
  writer.u16(FLAGS_NONE);
  writer.u32(payloadLength);
  writer.u32(envelope.rootSeed);
  writer.u32(envelope.contentRevision);
  writer.u32(envelope.illegalActionCount);
  writer.u32(envelope.clock.worldTick);
  writer.u32(envelope.clock.engagementTick);
  writer.u8(envelope.clock.mode);
  writer.skip(HEADER_PADDING_BYTES);
  writer.u32(envelope.clock.stepOrdinal);

  const { generations, alive, freeList } = envelope.entities;
  writer.u32(generations.length);
  for (let slot = 0; slot < generations.length; slot += 1) {
    writer.u16(generations[slot] as number);
  }
  for (let slot = 0; slot < alive.length; slot += 1) {
    writer.u8(alive[slot] as number);
  }
  // Verbatim, top included: the LIFO order decides the next allocation.
  writer.u32(freeList.length);
  for (let index = 0; index < freeList.length; index += 1) {
    writer.u32(freeList[index] as number);
  }

  writer.u16(envelope.components.length);
  for (const component of envelope.components) {
    writer.u8(component.name.length);
    writer.ascii(component.name);
    writer.u8(component.fields.length);
    for (const field of component.fields) {
      writer.u8(field.name.length);
      writer.ascii(field.name);
      writer.u8(codeOfKind(field.kind));
    }
    writer.u32(component.slots.length);
    for (let row = 0; row < component.slots.length; row += 1) {
      writer.u32(component.slots[row] as number);
    }
    for (let index = 0; index < component.values.length; index += 1) {
      writer.u32(component.values[index] as number);
    }
  }

  if (writer.offset !== bytes.length) {
    // Unreachable unless measurePayload and the writer disagree, which would be
    // a same-file bug that silently changes every fixture's size.
    throw new Error(
      `Snapshot writer produced ${writer.offset} bytes for a ${bytes.length}-byte buffer; the ` +
        'size calculation and the layout have diverged.',
    );
  }
  return bytes;
}

/**
 * Decodes bytes to an envelope.
 *
 * **Accepts any version, including 0 and versions from the future.** Version
 * policy deliberately lives in {@link deserializeState}, because the migration
 * path has to decode an old snapshot *before* it can decide anything about it —
 * a decoder that enforced the current version would make migration impossible
 * by construction.
 */
export function decodeSnapshot(buffer: Uint8Array): SnapshotEnvelope {
  // Magic first, so a buffer that is not a snapshot at all is diagnosed as that
  // rather than as a truncated one.
  if (buffer.byteLength < MAGIC.length) {
    throw new Error(
      `Buffer is ${buffer.byteLength} bytes, too short to be a snapshot: it cannot even hold the ` +
        `${MAGIC.length}-byte "${MAGIC}" magic.`,
    );
  }
  for (let index = 0; index < MAGIC.length; index += 1) {
    if ((buffer[index] as number) !== MAGIC.charCodeAt(index)) {
      throw new Error(
        `Buffer does not begin with the "${MAGIC}" snapshot magic, so it is not a snapshot.`,
      );
    }
  }
  if (buffer.byteLength < HEADER_BYTES) {
    throw new Error(
      `Snapshot is truncated: the header is ${HEADER_BYTES} bytes but the buffer holds only ` +
        `${buffer.byteLength}.`,
    );
  }

  const reader = new SnapshotReader(buffer, MAGIC.length);
  const version = reader.u16('the format version');
  const flags = reader.u16('the header flags');
  if (flags !== FLAGS_NONE) {
    throw new Error(
      `Snapshot header flags are ${flags}; this build understands only ${FLAGS_NONE}. The buffer ` +
        'was written by a format variant this build does not implement.',
    );
  }

  const payloadLength = reader.u32('the payload length');
  const actualPayload = buffer.byteLength - HEADER_BYTES;
  if (payloadLength !== actualPayload) {
    throw new Error(
      `Snapshot declares a ${payloadLength}-byte payload but the buffer carries ${actualPayload} ` +
        'bytes after the header, so it is truncated or has trailing data.',
    );
  }

  const rootSeed = reader.u32('the root seed');
  const contentRevision = reader.u32('the content revision');
  const illegalActionCount = reader.u32('the illegal-action count');
  const worldTick = reader.u32('the world tick');
  const engagementTick = reader.u32('the engagement tick');
  const mode = reader.u8('the time mode');
  reader.padding(HEADER_PADDING_BYTES, 'the header padding');
  const stepOrdinal = reader.u32('the step ordinal');

  const slotCount = reader.u32('the entity slot count');
  reader.expectRun(slotCount, BYTES_PER_U16, 'the entity generation table');
  const generations = new Uint16Array(slotCount);
  for (let slot = 0; slot < slotCount; slot += 1) {
    generations[slot] = reader.u16('an entity generation');
  }
  reader.expectRun(slotCount, BYTES_PER_U8, 'the entity liveness table');
  const alive = new Uint8Array(slotCount);
  for (let slot = 0; slot < slotCount; slot += 1) {
    alive[slot] = reader.u8('an entity liveness flag');
  }

  const freeCount = reader.u32('the free-list length');
  reader.expectRun(freeCount, BYTES_PER_U32, 'the entity free list');
  const freeList = new Uint32Array(freeCount);
  for (let index = 0; index < freeCount; index += 1) {
    freeList[index] = reader.u32('a free-list entry');
  }

  const componentCount = reader.u16('the component count');
  const components: SnapshotComponent[] = [];
  for (let index = 0; index < componentCount; index += 1) {
    components.push(readComponent(reader));
  }

  if (reader.offset !== buffer.byteLength) {
    throw new Error(
      `Snapshot has ${buffer.byteLength - reader.offset} unread trailing byte(s) after its last ` +
        'component, so its tag table does not describe its payload.',
    );
  }

  return {
    version,
    rootSeed,
    contentRevision,
    illegalActionCount,
    clock: { worldTick, engagementTick, mode, stepOrdinal },
    entities: { generations, alive, freeList },
    components,
  };
}

/**
 * Builds a live state from an envelope, validating it against the schema the
 * caller intends to run.
 *
 * Nothing is written into the returned state until every check has passed, and
 * the state is constructed locally — so a rejected snapshot leaves the caller
 * with an exception and no object at all, never a half-populated world that
 * looks loadable. `world-persistence` asks for exactly that.
 */
export function envelopeToState(envelope: SnapshotEnvelope, schema: WorldSchema): SimState {
  validateEnvelopeShape(envelope);
  validateAgainstSchema(envelope, schema);

  if (envelope.clock.mode !== TIME_MODE.world && envelope.clock.mode !== TIME_MODE.engagement) {
    throw new Error(
      `Snapshot declares time mode ${envelope.clock.mode}; the only modes are ` +
        `${TIME_MODE.world} (world) and ${TIME_MODE.engagement} (engagement).`,
    );
  }
  requireCount(envelope.illegalActionCount, 'illegal-action count');
  requireCount(envelope.clock.worldTick, 'world tick');
  requireCount(envelope.clock.engagementTick, 'engagement tick');
  requireCount(envelope.clock.stepOrdinal, 'step ordinal');

  // createState range-checks rootSeed and contentRevision and throws on its own.
  const state = createState({
    rootSeed: envelope.rootSeed,
    schema,
    contentRevision: envelope.contentRevision,
  });
  state.illegalActionCount = envelope.illegalActionCount;
  state.clock.worldTick = envelope.clock.worldTick;
  state.clock.engagementTick = envelope.clock.engagementTick;
  state.clock.stepOrdinal = envelope.clock.stepOrdinal;
  state.clock.mode =
    envelope.clock.mode === TIME_MODE.engagement ? TIME_MODE.engagement : TIME_MODE.world;

  // The entity store validates generations and the free list itself, including
  // the case that matters most — a free list naming a live slot, which would
  // otherwise hand one slot to two entities. Let it throw.
  state.entities.restoreSlotState({
    generations: envelope.entities.generations,
    alive: envelope.entities.alive,
    freeList: envelope.entities.freeList,
  });

  for (const component of envelope.components) {
    const store = state.component(component.name);
    const fieldCount = component.fields.length;
    // Pre-grow so the field arrays fetched below survive every add; `add` would
    // otherwise replace them mid-loop and the writes would land in a dead buffer.
    store.reserve(component.slots.length);
    const arrays: FieldArray[] = component.fields.map(
      (field) => store.field(field.name) as FieldArray,
    );

    for (let index = 0; index < component.slots.length; index += 1) {
      const slot = component.slots[index] as number;
      const handle = state.entities.handleAt(slot);
      const row = store.add(handle);
      const base = index * fieldCount;
      for (let field = 0; field < fieldCount; field += 1) {
        // Raw bits into the destination array, which reinterprets them for the
        // declared width. See this module's opening comment.
        (arrays[field] as FieldArray)[row] = component.values[base + field] as number;
      }
    }
  }

  return state;
}

/** A state as canonical bytes. */
export function serializeState(state: SimState): Uint8Array {
  return encodeSnapshot(stateToEnvelope(state));
}

/**
 * Restores a state from bytes, migrating it forward first if it is older and a
 * registry says how.
 */
export function deserializeState(
  buffer: Uint8Array,
  schema: WorldSchema,
  options?: DeserializeOptions,
): SimState {
  const decoded = decodeSnapshot(buffer);
  const current = reconcileVersion(decoded, options?.migrations);
  return envelopeToState(current, schema);
}

/**
 * The deterministic content hash of a state: the digest of its canonical bytes.
 *
 * Defined as `hashBytes(serializeState(state))` and nothing else, so there is
 * exactly one thing to keep canonical. A hash computed by walking the state
 * directly would be a second, subtly different definition of equality, and the
 * day the two disagreed would be the day a desync report stopped meaning
 * anything.
 */
export function snapshotHash(state: SimState): string {
  return hashBytes(serializeState(state));
}

/**
 * Applies version policy: current passes, newer is refused, older needs a
 * registry.
 *
 * Refusing a newer snapshot is not conservatism. A future version may have
 * moved a field, and every value after that point would be read as something
 * else — a save that loads with the wrong numbers is far worse than one that
 * refuses to load, because the player keeps playing it.
 */
function reconcileVersion(
  envelope: SnapshotEnvelope,
  migrations: MigrationRegistry | undefined,
): SnapshotEnvelope {
  if (envelope.version === SNAPSHOT_VERSION) {
    return envelope;
  }
  if (envelope.version > SNAPSHOT_VERSION) {
    throw new Error(
      `Snapshot format version ${envelope.version} is newer than the supported version ` +
        `${SNAPSHOT_VERSION}. This build cannot read it; upgrade the program rather than the save.`,
    );
  }
  if (migrations === undefined) {
    throw new Error(
      `Snapshot format version ${envelope.version} is older than the supported version ` +
        `${SNAPSHOT_VERSION}, and no migration registry was supplied to bring it forward.`,
    );
  }
  return migrations.migrate(envelope, SNAPSHOT_VERSION);
}

/**
 * Exact payload byte count for an envelope.
 *
 * Computed analytically from the same envelope the writer walks, so the two are
 * one edit apart and {@link encodeSnapshot} asserts they agree. The alternative
 * — encode into a growable buffer and record the length afterwards — would let
 * a layout change and a size change diverge silently, and the symptom would be
 * a `payloadLength` field that no longer catches a truncated buffer.
 */
function measurePayload(envelope: SnapshotEnvelope): number {
  const slotCount = envelope.entities.generations.length;
  let bytes =
    BYTES_PER_U32 +
    slotCount * BYTES_PER_U16 +
    slotCount * BYTES_PER_U8 +
    BYTES_PER_U32 +
    envelope.entities.freeList.length * BYTES_PER_U32 +
    BYTES_PER_U16;

  for (const component of envelope.components) {
    // Name: one length byte plus one byte per (ASCII, validated) character.
    bytes += BYTES_PER_U8 + component.name.length + BYTES_PER_U8;
    for (const field of component.fields) {
      bytes += BYTES_PER_U8 + field.name.length + BYTES_PER_U8;
    }
    bytes +=
      BYTES_PER_U32 +
      component.slots.length * BYTES_PER_U32 +
      component.values.length * BYTES_PER_U32;
  }
  return bytes;
}

/** One component's tag table and payload. */
function readComponent(reader: SnapshotReader): SnapshotComponent {
  const nameLength = reader.u8('a component name length');
  const name = reader.ascii(nameLength, 'a component name');

  const fieldCount = reader.u8('a component field count');
  const fields: { readonly name: string; readonly kind: ComponentFieldKind }[] = [];
  for (let index = 0; index < fieldCount; index += 1) {
    const fieldNameLength = reader.u8(`a field name length in component "${name}"`);
    const fieldName = reader.ascii(fieldNameLength, `a field name in component "${name}"`);
    const code = reader.u8(`the kind of field "${fieldName}" in component "${name}"`);
    const kind = KIND_BY_CODE[code];
    if (kind === undefined) {
      throw new Error(
        `Snapshot component "${name}" field "${fieldName}" declares storage kind code ${code}, ` +
          `which this build does not define (known codes are 0..${KIND_BY_CODE.length - 1}).`,
      );
    }
    fields.push({ name: fieldName, kind });
  }

  const rowCount = reader.u32(`the row count of component "${name}"`);
  reader.expectRun(rowCount, BYTES_PER_U32, `the slot table of component "${name}"`);
  const slots = new Uint32Array(rowCount);
  for (let row = 0; row < rowCount; row += 1) {
    slots[row] = reader.u32(`a slot index of component "${name}"`);
  }

  const valueCount = rowCount * fieldCount;
  reader.expectRun(valueCount, BYTES_PER_U32, `the value table of component "${name}"`);
  const values = new Uint32Array(valueCount);
  for (let index = 0; index < valueCount; index += 1) {
    values[index] = reader.u32(`a field value of component "${name}"`);
  }

  return { name, fields, slots, values };
}

/**
 * Checks an envelope is internally coherent, independently of any schema.
 *
 * Run by both {@link encodeSnapshot} and {@link envelopeToState} rather than by
 * one of them, because an envelope reaches each by a different route: encode
 * gets envelopes assembled by callers and by migrations, and `envelopeToState`
 * gets envelopes straight out of a migration chain that never passed through
 * bytes. A migration is a plain function returning a plain object; nothing
 * stops one from resizing `slots` and forgetting `values`.
 */
function validateEnvelopeShape(envelope: SnapshotEnvelope): void {
  requireCount(envelope.version, 'format version');
  if (envelope.version > MAX_UINT16) {
    throw new Error(`Snapshot format version ${envelope.version} does not fit the u16 header field.`);
  }

  // The header's four scalars, checked on the way OUT as well as on the way in.
  //
  // They were previously validated only in `envelopeToState`, so encoding took
  // whatever it was given and `SnapshotWriter.u32` reduced it mod 2^32. That is
  // the worst available failure mode: an out-of-range value does not fail, it
  // becomes a different, entirely legitimate-looking value — an
  // `illegalActionCount` of 2^32 round-trips as 0, and nothing anywhere says so.
  // `illegalActionCount` is unbounded and, per contracts.md §4.2, incremented
  // constantly by learning agents; `contentRevision` is worse still, because
  // §0 makes it the gate on whether two universes may interact at all, and it
  // is a writable field on a live state.
  requireCount(envelope.illegalActionCount, 'illegal-action count');
  requireCount(envelope.contentRevision, 'content revision');
  requireCount(envelope.clock.worldTick, 'world tick');
  requireCount(envelope.clock.engagementTick, 'engagement tick');
  requireCount(envelope.clock.stepOrdinal, 'step ordinal');

  const { generations, alive, freeList } = envelope.entities;
  if (generations.length !== alive.length) {
    throw new Error(
      `Snapshot entity tables disagree: ${generations.length} generations but ${alive.length} ` +
        'liveness flags. Both are indexed by slot and must be the same length.',
    );
  }
  if (generations.length > MAX_UINT32 || freeList.length > MAX_UINT32) {
    throw new Error('Snapshot entity tables exceed the u32 counts the format can encode.');
  }

  if (envelope.components.length > MAX_UINT16) {
    throw new Error(
      `Snapshot declares ${envelope.components.length} components, above the ${MAX_UINT16} the ` +
        'u16 component count can encode.',
    );
  }

  const seen = new Set<string>();
  for (const component of envelope.components) {
    requireName(component.name, `component name "${component.name}"`);
    if (seen.has(component.name)) {
      throw new Error(`Snapshot declares component "${component.name}" more than once.`);
    }
    seen.add(component.name);

    if (component.fields.length === 0 || component.fields.length > MAX_UINT8) {
      throw new Error(
        `Snapshot component "${component.name}" declares ${component.fields.length} fields; the ` +
          `format allows 1..${MAX_UINT8}.`,
      );
    }
    const seenFields = new Set<string>();
    for (const field of component.fields) {
      requireName(field.name, `field name "${field.name}" of component "${component.name}"`);
      if (seenFields.has(field.name)) {
        throw new Error(
          `Snapshot component "${component.name}" declares field "${field.name}" more than once.`,
        );
      }
      seenFields.add(field.name);
      if (codeOfKind(field.kind) < 0) {
        throw new Error(
          `Snapshot component "${component.name}" field "${field.name}" has unknown storage kind ` +
            `"${field.kind}".`,
        );
      }
    }

    const expected = component.slots.length * component.fields.length;
    if (component.values.length !== expected) {
      throw new Error(
        `Snapshot component "${component.name}" carries ${component.slots.length} slot row(s) ` +
          `over ${component.fields.length} field(s), which needs ${expected} values, but its ` +
          `value table holds ${component.values.length}.`,
      );
    }
  }
}

/**
 * Checks an envelope against the schema it is about to be loaded into.
 *
 * Both directions of the component comparison are checked. A snapshot carrying
 * a component the world dropped and a world declaring a component the snapshot
 * predates are different bugs with different fixes, and neither may be silently
 * tolerated: the first would discard state, the second would restore a world
 * whose new component is empty for every entity without saying so.
 *
 * Field *order* is checked too, not just the set of names. Values are row-major
 * by field position, so a snapshot whose field table is permuted would pass a
 * name-set comparison and then write every value into the wrong field — the
 * kind of corruption that looks like a balance change.
 */
function validateAgainstSchema(envelope: SnapshotEnvelope, schema: WorldSchema): void {
  const declared = new Map<string, ComponentSpec<ComponentFields>>();
  for (const spec of schema.components) {
    declared.set(spec.name, spec);
  }
  const carried = new Set(envelope.components.map((component) => component.name));

  for (const spec of schema.components) {
    if (!carried.has(spec.name)) {
      throw new Error(
        `Snapshot is missing component "${spec.name}", which this world declares. The save was ` +
          'written by a build with a different world schema.',
      );
    }
  }

  const slotCount = envelope.entities.generations.length;
  for (const component of envelope.components) {
    const spec = declared.get(component.name);
    if (spec === undefined) {
      throw new Error(
        `Snapshot carries component "${component.name}", which this world does not declare. The ` +
          'save was written by a build with a different world schema.',
      );
    }

    const expectedFields = fieldsOfSpec(spec);
    if (expectedFields.length !== component.fields.length) {
      throw new Error(
        `Snapshot component "${component.name}" has ${component.fields.length} field(s) but this ` +
          `world declares ${expectedFields.length}.`,
      );
    }
    for (let index = 0; index < expectedFields.length; index += 1) {
      const expected = expectedFields[index] as { name: string; kind: ComponentFieldKind };
      const actual = component.fields[index] as { name: string; kind: ComponentFieldKind };
      if (expected.name !== actual.name) {
        throw new Error(
          `Snapshot component "${component.name}" declares field "${actual.name}" at position ` +
            `${index} where this world declares "${expected.name}". Field order is part of the ` +
            'format, because values are stored row-major by field position.',
        );
      }
      if (expected.kind !== actual.kind) {
        throw new Error(
          `Snapshot component "${component.name}" field "${actual.name}" is stored as ` +
            `${actual.kind} but this world declares it as ${expected.kind}.`,
        );
      }
    }

    // Ascending and in range. Ascending is checked rather than assumed because
    // it is the property the whole hash comparison rests on: a snapshot whose
    // rows are permuted would restore a state that re-serializes to different
    // bytes, and two peers would then "desync" without ever disagreeing.
    let previous = -1;
    for (let index = 0; index < component.slots.length; index += 1) {
      const slot = component.slots[index] as number;
      if (slot >= slotCount) {
        throw new Error(
          `Snapshot component "${component.name}" names slot ${slot}, but the snapshot has only ` +
            `${slotCount} entity slot(s).`,
        );
      }
      if (slot <= previous) {
        throw new Error(
          `Snapshot component "${component.name}" lists slot ${slot} after slot ${previous}; ` +
            'component rows must be in ascending slot order for the format to be canonical.',
        );
      }
      if ((envelope.entities.alive[slot] as number) !== 1) {
        throw new Error(
          `Snapshot component "${component.name}" names slot ${slot}, which holds no live entity.`,
        );
      }
      previous = slot;
    }
  }
}

/** A spec's fields in declaration order, which is the order they serialize in. */
function fieldsOfSpec(
  spec: ComponentSpec<ComponentFields>,
): { readonly name: string; readonly kind: ComponentFieldKind }[] {
  return Object.keys(spec.fields).map((name) => ({
    name,
    kind: spec.fields[name] as ComponentFieldKind,
  }));
}

/** Header scalars are unsigned 32-bit counters; anything else cannot be encoded. */
function requireCount(value: number, role: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_UINT32) {
    throw new Error(
      `Snapshot ${role} is ${String(value)}; it must be an integer in 0..${MAX_UINT32}.`,
    );
  }
}

/** Names are length-prefixed with a single byte and are printable ASCII. */
function requireName(name: string, role: string): void {
  if (name.length === 0 || name.length > MAX_UINT8) {
    throw new Error(
      `Snapshot ${role} is ${name.length} characters; the format allows 1..${MAX_UINT8}.`,
    );
  }
  for (let index = 0; index < name.length; index += 1) {
    const code = name.charCodeAt(index);
    if (code < MIN_NAME_BYTE || code > MAX_NAME_BYTE) {
      throw new Error(
        `Snapshot ${role} contains a character outside printable ASCII at position ${index}. ` +
          'Names are one byte per character by format, so that no text encoding is involved.',
      );
    }
  }
}
