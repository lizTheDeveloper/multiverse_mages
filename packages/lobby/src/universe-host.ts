/*
 * Multiverse Mages — in-process universe host.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createSession, type AgentSession } from '@mm/agent-api';
import { referenceContent, referenceScenario } from '@mm/scenario';
import { randomUUID } from 'node:crypto';

export interface UniverseConfig {
  species?: string;
  tradition?: string;
  techniques?: string[];
  forms?: string[];
  seed?: number;
  tickCap?: number;
}

export interface UniverseRef {
  universeId: string;
  bubbleId: string;
  prestige: number;
}

export class UniverseHost {
  readonly id: string;
  readonly ref: UniverseRef;
  readonly config: UniverseConfig;

  private session: AgentSession;
  private content: ReturnType<typeof referenceContent>;
  private tick = 0;
  private alive = true;

  constructor(config: UniverseConfig) {
    this.id = randomUUID();
    this.config = config;
    this.ref = {
      universeId: this.id,
      bubbleId: '',
      prestige: 0,
    };

    this.content = referenceContent();
    const seed = config.seed ?? Date.now();
    const tickCap = config.tickCap ?? 4000;

    const { scenario } = referenceScenario(this.content, { raids: true });
    this.session = createSession({ scenario, strategyId: 'lobby-universe' });
    this.session.reset(seed, { worldTickCap: tickCap });

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
    return this.alive;
  }

  submit(kind: number, params: number[] = []): void {
    if (!this.alive) return;
    this.session.submit({ kind, params });
    this.tick++;
  }

  advance(ticks: number): void {
    if (!this.alive) return;
    const max = Math.min(ticks, 500);
    for (let i = 0; i < max; i++) {
      this.session.submit({ kind: 0 });
      this.tick++;
    }
  }

  observe(): { obs: number[]; mask: number[] } {
    const obs = Array.from(this.session.observe());
    const mask = Array.from(this.session.legalActions());
    return { obs, mask };
  }

  kill(): void {
    this.alive = false;
  }
}
