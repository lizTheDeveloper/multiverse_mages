/*
 * Multiverse Mages — the §7 per-run telemetry: inert, on the pinned lattice,
 * and reaching the record.
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
 * `collectRunMetrics` had no production caller. `RunTelemetry` was never
 * constructed, `KnowledgeCensus` was never instantiated, and the seven per-run
 * metrics of `contracts.md` §7 were therefore structurally incapable of moving
 * in a sweep — four of them had already been recorded as separate oddities
 * (`libraryDependence` pinned at 0 among them) before anyone noticed they were
 * one uncalled function.
 *
 * This file asserts the three properties that make the wiring worth having, in
 * the order in which failing one would matter most:
 *
 * 1. **It changes nothing.** An instrument that perturbs what it measures is
 *    worse than a missing one, so the first assertion is a snapshot hash taken
 *    with and without the recorder installed. It is the same idiom
 *    `raid-engagement.test.ts` uses for the raids A/B and for the same reason:
 *    a byte-identity claim is only worth making against an arm you can build.
 * 2. **It samples where the definition says.** `knowledgeHalfLife` is a step
 *    function on the pinned 12-tick lattice, so a census that started a year
 *    late or missed the terminal sample would produce a plausible wrong number.
 * 3. **The metrics reach a record, and they can move.** A metric that cannot
 *    move is not a measurement, whatever it reports — so the last block runs two
 *    strategies and asserts that the ones that should differ do.
 */

import { setImmediate } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import { rngFromRootSeed, snapshotHash, step } from '@mm/sim-core';
import type { SimState } from '@mm/sim-core';
import type { MetricEntry, RunRecord, SweepSpec } from '@mm/mc-harness';
import { KNOWLEDGE_CENSUS_INTERVAL_TICKS, runSweep } from '@mm/mc-harness';
import {
  BALANCE_RUN_METRIC_IDS,
  REFERENCE_REGISTRIES,
  REFERENCE_SWEEP,
  makeReferenceExecutor,
  referenceContent,
  referenceProvenance,
  referenceScenario,
} from '@mm/scenario';

const content = referenceContent();

/**
 * Long enough that a raid lands on at least one arm, short enough for a gate.
 *
 * Two hundred and forty is twenty world years and a multiple of the census
 * interval, so the terminal sample is a lattice sample and the inclusive-end
 * rule is exercised rather than trivially satisfied. It is also the horizon the
 * committed full sweep runs, so an arm here is an arm of the real experiment.
 */
const HORIZON = 240;

/**
 * Generous, and deliberately so.
 *
 * Every test below steps a real universe, and `npm run verify` runs this file
 * beside two hundred and eighty others on a machine whose cores are already
 * spoken for. Three seconds of work in isolation is comfortably past vitest's
 * 30-second default under that contention — and the failure it produces is a
 * timeout naming a test that is not broken, which is the most expensive kind of
 * red there is.
 */
const SLOW_TEST_MS = 180_000;

/**
 * The **smaller** founding cohort, unlike `raid-engagement.test.ts`'s.
 *
 * Nothing asserted here is about population, and the population is what a tick
 * costs: the same three hundred ticks run in a little over half the time at
 * `cohortSize: 4`. A byte-identity claim is exactly as strong over a small
 * universe as over a large one, and this file already spends its budget on
 * running every arm twice.
 */
const OPTIONS = { cohortSize: 4, foundingMages: 2, foundingNodes: 4 } as const;

/** Ticks between yields back to the event loop. See {@link play}. */
const YIELD_EVERY_TICKS = 60;

interface Arm {
  readonly hash: string;
  readonly raids: number;
  readonly censusTicks: readonly number[];
  readonly reaches: number;
}

/**
 * One universe stepped to the horizon, with the recorder installed or not.
 *
 * Driven with `step` directly rather than through a session, for the reason
 * `long-run.ts` gives: this asserts a **snapshot hash**, and a session
 * deliberately does not hand its state out. Zero actions, which is what "the
 * instrument is the only difference between these two arms" requires.
 */
