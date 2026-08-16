# material-economy — preconditions, re-taken

Everything below was measured on **2026-08-16**, on branch `w247/material-economy-build`
cut from `origin/main` @ `57bcbc44`. `proposal.md`'s three measurements were taken on
`origin/main` @ `edcaf591` on 2026-08-15; this file re-takes them rather than trusting them,
per task 0.1 and `CLAUDE.md`'s rule that a document is not a ref for the code it describes.

## 0.1 The three measurements, re-taken

**Measurement 1 — seven of fourteen forms yield nothing. CONFIRMED, exactly.**

`packages/content/data/form.json` @ `57bcbc44` gives all-zero `yieldWeights` to
`corpus`, `imaginem`, `mentem`, `vim`, `umbra`, `fatum`, `limen` — the same seven, in the
same fourteen-row file. The failing test added first (`shipped-content.test.ts`, *"leaves
no form producing nothing at all"*) names them back verbatim:

    these forms yield nothing, so magic acting on them moves no economy:
    corpus, imaginem, mentem, vim, umbra, fatum, limen

The v1 opening square is `intellego · perdo · rego` × `mentem · terram · limen · nomen`,
and `mentem` and `limen` are both in that inert list. The proposal's row-by-row table also
reproduces: ignem/terram `stone 1024`; nomen `vellum 1024`; aquam `768/256/0`; auram
`256/768/0`; animal and herbam `512/0/512`.

**Measurement 2 — no god action costs a material. CONFIRMED.**

All **17** rows of `packages/content/data/god-cost.json` carry the key union
`{id, actionId, favorCost, gloss, tuningStatus}` and nothing else. There is no material
price anywhere in the action space.

**Measurement 3 — the observation sums the three stocks. CONFIRMED in `agent-api`;
the UI half reproduces in substance but not in the words the proposal used.**

`packages/agent-api/src/observation.ts` `writeResources` still reads
`food + stone + vellum` into one slot, with the §4.1 five-slot argument intact.
`packages/agent-api/src/player-state.ts` does the same sum for `resources.materials`.

The proposal says *"`ui/console/` prints `MATERIALS 2982`"*. That exact string is **not**
present on this ref — `grep -in MATERIALS ui/console/index.html` finds one line,
`ui/console/index.html:686`, rendering `bar('materials', r.materials, 3200)`. The claim that
the UI shows one undifferentiated materials figure is true; the quoted rendering is not
current. Recorded rather than silently corrected.

## 0.2 `economy-flow-models.md` §3.3–§3.4, read

§3.3 (Cook's faucet-and-drain matching rule; the SD spill corollary) and §3.4 (oscillation
period scales with loop delay; a period-2 detector is blind to a 1,400-tick cycle) were read
before any flow was written. **This change's groups 0–2 add no flow at all** — the four new
stocks are declared and migrated, and nothing produces or consumes them until group 3. The
spill rule binds group 3, and the "a cap must spill explicitly, never truncate silently"
constraint is recorded here so that whoever writes the first faucet inherits it.

§4 of that document is also load-bearing on the *count*: **"a resource earns its slot when it
has its own sink and its own scarcity regime."** Seven kinds is only defensible if each of the
four new ones gets the sink `proposal.md` A names for it. Four stocks with no sink would be
one resource with four labels.

## 0.3 `discriminating-ascension` task 1.5 has NOT landed. The ending is still free.

    packages/content/data/god-cost.json → declare-ascension.favorCost = 0

on this branch and on `origin/main`. `openspec/changes/discriminating-ascension/tasks.md`
has **0 boxes checked and 38 unchecked**; task 1.5 (*"change `declare-ascension`'s `favorCost`
from `0` to `20480`"*) is among them.

**The consequence, stated so it is not discovered later.** Pricing the *verbs* in group 4
while the *ending* is free does not by itself change the optimal policy, because a strategy
that can reach the ascension gate without spending can still reach it. Any group-4 or group-7
claim of the form *"material costs changed what strategies do"* must therefore say which of
the two changes it is measuring, and the two changes must be sequenced deliberately rather
than merged in whichever order they finish. This is a note for group 7, not a blocker for
groups 0–2, which add no cost.

## 0.4 `insight` does NOT double-count `encourage-research` — conditionally

**Verdict: no double count, provided group 3 wires `insight` into `teach-rate` through the
single existing stack.**

The two levers point at different primitives, and the code keeps them apart:

- `encourage-research` (action 12) persists an `ENCOURAGED_CELL` row. `emphasisAt` derives a
  per-cell `fp` emphasis from its remaining lifetime, and `packages/coordination/src/god/effects.ts`
  hands it back from **`researchBonusesFor`**, beside `blessResearchRate`. Its outcome is
  `research-rate` — the rate at which a mage *discovers* a node.
- `insight`'s sink in `proposal.md` A is **university teaching throughput**, which is
  `teach-rate` — the rate at which a mage *transfers* a node she already holds. That is
  `teachBonusesFor`'s channel, and today its only source is `blessTeachRate`.

Discovery and transfer are distinct outcomes on distinct primitives; `academic-effects.ts`
already supplies a second source to each and is explicit that both go into **one array,
through one `stackMagnitudes`, under one `fp(4096)` cap**, quoting `mages-and-species/design.md`:
*"two caps on the same quantity is how a rate ends up at 4.0 × 2.0 without anyone deciding it
should be 8.0."*

**So the condition group 3 must satisfy:** `insight` joins the existing `teach-rate` source
array and is capped once with the rest. If instead it were wired as its own multiplier on
teaching output, or routed to `research-rate`, it *would* be the third lever on one outcome
and this verdict flips. Recorded loudly here so that the check is cheap.

## The schema revision this change takes, and why it was free

**Revision 7, and it is free on `origin/main`.**

`packages/state/src/migrations.ts` @ `origin/main` declares `WORLD_SCHEMA_VERSION = 6`.
Scanning **every** local and remote ref for a higher declaration
(`git for-each-ref` over `refs/heads` and `refs/remotes`, reading
`packages/state/src/migrations.ts` out of each) finds:

| revision | refs declaring it |
|---|---|
| 7 | `design/raid-engagement`, `effects-engine`, `pr/170`, `pr/171`, `w182/raid-seam`, `w183/removal-probe`, `w190/scribing-fidelity`, `w24/university-siting`, `w37/raid-playable` (local and/or remote copies of each) |
| 8 | `demo/playable-wired` |

**None of them is merged.** `origin/main` is 6, so revision 7 is unclaimed *on the trunk*, and
the trunk is the only place a revision number means anything. The governing rule is
`migrations.ts`'s own — **"Append; never renumber"** — which is a rule about what a *merged*
history may contain: whichever of these branches lands second renumbers, because a revision
number is what a migration step is keyed on and reusing one silently applies the wrong repair
to a save.

**And the rule is already written down, in a different document from the one the brief named.**
`contracts.md` §4.4 is *"Parameterized actions and the explain channel"* and says nothing about
schema revisions; `grep -rn "order of arrival"` over `docs/`, `packages/` and `openspec/` returns
nothing. The section that governs this is **`docs/design/sim-rigor-2026-08-15.md` §4.4, "Collision 2
— #170 and #171 both take world-schema revision 7"**, which names two of the branches in the table
above and records that the same collision has already happened once: *"#171's own source records
that `mid-raid-change` 'was written against revision 4… `grant-budget` had taken 5 and 6 in the
meantime.' It is now being bumped a second time for the same reason."*

It also supplies the reconciliation recipe, which now applies to **this** change as much as to
those two — whichever of the three lands second takes 8:

1. `WORLD_SCHEMA_VERSION = 8`.
2. The migration step becomes `{ from: 7, to: 8 }`, not `{ from: 6, to: 7 }`.
3. The marker check moves to the **front** of `worldSchemaVersionOf`'s newest-first chain, ahead of
   whichever component took revision 7.
4. The component stays **last** in `WORLD_COMPONENTS`.

That document adds the reason it matters: *"Getting (2) or (3) wrong does not throw: an older save
migrates through the wrong steps and lands holding the wrong sections."* For this change, step 4 is
free — `material-stock` is not a new component and does not move in `WORLD_COMPONENTS` at all — and
step 3 is the one to watch, because revision 7's marker here is a **field** and the branches it
would be reordered against use **section** markers.

### The marker, which is the part that needed care

`worldSchemaVersionOf` identifies a revision **by which components exist**. Revision 7 adds
*fields* to an existing component, and an added field is not detectable that way — the note
in `components.ts` says so. So revision 7's marker is a **field**: the `material-stock`
section carrying a column named `labor`. It is checked before revision 6's `grant-budget`
marker, because a revision-7 envelope carries both and the newest marker must win.

### The trap that would have shipped a defect

`splitMaterialsByKind` (4 → 5) built its field table from `Object.keys(MATERIAL_STOCK.fields)`
— the **live** spec — while writing values at a hardcoded stride of 3. Adding four fields to
the spec would have made the 4 → 5 step emit a seven-column section, which

1. makes a revision-4 save read as **revision 7** the instant it is walked to 5, so the loop
   exits and `addGrantBudget` never runs — a save silently missing a component; and
2. misaligns every value write past the first row.

So both steps' field tables are **frozen literals** naming the revision they belong to —
revision 5's is `['food', 'stone', 'vellum']` and revision 7's is the seven — so revision 8
cannot inherit the same trap. A walk test covers a revision-4 envelope reaching 7 with a
`grant-budget` section present, which is the regression test for exactly this.

### Unrelated, and deliberately not fixed here

`worldSchemaVersionOf` contains a dead line — a second `if (carried.has(GRANT_BUDGET.name)) return 5;`
below the `return 4` marker, unreachable because the identical check above it returns 6.
Harmless, pre-existing, and not this change's to touch.

## What groups 3–7 inherit, and one thing task 5.3 must not skip

Recorded here because it was done under a different task's name and would otherwise be
rediscovered or duplicated.

**`observable-trait-inventory.md` was amended for the *count*, not for the entitlement.** Adding
four fields to `MATERIAL_STOCK` trips `packages/agent-api`'s entitlement gate, which refuses any
component field with no classification and pins the inventory's headline number. The four kinds are
classified **withheld / `not-yet-decided`**, and the document's totals moved 108 → 112 and
70 → 74 undecided, dated 2026-08-16 and named to this branch.

That is *not* task 5.3. 5.3 asks for four kinds to move from **withheld to entitled**, which
depends on task 5.1's named per-kind block on `PlayerState`, which is group 5's. 5.3 is
deliberately left unchecked. Whoever takes it should amend the same table again rather than assume
it is current.

**Two decisions the spec is silent on, taken to preserve behaviour and flagged for revisiting.**

- `packages/scenario/src/reference-universe.ts` seeds the four new kinds at **zero**. A founding
  endowment is a claim that the starting position holds something, and this universe has never
  cast. It is also the only choice that keeps the reference run identical while the sinks are
  unbuilt. Group 3 should treat it as a starting-position decision rather than inherit it as one.
- `writeMaterialStock` in `world-step.ts` writes the four at zero **on row creation only**; the
  per-field `set` path below it touches only `food`, `stone` and `vellum`. A row written whole every
  tick would silently zero the new stocks the moment something produced one, which is the trap
  group 3 would have walked into.

## Task 1 — `fund-university`'s `labor` price, restored behind a reserve floor

Measured **2026-08-16** on branch `w247/material-economy-build`, seed 20260813, 600 world ticks,
via `tools/w247/action11-legality.mjs --out <named file>`. Never a directory glob: `CLAUDE.md`
records an aggregator that folded every `.ndjson` under a directory and ate a previous run's
records at a different `--ticks`.

### The three arms, on the founding probe

| arm | action 11 legal | fraction | probe foundings |
|---|---|---|---|
| **A** — no `labor` price (as landed) | 400/600 | 66.67% | 123 |
| **B** — `labor` 4096, no floor | 8/600 | **1.33%** | 1 |
| **C** — `labor` 4096, reserve floor | 13/600 | **2.17%** | 2 |

Arm B reproduces the previous agent's recorded figure — *"legal on 8 ticks of 585"* — to the tick,
which is the positive control saying the instrument measures what it measured before.

### The floor works, and it is not what is binding

The floor is a real mechanism and the trace shows it operating: the automatic hire draws the stock
down and stops at 4,096 instead of at 0, leaving exactly one funding payable. It moved the verb
from 8 ticks to 13, and pool-wide foundings from 10 to 19.

**It cannot do more, and the reason is not the floor.** `labor` production over 600 reference ticks
is **exactly zero**. Corpus is the only form whose `yieldWeights` name `labor`, and Corpus is
outside the v1 opening square — `intellego · perdo · rego` × `mentem · terram · limen · nomen`,
whose four forms yield `insight`, `stone`, `passage` and `vellum` respectively. So the founding
endowment `FOUNDING_LABOR` is a **runway with no faucet**, and a floor redistributes a finite
endowment between two claimants rather than manufacturing income.

The bounding experiment, run rather than argued: setting the reserve so high that the automatic
hire **never draws at all** gives 46/600 (7.67%). That is the ceiling on anything done to the sink
alone — the whole endowment, spent by nobody but the verb, at 4,096 a time, is eight foundings.
**66.67% is not reachable by any reserve policy** while the faucet is zero.

### What this means for the author's instruction

The verb costs `labor`, as instructed, and the sink no longer wins the race by construction. The
honest report is that this restores the price without restoring the verb's *availability*, because
availability was never limited by the race alone. The remedy is a **content** decision, not a flow
one: enabling a Corpus cell gives `labor` a producer and makes the price a recurring cost rather
than a countdown. That is a change to the opening square and belongs to the author.

### Conservation

Unaffected, and by choice of shape. A floor holds a stock **in** the stock; it destroys nothing and
accumulates nothing outside it. `spendableLabor` is a read, not a transfer, so the group-6 ledger
sees no faucet and no sink for it and `delta == faucet − sink` is untouched.
