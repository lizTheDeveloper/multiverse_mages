/*
 * Multiverse Mages — the university laboratory, from a terminal.
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
 * # Manual mode
 *
 * The question this exists to answer is the owner's, in their words: *"so we
 * can see if a university has increasing XYZ etc."*
 *
 *     node packages/rules-world/bin/university-lab.mjs axes
 *     node packages/rules-world/bin/university-lab.mjs run --scenario <file.json>
 *     node packages/rules-world/bin/university-lab.mjs trend --axis staffSize --of distinctNodes
 *     node packages/rules-world/bin/university-lab.mjs sweep --axes speciesMix,staffSize,stage
 *     node packages/rules-world/bin/university-lab.mjs record --sweep <name> [--fixtures <dir>]
 *     node packages/rules-world/bin/university-lab.mjs replay --sweep <name>
 *
 * **Run `npm run typecheck` first.** The workspace packages resolve through
 * `dist/`; the lab's own TypeScript is loaded directly by the resolve hook
 * below, which is the same fifteen lines `scripts/regen-goldens.mjs` uses and
 * for the same reason — a loader dependency in a measurement path is a
 * dependency that gets a vote on what the measurement says.
 *
 * ## Why this reaches into `test/`
 *
 * The lab is **not shipped**. It composes `rules-world`'s functions to observe
 * them and belongs in `dist/` no more than a test does; putting it in `src/`
 * would put a measurement harness in the simulation package and give
 * `check:reachability` a permanent finding. So the code lives beside the tests
 * that assert on it, and this file is the door.
 *
 * This is tooling, not simulation code: it may use Node built-ins.
 */

