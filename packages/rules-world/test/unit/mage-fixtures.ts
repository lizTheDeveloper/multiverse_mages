/*
 * Multiverse Mages — helpers for the mage-lifecycle tests.
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
 * The instrument these tests are built around is a **draw counter**, and it is
 * worth explaining why it is not simply a spy.
 *
 * `StepRng` hands out `RngStream` cursors: plain objects wrapping a
 * `Uint32Array`, drawn from by a free function (`nextUint32`) that the caller
 * imports directly. There is nothing to stub. A test that wanted to count draws
 * by replacing a method would have to replace the module, which would also
 * replace the arithmetic under test.
 *
 * So draws are counted by *replaying* instead: snapshot a stream's four words
 * when it is issued, and afterwards step a clone of that snapshot until its
 * state matches the stream's current state. The number of steps is the number of
 * draws, exactly, and it is measured against the real generator rather than
 * against a mock of it. That matters for the spec scenario it exists to check —
 * *"the number of RNG draws attributed to that promotion is 1, not 10,000"* —
 * because a mock would prove only that the code called the mock once.
 */

import type { EntityHandle, RngStream, StepContext } from '@mm/sim-core';
import { cloneStream, nextUint32, rngFromRootSeed } from '@mm/sim-core';

import type { ContentRegistry, PrimitiveRecord } from '@mm/content';
import { loadContent, shippedContentSource } from '@mm/content';

import type { MageRecord } from '@mm/state';

/** The step-bound RNG, projected from the type the core actually exports. */
export type StepRng = StepContext['rng'];

/** One stream this RNG issued, and the position it was issued at. */
interface IssuedStream {
  readonly subsystemId: number;
  /** `undefined` for a whole-tick stream, a handle for an actor stream. */
  readonly actorKey: number | undefined;
  readonly initial: Uint32Array;
  readonly stream: RngStream;
}

/** A `StepRng` that remembers what was asked of it. */
export interface RecordingRng extends StepRng {
  /** Every stream issued, in issue order. */
  readonly issued: readonly { subsystemId: number; actorKey: number | undefined }[];
  /** Total draws consumed across every stream this RNG issued. */
  drawsTaken(): number;
  /** Draws consumed on one subsystem only. */
  drawsOn(subsystemId: number): number;
  /** Forgets everything issued so far, so one test can measure two phases. */
  reset(): void;
}

/**
 * How many draws advanced `stream` from `initial`.
 *
 * @throws Error past `limit` steps, rather than looping forever. A stream that
 * has advanced further than any code under test could plausibly have advanced
 * it means the snapshot and the stream are not the same stream — which is a
 * fixture bug, and one that an unbounded loop would report as a hung test.
 */
function stepsBetween(initial: Uint32Array, stream: RngStream, limit = 100000): number {
  const probe: RngStream = { words: Uint32Array.from(initial) };
  for (let steps = 0; steps <= limit; steps += 1) {
    if (probe.words[0] === stream.words[0] && probe.words[1] === stream.words[1]) {
      return steps;
    }
    nextUint32(probe);
  }
  throw new Error(
    `a stream advanced more than ${String(limit)} draws, or is not the stream that was snapshotted`,
  );
}

/**
 * A real, seeded `StepRng` bound to one tick, wrapped so draws can be counted.
 *
 * Real rather than synthetic on purpose: every property these tests assert
 * about stream splitting and actor keying is a property of the shipped
 * generator, and a hand-rolled counter-based stub would satisfy them all while
 * proving nothing.
 */
