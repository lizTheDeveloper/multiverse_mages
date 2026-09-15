/*
 * Multiverse Mages — coordinator wire vocabulary.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Verbs between a universe server and its bubble coordinator. */
export const COORD_VERB = {
  portalRequest: 'portal-request',
  portalTarget: 'portal-target',
  raidRoute: 'raid-route',
  extinction: 'extinction',
  conquestClaim: 'conquest-claim',
  promotion: 'promotion',
  heartbeat: 'heartbeat',
} as const;

export type CoordVerb = (typeof COORD_VERB)[keyof typeof COORD_VERB];

export interface PortalRequest {
  readonly verb: typeof COORD_VERB.portalRequest;
  readonly attackerId: string;
}

export interface PortalTarget {
  readonly verb: typeof COORD_VERB.portalTarget;
  readonly targetId: string | null;
}

export interface RaidRoute {
  readonly verb: typeof COORD_VERB.raidRoute;
  readonly attackerId: string;
  readonly defenderId: string;
  readonly attackerAddr: string;
  readonly defenderAddr: string;
}

export interface ExtinctionReport {
  readonly verb: typeof COORD_VERB.extinction;
  readonly extinctId: string;
  readonly killerId: string;
}

export interface PromotionNotice {
  readonly verb: typeof COORD_VERB.promotion;
  readonly universeId: string;
  readonly newTier: number;
}

export interface Heartbeat {
  readonly verb: typeof COORD_VERB.heartbeat;
  readonly universeId: string;
  readonly worldTick: number;
  readonly alive: boolean;
}

export type CoordFrame =
  | PortalRequest
  | PortalTarget
  | RaidRoute
  | ExtinctionReport
  | PromotionNotice
  | Heartbeat;