// Imported rather than taken as ambient globals, which is what every other
// `bin/` shell in this repository does — `mc-harness/bin/run-sweep.mjs` sets
// the convention. It is not decoration: the lint config gives no Node globals
// to `packages/*/bin/**`, so a bare `process` is an error rather than a
// portability hazard nobody notices.
import console from 'node:console';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL !== undefined &&
      specifier.endsWith('.js') &&
      (specifier.startsWith('./') || specifier.startsWith('../'))
    ) {
      const candidate = new URL(`${specifier.slice(0, -'.js'.length)}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

const LAB = new URL('../test/unit/university-lab.ts', import.meta.url);
const AXES = new URL('../test/unit/university-axes.ts', import.meta.url);
const SWEEPS = new URL('../test/unit/university-sweeps.ts', import.meta.url);

const { runLab, runSweep, worldFor } = await import(LAB.href);
const { ALL_AXES, AXIS_NAMES, crossSize } = await import(AXES.href);
const { COMMITTED_SWEEPS, sweepDigest } = await import(SWEEPS.href);

/**
 * The one directory a stray `--fixtures` may not silently become.
 *
 * `regen-goldens.mjs`'s rule, copied deliberately: *"the one directory a test
 * may never make it write to is this repository's."* `record` writes here by
 * default and anywhere else only when asked, and it says which.
 */
const COMMITTED_FIXTURES = fileURLToPath(new URL('../test/fixtures/university/', import.meta.url));

// ---------------------------------------------------------------------------
// argv
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

function flag(name, fallback) {
  const index = argv.indexOf(`--${name}`);
  if (index === -1 || index === argv.length - 1) return fallback;
  return argv[index + 1];
}

function fail(message) {
  console.error(message);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdAxes() {
  console.log('Axes. A new one is a row in test/unit/university-axes.ts.\n');
  for (const name of AXIS_NAMES) {
    const axis = ALL_AXES[name];
    const ids = axis.points.map((point) => point.id);
    const shown = ids.length > 8 ? `${ids.slice(0, 6).join(', ')}, … (${ids.length} total)` : ids.join(', ');
    console.log(`  ${name.padEnd(13)} ${String(ids.length).padStart(3)} points   ${shown}`);
  }
  console.log(`\nFull cross of every axis: ${crossSize(AXIS_NAMES).toLocaleString('en-US')} cells.`);
  console.log('\nCommitted sweeps:');
  for (const spec of COMMITTED_SWEEPS) {
    console.log(
      `  ${spec.name.padEnd(24)} axes=${spec.axes.join(',')} ` +
        `cross=${crossSize(spec.axes)} stride=${spec.stride ?? 1} ticks=${spec.ticks}`,
    );
  }
}

function cmdRun() {
  const path = flag('scenario');
  if (path === undefined) fail('run requires --scenario <file.json>');
  const scenario = JSON.parse(readFileSync(resolve(path), 'utf8'));
  const world = worldFor(scenario);
  const report = runLab(scenario);

  console.log(`# ${report.id}`);
  console.log(`\n## Inputs (the mocked world)\n`);
  console.log(
    `  openingTick ${world.openingTick}   stone ${world.stocks.stone}fp   ` +
      `vellum ${world.stocks.vellum}fp (+${world.income.vellum}/tick)   food ${world.stocks.food}fp (read by nothing)`,
  );
  console.log(`  crew        ${world.crew.map((c) => `${c.speciesId}×${c.months}mo`).join(', ') || '(none)'}`);
  console.log(`  cohorts     ${world.cohorts.length} (${world.cohorts.reduce((n, c) => n + c.count, 0)} people)`);
  console.log(`  residents   ${world.residents.length} mages`);
  console.log(`  shelf       ${world.seededNodes.length} nodes seeded`);
  console.log(`  ruleset     ${world.ruleset}   scribeQueue ${world.scribeQueue}`);

  console.log(`\n## Contains, after ${report.ticks} ticks\n`);
  for (const [key, value] of Object.entries(report.contains)) {
    console.log(`  ${key.padEnd(20)} ${render(value)}`);
  }
  console.log(`\n## Adds to the world\n`);
  for (const [key, value] of Object.entries(report.adds)) {
    console.log(`  ${key.padEnd(20)} ${render(value)}`);
  }

  const series = flag('series');
  if (series !== undefined) printSeries(report, series);
}

/**
 * *"Does a university with these professors show increasing X over N ticks?"*
 *
 * The command the ask names. Holds every axis at its first point, walks one
 * axis, and reports one output column against it — plus the increment between
 * consecutive points, because "increasing" is a statement about the difference
 * and reading it off two columns by eye is how a plateau gets called a trend.
 */
function cmdTrend() {
  const axisName = flag('axis', 'staffSize');
  const column = flag('of', 'distinctNodes');
  const ticks = Number(flag('ticks', '120'));
  const capacity = Number(flag('capacity', '40'));
  const axis = ALL_AXES[axisName];
  if (axis === undefined) fail(`no axis "${axisName}". Try: ${AXIS_NAMES.join(', ')}`);

  // Every other axis is pinned at its first point, **except `seededDepth`**,
  // which is left unset unless it is the axis being walked or is named
  // explicitly. `worldFor` lets a named `seededDepth` override the stage's
  // shelf — that is the whole reason the axis exists — so pinning it at `0`
  // alongside the others would silently empty the library of every stage and
  // make `--axis stage --of distinctNodes` report a flat zero. It did, before
  // this comment existed.
  const holds = {};
  for (const name of AXIS_NAMES) {
    if (name === axisName) continue;
    if (name === 'seededDepth') continue;
    holds[name] = ALL_AXES[name].points[0].id;
  }
  for (const name of AXIS_NAMES) {
    const named = flag(name);
    if (named !== undefined) holds[name] = named;
  }
  const overrides = {};

  console.log(`# ${column} against ${axisName}`);
  console.log(`  held: ${Object.entries(holds).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`  ticks: ${ticks}, capacity: ${capacity}\n`);
  console.log(`  ${axisName.padEnd(16)} ${column.padEnd(22)} Δ`);

  let previous;
  for (const point of axis.points) {
    const report = runLab({
      id: `${axisName}=${point.id}`,
      ticks,
      capacity,
      axes: { ...holds, [axisName]: point.id },
      ...(Object.keys(overrides).length === 0 ? {} : { overrides }),
    });
    const value = report.contains[column] ?? report.adds[column];
    if (value === undefined) {
      fail(
        `no column "${column}". contains: ${Object.keys(report.contains).join(', ')}\n` +
          `adds: ${Object.keys(report.adds).join(', ')}`,
      );
    }
    const delta = previous === undefined || typeof value !== 'number' ? '' : String(value - previous);
    console.log(`  ${point.id.padEnd(16)} ${render(value).padEnd(22)} ${delta}`);
    if (typeof value === 'number') previous = value;
  }
}

function cmdSweep() {
  const spec = specFromArgv();
  const started = Date.now();
  const result = runSweep(spec);
  const elapsed = Date.now() - started;
  console.log(
    `# ${result.name}: ${result.runs.length} runs of ${crossSize(spec.axes)} cells ` +
      `(stride ${result.stride}) in ${elapsed}ms\n`,
  );
  const column = flag('of');
  if (column === undefined) {
    summarise(result);
  } else {
    for (const report of result.runs) {
      const value = report.contains[column] ?? report.adds[column];
      console.log(`  ${report.id.padEnd(60)} ${render(value)}`);
    }
  }
}

/** Aggregates a sweep into the handful of lines a person can read. */
function summarise(result) {
  const numeric = ['distinctNodes', 'hosted', 'staffHeadcount', 'effectiveCapacity'];
  const flux = ['scribeMonthsTotal', 'stoneConsumed', 'vellumShortfall', 'seatsRefused', 'instancesDegraded'];
  console.log('  column                    min          max          distinct');
  for (const [group, columns] of [['contains', numeric], ['adds', flux]]) {
    for (const column of columns) {
      const values = result.runs.map((report) => report[group][column]).filter((v) => typeof v === 'number');
      if (values.length === 0) continue;
      const distinct = new Set(values).size;
      console.log(
        `  ${column.padEnd(24)} ${String(Math.min(...values)).padStart(10)} ` +
          `${String(Math.max(...values)).padStart(12)} ${String(distinct).padStart(12)}` +
          (distinct === 1 ? '   <- constant across the whole sweep' : ''),
      );
    }
  }
  const demands = new Set(result.runs.map((r) => r.adds.demand[1]));
  console.log(
    `\n  scribe demand across every run: ${[...demands].join(', ')} ` +
      `(${demands.size === 1 && demands.has(0) ? 'never non-zero' : 'varies'})`,
  );
}

function specFromArgv() {
  const named = flag('sweep');
  if (named !== undefined) {
    const found = COMMITTED_SWEEPS.find((spec) => spec.name === named);
    if (found === undefined) {
      fail(`no committed sweep "${named}". Known: ${COMMITTED_SWEEPS.map((s) => s.name).join(', ')}`);
    }
    return found;
  }
  const axes = (flag('axes') ?? 'staffSize,stage').split(',').filter(Boolean);
  for (const name of axes) if (!AXIS_NAMES.includes(name)) fail(`no axis "${name}"`);
  return {
    name: `ad-hoc(${axes.join(',')})`,
    axes,
    ticks: Number(flag('ticks', '120')),
    capacity: Number(flag('capacity', '40')),
    stride: Number(flag('stride', '1')),
  };
}

// ---------------------------------------------------------------------------
// Goldens in, goldens out
// ---------------------------------------------------------------------------

function fixturesDir() {
  const named = flag('fixtures');
  if (named === undefined) return COMMITTED_FIXTURES;
  const resolved = resolve(named);
  console.log(`Writing to ${resolved} — NOT the committed fixtures.\n`);
  return resolved;
}

function cmdRecord() {
  const spec = specFromArgv();
  const dir = fixturesDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${spec.name}.json`);
  const digest = sweepDigest(runSweep(spec));
  const text = `${JSON.stringify({ spec, digest }, null, 2)}\n`;
  const existed = existsSync(path);
  const previous = existed ? readFileSync(path, 'utf8') : undefined;
  writeFileSync(path, text, 'utf8');
  console.log(
    existed
      ? previous === text
        ? `unchanged  ${basename(path)}`
        : `UPDATED    ${basename(path)}  <- a fixture diff is a claim that behaviour changed on purpose`
      : `created    ${basename(path)}`,
  );
}

function cmdReplay() {
  const dir = fixturesDir();
  const named = flag('sweep');
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .filter((file) => named === undefined || file === `${named}.json`)
    .sort();
  if (files.length === 0) fail(`no fixtures in ${dir}${named === undefined ? '' : ` for "${named}"`}`);

  let failures = 0;
  for (const file of files) {
    const fixture = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const fresh = sweepDigest(runSweep(fixture.spec));
    const same = JSON.stringify(fresh) === JSON.stringify(fixture.digest);
    if (!same) failures += 1;
    console.log(`${same ? 'match     ' : 'DIFFERS   '} ${file}  (${fixture.spec.axes.join(',')})`);
    if (!same) {
      for (const [key, value] of Object.entries(fresh)) {
        const before = fixture.digest[key];
        if (JSON.stringify(before) !== JSON.stringify(value)) {
          console.log(`    ${key}: ${JSON.stringify(before)} -> ${JSON.stringify(value)}`);
        }
      }
    }
  }
  process.exit(failures === 0 ? 0 : 1);
}

// ---------------------------------------------------------------------------

function render(value) {
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== 0);
    return entries.length === 0 ? '{}' : entries.map(([k, v]) => `${k}=${v}`).join(' ');
  }
  return String(value);
}

function printSeries(report, column) {
  console.log(`\n## ${column}, per tick\n`);
  for (const entry of report.log) {
    if (entry[column] === undefined) fail(`no per-tick column "${column}"`);
    console.log(`  ${String(entry.tick).padStart(4)}  ${entry[column]}`);
  }
}

switch (command) {
  case 'axes':
    cmdAxes();
    break;
  case 'run':
    cmdRun();
    break;
  case 'trend':
    cmdTrend();
    break;
  case 'sweep':
    cmdSweep();
    break;
  case 'record':
    cmdRecord();
    break;
  case 'replay':
    cmdReplay();
    break;
  default:
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[1] ?? '');
    console.log(
      [
        'commands:',
        '  axes                                   list the axes and the committed sweeps',
        '  run    --scenario <file.json>          one university, both output halves',
        '  trend  --axis <name> --of <column>     does X increase along an axis, with the increment',
        '  sweep  --axes a,b,c [--of <column>]    cross the named axes',
        '  record --sweep <name> [--fixtures <d>] write a golden',
        '  replay [--sweep <name>]                check every golden. exit 1 on a difference',
      ].join('\n'),
    );
}
