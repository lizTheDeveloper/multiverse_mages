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
import type { RngSource } from './rng/source.js';

const UINT32_COUNT = 4294967296;

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
  /** Seeded randomness. Draw with `rng.stream(subsystemId, ctx.tick)`. */
  readonly rng: RngSource;
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
export function defineWorld(input: WorldSchemaInput): WorldSchema {
  const componentNames = new Set<string>();
  for (const spec of input.components) {
    if (componentNames.has(spec.name)) {
      throw new Error(`World declares component "${spec.name}" more than once.`);
    }
    componentNames.add(spec.name);
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
   * Hash over all loaded content, per `contracts.md` §0. Two universes may
   * only interact when these are equal. Zero until `core-contracts` computes
   * a real one.
   */
  readonly contentRevision?: number;
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

  /** Hash over loaded content; the gate on inter-universe interaction. */
  contentRevision: number;

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

  private constructor(schema: WorldSchema, rootSeed: number, contentRevision: number) {
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
    const contentRevision = options.contentRevision ?? 0;
    if (!Number.isInteger(contentRevision) || contentRevision < 0 || contentRevision >= UINT32_COUNT) {
      throw new RangeError(
        `contentRevision must be an integer in [0, 4294967295], received ${String(contentRevision)}`,
      );
    }
    return new SimState(schema, rootSeed, contentRevision);
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

    const clock = cloneClock(this.clock);
    copy.clock.worldTick = clock.worldTick;
    copy.clock.engagementTick = clock.engagementTick;
    copy.clock.mode = clock.mode;

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
