/*
 * Multiverse Mages — availability, and the derived predicate that is dormancy.
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
 * Whether a cell is available, and what follows for the knowledge already in it.
 *
 * ## Availability is `permits()`, and is not stored
 *
 * `contracts.md` §1.1 gives ruleset legality exactly one implementation, in
 * `@mm/state`. {@link isCellAvailable} is a *call* to it, not a second copy: it
 * adds no precedence, no axis test, and above all no memo. The conformance check
 * in `packages/state/test/unit/arbitration-conformance.test.ts` fails any file in
 * this package that evaluates a technique or form bitmask against a cell, and
 * `packages/rules-magic/test/unit/rules-path-conformance.test.ts` fails any file
 * here that so much as reads `edicts`.
 *
 * Caching would be the natural optimisation and is forbidden, because the cache
 * would have to be invalidated by an edict — and edicts are issued by
 * `god-agency`, a capability that does not exist yet and will have no reason to
 * know this cache is here. The symptom of the miss is not a crash: it is a
 * universe where an interdiction the player paid for silently did nothing, or
 * one where a revoked interdiction never lifted. `permits()` is a loop over at
 * most `EDICT_BUDGET_MAX` = 8 entries plus two bit tests.
 *
 * ## Dormancy is derived, and stored nowhere at all
 *
 * A knowledge instance is **dormant** exactly when
 * `!permits(ruleset, cellOf(nodeId))`. There is no dormant flag on the instance
 * and there must never be one. `contracts.md` §1.5 makes the same ruling about
 * node existence, and the reason transfers directly: state is the thing that
 * gets *serialized*, so a cached flag would be written into a snapshot beside
 * the ruleset it was derived from, and any disagreement between the two would be
 * persisted, restored, and carried forward forever.
 *
 * The concrete failure a stored flag produces: a god forbids `perdo-mentem`,
 * every instance is marked dormant, the god relents — and now something has to
 * walk the instance store and unmark them. That walk is a migration. It runs on
 * revocation, on snapshot load, on tradition change, and on raid resolution, and
 * the first of those four somebody forgets is a mage who can never use knowledge
 * they still demonstrably have. Deriving the predicate deletes all four call
 * sites; `dormancy.test.ts`'s final case is the proof, and it works by freezing
 * the holdings and changing only the ruleset argument.
 *
 * ## What dormancy forbids, in one place
 *
 * `magic-grid` lists the ban as a sentence: a dormant instance *"MUST NOT be
 * cast, taught, scribed, prepared, or counted as a satisfied prerequisite, and
 * MUST NOT contribute any primitive effect."* Six uses, and six separate `if`
 * statements written by four different capabilities is five chances to forget
 * one. {@link KNOWLEDGE_USE} enumerates them and {@link dormancyRefusal} answers
 * for all six identically, so the operations in `knowledge-instances`,
 * `magic-primitives` and `magic-traditions` ask rather than decide.
 *
 * A dormant instance is still an instance. It survives, it still counts toward
 * its node's existence in the universe (§1.5's derived count), and nothing here
 * destroys anything — forbidding a cell is not a knowledge-genocide button. What
 * a dormant instance *loses* is a decay floor, which is `knowledge-instances`'
 * to implement and is where an interdiction eventually bites.
 */

import type { ContentId, Ruleset } from '@mm/state';
import { permits } from '@mm/state';

import type { HeldKnowledge, MagicGrid, PrerequisiteStatus } from './grid.js';

/**
 * Every use a dormant instance is barred from, per `magic-grid`.
 *
 * A closed enumeration rather than a string, so that a caller cannot invent a
 * seventh use that nothing refuses. Values are stable integers because a refusal
 * may be reported through the agent-facing outcome channel (§4), where a string
 * would be a second thing to keep in sync with the observation contract.
 */
export const KNOWLEDGE_USE = {
  /** Releasing the effect in an engagement. */
  cast: 1,
  /** Transmitting mind → mind. */
  teach: 2,
  /** Transmitting mind → grimoire. */
  scribe: 3,
  /** Loading into a `cast: prepared` tradition's preparation slots. */
  prepare: 4,
  /** Counting as a satisfied prerequisite for another node. */
  prerequisite: 5,
  /** Contributing a primitive effect to the stacking pipeline. */
  effect: 6,
} as const;

