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
| W6 | Positive-achievement ascension predicates | opus | **complete** — see final numbers below |
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

---

## The meta-game, as the author specified it this session

None of this is in `vision.md` yet. It is recorded here verbatim in substance so it survives, and
W16 is writing it up as an OpenSpec proposal. **It is not yet decided for v1.**

### The loop

    within a bubble:   raid rivals -> loot their books -> extinguish their mages
    extinguished:      that universe's populace, materials and labour pay the conqueror
    clear the bubble:  promote to the next tier, populated by others who cleared theirs
    lose your universe: REJOIN a fresh bubble, carrying prestige
    the player never leaves the game; only universes end

### What it lands on that already exists

- **`stagnation-mageless-ticks` is 60.** A mageless universe is already a terminal state, so
  "extinguish their magic users" is a new *consequence* of an existing ending, not a new ending.
- **§8a already says** a ruined universe *"does not lose — it stagnates, and stagnation is its own
  ending"*, and that the world is *"persistent across runs, not within one infinite run"*.
- **`prestige-base-stagnated` is 128**, non-zero *"deliberately: a zero floor makes losing streaks
  spiral"*. Defeat was already priced.
- **§7's worship loop is the transfer channel** — favor regeneration scales with worship from
  *"mages, universities, and populace"*, so a populace revering a new god is an existing quantity.
- **§7a's "no map" survives**: worship, populace and materials are counts and relationships.
- **`contracts.md` anticipated ground changing hands by name** — *"when that stops being true — a
  raid that takes ground — `landUnits` moves to §1.1"*.

### The three collisions W16 must resolve, not smooth over

1. **"Prestige" is overloaded.** The author uses it as a verb for tier promotion. The codebase uses
   it as a noun for §8a's carried-forward score, with six authored constants and a loader-asserted
   identity. These need different names, decided now.
2. **Conquest competes with ascension as a win condition.** §8a's ascension closes a universe
   gloriously; clearing a bubble promotes you. Which does a player want, and what happens to bubble
   progress when you ascend? W6 has just spent a workstream making ascension discriminating —
   measured at rate 0.167, exploit margin +0.167, correlation +0.97 — and this changes what those
   numbers are for.
3. **§12 puts a ranked ladder out of v1 scope.** Bubbles-as-skill-tiers is a ranked progression
   system whatever it is called. *"Right structure, post-v1"* is a legitimate conclusion.

### Where the balance risk moved

Off the victim and onto the **conqueror**. A colony paying tribute into an already-compounding
worship→favor loop is precisely §6a's *"two compounding loops that feed each other… produces
runaway leaders"* and §8a's *"prestige must not compound without bound, or the meta-game decides
matches before they begin."* `capitalSnowball` already reads **0.3498 against a 0.35 threshold**
from a zero-prestige population. That is the number to watch.

### Open, and the author's to settle

- [ ] Which tier do you rejoin at — same, or demoted?
- [ ] Bubble size, and the trade-off: small clears fast and churns tiers; large makes raids frequent
      and promotion rare.
- [ ] What "conquered all universes in your bubble" means when rivals are eliminating each other
      too — is clearing it "last one standing"?
- [ ] The "special circumstances" allowing an unbounded bubble.
- [ ] Whether durability should resist **looting** as well as burning. The spec says only that
      dwarven grimoires resist destruction.
- [ ] **`vision.md` §8 now contradicts the author's intent.** It calls an unbounded griefing surface
      *"a live-PvP death sentence dressed as a strategic cost"*. Elimination is intended, and
      rejoin-into-a-new-bubble is the bound. Until §8 is updated it will keep generating this
      objection from every reader and every agent.


---

## W6 final result — the win condition is fixed

Measured at n=96, 2400 ticks, eight strategies, before and after the predicate rewrite:

| # | claim | before | after | verdict |
|---|---|---|---|---|
| D1 | `ascensionRate` inside 0.05–0.20 | 0.771 | **0.125** | **passes** |
| D2 | exploit margin ≥ 0.05 | −0.229 | **+0.125** | **passes** |
| D3 | ≥3 winners, none above 60% of wins | 7 winners | **1 winner** | **fails** |
| D4 | correlation with nodes known > 0 | +0.324 | **+0.957** | **passes** |

**Both summits are live**: `permissive-breadth` takes 6 apotheosis and 6 canon, so neither path is
dead and `qualifyingPath`'s apotheosis-first bias has not silently killed canon.

### Why D3 failing here is the correct outcome, not a regression

