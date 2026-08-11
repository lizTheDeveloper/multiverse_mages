/*
 * Multiverse Mages — assembling one mage's situation from both halves of the
 * rules.
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
 * A `MageOutlook` is the one thing the utility-AI reads, and it deliberately
 * cannot be built inside `@mm/rules-world`: half of it — the research frontier,
 * what someone could teach her, what she could write down — is `@mm/rules-magic`
 * arithmetic reached across the port. So it is built here, once per mage per
 * evaluation, and everything downstream of it is arithmetic over the result.
 *
 * Two properties of the outlook type carry through to this file, and both are
 * requirements rather than style:
 *
 * - **Nothing here reads or computes a position.** `contracts.md` §0 gives
 *   world-scale entities no coordinates, and the outlook has no field to put one
 *   in. Teacher availability is a fact about willingness, never proximity.
 * - **Nothing here is cached into state.** §1.5's "existence is derived, never
 *   cached" applies to everything derived from knowledge, and an outlook is
 *   rebuilt per evaluation rather than stored.
 */

import type { SpeciesRecord } from '@mm/content';
import type { Fixed, SimState } from '@mm/sim-core';
import type { Handle, MageRecord, MageRoleValue } from '@mm/state';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  UNIVERSITY,
  collectRecords,
  componentOf,
} from '@mm/state';
import type { KnowledgeTarget, MageOutlook } from '@mm/rules-world';
import { ageInMonths, boundCandidates, gatherFrontier, normalizedAge } from '@mm/rules-world';

import type { CoordinatingKnowledgeGateway } from './gateway.js';

/** Everything an outlook needs beyond the mage's own row. */
export interface OutlookDeps {
  readonly state: SimState;
  readonly gateway: CoordinatingKnowledgeGateway;
  readonly worldTick: number;
  /** The species record behind a species id, or `undefined` for an unknown one. */
  readonly speciesOf: (speciesId: number) => SpeciesRecord | undefined;
  /** The mage's effective lifespan in months, recomputed this tick. */
  readonly effectiveLifespanOf: (mage: Handle, row: MageRecord, species: SpeciesRecord) => number;
  /** The universe's materials stock, `fp`. */
  readonly materials: Fixed;
  /** Scribe-months her university produces this tick, `fp`. `0` if unaffiliated. */
  readonly scribeThroughputOf: (universityId: Handle) => Fixed;
  /** The tier of a node, for the scribable list. */
  readonly tierOf: (nodeId: number) => number;
  /**
   * The university this mage would rather be at, given the one she is at.
   *
   * Supplied rather than computed per mage, because the answer depends on one
   * scan of every shelved instance in the universe and that scan is the same for
   * everybody. Building it per mage made the outlook phase
   * `mages × instances` — free while nothing was ever shelved, and quadratic
   * from the first grimoire. {@link universityPreference} builds it once.
   */
  readonly preferredUniversityFor: (current: Handle) => Handle;
}

/**
 * One mage's situation, or `undefined` when this layer cannot describe her.
 *
 * `undefined` rather than a default outlook: a mage whose species id resolves to
 * nothing has no traits to score against, and a defaulted species would have her
 * make decisions from numbers no author wrote.
 */
export function buildOutlook(
  mage: Handle,
  row: MageRecord,
  deps: OutlookDeps,
): MageOutlook | undefined {
  const species = deps.speciesOf(row.speciesId);
  if (species === undefined) return undefined;

  const frontier = gatherFrontier(deps.gateway, mage, species);
  const lifespanMonths = deps.effectiveLifespanOf(mage, row, species);

  const preferred = deps.preferredUniversityFor(row.universityId);

  return {
    mage,
    species,
    personality: { curiosity: row.curiosity, ambition: row.ambition, caution: row.caution },
    roleId: row.roleId as MageRoleValue,
    normalizedAge: normalizedAge(ageInMonths(deps.worldTick, row.birthTick), lifespanMonths),
    universityId: row.universityId,

    discoveryTargets: frontier.discovery,
    rediscoveryTargets: frontier.rediscovery,
    teachableToMe: boundCandidates(teachableToMe(mage, deps), species),
    teachableByMe: boundCandidates(teachableByMe(mage, deps), species),
    scribableTargets: boundCandidates(scribableBy(mage, deps), species),

    materials: deps.materials,
    scribeThroughput: deps.scribeThroughputOf(row.universityId),
    betterAffiliationAvailable: preferred !== row.universityId,
    preferredUniversity: preferred,

    // Zero at 0.4.0, and fed as inputs rather than computed here so that
    // `raid-engagement` supplies a number instead of amending the goal set.
    wardPressure: 0,
    raidPressure: 0,
  };
}

