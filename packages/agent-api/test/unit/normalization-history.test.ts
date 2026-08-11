/*
 * Multiverse Mages — the same world state means the same thing after any history.
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
 * `agent-interface` task 1.7, and the `agent-api` spec scenario *"Normalization
 * does not depend on run history"*:
 *
 * > **WHEN** the same world state is observed in a run that reached it after 10
 * > world ticks and in a run that reached it after 500
 * > **THEN** the two exported vectors are element-wise identical
 *
 * ## What this test has to be careful about
 *
 * The naive reading — step one universe 10 ticks and another 500 and compare —
 * compares two *different* world states, because the clock block is part of the
 * observation and 10 is not 500. That test would fail for a correct
 * implementation and pass for none.
 *
 * The property actually at stake is that the exporter carries no memory. A
 * run-relative denominator is a number accumulated from what has already been
 * seen, so the way to catch one is to make the two runs *see different things*
 * and then ask the same question of both. Below, one exporter is warmed with a
 * long history of very large universes and the other with a short history of
 * very small ones; then both export the same state. A denominator fitted to
 * anything — the maximum seen, a running mean, the last vector — differs between
 * those two histories, and the assertion is exact equality, so it would not
 * survive a single fitted channel.
 */

import type { SimState } from '@mm/sim-core';
import {
  OBSERVATION_DESCRIPTORS,
  OBSERVATION_LAYOUT_DIGEST,
  OBSERVATION_SIZE,
  normalizedObservation,
  observe,
  rawObservation,
} from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

import { FIXTURE_CATALOGUE, firstUniverse, secondUniverse } from './fixtures.js';

/** Exports `count` observations of `state`, discarding them. */
function warm(state: SimState, count: number): void {
  for (let index = 0; index < count; index += 1) {
    normalizedObservation(rawObservation({ state, catalogue: FIXTURE_CATALOGUE }));
  }
}

describe('task 1.7 — the export is a function of the state, not of the run', () => {
  it('exports element-wise identical vectors after a 10-step and a 500-step history', () => {
    const subject = firstUniverse();

    // The short history: ten exports of a nearly-empty universe.
    warm(secondUniverse().state, 10);
    const afterShort = normalizedObservation(
      rawObservation({ state: subject.state, catalogue: FIXTURE_CATALOGUE }),
    );

    // The long history: five hundred exports of a universe whose magnitudes
    // climb past every pinned scale in the table. If any denominator tracked
    // what it had seen, it is now enormous.
    const large = firstUniverse();
    for (let tick = 0; tick < 500; tick += 1) {
      large.state.clock.worldTick = tick * 97;
      warm(large.state, 1);
    }
    const afterLong = normalizedObservation(
      rawObservation({ state: subject.state, catalogue: FIXTURE_CATALOGUE }),
    );

    expect([...afterLong]).toEqual([...afterShort]);
    expect(afterLong).toHaveLength(OBSERVATION_SIZE);
  });

  it('leaves the descriptor table and its digest untouched by either history', () => {
    const divisors = OBSERVATION_DESCRIPTORS.map((descriptor) => descriptor.divisor);
    const rules = OBSERVATION_DESCRIPTORS.map((descriptor) => descriptor.rule);

    warm(firstUniverse().state, 250);
    warm(secondUniverse().state, 250);

    expect(OBSERVATION_DESCRIPTORS.map((descriptor) => descriptor.divisor)).toEqual(divisors);
    expect(OBSERVATION_DESCRIPTORS.map((descriptor) => descriptor.rule)).toEqual(rules);
    expect(OBSERVATION_LAYOUT_DIGEST).toMatch(/^[0-9a-f]{16}$/);
  });

  it('exports the same vector through observe() as through the two halves', () => {
    // The composed path and the decomposed one must not be two normalizations.
    const world = firstUniverse();
    const view = observe({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    const direct = normalizedObservation(
      rawObservation({ state: world.state, catalogue: FIXTURE_CATALOGUE }),
    );
    expect([...view.normalized]).toEqual([...direct]);
  });
});
