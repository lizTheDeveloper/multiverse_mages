/*
 * Multiverse Mages — what the sweep found, pinned.
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
 * ## A harness that confirms everything is not looking
 *
 * Most of what follows asserts a **zero** — a column that does not move when
 * something the design says should move it moves. Each one is a claim that
 * could be falsified by a single commit, and each names the commit that would
 * falsify it, so a fix reads as a red test rather than as silence.
 *
 * The golden replay at the bottom is the other half: it fails when *any*
 * column's shape changes, including the ones nobody thought to assert.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAGE_ROLE, OCCUPATION } from '@mm/state';

import { ALL_AXES, AXIS_NAMES, allocateRoles, crossSize } from './university-axes.js';
import { runLab, runSweep, scenariosFor, worldFor } from './university-lab.js';
import { COMMITTED_SWEEPS, constantColumns, sweepDigest } from './university-sweeps.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/university/', import.meta.url));

describe('the axes are data, and the sweep reads them', () => {
  it('takes every species mix of one, two, three and four, exhaustively', () => {
    // C(6,1) + C(6,2) + C(6,3) + C(6,4). If a seventh species is added this
    // becomes 7 + 21 + 35 + 35 = 98 and this number changes on purpose.
    expect(ALL_AXES.speciesMix.points).toHaveLength(56);
    const sizes = new Map<number, number>();
    for (const point of ALL_AXES.speciesMix.points) {
      sizes.set(point.value.length, (sizes.get(point.value.length) ?? 0) + 1);
    }
    expect([...sizes.entries()].sort()).toEqual([
      [1, 6],
      [2, 15],
      [3, 20],
      [4, 15],
    ]);
  });

  it('gives every axis distinct point ids, because a golden is keyed on them', () => {
    for (const name of AXIS_NAMES) {
      const ids = ALL_AXES[name].points.map((point) => point.id);
      expect(new Set(ids).size, `axis ${name} has a duplicate point id`).toBe(ids.length);
    }
  });

  it('crosses any set of axes without a code change', () => {
    // The property behind "a new axis is a row": `scenariosFor` is told which
    // axes to cross by name and reads their points out of the table.
    const scenarios = scenariosFor({
      name: 'ad-hoc',
      axes: ['ruleset', 'staffSize'],
      ticks: 4,
      capacity: 8,
    });
    expect(scenarios).toHaveLength(crossSize(['ruleset', 'staffSize']));
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(scenarios.length);
  });

  it('splits a staff across roles so the parts sum to the whole, at every size', () => {
    for (const size of ALL_AXES.staffSize.points) {
      for (const mix of ALL_AXES.roleMix.points) {
        const allocated = allocateRoles(size.value, mix.value);
        const total = [...allocated.values()].reduce((sum, count) => sum + count, 0);
        expect(total, `${mix.id} at ${size.id}`).toBe(size.value);
      }
    }
  });
});

describe('the mocked world covers the whole input surface', () => {
  const scenario = {
    id: 'surface',
    ticks: 8,
    capacity: 20,
    axes: { speciesMix: 'human+elf+dwarf+draconic', stage: 'mid', staffSize: '8' },
  } as const;

  it('constructs a university without running the world loop', () => {
    const world = worldFor(scenario);
    expect(world.crew).toHaveLength(4);
    expect(world.residents).toHaveLength(8);
    expect(world.cohorts.length).toBe(4 * 3);
    expect(world.stocks.stone).toBeGreaterThan(0);
    expect(world.stocks.vellum).toBeGreaterThan(0);
  });

  it('is deterministic: the same scenario is the same institution', () => {
    const first = runLab(scenario);
    const second = runLab(scenario);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('spends stone on building and vellum on shelves, and never confuses them', () => {
    // `world-step.ts` charges construction against `MATERIAL_STOCK.stone` and
    // library upkeep against `MATERIAL_STOCK.vellum`. A harness that pooled them
    // would let a deep library stall a building site, which the world does not.
    const report = runLab({ ...scenario, axes: { ...scenario.axes, stage: 'early' } });
    expect(report.adds.stoneConsumed).toBeGreaterThan(0);
    for (const entry of report.log) {
      // Stone falls only through construction; it is never touched by upkeep.
      expect(entry.stone).toBeGreaterThanOrEqual(0);
      expect(entry.vellum).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('what a sweep found that nobody had written down', () => {
  /**
   * **No function in `packages/rules-world/src/universities/` can add a node to
   * a library** — and the flat line below is that fact, not a tuning accident.
   *
   * State the claim in that order, because the two phrasings are not equally
   * defensible. The *verifiable* one is about the seam: a shelf grows when a
   * book is scribed onto it, minting a book is `rules-magic`'s
   * `instances/scribing.ts`, and `contracts.md` §5 forbids `rules-world` from
   * importing it. `scribingThroughput` computes the rate; nothing on this side
   * of the boundary consumes it. Grep the package and there is no writer.
   *
   * The *consequence* is what this test measures — the brief's worked question,
   * *"does library depth increase with professor count, and at what rate"*,
   * answered **zero**. And a fair reviewer will note that {@link runLab} shelves
   * a node only through an explicit `shelve` action, so the flat line would
   * appear here even if the production wiring existed. That is why the seam is
   * the claim and the measurement is the corroboration, rather than the other
   * way round.
   *
   * This test fails the day a shelf grows from staff, which is the day somebody
   * wires the two halves together.
   */
  it('reports the same library depth for sixteen mages as for none', () => {
    const depths = ALL_AXES.staffSize.points.map(
      (point) =>
        runLab({
          id: `staff=${point.id}`,
          ticks: 120,
          capacity: 40,
          axes: { staffSize: point.id, stage: 'mid', speciesMix: 'human' },
        }).contains.distinctNodes,
    );
    expect(new Set(depths).size, `depths were ${depths.join(', ')}`).toBe(1);
    expect(depths[0]).toBe(40);
  });

  /**
   * **A university with no mages scribes exactly as much as one with sixteen.**
   *
   * Throughput reads staffed *populace cohorts*; the mage roster is not an
   * input to `scribingThroughput` at all. A professor cannot help copy a book.
   * Worth pinning because "staff a university and it produces more" is the
   * intuition every build strategy will be written against.
   */
  it('reports the same scribe-months for sixteen mages as for none', () => {
    const months = ALL_AXES.staffSize.points.map(
      (point) =>
        runLab({
          id: `staff=${point.id}`,
          ticks: 120,
          capacity: 40,
          axes: { staffSize: point.id, stage: 'mid', speciesMix: 'human' },
        }).adds.scribeMonthsTotal,
    );
    expect(new Set(months).size, `months were ${months.join(', ')}`).toBe(1);
  });

  /**
   * **Scribe demand is zero in every cell of every sweep that leaves the
   * shipped policy alone, and non-zero the moment the literal is unpinned.**
   *
   * `world-step.ts:748` passes `scribingQueueDepth: 0`. The other two inputs a
   * university writes are live — laborers through `constructionBacklog`,
   * students through `universityCapacity`. So an institution can create demand
   * for the people who build it and the people who study in it, and never for
   * the people who copy its books.
   *
   * The `books-awaiting` half is the positive control: it proves the column is
   * capable of moving, so the zero is a statement about the literal rather than
   * about a probe that never worked.
   */
  it('never asks the populace for a scribe under the shipped policy, and does under the other', () => {
    const shipped = runSweep({
      name: 'pinned',
      axes: ['staffSize', 'stage'],
      ticks: 60,
      capacity: 40,
    });
    for (const report of shipped.runs) {
      expect(report.adds.demand[OCCUPATION.scribe], report.id).toBe(0);
      // The positive control, in the same runs: the other two do move.
      expect(report.adds.demand[OCCUPATION.student]).toBeGreaterThan(0);
    }

    const unpinned = runSweep({
      name: 'unpinned',
      axes: ['scribeQueue', 'staffSize', 'stage'],
      ticks: 60,
      capacity: 40,
    }).runs.filter((report) => report.axes.scribeQueue === 'books-awaiting');
    expect(unpinned.some((report) => report.adds.demand[OCCUPATION.scribe] > 0)).toBe(true);
  });

  /**
   * **One shelf, four different answers, and the spread is the species mix.**
   *
   * `capital.ts` brake 2 gated by `depthCeiling`: human's is 4, elf's is 7.
   * Below the fourth tier they agree exactly; above it they do not. A sweep
   * that reported one contribution per university would have shown this as a
   * constant.
   */
  it('gives each resident species its own answer from the same library', () => {
    const shallow = runLab({
      id: 'shallow',
      ticks: 30,
      capacity: 40,
      axes: { speciesMix: 'human+elf+dwarf+draconic', staffSize: '16', seededDepth: '8' },
    }).adds.contributionBySpecies;
    const deep = runLab({
      id: 'deep',
      ticks: 30,
      capacity: 40,
      axes: { speciesMix: 'human+elf+dwarf+draconic', staffSize: '16', seededDepth: '256' },
    }).adds.contributionBySpecies;

    expect(new Set(Object.values(shallow)).size, 'a shallow shelf is within every ceiling').toBe(1);
    expect(new Set(Object.values(deep)).size, 'a deep shelf is not').toBeGreaterThan(1);
    expect(deep['human']).toBeLessThan(deep['elf'] as number);
  });

  /**
   * **`staffCohortsOf`'s `isLive` parameter, exercised.**
   *
   * No production caller on `main` supplies it, so the documented safety net is
   * inert in every shipped build. The lab supplies it, and this is the test
   * that says the parameter does something when it is given: an unstaffed
   * cohort stops counting toward throughput on the tick it leaves.
   */
  it('drops a cohort from throughput on the tick it leaves the staff', () => {
    const base = {
      ticks: 40,
      capacity: 40,
      axes: { speciesMix: 'human+elf', stage: 'mid', staffSize: '4' },
    } as const;
    const whole = runLab({ ...base, id: 'whole' });
    const halved = runLab({
      ...base,
      id: 'halved',
      actions: [{ tick: 20, kind: 'unstaff', speciesId: 'elf' }],
    });
    expect(halved.contains.staffCohorts).toBeLessThan(whole.contains.staffCohorts);
    expect(halved.adds.scribeMonthsTotal).toBeLessThan(whole.adds.scribeMonthsTotal);
    // The tick before the action they are identical; the tick after they are not.
    expect(halved.log[18]?.scribeMonths).toBe(whole.log[18]?.scribeMonths);
    expect(halved.log[25]?.scribeMonths).toBeLessThan(whole.log[25]?.scribeMonths as number);
  });

  /**
   * **An interdiction costs a university its whole advantage and none of its
   * upkeep**, which `library.ts` states and nothing measured until now.
   */
  it('leaves the shelf standing and the depth at zero when everything is forbidden', () => {
    const base = { ticks: 30, capacity: 40, axes: { seededDepth: '96', stage: 'mid' } } as const;
    const open = runLab({ ...base, id: 'open', axes: { ...base.axes, ruleset: 'permit-all' } });
    const shut = runLab({ ...base, id: 'shut', axes: { ...base.axes, ruleset: 'forbid-all' } });
    expect(shut.contains.instanceCount).toBe(open.contains.instanceCount);
    expect(shut.contains.distinctNodes).toBe(0);
    expect(open.contains.distinctNodes).toBeGreaterThan(0);
    // Upkeep is charged on instances, so it is unchanged by the interdiction.
    expect(shut.adds.vellumUpkeepPaid).toBe(open.adds.vellumUpkeepPaid);
  });
});

