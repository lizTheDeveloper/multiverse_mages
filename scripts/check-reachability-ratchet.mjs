#!/usr/bin/env node
/*
 * Multiverse Mages — the reachability ratchet: no new findings, and no lost
 * progress record.
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
 * ## The problem this solves, which is not detection
 *
 * `scripts/check-reachability.mjs` works. It reported `completeAffiliation` as
 * having no production caller long before four separate investigations each
 * independently rediscovered that universities are built and never staffed. The
 * check knew. Nobody could tell.
 *
 * That is what a permanently red non-blocking check costs: **a red check with a
 * standing backlog carries no information.** One hundred and twenty-five
 * findings and a hundred and twenty-sixth look identical from the outside, so
 * the only reader who learns anything is one who already read the previous run
 * and remembers it. Nobody does that, which is why the CI job's own comment
 * says it "is expected to be RED".
 *
 * So this wrapper converts the standing count into a **pinned set** and asks a
 * question that has a useful answer on a red tree:
 *
 * > Is the set of findings exactly the set we already knew about?
 *
 * A tree with 125 pinned findings and no others passes. A tree with a 126th
 * fails, at the finding, by name. That makes the check meaningful today rather
 * than after somebody fixes a hundred-odd symbols.
 *
 * ## Why disappearance is also a failure
 *
 * The obvious ratchet fails only upward: new finding, red; fixed finding, green
 * and silent. That version quietly loses its own progress record — the baseline
 * drifts into a list of things that used to be true, and the day someone
 * *re*-introduces a finding that had been fixed, it is already pinned and the
 * gate says nothing.
 *
 * Worse, it is exactly the failure mode that pinning by count alone has: one
 * fixed and one introduced nets to zero. So a pinned finding that is no longer
 * reported fails too, and the fix is one command:
 *
 *     npm run reachability:pin
 *
 * A ratchet that ratchets in one direction only is a ratchet with no pawl.
 *
 * ## Finding identity, and what is deliberately not part of it
 *
 * A finding is keyed on **group, file and symbol name**. Not the line: CLAUDE.md
 * records that a rotted line number is the cheapest available signal that a
 * documented row is stale, which is precisely an argument against making one
 * load-bearing. Keying on the line would fire this gate on every unrelated edit
 * above a pinned symbol, and a gate that cries wolf gets its baseline
 * regenerated on reflex.
 *
 * The *group* matters more than it looks. `unreached` and
 * `reachedOnlyByUnreached` are one group, and `unconsumedConstants` and
 * `constantsBehindDeadCode` are one group, because a symbol moves between the
 * members of a pair when *other* code changes. Delete a dead function and
 * everything it called drops from "reached only by unreached" into "unreached".
 * If the category were part of the key, a cleanup would read as
 * `1 new finding, 1 resolved` — a lie about a repair, and the fastest possible
 * way to teach a reader to stop believing the gate. It is reported instead as a
 * third class, `moved`, which still requires a re-pin because the baseline
 * should record where a finding is now.
 *
 * ## Three exits, because "no" and "I could not tell" are different answers
 *
 *     0   no drift: the reported findings are exactly the pinned ones
 *     42  drift: a new finding, a resolved finding, or one that changed group
 *     1   the probe is broken: the answer is unknown, not "no"
 *
 * `scripts/w117-gate-check.sh` is the model, and CLAUDE.md's rule is the reason:
 * *when a check reports the negative case, confirm the check works before
 * believing it.* The specific accident this guards against is the one the repo
 * has five recorded instances of — an aggregator that answers confidently about
 * the wrong input. Point the underlying check at a tree whose rules-path
 * packages exist but are nearly empty and every pinned finding "disappears";
 * without a floor on how much was actually scanned, this wrapper would report a
 * hundred and twenty-five repairs. The floors below are that positive control,
 * and breaching one exits 1, never 42.
 *
 * Note that the child exiting **1 is normal**: `check-reachability.mjs` exits 1
 * whenever it has findings, which on this tree is always. Only a status outside
 * `{0, 1}`, or output that is not the expected JSON, means the probe broke.
 *
 * ## Usage
 *
 *     node scripts/check-reachability-ratchet.mjs                  # gate
 *     node scripts/check-reachability-ratchet.mjs --update         # re-pin
 *     node scripts/check-reachability-ratchet.mjs <root>           # another tree
 *     node scripts/check-reachability-ratchet.mjs --baseline <path>
 *
 * `<root>` and `--baseline` exist for the reason `check-purity.mjs` gives for
 * its own root argument, doubled: with both hard-coded, neither the failing nor
 * the passing branch is reachable from a test, and a gate nobody has watched
 * both fail *and* pass is not a gate. They are what lets
 * `reachability-ratchet.test.ts` produce all three exits deterministically on
 * throwaway trees instead of on this one.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** Exit 42, not 1: "findings drifted" is an answer, "the probe broke" is not. */
