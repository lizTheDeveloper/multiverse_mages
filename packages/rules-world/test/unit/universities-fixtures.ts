/*
 * Multiverse Mages — helpers for the universities tests.
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
 * Primitive records come from the shipped content rather than from a literal,
 * because the stacking rule and the cap are the things under test. A
 * hand-written `{ stacking: 'additive-into-multiplier', cap: 4096 }` would
 * assert that this package can add, and nothing about whether it obeys
 * `contracts.md` §3.
 */

import type { EntityHandle, SimState } from '@mm/sim-core';
import { createState } from '@mm/sim-core';
import type { ContentRegistry, PrimitiveRecord, SpeciesRecord } from '@mm/content';
import { loadContent, shippedContentSource } from '@mm/content';
import {
  GRIMOIRE,
  HOLDER_KIND,
  KNOWLEDGE_INSTANCE,
  LIBRARY,
  LOCATION_KIND,
  attachRecord,
  defineWorldStateSchema,
} from '@mm/state';

const registry: ContentRegistry = loadContent(shippedContentSource());

const speciesById = new Map<string, SpeciesRecord>(
  registry.species.map((entry) => [entry.record.id, entry.record]),
);

/** One shipped species record, by id. */
export function speciesNamed(id: string): SpeciesRecord {
  const found = speciesById.get(id);
  if (found === undefined) throw new Error(`no species "${id}" in the shipped registry`);
  return found;
}

/** One shipped primitive record, by id. */
export function primitiveNamed(id: string): PrimitiveRecord {
  const found = registry.primitives.find((entry) => entry.record.id === id);
  if (found === undefined) throw new Error(`no primitive "${id}" in the shipped registry`);
  return found.record;
}

/** The `build-rate` primitive, with its contracted stacking rule and cap. */
export function buildRatePrimitive(): PrimitiveRecord {
  return primitiveNamed('build-rate');
}

/** The `scribe-rate` primitive. */
export function scribeRatePrimitive(): PrimitiveRecord {
  return primitiveNamed('scribe-rate');
}

/** The `research-rate` primitive. */
export function researchRatePrimitive(): PrimitiveRecord {
  return primitiveNamed('research-rate');
}

/** An empty world, with the shipped component schema. */
export function worldState(rootSeed = 20260811): SimState {
  return createState({ schema: defineWorldStateSchema(), rootSeed });
}

/** Creates a library entity. */
export function makeLibrary(state: SimState, foundedTick = 0): EntityHandle {
  const handle = state.entities.create();
  attachRecord(state, LIBRARY, handle, { foundedTick });
  return handle;
}

/**
 * Shelves one knowledge instance in a library.
 *
 * `locationKind` 3 with the library's handle, per `contracts.md` §1.5 — the
 * instance is *rewritten* to the library rather than duplicated there, so a
 * fixture that also left a grimoire-located instance behind would be modelling
 * the double-count §1.5 forbids.
 */
export function shelve(
  state: SimState,
  library: EntityHandle,
  nodeId: number,
  options: { mastery?: number; acquiredTick?: number } = {},
): EntityHandle {
  const handle = state.entities.create();
  attachRecord(state, KNOWLEDGE_INSTANCE, handle, {
    nodeId,
    locationKind: LOCATION_KIND.library,
    locationId: library,
    acquiredTick: options.acquiredTick ?? 0,
    mastery: options.mastery ?? 1024,
  });
  return handle;
}

/** Puts one knowledge instance in a mage's mind. */
export function inMind(state: SimState, mage: EntityHandle, nodeId: number): EntityHandle {
  const handle = state.entities.create();
  attachRecord(state, KNOWLEDGE_INSTANCE, handle, {
    nodeId,
    locationKind: LOCATION_KIND.mind,
    locationId: mage,
    acquiredTick: 0,
    mastery: 1024,
  });
  return handle;
}

/** Puts a grimoire on a library's shelves, per the §1.5 holder association. */
export function holdGrimoire(
  state: SimState,
  library: EntityHandle,
  nodeId: number,
  durability = 1024,
): EntityHandle {
  const handle = state.entities.create();
  attachRecord(state, GRIMOIRE, handle, {
    nodeId,
    durability,
    holderKind: HOLDER_KIND.library,
    holderId: library,
  });
  return handle;
}

/**
 * A tier lookup over a synthetic node numbering: node `n` has tier
 * `((n - 1) % 7) + 1`.
 *
 * Synthetic rather than the shipped node graph, because these tests are about
 * counting by tier and the shipped graph's tier distribution is content that
 * will change. A test that broke when someone authored a new tier-5 node would
 * be a test about content.
 */
export function syntheticTierOf(nodeId: number): number {
  return ((nodeId - 1) % 7) + 1;
}

/** Every node with the same tier, for a library that is uniformly deep. */
export function fixedTier(tier: number): (nodeId: number) => number {
  return () => tier;
}
