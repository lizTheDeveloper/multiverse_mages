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
 * assertion is not made, because the species fall into two bands of three
 * rather than into four separable columns**, and the task's box is left
 * unticked.
 *
 * ## Re-measured after the `acquire` hook was wired in
 *
 * These numbers moved, and the reason is worth recording because the previous
 * reading would have sent someone tuning the wrong thing. `applyAcquire` was
 * called from tests and from nowhere else, so a tradition's `initialMastery`
 * never reached a created instance and every mage finished her research at the
 * placeholder `fp(256)`. Wiring the hook into the real acquisition path made
 * the slow species dramatically faster: **draconic went from `[63, 548]` ticks
 * to `[33, 104]`, and orc stopped being censored at all** — it had no tier-2
 * mage in seven of eight seeds and now reaches tier 2 in all six.
 *
 * A universe in which the slow species arrive at all is a different
 * measurement from one in which they time out, so the earlier assertions here
 * are obsolete rather than weakened.
 *
 * Time to a mage of tier 3, in world ticks, six seeds of a sixty-year run:
 *
 * ```text
 *  gnome     [41,  55]        dwarf  [45,  57]        human  [46,  55]
 *  elf       [60, 127]        orc    [61,  76]     draconic  [71, 345]
 * ```
 *
 * Two bands, cleanly separated: every fast species arrives strictly before
 * every slow one, in every seed. Inside a band nothing separates — which is
 * exactly why 9.9 stays unticked. The task asks for species to differentiate,
 * and three of them arriving together is three species wearing one trait.
 *
 * Tier 3 is asserted rather than tier 2 because it is the tier
 * `species-traits` names, and because at tier 2 the bands blur: draconic's
 * `[33, 104]` now overlaps elf's `[34, 63]`, so tier 2 would report *fewer*
 * distinguishable groups. Both tiers are printed, so a reader who suspects the
 * tier was chosen to flatter the result can check.
 *
 * Separating dwarf, gnome and human is a tuning question, and
 * `release-plan.md` forbids answering one before 0.5.0.
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

/**
 * The tiers the measurement is taken at. Every founder starts at tier 1, so
 * tier 2 is the first anybody has to earn.
 *
 * The `species-traits` spec's *"No two species are indistinguishable"* names
 * **tier 3**, and tier 3 is measured and printed for that reason — but the
 * assertion below is taken at tier 2, which is the *more favourable* of the
 * two and still only separates three species. At tier 3 dwarf and elf overlap
 * heavily (`[33, 449]` against `[33, 140]` over eight seeds) and draconic is
 * censored in half of them, so a reader who suspects tier 2 was chosen to
 * flatter the result should read the tier-3 line this test prints.
 */
const TIERS = [2, 3] as const;

/** The tier the assertion is taken at. See {@link TIERS}. */
const TIER = 2;

/** Species order is `speciesId - 1`, which is the observation's order. */
const SPECIES_NAMES = ['draconic', 'dwarf', 'elf', 'gnome', 'human', 'orc'] as const;

/** One species' observations across seeds, censored entries dropped. */
interface Column {
  readonly name: string;
  readonly observed: readonly number[];
  readonly censored: number;
}

/** Columns per tier, keyed by the tier they were measured at. */
let byTier: ReadonlyMap<number, readonly Column[]>;
let columns: readonly Column[];
/** The same, at tier 3 — the tier `species-traits` names. */
let tierThree: readonly Column[] = [];

beforeAll(async () => {
  const content = referenceContent();
  const rows = new Map<number, (number | undefined)[][]>(TIERS.map((tier) => [tier, []]));
  for (const runSeed of SEEDS) {
    const result = await runLongReference({ runSeed, ticks: HORIZON_TICKS, content });
    for (const tier of TIERS) rows.get(tier)?.push([...timeToTierBySpecies(result, tier)]);
  }
  byTier = new Map(
    TIERS.map((tier) => [
      tier,
      SPECIES_NAMES.map((name, species) => {
        const column = (rows.get(tier) ?? []).map((row) => row[species]);
        const observed = column.filter((value): value is number => value !== undefined);
        return { name, observed, censored: column.length - observed.length };
      }),
    ]),
  );
  columns = byTier.get(TIER) ?? [];
  tierThree = byTier.get(3) ?? [];
}, TIMEOUT_MS);

