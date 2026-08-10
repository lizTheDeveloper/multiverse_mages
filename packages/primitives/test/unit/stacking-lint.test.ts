/*
 * Multiverse Mages — proof that the inline-stacking ban actually fires.
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
 * The lesson this file is paying forward: `packages/sim-core`'s Node-built-in
 * ban was correct-looking and porous from the day it was written — dynamic
 * `import()` walked straight through it — and nothing in the repository was
 * positioned to notice for as long as nobody wrote a test for the rule itself.
 * An enforcement mechanism that is never exercised is a comment.
 *
 * So the ban on combining primitive magnitudes inline is exercised here, the
 * same way `packages/sim-core/test/unit/purity-lint.test.ts` exercises the
 * purity bans: synthetic source, linted through the project's *real* ESLint
 * configuration, at virtual paths chosen so a particular config block applies.
 * Nothing is written to disk.
 *
 * Two of the paths matter as much as the source does:
 *
 * - `packages/rules-magic/src/...` — a consumer. The ban must fire.
 * - `packages/primitives/src/...` — the shared implementation. The same source
 *   must lint clean, because a rule that also forbids the one legitimate
 *   implementation is a rule someone disables.
 *
 * `packages/rules-magic` does not exist yet. That is deliberate: the config
 * block is written against every package's `src`, so the ban is already in
 * force for the rules packages on the day they are created, rather than being
 * remembered afterwards.
 */

import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/** From packages/primitives/test/unit/ up to the repository root. */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/** A consumer of the registry: subject to the ban. */
const consumerFile = 'packages/rules-magic/src/__lint-probe__.ts';

/** The shared implementation: exempt from the ban, subject to the float ban. */
const sharedFile = 'packages/primitives/src/__lint-probe__.ts';

const eslint = new ESLint({ cwd: repoRoot });

async function lintAt(filePath: string, code: string): Promise<ESLint.LintResult> {
  const results = await eslint.lintText(code, { filePath });
  const result = results[0];
  if (result === undefined) {
    throw new Error(`ESLint returned no result for ${filePath}`);
  }
  return result;
}

function messagesFor(result: ESLint.LintResult, ruleId: string): string[] {
  return result.messages
    .filter((message) => message.ruleId === ruleId)
    .map((message) => message.message);
}

/**
 * Asserts a `no-restricted-syntax` message containing `fragment`.
 *
 * Asserting the fragment rather than the rule id is load-bearing: several bans
 * share `no-restricted-syntax`, so a test that only checked the id would still
 * pass after the selector it cares about was deleted.
 */
function expectBanReported(result: ESLint.LintResult, fragment: string): void {
  const reported = messagesFor(result, 'no-restricted-syntax');
  expect(
    reported.some((message) => message.includes(fragment)),
    `expected a no-restricted-syntax message containing ${JSON.stringify(fragment)}, got ${JSON.stringify(reported)}`,
  ).toBe(true);
}

