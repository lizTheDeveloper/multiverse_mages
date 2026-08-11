/*
 * Multiverse Mages — fixtures for the populace-cohort tests.
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
 * ## Why the hazard table lives in `test/` and not in `src/`
 *
 * The scale-free hazard table is **shared** between mage mortality and cohort
 * mortality — `mages-and-species/design.md` says so, and gives the reason:
 * reusing one table "keeps one shape to tune and means the draconic precision
 * trap is fixed in one place for both". It is authored as content by task 4.6,
 * on the mage-lifecycle side. `packages/rules-world/src/populace` therefore
 * declares a *port* (`ScaleFreeHazard`) and receives the table; a copy under
 * `src/` would be the second shape the design note rejects.
 *
 * What is below is the placeholder table from `design.md`, transcribed so the
 * populace tests can exercise the mechanism before the real one lands. It is
 * **untuned** and it is a fixture, not a source of truth: when the shared table
 * arrives, these tests should read it instead, and the numbers here should stop
 * existing rather than becoming a second baseline.
 *
 * ## Why the species here are anonymous
 *
 * `populace/**` may not name a species (the conformance check in
 * `no-species-literals.test.ts` enforces that over `src/`), and the same
 * discipline is worth keeping in tests of generic mechanism: these fixtures
 * describe a *short-lived* and a *long-lived* species by their lifespans, which
 * is the only thing the arithmetic cares about. The one number that matters is
 * the 18,000-month lifespan, because that is where the precision trap bites.
 */

import type { Fixed, RngStream } from '@mm/sim-core';
import { FP_ONE, cloneStream, floorDiv, lerp, nextUint32, rngFromRootSeed } from '@mm/sim-core';

import type { CohortDemography, PopulaceRng } from '@mm/rules-world';

/** `design.md`'s placeholder hazard table: normalized age to `H`. **Untuned.** */
export const HAZARD_KNOTS: readonly (readonly [Fixed, Fixed])[] = [
  [0, 1024],
  [256, 1024],
  [512, 1536],
  [768, 4096],
  [1024, 12288],
  [1280, 49152],
  [1536, 196608],
];

/**
 * The placeholder table as a `ScaleFreeHazard`: piecewise-linear between knots,
 * flat below the first and above the last.
 */
export function placeholderHazard(normalizedAge: Fixed): Fixed {
  const first = HAZARD_KNOTS[0] as readonly [Fixed, Fixed];
  const last = HAZARD_KNOTS[HAZARD_KNOTS.length - 1] as readonly [Fixed, Fixed];
  if (normalizedAge <= first[0]) return first[1];
  if (normalizedAge >= last[0]) return last[1];

  for (let i = 1; i < HAZARD_KNOTS.length; i += 1) {
    const [loAge, loH] = HAZARD_KNOTS[i - 1] as readonly [Fixed, Fixed];
    const [hiAge, hiH] = HAZARD_KNOTS[i] as readonly [Fixed, Fixed];
    if (normalizedAge <= hiAge) {
      const span = hiAge - loAge;
      if (span === 0) return hiH;
      return lerp(loH, hiH, floorDiv((normalizedAge - loAge) * FP_ONE, span));
    }
  }
  return last[1];
}

/** A short-lived species. Roughly the human placeholder of `design.md`. */
export const SHORT_LIVED: CohortDemography = { lifespanMonths: 960, maturityMonths: 216 };

/** A long-lived one — the 18,000-month lifespan the precision trap is about. */
export const LONG_LIVED: CohortDemography = { lifespanMonths: 18_000, maturityMonths: 1_200 };

/** Interned species ids for the two fixtures. Ids are integers, not names. */
export const SHORT_LIVED_ID = 1;
export const LONG_LIVED_ID = 2;

/** A lookup over the two fixture species. */
export function fixtureSpecies(speciesId: number): CohortDemography | undefined {
  if (speciesId === SHORT_LIVED_ID) return SHORT_LIVED;
  if (speciesId === LONG_LIVED_ID) return LONG_LIVED;
  return undefined;
}

/**
 * A stream handed out by {@link countingRng}, kept alongside a pristine copy so
 * a test can count how far it was advanced.
 */
export interface HandedStream {
  readonly subsystemId: number;
  readonly actorKey: number | undefined;
  readonly pristine: RngStream;
  readonly used: RngStream;
}

/**
 * A {@link PopulaceRng} bound to one tick that records every stream it hands
 * out.
 *
 * Two things are countable through it, and the distinction matters. The number
 * of `actorStream` calls is the number of cohorts visited. The number of *words
 * drawn* from each stream is the number of draws that cohort actually took, and
 * {@link drawsTaken} recovers it by replaying a pristine copy — which is how a
 * test can assert "exactly one draw per cohort" without trusting the code under
 * test to report its own draw count.
 *
 * That replay is exact only because `nextBounded(stream, 2^20)` never
 * rejection-loops: `2^20` divides `2^32`, so its rejection threshold is zero
 * and one draw is always one word.
 */
export interface CountingRng extends PopulaceRng {
  readonly handed: readonly HandedStream[];
  /** Total words drawn across every stream handed out. */
  totalDraws(): number;
}

export function countingRng(rootSeed: number, tick: number): CountingRng {
  const source = rngFromRootSeed(rootSeed);
  const handed: HandedStream[] = [];

  const record = (subsystemId: number, actorKey: number | undefined, fresh: RngStream): RngStream => {
    handed.push({ subsystemId, actorKey, pristine: cloneStream(fresh), used: fresh });
    return fresh;
  };

  return {
    handed,
    stream(subsystemId: number): RngStream {
      return record(subsystemId, undefined, source.stream(subsystemId, tick));
    },
    actorStream(subsystemId: number, actorKey: number): RngStream {
      return record(subsystemId, actorKey, source.actorStream(subsystemId, tick, actorKey));
    },
    totalDraws(): number {
      return handed.reduce((total, entry) => total + drawsTaken(entry), 0);
    },
  };
}

/** How many 32-bit words were drawn from a handed-out stream. */
export function drawsTaken(entry: HandedStream, limit = 16): number {
  const replay = cloneStream(entry.pristine);
  for (let taken = 0; taken <= limit; taken += 1) {
    if (sameWords(replay, entry.used)) return taken;
    nextUint32(replay);
  }
  throw new Error(
    `A stream advanced more than ${String(limit)} words. Either the code under test is drawing ` +
      'far more than expected, or it replaced the stream rather than advancing it.',
  );
}

function sameWords(a: RngStream, b: RngStream): boolean {
  for (let i = 0; i < a.words.length; i += 1) {
    if (a.words[i] !== b.words[i]) return false;
  }
  return true;
}
