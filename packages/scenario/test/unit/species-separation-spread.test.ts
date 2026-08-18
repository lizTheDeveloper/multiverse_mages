/*
 * Multiverse Mages — every strict species separation this repository asserts,
 * re-measured across independent seed sets.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the GNU
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The guard on `reference-time-to-tier.test.ts`.
 *
 * That file asserts five strict species separations, each read off **one** list
 * of six seeds. This file re-measures every one of them across four
 * *independent* seed sets and records how many of them each separation survives.
 * It is the instrument the two failures below would have caught, and it is
 * deliberately a sibling rather than an edit: the numbers next door are correct
 * about the seeds they were taken at, and the thing that was missing was never
 * an assertion, it was a spread.
 *
 * ## The two failures
 *
 * **#127** claimed orc had separated from a fast trio, off the interval
 * `[32, 51]`. A later re-roll gave `[25, 40]` and it folded back in.
 *
 * **#140** claimed `gnome < dwarf < human < elf` — *"four species separated by
 * more than the cross-seed spread, which is what task 9.9 asks for"* — off the
 * same six seeds, with the spread again not measured.
 *
 * Both are the same defect, and it is not a mistake in either measurement. A
 * strict ordering only asks that point estimates not cross, so it is the
 * statistic most likely to look clean by accident, and neither claim came with
 * the one number that would have said so.
 *
 * ## What was found, on `main` at `cc20d54`, 2026-08-14
 *
 * Twelve independent seed sets of six seeds, tier 3, 720 ticks. The five strict
 * `faster < slower` separations `reference-time-to-tier.test.ts` used to assert,
 * with the paired gap behind each:
 *
 * ```text
 *  gnome < human   strict in 12/12 sets     gap  5.6 ± 0.1 ticks  =  70.5 SE
 *  gnome < elf     strict in 12/12 sets     gap 30.5 ± 0.3 ticks  =  90.4 SE
 *  dwarf < elf     strict in 12/12 sets     gap 27.1 ± 0.4 ticks  =  62.2 SE
 *  orc   < elf     strict in 11/12 sets     gap 20.6 ± 0.8 ticks  =  26.7 SE
 *  human < orc     strict in  0/12 sets     gap  4.3 ± 0.8 ticks  =   5.4 SE
 * ```
 *
 * ## The audit is of the whole file, and it found four, not two
 *
 * Counting only `a.high < b.low` claims missed two more of the same family, so
 * every interval claim in that file was re-measured with {@link claimRate}.
 * Eight distinct claims; **four do not reproduce**:
 *
 * ```text
 *  gnome.high < elf.low        12/12   kept
 *  dwarf.high < elf.low        12/12   kept
 *  gnome.high < human.low      12/12   kept
 *  draconic.high > elf.high    12/12   kept
 *  orc.high   < elf.low        11/12   retired
 *  overlaps(gnome, dwarf)       7/12   retired
 *  draconic.low < human.low     5/12   retired
 *  human.high < orc.low         0/12   retired
 * ```
 *
 * The overlap one is worth naming because it looks harmless: it asserts that two
 * species are *indistinguishable*, and **a claim that two species cannot be told
 * apart is exactly as seed-dependent as a claim that they can.** Non-overlap is
 * the complement of `gnome.high < dwarf.low` for this pair — dwarf never
 * precedes gnome and neither is ever censored — so it is false in five sets.
 *
 * `draconic.low < human.low` is the one a narrower audit missed. Draconic's
 * `min` endpoint travels 114 ticks between seed sets and it is censored in 17 of
 * 72 runs: **nothing about where draconic starts is measurable at this
 * horizon.**
 *
 * All four were retired from that file on 2026-08-14, and their exact source
 * text is pinned in {@link RETIRED_ASSERTIONS} so that re-adding one fails here
 * rather than passing there. The four that reproduce were not touched.
 *
 * `human < orc` is #127's finding, still asserted next door. Widening the search
 * to four *consecutive-integer* seed sets cut the same way as the committed one
 * — in case the committed seeds were an unrepresentative corner of the seed
 * space rather than an unlucky draw — found it holding in exactly one of
 * sixteen sets: **the set it was measured on**.
 *
 * Those assertions are left alone. Editing them would be a behaviour claim, and
 * this is a measurement.
 *
 * ## Why the pins below are verdicts and not intervals
 *
 * A pinned interval breaks whenever anything moves, which trains a reader to
 * re-record it. A pinned *verdict* — does this separation survive a re-roll —
 * breaks only when the answer to the question the project actually cares about
 * changes. When one does break, the fix is to re-measure with
 * `packages/scenario/bin/species-separation.mjs` and re-record, in the same
 * voice, with the new numbers and the reason.
 *
 * ## Four sets, not twelve
 *
 * Four is {@link MIN_SETS_FOR_REFUTATION}, the fewest at which *"it never
 * separated"* is allowed to refute anything, and it is about eighty seconds of
 * simulation. Twelve is the default of the bin, which is where a claim destined
 * for a release note should be measured. This is a tripwire, not the
 * measurement.
 */

