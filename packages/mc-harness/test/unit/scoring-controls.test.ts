/*
 * Multiverse Mages — a scoring term that cannot tell a broken system from a
 * working one fails this suite.
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
 * The campaign's rule, made executable:
 *
 * > *"Before you use a metric to evaluate a fix, you must demonstrate that the
 * > metric can distinguish between a system you know is broken and a system you
 * > know is working."*
 * >
 * > *"You were treating the metric as a definition rather than as a claim.
 * > Definitions don't need testing. Claims do."*
 *
 * Four kinds of assertion live here, and each corresponds to a way a term has
 * actually failed in this project:
 *
 * 1. **Enumeration** — every numeric field of a real `BalanceScore` is either a
 *    registered term with controls or an exemption with a written reason. This
 *    is what makes adding a metric without controls inconvenient.
 * 2. **Separation** — every term tells its own controls apart by the margin it
 *    declares.
 * 3. **Restatement** — no term is an affine function of another across the
 *    control corpus. `exploitMargin` was identically `ascensionRate −
 *    probeRate` and the campaign read the same number twice as two passes.
 * 4. **False friends** — a term that reports a known-broken system as healthy
 *    must say so, and another term must catch what it misses.
 */

import { describe, expect, it } from 'vitest';

import type { ScoringTerm } from '../../src/scoring-controls.js';
import {
  BETTER_WHEN,
  SCORING_TERMS,
  TERMS_WITHOUT_CONTROLS,
  controlCorpus,
  controlPool,
  falseFriendReading,
  isAffineRestatement,
  separationOf,
} from '../../src/scoring-controls.js';
import { EXPLOIT_PROBES, scoreBalance } from '../../src/tuner.js';

const WEIGHTS = { variety: 1, correlation: 1, exploit: 1 } as const;
const BAND = { min: 0.05, max: 0.2 } as const;

/** Reads a numeric field off a score without widening `BalanceScore`. */
function read(outcomes: ScoringTerm['negative']['outcomes'], field: string): number {
  const score = scoreBalance(outcomes, WEIGHTS, BAND) as unknown as Record<string, unknown>;
  return score[field] as number;
}

describe('every scoring term is a claim, and every claim carries its controls', () => {
  it('accounts for every numeric field of a real score', () => {
    // Enumerated from an actual score rather than from a written list, so a
    // field added to BalanceScore lands here whether or not anybody remembered
    // to update a test.
    const score = scoreBalance(controlPool({ 'permissive-breadth': 3, archivist: 2 }), WEIGHTS, BAND);
    const numeric = Object.entries(score)
      .filter(([, value]) => typeof value === 'number')
      .map(([key]) => key)
      .sort();

    const controlled = SCORING_TERMS.map((term) => term.field);
    const exempt = Object.keys(TERMS_WITHOUT_CONTROLS);
    const accounted = new Set([...controlled, ...exempt]);

    const unaccounted = numeric.filter((field) => !accounted.has(field));
    expect(
      unaccounted,
      'a numeric field of BalanceScore with neither controls nor a written exemption. Give it a ' +
        'negative control, a positive control and a minimum separation in SCORING_TERMS, or name ' +
        'it in TERMS_WITHOUT_CONTROLS with the reason it makes no claim of its own.',
    ).toEqual([]);

    // And the reverse: a registered term naming a field the score does not have
    // is a control for a metric nobody computes.
    expect(controlled.filter((field) => !numeric.includes(field))).toEqual([]);
    expect(exempt.filter((field) => !numeric.includes(field))).toEqual([]);
  });

  it('refuses a term registered without both controls or without a reason', () => {
    for (const term of SCORING_TERMS) {
      expect(term.claim.trim().length, `${term.field} declares no claim`).toBeGreaterThan(20);
      for (const control of [term.negative, term.positive]) {
        expect(control.label.trim().length, `${term.field} control has no label`).toBeGreaterThan(0);
        expect(
          control.why.trim().length,
          `${term.field}'s "${control.label}" control gives no reason its verdict is known ` +
            'independently of this term. A control justified by the term is a tautology.',
        ).toBeGreaterThan(40);
        expect(['measured', 'constructed']).toContain(control.provenance);
        expect(control.outcomes.length).toBeGreaterThan(1);
      }
      expect(term.minimumSeparation).toBeGreaterThan(0);
    }
    for (const [field, reason] of Object.entries(TERMS_WITHOUT_CONTROLS)) {
      expect(reason.trim().length, `${field} is exempt with no reason`).toBeGreaterThan(40);
    }
  });
});

