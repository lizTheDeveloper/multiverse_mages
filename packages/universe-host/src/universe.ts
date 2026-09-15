/*
 * Multiverse Mages — universe server.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * One universe, one god, one wall clock.
 */

import type { AgentSession } from '@mm/agent-api';
import { createSession } from '@mm/agent-api';
import { referenceContent, referenceScenario } from '@mm/scenario';
import { systemClock, type Clock } from '@mm/server';

import type { GodMessage, ServerMessage } from './transport-ws.js';
import type { CoordFrame } from './coord-protocol.js';
import { COORD_VERB } from './coord-protocol.js';

const SPEED_TO_INTERVAL: Record<number, number> = {
  1: 3333,
  2: 2500,
  4: 1875,
};

export interface UniverseHostOptions {
  readonly id: string;
  readonly bubbleId: string;
  readonly seed: number;
  readonly tickCap: number;
  readonly warmTicks?: number;
  readonly clock?: Clock;
}

export type GodSender = (msg: ServerMessage) => void;

export class UniverseHost {
  readonly id: string;
  readonly bubbleId: string;

  private session: AgentSession;
  private speed = 1;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private worldTick = 0;
  private alive = true;

  private godSend: GodSender | null = null;
  private coordSend: ((frame: CoordFrame) => void) | null = null;

  private frames: Array<Record<string, unknown>> = [];

  constructor(opts: UniverseHostOptions) {
    this.id = opts.id;
    this.bubbleId = opts.bubbleId;
    // clock reserved for future use (raid pacing)
    void (opts.clock ?? systemClock);

    const content = referenceContent();
    const { scenario } = referenceScenario(content, { raids: true });
    this.session = createSession({ scenario, strategyId: `universe-${opts.id}` });
    this.session.reset(opts.seed, { worldTickCap: opts.tickCap });

    const warm = opts.warmTicks ?? 40;
    for (let i = 0; i < warm; i++) {
      this.session.submit({ kind: 0 });
    }
    this.worldTick = warm;
    this.captureFrame();
  }

  connectGod(send: GodSender): void {
    this.godSend = send;
    send({
      type: 'status',
      universeId: this.id,
      bubbleId: this.bubbleId,
      worldTick: this.worldTick,
      alive: this.alive,
    });
    if (this.frames.length > 0) {
      send({ type: 'frame', ...this.frames[this.frames.length - 1] });
    }
  }

  disconnectGod(): void {
    this.godSend = null;
  }

  handleGodMessage(msg: GodMessage): void {
    switch (msg.type) {
      case 'submit':
        if (msg.kind != null) {
          this.submitAction(msg.kind, msg.params as number[] | undefined);
        }
        break;
      case 'advance':
        this.advanceTicks(msg.ticks ?? 1);
        break;
      case 'observe':
        this.sendLatestFrame();
        break;
      default:
        break;
    }
  }

  private submitAction(kind: number, params?: readonly number[]): void {
    if (!this.alive) return;
    this.session.submit(params ? { kind, params } : { kind });
    this.worldTick++;
    this.captureFrame();
    this.sendLatestFrame();
  }

  private advanceTicks(n: number): void {
    if (!this.alive) return;
    const count = Math.min(n, 500);
    for (let i = 0; i < count; i++) {
      this.session.submit({ kind: 0 });
      this.worldTick++;
    }
    this.captureFrame();
    this.sendLatestFrame();
  }

  private captureFrame(): void {
    const obs = this.session.observe();
    const mask = this.session.legalActions();
    const frame: Record<string, unknown> = {
      worldTick: this.worldTick,
      obs: Array.from(obs),
      mask: Array.from(mask),
    };
    this.frames.push(frame);
    if (this.frames.length > 1000) {
      this.frames = this.frames.slice(-500);
    }
  }

  private sendLatestFrame(): void {
    if (this.godSend && this.frames.length > 0) {
      this.godSend({ type: 'frame', ...this.frames[this.frames.length - 1] });
    }
  }

  startTicking(): void {
    if (this.tickTimer) return;
    const tick = (): void => {
      if (!this.alive) return;
      this.session.submit({ kind: 0 });
      this.worldTick++;
      this.captureFrame();
      this.sendLatestFrame();
      this.sendHeartbeat();
      this.tickTimer = setTimeout(tick, SPEED_TO_INTERVAL[this.speed] ?? SPEED_TO_INTERVAL[1]);
    };
    this.tickTimer = setTimeout(tick, SPEED_TO_INTERVAL[this.speed] ?? SPEED_TO_INTERVAL[1]);
  }

  stopTicking(): void {
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
  }

  setSpeed(speed: number): void {
    this.speed = speed in SPEED_TO_INTERVAL ? speed : 1;
    if (this.tickTimer) {
      this.stopTicking();
      this.startTicking();
    }
  }

  connectCoordinator(send: (frame: CoordFrame) => void): void {
    this.coordSend = send;
  }

  private sendHeartbeat(): void {
    if (this.coordSend) {
      this.coordSend({
        verb: COORD_VERB.heartbeat,
        universeId: this.id,
        worldTick: this.worldTick,
        alive: this.alive,
      });
    }
  }

  reportExtinction(killerId: string): void {
    this.alive = false;
    this.stopTicking();
    if (this.coordSend) {
      this.coordSend({
        verb: COORD_VERB.extinction,
        extinctId: this.id,
        killerId,
      });
    }
  }

  get currentTick(): number {
    return this.worldTick;
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get frameCount(): number {
    return this.frames.length;
  }
}
