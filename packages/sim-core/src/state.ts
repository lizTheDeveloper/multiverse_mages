/*
 * Multiverse Mages — the simulation state container and world schema.
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

import type { ReadonlyClock } from './clock.js';
import { cloneClock, createClock, currentTick } from './clock.js';
import type { Clock, TimeMode } from './clock.js';
import type { ComponentFields, ComponentSpec } from './component.js';
import type { ComponentStore } from './component.js';
import { EntityStore } from './entity-store.js';
import type { RngStream } from './rng/pcg32.js';

/**
 * Randomness as a system sees it: already bound to this step.
 *
 * The tick argument is deliberately absent. `RngSource` takes one, and a system
 * that passed the wrong one — `ctx.tick` being the obvious, wrong choice —
 * would produce a run that still replayed deterministically while quietly
 * reusing the same numbers. `engagementTick` restarts at zero each engagement,
 * so every raid would roll identical dice at each ordinal, and no test anywhere
 * would fail.
 *
 * Binding it here removes the decision rather than documenting it. There is no
 * correct-tick discipline for a rules author to remember, because there is no
 * tick to pass.
 */
export interface StepRng {
  readonly rootSeed: number;
  /** This subsystem's stream for this step. */
  stream(subsystemId: number): RngStream;
  /**
   * This subsystem's stream for one actor at this step. `actorKey` must be a
   * stable identity — an entity handle — never an array index or visit
   * position, or inserting an actor shifts every later actor's rolls.
   */
  actorStream(subsystemId: number, actorKey: number): RngStream;
}

const UINT32_COUNT = 4294967296;
const UINT32_MAX = 4294967295;

/**
 * `contentRevision` is a 128-bit hash rendered as 32 lowercase hex characters.
 *
 * **A string, in a package that bans floating point — deliberately, and not a
 * loophole.** The float ban exists because arithmetic must be reproducible bit
 * for bit on every machine. This value is never arithmetic: it is compared for
 * equality, written to the snapshot header as 16 raw bytes, and nothing else.
 * There is no add, no divide, no rounding, so there is nothing for a float to
 * be wrong about.
 *
 * It is a string rather than a number because 128 bits does not fit one. The
 * field used to be a `uint32`, which meant `@mm/content`'s 128-bit hash was
 * folded to a quarter of its width on the way in. `contracts.md` §0 makes this
 * value the gate on whether two universes may interact at all, with no
 * partial-compatibility rule and no negotiation — so a fold makes "equal
 * revisions" mean *probably* identical content, with birthday collisions
 * likely around 65,000 distinct content sets. Carrying the full width end to
 * end is what makes equality mean what §0 says it means.
 */
export const CONTENT_REVISION_HEX_LENGTH = 32;

/** The 16 raw bytes the snapshot header stores. */
export const CONTENT_REVISION_BYTES = 16;

/** What a state carries before any content has been loaded into it. */
export const CONTENT_REVISION_ZERO = '00000000000000000000000000000000';

/**
 * Lowercase only. Two renderings of the same hash that differ in case would
 * compare unequal and refuse a raid between two identical universes, so one
 * casing is admitted and the other is a malformed value, not a synonym.
 */
const CONTENT_REVISION_SHAPE = /^[0-9a-f]{32}$/;

/** Whether a value is a well-formed `contentRevision`. */
export function isContentRevision(value: unknown): value is string {
  return typeof value === 'string' && CONTENT_REVISION_SHAPE.test(value);
}

/** Snapshot names are length-prefixed with one byte and written as printable ASCII. */
const MAX_NAME_LENGTH = 255;
const MIN_NAME_CHAR = 0x20;
const MAX_NAME_CHAR = 0x7e;

/**
 * One submission to `step`.
 *
 * Deliberately flat integers. `contracts.md` §4.2 defines the god's action
 * space as discrete IDs with integer parameters, and §4.4 has parameterized
 * actions address slot-indexed candidate lists rather than raw handles — so
 * nothing here needs to carry a string, an object, or a reference. A shape
 * this narrow is also a shape the action log can serialize without a schema.
 */
export interface Action {
  readonly kind: number;
  readonly params?: readonly number[];
}

/**
 * What a system is handed on each tick.
 *
 * `state` is the **working copy** `step` owns for this tick, never the caller's
 * state. Mutating it is the intended way for a system to do anything.
 */
export interface StepContext {
  /** The working copy for this tick. Mutate this. */
  readonly state: SimState;
  /** Actions submitted for this tick, in submission order. */
  readonly actions: readonly Action[];
  /** Seeded randomness, already bound to this step. See {@link StepRng}. */
  readonly rng: StepRng;
  /** The tick of the running scale, before this step's advance. */
  readonly tick: number;
  /** Which scale is running. */
  readonly mode: TimeMode;
  /**
   * Asks for a switch to engagement mode at the end of this tick — for a raid
   * that begins as a rules consequence rather than as a god's action.
   */
  requestEngagement(): void;
  /** Asks for a return to world time at the end of this tick. */
  requestWorldTime(): void;
}

