/*
 * Multiverse Mages — the authoritative tick. Pure, clock-free, and the only
 * place a canonical batch becomes state.
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
  ACTION_SPACE_SIZE,
  RULESET_ACTIONS,
  isLegal,
  type AgentSession,
  type EpisodeStatus,
} from '@mm/agent-api';

import { inEngagement, tickModeOf } from './mode.js';
import { TickAssembly, type OrderingResult } from './ordering.js';
import {
  MATCH_END,
  REJECTION,
  type CanonicalBatch,
  type MatchEndReason,
  type RejectionReason,
  type Submission,
  type TickMode,
  type WireAction,
} from './protocol.js';

/**
 * The authoritative simulation, and nothing about how it is reached.
 *
 * **This module takes no {@link import('./clock.js').Clock}.** A tick's outcome
 * is a function of the canonical batch and the sessions it is applied to, and of
 * nothing else. That is not tidiness; it is the property the release plan's
 * 0.16.0 claim rests on. Replaying a recorded match through {@link Match.apply}
 * must reproduce the same hashes, and it can only do so if wall-clock time never
 * entered. Deadlines and pacing live in `host.ts`, above this line.
 *
 * ## One universe per slot
 *
 * `contracts.md` §1.1 puts one universe in one simulation instance, and
 * `agent-api` is single-agent-scoped throughout — its `CandidateInput` says so
 * outright: *"the multiverse is not in state, and there is nothing here to
 * enumerate."* So a match is **N sessions side by side**, each a god over its
 * own universe, advanced in lockstep under one ordering rule.
 *
 * That is the honest shape of what can be built today, and it is worth being
 * plain about what it is not. When `raid-engagement` supplies portal targets and
 * a raid can actually fire, two of these universes will share an engagement, and
 * the batch will need to carry actions into it. The protocol has the slot for
 * that — {@link import('./protocol.js').SnapshotPayload}'s `kind` distinguishes
 * world from engagement transport, because §1.6 keeps engagement entities out of
 * world snapshots — and this module deliberately does not pretend to implement
 * it. Nothing here fakes a portal target to manufacture a raid.
 */

/** One participant's universe within a match. */
export interface MatchSlot {
  readonly slot: number;
  readonly participant: string;
  readonly session: AgentSession;
}

/** What one authoritative tick produced. */
export interface TickOutcome {
  readonly tick: number;
  /** What was applied, in canonical order. The match record's unit. */
  readonly batch: CanonicalBatch;
  /** `snapshotHash` per slot after the tick. The authority a mirror is checked against. */
  readonly hashes: readonly string[];
  /** Per slot, whether the core admitted the action. */
  readonly admitted: readonly boolean[];
  /** Per slot, how the episode stands. */
  readonly statuses: readonly EpisodeStatus[];
  /**
   * Per slot, which layer that universe is in **after** the tick.
   *
   * Per slot because §0 makes clocks per-universe: a raid freezes world time for
   * its two participants only, and every uninvolved universe keeps advancing.
   */
  readonly modes: readonly TickMode[];
  /** Set when this tick ended the match. */
  readonly end?: MatchEndReason;
}

/**
 * Whether an action may reach the core at all, decided at the boundary.
 *
 * §4.2 is explicit that this is the server's job and not the core's:
 *
 * > This rule governs the core only, and the core assumes a trusted caller. […]
 * > Any layer accepting actions across a trust boundary (`server`, …) MUST apply
 * > its own admission policy […] *before* the action reaches the core. The core
 * > does not defend itself; the boundary does.
 *
 * So the mask is consulted here rather than relied on downstream. A masked
 * action never becomes a submission; it becomes a substituted no-op with a
 * reason, which is the same outcome the core would have produced and is visible
 * a tick earlier.
 *
 * Returns the reason to refuse, or `undefined` to admit.
 */
export function screen(session: AgentSession, action: WireAction): RejectionReason | undefined {
  if (!Number.isInteger(action.kind) || action.kind < 0 || action.kind >= ACTION_SPACE_SIZE) {
    return REJECTION.malformedAction;
  }
  if (action.params !== undefined) {
    for (const p of action.params) {
      if (!Number.isInteger(p)) return REJECTION.malformedAction;
    }
  }
  const mask = session.legalActions();
  if (isLegal(mask, action.kind)) return undefined;

  // Vision §3's frozen policy, named as itself rather than folded into a
  // generic refusal: *"Nothing about the ruleset — including portal magic — can
  // be altered once a raid has begun."* §4.2 enforces it locally through the
  // mask; this is the same rule enforced across the network boundary, and a
  // participant told `ruleset-frozen` learns something a participant told
  // `masked` does not.
  //
  // The mode comes from §4.1's declared channel, not from the mask's shape —
  // see `mode.ts` for why the mask-shape inference was rejected.
  if (inEngagement(session) && RULESET_ACTIONS.includes(action.kind as never)) {
    return REJECTION.rulesetFrozen;
  }
  return REJECTION.masked;
}

/** How a match is built. */
export interface MatchOptions {
  readonly matchId: string;
  readonly slots: readonly MatchSlot[];
  /** §4.3's caller-imposed step limit. The server never invents one. */
  readonly stepLimit: number;
}

/**
 * One match: N universes advanced in lockstep by one ordering rule.
 *
 * Construct it with sessions that have already been `reset` to the same
 * `(runSeed, config)` every participant was told, so that
 * {@link Match.hashes} before the first tick is the thing a mirror checks its
 * own build against.
 */
