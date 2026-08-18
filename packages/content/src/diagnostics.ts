/*
 * Multiverse Mages — content diagnostics and the hard-failure error type.
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
 * One thing wrong with the content set.
 *
 * Every diagnostic names a file and a JSON pointer into it, because the only
 * useful version of "your content is broken" is one an author can act on
 * without reading the loader (`docs/design/contracts.md` §2).
 */
export interface ContentDiagnostic {
  /** Content file the problem is in, relative to the content directory. */
  readonly file: string;
  /** RFC 6901 JSON pointer to the offending value. `""` means the document. */
  readonly pointer: string;
  /** Stable machine-readable classification, for tests and for tooling. */
  readonly code: ContentDiagnosticCode;
  /** Human-readable explanation, naming every id involved. */
  readonly message: string;
}

/**
 * Diagnostic classifications. Tests assert on these rather than on message
 * text, so that wording can improve without a test rewrite.
 */
export type ContentDiagnosticCode =
  | 'file-missing'
  | 'file-unparsable'
  | 'schema'
  | 'duplicate-id'
  | 'bit-assignment'
  | 'grid-coverage'
  | 'unknown-reference'
  | 'cell-node-mismatch'
  | 'v1-subset'
  | 'v1-unreachable-prerequisite'
  | 'prerequisite-cycle'
  | 'inverted-tier'
  | 'edict-conflict'
  | 'technique-sign'
  | 'asymmetric-exclusion'
  | 'self-exclusion'
  | 'intellego-exclusion'
  | 'content-invariant'
  | 'hook-set'
  | 'hook-kind'
  | 'hook-params'
  | 'species-invariant'
  | 'envelope-imbalance'
  | 'grade-ladder';

/**
 * Thrown by {@link loadContent} when the content set has any defect at all.
 *
 * It carries *every* diagnostic found, not the first. A loader that stops at
 * the first error turns a ten-minute content fix into ten separate ten-minute
 * content fixes, and the second-order effect is that people stop running it.
 */
export class ContentValidationError extends Error {
  readonly diagnostics: readonly ContentDiagnostic[];

  constructor(diagnostics: readonly ContentDiagnostic[]) {
    super(
      `Content validation failed with ${String(diagnostics.length)} problem(s):\n` +
        diagnostics.map((d) => `  ${formatDiagnostic(d)}`).join('\n'),
    );
    this.name = 'ContentValidationError';
    this.diagnostics = diagnostics;
  }
}

/** `file#pointer [code] message` — one line, greppable, stable. */
export function formatDiagnostic(diagnostic: ContentDiagnostic): string {
  const pointer = diagnostic.pointer === '' ? '#' : `#${diagnostic.pointer}`;
  return `${diagnostic.file}${pointer} [${diagnostic.code}] ${diagnostic.message}`;
}

/**
 * Sort diagnostics into a stable, file-then-pointer order.
 *
 * Two runs over the same broken content must print the same report in the same
 * order, or a CI diff of validation output is noise. Comparison is by code unit
 * (`<`), never `localeCompare`, which varies with the ICU build.
 */
export function sortDiagnostics(
  diagnostics: readonly ContentDiagnostic[],
): readonly ContentDiagnostic[] {
  return [...diagnostics].sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.pointer !== b.pointer) return a.pointer < b.pointer ? -1 : 1;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    if (a.message !== b.message) return a.message < b.message ? -1 : 1;
    return 0;
  });
}

/** Escapes a property name for inclusion in a JSON pointer (RFC 6901 §3). */
export function pointerSegment(name: string): string {
  return name.replaceAll('~', '~0').replaceAll('/', '~1');
}

/** Appends one segment to a JSON pointer. */
export function pointerAppend(pointer: string, segment: string | number): string {
  return `${pointer}/${typeof segment === 'number' ? String(segment) : pointerSegment(segment)}`;
}
