<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The `mvee` paradigm survey

*Status: investigation, 2026-08-13. Branch `w110/paradigm-study`, cut from `main` at `e2a15cf`.
Nothing here is approved and nothing here is built.*

Source: `mvee` / *AI Village*, at `~/src/multiverse_games/games/mvee`, read-only. This document is
the follow-up to `docs/design/ruleset-map.md` (branch `docs/vision-audit-staleness`), which
proposed adopting `mvee`'s paradigm space wholesale. **This one says which parts survive contact
with the code**, and corrects four things previously believed — including one this document itself
asserted in an earlier draft, which is left visible rather than quietly fixed because the way it went
wrong is instructive.

Every claim about Mages below is a claim about `main` at `e2a15cf`. Every claim about `mvee` is a
claim about its working tree on the date above.

---

## The one-paragraph answer

**Six paradigms are worth importing and forty-three are not.** The single most valuable finding is
not a paradigm at all: it is that **the raid map's adjacency is derived from coordinates through one
frozen four-element constant and one callback**, so "temporarily raise the dimensionality of space"
is a modifier on an existing subsystem rather than a new one, **and that subsystem is live** —
`scenario` installs `rules-raid` into the reference universe's world loop. So this is cheap in code
*and* reachable from a running simulation. The one thing that is not cheap is the literal reading:
**N-dimensional space is a combinatorial wall.** The recommendation is a fold-adjacency transform on
the existing 2-D grid, which produces the effect the owner described without paying for it.

---

## Corrections to what was already believed

These are the "a finding about code is a finding about a ref" flags.

| claim | where it came from | what is actually true at `e2a15cf` |
|---|---|---|
| `foreignMagicPolicy` has **four** values | `ruleset-map.md` | It is a **thirteen-value union type**, `MagicParadigm.ts:523-536`. Twelve of the thirteen appear in shipped paradigms; only `tolerant` is unused. The four named in `ruleset-map.md` are the first four listed. |
| `rego-limen` holds **two** nodes | task brief | It holds **five** — `rl-hold-the-door`, `rl-step-across`, `rl-seal-the-way`, `rl-open-the-portal`, `rl-the-standing-gate`. All five `limen` cells are authored (4, 4, 4, 4, 5 = 21 nodes), and three of the five are `v1: true`. The limen school is not empty; it is authored and thin at the top. |
| `mvee` has **~43** paradigms | `ruleset-map.md` | **49 distinct ids.** 37 live in the five JSON data files; the rest are TypeScript-only, chiefly the nine in `NullParadigms.ts`. The TS-only ones were never surveyed before and one group of them is on the shortlist below. |
| **`rules-raid` is orphaned**, so `cast` and `cost` have no simulation path | task brief, `CLAUDE.md`, **and this document's own first draft** | **False.** `scenario/src/reference-universe.ts:728` installs `raidSystem` into the world schema and `scenario/src/raids.ts:92` value-imports the package. The module-boundaries test permits the edge and says *"It does now"*. See Question 4 for how three sources managed to agree on a stale fact, and for the real defect underneath it — `scenario`'s `package.json` does not declare the dependency it uses. |

A fourth defect, found in passing and worth reporting upstream rather than importing: **`tethermancy`
is defined twice** — in `animist-paradigms.json` and `creative-paradigms.json` — with conflicting
values (animist: `3 × 6, compatible, linear`; creative: `4 × 6, neutral, logarithmic`).
Whichever file loads second wins. Do not import that id without picking one.

---

## Question 4 — is the raid map's dimensionality a parameter or an assumption?

**It is an assumption, but it is an assumption about the coordinate tuple, not about adjacency — and
adjacency is the part dimension magic needs.** This is the favourable answer, and it is worth saying
loudly.

### The assumption

`packages/rules-raid/src/geometry.ts` defines `Point { x, y }` — two fields, fp metres — and
`CellAddress { column, row }`. `packages/rules-raid/src/terrain.ts` stores cells in a flat array
indexed `row * cellsPerSide + column`. Two-dimensionality is baked into both. Nothing generalises
those to N without touching every call site.

