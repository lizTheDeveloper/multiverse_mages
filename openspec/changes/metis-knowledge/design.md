## Context

`knowledge-model` (0.3.0) establishes the knowledge instance: one copy of a node at exactly one of
`mind`, `grimoire`, `library`, or `palace`, with operations for research, teaching, scribing, loss,
rediscovery, and theft. Every node it models is in principle writable — a scribe with capacity and
materials can turn any mind instance into a grimoire.

That is a complete model of *episteme*. It has no way to express knowledge that codification
destroys, and the design has already been reaching for one: vision §5's Art of Memory palace is
described as unburnable, unlootable, un-loanable, and lost with its holder, which is a description
of mētis wearing the clothes of a storage location.

Constraints this design must respect:

- The simulation core is deterministic and float-free; anything added here is integer arithmetic.
- Content lives in validated data files (`CLAUDE.md`), so what makes a node mētic is authored, not
  computed at runtime.
- `contentRevision` is a compatibility gate (contracts §0). Adding a required field to `node.json`
  changes it for every universe, which is correct and must be deliberate.
- Contracts §7's metric registry is append-only and baseline-coupled.
- `docs/design/release-plan.md` forbids balance claims that are not yet measurable.

## Goals / Non-Goals

**Goals:**

- A second knowledge kind that cannot be written down, expressed as authored content rather than as
  a special case in code.
- A loss path that does not require an enemy: succession failure in peacetime.
- The Art of Memory tradition restated in terms of the thing it was always describing.
- Theft asymmetry that follows from the model rather than being asserted on top of it.
- A metric that makes succession pressure visible to the harness.

**Non-Goals:**

- Any claim about whether this improves balance. Not measurable yet; not claimed.
- A third knowledge kind. `knowledgeKind` is an enum so a third is *possible*, not planned.
- Changing how teaching itself works. Mētis constrains which operations are legal for a node; it
  does not alter the mechanics of the operations that remain.
- Retuning `rediscoveryMultiplier` values across the existing 300 nodes. Authoring guidance is
  provided; a sweep is a later, measured exercise.
- New UI. Salience for a mētis node is a client concern and is recorded, not built.

## Decisions

### 1. `knowledgeKind` is an authored node field, not derived from tier

**Chosen:** a required `knowledgeKind: "episteme" | "metis"` on every node in `node.json`.

**Alternative — derive from tier** ("the deepest node of every cell is mastery, therefore practice,
therefore mētis"): rejected. It is tidy and it removes all authorial control, making every cell's
deep end structurally identical. It also couples two unrelated axes: a shallow node can be pure
craft and a deep node can be pure theory.

**Alternative — derive from cell region** (e.g. all *Rego* is embodied): rejected for the same
reason plus a worse one — it would make the mētis/episteme split a property of the grid, which the
god manipulates with edicts, so a player could legislate mētis out of existence.

**Why an enum rather than a boolean `scribable`:** the negative boolean names the mechanism; the
enum names the concept, and the concept is the thing the design is about. It also leaves room for a
third kind without a schema break.

### 2. Mētis is enforced at the instance-location invariant, not only at the scribe call

A mētis instance may exist only at `mind` or `palace`. Enforcing this as an invariant on the
instance store — rather than only as a refusal inside scribing — means every future operation that
creates an instance inherits the rule without remembering to ask. Scribing is the obvious path
today; looting, gifting, and any later transfer are the paths that would otherwise leak.

The scribe refusal still exists, because a caller needs a *reason*, and "this node cannot be
written" must be distinguishable from "this universe cannot write" (the existing tradition-level
refusal). Two distinct diagnostic codes.

### 3. The Art of Memory makes all knowledge mētis, universe-wide

**Chosen:** the tradition's `store` hook sets the universe's knowledge kind to mētis for every node,
overriding the authored value.

**Alternative — Art of Memory is the tradition that *can* store mētis** (palace as the one legal
written-ish home): rejected. It makes the tradition a workaround for a restriction rather than an
identity, and it weakens both ideas — mētis stops being unwritable, and the Art of Memory stops
being a commitment.

The chosen reading costs nothing to explain because it is what vision §5 already says. It also
sharpens the three v1 traditions into genuinely orthogonal stresses: Vancian stresses *cast*, True
Naming stresses *acquire*, Art of Memory stresses *store* by removing storage.

**Consequence to accept deliberately:** an Art of Memory universe cannot build a library that
matters, so vision §6a's "knowledge as capital" compounding loop is weaker or absent there. That is
a large asymmetry between traditions. It is the intended shape — a tradition should be a different
game — but it is exactly the kind of asymmetry the harness must check rather than assume.

