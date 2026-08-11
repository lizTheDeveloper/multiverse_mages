/*
 * Multiverse Mages — adversarial: teaching below fp(1024) is always lossy.
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
 * A regression guard on the strict-loss property of `transmittedMastery`.
 *
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
 * ## The defect this file was written to expose, and now guards against
 *
 * This suite originally *failed*: it demonstrated that `transmittedMastery`
 * broke the MUST clause at the easiest point to reach. The arithmetic is worth
 * keeping written down, because the fix is not self-evident from the code and
 * a future simplification would reintroduce the bug.
 *
 * `mul(a, b)` floors `(a * b) / FP_ONE`. A teacher one unit below full mastery
 * has `shortfall === 1`, and `mul(1, factor)` is `0` for **every** factor
 * strictly below `FP_ONE` — so any negative jitter, roughly half the real
 * `[-TEACHING_JITTER_SPAN, TEACHING_JITTER_SPAN]` draw range, rounded the whole
 * shortfall away before it could act. `jittered === 0` made `retained ===
 * MASTERY_MAX`, and `mul(capped, MASTERY_MAX) === capped` exactly: teaching
 * became lossless for a teacher who is *not* fully masterful, and the
 * compounding chain flattened into a plateau.
 *
 * The fix floors the *loss* at one unit — the finest thing fixed point at
 * 1/1024 can represent — rather than at zero, whenever the teacher is short of
 * full at all. A teacher at exactly `MASTERY_MAX` has `shortfall === 0` and the
 * clamp does not apply to her, so losslessness at the top stays exact rather
 * than becoming "usually".
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
 *
 * `transmittedMastery` is a pure, exported function, so the negative jitter is
 * supplied directly rather than searched for through the RNG stream -- this
 * isolates the arithmetic from any question about which seeds produce a
 * negative draw. (They exist: `nextBounded(stream, TEACHING_JITTER_SPAN*2+1) -
 * TEACHING_JITTER_SPAN` is `[-256, 256]`, negative for roughly half its range.)
 */

import { describe, expect, it } from 'vitest';

import { mul } from '@mm/sim-core';

import { decayedMastery, masteryDecayPerTick } from '../../src/instances/decay.js';
import { MASTERY_MAX, TEACHING_JITTER_SPAN } from '../../src/instances/constants.js';
import { transmittedMastery } from '../../src/instances/teaching.js';

describe('transmittedMastery strict-loss claim (spec.md lines 64-65, teaching.ts docstring)', () => {
  it('a small below-full shortfall is reachable by one ordinary decay tick, not just a hand-picked value', () => {
    const RETENTION = 2048;
    expect(masteryDecayPerTick(RETENTION)).toBe(4);
    expect(decayedMastery(MASTERY_MAX, 1, RETENTION, false)).toBe(1020);
  });

  it('produces a strict loss for a teacher one unit below full mastery, under a negative jitter draw', () => {
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
    // floors to 0 for *every* factor strictly below fp(1024), so before the
    // fix every negative jitter in the real span [-256, 256] reproduced the
    // defect, not one unlucky draw.
    for (const jitter of [-1, -8, -32, -100, -TEACHING_JITTER_SPAN]) {
      const result = transmittedMastery(1023, jitter);
      expect(result, `jitter=${String(jitter)}`).toBeLessThan(1023);
    }
  });

  it('holds at every below-full mastery, across the whole jitter range', () => {
    // The MUST clause is universally quantified, so quantify the test the same
    // way rather than trusting the two endpoints to stand in for the interior.
    for (let mastery = 1; mastery < MASTERY_MAX; mastery++) {
      for (const jitter of [-TEACHING_JITTER_SPAN, -37, -1, 0, 1, 37, TEACHING_JITTER_SPAN]) {
        const result = transmittedMastery(mastery, jitter);
        expect(result, `mastery=${String(mastery)} jitter=${String(jitter)}`).toBeLessThan(mastery);
        expect(result, `mastery=${String(mastery)} jitter=${String(jitter)}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('is lossless at exactly full mastery, for every jitter draw', () => {
    // The other half of the same requirement: the clamp must not reach a
    // teacher with no shortfall, or "no reduction" would become "usually no
    // reduction" and the top of the curve would erode.
    for (let jitter = -TEACHING_JITTER_SPAN; jitter <= TEACHING_JITTER_SPAN; jitter++) {
      expect(transmittedMastery(MASTERY_MAX, jitter), `jitter=${String(jitter)}`).toBe(MASTERY_MAX);
    }
  });

  it('satisfies the "degradation compounds across a chain" scenario', () => {
    // spec.md lines 79-83, quoted above: the THEN clause uses strict "lower
    // than" twice. A below-mastery teacher (1023) transmits to a second mage
    // under jitter -1; that second mage, "without further practice", teaches a
    // third under the same adverse jitter.
    const first = 1023;
    const second = transmittedMastery(first, -1);
    const third = transmittedMastery(second, -1);

    expect(second).toBeLessThan(first);
    expect(third).toBeLessThan(second);
  });

  it('keeps compounding down a long chain rather than settling at a plateau', () => {
    // The plateau is the failure mode the defect actually produced, and a
    // three-link chain is short enough that a future regression could pass it
    // by losing exactly one unit and then stalling. Run the chain out and
    // require it to keep descending -- this is what gives knowledgeHalfLife
    // and libraryDependence something to detect.
    let mastery = 1023;
    const chain = [mastery];
    for (let link = 0; link < 8; link++) {
      const next = transmittedMastery(mastery, -1);
      expect(next, `link ${String(link)} of the chain`).toBeLessThan(mastery);
      mastery = next;
      chain.push(mastery);
    }
    // Strictly monotone, and losing materially more than the one-unit floor by
    // the end -- a chain of mediocre teachers degrades knowledge, which is the
    // whole reason teaching is lossy.
    expect(chain.at(-1)).toBeLessThan(1023 - chain.length);
  });

  it('sanity: the one-unit loss floor is what defeats the rounding-to-zero defect', () => {
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
    // And the floor is what turns that 0 back into a real loss.
    expect(transmittedMastery(1023, -1023)).toBeLessThan(1023);
  });
});
