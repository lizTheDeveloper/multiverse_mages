/*
 * Multiverse Mages — the sweep specification format, tasks 3.4 and 3.5.
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

import type { SweepSpec } from '@mm/mc-harness';
import {
  assignStrategies,
  describeSweep,
  expandSweep,
  sweepConfigurationHash,
  validateSweep,
} from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import { TOY_REGISTRIES, toySweep } from './fixtures.js';

/** Collects what a command wrote, so a test can read what a user would see. */
function sink(): { out: string[]; err: string[]; sink: { out(l: string): void; err(l: string): void } } {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, sink: { out: (l) => out.push(l), err: (l) => err.push(l) } };
}

describe('a sweep file is validated before any run starts', () => {
  it('accepts the fixture sweep', () => {
    expect(validateSweep(toySweep(), TOY_REGISTRIES)).toEqual([]);
  });

  it('names an unknown metric and refuses to expand', () => {
    const spec = toySweep({ metrics: ['toyTicks', 'knowledgeHalfLife'] });
    const problems = validateSweep(spec, TOY_REGISTRIES);
    expect(problems.some((problem) => problem.includes('knowledgeHalfLife'))).toBe(true);
    // Expansion is the step before dispatch, and it must not happen.
    expect(() => expandSweep(spec, TOY_REGISTRIES)).toThrow(/no run was dispatched/);
  });

  it('names a factor the scenario does not read, which would otherwise run silently', () => {
    // The one sweep-file typo that produces plausible numbers instead of an
    // error: every cell of the unread factor is a duplicate of its neighbour,
    // reported as a separate measurement.
    const spec = toySweep({
      factors: [
        { id: 'growth', levels: [0, 2] },
        { id: 'growthRate', levels: [1, 2] },
      ],
    });
    const problems = validateSweep(spec, TOY_REGISTRIES);
    expect(problems.some((problem) => problem.includes('growthRate'))).toBe(true);
    expect(() => expandSweep(spec, TOY_REGISTRIES)).toThrow(/no run was dispatched/);
  });

  it('names an unknown strategy', () => {
    const spec = toySweep({
      agentPool: { strategies: ['toy-passive', 'portal-rush'], assignment: 'round-robin', slots: 1 },
    });
    expect(validateSweep(spec, TOY_REGISTRIES).some((p) => p.includes('portal-rush'))).toBe(true);
  });

  it('rejects a factor with no levels, a duplicate factor, and a duplicate level', () => {
    expect(
      validateSweep(toySweep({ factors: [{ id: 'growth', levels: [] }] }), TOY_REGISTRIES).some((p) =>
        p.includes('at least one level'),
      ),
    ).toBe(true);
    expect(
      validateSweep(
        toySweep({
          factors: [
            { id: 'growth', levels: [1] },
            { id: 'growth', levels: [2] },
          ],
        }),
        TOY_REGISTRIES,
      ).some((p) => p.includes('declared twice')),
    ).toBe(true);
    expect(
      validateSweep(toySweep({ factors: [{ id: 'growth', levels: [1, 1] }] }), TOY_REGISTRIES).some(
        (p) => p.includes('same level twice'),
      ),
    ).toBe(true);
  });

  it('rejects every missing or malformed required field', () => {
    const cases: [Partial<SweepSpec>, RegExp][] = [
      [{ sweepId: '' }, /sweepId/],
      [{ rootSeed: -1 }, /rootSeed/],
      [{ replicates: 0 }, /replicates/],
      [{ termination: { worldTickCap: 0, perRunTimeoutMs: 10 } }, /worldTickCap/],
      [{ termination: { worldTickCap: 10, perRunTimeoutMs: 0 } }, /perRunTimeoutMs/],
      [{ kind: 'quick' as SweepSpec['kind'] }, /kind must be one of/],
      [{ failureThreshold: -1 }, /failureThreshold/],
      [{ ablation: { mode: 'none', primitives: ['portal'] } }, /ablation\.mode is "none"/],
      [{ ablation: { mode: 'one-sided', primitives: [] } }, /no primitive is named/],
      [
        { agentPool: { strategies: [], assignment: 'fixed', slots: 1 } },
        /at least one strategy/,
      ],
      [
        {
          agentPool: {
            strategies: ['toy-passive', 'toy-greedy'],
            assignment: 'mirrored',
            slots: 1,
          },
        },
        /slots must be 2/,
      ],
    ];
    for (const [override, pattern] of cases) {
      const problems = validateSweep(toySweep(override), TOY_REGISTRIES);
      expect(problems.some((problem) => pattern.test(problem)), `${JSON.stringify(override)}`).toBe(
        true,
      );
    }
  });

  it('reports every problem at once, not the first', () => {
    const problems = validateSweep(
      toySweep({ sweepId: '', rootSeed: -1, replicates: 0, metrics: ['nope'] }),
      TOY_REGISTRIES,
    );
    expect(problems.length).toBeGreaterThanOrEqual(4);
    // Sorted, so two runs of the validator produce the same message order.
    expect([...problems].sort()).toEqual(problems);
  });
});

