/*
 * Multiverse Mages — the two combat metrics, and the answers they must give
 * when there is no mechanic, no sample, and no denominator.
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
 * `combatActionEconomy` and `combatThresholdEfficiency` measure a mechanic this
 * build does not have — `raidEngagement` is `false`, `scenario` opens no portal
 * — so the first thing either has to get right is saying so. A zero here would
 * read as *"combat primitives are worthless"*, which is a finding the build has
 * not earned and which the evaluator exists to state honestly when it is true.
 *
 * The rest is the three-way distinction §7 requires and the collectors are easy
 * to get wrong on: **absent** (no mechanic), **empty** (mechanic, no raids), and
 * **undefined** (raids, but nothing the ratio could be taken over).
 */

import { describe, expect, it } from 'vitest';

import type { MetricEntry } from '@mm/mc-harness';
import {
  BALANCE_METRIC_REGISTRY,
  collectCombatActionEconomy,
  collectCombatThresholdEfficiency,
  collectRunMetrics,
} from '@mm/mc-harness';

import { ALL_MECHANICS, raidObservation, telemetry } from './metrics-fixtures.js';

/** A source row, defaulted to a source that did nothing. */
function source(
  id: string,
  overrides: Partial<{
    deniedCombatantTicks: number;
    hitPointsRemoved: number;
    removingAttempts: number;
    hurtingAttempts: number;
    spentAttempts: number;
  }> = {},
): {
  source: string;
  deniedCombatantTicks: number;
  hitPointsRemoved: number;
  removingAttempts: number;
  hurtingAttempts: number;
  spentAttempts: number;
} {
  return {
    source: id,
    deniedCombatantTicks: 0,
    hitPointsRemoved: 0,
    removingAttempts: 0,
    hurtingAttempts: 0,
    spentAttempts: 0,
    ...overrides,
  };
}

/** A run with raids, on a build that has them. */
function withRaids(raids: ReturnType<typeof raidObservation>[]): ReturnType<typeof telemetry> {
  return telemetry({ mechanics: ALL_MECHANICS, raids });
}

const detail = (entry: MetricEntry): Record<string, unknown> =>
  (entry as { detail?: Record<string, unknown> }).detail ?? {};

describe('absence is declared, never inferred', () => {
  it('reports mechanic-absent on this build rather than a misleading zero', () => {
    // The default fixture is `MECHANICS_AT_0_5_0`, in which `raidEngagement` is
    // false. Both metrics must say the mechanic is missing, because a 0 would be
    // the single most misleading number either could produce: it is exactly what
    // a working build with worthless combat primitives would report.
    for (const entry of [collectCombatActionEconomy(telemetry()), collectCombatThresholdEfficiency(telemetry())]) {
      expect(entry.status).toBe('unavailable');
      expect((entry as { reason: string }).reason).toBe('mechanic-absent');
    }
  });

  it('distinguishes a build with no raids from a run that had none', () => {
    for (const collect of [collectCombatActionEconomy, collectCombatThresholdEfficiency]) {
      expect((collect(withRaids([])) as { reason: string }).reason).toBe('no-observations');
    }
  });

  it('appears in every run record, always', () => {
    const entries = collectRunMetrics(telemetry());
    expect(Object.keys(entries)).toContain('combatActionEconomy');
    expect(Object.keys(entries)).toContain('combatThresholdEfficiency');
  });
});

