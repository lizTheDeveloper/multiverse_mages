/*
 * Multiverse Mages — the adapter that satisfies rules-world's knowledge port
 * out of rules-magic.
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
 * `contracts.md` §5 rule 3: *"rules-magic and rules-world must not import each
 * other. Where they interact — a mage learning a node — the interaction lives in
 * a coordinating layer, not in a cycle."* `rules-world` declared the port
 * (`coordination.ts`, on the consumer's side, for the reason stated there).
 * This is the implementation, and it is the only file in the repository that
 * names both packages in one breath.
 *
 * ## The three `contribute*` methods refuse, loudly, and that is the honest
 * state of this layer
 *
 * `ResearchInputs.progress` in `@mm/rules-magic` is documented as *"Progress
 * accumulated before this step. The caller owns storing it."* Nothing owns
 * storing it yet. Where partial research, partial teaching and partial scribing
 * persist is exactly the class of decision the goal commitment just resolved —
 * it needs a world component, a schema revision and a migration, and
 * `contracts.md` §1.2's note argues at length that such a decision must not be
 * made silently by whoever writes the first caller.
 *
 * So these three throw, naming the missing decision. The alternative was an
 * accrual that lives for one tick and is discarded, which would run, look
 * plausible in a 200-year scenario, and produce a universe where research never
 * completes for reasons no measurement would attribute correctly. The world step
 * loop does not call them; a test asserts the refusal so the gap is a checked
 * fact rather than a comment.
 *
 * ## A gateway is a view of one phase, not of one tick
 *
 * Every question here is a scan — who is alive, what does she hold, what is on
 * her frontier — and asking them per mage per node is the hot loop of a world
 * tick: the frontier scan alone is `mages × nodes × instances` if `knows` walks
 * the instance component each time. So the answers are memoized inside the
 * instance.
 *
 * That makes the instance **stale the moment the world changes**, which is why
 * the world loop builds a new one for each phase that mutates: one for the
 * mortality phase, which destroys instances and kills mages, and a fresh one for
 * the autonomy phase, which runs after promotion has created new ones.
 * Construction is a field read and three empty maps. An invalidate-me method
 * would have been cheaper and would have put the correctness of every phase in
 * the hands of whoever remembers to call it.
 */

import type { ContentId, Fp } from '@mm/content';
import type { EntityHandle, Fixed, SimState } from '@mm/sim-core';
import type { Handle, LocationKindValue, Ruleset } from '@mm/state';
import { LOCATION_KIND, MAGE, componentOf, permits } from '@mm/state';
import type { CellResolver, KnowledgeSubsystem, NodeCatalog, StorePolicy } from '@mm/rules-magic';
import { DEFAULT_TEACH_THRESHOLD, heldMastery, researchRequirement } from '@mm/rules-magic';
import { createRediscoveryClampCounter } from '@mm/primitives';
import type {
  KnowledgeGateway,
  KnowledgeTarget,
  MageHandle,
  UniversityHandle,
} from '@mm/rules-world';

/** Species rates the gateway needs about whichever mage it is asked about. */
export interface MageRates {
  /** Species `learnRate` (`contracts.md` §2.4). */
  readonly learnRate: Fp;
  /** Species `rediscoveryAffinity`. A divisor: higher rediscovers cheaper. */
  readonly rediscoveryAffinity: Fp;
  /** Species `depthCeiling`, 1..7. */
  readonly depthCeiling: number;
}

/** Everything the adapter needs that is not the state itself. */
export interface GatewayDeps {
  readonly state: SimState;
  readonly knowledge: KnowledgeSubsystem;
  readonly catalog: NodeCatalog;
  readonly cells: CellResolver;
  /** The universe's ruleset. Legality gates world-time acquisition (§1.1). */
  readonly ruleset: Ruleset;
  /**
   * The rates of one mage, or `undefined` for a handle this layer cannot
   * resolve to a species. `undefined` propagates as "no candidates" rather than
   * as a default, because a defaulted `learnRate` is a species trait that has
   * quietly stopped differentiating anybody.
   */
  readonly ratesOf: (mage: MageHandle) => MageRates | undefined;
  /**
   * The universe's resolved `store` hook.
   *
   * The whole policy rather than the narrower `PersonalStore`, because the
   * scribable question is *"may a written copy exist under this tradition"* —
   * `holdableLocationKinds`, not where a personal instance lands. The Art of
   * Memory answers no, and that is the whole of its cost.
   */
  readonly store: StorePolicy;
  /** Where a dead mage's grimoires go. Supplied by the death path. */
  readonly onGrimoiresInherited?: ((mage: MageHandle, inheritor: UniversityHandle) => void) | undefined;
}

