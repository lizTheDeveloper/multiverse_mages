/*
 * Multiverse Mages — W23: the written record over time, not just at the end.
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
 * W22's census answers *where knowledge is kept* at one instant. W23's defect is
 * a **curve**: libraries peak around tick 500 and are gone by tick 2000, and an
 * endpoint reading cannot tell that apart from libraries that never existed.
 * This tool samples the same census W22 committed — it builds no second
 * instrument — plus the two populace quantities the census cannot see, at a
 * stride across one zero-input run.
 *
 * **Reads only.** No golden, no baseline, nothing written into the repository
 * unless `--json` is given a path outside it.
 *
 *     npm run typecheck
 *     node tools/w23/trajectory.mjs --ticks 2400 --every 100
 *     node tools/w23/trajectory.mjs --species dwarf --json /tmp/dwarf.json
 */

import { writeFileSync } from 'node:fs';

import { rngFromRootSeed, snapshotHash, step } from '../../packages/sim-core/dist/index.js';
import {
  knowledgeCensus,
  locationSharePerMille,
  mageContainment,
} from '../../packages/agent-api/dist/index.js';
import { referenceContent, referenceScenario } from '../../packages/scenario/dist/index.js';
import {
  OCCUPATION,
  POPULACE_COHORT,
  UNIVERSE,
  collectRecords,

} from '../../packages/state/dist/index.js';

const DEFAULT_SEED = 0x0009_0001;
const DEFAULT_TICKS = 2400;

function parseArgs(argv) {
  const out = {
    seed: DEFAULT_SEED,
    ticks: DEFAULT_TICKS,
    every: 100,
    json: undefined,
    cohortSize: 4,
    foundingNodes: 4,
    mask: 0,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--seed') out.seed = Number(value);
    else if (key === '--ticks') out.ticks = Number(value);
    else if (key === '--every') out.every = Number(value);
    else if (key === '--json') out.json = value;
    else if (key === '--cohort-size') out.cohortSize = Number(value);
    else if (key === '--founding-nodes') out.foundingNodes = Number(value);
    else if (key === '--mask') out.mask = Number(value);
    else if (key !== undefined) throw new Error(`Unknown argument ${String(key)}`);
  }
  return out;
}

/** Occupation headcounts, read straight off the cohort component. */
function occupations(state) {
  const counts = { laborer: 0, scribe: 0, student: 0, soldier: 0, idle: 0, total: 0 };
  const byName = {
    [OCCUPATION.laborer]: 'laborer',
    [OCCUPATION.scribe]: 'scribe',
    [OCCUPATION.student]: 'student',
    [OCCUPATION.soldier]: 'soldier',
    [OCCUPATION.idle]: 'idle',
  };
  for (const { row } of collectRecords(state, POPULACE_COHORT)) {
    const name = byName[row.occupation];
    if (name === undefined) continue;
    counts[name] += row.count;
    counts.total += row.count;
  }
  return counts;
}

function materialsOf(state) {
  for (const { row } of collectRecords(state, UNIVERSE)) return row.materials;
  return 0;
}

function sample(state, worldTick) {
  const census = knowledgeCensus(state);
  const share = locationSharePerMille(census.whereKept);
  const jobs = occupations(state);
  return {
    worldTick,
    mind: census.whereKept.mind,
    grimoire: census.whereKept.grimoire,
    library: census.whereKept.library,
    palace: census.whereKept.palace,
    shareMind: share.mind,
    shareGrimoire: share.grimoire,
    shareLibrary: share.library,
    sharePalace: share.palace,
    nodesHeld: census.nodesHeld,
    unwritten: census.unwrittenNodeIds.length,
    fragile: census.fragileNodeIds.length,
    minRedundancy: census.minRedundancy,
    population: jobs.total,
    laborer: jobs.laborer,
    scribe: jobs.scribe,
    student: jobs.student,
    soldier: jobs.soldier,
    idle: jobs.idle,
    materials: materialsOf(state),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const content = referenceContent();
  const run = referenceScenario(content);

  const options = {
    cohortSize: args.cohortSize,
    foundingNodes: args.foundingNodes,
    foundingSpeciesMask: args.mask,
  };

  let state = run.scenario.create(args.seed, {
    worldTickCap: args.ticks,
    options,
  });

  const samples = [sample(state, 0)];
  for (let tick = 0; tick < args.ticks; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    const worldTick = tick + 1;
    if (worldTick % args.every === 0 || worldTick === args.ticks) {
      samples.push(sample(state, worldTick));
    }
  }

  const final = samples[samples.length - 1];
  const containment = mageContainment(knowledgeCensus(state));
  const fraction = containment.pairs === 0 ? 0 : containment.incomparablePairs / containment.pairs;
  const hash = snapshotHash(state);

  const lines = [];
  const say = (s) => lines.push(s);
  say(`# W23 trajectory — reference universe${args.mask === 0 ? '' : ` (species mask ${String(args.mask)})`}`);
  say('');
  say(`seed 0x${args.seed.toString(16).padStart(8, '0')} · ${String(args.ticks)} ticks · every ${String(args.every)} · zero god input`);
  say(`snapshot hash ${hash}`);
  say('');
  say('| tick | mind | grim | libr | ‰mind | ‰grim | ‰libr | nodes | unwr | pop | scribe | labor | stud | sold | idle | materials |');
  say('|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
  for (const s of samples) {
    say(
      `| ${String(s.worldTick)} | ${String(s.mind)} | ${String(s.grimoire)} | ${String(s.library)} | ${String(s.shareMind)} | ${String(s.shareGrimoire)} | ${String(s.shareLibrary)} | ${String(s.nodesHeld)} | ${String(s.unwritten)} | ${String(s.population)} | ${String(s.scribe)} | ${String(s.laborer)} | ${String(s.student)} | ${String(s.soldier)} | ${String(s.idle)} | ${String(s.materials)} |`,
    );
  }
  say('');
  const peakLibrary = samples.reduce((best, s) => (s.library > best.library ? s : best), samples[0]);
  const written = final.grimoire + final.library + final.palace;
  say(`peak library instances: ${String(peakLibrary.library)} at tick ${String(peakLibrary.worldTick)}`);
  say(`final written (grimoire+library+palace): ${String(written)} of ${String(final.mind + written)}`);
  say(`final location share ‰: mind ${String(final.shareMind)} · grimoire ${String(final.shareGrimoire)} · library ${String(final.shareLibrary)} · palace ${String(final.sharePalace)}`);
  say(`incomparable fraction at ${String(args.ticks)}: ${fraction.toFixed(3)} (${String(containment.incomparablePairs)}/${String(containment.pairs)}, holders ${String(containment.holders)})`);

  process.stdout.write(`${lines.join('\n')}\n`);

  if (args.json !== undefined) {
    writeFileSync(
      args.json,
      `${JSON.stringify(
        {
          seed: args.seed,
          ticks: args.ticks,
          every: args.every,
          foundingSpeciesMask: args.mask,
          snapshotHash: hash,
          samples,
          peakLibrary,
          finalWritten: written,
          containment,
          incomparableFraction: fraction,
        },
        undefined,
        2,
      )}\n`,
    );
  }
}

main();
