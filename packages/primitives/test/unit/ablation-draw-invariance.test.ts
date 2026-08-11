/*
 * Multiverse Mages — a neutralized primitive still spends its draws.
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
 * ## The property, and why an obvious test of it proves nothing
 *
 * The design note gives draw-count invariance as one of the three things that
 * make `winRateByPrimitive` trustworthy: *a neutralized primitive still
 * consumes its RNG draws and discards the result*. Without it, ablating
 * `knowledge-steal` shifts every subsequent draw on stream 9, the ablated arm
 * plays a different universe from its control, and the paired design — which is
 * the entire reason the sample size is affordable — decays into an unpaired one
 * whose difference is dominated by noise nobody can attribute.
 *
 * The failure mode is not exotic. It is one `if`:
 *
 *     if (probability === 0) return false;   // never draws
 *     return nextBounded(stream, FP_ONE) < probability;
 *
 * which is a *reasonable optimisation* in ordinary play and destroys the
 * measurement under ablation, because a neutralized primitive's probability is
 * exactly zero.
 *
 * ## What is asserted, and what would break it
 *
 * Counting calls would be the tempting assertion and the weak one: it measures
 * the test's instrumentation rather than the generator. What is asserted here
 * instead is **the stream's own position** — the four PCG words after the
 * operation — because that is the thing every later draw is a function of. Two
 * arms that leave the stream in the same state cannot disagree about any
 * subsequent draw; two that do not, will.
 *
 * {@link drawsConsumed} then turns that position back into a count by advancing
 * a reference stream until it matches, so "exactly one draw" is a statement
 * about where the generator ended up and not about how many times a spy was
 * called. It would still be a decorative assertion if the wrong implementation
 * could pass it, so `shortCircuiting` below *is* the wrong implementation, and
 * the same assertions are shown failing against it.
 */

import { describe, expect, it } from 'vitest';

import {
  FP_ONE,
  cloneStream,
  deriveActorStream,
  nextBounded,
  nextUint32,
  RNG_STREAM,
} from '@mm/sim-core';
import type { Fixed, RngStream } from '@mm/sim-core';
import { loadContent, shippedContentSource } from '@mm/content';
import type { ContentRegistry, PrimitiveRecord } from '@mm/content';
import { NO_ABLATION, neutralizing, rollStackedProbability, stackMagnitudes } from '@mm/primitives';

const registry: ContentRegistry = loadContent(shippedContentSource());

function primitive(id: string): PrimitiveRecord {
  const found = registry.primitives.find((entry) => entry.record.id === id);
  if (found === undefined) {
    throw new Error(`shipped content has no primitive "${id}"`);
  }
  return found.record;
}

/** Stream 9, one thief, one tick. The registry id, never a literal. */
function theftStream(actorKey: number, tick = 41): RngStream {
  return deriveActorStream(0x5eed_1234, RNG_STREAM.knowledgeTheft, tick, actorKey);
}

function words(stream: RngStream): readonly number[] {
  return [...stream.words];
}

function samePosition(left: RngStream, right: RngStream): boolean {
  return left.words.every((word, index) => word === right.words[index]);
}

/**
 * How many draws separate two positions of the same stream.
 *
 * Implementation-independent on purpose: it advances a copy of `before` one
 * draw at a time until it reaches `after`, so the count is a property of the
 * generator's state and not of any instrumentation this file installed. A
 * position that is never reached is a position the arm did not merely take a
 * different *number* of draws to reach — it is a different stream — and that
 * throws rather than reporting a number.
 */
function drawsConsumed(before: RngStream, after: RngStream, limit = 256): number {
  const cursor = cloneStream(before);
  for (let taken = 0; taken <= limit; taken += 1) {
    if (samePosition(cursor, after)) {
      return taken;
    }
    nextUint32(cursor);
  }
  throw new Error(`the stream never reached the given position within ${String(limit)} draws`);
}

/**
 * The wrong implementation, written out so the assertions below can be shown
 * catching it. This is the shape a reasonable person writes when they are
 * thinking about ordinary play and not about paired runs.
 */
function shortCircuiting(probability: Fixed, stream: RngStream): boolean {
  if (probability === 0) {
    return false;
  }
  return nextBounded(stream, FP_ONE) < probability;
}

