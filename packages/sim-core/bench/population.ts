/*
 * Multiverse Mages — the pure half of the population benchmark.
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
 * # Why the benchmark is split in two
 *
 * A benchmark must read a clock. `packages/sim-core/src` may not: `Date` and
 * `performance` are banned there by ESLint, and that ban is not a style
 * preference — it is the mechanism that keeps four independent consumers (the
 * Monte Carlo harness, the Electron client, the PvP server, the RL bridge)
 * computing bit-identical results. Granting the benchmark an exemption would
 * put a wall-clock read inside the one package whose entire claim is that it
 * contains none, and exemptions are how that claim erodes.
 *
 * So the benchmark is split rather than exempted:
 *
 * - **This file** is the *workload*. It builds a synthetic world, drives it for
 *   a fixed number of ticks, and counts the entity updates it performed. It
 *   reads no clock, performs no I/O, imports nothing from Node, and is a pure
 *   function of `(entityCount, ticks, seed, churnPerTick)`. Two calls with the
 *   same config return the same `finalSnapshotHash` and the same
 *   `entityUpdates` — which is what `test/unit/benchmark.test.ts` asserts, and
 *   what makes a throughput number attributable to the machine rather than to
 *   the run.
 * - **`scripts/bench.mjs`** is the *measurement*. It times a call to this
 *   function, divides, and prints JSON. The wall-clock reads and the
 *   floating-point division both live there, where they are analysis of a
 *   finished run rather than an input to one.
 *
 * The file sits in `packages/sim-core/bench/`, outside `src/`, so it is not
 * part of the published package and cannot be reached from rules code. It still
 * holds itself to the core's rules — integers only, `floorDiv` rather than
 * `Math.floor` — because a workload that used floats would be measuring
 * something the real simulation never does.
 *
 * # What the workload is trying to cost
 *
 * The open question this benchmark exists to answer (`vision.md` §13) is how
 * many mages a universe can hold. That makes three costs the ones worth paying:
 *
 * 1. **Cloning.** `step` deep-copies every typed array on every tick. It is the
 *    largest fixed cost per tick and it scales with population, so the workload
 *    must hold a real population rather than a token one.
 * 2. **Churn.** Mages are born and die every world tick. Creates and destroys
 *    exercise the free list, the generation counters, and — the expensive part
 *    — the sparse components' swap-removal and their ascending-slot re-sort. A
 *    benchmark over a static population would miss all of that and report a
 *    number substantially more flattering than the truth.
 * 3. **Per-entity field updates.** Three components of different widths and
 *    different populations, each walked in slot order and written through
 *    fixed-point arithmetic, with one cross-component join. That is what a
 *    rules system actually does.
 */

import { NO_ROW } from '../src/component.js';
import { floorDiv } from '../src/fixed-point/divide.js';
import { FP_ONE, mul } from '../src/fixed-point/fixed-point.js';
import type { EntityHandle } from '../src/handle.js';
import { nextBounded } from '../src/rng/pcg32.js';
import type { RngSource } from '../src/rng/source.js';
import { rngFromRootSeed } from '../src/rng/source.js';
import { RNG_STREAM } from '../src/rng/streams.js';
import { snapshotHash } from '../src/snapshot/snapshot.js';
import type { SimState, StepContext, System } from '../src/state.js';
import { createState, defineWorld } from '../src/state.js';
import { step } from '../src/step.js';

/**
 * Components of deliberately different widths and different populations.
 *
 * Declaration order is snapshot order — see `defineWorld` — so this list is not
 * something to reorder for tidiness. `renown` is carried by roughly half the
 * population so the sparse path is genuinely sparse; a workload in which every
 * entity carried every component would be measuring a dense store this codebase
 * does not have.
 */
const VITALITY = { name: 'vitality', fields: { hp: 'i32', fatigue: 'i16' } } as const;
const STUDY = { name: 'study', fields: { focus: 'u16', discipline: 'u8' } } as const;
const RENOWN = { name: 'renown', fields: { score: 'i32', mentions: 'u32' } } as const;

/** Default churn: one entity in 64 dies and is replaced each tick. */
const CHURN_DIVISOR = 64;

/** Fatigue decay per tick, in fixed point: 1023/1024. */
const FATIGUE_DECAY = FP_ONE - 1;

/** Ceiling on `focus`, which is stored as a `u16`. */
const MAX_FOCUS = 65535;

/** Largest legal root seed. */
const MAX_SEED = 4294967295;