async function playOnce(seed: number, raids: boolean, telemetry: boolean, ticks: number): Promise<Arm> {
  const run = referenceScenario(content, { raids, telemetry });
  let state: SimState = run.scenario.create(seed, { worldTickCap: ticks, options: { ...OPTIONS } });
  const rng = rngFromRootSeed(seed);
  for (let tick = 0; tick < ticks; tick += 1) {
    state = step(state, [], rng);
    // Hands the event loop back periodically. A few hundred ticks of a real
    // universe is seconds of uninterrupted synchronous work, and a worker that
    // never yields starves vitest's own reporting channel — which surfaces as a
    // `[vitest-worker]` timeout naming no failing test at all.
    if (tick % YIELD_EVERY_TICKS === YIELD_EVERY_TICKS - 1) await setImmediate();
  }
  const recorded = run.balanceTelemetry();
  return {
    hash: snapshotHash(state),
    raids: run.raids().length,
    censusTicks: recorded.census.map((sample) => sample.worldTick),
    reaches: recorded.tierFirstReached.length,
  };
}

/**
 * Memoized on the whole argument list, because it is a pure function of it.
 *
 * The same idiom `raid-engagement.test.ts` uses, and for the same reason: the
 * assertions below ask for six distinct arms across eleven calls, and without
 * this the file would compute each of them twice.
 */
const arms = new Map<string, Promise<Arm>>();
function play(seed: number, raids: boolean, telemetry: boolean, ticks = HORIZON): Promise<Arm> {
  const key = `${String(seed)}:${String(raids)}:${String(telemetry)}:${String(ticks)}`;
  const cached = arms.get(key);
  if (cached !== undefined) return cached;
  const arm = playOnce(seed, raids, telemetry, ticks);
  arms.set(key, arm);
  return arm;
}

/**
 * Two seeds, and the first one raids inside the horizon.
 *
 * The arrival process is a `fp(0.0039)` chance a tick behind a sixty-tick
 * cooldown, so whether a raid lands inside twenty world years is a property of
 * the seed. The order matters: the assertions that need an arm which *did*
 * something take `SEEDS[0]`, and picking a quiet seed for them would make a
 * byte-identity claim about a universe where nothing happened.
 */
const SEEDS: readonly number[] = Object.freeze([0x0bad_c0de, 0x1234_5678]);

describe('collecting §7 telemetry does not perturb the run', () => {
  it.each(SEEDS)('leaves the snapshot hash byte-identical, seed %i, raids on', { timeout: SLOW_TEST_MS }, async (seed) => {
    const on = await play(seed, true, true);
    const off = await play(seed, true, false);
    expect(on.hash).toEqual(off.hash);
    // A recorder that opened a random stream would move the raid arrival roll
    // before it moved anything else, so the raid count is asserted alongside the
    // hash rather than trusted to be inside it.
    expect(on.raids).toEqual(off.raids);
  });

  it('compares an arm that actually resolved a raid', { timeout: SLOW_TEST_MS }, async () => {
    // The assertion above is only worth its runtime if at least one arm did
    // something a recorder could have disturbed. One of the two seeds reaches
    // the arrival process within the horizon; naming it here keeps the other
    // one's silence from reading as a pass.
    expect((await play(SEEDS[0] as number, true, true)).raids).toBeGreaterThan(0);
  });

  it('leaves the snapshot hash byte-identical with raids off', { timeout: SLOW_TEST_MS }, async () => {
    const seed = SEEDS[0] as number;
    expect((await play(seed, false, true)).hash).toEqual((await play(seed, false, false)).hash);
  });

  it('records nothing at all when the recorder is not installed', { timeout: SLOW_TEST_MS }, async () => {
    // The positive control for the assertions above. Without it they would pass
    // just as happily against a recorder that was never wired in.
    const off = await play(SEEDS[0] as number, true, false);
    expect(off.censusTicks).toEqual([]);
    const on = await play(SEEDS[0] as number, true, true);
    expect(on.censusTicks.length).toBeGreaterThan(0);
    expect(on.reaches).toBeGreaterThan(0);
  });
});

describe('the census lands on the interval contracts.md §7 pins', () => {
  const arm = (): Promise<Arm> => play(SEEDS[0] as number, true, true);

  it('samples every 12 world ticks from tick 0, inclusive of the last', { timeout: SLOW_TEST_MS }, async () => {
    const expected: number[] = [];
    for (let tick = 0; tick <= HORIZON; tick += KNOWLEDGE_CENSUS_INTERVAL_TICKS) expected.push(tick);
    expect((await arm()).censusTicks).toEqual(expected);
  });

  it('takes the terminal sample a system inside step cannot reach', { timeout: SLOW_TEST_MS }, async () => {
    // The last thing a system sees is the tick the final step *arrived* with.
    // `metrics-census.ts` is explicit that the sample at `ticksRun` is the one
    // that observes whatever the final step destroyed, so its absence would be
    // a silently short survival curve rather than an error.
    expect((await arm()).censusTicks.at(-1)).toBe(HORIZON);
  });
});

