/*
 * Multiverse Mages — W26: what marooning costs, measured on the reference universe.
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
 * Four measurements, and one proof.
 *
 * 1. **Marooned instances** as a share of all instances and of held ones.
 * 2. **Nodes with every copy marooned** — held by the universe, and not one
 *    copy anywhere at or above the teach threshold. The number this workstream
 *    exists to produce, and the one no committed metric can see:
 *    `knowledgeHalfLife` counts such a node alive, `libraryDependence` counts it
 *    held, and W22's `fragileNodeIds` and `unwrittenNodeIds` both call it healthy.
 * 3. **Time-to-maroon by species**, *measured* — the tick an instance stops
 *    being teachable minus the tick it was acquired — rather than derived from
 *    the retention table.
 * 4. **The teaching/nodes-known gap**: whether the transmittable frontier moves
 *    while `nodesHeld` sits flat.
 *
 * And the proof W22 paid for, re-taken at this tool's own horizon: the censused
 * arm and a clean arm must end on the same `snapshotHash()`. W22's committed
 * test takes it at 240 ticks with a census every twelve; this takes it at 2,400
 * with a census on **every** tick, which is the strongest form available.
 *
 * **Reads only.** Steps a reference universe with no god actions. Regenerates no
 * golden and no baseline, and writes nothing into the repository unless `--json`
 * names a file.
 *
 * ## Usage
 *
 *     npm run typecheck                          # the dist/ this reads
 *     node tools/w26/marooning-report.mjs        # defaults: seed 0x00090001, 2400 ticks
 *     node tools/w26/marooning-report.mjs --ticks 600 --json out.json
 */

import { writeFileSync } from 'node:fs';

import { rngFromRootSeed, snapshotHash, step } from '../../packages/sim-core/dist/index.js';
import { MAGE, componentOf, findUniverse, permits, readRulesetForObservation } from '../../packages/state/dist/index.js';
import { knowledgeCensus } from '../../packages/agent-api/dist/index.js';
import {
  referenceContent,
  referenceMasteryModel,
  referenceScenario,
  speciesTable,
} from '../../packages/scenario/dist/index.js';

/** W22's coordinates, so the two reports can be put side by side. */
const DEFAULT_SEED = 0x0009_0001;
const DEFAULT_TICKS = 2400;

function parseArgs(argv) {
  const out = { seed: DEFAULT_SEED, ticks: DEFAULT_TICKS, json: undefined, cohortSize: 4, foundingNodes: 4 };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--seed') out.seed = Number(value);
    else if (key === '--ticks') out.ticks = Number(value);
    else if (key === '--json') out.json = value;
    else if (key === '--cohort-size') out.cohortSize = Number(value);
    else if (key === '--founding-nodes') out.foundingNodes = Number(value);
    else if (key !== undefined) throw new Error(`Unknown argument ${String(key)}`);
  }
  return out;
}

/**
 * An instance's identity across ticks.
 *
 * Not the handle alone: `destroyInstance` returns handles to the entity store,
 * so the same handle at two ticks need not be the same instance. `nodeId` and
 * `acquiredTick` pin it, and a reused handle carrying either differently is
 * simply tracked as a separate instance — the safe direction, since the failure
 * it prevents is attributing one mage's forgetting to another's acquisition.
 */
function keyOf(row) {
  return `${row.instanceHandle}:${row.nodeId}:${row.acquiredTick}`;
}

/**
 * Species name per mage handle, rebuilt each tick.
 *
 * The census publishes `retention`, which nearly identifies the species and does
 * not quite: dwarf and draconic both sit at `fp(1536)`. Time-to-maroon is asked
 * *by species*, so the tool reads `speciesId` off the mage store rather than
 * inferring it from a number that collides.
 */
function speciesNamesByMage(state, speciesOf) {
  const names = new Map();
  const mages = componentOf(state, MAGE);
  const speciesIds = mages.field('speciesId');
  mages.forEach((row, handle) => {
    const record = speciesOf(speciesIds[row]);
    names.set(handle, record === undefined ? `species:${speciesIds[row]}` : record.id);
  });
  return names;
}

function percent(part, whole) {
  if (whole === 0) return '  0.0%';
  return `${((part / whole) * 100).toFixed(1).padStart(5)}%`;
}

function quantiles(sorted) {
  if (sorted.length === 0) return { min: 0, p50: 0, max: 0 };
  const at = (share) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
  return { min: sorted[0], p50: at(0.5), max: sorted[sorted.length - 1] };
}

