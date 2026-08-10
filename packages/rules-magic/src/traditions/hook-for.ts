/*
 * Multiverse Mages — tradition hook arbitration across a portal.
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

import type { HookPoint, TraditionRecord } from '@mm/content';

/**
 * The single place in the rules path that turns a `traditionId` into behaviour.
 *
 * `vision.md` §4a caps a tradition at four hooks because bespoke tradition code
 * is simultaneously the most interesting thing in the game and the thing that
 * makes primitive-level Monte Carlo balancing impossible. A cap enforced only
 * by discipline is not a cap, so it is enforced three ways: the enumeration of
 * kinds lives in code (`@mm/content`'s `hooks.ts`), the four dispatch points
 * take a resolved hook and never an id, and a conformance test
 * (`packages/rules-magic/test/unit/tradition-conformance.test.ts`, task 6.14)
 * fails if `traditionId` is read anywhere in this package except here.
 *
 * That last rule is why this module is small and slightly awkward: everything
 * that wants tradition-dependent behaviour must come through {@link hookFor}
 * and then hand the *resolved hook* onward. A function that took an id and did
 * something clever with it would be a fifth hook nobody declared.
 */

/** `contracts.md` §0: `0` is the reserved null, and §1.1 forbids it here. */
export const NO_TRADITION = 0;

/**
 * One tradition's declared hook, resolved to its kind and its data.
 *
 * `params` is deliberately `unknown`-valued rather than a per-kind union. The
 * loader has already checked every param against the kind's spec
 * (`@mm/content`'s `checkHookParams`), so the four dispatch points read the
 * values they declared and nothing else; typing them here would put a second,
 * unchecked copy of that spec in a second package.
 */
export interface ResolvedHook {
  /** Which of the four points this hook was declared at. */
  readonly point: HookPoint;
  /** The kind, from the closed enumeration in `@mm/content`. */
  readonly kind: string;
  /** Author-supplied data for the kind. Empty when the kind declares none. */
  readonly params: Readonly<Record<string, unknown>>;
}

/**
 * Interned tradition id to its record.
 *
 * This exists because {@link hookFor} is specified with the signature
 * `hookFor(hook, homeTraditionId, hostTraditionId)` and ids are `uint16`s, not
 * records — resolving one to a kind needs content. Passing the table as a
 * parameter keeps the function pure; the alternative, a module-level registry
 * set at load, would make the answer depend on load order and would be
 * unreachable from a test that wants two content sets at once.
 */
export interface TraditionTable {
  /** The record for an interned tradition id, or `undefined`. */
  find(traditionId: number): TraditionRecord | undefined;
}

/** A minimal table over any interned id-to-record pairing. */
export function traditionTable(
  entries: Iterable<readonly [number, TraditionRecord]>,
): TraditionTable {
  const byId = new Map<number, TraditionRecord>(entries);
  return { find: (traditionId: number) => byId.get(traditionId) };
}

/**
 * Which universe's tradition governs a hook, by the clock the hook runs on.
 *
 * `vision.md` §4a: *acquire* and *store* are world-time concerns and stay with
 * the raider — she does not forget how she learned things by walking through a
 * door. *Cast* and *cost* are engagement-time and obey the host, like
 * everything else about casting in a foreign sky.
 *
 * Separated from {@link hookFor} because this half is the rule, and it is worth
 * being able to state it without content loaded. It is also the half a reviewer
 * checks against the vision.
 */
export function hookSourceFor(hook: HookPoint): 'home' | 'host' {
  return hook === 'acquire' || hook === 'store' ? 'home' : 'host';
}

/**
 * The hook that applies to `hook` for a mage of `homeTraditionId` acting under
 * `hostTraditionId`.
 *
 * Pure, and total on valid ids: at home the two arguments are the same id and
 * every hook resolves to that tradition's own declaration, so there is no
 * "domestic" code path to keep in step with the portal one.
 *
 * @throws RangeError if either id is {@link NO_TRADITION} or names no loaded
 * tradition. `contracts.md` §1.1 says a universe has exactly one tradition and
 * that it is never `0`; a zeroed universe row would otherwise resolve to
 * "standard everything", which is a plausible-looking answer to an
 * unconstructed question and would hide the missing selection for as long as
 * nobody looked.
 */
export function hookFor(
  hook: HookPoint,
  homeTraditionId: number,
  hostTraditionId: number,
  traditions: TraditionTable,
): ResolvedHook {
  const source = hookSourceFor(hook);
  const traditionId = source === 'home' ? homeTraditionId : hostTraditionId;
  return hooksOf(traditionId, traditions, source)[hook];
}

/** All four hooks of one tradition, for a universe acting in its own sky. */
export function hooksOfTradition(
  traditionId: number,
  traditions: TraditionTable,
): Readonly<Record<HookPoint, ResolvedHook>> {
  return hooksOf(traditionId, traditions, 'home');
}

