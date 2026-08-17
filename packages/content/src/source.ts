/*
 * Multiverse Mages — where content bytes come from.
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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * A content set's bytes, named so that diagnostics can point at them.
 *
 * The indirection exists so that the loader's failure paths are testable
 * without a fixture directory per case: a test that wants "a node missing a
 * required field" writes one object literal, not a tree of eight files.
 */
export interface ContentSource {
  /** Prefix used in diagnostics, e.g. `data` or `fixture:cycle`. */
  readonly origin: string;
  /** Raw JSON text for one content file, or `undefined` if it is absent. */
  read(fileName: string): string | undefined;
}

/**
 * The content files, in load order.
 *
 * The first eight are `docs/design/contracts.md` §2's. The next two are
 * `god-agency`'s, and the last is `raid-engagement`'s; all three are a
 * deliberate extension of that list rather than a
 * violation of it: §2 was written before the god had verbs, and `CLAUDE.md`
 * requires that content — *"grid cells, nodes, species, primitives,
 * traditions"* — live in validated data files rather than in code. An
 * intervention's price and the worship formula's saturation constants are the
 * same kind of thing as a node's `researchCost`: numbers a balance sweep turns.
 * Putting them in the rules path as literals would make retuning them a code
 * change, and would put a balance magnitude somewhere `contentRevision` does not
 * cover — so two universes could disagree about what forbidding a technique
 * costs and still agree they were compatible.
 *
 * `raid-constant.json` earns its place twice over. It is the same argument —
 * how long a portal holds is a number a sweep turns, and two universes that
 * disagreed about it while agreeing they were compatible would fight two
 * different battles — and it is also where the termination proof is checked.
 * `stabilityDecayPerTick` is an authored raw integer whose validity is the
 * difference between a raid that ends and a worker that never returns, and the
 * cheapest place to meet that failure is the load.
 */
export const CONTENT_FILES = [
  'technique.json',
  'form.json',
  'cell.json',
  'node.json',
  'species.json',
  'tradition.json',
  'primitive.json',
  'territory.json',
  'god-cost.json',
  'god-constant.json',
  'raid-constant.json',
  'autonomy-weight.json',
  // Appended last, and the position is the same decision every other table's
  // is: `CONTENT_FILES` is a load order, and `grade-edge.json` references
  // `node.json` by id, so it must be read after the table it points into.
  'grade-edge.json',
] as const;

export type ContentFileName = (typeof CONTENT_FILES)[number];

/** Reads a content set from a directory on disk. */
export function directorySource(directory: string, origin?: string): ContentSource {
  return {
    origin: origin ?? directory,
    read(fileName) {
      try {
        return readFileSync(`${directory}/${fileName}`, 'utf8');
      } catch {
        return undefined;
      }
    },
  };
}

/** Reads a content set from memory. Absent keys are absent files. */
export function memorySource(
  files: Readonly<Record<string, string>>,
  origin = 'memory',
): ContentSource {
  return {
    origin,
    read(fileName) {
      return Object.hasOwn(files, fileName) ? files[fileName] : undefined;
    },
  };
}

/** Absolute path of this package's shipped `data/` directory. */
export function shippedDataDirectory(): string {
  return fileURLToPath(new URL('../data', import.meta.url));
}

/** Absolute path of this package's shipped `schema/` directory. */
export function shippedSchemaDirectory(): string {
  return fileURLToPath(new URL('../schema', import.meta.url));
}

/** The content set this package ships: the v1 grid, nodes, species, traditions, territory. */
export function shippedContentSource(): ContentSource {
  return directorySource(shippedDataDirectory(), 'data');
}
