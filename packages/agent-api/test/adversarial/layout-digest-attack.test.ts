/*
 * Multiverse Mages — adversarial: attacking the observation layout digest.
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
 * The digest promises that *"any change to block order, slot count, a
 * normalization rule, or a saturation constant MUST change the digest"*, and
 * `src/digest.ts` states one deliberate gap — the encoder — and no others. This
 * file attacks it along seven axes. **Six held.** One did not, and that one is
 * DEFECT 4 below.
 *
 * The axes attacked, with results, so a reader can see what was tried:
 *
 * 1. Alter a saturation constant at unchanged length — **held** (digest moves).
 * 2. Swap a rule for another with identical arithmetic — **held**.
 * 3. Relabel a slot into a neighbouring block — **held**.
 * 4. Change a `log-bucket` edge list under an unchanged top edge — **held**.
 * 5. Permute two same-descriptor slots inside one block — **held**, because the
 *    digest covers `blockIndex` and the permutation moves it.
 * 6. Move a slot's `blockIndex` to a value inconsistent with its block offset —
 *    **held** in the sense the digest moves; see the note in the last `describe`
 *    for the validation gap that does *not* hold.
 * 7. Two tables that both pass `layoutProblems` with zero problems, export
 *    different values, and share a digest — **BROKEN**, see DEFECT 4.
 *
 * # DEFECT 4 — `min: -0` validates, exports `-0`, and collides with `min: 0`
 *
 * ## (a) The behaviour believed to be incorrect
 *
 * `layoutProblems` checks the clamp with `descriptor.min !== 0 || descriptor.max
 * !== 1`. In IEEE-754, `-0 !== 0` is `false`, so a descriptor whose floor is
 * negative zero passes validation. `layoutEncoding` writes the floor as
 * `String(descriptor.min)`, and `String(-0)` is `"0"`, so it also produces a
 * digest identical to the `+0` table's. But `clamp` returns `descriptor.min` by
 * identity, so the exported channel is `-0` and not `0`.
 *
 * Two descriptor tables therefore exist that
 *
 * - both return `[]` from `layoutProblems`,
 * - both hash to `OBSERVATION_LAYOUT_DIGEST`,
 * - and export different `Float64Array` contents.
 *
 * ## (b) What says otherwise
 *
 * The `agent-api` capability spec, on the exported dtype:
 *
 * > #### Scenario: Exported values are bounded floats
 * > - **WHEN** an observation is exported from any universe at any tick
 * > - **THEN** every element is a finite double in `[0, 1]`, with no `NaN` and
 * >   **no negative zero**
 *
 * `design.md`, on why the digest exists at all:
 *
 * > *Alternative considered:* comparing only the vector length. Rejected — […] a
 * > saturation constant or a block reordering changes meaning without changing
 * > length. **Length equality is exactly the check that would pass while being
 * > wrong.**
 *
 * `src/digest.ts` enumerating what the digest does not cover — a list of three
 * items, none of which is this:
 *
 * > - **{@link OBSERVATION_SCHEMA_VERSION}.** […]
 * > - **The encoder.** […] That is a real gap and it is stated rather than
 * >   papered over: the digest certifies the *layout* […]
 * > - **The action space.** […]
 *
 * ## (c) Why the asserted value is right
 *
 * The spec names negative zero as a thing the export must not contain, so the
 * difference between the two tables is a difference the contract cares about —
 * it is not a formatting nicety. A digest whose stated job is to refuse a
 * comparison across a change of *meaning* must not be blind to a layout change
 * that alters exported bytes. `Object.is(value, -0)` is how JavaScript asks the
 * question, and it is the check both `layoutProblems` and `layoutEncoding` are
 * missing; `-0` also survives `JSON.stringify` as `0` while surviving
 * `Float64Array` as `-0`, so the two tables are indistinguishable in every
 * recorded artefact and distinguishable in the vector a policy actually reads.
 *
 * The damage is small in absolute terms — no shipped descriptor declares `-0`
 * today — and the point is not that someone will type it. The point is that the
 * gap in `layoutProblems`' clamp check and the gap in the digest's encoding are
 * the *same* gap, and the second one is outside the three the module says it
 * has. `layoutProblems` should reject a non-`Object.is`-zero floor, which closes
 * both at once.
 */

import type { NormalizationDescriptor, ObservationSlot } from '@mm/agent-api';
import {
  OBSERVATION_LAYOUT_DIGEST,
  OBSERVATION_SIZE,
  OBSERVATION_SLOTS,
  applyDescriptor,
  layoutDigest,
  layoutEncoding,
  layoutProblems,
  logBucketScale,
  observationBlock,
  ratioScale,
} from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

