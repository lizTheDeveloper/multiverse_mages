# W49 — mētis from applied use: the measurement that decides it

**Status: the gating measurement failed. No accrual was built.**

`openspec/changes/metis-knowledge` defines what mētis *is* and has no answer for where it comes
from. `docs/design/raid-engagement.md` §11c rules that it comes from **applied use, not study**, and
that the working economy is the larger source because it runs every tick of peacetime. §11c also
makes a specific, falsifiable claim about why that matters:

> **If applied use generates mētis, the bot that permits everything and does nothing accumulates
> none.** Not because it was penalised, but because mētis is a record of practice and it did not
> practise.

That claim has a precondition: **that an idle god's universe does not apply magic to its economy
anyway.** §11c says so itself — *"it should be measured before it is believed."* This document is
that measurement. It was run before any accrual code was written, and it says stop.

## 0. The one-sentence result

Under W29's wire, magic reaches the economy by **being known**, not by being **used** — so
`permit-then-idle`, the bot the mechanic was aimed at, is the single **largest** applier of magic in
the pool. Accrual on this hook would not fail to penalise the idle bot. It would **reward** it.

## 1. How the measurement works

`tools/w49/applied-use.mjs` evaluates the accrual predicate every tick, before there is a mechanic
to accrue. One credit per (instance, tick) — `appliedUseInstanceTicks` — for every knowledge
instance that

1. sits at `mind` or `palace`,
2. holds `mastery >= MASTERY_ACTIVATION_THRESHOLD`,
3. whose cell is `permits(ruleset, cell)` **at application time**, and
4. whose node carries a `target: "universe"` effect on `resource-yield` or `build-rate`.

Those are `gatherEffects`' four gates plus `universe-effects.ts`'s two filters. They are restated
rather than called because accrual needs the **holder** — `row.locationId`, the mage's
`EntityHandle` — and `EffectSourceInstance` drops it at `packages/coordination/src/universe-effects.ts:250`.

Two checks stop the restatement from being a private rule:

- **Agreement.** The probe compares its own per-tick instance count against the world report's
  `economicNodes` every tick. Reported, not assumed.
- **Inertness.** `--check-inert` runs a probed and an unprobed episode at the same coordinates and
  compares snapshot hash, terminal reason and tick count. Four of four byte-identical.

Arms are matched-seed: the same `(rootSeed, sweepId, cellIndex, replicateIndex)` grid for every
strategy, with the strategy supplied out of band. This is deliberate — a committed sweep's
`round-robin` assignment deals each strategy a **disjoint** set of replicate indexes, so comparing
arms taken from one would compare seeds. `tools/w15/run-arm.mjs` records the same trap.

Cells are the committed ascension sweep's corners: cell 0 (`cohortSize 4`, `foundingNodes 1`) and
cell 3 (`cohortSize 12`, `foundingNodes 4`). Root seed `20260811`, matching the committed sweeps.

## 2. Q1 — how much magic an idle universe applies

<!--NUMBERS-Q1-->

## 3. Q2 — whether `permit-then-idle`'s advantage moves

**Not run, and the reason is the number above, not a shortage of time.**

The sweep that would answer it — same seeds, with and without accrual — measures whether a mechanic
moves a bot's ascension rate. There is no point running it, because the mechanic as §11c specifies
it cannot be built on this hook without inverting its own claim. The result to record is the one
that failed the gate, and it is stated in §2 as a ratio.

This is the seventh mechanic aimed at `permit-then-idle` and it is the first to die **before** the
build rather than after it. That is the measurement doing its job.

## 4. Q3 — whether two universes with different territory diverge

**Under this hook, no — by construction, not by measurement.**

`packages/content/data/territory.json` carries exactly the differentiation §11c describes: a
`river-delta` yields `food 2048 / stone 128 / vellum 384` per land unit, a `highland-waste` yields
`food 64 / stone 512 / vellum 64`. The delta and the quarry are authored and they differ.

They cannot differ in mētis, because the accrual predicate never reads them. It reads which nodes
are held above threshold in permitted cells. Two universes with identical rulesets and different
land accrue **identical** applied use and differ only in what the land pays out. The divergence
§11c wants — *"a realm that irrigates accumulates Aquam mētis; one that quarries accumulates
Terram"* — requires accrual to key on the work, and the work is not in the predicate.

What *does* diverge is the **ruleset**, and that is measurable:

<!--NUMBERS-Q3-->

## 5. Why it comes out this way — three structural facts

### 5a. No mage in this game ever applies magic to anything

`packages/rules-world/src/autonomy/goals.ts` holds the permanent goal registry, and it has nine
entries: `idle`, `researchNode`, `rediscoverNode`, `seekTeaching`, `teach`, `scribe`, `affiliate`,
`wardDuty`, `raidReadiness`. Five are study or transmission; four spend nothing. **None of them
applies magic to production.**

