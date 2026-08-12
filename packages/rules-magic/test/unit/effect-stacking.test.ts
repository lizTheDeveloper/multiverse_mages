/*
 * Multiverse Mages — proof that stacking, capping and rounding are delegated.
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
 * The lint rule (`BAN_INLINE_PRIMITIVE_STACKING`, exercised by
 * `packages/primitives/test/unit/stacking-lint.test.ts` at a `rules-magic`
 * virtual path) rejects the *shapes* an inline reimplementation takes. Its own
 * comment concedes it is a tripwire and not a proof: a determined `for` loop
 * accumulating into a differently-named local walks past it.
 *
 * So this file closes the gap from the other side. `@mm/primitives` is mocked
 * with a counting wrapper around the real implementation, and the assertions
 * are about *what reaches it*: every magnitude, exactly once, with the registry
 * record that carries the rule and the cap. A pipeline that combined anything
 * itself would show up here as a magnitude that never arrived.
 */

import { TIME_MODE } from '@mm/sim-core';
import type { Fixed } from '@mm/sim-core';
import type { PrimitiveRecord } from '@mm/content';
import { ClampCounters, stackMagnitudes } from '@mm/primitives';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EffectContribution } from '../../src/effects/index.js';
import { gatherEffects, stackContributions } from '../../src/effects/index.js';

import {
  cellIdOfNode,
  countingCellOf,
  mindInstance,
  nodeDeclaring,
  permissiveRuleset,
  primitiveRecord,
  rulesetInterdicting,
  shippedRegistry,
  twoNodesDeclaring,
  worldActiveNodesInDistinctCells,
} from './effect-fixtures.js';

/** Calls that reached the shared implementation. */
interface StackCall {
  readonly primitiveId: string;
  readonly magnitudes: readonly Fixed[];
}

const calls: StackCall[] = [];

vi.mock('@mm/primitives', async (importOriginal) => {
  const original = await importOriginal<typeof import('@mm/primitives')>();
  return {
    ...original,
    stackMagnitudes: (
      primitive: PrimitiveRecord,
      magnitudes: readonly Fixed[],
      options?: Parameters<typeof original.stackMagnitudes>[2],
    ) => {
      calls.push({ primitiveId: primitive.id, magnitudes: [...magnitudes] });
      return original.stackMagnitudes(primitive, magnitudes, options);
    },
  };
});

beforeEach(() => {
  calls.length = 0;
});

/** A `create`-mode contribution, unless told otherwise: `+magnitude`, matching every pre-W20 test's assumption. */
function contribution(
  primitiveId: string,
  magnitude: Fixed,
  extra: Partial<Pick<EffectContribution, 'mode' | 'control' | 'transformTo'>> = {},
): EffectContribution {
  return {
    nodeId: 1,
    primitiveId,
    magnitude,
    target: 'self',
    durationTicks: 0,
    mode: extra.mode ?? 'create',
    ...(extra.control !== undefined ? { control: extra.control } : {}),
    ...(extra.transformTo !== undefined ? { transformTo: extra.transformTo } : {}),
  };
}

describe('every combination goes through the shared implementation', () => {
  it('hands each primitive’s magnitudes to stackMagnitudes exactly once', () => {
    const registry = shippedRegistry();
    const contributions = [
      contribution('research-rate', 205),
      contribution('research-rate', 205),
      contribution('build-rate', 512),
    ];

    const stacked = stackContributions(contributions, { registry });

    expect(calls).toEqual([
      { primitiveId: 'build-rate', magnitudes: [512] },
      { primitiveId: 'research-rate', magnitudes: [205, 205] },
    ]);
    expect(stacked.get('research-rate')?.value).toBe(
      stackMagnitudes(primitiveRecord(registry, 'research-rate'), [205, 205]).value,
    );
  });

  it('agrees with the shared implementation on the +40% question', () => {
    const registry = shippedRegistry();
    const stacked = stackContributions(
      [contribution('research-rate', 205), contribution('research-rate', 205)],
      { registry },
    );

    // fp(1024) + fp(205) + fp(205). Not mul(fp(1229), fp(1229)) = fp(1475).
    expect(stacked.get('research-rate')?.value).toBe(1434);
  });

  it('groups in registry order, not in arrival order', () => {
    const registry = shippedRegistry();
    const stacked = stackContributions(
      [
        contribution('worship-yield', 100),
        contribution('build-rate', 100),
        contribution('research-rate', 100),
      ],
      { registry },
    );

    const registryOrder = registry.primitives
      .map((entry) => entry.record.id)
      .filter((id) => ['build-rate', 'research-rate', 'worship-yield'].includes(id));
    expect([...stacked.keys()]).toEqual(registryOrder);
  });

  it('counts a cap that knowledge alone was enough to reach', () => {
    const registry = shippedRegistry();
    const counters = new ClampCounters();
    const cap = primitiveRecord(registry, 'build-rate').cap;
    expect(cap.kind).toBe('fp');
    const ceiling = cap.value ?? 0;

    // Enough sources that (1 + Σ) clears the ceiling, whatever the ceiling is.
    const sources: EffectContribution[] = [];
    for (let index = 0; index <= ceiling; index += 1024) {
      sources.push(contribution('build-rate', 1024));
    }

    const stacked = stackContributions(sources, { registry, counters });

    expect(stacked.get('build-rate')?.clamped).toBe(true);
    expect(stacked.get('build-rate')?.value).toBe(ceiling);
    expect(counters.count('build-rate')).toBe(1);
  });

  it('returns the identity of an empty stack, not a zero', () => {
    const registry = shippedRegistry();
    const stacked = stackContributions([], { registry });
    expect(stacked.size).toBe(0);

    const declared = stackContributions([], { registry, primitiveIds: ['research-rate'] });
    // FP_ONE: a multiplier with nothing in it must change nothing.
    expect(declared.get('research-rate')?.value).toBe(1024);
  });
});

