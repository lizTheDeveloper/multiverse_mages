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
 */

import type { ContentId, Fp } from '@mm/content';
import type { EntityHandle, Fixed, SimState } from '@mm/sim-core';
import type { EffortKindValue, Handle, Ruleset } from '@mm/state';
import {
  EFFORT_KIND,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  componentOf,
  permits,
} from '@mm/state';
import type {
  CellResolver,
  KnowledgeRng,
  KnowledgeSubsystem,
  NodeCatalog,
  StoreHook,
  StorePolicy,
} from '@mm/rules-magic';
import {
  DEFAULT_TEACH_THRESHOLD,
  research,
  researchRequirement,
  scribe,
  scribeCapacityCost,
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

import type { EffortKey, EffortLedger } from './effort-store.js';

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
  /** Every mage's held nodes and mastery, from one pass. See {@link #holdings}. */
  #heldByMage: Map<MageHandle, Map<ContentId, Fp>> | undefined;
  /** Node id to whether this universe's ruleset permits its cell. See {@link #permitted}. */
  readonly #permittedNode = new Map<ContentId, boolean>();
  /** Teacher to the nodes she could pass on to *somebody*. See {@link #teachable}. */
  readonly #teachableFrom = new Map<MageHandle, readonly ContentId[]>();
  /** The frontier scan's candidate list, built once. See {@link #scannable}. */
  #scannableNodes: readonly ScannableNode[] | undefined;

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

  everKnown(nodeId: ContentId): boolean {
    return this.#deps.knowledge.wasEverKnown(nodeId);
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
   */
  researchFrontier(mage: MageHandle, limit: number): readonly KnowledgeTarget[] {
    const rates = this.#ratesOf(mage);
    if (rates === undefined) return [];

    const found: KnowledgeTarget[] = [];
    // One read of this mage's ledger rows for the whole scan. See
    // `EffortLedger.bankedResearch`: the alternative is a key string per
    // candidate to look up the eight rows she could have.
    const banked = this.#deps.effort?.bankedResearch(mage) ?? EMPTY_PROGRESS;
    const discarded = createRediscoveryClampCounter();
    for (const { nodeId, node } of this.#scannable()) {
      if (found.length >= limit) break;
      if (this.knows(mage, nodeId)) continue;
      if (!this.#prerequisitesHeld(mage, node.prerequisites)) continue;

      const bankedHere = banked.get(nodeId) ?? 0;
      const requirement = researchRequirement(node, {
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
        // counted where the work happens, and folding scan-time quotes into it
        // would inflate the denominator with evaluations nobody paid for.
        //
        // One throwaway for the whole scan rather than one per node. Nothing
        // ever reads it, so what it accumulates cannot be observed — and a
        // fresh object per candidate per mage per tick was a hundred thousand
        // allocations a tick in a garbage collector that was already 13% of
        // the run.
        clampCounter: discarded,
      });
      found.push({ nodeId, tier: node.tier, remainingCost: Math.max(requirement - bankedHere, 0) });
    }
    return found;
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
   */
  teachableTo(teacher: MageHandle, student: MageHandle): ContentId | undefined {
    if (teacher === student) return undefined;
    const rates = this.#ratesOf(student);
    if (rates === undefined) return undefined;

    let best: ContentId | undefined;
    for (const nodeId of this.#teachable(teacher)) {
      if (best !== undefined && nodeId >= best) continue;
      const node = this.#deps.catalog.node(nodeId);
      if (node === undefined || node.tier > rates.depthCeiling) continue;
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
    // tradition changes anything.
    if (!this.#deps.store.scribingAvailable) return undefined;
    const node = this.#deps.catalog.node(nodeId);
    if (node === undefined) return undefined;
    if (!this.#permitted(nodeId)) return undefined;
    if (!this.knows(mage, nodeId)) return undefined;
    return { nodeId, tier: node.tier, remainingCost: node.scribeCost };
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
   */
  studentFor(teacher: MageHandle, nodeId: ContentId): MageHandle | undefined {
    if (!this.canTeach(teacher, nodeId)) return undefined;
    for (const student of this.livingMages()) {
      if (student === teacher) continue;
      if (this.#admitsLesson(student, nodeId)) return student;
    }
    return undefined;
  }

  /** The lowest-handle living mage who could teach this student `nodeId`. */
  teacherFor(student: MageHandle, nodeId: ContentId): MageHandle | undefined {
    if (!this.#admitsLesson(student, nodeId)) return undefined;
    for (const teacher of this.livingMages()) {
      if (teacher === student) continue;
      if (this.canTeach(teacher, nodeId)) return teacher;
    }
    return undefined;
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
  contributeResearch(mage: MageHandle, nodeId: ContentId, mageMonths: Fixed): void {
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
      // Neutral until the library's `research-rate` contribution is wired to a
      // staffed university. Stated rather than silently omitted: a stacked
      // multiplier defaulted to something other than `fp(1)` is a balance change
      // nobody asked for, and one defaulted to `fp(1)` is a bonus that is simply
      // not in effect yet.
      researchRate: NEUTRAL_RATE,
      rediscoveryAffinity: rates.rediscoveryAffinity,
      clampCounter: this.#clampCounter,
      store: this.#deps.store,
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

    const key = effortKey(EFFORT_KIND.teaching, teacher, nodeId, student);
    const progress = ledger.accrue(key, mageMonths);
    if (progress < node.teachCost) return;

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
      ledger.clampTo(key, node.teachCost);
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
   */
  onMageDied(mage: MageHandle, inheritor: UniversityHandle): void {
    this.#deps.knowledge.destroyInstancesHeldBy(mage, this.#deps.state.clock.worldTick);
    this.#deps.onGrimoiresInherited?.(mage, inheritor);
  }

  /** Every node this mage holds in mind or palace, ascending by node id. */
  heldNodes(mage: MageHandle): readonly ContentId[] {
    return [...this.#holdings(mage).keys()].sort((a, b) => a - b);
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
   * Whether this universe's ruleset permits the cell a node sits in.
   *
   * `permits` reads two bitmasks and then walks the edict list, and it decodes
   * the cell's two axes with a division to do it. The frontier scan asks it once
   * per candidate per mage, and the teachability scan once per held node per
   * pair, so a tick at a thousand mages asked the same few hundred questions
   * hundreds of thousands of times. It was 12% of a profiled run.
   *
   * Memoized on the gateway rather than anywhere longer-lived, because a gateway
   * is a view of one phase and a ruleset can be changed by an edict between two
   * of them — see the staleness note at the top of this file. Cached per *node*
   * rather than per cell because the caller always has a node id and the extra
   * entries cost one map slot each.
   */
  /**
   * The nodes the frontier scan considers, in ascending id, built once.
   *
   * The scan's first two tests — is there a node with this id, and does the
   * ruleset permit its cell — mention no mage, and the scan runs per mage, so
   * at a thousand mages the same few hundred questions were asked a few hundred
   * thousand times a tick. This answers them once for the phase and leaves the
   * loop with the two tests that are actually about the researcher.
   *
   * The candidate order and the point the caller's `limit` cuts the list are
   * unchanged: the ids come out ascending, exactly as the counting loop
   * produced them, and the entries this drops are entries that loop skipped.
   */
  #scannable(): readonly ScannableNode[] {
    if (this.#scannableNodes !== undefined) return this.#scannableNodes;
    const scanned = Math.min(this.#deps.catalog.nodeCount, MAX_FRONTIER_SCAN);
    const candidates: ScannableNode[] = [];
    for (let nodeId = 1; nodeId <= scanned; nodeId += 1) {
      const node = this.#deps.catalog.node(nodeId);
      if (node === undefined) continue;
      if (!this.#permitted(nodeId)) continue;
      candidates.push({ nodeId, node });
    }
    this.#scannableNodes = candidates;
    return candidates;
  }

  #permitted(nodeId: ContentId): boolean {
    const known = this.#permittedNode.get(nodeId);
    if (known !== undefined) return known;
    const legal = permits(this.#deps.ruleset, this.#deps.cells.cellOf(nodeId));
    this.#permittedNode.set(nodeId, legal);
    return legal;
  }

  /**
   * The nodes a teacher could pass to *somebody*: mastered well enough, in the
   * catalog, and legal here.
   *
   * The half of {@link teachableTo}'s filter that does not mention the student,
   * lifted out and memoized per teacher. The outlook asks that question sixty-four
   * times for every mage — once per counterparty in each direction — and the
   * three checks here have the same answer every time. Only the depth ceiling,
   * what the student already knows, and her prerequisites actually depend on who
   * is receiving the lesson, and those stay in the loop.
   *
   * Lifting them cannot move the answer: every predicate is a pure read, and
   * `teachableTo` returns the *lowest* node id satisfying all of them, which is
   * the same value whatever order the tests are applied in.
   */
  #teachable(teacher: MageHandle): readonly ContentId[] {
    const known = this.#teachableFrom.get(teacher);
    if (known !== undefined) return known;
    const ready: ContentId[] = [];
    for (const [nodeId, mastery] of this.#holdings(teacher)) {
      if (mastery < DEFAULT_TEACH_THRESHOLD) continue;
      if (this.#deps.catalog.node(nodeId) === undefined) continue;
      if (!this.#permitted(nodeId)) continue;
      ready.push(nodeId);
    }
    this.#teachableFrom.set(teacher, ready);
    return ready;
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
    if (!this.#permitted(nodeId)) return false;
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
  return { kind: policy.kind, keepsWrittenCopies: policy.scribingAvailable };
}

/** `fp(1.0)` — an unmodified rate (`contracts.md` §2.4's convention). */
const NEUTRAL_RATE: Fixed = 1024;

/** One node the frontier scan may offer: its id, and the record behind it. */
interface ScannableNode {
  readonly nodeId: ContentId;
  readonly node: NonNullable<ReturnType<NodeCatalog['node']>>;
}

/** A mage who holds nothing. Shared, and never written to. */
const EMPTY_HOLDINGS: ReadonlyMap<ContentId, Fp> = new Map<ContentId, Fp>();

/** A mage who has banked nothing, for a gateway built without a ledger. */
const EMPTY_PROGRESS: ReadonlyMap<ContentId, Fp> = new Map<ContentId, Fp>();

/** Whether a location kind is one a mage carries in her own head. */
export function isHeldAtMind(locationKind: number): boolean {
  return locationKind === LOCATION_KIND.mind || locationKind === LOCATION_KIND.palace;
}

/** A mage entity handle, re-exported so callers need not reach past this layer. */
export type { MageHandle } from '@mm/rules-world';

/** Handle alias, for the roster read above. */
export type LivingMage = EntityHandle;
