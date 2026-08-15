<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Spec sequencing — what is coming, what it fixes, and what waits for what

> **Written 2026-08-14 (late), read against `origin/main` at `9cfe582`.**
> Branch state, PR divergence, task counts and CI status were measured the same evening. `CLAUDE.md`
> requires a measurement to name its ref, and this page will be read as current for as long as it
> survives — so **re-run the commands in §8 before acting on any number here.**

This is a map, not a plan of record. It exists because a great many design decisions landed today in
`docs/design/` and in `openspec/`, on top of a backlog that predates them, and no single page said
what is coming, what each thing is for, and which of them can be worked at the same time.

**The dependency chains in §3 are the point of this document.** Everything else is scaffolding for
them. If you read one section, read §3 — and then §6, which is where four registers turn out to be
carrying an absence claim the tree refutes.

---

## 0. How to read the claims on this page

Three provenance classes, marked throughout:

| mark | meaning |
|---|---|
| **[verified]** | I re-ran or re-read it on `9cfe582` today. §8 lists how. |
| **[inherited]** | Quoted from a document or PR that measured it on *its own* ref, which is named. Not re-taken here. |
| **[unmeasured]** | A design intention, a hypothesis, or a number with no ref attached anywhere I could find. |

The distinction is not pedantry. This page was itself handed one wrong premise, and checking the tree
corrected it (§3, Chain D). A second premise — the one that looked most solid, about `portalTargets`
— turned out to be refuted in four places at once (§6.1). Both cost one command each.

Two conventions borrowed from the campaign, because they keep being the failure mode:

- *"The symbol exists"* and *"a test covers it"* are both compatible with *"the game never runs it."*
- A confidently-wrong instrument reads exactly like a finding.

---

## 1. The one thing to decide first

**`mages-and-species` is 0.4.0, the next release to cut, and it is 100/107 — but the seven open
tasks are not what the roadmap says they are.**

`CLAUDE.md` and `vision.md` §11 both gloss the gap as *"8.1 and 8.2 were deliberately unchecked."*
That explains why the count reads 100 rather than 102. **It does not account for the other five**,
and those five are genuine open findings recorded in `tasks.md` with their measurements.
**[verified: all seven task lines are unchecked in `openspec/changes/mages-and-species/tasks.md`
(lines 107, 117, 135, 164, 178, 186, 204). The figures inside the notes are that document's own
measurements and have not been re-taken here.]**

