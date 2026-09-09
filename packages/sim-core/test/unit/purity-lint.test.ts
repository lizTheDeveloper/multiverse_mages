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

import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/**
 * The float ban has to fire in every rules-path package, not only in the one
 * this file is named after.
 *
 * It stopped firing in four of them and nothing noticed. ESLint's flat config
 * resolves `no-restricted-syntax` **last-block-wins, not by union**, so a later
 * block matching `packages/*` /src replaced the purity block's whole rule array
 * with a single unrelated ban. `packages/state/src` and every `rules-*` package
 * accepted `0.5`, `Math.random()` and `Math.floor(1.5)` with no error at all,
 * while the config above them still read exactly as though it banned them.
 *
 * It survived because every existing probe pointed at `packages/sim-core/src`.
 * A rule is only enforced where something has watched it fail — so these probe
 * each rules-path package by name, and a package added to `RULES_SRC` without
 * a probe here is a package whose purity is once again nobody's job.
 */
describe('the float ban covers every rules-path package, not just sim-core', () => {
  const rulesPathProbes = [
    'packages/state/src/__lint-probe__.ts',
    'packages/rules-magic/src/__lint-probe__.ts',
    'packages/rules-world/src/__lint-probe__.ts',
    'packages/rules-raid/src/__lint-probe__.ts',
    'packages/primitives/src/__lint-probe__.ts',
    // Added by W201. `coordination` is the world loop — `world-step.ts`
    // installs the systems that advance a universe — and it was in neither the
    // glob nor the documented exclusions, so `0.5`, `Date.now()` and
    // `Math.random()` all compiled there. Measured before the fix: the same
    // injected line raised five errors in `rules-world/src` and zero here, and
    // a `Math.random()` planted in `world-step.ts` passed lint, ran 7,532
    // times, and passed all 4,631 tests.
    'packages/coordination/src/__lint-probe__.ts',
  ];

  it.each(rulesPathProbes)('rejects a non-integer literal in %s', async (filePath) => {
    const [result] = await eslint.lintText('export const chance = 0.35;\n', { filePath });
    expect(result?.errorCount ?? 0).toBeGreaterThan(0);
    expectBanReported(result as ESLint.LintResult, 'no-restricted-syntax', 'fixed-point integers');
  });

  it.each(rulesPathProbes)('rejects Math.random in %s', async (filePath) => {
    const [result] = await eslint.lintText('export const r = Math.random();\n', { filePath });
    expect(result?.errorCount ?? 0).toBeGreaterThan(0);
    expectBanReported(result as ESLint.LintResult, 'no-restricted-syntax', 'Math.random is banned');
  });

  it.each(rulesPathProbes)('rejects floating-point Math in %s', async (filePath) => {
    const [result] = await eslint.lintText('export const f = Math.floor(1);\n', { filePath });
    expect(result?.errorCount ?? 0).toBeGreaterThan(0);
    expectBanReported(result as ESLint.LintResult, 'no-restricted-syntax', 'integer-safe');
  });

  it.each(rulesPathProbes)('still accepts integer-only source in %s', async (filePath) => {
    // The control. Without it, a config that errored on everything would pass
    // all three tests above and mean nothing.
    const [result] = await eslint.lintText(
      'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
      { filePath },
    );
    expect(result?.errorCount ?? 0).toBe(0);
  });
});

/**
 * Every package under `packages/` is *classified*: it either bans floats or is
 * a named exclusion. Nothing may be neither.
 *
 * The block above probes the packages the config claims to cover, which catches
 * a ban that stopped firing. It cannot catch the other failure — a package that
 * was never listed at all — because a probe list and a glob list are written by
 * the same hand at the same moment, and both were missing `coordination` for as
 * long as it existed. `scripts/check-purity.mjs` had been calling it rules path
 * in its own comments the whole time; the tool that carried the ban had simply
 * never been told.
 *
 * So this reads `packages/` off disk rather than from any list, and asserts the
 * partition. **Adding a workspace package now fails this test until somebody
 * decides which side it is on** — which is the decision that went unmade.
 *
 * The probe is a decimal literal rather than `Math.random()` deliberately:
 * `agent-api` bans `Math.random` on both sides of its §4.1 float exemption, so
 * a random-draw probe would classify it as rules path and the partition would
 * be describing the wrong question.
 */
