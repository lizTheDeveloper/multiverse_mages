<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Campaign: make the game have strategies

**Goal.** Understand and articulate the probable strategies, and balance the game automatically so
the demo strategy set has enough variety that a human would enjoy playing it.

**Positioning, in the author's words:** *School Battle Tycoon With Multiversal Magic Systems* —
global knowledge management, the preservation of rare skills, and the production of talent.

**The shape of play:** university management is the **mini-game between raids**; raids are the
**RTS action game**; both live in a **persistent world**. `contracts.md` already encodes the seam —
`clock.mode` separates the two, and §4.2 masks actions 1-7 and 13 while `clock.mode == engagement`.
The two layers couple through one sentence: mages train, publish and teach, they go through the
portal, and **they only come home to teach if they survive**.

**The variety target is per-species plurality, not per-species assignment.** Each species should
admit **more than one** viable playstyle; the species shifts which is strongest, it does not
dictate the only one. A race with exactly one line is a race with no decisions in it.

**The rule for every workstream:** each mechanic implemented must be traceable to `vision.md` or
`contracts.md`. `CLAUDE.md` is explicit that work not traceable to the vision is scope creep.
Magnitudes the spec leaves open go into validated content data as `tuningStatus: "untuned"`.
**Where the spec is silent on a *rule*, stop and ask — do not invent one.**

---

## The diagnosis, measured

Around forty Monte Carlo sweeps produced one causal chain. Each link is measured, not argued.

    contracts §1.1 puts one universe per simulation instance
      -> nothing ever supplies candidates.ts's `portalTargets`
      -> `openPortal` has zero candidates and is permanently masked
      -> NO RAIDS EVER HAPPEN  (rules-raid is 4,525 lines across 16 files, never invoked)
      -> no external knowledge loss
      -> ~2900 instances over 51 nodes = ~55 copies each; nothing is ever the last copy
      -> libraryDependence sits at 0; redundancy is free and worthless
      -> every species trait about retention, scribing and rediscovery is inert
      -> the archivist makes 4096 grimoires against passive's 1156 and ends on the SAME 51 nodes
    and, separately, from the same missing pressure:
      -> waiting costs nothing
      -> a bot that plays nothing and presses buttons at random wins 100% of runs
      -> ascensionRate 0.79 against §7's band of 0.05-0.20

**The binding constraint on what a universe knows is the ruleset, not the economy.** Passive and
archivist both plateau at 51 nodes; `permissive-breadth`, which only permits more cells, reaches 217.
Everything else merely makes copies.

That is why the game has one axis of play, and why no setting of the ascension constants fixes it:
a 24-cell scan under common random numbers found **zero cells** in band, **zero** with a positive
exploit margin, and the idle probe winning **100% of runs in every cell**.

---

## Board

| WS | What | Owner | State |
|---|---|---|---|
| W1 | Ascension stance + 2400-tick gate | opus | **done**, in PR #16 |
| W2 | Discriminating-ascension proposal | opus | **done**, proposal only |
| W3 | Ascension-routes proposal | opus | **done**, proposal only |
| W4 | Reward functions + `metricDeltas` design | lead | **done**, branch `w4/reward-functions` |
| W5 | Axis off-by-one + `terminalReason` in record | opus | **done**, in PR #16 |
| — | Balance tuner (CRN, hard constraints) | lead | **done**, in PR #16 |
| W6 | Positive-achievement ascension predicates | opus | **D1/D2/D4 green**; D3 shown unreachable |
| W7 | §6a loop **+ the teaching fix (C2)** | opus | in flight |
| W8 | Make raids engage **+ the destruction path (C3)** | opus | in flight |
| W9 | Octalysis + game-theory proposals | opus | **done**, branch `w9/octalysis-and-mechanics` |
| W10 | Server contracts + real-time multi-agent | opus | in flight |
| W11 | Modal sweep fan-out | opus | in flight |
| W12 | Vision completeness audit | opus | in flight |

Each in-flight workstream owns a checkable plan on its own branch under `docs/superpowers/plans/`.
Opus leads may delegate reading and tracing to Sonnet subagents; design decisions and final
measurement stay with the lead.

---

## Definition of done for the campaign

Not "implemented and tests pass". The campaign is done when all of these are **measured and
reported with numbers**, on the 2400-tick eight-strategy sweep at n >= 96:

- [ ] **D1** `ascensionRate` inside **0.05–0.20** (`contracts.md` §7, vision §8a *"reachable but not routine"*)
- [ ] **D2** Exploit margin **positive**: the pool out-wins `uniform-random-legal` by >= 0.05
- [ ] **D3** At least **three** strategies win at materially different rates, none above 60% of wins
- [ ] **D4** Correlation between per-strategy ascension rate and mean nodes known is **positive**
- [ ] **D5** `knowledgeHalfLife` falls, and nodes are counted actually leaving the universe.
      *(Restated. The original was `libraryDependence` leaves zero — that would have passed
      falsely: it tracks the research frontier, not loss exposure, and already sits at 2-3% for
      some strategies with **zero** actual losses, because a node sits at one copy for the ~70-100
      ticks a second mage takes to derive it independently.)*
