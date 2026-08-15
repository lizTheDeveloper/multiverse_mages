#!/usr/bin/env node
/*
 * Multiverse Mages — W204: which wired mechanisms actually bind.
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
 * `check:reachability` counts symbols nothing calls. `check:consumption` asks
 * whether an authored effect reaches a consumer. Neither can see a mechanism
 * that is called every tick, reaches its consumer, and contributes a magnitude
 * of zero — which is what `teach-rate` does under v1 content, at +0.1% on
 * lessons taught, while every static check reports green.
 *
 * This runs the reference universe once per arm and asks the only question that
 * cannot be faked: **does removing the mechanism change the run.**
 *
 * Usage:
 *
 *     node tools/w204/never-bind.mjs [--ticks 600] [--seeds 3] [--amp 100]
 *                                    [--arms primitive:teach-rate,deps:god]
 *                                    [--json out.json]
 *
 * Every run prints a self-check block first. If the two control runs in one
 * process do not agree, or the fresh-process control disagrees, every row below
 * is noise and the tool says so and exits 2 rather than printing a table.
 */

import process from 'node:process';
import { writeFileSync } from 'node:fs';

import { hashBytes } from '@mm/sim-core';
import { LONG_RUN_SEED, referenceContent, runLongReference } from '@mm/scenario';

import { amplifiedContent, armTable } from './arms.mjs';

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
}

const TICKS = Number.parseInt(flag('ticks', '600'), 10);
const SEED_COUNT = Number.parseInt(flag('seeds', '3'), 10);
const AMP = Number.parseInt(flag('amp', '100'), 10);
const ONLY = flag('arms', undefined)?.split(',');
const JSON_OUT = flag('json', undefined);

/** Seeds. The first is the one every long-run measurement here was taken on. */
const SEEDS = Array.from({ length: SEED_COUNT }, (_, index) => LONG_RUN_SEED + index * 0x0001_0000);

/**
 * A fingerprint of everything the run *did*, and of nothing it was configured
 * with.
 *
 * `finalSnapshotHash` cannot serve for the amplification direction, and finding
 * that out is the reason this function exists. Amplifying `direct-damage` — an
 * engagement-scale primitive, in a driver that installs no raid system and can
 * therefore never resolve one point of damage — moves `finalSnapshotHash` while
 * every behavioural counter is identical to the control. The serialized state
 * carries a content-derived field, so **any** content edit moves the snapshot
 * hash whether or not it moves the simulation. An instrument that read that as
 * "the mechanism binds" would have reported all sixteen primitives live.
 *
 * So the amplification direction is judged on this instead: every field of every
 * per-tick report, plus the per-tick census, folded in tick order. Two runs with
 * the same trace hash did the same things at the same times, whatever content
 * they were built from.
 */
function traceHash(result) {
  const parts = [];
  for (const tick of result.ticks) {
    parts.push(String(tick.worldTick), String(tick.population), String(tick.nodesKnown));
    parts.push(String(tick.libraryDepth), String(tick.grimoires), String(tick.capitalContribution));
    parts.push(tick.populationBySpecies.join(','), tick.populationByOccupation.join(','));
    parts.push(tick.magesBySpecies.join(','), tick.deepestTierBySpecies.join(','));
    for (const key of Object.keys(tick.report).sort()) {
      const value = tick.report[key];
      parts.push(key, typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value));
    }
  }
  return hashBytes(new TextEncoder().encode(parts.join('|')));
}

/**
 * Every numeric field of the per-tick report, summed over the run.
 *
 * The metric vector is a chosen subset and will say "no metric moved" about a
 * run whose trace hash did move — which is the least useful sentence an
 * instrument can produce. This makes the residual nameable: whatever moved is
 * in here, and the row can say which channel it was.
 */
function fieldSums(result) {
  const sums = {};
  for (const tick of result.ticks) {
    for (const [key, value] of Object.entries(tick.report)) {
      if (typeof value !== 'number') continue;
      sums[key] = (sums[key] ?? 0) + value;
    }
  }
  return sums;
}

/**
 * The summary of one run: the whole-state hash first, then the description.
 *
 * The hash is the discriminator — the known control is "six of seven ablate
 * *byte-identically*", which is a whole-state claim, and any metric subset is
 * strictly less sensitive and would manufacture inert rows. The metrics exist
 * only to say *how large* a move was once the hash has said there was one.
 */
