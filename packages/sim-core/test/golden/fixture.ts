/*
 * Multiverse Mages — the golden replay fixture format.
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

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ActionLogJSON, Recording, WorldSchema } from '@mm/sim-core';
import { ActionLog } from '@mm/sim-core';

// `.ts` rather than the repository's usual `.js` specifier: everything in this
// directory is also loaded by `npm run golden:regen`, which runs under Node's
// type stripping and resolves specifiers literally. See tsconfig.test.json.
import { worldNamed } from './worlds.ts';

/**
 * ## The fixture format
 *
 * `deterministic-replay` defines a golden fixture as a root seed, an initial
 * snapshot, an action log, and an expected final snapshot hash. Those four
 * fields are the fixture; everything else here exists to make the four usable
 * and reviewable.
 *
 * ```jsonc
 * {
 *   "formatVersion": 1,
 *   "name": "world-time-only",
 *   "description": "…what this fixture is meant to catch…",
 *   "world": "chronicle",          // key into test/golden/worlds.ts
 *   "rootSeed": 909090,
 *   "tickCount": 48,
 *   "initialSnapshot": "<base64>", // the state before the first step
 *   "actionLog": { "ticks": [[], [{ "kind": 1 }], …] },
 *   "expectedFinalHash": "…16 hex…",
 *   "tickHashes": ["…", …]         // one per step; see below
 * }
 * ```
 *
 * ### Two fields beyond the spec's four, and why each earns its place
 *
 * **`world`** — the spec's four fields describe a run but not the rules it ran
 * under, and replaying a recording against a *named* world is the entire point:
 * a snapshot says what the world was, the schema says what the rules are. The
 * key is indirect rather than embedded because systems are functions; see the
 * argument in `worlds.ts`.
 *
 * **`tickHashes`** — the spec requires that a nondeterministic change make a
 * fixture fail *and name the diverging tick*. A final hash alone cannot do
 * that: it says a 200-tick run ended wrong and leaves an engineer bisecting by
 * hand. One hash per step is what turns "something diverged" into "tick 61
 * diverged", which is usually the same sentence as "the diff that landed this
 * morning". It costs a few kilobytes of fixture and is not consulted for the
 * pass/fail verdict — `expectedFinalHash` remains the contract.
 *
 * ### JSON, not a binary container
 *
 * The snapshot inside is binary and is carried base64. Everything a reviewer
 * needs to judge — which world, which seed, how many ticks, which actions, and
 * the hashes — is plain text on its own line, so a regenerated fixture reads as
 * a reviewable diff rather than as one opaque blob. That is a requirement, not
 * a preference: `deterministic-replay` says a regenerated fixture must produce
 * a reviewable diff, because a regenerated golden is a claim that behaviour
 * changed on purpose.
 */
export const FIXTURE_FORMAT_VERSION = 1;

/** Where committed fixtures live. Resolved from this file, so cwd never matters. */
export const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/', import.meta.url));

export interface GoldenFixture {
  readonly formatVersion: number;
  readonly name: string;
  readonly description: string;
  readonly world: string;
  readonly rootSeed: number;
  readonly tickCount: number;
  /** The state before the first step, serialized and base64-encoded. */
  readonly initialSnapshot: string;
  /** The recorded log, in `ActionLog`'s own JSON projection. */
  readonly actionLog: ActionLogJSON;
  readonly expectedFinalHash: string;
  /** Snapshot hash after each step. One per tick; see the format note above. */
  readonly tickHashes: readonly string[];
}

/** A fixture as loaded from disk, with the file it came from. */
export interface LoadedFixture {
  readonly fixture: GoldenFixture;
  readonly fileName: string;
  readonly schema: WorldSchema;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Base64 without `Buffer`.
 *
 * Hand-rolled rather than reached for, because this module is imported by both
 * the Vitest suite and the standalone regeneration command, and the two must
 * agree byte for byte on what a fixture says. One implementation, used by both,
 * is a cheaper guarantee of that than two runtimes' opinions of `Buffer` and
 * `atob` agreeing.
 */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : BASE64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : BASE64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/u, '');
  const bytes = new Uint8Array((clean.length * 3) >> 2);
  let out = 0;
  let accumulator = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const value = BASE64_ALPHABET.indexOf(clean[i] as string);
    if (value < 0) {
      throw new Error(`Fixture snapshot is not valid base64: character "${clean[i]}" at index ${i}.`);
    }
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out] = (accumulator >> bits) & 0xff;
      out += 1;
    }
  }
  return bytes.subarray(0, out);
}

