/*
 * Multiverse Mages — the handshake, which is where a checkpoint is stopped.
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
 * `specs/rl-bridge/spec.md`, *"Handshake pins the observation contract before
 * any episode exists"* and *"The transported layout table reproduces the
 * published digest"*.
 *
 * The property under test is stronger than "a mismatch is reported": it is that
 * **no observation is emitted**. A policy handed one differently-meaning vector
 * has already been contaminated, and the run that produces it looks exactly like
 * a run that was not — so a refusal that arrives after the first `reset` is a
 * refusal that arrives too late.
 */

import {
  OBSERVATION_LAYOUT_DIGEST,
  OBSERVATION_SIZE,
  OBSERVATION_SLOTS,
  layoutDigest,
  layoutEncoding,
} from '@mm/agent-api';
import { createBridge, decodeFrame, encodeFrame } from '@mm/gym-bridge';
import { describe, expect, it } from 'vitest';

import { FIXTURE_BUILD_VERSION, PROBE_SCENARIO_ID, probeScenario } from './fixtures.js';

function bridge(contentHash = 'a'.repeat(32)) {
  return createBridge({
    scenario: probeScenario(),
    envCount: 2,
    buildVersion: FIXTURE_BUILD_VERSION,
    contentHash,
  });
}

/** Sends one frame and returns the decoded reply, with the bridge's verdict. */
function send(subject: ReturnType<typeof bridge>, frame: unknown) {
  const reply = subject.handleLine(encodeFrame(frame).trimEnd());
  return {
    ...reply,
    frames: reply.lines.map((line) => decodeFrame(line.trimEnd())),
  };
}

describe('nothing is answered before hello', () => {
  it('refuses a reset that arrives first, and creates no episode', () => {
    const subject = bridge();
    const reply = send(subject, { type: 'reset', envs: [{ env: 0, runSeed: 1, worldTickCap: 4 }] });
    expect(reply.frames[0]?.['code']).toBe('handshake-required');
    expect(reply.frames[0]?.['type']).toBe('error');
    // And the env really is untouched: a step now reports no-episode, not
    // episode-over or an observation.
    send(subject, { type: 'hello' });
    const stepped = send(subject, { type: 'step', envs: [{ env: 0, action: 0 }] });
    expect(stepped.frames[0]?.['code']).toBe('no-episode');
  });

  it('refuses a describe that arrives first', () => {
    expect(send(bridge(), { type: 'describe' }).frames[0]?.['code']).toBe('handshake-required');
  });
});

describe('a client that declares nothing is served', () => {
  it('publishes every contract field and no advisories', () => {
    const reply = send(bridge(), { type: 'hello', id: 1 });
    const frame = reply.frames[0] as Record<string, unknown>;
    expect(frame['type']).toBe('ready');
    expect(frame['id']).toBe(1);
    expect(frame['advisories']).toEqual([]);
    expect(frame['envCount']).toBe(2);
    const contract = frame['contract'] as Record<string, unknown>;
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
      expect(contract[field], field).toBeDefined();
    }
    expect(contract['observationSize']).toBe(OBSERVATION_SIZE);
    expect(contract['observationLayoutDigest']).toBe(OBSERVATION_LAYOUT_DIGEST);
    expect(contract['scenarioId']).toBe(PROBE_SCENARIO_ID);
  });
});

describe('a structural mismatch is fatal, before the first observation', () => {
  it('refuses a stale layout digest and emits no observation', () => {
    const subject = bridge();
    const reply = send(subject, {
      type: 'hello',
      expect: { observationLayoutDigest: '0123456789abcdef' },
    });
    expect(reply.fatal).toBe(true);
    const frame = reply.frames[0] as Record<string, unknown>;
    expect(frame['type']).toBe('error');
    expect(frame['code']).toBe('contract-mismatch');
    expect(frame['fatal']).toBe(true);
    expect(frame['mismatches']).toEqual([
      {
        field: 'observationLayoutDigest',
        bridge: OBSERVATION_LAYOUT_DIGEST,
        client: '0123456789abcdef',
      },
    ]);
    // Nothing this bridge has ever emitted is an observation.
    expect(reply.frames.some((one) => one['type'] === 'observation')).toBe(false);
  });

  it('names all three of three disagreements in one frame', () => {
    // All at once rather than first-wins: a client three fields out of date
    // would otherwise take three cycles, and the third is where somebody
    // reaches for a flag that turns the check off.
    const reply = send(bridge(), {
      type: 'hello',
      expect: { observationSize: 1, actionSpaceSize: 2, protocolVersion: 99 },
    });
    const fields = (reply.frames[0]?.['mismatches'] as { field: string }[]).map(
      (one) => one.field,
    );
    expect(new Set(fields)).toEqual(new Set(['observationSize', 'actionSpaceSize', 'protocolVersion']));
  });

  it('refuses a changed candidate slot count, which no length check would catch', () => {
    // §4.4's `k` is what a policy's parameterized output head indexes into.
    // Changing one leaves the observation length, the action space size and the
    // digest all untouched — so it is precisely the mismatch that a coarser
    // check would wave through.
    const reply = send(bridge(), { type: 'hello', expect: { candidateSlots: { '9': 64 } } });
    expect(reply.frames[0]?.['code']).toBe('contract-mismatch');
  });

  it('accepts a declaration whose numbers arrived as strings', () => {
    // A client whose contract came from a serializer that quotes numbers is
    // declaring the same environment. The comparison is over rendered text
    // precisely so that this is a match rather than a refusal about YAML.
    const reply = send(bridge(), {
      type: 'hello',
      expect: { observationSize: String(OBSERVATION_SIZE) as unknown as number },
    });
    expect(reply.frames[0]?.['type']).toBe('ready');
  });
});