/**
 * Every hook a raid needs, resolved once at portal open.
 *
 * Four entries rather than four points, because `contracts.md` §1.6 makes
 * `cast` resolve *twice* and to different universes depending on the moment:
 * the raider's **home** cast kind readies `preparedSpells` before she leaves,
 * and the **host's** cast kind spends them once she is through. That is the one
 * exception to the flat home/host split, it is written into the contract rather
 * than invented here, and it is the reason this function exists at all — it is
 * the only way to express the exception without a second module learning to
 * read a tradition id.
 *
 * The home cast hook is obtained by asking {@link hookFor} what would apply to
 * her *at home*, which is exactly what "readied at home" means, rather than by
 * a second lookup path that could drift from the first.
 */
export interface PortalHookSet {
  /** Home — world-time: what she may hold, and where. */
  readonly homeStore: ResolvedHook;
  /** Home — world-time: how her preparations were readied before she left. */
  readonly homeCast: ResolvedHook;
  /** Host — engagement-time: how casting spends them under this sky. */
  readonly hostCast: ResolvedHook;
  /** Host — engagement-time: what release costs her here. */
  readonly hostCost: ResolvedHook;
}

/** Resolves {@link PortalHookSet} for one raider entering one host universe. */
export function portalHookSet(
  homeTraditionId: number,
  hostTraditionId: number,
  traditions: TraditionTable,
): PortalHookSet {
  return {
    homeStore: hookFor('store', homeTraditionId, hostTraditionId, traditions),
    homeCast: hookFor('cast', homeTraditionId, homeTraditionId, traditions),
    hostCast: hookFor('cast', homeTraditionId, hostTraditionId, traditions),
    hostCost: hookFor('cost', homeTraditionId, hostTraditionId, traditions),
  };
}

function hooksOf(
  traditionId: number,
  traditions: TraditionTable,
  role: 'home' | 'host',
): Readonly<Record<HookPoint, ResolvedHook>> {
  if (traditionId === NO_TRADITION) {
    throw new RangeError(
      `The ${role} universe has no tradition. contracts.md §1.1 gives a universe exactly one ` +
        'traditionId and it is never 0; a universe without one is not a universe this rules ' +
        'path can arbitrate for.',
    );
  }
  const record = traditions.find(traditionId);
  if (record === undefined) {
    throw new RangeError(
      `No loaded tradition has id ${String(traditionId)} (asked for the ${role} universe). Two ` +
        'universes may only interact when their contentRevision values are equal ' +
        '(contracts.md §0), so an unknown id here means the wrong content set, not a missing ' +
        'default.',
    );
  }
  return {
    acquire: resolve('acquire', record),
    store: resolve('store', record),
    cast: resolve('cast', record),
    cost: resolve('cost', record),
  };
}

function resolve(point: HookPoint, record: TraditionRecord): ResolvedHook {
  const hook = record.hooks[point];
  return { point, kind: hook.kind, params: hook.params ?? {} };
}

/**
 * Reads one declared param, with the kind's own declaration as the fallback
 * shape check.
 *
 * The loader guarantees a required param is present and an integer, so this
 * throwing is a bug in *this* package rather than in content — which is why the
 * message says so instead of blaming the author.
 */
export function integerParam(hook: ResolvedHook, name: string): number {
  const value = hook.params[name];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new RangeError(
      `Hook "${hook.point}" of kind "${hook.kind}" was read for an integer param "${name}", ` +
        'which content validation would have rejected if the kind declared it. This is a ' +
        'dispatch reading a param its kind does not have.',
    );
  }
  return value;
}

/** As {@link integerParam}, for a declared boolean. */
export function booleanParam(hook: ResolvedHook, name: string): boolean {
  const value = hook.params[name];
  if (typeof value !== 'boolean') {
    throw new RangeError(
      `Hook "${hook.point}" of kind "${hook.kind}" was read for a boolean param "${name}", ` +
        'which content validation would have rejected if the kind declared it. This is a ' +
        'dispatch reading a param its kind does not have.',
    );
  }
  return value;
}

/** Guards a dispatch against a kind it was never written for. */
export function assertHookPoint(hook: ResolvedHook, point: HookPoint): void {
  if (hook.point !== point) {
    throw new RangeError(
      `A "${point}" dispatch was handed the "${hook.point}" hook. The four points are not ` +
        'interchangeable — that they resolve from different universes across a portal ' +
        '(vision.md §4a) is exactly why.',
    );
  }
}

/** The failure every dispatch shares: a kind with no implementation here. */
export function unimplementedKind(hook: ResolvedHook): RangeError {
  return new RangeError(
    `No implementation for "${hook.point}" kind "${hook.kind}". The enumeration is closed ` +
      '(contracts.md §2.5): a kind that loads but does not dispatch means code and the ' +
      'enumeration have drifted apart.',
  );
}
