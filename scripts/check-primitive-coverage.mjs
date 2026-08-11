#!/usr/bin/env node
/*
 * Multiverse Mages — CI entry point for the primitive-coverage check.
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
 * A shell over `checkPrimitiveCoverage`, which is where the logic lives so the
 * unit tests can exercise it — including its failure paths — without a build
 * step. Run `npm run typecheck` (which is `tsc --build`) before this, or
 * `npm run verify`, which orders them. `packages/content/bin/validate-content.mjs`
 * is the same shape for the same reason.
 *
 * Usage:
 *
 *     node scripts/check-primitive-coverage.mjs            # shipped content
 *     node scripts/check-primitive-coverage.mjs <dataDir>  # any content set
 *
 * The optional directory exists so the *failing* path is reachable from a shell
 * as well as from a test. A check nobody has watched fail is not a check, and
 * the only honest way to watch this one fail is to point it at content with a
 * primitive missing — or with one of the declared exclusions covered.
 *
 * It prints what is exercised on success as well as on failure. The exercised
 * list with node counts is the thing a reviewer compares against the content
 * diff in front of them; a check that speaks only when angry gives nobody a way
 * to see coverage shrinking one primitive at a time.
 */

import process from 'node:process';

import { directorySource, loadContent, shippedDataDirectory } from '../packages/content/dist/index.js';
import {
  checkPrimitiveCoverage,
  formatPrimitiveCoverageReport,
} from '../packages/rules-magic/dist/effects/index.js';

const [directoryArgument] = process.argv.slice(2);
const directory = directoryArgument ?? shippedDataDirectory();

let registry;
try {
  registry = loadContent(directorySource(directory));
} catch (error) {
  console.error(`Primitive coverage check could not load content from ${directory}:\n`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const report = checkPrimitiveCoverage(registry);
const text = formatPrimitiveCoverageReport(report);

if (report.ok) {
  console.log(text);
} else {
  console.error(text);
  console.error(
    '\nCoverage is asserted over primitives rather than over nodes because that is where the\n' +
      'balance harness has enough samples to be truthful. An unexercised primitive has none.\n',
  );
  process.exit(1);
}
