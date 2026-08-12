/*
 * Multiverse Mages — the canonical ordered action batch: the one rule that makes
 * two servers agree.
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

import {
  ENTRY_SOURCE,
  REJECTION,
  type CanonicalBatch,
  type CanonicalEntry,
  type RejectionReason,
  type Submission,
  type WireAction,
} from './protocol.js';

/**
 * Ordering, and nothing else.
 *
 * ## The rule
 *
 * A tick's canonical batch holds **exactly one entry per slot, ascending by
 * slot**, and each slot's entry is the admitted submission with the **lowest
 * sequence** for that tick, or a substituted no-op if there is none.
 *
 * Arrival order is not an input. It is not a tie-break, it is not a fallback,
 * and it does not appear in this file — `pushSubmission` records nothing about
 * when a submission was seen, so there is nothing for a later change to reach
 * for. That is deliberate: the failure this guards against is not someone
 * deciding to sort by arrival time, it is someone adding a `receivedAt` field
 * for logging and someone else finding it two years later.
 *
 * ## Why it has to be this way
 *
 * `docs/design/release-plan.md` makes 0.16.0's claim *"across 1,000 automated
 * matches, both clients produce identical final snapshot hashes."* Two processes
 * can only produce the same hash if they apply the same actions in the same
 * order. If order came from packet timing, two correct servers replaying one
 * recorded match would disagree — and the disagreement would look exactly like
 * the desyncs the claim is about, making the measurement unable to distinguish
 * a real determinism bug from the harness's own jitter. A claim that cannot
 * fail for the right reason is not a claim.
 *
 * ## Why the lowest sequence rather than the highest
 *
 * A participant that submits twice for one tick has a bug or is probing. Taking
 * the lowest makes the answer *"the first thing you said"*, which is stable
 * under retransmission — a client that resends a submission it thinks was lost
 * gets the same outcome rather than a different one. Taking the highest would
 * make a duplicate an edit, and an edit whose arrival the server cannot bound is
 * a way to act on information from later in the tick.
 *
 * ## One action per slot per tick
 *
 * `agent-api`'s `AgentSession.submit` is one action to one tick, so a slot's
 * entry is singular by construction rather than by policy. A second submission
 * is a {@link REJECTION.duplicate}, reported and dropped — never applied, and
 * never a protocol error, because §4.2 requires a misbehaving agent to be cheap.
 */

/** A submission the server declined to make canonical, and why. */
export interface RejectedSubmission {
  readonly slot: number;
  readonly tick: number;
  readonly sequence: number;
  readonly reason: RejectionReason;
}

/** The result of ordering one tick's submissions. */
export interface OrderingResult {
  readonly batch: CanonicalBatch;
  readonly rejected: readonly RejectedSubmission[];
}

/** The no-op. §4.2's action 0, and the meaning of an absent submission. */
export const NOOP_ACTION: WireAction = Object.freeze({ kind: 0 });

/**
 * Collects submissions for one tick and orders them canonically.
 *
 * Holds no clock and no arrival information. A submission is either in or out
 * on the strength of its `slot`, `tick` and `sequence`, all of which the
 * participant supplied and all of which are in the recorded match.
 */
export class TickAssembly {
  /** Slot to the winning submission so far. */
  private readonly winning = new Map<number, Submission>();
  private readonly rejected: RejectedSubmission[] = [];

  constructor(
    readonly tick: number,
    readonly slotCount: number,
  ) {}

  /**
   * Offers a submission to this tick.
   *
   * Returns the reason it was not taken, or `undefined` if it is the current
   * winner. A submission that loses to a lower sequence is a `duplicate`; one
   * naming a different tick is `late`; one naming no known slot is refused
   * before it gets here, by the connection that has no such slot to speak for.
   */
  offer(submission: Submission): RejectionReason | undefined {
    if (submission.tick !== this.tick) {
      this.note(submission, REJECTION.late);
      return REJECTION.late;
    }
    if (!Number.isInteger(submission.slot) || submission.slot < 0 || submission.slot >= this.slotCount) {
      this.note(submission, REJECTION.malformedAction);
      return REJECTION.malformedAction;
    }
    const held = this.winning.get(submission.slot);
    if (held === undefined) {
      this.winning.set(submission.slot, submission);
      return undefined;
    }
    // Strictly lower wins, so equal sequences keep the first offered — which,
    // for equal sequences, is the only case where offer order can matter at
    // all. A client that sends two different actions under one sequence number
    // has violated its own contract, and the server's job is to be
    // deterministic about it rather than to adjudicate it.
    if (submission.sequence < held.sequence) {
      this.winning.set(submission.slot, submission);
      this.note(held, REJECTION.duplicate);
      return undefined;
    }
    this.note(submission, REJECTION.duplicate);
    return REJECTION.duplicate;
  }

  /**
   * Records that a slot's submission was refused for a reason ordering does not
   * own — a masked action, a frozen ruleset, an exhausted budget.
   *
   * The slot then has no winner and will be filled with a substituted no-op,
   * carrying the reason so the tick notice can say why.
   */
  refuse(slot: number, sequence: number, reason: RejectionReason): void {
    this.winning.delete(slot);
    this.rejected.push({ slot, tick: this.tick, sequence, reason });
  }

  /**
   * Closes the tick and produces its canonical batch.
   *
   * Every slot gets an entry. A slot with no winner gets the no-op, flagged
   * {@link ENTRY_SOURCE.substituted} and carrying the reason if there is one —
   * *"nothing arrived"* and *"what arrived was refused"* are different facts and
   * a match record that conflated them could not be debugged.
   */
  close(): OrderingResult {
    const entries: CanonicalEntry[] = [];
    for (let slot = 0; slot < this.slotCount; slot += 1) {
      const won = this.winning.get(slot);
      if (won !== undefined) {
        entries.push({
          slot,
          action: won.action,
          source: ENTRY_SOURCE.submitted,
          sequence: won.sequence,
        });
        continue;
      }
      const why = this.rejected.find((r) => r.slot === slot);
      entries.push(
        why === undefined
          ? { slot, action: NOOP_ACTION, source: ENTRY_SOURCE.substituted, sequence: 0 }
          : {
              slot,
              action: NOOP_ACTION,
              source: ENTRY_SOURCE.substituted,
              sequence: 0,
              rejection: why.reason,
            },
      );
    }
    return { batch: { tick: this.tick, entries }, rejected: [...this.rejected] };
  }

  private note(submission: Submission, reason: RejectionReason): void {
    this.rejected.push({
      slot: submission.slot,
      tick: submission.tick,
      sequence: submission.sequence,
      reason,
    });
  }
}

/**
 * Orders a whole tick's submissions in one call.
 *
 * The functional form of {@link TickAssembly}, for callers that already hold
 * every submission — a replay, a test, the match harness. Feeding the same
 * submissions in any order must produce an identical batch, and that is the
 * property `ordering.test.ts` asserts by shuffling.
 */
export function canonicalBatch(
  tick: number,
  slotCount: number,
  submissions: readonly Submission[],
): OrderingResult {
  const assembly = new TickAssembly(tick, slotCount);
  for (const submission of submissions) assembly.offer(submission);
  return assembly.close();
}
