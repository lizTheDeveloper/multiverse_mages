/*
 * Multiverse Mages — research, rediscovery, and the three-times floor.
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
 * Deriving a node from prerequisites already held — and the expensive path back
 * to one this universe lost.
 *
 * ## The operation does not decide *whether* to research
 *
 * `mages-and-species` owns that: utility scoring, curiosity, what a mage does
 * with her month. This function defines what *happens* when a research
 * operation is applied, which is why it takes accumulated progress as a
 * parameter and returns the new value rather than storing it. `contracts.md`
 * §1.2 gives a mage no research-progress field, and inventing one here would
 * pin a decision `mages-and-species` has not made — including whether a mage
 * may pursue two nodes at once.
 *
 * ## Legality gates acquisition, not only casting
 *
 * A mage in a universe that forbids `perdo-mentem` cannot research it. This is
 * the decision `knowledge-model` argues for at length, and the reason is that
 * cast-only gating makes forbidding strictly dominant: a universe would forbid
 * everything dangerous, keep researching it in perfect safety, and carry a full
 * spellbook abroad. Forbidding has to have a price, and this is the price.
 *
 * ## A full store refuses before any effort is spent
 *
 * The `store` hook's `slotsPerMage` is checked with the other refusals, up
 * front, rather than at the moment the instance would be created. Two reasons,
 * and the second is the one that matters. A mage who cannot possibly keep the
 * result should not spend months deriving it. And `mages-and-species` will
 * score research options speculatively — an operation that only reveals it was
 * impossible after the progress has accumulated cannot be scored at all.
 *
 * The cost is that a mage cannot bank progress against a slot she expects to
 * free. That is a real behaviour and it is deliberate: progress is caller-owned
 * (see above), so a caller that wants to model it can, and nothing here has to
 * decide what a reserved slot means.
 *
 * ## The rediscovery multiplier is not computed here
 *
 * This file used to carry its own `effectiveRediscoveryMultiplier`, reading
 * species `rediscoveryAffinity` as a *multiplier* — so a species good at
 * rediscovery paid *more*. `rules-world` carried a second copy reading it as a
 * divisor, the opposite. `contracts.md` §2.4 is normative and says divisor
 * (*"Higher is better"*), the shipped species data agrees (gnome `fp(1792)`
 * leads, orc `fp(512)` trails), and the copy here was the wrong one. It is
 * deleted; the survivor is `@mm/primitives`' {@link effectiveRediscoveryMultiplier},
 * which §5 rule 3 lets both rules packages reach without a cycle.
 *
 * The floor still applies at the point the cost is computed rather than in
 * content: §2.3's `rediscoveryMultiplier` is a content invariant of at least
 * `fp(3072)`, and affinity composes below 3× for any species better than
 * average, so the release claim — which is about what rediscovery *costs*, not
 * about what content declares — has to be enforced after affinity.
 */

import type { ContentId, Fp } from '@mm/content';
import type { Handle, Ruleset, Tick } from '@mm/state';
import { LOCATION_KIND, permits } from '@mm/state';
import type { RediscoveryClampCounter } from '@mm/primitives';
import { effectiveRediscoveryMultiplier } from '@mm/primitives';
import { FP_ONE, RNG_STREAM, div, mul, nextBounded } from '@mm/sim-core';

import type { PersonalStore } from '../traditions/store.js';
import { UNBOUNDED_SLOTS, admitToStore } from '../traditions/store.js';

import type { CellResolver, KnowledgeNode, KnowledgeRng, NodeCatalog } from './catalog.js';
import { requireNode } from './catalog.js';
import { DEFAULT_INITIAL_MASTERY, RESEARCH_JITTER_SPAN } from './constants.js';
import type { KnowledgeRefusal } from './outcomes.js';
import type { KnowledgeSubsystem } from './subsystem.js';
import { isHeldLocation } from './subsystem.js';