export function recordingRng(rootSeed: number, tick: number): RecordingRng {
  const source = rngFromRootSeed(rootSeed);
  let issued: IssuedStream[] = [];

  const remember = (subsystemId: number, actorKey: number | undefined, stream: RngStream): RngStream => {
    issued.push({ subsystemId, actorKey, initial: Uint32Array.from(stream.words), stream });
    return stream;
  };

  return {
    rootSeed,
    stream(subsystemId: number): RngStream {
      return remember(subsystemId, undefined, source.stream(subsystemId, tick));
    },
    actorStream(subsystemId: number, actorKey: number): RngStream {
      return remember(subsystemId, actorKey, source.actorStream(subsystemId, tick, actorKey));
    },
    get issued() {
      return issued.map((entry) => ({ subsystemId: entry.subsystemId, actorKey: entry.actorKey }));
    },
    drawsTaken(): number {
      return issued.reduce((sum, entry) => sum + stepsBetween(entry.initial, entry.stream), 0);
    },
    drawsOn(subsystemId: number): number {
      return issued
        .filter((entry) => entry.subsystemId === subsystemId)
        .reduce((sum, entry) => sum + stepsBetween(entry.initial, entry.stream), 0);
    },
    reset(): void {
      issued = [];
    },
  };
}

/**
 * A `StepRng` that throws the moment a named subsystem is touched.
 *
 * For the spec's negative scenarios — *"no draw is made on RNG stream 2 at
 * promotion"* — where the assertion is about a stream that must stay untouched.
 * Counting draws would pass just as happily against code that requested the
 * stream and then did not draw from it, and requesting it is already the bug:
 * it means the promotion path knows about mortality.
 */
export function rngForbidding(rootSeed: number, tick: number, forbidden: number): StepRng {
  const source = rngFromRootSeed(rootSeed);
  const guard = (subsystemId: number): void => {
    if (subsystemId === forbidden) {
      throw new Error(
        `RNG stream ${String(forbidden)} was requested where the specification says it must not be`,
      );
    }
  };
  return {
    rootSeed,
    stream(subsystemId: number): RngStream {
      guard(subsystemId);
      return source.stream(subsystemId, tick);
    },
    actorStream(subsystemId: number, actorKey: number): RngStream {
      guard(subsystemId);
      return source.actorStream(subsystemId, tick, actorKey);
    },
  };
}

/** A plain seeded `StepRng`, for the many tests that do not instrument anything. */
export function stepRng(rootSeed: number, tick: number): StepRng {
  const source = rngFromRootSeed(rootSeed);
  return {
    rootSeed,
    stream: (subsystemId: number) => source.stream(subsystemId, tick),
    actorStream: (subsystemId: number, actorKey: number) =>
      source.actorStream(subsystemId, tick, actorKey),
  };
}

/** Advances a stream without caring about the value, for fixtures that need a position. */
export function burn(stream: RngStream, draws: number): void {
  for (let i = 0; i < draws; i += 1) nextUint32(stream);
}

/** A clone, for a fixture that needs to draw the same sequence twice. */
export const copyStream = cloneStream;

/** The shipped content, loaded once for the whole file. */
export function shippedRegistry(): ContentRegistry {
  return loadContent(shippedContentSource());
}

/** The `lifespan` primitive record, which carries its own stacking rule and cap. */
export function lifespanPrimitive(registry: ContentRegistry): PrimitiveRecord {
  const found = registry.primitives.find((entry) => entry.record.id === 'lifespan');
  if (found === undefined) throw new Error('no "lifespan" primitive in the shipped registry');
  return found.record;
}

/** A mage component row with every field written, for tests that mutate one. */
export function mageRow(overrides: Partial<MageRecord> = {}): MageRecord {
  return {
    speciesId: 1,
    birthTick: 0,
    roleId: 0,
    universityId: 0,
    curiosity: 1024,
    ambition: 1024,
    caution: 1024,
    vigor: 1024,
    maxVigor: 1024,
    alive: 1,
    ...overrides,
  };
}

/**
 * A handle built the way the entity store builds them, for tests that need two
 * distinct mages or the same slot at two generations.
 *
 * Duplicated from `makeHandle` rather than imported so that a test asserting
 * "slot reuse changes the derived variance" is not asserting it against the
 * very packing function it depends on being correct.
 */
export function handleOf(slot: number, generation: number): EntityHandle {
  return ((generation << 20) | slot) >>> 0;
}
