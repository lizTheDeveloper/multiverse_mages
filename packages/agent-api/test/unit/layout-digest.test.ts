/*
 * Multiverse Mages — the observation layout digest and its schema version.
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
 * `agent-interface` tasks 1.6 and 1.8, and the `agent-api` spec's *"Observation
 * layout digest and schema version"* requirement.
 *
 * The requirement the digest exists to serve is stated in `design.md`:
 *
 * > *Alternative considered:* comparing only the vector length. Rejected — the
 * > shape is fixed by `core-contracts` and will rarely change length, while a
 * > saturation constant or a block reordering changes meaning without changing
 * > length. Length equality is exactly the check that would pass while being
 * > wrong.
 *
 * So the tests below are mostly about **what changes the digest**, and every one
 * of them holds the vector length fixed. A digest that only tracked length would
 * pass none of them.
 */

import type { ObservationSlot } from '@mm/agent-api';
import {
  OBSERVATION_BLOCK_NAMES,
  OBSERVATION_DESCRIPTORS,
  OBSERVATION_LAYOUT_DIGEST,
  OBSERVATION_SCHEMA_VERSION,
  OBSERVATION_SIZE,
  OBSERVATION_SLOTS,
  layoutDigest,
  logBucketScale,
  normalizedObservation,
  observationBlock,
  ratioScale,
} from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

/**
 * The digest of the 0.5.0 observation layout.
 *
 * Written as a literal rather than derived. Deriving it would make the test
 * agree with whatever the table happens to say, which is the one thing a digest
 * must not do. If this fails, the observation's meaning changed: update the
 * literal *and* say in the commit what moved, because every baseline recorded
 * under the old digest is now incomparable rather than merely stale.
 */
const EXPECTED_DIGEST = 'ae4ffd5a251d9ba2';

/** A deep, structurally independent copy of the shipped table. */
function copyOfTable(): ObservationSlot[] {
  return OBSERVATION_SLOTS.map((slot) => ({
    index: slot.index,
    block: slot.block,
    blockIndex: slot.blockIndex,
    descriptor: Object.freeze({ ...slot.descriptor }),
  }));
}

describe('task 1.6 — the slot table the digest is taken over', () => {
  it('carries one entry per channel, in vector order', () => {
    expect(OBSERVATION_SLOTS).toHaveLength(OBSERVATION_SIZE);
    for (const [index, slot] of OBSERVATION_SLOTS.entries()) {
      expect(slot.index).toBe(index);
      expect(slot.descriptor).toBe(OBSERVATION_DESCRIPTORS[index]);
    }
  });

  it('names the block each slot belongs to and its position within it', () => {
    for (const name of OBSERVATION_BLOCK_NAMES) {
      const block = observationBlock(name);
      for (let offset = 0; offset < block.size; offset += 1) {
        const slot = OBSERVATION_SLOTS[block.offset + offset] as ObservationSlot;
        expect(slot.block).toBe(name);
        expect(slot.blockIndex).toBe(offset);
      }
    }
  });

  it('publishes a schema version that is a positive integer', () => {
    expect(Number.isSafeInteger(OBSERVATION_SCHEMA_VERSION)).toBe(true);
    expect(OBSERVATION_SCHEMA_VERSION).toBeGreaterThan(0);
  });
});