/** What research needs. Every world-side rate arrives as a parameter. */
export interface ResearchInputs {
  readonly knowledge: KnowledgeSubsystem;
  readonly catalog: NodeCatalog;
  readonly cells: CellResolver;
  readonly ruleset: Ruleset;
  readonly rng: KnowledgeRng;
  /**
   * The researcher. An opaque handle: it is the instance's `locationId`, and
   * the actor key for stream 3, and is never dereferenced into a mage record.
   */
  readonly subject: Handle;
  readonly nodeId: ContentId;
  readonly worldTick: Tick;
  /** Progress accumulated before this step. The caller owns storing it. */
  readonly progress: Fp;
  /** Work applied this step, before the stream-3 jitter. */
  readonly effort: Fp;
  /** Species `learnRate` (`contracts.md` §2.4). Higher means less required. */
  readonly learnRate: Fp;
  /** The **already stacked** `research-rate` multiplier. See the note below. */
  readonly researchRate: Fp;
  /**
   * Species `rediscoveryAffinity` (`contracts.md` §2.4). Used only when the
   * node was lost. A **divisor**: higher is better, so a gnome at `fp(1792)`
   * rediscovers more cheaply than an orc at `fp(512)`.
   */
  readonly rediscoveryAffinity: Fp;
  /**
   * Accumulates how often the `fp(3072)` rediscovery floor discarded affinity.
   *
   * Required rather than optional, and threaded down from here rather than
   * created per call, because the figure that matters is the share over a whole
   * run: a floor that binds on every evaluation has silently eaten the species
   * trait, and produces output identical to one that never binds.
   */
  readonly clampCounter: RediscoveryClampCounter;
  /** Mastery a completed instance is created at. Defaults to the placeholder. */
  readonly initialMastery?: Fp;
  /**
   * The active `store` hook: where a completed instance lands, and how many the
   * subject may hold there.
   *
   * **This replaced a bare `locationKind`.** A caller could previously send an
   * instance to a memory palace while supplying nothing that could refuse one,
   * so the Art of Memory's declared `slotsPerMage` was unreachable from every
   * acquisition path in the package. The location and the bound are one
   * decision of one hook, and they now arrive together or not at all.
   *
   * Omitted means the caller's tradition has no say: `mind`, unbounded, which
   * is what `store: standard` resolves to.
   */
  readonly store?: PersonalStore;
}

export interface ResearchOutcome {
  /** Present exactly when nothing changed. */
  readonly refusal?: KnowledgeRefusal;
  /** Progress after this step. Unchanged from the input on a refusal. */
  readonly progress: Fp;
  /** Progress this node needs, under this subject's rates. */
  readonly required: Fp;
  /** Whether this was rediscovery of a lost node rather than fresh research. */
  readonly rediscovery: boolean;
  readonly completed: boolean;
  /** The created instance, or `0`. */
  readonly instance: Handle;
}

/** The rates a requirement is computed against. */
export interface RequirementInputs {
  readonly rediscovery: boolean;
  /** Species `rediscoveryAffinity`. A divisor: higher is better (§2.4). */
  readonly rediscoveryAffinity: Fp;
  readonly learnRate: Fp;
  readonly researchRate: Fp;
  /** Counts floor clamps. See {@link ResearchInputs.clampCounter}. */
  readonly clampCounter: RediscoveryClampCounter;
}

/**
 * Progress a node requires, scaled by the subject's rates.
 *
 * `knowledge-instances` puts the scaling on the *cost*, not on the progress:
 * *"accumulated progress is compared against the node's `researchCost` scaled
 * by the supplied learn rate and stacked `research-rate` multiplier."* A quick
 * learner therefore needs less progress rather than earning more per step,
 * which keeps a step's progress a function of the effort supplied and nothing
 * else — one place for rates to apply instead of two.
 *
 * **`researchRate` arrives already stacked.** Combining primitive magnitudes is
 * `@mm/primitives`' job and `contracts.md` §3 declares the rule per primitive;
 * a second fold here is the divergence that makes two `+20%` bonuses mean
 * different things in two packages.
 */
