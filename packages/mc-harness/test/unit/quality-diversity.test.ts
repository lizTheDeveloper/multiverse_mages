/*
 * Multiverse Mages — the behaviour archive: binning, the null ladder, and width.
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

import {
  type BehaviourAxis,
  type CandidateOutcome,
  CELL_STATUS,
  MAX_ELITE_ILLEGAL_RATE,
  NULL_LADDER,
  NULL_RUNG,
  PHASE,
  PHASE_WEIGHT,
  type NullOutcomes,
  binOf,
  clearsLadder,
  coordinateOf,
  foldArchive,
  foldPhasedArchive,
  nullBarOf,
  phaseOfTick,
} from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

const AXES: readonly BehaviourAxis[] = [
  { id: 'nodes', edges: [10, 50, 200] },
  { id: 'universities', edges: [1, 10] },
];

function candidate(over: Partial<CandidateOutcome> & { strategyId: string }): CandidateOutcome {
  return {
    descriptors: { nodes: 0, universities: 0 },
    ascended: 0,
    runs: 40,
    illegalActionRate: 0,
    ...over,
  };
}

/** Nulls that all score zero — the ladder is present but the bar is on the floor. */
const SILENT_NULLS: NullOutcomes = Object.fromEntries(
  NULL_LADDER.map((entry) => [entry.strategyId, candidate({ strategyId: entry.strategyId })]),
);

describe('binning', () => {
  it('tiles the line, so every descriptor falls in exactly one bin', () => {
    const axis = AXES[0] as BehaviourAxis;
    // One more bin than edges, and the boundaries belong to the upper bin.
    expect(binOf(axis, -1)).toBe(0);
    expect(binOf(axis, 9)).toBe(0);
    expect(binOf(axis, 10)).toBe(1);
    expect(binOf(axis, 49)).toBe(1);
    expect(binOf(axis, 50)).toBe(2);
    expect(binOf(axis, 200)).toBe(3);
    expect(binOf(axis, 1e9)).toBe(3);
  });

  it('reads a missing descriptor as zero rather than throwing', () => {
    // A candidate whose executor did not report an axis should land in the
    // lowest bin and be visible, not vanish from the archive.
    expect(coordinateOf(AXES, {})).toBe('nodes:0|universities:0');
  });

  it('gives two strategies one bin apart different coordinates', () => {
    const near = coordinateOf(AXES, { nodes: 49, universities: 0 });
    const far = coordinateOf(AXES, { nodes: 50, universities: 0 });
    expect(near).not.toBe(far);
    // And two that differ by one node inside a bin are the same way to play.
    expect(coordinateOf(AXES, { nodes: 51, universities: 0 })).toBe(far);
  });
});

describe('the null ladder', () => {
  it('recomputes the bar from the nulls rather than storing one', () => {
    // The bar is whichever null did best *on these seeds*. Doing-nothing's
    // score changes as the game changes, so a stored number would rot.
    const nulls: NullOutcomes = {
      ...SILENT_NULLS,
      'permit-then-idle': candidate({ strategyId: 'permit-then-idle', ascended: 40 }),
    };
    expect(nullBarOf(nulls)).toEqual({ bar: 40, rung: NULL_RUNG.rulesetOnly });
  });

  it('names the rung that rejected a candidate, because the diagnoses differ', () => {
    // Losing to `passive-control` says the verbs do nothing; losing to
    // `uniform-random-legal` says they do something a coin could do.
    const passive: NullOutcomes = {
      ...SILENT_NULLS,
      'passive-control': candidate({ strategyId: 'passive-control', ascended: 20 }),
    };
    const random: NullOutcomes = {
      ...SILENT_NULLS,
      'uniform-random-legal': candidate({ strategyId: 'uniform-random-legal', ascended: 20 }),
    };
    const player = candidate({ strategyId: 'player', ascended: 5 });
    expect(clearsLadder(player, passive).failedRung).toBe(NULL_RUNG.passive);
    expect(clearsLadder(player, random).failedRung).toBe(NULL_RUNG.randomFloor);
  });

  it('refuses a tie — matching doing nothing is not beating it', () => {
    const nulls: NullOutcomes = {
      ...SILENT_NULLS,
      'passive-control': candidate({ strategyId: 'passive-control', ascended: 12 }),
    };
    expect(clearsLadder(candidate({ strategyId: 'tie', ascended: 12 }), nulls).clears).toBe(false);
    expect(clearsLadder(candidate({ strategyId: 'win', ascended: 13 }), nulls).clears).toBe(true);
  });

  it('disqualifies a candidate that reached its cell through the mask', () => {
    // Finding a hole in the legality mask is a bug report, not a way to play.
    const cheat = candidate({
      strategyId: 'cheat',
      ascended: 40,
      illegalActionRate: MAX_ELITE_ILLEGAL_RATE + 0.001,
    });
    expect(clearsLadder(cheat, SILENT_NULLS).clears).toBe(false);
  });
});

