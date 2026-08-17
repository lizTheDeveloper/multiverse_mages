/*
 * Multiverse Mages — the workings standing in a universe, and the tick they stop.
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
 * `@mm/state`'s `standing-working` rows, read as the fourth gate on
 * `gatherEffects` and swept once a tick.
 *
 * ## Why this is `coordination` and not `rules-magic`
 *
 * `contracts.md` §5 rule 3: `rules-magic` is pure over the values it is handed
 * and never reaches into world state. The arithmetic of a working — what
 * `durationTicks` means, when a working is live, that `0` is not an expiry —
 * is `rules-magic/workings/standing.ts` and is a pure function of numbers.
 * *Which* workings a particular universe is holding up is a fact about
 * `SimState`, and that is here, with everything else that reads a component
 * store on behalf of a rules package.
 *
 * ## The lapse is an event, and it happens exactly once
 *
 * {@link sweepLapsedWorkings} runs at the **top** of the world step, before
 * anything gathers an effect. Two reasons, and the second is the one that would
 * have been found late:
 *
 * - A working that lapsed on this tick must not contribute on this tick. The
 *   sweep before the gather is what makes *"the animal reverts"* happen on the
 *   tick the content says it does.
 * - {@link standingWorkingsOf} memoizes on the `SimState` object, the way
 *   `universe-effects.ts` and `god/effects.ts` do. `step` clones state per tick
 *   so a new tick is a new key — but *within* a tick the object is the same one,
 *   so a view built before the sweep would answer for rows the sweep has since
 *   removed. Sweeping first means the memo is never built over a state the tick
 *   has already invalidated.
 *
 * ## A silent revert is the defect this campaign exists to find
 *
 * So the sweep does not merely delete rows. It returns every working it ended,
 * with its holder, its node and how many months had been spent renewing it, and
 * `world-step.ts` puts the count and the nodes on the tick's report. *"A wall
 * you have agreed to build twice"* is only a game rule if a player can see the
 * wall come down.
 */

import type { ContentId, ContentRegistry } from '@mm/content';
import type { Fixed, SimState } from '@mm/sim-core';
import { FP_ONE, floorDiv } from '@mm/sim-core';
import type { StandingWorkings } from '@mm/rules-magic';
import {
  NO_WORKINGS_STAND,
  authoredDurationOf,
  expiryTickOf,
  hasLapsed,
  isLive,
} from '@mm/rules-magic';
import type { Handle, StandingWorkingRecord } from '@mm/state';
import { STANDING_WORKING, attachRecord, collectRecords, componentOf } from '@mm/state';

/**
 * `nodeId` is a `u16`, so this packs a (holder, node) pair into one number
 * without collision for any handle the entity store can allocate.
 *
 * A number rather than a template string because this is built once per tick
 * over every instance in the universe, and because a string key invites a
 * caller to build one by hand somewhere else and get the separator wrong.
 */
const NODE_KEY_SPAN = 65536;

function pairKey(holder: Handle, nodeId: ContentId): number {
  return holder * NODE_KEY_SPAN + nodeId;
}

/** One working, ended. */
export interface LapsedWorking {
  readonly holder: Handle;
  readonly nodeId: ContentId;
  /** The tick it was first established — never rewritten by a renewal. */
  readonly litTick: number;
  /** Months spent renewing it before it lapsed. `0` means nobody ever came back. */
  readonly renewals: number;
}

/** What one tick's sweep ended. */
export interface WorkingSweep {
  /** Workings that stopped standing on this tick. Empty on almost every tick. */
  readonly lapsed: readonly LapsedWorking[];
  /** Workings still standing after the sweep. */
  readonly standing: number;
}

/** Nothing stood and nothing lapsed. */
export const NO_WORKING_SWEEP: WorkingSweep = Object.freeze({
  lapsed: Object.freeze([]),
  standing: 0,
});

const cached = new WeakMap<SimState, StandingWorkings>();

/**
 * The workings standing in this universe at its current world tick.
 *
 * Memoized on the state object. Built from the rows rather than from the sweep's
 * output on purpose: a view derived from *"what the sweep left"* would be a
 * second implementation of liveness, and the two would eventually disagree about
 * the boundary tick — which is exactly how a working both contributes and
 * reverts in the same step.
 */
