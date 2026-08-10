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
import type { Edict, Ruleset } from '@mm/state';
import { EDICT_KIND } from '@mm/state';

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
