/*
 * Multiverse Mages — where a university stands, and the two things that
 * changes.
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
 * ## A site is a relationship, and §7a says relationships are what world scale
 * is made of
 *
 * > *"At **world scale** there is no map. Universities, populations, materials,
 * > and knowledge are **counts and relationships**. […] **World-scale entities
 * > carry no coordinates at all.**"* — `vision.md` §7a
 *
 * What §7a forbids is coordinates, continuous space, distance, and the spatial
 * indexing that would make world-time Monte Carlo expensive. What it names as
 * permitted is counts and relationships. *"This university stands in that kind
 * of country"* is a relationship: it makes **co-location** expressible (two
 * universities with the same site stand in the same country) and it makes
 * **terrain** expressible, and it makes neither distance nor direction
 * expressible, because at this scale neither exists.
 *
 * Nothing in this file takes, returns, or derives a distance. If a rule ever
 * needs one, the rule has left §7a and belongs in a raid.
 *
 * ## What a site changes: two things, and three it deliberately does not
 *
 * **1. Seats, through {@link siteCapacityMultiplier}.** A university's `capacity`
 * (`contracts.md` §1.4) is its *designed* seat count — how many desks were
 * built. How many students the surrounding country can actually keep at those
 * desks is a property of the country, and `territory.json` already authors it:
 * `capacityPerLandUnit` spans 512 to 40960, an **80× spread in what a unit of
 * land supports**. Reading it against the ordinary country rather than inventing
 * a second knob is the whole design here.
 *
 * This one number reaches both halves of what siting has to move:
 *
 * - `completedCapacity` → `seatsBonus` → `K` → the fertility brake → **population**
 * - `universityCapacity` → student demand → students → promotion → mages →
 *   **knowledge**
 *
 * **2. Library upkeep, through `libraryUpkeepMultiplier`.** Authored on the
 * territory record and applied in `library.ts`. It is deliberately
 * **anti-correlated** with the first: the delta feeds people and floods the
 * archive, the highland waste starves people and is cold and dry. Without an
 * opposing term, siting would be a *ranking* rather than a decision and the
 * richest country would strictly dominate; with one, the god who wants a large
 * academy and the god who wants a surviving library want different ground.
 *
 * **Not build cost.** `advanceConstruction` has no caller anywhere in the tree
 * and the reference academy is seeded complete, so a terrain term on build rate
 * would be an unmeasurable one.
 *
 * **Not materials yield.** Production is a populace quantity — laborer cohorts
 * and their species affinity — not a university relationship. Siting a building
 * is not what changes what farmers grow, and routing it through `materialsBonus`
 * would perturb `K` by a second path and muddy the proof that the universe-level
 * extent is unchanged.
 *
 * **Not worship.** `worshipInputs` keeps reading the *designed* `capacity`
 * through `effectiveCapacity`. Worship in §7 follows *"the number and devotion of
 * mages, universities, and populace"* — what the institution **is**, not how well
 * the harvest went — and leaving it alone keeps the snowball metric measuring
 * one thing.
 *
 * ## Every magnitude here is untuned
 *
 * `docs/design/release-plan.md`. The three constants below were chosen to make
 * the mechanism observable across the shipped five kinds, not to be right.
 */

import type { EntityHandle, Fixed, SimState } from '@mm/sim-core';
import { FP_ONE, floorDiv, mul } from '@mm/sim-core';
import type { ContentId, UniversityRecord } from '@mm/state';
import { UNIVERSITY_SITE, attachRecord, componentOf } from '@mm/state';

import type { TerritoryKind } from '../economy/territory-holdings.js';

import { effectiveCapacity } from './construction.js';

/**
 * The `capacityPerLandUnit` a site multiplier of `fp(1024)` corresponds to.
 *
 * `20480` — `arable-lowland`, whose own gloss says why it is the reference:
 * *"The ordinary country most people live in, and the reason there are most
 * people."* A university in ordinary country gets exactly its designed seats,
 * so the multiplier reads as *"how much better or worse than ordinary is this
 * ground"* rather than as a number requiring a table to interpret.
 *
 * Anchoring to a shipped value rather than to a round number is deliberate: a
 * round anchor would put every authored kind on one side of neutral, and the
 * content set would have no neutral case for a test to pin against.
 * **Untuned.**
 */
export const SITE_REFERENCE_CAPACITY_PER_LAND_UNIT: Fixed = 20_480;