import {
  MIN_SETS_FOR_REFUTATION,
  SEEDS_PER_SET,
  chainVerdictOf,
  formatPairSeparation,
  formatSeparationReport,
  measureSeedSet,
  measureSpeciesSeparation,
  referenceContent,
  runLongReference,
  separationOf,
  separationRootSeed,
  separationRunSeeds,
  timeToTierBySpecies,
  verdictOf,
} from '@mm/scenario';
import type { SeparationReport, SeparationVerdict } from '@mm/scenario';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Generous, and deliberately more generous per run than the sibling file's
 * budget for six runs.
 *
 * This is twenty-five runs on a shared box that has been seen at load 300, and
 * a timeout here would read as a real defect in an instrument whose whole
 * subject is not mistaking noise for a finding. Observed cost is about 150
 * seconds at load 11.
 *
 * **900 s was not enough on GitHub Actions**, 2026-08-17: the hook was cut at
 * exactly its budget on job 95387839967 and the whole file failed with no named
 * test, which reads as a broken suite rather than as a slow one. The hook costs
 * about 610 s here (669 s for the file, less 59 s for the tests that do not
 * wait on it) under load 20-50.
 *
 * Seven times that is 4,270 s, and this is the one budget in the repository
 * that takes the one-hour cap instead: an arm that needs longer than an hour is
 * an arm whose place in a merge gate is the question, not its budget, and the
 * next completed run is what decides that. See `vitest.config.ts` for the
 * factor and the local/CI pair behind it.
 */
const TIMEOUT_MS = 3_600_000;

/** See the module note. */
const SETS = MIN_SETS_FOR_REFUTATION;

/** The tier `species-traits` names, and the tier both claims were made at. */
const TIER = 3;

/** The horizon every published time-to-tier reading was taken at. */
const HORIZON_TICKS = 720;

/**
 * Every strict separation `reference-time-to-tier.test.ts` asserts, with what a
 * re-roll does to it.
 *
 * The last column is the finding. `human < orc` is asserted next door as
 * `expect(human.high).toBeLessThan(orc.low)` and it separates in no seed set
 * but the one it was measured on.
 */
