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
 * Generous, and deliberately more generous per run than the sibling file's 300
 * seconds for six runs.
 *
 * This is twenty-five runs on a shared box that has been seen at load 300, and
 * a timeout here would read as a real defect in an instrument whose whole
 * subject is not mistaking noise for a finding. Observed cost is about 150
 * seconds at load 11.
 */
const TIMEOUT_MS = 900_000;

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
  {
    faster: 'gnome',
    slower: 'elf',
    assertedAs: 'beforeElf.high < elf.low',
    status: 'asserted',
    verdict: 'established',
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
  {
    faster: 'dwarf',
    slower: 'elf',
    assertedAs: 'beforeElf.high < elf.low — refuted on W116, no longer asserted',
    status: 'retired',
    verdict: 'refuted',
  },
  // Established on W116 at 12/12 sets and 13.3 SE, replacing the row above as
  // the sibling file's second `beforeElf` binding. `gnome < elf` was true before
  // and is unchanged by this branch; it is listed now because it is asserted
  // now.
  {
    faster: 'gnome',
    slower: 'elf',
    assertedAs: 'beforeElf.high < elf.low',
    status: 'asserted',
    verdict: 'established',
  },
  {
    faster: 'gnome',
    slower: 'human',
    assertedAs: 'gnome.high < human.low',
    status: 'asserted',
    verdict: 'established',
  },
  // Strict in 11 of 12 sets when it was retired — a real effect, and not
  // reproducible enough for a file with one seed set to assert. **Re-measured
  // on `w185/cohort-source`, 2026-08-14: 0/12, and the order is backwards.**
  // Elf now arrives before orc by 2.9 SE. Retiring it was right and the reason
  // has changed; it is recorded rather than quietly re-verdicted, because a
  // claim that goes from 11/12 to reversed is a fact about how little the
  // interval test was ever saying.
  {
    faster: 'orc',
    slower: 'elf',
    assertedAs: 'orc.high < elf.low — retired 2026-08-14',
    status: 'retired',
    verdict: 'refuted',
  },
  // **The one that came back.** Retired at 0/12 as #127's retracted claim, and
  // on `w185/cohort-source` it holds in 12/12 sets at 7.3 SE. It stays retired
  // anyway, and that is a deliberate refusal rather than an oversight: this
  // claim has now been true, false, and true again across three builds of a
  // subsystem whose magnitudes are all `tuningStatus: "untuned"`, and
  // re-asserting it in a fix PR would be the third time somebody published it
  // on one build's numbers. Whoever re-asserts it should do so on purpose, with
  // a second ref measured, and should move this row to `asserted` when they do.
  {
    faster: 'human',
    slower: 'orc',
    assertedAs: 'human.high < orc.low — retired 2026-08-14',
    status: 'retired',
    verdict: 'established',
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
  {
    source: 'expect(human.high).toBeLessThan(orc.low)',
    heldIn: '0/12 sets when retired, and 12/12 on w185 — see the row above',
  },
  { source: 'expect(orc.high).toBeLessThan(elf.low)', heldIn: '11/12 sets, and 0/12 on w185' },
  { source: 'expect(draconic.low).toBeLessThan(human.low)', heldIn: '5/12 sets' },
  { source: 'expect(overlaps(gnome, dwarf)).toBe(true)', heldIn: '7/12 sets' },
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
    for (const speciesId of ['gnome', 'dwarf']) {
      const spread = report.spreads.find((entry) => entry.speciesId === speciesId);
      expect(spread?.censored, `${speciesId} censored`).toBe(0);
    }
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
    ).toBe(2);
    // **Two sites, two asserted separations, and it was two sites and three
    // before `w185/cohort-source`.** The loop over `beforeElf` is one site; it
    // held two species until `dwarf < elf` fell to 6/12 under W185 and is down
    // to `gnome` alone. `orc` had been dropped from it earlier, when
    // `orc < elf` was retired at 11/12. The count is the tripwire and the two
    // lines below say which two sites it is, so that swapping one claim for
    // another cannot keep the count.
    expect(sibling).toContain('for (const entry of beforeElf) expect(entry.high)');
    expect(sibling).toContain('expect(gnome.high).toBeLessThan(human.low)');
    expect(CLAIMED_SEPARATIONS.filter((claim) => claim.status === 'asserted')).toHaveLength(2);
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

  it('has one link that does reproduce, and it is not new', () => {
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
    const link = separationOf(report, 'gnome', 'human');
    expect(verdictOf(link).verdict).toBe('established');
  });
});
