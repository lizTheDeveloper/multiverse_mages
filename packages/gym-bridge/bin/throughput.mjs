#!/usr/bin/env node
/*
 * Multiverse Mages — where the throughput budget actually goes.
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
 * `proposal.md`'s fifth open question, answered by measuring rather than by
 * choosing:
 *
 * > **What is the throughput budget, and where does it actually go?** … JSON
 * > encode/decode per step across a pipe is the obvious suspect; so is the
 * > `fp`-normalization pass … Measure the split between simulation time,
 * > serialization, and pipe latency before choosing whether the protocol needs
 * > a binary or batched mode. **Do not add batching speculatively** — it
 * > complicates episode boundaries badly.
 *
 * So this reports the split and adds nothing. The release claim is *the figure
 * this command records*, not a figure anyone asserted.
 *
 *     node packages/gym-bridge/bin/throughput.mjs \
 *       --scenario ./packages/scenario/bin/scenario.mjs --ticks 2000 --envs 8
 *
 * ## Why the clock is read here and nowhere else
 *
 * A wall-clock read inside a frame handler would put a timing value into a
 * recorded episode, and a record carrying one cannot be compared byte for byte.
 * `mc-harness` keeps its performance section out of every reproducibility
 * comparison for the same reason; this file is the whole of this package's
 * contact with a clock, and `package-boundaries.test.ts` asserts that `src/`
 * has none.
 */

import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { URL } from 'node:url';

import { EnvVector, decodeFrame, encodeFrame } from '../dist/index.js';

const USAGE = `mm-gym-throughput — measure where a step's time goes.

  --scenario <module>   Module exporting createScenario() or scenario. Required.
  --ticks <n>           World ticks per env. Default 1000.
  --envs <n>            Universes stepped per frame. Default 1.
  --help                This text.

Reports ticks per second and the split: session step, observation read, frame
encode, frame decode. Timing figures are excluded from every reproducibility
comparison — see mc-harness's reproducibleSummary for the same rule.`;

function parseArgs(argv) {
  const known = new Set(['--scenario', '--ticks', '--envs']);
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (!known.has(flag)) throw new Error(`Unknown option ${flag}. Run with --help.`);
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`${flag} needs a value.`);
    args[flag.slice(2)] = value;
    index += 1;
  }
  return args;
}

async function loadScenario(specifier) {
  const module = await import(new URL(specifier, `file://${process.cwd()}/`).href);
  const built =
    typeof module.createScenario === 'function'
      ? module.createScenario()
      : (module.scenario ?? module.default?.scenario);
  if (built === undefined || typeof built.create !== 'function') {
    throw new Error(`${specifier} exports no scenario.`);
  }
  return built;
}

function ms(value) {
  return `${value.toFixed(1)} ms`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (args.scenario === undefined) {
    process.stderr.write(`--scenario is required.\n\n${USAGE}\n`);
    return 2;
  }

  const ticks = args.ticks === undefined ? 1000 : Number.parseInt(args.ticks, 10);
  const envCount = args.envs === undefined ? 1 : Number.parseInt(args.envs, 10);
  const scenario = await loadScenario(args.scenario);
  const vector = new EnvVector({ scenario, envCount });

  for (let env = 0; env < envCount; env += 1) {
    vector.reset(env, 0x5eed_0000 + env, { worldTickCap: ticks + 1 });
  }

  // Four buckets, and the split is the point rather than the total. A total
  // alone cannot tell "the simulation is slow" from "JSON is slow", and those
  // have opposite fixes — the first is the Rust port vision §10 leaves open,
  // the second is the binary encoding this release deliberately did not add.
  let stepTime = 0;
  let viewTime = 0;
  let encodeTime = 0;
  let decodeTime = 0;
  let stepped = 0;

  const wallStart = performance.now();
  for (let tick = 0; tick < ticks; tick += 1) {
    const views = [];
    for (let env = 0; env < envCount; env += 1) {
      if (vector.faultOf(env) !== undefined) continue;
      const beforeStep = performance.now();
      const view = vector.step(env, 0);
      const afterStep = performance.now();
      // `step` submits *and* builds a view, so the two cannot be timed apart
      // directly. Reading the same tick a second time costs the view and
      // nothing else, so that read is the observation figure and the remainder
      // is the simulation figure. It is an estimate and is labelled as one.
      vector.observe(env);
      const afterView = performance.now();
      viewTime += afterView - afterStep;
      stepTime += afterStep - beforeStep - (afterView - afterStep);
      views.push(view);
      stepped += 1;
    }
    if (views.length === 0) break;

    const beforeEncode = performance.now();
    const line = encodeFrame({ type: 'step', envs: views });
    const afterEncode = performance.now();
    decodeFrame(line.trimEnd());
    const afterDecode = performance.now();
    encodeTime += afterEncode - beforeEncode;
    decodeTime += afterDecode - afterEncode;
  }
  const wall = performance.now() - wallStart;

  process.stdout.write(
    [
      `scenario         ${scenario.scenarioId}`,
      `envs             ${String(envCount)}`,
      `world ticks      ${String(stepped)}`,
      `wall clock       ${ms(wall)}`,
      `ticks/second     ${(stepped / (wall / 1000)).toFixed(0)}`,
      `  session step   ${ms(stepTime)}`,
      `  observation    ${ms(viewTime)}`,
      `  frame encode   ${ms(encodeTime)}`,
      `  frame decode   ${ms(decodeTime)}`,
      '',
      'The split, not the total, is the useful number: a slow simulation and slow',
      'serialization have opposite fixes. No binary or batched-tick mode was added on',
      'the strength of this — proposal.md asks for the measurement first and warns that',
      'speculative batching complicates episode boundaries badly.',
    ].join('\n') + '\n',
  );
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    process.stderr.write(`${String(error?.stack ?? error)}\n`);
    process.exitCode = 1;
  },
);
