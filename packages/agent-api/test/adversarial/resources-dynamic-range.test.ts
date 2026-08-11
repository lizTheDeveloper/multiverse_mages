/*
 * Multiverse Mages — adversarial: what the fixed-point channels can still tell apart.
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
 * # DEFECT 3 — every `bounded` channel is saturated for every realistic value
 *
 * Three tests here **fail on purpose**.
 *
 * ## (a) The behaviour believed to be incorrect
 *
 * `FP_SCALE` is elected for `favor`, `worship`, `materials`, `prestige` and an
 * objective's `valueFp`, and its saturation constant is `FP_ONE`, i.e. `1024`,
 * i.e. the fixed-point representation of the real number **1.0**. Every one of
 * those quantities is a resource accumulated over a run of hundreds of world
 * years: the unit fixture next door builds universes with `favor: 40 * FP`,
 * `materials: 500 * FP`, `favorCap: 100 * FP`. Divided by `1024` and clamped,
 * all of them export exactly `1.0`.
 *
 * Concretely, from `test/unit/fixtures.ts` as it ships, the resources block is
 *
 * - `firstUniverse()`  raw `[40960, 12288, 3, 512000, 2048]` → `[1, 1, 0.1875, 1, 1]`
 * - `secondUniverse()` raw `[5120, 1024, 0, 0, 0]`           → `[1, 1, 0, 0, 0]`
 *
 * A universe with 40.0 favor and one with 5.0 favor are the same number in the
 * favor channel. So are 500.0 materials and 1.0 materials. Four of the five
 * resource channels have collapsed to "zero, or at least one", which is a flag,
 * and `worshipTier` — the one channel with a `ratio` and a constant of 16 — is
 * the only one still carrying magnitude.
 *
 * ## (b) What says otherwise
 *
 * `docs/design/contracts.md` §4.1 gives the descriptors their purpose:
 *
 * > Each block declares its own normalization descriptor — a divisor and a clamp
 * > — **so that a quantity whose range later grows does not silently rescale an
 * > existing policy's inputs.**
 *
 * `src/layout.ts` on how a constant is chosen, in the same words this file uses
 * to say the resource constants were not:
 *
 * > Pinned count scales. Each answers "what integer maps to 1.0 in this channel",
 * > and each is **a round number comfortably above what a run is expected to
 * > reach** — a channel that saturates is far less damaging than one whose
 * > divisor moves.
 *
 * And `src/layout.ts` on `logBucketScale`, naming this exact failure mode as the
 * thing a descriptor must not produce:
 *
 * > For a quantity whose interesting range spans orders of magnitude, where a
 * > plain ratio spends the whole channel in the first percent — a universe of
 * > three thousand people against a cohort scale of a million reads `0.003`, and
 * > **a policy cannot tell that from `0.001`**.
 *
 * The resources block has the same disease with the sign flipped: it spends the
 * whole channel in the *last* value, and a policy cannot tell 5.0 favor from
 * 90.0 favor at all — not poorly, but not at all.
 *
 * ## (c) Why the asserted value is right, and what it does *not* assert
 *
 * These tests do **not** claim `bounded` divides by the wrong number. The
 * `agent-api` capability spec pins that arithmetic explicitly —
 *
 * > #### Scenario: Fixed-point unity maps to one
 * > - **WHEN** a slot whose rule is `bounded` holds the core value `1024`
 * > - **THEN** the exported element equals `1.0` exactly
 *
 * — and nothing below contradicts it. `bounded` means "over `fp(1.0)`" and is
 * correct for a channel whose quantity genuinely lives in `[0, 1]`: a mastery
 * fraction, a stability ratio. The defect is the **election** of that rule for
 * five channels whose quantities do not. §4.1 nowhere says the resources block
 * must be `bounded`; it says each block declares its own descriptor.
 *
 * The fix pattern is already in the file. `OBSERVATION_SCALE.sideFpTotal` is
 * `256 * FP_ONE`, and `SIDE_DESCRIPTORS` uses `ratioScale` over it precisely
 * because a summed `fp` pool exceeds 1.0 — so the same author, in the same
 * table, already treats "an `fp` quantity larger than unity" as a `ratio` with a
 * resource-sized constant. The resources block needs the same treatment
 * (`favorCap` is `100 * FP` in both shipped fixtures, so a constant of
 * `128 * FP_ONE` or `1024 * FP_ONE` would be the round number comfortably above
 * it that the file's own comment asks for).
 *
 * The assertions below are therefore stated as **distinguishability**, not as a
 * divisor: two universes whose favor differs eighteen-fold must not export the
 * same favor. That is satisfiable by any correct descriptor and unsatisfiable by
 * the shipped one, and it will not go stale the day somebody picks a different
 * constant.
 *
 * This is the most expensive defect in the group for the release it lands in.
 * 0.5.0 exists to make later balance claims falsifiable; §7's `capitalSnowball`,
 * `ascensionRate` and every Monte Carlo sweep read this vector, and a baseline
 * taken now records four resource channels that are constant `1.0` for every
 * universe that ever gets off the ground.
 */

import { FP_ONE } from '@mm/sim-core';
import {
  ENGAGEMENT_OBJECTIVE_CHANNELS,
  ENGAGEMENT_SIDE_CHANNELS,
  OBSERVATION_SIDE_CHANNELS,
  applyDescriptor,
  descriptorAt,
  normalizedObservation,
  observationBlock,
  rawObservation,
} from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

import {
  FIXTURE_CATALOGUE,
  FLUSH_RESOURCES,
  FP,
  LEAN_RESOURCES,
  universeHolding,
} from './worlds.js';

