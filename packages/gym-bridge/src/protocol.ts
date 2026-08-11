/*
 * Multiverse Mages — the wire vocabulary: verbs, error codes, and frame shapes.
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
 * The frames that cross the process boundary, and nothing that computes.
 *
 * ## Identifiers here are permanent, for the reason §4.2's action ids are
 *
 * `agent-api/src/actions.ts` argues it for the action space: the ids are
 * *serialized*, so renumbering means every recorded run and every trained
 * policy silently means something different afterwards and nothing fails. A
 * verb name and an error code are serialized in exactly the same sense — they
 * appear in every recorded episode and in every client written against this
 * release. Adding a verb is append-only; renaming one is a protocol version
 * bump.
 *
 * ## Two failure vocabularies, deliberately kept apart
 *
 * - A **rejection** is normal play. §4.2: *"RL agents will submit illegal
 *   actions constantly; that must be cheap and observable."* It rides in a step
 *   result as `admitted: false`, the tick still advances, and the core's
 *   counter still increments.
 * - An **error** is a protocol fault: unparseable JSON, an unknown verb, a
 *   frame naming an env that does not exist. It rides in an {@link ErrorFrame}.
 *
 * A bridge that reported an illegal action as an error frame would be unusable
 * — a uniform-random policy would spend its life in the error path — and one
 * that reported a protocol fault as a rejection would hide a client bug inside
 * `illegalActionRate`, which §7 already warns is a spec-clarity smell rather
 * than an agent-competence measure.
 */

/**
 * The wire format's version. Bumped when a frame's meaning changes, never for
 * an added optional field.
 *
 * `1` for 0.11.0, the release that first published it.
 */
export const PROTOCOL_VERSION = 1;

/** Every verb a client may send. Append-only. */
export const VERB = {
  /** Opens the connection and declares what the client expects. Must come first. */
  hello: 'hello',
  /** Returns the canonical layout encoding, so a client can verify the digest. */
  describe: 'describe',
  /** Starts an episode in one or more envs. */
  reset: 'reset',
  /** Submits one action per named env and advances each one tick. */
  step: 'step',
  /** Releases every session. The bridge exits after answering. */
  close: 'close',
} as const;

export type Verb = (typeof VERB)[keyof typeof VERB];

/** Every verb, in declaration order. Used in the `unknown-verb` refusal. */
export const ALL_VERBS: readonly Verb[] = Object.freeze(Object.values(VERB));

/**
 * Every error a frame can name.
 *
 * Only `contract-mismatch` is fatal. That asymmetry is the point: a client that
 * sends nonsense should be told and allowed to recover, while a client whose
 * observation contract disagrees with the build must not receive a single
 * observation — a policy handed a differently-meaning vector produces a
 * plausible number rather than a failure.
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
  /** An env index outside `0..envCount-1`. */
  unknownEnv: 'unknown-env',
  /** `step` on an env that has never been reset. */
  noEpisode: 'no-episode',
  /** `step` on an env whose episode has terminated. */
  episodeOver: 'episode-over',
  /** A frame of a known verb whose fields are missing or the wrong type. */
  badRequest: 'bad-request',
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

/** The one code that ends the process. See {@link ERROR_CODE}. */
export const FATAL_ERROR_CODES: readonly ErrorCode[] = Object.freeze([ERROR_CODE.contractMismatch]);

/** Whether an error ends the connection. */
export function isFatal(code: ErrorCode): boolean {
  return FATAL_ERROR_CODES.includes(code);
}

// ---------------------------------------------------------------------------
// The contract a handshake pins.
// ---------------------------------------------------------------------------

/**
 * What the bridge publishes about the environment it serves.
 *
 * Split into two halves by {@link STRUCTURAL_CONTRACT_FIELDS} and
 * {@link ADVISORY_CONTRACT_FIELDS}, which is the decision `design.md` argues at
 * length: a checkpoint's weight shapes and index semantics depend on the first
 * half and a mismatch there is fatal, while the second half changes on every
 * balance tune and refusing on it produces a check people disable.
 */
