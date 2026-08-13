/*
 * Multiverse Mages — the framing, and the bound a socket needs that a pipe does not.
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

import { describe, expect, it } from 'vitest';

import {
  BoundedLineReader,
  FRAME_SEPARATOR,
  FrameDecodeError,
  FrameTooLongError,
  decodeFrame,
  encodeFrame,
} from '../../src/index.js';

describe('one JSON object per line', () => {
  it('ends every frame in exactly one newline', () => {
    const line = encodeFrame({ type: 'welcome' });
    expect(line.endsWith(FRAME_SEPARATOR)).toBe(true);
    expect(line.slice(0, -1)).not.toContain(FRAME_SEPARATOR);
  });

  it('round-trips a frame', () => {
    const frame = { type: 'tick', tick: 3, hashes: ['aaaa', 'bbbb'] };
    expect(decodeFrame(encodeFrame(frame).trim())).toEqual(frame);
  });

  it('refuses a value JSON would render as null without saying so', () => {
    // A tick number or a hash that arrived as `null` would fail several layers
    // from the fault. `gym-bridge`'s codec makes the same refusal.
    expect(() => encodeFrame({ type: 'tick', tick: Number.NaN })).toThrow(TypeError);
    expect(() => encodeFrame({ type: 'tick', tick: Number.POSITIVE_INFINITY })).toThrow(TypeError);
  });

  it('refuses a line that is valid JSON but is not a frame', () => {
    expect(() => decodeFrame('4')).toThrow(FrameDecodeError);
    expect(() => decodeFrame('"hello"')).toThrow(FrameDecodeError);
    expect(() => decodeFrame('[]')).toThrow(FrameDecodeError);
    expect(() => decodeFrame('{oops')).toThrow(FrameDecodeError);
  });
});

describe('the reader survives a chunk boundary', () => {
  it('never emits a partial frame, however the bytes are cut', () => {
    const frames = [{ type: 'a', n: 1 }, { type: 'b', n: 2 }, { type: 'c', n: 3 }];
    const stream = frames.map(encodeFrame).join('');

    for (let cut = 1; cut < stream.length; cut += 1) {
      const reader = new BoundedLineReader();
      const seen = [
        ...reader.push(stream.slice(0, cut)),
        ...reader.push(stream.slice(cut)),
        ...reader.flush(),
      ];
      expect(seen.map((line) => decodeFrame(line))).toEqual(frames);
    }
  });

  it('keeps an unterminated tail rather than dropping it', () => {
    const reader = new BoundedLineReader();
    expect(reader.push('{"type":"a"}\n{"type":"b"}')).toEqual(['{"type":"a"}']);
    expect(reader.pending()).toBe('{"type":"b"}');
    expect(reader.flush()).toEqual(['{"type":"b"}']);
  });
});

describe('§4.2: the bound a socket needs and a pipe does not', () => {
  it('refuses an unterminated line that grows past the limit', () => {
    // `gym-bridge` reads a pipe whose only writer is its own parent, so its
    // reader is unbounded and that is correct there. This one reads a socket
    // anyone can open, and an unbounded buffer is an allocation a peer controls
    // — reachable before a single action is ever parsed.
    const reader = new BoundedLineReader(64);
    expect(() => reader.push('x'.repeat(65))).toThrow(FrameTooLongError);
  });

  it('clears the buffer as it refuses, so a reconnecting peer gains nothing', () => {
    const reader = new BoundedLineReader(16);
    expect(() => reader.push('y'.repeat(20))).toThrow(FrameTooLongError);
    expect(reader.pending()).toBe('');
  });

  it('does not refuse a long stream of ordinary frames', () => {
    // The bound is on one unterminated line, not on throughput. A reader that
    // conflated the two would drop a busy but honest participant.
    const reader = new BoundedLineReader(64);
    const many = Array.from({ length: 200 }, (_, i) => encodeFrame({ type: 't', i })).join('');
    expect(reader.push(many)).toHaveLength(200);
  });
});