/** A structurally independent copy of the shipped table. */
function copyOfTable(): ObservationSlot[] {
  return OBSERVATION_SLOTS.map((slot) => ({
    index: slot.index,
    block: slot.block,
    blockIndex: slot.blockIndex,
    descriptor: Object.freeze({ ...slot.descriptor }) as NormalizationDescriptor,
  }));
}

function withSlot(position: number, patch: Partial<ObservationSlot>): ObservationSlot[] {
  const slots = copyOfTable();
  slots[position] = { ...(slots[position] as ObservationSlot), ...patch };
  return slots;
}

describe('DEFECT 4 — two validated tables, different exports, one digest', () => {
  /** The shipped table with slot 0's floor set to `min`, and nothing else changed. */
  function tableWithFloor(min: number): ObservationSlot[] {
    const first = OBSERVATION_SLOTS[0] as ObservationSlot;
    return withSlot(0, {
      descriptor: Object.freeze({ ...first.descriptor, min }) as NormalizationDescriptor,
    });
  }

  const positive = tableWithFloor(0);
  const negative = tableWithFloor(-0);

  it('the +0 table validates and the -0 table no longer does', () => {
    // As shipped by the breaker this read `expect(layoutProblems(negative))
    // .toEqual([])`, describing the collision's precondition. That line and the
    // one four tests below — `expect(layoutProblems(negative).length)
    // .toBeGreaterThan(0)` — cannot both hold, so the pair pinned the defect and
    // demanded its fix at the same time. The second is the one that states the
    // contract, so it is the one kept, and this test now says which table
    // validates rather than that both do.
    expect(layoutProblems(positive)).toEqual([]);
    expect(layoutProblems(negative)).not.toEqual([]);
  });

  it('HOLDS: the two tables export different values, so they are not the same layout', () => {
    const zeroFloor = (positive[0] as ObservationSlot).descriptor;
    const negFloor = (negative[0] as ObservationSlot).descriptor;
    expect(Object.is(applyDescriptor(0, zeroFloor), -0)).toBe(false);
    expect(Object.is(applyDescriptor(0, negFloor), -0)).toBe(true);
  });

  it('FAILS ON PURPOSE: the digest cannot tell them apart', () => {
    expect(layoutDigest(negative)).not.toBe(layoutDigest(positive));
  });

  it('FAILS ON PURPOSE: layoutProblems accepts a floor that is not +0', () => {
    // The same gap at its source. Closing this closes the digest collision too,
    // because a table that cannot declare `-0` cannot collide over it.
    expect(layoutProblems(negative).length).toBeGreaterThan(0);
  });

  it('documents the mechanism, and that the encoding no longer falls for it', () => {
    // The evidence, kept so a reader does not have to rediscover why two
    // different tables once hashed the same. `String(-0)` is still `'0'` — that
    // is the language, and it is not going to change — so the encoding stopped
    // using it for the clamp and writes the sign of a zero itself.
    expect(String(-0)).toBe('0');
    expect(layoutEncoding(negative)).not.toBe(layoutEncoding(positive));
  });
});

