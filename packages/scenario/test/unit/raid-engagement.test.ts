/*
 * Multiverse Mages — raids, in a real universe, end to end.
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
 * `rules-raid` shipped complete and unreached: 4,500 lines, its own conformance
 * scans, and zero callers outside its own tests. Everything asserted here is
 * about the **wiring** — that a real reference universe opens portals, resolves
 * raids, and carries the consequences into its own component rows — and not
 * about the engine, which has its own suite.
 *
 * Two of these are guards rather than features, and both exist because the
 * failure they catch is silent:
 *
 * - **A raid must cost zero world ticks.** `portals`' spec says so, and the way
 *   to get it wrong is to leave the clock in engagement mode: every world system
 *   returns early on `ctx.mode !== world`, so the run does not crash, it simply
 *   stops advancing until the harness's cap. That reads as a slow universe.
 * - **Raids off must be raids off.** The mechanic moves every balance baseline,
 *   so the A/B has to be real: `raids: false` must take no portal targets, roll
 *   no arrival, and leave the run exactly where the pre-raid build left it.
 */

import { describe, expect, it } from 'vitest';

import { rngFromRootSeed, snapshotHash, step } from '@mm/sim-core';
import { KNOWLEDGE_INSTANCE, collectRecords } from '@mm/state';
import { referenceContent, referenceScenario } from '@mm/scenario';
import type { SimState } from '@mm/sim-core';

/**
 * Long enough for the arrival process to fire, short enough to run in a gate.
 *
 * The authored inbound chance is `fp(0.0039)` a tick behind a sixty-tick
 * cooldown, so a horizon short enough to be quick is a horizon that measures
 * "no raid happened" and calls it a pass. Six hundred ticks is fifty world
 * years and reaches the first arrivals with room to spare; a century here cost
 * the suite three minutes for the same assertions.
 */
const HORIZON = 600;

/** Seeds these tests play. Three, so a pass is not one lucky arrival. */
const SEEDS: readonly number[] = Object.freeze([0x1234_5678, 0x0bad_c0de, 0x5eed_0001]);

const content = referenceContent();

interface Arm {
  readonly state: SimState;
  readonly raids: ReturnType<ReturnType<typeof referenceScenario>['raids']>;
  readonly instances: number;
}

function play(seed: number, raids: boolean, ticks = HORIZON): Arm {
  const run = referenceScenario(content, { raids });
  let state = run.scenario.create(seed, { worldTickCap: ticks });
  for (let tick = 0; tick < ticks; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
  }
  return {
    state,
    raids: run.raids(),
    instances: collectRecords(state, KNOWLEDGE_INSTANCE).length,
  };
}

describe('a reference universe is raided', () => {
  it('resolves raids over fifty world years, where the build before this one resolved none', () => {
    const played = play(0x1234_5678, true);
    expect(played.raids.length).toBeGreaterThan(0);
  });

  it('is the defender, and its raiders are derived from its own mages', () => {
    const played = play(0x1234_5678, true);
    // Nothing in this run submits action 14, so every raid is inbound. An
    // outbound raid here would mean the arrival process had picked a side.
    expect(played.raids.every((raid) => !raid.outbound)).toBe(true);
  });

  it('destroys knowledge instances that would otherwise have survived', () => {
    const seed = 0x0bad_c0de;
    expect(play(seed, true).instances).toBeLessThan(play(seed, false).instances);
  });
});

describe('the two properties raid-engagement is arranged around', () => {
  it('resolves every raid inside its own portal-stability bound', () => {
    for (const seed of SEEDS) {
      for (const raid of play(seed, true).raids) {
        expect(raid.engagementTicks).toBeLessThanOrEqual(raid.initialPortalStabilityTicks);
      }
    }
  });

  it('blocks no forbidden cast, because none is ever selected', () => {
    // The 0.7.0 zero-occurrence claim, measured rather than assumed. A non-zero
    // here is the selection mask having failed and the assertion having caught
    // it, which is a defect and not a balance result.
    for (const seed of SEEDS) {
      const total = play(seed, true).raids.reduce(
        (sum, raid) => sum + raid.forbiddenCastsBlocked,
        0,
      );
      expect(total).toBe(0);
    }
  });
});

describe('a raid consumes zero world ticks', () => {
  it('returns the clock to world time and advances the world exactly once a step', () => {
    const played = play(0x1234_5678, true);
    expect(played.raids.length).toBeGreaterThan(0);
    expect(played.state.clock.mode).toBe(0);
    expect(played.state.clock.engagementTick).toBe(0);
    // The failure this catches: a run that entered engagement and stayed there
    // would report a world tick well below the number of steps taken, with no
    // error anywhere.
    expect(played.state.clock.worldTick).toBe(HORIZON);
  });
});

describe('raids off is the build before this one', () => {
  it('offers no portal targets, so action 14 has no candidates', () => {
    expect(referenceScenario(content, { raids: false }).scenario.portalTargets).toBeUndefined();
  });

  it('resolves no raid and leaves the clock untouched', () => {
    const played = play(0x1234_5678, false);
    expect(played.raids).toEqual([]);
    expect(played.state.clock.worldTick).toBe(HORIZON);
  });

  it('produces a different universe from the same seed once a raid has landed', () => {
    // Not an equality assertion in either direction: the point is that the two
    // arms are genuinely different runs, so a sweep comparing them is comparing
    // something. If these hashes ever match, raids resolved and changed nothing.
    const seed = 0x5eed_0001;
    expect(snapshotHash(play(seed, true).state)).not.toEqual(
      snapshotHash(play(seed, false).state),
    );
  });
});

describe('a raid is reproducible from its seed', () => {
  it('produces byte-identical raid logs across two plays of one run', () => {
    const first = play(0x0bad_c0de, true);
    const second = play(0x0bad_c0de, true);
    expect(second.raids).toEqual(first.raids);
    expect(snapshotHash(second.state)).toEqual(snapshotHash(first.state));
  });
});
