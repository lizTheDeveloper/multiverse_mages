/*
 * Multiverse Mages — the episode record, and the replay that is this release's claim.
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
 * `docs/design/release-plan.md` §0.11.0:
 *
 * > **Claim:** The Python bridge sustains the recorded observation/action
 * > throughput and reproduces a recorded episode exactly.
 * > *Disproved by:* throughput below the recorded figure, or a replayed episode
 * > diverging.
 *
 * So a recorded episode is a first-class artifact of this change and not a test
 * fixture, and this file is its format.
 *
 * ## The record holds actions and provenance, never observations
 *
 * An observation is a pure function of the state, so recording one would be
 * recording a derived quantity — and a replay that compared observations would
 * pass or fail on the *normalization*, which is `agent-api`'s claim and is
 * already tested there. What this release claims is about the simulation
 * reached through the bridge, and `snapshotHash` is exactly the quantity
 * `sim-core`'s golden fixtures use to make that claim.
 *
 * The header declares `records: 'actions'` so that a later version which also
 * writes observation lines is a version bump rather than a reinterpretation of
 * a file somebody already has.
 *
 * ## Why the format is the wire format
 *
 * One line, one JSON object — the same shape the pipe carries. That is not a
 * coincidence and it is the strongest argument for choosing NDJSON in the first
 * place: `2>/dev/null | tee episode.ndjson` produces a replayable artifact with
 * no code at all, and a divergence can be read with `head`. A shared-memory
 * ring would have had no on-the-wire representation, so proving this claim
 * would have required inventing a second serialized format solely to record it
 * — and the property proven would then have been a property of that format.
 */

import type { ScenarioConfig } from '@mm/agent-api';

import { FrameDecodeError, decodeFrame, encodeFrame } from './codec.js';
import type { ObservationContract } from './protocol.js';
import { STRUCTURAL_CONTRACT_FIELDS } from './protocol.js';
import type { ContractMismatch } from './protocol.js';
import { renderField } from './contract.js';
import type { EnvVector } from './vector.js';

/** The record format's version. Distinct from the protocol's. */
export const RECORD_FORMAT_VERSION = 1;

/** What the first line of a record says. */
export interface EpisodeHeader {
  readonly type: 'episode';
  readonly recordFormatVersion: number;
  /** `actions` today. A later format writing observations declares another value. */
  readonly records: 'actions';
  readonly runSeed: number;
  readonly scenarioConfig: ScenarioConfig;
  readonly contract: ObservationContract;
}

/** One submitted action. */
export interface EpisodeAction {
  /** Submission ordinal, from zero. Not a clock tick — see `sim-core`'s recorder. */
  readonly n: number;
  readonly action: number;
  readonly slot?: number;
}

/** What the last line of a record says. */
export interface EpisodeFooter {
  readonly type: 'end';
  readonly status: string;
  readonly terminal: boolean;
  readonly truncated: boolean;
  readonly terminalReason: number;
  readonly illegalActionCount: number;
  readonly snapshotHash: string;
}

/** A parsed record. */
export interface EpisodeRecord {
  readonly header: EpisodeHeader;
  readonly actions: readonly EpisodeAction[];
  readonly footer: EpisodeFooter;
}

/** What is wrong with a record file. */
export class RecordError extends Error {}

/** Builds the header a recording starts with. */
export function episodeHeader(input: {
  readonly runSeed: number;
  readonly scenarioConfig: ScenarioConfig;
  readonly contract: ObservationContract;
}): EpisodeHeader {
  return {
    type: 'episode',
    recordFormatVersion: RECORD_FORMAT_VERSION,
    records: 'actions',
    runSeed: input.runSeed,
    scenarioConfig: input.scenarioConfig,
    contract: input.contract,
  };
}

/** Renders a whole record as its file text. */
export function encodeRecord(record: EpisodeRecord): string {
  return [
    encodeFrame(record.header),
    ...record.actions.map((action) => encodeFrame(action)),
    encodeFrame(record.footer),
  ].join('');
}

/**
 * Parses a record file, refusing anything it cannot replay faithfully.
 *
 * Refusal rather than best-effort, throughout. A record missing its footer is a
 * recording that was interrupted, and replaying it would produce a hash
 * comparison against nothing — which reads as a pass. A record whose last line
 * is truncated mid-JSON is the same failure with a different spelling.
 */
