/*
 * Multiverse Mages — can a reader get the integers back out of the observation?
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
 * `AgentView` carries two observations. `raw: Int32Array` is the one its own
 * comment calls *"the reproducible artefact"*; `normalized: Float64Array` is
 * §4.1's pinned export. **`AgentSession.observe()` returns only the normalized
 * one**, so every consumer that is not holding a `SimState` — a client, a
 * viewer, a recorder — sees `0.3125` where the world holds `40.0` favor.
 *
 * A number a player can act on therefore has to be reconstructed, and
 * `scripts/record-session.mjs` reconstructs it. These tests pin the property
 * that makes that legitimate rather than lucky:
 *
 *  - every descriptor in the layout uses a rule that is exactly invertible, and
 *  - the inversion returns the integer, not something near it.
 *
 * The first is the one that will fail one day. `NORMALIZATION_RULES` declares
 * `log-bucket` and `bounded`, and a single channel adopting either makes the
 * reconstruction lossy — silently, in a renderer, months later. This test is
 * where that gets noticed, and the fix at that point is to expose `raw` on the
 * session rather than to make the recorder cleverer.
 */

import {
  OBSERVATION_DESCRIPTORS,
  OBSERVATION_SIZE,
  normalizedObservation,
} from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

/** The rules whose inverse is exact: `raw = normalized x divisor`. */
const INVERTIBLE = new Set(['ratio', 'flag']);

describe('the observation can be read back as integers', () => {
  it('uses only exactly-invertible normalization rules', () => {
    const offenders = OBSERVATION_DESCRIPTORS.map((d, slot) => ({ slot, rule: d.rule })).filter(
      ({ rule }) => !INVERTIBLE.has(rule),
    );
    // Named individually rather than counted, because the message is the point:
    // whoever sees this failure needs to know which channel and which rule.
    expect(offenders).toEqual([]);
  });

  it('recovers the exact integer for every slot at several magnitudes', () => {
    // Fractions of each channel's own divisor, so the same set of cases
    // exercises a five-bit flag and an eight-million-unit materials pool.
    const fractions = [0, 1 / 8192, 1 / 3, 0.5, 0.75, 1];
    for (const fraction of fractions) {
      const raw = new Int32Array(OBSERVATION_SIZE);
      for (let slot = 0; slot < OBSERVATION_SIZE; slot += 1) {
        raw[slot] = Math.round(OBSERVATION_DESCRIPTORS[slot]!.divisor * fraction);
      }
      const normalized = normalizedObservation(raw);
      for (let slot = 0; slot < OBSERVATION_SIZE; slot += 1) {
        const back = Math.round(normalized[slot]! * OBSERVATION_DESCRIPTORS[slot]!.divisor);
        expect(back, `slot ${slot} at ${fraction} of its divisor`).toBe(raw[slot]);
      }
    }
  });

  it('cannot recover anything above the divisor, which is why saturation is recorded', () => {
    // The one honest limit. A channel at or past its ceiling normalizes to 1.0
    // and the excess is gone — so a recorder has to say *that a slot saturated*
    // rather than pretend the reconstruction is complete. `record-session.mjs`
    // writes those slot indices per frame for exactly this reason.
    const raw = new Int32Array(OBSERVATION_SIZE);
    const slot = OBSERVATION_DESCRIPTORS.findIndex((d) => d.rule === 'ratio' && d.divisor > 2);
    expect(slot).toBeGreaterThanOrEqual(0);
    const { divisor } = OBSERVATION_DESCRIPTORS[slot]!;
    raw[slot] = divisor * 3;

    const normalized = normalizedObservation(raw);
    expect(normalized[slot]).toBe(1);
    expect(Math.round(normalized[slot]! * divisor)).toBe(divisor);
    expect(Math.round(normalized[slot]! * divisor)).not.toBe(raw[slot]);
  });
});
