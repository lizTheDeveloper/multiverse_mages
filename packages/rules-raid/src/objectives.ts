/*
 * Multiverse Mages — what a raid is for, generated from what the defender has.
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
 * Objectives: libraries, universities, and archmages, drawn from the defender's
 * own world state on **stream 10** and never invented.
 *
 * ## The four statuses are four different consequences
 *
 * `contracts.md` §1.6 insists on the distinction and gives the reason in six
 * words: *a looted library still stands, a burned one does not*. Held, captured,
 * looted, destroyed are therefore four members of an enumeration rather than one
 * "taken" flag with a side channel, and the write-back reads them as four
 * different instructions:
 *
 * - **held** — the defender loses nothing to this objective.
 * - **captured** — the attacker held the ground and took nothing off it.
 * - **looted** — grimoires and their instances *move* to the raider.
 * - **destroyed** — instances are *gone*, and nobody gains them.
 *
 * ## Value is what is at stake, and it is the victory condition's denominator
 *
 * A library's value counts the instances it holds and their depth; a university
 * has a flat value of its own; an archmage is worth what an archmage is worth.
 * Every coefficient is content and every one is untuned. The attacker wins by
 * taking a *fraction* of the total on the field rather than an absolute, so that
 * a poor universe is not unraidable and a rich one is not free.
 */

import type { ContentId } from '@mm/content';
import type { EntityHandle, Fixed, RngSource, SimState } from '@mm/sim-core';
import { RNG_STREAM, floorDiv, nextBounded } from '@mm/sim-core';
import type { Handle } from '@mm/state';
import {
  LOCATION_KIND,
  OBJECTIVE,
  OBJECTIVE_STATUS,
  UNIVERSITY,
  attachRecord,
  collectRecords,
  componentOf,
} from '@mm/state';
import type { MagicGrid } from '@mm/rules-magic';

import type { Point } from './geometry.js';
import type { TerrainGrid } from './terrain.js';
import type { RaidTuning } from './tuning.js';

/**
 * The objective kinds, named here because `contracts.md` §1.6 deliberately does
 * not name them — it gives an objective a `uint8` `kind` and leaves the values
 * to this change. `0` stays the reserved null.
 */
export const OBJECTIVE_KIND = {
  library: 1,
  university: 2,
  archmage: 3,
} as const;

export type ObjectiveKindValue = (typeof OBJECTIVE_KIND)[keyof typeof OBJECTIVE_KIND];

/** The working state of one objective; the row carries what §1.6 declares. */
export interface ObjectiveBrief {
  readonly handle: EntityHandle;
  readonly kind: ObjectiveKindValue;
  /** Handle into the **defender's** world state. Always a live entity. */
  readonly targetId: Handle;
  readonly position: Point;
  readonly value: Fixed;
  /** For a library objective, the library's own handle. `0` otherwise. */
  readonly libraryId: Handle;
  /** Progress toward the current interaction, `fp(1024)` completing it. */
  progress: Fixed;
  /** {@link OBJECTIVE_STATUS}. */
  status: number;
  /** The combatant that took it, or `0`. */
  capturedBy: Handle;
}

/** What the host universe has that is worth crossing a portal for. */
export interface ObjectiveSources {
  /** Universities, with the library each holds and how deep it is. */
  readonly universities: readonly {
    readonly handle: Handle;
    readonly libraryId: Handle;
    readonly instanceCount: number;
    readonly tierSum: number;
  }[];
  /** The defender's deepest living mage, or `0`. */
  readonly archmage: Handle;
  readonly archmageTier: number;
}

/**
 * Reads what the defender has, without inventing anything.
 *
 * Every candidate resolves to a live entity in the host's world — the spec's
 * *"no objective is invented without a world-state referent"* — and the
 * ordering is by handle so that two peers reading the same world produce the
 * same candidate list.
 */
export function readObjectiveSources(
  world: SimState,
  instancesAtLibrary: (library: Handle) => readonly Handle[],
  instanceNode: (instance: Handle) => ContentId,
  archmage: { readonly handle: Handle; readonly tier: number },
  grid: MagicGrid,
): ObjectiveSources {
  const universities = collectRecords(world, UNIVERSITY)
    .map((entry) => {
      const libraryId = entry.row.libraryId;
      let instanceCount = 0;
      let tierSum = 0;
      if (libraryId !== 0) {
        for (const instance of instancesAtLibrary(libraryId)) {
          const nodeId = instanceNode(instance);
          instanceCount += 1;
          tierSum += grid.hasNode(nodeId) ? grid.tierOf(nodeId) : 0;
        }
      }
      return { handle: entry.handle, libraryId, instanceCount, tierSum };
    })
    .sort((a, b) => a.handle - b.handle);

  return { universities, archmage: archmage.handle, archmageTier: archmage.tier };
}

/**
 * A library's value: what it holds, and how deep.
 *
 * Both terms, because breadth and depth are different things to lose and the
 * spec asks that *"the deeper library carries the higher objective value"* for
 * two libraries holding the same count. Untuned.
 */
export function libraryValue(tuning: RaidTuning, instanceCount: number, tierSum: number): Fixed {
  return tuning.objectiveValuePerInstance * instanceCount + tuning.objectiveValuePerTier * tierSum;
}

