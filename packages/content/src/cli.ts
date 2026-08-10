/*
 * Multiverse Mages — the content validation CLI.
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
 * `validate-content [directory ...]` — validates one or more content sets and
 * reports **every** violation in the run.
 *
 * Reporting all of them is the point. A validator that stops at the first error
 * makes fixing a content set an interactive game of whack-a-mole, and the
 * observed consequence is that people stop running it before committing and
 * start finding out in CI. The loader is written the same way, and the CLI is a
 * thin projection of it.
 */

import { formatDiagnostic } from './diagnostics.js';
import { validateContent } from './load.js';
import type { ContentSource } from './source.js';
import { directorySource, shippedContentSource } from './source.js';

/** Somewhere for the CLI to write. Injected so tests read output as strings. */
export interface CliOutput {
  out(line: string): void;
  err(line: string): void;
}

/** Writes to the process's own streams. */
export const consoleOutput: CliOutput = {
  out: (line) => {
    console.log(line);
  },
  err: (line) => {
    console.error(line);
  },
};

/**
 * Validates every named content set. Returns a process exit code: `0` when all
 * of them are clean, `1` when any is not.
 */
export function runValidation(argv: readonly string[], output: CliOutput = consoleOutput): number {
  const sources: ContentSource[] =
    argv.length === 0
      ? [shippedContentSource()]
      : argv.map((directory) => directorySource(directory));

  let failed = 0;
  let totalViolations = 0;

  for (const source of sources) {
    const result = validateContent(source);

    if (result.registry !== undefined) {
      const counts = result.registry.counts;
      output.out(
        `${source.origin}: OK — ${String(counts.techniques)} techniques, ${String(counts.forms)} forms, ` +
          `${String(counts.cells)} cells (${String(counts.v1Cells)} flagged v1), ${String(counts.nodes)} nodes, ` +
          `${String(counts.species)} species, ${String(counts.traditions)} traditions, ` +
          `${String(counts.primitives)} primitives`,
      );
      output.out(`${source.origin}: contentRevision ${result.registry.contentRevision}`);
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
      `\nContent validation FAILED: ${String(totalViolations)} violation(s) across ` +
        `${String(failed)} of ${String(sources.length)} content set(s).\n` +
        'Every violation in the run is listed above — invalid content is a hard load\n' +
        'failure, never a skipped record (docs/design/contracts.md §2).',
    );
    return 1;
  }

  output.out(`Content validation passed: ${String(sources.length)} content set(s).`);
  return 0;
}
