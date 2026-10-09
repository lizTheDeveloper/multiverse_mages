/*
 * Multiverse Mages — raids between live players do what vision §8 says.
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
 * The regression guard for the raid tuning of 2026-10-08.
 *
 * Before it, every raid between two live universes was inert as a fight: the
 * cheapest cast cost fp(3) of vigor against every mage's fp(1), so nobody ever
 * cast, nobody died to anything but the sweep-stranding rule, and a portal that
 * lived 2,400–3,600 ticks could never collapse on anyone. The full measurement
 * is `scripts/peer-raid-survey.mjs`; this is a small seeded slice of it,
 * asserting the bands loosely enough to survive an honest retune and tightly
 * enough that the inert build fails every one of them.
 *
 * Each band has a positive control beside it, after `trust-your-instruments`:
 * the lethal degenerate end must read casualties, or a zero here is unreadable.
 */

import { describe, expect, it } from 'vitest';

import { loadContent, shippedContentSource, type ContentSource } from '@mm/content';
import { RAID_END_REASON, readRaidTuning } from '@mm/rules-raid';
import { BASE_MAX_VIGOR } from '@mm/rules-world';
import { RAID_SIDE } from '@mm/state';

import { playPeerPair, referenceContent, type PeerRaidMeasurement } from '@mm/scenario';

const content = referenceContent();
const SEED0 = 7000;
const PAIRS = 3;
const SLOW = 600_000;

/** Shipped content with some `raid-constant.json` values replaced. */
function contentWith(overrides: ReadonlyMap<string, number>): ReturnType<typeof referenceContent> {
  const base = shippedContentSource();
  const source: ContentSource = {
    origin: `${base.origin}+test-overrides`,
    read(fileName) {
      const text = base.read(fileName);
      if (fileName !== 'raid-constant.json' || text === undefined) return text;
      const rows = JSON.parse(text) as { id: string; value: number }[];
      for (const row of rows) {
        const value = overrides.get(row.id);
        if (value !== undefined) row.value = value;
      }
      return JSON.stringify(rows);
    },
  };
  return referenceContent(loadContent(source));
}

const tookSomething = (r: PeerRaidMeasurement): boolean =>
  r.grimoiresCarried > 0 || r.nodesTakenByAttacker > 0 || r.libraryInstancesLost > 0;

describe('a mage can afford to cast in a raid', () => {
  it('prices a tier-1 cast inside the vigor every mage is born with', () => {
    const tuning = readRaidTuning(content.registry);
    // The defect this whole change started from: fp(2) + fp(1) per tier
    // against an fp(1) pool. Not a balance claim — an arithmetic one. If the
    // cheapest spell costs more than any mage holds, combat is structurally off.
    expect(tuning.castVigorBase + tuning.castVigorPerTier).toBeLessThanOrEqual(BASE_MAX_VIGOR);
    // And at least two casts, or a raider fires once and is spent.
    expect(2 * (tuning.castVigorBase + tuning.castVigorPerTier)).toBeLessThanOrEqual(BASE_MAX_VIGOR);
  });

  it('lets a portal collapse inside the length of a raid', () => {
    const tuning = readRaidTuning(content.registry);
    // Vision §8: "defender wins by holding until the portal collapses". A
    // portal outliving the longest raid by an order of magnitude makes that
    // sentence unreachable, which is what fp(3000) ± fp(600) did.
    const longest = Math.floor((tuning.portalStabilityInitial + tuning.portalStabilityJitter) / tuning.stabilityDecayPerTick);
    expect(longest).toBeLessThanOrEqual(4 * tuning.withdrawAfterTicks);
  });
});

describe('live peer raids after a preparation window (seeds 7000–7005)', () => {
  // One pair per test, each yielding to the event loop once a world year — a
  // single synchronous minute trips vitest's 60 s RPC timeout (see
  // `vitest.config.ts`). The bands are asserted over the collected raids last.
  const raids: PeerRaidMeasurement[] = [];
  const ARMS = [
    { mode: 'peer', prep: 120, attacker: 'armed', defender: 'idle' },
    { mode: 'peer', prep: 120, attacker: 'all-in', defender: 'idle' },
  ] as const;
  for (const arm of ARMS) {
    for (let i = 0; i < PAIRS; i += 1) {
      it(
        `plays pair ${String(i)} under ${arm.attacker}`,
        async () => {
          raids.push(...(await playPeerPair(content, arm, SEED0 + 2 * i, SEED0 + 2 * i + 1)).raids);
        },
        SLOW,
      );
    }
  }

  it('fight, kill, take, and do not all go one way', () => {
    // Most pairs raided: the preparation window does not close the door. (An
    // all-in warband can lose enough of itself before the gate opens that a
    // pair never raids; measured 5 of 6 on these seeds.)
    expect(raids.length).toBeGreaterThanOrEqual(PAIRS + 1);
    for (const r of raids) {
      expect(r.raidersFielded).toBeGreaterThanOrEqual(4);
      expect(r.reason).not.toBe(RAID_END_REASON.ceilingReached);
    }
    // Somebody cast something in most raids. The inert build read zero on all.
    expect(raids.filter((r) => r.attackAttempts > 0).length * 2).toBeGreaterThanOrEqual(raids.length);
    const withCasualty = raids.filter((r) => r.casualtiesAttacker + r.casualtiesDefender > 0).length;
    expect(withCasualty * 2).toBeGreaterThanOrEqual(raids.length);

    const wins = raids.filter((r) => r.victor === RAID_SIDE.attacker);
    // Loose stand-in for the 30–60 % band: both outcomes happen.
    expect(wins.length).toBeGreaterThan(0);
    expect(wins.length).toBeLessThan(raids.length);
    expect(wins.filter(tookSomething).length * 2).toBeGreaterThanOrEqual(wins.length);
  });

  it(
    'reads casualties under the lethal degenerate end (positive control)',
    async () => {
      const lethal = contentWith(
        new Map([
          ['cast-vigor-base', 1],
          ['cast-vigor-per-tier', 1],
          ['combatant-base-max-hp', 16],
          ['combatant-hp-per-tier', 1],
        ]),
      );
      const { raids } = await playPeerPair(lethal, { mode: 'peer', prep: 0, attacker: 'fresh', defender: 'idle' }, SEED0, SEED0 + 1);
      expect(raids).toHaveLength(1);
      const r = raids[0] as PeerRaidMeasurement;
      expect(r.attackAttempts).toBeGreaterThan(0);
      expect(r.casualtiesAttacker + r.casualtiesDefender).toBeGreaterThan(0);
    },
    SLOW,
  );
});
