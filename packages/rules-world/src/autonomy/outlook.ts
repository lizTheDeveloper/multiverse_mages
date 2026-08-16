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
import type { SpeciesAffinities } from './target-appeal.js';

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
 * - `:158` position-free — no coordinate field, so scoring cannot read one.
 *   Structural, but fragile: `autonomy-no-position.test.ts` scans anyway.
 * - `:186` bounded in cost — `MAX_CANDIDATE_TARGETS`, applied at the frontier
 *   fetch, not at each of the five target-taking goals.
 * - `:63` individually ablatable — zero a term, re-run the same outlook, no
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
  /** Rolled personality, from her component fields. */
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
