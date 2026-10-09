/*
 * Multiverse Mages — bubble coordinator (in-process).
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import type { UniverseHost } from './universe-host.js';

export interface BubbleInfo {
  bubbleId: string;
  tier: number;
  members: { universeId: string; name: string; species: string; alive: boolean }[];
  createdAt: number;
}

/** A bubble-mate as another universe sees it: public, read-only. */
export interface SeatOccupant {
  universeId: string;
  name: string;
  species: string;
  /**
   * Interned ids of every species alive there now — what action 16 could
   * invite from this seat (the author's rule of 2026-10-08: a second species
   * arrives only through a portal from a universe that holds it). Empty once
   * the universe has ended.
   */
  speciesIds: number[];
}

export class Bubble {
  readonly id: string;
  readonly tier: number;
  readonly createdAt: number;
  private members = new Map<string, UniverseHost>();
  /**
   * The bubble's fixed positions, `capacity` of them, each holding a universe
   * id or `null`. A member's portal seats are the other positions in order, so
   * a seat number always names the same position: a universe joining or
   * leaving changes who sits in one seat and never moves anyone to another.
   */
  private slots: (string | null)[];

  /**
   * @param now - The lobby clock's reading; the bubble reads no clock itself.
   * @param capacity - Positions in the bubble: the lobby's bubble size.
   */
  constructor(now: number, capacity: number, tier = 0) {
    this.id = randomUUID();
    this.tier = tier;
    this.createdAt = now;
    this.slots = Array.from({ length: capacity }, () => null);
  }

  /**
   * Seats `host` in an open position, ending (and dropping) an ended
   * universe that held it. Returns false when every position holds a live
   * universe.
   */
  add(host: UniverseHost): boolean {
    const at = this.openSlot();
    if (at < 0) return false;
    const previous = this.slots[at];
    if (previous !== null && previous !== undefined) this.members.delete(previous);
    this.slots[at] = host.id;
    host.ref.bubbleId = this.id;
    this.members.set(host.id, host);
    return true;
  }

  /** The first position that is empty or holds an ended universe, or -1. */
  private openSlot(): number {
    return this.slots.findIndex((id) => id === null || this.members.get(id)?.isAlive !== true);
  }

  /** Whether a universe could join now. */
  get hasRoom(): boolean {
    return this.openSlot() >= 0;
  }

  /** Drops a member. Its position stays, empty, for the next arrival. */
  remove(universeId: string): void {
    this.members.delete(universeId);
    const at = this.slots.indexOf(universeId);
    if (at >= 0) this.slots[at] = null;
  }

  get(universeId: string): UniverseHost | undefined {
    return this.members.get(universeId);
  }

  /** Whether `universeId` holds a position here now. */
  has(universeId: string): boolean {
    return this.slots.includes(universeId);
  }

  /**
   * The universe in `self`'s portal seat `seat` (1-based): the bubble's other
   * positions in order, with `self`'s own left out. `undefined` for an empty
   * seat, and for every seat of a universe that no longer holds a position.
   */
  seatOf(selfId: string, seat: number): UniverseHost | undefined {
    if (!this.slots.includes(selfId)) return undefined;
    const id = this.slots.filter((m) => m !== selfId)[seat - 1];
    return id === null || id === undefined ? undefined : this.members.get(id);
  }

  /** Who sits in each of `self`'s seats — `null` for an empty seat. */
  seats(selfId: string, seats: number): Record<string, SeatOccupant | null> {
    const out: Record<string, SeatOccupant | null> = {};
    for (let seat = 1; seat <= seats; seat += 1) {
      const h = this.seatOf(selfId, seat);
      out[String(seat)] =
        h === undefined
          ? null
          : { universeId: h.id, name: h.name, species: h.speciesName, speciesIds: [...(h.speciesAlive() ?? [])] };
    }
    return out;
  }

  get aliveCount(): number {
    let n = 0;
    for (const host of this.members.values()) {
      if (host.isAlive) n++;
    }
    return n;
  }

  info(): BubbleInfo {
    return {
      bubbleId: this.id,
      tier: this.tier,
      members: this.slots
        .map((id) => (id === null ? undefined : this.members.get(id)))
        .filter((h): h is UniverseHost => h !== undefined)
        .map((h) => ({ universeId: h.id, name: h.name, species: h.speciesName, alive: h.isAlive })),
      createdAt: this.createdAt,
    };
  }

  get size(): number {
    return this.members.size;
  }
}
