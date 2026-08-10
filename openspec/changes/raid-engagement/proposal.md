## Why

Everything built through 0.6.0 produces a single universe that runs, grows, forgets, and is
measurable — but has nobody to fight. The vision's load-bearing mechanic (§3, *the host universe's
ruleset governs all magic cast inside it, for both attacker and defender*) has no expression at all
until two universes can be placed in the same sky, and until then the god's central decision —
which magic exists — is a solitaire optimisation rather than a strategy. Permitting *Ignem* only
means something once it arms an invader standing in your realm.

This change makes universes able to fight, and it does so under the strictest claim in the release
plan: across 10,000 Monte Carlo raids, a spell forbidden in the host universe resolves **zero**
times, and **zero** raids exceed portal stability. Both claims are only provable if arbitration has
exactly one choke point and termination is structural rather than probable, so the specs below are
written to make those two properties testable rather than asserted.

## What Changes

- Add `packages/rules-raid`, the coordinating layer above `rules-magic` and `rules-world` per
  `contracts.md` §5, holding all engagement-scale behaviour.
- Introduce the **ruleset snapshot**: an immutable value carrying a universe's
  `permittedTechniques`, `permittedForms`, `edicts`, and `traditionId`, captured from both
  participants at portal open. Arbitration during a raid reads the snapshot, never the live
  universe. This is how frozen policy (vision §3) is enforced structurally, and it is also how a
  raid pairs two universes without contradicting `contracts.md` §1.1, which declares `Universe` a
  singleton.
- Implement portal opening: gated on the attacker's universe permitting `rego-limen`, on a living
  attacker mage holding a node carrying the `portal` primitive, and on favor. Pairs two persisted
  world snapshots and switches the clock to engagement mode, pausing world time for both.
- Implement **host-ruleset arbitration** as a two-layer enforcement: a per-combatant legal-node mask
  precomputed once at entry from the host's frozen snapshot, plus an unconditional `permits()`
  assertion at the single cast-resolution choke point that increments an invariant counter which
  must read zero. Attacker and defender are bound identically.
- Implement the tradition hook split across a portal: `acquire` and `store` follow each combatant's
  **home** tradition; `cast` and `cost` follow the **host's**, for both sides.
- Add the engagement-only spatial layer: a 200 m × 200 m battlefield, a generated terrain grid with
  passability and line-of-sight blocking, a uniform-grid spatial index, squared-distance range
  tests, and integer line-of-sight tracing. All of it is created at portal open and discarded at
  resolution; no world-scale entity gains coordinates.
- Specify combat resolution math — the thing `contracts.md` §8 explicitly leaves to `rules-raid`:
  tick phase order, targeting, concealment as an acquisition-time evasion roll, additive
  `direct-damage` summed before a single multiplicative-on-remainder `ward` application, per-tick
  `area-denial`, capped `blink`, and per-side-capped `summon`.
- Implement objectives — libraries, universities, archmages — generated from the defender's world
  state, and the portal stability timer whose decrement is unconditional, authored as a raw integer,
  and validated at load so that a non-terminating raid is structurally impossible.
- Implement raid consequences written back to world state atomically: permanent mage casualties,
  populace-cohort losses, destroyed knowledge instances, looted grimoires, and node loss when the
  last instance dies or burns.
- Implement cell-gated knowledge theft concentrated in `intellego-mentem` and `rego-nomen`, gated by
  the host's `permits`, resolved on RNG stream 9, and retained only by a raider who leaves through
  the portal alive.
- Fill the 64-slot engagement observation block left undefined by `core-contracts`, and close that
  change's open question about whether the block must grow.

**BREAKING:** none. This change is additive over 0.6.0. It does, however, depend on five proposed
amendments to `contracts.md` §1.6 (recorded in `design.md` Open Questions) without which raid state
cannot carry its own termination bound.

## Capabilities

### New Capabilities

- `portals`: opening and closing a portal, gating on `rego-limen` and the `portal` primitive,
  pairing two persisted universe snapshots, capturing immutable ruleset snapshots, switching the
  clock to engagement mode and pausing world time for both participants, forbidding nested raids,
  and the frozen-policy rule for the raid's duration.
- `host-ruleset-arbitration`: the single legality choke point. Every spell cast inside a universe is
  legal only if that universe permits its cell, evaluated through `permits()` against the host's
  frozen ruleset snapshot, symmetrically for attacker and defender; plus the tradition hook split
  across the portal and the invariant counter that makes the zero-occurrence claim measurable.
- `raid-space`: the engagement-only positional layer — battlefield extent, terrain generation,
  spatial index lifecycle, movement and `blink` displacement, range by squared distance, integer
  line of sight, deployment, and the derivation of combatants from world state on entry.
- `raid-objectives`: objective kinds, generation from the defender's world state, capture and
  destruction, the portal stability timer, the termination guarantee and its load-time validation,
  victory determination as a total function, and the engagement observation block.
- `raid-consequences`: atomic write-back to world state — permanent casualties, cohort losses,
  destroyed and looted knowledge, node loss on last-instance destruction, cell-gated knowledge
  theft and its retention rule, and the raid outcome record consumed by the balance harness.

### Modified Capabilities

None. This change consumes `state-schema`, `primitive-semantics`, `observation-action-space`,
`magic-grid`, `knowledge-instances`, `magic-traditions`, `mage-autonomy`, and `favor-economy`
without changing any of their requirements. The proposed `contracts.md` §1.6 additions are recorded
as open questions rather than as edits, because `contracts.md` is normative and amending it is a
deliberate act owned by `core-contracts`.

## Impact

- **New:** `packages/rules-raid/` — engagement state lifecycle, arbitration gate, spatial layer,
  combat resolution, objectives and termination, consequence write-back, theft.
- **Depends on:** `sim-core-foundation` for the dual-scale clock, the entity store, splittable RNG,
  and snapshots; `core-contracts` for `permits()`, the primitive registry and its stacking
  arithmetic, and the observation/action space; `knowledge-model` for cells, nodes, knowledge
  instances, and tradition hooks; `mages-and-species` for species traits, mage state, populace
  cohorts, universities, and the utility-AI that drives combatants; `god-agency` for favor and for
  the ruleset the raid arbitrates against.
- **Downstream:** `gym-bridge` and `electron-client` consume the engagement observation block;
  `pvp-server` reuses raid pairing and determinism wholesale — a raid is already specified here as a
  reproducible function of `(attacker snapshot, defender snapshot, raid seed)`, which is precisely
  what lockstep needs.
- **Balance:** this change is the first to emit `raidLengthDistribution` and to move
  `libraryDependence`, and the first to make `winRateByPrimitive` meaningful for the five combat
  primitives, which have had no site of application until now.
- **Risk accepted:** every combat magnitude in this change is an untuned placeholder. Marked as such
  throughout, and unblocked by the harness delivered in 0.5.0 rather than by judgement here.
