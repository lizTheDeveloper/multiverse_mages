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
 * ## The three `contribute*` methods used to refuse, and now accrue
 *
 * `ResearchInputs.progress` in `@mm/rules-magic` is documented as *"Progress
 * accumulated before this step. The caller owns storing it."* Nobody owned it,
 * so these three threw, naming the missing decision rather than inventing an
 * accrual that lives for one tick and is discarded — which would have run,
 * looked plausible in a 200-year scenario, and produced a universe where
 * research never completes for reasons no measurement would attribute
 * correctly.
 *
 * The decision is made: {@link EffortLedger} over `@mm/state`'s
 * `EFFORT_PROGRESS`, one entity per project, so that progress survives a goal
 * switch and a mage resumes a node she set down. The reasoning is in
 * `contracts.md` §1.2 and in `effort-store.ts`; what matters here is the shape
 * it gives these three methods. Each one reads the project's stored progress,
 * hands `rules-magic` the month of work, and either stores the new total or —
 * when the requirement is reached — performs the operation and forgets the
 * project.
 *
 * **Completion is reported, not returned.** The port types all three as `void`,
 * and widening it would put a knowledge outcome into a `rules-world` interface
 * that is deliberately narrow. So a completed project lands in
 * {@link CoordinatingKnowledgeGateway.completions}, which the world loop reads
 * once per phase and turns into `stepMageAutonomy`'s `isComplete` — the
 * caller's judgement the autonomy layer already asks for.
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
 * mortality phase, which destroys instances and kills mages; one for the work
 * phase, which creates them; and a fresh one for the autonomy phase, which runs
 * after both. Construction is a field read and a few empty maps. An
 * invalidate-me method would have been cheaper and would have put the
 * correctness of every phase in the hands of whoever remembers to call it.
 *
 * ## A book belongs to the scriptorium that produced it
 *
 * This is the one rule in this file that is a *design decision* rather than a
 * translation, so it is argued here rather than left to be inferred from
 * {@link CoordinatingKnowledgeGateway.contributeScribing}.
 *
 * A finished grimoire is shelved in the library of the university its author is
 * affiliated with, at the moment it is finished, with no intervening tick in
 * which a mage carries it. Not because shelving is convenient to code there, but
 * because at this build **a book cannot be written any other way**: the capacity
 * a scribing project is measured in comes from `scribeThroughputFor`, which
 * counts the *university's* scribe cohorts, and `isFeasible` masks the `scribe`
 * goal outright when that throughput is zero. Every book in the universe is
 * therefore produced by institutional labour, out of a universe-level materials
 * stock (§1.1), at an institution's desk. A book that then became the private
 * property of the mage who dictated it would be the only place in the loop where
 * an institution's output is privately appropriated, and no rule says so.
 *
 * `rules-magic`'s `scribe` anticipated exactly this: `holderKind` and `holderId`
 * are already its inputs, documented as *"a university scribe copying a treatise
 * straight into the stacks, with no moment at which a mage is carrying it"*. So
 * the shelf is chosen *before* the record is written and the location is derived
 * once, by `writtenInstanceLocation`, inside `scribe`. There is no window in
 * which the book says `library` and its contents say `grimoire` — the window a
 * shelve-after-write would open, and the one `createInstance`'s invariant exists
 * to catch after the fact.
 *
 * **Three cases fall out rather than being special-cased.** A mage under the Art
 * of Memory reaches none of this: `scribe` refuses at the `store` hook, before
 * anything is created. A mage with no affiliation, or one whose university keeps
 * no library, writes into her own hands — which is the behaviour that was there
 * before, kept as the fallback rather than deleted, because the feasibility mask
 * that currently makes it unreachable is not a contract.
 *
 * **It is not a goal, and that is deliberate.** Shelving costs no mage-month:
 * the book is finished either way and the only question is whose shelf it lands
 * on. A goal is how a mage chooses between *uses of her month*, so a `donate`
 * goal would be a branch that is never not-taken, scored against base appeals
 * and weights nobody could tune, in an enumeration whose ids every committed
 * baseline is keyed on. The interesting version of that choice — a mage
 * withholding her work, hoarding it, carrying it away when she re-affiliates —
 * needs pressures that do not exist yet: no ownership, no trade, no prestige in
 * a private collection. `withdrawGrimoire` is unused and stays unused; it is the
 * seam that mechanic lands on.
 *
 * ## What death does to a book
 *
 * §1.5 says a dead unaffiliated mage's books are *unowned*, and are **not** in
 * transit to anywhere. Under the rule above an affiliated mage's books are
 * already on her university's shelf when she dies, so the common case is settled
 * before the mortality phase reaches it. The fallback case is not, and left
 * alone it produces a book that names a corpse as its holder — which is what
 * "every book stays in its author's hands" was actually describing.
 * {@link CoordinatingKnowledgeGateway.onMageDied} settles it: to the inheritor's
 * library when there is one, to `unowned` when there is not. Nothing is
 * destroyed either way; a book is a thing, and burning it takes a fire.
 */

import type { ContentId, Fp } from '@mm/content';
import type { EntityHandle, Fixed, SimState } from '@mm/sim-core';
import { floorDiv } from '@mm/sim-core';
import type { EffortKindValue, Handle, LocationKindValue, Ruleset } from '@mm/state';
import {
  EFFORT_KIND,
  GRIMOIRE,
  HOLDER_KIND,
  KNOWLEDGE_INSTANCE,
  LIBRARY,
  LOCATION_KIND,
  MAGE,
  UNIVERSITY,
  componentOf,
  permits,
  readRecord,
} from '@mm/state';
import type {
  AcquirePolicy,
  CellResolver,
  KnowledgeRng,
  KnowledgeSubsystem,
  NodeCatalog,
  StoreHook,
  StorePolicy,
} from '@mm/rules-magic';
import {
  DEFAULT_TEACH_THRESHOLD,
  MASTERY_ACTIVATION_THRESHOLD,
  disownGrimoire,
  isRediscovery,
  perishesWithHolder,
  practice,
  practiceRequirement,
  research,
  researchRequirement,
  scribe,
  scribeAvailability,
  scribeCapacityCost,
  shelveGrimoire,
  teach,
} from '@mm/rules-magic';
import type { RediscoveryClampCounter } from '@mm/primitives';
import { createRediscoveryClampCounter } from '@mm/primitives';
import type {
  KnowledgeGateway,
  KnowledgeTarget,
  MageHandle,
  UniversityHandle,
} from '@mm/rules-world';
import { DEGRADATION_PER_SHORTFALL, compareTargets } from '@mm/rules-world';
import { NO_INHERITOR } from '@mm/rules-world';

import type { EffortKey, EffortLedger } from './effort-store.js';
import type { NodeFacetResolver } from './node-facets.js';
import type { CellNodeIndex } from './frontier-index.js';
import { cellNodeIndex } from './frontier-index.js';

/** Species rates the gateway needs about whichever mage it is asked about. */
export interface MageRates {
  /** Species `learnRate` (`contracts.md` §2.4). */
  readonly learnRate: Fp;
  /** Species `rediscoveryAffinity`. A divisor: higher rediscovers cheaper. */
  readonly rediscoveryAffinity: Fp;
  /** Species `depthCeiling`, 1..7. */
  readonly depthCeiling: number;
  /** Species `scribeAffinity`. Raises a finished book's durability. */
  readonly scribeAffinity: Fp;
}

/**
 * The universe's materials stock, as much of it as scribing needs.
 *
 * A pair of callbacks rather than a number, because a book's cost is deducted in
 * the tick it is finished and the loop that owns the stock is one layer up.
 * `contracts.md` §1.1 makes materials a universe-level balance and
 * `rules-magic`'s `scribe` deliberately *reports* consumption instead of
 * applying it — this is the seam that keeps that true while still letting the
 * deduction happen at the moment of the write.
 */
export interface MaterialsAccess {
  /** What the universe can spend right now, `fp`. */
  readonly available: () => Fixed;
  /** Deducts what a finished book cost. Never called on a refusal. */
  readonly consume: (amount: Fixed) => void;
}

/** A project that reached its requirement this phase, for the caller's report. */
export interface CompletedEffort {
  readonly kind: EffortKindValue;
  /** The mage the effort was counted against; for teaching, the teacher. */
  readonly subject: MageHandle;
  /** The student, for teaching; `0` otherwise. */
  readonly counterparty: MageHandle;
  readonly nodeId: ContentId;
}

