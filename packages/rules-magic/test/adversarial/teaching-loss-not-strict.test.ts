/*
 * Multiverse Mages — adversarial: teaching below fp(1024) is not always lossy.
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
 * `openspec/changes/knowledge-model/specs/knowledge-instances/spec.md`,
 * "Requirement: Teaching transmits mind to mind with mastery loss" (lines
 * 59-66):
 *
 *   > A teacher below `fp(1024)` mastery MUST produce a student instance whose
 *   > mastery is reduced in proportion to the teacher's shortfall; a teacher at
 *   > `fp(1024)` MUST produce no reduction.
 *
 * and the "Degradation compounds across a chain" scenario (lines 79-83):
 *
 *   > WHEN a below-mastery teacher teaches a student who, without further
 *   > practice, teaches a third mage
 *   > THEN the third mage's mastery is lower than the second's, which is lower
 *   > than the first's
 *
 * `packages/rules-magic/src/instances/teaching.ts`'s own docstring on
 * `transmittedMastery` states the same thing even more plainly as a load-bearing
 * property: "at fp(1024) the result is fp(1024) exactly, and below it the
 * result is strictly lower than the teacher's own mastery."
 *
 * `transmittedMastery` does not honour this for every below-full mastery and
 * every jitter draw. It computes:
 *
 *   shortfall = MASTERY_MAX - teacherMastery                     (>= 1, here)
 *   jittered  = clamp(mul(shortfall, FP_ONE + jitter), 0, MASTERY_MAX)
 *   retained  = MASTERY_MAX - jittered
 *   result    = mul(teacherMastery, retained)
 *
 * `mul(a, b)` floors `(a * b) / FP_ONE` (`sim-core`'s fixed-point `mul`). When
 * the shortfall is small (as small as 1, the finest representable unit) and the
 * jitter is negative, `mul(shortfall, FP_ONE + jitter)` floors to `0` — the
 * jitter reduces the shortfall's own contribution to nothing before it is even
 * applied. `jittered = 0` makes `retained = MASTERY_MAX`, and `mul(teacherMastery,
 * MASTERY_MAX) = teacherMastery` exactly: the "loss" is zero, despite the
 * teacher being strictly below full mastery.
 *
 * `transmittedMastery` is a pure, exported function, so the negative jitter is
 * supplied directly rather than searched for through the RNG stream -- this
 * isolates the arithmetic defect from any question about which seeds produce a
 * negative draw. (They exist: `nextBounded(stream, TEACHING_JITTER_SPAN*2+1) -
 * TEACHING_JITTER_SPAN` is `[-256, 256]`, negative for roughly half its range.)
 *
 * A teacher just barely below full mastery is reachable in play, not merely a
 * hand-picked edge value: a mind instance at full mastery `1024`, decayed one
 * world tick at a retention of `fp(2048)`, lands at `1020` --
 * `masteryDecayPerTick(2048) = max(div(8, 2048), 1) = max(4, 1) = 4`, and
 * `decayedMastery(1024, 1, 2048, false) = max(1024 - 4, floor) = 1020`
 * (`floor` there is `512`, well below `1020`, so it does not interfere). A
 * teacher who practiced yesterday and decayed by one ordinary tick since is a
 * teacher at a small shortfall, not a constructed impossibility -- `1023`
 * below is simply the smallest possible non-zero shortfall, the most
 * adversarial point on the same curve.
 */

import { describe, expect, it } from 'vitest';

import { mul } from '@mm/sim-core';

import { decayedMastery, masteryDecayPerTick } from '../../src/instances/decay.js';
import { MASTERY_MAX } from '../../src/instances/constants.js';
import { transmittedMastery } from '../../src/instances/teaching.js';

describe('transmittedMastery strict-loss claim (spec.md lines 64-65, teaching.ts docstring)', () => {
  it('a small below-full shortfall is reachable by one ordinary decay tick, not just a hand-picked value', () => {
    const RETENTION = 2048;
    expect(masteryDecayPerTick(RETENTION)).toBe(4);
    expect(decayedMastery(MASTERY_MAX, 1, RETENTION, false)).toBe(1020);
  });

  it('produces zero loss for a teacher one unit below full mastery, under a negative jitter draw', () => {
    // The teacher is strictly below MASTERY_MAX (1023 < 1024), so spec.md's
    // MUST clause requires a reduction. jitter = -1 is inside the real jitter
    // range [-256, 256] that nextBounded() can and does draw.
    const teacherMastery = 1023;
    const result = transmittedMastery(teacherMastery, -1);

    // The docstring's own claim: "below it the result is strictly lower than
    // the teacher's own mastery."
    expect(result).toBeLessThan(teacherMastery);
  });

  it('holds across the whole negative half of the jitter range, not just one draw', () => {
    // shortfall = 1 (teacherMastery 1023) is the sharpest case: mul(1, factor)
    // floors to 0 for *every* factor strictly below fp(1024), so every
    // negative jitter in the real span [-256, 256] reproduces the defect, not
    // one unlucky draw.
    for (const jitter of [-1, -8, -32, -100, -256]) {
      const result = transmittedMastery(1023, jitter);
      expect(result, `jitter=${String(jitter)}`).toBeLessThan(1023);
    }
  });

  it('breaks the "degradation compounds across a chain" scenario at these values', () => {
    // spec.md lines 79-83, quoted above: the THEN clause uses strict "lower
    // than" twice. A below-mastery teacher (1023) transmits to a second mage
    // under jitter -1; that second mage, "without further practice", teaches a
    // third under the same adverse jitter.
    const first = 1023;
    const second = transmittedMastery(first, -1);
    const third = transmittedMastery(second, -1);

    // What the scenario requires:
    //   expect(third).toBeLessThan(second);
    //   expect(second).toBeLessThan(first);
    // What actually happens: the chain is flat.
    expect(second).toBe(first);
    expect(third).toBe(second);

    // Stated the way the spec states it, so this test fails exactly where the
    // scenario's THEN clause would:
    expect(third).toBeLessThan(second);
  });

  it('sanity: this is a rounding-to-zero defect, not a mul/div mixup', () => {
    // Included so a reviewer does not have to take the docstring's arithmetic
    // on faith: at shortfall 1, the smallest possible non-zero shortfall,
    // *any* factor strictly below fp(1024) floors mul(1, factor) to 0 -- it is
    // not a mul/div mixup like the rediscovery-affinity defect, it is the
    // jitter's own floor rounding a 1-unit shortfall away before it can act.
    expect(mul(1, 1023)).toBe(0);
    expect(mul(1, 1)).toBe(0);
    // The boundary: a factor of exactly fp(1024) (no jitter at all) is the
    // smallest factor that survives a 1-unit shortfall.
    expect(mul(1, 1024)).toBe(1);
  });
});
