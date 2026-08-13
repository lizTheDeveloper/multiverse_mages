/*
 * Multiverse Mages — the three species measurements `mages-and-species` needs:
 * grid versatility, loss-shock recovery, and the demographic price of a role.
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
 * ## Why three metrics and not one more species stat
 *
 * The per-species tuning campaign has been asking one question — *how deep can
 * this species go* — and `timeToTierBySpecies` answers it. These three ask what
 * that question cannot reach:
 *
 * 1. **Breadth, not depth.** A species that competently staffs most of the
 *    seventy cells is a hegemon whatever its ceiling, and no registered metric
 *    counts cells.
 * 2. **Whether a loss compounds.** Lifespans span 25× and fertility is authored
 *    per species. The claim that long-lived species recover *worse* from a
 *    shock is plausible enough to be assumed, which is the reason it has to be
 *    measured.
 * 3. **What a role assignment costs.** `assignRole` is god action 10 and its
 *    price has never been a number.
 *
 * ## Each of these reports an absence rather than a zero
 *
 * Four metrics in this project have read as healthy constants while being
 * structurally incapable of moving — `libraryDependence` pinned at 0,
 * `capitalSnowball`'s byte-identical checkpoints, `referenceLibraryDepth` at
 * 1.00, and a coverage gate counting primitives nothing consumed. Every one of
 * them was a zero that meant "nobody measured this" and read as "this was
 * measured and is fine".
 *
 * So each collector here distinguishes, explicitly and in its `detail`, between
 * the mechanic being absent, the run producing no sample, and the quantity
 * genuinely being zero. A reader who cannot tell those apart from the record
 * alone has been handed the same trap again.
 */

import type { MetricDetail, MetricEntry } from './metrics.js';
import { UNAVAILABLE_REASON } from './metrics.js';
import type {
  RoleDemographySample,
  RosterSample,
  RunTelemetry,
  SpeciesGridReach,
  SpeciesVersatilitySample,
} from './metrics-telemetry.js';

/* ------------------------------------------------------------------------- *
 * Shared shorthands. Kept local rather than exported from metrics-collectors,
 * which does not export its own.
 * ------------------------------------------------------------------------- */

function unavailable(
  reason: (typeof UNAVAILABLE_REASON)[keyof typeof UNAVAILABLE_REASON],
  detail?: MetricDetail,
): MetricEntry {
  return { status: 'unavailable', reason, ...(detail === undefined ? {} : { detail }) };
}

function measured(value: number, detail?: MetricDetail): MetricEntry {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `A species-health collector produced ${String(value)}. canonicalJson renders NaN and ` +
        '±Infinity as null, so a non-finite measurement would reach disk indistinguishable ' +
        'from an absence.',
    );
  }
  return { status: 'measured', value, ...(detail === undefined ? {} : { detail }) };
}

/* ------------------------------------------------------------------------- *
 * speciesGridVersatility
 * ------------------------------------------------------------------------- */

/**
 * The coverage fraction above which a species is flagged a versatility hegemon.
 *
 * **0.8, from the capability author**, not derived: *"flag above roughly 80%
 * coverage even when depth is low"*. Written here as the one place it lives so
 * that a later change moves a constant with a provenance rather than a number
 * somebody re-derived.
 */
export const VERSATILITY_HEGEMONY_FRACTION = 0.8;

/**
 * What "can staff a cell with a qualified researcher" was pinned to mean.
 *
 * ## The definition, and why this one
 *
 * A species **staffs** a cell when it can put a mage in it who is *qualified* —
 * which is pinned as three conjunctive gates, evaluated over content:
 *
 * - **Reachable.** Some node in the cell has a transitive prerequisite closure
 *   containing no node above the species' `depthCeiling`. The closure is
 *   computed over the whole catalogue, not within the cell, because 36 of the
 *   292 authored prerequisite edges cross cells and a per-cell closure would
 *   silently call those nodes free.
 * - **Teachable.** The species can carry that node to `DEFAULT_TEACH_THRESHOLD`
 *   and hold it there. A researcher who cannot pass a node on does not staff a
 *   cell; she is a single point of failure in it, which is `libraryDependence`'s
 *   question and not this one.
 * - **Affordable.** Reaching it fits inside the species' working life,
 *   `lifespanMonths − maturityMonths`, at its own `learnRate`.
 *
 * ## What this deliberately is *not*
 *
 * It is not "can reach the cell's deepest node". That variant separates the
 * species cleanly — and it separates them *by depth*, which is the question
 * already being asked. It is carried alongside as `exhaustibleCells` precisely
 * so the two can be read against each other, but it is not the metric.
 *
 * ## The threshold is the whole metric, so here is what would disprove it
 *
 * A species this predicate calls unable to staff a cell, observed holding a
 * mind instance of a node in that cell during any run. The predicted-staffable
 * set must be a superset of the observed-staffed set; a single counterexample
 * means the gates are wrong, not the content.
 */
