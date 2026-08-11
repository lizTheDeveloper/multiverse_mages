/*
 * Multiverse Mages — raid rules package public surface.
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

/**
 * `@mm/rules-raid` — the engagement space: combatants, combat resolution,
 * objectives, and the consequences a raid writes back into world state.
 *
 * This is the **coordinating layer** `contracts.md` §5 rule 3 points at. It is
 * the one rules package permitted to import both `@mm/rules-magic` and
 * `@mm/rules-world`, which is how a cross-cutting interaction gets implemented
 * without those two forming a cycle. It still may not import `@mm/agent-api`:
 * the dependency runs one way only.
 *
 * Combat resolution math beyond the primitive units in `contracts.md` §3 is
 * deliberately left open by §8 and is this package's to fix.
 *
 * ## Two properties everything here is arranged around
 *
 * - **Every raid terminates**, and it is a proof rather than a hope. Portal
 *   stability has exactly one writer, no primitive can touch it, its decay is an
 *   authored raw integer validated at load, and a compile-time ceiling above the
 *   arithmetic bound raises an invariant violation rather than truncating.
 * - **Arbitration is the host's ruleset and it does not leak.** One choke
 *   point, enforced twice — a per-combatant legal-node mask computed once at
 *   portal open, and an unconditional `permits()` assertion at the single
 *   cast-resolution function, counted so that "zero forbidden casts" is a
 *   measurement rather than an assumption.
 */

export type { RaidConstantSource, RaidTuning } from './tuning.js';
export { readRaidTuning } from './tuning.js';

export type { CombatantKey } from './keys.js';
export { compareCombatantKeys, opposingSide, packCombatantKey } from './keys.js';

export type { CellAddress, Point } from './geometry.js';
export {
  ceilSqrt,
  cellOfPoint,
  centreOfCell,
  clamp,
  clampToField,
  hasLineOfSight,
  integerSqrt,
  squaredDistance,
  stepToward,
  traceCells,
  withinRange,
} from './geometry.js';

export type { TerrainCell, TerrainGrid } from './terrain.js';
export { generateTerrain } from './terrain.js';

export { blinkToward, moveToward, resolvePath } from './movement.js';

export type { Located, SpatialIndex } from './spatial.js';
export { buildSpatialIndex } from './spatial.js';
