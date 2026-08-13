/*
 * Multiverse Mages — the registry of functions allowed to floor a quantity away.
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
 * # The Zeno stall, made into a claim instead of an accident
 *
 * `assembled-run-values.test.ts` proves no *non-integer* reaches component
 * storage. This file proves the complementary thing, which nothing checked
 * before: that no function silently floors a live quantity to zero and leaves
 * it there.
 *
 * The project has met that failure three times and caught it three different
 * ways, all of them luck:
 *
 * - `planConstructionLabour` floored a backlog into a headcount of zero, so a
 *   site two per cent from done asked for nobody and stopped forever. Found by
 *   a probe written to measure something else.
 * - `RaidState.stabilityDecayPerTick` is authored rather than derived, with a
 *   comment saying a derived decay would give *"a raid that runs forever, with
 *   no error and no symptom"*. Found by reasoning, at authoring time.
 * - `laggedWorship` moves one unit when its step floors away. Found while
 *   writing the function.
 *
 * Three sites someone happened to look at, and no mechanism. This is the
 * mechanism.
 *
 * ## Why a registry rather than a threshold
 *
 * Flooring a small product to zero is what fixed-point arithmetic *does*, so
 * "no annihilation" is not a property the simulation can have, and a
 * persistence threshold would just be a number nobody could defend. What is
 * defensible is that the *set of functions which do it* is small, known, and
 * changes only on purpose — the same shape as the append-only stream-ID
 * registry that protects INV-3.
 *
 * **A new name here is not automatically a bug.** It is a function that can
 * round a live quantity to nothing, and it needs the same review
 * `laggedWorship` got: does it stall, or does it handle the zero? Add it below
 * with the answer, or fix it. Do not delete the assertion.
 */

import { describe, expect, it } from 'vitest';

import { mul, rngFromRootSeed, step } from '@mm/sim-core';
import { defineWorldSimulation } from '@mm/coordination';

import {
  AnnihilationRecorder,
  LONG_RUN_OPTIONS,
  LONG_RUN_SEED,
  buildReferenceState,
  referenceContent,
} from '../../src/index.js';

/**
 * World ticks the reference arm runs.
 *
 * Twenty world years, matching `assembled-run-values.test.ts`, and for the same
 * reason: long enough that grants have been taught out and materials produced
 * and spent, short enough that an invariant does not become a measurement.
 */
const TICKS = 240;

/**
 * Every function known to floor a non-zero quantity to zero, with the reason it
 * is allowed to.
 *
 * Keyed `module:functionName` rather than by line, so an unrelated edit above
 * a function does not fail this test. See `src/annihilation.ts`.
 */
const REGISTERED: ReadonlyMap<string, string> = new Map([
  [
    'worship:laggedWorship',
    'Handled. A rising gap of one unit floors to zero, and the function moves ' +
      'one unit instead of returning the stalled value, so worship still ' +
      'converges on its target. See the convergence note on the function.',
  ],
]);

describe('the set of functions that floor a live quantity to zero', () => {
  it('is exactly the registered set, over an assembled reference universe', () => {
    const content = referenceContent();
    const simulation = defineWorldSimulation(content.deps);
    const recorder = new AnnihilationRecorder();

    recorder.record(() => {
      let state = buildReferenceState({
        runSeed: LONG_RUN_SEED,
        options: LONG_RUN_OPTIONS,
        content,
        schema: simulation.schema,
      });
      for (let tick = 0; tick < TICKS; tick += 1) {
        recorder.atTick(tick);
        state = step(state, [], rngFromRootSeed(state.rootSeed));
      }
    });

    const seen = recorder.siteNames();
    const unregistered = seen.filter((site) => !REGISTERED.has(site));
    // Both directions, because a registry that only grows is a registry that
    // goes stale. If `laggedWorship` stops annihilating -- because its rate
    // changed, or because the arm stopped reaching it -- the entry below is now
    // describing something that does not happen, and the next reader will trust
    // it. That is the same failure as an arm asserting cleanliness over a
    // mechanic it never reached; see INV-39.
    const registeredButUnseen = [...REGISTERED.keys()].filter((site) => !seen.includes(site));
    const detail = recorder
      .sites()
      .filter((row) => unregistered.includes(row.site))
      .map(
        (row) =>
          `${row.site} annihilated on ${String(row.ticks)}/${String(TICKS)} ticks ` +
          `(${row.persistence.toFixed(3)}), e.g. ${row.sample.operation}(` +
          `${String(row.sample.a)}, ${String(row.sample.b)}) -> 0`,
      );

    expect(detail, detail.join('\n')).toEqual([]);
    expect(unregistered).toEqual([]);
    expect(registeredButUnseen).toEqual([]);
  });

  it('and the instrument that says so can be made to fail', () => {
    // The half that usually gets skipped. A recorder that never fires would
    // pass the assertion above forever, so drive a known annihilation through
    // the real sentinel and require that it is both seen and attributed.
    const recorder = new AnnihilationRecorder();

    recorder.record(() => {
      recorder.atTick(0);
      annihilateOnPurpose();
    });

    expect(recorder.siteNames()).toEqual(['annihilation-registry.test:annihilateOnPurpose']);
    const [site] = recorder.sites();
    expect(site?.sample.operation).toBe('mul');
    expect(site?.persistence).toBe(1);
  });
});

/** `1 * 1` in fixed-point is `1/1024 * 1/1024`, which floors to nothing. */
function annihilateOnPurpose(): number {
  return mul(1, 1);
}
