/*
 * Multiverse Mages — the host: connections, direct challenge, and the tick loop
 * where a wall clock meets a deterministic simulation.
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

import type { AgentSession } from '@mm/agent-api';

import { ConnectionBudget, type AdmissionPolicy } from './admission.js';
import { DEFAULT_PACING, systemClock, type Clock } from './clock.js';
import { decodeFrame, FrameDecodeError } from './codec.js';
import { compareHash, desyncLogLine } from './desync.js';
import { Match, type MatchSlot } from './match.js';
import {
  contractDisagreements,
  ERROR_CODE,
  isFatal,
  MATCH_END,
  NOTICE,
  PROTOCOL_VERSION,
  REJECTION,
  VERB,
  type ErrorCode,
  TICK_MODE,
  type MatchContract,
  type MatchPacing,
  type ServerFrame,
  type TickMode,
} from './protocol.js';

/**
 * Everything above the simulation and below the socket.
 *
 * ## Transport-agnostic on purpose
 *
 * This class never imports `node:net`. It takes {@link Connection}s — anything
 * that can be sent a frame and closed — so the same code hosts an in-process
 * match in a unit test and a socket match in the end-to-end test. That is not
 * only convenience: it means the thing proven by the fast tests is literally the
 * thing the slow test runs, rather than a parallel implementation of it. The
 * socket lives in `transport.ts` and is about sixty lines.
 *
 * ## Where the wall clock is, exactly
 *
 * Two places, both here, both through an injected {@link Clock}:
 *
 * 1. **The submission deadline.** A tick opens; participants have
 *    {@link MatchPacing.actionDeadlineMs} to answer; whoever has not is given a
 *    no-op. See {@link MatchHost.pump}.
 * 2. **The rate limiter**, in `admission.ts`.
 *
 * Below this line — `match.ts`, `ordering.ts`, `desync.ts` — no clock exists.
 * The batch a tick produces is a function of the submissions and the ordering
 * rule, so the same match replayed from its record produces the same hashes. The
 * clock decides *when* a tick closes and never *what is in it*.
 *
 * ## Why closing a tick early is safe
 *
 * {@link MatchHost.pump} closes a tick as soon as every slot has an action,
 * without waiting out the deadline — otherwise every match runs at exactly the
 * deadline rate and a two-agent test takes deadline × ticks of real time.
 *
 * This would be an arrival-order dependency but for one rule the protocol
 * enforces: **a connection's `sequence` must strictly increase.** With that,
 * the first submission a connection offers for a tick is necessarily its lowest
 * sequence, so "first offered" and "lowest sequence" name the same submission
 * and closing early cannot choose differently from closing late. Without it, a
 * client whose sequence-3 frame arrived after its sequence-5 frame would get a
 * different action depending on how long the server happened to wait — arrival
 * order deciding the simulation, wearing a disguise. The rule is checked in
 * {@link MatchHost.receive} and a violation is a `duplicate` rejection.
 */

/**
 * How many ended matches are held for their final checkpoint.
 *
 * See {@link MatchHost.settled}. Sized for "several matches finishing at once
 * on one host", which is the only situation in which more than one is needed.
 */
const SETTLED_MATCH_LIMIT = 64;

/** A peer this host can write frames to. The transport's half of the contract. */
export interface Connection {
  readonly id: string;
  /** Delivers one frame. Framing is the transport's business. */
  send(frame: ServerFrame): void;
  /** Ends the connection. */
  close(): void;
}

/** How the host is built. */
export interface HostOptions {
  /** What the server publishes and refuses on. See {@link MatchContract}. */
  readonly contract: MatchContract;
  /**
   * Builds one participant's universe session.
   *
   * Injected rather than constructed here, because §5 gives this package one
   * edge and `agent-api` *"builds no worlds"* — a session takes a
   * caller-supplied `Scenario`. The binary loads a scenario module by path and
   * closes over it; see `bin/serve.mjs`, and `contracts.md` §5's note on why
   * `scenario` is a leaf nothing may statically import.
   */
  readonly createSession: (slot: number) => AgentSession;
  readonly clock?: Clock;
  readonly pacing?: MatchPacing;
  readonly policy?: AdmissionPolicy;
  /** Where operator-facing lines go. Never stdout, which may carry frames. */
  readonly log?: (line: string) => void;
}

