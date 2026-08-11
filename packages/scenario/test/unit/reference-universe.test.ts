/*
 * Multiverse Mages — what the reference universe is at tick zero, and what it
 * does when it is stepped.
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
 * **Existence claims, not balance claims.** `release-plan.md` forbids a balance
 * claim before 0.5.0 and nothing here could support one: twenty-four ticks is
 * two world years, every magnitude in the content is untuned, and no god action
 * has any effect. What these tests assert is that a real universe *starts* and
 * *moves* — that the population, the mage roster and the node count are numbers
 * that change, and that two runs of the same seed are the same run.
 *
 * The census table one of them prints is the point of the exercise: a green
 * sweep over a universe that sits still is worth nothing, and the only way a
 * reader can tell the difference is to see the numbers.
 */

import { snapshotHash } from '@mm/sim-core';
import { GRID_CELL_COUNT, findUniverse, permits, readRulesetForObservation } from '@mm/state';
import { BOT_POOL_REGISTRY, taskFor } from '@mm/mc-harness';
import {
  REFERENCE_REGISTRIES,
  REFERENCE_SCENARIO_ID,
  REFERENCE_SWEEP,
  censusLine,
  executeReferenceRun,
  referenceContent,
  referenceScenario,
  shippedContent,
} from '@mm/scenario';
import { describe, expect, it } from 'vitest';

/** The v1 rectangle: three techniques × four forms (`contracts.md` §2.2). */
const V1_CELL_COUNT = 12;

const CONFIG = { worldTickCap: 24, options: { cohortSize: 4, foundingNodes: 4 } } as const;

/** One content resolution for the whole file. It is read-only. */
const content = referenceContent();

describe('the reference universe starts from shipped content', () => {
  it('permits exactly the twelve cells content flags v1, and no thirteenth', () => {
    const state = referenceScenario(content).scenario.create(0x0005_0001, CONFIG);
    const ruleset = readRulesetForObservation(state, findUniverse(state));

    const permitted: number[] = [];
    for (let cellId = 1; cellId <= GRID_CELL_COUNT; cellId += 1) {
      if (permits(ruleset, cellId)) permitted.push(cellId);
    }
    expect(permitted).toHaveLength(V1_CELL_COUNT);

    // And they are the twelve content named, not twelve of the same shape. A
    // rectangle of the right size in the wrong place would hold no v1 nodes.
    const registry = shippedContent();
    const v1CellIds = registry.cells
      .filter((entry) => entry.record.v1 === true)
      .map((entry) => entry.contentId)
      .sort((a, b) => a - b);
    expect(permitted).toEqual(v1CellIds);
  });

  it('seeds every shipped species, a founding academy, and knowledge somebody can teach', () => {
    const run = executeReferenceRun(task(0, 0), { content, censusIntervalTicks: 12 });
    const first = run.samples[0];
    expect(first).toBeDefined();

    const registry = shippedContent();
    // Three seeded occupations per species at the sweep's smallest cohort.
    expect(first?.population).toBe(registry.species.length * 3 * 4);
    expect(first?.livingMages).toBe(registry.species.length);
    // The founding grants, and nothing else: no research has completed yet.
    expect(first?.nodesKnown).toBeGreaterThan(0);
    expect(first?.knowledgeInstances).toBe(first?.nodesKnown);
  });

  it('names itself the same way in every record', () => {
    expect(referenceScenario(content).scenario.scenarioId).toBe(REFERENCE_SCENARIO_ID);
  });
});

describe('a reference run is a pure function of its seed and config', () => {
  it('builds a byte-identical tick-zero state twice', () => {
    const first = referenceScenario(content).scenario.create(0x0005_0002, CONFIG);
    const second = referenceScenario(content).scenario.create(0x0005_0002, CONFIG);
    expect(snapshotHash(second)).toBe(snapshotHash(first));
  });

  it('builds a different one from a different seed', () => {
    // The control. Founding personalities are rolled from the run seed, so two
    // replicates of one cell are two universes rather than one counted twice —
    // and without this assertion the equality above would also hold for a
    // scenario that ignored its seed entirely.
    const first = referenceScenario(content).scenario.create(0x0005_0002, CONFIG);
    const other = referenceScenario(content).scenario.create(0x0005_0003, CONFIG);
    expect(snapshotHash(other)).not.toBe(snapshotHash(first));
  });

  it('refuses a factor level of the wrong type instead of measuring the default', () => {
    expect(() =>
      referenceScenario(content).scenario.create(0x0005_0004, {
        worldTickCap: 4,
        options: { cohortSize: '12' },
      }),
    ).toThrow(/cohortSize/);
  });
});

