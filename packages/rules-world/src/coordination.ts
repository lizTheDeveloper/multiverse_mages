/*
 * Multiverse Mages — the port through which world rules reach knowledge rules.
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

import type { EntityHandle, Fixed } from '@mm/sim-core';

import type { ContentId } from '@mm/content';

/**
 * ## Why this file is a set of interfaces and no code
 *
 * `docs/design/contracts.md` §5 rule 3: *"`rules-magic` and `rules-world` must
 * not import each other. Where they interact — a mage learning a node — the
 * interaction lives in a coordinating layer, not in a cycle."* A mage learning
 * a node is not an edge case of this change; it is most of it. So the
 * dependency has to be inverted somewhere, and the only question is which side
 * declares the shape.
 *
 * It is declared **here, on the consumer's side**, for a reason the alternative
 * makes obvious. If `rules-magic` published the interface, `rules-world` would
 * import `@mm/rules-magic` to name the type — a forbidden edge, and one that
 * `import type` does not excuse, because §5's grant to this package lists no
 * `rules-magic` edge in either flavour. Declaring the port here means neither
 * rules package names the other at all, and the coordinating layer — which is
 * permitted to import both — supplies an adapter.
 *
 * `mages-and-species`' design note phrases this as consuming "an interface it
 * does not define", which reads the other way round. Followed literally it
 * produces the cycle §5 forbids, so the port is defined here and the note is
 * the thing that should be corrected. Recorded rather than quietly diverged
 * from.
 *
 * ## Why it is this narrow
 *
 * Every method below exists because a mechanism in this change needs it: goal
 * feasibility needs to know what a mage can research, teach, or scribe; the
 * utility-AI needs a bounded frontier to score; death needs to hand grimoires
 * on and destroy instances. Nothing here exposes the node graph, mastery
 * arithmetic, tradition hooks, or legality — those are `rules-magic`'s to
 * decide, and a port wide enough to reimplement them is a cycle with extra
 * steps.
 *
 * Two rules the port is shaped by, both from `contracts.md`:
 *
 * - **Existence is derived, never cached** (§1.5). {@link KnowledgeGateway}
 *   answers `instanceCount` on demand; this package must not mirror it into
 *   state.
 * - **No world-scale entity has a position** (§0). Nothing here takes or
 *   returns a coordinate, a distance, or a travel time, and the availability of
 *   a teacher is a fact about willingness rather than proximity.
 */

/** A mage entity handle, for readability at the call sites below. */
export type MageHandle = EntityHandle;

/** A university entity handle. */
export type UniversityHandle = EntityHandle;

/**
 * One thing a mage could work on, as the world side needs to see it.
 *
 * Deliberately not the node record: the world side scores and schedules, and
 * needs a cost and a tier to do it. Everything else about the node stays behind
 * the port.
 */
export interface KnowledgeTarget {
  readonly nodeId: ContentId;
  /** 1..7, per `contracts.md` §2.3. Gated here against species `depthCeiling`. */
  readonly tier: number;
  /**
   * Mage-months of work remaining for this mage, in fixed point — already
   * inclusive of rediscovery cost where the node is one this universe has known
   * and lost.
   */
  readonly remainingCost: Fixed;
  /**
   * The interned cell the node sits in, and the cell's form.
   *
   * Both, because a species `affinities` key may be either
   * (`load.ts`'s `checkSpecies`), and the cell key is the finer authored claim.
   * They are here rather than fetched per candidate for the reason this whole
   * type exists: `outlook.ts` records that scoring *"needs a cost and depth
   * gating needs a tier, and nothing on this side of the port may need more"*
   * — the moment scoring needed more, the port had to carry it, because the
   * alternative is a second gateway question per candidate, which is exactly
   * the unbounded scan the port was shaped to prevent.
   */
  readonly cellId: ContentId;
  readonly formId: ContentId;
  /**
   * The node's authored effect primitives, interned.
   *
   * What the node is *for* — the only statement in the content set about that —
   * and therefore the only thing a standing role can have an opinion about.
   * Magnitudes are deliberately absent: a role's preference is over kinds of
   * magic, not over how much of one, and carrying the magnitudes would invite a
   * selector that reimplements the effect pipeline.
   */
  readonly primitives: readonly ContentId[];
  /**
   * Whether this mage's library already holds a copy of the node.
   *
   * **Set by the scribing candidate scan and by nothing else.** Research and
   * teaching targets leave it absent, which reads as `false`, so their ordering
   * is untouched by the tie-break {@link compareTargets} applies to it.
   *
   * It exists because `vision.md` §6a scales a university's output with *depth*
   * — distinct nodes — while `library.ts` charges upkeep on *instances*, and the
   * cost-ordered candidate list could see neither. The measured consequence,
   * recorded in vision §13, `mages-and-species` task 9.8, and the rationale on
   * the committed balance baseline alike: **1,263 books and two distinct
   * nodes**, because the cheapest scribable node is the cheapest for everybody
   * forever. A loop whose input cannot move is not a compounding loop.
   *
   * Not a ban on a second copy, deliberately. Redundancy is what §5's loss
   * channel is defeated by and it is the archivist's whole thesis; what this
   * makes it is *second choice* rather than free.
   */
  readonly libraryHolds?: boolean;
}