/** One connected peer, before or during a match. */
interface Peer {
  readonly connection: Connection;
  readonly budget: ConnectionBudget;
  participant: string | undefined;
  /** Strictly increasing per connection. See this module's note on early close. */
  lastSequence: number;
  matchId: string | undefined;
  slot: number | undefined;
}

/** A challenge issued and not yet answered. Vision §12: direct challenge only. */
interface Challenge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly runSeed: number;
  readonly stepLimit: number;
}

/** A match and the wall-clock state of its open tick. */
interface LiveMatch {
  readonly match: Match;
  readonly participants: readonly { slot: number; participant: string }[];
  /** When the open tick's submissions close. The clock's only simulation-adjacent job. */
  deadlineAt: number;
  /** Which layer each slot was in when the open tick opened. Picks the deadline. */
  modes: readonly TickMode[];
  /** Slots that have an action for the open tick. */
  answered: Set<number>;
  /** The authoritative hashes of the last applied tick, for checkpoint comparison. */
  lastHashes: readonly string[];
  lastTick: number;
}

/**
 * The authoritative host.
 *
 * Drive it with {@link MatchHost.connect}, {@link MatchHost.receive},
 * {@link MatchHost.disconnect} and {@link MatchHost.pump}. Everything it decides
 * is a pure consequence of those calls plus the injected clock.
 */
export class MatchHost {
  private readonly contract: MatchContract;
  private readonly createSession: (slot: number) => AgentSession;
  private readonly clock: Clock;
  private readonly pacing: MatchPacing;
  private readonly policy: AdmissionPolicy | undefined;
  private readonly log: (line: string) => void;

  private readonly peers = new Map<string, Peer>();
  private readonly byParticipant = new Map<string, string>();
  private readonly challenges = new Map<string, Challenge>();
  private readonly matches = new Map<string, LiveMatch>();
  /**
   * Matches that have ended, retained only so their **final** checkpoint can
   * still be compared.
   *
   * The release plan's claim is about *final* snapshot hashes, and a participant
   * necessarily reports the last tick's hash after being told the match ended —
   * the tick notice and the end notice arrive back to back. A server that
   * discarded the match on the end notice would refuse the one checkpoint the
   * claim is actually about, and the desync that mattered most would be the only
   * one it could not see.
   *
   * Bounded, because a map that only grows is a leak with a long fuse.
   */
  private readonly settled = new Map<string, LiveMatch>();
  private counter = 0;

  constructor(options: HostOptions) {
    this.contract = options.contract;
    this.createSession = options.createSession;
    this.clock = options.clock ?? systemClock;
    this.pacing = options.pacing ?? DEFAULT_PACING;
    this.policy = options.policy;
    this.log = options.log ?? ((): void => {});
  }

  /** Registers a peer. It may send nothing but `hello` until it has said `hello`. */
  connect(connection: Connection): void {
    this.peers.set(connection.id, {
      connection,
      budget:
        this.policy === undefined
          ? new ConnectionBudget(this.clock)
          : new ConnectionBudget(this.clock, this.policy),
      lastSequence: -1,
      participant: undefined,
      matchId: undefined,
      slot: undefined,
    });
  }

  /**
   * Drops a peer, ending any match it was in.
   *
   * **The consequences of abandonment are deliberately not decided here.** The
   * proposal lists three candidate rules — play the absent side out under the
   * raid AI, freeze for a reconnection window, or resolve at current objective
   * state — and calls the choice *"a playtest question"*, which it is, and which
   * no section of the vision or the contracts answers. `campaign-plan.md` is
   * explicit that where the spec is silent on a rule the work stops and asks
   * rather than inventing one. So v1 does the one thing that decides nothing: it
   * ends the match as {@link MATCH_END.abandoned}, names who left, and awards
   * nothing to anybody. See `design.md`'s open questions.
   */
  disconnect(connectionId: string): void {
    const peer = this.peers.get(connectionId);
    if (peer === undefined) return;
    this.peers.delete(connectionId);
    if (peer.participant !== undefined) this.byParticipant.delete(peer.participant);
    if (peer.matchId !== undefined) {
      const live = this.matches.get(peer.matchId);
      if (live !== undefined && live.match.running) {
        this.log(
          `abandoned match=${peer.matchId} participant=${peer.participant ?? connectionId} ` +
            `tick=${live.match.tick}`,
        );
        this.endMatch(peer.matchId, MATCH_END.abandoned);
      }
    }
  }

