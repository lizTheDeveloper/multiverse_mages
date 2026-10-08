/*
 * Multiverse Mages — in-process universe host.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createSession, type AgentSession } from '@mm/agent-api';
import {
  participantOf,
  referenceContent,
  referenceScenario,
  type RaidRecord,
  type ReferenceContent,
} from '@mm/scenario';
import type { UniverseRef as ServerUniverseRef } from '@mm/server';
import { randomInt, randomUUID } from 'node:crypto';

export interface UniverseRef extends Omit<ServerUniverseRef, 'universeId' | 'bubbleId'> {
  universeId: string;
  bubbleId: string;
}

export interface UniverseConfig {
  species?: string;
  tradition?: string;
  techniques?: string[];
  forms?: string[];
  seed?: number;
  tickCap?: number;
  /** 1 founds a mage holding a portal node, so action 14 opens within a few ticks. */
  foundingPortalMagic?: number;
}

/** A raid another universe opened on this one, as its attacker recorded it. */
export interface InboundRaid {
  readonly fromUniverseId: string;
  readonly record: RaidRecord;
}

/** Who sits in a portal seat of `self`, or `undefined` for an empty seat. */
export type SeatResolver = (self: UniverseHost, seat: number) => UniverseHost | undefined;

const content: ReferenceContent = referenceContent();

export class UniverseHost {
  readonly id: string;
  readonly ref: UniverseRef;
  readonly config: UniverseConfig;
  readonly seed: number;
  readonly inbound: InboundRaid[] = [];

  private session: AgentSession;
  private raids: () => readonly RaidRecord[];
  /** This universe's current state: what a peer's raid reads and writes. */
  private state: Parameters<typeof participantOf>[0] | undefined;
  private tick = 0;
  private killed = false;

  /**
   * @param seats - How many portal seats this universe has: its bubble's size
   *   less one. Fixed at creation because the observation's candidate list is.
   */
  constructor(config: UniverseConfig, seats: number, seatHost: SeatResolver) {
    this.id = randomUUID();
    this.config = config;
    this.ref = { universeId: this.id, bubbleId: '', prestige: 0 };

    // `Date.now()` is not a uint32, and `session.reset` refuses anything else —
    // which made every `/api/create` without a seed a 400.
    this.seed = config.seed ?? randomInt(0, 0xffff_ffff);
    const tickCap = config.tickCap ?? 4000;

    const run = referenceScenario(content, {
      raids: true,
      onState: (s) => {
        this.state = s;
      },
      peers: {
        seats: Array.from({ length: seats }, (_, i) => i + 1),
        participant: (seat) => {
          const peer = seatHost(this, seat);
          return peer?.state === undefined || !peer.isAlive ? undefined : participantOf(peer.state, content);
        },
        onOutbound: (seat, record) => {
          seatHost(this, seat)?.inbound.push({ fromUniverseId: this.id, record });
        },
      },
    });
    this.raids = run.raids;
    this.session = createSession({ scenario: run.scenario, strategyId: 'lobby-universe' });
    this.session.reset(this.seed, {
      worldTickCap: tickCap,
      options: { foundingPortalMagic: config.foundingPortalMagic === 1 ? 1 : 0 },
    });

    // warm up so the god has favor
    for (let i = 0; i < 40; i++) {
      this.session.submit({ kind: 0 });
      this.tick++;
    }
  }

  get worldTick(): number {
    return this.tick;
  }

  get isAlive(): boolean {
    return !this.killed && this.session.status() === 'running';
  }

  submit(kind: number, params: number[] = []): { admitted: boolean; rejection?: string } {
    if (!this.isAlive) return { admitted: false, rejection: 'episode-over' };
    const result = this.session.submit({ kind, params });
    this.tick++;
    return {
      admitted: result.admitted,
      ...(result.rejection === undefined ? {} : { rejection: String(result.rejection) }),
    };
  }

  advance(ticks: number): void {
    if (!this.isAlive) return;
    const max = Math.min(ticks, 500);
    for (let i = 0; i < max && this.isAlive; i++) {
      this.session.submit({ kind: 0 });
      this.tick++;
    }
  }

  observe(): { obs: number[]; mask: number[]; candidates: Record<number, number[][]> } {
    const obs = Array.from(this.session.observe());
    const mask = Array.from(this.session.legalActions());
    const candidates: Record<number, number[][]> = {};
    for (const [action, list] of this.session.candidates()) {
      candidates[action] = list.map((c) => [...c.params]);
    }
    return { obs, mask, candidates };
  }

  /** Raids this universe resolved, in order — its own outbound and any stand-in inbound. */
  raidLog(): readonly RaidRecord[] {
    return this.raids();
  }

  snapshotHash(): string {
    return this.session.snapshotHash();
  }

  kill(): void {
    this.killed = true;
  }
}
