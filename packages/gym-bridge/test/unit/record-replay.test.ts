/*
 * Multiverse Mages — the release claim: a recorded episode replays exactly.
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
 * `docs/design/release-plan.md` §0.11.0, the falsifiable half:
 *
 * > **Claim:** The Python bridge sustains the recorded observation/action
 * > throughput and reproduces a recorded episode exactly.
 * > *Disproved by:* throughput below the recorded figure, or a replayed episode
 * > diverging.
 *
 * The claim is measured against a *real* `agent-api` session over a real
 * universe, not a stub. A replay comparison against a session whose
 * `snapshotHash` is a constant would pass unconditionally and would be the
 * exact shape of the vacuous test this project has already had to fix twice.
 */

import { GOD_ACTION, OBSERVATION_LAYOUT_DIGEST } from '@mm/agent-api';
import type { EpisodeRecord } from '@mm/gym-bridge';
import {
  EnvVector,
  EpisodeRecorder,
  RECORD_FORMAT_VERSION,
  RecordError,
  createBridge,
  encodeRecord,
  episodeHeader,
  parseRecord,
  publishedContract,
  recordContractMismatches,
  replayRecord,
} from '@mm/gym-bridge';
import { describe, expect, it } from 'vitest';

import { FIXTURE_BUILD_VERSION, PROBE_SCENARIO_ID, probeScenario } from './fixtures.js';

const CONTENT_HASH = 'd'.repeat(32);
const CONFIG = { worldTickCap: 24 } as const;

/** A short, deterministic mixture of legal and illegal submissions. */
const SCRIPT: readonly { action: number; slot?: number }[] = [
  { action: GOD_ACTION.noop },
  { action: GOD_ACTION.permitTechnique, slot: 0 },
  { action: GOD_ACTION.forbidTechnique, slot: 3 },
  { action: GOD_ACTION.noop },
  { action: GOD_ACTION.blessMage, slot: 2 },
  { action: GOD_ACTION.encourageResearch, slot: 0 },
  { action: GOD_ACTION.noop },
];

function contract() {
  return publishedContract({
    scenarioId: PROBE_SCENARIO_ID,
    contentHash: CONTENT_HASH,
    buildVersion: FIXTURE_BUILD_VERSION,
  });
}

/** Plays the script through a fresh vector and seals a record. */
function recordAnEpisode(runSeed: number): EpisodeRecord {
  const vector = new EnvVector({ scenario: probeScenario(), envCount: 1 });
  const recorder = new EpisodeRecorder(
    episodeHeader({ runSeed, scenarioConfig: CONFIG, contract: contract() }),
  );
  vector.reset(0, runSeed, CONFIG);
  for (const entry of SCRIPT) {
    if (vector.faultOf(0) !== undefined) break;
    vector.step(0, entry.action, entry.slot);
    recorder.note(entry.action, entry.slot);
  }
  const session = vector.sessionAt(0);
  const outcome = session.outcome();
  return recorder.seal({
    type: 'end',
    status: session.status(),
    terminal: outcome.terminal,
    truncated: outcome.truncated,
    terminalReason: outcome.terminalReason,
    illegalActionCount: session.illegalActionCount(),
    snapshotHash: session.snapshotHash(),
  });
}

describe('a recorded episode replays to an identical snapshot hash', () => {
  it('reaches the recorded hash, character for character', () => {
    const record = recordAnEpisode(0x0b_ad_c0_de);
    // A *fresh* vector, built from a fresh scenario: nothing is shared with the
    // recording, which is the whole point. In production the replay is a
    // separate process, and `bin/replay.mjs` is what makes it one.
    const fresh = new EnvVector({ scenario: probeScenario(), envCount: 1 });
    const result = replayRecord(record, fresh, contract());
    expect(result.replayedHash).toBe(record.footer.snapshotHash);
    expect(result.matched).toBe(true);
    expect(result.actionsReplayed).toBe(SCRIPT.length);
  });

  it('survives a round trip through the file text', () => {
    // The record's format is the wire's format, which is what makes
    // `| tee episode.ndjson` a replayable artifact with no code at all.
    const record = recordAnEpisode(0x1a_2b_3c_4d);
    const reparsed = parseRecord(encodeRecord(record));
    const fresh = new EnvVector({ scenario: probeScenario(), envCount: 1 });
    expect(replayRecord(reparsed, fresh, contract()).matched).toBe(true);
  });

  it('would notice a divergence, rather than passing on anything', () => {
    // The negative control. Without it, "the hashes matched" is
    // indistinguishable from "the comparison compares nothing" — which is the
    // state every determinism test decays into and the state no green run
    // reveals.
    const record = recordAnEpisode(0x2c_3d_4e_5f);
    const tampered: EpisodeRecord = {
      ...record,
      actions: [...record.actions.slice(0, -1)],
    };
    const fresh = new EnvVector({ scenario: probeScenario(), envCount: 1 });
    const result = replayRecord(tampered, fresh, contract());
    expect(result.matched).toBe(false);
    expect(result.replayedHash).not.toBe(record.footer.snapshotHash);
  });

  it('records actions and never observations', () => {
    // An observation is a pure function of the state, so recording one would be
    // recording a derived quantity — and a replay that compared observations
    // would pass or fail on the *normalization*, which is agent-api's claim.
    const record = recordAnEpisode(0x3d_4e_5f_60);
    for (const action of record.actions) {
      expect(new Set(Object.keys(action)).size).toBeLessThanOrEqual(3);
      for (const key of Object.keys(action)) expect(['n', 'action', 'slot']).toContain(key);
    }
    // The header names the *schema version* and the *digest*, which is
    // provenance rather than data — but no line carries a vector.
    const body = encodeRecord(record).split('\n').slice(1).join('\n');
    expect(body).not.toContain('observation');
    expect(body).not.toContain('mask');
  });
});

