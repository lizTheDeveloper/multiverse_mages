/*
 * Multiverse Mages — how long each species takes to reach a tier, and how much
 * of the difference is the species rather than the seed.
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
 * `mages-and-species` task 9.9: *"implement the time-to-tier measurement and
 * assert at least four species differ by more than the observed cross-seed
 * spread."* The measurement is implemented and is exercised here. **The
 * assertion is not made, because three species differ and not four**, and the
 * task's box is left unticked.
 *
 * ## The numbers, so the reader can check the arithmetic
 *
 * Time to a mage of tier 2, in world ticks, over eight seeds of a sixty-year
 * run — measured on 2026-08-11 while authoring this file. `null` is censored:
 * the species had no tier-2 mage when the run ended.
 *
 * ```text
 *  draconic  383   63  548 null  249 null null  419
 *  dwarf      17   17   17   17   17   17   17   17
 *  elf        20   22   20   20   49   21   20   20
 *  gnome      17   17   16   17   16   17   16   17
 *  human      17   17   17   17   17   17   17   17
 *  orc      null null null null null null  316 null
 * ```
 *
 * Read as intervals, that is three separated bands and two things that are not
 * bands:
 *
 * - **dwarf, gnome and human are one band**, `[16, 17]`. They are not
 *   distinguishable from each other at this tier by this instrument, and no
 *   amount of seeds would separate values that differ by one tick.
 * - **elf**, `[20, 49]`, is strictly above that band in every seed.
 * - **draconic**, `[63, 548]`, is strictly above elf in every seed it reached
 *   tier 2 at all.
 * - **orc** is censored in seven seeds of eight — and in the eighth it arrives
 *   at tick 316, *inside* draconic's interval. So orc cannot be counted as a
 *   separated sixth: whether it separates depends on the horizon, and the run
 *   that goes far enough to decide is the run in which it overlaps.
 *
 * Three mutually separated species, then: one of the tied trio, elf, draconic.
 * Four would need either a censoring convention — which `contracts.md` §7's
 * `timeToTierBySpecies` owns and `agent-interface` task group 6 is where it is
 * pinned, not here — or content that separates dwarf, gnome and human, which is
 * a tuning question and `release-plan.md` forbids answering one before 0.5.0.
 *
 * ## Why sixty years and six seeds
 *
 * Sixty, because draconic's median is 383 ticks and its worst observed arrival
 * is 548: a horizon that censors the slowest species is a horizon that reports
 * the fast ones as separated because the slow ones are missing. Six seeds
 * rather than the eight tabulated above, because each run is a real universe
 * and the marginal seed buys less than it costs in a suite that already carries
 * two two-hundred-year runs; the eighth seed's orc is the finding, and it is
 * recorded above rather than re-measured on every push.
 */

import { referenceContent, runLongReference, timeToTierBySpecies } from '@mm/scenario';
import { beforeAll, describe, expect, it } from 'vitest';

const TIMEOUT_MS = 300_000;

/** Sixty world years. See the module note. */
const HORIZON_TICKS = 720;

/** Ascending, and arbitrary: any fixed set would do, and a fixed set is the point. */
const SEEDS = [0x0009_0001, 0x0009_0002, 0x0009_0003, 0x0009_0004, 0x0009_0005, 0x0009_0006];

/** The tier the measurement is taken at. Every founder starts at tier 1. */
const TIER = 2;

/** Species order is `speciesId - 1`, which is the observation's order. */
const SPECIES_NAMES = ['draconic', 'dwarf', 'elf', 'gnome', 'human', 'orc'] as const;

/** One species' observations across seeds, censored entries dropped. */
interface Column {
  readonly name: string;
  readonly observed: readonly number[];
  readonly censored: number;
}

let columns: readonly Column[];

beforeAll(async () => {
  const content = referenceContent();
  const rows: (number | undefined)[][] = [];
  for (const runSeed of SEEDS) {
    const result = await runLongReference({ runSeed, ticks: HORIZON_TICKS, content });
    rows.push([...timeToTierBySpecies(result, TIER)]);
  }
  columns = SPECIES_NAMES.map((name, species) => {
    const column = rows.map((row) => row[species]);
    const observed = column.filter((value): value is number => value !== undefined);
    return { name, observed, censored: column.length - observed.length };
  });
}, TIMEOUT_MS);

describe('time to tier, by species', () => {
  it('prints the measurement the assertion below is read off', () => {
    for (const column of columns) {
      console.log(
        `${column.name.padEnd(9)} ` +
          (column.observed.length === 0
            ? `never reached tier ${String(TIER)} in ${String(SEEDS.length)} seeds`
            : `[${String(Math.min(...column.observed))}, ${String(
                Math.max(...column.observed),
              )}] ticks over ${String(column.observed.length)} seeds, ` +
              `${String(column.censored)} censored`),
      );
    }
    expect(columns).toHaveLength(SPECIES_NAMES.length);
  });

  it('measures a species rather than a founding grant', () => {
    // Every founding candidate is a root node of a v1 cell and every one is
    // tier 1, and the long run's options deal one to each of the six founders.
    // So tier 2 is the first tier anybody has to *earn*, and the measurement
    // starts from a position no species was favoured in.
    for (const column of columns) {
      for (const arrival of column.observed) expect(arrival).toBeGreaterThan(0);
    }
  });

  it('separates exactly three species, which is one short of what 9.9 asks', () => {
    const interval = (name: string): { low: number; high: number } | undefined => {
      const column = columns.find((entry) => entry.name === name);
      if (column === undefined || column.observed.length === 0) return undefined;
      return { low: Math.min(...column.observed), high: Math.max(...column.observed) };
    };

    const human = interval('human');
    const elf = interval('elf');
    const draconic = interval('draconic');
    if (human === undefined || elf === undefined || draconic === undefined) {
      throw new Error('a species that should always reach tier 2 was censored in every seed');
    }

    // Separated means the observed intervals do not overlap: in every seed the
    // faster species arrived strictly earlier. That is a stronger statement than
    // "the means differ by more than the spread" and is the one the data
    // supports.
    expect(human.high).toBeLessThan(elf.low);
    expect(elf.high).toBeLessThan(draconic.low);

    // And the three that are not separated, asserted so the shortfall is a fact
    // in the suite rather than a claim in a comment.
    const dwarf = interval('dwarf');
    const gnome = interval('gnome');
    if (dwarf === undefined || gnome === undefined) throw new Error('a fast species was censored');
    const overlaps = (a: { low: number; high: number }, b: { low: number; high: number }): boolean =>
      a.low <= b.high && b.low <= a.high;
    expect(overlaps(dwarf, gnome)).toBe(true);
    expect(overlaps(dwarf, human)).toBe(true);

    // Orc is the sixth, and it is censored rather than slow. Recorded, not
    // counted: see the module note for the eighth seed in which it is not.
    const orc = columns.find((entry) => entry.name === 'orc');
    expect(orc?.observed).toHaveLength(0);
    expect(orc?.censored).toBe(SEEDS.length);
  });
});