/**
 * One zero-input run.
 *
 * `censused` decides whether the census is called at all — that is the arm the
 * inertness proof compares against. The measurement arm censuses every tick,
 * which is what makes time-to-maroon *observed* rather than computed.
 */
function play(content, args, censused) {
  const run = referenceScenario(content);
  const { speciesOf } = speciesTable(content.registry);
  let state = run.scenario.create(args.seed, {
    worldTickCap: args.ticks,
    options: { cohortSize: args.cohortSize, foundingNodes: args.foundingNodes },
  });

  // Dormancy is a fact about the live ruleset, which edicts move, so the
  // predicate is rebuilt each tick rather than closed over once. With no god
  // input the reference universe issues no edicts and nothing is dormant — but
  // measuring that is different from assuming it, and the summary's
  // `dormancyEvaluated` flag is what tells the two apart.
  const model = (currentState) => {
    const universe = findUniverse(currentState);
    if (universe === 0) return referenceMasteryModel(content.registry);
    const ruleset = readRulesetForObservation(currentState, universe);
    return referenceMasteryModel(content.registry, {
      isDormant: (nodeId) => {
        const node = content.catalogue.node(nodeId);
        return node === undefined ? false : !permits(ruleset, node.cellId);
      },
    });
  };

  const teachableBefore = new Map();
  const timeToMaroon = new Map();
  const bornMarooned = new Map();
  const series = [];
  let crossings = 0;
  // Per node: the last world tick at which it had a teachable copy, and the
  // number of ticks it has spent untransmittable. The frontier turns out to
  // *oscillate* rather than decline, so "is this node dead" is a question about
  // a streak rather than about one reading.
  const lastTeachableTick = new Map();
  const untransmittableTicks = new Map();
  const firstHeldTick = new Map();

  for (let tick = 0; tick < args.ticks; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    if (!censused) continue;

    const worldTick = state.clock.worldTick;
    const census = knowledgeCensus(state, { mastery: model(state) });
    const marooning = census.marooning;
    const names = speciesNamesByMage(state, speciesOf);
    const seen = new Set();

    for (const row of marooning.byInstance) {
      const key = keyOf(row);
      seen.add(key);
      const was = teachableBefore.get(key);

      if (was === undefined && !row.teachable) {
        // Never observed teachable: it arrived below the threshold. Under an
        // acquire hook that starts instances at DEFAULT_INITIAL_MASTERY this is
        // the whole population, which is exactly the latent defect 804c16b
        // recorded against the `standard` hook.
        const species = names.get(row.locationId) ?? 'unknown';
        bornMarooned.set(species, (bornMarooned.get(species) ?? 0) + 1);
      } else if (was === true && !row.teachable) {
        crossings += 1;
        const species = names.get(row.locationId) ?? 'unknown';
        const list = timeToMaroon.get(species) ?? [];
        list.push(worldTick - row.acquiredTick);
        timeToMaroon.set(species, list);
      }
      teachableBefore.set(key, row.teachable);
    }
    for (const key of teachableBefore.keys()) if (!seen.has(key)) teachableBefore.delete(key);

    for (const nodeId of marooning.teachableNodeIds) {
      if (!firstHeldTick.has(nodeId)) firstHeldTick.set(nodeId, worldTick);
      lastTeachableTick.set(nodeId, worldTick);
    }
    for (const nodeId of marooning.untransmittableNodeIds) {
      if (!firstHeldTick.has(nodeId)) firstHeldTick.set(nodeId, worldTick);
      untransmittableTicks.set(nodeId, (untransmittableTicks.get(nodeId) ?? 0) + 1);
    }

    series.push({
      worldTick,
      nodesHeld: census.nodesHeld,
      teachableNodes: marooning.teachableNodeIds.length,
      untransmittableNodes: marooning.untransmittableNodeIds.length,
      heldInstances: marooning.heldInstances,
      teachableInstances: marooning.teachableInstances,
      maroonedInstances: marooning.maroonedInstances,
    });
  }

  return {
    state,
    hash: snapshotHash(state),
    finalModel: model(state),
    timeToMaroon,
    bornMarooned,
    crossings,
    series,
    lastTeachableTick,
    untransmittableTicks,
    firstHeldTick,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const content = referenceContent();

  const measured = play(content, args, true);
  const clean = play(content, args, false);
  const inert =
    measured.hash === clean.hash &&
    measured.state.clock.worldTick === clean.state.clock.worldTick &&
    measured.state.illegalActionCount === clean.state.illegalActionCount;

  const census = knowledgeCensus(clean.state, { mastery: measured.finalModel });
  const m = census.marooning;

  const lines = [];
  const say = (s) => lines.push(s);

  say('# W26 marooning report — reference universe');
  say('');
  say(`seed 0x${args.seed.toString(16).padStart(8, '0')} · ${args.ticks} ticks · zero god input`);
  say(`cohortSize ${args.cohortSize} · foundingNodes ${args.foundingNodes}`);
  say(`teach threshold ${m.teachThreshold} · dormancy evaluated: ${m.dormancyEvaluated}`);
  say('');
  say('## Inertness');
  say('');
  say(`censused arm (census every tick) : ${measured.hash}`);
  say(`clean arm    (no census at all)  : ${clean.hash}`);
  say(`INERT: ${inert ? 'yes' : 'NO — every number below is void'}`);
  say('');

  say('## 1. Marooned instances');
  say('');
  say(`instances, total     ${String(census.instanceTotal).padStart(6)}`);
  say(`  held (mind/palace) ${String(m.heldInstances).padStart(6)}  ${percent(m.heldInstances, census.instanceTotal)}`);
  say(`  written (book/shelf)${String(m.writtenInstances).padStart(5)}  ${percent(m.writtenInstances, census.instanceTotal)}`);
  say(`  malformed          ${String(m.malformedInstances).padStart(6)}`);
  say('');
  say(`  teachable          ${String(m.teachableInstances).padStart(6)}  ${percent(m.teachableInstances, m.heldInstances)} of held`);
  say(`  MAROONED           ${String(m.maroonedInstances).padStart(6)}  ${percent(m.maroonedInstances, m.heldInstances)} of held, ${percent(m.maroonedInstances, census.instanceTotal)} of all`);
  say(`  condemned (dormant)${String(m.condemnedInstances).padStart(6)}`);
  say('');

  say('## 2. Nodes with every copy marooned');
  say('');
  say(`nodes held                       ${String(census.nodesHeld).padStart(5)}`);
  say(`  with >=1 teachable copy        ${String(m.teachableNodeIds.length).padStart(5)}  ${percent(m.teachableNodeIds.length, census.nodesHeld)}`);
  say(`  UNTRANSMITTABLE (no such copy) ${String(m.untransmittableNodeIds.length).padStart(5)}  ${percent(m.untransmittableNodeIds.length, census.nodesHeld)}`);
  say('');
  say(`for comparison, what the existing metrics see:`);
  say(`  fragile (exactly one instance) ${String(census.fragileNodeIds.length).padStart(5)}`);
  say(`  unwritten (no book at all)     ${String(census.unwrittenNodeIds.length).padStart(5)}`);
  say(`  single-location                ${String(census.singleLocationNodeIds.length).padStart(5)}`);
  say(`  min / max redundancy           ${String(census.minRedundancy).padStart(5)} / ${census.maxRedundancy}`);
  say('');
  const untransmittableCopies = m.byNode
    .filter((n) => m.untransmittableNodeIds.includes(n.nodeId))
    .reduce((acc, n) => acc + n.held + n.written, 0);
  say(`copies held of untransmittable nodes: ${untransmittableCopies}`);
  say('');

  say('## 3. Time-to-maroon, measured');
  say('');
  say(`crossings observed: ${measured.crossings}`);
  say('');
  say('species        n      min    median   max   | retention  decay  floor');
  const { speciesOf, ids } = speciesTable(content.registry);
  const byName = new Map();
  for (const id of ids) {
    const record = speciesOf(id);
    if (record !== undefined) byName.set(record.id, record);
  }
  const names = [...new Set([...measured.timeToMaroon.keys(), ...byName.keys()])].sort();
  for (const name of names) {
    const samples = (measured.timeToMaroon.get(name) ?? []).slice().sort((a, b) => a - b);
    const q = quantiles(samples);
    const record = byName.get(name);
    const retention = record?.retention ?? 0;
    const decay = measured.finalModel.masteryDecayPerTick(retention);
    const floor = measured.finalModel.masteryFloor(retention, false);
    say(
      `${name.padEnd(13)} ${String(samples.length).padStart(5)}  ${String(q.min).padStart(5)} ${String(q.p50).padStart(7)} ${String(q.max).padStart(6)}   | ` +
        `${String(retention).padStart(8)} ${String(decay).padStart(6)} ${String(floor).padStart(6)}`,
    );
  }
  say('');
  const born = [...measured.bornMarooned.entries()].sort();
  say(`born below the threshold (never teachable for one tick): ${born.reduce((a, [, n]) => a + n, 0)}`);
  for (const [name, count] of born) say(`  ${name.padEnd(13)} ${count}`);
  say('');

  say('## 4. The transmittable frontier over time');
  say('');
  say(' tick  nodesHeld  teachableNodes  heldInst  teachableInst   share');
  const marks = [
    ...new Set(
      [60, 120, 300, 600, 900, 1200, 1500, 1800, 2100, 2400]
        .filter((t) => t <= args.ticks)
        .concat(measured.series.length === 0 ? [] : [measured.series[measured.series.length - 1].worldTick]),
    ),
  ].sort((a, b) => a - b);
  for (const mark of marks) {
    const row = measured.series.find((s) => s.worldTick === mark);
    if (row === undefined) continue;
    say(
      `${String(row.worldTick).padStart(5)}  ${String(row.nodesHeld).padStart(9)}  ${String(row.teachableNodes).padStart(14)}  ` +
        `${String(row.heldInstances).padStart(8)}  ${String(row.teachableInstances).padStart(13)}  ${percent(row.teachableInstances, row.heldInstances)}`,
    );
  }
  say('');
  const peak = measured.series.reduce(
    (best, s) => (s.teachableNodes > best.teachableNodes ? s : best),
    measured.series[0] ?? { worldTick: 0, teachableNodes: 0 },
  );
  say(`peak transmittable frontier: ${peak.teachableNodes} nodes at tick ${peak.worldTick}`);
  say('');

  // The frontier oscillates, so a single reading cannot say whether a node is
  // *dying* or merely between teachers. How long it has gone without one can.
  say('## 5. How durable is untransmittability');
  say('');
  const finalTick = measured.series.length === 0 ? 0 : measured.series[measured.series.length - 1].worldTick;
  const streaks = m.untransmittableNodeIds
    .map((nodeId) => ({
      nodeId,
      since: measured.lastTeachableTick.has(nodeId)
        ? finalTick - measured.lastTeachableTick.get(nodeId)
        : finalTick - (measured.firstHeldTick.get(nodeId) ?? 0),
      everTeachable: measured.lastTeachableTick.has(nodeId),
      share: measured.untransmittableTicks.get(nodeId) ?? 0,
    }))
    .sort((a, b) => b.since - a.since);
  say(`untransmittable at tick ${finalTick}: ${streaks.length} nodes`);
  say(`  never once had a teachable copy in this run: ${streaks.filter((s) => !s.everTeachable).length}`);
  for (const bound of [100, 300, 600, 1200]) {
    say(`  with no teachable copy for >= ${String(bound).padStart(4)} ticks: ${streaks.filter((s) => s.since >= bound).length}`);
  }
  say('');
  say('the ten longest-dormant, and the share of the run each spent untransmittable:');
  say(' node   ticks since a teachable copy   untransmittable share of run');
  for (const s of streaks.slice(0, 10)) {
    say(
      `${String(s.nodeId).padStart(5)}   ${String(s.since).padStart(26)}   ${percent(s.share, measured.series.length)}`,
    );
  }
  say('');

  const report = lines.join('\n');
  process.stdout.write(`${report}\n`);

  if (args.json !== undefined) {
    writeFileSync(
      args.json,
      `${JSON.stringify(
        {
          seed: args.seed,
          ticks: args.ticks,
          inert,
          hashes: { censused: measured.hash, clean: clean.hash },
          summary: {
            instanceTotal: census.instanceTotal,
            nodesHeld: census.nodesHeld,
            heldInstances: m.heldInstances,
            writtenInstances: m.writtenInstances,
            teachableInstances: m.teachableInstances,
            maroonedInstances: m.maroonedInstances,
            condemnedInstances: m.condemnedInstances,
            teachableNodes: m.teachableNodeIds.length,
            untransmittableNodes: m.untransmittableNodeIds.length,
            fragileNodes: census.fragileNodeIds.length,
            unwrittenNodes: census.unwrittenNodeIds.length,
            minRedundancy: census.minRedundancy,
            maxRedundancy: census.maxRedundancy,
          },
          timeToMaroon: Object.fromEntries(
            [...measured.timeToMaroon].map(([name, list]) => [name, list.slice().sort((a, b) => a - b)]),
          ),
          bornMarooned: Object.fromEntries(measured.bornMarooned),
          untransmittableStreaks: streaks,
          series: measured.series,
        },
        null,
        2,
      )}\n`,
    );
  }

  if (!inert) process.exitCode = 1;
}

main();
