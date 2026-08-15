/*
 * Multiverse Mages — how much of the seventy-cell grid each species can staff,
 * derived from loaded content.
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
 * ## Why this lives in `scenario` and not in `mc-harness`
 *
 * `mc-harness` depends on `@mm/agent-api` and nothing else — `package.json` says
 * so and `package-boundaries.test.ts` enforces it — so it cannot read a species
 * record or the node catalogue. The metric's *definition* belongs beside the
 * other metric definitions; the derivation has to happen where the content is.
 * The result crosses as a {@link SpeciesVersatilitySample}, exactly the way
 * `speciesIds` already does.
 *
 * ## No RNG, no state, no tick
 *
 * Everything here is a pure function of loaded content and a ruleset mask.
 * Running it takes no draw from any stream, which is what keeps a measurement
 * from perturbing the run it measures.
 */

import type { ContentRegistry, NodeRecord, SpeciesRecord } from '@mm/content';
import type { SpeciesGridReach, SpeciesVersatilitySample } from '@mm/mc-harness';
import { DEFAULT_TEACH_THRESHOLD, MASTERY_MAX, masteryDecayPerTick } from '@mm/rules-magic';
import type { Ruleset } from '@mm/state';
import { permits } from '@mm/state';

/**
 * World ticks a species keeps a fully-mastered node transmissible.
 *
 * `floor((MASTERY_MAX − DEFAULT_TEACH_THRESHOLD) / masteryDecayPerTick(retention))`.
 *
 * ## What this number was, and what it is now
 *
 * It was written as *the* number separating the species, and at the time it
 * was: nothing in the rules path raised mastery. `setMastery` had exactly one
 * non-test caller — `rules-magic`'s decay pass — and it only ever lowered.
 * Research created an instance at `DEFAULT_INITIAL_MASTERY` (256), below the
 * 512 teach threshold, and it could never climb. Every teachable instance in a
 * universe descended from a god's founding grant at 1024 and was sliding toward
 * the species' retention floor, which for all six shipped species is *also*
 * below 512.
 *
 * `rules-magic`'s `practice` (`w196/mastery-rises`) is the operation that
 * climbs, so "can this species staff a cell" now turns on **two** things: how
 * far it can climb, which is `practiceCeiling(tier, depthCeiling)` and is a
 * question about *reach*, and how long it holds what it was handed, which is
 * this window and is a question about *retention*. This function still answers
 * only the second, from full mastery, deliberately — see `constants.ts`'
 * `PRACTICE_CEILING_BASE` for why the two spans are kept apart.
 */
export function teachableWindowTicks(retention: number): number {
  const headroom = MASTERY_MAX - DEFAULT_TEACH_THRESHOLD;
  if (headroom <= 0) return 0;
  return Math.floor(headroom / masteryDecayPerTick(retention));
}

/**
 * Node ids a species could ever legally hold, as a transitive closure.
 *
 * A node is reachable when its tier is at or below the species' `depthCeiling`
 * **and** every one of its prerequisites is itself reachable. The fixed point is
 * taken over the whole catalogue rather than within a cell, because 36 of the
 * 292 authored prerequisite edges cross cells and a per-cell closure would treat
 * those prerequisites as free.
 *
 * The depth comparison mirrors `coordination`'s gateway exactly —
 * `node.tier > depthCeiling` refuses — so this predicate and the live legality
 * gate cannot disagree about a tier.
 */
export function reachableNodeIds(
  nodes: readonly NodeRecord[],
  depthCeiling: number,
): ReadonlySet<string> {
  const reachable = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of nodes) {
      if (reachable.has(node.id)) continue;
      if (node.tier > depthCeiling) continue;
      if (!node.prerequisites.every((id) => reachable.has(id))) continue;
      reachable.add(node.id);
      grew = true;
    }
  }
  return reachable;
}

/** One species' reach, given the catalogue and which cells the ruleset permits. */
function reachOf(
  species: SpeciesRecord,
  nodes: readonly NodeRecord[],
  cellsById: ReadonlyMap<string, { readonly form: string; readonly permitted: boolean }>,
  nodesByCell: ReadonlyMap<string, readonly NodeRecord[]>,
  permittedForms: ReadonlySet<string>,
): SpeciesGridReach {
  const reachable = reachableNodeIds(nodes, species.depthCeiling);

  let staffable = 0;
  let staffableEnabled = 0;
  let exhaustible = 0;
  let exhaustibleEnabled = 0;

  for (const [cellId, cellNodes] of nodesByCell) {
    const cell = cellsById.get(cellId);
    if (cell === undefined || cellNodes.length === 0) continue;

    // Staffable: some node in the cell is reachable at all.
    if (cellNodes.some((node) => reachable.has(node.id))) {
      staffable += 1;
      if (cell.permitted) staffableEnabled += 1;
    }
    // Exhaustible: the cell's deepest node is reachable. Carried for contrast —
    // this is the depth question, and the two disagreeing is the finding.
    const deepest = cellNodes.reduce((a, b) => (b.tier > a.tier ? b : a));
    if (reachable.has(deepest.id)) {
      exhaustible += 1;
      if (cell.permitted) exhaustibleEnabled += 1;
    }
  }

  let live = 0;
  let inert = 0;
  for (const key of Object.keys(species.affinities).sort()) {
    // A key is a cell id or a form id — `resolveSpeciesAffinities` tries cell
    // first — and "live" means some permitted cell is influenced by it.
    const asCell = cellsById.get(key);
    const isLive = asCell === undefined ? permittedForms.has(key) : asCell.permitted;
    if (isLive) live += 1;
    else inert += 1;
  }

  return {
    speciesId: species.id,
    depthCeiling: species.depthCeiling,
    staffableCells: staffable,
    staffableEnabledCells: staffableEnabled,
    exhaustibleCells: exhaustible,
    exhaustibleEnabledCells: exhaustibleEnabled,
    teachableWindowTicks: teachableWindowTicks(species.retention),
    inertAffinityEntries: inert,
    liveAffinityEntries: live,
  };
}

/**
 * The whole grid-reach measurement for one loaded content set and one ruleset.
 *
 * @param ruleset - The universe's permitted axes and edicts. The `enabledCells`
 * denominator is whatever `permits()` accepts, never a hardcoded twelve: a
 * universe whose god has forbidden a form has fewer, and a coverage fraction
 * read against the wrong denominator is wrong while still looking plausible.
 */
export function speciesVersatility(
  registry: ContentRegistry,
  ruleset: Ruleset,
): SpeciesVersatilitySample {
  const nodes = registry.nodes.map((entry) => entry.record);

  const nodesByCell = new Map<string, NodeRecord[]>();
  for (const node of nodes) {
    let bucket = nodesByCell.get(node.cell);
    if (bucket === undefined) {
      bucket = [];
      nodesByCell.set(node.cell, bucket);
    }
    bucket.push(node);
  }

  const cellsById = new Map<string, { form: string; permitted: boolean }>();
  const permittedForms = new Set<string>();
  let enabledCells = 0;
  for (const entry of registry.cells) {
    const permitted = permits(ruleset, entry.contentId);
    cellsById.set(entry.record.id, { form: entry.record.form, permitted });
    if (permitted) {
      enabledCells += 1;
      permittedForms.add(entry.record.form);
    }
  }

  return {
    gridCells: registry.cells.length,
    enabledCells,
    species: registry.species.map((entry) =>
      reachOf(entry.record, nodes, cellsById, nodesByCell, permittedForms),
    ),
  };
}
