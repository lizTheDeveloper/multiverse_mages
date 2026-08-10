## Why

The remaining capabilities — `knowledge-model`, `mages-and-species`, `agent-interface`,
`god-agency`, `raid-engagement` — are largely independent *provided they agree on shared data
shapes*. Without that agreement they cannot be built concurrently, because each would invent its
own version of the state, the content format, and the meaning of an effect primitive, and the
project would spend more time reconciling than it saved parallelizing.

This change turns `docs/design/contracts.md` into executable, enforced artifacts: types, validated
schemas, and CI checks. It is the gate that makes a wide parallel build possible, and it is the
cheapest place to catch a disagreement — a mismatch caught by a schema validator costs minutes,
the same mismatch caught after three capabilities are written costs a rewrite.

## What Changes

- Add `packages/content` holding all game content as validated JSON, plus a loader that interns
  string IDs to integers and **fails hard** on invalid content rather than warning.
- Publish TypeScript type definitions for the complete world state per `contracts.md` §1,
  including the split between individual mages and aggregated populace cohorts, and the rule that
  world-scale entities carry no coordinates.
- Implement the single `permits(universe, cellId)` ruleset-arbitration function, and require every
  consumer to call it rather than reimplementing the technique/form/edict precedence.
- Publish JSON Schema definitions for techniques, forms, cells, nodes, species, traditions, and
  primitives, with a validation CLI runnable in CI.
- Encode the effect-primitive table — unit, scale, and stacking rule — as data, with the stacking
  and cap arithmetic implemented once and shared.
- Define the fixed-shape observation vector and the discrete, masked action space, including the
  rule that rules-changing actions are masked out during engagement.
- Register the RNG subsystem stream IDs as an append-only enumeration.
- Add a dependency-graph test asserting the module boundary rules in `contracts.md` §5.
- Author the content **schema** for all 70 cells and the **data** for the v1 subset only.

## Capabilities

### New Capabilities

- `state-schema`: TypeScript types and component layout for world and engagement state, plus the
  ruleset arbitration function.
- `content-schemas`: JSON Schemas for all content types, the loader, ID interning, and hard-fail
  validation.
- `primitive-semantics`: the effect-primitive registry with units, scales, stacking rules, and caps
  implemented once.
- `observation-action-space`: the fixed-shape observation vector, the discrete action space, and
  the legality mask.
- `module-boundaries`: the package dependency graph and the CI test that enforces it.

### Modified Capabilities

None. `sim-core-foundation` is unaffected — it is content-free by design, and these contracts sit
on top of it.

## Impact

- **New:** `packages/content/`, shared type definitions consumed by every rules package,
  `schemas/*.json`, a validation CLI, a dependency-graph test.
- **Depends on:** `sim-core-foundation` for the entity store, fixed-point helpers, and PRNG.
- **Downstream:** every subsequent capability. Changing a contract after this lands is a breaking
  change across the whole tree, which is the point — it should be expensive and visible.
- **Risk accepted:** these contracts are written with limited implementation experience. Mitigated
  by fixing only what must be shared (§8 of `contracts.md` lists what is deliberately left open)
  and by landing `sim-core-foundation` first as a proving run.