/**
 * The knowledge half of every mage interaction in this change.
 *
 * Implemented by the coordinating layer over `rules-magic`. Every method is a
 * query or an accrual of work; none of them advances time, because the world
 * tick is this package's to drive.
 */
export interface KnowledgeGateway {
  /**
   * Live instances of a node across the universe (`contracts.md` §1.5), for the
   * "does this still exist here" question. `0` means lost.
   */
  instanceCount(nodeId: ContentId): number;

  /**
   * Whether this universe has *ever* known the node — the persisted record §1.5
   * says instances alone cannot reconstruct, and the input that decides whether
   * a research target is a discovery or a rediscovery.
   */
  everKnown(nodeId: ContentId): boolean;

  /** Whether a mage holds an instance of a node in mind or memory palace. */
  knows(mage: MageHandle, nodeId: ContentId): boolean;

  /**
   * The nodes this mage could begin researching now, capped at `limit`.
   *
   * Bounded because `mages-and-species` requires per-tick cost to be bounded by
   * a documented constant rather than by however large the node graph happens
   * to be. The caller filters further by species `depthCeiling`; the gateway
   * filters by prerequisites and by ruleset legality, which are not this
   * package's to evaluate.
   */
  researchFrontier(mage: MageHandle, limit: number): readonly KnowledgeTarget[];

  /** Whether a mage's mastery of a node is at or above the teaching threshold. */
  canTeach(teacher: MageHandle, nodeId: ContentId): boolean;

  /**
   * A node this teacher could pass to this student, or `undefined` if none —
   * the feasibility mask for the `teach` goal.
   */
  teachableTo(teacher: MageHandle, student: MageHandle): ContentId | undefined;

  /** Whether a mage could commit a node to a grimoire, and at what cost. */
  scribableBy(mage: MageHandle, nodeId: ContentId): KnowledgeTarget | undefined;

  /** Accrues mage-months of self-directed research. */
  contributeResearch(mage: MageHandle, nodeId: ContentId, mageMonths: Fixed): void;

  /** Accrues mage-months of teaching against a teacher/student pair. */
  contributeTeaching(
    teacher: MageHandle,
    student: MageHandle,
    nodeId: ContentId,
    mageMonths: Fixed,
  ): void;

  /** Accrues scribe-months against a grimoire in progress. */
  contributeScribing(mage: MageHandle, nodeId: ContentId, scribeMonths: Fixed): void;

  /**
   * A mage has died: destroy her `mind` and `palace` instances and hand her
   * grimoires to `inheritor`, or to unaffiliated holding when it is
   * {@link NO_INHERITOR}.
   *
   * The world side owns *when* a mage dies; what that costs the universe's
   * knowledge is the other side's arithmetic, and vision §5's "knowledge is
   * physical" claim has teeth only if this call is the single path.
   */
  onMageDied(mage: MageHandle, inheritor: UniversityHandle): void;
}

/**
 * The absent inheritor. `contracts.md` §0: absent references are `0`, never
 * `-1` or `undefined` — and §1.5 is explicit that a dead unaffiliated mage's
 * books are *unowned* rather than in transit to anywhere.
 */
export const NO_INHERITOR: UniversityHandle = 0;
