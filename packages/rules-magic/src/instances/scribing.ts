/*
 * Multiverse Mages — scribing: a mind's knowledge, written down.
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
 * Writing a node out of a mind and into a book — the operation that makes
 * knowledge survive its holder, and makes it lootable.
 *
 * Four things about a grimoire are decided here and nowhere else.
 *
 * **It holds exactly one node.** `contracts.md` §1.5 fixes that in the schema,
 * and it is why a library's depth is a count rather than a traversal.
 *
 * **Its durability comes from the scribe's species affinity**, plus a roll from
 * RNG stream 5. This is where "dwarven books resist burning" stops being
 * flavour text: the roll is deliberately narrower than the affinity spread, so
 * a better scribe produces a sturdier book at *every* seed rather than on
 * average — the requirement says "strictly greater", and a wide roll would
 * quietly turn that into a statistical claim.
 *
 * **Whether it is silently wrong.** A second roll, from RNG stream 13 rather
 * than stream 5, decides whether the scribe made an error nobody will notice
 * until a reader fails against the text. See `fidelity.ts` for why the ambient
 * rate is small and why it is not zero, and the note at the draw for why it
 * takes its own stream.
 *
 * **Consumption is reported, not applied.** Materials are a universe-level
 * balance (`contracts.md` §1.1) and scribe capacity is a fact about populace
 * cohorts (§1.3); both belong to `rules-world`. This operation refuses when
 * what it was handed is insufficient and reports what it used, and the caller
 * deducts. Reaching across to deduct them here is the import cycle §5 forbids.
 */

import type { ContentId, Fp } from '@mm/content';
import type { Handle, Ruleset, Tick } from '@mm/state';
import { GRIMOIRE, HOLDER_KIND, attachRecord, permits } from '@mm/state';
import { FP_ONE, RNG_STREAM, mul, nextBounded } from '@mm/sim-core';

import type { CellResolver, KnowledgeRng, NodeCatalog } from './catalog.js';
import { requireNode } from './catalog.js';
import {
  CORRUPTION,
  fidelityOf,
  generationStep,
  scribalErrorChance,
  setFidelity,
} from './fidelity.js';
import {
  SCRIBE_CAPACITY_PER_TIER,
  SCRIBE_DURABILITY_BASE,
  SCRIBE_DURABILITY_ROLL_SPAN,
} from './constants.js';
import type { KnowledgeRefusal } from './outcomes.js';
import type { KnowledgeSubsystem } from './subsystem.js';
import { writtenInstanceLocation } from './subsystem.js';
import { heldMastery } from './teaching.js';

/**
 * The active tradition's `store` hook, as much of it as scribing needs.
 *
 * A two-field structure rather than a `kind` string this module interprets,
 * because the hook enumeration belongs to `magic-traditions` and a `switch` on
 * kind here would be a second place the closed set is written down — the exact
 * thing `contracts.md` §2.5's four-hook cap exists to prevent. `kind` is
 * carried only so the refusal can name it, which the requirement demands.
 */
export interface StoreHook {
  /** The hook kind, for the refusal message. Never branched on here. */
  readonly kind: string;
  /** Whether this store kind keeps written copies at all. */
  readonly keepsWrittenCopies: boolean;
}

/** The `store: standard` hook: grimoires and libraries as usual. */
export const STANDARD_STORE: StoreHook = { kind: 'standard', keepsWrittenCopies: true };

/**
 * The `store: palace` hook: the Art of Memory, which writes nothing down.
 *
 * Exported from this module rather than invented by each caller so that the two
 * v1 traditions that differ on this point differ through one value.
 */
export const PALACE_STORE: StoreHook = { kind: 'palace', keepsWrittenCopies: false };

