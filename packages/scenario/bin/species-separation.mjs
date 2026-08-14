/*
 * Multiverse Mages — the cross-seed spread on a species-separation claim.
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
 * The instrument. Run it before reporting that species separate.
 *
 *     npm run typecheck            # this loads dist/
 *     node packages/scenario/bin/species-separation.mjs --sets 12 --tier 3
 *
 * Options, all optional:
 *
 * | flag | default | meaning |
 * |---|---|---|
 * | `--sets N` | 12 | independent seed sets. More sets is how you buy power. |
 * | `--seeds-per-set N` | 6 | **leave this alone** — see `SEEDS_PER_SET`. |
 * | `--tier N` | 3 | the tier arrivals are measured at |
 * | `--ticks N` | 720 | horizon, in world ticks |
 * | `--chain a,b,c` | `gnome,dwarf,human,elf` | the claimed ordering to judge |
 * | `--pair a,b` | — | repeatable; judges one ordered pair |
 * | `--no-legacy` | — | skip the calibration set |
 * | `--json` | — | emit the whole report as JSON on stdout |
 *
 * A run is about three seconds, so the default design is roughly four minutes.
 * Progress goes to stderr and the report to stdout, so `> report.txt` keeps the
 * progress visible.
 *
 * ## The calibration set is printed first, and it is the point
 *
 * Before any verdict, this prints the six seeds
 * `reference-time-to-tier.test.ts` has always used. If those intervals do not
 * match the numbers committed in that file's docstring, the instrument is wrong
 * and nothing below it is worth reading. Checking that first is cheap and
 * skipping it has already cost this project two wrong findings.
 */

import process from 'node:process';

import {
  LEGACY_SEED_SET,
  SEPARATION_HORIZON_TICKS,
  chainVerdictOf,
  formatPairSeparation,
  formatSeparationReport,
  measureSeedSet,
  measureSpeciesSeparation,
  referenceContent,
  separationOf,
  separationSpeciesIds,
} from '../dist/index.js';

/** The claim #140 makes, and the default thing to judge. */
const DEFAULT_CHAIN = ['gnome', 'dwarf', 'human', 'elf'];

/** @returns {Map<string, string[]>} */
function parseArgv(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    const value = next === undefined || next.startsWith('--') ? '' : next;
    const existing = options.get(key) ?? [];
    existing.push(value);
    options.set(key, existing);
    if (value !== '') index += 1;
  }
  return options;
}

function integer(options, key, fallback) {
  const raw = options.get(key)?.[0];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`--${key} must be a positive integer, received ${raw}`);
  }
  return value;
}

function assertKnownSpecies(names, known) {
  for (const name of names) {
    if (!known.includes(name)) {
      throw new RangeError(`unknown species ${name}. Known: ${known.join(', ')}`);
    }
  }
}

const options = parseArgv(process.argv.slice(2));
const tier = integer(options, 'tier', 3);
const sets = integer(options, 'sets', 12);
const seedsPerSet = integer(options, 'seeds-per-set', 6);
const ticks = integer(options, 'ticks', SEPARATION_HORIZON_TICKS);
const content = referenceContent();
const known = separationSpeciesIds(content);

const chain = (options.get('chain')?.[0] ?? DEFAULT_CHAIN.join(',')).split(',').filter(Boolean);
assertKnownSpecies(chain, known);
const pairs = (options.get('pair') ?? []).map((raw) => raw.split(',').filter(Boolean));
for (const pair of pairs) assertKnownSpecies(pair, known);

const out = [];
const say = (line) => {
  out.push(line);
};

if (!options.has('no-legacy')) {
  process.stderr.write(`calibrating against the legacy six seeds…\n`);
  const legacy = await measureSeedSet({
    label: 'legacy',
    runSeeds: LEGACY_SEED_SET,
    tier,
    ticks,
    content,
  });
  say(
    `calibration — the six seeds reference-time-to-tier.test.ts has always used, tier ${tier}:`,
  );
  for (const sample of legacy.species) {
    say(
      sample.low === undefined
        ? `  ${sample.speciesId.padEnd(9)} censored in all ${sample.censored} seeds`
        : `  ${sample.speciesId.padEnd(9)} [${sample.low}, ${sample.high}]` +
            (sample.censored > 0 ? `  (${sample.censored} censored)` : ''),
    );
  }
  say('');
  say('If those do not match the committed docstring, stop: the instrument is wrong.');
  say('');
}

const started = Date.now();
const report = await measureSpeciesSeparation({
  tier,
  sets,
  seedsPerSet,
  ticks,
  content,
  onSet: (_sample, index, total) => {
    const elapsed = Math.round((Date.now() - started) / 1000);
    process.stderr.write(`  set ${index + 1}/${total} done (${elapsed}s elapsed)\n`);
  },
});

if (options.has('json')) {
  process.stdout.write(`${JSON.stringify({ report, chain }, null, 2)}\n`);
  process.exit(0);
}

for (const line of formatSeparationReport(report)) say(line);
say('');
say('adjacent pairs of the claimed chain:');
const verdict = chainVerdictOf(report, chain);
for (const link of verdict.links) say(`  ${formatPairSeparation(link)}`);
say('');
say(`chain ${chain.join(' < ')}: ${verdict.verdict.toUpperCase()}`);
say(`  ${verdict.reason}`);

for (const pair of pairs) {
  say('');
  say(`  ${formatPairSeparation(separationOf(report, pair[0], pair[1]))}`);
}

say('');
say('every ordered pair, by paired standard errors:');
for (const faster of report.speciesIds) {
  for (const slower of report.speciesIds) {
    if (faster === slower) continue;
    const pair = separationOf(report, faster, slower);
    if (!(pair.meanGap > 0)) continue;
    say(`  ${formatPairSeparation(pair)}`);
  }
}

process.stdout.write(`${out.join('\n')}\n`);
