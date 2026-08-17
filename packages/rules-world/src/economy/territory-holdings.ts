/*
 * Multiverse Mages — the land a universe holds, as state rather than as a
 * content aggregate.
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
 * ## `contracts.md` §2.7 wrote this move; this file makes it
 *
 * > *"`landUnits` is a per-universe endowment carried in content because a
 * > simulation instance holds exactly one universe (§1.1). When that stops being
 * > true — a raid that takes ground — `landUnits` moves to §1.1 and this record
 * > keeps `capacityPerLandUnit`, which is a property of the kind of country and
 * > not of who holds it."*
 *
 * So the split is: **content owns what a kind of country is like**
 * ({@link TerritoryKind}, read straight off `territory.json`), and **state owns
 * how much of it this universe holds** (the `territory-holding` component). The
 * summed extent `K` is derived from is then read out of state, not out of
 * content.
 *
 * ## Nothing here is spatial, and that is checkable rather than asserted
 *
 * `vision.md` §7a: *"World-scale entities carry no coordinates at all."* A
 * holding is a `(kind, count)` pair. There is no position on it, no extent, no
 * adjacency between two holdings, and no function in this file takes or returns
 * a distance. `assertNoWorldPositions` covers the component; this note covers
 * the arithmetic, because a distance could in principle have been synthesized
 * from ids and it deliberately is not.
 *
 * ## Materialization is lazy, and absent rows are not empty land
 *
 * A universe with no holding rows has *not yet been stepped by a build that
 * knows about holdings* — a snapshot written before world-schema revision 5, or
 * a scenario that seeded none. {@link materializeTerritoryHoldings} writes the
 * content endowment into state on the first tick that finds none, which is
 * `god-state`'s lazy-creation rule applied to the other piece of §1.1 state with
 * a content-derived starting value.
 *
 * **A universe that holds no ground carries rows saying `landUnits: 0`.** The
 * two are different states and only one of them can be repaired by reading
 * content. Colonization depends on the distinction, `migrations.ts` explains why
 * the repair could not have gone in the migration, and reading "no rows" as
 * "fall back to the content sum" would have aliased them permanently.
 */

import type { EntityHandle, SimState } from '@mm/sim-core';
import { FP_ONE, floorDiv } from '@mm/sim-core';
import type { ContentId, Fp } from '@mm/state';
import { TERRITORY_HOLDING, attachRecord, collectRecords } from '@mm/state';

import type { TerritoryExtent } from './carrying-capacity.js';
import { NO_TERRITORY } from './carrying-capacity.js';
import type { LandMaterialKind, LandYield, MaterialAmounts } from './kinds.js';
import { landYieldShares } from './kinds.js';

/**
 * What one kind of country is like, and what a universe founded on it starts
 * with — the content half of §2.7's split.
 *
 * Carried as a narrow record rather than as a `TerritoryRecord` so that the
 * rules path names only the three numbers it reads. `landUnits` is here because
 * it is the **founding endowment**, the value {@link materializeTerritoryHoldings}
 * seeds a holding row with; every read after that comes out of state.
 */
export interface TerritoryKind {
  /** Interned `territory` content id. Never `0`. */
  readonly kindId: ContentId;
  /** The founding endowment of this kind, in land units. A count, not `fp`. */
  readonly landUnits: number;
  /** People one land unit of this kind carries, `fp`. */
  readonly capacityPerLandUnit: Fp;
  /**
   * What one land unit of this kind produces, per land material kind, `fp`.
   *
   * The content half of §2.7's split again, and it belongs on this record for
   * exactly the reason `capacityPerLandUnit` does: *"a property of the kind of
   * country and not of who holds it."* A delta yields grain whoever the delta
   * belongs to. How much delta this universe has is the holding row's answer,
   * and {@link heldTerritoryYieldShares} is where the two meet.
   */
  readonly yieldPerLandUnit: Readonly<Record<LandMaterialKind, Fp>>;
  /** Multiplier on what a library standing here pays in upkeep, `fp`. */
  readonly libraryUpkeepMultiplier: Fp;
}

