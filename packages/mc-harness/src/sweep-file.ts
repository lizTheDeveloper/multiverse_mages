/*
 * Multiverse Mages — reading a committed sweep specification off disk.
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
 * Task 8.5's other half: `balance/sweeps/` holds the committed sweeps, and this
 * is what turns one of those files into a {@link SweepSpec} without any caller
 * having to remember that "parse it" and "believe it" are two different steps.
 *
 * ## Why the sweeps are files and not TypeScript constants
 *
 * `sweep-spec.ts` says a sweep is *"declared in a committed file, not assembled
 * by a script, because the file is the experiment"*. A sweep held in code can be
 * built by a helper, parameterised by an environment variable, or subtly
 * differed between two call sites — and the run records would still all claim
 * one `sweepId`. A JSON file cannot do any of that. What it gives up is the
 * typechecker, which is why nothing here trusts the parse: {@link readSweepFile}
 * hands back either a validated spec or the reasons it is unusable, and the
 * suite validates every committed sweep against the real registries.
 *
 * The one thing this module refuses to do is default anything. A sweep file
 * missing `failureThreshold` is a sweep whose author did not decide, and a
 * default here would decide for them silently, in the file that is supposed to
 * be the record of the decision.
 */

import { readFileSync } from 'node:fs';

import type { SweepRegistries, SweepSpec } from './sweep-spec.js';
import { validateSweep } from './sweep-spec.js';

/** A parsed and validated sweep, or every reason it is not one. */
export type SweepFileResult =
  | { readonly spec: SweepSpec }
  | { readonly problems: readonly string[] };

/**
 * Parses sweep text and validates it against the registries a scenario exports.
 *
 * @returns the spec, or the problems. Never both, so a caller cannot use a spec
 * it was also told to reject.
 */
export function parseSweepFile(text: string, registries: SweepRegistries): SweepFileResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error: unknown) {
    return { problems: [`the sweep file is not valid JSON: ${(error as Error).message}`] };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { problems: ['the sweep file is not a JSON object.'] };
  }
  const spec = parsed as SweepSpec;
  const problems = validateSweep(spec, registries);
  if (problems.length > 0) return { problems };
  return { spec };
}

/** {@link parseSweepFile}, reading from a path. A missing file is a problem, not a throw. */
export function readSweepFile(path: string, registries: SweepRegistries): SweepFileResult {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error: unknown) {
    return { problems: [`the sweep file ${path} could not be read: ${(error as Error).message}`] };
  }
  return parseSweepFile(text, registries);
}
