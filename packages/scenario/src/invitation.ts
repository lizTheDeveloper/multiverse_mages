/*
 * Multiverse Mages — who action 16 may invite, and from where.
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
 * The invitation roster under the author's rule of 2026-10-08:
 *
 * > *"Inter-universal travel is the only way to get multiple races."*
 *
 * A universe starts with one species; a second may arrive only through a portal
 * from a universe that **actually holds** that species. Before this file the
 * roster was every species the content declares, gated only on holding portal
 * magic, so a lobby player gathered all six without ever meeting a universe of
 * five of them.
 *
 * With live peers (a lobby bubble) the roster is the union of the species alive
 * in the universes behind this one's portal seats, recomputed each time it is
 * asked. Headless runs keep the static roster: their portal targets are the
 * stand-in rivals `rival-universe.ts` builds, and every stand-in is founded with
 * `foundingSpeciesMask: 0` — every species — so "the species a reachable
 * universe holds" is every species there, and the headless baselines take the
 * branch they were recorded on. `invitation.test.ts` holds that equivalence to
 * the rival builder rather than to this comment.
 */

import type { SimState } from '@mm/sim-core';
import { MAGE, collectRecords } from '@mm/state';

import type { PeerPortals } from './raids.js';

/** Interned ids of every species with a living mage in `state`, ascending. */
export function speciesAliveIn(state: SimState): readonly number[] {
  const alive = new Set<number>();
  for (const { row } of collectRecords(state, MAGE)) {
    if (row.alive !== 0) alive.add(row.speciesId);
  }
  return [...alive].sort((a, b) => a - b);
}

/**
 * The species a seat's universe holds, through {@link PeerPortals.speciesIn}
 * when the host supplies it and through the seat's live state otherwise. An
 * empty or ended seat holds nothing — it is not reachable.
 */
function speciesInSeat(peers: PeerPortals, seat: number): readonly number[] {
  if (peers.speciesIn !== undefined) return peers.speciesIn(seat) ?? [];
  const participant = peers.participant(seat);
  return participant === undefined ? [] : speciesAliveIn(participant.world);
}

/** One species action 16 could invite, and the lowest seat whose universe holds it. */
export interface InvitationSource {
  readonly speciesId: number;
  readonly seat: number;
}

/**
 * Every species alive behind a portal seat, ascending by id, each with the
 * lowest seat that holds it. Species this universe already holds are *not*
 * removed here — `invitePlan` and the candidate list both refuse a resident
 * species from state, and filtering twice would be two places to disagree.
 */
export function invitationSources(peers: PeerPortals): readonly InvitationSource[] {
  const bySpecies = new Map<number, number>();
  for (const seat of [...peers.seats].sort((a, b) => a - b)) {
    for (const speciesId of speciesInSeat(peers, seat)) {
      if (!bySpecies.has(speciesId)) bySpecies.set(speciesId, seat);
    }
  }
  return [...bySpecies.entries()]
    .sort(([a], [b]) => a - b)
    .map(([speciesId, seat]) => ({ speciesId, seat }));
}

/** {@link invitationSources}' species ids alone. */
export function reachableSpecies(peers: PeerPortals): readonly number[] {
  return invitationSources(peers).map((source) => source.speciesId);
}
