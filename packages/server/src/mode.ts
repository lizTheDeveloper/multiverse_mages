/*
 * Multiverse Mages — which layer a universe is in: the management game, or the raid.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any
 * later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { observationBlock, type AgentSession } from '@mm/agent-api';

import { TICK_MODE, type TickMode } from './protocol.js';

/**
 * The seam between the game's two layers, read the one way this package is
 * allowed to read it.
 *
 * The management layer — research, teaching, scribing, universities — is the
 * mini-game between raids and runs on `clock.mode == world`. The raid is the
 * RTS layer and runs on `clock.mode == engagement`. Everything that differs
 * between them keys on this one fact: which actions are legal (§4.2), how long
 * a participant has to answer (`MatchPacing`), and whether the ruleset is frozen
 * (vision §3).
 *
 * ## Why it is read off the observation
 *
 * §5 gives this package one edge, to `agent-api`, and `AgentSession` publishes
 * no clock. But §4.1 does: the `clock` block's third channel **is** the mode,
 * declared `BOOLEAN_SCALE` — `0` world, `1` engagement — and §4.1 is a contract,
 * not an implementation detail. So the mode is not inferred here, it is read
 * from the place the contracts put it.
 *
 * The offset is taken from `observationBlock('clock')` rather than written down.
 * A transcribed offset is a second copy of the layout that goes stale silently
 * the first time a block is resized — and §4.1 has already been widened once,
 * when the mage block grew a slot for the untaught.
 *
 * ## The alternative that was rejected
 *
 * Engagement has an unmistakable mask signature — §4.2 masks every action but
 * no-op — so the mode could be inferred from the mask. It was, in the first
 * draft of `match.ts`, and it is wrong in one direction: a world-time universe
 * in which every action happened to be unaffordable produces the same mask.
 * Inferring would have meant a management tick occasionally getting a raid's
 * deadline, which is a bug that appears only on a poor universe and only under
 * load. Reading the declared channel has no such direction to be wrong in.
 */

/** The index of the mode channel within §4.1's `clock` block. */
const MODE_CHANNEL = 2;

/**
 * Which layer a session's universe is currently in.
 *
 * Reads the session's own observation, so it costs nothing beyond a normalized
 * vector the session has already built for this tick.
 */
export function tickModeOf(session: AgentSession): TickMode {
  const block = observationBlock('clock');
  const observation = session.observe();
  const value = observation[block.offset + MODE_CHANNEL];
  // `BOOLEAN_SCALE` maps the two states to exactly 0 and 1. Compared with a
  // midpoint rather than for equality because the value has been through a
  // float division at §4.1's boundary, and a rules decision that turned on the
  // exact bit pattern of a normalized double would be the kind of thing that
  // holds until a compiler changes its mind.
  return value !== undefined && value >= 0.5 ? TICK_MODE.engagement : TICK_MODE.world;
}

/** Whether a session's universe is in a raid. */
export function inEngagement(session: AgentSession): boolean {
  return tickModeOf(session) === TICK_MODE.engagement;
}
