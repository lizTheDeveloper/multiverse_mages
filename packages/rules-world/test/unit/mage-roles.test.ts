/*
 * Multiverse Mages — standing roles: assigned only by the god, and persistent.
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

import { describe, expect, it } from 'vitest';

import { MAGE_ROLE } from '@mm/state';
import {
  BASE_MAX_VIGOR,
  DEFAULT_MAGE_ROLE,
  MAGE_ROLE_VALUES,
  assignRole,
  changeAffiliation,
  createMage,
  isMageRole,
  newMageRecord,
} from '@mm/rules-world';

import { handleOf, mageRow, shippedRegistry, stepRng } from './mage-fixtures.js';
import { speciesById } from './species-fixtures.js';

const registry = shippedRegistry();
const dwarf = speciesById(registry, 'dwarf');

describe('a newly promoted mage has a default role', () => {
  it('is researcher, and the god may reassign it later', () => {
    const record = newMageRecord({
      speciesId: 2,
      birthTick: 600,
      personality: { curiosity: 512, ambition: 1024, caution: 1024 },
    });
    expect(record.roleId).toBe(DEFAULT_MAGE_ROLE);
    expect(DEFAULT_MAGE_ROLE).toBe(MAGE_ROLE.researcher);

    assignRole(record, MAGE_ROLE.warden);
    expect(record.roleId).toBe(MAGE_ROLE.warden);
  });

  it('takes the role constant from the state enumeration, not a literal', () => {
    expect(MAGE_ROLE_VALUES).toEqual([
      MAGE_ROLE.researcher,
      MAGE_ROLE.warden,
      MAGE_ROLE.professor,
      MAGE_ROLE.raider,
    ]);
    expect(MAGE_ROLE_VALUES.every((role) => isMageRole(role))).toBe(true);
    expect(isMageRole(4)).toBe(false);
  });

  it('writes every field of the mage layout, leaving none at a plausible zero', () => {
    // A zeroed `maxVigor` means the tradition's `cost` hook has nothing to
    // deduct from, and contracts.md §1.2 says exactly what that costs: the hook
    // becomes decorative, and every Vancian or prepaid tradition becomes
    // indistinguishable from `standard`.
    const record = createMage(stepRng(1, 0), handleOf(2, 1), dwarf, 3, 42);
    expect(record.alive).toBe(1);
    expect(record.maxVigor).toBe(BASE_MAX_VIGOR);
    expect(record.vigor).toBe(record.maxVigor);
    expect(record.maxVigor).toBeGreaterThan(0);
    expect(record.birthTick).toBe(42);
    expect(record.universityId).toBe(0);
  });
});

describe('a role persists across everything except the god assigning another', () => {
  it('survives an affiliation change', () => {
    const record = mageRow({ roleId: MAGE_ROLE.professor, universityId: 100 });
    changeAffiliation(record, 200);
    expect(record.universityId).toBe(200);
    expect(record.roleId).toBe(MAGE_ROLE.professor);
  });

  it('changes exactly one field when affiliation changes', () => {
    // The mistake this guards is writing a whole record back from a partially
    // populated object, which loses the fields nobody remembered to copy.
    const before = mageRow({ roleId: MAGE_ROLE.raider, universityId: 100 });
    const after = { ...before };
    changeAffiliation(after, 0);
    const changed = Object.keys(after).filter(
      (key) => after[key as keyof typeof after] !== before[key as keyof typeof before],
    );
    expect(changed).toEqual(['universityId']);
  });

  it('accepts 0 as unaffiliated, and refuses a negative handle', () => {
    const record = mageRow({ universityId: 77 });
    changeAffiliation(record, 0);
    expect(record.universityId).toBe(0);
    expect(() => changeAffiliation(record, -1)).toThrow(/non-negative/u);
  });
});

describe('the role enumeration is closed', () => {
  it('refuses a value a uint8 would happily store', () => {
    // A mage with role 7 falls through every role-bias lookup to whatever the
    // default branch happens to be.
    const record = mageRow();
    expect(() => assignRole(record, 7)).toThrow(/not a mage role/u);
    expect(() => assignRole(record, -1)).toThrow(/not a mage role/u);
    expect(record.roleId).toBe(0);
  });
});