export interface BenchmarkConfig {
  /** Steady-state live population. At least 1. */
  readonly entityCount: number;
  /** Ticks to simulate. At least 1. */
  readonly ticks: number;
  /** Root seed for the run. Unsigned 32-bit. */
  readonly seed: number;
  /**
   * Entities destroyed and recreated per tick. Defaults to `entityCount / 64`,
   * floored, and never below 1 — so even a tiny population still exercises the
   * free list and the components' swap-removal.
   */
  readonly churnPerTick?: number;
}

/**
 * What the workload did.
 *
 * Every field is a function of the config alone. There is no timing here,
 * deliberately: this object is the thing two runs get compared on, and a
 * duration in it would make every comparison fail.
 */
export interface BenchmarkResult {
  readonly entityCount: number;
  readonly ticks: number;
  readonly seed: number;
  readonly churnPerTick: number;
  /**
   * Per-entity units of work across the whole run: one per component row
   * visited and written by a system, plus one per entity created and one per
   * entity destroyed.
   *
   * This is the numerator of entity-updates per second, and it is what makes
   * two benchmark runs at different populations comparable at all — steps per
   * second alone says nothing about how much each step was carrying.
   */
  readonly entityUpdates: number;
  readonly created: number;
  readonly destroyed: number;
  readonly finalLiveCount: number;
  readonly finalWorldTick: number;
  /** Content hash of the final state. The determinism check, in one string. */
  readonly finalSnapshotHash: string;
}

/** Mutable per-run counters. One object per {@link runPopulationBenchmark} call. */
interface WorkCounters {
  entityUpdates: number;
  created: number;
  destroyed: number;
}

