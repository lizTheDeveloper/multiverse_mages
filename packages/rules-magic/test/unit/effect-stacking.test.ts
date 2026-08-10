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
import { LOCATION_KIND } from '@mm/state';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EffectContribution, EffectSourceInstance } from '../../src/effects/index.js';
import {
  MASTERY_ACTIVATION_THRESHOLD,
  gatherEffects,
  stackContributions,
} from '../../src/effects/index.js';

import {
  countingCellOf,
  nodeDeclaring,
  permissiveRuleset,
  primitiveRecord,
  shippedRegistry,
  twoNodesDeclaring,
} from './fixtures.js';

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

function mindInstance(nodeId: number): EffectSourceInstance {
  return { nodeId, locationKind: LOCATION_KIND.mind, mastery: MASTERY_ACTIVATION_THRESHOLD };
}

function contribution(primitiveId: string, magnitude: Fixed): EffectContribution {
  return { nodeId: 1, primitiveId, magnitude, target: 'self', durationTicks: 0 };
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

    const gathered = gatherEffects(pair.map(mindInstance), {
      registry,
      ruleset: permissiveRuleset(),
      mode: TIME_MODE.world,
      cellOf: countingCellOf(registry),
    });
    calls.length = 0;
    const stacked = stackContributions(gathered, { registry });

    const magnitudes = gathered
      .filter((entry) => entry.primitiveId === 'research-rate')
      .map((entry) => entry.magnitude);
    expect(calls.find((call) => call.primitiveId === 'research-rate')?.magnitudes).toEqual(
      magnitudes,
    );
    expect(stacked.get('research-rate')?.value).toBe(
      stackMagnitudes(primitiveRecord(registry, 'research-rate'), magnitudes).value,
    );
  });
});
