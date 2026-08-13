/*
 * Multiverse Mages — newline-delimited JSON over a socket, with a bounded reader.
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
 * The wire, and only the wire.
 *
 * ## Why this is not `gym-bridge`'s codec imported
 *
 * It is the same framing on purpose — one JSON object per line, `\n` the
 * boundary — because two frame vocabularies that look different for no reason
 * is the divergence vision §9 warns about. It is a separate *implementation*
 * for two reasons, in order of weight:
 *
 * 1. **§5 permits no such edge.** This package's dependency list is
 *    `agent-api`, exactly as §5 draws it, and `gym-bridge` is a sibling leaf.
 *    Importing it would be a boundary violation, and hoisting the codec into a
 *    shared package would create a fifth deviation from §5 to hold sixty lines.
 * 2. **The trust boundaries differ, and so must the reader.** `gym-bridge`'s
 *    codec reads a pipe whose only writer is the process that spawned it — its
 *    own note says the admission policy is the operating system's. This one
 *    reads a socket that anyone can open. §4.2 is explicit that a layer
 *    accepting actions across a trust boundary must apply its own admission
 *    policy *before* the action reaches the core. So this reader is **bounded**:
 *    a peer that never sends a newline cannot make the server buffer without
 *    limit. That single difference is the whole reason a shared codec would
 *    have been wrong even if §5 allowed it — the safe version for a socket is
 *    not the fast version for a pipe.
 *
 * Everything else follows `gym-bridge/src/codec.ts` deliberately, including its
 * refusal to encode `NaN`/`Infinity` — `JSON.stringify` renders them as `null`
 * and says nothing, and a hash or a tick number arriving as `null` would fail
 * several layers from the fault.
 */

/** The one byte that separates frames. */
export const FRAME_SEPARATOR = '\n';

/**
 * The longest line this reader will buffer, in UTF-16 code units.
 *
 * Generous for every frame this protocol defines — the largest is a tick notice
 * whose size grows with participant count — and finite, which is the point. §4.2
 * puts the defence at the boundary; an unbounded line buffer is an unbounded
 * allocation a peer controls, and it is reachable before a single action is ever
 * parsed.
 */
export const MAX_FRAME_LENGTH = 1_048_576;

/**
 * Renders one frame as a line, ending in exactly one `\n`.
 *
 * @throws if the frame holds a value JSON cannot carry faithfully.
 */
export function encodeFrame(frame: unknown): string {
  const text = JSON.stringify(frame, replacer);
  if (text === undefined) {
    throw new TypeError(
      'A frame must serialize to JSON. `undefined`, a function, or a symbol at the top level ' +
        'produces no text at all, and a server that wrote nothing would leave the participant ' +
        'waiting on a tick that is never coming.',
    );
  }
  if (text.includes(FRAME_SEPARATOR)) {
    // Not reachable through `JSON.stringify`, which escapes newlines inside
    // strings — asserted rather than assumed, because the whole framing rests
    // on it and the cost of being wrong is a desynchronized stream.
    throw new TypeError(
      'A frame line may not contain a newline; the newline is the frame boundary.',
    );
  }
  return text + FRAME_SEPARATOR;
}

/** Rejects the values JSON renders as `null` without saying so. */
function replacer(key: string, value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError(
      `Field ${JSON.stringify(key)} holds ${String(value)}, which JSON renders as null. A tick ` +
        'number or a hash that arrived as null would fail several layers from the fault; it is ' +
        'rejected here, beside the name of the field it came from.',
    );
  }
  return value;
}

/** What went wrong with a line that is not a frame. */
export class FrameDecodeError extends Error {}

/**
 * Parses one line into a frame object.
 *
 * @throws {FrameDecodeError} if the line is not JSON, or is JSON that is not an
 * object — a bare `4` or `"hello"` is valid JSON and is not a frame, and letting
 * one through would put `undefined` into every field read downstream.
 */
export function decodeFrame(line: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    throw new FrameDecodeError(`Line is not valid JSON: ${String(error)}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new FrameDecodeError(
      `Line parsed as ${Array.isArray(parsed) ? 'an array' : String(typeof parsed)}, not an ` +
        'object. Every frame is a JSON object with a `type`.',
    );
  }
  return parsed as Record<string, unknown>;
}

/** Raised when a peer's unterminated line exceeds {@link MAX_FRAME_LENGTH}. */
export class FrameTooLongError extends Error {}

/**
 * Splits a byte stream into lines, holding a partial line across chunks, and
 * refusing one that grows past {@link MAX_FRAME_LENGTH}.
 *
 * A socket delivers whatever the kernel had; a split lands mid-number as often
 * as not, and a reader that parsed each chunk would fail on almost every frame
 * — the kind of bug that reproduces on a busy machine and never on a quiet one.
 *
 * Deliberately a class with an explicit buffer rather than an async iterator:
 * the suite feeds it hand-cut chunks, and the property under test is *"no
 * partial frame is ever emitted, and no peer can make the buffer unbounded"*,
 * which needs the buffer to be inspectable.
 */
export class BoundedLineReader {
  private buffer = '';

  constructor(private readonly maxLength: number = MAX_FRAME_LENGTH) {}

  /**
   * Feeds a chunk and returns whatever complete lines it completed.
   *
   * @throws {FrameTooLongError} if the unterminated remainder exceeds the bound.
   * The caller's contract is to drop the connection: a peer that has already
   * sent a megabyte with no newline is not going to send one.
   */
  push(chunk: string): string[] {
    this.buffer += chunk;
    const lines: string[] = [];
    let index = this.buffer.indexOf(FRAME_SEPARATOR);
    while (index >= 0) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      if (line.length > 0) lines.push(line);
      index = this.buffer.indexOf(FRAME_SEPARATOR);
    }
    if (this.buffer.length > this.maxLength) {
      // Cleared before throwing: the connection is going away, and holding the
      // oversized string until GC would let a peer that reconnects repeatedly
      // do the same damage more slowly.
      this.buffer = '';
      throw new FrameTooLongError(
        `A frame exceeded ${this.maxLength} characters with no newline. The newline is the frame ` +
          'boundary, so a line this long is either a broken client or a peer trying to make the ' +
          'server buffer without limit; contracts.md §4.2 puts that defence here.',
      );
    }
    return lines;
  }

  /** Whatever is held back, waiting for its newline. */
  pending(): string {
    return this.buffer;
  }

  /**
   * Whatever is left at end of stream, as a line if it is non-empty.
   *
   * A stream that ends without a trailing newline has one unterminated line, and
   * dropping it silently would make a record's last action vanish — a corruption
   * that reads as a shorter match rather than as an error.
   */
  flush(): string[] {
    const rest = this.buffer;
    this.buffer = '';
    return rest.length > 0 ? [rest] : [];
  }
}