export interface ScribingInputs {
  readonly knowledge: KnowledgeSubsystem;
  readonly catalog: NodeCatalog;
  readonly cells: CellResolver;
  readonly ruleset: Ruleset;
  readonly rng: KnowledgeRng;
  /** The mage writing. Opaque, and the actor key for stream 5. */
  readonly scribe: Handle;
  readonly nodeId: ContentId;
  readonly worldTick: Tick;
  readonly store: StoreHook;
  /** Species `scribeAffinity` (`contracts.md` §2.4). Raises durability. */
  readonly scribeAffinity: Fp;
  /** Scribe capacity available to this operation. Reported as consumed, not deducted. */
  readonly scribeCapacity: Fp;
  /** Materials available to this operation. */
  readonly materials: Fp;
  /**
   * Who ends up holding the book. Defaults to the scribe.
   *
   * `HOLDER_KIND.library` is a legal value and means what it says: a university
   * scribe copying a treatise straight into the stacks, with no moment at which
   * a mage is carrying it. The instance lands wherever the holder puts it —
   * `writtenInstanceLocation` decides, not this operation.
   */
  readonly holderKind?: number;
  readonly holderId?: Handle;
}

export interface ScribingOutcome {
  readonly refusal?: KnowledgeRefusal;
  /** The created grimoire, or `0`. */
  readonly grimoire: Handle;
  /** The instance that *is* its contents, or `0`. */
  readonly instance: Handle;
  readonly durability: Fp;
  /**
   * The copy distance the new book was written at, in `fp` generations.
   *
   * `fp(1024)` — one generation — for a book scribed out of a mind that
   * researched the node or was taught it in person. Higher when the scribe
   * herself learned it from a book, which is the whole of the telephone problem:
   * see `fidelity.ts`.
   */
  readonly copyGeneration: Fp;
  /**
   * Whether the scribe made a silent error and the book is wrong.
   *
   * Reported, and reported honestly, because this is an *outcome* and the
   * caller may need to count it. The **world** is not told: nothing observable
   * distinguishes this book from a sound one until a reader fails against it,
   * which is the design and is why `study` is the only place the flag is read.
   */
  readonly corrupted: boolean;
  /** What the caller should deduct. Zero on a refusal. */
  readonly materialsConsumed: Fp;
  readonly capacityConsumed: Fp;
}

/**
 * Scribe capacity a node costs to copy out, from its tier.
 *
 * Derived rather than authored because `contracts.md` §2.3 gives a node a
 * `scribeCost` in materials and no capacity cost at all. Deriving it from tier
 * says the obvious thing — a tier-5 treatise takes longer to copy than a
 * tier-1 primer — without inventing a content field this change has no mandate
 * to add. **Untuned.**
 */
export function scribeCapacityCost(tier: number): Fp {
  return SCRIBE_CAPACITY_PER_TIER * tier;
}

/**
 * Writes a node the scribe holds in mind into a new grimoire.
 *
 * The instance created is the *only* instance of that written copy: shelving it
 * in a library later rewrites its location rather than producing a second one.
 * Where it starts is therefore the same question shelving answers, asked at
 * creation — a book written onto a shelf is shelved from its first tick — so
 * the location comes from `writtenInstanceLocation` rather than from a constant
 * here. Reading the holder off the record we just wrote and then placing the
 * instance somewhere else is how the two disagree.
 */
