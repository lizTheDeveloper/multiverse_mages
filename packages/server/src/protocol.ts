/*
 * Multiverse Mages — the authoritative wire vocabulary: verbs, notices, codes, frames.
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
 * The frames that cross the network boundary, and nothing that computes.
 *
 * `docs/design/contracts.md` §8 defers the snapshot wire format to this change,
 * so this file is where it is fixed. Four decisions shape everything below, and
 * each is a rule taken from a document rather than a preference.
 *
 * ## 1. There is no second serialization
 *
 * `pvp-server`'s proposal forbids the wire becoming a second serialization that
 * drifts from `world-persistence`, and `sim-core/src/snapshot/snapshot.ts` says
 * outright that its byte encoding is the only definition of state equality the
 * project has. So this protocol **does not serialize state at all** in v1.
 *
 * A match bootstraps from `(scenarioId, contentRevision, runSeed, config)` and
 * advances by the canonical ordered action batch. Every participant rebuilds
 * the same universe with the same scenario and the same seed, which is exactly
 * what determinism was bought for in 0.1.0. The proposal weighs this option and
 * says why it is attractive: *"the action-log option is attractive precisely
 * because determinism already guarantees it works, and it makes desync
 * forensics trivial."* The cost it names — replay grows with the age of the
 * universe — is a `universe-persistence` problem, not a match-transport one,
 * because a match is bounded by its step limit.
 *
 * Where a snapshot genuinely must cross the wire later — mid-match join,
 * reconnection, a universe loaded from storage — {@link SnapshotPayload} names
 * the shape and pins the encoding to `mmsn-base64`: sim-core's own
 * `encodeSnapshot` bytes, base64 for JSON's sake, never re-canonicalized here.
 * v1 transports no such payload; see `design.md` for the accessor that
 * `agent-api` would have to grow first.
 *
 * ## 2. Order comes from the protocol, never from the network
 *
 * Every submission carries `slot` and `sequence`, and the canonical batch is
 * ordered by `(slot, sequence)` alone. Arrival time is not an input to any
 * ordering decision anywhere in this package. The release plan's 0.16.0 claim
 * is zero desyncs across 1,000 matches; a server whose batch order depended on
 * arrival order would make that claim unmeasurable while still appearing to
 * work, which is the failure mode this project keeps catching.
 *
 * ## 3. A missing action has a defined meaning
 *
 * When a tick's deadline passes with no submission from a slot, the batch gets
 * an explicit no-op for that slot, flagged {@link ENTRY_SOURCE.substituted}.
 * Not "wait indefinitely", which stalls every other participant, and not
 * "whatever arrived first", which is arrival order wearing a hat. §4.2 already
 * makes an illegal submission a no-op plus a counter increment; an absent one
 * is the same shape, and the flag is what keeps it observable rather than
 * silent.
 *
 * ## 4. Two failure vocabularies, kept apart
 *
 * `gym-bridge/src/protocol.ts` draws this line and it is drawn the same way
 * here, for the same reason. A **rejection** is normal play — §4.2: illegal
 * actions must be cheap and observable — and rides in the tick notice. An
 * **error** is a protocol fault and rides in an {@link ErrorFrame}. A server
 * that reported illegal actions as errors would be unusable by a learning
 * agent; one that reported protocol faults as rejections would hide client bugs
 * inside §7's `illegalActionRate`.
 *
 * ## Identifiers here are permanent
 *
 * A verb, a notice, an error code and a rejection reason are serialized in the
 * same sense §4.2's action ids are: they appear in every recorded match and in
 * every client written against this release. Adding one is append-only;
 * renaming one is a {@link PROTOCOL_VERSION} bump.
 */

/**
 * The wire format's version. Bumped when a frame's meaning changes, never for
 * an added optional field.
 *
 * `1` for `pvp-server`, the change that first published it.
 */
export const PROTOCOL_VERSION = 1;

