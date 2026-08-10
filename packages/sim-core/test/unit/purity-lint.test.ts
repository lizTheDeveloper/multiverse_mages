/*
 * Multiverse Mages — proof that the purity bans in the rules path are enforced.
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
 * Covers three scenarios that are enforced by lint and by nothing else:
 *
 *   - "Float literal in rules path rejected" (fixed-point requirement)
 *   - "Forbidden global rejected" (core-purity requirement)
 *   - "Node built-in import rejected" (core-purity requirement)
 *
 * The rule config lives in `eslint.config.mjs` and is easy to weaken by
 * accident — narrowing a selector, adding a member to the `Math` allowlist,
 * dropping an entry from `NONDETERMINISTIC_GLOBALS` — with nothing failing to
 * say so. This runs the project's real ESLint configuration over source text
 * and asserts the rules still fire, still name the right ban, and still report
 * the offending file and line.
 *
 * The banned identifiers appear here only inside string literals of synthetic
 * source handed to ESLint. That is the point of the file: the test never
 * executes `Date` or `Math.random`, it asks the linter what it would say about
 * a core file that did.
 *
 * Snippets are linted from memory against a virtual path inside
 * `packages/sim-core/src`, which is what selects the core's config block. No
 * file is written, so there is nothing to leave behind if a test throws.
 */

import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

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

/**
 * The error messages for one rule, so a test can assert *which* ban fired.
 *
 * Asserting the ruleId alone is not enough for several of these bans. Six
 * distinct restrictions share `no-restricted-syntax`, so a `Math.random()`
 * snippet reports under that ruleId twice — once for the float-Math allowlist
 * and once for the named `Math.random` ban. A test that only checked the ruleId
 * would still pass if the `Math.random` entry were deleted outright.
 */
function messagesFor(result: ESLint.LintResult, ruleId: string): string[] {
  return result.messages
    .filter((message) => message.ruleId === ruleId)
    .map((message) => message.message);
}

/** Asserts that some message for `ruleId` contains `fragment`. */
function expectBanReported(result: ESLint.LintResult, ruleId: string, fragment: string): void {
  const reported = messagesFor(result, ruleId);
  expect(
    reported.some((message) => message.includes(fragment)),
    `expected a ${ruleId} message containing ${JSON.stringify(fragment)}, got ${JSON.stringify(reported)}`,
  ).toBe(true);
}

/**
 * Asserts the report names the file it came from.
 *
 * Compared by suffix rather than by equality: ESLint resolves the virtual path
 * against `cwd`, so the absolute prefix is wherever this repository happens to
 * be checked out, and a hard-coded absolute path would be a machine-specific
 * assertion dressed up as a behavioural one.
 */
function expectNamesTheProbeFile(result: ESLint.LintResult): void {
  expect(result.filePath.endsWith(virtualCoreFile)).toBe(true);
}

/**
 * Pay ESLint's cold start once, outside any test's timeout.
 *
 * The first `lintAsCoreSource` call constructs an ESLint instance and resolves the
 * flat config, which takes seconds on a loaded machine; every call after it takes
 * roughly a tenth of one. Without this, whichever test happens to run first pays
 * that cost against the default 5s budget and fails intermittently — a flake that
 * looks exactly like the purity rules having broken, which is the one thing this
 * file exists to tell the truth about.
 */
beforeAll(async () => {
  await lintAsCoreSource('export const warm = 1;');
}, 60_000);

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

  it('names the offending file and line', async () => {
    const result = await lintAsCoreSource('export const a = 1;\nexport const b = 2.5;\n');
    const offence = result.messages.find((message) => message.ruleId === 'no-restricted-syntax');
    expect(offence?.line).toBe(2);
    expectNamesTheProbeFile(result);
  });
});

/**
 * Task 10.1 — the "Forbidden global rejected" scenario, one test per banned
 * global. Each asserts the specific ban by message text, not just that
 * *something* went wrong: `NONDETERMINISTIC_GLOBALS` is a list, and a list can
 * lose an entry without any other entry noticing.
 */