### The part that is derived

Adjacency is **not** a hand-built graph of rooms. It is computed, in two places, and both are small:

- `packages/rules-raid/src/navigation.ts` — the breadth-first flow field's entire notion of "next
  to" is one module-private frozen constant:

      const NEIGHBOURS: readonly (readonly [number, number])[] = Object.freeze([
        [0, -1], [1, 0], [0, 1], [-1, 0],
      ]);

  It is used twice: once to build the field, once to step down it. The file's own header calls the
  order "part of the rules rather than an implementation detail" — which is exactly the property a
  dimensionality modifier wants, because it means changing it is a rules change and will be
  reviewed as one.

- `packages/rules-raid/src/geometry.ts` — `hasLineOfSight(a, b, cellSize, cellsPerSide, blocks)`
  takes **`blocks` as a callback**. Whether a cell obstructs sight is injected by the caller, not
  read from the terrain inside the function.

So the two things the owner named — *"two rooms that share no wall in 3-D become neighbours"* and
*"line of sight stops being blocked by a wall you can go around"* — are respectively **one constant**
and **one already-injected predicate**. Neither requires touching `Point`.

### Why the literal reading is the wrong one, in arithmetic

The terrain grid is 20 × 20 = 400 cells, and the flow field is an `Int32Array(side * side)` recomputed
per goal. Generalising the coordinate tuple to N dimensions makes that `side^N`:

| N | cells | flow field |
|---|---|---|
| 2 | 400 | 1.6 KB |
| 3 | 8,000 | 32 KB |
| 4 | 160,000 | 640 KB |
| 5 | 3,200,000 | 12.8 MB |
| 6 | 64,000,000 | 256 MB |

**6-D is not a tuning problem, it is a wall** — and it is a wall per goal cell, since fields are
cached per goal. Anything past 3 is untenable, and the golden replay fixtures would have to be
regenerated for a change to `Point` regardless.

### The recommendation

**Do not add coordinates. Add adjacency.** A `dimensionality` modifier of level *d* would:

1. **Extend `NEIGHBOURS` with fold-pairs.** At *d* = 4, a deterministic seeded set of cell pairs
   becomes mutually adjacent in the flow field — rooms that share no wall become neighbours. This is
   the same insight `rl-step-across` already glosses: *"treat two thresholds as the same threshold
   for exactly one stride."* The BFS is unchanged; only its neighbour function is.
2. **Weaken the `blocks` predicate.** At *d* ≥ 4, some fraction of `blocksLineOfSight` cells stop
   blocking — you go around them in a direction that did not previously exist. This is a wrapper on
   the callback that is already a parameter.

Both are integer-only, both are deterministic, and neither touches `Point`, `squaredDistance`,
`stepToward`, or the supercover walk — the parts of `geometry.ts` whose float-freedom was expensive
to get right.

### Two caveats that belong next to the loud part

**`rules-raid` is wired in — and an earlier draft of this document said it was not.** The correction
is worth keeping visible, because getting it wrong made the recommendation look twice as expensive as
it is.

`packages/scenario/src/reference-universe.ts:728` appends `raidSystem({...})` to the world schema, and
`packages/scenario/src/raids.ts:92` value-imports `openPortal` and friends from `@mm/rules-raid`. The
module-boundaries test lists `rules-raid` as a permitted **value** edge for `scenario` and says so in
as many words: *"`rules-raid` shipped complete and uncalled, so the composition root had no portal to
open. **It does now** — `raids.ts` drives `openPortal` through `applyRaidOutcome`"*
(`packages/sim-core/test/unit/module-boundaries.test.ts:190-198`). **A reference universe stepped
through `scenario` runs raids.**

**How the error happened, since it is the exact hazard `CLAUDE.md` warns about.** Two sources agreed
and both were stale. A `grep` for `"@mm/rules-raid"` across `packages/*/package.json` returns nothing
— see the genuine defect below — and the module-boundaries comment was read as far as *"nothing had
reached for it"* and no further, when the next clause is *"It does now."* **A fragment of a comment is
not a ref either.** `CLAUDE.md` compounded it, recording `raid-engagement` at 67/92 *"with
`packages/rules-raid` built but nothing in `scenario` opening a portal yet"* — which is now false, and
is a documentation-drift bug in its own right.

