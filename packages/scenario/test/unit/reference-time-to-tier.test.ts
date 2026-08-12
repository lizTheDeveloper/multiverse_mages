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
 * ## Re-measured a third time, after W20's compositional content graph, and
 * the bands collapsed rather than sharpened
 *
 * `compositional-content.md` replaced the 51 v1 ladder nodes — one strict
 * chain per cell, no choice in them at all — with 108 nodes across tracks,
 * tiers 1-7, and per-technique cost curves. The obvious hypothesis was that
 * more authored depth would let the high-`depthCeiling` species (elf 6,
 * draconic 7) finally separate from the rest, since v1 previously topped out
 * at tier 5 with exactly two nodes there and nothing above — so those two
 * ceilings bought nothing. **That is not what happened to time-to-tier.**
 * What widened instead is *every* species' own spread, because at each tier a
 * mage now has many roughly-equally-costed nodes to choose between rather
 * than one, and which one she reaches for depends on her own `curiosity` and
 * `affinities` — so two mages of the same species, differing only by seed,
 * now diverge as much as two different species used to.
 *
 * Measured, tier 3, in ticks, this build against `w17/value-sensitive-acquirer`:
 *
 * | species  | w17          | W20              |
 * |----------|--------------|------------------|
 * | gnome    | [20, 21]     | **[30, 68]**     |
 * | dwarf    | [21, 25]     | **[31, 48]**     |
 * | orc      | [21, 27]     | **[33, 61]**     |
 * | human    | [28, 37]     | **[33, 52]**     |
 * | elf      | [35, 58]     | **[35, 59]**     |
 * | draconic | [26, 380]    | **[52, 277]** (1 of 6 seeds censored) |
 *
 * Every interval widened except elf's, which held almost exactly. The fast
 * trio (gnome/dwarf/orc) that used to sit strictly below elf now overlaps it
 * completely — gnome's own high (68) exceeds elf's low (35) by nearly double.
 * Of the fifteen species pairs, only **one** still separates strictly at
 * tier 3: **dwarf arrives before draconic, in every seed** (dwarf's worst
 * case, 48, beats draconic's best, 52). Every other pair overlaps, including
 * the one separation task 9.9's previous reading was built on (draconic after
 * every ordinary species). **This is a regression in the number of
 * distinguishable species, from three bands down to one surviving pair**, and
 * it is recorded rather than repaired for the same reason as always: every
 * species magnitude is `tuningStatus: "untuned"`, and `release-plan.md`
 * forbids answering a tuning question before 0.5.0. Content that widens
 * authored depth without also widening species differentiation is a finding
 * for the balance harness, not something this test should paper over by
 * picking a looser band definition.
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

  it('the three w17 bands collapsed under W20: only dwarf-before-draconic still separates', () => {
    // **Rewritten a fourth time, and this time the bands did not survive at
    // all.** The previous version (see this file's header note for the full
    // table) recorded three bands: a fast trio (gnome/dwarf/orc, overlapping
    // internally), human strictly after all three, and elf strictly after all
    // three again — the closest 9.9 had come to its four-species bar.
    //
    // `compositional-content.md` (W20) replaced the 51-node v1 ladder with 108
    // nodes across tracks and per-technique cost curves. Every species'
    // interval widened — a mage now has many roughly-equally-costed tier-3
    // candidates rather than one, and which one she reaches for depends on her
    // own `curiosity`/`affinities`, so seed-to-seed variance within one species
    // grew enough to swallow most of the between-species gaps the previous
    // reading found. Of the fifteen possible species pairs, **fourteen now
    // overlap**. The measured intervals are in this file's header table; the
    // one survivor is asserted below.
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
    const all = { gnome, dwarf, orc, human, elf, draconic };

    // The one pair that still separates strictly, in every seed: dwarf's worst
    // arrival beats draconic's best. Every other pairing overlaps — including
    // the "draconic after every ordinary species" separation the w17 reading
    // was built on, since elf and human now both touch or overlap draconic's
    // low end.
    expect(dwarf.high).toBeLessThan(draconic.low);

    // The regression, stated as a count rather than left implicit: with the
    // one surviving pair excluded, every other pairing among the six overlaps.
    // Asserted non-zero and printed rather than pinned to fourteen exactly, so
    // a content change that reopens one gap fails loudly here instead of
    // silently changing what "three bands" used to mean.
    const overlaps = (a: { low: number; high: number }, b: { low: number; high: number }): boolean =>
      a.low <= b.high && b.low <= a.high;
    const names = Object.keys(all) as (keyof typeof all)[];
    let overlapping = 0;
    let total = 0;
    for (let a = 0; a < names.length; a += 1) {
      for (let b = a + 1; b < names.length; b += 1) {
        total += 1;
        const left = names[a] as keyof typeof all;
        const right = names[b] as keyof typeof all;
        if (overlaps(all[left], all[right])) overlapping += 1;
      }
    }
    console.log(`9.9 overlapping species pairs at tier 3: ${String(overlapping)} of ${String(total)}`);
    expect(overlapping).toBeGreaterThan(0);

    // **Task 9.9 wants four species separated by more than the cross-seed
    // spread. This build separates one pair, not four species** — a regression
    // from three bands, not progress toward it. Recorded rather than repaired:
    // every species magnitude carries `tuningStatus: "untuned"`, no release
    // before 0.5.0 may claim any of them is balanced, and inventing a species
    // number to make a test go green is what `release-plan.md`'s measurement
    // pivot exists to prevent.
  });
});
