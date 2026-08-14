/*
 * Multiverse Mages — the §7 raid metrics, from the engine to the run record.
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
 * **A sweep can finally see a raid.**
 *
 * `raid-engagement.test.ts` proves a reference universe resolves raids.
 * `metric-completeness.test.ts` proves every declared metric reaches every
 * record. Between the two sat a gap nothing asserted: the raids were resolved,
 * reduced to `RaidObservation`s, attached to `ReferenceRunResult` — and then
 * dropped, because `RunOutcome.metrics` came from `collectReferenceMetrics`,
 * which knew only the census-derived vital signs. §7's collectors existed,
 * `collectRunMetrics` existed, and **nothing in the production run path called
 * it**, so `raidLengthDistribution` and `raidInitiationCost` had never appeared
 * in a run record. Declaring them in a sweep failed at validation with *"the
 * reference scenario defines no metric raidInitiationCost"*.
 *
 * This file is the chain, asserted at all three of its honest answers, because
 * the interesting failure is not "the number is wrong" but "the number is a
 * zero that cannot move":
 *
 * - **`mechanic-absent`** — a build with `raids: false`. Not a zero.
 * - **`no-observations`** — raids exist, this run initiated none.
 * - **`measured`** — a run long enough to raid, with the histogram behind it.
 *
 * The two reasons are the distinction `RunMeasurement.raids` carries as
 * `undefined` versus `[]` all the way from the executor, and collapsing them is
 * the confusion §7's reason codes exist to end.
 */

import { describe, expect, it } from 'vitest';

import type { MetricEntry, RunTask } from '@mm/mc-harness';
import { UNAVAILABLE_REASON } from '@mm/mc-harness';
import { REFERENCE_METRIC_IDS, executeReferenceRun, referenceContent } from '@mm/scenario';

/** The three run-scoped raid metrics of `contracts.md` §7. */
const RAID_METRIC_IDS = ['raidLengthDistribution', 'inboundRaidTempoLoss', 'raidInitiationCost'];

/**
 * World ticks a portal-rushing god needs before it can afford to open one.
 *
 * The same horizon `raid-engagement.test.ts` runs at, and it is not a round
 * number chosen for comfort: below it the god has not accumulated the favor
 * action 14 costs, the run initiates no raid, and every metric here reports
 * `no-observations` — correctly, which is why the short-horizon case is asserted
 * beside this one rather than replaced by it.
 */
const RAIDING_HORIZON = 400;

/** A horizon short enough that no raid is affordable. The reference sweep's own. */
const SHORT_HORIZON = 24;

const content = referenceContent();

function task(worldTickCap: number): RunTask {
  return {
    coordinates: { rootSeed: 1, sweepId: 'w106-raid-metrics', cellIndex: 0, replicateIndex: 0 },
    runSeed: 12_345,
    levels: {},
    // The one bot in the pool that spends its favor on portals. A passive
    // strategy would report `no-observations` at every horizon and prove
    // nothing about the chain.
    strategies: ['portal-rush'],
    worldTickCap,
    metrics: [...REFERENCE_METRIC_IDS],
    ablatedPrimitives: [],
  };
}

function entry(metrics: Readonly<Record<string, MetricEntry>>, id: string): MetricEntry {
  const found = metrics[id];
  if (found === undefined) throw new Error(`the run record carries no ${id}`);
  return found;
}

/**
 * The entry, asserted unavailable and narrowed to it.
 *
 * `MetricEntry` is a discriminated union, so a bare `expect(...).toBe(...)` on
 * `reason` does not narrow it and does not compile. Narrowing through a throw
 * keeps the assertion's failure message about the metric rather than about a
 * missing property.
 */
function unavailable(
  metrics: Readonly<Record<string, MetricEntry>>,
  id: string,
): Extract<MetricEntry, { status: 'unavailable' }> {
  const found = entry(metrics, id);
  if (found.status !== 'unavailable') {
    throw new Error(`${id} was measured at ${String(found.value)}; expected it to be unavailable`);
  }
  return found;
}