**The genuine defect found on the way: `packages/scenario/package.json` does not declare
`@mm/rules-raid`.** Its `dependencies` list eight workspace siblings and `rules-raid` is not among
them, while `src/raids.ts` and `src/reference-universe.ts` both import from it at runtime. It resolves
today through workspace hoisting, so nothing fails — but the declared graph is wrong, and `CLAUDE.md`
already records what an under-declared workspace does to `npm ci` on a fresh worktree. **One line, and
worth a separate PR.**

**What *is* still unreached is narrower, and it is the consumption check's own path.** `node
scripts/check-primitive-consumption.mjs` reports that of sixteen primitives only `portal` and
`worship-yield` are reachable from authored nodes, with every engagement primitive —
`direct-damage`, `ward`, `area-denial`, `blink`, `summon`, `knowledge-steal` — in the FAIL list. That
is **not** because nothing consumes them: it is because the check assembles its universe through
`worldDeps()` in `scenario/src/content-set.ts`, which does not install the raid system that
`reference-universe.ts` does. **So the check measures a narrower build than the reference universe
runs**, and a `dimensionality` primitive would land in the same gap. Worth knowing before treating
that FAIL list as a map of what the simulation ignores.
(That check is *not* in `npm run verify`. It runs in CI as an explicitly **non-blocking** job, and it
fails there today — on this docs-only PR as much as on `main`, which is how you can tell it is
reporting the state of the tree rather than anything a branch did to it.)

**The flow-field cache assumes terrain never changes.** `TerrainNavigator.#fields` memoises one
`Int32Array` per goal cell, justified in the header by *"terrain never changes"*. A mid-raid
dimensionality cast falsifies that. The fix is small — key the cache on `(goal, dimensionality)`, or
clear it on change — but it is a correctness bug waiting rather than a nicety, and it should be in
the first commit that adds the modifier, not the second.

---

## Question 6 — is "temporarily" cheap?

**Free at raid scope; already supported at effect scope.**

`packages/rules-raid/src/terrain.ts` states it outright: the grid *"is not stored anywhere: a grid is
a pure function of `(raidSeed, tuning)`"*, generated at portal open on RNG stream 11 and *"thrown away
at resolution"*, because `contracts.md` §1.6 forbids engagement entities from reaching a world
snapshot. **There is no persistent raid state for a temporary change to corrupt.** A dimensionality
level that lives on the raid's own state is discarded when the raid resolves, by construction.

Within a raid, `durationTicks` is already on every authored effect — every node in `node.json` carries
it — so "4-D for 200 ticks, then revert" needs no new field. The only state a revert has to undo is
the navigator's cache, which is the caveat above.

**So the temporary framing is strictly cheaper than the permanent one and should be the only one
built.** A permanent change to the shape of a universe would have to enter the world snapshot, which
means a `WORLD_SCHEMA_VERSION` revision and a golden-fixture argument. The temporary one costs
neither.

---

## Question 5 — what does `mvee`'s `dimension` paradigm actually do?

The header is `teach=true`, `scroll=true`, `enchant=true`, 6 techniques × 5 forms
(`perceive/control/destroy/summon/protect/transform` × `space/void/mind/body/image`),
`powerCeiling: 250`, `powerScaling: exponential`, `foreignMagicPolicy: transforms`. Below the header:

**`laws`, `risks` and `channels` are genuinely consumed, not flavour.** `MagicLawEnforcer.ts` iterates
`this.paradigm.laws` (line 234) and `this.paradigm.risks` (line 255) inside its cast-validation path,
filters `this.paradigm.channels` for `requirement === 'required'` (line 250), and a failed law check
can either block the cast or **attach an additional cost** (`lawResult.additionalCost`). So this is a
real mechanism in `mvee`, which makes the question of whether it translates a fair one.

**The interesting part does not survive translation, and one part of it does.**

