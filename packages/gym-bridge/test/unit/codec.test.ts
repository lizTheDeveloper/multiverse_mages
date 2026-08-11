/*
 * Multiverse Mages — the wire: one frame per line, and a reader that survives a chunk.
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

/** `specs/rl-bridge/spec.md`, *"Line-delimited JSON frame transport"*. */

import { FrameDecodeError, LineReader, decodeFrame, encodeFrame } from '@mm/gym-bridge';
import { describe, expect, it } from 'vitest';

describe('a frame round-trips through the codec unchanged', () => {
  it('encodes to one line ending in exactly one newline', () => {
    const line = encodeFrame({ type: 'hello', id: 7 });
    expect(line.endsWith('\n')).toBe(true);
    expect([...line].filter((character) => character === '\n')).toHaveLength(1);
  });

  it('decodes back to an equal value, for every frame shape the protocol carries', () => {
    const frames: unknown[] = [
      { type: 'hello', id: 1, expect: { observationSize: 400 } },
      { type: 'describe' },
      { type: 'reset', id: 'a', envs: [{ env: 0, runSeed: 12, worldTickCap: 4 }] },
      { type: 'step', envs: [{ env: 0, action: 9, slot: 3 }] },
      {
        type: 'step',
        envs: [
          {
            env: 0,
            observation: [0, 0.5, 1],
            mask: [1, 0],
            candidates: [{ action: 9, slots: 32, occupied: [[4]] }],
            outcome: { terminal: false, truncated: true, terminalReason: 0, era: 2, metricDeltas: {} },
            status: 'truncated',
            worldTick: 3,
            illegalActionCount: 1,
            snapshotHash: 'abcdef',
            admitted: false,
            rejection: 'masked',
          },
        ],
      },
      { type: 'error', code: 'unknown-verb', message: 'no', fatal: false },
    ];
    for (const frame of frames) {
      expect(decodeFrame(encodeFrame(frame).trimEnd())).toEqual(frame);
    }
  });

  it('preserves a double exactly, which is what licenses JSON numbers over base64', () => {
    // The argument in `codec.ts` for transporting observations as JSON numbers
    // rests on this: ECMA-262's shortest round-tripping decimal. If it were ever
    // false, the base64 alternative would stop being a legibility trade and
    // start being a correctness one.
    const awkward = [1 / 3, 0.1 + 0.2, Number.MIN_SAFE_INTEGER, 5e-324, 1 - 2 ** -53];
    const decoded = decodeFrame(encodeFrame({ type: 'probe', values: awkward }).trimEnd());
    expect(decoded['values']).toEqual(awkward);
  });

  it('refuses a value JSON renders as null without saying so', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => encodeFrame({ type: 'probe', value })).toThrow(/null/);
    }
  });
});

describe('a line that is not a frame is named rather than guessed at', () => {
  it('refuses text that is not JSON', () => {
    expect(() => decodeFrame('{not json')).toThrow(FrameDecodeError);
  });

  it('refuses JSON that is not an object', () => {
    // `4` and `"hello"` are valid JSON documents and are not frames. Letting one
    // through would put `undefined` into every field read downstream, which
    // surfaces as an unrelated crash three layers away.
    for (const line of ['4', '"hello"', '[1,2]', 'null']) {
      expect(() => decodeFrame(line), line).toThrow(FrameDecodeError);
    }
  });
});

describe('the reader holds a partial line across chunks', () => {
  it('emits nothing until a newline arrives', () => {
    const reader = new LineReader();
    expect(reader.push('{"type":"he')).toEqual([]);
    expect(reader.push('llo"}')).toEqual([]);
    expect(reader.pending()).toBe('{"type":"hello"}');
    expect(reader.push('\n')).toEqual(['{"type":"hello"}']);
  });

  it('never emits a partial frame, whatever the chunk boundaries are', () => {
    // A pipe delivers whatever the kernel had, so the split lands mid-number as
    // often as not. This walks every possible boundary rather than a plausible
    // one, because the plausible ones are exactly the ones that already work.
    const text = encodeFrame({ type: 'step', envs: [{ env: 0, action: 1 }] })
      + encodeFrame({ type: 'close' });
    for (let cut = 0; cut <= text.length; cut += 1) {
      const reader = new LineReader();
      const lines = [...reader.push(text.slice(0, cut)), ...reader.push(text.slice(cut))];
      expect(lines.map((line) => decodeFrame(line)['type']), `cut at ${String(cut)}`).toEqual([
        'step',
        'close',
      ]);
    }
  });

  it('hands back an unterminated tail at end of stream', () => {
    // A record file whose last line has no trailing newline has one action in
    // it, not zero. Dropping it silently reads as a shorter episode rather than
    // as a corrupt file.
    const reader = new LineReader();
    expect(reader.push('{"a":1}')).toEqual([]);
    expect(reader.flush()).toEqual(['{"a":1}']);
    expect(reader.flush()).toEqual([]);
  });

  it('skips empty lines rather than reporting them as frames', () => {
    const reader = new LineReader();
    expect(reader.push('\n\n{"type":"close"}\n')).toEqual(['{"type":"close"}']);
  });
});