/**
 * Validates a parsed fixture.
 *
 * A fixture is read off disk and fed straight into the simulation, so a field
 * that is missing or the wrong shape must stop the run rather than replay as
 * *something*. A golden fixture that reproduces the wrong thing is strictly
 * worse than one that fails to load: the first is silent.
 */
export function parseFixture(value: unknown, fileName: string): GoldenFixture {
  const where = `Golden fixture ${fileName}`;
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`${where} is not a JSON object.`);
  }
  const raw = value as Partial<GoldenFixture>;

  const requireString = (field: keyof GoldenFixture): string => {
    const found = raw[field];
    if (typeof found !== 'string' || found.length === 0) {
      throw new TypeError(`${where} is missing a string "${String(field)}".`);
    }
    return found;
  };
  const requireInteger = (field: keyof GoldenFixture): number => {
    const found = raw[field];
    if (typeof found !== 'number' || !Number.isInteger(found)) {
      throw new TypeError(`${where} is missing an integer "${String(field)}".`);
    }
    return found;
  };

  const formatVersion = requireInteger('formatVersion');
  if (formatVersion !== FIXTURE_FORMAT_VERSION) {
    throw new Error(
      `${where} is at fixture format version ${formatVersion}, but this harness reads ` +
        `${FIXTURE_FORMAT_VERSION}.`,
    );
  }

  const expectedFinalHash = requireString('expectedFinalHash');
  if (!/^[0-9a-f]{16}$/u.test(expectedFinalHash)) {
    throw new Error(`${where} has expectedFinalHash "${expectedFinalHash}", which is not 16 hex characters.`);
  }

  const tickHashes = raw.tickHashes;
  if (!Array.isArray(tickHashes) || tickHashes.some((hash) => typeof hash !== 'string')) {
    throw new TypeError(`${where} is missing a "tickHashes" array of strings.`);
  }

  const tickCount = requireInteger('tickCount');
  if (tickHashes.length !== tickCount) {
    throw new Error(
      `${where} declares ${tickCount} tick(s) but carries ${tickHashes.length} tick hash(es).`,
    );
  }

  const actionLog = raw.actionLog;
  if (typeof actionLog !== 'object' || actionLog === null || !Array.isArray(actionLog.ticks)) {
    throw new TypeError(`${where} is missing an "actionLog" with a "ticks" array.`);
  }
  if (actionLog.ticks.length !== tickCount) {
    throw new Error(
      `${where} declares ${tickCount} tick(s) but its action log holds ${actionLog.ticks.length}.`,
    );
  }

  return {
    formatVersion,
    name: requireString('name'),
    description: requireString('description'),
    world: requireString('world'),
    rootSeed: requireInteger('rootSeed'),
    tickCount,
    initialSnapshot: requireString('initialSnapshot'),
    actionLog,
    expectedFinalHash,
    tickHashes,
  };
}

/** The fixture, as the replayer wants it. */
export function toRecording(fixture: GoldenFixture): Recording {
  return {
    rootSeed: fixture.rootSeed,
    initialSnapshot: fromBase64(fixture.initialSnapshot),
    actionLog: ActionLog.fromJSON(fixture.actionLog),
    tickCount: fixture.tickCount,
    finalHash: fixture.expectedFinalHash,
    tickHashes: [...fixture.tickHashes],
  };
}

/**
 * Every committed fixture, read from the fixtures directory.
 *
 * Directory-driven rather than a list in the test, so "every committed fixture
 * is executed" is literally true: dropping a fixture in runs it, and there is
 * no second place to forget to update. An empty directory is an error rather
 * than a vacuous pass — a golden suite that silently verifies nothing is the
 * failure mode the whole requirement exists to prevent.
 */
export function loadFixtures(): LoadedFixture[] {
  const fileNames = readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();

  if (fileNames.length === 0) {
    throw new Error(
      `No golden fixtures found in ${FIXTURE_DIR}. The golden suite must never pass vacuously; ` +
        'regenerate them with `npm run golden:regen --workspace @mm/sim-core`.',
    );
  }

  return fileNames.map((fileName) => {
    const text = readFileSync(join(FIXTURE_DIR, fileName), 'utf8');
    const fixture = parseFixture(JSON.parse(text) as unknown, fileName);
    return { fixture, fileName, schema: worldNamed(fixture.world) };
  });
}

/** Serializes a fixture to the exact on-disk text, so regeneration diffs cleanly. */
export function fixtureToText(fixture: GoldenFixture): string {
  return `${JSON.stringify(fixture, null, 2)}\n`;
}