- [ ] **D6** No strategy wins at the passive knowledge baseline
- [ ] **D7** Varying the founding species mix changes which strategy wins
- [ ] **D9** **More than one viable playstyle is available to each species.** Not one playstyle
      per race — a race that admits exactly one line is a race with no decisions in it. Each
      species should support at least two distinct, viable approaches, and the species should
      change the *relative* strength of those approaches rather than dictate a single answer.
- [ ] **D8** `npm run verify` green, with every baseline movement justified in writing and **no golden fixture regenerated**

D5, D6 and D7 are the ones that say the *game* changed rather than the numbers. D7 is the strongest
single test that the species table has become load-bearing.

---

## The finding that reframes all the others — verified

**The 51-node "passive baseline" is content exhaustion, not a baseline.**

    70 cells authored, 12 enabled (3 techniques x 4 forms, the v1 subset per vision §12)
    those 12 cells contain exactly 51 of the 300 authored nodes
    an idle universe learns all 51

So every strategy plateaus at 51 because **51 is everything available**. `permissive-breadth`
reaches 217 for one reason only: permitting cells unlocks the other 249 pre-authored nodes. The
"one axis of play" this campaign kept measuring is not a balance failure — it is the only lever
that adds content to a set the world exhausts on its own.

This reframes every earlier finding rather than replacing them:

- **~55 copies per node** is 2900 instances spread over an *exhausted* 51-node set. Redundancy is
  worthless partly because there is nothing left to lose that cannot be re-derived from a set the
  universe has already completely learned.
- **The archivist's 4096 grimoires** are copies of a completed set.
- **Five identical achievement vectors** — 12 mastered cells, 51 nodes, 12 cells — are five
  strategies all reaching the same ceiling, because the ceiling is content, not skill.

**The v1 subset is not too small. Acquisition is too easy.** Vision §12 deliberately scopes v1 to
3x4 cells, and twelve cells of contested, hard-won magic would be plenty to fight over. They are
not contested because C2 (teaching dead), C3 (no destruction path) and the absent raids mean
nothing impedes a universe from learning everything it can reach and never losing any of it.

That is the campaign's thesis, and D1-D8 are how it gets tested.

## Three independent reviews, and where they converge

The thesis — *"the v1 subset is not too small, acquisition is too easy"* — was put to three models.
They **disagree on it**, which is why W15 is measuring rather than arguing:

- **Qwen 3.8 Max:** *"necessary but insufficient"*. All 51 nodes are **fungible** — they feed the
  same achievement scalar — so making acquisition hard without differentiating value yields
  *"acquire everything, slowly"*. Six species reaching the same 51 nodes on different schedules is
  **a speedrun leaderboard, not distinct playstyles.**
- **GLM 5.2:** *"half-right but ultimately wrong"*. 51 nodes is simply too little state space; hard
  acquisition would produce *"race conditions"* along one optimal path rather than distinct styles.
- **Codex:** pending.

**W15 settles it empirically** by computing the strategy-space dimensionality — an eigenvalue
spectrum over the strategy × node matrix. 1–2 effective dimensions refutes the thesis; 3+ with
strategies converging anyway supports it.

### Where two reviewers converged, independently — and it is the more important finding

**Species that differ only by *rates* cannot produce distinct playstyles.** Both models reached this
without prompting and in nearly the same words.

> "Rate differences just shift the timeline; they do not change the optimal strategy. A 60-year orc
> and a 1500-year dragon will both aim for 'maximize knowledge' — one sprints, one savors."
> — GLM 5.2
>
> "Species just change the *speed* of convergence, not the *shape* of the strategy." — Qwen 3.8 Max

Every authored species trait is currently a **rate or a scalar**: lifespan, curiosity, learn rate,
retention, fertility, scribe affinity, rediscovery affinity. Only `depthCeiling` is structural, and
it caps rather than redirects.

That is a direct problem for **D9**. If species differ only in speed, no amount of balance work
produces more than one viable playstyle per species, because there is only one shape of play to be
fast or slow at. The fix both reviewers point to is the same: **species must interact with the
knowledge-location and ruleset mechanics differently, creating mutually exclusive advantages** —
which storage locations serve them, which rulesets favour them — rather than differing in how
quickly they walk one path.

### …and where both reviewers are wrong, checked against the code

They reasoned from my brief, which listed the species traits as rates. The code says otherwise:
**structural species differentiation already exists, is fully implemented, and is consumed by
nothing.**