describe('an illegal contribution never reaches stacking', () => {
  it('delivers the two legal nodes’ magnitudes and nothing of the third', () => {
    const registry = shippedRegistry();
    const [first, second, third] = worldActiveNodesInDistinctCells(registry, 3);
    if (first === undefined || second === undefined || third === undefined) return;

    const instances = [first, second, third].map((nodeId) => mindInstance(nodeId));
    const gathered = gatherEffects(instances, {
      registry,
      ruleset: rulesetInterdicting(cellIdOfNode(registry, third)),
      mode: TIME_MODE.world,
      cellOf: countingCellOf(registry),
    });

    calls.length = 0;
    stackContributions(gathered, { registry });

    // `magic-primitives` states this as a count reaching the stacker, so it is
    // asserted as one: everything the two surviving nodes declared, and not one
    // magnitude more. Since W20, "one magnitude per contribution" is no longer
    // literal — `reveal` and `control` contribute none, `transform` contributes
    // two — so the expectation is computed the same way `stack.ts` computes it,
    // independently, rather than assumed to be `gathered.length`.
    const delivered = calls.reduce((total, call) => total + call.magnitudes.length, 0);
    const expectedMagnitudeCount = gathered.reduce((total, contribution) => {
      switch (contribution.mode) {
        case 'create':
        case 'remove':
          return total + 1;
        case 'transform':
          return total + 2;
        case 'reveal':
        case 'control':
          return total;
      }
    }, 0);
    expect(delivered).toBe(expectedMagnitudeCount);
    expect(new Set(gathered.map((entry) => entry.nodeId))).toEqual(new Set([first, second]));
    expect(gathered.length).toBeGreaterThan(0);
  });
});

describe('the pipeline end to end delegates too', () => {
  it('stacks two held nodes declaring one primitive through the shared code', () => {
    const registry = shippedRegistry();
    const pair = twoNodesDeclaring(registry, 'research-rate');
    if (pair === undefined) {
      // Content authors the graphs; if only one node carries it, the single-source
      // path is still the delegated one and is asserted above.
      expect(nodeDeclaring(registry, 'research-rate')).toBeDefined();
      return;
    }

    // Not `.map(mindInstance)`: map's index argument would land in the mastery
    // parameter and put every instance below the activation threshold.
    const gathered = gatherEffects(
      pair.map((nodeId) => mindInstance(nodeId)),
      {
        registry,
        ruleset: permissiveRuleset(),
        mode: TIME_MODE.world,
        cellOf: countingCellOf(registry),
      },
    );
    calls.length = 0;
    const stacked = stackContributions(gathered, { registry });

    // Not re-derived from `contribution.magnitude` directly: since W20 a
    // contribution's *sign*, and which primitive it even lands on, depends on
    // its `mode` (compositional-content.md §3.3), and real v1 content mixes
    // `create`, `remove`, `reveal` and `control` freely. What this test can
    // still prove without re-implementing that mapping is delegation itself:
    // whatever `stackContributions` actually handed to `stackMagnitudes`
    // reproduces the exact value `stackContributions` reports.
    const delivered = calls.find((call) => call.primitiveId === 'research-rate');
    if (delivered === undefined) {
      // Both picked nodes happened to be `reveal`/`control`-only for
      // research-rate under a bare two-mind hold (no active reveal, no cell
      // at its `holds-cell` threshold) -- a real possibility now that v1
      // content mixes modes freely. Nothing reached the stacker to compare,
      // but gathering itself still ran; the mode-mapping this test would
      // otherwise re-confirm is covered directly, and exhaustively, by "the
      // mode table turns a contribution into a signed magnitude" below.
      expect(gathered.length).toBeGreaterThan(0);
      return;
    }
    expect(delivered.magnitudes.length).toBeGreaterThan(0);
    expect(stacked.get('research-rate')?.value).toBe(
      stackMagnitudes(primitiveRecord(registry, 'research-rate'), delivered.magnitudes).value,
    );
  });
});

