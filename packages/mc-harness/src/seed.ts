/*
 * Multiverse Mages — deterministic run-seed derivation for Monte Carlo sweeps.
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
 * Task 3.3. A run's seed is a **pure function of its coordinates** —
 * `(rootSeed, sweepId, cellIndex, replicateIndex)` — and of nothing else.
 *
 * ## Why derivation rather than dealing
 *
 * The obvious harness deals seeds from a master generator as workers become
 * free. It is three lines shorter and it makes every number the project ever
 * publishes a function of scheduling. Two executions of one sweep on differently
 * loaded machines would then disagree, by a fraction of a percent, months later,
 * with nothing in the failure pointing at the cause. `design.md` names this the
 * defect the whole change exists to avoid.
 *
 * Derivation also buys the property the reproduction CLI needs: a result record
 * carries its four coordinates, so **one run can be re-executed alone**, in the
 * main thread, with a debugger attached, without replaying the sweep that
 * produced it. Nothing about the sweep's size, its worker count, or the runs
 * that preceded it is an input.
 *
 * ## The construction, and why it is shaped this way
 *
 * ```text
 * base    = mix32(rootSeed, fnv1a32(utf8(sweepId)))      // full avalanche
 * runKey  = cellIndex * 65536 + replicateIndex           // injective pairing
 * runSeed = (base + runKey * KEY_ODD) mod 2^32           // bijection on runKey
 * ```
 *
 * The last line is the load-bearing one. Multiplication by an odd constant is a
 * *bijection* modulo 2^32, and adding a constant is a bijection, so distinct
 * `runKey`s give distinct seeds — always, not with high probability. That
 * matters because the capability spec requires that a sweep of 20 cells and 50
 * replicates yield 1000 **pairwise distinct** seeds, and a plain hash cannot
 * promise it: at 1000 draws from a 32-bit space the birthday collision
 * probability is about one in ten thousand, which is a test that passes for
 * years and then fails on someone's release branch.
 *
 * The price is that neighbouring runs get seeds a fixed stride apart rather than
 * seeds that look independent. That is deliberate, and it is safe *here*
 * specifically: `sim-core`'s `deriveStream` opens every subsystem stream with
 * `fmix32(salt ^ rootSeed)`, a full 32-bit avalanche, so two run seeds differing
 * by one produce uncorrelated streams. Decorrelation is delegated to the layer
 * that already owns it rather than re-implemented in a layer that would then own
 * it twice. See the known-answer test, which pins both properties.
 *
 * ## What is deliberately *not* mixed in
 *
 * The replicate count. The spec fixes the derivation's arity at four, and
 * folding in "how many replicates this sweep declares" would mean that adding a
 * 51st replicate re-seeded the first fifty — silently invalidating every
 * baseline taken from the sweep while every test still passed.
 *
 * ## Stability
 *
 * {@link SEED_DERIVATION_VERSION} is recorded in every result record. This
 * function's output is frozen: changing it is not a refactor, it is a new
 * experiment, and the version is how a reader years later can tell which one
 * they are holding.
 */

/** 2^32, the size of the seed space — not a bit-width constant. */
const UINT32_COUNT = 4294967296;

/**
 * Bumped only when the mapping below changes. Recorded in every run record so a
 * stored seed can be checked against the derivation that claims to produce it.
 */
export const SEED_DERIVATION_VERSION = 1;

/**
 * Bits reserved for the replicate index inside the injective pairing, and the
 * bounds that keeps the pairing injective inside 32 bits.
 *
 * 65536 cells × 65536 replicates is 4.3 billion runs — four orders of magnitude
 * past the ten-thousand-run reference sweep, and the bound is enforced rather
 * than assumed because silently wrapping would collapse two runs onto one seed.
 */
export const REPLICATE_INDEX_BITS = 16;
/** Largest `cellIndex` the pairing can carry. */
export const MAX_CELL_INDEX = 65535;
/** Largest `replicateIndex` the pairing can carry. */
export const MAX_REPLICATE_INDEX = 65535;

