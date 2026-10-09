/*
 * Multiverse Mages — a raid record says why it ended the way it did.
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
 * Round-4 playtest findings, as record fields (2026-10-09):
 *
 * - `forbiddenCastsBlocked` read 0 in all 94 raids and was taken to mean the
 *   host's ruleset (§3) never mattered. It is a tripwire that must read 0. What
 *   the host took off the table is `raiderNodesForbiddenByHost`.
 * - Identical-looking withdrawals were won once by each side. The victor is
 *   objective value taken against the threshold; the record now carries it.
 * (Mind reads, books carried and books burned are `knowledgeTaken`, from #257.)
 */

import { describe, expect, it } from 'vitest';

import { readRaidTuning } from '@mm/rules-raid';
import { RAID_SIDE } from '@mm/state';

import {
  explicitOpeningAxes,
  foundingCandidates,
  playPeerPair,
  referenceContent,
  type PeerRaidMeasurement,
} from '@mm/scenario';

const content = referenceContent();
const SLOW = 600_000;
const ARM = { mode: 'peer', prep: 120, attacker: 'armed', defender: 'idle' } as const;

async function raidsAgainst(defender: typeof content): Promise<PeerRaidMeasurement[]> {
  const raids: PeerRaidMeasurement[] = [];
  for (let i = 0; i < 2; i += 1) raids.push(...(await playPeerPair(content, ARM, 7000 + 2 * i, 7001 + 2 * i, defender)).raids);
  return raids;
}

describe('a raid record explains itself', () => {
  it(
    'counts what a narrow host ruleset took from the raiders, and nothing when the host forbids nothing',
    async () => {
      const axes = explicitOpeningAxes(content.registry, ['rego', 'intellego'], ['limen', 'mentem']);
      const narrow = { ...content, axes, foundingNodeIds: foundingCandidates(content.registry, axes) };
      const masked = await raidsAgainst(narrow);
      const open = await raidsAgainst(content);
      expect(masked.length).toBeGreaterThan(0);
      expect(open.length).toBeGreaterThan(0);
      // §3 bit, and the tripwire still reads zero: the mask did the work.
      for (const r of masked) expect(r.raiderNodesForbiddenByHost).toBeGreaterThan(0);
      // Measured 2026-10-09: 86 kit nodes forbidden and 0 attacks over 4 pairs,
      // against 0 and 521 under the same attacker and a host that forbids nothing.
      expect(masked.reduce((n, r) => n + r.attackAttempts, 0)).toBeLessThan(
        open.reduce((n, r) => n + r.attackAttempts, 0),
      );
      for (const r of open) expect(r.raiderNodesForbiddenByHost).toBe(0);

      const threshold = readRaidTuning(content.registry).victoryThresholdFraction;
      for (const r of [...masked, ...open]) {
        // The victor rule, recomputed from the record alone.
        const attackerWon = r.objectiveValueTotal > 0 && r.objectiveValueTaken * 1024 >= r.objectiveValueTotal * threshold;
        expect(r.victor).toBe(attackerWon ? RAID_SIDE.attacker : RAID_SIDE.defender);
      }
    },
    SLOW,
  );
});
