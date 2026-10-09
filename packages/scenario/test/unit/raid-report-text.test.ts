/*
 * Multiverse Mages — a raid report says who won the way the server decided it.
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
 * Playtest round 4, finding 2. Two inbound raids, both ended by withdrawal
 * (`RAID_END_REASON.raidersWithdrew`) with no casualties and no nodes taken,
 * read "You lost: the attackers carried it, because the raiders withdrew
 * through the portal" and "You won: the defenders carried it, because the
 * raiders withdrew through the portal". Both victors were the server's; the
 * sentence made the end reason the cause of the victory, which it is not —
 * `victorOf` gives the attackers the raid when the objective value they took
 * reaches a threshold, whatever ended it. The record now carries its
 * objectives, and the page says what was taken.
 *
 * `ui/app/explain.js` is imported, not transcribed, for the reason
 * `ui-vocabulary.test.ts` gives. Its enum tables are bound here to the
 * packages that own them.
 */

import { describe, expect, it } from 'vitest';
import { OBJECTIVE_KIND, RAID_END_REASON } from '@mm/rules-raid';
import { OBJECTIVE_STATUS, RAID_SIDE } from '@mm/state';

/* eslint-disable @typescript-eslint/no-explicit-any -- ui/ is untyped static JS. */
const explain = (await import(
  // @ts-expect-error -- ui/ is a set of static files with no types to resolve.
  '../../../../ui/app/explain.js'
)) as any;

/** A withdrawal with nobody hurt and no node new to the attackers. */
const quiet = {
  raidId: 1,
  worldTick: 14,
  engagementTicks: 120,
  reason: RAID_END_REASON.raidersWithdrew,
  raidersFielded: 3,
  raidersWithdrawn: 3,
  raidersStranded: 0,
  nodesTakenByAttacker: 0,
  localCasualties: 0,
  nodesGainedLocally: 0,
  nodesLostLocally: 0,
  attackerFavorCost: 16 * 1024,
  actionEconomy: { removals: [0, 0] },
};

describe("the page's raid enums are the server's", () => {
  it('sides, end reasons, objective kinds and statuses', () => {
    expect(explain.RAID_SIDE).toEqual({ attacker: RAID_SIDE.attacker, defender: RAID_SIDE.defender });
    for (const [id, value] of Object.entries(RAID_END_REASON)) {
      expect(explain.RAID_END_REASON_TEXT[value]?.id).toBe(id);
    }
    for (const [name, value] of Object.entries(OBJECTIVE_KIND)) {
      expect(explain.RAID_OBJECTIVE_KIND_NAME[value]).toBe(name);
    }
    for (const [name, value] of Object.entries(OBJECTIVE_STATUS)) {
      expect(explain.RAID_OBJECTIVE_STATUS_NAME[value]).toBe(name);
    }
  });
});

describe('a withdrawal reads as the victor the record names', () => {
  const lost = {
    ...quiet,
    victor: RAID_SIDE.attacker,
    objectives: [
      { kind: OBJECTIVE_KIND.university, status: OBJECTIVE_STATUS.captured },
      { kind: OBJECTIVE_KIND.library, status: OBJECTIVE_STATUS.held },
    ],
  };
  const won = {
    ...quiet,
    victor: RAID_SIDE.defender,
    objectives: [
      { kind: OBJECTIVE_KIND.university, status: OBJECTIVE_STATUS.held },
      { kind: OBJECTIVE_KIND.library, status: OBJECTIVE_STATUS.held },
    ],
  };

  it('the round-4 pair: one lost, one won, and each says why', () => {
    const a = explain.describeRaid(lost, 'inbound', 'X');
    const b = explain.describeRaid(won, 'inbound', 'X');
    expect(a.weWon).toBe(false);
    expect(b.weWon).toBe(true);
    expect(a.outcome).toMatch(/^You lost: the raiders took what they came for — your university \(captured\) — and withdrew/u);
    expect(b.outcome).toBe('You won: the raiders withdrew through the portal empty-handed.');
    // The end reason is a row of its own, never the stated cause of a victory.
    for (const d of [a, b]) {
      expect(d.outcome).not.toMatch(/because the raiders withdrew/u);
      expect(d.rows).toContainEqual(['how it ended', 'the raiders withdrew through the portal']);
    }
    expect(a.rows).toContainEqual(['objectives taken', 'your university (captured)']);
    expect(b.rows).toContainEqual(['objectives taken', 'none']);
  });

  it('the attacker reads the same raids the other way round', () => {
    expect(explain.describeRaid(lost, 'outbound', 'X').outcome).toMatch(/^You won: your raiders took what they came for — their university/u);
    expect(explain.describeRaid(won, 'outbound', 'X').outcome).toBe('You lost: your raiders withdrew through the portal empty-handed.');
  });

  it('a defender win with something taken says it was too little, not empty-handed', () => {
    const some = { ...won, objectives: [{ kind: OBJECTIVE_KIND.library, status: OBJECTIVE_STATUS.looted }] };
    expect(explain.describeRaid(some, 'inbound', 'X').outcome).toBe(
      'You won: the raiders took too little to count as a win — only your library (looted) — and withdrew through the portal.',
    );
    // A node carried off is something taken, even with every objective held.
    const node = { ...won, nodesTakenByAttacker: 1 };
    expect(explain.describeRaid(node, 'inbound', 'X').outcome).not.toMatch(/empty-handed/u);
  });

  it('a record from before objectives were carried still follows its victor', () => {
    const oldLost: Record<string, unknown> = { ...lost };
    const oldWon: Record<string, unknown> = { ...won };
    delete oldLost.objectives;
    delete oldWon.objectives;
    expect(explain.describeRaid(oldLost, 'inbound', 'X').outcome).toMatch(/^You lost: the raiders took enough of what they came for to count as a win/u);
    expect(explain.describeRaid(oldWon, 'inbound', 'X').outcome).toMatch(/^You won: the raiders did not take enough to count as a win/u);
    expect(explain.describeRaid(oldWon, 'inbound', 'X').rows).toContainEqual(['objectives taken', 'not in the record']);
  });
});

