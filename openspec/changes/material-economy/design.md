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
to a save. (The parent brief cited `contracts.md` §4.4 for this; §4.4 on this ref is
*"Parameterized actions and the explain channel"* and says nothing about schema revisions.
`grep -rn "order of arrival"` over `docs/`, `packages/` and `openspec/` returns nothing. The
resolution is unchanged; the citation was stale.)

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