/**
 * Nodes a living, willing holder could teach this mage.
 *
 * The counterparty scan is the gateway's, and bounded there. Each answer is one
 * node — the lowest the pair admits — so the list is at most one entry per
 * counterparty, ascending by node id after the caller's sort.
 */
function teachableToMe(mage: Handle, deps: OutlookDeps): KnowledgeTarget[] {
  const found = new Map<number, KnowledgeTarget>();
  for (const teacher of deps.gateway.livingMages()) {
    if (teacher === mage) continue;
    const nodeId = deps.gateway.teachableTo(teacher, mage);
    if (nodeId === undefined || found.has(nodeId)) continue;
    found.set(nodeId, {
      nodeId,
      tier: deps.tierOf(nodeId),
      // Teaching is cheaper than research by construction (`contracts.md` §2.3
      // authors `teachCost` below `researchCost`), and what the utility-AI needs
      // here is the pair's cost rather than the learner's solo cost.
      remainingCost: deps.gateway.teachCostOf(nodeId),
    });
  }
  return [...found.values()];
}

/** Nodes this mage could pass to a student who can receive them. */
function teachableByMe(mage: Handle, deps: OutlookDeps): KnowledgeTarget[] {
  const found = new Map<number, KnowledgeTarget>();
  for (const student of deps.gateway.livingMages()) {
    if (student === mage) continue;
    const nodeId = deps.gateway.teachableTo(mage, student);
    if (nodeId === undefined || found.has(nodeId)) continue;
    found.set(nodeId, {
      nodeId,
      tier: deps.tierOf(nodeId),
      remainingCost: deps.gateway.teachCostOf(nodeId),
    });
  }
  return [...found.values()];
}

/** Nodes this mage holds that her tradition would let her commit to a book. */
function scribableBy(mage: Handle, deps: OutlookDeps): KnowledgeTarget[] {
  const found: KnowledgeTarget[] = [];
  const seen = new Set<number>();
  for (const nodeId of deps.gateway.heldNodes(mage)) {
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    const target = deps.gateway.scribableBy(mage, nodeId);
    if (target !== undefined) found.push(target);
  }
  return found;
}

/**
 * The university this mage would move to, or the one she is already in.
 *
 * **A placeholder policy, and marked as one.** "Better" is measured as a deeper
 * library, counted in shelved instances, among completed universities only —
 * because library depth is the one institutional quantity `mages-and-species`
 * actually defines, and `universities` deliberately leaves specialization
 * emergent rather than declared. Ties fall to the lower handle, which is a total
 * order that depends on nothing but the state. **Untuned**, like every other
 * magnitude before 0.5.0.
 *
 * Returning her current affiliation when nothing is better is what makes
 * `betterAffiliationAvailable` false without a second computation that could
 * disagree with this one.
 */
export function universityPreference(state: SimState): (current: Handle) => Handle {
  const shelvedBy = new Map<Handle, number>();
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (row.locationKind !== LOCATION_KIND.library) continue;
    shelvedBy.set(row.locationId, (shelvedBy.get(row.locationId) ?? 0) + 1);
  }

  const universities = componentOf(state, UNIVERSITY);
  const libraryIds = universities.field('libraryId');
  const buildProgress = universities.field('buildProgress');

  // Collected once, ascending by handle, so the walk below is over a list and
  // not over the component — and so the tie-break reads as the declared order it
  // is rather than as a property of `forEach`.
  const completed: { handle: Handle; depth: number }[] = [];
  universities.forEach((row, handle) => {
    if ((buildProgress[row] as number) < FP_ONE) return;
    completed.push({ handle, depth: shelvedBy.get(libraryIds[row] as number) ?? 0 });
  });

  return (current: Handle): Handle => {
    let best = current;
    let bestDepth = current === 0 ? -1 : (shelvedBy.get(libraryDepthKey(state, current)) ?? 0);
    for (const entry of completed) {
      if (entry.depth > bestDepth || (entry.depth === bestDepth && best !== 0 && entry.handle < best)) {
        best = entry.handle;
        bestDepth = entry.depth;
      }
    }
    return best;
  };
}

/** The library handle a university owns, or `0`. */
function libraryDepthKey(state: SimState, university: Handle): Handle {
  const universities = componentOf(state, UNIVERSITY);
  if (!universities.has(university)) return 0;
  return universities.get(university, 'libraryId');
}

/** `fp(1.0)` — `buildProgress` at which a university is complete (`contracts.md` §1.4). */
const FP_ONE = 1024;