/** The mirror of {@link unavailable}, for the same reason. */
function measured(
  metrics: Readonly<Record<string, MetricEntry>>,
  id: string,
): Extract<MetricEntry, { status: 'measured' }> {
  const found = entry(metrics, id);
  if (found.status !== 'measured') {
    throw new Error(`${id} was unavailable (${found.reason}); expected it to be measured`);
  }
  return found;
}

describe('the reference scenario declares the §7 raid metrics', () => {
  it('names all three among the ids a sweep may declare', () => {
    // The validation half. Before this, `validateSweep` rejected a sweep file
    // that named either of them, so no sweep could ask for one.
    for (const id of RAID_METRIC_IDS) {
      expect(REFERENCE_METRIC_IDS, `${id} is not declarable`).toContain(id);
    }
  });

  it('keeps §7 ids rather than inventing prefixed twins of them', () => {
    // A `referenceRaidLength...` would have been a second definition of a
    // digest-pinned metric, and the two would have drifted apart silently.
    for (const id of REFERENCE_METRIC_IDS) {
      if (!id.startsWith('reference')) expect(RAID_METRIC_IDS).toContain(id);
    }
  });
});

describe('a run that cannot raid says so, and says which kind of cannot', () => {
  it('reports mechanic-absent when the build has no raid mechanic', () => {
    const result = executeReferenceRun(task(SHORT_HORIZON), { content, raids: false });
    // `raids: false` must flow `undefined` — never `[]` — into the measurement.
    expect(result.raids).toBeUndefined();
    for (const id of RAID_METRIC_IDS) {
      expect(unavailable(result.outcome.metrics, id).reason, id).toBe(
        UNAVAILABLE_REASON.mechanicAbsent,
      );
    }
  });

  it('reports no-observations when raids exist and this run initiated none', () => {
    const result = executeReferenceRun(task(SHORT_HORIZON), { content });
    expect(result.raids).toEqual([]);
    // The two distribution metrics need a raid; the tempo-loss fraction has a
    // denominator without one and honestly measures zero frozen ticks.
    for (const id of ['raidLengthDistribution', 'raidInitiationCost']) {
      expect(unavailable(result.outcome.metrics, id).reason, id).toBe(
        UNAVAILABLE_REASON.noObservations,
      );
    }
  });
});

describe('a run that raids measures it', { timeout: 120_000 }, () => {
  it('carries a real histogram, a real cost, and an empty overflow bin', () => {
    const result = executeReferenceRun(task(RAIDING_HORIZON), { content });

    expect(result.raids?.length ?? 0).toBeGreaterThan(0);

    const length = measured(result.outcome.metrics, 'raidLengthDistribution');
    expect(length.value).toBeGreaterThan(0);
    // §7's own disproof condition for this metric: *"any raid landing in the
    // overflow bin, which contradicts §1.6's termination proof"*. Asserted here
    // because this is the first place in the project it could be checked
    // against a raid that actually happened.
    expect(length.detail?.overflow).toBe(0);
    expect(length.detail?.raidCount).toBe(result.raids?.length);

    const cost = measured(result.outcome.metrics, 'raidInitiationCost');
    // Per raid, not per run — §7 pins the denominator as "raids initiated", and
    // its disproof condition is a non-zero cost from a run that initiated none.
    expect(cost.detail?.raids).toBe(result.raids?.length);
    expect(cost.value).toBeGreaterThan(0);

    const tempo = measured(result.outcome.metrics, 'inboundRaidTempoLoss');
    expect(tempo.detail?.elapsedWorldTicks).toBe(RAIDING_HORIZON);
  });

  it('agrees with the unreduced raid log it was derived from', () => {
    // The metric and the report must be talking about the same raids. They are
    // reduced once in the executor and used twice; a second mapping is how the
    // two would come to disagree about a number a reader compares by eye.
    const result = executeReferenceRun(task(RAIDING_HORIZON), { content });
    expect(result.rawRaids).toHaveLength(result.raids?.length ?? 0);
    expect(result.raids?.map((raid) => raid.engagementTicks)).toEqual(
      result.rawRaids.map((raid) => raid.engagementTicks),
    );
  });
});
