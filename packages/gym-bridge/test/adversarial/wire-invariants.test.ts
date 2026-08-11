/*
 * Multiverse Mages — trying to make the bridge write something that is not a frame.
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
 * The brief for this file was to break the transport rather than to demonstrate
 * it.
 *
 * One invariant carries everything else: **every line the bridge writes parses
 * as a JSON object with a known `type`.** A stream that carries one line of
 * anything else is desynchronized from that point on, and the symptom is not an
 * error — it is a client that reads a step result as an error frame, or blocks
 * forever on a response that already went past. So the inputs below are chosen
 * to be the ones a careless or hostile client actually sends, and the assertion
 * is the same for all of them.
 */

import { ACTION_SPACE_SIZE, GOD_ACTION } from '@mm/agent-api';
import type { BridgeReply } from '@mm/gym-bridge';
import { ALL_VERBS, createBridge, decodeFrame, encodeFrame } from '@mm/gym-bridge';
import { describe, expect, it } from 'vitest';

import { FIXTURE_BUILD_VERSION, probeScenario } from '../unit/fixtures.js';

const RESPONSE_TYPES = new Set(['ready', 'layout', 'observation', 'step', 'closed', 'error']);

function opened(envCount = 2) {
  const subject = createBridge({
    scenario: probeScenario(),
    envCount,
    buildVersion: FIXTURE_BUILD_VERSION,
  });
  subject.handleLine(encodeFrame({ type: 'hello' }).trimEnd());
  return subject;
}

/** Asserts the reply is a well-formed frame stream, and returns the frames. */
function framesOf(reply: BridgeReply, label: string): Record<string, unknown>[] {
  const frames: Record<string, unknown>[] = [];
  for (const line of reply.lines) {
    expect(line.endsWith('\n'), `${label}: line does not end in a newline`).toBe(true);
    expect(
      [...line.slice(0, -1)].filter((character) => character === '\n'),
      `${label}: embedded newline`,
    ).toHaveLength(0);
    const frame = decodeFrame(line.trimEnd());
    expect(RESPONSE_TYPES.has(String(frame['type'])), `${label}: type ${String(frame['type'])}`).toBe(
      true,
    );
    frames.push(frame);
  }
  return frames;
}

/** Lines a client might plausibly send by accident or on purpose. */
const HOSTILE_LINES: readonly string[] = [
  '',
  ' ',
  '{',
  '}',
  'null',
  'true',
  '[]',
  '[{"type":"hello"}]',
  '"hello"',
  '0',
  '{"type":null}',
  '{"type":123}',
  '{"type":{"nested":"hello"}}',
  '{"type":"hello","expect":[]}',
  '{"type":"hello","expect":"everything"}',
  '{"type":"reset"}',
  '{"type":"reset","envs":[]}',
  '{"type":"reset","envs":"all"}',
  '{"type":"reset","envs":[{}]}',
  '{"type":"reset","envs":[{"env":0}]}',
  '{"type":"reset","envs":[{"env":-1,"runSeed":1,"worldTickCap":4}]}',
  '{"type":"reset","envs":[{"env":1.5,"runSeed":1,"worldTickCap":4}]}',
  '{"type":"reset","envs":[{"env":0,"runSeed":"seed","worldTickCap":4}]}',
  '{"type":"step"}',
  '{"type":"step","envs":[{"env":0}]}',
  '{"type":"step","envs":[{"env":0,"action":null}]}',
  '{"type":"step","envs":[{"env":0,"action":"noop"}]}',
  '{"type":"step","envs":[{"env":0,"action":0,"slot":"first"}]}',
  '{"type":"STEP","envs":[{"env":0,"action":0}]}',
  '{"type":"__proto__"}',
  '{"__proto__":{"polluted":true},"type":"describe"}',
  '{"type":"describe","id":{"not":"scalar"}}',
];