describe('factorial expansion is explicit', () => {
  it('reports 40 cells and 1000 runs for 4 × 5 × 2 levels and 25 replicates', () => {
    // The capability spec's own numbers.
    const spec = toySweep({
      factors: [
        { id: 'a', levels: [1, 2, 3, 4] },
        { id: 'b', levels: [1, 2, 3, 4, 5] },
        { id: 'c', levels: [1, 2] },
      ],
      replicates: 25,
      // Fixed assignment, because 25 is odd and the toy pool holds two
      // strategies: since W18 a round-robin sweep must have a replicate count
      // that is a multiple of its pool size, and this test is about the
      // factorial expansion rather than about who plays. The capability spec's
      // 4 x 5 x 2 x 25 arithmetic is unchanged.
      agentPool: { strategies: ['toy-passive'], assignment: 'fixed', slots: 1 },
    });
    const plan = expandSweep(spec, TOY_REGISTRIES);
    expect(plan.cellCount).toBe(40);
    expect(plan.runCount).toBe(1000);
    expect(plan.cells).toHaveLength(40);
  });

  it('enumerates cells in a fixed, factor-id-sorted order with the last varying fastest', () => {
    const plan = expandSweep(
      toySweep({
        factors: [
          { id: 'zeta', levels: ['x', 'y'] },
          { id: 'alpha', levels: [1, 2, 3] },
        ],
      }),
      TOY_REGISTRIES,
    );
    expect(plan.cells.map((cell) => cell.levels)).toEqual([
      { alpha: 1, zeta: 'x' },
      { alpha: 1, zeta: 'y' },
      { alpha: 2, zeta: 'x' },
      { alpha: 2, zeta: 'y' },
      { alpha: 3, zeta: 'x' },
      { alpha: 3, zeta: 'y' },
    ]);
  });

  it('maps cellIndex to the same levels regardless of the order factors were written in', () => {
    // The footgun the sort removes: without it, moving two factor blocks past
    // each other in an editor re-points every seed at a different cell while
    // every test still passes.
    const written = expandSweep(
      toySweep({
        factors: [
          { id: 'alpha', levels: [1, 2] },
          { id: 'zeta', levels: ['x', 'y'] },
        ],
      }),
      TOY_REGISTRIES,
    );
    const reordered = expandSweep(
      toySweep({
        factors: [
          { id: 'zeta', levels: ['x', 'y'] },
          { id: 'alpha', levels: [1, 2] },
        ],
      }),
      TOY_REGISTRIES,
    );
    expect(reordered.cells).toEqual(written.cells);
  });

  it('every cell has a level for every factor, and every combination appears once', () => {
    const plan = expandSweep(toySweep(), TOY_REGISTRIES);
    const seen = new Set(plan.cells.map((cell) => JSON.stringify(cell.levels)));
    expect(seen.size).toBe(plan.cellCount);
    for (const cell of plan.cells) {
      expect(Object.keys(cell.levels).sort()).toEqual(['ascendAt', 'growth']);
    }
  });
});

describe('gate sweeps are distinguishable without executing them', () => {
  it('reports kind, cell count and run count from the file alone', () => {
    const collected = sink();
    expect(describeSweep(toySweep({ kind: 'gate' }), TOY_REGISTRIES, collected.sink)).toBe(0);
    expect(collected.out[0]).toContain('(gate)');
    expect(collected.out[0]).toContain('6 parameter cells');
    expect(collected.out[0]).toContain('24 runs');

    const full = sink();
    expect(describeSweep(toySweep({ kind: 'full' }), TOY_REGISTRIES, full.sink)).toBe(0);
    expect(full.out[0]).toContain('(full)');
  });

  it('exits non-zero and names the unknown metric before dispatching anything', () => {
    const collected = sink();
    const code = describeSweep(toySweep({ metrics: ['nope'] }), TOY_REGISTRIES, collected.sink);
    expect(code).toBe(1);
    expect(collected.err.join('\n')).toContain('nope');
    expect(collected.out).toEqual([]);
  });
});

describe('the configuration hash covers the whole specification', () => {
  it('changes when any field changes, including ones that do not change what runs', () => {
    const base = sweepConfigurationHash(toySweep());
    expect(sweepConfigurationHash(toySweep())).toBe(base);
    expect(sweepConfigurationHash(toySweep({ kind: 'full' }))).not.toBe(base);
    expect(sweepConfigurationHash(toySweep({ failureThreshold: 1 }))).not.toBe(base);
    expect(sweepConfigurationHash(toySweep({ rootSeed: 1 }))).not.toBe(base);
    expect(
      sweepConfigurationHash(toySweep({ factors: [{ id: 'growth', levels: [4, 2, 0] }] })),
    ).not.toBe(base);
  });
});

describe('strategy assignment is a pure function of the run coordinates', () => {
  it('gives every slot the first strategy under "fixed"', () => {
    const pool = { strategies: ['toy-passive', 'toy-greedy'], assignment: 'fixed' as const, slots: 3 };
    expect(assignStrategies(pool, 4, 9)).toEqual(['toy-passive', 'toy-passive', 'toy-passive']);
  });

  it('cycles by replicate under "round-robin", identically on every call', () => {
    const pool = {
      strategies: ['toy-passive', 'toy-greedy', 'toy-alternating'],
      assignment: 'round-robin' as const,
      slots: 2,
    };
    expect(assignStrategies(pool, 0, 0)).toEqual(['toy-passive', 'toy-greedy']);
    expect(assignStrategies(pool, 0, 1)).toEqual(['toy-greedy', 'toy-alternating']);
    expect(assignStrategies(pool, 0, 1)).toEqual(['toy-greedy', 'toy-alternating']);
  });

  it('plays every ordered pairing under "mirrored", so both slot assignments occur', () => {
    const pool = {
      strategies: ['toy-passive', 'toy-greedy'],
      assignment: 'mirrored' as const,
      slots: 2,
    };
    const played = new Set<string>();
    for (let replicateIndex = 0; replicateIndex < 4; replicateIndex += 1) {
      played.add(assignStrategies(pool, 0, replicateIndex).join(' vs '));
    }
    expect(played).toEqual(
      new Set(['toy-passive vs toy-greedy', 'toy-greedy vs toy-passive']),
    );
  });
});
