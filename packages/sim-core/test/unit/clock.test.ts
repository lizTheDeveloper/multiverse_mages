/*
 * Multiverse Mages — dual-scale clock tests.
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

import {
  ENGAGEMENT_TICK_MS,
  ERA_TICKS,
  TIME_MODE,
  WORLD_TICKS_PER_YEAR,
  advanceClock,
  cloneClock,
  createClock,
  enterEngagement,
  eraOf,
  leaveEngagement,
} from '../../src/clock.js';

describe('the dual-scale clock', () => {
  it('starts in world mode at tick zero', () => {
    const clock = createClock();
    expect(clock.mode).toBe(TIME_MODE.world);
    expect(clock.worldTick).toBe(0);
    expect(clock.engagementTick).toBe(0);
  });

  it('fixes a world tick at one month and an engagement tick at 100ms', () => {
    expect(WORLD_TICKS_PER_YEAR).toBe(12);
    expect(ENGAGEMENT_TICK_MS).toBe(100);
    expect(ERA_TICKS).toBe(240);
  });

  it('advances world time in world mode', () => {
    const clock = createClock();
    advanceClock(clock);
    advanceClock(clock);
    expect(clock.worldTick).toBe(2);
    expect(clock.engagementTick).toBe(0);
  });

  describe('world time pauses during engagement', () => {
    it('advances the engagement tick and leaves the world tick alone', () => {
      const clock = createClock();
      advanceClock(clock);
      advanceClock(clock);
      advanceClock(clock);
      enterEngagement(clock);

      for (let i = 0; i < 50; i += 1) {
        advanceClock(clock);
      }

      expect(clock.mode).toBe(TIME_MODE.engagement);
      expect(clock.worldTick).toBe(3);
      expect(clock.engagementTick).toBe(50);
    });

    it('resumes the world tick from the value it held when engagement began', () => {
      const clock = createClock();
      advanceClock(clock);
      advanceClock(clock);
      advanceClock(clock);
      enterEngagement(clock);
      advanceClock(clock);
      advanceClock(clock);
      leaveEngagement(clock);

      expect(clock.mode).toBe(TIME_MODE.world);
      expect(clock.worldTick).toBe(3);
      advanceClock(clock);
      expect(clock.worldTick).toBe(4);
    });

    it('starts each engagement at engagement tick zero', () => {
      const clock = createClock();
      enterEngagement(clock);
      advanceClock(clock);
      advanceClock(clock);
      leaveEngagement(clock);
      expect(clock.engagementTick).toBe(0);

      enterEngagement(clock);
      expect(clock.engagementTick).toBe(0);
    });
  });

  describe('mode transitions are explicit', () => {
    it('rejects entering engagement while already in it', () => {
      const clock = createClock();
      enterEngagement(clock);
      expect(() => {
        enterEngagement(clock);
      }).toThrow(/already in engagement mode/i);
    });

    it('rejects leaving engagement while in world mode', () => {
      const clock = createClock();
      expect(() => {
        leaveEngagement(clock);
      }).toThrow(/not in engagement mode/i);
    });
  });

  describe('era is derived, never written', () => {
    it('is the floor of world tick over ERA_TICKS', () => {
      expect(eraOf(0)).toBe(0);
      expect(eraOf(ERA_TICKS - 1)).toBe(0);
      expect(eraOf(ERA_TICKS)).toBe(1);
      expect(eraOf(ERA_TICKS * 3 + 5)).toBe(3);
    });
  });

  describe('cloning', () => {
    it('copies every field and shares no mutable structure', () => {
      const clock = createClock();
      advanceClock(clock);
      enterEngagement(clock);
      advanceClock(clock);

      const copy = cloneClock(clock);
      expect(copy).toEqual(clock);

      advanceClock(copy);
      expect(copy.engagementTick).toBe(2);
      expect(clock.engagementTick).toBe(1);
    });
  });
});