Winners went from seven to one because the predicate now **excludes everyone who was winning by
doing nothing**. The seven included the idle probe and four strategies finishing at the passive
knowledge baseline. Exactly one strategy — `permissive-breadth`, the only one that measurably
changes what its universe knows — still qualifies.

That is the win condition working. A game where seven strategies win and five of them are
indistinguishable from inaction had a broken win condition; a game where one strategy wins because
it is the only one that does anything has a **content and pressure problem**, which is W7's and
W8's territory. D3 was always going to bind there — W6 demonstrated as much before measuring it, by
showing the pool's Pareto front is a single point.

### The evidence discipline worth copying

The 60-tick and 240-tick baselines report **"no metric moved"**. They were regenerated *only*
because `contentRevision` changed and the gate refuses cross-build comparison — not because
anything moved. That is what makes the 2400-tick movement attributable to the win condition rather
than to a simulation change, and it is the cleanest baseline justification this campaign has
produced.

---

## W15: the thesis is refuted, and the mechanism is upstream of everything

*"The v1 subset is not too small — acquisition is too easy"* is **necessary and demonstrably
insufficient**. Measured over 84 runs, 7 strategies, 51 node columns inside the v1 ruleset:

| measure | value |
|---|---|
| first eigenvalue variance share | **0.914** — one component explains 91% |
| participation ratio | **1.19** |
| mean cross-strategy containment | **1.000** — strategies **nest**, they do not merely converge |
| prefix fidelity | **0.943** |

**A single fixed node ordering predicts each run's held set from its count alone** — exactly, on 65
of 84 runs. Strategies are not choosing different magic; they walk one queue and stop at different
points. Gnome and human, sharing only `depthCeiling: 4`, reach the **identical 49-node set**; the
two nodes neither reaches are exactly v1's only two tier-5 nodes, so the ceiling differentiates them
and nothing else does.

**The mechanism:** `compareTargets` orders candidates by `remainingCost`, then `nodeId`. **The
acquirer is value-blind.** Harder acquisition moves the stopping point without reordering the queue,
so compositional value and opportunity cost are *unobservable to the simulation* however well they
are implemented elsewhere. This sits **upstream of raids, teaching and the economy**.

It also contradicts vision §7 — *"mages act on utility-scored goals shaped by species, age,
personality, and their assigned standing role"* — so fixing it is implementing the spec, not
inventing a mechanic. W17 owns it. The falsifiable test is W15's own: **prefix fidelity below 0.7**,
dimensionality above 1, containment below 1.000, and gnome ≠ human.

## Decisions W6 left for the author — rule versus magnitude

Each is a place where implementing §8a required choosing, and W6 chose the smallest option and said
so rather than deciding silently.

- [ ] **§8a says "the deepest node of *a* cell" — singular.** W6 read the multiplicity as a
      magnitude (`ascension-summit-cells`, identity value 1 = §8a read literally). It could not stay
      at 1 because an idle universe masters all twelve cells. Is multiplicity a magnitude or a rule?
- [ ] **`ascension-canon-cells` — requiring breadth to span N distinct cells — is arguably a second
      rule rather than a magnitude.** Identity 0 turns it off.
- [ ] **The scale-relative loss allowance changes the *form* of "held its knowledge intact."**
      Traceable to `discriminating-ascension` D2, but it is a rule change.

## A repository hazard worth writing down

**`git add -A` is unsafe in this repo while a tuner is running.** The balance tuner writes
`packages/content/data/god-constant.json` to evaluate a candidate and restores it on exit; a
concurrent `git add -A` committed a trial value into a commit (`975e177`), reverted in `41d40be`.
Stage explicit paths when any sweep or tuner may be running — which, with several agents live, is
most of the time.

---

## W13: teaching is not the lever, and one tradition is already in band

### The reference tradition is True Naming, by accident of the alphabet

`scribingTraditionId` returns the first tradition whose `store` hook can scribe, walking traditions
in **interned** order — and `internSorted` sorts id strings lexicographically:
`art-of-memory`(1), `true-naming`(2), `vancian-memorization`(3). Art of Memory is skipped because a
`palace` store cannot scribe, so **True Naming wins the loop and Vancian is never reached.**

That is not a design decision. It is a consequence of spelling, and it means the campaign's entire
measured record was taken under the one tradition where **teaching works**.

### Teaching under Vancian is not slow — it is dead on schedule

`lessonsTaught` by quarter, passive control, n=8 shared seeds:

| tradition | 1–600 | 601–1200 | 1201–1800 | 1801–2400 |
|---|---|---|---|---|
| vancian | 134.1 | **0.0** | **0.0** | **0.0** |
| true-naming | 976.6 | 268.5 | 154.0 | 113.8 |
| art-of-memory | 171.6 | **0.0** | **0.0** | **0.0** |