/**
 * A sweep declaring the §7 per-run metrics alongside the vital signs.
 *
 * Four cells, one replicate and a 120-tick cap. Every assertion below is about
 * whether an entry exists and whether it can move, and neither needs a long
 * horizon — what the metrics come to at the horizon that matters is the full
 * sweep's job, and paying for it twice here would make this file the reason
 * another one times out.
 */
function specFor(strategy: string): SweepSpec {
  return {
    ...REFERENCE_SWEEP,
    sweepId: `balance-telemetry-${strategy}`,
    replicates: 1,
    agentPool: { ...REFERENCE_SWEEP.agentPool, strategies: [strategy] },
    termination: { ...REFERENCE_SWEEP.termination, worldTickCap: 120 },
    metrics: [...BALANCE_RUN_METRIC_IDS].sort(),
  };
}

/** Memoized for the reason {@link play} is: three assertions, two sweeps. */
const sweeps = new Map<string, Promise<readonly RunRecord[]>>();
function recordsFor(strategy: string): Promise<readonly RunRecord[]> {
  const cached = sweeps.get(strategy);
  if (cached !== undefined) return cached;
  const records = runSweepFor(strategy);
  sweeps.set(strategy, records);
  return records;
}

async function runSweepFor(strategy: string): Promise<readonly RunRecord[]> {
  const result = await runSweep({
    spec: specFor(strategy),
    registries: REFERENCE_REGISTRIES,
    execution: { mode: 'inline', execute: makeReferenceExecutor({ content }) },
    provenance: referenceProvenance(content),
  });
  return result.records;
}

function valuesOf(records: readonly RunRecord[], metricId: string): number[] {
  return records
    .map((record) => record.metrics[metricId] as MetricEntry)
    .filter((entry): entry is Extract<MetricEntry, { status: 'measured' }> => entry.status === 'measured')
    .map((entry) => entry.value);
}

describe('the §7 per-run metrics reach a run record', () => {
  const SWEEP_TIMEOUT_MS = SLOW_TEST_MS;

  it(
    'carries an entry for every declared §7 metric, with a status behind each',
    { timeout: SWEEP_TIMEOUT_MS },
    async () => {
      const records = await recordsFor('passive-control');
      expect(records.length).toBeGreaterThan(0);
      for (const record of records) {
        expect(Object.keys(record.metrics).sort()).toEqual([...BALANCE_RUN_METRIC_IDS].sort());
        for (const metricId of BALANCE_RUN_METRIC_IDS) {
          const entry = record.metrics[metricId] as MetricEntry;
          expect(['measured', 'unavailable'], metricId).toContain(entry.status);
        }
      }
    },
  );

  it(
    'measures libraryDependence, and it differs between runs',
    { timeout: SWEEP_TIMEOUT_MS },
    async () => {
      // The metric the finding named: it had been read as a healthy constant 0
      // while nothing collected it at all. A single value across a whole sweep
      // is what that failure looks like from the outside, so the assertion is on
      // the spread and not on the level.
      const values = valuesOf(await recordsFor('passive-control'), 'libraryDependence');
      expect(values.length).toBeGreaterThan(1);
      expect(new Set(values).size).toBeGreaterThan(1);
      for (const value of values) {
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    },
  );

  it(
    'moves illegalActionRate when the strategy submits something the mask refuses',
    { timeout: SWEEP_TIMEOUT_MS },
    async () => {
      // The can-it-move check, and the reason it needs two strategies: the
      // passive control submits only no-ops, so its rejection rate is 0 for a
      // real reason and a zero there proves nothing on its own. `portal-rush`
      // asks for action 14 whether or not it can afford one.
      const passive = valuesOf(await recordsFor('passive-control'), 'illegalActionRate');
      const rushing = valuesOf(await recordsFor('portal-rush'), 'illegalActionRate');
      expect(passive.every((value) => value === 0)).toBe(true);
      expect(rushing.every((value) => value > 0)).toBe(true);
    },
  );
});
