/*
 * Multiverse Mages — what a universe keeps of its past, and how it ships it.
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
 * A frame is about 29 KB of JSON, and almost all of it is the four §4.4
 * sidecars — `candidateDetail`, `academy`, `flow` and `candidates` — that
 * describe **this tick's** choices. A universe at its 4,000-tick cap held about
 * 115 MB of them and shipped all of it on every reload (measured 2026-10-08 on
 * `07fe9ff8`). Nothing in `ui/app/` reads a sidecar off any frame but the
 * newest: the feed, the stagnation reading and the peak-tier check walk old
 * frames through `obs` alone (`knowledge`, `mageBuckets`, `institutions`,
 * `clock`, `resources`).
 *
 * So the host keeps the sidecars on its newest {@link FULL_FRAMES} frames and
 * {@link slimFrame}s the rest to the fields the observation readers use, and
 * `session.json?pack=1` ships every frame but the newest slim, as per-slot
 * deltas ({@link packHistory}) — a typical month changes three of the 400
 * slots — and the newest whole.
 * `ui/shared/session.js` unpacks it back into slim frames, so a page indexes
 * frames exactly as before.
 */

/**
 * How many of the newest frames keep their sidecars. Comfortably more than a
 * page falls behind between one-second polls at the fastest tick the bin
 * allows (50 ms, so 20 frames), so a submit's answer and a poll's frames are
 * full; a page that falls further behind gets slim frames for the gap and a
 * full newest one, which is the only one it paints from.
 */
export const FULL_FRAMES = 64;

/**
 * The fields a slim frame keeps: every one an observation reader needs, plus
 * the god report's `ascension` and `founding` readings — the feed diffs
 * `ascension.knownNodes` frame against frame to report a node lost or
 * rediscovered, so history must carry it.
 */
const KEPT = ['obs', 'sat', 'stocks', 'mask', 'status', 'ascension', 'founding'] as const;

/** Fields carried forward from the frame before when a packed entry omits them. */
const CARRIED = ['stocks', 'mask', 'status', 'ascension', 'founding'] as const;

type RawFrame = Record<string, unknown>;

/**
 * A frame without its sidecars. The sidecars are *absent*, not null or empty —
 * `ui/shared/session.js` already reads each one as "this frame does not carry
 * it", which is the truth.
 */
export function slimFrame(frame: RawFrame): RawFrame {
  const out: RawFrame = {};
  for (const key of KEPT) if (frame[key] !== undefined) out[key] = frame[key];
  return out;
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Frames as deltas against the frame before.
 *
 * Each entry is `{ d: [slot, value, slot, value, …] }` — the `obs` slots that
 * changed — plus `stocks`, `mask`, `status`, `ascension` or `founding` only
 * when they changed (`null` when one went absent), and `sat` only when it is
 * non-empty. The first entry carries `obs` whole and every
 * carried-forward field. Sidecars are not packed: pass slim frames.
 *
 * The inverse is `unpackHistory` in `ui/shared/session.js`; the lobby's
 * `session-payload.test.ts` holds the two equal.
 */
export function packHistory(frames: readonly RawFrame[]): RawFrame[] {
  const out: RawFrame[] = [];
  let prev: RawFrame | undefined;
  for (const f of frames) {
    const obs = f.obs as readonly number[];
    const entry: RawFrame = {};
    if (prev === undefined) {
      entry.obs = obs;
    } else {
      const before = prev.obs as readonly number[];
      const d: number[] = [];
      for (let i = 0; i < obs.length; i += 1) if (obs[i] !== before[i]) d.push(i, obs[i] as number);
      entry.d = d;
    }
    for (const key of CARRIED) {
      // `null` stands for "absent here, though the frame before had it", so a
      // field that disappears is not carried forward by mistake.
      if (prev === undefined || !sameJson(prev[key], f[key])) entry[key] = f[key] ?? null;
    }
    if (Array.isArray(f.sat) && f.sat.length > 0) entry.sat = f.sat;
    out.push(entry);
    prev = f;
  }
  return out;
}
