#!/usr/bin/env node
/*
 * Multiverse Mages — dependency-purity check for the simulation core.
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
 * Fails if a pure package's `package.json` declares any runtime dependency.
 *
 * `packages/content` is here because its loader is runtime code: a third-party
 * JSON Schema validator could only ever be a test-side cross-check, so the
 * schema interpreter lives in-package. That property was true but unenforced
 * until this list included it.
 *
 * The core is consumed by the Monte Carlo harness, the Electron client, the
 * authoritative PvP server, and later a Python RL bridge. Every one of them
 * must agree bit-for-bit on what the simulation does, and every dependency is
 * a surface on which they can disagree — a transitive float, an environment
 * check, a locale read. Zero runtime dependencies is the only version of that
 * rule that can be checked mechanically.
 *
 * This script is tooling, not simulation code: it may use Node built-ins.
 *
 * Usage:
 *
 *     node scripts/check-purity.mjs            # this repository (what CI runs)
 *     node scripts/check-purity.mjs <root>     # any directory laid out like it
 *
 * The optional root exists so the *failing* path is reachable from a test. With
 * the root hard-coded, the only way to observe a failure was to add a runtime
 * dependency to the real manifest, which no test may do — so the branch that
 * gives this script its entire purpose was never once executed. Passing a
 * temporary directory instead costs one argument and makes it testable.
 */

import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The repository this script lives in — the no-argument behaviour CI depends on. */
const DEFAULT_ROOT = new URL('../', import.meta.url);

/**
 * The directory to check package manifests under.
 *
 * The trailing separator is load-bearing. `new URL('packages/x/package.json',
 * base)` resolves relative to the base's *directory*, so a base without a
 * trailing slash silently drops its last segment and the check would inspect a
 * sibling of the intended root rather than the root itself.
 */
function resolveRoot(args) {
  const [root] = args;
  if (root === undefined) return DEFAULT_ROOT;
  return pathToFileURL(resolve(root) + sep);
}

const REPO_ROOT = resolveRoot(process.argv.slice(2));

/**
 * Packages whose runtime dependency list must stay empty.
 *
 * The rules path in full, not just the core. `state`, the three `rules-*`
 * packages and `coordination` are loaded by the client, the server, and the
 * Monte Carlo workers alike, so a dependency in any of them is a surface on
 * which those consumers can disagree about what the simulation did.
 *
 * `agent-api` and `mc-harness` are deliberately absent. The harness may
 * legitimately want third-party tooling one day, and this list is a claim about
 * what must be true, not a wish about what would be tidy.
 */
const PURE_PACKAGES = [
  'packages/sim-core',
  'packages/content',
  'packages/state',
  'packages/rules-magic',
  'packages/rules-world',
  'packages/rules-raid',
  'packages/coordination',
  'packages/primitives',
];

/** Fields npm treats as runtime (installed for consumers, not just for us). */
const RUNTIME_DEPENDENCY_FIELDS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
  'bundledDependencies',
  'bundleDependencies',
];

const EXPECTED_LICENSE = 'AGPL-3.0-or-later';

/** Workspace packages are `@mm/…`; anything else is third-party. */
const WORKSPACE_SCOPE = '@mm';

/** @type {string[]} */
const failures = [];

for (const packageDir of PURE_PACKAGES) {
  const manifestUrl = new URL(`${packageDir}/package.json`, REPO_ROOT);
  const manifestPath = fileURLToPath(manifestUrl);

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
  } catch (error) {
    failures.push(`${manifestPath}: could not be read or parsed (${String(error)})`);
    continue;
  }

  for (const field of RUNTIME_DEPENDENCY_FIELDS) {
    const value = manifest[field];
    if (value === undefined) continue;

    const names = Array.isArray(value) ? value : Object.keys(value);
    // Workspace siblings are permitted; third-party packages are not.
    //
    // The rule this script enforces is "no third-party runtime code in the
    // rules path", not "no dependencies at all". §5 *requires* `state` and
    // every `rules-*` package to depend on `@mm/sim-core` — forbidding that
    // outright pushed them into declaring nothing while importing it anyway,
    // which resolved only through workspace hoisting and would have failed the
    // moment one was packed or consumed from outside this repository. It also
    // made this check pass for a reason unrelated to what it is checking.
    //
    // `sim-core` itself declares nothing at all, and its own entry in this list
    // plus the module-boundary graph is what holds that line.
    const external = names.filter((name) => !name.startsWith(`${WORKSPACE_SCOPE}/`));
    if (external.length > 0) {
      failures.push(
        `${manifestPath}: "${field}" may name workspace packages only, but declares ` +
          `${external.length} third-party entry/entries: ${external.join(', ')}`,
      );
    }
  }

  if (manifest.license !== EXPECTED_LICENSE) {
    failures.push(
      `${manifestPath}: "license" must be "${EXPECTED_LICENSE}" but is ${JSON.stringify(manifest.license)}`,
    );
  }
}

if (failures.length > 0) {
  console.error('Dependency-purity check FAILED:\n');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    '\nThe simulation core has zero runtime dependencies by design. If a capability\n' +
      'genuinely requires third-party code, it belongs in a consumer package, not here.\n',
  );
  process.exit(1);
}

console.log(
  `Dependency-purity check passed: ${PURE_PACKAGES.join(', ')} declare no third-party runtime dependencies.`,
);
