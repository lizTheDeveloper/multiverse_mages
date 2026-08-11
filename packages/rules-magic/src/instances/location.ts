/*
 * Multiverse Mages — a written copy's location, and what happens when it burns.
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
 * Shelving, withdrawal, and destruction — the three things that happen to a
 * book, expressed so that a book is never counted twice and never counted
 * zero times.
 *
 * ## The ambiguity this module resolves
 *
 * `contracts.md` §1.5 defines `locationKind` `2` = grimoire and `3` = library,
 * and separately gives a grimoire a `holderKind`/`holderId` that may name a
 * library. Read literally, a shelved grimoire's knowledge could be counted
 * twice: once as a grimoire instance, once as a library instance. §1.5 also
 * says, in the same section, that exactly one instance exists per written copy.
 * Both readings cannot hold.
 *
 * The resolution, which `knowledge-model` reports rather than applies quietly:
 * **one instance, whose location is rewritten.** It carries `(2, grimoireId)`
 * while a mage holds it or it is in transit, and `(3, libraryId)` while it is
 * shelved. Shelving and withdrawal rewrite; they never create or destroy.
 *
 * That keeps three things true at once — library depth is a count over
 * `locationKind == 3` rather than a join through every grimoire's holder,
 * "burn the book, lose the instance" holds in both states, and a destroyed
 * library resolves to "every instance whose `locationId` is this library" with
 * no traversal at all.
 *
 * ## Whose entity is whose
 *
 * These functions destroy grimoires and the instances they carry. They do
 * **not** destroy the library entity: libraries belong to `contracts.md` §1.4's
 * university model, which is `rules-world`'s, and a knowledge operation that
 * quietly deleted an institution would be reaching across the boundary §5
 * draws. The caller burns the building; this reports what was inside it.
 */

import type { EntityHandle } from '@mm/sim-core';
import type { Handle, Tick } from '@mm/state';
import { GRIMOIRE, HOLDER_KIND, LOCATION_KIND, componentOf } from '@mm/state';

import type { KnowledgeLossEvent } from './outcomes.js';
import type { KnowledgeSubsystem } from './subsystem.js';
import { writtenInstanceLocation } from './subsystem.js';

/**
 * Shelves a grimoire in a library.
 *
 * @throws RangeError if the subsystem knows of no instance for the grimoire.
 * A book with no contents is not a state this package can produce — the only
 * way to reach it is a grimoire created outside {@link scribe} without its
 * instance, and continuing would shelve a book that cannot be burned.
 */
export function shelveGrimoire(
  knowledge: KnowledgeSubsystem,
  grimoire: Handle,
  library: Handle,
): void {
  placeGrimoire(knowledge, grimoire, HOLDER_KIND.library, library, 'shelve');
}

/** Withdraws a shelved grimoire into a mage's hands, reversing the rewrite. */
export function withdrawGrimoire(
  knowledge: KnowledgeSubsystem,
  grimoire: Handle,
  holder: Handle,
): void {
  placeGrimoire(knowledge, grimoire, HOLDER_KIND.mage, holder, 'withdraw');
}

/**
 * Releases a book into nobody's hands: `unowned`, holder `0`.
 *
 * The state `contracts.md` §1.5 names for a dead unaffiliated mage's books —
 * *"a dead unaffiliated mage's books are not in transit to anywhere"* — and the
 * reason `HOLDER_KIND.unowned` is `0` rather than last in the enumeration.
 * Without this, such a book keeps naming its dead author as its holder, which
 * reads as *owned by a corpse*: a holder the estate has already settled, and a
 * grimoire that no library, no heir and no looter can be said to have missed.
 *
 * The instance goes back to `(2, grimoireId)`, because that is what
 * `writtenInstanceLocation` says an unshelved book's contents are at, and the
 * book is unshelved. Nothing is destroyed: an unowned book is still a book, and
 * the knowledge in it still counts toward the node's instance count. Losing it
 * is `destroyGrimoire`'s job and takes a fire.
 */