const EXIT_DRIFT = 42;
const EXIT_BROKEN = 1;

const CHECK_SCRIPT = fileURLToPath(new URL('./check-reachability.mjs', import.meta.url));
const DEFAULT_BASELINE = fileURLToPath(new URL('./reachability-baseline.json', import.meta.url));

/**
 * How much of the scan may vanish before this is a broken probe rather than a
 * repair.
 *
 * Deleting a package legitimately drops both counts, so an exact floor would
 * fire on honest cleanups; a root that resolves to the wrong tree drops them off
 * a cliff. Twenty percent separates those two cases with room to spare, and the
 * derived numbers are written into the baseline in full so a reader never has to
 * recompute this to know what the gate is holding.
 */
const SCAN_FLOOR_FRACTION = 0.8;

// ---------------------------------------------------------------------------
// Arguments.
// ---------------------------------------------------------------------------

function parseArguments(argv) {
  let baselinePath = DEFAULT_BASELINE;
  let update = false;
  let root; // `undefined` means "do not pass one", which is not the same as "."
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--update') {
      update = true;
    } else if (argument === '--baseline') {
      baselinePath = argv[index + 1];
      index += 1;
      if (baselinePath === undefined) throw new Error('--baseline needs a path.');
    } else if (argument.startsWith('--')) {
      throw new Error(`Unknown option ${argument}.`);
    } else {
      root = argument;
    }
  }
  return { baselinePath, update, root };
}

// ---------------------------------------------------------------------------
// Running the underlying check.
// ---------------------------------------------------------------------------

/**
 * The categories of the payload this wrapper understands, and the group each
 * belongs to.
 *
 * Naming every one explicitly is deliberate. A category added to
 * `check-reachability.mjs` and not added here would otherwise be silently
 * dropped — new findings of a whole new kind passing the gate by being
 * unrecognised — so an unknown key in the payload is a broken probe.
 */
const CATEGORIES = {
  orphanPackages: { group: 'package', identify: (entry) => ({ file: `packages/${entry}/`, name: entry }) },
  unreached: { group: 'symbol', identify: (entry) => ({ file: entry.file, name: entry.name, kind: entry.kind }) },
  reachedOnlyByUnreached: { group: 'symbol', identify: (entry) => ({ file: entry.file, name: entry.name }) },
  untouchedComponents: { group: 'component', identify: (entry) => ({ file: entry.file, name: entry.name }) },
  unconsumedConstants: { group: 'constant', identify: (entry) => ({ file: entry.file, name: entry.field, id: entry.id }) },
  constantsBehindDeadCode: {
    group: 'constant',
    identify: (entry) => ({ file: 'packages/coordination/src/god/constants.ts', name: entry.field, id: entry.id }),
  },
  staleExclusions: { group: 'exclusion', identify: (entry) => ({ file: entry.file, name: entry.symbol }) },
  closedExclusions: { group: 'exclusion', identify: (entry) => ({ file: entry.file, name: entry.symbol }) },
};

/** Every payload key that is context rather than a finding. */
const NON_FINDING_KEYS = new Set([
  'ok',
  'findingCount',
  'examinedSymbolCount',
  'examinedPackages',
  'productionFileCount',
  'structuralExclusions',
  'declaredExclusions',
  'excludedPackages',
]);

class BrokenProbe extends Error {}