/**
 * The snapshot encoding this protocol will carry, named and pinned.
 *
 * `mmsn` is the magic in sim-core's snapshot header. The tag exists so that a
 * payload can never be mistaken for "some JSON of the state": if these bytes
 * ever flow, they are `encodeSnapshot`'s bytes and `decodeSnapshot` reads them.
 */
export const SNAPSHOT_ENCODING = 'mmsn-base64';

/** Every verb a client may send. Append-only. */
export const VERB = {
  /** Opens the connection and declares the contract the client expects. Must come first. */
  hello: 'hello',
  /** Offers a match to a named participant. Vision §12: direct challenge only. */
  challenge: 'challenge',
  /** Accepts a challenge, which establishes the match. */
  accept: 'accept',
  /** Refuses a challenge. */
  decline: 'decline',
  /** Submits this participant's action for one tick. */
  action: 'action',
  /** Reports the mirror simulation's snapshot hash at a tick, for §desync comparison. */
  checkpoint: 'checkpoint',
  /** Leaves the match. Abandonment, not a pause. */
  leave: 'leave',
} as const;

export type Verb = (typeof VERB)[keyof typeof VERB];

/** Every verb, in declaration order. Used in the `unknown-verb` refusal. */
export const ALL_VERBS: readonly Verb[] = Object.freeze(Object.values(VERB));

/** Every notice the server may send. Append-only. */
export const NOTICE = {
  /** Answers `hello` when the contract agrees. */
  welcome: 'welcome',
  /** Tells a participant they have been challenged. */
  challenged: 'challenged',
  /** The match exists. Carries everything needed to build the same universe. */
  matchStart: 'match-start',
  /** One authoritative tick: the canonical batch, and the resulting hashes. */
  tick: 'tick',
  /** A hash mismatch. Hard, named, and terminal. Never a correction. */
  desync: 'desync',
  /** The match is over, with the reason and the final hashes. */
  matchEnd: 'match-end',
  /** A protocol fault. See {@link ERROR_CODE}. */
  error: 'error',
} as const;

export type Notice = (typeof NOTICE)[keyof typeof NOTICE];

/**
 * Every protocol fault a frame can name.
 *
 * Three are fatal, and the asymmetry is the point. A client that sends nonsense
 * should be told and allowed to recover. A client whose observation contract
 * disagrees must not receive a single observation, because a policy handed a
 * differently-meaning vector produces a plausible number rather than a failure.
 * A client whose `contentRevision` disagrees must not be admitted to a match at
 * all — §0 offers no partial-compatibility rule and no negotiation.
 */