export function disownGrimoire(knowledge: KnowledgeSubsystem, grimoire: Handle): void {
  placeGrimoire(knowledge, grimoire, HOLDER_KIND.unowned, 0, 'disown');
}

/**
 * Destroys a grimoire and the one instance that is its contents.
 *
 * The instance is what is destroyed; the book goes with it, because
 * `KnowledgeSubsystem.destroyInstance` owns that pair — a grimoire whose
 * contents are gone is exactly the object {@link requireInstance} refuses to
 * operate on, and there is no path that should be able to produce one.
 *
 * @returns the loss event if that copy was the node's last instance anywhere.
 */
export function destroyGrimoire(
  knowledge: KnowledgeSubsystem,
  grimoire: Handle,
  worldTick: Tick,
): KnowledgeLossEvent | undefined {
  return knowledge.destroyInstance(requireInstance(knowledge, grimoire, 'destroy'), worldTick);
}

/**
 * Destroys everything shelved in a library.
 *
 * Ascending slot order, so the loss events come out in the same order on every
 * machine — a raid report that two peers disagree about the ordering of is a
 * desync waiting to be attributed to something else.
 */
export function destroyLibrary(
  knowledge: KnowledgeSubsystem,
  library: Handle,
  worldTick: Tick,
): KnowledgeLossEvent[] {
  const lost: KnowledgeLossEvent[] = [];
  for (const instance of knowledge.instancesAt(LOCATION_KIND.library, library)) {
    const grimoire = grimoireOf(knowledge, instance);
    const event =
      grimoire === 0
        ? knowledge.destroyInstance(instance, worldTick)
        : destroyGrimoire(knowledge, grimoire, worldTick);
    if (event !== undefined) lost.push(event);
  }
  return lost;
}

/** Every grimoire shelved in a library, in ascending slot order. */
export function grimoiresIn(knowledge: KnowledgeSubsystem, library: Handle): Handle[] {
  const found: Handle[] = [];
  for (const instance of knowledge.instancesAt(LOCATION_KIND.library, library)) {
    const grimoire = grimoireOf(knowledge, instance);
    if (grimoire !== 0) found.push(grimoire);
  }
  return found;
}

/** The grimoire an instance is the contents of, or `0`. */
function grimoireOf(knowledge: KnowledgeSubsystem, instance: Handle): Handle {
  const view = knowledge.read(instance);
  if (view.locationKind === LOCATION_KIND.grimoire) return view.locationId;
  return knowledge.grimoireHolding(instance);
}

function requireInstance(
  knowledge: KnowledgeSubsystem,
  grimoire: Handle,
  operation: string,
): Handle {
  const instance = knowledge.instanceForGrimoire(grimoire);
  if (instance === 0) {
    throw new RangeError(
      `Cannot ${operation} grimoire ${String(grimoire)}: the knowledge subsystem associates no ` +
        'instance with it. contracts.md §1.5 keeps exactly one instance per written copy, so a ' +
        'grimoire without one is a book whose contents nothing can destroy.',
    );
  }
  return instance;
}

/**
 * Hands a book to a holder: writes §1.5's holder fields and moves the one
 * instance that is its contents, in a single call.
 *
 * Shelving and withdrawal are the same operation with different arguments, and
 * they are written as one so that neither can be performed without the other.
 * Two functions each doing half is how a book ends up on a shelf its library
 * cannot see — and the location is *derived* from the holder by
 * `writtenInstanceLocation` rather than passed alongside it, so there is no
 * argument a caller could get wrong.
 */
function placeGrimoire(
  knowledge: KnowledgeSubsystem,
  grimoire: Handle,
  holderKind: number,
  holderId: Handle,
  operation: string,
): void {
  const instance = requireInstance(knowledge, grimoire, operation);
  const store = componentOf(knowledge.state, GRIMOIRE);
  store.set(grimoire as EntityHandle, 'holderKind', holderKind);
  store.set(grimoire as EntityHandle, 'holderId', holderId);

  const location = writtenInstanceLocation(grimoire, holderKind, holderId);
  knowledge.setLocation(instance, location.locationKind, location.locationId);
}
