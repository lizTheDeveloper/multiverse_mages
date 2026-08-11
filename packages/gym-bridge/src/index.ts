/*
 * Multiverse Mages — the RL bridge package public surface.
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
 * `@mm/gym-bridge` — `docs/design/contracts.md` §5's last line:
 *
 * > `gym-bridge`  JSON-over-stdio RL wrapper. → `agent-api`
 *
 * One edge, and this package spends it on transporting §4 faithfully to a
 * process that is not this one. Four properties are structural rather than
 * stylistic, and each prevents a different silent failure:
 *
 * 1. **It computes nothing.** No normalization, no rescaling, no reward, no
 *    seed derivation, no candidate resolution. §4.1 makes `agent-api`'s
 *    `normalize.ts` the one licensed float boundary; a second one here would
 *    decouple what a learned policy optimizes from what the balance gates
 *    measure, and both sides would still be numbers in `[0, 1]`.
 * 2. **It emits no reward, under any name.** §4.3: *"Reward is a property of a
 *    training objective, not of the game."* No frame carries one, and the
 *    Python adapter requires the caller to supply the objective rather than
 *    inheriting one.
 * 3. **It refuses before it observes.** A structural mismatch between the
 *    client's declared observation contract and the build's is fatal at the
 *    handshake. A policy handed one differently-meaning vector is already
 *    contaminated, and the run that produces it looks exactly like a run that
 *    was not.
 * 4. **It builds no world.** `agent-api`'s session takes a caller-supplied
 *    `Scenario`, and §5 grants this package no edge to `@mm/scenario` — which
 *    is a leaf, and stays one. `bin/serve.mjs` loads the scenario module named
 *    on the command line, the way `mm-run-sweep` already does.
 *
 * ## What it is not
 *
 * Not a sweep runner, not a rollout harness, not an aggregator, not a baseline
 * regenerator. `mc-harness` is all four, with a `worker_threads` pool, published
 * seed derivation and canonical-order aggregation. Work with no Python policy in
 * the loop belongs there; this package's help text says so rather than growing a
 * worse version of it. See `vector.ts` for the argument.
 */

export type { Frame, Request, Response } from './protocol.js';
export type {
  CandidateFrame,
  CloseRequest,
  ClosedResponse,
  ContractMismatch,
  DescribeRequest,
  DescribeResponse,
  EnvView,
  ErrorCode,
  ErrorFrame,
  HelloRequest,
  ObservationContract,
  ObservationResponse,
  OutcomeFrame,
  ReadyResponse,
  RequestBase,
  ResetEntry,
  ResetRequest,
  StepEntry,
  StepRequest,
  StepResponse,
  StepView,
  Verb,
} from './protocol.js';
export {
  ADVISORY_CONTRACT_FIELDS,
  ALL_VERBS,
  ERROR_CODE,
  FATAL_ERROR_CODES,
  PROTOCOL_VERSION,
  STRUCTURAL_CONTRACT_FIELDS,
  VERB,
  isFatal,
} from './protocol.js';

export { FRAME_SEPARATOR, FrameDecodeError, LineReader, decodeFrame, encodeFrame } from './codec.js';

export type { ContractInput } from './contract.js';
export {
  UNKNOWN_CONTENT_HASH,
  advisoryMismatches,
  candidateSlotTable,
  describeMismatches,
  publishedContract,
  renderField,
  structuralMismatches,
} from './contract.js';

export type { EnvFault, VectorOptions } from './vector.js';
export { EnvVector, candidateFrames } from './vector.js';

export type { Bridge, BridgeOptions, BridgeReply } from './bridge.js';
export { createBridge } from './bridge.js';

export type {
  EpisodeAction,
  EpisodeFooter,
  EpisodeHeader,
  EpisodeRecord,
  ReplayResult,
} from './record.js';
export {
  RECORD_FORMAT_VERSION,
  EpisodeRecorder,
  RecordError,
  encodeRecord,
  episodeHeader,
  parseRecord,
  recordContractMismatches,
  replayRecord,
} from './record.js';