export const STAFFABLE_DEFINITION =
  'reachable within depthCeiling over the global prerequisite closure, carryable to ' +
  'DEFAULT_TEACH_THRESHOLD and holdable there, and affordable within lifespanMonths − maturityMonths';

/** The per-species result the collector reports in `detail`. */
export interface SpeciesVersatilityFinding {
  readonly speciesId: string;
  readonly depthCeiling: number;
  readonly staffableCells: number;
  readonly staffableFraction: number;
  readonly staffableEnabledCells: number;
  readonly staffableEnabledFraction: number;
  readonly exhaustibleCells: number;
  readonly exhaustibleFraction: number;
  readonly exhaustibleEnabledCells: number;
  readonly teachableWindowTicks: number;
  readonly liveAffinityEntries: number;
  readonly inertAffinityEntries: number;
  readonly hegemon: boolean;
}

/** Turns one supplied reach into the reported finding, denominators applied here. */
function findingOf(reach: SpeciesGridReach, sample: SpeciesVersatilitySample): SpeciesVersatilityFinding {
  const grid = sample.gridCells;
  const enabled = sample.enabledCells;
  const staffableFraction = grid === 0 ? 0 : reach.staffableCells / grid;
  return {
    speciesId: reach.speciesId,
    depthCeiling: reach.depthCeiling,
    staffableCells: reach.staffableCells,
    staffableFraction,
    staffableEnabledCells: reach.staffableEnabledCells,
    staffableEnabledFraction: enabled === 0 ? 0 : reach.staffableEnabledCells / enabled,
    exhaustibleCells: reach.exhaustibleCells,
    exhaustibleFraction: grid === 0 ? 0 : reach.exhaustibleCells / grid,
    exhaustibleEnabledCells: reach.exhaustibleEnabledCells,
    teachableWindowTicks: reach.teachableWindowTicks,
    liveAffinityEntries: reach.liveAffinityEntries,
    inertAffinityEntries: reach.inertAffinityEntries,
    hegemon: staffableFraction >= VERSATILITY_HEGEMONY_FRACTION,
  };
}

/**
 * The per-run scalar is the **highest** per-species staffable fraction over the
 * full grid.
 *
 * A maximum and not a mean, because the failure mode is one species that can do
 * everything. Averaging it against five that cannot is exactly the arithmetic
 * that would hide it.
 */
export function collectSpeciesGridVersatility(telemetry: RunTelemetry): MetricEntry {
  const sample = telemetry.speciesVersatility;
  if (sample === undefined) {
    return unavailable(UNAVAILABLE_REASON.noObservations, {
      reason:
        'the executor supplied no species grid reach. Species traits and the seventy-cell grid ' +
        'have both shipped, so this is a run that did not report, not a mechanic that is absent.',
    });
  }
  if (sample.species.length === 0) {
    return unavailable(UNAVAILABLE_REASON.noObservations, {
      gridCells: sample.gridCells,
      enabledCells: sample.enabledCells,
      reason: 'the sample declares no species.',
    });
  }

  const findings = sample.species.map((reach) => findingOf(reach, sample));
  const hegemons = findings.filter((finding) => finding.hegemon).map((finding) => finding.speciesId);
  const best = findings.reduce((a, b) => (b.staffableFraction > a.staffableFraction ? b : a));

  const detail: MetricDetail = {
    gridCells: sample.gridCells,
    enabledCells: sample.enabledCells,
    staffableDefinition: STAFFABLE_DEFINITION,
    hegemonyFraction: VERSATILITY_HEGEMONY_FRACTION,
    hegemons,
    hegemonCount: hegemons.length,
    // Reported even when it equals the staffable spread, because the two being
    // equal is the finding that the qualification gates do no work.
    breadthSeparatesFromDepth:
      new Set(findings.map((f) => f.staffableCells)).size > 1 ||
      new Set(findings.map((f) => f.exhaustibleCells)).size === 1,
    species: findings.map((finding) => ({ ...finding })),
  };

  return measured(best.staffableFraction, detail);
}