What does not survive: `risks` are probabilities (`0.3`, `0.15`) attached to trigger/consequence pairs
whose consequences — `corruption_gain`, `trapped`, `possession`, `coma`, `mutation`, `bleed_through`
— are **states Mages has no representation for**. `channels` are casting requirements (a focus object,
meditation, a glyph) and Mages has no per-cast resource or component model to hang them on. Both are
subsystems, not data.

What survives, and it is the good part: **three of the six `laws` are statements about the grid, and
Mages' grid can already say them.**

- **Flatland Law** — *"beings can only naturally perceive their native dimension count"*, with
  `canBeCircumvented: true, circumventionCostMultiplier: 3.0`. Mages already has exactly this shape:
  `rediscoveryMultiplier` on every node, and the 3× rediscovery cost shipped in `knowledge-model`.
  A law that says "you may exceed your native dimension, at three times the cost" is a node cost
  multiplier and nothing else.
- **Conservation of Dimensionality** — *"reducing one area increases instability elsewhere"*. A
  conserved quantity across a raid map. Expressible, and it is what stops a dimensionality modifier
  being a pure buff.
- **Collapse Cascade** — *"once begun, dimensional collapse spreads; it can be slowed, never
  stopped"*, `canBeCircumvented: false`. This is `mvee`'s `destroy × space` forbidden combination and
  it is the one genuinely new *game* idea in the paradigm: an irreversible, spreading effect. Mages
  has no irreversible effects at all. **This is a subsystem and I am not recommending it**, but it is
  the thing to build if dimension magic ever needs a downside with teeth.

`mvee`'s own `dimensional_powers` list (13 entries) is a spell list, not a paradigm, and it translates
straight onto Mages' node tiers — `dimensional_sight` (novice) through `between_walk` (grandmaster) is
a five-tier progression through `intellego-limen` and `rego-limen`. **That is the cheapest thing in
this entire document**: it is names and gloss, and `limen` cells hold four to five nodes where other
authored cells hold more.

---

## Question 2 — the `teach=false` / `scroll=false` paradigms

**Eleven paradigms in the five JSON data files are `allowsTeaching: false`:** `pact`, `emotional`,
`ferromancy`, `luck`, `silence`, `paradox`, `age`, `escalation`, `corruption_crown`, `talent`, `wild`.
Counting the TypeScript-only definitions too the figure is **sixteen**, adding `null`, `anti`,
`rational`, `divine_monopoly` and `hemomancy`.

**All sixteen are also `allowsScrolls: false`, and the converse never occurs: there is no paradigm in
`mvee` that can be scribed but not taught.** The reverse pairing is common — `divine`,
`breath`, `threshold` and `tech_supremacy` are all teachable but unscribable — which is the asymmetry
worth keeping,
because it says storage is downstream of transmission rather than parallel to it.

**What they would do to Mages is the most valuable experiment in this document, and it is nearly
free.** The tradition sweep found that under standard-acquire traditions a universe ends 2400 ticks
with **zero teachable instances**; `docs/design/tradition-sweep.md` is the record. The reference
tradition, True Naming, sets `instanceMastery: 1024` on every instance, so researched knowledge is
immediately teachable and chains losslessly — **and every balance measurement this project has taken
assumes that.** A `teach=false` paradigm is the arm that says how much of the result was
tradition-specific.

**But it needs a code change, and here is exactly which.** Mages' hook enumeration
(`packages/content/src/hooks.ts`) is `acquire ∈ {standard, true-name}` and `store ∈ {standard,
palace}`. **There is no kind that means "cannot be taught" and none that means "cannot be written
down."** So importing any of them requires:

- a new `acquire` kind — call it `unteachable`, params `{}` — plus the branch in the acquire path
  that honours it;
- a new `store` kind — `none`, params `{}` — plus the branch in the store path.

Two kinds, no params, and the enumeration is deliberately in code so that this is a reviewed change
(`hooks.ts`: *"adding a kind must be a code change that someone reviews"*). This is small and it is
the intended shape of the extension. **It is the highest value-per-unit-cost item in the survey.**

---

