/*
 * Multiverse Mages — the census reads the same numbers the encoder wrote.
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
 * The census decodes counts out of a normalized observation, which is a claim
 * about arithmetic that would fail silently: a wrong divisor produces a
 * plausible number, and a plausible number in a run record is worse than an
 * error. So the decode is checked against the **raw** integer observation the
 * encoder produced from the same state, channel group by channel group.
 *
 * The saturation flag is checked separately, on a hand-built vector, because the
 * shakedown sweep does not reach any channel's ceiling — and the one case where
 * the census must not be believed is exactly the one a short run cannot produce.
 */

import {
  MAGE_TIER_SLOTS,
  OBSERVATION_KNOWLEDGE_CHANNELS,
  OBSERVATION_OCCUPATION_COUNT,
  OBSERVATION_SIZE,
  OBSERVATION_SPECIES_COUNT,
  observationBlock,
  observe,
} from '@mm/agent-api';
import { GRID_CELL_COUNT } from '@mm/state';
import { censusLine, censusOf, referenceContent, referenceScenario } from '@mm/scenario';
import { describe, expect, it } from 'vitest';

const content = referenceContent();
const CONFIG = { worldTickCap: 4, options: { cohortSize: 7, foundingNodes: 3 } } as const;

/** The tick-zero view of a reference universe, raw and normalized together. */
function view() {
  const state = referenceScenario(content).scenario.create(0x0006_0001, CONFIG);
  return observe({ state, catalogue: content.catalogue });
}

/** Sums a run of raw channels. */
function rawSum(raw: Int32Array, offset: number, length: number, stride = 1): number {
  let total = 0;
  for (let index = 0; index < length; index += 1) total += raw[offset + index * stride] ?? 0;
  return total;
}

describe('the census decodes what the encoder encoded', () => {
  it('recovers population, mages, nodes and instances exactly', () => {
    const { raw, normalized } = view();
    const sample = censusOf(normalized);

    expect(sample.population).toBe(
      rawSum(
        raw,
        observationBlock('population').offset,
        OBSERVATION_SPECIES_COUNT * OBSERVATION_OCCUPATION_COUNT,
      ),
    );
    expect(sample.livingMages).toBe(
      rawSum(raw, observationBlock('mages').offset, OBSERVATION_SPECIES_COUNT * MAGE_TIER_SLOTS),
    );

    const knowledge = observationBlock('knowledge').offset;
    expect(sample.nodesKnown).toBe(
      rawSum(raw, knowledge, GRID_CELL_COUNT, OBSERVATION_KNOWLEDGE_CHANNELS),
    );
    expect(sample.knowledgeInstances).toBe(
      rawSum(raw, knowledge + 2, GRID_CELL_COUNT, OBSERVATION_KNOWLEDGE_CHANNELS),
    );

    const institutions = observationBlock('institutions').offset;
    expect(sample.libraryDepth).toBe(raw[institutions + 2]);
    expect(sample.grimoires).toBe(raw[institutions + 3]);
    expect(sample.worldTick).toBe(raw[observationBlock('clock').offset]);

    // Not vacuous: the universe this was taken from is not empty.
    expect(sample.population).toBeGreaterThan(0);
    expect(sample.livingMages).toBe(OBSERVATION_SPECIES_COUNT);
    expect(sample.nodesKnown).toBe(3);
  });

  it('says so when a channel is at its ceiling instead of reporting the clamp', () => {
    // §4.1 pins `instancesPerCell` at 512, and a mature universe passes it: a
    // ten-year reference run saturates eight of the twelve permitted cells, at
    // which point a policy sees 1.0 forever and the census sees exactly 512 per
    // clamped cell. That is a limit of the observation space, not of the run,
    // and a measurement layer that reported the clamped number as a count would
    // be understating a universe in the reassuring direction.
    const observation = new Float64Array(OBSERVATION_SIZE);
    observation[observationBlock('knowledge').offset + 2] = 1;
    const sample = censusOf(observation);

    expect(sample.saturated).toEqual(['knowledgeInstances']);
    expect(sample.knowledgeInstances).toBe(512);
  });

  it('refuses a vector from another layout', () => {
    expect(() => censusOf(new Float64Array(4))).toThrow(/observation/);
  });
});

describe('a census reads as a line a human can scan', () => {
  it('names every quantity it carries', () => {
    const line = censusLine(censusOf(view().normalized));
    for (const label of ['tick', 'pop', 'mages', 'nodes', 'instances', 'libraryDepth', 'grimoires']) {
      expect(line).toContain(label);
    }
    expect(line).not.toContain('SATURATED');
  });
});
