/*
 * Multiverse Mages — which ending a run reached, carried all the way into the
 * record instead of being inferred from tick clustering.
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
 * `contracts.md` §1.1 numbers five endings and `agent-api` reports all five on
 * `OutcomeRecord.terminalReason`. The harness then threw two of them away:
 * `agent-api`'s own `status()` folds `ascensionApotheosis` and `ascensionCanon`
 * into one `'ascended'`, and `RunRecord` carried only that status. So a sweep
 * could count ascensions and could not say *which summit*, and route share had
 * to be guessed from when the ascensions clustered in time.
 *
 * `status` keeps its meaning exactly. This is the number beside it.
 */

import type { RunRecord } from '@mm/mc-harness';
import {
  RECORD_FORMAT_VERSION,
  TERMINAL_REASON,
  TERMINAL_REASON_NAME,
  adaptAgentSession,
  buildRunRecord,
  countByTerminalReason,
  deriveRunSeed,
  runEpisode,
} from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import { syntheticRecord } from './fixtures.js';

/**
 * The smallest thing satisfying `ApiSessionLike`: it ends after `endAfter`
 * submissions with the reason it was built for.
 */
function apiDouble(options: { endAfter: number; reason: number }) {
  let ticks = 0;
  const ended = (): boolean => ticks >= options.endAfter;
  return {
    reset(): void {
      ticks = 0;
    },
    observe: () => new Float64Array(4),
    legalActions: () => new Uint8Array(16).fill(1),
    submit(): void {
      ticks += 1;
    },
    outcome: () => ({ terminalReason: ended() ? options.reason : TERMINAL_REASON.none }),
    status: (): 'running' | 'ascended' | 'stagnated' | 'truncated' => {
      if (!ended()) return 'running';
      switch (options.reason) {
        case TERMINAL_REASON.ascensionApotheosis:
        case TERMINAL_REASON.ascensionCanon:
          return 'ascended';
        case TERMINAL_REASON.stagnation:
          return 'stagnated';
        default:
          return 'truncated';
      }
    },
    accounting: () => ({ submitted: ticks, rejected: 0, rejectedByAction: {} }),
  };
}

function runWith(reason: number, endAfter = 3, worldTickCap = 10) {
  return runEpisode({
    session: adaptAgentSession(apiDouble({ endAfter, reason })),
    runSeed: 7,
    scenarioConfig: {},
    policies: [() => 0],
    worldTickCap,
  });
}

describe('the episode carries the ending, not just the status', () => {
  it('distinguishes the two ascension routes a single status collapses', () => {
    const apotheosis = runWith(TERMINAL_REASON.ascensionApotheosis);
    const canon = runWith(TERMINAL_REASON.ascensionCanon);

    // The point of the whole change: identical status, different summits.
    expect(apotheosis.status).toBe('ascended');
    expect(canon.status).toBe('ascended');
    expect(apotheosis.terminalReason).toBe(TERMINAL_REASON.ascensionApotheosis);
    expect(canon.terminalReason).toBe(TERMINAL_REASON.ascensionCanon);
  });

  it('reports stagnation and simulation-side truncation under their own numbers', () => {
    expect(runWith(TERMINAL_REASON.stagnation).terminalReason).toBe(TERMINAL_REASON.stagnation);
    expect(runWith(TERMINAL_REASON.truncated).terminalReason).toBe(TERMINAL_REASON.truncated);
  });

  it('reports `none` for a run the harness truncated at its own cap', () => {
    // Not synthesised into §1.1's `truncated`. The universe did not end; the
    // harness stopped asking. `status: truncated` with reason `none` is the
    // harness's cap, and `status: truncated` with reason `truncated` is the
    // simulation's — two facts one field could not hold.
    const capped = runWith(TERMINAL_REASON.stagnation, 99, 4);
    expect(capped.status).toBe('truncated');
    expect(capped.ticksRun).toBe(4);
    expect(capped.terminalReason).toBe(TERMINAL_REASON.none);
  });
});

describe('the run record carries the ending', () => {
  it('stores it, and moves the record format version', () => {
    const record = syntheticRecord({
      cellIndex: 0,
      replicateIndex: 0,
      metrics: {},
      status: 'ascended',
      terminalReason: TERMINAL_REASON.ascensionCanon,
    });
    expect(record.terminalReason).toBe(TERMINAL_REASON.ascensionCanon);
    expect(RECORD_FORMAT_VERSION).toBe(3);
  });

  it('defaults a record with no reason to `none` rather than refusing to build', () => {
    // A `failed` run never reached a universe, and a caller that names no
    // reason is saying "nothing ended" — which is what `none` is for.
    const coordinates = {
      rootSeed: 20260805,
      sweepId: 'toy-sweep',
      cellIndex: 0,
      replicateIndex: 0,
    };
    const built = buildRunRecord({
      task: {
        coordinates,
        runSeed: deriveRunSeed(coordinates),
        levels: {},
        strategies: ['toy-passive'],
        metrics: [],
        worldTickCap: 8,
      } as never,
      status: 'failed',
      ticksRun: 0,
      metrics: {},
      accounting: { submissions: 0, rejections: 0, byActionId: {} },
      provenance: syntheticRecord({ cellIndex: 0, replicateIndex: 0, metrics: {} }).provenance,
      failure: { classification: 'protocol', message: 'no result' },
    });
    expect(built.terminalReason).toBe(TERMINAL_REASON.none);
  });
});

describe('a sweep reports the per-route split beside the status counts', () => {
  it('counts by route name, and the counts sum to the records', () => {
    const records: RunRecord[] = [
      { reason: TERMINAL_REASON.ascensionApotheosis, status: 'ascended' as const },
      { reason: TERMINAL_REASON.ascensionApotheosis, status: 'ascended' as const },
      { reason: TERMINAL_REASON.ascensionCanon, status: 'ascended' as const },
      { reason: TERMINAL_REASON.stagnation, status: 'stagnated' as const },
      { reason: TERMINAL_REASON.none, status: 'truncated' as const },
    ].map((entry, index) =>
      syntheticRecord({
        cellIndex: 0,
        replicateIndex: index,
        metrics: {},
        status: entry.status,
        terminalReason: entry.reason,
      }),
    );

    const counts = countByTerminalReason(records);
    expect(counts).toEqual({
      ascensionApotheosis: 2,
      ascensionCanon: 1,
      none: 1,
      stagnation: 1,
    });
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(records.length);
  });

  it('names every reason contracts.md §1.1 numbers, and does not renumber them', () => {
    expect(TERMINAL_REASON).toEqual({
      none: 0,
      ascensionApotheosis: 1,
      ascensionCanon: 2,
      stagnation: 3,
      truncated: 4,
    });
    expect(TERMINAL_REASON_NAME[1]).toBe('ascensionApotheosis');
    expect(TERMINAL_REASON_NAME[4]).toBe('truncated');
  });
});
