/*
 * Multiverse Mages — helpers for the species-layer tests.
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
 * Failure fixtures are the shipped content with **exactly one thing broken**,
 * which is `packages/content`'s own convention and worth repeating here: a
 * hand-written stub proves only that something invalid was rejected, and it is
 * never obvious afterwards whether it was rejected for the reason the test
 * names. Breaking the real set means the control — the same pipeline with no
 * mutation — is the shipped content itself.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type {
  ContentDiagnostic,
  ContentFileName,
  ContentRegistry,
  ContentSource,
  SpeciesRecord,
} from '@mm/content';
import {
  CONTENT_FILES,
  ContentValidationError,
  loadContent,
  memorySource,
  shippedDataDirectory,
  shippedSchemaDirectory,
} from '@mm/content';

/** The shipped content, parsed into plain mutable JSON. */
export function shippedDocuments(): Record<ContentFileName, unknown> {
  const directory = shippedDataDirectory();
  const documents = {} as Record<ContentFileName, unknown>;
  for (const fileName of CONTENT_FILES) {
    documents[fileName] = JSON.parse(readFileSync(`${directory}/${fileName}`, 'utf8'));
  }
  return documents;
}

/** Applies one mutation to the shipped content and returns it as a source. */
export function brokenSource(
  mutate: (documents: Record<ContentFileName, unknown>) => void,
  origin = 'rules-world-fixture',
): ContentSource {
  const documents = shippedDocuments();
  mutate(documents);
  const files: Record<string, string> = {};
  for (const fileName of CONTENT_FILES) {
    files[fileName] = JSON.stringify(documents[fileName]);
  }
  return memorySource(files, origin);
}

/**
 * Asserts the source fails to load and returns the diagnostics.
 *
 * `contracts.md` §2: invalid content is a hard load failure, never a warning
 * and never a skipped record. A source that loaded would return a registry
 * here, so the throw is the assertion — not a convenience.
 */
export function expectHardFail(source: ContentSource): readonly ContentDiagnostic[] {
  try {
    loadContent(source);
  } catch (error) {
    if (error instanceof ContentValidationError) return error.diagnostics;
    throw error;
  }
  throw new Error('expected the content set to fail validation, but it loaded');
}

/** One species record out of a loaded registry, by id. */
export function speciesById(registry: ContentRegistry, id: string): SpeciesRecord {
  const found = registry.species.find((entry) => entry.record.id === id);
  if (found === undefined) throw new Error(`no species "${id}" in the loaded registry`);
  return found.record;
}

/** The shipped `species.json` JSON Schema, parsed. */
export function speciesSchema(): Record<string, unknown> {
  const path = `${shippedSchemaDirectory()}/species.schema.json`;
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

/** The declared properties of one species record in the schema. */
export function speciesSchemaProperties(): Record<string, unknown> {
  const definitions = speciesSchema()['$defs'] as Record<string, unknown>;
  const species = definitions['species'] as Record<string, unknown>;
  return species['properties'] as Record<string, unknown>;
}

/** The fields the schema marks required on a species record. */
export function speciesSchemaRequired(): readonly string[] {
  const definitions = speciesSchema()['$defs'] as Record<string, unknown>;
  const species = definitions['species'] as Record<string, unknown>;
  return species['required'] as readonly string[];
}

/** From packages/rules-world/test/unit/ up to the repository root. */
export const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * Splits a name into the words it is composed of, across both conventions the
 * codebase uses: `gnomeRediscoveryBonus` and `SPECIES_FP_TRAITS`.
 *
 * Shared by the two conformance scanners because they were written with two
 * copies of it and the copies disagreed: one flattened `speciesFairnessIndex`
 * into a single token and stopped matching anything at all. A scanner that
 * silently matches nothing is the failure mode both of them exist to prevent,
 * so the splitter is one function with one set of tests over it.
 */
export function wordsIn(text: string): string[] {
  return text
    .split(/[^A-Za-z0-9]+/u)
    .flatMap((part) =>
      part
        .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
        .split(' '),
    )
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
}