The economy's own labour is populace, not mages: `materialsProduced` counts `laborerCount` cohorts,
and `planConstructionLabour` sends *laborers* to sites. A mage is never on the roster of anyone
doing the work.

So `universeEconomyBonuses` reads `KNOWLEDGE_INSTANCE` each tick and derives multipliers from what
mages **know**. Nobody casts. There is no act to be a record of, which is the exact thing mētis is
supposed to be a record of.

### 5b. The game already knows this operation is missing, and has named it

`packages/rules-magic/src/instances/decay.ts:115`, about itself:

> *"Nothing in this subsystem restores mastery; **practice does, and practice is an operation
> somebody has to perform.**"*

`docs/design/ages-of-magic.md` §2c takes it further, from the other side: §5 lists six operations on
knowledge and practice is not one of them, which is why the game has *"perish without publish"* and
why 93.4% of held instances sit below the teach threshold.

**The hook mētis-from-use needs is the same missing operation.** It was missing before this change
was proposed and it is still missing.

### 5c. The only god lever on the economic path is the permit gate, and it points the wrong way

There is no funding, blessing, granting or building step in the application path. The single lever
is `permits(ruleset, cell)`, evaluated at application time. So:

- a god who **permits more** applies more magic,
- a god who **forbids** applies less,
- and a god who does **nothing else at all** is indistinguishable from one who does everything.

`permit-then-idle` permits the whole grid across its first 140 rounds and then submits nothing for
the remaining 2260 ticks. On this hook it is the maximal case.

The founding ruleset makes the size of the effect concrete. Twelve of seventy cells are permitted at
founding — `{intellego, perdo, rego} × {mentem, terram, limen, nomen}` — and they contain **8 of the
74** nodes carrying an economic universe effect, all of them Terram. Opening the grid multiplies the
reachable economic content by more than nine, and opening the grid is the one thing the idle bot
does.

## 6. What to do instead — the recommended hook

Build `practice` as an autonomy goal, and accrue mētis to it.

- A tenth entry in the permanent goal registry, scored and committed like the other nine, spending a
  mage's month through `spendTheMonth` and `EFFORT_PROGRESS` the way research, teaching and scribing
  already do.
- It **competes**. A mage practising is not researching, not teaching, not on the wall. That is what
  makes it a choice the god's verbs can move, and §2b's allocation argument already covers the
  shape.
- It restores mastery, which closes §2c's publish-or-perish loop with the counterweight that ruling
  says was never built — so the same commit pays two debts.
- It is what `resource-yield` and `build-rate` should gate on, so the economy reads *work performed*
  rather than *knowledge held*, and territory finally reaches the knowledge layer.
- Mētis then accrues to the mage who practised, in the form she practised in, and is losable by
  disuse for free, because a mage who stops committing to `practice` stops restoring mastery.

This is a `mages-and-species` autonomy change, not a `knowledge-model` one. It is larger than what
W49 was scoped to build, and it is the honest prerequisite. Attaching mētis to the passive read
would have shipped a mechanic whose headline claim is the reverse of its behaviour.

## 7. The battle half, for whoever takes it

Not built — it needs raids reachable, which is a separate branch. What is inherited:

- **§11c's three open questions are still open** and the middle one is load-bearing: *is battle
  mētis its own node, or a mastery term on nodes already held?* The recommendation in §6 pushes
  toward the **mastery term**, because a `practice` goal restoring mastery and a raid restoring
  mastery are then the same arithmetic under two triggers, and the teach threshold is reached
  directly. Its own node needs a second authoring pass over the grid and a second loss path.
- **Battle does not have the problem the economy has.** A raid is an act somebody performs, with a
  roster of who was there and who came home. The attribution the economy lacks is already present in
  an engagement, so the battle half can be built on the passive-vs-active distinction the economy
  half could not.
- **Survivors-only matches the fiction** and is the harshest reading, per §11c's own note. It is
  also the only reading under which *"but only if they make it home to teach"* has teeth.
- The measurement to run for it is the same shape as this one: does a bot that never raids accrue
  none? Unlike the economy, the answer is probably yes — which is why the battle half may survive
  the gate that killed this one.

## 8. What this branch contains

- `tools/w49/applied-use.mjs` — the probe, the predicate, the agreement check and `--check-inert`.
- A merge of `w29/city-and-supply-chain` (PR #42), because the wire only exists there.
- **No accrual code, no content, no schema change, no metric.** The gate said stop, and
  `docs/design/release-plan.md` forbids the claim that would have justified building anyway.

### Randomness

**No RNG draw was added, in any subsystem.** The probe is a read. `RNG_STREAM` is unchanged and
still ends at `terrain: 11`; the economy takes no draws today and takes none after this branch. The
inertness check is the evidence: probed and unprobed runs produce identical snapshot hashes.

### Baselines

**Not regenerated.** The three baselines were taken from W29's side of the merge provisionally and
no simulation behaviour changed on this branch, so there is nothing for a regeneration to claim.