export function standingWorkingsOf(state: SimState): StandingWorkings {
  const hit = cached.get(state);
  if (hit !== undefined) return hit;

  const worldTick = state.clock.worldTick;
  const live = new Set<number>();
  for (const { row } of collectRecords(state, STANDING_WORKING)) {
    if (!isLive(row, worldTick)) continue;
    live.add(pairKey(row.holder, row.nodeId));
  }

  // The named view for the common case, rather than a closure over an empty
  // set that would answer identically. `universe-effects.ts` returns
  // `NO_ECONOMY_BONUSES` on the same argument: a universe that has never lit a
  // working — which is every universe until somebody spends the month, and
  // every universe restored from a revision-11 save — reaches the gate through
  // the constant that says so by name.
  const view: StandingWorkings =
    live.size === 0
      ? NO_WORKINGS_STAND
      : { standsAt: (holder, nodeId) => live.has(pairKey(holder, nodeId)) };
  cached.set(state, view);
  return view;
}

/** The working `holder` is holding up over `nodeId`, if she has one at all. */
export function findWorking(
  state: SimState,
  holder: Handle,
  nodeId: ContentId,
): { handle: Handle; row: StandingWorkingRecord } | undefined {
  for (const { handle, row } of collectRecords(state, STANDING_WORKING)) {
    if (row.holder === holder && row.nodeId === nodeId) return { handle, row };
  }
  return undefined;
}

/** What a month of upkeep did. */
export const WORKING_OUTCOME = {
  /** There was no working, and now there is. */
  lit: 1,
  /** There was one, and its expiry moved. */
  renewed: 2,
} as const;

export type WorkingOutcome = (typeof WORKING_OUTCOME)[keyof typeof WORKING_OUTCOME];

/**
 * Spend a month establishing or renewing a working, and say which it was.
 *
 * **The expiry is set from the tick the month was spent, not extended from the
 * old one.** A mage who renews early loses the unspent remainder, and that is
 * the design rather than an oversight: *"renewed about as often as a sentry is
 * changed"* is a rota, and a rota that banked its unused hours would let one
 * mage front-load a decade of watches. It also keeps `expiresTick` a function of
 * the last month actually worked, which is the only thing a save can honestly
 * record.
 *
 * `litTick` is written once and never rewritten, so the report can tell a
 * working carried for a career from one lit last month.
 *
 * @throws RangeError if asked to light a working for a zero-duration node.
 * `expiryTickOf` refuses that and the reason is the same one: a working with no
 * duration is not a working that expires at once, it is an effect that never
 * needed one, and creating a row for it would put a lapse on the report for
 * something that cannot lapse.
 */
export function establishOrRenewWorking(
  state: SimState,
  holder: Handle,
  nodeId: ContentId,
  worldTick: number,
  durationTicks: number,
): WorkingOutcome {
  const expiresTick = expiryTickOf(worldTick, durationTicks);
  const existing = findWorking(state, holder, nodeId);
  if (existing === undefined) {
    const handle = state.entities.create();
    attachRecord(state, STANDING_WORKING, handle, {
      holder,
      nodeId,
      litTick: worldTick,
      expiresTick,
      renewals: 0,
    });
    return WORKING_OUTCOME.lit;
  }
  const store = componentOf(state, STANDING_WORKING);
  store.set(existing.handle, 'expiresTick', expiresTick);
  // `u16`, and a working renewed 65,535 times has been carried for longer than
  // any run this project measures. Saturating rather than wrapping, because a
  // renewal count that fell back to zero would read as a working lit last month.
  store.set(existing.handle, 'renewals', Math.min(existing.row.renewals + 1, 65535));
  return WORKING_OUTCOME.renewed;
}

/**
 * End every working whose tick has come, and say what ended.
 *
 * Ascending entity order, which is what `collectRecords` walks. Nothing sorts —
 * the report is a list, not a fold, and its order is the store's.
 */
export function sweepLapsedWorkings(state: SimState, worldTick: number): WorkingSweep {
  const store = componentOf(state, STANDING_WORKING);
  const lapsed: LapsedWorking[] = [];
  const ending: Handle[] = [];
  let standing = 0;
  for (const { handle, row } of collectRecords(state, STANDING_WORKING)) {
    if (!hasLapsed(row, worldTick)) {
      standing += 1;
      continue;
    }
    lapsed.push({
      holder: row.holder,
      nodeId: row.nodeId,
      litTick: row.litTick,
      renewals: row.renewals,
    });
    ending.push(handle);
  }
  // Removed after the walk, not during it: `collectRecords` is walking the same
  // store, and mutating a store mid-iteration is how a sweep silently skips
  // every second row.
  for (const handle of ending) {
    store.remove(handle);
    state.entities.destroy(handle);
  }
  if (lapsed.length === 0 && standing === 0) return NO_WORKING_SWEEP;
  return { lapsed: Object.freeze(lapsed), standing };
}