/** Everything the adapter needs that is not the state itself. */
export interface GatewayDeps {
  readonly state: SimState;
  readonly knowledge: KnowledgeSubsystem;
  readonly catalog: NodeCatalog;
  readonly cells: CellResolver;
  /**
   * A node's cell, form and effect primitives, for the utility score that
   * decides which target a mage takes.
   *
   * Here rather than on `NodeCatalog` because that projection keeps the effects
   * list out of reach on purpose (`catalog.ts`), and rightly: this index reads
   * *which* primitives a node declares and never a magnitude, so nothing that
   * holds it can start applying an effect.
   */
  readonly facets: NodeFacetResolver;
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
  /**
   * The universe's resolved `acquire` hook.
   *
   * Required, exactly as `store` is, and for the reason `store` learned the hard
   * way. `applyAcquire` shipped in 0.3.0 with no caller outside a test, so True
   * Naming's `researchCostMultiplier`, `teachCostMultiplier` and `instanceMastery`
   * were arithmetic nobody paid: one of the four declared hooks was inert in
   * every running universe. An optional dep here would leave that reachable —
   * a caller who omitted it would get the authored costs back and no error, and
   * the tradition would go quiet again for whatever path forgot.
   *
   * It reaches the three places a node's price is read: the frontier quote, the
   * research accrual, and the teaching gate. Nothing else consults it, because
   * nothing else is `acquire`'s business.
   */
  readonly acquire: AcquirePolicy;
  /** Where a dead mage's grimoires go. Supplied by the death path. */
  readonly onGrimoiresInherited?: ((mage: MageHandle, inheritor: UniversityHandle) => void) | undefined;
  /**
   * Where unfinished work lives. Omitted means this gateway is query-only.
   *
   * Optional rather than required because most of the port is questions, and a
   * caller that only asks them — a test of the frontier, an observation build —
   * should not have to construct a ledger to be handed nothing back. The three
   * `contribute*` methods refuse without one, and say so.
   */
  readonly effort?: EffortLedger | undefined;
  /** The step's RNG. Required to accrue: research, teaching and scribing all draw. */
  readonly rng?: KnowledgeRng | undefined;
  /** The universe's materials stock. Required to finish a book. */
  readonly materials?: MaterialsAccess | undefined;
  /**
   * Accumulates how often the `fp(3072)` rediscovery floor discarded affinity.
   *
   * Supplied by the caller so that it outlives a phase: the figure that matters
   * at 0.5.0 is the share over a whole run, and a counter created here would be
   * discarded with the gateway every phase and always read zero. Omitted means
   * nobody is counting, which is honest for a query-only gateway.
   */
  readonly clampCounter?: RediscoveryClampCounter | undefined;
  /**
   * `cellOf` inverted: which nodes live in which cell.
   *
   * What the frontier scan walks instead of an id range — see
   * {@link CoordinatingKnowledgeGateway.researchFrontier} and
   * `frontier-index.ts`. Supplied by the caller so that it outlives a phase, for
   * the same reason `clampCounter` is: the index is a function of the content
   * set alone, and one built here would be rebuilt three times a tick and cost
   * an `O(catalog)` pass each time — which is precisely the cost the scan is
   * being changed to stop paying.
   *
   * Omitted means this gateway builds its own, lazily, on the first frontier
   * question and not at all if none is asked. That keeps a query-only caller —
   * a test, an outlook build — from having to construct one, and it is the slow
   * path by construction: the world loop supplies the shared index.
   */
  readonly nodesByCell?: CellNodeIndex | undefined;
}

/**
 * The mages a teachability scan will consider as counterparties, **per
 * institution**.
 *
 * Teaching is a pair, so the natural question — "who could teach me anything?"
 * — is quadratic in the mage population. Bounded here, in ascending slot order,
 * for the reason the frontier scan is bounded: a per-tick cost that grows with
 * a number the design does not control is a performance regression discovered
 * in a 200-year run rather than in review. **Untuned.**
 *
 * ## Why the bound is per-institution and not per-universe
 *
 * It used to bound one universe-wide list, and that was worse than no bound for
 * the purpose the boundary now serves: *the teaching pool was the 32 lowest
 * handles in the universe*, an arbitrary set with no institutional meaning.
 * Filtering that list by affiliation afterwards would have been worse still — a
 * university whose mages all sit above slot 32 would have an empty faculty for
 * reasons no rule states, and the emptiness would look like a knowledge result.
 *
 * So {@link CoordinatingKnowledgeGateway.teachingRosterFor} builds one bounded
 * list *per university*, from the same single pass. The cost a single mage pays
 * is unchanged — at most this many counterparties — and the bound now truncates
 * a set that means something.
 */
export const MAX_TEACHING_COUNTERPARTIES = 32;

/** The empty roster, shared, so a lookup miss allocates nothing. */
const NO_COUNTERPARTIES: readonly MageHandle[] = Object.freeze([]);

/**
 * Satisfies `@mm/rules-world`'s port out of `@mm/rules-magic`.
 *
 * **One instance per phase.** See the module note: the memoized scans below are
 * valid only until something changes the world.
 */
export class CoordinatingKnowledgeGateway implements KnowledgeGateway {
  readonly #deps: GatewayDeps;

  /** Memoized for this phase. See the module note on staleness. */
  #rosters: Map<Handle, MageHandle[]> | undefined;
  /** A mage's affiliation, resolved once per mage per phase. See {@link #universityOf}. */
  readonly #affiliations = new Map<MageHandle, Handle>();
  readonly #rates = new Map<MageHandle, MageRates | undefined>();
  /** Every mage's held nodes and mastery, from one pass. See {@link #holdings}. */
  #heldByMage: Map<MageHandle, Map<ContentId, Fp>> | undefined;
  /** `cellOf` inverted. The caller's, or this gateway's own. See {@link #legalNodeIds}. */
  #nodesByCell: CellNodeIndex | undefined;
  /** Every node this universe's ruleset permits, ascending. Memoized for this phase. */
  #legalNodes: readonly ContentId[] | undefined;
  /** A mage's shelf, resolved once per mage per phase. See {@link #shelfFor}. */
  readonly #shelves = new Map<MageHandle, Handle>();
  /**
   * What each shelf already holds, resolved once per library per phase.
   *
   * Memoized for the reason every other index on this class is: the scribable
   * scan asks per mage per candidate node, and a library scan per question would
   * make choosing what to write cost `mages × instances`. A gateway is a view of
   * one phase, so the set cannot go stale inside one — a book finished in the
   * work phase deepens the shelf for the *next* evaluation, which is also the
   * rule `capital.ts` states for the depth reading.
   */
  readonly #shelfContents = new Map<Handle, ReadonlySet<ContentId>>();
  /** Books in mages' hands, from one pass. See {@link #grimoiresHeldBy}. */
  #grimoiresByHolder: Map<MageHandle, Handle[]> | undefined;

  /** Projects finished while this gateway was alive. Reporting only. */
  readonly #completed: CompletedEffort[] = [];
  readonly #clampCounter: RediscoveryClampCounter;

  constructor(deps: GatewayDeps) {
    this.#deps = deps;
    this.#clampCounter = deps.clampCounter ?? createRediscoveryClampCounter();
  }

  instanceCount(nodeId: ContentId): number {
    return this.#deps.knowledge.instanceCount(nodeId);
  }