export function researchRequirement(node: KnowledgeNode, inputs: RequirementInputs): Fp {
  const multiplier = inputs.rediscovery
    ? effectiveRediscoveryMultiplier(
        node.rediscoveryMultiplier,
        inputs.rediscoveryAffinity,
        inputs.clampCounter,
      )
    : FP_ONE;
  const base = mul(node.researchCost, multiplier);
  const rate = mul(inputs.learnRate, inputs.researchRate);
  // A zero rate would be a mage who cannot learn at all rather than one who
  // learns instantly, and div() by zero is not a question the rules path asks.
  if (rate <= 0) return base;
  return div(base, rate);
}

/**
 * Whether re-deriving a node counts as rediscovery.
 *
 * Both halves matter. A node with a surviving instance is ordinary research —
 * a second mage working it out independently while the first still holds it is
 * not rediscovering a lost art. A node that never existed here is ordinary
 * research too. Only the gap between the two, *known once and now gone*, is
 * expensive, and only the persisted ever-known record can see that gap.
 */
export function isRediscovery(knowledge: KnowledgeSubsystem, nodeId: ContentId): boolean {
  return knowledge.wasEverKnown(nodeId) && !knowledge.exists(nodeId);
}

/**
 * Applies one step of research.
 *
 * Draws once from stream 3 on every step that is not refused — including a step
 * that supplies no effort and one that completes. A refusal returns before the
 * draw, which is safe here and would not be under a shared cursor: streams are
 * re-derived from `(rootSeed, subsystem, tick, actorKey)` on every call, so a
 * step nobody took cannot shift the ordinals of the step anybody else takes.
 * What the unconditional draw *within* an accepted step buys is that finishing
 * a node does not consume a different number of values than not finishing it.
 */
export function research(inputs: ResearchInputs): ResearchOutcome {
  const node = requireNode(inputs.catalog, inputs.nodeId);
  const rediscovery = isRediscovery(inputs.knowledge, inputs.nodeId);
  const required = researchRequirement(node, {
    rediscovery,
    rediscoveryAffinity: inputs.rediscoveryAffinity,
    learnRate: inputs.learnRate,
    researchRate: inputs.researchRate,
    clampCounter: inputs.clampCounter,
  });

  const refusal = refuseResearch(inputs, node);
  if (refusal !== undefined) {
    return {
      refusal,
      progress: inputs.progress,
      required,
      rediscovery,
      completed: false,
      instance: 0,
    };
  }

  const stream = inputs.rng.actorStream(RNG_STREAM.research, inputs.subject);
  const jitter = nextBounded(stream, RESEARCH_JITTER_SPAN * 2 + 1) - RESEARCH_JITTER_SPAN;
  const progress = inputs.progress + mul(inputs.effort, FP_ONE + jitter);

  if (progress < required) {
    return { progress, required, rediscovery, completed: false, instance: 0 };
  }

  const instance = inputs.knowledge.createInstance({
    nodeId: inputs.nodeId,
    locationKind: personalLocationKind(inputs.store),
    locationId: inputs.subject,
    acquiredTick: inputs.worldTick,
    mastery: inputs.initialMastery ?? DEFAULT_INITIAL_MASTERY,
  });
  return { progress, required, rediscovery, completed: true, instance };
}

function refuseResearch(inputs: ResearchInputs, node: KnowledgeNode): KnowledgeRefusal | undefined {
  const cellId = inputs.cells.cellOf(inputs.nodeId);
  if (!permits(inputs.ruleset, cellId)) {
    return { reason: 'forbidden-cell', nodeId: inputs.nodeId, cellId };
  }
  const missing = unsatisfiedPrerequisite(inputs, node);
  if (missing !== undefined) return missing;
  return personalStoreFull(inputs.knowledge, inputs.store, inputs.subject, inputs.nodeId);
}

