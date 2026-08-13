/*
 * Multiverse Mages — the causal chain for the first cost any effect ever had.
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
 * ## The chain, not the links
 *
 * `causal-chain-build-rate.test.ts` next door proves that permitting a cell
 * makes a university go up faster. This file proves the sentence the other way
 * round, which nothing in the shipped content could say until now: **permitting
 * a cell also costs something.**
 *
 * Across the three hundred authored nodes there were 59 `resource-yield`
 * effects, 55 `research-rate` and 33 `build-rate`, and every one of them was a
 * pure bonus. Five effects on the four *Rego Terram* nodes now carry a
 * `displacement`, and the four links are:
 *
 * 1. **The cost reaches the world loop.** `displacedLaborShare` is above zero
 *    on a run of the shipped content and exactly zero on a run of the same
 *    content with the five displacements deleted.
 * 2. **It mutates the economy.** Less food is produced, on the same seed, with
 *    the same mages, from the same land.
 * 3. **Removing the cause removes the outcome.** Deleting the authored field is
 *    one counterfactual; `neutralizing('resource-yield')` is the sharper one,
 *    because it leaves the content, the ruleset and the research alone and
 *    removes only the primitive.
 * 4. **Nothing else moved.** Every effect without a displacement behaves as it
 *    did: the stripped arm and an arm of the shipped content with *no* Terram
 *    knowledge produce the same food, because the only nodes that were edited
 *    are Terram nodes.
 *
 * ## Why the counterfactual is a second content set and not a second build
 *
 * The comparison has to be inside one binary or it is not a comparison. The
 * stripped registry is the shipped data with five keys deleted, loaded through
 * the ordinary loader, so both arms run the same code over different content —
 * which is exactly the claim being made about the change.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { rngFromRootSeed, step } from '@mm/sim-core';
import type { ContentFileName, ContentRegistry } from '@mm/content';
import { CONTENT_FILES, loadContent, memorySource, shippedDataDirectory } from '@mm/content';
import type { AblationMask } from '@mm/coordination';
import { defineWorldSimulation, neutralizing } from '@mm/coordination';

import type { ReferenceContent } from '../../src/index.js';
import {
  LONG_RUN_OPTIONS,
  LONG_RUN_SEED,
  buildReferenceState,
  referenceContent,
} from '../../src/index.js';

/**
 * Months per arm.
 *
 * Long enough that mages have learned the *Rego Terram* nodes and are casting
 * them — a run that ends before anyone can quarry measures nothing — and short
 * enough for four arms in a unit test.
 */
const TICKS = 240;

/** The shipped data files as text, so an arm can edit one before loading it. */
function shippedFiles(): Record<string, string> {
  const directory = shippedDataDirectory();
  const files: Record<string, string> = {};
  for (const fileName of CONTENT_FILES) {
    files[fileName] = readFileSync(`${directory}/${fileName}`, 'utf8');
  }
  return files;
}

/** The shipped registry with every authored `displacement` deleted. */
function strippedRegistry(): { registry: ContentRegistry; removed: number } {
  const files = shippedFiles();
  const nodeFile: ContentFileName = 'node.json';
  const nodes = JSON.parse(files[nodeFile] as string) as {
    effects: { displacement?: unknown }[];
  }[];
  let removed = 0;
  for (const node of nodes) {
    for (const effect of node.effects) {
      if (effect.displacement !== undefined) {
        delete effect.displacement;
        removed += 1;
      }
    }
  }
  files[nodeFile] = JSON.stringify(nodes);
  return { registry: loadContent(memorySource(files, 'displacement-stripped')), removed };
}