/**
 * The most nodes the frontier scan considers before giving up.
 *
 * The scan is over the whole catalog, which content grows without anyone
 * thinking about the AI — the same argument `MAX_CANDIDATE_TARGETS` makes one
 * layer up, applied to the layer that produces the list rather than the one that
 * consumes it. The caller's `limit` bounds the *result*; this bounds the *work*,
 * so a catalog of ten thousand nodes costs the same per mage as one of three
 * hundred.
 *
 * Nodes are visited in ascending id, which is content-authored order and
 * therefore a total order that depends on nothing but the content set.
 */
export const MAX_FRONTIER_SCAN = 256;

/**
 * The mages a teachability scan will consider as counterparties.
 *
 * Teaching is a pair, so the natural question — "who could teach me anything?"
 * — is quadratic in the mage population. Bounded here, in ascending slot order,
 * for the reason the frontier scan is bounded: a per-tick cost that grows with
 * a number the design does not control is a performance regression discovered
 * in a 200-year run rather than in review. **Untuned.**
 */
export const MAX_TEACHING_COUNTERPARTIES = 32;

/**
 * Satisfies `@mm/rules-world`'s port out of `@mm/rules-magic`.
 *
 * **One instance per phase.** See the module note: the memoized scans below are
 * valid only until something changes the world.
 */
export class CoordinatingKnowledgeGateway implements KnowledgeGateway {
  readonly #deps: GatewayDeps;

  /** Memoized for this phase. See the module note on staleness. */
  #roster: readonly MageHandle[] | undefined;
  readonly #rates = new Map<MageHandle, MageRates | undefined>();
  readonly #held = new Map<MageHandle, ReadonlySet<ContentId>>();

  constructor(deps: GatewayDeps) {
    this.#deps = deps;
  }

  instanceCount(nodeId: ContentId): number {
    return this.#deps.knowledge.instanceCount(nodeId);
  }

  everKnown(nodeId: ContentId): boolean {
    return this.#deps.knowledge.wasEverKnown(nodeId);
  }

  knows(mage: MageHandle, nodeId: ContentId): boolean {
    return this.#heldSet(mage).has(nodeId);
  }