  /** Feeds one decoded line from a peer. */
  receive(connectionId: string, line: string): void {
    const peer = this.peers.get(connectionId);
    if (peer === undefined) return;

    const refusal = peer.budget.chargeFrame();
    if (refusal !== undefined) {
      this.fail(peer, ERROR_CODE.rateLimited, `Connection exceeded its ${refusal} budget.`);
      return;
    }

    let frame: Record<string, unknown>;
    try {
      frame = decodeFrame(line);
    } catch (error) {
      const why = error instanceof FrameDecodeError ? error.message : String(error);
      this.fail(peer, ERROR_CODE.malformedFrame, why);
      return;
    }

    const type = frame['type'];
    if (typeof type !== 'string') {
      this.fail(peer, ERROR_CODE.badRequest, 'A frame must carry a string `type`.');
      return;
    }
    if (type !== VERB.hello && peer.participant === undefined) {
      this.fail(peer, ERROR_CODE.handshakeRequired, `\`${type}\` arrived before \`hello\`.`);
      return;
    }

    switch (type) {
      case VERB.hello:
        this.onHello(peer, frame);
        return;
      case VERB.challenge:
        this.onChallenge(peer, frame);
        return;
      case VERB.accept:
        this.onAccept(peer, frame);
        return;
      case VERB.decline:
        this.onDecline(frame);
        return;
      case VERB.action:
        this.onAction(peer, frame);
        return;
      case VERB.checkpoint:
        this.onCheckpoint(peer, frame);
        return;
      case VERB.leave:
        this.onLeave(peer);
        return;
      default:
        this.fail(peer, ERROR_CODE.unknownVerb, `\`${type}\` is not a verb this server knows.`);
    }
  }

  /**
   * Advances every match whose open tick is ready.
   *
   * A tick is ready when every slot has answered, or when its deadline has
   * passed. Called by the transport's timer; called directly by tests, which is
   * why it takes no arguments and reads the injected clock.
   */
  pump(): void {
    for (const [matchId, live] of this.matches) {
      if (!live.match.running) continue;
      const everyoneAnswered = live.answered.size >= live.match.slots.length;
      if (!everyoneAnswered && this.clock.now() < live.deadlineAt) continue;
      this.advance(matchId, live);
    }
  }

  /** The matches this host is running. For the operator and the tests. */
  get liveMatchIds(): readonly string[] {
    return [...this.matches.keys()];
  }

  /** A match by id, for assertions. */
  matchOf(matchId: string): Match | undefined {
    return this.matches.get(matchId)?.match;
  }

  // -------------------------------------------------------------------------
  // Verbs.
  // -------------------------------------------------------------------------

  private onHello(peer: Peer, frame: Record<string, unknown>): void {
    const name = frame['participant'];
    const declared = frame['contract'];
    if (typeof name !== 'string' || name.length === 0) {
      this.fail(peer, ERROR_CODE.badRequest, '`hello` needs a non-empty `participant`.');
      return;
    }
    if (typeof declared !== 'object' || declared === null) {
      this.fail(peer, ERROR_CODE.badRequest, '`hello` needs a `contract` object.');
      return;
    }
    const client = declared as MatchContract;

    // §0 first, and on its own. A content-revision mismatch has its own code
    // because §0 requires the refusal to name both revisions, and folding it
    // into the general contract refusal would lose one of them.
    if (client.contentRevision !== this.contract.contentRevision) {
      this.send(peer, {
        type: NOTICE.error,
        code: ERROR_CODE.contentRevisionMismatch,
        message:
          'contracts.md §0: two universes may only interact if their contentRevision values are ' +
          'equal. There is no partial-compatibility rule and no negotiation.',
        fatal: true,
        revisions: {
          server: this.contract.contentRevision,
          client: typeof client.contentRevision === 'string' ? client.contentRevision : 'absent',
        },
      });
      peer.connection.close();
      return;
    }

    const disagreements = contractDisagreements(this.contract, client);
    const fatalOnes = disagreements.filter((d) => d.fatal);
    if (fatalOnes.length > 0) {
      this.send(peer, {
        type: NOTICE.error,
        code: ERROR_CODE.contractMismatch,
        message:
          'The declared contract disagrees on a structural field. A participant simulating a ' +
          'differently-shaped game would produce a plausible hash rather than a failure.',
        fatal: true,
        disagreements,
      });
      peer.connection.close();
      return;
    }

    if (this.byParticipant.has(name)) {
      this.fail(peer, ERROR_CODE.badRequest, `The name ${JSON.stringify(name)} is already here.`);
      return;
    }
    peer.participant = name;
    this.byParticipant.set(name, peer.connection.id);
    this.send(peer, {
      type: NOTICE.welcome,
      connectionId: peer.connection.id,
      participant: name,
      contract: this.contract,
      advisory: disagreements.filter((d) => !d.fatal),
    });
  }