## Question 3 — is `foreignMagicPolicy` worth adopting for the Portal Rule?

**Adopt the vocabulary. Do not expect to inherit an implementation, because there is not one.**

The type is thirteen values (`MagicParadigm.ts:523`), and it is a well-drawn space —
`compatible · incompatible · hostile · absorbs · transforms · isolated · neutral · tolerant ·
predatory · requires_permit · gateway · annihilates · trades_with`. Twelve are used by shipped
paradigms. There is a second, finer enum beside it — `ForeignMagicEffect` (`works_normally ·
weakened · fails · transforms · backfires · attracts_attention`) with a `powerModifier` and a
`transformsInto` paradigm id — which is the mechanically useful half and is the one to copy if only
one is copied.

**However: `foreignMagicPolicy` is never read by any non-test code in `mvee`.** Every occurrence
across the repository is a type declaration, a literal assignment in a paradigm definition, a
generated `.d.ts`, a test asserting the literal, or one god-action that *writes* the field
(`UniverseModification.d.ts:145`). **No switch, no branch, no consumer.** It is a declared vocabulary
that nothing has implemented yet.

That changes the recommendation from `ruleset-map.md`'s. It is still worth taking — §3's Portal Rule
needs named answers and thirteen thought-through ones beat inventing one — but it should be adopted
as **naming for a mechanic Mages will write itself**, budgeted accordingly, and not as "a raid
mechanic sitting in a data file in another repository." Six of the thirteen are also plainly beyond
v1 (`requires_permit`, `trades_with`, `predatory`, `gateway`, `tolerant`, `neutral`); a v1 Portal Rule
wants four or five.

---

## The shortlist

Five entries covering six paradigms — item 4 is three. Ordered by value per unit cost, not by
interest.

### 1. `pact` — the unteachable arm

| | |
|---|---|
| **what it is** | Power granted by a patron in exchange for service. `teach=false`, `scroll=false`, `persistsAfterDeath=false`, `allowsGroupCasting=false`, 4 × 4 grid, `hostile` to foreign magic. A mage's death is total loss. |
| **hooks** | `acquire` — needs a **new kind**, `unteachable`. `store` — needs a **new kind**, `none`. `cast`/`cost` — standard. |
| **cost** | **New hook kind ×2**, both param-free, plus the branches that honour them. No schema change; `hooks.ts` is designed for exactly this. |
| **what it unlocks** | The counterfactual for every balance measurement taken so far. Universes where the university, the library and the scribe are all switched off, and knowledge dies with the knower. `docs/design/tradition-sweep.md` measured a world where teaching barely functions; this is the world where it cannot. |

### 2. `dimension` — the limen school, deepened

| | |
|---|---|
| **what it is** | Perceive, fold, and reduce space. `teach=true`, `scroll=true`, ambient source, 6 × 5, `transforms`. Its 13-entry spell list is a five-tier progression from "see into the next dimension" to "walk through the space between". |
| **hooks** | **None of the four.** Its character is entirely in *which cells are enabled* and in a raid-layer modifier. That is a feature: it does not compete for hook budget. |
| **cost** | **Split.** (a) The node progression across `intellego-limen` and `rego-limen` is **data-only** — names, glosses, tiers, prerequisites, and re-derived fixed-point costs. (b) The dimensionality modifier is a **contained code change** in `rules-raid` — extend `NEIGHBOURS` with fold-pairs, wrap the `blocks` callback, key the navigator cache on dimensionality. (c) A `dimensionality` primitive is **not data-only** — `check:consumption` asks whether what academics *know* can move a number, so it needs a consumer — but its natural consumer, `rules-raid`, is **already installed in the world loop by `scenario`**. **There is no wiring bill.** The residual is that the consumption check's own `worldDeps()` path does not install the raid system, so a new engagement primitive will read as unconsumed there until that is addressed. |
| **what it unlocks** | A `limen` progression that runs from "open a door" to "raise the dimension of the room", on the axis the design now hinges on. Portal magic gates interspecies alliances; today `rego-limen` tops out at a portal that stays open. This gives the school five more rungs and gives raids a spatial ability that is not damage. |