export function scribe(inputs: ScribingInputs): ScribingOutcome {
  const node = requireNode(inputs.catalog, inputs.nodeId);

  if (!inputs.store.keepsWrittenCopies) {
    return refuse({
      reason: 'written-storage-unavailable',
      nodeId: inputs.nodeId,
      storeKind: inputs.store.kind,
    });
  }

  const cellId = inputs.cells.cellOf(inputs.nodeId);
  if (!permits(inputs.ruleset, cellId)) {
    return refuse({ reason: 'forbidden-cell', nodeId: inputs.nodeId, cellId });
  }

  if (heldMastery(inputs.knowledge, inputs.scribe, inputs.nodeId) === undefined) {
    return refuse({ reason: 'node-not-held', nodeId: inputs.nodeId, subject: inputs.scribe });
  }

  if (inputs.materials < node.scribeCost) {
    return refuse({
      reason: 'insufficient-materials',
      nodeId: inputs.nodeId,
      supplied: inputs.materials,
      required: node.scribeCost,
    });
  }

  const capacityRequired = scribeCapacityCost(node.tier);
  if (inputs.scribeCapacity < capacityRequired) {
    return refuse({
      reason: 'insufficient-scribe-capacity',
      nodeId: inputs.nodeId,
      supplied: inputs.scribeCapacity,
      required: capacityRequired,
    });
  }

  // The distance the *best* copy the scribe holds sits at. A mage who learned
  // the same node twice — once from a teacher, once from a spent book — writes
  // from the better memory, which is the only reading that does not punish her
  // for having read widely.
  const sourceGeneration = bestHeldGeneration(inputs);
  const copyGeneration = sourceGeneration + generationStep(inputs.scribeAffinity, node.knowledgeKind);

  const stream = inputs.rng.actorStream(RNG_STREAM.scribing, inputs.scribe);
  const durability =
    mul(SCRIBE_DURABILITY_BASE, inputs.scribeAffinity) +
    nextBounded(stream, SCRIBE_DURABILITY_ROLL_SPAN);

  // Stream 13, not stream 5. Sharing the scribe's durability cursor would make
  // *whether this book is wrong* shift every durability roll she takes after
  // it — so "dwarven books resist burning" would move for a reason that has
  // nothing to do with burning. §6's insertion invariance, at the one place it
  // was cheapest to get wrong.
  //
  // The draw is unconditional, taken before the chance is compared, so a book
  // written by a flawless scribe consumes the same ordinal as one written by a
  // poor one. Otherwise the *affinity* would decide the stream position and two
  // species would diverge in every roll downstream of the first book.
  const errorRoll = nextBounded(
    inputs.rng.actorStream(RNG_STREAM.corruption, inputs.scribe),
    FP_ONE,
  );
  const corrupted = errorRoll < scribalErrorChance(inputs.scribeAffinity, node.tier);

  const holderKind = inputs.holderKind ?? HOLDER_KIND.mage;
  const holderId = inputs.holderId ?? inputs.scribe;

  const grimoire = inputs.knowledge.state.entities.create();
  attachRecord(inputs.knowledge.state, GRIMOIRE, grimoire, {
    nodeId: inputs.nodeId,
    durability,
    holderKind,
    holderId,
  });

  const location = writtenInstanceLocation(grimoire, holderKind, holderId);
  const instance = inputs.knowledge.createInstance({
    nodeId: inputs.nodeId,
    locationKind: location.locationKind,
    locationId: location.locationId,
    acquiredTick: inputs.worldTick,
    // A book does not know its subject well or badly; it says what it says.
    // Mastery is a fact about a mind, and written instances never decay.
    mastery: 0,
    grimoire,
  });

  // Written after the instance exists, because the row hangs on its handle. A
  // book at generation zero is not representable and must not be: zero means
  // "in a mind that has not read a book", and every book is at least one
  // scribing away from one.
  setFidelity(inputs.knowledge.state, instance, {
    copyGeneration,
    corruption: corrupted ? CORRUPTION.hidden : CORRUPTION.sound,
  });

  return {
    grimoire,
    instance,
    durability,
    copyGeneration,
    corrupted,
    materialsConsumed: node.scribeCost,
    capacityConsumed: capacityRequired,
  };
}

/**
 * The lowest copy distance among the instances of this node the scribe holds.
 *
 * `heldMastery` already established that at least one exists, so the fallback of
 * `0` is unreachable through {@link scribe}; it is written as a default rather
 * than a throw because a scribe holding nothing is a refusal this function is
 * called after, not an invariant it is responsible for.
 */
function bestHeldGeneration(inputs: ScribingInputs): Fp {
  let best: Fp | undefined;
  for (const instance of inputs.knowledge.instancesHeldBy(inputs.scribe)) {
    const view = inputs.knowledge.read(instance);
    if (view.nodeId !== inputs.nodeId) continue;
    const { copyGeneration } = fidelityOf(inputs.knowledge.state, instance);
    if (best === undefined || copyGeneration < best) best = copyGeneration;
  }
  return best ?? 0;
}

function refuse(refusal: KnowledgeRefusal): ScribingOutcome {
  return {
    refusal,
    grimoire: 0,
    instance: 0,
    durability: 0,
    copyGeneration: 0,
    corrupted: false,
    materialsConsumed: 0,
    capacityConsumed: 0,
  };
}
