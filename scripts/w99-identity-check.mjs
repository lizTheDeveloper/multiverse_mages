/*
 * Multiverse Mages — W99: the two factor identities this measurement rests on.
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
 * W99 adds sweep files and nothing else. The claim it has to support is that
 * adding them changed no behaviour — and specifically that the two arms it calls
 * *controls* really are the universe every previous measurement was taken in:
 *
 * 1. `foundingSpeciesMask: 0` is the same universe as a sweep file that does not
 *    name the factor at all. `reference-universe.ts` says so — *"an absent option
 *    and this default build the identical state"* — and this checks it.
 * 2. `tradition: "true-naming"` is the same universe as a sweep file that does
 *    not name a tradition. `scribingTraditionId` walks traditions in interned
 *    (lexicographic) order and skips Art of Memory, whose palace store cannot
 *    scribe, so True Naming wins the loop. That is an accident of the alphabet
 *    and it is worth having checked rather than reasoned about.
 *
 * The check is on the **final snapshot hash** of a real run, not on the resolved
 * option struct: a struct comparison would pass for two configurations that
 * diverge after tick one.
 *
 * A control runs beside both. A different seed must produce a *different* hash,
 * because an equality that also holds for a run which ignores its inputs is not
 * evidence of anything.
 *
 *     node scripts/w99-identity-check.mjs
 *
 * Exits non-zero if any identity or the control fails.
 */

import { rngFromRootSeed, snapshotHash, step } from '../packages/sim-core/dist/index.js';
import { referenceContent, referenceScenario } from '../packages/scenario/dist/index.js';

/** Long enough for founding, research, decay and the first deaths to have run. */
const TICKS = 400;

/** Four seeds, so a coincidence has to happen four times. */
const SEEDS = [1, 2, 3, 4].map((n) => 20260811 + n * 7919);

/** One run's final snapshot hash. Zero actions: this measures the world, not a bot. */
function hashOf(content, runSeed, options, ticks = TICKS) {
  const run = referenceScenario(content);
  let state = run.scenario.create(runSeed, { worldTickCap: ticks, options });
  for (let tick = 0; tick < ticks; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
  }
  return snapshotHash(state);
}

const defaultContent = referenceContent();
const namedTrueNaming = referenceContent(undefined, 'true-naming');

let failures = 0;
const report = (label, ok, detail) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}  ${detail}`);
};

console.log('## Identity 1 — `foundingSpeciesMask: 0` is the absent factor\n');
for (const seed of SEEDS) {
  const absent = hashOf(defaultContent, seed, {});
  const explicit = hashOf(defaultContent, seed, { foundingSpeciesMask: 0 });
  report(`seed ${seed}`, absent === explicit, `${absent} vs ${explicit}`);
}

console.log('\n## Identity 2 — `tradition: "true-naming"` is the absent factor\n');
console.log(`reference traditionId resolves to ${String(defaultContent.traditionId)}\n`);
for (const seed of SEEDS) {
  const absent = hashOf(defaultContent, seed, {});
  const explicit = hashOf(namedTrueNaming, seed, {});
  report(`seed ${seed}`, absent === explicit, `${absent} vs ${explicit}`);
}

console.log('\n## Control — a different seed must give a different hash\n');
{
  const a = hashOf(defaultContent, SEEDS[0], {});
  const b = hashOf(defaultContent, SEEDS[1], {});
  report('seeds differ', a !== b, `${a} vs ${b}`);
}

console.log('\n## Control — a single-species arm must differ from the all-six arm\n');
for (const [name, mask] of [
  ['draconic', 1],
  ['dwarf', 2],
  ['elf', 4],
  ['gnome', 8],
  ['human', 16],
  ['orc', 32],
]) {
  const all = hashOf(defaultContent, SEEDS[0], {});
  const one = hashOf(defaultContent, SEEDS[0], { foundingSpeciesMask: mask });
  report(`${name} (mask ${String(mask)})`, all !== one, `${all} vs ${one}`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${String(failures)} CHECK(S) FAILED`}`);
process.exitCode = failures === 0 ? 0 : 1;
