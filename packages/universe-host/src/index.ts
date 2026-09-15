/*
 * Multiverse Mages — universe-host public surface.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export { UniverseHost, type UniverseHostOptions, type GodSender } from './universe.js';
export { WsTransport, type WsTransportOptions, type GodMessage, type ServerMessage } from './transport-ws.js';
export {
  COORD_VERB,
  type CoordVerb,
  type CoordFrame,
  type PortalRequest,
  type PortalTarget,
  type RaidRoute,
  type ExtinctionReport,
  type PromotionNotice,
  type Heartbeat,
} from './coord-protocol.js';