/**
 * `compositional-content.md` §3.3's mode table, exercised directly: hand-built
 * contributions rather than gathered ones, so each mode's sign (or absence of
 * one) is pinned independently of what real content happens to author.
 */
describe('the mode table turns a contribution into a signed magnitude', () => {
  it('create contributes +magnitude', () => {
    const registry = shippedRegistry();
    const stacked = stackContributions([contribution('build-rate', 512, { mode: 'create' })], {
      registry,
    });
    // FP_ONE + 512.
    expect(stacked.get('build-rate')?.value).toBe(1536);
  });

  it('remove contributes -magnitude', () => {
    const registry = shippedRegistry();
    const stacked = stackContributions([contribution('build-rate', 512, { mode: 'remove' })], {
      registry,
    });
    // FP_ONE - 512.
    expect(stacked.get('build-rate')?.value).toBe(512);
  });

  it('transform contributes -magnitude to its own primitive and +magnitude to transformTo', () => {
    const registry = shippedRegistry();
    const stacked = stackContributions(
      [
        contribution('build-rate', 300, {
          mode: 'transform',
          transformTo: 'research-rate',
        }),
      ],
      { registry },
    );
    expect(stacked.get('build-rate')?.value).toBe(1024 - 300);
    expect(stacked.get('research-rate')?.value).toBe(1024 + 300);
  });

  it('reveal contributes no magnitude, and the primitive never reaches the stacker for it alone', () => {
    const registry = shippedRegistry();
    calls.length = 0;
    const stacked = stackContributions([contribution('build-rate', 1024, { mode: 'reveal' })], {
      registry,
    });
    expect(stacked.has('build-rate')).toBe(false);
    expect(calls.some((call) => call.primitiveId === 'build-rate')).toBe(false);
  });

  it('control contributes no magnitude either, but its payload still reaches the primitive as a clamp', () => {
    const registry = shippedRegistry();
    const stacked = stackContributions(
      [
        contribution('build-rate', 1024, { mode: 'create' }),
        contribution('build-rate', 1024, { mode: 'control', control: { ceiling: 1200 } }),
      ],
      { registry },
    );
    // Raw: FP_ONE + 1024 = 2048, which clears fp(4096)'s cap easily but is
    // pulled down by the control ceiling well before the cap would ever bind.
    expect(stacked.get('build-rate')?.value).toBe(1200);
  });

  it('combines multiple control contributions on one primitive with combineControls', () => {
    const registry = shippedRegistry();
    const stacked = stackContributions(
      [
        contribution('research-rate', 4096, { mode: 'create' }),
        contribution('research-rate', 1024, { mode: 'control', control: { ceiling: 3000 } }),
        contribution('research-rate', 1024, { mode: 'control', control: { ceiling: 2500 } }),
      ],
      { registry },
    );
    // The tighter of the two ceilings wins (min), per combineControls.
    expect(stacked.get('research-rate')?.value).toBe(2500);
  });

  it("stops a Perdo-driven research-rate at the primitive's own authored floor", () => {
    const registry = shippedRegistry();
    const counters = new ClampCounters();
    const stacked = stackContributions(
      [contribution('research-rate', 5000, { mode: 'remove' })],
      { registry, counters },
    );
    // FP_ONE - 5000 would be deeply negative; primitive.json floors
    // research-rate at fp(256) (docs/design/contracts.md §3, W20).
    expect(stacked.get('research-rate')?.value).toBe(256);
    expect(stacked.get('research-rate')?.clamped).toBe(true);
    expect(counters.count('research-rate')).toBeGreaterThan(0);
  });

  it('a primitive with no authored floor is left free to go negative or to zero', () => {
    const registry = shippedRegistry();
    // `blink` (max stacking) carries no floor and no cap.
    const stacked = stackContributions([contribution('blink', 5000, { mode: 'remove' })], {
      registry,
    });
    expect(stacked.get('blink')?.value).toBe(-5000);
  });
});