  /**
   * Nodes this mage could begin researching now, cheapest first.
   *
   * Filtered by ruleset legality and by prerequisites, which are `rules-magic`'s
   * to evaluate; **not** by species depth, which the caller gates
   * (`gatherFrontier`) so that the filter runs before the caller's limit is
   * spent.
   *
   * `remainingCost` is the full requirement, because no progress is stored yet
   * — see this module's header. When progress persists it is subtracted here and
   * nowhere else, so that "remaining" has one definition.
   */
  researchFrontier(mage: MageHandle, limit: number): readonly KnowledgeTarget[] {
    const rates = this.#ratesOf(mage);
    if (rates === undefined) return [];

    const found: KnowledgeTarget[] = [];
    const scanned = Math.min(this.#deps.catalog.nodeCount, MAX_FRONTIER_SCAN);
    for (let nodeId = 1; nodeId <= scanned && found.length < limit; nodeId += 1) {
      const node = this.#deps.catalog.node(nodeId);
      if (node === undefined) continue;
      if (!permits(this.#deps.ruleset, this.#deps.cells.cellOf(nodeId))) continue;
      if (this.knows(mage, nodeId)) continue;
      if (!this.#prerequisitesHeld(mage, node.prerequisites)) continue;

      found.push({
        nodeId,
        tier: node.tier,
        remainingCost: researchRequirement(node, {
          rediscovery: this.#deps.knowledge.wasEverKnown(nodeId),
          rediscoveryAffinity: rates.rediscoveryAffinity,
          learnRate: rates.learnRate,
          // Neutral: the stacked `research-rate` multiplier is a property of the
          // tick the work happens in, not of the decision to attempt it, and
          // baking this tick's value into a commitment that lasts six months
          // would make the cost a mage decided against stale by construction.
          researchRate: NEUTRAL_RATE,
          // A throwaway counter: this is a *quotation* of a cost for a decision,
          // not the accrual that pays it. The share that matters at 0.5.0 is
          // counted where the work happens, and folding scan-time quotes into
          // it would inflate the denominator with evaluations nobody paid for.
          clampCounter: createRediscoveryClampCounter(),
        }),
      });
    }
    return found;
  }

  canTeach(teacher: MageHandle, nodeId: ContentId): boolean {
    const mastery = heldMastery(this.#deps.knowledge, teacher, nodeId);
    return mastery !== undefined && mastery >= DEFAULT_TEACH_THRESHOLD;
  }

  /**
   * A node this teacher could pass to this student, or `undefined`.
   *
   * The lowest such node id, which is a total order over the teacher's holdings
   * and depends on nothing but the content set. Ascending slot order over her
   * instances would depend on the destroy history instead.
   */
  teachableTo(teacher: MageHandle, student: MageHandle): ContentId | undefined {
    if (teacher === student) return undefined;
    const rates = this.#ratesOf(student);
    if (rates === undefined) return undefined;

    let best: ContentId | undefined;
    for (const instance of this.#deps.knowledge.instancesHeldBy(teacher)) {
      const view = this.#deps.knowledge.read(instance);
      const node = this.#deps.catalog.node(view.nodeId);
      if (node === undefined || node.tier > rates.depthCeiling) continue;
      if (view.mastery < DEFAULT_TEACH_THRESHOLD) continue;
      if (!permits(this.#deps.ruleset, this.#deps.cells.cellOf(view.nodeId))) continue;
      if (this.knows(student, view.nodeId)) continue;
      if (!this.#prerequisitesHeld(student, node.prerequisites)) continue;
      if (best === undefined || view.nodeId < best) best = view.nodeId;
    }
    return best;
  }

  scribableBy(mage: MageHandle, nodeId: ContentId): KnowledgeTarget | undefined {
    // A tradition whose `store` hook keeps no written copies cannot scribe at
    // all — the Art of Memory's whole cost. Asking the hook rather than
    // checking a tradition id keeps the four extension points the only place a
    // tradition changes anything.
    if (!this.#deps.store.holdableLocationKinds.includes(GRIMOIRE_LOCATION)) return undefined;
    const node = this.#deps.catalog.node(nodeId);
    if (node === undefined) return undefined;
    if (!permits(this.#deps.ruleset, this.#deps.cells.cellOf(nodeId))) return undefined;
    if (!this.knows(mage, nodeId)) return undefined;
    return { nodeId, tier: node.tier, remainingCost: node.scribeCost };
  }

  /**
   * A node's authored `teachCost` (`contracts.md` §2.3), in `fp` mage-months.
   *
   * The pair's cost rather than a learner's solo cost, which is what makes a
   * teachable node score above researching the same node alone. Not on the port
   * — `rules-world` asks about *targets*, not about node records — so it is
   * offered here for the outlook builder next door.
   */
  teachCostOf(nodeId: ContentId): Fp {
    return this.#deps.catalog.node(nodeId)?.teachCost ?? 0;
  }

  contributeResearch(): void {
    throw new Error(unpersistedProgress('research'));
  }

  contributeTeaching(): void {
    throw new Error(unpersistedProgress('teaching'));
  }

  contributeScribing(): void {
    throw new Error(unpersistedProgress('scribing'));
  }

  /**
   * A mage has died: her mind and memory-palace instances go with her, her
   * books do not.
   *
   * `contracts.md` §1.5 and `rules-world`'s `death.ts` between them decide where
   * the books go; this call is the single path by which the knowledge side hears
   * about it, which is what makes vision §5's "knowledge is physical" claim
   * testable in one place instead of five.
   */
  onMageDied(mage: MageHandle, inheritor: UniversityHandle): void {
    this.#deps.knowledge.destroyInstancesHeldBy(mage, this.#deps.state.clock.worldTick);
    this.#deps.onGrimoiresInherited?.(mage, inheritor);
  }

  /** Every node this mage holds in mind or palace, ascending by node id. */
  heldNodes(mage: MageHandle): readonly ContentId[] {
    return [...this.#heldSet(mage)].sort((a, b) => a - b);
  }

  /**
   * The living mages a teachability scan may consider, ascending by slot and
   * bounded by {@link MAX_TEACHING_COUNTERPARTIES}.
   *
   * Here rather than in `rules-world` because the bound is a property of this
   * scan, and because the roster read is a state read the autonomy layer is
   * deliberately kept away from.
   */
  livingMages(): readonly MageHandle[] {
    if (this.#roster !== undefined) return this.#roster;
    const store = componentOf(this.#deps.state, MAGE);
    const alive = store.field('alive');
    const found: MageHandle[] = [];
    store.forEach((row, handle) => {
      if (found.length >= MAX_TEACHING_COUNTERPARTIES) return;
      if ((alive[row] as number) === 0) return;
      found.push(handle as Handle);
    });
    this.#roster = found;
    return found;
  }

  /**
   * The nodes a subject holds in mind or palace, as a set.
   *
   * A set rather than a mastery lookup per node: the frontier scan asks "does
   * she know this?" once per candidate node, and answering each by walking the
   * instance component is what makes the scan quadratic. Mastery is still read
   * instance by instance where mastery is what matters — {@link canTeach} and
   * {@link teachableTo} — because a set cannot answer "well enough to teach".
   */
  #heldSet(mage: MageHandle): ReadonlySet<ContentId> {
    const cached = this.#held.get(mage);
    if (cached !== undefined) return cached;
    const nodes = new Set<ContentId>();
    for (const instance of this.#deps.knowledge.instancesHeldBy(mage)) {
      nodes.add(this.#deps.knowledge.read(instance).nodeId);
    }
    this.#held.set(mage, nodes);
    return nodes;
  }

  #ratesOf(mage: MageHandle): MageRates | undefined {
    if (this.#rates.has(mage)) return this.#rates.get(mage);
    const rates = this.#deps.ratesOf(mage);
    this.#rates.set(mage, rates);
    return rates;
  }

  #prerequisitesHeld(mage: MageHandle, prerequisites: readonly ContentId[]): boolean {
    for (const prerequisite of prerequisites) {
      if (!this.knows(mage, prerequisite)) return false;
    }
    return true;
  }
}

/** `fp(1.0)` — an unmodified rate (`contracts.md` §2.4's convention). */
const NEUTRAL_RATE: Fixed = 1024;

/** Where a written copy sits while a mage holds the book (`contracts.md` §1.5). */
const GRIMOIRE_LOCATION: LocationKindValue = LOCATION_KIND.grimoire;

/** Whether a location kind is one a mage carries in her own head. */
export function isHeldAtMind(locationKind: number): boolean {
  return locationKind === LOCATION_KIND.mind || locationKind === LOCATION_KIND.palace;
}

function unpersistedProgress(kind: string): string {
  return (
    `Cannot accrue ${kind} work: partial progress has nowhere to persist. @mm/rules-magic's ` +
    'operations take the progress so far as a parameter and say "the caller owns storing it", and ' +
    'nothing owns it yet. Storing it needs a world component, a WORLD_SCHEMA_VERSION bump and a ' +
    'migration — the same decision contracts.md §1.2 records for the goal commitment, and it says ' +
    'why such a decision must not be made by whoever writes the first caller. Make it, then ' +
    'implement this method against it.'
  );
}

/** A mage entity handle, re-exported so callers need not reach past this layer. */
export type { MageHandle } from '@mm/rules-world';

/** Handle alias, for the roster read above. */
export type LivingMage = EntityHandle;
