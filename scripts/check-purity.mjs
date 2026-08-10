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
 * Fails if `packages/sim-core/package.json` declares any runtime dependency.
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

/** Packages whose runtime dependency list must stay empty. */
const PURE_PACKAGES = ['packages/sim-core'];

/** Fields npm treats as runtime (installed for consumers, not just for us). */
const RUNTIME_DEPENDENCY_FIELDS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
  'bundledDependencies',
  'bundleDependencies',
];

const EXPECTED_LICENSE = 'AGPL-3.0-or-later';

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
    if (names.length > 0) {
      failures.push(
        `${manifestPath}: "${field}" must be empty but declares ${names.length} entry/entries: ${names.join(', ')}`,
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

console.log(`Dependency-purity check passed: ${PURE_PACKAGES.join(', ')} declare no runtime dependencies.`);
