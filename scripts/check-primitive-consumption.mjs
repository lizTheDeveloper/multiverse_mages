#!/usr/bin/env node
/*
 * Multiverse Mages — CI entry point for the primitive-consumption check.
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
 * A shell over `checkPrimitiveConsumption`, which is where the logic lives so
 * the unit tests can exercise it — including its failure paths — without a build
 * step. Run `npm run typecheck` (which is `tsc --build`) before this, or
 * `npm run verify`, which orders them. `scripts/check-primitive-coverage.mjs` is
 * the same shape for the same reason, and this check is its missing half.
 *
 * ## Coverage asks who *authored* a primitive; this asks who *consumes* one
 *
 * `check:coverage` loads the registry and counts nodes declaring each primitive.
 * That check passes today and every word of its output is true — and it is
 * fully compatible with the effect pipeline being connected to nothing, which
 * at the time of writing it is: `gatherEffects` and `stackContributions` have
 * zero production callers. So this check builds a real universe through
 * `@mm/scenario`'s composition root with a recorder threaded through it, and
 * asks whether each primitive's authored node effects reach anything the
 * assembled simulation holds.
 *
 * Building the universe is the mechanism, not incidental setup. Registration is
 * a side effect of *fetching node magnitudes*, so a primitive appears here only
 * if the code that assembles a running simulation actually asked for it. Grep
 * cannot do this job — searching production sources for `ward` returns
 * seventy-eight files, most of them matching *toward* and *forward*.
 *
 * Usage:
 *
 *     node scripts/check-primitive-consumption.mjs            # shipped content
 *     node scripts/check-primitive-consumption.mjs <dataDir>  # any content set
 *
 * The optional directory mirrors the coverage check's, and exists for the same
 * reason: a check nobody has watched fail is not a check.
 */

import process from 'node:process';

import { directorySource, loadContent, shippedDataDirectory } from '../packages/content/dist/index.js';
import {
  checkPrimitiveConsumption,
  createConsumptionRecorder,
  formatPrimitiveConsumptionReport,
} from '../packages/rules-magic/dist/effects/index.js';
import { scribingTraditionId, worldDeps } from '../packages/scenario/dist/content-set.js';

const [directoryArgument] = process.argv.slice(2);
const directory = directoryArgument ?? shippedDataDirectory();

let registry;
try {
  registry = loadContent(directorySource(directory));
} catch (error) {
  console.error(`Primitive consumption check could not load content from ${directory}:\n`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const recorder = createConsumptionRecorder();
try {
  // The return value is discarded on purpose. What is being measured is not the
  // deps object but what building it *asked the content for*, which the recorder
  // now holds. A universe assembled and thrown away is the cheapest honest way
  // to observe that.
  worldDeps(registry, scribingTraditionId(registry), recorder);
} catch (error) {
  console.error('Primitive consumption check could not assemble a universe from that content:\n');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const report = checkPrimitiveConsumption(registry, recorder);
const text = formatPrimitiveConsumptionReport(report);

if (report.ok) {
  console.log(text);
} else {
  console.error(text);
  console.error(
    '\nThis check is deliberately not satisfied by a primitive that something reads. The\n' +
      'question is whether what the academics *know* can change it, because a universe whose\n' +
      'god sets what magic can exist and whose mages then discover it is not simulating\n' +
      'anything if discovery moves no number. An authored effect on an unconsumed primitive\n' +
      'reads as a rule and behaves as a comment.\n',
  );
  process.exit(1);
}