export interface ObservationContract {
  readonly protocolVersion: number;
  readonly observationSchemaVersion: number;
  readonly observationLayoutDigest: string;
  readonly observationSize: number;
  readonly actionSpaceSize: number;
  /** §4.4's pinned `k` per parameterized action, keyed by action id. */
  readonly candidateSlots: Readonly<Record<string, number>>;
  readonly scenarioId: string;
  /** §0's content revision, or `unknown` when the scenario declares none. */
  readonly contentHash: string;
  readonly buildVersion: string;
}

/**
 * The fields a disagreement on which is fatal.
 *
 * These are exactly the quantities a trained policy's *shape* depends on. A
 * policy is a function from `observationSize` doubles to `actionSpaceSize`
 * logits, whose input channels mean what `observationLayoutDigest` says they
 * mean and whose parameterized outputs index into lists of the widths
 * `candidateSlots` names.
 */
export const STRUCTURAL_CONTRACT_FIELDS: readonly (keyof ObservationContract)[] = Object.freeze([
  'protocolVersion',
  'observationSchemaVersion',
  'observationLayoutDigest',
  'observationSize',
  'actionSpaceSize',
  'candidateSlots',
]);

/**
 * The fields a disagreement on which is recorded and reported, never fatal.
 *
 * `proposal.md` asks whether the shape identifier should hash the content set
 * too, *"so that a retuned universe is visibly a different environment"*, and
 * answers its own question: *"That may be too strict to be usable during
 * balance tuning, which retunes constantly."* It is too strict. So the content
 * hash rides in every episode header and in every advisory, and the researcher
 * decides.
 */
export const ADVISORY_CONTRACT_FIELDS: readonly (keyof ObservationContract)[] = Object.freeze([
  'scenarioId',
  'contentHash',
  'buildVersion',
]);

/** One field two parties disagree about. */
export interface ContractMismatch {
  readonly field: string;
  /** What the bridge publishes, rendered as text so any type compares the same way. */
  readonly bridge: string;
  /** What the client declared. */
  readonly client: string;
}

// ---------------------------------------------------------------------------
// Request frames.
// ---------------------------------------------------------------------------

/** Everything a request has in common. */
export interface RequestBase {
  readonly type: Verb;
  /** Echoed on the response, so a client may pipeline. Optional. */
  readonly id?: number | string;
}

/** Opens the connection. Must be the first frame. */
export interface HelloRequest extends RequestBase {
  readonly type: 'hello';
  /**
   * What the client was built or trained against. Every field optional: a
   * client that declares nothing is served, and a client that declares one
   * field has that one field checked.
   */
  readonly expect?: Partial<ObservationContract>;
}

/** Asks for the canonical layout encoding. */
export interface DescribeRequest extends RequestBase {
  readonly type: 'describe';
}

/** One env's reset. */
export interface ResetEntry {
  readonly env: number;
  /**
   * The episode's root seed. **Named by the client, never derived here.**
   *
   * `mc-harness` publishes `deriveRunSeed` with its own version constant, and
   * §5 grants this package no edge to it. Re-deriving it here would be a second
   * implementation of a published constant — the same class of mistake as a
   * second normalization, and just as silent when it drifts.
   */
  readonly runSeed: number;
  readonly worldTickCap: number;
  readonly options?: Readonly<Record<string, number | string | boolean>>;
}

export interface ResetRequest extends RequestBase {
  readonly type: 'reset';
  readonly envs: readonly ResetEntry[];
}

/** One env's action. */
export interface StepEntry {
  readonly env: number;
  /** An id from §4.2's table. */
  readonly action: number;
  /**
   * §4.4's slot index for a parameterized action, or the raw parameter for the
   * ruleset actions. Passed to `submit` as `params[0]` and resolved against
   * *current* state by `agent-api`'s gate — never by this package.
   */
  readonly slot?: number;
}

export interface StepRequest extends RequestBase {
  readonly type: 'step';
  readonly envs: readonly StepEntry[];
}

export interface CloseRequest extends RequestBase {
  readonly type: 'close';
}

export type Request =
  | HelloRequest
  | DescribeRequest
  | ResetRequest
  | StepRequest
  | CloseRequest;

