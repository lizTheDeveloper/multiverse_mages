/*
 * Multiverse Mages — the census is a read, and here is the proof.
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
 * `@mm/agent-api`'s knowledge census reads `SimState` directly, which is a
 * licence that has to be paid for. The price is this file.
 *
 * W15 set the standard when it appended a probe system to the world schema:
 * *"a probed run and an unprobed run at the same coordinates must produce the
 * same `snapshotHash()` and the same terminal reason. If they differ, the probe
 * perturbs the run and every number below is void."* The census is a weaker
 * intervention than a probe system — it is not in the schema and does not run
 * inside `step` at all — so the same proof is cheaper here and there is no
 * excuse for not taking it.
 *
 * What it would catch, concretely. The census touches component stores, and a
 * `ComponentStore` read that lazily materialised a row, or a `collectRecords`
 * that sorted a backing array in place, would perturb nothing visible except
 * row order — which is exactly the perturbation `snapshotHash` sees and a
 * spot-check does not. It would then surface a year later as a replay
 * divergence in a golden fixture nobody could explain.
 *
 * Lives in `@mm/scenario` rather than in `@mm/agent-api` deliberately: the claim
 * worth proving is about a **real universe** over hundreds of ticks with mages
 * dying and books being written, not about a four-mage fixture. §5 makes this
 * package the composition root and a leaf, which is what lets the test see both
 * the census and a scenario at once.
 */

import { describe, expect, it } from 'vitest';

import { rngFromRootSeed, snapshotHash, step } from '@mm/sim-core';
import type { SimState } from '@mm/sim-core';
import { knowledgeCensus, mageContainment } from '@mm/agent-api';
import { referenceContent, referenceMasteryModel, referenceScenario } from '@mm/scenario';

/**
 * Long enough for mages to die, teach and scribe — so the census walks a state
 * whose rows have genuinely moved under swap-removal — and short enough to sit
 * in `verify` twice over.
 */
const TICKS = 240;
const SEED = 0x0009_0001;
const CONFIG = { worldTickCap: TICKS, options: { cohortSize: 4, foundingNodes: 4 } } as const;

const content = referenceContent();

/**
 * W26's marooning projection, wired to `rules-magic`'s own decay functions.
 *
 * Included in the interleaved arm on purpose: the extension walks the same
 * component stores, reads two more columns off them, and now reads the mage
 * store's `speciesId` as well. That is strictly more state touched than W22's
 * census touched, so the proof W22 paid for does not cover it and has to be
 * re-taken rather than inherited.
 */
const mastery = referenceMasteryModel(content.registry);

function play(censusEvery: number): { state: SimState; hash: string; census: number } {
  const run = referenceScenario(content);
  let state = run.scenario.create(SEED, CONFIG);
  let taken = 0;
  for (let tick = 0; tick < TICKS; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    if (censusEvery > 0 && tick % censusEvery === 0) {
      // Called for its side effects, of which there must be none. The
      // containment pass is included because it is the expensive one and the
      // one W20 and W21 will call, so it is the one worth proving inert.
      const census = knowledgeCensus(state, { mastery });
      mageContainment(census);
      taken += 1;
    }
  }
  return { state, hash: snapshotHash(state), census: taken };
}

describe('the knowledge census does not perturb the simulation', () => {
  const censused = play(4);
  const clean = play(0);

  it('takes a census that actually saw something', () => {
    // A vacuous proof — nothing censused, nothing perturbed — is the failure
    // mode this guards. The run must have had knowledge to count.
    expect(censused.census).toBeGreaterThan(0);
    expect(knowledgeCensus(censused.state).instanceTotal).toBeGreaterThan(0);
  });

  it('takes a marooning projection that actually saw held instances', () => {
    // The same guard, for the W26 half: a marooning block over zero held rows
    // would prove the extension inert by proving it never ran.
    const marooning = knowledgeCensus(censused.state, { mastery }).marooning;
    expect(marooning?.byInstance.length ?? 0).toBeGreaterThan(0);
    expect(marooning?.heldInstances ?? 0).toBeGreaterThan(0);
  });

  it('leaves the final snapshot hash byte-identical', () => {
    expect(censused.hash).toBe(clean.hash);
  });

  it('leaves the clock and the terminal reason identical', () => {
    expect(censused.state.clock.worldTick).toBe(clean.state.clock.worldTick);
    expect(censused.state.clock.mode).toBe(clean.state.clock.mode);
  });

  it('leaves the illegal-action counter identical', () => {
    // §4.2's counter is in the snapshot, so the hash covers it; asserted
    // separately because a hash mismatch would not say *which* field moved.
    expect(censused.state.illegalActionCount).toBe(clean.state.illegalActionCount);
  });

  it('is idempotent — two censuses of one state agree exactly', () => {
    const first = knowledgeCensus(clean.state, { mastery });
    const before = snapshotHash(clean.state);
    const second = knowledgeCensus(clean.state, { mastery });
    expect(second).toEqual(first);
    expect(snapshotHash(clean.state)).toBe(before);
  });

  it('agrees with a census taken on a state that was never censused', () => {
    // The strongest form of the claim: not merely that the hash matches, but
    // that the *numbers* match. A census that perturbed row order without
    // changing any value would pass a hash check on a state whose serialization
    // is order-independent, and fail here.
    expect(knowledgeCensus(censused.state)).toEqual(knowledgeCensus(clean.state));
    expect(knowledgeCensus(censused.state, { mastery })).toEqual(
      knowledgeCensus(clean.state, { mastery }),
    );
  });

  it('leaves the pre-W26 census byte-identical whether or not marooning was asked for', () => {
    // The opt-in claim, checked on a real universe rather than on a fixture: a
    // caller that does not want the projection must get exactly the census W22
    // shipped, and one that does must not get a *different* census alongside it.
    const plain = knowledgeCensus(clean.state);
    const extended = knowledgeCensus(clean.state, { mastery });
    expect(plain.marooning).toBeUndefined();
    expect({ ...extended, marooning: undefined }).toEqual({ ...plain, marooning: undefined });
  });
});