/** Whether this universe has any `territory-holding` row at all. */
export function hasTerritoryHoldings(state: SimState): boolean {
  for (const _ of collectRecords(state, TERRITORY_HOLDING)) return true;
  return false;
}

/**
 * Writes the founding endowment into state, once, if it is not there already.
 *
 * @returns the number of holding rows created — `0` on every tick after the
 * first, and on every tick of a universe whose scenario seeded its own.
 *
 * Kinds are written in the order given, which the composition root takes from
 * the interned content order (a code-unit sort of the ids, `intern.ts`), so the
 * handles this allocates are a function of content and not of iteration order
 * anywhere.
 *
 * A kind endowed with zero land units still gets a row. A universe that was
 * founded holding none of a kind and a universe that lost all of it are the same
 * state, and both are *"holds none"* rather than *"unknown"*.
 */
export function materializeTerritoryHoldings(
  state: SimState,
  kinds: readonly TerritoryKind[],
): number {
  if (hasTerritoryHoldings(state)) return 0;
  let created = 0;
  for (const kind of kinds) {
    if (!Number.isInteger(kind.landUnits) || kind.landUnits < 0) {
      throw new RangeError(
        `territory kind ${String(kind.kindId)} endows ${String(kind.landUnits)} land units; an ` +
          'endowment is a non-negative count, and a negative one would subtract capacity from ' +
          'the kinds beside it',
      );
    }
    const handle = state.entities.create();
    attachRecord(state, TERRITORY_HOLDING, handle, {
      kindId: kind.kindId,
      landUnits: kind.landUnits,
    });
    created += 1;
  }
  return created;
}

/**
 * The extent `K` is derived from, summed over what the universe **holds**.
 *
 * The state-side counterpart of `territoryExtent`, and deliberately a second
 * function rather than a widened first one: `territoryExtent` answers *"what
 * does this content set describe"* and is what `maxCarryingCapacity` states the
 * documented population bound in terms of, while this answers *"what does this
 * universe have"*. On a materialized world the two agree field for field, and
 * `territory-holdings.test.ts` proves it rather than assuming it.
 *
 * A universe with no rows yields {@link NO_TERRITORY} — the honest answer for a
 * world that has not been stepped, and never one the world loop can observe,
 * because {@link materializeTerritoryHoldings} runs first.
 *
 * A holding whose kind the content set does not declare contributes its land to
 * `landUnits` and nothing to `baseCapacity`. That combination is unreachable
 * within one `contentRevision` (§0 forbids universes with unequal revisions from
 * interacting) and is the conservative reading if it ever becomes reachable: the
 * land is still held, and country of an unknown kind is credited with feeding
 * nobody rather than with feeding a guess.
 */
export function heldTerritoryExtent(
  state: SimState,
  kinds: readonly TerritoryKind[],
): TerritoryExtent {
  const capacityOf = new Map<ContentId, Fp>();
  for (const kind of kinds) capacityOf.set(kind.kindId, kind.capacityPerLandUnit);

  let landUnits = 0;
  let baseCapacity = 0;
  let any = false;
  for (const { row } of collectRecords(state, TERRITORY_HOLDING)) {
    any = true;
    const held = Math.max(0, row.landUnits);
    landUnits += held;
    baseCapacity += floorDiv(held * Math.max(0, capacityOf.get(row.kindId) ?? 0), FP_ONE);
  }
  return any ? { landUnits, baseCapacity } : NO_TERRITORY;
}

