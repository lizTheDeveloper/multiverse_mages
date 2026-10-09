/*
 * Multiverse Mages — a raid does not end with raiders on the field.
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
 * `terminationOf` used to end a raid the tick the last objective fell, or the
 * tick the last defender fell, whoever was still standing in the field — and
 * the stranded-raider rule then killed every raider who had not reached the
 * portal. Winning was the one way to lose the warband (measured on live peer
 * raids, 2026-10-08). These pin the fix: with a living raider on the field the
 * raid goes on, bounded only by the portal and the ceiling; once the field is
 * clear it ends with the reason that describes what happened.
 */

import { describe, expect, it } from 'vitest';

import { MAX_ENGAGEMENT_TICKS, RAID_END_REASON, terminationOf } from '@mm/rules-raid';
import { RAID_SIDE } from '@mm/state';
import type { RaidState } from '@mm/state';

const OPEN_PORTAL = { portalStability: 50_000 } as unknown as RaidState;
const CLOSED_PORTAL = { portalStability: 0 } as unknown as RaidState;

const base = {
  raid: OPEN_PORTAL,
  engagementTick: 40,
  maxTicks: 150,
  allObjectivesResolved: false,
  livingAttackers: 3,
  livingDefenders: 4,
  withdrawnAttackers: 0,
};

describe('a raid with a raider still on the field', () => {
  it('goes on after the last objective falls', () => {
    expect(terminationOf({ ...base, allObjectivesResolved: true })).toBeUndefined();
  });

  it('goes on after the last defender falls', () => {
    expect(terminationOf({ ...base, livingDefenders: 0 })).toBeUndefined();
  });

  it('goes on with both — a cleared field and an empty defence', () => {
    expect(terminationOf({ ...base, allObjectivesResolved: true, livingDefenders: 0 })).toBeUndefined();
  });

  it('still ends when the portal collapses on her, and at the ceiling', () => {
    expect(terminationOf({ ...base, raid: CLOSED_PORTAL, allObjectivesResolved: true })?.reason).toBe(
      RAID_END_REASON.portalCollapsed,
    );
    expect(terminationOf({ ...base, engagementTick: MAX_ENGAGEMENT_TICKS })?.reason).toBe(
      RAID_END_REASON.ceilingReached,
    );
  });
});

describe('a raid whose field is clear of raiders', () => {
  const gone = { ...base, livingAttackers: 0 };

  it('ends objectives-resolved when everything was taken', () => {
    expect(terminationOf({ ...gone, allObjectivesResolved: true, withdrawnAttackers: 2 })?.reason).toBe(
      RAID_END_REASON.objectivesResolved,
    );
  });

  it('ends defender-eliminated when the defence fell and raiders went home', () => {
    expect(terminationOf({ ...gone, livingDefenders: 0, withdrawnAttackers: 2 })).toEqual({
      reason: RAID_END_REASON.sideEliminated,
      eliminated: RAID_SIDE.defender,
    });
  });

  it('ends raiders-withdrew when they went home with the defence standing', () => {
    expect(terminationOf({ ...gone, withdrawnAttackers: 2 })?.reason).toBe(RAID_END_REASON.raidersWithdrew);
  });

  it('ends attacker-eliminated when nobody got out', () => {
    expect(terminationOf({ ...gone, withdrawnAttackers: 0 })).toEqual({
      reason: RAID_END_REASON.sideEliminated,
      eliminated: RAID_SIDE.attacker,
    });
  });
});