function runCheck(root) {
  // No root argument means pass none. `check-reachability.mjs` compares its
  // resolved root against `DEFAULT_ROOT` by string to decide whether to audit
  // its own exclusion list, and a normalised path that points at the same
  // directory would fail that compare — silently switching off the exclusion
  // hygiene sub-check on every CI run.
  const arguments_ = root === undefined ? [CHECK_SCRIPT, '--json'] : [CHECK_SCRIPT, root, '--json'];
  const result = spawnSync(process.execPath, arguments_, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  if (result.error !== undefined) {
    throw new BrokenProbe(`Could not run the reachability check: ${result.error.message}`);
  }
  // 1 is the check's *normal* status: it exits 1 whenever it has findings, and
  // on this tree it always has findings. Anything else is a crash or a guard.
  if (result.status !== 0 && result.status !== 1) {
    throw new BrokenProbe(
      `The reachability check exited ${result.status}, which is neither 0 (clean) nor 1 (findings).\n` +
        `${result.stderr.trim()}`,
    );
  }

  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new BrokenProbe(
      'The reachability check did not emit JSON on stdout. First 400 characters:\n' +
        `${result.stdout.slice(0, 400)}`,
    );
  }

  for (const key of Object.keys(payload)) {
    if (NON_FINDING_KEYS.has(key) || key in CATEGORIES) continue;
    throw new BrokenProbe(
      `The reachability check reported an unrecognised finding category "${key}".\n` +
        'Add it to CATEGORIES in this script — an unknown category would otherwise pass this ' +
        'gate by being ignored, which is the one way a ratchet can silently stop ratcheting.',
    );
  }
  for (const key of Object.keys(CATEGORIES)) {
    if (Array.isArray(payload[key])) continue;
    throw new BrokenProbe(`The reachability check emitted no "${key}" array.`);
  }
  if (typeof payload.examinedSymbolCount !== 'number' || typeof payload.productionFileCount !== 'number') {
    throw new BrokenProbe('The reachability check emitted no scan counts.');
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Findings, keyed.
// ---------------------------------------------------------------------------

function findingsOf(payload) {
  const findings = [];
  for (const [category, spec] of Object.entries(CATEGORIES)) {
    for (const entry of payload[category]) {
      const identity = spec.identify(entry);
      findings.push({
        key: `${spec.group}:${identity.file}:${identity.name}`,
        group: spec.group,
        category,
        file: identity.file,
        name: identity.name,
        ...(identity.kind === undefined ? {} : { kind: identity.kind }),
        ...(identity.id === undefined ? {} : { id: identity.id }),
      });
    }
  }
  findings.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  return findings;
}

function baselineFrom(payload) {
  return {
    note:
      'Pinned reachability findings. Generated — do not hand-edit. Regenerate with ' +
      '`npm run reachability:pin` and explain the diff in the commit message: an entry ' +
      'removed is a repair, an entry added is a debt someone accepted.',
    scan: {
      examinedSymbolCount: payload.examinedSymbolCount,
      productionFileCount: payload.productionFileCount,
    },
    scanFloor: {
      examinedSymbolCount: Math.floor(payload.examinedSymbolCount * SCAN_FLOOR_FRACTION),
      productionFileCount: Math.floor(payload.productionFileCount * SCAN_FLOOR_FRACTION),
    },
    findingCount: payload.findingCount,
    findings: findingsOf(payload),
  };
}

function readBaseline(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new BrokenProbe(
      `No baseline at ${path}.\n` +
        'A missing baseline is not "no findings" — it is no answer. Create one with ' +
        '`npm run reachability:pin`.',
    );
  }
  let baseline;
  try {
    baseline = JSON.parse(text);
  } catch (error) {
    throw new BrokenProbe(`The baseline at ${path} is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(baseline.findings) || typeof baseline.scanFloor !== 'object' || baseline.scanFloor === null) {
    throw new BrokenProbe(`The baseline at ${path} has no "findings" array and "scanFloor" object.`);
  }
  return baseline;
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------

const PIN_COMMAND = 'npm run reachability:pin';

function describe(finding) {
  const suffix = finding.id === undefined ? '' : ` (content id \`${finding.id}\`)`;
  return `${finding.name}${suffix} — ${finding.file} [${finding.category}]`;
}

function main() {
  const { baselinePath, update, root } = parseArguments(process.argv.slice(2));
  const payload = runCheck(root);

  if (update) {
    const baseline = baselineFrom(payload);
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
    console.log(
      `Pinned ${baseline.findings.length} reachability finding(s) to ${baselinePath}.\n` +
        `Scanned ${payload.examinedSymbolCount} exported value(s) across ` +
        `${payload.productionFileCount} production source file(s).\n\n` +
        'Commit this with the change that moved it, and say which direction it moved.',
    );
    return 0;
  }

  const baseline = readBaseline(baselinePath);

  // The floor check comes *before* the diff, and exits 1 rather than 42. A tree
  // that was barely scanned makes every pinned finding look repaired; reporting
  // a hundred-odd repairs from a broken scan is the failure this whole third
  // exit exists for.
  const floorBreaches = [];
  for (const field of ['examinedSymbolCount', 'productionFileCount']) {
    const floor = baseline.scanFloor[field];
    if (typeof floor !== 'number') continue;
    if (payload[field] < floor) floorBreaches.push({ field, floor, actual: payload[field] });
  }
  if (floorBreaches.length > 0) {
    console.error('THE PROBE IS BROKEN — the reachability check scanned far less than the baseline records.\n');
    for (const breach of floorBreaches) {
      console.error(`  ${breach.field}: ${breach.actual}, floor ${breach.floor} (baseline ${baseline.scan?.[breach.field]})`);
    }
    console.error(
      '\nThis is NOT a report that findings were fixed. A scan this much smaller means the check ' +
        'looked at the wrong tree, or a rules-path package lost its sources. Find out which before ' +
        `running \`${PIN_COMMAND}\`, which would pin the broken answer.`,
    );
    return EXIT_BROKEN;
  }

  const current = findingsOf(payload);
  const currentByKey = new Map(current.map((finding) => [finding.key, finding]));
  const baselineByKey = new Map(baseline.findings.map((finding) => [finding.key, finding]));

  const added = current.filter((finding) => !baselineByKey.has(finding.key));
  const resolved = baseline.findings.filter((finding) => !currentByKey.has(finding.key));
  const moved = [];
  for (const finding of current) {
    const pinned = baselineByKey.get(finding.key);
    if (pinned !== undefined && pinned.category !== finding.category) {
      moved.push({ finding, from: pinned.category });
    }
  }

  if (added.length === 0 && resolved.length === 0 && moved.length === 0) {
    console.log(
      `Reachability ratchet HELD: ${current.length} finding(s), all of them pinned.\n\n` +
        `Scanned ${payload.examinedSymbolCount} exported value(s) across ` +
        `${payload.productionFileCount} production source file(s).\n` +
        'The underlying check is still red, and is meant to be. What this says is that it is red ' +
        'in exactly the ways already written down in scripts/reachability-baseline.json.',
    );
    return 0;
  }

  console.error('Reachability ratchet SLIPPED.\n');
  if (added.length > 0) {
    console.error(`${added.length} NEW finding(s) — not in the baseline:\n`);
    for (const finding of added) console.error(`  + ${describe(finding)}`);
    console.error(
      '\nEach of these is a symbol, component or constant that nothing outside a test calls.\n' +
        'Either wire it to its consumer, or delete it, or — if it is genuinely staged ahead of a\n' +
        `consumer — accept the debt by running \`${PIN_COMMAND}\` and saying so in the commit.\n`,
    );
  }
  if (resolved.length > 0) {
    console.error(`${resolved.length} pinned finding(s) NO LONGER REPORTED:\n`);
    for (const finding of resolved) console.error(`  - ${describe(finding)}`);
    console.error(
      '\nThis is good news that the gate still fails on, because a baseline nobody updates stops\n' +
        'being a record of progress and becomes a list of things that used to be true — and a\n' +
        'finding re-introduced later would already be pinned. Bank the repair:\n\n' +
        `    ${PIN_COMMAND}\n`,
    );
  }
  if (moved.length > 0) {
    console.error(`${moved.length} pinned finding(s) CHANGED CATEGORY:\n`);
    for (const { finding, from } of moved) console.error(`  ~ ${describe(finding)} (was ${from})`);
    console.error(`\nStill one finding, differently shaped. Re-pin with \`${PIN_COMMAND}\`.\n`);
  }
  console.error(
    `Baseline: ${baselinePath} — ${baseline.findings.length} pinned, ${current.length} reported.`,
  );
  return EXIT_DRIFT;
}

try {
  process.exit(main());
} catch (error) {
  if (error instanceof BrokenProbe) {
    console.error(`THE PROBE IS BROKEN — this is not a statement that there are no new findings.\n\n${error.message}`);
    process.exit(EXIT_BROKEN);
  }
  throw error;
}