/**
 * What this universe's land yields, as shares over the three land kinds — read
 * off **what it holds** rather than off what the content set describes.
 *
 * The exact counterpart of {@link heldTerritoryExtent}, and a second function
 * rather than a widened first one for the same §2.7 reason: `kinds.ts`'
 * `territoryYieldShares` answers *"what mix does this content set describe"*,
 * which is what a founding endowment is stated in terms of, and this answers
 * *"what mix does this universe's ground give it"*, which is what production
 * spends.
 *
 * ## Why this is not a refactor
 *
 * `WorldStepDeps` carried the content answer as a field computed once at the
 * composition root, documented as *"fixed for the length of a run"*. Every
 * universe in a run therefore produced the identical basket mix regardless of
 * its land, and `territory.json`'s own prose — `upland-pasture` *"carries herds
 * rather than fields"*, `deep-forest` *"timber and game"*, `river-delta`
 * *"three harvests a year"* — reached nothing. `kinds.ts` had already written
 * the intended design down: *"territory decides the mix and labour decides the
 * magnitude."* The mechanism existed and was switched off at the wire.
 *
 * On a freshly materialized world the two agree field for field, because
 * {@link materializeTerritoryHoldings} seeds exactly the content endowment;
 * `territory-holdings.test.ts` proves that rather than assuming it, and that
 * agreement is what makes this a wire rather than a balance change. They part
 * the moment a universe's holdings stop being the endowment.
 *
 * A holding whose kind the content set does not declare contributes **nothing**,
 * which is the same conservative reading {@link heldTerritoryExtent} takes for
 * `baseCapacity`: country of an unknown kind is credited with yielding nothing
 * rather than with yielding a guess.
 *
 * @returns Shares in `fp` summing to exactly `fp(1024)`. A universe with no
 * rows, or one holding only land that yields nothing, gets the whole share in
 * `food` — `landYieldShares`' answer, and the reason is there.
 */
export function heldTerritoryYieldShares(
  state: SimState,
  kinds: readonly TerritoryKind[],
): MaterialAmounts {
  const yieldOf = new Map<ContentId, Readonly<Record<LandMaterialKind, Fp>>>();
  for (const kind of kinds) yieldOf.set(kind.kindId, kind.yieldPerLandUnit);

  const held: LandYield[] = [];
  for (const { row } of collectRecords(state, TERRITORY_HOLDING)) {
    const yields = yieldOf.get(row.kindId);
    if (yields === undefined) continue;
    held.push({ landUnits: Math.max(0, row.landUnits), yieldPerLandUnit: yields });
  }
  return landYieldShares(held);
}

/**
 * The kind whose holding carries the most people —
 * `landUnits × capacityPerLandUnit` — with ties broken by the lower content id.
 *
 * This is the **documented default site** for a university founded by a god who
 * was not asked where to put it. §4.1 fixes the institution observation block at
 * four slots and §4.2 gives `fundUniversity` one parameter, the university
 * handle; adding a site parameter is §4.4's parameterized channel and a change
 * to the action space, which this capability does not make. Until then, founding
 * builds *where the most people already are*, which is both the obvious answer
 * and a deterministic one.
 *
 * Takes the holdings rather than the state so that one function answers the
 * question from both sides of §2.7's split: the world loop passes
 * {@link territoryHoldings}, and a scenario building tick zero — before any
 * holding row exists — passes the {@link TerritoryKind} endowment, whose rows
 * carry the same two fields and mean the same thing.
 *
 * @returns `0` when there is nothing to stand on at all, which leaves the new
 * university unsited and therefore neutral in every rate.
 */
export function defaultSiteKind(
  holdings: readonly { readonly kindId: ContentId; readonly landUnits: number }[],
  kinds: readonly TerritoryKind[],
): ContentId {
  const capacityOf = new Map<ContentId, Fp>();
  for (const kind of kinds) capacityOf.set(kind.kindId, kind.capacityPerLandUnit);

  let bestKind: ContentId = 0;
  let bestCarried = -1;
  for (const holding of holdings) {
    const carried =
      Math.max(0, holding.landUnits) * Math.max(0, capacityOf.get(holding.kindId) ?? 0);
    if (carried > bestCarried || (carried === bestCarried && holding.kindId < bestKind)) {
      bestCarried = carried;
      bestKind = holding.kindId;
    }
  }
  return bestCarried > 0 ? bestKind : 0;
}

/** Every holding, ascending by entity handle. Read-only; for reporting and tests. */
export function territoryHoldings(
  state: SimState,
): readonly { readonly handle: EntityHandle; readonly kindId: ContentId; readonly landUnits: number }[] {
  const rows: { handle: EntityHandle; kindId: ContentId; landUnits: number }[] = [];
  for (const { handle, row } of collectRecords(state, TERRITORY_HOLDING)) {
    rows.push({ handle, kindId: row.kindId, landUnits: row.landUnits });
  }
  return rows;
}
