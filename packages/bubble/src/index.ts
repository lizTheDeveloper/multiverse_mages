/*
 * Multiverse Mages — bubble coordinator public surface.
 * Copyright (C) 2026 Ann Kelner
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export { BubbleCoordinator } from './coordinator.js';
export type { MemberState, ClearResult, BubbleConfig } from './coordinator.js';
export { COORD_VERB } from './protocol.js';
export type {
  CoordVerb,
  CoordMessage,
  PortalRequest,
  PortalTarget,
  RaidRoute,
  ExtinctionReport,
  ConquestClaim,
  PromotionNotice,
  UniverseStatus,
} from './protocol.js';
