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
  private members: Map<string, UniverseHost> = new Map();
  readonly createdAt = Date.now();

  constructor(tier = 0) {
    this.id = randomUUID();
    this.tier = tier;
  }

  add(host: UniverseHost): void {
    host.ref.bubbleId = this.id;
    this.members.set(host.id, host);
  }

  remove(universeId: string): void {
    this.members.delete(universeId);
  }

  get(universeId: string): UniverseHost | undefined {
    return this.members.get(universeId);
  }

  portalTargets(attackerId: string): UniverseHost[] {
    const targets: UniverseHost[] = [];
    for (const [id, host] of this.members) {
      if (id !== attackerId && host.isAlive) targets.push(host);
    }
    return targets;
  }

  randomTarget(attackerId: string): UniverseHost | undefined {
    const targets = this.portalTargets(attackerId);
    if (targets.length === 0) return undefined;
    return targets[Math.floor(Math.random() * targets.length)];
  }

  get aliveCount(): number {
    let n = 0;
    for (const host of this.members.values()) {
      if (host.isAlive) n++;
    }
    return n;
  }

  get isCleared(): boolean {
    return this.aliveCount <= 1;
  }

  get winner(): UniverseHost | undefined {
    if (!this.isCleared) return undefined;
    for (const host of this.members.values()) {
      if (host.isAlive) return host;
    }
    return undefined;
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