  private onChallenge(peer: Peer, frame: Record<string, unknown>): void {
    const opponent = frame['opponent'];
    const runSeed = frame['runSeed'];
    const stepLimit = frame['stepLimit'];
    if (typeof opponent !== 'string' || !Number.isInteger(runSeed) || !Number.isInteger(stepLimit)) {
      this.fail(peer, ERROR_CODE.badRequest, '`challenge` needs `opponent`, `runSeed`, `stepLimit`.');
      return;
    }
    const targetId = this.byParticipant.get(opponent);
    const target = targetId === undefined ? undefined : this.peers.get(targetId);
    if (target === undefined) {
      this.fail(peer, ERROR_CODE.badRequest, `No participant named ${JSON.stringify(opponent)}.`);
      return;
    }
    const id = this.nextId('challenge');
    this.challenges.set(id, {
      id,
      from: peer.participant as string,
      to: opponent,
      runSeed: runSeed as number,
      stepLimit: stepLimit as number,
    });
    this.send(target, {
      type: NOTICE.challenged,
      challengeId: id,
      from: peer.participant as string,
      runSeed: runSeed as number,
      stepLimit: stepLimit as number,
    });
  }

  private onAccept(peer: Peer, frame: Record<string, unknown>): void {
    const challengeId = frame['challengeId'];
    if (typeof challengeId !== 'string') {
      this.fail(peer, ERROR_CODE.badRequest, '`accept` needs a `challengeId`.');
      return;
    }
    const challenge = this.challenges.get(challengeId);
    if (challenge === undefined || challenge.to !== peer.participant) {
      this.fail(peer, ERROR_CODE.badRequest, 'No such challenge for this participant.');
      return;
    }
    this.challenges.delete(challengeId);
    this.start(challenge);
  }

  private onDecline(frame: Record<string, unknown>): void {
    const challengeId = frame['challengeId'];
    if (typeof challengeId === 'string') this.challenges.delete(challengeId);
  }

  private onAction(peer: Peer, frame: Record<string, unknown>): void {
    const live = this.liveOf(peer);
    if (live === undefined) return;
    const tick = frame['tick'];
    const sequence = frame['sequence'];
    const action = frame['action'];
    if (
      !Number.isInteger(tick) ||
      !Number.isInteger(sequence) ||
      typeof action !== 'object' ||
      action === null
    ) {
      this.fail(peer, ERROR_CODE.badRequest, '`action` needs `tick`, `sequence` and an `action`.');
      return;
    }
    const slot = peer.slot as number;

    const overBudget = peer.budget.chargeSubmission(tick as number);
    if (overBudget !== undefined) {
      // Refused, not fatal: an agent that submits too eagerly is a bug worth
      // surviving, and §4.2 wants a misbehaving agent to be cheap. The slot
      // still gets a well-defined action — the substituted no-op — so a
      // rate-limited participant and a silent one produce identical state.
      live.match.submit({
        slot,
        tick: tick as number,
        sequence: sequence as number,
        action: { kind: -1 },
      });
      return;
    }

    // Strictly increasing, per this module's note on closing a tick early. A
    // stale or repeated sequence is dropped rather than applied.
    if ((sequence as number) <= peer.lastSequence) return;
    peer.lastSequence = sequence as number;

    const wire = action as { kind?: unknown; params?: unknown };
    const kind = typeof wire.kind === 'number' ? wire.kind : -1;
    const params = Array.isArray(wire.params)
      ? (wire.params as unknown[]).map((p) => (typeof p === 'number' ? p : Number.NaN))
      : undefined;

    const refusal = live.match.submit({
      slot,
      tick: tick as number,
      sequence: sequence as number,
      action: params === undefined ? { kind } : { kind, params },
    });
    // Answered either way: a refused submission still fixes this slot's action
    // for the tick — the substituted no-op — so the tick need not wait for a
    // better one that the protocol gives no way to send.
    if (refusal !== REJECTION.late) live.answered.add(slot);
  }

