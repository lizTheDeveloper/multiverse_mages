# W49 — mētis from applied use: the measurement that decides it

**Status: the gating measurement failed. No accrual was built.**

> **Re-decided 2026-08-14 by `w196/mastery-rises`, at `origin/main` `59dfc637`.** The ruling below
> stands; §5a's premise does not, and §6's recommendation has now been built. See
> [§10](#10-the-re-decision-2026-08-14) at the end of this document — added by the change that
> implemented it, not by a reader.

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

Under W29's wire, magic reaches the economy by **being known**, not by being **used**. So
`permit-then-idle` applies magic at **1.0001×** the rate of `permissive-breadth`, the active bot it
is the ablation of, and **877×** the rate of `denial-warden`, the bot that uses its verbs hardest.

Accrual on this hook would not fail to penalise the idle bot. It would rank the pool by how little
the god interferes.

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

Two checks stop the restatement from being a private rule.

**Agreement.** The probe compares its own per-tick instance count against the world report's
`economicNodes`. Across all five arms at 600 ticks: **5904 of 5904 ticks carried a report**,
report/probe = **1.1265**, and the report came in below the probe on **7.86%** of ticks. Both
deviations are expected and neither is a predicate mismatch:

- the report counts **contributions** — one per (instance, economic primitive) — where the probe
  counts **instances**, and the shipped content carries 92 economic effects across 74 nodes, a ratio
  of 1.243, which brackets the observed 1.13 from above;
- `universeEconomyBonuses` runs in **phase 1**, before mortality, work, autonomy and decay, while the
  probe runs after all of them. So the probe sees the end of the tick and the report describes its
  beginning, and an instance gained this tick appears in one and not the other. That is the only
  direction that can produce report < probe, which is the 7.86%.

This check was **wrong in its first form and reported "clean" for every run** because
`defineWorldSimulation` takes deps and nothing else, so the `onReport` callback passed to it was
silently dropped and the comparison never evaluated. It now reads `lastReport()` and reports its own
coverage, because a vacuous check is worse than no check — it is the one that gets quoted. The
applied-use figures were unaffected: the probe derives them without reading the report at all, and
they are byte-identical either side of the fix.

**Inertness.** `--check-inert` runs a probed and an unprobed episode at the same coordinates and
compares snapshot hash, terminal reason and tick count. **Ten of ten byte-identical**, all five arms
at both cells.

Arms are matched-seed: the same `(rootSeed, sweepId, cellIndex, replicateIndex)` grid for every
strategy, with the strategy supplied out of band. This is deliberate — a committed sweep's
`round-robin` assignment deals each strategy a **disjoint** set of replicate indexes, so comparing
arms taken from one would compare seeds. `tools/w15/run-arm.mjs` records the same trap.

Cells are the committed ascension sweep's corners: cell 0 (`cohortSize 4`, `foundingNodes 1`) and
cell 3 (`cohortSize 12`, `foundingNodes 4`). Root seed `20260811`, matching the committed sweeps.

## 2. Q1 — how much magic an idle universe applies

Five strategies, three replicates at each of two starting cells, 2400-tick cap. `use/tick` is
`appliedUseInstanceTicks` divided by ticks observed, which is the only like-for-like column — the
ascending arms terminate around tick 1100 and the others run the full 2400.

| strategy | mean ticks | **use/tick** | ticks with any application | distinct holders | form mix |
|---|---:|---:|---:|---:|---|
| `passive-control` | 2400 | **21.11** | 98.8% | 143 | Terram 100% |
| `permit-then-idle` | 1082 | **118.78** | 98.6% | 92 | Animal 18, Aquam 18, Terram 17, Auram 17, Herbam 16, Ignem 12, Corpus 1 |
| `permissive-breadth` | 1122 | **118.77** | 99.1% | 92 | Terram 18, Aquam 18, Animal 17, Herbam 16, Auram 16, Ignem 12, Corpus 1 |
| `denial-warden` | 1768 | **0.14** | 1.6% | 7 | Terram 100% |
| `archivist` | 2400 | **379.22** | 99.2% | 3529 | Terram 100% |

**Yes, and a great deal.** A universe with zero god input applies magic economically on **98.8% of
ticks** — 21.11 contributing instances every tick, across 143 distinct mages over a run. It is not a
trickle. Application is the normal state of a universe nobody is playing.

Four ratios, all matched-seed:

    permit-then-idle / permissive-breadth  =  1.0001
    permit-then-idle / passive-control     =  5.63
    permit-then-idle / denial-warden       =  877
    archivist        / permit-then-idle    =  3.19

**The first ratio is the whole result.** `permit-then-idle` is the ablation of `permissive-breadth` —
the same opening, with every action after round 140 replaced by nothing. On this hook the two are
**indistinguishable to four significant figures.** 2260 ticks of doing nothing cost the idle bot
0.01% of its applied use.

The mechanic's claim is that the idle bot *"accumulates none."* It accumulates **the same amount as
the bot that plays**.

And the other three ratios say the hook is worse than merely inert. It is **anti-correlated with
playing**:

- `denial-warden` — the god that uses its verbs hardest, interdicting cells — accrues **877× less**
  than the god that does nothing.
- `archivist` accrues **3.19× more** than either permit-everything bot, at 3529 holders against 92,
  because it maximises mage count and every mage is a passive applier.

A mētis mechanic on this hook would rank the pool *almost* by how little the god interferes — almost,
because `archivist` breaks the monotonicity by playing hard in a direction that happens to grow the
mage count. Which is the same point from the other side: what the hook rewards is **population
holding permitted knowledge**, and a god's verbs reach that only by accident.

## 3. Q2 — whether `permit-then-idle`'s advantage moves

**Not run, and the reason is the number above, not a shortage of time.**

The sweep that would answer it — same seeds, with and without accrual — measures whether a mechanic
moves a bot's ascension rate. There is no point running it, because the mechanic as §11c specifies
it cannot be built on this hook without inverting its own claim. The result to record is the one
that failed the gate, and it is stated in §2 as a ratio.

This is the seventh mechanic aimed at `permit-then-idle` and it is the first to die **before** the
build rather than after it. That is the measurement doing its job.

One correction to the brief this work was given, since it will be quoted again: the bot currently
wins **40/40**, not 38/40. `balance/results-integration-r2.txt` records `permit-then-idle` at 40/40
and `permissive-breadth` — the strategy it is the ablation of — at 38/40. The idle bot is not
matching the active one. It is beating it.

## 4. Q3 — whether two universes with different territory diverge

**Under this hook, no — by construction, not by measurement.**

`packages/content/data/territory.json` carries exactly the differentiation §11c describes: a
`river-delta` yields `food 2048 / stone 128 / vellum 384` per land unit, a `highland-waste` yields
`food 64 / stone 512 / vellum 64`. The delta and the quarry are authored and they differ.

The predicate never reads them. It reads which nodes are held above threshold in permitted cells.

Two universes with identical rulesets and different land would still differ in *how much* applied
use they accrue — territory moves food, food moves population, population moves the mage count, and
the mage count moves the number of instances. That divergence is **demographic**, and it would exist
under any hook whatsoever.

What they cannot differ in is **form composition**, and form composition is the whole of the claim.
*"A realm that irrigates accumulates Aquam mētis; one that quarries accumulates Terram"* asks for the
*kind* of practitioner knowledge to follow the *kind* of work. Under this predicate the form mix is
set by the ruleset and by what the autonomy layer chose to research — the delta and the quarry, given
the same edicts, accrue the same mix in different volumes. The divergence §11c wants requires accrual
to key on the work, and the work is not in the predicate.

What *does* diverge is the **ruleset**, and that is measurable:

Form mix splits the pool cleanly in two, and the line it splits on is **whether the god opened the
grid** — not what the universe did with it.

- `passive-control`, `denial-warden` and `archivist`: **Terram 100%**.
- `permit-then-idle` and `permissive-breadth`: seven forms, near-uniform — Animal/Aquam/Terram 17–18%
  each, Herbam and Auram 16–17%, Ignem 12%, Corpus 1%.

The 100%-Terram arms are all bottlenecked by §5c's founding ruleset: the twelve cells permitted at
founding hold 8 of the 74 economic nodes and every one is Terram. `archivist` is the informative
case — it accrues **more applied use than anybody** (379/tick) and its form mix is **identical to the
do-nothing arm's**, because it spends its verbs on scribing rather than on permitting. Volume and
composition are set by two different things, and neither of them is the work.

The two permit-everything arms then converge on each other — the near-uniform mix is just *what the
grid contains* once the gate is open, and the divergence between them is inside the noise. **Two
universes that both permit everything accumulate the same mētis regardless of what they do.**

So there is real differentiation available here, and it is the wrong differentiation. It tracks the
**ruleset**, which is what `permits()` already reports and what W28's regime work already measures.
The claim §11c makes — that the divergence should come *"from what a universe actually does"*, the
way W24's siting produced divergence in materials — is not delivered by this hook and cannot be.

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
the remaining 2260 ticks. It is not quite the maximum — `archivist` beats it 3.19× by growing a
population of 3529 passive appliers inside the founding twelve cells — but it reaches the maximum
*breadth* for free, and it is the arm the mechanic was aimed at.

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

## 8. Where the two design documents cited here live

**Neither `docs/design/raid-engagement.md` nor `docs/design/ages-of-magic.md` is on `main`,** and so
neither is on this branch. Both are on `design/raid-engagement`, which is where §11c — the ruling this
whole measurement tests — was written. Quotations above were taken from that branch at
`c7dab18`. Whoever lands either document should expect this file to start resolving its own
references.

## 9. What this branch contains

- `tools/w49/applied-use.mjs` — the probe, the predicate, the agreement check and `--check-inert`.
- A merge of `w29/city-and-supply-chain` (PR #42), because the wire only exists there.
- **No accrual code, no content, no schema change, no metric.** The gate said stop, and
  `docs/design/release-plan.md` forbids the claim that would have justified building anyway.

### Four stale facts found on the way, flagged rather than fixed

Not touched, because none is this branch's business and two of them are load-bearing enough that
someone should change them deliberately:

- **`CLAUDE.md` says `WORLD_SCHEMA_VERSION` is 3.** `packages/state/src/migrations.ts:121` says 5 —
  revisions 4 (`god-agency`) and 5 (`city-and-supply-chain`'s `material-stock`, which also removes
  `universe.materials`) landed after that paragraph was written.
- **"`gatherEffects` has no production caller" is stale everywhere it appears** —
  `docs/design/vision-audit.md`, `docs/design/campaign-plan.md`,
  `docs/design/strategy-dimensionality.md`, `scripts/check-primitive-consumption.mjs` and the header
  of `packages/rules-magic/src/effects/consumption.ts`. `universe-effects.ts` is that caller.
- **`packages/scenario/src/content-set.ts`'s consumption note is stale in the other direction.** It
  says `world-step.ts` passes `resourceYieldBonuses: []`; it now passes `economy.resourceYield`. So
  the consumption report may be *understating* what is wired.
- **The brief's 38/40 belongs to `permissive-breadth`.** See §3.

### One inherited test failure, which is the merge's and not this branch's

`packages/scenario/test/unit/reference-long-run.test.ts` — *"9.5 — teaching now sustains, and
scribing survives the whole run"* — fails on this tree: `no lesson taught in 20-year window 9`.
3989 of 3990 tests pass.

It is **a property of the merge**, not of anything here. This branch's diff after the merge commit
touches five files — one `.mjs` tool, one document, two result JSONs and `.gitignore` — and **zero
TypeScript under `packages/`**. Nothing on this branch can move a simulation.

The test is a deliberate tripwire and says so in its own prose: *"This tripwire has fired twice
already and been rewritten both times, which is what a tripwire is for."* It has now fired a third
time, on the interaction between `main`'s frontier-predicate work and W29's material split — each
side green alone, the union not. That is exactly the class of thing a tripwire exists to catch, and
it wants the hand of whoever lands #42, who can see both sides. **It must not be rewritten to go
green by someone who has not found the cause**, which is the third time that instruction would
apply.

### The three balance gates, and why they are red

All three report `baseline-invalid`, and the gate states the cause in its own words:

    provenance.contentHash is "ba7be8d68b582e2985e0360bbc7e11b0" and the baseline was
    recorded at "2c67315ae04ee6c74dfa204474af4eb6". The gate compares two runs of one
    build; across two builds a delta is not a regression, it is a category error.

Measured on all three, each reporting that line and no other cause: `balance:gate` (200 runs,
4.7 s), `balance:gate:horizon` (200 runs, 29.7 s), `balance:gate:ascension` (32 runs, 504.1 s).

The baselines were taken from W29's side of the merge provisionally, and the merged tree's content
revision is a third value because `main`'s `max-summons-per-side` edit joined it. The gate is not
reporting a behaviour change; it is refusing to compare two builds, which is exactly what it should
do.

### Randomness

**No RNG draw was added, in any subsystem.** The probe is a read. `RNG_STREAM` is unchanged and
still ends at `terrain: 11`; the economy takes no draws today and takes none after this branch. The
inertness check is the evidence: probed and unprobed runs produce identical snapshot hashes.

### Baselines

**Not regenerated.** The three baselines were taken from W29's side of the merge provisionally and
no simulation behaviour changed on this branch, so there is nothing for a regeneration to claim.

---

## 10. The re-decision, 2026-08-14

Written by `w196/mastery-rises`, against the tree at `origin/main` `59dfc637`. The brief was: this
document rejected mētis-from-use, its gating measurement is PR #50 (merged 2026-08-13), and
`applyMagic` landed as PR #127 (merged 2026-08-14) — so **the ruling that killed the natural
mechanism for raising mastery was decided against a tree with no applied-work verb.** Both dates are
confirmed from `git log`: `044b9bd0` for this document, `14155e77` for
`packages/rules-world/src/economy/application.ts`.

### 10a. What is stale

**§5a is false on this tree.** It says:

> *"`packages/rules-world/src/autonomy/goals.ts` holds the permanent goal registry, and it has nine
> entries… **None of them applies magic to production.**"*

`GOAL.applyMagic` is id 9 and `economy/application.ts` is its arithmetic. A mage spends the month
casting one node she holds at the world, eats a ration for it, and puts materials into the stocks.
The sentence *"No mage in this game ever applies magic to anything"* — §5a's own heading — is a
statement about a tree that no longer exists, and it should be read as dated.

### 10b. What survives, intact and load-bearing

**Everything in §2, §4 and §5c.** The finding was never *"mastery must not rise from use"*. It was
much narrower and much stronger:

> Accrual on a **passively-held-knowledge** hook ranks the pool by how little the god interferes.
> `permit-then-idle` / `permissive-breadth` = **1.0001**. `permit-then-idle` / `denial-warden` =
> **877**.

That is a property of the *predicate*, not of the era. Any accrual keyed on "which nodes are held
above a threshold in permitted cells" has it, today and on `main`, because the only god lever on
that path is still `permits()`. §4's form-mix result is the same finding from the other side: the
composition tracks the ruleset, not the work.

**`w196` satisfies the surviving constraint by construction.** It accrues to a goal, and a goal
costs a month. A mage practising is not researching, not teaching, not scribing and not on the wall.
An idle god's universe does not get it for free, because the mages had to spend something to get it
and the thing they spent is the scarcest quantity in the game.

### 10c. §6 is what got built, under the name it was given

§6 — *"What to do instead — the recommended hook"* — asked for exactly this and was specific about
the shape:

> *"Build `practice` as an autonomy goal… A tenth entry in the permanent goal registry, scored and
> committed like the other nine… **It competes.** A mage practising is not researching, not
> teaching, not on the wall… **It restores mastery**, which closes §2c's publish-or-perish loop with
> the counterweight that ruling says was never built."*

`GOAL.practice` is that tenth entry, at id 10, appended. `packages/rules-magic/src/instances/practice.ts`
is the arithmetic. §5b quoted `decay.ts` — *"nothing in this subsystem restores mastery; practice
does, and practice is an operation somebody has to perform"* — and that sentence now points at a
module instead of at a gap.

Two departures from §6 as written, both deliberate:

- **No `EFFORT_PROGRESS` row.** §6 said practice should spend a month *"through `spendTheMonth` and
  `EFFORT_PROGRESS` the way research, teaching and scribing already do."* Those three are
  **projects**: they bank progress against an authored requirement and produce an instance when it
  is met. Practice has no completion — only a mastery that is higher this month than last — so the
  month is spent immediately onto the instance's own `mastery` field. That is one fewer component
  row per practising mage per node and one fewer thing a save carries.
- **`resource-yield` and `build-rate` still gate on knowledge held, not on work performed.** §6
  wanted the economy rewired onto the new verb. That is a separate change with its own measurement,
  and folding it in here would have put a balance-moving economy rewire inside a knowledge-lifecycle
  fix. The verb it would need now exists, which is the part §6 could not assume.

### 10d. What this does *not* re-decide

**Mētis itself is still not built.** `openspec/changes/metis-knowledge` is 1/51 and this change adds
no mētis resource, no mētis node, and no accrual of anything called mētis. What it adds is the
**mastery term** §7 said the recommendation pushed toward:

> *"is battle mētis its own node, or a mastery term on nodes already held? The recommendation in §6
> pushes toward the **mastery term**, because a `practice` goal restoring mastery and a raid
> restoring mastery are then the same arithmetic under two triggers."*

There are two triggers already — the goal, and casting at the world, which calls the same function
and is why a low-tier caster stays castable without ever going back to a desk. A raid would be a
third, and it would be one call rather than a mechanic.

### 10e. The measurement this re-decision was taken against

`tools/w196/mastery-crossings.mjs`, root seed `20260811`, sweep id `w196-mastery-crossings-v1`,
2 strategies × 2 starting cells × 3 replicates × 600 ticks, on `origin/main` (`cf5a73a7`, the branch
base) and on `w196/mastery-rises`:

| | upward crossings of the teach threshold | distinct nodes | runs positive |
|---|---:|---:|---:|
| before | **0** | 0 | 0 / 12 |
| after | **69** | 11 | 12 / 12 |

The probe is inert on all four arms — probed and unprobed runs are byte-identical in snapshot hash,
terminal reason and tick count — and it carries a positive control: 31–150 nodes per run are *born*
at or above the threshold from god grants, which is the same comparison firing on a path known to
produce values. A run where the control does not fire exits `42` rather than reporting `0`.