describe('a roll costs the same draw whether or not the primitive is neutralized', () => {
  const steal = primitive('knowledge-steal');
  const sources: readonly Fixed[] = [307, 512];

  it('leaves the stream in exactly the same position on both arms', () => {
    const control = theftStream(7);
    const ablated = theftStream(7);
    const start = theftStream(7);

    const controlRoll = rollStackedProbability(steal, sources, control);
    const ablatedRoll = rollStackedProbability(steal, sources, ablated, {
      ablation: neutralizing('knowledge-steal'),
    });

    // The property itself: same position, so every later draw on stream 9 is
    // identical between the two arms.
    expect(words(ablated)).toEqual(words(control));
    expect(drawsConsumed(start, control)).toBe(1);
    expect(drawsConsumed(start, ablated)).toBe(1);

    // And the draw that was spent is the same number, not merely the same
    // count — the ablated arm discards the result rather than redrawing it.
    expect(ablatedRoll.draw).toBe(controlRoll.draw);

    // The one thing that does differ is the outcome, which is the point.
    expect(controlRoll.probability).toBe(512);
    expect(ablatedRoll.probability).toBe(0);
    expect(ablatedRoll.succeeded).toBe(false);
  });

  it('holds over a long sequence, which is where a one-draw slip would show', () => {
    // A single roll can agree by luck. Sixty-four consecutive rolls on one
    // stream agree only if every one of them spent the same draw.
    const control = theftStream(11);
    const ablated = theftStream(11);
    const mask = neutralizing('knowledge-steal');

    const controlDraws: Fixed[] = [];
    const ablatedDraws: Fixed[] = [];
    let controlSuccesses = 0;
    for (let attempt = 0; attempt < 64; attempt += 1) {
      controlDraws.push(rollStackedProbability(steal, sources, control).draw);
      const rolled = rollStackedProbability(steal, sources, ablated, { ablation: mask });
      ablatedDraws.push(rolled.draw);
      expect(rolled.succeeded).toBe(false);
      if (controlDraws[attempt] !== undefined && (controlDraws[attempt] as Fixed) < 512) {
        controlSuccesses += 1;
      }
    }

    expect(ablatedDraws).toEqual(controlDraws);
    expect(words(ablated)).toEqual(words(control));
    expect(drawsConsumed(theftStream(11), ablated)).toBe(64);
    // Non-vacuity: the control arm actually stole sometimes, so "the ablated
    // arm never succeeds" is a difference rather than a restatement.
    expect(controlSuccesses).toBeGreaterThan(0);
  });

  it('negative control: the short-circuiting version fails these same assertions', () => {
    // Without this, every assertion above could be passing because the code
    // under test happens to be shaped the way the test imagines, rather than
    // because the assertion is capable of failing.
    const start = theftStream(7);
    const wrong = theftStream(7);
    const right = theftStream(7);

    expect(shortCircuiting(0, wrong)).toBe(false);
    rollStackedProbability(steal, sources, right, { ablation: neutralizing('knowledge-steal') });

    expect(drawsConsumed(start, wrong)).toBe(0);
    expect(drawsConsumed(start, right)).toBe(1);
    expect(words(wrong)).not.toEqual(words(right));
  });
});

describe('the draw is taken before the probability is known', () => {
  it('spends the same draw for every probability, including impossible ones', () => {
    // Structural: `rollStackedProbability` draws first and stacks second, so
    // there is no expression in which a neutralized probability could be
    // observed before the draw. Four wildly different probabilities, one draw
    // each, all the same draw.
    const concealment = primitive('concealment');
    const cases: readonly (readonly Fixed[])[] = [[], [0], [512], [FP_ONE], [FP_ONE * 4]];

    const drawn = cases.map((magnitudes) => {
      const stream = theftStream(3);
      const roll = rollStackedProbability(concealment, magnitudes, stream);
      expect(drawsConsumed(theftStream(3), stream)).toBe(1);
      return roll.draw;
    });

    expect(new Set(drawn).size).toBe(1);
  });

  it('reports the same stacked probability the stacker would have produced', () => {
    // The roll must not become a second source of stacking arithmetic. Its
    // probability is `stackMagnitudes`' value, cap and clamp included.
    const concealment = primitive('concealment');
    const magnitudes: readonly Fixed[] = [800, 800];

    const stacked = stackMagnitudes(concealment, magnitudes);
    const rolled = rollStackedProbability(concealment, magnitudes, theftStream(5));

    expect(stacked.clamped).toBe(true);
    expect(rolled.probability).toBe(stacked.value);
    expect(rolled.clamped).toBe(stacked.value < 870 ? false : true);
    expect(rolled.probability).toBe(870);
  });

  it('rolls false at probability zero and true at certainty, on the same draw', () => {
    const steal = primitive('knowledge-steal');
    const never = rollStackedProbability(steal, [], theftStream(2));
    const always = rollStackedProbability(steal, [FP_ONE], theftStream(2));

    expect(never.draw).toBe(always.draw);
    expect(never.succeeded).toBe(false);
    expect(always.succeeded).toBe(true);
  });

  it('refuses to roll against a primitive whose unit is not a probability', () => {
    // Rolling a d1024 against a damage magnitude is a category error that
    // produces a plausible boolean, so it fails here instead.
    expect(() => rollStackedProbability(primitive('direct-damage'), [512], theftStream(1))).toThrow(
      /direct-damage/,
    );
    expect(() => rollStackedProbability(primitive('direct-damage'), [512], theftStream(1))).toThrow(
      /probability/i,
    );
  });

  it('defaults to the control arm, so an unablated caller is unaffected', () => {
    const steal = primitive('knowledge-steal');
    const implicit = rollStackedProbability(steal, [512], theftStream(9));
    const explicit = rollStackedProbability(steal, [512], theftStream(9), {
      ablation: NO_ABLATION,
    });
    expect(implicit).toEqual(explicit);
  });
});
