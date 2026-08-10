/*
 * Multiverse Mages — the world-side facts a knowledge operation is handed,
 * rather than fetching.
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
 * Every rate a knowledge operation needs — `learnRate`, `retention`,
 * `scribeAffinity`, `rediscoveryAffinity`, the scribe capacity actually
 * available this tick, the materials on hand — is a fact about species,
 * populace, and universities. All of that is `rules-world`, and
 * `contracts.md` §5 rule 3 forbids `rules-magic` from importing it: *"Where they
 * interact — a mage learning a node — the interaction lives in a coordinating
 * layer, not in a cycle."*
 *
 * So the operations in this package do not look anything up. They are pure
 * functions over the values below, and the coordinating layer that owns both
 * halves is what reads a mage's species and fills them in.
 *
 * **Why this is a boundary and not an inconvenience.** The alternative — passing
 * a mage entity and reading `species.learnRate` through it — compiles today and
 * fails on the first commit of `mages-and-species`, because by then the type of
 * that entity lives in `rules-world` and the import is the cycle. The
 * dependency-graph test would catch it, but only after a package's worth of code
 * had been written against the wrong shape. Naming the inputs here means the
 * shape is right before there is anything to migrate.
 *
 * **Handles are opaque.** A mage, a grimoire, and a library reach this package
 * as `uint32` entity handles and are never dereferenced here: nothing in
 * `rules-magic` may ask a mage its species or a library its capacity. They are
 * carried so an operation can say *whose* instance it created and *where* it
 * put it, and for nothing else. That is why they are aliases of `@mm/state`'s
 * {@link Handle} rather than structural types — there is no structure to
 * describe, and inventing one would be inventing a second copy of §1.2.
 *
 * Every `Fp` is a fixed-point integer at scale 1024 (`contracts.md` §0). A rate
 * of `fp(1024)` means "×1.0, the unmodified rate"; that convention is
 * `contracts.md` §2.4's, not an invention here.
 */

import type { Fp, Handle } from '@mm/state';

/**
 * A mage. Opaque: `rules-magic` never resolves it to an entity.
 *
 * Distinct aliases rather than one `Handle` everywhere because the three name
 * different entity stores, and a grimoire handle passed where a mage handle
 * belongs is the kind of defect that shows up as an instance filed against a
 * mage who does not exist. TypeScript will not catch the swap — these are all
 * `number` — but a reader will, and the field names are what a reviewer reads.
 */
export type MageHandle = Handle;

/** A grimoire. One node per grimoire (`contracts.md` §1.5). */
export type GrimoireHandle = Handle;

/** A library. Instances shelved here carry `locationKind` `3`. */
export type LibraryHandle = Handle;

/**
 * The learner's species rates.
 *
 * `learnRate` multiplies research and teaching throughput; `retention` resists
 * mastery decay and sets the floor a held instance decays toward. Both are
 * carried together because every operation that creates knowledge in a mind
 * needs the first and every subsequent tick of that instance's life needs the
 * second — splitting them would mean a caller could supply one and silently
 * default the other, and a defaulted `retention` is a species trait that
 * quietly stopped differentiating anybody.
 */
export interface LearnerRates {
  /** `fp` multiplier on research and teaching throughput (`contracts.md` §2.4). */
  readonly learnRate: Fp;
  /** `fp`; resists mastery decay. Higher holds knowledge longer. */
  readonly retention: Fp;
}

/**
 * What a scribing operation is allowed to spend, and how well it goes.
 *
 * `scribeCapacity` and `materials` are *supply*, not traits: they are what the
 * universe actually has this tick, after everything else that wanted them. They
 * arrive as parameters for the same reason the rates do — the populace cohort
 * that supplies scribe-months and the `materials` balance are both §1.1/§1.3
 * state owned elsewhere.
 */
export interface ScribeInputs {
  /** `fp` multiplier on grimoire durability and scribe throughput (§2.4). */
  readonly scribeAffinity: Fp;
  /** `fp` scribe-months available to this operation. */
  readonly scribeCapacity: Fp;
  /** `fp` materials available to this operation. */
  readonly materials: Fp;
}

/**
 * The species trait rediscovery is scaled by.
 *
 * A **divisor** against a node's `rediscoveryMultiplier`, per `contracts.md`
 * §2.4: higher is better, uniform with every other trait. It is named on its own
 * rather than folded into {@link LearnerRates} because rediscovery is the one
 * operation where it applies, and because the `fp(3072)` floor is applied
 * *after* it — a reader who sees this field should be reminded that it is not
 * the last word.
 */
export interface RediscoveryInputs {
  /** `fp` divisor against `rediscoveryMultiplier`. Higher rediscovers cheaper. */
  readonly rediscoveryAffinity: Fp;
}

/**
 * The full set of world-side inputs, for callers that hold all of them.
 *
 * Operations take the narrow interfaces above; this exists so a coordinating
 * layer can assemble one record per mage per tick and pass slices of it, rather
 * than threading six positional numbers through four call sites and eventually
 * transposing two of them.
 */
export interface WorldInputs extends LearnerRates, ScribeInputs, RediscoveryInputs {}
