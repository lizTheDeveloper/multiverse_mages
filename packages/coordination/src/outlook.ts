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
  componentOf,
} from '@mm/state';
import type { KnowledgeTarget, MageOutlook, SpeciesAffinities } from '@mm/rules-world';
import {
  MAX_CANDIDATE_TARGETS,
  ageInMonths,
  boundCandidates,
  gatherFrontier,
  normalizedAge,
  withinDepthCeiling,
} from '@mm/rules-world';

import type { CoordinatingKnowledgeGateway } from './gateway.js';
import type { NodeFacetResolver } from './node-facets.js';
import type { UniverseEffectIndex } from './universe-effects.js';

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
  /** A node's cell, form and effect primitives, for the target utility score. */
  readonly facetsOf: NodeFacetResolver;
  /**
   * A species' `affinities`, resolved onto interned ids.
   *
   * Supplied rather than computed per mage because it is a pure function of the
   * species record and the registry, and there are six species and potentially
   * thousands of mages. §6 counts *"technique/form affinities"* among the seven
   * things a species is tuned on; this callback is how the first rule that ever
   * read one gets to see it.
   */
  readonly affinitiesOf: (species: SpeciesRecord) => SpeciesAffinities;
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
  /**
   * The authored half of *"is this node worth casting at the world?"*, or
   * `undefined` on a build with no economy index wired.
   *
   * `undefined` is a real answer and not a failure: `world-fixtures.ts` builds a
   * loop with no `universeEffects`, and on such a build no node is applicable,
   * every mage's `applicableTargets` is empty, and `apply-magic` is masked for
   * everyone. That is exactly what a universe whose economy nobody connected
   * should do, and it is what keeps this change from silently altering a
   * fixture that never opted into an economy.
   */
  readonly universeEffects?: UniverseEffectIndex | undefined;
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
    affinities: deps.affinitiesOf(species),
    personality: { curiosity: row.curiosity, ambition: row.ambition, caution: row.caution },
    roleId: row.roleId as MageRoleValue,
    normalizedAge: normalizedAge(ageInMonths(deps.worldTick, row.birthTick), lifespanMonths),
    universityId: row.universityId,

    discoveryTargets: frontier.discovery,
    rediscoveryTargets: frontier.rediscovery,
    teachableToMe: boundCandidates(teachableToMe(mage, deps), species),
    teachableByMe: boundCandidates(teachableByMe(mage, deps), species),
    scribableTargets: boundCandidates(scribableBy(mage, deps), species),
    applicableTargets: boundCandidates(applicableBy(mage, deps), species),
    practiceTargets: practisableBy(mage, deps, species),

    materials: deps.materials,
    scribeThroughput: deps.scribeThroughputOf(row.universityId),
    betterAffiliationAvailable: preferred !== row.universityId,
    preferredUniversity: preferred,

    // Zero at 0.4.0, and fed as inputs rather than computed here so that
    // `raid-engagement` supplies a number instead of amending the goal set.
    wardPressure: 0,
    raidPressure: 0,

    staleHoldings: deps.gateway.staleHoldings(mage),
  };
}

/**
 * Nodes this mage holds that are worth keeping sharp, stalest first.
 *
 * ## The sort is the mechanic, and it is why `boundCandidates` is not used here
 *
 * Every other list on the outlook goes through `boundCandidates`, which filters
 * to the species depth ceiling, sorts by `compareTargets` — novel before cheap,
 * for the reason `candidates.ts` records — and truncates. Novelty is the right
 * order for a node she is trying to *acquire* and exactly the wrong one for a
 * node she is trying to *keep*: nothing she already holds is novel, so the
 * comparator would fall through to cost and the truncation would keep the nodes
 * she is closest to full on and drop the ones she has not touched in twenty
 * years. Those are `ages-of-magic.md` §2c's whole subject.
 *
 * So this bound sorts on **held mastery ascending** and truncates after that:
 * the stalest node survives, and `target-appeal.ts`' effort term chooses among
 * the survivors. The depth-ceiling filter is still applied, from the same shared
 * predicate rather than a second copy — she cannot hold a node above her
 * ceiling today, but a species retune could make that false and a filter that
 * only works because of a fact elsewhere is a filter waiting to be wrong. Ties
 * fall to the lower node id, a total order over content ids; `heldNodes` already
 * sorts, so this is a stable refinement of a declared order rather than a rescue
 * of an undeclared one.
 *
 * `boundCandidates` stays imported and used by the three lists above it, so a
 * reader comparing them can see that this one is deliberately different.
 */
