/*
 * Multiverse Mages — one university, in isolation, for N ticks.
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
 * ## What this harness is for, and what it proved by being written
 *
 * A university, a roster, an economy, N ticks and a script of actions in; **what
 * the institution became** out. It composes the shipped functions rather than
 * re-implementing any of them: {@link createUniversity},
 * {@link advanceConstruction}, {@link admitStudents}, {@link libraryDepth},
 * {@link applyLibraryUpkeep}, {@link scribingThroughput},
 * {@link universityProfile} and {@link dominantCell} are all called here exactly
 * as `world-step.ts` would call them if it called them.
 *
 * Writing it answered the question it was commissioned to answer, which is
 * *which clause of "the institution became X" cannot be written today*:
 *
 * - **Construction** has state (`University.buildProgress`) and a production
 *   caller (`world-step.ts` phase 8a). It runs here unchanged.
 * - **Capacity** has state (`University.capacity`) and one production reader —
 *   `economy/counts.ts` sums {@link effectiveCapacity} into an aggregate. No
 *   production code ever asks a *particular* university whether it has a seat.
 * - **Admission has no state at all.** There is no hosted-students field on the
 *   university, no `universityId` on a populace cohort of students, and no link
 *   component between the two. {@link admitStudents} is arithmetic over a
 *   `hosted` number that nothing in the simulation stores. This harness holds
 *   that number in {@link Institution.hosted} — a **local variable**, and that
 *   is the finding rather than a workaround. Delete this harness and the number
 *   ceases to exist anywhere in the project.
 * - **Staffing** has state (`UNIVERSITY_STAFF`, registered in
 *   `WORLD_COMPONENTS`) and, before this branch, no reader and no writer. The
 *   harness staffs a university through {@link staffUniversity} and the
 *   throughput it reports is that university's, not the universe's.
 * - **Specialisation** deliberately has *no* state (`profile.ts` explains why)
 *   and had no production caller. It is derived here on demand, which is the
 *   only way it was ever meant to be read.
 *
 * ## Determinism
 *
 * No RNG. Every quantity below is fixed-point at 1/1024 and every ordering is by
 * ascending handle or by the script's tick order, so two runs of the same
 * options are the same run — which is what lets a test assert a tick number
 * rather than a range.
 */

import type { EntityHandle, Fixed, SimState } from '@mm/sim-core';
import { FP_ONE } from '@mm/sim-core';
import type { ContentId, PrimitiveRecord } from '@mm/content';
import type { OccupationValue, UniversityRecord } from '@mm/state';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  OCCUPATION,
  POPULACE_COHORT,
  UNIVERSITY,
  attachRecord,
  componentOf,
  readRecord,
} from '@mm/state';

import { ClampCounters } from '@mm/primitives';

import { CohortStore } from '../../src/populace/cohort-store.js';
import {
  advanceConstruction,
  applyLibraryUpkeep,
  createUniversity,
  admitStudents,
  AdmissionRefusals,
  contributionFor,
  dominantCell,
  effectiveCapacity,
  isComplete,
  libraryDepth,
  scribingThroughput,
  universityProfile,
} from '../../src/universities/index.js';
import type { CellLookup, LibraryDepth, TierLookup, UniversityProfile } from '../../src/universities/index.js';
import { staffCohortsOf, staffUniversity, unstaffUniversity } from '../../src/universities/staff.js';

import { makeLibrary, worldState } from './universities-fixtures.js';

/** One populace cohort the harness creates before tick 1. */
export interface RosterEntry {
  readonly speciesId: ContentId;
  readonly occupation: OccupationValue;
  readonly count: number;
  /** Any tick in the decade of birth. Defaults to `0`. */
  readonly birthTick?: number;
  /**
   * A name the script refers to this cohort by. Names rather than handles
   * because the script is written before the state exists.
   */
  readonly name: string;
}

/** What the institution is handed each tick, and what it is charged. */
export interface HarnessEconomy {
  /** Opening materials stock, `fp`. */
  readonly materials: Fixed;
  /** Materials added at the top of every tick, `fp`. */
  readonly income?: Fixed;
  /** Person-months of laborer time offered to the site each tick. */
  readonly laborMonths: number;
  /** The `laborAffinity` of the species supplying them, `fp`. */
  readonly laborAffinity: Fixed;
  /** The `scribeAffinity` of the species supplying the scribes, `fp`. */
  readonly scribeAffinity: Fixed;
}

