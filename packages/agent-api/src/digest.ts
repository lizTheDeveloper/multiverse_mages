/*
 * Multiverse Mages — the observation layout digest, and the table it is taken over.
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
 * What a baseline records so it can refuse to compare itself against a build
 * whose observation means something else.
 *
 * `agent-interface`'s design note states the failure this exists to prevent:
 *
 * > *Alternative considered:* comparing only the vector length. Rejected — the
 * > shape is fixed by `core-contracts` and will rarely change length, while a
 * > saturation constant or a block reordering changes meaning without changing
 * > length. Length equality is exactly the check that would pass while being
 * > wrong.
 *
 * ## What the digest covers
 *
 * Every slot's **block**, its **index** both globally and within its block, its
 * **rule**, its **saturation constant**, its clamp, and — for a `log-bucket`
 * channel — its **edge list**. Slot count follows from the table having one line
 * per slot, so a vector that grew or shrank changes the digest too.
 *
 * The edge list is in there for the same reason the rule is: two bucket lists
 * can share a top edge and therefore a saturation constant while cutting the
 * range at completely different places, and the exported values would differ on
 * nearly every input.
 *
 * ## What the digest deliberately does not cover
 *
 * - **{@link OBSERVATION_SCHEMA_VERSION}.** The version is a human's statement
 *   that the interface changed; the digest is a machine's. Folding one into the
 *   other would mean a version bump alone made two identical layouts compare as
 *   different, and a baseline would be invalidated by an edit to a comment. They
 *   travel together — a session publishes both — and they answer different
 *   questions.
 * - **The encoder.** Nothing here reads `observation.ts`. A change to *which
 *   quantity* a slot is filled from — say, the institutions block counting
 *   founded universities rather than completed ones — moves every number in that
 *   channel and leaves this digest untouched. That is a real gap and it is
 *   stated rather than papered over: the digest certifies the *layout*, and the
 *   encoder's behaviour is certified by the golden replay fixtures and by
 *   `observation-content.test.ts`, which pin actual values.
 * - **The action space.** §4.2's table is a separate contract with a separate
 *   permanence rule, and a policy's output layer is not its input layer.
 *
 * That list is meant to be exhaustive, and for a while it was not. A fourth gap
 * existed and went unstated: `-0 !== 0` is `false`, so a descriptor declaring a
 * floor of negative zero passed {@link layoutProblems}, and `String(-0)` is
 * `"0"`, so it hashed identically to a `+0` table — while `clamp` returns the
 * floor by identity, so the two tables exported different `Float64Array`
 * contents. Two validated layouts, one digest, different vectors, against a
 * capability scenario that names *"no negative zero"* in as many words. Both
 * halves are closed below — validation rejects a floor that is not `+0`, and the
 * encoding renders the sign of a zero rather than dropping it — and the gap is
 * recorded here rather than deleted, because a list of stated gaps is only worth
 * anything if somebody has tried to find an unstated one.
 *
 * ## Why FNV-1a, and why `sim-core`'s
 *
 * `hashBytes` is already the project's specified content hash: 64-bit FNV-1a,
 * argued in `sim-core/src/snapshot/hash.ts` down to why every intermediate stays
 * exact in a double. Every property that argument establishes is one this digest
 * needs — determinism across engines, a fixed printable width, and a definition
 * a second implementation can follow from the document rather than from the
 * source. Writing a second hash here would be a second thing to specify and a
 * second thing to get subtly wrong.
 */

import { hashBytes } from '@mm/sim-core';

import type {
  NormalizationDescriptor,
  NormalizationRule,
  ObservationBlockName,
} from './layout.js';
import {
  NORMALIZATION_RULES,
  OBSERVATION_BLOCKS,
  OBSERVATION_BLOCK_NAMES,
  OBSERVATION_DESCRIPTORS,
  OBSERVATION_SIZE,
} from './layout.js';

