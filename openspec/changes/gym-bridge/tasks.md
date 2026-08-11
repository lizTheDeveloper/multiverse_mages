## 1. Package and boundary

- [ ] 1.1 Scaffold `packages/gym-bridge` per `contracts.md` §5, declaring `@mm/agent-api` as its only workspace dependency and `AGPL-3.0-or-later` with Ann Kelner as author
- [ ] 1.2 Add `gym-bridge` to the §5 `ALLOWED` table in `packages/sim-core/test/unit/module-boundaries.test.ts`, granting `agent-api` by value and `sim-core` as types only, with the reason written beside it
- [ ] 1.3 Add the leaf assertion: nothing in the workspace imports `@mm/gym-bridge`
- [ ] 1.4 Register the package in the root `tsconfig.json`, its test project, and `vitest.config.ts`'s source alias table
- [ ] 1.5 Regenerate `package-lock.json` with `npm install` so `npm ci` and both CI jobs resolve the new workspace
- [ ] 1.6 Add the package-boundary test: no third-party runtime dependency, the declared licence and author, and coverage by the workspace dependency-graph test

## 2. Frame vocabulary and codec

- [ ] 2.1 Declare `PROTOCOL_VERSION` and the verb set — `hello`, `describe`, `reset`, `step`, `close` — as permanent identifiers, with the renumbering warning §4.2 gives its own action ids
- [ ] 2.2 Declare the error-code set — `malformed-frame`, `unknown-verb`, `handshake-required`, `contract-mismatch`, `unknown-env`, `no-episode`, `episode-over`, `bad-request` — and the rule that only `contract-mismatch` is fatal
- [ ] 2.3 Implement `encodeFrame` as one line of JSON with exactly one trailing `\n`, rejecting any value JSON cannot carry faithfully
- [ ] 2.4 Implement `decodeFrame` and a chunk-fed line splitter that tolerates a split arriving mid-line and never emits a partial frame
- [ ] 2.5 Implement request-id echo, so a response names the request it answers
- [ ] 2.6 Unit test the round trip: every frame shape encodes and decodes to an equal value, with one newline per line
- [ ] 2.7 Unit test that malformed input yields one `error` frame and leaves the bridge answering the next frame
- [ ] 2.8 Unit test that an unknown verb is named in the refusal and the accepted verbs listed

## 3. The observation contract and the handshake

- [ ] 3.1 Implement the published contract block: protocol version, observation schema version, layout digest, observation size, action space size, per-action candidate slot counts, scenario id, content hash, build version
- [ ] 3.2 Implement the structural/advisory split, and the mismatch report naming every disagreeing field with both values
- [ ] 3.3 Implement the handshake state machine: `hello` first, every other verb refused with `handshake-required` before it
- [ ] 3.4 Implement fatal refusal on a structural mismatch — one `error` frame, no observation, non-zero exit
- [ ] 3.5 Implement `describe`, transporting `layoutEncoding(OBSERVATION_SLOTS)` verbatim and the digest beside it
- [ ] 3.6 Unit test that a stale layout digest refuses before any observation is emitted
- [ ] 3.7 Unit test that a changed content hash produces an advisory and runs
- [ ] 3.8 Unit test that all three of three structural disagreements are named in one frame
- [ ] 3.9 Unit test that the transported encoding is identical to `agent-api`'s and hashes to the published digest

## 4. The env vector

- [ ] 4.1 Implement the env host: a fixed `envCount`, one `agent-api` session per index, created from a caller-supplied `Scenario`
- [ ] 4.2 Implement vectorized `reset` — a list of `{env, runSeed, config}` entries returning a list of results in the same order
- [ ] 4.3 Implement vectorized `step` — a list of `{env, action, slot?}` entries returning a list of results in the same order
- [ ] 4.4 Implement `unknown-env` and `no-episode` refusals that leave every env unchanged
- [ ] 4.5 Implement `episode-over`: `step` on a terminated env is refused rather than advancing anything
- [ ] 4.6 Implement `close`, releasing every session and ending the process cleanly
- [ ] 4.7 Unit test that vector width does not change an episode — env 3 of an 8-wide bridge equals a 1-wide bridge at the same seed, tick for tick and hash for hash
- [ ] 4.8 Unit test that an out-of-range env index advances no clock
- [ ] 4.9 Unit test that two envs at different seeds diverge and neither perturbs the other

## 5. Transporting §4 faithfully

