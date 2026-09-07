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

import { GOD_ACTION, type AgentSession } from '@mm/agent-api';

import { ConnectionBudget, type AdmissionPolicy } from './admission.js';
import { DEFAULT_PACING, DEFAULT_RECONNECTION_GRACE_MS, systemClock, type Clock } from './clock.js';
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
  challengeEligibility,
  type MatchContract,
  type MatchEndReason,
  type MatchPacing,
  type ServerFrame,
  type SlotPrestige,
  type TickMode,
  type UniverseRef,
} from './protocol.js';
import { buildStoredUniverse, type Storage } from './storage.js';

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
 * {@link MatchHost.receive}, and a submission whose sequence does not increase
 * is **dropped without reaching the tick** — it cannot win on sequence anyway,
 * and admitting it only to reject it would let a stale retransmission mark the
 * slot as answered and close the tick early.
 */

/**
 * How many ended matches are held for their final checkpoint.
 *
 * See {@link MatchHost.settled}. Sized for "several matches finishing at once
 * on one host", which is the only situation in which more than one is needed.
 */
const SETTLED_MATCH_LIMIT = 64;

/**
 * The bubble a participant is placed in when it announces no universe.
 *
 * v1 has no persistence layer to have issued a universe id, so every
 * participant lands here and {@link challengeEligibility}'s bubble comparison
 * is satisfied by everyone. The constant is named rather than inlined so that
 * the day a stored universe arrives carrying a real bubble, the thing to
 * delete is findable — and so a reader can see that "everyone is reachable" is
 * a stated default rather than an absent check.
 */
export const DEFAULT_BUBBLE_ID = 'bubble-0';

/** A peer this host can write frames to. The transport's half of the contract. */
export interface Connection {
  readonly id: string;
  /** Delivers one frame. Framing is the transport's business. */
  send(frame: ServerFrame): void;
  /** Ends the connection. */
  close(): void;
}

/**
 * Computes prestige for one slot when a match ends with a terminal or
 * truncated outcome.
 *
 * **Injected rather than imported.** The arithmetic lives in
 * `@mm/coordination`, which `contracts.md` §5 puts out of this package's
 * reach. The binary supplies a closure over the god constants and calls
 * `prestigeEarned` and `carriedPrestige`; the server calls it and stores the
 * result. See `packages/scenario/src/legacy.ts` for the run-boundary layer
 * that already does this for single-process runs.
 */
export type PrestigeComputer = (
  session: AgentSession,
  matchEndReason: MatchEndReason,
) => { readonly earned: number; readonly carried: number } | undefined;

/**
 * What a raid produced, as the server sees it.
 *
 * The server knows sessions, slots and hashes. It does not know world state,
 * and it must not: §5 gives this package one edge, to `agent-api`, and a
 * resolution that exposed `SimState` would add a second. The resolver is
 * responsible for pausing world time, snapshotting, running the raid,
 * applying consequences and resuming — all through whatever private access
 * the binary gave it when it constructed the sessions. This type is the
 * receipt it hands back.
 */
export interface RaidResolution {
  /** The slot that won the raid. */
  readonly victorSlot: number;
  /**
   * Whether the defender's universe was destroyed.
   *
   * Vision §8b: a conquest transfers populace, materials and worship to the
   * attacker. The defender's universe ends and respawns in a new bubble.
   */
  readonly conquest: boolean;
  /** Engagement ticks the raid ran for. */
  readonly engagementTicks: number;
}

/**
 * Resolves a raid between two participants.
 *
 * Injected for the same reason `createSession` is: this package may not
 * import `@mm/rules-raid` or anything above `@mm/agent-api` in §5's
 * diagram. The binary provides an implementation that closes over the
 * scenario's content, grid and tuning — see `bin/serve.mjs`.
 *
 * The resolver is expected to:
 * 1. Pause world time for both universes
 * 2. Snapshot both
 * 3. Run the raid deterministically from `(attacker snapshot, defender
 *    snapshot, raidSeed)`
 * 4. Apply consequences to both universes
 * 5. Resume world time
 *
 * It returns the outcome the host can act on: who won, whether it was a
 * conquest, and how long it took.
 */
