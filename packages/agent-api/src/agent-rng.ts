/*
 * Multiverse Mages — the agent-side generator, outside the §6 stream registry.
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
 * Randomness for the *caller*, derived from `(runSeed, agentSlotIndex,
 * strategyId)` and reachable from no subsystem stream.
 *
 * ## Why this is not stream 11
 *
 * `agent-interface`'s design note rejects that option in as many words:
 *
 * > *Alternative considered:* appending a stream ID 11 "agent policy" to the
 * > registry. Rejected — registry streams are per-*simulation-subsystem* and are
 * > consumed inside `step`; a bot lives outside `step` by construction, and
 * > putting a caller-side concern in the registry would blur the one boundary
 * > that keeps stream semantics comprehensible.
 *
 * And the consequence of getting it wrong is the expensive kind: `contracts.md`
 * §6 makes every stream id permanent because *"an ID is baked into every
 * committed Monte Carlo balance baseline"*. A bot drawing from stream 7 would
 * mean that adding a strategy to the tournament pool re-rolled every mage's
 * autonomy tie-break in every run — invalidating baselines that have nothing to
 * do with bots, with no test failing anywhere.
 *
 * ## What "structurally unable to reference a stream id" means here
 *
 * {@link AgentRng} has three members and none of them takes a subsystem id.
 * There is no `stream`, no `actorStream`, no `rootSeed`, and no escape hatch
 * returning the underlying cursor — so a bot cannot name a registry stream even
 * by accident, and a reviewer does not have to check whether it did.
 *
 * The other half is that this module imports **no part of the registry**: not
 * `RNG_STREAM`, not `deriveStream`, not `deriveActorStream`. It reaches only for
 * PCG itself, and derives its own increment from text that begins with a prefix
 * no subsystem derivation uses. Two generators built on the same PCG are not
 * two positions in one sequence; they are different streams, which is the
 * property §6 relies on everywhere else.
 *
 * ## Draws are reproducible, and forks are order-independent
 *
 * {@link AgentRng.fork} derives a child from the parent's coordinates plus a
 * label, not from the parent's current position. So a strategy that later grows
 * a second use of randomness does not shift the first one's numbers — the same
 * argument §6 makes for re-deriving a subsystem stream per tick rather than
 * carrying it forward, applied one layer out.
 */

import type { RngStream } from '@mm/sim-core';
import { hashBytes, nextBounded, nextUint32, streamFromWords } from '@mm/sim-core';

/** Randomness an agent may use. Nothing here names a simulation subsystem. */
export interface AgentRng {
  /** One unsigned 32-bit draw. */
  nextUint32(): number;
  /** One draw in `[0, bound)`, rejection-sampled so the range is unbiased. */
  nextBelow(bound: number): number;
  /**
   * A child generator for one named use.
   *
   * A pure function of this generator's coordinates and the label, so forking
   * order does not matter and adding a fork does not disturb an existing one.
   */
  fork(label: string): AgentRng;
}

/** The three coordinates an agent generator is derived from. */
export interface AgentRngInput {
  /** The episode's seed. Unsigned 32-bit, as `sim-core` requires of a root seed. */
  readonly runSeed: number;
  /** Which agent slot this is — the mirrored-pair index a tournament assigns. */
  readonly agentSlotIndex: number;
  /** The strategy's stable identifier. ASCII, non-empty. */
  readonly strategyId: string;
}

/**
 * The derivation's namespace prefix.
 *
 * Present so that the text hashed here can never coincide with anything else
 * hashed with the same function, and versioned so that changing the derivation
 * is a visible act rather than a silent re-seed of every recorded tournament.
 */
const AGENT_DOMAIN = 'mm-agent-rng/1';

const UINT32_COUNT = 4294967296;

function assertUint32(value: number, role: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= UINT32_COUNT) {
    throw new RangeError(
      `${role} must be an integer in [0, 4294967295]; received ${String(value)}. Agent randomness ` +
        'is reproducible from its coordinates or it is not reproducible at all.',
    );
  }
}

function assertLabel(value: string, role: string): void {
  if (value.length === 0) {
    throw new RangeError(
      `${role} must not be empty. It is part of the derivation, and an empty one would make two ` +
        'differently-named uses draw the same numbers.',
    );
  }
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0x7f) {
      throw new RangeError(
        `${role} must be ASCII; "${value}" is not. A derivation whose bytes depend on a text ` +
          'encoding is one two implementations can disagree about, and the Python bridge is the ' +
          'implementation most likely to disagree.',
      );
    }
  }
}

