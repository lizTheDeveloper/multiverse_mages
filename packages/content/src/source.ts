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

/** The eight content files of `docs/design/contracts.md` §2, in load order. */
export const CONTENT_FILES = [
  'technique.json',
  'form.json',
  'cell.json',
  'node.json',
  'species.json',
  'tradition.json',
  'primitive.json',
  'territory.json',
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