/** Something the world does to this university on a given tick. */
export type UniversityAction =
  /** `count` people ask to be admitted. Refusals are recorded. */
  | { readonly tick: number; readonly kind: 'apply'; readonly count: number }
  /** `count` students leave, freeing their seats in the same tick. */
  | { readonly tick: number; readonly kind: 'graduate'; readonly count: number }
  /** A node is written onto the shelves. */
  | { readonly tick: number; readonly kind: 'shelve'; readonly nodeId: ContentId }
  /** A resident mage learns a node. Counts toward the profile, not the library. */
  | { readonly tick: number; readonly kind: 'learn'; readonly mage: number; readonly nodeId: ContentId }
  /** A named roster cohort is put on the university's staff. */
  | { readonly tick: number; readonly kind: 'staff'; readonly cohort: string }
  /** A named roster cohort leaves the staff. */
  | { readonly tick: number; readonly kind: 'unstaff'; readonly cohort: string }
  /** The god pays for `progress` `fp` of building. */
  | { readonly tick: number; readonly kind: 'fund'; readonly progress: Fixed };

export interface UniversityRunOptions {
  /** Designed capacity. What the site is being built to. */
  readonly capacity: number;
  readonly ticks: number;
  readonly economy: HarnessEconomy;
  readonly roster?: readonly RosterEntry[];
  readonly actions?: readonly UniversityAction[];
  /** The `build-rate` primitive record. */
  readonly buildRate: PrimitiveRecord;
  /** The `scribe-rate` primitive record. */
  readonly scribeRate: PrimitiveRecord;
  /** A node's tier, for library depth. */
  readonly tierOf: TierLookup;
  /** A node's cell, for the derived profile. */
  readonly cellOf: CellLookup;
  /** The relevance ceiling library depth is reported at. Defaults to 7. */
  readonly depthCeiling?: number;
}

/** One tick of the institution's history. */
export interface TickRecord {
  readonly tick: number;
  readonly buildProgress: Fixed;
  readonly progressAdded: Fixed;
  readonly materialsSpent: Fixed;
  readonly labourStalled: number;
  readonly hosted: number;
  readonly admitted: number;
  readonly refused: number;
  readonly scribeMonths: Fixed;
  readonly upkeepShortfall: Fixed;
  readonly materialsRemaining: Fixed;
}

/**
 * What the university became.
 *
 * Everything a caller can ask about an institution after N ticks, in one
 * object, so a test reads as one sentence about a place rather than as six
 * assertions about six functions.
 */
export interface Institution {
  readonly handle: EntityHandle;
  readonly library: EntityHandle;
  readonly buildProgress: Fixed;
  readonly complete: boolean;
  /** The tick construction finished, or `undefined` if it never did. */
  readonly completedOnTick: number | undefined;
  readonly designedCapacity: number;
  readonly effectiveCapacity: number;
  /**
   * Students in residence.
   *
   * **Carried by the harness, not by the world.** See the module header: no
   * component in `WORLD_COMPONENTS` stores this.
   */
  readonly hosted: number;
  readonly admittedTotal: number;
  readonly refusedTotal: number;
  /** Cohort handles on this university's staff, ascending. */
  readonly staffCohorts: readonly EntityHandle[];
  /** Scribe-months this university produced on the last tick, `fp`. */
  readonly scribeMonths: Fixed;
  /** Scribe-months produced over the whole run, `fp`. */
  readonly scribeMonthsTotal: Fixed;
  readonly depth: LibraryDepth;
  /** Distinct nodes on the shelves. */
  readonly shelvedNodes: number;
  /**
   * What the library is worth as `research-rate` capital at `depthCeiling`, `fp`.
   *
   * The institution's output, as opposed to its inventory: a shelf of tier-1
   * nodes and a shelf of tier-7 nodes are the same `shelvedNodes` and not the
   * same university.
   */
  readonly libraryContribution: Fixed;
  readonly profile: UniversityProfile;
  readonly dominantCell: ContentId;
  readonly materialsRemaining: Fixed;
  readonly materialsSpentTotal: Fixed;
  readonly upkeepShortfallTotal: Fixed;
  readonly degradedInstancesTotal: number;
  readonly log: readonly TickRecord[];
  /** The state the run ended in, for assertions the report does not cover. */
  readonly state: SimState;
}