/**
 * A named unit of rules that runs once per tick.
 *
 * Systems are code, not data: they live in the schema and are carried by
 * reference through clones and never serialized. A snapshot restores what the
 * world *is*, and the binary it is loaded into decides what the world *does*.
 */
export interface System {
  readonly name: string;
  run(ctx: StepContext): void;
}

export interface WorldSchemaInput {
  readonly components: readonly ComponentSpec<ComponentFields>[];
  readonly systems: readonly System[];
  /** Hard ceiling on entity slots. Defaults to the full handle range. */
  readonly maxSlots?: number;
}

/**
 * The static shape of a world: which components exist, which systems run, in
 * what order.
 *
 * **Declaration order is load-bearing in both lists.** Component order is the
 * order sections appear in a snapshot, so reordering it changes every
 * serialized byte and therefore every committed golden fixture. System order is
 * the order rules resolve in, so reordering it changes the game. Neither is
 * something to tidy alphabetically.
 */
export type WorldSchema = Readonly<Required<Omit<WorldSchemaInput, 'maxSlots'>>> & {
  readonly maxSlots?: number;
};

/**
 * Validates a world definition and freezes its order.
 *
 * Duplicate names are rejected here rather than at first use: a second
 * component called `vitality` would be a silent shadow in the snapshot's tag
 * table, and a second system with a familiar name is how a rules change gets
 * applied twice.
 */
/**
 * Rejects a name the snapshot format cannot write.
 *
 * Checked here rather than only at serialization, which is where it used to
 * surface. A component named `vitalité` defined fine, created state fine, and
 * stepped fine — and then threw on the first autosave, hours into a run, from a
 * call site that had nothing to do with naming it. The constraint belongs where
 * the name is chosen.
 */
function assertEncodableName(name: string, role: string): void {
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
    throw new Error(
      `${role} must be 1 to ${MAX_NAME_LENGTH} characters; the snapshot format length-prefixes ` +
        `names with a single byte. Received ${name.length}.`,
    );
  }
  for (let i = 0; i < name.length; i += 1) {
    const code = name.charCodeAt(i);
    if (code < MIN_NAME_CHAR || code > MAX_NAME_CHAR) {
      throw new Error(
        `${role} contains a character outside printable ASCII at position ${i}. Snapshot names ` +
          'are written byte-for-byte so that two machines encode them identically.',
      );
    }
  }
}

export function defineWorld(input: WorldSchemaInput): WorldSchema {
  const componentNames = new Set<string>();
  for (const spec of input.components) {
    if (componentNames.has(spec.name)) {
      throw new Error(`World declares component "${spec.name}" more than once.`);
    }
    componentNames.add(spec.name);
    assertEncodableName(spec.name, `Component name "${spec.name}"`);
    for (const fieldName of Object.keys(spec.fields)) {
      assertEncodableName(fieldName, `Field name "${fieldName}" of component "${spec.name}"`);
    }
  }

  const systemNames = new Set<string>();
  for (const system of input.systems) {
    if (systemNames.has(system.name)) {
      throw new Error(`World declares system "${system.name}" more than once.`);
    }
    systemNames.add(system.name);
  }

  const schema: WorldSchema = {
    components: [...input.components],
    systems: [...input.systems],
    ...(input.maxSlots === undefined ? {} : { maxSlots: input.maxSlots }),
  };
  return schema;
}

export interface CreateStateOptions {
  /** The universe's seed. Unsigned 32-bit; determines every random draw. */
  readonly rootSeed: number;
  readonly schema: WorldSchema;
  /**
   * Hash over all loaded content, per `contracts.md` §0: 32 lowercase hex
   * characters, exactly as `@mm/content` renders it. Two universes may only
   * interact when these are equal. Defaults to {@link CONTENT_REVISION_ZERO}
   * for a state built without a content registry.
   */
  readonly contentRevision?: string;
}

/**
 * Everything the simulation is, at one instant.
 *
 * Treated as immutable at the API boundary: `step` clones before it touches
 * anything, so a caller that holds a state holds it forever. Internally the
 * clone is a real copy of every typed array, not a structural share — a
 * copy-on-write scheme would be faster to clone and would make every rules
 * author responsible for remembering to trigger the copy, which is the class
 * of rule this codebase enforces mechanically instead.
 */
export class SimState {
  readonly schema: WorldSchema;

  /** The universe's seed. Fixed for the life of a run. */
  readonly rootSeed: number;