describe('the archive', () => {
  it('scores width, not fitness — a better duplicate adds nothing', () => {
    // This is the whole point. Two strategies that win the same way are one
    // way to play, however much better one of them is.
    const twins = [
      candidate({ strategyId: 'a', descriptors: { nodes: 100, universities: 5 }, ascended: 10 }),
      candidate({ strategyId: 'b', descriptors: { nodes: 100, universities: 5 }, ascended: 40 }),
    ];
    const spread = [
      twins[0] as CandidateOutcome,
      candidate({ strategyId: 'c', descriptors: { nodes: 5, universities: 0 }, ascended: 1 }),
    ];
    expect(foldArchive(AXES, twins, SILENT_NULLS).width).toBe(1);
    expect(foldArchive(AXES, spread, SILENT_NULLS).width).toBe(2);
  });

  it('keeps a cell nothing worth playing reached, and does not score it', () => {
    const nulls: NullOutcomes = {
      ...SILENT_NULLS,
      'passive-control': candidate({ strategyId: 'passive-control', ascended: 30 }),
    };
    const archive = foldArchive(
      AXES,
      [candidate({ strategyId: 'weak', descriptors: { nodes: 300, universities: 20 }, ascended: 2 })],
      nulls,
    );
    expect(archive.width).toBe(0);
    expect(archive.reachableNotWorthPlaying).toBe(1);
    expect(archive.cells[0]?.status).toBe(CELL_STATUS.reachableNotWorthPlaying);
    expect(archive.cells[0]?.failedRung).toBe(NULL_RUNG.passive);
  });

  it('never lets a cell that does not count displace one that does', () => {
    // Order-independence matters: the fold must not depend on which candidate
    // the search happened to evaluate first.
    const nulls: NullOutcomes = {
      ...SILENT_NULLS,
      'passive-control': candidate({ strategyId: 'passive-control', ascended: 5 }),
    };
    const real = candidate({ strategyId: 'real', descriptors: { nodes: 100 }, ascended: 6 });
    const loud = candidate({ strategyId: 'loud', descriptors: { nodes: 100 }, ascended: 4 });
    for (const order of [[real, loud], [loud, real]]) {
      const archive = foldArchive(AXES, order, nulls);
      expect(archive.width).toBe(1);
      expect(archive.cells[0]?.elite.strategyId).toBe('real');
    }
  });

  it('reports the margin over the null, which is the headline number', () => {
    const nulls: NullOutcomes = {
      ...SILENT_NULLS,
      'uniform-random-legal': candidate({ strategyId: 'uniform-random-legal', ascended: 8 }),
    };
    const archive = foldArchive(
      AXES,
      [candidate({ strategyId: 'best', descriptors: { nodes: 100 }, ascended: 21 })],
      nulls,
    );
    expect(archive.marginOverNull).toBe(13);
  });

  it('reports a negative margin rather than hiding it', () => {
    // The state the campaign was actually in: nothing beats doing nothing. A
    // search that clamped this to zero would report "no progress" for both
    // "nothing works" and "we are losing to the null", which are different.
    const nulls: NullOutcomes = {
      ...SILENT_NULLS,
      'permit-then-idle': candidate({ strategyId: 'permit-then-idle', ascended: 40 }),
    };
    const archive = foldArchive(
      AXES,
      [candidate({ strategyId: 'tries', descriptors: { nodes: 100 }, ascended: 3 })],
      nulls,
    );
    expect(archive.width).toBe(0);
    expect(archive.marginOverNull).toBe(-40);
  });
});

