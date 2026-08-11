/*
 * Multiverse Mages — what a university is good at, derived and never written
 * down.
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

import type { EntityHandle, SimState } from '@mm/sim-core';
import type { ContentId } from '@mm/content';
import { KNOWLEDGE_INSTANCE, LOCATION_KIND, collectRecords } from '@mm/state';

/**
 * ## Vision §13's open question, answered by having no field
 *
 * `mages-and-species/design.md` resolves it: *"universities have no declared
 * specialization; specialization is emergent from library contents and staff
 * knowledge."* Three reasons, in the design's own order of force — it removes a
 * content axis the Monte Carlo harness would have to sweep; it removes the
 * possibility of a university *declared* as an institution of one kind whose
 * library holds nothing of the sort; and decisively, `contracts.md` §4.1 fixes
 * the `institutions` observation block at four slots, so a declared
 * specialization over seventy cells would need seventy more and resizing a
 * fixed observation vector invalidates every trained agent.
 *
 * And the consequence the design cares about most: *"Emergent specialization
 * means the fire takes the identity with it."* A raided university with a
 * `specializationCellId` would still *be* an institution of that kind with an
 * empty shelf. This one stops being anything.
 *
 * ## Derived on demand, cached nowhere
 *
 * The spec: *"MUST be derived on demand … and MUST NOT be cached in state."*
 * The same rule `contracts.md` §1.5 states for node existence, for the same
 * reason: a cached derivation is a second source of truth that is correct until
 * the first code path forgets to invalidate it, and the symptom is a library
 * that was burned last year still making its university good at something.
 *
 * `universities-no-specialization.test.ts` scans the university component
 * layout for a specialization, focus, or preferred-cell field, so the absence
 * is checked rather than merely intended.
 */

/** One cell's weight in a derived profile. */
export interface ProfileEntry {
  readonly cellId: ContentId;
  /** Distinct nodes of that cell held or known. Never normalized: raw counts. */
  readonly weight: number;
}

/** A university's character, as of right now. */
export interface UniversityProfile {
  /** Cells with a non-zero weight, descending by weight then ascending by id. */
  readonly cells: readonly ProfileEntry[];
  /** Distinct nodes counted, across the library and the resident mages. */
  readonly distinctNodes: number;
}

/** A node's cell, supplied by the caller because the node graph is content. */
export type CellLookup = (nodeId: ContentId) => ContentId;

/**
 * Derives what a university is good at from its library and its residents.
 *
 * @param residentMages - Handles of the mages affiliated with this university.
 * Supplied rather than searched for, because affiliation is a field on the mage
 * and walking every mage in the universe per profile call is the scan the
 * fixed-size relevance array exists to avoid elsewhere.
 * @returns An empty profile for a university whose library was destroyed and
 * whose residents know nothing — which is the spec's scenario, and the point:
 * no residual specialization survives the loss.
 */
export function universityProfile(
  state: SimState,
  options: {
    library: EntityHandle;
    residentMages: readonly EntityHandle[];
    cellOf: CellLookup;
  },
): UniversityProfile {
  const residents = new Set(options.residentMages);
  const weights = new Map<ContentId, number>();
  const seen = new Set<string>();

  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    const inLibrary =
      row.locationKind === LOCATION_KIND.library && row.locationId === options.library;
    const inAResident =
      (row.locationKind === LOCATION_KIND.mind || row.locationKind === LOCATION_KIND.palace) &&
      residents.has(row.locationId);
    if (!inLibrary && !inAResident) continue;

    // Distinct *nodes*, once each: a node shelved twice and also known by two
    // professors is one thing this university is good at, not four.
    const key = String(row.nodeId);
    if (seen.has(key)) continue;
    seen.add(key);

    const cellId = options.cellOf(row.nodeId);
    weights.set(cellId, (weights.get(cellId) ?? 0) + 1);
  }

  const cells = [...weights.entries()]
    .map(([cellId, weight]) => ({ cellId, weight }))
    // Descending weight, then ascending cell id. Both halves are declared:
    // `Map` iteration order here would depend on which instance was created
    // first, so two universities holding identical libraries reached by
    // different histories would report their character differently.
    .sort((a, b) => (b.weight === a.weight ? a.cellId - b.cellId : b.weight - a.weight));

  return { cells, distinctNodes: seen.size };
}

/**
 * The cell a university is most associated with, or `0` when it is associated
 * with none.
 *
 * `contracts.md` §0's absent reference, deliberately, rather than `undefined`:
 * a university with an empty library has no speciality, and that is a value
 * rather than a missing answer.
 */
export function dominantCell(profile: UniversityProfile): ContentId {
  return profile.cells[0]?.cellId ?? 0;
}