describe('every package under packages/ is on one side of the float ban', () => {
  /**
   * The rules path, by name. Duplicated from `eslint.config.mjs` on purpose,
   * for the same reason `rng-registry-append-only.test.ts` duplicates the stream
   * table: a test that read its expectation out of the config under test could
   * not detect a change to that config.
   */
  const FLOAT_BANNED = [
    'coordination',
    'primitives',
    'rules-magic',
    'rules-raid',
    'rules-world',
    'sim-core',
    'state',
  ];

  /** The deliberate exclusions, with the reason each one is out in the config. */
  const FLOAT_PERMITTED = [
    'agent-api',
    'content',
    'gym-bridge',
    'mc-harness',
    'scenario',
    'server',
  ];

  const packagesOnDisk = readdirSync(new URL('packages/', pathToFileURL(repoRoot)), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  it('classifies every package on disk, so a new one cannot be silently neither', () => {
    const classified = new Set([...FLOAT_BANNED, ...FLOAT_PERMITTED]);
    const unclassified = packagesOnDisk.filter((name) => !classified.has(name));
    expect(
      unclassified,
      `packages/${unclassified.join(', packages/')} appear on disk but in neither list. ` +
        "Decide: is it rules path? Then add it to RULES_SRC in eslint.config.mjs and to " +
        'FLOAT_BANNED here. Is it host-side tooling or a documented float boundary? Then add ' +
        'it to FLOAT_PERMITTED and write the reason into the RULES_SRC comment. Leaving it out ' +
        'of both is how `coordination` — the world loop — spent its whole life as a package ' +
        'where 0.5 compiled.',
    ).toEqual([]);
    // And the reverse, so a deleted package does not leave a stale claim behind.
    const missing = [...classified].filter((name) => !packagesOnDisk.includes(name)).sort();
    expect(missing, `${missing.join(', ')} are listed here but not on disk`).toEqual([]);
  });

  it.each(FLOAT_BANNED)('rejects a decimal literal in packages/%s/src', async (name) => {
    const [result] = await eslint.lintText('export const chance = 0.35;\n', {
      filePath: `packages/${name}/src/__lint-probe__.ts`,
    });
    expect(result?.errorCount ?? 0).toBeGreaterThan(0);
  });

  it.each(FLOAT_PERMITTED)(
    'does not fire the decimal-literal ban in packages/%s/src, which is the exclusion being claimed',
    async (name) => {
      // Not decoration: this half is what makes the list above a *partition*
      // rather than a wish. If a package quietly gained the ban, the claim that
      // it is excluded would be false and nothing else here would say so.
      //
      // Asserted against *this ban* rather than against `errorCount === 0`,
      // which is what it said first. These six packages happen to raise nothing
      // at all on the probe today, so a zero-error assertion would pass for a
      // reason unrelated to the partition — and would then fail the day someone
      // adds an unrelated rule the snippet happens to trip, reporting it as
      // "the exclusion broke". A test whose failure names the wrong cause is
      // worse than one that never fires.
      const [result] = await eslint.lintText('export const chance = 0.35;\n', {
        filePath: `packages/${name}/src/__lint-probe__.ts`,
      });
      const decimalBans = messagesFor(result as ESLint.LintResult, 'no-restricted-syntax').filter(
        (message) => message.includes('Non-integer numeric literal'),
      );
      expect(decimalBans, `packages/${name}/src is claimed exempt but the ban fired`).toEqual([]);
    },
  );
});