  private onCheckpoint(peer: Peer, frame: Record<string, unknown>): void {
    // Checkpoints are the one verb an ended match still answers — see
    // {@link MatchHost.settled}. A checkpoint for a match this connection was
    // never in is still refused.
    const matchId = peer.matchId ?? (typeof frame['matchId'] === 'string' ? frame['matchId'] : undefined);
    const live =
      matchId === undefined
        ? undefined
        : (this.matches.get(matchId) ?? this.settled.get(matchId));
    if (live === undefined) {
      this.fail(peer, ERROR_CODE.noMatch, 'No match, running or just ended, by that name.');
      return;
    }
    const tick = frame['tick'];
    const slot = frame['slot'];
    const hash = frame['hash'];
    if (!Number.isInteger(tick) || !Number.isInteger(slot) || typeof hash !== 'string') {
      this.fail(peer, ERROR_CODE.badRequest, '`checkpoint` needs `tick`, `slot` and `hash`.');
      return;
    }
    // Only the tick whose hashes are authoritative right now can be compared.
    // An older tick's hashes are not retained: keeping them would let a peer
    // choose which tick to be checked at, and the interesting mismatch is
    // always the earliest one, which the next tick will catch anyway.
    if (tick !== live.lastTick) return;

    const notice = compareHash(live.match.matchId, live.lastHashes, {
      participant: peer.participant as string,
      slot: slot as number,
      tick: tick as number,
      hash,
    });
    if (notice === undefined) return;

    // Hard, reported, logged — and no correction anywhere on this path.
    this.log(desyncLogLine(notice));
    this.broadcast(live, notice);
    if (this.matches.has(live.match.matchId)) {
      this.endMatch(live.match.matchId, MATCH_END.desync);
      return;
    }
    // A mismatch on the *final* tick, reported after the match had already
    // ended. The desync notice above is the record — a second `match-end`
    // carrying a different reason would leave a reader unable to tell which of
    // the two was true. The match is evicted so the same hash cannot be
    // reported, and re-reported, forever.
    this.settled.delete(live.match.matchId);
  }

  private onLeave(peer: Peer): void {
    if (peer.matchId === undefined) return;
    const live = this.matches.get(peer.matchId);
    if (live !== undefined && live.match.running) {
      this.log(`left match=${peer.matchId} participant=${peer.participant ?? '?'}`);
      this.endMatch(peer.matchId, MATCH_END.abandoned);
    }
  }

  // -------------------------------------------------------------------------
  // The match.
  // -------------------------------------------------------------------------

  private start(challenge: Challenge): void {
    const names = [challenge.from, challenge.to];
    const slots: MatchSlot[] = [];
    const matchId = this.nextId('match');

    for (const [slot, participant] of names.entries()) {
      const session = this.createSession(slot);
      session.reset(challenge.runSeed, { worldTickCap: challenge.stepLimit });
      slots.push({ slot, participant, session });
    }

    const match = new Match({ matchId, slots, stepLimit: challenge.stepLimit });
    const modes = match.modes();
    const live: LiveMatch = {
      match,
      participants: slots.map((s) => ({ slot: s.slot, participant: s.participant })),
      deadlineAt: this.clock.now() + this.deadlineFor(modes),
      modes,
      answered: new Set<number>(),
      lastHashes: match.hashes(),
      lastTick: -1,
    };
    this.matches.set(matchId, live);

    for (const s of slots) {
      const peerId = this.byParticipant.get(s.participant);
      const peer = peerId === undefined ? undefined : this.peers.get(peerId);
      if (peer === undefined) continue;
      peer.matchId = matchId;
      peer.slot = s.slot;
      this.send(peer, {
        type: NOTICE.matchStart,
        matchId,
        slot: s.slot,
        participants: live.participants,
        runSeed: challenge.runSeed,
        stepLimit: challenge.stepLimit,
        contract: this.contract,
        pacing: this.pacing,
        initialHashes: live.lastHashes,
      });
    }
    this.log(`match-start match=${matchId} participants=${names.join(',')} seed=${challenge.runSeed}`);
  }

