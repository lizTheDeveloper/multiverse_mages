/*
 * Multiverse Mages — shared fixtures for the effect application pipeline tests.
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
 * Every fixture here is written as a *search over loaded content*, never as a
 * hardcoded node id.
 *
 * The v1 node graphs are authored in the same change as this pipeline, by
 * someone else, and they will keep moving after these tests are written. A test
 * that named `rl-portal` would go red on a content rename and tell the reader
 * nothing about whether the pipeline works. A test that asks the registry for
 * "a v1 node declaring a world-scale primitive" keeps meaning the same thing
 * whatever the content says — and if content ever stops containing one, the
 * failure names that fact directly.
 */

import { readFileSync } from 'node:fs';

import type {
  ContentFileName,
  ContentId,
  ContentRegistry,
  ContentSource,
  NodeRecord,
  PrimitiveRecord,
} from '@mm/content';
import {
  CONTENT_FILES,
  loadContent,
  memorySource,
  shippedContentSource,
  shippedDataDirectory,
} from '@mm/content';
import { TIME_MODE } from '@mm/sim-core';
import type { Edict, Ruleset } from '@mm/state';
import { EDICT_KIND, LOCATION_KIND } from '@mm/state';

import type { EffectSourceInstance } from '../../src/effects/index.js';
import { MASTERY_ACTIVATION_THRESHOLD, gatherEffects } from '../../src/effects/index.js';
import { NO_WORKINGS_STAND } from '../../src/workings/index.js';

// Re-exported so every gather fixture in the package names the same view.
export { NO_WORKINGS_STAND };

let cached: ContentRegistry | undefined;

/** The shipped content set, loaded once per process. */
export function shippedRegistry(): ContentRegistry {
  cached ??= loadContent(shippedContentSource());
  return cached;
}

/** Every technique and every form permitted, and no edicts. */
export function permissiveRuleset(): Ruleset {
  // Full 5-bit and 14-bit masks. Written as expressions over the axis counts so
  // that a grid resize does not leave a stale literal permitting the wrong set.
  return { permittedTechniques: (1 << 5) - 1, permittedForms: (1 << 14) - 1, edicts: [] };
}

/** The permissive ruleset with one cell interdicted. */
export function rulesetInterdicting(cellId: number): Ruleset {
  const edicts: Edict[] = [{ cellId, kind: EDICT_KIND.interdiction }];
  return { ...permissiveRuleset(), edicts };
}

/**
 * `cellOf(nodeId)` as task group 3 will publish it, resolved here through the
 * registry so these tests do not depend on a module another agent owns.
 *
 * Counts its own calls, because "legality is evaluated exactly once and never
 * re-evaluated downstream" is only testable if something observes the calls.
 */
export interface CountingCellOf {
  (nodeId: ContentId): number;
  calls: number;
}

export function countingCellOf(registry: ContentRegistry): CountingCellOf {
  const resolve = ((nodeId: ContentId): number => {
    resolve.calls += 1;
    const node = registry.node(nodeId);
    if (node === undefined) throw new Error(`no node interned at ${String(nodeId)}`);
    return registry.intern('cell', node.cell);
  }) as CountingCellOf;
  resolve.calls = 0;
  return resolve;
}

/** The interned cell id of a node's cell. */
export function cellIdOfNode(registry: ContentRegistry, nodeId: ContentId): number {
  const node = registry.node(nodeId);
  if (node === undefined) throw new Error(`no node interned at ${String(nodeId)}`);
  return registry.intern('cell', node.cell);
}

/** The string ids of every cell flagged `v1`. */
export function v1CellIds(registry: ContentRegistry): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const cell of registry.cells) {
    if (cell.record.v1 === true) ids.add(cell.record.id);
  }
  return ids;
}

/** Every v1 node, with its interned id. */
export function v1Nodes(
  registry: ContentRegistry,
): readonly { readonly contentId: ContentId; readonly record: NodeRecord }[] {
  const v1 = v1CellIds(registry);
  return registry.nodes.filter((node) => v1.has(node.record.cell));
}

/** The registry record for a primitive id, or a loud failure. */
export function primitiveRecord(registry: ContentRegistry, primitiveId: string): PrimitiveRecord {
  const found = registry.primitives.find((entry) => entry.record.id === primitiveId);
  if (found === undefined) throw new Error(`primitive.json has no "${primitiveId}"`);
  return found.record;
}

