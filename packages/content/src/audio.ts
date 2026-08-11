/*
 * Multiverse Mages — the audio content set.
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
 * Audio content is a second, parallel content set. It reuses the JSON Schema
 * interpreter (`json-schema.ts`) and nothing else from the simulation content
 * pipeline.
 *
 * **It must never join `CONTENT_FILES`, `loadContent()`, or `contentRevision`.**
 * `contentRevision` is a compatibility gate (`docs/design/contracts.md` §0): two
 * universes may interact only if theirs are equal, with no negotiation. If audio
 * joined the loader, fixing a typo in a voice line would stop two players
 * raiding each other, and would churn every golden replay fixture over a change
 * no player experiences as a rules change. `test/unit/audio-isolation.test.ts`
 * is what makes that regression fail in CI.
 */

import { fileURLToPath } from 'node:url';

import { ContentValidationError, sortDiagnostics } from './diagnostics.js';
import type { ContentDiagnostic } from './diagnostics.js';
import { CompiledSchema } from './json-schema.js';
import { directorySource } from './source.js';
import type { ContentSource } from './source.js';
import type { AudioCueRecord, VoiceLineBankRecord } from './audio-types.js';

/**
 * The audio content files. **Deliberately not `CONTENT_FILES`** — see the module
 * doc comment and `test/unit/audio-isolation.test.ts`.
 */
export const AUDIO_FILES = ['audio-cue.json', 'voice-line.json'] as const;

export type AudioFileName = (typeof AUDIO_FILES)[number];

/** Absolute path of this package's shipped `data/audio` directory. */
export function shippedAudioDirectory(): string {
  return fileURLToPath(new URL('../data/audio', import.meta.url));
}

/** Absolute path of this package's shipped `schema/audio` directory. */
export function shippedAudioSchemaDirectory(): string {
  return fileURLToPath(new URL('../schema/audio', import.meta.url));
}

let cachedAudioSchemas: ReadonlyMap<AudioFileName, CompiledSchema> | undefined;

export function audioSchemas(): ReadonlyMap<AudioFileName, CompiledSchema> {
  if (cachedAudioSchemas !== undefined) return cachedAudioSchemas;
  const source = directorySource(shippedAudioSchemaDirectory(), 'schema/audio');
  const compiled = new Map<AudioFileName, CompiledSchema>();
  for (const fileName of AUDIO_FILES) {
    const schemaName = fileName.replace(/\.json$/u, '.schema.json');
    const text = source.read(schemaName);
    if (text === undefined) {
      throw new Error(`audio schema ${schemaName} is missing from ${source.origin}`);
    }
    compiled.set(fileName, new CompiledSchema(JSON.parse(text), `schema/audio/${schemaName}`));
  }
  cachedAudioSchemas = compiled;
  return compiled;
}

export interface AudioValidationResult {
  readonly diagnostics: readonly ContentDiagnostic[];
  readonly cues?: readonly AudioCueRecord[];
  readonly banks?: readonly VoiceLineBankRecord[];
}

export function validateAudioContent(source: ContentSource): AudioValidationResult {
  const diagnostics: ContentDiagnostic[] = [];
  const parsed = new Map<AudioFileName, unknown>();

  for (const fileName of AUDIO_FILES) {
    const text = source.read(fileName);
    if (text === undefined) {
      diagnostics.push({
        file: fileName,
        pointer: '',
        code: 'file-missing',
        message: `audio file is missing from ${source.origin}`,
      });
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      diagnostics.push({
        file: fileName,
        pointer: '',
        code: 'file-unparsable',
        message: `not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    const schema = audioSchemas().get(fileName);
    if (schema === undefined) throw new Error(`no compiled schema for ${fileName}`);
    diagnostics.push(...schema.validate(json, fileName));
    parsed.set(fileName, json);
  }

  if (diagnostics.length > 0) return { diagnostics: sortDiagnostics(diagnostics) };

  return {
    diagnostics: [],
    cues: parsed.get('audio-cue.json') as readonly AudioCueRecord[],
    banks: parsed.get('voice-line.json') as readonly VoiceLineBankRecord[],
  };
}

export function loadAudioContent(source: ContentSource): {
  readonly cues: readonly AudioCueRecord[];
  readonly banks: readonly VoiceLineBankRecord[];
} {
  const result = validateAudioContent(source);
  if (result.diagnostics.length > 0) throw new ContentValidationError(result.diagnostics);
  return { cues: result.cues ?? [], banks: result.banks ?? [] };
}

/**
 * Deterministic audio variant selection (sound-design.md §0.2).
 *
 * Never draws from a simulation RNG stream. Contracts §6 makes the registry
 * append-only and baseline-coupled, so an audio draw would invalidate every
 * committed balance baseline. Hashing state costs nothing and makes replays
 * sound identical to the run that recorded them.
 *
 * Integer-only, so it behaves identically in the renderer and in a test.
 */
export function audioSelect(
  rootSeed: number,
  tick: number,
  entityId: number,
  kind: string,
  repeat: number,
  variantCount: number,
): number {
  if (variantCount < 1) throw new RangeError('variantCount must be at least 1');
  let hash = 0x811c9dc5;
  const mix = (value: number): void => {
    let remaining = value >>> 0;
    for (let byte = 0; byte < 4; byte += 1) {
      hash = Math.imul(hash ^ (remaining & 0xff), 0x01000193) >>> 0;
      remaining >>>= 8;
    }
  };
  mix(rootSeed);
  mix(tick);
  mix(entityId);
  for (let i = 0; i < kind.length; i += 1) {
    hash = Math.imul(hash ^ kind.charCodeAt(i), 0x01000193) >>> 0;
  }
  mix(repeat);
  return hash % variantCount;
}
