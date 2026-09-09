/*
 * Multiverse Mages — a goal commitment survives a save, and hysteresis with it.
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
 * `mage-autonomy` requires a commitment minimum and a hysteresis margin, both of
 * which compare `worldTick` against the tick a goal was adopted on. Those are
 * arithmetic, and `autonomy-schedule.test.ts` already covers the arithmetic.
 *
 * What this file covers is the part that is not arithmetic: **the adoption tick
 * has to still be there next tick, and after a save.** Held in a JavaScript map
 * beside the state it would not be, and the failure would be silent — every mage
 * in a loaded game reads as `no-incumbent`, so every mage re-evaluates on the
 * tick after a load, and a run that was saved and resumed diverges from the same
 * run that was not.
 */

import { describe, expect, it } from 'vitest';

import type { SimState } from '@mm/sim-core';
import { createState, deserializeState, serializeState, snapshotHash } from '@mm/sim-core';
import { GOAL_COMMITMENT, MAGE, attachRecord, componentOf, defineWorldStateSchema } from '@mm/state';

import { GOAL, clearCommitment, hasCommitment, readCommitment, stepMageAutonomy, writeCommitment } from '../../src/index.js';
import type { MageGoalCommitment } from '../../src/index.js';

import { appealWeights, goalAppealWeights, outlook, richOutlook } from './autonomy-fixtures.js';
import { mageRow, stepRng } from './mage-fixtures.js';

const ROOT_SEED = 0x600d_5eed;
const CONTENT_REVISION = 'abcd1234abcd1234abcd1234abcd1234';

function worldWithMages(count: number): { state: SimState; mages: number[] } {
  const state = createState({
    rootSeed: ROOT_SEED,
    schema: defineWorldStateSchema(),
    contentRevision: CONTENT_REVISION,
  });
  const mages: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const handle = state.entities.create();
    attachRecord(state, MAGE, handle, mageRow({ birthTick: -600 }));
    mages.push(handle);
  }
  return { state, mages };
}

const commitment = (overrides: Partial<MageGoalCommitment> = {}): MageGoalCommitment => ({
  goalId: GOAL.scribe,
  targetNodeId: 51,
  adoptedTick: 40,
  score: 900,
  ...overrides,
});

