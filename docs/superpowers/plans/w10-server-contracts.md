<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W10 — `pvp-server` contracts and a running skeleton

**Goal.** Fix the interfaces so the server, the agents and the harness can be built against them
without inventing incompatible versions of the same model — the same role `core-contracts` played
as change #2. Then prove the contract by running it: several independent OS processes, each an
agent, playing one authoritative match on localhost and agreeing on the snapshot hash.

**Not in scope.** Netcode tuning, distributed deployment, a human client, matchmaking beyond direct
challenge (vision §12), and raids actually engaging (that is W8 — nothing supplies `portalTargets`
and `openPortal` is permanently masked, so no raid can fire in this tree).

## Decisions taken, with the section each traces to

- **§5 edge is `server → agent-api` only.** Exactly as `contracts.md` §5 already draws it. The
  server drives `AgentSession` (`reset`/`submit`/`snapshotHash`), so no direct `sim-core` edge is
  needed and §5 needs no new deviation paragraph.
- **Participants mirror-simulate.** The release plan's 0.15.0 claim is that *both clients* produce
  identical final snapshot hashes. A participant that echoed the server's hash would make the claim
  a tautology — the proposal says so itself. So the server broadcasts the canonical ordered action
  batch and each participant applies it to its own core instance.
- **Desync detection reuses `snapshotHash`.** No second integrity mechanism, no re-canonicalized
  JSON hash. A mismatch is hard, reported, logged, terminal — never a silent correction.
- **Ordering is `(tick, participantSlot, sequence)`.** Never arrival order. This is what keeps the
  0.16.0 zero-desync claim measurable.
- **A missing action is an explicit no-op** injected into the canonical batch and flagged as
  substituted — the same shape §4.2 gives an illegal submission.
- **Only no-op is legal during engagement.** `contracts.md` §4.2 as it now stands: *every* action
  except no-op is masked, and "silence in an earlier draft was not permission." This supersedes the
  brief's "actions 1–7 and 13".
- **`contentRevision` equality is fatal, not advisory** — §0: no partial-compatibility rule, no
  negotiation, refusal names both revisions, 32 lowercase hex carried at full width.
- **The wall clock lives in one injected `Clock`**, used only for tick pacing and deadlines
  (`contracts.md` §8 makes the server the owner of wall-clock pacing). The match core is pure.

## Steps

### 1. Package skeleton and the boundary

- [x] 1.1 `packages/server/{package.json,tsconfig.json,tsconfig.test.json}`, AGPL headers, `"license": "AGPL-3.0-or-later"`
- [x] 1.2 Root `tsconfig.json` references, `vitest.config.ts` alias
- [x] 1.3 Add `server: { value: ['agent-api'], typeOnly: [] }` to `module-boundaries.test.ts` `ALLOWED`
- [x] 1.4 `npm install` at the root to regenerate `package-lock.json`; commit it
- [x] 1.5 A `package-boundaries.test.ts` asserting zero third-party runtime dependencies

### 2. The wire contract (failing tests first)

- [x] 2.1 `protocol.ts` — `PROTOCOL_VERSION`, verbs, error codes, rejection codes, frame types
- [x] 2.2 `MatchContract` and the structural/advisory split, with `contentRevision` structural
- [x] 2.3 `codec.ts` — newline-delimited JSON framing, `LineReader`
- [x] 2.4 Tests: handshake ordering, contract mismatch is fatal and names both revisions

### 3. Ordering, admission and the authoritative tick

- [x] 3.1 `ordering.ts` — canonical batch from submissions, arrival order excluded by construction
- [x] 3.2 `admission.ts` — the §4.2 trust-boundary policy: per-tick action budget, frame rate limit
- [x] 3.3 `match.ts` — the pure authoritative tick over N participant sessions
- [x] 3.4 Tests: shuffled arrival gives an identical batch and identical hashes; a missing action
      becomes a flagged no-op; ruleset actions refused during engagement

### 4. Desync

- [x] 4.1 `desync.ts` — compare reported mirror hashes against authoritative, per slot
- [x] 4.2 Test: a tampered participant hash produces a hard report naming tick, slot and both
      hashes, terminates the match, and corrects nothing

### 5. Transport and the multi-process path (extended mid-task: a real socket, real processes)

- [x] 5.1 `transport.ts` over `node:net`, zero dependencies, port 0 in tests
- [x] 5.2 `bin/serve.mjs` — argv and the dynamic scenario import (the `gym-bridge` split)
- [x] 5.3 `bin/agent.mjs` — a reference agent process that mirror-simulates
- [x] 5.4 In-process match test (the unit path)
- [x] 5.5 E2E: server process + 2 agent processes, match to terminal, all hashes agree
- [x] 5.6 Replay the recorded batch log in-process and assert the same final hashes
- [x] 5.7 Split pacing per layer — the management mini-game and the raid are not one real-time model
- [x] 5.8 `UniverseRef` and `challengeEligibility`, so clusters are a field and a predicate later

### 6. OpenSpec and documentation

- [x] 6.1 `specs/authoritative-lockstep/spec.md`
- [x] 6.2 `specs/direct-challenge/spec.md`
- [x] 6.3 `specs/universe-persistence/spec.md`
- [x] 6.4 `specs/hetzner-deployment/spec.md` — requirements only, no endpoints, no placeholder secrets
- [x] 6.5 `tasks.md`, `design.md`; `openspec validate pvp-server --strict` passes
- [x] 6.6 Record the roadmap-order decision without reordering the roadmap table

### 7. Gate

- [x] 7.1 `npm run verify` green
- [ ] 7.2 Push `w10/server-contracts`
