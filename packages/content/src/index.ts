/*
 * Multiverse Mages — content package public surface.
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
 * `@mm/content` — the game's content substrate: the 5 × 14 grid, the v1 node
 * graphs, the six species, the three traditions, the effect primitive registry,
 * and the loader that validates and interns them.
 *
 * The package declares no runtime dependencies. Everything the loader needs —
 * JSON Schema interpretation, interning, hashing — is in this directory,
 * because content validation must be available wherever the simulation runs.
 */

export type {
  ContentDiagnostic,
  ContentDiagnosticCode,
} from './diagnostics.js';
export { ContentValidationError, formatDiagnostic, sortDiagnostics } from './diagnostics.js';

export type { HookParamProblem, HookPoint } from './hooks.js';
export { HOOK_KINDS, HOOK_POINTS, checkHookParams, hookPointOwning, permittedKinds } from './hooks.js';

export {
  CELL_COUNT,
  FORM_COUNT,
  TECHNIQUE_COUNT,
  cellAxes,
  internCell,
  internFromBit,
  internSorted,
} from './intern.js';

export type { ValidationResult } from './load.js';
export {
  REQUIRED_V1_CELL,
  V1_CELL_COUNT,
  V1_FORM_COUNT,
  V1_REDISCOVERY_AUTHORING_FLOOR,
  V1_TECHNIQUE_COUNT,
  contentSchemas,
  loadContent,
  validateContent,
} from './load.js';

export type { RevisionEntry } from './revision.js';
export { CONTENT_REVISION_ALGORITHM, computeContentRevision, hash128, revisionPreimage } from './revision.js';

export { CompiledSchema, SchemaCompileError, canonicalJson } from './json-schema.js';

export type { ContentFileName, ContentSource } from './source.js';
export {
  CONTENT_FILES,
  directorySource,
  memorySource,
  shippedContentSource,
  shippedDataDirectory,
  shippedSchemaDirectory,
} from './source.js';

export type { CliOutput } from './cli.js';
export { runValidation } from './cli.js';

export {
  AUDIO_FILES,
  audioSchemas,
  validateAudioContent,
  loadAudioContent,
  shippedAudioDirectory,
  audioSelect,
} from './audio.js';
export type { AudioFileName, AudioValidationResult } from './audio.js';
export type {
  AudioCueRecord,
  AudioCueKind,
  AudioBand,
  AudioGridPosition,
  VoiceLineBankRecord,
} from './audio-types.js';

export * from './types.js';
