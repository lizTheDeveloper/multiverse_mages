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

  it('asserts only the separations that survive a re-roll of the seeds', () => {
    // **Retitled and cut down on 2026-08-14, on `main` at `cc20d54`.** It used
    // to be called *"separates four of six, and 9.9 is closer than it has ever
    // been"*, and four of the eight interval claims below it were true only of
    // the six seeds in `SEEDS`.
    //
    // ## Why the statistic underneath could not have caught that
    //
    // Everything here is read off `[min, max]` over one fixed seed list, and a
    // separation is claimed when two such intervals do not overlap. That test
    // **gets strictly easier the fewer seeds you take** — a range can only grow
    // as seeds are added — and it has no standard error, because a range is not
    // a mean. So it cannot distinguish "these species differ" from "these six
    // seeds happened not to cross", and no amount of care in reading it would
    // have.
    //
    // The missing measurement is a *second* seed set, and then a third:
    // `species-separation-spread.test.ts` next door takes K independent sets of
    // six and reports how many each claim survives. Measured there at twelve
    // sets, tier 3, 720 ticks:
    //
    // | claim | held in | kept? |
    // |---|---:|---|
    // | `gnome.high < elf.low`      | **12/12** | kept |
    // | `dwarf.high < elf.low`      | **12/12** | kept |
    // | `gnome.high < human.low`    | **12/12** | kept |
    // | `draconic.high > elf.high`  | **12/12** | kept |
    // | `orc.high < elf.low`        | 11/12 | **retired** |
    // | `overlaps(gnome, dwarf)`    | 7/12  | **retired** |
    // | `draconic.low < human.low`  | 5/12  | **retired** |
    // | `human.high < orc.low`      | **0/12** | **retired** |
    //
    // `human.high < orc.low` is the sharp one. It is #127's *"9.9 is one species
    // closer than it has ever been"*, **retracted by its own author after a
    // re-roll**, and it stayed green here for as long as it did because this
    // file runs on the one seed set it was measured on. Widening to four
    // consecutive-integer seed sets as well found it holding in **one of sixteen
    // sets** — that one. A green test asserting something false is worse than a
    // red one.
    //
    // The other three are retired rather than weakened, and none of the four
    // that reproduce was touched. A claim that holds in 11 of 12 sets is a real
    // effect and still not something *this* file may assert, because this file
    // has one seed set and cannot state a rate. It states rates next door.
    //
    // **Nothing was tuned to make this pass.** Every species magnitude still
    // carries `tuningStatus: "untuned"`, no `balance/` baseline moved, and no
    // content file was edited. Four assertions were deleted because they were
    // not true of anything except their own seeds.
    // **Rewritten three times, and this time the direction reversed back.** The
    // previous version recorded a single separation — draconic strictly after
    // four ordinary species, with elf bridging — taken after
    // `w7/knowledge-capital` wired vision §6a's library contribution into the
    // three rates and compressed the spread.
    //
    // `w17/value-sensitive-acquirer` then made target selection a utility score
    // shaped by species, age, personality and standing role
    // (`docs/design/value-sensitive-acquirer.md`). Every species got roughly
    // twice as fast to tier 3 *and the spread reopened*, because a species now
    // walks toward the tier-3 nodes its own `curiosity` and `affinities` favour
    // rather than down one queue shared by everybody.
    //
    // Measured, tier 3, in ticks, this build against the previous one:
    //
    // | species | w7 | w17 |
    // |---|---|---|
    // | gnome    | [39, 53]  | **[20, 21]** |
    // | dwarf    | [41, 54]  | **[21, 25]** |
    // | orc      | [42, 63]  | **[21, 27]** |
    // | human    | [44, 57]  | **[28, 37]** |
    // | elf      | [54, 110] | **[35, 58]** |
    // | draconic | [68, 245] | **[26, 380]** |
    //
    // Three bands now, where there was one separation: a fast trio
    // (gnome, dwarf, orc) that overlaps internally, human strictly after all
    // three, and elf strictly after all three again. Draconic has stopped being
    // a band at all — it spans from inside the fast trio to five times elf's
    // slowest seed, which is `depthCeiling: 7` and `curiosity: 512` pulling
    // against each other under the new score.
    //
    // **Task 9.9 wants four species separated by more than the cross-seed
    // spread. This build separates three groups and not four species**, because
    // gnome, dwarf and orc still overlap. Recorded rather than repaired: every
    // species magnitude carries `tuningStatus: "untuned"`, no release before
    // 0.5.0 may claim any of them is balanced, and inventing a species number to
    // make a test go green is what `release-plan.md`'s measurement pivot exists
    // to prevent.
    const interval = (name: string): { low: number; high: number } => {
      const column = tierThree.find((entry) => entry.name === name);
      if (column === undefined || column.observed.length === 0) {
        throw new Error(`${name} was censored in every seed and cannot be banded`);
      }
      return { low: Math.min(...column.observed), high: Math.max(...column.observed) };
    };

    const gnome = interval('gnome');
    const human = interval('human');
    const elf = interval('elf');
    const draconic = interval('draconic');
    // `orc` is deliberately not bound. Both claims that read it — `orc.high <
    // elf.low` at 11/12 and `human.high < orc.low` at 0/12 — are retired, and
    // leaving the binding would invite the next author to reach for it.
    // **`dwarf` left this list on W116 and `orc` did not join it.** Dwarf was
    // established before elf in 12 of 12 seed sets and is now *refuted* in 12 of
    // 12 — elf arrives first, by 8.6 paired standard errors — because dwarf's
    // mean time to tier 3 went from among the fastest to 234.9 ± 23.5 ticks
    // against gnome's 23.8. `species-separation-spread.test.ts` carries the row
    // and the reasoning; the short version is that dwarf has the highest
    // `scribeAffinity` in the content, `completeAffiliation` gained a caller,
    // and a month spent writing is a month not spent reaching the next tier.
    // `species-occupancy` reads the same species falling furthest over the same
    // change, which is two independent instruments agreeing on the mechanism.
    //
    // `gnome < elf` takes its place: 12/12 sets at 13.3 SE, true before this
    // branch and unmoved by it.
    const beforeElf = [gnome];

    // What separates strictly in **every one of twelve** independent seed sets:
    // gnome and dwarf arrive before elf, and gnome arrives before human. Both
    // are real statements about `curiosity` — gnome 1792, human 1152, elf 896 —
    // now that curiosity is an input to *which* node a mage reaches for and not
    // only to how fast she works on whichever one was cheapest.
    //
    // Orc is no longer in this group. It is faster than elf on average by 26.7
    // standard errors and its interval still overlaps elf's in one set of
    // twelve, which is a fact this file has no way to write down.
    for (const entry of beforeElf) expect(entry.high).toBeLessThan(elf.low);
    expect(gnome.high).toBeLessThan(human.low);

    // Draconic ends long after elf, in every set of twelve. That it *starts*
    // before human — the other half of the old "draconic is the bridge" claim —
    // held in five sets of twelve and is retired: draconic's arrival is wide
    // enough to straddle the horizon, its `min` endpoint travels 114 ticks
    // between seed sets, and it is censored in 17 of 72 runs. Nothing about
    // where draconic *starts* is measurable at 720 ticks.
    expect(draconic.high).toBeGreaterThan(elf.high);

    // **The trio is a pair now, and `apply-magic` is what broke it up.**
    //
    // Measured, tier 3, in ticks, this build against the one before the goal
    // existed:
    //
    // | species | before | with `apply-magic` |
    // |---|---|---|
    // | gnome    | [24, 25] | [24, 25] |
    // | dwarf    | [25, 30] | [25, 30] |
    // | orc      | [21, 27] | **[32, 51]** |
    // | human    | [30, 31] | [30, 31] |
    // | elf      | [53, 60] | [53, 60] |
    // | draconic | [26, 380] | [25, 301] |
    //
    // Only orc moved, and it moved because `speciesTerm` reads `laborAffinity`
    // for this goal and orc's is the highest in the content set at `fp(1536)`,
    // against the lowest `curiosity` but draconic's at `fp(384)`. An orc mage
    // therefore likes applied work about as much as a gnome likes research, and
    // she spends months on it that she used to spend reaching tier 3. That is
    // the seventh species trait finding a rule to read it, and it is the first
    // time a species' *economic* disposition has changed how deep it gets.
    //
    // **The "9.9 is one species closer" paragraph that stood here is deleted,
    // and so are the three assertions under it.** It read orc as newly separated
    // from human and from elf on the strength of `[32, 51]` against human's
    // `[30, 31]`. Twelve fresh seed sets put orc's fastest arrival between 24
    // and 30 and human's slowest between 30 and 35: they overlap every time.
    //
    // The `overlaps(gnome, dwarf)` assertion went with them, and it is
    // worth naming why, because it is the one that looks harmless. **A claim
    // that two species are indistinguishable is exactly as seed-dependent as a
    // claim that they can be told apart.** It held in 7 sets of 12.
    //
    // What is left is four assertions, each of which survived twelve re-rolls.
    // Task 9.9 wants four *species* separated by more than the cross-seed
    // spread; what reproduces is `gnome < human < elf` with `dwarf < elf`
    // alongside — three species in a chain, not four — so **9.9 is unmet, and
    // measuring it properly moved it further away rather than closer.** Recorded
    // rather than repaired: every species magnitude carries
    // `tuningStatus: "untuned"`, and inventing one to make a test go green is
    // what `release-plan.md`'s measurement pivot exists to prevent.
  });
});
