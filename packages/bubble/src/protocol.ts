/*
 * Multiverse Mages — coordinator wire verbs.
 * Copyright (C) 2026 Ann Kelner
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Verbs spoken between a universe server and its bubble coordinator.
 *
 * These extend — but do not overlap with — the participant-facing vocabulary in
 * `@mm/server`'s `protocol.ts`. A universe server speaks both: the coordinator
 * verbs on the coordinator socket, and the participant verbs on the god's
 * WebSocket. The two never share a connection.
 */
export const COORD_VERB = {
  /** Universe → coordinator: the god opened a portal and needs a target. */
  portalRequest: 'portal-request',
  /** Coordinator → universe: here is the target universe for the raid. */
  portalTarget: 'portal-target',
  /** Coordinator → both universes: connect to each other for the raid. */
  raidRoute: 'raid-route',
  /** Universe → coordinator: this universe's last mage died. */
  extinction: 'extinction',
  /** Universe → coordinator: claim the extinct universe's assets. */
  conquestClaim: 'conquest-claim',
  /** Coordinator → universe: you have been promoted to a higher tier. */
  promotion: 'promotion',
  /** Bidirectional: the connection is alive. */
  heartbeat: 'heartbeat',
  /** Universe → coordinator: I'm alive and here's my status. */
  status: 'status',
} as const;

export type CoordVerb = (typeof COORD_VERB)[keyof typeof COORD_VERB];

/** A portal-request message from a universe server. */
export interface PortalRequest {
  readonly verb: typeof COORD_VERB.portalRequest;
  readonly attackerId: string;
}

/** A portal-target reply from the coordinator. */
export interface PortalTarget {
  readonly verb: typeof COORD_VERB.portalTarget;
  readonly attackerId: string;
  readonly defenderId: string;
  /** The defender's address for the attacker to connect to. */
  readonly defenderAddress: string;
  readonly defenderPort: number;
}

/** Route instruction sent to both universes. */
export interface RaidRoute {
  readonly verb: typeof COORD_VERB.raidRoute;
  readonly attackerId: string;
  readonly defenderId: string;
  /** The attacker connects to this address. */
  readonly peerAddress: string;
  readonly peerPort: number;
}

/** Extinction report from a universe. */
export interface ExtinctionReport {
  readonly verb: typeof COORD_VERB.extinction;
  readonly extinctId: string;
  readonly lastTick: number;
  readonly killedBy: string | null;
}

/** Conquest claim from the conqueror. */
export interface ConquestClaim {
  readonly verb: typeof COORD_VERB.conquestClaim;
  readonly claimantId: string;
  readonly extinctId: string;
}

/** Promotion notice from the coordinator. */
export interface PromotionNotice {
  readonly verb: typeof COORD_VERB.promotion;
  readonly universeId: string;
  readonly fromTier: number;
  readonly toTier: number;
  readonly newBubbleId: string;
}

/** Status heartbeat from a universe. */
export interface UniverseStatus {
  readonly verb: typeof COORD_VERB.status;
  readonly universeId: string;
  readonly tick: number;
  readonly magesAlive: number;
  readonly alive: boolean;
}

export type CoordMessage =
  | PortalRequest
  | PortalTarget
  | RaidRoute
  | ExtinctionReport
  | ConquestClaim
  | PromotionNotice
  | UniverseStatus
  | { readonly verb: typeof COORD_VERB.heartbeat };
