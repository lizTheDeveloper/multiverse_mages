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

import { outlook, richOutlook, speciesNamed, target } from './autonomy-fixtures.js';

const scoreOf = (goal: (typeof GOALS_IN_ORDER)[number], state: ReturnType<typeof outlook>): number =>
  scoreGoal(goal, state).score;

describe('a score is the sum of six terms', () => {
  it('sums to the unclamped total, term for term', () => {
    const state = richOutlook();
    for (const goal of GOALS_IN_ORDER) {
      const scored = scoreGoal(goal, state);
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
        const scored = scoreGoal(goal, state);
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
          const { terms } = scoreGoal(goal, state);
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
      expect(scoreGoal(goal, richOutlook()).clamped).toBe(false);
    }
  });
});

describe('idle is the floor for every mage in every situation', () => {
  it('scores zero across species, personalities, ages, and roles', () => {
    for (const id of ['human', 'draconic', 'orc']) {
      for (const normalizedAge of [0, 512, 1400]) {
        const state = richOutlook({ species: speciesNamed(id), normalizedAge });
        expect(scoreOf(GOAL.idle, state)).toBe(0);
        for (const kind of TERM_KINDS) expect(termsFor(GOAL.idle, state)[kind]).toBe(0);
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
      expect(termsFor(goal, long).age).toBe(termsFor(goal, short).age);
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
      ).opportunity;

    expect(at(1)).toBeLessThan(at(2));
    expect(at(2)).toBeLessThan(at(4));
    expect(at(4)).toBe(at(40));
  });
});
