/*
 * Multiverse Mages — additive terms, one trailing clamp, and four shapes the
 * spec names.
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
 * Two requirements meet here. *"Utility scores are additive fixed-point terms"*
 * is about the arithmetic — additive, integer, clamped once at the end — and
 * *"Species, personality, age, and role shape the score"* is about what the
 * terms mean. The second is the one that can pass vacuously: a scoring function
 * that ignored its inputs entirely would satisfy every arithmetic property
 * above, so each shaping scenario is asserted as a *difference between two
 * outlooks that differ in one field*.
 */

import { describe, expect, it } from 'vitest';

import {
  GOAL,
  GOALS_IN_ORDER,
  SCORE_CEILING,
  SCORE_FLOOR,
  TERM_BOUND,
  TERM_KINDS,
  combineTerms,
  scoreGoal,
  termsFor,
} from '../../src/index.js';

import { goalAppealWeights, outlook, richOutlook, speciesNamed, target } from './autonomy-fixtures.js';

const scoreOf = (goal: (typeof GOALS_IN_ORDER)[number], state: ReturnType<typeof outlook>): number =>
  scoreGoal(goal, state, goalAppealWeights).score;

describe('a score is the sum of six terms', () => {
  it('sums to the unclamped total, term for term', () => {
    const state = richOutlook();
    for (const goal of GOALS_IN_ORDER) {
      const scored = scoreGoal(goal, state, goalAppealWeights);
      const summed = TERM_KINDS.reduce((total, kind) => total + scored.terms[kind], 0);
      expect(scored.rawTotal).toBe(summed);
    }
  });

  it('is an integer at every goal, for every shipped species', () => {
    // The rules path is integer-only (CLAUDE.md, contracts.md §0). A single
    // stray division producing 511.5 would still compare, still order, and
    // still serialize -- and would diverge between two peers only sometimes.
    for (const id of ['human', 'elf', 'dwarf', 'draconic', 'gnome', 'orc']) {
      const state = richOutlook({ species: speciesNamed(id) });
      for (const goal of GOALS_IN_ORDER) {
        const scored = scoreGoal(goal, state, goalAppealWeights);
        expect(Number.isInteger(scored.score)).toBe(true);
        for (const kind of TERM_KINDS) expect(Number.isInteger(scored.terms[kind])).toBe(true);
      }
    }
  });

  it('keeps every term inside its own documented bound', () => {
    for (const id of ['human', 'elf', 'dwarf', 'draconic', 'gnome', 'orc']) {
      for (const caution of [0, 1024, 2048]) {
        const state = richOutlook({
          species: speciesNamed(id),
          personality: { curiosity: caution, ambition: caution, caution },
          wardPressure: 100_000,
          raidPressure: -100_000,
        });
        for (const goal of GOALS_IN_ORDER) {
          const { terms } = scoreGoal(goal, state, goalAppealWeights);
          for (const kind of TERM_KINDS) {
            expect(Math.abs(terms[kind])).toBeLessThanOrEqual(TERM_BOUND[kind]);
          }
        }
      }
    }
  });
});

describe('the clamp is applied once, after summation', () => {
  it('returns the ceiling for a sum above it', () => {
    const combined = combineTerms({
      base: 4096,
      role: 384,
      species: 512,
      personality: 512,
      age: 256,
      opportunity: 512,
    });
    expect(combined.total).toBe(SCORE_CEILING);
    expect(combined.clamped).toBe(true);
  });

  it('returns the floor for a sum below it', () => {
    const combined = combineTerms({
      base: 0,
      role: -384,
      species: -512,
      personality: -512,
      age: -256,
      opportunity: -512,
    });
    expect(combined.total).toBe(SCORE_FLOOR);
    expect(combined.clamped).toBe(true);
  });

  it('does not clamp a sum whose individual terms straddle the ceiling', () => {
    // The distinguishing case between one trailing clamp and a clamp per
    // addend. Per-term clamping at fp(4096) would floor the first term to the
    // ceiling and lose the negative that follows it.
    const combined = combineTerms({
      base: 5000,
      role: -2000,
      species: 0,
      personality: 0,
      age: 0,
      opportunity: 0,
    });
    expect(combined.total).toBe(3000);
    expect(combined.clamped).toBe(false);
  });

  it('never binds on a real outlook, which is why the counter exists', () => {
    // Documented in scoring.ts: the six term bounds sum to 2,688, under the
    // fp(4096) ceiling. If this ever fails, a term bound moved without anyone
    // rechecking the ceiling -- which is the finding, not the failure.
    const headroom = TERM_KINDS.reduce((total, kind) => total + TERM_BOUND[kind], 0);
    expect(headroom).toBeLessThan(SCORE_CEILING);

    for (const goal of GOALS_IN_ORDER) {
      expect(scoreGoal(goal, richOutlook(), goalAppealWeights).clamped).toBe(false);
    }
  });
});

