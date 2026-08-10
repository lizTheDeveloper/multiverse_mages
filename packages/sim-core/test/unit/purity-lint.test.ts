/*
 * Multiverse Mages — proof that the float ban in the rules path is enforced.
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
 * Covers the "Float literal in rules path rejected" scenario of the
 * fixed-point requirement: a non-integer numeric literal or a floating-point
 * `Math.*` operation in the rules path must make the lint task exit non-zero.
 *
 * The rule config lives in `eslint.config.mjs` and is easy to weaken by
 * accident — narrowing a selector, adding a member to the `Math` allowlist —
 * with nothing failing to say so. This runs the project's real ESLint
 * configuration over source text and asserts the rules still fire.
 *
 * Snippets are linted from memory against a virtual path inside
 * `packages/sim-core/src`, which is what selects the core's config block. No
 * file is written, so there is nothing to leave behind if a test throws.
 */

import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/** From packages/sim-core/test/unit/ up to the repository root. */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/** A path that does not exist, chosen so the core's lint block applies. */
const virtualCoreFile = 'packages/sim-core/src/__lint-probe__.ts';

const eslint = new ESLint({ cwd: repoRoot });

async function lintAsCoreSource(code: string): Promise<ESLint.LintResult> {
  const results = await eslint.lintText(code, { filePath: virtualCoreFile });
  const result = results[0];
  if (result === undefined) {
    throw new Error('ESLint returned no result for the probe file');
  }
  return result;
}

/** The ESLint CLI exits non-zero exactly when there is at least one error. */
function wouldFailTheLintTask(result: ESLint.LintResult): boolean {
  return result.errorCount > 0;
}

describe('the rules path rejects floating point', () => {
  it('rejects a non-integer numeric literal', async () => {
    const result = await lintAsCoreSource('export const chance = 0.35;\n');
    expect(wouldFailTheLintTask(result)).toBe(true);
    expect(result.messages.map((message) => message.ruleId)).toContain('no-restricted-syntax');
  });

  it('rejects a non-integer literal written as a whole number', async () => {
    // `1.0` is integral in value but not in form, and writing it means somebody
    // is thinking in floats. The rule matches on raw text for this reason.
    const result = await lintAsCoreSource('export const one = 1.0;\n');
    expect(wouldFailTheLintTask(result)).toBe(true);
  });

  it('rejects a negative-exponent literal', async () => {
    const result = await lintAsCoreSource('export const tiny = 1e-6;\n');
    expect(wouldFailTheLintTask(result)).toBe(true);
  });

  it('rejects a floating-point Math operation', async () => {
    const result = await lintAsCoreSource('export const rounded = Math.floor(1);\n');
    expect(wouldFailTheLintTask(result)).toBe(true);
    expect(result.messages.map((message) => message.ruleId)).toContain('no-restricted-syntax');
  });

  it('rejects Math members nobody thought to ban, because the list is an allowlist', async () => {
    const result = await lintAsCoreSource('export const root = Math.sqrt(4);\n');
    expect(wouldFailTheLintTask(result)).toBe(true);
  });

  it('names the offending line', async () => {
    const result = await lintAsCoreSource('export const a = 1;\nexport const b = 2.5;\n');
    const offence = result.messages.find((message) => message.ruleId === 'no-restricted-syntax');
    expect(offence?.line).toBe(2);
  });
});

describe('the rules path allows integer arithmetic', () => {
  it('accepts integer-only source that uses the division operator', async () => {
    // The control. Binary `/` is deliberately not banned — integer division has
    // to happen somewhere, and floorDiv is where. If this snippet were rejected
    // the tests above would prove nothing, since everything would be.
    const result = await lintAsCoreSource(
      'export function halve(value: number): number {\n' +
        '  return (value - (value % 2)) / 2;\n' +
        '}\n',
    );
    expect(result.errorCount).toBe(0);
    expect(result.messages).toEqual([]);
  });

  it('accepts the integer-safe Math members', async () => {
    const result = await lintAsCoreSource(
      'export const clamped = Math.min(Math.max(Math.abs(-3), 0), 10);\n' +
        'export const product = Math.imul(3, 4);\n',
    );
    expect(result.errorCount).toBe(0);
  });
});