export function parseRecord(text: string): EpisodeRecord {
  const lines = text.split('\n').filter((line) => line.length > 0);
  if (lines.length < 2) {
    throw new RecordError(
      `A record needs at least a header and a footer; this file has ${String(lines.length)} ` +
        'line(s). A partial recording replays into a comparison against nothing, which reads as ' +
        'a pass.',
    );
  }

  let header: Record<string, unknown>;
  try {
    header = decodeFrame(lines[0] as string);
  } catch (error) {
    const detail = error instanceof FrameDecodeError ? error.message : String(error);
    throw new RecordError(`The first line is not a header frame: ${detail}`);
  }
  if (header['type'] !== 'episode') {
    throw new RecordError(
      `The first line has type ${JSON.stringify(header['type'])}, not "episode". A record without ` +
        'a header carries no provenance, and provenance is the whole reason it is worth keeping.',
    );
  }
  for (const field of ['runSeed', 'scenarioConfig', 'contract', 'records'] as const) {
    if (header[field] === undefined) {
      throw new RecordError(`The header omits ${field}, so this record cannot be reproduced.`);
    }
  }
  if (header['records'] !== 'actions') {
    throw new RecordError(
      `The header declares records=${JSON.stringify(header['records'])}, which this reader does ` +
        'not know how to interpret. The field exists so a later format is a version bump rather ' +
        'than a silent reinterpretation.',
    );
  }

  const lastLine = lines[lines.length - 1] as string;
  let footer: Record<string, unknown>;
  try {
    footer = decodeFrame(lastLine);
  } catch (error) {
    const detail = error instanceof FrameDecodeError ? error.message : String(error);
    throw new RecordError(`The last line is not a footer frame: ${detail}`);
  }
  if (footer['type'] !== 'end' || typeof footer['snapshotHash'] !== 'string') {
    throw new RecordError(
      'The last line is not an "end" frame carrying a snapshotHash. A record that ends without ' +
        'one is a recording that was interrupted, and there is nothing to compare a replay to.',
    );
  }

  const actions: EpisodeAction[] = [];
  for (let index = 1; index < lines.length - 1; index += 1) {
    let parsed: Record<string, unknown>;
    try {
      parsed = decodeFrame(lines[index] as string);
    } catch (error) {
      const detail = error instanceof FrameDecodeError ? error.message : String(error);
      throw new RecordError(`Line ${String(index + 1)} is not an action frame: ${detail}`);
    }
    const action = parsed['action'];
    if (typeof action !== 'number') {
      throw new RecordError(
        `Line ${String(index + 1)} names action ${String(action)}, which is not a number.`,
      );
    }
    const slot = parsed['slot'];
    actions.push({
      n: typeof parsed['n'] === 'number' ? parsed['n'] : index - 1,
      action,
      ...(typeof slot === 'number' ? { slot } : {}),
    });
  }

  return {
    header: header as unknown as EpisodeHeader,
    actions,
    footer: footer as unknown as EpisodeFooter,
  };
}

/**
 * Accumulates one episode's actions, then seals them with the footer.
 *
 * Deliberately not wired into {@link EnvVector}: recording is a caller's
 * decision, and a vector that recorded unconditionally would allocate a growing
 * array per env for the many callers who never write one. `bin/serve.mjs`
 * constructs one when `--record` is given and not otherwise.
 */
export class EpisodeRecorder {
  private readonly actions: EpisodeAction[] = [];

  constructor(private readonly header: EpisodeHeader) {}

  /** Notes one submission, in submission order. */
  note(action: number, slot?: number): void {
    this.actions.push({
      n: this.actions.length,
      action,
      ...(slot === undefined ? {} : { slot }),
    });
  }

  /** How many submissions have been noted. */
  get length(): number {
    return this.actions.length;
  }

  /** Seals the record with the episode's outcome. */
  seal(footer: EpisodeFooter): EpisodeRecord {
    return { header: this.header, actions: [...this.actions], footer };
  }
}

/** What a replay concluded. */
export interface ReplayResult {
  readonly matched: boolean;
  readonly recordedHash: string;
  readonly replayedHash: string;
  readonly actionsReplayed: number;
  readonly status: string;
}

/**
 * Drives a record through a fresh vector and compares the final snapshot hash.
 *
 * **The contract is checked first, and a mismatch refuses rather than
 * diverging.** A record made against another observation layout is not a
 * failing replay; it is a comparison nobody should report, because the number
 * it would produce would be read as evidence about determinism when it is
 * evidence about versioning.
 *
 * @param build - What the replaying build publishes. Passed in rather than
 * re-derived here, so that a replay compares against the tree it is running in
 * and this file needs no opinion about how a contract is assembled.
 */
export function replayRecord(
  record: EpisodeRecord,
  vector: EnvVector,
  build: ObservationContract,
  env = 0,
): ReplayResult {
  const mismatches = recordContractMismatches(record, build);
  if (mismatches.length > 0) {
    throw new RecordError(
      'This record was made against a different observation contract, so its replay would ' +
        'compare two different environments: ' +
        mismatches
          .map((one) => `${one.field}: build has ${one.bridge}, record has ${one.client}`)
          .join('; ') +
        '. Nothing was replayed.',
    );
  }

  vector.reset(env, record.header.runSeed, record.header.scenarioConfig);
  let replayed = 0;
  for (const action of record.actions) {
    if (vector.faultOf(env) !== undefined) break;
    vector.step(env, action.action, action.slot);
    replayed += 1;
  }

  const session = vector.sessionAt(env);
  const replayedHash = session.snapshotHash();
  return {
    matched: replayedHash === record.footer.snapshotHash,
    recordedHash: record.footer.snapshotHash,
    replayedHash,
    actionsReplayed: replayed,
    status: session.status(),
  };
}

/**
 * Where a record's contract disagrees with the build replaying it.
 *
 * Only the structural half. `contentHash` deliberately does not refuse a
 * replay: a record made before a primitive was retuned *will* diverge, and that
 * divergence is the interesting thing rather than an error — the replay reports
 * a hash mismatch and the header says which content it was made under, which is
 * a more useful pair of facts than a refusal would be.
 */
export function recordContractMismatches(
  record: EpisodeRecord,
  build: ObservationContract,
): ContractMismatch[] {
  const recorded = record.header.contract as unknown as Record<string, unknown>;
  const published = build as unknown as Record<string, unknown>;
  const found: ContractMismatch[] = [];
  for (const field of STRUCTURAL_CONTRACT_FIELDS) {
    const held = renderField(recorded[field]);
    // An absent field is not a disagreement. A record written by an older
    // format that did not carry a field cannot be said to disagree about it,
    // and refusing on absence would make every format addition retroactively
    // invalidate every record already on disk.
    if (held === '') continue;
    const current = renderField(published[field]);
    if (held !== current) {
      found.push({ field: String(field), bridge: current, client: held });
    }
  }
  return found;
}
