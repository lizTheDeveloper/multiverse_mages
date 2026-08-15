/*
 * Multiverse Mages — every value crossing into state in an assembled universe.
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
 * The whole-system invariant this suite did not previously have.
 *
 * ## Why ~3,900 passing tests could not have caught this
 *
 * The defect class is: *a lookup misses, `undefined` enters arithmetic, `NaN`
 * comes out, it is written to an `i32` column, and the typed array coerces it
 * to `0`.* The mechanic then contributes nothing, forever, and reads as a
 * balance result rather than as a bug.
 *
 * A unit test cannot see it, and not by accident. **A unit test builds its own
 * fixture, so its lookups always hit.** It passes a species record it just
 * constructed, a bonus array it just filled, a content id it just interned.
 * Production looks the same values up in an assembled registry where a key may
 * not resolve and a caller may pass `[]`. Every one of those tests can be
 * correct, and green, while the assembled system computes zero — which is
 * precisely what `packages/coordination/src/world-step.ts` does today at the
 * three sites that pass a literal `[]` for their bonus lists.
 *
 * The missing artifact was therefore never *more* unit tests. It was one test
 * of a different category: run the **assembled** universe and watch the write
 * boundary. That is this file.
 *
 * ## Why it watches writes rather than sweeping state
 *
 * By the time a column can be read, the coercion has already happened: `NaN` is
 * `0` and indistinguishable from a legitimate zero. A sweep of stored values is
 * structurally incapable of finding the thing it appears to look for. So the
 * check sits on `installValueSentinel`, at the two doors into component
 * storage, where the value still exists.
 *
 * ## Why the injection tests are not optional
 *
 * A clean result here is only worth something if this instrument can speak. The
 * last block deliberately drives a `NaN` into the **real** reference state —
 * the assembled schema, not a canary world — and fails if the sentinel stays
 * silent. `packages/sim-core/test/unit/value-sentinel.test.ts` does the same at
 * the unit level for every mask the defect wears.
 */

import { describe, expect, it } from 'vitest';

import type { ComponentValueViolation } from '@mm/sim-core';
import {
  installValueSentinel,
  rngFromRootSeed,
  step,
  valueSentinelInstalled,
} from '@mm/sim-core';
import { defineWorldSimulation } from '@mm/coordination';
import { BOT_POOL } from '@mm/mc-harness';

import {
  LONG_RUN_OPTIONS,
  LONG_RUN_SEED,
  buildReferenceState,
  executeReferenceRun,
  referenceContent,
} from '../../src/index.js';

/**
 * World ticks the reference arm runs: twenty world years.
 *
 * Long enough that founding grants have been taught out, births have
 * compounded, and materials have been produced and spent. The two-hundred-year
 * horizon belongs to `reference-long-run.test.ts`; this file is an invariant,
 * not a measurement, and an invariant that takes a minute is one that gets
 * skipped — or worse, one that starves the runner. See {@link ARM_TICKS}.
 */
const TICKS = 240;

/**
 * World ticks *each strategy* runs, and why it is smaller.
 *
 * Eight arms is eight universes, and the sentinel makes every component write
 * go through a `Proxy`, so the cost multiplies. At 240 ticks this file took 94
 * seconds on CI and the run failed — not with a failing test, but with
 * `[vitest-worker]: Timeout calling "onTaskUpdate"` and 3,800 tests green. A
 * worker doing unbroken synchronous work cannot answer the runner's RPC, and a
 * runner that has not heard from a worker treats it as dead.
 *
 * Sixty ticks is `balance-gate.sweep.json`'s own `worldTickCap`, and the god
 * verbs this arm exists to exercise are played from the first tick — the edict
 * budget is available immediately — so the coverage that matters survives the
 * cut intact.
 */
const ARM_TICKS = 60;

/** Renders a violation the way a reader needs it: which value, where, which door. */
function describeViolation(violation: ComponentValueViolation): string {
  return (
    `${violation.component}.${violation.field}[${String(violation.row)}] = ` +
    `${String(violation.value)} (via ${violation.door})`
  );
}

/** Runs `body` with a recording sentinel installed, and always removes it. */
function watching<T>(body: () => T): { result: T; violations: ComponentValueViolation[] } {
  const violations: ComponentValueViolation[] = [];
  const previous = installValueSentinel((violation) => violations.push(violation));
  try {
    return { result: body(), violations };
  } finally {
    installValueSentinel(previous);
  }
}

/**
 * Hands the event loop back, so the vitest worker can answer its runner.
 *
 * The same device, and for the same reason, as the `await` inside
 * `runLongReference`: *"a test runner that talks to its worker over an RPC
 * channel treats a worker that has not answered in that long as a worker that
 * has died."* It changes no number — the simulation between yields is
 * unchanged and entirely synchronous.
 */