describe('the digest is stable across identical builds', () => {
  it('is 16 lowercase hex characters, the shape sim-core pins for a content hash', () => {
    expect(OBSERVATION_LAYOUT_DIGEST).toMatch(/^[0-9a-f]{16}$/);
  });

  it('recomputes to the same value from a structurally independent copy', () => {
    // Two separate processes computing the digest from the same build is the
    // scenario; the mechanism that makes it true is that `layoutDigest` reads
    // only the table's values, never object identity and never module state.
    // Feeding it a fresh deep copy is that property, stated as a test.
    expect(layoutDigest(copyOfTable())).toBe(OBSERVATION_LAYOUT_DIGEST);
    expect(layoutDigest(OBSERVATION_SLOTS)).toBe(OBSERVATION_LAYOUT_DIGEST);
  });

  it('equals the value pinned here, so a layout change cannot land silently', () => {
    // The literal is the cross-process check that a subprocess spawn only
    // approximates: a second implementation, in another language, computing the
    // published encoding over the published table must land on this string. If
    // this fails, the observation's meaning changed — regenerate the literal
    // *and* say in the commit what moved, because every baseline recorded under
    // the old digest is now incomparable.
    expect(OBSERVATION_LAYOUT_DIGEST).toBe(EXPECTED_DIGEST);
  });

  it('does not drift after the exporter has been used heavily', () => {
    // Module-level mutable state is what would break "identical across two
    // processes", and it would break it only for the process that did the work.
    const before = layoutDigest(OBSERVATION_SLOTS);
    for (let run = 0; run < 500; run += 1) {
      const raw = new Int32Array(OBSERVATION_SIZE);
      raw.fill(run * 4096);
      normalizedObservation(raw);
    }
    expect(layoutDigest(OBSERVATION_SLOTS)).toBe(before);
    expect(OBSERVATION_LAYOUT_DIGEST).toBe(before);
  });
});

describe('task 1.8 — what changes the digest, at unchanged vector length', () => {
  const digestOf = (mutate: (slots: ObservationSlot[]) => void): string => {
    const slots = copyOfTable();
    mutate(slots);
    expect(slots).toHaveLength(OBSERVATION_SIZE);
    return layoutDigest(slots);
  };

  it('changes when one saturation constant is altered', () => {
    const altered = digestOf((slots) => {
      const population = observationBlock('population');
      slots[population.offset] = {
        ...(slots[population.offset] as ObservationSlot),
        descriptor: ratioScale(999_999),
      };
    });
    expect(altered).not.toBe(OBSERVATION_LAYOUT_DIGEST);
    expect(altered).toMatch(/^[0-9a-f]{16}$/);
  });

  it('changes when one slot swaps to a different rule at the same constant', () => {
    const altered = digestOf((slots) => {
      const clock = observationBlock('clock');
      const slot = slots[clock.offset + 2] as ObservationSlot;
      expect(slot.descriptor.rule).toBe('flag');
      slots[clock.offset + 2] = { ...slot, descriptor: ratioScale(1) };
    });
    // `flag` and `ratio` at a constant of 1 export the same number for every
    // integer input, which is exactly why the digest has to cover the rule and
    // not only the arithmetic.
    expect(altered).not.toBe(OBSERVATION_LAYOUT_DIGEST);
  });

  it('changes when two blocks trade places without changing the total', () => {
    const altered = digestOf((slots) => {
      const institutions = observationBlock('institutions');
      const clock = observationBlock('clock');
      expect(institutions.size).toBe(4);
      expect(clock.size).toBe(3);
      // Relabel one channel of each as the other's block. The vector is the same
      // length and the descriptors are untouched; only the meaning moved.
      slots[institutions.offset] = {
        ...(slots[institutions.offset] as ObservationSlot),
        block: 'clock',
      };
      slots[clock.offset] = {
        ...(slots[clock.offset] as ObservationSlot),
        block: 'institutions',
      };
    });
    expect(altered).not.toBe(OBSERVATION_LAYOUT_DIGEST);
  });

  it('changes when a log-bucket edge list changes under an unchanged constant', () => {
    const coarse = logBucketScale([1, 16, 256]);
    const fine = logBucketScale([1, 4, 16, 64, 256]);
    expect(coarse.divisor).toBe(fine.divisor);

    const a = digestOf((slots) => {
      slots[0] = { ...(slots[0] as ObservationSlot), descriptor: coarse };
    });
    const b = digestOf((slots) => {
      slots[0] = { ...(slots[0] as ObservationSlot), descriptor: fine };
    });
    expect(a).not.toBe(b);
    expect(a).not.toBe(OBSERVATION_LAYOUT_DIGEST);
  });

  it('does not change when nothing about the table changes', () => {
    expect(digestOf(() => undefined)).toBe(OBSERVATION_LAYOUT_DIGEST);
  });
});
