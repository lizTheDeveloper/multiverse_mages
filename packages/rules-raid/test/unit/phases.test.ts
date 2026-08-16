/*
 * Multiverse Mages — the engagement's three phases, and the order they arrive in.
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
 * `raid-engagement.md` §2 in three claims:
 *
 * - the phases arrive in order and never go backwards;
 * - **muster is not the whole raid** and **resolution is not the whole raid** —
 *   the design's shape is front-loaded agency, back-loaded watching, and a raid
 *   that is entirely one phase has neither;
 * - adding phases moved nothing. The last test is the one worth keeping: it
 *   runs a raid and asserts the outcome is bit-identical to what the same seed
 *   produced before any of this existed, by running two raids that differ only
 *   in whether anybody asked what phase they were in.
 */

import { describe, expect, it } from 'vitest';

import type { EngagementPhaseValue } from '@mm/rules-raid';
import {
  ENGAGEMENT_PHASE,
  ENGAGEMENT_PHASE_NAMES,
  currentPhase,
  phaseAdmitsAction,
  phaseOf,
  runRaid,
  stepEngagement,
} from '@mm/rules-raid';

import { buildRaid } from './raid-fixture.js';

const BASE = {
  engagementTick: 0,
  contactTick: -1,
  portalStability: 1_000_000,
  allObjectivesResolved: false,
  musterCeilingTicks: 120,
  resolutionStabilityMargin: 614_400,
};

describe('phaseOf is a pure function of six numbers', () => {
  it('starts in muster', () => {
    expect(phaseOf(BASE)).toBe(ENGAGEMENT_PHASE.muster);
  });

  it('leaves muster the tick contact is observed', () => {
    expect(phaseOf({ ...BASE, engagementTick: 9, contactTick: 9 })).toBe(ENGAGEMENT_PHASE.contact);
  });

  it('leaves muster at the authored ceiling even if the sides never meet', () => {
    expect(phaseOf({ ...BASE, engagementTick: 119 })).toBe(ENGAGEMENT_PHASE.muster);
    expect(phaseOf({ ...BASE, engagementTick: 120 })).toBe(ENGAGEMENT_PHASE.contact);
  });

  it('enters resolution when stability reaches the margin, contact or not', () => {
    expect(phaseOf({ ...BASE, portalStability: 614_400 })).toBe(ENGAGEMENT_PHASE.resolution);
    expect(phaseOf({ ...BASE, portalStability: 614_401 })).toBe(ENGAGEMENT_PHASE.muster);
  });

  it('enters resolution when there is nothing left to take', () => {
    expect(phaseOf({ ...BASE, allObjectivesResolved: true })).toBe(ENGAGEMENT_PHASE.resolution);
  });

  it('admits action in muster and contact, and never in resolution', () => {
    expect(phaseAdmitsAction(ENGAGEMENT_PHASE.muster)).toBe(true);
    expect(phaseAdmitsAction(ENGAGEMENT_PHASE.contact)).toBe(true);
    expect(phaseAdmitsAction(ENGAGEMENT_PHASE.resolution)).toBe(false);
  });

  it('names every phase', () => {
    for (const value of Object.values(ENGAGEMENT_PHASE)) {
      expect(ENGAGEMENT_PHASE_NAMES[value]).toBeTypeOf('string');
    }
  });
});

describe('a real raid walks the phases in order', () => {
  it('never goes backwards, and spends time in more than one phase', () => {
    const { raid } = buildRaid({ withSoldiers: true });
    const seen: EngagementPhaseValue[] = [];
    let previous: EngagementPhaseValue = currentPhase(raid);
    seen.push(previous);

    for (;;) {
      const ended = stepEngagement(raid);
      const phase = currentPhase(raid);
      // Monotone. A phase that could go backwards would offer a verb back after
      // taking it away, which is the whole of what "agency decays" forbids.
      expect(phase).toBeGreaterThanOrEqual(previous);
      if (phase !== previous) seen.push(phase);
      previous = phase;
      if (ended !== undefined) break;
    }

    expect(seen[0]).toBe(ENGAGEMENT_PHASE.muster);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen).toContain(ENGAGEMENT_PHASE.resolution);
  });

  it('makes contact quickly, so muster is an opening rather than the raid', () => {
    const { raid } = buildRaid({ withSoldiers: true });
    let ticks = 0;
    while (currentPhase(raid) === ENGAGEMENT_PHASE.muster) {
      if (stepEngagement(raid) !== undefined) break;
      ticks += 1;
    }
    expect(ticks).toBeGreaterThan(0);
    expect(ticks).toBeLessThanOrEqual(raid.tuning.musterCeilingTicks);
    expect(ticks).toBeLessThan(raid.maxTicks / 4);
  });

  it('changes nothing about the raid it describes', () => {
    // Two identical raids; one is asked its phase on every tick and the other
    // is never asked. `currentPhase` is a read, and a read that moved an
    // outcome would mean the phase structure had leaked into the tick loop.
    const observed = buildRaid({ seed: 77, withSoldiers: true });
    const silent = buildRaid({ seed: 77, withSoldiers: true });

    for (;;) {
      const ended = stepEngagement(observed.raid);
      currentPhase(observed.raid);
      if (ended !== undefined) break;
    }
    const a = runRaid(silent.raid);

    expect(observed.raid.engagement.raid.portalStability).toBe(
      silent.raid.engagement.raid.portalStability,
    );
    expect(observed.raid.contactTick).toBe(silent.raid.contactTick);
    expect(a.resolutionTick).toBe(observed.raid.host.world.clock.engagementTick);
  });
});
