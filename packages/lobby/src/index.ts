/*
 * Multiverse Mages — lobby package public surface.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export { LOBBY_LIMITS, Lobby, type LobbyOptions } from './lobby.js';
export {
  UniverseHost,
  validateConfig,
  type GodAction,
  type InboundRaid,
  type Outcome,
  type PeerSeats,
  type SeatResolver,
  type UniverseConfig,
  type UniverseRef,
} from './universe-host.js';
export { Bubble, type BubbleInfo } from './bubble.js';
export { BodyTooLarge, MAX_BODY, Router, json, readBody, text } from './router.js';