/**
 * Where a personal instance lands under a `store` hook — `mind` without one.
 *
 * The default is `store: standard`'s answer rather than a fallback: a caller
 * that resolved no tradition is describing a universe whose knowledge sits in
 * heads, which is every universe that has not declared otherwise.
 */
export function personalLocationKind(store: PersonalStore | undefined): number {
  return store?.personalLocationKind ?? LOCATION_KIND.mind;
}

/**
 * The refusal a full personal store produces, or `undefined` if there is room.
 *
 * Shared with teaching, because a bound one route honours and the other does
 * not is not a bound — a mage barred from researching a thirteenth node would
 * simply enrol for it.
 *
 * **Counted at the store's own location kind, per mage.** A palace's twelve are
 * twelve palace instances belonging to that mage, and a mind instance she
 * carried in from a tradition change does not spend one of them: `slotsPerMage`
 * is declared as a bound on `personalLocationKind` and nothing else, and
 * `magic-traditions` is explicit that switching into the Art of Memory must not
 * erase what its mages already know.
 *
 * The unbounded case returns before counting. That is not only speed: it means
 * a tradition declaring no bound performs no scan and cannot be perturbed by
 * one, so `standard` and `true-naming` behaviour is unchanged by this rule
 * existing.
 */
export function personalStoreFull(
  knowledge: KnowledgeSubsystem,
  store: PersonalStore | undefined,
  subject: Handle,
  nodeId: ContentId,
): KnowledgeRefusal | undefined {
  if (store === undefined || store.slotsPerMage === UNBOUNDED_SLOTS) return undefined;

  const held = knowledge.instancesAt(store.personalLocationKind, subject).length;
  if (admitToStore(store, held).admitted) return undefined;

  return {
    reason: 'personal-store-full',
    nodeId,
    subject,
    storeKind: store.kind,
    held,
    slotsPerMage: store.slotsPerMage,
  };
}

/**
 * The first prerequisite the subject does not hold as a usable instance.
 *
 * "Usable" is held in mind or memory palace, and not dormant. Dormant
 * prerequisites deliberately do not count: allowing them would let a god
 * research *through* their own interdiction to a permitted node beyond it, and
 * would make the prerequisite graph's meaning depend on the universe's history
 * rather than on its present ruleset.
 *
 * Exported because teaching applies the same rule to the student, and a second
 * copy of "what counts as held" is the kind of near-duplicate that drifts in
 * one direction only.
 */
export function unsatisfiedPrerequisite(
  inputs: {
    readonly knowledge: KnowledgeSubsystem;
    readonly cells: CellResolver;
    readonly ruleset: Ruleset;
    readonly subject: Handle;
    readonly nodeId: ContentId;
  },
  node: KnowledgeNode,
): KnowledgeRefusal | undefined {
  for (const prerequisiteId of node.prerequisites) {
    if (!holdsUsable(inputs.knowledge, inputs.cells, inputs.ruleset, inputs.subject, prerequisiteId)) {
      return {
        reason: 'unsatisfied-prerequisite',
        nodeId: inputs.nodeId,
        prerequisiteId,
        subject: inputs.subject,
      };
    }
  }
  return undefined;
}

/** Whether a subject holds a non-dormant instance of a node in mind or palace. */
export function holdsUsable(
  knowledge: KnowledgeSubsystem,
  cells: CellResolver,
  ruleset: Ruleset,
  subject: Handle,
  nodeId: ContentId,
): boolean {
  if (!permits(ruleset, cells.cellOf(nodeId))) return false;
  for (const instance of knowledge.instancesHeldBy(subject)) {
    const view = knowledge.read(instance);
    if (view.nodeId === nodeId && isHeldLocation(view.locationKind)) return true;
  }
  return false;
}
