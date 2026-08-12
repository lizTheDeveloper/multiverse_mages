/*
 * Multiverse Mages — every spell you throw is a lesson you gave away.
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
 * `docs/design/raid-engagement.md` §3's second attacker payment:
 *
 * > Every spell cast inside the host's universe is cast *in front of the host's
 * > academics*, and casting teaches them. An attacker who wins by throwing
 * > everything they know has handed the defender a curriculum.
 *
 * ## The open question §6.6 leaves, and the answer taken here
 *
 * > *Does exposure teach a node outright, or raise a discovery weight? Teaching
 * > it outright is legible and brutal; weighting it is subtler and harder to
 * > see. The campaign's own evidence favours legible, since a mechanic nobody
 * > can observe has repeatedly turned out to be doing nothing.*
 *
 * **Teach outright.** Chosen for the reason the design gives, and for two more
 * that are specific to this codebase:
 *
 * - A discovery weight would have to enter through the research subsystem's
 *   scoring, which means a **draw**, which means a new position in a stream that
 *   every committed balance baseline is measured against. Teaching outright
 *   needs no randomness at all, so the whole mechanic is auditable as "no new
 *   draws" rather than argued about.
 * - A weight is unfalsifiable at this stage. `winRateByPrimitive`'s ablation can
 *   switch a node off and see the difference; it cannot switch off a
 *   contribution that arrives as a shifted probability inside another
 *   subsystem's roll. This project has been bitten by exactly that shape — a
 *   metric describing nothing — and said so in `raid.ts`.
 *
 * ## What it teaches, and to whom
 *
 * **The first cast of each node, once per raid.** A raider who throws the same
 * fire spell four hundred times has taught it once; there is nothing further to
 * learn from the four hundred and first. Deduplicating is not an optimisation —
 * without it, exposure would scale with tick count rather than with repertoire,
 * and "winning with your cheapest spells preserves your edge" would be false.
 *
 * **To the lowest-handle living defender mage who does not already hold it.** A
 * total order over a stable identity, for the reason `acquireTarget` picks its
 * target by one: two peers with the same battlefield must teach the same mage.
 * No eligible recipient — every defending mage dead, or every one of them
 * already knows it — means no exposure, rather than a node inserted nowhere.
 *
 * **At mastery zero**, which is where theft writes too. She saw the shape of it
 * and not the practice: she cannot teach it onward without further study, which
 * is what keeps exposure from being a shortcut past the whole knowledge model.
 * It still counts toward existence (§1.5), which is the part that bites — a
 * universe raided twice by the same attacker has been handed her repertoire.
 *
 * ## Attacker to defender, and not the other way
 *
 * A defender casting at home is not performing for anybody. The channel that
 * runs the other way already exists and is called theft, it is gated by
 * `permits()` and by a roll, and it costs the thief a tick she could have spent
 * killing. Exposure is free to give and expensive to have given, which is what
 * makes it a different mechanic rather than a symmetric one.
 */

import type { ContentId } from '@mm/content';
import type { Handle } from '@mm/state';
import { LOCATION_KIND, MAGE, collectRecords } from '@mm/state';

import type { KnowledgeMovement } from './outcome.js';
import type { RaidParticipant } from './raid.js';

/**
 * The nodes an attacker has been seen to cast, in first-cast order.
 *
 * A `Set` rather than a list, and the dedup is the mechanic. Iteration order is
 * insertion order, but everything that reads it sorts — see {@link exposedNodes}.
 */
export class ExposureRegister {
  readonly #seen = new Set<ContentId>();

  /**
   * Records one resolved attacker cast.
   *
   * @returns `true` the first time a node is seen, so a caller can report the
   * moment a repertoire leaked rather than having to diff two sets.
   */
  observe(nodeId: ContentId): boolean {
    if (this.#seen.has(nodeId)) return false;
    this.#seen.add(nodeId);
    return true;
  }

  /** Whether a node has been cast in front of the host at all. */
  has(nodeId: ContentId): boolean {
    return this.#seen.has(nodeId);
  }

  get size(): number {
    return this.#seen.size;
  }

  /** Everything seen, ascending. A report whose row order moves is not a diff. */
  nodes(): readonly ContentId[] {
    return [...this.#seen].sort((a, b) => a - b);
  }
}

/** One node the host learned by watching, and the mage who watched it. */
export interface ExposureRecord {
  readonly nodeId: ContentId;
  /** The defending mage who takes it, in her own universe. */
  readonly learnedBy: Handle;
}

/**
 * Who learns what, computed against the host as it stands at resolution.
 *
 * Computed at resolution rather than at each cast, for the reason every other
 * consequence is: the outcome record is complete before a field of either world
 * moves. It also gets the recipient right — a mage who dies in the last tick
 * did not go home with a lesson, and choosing her at cast time would have meant
 * either inserting into a corpse or reassigning afterwards.
 *
 * One mage may learn several nodes. That is correct and is what the design
 * describes: an attacker who throws her whole repertoire has taught *somebody*
 * all of it, and spreading the lessons around would be a fairness rule nobody
 * asked for.
 */
export function exposedNodes(
  host: RaidParticipant,
  register: ExposureRegister,
): readonly ExposureRecord[] {
  const living: Handle[] = collectRecords(host.world, MAGE)
    .filter((entry) => entry.row.alive === 1)
    .map((entry) => entry.handle)
    .sort((a, b) => a - b);
  if (living.length === 0) return [];

  const out: ExposureRecord[] = [];
  for (const nodeId of register.nodes()) {
    const recipient = living.find((mage) => !holdsNode(host, mage, nodeId));
    if (recipient === undefined) continue;
    out.push({ nodeId, learnedBy: recipient });
  }
  return out;
}

/** Whether a mage already holds a node anywhere she can be taught it. */
function holdsNode(host: RaidParticipant, mage: Handle, nodeId: ContentId): boolean {
  for (const instance of host.knowledge.instancesHeldBy(mage)) {
    if (host.knowledge.read(instance).nodeId === nodeId) return true;
  }
  return false;
}

/**
 * Exposure as knowledge movements, so it appears where every other transfer does.
 *
 * The verb is `'witnessed'`, and it is a fourth verb rather than a reuse of
 * `'copied'` for the reason the other three are distinct: they produce different
 * worlds and a record that conflated them could not answer the question the
 * metric is about. A copy is taken *from* somebody; a witnessing is given away
 * by the person who cast, and the host loses nothing. `libraryDependence` and
 * every raid metric read this list, and an exposure filed as a theft would be a
 * theft nobody committed.
 *
 * `byCombatant` is `0`: no combatant of the *host's* did this, and the raider
 * who cast is not the actor of the transfer either — she is the cause of it.
 */
export function exposureMovements(
  records: readonly ExposureRecord[],
): readonly KnowledgeMovement[] {
  return records.map((record) => ({
    nodeId: record.nodeId,
    verb: 'witnessed' as const,
    byCombatant: 0 as Handle,
    forfeited: false,
  }));
}

/** The location an exposed instance is created at: a mind, never a book. */
export const EXPOSURE_LOCATION_KIND = LOCATION_KIND.mind;