/**
 * The version of the observation *interface*, bumped by hand.
 *
 * Distinct from the digest in the way a SemVer MAJOR is distinct from a content
 * hash: the digest says *something changed*, and this says *what a consumer
 * should do about it*. A baseline, a recorded sweep, or a trained policy records
 * both; the gate refuses a digest mismatch outright, and a version mismatch is
 * how a consumer knows whether the refusal was expected.
 *
 * `1` for 0.5.0, the release that first published either.
 */
export const OBSERVATION_SCHEMA_VERSION = 1;

/** One channel of the observation, as the digest sees it. */
export interface ObservationSlot {
  /** Position in the vector, `0..OBSERVATION_SIZE - 1`. */
  readonly index: number;
  /** The §4.1 block this channel belongs to. */
  readonly block: ObservationBlockName;
  /** Position within that block. */
  readonly blockIndex: number;
  /** How this channel's integer becomes a number in `[0, 1]`. */
  readonly descriptor: NormalizationDescriptor;
}

function buildSlots(): readonly ObservationSlot[] {
  const slots: ObservationSlot[] = [];
  for (const block of OBSERVATION_BLOCKS) {
    for (let offset = 0; offset < block.size; offset += 1) {
      slots.push(
        Object.freeze({
          index: block.offset + offset,
          block: block.name,
          blockIndex: offset,
          descriptor: block.descriptors[offset] as NormalizationDescriptor,
        }),
      );
    }
  }
  return Object.freeze(slots);
}

/** Every channel, in vector order. The digest's input and validation's subject. */
export const OBSERVATION_SLOTS: readonly ObservationSlot[] = buildSlots();

// ---------------------------------------------------------------------------
// Validation.
// ---------------------------------------------------------------------------

const RULE_SET: ReadonlySet<string> = new Set<string>(NORMALIZATION_RULES);
const BLOCK_SET: ReadonlySet<string> = new Set<string>(OBSERVATION_BLOCK_NAMES);

/** Where each §4.1 block starts, for checking a slot's position within it. */
const BLOCK_OFFSET: ReadonlyMap<string, number> = new Map(
  OBSERVATION_BLOCKS.map((block) => [block.name as string, block.offset]),
);

/**
 * Whether a field is an own data property — a value, not an accessor.
 *
 * `Object.freeze` seals a getter without making it constant, so this is what
 * separates a descriptor that *holds* a saturation constant from one that
 * *computes* one on each read.
 */
function isDataProperty(subject: object, field: string): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(subject, field);
  return descriptor !== undefined && 'value' in descriptor;
}

/**
 * Every way a descriptor table fails the `agent-api` capability, as readable
 * lines naming the offending slot.
 *
 * Returns a list rather than throwing on the first problem, for the reason
 * `module-boundaries.test.ts` gives for the same choice: a check that reports
 * one fault per run turns a table with three faults into three cycles, and the
 * third is where somebody deletes the check.
 *
 * ## What "not a compile-time constant" can actually be checked
 *
 * The spec's fourth scenario — *"a descriptor declares a saturation constant
 * that is not a compile-time constant"* — describes a property of how a number
 * was **produced**, and no runtime inspection can see that. What is checkable is
 * the shape such a number takes when it arrives, and every one of those is
 * rejected here:
 *
 * - It is **not a positive safe integer**. A denominator fitted to observed data
 *   is a mean, a maximum over floats, or a quantile, and all three land outside
 *   the integers sooner or later.
 * - Its descriptor is **not frozen**. This is the load-bearing one. A run-relative
 *   denominator has to be *stored*, and the descriptor is the only place it could
 *   go without changing the type — so a mutable descriptor is the shape the
 *   forbidden design has, whether or not anyone has written to it yet.
 * - Its **clamp is not `[0, 1]`**, which would let a channel export outside the
 *   pinned range whatever its constant said.
 * - Its numeric fields are **not own data properties**. `Object.freeze` makes an
 *   accessor non-configurable; it does not make it constant. A frozen descriptor
 *   whose `divisor` is a getter returning `1024` the first time and `4`
 *   thereafter passes the frozen check, publishes one constant to the digest,
 *   and divides by another in the exporter — within one process, with nothing
 *   able to notice. That is a sharper version of the caveat below and not the
 *   same thing as it, so it is checked rather than caveated.
 *
 * This is still a tripwire rather than a proof, in the same sense the
 * inline-stacking lint is one: a determined author can freeze a data property
 * whose value came from a measurement, and no runtime inspection can see where a
 * number came from. What it buys is that every obvious way to write the mistake
 * — and the one non-obvious way somebody actually found — fails at import.
 *
 * ## `blockIndex` is checked against the block it names
 *
 * Nothing validated it, while the digest hashes it. A table could therefore
 * declare every slot's `blockIndex` as `0`, validate with no problems, and
 * publish a digest describing a layout that does not exist. That matters
 * concretely rather than theoretically: this module's own argument for FNV-1a is
 * that a second implementation must be able to reproduce the encoding *"from the
 * document rather than from the source"*, and a Python bridge deriving
 * `blockIndex` the documented way — position within the block — would compute a
 * different digest for the same table and refuse a comparison that should have
 * been allowed.
 *
 * No contract sentence pins the column's derivation, so this is a judgement:
 * `ObservationSlot.blockIndex` is documented as *"Position within that block"*,
 * that is a derivation and not a free field, and a validator that already
 * anchors the table to `OBSERVATION_SIZE` and to §4.1's block names is not
 * overreaching by anchoring it to their offsets too.
 */