function assertPositiveInt(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be an integer of at least 1, got ${String(value)}`);
  }
}

/**
 * Attaches the components a new entity carries and seeds their fields.
 *
 * Draws come from the entity's own actor stream, keyed on the handle and never
 * on a slot or a loop index — `deriveActorStream` documents what a positional
 * key silently destroys, and a benchmark that got it wrong would be measuring a
 * simulation nobody would ship.
 */
function populate(state: SimState, rng: RngSource, tick: number, handle: EntityHandle): void {
  const draws = rng.actorStream(RNG_STREAM.mageBirth, tick, handle);

  const vitality = state.component(VITALITY.name);
  vitality.add(handle);
  vitality.set(handle, 'hp', 1024 + nextBounded(draws, 4096));
  vitality.set(handle, 'fatigue', nextBounded(draws, 1024));

  const study = state.component(STUDY.name);
  study.add(handle);
  study.set(handle, 'focus', nextBounded(draws, 4096));
  study.set(handle, 'discipline', nextBounded(draws, 8));

  // Roughly half the population, chosen by a draw rather than by slot parity.
  // Slot parity would correlate component membership with the free list's LIFO
  // order, which is the kind of accidental structure that makes a benchmark's
  // cost stop tracking the real game's.
  if (nextBounded(draws, 2) === 1) {
    const renown = state.component(RENOWN.name);
    renown.add(handle);
    renown.set(handle, 'score', nextBounded(draws, 2048));
    renown.set(handle, 'mentions', nextBounded(draws, 64));
  }
}

/**
 * Destroys `churnPerTick` live entities and creates the same number back.
 *
 * Selection is without replacement, by drawing into a shrinking copy of the
 * live slot list. Drawing with replacement would quietly destroy fewer entities
 * than asked whenever two draws collided, so the amount of work the benchmark
 * did would depend on the seed — and a throughput number that moved with the
 * seed would be worthless.
 */
function makeChurnSystem(counters: WorkCounters, churnPerTick: number): System {
  return {
    name: 'bench:churn',
    run(ctx: StepContext): void {
      const entities = ctx.state.entities;

      const candidates = entities.liveSlots();
      let remaining = candidates.length;
      const kills = Math.min(churnPerTick, remaining);

      const deathDraws = ctx.rng.stream(RNG_STREAM.mortality);
      for (let i = 0; i < kills; i += 1) {
        const pick = nextBounded(deathDraws, remaining);
        const slot = candidates[pick] as number;
        // Swap-remove from the candidate list so a later draw cannot repeat it.
        remaining -= 1;
        candidates[pick] = candidates[remaining] as number;

        if (entities.destroy(entities.handleAt(slot))) {
          counters.destroyed += 1;
          counters.entityUpdates += 1;
        }
      }

      for (let i = 0; i < churnPerTick; i += 1) {
        const handle = entities.create();
        populate(ctx.state, ctx.rng, ctx.tick, handle);
        counters.created += 1;
        counters.entityUpdates += 1;
      }
    },
  };
}

/**
 * The per-entity field passes, one system per component.
 *
 * Field arrays are captured once per pass and indexed by row — the documented
 * bulk path. None of these systems adds a component, so a captured array cannot
 * be invalidated mid-loop.
 */
function makeVitalitySystem(counters: WorkCounters): System {
  return {
    name: 'bench:vitality',
    run(ctx: StepContext): void {
      const vitality = ctx.state.component(VITALITY.name);
      const hp = vitality.field('hp');
      const fatigue = vitality.field('fatigue');
      let visited = 0;

      vitality.forEach((row: number): void => {
        const worn = mul(fatigue[row] as number, FATIGUE_DECAY);
        fatigue[row] = worn;
        hp[row] = (hp[row] as number) - floorDiv(worn, FP_ONE) + 1;
        visited += 1;
      });

      counters.entityUpdates += visited;
    },
  };
}

function makeStudySystem(counters: WorkCounters): System {
  return {
    name: 'bench:study',
    run(ctx: StepContext): void {
      const study = ctx.state.component(STUDY.name);
      const focus = study.field('focus');
      const discipline = study.field('discipline');
      let visited = 0;

      study.forEach((row: number): void => {
        const gained = (focus[row] as number) + 1 + (discipline[row] as number);
        focus[row] = gained > MAX_FOCUS ? 0 : gained;
        visited += 1;
      });

      counters.entityUpdates += visited;
    },
  };
}

/**
 * Renown joins a second component through a handle lookup, so the workload pays
 * for at least one cross-component resolution per entity. A system that only
 * ever touched its own arrays would be unrepresentative — almost every real one
 * reads a neighbour.
 */
function makeRenownSystem(counters: WorkCounters): System {
  return {
    name: 'bench:renown',
    run(ctx: StepContext): void {
      const renown = ctx.state.component(RENOWN.name);
      const study = ctx.state.component(STUDY.name);
      const score = renown.field('score');
      const mentions = renown.field('mentions');
      const focus = study.field('focus');
      let visited = 0;

      renown.forEach((row: number, handle: EntityHandle): void => {
        const studyRow = study.tryRowOf(handle);
        const attention = studyRow === NO_ROW ? 0 : floorDiv(focus[studyRow] as number, 256);
        score[row] = (score[row] as number) + attention;
        mentions[row] = (mentions[row] as number) + 1;
        visited += 1;
      });

      counters.entityUpdates += visited;
    },
  };
}

/**
 * Runs the synthetic population workload and reports what it did.
 *
 * Schema, systems, and counters are all constructed inside this call. Systems
 * capture the counter object by closure, and a `WorldSchema` is shared by
 * reference across every clone `step` makes, so a counter hoisted to module
 * scope would accumulate across calls — and the second run of an identical
 * config would report different work than the first. That is precisely the
 * guarantee this function exists to provide, so the construction stays local.
 *
 * Reads no clock. Returns no timing. The caller measures.
 */
export function runPopulationBenchmark(config: BenchmarkConfig): BenchmarkResult {
  assertPositiveInt(config.entityCount, 'entityCount');
  assertPositiveInt(config.ticks, 'ticks');
  if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > MAX_SEED) {
    throw new RangeError(`seed must be an integer in [0, ${MAX_SEED}], got ${String(config.seed)}`);
  }

  const churnPerTick =
    config.churnPerTick ?? Math.max(1, floorDiv(config.entityCount, CHURN_DIVISOR));
  assertPositiveInt(churnPerTick, 'churnPerTick');

  const counters: WorkCounters = { entityUpdates: 0, created: 0, destroyed: 0 };

  const schema = defineWorld({
    components: [VITALITY, STUDY, RENOWN],
    systems: [
      makeChurnSystem(counters, churnPerTick),
      makeVitalitySystem(counters),
      makeStudySystem(counters),
      makeRenownSystem(counters),
    ],
  });

  let state = createState({ rootSeed: config.seed, schema });
  const rng = rngFromRootSeed(config.seed);

  // The population is seeded before the loop, not grown by it: the first ticks
  // of an empty world are cheap, and averaging them in would flatter the result
  // by exactly as much as the population was still missing.
  for (let i = 0; i < config.entityCount; i += 1) {
    populate(state, rng, 0, state.entities.create());
  }

  for (let tick = 0; tick < config.ticks; tick += 1) {
    state = step(state, [], rng);
  }

  return {
    entityCount: config.entityCount,
    ticks: config.ticks,
    seed: config.seed,
    churnPerTick,
    entityUpdates: counters.entityUpdates,
    created: counters.created,
    destroyed: counters.destroyed,
    finalLiveCount: state.entities.liveCount,
    finalWorldTick: state.clock.worldTick,
    finalSnapshotHash: snapshotHash(state),
  };
}
