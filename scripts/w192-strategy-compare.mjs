#!/usr/bin/env node
/*
 * Multiverse Mages — did the four flat arms move when the opening square widened?
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
 * Criterion 4 of W192.
 *
 *     node scripts/w192-strategy-compare.mjs \
 *       control=tools/w192/strat-v1/w192-opening-strategies.0.runs.ndjson \
 *       wide=tools/w192/strat-named-4x6/w192-opening-strategies.0.runs.ndjson
 *
 * Both files are **named**, never globbed, and the two are paired **by run
 * seed** rather than by position: the sweep's cell ordering is an implementation
 * detail and pairing on it would silently compare seed *i* against seed *j* the
 * day the pool's assignment changes. Runs whose seed appears in only one file
 * are counted and reported rather than dropped silently.
 *
 * `permissive-breadth` is in the pool as the **positive control**: PR #169 moved
 * it and nothing else, so an analysis in which even it fails to move is an
 * analysis whose instrument is broken, not an answer about the other four.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

const named = new Map();
for (const token of process.argv.slice(2)) {
  const [label, file] = token.split('=');
  if (file === undefined) throw new Error(`expected label=path, received ${token}`);
  named.set(label, file);
}
if (named.size < 2) {
  process.stderr.write('name at least two label=path pairs, one of them "control".\n');
  process.exit(1);
}

function load(file) {
  const rows = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    const record = JSON.parse(line);
    rows.push({
      strategy: record.strategies[0],
      runSeed: record.runSeed,
      status: record.status,
      metrics: Object.fromEntries(
        Object.entries(record.metrics)
          .filter(([, entry]) => entry.status === 'measured')
          .map(([id, entry]) => [id, entry.value]),
      ),
    });
  }
  return rows;
}

const loaded = new Map([...named].map(([label, file]) => [label, load(file)]));
for (const [label, rows] of loaded) {
  if (rows.length === 0) {
    process.stderr.write(`${label} holds no records. Broken probe, not an answer.\n`);
    process.exit(3);
  }
}

const control = loaded.get('control');
if (control === undefined) {
  process.stderr.write('one label must be "control".\n');
  process.exit(1);
}

const METRICS = [
  'referencePopulation',
  'referenceNodesKnown',
  'referenceLibraryDepth',
  'referenceGrimoires',
  'referenceLivingMages',
  'referenceKnowledgeInstances',
];
const strategies = [...new Set(control.map((r) => r.strategy))].sort();
const mean = (xs) => (xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length);
const sd = (xs) => {
  if (xs.length < 2) return Number.NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

for (const [label, rows] of loaded) {
  if (label === 'control') continue;
  process.stdout.write(`\n=== ${label} against control, paired by run seed ===\n`);
  for (const strategy of strategies) {
    const left = new Map(control.filter((r) => r.strategy === strategy).map((r) => [r.runSeed, r]));
    const right = new Map(rows.filter((r) => r.strategy === strategy).map((r) => [r.runSeed, r]));
    const shared = [...left.keys()].filter((seed) => right.has(seed));
    const unpaired = left.size + right.size - 2 * shared.length;
    process.stdout.write(
      `${strategy}  (${String(shared.length)} paired seeds` +
        (unpaired > 0 ? `, ${String(unpaired)} unpaired and excluded` : '') +
        ')\n',
    );
    if (shared.length === 0) {
      process.stdout.write('  no paired seeds — the two files do not describe the same design.\n');
      continue;
    }
    let identical = true;
    for (const metric of METRICS) {
      const deltas = shared
        .map((seed) => [left.get(seed).metrics[metric], right.get(seed).metrics[metric]])
        .filter(([a, b]) => a !== undefined && b !== undefined)
        .map(([a, b]) => b - a);
      if (deltas.length === 0) {
        process.stdout.write(`  ${metric.padEnd(28)} not measured on both sides\n`);
        continue;
      }
      const m = mean(deltas);
      const se = sd(deltas) / Math.sqrt(deltas.length);
      const t = se === 0 ? (m === 0 ? 0 : Number.POSITIVE_INFINITY) : m / se;
      if (deltas.some((d) => d !== 0)) identical = false;
      const base = mean(shared.map((seed) => left.get(seed).metrics[metric]).filter((v) => v !== undefined));
      process.stdout.write(
        `  ${metric.padEnd(28)} control ${base.toFixed(1).padStart(9)}  Δ ${m.toFixed(2).padStart(9)}` +
          `  ± ${(Number.isNaN(se) ? 0 : se).toFixed(2).padStart(7)} SE  = ${
            Number.isFinite(t) ? `${t.toFixed(2)} SE` : m === 0 ? 'flat' : 'inf'
          }\n`,
      );
    }
    process.stdout.write(
      identical
        ? '  → BYTE-IDENTICAL on every metric: this arm did not move this strategy at all.\n'
        : '  → moved.\n',
    );
  }
}
