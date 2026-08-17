/*
 * Multiverse Mages -- is the standing-working gate a no-op on zero-duration content?
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
 * Acceptance criterion 3, at run scale, across two refs.
 *
 * ## Why the literal claim is unattainable, and what replaces it
 *
 * The criterion asks for a run over only-zero-duration effects to be
 * *byte-identical in snapshot hash* before and after the change. It cannot be,
 * and the reason is structural rather than a defect: world-schema revision 12
 * appends a twenty-second component section, and a section is in the serialized
 * bytes. Every schema revision this project has ever taken moved every hash the
 * same way. A tool reporting "the hashes differ" would be reporting the
 * revision, not the behaviour.
 *
 * So the claim is made one level down, where it is falsifiable:
 *
 * - **The twenty-one pre-existing sections are byte-identical**, compared per
 *   section so that a difference names which one moved.
 * - **The twenty-second section is empty.** No working is ever lit, because the
 *   shipped grid authors no world-scale duration -- all 38 non-zero
 *   `durationTicks` belong to `area-denial`, which is an engagement primitive.
 * - **Every report field present on both refs carries the same value on every
 *   tick.** That is the arm the section digests cannot make: it catches an RNG
 *   draw-count shift from appending goal 11, which would move mortality and
 *   births without changing any component layout.
 *
 * ## The probe reports its own coverage
 *
 * `ticksWithoutReport` travels with the answer. A run whose probe never saw a
 * report would produce an empty per-tick list, which compares equal to another
 * empty list -- the null-by-construction shape this campaign has found five
 * times. A non-zero `reports` count is what makes the comparison mean anything,
 * and it is printed rather than assumed.
 *
 * Usage, from the repository root, with the tree built (`npx tsc --build`):
 *
 *     node tools/w-duration/cross-version-noop.mjs --ticks 200 --out <path>
 *
 * Run it at both refs and `diff` the two JSON files.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { decodeSnapshot, defineWorld, serializeState } from '../../packages/sim-core/dist/index.js';
import { defineWorldSimulation } from '../../packages/coordination/dist/index.js';
import { createSession } from '../../packages/agent-api/dist/index.js';
import {
  BOT_POOL_REGISTRY,
  adaptAgentSession,
  deriveRunSeed,
  policiesForRun,
  runEpisode,
} from '../../packages/mc-harness/dist/index.js';
import {
  REFERENCE_SCENARIO_ID,
  buildReferenceState,
  referenceContent,
  referenceOptions,
} from '../../packages/scenario/dist/index.js';

const SWEEP_ID = 'w-duration-cross-version-v1';
const ROOT_SEED = 20260811;

function digest(values) {
  const hash = createHash('sha256');
  for (const value of values) hash.update(String(value)).update(' ');
  return hash.digest('hex').slice(0, 16);
}

function sectionDigests(state) {
  const envelope = decodeSnapshot(serializeState(state));
  const out = {};
  for (const component of envelope.components) {
    out[component.name] = {
      fields: component.fields.map((field) => field.name + ':' + String(field.kind)).join(','),
      rows: component.slots.length,
      digest: digest([...component.slots, '|', ...component.values]),
    };
  }
  return out;
}

function runOne(input) {
  const { content, strategyId, coordinates, options, worldTickCap } = input;
  const runSeed = deriveRunSeed(coordinates);
  const simulation = defineWorldSimulation(content.deps);

  const perTick = [];
  let ticksWithoutReport = 0;
  let finalState;

  const schema = defineWorld({
    components: simulation.schema.components,
    systems: [
      ...simulation.schema.systems,
      {
        name: 'w-duration-report-probe',
        run(ctx) {
          finalState = ctx.state;
          const report = simulation.lastReport();
          if (report === undefined) {
            ticksWithoutReport += 1;
            return;
          }
          const flat = {};
          for (const [key, value] of Object.entries(report)) {
            flat[key] = Array.isArray(value) ? '[' + value.join(',') + ']' : String(value);
          }
          perTick.push(flat);
        },
      },
    ],
    ...(simulation.schema.maxSlots === undefined ? {} : { maxSlots: simulation.schema.maxSlots }),
  });

  const scenario = {
    scenarioId: REFERENCE_SCENARIO_ID,
    catalogue: content.catalogue,
    create: (seed, config) =>
      buildReferenceState({ runSeed: seed, options: referenceOptions(config), content, schema }),
  };

  const raw = createSession({ scenario, agentSlotIndex: 0, strategyId });
  const session = adaptAgentSession(raw);
  const episode = runEpisode({
    session,
    runSeed,
    scenarioConfig: { worldTickCap, options },
    policies: policiesForRun({ registry: BOT_POOL_REGISTRY, strategies: [strategyId], runSeed }),
    worldTickCap,
  });

  return {
    strategyId,
    runSeed,
    status: episode.status,
    terminalReason: episode.terminalReason,
    ticksRun: episode.ticksRun,
    snapshotHash: raw.snapshotHash(),
    ticksWithoutReport,
    reports: perTick.length,
    sections: finalState === undefined ? {} : sectionDigests(finalState),
    perTick,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (typeof key !== 'string' || !key.startsWith('--')) continue;
    const next = argv[i + 1];
    args[key.slice(2)] = next === undefined || next.startsWith('--') ? 'yes' : next;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const worldTickCap = Number(args.ticks ?? 200);
  const strategies = (args.strategies ?? 'passive-control,permissive-breadth').split(',');
  const content = referenceContent();

  const runs = strategies.map((strategyId) =>
    runOne({
      content,
      strategyId,
      coordinates: {
        sweepId: SWEEP_ID,
        rootSeed: ROOT_SEED,
        cellIndex: 0,
        replicateIndex: 0,
        strategyId,
      },
      options: { cohortSize: 8, foundingNodes: 2 },
      worldTickCap,
    }),
  );

  const payload = { sweepId: SWEEP_ID, rootSeed: ROOT_SEED, worldTickCap, runs };
  if (args.out !== undefined) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, JSON.stringify(payload, null, 2) + '\n');
  }
  for (const run of runs) {
    process.stdout.write(
      run.strategyId +
        '  ticks=' + String(run.ticksRun) +
        '  hash=' + run.snapshotHash +
        '  sections=' + String(Object.keys(run.sections).length) +
        '  reports=' + String(run.reports) +
        '  noReport=' + String(run.ticksWithoutReport) +
        '\n',
    );
  }
}

main();
