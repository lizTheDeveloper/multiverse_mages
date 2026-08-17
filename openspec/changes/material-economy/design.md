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


## Group 6 — the ledger, and the two controls that make it evidence

Measured **2026-08-16** on branch `w247/material-economy-build`.

### The flows, enumerated from the stock mutations rather than from intent

`world-step.ts` mutates the material stock in exactly **three** places, and the ledger is written
from that list rather than from a description of the economy:

| | where | side |
|---|---|---|
| land production | phase 1, `produceMaterials` | faucet |
| applied magic | phase 5a, `work.applied` | faucet |
| scribing at the desk | phase 5, `materialsAccess.consume` | sink (`vellum`) |
| every claimant | phase 9, `consumeMaterials` | sink, per `CLAIMANT_KIND` |
| the ceiling | phase 9a, `applyStockCeiling` | sink (`spilledByKind`) |

**Spill is on the sink side and must be.** `applyStockCeiling` returns what did not fit rather
than dropping it precisely so this arithmetic has somewhere to put it; a silent truncation would
read here as a leak, which is a diagnosis a reader would then have to un-make.

**A stock held back by a reserve floor is on neither side.** `spendableLabor` bounds how much a
drain may take; the reserved `labor` is still in the stock at the tick's end. That is what made a
floor the right shape for task 1's two-claimant race — a gate or a holding pool would both have
needed the ledger to learn about them.

**The god's spend is deliberately outside.** The intervention system runs *before* the world
system in the same step, so a material cost it deducted is already in the opening balance the
world tick reads. Folding it in would make every tick a god acted on read as a leak.

### Two positive controls, both run rather than asserted

A checker that has never failed is not known to work, and this campaign has shipped five checkers
that answered confidently about the wrong input.

**Control 1 — the assertion (task 6.4).** `WorldStepDeps.leak` injects an unrecorded drain into
the **shipped** world loop, not into a test's copy of it: a control that re-implements the tick can
agree with itself while both have drifted. `material-ledger.test.ts` requires the assertion to
throw, to name the kind, to name the tick, to report the discrepancy as exactly `-32`, to leak only
the kind named, and *not* to fire for a declared leak of zero.

**Control 2 — the reported metric (task 6.3).** A metric that can only ever read zero is
indistinguishable from one that is not wired. Probed by disabling the throw and leaking 64 fp of
`food` per tick: `referenceConservationBreaches` read **240 of 240 ticks** breaching. Restored, it
reads **0**. The series can move, so the zero is a measurement.

### The result

Conservation holds. 363 coordination tests pass with the assertion live inside every `step`, and a
240-tick reference run reports **0 breaching ticks**.


## The pre-existing `illegalActionRate` defect, re-measured — and a disagreement recorded

Asked to confirm that `illegalActionRate` still reads **0.0178** in both arms, with action 12
`encourage-research` contributing **53 rejections while carrying no material cost at all**.

**The qualitative claim reproduces exactly, and is not this change's.** `god-cost.json`'s action 12
row carries no `materialCost` key at all, and it is nonetheless the **largest single source of
rejections** in the pool: 24 of 57 at 600 ticks, 39 of 104 at 1,200. A verb with no material price
cannot have been made unaffordable by a change that only adds material prices, so this is a
mask/resolver disagreement predating `material-economy`, exactly as briefed. Not fixed here.

**The magnitude does not reproduce, and the number is reported rather than the briefed one
repeated.** Measured 2026-08-16 via `tools/w247/illegal-rate.mjs`, writing to a named file:

| run | rejections / submissions | rate | vs the 0.01 ceiling |
|---|---|---|---|
| seed 20260813, 600 ticks | 57 / 8,197 | **0.0070** | **under** |
| seed 20260811, 1,200 ticks | 104 / 15,197 | **0.0068** | **under** |

Both are **below** the §7 ceiling, where the brief expected 0.0178 above it. The disagreement is
stated rather than resolved, because resolving it would mean guessing which of two instruments is
right, and this one has not been reconciled against the one that produced 0.0178 — that figure's
denominator, seed set and strategy pool are not recorded anywhere this branch can read. What can be
said precisely:

- This probe pools **`accounting()` over all fourteen shipped strategies**, one run each, which is
  `collectIllegalActionRate`'s own source (`submissions`, `rejections`, `byActionId`).