/**
 * Generates the objectives, capped, and places them on the field.
 *
 * Placement is on stream 10 inside the defender's half, clamped to passable
 * ground. Ordering is by value — the most valuable first — so that the cap takes
 * *what is worth taking* rather than whatever the world store enumerated first.
 * A cap by iteration order is the trap `CLAUDE.md` names: bound the work by a
 * rule, never by an index range.
 *
 * A universe with nothing to take yields no objectives, and that is a legal
 * raid: it terminates on portal collapse with a defender victory, because the
 * attacker cannot reach a threshold over a total of zero.
 */
export function generateObjectives(
  engagement: SimState,
  sources: ObjectiveSources,
  tuning: RaidTuning,
  terrain: TerrainGrid,
  rng: RngSource,
): ObjectiveBrief[] {
  interface Candidate {
    readonly kind: ObjectiveKindValue;
    readonly targetId: Handle;
    readonly libraryId: Handle;
    readonly value: Fixed;
  }

  const candidates: Candidate[] = [];
  for (const university of sources.universities) {
    if (university.libraryId !== 0) {
      candidates.push({
        kind: OBJECTIVE_KIND.library,
        targetId: university.libraryId,
        libraryId: university.libraryId,
        value: libraryValue(tuning, university.instanceCount, university.tierSum),
      });
    }
    candidates.push({
      kind: OBJECTIVE_KIND.university,
      targetId: university.handle,
      libraryId: university.libraryId,
      value: tuning.universityObjectiveValue,
    });
  }
  if (sources.archmage !== 0) {
    candidates.push({
      kind: OBJECTIVE_KIND.archmage,
      targetId: sources.archmage,
      libraryId: 0,
      value: tuning.archmageObjectiveValue,
    });
  }

  // Most valuable first; ties broken on kind then on the world handle, both of
  // which are stable facts about the defender rather than about iteration.
  candidates.sort((a, b) => b.value - a.value || a.kind - b.kind || a.targetId - b.targetId);

  const briefs: ObjectiveBrief[] = [];
  const taken = candidates.slice(0, tuning.maxObjectivesPerRaid);
  taken.forEach((candidate, ordinal) => {
    const position = placeInDefenderHalf(ordinal, tuning, terrain, rng);
    const handle = engagement.entities.create();
    attachRecord(engagement, OBJECTIVE, handle, {
      kind: candidate.kind,
      targetId: candidate.targetId,
      x: position.x,
      y: position.y,
      valueFp: candidate.value,
      statusKind: OBJECTIVE_STATUS.held,
      capturedBy: 0,
    });
    briefs.push({
      handle,
      kind: candidate.kind,
      targetId: candidate.targetId,
      position,
      value: candidate.value,
      libraryId: candidate.libraryId,
      progress: 0,
      status: OBJECTIVE_STATUS.held,
      capturedBy: 0,
    });
  });

  return briefs;
}

/**
 * A place in the defender's half, on passable ground.
 *
 * Keyed on the objective's ordinal rather than walked down one stream, so that
 * adding a seventh objective kind later does not move where the first six
 * stand. The fallback after a bounded number of attempts is the field's centre
 * clamped to passability — a bounded search, because an unbounded one on a map
 * that happened to be mostly rock is a raid that never starts.
 */
function placeInDefenderHalf(
  ordinal: number,
  tuning: RaidTuning,
  terrain: TerrainGrid,
  rng: RngSource,
): Point {
  const stream = rng.actorStream(RNG_STREAM.objectives, 0, ordinal);
  const half = floorDiv(tuning.battlefieldExtent, 2);
  const near = tuning.battlefieldExtent - tuning.deploymentZoneDepth;

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const point: Point = {
      x: nextBounded(stream, tuning.battlefieldExtent),
      y: near + nextBounded(stream, tuning.deploymentZoneDepth),
    };
    if (terrain.passableAt(point)) return point;
  }
  return { x: half, y: near };
}

/** Writes a brief's mutable half back onto its `contracts.md` §1.6 row. */
export function syncObjectiveRow(engagement: SimState, brief: ObjectiveBrief): void {
  const store = componentOf(engagement, OBJECTIVE);
  store.set(brief.handle, 'statusKind', brief.status);
  store.set(brief.handle, 'capturedBy', brief.capturedBy);
}

/** Total value on the field. The denominator of the victory condition. */
export function totalObjectiveValue(objectives: readonly ObjectiveBrief[]): Fixed {
  let total = 0;
  for (const objective of objectives) total += objective.value;
  return total;
}

/** Value the attacker has taken: captured, looted, or destroyed all count. */
export function takenObjectiveValue(objectives: readonly ObjectiveBrief[]): Fixed {
  let total = 0;
  for (const objective of objectives) {
    if (objective.status !== OBJECTIVE_STATUS.held) total += objective.value;
  }
  return total;
}

/** Whether every objective has been resolved, one of the termination clauses. */
export function allObjectivesResolved(objectives: readonly ObjectiveBrief[]): boolean {
  if (objectives.length === 0) return false;
  return objectives.every((objective) => objective.status !== OBJECTIVE_STATUS.held);
}

/** Whether this objective's contents can be burned or taken at all. */
export function objectiveHoldsKnowledge(brief: ObjectiveBrief): boolean {
  return brief.kind === OBJECTIVE_KIND.library && brief.libraryId !== 0;
}

/** The location kind an objective's knowledge sits at, for the write-back. */
export const OBJECTIVE_LOCATION_KIND = LOCATION_KIND.library;