export class Match {
  readonly matchId: string;
  readonly slots: readonly MatchSlot[];
  readonly stepLimit: number;

  private assembly: TickAssembly;
  private currentTick = 0;
  private ended: MatchEndReason | undefined;
  /** Every batch applied, in order. The match record. */
  private readonly record: CanonicalBatch[] = [];

  constructor(options: MatchOptions) {
    this.matchId = options.matchId;
    this.slots = [...options.slots].sort((a, b) => a.slot - b.slot);
    this.stepLimit = options.stepLimit;
    this.assembly = new TickAssembly(0, this.slots.length);
  }

  /** The tick now open for submissions. */
  get tick(): number {
    return this.currentTick;
  }

  /** Why the match ended, or `undefined` while it runs. */
  get endReason(): MatchEndReason | undefined {
    return this.ended;
  }

  /** Whether the match is still running. */
  get running(): boolean {
    return this.ended === undefined;
  }

  /** Every batch applied so far. Replaying these reproduces the match. */
  get batches(): readonly CanonicalBatch[] {
    return this.record;
  }

  /** `snapshotHash` per slot, right now. */
  hashes(): readonly string[] {
    return this.slots.map((s) => s.session.snapshotHash());
  }

  /**
   * Offers a submission to the open tick, screening it first.
   *
   * Returns the reason it was refused, or `undefined` if it is the slot's
   * current action. A refusal is never an error — §4.2 requires an illegal
   * submission to be cheap and observable, and this is where it becomes both.
   */
  submit(submission: Submission): RejectionReason | undefined {
    if (this.ended !== undefined) return REJECTION.late;
    const slot = this.slots.find((s) => s.slot === submission.slot);
    if (slot === undefined) return REJECTION.malformedAction;
    const refusal = screen(slot.session, submission.action);
    if (refusal !== undefined) {
      this.assembly.refuse(submission.slot, submission.sequence, refusal);
      return refusal;
    }
    return this.assembly.offer(submission);
  }

  /**
   * Closes the open tick and returns its canonical batch without applying it.
   *
   * Split from {@link apply} so that a replay can feed a *recorded* batch to the
   * same code path a live match uses. If closing and applying were one call, the
   * harness that proves a recorded match reproduces its hashes would have to
   * drive a different path than the one it is proving.
   */
  close(): OrderingResult {
    return this.assembly.close();
  }

  /**
   * Applies a canonical batch to every slot, in canonical order, and advances.
   *
   * The batch is applied **as given**. It is not re-sorted, not filtered, and
   * not screened again — a replay must apply exactly the bytes that were
   * recorded, or it is measuring a different match. Screening happened when the
   * submission was offered.
   */
  apply(batch: CanonicalBatch): TickOutcome {
    if (this.ended !== undefined) {
      throw new Error(
        `Match ${this.matchId} ended (${this.ended}) and cannot advance. A server that stepped a ` +
          'finished match would produce hashes no participant is checking, which is a desync ' +
          'nobody would ever see reported.',
      );
    }
    const admitted: boolean[] = [];
    const statuses: EpisodeStatus[] = [];
    for (const entry of batch.entries) {
      const slot = this.slots.find((s) => s.slot === entry.slot);
      if (slot === undefined) {
        throw new Error(
          `Batch for tick ${batch.tick} names slot ${entry.slot}, which this match does not have.`,
        );
      }
      const result = slot.session.submit(
        entry.action.params === undefined
          ? { kind: entry.action.kind }
          : { kind: entry.action.kind, params: entry.action.params },
      );
      admitted.push(result.admitted);
      statuses.push(result.status);
    }
    this.record.push(batch);
    const hashes = this.hashes();
    const modes = this.modes();
    this.currentTick = batch.tick + 1;
    this.assembly = new TickAssembly(this.currentTick, this.slots.length);

    const end = this.endedBy(statuses);
    if (end !== undefined) this.ended = end;
    return end === undefined
      ? { tick: batch.tick, batch, hashes, admitted, statuses, modes }
      : { tick: batch.tick, batch, hashes, admitted, statuses, modes, end };
  }

  /**
   * Which layer each slot's universe is in, right now.
   *
   * One entry per slot, never one for the match: §0's clocks are per-universe,
   * so two slots can legitimately be in different modes at the same instant.
   */
  modes(): readonly TickMode[] {
    return this.slots.map((s) => tickModeOf(s.session));
  }

  /**
   * Ends the match for a reason the simulation did not produce.
   *
   * Desync, abandonment, shutdown. Idempotent: the first reason wins, because a
   * match that ended on a desync and then had a participant disconnect should
   * still be reported as a desync.
   */
  finish(reason: MatchEndReason): MatchEndReason {
    if (this.ended === undefined) this.ended = reason;
    return this.ended;
  }

  /**
   * Whether the simulation itself ended the match.
   *
   * §4.3 keeps terminal and truncated distinct, and so does this: every slot
   * reaching a terminal status is `terminal`, and the caller's step limit is
   * `truncated`. Conflating them is a silent training bug in the harness that
   * reads these records.
   */
  private endedBy(statuses: readonly EpisodeStatus[]): MatchEndReason | undefined {
    if (statuses.length > 0 && statuses.every((s) => s === 'ascended' || s === 'stagnated')) {
      return MATCH_END.terminal;
    }
    if (statuses.some((s) => s === 'truncated')) return MATCH_END.truncated;
    if (this.currentTick >= this.stepLimit) return MATCH_END.truncated;
    return undefined;
  }
}
