/*
 * Multiverse Mages — zeroing one scoring term changes selections attributably.
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
 * `contracts.md` §7's balance methodology works by removing one input and
 * measuring what changed, and `mages-and-species/design.md` says the scoring
 * function *"is built to be taken apart by the harness that does not exist
 * yet."* This file is that harness's smoke test, four releases early.
 *
 * "Attributable" is the load-bearing word. It is not enough that ablating a
 * term changes the answer — a multiplicative score would do that too. What
 * matters is that the change is confined to the ablated term: every other term
 * must come out of the ablated run bit-identical, so a difference in outcome
 * has exactly one candidate explanation.
 */

import { describe, expect, it } from 'vitest';

import { GOALS_IN_ORDER, TERM_KINDS, scoreGoal, selectGoal } from '../../src/index.js';
import type { TermKind } from '../../src/index.js';

import { appealWeights, richOutlook, speciesNamed, target } from './autonomy-fixtures.js';
import { stepRng } from './mage-fixtures.js';

describe('each term can be removed on its own', () => {
  it('zeroes only the ablated term and leaves the other five untouched', () => {
    const state = richOutlook({ species: speciesNamed('gnome'), normalizedAge: 900 });
    for (const ablate of TERM_KINDS) {
      for (const goal of GOALS_IN_ORDER) {
        const full = scoreGoal(goal, state);
        const partial = scoreGoal(goal, state, { ablate });
        expect(partial.terms[ablate]).toBe(0);
        for (const other of TERM_KINDS) {
          if (other === ablate) continue;
          expect(partial.terms[other]).toBe(full.terms[other]);
        }
        expect(partial.rawTotal).toBe(full.rawTotal - full.terms[ablate]);
      }
    }
  });

  it('keeps the six-key shape, so two breakdowns are comparable field by field', () => {
    const state = richOutlook();
    const keys = Object.keys(scoreGoal(GOALS_IN_ORDER[1] ?? 0, state).terms).sort();
    for (const ablate of TERM_KINDS) {
      expect(Object.keys(scoreGoal(GOALS_IN_ORDER[1] ?? 0, state, { ablate }).terms).sort()).toEqual(
        keys,
      );
    }
  });
});

describe('ablation changes selections, and the change is attributable', () => {
  /**
   * A universe where two goals are close enough that one term decides between
   * them: an aged, curious mage with both a frontier and a student.
   */
  function contested(mage: number): ReturnType<typeof richOutlook> {
    return richOutlook({
      mage,
      species: speciesNamed('gnome'),
      normalizedAge: 900,
      discoveryTargets: [target(11, 1, 512), target(12, 1, 600)],
      teachableByMe: [target(41), target(42)],
      scribableTargets: [],
      scribeThroughput: 0,
      betterAffiliationAvailable: false,
    });
  }

  const selectWith = (ablate: TermKind | undefined): number[] =>
    Array.from({ length: 40 }, (_unused, index) => {
      const mage = index + 1;
      return selectGoal({
      appeal: appealWeights,
        outlook: contested(mage),
        worldTick: 0,
        incumbent: undefined,
        rng: stepRng(555, 0),
        scoring: ablate === undefined ? {} : { ablate },
      }).commitment.goalId;
    });

  it('moves at least one mage when the age term is removed, on a fixed seed', () => {
    // The age term is the one carrying senescence toward teaching, so removing
    // it should send an old population back toward research.
    expect(selectWith('age')).not.toEqual(selectWith(undefined));
  });

  it('changes nothing at all when nothing is ablated, twice over', () => {
    // The control. Without it, "the selections differed" could be the seed
    // rather than the term.
    expect(selectWith(undefined)).toEqual(selectWith(undefined));
  });

  it('leaves every non-ablated term identical between the two runs', () => {
    const state = contested(3);
    const full = selectGoal({
      appeal: appealWeights,
      outlook: state,
      worldTick: 0,
      incumbent: undefined,
      rng: stepRng(555, 0),
    });
    const ablated = selectGoal({
      appeal: appealWeights,
      outlook: state,
      worldTick: 0,
      incumbent: undefined,
      rng: stepRng(555, 0),
      scoring: { ablate: 'age' },
    });

    expect(full.scores.map((entry) => entry.goal)).toEqual(
      ablated.scores.map((entry) => entry.goal),
    );
    full.scores.forEach((entry, index) => {
      const counterpart = ablated.scores[index];
      expect(counterpart).toBeDefined();
      for (const kind of TERM_KINDS) {
        if (kind === 'age') continue;
        expect(counterpart?.terms[kind]).toBe(entry.terms[kind]);
      }
    });
  });
});