/** Every working a dead mage was holding up, ended with her. */
export function endWorkingsOf(state: SimState, holder: Handle): number {
  const store = componentOf(state, STANDING_WORKING);
  const ending: Handle[] = [];
  for (const { handle, row } of collectRecords(state, STANDING_WORKING)) {
    if (row.holder === holder) ending.push(handle);
  }
  for (const handle of ending) {
    store.remove(handle);
    state.entities.destroy(handle);
  }
  return ending.length;
}

/**
 * Every node's authored working duration, precomputed from content.
 *
 * The sibling of `universe-effects.ts`' `UniverseEffectIndex`, and built for the
 * same reason: the answer is a pure function of the content, the world loop asks
 * it per mage per tick, and `rules-magic`'s `NodeCatalog` deliberately cannot see
 * `effects` at all — *"a type that cannot see `effects` cannot quietly start
 * applying them here"*.
 *
 * **A node's non-zero durations must all be the same number**, and the loader
 * refuses a node that breaks it. Two different durations on one node would need
 * two workings, or one working whose expiry silently extends the shorter effect;
 * the second is the kind of quiet wrongness this project spends its comments on.
 */
export interface WorkingDurations {
  /** Ticks a working over this node stands for. `0` — the common case — means no working. */
  durationOf(nodeId: ContentId): number;
  /** How many nodes declare a duration at all. For diagnostics and for the report. */
  readonly durableNodeCount: number;
}

/** Nothing in this content set expires. What a build with no index behaves as. */
export const NO_WORKING_DURATIONS: WorkingDurations = Object.freeze({
  durationOf: () => 0,
  durableNodeCount: 0,
});

/**
 * Reads every node's authored duration once per content load.
 *
 * Walks `registry.nodes` directly rather than going through
 * `rules-magic/effects/consumption.ts`. That module's registrations are about
 * *magnitudes* — "can what the academics know move this primitive" — and a
 * duration is not a magnitude: it is a structural fact about the effect entry,
 * read for every primitive at once rather than for one. Registering this walk as
 * a consumption would put a node on the coverage report for a primitive nothing
 * here spends.
 */
export function buildWorkingDurations(registry: ContentRegistry): WorkingDurations {
  const byNode = new Map<ContentId, number>();
  for (const entry of registry.nodes) {
    const duration = authoredDurationOf(entry.record.effects);
    if (duration !== 0) byNode.set(entry.contentId, duration);
  }
  return {
    durationOf: (nodeId) => byNode.get(nodeId) ?? 0,
    durableNodeCount: byNode.size,
  };
}

/**
 * How close this mage's most urgent working is to lapsing, `fp`.
 *
 * `0` for a mage holding nothing up, and — deliberately — also `0` on the tick a
 * working is lit, rising to just under `FP_ONE` on the last tick it stands. It
 * is the fraction of the authored duration already elapsed, taken over her most
 * urgent working.
 *
 * A working whose node has since lost its duration (content changed under a
 * save) contributes nothing rather than dividing by zero. It will be swept when
 * its tick comes, like any other.
 */
export function workingUrgencyOf(
  state: SimState,
  holder: Handle,
  worldTick: number,
  durations: WorkingDurations,
): Fixed {
  let worst = 0;
  for (const { row } of collectRecords(state, STANDING_WORKING)) {
    if (row.holder !== holder) continue;
    const duration = durations.durationOf(row.nodeId);
    if (duration <= 0) continue;
    const remaining = row.expiresTick - worldTick;
    if (remaining <= 0) {
      // Already lapsed and not yet swept. Maximally urgent, and clamped rather
      // than allowed to go negative — a negative urgency would *subtract* from
      // the opportunity term, so a universe whose workings had all gone out
      // would be the one least inclined to relight them.
      return FP_ONE;
    }
    if (remaining >= duration) continue;
    const elapsed = FP_ONE - floorDiv(remaining * FP_ONE, duration);
    if (elapsed > worst) worst = elapsed;
  }
  return worst;
}

/** Ticks before this mage's working over `nodeId` lapses, or the full duration if unlit. */
export function ticksBeforeLapse(
  state: SimState,
  holder: Handle,
  nodeId: ContentId,
  worldTick: number,
  durations: WorkingDurations,
): number {
  const existing = findWorking(state, holder, nodeId);
  if (existing === undefined) return durations.durationOf(nodeId);
  return Math.max(0, existing.row.expiresTick - worldTick);
}
