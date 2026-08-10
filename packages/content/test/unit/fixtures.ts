/*
 * Multiverse Mages — helpers for building deliberately broken content sets.
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

import type { ContentFileName, ContentSource } from '@mm/content';
import { CONTENT_FILES, memorySource, shippedDataDirectory } from '@mm/content';

/**
 * The shipped content, parsed into plain mutable JSON.
 *
 * Failure fixtures are built by taking the real content set and breaking
 * exactly one thing, so that a test proves the loader rejects *that* defect
 * rather than a hand-written stub that was never valid to begin with.
 */
export function shippedDocuments(): Record<ContentFileName, unknown> {
  const directory = shippedDataDirectory();
  const documents = {} as Record<ContentFileName, unknown>;
  for (const fileName of CONTENT_FILES) {
    documents[fileName] = JSON.parse(readFileSync(`${directory}/${fileName}`, 'utf8'));
  }
  return documents;
}

/** Wraps parsed documents back into a source the loader can read. */
export function sourceOf(
  documents: Record<ContentFileName, unknown>,
  origin = 'fixture',
): ContentSource {
  const files: Record<string, string> = {};
  for (const fileName of CONTENT_FILES) {
    files[fileName] = JSON.stringify(documents[fileName]);
  }
  return memorySource(files, origin);
}

/** Applies one mutation to the shipped content and returns it as a source. */
export function brokenSource(
  mutate: (documents: Record<ContentFileName, unknown>) => void,
  origin = 'fixture',
): ContentSource {
  const documents = shippedDocuments();
  mutate(documents);
  return sourceOf(documents, origin);
}

/** Narrowing helper: the records of one content file, as loose objects. */
export function recordsOf(
  documents: Record<ContentFileName, unknown>,
  fileName: ContentFileName,
): Record<string, unknown>[] {
  return documents[fileName] as Record<string, unknown>[];
}

/** Finds one record by id, failing loudly if the fixture drifted from content. */
export function recordById(
  documents: Record<ContentFileName, unknown>,
  fileName: ContentFileName,
  id: string,
): Record<string, unknown> {
  const found = recordsOf(documents, fileName).find((record) => record['id'] === id);
  if (found === undefined) throw new Error(`fixture expected ${fileName} to contain "${id}"`);
  return found;
}