/* ------------------------------------------------------------------------- *
 * lossShockRecovery
 * ------------------------------------------------------------------------- */

/**
 * The fraction of the pre-shock roster a species must regain to count as
 * recovered.
 *
 * **1.0 — the whole roster, not a fraction of it.** A partial bar would make
 * the metric report a fast recovery for a species that never returns, because
 * every species regains *some* of its dead. The recovery time is right-censored
 * instead, which is the same treatment `knowledgeHalfLife` gives a cohort that
 * outlives the run, and for the same reason: never having seen a return is
 * evidence, not a missing observation.
 */
export const RECOVERY_FRACTION = 1;

/** One species' answer to the shock. */
export interface LossShockFinding {
  readonly speciesId: string;
  readonly preShock: number;
  readonly postShock: number;
  readonly killed: number;
  /** World ticks from the shock to the first sample at or above the pre-shock roster. */
  readonly recoveryTicks: number | null;
  /** True when the roster never returned before the run ended. */
  readonly censored: boolean;
  /** Distinct nodes held in a mind before the shock. */
  readonly preShockNodes: number;
  /** The same at the last sample. */
  readonly finalNodes: number;
  /**
   * Nodes held before the shock and not held at the last sample.
   *
   * The knowledge half of the question. A roster that returns to headcount
   * while this stays positive has not recovered, and a headcount series alone
   * would report that it had.
   */
  readonly nodesNotRecovered: number;
}

function speciesSeries(samples: readonly RosterSample[], index: number): number[] {
  return samples.map((sample) => sample.livingMagesBySpecies[index] ?? 0);
}

/**
 * World ticks a species took to return to its pre-shock roster, per species.
 *
 * The per-run scalar is the **maximum** over species that recovered — the
 * slowest species is the one that determines whether a loss compounds across an
 * era — with the censored species named alongside. A mean would let five fast
 * species bury one that never came back.
 */
export function collectLossShockRecovery(telemetry: RunTelemetry): MetricEntry {
  const shock = telemetry.lossShock;
  if (shock === undefined) {
    return unavailable(UNAVAILABLE_REASON.noObservations, {
      reason:
        'this run was not shocked. A run that lost nobody has no recovery time, and 0 would read ' +
        'as instantaneous recovery.',
    });
  }

  const speciesIds = telemetry.speciesIds;
  const after = shock.samples.filter((sample) => sample.worldTick >= shock.shockTick);
  const findings: LossShockFinding[] = speciesIds.map((speciesId, index) => {
    const pre = shock.preShockBySpecies[index] ?? 0;
    const post = shock.postShockBySpecies[index] ?? 0;
    const preNodes = shock.preShockNodesBySpecies[index] ?? 0;
    const series = speciesSeries(after, index);
    const target = Math.ceil(pre * RECOVERY_FRACTION);

    let recoveryTicks: number | null = null;
    for (let i = 0; i < after.length; i += 1) {
      if ((series[i] ?? 0) >= target) {
        recoveryTicks = (after[i] as RosterSample).worldTick - shock.shockTick;
        break;
      }
    }
    const last = after.at(-1);
    const finalNodes = last === undefined ? 0 : (last.nodesHeldBySpecies[index] ?? 0);

    return {
      speciesId,
      preShock: pre,
      postShock: post,
      killed: pre - post,
      recoveryTicks,
      censored: recoveryTicks === null,
      preShockNodes: preNodes,
      finalNodes,
      nodesNotRecovered: Math.max(0, preNodes - finalNodes),
    };
  });

  const shocked = findings.filter((finding) => finding.killed > 0);
  const detail: MetricDetail = {
    shockTick: shock.shockTick,
    shockFractionFp: shock.shockFractionFp,
    recoveryFraction: RECOVERY_FRACTION,
    censoredAtTick: telemetry.ticksRun,
    speciesShocked: shocked.length,
    censoredSpecies: findings.filter((f) => f.censored).map((f) => f.speciesId),
    species: findings.map((finding) => ({ ...finding })),
  };

  if (shocked.length === 0) {
    return unavailable(UNAVAILABLE_REASON.noObservations, {
      ...detail,
      reason: 'the shock killed nobody — there was no roster to cull at the shock tick.',
    });
  }

  const recovered = shocked
    .filter((finding) => finding.recoveryTicks !== null)
    .map((finding) => finding.recoveryTicks as number);
  if (recovered.length === 0) {
    return unavailable(UNAVAILABLE_REASON.censored, {
      ...detail,
      reason: 'no shocked species regained its pre-shock roster before the run ended.',
    });
  }

  return measured(Math.max(...recovered), detail);
}