/**
 * The most a site may multiply a university's seats, `fp`. **Untuned.**
 *
 * `fp(2048)` — the best country in the world doubles what a building holds and
 * does not treble it. The delta's 40960 lands exactly here, so the cap is
 * currently reached rather than merely approached, and a richer kind authored
 * later gains nothing further: the ceiling is a property of the rule, not of
 * whatever content happens to ship.
 */
export const SITE_CAPACITY_MAX: Fixed = 2048;

/**
 * The least a site may multiply a university's seats, `fp`. **Untuned.**
 *
 * `fp(128)` — an eighth. Bad ground makes an academy small; it does not make it
 * a ruin. A floor rather than an unbounded ramp because `highland-waste` is
 * `1/40` of the reference, and forty-fold attenuation would make a university
 * there hold zero students at any capacity the god can afford — an effect
 * indistinguishable from the building not existing, which is a worse answer than
 * a small building and is not what §1.4 says an unfinished university is.
 */
export const SITE_CAPACITY_MIN: Fixed = 128;

/**
 * What this kind of country does to a university's seats, `fp`.
 *
 * `clamp(capacityPerLandUnit × fp(1024) / SITE_REFERENCE, MIN, MAX)`. Over the
 * shipped kinds:
 *
 * | kind | `capacityPerLandUnit` | multiplier |
 * |---|---|---|
 * | `river-delta` | 40960 | 2048 (at the cap) |
 * | `arable-lowland` | 20480 | 1024 (neutral, by construction) |
 * | `upland-pasture` | 6144 | 307 |
 * | `deep-forest` | 3072 | 153 |
 * | `highland-waste` | 512 | 128 (at the floor) |
 *
 * An unknown or absent kind is `fp(1024)`. That is the same neutral an unsited
 * university gets, and it is what makes a world-schema revision-4 save behave
 * exactly as it did before sites existed.
 */
export function siteCapacityMultiplier(kind: TerritoryKind | undefined): Fixed {
  if (kind === undefined) return FP_ONE;
  const raw = floorDiv(
    Math.max(0, kind.capacityPerLandUnit) * FP_ONE,
    SITE_REFERENCE_CAPACITY_PER_LAND_UNIT,
  );
  return Math.min(SITE_CAPACITY_MAX, Math.max(SITE_CAPACITY_MIN, raw));
}

/**
 * Seats a completed university actually keeps filled on its site.
 *
 * `effectiveCapacity` first, so an unfinished university is zero on any ground:
 * a building that does not exist is not made to exist by the country around it.
 *
 * Floored, like every `fp` product in the rules path, which means a one-seat
 * academy on the worst ground holds nobody. That is the arithmetic saying what
 * the rule says — bad country cannot keep a single student at a single desk —
 * rather than a rounding artifact to be corrected with a `Math.max(1, …)`.
 */
export function sitedCapacity(university: UniversityRecord, siteMultiplier: Fixed): number {
  return mul(effectiveCapacity(university), Math.max(0, siteMultiplier));
}

/** The content id of the kind a university stands in, or `0` if it is unsited. */
export function siteKindOf(state: SimState, university: EntityHandle): ContentId {
  const store = componentOf(state, UNIVERSITY_SITE);
  if (!store.has(university)) return 0;
  return store.get(university, 'kindId');
}

/**
 * Puts a university in a kind of country, or moves it.
 *
 * Idempotent, and a re-site overwrites rather than adding a second row: §1.4
 * gives a university one site, and two rows would make *"which country is this
 * in"* depend on iteration order.
 *
 * `kindId` of `0` is refused rather than treated as "unsite". Unsited is the
 * absence of a row — the state a pre-revision-5 save is in — and a caller
 * reaching for the null content id is a caller who has lost the site somewhere
 * upstream and should hear about it there.
 */
export function siteUniversity(
  state: SimState,
  university: EntityHandle,
  kindId: ContentId,
): void {
  if (kindId === 0) {
    throw new RangeError(
      'a university cannot be sited on content id 0: that is the reserved null, and "unsited" is ' +
        'the absence of a university-site row rather than a row naming nothing',
    );
  }
  const store = componentOf(state, UNIVERSITY_SITE);
  if (store.has(university)) {
    store.set(university, 'kindId', kindId);
    return;
  }
  attachRecord(state, UNIVERSITY_SITE, university, { kindId });
}

/** Indexes territory kinds by content id, for the per-tick reads below. */
export function territoryKindIndex(
  kinds: readonly TerritoryKind[],
): ReadonlyMap<ContentId, TerritoryKind> {
  return new Map(kinds.map((kind) => [kind.kindId, kind]));
}
