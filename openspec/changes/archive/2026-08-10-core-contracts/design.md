## Context

`docs/design/contracts.md` is the normative specification of the shared interface layer. This
change implements it. The design decisions below explain *why* the contracts take the shape they
do; the contract document itself is the reference and is not duplicated here.

The forcing constraint is parallelism. The user intends a wide, agent-driven build across
`knowledge-model`, `mages-and-species`, `agent-interface`, `god-agency`, and `raid-engagement`.
Those are independent only to the extent that they share data shapes rather than code. Everything
here exists to make that sharing precise enough to build against blind.

## Goals / Non-Goals

**Goals:**

- One definition of world state, consumed by every rules package.
- Content that is data, validated on load, with malformed content failing loudly.
- One implementation of ruleset arbitration, primitive stacking, and RNG stream assignment.
- An observation/action space fixed enough for reinforcement learning to consume unchanged.
- Module boundaries enforced by a test rather than by documentation.

**Non-Goals:**

- Game rules. No research, teaching, combat, or economy logic lands here — only the shapes those
  systems agree on.
- Content beyond the v1 subset. The *schema* covers all 70 cells; the *data* covers 12.
- Tuning. Every magnitude in the v1 content is a placeholder awaiting the balance harness.

## Decisions

### Content is data, and invalid content is a crash

The loader rejects malformed content rather than skipping it. A silently-dropped node is a balance
defect that manifests weeks later as an unexplained shift in a Monte Carlo baseline, and tracing it
back is miserable. Failing at load makes it a thirty-second fix.

*Alternative considered:* permissive loading with warnings. Rejected — warnings are invisible in a
worker pool running thousands of headless simulations.

### String IDs in files, integers at runtime

Content authors work with `"rego-corpus"`. The simulation works with `uint16`. Interning happens
once at load, and the mapping is stable and serialized into snapshots.

This buys three things at once: readable diffs on content changes, compact state, and deterministic
iteration — string keys in a hash map would reintroduce ordering nondeterminism through the back
door, which is exactly the class of bug `sim-core-foundation` exists to prevent.

### One arbitration function, called by everyone

`permits(universe, cellId)` is implemented once, with interdiction beating dispensation. The raid
engine, the client's UI graying-out, the agent legality mask, and the research system all call it.

*Alternative considered:* letting each consumer evaluate the bitmasks inline, since the rule is
three lines. Rejected — the rule is three lines *today*. The moment a fourth precedence case
appears, four copies drift, and the one that drifts is the client's, so the player is told they
can cast something the server refuses. Divergent rule copies are how strategy games ship
unactionable bug reports.

### Populace is aggregated; only mages are individuals

A performance contract, stated normatively so no capability quietly violates it. Individual
simulation of a whole population is what would make Monte Carlo unaffordable, and the cost of
discovering that after `mages-and-species` is written is a rewrite of its hot loop.

### Stacking rules are declared per primitive, in one table

The single most likely silent disagreement between two implementers is whether two `+20%`
research bonuses produce `+40%` or `+44%`. Every primitive therefore declares its rule and its cap
explicitly, and the arithmetic is implemented once and shared.

Caps exist because the design contains two compounding loops — worship (vision §7) and
knowledge-as-capital (vision §6a) — that feed each other. Uncapped multiplicative rates on top of
that is a runaway generator. The caps are set to be *reachable*, so the harness measures behaviour
at the cap rather than discovering it in live play.

### Fixed-shape observation, masked discrete actions

The observation vector's shape is constant across runs and universes, because a reinforcement-
learning agent cannot consume a variable-length one. Variable-length data — the knowledge graph,
the mage roster — is bucketed and summarized rather than emitted raw.

Illegal actions return a no-op plus a counter, never an exception. RL agents submit illegal actions
constantly during early training; that path must be cheap, and its rate is a useful signal in its
own right (a high `illegalActionRate` usually means the mask or the spec is unclear).

*Alternative considered:* a rich structured action API, more pleasant for scripted bots. Rejected —
scripted bots can wrap a discrete space easily, while RL cannot wrap a structured one. The
constraint runs one way, so the interface follows it.

### Normalization happens at the agent-api boundary

The core emits integers. The agent-api layer normalizes to `[0, 1024]` on the way out, and this is
the one place floating-point is permitted on the export path. Keeping normalization out of the core
preserves the float ban where it matters.

### RNG streams are append-only

Subsystem IDs are permanent. Renumbering one silently re-rolls every simulation that uses it and
invalidates every committed balance baseline — with no error, no test failure, and no obvious
symptom beyond baselines that quietly stopped meaning anything.

### Boundaries enforced by test

A dependency-graph test asserts the module rules. Documented-only boundaries are boundaries that
have already been violated somewhere.

## Risks / Trade-offs

- **Contracts written with limited implementation experience will be wrong somewhere** → Scope is
  restricted to what genuinely must be shared; `contracts.md` §8 lists what is deliberately left
  open. `sim-core-foundation` lands first as a proving run.
- **A contract change after this lands is expensive** → Intentional. It should be visible and
  deliberate. The mitigation is that contracts fix *shapes and units*, not *values* — tuning
  numbers move freely without touching this layer.
- **The fixed observation shape will need to grow** (new forms, new species) → Sized from the
  full 70-cell, 6-species, 7-tier space from the start, not from the v1 subset, so v1 emits a
  sparse vector rather than one that must be resized later.
- **Aggregated populace limits per-person storytelling** → Accepted. Mages are the characters;
  the populace is an economy. If individual commoners ever matter, that is a contract change with
  a known performance cost, not a quiet refactor.

## Migration Plan

Additive on top of `sim-core-foundation`. No existing behaviour changes. Rollback is reverting the
branch; nothing depends on this layer yet at the time it lands.

## Open Questions

- Which 12 cells form the v1 subset? Owned by `knowledge-model`, constrained here only to include
  `rego-limen`. This change ships the schema and a placeholder selection that `knowledge-model`
  may replace.
- Does the engagement observation block need to grow beyond 64 slots for larger raids? Answered by
  `raid-engagement` once combatant counts are known; the block is fixed-size and padded, so growing
  it is a versioned contract change rather than a structural one.