const DEFAULT_DEPTH_CEILING = 7;

/**
 * Runs one university for N ticks and reports what it became.
 *
 * Tick order mirrors `world-step.ts` where the two overlap — the script's
 * actions land first (they are the world acting on the institution), then
 * scribing, then construction, then upkeep. Construction after scribing because
 * a university that completes this tick was not open for business during it,
 * which is the same edge {@link effectiveCapacity} draws.
 */
export function runUniversity(options: UniversityRunOptions): Institution {
  const state = worldState();
  const library = makeLibrary(state);
  const handle = createUniversity(state, { capacity: options.capacity, libraryId: library });

  const cohorts = new CohortStore(state.entities, componentOf(state, POPULACE_COHORT));
  const named = new Map<string, EntityHandle>();
  for (const entry of options.roster ?? []) {
    named.set(
      entry.name,
      cohorts.add(
        {
          speciesId: entry.speciesId,
          occupation: entry.occupation,
          birthTickBucket: entry.birthTick ?? 0,
        },
        entry.count,
      ),
    );
  }

  const byTick = new Map<number, UniversityAction[]>();
  for (const action of options.actions ?? []) {
    const existing = byTick.get(action.tick);
    if (existing === undefined) byTick.set(action.tick, [action]);
    else existing.push(action);
  }

  const counters = new ClampCounters();
  const refusals = new AdmissionRefusals();
  const residents: EntityHandle[] = [];
  const depthCeiling = options.depthCeiling ?? DEFAULT_DEPTH_CEILING;

  let materials = options.economy.materials;
  let hosted = 0;
  let admittedTotal = 0;
  let completedOnTick: number | undefined;
  let scribeMonths = 0;
  let scribeMonthsTotal = 0;
  let materialsSpentTotal = 0;
  let upkeepShortfallTotal = 0;
  let degradedInstancesTotal = 0;
  const log: TickRecord[] = [];

  for (let tick = 1; tick <= options.ticks; tick += 1) {
    materials += options.economy.income ?? 0;
    const row = readRecord(state, UNIVERSITY, handle);

    // ---- the world acts on the institution ------------------------------
    let admitted = 0;
    let refused = 0;
    for (const action of byTick.get(tick) ?? []) {
      switch (action.kind) {
        case 'apply': {
          const outcome = admitStudents(row, hosted, action.count);
          hosted = outcome.hosted;
          admitted += outcome.admitted;
          refused += outcome.refused;
          refusals.record(handle, outcome.refused);
          break;
        }
        case 'graduate':
          hosted = Math.max(0, hosted - action.count);
          break;
        case 'shelve':
          shelveInstance(state, library, action.nodeId, tick);
          break;
        case 'learn': {
          const mage = mageOf(state, residents, action.mage);
          attachRecord(state, KNOWLEDGE_INSTANCE, state.entities.create(), {
            nodeId: action.nodeId,
            locationKind: LOCATION_KIND.mind,
            locationId: mage,
            acquiredTick: tick,
            mastery: FP_ONE,
          });
          break;
        }
        case 'staff': {
          const cohort = requireCohort(named, action.cohort);
          staffUniversity(state, handle, cohort);
          break;
        }
        case 'unstaff': {
          const cohort = requireCohort(named, action.cohort);
          unstaffUniversity(state, handle, cohort);
          break;
        }
        case 'fund': {
          const store = componentOf(state, UNIVERSITY);
          store.set(handle, 'buildProgress', Math.min(row.buildProgress + action.progress, FP_ONE));
          row.buildProgress = store.get(handle, 'buildProgress');
          break;
        }
      }
    }
    admittedTotal += admitted;

    // ---- scribing, from this university's own staff ----------------------
    scribeMonths = scribingThroughput(row, {
      scribeCount: staffedScribes(state, cohorts, handle),
      scribeAffinity: options.economy.scribeAffinity,
      scribeRate: options.scribeRate,
      scribeRateBonuses: [],
      counters,
    });
    scribeMonthsTotal += scribeMonths;

    // ---- construction ----------------------------------------------------
    const outcome = advanceConstruction(row, {
      laborMonths: options.economy.laborMonths,
      laborAffinity: options.economy.laborAffinity,
      materials,
      buildRate: options.buildRate,
      buildRateBonuses: [],
      counters,
    });
    materials -= outcome.materialsSpent;
    materialsSpentTotal += outcome.materialsSpent;
    componentOf(state, UNIVERSITY).set(handle, 'buildProgress', row.buildProgress);
    if (outcome.completed && completedOnTick === undefined) completedOnTick = tick;

    // ---- library upkeep --------------------------------------------------
    const depth = libraryDepth(state, library, options.tierOf);
    const upkeep = applyLibraryUpkeep([{ handle: library, depth }], materials);
    materials = upkeep.materialsRemaining;
    const shortfall = upkeep.outcomes[0]?.shortfall ?? 0;
    const degraded = upkeep.outcomes[0]?.degradedInstances ?? 0;
    upkeepShortfallTotal += shortfall;
    degradedInstancesTotal += degraded;

    log.push({
      tick,
      buildProgress: row.buildProgress,
      progressAdded: outcome.progressAdded,
      materialsSpent: outcome.materialsSpent,
      labourStalled: outcome.labourStalled,
      hosted,
      admitted,
      refused,
      scribeMonths,
      upkeepShortfall: shortfall,
      materialsRemaining: materials,
    });
  }

  const finalRow: UniversityRecord = readRecord(state, UNIVERSITY, handle);
  const depth = libraryDepth(state, library, options.tierOf);
  const profile = universityProfile(state, {
    library,
    residentMages: residents,
    cellOf: options.cellOf,
  });

  return {
    handle,
    library,
    buildProgress: finalRow.buildProgress,
    complete: isComplete(finalRow),
    completedOnTick,
    designedCapacity: finalRow.capacity,
    effectiveCapacity: effectiveCapacity(finalRow),
    hosted,
    admittedTotal,
    refusedTotal: refusals.at(handle),
    staffCohorts: staffCohortsOf(state, handle),
    scribeMonths,
    scribeMonthsTotal,
    depth,
    shelvedNodes: depth.distinctNodes,
    libraryContribution: contributionFor(depth, depthCeiling),
    profile,
    dominantCell: dominantCell(profile),
    materialsRemaining: materials,
    materialsSpentTotal,
    upkeepShortfallTotal,
    degradedInstancesTotal,
    log,
    state,
  };
}