export const ERROR_CODE = {
  /** The line was not JSON, or was not an object. */
  malformedFrame: 'malformed-frame',
  /** `type` names no verb in {@link VERB}. */
  unknownVerb: 'unknown-verb',
  /** A verb arrived before `hello`. */
  handshakeRequired: 'handshake-required',
  /** The client's declared observation contract disagrees. **Fatal.** */
  contractMismatch: 'contract-mismatch',
  /**
   * §0's content revisions differ. **Fatal**, and separate from
   * `contract-mismatch` on purpose: §0 requires the refusal to name both
   * revisions, so the condition needs a code whose frame carries two of them.
   */
  contentRevisionMismatch: 'content-revision-mismatch',
  /** A frame naming a match this connection is not in. */
  unknownMatch: 'unknown-match',
  /** A match verb from a connection that is in no match. */
  noMatch: 'no-match',
  /** A match verb after the match ended. */
  matchOver: 'match-over',
  /** A frame of a known verb whose fields are missing or the wrong type. */
  badRequest: 'bad-request',
  /**
   * The two universes may not meet. See {@link challengeEligibility}.
   *
   * Not fatal: a challenge to an unreachable universe is an ordinary mistake,
   * and the participant may challenge someone else. The frame names the reason
   * so a client can say *why* rather than "no".
   */
  ineligible: 'ineligible',
  /**
   * The connection exceeded its admission budget. **Fatal.**
   *
   * §4.2: *"The core does not defend itself; the boundary does."* A hostile
   * peer's unlimited cheap no-ops are answered here rather than in the core.
   */
  rateLimited: 'rate-limited',
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

/** The codes that end the connection. See {@link ERROR_CODE}. */
export const FATAL_ERROR_CODES: readonly ErrorCode[] = Object.freeze([
  ERROR_CODE.contractMismatch,
  ERROR_CODE.contentRevisionMismatch,
  ERROR_CODE.rateLimited,
]);

/** Whether an error ends the connection. */
export function isFatal(code: ErrorCode): boolean {
  return FATAL_ERROR_CODES.includes(code);
}

/**
 * Why a submitted action did not become the slot's action for a tick.
 *
 * These are **not** errors. A rejected submission still leaves the tick with a
 * well-defined action for that slot — the substituted no-op — and the match
 * advances. §4.2 requires exactly this.
 */
export const REJECTION = {
  /** The legality mask forbade it. */
  masked: 'masked',
  /**
   * A ruleset action arrived while `clock.mode == engagement`.
   *
   * Strictly a special case of `masked`, and named separately because it is the
   * one the design cares about most: vision §3's frozen policy — *"Nothing
   * about the ruleset can be altered once a raid has begun"* — enforced across
   * the network boundary rather than only by the local mask.
   */
  rulesetFrozen: 'ruleset-frozen',
  /** A second submission for a tick this slot had already filled. */
  duplicate: 'duplicate',
  /** It arrived after the tick closed. */
  late: 'late',
  /** The slot exceeded its per-tick submission budget. */
  budgetExceeded: 'budget-exceeded',
  /** `kind` is not an action id, or a parameter was not an integer. */
  malformedAction: 'malformed-action',
} as const;

export type RejectionReason = (typeof REJECTION)[keyof typeof REJECTION];

/** Where a canonical batch entry came from. */
export const ENTRY_SOURCE = {
  /** The participant's own submission, admitted. */
  submitted: 'submitted',
  /**
   * The server's no-op, standing in for a submission that never arrived or was
   * rejected. Flagged rather than silent — see this module's note 3.
   */
  substituted: 'substituted',
} as const;

export type EntrySource = (typeof ENTRY_SOURCE)[keyof typeof ENTRY_SOURCE];

/** Why a match ended. */
export const MATCH_END = {
  /** Every participant's episode reached a terminal state (§4.3). */
  terminal: 'terminal',
  /** The caller's step limit was reached. §4.3 makes truncation the caller's. */
  truncated: 'truncated',
  /** A hash mismatch. See {@link DesyncNotice}. */
  desync: 'desync',
  /** A participant left or its connection dropped. */
  abandoned: 'abandoned',
  /** The operator stopped the server. */
  shutdown: 'shutdown',
} as const;

export type MatchEndReason = (typeof MATCH_END)[keyof typeof MATCH_END];

// ---------------------------------------------------------------------------
// The contract a handshake pins.
// ---------------------------------------------------------------------------

/**
 * What the server publishes about the match it will host.
 *
 * Split into structural and advisory halves for `gym-bridge`'s reason: a
 * disagreement on the first half changes what a frame *means*, while the second
 * half moves on every build and refusing on it produces a check people disable.
 *
 * **`contentRevision` is structural here, and it is not in `gym-bridge`.** That
 * is the one deliberate divergence between the two contracts, and §0 is the
 * whole of the argument: *"Two universes may only interact — a raid, a match —
 * if their `contentRevision` values are equal. There is no partial-
 * compatibility rule and no negotiation."* A single agent training against its
 * own bridge can be told its content drifted and carry on; two universes
 * meeting in one match cannot.
 */
export interface MatchContract {
  readonly protocolVersion: number;
  readonly observationSchemaVersion: number;
  readonly observationLayoutDigest: string;
  readonly observationSize: number;
  readonly actionSpaceSize: number;
  /** §0's content revision: 32 lowercase hex characters, carried at full width. */
  readonly contentRevision: string;
  /** Both participants must play the same scenario, or "the same universe" means nothing. */
  readonly scenarioId: string;
  /** Advisory. Recorded so a desync report can name the two builds. */
  readonly buildVersion: string;
}

/**
 * The fields a disagreement on which is fatal.
 *
 * Exactly the quantities that decide whether two processes are simulating the
 * same game. `contentRevision` is here for §0's reason; see {@link MatchContract}.
 */
export const STRUCTURAL_CONTRACT_FIELDS = Object.freeze([
  'protocolVersion',
  'observationSchemaVersion',
  'observationLayoutDigest',
  'observationSize',
  'actionSpaceSize',
  'contentRevision',
  'scenarioId',
] as const satisfies readonly (keyof MatchContract)[]);

/** The fields reported on disagreement but not refused. */
export const ADVISORY_CONTRACT_FIELDS = Object.freeze([
  'buildVersion',
] as const satisfies readonly (keyof MatchContract)[]);

/** One field the two sides disagree about. */
export interface ContractDisagreement {
  readonly field: keyof MatchContract;
  readonly server: MatchContract[keyof MatchContract];
  readonly client: MatchContract[keyof MatchContract];
  readonly fatal: boolean;
}

/**
 * Compares a client's declared contract against the server's.
 *
 * Returns every disagreement, structural and advisory, so one refusal can name
 * all of them rather than making a client discover them one reconnect at a time.
 */
export function contractDisagreements(
  server: MatchContract,
  client: MatchContract,
): readonly ContractDisagreement[] {
  const out: ContractDisagreement[] = [];
  for (const field of STRUCTURAL_CONTRACT_FIELDS) {
    if (server[field] !== client[field]) {
      out.push({ field, server: server[field], client: client[field], fatal: true });
    }
  }
  for (const field of ADVISORY_CONTRACT_FIELDS) {
    if (server[field] !== client[field]) {
      out.push({ field, server: server[field], client: client[field], fatal: false });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Who is playing: persisted universe identity.
// ---------------------------------------------------------------------------

/**
 * The persisted identity a participant brings to a match.
 *
 * A participant is not merely a name on a connection. It is **a universe**, with
 * a life longer than any one session: it accumulates knowledge, it ascends or is
 * extinguished, and its prestige carries into whatever comes next (vision §8a).
 * The name is how a challenge addresses it; this is what it is.
 *
 * ## `clusterId`, and why it is here before anything uses it
 *
 * A universe belongs to a **group of multiverses** — a bounded neighbourhood
 * whose members can portal to one another. Nothing in this release consults it:
 * every universe the skeleton hosts is in one cluster, and
 * {@link challengeEligibility} compares the field and finds it equal.
 *
 * It is declared now because of what it costs to add later. Cluster membership
 * is a property of a *persisted universe*, so it has to be in whatever the
 * persistence layer writes and in whatever a participant announces itself with.
 * Adding a field to those two places before anything is stored is free; adding
 * it afterwards means a snapshot migration and a protocol version bump, and it
 * would arrive at the same time as the feature that needs it — which is the
 * worst moment to be changing a storage format.
 *
 * The concrete thing it will be for: a universe extinguished by conquest
 * respawns **in a different cluster**, carrying its prestige. That is an
 * anti-farming property — the conqueror keeps the tribute and loses the target —
 * and it is only expressible if "which neighbourhood" is a thing a universe has.
 * See `universe-persistence`'s spec for the life-cycle in full.
 */
export interface UniverseRef {
  /**
   * Stable across runs and across sessions. Not the participant's display name,
   * which is a connection-scoped label anyone may choose.
   */
  readonly universeId: string;
  /**
   * The group of multiverses this universe is in. Membership decides
   * reachability: two universes may only meet if they share it.
   */
  readonly clusterId: string;
  /**
   * §8a's carry-forward, read-only during a run (§1.1).
   *
   * Advisory on the wire. §7 caps `prestigeAdvantage` at 60%, which the balance
   * harness measures offline; in live play prestige is an account-level value
   * and therefore the first thing worth cheating, so a server that trusted this
   * number would be trusting a participant about its own advantage. It travels
   * so a match record can name it. Whoever builds `universe-persistence` owns
   * making the authoritative copy the server's own.
   */
  readonly prestige?: number;
}

/** Why two universes may not meet. */
export const INELIGIBILITY = {
  /** §0: their content revisions differ. No negotiation, no partial compatibility. */
  contentRevision: 'content-revision',
  /**
   * They are in different groups of multiverses.
   *
   * Not a queue and not matchmaking — vision §12 keeps both out of v1. This is
   * an *eligibility predicate on a direct challenge*: the challenge names its
   * opponent, and this says whether the portal could exist between them.
   */
  cluster: 'cluster',
  /** A universe cannot challenge itself. */
  self: 'self',
} as const;

export type IneligibilityReason = (typeof INELIGIBILITY)[keyof typeof INELIGIBILITY];

/**
 * Whether a direct challenge between two universes is legal.
 *
 * Returns the reason to refuse, or `undefined` to allow. Pure, total, and
 * deliberately the *only* place reachability is decided, so that adding a rule
 * later — a portal-range limit, a cooldown after conquest, the griefing guard
 * §7's `inboundRaidTempoLoss` implies — is an edit to one function rather than a
 * search for every place a challenge is admitted.
 */
export function challengeEligibility(
  challenger: UniverseRef,
  opponent: UniverseRef,
  contentRevisions?: { readonly challenger: string; readonly opponent: string },
): IneligibilityReason | undefined {
  if (challenger.universeId === opponent.universeId) return INELIGIBILITY.self;
  if (challenger.clusterId !== opponent.clusterId) return INELIGIBILITY.cluster;
  if (
    contentRevisions !== undefined &&
    contentRevisions.challenger !== contentRevisions.opponent
  ) {
    return INELIGIBILITY.contentRevision;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Actions on the wire.
// ---------------------------------------------------------------------------

/**
 * An action as it crosses the wire.
 *
 * Structurally sim-core's `Action` — `{kind, params?}` — and deliberately not
 * imported from it: §5 gives this package one edge, to `agent-api`, and
 * `gym-bridge/src/vector.ts` builds its submissions the same structural way for
 * the same reason. The shape is narrow enough that a copy cannot drift
 * meaningfully, and §4.2's ids are permanent, which is what makes that safe.
 */
export interface WireAction {
  readonly kind: number;
  readonly params?: readonly number[];
}

/** One participant's submission for one tick. */
export interface Submission {
  /** Which participant. The first half of the ordering key. */
  readonly slot: number;
  /** The tick this action is for. A submission for another tick is `late` or ignored. */
  readonly tick: number;
  /**
   * The submission's ordinal within the slot, monotonic per participant.
   *
   * The second half of the ordering key, and the tie-break that decides which
   * of two submissions for one tick counts. It exists so the answer is a
   * property of the protocol rather than of which packet won a race.
   */
  readonly sequence: number;
  readonly action: WireAction;
}

/** One slot's action for one tick, after ordering and admission. */
export interface CanonicalEntry {
  readonly slot: number;
  readonly action: WireAction;
  readonly source: EntrySource;
  /** The winning submission's sequence, or `0` for a substituted no-op. */
  readonly sequence: number;
  /** Why the participant's own submission was not used, when it was not. */
  readonly rejection?: RejectionReason;
}

/**
 * Every slot's action for one tick, in canonical order.
 *
 * **This is the match record.** Replaying a match means replaying this sequence
 * against the same scenario and seed, which is how the 1,000-match harness the
 * release claim needs is built, and how a desync is located after the fact.
 */
export interface CanonicalBatch {
  readonly tick: number;
  /** One entry per slot, ascending by slot. Never in arrival order. */
  readonly entries: readonly CanonicalEntry[];
}

// ---------------------------------------------------------------------------
// Snapshot transport. Declared, pinned, and unused in v1 — see note 1.
// ---------------------------------------------------------------------------

/**
 * A snapshot on the wire, if one ever must be.
 *
 * `encoding` is pinned to {@link SNAPSHOT_ENCODING}: these are sim-core's own
 * `encodeSnapshot` bytes in base64, and the only thing a receiver may do with
 * them is hand them to `decodeSnapshot`. Nothing in this protocol re-derives a
 * canonical form, and nothing hashes the JSON text — {@link TickNotice.hashes}
 * always carries `snapshotHash`'s output over the same bytes.
 *
 * `kind` exists because contracts §1.6 says engagement entities are **not**
 * written to world snapshots. World transport and raid transport therefore
 * cannot be the same payload, and a receiver that guessed would silently drop
 * or invent combatants. v1 emits neither.
 */
export interface SnapshotPayload {
  readonly kind: 'world' | 'engagement';
  readonly slot: number;
  readonly encoding: typeof SNAPSHOT_ENCODING;
  /** sim-core's `SNAPSHOT_VERSION`, so a receiver can refuse a future one. */
  readonly snapshotVersion: number;
  /** `snapshotHash` over exactly these bytes. */
  readonly hash: string;
  /** base64 of `encodeSnapshot`'s output. */
  readonly bytes: string;
}

// ---------------------------------------------------------------------------
// Client frames.
// ---------------------------------------------------------------------------

/** Common shape: every frame names itself in `type`. */
export interface Frame {
  readonly type: string;
}

export interface HelloRequest extends Frame {
  readonly type: typeof VERB.hello;
  /** How this participant wishes to be addressed in a challenge. */
  readonly participant: string;
  readonly contract: MatchContract;
  /**
   * The persisted universe this participant is playing.
   *
   * Optional in v1, because no persistence layer exists to have issued one yet
   * and a server that refused a participant for lacking an id it cannot obtain
   * would be unusable. A participant that omits it is placed in
   * {@link DEFAULT_CLUSTER_ID} under an id derived from its name — see
   * `host.ts`. When `universe-persistence` ships, the field becomes the thing a
   * stored universe is loaded by, and the default becomes a refusal.
   */
  readonly universe?: UniverseRef;
}

export interface ChallengeRequest extends Frame {
  readonly type: typeof VERB.challenge;
  /** Whom to challenge, by the name they said `hello` with. Vision §12: direct only. */
  readonly opponent: string;
  /** The match's root seed. Both universes are built from it. */
  readonly runSeed: number;
  /** §4.3's caller-imposed step limit. The server never invents one. */
  readonly stepLimit: number;
}

export interface AcceptRequest extends Frame {
  readonly type: typeof VERB.accept;
  readonly challengeId: string;
}

export interface DeclineRequest extends Frame {
  readonly type: typeof VERB.decline;
  readonly challengeId: string;
}

export interface ActionRequest extends Frame {
  readonly type: typeof VERB.action;
  readonly matchId: string;
  readonly tick: number;
  readonly sequence: number;
  readonly action: WireAction;
}

export interface CheckpointRequest extends Frame {
  readonly type: typeof VERB.checkpoint;
  readonly matchId: string;
  readonly tick: number;
  /**
   * The hash of the participant's **own** mirror simulation of `slot`.
   *
   * A participant that echoed the server's hash would make the whole desync
   * check a tautology — the proposal says so in as many words. The reference
   * client computes this from a core instance it steps itself.
   */
  readonly slot: number;
  readonly hash: string;
}

export interface LeaveRequest extends Frame {
  readonly type: typeof VERB.leave;
  readonly matchId: string;
}

export type ClientFrame =
  | HelloRequest
  | ChallengeRequest
  | AcceptRequest
  | DeclineRequest
  | ActionRequest
  | CheckpointRequest
  | LeaveRequest;

// ---------------------------------------------------------------------------
// Server frames.
// ---------------------------------------------------------------------------

export interface WelcomeNotice extends Frame {
  readonly type: typeof NOTICE.welcome;
  readonly connectionId: string;
  readonly participant: string;
  readonly contract: MatchContract;
  /** Advisory disagreements, reported and not refused. */
  readonly advisory: readonly ContractDisagreement[];
}

export interface ChallengedNotice extends Frame {
  readonly type: typeof NOTICE.challenged;
  readonly challengeId: string;
  readonly from: string;
  /** The challenger's universe, so the recipient can judge the offer. */
  readonly fromUniverse: UniverseRef;
  readonly runSeed: number;
  readonly stepLimit: number;
}

/**
 * The match exists, and this is everything needed to build the same universe.
 *
 * No snapshot: see this module's note 1. A participant calls
 * `scenario.create(runSeed, config)` with exactly these values and is then
 * simulating the same world the server is.
 */
export interface MatchStartNotice extends Frame {
  readonly type: typeof NOTICE.matchStart;
  readonly matchId: string;
  /** This connection's slot. Also the first half of its ordering key. */
  readonly slot: number;
  /** Every participant, by slot, with the universe each is playing. */
  readonly participants: readonly {
    readonly slot: number;
    readonly participant: string;
    readonly universe: UniverseRef;
  }[];
  readonly runSeed: number;
  readonly stepLimit: number;
  readonly contract: MatchContract;
  /** Wall-clock pacing. §8: the server owns it and the client follows. */
  readonly pacing: MatchPacing;
  /** `snapshotHash` per slot before the first tick, so a mirror can verify its build. */
  readonly initialHashes: readonly string[];
}

/** Which of the game's two layers a tick belongs to. */
export const TICK_MODE = {
  /**
   * The management layer. Research, teaching, scribing, universities, standing
   * roles — the tycoon game between raids. `clock.mode == world`, and a world
   * tick is a month (§0).
   */
  world: 'world',
  /**
   * The raid. `clock.mode == engagement`, and an engagement tick is 100 ms of
   * fictional time (§0). This is the layer the real-time guarantees are about.
   */
  engagement: 'engagement',
} as const;

export type TickMode = (typeof TICK_MODE)[keyof typeof TICK_MODE];

/** The wall-clock terms of one layer. */
export interface TickPacing {
  /** Wall-clock milliseconds between authoritative ticks. */
  readonly tickIntervalMs: number;
  /**
   * Milliseconds after a tick opens before its submissions close.
   *
   * A slot with nothing admitted by then gets a substituted no-op. Never
   * unbounded: an unbounded deadline lets one slow participant stop the match,
   * which is the classic lockstep failure the proposal flags.
   */
  readonly actionDeadlineMs: number;
}

/**
 * The wall-clock terms of a match — **one profile per layer, not one for both.**
 *
 * `contracts.md` §0 fixes an engagement tick at 100 ms of *fictional* time and a
 * world tick at a month, says plainly that real-time pacing *"is a client/server
 * concern and never appears in the core"*, and §8 names the owner: *"the server
 * is authoritative; the client follows."* This type is that ownership written
 * down, and it is split in two because the game is two layers.
 *
 * ## Why one profile would be wrong
 *
 * The management layer is the mini-game between raids: a god permitting a
 * technique, funding a university, assigning a role. Those are deliberate,
 * considered moves on a clock whose tick is a *month*. The raid is the RTS
 * action game, on a clock whose tick is a tenth of a *second*.
 *
 * A single deadline would have to satisfy both, and either choice damages one
 * layer. A sub-second deadline imposes twitch latency on a contemplative layer —
 * a god who paused to think would be given a substituted no-op for a decision
 * that had no reason to be hurried. A generous deadline makes an engagement tick
 * wait on a peer for as long as a management move is allowed to take, which is
 * the difference between a lockstep RTS and a slideshow.
 *
 * `clock.mode` is the seam the contracts already draw between the two layers —
 * it is what §4.2 masks on, and therefore what vision §3's frozen policy is
 * expressed in terms of. Pacing is scoped to the same seam, so there is one
 * definition of which layer a tick belongs to rather than two that can disagree.
 */
export interface MatchPacing {
  /** Terms for `clock.mode == engagement`. The part that must be bulletproof. */
  readonly engagement: TickPacing;
  /** Terms for `clock.mode == world`. The management layer between raids. */
  readonly world: TickPacing;
}

/** One authoritative tick. */
export interface TickNotice extends Frame {
  readonly type: typeof NOTICE.tick;
  readonly matchId: string;
  readonly tick: number;
  /**
   * Which layer this tick ran in, per slot.
   *
   * Per slot rather than per match because §0 makes clocks **per-universe**: a
   * raid freezes world time for its two participants only, and every uninvolved
   * universe keeps advancing. A match whose participants are not all in the same
   * raid therefore has slots in different modes at the same instant, and a
   * single match-wide mode would be a claim §0 forbids.
   */
  readonly modes: readonly TickMode[];
  /** The canonical batch, in canonical order. Apply it as given. */
  readonly batch: CanonicalBatch;
  /** `snapshotHash` per slot after applying the batch. The authority. */
  readonly hashes: readonly string[];
  /** Per slot, whether the core admitted the action (§4.2's counter moved if not). */
  readonly admitted: readonly boolean[];
  /** Whether this tick ended the match, and why. */
  readonly end?: MatchEndReason;
}

/**
 * A hash mismatch: hard, named, logged, and terminal.
 *
 * The proposal fixes the semantics and they are not negotiable here: *"A hash
 * mismatch is a hard, reported, logged event — never a silent correction."*
 * Nothing in this package resynchronizes a participant, rolls one back, or
 * accepts the majority hash. The match ends and the frame names both values.
 */
export interface DesyncNotice extends Frame {
  readonly type: typeof NOTICE.desync;
  readonly matchId: string;
  /** The tick at which the two disagreed. */
  readonly tick: number;
  /** The universe slot whose hashes differ. */
  readonly slot: number;
  /** Who reported the differing hash. */
  readonly participant: string;
  readonly authoritativeHash: string;
  readonly reportedHash: string;
  /** Always `false`. Present so that a reader of a log cannot wonder. */
  readonly corrected: false;
}

export interface MatchEndNotice extends Frame {
  readonly type: typeof NOTICE.matchEnd;
  readonly matchId: string;
  readonly reason: MatchEndReason;
  readonly tick: number;
  readonly finalHashes: readonly string[];
}

export interface ErrorFrame extends Frame {
  readonly type: typeof NOTICE.error;
  readonly code: ErrorCode;
  readonly message: string;
  readonly fatal: boolean;
  /** Present on `contract-mismatch`, naming every field that disagreed. */
  readonly disagreements?: readonly ContractDisagreement[];
  /** Present on `ineligible`, naming which predicate refused. */
  readonly ineligibility?: IneligibilityReason;
  /**
   * Present on `content-revision-mismatch`, naming both revisions.
   *
   * §0 requires the refusal to name them: a mismatch a player cannot diagnose
   * is a mismatch that gets worked around rather than fixed.
   */
  readonly revisions?: { readonly server: string; readonly client: string };
}

export type ServerFrame =
  | WelcomeNotice
  | ChallengedNotice
  | MatchStartNotice
  | TickNotice
  | DesyncNotice
  | MatchEndNotice
  | ErrorFrame;