describe('the core rejects nondeterministic globals', () => {
  it('rejects Math.random()', async () => {
    const result = await lintAsCoreSource('export const roll = Math.random();\n');
    expect(wouldFailTheLintTask(result)).toBe(true);
    expectBanReported(result, 'no-restricted-syntax', 'Math.random is banned');
    expectNamesTheProbeFile(result);
    expect(result.messages[0]?.line).toBe(1);
  });

  it('rejects Date.now()', async () => {
    const result = await lintAsCoreSource('export const stamp = Date.now();\n');
    expect(wouldFailTheLintTask(result)).toBe(true);
    expectBanReported(result, 'no-restricted-globals', "'Date'");
    expectBanReported(result, 'no-restricted-globals', 'may not read wall-clock time');
    expectNamesTheProbeFile(result);
    expect(result.messages[0]?.line).toBe(1);
  });

  it('rejects a Date constructed with new', async () => {
    // `Date` is banned whole rather than by member so that this form, and
    // `Date['now']()`, are covered by the one rule. If the ban were narrowed to
    // the `Date.now` member expression, this test is what would notice.
    const result = await lintAsCoreSource('export const born = new Date();\n');
    expect(wouldFailTheLintTask(result)).toBe(true);
    expectBanReported(result, 'no-restricted-globals', "'Date'");
    expectNamesTheProbeFile(result);
  });

  it('rejects computed access to Date, which a member-only ban would miss', async () => {
    const result = await lintAsCoreSource("export const stamp = Date['now']();\n");
    expect(wouldFailTheLintTask(result)).toBe(true);
    expectBanReported(result, 'no-restricted-globals', "'Date'");
  });

  it('rejects performance.now()', async () => {
    const result = await lintAsCoreSource('export const at = performance.now();\n');
    expect(wouldFailTheLintTask(result)).toBe(true);
    expectBanReported(result, 'no-restricted-globals', "'performance'");
    expectBanReported(result, 'no-restricted-globals', 'wall-clock time');
    expectNamesTheProbeFile(result);
    expect(result.messages[0]?.line).toBe(1);
  });

  it('rejects Intl.NumberFormat', async () => {
    const result = await lintAsCoreSource(
      'export const format = new Intl.NumberFormat().format(1);\n',
    );
    expect(wouldFailTheLintTask(result)).toBe(true);
    expectBanReported(result, 'no-restricted-globals', "'Intl'");
    expectBanReported(result, 'no-restricted-globals', 'ICU build and locale');
    expectNamesTheProbeFile(result);
    expect(result.messages[0]?.line).toBe(1);
  });

  it('reports the line the global was read on, not the first line of the file', async () => {
    const result = await lintAsCoreSource(
      'export const stable = 1;\n' + 'export function tick(): number {\n' + '  return Date.now();\n' + '}\n',
    );
    const offence = result.messages.find((message) => message.ruleId === 'no-restricted-globals');
    expect(offence?.line).toBe(3);
    expectNamesTheProbeFile(result);
  });
});

/**
 * Task 10.2 — the "Node built-in import rejected" scenario, with and without
 * the `node:` prefix.
 *
 * The ban originally stopped at static imports: `import('node:fs')`,
 * `import('fs')` and `require('fs')` all linted clean, because
 * `no-restricted-imports` visits only static import and export declarations, so
 * a dynamic specifier walked past both the `paths` list and the `node:*`
 * pattern. That hole existed from the day the rule was written and nothing in
 * the repo was positioned to notice it — which is the entire argument for
 * testing enforcement machinery instead of trusting it. It is closed now, by
 * syntax selectors in `eslint.config.mjs`, and the tests below hold it closed.
 */