| task | state |
|---|---|
| 8.1 materials production | two of three; `world-step.ts` passes `resourceYieldBonuses: []` unconditionally, so the multiplier is `(1+0)` every tick. Waits on an external branch (`w29`, PR #42) |
| 8.2 materials consumption | three of four claimants; **construction is not charged at all** — `advanceConstruction` has no caller outside its own unit tests, so **no universe in any committed sweep has ever paid for a university** |
| **8.7** births/deaths balance | **unmet, and measured**: at year 200 population is 18,713 against `K` 29,831 (63%), births still exceed deaths by 11%. It settles at roughly year **475** — more than twice the committed horizon |
| **9.5** research/teaching/scribing each occur | **half false**: teaching stops after world year twenty (nothing researched clears the `fp(512)` teach threshold), scribing after year sixty (materials empty). Asserted as a tripwire so fixing either fails the suite |
| **9.8** capital growth non-increasing | **true and vacuous**: total effective capital contribution is `fp(32)` from year one to year two hundred — **1,263 books, two nodes**, because the scribable list is cost-ordered and every scribe copies the same cheap node |
| **9.9** four species differ by more than cross-seed spread | **three species, not four**. This is Chain A |
| **10.1** every scenario has a passing test | *"The box is left open because its text is a universal and the universal is false"* — three scenarios fail, and they are 8.7, 9.8 and 9.9 restated |

**So the release decision is a real one, not bookkeeping.** Either 0.4.0 waits on Chain A and the
content problem underneath 8.2/9.5/9.8 — which is the same problem seen from four angles, *the
reference universe exhausts materials and never deepens a library* — or 0.4.0 ships stating a claim
that its own task list records as false. `docs/design/release-plan.md` requires every release to
state a claim that could turn out to be false. It does not license one already known to be.

**This is the author's call and nothing else on this page is more consequential.**

---

## 2. State of the board

**Eleven OpenSpec changes exist. `vision.md` §11 and `CLAUDE.md` both describe nine.** Task counts
below are from counting `- [x]` against `- [ ]` in each `tasks.md` on `9cfe582` **[verified]** —
`npx openspec list` does not resolve in a fresh worktree, so these were taken by grep rather than by
the tool the roadmap says to trust.

| change | tasks | state | in `vision.md` §11? |
|---|---|---|---|
| `mages-and-species` | 100/107 | **next release to cut** — see §1 | yes |
| `agent-interface` | 91/91 | **task-complete, unreleased** | yes |
| `gym-bridge` | 76/76 | **task-complete, unreleased**; still "held at proposal depth" in its own text | yes |
| `god-agency` | 59/75 | in flight; **11 of the 16 open tasks are the balance-harness gate**, and the harness is task-complete | yes |
| `raid-engagement` | 67/92 | in flight; see the reframing below | yes |
| `pvp-server` | 33/41 | in flight; the 8 open tasks are all *"specified here, built elsewhere"* | yes, as *"proposal only — no tasks, no package"* |
| `metis-knowledge` | 1/51 | proposed; deliberately held until after 0.5.0 | yes |
| `electron-client` | no `tasks.md` | proposal, deliberately held at proposal depth | yes |
| **`colonization`** | 0/43 | proposed; its vision gate (§8b) **has landed** | **no row — prose only (§8b, §13)** |
| **`discriminating-ascension`** | 0/38 | proposed | **no — absent from `vision.md` entirely** |

**`raid-engagement` at 67/92 is much closer to done than the number reads.** Its own
`## What is not done, and why` section reclassifies the remainder **[verified]**: roughly **8 of the
25 are edits to `agent-api` and `mc-harness`, not to `rules-raid`** (groups 2 and 9); **12 are
unwritten tests over behaviour that is implemented**; and exactly one — task 6.2, intent scoring as a
fixed priority order rather than `mage-autonomy`'s utility scorer — is a **declared design
deviation**, not an omission. Reading 67/92 as "a quarter of the engine is missing" would be wrong.

**`discriminating-ascension` is untraceable.** **[verified]** It appears nowhere in `vision.md`.
`CLAUDE.md` says work not traceable to the vision is scope creep, and this change proposes altering
the **win condition**. `colonization` treated the same problem correctly — it made the vision
amendment an author-owned prerequisite (its task 1.1), and §8b has since landed. `discriminating-ascension`
has no equivalent gate. It also declares a hard blocking dependency: *"Depends on W1
(`w1/ascension-stance`) … Both claims below are unmeasurable without it — the committed 60- and
240-tick gates are structurally blind to the win condition."*

**Nineteen PRs are open**, plus three draft triage PRs. Divergence from `9cfe582` **[verified]**:

| PR | branch | ahead / behind | what it is |
|---|---|---|---|
| #160 | `docs/skills-in-a-population` | 1 / 0 | docs only |
| #159 | `w-god-price` | 8 / 1 | a swept axis price for the opening square |
| #155 | `integration/ui-and-subsystems` | 97 / 13 | **measurement candidate — explicitly not for merging** |
| #140 | `w18/academic-primitive-consumers` | 9 / **0** | academic primitive consumers |
| #137 | `w115/enable-all-cells` | 14 / 24 | all seventy cells — **on hold** |
| #134 | `w116/complete-affiliation` | 7 / 53 | the founding defect |
| #126 | `w109/alliances` | 14 / **0** | alliance god verb |
| #125 | `w108/university-fidelity` | 12 / **0** | universities own their staff |
| #117 | `w98/metric-reachability` | 1 / 53 | **the guard** |
| #103 | `populace-recast` | 8 / 29 | flavour lines |
| #80 | `w80/research-cost-variation` | 7 / 64 | `researchCost` varies within a tier |
| #79 | `w77/effect-displacement` | 7 / 58 | displacement cost on an effect |
| #75 | `w78/teaching-boundary` | 4 / 64 | teaching stops at the institution |
| #68 | `w63/ascension-requires-play` | 23 / 58 | ascension requires an institution |
| #63 | `w60/daily-relevance` | 16 / 59 | daily-relevance worship |
| #54 | `w53/practice` | 18 / 59 | practice |
| #52 | `w52/emphasis-reorders` | 7 / 58 | emphasis as preference |
| #69, #26 | integration branches | 34 / 109, 84 / 231 | stale integrations |
| #109, #108, #107 | draft triage | 18 / **286**, 2 / **351**, 1 / **361** | need a rewrite-or-close call, not a merge |

**#126, #125 and #140 are rebased onto `9cfe582`** **[verified]** — all three have
`merge-base == origin/main`. `baseline-decisions-2026-08-14.md` says of #126 *"the branch is far
behind"*; that is no longer true, and the rebase it recommended has been done. Whether the gates were
re-run on the rebased tree cannot be answered from outside the branch.

**`main`'s required check is green.** **[verified]** The last completed run has
`Verify (pinned Node): success`. What is red is two **non-blocking** jobs — `Primitive consumption`
and `Rules-path reachability`. "Main is red" tonight means the two advisory checks are red, which is
the state `baseline-decisions` describes: `check:consumption` is not in `npm run verify`, and adding
it turns the required gate red while #140's three primitives are outstanding.

**The campaign log has re-diverged.** **[verified]** #157 merged W98–W167 to `main` today. Since
then `pm/campaign-plan` has moved **107 commits ahead and now runs to W171**, including W168
(anti-requisites) and W169 (the god-price null) — both cited on this page. It has **no open PR**.
This is the ninth-instance pattern W166 recorded, recurring the same day it was closed.

---

## 3. The dependency chains

Five. Each states *what cannot be measured until what exists* — not what feels related.

### Chain A — species differentiation needs an opposing term before anything else

The campaign's stated goal, `mages-and-species` task 9.9, and the chain where the most confident
claims have been refuted.

```
task 9.9 is unmet on every ref tested
        │
        ├── two levers tried, neither moved it (#140 refuted 1/12; #137 worse than neutral)
        │
        ▼
the strategy space is one axis with no cost on the far end
        │
        ▼
anti-requisites supplies an opposing term ── lives only on branch `anti-requisites`
        │                                    52 commits behind · no OpenSpec change · 19 files
        ▼
a round-robin tournament at a long horizon can say whether a *different* strategy now wins
        │
        ▼
only then does a species measurement describe the game we intend to ship
        │
        ▼
and only then can 0.4.0 close task 9.9 rather than ship around it   (§1)
```

**The measurements, and they are good ones:**

- **9.9 is unmet on all three refs tested** — `main` @ `cc20d54`, #140 @ `1ae52c3`, #137 @ `d6c32d0`.
  12 seed sets × 6 seeds, tier 3, 720 ticks, 72 runs per ref. `species-separation-spread.md`,
  2026-08-14. **[inherited]**
- #140's four-species chain `gnome < dwarf < human < elf` **survives a re-roll in 1 of 12 seed
  sets**; on `main` it holds **0/12**. Its one robust link, `human < elf`, was already established on
  `main` at **64.7 SE**. #140 is *not* a measurement error — its published table reproduces to the
  tick. **[inherited]**
- #137 took occupancy Gini **0.0714 → 0.0436** and time-to-tier separations **7 of 15 pairs → 4**.
  Worse: at 720 ticks every species is **~20× slower** to tier 3 and human is **censored in 51 of 72
  runs**, so most numbers on that branch at that horizon are about truncation, not species.
  **[inherited]**
- Anti-requisites: one authored pair (`creo-ignem` ⊥ `creo-umbra`, `destructive`) takes
  `permissive-breadth`'s **lead over passive control from +33.1 nodes to +2.9** — per-strategy
  `referenceNodesKnown` **75.25 → 45.00**, delta **−30.25 (−26.1 SE)**. **Seven of eight strategies
  byte-identical**; the eighth loses ~40% of its knowledge. Measured against `main` @ `e2a15cf`.
  **[inherited]**

**The ordering constraint is the author's, not an inference.** `skills-in-a-population.md`,
2026-08-14: *"Land anti-requisites completely. … Base the other explorations on that tree — it
changes the strategy space, so measurements taken before it are measurements of a different game.
… Then see which of the other explorations still matter. Some may not."*

**A stale blocker, corrected.** `baseline-decisions-2026-08-14.md` says #137 needs
`explicitOpeningAxes` wired into the reference default, and that the function *"exists and has no
caller"*. **[verified] That is no longer true.** #156 (`59f619f`) landed today; `standardOpeningAxes`
calls it at `packages/scenario/src/content-set.ts:416`, and `reference-universe.ts:492` documents it
as *"the play verb, and now the default path."* The named blocker on #137 has cleared. What remains
is different and larger: #137 moved the target metric the wrong way, and its numbers need a horizon
of roughly **2,400 ticks** — about twenty minutes for twelve seed sets, unpaid.

**Untried levers, all [unmeasured]:** species-specific *costs* rather than affinities; affinity
changing what a species can *reach* rather than how fast; differentiating on something other than
time-to-tier; and per-species **magical prevalence** (`magical-prevalence.md`, owner's design), which
that document calls *"the most promising untried lever"* while marking it as a hypothesis.

**Two defensible orders, and I am not picking one.** Either land anti-requisites first and re-take
every differentiation measurement on that tree — the author's stated order, and it avoids measuring a
game we are about to change — or pay the 2,400-tick horizon first so #137 can be judged on numbers
that are not censoring artefacts. The first is better if anti-requisites lands soon; the second is
better if it stalls.

---

### Chain B — no cost, teaching or scribing lever can be measured until the costs vary

Short, hard, and cheap to satisfy.

- `researchCost` is `2048 << (tier - 1)` for all three hundred nodes — **six distinct values across
  300 nodes** — and `compareTargets` breaks cost ties on **node id**, which `intern` assigned by
  walking `node.json` alphabetically. *"Cheapest first"* has been *"alphabetically first."* (#80's
  own finding.) **[inherited]**
- `teachCost` is **512** against a teaching pair pushing **2048/tick**, so **tiers 1–3 complete in
  one month at any multiplier**. That is why #140 moved research **+30.4%** and `teach-rate`
  **+0.2%** — a lever wired correctly into a range where it cannot express itself. **[inherited]**

**Therefore any measurement whose treatment is a teaching, scribing or research *rate* is measuring
a saturated variable.** #80 is the fix for that whole class and was open before anyone knew the class
existed. It is 64 commits behind `main` and has no OpenSpec change.

This also explains `mages-and-species` task 9.5 (§1): *"nothing a mage researches clears the
`fp(512)` teach threshold, so only founding grants are ever teachable and they are taught out."*
**9.5 and #80 are the same defect from two directions**, and #80 is the fix.

The same shape recurs on the god's side. `permit-technique` / `permit-form` are unpriced, and
`opening-square.md` calls pricing them *"the change that makes the opening square a decision rather
than a starting position."* W169 measured the obvious fix and it failed: **a one-time toll is
arithmetically incapable of beating a 70-favor ceiling over 2400 ticks — 384 runs to learn a fact
about arithmetic.** **[inherited]** #159 carries a swept axis price instead. This is the *third* time
the campaign has found a lever that exists and costs too little to matter.

---

### Chain C — #63 and #127 are both built, both correct, and inert for one content reason

The cleanest dependency here, and I re-derived it from content rather than quoting it.

**[verified] on `9cfe582`:**

- `node.json` holds **59 `resource-yield` effects**, all at `target: "universe"`.
- **Five** sit in the twelve `v1` cells: `it-taste-the-soil`, `it-survey-the-strata`,
  `it-find-the-deep-seam` (`intellego-terram`), `rt-quarry-without-hands`, `rt-the-vaulted-hall`
  (`rego-terram`).
- All five are `terram`-form, and `terram`'s `yieldWeights` are `{food: 0, stone: 1024, vellum: 0}` —
  **all five route 100% to stone**, and `routeYieldByForm` sends nothing anywhere else.
- Stone's **only** sink is `advanceUniversities`
  (`packages/coordination/src/world-step.ts:1194`), spending it on sites with
  `buildProgress < FP_UNIT`.
- `UNIVERSITY` rows are created in exactly two places:
  `coordination/src/god/interventions.ts:781` (god action 11) and
  `scenario/src/reference-universe.ts:602` (the scenario seed).

**So stone buys nothing unless a god founds something** — and per `mages-and-species` task 8.2,
universities are attached *complete* rather than built, so construction is never charged either. Both
of the following are consequences, not separate defects:

- **#63** implements daily-relevance worship, reported at **+48.8%** for daily-useful magic against
  spectacle's **+23.0%** **[inherited — and this number is quoted in three documents and carries no
  ref, seed count or tick count in any of them]**. It reports itself *measurably inert* at a
  twelve-cell opening.
- **#127** gave a mage `GOAL.applyMagic`. It measured a null, **+91.4 ± 135.1**, which #79 had
  independently reached days earlier with the same explanation. Two agents, days apart, same null.
  **[inherited]**

**Neither is broken. Both wait on there being something worth casting at the bottom of the tree.**
Three things would each move it, and they are separable:

1. **Low-tier economy content in the opening cells** — the *"identify objects"* archetype in
   `magical-prevalence.md`. Content, not code.
2. **A wider or differently-placed opening.** The machinery landed (#72, #156); the *default* is
   still the v1 rectangle, and `opening-square.md`'s own recommendation is to keep it there for now.
3. **An economy harness.** `subsystem-harnesses-and-uis.md` is explicit: *"#63 cannot be judged
   without it"*, and *"#63 should be re-measured, not rewritten."*

The harness is the cheapest and depends on neither decision above, which makes it the right first
move in this chain.

---

### Chain D — the wartime god verbs are a **wiring gap**, and four registers disagree

**Correcting a premise this page was handed.** It is *not* true that a player cannot act during a
raid at all. The design exists, is specified, and is prototyped. One seam is missing.

**1. The design is specified and current.** **[verified]** `contracts.md` §4.2 was amended: permit
technique *(1)* and permit form *(3)* are **legal during engagement and lock**; forbid technique
*(2)* and forbid form *(4)* are **legal for the defender only, and lock**; edicts *(5–7)* stay masked
with the silence made visible rather than inherited. The earlier *"every action except no-op is
masked"* rule was **repealed** by `raid-engagement.md`, and `vision.md` §3 now reads *"Rules changes
may be made during a raid, and every change locks until the raid ends."*

**2. It is prototyped in the UI.** **[verified]** `ui/raid/index.html` implements the interaction:
the lock (*"The ruleset MAY be changed during a raid, and every change LOCKS until…"*), a two-layer
legality check with `forbiddenCastsBlocked` as a counter, and costs read from `raid-constant.json` —
the surface described as *"god-shaped: permit, forbid, and favor spent on a standing condition."*
`ui/ruleset/` and `ui/ruleset-symmetry/` carry related surfaces.

**3. The `agent-api` path does not carry it, and three specs still encode the repealed rule.**
**[verified]**

| register | what it says | where |
|---|---|---|
| `contracts.md` §4.2 | four actions legal, locking — **current** | `docs/design/contracts.md` |
| `mask.ts` | *"Every action except no-op is masked during engagement"* quoted verbatim as the module's reason for existing, with a total early return of `[1, 0, 0, …]` | `packages/agent-api/src/mask.ts:20–28` |
| released spec | Requirement *"Rules changes are masked during engagement"*, scenario asserting every action except no-op is masked | `openspec/specs/observation-action-space/spec.md:50` |
| `god-agency` delta | *"Every intervention is world-time only"* — correct for 8–15, wrong for 1–4 | `openspec/changes/god-agency/specs/interventions/spec.md:28` |
| `raid-engagement` task 2.7 | *"Assert that rules-changing actions 1–7 and 13 are masked during engagement"* — an **unchecked task to implement the repealed rule** | `openspec/changes/raid-engagement/tasks.md` |

`contracts.md` §4.2 names the first three itself and calls each a deliberate follow-up. Task 2.7 is
the one nobody has noticed: implementing it as written would re-enforce a rule the contract repealed.

**The real prerequisite is not the mask.** `interface-findings.md` §5.1a measured it: across four
strategies — `passive-control` 2 raids / 159 engagement ticks, `uniform-random-legal` 7 / 440,
`portal-rush` 9 / 489, `denial-warden` 1 / 65 — **the mask was evaluated in engagement zero times**.
**[inherited]** Because `submit()` runs a whole world step synchronously, `runRaid` never yields, and
nothing asks the agent anything mid-raid. W164 reached the same structural conclusion from the UI
side, and #152 found `ui/raid/` draws a **synthetic trace** rather than the recorded session —
consistent, because the session cannot supply one.

```
runRaid yields to the agent between engagement ticks   ←  the change with substance
        │                                                 (an `agent-interface` decision, unscheduled)
        ├── RaidRecord.actionEconomy reaches `layout.ts`  ←  today it is not on the observation layout at all
        ▼
unmask actions 1–4 in `mask.ts`; correct two specs; rewrite raid-engagement 2.7
        ▼
mid-raid play is measurable through `agent-api`, and `ui/raid/` can draw a real trace
```

**The mask edit is free and worth doing regardless.** `contracts.md` §4.2 records that unmasking the
four actions *"costs nothing to run, and that is measured rather than assumed"* — an earlier claim
that it would move every balance baseline was checked and was false.

---

### Chain E — #117 is a guard, and it conditions whether later measurements can be believed

A different kind of dependency: it does not block work, it decides what the work's numbers are worth.

- `self-evolving-search.md`: *"A number cannot be searched if the metric it moves cannot move. That
  is stage 0, and it is not optional."*
- `running-the-search.md`: *"Never add an axis that is not already a registered metric. … If you want
  a new axis, first show the metric moves — that is what `w98/metric-reachability` is for."*
- `baseline-decisions-2026-08-14.md`: *"Of everything in the backlog, this is the one whose value
  tonight raised the most."*

The argument is a list of instruments that were confidently wrong **[inherited]**: four metrics
publishing healthy constants they could not move; `winRateByPrimitive` honest but for a false reason;
`combatActionEconomy` publishing a **wrong explanation** for its own absence; `check:consumption`
reporting seven live consumers as absent because `arbitration.ts` read `registry.nodes` directly; and
W162's finding that **no committed baseline holds a value for a single one of `contracts.md` §7's
eighteen metrics** — *"nothing has ever recorded a number from it."*

An autonomous optimiser pointed at any of those would have run forever reporting progress. #117 is
one commit ahead of a 53-commit-old base, so it is cheap to rebase and it gates nothing — but every
measurement taken before it is taken without the guard.

**Hard orderings inside the instrument layer** **[inherited]**:

- `balance-full`'s pool fix **must follow** the `RaidRecord` field, *"or it will faithfully record
  more nulls."* Six §7 metrics are unmeasured by a sweep whose pool cannot produce what they measure.
- `roleAssignmentDemographicCost` reports `no-observations` **regardless of pool**, because nothing
  in `scenario` ever sets `RunTelemetry.roleDemography`. No pool change can fix it.
- `check:consumption` cannot join `npm run verify` until #140's three primitives close.
- `winRateByPrimitive` cannot produce a number until ablation breaks B and C are closed.
- **`god-agency`'s remaining work is mostly this chain.** 11 of its 16 open tasks are §7 metric
  implementations plus the sweep that consumes them **[verified]** — and the harness they need
  (`agent-interface`) is task-complete. The rules engine is essentially built; the *measurement* half
  is what is missing.

---

## 4. What can proceed in parallel

Disjoint surfaces, or measurements that do not depend on a pending decision:

| track | why it is independent |
|---|---|
| The two spec corrections and `raid-engagement` 2.7's rewrite (Chain D) | Text only. Makes four registers agree with a contract already amended. |
| `mask.ts` unmasking actions 1–4 | Measured free. Inert until `runRaid` yields, but harmless and correct. |
| The economy harness (Chain C.3) | New tooling; touches no rules path, moves no baseline. Unblocks judging #63 without pre-deciding content or the opening square. |
| #117 metric reachability | The guard. One commit; cheap to rebase. |
| #80 `researchCost` variation | Its finding stands independently of Chain A. It will move baselines — see §5. |
| Formalising the un-formalised design docs (§7) | Writing an OpenSpec change is orthogonal to running anything. |
| The rewrite-or-close call on #109 / #108 / #107 / #69 / #26 | 109–361 commits behind. A decision on merits; no chain touches them. |
| Arming raiders with combat nodes | `scribing-fidelity.md` names it first *"because until something arms a raider the other four cannot be measured, only asserted."* W157 measured **61 raids, 80,615 combatant-ticks, zero combat attempts** **[inherited]**. Independent of Chains A–C. |
| `raid-engagement`'s 12 unwritten tests | Behaviour is implemented; these are fixtures. |

**Not parallel, despite looking it:** anything measuring teaching, scribing or research *rates*
(Chain B saturates them), and anything measuring species separation before anti-requisites lands
(Chain A — the author's own constraint).

---

## 5. Blocked on a human decision, not on work

**Five re-baseline decisions, not six.** `baseline-decisions-2026-08-14.md` presents six; **#72
landed today as `672066f`** and is an ancestor of `9cfe582` **[verified]**, and #144 required no
decision. The live queue:

| PR | class | the decision |
|---|---|---|
| **#125** universities | mechanical | Discriminating control run: reverting only the scribing rule reproduces the treatment metric for metric, so **all** movement is entity-handle re-allocation. *Page's recommendation: accept.* |
| **#126** alliances | mechanical | Was *"far behind"*; **now rebased onto `9cfe582`** **[verified]**, so the recommended rebase is half discharged. W160 then measured the prediction and it held: action 16 is legal for **0 ticks across all fourteen pool strategies**, first legal at world tick 276 — the verb is out of reach, not inert. |
| **#134** affiliation | substantive | The founding defect closed: affiliated share **0.0077 → 0.7226**; human **0.0003 → 0.9991**. But at 200 years **dwarf falls 79% (~4 SE) while its population doubles**, elf −43%, draconic −28%. The hypothesis (`applyLibraryUpkeep`, newly *reached*) is flagged unproven. |
| **#140** academic primitives | substantive | Accept **on the effect sizes only** — research +30.6%, nodes retained +39.4%, grimoires +43.4%, population flat at +0.04 SE as a control. **Do not quote its four-species ordering at all** (refuted 1/12). It touches **no `balance/` file** **[verified]**, so the re-baseline it needs has not been taken. |
| **#137** all seventy cells | substantive | **Hold** stands, for a *changed* reason — its named blocker cleared today (Chain A). What remains: it moved the target metric the wrong way, and its numbers need ~2,400 ticks to mean anything. W167 adds a fourth reason from the integration tree: *"#137 should not land as it stands."* |

**Also the author's, and not an agent's:**

- **Whether 0.4.0 ships with task 9.9 and 10.1 open** (§1). The largest one on this page.
- Whether `check:consumption` and `check:reachability` become blocking. Making the first blocking
  turns `main` red until #140's three primitives close — a sequencing choice, not a cleanup.
- The baseline format question raised by #72: *"a hash alone cannot distinguish 'appended' from
  'renumbered'"*, so **any** future RNG-stream addition forces a re-baseline event however provably
  inert. Fixing the format is its own change and is the better long-term answer.
- **Whether `discriminating-ascension` gets a vision amendment or is dropped** — it changes the win
  condition with no trace in the vision of record. And whether it or **PR #68** survives: both attack
  *the win condition reads the ruleset rather than play*, with different fixes. #68's measured
  counter-example is the good one — `archivist` **founds 1,281–1,345 universities per run and never
  qualifies**, while `permit-then-idle` **ascends 40/40 holding one university and 261–269 nodes**
  **[inherited]**. Two implementations of one requirement is a hazard; rule before either is built out.
- Every open question the design docs hand back explicitly: dwarf and gnome prevalence
  (`magical-prevalence.md`); the fidelity decay curve (`scribing-fidelity.md`); which schools exclude
  which, and `refused` vs `destructive` per pair (`anti-requisites.md`, and `vision.md` §13 lists it
  as open); `colonization`'s six remaining §1 author decisions.

---

## 6. Where a spec and the tree disagree

Only entries I checked myself on `9cfe582` are **[verified]**. The campaign log keeps at least four
separate running counters for this failure mode and none of them reads eleven, so I am reporting what
I can substantiate rather than a borrowed count.

### 6.1 The one that changes what several changes are *for*

**Four registers state, as of their own writing, that nothing supplies `portalTargets` and therefore
no raid can fire. As literally stated, the tree refutes all four.** **[verified — all four read
directly on `9cfe582`]**

| register | claim, verbatim |
|---|---|
| `vision.md` §11 | *"on `main` `REFERENCE_MECHANICS.raidEngagement` is still `false` and nothing opens a portal"* |
| `openspec/changes/pvp-server/tasks.md` 7.4 | *"Nothing supplies `portalTargets` today, so `openPortal` is permanently masked and no raid can fire."* |
| `openspec/changes/colonization/design.md:205` | *"`CandidateInput.portalTargets` … **nothing in production sets it** … Consequently `openPortal`'s mask bit is permanently 0, structurally rather than by cost, which is the campaign board's measured root cause of 'NO RAIDS EVER HAPPEN'."* |
| `packages/server/src/index.ts:38` | *"No raid engages here. Nothing supplies `portalTargets`, so `openPortal` is permanently masked, and this package does not manufacture one to look finished."* |

On `9cfe582`:

- `packages/scenario/src/executor.ts:114` — `REFERENCE_MECHANICS` declares **`raidEngagement: true`**,
  with a comment reading *"this commit's flip, and it is honestly true."*
- `packages/scenario/src/reference-universe.ts:970` — the reference scenario passes
  **`portalTargets: portalTargetIds(constants)`**, and `session.ts:267` forwards it into
  `CandidateInput`.
- `packages/mc-harness/src/strategies.ts:1444` carries an assertion message saying so outright:
  *"reference scenario supplied no portalTargets. It supplies them."*
- W156 measured it dynamically **[inherited]**: `portal-rush` at **94 raids, 86 outbound, 118
  casualties, 40 nodes gained** over four seeds at 1200 ticks.

**But the refutation does not license the same conclusion in all four places, and the difference
matters.**

- **`vision.md` §11 and `pvp-server` 7.4 are simply stale.** 7.4's *"must not fake a portal target to
  appear finished"* guards against a problem the reference scenario has already solved honestly.
- **The server's comment is half-scoped** — *"No raid engages **here**"* is true of that package;
  *"Nothing supplies `portalTargets`"* is stated absolutely and is not.
- **`colonization`'s underlying design point survives; its stated evidence does not.**
  `portalTargetIds` returns `[1 … universeCount]` from a `RivalConstants` fixture
  (`packages/scenario/src/rival-universe.ts:189`) — a synthetic rival enumeration, **not a multiverse
  membership model** — and the `candidates.ts` comment `colonization` quotes is still present and
  still accurate about *why* the field is caller-supplied: *"one simulation instance holds one
  universe — the multiverse is not in state, and there is nothing here to enumerate."*

**So the correct reading is narrower than "colonization's urgent piece is refuted."** Bubble-as-adjacency
is still the only proposed model of *which universes are reachable*. What has changed is that it is no
longer the thing standing between this project and a raid firing at all — that gate is open, and it
has been measured open. `colonization`'s scope verdict (*"the bounded neighbourhood belongs in v1 and
is urgent, because nothing else answers `portalTargets`"*) should be re-argued on multiverse grounds
rather than on the raid-liveness grounds it currently rests on.

### 6.2 The rest

| # | document | code | state |
|---|---|---|---|
| 1 | `contracts.md` §4.2 — four actions legal during engagement, locking | `mask.ts:20–28` quotes the **repealed** rule and returns `[1,0,0,…]` | **[verified]** — §4.2 names this itself |
| 2 | same | `openspec/specs/observation-action-space/spec.md:50` — a **released** spec requiring the repealed rule | **[verified]** |
| 3 | same | `openspec/changes/god-agency/specs/interventions/spec.md:28` | **[verified]** |
| 4 | same | `openspec/changes/raid-engagement/tasks.md` 2.7 — an unchecked task to implement the repealed rule | **[verified]** |
| 5 | `vision.md` §11 — `pvp-server` *"proposal only — no tasks, no package on `main`"* | `tasks.md` 33/41; `packages/server/` 3,275 lines across ten files | **[verified]** |
| 6 | `vision.md` §11 — the table exists so `openspec list` and it agree | `colonization` and `discriminating-ascension` have no row | **[verified]** |
| 7 | `CLAUDE.md` + `vision.md` §11 — *"100/107, 8.1 and 8.2 deliberately unchecked"* | five further tasks are genuine open findings (§1) | **[verified]** |
| 8 | `baseline-decisions-2026-08-14.md` — *"`explicitOpeningAxes` … has no caller"* | it is the default path since #156 | **[verified]** — stale by hours |
| 9 | `baseline-decisions-2026-08-14.md` — *"#126 … the branch is far behind"* | `merge-base == origin/main` | **[verified]** — stale by hours |
| 10 | `gym-bridge` proposal — *"the single largest blocker"* is that `edictBudgetMax` is not fixed | `god-agency` task 1.2 is checked; `EDICT_BUDGET_MAX = 8` is pinned in `contracts.md` §0 | **[verified]** — blocker resolved, proposal not updated |
| 11 | `raid-constant.json`'s gloss — describes the **god's** gate | `shelveForeignBooks` selects on `record.v1`, the **content** flag | **[inherited]** W141/W147/W165 |
| 12 | `docs/devops/ci-and-deploy.md` — *"`main` runs never cancel each other. They serialise."* | three of `main`'s last eight runs never started | **[inherited]** W144; #138 has since **merged** **[verified]** |
| 13 | `balance/README.md` five-sweep table — `balance-full` at 240 ticks / 10 metrics | the sweep file says 1200 and 23 | **[inherited]** W156 |
| 14 | baseline `contentHash` at top level — reads as a content hash | it is a **tamper seal over its own fields**; four differing seals over one identical `provenance.contentHash` | **[inherited]** W162 |
| 15 | `ui/shared/README.md` — *"the reference run never enters engagement mode"* | recorder builds with `{raids: true}`; the run holds one `RaidRecord` at world tick 226 | **[inherited]** W164 |
| 16 | `reference-time-to-tier.test.ts` asserted `human < orc` | holds in **1 of 16 seed sets — the one it was measured on**; four assertions retired in W154 | **[inherited]** W152/W154 |

### 6.3 One discrepancy I could not resolve

`anti-requisites.md` labels its agency-gate table *"2400 ticks"*. The committed sweep configs on
`9cfe582` are `worldTickCap` **60** (`balance-gate`), **240** (`balance-gate-horizon`), **240**
(`balance-gate-agency`) **[verified]**, while `tools/w58/harness.mjs` defaults to **2400**. Either the
label names the ad-hoc harness rather than the gate, or a tick label is wrong. It does not change the
+33.1 → +2.9 finding's direction, but settle it before quoting the horizon.

---

## 7. Design that landed today with no OpenSpec change

Six documents record real design decisions. **None is a formal change**, so none appears in
`openspec list`, `vision.md` §11, or any roadmap.

| document | what it proposes | measured? | where it lives |
|---|---|---|---|
| `anti-requisites.md` | `excludes[]` on a cell; `refused` vs `destructive`; enforcement at `createInstance` because five paths put a node in a head and raid theft bypasses the gateway | **yes** — the strongest result of the day (Chain A) | **branch `anti-requisites` only**, 52 behind, 19 files, +1062/−23 |
| `skills-in-a-population.md` | an abstract macro model that **emits needs**, not numbers; drains as free variables; *"runs in seconds, not in 2400-tick arms"* | cites others' measurements; the model is a proposal | branch `docs/skills-in-a-population`, PR #160, doc only |
| `magical-prevalence.md` | per-species magical prevalence in `species.json`; an **institutional-capacity primitive** (none exists); consumers for `fertility` and `lifespan` | content census yes; prevalence numbers are the owner's, **dwarf and gnome deliberately left blank rather than guessed** | `main` |
| `scribing-fidelity.md` | per-instance mētis fraction; `corrupted` + `discovered` flags; **a corruption primitive** — the first genuinely new primitive proposed in this campaign; a `corrupt` raid intent | shipped-content facts yes; the mechanic is design intention | `main` |
| `subsystem-harnesses-and-uis.md` | an economy harness; harness output as a UI source; a meta UI in `ui/console/` | an inventory, not a measurement | `main` |
| `self-evolving-search.md` | wire `tune-balance.mjs`, which *"has been hand-run and never wired into anything"*; every `tuningStatus: "untuned"` constant becomes a search space | **no ref stated anywhere in the file**, with several measurement-shaped numbers | `main` |

**`scribing-fidelity.md` must not be folded into `metis-knowledge`.** W159 records the owner:
*"They are different mechanics and should not be merged into one."* `metis-knowledge` is about
knowledge codification destroys; fidelity loss is about copy-of-a-copy degradation.

**Two are candidates for formalisation now**, because they are large enough that scattering them
across PRs will lose them: **anti-requisites** (already implemented — writing the change after the
fact is unusual, but better than an undocumented content-schema extension) and **scribing fidelity**
(a new primitive is a `contracts.md` §3 amendment and should not arrive as a PR).

---

## 8. A proposed sequence

Reasoning attached to each constraint. Where two orders are both defensible I say so.

**0 — Free and independent; do them whenever.**
Correct the four Chain D registers (two specs, `raid-engagement` 2.7, and `mask.ts`). Correct the
five stale claims in §6 that are already refuted — especially the `portalTargets` one, which is
currently steering two changes. Rebase #117 and land the guard. Make the rewrite-or-close call on the
five branches more than a hundred commits behind.
*Why first: none of it blocks or is blocked, and #117 changes how much later measurements are worth.*

**1 — Decide §1: what 0.4.0 claims.**
This is a decision, not work, and everything below reads differently depending on it.

**2 — Land anti-requisites completely.**
The author's stated first step and the only measured opposing term the strategy space has. 52 commits
behind, conflicts on `interning.test.ts`, and it touches content, the loader, `rules-magic` and
`world-step.ts` — a merge with real surface.
*Why here: every species measurement taken before it is a measurement of a different game.*

**3 — Take the five re-baseline decisions (§5).**
*Why after 2: #140's and #137's numbers both interact with the strategy space anti-requisites
changes. **Defensible either way** — #125 and #126 have controls already run, cost nothing to hold,
and could equally go first to clear the queue.*

**4 — #80, so cost and teaching levers can express themselves.**
*Why after 3: it moves baselines, and stacking a baseline-moving change onto an unresolved
re-baseline queue is how movement gets attributed to the wrong branch. **Defensible either way** —
if the queue stalls on a human, #80 is the most valuable thing that can proceed without one, and it
is also the fix for task 9.5.*

**5 — The economy harness, then re-measure #63.**
*Why after 4 for the measurement: the harness measures a loop whose rates #80 unsaturates. The
harness itself can be **built** at any time — only the measurement waits.*

**6 — Species differentiation, re-taken at a horizon that is not censoring.**
~2,400 ticks, twelve seed sets, about twenty minutes. Judge #137 on numbers that mean something.
Then the untried levers, magical prevalence first.
*Why last in this block: it is the goal, and every step above changes the tree it would be measured
on.*

**7 — `runRaid` yields to the agent.**
Then `RaidRecord.actionEconomy` onto `layout.ts`, then mid-raid play becomes measurable and
`ui/raid/` can draw a real trace instead of a synthetic one. Then `god-agency`'s §7 metrics, which
are 11 of its 16 open tasks and are unblocked already.
*Why separable: this is the `agent-interface` boundary and touches nothing in 2–6. Given a second
pair of hands it runs fully in parallel. It is placed here because it is the largest unscheduled
item, not because anything above blocks it.*

**Deliberately unscheduled:** `colonization`, `metis-knowledge`, `electron-client`, `pvp-server`,
`discriminating-ascension`. `colonization`'s own §8b verdict is *"specified, not scheduled"*, and the
grounds for its one urgent piece need re-arguing (§6.1). `metis-knowledge` is held until after 0.5.0
by its own proposal.
`discriminating-ascension` needs a vision amendment and a ruling against #68 before it is work at
all. And **0.4.0 is still the next release to cut**, with `agent-interface` and `gym-bridge`
task-complete and unreleased behind it.

---

## 9. How the [verified] claims were taken

On `9cfe582`, in a clean worktree, 2026-08-14. No build was run; this is a documentation task and
`node_modules` was never installed here — which is why `npx openspec list` was not the source of the
task counts.

- Task counts: `grep -c '^\s*- \[x\]'` against `'^\s*- \[[ x]\]'` per `openspec/changes/*/tasks.md`.
- PR divergence: `git rev-list --count origin/main..origin/<head>` and its reverse, after
  `git fetch origin`; merge bases via `git merge-base`.
- `resource-yield` census: a Python read of `packages/content/data/{node,cell,form}.json`, filtering
  `effects[].primitive == "resource-yield"` against cells with `v1 === true`, joined to
  `form.yieldWeights`.
- Stone sinks and university creation: `grep` for `.stone` and `UNIVERSITY` across `packages/*/src`,
  excluding `test/`.
- `portalTargets` and `raidEngagement`: `grep` across `packages/*/src` excluding `test/`, then
  reading `executor.ts:95–125`, `reference-universe.ts:970` and `strategies.ts:1444`.
- §4.2 vs `mask.ts` vs the three specs: read directly.
- CI: `gh run list --branch main` and `gh run view <id> --json jobs`.
- Campaign-log divergence:
  `git show origin/main:docs/design/campaign-plan.md | grep -o '^## W[0-9]*' | tail -1`, and the same
  on `pm/campaign-plan`.

Nothing under `balance/` was read for a number, written, or regenerated. `goldens:regen` was not run.
No code, content, test or baseline was changed by the work that produced this page.
