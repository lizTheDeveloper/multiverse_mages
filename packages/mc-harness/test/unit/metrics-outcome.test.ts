/*
 * Multiverse Mages — ascensionRate, prestigeAdvantage, and illegalActionRate.
 * Tasks 6.10, 6.11 and 6.12.
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

import type { ArmRunSummary, TerminalStatus } from '@mm/mc-harness';
import {
  NOOP_ACTION_ID,
  collectAscensionRate,
  collectIllegalActionRate,
  collectPrestigeAdvantage,
  illegalActionsByStrategy,
  mirroredPairProblems,
} from '@mm/mc-harness';

import { ALL_MECHANICS, arm, armRun, telemetry } from './metrics-fixtures.js';

function runsWith(counts: Readonly<Record<string, number>>): ArmRunSummary[] {
  const runs: ArmRunSummary[] = [];
  let replicateIndex = 0;
  for (const [status, count] of Object.entries(counts)) {
    for (let index = 0; index < count; index += 1) {
      runs.push(
        armRun({
          status: status as TerminalStatus,
          coordinates: { rootSeed: 1, sweepId: 'fixture', cellIndex: 0, replicateIndex },
        }),
      );
      replicateIndex += 1;
    }
  }
  return runs;
}

describe('ascensionRate (task 6.10)', () => {
  it('keeps truncated runs in the denominator and excludes failures', () => {
    // The capability spec's arithmetic: 40 ascensions, 300 stagnations, 150
    // truncations, 10 failures → 40/490, with the 10 reported separately.
    const entry = collectAscensionRate(
      arm({ runs: runsWith({ ascended: 40, stagnated: 300, truncated: 150, failed: 10 }) }),
    );
    if (entry.status !== 'measured') throw new Error('expected a measurement');
    expect(entry.value).toBeCloseTo(40 / 490, 12);
    expect(entry.detail?.['denominator']).toBe(490);
    expect(entry.detail?.['failedExcluded']).toBe(10);
  });

  it('would report a different rate if truncated runs were dropped', () => {
    // A positive control for the rule above: if truncations left the
    // denominator the rate would be 40/340, which is not 40/490. The rule is
    // therefore load-bearing rather than decorative.
    const entry = collectAscensionRate(
      arm({ runs: runsWith({ ascended: 40, stagnated: 300, truncated: 150 }) }),
    );
    if (entry.status !== 'measured') throw new Error('expected a measurement');
    expect(entry.value).not.toBeCloseTo(40 / 340, 6);
  });

  it('reports the target band without clamping to it', () => {
    // "Reported, not enforced by the collector": an out-of-band value is the
    // gate's business. A collector that clamped would make the metric agree
    // with the target by construction.
    const entry = collectAscensionRate(arm({ runs: runsWith({ ascended: 9, stagnated: 1 }) }));
    if (entry.status !== 'measured') throw new Error('expected a measurement');
    expect(entry.value).toBeCloseTo(0.9, 12);
    expect(entry.detail?.['targetBandMax']).toBe(0.2);
  });

  it('reports 0 as a finding when no run ascended', () => {
    const entry = collectAscensionRate(arm({ runs: runsWith({ stagnated: 5, truncated: 5 }) }));
    expect(entry).toMatchObject({ status: 'measured', value: 0 });
  });

  it('reports no-observations when every run failed', () => {
    expect(collectAscensionRate(arm({ runs: runsWith({ failed: 3 }) }))).toMatchObject({
      status: 'unavailable',
      reason: 'no-observations',
    });
  });

  it('reports no-observations for an empty arm', () => {
    expect(collectAscensionRate(arm({ runs: [] }))).toMatchObject({ reason: 'no-observations' });
  });
});

describe('prestigeAdvantage (task 6.11)', () => {
  it('reports mechanic-absent while the carry-forward maximum is undefined', () => {
    const entry = collectPrestigeAdvantage(arm());
    expect(entry).toMatchObject({ status: 'unavailable', reason: 'mechanic-absent' });
    expect(entry.detail?.['owner']).toBe('god-agency');
  });

  it('refuses to invent a magnitude even on a build that has prestige', () => {
    // Two conditions, both required: the mechanic exists *and* somebody chose
    // the maximum. `null` is the statement that nobody has.
    expect(
      collectPrestigeAdvantage(arm({ mechanics: ALL_MECHANICS, prestigeCarryForwardMax: null })),
    ).toMatchObject({ reason: 'mechanic-absent' });
  });

  it('measures the win rate over mirrored plays once a magnitude exists', () => {
    const entry = collectPrestigeAdvantage(
      arm({
        mechanics: ALL_MECHANICS,
        prestigeCarryForwardMax: 1024,
        mirroredPlays: [
          { runSeed: 11, prestigeSide: 0, prestigeWon: true },
          { runSeed: 11, prestigeSide: 1, prestigeWon: false },
          { runSeed: 22, prestigeSide: 0, prestigeWon: true },
          { runSeed: 22, prestigeSide: 1, prestigeWon: true },
        ],
      }),
    );
    if (entry.status !== 'measured') throw new Error('expected a measurement');
    expect(entry.value).toBeCloseTo(0.75, 12);
    expect(entry.detail?.['pairs']).toBe(2);
    expect(entry.detail?.['thresholdMax']).toBe(0.6);
  });

  it('fails rather than reporting a win rate from unmirrored plays', () => {
    // An unmirrored pair leaves whatever advantage side 0 has inside the
    // estimate, and it does so quietly — as a number near 50% that drifts.
    expect(() =>
      collectPrestigeAdvantage(
        arm({
          mechanics: ALL_MECHANICS,
          prestigeCarryForwardMax: 1024,
          mirroredPlays: [
            { runSeed: 11, prestigeSide: 0, prestigeWon: true },
            { runSeed: 11, prestigeSide: 0, prestigeWon: true },
          ],
        }),
      ),
    ).toThrow(/side bias/);
  });

  it('names an unpaired seed', () => {
    expect(mirroredPairProblems([{ runSeed: 5, prestigeSide: 0 }]).join(' ')).toContain('seed 5');
    expect(
      mirroredPairProblems([
        { runSeed: 5, prestigeSide: 0 },
        { runSeed: 5, prestigeSide: 1 },
      ]),
    ).toEqual([]);
  });

  it('reports no-observations when the arm scheduled no pairs', () => {
    expect(
      collectPrestigeAdvantage(arm({ mechanics: ALL_MECHANICS, prestigeCarryForwardMax: 1024 })),
    ).toMatchObject({ reason: 'no-observations' });
  });
});

describe('illegalActionRate (task 6.12)', () => {
  it('puts no-ops in the denominator', () => {
    // The capability spec's arithmetic: 900 no-ops and 100 other actions, 20
    // rejected → 0.02, not 0.2.
    const entry = collectIllegalActionRate(
      telemetry({ accounting: { submissions: 1000, rejections: 20, byActionId: { '3': 20 } } }),
    );
    if (entry.status !== 'measured') throw new Error('expected a measurement');
    expect(entry.value).toBeCloseTo(0.02, 12);
  });

  it('breaks the rate down by action id, so the unclear mask entry is visible', () => {
    const entry = collectIllegalActionRate(
      telemetry({
        accounting: { submissions: 200, rejections: 60, byActionId: { '11': 50, '4': 10 } },
      }),
    );
    const rates = entry.detail?.['rejectionRateByActionId'] as Record<string, number>;
    expect(rates['11']).toBeCloseTo(0.25, 12);
    expect(rates['4']).toBeCloseTo(0.05, 12);
    // Every rejected action id appears. Key *order* is not asserted here and
    // must not be relied on: JavaScript iterates integer-like keys numerically
    // whatever order they were inserted in, and `canonicalJson` sorts them
    // lexicographically on the way to disk regardless. The record's bytes are
    // canonical; this object's iteration order is not the mechanism.
    expect(Object.keys(rates).sort()).toEqual(['11', '4']);
  });

  it('reports passing and being refused separately', () => {
    // A strategy submitting only no-ops because everything else is masked has a
    // rejection count of zero and a high no-op share, and the two must not be
    // collapsed into one number.
    const entry = collectIllegalActionRate(
      telemetry({
        accounting: { submissions: 500, rejections: 0, byActionId: {} },
        submittedByActionId: { [String(NOOP_ACTION_ID)]: 480, '12': 20 },
      }),
    );
    if (entry.status !== 'measured') throw new Error('expected a measurement');
    expect(entry.value).toBe(0);
    expect(entry.detail?.['noOpShare']).toBeCloseTo(0.96, 12);
  });

  it('omits the no-op share when the session cannot supply submissions by action', () => {
    // agent-api exports rejections by action id, not submissions by action id.
    // The collector reports what exists rather than recounting independently.
    const entry = collectIllegalActionRate(
      telemetry({ accounting: { submissions: 10, rejections: 1, byActionId: { '2': 1 } } }),
    );
    expect(entry.detail).not.toHaveProperty('noOpShare');
  });

  it('reports no-observations when nothing was submitted', () => {
    expect(collectIllegalActionRate(telemetry())).toMatchObject({
      status: 'unavailable',
      reason: 'no-observations',
    });
  });

  it('fails when more actions were rejected than submitted', () => {
    expect(() =>
      collectIllegalActionRate(
        telemetry({ accounting: { submissions: 5, rejections: 6, byActionId: {} } }),
      ),
    ).toThrow(/different episodes/);
  });
});

describe('the per-strategy breakdown', () => {
  it('attributes a single-strategy run exactly', () => {
    const breakdown = illegalActionsByStrategy([
      { strategies: ['archivist'], accounting: { submissions: 100, rejections: 10, byActionId: { '5': 10 } } },
      { strategies: ['passive'], accounting: { submissions: 100, rejections: 0, byActionId: {} } },
    ]);
    expect(breakdown.map((entry) => entry.strategyId)).toEqual(['archivist', 'passive']);
    expect(breakdown[0]?.rate).toBeCloseTo(0.1, 12);
    expect(breakdown[1]?.rate).toBe(0);
  });

  it('splits a mixed-strategy run evenly across its slots, as documented', () => {
    const breakdown = illegalActionsByStrategy([
      {
        strategies: ['a', 'b'],
        accounting: { submissions: 100, rejections: 20, byActionId: { '1': 20 } },
      },
    ]);
    expect(breakdown[0]?.submissions).toBe(50);
    expect(breakdown[0]?.rejections).toBe(10);
    expect(breakdown[1]?.rate).toBeCloseTo(0.2, 12);
  });

  it('reports null, never 0, for a strategy that submitted nothing', () => {
    const breakdown = illegalActionsByStrategy([
      { strategies: ['quiet'], accounting: { submissions: 0, rejections: 0, byActionId: {} } },
    ]);
    expect(breakdown[0]?.rate).toBeNull();
  });
});