describe('an advisory mismatch warns and runs', () => {
  it('reports a changed content hash and still serves a reset', () => {
    // The proposal asks whether the identifier should hash the content set too,
    // and answers itself: too strict to be usable during balance tuning, which
    // retunes constantly. So this is an advisory, and the run records it.
    const subject = bridge('b'.repeat(32));
    const ready = send(subject, { type: 'hello', expect: { contentHash: 'c'.repeat(32) } });
    expect(ready.fatal).toBe(false);
    expect(ready.frames[0]?.['advisories']).toEqual([
      { field: 'contentHash', bridge: 'b'.repeat(32), client: 'c'.repeat(32) },
    ]);
    const reset = send(subject, { type: 'reset', envs: [{ env: 0, runSeed: 5, worldTickCap: 4 }] });
    expect(reset.frames[0]?.['type']).toBe('observation');
  });
});

describe('the transported layout table reproduces the published digest', () => {
  it('transports agent-api encoding verbatim', () => {
    const subject = bridge();
    send(subject, { type: 'hello' });
    const frame = send(subject, { type: 'describe' }).frames[0] as Record<string, unknown>;
    expect(frame['type']).toBe('layout');
    expect(frame['encoding']).toBe(layoutEncoding(OBSERVATION_SLOTS));
    expect(frame['observationLayoutDigest']).toBe(OBSERVATION_LAYOUT_DIGEST);
  });

  it('hashes to the digest in the same frame', () => {
    // `digest.ts` argues FNV-1a was chosen so *"a second implementation can
    // follow [it] from the document rather than from the source"*, and exports
    // the encoding because *"a digest whose input cannot be inspected is a
    // digest nobody can debug"*. This is the property that makes both true
    // across the process boundary: the client can verify rather than trust.
    const subject = bridge();
    send(subject, { type: 'hello' });
    const frame = send(subject, { type: 'describe' }).frames[0] as Record<string, unknown>;
    expect(layoutDigest(OBSERVATION_SLOTS)).toBe(frame['observationLayoutDigest']);
    expect(frame['encoding']).toMatch(/^mm-observation-layout\/1\tslots=400\n/);
  });
});

describe('a fault names itself and lets the client recover', () => {
  it('reports malformed input and answers the next frame', () => {
    const subject = bridge();
    send(subject, { type: 'hello' });
    const bad = subject.handleLine('{not json');
    const frame = decodeFrame((bad.lines[0] as string).trimEnd());
    expect(frame['code']).toBe('malformed-frame');
    expect(bad.fatal).toBe(false);
    expect(send(subject, { type: 'describe' }).frames[0]?.['type']).toBe('layout');
  });

  it('names an unknown verb and lists the ones it accepts', () => {
    const subject = bridge();
    send(subject, { type: 'hello' });
    const frame = send(subject, { type: 'train' }).frames[0] as Record<string, unknown>;
    expect(frame['code']).toBe('unknown-verb');
    expect(String(frame['message'])).toContain('"train"');
    for (const verb of ['hello', 'describe', 'reset', 'step', 'close']) {
      expect(String(frame['message'])).toContain(verb);
    }
  });

  it('echoes the request id so a client may pipeline', () => {
    const subject = bridge();
    send(subject, { type: 'hello' });
    for (const id of [1, 2, 'three']) {
      const frame = send(subject, { type: 'describe', id }).frames[0] as Record<string, unknown>;
      expect(frame['id']).toBe(id);
    }
  });

  it('omits the id when the request carried none', () => {
    const subject = bridge();
    const frame = send(subject, { type: 'hello' }).frames[0] as Record<string, unknown>;
    expect('id' in frame).toBe(false);
  });
});