describe('a consumer may not combine primitive magnitudes inline', () => {
  it('rejects adding two magnitudes', async () => {
    const result = await lintAt(
      consumerFile,
      'import type { EffectRecord } from "@mm/content";\n' +
        'export function total(a: EffectRecord, b: EffectRecord): number {\n' +
        '  return a.magnitude + b.magnitude;\n' +
        '}\n',
    );
    expect(result.errorCount).toBeGreaterThan(0);
    expectBanReported(result, '@mm/primitives');
    expect(result.filePath.endsWith(consumerFile)).toBe(true);
    expect(
      result.messages.find((message) => message.ruleId === 'no-restricted-syntax')?.line,
    ).toBe(3);
  });

  it('rejects multiplying a magnitude, which is the ward mistake', async () => {
    const result = await lintAt(
      consumerFile,
      'import type { EffectRecord } from "@mm/content";\n' +
        'export function chained(a: EffectRecord, b: EffectRecord): number {\n' +
        '  return a.magnitude * b.magnitude;\n' +
        '}\n',
    );
    expect(result.errorCount).toBeGreaterThan(0);
    expectBanReported(result, '@mm/primitives');
  });

  it('rejects dividing a magnitude', async () => {
    const result = await lintAt(
      consumerFile,
      'import type { EffectRecord } from "@mm/content";\n' +
        'export function half(a: EffectRecord): number {\n' +
        '  return a.magnitude / 2;\n' +
        '}\n',
    );
    expect(result.errorCount).toBeGreaterThan(0);
    expectBanReported(result, '@mm/primitives');
  });

  it('rejects accumulating into a magnitude', async () => {
    const result = await lintAt(
      consumerFile,
      'export function bump(effect: { magnitude: number }): void {\n' +
        '  effect.magnitude += 1024;\n' +
        '}\n',
    );
    expect(result.errorCount).toBeGreaterThan(0);
    expectBanReported(result, 'inline stacking by another spelling');
  });

  it('rejects folding an array of magnitudes', async () => {
    const result = await lintAt(
      consumerFile,
      'export function total(magnitudes: readonly number[]): number {\n' +
        '  return magnitudes.reduce((sum, value) => sum + value, 0);\n' +
        '}\n',
    );
    expect(result.errorCount).toBeGreaterThan(0);
    expectBanReported(result, 'declared cap');
  });

  it('rejects folding a differently-named magnitudes array', async () => {
    // The selector matches any identifier ending in `magnitudes`, so
    // `wardMagnitudes` is caught too. A ban that only knew one variable name
    // would be evaded by the first person who renamed a local.
    const result = await lintAt(
      consumerFile,
      'export function total(wardMagnitudes: readonly number[]): number {\n' +
        '  return wardMagnitudes.reduce((sum, value) => sum + value, 0);\n' +
        '}\n',
    );
    expect(result.errorCount).toBeGreaterThan(0);
    expectBanReported(result, 'declared cap');
  });

  it('rejects Math.max over magnitudes, since max stacking is registry data', async () => {
    const result = await lintAt(
      consumerFile,
      'export function biggest(magnitudes: readonly number[]): number {\n' +
        '  return Math.max(...magnitudes);\n' +
        '}\n',
    );
    expect(result.errorCount).toBeGreaterThan(0);
    expectBanReported(result, 'not a judgement call at the call site');
  });

  it('rejects a fixed-point helper applied straight to a magnitude', async () => {
    const result = await lintAt(
      consumerFile,
      'import { mul } from "@mm/sim-core";\n' +
        'import type { EffectRecord } from "@mm/content";\n' +
        'export function scaled(effect: EffectRecord, factor: number): number {\n' +
        '  return mul(effect.magnitude, factor);\n' +
        '}\n',
    );
    expect(result.errorCount).toBeGreaterThan(0);
    expectBanReported(result, 'skips the declared stacking rule');
  });
});

describe('the shared implementation is exempt, and consumers have a clean path', () => {
  it('accepts the same magnitude arithmetic inside packages/primitives/src', async () => {
    // Without this the ban would forbid its own implementation, and the first
    // person to hit that would reach for an eslint-disable comment — at which
    // point the rule protects nothing.
    const result = await lintAt(
      sharedFile,
      'import type { EffectRecord } from "@mm/content";\n' +
        'export function total(a: EffectRecord, b: EffectRecord): number {\n' +
        '  return a.magnitude + b.magnitude;\n' +
        '}\n',
    );
    expect(messagesFor(result, 'no-restricted-syntax')).toEqual([]);
  });

  it('accepts a consumer that calls the shared implementation', async () => {
    // The non-vacuity control for every rejection above. If the consumer block
    // rejected all source it saw, the tests above would prove nothing.
    const result = await lintAt(
      consumerFile,
      'import { stackMagnitudes } from "@mm/primitives";\n' +
        'import type { PrimitiveRecord } from "@mm/content";\n' +
        'export function effective(\n' +
        '  primitive: PrimitiveRecord,\n' +
        '  sources: readonly number[],\n' +
        '): number {\n' +
        '  return stackMagnitudes(primitive, sources).value;\n' +
        '}\n',
    );
    expect(result.errorCount).toBe(0);
    expect(result.messages).toEqual([]);
  });
});

describe('the shared implementation is still rules path', () => {
  it('rejects a float literal in packages/primitives/src', async () => {
    // The "Float in primitive math rejected" scenario. The arithmetic that
    // stacks magnitudes is as much the rules path as the core is, and it would
    // be a strange kind of purity that stopped at the package boundary.
    const result = await lintAt(sharedFile, 'export const half = 0.5;\n');
    expect(result.errorCount).toBeGreaterThan(0);
    expectBanReported(result, 'fixed-point integers at scale 1/1024');
  });

  it('rejects Math.floor in packages/primitives/src', async () => {
    const result = await lintAt(sharedFile, 'export const n = Math.floor(1);\n');
    expect(result.errorCount).toBeGreaterThan(0);
    expectBanReported(result, 'Floating-point Math is banned');
  });

  it('rejects a wall-clock read in packages/primitives/src', async () => {
    const result = await lintAt(sharedFile, 'export const at = Date.now();\n');
    expect(result.errorCount).toBeGreaterThan(0);
    expect(messagesFor(result, 'no-restricted-globals').join('\n')).toContain('wall-clock time');
  });

  it('accepts integer-only source there', async () => {
    const result = await lintAt(
      sharedFile,
      'import { FP_ONE } from "@mm/sim-core";\n' +
        'export function twice(value: number): number {\n' +
        '  return value + value + FP_ONE - FP_ONE;\n' +
        '}\n',
    );
    expect(result.errorCount).toBe(0);
  });
});