/**
 * One coordinate field, with the delimiter made unmistakable.
 *
 * `/` separates the fields of the coordinate string, and it used to be permitted
 * *inside* one, so two structurally different generators flattened to the same
 * text and drew byte-identical sequences:
 *
 * ```
 * agentRng(…, strategyId: 'greedy').fork('explore')
 * agentRng(…, strategyId: 'greedy/fork/explore')
 *   → both 'mm-agent-rng/1/7/0/greedy/fork/explore'
 * ```
 *
 * and likewise `fork('a').fork('b')` against `fork('a/fork/b')`. That is the
 * coincidence {@link assertLabel} refuses an empty label for, reached by another
 * route, so permitting it was an inconsistency rather than a considered
 * tradeoff. A tournament running `greedy` with an `explore` fork alongside a
 * strategy registered as `greedy/fork/explore` would have got two arms that are
 * not independent, with nothing anywhere reporting it.
 *
 * Escaping rather than banning `/` outright. A ban is one line shorter and
 * refuses a strategy id that is not otherwise illegal — a caller who names a
 * strategy after a path has done nothing wrong, and the derivation, not the
 * caller, is what was ambiguous. `%` is escaped first so the escape is itself
 * unambiguous, which makes the mapping injective: an escaped field contains no
 * `/` at all, so the coordinate string splits uniquely back into
 * `(runSeed, agentSlotIndex, strategyId)` and its fork path.
 *
 * **This does not re-seed anything.** A field containing neither `%` nor `/`
 * escapes to itself, and no id or label in this repository contains either, so
 * every derivation that has ever been drawn is byte-identical to what it was.
 * The only coordinates whose numbers move are the ones that were ambiguous, and
 * a number drawn from an ambiguous coordinate was not reproducible in the sense
 * §6 means anyway. That is why {@link AGENT_DOMAIN} does not move: the domain
 * version exists so that a *silent re-seed of every recorded tournament* is
 * impossible, and there is no re-seed here to be silent about.
 */
function escapeField(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('/', '%2F');
}

/** ASCII bytes. See `digest.ts` for why `TextEncoder` is avoided. */
function asciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index);
  }
  return bytes;
}

/** The two 32-bit halves of `hashBytes`' 64-bit digest of `text`. */
function halvesOf(text: string): [number, number] {
  const digest = hashBytes(asciiBytes(text));
  return [Number.parseInt(digest.slice(0, 8), 16), Number.parseInt(digest.slice(8, 16), 16)];
}

/**
 * The four PCG words for one agent coordinate string.
 *
 * Two hashes rather than one, because a stream needs 128 bits of derivation —
 * 64 of state and 64 of increment — and taking the increment from the same 64
 * bits as the state would make the two correlated. The `/state` and `/inc`
 * suffixes are what make them two different hashes of the same coordinates.
 */
function wordsFor(coordinates: string): RngStream {
  const [stateHi, stateLo] = halvesOf(`${coordinates}/state`);
  const [incHi, incLo] = halvesOf(`${coordinates}/inc`);
  return streamFromWords(stateHi, stateLo, incHi, incLo);
}

/** An {@link AgentRng} over one derived cursor. */
function generatorOver(coordinates: string): AgentRng {
  const cursor = wordsFor(coordinates);
  return {
    nextUint32(): number {
      return nextUint32(cursor);
    },
    nextBelow(bound: number): number {
      return nextBounded(cursor, bound);
    },
    fork(label: string): AgentRng {
      assertLabel(label, 'A fork label');
      return generatorOver(`${coordinates}/fork/${escapeField(label)}`);
    },
  };
}

/**
 * Builds an agent's generator.
 *
 * @throws RangeError naming the offending coordinate. Validation happens here,
 * once, for the reason `rngFromRootSeed` gives for the same choice: a bad seed
 * is a setup error, and a setup error discovered mid-episode looks like a bug in
 * the strategy.
 */
export function agentRng(input: AgentRngInput): AgentRng {
  assertUint32(input.runSeed, 'runSeed');
  assertUint32(input.agentSlotIndex, 'agentSlotIndex');
  assertLabel(input.strategyId, 'strategyId');
  return generatorOver(
    `${AGENT_DOMAIN}/${String(input.runSeed)}/${String(input.agentSlotIndex)}/` +
      escapeField(input.strategyId),
  );
}