- [ ] 5.1 Transport the observation as a JSON number array taken from `session.observe()` with no arithmetic applied
- [ ] 5.2 Transport the legality mask as one entry per action id, the full width of the action space
- [ ] 5.3 Transport the candidate lists per parameterized action as occupied slot indices with their resolved parameter tuples
- [ ] 5.4 Transport the outcome record — `terminal`, `truncated`, `terminalReason`, `era`, `metricDeltas` — and the episode status
- [ ] 5.5 Transport `illegalActionCount` and the session's accounting so `illegalActionRate` is computable from Python
- [ ] 5.6 Transport `snapshotHash` on request and at episode end
- [ ] 5.7 Unit test element-wise equality between the exported vector and the decoded one, with no tolerance
- [ ] 5.8 Unit test that the package contains no normalization: no division, no saturation constant, no rescaling of an observation element
- [ ] 5.9 Unit test that no frame schema and no source file carries a `reward`, `return`, `score` or `fitness` field

## 6. Illegal actions, terminal and truncated

- [ ] 6.1 Implement rejection reporting: `admitted: false` plus the gate's reason in the step result's diagnostics, never an `error` frame
- [ ] 6.2 Confirm a rejected submission still advances the tick and still increments the core's counter
- [ ] 6.3 Implement the two independent booleans on the wire, never one enum
- [ ] 6.4 Unit test that a masked submission is a no-op, a tick, and a count
- [ ] 6.5 Unit test that a stale candidate slot reports `empty-slot` and the episode continues
- [ ] 6.6 Unit test that a rejected no-op leaves the observation element-wise identical to the legal path that reached the same state
- [ ] 6.7 Unit test that a capped run reports `truncated` without `terminal`, and an ascension the reverse
- [ ] 6.8 Unit test that a run ascending on its cap tick reports both flags

## 7. Episode record and replay

- [ ] 7.1 Implement the record format: a header line carrying the full provenance block, then one line per submitted action
- [ ] 7.2 Implement recording from a live bridge session, writing actions and never observations
- [ ] 7.3 Implement replay: read a record, drive a fresh session, compare the final snapshot hash
- [ ] 7.4 Implement replay's contract check — a record whose layout digest differs is refused, not replayed
- [ ] 7.5 Implement refusal of a truncated or headerless record, naming the fault and reporting no hash
- [ ] 7.6 Unit test the release claim: a recorded episode replayed in a fresh process reaches the identical final snapshot hash
- [ ] 7.7 Unit test that a record's header names every provenance key a reader will assume

## 8. The command line

- [ ] 8.1 Implement `bin/serve.mjs`: argument parsing, the dynamic scenario-module import, and the stdin/stdout wiring, with the dynamic import outside `src/` and the reason recorded
- [ ] 8.2 Implement the scenario-module contract — `createScenario()` or `scenario` — and a startup refusal that writes to stderr, emits no frame, and exits non-zero
- [ ] 8.3 Implement `bin/replay.mjs` over the record format
- [ ] 8.4 Implement `bin/throughput.mjs` reporting ticks per second and the split between session step, observation read, frame encode and frame decode
- [ ] 8.5 Make the help text point a caller who wants sweeps, baselines or tournaments at `mm-run-sweep`, rather than growing a second concurrency story
- [ ] 8.6 Add the export the scenario module needs so one file serves both `mm-run-sweep` and the bridge

## 9. The Python reference client

- [ ] 9.1 Scaffold `packages/gym-bridge/python` with `pyproject.toml` declaring `AGPL-3.0-or-later`, no install requirements, and the standard licence header in every source file
- [ ] 9.2 Implement the wire client: subprocess spawn, NDJSON write and read, request-id matching, stderr passthrough
- [ ] 9.3 Implement `EnvSpec` — the frozen contract dataclass, `save`, `load`, `require`, and `ObservationContractError` naming each field with both values
- [ ] 9.4 Implement the FNV-1a digest over the transported layout encoding, in pure Python, and verify it against the bridge's published digest
- [ ] 9.5 Implement `MageEnv` with a **required** `reward_fn`, `reset`/`step`/`close`, and observations as `array.array('d')`
- [ ] 9.6 Implement `rewards.sparse_terminal` as an importable function that no code path applies by default
- [ ] 9.7 Implement `VectorMageEnv` over one bridge process's env vector, and document that parallelism across cores is *M* processes
- [ ] 9.8 Write the Python unit tests — contract refusal, reward requirement, digest re-derivation, vector indexing
- [ ] 9.9 Write `python/README.md` covering how to run the tests, and state plainly that `npm run verify` does not run them

## 10. Closeout

- [ ] 10.1 Run `npm run verify` green, including both balance gates, with golden fixtures unchanged
- [ ] 10.2 Record the throughput figure and its split, and put it where the release claim can cite it
- [ ] 10.3 Confirm every scenario in `specs/rl-bridge/spec.md` has a corresponding passing test, or is named in the report as specified-not-implemented
- [ ] 10.4 Update `docs/design/vision.md` §11 and `docs/design/release-plan.md` if and only if the status of this change moved
- [ ] 10.5 Record in `design.md` any question this change opened that a later change must close