- `scribing.ts`: *"Its durability comes from the scribe's species affinity."* `scribeAffinity`
  spans **384 (orc) to 1792 (dwarf)** — a 4.7× spread in how long a written book survives. That is
  §6's *"dwarven grimoires resist destruction"*, built.
- The tradition `store` hook routes an instance to **mind, grimoire, library or palace**, and the
  memory palace exists only under Art of Memory. That is a structural difference in *where
  knowledge lives*, not a rate.

And the reason neither bites, in one sentence from `decay.ts`:

> **"Only minds decay.** `locationKind` mind and palace; a grimoire and a shelved library book do
> not. A book's fragility is `durability`, not forgetting."

So `durability` is written at scribing and **read by nothing that runs**: decay deliberately
excludes books, and the raid code that would consume it has never executed. The one authored,
implemented, structural axis of species differentiation is **one wire away from live**, and that
wire is W8's destruction path.

That materially improves the outlook for **D9**. The correct statement is not *"species differ only
by rates"* — it is *"species differ structurally in exactly one respect, and that respect is inert
because nothing destroys books."*

The open question below stands, but it is narrower than the reviewers thought: whether **one**
structural axis plus six rate axes is enough for per-species plurality, or whether more structural
differentiation is needed. Measure after W8 lands rather than deciding now.

## A second premise of mine, refuted

**`completedUniversities` is inverted as a Path A gate.** Both `discriminating-ascension` and my
own brief to W6 named it the successor knob. Measured: only the *random probe* ever completes a
university — 26 of them — while every deliberate strategy ends with the single seeded one. Gating
Path A on it would have handed the win condition to the exploit probe. Recorded so nobody proposes
it again.

## What the campaign has since found — verified in the tree

Three defects that explain the flat strategy space better than the raid finding alone.

### C2 — teaching is dead for anything a mage researched

`DEFAULT_INITIAL_MASTERY` is **256**, `DEFAULT_TEACH_THRESHOLD` is **512**, and `setMastery` has
exactly one call site in the rules path — `decay.ts:213`, which only ever lowers. Non-dormant decay
floors at `mul(256, retention)`, i.e. 128-384 across the six species, never zero.

So a researched node is born below the teaching threshold and **nothing in the build can raise it**.
Only god-granted knowledge (`grant-mastery` 1024) is ever teachable, and it gets taught out.
Vision §5's *"Teaching — mind → mind. Fast."* is not merely missing, it is **contradicted**, for
roughly 180 of the 200 simulated years. `reference-long-run.test.ts:24-32` already reported it.

### C3 — written knowledge has no destruction path

`destroyGrimoire` and `destroyLibrary` appear **only in tests**; zero production callers.
`durability` is written once at scribing and read only by raid code that has never run.

Combined with C2: the only knowledge destruction a player can experience is **their own
interdiction**. Loss is something the player administers, never something they fear — which is why
redundancy is worthless and every species trait about retention and scribing is inert.

### C9 — the tradition axis is authored, asymmetric, and never swept

True Naming's `acquire` hook sets `instanceMastery: 1024`; Vancian and Art of Memory use the 256
default. That single authored number is the difference between a working teaching graph and a dead
one — and **the reference universe runs Vancian**, the dead one. This is the cheapest untested axis
of play in the game: a sweep, not a code change.

### The calibration result, and why it is not a tuned magnitude

W6's scan over `ascension-summit-cells`, under common random numbers:

| value | rate | exploit margin | feasible |
|---|---|---|---|
| 1 | 0.500 | −0.500 | no — the predicate as it shipped |
| 12 | 0.458 | −0.542 | no — the passive ceiling, all 12 v1 cells |
| **13** | **0.167** | **+0.167** | **yes** — first value above the ceiling |
| 18 | 0.167 | +0.167 | yes |

**The feasibility edge sits exactly at the passive ceiling.** The threshold is therefore not a
magnitude anyone tuned; it is the structural line *"the god permitted an axis the universe did not
start with"*. That is what anchoring to the passive baseline — rather than to any strategy — buys.

Note the two infeasible rows have the **best** variety in the whole scan (0.613, top-share 0.33).
Variety is high there precisely because ascension is a button everyone can press. That is the
clearest possible vindication of gating feasibility before optimising spread.

### Why D3 cannot be bought with any constant

Five of the eight pool strategies — `passive-control`, `uniform-random-legal`, `archivist`,
`portal-rush`, `worship-maximizer` — produce **identical** achievement vectors: 12 mastered cells,
51 nodes, 12 cells. Any predicate that refuses the idle probe refuses all five. The two deniers sit
strictly below that profile on every axis, so admitting them readmits the passive profile. Exactly
one winner remains, and the Pareto front over the pool has **one point**.

D3 therefore binds on the **strategy pool and the missing loops**, never on the win condition.
Tuning a predicate until three strategies clear it would be fitting the win condition to the pool —
measuring our own labelling, which this campaign explicitly forbids.