describe('idle is the floor for every mage in every situation', () => {
  it('scores zero across species, personalities, ages, and roles', () => {
    for (const id of ['human', 'draconic', 'orc']) {
      for (const normalizedAge of [0, 512, 1400]) {
        const state = richOutlook({ species: speciesNamed(id), normalizedAge });
        expect(scoreOf(GOAL.idle, state)).toBe(0);
        for (const kind of TERM_KINDS) expect(termsFor(GOAL.idle, state, goalAppealWeights)[kind]).toBe(0);
      }
    }
  });
});

describe('species shape the score', () => {
  it('gives the more curious species the higher research score, all else equal', () => {
    const curious = richOutlook({ species: speciesNamed('gnome') });
    const incurious = richOutlook({ species: speciesNamed('dwarf') });
    expect(scoreOf(GOAL.researchNode, curious)).toBeGreaterThan(
      scoreOf(GOAL.researchNode, incurious),
    );
    expect(scoreOf(GOAL.rediscoverNode, curious)).toBeGreaterThan(
      scoreOf(GOAL.rediscoverNode, incurious),
    );
  });

  it('gives the better scribing species the higher scribe score', () => {
    expect(scoreOf(GOAL.scribe, richOutlook({ species: speciesNamed('dwarf') }))).toBeGreaterThan(
      scoreOf(GOAL.scribe, richOutlook({ species: speciesNamed('orc') })),
    );
  });
});

describe('personality shapes the score', () => {
  const withCaution = (caution: number): ReturnType<typeof outlook> =>
    richOutlook({ personality: { curiosity: 1024, ambition: 1024, caution } });

  it('makes a cautious mage prefer scribing and warding', () => {
    expect(scoreOf(GOAL.scribe, withCaution(2048))).toBeGreaterThan(
      scoreOf(GOAL.scribe, withCaution(0)),
    );
    expect(scoreOf(GOAL.wardDuty, withCaution(2048))).toBeGreaterThan(
      scoreOf(GOAL.wardDuty, withCaution(0)),
    );
  });

  it('makes a cautious mage prefer rediscovery less', () => {
    expect(scoreOf(GOAL.rediscoverNode, withCaution(2048))).toBeLessThan(
      scoreOf(GOAL.rediscoverNode, withCaution(0)),
    );
  });

  it('lets each of the three axes move at least one goal', () => {
    const neutral = richOutlook();
    const moved = (axis: 'curiosity' | 'ambition' | 'caution'): boolean => {
      const raised = richOutlook({
        personality: { curiosity: 1024, ambition: 1024, caution: 1024, [axis]: 2048 },
      });
      return GOALS_IN_ORDER.some((goal) => scoreOf(goal, raised) !== scoreOf(goal, neutral));
    };
    expect(moved('curiosity')).toBe(true);
    expect(moved('ambition')).toBe(true);
    expect(moved('caution')).toBe(true);
  });
});

describe('age shapes the score', () => {
  it('turns a senescent mage from research toward teaching and scribing', () => {
    const prime = richOutlook({ normalizedAge: 512 });
    const senescent = richOutlook({ normalizedAge: 900 });

    expect(scoreOf(GOAL.researchNode, senescent)).toBeLessThan(scoreOf(GOAL.researchNode, prime));
    expect(scoreOf(GOAL.teach, senescent)).toBeGreaterThan(scoreOf(GOAL.teach, prime));
    expect(scoreOf(GOAL.scribe, senescent)).toBeGreaterThan(scoreOf(GOAL.scribe, prime));
  });

  it('scores two species identically on age when their normalized ages match', () => {
    // The absolute ages behind fp(512) differ by centuries between these two.
    // The age term must not know that.
    const long = richOutlook({ species: speciesNamed('elf'), normalizedAge: 512 });
    const short = richOutlook({ species: speciesNamed('orc'), normalizedAge: 512 });
    for (const goal of GOALS_IN_ORDER) {
      expect(termsFor(goal, long, goalAppealWeights).age).toBe(termsFor(goal, short, goalAppealWeights).age);
    }
  });
});

describe('opportunity shapes the score without referring to anywhere', () => {
  it('raises research as candidate targets accumulate, then saturates', () => {
    const at = (count: number): number =>
      termsFor(
        GOAL.researchNode,
        richOutlook({
          discoveryTargets: Array.from({ length: count }, (_unused, index) =>
            target(index + 1),
          ),
        }),
        goalAppealWeights,
      ).opportunity;

    expect(at(1)).toBeLessThan(at(2));
    expect(at(2)).toBeLessThan(at(4));
    expect(at(4)).toBe(at(40));
  });
});

