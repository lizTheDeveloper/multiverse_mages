#!/usr/bin/env node
/*
 * Multiverse Mages — deliberate regeneration of the golden raid fixtures.
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
 * The explicit command for `packages/rules-raid/test/unit/fixtures/*.json`,
 * which `golden-raid.test.ts` compares byte-for-byte and never writes.
 *
 * Until now those fixtures had no regeneration command at all — the one that
 * exists, `npm run goldens:regen`, records `sim-core`'s step fixtures and does
 * not touch these. CLAUDE.md's fourth constraint is that a golden is
 * regenerated only by explicit command; this is that command, separate so that
 * `goldens:regen` keeps meaning exactly what it has always meant.
 *
 * It rebuilds each fixture's raid from the parameters already in the file —
 * seed, nodes, soldiers — and rewrites only the `outcome`. Everything a reviewer
 * should read is therefore in the `outcome` diff. A regenerated fixture is a
 * CLAIM THAT BEHAVIOUR CHANGED ON PURPOSE; say why in the commit.
 *
 * Requires a build (`npx tsc --build`): the fixture builder is TypeScript run
 * with type stripping, and it resolves `@mm/*` to `dist/`.
 *
 *   node --experimental-strip-types scripts/regen-raid-fixture.mjs [--check]
 *
 * `--check` writes nothing and exits `42` if any fixture would change, `0` if
 * none would, `1` if the probe broke.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runRaid } from '@mm/rules-raid';

const check = process.argv.includes('--check');
const dir = fileURLToPath(new URL('../packages/rules-raid/test/unit/fixtures/', import.meta.url));
const { buildRaid } = await import(new URL('../packages/rules-raid/test/unit/raid-fixture.ts', import.meta.url).href);

const files = readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
if (files.length === 0) {
  console.error('BROKEN PROBE: no raid fixtures found.');
  process.exit(1);
}

let changed = 0;
for (const file of files) {
  const path = join(dir, file);
  const before = readFileSync(path, 'utf8');
  const fixture = JSON.parse(before);
  const built = buildRaid({
    raiderNodes: [...fixture.raiderNodes],
    hostNodes: [...fixture.hostNodes],
    withSoldiers: fixture.withSoldiers,
    seed: fixture.raidSeed,
  });
  // Through JSON first, so the outcome is exactly what the test serialises.
  const outcome = JSON.parse(JSON.stringify(runRaid(built.raid)));
  const after = `${JSON.stringify({ ...fixture, outcome }, null, 2)}\n`;
  if (after === before) {
    console.log(`  unchanged ${file}`);
    continue;
  }
  changed += 1;
  console.log(`  ${check ? 'WOULD UPDATE' : 'UPDATED'} ${file}`);
  if (!check) writeFileSync(path, after, 'utf8');
}

if (changed > 0) {
  console.log('\nA regenerated golden raid fixture is a CLAIM THAT BEHAVIOUR CHANGED ON PURPOSE.');
}
process.exit(check && changed > 0 ? 42 : 0);
