/*
 * Multiverse Mages — the on-disk golden replay fixture format.
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

import { Buffer } from 'node:buffer';

import type { ActionLogJSON, Recording } from '../../src/replay/recorder.js';
import { ActionLog } from '../../src/replay/recorder.js';

/**
 * The fixture schema version.
 *
 * Bumped when the *file* shape changes — a new field, a renamed one — never
 * when the simulation's behaviour changes. Behaviour changes show up as changed
 * hashes inside an unchanged schema, and conflating the two would let a rules
 * change hide behind a format bump.
 */
export const FIXTURE_FORMAT_VERSION = 1;

/** A snapshot hash as this repo writes them: 16 lowercase hex characters. */
const HASH_PATTERN = /^[0-9a-f]{16}$/;

const UINT32_COUNT = 4294967296;

/**
 * One committed golden fixture, exactly as it sits on disk.
 *
 * Everything needed to re-run the recording *and* to judge the result, plus the
 * prose a reviewer needs to know what they are looking at. `description` is not
 * decoration: a fixture whose purpose nobody can state is a fixture that gets
 * regenerated to green the build.
 */
export interface GoldenFixture {
  readonly formatVersion: number;
  /** Matches the file's basename. */
  readonly name: string;
  /** What this fixture covers, in a sentence a reviewer can check against.  */
  readonly description: string;
  /** Resolved through the world registry in `worlds.ts`. */
  readonly worldId: string;
  readonly rootSeed: number;
  /** Steps recorded. Equal to the action log's length and the tick-hash count. */
  readonly tickCount: number;
  /** The state before the first recorded step, serialized and base64-encoded. */
  readonly initialSnapshot: string;
  readonly actionLog: ActionLogJSON;
  /** Snapshot hash after the last step. */
  readonly finalHash: string;
  /**
   * Snapshot hash after every step.
   *
   * Mandatory here, though `Recording` treats it as optional. Without it a
   * failure can only say "this fixture no longer reproduces", which leaves an
   * engineer bisecting a whole run by hand — and a determinism gate that is
   * expensive to act on is a gate people learn to disable.
   */
  readonly tickHashes: readonly string[];
}

/**
 * Renders a fixture to its canonical text: fixed key order, two-space indent,
 * trailing newline.
 *
 * Canonical rather than merely valid, because the whole review story depends on
 * it. Regeneration must produce a byte-identical file when nothing changed, so
 * that any diff at all is a behaviour diff — if key order or spacing wobbled,
 * every regeneration would produce noise and reviewers would stop reading it.
 */
