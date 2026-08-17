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
 * record. Between the two sat a gap nothing asserted: that the raids a run
 * resolves arrive in that run's record as §7's three raid metrics, at each of
 * the three answers those metrics can honestly give.
 *
 * The route they arrive by is `collectDeclaredMetrics`, which splits a task's
 * declared ids between `measures.ts`'s vital signs and `contracts.md` §7's
 * registry, and feeds the §7 half from `RunTelemetry`. **This file asserts the
 * raid end of that route and nothing else asserts it**: `collectRunMetrics` has
 * a production caller and seven per-run metrics are declarable, but until a run
 * actually raids, `raidLengthDistribution` and `raidInitiationCost` can only
 * ever be observed reporting an absence.
 *
 * This file is the chain, asserted at all three of its honest answers, because
 * the interesting failure is not "the number is wrong" but "the number is a
 * zero that cannot move":
 *
 * - **`mechanic-absent`** — a build with `raids: false`. Not a zero.
 * - **`no-observations`** — raids exist, this run initiated none.
 * - **`measured`** — a run long enough to raid, with the histogram behind it.
 *
 * The two reasons are the distinction `RunTelemetry.raids` carries as
 * `undefined` versus `[]` all the way from the executor, and collapsing them is
 * the confusion §7's reason codes exist to end.
 */

import { describe, expect, it } from 'vitest';

import type { BalanceMetricDefinition, MetricEntry, RunTask } from '@mm/mc-harness';
import { BALANCE_METRIC_REGISTRY, UNAVAILABLE_REASON } from '@mm/mc-harness';
import {
  BALANCE_RUN_METRIC_IDS,
  REFERENCE_METRIC_IDS,
  REFERENCE_REGISTRIES,
  executeReferenceRun,
  referenceContent,
} from '@mm/scenario';

/** The three run-scoped raid metrics of `contracts.md` §7. */
const RAID_METRIC_IDS = ['raidLengthDistribution', 'inboundRaidTempoLoss', 'raidInitiationCost'];

/**
 * The two that read what happened *inside* a raid rather than its shape.
 *
 * Separate from {@link RAID_METRIC_IDS} because until `RaidRecord` carried
 * `actionEconomy` these two could not reach `measured` from this executor at
 * all: `raidObservationOf` wrote `combatSources: []` and a zero denominator into
 * every observation, so `collectCombatActionEconomy` divided nothing by nothing
 * and reported `no-observations` on every run that ever raided.
 */
const COMBAT_METRIC_IDS = ['combatActionEconomy', 'combatThresholdEfficiency'];

/**
 * World ticks a portal-rushing god needs before a raid lands.
 *
 * The same horizon `raid-engagement.test.ts` runs at, and it is not a round
 * number chosen for comfort: below it the run initiates no raid and every
 * metric here reports `no-observations` — correctly, which is why the
 * short-horizon case is asserted beside this one rather than replaced by it.
 *
 * **400 until the v1 rectangle widened from 3x4 to 4x5, and the reason it had
 * to move is not the one this comment used to give.** It said the god "has not
 * accumulated the favor action 14 costs". Measured with `auditStrategy` on
 * `portal-rush` at 400 ticks, that is false on both squares: the legality mask
 * — which prices affordability — permitted action 14 on 355 of 400 ticks at 3x4
 * and on **384** at 4x5, and peak favor *rose*, fp 40,960 to fp 51,200. What
 * changed is `portalPlan`'s other precondition: a living mage holding a
 * permitted node that carries the `portal` primitive. That node is in
 * `rego-limen`, and a research effort spread over 84 v1 nodes instead of 51
 * reaches it later. Applied action-14 counts, same seed and strategy:
 *
 * | build | 400 | 600 | 800 |
 * | --- | --: | --: | --: |
 * | 3x4 | 5 | — | — |
 * | 4x5 | **0** | 5 | 36 |
 *
 * So a wider opening square *delays the first raid* rather than pricing it out,
 * and 600 is where the 4x5 build reaches the raid count 3x4 reached at 400.
 */