const CLAIMED_SEPARATIONS: readonly {
  readonly faster: string;
  readonly slower: string;
  readonly assertedAs: string;
  readonly status: 'asserted' | 'retired';
  readonly verdict: SeparationVerdict;
}[] = [
  //
  // **Re-recorded 2026-08-16 on `w/exp-yields`, and every row below moved the
  // same way for one reason: the whole population reaches tier 3 later, and the
  // slow species stop reaching it at all.** Re-measured as this file's failure
  // text instructs, `node packages/scenario/bin/species-separation.mjs --sets 12`,
  // 72 runs at 720 ticks:
  //
  //     draconic  mean 454.0 ± 25.4 SE   censored 57/72
  //     dwarf     mean 650.0 ± 12.5 SE   censored 65/72
  //     elf       mean 604.2 ± 59.8 SE   censored 64/72
  //     gnome     mean 377.8 ±  4.7 SE   censored  2/72
  //     human     mean 446.9 ± 14.6 SE   censored 48/72
  //     orc       mean 441.8 ± 34.0 SE   censored 63/72
  //
  // Five of six species are censored in most sets, so most pairs now have one
  // or two comparable sets and `NaN` standard errors — which is what turns a
  // verdict `inconclusive` here, and it is a statement about **power** rather
  // than about the ordering.
  //
  // The cause is this branch's own: `form.json`'s fourteen yield rows were
  // re-authored out of nine distinct baskets into fourteen, and the total weight
  // routed to `stone` across all forms fell from 3072 to 2624 while `food` rose
  // 2048 -> 2304 and `vellum` 2048 -> 2496. `stone` is what a university is
  // built out of, universities are what teach, and teaching is most of how a
  // mage reaches tier 3. **That is a balance finding for the owner and it is
  // reported rather than tuned away** — every magnitude involved is
  // `tuningStatus: "untuned"` and this tree is deliberately pre-sweep.
  //
  // This row at twelve sets: `gnome < elf` INCONCLUSIVE, strict in 4/5
  // comparable sets, paired gap 232.6 ± 60.9 ticks = 3.8 SE. The sign never
  // reverses and the gap is large; what is missing is sets in which elf arrives
  // at all.
  // **Retired on `integration/all-branches`, 2026-08-17.** Twelve sets:
  // `inconclusive`, strict in 4 of 5 comparable sets, paired gap 232.4 ± 63.4
  // ticks = 3.7 SE. It still holds on the sibling file's own six seeds — 386
  // against 648 — and that is the case this file exists to catch: elf is
  // censored in **64 of 72 runs**, so the five sets where it arrives at all are
  // the sets where it arrived early, and an endpoint comparison over a selected
  // tail is not a measurement. The sign has never reversed. What it lacks is
  // sets.
  {
    faster: 'gnome',
    slower: 'elf',
    assertedAs: 'beforeElf.high < elf.low — retired 2026-08-17, no longer asserted',
    status: 'retired',
    verdict: 'inconclusive',
  },
  // ---- The four claims the sibling file asserts now, all of them about dwarf. ----
  //
  // Measured on `integration/all-branches`, 2026-08-17. This is the first
  // arrangement in this file's history in which **everything that survives a
  // re-roll names one species**, and it is worth reading as that rather than as
  // four independent findings: dwarf is the slowest column the instrument has
  // (mean 638.3 against gnome's 377.8) and is censored in 66 of 72 runs, so what
  // reproduces is *"four species arrive before the one that mostly does not
  // arrive"*. That is one band and a laggard. It is **not** the four separated
  // species task 9.9 asks for, and the sibling file says so.
  //
  // **At twelve sets all four are `established`**, and by margins this file has
  // rarely seen: `gnome < dwarf` strict in 4/4 comparable sets at 277.0 ± 7.6
  // ticks = **36.3 SE**, `draconic < dwarf` 3/3 at 259.8 ± 8.1 = **32.1 SE**,
  // `human < dwarf` 4/4 at 202.4 ± 24.5 = **8.3 SE**, `orc < dwarf` 2/2 at
  // 253.0 ± 36.0 = **7.0 SE**.
  //
  // **The `verdict` column below is the four-set reading, because that is what
  // this file runs**, and at four sets every one of them is `inconclusive` for
  // want of comparable sets — dwarf arrives in one of the four and orc in none
  // of the sets dwarf does, so three pairs have a single comparable set and a
  // `NaN` standard error and the fourth has none at all. **That is a statement
  // about power, not about ordering**: where the two species could be compared,
  // the claimed order held in every set. The `#140` block below asserts that
  // distinction rather than leaving it in prose.
  {
    faster: 'gnome',
    slower: 'dwarf',
    assertedAs: 'beforeDwarf.high < dwarf.low — established at twelve sets, 36.3 SE',
    status: 'asserted',
    verdict: 'inconclusive',
  },
  {
    faster: 'draconic',
    slower: 'dwarf',
    assertedAs: 'beforeDwarf.high < dwarf.low — established at twelve sets, 32.1 SE',
    status: 'asserted',
    verdict: 'inconclusive',
  },
  {
    faster: 'human',
    slower: 'dwarf',
    assertedAs: 'beforeDwarf.high < dwarf.low — established at twelve sets, 8.3 SE',
    status: 'asserted',
    verdict: 'inconclusive',
  },
  {
    faster: 'orc',
    slower: 'dwarf',
    assertedAs: 'beforeDwarf.high < dwarf.low — established at twelve sets, 7.0 SE',
    status: 'asserted',
    verdict: 'inconclusive',
  },
  // **Retired on `w185/cohort-source`, 2026-08-14, at 6/12.** It was 12/12 when
  // it was asserted. W185 opened the occupation transfer valve — which had been
  // welded shut by a per-cohort floor — and filled university seats from `idle`
  // only, so *who becomes a student* changed and with it who is promoted and
  // when. Dwarf's between-set spread widened from single ticks to 3.0, and its
  // interval now reaches into elf's in half the sets. The paired gap is still
  // 24.6 SE in dwarf's favour, which is why this is `inconclusive` and not
  // `refuted`: the effect is real and the interval test cannot state it.
  // **Reversed on W116, and the reversal is the largest single species movement
  // this instrument has recorded.** It was established at 12/12 sets; it is now
  // *refuted* at 0/12, with elf arriving before dwarf by 8.6 paired standard
  // errors. Dwarf's own mean went from among the fastest to **234.9 ± 23.5
  // ticks against gnome's 23.8** — the slowest species to tier 3, by an order of
  // magnitude, where it used to be second-fastest.
  //
  // This is a mechanism and not a re-roll, and the two independent readings
  // agree on which species: `species-occupancy` has dwarf falling 12 → 5 cells
  // over the same change, the largest move in *that* series too. Dwarf carries
  // the highest `scribeAffinity` in the content, `completeAffiliation` gained a
  // caller, and a month spent writing a node down is a month not spent reaching
  // the next tier. **Time to tier is a breadth measure, and this branch buys
  // depth with breadth**; the species that trades hardest is the one that
  // scribes best.
  //
  // Recorded as a refutation rather than retired, because the row is the
  // measurement. Nothing was tuned: every species magnitude still carries
  // `tuningStatus: "untuned"`.
  //
  // **And retired a second time, independently, on
  // `w247/material-economy-build`.** The two readings do not contradict each
  // other — they are two different causes pushing the same row off `established`
  // — and both are kept. `main`'s `refuted` verdict is left in place below
  // rather than being replaced by the branch's `inconclusive`: neither was
  // measured on the merged tree, and inventing a third verdict at a merge is
  // the thing this file exists to make hard. The branch's reading verbatim:
  //
  // **Retired 2026-08-16 on `w247/material-economy-build`, at four sets.** It
  // was `established` and is now `inconclusive`: strict in **1 of 4** sets with
  // a gap of **1.1 SE**, which is inside the cross-seed spread. Dwarf's tier-3
  // interval over the committed six seeds went `[25, 30]` to `[22, 66]` — one
  // seed carries the whole widening — while elf's stayed `[37, 42]`.
  // 
  // The cause is `material-economy` giving the v1 opening square's Mentem and
  // Limen forms a `resource-yield` node apiece: `GOAL.applyMagic` becomes a
  // live choice inside the shipped rectangle, and a month spent casting is a
  // month not spent reaching tier 3. Which species that costs most is a
  // property of `curiosity` and the affinities, not a decision anybody took.
  // 
  // Retired next door in the same commit, and its source text is pinned in
  // {@link RETIRED_ASSERTIONS} below.
  // **Re-recorded 2026-08-16 on `w/exp-yields`: `refuted` -> `inconclusive`, and
  // it is power rather than direction.** At twelve sets `elf < dwarf` is
  // INCONCLUSIVE at 1/4 comparable sets, 41.8 ± 83.1 ticks = 0.5 SE; the reverse
  // pair has one comparable set at four and reports a `NaN` standard error. Both
  // species are censored in five sixths of the runs — dwarf 65/72, elf 64/72 —
  // so there is almost nothing left to compare. Stays retired.
  {
    faster: 'dwarf',
    slower: 'elf',
    assertedAs: 'beforeElf.high < elf.low — refuted on W116, no longer asserted',
    status: 'retired',
    verdict: 'inconclusive',
  },
  // W116 added a second `gnome < elf` row here, to replace the `dwarf < elf`
  // row above as the sibling file's other `beforeElf` binding. On the Group F
  // merge, 2026-08-16, that row is **dropped as a duplicate**: `gnome < elf` is
  // already the first entry in this list on `main`, so the union of the two
  // sides listed one claim twice and made `filter(status === 'asserted')` read
  // three where the sibling file binds two. W116's finding is the *retirement*
  // above, which stands; the replacement row was only needed on a tree where
  // `gnome < elf` was not already here.
  // **Re-recorded 2026-08-16 on `w/exp-yields`: `established` -> `inconclusive`,
  // and this is the row that costs the most.** At twelve sets: strict in 3/11
  // comparable sets, paired gap 69.0 ± 16.6 ticks = 4.2 SE, per-set endpoint gap
  // [-181, 42]. Gnome is still the fastest column the instrument has (377.8 ±
  // 4.7, censored 2/72) and human is now censored in 48 of 72 runs, so the sets
  // where human *does* arrive are the sets where it arrived unusually early —
  // which is precisely the selection effect that makes an endpoint comparison
  // stop reproducing. The mean gap is unchanged in sign and healthy in size.
  //
  // It is **not** re-retired. The claim is asserted next door and the honest
  // verdict here is that this tree cannot currently establish it, which is what
  // `inconclusive` says.
  // **Retired on `integration/all-branches`, 2026-08-17, and this time it is
  // refuted on the sibling file's own seed set as well.** There it reads gnome
  // `[317, 386]` against human `[370, 370]`: gnome's slowest seed is slower than
  // human's single observed one, so `gnome.high < human.low` is false where it
  // was asserted. Twelve sets: `inconclusive`, strict in 5 of 11 comparable
  // sets, paired gap 66.6 ± 15.8 ticks = 4.2 SE, human censored in 49 of 72.
  //
  // The row has gone 12/12 -> 3/11 -> 5/11 across three measurements without the
  // sign ever reversing, which is the signature of a real effect that this
  // instrument has stopped being able to see. Kept in the list rather than
  // deleted, per this file's own rule.
  {
    faster: 'gnome',
    slower: 'human',
    assertedAs: 'gnome.high < human.low — retired 2026-08-17, no longer asserted',
    status: 'retired',
    verdict: 'inconclusive',
  },
  // Strict in 11 of 12 sets at the bin's default design — a real effect, and not
  // reproducible enough for a file with one seed set to assert. It fails in
  // exactly the sets where elf's own interval reaches down to 45.
  //
  // **Re-recorded 2026-08-16 on the Group B integration branch: `inconclusive`
  // -> `refuted`, and it is the *direction* that moved, not the strength.**
  // Re-measured as this file's failure text instructs, with
  // `node packages/scenario/bin/species-separation.mjs --sets 12`:
  //
  //     elf < orc    REFUTED   strict in 0/12 sets, paired gap 7.9 ± 8.3 ticks
  //                            = 0.9 SE, per-set endpoint gap [-16, -4]
  //
  // The claimed order is backwards in every one of the twelve sets, which is
  // what `refuted` means here — not "a weaker version of the same claim".
  //
  // Cause is `w80/research-cost-variation`, merged into this branch: it reprices
  // 299 of `node.json`'s `researchCost` values. What it did to `orc` is visible
  // in orc's own spread — mean 40.0 ± 8.2 SE with a between-set sd of 28.4 and
  // endpoints travelling 8/378 ticks, against elf's 32.1 ± 0.2 SE. Orc is now
  // the volatile species, and a pair with one volatile member reorders easily.
  // Kept rather than deleted, per this file's own rule.
  //
  // **Prior measurement, kept as history**, from `w185/cohort-source` 2026-08-14
  // (Group F):
  // Strict in 11 of 12 sets when it was retired — a real effect, and not
  // reproducible enough for a file with one seed set to assert. **Re-measured
  // on `w185/cohort-source`, 2026-08-14: 0/12, and the order is backwards.**
  // Elf now arrives before orc by 2.9 SE. Retiring it was right and the reason
  // has changed; it is recorded rather than quietly re-verdicted, because a
  // claim that goes from 11/12 to reversed is a fact about how little the
  // interval test was ever saying.
  //
  // `material-economy`'s reading of the same row, 2026-08-16, kept beside
  // `main`'s rather than replacing it:
  //
  // Was strict in 11 of 12 sets at the bin's default design, and **is now
  // refuted outright**: re-measured 2026-08-16 at four sets, elf arrives before
  // orc by **−11.3 SE** — the claimed order is backwards. Orc's tier-3 interval
  // over the committed six seeds went `[32, 51]` to `[57, 177]` while elf's did
  // not move, so orc is the species that pays most for the new verb.
  //
  // Retiring it a second time is not possible and would not be right either:
  // the row stays retired and the *verdict* moves, which is exactly what the
  // file's own instruction asks for — *"re-record this row with the new numbers
  // and the reason — do not delete it."*
  // **Re-recorded 2026-08-16 on `w/exp-yields`: `refuted` -> `inconclusive`.**
  // At twelve sets `orc < elf` is strict in 3/5 comparable sets at 140.7 ± 68.2
  // ticks = 2.1 SE — the claimed order now holds *more often than not*, where
  // the previous reading had it backwards in every set. Nothing here rehabilitates
  // the claim: orc is censored 63/72 and elf 64/72, so five comparable sets out
  // of twelve is what a verdict is being read off. Stays retired.
  {
    faster: 'orc',
    slower: 'elf',
    assertedAs: 'orc.high < elf.low — retired 2026-08-14',
    status: 'retired',
    verdict: 'inconclusive',
  },
  // **Re-recorded 2026-08-16, and it moved the opposite way to the row above:
  // `refuted` -> `inconclusive`.** Same twelve-set re-measurement:
  //
  //     human < orc  INCONCLUSIVE  strict in 2/12 sets, paired gap 17.3 ± 8.2
  //                                ticks = 2.1 SE, per-set endpoint gap [-4, 5]
  //
  // Neither established nor backwards: the gap is real in sign but small against
  // its own cross-seed spread, and that spread is orc's, as the row above
  // records. Same cause. Two rows swapping verdicts in *opposite* directions off
  // one content change is the honest summary of what a repricing does to a pair
  // of claims that were already near the edge — and the reason neither should be
  // read as a balance decision.
  //
  // Both rows stay `retired`. Nothing here argues for re-asserting either: a
  // verdict that moves when content moves is exactly why this file pins
  // verdicts rather than intervals.
  //
  // **Prior measurement, kept as history**, from `w185/cohort-source` 2026-08-14
  // (Group F): it held in 12/12 sets at 7.3 SE there and was kept retired anyway,
  // deliberately — this claim has now been true, false and true again across
  // builds of a subsystem whose magnitudes are all `tuningStatus: "untuned"`.
  //
  // `material-economy`'s reading of the same row, 2026-08-16, kept beside
  // `main`'s rather than replacing it:
  //
  // The mirror image, and it is the more interesting of the pair. #127's claim
  // was `refuted` at 0/12 sets; at four sets on this build it is
  // **inconclusive** — strict in 3 of 4, gap 16.4 SE. Orc slowing down is what
  // moved it, and the reading is not a rehabilitation: a claim that goes from
  // *never* to *usually* on a content change is a claim about the content, and
  // the file's whole subject is that a strict ordering is the statistic most
  // likely to look clean by accident.
  //
  // **Left retired.** It is not re-asserted next door, and it should not be
  // until somebody re-measures it at the bin's twelve sets rather than at this
  // tripwire's four.
  {
    faster: 'human',
    slower: 'orc',
    assertedAs: 'human.high < orc.low — retired 2026-08-14',
    status: 'retired',
    verdict: 'inconclusive',
  },
];

