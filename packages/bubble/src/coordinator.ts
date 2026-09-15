/*
 * Multiverse Mages — the bubble coordinator.
 * Copyright (C) 2026 Ann Kelner
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { UniverseRef, BubbleRoster } from '@mm/server';
import type {
  RaidRoute,
  ExtinctionReport,
  ConquestClaim,
  PromotionNotice,
  UniverseStatus,
} from './protocol.js';
import { COORD_VERB } from './protocol.js';

/**
 * A universe's state as the coordinator sees it. The coordinator holds no
 * simulation state — only identity, liveness, and the connection back to the
 * universe server.
 */
export interface MemberState {
  readonly ref: UniverseRef;
  alive: boolean;
  /** The universe server's address for peer connections (raids). */
  address: string;
  port: number;
  /** Last known tick from the universe's status heartbeat. */
  lastTick: number;
  /** Mages alive as of last status. */
  magesAlive: number;
  /**
   * Callback to send a message to this universe server. The coordinator does
   * not own the transport — the caller provides the send function when adding
   * a universe, so the coordinator is transport-agnostic.
   */
  send: (msg: unknown) => void;
}

/** What happened when a bubble was cleared. */
export interface ClearResult {
  readonly winnerId: string;
  readonly tier: number;
}

/** Configuration for a bubble coordinator. */
export interface BubbleConfig {
  /** How many universes in this bubble. vision §13 leaves this open. */
  readonly size: number;
  /** The tier this bubble operates at. Tier 0 is the starting tier. */
  readonly tier: number;
  /** Called when the bubble is cleared and a winner should promote. */
  readonly onClear?: (result: ClearResult) => void;
  /** Called when a universe goes extinct. */
  readonly onExtinction?: (report: ExtinctionReport) => void;
}

const DEFAULT_SIZE = 4;

/**
 * Groups N universes into a bounded neighbourhood, routes portal targets,
 * detects extinction and bubble-clear, and promotes winners.
 *
 * One coordinator per bubble. Lightweight — holds only `MemberState`s and
 * routing state, not simulation state. Communicates with universe servers
 * through the `send` callback on each member.
 *
 * vision §8b: "A universe does not float in an unbounded multiverse. It lives
 * in a bubble: a bounded neighbourhood of universes that may portal to one
 * another."
 */
export class BubbleCoordinator {
  readonly bubbleId: string;
  readonly tier: number;
  readonly targetSize: number;

  private readonly members = new Map<string, MemberState>();
  private readonly config: BubbleConfig;
  private cleared = false;

  constructor(bubbleId: string, config: Partial<BubbleConfig> = {}) {
    this.bubbleId = bubbleId;
    this.tier = config.tier ?? 0;
    this.targetSize = config.size ?? DEFAULT_SIZE;
    this.config = { size: this.targetSize, tier: this.tier, ...config };
  }

  // ================================================================ MEMBERSHIP

  /** Add a universe to this bubble. */
  addUniverse(
    ref: UniverseRef,
    address: string,
    port: number,
    send: (msg: unknown) => void,
  ): void {
    if (ref.bubbleId !== this.bubbleId) {
      throw new Error(
        `Universe ${ref.universeId} claims bubble ${ref.bubbleId}, ` +
        `but this coordinator manages ${this.bubbleId}`,
      );
    }
    this.members.set(ref.universeId, {
      ref,
      alive: true,
      address,
      port,
      lastTick: 0,
      magesAlive: 0,
      send,
    });
  }

  /** Remove a universe (disconnect, not extinction). */
  removeUniverse(id: string): void {
    this.members.delete(id);
  }

  /** The roster, as the wire protocol defines it. */
  roster(): BubbleRoster {
    return {
      bubbleId: this.bubbleId,
      members: [...this.members.keys()],
    };
  }

  /** Number of universes currently in the bubble. */
  get size(): number {
    return this.members.size;
  }

  /** Whether the bubble has reached its target size and all members are present. */
  get full(): boolean {
    return this.members.size >= this.targetSize;
  }

  /** All alive members. */
  alive(): readonly MemberState[] {
    return [...this.members.values()].filter(m => m.alive);
  }

  /** All members, alive or not. */
  all(): readonly MemberState[] {
    return [...this.members.values()];
  }

  // ================================================================ PORTAL TARGETING

