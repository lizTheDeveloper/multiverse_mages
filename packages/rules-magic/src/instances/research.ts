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
 * ## Why the rediscovery floor is applied here rather than in content
 *
 * `contracts.md` §2.3's `rediscoveryMultiplier` is a content invariant of at
 * least `fp(3072)`, and §2.4's species `rediscoveryAffinity` multiplies it —
 * which composes below 3× for any species better than average. The release
 * claim is about what rediscovery *costs*, not about what content declares, so
 * the clamp belongs at the point the cost is computed. See
 * {@link effectiveRediscoveryMultiplier}.
 */

import type { ContentId, Fp } from '@mm/content';
import type { Handle, Ruleset, Tick } from '@mm/state';
import { LOCATION_KIND, permits } from '@mm/state';
import { FP_ONE, RNG_STREAM, div, mul, nextBounded } from '@mm/sim-core';

import type { CellResolver, KnowledgeNode, KnowledgeRng, NodeCatalog } from './catalog.js';
import { requireNode } from './catalog.js';
import {
  DEFAULT_INITIAL_MASTERY,
  REDISCOVERY_MULTIPLIER_FLOOR,
  RESEARCH_JITTER_SPAN,
} from './constants.js';
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
  /** Species `rediscoveryAffinity`. Used only when the node was lost. */
  readonly rediscoveryAffinity: Fp;
  /** Mastery a completed instance is created at. Defaults to the placeholder. */
  readonly initialMastery?: Fp;
  /** Where the instance lands. `mind` unless the tradition stores in a palace. */
  readonly locationKind?: number;
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
  readonly rediscoveryAffinity: Fp;
  readonly learnRate: Fp;
  readonly researchRate: Fp;
}

/**
 * A node's rediscovery multiplier after species affinity, clamped at `fp(3072)`.
 *
 * **The clamp is the release claim.** Affinity applies first so that a gnome's
 * `vision.md` §5 rediscovery bonus is real wherever content authors above the
 * floor, and the clamp then guarantees that no composition of content and
 * species produces a rediscovery cheaper than three times original research.
 * The alternative — clamping the content value and then applying affinity —
 * would put the guarantee back where the composition breaks it.
 */
export function effectiveRediscoveryMultiplier(multiplier: Fp, affinity: Fp): Fp {
  return Math.max(mul(multiplier, affinity), REDISCOVERY_MULTIPLIER_FLOOR);
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
    ? effectiveRediscoveryMultiplier(node.rediscoveryMultiplier, inputs.rediscoveryAffinity)
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
    locationKind: inputs.locationKind ?? LOCATION_KIND.mind,
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
  return unsatisfiedPrerequisite(inputs, node);
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