describe('phases', () => {
  const phased = (
    strategyId: string,
    perPhase: readonly (readonly [string, number])[],
    ascended = 10,
  ) => ({
    ...candidate({ strategyId, ascended }),
    phases: perPhase.map(([phase, nodes]) => ({
      phase: phase as 'early' | 'mid' | 'late',
      descriptors: { nodes, universities: 0 },
    })),
  });

  it('splits a run into three phases by fraction, not absolute tick', () => {
    // A 600-tick probe and a 2400-tick gate must both have three phases, so
    // "late" means late in this run.
    expect(phaseOfTick(10, 600)).toBe(PHASE.early);
    expect(phaseOfTick(300, 600)).toBe(PHASE.mid);
    expect(phaseOfTick(500, 600)).toBe(PHASE.late);
    expect(phaseOfTick(2000, 2400)).toBe(PHASE.late);
    // Same share, different horizons, same phase.
    expect(phaseOfTick(500, 600)).toBe(phaseOfTick(2000, 2400));
  });

  it('weights late diversity above mid above early', () => {
    // Early play is the most constrained and therefore the most forced, so a
    // difference that survives to the late game is worth more.
    expect(PHASE_WEIGHT.late).toBeGreaterThan(PHASE_WEIGHT.mid);
    expect(PHASE_WEIGHT.mid).toBeGreaterThan(PHASE_WEIGHT.early);
  });

  it('scores late width three times an early cell', () => {
    const earlyOnly = [
      phased('a', [['early', 5], ['mid', 100], ['late', 100]]),
      phased('b', [['early', 300], ['mid', 100], ['late', 100]]),
    ];
    const lateOnly = [
      phased('a', [['early', 100], ['mid', 100], ['late', 5]]),
      phased('b', [['early', 100], ['mid', 100], ['late', 300]]),
    ];
    const early = foldPhasedArchive(AXES, earlyOnly, SILENT_NULLS);
    const late = foldPhasedArchive(AXES, lateOnly, SILENT_NULLS);
    // Both have two cells in one phase and one in the other two.
    expect(early.widthByPhase.early).toBe(2);
    expect(late.widthByPhase.late).toBe(2);
    expect(late.weightedWidth).toBeGreaterThan(early.weightedWidth);
  });

  it('names a strategy that never changed, because that is a finding about the design', () => {
    // Mobility 1 means one move played for the whole run. permit-then-idle's
    // measured shape -- act for 140 ticks, then nothing for 2260 -- is the
    // degenerate phase profile every candidate has to beat.
    const archive = foldPhasedArchive(
      AXES,
      [
        phased('static', [['early', 100], ['mid', 100], ['late', 100]]),
        phased('mobile', [['early', 5], ['mid', 100], ['late', 300]]),
      ],
      SILENT_NULLS,
    );
    expect(archive.mobilityByStrategy['static']).toBe(1);
    expect(archive.mobilityByStrategy['mobile']).toBe(3);
    expect(archive.staticStrategies).toEqual(['static']);
  });

  it('treats a missing late phase as absent, not as the origin', () => {
    // A run that ended early has no late behaviour. Inventing one at zero would
    // put every truncated run in the same cell and read as agreement.
    const archive = foldPhasedArchive(
      AXES,
      [
        phased('full', [['early', 5], ['mid', 100], ['late', 300]]),
        phased('truncated', [['early', 5], ['mid', 100]]),
      ],
      SILENT_NULLS,
    );
    expect(archive.widthByPhase.late).toBe(1);
    expect(archive.mobilityByStrategy['truncated']).toBe(2);
  });

  it('applies the null ladder per phase, so a strong early game cannot pay for an absent late one', () => {
    const nulls: NullOutcomes = {
      ...SILENT_NULLS,
      'passive-control': candidate({ strategyId: 'passive-control', ascended: 20 }),
    };
    const archive = foldPhasedArchive(
      AXES,
      [phased('loser', [['early', 5], ['mid', 100], ['late', 300]], 3)],
      nulls,
    );
    // Loses the ladder, so it holds no cell in any phase however varied it is.
    expect(archive.weightedWidth).toBe(0);
    // But its mobility is still reported: it did change, it just never won.
    expect(archive.mobilityByStrategy['loser']).toBe(3);
  });
});