export function layoutProblems(slots: readonly ObservationSlot[]): string[] {
  if (slots.length !== OBSERVATION_SIZE) {
    // Reported alone. A table of the wrong length usually also disagrees about
    // every index after the fault, and several hundred consequential lines
    // would bury the one that says what happened.
    return [
      `The descriptor table has ${String(slots.length)} slots but contracts.md §4.1 fixes the ` +
        `observation at ${String(OBSERVATION_SIZE)}. Every slot must have a descriptor and every ` +
        'descriptor a slot; a table of another length means one of them is missing.',
    ];
  }

  const problems: string[] = [];
  const say = (slot: ObservationSlot | undefined, position: number, message: string): void => {
    const block = slot === undefined ? 'unknown block' : slot.block;
    problems.push(`slot ${String(position)} (${block}): ${message}`);
  };

  for (let position = 0; position < slots.length; position += 1) {
    const slot = slots[position];
    if (slot === undefined) {
      say(undefined, position, 'has no entry in the descriptor table.');
      continue;
    }
    if (slot.index !== position) {
      say(
        slot,
        position,
        `declares index ${String(slot.index)} while sitting at position ${String(position)}. The ` +
          'index is what a policy and a baseline address the channel by, so the two must agree.',
      );
    }
    if (!BLOCK_SET.has(slot.block)) {
      say(slot, position, `names block "${String(slot.block)}", which contracts.md §4.1 does not.`);
    }
    if (!Number.isSafeInteger(slot.blockIndex) || slot.blockIndex < 0) {
      say(slot, position, `declares a block index of ${String(slot.blockIndex)}.`);
    } else {
      const offset = BLOCK_OFFSET.get(slot.block);
      if (offset !== undefined && slot.blockIndex !== position - offset) {
        say(
          slot,
          position,
          `declares block index ${String(slot.blockIndex)} while sitting ${String(
            position - offset,
          )} channels into ${slot.block}. The column is a derivation, not a free field, and the ` +
            'digest hashes it — a table that disagrees with itself here validates clean and ' +
            'publishes a digest describing a layout that does not exist.',
        );
      }
    }

    const descriptor = slot.descriptor as NormalizationDescriptor | undefined;
    if (descriptor === undefined || descriptor === null) {
      say(slot, position, 'has no normalization descriptor. Every slot declares its own rule.');
      continue;
    }
    if (!Object.isFrozen(descriptor)) {
      say(
        slot,
        position,
        'has a descriptor that is not frozen. A run-relative denominator has to be stored ' +
          'somewhere, and a mutable descriptor is the only place it fits — so a descriptor that ' +
          'can be written to is the shape contracts.md §4.1 forbids, written or not.',
      );
    }
    const accessors = ['divisor', 'min', 'max'].filter(
      (field) => !isDataProperty(descriptor, field),
    );
    if (accessors.length > 0) {
      say(
        slot,
        position,
        `computes ${accessors.join(', ')} rather than holding it. Object.freeze seals an accessor ` +
          'without making it constant, so such a descriptor can publish one saturation constant ' +
          'to the digest and divide by another in the exporter, inside one process.',
      );
    }
    if (!RULE_SET.has(descriptor.rule)) {
      say(
        slot,
        position,
        `declares rule "${String(descriptor.rule)}", which is not one of ` +
          `${NORMALIZATION_RULES.join(', ')}.`,
      );
    }
    if (!Number.isSafeInteger(descriptor.divisor) || descriptor.divisor < 1) {
      say(
        slot,
        position,
        `declares a saturation constant of ${String(descriptor.divisor)}. It must be a positive ` +
          'integer literal: a fractional or unsafe value is what a denominator fitted to observed ' +
          'data looks like, and such a denominator makes the same world state mean two different ' +
          'things in two different runs.',
      );
    }
    // `Object.is` and not `!==` on the floor. `-0 !== 0` is `false`, so a
    // negative-zero floor passed this check, hashed as `"0"`, and exported `-0`
    // — the capability spec names negative zero as a thing the export must not
    // contain, so that was a difference the contract cares about slipping
    // through the one function whose job is to notice.
    if (!Object.is(descriptor.min, 0) || descriptor.max !== 1) {
      say(
        slot,
        position,
        `clamps to [${numberText(descriptor.min)}, ${numberText(descriptor.max)}] rather than ` +
          '[0, 1], which §4.1 pins for the exported vector.',
      );
    }

    const edgeProblem = edgeProblemOf(descriptor);
    if (edgeProblem !== undefined) say(slot, position, edgeProblem);
  }

  return problems;
}