Founding grants are teachable everywhere; they decay below the 512 threshold and nothing climbs
back. So the C2 mechanism was real — for the **two traditions that never run**.

### And it does not matter — the decisive number

**True Naming's 11.3× teaching buys `0.0 ±0.1` extra nodes known** (+581 instances).

**Teaching multiplies copies and never reaches a new node.** Between Vancian and True Naming the
five plateau strategies differ by −0.1, 0.0, −0.3, −0.1, +0.1 nodes — every one inside its own
standard error — and 67 ascensions against 66.

So the 51-node plateau and `ascensionRate` ≈ 0.69 **reproduce under the acquire hook where every
instance is born at full mastery**. Whatever causes them, it is not the teach threshold. That is an
independent confirmation of W15: the lever is the **value-blind acquirer**, not knowledge
propagation.

The one real difference is `permissive-breadth` at **−60.7 ±9.3 nodes** under True Naming, which is
its 2× `researchCostMultiplier` — the only strategy that researches enough to feel the price of
research does *worse* under the tradition that propagates better.

### Art of Memory is in band without touching a single ascension constant

| tradition | ascensionRate | grimoires | libDepth | capitalSnowball | nodes |
|---|---|---|---|---|---|
| Vancian | 0.6875 | 979 | 1.4 | 0.1818 | 65.8 |
| True Naming | 0.6979 | 908 | 1.7 | 0.2487 | 58.2 |
| **Art of Memory** | **0.1250** | **0** | **0.0** | **0.0000** | 17.2 |

Zero grimoires across all 96 runs, exactly as §4a describes, and `permissive-breadth` falls from
12/12 to 0/12. It is the **only arm with an in-band `ascensionRate`** — reached by the `store` hook,
not by any balance constant.

**The axis is real but it is two levels, not three, and the split runs between `store` hooks rather
than `acquire` hooks.** W13 flags that it could not confirm §4a's *"lost when its holder dies"* as
the mechanism — living mages are equal across arms, so `slotsPerMage: 12` capping holdings is the
likelier cause. Recorded as an untested hypothesis, not a finding.

`prestigeAdvantage` and `winRateByPrimitive` are **unavailable in all three arms**. Still no raids.

---

## W8: raids fire, looting answers content exhaustion, and every v3 portal-rush number was fiction

### §1.1 never blocked a raid

`rules-raid` calls `permits()` against a **frozen `RulesetSnapshot`** at exactly one site, proven by
its own conformance scan. The stepping instance still holds one universe; a raid is a pure
computation *above* the step loop over two participants. §1.1 forbids a legality decision against a
live second universe, and nothing does that. **`contracts.md` needed no change.** What was missing
was only the party that *supplies* the second participant.

### The four §7 raid metrics now report

| metric | status | value |
|---|---|---|
| `raidLengthDistribution` | **measured** | p50 74, p95 125, max 2822, 1181 raids, overflow bin empty |
| `inboundRaidTempoLoss` | **measured** | **0.0** |
| `raidInitiationCost` | **measured** | 4.18 world ticks outbound |
| `winRateByPrimitive` | `no-observations` | needs ablation arms with mirrored pairs |

**`inboundRaidTempoLoss = 0` is structural, not missing.** §8's tempo cost is relative to
*uninvolved* universes, and §1.1 puts one universe in an instance — there is no third party for it
to be relative to. **§8's griefing guard cannot bite in a single-universe Monte Carlo.**

### Looting works, and it is the answer to content exhaustion

`portal-rush` separates from `passive-control` on **five** metrics against a brief asking for one:
nodes **+4.3 SE**, instances **−5.1 SE**, raids **+12.4 SE**, nodes looted **+17.2 SE**, grimoires
**+8.3 SE**.

The spread widened — `portal-rush` 50.9 → **57.0** nodes, `uniform-random-legal` 49.8 → **59.5** —
and **both gains are looted, not derived**: roughly 9 nodes per run **from cells their own gods
forbid**. That is the 51-node ceiling being crossed by conquest, exactly as §5's *"portable,
lootable"* implies.

### Every `portal-rush` number recorded before this is a number about an empty battlefield

`RAIDING_ROLES` is `raider` alone and **every mage is born a `researcher`**, so v3 opened portals
and sent an empty warband — measured at **337 raids across four runs with zero nodes taken**.
`portal-rush` is now v4 and assigns roles.

### Two real defects found inside `settleLibrary`

