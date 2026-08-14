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
 * Twelve independent seed sets of six seeds, tier 3, 720 ticks. Two of the five
 * separations `reference-time-to-tier.test.ts` asserts **do not reproduce**:
 *
 * ```text
 *  gnome < human   strict in 12/12 sets     gap  5.6 ± 0.1 ticks  =  70.5 SE
 *  gnome < elf     strict in 12/12 sets     gap 30.5 ± 0.3 ticks  =  90.4 SE
 *  dwarf < elf     strict in 12/12 sets     gap 27.1 ± 0.4 ticks  =  62.2 SE
 *  orc   < elf     strict in 11/12 sets     gap 20.6 ± 0.8 ticks  =  26.7 SE
 *  human < orc     strict in  0/12 sets     gap  4.3 ± 0.8 ticks  =   5.4 SE
 * ```
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

const TIMEOUT_MS = 600_000;

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
  readonly verdict: SeparationVerdict;
}[] = [
  { faster: 'gnome', slower: 'elf', assertedAs: 'fastTrio.high < elf.low', verdict: 'established' },
  { faster: 'dwarf', slower: 'elf', assertedAs: 'fastTrio.high < elf.low', verdict: 'established' },
  // Strict in 11 of 12 sets at the bin's default design — real, and not
  // reproducible enough to call established. It fails in exactly the sets where
  // elf's own interval reaches down to 45.
  { faster: 'orc', slower: 'elf', assertedAs: 'orc.high < elf.low', verdict: 'inconclusive' },
  {
    faster: 'gnome',
    slower: 'human',
    assertedAs: 'gnome.high < human.low',
    verdict: 'established',
  },
  { faster: 'human', slower: 'orc', assertedAs: 'human.high < orc.low', verdict: 'refuted' },
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
    '$faster < $slower ($assertedAs) is $verdict across seed sets',
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
    ).toBe(4);
    // Four `toBeLessThan` sites, five claims: the `fastTrio` loop is one site
    // and three separations.
    expect(sibling).toContain('for (const entry of fastTrio) expect(entry.high)');
    expect(CLAIMED_SEPARATIONS).toHaveLength(5);
  });
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
    // `human < elf` is established on `main` too, at 12/12 sets and 64.7 SE. It
    // is worth naming so that nobody reads "the chain does not reproduce" as
    // "nothing separates": four relations separate robustly, and they are the
    // same four before and after #140.
    const link = separationOf(report, 'human', 'elf');
    expect(verdictOf(link).verdict).toBe('established');
  });
});