- It is dominated by one strategy: `uniform-random-legal` at **0.0833**, with `allocate-spread` at
  0.0117 and **every other strategy at exactly zero**. A pooled rate is therefore extremely
  sensitive to which strategies are in the denominator, which is the most likely source of a 2.5×
  discrepancy and is a warning about reading either number as "the" rate.
- The probe **refuses to print a rate it cannot compute** — a third exit for a broken probe rather
  than folding it into the answer. It was caught by that guard once during development, reading
  `NaN/NaN` from two mistyped field names, and would otherwise have reported a confident nonsense.

So: the defect is confirmed present and confirmed not-ours; the ceiling breach is **not**
reproduced on this instrument, and nobody should quote 0.0178 or 0.0070 without the strategy pool
beside it.


## The faucet for a kind must have the shape of its sink

Measured **2026-08-16** on branch `w247/material-economy-build`, at `1da48cab` and the three
commits above it. Every figure below is from a named output file under
`tools/w247/*.mjs --out <path>`; none is from a directory glob.

### The defect, restated as a property rather than as two missing numbers

Seven kinds, seven sinks, and **two kinds with no reachable source**. `labor` comes only from
Corpus and `essence` only from Vim, and both forms sat outside the twelve enabled cells
(`intellego · perdo · rego` × `mentem · terram · limen · nomen`, yielding `insight`, `stone`,
`passage`, `vellum`). Over 600 reference ticks, production of both was **exactly zero**.

The position could not be escaped from inside, and that is the part worth keeping. Two verbs open a
cell outside the square: `permit-form`, which costs favor and which no shipped strategy spends on
Vim, and `issue-dispensation`, which is **the verb the missing stock pays for**. A verb priced in a
material only that verb can unlock is circular by construction.

### The two faucets, and why they are not the same shape

The brief asked whether widening the square was the right answer for both, and it is not, because
**the sinks differ in kind**:

| kind | sink | fires |
|---|---|---|
| `essence` | `issue-dispensation` | when the god chooses |
| `passage` | `open-portal` | when the god chooses |
| `insight` | `bless-mage`; university teaching | teaching is continuous |
| **`labor`** | **the construction hire, *and* `fund-university`** | **every tick, automatically** |

A faucet that fires when *a mage chooses to spend a month* can feed a drain that fires when *the god
chooses to spend a verb*. It cannot feed one that fires **every tick whatever anybody chooses**.
That is not an argument; it is the measurement this change inherited. `fund-university` priced in
`labor` came back legal on **8 ticks of 585** with no reserve, **13 of 600** with a reserve floor,
and a bounding experiment — a reserve so high the automatic hire never drew at all — reached only
**46 of 600**. No reserve policy can fix a faucet that is dry, because a floor redistributes a
finite endowment between two claimants and cannot manufacture income.

So:

- **`essence` gets a magical faucet.** Vim is what raw magic is, its sink is discretionary, and a
  mage choosing to apply a Vim node is the right shape for a god choosing to spend one.
- **`labor` gets a non-magical faucet**: `labor-share-of-month` in `autonomy-weight.json`, a share
  of every laborer's month that is hands for hire rather than work on the land. Automatic, per
  tick, proportional to the populace — the same shape as the drain it feeds. It is also the truer
  fiction: **labour is people.** Corpus magic did not stop mattering; it *amplifies* rather than
  supplies, through the same `resource-yield` multiplier every other kind takes.

**It is an allocation, not new supply.** The share comes off `MATERIALS_PER_LABORER` *before* the
territory split, by subtraction, so a laborer's month divides between the land and the hiring hall
and the total she produces is unchanged. Adding `labor` on top would have every laborer working a
full month in the fields *and* a further fraction on a building site — the "labour is exclusive"
defect `assignedToSites` exists to prevent, re-introduced one layer down. Subtraction rather than a
second multiply is also what keeps the split exact in fixed point.

The magnitude is an anchor and not a tuning: `fp(64)` against `MATERIALS_PER_LABORER` of sixteen is
exactly **one `fp` of `labor` per neutral laborer per tick**, the same unit as
`SUBSISTENCE_PER_PERSON`. `carrying-capacity.ts` records the food margin as structural above a
laborer share of one eighth, so one sixteenth is half the headroom the economy already had.
**Untuned**, like everything around it.

