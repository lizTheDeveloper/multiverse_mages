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
  const instance = requireInstance(knowledge, grimoire, 'shelve');
  knowledge.setLocation(instance, LOCATION_KIND.library, library);
  setHolder(knowledge, grimoire, HOLDER_KIND.library, library);
}

/** Withdraws a shelved grimoire into a mage's hands, reversing the rewrite. */
export function withdrawGrimoire(
  knowledge: KnowledgeSubsystem,
  grimoire: Handle,
  holder: Handle,
): void {
  const instance = requireInstance(knowledge, grimoire, 'withdraw');
  knowledge.setLocation(instance, LOCATION_KIND.grimoire, grimoire);
  setHolder(knowledge, grimoire, HOLDER_KIND.mage, holder);
}

/**
 * Destroys a grimoire and the one instance that is its contents.
 *
 * @returns the loss event if that copy was the node's last instance anywhere.
 */
export function destroyGrimoire(
  knowledge: KnowledgeSubsystem,
  grimoire: Handle,
  worldTick: Tick,
): KnowledgeLossEvent | undefined {
  const instance = requireInstance(knowledge, grimoire, 'destroy');
  const event = knowledge.destroyInstance(instance, worldTick);
  knowledge.state.entities.destroy(grimoire as EntityHandle);
  return event;
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

function setHolder(
  knowledge: KnowledgeSubsystem,
  grimoire: Handle,
  holderKind: number,
  holderId: Handle,
): void {
  const store = componentOf(knowledge.state, GRIMOIRE);
  store.set(grimoire as EntityHandle, 'holderKind', holderKind);
  store.set(grimoire as EntityHandle, 'holderId', holderId);
}