describe('the report is a full ledger (playtest round 4, second pass)', () => {
  const full = {
    ...quiet,
    victor: RAID_SIDE.defender,
    reason: RAID_END_REASON.raidersWithdrew,
    raidersFielded: 4,
    raidersWithdrawn: 2,
    raidersStranded: 1,
    nodesTakenByAttacker: 10,
    forbiddenCastsBlocked: 3,
    objectives: [{ kind: OBJECTIVE_KIND.library, status: OBJECTIVE_STATUS.held }],
    casualtiesBySide: [1, 2],
    nodesLostByDefender: 1,
    knowledgeTaken: { copied: 7, moved: 3, destroyed: 2 },
  };

  it('a loss with loot says both, on the attacker’s side', () => {
    expect(explain.describeRaid(full, 'outbound', 'Quiet Fen').outcome).toBe(
      'You lost: your raiders fell short of a win — none of the objectives — but carried 10 nodes new to them home through the portal.',
    );
  });

  it('each side’s dead, the knowledge by verb, and the host’s ruleset', () => {
    const rows = Object.fromEntries(explain.describeRaid(full, 'inbound', 'Raiding Court', { arrivedTick: 75 }).rows);
    expect(rows['their raiders']).toBe('4 sent · 2 came home · 1 stranded · 1 fell fighting');
    expect(rows['mages lost for good']).toBe('yours 2 · theirs 1');
    expect(rows['knowledge taken']).toBe('7 read from minds · 3 books carried off · 2 books burned · 10 nodes new to the attackers');
    expect(rows['nodes you lost entirely']).toBe('1');
    expect(rows['fought under']).toBe('your ruleset — 3 casts it forbids were stopped');
    const out = Object.fromEntries(explain.describeRaid(full, 'outbound', 'Quiet Fen').rows);
    expect(out['mages lost for good']).toBe('yours 1 · theirs 2');
    expect(out['fought under']).toBe('Quiet Fen’s ruleset — 3 casts it forbids were stopped');
  });

  it('an inbound raid is dated by the defender’s own clock', () => {
    // The record's tick is the attacker's: "year 40" in a defender's year 6.
    const late = { ...full, worldTick: 490 };
    const when = (extra: unknown) => Object.fromEntries(explain.describeRaid(late, 'inbound', 'X', extra).rows).when as string;
    expect(when({ arrivedTick: 75 })).toMatch(/^your year 6 \(their year 40\)/u);
    expect(when({})).toMatch(/^their year 40 — their clock, not yours/u);
  });

  it('the feed line is in words, not an outcome code', () => {
    const line = explain.raidFeedText(full, 'inbound', 'X') as string;
    expect(line).not.toMatch(/raidersWithdrew|\(\w+[A-Z]\w*\)/u);
    expect(line).toContain('the raiders withdrew through the portal');
  });
});

describe('setup is honest about a species that cannot reach a portal', () => {
  const content = {
    species: [{ speciesId: 6, id: 'orc', name: 'Orc', depthCeiling: 3 }, { speciesId: 5, id: 'human', name: 'Human', depthCeiling: 4 }],
    portal: { nodeIds: [316, 322], usableMastery: 512, masteryMax: 1024 },
    nodes: [{ nodeId: 316, tier: 4 }, { nodeId: 322, tier: 5 }],
  };
  it('names the ceiling and the tier for Orcs, and says nothing for Humans', () => {
    expect(explain.portalDepthWarning(content, 'orc')).toBe(
      'Orc mages research no deeper than tier 3, and the shallowest portal node is tier 4: your own people cannot learn to open a portal.',
    );
    expect(explain.portalDepthWarning(content, 'human')).toBeNull();
  });
});

describe('no report contradicts its record', () => {
  it('over every side, end reason and perspective', () => {
    for (const victor of [RAID_SIDE.attacker, RAID_SIDE.defender]) {
      for (const reason of Object.values(RAID_END_REASON)) {
        for (const perspective of ['inbound', 'outbound']) {
          for (const objectives of [undefined, [], [{ kind: OBJECTIVE_KIND.archmage, status: OBJECTIVE_STATUS.destroyed }]]) {
            const record = { ...quiet, victor, reason, ...(objectives === undefined ? {} : { objectives }) };
            const d = explain.describeRaid(record, perspective, 'X');
            const weWon = (perspective === 'outbound') === (victor === RAID_SIDE.attacker);
            expect(d.weWon).toBe(weWon);
            expect(d.outcome.startsWith(weWon ? 'You won:' : 'You lost:')).toBe(true);
            if (victor === RAID_SIDE.attacker) expect(d.outcome).not.toMatch(/too little|empty-handed|did not take enough|took nothing/u);
            else expect(d.outcome).not.toMatch(/took what they came for|enough of what they came for to count/u);
          }
        }
      }
    }
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any */