/**
 * ## Affiliation is priced as a gate, not as an activity
 *
 * The claim under test is the one W116 shipped: an unaffiliated mage cannot
 * scribe and cannot ward — `scribeThroughputFor` returns zero for
 * `universityId === 0` and `feasibility.ts` masks `ward-duty` on the same
 * field — so `affiliate` is worth what it unlocks rather than what it
 * accomplishes, and a mage who *already* has a university and merely sees a
 * deeper library is making a different, much smaller decision.
 *
 * Every number below is untuned, so nothing here asserts a magnitude. Each
 * assertion is an ordering, which is what the tables encode.
 */
describe('affiliation is a capability gate for a mage who has no university', () => {
  const unaffiliated = (overrides = {}): ReturnType<typeof outlook> =>
    richOutlook({ universityId: 0, scribeThroughput: 0, scribableTargets: [], ...overrides });

  it('prices a first affiliation above a transfer, on the opportunity axis', () => {
    const first = termsFor(GOAL.affiliate, unaffiliated(), goalAppealWeights).opportunity;
    const transfer = termsFor(GOAL.affiliate, richOutlook(), goalAppealWeights).opportunity;
    expect(first).toBeGreaterThan(transfer);
    expect(transfer).toBeGreaterThan(0);
  });

  it('never lets a content weight be silently clamped by the term bound', () => {
    // A weight authored above the bound would sit in `autonomy-weight.json`
    // looking like the number the run used. Both are inside it, and the first
    // is exactly the bound — which is the claim that the axis is saturated
    // rather than merely large.
    const first = termsFor(GOAL.affiliate, unaffiliated(), goalAppealWeights).opportunity;
    expect(first).toBe(TERM_BOUND.opportunity);
    expect(goalAppealWeights.affiliation.firstOpportunity).toBeLessThanOrEqual(
      TERM_BOUND.opportunity,
    );
    expect(Math.abs(goalAppealWeights.affiliation.transferOpportunity)).toBeLessThanOrEqual(
      TERM_BOUND.opportunity,
    );
  });

  it('scores nothing at all when there is nowhere to go', () => {
    const nowhere = unaffiliated({ betterAffiliationAvailable: false, preferredUniversity: 0 });
    expect(termsFor(GOAL.affiliate, nowhere, goalAppealWeights).opportunity).toBe(0);
  });

  it('lets ambition price a transfer and not a first affiliation', () => {
    // Moving to a deeper library to make a bigger name is ambition. Needing an
    // institution before you may write anything down is not a temperament, and
    // pricing it as one left the unambitious unaffiliated for life.
    const keen = { curiosity: 1024, ambition: 1280, caution: 1024 };
    const meek = { curiosity: 1024, ambition: 768, caution: 1024 };
    expect(termsFor(GOAL.affiliate, unaffiliated({ personality: keen }), goalAppealWeights)
      .personality).toBe(
      termsFor(GOAL.affiliate, unaffiliated({ personality: meek }), goalAppealWeights).personality,
    );
    expect(
      termsFor(GOAL.affiliate, richOutlook({ personality: keen }), goalAppealWeights).personality,
    ).toBeGreaterThan(
      termsFor(GOAL.affiliate, richOutlook({ personality: meek }), goalAppealWeights).personality,
    );
  });

  it('outscores research for a default-role mage of five of the six shipped species', () => {
    // The default role is `researcher` (`create.ts`), so this is what an
    // un-intervened universe does. **Gnome is the exception and is asserted as
    // one**: its species curiosity of fp(1792) puts research above every other
    // goal it has, at every age, and no in-bounds pricing of a gate can outvote
    // a species trait at its extreme. That is a finding about the content set,
    // and a run in which gnomes affiliate as readily as dwarves means somebody
    // has moved either the curiosity or the term bounds.
    const affiliates: string[] = [];
    for (const id of ['human', 'elf', 'dwarf', 'draconic', 'gnome', 'orc']) {
      const species = speciesNamed(id);
      const state = unaffiliated({ species, personality: {
        curiosity: species.curiosity, ambition: 1024, caution: 1024,
      } });
      if (scoreOf(GOAL.affiliate, state) > scoreOf(GOAL.researchNode, state)) affiliates.push(id);
    }
    expect(affiliates).toEqual(['human', 'elf', 'dwarf', 'draconic', 'orc']);
  });

  it('leaves a transfer below research, so a settled mage keeps working', () => {
    const settled = richOutlook({ personality: { curiosity: 1024, ambition: 1024, caution: 1024 } });
    expect(scoreOf(GOAL.affiliate, settled)).toBeLessThan(scoreOf(GOAL.researchNode, settled));
  });
});
