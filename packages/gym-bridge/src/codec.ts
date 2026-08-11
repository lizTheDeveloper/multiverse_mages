/*
 * Multiverse Mages — newline-delimited JSON: one frame per line, and the reader
 * that survives a chunk boundary.
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
 * ## Why a pipe rather than a socket or a shared-memory ring
 *
 * Argued in full in `design.md`; the one-line version, because it is the
 * decision a reader is most likely to want to revisit:
 *
 * §4.2 states that the core assumes a trusted caller and that *"any layer
 * accepting actions across a trust boundary MUST apply its own admission policy
 * — rate limiting, disconnection — before the action reaches the core"*, naming
 * `gym-bridge` *"if ever exposed remotely"*. A stdio pipe's admission policy is
 * the operating system's: the only writer is the process that spawned this one.
 * A socket obliges this package to grow an admission policy of its own, and
 * choosing the transport that removes the obligation beats choosing the one
 * that creates it.
 *
 * ## Why JSON numbers rather than a base64 float buffer
 *
 * A `double` round-trips through JSON exactly in both languages this boundary
 * joins — ECMA-262 specifies the shortest round-tripping decimal for
 * `Number::toString`, and CPython's `float()` is correctly rounded — so nothing
 * is lost. What is gained is that a recorded frame is *readable*, and this
 * release's claim is about a recorded episode. Base64 saves about a third of
 * the bytes and costs all of that.
 *
 * ## What this file refuses to encode
 *
 * `NaN`, `Infinity`, and `-Infinity` are not JSON values; `JSON.stringify`
 * renders them as `null` and says nothing. An observation channel that arrived
 * as `null` would decode in Python as `None` and blow up several layers away
 * from the fault, so they are rejected here, where the value is still next to
 * the name of the field it came from. `mc-harness/src/canonical.ts` makes the
 * same refusal for the same reason, and this is the same rule at a different
 * boundary rather than a second opinion about it.
 */

/** The one byte that separates frames. */
export const FRAME_SEPARATOR = '\n';

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
        'produces no text at all, and a bridge that wrote nothing would leave the client waiting ' +
        'on a response that is never coming.',
    );
  }
  if (text.includes(FRAME_SEPARATOR)) {
    // Not reachable through `JSON.stringify`, which escapes newlines inside
    // strings — asserted rather than assumed, because the whole framing rests
    // on it and the cost of being wrong is a desynchronized stream.
    throw new TypeError('A frame line may not contain a newline; the newline is the frame boundary.');
  }
  return text + FRAME_SEPARATOR;
}

/** Rejects the values JSON renders as `null` without saying so. */
function replacer(key: string, value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError(
      `Field ${JSON.stringify(key)} holds ${String(value)}, which JSON renders as null. A channel ` +
        'that arrived as null would fail several layers from the fault; it is rejected here, ' +
        'beside the name of the field it came from.',
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
 * object — a bare `4` or `"hello"` is valid JSON and is not a frame, and
 * letting one through would put `undefined` into every field read downstream.
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

/**
 * Splits a byte stream into lines, holding a partial line across chunks.
 *
 * A pipe delivers whatever the kernel had; a 4 KiB observation frame arrives in
 * two or three chunks routinely, and the split lands mid-number as often as not.
 * A reader that parsed each chunk would fail on almost every frame at realistic
 * vector widths — which is exactly the kind of bug that reproduces on a busy
 * machine and never on a quiet one.
 *
 * Deliberately a class with an explicit buffer rather than an async iterator:
 * the test suite feeds it hand-cut chunks, and the property under test is
 * *"no partial frame is ever emitted"*, which needs the buffer to be
 * inspectable.
 */
export class LineReader {
  private buffer = '';

  /** Feeds a chunk and returns whatever complete lines it completed. */
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
    return lines;
  }

  /** Whatever is held back, waiting for its newline. */
  pending(): string {
    return this.buffer;
  }

  /**
   * Whatever is left at end of stream, as a line if it is non-empty.
   *
   * A stream that ends without a trailing newline has one unterminated line,
   * and dropping it silently would make a record file's last action vanish —
   * a corruption that reads as a shorter episode rather than as an error.
   */
  flush(): string[] {
    const rest = this.buffer;
    this.buffer = '';
    return rest.length > 0 ? [rest] : [];
  }
}