/* ------------------------------------------------------------------------- *
 * roleAssignmentDemographicCost
 * ------------------------------------------------------------------------- */

/** Per-species share movement attributable to role assignment. */
export interface RoleDemographyFinding {
  readonly speciesId: string;
  /** Roster share at run end in the treated arm, `fp` scale. */
  readonly treatedShareFp: number;
  /** The same in the control arm, which assigned no roles. */
  readonly controlShareFp: number;
  /** `treated − control`. Negative means assignment consumed the species. */
  readonly shareDeltaFp: number;
  readonly roleAttributedDeaths: number;
}

/**
 * The demographic price of role assignment, as the paired share difference.
 *
 * The per-run scalar is the **largest fall** in any species' roster share
 * against the control, at `fp` scale — a positive number is a price paid, zero
 * is a lever that does not exist yet.
 *
 * ## Three answers that are not the same, and are not collapsed
 *
 * - **`mechanic-absent`** — the build has no raid engagement. Role assignment's
 *   only mortality pathway is combatant eligibility (`RAIDING_ROLES` is
 *   `{raider}`), so with no raids there is no pathway at all and the price is
 *   not zero, it is undefined.
 * - **`no-observations`** — raids exist, but this run assigned no roles or ran
 *   no raid. Nothing was tried.
 * - **measured `0`** — roles were assigned, raids were fought, and the roster
 *   share did not move. *That* is the finding that `assignRole` is free.
 *
 * Reporting all three as `0` is precisely how the four dead constants happened.
 */
export function collectRoleAssignmentDemographicCost(telemetry: RunTelemetry): MetricEntry {
  if (!telemetry.mechanics.raidEngagement) {
    return unavailable(UNAVAILABLE_REASON.mechanicAbsent, {
      reason:
        'this build has no raid engagement. Role assignment reaches mortality only through ' +
        'combatant eligibility — RAIDING_ROLES is {raider} — so with no raids there is no ' +
        'pathway from a role to a death, and the price is undefined rather than zero.',
    });
  }

  const demography: RoleDemographySample | undefined = telemetry.roleDemography;
  if (demography === undefined) {
    return unavailable(UNAVAILABLE_REASON.noObservations, {
      reason: 'the executor supplied no role-demography pair for this run.',
    });
  }

  const assignments = Object.values(demography.assignmentsByRoleId).reduce((a, b) => a + b, 0);
  const findings: RoleDemographyFinding[] = telemetry.speciesIds.map((speciesId, index) => {
    const treated = demography.finalShareFpBySpecies[index] ?? 0;
    const control = demography.controlFinalShareFpBySpecies[index] ?? 0;
    return {
      speciesId,
      treatedShareFp: treated,
      controlShareFp: control,
      shareDeltaFp: treated - control,
      roleAttributedDeaths: demography.roleAttributedDeathsBySpecies[index] ?? 0,
    };
  });

  const detail: MetricDetail = {
    assignmentsByRoleId: { ...demography.assignmentsByRoleId },
    assignmentCount: assignments,
    roleAttributedDeaths: findings.reduce((a, f) => a + f.roleAttributedDeaths, 0),
    species: findings.map((finding) => ({ ...finding })),
  };

  if (assignments === 0) {
    return unavailable(UNAVAILABLE_REASON.noObservations, {
      ...detail,
      reason: 'the treated arm assigned no roles, so there is no treatment to difference against.',
    });
  }

  const largestFall = findings.reduce((worst, finding) => Math.max(worst, -finding.shareDeltaFp), 0);
  return measured(largestFall, detail);
}