  /**
   * Pick a portal target for an attacker.
   *
   * vision §7a: "no map. No coordinates, no distance, no geometry." The target
   * is a random alive member that isn't the attacker. That's the entire
   * algorithm — any geometric bias would invent the coordinate system §7a
   * forbids.
   *
   * Returns null if no valid target exists (everyone else is dead or only the
   * attacker remains).
   */
  requestTarget(attackerId: string): MemberState | null {
    const candidates = this.alive().filter(m => m.ref.universeId !== attackerId);
    if (candidates.length === 0) return null;
    const idx = simpleHash(attackerId) % candidates.length;
    return candidates[idx] ?? null;
  }

  // ================================================================ RAID ROUTING

  /**
   * Route a raid between two universe servers.
   *
   * Sends a `raid-route` message to both servers with each other's address.
   * The servers establish a direct TCP connection and run the existing match
   * logic from `packages/server/`. The coordinator does not participate in the
   * raid itself — it only sets up the connection.
   */
  routeRaid(attackerId: string, defenderId: string): void {
    const attacker = this.members.get(attackerId);
    const defender = this.members.get(defenderId);
    if (!attacker || !defender) return;
    if (!attacker.alive || !defender.alive) return;

    const toAttacker: RaidRoute = {
      verb: COORD_VERB.raidRoute,
      attackerId,
      defenderId,
      peerAddress: defender.address,
      peerPort: defender.port,
    };
    const toDefender: RaidRoute = {
      verb: COORD_VERB.raidRoute,
      attackerId,
      defenderId,
      peerAddress: attacker.address,
      peerPort: attacker.port,
    };

    attacker.send(toAttacker);
    defender.send(toDefender);
  }

  // ================================================================ EXTINCTION

  /**
   * Handle an extinction report from a universe server.
   *
   * Marks the universe as dead and checks if the bubble is cleared. A bubble
   * is cleared when exactly one alive universe remains.
   *
   * vision §8: "Elimination is intended. A player raided to ruin loses a
   * *universe*, and rejoins: a fresh universe in a different bubble, carrying
   * prestige."
   */
  reportExtinction(report: ExtinctionReport): void {
    const member = this.members.get(report.extinctId);
    if (!member) return;
    member.alive = false;
    member.magesAlive = 0;
    this.config.onExtinction?.(report);
    this.checkClear();
  }

  /**
   * Handle a status heartbeat from a universe server.
   */
  updateStatus(status: UniverseStatus): void {
    const member = this.members.get(status.universeId);
    if (!member) return;
    member.lastTick = status.tick;
    member.magesAlive = status.magesAlive;
    if (!status.alive && member.alive) {
      member.alive = false;
      this.checkClear();
    }
  }

  // ================================================================ CONQUEST

  /**
   * Process a conquest claim.
   *
   * vision §8b: "Raid a rival; loot their books; and if you extinguish their
   * mages, that universe ends and its populace, materials and worship pass to
   * you."
   *
   * The coordinator validates the claim (the extinct universe is actually dead,
   * the claimant is alive) and returns the claim for the lobby to process the
   * asset transfer. The actual transfer happens in the simulation, not here.
   */
  validateConquest(claim: ConquestClaim): boolean {
    const extinct = this.members.get(claim.extinctId);
    const claimant = this.members.get(claim.claimantId);
    if (!extinct || !claimant) return false;
    if (extinct.alive) return false;
    if (!claimant.alive) return false;
    return true;
  }

  // ================================================================ CLEAR & PROMOTION

  /**
   * Check if the bubble is cleared.
   *
   * A bubble is cleared when exactly one alive universe remains. The winner
   * promotes to the next tier.
   *
   * Returns the winner's universe id, or null if the bubble is not cleared.
   */
  checkClear(): string | null {
    if (this.cleared) return null;
    const living = this.alive();
    if (living.length !== 1) return null;

    const winner = living[0];
    if (!winner) return null;

    this.cleared = true;

    const notice: PromotionNotice = {
      verb: COORD_VERB.promotion,
      universeId: winner.ref.universeId,
      fromTier: this.tier,
      toTier: this.tier + 1,
      newBubbleId: '',
    };

    winner.send(notice);
    this.config.onClear?.({
      winnerId: winner.ref.universeId,
      tier: this.tier,
    });

    return winner.ref.universeId;
  }

  /** Whether this bubble has been cleared and is no longer active. */
  get isCleared(): boolean {
    return this.cleared;
  }
}

/**
 * A simple non-cryptographic hash for target selection. Not from an RNG stream
 * — vision §0.2's audio rule applies to any randomness: "derive variation from
 * state by hash" rather than consuming a draw.
 */
function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