/**
 * The odd stride. 2^32 / golden ratio — the same constant `sim-core`'s mixer
 * uses to keep inputs from cancelling, chosen here for the one property that
 * matters: it is odd, so `x -> x * KEY_ODD mod 2^32` is a bijection.
 */
const KEY_ODD = 0x9e3779b1;

/** FNV-1a's 32-bit offset basis and prime. */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Murmur3's 32-bit finalizer: full avalanche, integer-only. */
function fmix32(value: number): number {
  let h = value >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

/**
 * FNV-1a over the **UTF-8 bytes** of a string.
 *
 * Bytes rather than UTF-16 code units on purpose. `sweepId` is authored in a
 * committed file and read back by other tools — possibly not JavaScript ones —
 * and hashing code units would make the derivation depend on JavaScript's
 * internal string representation rather than on the text. A sweep named with a
 * non-ASCII character would then be irreproducible outside Node, which is
 * exactly the class of defect the "stable across processes and machines"
 * requirement is about.
 */
export function fnv1a32(text: string): number {
  const bytes = new TextEncoder().encode(text);
  let hash = FNV_OFFSET;
  for (const byte of bytes) {
    hash = Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** Two rounds of avalanche over the pair, so neither input can dominate. */
function mix32(a: number, b: number): number {
  let h = fmix32((a ^ Math.imul(b, KEY_ODD)) >>> 0);
  h = fmix32((h ^ Math.imul(a, FNV_PRIME)) >>> 0);
  return h >>> 0;
}

/** The four inputs a run seed is derived from. Recorded verbatim in every record. */
export interface RunCoordinates {
  /** The sweep's root seed. Unsigned 32-bit. */
  readonly rootSeed: number;
  /** The sweep's stable identifier, as written in its committed sweep file. */
  readonly sweepId: string;
  /** Index of the parameter cell in the sweep's canonical factorial expansion. */
  readonly cellIndex: number;
  /** Index of the replicate within that cell. */
  readonly replicateIndex: number;
}

function assertUint32(value: number, role: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= UINT32_COUNT) {
    throw new RangeError(`${role} must be an integer in [0, 4294967295], received ${String(value)}`);
  }
}

function assertBounded(value: number, max: number, role: string): void {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new RangeError(
      `${role} must be an integer in [0, ${String(max)}], received ${String(value)}. Beyond that ` +
        'the injective pairing in deriveRunSeed would wrap and two runs would share a seed.',
    );
  }
}

/**
 * Derives one run's seed from its four coordinates.
 *
 * @throws RangeError if `rootSeed` is not an unsigned 32-bit integer, if
 * `sweepId` is empty, or if either index is outside the pairing's bounds.
 */
export function deriveRunSeed(coordinates: RunCoordinates): number {
  const { rootSeed, sweepId, cellIndex, replicateIndex } = coordinates;
  assertUint32(rootSeed, 'rootSeed');
  if (sweepId.length === 0) {
    throw new RangeError('sweepId must be a non-empty string — it is part of the seed derivation.');
  }
  assertBounded(cellIndex, MAX_CELL_INDEX, 'cellIndex');
  assertBounded(replicateIndex, MAX_REPLICATE_INDEX, 'replicateIndex');

  const base = mix32(rootSeed, fnv1a32(sweepId));
  const runKey = (cellIndex * (1 << REPLICATE_INDEX_BITS) + replicateIndex) >>> 0;
  return (base + Math.imul(runKey, KEY_ODD)) >>> 0;
}

/**
 * True when `seed` is what {@link deriveRunSeed} produces for `coordinates`.
 *
 * The harness calls this on every record it writes and the reproduction CLI
 * calls it on every record it reads. A record whose stored seed disagrees with
 * its own coordinates is not a record of anything: either the derivation
 * changed under it, or the file was edited. Both are worth refusing loudly, and
 * neither is visible without an explicit check.
 */
export function seedMatchesCoordinates(coordinates: RunCoordinates, seed: number): boolean {
  return deriveRunSeed(coordinates) === seed;
}