The durability roll chose between a `moved` verb and a `destroyed` verb, and **nothing in the
write-back inserted an instance for `moved`** — so a looted book was destroyed at the host and
**arrived nowhere**, and a dwarven library lost exactly as much as an orcish one.

Fixed: the first four books are genuinely looted (real row plus instance in the raider's world), the
rest face fire, and **durability decides survival — orcish ~40%, dwarven ~90%**, capped so a dwarven
book is not fireproof. **That is the structural species axis going live**, and it is the first time
`scribeAffinity` has ever changed an outcome.

`settleLibrary` is authoritative and now routes its destroy through `destroyGrimoire`. One
mechanism, reached by its published name, no third path.

### What raids did NOT fix

- **`ascensionRate` 0.875 → 0.854**, against a band of 0.05–0.20. *"Waiting is still nearly free,
  because loss is still nearly free."*
- **`nodesLost` is 0.00 for six of eight strategies.** Grimoires fell 1232 → 354 for
  `passive-control` while instances held flat: raids burned real books and removed nothing, because
  at 50–80 copies per node a whole library is held fifty other places. **Concentration, not the
  absence of a mechanism, is the remaining problem.** Not tuned away.
- `knowledgeHalfLife` could not be computed — its §7 collector needs a census carrying node-id
  lists and the reference executor's carries aggregate counts. Named, not papered over.

**Note the measurement gap:** W8's 0.854 was measured **without** W6's positive-achievement
predicates, which independently reached **0.125**. The two have never been measured together.
Integration is now the critical path.

---

## Round 2 close-out: the instruments were wrong, and the ceiling is the answer

### Three defects in the campaign's own instruments, found by adversarial verification

1. **The tuner ran a six-strategy pool.** `assignStrategies` under round-robin is
   `strategies[replicateIndex % poolSize]` — **`cellIndex` never enters** — and `tune-balance.mjs`
   defaults to `--replicates 6` against an eight-strategy sweep. `portal-rush` and
   `worship-maximizer` were never assigned. **`ascension-summit-cells = 13` was chosen by a scan
   missing a quarter of the pool.** Pinned in `round-robin-coverage.test.ts`.
2. **D2 is D1 restated.** `scoreBalance` computes `poolMean` *including* the probe, so
   `exploitMargin ≡ ascensionRate − probeRate`, and `EXPLOIT_MARGIN_MIN` equals `band.min`.
   Measured 0.1250 and 0.1250 — the same number twice.
3. **D4's correlation is one point against a cluster.** +0.955 over eight points, seven at rate 0;
   drop the winner and Pearson is undefined. **Spearman is 0.615.**

### The win condition reads the ruleset, not play

`permit-then-idle` — permit actions for **140 of 2400 ticks**, then an empty preference list for the
remaining 2260 — scores **12/12, 231.0 nodes, apotheosis 6 / canon 6**: `permissive-breadth`'s exact
profile on different seeds. Funding, dispensations and research encouragement contribute **nothing**.
Adding the probe pushes `ascensionRate` to **0.2500, out of band** — so the band was a property of
pool composition, not of the ruleset.

We replaced *"idle, then press the button"* with *"permit everything, then idle."* Same defect, one
level up.

**What survived:** the identity property, confirmed twice — a differential test over **40,000
randomised fact sets** with zero disagreements, plus an end-to-end run reproducing the pre-change
table cell for cell.

### W17: the acquirer is fixed; the metrics were saturated

All four thresholds failed, for a reason that is not the selector: **five of seven unrestricted
strategies still hold all 51 reachable v1 nodes.** A set containing everything is contained in every
other set, so containment 1.000 and prefix fidelity are arithmetic about the ceiling.

Everything unsaturated moved: effort-shape participation ratio **2.39 → 4.89**, human's cross-seed
intersection **37 → 0**, every species ~2× faster to tier 3 with the spread reopened into three
bands. And the summary in two rows: at 600 ticks `nodesKnown` **22.1 → 29.4 (+48.6 SE)**; at 2400
ticks **unchanged**. **Much sooner, same place.**

It also established what made the original defect total: **v1 `researchCost` is a pure function of
tier**, with zero within-tier variation — so the old ordering was literally "tier, then node id",
one queue for every mage in every universe.

### Four independent confirmations, one conclusion

W15 (prefix fidelity), W13 (teaching buys 0.0 nodes), W7 (the loop moves rate not ceiling), W17
(saturation) all say the same thing. **A universe must not be able to exhaust the reachable set.**
W8's looting is the only mechanism yet measured that crosses the ceiling — ~9 nodes per run from
cells the god forbids.

**Report every acceptance criterion as `failed` or `saturated` from here on.** They are different
findings and only one of them is about the game.
