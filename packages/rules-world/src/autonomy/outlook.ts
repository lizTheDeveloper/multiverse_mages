/*
 * Multiverse Mages — everything the utility-AI is allowed to know about a mage
 * and her situation.
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

import type { Fixed } from '@mm/sim-core';
import type { SpeciesRecord } from '@mm/content';
import type { Handle, MageRoleValue } from '@mm/state';

import type { KnowledgeTarget, MageHandle, UniversityHandle } from '../coordination.js';
import type { Personality } from '../mages/personality.js';
import type { CellEmphasis, SpeciesAffinities } from './target-appeal.js';

/**
 * ## The point of gathering this first
 *
 * Masking, scoring, and selection are pure functions of this record. Nothing in
 * the autonomy directory reads the entity store, calls the knowledge gateway,
 * or touches the clock — `gatherFrontier` in `candidates.ts` and its caller does all of
 * that once, and everything downstream is arithmetic over the result.
 *
 * Three things fall out of that shape, and each of them is a requirement
 * somewhere:
 *
 * - **The position ban becomes structural** (`contracts.md` §0, and the
 *   `mage-autonomy` spec's "Autonomy is position-free"). There is no coordinate
 *   in this record, so the scoring path cannot read one even by accident. The
 *   conformance check in `autonomy-no-position.test.ts` scans the directory
 *   anyway, because a structural argument stops being one the moment somebody
 *   adds a field.
 * - **Candidate scanning is bounded once, not per goal.** The spec requires a
 *   documented constant; it is `MAX_CANDIDATE_TARGETS`, applied where the
 *   frontier is fetched rather than at each of the five target-taking goals.
 * - **Ablation is cheap.** Zeroing a scoring term and re-running needs the same
 *   outlook, not a re-simulated universe, which is what makes
 *   `scoring-ablation.test.ts` a unit test rather than a scenario.
 *
 * ## Why the lists are `KnowledgeTarget` and not node ids
 *
 * `coordination.ts` chose `KnowledgeTarget` — id, tier, remaining cost —
 * because scoring needs a cost and depth gating needs a tier, and nothing on
 * this side of the port may need more. Passing bare ids here would force the
 * scoring code to ask the gateway a second question per candidate, which is the
 * unbounded scan the port was shaped to prevent.
 */

/**
 * One mage's situation, as of one world tick.
 *
 * Every field is either read from her own components or supplied by the
 * coordinating layer through the `KnowledgeGateway` port. None of it is cached in
 * state: `contracts.md` §1.5's "existence is derived, never cached" applies to
 * everything derived from knowledge, and an outlook is rebuilt per evaluation.
 */
export interface MageOutlook {
  /** The mage's handle. The actor key for tie-breaking, and the stagger phase. */
  readonly mage: MageHandle;
  /** Her species record, for the trait-driven scoring terms. */
  readonly species: SpeciesRecord;
  /**
   * Her species' `affinities`, resolved from author-facing strings onto
   * interned cell and form ids.
   *
   * Beside {@link MageOutlook.species} rather than inside it because
   * `SpeciesRecord` is `@mm/content`'s shape and its `affinities` are keyed by
   * strings. Interning them per candidate per tick is the string hashing in the
   * hot loop that `catalog.ts` refuses for prerequisites, and resolving them
   * needs the registry, which the scoring path deliberately cannot reach.
   *
   * §6 lists *"technique/form affinities"* among the seven things a species is
   * tuned on. Until this field existed it was the only one of the seven that no
   * rule read.
   */
  readonly affinities: SpeciesAffinities;
  /**
   * Which cells the god has encouraged, and how strongly, on this tick.
   *
   * The one field on this record that is a fact about the *universe* rather than
   * about the mage, and it is here because the outlook is the only thing the
   * utility-AI reads: a term that could not reach it could not exist. Every mage
   * in a universe sees the identical map, which is what makes an encouragement a
   * public instruction rather than a private nudge — and what makes it able to
   * move a whole universe's node set rather than one mage's.
   *
   * Empty for a universe whose god has encouraged nothing, which is every
   * universe under `passive-control`.
   */
  readonly emphasis: CellEmphasis;
  /** Her rolled personality, from her own component fields. */
  readonly personality: Personality;
  /** Her standing role. Only the god writes this; autonomy only reads it. */
  readonly roleId: MageRoleValue;
  /** Age as a fraction of effective lifespan, `fp`. Derived, never stored. */
  readonly normalizedAge: Fixed;
  /** Her current affiliation, or `0` for unaffiliated (`contracts.md` §0). */
  readonly universityId: Handle;