async function yieldToRunner(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

describe('an assembled universe writes no non-finite value into state', () => {
  it(
    'runs the reference universe with zero non-integer writes at either door',
    async () => {
      const content = referenceContent();
      const simulation = defineWorldSimulation(content.deps);
      const violations: ComponentValueViolation[] = [];
      const previous = installValueSentinel((violation) => violations.push(violation));

      try {
        let state = buildReferenceState({
          runSeed: LONG_RUN_SEED,
          options: LONG_RUN_OPTIONS,
          content,
          schema: simulation.schema,
        });
        for (let tick = 0; tick < TICKS; tick += 1) {
          state = step(state, [], rngFromRootSeed(state.rootSeed));
          // Once a world year, as the long run does.
          if (tick % 12 === 11) await yieldToRunner();
        }
      } finally {
        installValueSentinel(previous);
      }

      expect(violations.map(describeViolation)).toEqual([]);
    },
    120_000,
  );

  it(
    'stays clean under every shipped strategy, which is where the god verbs are played',
    async () => {
      // The passive control plays nothing. A mechanic reached through a god verb
      // is only exercised — and a lookup on its path only attempted — when a
      // strategy actually presses the button, so the arms are the interesting
      // half of this check rather than an extra.
      const strategyIds = BOT_POOL.map((entry) => entry.strategyId);
      expect(strategyIds.length).toBeGreaterThan(1);

      const violations: ComponentValueViolation[] = [];
      const previous = installValueSentinel((violation) => violations.push(violation));

      try {
        for (const [index, strategyId] of strategyIds.entries()) {
          executeReferenceRun({
            coordinates: {
              rootSeed: LONG_RUN_SEED,
              sweepId: 'assembled-run-values',
              cellIndex: index,
              replicateIndex: 0,
            },
            runSeed: LONG_RUN_SEED + index,
            levels: { cohortSize: 12, foundingNodes: 4 },
            strategies: [strategyId],
            worldTickCap: ARM_TICKS,
            metrics: [],
            ablatedPrimitives: [],
          });
          await yieldToRunner();
        }
      } finally {
        installValueSentinel(previous);
      }

      expect(violations.map(describeViolation)).toEqual([]);
    },
    120_000,
  );
});

describe('and the instrument that says so can be made to fail', () => {
  it('catches a NaN driven into the real reference schema, not a canary world', () => {
    const content = referenceContent();
    const simulation = defineWorldSimulation(content.deps);
    const state = buildReferenceState({
      runSeed: LONG_RUN_SEED,
      options: LONG_RUN_OPTIONS,
      content,
      schema: simulation.schema,
    });

    // A real component of the assembled world, chosen by position so this test
    // does not rot when the schema gains or renames one.
    const spec = simulation.schema.components[0];
    expect(spec).toBeDefined();
    const componentName = (spec as { name: string }).name;
    const fieldName = Object.keys((spec as { fields: Record<string, string> }).fields)[0] as string;
    const store = state.component(componentName);
    expect(store.size).toBeGreaterThan(0);

    const { violations } = watching(() => {
      const missedLookup = (new Map<string, number>().get('no-such-id') as number) * 2;
      store.field(fieldName)[0] = missedLookup;
    });

    expect(violations).toHaveLength(1);
    const violation = violations[0] as ComponentValueViolation;
    expect(violation.component).toBe(componentName);
    expect(violation.field).toBe(fieldName);
    expect(violation.door).toBe('field');
    expect(Number.isNaN(violation.value)).toBe(true);
    expect(describeViolation(violation)).toContain('NaN');

    // And the reason a sweep of stored values could never have found it.
    expect(store.field(fieldName)[0]).toBe(0);
  });

  it('is genuinely off when nobody installs it, so the hot path pays nothing', () => {
    const content = referenceContent();
    const simulation = defineWorldSimulation(content.deps);
    const state = buildReferenceState({
      runSeed: LONG_RUN_SEED,
      options: LONG_RUN_OPTIONS,
      content,
      schema: simulation.schema,
    });
    const spec = simulation.schema.components[0] as { name: string; fields: Record<string, string> };
    const fieldName = Object.keys(spec.fields)[0] as string;
    const store = state.component(spec.name);

    expect(valueSentinelInstalled()).toBe(false);
    // The discriminator: the raw arrays are held in the store, so two calls
    // return the *same* object. A wrapper is built per call and cannot be
    // identical to the one before it — which is also why this instrument is
    // opt-in rather than always on.
    expect(store.field(fieldName)).toBe(store.field(fieldName));

    const wrapped = watching(() => store.field(fieldName)).result;
    expect(wrapped).not.toBe(store.field(fieldName));
  });
});
