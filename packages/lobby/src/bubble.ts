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
  members: { universeId: string; alive: boolean }[];
  createdAt: number;
}

export class Bubble {
  readonly id: string;
  readonly tier: number;
  readonly createdAt: number;
  private members = new Map<string, UniverseHost>();
  /**
   * Every universe that ever joined, ascending. A seat is a position in this
   * list, so evicting one member empties its seat instead of shifting every
   * other member into a different one.
   */
  private memberIds: string[] = [];

  /** @param now - The lobby clock's reading; the bubble reads no clock itself. */
  constructor(now: number, tier = 0) {
    this.id = randomUUID();
    this.tier = tier;
    this.createdAt = now;
  }

  add(host: UniverseHost): void {
    host.ref.bubbleId = this.id;
    this.members.set(host.id, host);
    this.memberIds = [...this.memberIds, host.id].sort();
  }

  /** Drops a member. Its seat stays, empty. */
  remove(universeId: string): void {
    this.members.delete(universeId);
  }

  get(universeId: string): UniverseHost | undefined {
    return this.members.get(universeId);
  }

  /**
   * The universe in `self`'s portal seat `seat` (1-based): its bubble-mates in
   * id order, with itself left out. `undefined` for an evicted mate.
   */
  seatOf(selfId: string, seat: number): UniverseHost | undefined {
    const id = this.memberIds.filter((m) => m !== selfId)[seat - 1];
    return id === undefined ? undefined : this.members.get(id);
  }

  /** Who sits in each of `self`'s seats, by universe id — `null` for an empty seat. */
  seatIds(selfId: string, seats: number): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (let seat = 1; seat <= seats; seat += 1) out[String(seat)] = this.seatOf(selfId, seat)?.id ?? null;
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
      members: [...this.members.values()].map((h) => ({
        universeId: h.id,
        alive: h.isAlive,
      })),
      createdAt: this.createdAt,
    };
  }

  get size(): number {
    return this.members.size;
  }
}