export function renderFixture(fixture: GoldenFixture): string {
  const ordered = {
    formatVersion: fixture.formatVersion,
    name: fixture.name,
    description: fixture.description,
    worldId: fixture.worldId,
    rootSeed: fixture.rootSeed,
    tickCount: fixture.tickCount,
    initialSnapshot: fixture.initialSnapshot,
    actionLog: fixture.actionLog,
    finalHash: fixture.finalHash,
    tickHashes: fixture.tickHashes,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

function fail(source: string, detail: string): never {
  throw new Error(`Malformed golden fixture ${source}: ${detail}`);
}

function requireString(value: unknown, source: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(source, `"${field}" must be a non-empty string.`);
  }
  return value;
}

function requireHash(value: unknown, source: string, field: string): string {
  const text = requireString(value, source, field);
  if (!HASH_PATTERN.test(text)) {
    fail(source, `"${field}" is ${JSON.stringify(text)}, not 16 lowercase hex characters.`);
  }
  return text;
}

/**
 * Parses and validates a fixture file's text.
 *
 * Strict on the way in, and deliberately so. A fixture is fed straight into the
 * simulation; one that loaded with a missing field would replay *something*,
 * and a fixture that reproduces the wrong run passes CI while proving nothing.
 * Every rejection below names the file and the field, because the person
 * reading it is usually not the person who wrote the fixture.
 */
export function parseFixture(text: string, source: string): GoldenFixture {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    fail(source, `not valid JSON (${String(error)}).`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    fail(source, 'the top level must be a JSON object.');
  }
  const record = raw as Record<string, unknown>;

  const formatVersion = record['formatVersion'];
  if (formatVersion !== FIXTURE_FORMAT_VERSION) {
    fail(
      source,
      `"formatVersion" is ${JSON.stringify(formatVersion)}, but this build reads version ` +
        `${FIXTURE_FORMAT_VERSION}. A fixture from the future cannot be verified by guessing.`,
    );
  }

  const rootSeed = record['rootSeed'];
  if (typeof rootSeed !== 'number' || !Number.isInteger(rootSeed) || rootSeed < 0 || rootSeed >= UINT32_COUNT) {
    fail(source, `"rootSeed" must be an integer in [0, 4294967295], got ${String(rootSeed)}.`);
  }

  const tickCount = record['tickCount'];
  if (typeof tickCount !== 'number' || !Number.isInteger(tickCount) || tickCount < 1) {
    fail(source, `"tickCount" must be a positive integer, got ${String(tickCount)}.`);
  }

  const initialSnapshot = requireString(record['initialSnapshot'], source, 'initialSnapshot');
  // Round-tripping is the canonicality check: whitespace, missing padding, or
  // base64url characters would all still decode, and would then re-encode to
  // something else on the next regeneration — a phantom diff forever.
  if (Buffer.from(initialSnapshot, 'base64').toString('base64') !== initialSnapshot) {
    fail(source, '"initialSnapshot" is not canonical base64.');
  }

  const actionLog = ActionLog.fromJSON(record['actionLog']);
  if (actionLog.length !== tickCount) {
    fail(source, `"actionLog" holds ${actionLog.length} steps but "tickCount" says ${tickCount}.`);
  }

  const tickHashes = record['tickHashes'];
  if (!Array.isArray(tickHashes)) {
    fail(source, '"tickHashes" must be an array — a fixture that cannot locate a divergence is not worth committing.');
  }
  if (tickHashes.length !== tickCount) {
    fail(source, `"tickHashes" holds ${tickHashes.length} entries but "tickCount" says ${tickCount}.`);
  }

  return {
    formatVersion: FIXTURE_FORMAT_VERSION,
    name: requireString(record['name'], source, 'name'),
    description: requireString(record['description'], source, 'description'),
    worldId: requireString(record['worldId'], source, 'worldId'),
    rootSeed,
    tickCount,
    initialSnapshot,
    actionLog: actionLog.toJSON(),
    finalHash: requireHash(record['finalHash'], source, 'finalHash'),
    tickHashes: (tickHashes as unknown[]).map((hash, tick) =>
      requireHash(hash, source, `tickHashes[${tick}]`),
    ),
  };
}

/**
 * Turns a parsed fixture back into the {@link Recording} the replayer consumes.
 *
 * The snapshot bytes are copied out of the decode buffer rather than handed
 * over as-is. Node pools small `Buffer` allocations, so `Buffer.from(…)` is
 * routinely a window at a non-zero offset into a larger `ArrayBuffer`; any
 * consumer that reaches for `.buffer` would then read its neighbours' bytes.
 */
export function recordingOf(fixture: GoldenFixture): Recording {
  return {
    rootSeed: fixture.rootSeed,
    initialSnapshot: Uint8Array.from(Buffer.from(fixture.initialSnapshot, 'base64')),
    actionLog: ActionLog.fromJSON(fixture.actionLog),
    tickCount: fixture.tickCount,
    finalHash: fixture.finalHash,
    tickHashes: [...fixture.tickHashes],
  };
}

export interface FixtureIdentity {
  readonly name: string;
  readonly description: string;
  readonly worldId: string;
}

/**
 * Builds a fixture from a fresh recording, for the regeneration command.
 *
 * Refuses a recording without per-tick hashes rather than writing a fixture
 * that cannot locate a divergence. That mistake is invisible until the day it
 * matters, which is the day someone is trying to find a desync.
 */
export function fixtureFromRecording(
  identity: FixtureIdentity,
  recording: Recording,
): GoldenFixture {
  if (recording.tickHashes === undefined) {
    throw new Error(
      `Golden fixture "${identity.name}" was recorded without per-tick hashes. ` +
        'Record with `traceHashes: true`, or the fixture can only report *that* a run changed.',
    );
  }
  return {
    formatVersion: FIXTURE_FORMAT_VERSION,
    name: identity.name,
    description: identity.description,
    worldId: identity.worldId,
    rootSeed: recording.rootSeed,
    tickCount: recording.tickCount,
    initialSnapshot: Buffer.from(recording.initialSnapshot).toString('base64'),
    actionLog: recording.actionLog.toJSON(),
    finalHash: recording.finalHash,
    tickHashes: [...recording.tickHashes],
  };
}
