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
import { FP_ONE as FP_UNIT, floorDiv } from '@mm/sim-core';
import type { Handle, MageRecord, MageRoleValue } from '@mm/state';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  UNIVERSITY,
  componentOf,
} from '@mm/state';
import type {
  CellEmphasis,
  KnowledgeTarget,
  MageOutlook,
  SpeciesAffinities,
} from '@mm/rules-world';
import {
  ageInMonths,
  boundCandidates,
  gatherFrontier,
  normalizedAge,
} from '@mm/rules-world';

import type { CoordinatingKnowledgeGateway } from './gateway.js';
import type { NodeFacetResolver } from './node-facets.js';
import type { UniverseEffectIndex } from './universe-effects.js';
import type { WorkingDurations } from './standing-workings.js';
import { findWorking } from './standing-workings.js';
import { needsRenewal } from '@mm/rules-magic';

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
   * Which cells the god has encouraged, and how strongly, on this tick.
   *
   * A value rather than a callback, unlike its neighbours: it is one map for the
   * whole universe on one tick, already built and cached by `godEffectHooks`,
   * and every mage gets the identical one. A callback would invite a caller to
   * hand a different answer to two mages deciding in the same tick, which would
   * make an encouragement a private nudge instead of the public instruction it
   * is.
   */
  readonly emphasis: CellEmphasis;
  /**
   * Every node's authored working duration, or absent.
   *
   * Optional for the reason `universeEffects` is: a world built for a knowledge
   * test need not supply one, and without it `sustain-working` is masked for
   * every mage — exactly the behaviour every build before this change had, which
   * a test can assert against rather than discover.
   */
  readonly workingDurations?: WorkingDurations | undefined;
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
  // One walk for both halves of upkeep. Two would be two implementations of
  // *"which of her workings need a month"*, and they would eventually disagree
  // about the boundary — a goal that is masked while its own pressure term
  // reads maximal, or the reverse.
  const upkeep = upkeepFor(mage, deps);

  return {
    mage,
    species,
    affinities: deps.affinitiesOf(species),
    emphasis: deps.emphasis,
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
    practiceTargets: boundCandidates(practicableBy(mage, deps), species),
    sustainableTargets: boundCandidates(upkeep.targets, species),
    workingUrgency: upkeep.pressure,

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
 * Nodes a living holder could teach this mage, **or a book on her shelf could**.
 *
 * The counterparty scan is the gateway's, and bounded there. Each answer is one
 * node — the lowest the pair admits — so the list is at most one entry per
 * counterparty, ascending by node id after the caller's sort.
 *
 * `teachingRosterFor` rather than a universe-wide roster: this is the *decision*
 * half of the boundary and `studentFor` is the accrual half, and the two must
 * walk the same list or a mage commits to a lesson nobody turns up for. See
 * `gateway.ts`'s `teachingRosterFor` for why the container is the right scope
 * and why `0` is one of the containers.
 *
 * ## Why the archive is folded into this list rather than given a tenth goal
 *
 * `seek-teaching` is *"seek instruction"*, and a text is instruction. Reading it
 * that way costs nothing: the goal registry is untouched, so every balance
 * baseline stays comparable goal-for-goal, the appeal terms and the feasibility
 * mask keep working unchanged, and the agent action space does not grow.
 *
 * A tenth goal would have bought one thing this does not — a mage able to
 * *prefer* a book to a person — and the design wants the opposite preference.
 * `world-step.ts` tries the living teacher first and falls back to the shelf,
 * because *"scribing from a living holder beats scribing from a grimoire"* is
 * the same sentence read from the learner's end.
 */
function teachableToMe(mage: Handle, deps: OutlookDeps): KnowledgeTarget[] {
  const found = new Map<number, KnowledgeTarget>();
  for (const teacher of deps.gateway.teachingRosterFor(mage)) {
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
  for (const nodeId of deps.gateway.readableToMe(mage)) {
    if (found.has(nodeId)) continue;
    const facets = deps.facetsOf(nodeId);
    found.set(nodeId, {
      nodeId,
      tier: deps.tierOf(nodeId),
      // The same `teachCost`, deliberately. §2.3 prices "acquiring this node
      // with help" and a book is help; inventing a `readCost` would be a content
      // field with no authored value on three hundred nodes, chosen by whoever
      // wrote the default. What differs between a book and a teacher is what
      // *arrives*, not what it costs to sit down with it.
      remainingCost: deps.gateway.teachCostOf(nodeId),
      cellId: facets.cellId,
      formId: facets.formId,
      primitives: facets.primitives,
    });
  }
  return [...found.values()];
}

/** Nodes this mage could pass to a co-affiliated student who can receive them. */
function teachableByMe(mage: Handle, deps: OutlookDeps): KnowledgeTarget[] {
  const found = new Map<number, KnowledgeTarget>();
  for (const student of deps.gateway.teachingRosterFor(mage)) {
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

/** One tick's reading of which university a mage would move to, and whether she fits. */
export interface UniversityStanding {
  /**
   * The university a mage now at `current` would move to, or `current`.
   *
   * Seat-aware, and it reads the occupancy **at the moment it is called** — so a
   * caller that walks a list of movers and reports each one through
   * {@link UniversityStanding.takeSeat} gets an answer that accounts for the
   * movers ahead of her.
   */
  preferredFor(current: Handle): Handle;
  /**
   * The one she would move to if capacity were no object.
   *
   * Differs from {@link UniversityStanding.preferredFor} exactly when a bound
   * binds, which is the only way anybody finds out that it did.
   */
  unboundedFor(current: Handle): Handle;
  /** Records a move, so the seat is gone for whoever is asked about next. */
  takeSeat(to: Handle, from: Handle): void;
}

/**
 * Nodes this mage could spend the month **drilling**.
 *
 * The gateway answers the whole question — held, permitted, within her reach,
 * and below the ceiling practice can carry that tier to — so this builder does
 * no filtering of its own. It only shapes the ids into targets, the way
 * `applicableBy` does, and for the same reason: `rules-world` scores *targets*
 * and may not read a node record.
 *
 * `remainingCost` is `0` for every entry. There is no project: a month of
 * practice is spent and gone, and next month she may spend another.
 */
function practicableBy(mage: Handle, deps: OutlookDeps): KnowledgeTarget[] {
  const found: KnowledgeTarget[] = [];
  for (const nodeId of deps.gateway.practicableNodes(mage)) {
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
 * Nodes this mage could spend the month **keeping standing** — lighting a
 * working over one, or renewing the one she has.
 *
 * Three of the four gates are `castableNodes`', which is the same set
 * `apply-magic` draws on and deliberately so: a working is cast, and what a mage
 * can keep standing is a subset of what she can cast. The fourth is the authored
 * duration — a node whose effects are all `durationTicks: 0` has no working to
 * keep, which is 381 of the 419 effect entries in the shipped grid.
 *
 * **A working already standing stays in the list**, and that is the whole reason
 * there is one goal here and not two. A node with no working over it is a
 * working to *light*; one with a working standing is a working to *renew*. Same
 * month, same commitment. Splitting them would have made a mage who lit one on
 * Monday need a goal switch to keep it on Tuesday, and `MIN_COMMITMENT_TICKS`
 * would then have decided how many workings a universe could hold.
 *
 * **An absent index means an empty list, and therefore a masked goal.** The same
 * shape `applicableTargets` uses for an absent `universeEffects`: a build with no
 * duration index behaves exactly as every build before this change did, which is
 * a thing a test can assert against rather than a silent degradation.
 *
 * `remainingCost` is ticks-before-lapse rather than a project cost, and
 * `rules-world`'s `outlook.ts` says why: `compareTargets` breaks ties
 * cheapest-first, so the working nearest to going out is the one she reaches for
 * when the appeal scores tie.
 */
function upkeepFor(
  mage: Handle,
  deps: OutlookDeps,
): { targets: KnowledgeTarget[]; pressure: Fixed } {
  const durations = deps.workingDurations;
  if (durations === undefined) return { targets: [], pressure: 0 };
  const targets: KnowledgeTarget[] = [];
  let pressure = 0;
  for (const nodeId of deps.gateway.castableNodes(mage)) {
    const duration = durations.durationOf(nodeId);
    if (duration === 0) continue;
    const standing = findWorking(deps.state, mage, nodeId);
    if (standing === undefined) {
      // Not standing at all. Maximal pressure and always a candidate: the
      // universe is getting nothing from this node, and no other goal in the
      // registry will change that.
      pressure = FP_UNIT;
      targets.push(targetFor(nodeId, duration, deps));
      continue;
    }
    const remaining = Math.max(0, standing.row.expiresTick - deps.worldTick);
    // **A working with years left is not a candidate**, which is where the rota
    // lives. See `RENEWAL_WINDOW_DENOMINATOR`.
    if (!needsRenewal(remaining, duration)) continue;
    targets.push(targetFor(nodeId, remaining, deps));
    // The fraction of its authored duration already elapsed. Floor division,
    // the one division in the rules path, and clamped below at zero so that a
    // working already lapsed and not yet swept reads as maximal rather than
    // negative — a negative pressure would *subtract* from the opportunity
    // term, so a universe whose workings had all gone out would be the one
    // least inclined to relight them.
    const elapsed = FP_UNIT - floorDiv(remaining * FP_UNIT, duration);
    if (elapsed > pressure) pressure = elapsed;
  }
  return { targets, pressure };
}

/** One upkeep candidate. `remainingCost` is ticks before it lapses, not a debt. */
function targetFor(nodeId: number, remaining: number, deps: OutlookDeps): KnowledgeTarget {
  const facets = deps.facetsOf(nodeId);
  return {
    nodeId,
    tier: deps.tierOf(nodeId),
    remainingCost: remaining,
    cellId: facets.cellId,
    formId: facets.formId,
    primitives: facets.primitives,
    libraryHolds: false,
  };
}

/**
 * Where each university stands this tick: who would move to it, and who fits.
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
 *
 * ## A full university is not an option, and both halves of that are needed
 *
 * `contracts.md` §1.4 gives a university a `capacity` and until this function
 * nothing read it as a bound — `completedCapacity` reads it as a *demand signal*
 * for the labour market, which is the opposite direction. Unbounded, this policy
 * has exactly one answer for every mage alive: the deepest library in the
 * universe. Every scholar migrates to it and the rest stand empty.
 *
 * That is not a prediction. Measured on `w183`'s tree at 60 world ticks, on
 * `knowledge-capital`'s two-academy fixture: with no bound the deep-shelf arm
 * and the bare-shelf arm come back **1030 and 1031 books** — the same universe
 * sampled twice, because the bare arm's mages walk to the deep academy within a
 * few ticks. With the transfer door shut it is **384 against 1031**. An
 * apparently one-book §6a near-miss was the two arms having merged.
 *
 * Filtering here is what stops a **livelock**, and it is why the bound cannot
 * live only at the move: a mage refused there would keep
 * `betterAffiliationAvailable` true, stay committed to `affiliate`, be refused
 * again next tick, and queue outside a full building for life while doing no
 * work — strictly worse than the missing wire this branch replaces. She has to
 * stop wanting what she cannot have. {@link UniversityStanding.unboundedFor} is
 * then what keeps the refusal visible, because a mage who never wants a seat
 * leaves no trace of the bound that stopped her, and `capacity.ts` states the
 * rule: *"a bound that is never observed to bind is a bound nobody can tune."*
 *
 * The university she is already in is never filtered out. She is in it; a bound
 * that evicted her would be a different rule entirely.
 */
export function universityPreference(state: SimState): UniversityStanding {
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
  const capacities = universities.field('capacity');

  // Living mages per university, so that a *full* one can be told from a
  // popular one. Two of the mage component's columns rather than a record
  // apiece, for the reason the instance tally above gives.
  const hosted = new Map<Handle, number>();
  const mages = componentOf(state, MAGE);
  const alive = mages.field('alive');
  const affiliations = mages.field('universityId');
  mages.forEach((row) => {
    if ((alive[row] as number) === 0) return;
    const university = affiliations[row] as Handle;
    if (university !== 0) hosted.set(university, (hosted.get(university) ?? 0) + 1);
  });

  // Collected once, ascending by handle, so the walk below is over a list and
  // not over the component — and so the tie-break reads as the declared order it
  // is rather than as a property of `forEach`.
  const completed: { handle: Handle; depth: number; seats: number }[] = [];
  universities.forEach((row, handle) => {
    if ((buildProgress[row] as number) < FP_ONE) return;
    completed.push({
      handle,
      depth: shelvedBy.get(libraryIds[row] as number) ?? 0,
      seats: capacities[row] as number,
    });
  });

  // `-1` for the unaffiliated, so an empty university still beats belonging
  // nowhere.
  const depthOf = (current: Handle): number =>
    current === 0 ? -1 : (shelvedBy.get(libraryDepthKey(state, current)) ?? 0);

  const bestOf = (current: Handle, seatsMatter: boolean): Handle => {
    let best = current;
    let bestDepth = depthOf(current);
    for (const entry of completed) {
      if (
        seatsMatter &&
        entry.handle !== current &&
        entry.seats - (hosted.get(entry.handle) ?? 0) <= 0
      ) {
        continue;
      }
      if (entry.depth > bestDepth || (entry.depth === bestDepth && best !== 0 && entry.handle < best)) {
        best = entry.handle;
        bestDepth = entry.depth;
      }
    }
    return best;
  };

  return {
    preferredFor: (current: Handle): Handle => bestOf(current, true),
    unboundedFor: (current: Handle): Handle => bestOf(current, false),
    takeSeat: (to: Handle, from: Handle): void => {
      hosted.set(to, (hosted.get(to) ?? 0) + 1);
      if (from !== 0) hosted.set(from, Math.max(0, (hosted.get(from) ?? 1) - 1));
    },
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
