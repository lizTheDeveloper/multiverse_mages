## Why

The knowledge model treats every node as writable in principle: a mage learns it, a scribe copies
it, a library holds it. That is *episteme* — knowledge that survives being written down. It leaves
no room for the other kind. **Mētis** is the practitioner's knowledge that codification destroys:
the helmsman's feel for a sea he cannot chart, the craft that lives in hands and dies with them.

A game whose central claim is that *knowledge is physical and mortal* (vision §2, §5) currently
models only the half of it that a sufficiently well-funded scriptorium makes immortal. Every
knowledge loss in the game today arrives through a portal or a fire. Nothing is lost in peacetime,
by ordinary succession failing.

Mētis also names something the design already built without a word for it. Vision §5 describes the
Art of Memory's palace as unburnable, unlootable, un-loanable, and utterly lost when its holder
dies. That is not a storage location with unusual properties — that is mētis, and the tradition has
been describing it since it was written.

## What Changes

- **Nodes carry a `knowledgeKind`** of `episteme` or `metis`. Content-authored, not derived, so a
  cell's deep end is an authoring decision rather than an automatic consequence of tier.
- **Scribing refuses mētis nodes.** The scribing operation already refuses when a tradition's
  `store` kind forbids written storage; this adds the same refusal at node granularity, reported
  with a distinct reason so a caller can tell "this universe cannot write" from "this node cannot
  be written."
- **Mētis instances may exist only at `mind` and `palace` locations.** Never `grimoire`, never
  `library`.
- **Transmission is teaching-only.** A mētis node reaches a new mind by teaching from a living
  holder, or by rediscovery. There is no copying path.
- **Loss becomes a succession failure, not only a casualty.** A mētis node leaves the universe when
  its last holder dies without having taught it — which can happen with no raid, no fire, and no
  enemy.
- **Rediscovery of a mētis node is costlier**, because no text survives to work from. Expressed
  through the existing `rediscoveryMultiplier`, not a new mechanism.
- **The Art of Memory tradition makes every node mētis**, universe-wide. **BREAKING** relative to
  `magic-traditions` as currently specified, where the palace is a storage kind rather than a
  statement about all knowledge in that universe.
- **Theft becomes asymmetric.** Mētis cannot be looted, because no grimoire exists to take. It is
  reachable only by reading a mind — which concentrates its vulnerability in *Intellego Mentem* and
  *Rego Nomen*, exactly the cells vision §5 already gates theft behind.
- **A new balance metric** records how much mētis a universe holds relative to its teaching
  capacity, so the harness can see succession pressure rather than inferring it.

## Capabilities

### New Capabilities

- `metis-knowledge`: what makes a node mētic, which operations refuse it, how it transmits, how it
  is lost by succession failure, and how it is rediscovered.

### Modified Capabilities

- `knowledge-instances`: scribing gains a node-level refusal; the location invariant gains a rule
  that mētis instances may not occupy grimoire or library locations; loss gains the succession
  path.
- `magic-traditions`: the Art of Memory's `store` hook is restated as "all knowledge in this
  universe is mētis" rather than "knowledge lives in a palace."
- `content-schemas`: `node.json` gains the `knowledgeKind` field and its schema constraint.

## Impact

- **Content**: all 300 authored nodes in `packages/content/data/node.json` gain an explicit
  `knowledgeKind`. The schema uses explicit `required` lists and `additionalProperties: false`, so
  the field is not optional and the edit is mechanical but total.
- **Code**: `packages/rules-magic` — the scribe path, the instance-location invariant, the loss
  path, and the Art of Memory hook.
- **Contracts**: `docs/design/contracts.md` §2.3 (node schema) and §7 (a metric name is
  append-only, and adding one is baseline-affecting).
- **Vision**: `docs/design/vision.md` §5 gains mētis as a knowledge kind, §4a restates the Art of
  Memory, §11 gains a roadmap row, §13 loses the open question this answers and gains the ones it
  raises.
- **Sequencing**: this change depends on `knowledge-model` (0.3.0) having landed, since it modifies
  the instance model that change establishes. It is deliberately held at **proposal depth until
  after 0.5.0**, when the Monte Carlo harness exists — mētis introduces a decay pressure whose
  tuning cannot be argued without measurement, and vision §9 is explicit that machines discover the
  meta before humans do. Recording the design now and implementing it after the instrument exists
  is the same posture vision §11 already takes toward changes 8–10.
- **Not claimed**: no assertion is made here about whether this improves balance. That is a
  measurement, it is not yet collectable, and `docs/design/release-plan.md` forbids the claim until
  it is.
