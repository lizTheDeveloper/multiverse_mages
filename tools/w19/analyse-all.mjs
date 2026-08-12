/*
 * Multiverse Mages — W19: run W15's analysis once per horizon, in parallel.
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
 * Fourteen invocations of `tools/w15/analyse.mjs --json`: seven horizons × two
 * pools. Each computes four Jacobi spectra over a Gram matrix that is 400 × 400
 * here where W15's was 96 × 96, so they are minutes apiece and there is no
 * reason to take them one at a time. Results are cached as
 * `.w19/analysis/h<H>-{all,v1}.json` and `summarise.mjs` reads them.
 *
 * **`v1` excludes the strategies that leave the v1 subset by permitting cells.**
 * Measured on this arm rather than assumed: taking the union of held nodes over
 * every seed and counting the ids outside the fifty-one, at a 1800-tick cap —
 *
 *     permissive-breadth   union 294   244 outside v1
 *     permit-then-idle     union 296   245 outside v1
 *     uniform-random-legal union  51     0 outside v1
 *     portal-rush          union  51     0 outside v1
 *     archivist            union  51     0 outside v1
 *     passive-control      union  51     0 outside v1
 *
 * So the exclusion is the two deliberate ruleset editors, and `uniform-random`
 * stays in. That is worth stating because it is **not** what the production arm
 * does: there the same bot reaches 62.1 nodes and does leave v1. The two arms
 * start from different cohort sizes and founding grants — this one uses W15's
 * two corner cells, the production sweep the reference defaults — and whether a
 * bot pressing random legal buttons ever opens a cell evidently depends on that.
 * Recorded as an observation, not chased.
 *
 * Excluding the two leaves **eight** strategies inside v1, against the seven W15
 * reported over; the extra one is `idle-then-declare`, which did not exist then.
 */

import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { HORIZONS } from './horizons.mjs';

const RULESET_EDITORS = 'permissive-breadth,permit-then-idle';

function runOne(dir, outFile, exclude) {
  return new Promise((resolve, reject) => {
    const argv = ['tools/w15/analyse.mjs', dir, 'strategyId', '--json'];
    if (exclude !== undefined) argv.push('--exclude', exclude);
    const sink = createWriteStream(outFile);
    const child = spawn(process.execPath, argv, { stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.pipe(sink);
    child.on('error', reject);
    child.on('exit', (code) => {
      sink.end();
      if (code === 0) resolve(outFile);
      else reject(new Error(`analyse ${outFile} exited ${String(code)}`));
    });
  });
}

async function main() {
  const root = process.argv[2] ?? '.w19/arm-a';
  const out = process.argv[3] ?? '.w19/analysis';
  mkdirSync(out, { recursive: true });

  const jobs = [];
  for (const ticks of HORIZONS) {
    const dir = join(root, `h${String(ticks)}`);
    jobs.push(runOne(dir, join(out, `h${String(ticks)}-all.json`), undefined));
    jobs.push(runOne(dir, join(out, `h${String(ticks)}-v1.json`), RULESET_EDITORS));
  }
  for (const done of await Promise.all(jobs)) process.stderr.write(`[w19] wrote ${done}\n`);
}

await main();