describe('every term separates a system known broken from a system known working', () => {
  for (const term of SCORING_TERMS) {
    it(`${term.field}: ${term.negative.label} vs ${term.positive.label}`, () => {
      const result = separationOf(term, WEIGHTS, BAND);
      expect(
        result.separates,
        `${term.field} read ${result.negative.toFixed(4)} on "${term.negative.label}" and ` +
          `${result.positive.toFixed(4)} on "${term.positive.label}" — a separation of ` +
          `${result.separation.toFixed(4)} against the ${String(term.minimumSeparation)} it ` +
          'declares. A term that cannot tell its own controls apart is not ready to be used.',
      ).toBe(true);
    });
  }

  it('reports the separations as numbers, so the suite is readable as a table', () => {
    const table = SCORING_TERMS.map((term) => {
      const result = separationOf(term, WEIGHTS, BAND);
      return `${term.field}: neg ${result.negative.toFixed(3)} pos ${result.positive.toFixed(3)} sep ${result.separation.toFixed(3)}`;
    });
    expect(table).toHaveLength(SCORING_TERMS.length);
    // Pinned so the numbers cannot drift silently: a changed separation is a
    // changed instrument, and it should have to be re-read rather than merely
    // re-run.
    expect(table).toMatchInlineSnapshot(`
      [
        "ascensionRate: neg 0.933 pos 0.100 sep 0.733",
        "variety: neg 0.000 pos 0.590 sep 0.590",
        "correlation: neg -0.234 pos 0.977 sep 1.212",
        "spearman: neg 0.000 pos 1.000 sep 1.000",
        "nonZeroStrategies: neg 1.000 pos 4.000 sep 3.000",
        "exploitMargin: neg -0.429 pos 0.143 sep 0.571",
        "probeRate: neg 0.500 pos 0.000 sep 0.500",
        "deliberateMean: neg 0.000 pos 0.143 sep 0.143",
        "topShare: neg 1.000 pos 0.333 sep 0.667",
      ]
    `);
  });
});

// ---------------------------------------------------------------------------
// The finding. This block is the most important thing in the file.
// ---------------------------------------------------------------------------

describe('the correlation terms cannot separate one point from a relationship', () => {
  it('reports the known-broken single-winner pool as healthy — both of them do', () => {
    for (const term of SCORING_TERMS.filter((entry) => entry.falseFriend !== undefined)) {
      const result = falseFriendReading(term, WEIGHTS, BAND);
      expect(
        result.separates,
        `${term.field} was expected to be blind to "${term.falseFriend?.label ?? ''}" and was not. ` +
          'If it now separates, the blindness has been repaired and this declaration should be ' +
          'deleted rather than kept.',
      ).toBe(false);
      // It does not merely fail to separate — it reads *well*.
      expect(result.reading).toBeGreaterThan(0.5);
    }
  });

  it('is why the repair is a support gate and not a threshold', () => {
    // The two coefficients over the same measured pool. Both comfortably
    // positive, so any cut-off admitting a real relationship admits this too.
    const oneWinner = (SCORING_TERMS.find((term) => term.field === 'correlation') as ScoringTerm)
      .falseFriend?.outcomes;
    expect(oneWinner).toBeDefined();
    const score = scoreBalance(oneWinner ?? [], WEIGHTS, BAND);
    // Pearson +0.712 and Spearman +0.532 over the ten-strategy control pool.
    // Both are lower than the +0.97 and +0.66 the same win vector reads over the
    // shipped eight, and the difference is `permit-then-idle`: it holds the
    // second-highest node count in the pool, 231, and correctly never wins, so
    // adding the honest probes *costs* the correlation. Even so, both remain
    // comfortably positive on a pool with exactly one winner — which is the
    // point. There is no threshold here to set.
    expect(score.correlation).toBeGreaterThan(0.7);
    expect(score.spearman).toBeGreaterThan(0.5);
    // And the one term that does see it.
    expect(score.nonZeroStrategies).toBe(1);
  });

  it('requires another registered term to catch what the blind ones miss', () => {
    for (const term of SCORING_TERMS.filter((entry) => entry.falseFriend !== undefined)) {
      const friend = term.falseFriend as NonNullable<ScoringTerm['falseFriend']>;
      const catchers = SCORING_TERMS.filter((other) => {
        if (other.field === term.field || other.falseFriend !== undefined) return false;
        const reading = read(friend.outcomes, other.field);
        const healthy = read(other.positive.outcomes, other.field);
        const gap = other.betterWhen === BETTER_WHEN.lower ? reading - healthy : healthy - reading;
        return gap >= other.minimumSeparation;
      }).map((other) => other.field);
      expect(
        catchers,
        `nothing in the registry separates "${friend.label}", which ${term.field} is declared ` +
          'blind to. A declared blindness with no compensating term is an instrument that cannot ' +
          'see a defect it has already met.',
      ).not.toEqual([]);
      // Named, so the compensation is legible rather than merely non-empty.
      expect(catchers).toContain('nonZeroStrategies');
      expect(catchers).toContain('variety');
      expect(catchers).toContain('topShare');
    }
  });
});

