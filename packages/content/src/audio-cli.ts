/*
 * Multiverse Mages — the audio content validation CLI.
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
 * `validate-audio [directory ...]` — validates one or more audio content sets
 * and reports **every** violation in the run.
 *
 * A thin projection of {@link validateAudioContent}, mirroring `cli.ts`'s
 * structure and output format so the two validators read as one system rather
 * than two independently invented ones. Kept as a separate binary — not folded
 * into `validate-content` — for the same reason audio stays out of
 * `CONTENT_FILES`: the two content sets have different compatibility
 * requirements and must be able to fail independently.
 */

import { shippedAudioDirectory, validateAudioContent } from './audio.js';
import type { CliOutput } from './cli.js';
import { consoleOutput } from './cli.js';
import { formatDiagnostic } from './diagnostics.js';
import type { ContentSource } from './source.js';
import { directorySource } from './source.js';

/**
 * Validates every named audio content set. Returns a process exit code: `0`
 * when all of them are clean, `1` when any is not.
 */
export function runAudioValidation(argv: readonly string[], output: CliOutput = consoleOutput): number {
  const sources: ContentSource[] =
    argv.length === 0
      ? [directorySource(shippedAudioDirectory(), 'data/audio')]
      : argv.map((directory) => directorySource(directory));

  let failed = 0;
  let totalViolations = 0;

  for (const source of sources) {
    const result = validateAudioContent(source);

    if (result.diagnostics.length === 0) {
      output.out(
        `${source.origin}: OK — ${String(result.cues?.length ?? 0)} cues, ` +
          `${String(result.banks?.length ?? 0)} voice-line banks`,
      );
      continue;
    }

    failed += 1;
    totalViolations += result.diagnostics.length;
    output.err(`${source.origin}: FAILED with ${String(result.diagnostics.length)} violation(s)`);
    for (const diagnostic of result.diagnostics) {
      output.err(`  ${formatDiagnostic(diagnostic)}`);
    }
  }

  if (failed > 0) {
    output.err(
      `\nAudio content validation FAILED: ${String(totalViolations)} violation(s) across ` +
        `${String(failed)} of ${String(sources.length)} content set(s).`,
    );
    return 1;
  }

  output.out(`Audio content validation passed: ${String(sources.length)} content set(s).`);
  return 0;
}