// ---------------------------------------------------------------------------
// Response frames.
// ---------------------------------------------------------------------------

/** §4.3's outcome record, as it crosses the wire. **No reward.** */
export interface OutcomeFrame {
  /** The run reached an end state of its own. */
  readonly terminal: boolean;
  /**
   * The caller's step limit was reached.
   *
   * Two booleans and never one enum, for §4.3's stated reason: *"bootstrapping
   * value estimates through the two differs, and conflating them is a silent
   * training bug."* A run that ascends on the tick it hits its cap is terminal
   * *and* truncated, and this pair says so.
   */
  readonly truncated: boolean;
  readonly terminalReason: number;
  readonly era: number;
  readonly metricDeltas: Readonly<Record<string, number>>;
}

/** §4.4's candidate list for one parameterized action. */
export interface CandidateFrame {
  readonly action: number;
  /** How many slots this action has. §4.4's pinned `k`. */
  readonly slots: number;
  /** The occupied slots' parameter tuples, in slot order. Shorter than `slots`. */
  readonly occupied: readonly (readonly number[])[];
}

/** One env's view after a reset or a step. */
export interface EnvView {
  readonly env: number;
  /** §4.1's exported vector, unmodified. */
  readonly observation: readonly number[];
  /** §4.2's mask, one entry per action id. */
  readonly mask: readonly number[];
  readonly candidates: readonly CandidateFrame[];
  readonly outcome: OutcomeFrame;
  /** `running` | `ascended` | `stagnated` | `truncated`. */
  readonly status: string;
  readonly worldTick: number;
  /** The core's own count, which §7's `illegalActionRate` is computed from. */
  readonly illegalActionCount: number;
  readonly snapshotHash: string;
}

/** One env's step result. Everything in {@link EnvView}, plus what the gate did. */
export interface StepView extends EnvView {
  /** Whether the gate let the action through. */
  readonly admitted: boolean;
  /**
   * Why not, when it did not.
   *
   * **Diagnostics, not a channel.** `agent-api/src/gate.ts` says the reason is
   * *"never fed back to the agent: it is not in the observation, and making it
   * one would be a channel the mask does not have."* That is honoured
   * literally: it is not in {@link EnvView.observation} and not in
   * {@link EnvView.mask}. It rides here because a client debugging its own
   * masking needs it, and the Python adapter surfaces it as `info`, where the
   * convention says a learning signal must not come from.
   */
  readonly rejection?: string;
}

export interface ReadyResponse {
  readonly type: 'ready';
  readonly id?: number | string;
  readonly contract: ObservationContract;
  readonly envCount: number;
  /** Advisory disagreements. Never fatal; see {@link ADVISORY_CONTRACT_FIELDS}. */
  readonly advisories: readonly ContractMismatch[];
}

export interface DescribeResponse {
  readonly type: 'layout';
  readonly id?: number | string;
  /** `agent-api`'s `layoutEncoding(OBSERVATION_SLOTS)`, verbatim. */
  readonly encoding: string;
  readonly observationLayoutDigest: string;
  readonly observationSchemaVersion: number;
}

export interface ObservationResponse {
  readonly type: 'observation';
  readonly id?: number | string;
  readonly envs: readonly EnvView[];
}

export interface StepResponse {
  readonly type: 'step';
  readonly id?: number | string;
  readonly envs: readonly StepView[];
}

export interface ClosedResponse {
  readonly type: 'closed';
  readonly id?: number | string;
}

export interface ErrorFrame {
  readonly type: 'error';
  readonly id?: number | string;
  readonly code: ErrorCode;
  readonly message: string;
  /** Present on `contract-mismatch`: every disagreeing field, with both values. */
  readonly mismatches?: readonly ContractMismatch[];
  /** Whether the bridge is ending the connection. */
  readonly fatal: boolean;
}

export type Response =
  | ReadyResponse
  | DescribeResponse
  | ObservationResponse
  | StepResponse
  | ClosedResponse
  | ErrorFrame;

/** Any frame, in either direction. */
export type Frame = Request | Response;
