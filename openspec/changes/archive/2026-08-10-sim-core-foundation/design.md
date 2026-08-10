## Context

Multiverse Mages has four independent consumers of one simulation: the Monte Carlo balance
harness, the Electron client, the authoritative PvP server, and a later Python RL bridge. The
project's central design priority — balance the game by machine play before making it
attractive — is only achievable if all four agree, exactly, on what the simulation does.

There is no existing code. This change establishes the substrate and nothing else: no magic, no
mages, no species. The game rules land in `knowledge-model` and `mages-and-species` on top of
this contract.

The binding constraint is that **live real-time PvP and Monte Carlo balancing both require bit
determinism**, for different reasons — lockstep netcode desyncs without it, and replayable MC
results are meaningless without it. Determinism therefore has to be a property the substrate
enforces, not a discipline later authors are asked to remember.

## Goals / Non-Goals

**Goals:**

- A pure, dependency-free `@mm/sim-core` package exposing `step(state, actions, rng) -> state`.
- Bit determinism across platforms and Node versions, continuously proven by golden-replay tests
  rather than asserted in documentation.
- A dual-scale world clock (world months / engagement ticks) with pause semantics, so
  `raid-engagement` can be built later without reworking time.
- Versioned snapshots that survive schema evolution, since the state shape will change in every
  subsequent change.
- An empirical answer to "how many mages can a universe hold?", via a benchmark harness.
- A core written such that porting the hot loop to Rust later would not touch game design.

**Non-Goals:**

- Any game content. The entity store is generic; it knows nothing about magic.
- Networking, matchmaking, or persistence to disk beyond serializing to and from a buffer.
- Rendering, or any awareness that a renderer exists.
- Performance optimization beyond establishing the benchmark and meeting a floor. Optimizing
  before knowing the real entity mix would be guessing.

## Decisions

### Purity enforced mechanically, not socially

The core has zero runtime dependencies, performs no I/O, and is forbidden from importing Node
built-ins. `Math.random`, `Date.now`, `new Date()`, `performance.now()`, and `Intl` are banned
inside `packages/sim-core/src` by ESLint `no-restricted-globals` / `no-restricted-syntax` rules
that fail CI.

*Alternative considered:* convention plus code review. Rejected — this is exactly the class of
rule that erodes silently over a year of feature work, and its violation is invisible until a
desync or an irreproducible MC result appears months later.

### Fixed-point integers, no floats in the rules path

All rules-path arithmetic uses `int32`/`int64`-domain fixed-point with an explicit scale
(1/1024). Division rounds toward negative infinity with a single shared helper so rounding is
uniform. Floats are permitted only in the analysis layer that consumes MC output and in the
renderer.

*Alternative considered:* IEEE-754 doubles, which are deterministic within a single engine for
`+ - * /`. Rejected because the moment someone reaches for `Math.pow`, `Math.sqrt`, or a
trig function — likely, in a game with area effects and distance falloff — cross-platform
determinism is gone, and the failure is silent and rare. Banning floats outright removes the
category. The cost is that designers write `mul(a, b)` instead of `a * b`.

### `step` is pure; callers own time

`step(state, actions, rng) -> state` takes no wall-clock input and returns a new state. The
Electron client drives it from a render loop, the MC harness drives it as fast as possible, and
the PvP server drives it on a fixed schedule. None of them can change what a tick means.

State is treated as immutable at the API boundary. Internally, `step` may mutate a working copy
for performance; it must never mutate the state passed in.

*Alternative considered:* an ECS framework (bitECS, Miniplex). Rejected for v1 — every mature
option brings either floating-point assumptions, iteration orders that are not guaranteed
stable, or a dependency we would have to audit for determinism. The entity needs here are
modest and well-understood.

### Entity store: struct-of-arrays with generational handles

Entities are integer IDs indexed into parallel typed arrays, with a generation counter per slot
so a stale handle to a dead mage is detectable rather than silently aliasing a new one.
Iteration order is index order, always — never insertion order, never hash order, never
`Object.keys`.

Freed slots are reused from a deterministic free list. This matters more than it looks:
non-deterministic ID assignment is the most common way a simulation like this desyncs.

*Alternative considered:* array-of-objects with `Map`. Simpler to write, but `Map` iteration
order depends on insertion history, and object-per-mage allocation churn is exactly what would
make the MC harness too slow to be useful.

### Splittable PRNG, one stream per subsystem

A counter-based splittable PRNG (PCG-family, 64-bit state via `BigInt`-free `Uint32Array`
arithmetic). Each subsystem draws from a stream derived deterministically from
`(rootSeed, subsystemId, tick)`.

This is what lets a later change add, say, weather rolls without shifting every downstream
random draw and invalidating every committed balance baseline. Without stream splitting, adding
one `rng()` call anywhere silently re-rolls the entire game.

### Dual-scale clock built now, raids built later

The clock carries `worldTick` (one month), `engagementTick` (fast combat), and an explicit mode.
Entering engagement mode freezes `worldTick` advancement. `raid-engagement` will use this; this
change only builds and tests the mechanism.

*Alternative considered:* a single clock, with raids as fast-forwarded world time. Rejected —
it couples raid pacing to world pacing forever, and the user's chosen model explicitly pauses
world time during a raid.

### Snapshots: versioned, tagged, and self-describing

Snapshot format carries a schema version and a per-component tag table. Deserializing an older
snapshot runs registered migrations in sequence. Snapshots are the unit of PvP raid pairing and
of MC run seeding, so they are load-bearing, not a convenience feature.

*Alternative considered:* `JSON.stringify` of state. Rejected — key ordering is stable in V8 for
string keys but is not a specified guarantee to build byte-identity assertions on, and the size
would make MC result storage unpleasant.

### Golden replay as the determinism test

A recorded `(seed, action log)` must reproduce a byte-identical final snapshot hash. Committed
golden fixtures run in CI. Any nondeterminism introduced by any future change fails this test
immediately, in the change that caused it, which is the only time it is cheap to fix.

## Risks / Trade-offs

- **Designing the entity store before the game rules exist** → Kept generic and component-shaped;
  the benchmark harness will surface a bad fit early, while the cost of changing it is one
  package rather than nine.
- **Fixed-point math is more awkward to write than floats** → Accepted deliberately. Provide a
  small, well-documented, well-tested helper module so the awkwardness is bounded to `mul`,
  `div`, and `lerp` rather than spread through rules code.
- **Golden fixtures become churn-heavy if regenerated casually** → Regenerating a golden fixture
  requires an explicit command and shows a diff in review. A regenerated golden is a claim that
  behavior changed on purpose, and reviewers should treat it as one.
- **Bit determinism across Node versions is not free** → Mitigated by the float ban and by
  running the golden suite in CI on the pinned Node version, with a second job on the next major
  as an early warning.
- **The benchmark may reveal TypeScript is too slow for the desired population** → This is the
  reason the core is dependency-free and float-free: the port path to Rust stays open, and the
  benchmark tells us before nine capabilities are built on top.

## Migration Plan

Not applicable — this is the first change in a new repository. Rollback is reverting the branch.

## Open Questions

- What is the target mage population for a mature universe? Deliberately unanswered; the
  benchmark harness in this change produces the number, and `mages-and-species` consumes it.
- Should snapshots be delta-compressed against a baseline for PvP transport? Deferred to
  `pvp-server`, which is the only consumer with a bandwidth constraint. The format's version
  tagging leaves room for it.
