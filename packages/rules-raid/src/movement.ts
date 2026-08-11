/*
 * Multiverse Mages — moving and being displaced, both stopped by the same wall.
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
 * Ordinary movement and `blink` displacement, which differ in where the
 * distance comes from and in nothing else.
 *
 * Both are clamped to the battlefield and both stop at the last passable point
 * along their path. That second rule is the one worth stating: without it,
 * `blink` becomes a terrain-ignoring primitive by accident — not because
 * anybody decided teleportation should pass through rock, but because the
 * obvious implementation sets a position and the obvious position is the far
 * end. `contracts.md` §3 gives `blink` a magnitude in metres and a stacking
 * rule; it says nothing about terrain, and silence is not permission.
 *
 * `blink` stacks by **max, not sum** (§3). Two displacement sources move a
 * combatant as far as the larger one, which is what stops stacking three small
 * blinks into a crossing of the field.
 */

import type { Fixed } from '@mm/sim-core';
import { FP_ONE, floorDiv } from '@mm/sim-core';

import type { Point } from './geometry.js';
import { clampToField, stepToward } from './geometry.js';
import type { TerrainGrid } from './terrain.js';

/**
 * How finely the path is sampled when looking for the last passable point.
 *
 * A whole terrain cell would be too coarse — a combatant could stop a cell short
 * of a wall it could have walked up to — and a sample per fp metre would be
 * 200 samples for a field crossing, per combatant, per tick. A quarter cell is
 * the compromise, and it is stated here rather than derived so that changing it
 * is a decision somebody makes.
 */
const PATH_SAMPLES_PER_CELL = 4;

/**
 * Where a combatant ends up trying to reach `to` from `from`.
 *
 * The walk is from the origin outward, keeping the last sample that stood on
 * passable ground, so a path that clips a corner of rock stops at the corner
 * rather than passing through it. The origin itself is the fallback: a
 * combatant already standing somewhere impassable — which deployment forbids
 * and a terrain change cannot cause, since terrain is frozen — stays put rather
 * than being teleported to the nearest legal cell by a rule nobody wrote.
 */
export function resolvePath(from: Point, to: Point, terrain: TerrainGrid): Point {
  const target = clampToField(to, terrain.extent);
  if (terrain.passableAt(target) && clearBetween(from, target, terrain)) return target;

  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const span = Math.max(Math.abs(dx), Math.abs(dy));
  const samples = sampleCount(span, terrain.cellSize);

  let last = from;
  for (let step = 1; step <= samples; step += 1) {
    const point: Point = {
      x: from.x + floorDiv(dx * step, samples),
      y: from.y + floorDiv(dy * step, samples),
    };
    if (!terrain.passableAt(point)) break;
    last = point;
  }
  return last;
}

/**
 * How many samples a span of this length needs, rounded up.
 *
 * `ceil` expressed through `floorDiv`, because §3 admits one division helper and
 * it rounds toward negative infinity. Written once rather than at each of the
 * two call sites: two hand-rolled ceilings are two chances to write one of them
 * as a floor, and a path sampled one step short is a combatant who walks through
 * the last quarter-cell of a wall.
 */
function sampleCount(span: number, cellSize: Fixed): number {
  const denominator = Math.max(1, cellSize);
  return Math.max(1, -floorDiv(-(span * PATH_SAMPLES_PER_CELL), denominator));
}

/** Whether every sample between two points stands on passable ground. */
function clearBetween(from: Point, to: Point, terrain: TerrainGrid): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = Math.max(Math.abs(dx), Math.abs(dy));
  if (span === 0) return true;
  const samples = sampleCount(span, terrain.cellSize);
  for (let step = 1; step <= samples; step += 1) {
    const point: Point = {
      x: from.x + floorDiv(dx * step, samples),
      y: from.y + floorDiv(dy * step, samples),
    };
    if (!terrain.passableAt(point)) return false;
  }
  return true;
}

/**
 * One tick of ordinary movement toward a goal.
 *
 * The allowance is scaled by the movement cost of the ground the combatant is
 * *standing on* rather than the ground it is entering. Both readings are
 * defensible; this one is chosen because it needs one terrain lookup instead of
 * one per sample, and because "wading out of a marsh is slow" is as true as
 * "wading into one is".
 */
export function moveToward(
  from: Point,
  goal: Point,
  allowance: Fixed,
  terrain: TerrainGrid,
): Point {
  const cost = terrain.atPoint(from).moveCost;
  // Extended precision, per contracts.md §3: the multiplication happens before
  // the division, so a heavy movement penalty produces a short step rather than
  // flooring to a combatant who cannot move at all.
  const scaled = floorDiv(allowance * cost, FP_ONE);

  const direct = resolvePath(from, stepToward(from, goal, scaled), terrain);
  if (direct.x !== from.x || direct.y !== from.y) return direct;

  // ---- Sliding, and why it is not optional ----
  //
  // Without it a combatant that walks into rock stops there **for the rest of
  // the raid**: the goal has not moved, so next tick it tries the same blocked
  // line and stays. That is not a slow raid, it is a raid in which nothing
  // happens — a stalemate produced by terrain generation rather than by play,
  // and every metric would report it as a finding about the game. It was
  // observed on the first end-to-end run: both sides walked eight ticks and
  // then stood still for two and a half thousand.
  //
  // The candidates are tried in a fixed order — dominant axis first, then the
  // other, then the four cardinals — so which way a combatant goes round an
  // obstacle is a fact about the obstacle rather than about the iteration.
  // This is deliberately *not* pathfinding: a combatant can still be enclosed,
  // and an enclosed combatant is a raid that ends on portal collapse, which is
  // a bounded outcome rather than a hang.
  return slideAround(from, goal, scaled, terrain);
}

/** The fixed-order detour a blocked combatant tries. */
function slideAround(from: Point, goal: Point, scaled: Fixed, terrain: TerrainGrid): Point {
  const dx = goal.x - from.x;
  const dy = goal.y - from.y;
  const alongX: Point = { x: from.x + Math.sign(dx) * scaled, y: from.y };
  const alongY: Point = { x: from.x, y: from.y + Math.sign(dy) * scaled };

  const candidates: Point[] =
    Math.abs(dx) >= Math.abs(dy) ? [alongX, alongY] : [alongY, alongX];
  candidates.push(
    { x: from.x + scaled, y: from.y },
    { x: from.x - scaled, y: from.y },
    { x: from.x, y: from.y + scaled },
    { x: from.x, y: from.y - scaled },
  );

  for (const candidate of candidates) {
    const landed = resolvePath(from, candidate, terrain);
    if (landed.x !== from.x || landed.y !== from.y) return landed;
  }
  return from;
}

/**
 * One `blink` displacement toward a goal, stacking by maximum across sources.
 *
 * The caller passes every source's magnitude; taking the max here rather than at
 * the call site is what makes §3's rule for this primitive unavoidable. An empty
 * list is no displacement, which is different from a displacement of zero only
 * in that it costs nothing to say.
 */
export function blinkToward(
  from: Point,
  goal: Point,
  magnitudes: readonly Fixed[],
  terrain: TerrainGrid,
): Point {
  let largest = 0;
  for (const magnitude of magnitudes) {
    if (magnitude > largest) largest = magnitude;
  }
  if (largest <= 0) return from;
  return resolvePath(from, stepToward(from, goal, largest), terrain);
}
