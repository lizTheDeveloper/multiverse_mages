## Why

Every other capability in Multiverse Mages — the balance harness, the Electron client, the
authoritative PvP server, and the eventual RL bridge — is a *consumer* of one simulation. If
those consumers each carry their own notion of how time advances or how randomness is drawn,
the game will disagree with itself, and the Monte Carlo results the whole project depends on
will be measuring something the player never experiences.

This change builds that single simulation substrate and, critically, proves it is deterministic
before any game rules are written on top of it. Determinism is cheap to establish now and
ruinously expensive to retrofit once forty schools of magic depend on it.

## What Changes

- Establish the npm workspaces monorepo with a `@mm/sim-core` package that has **zero runtime
  dependencies** and performs no I/O.
- Implement a fixed-timestep simulation loop exposing a pure `step(state, actions, rng) -> state`
  contract. Callers own wall-clock time, scheduling, persistence, and presentation.
- Implement a seeded, splittable PRNG. Ban `Math.random`, `Date.now`, and `new Date()` from the
  core by lint rule, enforced in CI.
- Implement fixed-point integer arithmetic helpers for all rules-path math. Floating-point is
  prohibited in the core and permitted only in analysis and presentation layers.
- Implement a compact entity store (typed entity records with stable integer IDs, generational
  handles, and deterministic iteration order) sized for thousands of mages.
- Implement the world clock with two scales — world time (months) and engagement time (fast
  ticks) — including the pause semantics that a raid will later require. The raid itself is not
  in this change; the clock that makes it possible is.
- Implement versioned snapshot serialization and deserialization of complete world state.
- Implement an action log recorder and a replayer, plus a golden-replay test harness asserting
  that `seed + action log` reproduces a byte-identical final snapshot.
- Establish the benchmark harness that answers the open question of how many entities the
  simulation can carry per second, which sets the population budget for later changes.

No game rules — no magic, no mages, no species — are introduced here. The entity store is
generic; content lands in later changes.

## Capabilities

### New Capabilities

- `simulation-core`: The deterministic fixed-timestep simulation substrate — the pure step
  contract, seeded PRNG, fixed-point arithmetic, entity store, and dual-scale world clock.
- `world-persistence`: Versioned serialization of complete world state to and from snapshots,
  including forward-compatibility rules for schema evolution.
- `deterministic-replay`: Action-log recording, replay, and the golden-replay verification
  harness that continuously proves determinism.

### Modified Capabilities

None. This is the first change in the project.

## Impact

- **New:** `packages/sim-core/`, `packages/sim-core/bench/`, root workspace configuration,
  TypeScript strict configuration, Vitest setup, ESLint rules enforcing core purity, CI
  workflow running unit tests and the golden-replay suite.
- **Dependencies:** Node 22+. Vitest, ESLint, and TypeScript as development dependencies only;
  `@mm/sim-core` itself ships with no runtime dependencies.
- **Downstream:** establishes the contract that `knowledge-model`, `mages-and-species`,
  `agent-api`, `mc-harness`, `god-agency`, `raid-engagement`, `electron-client`, and
  `pvp-server` all build against. Changing the step contract later is a breaking change for
  every one of them.
- **Risk accepted:** the entity store and snapshot format are being designed before the game
  rules that will populate them. Mitigated by keeping both generic and by the benchmark
  harness, which will tell us early if the shape is wrong.