### What was built first, and why it was superseded rather than deleted

The first answer was **surgical**: a 3-technique × 5-form rectangle adding the Vim column alone —
`intellego-vim`, `perdo-vim`, `rego-vim`, fifteen cells — with `labor` supplied by the populace.
Prerequisites were checked and clean (no node in those three cells requires a node outside them),
`intellego-vim`'s `iv-feel-the-air-go-tight` carries a `target: universe` `resource-yield` effect,
so the applied channel had something to route.

The author then directed otherwise, mid-task, in these words: *"the V1 set doesn't... Let's get rid
of it. Like, open the cells. Open the faucets. We're wiring things together."* So the square is now
**all seventy cells**. The narrow rectangle is recorded here rather than hidden because its `labor`
half survived the widening on its own merits: even with Corpus open, `labor`'s faucet is a mage
choosing a month and its sink still fires every tick, and the ablation below measures what the
populace share is worth on top of an open grid.

The shape of the widening — keep the `v1` flag and the rectangle check, move the constants to
5 × 14 — is taken from `origin/w115/enable-all-cells`, which did the same thing and was reverted in
this campaign's Group D. Taken from it: the `V1_*` constants and their reasoning, the
`PRIMITIVE_COVERAGE_EXCLUSIONS` emptying, and the four source comments that describe the twelve-cell
narrowing in the present tense. Not taken: its test edits, which are re-derived below against this
tree rather than inherited.

**The rectangle check is kept, and that is deliberate.** An axis mask can only express a full
technique × form product; `v1RulesetAxes` re-derives the permitted set by OR-ing the flagged cells'
axes, which is only correct while the set is rectangular. Seventy of seventy is trivially
rectangular, so the property still holds and a later narrowing is still checked for raggedness.

### Acceptance 1 — every kind has a faucet, with the tick it first flows

