/*
 * Multiverse Mages — the hooks in force, as a function of the tradition the
 * universe holds right now.
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
 * One indirection, and the reason it has to exist.
 *
 * `contracts.md` §1.1 gives a universe exactly one `traditionId`, and god action
 * 13 rewrites it. Until this module, that write reached nothing: the `store` and
 * `acquire` policies were resolved once at the composition root from the id the
 * scenario was *built* with and carried on {@link WorldStepDeps} for the length
 * of the run. So the action was published in the action space, priced at 64
 * favor, admitted by the mask, charged, followed by the upheaval — and the
 * universe went on acquiring, storing and scribing under the tradition it
 * started with.
 *
 * A resolver rather than a table, and rather than teaching this package to read
 * `@mm/content`'s tradition records:
 *
 * - `rules-magic`'s four-hook cap is enforced by a conformance test that fails
 *   if `traditionId` is read anywhere in that package outside `hookFor`. The
 *   arbitration therefore has to happen at the composition root, which is where
 *   the content set is. What crosses this boundary is *resolved hooks*, never an
 *   id and never a record.
 * - The world loop still may not branch on a tradition. It calls one function
 *   with the id it read out of state and uses whatever comes back; nothing here
 *   or downstream switches on a name.
 *
 * Optional everywhere it appears. A world built for a knowledge test supplies no
 * resolver and keeps exactly the behaviour it had — the fixed `store`/`acquire`
 * pair on the deps — which is a thing a test can assert against rather than a
 * silent degradation.
 */

import type { AcquirePolicy, ResolvedHook, StorePolicy } from '@mm/rules-magic';

/**
 * The two world-time policies the world loop consults every tick.
 *
 * Split out from {@link TraditionHooks} so the loop's fallback — the fixed pair
 * on the deps, for a caller that supplies no resolver — is expressible. The raw
 * hook below has no fallback and needs none: only a tradition *change* reads it,
 * and a world with no resolver cannot have one.
 */
export interface ActiveHooks {
  /** Hook two: where knowledge may live, and what survives its holder. */
  readonly store: StorePolicy;
  /** Hook one: what learning costs, and what a fresh instance is worth. */
  readonly acquire: AcquirePolicy;
}

/** The hooks one tradition puts in force, resolved. */
export interface TraditionHooks extends ActiveHooks {
  /**
   * The raw `store` hook, un-resolved.
   *
   * Carried beside the policy rather than derived from it because a tradition
   * change resolves **both** sides itself: `changeTradition` takes two
   * `ResolvedHook`s and calls `storePolicy` on each, so handing it a policy
   * would mean reconstructing a hook from a policy — a second, lossy direction
   * through an arbitration that is supposed to have exactly one.
   */
  readonly storeHook: ResolvedHook;
}

/**
 * Interned tradition id to the hooks it puts in force.
 *
 * @throws RangeError for an id the content set does not ship. Refusing rather
 * than defaulting, for `traditionIdNamed`'s reason: a universe silently running
 * "standard everything" because its id resolved to nothing is a measurement of a
 * tradition nobody selected.
 */
export type TraditionResolver = (traditionId: number) => TraditionHooks;