export interface RaidResolver {
  resolve(
    attacker: AgentSession,
    defender: AgentSession,
    raidSeed: number,
  ): RaidResolution;
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
  /**
   * Resolves a raid when a portal opens.
   *
   * Absent in tests that do not exercise raiding, and absent in production
   * until a binary wires it. When absent, action 14 (open portal) is
   * submitted to the session as-is and the session's own mask keeps it from
   * firing — which is exactly what happened before this field existed.
   */
  readonly raidResolver?: RaidResolver;
  readonly clock?: Clock;
  readonly pacing?: MatchPacing;
  readonly policy?: AdmissionPolicy;
  /**
   * Computes prestige when a match ends terminally or truncated.
   *
   * When provided, prestige is computed for each slot and:
   * - carried into each peer's `UniverseRef.prestige` for the next session
   * - included in the `match-end` notice so a match record can name it
   *
   * When absent, prestige is not computed and the match-end notice omits it.
   */
  readonly computePrestige?: PrestigeComputer;
  /**
   * Wall-clock milliseconds to hold a match alive after a participant
   * disconnects.
   *
   * During the window the disconnected slot receives substituted no-ops
   * through the normal deadline path — the passive-control strategy the
   * proposal names. If the participant reconnects before the window closes,
   * the match resumes. If the window expires, the match ends as
   * {@link MATCH_END.abandoned}.
   *
   * Defaults to {@link DEFAULT_RECONNECTION_GRACE_MS}. Set to `0` to
   * restore the immediate-abandonment behaviour this host had before
   * reconnection support.
   */
  readonly reconnectionGraceMs?: number;
  /** Where operator-facing lines go. Never stdout, which may carry frames. */
  readonly log?: (line: string) => void;
  /**
   * Universe persistence. When provided, universes are saved at the end of
   * every match and loaded when a participant announces a known universe id.
   *
   * Optional: a host without storage behaves exactly as before — every
   * universe is ephemeral and prestige does not survive the process.
   */
  readonly storage?: Storage;
}

/** One connected peer, before or during a match. */
interface Peer {
  readonly connection: Connection;
  readonly budget: ConnectionBudget;
  participant: string | undefined;
  /** The persisted universe this peer is playing. See {@link UniverseRef}. */
  universe: UniverseRef | undefined;
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
  readonly fromUniverse: UniverseRef;
  readonly toUniverse: UniverseRef;
  readonly runSeed: number;
  readonly stepLimit: number;
}

/**
 * A participant disconnected during a match, held for reconnection.
 *
 * Keyed by participant name in {@link MatchHost.disconnected}. Held for at
 * most {@link HostOptions.reconnectionGraceMs} wall-clock milliseconds; the
 * match continues with substituted no-ops for this slot in the meantime.
 */
interface DisconnectedPeer {
  readonly participant: string;
  readonly matchId: string;
  readonly slot: number;
  readonly universe: UniverseRef;
  readonly lastSequence: number;
  readonly disconnectedAt: number;
}