/**
 * A v1 node declaring `primitiveId`, chosen deterministically (registry order).
 *
 * @throws if content declares none, which is the coverage check's business but
 * would otherwise show up here as an inscrutable undefined.
 */
export function nodeDeclaring(
  registry: ContentRegistry,
  primitiveId: string,
): { readonly contentId: ContentId; readonly record: NodeRecord } {
  const found = v1Nodes(registry).find((node) =>
    node.record.effects.some((effect) => effect.primitive === primitiveId),
  );
  if (found === undefined) {
    throw new Error(`no v1 node declares "${primitiveId}"; the coverage check should have said so`);
  }
  return found;
}

/** Two distinct v1 nodes declaring the same primitive, or `undefined`. */
export function twoNodesDeclaring(
  registry: ContentRegistry,
  primitiveId: string,
): readonly [ContentId, ContentId] | undefined {
  const matches = v1Nodes(registry).filter((node) =>
    node.record.effects.some((effect) => effect.primitive === primitiveId),
  );
  const [first, second] = matches;
  if (first === undefined || second === undefined) return undefined;
  return [first.contentId, second.contentId];
}

/**
 * The one mage every fixture instance is filed against.
 *
 * A named constant rather than a literal `1`, so that a test which cares about
 * *whose* working stands has an obvious second value to reach for, and so that
 * `holder: TEST_HOLDER` reads as a deliberate choice rather than as a handle
 * somebody typed. Not `0` — `@mm/state` reserves that as the null handle, and a
 * fixture built on the null handle would pass every liveness test by accident.
 */
export const TEST_HOLDER = 1;

/** A second holder, for the tests that need two mages to differ. */
export const OTHER_HOLDER = 2;

/** A mind instance of `nodeId`, at the activation threshold unless told otherwise. */
export function mindInstance(
  nodeId: ContentId,
  mastery: number = MASTERY_ACTIVATION_THRESHOLD,
  holder: number = TEST_HOLDER,
): EffectSourceInstance {
  return { nodeId, holder, locationKind: LOCATION_KIND.mind, mastery };
}

/**
 * `count` v1 nodes that each contribute at world scale, in pairwise-distinct
 * cells — so interdicting one cell removes exactly one of them.
 *
 * Determined by running the pipeline rather than by reading content, so the
 * selection survives whatever the node graphs turn into.
 */
export function worldActiveNodesInDistinctCells(
  registry: ContentRegistry,
  count: number,
): readonly ContentId[] {
  const chosen: ContentId[] = [];
  const seenCells = new Set<number>();
  for (const node of v1Nodes(registry)) {
    const cellId = cellIdOfNode(registry, node.contentId);
    if (seenCells.has(cellId)) continue;
    const contributions = gatherEffects([mindInstance(node.contentId)], {
      registry,
      ruleset: permissiveRuleset(),
      mode: TIME_MODE.world,
      cellOf: countingCellOf(registry),
      standing: NO_WORKINGS_STAND,
    });
    if (contributions.length === 0) continue;
    seenCells.add(cellId);
    chosen.push(node.contentId);
    if (chosen.length === count) return chosen;
  }
  throw new Error(`v1 content has fewer than ${String(count)} world-active nodes in distinct cells`);
}

/** The shipped content, parsed into plain mutable JSON, for mutation fixtures. */
export function shippedDocuments(): Record<ContentFileName, unknown> {
  const directory = shippedDataDirectory();
  const documents = {} as Record<ContentFileName, unknown>;
  for (const fileName of CONTENT_FILES) {
    documents[fileName] = JSON.parse(readFileSync(`${directory}/${fileName}`, 'utf8'));
  }
  return documents;
}

/** Applies one mutation to the shipped content and loads the result. */
export function registryWith(
  mutate: (documents: Record<ContentFileName, unknown>) => void,
): ContentRegistry {
  const documents = shippedDocuments();
  mutate(documents);
  const files: Record<string, string> = {};
  for (const fileName of CONTENT_FILES) {
    files[fileName] = JSON.stringify(documents[fileName]);
  }
  const source: ContentSource = memorySource(files, 'coverage-mutation-fixture');
  return loadContent(source);
}

/** The `node.json` documents, as loose objects. */
export function nodeDocuments(
  documents: Record<ContentFileName, unknown>,
): Record<string, unknown>[] {
  return documents['node.json'] as Record<string, unknown>[];
}

/** The effect entries of one node document. */
export function effectsOf(node: Record<string, unknown>): Record<string, unknown>[] {
  return node['effects'] as Record<string, unknown>[];
}