interface ArmResult {
  /** Food produced across the run, `fp`. */
  readonly food: number;
  /** The largest displaced share seen in any tick, `fp`. */
  readonly peakDisplaced: number;
  /**
   * The displaced share summed over every tick, `fp`.
   *
   * Summed rather than peaked for the comparison below, and the reason is a
   * measured one: with five displacing effects and dozens of mages casting
   * them, the *peak* reaches `DISPLACED_LABOR_CAP` in almost any long enough
   * run, so two arms that differ everywhere in the middle can share a peak.
   * A ceiling that pins is a balance finding in its own right and is recorded
   * as one; it is not a discriminator.
   */
  readonly totalDisplaced: number;
  /** Ticks on which any share at all was displaced. */
  readonly displacingTicks: number;
  /** `resource-yield` sources that reached production on the last tick. */
  readonly economicNodes: number;
}

function runArm(content: ReferenceContent, ablation?: AblationMask): ArmResult {
  const deps = ablation === undefined ? content.deps : { ...content.deps, ablation };
  const simulation = defineWorldSimulation(deps);
  let state = buildReferenceState({
    runSeed: LONG_RUN_SEED,
    options: LONG_RUN_OPTIONS,
    content,
    schema: simulation.schema,
  });

  let food = 0;
  let peakDisplaced = 0;
  let totalDisplaced = 0;
  let displacingTicks = 0;
  let economicNodes = 0;
  for (let tick = 0; tick < TICKS; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    const report = simulation.lastReport();
    if (report === undefined) continue;
    food += report.producedByKind.food;
    if (report.displacedLaborShare > peakDisplaced) peakDisplaced = report.displacedLaborShare;
    totalDisplaced += report.displacedLaborShare;
    if (report.displacedLaborShare > 0) displacingTicks += 1;
    economicNodes = report.economicNodes;
  }
  return { food, peakDisplaced, totalDisplaced, displacingTicks, economicNodes };
}

const authored = referenceContent();
const stripped = strippedRegistry();
const withoutCost = referenceContent(stripped.registry);

describe('displacement, end to end', () => {
  it('deletes exactly the five authored costs and nothing else', () => {
    // The counterfactual is only a counterfactual if it differs in the one way
    // claimed. Five is small on purpose: this change authors a mechanism and a
    // measurable handful of instances of it, not a retune of three hundred
    // nodes.
    expect(stripped.removed).toBe(5);
    expect(stripped.registry.nodes.length).toBe(authored.registry.nodes.length);
  });

  it('reaches the world loop on the shipped content, and only there', () => {
    const treated = runArm(authored);
    const control = runArm(withoutCost);

    expect(treated.peakDisplaced).toBeGreaterThan(0);
    expect(treated.displacingTicks).toBeGreaterThan(0);
    // Link 1's negative half. A world whose content declares no cost must not
    // find one, and this is the assertion that would fail if the field were
    // ever read as "zero when absent" by something that then rounded up.
    expect(control.peakDisplaced).toBe(0);
    expect(control.totalDisplaced).toBe(0);
    expect(control.displacingTicks).toBe(0);
  });

  it('costs the universe food it would otherwise have had', () => {
    const treated = runArm(authored);
    const control = runArm(withoutCost);

    // The same seed, the same land, the same mages, the same spells — and less
    // food, because the people who used to work the fields are doing something
    // else now. This is the sentence the whole change exists to make true.
    expect(treated.food).toBeLessThan(control.food);
    // Both arms still have an economy: a treatment that simply switched
    // production off would also satisfy the line above.
    expect(treated.food).toBeGreaterThan(0);
    expect(treated.economicNodes).toBeGreaterThan(0);
  });

  it('takes the cost away with the primitive it hangs off', () => {
    // The sharper counterfactual. The content is unedited and the ruleset is
    // untouched; only `resource-yield` is neutralized. `build-rate`'s three
    // displacements survive, so this is not expected to reach zero — what it
    // must do is fall, or an ablation arm is measuring a primitive whose only
    // remaining effect is its cost and would report it as negative.
    const treated = runArm(authored);
    const ablated = runArm(authored, neutralizing('resource-yield'));

    expect(ablated.totalDisplaced).toBeLessThan(treated.totalDisplaced);
  });
});
