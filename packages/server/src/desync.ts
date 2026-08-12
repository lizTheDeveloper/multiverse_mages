/*
 * Multiverse Mages — desync detection: the snapshot hash, compared and never corrected.
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

import { NOTICE, type DesyncNotice } from './protocol.js';

/**
 * One mechanism, reused; no second opinion about what equality means.
 *
 * `pvp-server`'s proposal fixes both halves of this file before it is written:
 *
 * > Detect desync using the snapshot hash that `deterministic-replay` already
 * > produces, rather than inventing a second integrity mechanism. A hash
 * > mismatch is a hard, reported, logged event — never a silent correction.
 *
 * **Reused, not reimplemented.** The hashes compared here come from
 * `AgentSession.snapshotHash()`, which is `sim-core`'s `snapshotHash` — FNV-1a
 * over `encodeSnapshot`'s bytes — on both sides. Nothing in this package hashes
 * anything. There is no checksum over the wire frames, no digest of the batch,
 * no second canonical form. `sim-core/src/snapshot/snapshot.ts` says its
 * encoding is the only definition of state equality the project has, and this
 * module's whole job is to compare two of them and say so when they differ.
 *
 * **Never corrected.** There is no resync path in this file, and that is a
 * design decision rather than an omission. A server that pushed its state to a
 * diverging participant would convert a determinism bug — the thing the whole
 * 0.1.0 constraint exists to make visible — into a cosmetic stutter that nobody
 * reports and the 1,000-match harness never counts. {@link DesyncNotice} carries
 * `corrected: false` as a literal type so a reader of a log, or of this code,
 * cannot wonder whether some other path corrects it.
 *
 * ## What a mismatch is not evidence of
 *
 * `sim-core/src/snapshot/hash.ts` is explicit that FNV-1a defends against
 * accidental divergence and not against an adversary, and says a different
 * function with a different name would be needed for that. So a mismatch here
 * means *these two processes computed different states*. It does not by itself
 * distinguish a bug from a lying peer, and under the AGPL a modified client is a
 * right rather than an anomaly. Both are answered the same way — the match ends
 * and the frame names both hashes — and neither is answered by trusting the
 * participant. Attributing a mismatch to malice needs `universe-persistence`'s
 * identity work and a cryptographic commitment scheme; it is out of scope here
 * and recorded as such.
 */

/** A mirror's claim about its own state at a tick. */
export interface HashReport {
  readonly participant: string;
  readonly slot: number;
  readonly tick: number;
  readonly hash: string;
}

/**
 * Compares one reported hash against the authoritative hashes for a tick.
 *
 * Returns the notice to send and log, or `undefined` when they agree. Pure: it
 * reads no clock, mutates nothing, and cannot correct anything because it holds
 * nothing to correct.
 *
 * A report naming a slot outside the match, or a tick whose hashes are not the
 * ones supplied, is the caller's problem to reject — this function answers one
 * question only, and answering two would let a malformed report be mistaken for
 * a divergence.
 */
export function compareHash(
  matchId: string,
  authoritative: readonly string[],
  report: HashReport,
): DesyncNotice | undefined {
  const expected = authoritative[report.slot];
  if (expected === undefined) return undefined;
  if (expected === report.hash) return undefined;
  return {
    type: NOTICE.desync,
    matchId,
    tick: report.tick,
    slot: report.slot,
    participant: report.participant,
    authoritativeHash: expected,
    reportedHash: report.hash,
    corrected: false,
  };
}

/**
 * A human- and grep-readable line for a desync, for the operator's log.
 *
 * Every value a post-mortem needs is on one line and named: which match, which
 * tick, which universe, who disagreed, and both hashes. The proposal calls a
 * mismatch a *logged* event, and a log line that omits one of the two hashes
 * makes the log useless for the one job it has.
 */
export function desyncLogLine(notice: DesyncNotice): string {
  return (
    `desync match=${notice.matchId} tick=${notice.tick} slot=${notice.slot} ` +
    `participant=${notice.participant} authoritative=${notice.authoritativeHash} ` +
    `reported=${notice.reportedHash} corrected=false`
  );
}