/**
 * The exact assertion text of every retired claim, so that re-adding one fails
 * here rather than passing next door.
 *
 * A deleted assertion leaves no trace, and the next author to read a promising
 * six-seed table will write the same line again. This is the trace.
 */
const RETIRED_ASSERTIONS: readonly { readonly source: string; readonly heldIn: string }[] = [
  // `material-economy`'s, 2026-08-16. `beforeElf` was `[gnome, dwarf]` and is
  // `[gnome]`, so the loop that asserted both now asserts one. The *site*
  // survives — `beforeElf` still holds `gnome` — so what is pinned is the
  // **binding**, which is the line a future author would have to write again to
  // re-assert the claim.
  { source: 'const beforeElf = [gnome, dwarf]', heldIn: '1/4 sets on w247' },
  {
    source: 'expect(human.high).toBeLessThan(orc.low)',
    heldIn: '0/12 sets when retired, 12/12 on w185, 3/4 on w247 — see the row above',
  },
  {
    source: 'expect(orc.high).toBeLessThan(elf.low)',
    heldIn: '11/12 sets, 0/12 on w185, refuted at -11.3 SE on w247',
  },
  { source: 'expect(draconic.low).toBeLessThan(human.low)', heldIn: '5/12 sets' },
  { source: 'expect(overlaps(gnome, dwarf)).toBe(true)', heldIn: '7/12 sets' },
  // ---- Retired on `integration/all-branches`, 2026-08-17. ----
  //
  // The whole `beforeElf` binding went, and with it the last two claims this
  // file had that did not name dwarf. See the rows above for the rates.
  { source: 'const beforeElf = [gnome]', heldIn: '4/5 comparable sets, 3.7 SE at twelve' },
  {
    source: 'expect(gnome.high).toBeLessThan(human.low)',
    heldIn: '5/11 comparable sets at twelve, and false on the six seeds it was asserted over',
  },
  {
    source: 'expect(draconic.high).toBeGreaterThan(elf.high)',
    heldIn:
      'refuted — draconic means 441.1 against elf 603.9, so draconic now ends before elf ' +
      'rather than long after it',
  },
];