/** Scribes on this university's own staff. Zero for an unstaffed university. */
function staffedScribes(state: SimState, cohorts: CohortStore, university: EntityHandle): number {
  let scribes = 0;
  for (const cohort of staffCohortsOf(state, university)) {
    if (!cohorts.isLive(cohort)) continue;
    if (cohorts.keyOf(cohort).occupation !== OCCUPATION.scribe) continue;
    scribes += cohorts.countOf(cohort);
  }
  return scribes;
}

function shelveInstance(
  state: SimState,
  library: EntityHandle,
  nodeId: ContentId,
  tick: number,
): void {
  attachRecord(state, KNOWLEDGE_INSTANCE, state.entities.create(), {
    nodeId,
    locationKind: LOCATION_KIND.library,
    locationId: library,
    acquiredTick: tick,
    mastery: FP_ONE,
  });
}

/** A resident mage handle, created on first mention. Index, not handle, in the script. */
function mageOf(state: SimState, residents: EntityHandle[], index: number): EntityHandle {
  while (residents.length <= index) residents.push(state.entities.create());
  return residents[index] as EntityHandle;
}

function requireCohort(named: Map<string, EntityHandle>, name: string): EntityHandle {
  const found = named.get(name);
  if (found === undefined) throw new Error(`no roster cohort named "${name}"`);
  return found;
}