describe('nothing a client can send makes the bridge write a non-frame', () => {
  it('answers every hostile line with well-formed frames', () => {
    const subject = opened();
    for (const line of HOSTILE_LINES) {
      const reply = subject.handleLine(line);
      framesOf(reply, JSON.stringify(line));
      expect(reply.fatal, JSON.stringify(line)).toBe(false);
    }
  });

  it('is still answering normally after all of them', () => {
    // The property that matters more than any individual refusal: a client that
    // sends nonsense and then recovers is served. A bridge that quietly stopped
    // answering would present as a hang rather than as an error.
    const subject = opened();
    for (const line of HOSTILE_LINES) subject.handleLine(line);
    const reply = subject.handleLine(
      encodeFrame({ type: 'reset', envs: [{ env: 0, runSeed: 5, worldTickCap: 4 }] }).trimEnd(),
    );
    expect(framesOf(reply, 'recovery')[0]?.['type']).toBe('observation');
  });

  it('does not let a __proto__ key reach Object.prototype', () => {
    // `JSON.parse` does not walk a prototype chain, but a frame handler that
    // spread a parsed object into a fresh one could. Asserted rather than
    // assumed, because the consequence — every object in the process gaining a
    // property — is diffuse and would be blamed on something else.
    const subject = opened();
    subject.handleLine('{"__proto__":{"polluted":true},"type":"describe"}');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});

describe('the wire refuses to carry what JSON cannot', () => {
  it('never emits a null in place of a number', () => {
    // The failure this prevents: `JSON.stringify(NaN)` is `"null"`, silently. A
    // channel arriving as `None` in Python fails several layers from the fault.
    const subject = opened(1);
    subject.handleLine(
      encodeFrame({ type: 'reset', envs: [{ env: 0, runSeed: 7, worldTickCap: 4 }] }).trimEnd(),
    );
    const reply = subject.handleLine(
      encodeFrame({ type: 'step', envs: [{ env: 0, action: GOD_ACTION.noop }] }).trimEnd(),
    );
    for (const line of reply.lines) {
      expect(line).not.toContain('null');
      expect(line).not.toContain('NaN');
      expect(line).not.toContain('Infinity');
    }
  });

  it('emits a mask of exactly the action-space width whatever was submitted', () => {
    // A policy's output layer is this wide. A mask that shrank with the state
    // would be an output layer that changed size mid-run.
    const subject = opened(1);
    subject.handleLine(
      encodeFrame({ type: 'reset', envs: [{ env: 0, runSeed: 8, worldTickCap: 12 }] }).trimEnd(),
    );
    for (const action of [0, 1, 7, 15, 99, -3]) {
      const reply = subject.handleLine(
        encodeFrame({ type: 'step', envs: [{ env: 0, action }] }).trimEnd(),
      );
      const frame = framesOf(reply, `action ${String(action)}`)[0] as Record<string, unknown>;
      if (frame['type'] !== 'step') continue;
      const view = (frame['envs'] as Record<string, unknown>[])[0] as Record<string, unknown>;
      expect(view['mask']).toHaveLength(ACTION_SPACE_SIZE);
    }
  });
});

describe('the verb table and the refusal agree with each other', () => {
  it('accepts every verb it advertises', () => {
    // Without this, the `unknown-verb` message could list a verb the dispatcher
    // does not handle — a refusal that tells the client to send something that
    // will also be refused.
    const subject = opened(1);
    subject.handleLine(
      encodeFrame({ type: 'reset', envs: [{ env: 0, runSeed: 9, worldTickCap: 8 }] }).trimEnd(),
    );
    const bodies: Record<string, unknown> = {
      hello: {},
      describe: {},
      reset: { envs: [{ env: 0, runSeed: 9, worldTickCap: 8 }] },
      step: { envs: [{ env: 0, action: 0 }] },
      close: {},
    };
    for (const verb of ALL_VERBS) {
      const reply = subject.handleLine(
        encodeFrame({ type: verb, ...(bodies[verb] as object) }).trimEnd(),
      );
      const frame = framesOf(reply, verb)[0] as Record<string, unknown>;
      expect(frame['code'], `${verb} was refused`).not.toBe('unknown-verb');
    }
  });
});
