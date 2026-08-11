/*
 * Multiverse Mages — a control arm and its ablation arm are the same universe.
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
 * The two claims `winRateByPrimitive` rests on, checked over a run rather than
 * over a call:
 *
 * 1. **The arms consume identical draw sequences up to genuine divergence.**
 *    Not identical draw *counts* on one roll — identical *sequences*, over many
 *    ticks and many actors, on the stream the ablated primitive draws from.
 * 2. **The arms record identical content hashes.** The mask is not a content
 *    edit, so `contentRevision` — which `contracts.md` §0 makes a compatibility
 *    gate — does not move, and node prerequisites, tiers and costs are what they
 *    were.
 *
 * ## Why this file simulates a loop instead of asserting equality
 *
 * "Identical up to genuine divergence" is only a meaningful claim if divergence
 * actually happens. A test in which the two arms agree forever would pass with
 * the mask disconnected entirely.
 *
 * So the loop below has a consequence: a successful theft on stream 9 gives the
 * thief a knowledge instance, and a mage with more instances takes more
 * research draws on stream 3 next tick. In the control arm thefts succeed and
 * the research stream pulls ahead; in the ablated arm they never do. That is
 * *genuine* divergence — a real behavioural difference caused by the removed
 * primitive — and it is exactly what the measurement is supposed to see.
 *
 * What must **not** happen is divergence on stream 9 itself. Every attempt is
 * still made and still costs its draw, so the theft stream's sequence is
 * identical in both arms for the whole run, from the first tick to the last,
 * long after the arms' behaviour has parted company. If neutralizing had
 * skipped the draw, stream 9 would shift at the first attempt and every later
 * theft in the ablated arm would be rolling numbers its control never saw —
 * which is the failure this file exists to make visible.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE, RNG_STREAM, deriveActorStream, nextBounded } from '@mm/sim-core';
import type { Fixed } from '@mm/sim-core';
import { loadContent, shippedContentSource } from '@mm/content';
import type { ContentRegistry, PrimitiveRecord } from '@mm/content';
import { NO_ABLATION, neutralizing, rollStackedProbability } from '@mm/primitives';
import type { AblationMask } from '@mm/primitives';

const registry: ContentRegistry = loadContent(shippedContentSource());

function primitive(id: string): PrimitiveRecord {
  const found = registry.primitives.find((entry) => entry.record.id === id);
  if (found === undefined) {
    throw new Error(`shipped content has no primitive "${id}"`);
  }
  return found.record;
}

const KNOWLEDGE_STEAL = primitive('knowledge-steal');

/** Stable identities, never roster positions — `contracts.md` §6. */
const ACTOR_KEYS: readonly number[] = [0x1a01, 0x1a02, 0x1a03, 0x1a04];
const ROOT_SEED = 0x0ab1_a710;
const TICKS = 24;
/**
 * Attempts per actor per tick, **on one stream**.
 *
 * More than one deliberately. `knowledge-steal` is a probability *per attempt*,
 * so several attempts share an actor's tick stream and are separated only by
 * `drawOrdinal`. That is where a skipped draw does its damage: the ablated
 * arm's second attempt would read the number the control's first attempt read,
 * and every attempt after it inherits a value from the wrong position. With one
 * attempt per stream the defect would be invisible here, which is exactly the
 * reason the loop does not have one.
 */
const ATTEMPTS_PER_TICK = 3;
/** Two sources, stacking by `max` to fp(614) — a 60% attempt. */
const STEAL_SOURCES: readonly Fixed[] = [409, 614];

interface ArmResult {
  /** Every draw spent on stream 9, in order, across every tick and actor. */
  readonly theftDraws: readonly Fixed[];
  /** Every draw spent on stream 3, in order. Its length depends on behaviour. */
  readonly researchDraws: readonly Fixed[];
  /** Ticks at which some actor succeeded at a theft. */
  readonly theftTicks: readonly number[];
  /** The content hash the arm would record in every run record. */
  readonly contentRevision: string;
}

/**
 * A deliberately small loop with one behavioural consequence.
 *
 * Every actor attempts a theft every tick — the attempt is unconditional, as it
 * must be for the pairing to hold — and the number of research draws an actor
 * takes is one plus however much knowledge it has accumulated. That coupling is
 * what turns a difference in outcome into a difference in draw *positions*
 * further down, which is the thing the paired design has to tolerate on one
 * stream and forbid on another.
 */
