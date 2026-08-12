# `pvp-server` — tasks

Checked items are done on branch `w10/server-contracts`. Unchecked ones are specified here and
built elsewhere — this change was taken out of roadmap order to fix the contracts first, which is
the same role `core-contracts` played as change #2.

## 1. The package and its boundary

- [x] 1.1 `packages/server` with its manifest, tsconfigs and AGPL headers
- [x] 1.2 Root `tsconfig.json` references and the `vitest.config.ts` alias
- [x] 1.3 `server: { value: ['agent-api'], typeOnly: [], testOnly: ['sim-core', 'state'] }` in the
      §5 dependency-graph test — the edge §5 already draws, taken literally
- [x] 1.4 `package-lock.json` regenerated with `npm install`
- [x] 1.5 A boundary test asserting zero third-party runtime dependencies, the AGPL header on every
      source file, and that `Date.now` appears exactly once in the package

## 2. The wire contract

- [x] 2.1 `PROTOCOL_VERSION`, verbs, notices, error codes, rejection reasons — all permanent
- [x] 2.2 `MatchContract` with a structural/advisory split, `contentRevision` structural
- [x] 2.3 Newline-delimited JSON framing with a **bounded** reader
- [x] 2.4 `SnapshotPayload` pinned to `mmsn-base64`, with `kind` separating world from engagement
      transport per §1.6 — declared, and unused in v1
- [x] 2.5 `UniverseRef` and `challengeEligibility`: persisted identity and the single reachability
      predicate

## 3. Ordering, admission, and the authoritative tick

- [x] 3.1 Canonical batch ordered by `(slot, sequence)`, with arrival time recorded nowhere
- [x] 3.2 A missing action becomes an explicit no-op, flagged, distinguishable from a refusal
- [x] 3.3 Boundary screening against the legality mask before the core sees an action
- [x] 3.4 Frame-rate and per-tick submission budgets; disconnection on the former
- [x] 3.5 The ruleset freeze named distinctly from an ordinary mask refusal
- [x] 3.6 Pacing split per layer, mode read from §4.1's declared clock channel, reported per slot

## 4. Desync

- [x] 4.1 Comparison against `AgentSession.snapshotHash()`, reusing the one hash the project has
- [x] 4.2 Hard, reported to every participant, logged with both hashes, terminal
- [x] 4.3 No correction path — asserted behaviourally and structurally

## 5. Transport and the multi-process path

- [x] 5.1 `node:net`, zero dependencies, loopback by default, port 0 in tests
- [x] 5.2 `bin/serve.mjs` — argv and the dynamic scenario import, so `scenario` stays a leaf
- [x] 5.3 `bin/agent.mjs` — a reference participant that mirror-simulates
- [x] 5.4 In-process match tests driving the same `MatchHost` the socket drives
- [x] 5.5 End-to-end: a server process and two agent processes play the reference universe to a
      terminal state and agree on every slot's hash
- [x] 5.6 A recorded batch log replayed in a fresh match reproduces the same final hashes

## 6. Specification

- [x] 6.1 `authoritative-lockstep`
- [x] 6.2 `direct-challenge`
- [x] 6.3 `universe-persistence`
- [x] 6.4 `hetzner-deployment`
- [x] 6.5 `design.md`: what the documents already answered, what was decided, what is still open
- [x] 6.6 The roadmap-order decision recorded without reordering the roadmap table

## 7. Specified here, built elsewhere

These have requirements above and no implementation. Each is blocked on something that does not
exist yet, named beside it.

- [ ] 7.1 Persist universes at run boundaries — needs a storage layer; the wire's bootstrap is
      already the shape a persisted universe would replay from
- [ ] 7.2 Prestige carry-forward at the ascension and stagnated bases — needs `god-agency`
- [ ] 7.3 Transfer on conquest, and respawn into a different cluster — needs `raid-engagement` for
      a raid to be able to extinguish a universe at all
- [ ] 7.4 Engagement transport: carrying a raid across the wire — needs `raid-engagement`. Nothing
      supplies `portalTargets` today, so `openPortal` is permanently masked and no raid can fire.
      **This work must not fake a portal target to appear finished.**
- [ ] 7.5 Reconnection within a window, and the disconnect rule — an open question in `design.md`,
      not a missing implementation. Do not invent the rule.
- [ ] 7.6 The 1,000-match harness and the zero-desync measurement — the replay path exists; what
      remains is running it a thousand times and counting
- [ ] 7.7 `hcloud` provisioning, supervision, backups and the deployment document
- [ ] 7.8 Tune the four pacing constants against a real link's observed round-trip time