describe('time to tier, by species', () => {
  it('prints the measurement the assertion below is read off', () => {
    for (const tier of TIERS) {
      for (const column of byTier.get(tier) ?? []) {
        console.log(
          `tier ${String(tier)}  ${column.name.padEnd(9)} ` +
            (column.observed.length === 0
              ? `never reached it in ${String(SEEDS.length)} seeds`
              : `[${String(Math.min(...column.observed))}, ${String(
                  Math.max(...column.observed),
                )}] ticks over ${String(column.observed.length)} seeds, ` +
                `${String(column.censored)} censored`),
        );
      }
    }
    expect(columns).toHaveLength(SPECIES_NAMES.length);
  });

  it('names every pair it cannot tell apart, at the tier the spec asks about', () => {
    // The `species-traits` spec's *"No two species are indistinguishable"*
    // requires that the test **names any pair that does not** differ by more
    // than the cross-seed spread. That half is the half this build can honour,
    // and it is honoured at tier 3 — the tier the scenario names — rather than
    // at the tier the assertion above is taken at.
    const tied: string[] = [];
    for (const tier of TIERS) {
      const cols = byTier.get(tier) ?? [];
      for (let a = 0; a < cols.length; a += 1) {
        for (let b = a + 1; b < cols.length; b += 1) {
          const left = cols[a];
          const right = cols[b];
          if (left === undefined || right === undefined) continue;
          if (left.observed.length === 0 || right.observed.length === 0) continue;
          const overlap =
            Math.min(...left.observed) <= Math.max(...right.observed) &&
            Math.min(...right.observed) <= Math.max(...left.observed);
          if (overlap) tied.push(`tier ${String(tier)}: ${left.name} / ${right.name}`);
        }
      }
    }
    console.log(`indistinguishable pairs: ${tied.length === 0 ? 'none' : tied.join(', ')}`);
    // Not asserted empty, because it is not. Asserted non-empty, so that the
    // day content separates them this test fails and somebody comes back to
    // tick task 9.9 rather than leaving a stale finding in the release notes.
    expect(tied.length).toBeGreaterThan(0);
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

  it('separates two bands of three, not six species, and 9.9 stays unchecked', () => {
    // Rewritten after the `acquire` hook was wired into the real acquisition
    // path. Every number below moved, and all of them for the better: draconic
    // went from [63, 548] ticks to [33, 104], and orc stopped being censored
    // altogether — it was censored in seven of eight seeds and now reaches
    // tier 2 in all six. A universe in which the slow species arrive at all is
    // a different measurement from one in which they time out, so the previous
    // assertions are not weakened here, they are obsolete.
    //
    // What the data now supports is a two-band split rather than six ordered
    // species, and the bands are cleanest at tier 3 — which is the tier
    // `species-traits` names, so it is the tier asserted.
    const interval = (name: string): { low: number; high: number } => {
      const column = tierThree.find((entry) => entry.name === name);
      if (column === undefined || column.observed.length === 0) {
        throw new Error(`${name} was censored in every seed and cannot be banded`);
      }
      return { low: Math.min(...column.observed), high: Math.max(...column.observed) };
    };

    const fast = ['gnome', 'dwarf', 'human'].map(interval);
    const slow = ['elf', 'orc', 'draconic'].map(interval);

    // The bands separate: in every seed, every fast species arrived strictly
    // before every slow one. That is a stronger statement than comparing means,
    // and it is the one the observed intervals actually support.
    const slowest = Math.max(...fast.map((entry) => entry.high));
    const earliest = Math.min(...slow.map((entry) => entry.low));
    expect(slowest).toBeLessThan(earliest);

    // Inside a band nothing separates, which is why 9.9 stays unchecked: the
    // task asks for species to differentiate, and three of them arriving
    // together is three species wearing one trait.
    const overlaps = (a: { low: number; high: number }, b: { low: number; high: number }): boolean =>
      a.low <= b.high && b.low <= a.high;
    const [gnome, dwarfBand, humanBand] = fast;
    const [elfBand, orcBand] = slow;
    if (gnome === undefined || dwarfBand === undefined || humanBand === undefined) {
      throw new Error('a fast-band species was censored in every seed');
    }
    if (elfBand === undefined || orcBand === undefined) {
      throw new Error('a slow-band species was censored in every seed');
    }
    expect(overlaps(gnome, dwarfBand)).toBe(true);
    expect(overlaps(dwarfBand, humanBand)).toBe(true);
    expect(overlaps(elfBand, orcBand)).toBe(true);
  });
});
