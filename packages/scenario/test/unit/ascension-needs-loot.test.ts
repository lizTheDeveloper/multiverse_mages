/*
 * Multiverse Mages — a universe that never raids can never ascend.
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
 * Vision §8a, the author's rule of 2026-10-08: **ascension without raids
 * shouldn't be possible.** Both paths require looted knowledge held at the
 * moment of qualifying, and only a raid writes `knowledge-provenance`.
 *
 * Asserted on the assembled reference universe rather than on the predicate,
 * because the predicate's own tests cannot see a second writer of the row or a
 * path that bypasses `qualifyingPath`. And asserted against a **positive
 * control**: every other conjunct of both paths is made trivially true — the
 * Enduring Canon's era count at zero, the floor at year one — so the control
 * arm, identical but for `ascension-looted-nodes = 0`, qualifies on its first
 * eligible tick. A peaceful universe that still never qualifies is then refused
 * by the loot conjunct and by nothing else, and removing that conjunct fails
 * this file.
 */

import { describe, expect, it } from 'vitest';

import { GOD_ACTION, createSession } from '@mm/agent-api';
import type { ContentRegistry } from '@mm/content';
import { ASCENSION_PATH } from '@mm/state';

import { referenceContent, referenceScenario, shippedContent } from '../../src/index.js';

const SEED = 20261008;
const MIN_TICK = 12;
const HORIZON = 36;

/**
 * The shipped content with named god constants replaced — in both the list and
 * the `godConstant` lookup, which closes over the loader's own map and is what
 * `resolveGodConstants` actually reads.
 */
function withGodConstants(overrides: Readonly<Record<string, number>>): ContentRegistry {
  const shipped = shippedContent();
  return {
    ...shipped,
    godConstants: shipped.godConstants.map((entry) =>
      overrides[entry.record.id] === undefined
        ? entry
        : { ...entry, record: { ...entry.record, value: overrides[entry.record.id] as number } },
    ),
    godConstant: (id: string) => overrides[id] ?? shipped.godConstant(id),
  };
}

/** Ascension made trivially reachable on every conjunct but the one under test. */
function easy(looted: number): ContentRegistry {
  return withGodConstants({
    'ascension-min-tick': MIN_TICK,
    'ascension-era-count': 0,
    'ascension-looted-nodes': looted,
  });
}

interface Trace {
  readonly paths: number[];
  readonly looted: number[];
  readonly declareOpen: boolean[];
}

function play(registry: ContentRegistry, raids: boolean): Trace {
  const { scenario, lastGodReport } = referenceScenario(referenceContent(registry), { raids });
  const session = createSession({ scenario, strategyId: 'ascension-needs-loot' });
  session.reset(SEED, { worldTickCap: HORIZON + 4 });
  const trace: Trace = { paths: [], looted: [], declareOpen: [] };
  for (let tick = 0; tick < HORIZON; tick += 1) {
    session.submit({ kind: GOD_ACTION.noop });
    const report = lastGodReport();
    if (report === undefined) continue;
    trace.paths.push(report.ascensionPath);
    trace.looted.push(report.ascensionProgress.lootedNodesHeld);
    trace.declareOpen.push(session.legalActions()[GOD_ACTION.declareAscension] === 1);
  }
  return trace;
}

describe('a universe that never raids can never ascend', () => {
  it('is a control on the control: with the loot conjunct off, the easy universe qualifies', () => {
    const control = play(easy(0), false);
    expect(control.paths.some((path) => path !== ASCENSION_PATH.none)).toBe(true);
    expect(control.declareOpen.some(Boolean)).toBe(true);
  });

  it('never qualifies, never unmasks declareAscension, and holds no plunder, with raids off', () => {
    const peaceful = play(easy(1), false);
    expect(peaceful.paths.length).toBeGreaterThan(HORIZON - MIN_TICK);
    expect(peaceful.paths.every((path) => path === ASCENSION_PATH.none)).toBe(true);
    expect(peaceful.declareOpen.some(Boolean)).toBe(false);
    expect(peaceful.looted.every((count) => count === 0)).toBe(true);
  });
});