// ---------------------------------------------------------------------------
// Restatement: two names for one measurement is worse than one measurement.
// ---------------------------------------------------------------------------

describe('no term restates another', () => {
  const corpus = controlCorpus();

  it('has a corpus wide enough for the question to mean anything', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(5);
    // The probe rate must *vary* across the corpus, or exploitMargin and
    // ascensionRate would be affine here for the same reason they were
    // identical in the shipped code, and the test would be measuring its own
    // fixtures.
    const probeRates = corpus.map((outcomes) => scoreBalance(outcomes, WEIGHTS, BAND).probeRate);
    expect(new Set(probeRates).size).toBeGreaterThan(1);
  });

  it('reads no two terms as an affine function of each other', () => {
    const readings = SCORING_TERMS.map((term) => ({
      field: term.field,
      values: corpus.map((outcomes) => read(outcomes, term.field)),
    }));
    const restatements: string[] = [];
    for (let left = 0; left < readings.length; left += 1) {
      for (let right = left + 1; right < readings.length; right += 1) {
        const a = readings[left] as { field: string; values: number[] };
        const b = readings[right] as { field: string; values: number[] };
        if (isAffineRestatement(a.values, b.values)) {
          restatements.push(`${a.field} and ${b.field}`);
        }
      }
    }
    expect(
      restatements,
      'two terms that are affine functions of each other across every control are two names for ' +
        'one measurement. A reader sees two passes and there was one.',
    ).toEqual([]);
  });

  it('would have caught the shipped defect: the old margin was the band minus the probe', () => {
    // The formula as it shipped: poolMean over *every* strategy including the
    // probe, minus the probe rate. With equal run counts this is identically
    // `ascensionRate - probeRate`, and `EXPLOIT_MARGIN_MIN` equalled band.min,
    // so a candidate cleared both constraints by clearing one.
    const oldMargin = (outcomes: ScoringTerm['negative']['outcomes']): number => {
      const rates = outcomes.map((entry) => (entry.runs === 0 ? 0 : entry.ascended / entry.runs));
      const poolMean = rates.reduce((sum, value) => sum + value, 0) / rates.length;
      const probe = outcomes.find((entry) => entry.strategyId === EXPLOIT_PROBES[0]);
      const probeRate = probe === undefined ? 0 : probe.ascended / probe.runs;
      return poolMean - probeRate;
    };
    const identity = corpus.map((outcomes) => {
      const score = scoreBalance(outcomes, WEIGHTS, BAND);
      const probe = outcomes.find((entry) => entry.strategyId === EXPLOIT_PROBES[0]);
      const probeRate = probe === undefined ? 0 : probe.ascended / probe.runs;
      return { old: oldMargin(outcomes), restated: score.ascensionRate - probeRate };
    });
    // Exactly equal on every control: the identity is arithmetic, not a
    // coincidence of these particular pools.
    for (const row of identity) expect(row.old).toBeCloseTo(row.restated, 12);

    // The repaired margin is not that number on the same data.
    const differs = corpus.filter((outcomes) => {
      const score = scoreBalance(outcomes, WEIGHTS, BAND);
      return Math.abs(score.exploitMargin - oldMargin(outcomes)) > 1e-9;
    });
    expect(differs.length).toBeGreaterThan(0);
  });

  it('and isAffineRestatement is not vacuously true', () => {
    expect(isAffineRestatement([1, 2, 3, 4], [3, 5, 7, 9])).toBe(true);
    expect(isAffineRestatement([1, 2, 3, 4], [3, 5, 7, 9.0001])).toBe(false);
    expect(isAffineRestatement([1, 2, 3, 4], [1, 4, 9, 16])).toBe(false);
    // A constant carries no information about restatement either way.
    expect(isAffineRestatement([1, 1, 1, 1], [1, 2, 3, 4])).toBe(false);
  });
});