  /**
   * `isRediscovery`, not `wasEverKnown` — the same correction {@link
   * researchFrontier} makes below, for the same reason, one call further out.
   *
   * This port used to answer `wasEverKnown`, and `gatherFrontier` used the
   * answer to decide whether a target was a `research-node` or a
   * `rediscover-node` goal. The mark is never cleared, so every node the
   * universe currently holds was filed as a rediscovery, and goal selection
   * scored, ranked and committed against a category the pricing path had
   * already stopped believing in. Delegating to `rules-magic`'s own predicate
   * is what keeps the two from drifting apart a second time.
   */
  rediscovery(nodeId: ContentId): boolean {
    return isRediscovery(this.#deps.knowledge, nodeId);
  }

  knows(mage: MageHandle, nodeId: ContentId): boolean {
    return this.#holdings(mage).has(nodeId);
  }

  /**
   * Nodes this mage could begin researching now, cheapest first.
   *
   * Filtered by ruleset legality and by prerequisites, which are `rules-magic`'s
   * to evaluate; **not** by species depth, which the caller gates
   * (`gatherFrontier`) so that the filter runs before the caller's limit is
   * spent.
   *
   * `remainingCost` is the requirement **less whatever this mage has already
   * banked against that node**, and that subtraction happens here and nowhere
   * else so that "remaining" has one definition. It is what makes a set-down
   * project cheaper to resume than to start, which is the whole reason progress
   * has a home: `compareTargets` sorts cheapest first, so a half-finished node
   * outranks an untouched one of the same cost without any rule saying so.
   *
   * ## The scan is bounded by legality, not by an id range
   *
   * It used to walk `1..min(nodeCount, 256)`. That constant was documented as
   * bounding *work* and in fact bounded *reachability*: the shipped catalog
   * holds 300 nodes, so 44 of them — the whole `rego` technique, four of the
   * twelve v1 cells, four tier-1 roots with no prerequisites at all — were
   * invisible to every mage at every tick for the life of the universe. Teaching
   * could not route around it, because nobody can hold a node nobody can
   * research. `test/unit/frontier-scan-window.test.ts` carries the diagnosis.
   *
   * What replaces it is the index the ruleset already implies: the nodes in
   * permitted cells ({@link #legalNodeIds}). That is `O(legal nodes)` and flat
   * in total catalog size — which is what the old constant claimed and did not
   * deliver, since content authored into cells nobody permitted now costs
   * nothing at all. It is also a bound that **cannot delete content**: the only
   * way to narrow it is for the god to forbid a cell, which is a rule, is
   * visible in the ruleset, and is reversible.
   *
   * ## `limit` bounds the result, and the cheapest survive it
   *
   * The old loop also stopped at `found.length < limit` while walking ascending
   * id, so a mage with more candidates than the limit got the lowest-numbered
   * ones — the same defect at smaller scale, with interned id again deciding
   * what she may consider.
   *
   * It does not bite today, and that is measured rather than assumed: over a
   * fifty-year reference run the longest frontier any mage ever holds is 16,
   * against `gatherFrontier`'s request of 32, because the v1 graph gates most of
   * its 51 nodes behind prerequisites. It is a trap rather than a live defect —
   * the ceiling is 51 against a limit of 32, and the `rego` block is the
   * highest-numbered of the 51, so the day a content set widens the graph the
   * truncation would quietly start deleting exactly what the index above just
   * made reachable.
   *
   * So the whole frontier is gathered and `compareTargets` — the caller's own
   * total order, imported rather than restated — decides which `limit` of it
   * comes back. Cheapest first, which is what this method has always claimed to
   * return and now does. It costs one sort of at most `legal nodes` per mage per
   * evaluation, and buys a bound whose meaning does not depend on interning
   * order.
   */
  researchFrontier(mage: MageHandle, limit: number): readonly KnowledgeTarget[] {
    const rates = this.#ratesOf(mage);
    if (rates === undefined) return [];

    const found: KnowledgeTarget[] = [];
    for (const nodeId of this.#legalNodeIds()) {
      const node = this.#deps.catalog.node(nodeId);
      if (node === undefined) continue;
      if (this.knows(mage, nodeId)) continue;
      if (!this.#prerequisitesHeld(mage, node.prerequisites)) continue;

      const banked =
        this.#deps.effort?.progressOf(effortKey(EFFORT_KIND.research, mage, nodeId, 0)) ?? 0;
      const requirement = researchRequirement(node, {
        // `isRediscovery`, not `wasEverKnown`. The two differ on exactly the
        // nodes the universe holds right now: `wasEverKnown` is set by
        // `createInstance` and never cleared, so it is true of every node
        // anybody here has ever learned — including the ones still on the
        // shelf. Quoting those at the ≥3× rediscovery price while `research()`
        // charges the ordinary one made this method disagree with the only
        // other place that prices the same work, in the direction that hurts:
        // research is currently the one route back to a teachable instance, so
        // an inflated quote drags on the only preservation mechanism there is.
        // `research.ts` states the rule and this now calls it rather than
        // restating it: *"Only the gap between the two, known once and now
        // gone, is expensive."*
        rediscovery: isRediscovery(this.#deps.knowledge, nodeId),
        rediscoveryAffinity: rates.rediscoveryAffinity,
        learnRate: rates.learnRate,
        // Neutral: the stacked `research-rate` multiplier is a property of the
        // tick the work happens in, not of the decision to attempt it, and
        // baking this tick's value into a commitment that lasts six months
        // would make the cost a mage decided against stale by construction.
        researchRate: NEUTRAL_RATE,
        // The tradition's price, so that what a mage is quoted while choosing is
        // what she is charged while working. Omitted here, a True Naming mage
        // would rank a node at half what deriving it actually costs her.
        acquire: this.#deps.acquire,
        // A throwaway counter: this is a *quotation* of a cost for a decision,
        // not the accrual that pays it. The share that matters at 0.5.0 is
        // counted where the work happens, and folding scan-time quotes into it
        // would inflate the denominator with evaluations nobody paid for.
        clampCounter: createRediscoveryClampCounter(),
      });
      const facets = this.#deps.facets(nodeId);
      found.push({
        nodeId,
        tier: node.tier,
        remainingCost: Math.max(requirement - banked, 0),
        cellId: facets.cellId,
        formId: facets.formId,
        primitives: facets.primitives,
      });
    }
    found.sort(compareTargets);
    return found.length > limit ? found.slice(0, limit) : found;
  }

  canTeach(teacher: MageHandle, nodeId: ContentId): boolean {
    const mastery = this.#holdings(teacher).get(nodeId);
    return mastery !== undefined && mastery >= DEFAULT_TEACH_THRESHOLD;
  }

  /**
   * A node this teacher could pass to this student, or `undefined`.
   *
   * The lowest such node id, which is a total order over the teacher's holdings
   * and depends on nothing but the content set. Ascending slot order over her
   * instances would depend on the destroy history instead.
   *
   * **Lowest, not most valuable**, and that is deliberately left alone here: a
   * value-blind acquirer and a boundary-free teaching pool are two separate
   * causes of the campaign's one-queue result, and this change fixes the second
   * only. The ordering is `w17`'s.
   */
  teachableTo(teacher: MageHandle, student: MageHandle): ContentId | undefined {
    if (teacher === student) return undefined;
    if (!this.#sharesInstitution(teacher, student)) return undefined;
    const rates = this.#ratesOf(student);
    if (rates === undefined) return undefined;

    let best: ContentId | undefined;
    for (const [nodeId, mastery] of this.#holdings(teacher)) {
      if (best !== undefined && nodeId >= best) continue;
      if (mastery < DEFAULT_TEACH_THRESHOLD) continue;
      const node = this.#deps.catalog.node(nodeId);
      if (node === undefined || node.tier > rates.depthCeiling) continue;
      if (!permits(this.#deps.ruleset, this.#deps.cells.cellOf(nodeId))) continue;
      if (this.knows(student, nodeId)) continue;
      if (!this.#prerequisitesHeld(student, node.prerequisites)) continue;
      best = nodeId;
    }
    return best;
  }

  scribableBy(mage: MageHandle, nodeId: ContentId): KnowledgeTarget | undefined {
    // A tradition whose `store` hook keeps no written copies cannot scribe at
    // all — the Art of Memory's whole cost. Asking the hook rather than
    // checking a tradition id keeps the four extension points the only place a
    // tradition changes anything, and asking it through `scribeAvailability`
    // rather than by reading `scribingAvailable` here keeps the *refusal* — the
    // sentence naming the hook that refused — a thing `rules-magic` writes once
    // rather than a boolean each caller re-explains.
    if (!scribeAvailability(this.#deps.store).available) return undefined;
    const node = this.#deps.catalog.node(nodeId);
    if (node === undefined) return undefined;
    if (!permits(this.#deps.ruleset, this.#deps.cells.cellOf(nodeId))) return undefined;
    if (!this.knows(mage, nodeId)) return undefined;
    const facets = this.#deps.facets(nodeId);
    // `libraryHolds`: whether the shelf she would write onto already holds it.
    // See `candidates.ts`'s `compareTargets` for why the answer changes the
    // order she considers her options in, and `coordination.ts`'s
    // `libraryHolds` for the measurement that says it has to.
    return {
      nodeId,
      tier: node.tier,
      remainingCost: node.scribeCost,
      cellId: facets.cellId,
      formId: facets.formId,
      primitives: facets.primitives,
      libraryHolds: this.#shelfHolds(mage, nodeId),
    };
  }

  /** Whether the library this mage would shelve into already holds `nodeId`. */
  #shelfHolds(mage: MageHandle, nodeId: ContentId): boolean {
    const shelf = this.#shelfFor(mage);
    if (shelf === 0) return false;
    let held = this.#shelfContents.get(shelf);
    if (held === undefined) {
      held = new Set(
        this.#deps.knowledge
          .instancesAt(LOCATION_KIND.library, shelf)
          .map((instance) => this.#deps.knowledge.read(instance).nodeId),
      );
      this.#shelfContents.set(shelf, held);
    }
    return held.has(nodeId);
  }

  /**
   * The lowest-handle living mage this teacher could pass `nodeId` to, or
   * `undefined`.
   *
   * The counterpart {@link teachableTo} does not answer: that one asks *what*
   * this pair could exchange and returns the cheapest node, so a student who
   * could receive the committed node but could also receive a lower-numbered one
   * would look like no student at all. A `teach` commitment names the node, so
   * the question at accrual time is the other way round.
   *
   * Lowest handle rather than any other order, because a handle is a total order
   * that depends on nothing but the state, and the roster it walks is already
   * bounded by {@link MAX_TEACHING_COUNTERPARTIES}.
   *
   * **Her own institution's roster**, which is the boundary — see
   * {@link teachingRosterFor}. Decision and accrual walk the same list on
   * purpose: the outlook builder scores `teach` off this same roster, and a mage
   * who committed six months to teaching and then found no student would be
   * paying for a counterparty the two scans disagreed about.
   */
  studentFor(teacher: MageHandle, nodeId: ContentId): MageHandle | undefined {
    if (!this.canTeach(teacher, nodeId)) return undefined;
    for (const student of this.teachingRosterFor(teacher)) {
      if (student === teacher) continue;
      if (this.#admitsLesson(student, nodeId)) return student;
    }
    return undefined;
  }

  /** The lowest-handle co-affiliate who could teach this student `nodeId`. */
  teacherFor(student: MageHandle, nodeId: ContentId): MageHandle | undefined {
    if (!this.#admitsLesson(student, nodeId)) return undefined;
    for (const teacher of this.teachingRosterFor(student)) {
      if (teacher === student) continue;
      if (this.canTeach(teacher, nodeId)) return teacher;
    }
    return undefined;
  }

  /**
   * A node's `teachCost` (`contracts.md` §2.3) under this universe's `acquire`
   * hook, in `fp` mage-months.
   *
   * Under the hook rather than as authored, because this is what the outlook
   * builder scores a `seek-teaching` goal against and
   * {@link contributeTeaching} charges the same number. Quoting the authored
   * cost here made True Naming's halved teaching invisible to every mage
   * deciding whether to seek a teacher at all.
   *
   * The pair's cost rather than a learner's solo cost, which is what makes a
   * teachable node score above researching the same node alone. Not on the port
   * — `rules-world` asks about *targets*, not about node records — so it is
   * offered here for the outlook builder next door.
   */
  teachCostOf(nodeId: ContentId): Fp {
    const node = this.#deps.catalog.node(nodeId);
    return node === undefined ? 0 : this.#deps.acquire.teachCost(node.teachCost);
  }

  /**
   * Spends mage-months on deriving a node, and creates the instance on the tick
   * the requirement is met.
   *
   * The arithmetic is entirely `rules-magic`'s `research`: it owns the
   * requirement, the stream-3 jitter, the legality and prerequisite refusals and
   * the store bound. What this method owns is the one thing that function
   * deliberately does not — where the running total sits between two calls.
   *
   * A refusal leaves the stored total exactly where it was. `research` returns
   * the input progress unchanged on a refusal and draws nothing, so a mage whose
   * project became illegal keeps what she had spent: re-permitting the cell
   * restores the project along with the instances, which is the same
   * no-migration-needed property dormancy has.
   */
  contributeResearch(
    mage: MageHandle,
    nodeId: ContentId,
    mageMonths: Fixed,
    researchRate: Fixed = NEUTRAL_RATE,
  ): void {
    const ledger = this.#ledger('research');
    const rates = this.#ratesOf(mage);
    if (rates === undefined) return;

    const key = effortKey(EFFORT_KIND.research, mage, nodeId, 0);
    const outcome = research({
      knowledge: this.#deps.knowledge,
      catalog: this.#deps.catalog,
      cells: this.#deps.cells,
      ruleset: this.#deps.ruleset,
      rng: this.#rng('research'),
      subject: mage,
      nodeId,
      worldTick: this.#deps.state.clock.worldTick,
      progress: ledger.progressOf(key),
      effort: mageMonths,
      learnRate: rates.learnRate,
      // Vision §6a's contribution arrives here, and here rather than folded into
      // `mageMonths` because `research.ts` is explicit about which side of the
      // arithmetic a rate belongs on: *"a quick learner needs less progress
      // rather than earning more per step, which keeps a step's progress a
      // function of the effort supplied and nothing else — one place for rates
      // to apply instead of two."* Already stacked and already capped by the
      // caller, for the same reason: `research.ts` says *"researchRate arrives
      // already stacked"*, and a second fold is how two `+20%` bonuses come to
      // mean different things in two packages.
      //
      // Defaulted to `fp(1)` so a query-only caller and a world with neither god
      // nor university take exactly the path they took before.
      researchRate,
      rediscoveryAffinity: rates.rediscoveryAffinity,
      clampCounter: this.#clampCounter,
      store: this.#deps.store,
      // Both of `acquire`'s research-side answers arrive as one object: what the
      // node costs her, and what mastery the instance she finishes is created
      // at. `initialMastery` is deliberately not passed alongside it — one
      // route, so the two cannot be wired half-way.
      acquire: this.#deps.acquire,
    });

    if (outcome.refusal !== undefined) return;
    if (!outcome.completed) {
      ledger.accrue(key, outcome.progress - ledger.progressOf(key));
      return;
    }
    ledger.clear(key);
    this.#completed.push({
      kind: EFFORT_KIND.research,
      subject: mage,
      counterparty: 0,
      nodeId,
    });
  }

  /**
   * Spends mage-months on one lesson, and transmits the node when the pair has
   * paid `teachCost`.
   *
   * **One project for the two of them.** `contracts.md` §2.3 prices teaching as
   * a single cost, and both mages have goals pointed at it — the teacher's
   * `teach` and the student's `seek-teaching`. So the row is keyed on the pair
   * and either side's month lands in the same total. Two rows would have let one
   * lesson finish twice and put two instances of one node in one student's head.
   *
   * Progress is **clamped at the requirement** when the transmission itself is
   * refused — the pair has done the work, and the lesson is blocked by something
   * else (a prerequisite the student lost, a full personal store, an
   * interdiction). Left unclamped it would climb forever while the feasibility
   * mask took its time noticing.
   */
  contributeTeaching(
    teacher: MageHandle,
    student: MageHandle,
    nodeId: ContentId,
    mageMonths: Fixed,
  ): void {
    const ledger = this.#ledger('teaching');
    const node = this.#deps.catalog.node(nodeId);
    if (node === undefined) return;

    // The tradition's price, not the authored one, and read once so the gate
    // below and the clamp further down cannot come to different conclusions.
    const required = this.#deps.acquire.teachCost(node.teachCost);
    const key = effortKey(EFFORT_KIND.teaching, teacher, nodeId, student);
    const progress = ledger.accrue(key, mageMonths);
    if (progress < required) return;

    const outcome = teach({
      knowledge: this.#deps.knowledge,
      catalog: this.#deps.catalog,
      cells: this.#deps.cells,
      ruleset: this.#deps.ruleset,
      rng: this.#rng('teaching'),
      teacher,
      student,
      nodeId,
      worldTick: this.#deps.state.clock.worldTick,
      store: this.#deps.store,
    });

    if (outcome.refusal !== undefined) {
      ledger.clampTo(key, required);
      return;
    }
    ledger.clear(key);
    this.#completed.push({
      kind: EFFORT_KIND.teaching,
      subject: teacher,
      counterparty: student,
      nodeId,
    });
  }

  /**
   * Spends scribe-months at the desk, and writes the book when the tier's
   * capacity cost is met.
   *
   * Two costs, and only one of them accrues. `scribeCapacityCost(tier)` is
   * *time* and is what this total counts; the node's `scribeCost` is *materials*
   * and is paid in the single tick the book is finished, because §1.1 makes
   * materials a universe balance and a half-written book that had already
   * consumed half its parchment would be a stock nobody could reconcile.
   *
   * A refusal for want of materials therefore holds the finished work at the
   * requirement and tries again next tick, which is what a scribe with a full
   * desk and an empty storeroom actually does.
   *
   * **The finished book is shelved, not handed over.** See the module note on
   * why the scriptorium's output is the institution's. The holder is chosen here
   * and passed *into* `scribe`, so the grimoire record and the instance's
   * location are written from one derivation in one call.
   */
  contributeScribing(mage: MageHandle, nodeId: ContentId, scribeMonths: Fixed): void {
    const ledger = this.#ledger('scribing');
    const materials = this.#deps.materials;
    if (materials === undefined) {
      throw new Error(
        'Scribing needs the universe materials stock: contracts.md §1.1 makes materials a ' +
          "universe-level balance and rules-magic's `scribe` reports what it consumed rather " +
          'than deducting it. Supply `materials` on the gateway deps.',
      );
    }
    const node = this.#deps.catalog.node(nodeId);
    const rates = this.#ratesOf(mage);
    if (node === undefined || rates === undefined) return;

    const key = effortKey(EFFORT_KIND.scribing, mage, nodeId, 0);
    const required = scribeCapacityCost(node.tier);
    const progress = ledger.accrue(key, scribeMonths);
    if (progress < required) return;

    const shelf = this.#shelfFor(mage);
    const outcome = scribe({
      knowledge: this.#deps.knowledge,
      catalog: this.#deps.catalog,
      cells: this.#deps.cells,
      ruleset: this.#deps.ruleset,
      rng: this.#rng('scribing'),
      scribe: mage,
      nodeId,
      worldTick: this.#deps.state.clock.worldTick,
      store: storeHookOf(this.#deps.store),
      scribeAffinity: rates.scribeAffinity,
      scribeCapacity: progress,
      materials: materials.available(),
      holderKind: shelf === 0 ? HOLDER_KIND.mage : HOLDER_KIND.library,
      holderId: shelf === 0 ? mage : shelf,
    });

    if (outcome.refusal !== undefined) {
      ledger.clampTo(key, required);
      return;
    }
    materials.consume(outcome.materialsConsumed);
    ledger.clear(key);
    this.#completed.push({
      kind: EFFORT_KIND.scribing,
      subject: mage,
      counterparty: 0,
      nodeId,
    });
  }

  /**
   * This mage's best mastery of a node she holds, or `0`.
   *
   * The same reading {@link canTeach} takes — the best copy, not the stalest —
   * so that "how stale is she in this subject" has one answer across the outlook
   * builder, the teaching mask and the staleness count.
   */
  masteryOf(mage: MageHandle, nodeId: ContentId): Fp {
    return this.#holdings(mage).get(nodeId) ?? 0;
  }

  /**
   * A node this mage holds and **has lost teaching standing in**, or
   * `undefined`.
   *
   * Two of the three conditions are `practice`'s own refusals — permitted cell,
   * held instance — asked here so that the utility-AI never commits a month to a
   * project that can never complete. `remainingCost` is the months still owed
   * **after** what she has already banked, because the outlook quotes it to
   * `target-appeal.ts`' effort term and a mage two months from finishing should
   * read as cheaper than one who has not started.
   *
   * ## The third condition is `DEFAULT_TEACH_THRESHOLD`, not `MASTERY_MAX`
   *
   * The rule refuses only at full mastery, and offering candidates on that gate
   * was measured to be wrong in two directions at once.
   *
   * **It never empties.** `MASTERY_DECAY_PER_TICK` takes a point off every held
   * instance every month, so *below full mastery* is a condition every instance
   * in the universe satisfies within a month of acquiring it. A goal that is
   * feasible for every mage on every tick forever is not a goal that competes
   * for the month; it is one that wins the month by default, and the appeal
   * terms behind it — `GOAL_BASE_APPEAL`, `OPPORTUNITY_PER_STALE_HOLDING` — were
   * written for a candidate list that could be empty.
   *
   * **And its far end is nearly free of value.** A mage practising a node at
   * `fp(1023)` pays a whole month and `practice`'s clamp gives her back **one**
   * point. The quantum is `PRACTICE_MASTERY_RESTORE`; what she banks is
   * `min(before + quantum, MASTERY_MAX) - before`. Every month spent in the top
   * eighth of the scale is a month bought at up to 128× the price of the same
   * month spent by a scholar who has fallen out of standing.
   *
   * `DEFAULT_TEACH_THRESHOLD` is the line that already means something here: it
   * is what {@link staleHoldings} counts against, what `canTeach` reads, and
   * what `ages-of-magic.md` §2c's *"faculty who have not had a new result in
   * twenty years"* have fallen below. Gating candidacy on it makes practice a
   * **hysteresis loop around teaching standing** — she drops below, she
   * practises back over, she stops and goes back to the frontier — which is the
   * publish-or-perish loop the goal was built for and *not* a permanent
   * top-up.
   *
   * ## Why this is narrower than `isPractisable`, deliberately
   *
   * `rules-magic`' `isPractisable` still mirrors `practice`'s refusals exactly
   * and is right to: it answers *would the rule refuse this*. This answers
   * *should autonomy be offered this*, and the two are allowed to differ in one
   * direction only — never offer what the rule would refuse. Offering **less**
   * than the rule accepts is already the case here (`MAX_CANDIDATE_TARGETS`
   * truncates the list), and this is the same asymmetry with a reason attached.
   *
   * ## What it was measured to cost and buy
   *
   * On thirty-two paired seeds of the reference long run, gating at
   * `MASTERY_MAX` cut library **breadth** by 6.3 distinct nodes against a
   * practice-free control (`t = -2.96`) while leaving the book count unchanged —
   * the same volume of copies spread over fewer subjects — and killed the last
   * scribing window outright on four of eight seeds at the two-century horizon.
   * `docs/design/practice-results.md` records both series and the control.
   */
  practisableBy(mage: MageHandle, nodeId: ContentId): KnowledgeTarget | undefined {
    const node = this.#deps.catalog.node(nodeId);
    if (node === undefined) return undefined;
    if (!permits(this.#deps.ruleset, this.#deps.cells.cellOf(nodeId))) return undefined;
    const mastery = this.#holdings(mage).get(nodeId);
    if (mastery === undefined || mastery >= DEFAULT_TEACH_THRESHOLD) return undefined;

    const required = practiceRequirement(node);
    // The banked months, when there is a ledger to ask. A query-only gateway —
    // the observation path — has none, and quoting the full price there is
    // right: it is the price of starting, which is what a reader of an
    // observation is being told.
    const banked =
      this.#deps.effort?.progressOf({
        subject: mage,
        kind: EFFORT_KIND.practice,
        nodeId,
        counterparty: 0,
      }) ?? 0;

    const facets = this.#deps.facets(nodeId);
    return {
      nodeId,
      tier: node.tier,
      remainingCost: Math.max(required - banked, 0),
      cellId: facets.cellId,
      formId: facets.formId,
      primitives: facets.primitives,
    };
  }

  /**
   * How many nodes this mage holds at a mastery below the teaching threshold.
   *
   * The count `ages-of-magic.md` §2c's 93.4% is the population share of, asked
   * per mage. Her *best* copy of each node is the one compared, because that is
   * the copy `canTeach` reads: a scholar with one stale duplicate and one fresh
   * copy has not lost her standing in that subject.
   */
  staleHoldings(mage: MageHandle): number {
    let stale = 0;
    for (const mastery of this.#holdings(mage).values()) {
      if (mastery < DEFAULT_TEACH_THRESHOLD) stale += 1;
    }
    return stale;
  }

  /**
   * Spends mage-months keeping a node sharp, and restores a mastery quantum on
   * the tick the requirement is met.
   *
   * The arithmetic is entirely `rules-magic`'s `practice`; what this method owns
   * is where the running total sits between two calls, which is the same
   * division of labour {@link contributeResearch} describes.
   *
   * **No RNG.** `practice` draws nothing — see its module note — so unlike the
   * other three accruals this one does not reach for `#rng`, and a gateway built
   * without one can still run it. That is the property that keeps every
   * committed balance baseline's stream sequences untouched by this change.
   */
  contributePractice(
    mage: MageHandle,
    nodeId: ContentId,
    mageMonths: Fixed,
    practiceRate: Fixed = NEUTRAL_RATE,
  ): void {
    const ledger = this.#ledger('practice');
    const key = effortKey(EFFORT_KIND.practice, mage, nodeId, 0);
    const outcome = practice({
      knowledge: this.#deps.knowledge,
      catalog: this.#deps.catalog,
      cells: this.#deps.cells,
      ruleset: this.#deps.ruleset,
      subject: mage,
      nodeId,
      worldTick: this.#deps.state.clock.worldTick,
      progress: ledger.progressOf(key),
      effort: mageMonths,
      practiceRate,
    });

    if (outcome.refusal !== undefined) return;
    if (!outcome.completed) {
      ledger.accrue(key, outcome.progress - ledger.progressOf(key));
      return;
    }
    // Cleared rather than carried: a completed quantum is a finished project,
    // and leaving the surplus behind would let a mage bank months against a node
    // she is about to abandon and cash them all at once on returning to it.
    ledger.clear(key);
    this.#completed.push({
      kind: EFFORT_KIND.practice,
      subject: mage,
      counterparty: 0,
      nodeId,
    });
  }

  /**
   * Every project that reached its requirement while this gateway was alive.
   *
   * A projection, never an input to a rule: `contracts.md` §4.4 keeps the
   * explain channel out of the rules path, and the one thing the world loop does
   * with this is hand `stepMageAutonomy` the `isComplete` judgement it already
   * asks the caller for.
   */
  completions(): readonly CompletedEffort[] {
    return this.#completed;
  }

  /**
   * A mage has died: her mind and memory-palace instances go with her, her
   * books do not.
   *
   * `contracts.md` §1.5 and `rules-world`'s `death.ts` between them decide where
   * the books go; this call is the single path by which the knowledge side hears
   * about it, which is what makes vision §5's "knowledge is physical" claim
   * testable in one place instead of five.
   *
   * The estate is settled **here** rather than through
   * {@link GatewayDeps.onGrimoiresInherited}, because §1.5's answer needs the
   * knowledge subsystem to rewrite each book's one instance alongside its holder
   * field, and the subsystem is this class's. The hook survives for a caller that
   * wants to *observe* the transfer; it is no longer the thing that performs it,
   * and a caller that omitted it no longer silently leaves books on a corpse.
   */
  onMageDied(mage: MageHandle, inheritor: UniversityHandle): void {
    const knowledge = this.#deps.knowledge;
    // **Which locations a death takes is the `store` hook's answer, not this
    // method's.** It used to be `destroyInstancesHeldBy`, which destroys mind
    // *and* palace unconditionally — the right answer under both v1 store kinds,
    // and right by coincidence rather than by rule: `perishesWithHolder` is the
    // declaration that says so, and it had no production caller anywhere. A
    // fourth store kind that let a palace outlive its holder would have been
    // written, loaded, and silently ignored here.
    //
    // A book is untouched either way: a grimoire's instance sits at `grimoire`
    // or `library`, and no store kind in the enumeration lists either as
    // perishing. Burning one takes a fire.
    const perishing = knowledge
      .instancesHeldBy(mage)
      .filter((instance) =>
        perishesWithHolder(this.#deps.store, knowledge.read(instance).locationKind as LocationKindValue),
      );
    knowledge.destroyAll(perishing, this.#deps.state.clock.worldTick);
    this.#settleEstate(mage, inheritor);
    this.#deps.onGrimoiresInherited?.(mage, inheritor);
  }

  /**
   * Takes a library's least-loved books away, because it could not be kept.
   *
   * The `universities` requirement *Libraries impose upkeep proportional to
   * depth* ends with the clause this method exists for: *"the shortfall MUST
   * degrade libraries deterministically rather than driving materials
   * negative."* `applyLibraryUpkeep` decides **what is owed and what went
   * unpaid** — that is an economy question and `rules-world` owns it — and this
   * is the port that spends the unpaid part against actual books, because
   * `contracts.md` §5 rule 3 keeps `rules-world` out of `rules-magic` and it
   * therefore may not know that a shelf holds books at all.
   *
   * ## A shortfall budget, not an instance count — and why that is the fix
   *
   * This used to take a count, computed upstream as `floorDiv(shortfall, 32)`.
   * Every book on the shelf then cost the same 32 of unpaid upkeep, which made
   * a grimoire's `durability` — the one structural difference between the
   * species, dwarf `scribeAffinity` 1792 against orc 384 — a number written once
   * at scribing and read only by a raid consequence that has never run.
   *
   * It now takes the shortfall itself and spends it: a book costs
   * `max(1, floorDiv(durability, DEGRADATION_PER_SHORTFALL))`, so neglect
   * destroys a dwarven library about four and a half times more slowly than an
   * orcish one holding the same number of books. At the reference affinity of
   * `fp(1024)` the price is exactly 32 — the flat number it replaces — so
   * nothing is switched off and nothing is made cheaper by default. Vision §5's
   * written record persists *and can still be lost*, which is the whole point:
   * this is the only non-raid destruction channel in the game.
   *
   * A book with no `GRIMOIRE` record behind it — an instance shelved by some
   * path that did not scribe it — is priced at `DEGRADATION_PER_SHORTFALL`, the
   * reference cost, rather than free. Free would make an unrecorded book
   * immortal-adjacent in reverse: infinitely cheap to destroy.
   *
   * **Duplicates first, then ascending instance handle.** A library that must
   * shed books sheds ones it holds twice before it sheds anything it holds
   * once, which is what a librarian does and what makes the brake a cost on
   * *hoarding* rather than a randomised loss of the archive. `libraryDependence`
   * is the metric that would otherwise be moved by a brake meant to charge for
   * shelf space. Ascending handle is the tie-break, for `applyLibraryUpkeep`'s
   * own reason: handles are stable identities and iteration order is a function
   * of the destroy history. Durability does **not** reorder the shelf — it
   * prices it. Sorting by durability would quietly turn the brake into "the
   * worst books go first", which is a different mechanic nobody asked for and
   * would hide the hoarding cost behind a quality cull.
   *
   * For the same reason the walk **stops** at the first book it cannot afford
   * rather than skipping past it to a cheaper one further down. Skipping is
   * cheapest-first wearing a disguise: it would take the flimsiest books on a
   * mixed shelf whatever order the librarian was supposed to use, and a
   * well-made book at the head of the queue would stop protecting the shelf
   * behind it. Stopping means one sturdy duplicate can shield a tick's worth of
   * neglect, which is what a sturdy book *is*.
   *
   * No RNG is drawn here, so no stream is re-rolled and no committed baseline
   * rots for a draw that moved.
   *
   * @param shortfall - Unpaid upkeep for this library this tick, `fp`.
   * @returns how many instances were actually destroyed, and how many of them
   * were the last copy in the universe of their node — which the world loop adds
   * to `nodesLost`, because a node whose last copy rotted off a shelf has left
   * the universe exactly as surely as one whose holder died.
   */
  degradeLibrary(
    library: Handle,
    shortfall: Fixed,
    worldTick: number,
  ): { destroyed: number; nodesLost: number } {
    if (shortfall <= 0) return { destroyed: 0, nodesLost: 0 };
    const knowledge = this.#deps.knowledge;

    const shelved = [...knowledge.instancesAt(LOCATION_KIND.library, library)].sort(
      (a, b) => a - b,
    );
    // A stable partition rather than a sort on a mutating count: the first copy
    // of each node in ascending handle order is the one kept back, and every
    // later copy is offered up first.
    const duplicates: Handle[] = [];
    const singles: Handle[] = [];
    const kept = new Set<ContentId>();
    for (const instance of shelved) {
      const nodeId = knowledge.read(instance).nodeId;
      if (kept.has(nodeId)) duplicates.push(instance);
      else {
        kept.add(nodeId);
        singles.push(instance);
      }
    }

    let budget = shortfall;
    let destroyed = 0;
    let nodesLost = 0;
    for (const instance of [...duplicates, ...singles]) {
      const price = this.#neglectPriceOf(instance);
      if (price > budget) break;
      budget -= price;
      const loss = knowledge.destroyInstance(instance, worldTick);
      destroyed += 1;
      if (loss !== undefined) nodesLost += 1;
    }
    return { destroyed, nodesLost };
  }

  /**
   * Unpaid upkeep it takes to destroy one shelved instance.
   *
   * Floors at 1 so that no book, however flimsily made, is free to lose — a
   * price of zero would let a single tick of shortfall empty an entire shelf.
   */
  #neglectPriceOf(instance: Handle): Fixed {
    const grimoire = this.#deps.knowledge.grimoireHolding(instance);
    if (grimoire === 0) return DEGRADATION_PER_SHORTFALL;
    const store = componentOf(this.#deps.state, GRIMOIRE);
    if (!store.has(grimoire as EntityHandle)) return DEGRADATION_PER_SHORTFALL;
    const durability = readRecord(this.#deps.state, GRIMOIRE, grimoire as EntityHandle).durability;
    return Math.max(1, floorDiv(durability, DEGRADATION_PER_SHORTFALL));
  }

  /** Every node this mage holds in mind or palace, ascending by node id. */
  heldNodes(mage: MageHandle): readonly ContentId[] {
    return [...this.#holdings(mage).keys()].sort((a, b) => a - b);
  }

  /**
   * Every node this mage could **cast right now**, ascending by node id.
   *
   * Three of `gatherEffects`' four gates, asked of one mage instead of of every
   * instance in the universe: held at a mind or a memory palace (which is what
   * `#holdings` already walks), mastery at or above
   * {@link MASTERY_ACTIVATION_THRESHOLD}, and the cell permitted **now**. The
   * fourth — whether the primitive applies in this time mode — is a question
   * about an *effect* and belongs to whoever is spending it.
   *
   * The threshold is `rules-magic`'s own constant rather than a second copy.
   * `universe-effects.ts` makes the argument at length and it is the same one
   * here: two answers to *"can she cast this"* would diverge, and the one
   * without the adversarial test would be the one a mage's career ran on.
   *
   * Permission is evaluated at the moment of the question, so an interdiction
   * takes the verb away without touching what anybody knows — which is what an
   * interdiction is.
   */
  castableNodes(mage: MageHandle): readonly ContentId[] {
    const found: ContentId[] = [];
    for (const [nodeId, mastery] of this.#holdings(mage)) {
      if (mastery < MASTERY_ACTIVATION_THRESHOLD) continue;
      if (!permits(this.#deps.ruleset, this.#deps.cells.cellOf(nodeId))) continue;
      found.push(nodeId);
    }
    return found.sort((a, b) => a - b);
  }

  /**
   * The living mages a teachability scan may consider **for this mage**:
   * everyone sharing her affiliation, ascending by slot, bounded by
   * {@link MAX_TEACHING_COUNTERPARTIES}.
   *
   * ## The institutional boundary, and it lives here
   *
   * This is the one hole in a container that otherwise works. `universityId`
   * already decides which library a mage's books are shelved into
   * ({@link #shelfFor}), how many scribe-months she can draw on, and whether she
   * would rather be somewhere else — and it decided nothing at all about who
   * could teach her. Knowledge was therefore universally available inside the
   * arbitrary lowest-32, which is why W24 could site two universities with
   * genuinely different capabilities and watch their knowledge refuse to
   * diverge: *siting can only matter if what a site holds can differ.*
   *
   * Cross-institution transfer is not forbidden, it is **routed**: a mage who
   * wants what another university knows adopts `affiliate`, which already exists
   * (`rules-world/src/autonomy/affiliation.ts`) and completes in one tick with
   * no travel state, so no position model is smuggled in behind a teaching rule.
   *
   * ## `universityId === 0` is a container too — the commons
   *
   * The rule is uniform: *same id teaches same id*, and `0` is an id. So the
   * unaffiliated form one open pool rather than a crowd of hermits. Two reasons,
   * and the second is the one that decides it.
   *
   * The design reason: episode 38's travelling educator is a diffusion mechanism
   * *in tension with* institutional concentration, and it needs somewhere to
   * live. The commons is that somewhere — knowledge moves freely in it, and does
   * not cross into a university without someone joining one.
   *
   * The mechanical reason: a special case here would be an asymmetry no rule
   * states, and asymmetries in a predicate that gates a whole mechanic are how
   * a boundary becomes a bug. `#sharesInstitution` is one comparison, and it is
   * the only place affiliation gates teaching.
   *
   * **What the strict alternative would have cost, measured rather than
   * argued:** every mage promoted after founding is created unaffiliated
   * (`world-step.ts`'s promotion phase passes no university), so a strict rule
   * would put 87 of 89 living mages at world year 200 in a pool of one. That is
   * not a boundary, it is an off switch, and it would have made the divergence
   * measurement a measurement of the affiliation pipeline instead.
   */
  teachingRosterFor(mage: MageHandle): readonly MageHandle[] {
    return this.#rosterOf(this.#universityOf(mage));
  }

  /** The bounded roster of one institution, `0` included. */
  #rosterOf(university: Handle): readonly MageHandle[] {
    return this.#byUniversity().get(university) ?? NO_COUNTERPARTIES;
  }

  /**
   * Living mages grouped by affiliation, from one pass, each group bounded.
   *
   * One pass rather than one per mage, for the reason every other index on this
   * class is memoized: the outlook phase asks per mage, and re-walking `MAGE`
   * per question would put back the `mages × mages` scan the bound exists to
   * avoid. A gateway is a view of one phase, so the grouping cannot go stale
   * inside one — see the module note.
   */
  #byUniversity(): Map<Handle, MageHandle[]> {
    if (this.#rosters !== undefined) return this.#rosters;
    const store = componentOf(this.#deps.state, MAGE);
    const alive = store.field('alive');
    const universities = store.field('universityId');
    const found = new Map<Handle, MageHandle[]>();
    store.forEach((row, handle) => {
      if ((alive[row] as number) === 0) return;
      const university = universities[row] as Handle;
      let roster = found.get(university);
      if (roster === undefined) {
        roster = [];
        found.set(university, roster);
      }
      if (roster.length >= MAX_TEACHING_COUNTERPARTIES) return;
      roster.push(handle as Handle);
    });
    this.#rosters = found;
    return found;
  }

  /**
   * Whether a pair share an institution, which is the whole boundary.
   *
   * Asked at the pair rather than trusted to the roster walk, because
   * {@link teachableTo} is on the `rules-world` port and a caller with two
   * handles must not be able to reach past the rule by not having gone through
   * {@link teachingRosterFor}.
   */
  #sharesInstitution(a: MageHandle, b: MageHandle): boolean {
    return this.#universityOf(a) === this.#universityOf(b);
  }

  /** A mage's affiliation, or `0` — unaffiliated, and for a row that is gone. */
  #universityOf(mage: MageHandle): Handle {
    const cached = this.#affiliations.get(mage);
    if (cached !== undefined) return cached;
    const store = componentOf(this.#deps.state, MAGE);
    const university = store.has(mage as EntityHandle)
      ? store.get(mage as EntityHandle, 'universityId')
      : 0;
    this.#affiliations.set(mage, university);
    return university;
  }

  /**
   * What one mage holds in mind or palace: node id to best mastery.
   *
   * ## One pass over the instances for the whole phase, not one per question
   *
   * Every question this class answers about holdings — `knows`, `canTeach`,
   * `teachableTo`, the frontier's "does she have this already" — used to walk
   * the instance component, and `KnowledgeSubsystem.instancesHeldBy` is a scan.
   * The teachability scan asks per *pair*, so the cost was
   * `mages × counterparties × instances`, which is invisible while nobody
   * finishes anything and quadratic the moment they do. Nothing was wrong with
   * it until this file started completing research; it is fixed here rather than
   * left as a surprise for the first long run.
   *
   * So the whole table is built once, lazily, from a single pass over
   * `KNOWLEDGE_INSTANCE` — and it is a `Map` per mage rather than a set, because
   * "well enough to teach" is a question a set cannot answer and reading mastery
   * separately would put the scan straight back.
   *
   * Highest mastery wins where a mage holds two instances of one node, which is
   * reachable through raid theft; `heldMastery` makes the same choice, and
   * teaching from the worse copy would be a rule nobody wrote down.
   */
  #holdings(mage: MageHandle): ReadonlyMap<ContentId, Fp> {
    if (this.#heldByMage === undefined) {
      const byMage = new Map<MageHandle, Map<ContentId, Fp>>();
      const store = componentOf(this.#deps.state, KNOWLEDGE_INSTANCE);
      const nodeIds = store.field('nodeId');
      const locationKinds = store.field('locationKind');
      const locationIds = store.field('locationId');
      const masteries = store.field('mastery');
      store.forEach((row) => {
        if (!isHeldAtMind(locationKinds[row] as number)) return;
        const holder = locationIds[row] as Handle;
        const nodeId = nodeIds[row] as ContentId;
        const mastery = masteries[row] as Fp;
        let held = byMage.get(holder);
        if (held === undefined) {
          held = new Map<ContentId, Fp>();
          byMage.set(holder, held);
        }
        const best = held.get(nodeId);
        if (best === undefined || mastery > best) held.set(nodeId, mastery);
      });
      this.#heldByMage = byMage;
    }
    return this.#heldByMage.get(mage) ?? EMPTY_HOLDINGS;
  }

  /**
   * Every node this universe's ruleset permits, ascending by id.
   *
   * One `permits()` call per populated cell for the whole phase, rather than one
   * per node per mage: the ruleset is fixed for a gateway's life — that is what
   * makes a gateway a view of one phase — so the answer cannot change underneath
   * this. A universe running the v1 rectangle turns 300 nodes into 51 here, once,
   * and every mage's frontier walks the 51.
   *
   * Ascending id rather than cell-major, which is the order the cell index hands
   * them over in. Both are total orders over the content set and neither is
   * observable through {@link researchFrontier} — its result is sorted by
   * `compareTargets`, which breaks its own ties on node id. Ascending is chosen
   * because it is the order the frontier walked before this changed, so the
   * *only* behavioural difference this method introduces is which nodes are in
   * the list, and a reader diffing a run has one thing to account for.
   */
  #legalNodeIds(): readonly ContentId[] {
    if (this.#legalNodes !== undefined) return this.#legalNodes;
    this.#nodesByCell ??=
      this.#deps.nodesByCell ?? cellNodeIndex(this.#deps.catalog, this.#deps.cells);

    const legal: ContentId[] = [];
    for (const cellId of this.#nodesByCell.populatedCellIds()) {
      if (!permits(this.#deps.ruleset, cellId)) continue;
      for (const nodeId of this.#nodesByCell.nodesIn(cellId)) legal.push(nodeId);
    }
    legal.sort((a, b) => a - b);
    this.#legalNodes = legal;
    return legal;
  }

  /**
   * Moves every book still in a dead mage's hands to where §1.5 puts it.
   *
   * The affiliated case is ordinarily empty — her books went to the shelf as
   * they were written — so this is the fallback path made correct rather than
   * the mechanism library depth depends on. Both branches go through
   * `rules-magic`'s single `placeGrimoire` derivation, so the holder field and
   * the instance's location cannot disagree.
   *
   * Ascending slot order, from {@link #grimoiresHeldBy}'s one pass, because the
   * mortality phase settles several estates against one gateway and a raid
   * report two peers ordered differently is a desync attributed to something
   * else a month later.
   */
  #settleEstate(mage: MageHandle, inheritor: UniversityHandle): void {
    const books = this.#grimoiresHeldBy(mage);
    if (books.length === 0) return;
    const library = inheritor === NO_INHERITOR ? 0 : this.#libraryOf(inheritor);
    for (const grimoire of books) {
      if (library === 0) disownGrimoire(this.#deps.knowledge, grimoire);
      else shelveGrimoire(this.#deps.knowledge, grimoire, library);
    }
    this.#grimoiresByHolder?.delete(mage);
  }

  /**
   * The library this mage's books are written into, or `0` for her own hands.
   *
   * Two field reads behind a per-phase memo, because the work phase asks it once
   * per finished book and a mage who writes a shelf-ful in one run of the sweep
   * should not pay for the lookup each time.
   */
  #shelfFor(mage: MageHandle): Handle {
    const cached = this.#shelves.get(mage);
    if (cached !== undefined) return cached;

    const mages = componentOf(this.#deps.state, MAGE);
    const shelf = mages.has(mage as EntityHandle)
      ? this.#libraryOf(mages.get(mage as EntityHandle, 'universityId'))
      : 0;
    this.#shelves.set(mage, shelf);
    return shelf;
  }

  /**
   * A university's library handle, or `0`.
   *
   * `0` for an unaffiliated mage (§0's absent reference), for a university whose
   * row is gone, and for a `libraryId` that names no live library — the last
   * because shelving into a handle nothing owns would put a book somewhere
   * `libraryDepth` counts and `destroyLibrary` can never reach, which is the
   * shape of loss a metric silently understates.
   */
  #libraryOf(university: UniversityHandle): Handle {
    if (university === 0) return 0;
    const universities = componentOf(this.#deps.state, UNIVERSITY);
    if (!universities.has(university as EntityHandle)) return 0;
    const library = universities.get(university as EntityHandle, 'libraryId');
    if (library === 0) return 0;
    return componentOf(this.#deps.state, LIBRARY).has(library as EntityHandle) ? library : 0;
  }

  /**
   * Books a mage is recorded as holding, ascending by slot, from one pass.
   *
   * One scan of `GRIMOIRE` for the whole phase rather than one per death: the
   * mortality phase kills a batch against a single gateway, and per-death
   * scanning is `deaths × grimoires`, which is free while nothing writes books
   * and quadratic once a universe has spent twenty years writing them. The map
   * stays true across the phase because the only holder a settlement changes is
   * the one it removes.
   */
  #grimoiresHeldBy(mage: MageHandle): readonly Handle[] {
    if (this.#grimoiresByHolder === undefined) {
      const byHolder = new Map<MageHandle, Handle[]>();
      const store = componentOf(this.#deps.state, GRIMOIRE);
      const holderKinds = store.field('holderKind');
      const holderIds = store.field('holderId');
      store.forEach((row, handle) => {
        if ((holderKinds[row] as number) !== HOLDER_KIND.mage) return;
        const holder = holderIds[row] as Handle;
        const held = byHolder.get(holder);
        if (held === undefined) byHolder.set(holder, [handle as Handle]);
        else held.push(handle as Handle);
      });
      this.#grimoiresByHolder = byHolder;
    }
    return this.#grimoiresByHolder.get(mage) ?? EMPTY_BOOKS;
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

  /**
   * Whether a student could receive this node from somebody: within her depth
   * ceiling, legal here, not already known, prerequisites held.
   *
   * Everything the pair needs *except* the teacher's mastery, which is the
   * teacher's half and is asked separately by {@link canTeach}. Split that way
   * because the two questions have different answers for the same node depending
   * which end you stand at, and one predicate that took both would be called
   * with the arguments the wrong way round eventually.
   */
  #admitsLesson(student: MageHandle, nodeId: ContentId): boolean {
    const rates = this.#ratesOf(student);
    if (rates === undefined) return false;
    const node = this.#deps.catalog.node(nodeId);
    if (node === undefined || node.tier > rates.depthCeiling) return false;
    if (!permits(this.#deps.ruleset, this.#deps.cells.cellOf(nodeId))) return false;
    if (this.knows(student, nodeId)) return false;
    return this.#prerequisitesHeld(student, node.prerequisites);
  }

  /** The ledger, or a refusal naming what the caller left out. */
  #ledger(kind: string): EffortLedger {
    const ledger = this.#deps.effort;
    if (ledger === undefined) {
      throw new Error(
        `Cannot accrue ${kind} work: this gateway was built without an effort ledger, so there is ` +
          'nowhere for partial progress to persist. Pass `effort` on the gateway deps. A gateway ' +
          'without one is query-only by construction, which is what the observation and outlook ' +
          'paths want.',
      );
    }
    return ledger;
  }

  /** The step's RNG, or a refusal. Every accrual draws; see `rules-magic`. */
  #rng(kind: string): KnowledgeRng {
    const rng = this.#deps.rng;
    if (rng === undefined) {
      throw new Error(
        `Cannot accrue ${kind} work without the step's RNG: research, teaching and scribing each ` +
          'draw from their own stream, and a draw skipped is a stream whose ordinals no longer ' +
          'line up with any recorded baseline. Pass `rng` on the gateway deps.',
      );
    }
    return rng;
  }
}

/** One project's addressing key. See `effort-store.ts` for why it has four parts. */
export function effortKey(
  kind: EffortKindValue,
  subject: MageHandle,
  nodeId: ContentId,
  counterparty: MageHandle,
): EffortKey {
  return { subject, kind, nodeId, counterparty };
}

/**
 * The narrow view of the `store` hook that scribing takes.
 *
 * `keepsWrittenCopies` is the policy's own `scribingAvailable`, not anything
 * this file infers, so the Art of Memory refuses because of what it declares and
 * not because this module knows its name — the four extension points stay the
 * only place a tradition changes anything.
 */
function storeHookOf(policy: StorePolicy): StoreHook {
  return { kind: policy.kind, keepsWrittenCopies: scribeAvailability(policy).available };
}

/** `fp(1.0)` — an unmodified rate (`contracts.md` §2.4's convention). */
const NEUTRAL_RATE: Fixed = 1024;

/** A mage who holds nothing. Shared, and never written to. */
const EMPTY_HOLDINGS: ReadonlyMap<ContentId, Fp> = new Map<ContentId, Fp>();

/** A mage with no books. Shared, and never written to. */
const EMPTY_BOOKS: readonly Handle[] = Object.freeze([]);

/** Whether a location kind is one a mage carries in her own head. */
export function isHeldAtMind(locationKind: number): boolean {
  return locationKind === LOCATION_KIND.mind || locationKind === LOCATION_KIND.palace;
}

/** A mage entity handle, re-exported so callers need not reach past this layer. */
export type { MageHandle } from '@mm/rules-world';

/** Handle alias, for the roster read above. */
export type LivingMage = EntityHandle;
