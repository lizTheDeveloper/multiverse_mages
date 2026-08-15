/*
 * Multiverse Mages — telemetry fixtures for the metric collector tests.
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
 * Hand-built telemetry, not a simulated universe.
 *
 * A collector test that ran the real core would be testing the core, would take
 * seconds per case, and — worst — could not produce the cases that matter most:
 * a cohort with exactly the right censoring pattern, a raid that violates its
 * own portal-stability bound, an arm where thirty of two hundred runs terminated
 * before a checkpoint. Those are the inputs the definitions were written for,
 * and they are constructed here directly.
 */

import type {
  ArmRunSummary,
  ArmTelemetry,
  CensusSample,
  MechanicAvailability,
  RaidObservation,
  RunTelemetry,
} from '@mm/mc-harness';
import { MECHANICS_AT_0_5_0 } from '@mm/mc-harness';

/** The six species `packages/content/data/species.json` declares. */
export const SPECIES_IDS: readonly string[] = ['human', 'elf', 'dwarf', 'draconic', 'gnome', 'orc'];

/** A build in which every mechanic §7 measures exists. Used to test the other side. */
export const ALL_MECHANICS: MechanicAvailability = Object.freeze({
  worship: true,
  raidEngagement: true,
  prestigeCarryForward: true,
});

/** A census sample from a node id list, with the single-instance subset named. */
export function sample(
  worldTick: number,
  existingNodeIds: readonly number[],
  singleInstanceNodeIds: readonly number[] = [],
): CensusSample {
  return { worldTick, existingNodeIds, singleInstanceNodeIds };
}

/**
 * One raid observation, defaulted to a raid in which nothing happened.
 *
 * The action-economy fields default to *empty*, not to plausible numbers: a
 * fixture that quietly supplied denied combatant-ticks would let a collector
 * test pass against a raid the fixture invented rather than one a test declared.
 */
export function raidObservation(overrides: Partial<RaidObservation> = {}): RaidObservation {
  return {
    raidId: 1,
    raidSeed: 4242,
    engagementTicks: 15,
    initialPortalStabilityTicks: 100,
    defenderFrozenWorldTicks: 3,
    attackerTempoCostWorldTicks: 7,
    raidersFielded: 0,
    raidersWithdrawn: 0,
    raidersStranded: 0,
    nodesTakenByAttacker: 0,
    victor: 0,
    reason: 0,
    combatSources: [],
    totalCombatantTicks: 0,
    worldScaleRemovals: 0,
    summonsRemoved: 0,
    unimplementedCombatChannels: ['displacement'],
    ...overrides,
  };
}

/** A run telemetry record with everything defaulted to the 0.5.0 build. */
export function telemetry(overrides: Partial<RunTelemetry> = {}): RunTelemetry {
  return {
    coordinates: { rootSeed: 1, sweepId: 'fixture', cellIndex: 0, replicateIndex: 0 },
    status: 'stagnated',
    ticksRun: 240,
    mechanics: MECHANICS_AT_0_5_0,
    census: [],
    speciesIds: SPECIES_IDS,
    tierFirstReached: [],
    checkpoints: [],
    raids: undefined,
    accounting: { submissions: 0, rejections: 0, byActionId: {} },
    ...overrides,
  };
}

/** One arm run summary. */
export function armRun(overrides: Partial<ArmRunSummary> = {}): ArmRunSummary {
  return {
    coordinates: { rootSeed: 1, sweepId: 'fixture', cellIndex: 0, replicateIndex: 0 },
    status: 'stagnated',
    terminalReason: 3,
    ticksRun: 1200,
    checkpoints: [],
    ...overrides,
  };
}

/** An arm telemetry record with everything defaulted to the 0.5.0 build. */
export function arm(overrides: Partial<ArmTelemetry> = {}): ArmTelemetry {
  return {
    armId: 'fixture-arm',
    mechanics: MECHANICS_AT_0_5_0,
    runs: [],
    prestigeCarryForwardMax: null,
    ...overrides,
  };
}