### 3. `threshold` — the limen tradition, as opposed to the limen school

| | |
|---|---|
| **what it is** | *"Doorways, crossroads, and boundaries are sources of magical power."* `teach=true`, **`scroll=false`**, 4 × 3 (`create/control/perceive/summon` × `space/spirit/void`), `foreignMagicPolicy: gateway`, ceiling 120. Its two laws are `threshold` (absolute, not circumventable) and `consent` (strong, circumventable). |
| **hooks** | `acquire` — standard. `store` — needs the **`none` kind from `pact`**; nothing else. |
| **cost** | **Free once `pact` is in.** Reuses the same new `store` kind and adds no others. |
| **what it unlocks** | A tradition whose magic is taught mouth-to-mouth and never written — which is a *different* knowledge economy from both True Naming and scribing, not a harsher one: teaching works, libraries do not. That is the missing third arm of the sweep, and it is the arm most likely to be interesting, because it isolates scribing from teaching. Its `consent` law is also the closest thing in 49 paradigms to the alliance gate. |

### 4. `null` / `dead` / `anti` — the control arms

| | |
|---|---|
| **what it is** | Three of the nine TypeScript-only paradigms in `NullParadigms.ts`. `null` — magic does not exist (`incompatible`, teach and scrolls both false). `dead` — magic existed and has drained away (`absorbs`, and pointedly **teach and scrolls both `true`**, commented *"old scrolls exist, just don't work"*). `anti` — magic is actively opposed (`hostile`, teach and scrolls both false). |
| **hooks** | None. These are **cell-set configurations**, which is to say they are the god's ruleset with nothing or almost nothing enabled. |
| **cost** | **`null` is data-only and nearly zero** — a content set with no `v1: true` cells. `dead` is a small code change. `anti` wants an ambient drain (its source has `regenRate: -0.1`) and is more. |
| **what it unlocks** | The control condition. Every balance claim the project makes is a claim about a universe with twelve enabled cells and no comparison. A `null` run is the null hypothesis, and it is free. **This is the item most likely to be skipped and least likely to be regretted.** `dead` is the sharpest of the three and deserves its own sentence: *"spellbooks contain valid formulas for power that no longer flows."* **Mages can express that today** — knowledge instances and effect magnitudes are already separate, so a universe where research, teaching and scribing all work and every effect yields zero is reachable. It is the cleanest possible test of whether the knowledge economy is load-bearing or decorative. |

### 5. `ForeignMagicEffect` — the Portal Rule's vocabulary

| | |
|---|---|
| **what it is** | Not a paradigm: the six-value enum beside `foreignMagicPolicy` — `works_normally · weakened · fails · transforms · backfires · attracts_attention` — with a `powerModifier` and a `transformsInto` paradigm id. |
| **hooks** | None; this is §3 Portal Rule vocabulary, resolved at arbitration. |
| **cost** | **Names are data-only; behaviour is a code change in `rules-raid/arbitration.ts`.** Inherit nothing from `mvee` but the names — see Question 3, there is no implementation there to copy. |
| **what it unlocks** | Four or five named answers to "what happens when foreign magic arrives", against Mages currently having none. `weakened` with a `powerModifier` is a one-line arbitration rule and is probably the whole of v1. |

---

## What I am rejecting, and why

Forty-three of the forty-nine, grouped by the reason. The shortlist is six — `pact`, `dimension`,
`threshold`, `null`, `dead`, `anti` — since item 4 above is three paradigms and item 5 is not a
paradigm at all. The five groups below sum to forty-three.