export type KnowledgeUseValue = (typeof KNOWLEDGE_USE)[keyof typeof KNOWLEDGE_USE];

/**
 * Why an operation was refused.
 *
 * Carries the cell as well as the node because the *player-facing* fact is the
 * cell — a god who forbade `perdo-mentem` needs to see that this is the edict
 * they issued, not a bug in a node they have never heard of.
 */
export interface DormancyRefusal {
  readonly nodeId: ContentId;
  readonly cellId: number;
  readonly use: KnowledgeUseValue;
  /** The only reason this function produces. Named so callers can widen later. */
  readonly reason: 'dormancy';
}

/**
 * Whether a universe's ruleset permits a cell, right now.
 *
 * @throws RangeError, from `permits()`, if `cellId` names no cell.
 */
export function isCellAvailable(ruleset: Ruleset, cellId: number): boolean {
  return permits(ruleset, cellId);
}

/** Whether an instance of a node would be dormant in this universe. */
export function isDormant(grid: MagicGrid, ruleset: Ruleset, nodeId: ContentId): boolean {
  return !isCellAvailable(ruleset, grid.cellOf(nodeId));
}

/**
 * Whether an instance of a node may be used at all.
 *
 * The positive spelling exists because most call sites want it, and a call site
 * that has to write `!isDormant(...)` is a call site one refactor away from
 * writing `isDormant(...)` by mistake.
 */
export function isUsable(grid: MagicGrid, ruleset: Ruleset, nodeId: ContentId): boolean {
  return !isDormant(grid, ruleset, nodeId);
}

/**
 * The refusal for one use of one node, or `undefined` if it is permitted.
 *
 * `undefined` rather than a null-object refusal with `reason: 'none'`: a caller
 * that forgot to check would then carry a "refusal" forward as though it were
 * one, and the operation would fail closed on a node nothing objected to.
 */
export function dormancyRefusal(
  grid: MagicGrid,
  ruleset: Ruleset,
  nodeId: ContentId,
  use: KnowledgeUseValue,
): DormancyRefusal | undefined {
  const cellId = grid.cellOf(nodeId);
  if (isCellAvailable(ruleset, cellId)) return undefined;
  return { nodeId, cellId, use, reason: 'dormancy' };
}

/**
 * A view of a holding with its dormant members hidden.
 *
 * A **view**, not a copy: it filters on read and writes nothing back, so the
 * holding a caller passed in is the same holding afterwards. Copying would
 * materialise the dormant set, which is the stored flag this file exists to
 * avoid, one indirection further out.
 */
export function usableHolding(
  grid: MagicGrid,
  ruleset: Ruleset,
  held: HeldKnowledge,
): HeldKnowledge {
  return { holds: (nodeId) => held.holds(nodeId) && isUsable(grid, ruleset, nodeId) };
}

/** Prerequisites, evaluated against usable holdings, with the dormant ones named. */
export interface UsablePrerequisiteStatus extends PrerequisiteStatus {
  /**
   * Prerequisites the subject holds but cannot use, ascending. A subset of
   * `missing` — separated because "you do not know it" and "your god forbade
   * it" are different sentences, and the second is the one the god can act on.
   */
  readonly dormant: readonly ContentId[];
}

/**
 * Whether a subject may treat a node's prerequisites as met, in this universe.
 *
 * The ruleset-aware wrapper around {@link MagicGrid.prerequisiteStatus}, and the
 * function an acquisition operation should call. A dormant prerequisite does not
 * count — `magic-grid` is explicit, and the design note gives the reason: a god
 * who could research *through* a forbidden cell to reach a permitted one beyond
 * it would be routing around their own interdiction, and the prerequisite
 * graph's meaning would depend on history rather than on present state.
 */
export function prerequisiteStatusFor(
  grid: MagicGrid,
  ruleset: Ruleset,
  nodeId: ContentId,
  held: HeldKnowledge,
): UsablePrerequisiteStatus {
  const status = grid.prerequisiteStatus(nodeId, usableHolding(grid, ruleset, held));
  const dormant = status.missing.filter((prerequisiteId) => held.holds(prerequisiteId));
  return { satisfied: status.satisfied, missing: status.missing, dormant };
}