function practisableBy(
  mage: Handle,
  deps: OutlookDeps,
  species: SpeciesRecord,
): readonly KnowledgeTarget[] {
  const found: { target: KnowledgeTarget; mastery: Fixed }[] = [];
  for (const nodeId of deps.gateway.heldNodes(mage)) {
    const target = deps.gateway.practisableBy(mage, nodeId);
    if (target === undefined) continue;
    if (!withinDepthCeiling(target, species)) continue;
    found.push({ target, mastery: deps.gateway.masteryOf(mage, nodeId) });
  }
  found.sort((a, b) => a.mastery - b.mastery || a.target.nodeId - b.target.nodeId);
  return found.slice(0, MAX_CANDIDATE_TARGETS).map((entry) => entry.target);
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
    const facets = deps.facetsOf(nodeId);
    found.set(nodeId, {
      nodeId,
      tier: deps.tierOf(nodeId),
      // Teaching is cheaper than research by construction (`contracts.md` §2.3
      // authors `teachCost` below `researchCost`), and what the utility-AI needs
      // here is the pair's cost rather than the learner's solo cost.
      remainingCost: deps.gateway.teachCostOf(nodeId),
      cellId: facets.cellId,
      formId: facets.formId,
      primitives: facets.primitives,
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
    const facets = deps.facetsOf(nodeId);
    found.set(nodeId, {
      nodeId,
      tier: deps.tierOf(nodeId),
      remainingCost: deps.gateway.teachCostOf(nodeId),
      cellId: facets.cellId,
      formId: facets.formId,
      primitives: facets.primitives,
    });
  }
  return [...found.values()];
}

/**
 * Nodes this mage holds that her tradition would let her commit to a book, and
 * that the universe can pay the parchment for.
 *
 * ## The affordability filter is here, not at the goal's mask
 *
 * `isFeasible` masks `scribe` when the stock is below *"the cost of the cheapest
 * available scribing"*, which is the right question for *may she scribe at all*
 * and the wrong one for *what should she scribe*. The two were the same question
 * only while the list was ordered by cost alone, because then the cheapest
 * target was also the chosen one.
 *
 * `candidates.ts` now orders novel-before-cheap, for the reason recorded there,
 * and that separates them: a mage could pass a mask on a cheap duplicate and
 * then commit to a novel treatise she cannot afford, spending months against a
 * requirement no tick can meet. Filtering here keeps the mask's promise and the
 * choice the same promise — and it is also what vision §6a describes, in the
 * clause materials exist for: *"a universe can be knowledge-rich and unable to
 * write any of it down."* A book beyond the stock is not a cheaper option, it is
 * not an option.
 *
 * The stock read is this tick's, before the work phase spends any of it, so two
 * mages deciding in the same tick are quoted the same number. What one of them
 * then takes is `contributeScribing`'s business, and a book that becomes
 * unaffordable between the decision and the desk waits at its requirement rather
 * than failing — which is the state the clause above is describing.
 */
function scribableBy(mage: Handle, deps: OutlookDeps): KnowledgeTarget[] {
  const found: KnowledgeTarget[] = [];
  const seen = new Set<number>();
  for (const nodeId of deps.gateway.heldNodes(mage)) {
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    const target = deps.gateway.scribableBy(mage, nodeId);
    if (target !== undefined && target.remainingCost <= deps.materials) found.push(target);
  }
  return found;
}

/**
 * Nodes this mage could spend the month **casting at the world**.
 *
 * The composition of the two halves of the applicability question, and neither
 * half is duplicated here. `castableNodes` is the gateway's — held at a mind or
 * palace, mastery at or above the activation threshold, cell permitted right
 * now. `appliedYieldOf` is the content index's — the node carries a
 * `resource-yield` effect at `target: "universe"` and its form routes to a
 * material. A node has to pass both to be worth a month.
 *
 * `remainingCost` is `0` for every entry, because there is no project to
 * finish: she already knows the node, and applying it is work she can do again
 * next month. That makes `compareTargets`' cost ordering fall straight through
 * to the appeal score, which is the right tie-break when every candidate is
 * equally *available* and they differ only in what they are good for.
 *
 * Ascending node id, from `castableNodes`, so the list a mage sees does not
 * depend on the order the instance component happened to be written in.
 */
function applicableBy(mage: Handle, deps: OutlookDeps): KnowledgeTarget[] {
  const index = deps.universeEffects;
  if (index === undefined) return [];
  const found: KnowledgeTarget[] = [];
  for (const nodeId of deps.gateway.castableNodes(mage)) {
    if (index.appliedYieldOf(nodeId) === undefined) continue;
    const facets = deps.facetsOf(nodeId);
    found.push({
      nodeId,
      tier: deps.tierOf(nodeId),
      remainingCost: 0,
      cellId: facets.cellId,
      formId: facets.formId,
      primitives: facets.primitives,
      libraryHolds: false,
    });
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
  // The two columns, not a record per instance: this counts shelved copies and
  // reads two of the five fields, and `collectRecords` would build an object
  // carrying all of them for every instance in the universe — tens of thousands
  // of them a tick, once the world has been running a while. Row order is not
  // even consulted; the result is a tally.
  const shelvedBy = new Map<Handle, number>();
  const instances = componentOf(state, KNOWLEDGE_INSTANCE);
  const locationKinds = instances.field('locationKind');
  const locationIds = instances.field('locationId');
  instances.forEach((row) => {
    if ((locationKinds[row] as number) !== LOCATION_KIND.library) return;
    const library = locationIds[row] as Handle;
    shelvedBy.set(library, (shelvedBy.get(library) ?? 0) + 1);
  });

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
