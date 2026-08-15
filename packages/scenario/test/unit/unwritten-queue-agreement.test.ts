/*
 * Multiverse Mages — the scribing queue the loop asks for is the one the census reports.
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
 * Vision §5's *"nodes with no written copy"* is now computed **twice**, and on
 * purpose:
 *
 * - `@mm/agent-api`'s `knowledgeCensus` reports it as `unwrittenNodeIds`. That
 *   is a §4.4 diagnostic projection — something a player sees.
 * - `@mm/coordination`'s `unwrittenNodeCount` feeds it to the populace as W23's
 *   `scribingQueueDepth`. That is a **rule**: it decides how many scribes the
 *   labour market asks for, and therefore how much of what the universe knows
 *   ever gets written down.
 *
 * They may not be one function. `contracts.md` §4.4 makes the explain channel
 * *"never an input to any rules computation"*, so the rules path importing the
 * census to get its own input is exactly the coupling that rule forbids — and
 * `agent-api` sits above `rules-*` in §5's dependency order besides.
 *
 * The price of two implementations is this file. Without it the two drift, and
 * the failure is silent and horrible: a player is shown a shelf of unwritten
 * spells while the economy, reading a different number, hires nobody to write
 * them — a UI that disagrees with the simulation about the thing the UI exists
 * to show.
 *
 * Lives in `@mm/scenario` because that is the only package that may see both:
 * §5 makes it the composition root and a leaf.
 */

import { describe, expect, it } from 'vitest';

import { rngFromRootSeed, step } from '@mm/sim-core';
import { knowledgeCensus } from '@mm/agent-api';
import { unwrittenNodeCount } from '@mm/coordination';
import { referenceContent, referenceScenario } from '@mm/scenario';

/**
 * Long enough to cross every interesting boundary: nothing written at all,
 * books being written, and books being destroyed by an unpaid shelf. A run that
 * stopped before the first grimoire would agree trivially at zero.
 */
const TICKS = 600;
const SEED = 0x0009_0001;
const CONFIG = { worldTickCap: TICKS, options: { cohortSize: 4, foundingNodes: 4 } } as const;

describe('the rules and the census agree about what has not been written down', () => {
  const content = referenceContent();
  const run = referenceScenario(content);
  let state = run.scenario.create(SEED, CONFIG);

  const samples: { tick: number; loop: number; census: number; written: number }[] = [];
  for (let tick = 0; tick < TICKS; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    if ((tick + 1) % 20 !== 0) continue;
    const census = knowledgeCensus(state);
    samples.push({
      tick: tick + 1,
      loop: unwrittenNodeCount(state),
      census: census.unwrittenNodeIds.length,
      written: census.whereKept.grimoire + census.whereKept.library,
    });
  }

  it('agrees at every sample, tick by tick', () => {
    for (const sample of samples) {
      expect(`${String(sample.tick)}: ${String(sample.loop)}`).toBe(
        `${String(sample.tick)}: ${String(sample.census)}`,
      );
    }
  });

  it('saw a run where the answer was neither always zero nor always everything', () => {
    // The guard against a green test that proves nothing. Two implementations
    // of "count the nodes with no written copy" agree perfectly on a universe
    // that has written nothing, and would go on agreeing after one of them
    // broke.
    const counts = new Set(samples.map((sample) => sample.loop));
    expect(samples.length).toBeGreaterThan(10);
    expect(counts.size).toBeGreaterThan(1);
    expect(samples.some((sample) => sample.loop > 0)).toBe(true);
    expect(samples.some((sample) => sample.written > 0)).toBe(true);
  });

  it('never counts a node the universe does not hold', () => {
    const census = knowledgeCensus(state);
    expect(unwrittenNodeCount(state)).toBeLessThanOrEqual(census.nodesHeld);
  });
});