describe('the digest held along these axes', () => {
  const digestOf = (slots: ObservationSlot[]): string => {
    expect(slots).toHaveLength(OBSERVATION_SIZE);
    return layoutDigest(slots);
  };

  it('moves when a saturation constant moves, at every block', () => {
    // Every block, not one: a digest could plausibly cover the first block's
    // constants and silently drop a later one.
    for (const block of OBSERVATION_SLOTS.map((slot) => slot.block).filter(
      (name, index, all) => all.indexOf(name) === index,
    )) {
      const resolved = observationBlock(block);
      const altered = digestOf(
        withSlot(resolved.offset, { descriptor: ratioScale(7_919) }),
      );
      expect(altered, `block ${block}`).not.toBe(OBSERVATION_LAYOUT_DIGEST);
    }
  });

  it('moves when a rule changes to one with identical arithmetic', () => {
    // `flag` and `ratio(1)` export the same number for every integer input.
    const clock = observationBlock('clock');
    expect((OBSERVATION_SLOTS[clock.offset + 2] as ObservationSlot).descriptor.rule).toBe('flag');
    expect(digestOf(withSlot(clock.offset + 2, { descriptor: ratioScale(1) }))).not.toBe(
      OBSERVATION_LAYOUT_DIGEST,
    );
  });

  it('moves when a slot is relabelled into a neighbouring block', () => {
    const knowledge = observationBlock('knowledge');
    expect(digestOf(withSlot(knowledge.offset, { block: 'mages' }))).not.toBe(
      OBSERVATION_LAYOUT_DIGEST,
    );
  });

  it('moves when a log-bucket edge list changes under an unchanged top edge', () => {
    const coarse = logBucketScale([1, 256]);
    const fine = logBucketScale([1, 2, 4, 8, 16, 32, 64, 128, 256]);
    expect(coarse.divisor).toBe(fine.divisor);
    expect(digestOf(withSlot(0, { descriptor: coarse }))).not.toBe(
      digestOf(withSlot(0, { descriptor: fine })),
    );
  });

  it('moves when two identically-described slots inside one block swap places', () => {
    // The interesting case, because the *descriptors* are identical: the
    // population block is thirty copies of one ratio. What distinguishes the two
    // slots is `blockIndex`, and the digest covers it — so a table that
    // reassigned species 1's channel to species 2 would be caught.
    const population = observationBlock('population');
    const slots = copyOfTable();
    const a = slots[population.offset] as ObservationSlot;
    const b = slots[population.offset + 7] as ObservationSlot;
    expect(a.descriptor).toEqual(b.descriptor);
    slots[population.offset] = { ...a, blockIndex: b.blockIndex };
    slots[population.offset + 7] = { ...b, blockIndex: a.blockIndex };
    expect(digestOf(slots)).not.toBe(OBSERVATION_LAYOUT_DIGEST);
  });

  it('moves when a slot count moves, in either direction', () => {
    const shorter = copyOfTable().slice(0, OBSERVATION_SIZE - 1);
    const longer = [...copyOfTable(), OBSERVATION_SLOTS[0] as ObservationSlot];
    expect(layoutDigest(shorter)).not.toBe(OBSERVATION_LAYOUT_DIGEST);
    expect(layoutDigest(longer)).not.toBe(OBSERVATION_LAYOUT_DIGEST);
    expect(layoutDigest(shorter)).not.toBe(layoutDigest(longer));
  });

  it('is injective over every saturation constant a validated table may hold', () => {
    // The digest is a 64-bit hash, so a collision is possible in principle. This
    // is the practical check: a few thousand distinct constants at one slot, all
    // distinct digests.
    const seen = new Map<string, number>();
    for (let constant = 1; constant <= 1_024; constant += 1) {
      const digest = layoutDigest(withSlot(0, { descriptor: ratioScale(constant) }));
      const previous = seen.get(digest);
      expect(previous, `constants ${String(previous)} and ${String(constant)} collide`).toBe(
        undefined,
      );
      seen.set(digest, constant);
    }
  });

  it('is unchanged by the exporter having run, at any volume', () => {
    const before = layoutDigest(OBSERVATION_SLOTS);
    for (let run = 0; run < 200; run += 1) {
      const raw = new Int32Array(OBSERVATION_SIZE);
      raw.fill(run === 0 ? -1 : run * 65_536);
      applyDescriptor(raw[0] as number, (OBSERVATION_SLOTS[0] as ObservationSlot).descriptor);
    }
    expect(layoutDigest(OBSERVATION_SLOTS)).toBe(before);
    expect(before).toBe(OBSERVATION_LAYOUT_DIGEST);
  });
});

describe('what layoutProblems does not check — reported, not asserted as a defect', () => {
  it('accepts a table whose blockIndex column is uniformly zero', () => {
    // `ObservationSlot.blockIndex` is documented as *"Position within that
    // block"* and is hashed into the digest, but nothing validates it against
    // the block's offset. A table can therefore be internally inconsistent,
    // validate clean, and publish a digest that misdescribes it — which matters
    // for the Python bridge that `digest.ts` says must be able to reproduce the
    // encoding *"from the document rather than from the source"*. Left as a
    // passing observation rather than a red test because no contract sentence
    // pins the column's derivation; the note is the finding.
    const slots = copyOfTable().map((slot) => ({ ...slot, blockIndex: 0 }));
    expect(layoutProblems(slots)).toEqual([]);
    expect(layoutDigest(slots)).not.toBe(OBSERVATION_LAYOUT_DIGEST);
  });

  it('accepts a frozen descriptor whose divisor is an accessor', () => {
    // `digest.ts` calls the frozen-descriptor check *"the load-bearing one"* for
    // rejecting a run-relative denominator, and caveats that *"a determined
    // author can freeze an object built from a measurement"*. This is a sharper
    // version of that caveat and worth recording: `Object.freeze` makes an
    // accessor non-configurable but does not make it constant, so the value the
    // digest records and the value the exporter divides by can differ within one
    // process. Passing, because the caveat is stated; reported, because the
    // stated caveat describes a *fixed* measurement and this one moves.
    let reads = 0;
    const shifting = Object.freeze({
      rule: 'ratio' as const,
      get divisor(): number {
        reads += 1;
        return reads <= 1 ? 1_024 : 4;
      },
      min: 0,
      max: 1,
    }) as unknown as NormalizationDescriptor;

    expect(Object.isFrozen(shifting)).toBe(true);
    expect(layoutProblems(withSlot(0, { descriptor: shifting }))).toEqual([]);
    // The digest saw one constant; the exporter divides by another.
    expect(applyDescriptor(512, shifting)).toBe(1);
  });
});