describe('the core rejects Node built-in imports', () => {
  it('rejects a prefixed node: import, naming the file and line', async () => {
    const result = await lintAsCoreSource(
      "import { readFileSync } from 'node:fs';\n\nexport const read = readFileSync;\n",
    );
    expect(wouldFailTheLintTask(result)).toBe(true);
    expectBanReported(result, 'no-restricted-imports', "'node:fs'");
    expectBanReported(result, 'no-restricted-imports', 'performs no I/O');
    expectNamesTheProbeFile(result);
    expect(
      result.messages.find((message) => message.ruleId === 'no-restricted-imports')?.line,
    ).toBe(1);
  });

  it('rejects the same module imported bare, without the node: prefix', async () => {
    // The unprefixed spelling resolves to exactly the same built-in, so a ban
    // that only covered `node:*` would be trivially evadable. This is why the
    // config enumerates `builtinModules` as well as matching the prefix.
    const result = await lintAsCoreSource(
      "export const nothing = 0;\nimport { readFileSync } from 'fs';\nexport const read = readFileSync;\n",
    );
    expect(wouldFailTheLintTask(result)).toBe(true);
    expectBanReported(result, 'no-restricted-imports', "'fs'");
    expectBanReported(result, 'no-restricted-imports', 'performs no I/O');
    expectNamesTheProbeFile(result);
    expect(
      result.messages.find((message) => message.ruleId === 'no-restricted-imports')?.line,
    ).toBe(2);
  });

  it('rejects a built-in reached through a re-export', async () => {
    const result = await lintAsCoreSource("export { readFileSync } from 'node:fs';\n");
    expect(wouldFailTheLintTask(result)).toBe(true);
    expectBanReported(result, 'no-restricted-imports', "'node:fs'");
  });

  it('rejects built-ins other than fs, since the ban is the whole list', async () => {
    const result = await lintAsCoreSource(
      "import { createHash } from 'node:crypto';\nexport const hash = createHash;\n",
    );
    expect(wouldFailTheLintTask(result)).toBe(true);
    expectBanReported(result, 'no-restricted-imports', "'node:crypto'");
  });
});

/**
 * The non-vacuity control for tasks 10.1 and 10.2. Every test above asserts
 * that lint fails; without this one they would all still pass if the core's
 * config block rejected every file it saw, and the suite would be measuring
 * nothing.
 */
describe('the core accepts equivalent, permitted constructs', () => {
  it('accepts a module that reads no global and imports no built-in', async () => {
    const result = await lintAsCoreSource(
      "import { floorDiv } from './divide.js';\n" +
        '\n' +
        'export function advance(tick: number, step: number): number {\n' +
        '  return floorDiv(tick + step, 1);\n' +
        '}\n' +
        '\n' +
        'export function pick(values: readonly number[], draw: number): number | undefined {\n' +
        '  return values[draw % values.length];\n' +
        '}\n',
    );
    expect(result.errorCount).toBe(0);
    expect(result.messages).toEqual([]);
  });

  it('accepts a relative import, so the import ban is about built-ins and not imports', async () => {
    const result = await lintAsCoreSource(
      "import { createRng } from '../rng/index.js';\nexport const rng = createRng;\n",
    );
    expect(result.errorCount).toBe(0);
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

describe('the ban reaches dynamic imports, not only static ones', () => {
  it('rejects a dynamic import of a Node built-in, with and without the prefix', async () => {
    for (const specifier of ['node:fs', 'fs', 'node:crypto']) {
      const result = await lintAsCoreSource(
        `export async function load(): Promise<unknown> { return import('${specifier}'); }\n`,
      );
      expect(wouldFailTheLintTask(result)).toBe(true);
      expectBanReported(result, 'no-restricted-syntax', 'dynamic import is still an import');
    }
  });

  it('rejects a dynamic import of anything at all, because the core loads nothing lazily', async () => {
    const result = await lintAsCoreSource(
      "export async function load(): Promise<unknown> { return import('./other.js'); }\n",
    );
    expect(wouldFailTheLintTask(result)).toBe(true);
    expectBanReported(result, 'no-restricted-syntax', 'dynamic import is still an import');
  });

  it('rejects a require-shaped call', async () => {
    const result = await lintAsCoreSource(
      "declare const require: (id: string) => unknown;\nexport const fs = require('node:fs');\n",
    );
    expect(wouldFailTheLintTask(result)).toBe(true);
    expectBanReported(result, 'no-restricted-syntax', 'require() is CommonJS');
  });

  it('names the offending file and line for a dynamic import', async () => {
    const result = await lintAsCoreSource("\nexport const p = import('node:fs');\n");
    expectNamesTheProbeFile(result);
    const offence = result.messages.find((message) => message.ruleId === 'no-restricted-syntax');
    expect(offence?.line).toBe(2);
  });
});