/** What is wrong with a descriptor's edge list, if anything. */
function edgeProblemOf(descriptor: NormalizationDescriptor): string | undefined {
  const { rule, edges } = descriptor;
  if (rule !== 'log-bucket') {
    if (edges !== undefined) {
      return `declares bucket edges but its rule is "${rule}", which does not use them.`;
    }
    return undefined;
  }
  if (edges === undefined || edges.length === 0) {
    return 'declares rule "log-bucket" but no edge list. Without edges there is nothing to divide ' +
      'the range at, and the channel would be constant.';
  }
  let previous = 0;
  for (const edge of edges) {
    if (!Number.isSafeInteger(edge) || edge <= previous) {
      return `declares bucket edges [${edges.join(', ')}], which are not strictly increasing ` +
        'positive integers. A non-monotonic edge list means a larger count can export a smaller ' +
        'number.';
    }
    previous = edge;
  }
  if (previous !== descriptor.divisor) {
    return `declares a saturation constant of ${String(descriptor.divisor)} but a top bucket edge ` +
      `of ${String(previous)}. For a log-bucket channel the top edge is the value that reads 1.0, ` +
      'so the two are the same number and disagreeing about it means one of them is not read.';
  }
  return undefined;
}

/** Throws if the table is invalid, naming every offending slot at once. */
export function assertLayoutValid(slots: readonly ObservationSlot[]): void {
  const problems = layoutProblems(slots);
  if (problems.length > 0) {
    throw new Error(
      `The observation descriptor table is invalid:\n  ${problems.join('\n  ')}\n` +
        'contracts.md §4.1 makes the table the whole definition of what an exported channel ' +
        'means, so a table that does not validate is a vector nobody can interpret.',
    );
  }
}

// ---------------------------------------------------------------------------
// The digest.
// ---------------------------------------------------------------------------

/**
 * The encoding version, which is part of the hashed text.
 *
 * Not the schema version and not a layout fact: it names the *format* below, so
 * that a second implementation reading the published encoding knows which one it
 * is reproducing. Changing the format changes every digest, which is why the
 * format is pinned here rather than evolved casually.
 */
const DIGEST_FORMAT = 'mm-observation-layout/1';