/** A match and the wall-clock state of its open tick. */
interface LiveMatch {
  readonly match: Match;
  /** The seed the match was started with, needed for reconnection replays. */
  readonly runSeed: number;
  readonly participants: readonly {
    slot: number;
    participant: string;
    universe: UniverseRef;
  }[];
  /** When the open tick's submissions close. The clock's only simulation-adjacent job. */
  deadlineAt: number;
  /** Which layer each slot was in when the open tick opened. Picks the deadline. */
  modes: readonly TickMode[];
  /** Slots that have an action for the open tick. */
  answered: Set<number>;
  /** The authoritative hashes of the last applied tick, for checkpoint comparison. */
  lastHashes: readonly string[];
  lastTick: number;
  /**
   * The slot that submitted action 14 (open portal) in the current tick, or
   * `-1` if none did.
   *
   * Tracked here rather than read off the batch, because the probe universe
   * (and any universe without portal knowledge) masks action 14 and the batch
   * records a substituted no-op. The intent — *this player tried to open a
   * portal* — is the thing the host acts on, and it is visible only before
   * the screening happens.
   */
  portalPending: number;
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
  private readonly raidResolver: RaidResolver | undefined;
  private readonly clock: Clock;
  private readonly pacing: MatchPacing;
  private readonly policy: AdmissionPolicy | undefined;
  private readonly computePrestige: PrestigeComputer | undefined;
  private readonly reconnectionGraceMs: number;
  private readonly log: (line: string) => void;
  private readonly storage: Storage | undefined;

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
  /**
   * Participants disconnected during a match and held for reconnection.
   *
   * Keyed by participant name. Each entry records the slot, match and the
   * wall-clock instant the disconnection happened. {@link pump} evicts entries
   * whose grace period has expired and ends their match.
   */
  private readonly disconnected = new Map<string, DisconnectedPeer>();
  private counter = 0;