/** #140's claim, judged here because it is the reason this file exists. */
const CLAIMED_CHAIN = ['gnome', 'dwarf', 'human', 'elf'] as const;

let report: SeparationReport;

beforeAll(async () => {
  report = await measureSpeciesSeparation({
    tier: TIER,
    sets: SETS,
    ticks: HORIZON_TICKS,
    content: referenceContent(),
  });
}, TIMEOUT_MS);

describe('the instrument measures what the sibling file measures', () => {
  it('reads the same arrivals out of the same call', async () => {
    // Structural rather than a pinned interval: the point is that a seed set is
    // nothing but the sibling file's own measurement taken more than once, and a
    // second path to the number would be a second thing to be wrong.
    const content = referenceContent();
    const runSeed = separationRunSeeds(separationRootSeed(0), SEEDS_PER_SET)[0] as number;
    const direct = await runLongReference({ runSeed, ticks: HORIZON_TICKS, content });
    const arrivals = timeToTierBySpecies(direct, TIER);

    const set = await measureSeedSet({
      label: 'one run',
      runSeeds: [runSeed],
      tier: TIER,
      ticks: HORIZON_TICKS,
      content,
    });

    expect(set.species).toHaveLength(arrivals.length);
    set.species.forEach((sample, index) => {
      const arrival = arrivals[index];
      if (arrival === undefined) {
        expect(sample.observed, `${sample.speciesId} was censored`).toEqual([]);
        expect(sample.censored).toBe(1);
      } else {
        expect(sample.observed, sample.speciesId).toEqual([arrival]);
      }
    });
  }, TIMEOUT_MS);

  it('derives every run seed from the harness rather than from a scheme of its own', () => {
    // `deriveRunSeed`'s pairing is a bijection, so distinct coordinates give
    // distinct seeds — always, not with high probability. Asserted because a
    // seed set that quietly repeated a seed would report a spread that is too
    // small in exactly the direction that flatters a claim.
    const seeds = report.sets.flatMap((set) => [...set.runSeeds]);
    expect(seeds).toHaveLength(SETS * SEEDS_PER_SET);
    expect(new Set(seeds).size).toBe(seeds.length);
  });
});

