/*
 * Multiverse Mages — authoritative server package public surface.
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
 * `@mm/server` — the authoritative multiplayer server.
 *
 * `docs/design/contracts.md` §5 gives this package one edge, to `@mm/agent-api`,
 * and §5 rule 2 says nothing may depend on it. It is a leaf, and the only leaf
 * the AGPL's network clause bears on directly: anyone running a modified copy as
 * a service must be able to offer its source to the people using it. That is why
 * it has zero third-party runtime dependencies and why its transport is Node's
 * own `net` — see `transport.ts`.
 *
 * ## The four things this package fixes
 *
 * 1. **A wire vocabulary** (`protocol.ts`), versioned, with the snapshot
 *    transport `contracts.md` §8 defers here — defined *against* sim-core's
 *    existing encoding rather than as a second serialization of it.
 * 2. **An ordering rule** (`ordering.ts`): `(slot, sequence)`, never arrival
 *    order. This is the one that makes the release plan's zero-desync claim
 *    measurable instead of decorative.
 * 3. **An authoritative tick** (`match.ts`), pure and clock-free, so a recorded
 *    match replays to the same hashes.
 * 4. **Desync detection** (`desync.ts`) that reuses the snapshot hash and never
 *    corrects.
 *
 * ## What it deliberately does not do
 *
 * No raid engages here. Nothing supplies `portalTargets`, so `openPortal` is
 * permanently masked, and this package does not manufacture one to look
 * finished. The protocol carries the slot a raid will need — `SnapshotPayload`'s
 * `kind` separates world from engagement transport, because §1.6 keeps
 * engagement entities out of world snapshots — and stops there.
 *
 * No matchmaking. Vision §12 puts anything past direct challenge out of scope
 * for v1, so there is no queue, no ladder and no ranking.
 *
 * No persistence yet. `universe-persistence` is specified in this change and
 * built in another; the wire format's bootstrap is `(scenario, seed, config)`
 * plus the batch record, which is the same shape a persisted universe would
 * replay from.
 */

export {
  DEFAULT_ADMISSION_POLICY,
  ConnectionBudget,
  type AdmissionPolicy,
  type AdmissionRefusal,
} from './admission.js';

export { DEFAULT_PACING, manualClock, systemClock, type Clock, type ManualClock } from './clock.js';

export { inEngagement, tickModeOf } from './mode.js';

export {
  BoundedLineReader,
  FRAME_SEPARATOR,
  FrameDecodeError,
  FrameTooLongError,
  MAX_FRAME_LENGTH,
  decodeFrame,
  encodeFrame,
} from './codec.js';

export { compareHash, desyncLogLine, type HashReport } from './desync.js';

export { HOST_PROTOCOL_VERSION, MatchHost, type Connection, type HostOptions } from './host.js';

export { Match, screen, type MatchOptions, type MatchSlot, type TickOutcome } from './match.js';

export {
  NOOP_ACTION,
  TickAssembly,
  canonicalBatch,
  type OrderingResult,
  type RejectedSubmission,
} from './ordering.js';

export {
  ADVISORY_CONTRACT_FIELDS,
  ALL_VERBS,
  ENTRY_SOURCE,
  ERROR_CODE,
  FATAL_ERROR_CODES,
  MATCH_END,
  NOTICE,
  PROTOCOL_VERSION,
  REJECTION,
  SNAPSHOT_ENCODING,
  STRUCTURAL_CONTRACT_FIELDS,
  TICK_MODE,
  VERB,
  contractDisagreements,
  isFatal,
} from './protocol.js';

export type {
  AcceptRequest,
  ActionRequest,
  CanonicalBatch,
  CanonicalEntry,
  ChallengeRequest,
  ChallengedNotice,
  CheckpointRequest,
  ClientFrame,
  ContractDisagreement,
  DeclineRequest,
  DesyncNotice,
  EntrySource,
  ErrorCode,
  ErrorFrame,
  Frame,
  HelloRequest,
  LeaveRequest,
  MatchContract,
  MatchEndNotice,
  MatchEndReason,
  MatchPacing,
  MatchStartNotice,
  Notice,
  RejectionReason,
  ServerFrame,
  SnapshotPayload,
  Submission,
  TickMode,
  TickNotice,
  TickPacing,
  Verb,
  WelcomeNotice,
  WireAction,
} from './protocol.js';

export { MatchServer, type ListenOptions } from './transport.js';
