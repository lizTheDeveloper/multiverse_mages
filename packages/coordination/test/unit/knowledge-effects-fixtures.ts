/*
 * Multiverse Mages — shared fixtures for the knowledge-effects tests.
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
 * A synthetic node, added to a **non-`v1`** shipped cell, is the way these
 * tests control exactly which primitive, mode, magnitude and target a held
 * instance contributes — the same technique `rules-magic`'s own effect-
 * pipeline tests use (`packages/rules-magic/test/unit/effect-fixtures.ts`'s
 * `registryWith`), reimplemented here because that file lives in a package
 * this workstream may not edit and is not part of `@mm/rules-magic`'s
 * published surface.
 *
 * A non-`v1` cell is chosen specifically so `node.schema.json`'s `mode-
 * technique-incoherent` check — enforced only where `cell.v1 === true` — does
 * not constrain which `mode` a synthetic effect may declare; every other
 * content invariant (a real `primitive`, a real `cell`, `effects` shaped per
 * `MODE_PAYLOADS`) still applies, so a broken fixture fails loudly at
 * `loadContent` rather than silently producing zero contributions.
 */

import { readFileSync } from 'node:fs';

import type { ContentFileName, ContentRegistry, ContentSource } from '@mm/content';
import { CONTENT_FILES, loadContent, memorySource, shippedContentSource, shippedDataDirectory } from '@mm/content';
import type { EntityHandle, Fixed, SimState } from '@mm/sim-core';
import { createState } from '@mm/sim-core';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  attachRecord,
  createUniverse,
  defineWorldStateSchema,
} from '@mm/state';

let cached: ContentRegistry | undefined;

/** The shipped content set, loaded once per process. */
export function shippedRegistry(): ContentRegistry {
  cached ??= loadContent(shippedContentSource());
  return cached;
}

/** The `node.json` documents, as loose objects, read fresh from disk. */
function shippedDocuments(): Record<ContentFileName, unknown> {
  const directory = shippedDataDirectory();
  const documents = {} as Record<ContentFileName, unknown>;
  for (const fileName of CONTENT_FILES) {
    documents[fileName] = JSON.parse(readFileSync(`${directory}/${fileName}`, 'utf8'));
  }
  return documents;
}

/** Applies one mutation to the shipped content and loads the result. */
export function registryWith(mutate: (documents: Record<ContentFileName, unknown>) => void): ContentRegistry {
  const documents = shippedDocuments();
  mutate(documents);
  const files: Record<string, string> = {};
  for (const fileName of CONTENT_FILES) {
    files[fileName] = JSON.stringify(documents[fileName]);
  }
  const source: ContentSource = memorySource(files, 'knowledge-effects-fixture');
  return loadContent(source);
}

/** A non-`v1`, non-Mentem cell every synthetic node in this file is added to. */
export const SYNTHETIC_CELL_ID = 'creo-animal';

/** One effect, shaped exactly as `node.schema.json`'s `MODE_PAYLOADS` requires per mode. */
export interface SyntheticEffect {
  readonly primitive: string;
  readonly magnitude: number;
  readonly mode: 'create' | 'remove' | 'control';
  readonly target?: 'universe' | 'self';
  readonly control?: { readonly floor?: number; readonly ceiling?: number };
}

/**
 * Appends one synthetic node to `node.json` and its id to
 * {@link SYNTHETIC_CELL_ID}'s `nodes` list, mutating `documents` in place.
 *
 * `control`-mode effects author a placeholder `magnitude` of `1` — required by
 * `node.schema.json`'s `minimum: 1`, and never read: `gatherEffects` marks a
 * `control` contribution's magnitude as not-a-source, and `knowledge-
 * effects.ts` reads only `effect.control` for one.
 */
export function addSyntheticNode(
  documents: Record<ContentFileName, unknown>,
  id: string,
  effect: SyntheticEffect,
): void {
  const cells = documents['cell.json'] as { id: string; nodes: string[] }[];
  const cell = cells.find((entry) => entry.id === SYNTHETIC_CELL_ID);
  if (cell === undefined) throw new Error(`fixture cell "${SYNTHETIC_CELL_ID}" not found in cell.json`);
  cell.nodes.push(id);

  const nodes = documents['node.json'] as unknown[];
  const built: Record<string, unknown> = {
    primitive: effect.primitive,
    magnitude: effect.mode === 'control' ? 1 : effect.magnitude,
    target: effect.target ?? 'universe',
    durationTicks: 0,
    mode: effect.mode,
    gloss: `synthetic ${effect.mode} effect for tests`,
  };
  if (effect.control !== undefined) built['control'] = effect.control;

  nodes.push({
    id,
    cell: SYNTHETIC_CELL_ID,
    name: id,
    gloss: 'a node authored only for knowledge-effects.ts tests',
    tier: 1,
    prerequisites: [],
    researchCost: 100,
    teachCost: 100,
    scribeCost: 100,
    rediscoveryMultiplier: 5376,
    effects: [built],
    knowledgeKind: 'episteme',
    tuningStatus: 'untuned',
  });
}

/** An empty world, with the shipped component schema. */
export function worldState(rootSeed = 20260811): SimState {
  return createState({ schema: defineWorldStateSchema(), rootSeed });
}

/**
 * A universe that permits every technique and every form, so a synthetic
 * node's cell is never dormant regardless of which cell it was added to.
 */
export function seedUniverse(state: SimState, registry: ContentRegistry): EntityHandle {
  const traditionId = registry.traditions[0]?.contentId;
  if (traditionId === undefined) throw new Error('the fixture registry ships no tradition');
  return createUniverse(state, {
    permittedTechniques: (1 << 5) - 1,
    permittedForms: (1 << 14) - 1,
    edictBudget: 4,
    traditionId,
    favor: 0,
    worship: 0,
    worshipTier: 0,
    prestige: 0,
    prestigeEarned: 0,
    terminalReason: 0,
    favorCap: 0,
    ascended: 0,
  });
}

/** Puts one knowledge instance directly into a mind — no gateway, no cost. */
export function inMind(
  state: SimState,
  holder: EntityHandle,
  nodeId: number,
  mastery: Fixed = 1024,
): EntityHandle {
  const handle = state.entities.create();
  attachRecord(state, KNOWLEDGE_INSTANCE, handle, {
    nodeId,
    locationKind: LOCATION_KIND.mind,
    locationId: holder,
    acquiredTick: 0,
    mastery,
  });
  return handle;
}

/** The interned id `@mm/content` assigned a synthetic node, by its string id. */
export function internedNodeId(registry: ContentRegistry, id: string): number {
  const found = registry.nodes.find((entry) => entry.record.id === id);
  if (found === undefined) throw new Error(`no node "${id}" in this fixture registry`);
  return found.contentId;
}
