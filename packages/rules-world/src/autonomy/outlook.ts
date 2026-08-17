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
 * ## Why gather first
 *
 * Masking, scoring and selection are pure functions of this record. `autonomy/`
 * touches no entity store, no gateway, no clock — `gatherFrontier`
 * (`candidates.ts`) and its caller do it once.
 *
 * Three requirements met by that shape alone, all in
 * `openspec/changes/mages-and-species/specs/mage-autonomy/spec.md`:
 *
 * - `:212` position-free — no coordinate field, so scoring cannot read one.
 *   Structural, but fragile: `autonomy-no-position.test.ts` scans anyway.
 * - `:236` bounded in cost — `MAX_CANDIDATE_TARGETS`, applied at the frontier
 *   fetch, not at each of the five target-taking goals.
 * - `:119` individually ablatable — zero a term, re-run the same outlook, no
 *   re-simulated universe. Hence `scoring-ablation.test.ts` is a unit test.
 *
 * ## Why `KnowledgeTarget`, not node ids
 *
 * id + tier + remaining cost (`coordination.ts`): scoring needs the cost, depth
 * gating the tier. Bare ids cost a second gateway call per candidate — the
 * unbounded scan the port prevents.
 */

/**
 * One mage's situation at one world tick.
 *
 * Fields from her components or the `KnowledgeGateway` port. Never cached
 * (`contracts.md` §1.5); rebuilt per evaluation.
 */
export interface MageOutlook {
  /** Actor key for tie-breaking, and the stagger phase. */
  readonly mage: MageHandle;
  /** Species record, for trait-driven scoring terms. */
  readonly species: SpeciesRecord;
  /**
   * Her species' `affinities`, interned onto cell and form ids.
   *
   * Outside {@link MageOutlook.species}: `SpeciesRecord` (`@mm/content`) keys
   * affinities by string. Interning per candidate per tick is the hot-loop
   * hashing `catalog.ts` refuses for prerequisites, and needs the registry,
   * which scoring cannot reach.
   *
   * §6 tunes a species on seven things. This was the one no rule read.
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
  /** Standing role. God writes, autonomy reads. */
  readonly roleId: MageRoleValue;
  /** Age as a fraction of effective lifespan, `fp`. Derived, never stored. */
  readonly normalizedAge: Fixed;
  /** Current affiliation, or `0` for unaffiliated (`contracts.md` §0). */
  readonly universityId: Handle;

  /**
   * Nodes she could start on, never held here. Filtered to species
   * `depthCeiling`, bounded.
   */
  readonly discoveryTargets: readonly KnowledgeTarget[];
  /**
   * Nodes this universe knew and lost. Separate from {@link discoveryTargets}:
   * separate goals, separate ids. Merged, a baseline could not report the cost
   * of forgetting.
   */
  readonly rediscoveryTargets: readonly KnowledgeTarget[];
  /**
   * Nodes a living, willing holder could teach her —
   * `mage-autonomy/spec.md:174`.
   * The gateway's answer, so no distance can enter even in principle.
   */
  readonly teachableToMe: readonly KnowledgeTarget[];
  /** Nodes she could pass to a student who can receive them. */
  readonly teachableByMe: readonly KnowledgeTarget[];
  /** Nodes she could commit to a grimoire, with their scribe costs. */
  readonly scribableTargets: readonly KnowledgeTarget[];
  /**
   * Nodes she could spend the month **casting at the world**, already gated.
   *
   * Four gates, each a question this package may not ask: held at a mind or
   * memory palace; at or above `MASTERY_ACTIVATION_THRESHOLD`; cell permitted
   * *now*; a `resource-yield` effect whose form routes to a material. Same
   * gates the ambient multiplier uses (`universe-effects.ts:35`, counted there
   * as two) — shared deliberately: two answers to "can she cast this" would
   * diverge and the economy would use the untested one.
   *
   * `remainingCost` is zero throughout, so `compareTargets` falls past cost to
   * appeal score, then node id. Right, when there is no project to finish.
   */
  readonly applicableTargets: readonly KnowledgeTarget[];
  /**
   * Nodes she could spend the month **drilling**, already gated.
   *
   * The gates are the coordinating layer's, for the reason every other target
   * list's are: held at a mind or a memory palace, in a cell the ruleset
   * permits *now*, within her species' `depthCeiling`, and — the one that is
   * particular to practice — at a mastery **below** what `rules-magic`'s
   * `practiceCeiling` allows her for that node's tier. A mage already at her
   * ceiling has nothing to gain from the month, so she is not offered it, and
   * the goal is masked rather than selected and wasted.
   *
   * That last filter is also what keeps mastery from levelling a population.
   * The ceiling is per mage and per node — deeper nodes cap lower, for a given
   * species — so a mage runs out of things to practise long before she runs out
   * of things she knows, and the ones she cannot perfect are exactly the ones
   * at the top of her reach.
   *
   * `remainingCost` is zero for every entry: practice has no project to finish
   * and can be done again next month.
   */
  readonly practiceTargets: readonly KnowledgeTarget[];

  /** Universe materials stock, `fp`. Scribing is masked without enough. */
  readonly materials: Fixed;
  /**
   * Her university's scribing throughput this tick, `fp`. Zero for an
   * unaffiliated mage, and for a university with no scribe staff
   * (`universities/spec.md:66`). No third case.
   */
  readonly scribeThroughput: Fixed;
  /**
   * Whether another university would suit her better.
   *
   * Boolean, not a handle: `affiliate` picks its target at completion, not at
   * scoring, and a handle held across ticks of commitment can dangle.
   * `select.ts` resolves the move from a fresh outlook.
   */
  readonly betterAffiliationAvailable: boolean;
  /** University she would move to, or `0`. Resolved at completion. */
  readonly preferredUniversity: UniversityHandle;

  /**
   * How much the universe wants its libraries watched, `fp`.
   *
   * Zero at 0.4.0. `ward-duty` is enumerated and scorable, but warding attracts
   * only under threat, and threats are `raid-engagement`'s. An input, not a
   * computation: that capability supplies a number instead of amending the
   * goal set.
   */
  readonly wardPressure: Fixed;
  /** How much the universe wants raiders ready, `fp`. Zero at 0.4.0, same reason. */
  readonly raidPressure: Fixed;

}
