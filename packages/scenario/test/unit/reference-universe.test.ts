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

/** The v1 rectangle: four techniques × five forms (`contracts.md` §2.2). */
const V1_CELL_COUNT = 20;

const CONFIG = { worldTickCap: 24, options: { cohortSize: 4, foundingNodes: 4 } } as const;

/** One content resolution for the whole file. It is read-only. */
const content = referenceContent();

describe('the reference universe starts from shipped content', () => {
  it('permits exactly the twenty cells content flags v1, and no twenty-first', () => {
    const state = referenceScenario(content).scenario.create(0x0005_0001, CONFIG);
    const ruleset = readRulesetForObservation(state, findUniverse(state));

    const permitted: number[] = [];
    for (let cellId = 1; cellId <= GRID_CELL_COUNT; cellId += 1) {
      if (permits(ruleset, cellId)) permitted.push(cellId);
    }
    expect(permitted).toHaveLength(V1_CELL_COUNT);

    // And they are the twenty content named, not twenty of the same shape. A
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

/**
 * `foundingSpeciesMask` — the instrument W15 needed and the scenario did not
 * have.
 *
 * There was no founding-mix knob at all, so the campaign's D7 — *"varying the
 * founding species mix changes which strategy wins"* — could not be measured
 * even in principle. The first assertion is the one that matters most: the
 * default builds the **byte-identical** universe the scenario built before the
 * option existed, so nothing already measured moves.
 */
describe('the founding species mask selects who founds the universe', () => {
  const MASK_CONFIG = { worldTickCap: 4, options: { cohortSize: 4, foundingNodes: 4 } } as const;

  it('changes nothing when it is absent', () => {
    const before = referenceScenario(content).scenario.create(0x0005_0010, MASK_CONFIG);
    const explicit = referenceScenario(content).scenario.create(0x0005_0010, {
      ...MASK_CONFIG,
      options: { ...MASK_CONFIG.options, foundingSpeciesMask: 0 },
    });
    expect(snapshotHash(explicit)).toBe(snapshotHash(before));
  });

  it('seeds only the species whose bits are set', () => {
    const registry = shippedContent();
    const speciesCount = registry.species.length;
    expect(speciesCount).toBeGreaterThan(1);

    // Three seeded occupations per selected species, at this cohort size, plus
    // one founding mage each. Both counts are read out of the §4.1 observation
    // through the census rather than off the state.
    for (const [mask, selected] of [
      [0b1, 1],
      [0b11, 2],
      [(1 << speciesCount) - 1, speciesCount],
    ] as const) {
      const run = executeReferenceRun(
        {
          ...task(0, 0),
          worldTickCap: 12,
          levels: { cohortSize: 4, foundingSpeciesMask: mask },
        },
        { content, censusIntervalTicks: 12 },
      );
      const first = run.samples[0];
      expect(first?.population, `mask ${String(mask)} population`).toBe(selected * 3 * 4);
      expect(first?.livingMages, `mask ${String(mask)} mages`).toBe(selected);
    }
  });

  it('refuses a mask that selects nobody rather than running an empty universe', () => {
    const registry = shippedContent();
    expect(() =>
      referenceScenario(content).scenario.create(0x0005_0011, {
        ...MASK_CONFIG,
        options: { ...MASK_CONFIG.options, foundingSpeciesMask: 1 << registry.species.length },
      }),
    ).toThrow(/selects none of the/);
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
  it('produces a different universe depending on which strategy plays it', () => {
    // This assertion used to run the other way, and the comment on it said the
    // day `god-agency` landed the test would fail and that failing was how
    // anyone would find out the pool had started to differentiate. It did, and
    // this is that. Until the god's verbs had consequences, no system read
    // `ctx.actions`, every strategy produced a byte-identical universe, and the
    // 0.6.0 tournament was measuring the harness rather than the game.
    //
    // What is asserted now is the weakest honest form of the claim: **at least
    // two strategies reach different final states**. Not "all eight differ" —
    // two strategies whose legal moves happen to coincide on this seed are
    // entitled to agree, and a test demanding total separation would be a test
    // of the bot pool's diversity rather than of whether actions do anything.
    const base = task(1, 3);
    const outcomes = BOT_POOL_REGISTRY.ids.map((strategyId) =>
      executeReferenceRun({ ...base, strategies: [strategyId] }, { content }),
    );

    const first = outcomes[0];
    if (first === undefined) throw new Error('the bot pool is empty');

    const finalStates = new Set(outcomes.map((run) => JSON.stringify(run.outcome.metrics)));
    expect(finalStates.size).toBeGreaterThan(1);

    // The control, kept from the original: the strategies really are submitting
    // different things, so the difference above is a statement about the *rules*
    // acting on those submissions and not about eight different action logs
    // being replayed into one outcome.
    const submitted = new Set(
      outcomes.map((run) => JSON.stringify(run.outcome.accounting.byActionId)),
    );
    expect(submitted.size).toBeGreaterThan(1);
  });

  it('shelves what it writes, so library depth tracks the books rather than reading zero', () => {
    // **This test used to assert the opposite**, as a tripwire: the loop wrote
    // books and never shelved one, `shelveGrimoire` sat unused in `rules-magic`,
    // and the channel §7's `capitalSnowball` is pinned to read zero for as long
    // as a run lasted. Shelving has landed — a finished book goes to the library
    // of the university whose scriptorium produced it, argued in `gateway.ts` —
    // so the tripwire has done its job and this is now an assertion about the
    // behaviour it was waiting for.
    const run = executeReferenceRun(task(3, 2), { content, censusIntervalTicks: 12 });
    const last = run.samples[run.samples.length - 1];
    expect(last?.grimoires).toBeGreaterThan(0);
    // The channel is *distinct nodes shelved*, so it is bounded above by the
    // nodes the universe knows and far below the book count. Both bounds are
    // asserted rather than a magnitude: how deep a library gets is a balance
    // question and `release-plan.md` forbids answering one before 0.5.0.
    expect(last?.libraryDepth).toBeGreaterThan(0);
    expect(last?.libraryDepth).toBeLessThanOrEqual(last?.nodesKnown ?? 0);
  });

  it('writes many copies of few nodes, which is what the shelf now lets anyone see', () => {
    // The finding the previous test's number is worth reading for, recorded as
    // an assertion so it cannot quietly stop being true. This universe writes
    // hundreds of books and they are copies of a handful of nodes: the scribable
    // list is ordered by cost, so every mage picks the same cheap node, and
    // depth-as-breadth stays flat while the shelf fills.
    //
    // Not a defect of shelving, and **not a balance claim** — it is a statement
    // about what this build's utility-AI does, of the kind `libraryDependence`
    // exists to make visible. Recorded here because it was invisible while the
    // shelf was empty, and because the ratio is the thing a later tuning pass
    // will want to have watched from the beginning.
    const run = executeReferenceRun(task(3, 2), { content, censusIntervalTicks: 12 });
    const last = run.samples[run.samples.length - 1];
    if (last === undefined) throw new Error('no census was taken');
    expect(last.grimoires).toBeGreaterThan(last.libraryDepth);
  });
});

/** One task of the committed sweep, built the way the sweep itself builds it. */
function task(cellIndex: number, replicateIndex: number) {
  return taskFor(REFERENCE_SWEEP, REFERENCE_REGISTRIES, { cellIndex, replicateIndex });
}