describe('every strict separation this repository asserts, re-rolled', () => {
  it('prints the measurement every verdict below is read off', () => {
    for (const line of formatSeparationReport(report)) console.log(line);
    for (const claim of CLAIMED_SEPARATIONS) {
      console.log(`  ${formatPairSeparation(separationOf(report, claim.faster, claim.slower))}`);
    }
    expect(report.sets).toHaveLength(SETS);
  });

  it.each(CLAIMED_SEPARATIONS)(
    '$faster < $slower ($status: $assertedAs) is $verdict across seed sets',
    ({ faster, slower, verdict }) => {
      const pair = separationOf(report, faster, slower);
      const measured = verdictOf(pair);
      expect(
        measured.verdict,
        `${faster} < ${slower} is now ${measured.verdict}, not ${verdict}: ${measured.reason}. ` +
          'Re-measure with `node packages/scenario/bin/species-separation.mjs --sets 12` and ' +
          're-record this row with the new numbers and the reason — do not delete it.',
      ).toBe(verdict);
    },
    TIMEOUT_MS,
  );

  it('finds the sibling file\'s "these two are indistinguishable" claim seed-dependent too', () => {
    // `expect(overlaps(gnome, dwarf)).toBe(true)` next door. Non-overlap is the
    // complement of a strict separation whenever neither species is censored and
    // the order never reverses, and both hold for this pair in every set — so
    // `strictSets` counts exactly the sets in which that assertion is false.
    const pair = separationOf(report, 'gnome', 'dwarf');
    console.log(
      `overlaps(gnome, dwarf) is false in ${String(pair.strictSets)}/` +
        `${String(pair.comparableSets)} sets — the sibling file asserts it true`,
    );
    // **This assertion fails on `03d21899` (Group F combined, 2026-08-16) with
    // `dwarf censored: 9`, and it is left failing on purpose.** Its premise —
    // *"neither species is censored"* — is what licenses reading `strictSets`
    // as the complement of the sibling file's overlap claim, so a censored
    // dwarf does not move a number here, it removes the ground the whole test
    // stands on. Re-pinning `0` to `9` would leave the reasoning above asserting
    // something the data contradicts, and deleting the check would lose the one
    // signal that says so.
    //
    // What it is telling you: dwarf fails to reach tier 3 at all in 9 of 12
    // seed sets on the composed tree. `species-occupancy.test.ts` reads the same
    // species at **2** occupied cells against 9-12 for the other five. Both are
    // consequences of `completeAffiliation` gaining a production caller
    // (`w204/affiliate-writer`) on top of W23's student pool and W116's seat
    // bound — dwarf has the highest `scribeAffinity` in the content and now
    // spends its months writing. That is a balance finding for the owner and not
    // a merge artefact, and it needs a decision before this row can be honest
    // again.
    //
    // **Re-recorded 2026-08-16 on `w/exp-yields`, and the paragraph above is
    // now true of five species rather than one.** Dwarf's censoring is no
    // longer a dwarf story: at twelve sets, dwarf is censored 65/72, elf 64/72,
    // orc 63/72, draconic 57/72 and human 48/72, against gnome's 2/72. The
    // whole population reaches tier 3 later on this branch — see the block
    // above `CLAIMED_SEPARATIONS` for the measurement and the cause — so a
    // check pinned at "gnome and dwarf are both uncensored" cannot hold and
    // cannot be repaired by moving one number.
    //
    // Rewritten to assert what still licenses the reading: **gnome** must be
    // uncensored, because it is gnome's interval the overlap claim is made
    // against, and the pair must have at least one comparable set or
    // `strictSets` below is a statistic over nothing. Dwarf's censoring is
    // asserted as *present and named* rather than pinned to a rate, so a tree
    // that fixes it fails here and gets to delete this paragraph.
    const gnomeSpread = report.spreads.find((entry) => entry.speciesId === 'gnome');
    expect(gnomeSpread?.censored, 'gnome censored').toBe(0);
    const dwarfSpread = report.spreads.find((entry) => entry.speciesId === 'dwarf');
    expect(
      dwarfSpread?.censored,
      'dwarf now reaches tier 3 in every run, so the paragraph above is stale — delete it',
    ).toBeGreaterThan(0);
    expect(pair.comparableSets, 'no set compares gnome against dwarf at all').toBeGreaterThan(0);
    // 5 of 12 at the bin's default design, 2 of 4 here. Asserted as "not always
    // true" rather than as a rate, because the rate is a function of how many
    // sets were taken and the claim next door is not.
    expect(
      pair.strictSets,
      'gnome and dwarf now overlap in every seed set, so the sibling file\'s ' +
        'indistinguishability assertion has stopped being seed-dependent. Re-measure with ' +
        '`--sets 12` and re-record this, in both files.',
    ).toBeGreaterThan(0);
  });

  it('accounts for every strict separation the sibling file asserts', () => {
    // The tripwire. A new `expect(a.high).toBeLessThan(b.low)` next door is a
    // new separation claim, and a new separation claim without a row above is a
    // claim with no spread behind it — which is the whole defect this file
    // exists for. Counting is crude and it is enough: it cannot be satisfied by
    // accident and it names exactly what to do.
    const sibling = readFileSync(
      fileURLToPath(new URL('./reference-time-to-tier.test.ts', import.meta.url)),
      'utf8',
    );
    const asserted = sibling.match(/\.high\)\.toBeLessThan\(/g) ?? [];
    expect(
      asserted.length,
      'reference-time-to-tier.test.ts changed how many strict separations it asserts. Add or ' +
        'remove the matching row in CLAIMED_SEPARATIONS so that every separation this ' +
        'repository publishes carries the number of seed sets it survives.',
    ).toBe(1);
    // **Two sites, two asserted separations, and it was two sites and three
    // before `w185/cohort-source`.** The loop over `beforeElf` is one site; it
    // held two species until `dwarf < elf` fell to 6/12 under W185 and is down
    // to `gnome` alone. `orc` had been dropped from it earlier, when
    // `orc < elf` was retired at 11/12. The count is the tripwire and the two
    // lines below say which two sites it is, so that swapping one claim for
    // another cannot keep the count.
  //
  // `material-economy`'s reading of the same row, 2026-08-16, kept beside
  // `main`'s rather than replacing it:
  //
    // **One site and four asserted separations on `integration/all-branches`,
    // 2026-08-17.** It was four sites and five before 2026-08-14, three until
    // 2026-08-16, and two until now. The sibling's loop is the single site and
    // it runs over `[gnome, draconic, human, orc]`, all four against `dwarf` —
    // `beforeElf` is gone entirely, with both of its claims retired above. The
    // count over *sites* and the count over *claims* have stopped being equal,
    // which is why both are asserted and why the two `toContain` lines below
    // name the loop **and** its membership: swapping one species for another
    // inside the list would otherwise keep every number here intact.
    // **One site and four separations on `integration/all-branches`, 2026-08-17.**
    // It was two sites and two. The count above is over *sites* and the count
    // below is over *claims*, and they stopped being equal when `beforeDwarf`
    // took four species where `beforeElf` had one — which is exactly why both
    // are asserted rather than one standing in for the other.
    expect(sibling).toContain('for (const entry of beforeDwarf) expect(entry.high)');
    expect(sibling).toContain('const beforeDwarf = [gnome, draconic, human, orc]');
    expect(CLAIMED_SEPARATIONS.filter((claim) => claim.status === 'asserted')).toHaveLength(4);
  });

  it.each(RETIRED_ASSERTIONS)(
    'keeps $source out of the sibling file — it held in only $heldIn',
    ({ source, heldIn }) => {
      // Deleting an assertion leaves no trace, and the next author to read a
      // promising six-seed table will write the same line again. This is the
      // trace: re-adding one of these fails here, naming the rate that retired
      // it, instead of passing next door on the one seed set it was true of.
      const sibling = readFileSync(
        fileURLToPath(new URL('./reference-time-to-tier.test.ts', import.meta.url)),
        'utf8',
      );
      expect(
        sibling.includes(source),
        `${source} is back in reference-time-to-tier.test.ts. It held in ${heldIn} when it was ` +
          'retired on 2026-08-14. If a change has made it reproduce, re-measure with ' +
          '`node packages/scenario/bin/species-separation.mjs --sets 12` and move this row into ' +
          'CLAIMED_SEPARATIONS with its new rate — do not simply re-assert it.',
      ).toBe(false);
    },
  );
});