  /**
   * Hash over loaded content; the gate on inter-universe interaction.
   *
   * 32 lowercase hex characters — the full 128 bits `@mm/content` computes.
   * See {@link CONTENT_REVISION_HEX_LENGTH} for why a string is not a breach
   * of the float ban.
   */
  contentRevision: string;

  readonly clock: Clock;

  readonly entities: EntityStore;

  /**
   * Actions rejected as illegal since the run began.
   *
   * `contracts.md` §4.2 requires an illegal action to be a cheap no-op plus a
   * counter increment, never an exception — RL agents submit them constantly
   * and an exception would make training a debugging exercise. The counter is
   * what keeps "cheap" from also meaning "invisible", so it is part of state
   * and part of the snapshot.
   */
  illegalActionCount: number;

  readonly #components: Map<string, ComponentStore<ComponentFields>>;

  private constructor(schema: WorldSchema, rootSeed: number, contentRevision: string) {
    this.schema = schema;
    this.rootSeed = rootSeed;
    this.contentRevision = contentRevision;
    this.illegalActionCount = 0;
    this.clock = createClock();
    this.entities = new EntityStore(
      schema.maxSlots === undefined ? {} : { maxSlots: schema.maxSlots },
    );

    this.#components = new Map();
    for (const spec of schema.components) {
      this.#components.set(spec.name, this.entities.registerComponent(spec));
    }
  }

  /** @internal Used by {@link createState} and the deserializer. */
  static create(options: CreateStateOptions): SimState {
    const { rootSeed, schema } = options;
    if (!Number.isInteger(rootSeed) || rootSeed < 0 || rootSeed >= UINT32_COUNT) {
      throw new RangeError(
        `rootSeed must be an integer in [0, 4294967295], received ${String(rootSeed)}`,
      );
    }
    const contentRevision = options.contentRevision ?? CONTENT_REVISION_ZERO;
    if (!isContentRevision(contentRevision)) {
      throw new RangeError(
        `contentRevision must be exactly ${CONTENT_REVISION_HEX_LENGTH} lowercase hex characters ` +
          `— the full 128-bit hash @mm/content renders — received ${JSON.stringify(contentRevision)}. ` +
          'contracts.md §0 gates every inter-universe interaction on equality of this value, so a ' +
          'truncated, uppercased, or otherwise reshaped one would make two universes look ' +
          'compatible or incompatible for reasons that have nothing to do with their content.',
      );
    }
    return new SimState(schema, rootSeed, contentRevision);
  }

  /**
   * Counts one rejected action, saturating at the `uint32` ceiling.
   *
   * Saturating rather than wrapping, and rather than being left unbounded.
   * The counter is a `uint32` in the snapshot header, and a training run that
   * submitted illegal actions for long enough would otherwise either wrap to a
   * smaller number than it started at — reporting *fewer* rejections than
   * actually happened — or grow past what the format can encode and make the
   * state unserializable, which turns a cosmetic overflow into a lost run.
   * A saturated counter reads honestly as "at least this many".
   */
  noteIllegalAction(): void {
    if (this.illegalActionCount < UINT32_MAX) {
      this.illegalActionCount += 1;
    }
  }

  /** A component's storage, by name. Throws if the world does not declare it. */
  component(name: string): ComponentStore<ComponentFields> {
    const store = this.#components.get(name);
    if (store === undefined) {
      const declared = [...this.#components.keys()].join(', ');
      throw new Error(`World declares no component "${name}". Declared: ${declared || '(none)'}.`);
    }
    return store;
  }

  /** The tick of whichever scale is running. */
  get tick(): number {
    return currentTick(this.clock);
  }

  /** A read-only view of the clock, for observation and rendering paths. */
  get time(): ReadonlyClock {
    return this.clock;
  }

  /**
   * A deep copy sharing no mutable structure with this state.
   *
   * The schema is shared by reference on purpose: it holds systems, which are
   * functions, and two states of the same world must run the same rules.
   */
  clone(): SimState {
    const copy = new SimState(this.schema, this.rootSeed, this.contentRevision);
    copy.illegalActionCount = this.illegalActionCount;

    // Assigned through `Object.assign` over `cloneClock`'s result rather than
    // field by field. The hand-written version silently dropped `stepOrdinal`
    // the moment the clock grew a field — every step reset it, so every step
    // drew the same random numbers. Copying whatever the clock actually has
    // makes the next field free instead of a latent determinism bug.
    Object.assign(copy.clock, cloneClock(this.clock));

    this.entities.cloneStateInto(copy.entities);
    for (const [name, component] of this.#components) {
      component.cloneStateInto(copy.component(name));
    }
    return copy;
  }
}

/** Creates an empty state for a world. */
export function createState(options: CreateStateOptions): SimState {
  return SimState.create(options);
}
