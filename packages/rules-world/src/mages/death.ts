/*
 * Multiverse Mages — what a mage's death costs the universe.
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

import type { ContentId } from '@mm/content';

import type { MageRecord } from '@mm/state';

import type { KnowledgeGateway, MageHandle, UniversityHandle } from '../coordination.js';
import { NO_INHERITOR } from '../coordination.js';

/**
 * ## Death is the mechanism behind "knowledge has a location"
 *
 * `docs/design/vision.md` §5 claims that knowledge is physical: it lives in
 * minds, in books, in libraries, and it can be *lost*. Mortality is what gives
 * that claim teeth. A mage who dies takes her `mind` instances with her, and —
 * in an Art of Memory universe — her `palace` instances too, unrecoverably,
 * because a memory palace is not a place anybody else can walk into.
 *
 * Her grimoires survive, because a book is a thing. `contracts.md` §1.5
 * enumerates who may hold one — mage, library, in transit, unowned — and the
 * `mage-lifecycle` spec routes an affiliated mage's books to her university's
 * library. An **unaffiliated** mage's books do not go anywhere, and §1.5 says
 * why in as many words: *"a dead unaffiliated mage's books are not in transit to
 * anywhere."* That is why {@link NO_INHERITOR} exists as a named constant and
 * why this module does not invent a fifth holder kind for the case.
 *
 * ## Why so much of this file is an interface
 *
 * Everything death *does* belongs to somebody else. Destroying knowledge
 * instances is `rules-magic`'s arithmetic, reached across the port in
 * `coordination.ts` because `contracts.md` §5 rule 3 forbids the two rules
 * packages from importing each other. Abandoning a goal belongs to the autonomy
 * layer, and releasing a university slot belongs to universities — neither of
 * which exists yet.
 *
 * The alternative to a port would be for this module to reach into those
 * subsystems directly as they land, which is how a death handler ends up being
 * the one function in the codebase that knows about everything. Declared as a
 * port, each obligation is a method somebody has to implement, and a missing
 * one is a compile error rather than an omission.
 *
 * ## Nothing here caches
 *
 * When the last instance of a node dies with its holder, the coordinating layer
 * is *notified* — and no "this node exists" flag is written to state.
 * `contracts.md` §1.5 is explicit that existence is derived from an index the
 * knowledge subsystem maintains, and a cached flag is a second source of truth
 * that a snapshot would faithfully preserve after it stopped being true.
 */

/**
 * The obligations a mage's death imposes on subsystems this package may not
 * import.
 *
 * Declared on the consumer's side, following `coordination.ts`: if the owning
 * packages published these shapes, `rules-world` would have to name them to
 * satisfy the type, and `contracts.md` §5 grants it no such edge — not even a
 * type-only one.
 */
export interface MageDeathPort {
  /** The knowledge half, from `coordination.ts`. */
  readonly knowledge: KnowledgeGateway;

  /**
   * Every node this mage currently holds an instance of, in mind or memory
   * palace, in a deterministic order.
   *
   * Needed *before* the instances are destroyed, because the "last instance in
   * the universe" question can only be asked about a node somebody names, and
   * after the destruction there is nobody left to name it.
   *
   * **This method is the one addition this group needs to `coordination.ts`'s
   * `KnowledgeGateway`.** It is carried here rather than added there because
   * that file belongs to another task group in flight; the amendment is
   * reported upward rather than merged silently.
   */
  heldNodes(mage: MageHandle): readonly ContentId[];

  /**
   * The universe has just lost its last instance of a node.
   *
   * A notification, not a write. What the coordinating layer does with it —
   * recording that the node is now *ever-known but not held*, which is what
   * makes rediscovery possible — is `rules-magic`'s.
   */
  onNodeInstanceCountZero(nodeId: ContentId): void;

  /**
   * Releases whatever the mage occupied: a university's resident slot, a role
   * slot, a teaching pair's other half.
   *
   * Implemented by the universities layer (task group 6). Called with the
   * mage's affiliation and role *as they were*, because by the time a caller
   * could read them back they have been cleared.
   */
  releaseSlots(mage: MageHandle, universityId: UniversityHandle, roleId: number): void;

  /**
   * Abandons whatever goal the mage was pursuing, and dissolves any teaching
   * pair she was half of.
   *
   * Implemented by the autonomy layer (task group 5). Mid-goal death must not
   * leave a student paired with a corpse, and must not credit the tick's
   * mage-months to work that stopped partway through — hence
   * {@link MageDeathOutcome.contributedMageMonths}, which is always zero.
   */
  abandonGoal(mage: MageHandle): void;
}

/** What a death did, for emission and for the caller's own bookkeeping. */
export interface MageDeathOutcome {
  /** Nodes whose universe-wide instance count reached zero as a result. */
  readonly nodesLost: readonly ContentId[];
  /** Where the grimoires went: a university handle, or {@link NO_INHERITOR}. */
  readonly inheritor: UniversityHandle;
  /**
   * Mage-months this mage contributes in the tick she dies. Always zero.
   *
   * A field rather than a comment because the spec states it as a scenario —
   * *"it contributes no mage-months in that tick or after"* — and a value a test
   * can read is a claim the implementation keeps making.
   */
  readonly contributedMageMonths: number;
}

/**
 * Whether a mage may be scheduled work this tick.
 *
 * The single predicate every accrual loop must consult. `alive` is a component
 * field *as well as* entity liveness (`components.ts` explains why the two are
 * not redundant), and the field is the one that answers this question: a dead
 * mage's entity is deliberately retained so that a grimoire naming her as its
 * last holder, or a university naming her as founder, does not hold a stale
 * handle.
 */
export function isWorkingMage(mage: MageRecord): boolean {
  return mage.alive !== 0;
}

/**
 * Kills a mage and settles every consequence, in one place and one order.
 *
 * The order is deliberate and each step depends on the one before it:
 *
 * 1. **Read the held nodes** — while there is still somebody holding them.
 * 2. **Abandon the goal and dissolve the teaching pair** — before `alive` is
 *    cleared, so the autonomy layer can still resolve the mage it is being told
 *    about.
 * 3. **Hand on the knowledge** — `onMageDied` destroys mind and palace
 *    instances and transfers grimoires to `inheritor`.
 * 4. **Ask which nodes are now gone** — *after* the destruction, because before
 *    it every one of them still had at least this mage's copy.
 * 5. **Clear the mage** — `alive` false, slots released, affiliation cleared.
 *
 * Step 4 is the one that is easy to get backwards, and getting it backwards
 * fails silently in the safe-looking direction: asked before the destruction,
 * `instanceCount` never returns zero, no node is ever reported lost, and the
 * universe appears to retain everything it has ever known.
 */
export function killMage(
  mage: MageHandle,
  record: MageRecord,
  port: MageDeathPort,
): MageDeathOutcome {
  const held = port.heldNodes(mage);
  const universityId = record.universityId;
  const roleId = record.roleId;
  const inheritor: UniversityHandle = universityId === 0 ? NO_INHERITOR : universityId;

  port.abandonGoal(mage);
  port.knowledge.onMageDied(mage, inheritor);

  const nodesLost: ContentId[] = [];
  for (const nodeId of held) {
    if (port.knowledge.instanceCount(nodeId) === 0) {
      nodesLost.push(nodeId);
      port.onNodeInstanceCountZero(nodeId);
    }
  }

  record.alive = 0;
  record.universityId = 0;
  port.releaseSlots(mage, universityId, roleId);

  return { nodesLost, inheritor, contributedMageMonths: 0 };
}