describe('the universe does something when it is stepped', () => {
  it('grows, promotes, researches, and writes it down', () => {
    const run = executeReferenceRun(task(3, 0), { content, censusIntervalTicks: 6 });
    const first = run.samples[0];
    const last = run.samples[run.samples.length - 1];
    if (first === undefined || last === undefined) throw new Error('no census was taken');

    // Printed, not only asserted. A reader with the sweep in front of them can
    // see whether this universe pressed against anything or drifted.
    for (const sample of run.samples) console.log(censusLine(sample));

    expect(run.outcome.status).toBe('truncated');
    expect(run.outcome.ticksRun).toBe(REFERENCE_SWEEP.termination.worldTickCap);

    // Existence claims. Each would be zero if the loop were wired to something
    // that never fires, which is exactly what a green "it did not throw" hides.
    expect(last.livingMages).toBeGreaterThan(first.livingMages);
    expect(last.nodesKnown).toBeGreaterThan(first.nodesKnown);
    expect(last.knowledgeInstances).toBeGreaterThan(first.knowledgeInstances);
    expect(last.saturated).toEqual([]);
  });

  it('keeps somebody alive at every census, in every cell of the sweep', () => {
    // Across all four cells, not one: extinction is absorbing in this loop —
    // `deliverBirths` synthesises no founding population — so a cell that dies
    // out stays dead, and a test of one cell would not see it.
    for (let cellIndex = 0; cellIndex < 4; cellIndex += 1) {
      const run = executeReferenceRun(task(cellIndex, 1), { content, censusIntervalTicks: 12 });
      for (const sample of run.samples) {
        expect(sample.population).toBeGreaterThan(0);
        expect(sample.livingMages).toBeGreaterThan(0);
      }
    }
  });
});

describe('what this build cannot do, asserted rather than assumed', () => {
  it('produces the same universe whichever of the eight strategies plays it', () => {
    // Limit 1, made visible. No system reads `ctx.actions`, so a god's verbs
    // have no consequences and every strategy in the pool is measuring the same
    // universe. That is worth an assertion rather than a comment, because the
    // day `god-agency` lands this test fails — and it failing is how anyone
    // finds out that the pool has started to differentiate.
    const base = task(1, 3);
    const outcomes = BOT_POOL_REGISTRY.ids.map((strategyId) =>
      executeReferenceRun({ ...base, strategies: [strategyId] }, { content }),
    );

    const first = outcomes[0];
    if (first === undefined) throw new Error('the bot pool is empty');
    for (const run of outcomes) {
      expect(run.outcome.metrics).toEqual(first.outcome.metrics);
      expect(run.outcome.status).toBe(first.outcome.status);
      expect(run.outcome.ticksRun).toBe(first.outcome.ticksRun);
    }

    // The control: the strategies really are submitting different things, so
    // the equality above is a statement about the *rules* and not about eight
    // copies of the passive control.
    const submitted = new Set(
      outcomes.map((run) => JSON.stringify(run.outcome.accounting.byActionId)),
    );
    expect(submitted.size).toBeGreaterThan(1);
  });

  it('never shelves a grimoire, so library depth stays zero', () => {
    // A finding, recorded as a tripwire. `contracts.md` §7 measures
    // `libraryDependence` and `capitalSnowball` off library depth, and at this
    // build the world loop writes books and never shelves one: `shelveGrimoire`
    // exists in `rules-magic` and nothing in the tick calls it. So both metrics
    // would be measuring an empty shelf.
    //
    // **When shelving lands this test fails, and that is the point** — the note
    // above is what needs updating, not the assertion below.
    const run = executeReferenceRun(task(3, 2), { content, censusIntervalTicks: 12 });
    const last = run.samples[run.samples.length - 1];
    expect(last?.grimoires).toBeGreaterThan(0);
    expect(last?.libraryDepth).toBe(0);
  });
});

/** One task of the committed sweep, built the way the sweep itself builds it. */
function task(cellIndex: number, replicateIndex: number) {
  return taskFor(REFERENCE_SWEEP, REFERENCE_REGISTRIES, { cellIndex, replicateIndex });
}
