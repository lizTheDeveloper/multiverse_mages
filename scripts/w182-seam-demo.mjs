/*
 * Multiverse Mages — W182: a god action mid-raid demonstrably changes a raid.
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
 * The measurement the raid seam is judged by, made re-runnable.
 *
 * Unmasking actions 1-4 proves nothing on its own: the engagement branch of the
 * mask was measured as evaluated *zero* times, because `runRaid` drove
 * `stepEngagement` to completion with no gap in it. So this is the paired
 * experiment across four seeds — same universe, same rival, same raid seeds,
 * differing in exactly one input: whether a policy is installed.
 *
 *     node scripts/w182-seam-demo.mjs
 */
import { rngFromRootSeed, step } from '@mm/sim-core';
import { referenceContent, referenceScenario } from '@mm/scenario';

const content = referenceContent();
const HORIZON = 520;
const SEEDS = [0x1234_5678, 0x0bad_c0de, 0x00ab_cdef, 0x0004_1000];

/** Forbid every technique on the opening engagement tick. Defender-only (§6.2). */
const FORBID_ALL = ({ tick }) =>
  tick === 0 ? [1, 2, 3, 4, 5].map((axisId) => ({ kind: 2, params: [axisId] })) : [];

function play(seed, policy) {
  const run = referenceScenario(content, {
    raids: true,
    ...(policy === undefined ? {} : { engagementPolicy: policy }),
  });
  let state = run.scenario.create(seed, { worldTickCap: HORIZON });
  for (let tick = 0; tick < HORIZON; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
  }
  return run.raids();
}

/** Raid shape, excluding the directive counters themselves. */
const shapeOf = (raids) =>
  JSON.stringify(
    raids.map((raid) => [
      raid.raidId,
      raid.engagementTicks,
      raid.victor,
      raid.reason,
      raid.raidersWithdrawn,
      raid.nodesTakenByAttacker,
      raid.nodesLostLocally,
    ]),
  );

console.log(`horizon=${HORIZON} seeds=${SEEDS.length}  policy=forbid every technique at tick 0`);
let anyMoved = false;
for (const seed of SEEDS) {
  const control = play(seed, undefined);
  const treatment = play(seed, FORBID_ALL);
  const applied = treatment.reduce((sum, raid) => sum + raid.directivesApplied, 0);
  const paid = treatment.reduce((sum, raid) => sum + raid.directiveFavorSpent, 0);
  const controlLoot = control.reduce((sum, raid) => sum + raid.nodesTakenByAttacker, 0);
  const treatLoot = treatment.reduce((sum, raid) => sum + raid.nodesTakenByAttacker, 0);
  const moved = shapeOf(control) !== shapeOf(treatment);
  if (moved) anyMoved = true;
  console.log(
    `seed 0x${(seed >>> 0).toString(16).padStart(8, '0')}  raids=${String(control.length).padStart(2)} ` +
      `directivesApplied=${applied} favorPaid=${String(paid).padStart(5)}  ` +
      `nodesLooted ${controlLoot} -> ${treatLoot}  raidMoved=${moved}`,
  );
}
console.log(
  anyMoved
    ? 'The seam is closed: a god action submitted mid-raid changes the raid.'
    : 'NOTHING MOVED — the seam is not closed, whatever the mask reports.',
);
