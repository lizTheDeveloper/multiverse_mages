#!/usr/bin/env node
/*
 * Multiverse Mages — folds W192's frontier records into the four criteria.
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
 *     node scripts/w192-analyse.mjs tools/w192/frontier-a.ndjson tools/w192/frontier-b.ndjson
 *
 * **Every input is named on the command line and nothing is globbed.** The
 * failure `CLAUDE.md` records five instances of is an aggregator that finds a
 * *different* run's output and reports a well-formed number about it; this one
 * additionally refuses a file whose records disagree on `ticks` or `tier`, so
 * two invocations at different horizons cannot be folded into one denominator.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (files.length === 0) {
  process.stderr.write('name at least one .ndjson file. Nothing is globbed here.\n');
  process.exit(1);
}

const records = [];
for (const file of files) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    records.push({ ...JSON.parse(line), sourceFile: file });
  }
}
if (records.length === 0) {
  process.stderr.write('the named files hold no records. This is a broken probe, not an answer.\n');
  process.exit(3);
}
const ticks = new Set(records.map((r) => r.ticks));
const tiers = new Set(records.map((r) => r.tier));
if (ticks.size !== 1 || tiers.size !== 1) {
  process.stderr.write(
    `the named files mix horizons (${[...ticks].join(',')}) or tiers (${[...tiers].join(',')}). ` +
      'Folding them would produce a denominator that matches no flag.\n',
  );
  process.exit(3);
}

const byArm = new Map();
for (const record of records) {
  if (!byArm.has(record.armId)) byArm.set(record.armId, []);
  byArm.get(record.armId).push(record);
}

const speciesNames = Object.keys(records[0].arrivals);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => {
  if (xs.length < 2) return Number.NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

process.stdout.write(
  `W192 frontier — tier ${String([...tiers][0])}, ${String([...ticks][0])} ticks, ` +
    `${String(records.length)} runs across ${String(byArm.size)} arms\n`,
);
process.stdout.write(`inputs: ${files.join(' ')}\n\n`);

// --- criterion 1: time to tier 3, and censoring -----------------------------
process.stdout.write('CRITERION 1 — time to tier 3 per species; "cens" is runs that never got there\n');
const head = ['arm'.padEnd(11), 'n'.padStart(3), ...speciesNames.map((s) => s.slice(0, 8).padStart(13))];
process.stdout.write(`${head.join(' ')}\n`);
const censusRows = [];
for (const [armId, rows] of byArm) {
  const cells = speciesNames.map((name) => {
    const observed = rows.map((r) => r.arrivals[name]).filter((v) => v !== null);
    const censored = rows.length - observed.length;
    return observed.length === 0
      ? `  cens ${String(censored)}/${String(rows.length)}`.padStart(13)
      : `${Math.round(mean(observed))}${censored > 0 ? `/c${String(censored)}` : ''}`.padStart(13);
  });
  const totalCensored = speciesNames.reduce(
    (sum, name) => sum + rows.filter((r) => r.arrivals[name] === null).length,
    0,
  );
  censusRows.push({ armId, rows: rows.length, totalCensored });
  process.stdout.write(`${[armId.padEnd(11), String(rows.length).padStart(3), ...cells].join(' ')}\n`);
}
process.stdout.write('\ncensoring, all species pooled:\n');
for (const row of censusRows) {
  const denominator = row.rows * speciesNames.length;
  process.stdout.write(
    `  ${row.armId.padEnd(11)} ${String(row.totalCensored).padStart(4)}/${String(denominator).padEnd(4)}` +
      ` = ${((100 * row.totalCensored) / denominator).toFixed(1)}%\n`,
  );
}

// --- criteria 2 and the progression channels -------------------------------
process.stdout.write(
  '\nCRITERION 2 and progression — end-of-horizon state, mean over runs\n' +
    'libDepth is distinct nodes shelved; libMult is the rate multiplier it buys\n' +
    '(the 1.25x knot of LIBRARY_CONTRIBUTION is 24 nodes; capital is the ungated fp).\n',
);
process.stdout.write(
  `${['arm'.padEnd(11), 'nodesKnown'.padStart(11), 'libDepth'.padStart(9), 'capital fp'.padStart(11), 'libMult'.padStart(8), 'pop'.padStart(7), 'peakPop'.padStart(8)].join(' ')}\n`,
);
for (const [armId, rows] of byArm) {
  const capital = mean(rows.map((r) => r.capitalContribution));
  process.stdout.write(
    `${[
      armId.padEnd(11),
      mean(rows.map((r) => r.nodesKnown)).toFixed(1).padStart(11),
      mean(rows.map((r) => r.libraryDepth)).toFixed(1).padStart(9),
      capital.toFixed(1).padStart(11),
      (1 + capital / 1024).toFixed(3).padStart(8),
      mean(rows.map((r) => r.population)).toFixed(0).padStart(7),
      mean(rows.map((r) => r.peakPopulation)).toFixed(0).padStart(8),
    ].join(' ')}\n`,
  );
}

// --- the deepest tier anyone reached ---------------------------------------
process.stdout.write('\ndeepest tier held at the horizon, mean over runs and species, and the max seen\n');
for (const [armId, rows] of byArm) {
  const all = rows.flatMap((r) => Object.values(r.deepestTierBySpecies));
  process.stdout.write(
    `  ${armId.padEnd(11)} mean ${mean(all).toFixed(2)}  max ${String(Math.max(...all))}\n`,
  );
}

// --- the control ratio a reader can check against #137 ----------------------
const control = byArm.get('v1');
if (control !== undefined) {
  process.stdout.write('\nslowdown against the v1 rectangle, per species (mean arrival ratio)\n');
  process.stdout.write(`${['arm'.padEnd(11), ...speciesNames.map((s) => s.slice(0, 8).padStart(10))].join(' ')}\n`);
  const baseline = Object.fromEntries(
    speciesNames.map((name) => {
      const observed = control.map((r) => r.arrivals[name]).filter((v) => v !== null);
      return [name, observed.length === 0 ? Number.NaN : mean(observed)];
    }),
  );
  for (const [armId, rows] of byArm) {
    const cells = speciesNames.map((name) => {
      const observed = rows.map((r) => r.arrivals[name]).filter((v) => v !== null);
      if (observed.length === 0) return 'censored'.padStart(10);
      return `${(mean(observed) / baseline[name]).toFixed(2)}x`.padStart(10);
    });
    process.stdout.write(`${[armId.padEnd(11), ...cells].join(' ')}\n`);
  }
  process.stdout.write(
    '\nA ratio computed only over uncensored runs is optimistic wherever censoring is\n' +
      'non-zero: the runs that never arrived are exactly the slow ones. Read it beside\n' +
      'the censoring table, never alone.\n',
  );
}

// --- per-species spread, for the reader who wants an error bar ---------------
process.stdout.write('\nbetween-run sd of arrival, uncensored runs only\n');
for (const [armId, rows] of byArm) {
  const parts = speciesNames.map((name) => {
    const observed = rows.map((r) => r.arrivals[name]).filter((v) => v !== null);
    return `${name.slice(0, 3)}=${observed.length < 2 ? '—' : sd(observed).toFixed(0)}`;
  });
  process.stdout.write(`  ${armId.padEnd(11)} ${parts.join(' ')}\n`);
}
