/*
 * Multiverse Mages — the scenario module W192's strategy sweep loads.
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
 * `packages/scenario/bin/scenario.mjs` with one thing changed: the content the
 * executor closes over carries this arm's opening square.
 *
 *     W192_ARM=named-4x6 node packages/mc-harness/bin/run-sweep.mjs \
 *       --scenario ./tools/w192/scenario.mjs \
 *       --sweep    ./tools/w192/strategies.sweep.json \
 *       --out      ./tools/w192/strategies-named-4x6 \
 *       --workers  6
 *
 * The registries are the shipped ones, so a sweep file here is validated
 * against the same metric, strategy and factor tables every other sweep is.
 */

import { URL } from 'node:url';
import process from 'node:process';

import {
  explicitOpeningAxes,
  foundingCandidates,
  makeReferenceExecutor,
  referenceContent,
  referenceProvenance,
  referenceScenario,
  REFERENCE_REGISTRIES,
} from '../../packages/scenario/dist/index.js';

import { armFromEnvironment } from './arms.mjs';

const arm = armFromEnvironment(process.env);
const base = referenceContent();
const axes = explicitOpeningAxes(base.registry, arm.techniqueIds, arm.formIds);
export const content = {
  ...base,
  axes,
  foundingNodeIds: foundingCandidates(base.registry, axes),
};

export const executor = makeReferenceExecutor({ content });
export const registries = REFERENCE_REGISTRIES;
export const provenance = referenceProvenance();
export const workerUrl = new URL('./worker.mjs', import.meta.url);

export const createScenario = () => referenceScenario(content).scenario;