function summarize(result) {
  const last = result.ticks.at(-1);
  const sum = (field) => result.ticks.reduce((total, tick) => total + tick.report[field], 0);
  return {
    hash: result.finalSnapshotHash,
    trace: traceHash(result),
    fields: fieldSums(result),
    metrics: {
      nodesKnown: last.nodesKnown,
      libraryDepth: last.libraryDepth,
      grimoires: last.grimoires,
      population: last.population,
      peakPopulation: result.peakPopulation,
      capitalContribution: last.capitalContribution,
      deepestTierTotal: last.deepestTierBySpecies.reduce((a, b) => a + b, 0),
      livingMages: last.magesBySpecies.reduce((a, b) => a + b, 0),
      occupations: last.populationByOccupation.join('/'),
      researchCompleted: sum('researchCompleted'),
      lessonsTaught: sum('lessonsTaught'),
      grimoiresScribed: sum('grimoiresScribed'),
      nodesLost: sum('nodesLost'),
      births: sum('births'),
      mageDeaths: sum('mageDeaths'),
      populaceDeaths: sum('populaceDeaths'),
      magesPromoted: sum('magesPromoted'),
      goalSwitches: sum('goalSwitches'),
      materialsProduced: sum('materialsProduced'),
      materialsApplied: sum('materialsApplied'),
      buildProgressAdded: sum('buildProgressAdded'),
      universitiesCompleted: sum('universitiesCompleted'),
      libraryInstancesDegraded: sum('libraryInstancesDegraded'),
      libraryUpkeepPaid: sum('libraryUpkeepPaid'),
      staffAssigned: sum('staffAssigned'),
      staffPruned: sum('staffPruned'),
      effortsInFlight: sum('effortsInFlight'),
    },
  };
}

/** The content one arm's control is taken against — its tradition, or the default. */
const contentFor = (arm) => (arm?.base === undefined ? referenceContent() : referenceContent(undefined, arm.base));

async function runArm(content, runSeed) {
  return summarize(await runLongReference({ ticks: TICKS, content, runSeed }));
}

/** Relative movement of every metric, largest first. */
function movement(control, arm) {
  const moved = [];
  for (const [key, base] of Object.entries({ ...control.fields, ...control.metrics })) {
    const value = arm.metrics[key] ?? arm.fields[key];
    if (value === base) continue;
    const share = base === 0 ? Number.POSITIVE_INFINITY : (value - base) / Math.abs(base);
    moved.push({ key, from: base, to: value, share });
  }
  moved.sort((a, b) => Math.abs(b.share) - Math.abs(a.share));
  return moved;
}

const describe = (moved) =>
  moved.length === 0
    ? 'trace moved, but no numeric report field did — a non-numeric channel'
    : moved
        .slice(0, 3)
        .map(
          ({ key, from, to, share }) =>
            `${key} ${String(from)}->${String(to)} (${Number.isFinite(share) ? `${(share * 100).toFixed(1)}%` : 'from zero'})`,
        )
        .join('; ');

// ---------------------------------------------------------------------------
// Self-check. An instrument for finding mechanisms that do nothing can itself
// do nothing, and the two results are identical: "nothing moved".
// ---------------------------------------------------------------------------

const baseContent = referenceContent();
const controlA = await runArm(baseContent, SEEDS[0]);
const controlB = await runArm(referenceContent(), SEEDS[0]);

if (controlA.hash !== controlB.hash) {
  console.error(
    'SELF-CHECK FAILED: two control runs in one process disagree ' +
      `(${controlA.hash} vs ${controlB.hash}). The reference scenario holds per-run state, so ` +
      'every arm below would be comparing against whichever run finished last. Nothing is ' +
      'reported.',
  );
  process.exit(2);
}

// A seam that engages must be *demonstrably* able to move the hash. `build-rate`
// is the positive control: `tools/w29/causal-chain.mjs` measures it moving
// construction, so an instrument that reports it inert is broken.
const positive = await runArm(
  armTable().find((arm) => arm.id === 'primitive:resource-yield').zero(baseContent),
  SEEDS[0],
);
if (positive.hash === controlA.hash) {
  console.error(
    'SELF-CHECK FAILED: ablating `resource-yield` produced a byte-identical run. That primitive ' +
      'is the one arm previously measured as moving the world, so a null here means the ablation ' +
      'seam did not engage — not that the primitive is inert. Nothing is reported.',
  );
  process.exit(2);
}

// A content-level amplification arm rebuilds the registry from an in-memory
// source. If that path alone moved the hash, every amplify row would read as a
// live mechanism. Amplifying by a factor of one must reproduce the control
// byte-for-byte, and this is where that is proven rather than assumed.
const identityAmp = await runArm(referenceContent(amplifiedContent('teach-rate', 1).registry), SEEDS[0]);
if (identityAmp.hash !== controlA.hash || identityAmp.trace !== controlA.trace) {
  console.error(
    'SELF-CHECK FAILED: rebuilding content through `memorySource` with every magnitude unchanged ' +
      `produced a different run (${identityAmp.hash} vs ${controlA.hash}). The amplification path ` +
      'itself perturbs the universe, so every x-factor row would be an artifact. Nothing is ' +
      'reported.',
  );
  process.exit(2);
}