describe("#140's four-species chain", () => {
  it('does not survive a re-roll, and the numbers say so', () => {
    const verdict = chainVerdictOf(report, [...CLAIMED_CHAIN]);
    console.log(`chain ${CLAIMED_CHAIN.join(' < ')}: ${verdict.verdict} — ${verdict.reason}`);
    for (const link of verdict.links) console.log(`  ${formatPairSeparation(link)}`);

    // Measured at twelve sets on both refs, and the chain held in **0/12** on
    // `main` at `cc20d54` and **1/12** on `w18/academic-primitive-consumers` at
    // `1ae52c3` — which is the branch that claimed it. Only one of its three
    // links, `human < elf`, reproduces at all; `gnome < dwarf` held in 4/12 and
    // `dwarf < human` in 3/12.
    //
    // Asserted as a bound rather than as an equality because four sets is a
    // tripwire and twelve is the measurement: what must not silently become true
    // is that the chain starts holding everywhere without anybody re-measuring.
    expect(verdict.setsHolding).toBeLessThan(verdict.comparableSets);
    expect(verdict.verdict).not.toBe('established');
  });

  it('has no link that reproduces at four sets, and censoring rather than ordering is why', () => {
    // `human < elf` was the link: established on `main` too, at 12/12 sets and
    // 64.7 SE, and worth naming so nobody reads "the chain does not reproduce"
    // as "nothing separates".
    //
    // **W116 knocked it to inconclusive — 4/12 sets — and the reason is elf
    // rather than human.** Human is one of the tightest columns the instrument
    // has (29.1 ± 0.2, endpoints travelling 3 and 8 ticks); elf's interval
    // widened enough to reach under it in eight sets of twelve. The paired gap
    // is still +15.4 ticks at 10.5 SE, so human is *on average* faster and the
    // per-set endpoint comparison no longer holds reliably — which is exactly
    // the distinction this file exists to draw.
    //
    // `gnome < human` is asserted instead. It is 12/12 sets at **32.1 SE**, the
    // most robust separation in the report, established before this branch and
    // unmoved by it. So the claim "not everything separates, but something
    // does" survives on a stronger link than the one it used to rest on.
    //
    // **Re-recorded 2026-08-16 on `w/exp-yields`: `gnome < human` is
    // `inconclusive` here too, at 3/11 comparable sets and 4.2 SE.** So the
    // consolation this test used to offer — *"not everything separates, but
    // something does"* — no longer rests on `gnome < human`.
    //
    // It rests on `gnome < dwarf`, which is the strongest row in the twelve-set
    // report: **ESTABLISHED, strict in 5/5 comparable sets, paired gap 287.1 ±
    // 11.2 ticks = 25.7 SE**, and it is the first adjacent link of #140's own
    // chain. The link is *replaced* rather than the assertion weakened, which is
    // this file's rule for a seed and is the same rule here; the previous link
    // is recorded above rather than deleted.
    //
    // Both are asserted, so the sentence this test is named for stays checkable:
    // one link reproduces and the one that used to no longer does.
    //
    // ## Re-authored on `integration/all-branches`, 2026-08-17 — nothing reproduces here now
    //
    // This asserted `gnome < dwarf` **established**, and it reads
    // `inconclusive`. So does every other *forward* pair this report can form:
    // measured at four sets on this tree, **not one ordered pair in either
    // direction is `established`.** The only verdicts the thirty pairs produce
    // are `inconclusive` and — on reversals against gnome, the one column this
    // horizon does not censor — `refuted`, which is evidence *for* the forward
    // ordering rather than against it.
    //
    // **That is a statement about power and not about ordering**, and the
    // difference is the whole subject of this file. Censoring at the 720-tick
    // horizon, 24 runs:
    //
    //     gnome     0/24 censored      draconic  17/24
    //     human    15/24               elf       21/24
    //     dwarf    22/24               orc       23/24
    //
    // Four of six species arrive in at most two of the four sets, so most pairs
    // have one comparable set, a `NaN` standard error, and no verdict available
    // to them at any effect size. `gnome < dwarf` is strict in **1 of 1**
    // comparable sets with a paired gap of **+289.8 ticks** — the ordering is
    // exactly what it was and there is nothing to divide by.
    //
    // At twelve sets the same pair is **ESTABLISHED**: strict in 4 of 4
    // comparable sets, 277.0 ± 7.6 ticks = **36.3 SE**, which is the largest
    // separation this instrument has ever recorded. So the claim is alive; four
    // sets can no longer see it. The module note above says four is a tripwire
    // and twelve is the measurement, and this is the first tree on which that
    // distinction has cost anything.
    //
    // Asserted as the three facts that make "power, not ordering" checkable
    // rather than merely stated: the verdict, the comparable-set count that
    // caused it, and the sign and strictness of what could be compared. If a
    // later change gives the slow species time to arrive, `comparableSets` rises
    // and this fails — which is the signal to come back and re-assert the
    // established form.
    expect(verdictOf(separationOf(report, 'gnome', 'human')).verdict).toBe('inconclusive');

    const gnomeDwarf = separationOf(report, 'gnome', 'dwarf');
    expect(verdictOf(gnomeDwarf).verdict).toBe('inconclusive');
    expect(gnomeDwarf.comparableSets).toBeLessThan(SETS);
    // Where it could be compared at all, the ordering held and held strictly.
    expect(gnomeDwarf.strictSets).toBe(gnomeDwarf.comparableSets);
    expect(gnomeDwarf.meanGap).toBeGreaterThan(0);

    // And the general fact, so that "nothing reproduces" is measured rather than
    // inferred from one pair: every ordered pair the report can form, judged.
    //
    // **`established` and not "only inconclusive"**, and the difference is a
    // measurement rather than a nicety. Both directions of a pair are formed
    // here, so a `refuted` verdict on `human < gnome` is the *same finding* as a
    // holding `gnome < human` — gnome is the one column this horizon does not
    // censor, so the reversed pairs against it are the only ones with four
    // comparable sets, which is exactly `MIN_SETS_FOR_REFUTATION` and exactly
    // enough to refute. Asserting no verdict is `inconclusive` would therefore
    // have failed on evidence *for* the ordering this file publishes.
    const verdicts = new Set<string>();
    for (const faster of report.speciesIds) {
      for (const slower of report.speciesIds) {
        if (faster === slower) continue;
        verdicts.add(verdictOf(separationOf(report, faster, slower)).verdict);
      }
    }
    expect([...verdicts].sort()).not.toContain('established');

    // The cause, read off the report rather than asserted in prose: gnome is the
    // only species this horizon does not censor, and four of the other five are
    // censored in at least four fifths of the runs.
    const censoredOf = (id: string): number => {
      const found = report.spreads.find((entry) => entry.speciesId === id);
      if (found === undefined) throw new Error(`no spread for ${id}`);
      return found.censored;
    };
    expect(censoredOf('gnome')).toBe(0);
    for (const id of ['dwarf', 'elf', 'orc']) {
      expect(censoredOf(id) * 5, `${id} censoring`).toBeGreaterThan(report.runCount * 4);
    }
  });
});