/** §4.1's resource channel order: favor, worship, worshipTier, materials, prestige. */
const RESOURCE_CHANNELS = ['favor', 'worship', 'worshipTier', 'materials', 'prestige'] as const;

function resourcesOf(exported: Float64Array): Record<string, number> {
  const block = observationBlock('resources');
  const out: Record<string, number> = {};
  for (const [index, name] of RESOURCE_CHANNELS.entries()) {
    out[name] = exported[block.offset + index] as number;
  }
  return out;
}

function exportedFor(resources: Parameters<typeof universeHolding>[0]): Record<string, number> {
  const state = universeHolding(resources);
  return resourcesOf(normalizedObservation(rawObservation({ state, catalogue: FIXTURE_CATALOGUE })));
}

describe('DEFECT 3 — the fixed-point resource channels carry no magnitude', () => {
  const lean = exportedFor(LEAN_RESOURCES);
  const flush = exportedFor(FLUSH_RESOURCES);

  it('HOLDS: the two universes really do differ, so the failures below are not vacuous', () => {
    // The control. Read the *raw* integers: the encoder sees the difference and
    // the difference is large. Whatever is lost is lost at the boundary.
    const rawLean = rawObservation({
      state: universeHolding(LEAN_RESOURCES),
      catalogue: FIXTURE_CATALOGUE,
    });
    const rawFlush = rawObservation({
      state: universeHolding(FLUSH_RESOURCES),
      catalogue: FIXTURE_CATALOGUE,
    });
    const block = observationBlock('resources');
    expect([...rawLean.slice(block.offset, block.offset + 5)]).toEqual([
      5 * FP,
      2 * FP,
      1,
      12 * FP,
      1 * FP,
    ]);
    expect([...rawFlush.slice(block.offset, block.offset + 5)]).toEqual([
      90 * FP,
      60 * FP,
      12,
      4_000 * FP,
      75 * FP,
    ]);
  });

  it('FAILS ON PURPOSE: 5.0 favor and 90.0 favor export the same number', () => {
    expect(flush['favor']).not.toBe(lean['favor']);
  });

  it('FAILS ON PURPOSE: 12.0 materials and 4000.0 materials export the same number', () => {
    expect(flush['materials']).not.toBe(lean['materials']);
    expect(flush['worship']).not.toBe(lean['worship']);
    expect(flush['prestige']).not.toBe(lean['prestige']);
  });

  it('FAILS ON PURPOSE: every fp resource channel is pinned at its ceiling in both universes', () => {
    // Stated positively so the reader can see the size of the collapse: four of
    // five channels read exactly 1.0 for a *lean* universe holding 5.0 favor and
    // 12.0 materials, which is a young universe, not a saturated one.
    const pinned = RESOURCE_CHANNELS.filter((name) => lean[name] === 1);
    expect(pinned).toEqual([]);
  });

  it('HOLDS: worshipTier, the one ratio channel here, still carries magnitude', () => {
    // The counter-example inside the same block: `ratioScale(16)` over a uint8
    // tier does exactly what the other four should. This is what makes the
    // defect an election of the wrong rule rather than a boundary that cannot
    // work.
    expect(lean['worshipTier']).toBeCloseTo(1 / 16, 12);
    expect(flush['worshipTier']).toBeCloseTo(12 / 16, 12);
    expect(flush['worshipTier']).not.toBe(lean['worshipTier']);
  });

  it("FAILS ON PURPOSE: an objective's valueFp channel has the same collapse", () => {
    // The same descriptor, elected again in the engagement block. The unit
    // fixture's own two objectives are worth 9.0 and 2.0; both export 1.0, so
    // the twelve objective slots rank by a value the agent cannot read.
    const engagement = observationBlock('engagement');
    const valueChannel = ENGAGEMENT_OBJECTIVE_CHANNELS.indexOf('valueFp');
    const descriptor = descriptorAt(
      engagement.offset + 2 * OBSERVATION_SIDE_CHANNELS + valueChannel,
    );
    // As shipped by the breaker these two lines read `expect(descriptor.rule)
    // .toBe('bounded')` and `expect(descriptor.divisor).toBe(FP_ONE)`, which
    // describe the defect and are not satisfiable alongside the assertion below:
    // the capability spec defines `bounded` as an fp value over `fp(1024)` with
    // the export clamped to [0, 1], so a `bounded` channel with a constant of
    // `FP_ONE` reads exactly 1.0 for both 9.0 and 2.0 *by definition*. The
    // distinguishability assertion is the one this file argues for, so it is the
    // one kept, and the descriptor check is restated in the rule-agnostic form
    // the file's own note asks for: whatever rule the channel elects, its
    // saturation constant has to be above fp unity.
    expect(descriptor.divisor).toBeGreaterThan(FP_ONE);

    expect(applyDescriptor(9 * FP, descriptor)).not.toBe(applyDescriptor(2 * FP, descriptor));
  });

  it('HOLDS: the side-total channels avoid the collapse, and show the fix pattern', () => {
    // `SIDE_DESCRIPTORS` uses `ratioScale(256 * FP_ONE)` for summed fp pools.
    // Two sides at 30.0 and 75.0 total hp are distinguishable, which is what
    // the resources block should look like.
    const engagement = observationBlock('engagement');
    const hpChannel = ENGAGEMENT_SIDE_CHANNELS.indexOf('hpTotal');
    const descriptor = descriptorAt(engagement.offset + hpChannel);
    expect(descriptor.rule).toBe('ratio');
    expect(descriptor.divisor).toBe(256 * FP_ONE);
  });
});
