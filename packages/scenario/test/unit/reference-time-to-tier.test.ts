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
 * ## Re-measured again after vision §6a's capital loop, and it got worse
 *
 * `w7/knowledge-capital` wired the library's contribution into `research-rate`,
 * `teach-rate` and `scribe-rate`. It is a *shared* acceleration — every mage at
 * a university reads the same shelves — so the spread **compressed** rather than
 * widening.
 *
 * Time to a mage of tier 3, in world ticks, six seeds of a sixty-year run:
 *
 * ```text
 *  gnome     [39,  53]        dwarf  [41,  54]         orc  [42,  63]
 *  human     [44,  57]          elf  [54, 110]    draconic  [68, 245]
 * ```
 *
 * Orc left the slow band outright — it was `[61, 76]` — and elf now overlaps
 * *both* the four ordinary species below it and draconic above it, so the six
 * no longer partition into ordered bands at all. One strict separation
 * survives: draconic arrives after every one of the ordinary four, in every
 * seed. **That is a species-differentiation regression and it is recorded
 * rather than repaired**: the lever is the species table, every magnitude in it
 * is `tuningStatus: "untuned"`, and `release-plan.md` forbids answering a
 * tuning question before 0.5.0.
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
 *
 * ## Six seeds was the right budget and the wrong *shape* — read this before
 * adding a claim here
 *
 * **Added 2026-08-14, on `main` at `cc20d54`.** The paragraph above is about how
 * *many* runs to buy. It never asked the other question: how much does an answer
 * move when you buy six **different** runs? Four of the eight interval claims
 * this file used to assert did not survive that, and one of them —
 * `human.high < orc.low` — survived in **one seed set out of sixteen**, the one
 * it was measured on.
 *
 * The statistic is why, and it is worth understanding before writing another
 * assertion here. `[min, max]` non-overlap **has no standard error**, because a
 * range is not a mean; and it is **not stable in `n`**, because a range can only
 * grow as seeds are added — so non-overlap gets strictly easier the fewer seeds
 * you take, and two honest readings at different seed counts are not comparable.
 * Nothing that can be computed from one seed set fixes either property.
 *
 * So: this file may assert a separation **only** while
 * `species-separation-spread.test.ts` shows it surviving every seed set, and
 * that sibling holds the rate for every claim, live and retired. Adding an
 * assertion here without a row there is adding a claim with no spread behind it,
 * and the sibling's tripwire will fail if you try.
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

  it('separates two of six, and 9.9 is further than it was', () => {
    // **Rewritten five times, and this time the direction reversed again.** The
    // previous version recorded three species separating strictly — human, orc
    // and elf from each other and from a gnome/dwarf pair — after `apply-magic`
    // gave orc's `laborAffinity` a rule to read it. Seven of the fifteen pairs
    // were distinguishable.
    //
    // Enabling all seventy cells cut that to four, and slowed everything by an
    // order of magnitude. Measured, tier 3, in ticks, over the same six seeds:
    //
    // | species  | w17          | with `apply-magic` | all seventy cells |
    // |---|---|---|---|
    // | gnome    | **[20, 21]** | [24, 25]   | **[452, 575]** |
    // | dwarf    | **[21, 25]** | [25, 30]   | **[453, 576]** |
    // | orc      | **[21, 27]** | [32, 51]   | **[501, 657]** |
    // | human    | **[28, 37]** | [30, 31]   | **[613, 709]**, 3 of 6 censored |
    // | elf      | **[35, 58]** | [53, 60]   | **[610, 699]**, 1 of 6 censored |
    // | draconic | **[26, 380]** | [25, 301] | **[486, 698]** |
    //
    // Two things happened and they are separate.
    //
    // The **slowdown** is arithmetic: the research frontier went from 51 nodes to
    // 300, a mage's effort spreads across six times as many candidates, and depth
    // arrives twenty times later. Twenty-five ticks to tier 3 was a measurement of
    // a catalog that ran out, not of a species.
    //
    // The **collapse** is the result that matters, and it is the opposite of what
    // this change was made to produce. Making species affinity reachable was
    // supposed to separate species; at tier 3 it merged three of them. Seven
    // separated pairs became four, and the four that survive are one band against
    // another — `{gnome, dwarf}` strictly before `{human, elf}` — rather than
    // individual species. Orc, which `apply-magic` had just pulled clear of
    // everything, now overlaps everything again. Draconic still spans the range.
    //
    // A reading of why, offered as a hypothesis and not asserted: a wide frontier
    // gives every species enough affinity-favoured work to stay busy, so the
    // *order* a species reaches for nodes in stops deciding how fast it gets deep.
    // Affinity shows up as *which* cells a species occupies — see
    // `species-occupancy.test.ts`, where elf holds `perdo-herbam` alone on its
    // strongest authored affinity — rather than as time-to-tier. Two readings of
    // the same trait, and only one of them moved the way the change predicted.
    //
    // **Task 9.9 wants four species separated by more than the cross-seed spread.
    // This build separates two groups of two.** Recorded rather than repaired:
    // every species magnitude carries `tuningStatus: "untuned"`, no release before
    // 0.5.0 may claim any of them is balanced, and inventing a species number to
    // make a test go green is what `release-plan.md`'s measurement pivot exists to
    // prevent.
    const interval = (name: string): { low: number; high: number } => {
      const column = tierThree.find((entry) => entry.name === name);
      if (column === undefined || column.observed.length === 0) {
        throw new Error(`${name} was censored in every seed and cannot be banded`);
      }
      return { low: Math.min(...column.observed), high: Math.max(...column.observed) };
    };

    const gnome = interval('gnome');
    const dwarf = interval('dwarf');
    const orc = interval('orc');
    const human = interval('human');
    const elf = interval('elf');
    const draconic = interval('draconic');

    const overlaps = (a: { low: number; high: number }, b: { low: number; high: number }): boolean =>
      a.low <= b.high && b.low <= a.high;

    // Every separated pair, named. Asserted as an exact set rather than a count,
    // because a count would go on passing while the identity of the separated
    // pairs changed — and the identity is the whole finding here, since the four
    // survivors are a band against a band rather than four species.
    const all = [
      ['gnome', gnome],
      ['dwarf', dwarf],
      ['orc', orc],
      ['human', human],
      ['elf', elf],
      ['draconic', draconic],
    ] as const;
    const separated: string[] = [];
    for (let a = 0; a < all.length; a += 1) {
      for (let b = a + 1; b < all.length; b += 1) {
        const left = all[a];
        const right = all[b];
        if (left === undefined || right === undefined) continue;
        if (!overlaps(left[1], right[1])) separated.push(`${left[0]} / ${right[0]}`);
      }
    }
    expect([...separated].sort()).toEqual([
      'dwarf / elf',
      'dwarf / human',
      'gnome / elf',
      'gnome / human',
    ]);

    // Orc separated from human, from elf, from gnome and from dwarf one commit
    // ago. It now overlaps all four, and that is the single largest piece of the
    // regression, so it is pinned rather than left to the set above.
    expect(overlaps(orc, human)).toBe(true);
    expect(overlaps(orc, elf)).toBe(true);
    expect(overlaps(orc, gnome)).toBe(true);

    // And the slowdown, so a reader can tell the collapse from the arithmetic.
    // Tier 3 was reached inside thirty ticks by four of the six; the fastest seed
    // of the fastest species is now 452.
    expect(Math.min(gnome.low, dwarf.low, orc.low)).toBe(452);
  });
});
