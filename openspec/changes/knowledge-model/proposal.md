## Why

`core-contracts` fixes the *shapes* of the magic grid, the node schema, and the knowledge instance,
but nothing yet gives them behaviour: no node can be researched, no knowledge can move between a
mind and a page, and nothing can be forgotten. Until that exists, the game's second pillar —
knowledge is physical, and it can be lost — is a claim in a document rather than a property of a
running simulation.

This change makes the grid mechanical and the knowledge lifecycle real, and it settles the one
content decision `contracts.md` §8 explicitly defers: which 12 cells form the v1 subset.

## What Changes

- Select the **v1 12-cell subset**: techniques `intellego`, `perdo`, `rego` × forms `limen`,
  `mentem`, `nomen`, `terram`. Includes `rego-limen` as required. Justified in `design.md`.
- Define what a **permitted** cell means beyond casting: the three world-time knowledge
  operations — research, teaching, scribing — are gated by `permits()`, so forbidding a cell has a
  civilizational cost and is not a free defensive play.
- Define **dormancy**: instances of a node whose cell is not permitted persist, count toward the
  node's existence, and are unusable and untransmittable. Dormant mind and palace instances decay
  without a floor, so an interdiction erases knowledge slowly and visibly rather than instantly.
- Implement the four knowledge operations — **research**, **teaching** (mind → mind), **scribing**
  (mind → grimoire), and **rediscovery** — each drawing from its registered RNG stream.
- Implement **mastery**: how it rises, how it decays, the species-retention floor that bounds decay,
  and the thresholds that govern teaching eligibility and transmission loss.
- Implement **knowledge loss**: destroying the last instance of a node removes it from the universe,
  observably and by a single derived index, with no cached existence flag anywhere in state.
- Implement **rediscovery** at its declared cost multiplier, with a hard floor of `fp(3072)` on the
  effective multiplier so the 0.3.0 release claim is literally verifiable. **BREAKING** relative to
  a naive reading of `contracts.md` §2.4, where species `rediscoveryAffinity` could push effective
  cost below the floor; see `design.md`.
- Resolve the grimoire/library location question left open by `contracts.md` §1.5, and publish
  **library depth** as a function of the knowledge subsystem — the input to the knowledge-as-capital
  loop of `vision.md` §6a — for `mages-and-species` to apply.
- Define the **effect application pipeline**: which held instances contribute which primitive
  effects, to whom, and at which scale, delegating all unit, stacking, and cap arithmetic to the
  shared implementation from `core-contracts`.
- Implement **traditions** as exactly four hooks over a closed, enumerated set of hook kinds —
  `standard`, `prepared`, `prepaid`, `palace`, `true-name` — and author the three v1 traditions
  (Vancian memorization, True Naming, the Art of Memory) using only those hooks.
- Define **cross-portal hook arbitration**: `acquire` and `store` follow the mage's home tradition,
  `cast` and `cost` follow the host, per `vision.md` §4a. The rule ships as a pure function here;
  `raid-engagement` consumes it.

## Capabilities

### New Capabilities

- `magic-grid`: the technique × form grid as a mechanical structure — the v1 12-cell subset, node
  graphs and tiers within a cell, prerequisite traversal, the consequences of a cell being permitted
  or forbidden, and dormancy.
- `magic-primitives`: the pipeline from held knowledge instances to applied primitive effects —
  which instances contribute, at which scale, to which subject — on top of the units, stacking
  rules, and caps owned by `primitive-semantics`.
- `knowledge-instances`: the knowledge lifecycle — research, teaching, scribing, mastery and its
  decay, instance location including the grimoire/library resolution, loss when the last instance is
  destroyed, rediscovery, and the published library-depth function.
- `magic-traditions`: the four-hook tradition model, the closed hook-kind enumeration, the three v1
  traditions, and cross-portal hook arbitration.

### Modified Capabilities

None. `state-schema`, `content-schemas`, and `primitive-semantics` are consumed unchanged; this
change adds behaviour on top of them and authors content into the schemas they already define.

## Impact

- **New:** `packages/rules-magic/` — grid legality consumption, node graph traversal, the knowledge
  operations, the effect application pipeline, and the tradition hook implementations.
- **Content:** the v1 flags on 12 cells, node graphs for those cells, and the three tradition
  records, all authored into `packages/content` against the schemas `core-contracts` ships.
- **Depends on:** `core-contracts` for state types, `permits()`, the content loader, primitive
  stacking, and RNG stream IDs; `sim-core-foundation` for the entity store, fixed-point helpers,
  and PRNG.
- **Module boundary:** `rules-magic` must not import `rules-world`. Every knowledge operation
  therefore takes its species and populace inputs — learn rate, scribe affinity, retention,
  available scribes, materials — as parameters supplied by the coordinating layer, and treats mage
  handles as opaque.
- **Downstream:** `mages-and-species` drives these operations and applies library depth;
  `god-agency` toggles the axes that gate them; `raid-engagement` destroys instances and consumes
  the hook-arbitration function.
- **Not claimed:** nothing here is a balance claim. Per `docs/design/release-plan.md`, no claim
  about balance is verifiable before 0.5.0, so every magnitude authored in this change is an
  explicitly untuned placeholder.