describe('combatActionEconomy is a rate, not a level', () => {
  const raid = raidObservation({
    totalCombatantTicks: 400,
    worldScaleRemovals: 3,
    summonsRemoved: 2,
    combatSources: [
      source('area-denial', { deniedCombatantTicks: 60, hitPointsRemoved: 900 }),
      source('direct-damage', { deniedCombatantTicks: 10, hitPointsRemoved: 100 }),
      source('ward', { deniedCombatantTicks: 30 }),
    ],
  });

  it('divides denied combatant-ticks by the combatant-ticks the raid contained', () => {
    const entry = collectCombatActionEconomy(withRaids([raid]));
    expect(entry.status).toBe('measured');
    expect((entry as { value: number }).value).toBeCloseTo(100 / 400, 10);
  });

  it('does not rank a longer raid above a more decisive one', () => {
    // The reason the scalar is a rate. Twice the raid, twice the denial, same
    // combat: a level would call the second raid twice as decided by combat.
    const twiceAsLong = raidObservation({
      totalCombatantTicks: 800,
      combatSources: [
        source('area-denial', { deniedCombatantTicks: 120 }),
        source('direct-damage', { deniedCombatantTicks: 20 }),
        source('ward', { deniedCombatantTicks: 60 }),
      ],
    });
    const short = (collectCombatActionEconomy(withRaids([raid])) as { value: number }).value;
    const long = (collectCombatActionEconomy(withRaids([twiceAsLong])) as { value: number }).value;
    expect(long).toBeCloseTo(short, 10);
  });

  it('reports the dominance share, which is what an imbalanced combat layer looks like', () => {
    const entry = collectCombatActionEconomy(withRaids([raid]));
    // Area denial holds 60 of 100. A layer in which one primitive does
    // everything reads near 1; one in which the sources trade reads near 1/n.
    expect(detail(entry).dominanceShare).toBeCloseTo(0.6, 10);
  });

  it('keeps damage, and keeps it secondary', () => {
    const bySource = detail(collectCombatActionEconomy(withRaids([raid]))).bySource as Record<
      string,
      { shareOfDenied: number; shareOfHitPoints: number }
    >;
    // The two shares differ, which is the whole reason the metric exists: the
    // bolt does a tenth of the hit points and a tenth of the denial only by
    // coincidence here, and `ward` removes no hit points at all while denying
    // 30% of the action.
    expect(bySource['ward']?.shareOfHitPoints).toBe(0);
    expect(bySource['ward']?.shareOfDenied).toBeCloseTo(0.3, 10);
  });

  it('holds summon removals outside the scalar and reports them alongside', () => {
    const entry = collectCombatActionEconomy(withRaids([raid]));
    expect(detail(entry).summonsRemoved).toBe(2);
    expect(detail(entry).worldScaleRemovals).toBe(3);
  });

  it('carries the declared unimplemented channels into the record', () => {
    // So that a reader of a baseline sees "displacement was never measurable"
    // rather than inferring from a row that is not there.
    expect(detail(collectCombatActionEconomy(withRaids([raid]))).unimplementedChannels).toEqual([
      'displacement',
    ]);
  });

  it('refuses a denominator of zero rather than reporting that combat denied nothing', () => {
    const empty = raidObservation({ totalCombatantTicks: 0 });
    const entry = collectCombatActionEconomy(withRaids([empty]));
    expect((entry as { reason: string }).reason).toBe('no-observations');
  });
});

describe('combatThresholdEfficiency separates small from below-threshold', () => {
  const raid = raidObservation({
    combatSources: [
      // The measured shape of the current tuning: a bolt that lands constantly
      // and almost never finishes, against a field that finishes far more often.
      source('direct-damage', { removingAttempts: 2, hurtingAttempts: 198, spentAttempts: 40 }),
      source('area-denial', { removingAttempts: 30, hurtingAttempts: 70 }),
    ],
  });

  it('pools removing over removing plus hurting', () => {
    const entry = collectCombatThresholdEfficiency(withRaids([raid]));
    expect((entry as { value: number }).value).toBeCloseTo(32 / 300, 10);
  });

  it('ranks a primitive that crosses above one that does not', () => {
    const bySource = detail(collectCombatThresholdEfficiency(withRaids([raid]))).bySource as Record<
      string,
      { efficiency: number | null }
    >;
    expect(bySource['direct-damage']?.efficiency).toBeCloseTo(0.01, 10);
    expect(bySource['area-denial']?.efficiency).toBeCloseTo(0.3, 10);
  });

  it('excludes attempts that landed nothing, and counts them', () => {
    // Folding an evaded cast into the denominator would charge the caster for
    // the enemy's concealment. 32/300, not 32/340.
    expect(detail(collectCombatThresholdEfficiency(withRaids([raid]))).spentAttempts).toBe(40);
  });

  it('reports a null efficiency, never 0, for a source nothing tested', () => {
    const untested = raidObservation({
      combatSources: [
        source('direct-damage', { removingAttempts: 1, hurtingAttempts: 1 }),
        source('concealment', { spentAttempts: 9 }),
      ],
    });
    const bySource = detail(collectCombatThresholdEfficiency(withRaids([untested]))).bySource as Record<
      string,
      { efficiency: number | null }
    >;
    // A zero would claim the source was tested and failed to cross.
    expect(bySource['concealment']?.efficiency).toBeNull();
  });

  it('refuses to report when no attempt removed a hit point at all', () => {
    const nothing = raidObservation({ combatSources: [source('direct-damage', { spentAttempts: 12 })] });
    expect((collectCombatThresholdEfficiency(withRaids([nothing])) as { reason: string }).reason).toBe(
      'no-observations',
    );
  });
});

describe('both metrics say what would prove them wrong', () => {
  it('carries a disprovedBy sentence in the registry', () => {
    // `docs/design/invariants.md` has a "Disproved by" column and the metric
    // registry did not. Four metrics in this project have read as healthy
    // constants while being structurally incapable of moving; a stated
    // falsifier is the thing a reviewer can hold a steady number against.
    for (const id of ['combatActionEconomy', 'combatThresholdEfficiency']) {
      const definition = BALANCE_METRIC_REGISTRY.balance(id);
      expect(definition?.disprovedBy, `${id} states no falsifier`).toBeTruthy();
      expect((definition?.disprovedBy ?? '').length).toBeGreaterThan(80);
    }
  });
});