`tools/w247/material-faucets.mjs --out <named file>`, seed 20260813. `producedByKind` is phase 1
(the land) and `appliedByKind` is phase 5a (a mage's month); a kind absent from both has no source.

| kind | before: land | before: applied | **after: land** | **after: applied** | **first flow** |
|---|---|---|---|---|---|
| food | 127,434 | 0 | 1,052,728 | 61,832 | t0 |
| stone | 139,270 | 42,380 | 571,110 | 135,346 | t0 |
| vellum | 78,887 | 0 | 461,348 | 38,396 | t0 |
| **labor** | **0** | **0** | **60,565** | **18,216** | **t0** |
| **essence** | **0** | **0** | **0** | **18,504** | **t114** |
| insight | 0 | 1,800 | 0 | 35,856 | t619 |
| passage | 0 | 16,704 | 0 | 35,784 | t71 |

"Before" is 600 ticks; "after" is 1,200. The horizons differ **because the measurement required
it**, and that is a finding rather than a convenience: at 600 ticks on the widened grid `insight`
reads **exactly zero**, and at 1,200 it reads 35,856 with a first flow at **t619**. A total is a
statement about a horizon and hides *when*, so the probe now records the first tick each kind gained
anything — a run reported only as a sum would say "dry" and "flowing" about the same faucet
depending where it was cut off. Both readings are in named files and both are reported.

`insight` becoming *slower* is a real consequence of the widening: two nodes in the catalog yield it
and there are now 300 nodes to research instead of 51, so a mage reaches one later. Balance is
suspended; it is recorded, not tuned.

**Positive controls.** (1) On the pre-change tree the same probe read `insight` 1,800 and `passage`
16,704 on the applied channel — so the channel it was pointed at was live and the instrument could
read it, which is what makes the two zeros evidence rather than silence. (2) The `firstFlowTickByKind`
field reads `never` for `insight` at 600 ticks and `t619` at 1,200 on the same seed, so it is
capable of both answers, and the two runs agree with each other (619 > 600). (3) The probe exits 3
— not 0 — if a run produces no world reports at all, rather than folding a broken probe into "the
faucet is dry".

### Acceptance 2 — `fund-university`, all arms re-run on this tree

`tools/w247/action11-legality.mjs`, seed 20260813, 600 ticks. The previous agent's three arms were
quoted for one strategy, `founding-probe`; the whole pool is reported here because a pooled figure
was the more informative half and a single-strategy figure was what made the defect look total.

| arm | founding-probe legal | pool legal | pool foundings |
|---|---|---|---|
| **A** — no `labor` price | 398/600 (66.33%) | 8,335 | 402 |
| **B** — `labor` 4096, no reserve floor | 13/600 (2.17%) | 6,448 | 25 |
| **C** — shipped: price + floor + faucet + open grid | 20/600 (3.33%) | 6,562 | 43 |

**Arm A is the positive control and it reproduces**: 398 against the previously recorded 400, and
124 foundings against 123. The instrument still measures what it measured.

Read only at 600 ticks the restoration looks small, and reporting it any other way would be
dishonest. **Read as a rate, it is total**, and that is the property that actually changed:

| | 600 ticks | 1,200 ticks |
|---|---|---|
| **C** — faucet on | 43 pool foundings | **404** |
| **D** — faucet ablated (`labor-share-of-month` = 0) | 26 | 201 |

`founding-probe` alone goes from **9 foundings at 600 ticks to 280 at 1,200**. The previous state
produced **one or two foundings ever** and then never again, because the endowment was a runway.
This is income: it compounds with the populace that makes it. The ablation is the control that says
the populace share is doing work rather than riding on the open grid — it roughly **doubles**
foundings at both horizons — and neither arm is degenerate, so the ablation is not a null by
construction.

Where the verb is still masked at 600 ticks, it is masked **only for strategies that spend `labor`**:
`passive-control`, `permissive-breadth`, `narrow-depth`, `denial-warden`, `portal-rush`,
`idle-then-declare`, `permit-then-idle` and both alliance strategies sit at 563–597 of 600 in every
arm, because the reserve floor keeps the price payable for anyone not racing the hire for it. A verb
that is unaffordable *while you are spending it faster than you make it* is an economy working.

### Acceptance 3 — `issue-dispensation` without an endowment

`tools/w247/dispensation-reach.mjs`, seed 20260813, 1,200 ticks, two arms.

| arm | `uniform-random-legal` | `permissive-breadth` | pool legal ticks |
|---|---|---|---|
| endowed (shipped, `FOUNDING_ESSENCE` 32,768) | 972/986 | 1,192/1,200 | 2,164 |
| **un-endowed (`FOUNDING_ESSENCE` 0)** | **333/1,200** | 0/1,200 | **333** |

Action 5 is legal on **333 ticks of 1,200 starting from zero `essence`**. Before this change that
number was zero *by construction* — production was exactly zero, so a universe with no endowment
could never hold enough to pay for it on any tick of any horizon.

The endowed arm is the positive control. The un-endowed arm carries its own second control inside
one run: `permissive-breadth` reads 0 and `uniform-random-legal` reads 333, so the probe
distinguishes a verb that never became legal from one that did, and it keeps *"the verb never
appeared in the audit"* (`null`) distinct from *"it appeared and was never legal"* (`0`) — folding
those two together is how a RED test passes on `undefined === 0`.

**A separate finding, not this change's**: `timesApplied` is **0** in both arms while
`permissive-breadth` submits the verb 1,192 times. The mask permits it and the resolver refuses it,
which is a mask/resolver disagreement of the same family already recorded above for action 12. It is
reported rather than fixed.

### Acceptance 4 — all seven kinds are producible from the opening position

Yes, all seven, with no exceptions to state. The first-flow column in Acceptance 1 is the evidence:
`food`, `stone`, `vellum` and `labor` from tick 0, `passage` at t71, `essence` at t114, `insight` at
t619. `labor` is the only one produced by the populace rather than by magic, and that asymmetry is
on purpose, for the reason at the top of this section.

### Conservation is untouched, and that was checked rather than assumed

The populace faucet is inside `materialsProduced`, which phase 1 already feeds into the ledger's
faucet side, so `delta == faucet − sink` learns about it for free. Neither faucet adds an RNG draw —
one is a share of a quantity the tick already had, the other is the existing applied-magic channel
routed through a form that was already in `form.json` — so no stream id moves and nothing re-rolls.

### Wiring consequences of opening the grid, reported rather than solved

Measured **2026-08-16** on this branch. None of these is repaired here; each is a finding about a
subsystem the widening woke up or put to sleep.

**1. Raid looting is silently inert.** `rival-universe.ts`'s `shelveForeignBooks` picks the rival's
shelf from cells **not flagged `"v1"`** — the *content* gate — while `raid-constant.json`'s gloss
for `rival-foreign-book-count` describes it as *"cells this universe's own ruleset forbids"* — the
*god's* gate. The two coincided while twelve of seventy were flagged. With all seventy flagged,
`foreign` is empty, the early return fires, and no rival shelves anything. Re-keying it to
`permits()` would not fix it today either: the reference universe's opening ruleset permits all
seventy, so there is nothing to forbid, and it needs a narrow opening square — `seededOpeningAxes`
is where one would come from. That is a design decision, not a comment fix, and it is recorded in
the function rather than taken.

`raiderNodeCandidates` in the same file reads the flag too and moves the *other* way: it now admits
every node, widening the warband's pool. That is safe for the reason the restriction was written —
the set means *"what arbitration would not mask"*, and nothing is masked when nothing is forbidden.

**2. Species depth ceilings can bind for the first time.**

| | nodes | max authored tier | tier-5+ nodes |
|---|---|---|---|
| the old twelve cells | 51 | **5** | 2 |
| all seventy | 300 | **6** | 16 |

Against `species.json`'s `depthCeiling`: `orc` 3, `human` 4, `gnome` 4 already bound; `dwarf` 5 did
not bind and **now does**; `elf` 6 and `draconic` 7 still do not. More important than the one
species crossing over is the density — two reachable nodes above tier 4 became sixteen — so a
ceiling that was *close to inert* is now a live constraint on most of the pool.

**3. `fertility` and `lifespan` reach a body for the first time.**
`knowledge-vitality.ts` recorded its own worth as *"zero, in any v1 universe … all twenty-two
authored nodes sit outside the twelve enabled cells"*, and named its closing condition as *"an
authored effect on a v1 node, or a v1 rectangle that includes Corpus"*. The second is what
happened. `PRIMITIVE_COVERAGE_EXCLUSIONS` empties accordingly.

**4. The frontier scan now pays the cost it was designed to bound.** `gateway.ts` narrowed 300
nodes to 51 once per gateway; with nothing forbidden it walks all 300. The bound is unchanged and
is a *rule* rather than a constant — a god who forbids cells still shrinks it — which is exactly
the property that replaced the old `min(nodeCount, 256)` window.

**5. `insight` slows down.** Two nodes in the catalog yield it, against 300 nodes to research
instead of 51, so a mage reaches one later: first flow moves from inside 600 ticks to **t619**. It
is a real cost of the widening and is reported, not tuned.

The four source comments that stated the twelve-cell narrowing in the present tense were corrected
in the same pass — `frontier-index.ts`, `gateway.ts`, `god/ascension.ts` (three places),
`academic-effects.ts`, `knowledge-vitality.ts` and `world-step.ts`. Where the surrounding text still
matched, the wording is taken verbatim from `origin/w115/enable-all-cells`; where this tree had
moved past it, the correction is re-derived. `git grep`'s pathspec form returned **nothing at all**
for a string known to be present, which is why the search was re-run with a positive control first —
the same "checker answering about the wrong input" shape `CLAUDE.md` catalogues.

### `npm run verify` after opening the grid — 52 failures, triaged and left red

Run **2026-08-16** on `w247/material-economy-build` @ `9dd68d52`, clean tree, no other suite running
(the previous run was stopped and its workers confirmed drained first — a suite reading a tree that
changes underneath it produces failures nobody can attribute).

    Test Files  22 failed | 330 passed (352)
         Tests  52 failed | 4875 passed (4927)
    REAL_VERIFY_EXIT=1

`typecheck`, `lint`, `check:purity`, `check:content`, `check:audio`, `check:coverage` and
`check:generated` all passed; every failure is in the suite. **None is re-pinned.** Balance is
suspended for this campaign and the instruction is that failures from opening the square are
findings; re-pinning an assertion is how a measurement becomes a story.

**No failure is a defect in the two faucets.** The one that could have been —
`annihilation-registry.test.ts`, which asserts the exact set of functions that floor a live quantity
to zero — names `lifespan:effectiveLifespan` (15/240 ticks) and `target-appeal:effortTerm` (1/240).
Both are sites the widened grid woke up; neither is `materialsProduced`, whose new `mul` is the
faucet's only added arithmetic.

**Group A — the assertion restates the content decision (20).** These are the twelve-cell rectangle
written down a second time. Updating them is part of this change's diff and is deliberately *not*
done here, so that one reviewer can see the whole of what the widening moved in one place;
`origin/w115/enable-all-cells` carries the corresponding edits for most of these files.

| file | what it pinned |
|---|---|
| `content/loader-hard-fail.test.ts` (3) | a thirteenth v1 cell is rejected; a ragged v1 set names its uneven axes; a v1 node with a non-v1 prerequisite is refused. All three seed synthetic content against `V1_CELL_COUNT`, and with the subset at seventy there is no thirteenth cell and no non-v1 cell to hang a prerequisite on |
| `content/shipped-content.test.ts` (3) | "flags exactly the twelve v1 cells"; the count report; "resolves a non-v1 cell as addressable but unflagged" — there is no unflagged cell now |
| `content/validation-cli.test.ts` (3) | the CLI's count line, and two seeded-violation lists that included `v1-unreachable-prerequisite` |
| `rules-magic/primitive-coverage.test.ts` (2) | "declares exactly the two exclusions the design accepted", and the direction-two check that fires when an exclusion becomes covered — **it fired correctly**, which is the check working |
| `rules-magic/primitive-consumption.test.ts` (1) | that the coverage list still stands while the consumption list is empty |
| `primitives/breaker-qwen.test.ts` (1) | that `PRIMITIVE_COVERAGE_EXCLUSIONS` has not moved off `['fertility','lifespan']` |
| `scenario/opening-square.test.ts` (1) | "opens exactly the twelve cells content flags v1" |
| `scenario/reference-universe.test.ts` (1) | "permits exactly the twelve cells content flags v1, and no thirteenth" |
| `coordination/frontier-scan-window.test.ts` (4) | the historical record of what the old `min(nodeCount,256)` window cost *the twelve-cell subset* — four hidden tier-1 roots, eighteen of fifty-one nodes out of reach. The numbers are true of a subset that no longer exists |
| `coordination/academic-effects.test.ts` (1) | the control arm is built from **inert non-v1 nodes tier-matched to the treatment**; with every cell flagged there is no inert node at tier 6 left to match `cf-the-given-destiny`. A fixture consequence, not a rate result |

**Group B — the assertion pins a measured outcome of running the simulation (32).** Left red on
purpose. Every one of these is a number that moved because the game changed, which is the thing
balance suspension exists to permit.

| file | what it pinned |
|---|---|
| `scenario/species-occupancy.test.ts` (6) | founding cell spread, the ruleset ceiling of twelve, which cells each species is missing at twenty world years |
| `scenario/species-versatility.test.ts` (4) | "four live affinity entries and seven inert"; "human and gnome have no live entry"; 12/12 breadth. Every authored affinity is live now, which is the point w115 measured |
| `scenario/species-separation-spread.test.ts` (4) | three species-order separations, now `inconclusive` or `refuted` across seed sets |
| `scenario/raid-metrics.test.ts` (4) | the raid histogram, cost and action-economy denominator |
| `scenario/causal-chain-build-rate.test.ts` (4) | the five links of the `build-rate` chain, including the forbid-the-cell ablation — its arm forbids one cell out of seventy instead of one out of twelve |
| `scenario/strategy-shadowing.test.ts` (2) | the known-shadowed list; `portal-rush/1` is newly shadowed |
| `scenario/reference-long-run.test.ts` (2) | two-century birth/death convergence, and the teaching/scribing wave |
| `scenario/combat-ablation-reaches-a-raid.test.ts` (2) | that neutralising `knowledge-steal` changes the raid log on two named seeds |
| `scenario/annihilation-registry.test.ts` (1) | the exact set of floor-to-zero sites; two woke up |
| `scenario/reference-time-to-tier.test.ts` (1) | the time-to-tier separations that survive a seed re-roll |
| `rules-magic/effect-stacking.test.ts` (1) | end-to-end stacking over two held nodes chosen from the subset |
| **`scenario/raid-engagement.test.ts` (1)** | **"looting brings home nodes from cells this universe would never have permitted"** — this is the corroboration of finding 1 above. The test is red because the mechanism is genuinely inert, not because a number drifted, and it is the one Group B failure that is a **defect** rather than a movement |
