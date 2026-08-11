/*
 * Multiverse Mages — boundary normalization: the one place floats are permitted.
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
 * # This file contains the only floating-point arithmetic in the simulation.
 *
 * That is not an exception being taken; it is the contract.
 * `docs/design/contracts.md` §4.1:
 *
 * > The core emits integers; **normalization happens in the agent-api layer,
 * > which is the one place floats are permitted** on the way out.
 * >
 * > **Exported type is pinned:** `Float64Array`, values in `[0, 1]`, with
 * > `fp(1024)` mapping to `1.0`. Every trained policy depends on this, so it is
 * > a contract, not an implementation detail.
 *
 * ## Why the boundary is *here*, and not one layer in or one layer out
 *
 * **Not further in.** `CLAUDE.md`'s first non-negotiable constraint is that the
 * rules path has no floating-point arithmetic, because IEEE-754 addition is not
 * associative and its results depend on evaluation order and, for some
 * operations, on the platform. Two peers in a lockstep PvP match that disagree
 * in the last bit of a damage roll desync, and every committed Monte Carlo
 * baseline becomes irreproducible. A float that reached the rules would do that
 * silently. So the entire simulation — `sim-core`, `state`, `primitives`, every
 * `rules-*` package, and `./observation.ts` next door — is integer-only, and
 * `eslint.config.mjs` enforces it with a ban on decimal literals and on all but
 * six members of `Math`. This package is outside that glob, and the config says
 * why in as many words.
 *
 * **Not further out.** The consumer is a neural network, which needs bounded
 * real inputs. If normalization lived in the RL bridge, the Monte Carlo
 * harness, and the renderer, there would be three of it, and §4.1's promise
 * that a policy's inputs mean a fixed thing would depend on three
 * implementations agreeing about `worshipTier`'s divisor. One float boundary,
 * crossed once, in a package nothing in the rules path may import (§5 rule 4).
 *
 * ## Every division here is exact-enough, and none of it feeds back
 *
 * The output goes to a policy and to a renderer. It is never read back into
 * state, never compared for equality against another run's, and never
 * serialized into a snapshot. So the usual objection to floats — that two
 * machines might disagree — has no consequence here: the integer vector
 * upstream is the reproducible artefact, and it is what a golden fixture would
 * pin.
 */

import type { NormalizationDescriptor } from './layout.js';
import { OBSERVATION_DESCRIPTORS, OBSERVATION_SIZE, descriptorAt } from './layout.js';

/** The clamp half of every descriptor. */
function clamp(value: number, descriptor: NormalizationDescriptor): number {
  if (!(value > descriptor.min)) return descriptor.min; // also catches NaN and -0
  if (value > descriptor.max) return descriptor.max;
  return value;
}

/**
 * How many of a descriptor's edges a count has reached.
 *
 * A linear scan rather than a binary search. The lists are short — a channel
 * spanning more than a dozen orders of magnitude is a channel that should have
 * been two — and a scan is the version whose correctness is obvious at the one
 * place it matters, the boundary between two buckets.
 *
 * The stop condition is `!(value >= edge)` and not `value < edge`, for the same
 * reason {@link clamp} is written `!(value > min)`: every comparison against
 * `NaN` is false, so `value < edge` never stopped the scan, `reached` ran to
 * `edges.length`, and the quotient was exactly `1`. A `NaN` count therefore read
 * as a *saturated* channel under this rule while the other four floored it — and
 * saturation is the loudest signal a channel can send, so a corrupt count was
 * being reported as "this universe is at the ceiling" rather than "this universe
 * has none of that". The negated form floors it, which is what the other four
 * rules do and what `clamp`'s own trailing comment says the boundary intends.
 */
function bucketOf(value: number, edges: readonly number[]): number {
  let reached = 0;
  for (const edge of edges) {
    if (!(value >= edge)) break;
    reached += 1;
  }
  return reached;
}

/**
 * Applies one descriptor's rule, then clamps.
 *
 * The clamp is not a safety net around a divisor that is nearly right — it is
 * half the descriptor. §4.1 wants a quantity whose range later grows to
 * *saturate* rather than to rescale everything that came before, and clamping
 * is what saturation is. A universe that somehow accumulated twice the pinned
 * cohort scale reads `1.0`, which is honest, rather than `2.0`, which is
 * outside the pinned range and would put a trained policy's input distribution
 * somewhere it has never been.
 *
 * The switch is exhaustive over the five rules and has no `default`. That is
 * deliberate: adding a sixth rule to `NORMALIZATION_RULES` without teaching this
 * function what it means should fail the typecheck, not fall through to a
 * plausible-looking division.
 */
export function applyDescriptor(value: number, descriptor: NormalizationDescriptor): number {
  switch (descriptor.rule) {
    case 'ratio':
    case 'bounded':
      // One arm for two rules, and that is the honest shape: `bounded` *is* a
      // ratio whose constant §4.1 fixes at `fp(1024)` and forbids anyone from
      // choosing. They differ in what they promise, not in what they compute,
      // which is why the layout digest records the rule separately.
      return clamp(value / descriptor.divisor, descriptor);
    case 'log-bucket': {
      const edges = descriptor.edges;
      if (edges === undefined || edges.length === 0) {
        throw new RangeError(
          'A log-bucket descriptor reached the exporter with no edges. `layoutProblems` rejects ' +
            'this at load, so arriving here means the descriptor bypassed the table.',
        );
      }
      return clamp(bucketOf(value, edges) / edges.length, descriptor);
    }
    case 'flag':
      return value > 0 ? descriptor.max : descriptor.min;
    case 'identity':
      return clamp(value, descriptor);
  }
}

/**
 * §4.1's exported observation: `Float64Array`, every value in `[0, 1]`.
 *
 * @param raw - An integer observation from `rawObservation`.
 * @throws RangeError if the input is not {@link OBSERVATION_SIZE} long. A
 * silently-truncated or zero-padded vector is the failure this catches: it
 * would produce a perfectly usable `Float64Array` in which every channel past
 * the mistake belongs to a different quantity than the policy believes.
 */
export function normalizedObservation(raw: Int32Array): Float64Array {
  if (raw.length !== OBSERVATION_SIZE) {
    throw new RangeError(
      `Observation is ${String(raw.length)} channels but contracts.md §4.1 fixes it at ` +
        `${OBSERVATION_SIZE}. The shape is constant across runs, across universes, and across ` +
        'both clock modes; a different length is a layout mismatch, not a smaller universe.',
    );
  }

  const out = new Float64Array(OBSERVATION_SIZE);
  for (let index = 0; index < OBSERVATION_SIZE; index += 1) {
    // `OBSERVATION_DESCRIPTORS` is built with exactly one entry per channel and
    // frozen at module load, so this index is in range by construction; the
    // assertion below keeps `noUncheckedIndexedAccess` honest without a branch
    // in the hot loop.
    const descriptor = OBSERVATION_DESCRIPTORS[index] as NormalizationDescriptor;
    out[index] = applyDescriptor(raw[index] as number, descriptor);
  }
  return out;
}

/** The descriptor governing one channel — re-exported so callers need one import. */
export { descriptorAt };
