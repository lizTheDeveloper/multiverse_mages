/*
 * Multiverse Mages — reading a universe's vital signs back out of the
 * observation an agent sees.
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
 * ## Why the census is decoded rather than read off the state
 *
 * This package builds the world, so it could keep the `SimState` beside the
 * session and count entities directly. It deliberately does not. `design.md`
 * rejects exactly that shortcut for the scripted bots — *"reading world state
 * directly would let a bot see what an RL agent cannot, and every measurement
 * taken with such a bot would overstate what the observation space supports"* —
 * and a measurement is worse than a bot here, because a measurement becomes a
 * committed baseline. If the observation cannot express "the population grew",
 * that is a finding about §4.1 and it should surface as a census that cannot see
 * it, not be quietly routed around.
 *
 * It also keeps the harness's edge honest. `mc-harness` reaches the simulation
 * only through `agent-api`; the numbers it records now come through the same
 * door.
 *
 * ## The decode is exact, and that is a property of the encoding
 *
 * Every channel read below is a `ratio` descriptor over an integer count, so the
 * exported value is `fl(n / divisor)` and `Math.round(v * divisor)` recovers `n`
 * exactly for any count a run can reach. Two channels are read through
 * {@link descriptorAt} rather than through a restated constant, so a channel
 * that is rescaled cannot leave this file decoding against the old divisor.
 *
 * The one thing the decode cannot recover is a **saturated** channel: a count at
 * or above its divisor exports `1.0` and reads back as exactly the divisor.
 * {@link CensusSample.saturated} says when that happened rather than letting a
 * clamped number pass as a measurement.
 */

import {
  MAGE_TIER_SLOTS,
  OBSERVATION_KNOWLEDGE_CHANNELS,
  OBSERVATION_OCCUPATION_COUNT,
  OBSERVATION_SIZE,
  OBSERVATION_SPECIES_COUNT,
  descriptorAt,
  observationBlock,
} from '@mm/agent-api';
import { GRID_CELL_COUNT } from '@mm/state';

/** One reading of a universe's vital signs, taken from one observation. */
export interface CensusSample {
  /** World ticks elapsed when the reading was taken. */
  readonly worldTick: number;
  /** Everybody alive in every cohort, all species, all occupations. */
  readonly population: number;
  /** Living mages. */
  readonly livingMages: number;
  /** Distinct nodes of which the universe holds at least one instance. */
  readonly nodesKnown: number;
  /** Knowledge instances, held and written. §7's redundancy quantity. */
  readonly knowledgeInstances: number;
  /** Distinct nodes held in libraries — the channel §7's `capitalSnowball` reads. */
  readonly libraryDepth: number;
  /** Grimoires in existence. */
  readonly grimoires: number;
  /**
   * Channels that read exactly their saturation constant, by name.
   *
   * Empty is the ordinary case. A name here means the number beside it is a
   * floor, not a measurement.
   */
  readonly saturated: readonly string[];
}

/** Decodes a `ratio` channel back to the integer the encoder wrote. */
function count(observation: Float64Array, index: number): { value: number; saturated: boolean } {
  const descriptor = descriptorAt(index);
  if (descriptor.rule !== 'ratio') {
    throw new Error(
      `Observation channel ${String(index)} is a ${descriptor.rule} channel, and the census only ` +
        'decodes counts. A channel that changed rule changed meaning, and reading it as a count ' +
        'anyway would report a plausible wrong number.',
    );
  }
  const exported = observation[index] ?? 0;
  return {
    value: Math.round(exported * descriptor.divisor),
    saturated: exported >= descriptor.max,
  };
}

/** Sums a run of `ratio` channels, noting whether any of them clamped. */
function sum(
  observation: Float64Array,
  offset: number,
  length: number,
  stride = 1,
): { value: number; saturated: boolean } {
  let value = 0;
  let saturated = false;
  for (let index = 0; index < length; index += 1) {
    const channel = count(observation, offset + index * stride);
    value += channel.value;
    saturated ||= channel.saturated;
  }
  return { value, saturated };
}

/**
 * Reads one census out of a normalized observation.
 *
 * @param observation - §4.1's exported vector, as `AgentSession.observe()`
 * returns it.
 * @throws RangeError if the vector is not {@link OBSERVATION_SIZE} long, which
 * means it did not come from this build's observation layout and every offset
 * below would address the wrong channel.
 */
export function censusOf(observation: Float64Array): CensusSample {
  if (observation.length !== OBSERVATION_SIZE) {
    throw new RangeError(
      `A census needs a ${String(OBSERVATION_SIZE)}-channel observation and received ` +
        `${String(observation.length)}. The layout digest exists to catch this before a number is ` +
        'recorded against the wrong universe.',
    );
  }

  const saturated: string[] = [];
  const note = (name: string, channel: { value: number; saturated: boolean }): number => {
    if (channel.saturated) saturated.push(name);
    return channel.value;
  };

  const population = note(
    'population',
    sum(
      observation,
      observationBlock('population').offset,
      OBSERVATION_SPECIES_COUNT * OBSERVATION_OCCUPATION_COUNT,
    ),
  );
  const livingMages = note(
    'mages',
    sum(observation, observationBlock('mages').offset, OBSERVATION_SPECIES_COUNT * MAGE_TIER_SLOTS),
  );

  const knowledge = observationBlock('knowledge').offset;
  const nodesKnown = note(
    'nodesKnown',
    sum(observation, knowledge, GRID_CELL_COUNT, OBSERVATION_KNOWLEDGE_CHANNELS),
  );
  const knowledgeInstances = note(
    'knowledgeInstances',
    // The third channel of each cell: §4.1's "instance redundancy", which
    // carries the raw instance count rather than the surplus over `nodesKnown`.
    sum(observation, knowledge + 2, GRID_CELL_COUNT, OBSERVATION_KNOWLEDGE_CHANNELS),
  );

  const institutions = observationBlock('institutions').offset;
  const libraryDepth = note('libraryDepth', count(observation, institutions + 2));
  const grimoires = note('grimoires', count(observation, institutions + 3));

  const worldTick = note('worldTick', count(observation, observationBlock('clock').offset));

  return Object.freeze({
    worldTick,
    population,
    livingMages,
    nodesKnown,
    knowledgeInstances,
    libraryDepth,
    grimoires,
    saturated: Object.freeze(saturated),
  });
}

/** One census as a fixed-width line, for a test that prints a run's history. */
export function censusLine(sample: CensusSample): string {
  const column = (value: number, width: number): string => String(value).padStart(width);
  return (
    `tick ${column(sample.worldTick, 4)}  pop ${column(sample.population, 7)}` +
    `  mages ${column(sample.livingMages, 5)}  nodes ${column(sample.nodesKnown, 4)}` +
    `  instances ${column(sample.knowledgeInstances, 6)}` +
    `  libraryDepth ${column(sample.libraryDepth, 4)}  grimoires ${column(sample.grimoires, 5)}` +
    (sample.saturated.length === 0 ? '' : `  SATURATED: ${sample.saturated.join(', ')}`)
  );
}