/**
 * A number as the encoding writes it, with the sign of a zero kept.
 *
 * `String(-0)` is `"0"`, which is the JavaScript-specific behaviour that let a
 * `-0` floor hash as a `+0` floor. A canonical encoding a second implementation
 * reproduces *from the document* must not depend on one language's opinion about
 * which zero prints as which text, so the sign is written out.
 *
 * The format version does not move for this. {@link layoutProblems} now rejects
 * a floor that is not `+0`, so no table this module will validate can contain a
 * negative zero, and the encoding of every valid layout — including every layout
 * that ever shipped — is byte-identical to what it was before.
 */
function numberText(value: number): string {
  return Object.is(value, -0) ? '-0' : String(value);
}

/**
 * The canonical text a layout hashes as.
 *
 * Exported because a digest whose input cannot be inspected is a digest nobody
 * can debug: when the gate reports a mismatch, the first useful question is
 * *which line differs*, and that requires the lines.
 *
 * One header line, then one line per slot, `\n`-separated, ASCII only. Fields
 * are tab-separated because no field can contain a tab — block names and rule
 * names come from closed sets and everything else is a decimal integer, written
 * through {@link numberText} so that the sign of a zero survives.
 */
export function layoutEncoding(slots: readonly ObservationSlot[]): string {
  const lines: string[] = [`${DIGEST_FORMAT}\tslots=${String(slots.length)}`];
  for (const slot of slots) {
    const descriptor = slot.descriptor;
    lines.push(
      [
        String(slot.index),
        slot.block,
        String(slot.blockIndex),
        descriptor.rule,
        numberText(descriptor.divisor),
        numberText(descriptor.min),
        numberText(descriptor.max),
        descriptor.edges === undefined ? '-' : descriptor.edges.join(','),
      ].join('\t'),
    );
  }
  return lines.join('\n');
}

/**
 * ASCII bytes of a string, refusing anything outside it.
 *
 * `TextEncoder` would do this, and is deliberately not used: the digest must be
 * identical in Node, in Electron, and in a browser, and the way to guarantee
 * that is to depend on nothing beyond `String.prototype.charCodeAt`. The refusal
 * is not defensive clutter — a non-ASCII block name would encode differently
 * under different assumptions and silently move the digest.
 */
function asciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code > 0x7f) {
      throw new RangeError(
        `The layout encoding must be ASCII, but character ${String(index)} is code point ` +
          `${String(code)}. A digest whose bytes depend on a text encoding is a digest two ` +
          'implementations can disagree about.',
      );
    }
    bytes[index] = code;
  }
  return bytes;
}

/**
 * The digest of one descriptor table: 16 lowercase hex characters.
 *
 * A pure function of the values in `slots` — never of object identity, never of
 * module state, never of iteration order beyond the array's own. That is what
 * makes two processes running the same build agree, and it is why the parameter
 * exists at all rather than the function reading {@link OBSERVATION_SLOTS}
 * directly: a digest that could only be taken over the shipped table could not
 * be tested for the thing it promises.
 */
export function layoutDigest(slots: readonly ObservationSlot[]): string {
  return hashBytes(asciiBytes(layoutEncoding(slots)));
}

/** The digest of the shipped layout. Recorded by every baseline and every sweep. */
export const OBSERVATION_LAYOUT_DIGEST = layoutDigest(OBSERVATION_SLOTS);

// The spec says the table *"fails validation at load"*, so it is validated at
// load. An invalid table is not a condition to discover on the first export of
// the first tick of a ten-thousand-run sweep.
assertLayoutValid(OBSERVATION_SLOTS);

/** The descriptor a slot's rule is applied through. Sanity, not a second table. */
export function slotDescriptor(index: number): NormalizationDescriptor {
  const descriptor = OBSERVATION_DESCRIPTORS[index];
  if (descriptor === undefined) {
    throw new RangeError(
      `Channel ${String(index)} is outside the observation, which is ${OBSERVATION_SIZE} wide.`,
    );
  }
  return descriptor;
}

/** Re-exported so a caller recording provenance needs one import. */
export type { NormalizationRule };
