/*
 * Multiverse Mages — roles bias but never dictate, and age bands are a fraction
 * of a life.
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
 * `mages-and-species/design.md` rejects role-as-filter because *"it makes the
 * god a general, contradicting design pillar 3"* and because *"a universe of
 * assigned researchers with nobody willing to teach starves its own next
 * generation."* Both halves are checkable, and both are checked below: the
 * bound is asserted against the other five term bounds, and a researcher whose
 * research is masked is asserted to pick up something else.
 *
 * The age-band half of this file exists because the bands are defined against
 * the hazard table's knots. That coupling is the sort of thing that survives
 * exactly until somebody retunes mortality, so it is asserted rather than
 * commented.
 */

import { describe, expect, it } from 'vitest';

import { MAGE_ROLE } from '@mm/state';

import type { AgeBandValue } from '../../src/index.js';
import {
  AGE_BAND,
  AGE_BANDS_IN_ORDER,
  GOAL,
  GOALS_IN_ORDER,
  HAZARD_TABLE,
  MAGE_ROLE_VALUES,
  PRIME_BEGINS_AT,
  ROLE_BIAS,
  ROLE_BIAS_MAX,
  ROLE_BIAS_TUNING_STATUS,
  SENESCENCE_BEGINS_AT,
  TERM_BOUND,
  TERM_KINDS,
  ageBandOf,
  roleBiasFor,
  scoreGoal,
  selectGoal,
} from '../../src/index.js';

import { outlook, richOutlook, speciesNamed, target } from './autonomy-fixtures.js';
import { stepRng } from './mage-fixtures.js';

describe('the role bias table is bounded', () => {
  it('declares itself untuned, because no balance claim is possible before 0.5.0', () => {
    expect(ROLE_BIAS_TUNING_STATUS).toBe('untuned');
  });

  it('keeps every entry within the documented magnitude', () => {
    for (const role of MAGE_ROLE_VALUES) {
      for (const goal of GOALS_IN_ORDER) {
        const bias = roleBiasFor(role, goal);
        expect(
          Math.abs(bias),
          `role ${String(role)} biases goal ${String(goal)} by ${String(bias)}, outside ±${String(ROLE_BIAS_MAX)}`,
        ).toBeLessThanOrEqual(ROLE_BIAS_MAX);
      }
    }
  });

  it('cannot dominate the sum of all other terms at their extremes', () => {
    // The spec's own phrasing, turned into arithmetic. If this fails, either a
    // role entry grew or the other terms shrank -- and in both cases the god
    // has quietly acquired authority the design says is not his.
    const others = TERM_KINDS.filter((kind) => kind !== 'role').reduce(
      (total, kind) => total + TERM_BOUND[kind],
      0,
    );
    expect(ROLE_BIAS_MAX).toBeLessThan(others);
  });

  it('gives every role a row and every goal an entry', () => {
    expect(Object.keys(ROLE_BIAS).length).toBe(MAGE_ROLE_VALUES.length);
    for (const role of MAGE_ROLE_VALUES) {
      for (const goal of GOALS_IN_ORDER) {
        expect(Number.isInteger(roleBiasFor(role, goal))).toBe(true);
      }
    }
  });

  it('biases no role toward or against idling', () => {
    for (const role of MAGE_ROLE_VALUES) expect(roleBiasFor(role, GOAL.idle)).toBe(0);
  });

  it('throws on a role outside the enumeration rather than returning a neutral row', () => {
    expect(() => roleBiasFor(7 as never, GOAL.teach)).toThrow(/not a mage role/u);
  });
});

describe('a role changes the ordering without closing anything off', () => {
  it('makes a professor prefer teaching and a researcher prefer research', () => {
    const professor = richOutlook({ roleId: MAGE_ROLE.professor });
    const researcher = richOutlook({ roleId: MAGE_ROLE.researcher });

    expect(scoreGoal(GOAL.teach, professor).score).toBeGreaterThan(
      scoreGoal(GOAL.teach, researcher).score,
    );
    expect(scoreGoal(GOAL.researchNode, researcher).score).toBeGreaterThan(
      scoreGoal(GOAL.researchNode, professor).score,
    );
  });

  it('lets a researcher whose research is masked take up teaching', () => {
    // The spec's scenario. Nothing to research, nothing to rediscover, no
    // library and no materials -- but a student who can be taught.
    const stuck = outlook({
      roleId: MAGE_ROLE.researcher,
      teachableByMe: [target(41)],
    });
    const selection = selectGoal({
      outlook: stuck,
      worldTick: 0,
      incumbent: undefined,
      rng: stepRng(5, 0),
    });
    expect(selection.commitment.goalId).toBe(GOAL.teach);
  });

  it('leaves every goal selectable under every role', () => {
    // Role as a hard filter would show up here as a goal that no amount of
    // opportunity can make a given role choose.
    for (const role of MAGE_ROLE_VALUES) {
      const mask = selectGoal({
        outlook: richOutlook({ roleId: role }),
        worldTick: 0,
        incumbent: undefined,
        rng: stepRng(6, 0),
      });
      expect(mask.scores.map((entry) => entry.goal)).toEqual([...GOALS_IN_ORDER]);
    }
  });
});

describe('age bands come from normalized age', () => {
  it('puts two species of wildly different lifespan in the same band at the same fraction', () => {
    const long = speciesNamed('elf');
    const short = speciesNamed('orc');
    expect(long.lifespanMonths).toBeGreaterThan(short.lifespanMonths * 5);
    expect(ageBandOf(512)).toBe(AGE_BAND.prime);
    // The band function takes only the fraction, so this is the strongest form
    // of the claim: there is no species input for it to disagree about.
    expect(ageBandOf.length).toBe(1);
  });

  it('takes its boundaries from the hazard table rather than restating them', () => {
    expect(PRIME_BEGINS_AT).toBe(HAZARD_TABLE[1]?.normalizedAge);
    expect(SENESCENCE_BEGINS_AT).toBe(HAZARD_TABLE[3]?.normalizedAge);
  });

  it('assigns the boundary itself to the older band, so a crossing happens once', () => {
    expect(ageBandOf(PRIME_BEGINS_AT - 1)).toBe(AGE_BAND.young);
    expect(ageBandOf(PRIME_BEGINS_AT)).toBe(AGE_BAND.prime);
    expect(ageBandOf(SENESCENCE_BEGINS_AT - 1)).toBe(AGE_BAND.prime);
    expect(ageBandOf(SENESCENCE_BEGINS_AT)).toBe(AGE_BAND.senescent);
  });

  it('reads a mage evaluated before her own birth tick as young rather than throwing', () => {
    expect(ageBandOf(-1)).toBe(AGE_BAND.young);
  });

  it('is monotonic: no age is in a younger band than a younger age', () => {
    let previous: AgeBandValue = AGE_BAND.young;
    for (let age = 0; age <= 2048; age += 16) {
      const band = ageBandOf(age);
      expect(band).toBeGreaterThanOrEqual(previous);
      previous = band;
    }
    expect(AGE_BANDS_IN_ORDER).toHaveLength(3);
  });
});
