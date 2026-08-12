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
 * **`v1` excludes the three strategies that leave the v1 subset by permitting
 * cells.** Two are deliberate — `permissive-breadth` and `permit-then-idle` —
 * and the third is not: `uniform-random-legal` submits random *legal* actions,
 * which includes `permitTechnique` and `permitForm`, and on this integrated tree
 * it reaches **62.1 nodes at 2400** against a v1 ceiling of 51. On W15's tree it
 * read 49.8 and stayed inside; that is a difference between the trees, not a
 * difference of opinion, and leaving it in would put a ruleset editor inside a
 * comparison labelled "inside the v1 ruleset".
 *
 * Excluding all three leaves **seven** strategies, which is also the size of the
 * pool W15 reported its v1 numbers over — so the two measurements compare.
 */

import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { HORIZONS } from './horizons.mjs';

const RULESET_EDITORS = 'permissive-breadth,permit-then-idle,uniform-random-legal';

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