  /** Closes the open tick, applies it, broadcasts it, and opens the next. */
  private advance(matchId: string, live: LiveMatch): void {
    const { batch } = live.match.close();
    const outcome = live.match.apply(batch);

    live.lastHashes = outcome.hashes;
    live.lastTick = outcome.tick;
    live.answered = new Set<number>();
    live.modes = outcome.modes;
    live.deadlineAt = this.clock.now() + this.deadlineFor(outcome.modes);

    this.broadcast(live, {
      type: NOTICE.tick,
      matchId,
      tick: outcome.tick,
      modes: outcome.modes,
      batch: outcome.batch,
      hashes: outcome.hashes,
      admitted: outcome.admitted,
      ...(outcome.end === undefined ? {} : { end: outcome.end }),
    });

    if (outcome.end !== undefined) this.endMatch(matchId, outcome.end);
  }

  private endMatch(matchId: string, reason: import('./protocol.js').MatchEndReason): void {
    const live = this.matches.get(matchId);
    if (live === undefined) return;
    const settled = live.match.finish(reason);
    this.broadcast(live, {
      type: NOTICE.matchEnd,
      matchId,
      reason: settled,
      tick: live.lastTick,
      finalHashes: live.lastHashes,
    });
    this.matches.delete(matchId);
    this.retain(matchId, live);
    // Peers keep `matchId` and `slot` deliberately: the final checkpoint has not
    // arrived yet, and a peer whose slot had already been cleared could not be
    // matched to the universe it is reporting on.
    this.log(`match-end match=${matchId} reason=${settled} tick=${live.lastTick}`);
  }

  // -------------------------------------------------------------------------
  // Plumbing.
  // -------------------------------------------------------------------------

  /**
   * The submission deadline for a tick, given which layer each slot is in.
   *
   * **The shortest deadline among the slots wins**, and the asymmetry is
   * deliberate. §0 makes clocks per-universe, so a match can hold one universe
   * in a raid and another in world time at the same instant. The universe in the
   * raid is the one with a real-time obligation — its tick is a tenth of a
   * fictional second and its opponent is waiting — while the universe in world
   * time is merely being given less thinking room than it would have had alone.
   * Taking the longer deadline instead would let a management-layer universe
   * hold up an engagement, which is the exact coupling splitting the profiles
   * exists to prevent.
   */
  private deadlineFor(modes: readonly TickMode[]): number {
    const engaged = modes.some((mode) => mode === TICK_MODE.engagement);
    return engaged ? this.pacing.engagement.actionDeadlineMs : this.pacing.world.actionDeadlineMs;
  }

  /**
   * Holds an ended match for its final checkpoint, evicting the oldest.
   *
   * A small fixed bound rather than a timer: a timer would be a second wall
   * clock in a class that has exactly one, and the thing being bounded is
   * memory rather than time.
   */
  private retain(matchId: string, live: LiveMatch): void {
    this.settled.set(matchId, live);
    while (this.settled.size > SETTLED_MATCH_LIMIT) {
      const oldest = this.settled.keys().next();
      if (oldest.done === true) break;
      this.settled.delete(oldest.value);
    }
  }

  private liveOf(peer: Peer): LiveMatch | undefined {
    if (peer.matchId === undefined || peer.slot === undefined) {
      this.fail(peer, ERROR_CODE.noMatch, 'This connection is not in a match.');
      return undefined;
    }
    const live = this.matches.get(peer.matchId);
    if (live === undefined || !live.match.running) {
      this.fail(peer, ERROR_CODE.matchOver, 'That match has ended.');
      return undefined;
    }
    return live;
  }

  private broadcast(live: LiveMatch, frame: ServerFrame): void {
    for (const { participant } of live.participants) {
      const peerId = this.byParticipant.get(participant);
      const peer = peerId === undefined ? undefined : this.peers.get(peerId);
      if (peer !== undefined) this.send(peer, frame);
    }
  }

  private send(peer: Peer, frame: ServerFrame): void {
    peer.connection.send(frame);
  }

  private fail(peer: Peer, code: ErrorCode, message: string): void {
    const fatal = isFatal(code);
    this.send(peer, { type: NOTICE.error, code, message, fatal });
    if (fatal) peer.connection.close();
  }

  /**
   * Identifiers, from a counter rather than randomness.
   *
   * `Math.random` is banned in the rules path and this is not the rules path,
   * but a counter is better here anyway: a match id that appears in a log, a
   * recorded batch and a desync report is easier to follow when it is
   * `match-3`, and nothing about the id is a secret. Uniqueness is per process,
   * which is all any of these ids are scoped to.
   */
  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }
}

/** The protocol version this host speaks. Re-exported for a binary's banner. */
export const HOST_PROTOCOL_VERSION = PROTOCOL_VERSION;
