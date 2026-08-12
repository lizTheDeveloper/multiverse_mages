/*
 * Multiverse Mages — the ordering rule: arrival order is not an input.
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
 * The property these tests exist for is one sentence from
 * `docs/design/release-plan.md`: *"across 1,000 automated matches, both clients
 * produce identical final snapshot hashes."* Two processes can only do that if
 * they apply the same actions in the same order, so ordering must be a function
 * of what is in the protocol and of nothing else.
 */

import { describe, expect, it } from 'vitest';

import {
  ENTRY_SOURCE,
  REJECTION,
  TickAssembly,
  canonicalBatch,
  type Submission,
} from '../../src/index.js';

const act = (kind: number): { kind: number } => ({ kind });

const submission = (slot: number, sequence: number, kind: number): Submission => ({
  slot,
  tick: 0,
  sequence,
  action: act(kind),
});

/**
 * A deterministic shuffle, so a failure reproduces.
 *
 * `Math.random` would make this test's counterexample unrecoverable — the one
 * run that caught a real ordering bug would be the one run nobody could repeat.
 */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let state = seed >>> 0;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const j = state % (i + 1);
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

describe('the canonical batch does not depend on arrival order', () => {
  it('produces an identical batch for every permutation of the same submissions', () => {
    const submissions = [
      submission(2, 11, 5),
      submission(0, 3, 1),
      submission(1, 7, 9),
      submission(3, 2, 4),
    ];
    const reference = canonicalBatch(0, 4, submissions).batch;

    for (let seed = 1; seed <= 50; seed += 1) {
      const permuted = canonicalBatch(0, 4, shuffled(submissions, seed)).batch;
      expect(permuted).toEqual(reference);
    }
  });

  it('orders entries by slot, ascending, whatever order they arrived in', () => {
    const { batch } = canonicalBatch(0, 4, [
      submission(3, 1, 4),
      submission(1, 1, 2),
      submission(0, 1, 1),
      submission(2, 1, 3),
    ]);
    expect(batch.entries.map((e) => e.slot)).toEqual([0, 1, 2, 3]);
    expect(batch.entries.map((e) => e.action.kind)).toEqual([1, 2, 3, 4]);
  });

  it('takes the lowest sequence when a slot submits twice, in either arrival order', () => {
    const first = canonicalBatch(0, 1, [submission(0, 9, 7), submission(0, 4, 3)]);
    const second = canonicalBatch(0, 1, [submission(0, 4, 3), submission(0, 9, 7)]);

    expect(first.batch.entries[0]?.action.kind).toBe(3);
    expect(first.batch).toEqual(second.batch);
    expect(first.rejected.map((r) => r.reason)).toEqual([REJECTION.duplicate]);
  });
});

describe('a missing action has a defined, deterministic meaning', () => {
  it('substitutes a no-op for a slot that submitted nothing, and flags it', () => {
    const { batch } = canonicalBatch(0, 3, [submission(0, 1, 5), submission(2, 1, 6)]);

    expect(batch.entries).toHaveLength(3);
    const silent = batch.entries[1];
    expect(silent?.slot).toBe(1);
    expect(silent?.action.kind).toBe(0);
    expect(silent?.source).toBe(ENTRY_SOURCE.substituted);
    expect(silent?.rejection).toBeUndefined();
  });

  it('distinguishes "nothing arrived" from "what arrived was refused"', () => {
    const silent = canonicalBatch(0, 2, []);
    expect(silent.batch.entries[0]?.rejection).toBeUndefined();

    const refused = new TickAssembly(0, 2);
    refused.refuse(0, 4, REJECTION.rulesetFrozen);
    const closed = refused.close();
    expect(closed.batch.entries[0]?.source).toBe(ENTRY_SOURCE.substituted);
    expect(closed.batch.entries[0]?.rejection).toBe(REJECTION.rulesetFrozen);
    // The other slot is silent, not refused, and says so.
    expect(closed.batch.entries[1]?.rejection).toBeUndefined();
  });

  it('gives every slot an entry even when nobody submitted anything', () => {
    const { batch } = canonicalBatch(4, 2, []);
    expect(batch.tick).toBe(4);
    expect(batch.entries.map((e) => e.source)).toEqual([
      ENTRY_SOURCE.substituted,
      ENTRY_SOURCE.substituted,
    ]);
    expect(batch.entries.every((e) => e.action.kind === 0)).toBe(true);
  });
});

describe('a submission for the wrong tick is late, not applied', () => {
  it('never lets a submission for another tick into this tick', () => {
    const { batch, rejected } = canonicalBatch(5, 1, [
      { slot: 0, tick: 4, sequence: 1, action: act(9) },
    ]);
    expect(batch.entries[0]?.action.kind).toBe(0);
    expect(rejected[0]?.reason).toBe(REJECTION.late);
  });
});