describe('a record carries enough provenance to be reproduced', () => {
  it('names every key a reader will assume', () => {
    const record = recordAnEpisode(0x4e_5f_60_71);
    expect(record.header.recordFormatVersion).toBe(RECORD_FORMAT_VERSION);
    expect(record.header.records).toBe('actions');
    expect(record.header.runSeed).toBe(0x4e_5f_60_71);
    expect(record.header.scenarioConfig).toEqual(CONFIG);
    for (const field of [
      'protocolVersion',
      'observationSchemaVersion',
      'observationLayoutDigest',
      'observationSize',
      'actionSpaceSize',
      'candidateSlots',
      'scenarioId',
      'contentHash',
      'buildVersion',
    ]) {
      expect(
        (record.header.contract as unknown as Record<string, unknown>)[field],
        field,
      ).toBeDefined();
    }
    expect(record.header.contract.observationLayoutDigest).toBe(OBSERVATION_LAYOUT_DIGEST);
  });
});

describe('a replay refuses rather than reporting a meaningless comparison', () => {
  it('refuses a record made against another observation layout', () => {
    // Not a failing replay — a comparison nobody should report. The number it
    // would produce would read as evidence about determinism when it is
    // evidence about versioning.
    const record = recordAnEpisode(0x5f_60_71_82);
    const stale: EpisodeRecord = {
      ...record,
      header: {
        ...record.header,
        contract: { ...record.header.contract, observationLayoutDigest: 'deadbeefdeadbeef' },
      },
    };
    const fresh = new EnvVector({ scenario: probeScenario(), envCount: 1 });
    expect(() => replayRecord(stale, fresh, contract())).toThrow(RecordError);
    expect(() => replayRecord(stale, fresh, contract())).toThrow(/observationLayoutDigest/);
  });

  it('does not refuse a record made under different content', () => {
    // Deliberately the other way. A record made before a primitive was retuned
    // *will* diverge, and that divergence is the interesting fact — a refusal
    // would replace two useful facts (the hashes differ; the header says which
    // content) with none.
    const record = recordAnEpisode(0x60_71_82_93);
    const retuned = publishedContract({
      scenarioId: PROBE_SCENARIO_ID,
      contentHash: 'e'.repeat(32),
      buildVersion: '9.9.9',
    });
    expect(recordContractMismatches(record, retuned)).toEqual([]);
  });

  it('refuses a record with no footer', () => {
    const text = encodeRecord(recordAnEpisode(0x71_82_93_a4));
    const headless = text.split('\n').slice(0, 3).join('\n') + '\n';
    expect(() => parseRecord(headless)).toThrow(/end.*snapshotHash|snapshotHash/);
  });

  it('refuses a record whose last line is cut mid-JSON', () => {
    const text = encodeRecord(recordAnEpisode(0x82_93_a4_b5));
    expect(() => parseRecord(text.slice(0, text.length - 12))).toThrow(RecordError);
  });

  it('refuses a file with no header', () => {
    expect(() => parseRecord('{"type":"end","snapshotHash":"a"}\n')).toThrow(/at least a header/);
  });

  it('refuses a header whose first line is not an episode frame', () => {
    expect(() => parseRecord('{"type":"step"}\n{"type":"end","snapshotHash":"a"}\n')).toThrow(
      /not "episode"/,
    );
  });

  it('refuses a records field it does not know how to interpret', () => {
    // The field exists so a later format that also writes observation lines is
    // a version bump rather than a silent reinterpretation of a file somebody
    // already has.
    const record = recordAnEpisode(0x93_a4_b5_c6);
    const future = encodeRecord({
      ...record,
      header: { ...record.header, records: 'observations' as 'actions' },
    });
    expect(() => parseRecord(future)).toThrow(/version bump/);
  });
});

describe('the bridge and the recorder agree about what happened', () => {
  it('replays a record made from frames driven through the bridge', () => {
    // End to end: the actions come out of a live bridge's step frames rather
    // than from the script directly, so the record is what a `--record` run
    // would actually write.
    const subject = createBridge({
      scenario: probeScenario(),
      envCount: 1,
      buildVersion: FIXTURE_BUILD_VERSION,
      contentHash: CONTENT_HASH,
    });
    const runSeed = 0xa4_b5_c6_d7;
    const recorder = new EpisodeRecorder(
      episodeHeader({ runSeed, scenarioConfig: CONFIG, contract: subject.contract }),
    );
    subject.vector.reset(0, runSeed, CONFIG);
    for (const entry of SCRIPT) {
      subject.vector.step(0, entry.action, entry.slot);
      recorder.note(entry.action, entry.slot);
    }
    const session = subject.vector.sessionAt(0);
    const outcome = session.outcome();
    const record = recorder.seal({
      type: 'end',
      status: session.status(),
      terminal: outcome.terminal,
      truncated: outcome.truncated,
      terminalReason: outcome.terminalReason,
      illegalActionCount: session.illegalActionCount(),
      snapshotHash: session.snapshotHash(),
    });

    const fresh = new EnvVector({ scenario: probeScenario(), envCount: 1 });
    expect(replayRecord(record, fresh, subject.contract).matched).toBe(true);
  });
});