**Needs a subsystem Mages does not have (18).** `age`, `belief`, `blood`, `consumption`,
`corruption_crown`, `debt`, `divine`, `dream`, `emotional`, `escalation`, `luck`, `narrative`,
`paradox`, `pun`, `silence`, `song`, `talent`, `wild`. Each is defined by a resource, state, or event
Mages does not model: sanity, corruption, memory loss, cumulative unrecoverable cost, wild surge,
narrative causality, per-cast emotional state. **`corruption_crown` is the sharpest loss** — power
scaling with lost self is a genuinely good mechanic — and it deserves its own line: **its character
lives entirely in the `cost` hook.** `costPolicy` and `castPolicy` are read only by `rules-raid` — a
much weaker objection than the brief assumed, since `scenario` now installs that package into the
world loop, so those two hooks *do* have a path. The reason to reject `corruption_crown` is therefore
not reachability but content: it needs cumulative, unrecoverable cost and a memory/identity model, and
Mages has neither. **Of everything on the reject list this is the one to revisit first**, and it is
closer to hand than it looked.

**Mages already has it (4).** `academic`, `craft`, `names`, `rune`. `academic` is Mages' baseline —
8 × 10, teach and scrolls both true, logarithmic scaling — and importing it would be importing the
status quo. `names` is True Naming, which is already the reference tradition and already has the
`nomen` form and the `true-name` acquire kind. `rune` and `craft` are scribing and enchantment, which
the `store` hook covers.

**Governance flavour without a governance model (5).** `bureaucratic` (`requires_permit`), `commerce`
(`trades_with`), `divine_monopoly`, `divine_prohibition`, `sealed`. `bureaucratic` is the tempting one
because Mages has a function literally called `permits()` — but that is the god's ruleset permitting a
cell, not an in-world authority issuing licences, and conflating them would be a pun rather than a
design. Reconsider after the alliance layer lands, since that is the first in-world authority.

**Compositions and duplicates (4).** `hemomancy`, `namebreath`, `theurgy`, `tethermancy`. The first
three are *mergers of two paradigms* defined in `ParadigmComposition.ts` — blood + pact, names +
breath, divine + academic. **The composition idea is better than any of its three outputs** and is
worth a look later: two rulesets blending at a boundary is what Mages' Portal Rule is reaching for.
But Mages has no composition model, and importing a merger without the merger machinery imports only
its lore. `tethermancy` is defined twice with conflicting values (see corrections) and should not be
imported under that id at all.

**Setting-specific, not mechanism (12).** `animus`, `breath`, `echo`, `ferromancy`, `game`,
`inverted`, `lunar`, `poetic`, `rational`, `seasonal`, `spirit_accord`, `tech_supremacy`. These differ
from each other mostly in `universeIds` and lore. They are good writing and they are not rulesets:
their grid rectangles and their teach/scroll flags are largely interchangeable, which is the test of
whether a paradigm is a mechanism or a costume.

---

## What I would do next, in order

1. **The two hook kinds** — `acquire: unteachable`, `store: none`. Smallest change, unblocks `pact`
   and `threshold` together, and turns the tradition sweep's most important unrun arm into a
   one-line content change. This is the branch to cut first and it is not the dimension one.
2. **The `limen` node progression** — data-only, no code, re-derived magnitudes, straight into
   `intellego-limen` and `rego-limen`. Deepens the school the alliance gate depends on without
   touching the rules path.
3. **Fix two small truths about `rules-raid` that are currently mis-recorded** — add `@mm/rules-raid`
   to `packages/scenario/package.json`'s dependencies, and correct `CLAUDE.md`'s "nothing in
   `scenario` opening a portal yet". Neither is this document's job, both are a few minutes, and both
   caused this document to be wrong once already.
4. **The dimensionality modifier** — fold-adjacency plus LOS-piercing, temporary, cache keyed on
   level. **No longer blocked on anything**, which is the single biggest change between this
   document's first draft and this one.
5. **The `null` control arm**, whenever someone has an afternoon. It is free and it makes every other
   number mean something.

---

## Provenance

Paradigm records for the shortlist are committed under `docs/design/imported/mvee-paradigms/`, with
`PROVENANCE.md` naming the source repository, its licence, the authorisation, and the date. **They are
not in `packages/content/data/`**: that directory is validated content and these records do not match
any schema in it. Their magnitudes are `mvee`'s and are deliberately preserved unconverted, because a
half-converted number is worse than a foreign one — `powerCeiling: 250` means nothing at fixed-point
1/1024 and must be re-derived, not scaled.
