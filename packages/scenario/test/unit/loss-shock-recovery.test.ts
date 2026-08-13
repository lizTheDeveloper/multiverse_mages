/*
 * Multiverse Mages — how long a species roster takes to come back, measured
 * rather than assumed.
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
 * `mages-and-species` asked for this one specifically as an assertion rather
 * than a plausibility: *"This may already fall out of your fertility stat, but
 * the recommendation is to assert it rather than assume it."*
 *
 * So this runs a real universe, culls half its mages at a pinned tick with no
 * RNG draw, runs a control at the same seed that culls nobody, and reads the
 * per-species roster series out of both.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { collectLossShockRecovery } from '@mm/mc-harness';
import { MECHANICS_AT_0_5_0 } from '@mm/mc-harness';
import type { RosterSample, RunTelemetry } from '@mm/mc-harness';

import type { LongRunResult } from '../../src/long-run.js';
import { runLongReference } from '../../src/long-run.js';
import { referenceContent } from '../../src/reference-universe.js';

/** Halve the roster, one world century in. */
const SHOCK_TICK = 1200;
const EVERY_KTH = 2;
/** Two centuries, so a slow species has room to be seen not recovering. */
const TICKS = 2400;
/** Sampled every world year, the grid `metrics-census.ts` already uses. */
const SAMPLE_INTERVAL = 12;

const content = referenceContent();
const speciesIds = content.registry.species.map((entry) => entry.record.id);

let shocked: LongRunResult;
let control: LongRunResult;

beforeAll(async () => {
  shocked = await runLongReference({
    content,
    ticks: TICKS,
    shock: { atTick: SHOCK_TICK, everyKth: EVERY_KTH },
  });
  control = await runLongReference({ content, ticks: TICKS });
}, 300_000);

function samplesOf(run: LongRunResult): RosterSample[] {
  const out: RosterSample[] = [];
  run.ticks.forEach((tick, index) => {
    const worldTick = index + 1;
    // Strictly after the shock tick. The observation for tick `SHOCK_TICK` was
    // recorded *before* the cull was applied to that state, so including it
    // would offer the collector the full pre-shock roster as the first
    // post-shock sample and every species would report recovery in 0 ticks.
    // That is the flat-zero this measurement exists to avoid producing.
    if (worldTick <= SHOCK_TICK || worldTick % SAMPLE_INTERVAL !== 0) return;
    out.push({
      worldTick,
      livingMagesBySpecies: tick.magesBySpecies,
      populationBySpecies: tick.populationBySpecies,
      // The observation carries no per-species node holdings, so the knowledge
      // half of the question is not answerable from this channel. Reported as
      // zeroes with the limitation stated, not invented.
      nodesHeldBySpecies: tick.magesBySpecies.map(() => 0),
    });
  });
  return out;
}

function telemetryOf(run: LongRunResult): RunTelemetry {
  const outcome = run.shock;
  if (outcome === undefined) throw new Error('expected a shocked run');
  return {
    coordinates: { rootSeed: 1, sweepId: 'loss-shock', cellIndex: 0, replicateIndex: 0 },
    status: 'truncated',
    ticksRun: TICKS,
    mechanics: MECHANICS_AT_0_5_0,
    census: [],
    speciesIds,
    tierFirstReached: [],
    checkpoints: [],
    raids: undefined,
    accounting: { submissions: 0, rejections: 0, byActionId: {} },
    lossShock: {
      shockTick: SHOCK_TICK,
      shockFractionFp: Math.round(1024 / EVERY_KTH),
      preShockBySpecies: outcome.preShockBySpecies,
      postShockBySpecies: outcome.postShockBySpecies,
      preShockNodesBySpecies: outcome.preShockBySpecies.map(() => 0),
      samples: samplesOf(run),
    },
  };
}

describe('the cull itself', () => {
  it('removes half the living mages, and takes no RNG draw to choose them', () => {
    const outcome = shocked.shock;
    expect(outcome).toBeDefined();
    const pre = (outcome as NonNullable<typeof outcome>).preShockBySpecies.reduce((a, b) => a + b, 0);
    const post = (outcome as NonNullable<typeof outcome>).postShockBySpecies.reduce(
      (a, b) => a + b,
      0,
    );
    expect(pre).toBeGreaterThan(0);
    expect(post).toBe(pre - Math.floor(pre / EVERY_KTH));
  });

  it('is reproducible — the same seed culls the same handles', async () => {
    const again = await runLongReference({
      content,
      ticks: SHOCK_TICK,
      shock: { atTick: SHOCK_TICK, everyKth: EVERY_KTH },
    });
    expect(again.shock?.culled).toEqual(shocked.shock?.culled);
  }, 300_000);

  it('leaves the control untouched, so the pairing means something', () => {
    expect(control.shock).toBeUndefined();
    // Identical up to the shock tick: the cull is the only difference.
    expect(control.ticks[SHOCK_TICK - 1]?.magesBySpecies).toEqual(
      shocked.ticks[SHOCK_TICK - 1]?.magesBySpecies,
    );
  });
});

