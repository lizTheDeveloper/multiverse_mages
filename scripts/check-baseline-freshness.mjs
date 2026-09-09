#!/usr/bin/env node
/*
 * Multiverse Mages — does every committed baseline name the content it was taken on?
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
 * ## Why this is cheap and the gates are not
 *
 * The three Monte Carlo balance gates left `npm run verify` on **2026-08-14**
 * with a good argument: they were the entire cost of checking a commit, the
 * self-hosted runner serialises, and during a campaign every commit is
 * sweep-bearing, so they queued every unrelated pull request behind a number
 * that was moving on purpose. `ci.yml`'s `balance` job carries that argument.
 *
 * **Two days later all four baselines were stale.** `main`'s content revision
 * had moved to `8681bf84` while every baseline still named `0dfdd5ef` or
 * older, and `Balance gates (non-blocking)` was red for `baseline-invalid`
 * rather than for a regression. Nobody had done anything wrong: a red pull
 * request is what used to force a re-record, and there are no red pull requests
 * when the gate does not block.
 *
 * The split was right and the consequence was not intended. **Moving a gate off
 * the blocking path does not reduce it to "runs less often" — it removes the
 * only thing that was maintaining its baseline.**
 *
 * So this restores the forcing function without restoring the cost. Running a
 * sweep is minutes; asking whether a baseline still names the current content
 * revision is a file read and a string compare. It answers a strictly weaker
 * question than the gate — *"is this baseline about this build"*, never *"did a
 * metric move"* — and that weaker question is the one that went unanswered for
 * two days.
 *
 * ## What it does not do
 *
 * It does not re-record, and nothing here may. `regenerate-baseline.mjs` and
 * `reseal-baseline.mjs` are the only two things that write a baseline and
 * neither may be reachable from CI, which `baseline-regeneration.test.ts` and
 * `baseline-reseal.test.ts` both assert. This only reports.
 *
 * ## Exits
 *
 *   0   every baseline names the current content revision
 *  42   at least one is stale — the answer is "yes", not an error
 *   1   the probe could not answer
 *
 * The third exit is the point, and this repository has five recorded instances
 * of a checker that folded *"I could not tell"* into *"the answer is no"*.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/*
 * The directory is an argument so the checker can be given a **positive
 * control** — a baseline it must accept. `CLAUDE.md` records five checkers that
 * reported the negative case confidently and were never shown accepting
 * anything; one that can only be pointed at the real tree is untestable by
 * construction, and this one exists precisely because an untested assumption
 * went unnoticed for two days.
 */
const [dirArgument] = process.argv.slice(2);
const baselineDir = dirArgument ?? join(root, 'balance', 'baselines');

const broken = (message) => {
  process.stderr.write(`PROBE BROKEN: ${message}\n`);
  process.exit(1);
};

/*
 * The revision is read from the loader rather than from the pinned literal in
 * `interning.test.ts`. The literal is a *claim about* the content and this needs
 * the content itself — reading the claim would make a stale test and a stale
 * baseline agree with each other and pass.
 */
let currentRevision;
try {
  const { loadContent, shippedContentSource } = await import('../packages/content/dist/index.js');
  currentRevision = loadContent(shippedContentSource()).contentRevision;
} catch (error) {
  broken(
    `could not load the shipped content: ${String(error?.message ?? error)}. ` +
      'This reads `packages/content/dist`, so an unbuilt tree cannot answer — run `npx tsc --build`.',
  );
}
if (typeof currentRevision !== 'string' || currentRevision.length === 0) {
  broken('the loader returned no contentRevision');
}

let files;
try {
  files = readdirSync(baselineDir).filter((name) => name.endsWith('.baseline.json'));
} catch (error) {
  broken(`could not read ${baselineDir}: ${String(error?.message ?? error)}`);
}
if (files.length === 0) broken(`no baselines found in ${baselineDir}`);

process.stdout.write(`Shipped content revision: ${currentRevision}\n\n`);

const stale = [];
for (const name of files.sort()) {
  let recorded;
  try {
    const parsed = JSON.parse(readFileSync(join(baselineDir, name), 'utf8'));
    recorded = parsed?.provenance?.contentHash;
  } catch (error) {
    broken(`could not parse ${name}: ${String(error?.message ?? error)}`);
  }
  /*
   * `provenance.contentHash` is the content revision. The **top-level**
   * `contentHash` is a tamper seal over the file's own fields and is a
   * different number entirely — two baselines with different seals can hold
   * identical provenance, and reasoning from the wrong one produces confident
   * nonsense. `CLAUDE.md` records that trap; this reads the right field and
   * refuses rather than guessing if it is absent.
   */
  if (typeof recorded !== 'string' || recorded.length === 0) {
    broken(`${name} has no provenance.contentHash`);
  }
  if (recorded === currentRevision) {
    process.stdout.write(`  ok     ${name}\n`);
  } else {
    process.stdout.write(`  STALE  ${name}  ${recorded}\n`);
    stale.push(name);
  }
}

process.stdout.write('\n');
if (stale.length === 0) {
  process.stdout.write(`All ${String(files.length)} baseline(s) name the current content revision.\n`);
  process.exit(0);
}

process.stdout.write(
  `${String(stale.length)} of ${String(files.length)} baseline(s) were taken on different content.\n\n` +
    'A gate whose baseline names another revision reports `baseline-invalid` and compares\n' +
    'nothing: across two builds a delta is not a regression, it is a category error. So the\n' +
    'gate is not currently measuring these, whatever colour it prints.\n\n' +
    'Re-record with `packages/mc-harness/bin/regenerate-baseline.mjs` and a written rationale,\n' +
    'or re-seal with `reseal-baseline.mjs` if the content moved and no metric did. Neither is\n' +
    'reachable from CI and neither may become so — a re-record is a claim that behaviour changed\n' +
    'on purpose, and it needs a person to make it.\n',
);
process.exit(42);