function runArm(mask: AblationMask): ArmResult {
  const theftDraws: Fixed[] = [];
  const researchDraws: Fixed[] = [];
  const theftTicks: number[] = [];
  const knowledge = new Map<number, number>(ACTOR_KEYS.map((key) => [key, 0]));

  for (let tick = 0; tick < TICKS; tick += 1) {
    for (const actorKey of ACTOR_KEYS) {
      const theft = deriveActorStream(ROOT_SEED, RNG_STREAM.knowledgeTheft, tick, actorKey);
      for (let attempt = 0; attempt < ATTEMPTS_PER_TICK; attempt += 1) {
        const roll = rollStackedProbability(KNOWLEDGE_STEAL, STEAL_SOURCES, theft, {
          ablation: mask,
        });
        theftDraws.push(roll.draw);
        if (roll.succeeded) {
          knowledge.set(actorKey, (knowledge.get(actorKey) ?? 0) + 1);
          if (theftTicks[theftTicks.length - 1] !== tick) {
            theftTicks.push(tick);
          }
        }
      }

      const research = deriveActorStream(ROOT_SEED, RNG_STREAM.research, tick, actorKey);
      const attempts = 1 + (knowledge.get(actorKey) ?? 0);
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        researchDraws.push(nextBounded(research, FP_ONE));
      }
    }
  }

  return {
    theftDraws,
    researchDraws,
    theftTicks,
    contentRevision: registry.contentRevision,
  };
}

/** The first index at which two sequences differ, or `-1` when neither does. */
function firstDifference(left: readonly Fixed[], right: readonly Fixed[]): number {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    if (left[index] !== right[index]) {
      return index;
    }
  }
  return left.length === right.length ? -1 : shared;
}

describe('a control run and its paired ablation run', () => {
  const control = runArm(NO_ABLATION);
  const ablated = runArm(neutralizing('knowledge-steal'));

  it('is a pairing worth testing: the control steals and the ablated arm never does', () => {
    // Non-vacuity for everything below. If no theft ever succeeded, the two
    // arms would be identical for reasons that have nothing to do with the
    // mask, and every assertion in this file would hold trivially.
    expect(control.theftTicks.length).toBeGreaterThan(0);
    expect(ablated.theftTicks).toEqual([]);
  });

  it('consumes an identical draw sequence on the ablated primitive’s own stream', () => {
    // The whole run, not a prefix. Stream 9 never shifts, because a neutralized
    // primitive still spends its draw and discards the result.
    expect(ablated.theftDraws).toEqual(control.theftDraws);
    expect(control.theftDraws).toHaveLength(TICKS * ACTOR_KEYS.length * ATTEMPTS_PER_TICK);
    expect(firstDifference(control.theftDraws, ablated.theftDraws)).toBe(-1);

    // The attempts within a tick really do occupy distinct positions on one
    // stream, so "identical sequence" is a statement about ordinals and not
    // about a stream that was re-derived before every draw.
    expect(new Set(control.theftDraws.slice(0, ATTEMPTS_PER_TICK)).size).toBe(ATTEMPTS_PER_TICK);
  });

  it('diverges downstream only, and only after behaviour genuinely differs', () => {
    const divergence = firstDifference(control.researchDraws, ablated.researchDraws);
    expect(divergence).toBeGreaterThan(0);

    // Everything before the divergence is shared, which is what makes the
    // comparison paired rather than two independent samples.
    expect(control.researchDraws.slice(0, divergence)).toEqual(
      ablated.researchDraws.slice(0, divergence),
    );

    // And the divergence is attributable: it cannot precede the first tick at
    // which the control arm actually stole something. A divergence earlier than
    // that would be the arms drifting apart for a reason unrelated to the
    // ablated primitive — the exact artefact `contracts.md` §6 warns about.
    const firstTheftTick = control.theftTicks[0];
    expect(firstTheftTick).toBeDefined();
    const drawsBeforeThatTick = (firstTheftTick as number) * ACTOR_KEYS.length;
    expect(divergence).toBeGreaterThanOrEqual(drawsBeforeThatTick);
    expect(control.theftTicks[0]).toBeLessThan(TICKS);

    // The ablated arm took strictly fewer research draws, because it never
    // accumulated the knowledge that buys them.
    expect(ablated.researchDraws.length).toBeLessThan(control.researchDraws.length);
    expect(ablated.researchDraws).toHaveLength(TICKS * ACTOR_KEYS.length);
  });

  it('records identical content hashes, because the mask is not a content edit', () => {
    expect(ablated.contentRevision).toBe(control.contentRevision);
    expect(control.contentRevision).toBe(registry.contentRevision);
    // Against a freshly loaded registry too, so the equality is not two reads
    // of one object that both arms happened to mutate the same way.
    expect(registry.contentRevision).toBe(loadContent(shippedContentSource()).contentRevision);
  });

  it('leaves node prerequisites, tiers, and costs exactly as they were', () => {
    // The scenario from the spec, stated over the shipped graph rather than a
    // sample: whatever ablation did, mages research the same nodes at the same
    // prices, so the measured delta cannot be confounded with a cheaper path.
    const fresh = loadContent(shippedContentSource());
    const shape = (source: ContentRegistry): readonly string[] =>
      source.nodes.map((entry) =>
        [
          entry.record.id,
          entry.record.tier,
          entry.record.prerequisites.join('+'),
          entry.record.researchCost,
          entry.record.teachCost,
          entry.record.scribeCost,
        ].join('|'),
      );
    expect(shape(registry)).toEqual(shape(fresh));
    expect(registry.primitives.map((entry) => entry.record)).toEqual(
      fresh.primitives.map((entry) => entry.record),
    );
  });
});