// And a negative control for the amplification path specifically. `direct-damage`
// is engagement-scale; this driver installs no raid system, so amplifying it a
// hundredfold cannot change a single thing the world loop does. If the trace
// moves here, the trace is picking up the content edit rather than its effect.
const negativeAmp = await runArm(referenceContent(amplifiedContent('direct-damage', 100).registry), SEEDS[0]);
if (negativeAmp.trace !== controlA.trace) {
  console.error(
    'SELF-CHECK FAILED: amplifying `direct-damage` a hundredfold moved the behavioural trace in a ' +
      'driver that resolves no engagement. The trace is reading the content edit rather than its ' +
      'effect, so every amplification row would be an artifact. Nothing is reported.',
  );
  process.exit(2);
}
if (negativeAmp.hash === controlA.hash) {
  console.error(
    'SELF-CHECK NOTE: the snapshot hash no longer moves on a content-only edit. The trace hash was ' +
      'introduced because it did; re-check whether it is still needed.',
  );
}

console.log(`W204 — wires that never bind. ${String(TICKS)} ticks, ${String(SEEDS.length)} seed(s), amplification x${String(AMP)}.`);
console.log(
  `self-check: control reproducible in-process (${controlA.hash}); ` +
    'identity-amplification byte-identical; content-only amplification leaves the trace ' +
    'untouched; positive control (resource-yield) moves.\n',
);

// ---------------------------------------------------------------------------

const rows = [];
for (const arm of armTable()) {
  if (ONLY !== undefined && !ONLY.includes(arm.id)) continue;
  const row = { id: arm.id, family: arm.family, seam: arm.seam, seeds: [] };

  for (const seed of SEEDS) {
    const control =
      arm.base === undefined && seed === SEEDS[0] ? controlA : await runArm(contentFor(arm), seed);
    const perSeed = { seed, controlHash: control.hash };

    if (arm.zero !== undefined) {
      try {
        const zero = await runArm(arm.zero(contentFor(arm)), seed);
        perSeed.zero = {
          hash: zero.hash,
          trace: zero.trace,
          // The zero direction changes no content, so the snapshot hash is a
          // valid byte-identity claim here and is the stricter of the two.
          identical: zero.hash === control.hash && zero.trace === control.trace,
          moved: movement(control, zero),
        };
      } catch (error) {
        perSeed.zero = { error: error instanceof Error ? error.message : String(error) };
      }
    }

    if (arm.amp !== undefined) {
      try {
        const amplified = await runArm(arm.amp(contentFor(arm), AMP), seed);
        perSeed.amp = {
          hash: amplified.hash,
          trace: amplified.trace,
          // Deliberately NOT the snapshot hash. See `traceHash`: a content edit
          // moves the snapshot hash on its own, so judging amplification by it
          // would report every primitive live.
          identical: amplified.trace === control.trace,
          moved: movement(control, amplified),
        };
      } catch (error) {
        perSeed.amp = { error: error instanceof Error ? error.message : String(error) };
      }
    }

    row.seeds.push(perSeed);
  }

  // A verdict is taken across every seed: a mechanism that binds on one seed
  // and not another is live, and reporting the modal seed would hide that.
  const zeroMoves = row.seeds.some((s) => s.zero !== undefined && s.zero.identical === false);
  const ampMoves = row.seeds.some((s) => s.amp !== undefined && s.amp.identical === false);
  const zeroRan = row.seeds.some((s) => s.zero !== undefined && s.zero.error === undefined);
  const ampRan = row.seeds.some((s) => s.amp !== undefined && s.amp.error === undefined);
  row.verdict =
    !zeroRan && !ampRan
      ? 'no-seam'
      : zeroMoves
        ? 'live'
        : ampMoves
          ? 'magnitude-bound (content)'
          : ampRan
            ? 'inert at both extremes (structural, or unread)'
            : 'inert at zero, no amplify seam';
  rows.push(row);

  const first = row.seeds[0];
  const zeroText =
    first.zero === undefined
      ? 'n/a'
      : first.zero.error !== undefined
        ? `error: ${first.zero.error.slice(0, 60)}`
        : first.zero.identical
          ? 'byte-identical'
          : describe(first.zero.moved);
  const ampText =
    first.amp === undefined
      ? 'n/a'
      : first.amp.error !== undefined
        ? `error: ${first.amp.error.slice(0, 60)}`
        : first.amp.identical
          ? 'byte-identical'
          : describe(first.amp.moved);
  console.log(`${row.id.padEnd(34)} ${row.verdict.padEnd(42)}`);
  console.log(`${' '.repeat(34)} zero: ${zeroText}`);
  console.log(`${' '.repeat(34)} x${String(AMP)}:  ${ampText}`);
}

if (JSON_OUT !== undefined) {
  writeFileSync(JSON_OUT, `${JSON.stringify({ ticks: TICKS, seeds: SEEDS, amp: AMP, rows }, undefined, 2)}\n`);
  console.log(`\nwrote ${JSON_OUT}`);
}
