/*
 * Multiverse Mages — the four tradition hooks, and nothing else.
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
 * Traditions: how magic is *performed*, as distinct from what it does.
 *
 * `vision.md` §4a allows a tradition exactly four hooks — acquire, store, cast,
 * cost — and says plainly why: bespoke tradition code is the most interesting
 * thing in the game and is simultaneously what makes primitive-level Monte
 * Carlo balancing impossible. A closed enumeration means the balance harness at
 * 0.5.0 can enumerate the entire tradition space; an open one means it can only
 * sample whatever was written last.
 *
 * The cap is enforced in four places, and the redundancy is the point:
 *
 * 1. `@mm/content`'s `hooks.ts` holds the enumeration in **code**, so adding a
 *    kind is a reviewed code change rather than a content edit.
 * 2. `contracts.md` §2.5 holds the same enumeration in prose, and a test
 *    compares them (task 6.2).
 * 3. The four dispatch modules here take a *resolved hook*, never an id, so a
 *    fifth behaviour has nowhere to attach.
 * 4. A conformance test rejects any read of `traditionId` in this package
 *    outside {@link hookFor} (task 6.14).
 *
 * Every magnitude reachable from here is authored content and is **untuned**.
 * The balance harness does not exist until 0.5.0 (`release-plan.md`), so
 * nothing in this module claims, or could support a claim, that any of these
 * numbers is balanced.
 */

export type { AcquireInputs, AcquireTerms } from './acquire.js';
export { UNCHANGED_MULTIPLIER, applyAcquire } from './acquire.js';

export type { CastOutcome, CastPolicy, PreparationCandidate, PreparationOutcome } from './cast.js';
export { UNBOUNDED_PREPARATION, castPolicy, expendOnCast, isCastable, prepare } from './cast.js';

export type {
  InstanceResolution,
  InstanceView,
  KnowledgeLossEvent,
  ResolutionValue,
  TraditionChangeInput,
  TraditionChangeResult,
} from './change.js';
export { RESOLUTION, changeTradition } from './change.js';

export type { CostPolicy } from './cost.js';
export { assertCostHook, castCost, costPolicy, costSplit, preparationCost } from './cost.js';

export type { PortalHookSet, ResolvedHook, TraditionTable } from './hook-for.js';
export {
  NO_TRADITION,
  assertHookPoint,
  booleanParam,
  hookFor,
  hookSourceFor,
  hooksOfTradition,
  integerParam,
  portalHookSet,
  traditionTable,
  unimplementedKind,
} from './hook-for.js';

export type { CarriedNode, PortalEntry, PortalHooks, ReleaseAbroad } from './portal.js';
export { populatePreparedSpells, releaseAbroad, resolvePortalHooks } from './portal.js';

export type { PalaceContribution, ScribeAvailability, StoreAdmission, StorePolicy } from './store.js';
export {
  UNBOUNDED_SLOTS,
  admitToStore,
  canHoldAt,
  palaceLibraryDepth,
  perishesWithHolder,
  scribeAvailability,
  storePolicy,
} from './store.js';

export { traditionTableFrom } from './registry.js';