  constructor(options: HostOptions) {
    this.contract = options.contract;
    this.createSession = options.createSession;
    this.raidResolver = options.raidResolver;
    this.clock = options.clock ?? systemClock;
    this.pacing = options.pacing ?? DEFAULT_PACING;
    this.policy = options.policy;
    this.computePrestige = options.computePrestige;
    this.reconnectionGraceMs = options.reconnectionGraceMs ?? DEFAULT_RECONNECTION_GRACE_MS;
    this.log = options.log ?? ((): void => {});
    this.storage = options.storage;
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
      universe: undefined,
      matchId: undefined,
      slot: undefined,
    });
  }

  /**
   * Drops a peer's connection.
   *
   * If the peer is in a match and a reconnection grace window is configured,
   * the match is held alive for that window: the disconnected slot receives
   * substituted no-ops through the normal deadline path (passive control).
   * If the grace window is zero or absent, the match ends immediately as
   * {@link MATCH_END.abandoned}.
   *
   * See task 7.5 — reconnection within a window.
   */
  disconnect(connectionId: string): void {
    const peer = this.peers.get(connectionId);
    if (peer === undefined) return;
    this.peers.delete(connectionId);
    if (peer.participant !== undefined) this.byParticipant.delete(peer.participant);
    if (peer.matchId !== undefined) {
      const live = this.matches.get(peer.matchId);
      if (live !== undefined && live.match.running) {
        if (this.reconnectionGraceMs > 0 && peer.participant !== undefined) {
          // Hold the match alive for reconnection.
          this.disconnected.set(peer.participant, {
            participant: peer.participant,
            matchId: peer.matchId,
            slot: peer.slot as number,
            universe: peer.universe as UniverseRef,
            lastSequence: peer.lastSequence,
            disconnectedAt: this.clock.now(),
          });
          this.log(
            `disconnected match=${peer.matchId} participant=${peer.participant} ` +
              `tick=${live.match.tick} grace=${this.reconnectionGraceMs}ms`,
          );
        } else {
          this.log(
            `abandoned match=${peer.matchId} participant=${peer.participant ?? connectionId} ` +
              `tick=${live.match.tick}`,
          );
          this.endMatch(peer.matchId, MATCH_END.abandoned);
        }
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
        this.onDecline(peer, frame);
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
   * Advances every match whose open tick is ready, and expires grace windows.
   *
   * A tick is ready when every slot has answered, or when its deadline has
   * passed. Called by the transport's timer; called directly by tests, which is
   * why it takes no arguments and reads the injected clock.
   */
  pump(): void {
    // Expire reconnection grace windows first, so the match ends before
    // another tick advances it with a no-op.
    for (const [participant, dc] of this.disconnected) {
      if (this.clock.now() >= dc.disconnectedAt + this.reconnectionGraceMs) {
        this.disconnected.delete(participant);
        const live = this.matches.get(dc.matchId);
        if (live !== undefined && live.match.running) {
          this.log(
            `grace-expired match=${dc.matchId} participant=${participant} ` +
              `tick=${live.match.tick}`,
          );
          this.endMatch(dc.matchId, MATCH_END.abandoned);
        }
      }
    }

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
    // Settled matches too: a test asserting that a desync corrected nothing has
    // to read the hashes *after* the match ended, and a lookup that returned
    // `undefined` there would make that assertion compare a value with itself.
    return (this.matches.get(matchId) ?? this.settled.get(matchId))?.match;
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

    // Reconnection: the participant was disconnected during a match and the
    // grace window has not yet expired.
    const dc = this.disconnected.get(name);
    if (dc !== undefined) {
      this.disconnected.delete(name);
      const live = this.matches.get(dc.matchId);
      if (live !== undefined && live.match.running) {
        peer.participant = name;
        peer.universe = dc.universe;
        peer.matchId = dc.matchId;
        peer.slot = dc.slot;
        peer.lastSequence = dc.lastSequence;
        this.byParticipant.set(name, peer.connection.id);
        this.send(peer, {
          type: NOTICE.welcome,
          connectionId: peer.connection.id,
          participant: name,
          contract: this.contract,
          advisory: disagreements.filter((d) => !d.fatal),
        });
        // Bring them up to speed: a match-start with the recorded batches
        // so the client can replay to the current state.
        this.send(peer, {
          type: NOTICE.matchStart,
          matchId: dc.matchId,
          slot: dc.slot,
          participants: live.participants,
          runSeed: live.runSeed,
          stepLimit: live.match.stepLimit,
          contract: this.contract,
          pacing: this.pacing,
          initialHashes: live.match.hashes(),
          batches: live.match.batches,
        });
        this.log(
          `reconnected match=${dc.matchId} participant=${name} ` +
            `tick=${live.match.tick} after=${this.clock.now() - dc.disconnectedAt}ms`,
        );
        return;
      }
      // The match ended while we were holding the grace window — possible if
      // the other participant left too. Fall through to a normal hello.
    }

    peer.participant = name;
    peer.universe = universeOf(frame['universe'], name);
    this.byParticipant.set(name, peer.connection.id);
    this.send(peer, {
      type: NOTICE.welcome,
      connectionId: peer.connection.id,
      participant: name,
      contract: this.contract,
      advisory: disagreements.filter((d) => !d.fatal),
    });
    this.resolveUniverse(peer);
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
    if (target === undefined || target.universe === undefined) {
      this.fail(peer, ERROR_CODE.badRequest, `No participant named ${JSON.stringify(opponent)}.`);
      return;
    }

    // Reachability, decided in one place. Vision §12 keeps matchmaking out of
    // v1, so this is not a queue admitting a pairing — it is whether the portal
    // between these two universes could exist at all. Today it can, because
    // every universe is in `DEFAULT_BUBBLE_ID`; the check is here so that the
    // day a respawned universe lands in another bubble, nothing else moves.
    const mine = peer.universe as UniverseRef;
    const ineligible = challengeEligibility(mine, target.universe);
    if (ineligible !== undefined) {
      this.send(peer, {
        type: NOTICE.error,
        code: ERROR_CODE.ineligible,
        message:
          `A challenge from ${mine.universeId} to ${target.universe.universeId} is not ` +
          `eligible: ${ineligible}. Two universes may only meet inside one group of multiverses.`,
        fatal: false,
        ineligibility: ineligible,
      });
      return;
    }

    const id = this.nextId('challenge');
    this.challenges.set(id, {
      id,
      from: peer.participant as string,
      to: opponent,
      fromUniverse: mine,
      toUniverse: target.universe,
      runSeed: runSeed as number,
      stepLimit: stepLimit as number,
    });
    this.send(target, {
      type: NOTICE.challenged,
      challengeId: id,
      from: peer.participant as string,
      fromUniverse: mine,
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

  private onDecline(peer: Peer, frame: Record<string, unknown>): void {
    const challengeId = frame['challengeId'];
    if (typeof challengeId !== 'string') return;
    const challenge = this.challenges.get(challengeId);
    // Only the challenged party may decline. Ids come from a counter and are
    // therefore guessable, so an unchecked decline would let any handshaken
    // connection cancel challenges between two other participants — a denial
    // of service made of one frame and an integer.
    if (challenge === undefined || challenge.to !== peer.participant) return;
    this.challenges.delete(challengeId);
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

    // Track portal-open intent before the submission reaches the match,
    // because the session's mask may refuse it — the probe universe does, any
    // universe without portal knowledge does — and the substituted no-op
    // loses the information the host needs to coordinate the raid.
    if (kind === GOD_ACTION.openPortal && this.raidResolver !== undefined) {
      live.portalPending = slot;
    }

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
    // {@link MatchHost.settled}.
    //
    // **Membership, not existence.** A checkpoint is the only frame that can
    // end somebody else's match, so what it is checked against is the seat this
    // connection actually holds, never the match id in the frame. Resolving the
    // match from the frame would let any handshaken stranger name a live match
    // and report a hash for it — one frame to terminate a match they are not
    // in, or to evict a settled one and suppress the final-hash comparison the
    // release claim is about. §4.2 puts this defence at the boundary, and a
    // frame the boundary trusts to name its own subject is not defended.
    const seat = peer.matchId;
    const slot = frame['slot'];
    const tick = frame['tick'];
    const hash = frame['hash'];
    if (seat === undefined || peer.slot === undefined) {
      this.fail(peer, ERROR_CODE.noMatch, 'This connection holds no seat in any match.');
      return;
    }
    if (typeof frame['matchId'] === 'string' && frame['matchId'] !== seat) {
      this.fail(peer, ERROR_CODE.unknownMatch, 'That is not the match this connection is in.');
      return;
    }
    const live = this.matches.get(seat) ?? this.settled.get(seat);
    if (live === undefined) {
      this.fail(peer, ERROR_CODE.noMatch, 'No match, running or just ended, by that name.');
      return;
    }
    if (!Number.isInteger(tick) || !Number.isInteger(slot) || typeof hash !== 'string') {
      this.fail(peer, ERROR_CODE.badRequest, '`checkpoint` needs `tick`, `slot` and `hash`.');
      return;
    }
    // A participant may vouch only for the universe it mirrors, which in v1 is
    // its own. Without this, one participant could report a lie about its
    // *opponent's* slot and end the match — objective denial by a frame, which
    // is exactly the grief surface the proposal warns a disconnect rule must
    // not open. When both sides mirror both universes — which a raid will need —
    // this widens to "any slot this participant mirrors", and it should widen
    // deliberately rather than by having never been checked.
    if (slot !== peer.slot) {
      this.fail(peer, ERROR_CODE.badRequest, 'A participant may only checkpoint its own slot.');
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
    // Slot order is challenger first, and it is fixed here rather than anywhere
    // later: the slot index is half the ordering key, so which participant is
    // slot 0 must be a property of how the match was established and never of
    // who connected first or answered fastest.
    const seats = [
      { participant: challenge.from, universe: challenge.fromUniverse },
      { participant: challenge.to, universe: challenge.toUniverse },
    ];
    const slots: MatchSlot[] = [];
    const matchId = this.nextId('match');

    for (const [slot, seat] of seats.entries()) {
      const session = this.createSession(slot);
      session.reset(challenge.runSeed, { worldTickCap: challenge.stepLimit });
      slots.push({ slot, participant: seat.participant, session });
    }

    const match = new Match({ matchId, slots, stepLimit: challenge.stepLimit });
    const modes = match.modes();
    const live: LiveMatch = {
      match,
      runSeed: challenge.runSeed,
      participants: seats.map((seat, slot) => ({
        slot,
        participant: seat.participant,
        universe: seat.universe,
      })),
      deadlineAt: this.clock.now() + this.deadlineFor(modes),
      modes,
      answered: new Set<number>(),
      lastHashes: match.hashes(),
      lastTick: -1,
      portalPending: -1,
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
    this.log(
      `match-start match=${matchId} bubble=${challenge.fromUniverse.bubbleId} ` +
        `universes=${seats.map((seat) => seat.universe.universeId).join(',')} ` +
        `seed=${challenge.runSeed}`,
    );
  }

  /** Closes the open tick, applies it, broadcasts it, and opens the next. */
  private advance(matchId: string, live: LiveMatch): void {
    const { batch } = live.match.close();

    // ---- Raid interception: detect action 14 (open portal) before applying. ----
    //
    // When a resolver is present and one slot submitted the portal action, the
    // host coordinates the raid between the two sessions rather than letting the
    // action arrive at a session that has no opponent. The batch is applied
    // first — every action including the portal's reaches its universe — and
    // then the resolver runs the engagement. The ordering matters: the portal
    // action sets the clock mode to engagement, which is the thing
    // `tickModeOf` reads after application.
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

    // ---- Raid transport: if a portal was requested, resolve the engagement. ----
    //
    // Checked after broadcasting the tick so both sides see the action that
    // opened the portal. The resolver is called with the attacker's and
    // defender's sessions, pauses world time for both, snapshots, runs the
    // raid, applies consequences and resumes — all inside the injected
    // callback. The host gets back a receipt saying who won and whether it
    // was a conquest.
    //
    // `portalPending` is set in `onAction` when a peer submits action 14,
    // before the session's mask has a chance to refuse it. The intent is what
    // the host acts on: a player who asked to open a portal is one the
    // resolver should evaluate, even if the session's own mask would have
    // stopped it (which happens when `portalTargets` is empty).
    if (live.portalPending >= 0 && outcome.end === undefined) {
      const attackerSlot = live.portalPending;
      live.portalPending = -1;
      this.resolveRaidInMatch(matchId, live, attackerSlot, batch.tick);
    } else {
      live.portalPending = -1;
    }

    if (outcome.end !== undefined) this.endMatch(matchId, outcome.end);
  }

  /**
   * Resolves a raid between two participants.
   *
   * Called when action 14 is detected in a batch. The attacker is the slot
   * that submitted the action; the defender is the other slot. v1 has exactly
   * two slots per match, so "the other" is well-defined.
   *
   * The resolver handles the five steps task 7.4 names:
   * 1. Pause world time for both universes
   * 2. Snapshot both
   * 3. Resolve the raid deterministically
   * 4. Apply consequences to both universes
   * 5. Resume world time
   *
   * After the resolver returns, the host updates hashes (consequences changed
   * state) and broadcasts the result. If it was a conquest, the host also
   * sends the conquest notice and ends the match.
   */
  private resolveRaidInMatch(
    matchId: string,
    live: LiveMatch,
    attackerSlot: number,
    tick: number,
  ): void {
    const defenderSlot = live.match.slots.find((s) => s.slot !== attackerSlot)?.slot;
    if (defenderSlot === undefined) return;

    const attackerSession = live.match.slots.find((s) => s.slot === attackerSlot)?.session;
    const defenderSession = live.match.slots.find((s) => s.slot === defenderSlot)?.session;
    if (attackerSession === undefined || defenderSession === undefined) return;

    // The raid seed is derived from the match's tick. Two raids in one match
    // get different seeds, and two peers get the same one.
    const raidSeed = tick * 7 + 1;

    const resolution = this.raidResolver!.resolve(
      attackerSession,
      defenderSession,
      raidSeed,
    );

    // Update hashes — consequences changed both universes' state.
    live.lastHashes = live.match.hashes();

    this.broadcast(live, {
      type: NOTICE.raidResolved,
      matchId,
      attackerSlot,
      defenderSlot,
      victorSlot: resolution.victorSlot,
      engagementTicks: resolution.engagementTicks,
      conquest: resolution.conquest,
      hashesAfterRaid: live.lastHashes,
    });

    this.log(
      `raid-resolved match=${matchId} attacker=${String(attackerSlot)} ` +
        `defender=${String(defenderSlot)} victor=${String(resolution.victorSlot)} ` +
        `conquest=${String(resolution.conquest)} ticks=${String(resolution.engagementTicks)}`,
    );

    if (resolution.conquest) {
      this.applyConquest(matchId, live, resolution.victorSlot, defenderSlot);
    }
  }

  /**
   * Handles the aftermath of a conquest: tribute transfer notification, loser
   * respawn, and match end.
   *
   * Vision §8b: the defender's populace, materials and worship transfer to the
   * attacker. The defender respawns in a fresh bubble carrying prestige. The
   * match ends because the defender's universe no longer exists.
   *
   * The actual transfer is done by the resolver (inside `applyRaidOutcome`).
   * What the host adds is:
   * - A conquest notice naming the defeated universe and its respawn location
   * - A match end with reason `conquest`
   */
  private applyConquest(
    matchId: string,
    live: LiveMatch,
    victorSlot: number,
    defeatedSlot: number,
  ): void {
    const defeated = live.participants.find((p) => p.slot === defeatedSlot);
    if (defeated === undefined) return;

    // The respawn universe gets a new bubble id — the anti-farming property
    // §8b names. The universe id stays the same (it is a persistent identity),
    // and prestige carries (already wired in 7.2's protocol support).
    const respawnBubbleId = `bubble-${this.nextId('respawn')}`;
    const respawnUniverse: UniverseRef = {
      universeId: defeated.universe.universeId,
      bubbleId: respawnBubbleId,
      prestige: defeated.universe.prestige ?? 0,
    };

    this.broadcast(live, {
      type: NOTICE.conquest,
      matchId,
      victorSlot,
      defeatedSlot,
      defeatedUniverse: defeated.universe,
      respawnUniverse,
    });

    this.log(
      `conquest match=${matchId} victor=${String(victorSlot)} ` +
        `defeated=${defeated.universe.universeId} ` +
        `respawn-bubble=${respawnBubbleId}`,
    );

    this.endMatch(matchId, MATCH_END.conquest);
  }

  private endMatch(matchId: string, reason: MatchEndReason): void {
    const live = this.matches.get(matchId);
    if (live === undefined) return;
    const settled = live.match.finish(reason);

    // Prestige carry-forward: compute and store when the match ended with an
    // outcome the prestige system prices — terminal (ascension or stagnation)
    // or truncated (reached the tick cap). Not on abandonment, desync or
    // shutdown, none of which are endings §8a's prestige was designed for.
    let prestige: readonly SlotPrestige[] | undefined;
    if (
      this.computePrestige !== undefined &&
      (settled === MATCH_END.terminal || settled === MATCH_END.truncated)
    ) {
      const results: SlotPrestige[] = [];
      for (const slotDef of live.match.slots) {
        const result = this.computePrestige(slotDef.session, settled);
        if (result !== undefined) {
          results.push({ slot: slotDef.slot, earned: result.earned, carried: result.carried });
          // Update the peer's universe ref so the next session carries the
          // new prestige. The peer may be disconnected (grace period) — check
          // both connected and disconnected participants.
          const part = live.participants.find((p) => p.slot === slotDef.slot);
          if (part !== undefined) {
            const peerId = this.byParticipant.get(part.participant);
            const peer = peerId === undefined ? undefined : this.peers.get(peerId);
            if (peer !== undefined && peer.universe !== undefined) {
              peer.universe = {
                universeId: peer.universe.universeId,
                bubbleId: peer.universe.bubbleId,
                prestige: result.carried,
              };
            }
          }
        }
      }
      if (results.length > 0) prestige = results;
    }

    // Clean up any disconnected entries for participants in this match.
    for (const { participant } of live.participants) {
      this.disconnected.delete(participant);
    }

    this.broadcast(live, {
      type: NOTICE.matchEnd,
      matchId,
      reason: settled,
      tick: live.lastTick,
      finalHashes: live.lastHashes,
      ...(prestige !== undefined ? { prestige } : {}),
    });
    this.matches.delete(matchId);
    this.retain(matchId, live);
    // Peers keep `matchId` and `slot` deliberately: the final checkpoint has not
    // arrived yet, and a peer whose slot had already been cleared could not be
    // matched to the universe it is reporting on.
    this.log(`match-end match=${matchId} reason=${settled} tick=${live.lastTick}`);
    this.persistUniverses(live);
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

  /**
   * Loads the authoritative universe record, if one exists in storage.
   *
   * The wire-declared `UniverseRef` is advisory for prestige (see
   * `protocol.ts`), so the server replaces it with the stored value. The
   * update is async; a challenge that arrives before the load finishes uses
   * the wire value, which is acceptable because prestige is advisory in the
   * match and the authoritative value is what gets saved at match end.
   */
  private resolveUniverse(peer: Peer): void {
    if (this.storage === undefined || peer.universe === undefined) return;
    const universeId = peer.universe.universeId;
    this.storage.loadUniverse(universeId).then(
      (stored) => {
        // The peer may have disconnected by the time the load finishes.
        if (stored === undefined || !this.peers.has(peer.connection.id)) return;
        peer.universe = {
          universeId: stored.universeId,
          bubbleId: stored.bubbleId,
          prestige: stored.prestige,
        };
        this.log(`resolved universe=${universeId} prestige=${stored.prestige}`);
      },
      (err: unknown) => {
        this.log(`storage-load-error universe=${universeId} ${String(err)}`);
      },
    );
  }

  /**
   * Persists every universe that participated in a match.
   *
   * Fire-and-forget: a storage failure must not crash the match lifecycle.
   * The log names the failure so an operator can see it, and the match has
   * already ended — there is nothing to roll back.
   */
  private persistUniverses(live: LiveMatch): void {
    if (this.storage === undefined) return;
    const hashes = live.lastHashes;
    for (const p of live.participants) {
      const slot = live.match.slots.find((s) => s.slot === p.slot);
      const hash = hashes[p.slot] ?? (slot !== undefined ? slot.session.snapshotHash() : '');
      const record = buildStoredUniverse(p.universe, this.contract.scenarioId, hash);
      this.storage.saveUniverse(record).catch((err: unknown) => {
        this.log(`storage-error universe=${p.universe.universeId} ${String(err)}`);
      });
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

/**
 * The universe a participant announced, or the default one it is placed in.
 *
 * v1 has no persistence layer, so nothing has issued a universe id and a server
 * that demanded one would refuse every honest client. A participant that omits
 * the field is given an id derived from its name inside
 * {@link DEFAULT_BUBBLE_ID} — which makes every universe mutually reachable,
 * exactly as it is today, while routing the decision through the same predicate
 * a stored universe will use.
 *
 * The validation is deliberately narrow: ids are compared, never parsed, so the
 * only thing that matters is that they are non-empty strings.
 */
function universeOf(declared: unknown, participant: string): UniverseRef {
  if (typeof declared === 'object' && declared !== null) {
    const candidate = declared as Partial<UniverseRef>;
    if (
      typeof candidate.universeId === 'string' &&
      candidate.universeId.length > 0 &&
      typeof candidate.bubbleId === 'string' &&
      candidate.bubbleId.length > 0
    ) {
      return typeof candidate.prestige === 'number' && Number.isFinite(candidate.prestige)
        ? {
            universeId: candidate.universeId,
            bubbleId: candidate.bubbleId,
            prestige: candidate.prestige,
          }
        : { universeId: candidate.universeId, bubbleId: candidate.bubbleId };
    }
  }
  return { universeId: `unpersisted:${participant}`, bubbleId: DEFAULT_BUBBLE_ID };
}

/** The protocol version this host speaks. Re-exported for a binary's banner. */
export const HOST_PROTOCOL_VERSION = PROTOCOL_VERSION;
