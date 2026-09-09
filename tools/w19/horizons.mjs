/*
 * Multiverse Mages — W19: the horizon grid, and nothing that runs.
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
 * A data module, deliberately separate from `fan-out.mjs`.
 *
 * `fan-out.mjs` calls `main()` at module scope, so **importing it launches a
 * sweep**. Four analysis files imported `HORIZONS` from it and every one of them
 * silently started a second 2,800-run fan-out on load — caught in flight, by the
 * analysis processes sitting at 0% CPU while the machine was saturated. The
 * constants live here so that reading them costs nothing.
 */

/**
 * The horizons, in world ticks. All are multiples of the sampling grid below.
 *
 * The brief's seven are the default. `W19_HORIZONS` overrides them, and it
 * exists because the first production-arm numbers said the brief's premise was
 * too generous: at a cap of 300 the v1-bound strategies already hold **48.9 of
 * 51** nodes, not the third the hypothesis assumed. A sweep whose shortest
 * horizon is already saturated cannot see the space open up, so 30 / 60 / 120 /
 * 180 / 240 are run as a second pass under the same seeds.
 */
export const HORIZONS = Object.freeze(
  process.env.W19_HORIZONS === undefined
    ? [300, 450, 600, 900, 1200, 1800, 2400]
    : process.env.W19_HORIZONS.split(',').map(Number),
);

/**
 * The composition sampling grid. 30 divides every horizon in both passes, which
 * is what makes "the 2400 arm's sample at tick H equals the H-capped arm's
 * terminal" a checkable claim rather than an assumption.
 *
 * It was 150 for the first pass — enough for the brief's seven — and 150 does
 * not divide 30, 60, 120 or 180. Runs already banked at 150 keep their grid;
 * `fan-out.mjs` checks the recorded value before it skips a job, so the two
 * passes cannot be silently mixed.
 */
export const SAMPLE_TICKS = Number(process.env.W19_SAMPLE ?? 150);

/** The full pool as `BOT_POOL` holds it — ten, including the two probes. */
export const POOL_10 = Object.freeze([
  'passive-control',
  'uniform-random-legal',
  'permissive-breadth',
  'narrow-depth',
  'denial-warden',
  'archivist',
  'portal-rush',
  'worship-maximizer',
  'idle-then-declare',
  'permit-then-idle',
]);

/**
 * Arm B's strategies and masks. Gnome (8) and human (16) are the pair W15 found
 * share `depthCeiling: 4` and reach the identical 49 nodes at 2400 — so if any
 * two species diverge before exhaustion, these are the ones whose divergence
 * cannot be explained by the ceiling.
 */
export const SPECIES_STRATEGIES = Object.freeze([
  'passive-control',
  'archivist',
  'permissive-breadth',
]);
export const SPECIES_MASKS = Object.freeze([8, 16]);