---

## Workstreams, with acceptance tests

### W6 — the two ascension predicates require positive achievement

Traceable to **§8a**: *"a summit reached — the deepest node of a cell, or a civilization that has
held its knowledge intact across enough eras"*. The defect is that *"held its knowledge intact"* is
currently satisfied by a universe that never had knowledge to hold.

- [ ] Path A gates on something the god's play creates. Measured input: `advanceConstruction` has
      **no caller anywhere in the tree**, and `fundUniversity` advances build progress by its own
      path — so completed universities exist only if the god funds them.
- [ ] Path B requires holding something real across eras, not merely not losing it.
- [ ] Thresholds anchored to the **passive baseline** (`knownNodes >= passive * K`), never to a
      strategy — the archivist's current summit *is* the passive baseline, so calibrating to it
      reproduces the defect exactly.
- [ ] Constants added with `gloss` and `tuningStatus: "untuned"`; loader invariants asserted.
- [ ] Report which thresholds need recalibrating once W7 and W8 land.
- **Acceptance:** D1–D4 reported with numbers, or the binding one named with evidence.

### W7 — the knowledge-capital loop

Traceable to **§6a**: *"a university's output scales with the depth of its library… knowledge is an
input to producing more knowledge… That is a compounding loop… the balance harness must watch it
specifically."*

- [ ] Library depth feeds research rate. Today `libraryDepth` is read only by `outlook.ts`'s
      placeholder `universityPreference` and affects no rate.
- [ ] The effect appears in **nodes known**, not only in instance counts — a loop that makes more
      copies of the same 51 nodes reproduces the archivist's exact non-result.
- [ ] `capitalSnowball` measures something real; report before and after. Its checkpoints are
      currently byte-identical because `libraryNodeCount` is 1 and never moves.
- [ ] Audit and report which §5/§6a/§7 mechanics are real, stubbed or absent. Do **not** implement
      them all. Known-present: mortality, teaching, scribing-consumes-materials.
- **Acceptance:** `archivist` separates from `passive-control` on nodes known by > 3 SE, and
  `referenceLibraryDepth` leaves 1.00.

### W8 — raids actually engage

Traceable to **§3** (The Portal Rule), **§8** (Raids), **§8a**. The engine exists and is unreachable.

- [ ] Something supplies `portalTargets`; `openPortal` gains candidates.
- [ ] State plainly how a raid is arbitrated within §1.1's one-universe-per-instance rule, following
      `arbitration.ts` and `portal.ts` rather than inventing a second answer. If §1.1 blocks the
      intended design, say so and propose the smallest unblocking change.
- [ ] `raidEngagement` flips to true only when honestly true.
- [ ] The four raid-dependent §7 metrics stop reporting `mechanic-absent`.
- [ ] PRNG streams audited: a raid draw must not re-roll another subsystem, or every committed
      baseline silently rots.
- **Acceptance:** `libraryDependence` leaves zero, per-strategy spread in nodes known widens, and
  `portal-rush` separates from `passive-control` by > 3 SE on at least one §7 metric.

---

## Open questions for the author — not for agents to answer

These are design decisions the spec does not settle. Agents have been told to raise rather than
invent, and these are the ones already known:

- [ ] **How much faster should raiding make you ascend?** The author's intent: *"there should be
      enough of a bonus to raiding that you ascend much faster"*, and *"if there are many universes
      they shouldn't survive to ascension, because someone should raid them."* §8 does not price it.
- [ ] **Is 55 copies per node a magnitude problem or a structural one?** Whether the loss channel is
      fixed by faster decay, fewer mages, or only by raids burning things.
- [ ] **Should species differ structurally, not just by rate?** Two independent reviews converged
      on this being the blocker for D9. Today all seven traits are rates; the proposal is that
      species differ in *which knowledge locations and rulesets serve them*. Vision §6 authors the
      rates; it does not author structural differentiation, so this is a genuine gap and the
      author's call.
- [ ] **Does `ascension-canon-breadth` lock out the archivist?** W2 proposes 96 nodes; the archivist
      measures 50.9. Unresolved between two proposals, and deliberately not settled until W7 lands.

---

## Standing constraints

- **Never run `npm run goldens:regen`.** Golden fixtures are determinism claims, categorically
  different from balance baselines. A failing golden test is a finding to report.
- Balance baselines may be regenerated via `regenerate-baseline.mjs` **with a written rationale**
  naming the constants that changed and the measured deltas.
- Determinism: no `Math.random`, no `Date.now`, no floats in the rules path. Fixed point at 1/1024.
- Randomness stream-split per subsystem.
- Content in validated data files, never hardcoded.
- Every claim reported with its number, and a negative result reported plainly. An engineered
  success is worth less than an honest failure.
