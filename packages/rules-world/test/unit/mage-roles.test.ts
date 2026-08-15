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

import type { MageRoleValue } from '@mm/state';
import { MAGE_ROLE } from '@mm/state';
import {
  ASSIGNABLE_MAGE_ROLES,
  BASE_MAX_VIGOR,
  DEFAULT_MAGE_ROLE,
  MAGE_ROLE_VALUES,
  assignRole,
  changeAffiliation,
  createMage,
  graduate,
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
    // Six: five since W193's `student`, six since W197's `populace`. Both are
    // legal roles — each is written into `roleId`, each has a `ROLE_BIAS` row,
    // and a validator must accept both — and both are deliberately **not** in
    // `ASSIGNABLE_MAGE_ROLES`, which is the separate list the god's action 10
    // enumerates. The next test asserts that split.
    expect(MAGE_ROLE_VALUES).toEqual([
      MAGE_ROLE.researcher,
      MAGE_ROLE.warden,
      MAGE_ROLE.professor,
      MAGE_ROLE.raider,
      MAGE_ROLE.student,
      MAGE_ROLE.populace,
    ]);
    expect(MAGE_ROLE_VALUES.every((role) => isMageRole(role))).toBe(true);
    expect(isMageRole(6)).toBe(false);
  });

  it('separates what is a legal role from what the god may assign', () => {
    // The two lists differ by exactly two entries, and the difference is the
    // point: enrolment writes `student` and graduation clears it into either a
    // standing role or `populace`, and the god's assign-role action does
    // neither.
    expect(ASSIGNABLE_MAGE_ROLES).toEqual([
      MAGE_ROLE.researcher,
      MAGE_ROLE.warden,
      MAGE_ROLE.professor,
      MAGE_ROLE.raider,
    ]);
    expect(ASSIGNABLE_MAGE_ROLES).not.toContain(MAGE_ROLE.student);
    expect(isMageRole(MAGE_ROLE.student)).toBe(true);

    const record = mageRow({ roleId: MAGE_ROLE.professor });
    expect(() => assignRole(record, MAGE_ROLE.student)).toThrow(/not a role the god may assign/u);
    expect(record.roleId).toBe(MAGE_ROLE.professor);
  });

  it('graduates a student into the default role, and refuses anyone else', () => {
    const student = mageRow({ roleId: MAGE_ROLE.student, universityId: 100 });
    graduate(student);
    expect(student.roleId).toBe(DEFAULT_MAGE_ROLE);
    // She keeps her school. Where she goes next is `affiliate`'s decision.
    expect(student.universityId).toBe(100);

    // Calling it on a standing mage would silently demote a professor to
    // researcher, which is the god's write and not the world loop's.
    const professor = mageRow({ roleId: MAGE_ROLE.professor });
    expect(() => graduate(professor)).toThrow(/only a student graduates/u);
    expect(professor.roleId).toBe(MAGE_ROLE.professor);
  });

  it('graduates a student into the career the sort chose, populace included', () => {
    // W197: graduation is no longer one outcome. `careers.ts` draws, this
    // function writes, and the write is still the only one in the codebase.
    const toPopulace = mageRow({ roleId: MAGE_ROLE.student, universityId: 7 });
    graduate(toPopulace, MAGE_ROLE.populace);
    expect(toPopulace.roleId).toBe(MAGE_ROLE.populace);
    expect(toPopulace.universityId).toBe(7);

    // She is not un-graduatable into her own past, and she is not graduatable
    // into a `uint8` that no bias row covers.
    const student = mageRow({ roleId: MAGE_ROLE.student });
    expect(() => graduate(student, MAGE_ROLE.student)).toThrow(/not a career a graduate may take/u);
    expect(() => graduate(student, 7 as MageRoleValue)).toThrow(
      /not a career a graduate may take/u,
    );
    expect(student.roleId).toBe(MAGE_ROLE.student);
  });

  it('keeps the populace out of the god\'s hand, and lets him pull her out of it', () => {
    // **The one-way valve.** *"The interesting question becomes who gets to keep
    // going, which is a decision a god makes with limited seats."* Graduation
    // sorts mages down into the populace; action 10 is how one comes back up,
    // and there is no route back down.
    expect(MAGE_ROLE_VALUES).toContain(MAGE_ROLE.populace);
    expect(ASSIGNABLE_MAGE_ROLES).not.toContain(MAGE_ROLE.populace);
    expect(isMageRole(MAGE_ROLE.populace)).toBe(true);

    const caster = mageRow({ roleId: MAGE_ROLE.populace });
    assignRole(caster, MAGE_ROLE.professor);
    expect(caster.roleId).toBe(MAGE_ROLE.professor);
    expect(() => assignRole(caster, MAGE_ROLE.populace)).toThrow(
      /not a role the god may assign/u,
    );
    expect(caster.roleId).toBe(MAGE_ROLE.professor);
  });

  it('leaves action 10 exactly four roles wide, after two appended roles', () => {
    // Two roles were appended to `MAGE_ROLE` — `student` in W193 and `populace`
    // in W197 — and neither widened the candidate space every trained policy is
    // sized against. A list derived from `Object.values(MAGE_ROLE)` would have
    // been six by now.
    expect(ASSIGNABLE_MAGE_ROLES).toHaveLength(4);
    expect(MAGE_ROLE_VALUES).toHaveLength(6);
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
    expect(() => assignRole(record, 7)).toThrow(/not a role the god may assign/u);
    expect(() => assignRole(record, -1)).toThrow(/not a role the god may assign/u);
    expect(record.roleId).toBe(0);
  });
});