describe('recovery, per species', () => {
  it('produces a measurement or a censoring, never a silent zero', () => {
    const entry = collectLossShockRecovery(telemetryOf(shocked));
    const report = entry.status === 'measured' ? entry : entry;
    // Printed because these are the numbers the capability asked for, and a
    // reviewer reading the PR should not have to re-derive them.
    console.log('lossShockRecovery:', JSON.stringify(report, null, 1));
    expect(['measured', 'unavailable']).toContain(entry.status);
    if (entry.status === 'measured') expect(entry.value).toBeGreaterThan(0);
  });

  /**
   * The claim under test: *"Elven and draconic losses should compound across
   * eras while human and orc losses get absorbed."*
   *
   * Content composes `4/1024 × fertility × mageAptitude` into mage-production
   * rates per populace member per month of human 2.44e-3 down to draconic
   * 3.20e-4, against maturity lags of 168 months (orc) to 3600 (draconic). If
   * the shipped universe holds only one species, the claim is untestable here
   * and this says so rather than passing vacuously.
   */
  /**
   * ## Failing on `w80/research-cost-variation`, and left failing on purpose
   *
   * At `LONG_RUN_SEED` the priced content surface leaves **orc with no living
   * mages at the cull tick**, where the flat one left three, so orc reports no
   * shock and this assertion sees five species instead of six. Making it pass
   * would be a one-word edit and would hide a species going to zero.
   *
   * **But the entanglement runs the other way and this test cannot tell the
   * difference.** Orc's roster is small enough that whether it is alive at tick
   * 1200 is close to a coin flip *before* any content changes.
   * `tools/w80/orc-seeds.mjs` takes the same shocked run at five seeds:
   *
   * ```
   * orc pre-shock roster, by seed 589825..589829
   * flat    3  1  0  1  4     mean 1.8   zero on 1 of 5
   * priced  0  0  0  2  3     mean 1.0   zero on 3 of 5
   * ```
   *
   * The paired difference is −0.8 mages with a standard error of 0.66 (t = −1.2
   * on 4 degrees of freedom), and an independent reading of plain `main` over
   * thirty-two seeds puts orc at a mean of **1.22** living mages and zero on
   * **11 of 32**. Both arms bracket that. **So this is one seed of a species
   * that is barely alive at any seed**, and the assertion is really asserting
   * that a coin came up heads.
   *
   * Every species magnitude carries `tuningStatus: "untuned"`. The right fix is
   * the species-tuning pass — either orc gets a roster that survives a century,
   * or this test stops reading a single seed of the most marginal species as an
   * invariant. Until one of those happens it stays red rather than being edited
   * to agree with whichever content set ran last.
   */
  it('is asserted per species, not assumed from fertility', () => {
    const entry = collectLossShockRecovery(telemetryOf(shocked));
    const detail = (entry as unknown as { detail: { species: Record<string, unknown>[] } }).detail;
    const shockedSpecies = detail.species.filter((row) => (row['killed'] as number) > 0);
    console.log(
      'per-species recovery:',
      shockedSpecies
        .map(
          (row) =>
            `${String(row['speciesId'])} pre=${String(row['preShock'])} killed=${String(
              row['killed'],
            )} recoveryTicks=${String(row['recoveryTicks'])} censored=${String(row['censored'])}`,
        )
        .join(' | '),
    );
    expect(shockedSpecies.length).toBeGreaterThan(0);
    // Every species lost mages, so no species is exempt by accident.
    expect(shockedSpecies).toHaveLength(speciesIds.length);
  });

  /**
   * **The long-lived half of the claim holds.** Neither elf (8,400 months) nor
   * draconic (18,000) regains its pre-shock roster in the twelve hundred world
   * ticks after the cull. Their losses compound across the era exactly as
   * `mages-and-species` predicted.
   */
  it('leaves elf and draconic censored — their losses do compound', () => {
    const entry = collectLossShockRecovery(telemetryOf(shocked));
    const detail = (entry as unknown as { detail: Record<string, unknown> }).detail;
    const censored = detail['censoredSpecies'] as string[];
    expect(censored).toContain('elf');
    expect(censored).toContain('draconic');
  });

  /**
   * **The short-lived half of the claim is refuted, and the stated mechanism
   * with it.**
   *
   * The claim was that *"human and orc losses get absorbed"* because fertility
   * differs. Human has the highest mage-production rate in content
   * (`4/1024 × fertility × mageAptitude` = 2.44e-3 per member per month, against
   * draconic's 3.20e-4) and orc the shortest maturity lag at 168 months — and
   * neither recovers either. Both are censored alongside the long-lived pair.
   *
   * What does recover is gnome and dwarf, which are neither the most fertile nor
   * the shortest-lived. So recovery is not rate-limited by fertility at all:
   * student demand *is* university capacity (`populace/demand.ts`), the
   * carrying-capacity brake is one scalar shared across every species, and the
   * roster refills against seats rather than against births.
   *
   * That distinction matters for tuning. Retuning `fertility` to fix a brittle
   * species would move a number that is not the binding constraint.
   */
  /**
   * **Also failing on `w80/research-cost-variation`, and for the same reason:**
   * orc cannot be censored for failing to recover when it had no roster to lose.
   * See the note on the first assertion in this block for the five-seed
   * distribution and why editing either of them would be recording a coin flip.
   */
  it('refutes the fertility mechanism — human and orc do not recover either', () => {
    const entry = collectLossShockRecovery(telemetryOf(shocked));
    const detail = (entry as unknown as { detail: Record<string, unknown> }).detail;
    const censored = detail['censoredSpecies'] as string[];
    expect(censored).toContain('human');
    expect(censored).toContain('orc');

    const species = (detail['species'] as Record<string, unknown>[]).filter(
      (row) => row['censored'] === false,
    );
    // Something recovers, so the censoring above is a finding and not a run
    // that simply ended too early for anybody.
    expect(species.length).toBeGreaterThan(0);
    const recoverers = species.map((row) => String(row['speciesId']));
    // The recoverers are not the two shortest-lived species, which is the whole
    // of the refutation in one assertion.
    expect(recoverers).not.toContain('orc');
    expect(recoverers).not.toContain('human');
  });
});
