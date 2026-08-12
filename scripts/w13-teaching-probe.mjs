/*
 * Multiverse Mages — W13: how much teaching actually happens, per tradition.
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
 * The sweep pipeline cannot see teaching. `mc-harness`'s census samples standing
 * stocks every twelve ticks — nodes known, instances, grimoires, library depth —
 * and `metrics-census.ts` says so plainly: *"The census sees existence, not
 * events."* The only place a lesson is counted is `coordination`'s
 * `WorldStepReport.lessonsTaught`, which `contracts.md` §4.4 makes an explain
 * channel no rule may read back, and which only `long-run.ts` folds up.
 *
 * So this is a **second instrument**, not a second sweep. It drives the same
 * reference universe directly against `SimState` for 2400 ticks with **zero
 * actions**, which is the passive control and nothing else, and reports the four
 * flows per tradition. It measures no strategy. It changes nothing.
 *
 *     node scripts/w13-teaching-probe.mjs
 */

import {
  activityIn,
  referenceContent,
  runLongReference,
  windowsOf,
} from '../packages/scenario/dist/index.js';

const TRADITIONS = ['vancian-memorization', 'true-naming', 'art-of-memory'];

/** Common random numbers: the same eight run seeds under every tradition. */
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => 20260811 + n * 7919);

const TICKS = 2400;

const rows = [];
for (const tradition of TRADITIONS) {
  const content = referenceContent(undefined, tradition);
  for (const runSeed of SEEDS) {
    const result = await runLongReference({ content, runSeed, ticks: TICKS });
    // One window over the whole run, plus per-quarter, so a flow that dies early
    // is distinguishable from one that never started.
    const whole = activityIn({
      fromTick: result.ticks[0].worldTick,
      toTick: result.ticks[result.ticks.length - 1].worldTick,
      ticks: result.ticks,
    });
    const quarters = windowsOf(result, 50).map((w) => activityIn(w));
    rows.push({ tradition, runSeed, whole, quarters });
    process.stderr.write(`${tradition} seed ${runSeed}: lessons ${whole.lessonsTaught}\n`);
  }
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

console.log('## Flows per 2400-tick passive run, by tradition (n = 8, common seeds)\n');
console.log('| tradition | lessonsTaught | researchCompleted | grimoiresScribed | births | populaceDeaths |');
console.log('|---|---|---|---|---|---|');
for (const tradition of TRADITIONS) {
  const r = rows.filter((x) => x.tradition === tradition);
  const m = (k) => mean(r.map((x) => x.whole[k])).toFixed(1);
  console.log(
    `| ${tradition} | ${m('lessonsTaught')} | ${m('researchCompleted')} | ${m('grimoiresScribed')} | ` +
      `${m('births')} | ${m('populaceDeaths')} |`,
  );
}

console.log('\n## lessonsTaught by quarter of the run (mean of 8)\n');
console.log('| tradition | ticks 1-600 | 601-1200 | 1201-1800 | 1801-2400 |');
console.log('|---|---|---|---|---|');
for (const tradition of TRADITIONS) {
  const r = rows.filter((x) => x.tradition === tradition);
  const q = [0, 1, 2, 3].map((i) => mean(r.map((x) => x.quarters[i]?.lessonsTaught ?? 0)).toFixed(1));
  console.log(`| ${tradition} | ${q.join(' | ')} |`);
}