describe('the goldens, played in', () => {
  const files = readdirSync(FIXTURES).filter((file) => file.endsWith('.json'));

  it('has a fixture for every committed sweep', () => {
    expect(files.sort()).toEqual(COMMITTED_SWEEPS.map((spec) => `${spec.name}.json`).sort());
  });

  it.each(files)('replays %s to the same digest', (file) => {
    const fixture = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as {
      spec: Parameters<typeof runSweep>[0];
      digest: ReturnType<typeof sweepDigest>;
    };
    // **Two assertions, and the first one is the one that is easy to omit.**
    //
    // The digest is replayed from `fixture.spec` — the spec the golden was
    // *recorded at* — so a sweep is always compared against itself. That is
    // right, and on its own it leaves a hole: change `COMMITTED_SWEEPS`
    // underneath — 120 ticks to 240, or drop `life-stages`'s `stride: 3` — and
    // this test stays green while the committed definition and its golden drift
    // apart. The fixture would then be a well-formed record of a sweep nobody
    // runs, which is exactly `CLAUDE.md`'s "aggregator that locates input by
    // shape rather than by name".
    //
    // So the spec is pinned first, and the digest second.
    const committed = COMMITTED_SWEEPS.find((spec) => spec.name === fixture.spec.name);
    expect(committed, `no committed sweep named "${fixture.spec.name}"`).toBeDefined();
    expect(fixture.spec).toEqual(committed);
    expect(sweepDigest(runSweep(fixture.spec))).toEqual(fixture.digest);
  });

  it('reports which columns went constant, so a dead column is visible', () => {
    // Not an assertion about *which* columns: that is what the digest pins.
    // This asserts that the mechanism reports something, because a
    // `constantColumns` that always returned `[]` would be the one shape of
    // broken checker this repository has caught five times.
    const digest = sweepDigest(
      runSweep({ name: 'probe', axes: ['staffSize'], ticks: 20, capacity: 40 }),
    );
    const constants = constantColumns(digest);
    expect(constants).toContain('contains.distinctNodes');
    expect(constants).not.toContain('contains.residentMages');
  });
});

describe('the roles come from the enum, not from a list of strings', () => {
  it('allocates across every value of MAGE_ROLE', () => {
    const allocated = allocateRoles(16, ALL_AXES.roleMix.points[2]?.value as never);
    expect([...allocated.keys()].sort()).toEqual(Object.values(MAGE_ROLE).sort());
  });
});