### 4. Loss by succession is the existing loss path with a different trigger

No new loss mechanism. A mētis node leaves the universe when its last instance is destroyed, which
is already the rule. What changes is *which events can destroy the last instance*: for episteme,
fire and mortality and looting; for mētis, only mortality. Because mortality runs constantly and
teaching is the only replenishment, the practical result is that mētis decays on a demographic
clock rather than an adversarial one.

This is why it needs a metric rather than a mechanism.

### 5. The metric is a ratio, not a count

**Chosen:** `metisSuccessionRisk` — the fraction of mētis nodes whose holders are all within one
species-lifespan quantile of death, with no student currently learning them.

A raw count of mētis nodes says nothing; a universe holding many mētis nodes with a healthy
teaching pipeline is not at risk. The quantity that matters is unteached knowledge in ageing heads,
which is what this measures. It is the mētis analogue of contracts §7's `libraryDependence`, and it
should sit beside it.

Adding a metric name is append-only and baseline-affecting, so it lands with the implementation,
not before.

### 6. Species interaction is emergent, not authored

No species gains a mētis-specific trait. The existing traits already produce the interesting
shape: `retention` and `scribeAffinity` govern how well a species preserves episteme, `lifespan`
and `teachRate` govern how well it transmits mētis. Dwarves are excellent archivists and therefore
structurally poor custodians of the unarchivable; draconic mages hold mētis for centuries and
transmit it rarely; humans transmit constantly and die constantly.

Adding a `metisAffinity` would flatten that into a number and discard the reason it is interesting.

## Risks / Trade-offs

- **A second decay channel lands before the instrument that can tune it** → the change is held at
  proposal depth until after 0.5.0, and no balance claim is made in the interim. This is the
  primary reason for the sequencing, not a formality.
- **Mētis loss can feel arbitrary rather than tragic** — a master dies at a bad moment and something
  irreplaceable is gone with no warning → the succession risk must be legible *before* it fires.
  The metric exists partly so the client has something to surface, and `sound-design.md` §0.3's
  salience-parity rule binds it: whatever audio makes urgent, the interface must too.
- **The Art of Memory becomes much weaker or much stronger than the other two traditions** →
  flagged for the harness as a specific comparison to run, not resolved by argument here.
- **Editing 300 nodes changes `contentRevision`** → correct and intended; it is a genuine
  compatibility break and the release must say so.
- **Authoring 300 `knowledgeKind` values is a taste judgement at volume** → the tasks carry
  authoring guidance and a default of `episteme`, so the burden is to justify each `metis` rather
  than to classify everything from scratch.
- **`rediscoveryMultiplier` becomes the only lever for "harder without a text"** → acceptable; the
  alternative is a second multiplier that means almost the same thing.

## Migration Plan

1. Land `knowledge-model` (0.3.0) first. This change modifies its instance model and cannot be
   sequenced before it.
2. Add the schema field with `episteme` required on every existing node — a no-op change in
   behaviour that moves `contentRevision` once, deliberately, before any semantics depend on it.
3. Add the invariant, the refusals, and the tradition hook behind the field.
4. Author the `metis` nodes as a separate, reviewable content commit, so the mechanical edit and
   the design judgements are not mixed in one diff.
5. Add the metric last, with the implementation, since the registry is append-only.

Rollback is authoring-level: setting every node back to `episteme` restores present behaviour
without touching code, which is the property that makes step 2 worth doing separately.

## Open Questions

- **How many of the 300 nodes should be mētis?** Unknown and deliberately unanswered here. Too few
  and the mechanic never fires; too many and the game becomes a succession-management sim. This is
  a tuning output of the harness, exactly like the edict budget.
- **Can a mētis node be taught across a portal?** Vision §4a splits the tradition hooks by clock —
  *acquire* and *store* stay with the mage's home tradition. A raider from an Art of Memory
  universe holds only mētis; whether she can teach it to a host-universe mage mid-raid, and whether
  that is a theft or a gift, is unresolved.
- **Does `Intellego Mentem` theft of a mētis node produce a mētis instance in the thief's mind?**
  Presumably yes, but it means theft is the one operation that moves mētis without consent *or*
  teaching, which may be too strong a workaround for the succession pressure this change exists to
  create.
- **Should the ever-known record distinguish the two kinds?** `knowledge-model` persists what a
  universe has ever known. Whether "we once had this and it was unwritable" should read differently
  from "we once had this and let it burn" is a presentation question with mechanical implications
  for rediscovery.