  /**
   * Nodes she could begin researching that this universe has never held,
   * already filtered to her species `depthCeiling` and already bounded.
   */
  readonly discoveryTargets: readonly KnowledgeTarget[];
  /**
   * Nodes this universe knew and lost that she could research again. Separate
   * from {@link discoveryTargets} because they are separate goals with separate
   * ids, and a baseline that could not tell them apart could not report the
   * cost of forgetting.
   */
  readonly rediscoveryTargets: readonly KnowledgeTarget[];
  /**
   * Nodes a living, willing holder could teach her.
   *
   * The `mage-autonomy` spec: *"eligibility depends on whether a living,
   * willing holder of the node exists, not on where that holder is."* The
   * gateway answers that question; this list is its answer, so no distance can
   * enter even in principle.
   */
  readonly teachableToMe: readonly KnowledgeTarget[];
  /** Nodes she could pass to a student who can receive them. */
  readonly teachableByMe: readonly KnowledgeTarget[];
  /** Nodes she could commit to a grimoire, with their scribe costs. */
  readonly scribableTargets: readonly KnowledgeTarget[];
  /**
   * Nodes she could spend the month **casting at the world**, already gated.
   *
   * The four gates are the coordinating layer's, and every one of them is a
   * question this package may not ask: held at a mind or a memory palace, at or
   * above `MASTERY_ACTIVATION_THRESHOLD`, in a cell the ruleset permits *now*,
   * and carrying a `resource-yield` effect whose form routes to a material.
   * They are the same gates `universe-effects.ts` applies to the ambient
   * multiplier, deliberately: two answers to "can she cast this" would diverge,
   * and the one without the adversarial test would be the one the economy used.
   *
   * `remainingCost` is zero for every entry — she already knows them — so
   * `compareTargets`' cost ordering falls straight through to the appeal score
   * and then to node id, which is exactly what is wanted when there is no
   * project to finish.
   */
  readonly applicableTargets: readonly KnowledgeTarget[];

  /** The universe's materials stock, `fp`. Scribing is masked without enough. */
  readonly materials: Fixed;
  /**
   * Her university's scribing throughput this tick, `fp`.
   *
   * Zero for an unaffiliated mage and for a university with no scribe staff —
   * the `universities` spec requires `scribe` to be masked in the second case,
   * and there is no third case where a mage scribes out of nowhere.
   */
  readonly scribeThroughput: Fixed;
  /**
   * Whether some other university would suit her better than her current one.
   *
   * A boolean rather than a handle because `affiliate`'s *target* is chosen
   * when the goal completes, not when it is scored, and holding a handle here
   * for several ticks of commitment would be holding a handle that may have
   * been destroyed. Which university she moves to is `select.ts`'s to resolve
   * from a fresh outlook.
   */
  readonly betterAffiliationAvailable: boolean;
  /** The university she would move to, or `0`. Resolved at completion. */
  readonly preferredUniversity: UniversityHandle;

  /**
   * How much the universe wants its libraries watched, `fp`.
   *
   * Zero at 0.4.0. `ward-duty` is enumerated and scorable now, but what makes
   * warding attractive is a threat, and threats are `raid-engagement`'s. Fed as
   * an input rather than computed here so that capability supplies a number
   * instead of amending the goal set.
   */
  readonly wardPressure: Fixed;
  /** How much the universe wants raiders ready, `fp`. Zero at 0.4.0, same reason. */
  readonly raidPressure: Fixed;
}