describe('a commitment lives in state, not beside it', () => {
  it('is absent for a mage who has never chosen, which is not the same as idle', () => {
    const { state, mages } = worldWithMages(1);
    const mage = mages[0] as number;

    expect(hasCommitment(state, mage)).toBe(false);
    expect(readCommitment(state, mage)).toBeUndefined();

    writeCommitment(state, mage, commitment({ goalId: GOAL.idle, targetNodeId: 0 }));
    expect(hasCommitment(state, mage)).toBe(true);
    expect(readCommitment(state, mage)?.goalId).toBe(GOAL.idle);
  });

  it('costs a mage with no goal no data at all', () => {
    // The reason this is a component rather than four fields on the §1.2 mage
    // row: two mages exist, one has chosen, and the component carries one row.
    const { state, mages } = worldWithMages(2);
    writeCommitment(state, mages[0] as number, commitment());

    expect(componentOf(state, MAGE).size).toBe(2);
    expect(componentOf(state, GOAL_COMMITMENT).size).toBe(1);
  });

  it('round-trips through a snapshot byte-identically', () => {
    const { state, mages } = worldWithMages(3);
    writeCommitment(state, mages[0] as number, commitment());
    writeCommitment(state, mages[2] as number, commitment({ goalId: GOAL.teach, adoptedTick: 7 }));

    const bytes = serializeState(state);
    const restored = deserializeState(bytes, defineWorldStateSchema());

    expect(snapshotHash(restored)).toBe(snapshotHash(state));
    expect(Array.from(serializeState(restored))).toEqual(Array.from(bytes));

    // The values, not only the hash: a hash comparison alone would agree if
    // both sides had serialized nothing.
    expect(readCommitment(restored, mages[0] as number)).toEqual(commitment());
    expect(readCommitment(restored, mages[1] as number)).toBeUndefined();
    expect(readCommitment(restored, mages[2] as number)?.adoptedTick).toBe(7);
  });

  it('keeps the commitment clock across the save, so hysteresis still holds', () => {
    // The whole point. The mage adopted at tick 40; at tick 43 she is inside
    // `MIN_COMMITMENT_TICKS` and must hold. If the commitment had not survived
    // the save she would read as `no-incumbent` and re-decide immediately.
    const { state, mages } = worldWithMages(1);
    const mage = mages[0] as number;
    writeCommitment(state, mage, commitment({ adoptedTick: 40 }));

    const restored = deserializeState(serializeState(state), defineWorldStateSchema());
    const report = stepMageAutonomy({
      appeal: appealWeights,
      goalAppeal: goalAppealWeights,
      state: restored,
      worldTick: 43,
      rng: stepRng(ROOT_SEED, 43),
      outlookFor: () => richOutlook({ mage }),
    });

    const decision = report.decisions[0];
    expect(decision?.selection.reason).toBe('held');
    expect(decision?.selection.evaluated).toBe(false);
    expect(readCommitment(restored, mage)).toEqual(commitment({ adoptedTick: 40 }));
  });

  it('rejects a goal id from outside this build’s registry rather than scoring it', () => {
    const { state, mages } = worldWithMages(1);
    const mage = mages[0] as number;
    writeCommitment(state, mage, commitment());
    componentOf(state, GOAL_COMMITMENT).set(mage, 'goalId', 200);

    expect(() => readCommitment(state, mage)).toThrow(/permanent and append-only/);
  });

  it('clears on abandonment, returning the mage to having never chosen', () => {
    const { state, mages } = worldWithMages(1);
    const mage = mages[0] as number;
    writeCommitment(state, mage, commitment());

    clearCommitment(state, mage);
    expect(hasCommitment(state, mage)).toBe(false);
    // Idempotent: a mage who never had one is already in the state this leaves.
    expect(() => clearCommitment(state, mage)).not.toThrow();
  });
});

describe('one tick of autonomy over the whole roster', () => {
  it('persists a decision for every living mage and skips the dead', () => {
    const { state, mages } = worldWithMages(3);
    componentOf(state, MAGE).set(mages[1] as number, 'alive', 0);

    const report = stepMageAutonomy({
      appeal: appealWeights,
      goalAppeal: goalAppealWeights,
      state,
      worldTick: 12,
      rng: stepRng(ROOT_SEED, 12),
      outlookFor: (mage) => richOutlook({ mage }),
    });

    expect(report.considered).toBe(2);
    expect(hasCommitment(state, mages[0] as number)).toBe(true);
    expect(hasCommitment(state, mages[1] as number)).toBe(false);
    expect(hasCommitment(state, mages[2] as number)).toBe(true);
  });

  it('skips a mage the caller cannot describe, rather than inventing an outlook', () => {
    const { state, mages } = worldWithMages(2);
    const report = stepMageAutonomy({
      appeal: appealWeights,
      goalAppeal: goalAppealWeights,
      state,
      worldTick: 12,
      rng: stepRng(ROOT_SEED, 12),
      outlookFor: (mage) => (mage === mages[0] ? richOutlook({ mage }) : undefined),
    });

    expect(report.considered).toBe(1);
    expect(report.skipped).toBe(1);
    expect(hasCommitment(state, mages[1] as number)).toBe(false);
  });

  it('reaches the same state from the same inputs, twice', () => {
    const run = (): string => {
      const { state } = worldWithMages(6);
      for (let tick = 0; tick < 24; tick += 1) {
        stepMageAutonomy({
      appeal: appealWeights,
      goalAppeal: goalAppealWeights,
          state,
          worldTick: tick,
          rng: stepRng(ROOT_SEED, tick),
          outlookFor: (mage) => (mage % 2 === 0 ? richOutlook({ mage }) : outlook({ mage })),
        });
      }
      return snapshotHash(state);
    };

    expect(run()).toBe(run());
  });
});