const RAIDING_HORIZON = 600;

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
    // Both registries, because the reference scenario answers to both and a
    // record carries only what its task declared. The vital signs come along
    // so this file also proves the two halves of `collectDeclaredMetrics`
    // reach one record together rather than one displacing the other.
    metrics: [...REFERENCE_METRIC_IDS, ...RAID_METRIC_IDS, ...COMBAT_METRIC_IDS],
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
    // The validation half: `validateSweep` checks a sweep file's metric ids
    // against `REFERENCE_REGISTRIES`, so an id absent from it cannot be asked
    // for by any sweep no matter how good its collector is.
    for (const id of RAID_METRIC_IDS) {
      expect(REFERENCE_REGISTRIES.metrics.has(id), `${id} is not declarable`).toBe(true);
      expect(BALANCE_RUN_METRIC_IDS, `${id} is not a §7 per-run metric`).toContain(id);
    }
  });

  it('keeps §7 ids rather than inventing prefixed twins of them', () => {
    // A `referenceRaidLength...` would have been a second definition of a
    // digest-pinned metric, and the two would have drifted apart silently. The
    // two registries stay disjoint by prefix, which is also what keeps
    // `metricRegistry` from throwing on a duplicate id when they are joined.
    for (const id of REFERENCE_METRIC_IDS) {
      expect(id, 'a vital sign must be prefixed').toMatch(/^reference/);
    }
    for (const id of RAID_METRIC_IDS) {
      expect(REFERENCE_METRIC_IDS, `${id} is duplicated as a vital sign`).not.toContain(id);
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

/**
 * **The combat instrumentation, from `RaidOutcome` to the run record.**
 *
 * `rules-raid` has computed an `ActionEconomyReport` for every raid since #128,
 * and `RaidObservation` has declared the five fields that report it for just as
 * long. Between them `RaidRecord` dropped it, and the consequence was measured
 * rather than argued: with `portal-rush` fielding real combatants, **ablating
 * six of the seven combat primitives moved the raid log on none of four seeds.**
 * The mask was live; the record was blind. `scripts/w144-ablation-visibility.mjs`
 * is that measurement, re-runnable.
 *
 * These assertions are the ones that were structurally impossible before, and
 * the last of them is a tripwire rather than a result.
 */
describe('a raid reports what happened inside it, not only its shape', { timeout: 120_000 }, () => {
  it('measures combatActionEconomy over a real denominator', () => {
    const result = executeReferenceRun(task(RAIDING_HORIZON), { content });
    const economy = measured(result.outcome.metrics, 'combatActionEconomy');

    // The assertion that could not hold before. `collectCombatActionEconomy`
    // returns `no-observations` when the pooled `totalCombatantTicks` is zero,
    // with the reason *"every raid resolved on the tick it opened"* — which was
    // false on every raid this executor has ever produced. A hardcoded zero does
    // not merely withhold a measurement; it supplies a wrong explanation for
    // withholding it.
    expect(economy.detail?.totalCombatantTicks).toBeGreaterThan(0);
    expect(economy.detail?.raidCount).toBe(result.raids?.length);
  });

  it('declares only the channel the engine really lacks', () => {
    const result = executeReferenceRun(task(RAIDING_HORIZON), { content });
    const economy = measured(result.outcome.metrics, 'combatActionEconomy');

    // The executor used to name `removal`, `save` and `decoy` as unimplemented
    // *in this executor* while `rules-raid` implemented all three, so the
    // observed list disagreed with the metric's own pinned constant. It is no
    // longer written here at all: it is `UNIMPLEMENTED_CHANNELS`, carried
    // through the record, which is what keeps the two from drifting again.
    const pinned = (
      BALANCE_METRIC_REGISTRY.balance('combatActionEconomy') as BalanceMetricDefinition
    ).pinnedConstants;
    expect(economy.detail?.unimplementedChannels).toEqual(['displacement']);
    expect(economy.detail?.unimplementedChannels).toEqual(pinned.unimplementedChannels);
  });

  it('loses nothing crossing the boundary: the observation is the report, folded', () => {
    const result = executeReferenceRun(task(RAIDING_HORIZON), { content });
    const observations = result.raids ?? [];
    expect(observations.length).toBeGreaterThan(0);

    // Not a data-structure test: both sides of this comparison come from the
    // same real run, and the left one is what §7's collectors actually read. A
    // regrouping that silently dropped a source or a side would pass every
    // assertion above it and fail here.
    observations.forEach((observation, at) => {
      const record = result.rawRaids[at];
      if (record === undefined) throw new Error(`no raw record for observation ${String(at)}`);
      const report = record.actionEconomy;

      expect(observation.totalCombatantTicks).toBe(report.totalCombatantTicks);
      expect(observation.worldScaleRemovals).toBe(report.removals[0] + report.removals[1]);
      expect(observation.summonsRemoved).toBe(report.summonsRemoved[0] + report.summonsRemoved[1]);
      expect(observation.unimplementedCombatChannels).toEqual(report.unimplementedChannels);

      const expected = [
        ...new Set([
          ...report.deniedTicks.map(([source]) => source),
          ...report.hpRemoved.map(([source]) => source),
          ...report.attempts.map(([source]) => source),
        ]),
      ].sort();
      expect(observation.combatSources.map((row) => row.source)).toEqual(expected);

      for (const row of observation.combatSources) {
        const denied = report.deniedTicks.find(([source]) => source === row.source)?.[1] ?? [0, 0];
        const hp = report.hpRemoved.find(([source]) => source === row.source)?.[1] ?? [0, 0];
        expect(row.deniedCombatantTicks).toBe(denied[0] + denied[1]);
        expect(row.hitPointsRemoved).toBe(hp[0] + hp[1]);
      }
    });
  });

  it('finds no combat attempt at all — and that is now a reported zero', () => {
    const result = executeReferenceRun(task(RAIDING_HORIZON), { content });
    let attempts = 0;
    for (const observation of result.raids ?? []) {
      for (const row of observation.combatSources) {
        attempts += row.removingAttempts + row.hurtingAttempts + row.spentAttempts;
      }
    }

    // **A tripwire, not a result — and it watches one task, not the survey.**
    // This assertion covers exactly the run above: `portal-rush`, seed 12,345,
    // 400 world ticks. The wider claim it stands in for was a survey taken with
    // `scripts/w144-ablation-visibility.mjs` on `b02892b` — all eight shipped
    // strategies at two seeds each, 61 raids, 80,615 combatant-ticks, *zero*
    // combat attempts — and that number is a statement about that ref, not a
    // property this test enforces. Re-run the script rather than trusting it.
    // The cause is `chooseIntent`'s
    // priority order: theft outranks casting, and no shipped strategy grants a
    // raider a combat node, so `firstCastableNode` returns nothing on every tick
    // of every raid. That, and not the mask, is why an arm ablating one of the
    // six cast-borne primitives still differences to zero here.
    //
    // When a strategy starts fielding an armed combatant this assertion fails,
    // and the ablation arms in `combat-ablation-reaches-a-raid.test.ts` become
    // writable for the first time. It is deliberately the thing that breaks.
    expect(attempts).toBe(0);
    // …which is why the companion metric is honestly unavailable rather than a
    // ratio invented over an empty denominator.
    expect(unavailable(result.outcome.metrics, 'combatThresholdEfficiency').reason).toBe(
      UNAVAILABLE_REASON.noObservations,
    );
  });
});
