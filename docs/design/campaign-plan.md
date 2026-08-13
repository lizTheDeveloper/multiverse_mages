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

## Where this stands — read this first

*Written 2026-08-13, after the day that answered the campaign's question. Everything below this
section is the record in the order it was found, including the parts later shown wrong. That order is
deliberate: the corrections are the document's value, and several of them correct claims made
confidently here.*

### The campaign asked why `permit-then-idle` wins. The answer is not a mechanism.

**The measurement apparatus mostly did not run, and the part that ran could not fail.**

- **10 of 15 registered metrics have never produced a number.** `collectRunMetrics` has no production
  caller; nothing constructs a `RunTelemetry`. The four "dead constants" recorded below as separate
  oddities were four symptoms of that one uncalled function.
- **The gates that do run had tolerances of ±118% of mean**, from a standard error pooled over arms
  spanning **294×**. Take every metric × every strategy and suppose that arm collapsed **to zero**:
  **80 of 80 collapses sat inside tolerance.**
- **Two of three gates play no god verb at all**, so no god-agency change could ever move them.

Eight mechanics were declared null by that apparatus. Some of those nulls were the instrument.

### And the win condition reads the ruleset, not play

**`permit-then-idle` wins 40/40** by permitting the grid for 140 of 2400 ticks and then submitting
**nothing at all** for the remaining 2260. It beats `permissive-breadth` (38/40), which does the same
permitting *and* funds, blesses and encourages. **The idle bot beats the active one**, and what
separates them is not play — it is which cells were opened in the first 6% of the run.

*Corrected 2026-08-13.* An earlier version of this section said the win condition was a button on a
passive clock — that `passive-control` reached apotheosis at tick 960 in 8 of 8 runs and scored 0
only because its stance is `never`, and that `uniform-random-legal` ascended 80/80 by drawing the
button. **That was true when measured and is now stale.** `ceb1492` (W6, *"both paths must read an
achievement, not an absence"*) closed it. Direct re-measurement finds **0 of 4 qualify** with
`ascensionFirstMetTick = 0`, and the committed n=400 record agrees: `idle-then-declare` and
`uniform-random-legal` both ascend **0/40**, not 80/80. `balance/README.md`'s passage about the
27-of-32 rate being *"a statement about a clock, not about play"* describes the pre-W6 build and
should be read with that date attached.

The defect survived the correction; only its mechanism changed. It is no longer that a bot can win
without pressing the button — it is that a bot can win **by pressing only the ruleset buttons and
then nothing else.**

### Three things below are now known to be wrong

- **"Seed beats strategy" was a measurement artifact.** The sweep's round-robin assignment gave each
  strategy **disjoint replicate indexes**, so no two strategies ever played the same universe. Held
  fixed, `nodesKnown` shows **η²(strategy) = 1.00** from tick 60, and cross-strategy Jaccard on a
  shared seed is **0.23** against within-strategy cross-seed **0.89**. **Strategy dominates node
  composition, and always did.**
- **"Five independent confirmations of content exhaustion" is at most four.** A perfect prefix
  structure *entails* containment 1.000 — arithmetic, not corroboration.
- **Permits cost 96 favor, not 98,304.** `favorCost` is typed `Fp`; every figure quoted below in raw
  integers is 1024× too large.

### What is actually broken in the game, as distinct from the instrument

- **Five of seven combat primitives cannot be cast.** `raid.ts:588` skips any node not carrying
  `direct-damage`. `ward`, `concealment`, `summon`, `blink` and `knowledge-steal` are **0 castable**
  across ~112 nodes; only 11 of 38 `area-denial` nodes ride in on damage's ticket. **`knowledge-steal`
  never fires**, so a raid cannot be an attack on knowledge.
- **Mastery only ever falls.** `setMastery` has one non-test caller — the decay pass — and it lowers.
  Research creates instances at 256 against a 512 teach threshold and they can never climb, so every
  teachable instance descends from a god grant at 1024. **93.4% of held knowledge cannot be taught.**
- **No mage ever applies magic, and no mage ever chooses to teach.** Economic multipliers derive from
  what mages *know*. `teach` was feasible on 2,628 evaluations and selected on **zero** — every lesson
  happens because a *student* went looking.
- **Nothing limits breadth.** All six species can staff **70 of 70** cells; every cell has a
  prerequisite-free tier-1 node and the lowest depth ceiling is 3.

### What is landing against it

The effect pipeline is connected and causally proven (PR #42). `practice` exists. The gate tolerances,
the metrics collector, the castability filter, the ascension predicates and a declared-primitive
worship loop are all in flight. Where a mechanic below was declared null, **re-measure before believing
it** — the instrument that judged it has changed.

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

---

## Round 3 review: where two independent models converge

Qwen 3.8 Max and GLM 5.2 were given the same brief and agreed, unprompted, on six things.

### The discipline that was missing — this is the durable lesson

> "Before you use a metric to evaluate a fix, you must demonstrate that the metric can distinguish
> between a system you *know* is broken and a system you *know* is working. If you cannot produce
> both a **negative control** and a **positive control**, the metric is not ready to be used."

And the diagnosis of why it was not obvious in advance:

> "You were treating the metric as a **definition** — *diversity = participation ratio* — rather than
> as a **claim**: *participation ratio tracks the thing I care about*. Definitions don't need
> testing. Claims do."

**Adopted as campaign policy.** Every metric gets an idle-bot negative control and a hand-designed
positive control **before** it is trusted, not after it produces a surprising result. The
adversarial verifier was the right instinct applied at the wrong end of the pipeline.

### The structural answer on front-loading

> "A strategy game with front-loaded decisions is salvageable if the front-loaded decision is
> **incomplete** — if it sets a direction but doesn't determine the destination. Chess openings are
> front-loaded; nobody calls chess solved at move 6. **The fix is not to delay the decision but to
> make it insufficient.**"

Both models propose the same shape: **permission should be necessary but not sufficient.** The god
permits a cell, and must then fund, seed or encourage to reach specific nodes within it. That is
traceable — §7 already calls `grantFoundingKnowledge` *"the only way to introduce a body of magic
nobody in your world knows"* and `encourageResearch` a *research direction*. Both are currently
inert, which is exactly what `permit-then-idle` proved.

### Agreed, and unambiguous

- **Delete the exploit-margin metric.** Algebraically identical to `ascensionRate`. (Our defect.)
- **Never calibrate on a partial pool again.** (Our defect — `replicates` must be a multiple of pool size.)
- **Reduce copy counts to 1–3 per node.** At 50–80, burning a library is cosmetic and
  "knowledge lives at a location" is decorative.
- **Stop building rate mechanics** until the ceiling moves. "Slower, same place" is not progress.
- **Stop adding nodes** to a set an idle bot already exhausts.

### GLM's distinct contributions

- **Make the win condition relative** — rank within a bracket rather than an absolute threshold.
  *"This is the single change that makes the idle bot lose."* It fits the author's bubble structure
  directly.
- **Enforce ruleset heterogeneity in the bot pool.** If every bot declares the same 12 cells,
  **looting cannot create diversity** — a defect in the *instrument*, not the game.

### Where I dissent: do NOT revert the knowledge-capital loop

Both models call for reverting W7 as *"rate not ceiling, complexity for zero differentiation."*
I disagree on two grounds they did not have:

1. **§6a is normative.** *"Knowledge as capital… the consequential one"* is in the vision of record,
   and `CLAUDE.md` treats an unshipped vision section as an unmet promise, not as optional scope.
2. **It had a measured strategic effect neither model saw.** Novelty-first scribing flipped
   `narrow-depth` from 12/12 to **0/12** on Enduring Canon, because shelves now hold single copies
   that upkeep can destroy. That **partially breaks "doing nothing is perfect custodianship"** — the
   defect this campaign named as the root of the broken win condition. It is also the mechanism that
   makes their own recommendation #3, scarce copies, reachable.

**Deprioritise, do not revert.** Recorded as a disagreement rather than settled.

---

## Integration round 2 — the parts do not compose

`integration/campaign-round-2`, 64 commits, eight merges. **`npm run verify` EXIT=0**, 3,872 tests
in 275 files, all three gates PASS, and **no golden fixture regenerated or changed at any of the
eight merges** — checked at each one.

### D1–D9 at n = 400 (2,400 runs, six arms, exactly 40 per strategy)

| # | criterion | number | verdict |
|---|---|---|---|
| D1 | rate in 0.05–0.20 | **0.1950** (10-pool); 0.1187 (8-pool) | passed |
| D2 | margin ≥ 0.05 | +0.2167 | passed — **carries no information** |
| D3 | ≥3 winners, none > 60% | **2 of 10**, top 51.3% | **failed** |
| D4 | correlation > 0 | Pearson +0.976, **Spearman +0.685**, 2 of 10 non-zero | passed, weakly |
| D5 | halfLife falls; nodes leave | instrument absent | **not measurable** |
| D6 | nobody wins at the passive baseline | no winner ≤ 51.0 | passed, **saturated** |
| D7 | species mix changes the winner | rate moves 1.000→0.350→0.000, **winner identity invariant** | **failed, saturated** |
| D8 | verify green, baselines justified, no goldens | all three clauses | passed |
| D9 | >1 playstyle per species | one, for everyone | **failed** |

**The band is a property of the pool, not the ruleset.** Adding two probes moved the rate
0.1187 → 0.1950 — **65% of the band's width on pool composition alone.**

### The headline is not a number

**`permit-then-idle` wins 40/40. `permissive-breadth` wins 38/40.**

A bot that presses two permit buttons for 140 of 2,400 ticks and then submits an empty preference
list forever **beats** the strategy that funds universities, blesses mages and encourages research.
**Those verbs are worth slightly less than nothing.**

Also confirmed: `uniform-random-legal` — the probe every published exploit margin was measured
against — is genuinely crippled. `CANDIDATE_SLOTS` covers actions 8–14, so it submits 1–7 bare; the
gate admits them, coordination refuses them onto `state.illegalActionCount`, and
`illegalActionRate` reads the *session's* counters. **Seven of fifteen verbs inert, telemetry clean.**

### Three interactions no single branch could have seen

1. **W6 × W7 runs backwards.** Library depth: W6 alone no movement, W7 alone **25.47**, together
   **9.94** — a 61% cut. W6 lengthened the horizon and W7's own upkeep spends it.
2. **W6 × W13 annihilates W13's headline.** Art of Memory was *the only in-band tradition* at 0.1250.
   It is now **the only tradition that cannot ascend at all — 0 of 400** — because a memory palace
   holds no grimoires and W6's canon predicate wants a written record. **§4a's palace and §8a's
   canon are structurally incompatible as implemented.** Author's call.
3. **W7 × W8 collapses looting.** `portal-rush` was **+6.1 nodes at +4.3 SE** on W8's branch; here
   **+1.0 against a 2.09 SE**. The 151 books still arrive; the nodes do not stay.

### `capitalSnowball` breaches its guard

**0.4571** (True Naming), 0.4129 (Vancian), 0.0000 (Art of Memory), against the **0.35** its sibling
is held to — while `worshipSnowball` sits at **0.1028**. §6a's two-compounding-loops warning, one
running hot. Not tuned away.

### Two defects and a duplicate mechanism found by merging

- **Two tradition selectors**: W7's `traditionIndex` (ordinal into content order) and W13's
  `tradition` (content id). Resolved to **W13's**, because an ordinal *"would move the day a
  tradition is added"* — and this campaign's most-cited defect is that the reference tradition was
  True Naming *by accident of the alphabet*.
- **A raw NUL byte** in W17's `autonomy.ts` made git treat it as binary. Fixed in the squash so it
  is diffable from first appearance.

### Verdict

Not worse than the parts — but better for a reason that is not good news. **This is the fifth
independent confirmation that the binding constraint is content exhaustion**, and W8's looting, the
only mechanism measured to cross the ceiling, **no longer does so durably on the combined tree.**

---

## W18: a metric failed its own controls, and the shipped constant was chosen by it

**Both correlation coefficients pass a system that is known broken.** On the measured one-winner
pool, Pearson reads **+0.71** and Spearman **+0.53** (+0.96 / +0.60 on the real gate sweep). Both
look healthy.

**No magnitude threshold on either coefficient separates a relationship from a single leveraged
point — the degeneracy is in the *support*, not the magnitude.** Reporting Spearman beside Pearson,
which this campaign proposed as the fix, does not fix it.

Repaired with a **support gate**: the term contributes only at ≥ 3 winners, and contributes the
*weaker* of the two coefficients. The blindness is declared as a `falseFriend` in the registry.

**The consequence: the shipped ruleset scored +0.685 under the old instrument and −0.257 under the
repaired one**, entirely because a +0.96 over one winner no longer counts.
`ascension-summit-cells = 13` was chosen by a search that counted it.

### Content exhaustion, restated as two instrument properties

- **The measured node vector cannot supply a positive control for D4.** Five of ten strategies
  finish on exactly 51 nodes, and `permit-then-idle` holds the pool's **second-highest** node count
  (231) while correctly never winning. **No assignment of wins over measured data makes knowledge
  monotone with winning.**
- **`variety`'s positive control has never been observed** — 0.000 in every committed sweep since
  the win condition changed.

### Control separations, and the enforcement

    ascensionRate 0.733 · variety 0.590 · correlation 1.212 · spearman 1.000
    nonZeroStrategies 3.000 · exploitMargin 0.571 · topShare 0.667

Fields are enumerated off a **real** score, so a new numeric field with neither controls nor a
written exemption **fails the suite**.

`replicates % poolSize === 0` is now **refused**, not warned — divisibility rather than "≥ pool
size", because 12-over-8 passes a coverage check while making `ascensionRate` (run-weighted) and the
pool mean (unweighted) different quantities.

**The exploit margin was kept against both external reviews**, with evidence: excluding the probes
makes it a genuinely different function, pinned in **both** directions — failing while the band
passes, and passing while the band fails — which the old identity made impossible.

`npm run verify` green; all three gates **delta 0.00000**; no golden and no baseline regenerated.

---

## W19: the horizon hypothesis is refuted — the coordinator's own proposal was wrong

The proposal was: *"the game works and the horizon is four times too long for its content; measure
at a horizon before exhaustion."* Measured at n=400 per horizon across 12 horizons, common random
numbers verified on **400/400 coordinates**, coverage exactly 10 strategies × 40 runs:

| finding | number |
|---|---|
| passive universe at cap **300** | **48.9 of 51 nodes** — the premise assumed roughly a third |
| permission axis at caps 30/60 | all ten strategies inside a **two-node band** — inert for ~120 ticks |
| first winnable horizon | **1200**, by canon; 900 measures 0/400 because canon needs tick 960 |
| `permit-then-idle` at 1200 / 1800 / 2400 | **35/40 · 36/40 · 39/40** |
| strategies winning anything, anywhere | **2 of 10** |
| 2400 arm vs integration round 2 | `ascensionRate` **0.1950** — reproduces exactly |

The premise was built on W17's 29.4-nodes-at-600 figure, but W17's own change made acquisition
roughly twice as fast — *"much sooner, same place"* — so on the integrated tree a passive universe
is **96% exhausted by tick 300**, an eighth of the run.

**There is no horizon at which the existing content is interesting.** Before ~120 ticks the
permission lever does nothing; by 300 the set is exhausted; ascension cannot fire until 600 and
canon not until 960. Undifferentiated, then over, then finally winnable.

**So the flatness is in the content graph, and no scheduling change reaches it.** Twelve parallel
ladders are twelve ladders at any length. The author's instinct — that the absent
prerequisite branching was the defect — was right, and the coordinator's horizon proposal was not.

Method note worth copying: W19 **committed its decision rule before reading any composition
number** — a second dimension counts as real only if cross-strategy containment falls below the
within-strategy diagonal *and* `betweenShare` stays high among the seven v1-bound strategies. After
three saturation failures, pre-registration arrived without being asked for.

---

## The authorship call: the ceiling is the god's economy, not the knowledge graph

Six workstreams built mechanics that worked and none moved the negative control. The cause is
upstream of all of them, and it is arithmetic.

    favor regen, passive, at tick 240        2,721 / tick
    income over a 2400-tick run              6,531,264
    cost of all 19 primary switches             98,304    (5 x 8192 + 14 x 4096)
                                              = 1.51%

**§4's design is fully implemented and carefully priced.** A technique row is fourteen cells and
costs 8192; a form column is five and costs 4096. The edict budget genuinely grows as
`1 + worshipTier`, capped at `EDICT_BUDGET_MAX`, and the mask enforces it. Someone thought hard
about every part of it.

**None of it binds.** `permit-then-idle` buys the entire grid inside its first 140 ticks with a 4×
margin, and W9 separately measured **9.1–12.4M favor discarded per run** — the pool caps and
overflows.

So every verb is priced, no price binds, permit-everything dominates, and every mechanic built
inside that ceiling is a decision the winner never has to make. That is why the compositional graph,
the cost curves, the rituals and the timing rule each measured a null against `permit-then-idle`.

And the reason favor does not bind is upstream of favor again: **worship accrues passively.** W16
measured the populace term at **94.8% of its cap** at the reference populace — absorbing an entire
rival civilization adds **+0.76%**. Income is effectively fixed, enormous, and independent of play.

### Two levers, both already `untuned` content constants

1. **Make the prices bite** — the ratio of favor income to the cost of the nineteen switches.
2. **Make worship depend on play** rather than on existing.

This is far smaller than anything built this session, and it is what six confirmations point at. It
is also precisely what the balance tuner exists for — and the tuner is now repaired, with
control-gated scoring, an exploit margin that no longer restates the ascension rate, and a refusal
to calibrate on a partial pool.

### What this does NOT mean

It does not mean the content graph, the cost curves or the rituals were wasted. It means they were
**unmeasurable** while one act bought the whole ceiling. Their value is untested, not disproved —
and it becomes testable the moment permitting is a decision.


---

## Correction: the graph is a lattice, and perception gates depth rather than entry

Two claims of the coordinator's, corrected by measurement.

**"Twelve parallel staircases" was wrong.** The v1 grid is a **lattice**: four form-columns with
Intellego as the trunk in each and Perdo/Rego branching off, plus two links at the trunk layer.
Longest chain 6 deep. That characterisation was repeated to several agents before it was checked.

**"Intellego is a chokepoint for the entire grid" was overstated.** The load-bearing half holds --
**11 of 11** cross-cell prerequisite edges in v1 originate in Intellego. But **every Perdo and Rego
cell keeps its own tier-1 root**, and the perception edge attaches at tiers 2-4. Strip every
Intellego node and **18 of 51** v1 nodes remain reachable.

**Perception gates depth, not entry.** Grid-wide the rule is strong but not universal: **29 of 36**
cross-cell edges originate in Intellego, not 36 of 36.

The consequence for the exclusivity design survives with a weaker argument: excluding Intellego
costs a mage roughly two thirds of the v1 set and all of its depth, which is still disqualifying for
an exclusive pair -- but it is a severe cost, not a total one, and the design should be argued on
the real number.

## The open question this raises, and it is the author's

**Does "go wide" mean every cell ships enabled, or that the twelve-cell start stands and the other
fifty-eight are reached by permitting?**

These are different games, and the second is the one section 4's permit verb already describes:
`enabled` in `cell.json` governs which cells carry active content; `permits()` governs the god's
ruleset. They are separate gates, and conflating them was implicit in the go-wide instruction.

---

## The root cause, found twice independently and verified directly

Two workstreams that were not talking to each other — W30 (hard-SF projection of the magic rules)
and W29 (city and supply chain) — arrived at the same finding from opposite ends. I verified all
three legs of it myself against the tree rather than taking either agent's word:

    $ grep -rn "gatherEffects" --include="*.ts" packages/
    -> 25 hits. Every one is in test/ or dist/. ZERO production callers.

    $ grep -rn "stackContributions|EffectContribution" --include="*.ts" packages/*/src
    -> nothing outside rules-magic/src/effects itself.

**The effect pipeline is not wired to the world.** `gatherEffects` turns "a mage knows a node" into
"a rate changes", `stackContributions` applies section 3's stacking law to the result, and nothing in
production calls either. The pipeline is authored, tested, adversarially tested, and disconnected.

The one runtime path from knowledge to the simulation is `yieldSources`
(`packages/coordination/src/god/system.ts:613`), which feeds worship favor. Its entire gate is:

    if (knowledge.instanceCount(nodeId) > 0) found.push(...magnitudes);

**Exactly one of sixteen primitives is node-driven at runtime — `worship-yield` — and it is the one
whose accounting never calls `permits()`.** A forbidden node keeps paying. A node held only in a
grimoire in a civilization with no living mages keeps paying.

### This explains every negative result in the campaign, and retires several open questions

The campaign established five separate ways that the binding constraint was "content exhaustion",
and then built six mechanics — raids and looting, the knowledge-capital loop, the value-sensitive
acquirer, a deeper graph, cost curves and timing, and a shorter horizon. **Every one worked on its
own terms. None moved the negative control.** That is not six unlucky results. It is one result,
observed six times, and the diagnosis was wrong:

- Content exhaustion was never the constraint, because **content does nothing**. Learning all 51
  nodes by tick 300 costs nothing and buys nothing, so the plateau was never a ceiling — it was a
  measurement of an inert quantity.
- The archivist producing 4,096 grimoires against passive's 1,156 and ending on the same 51 nodes is
  not a redundancy problem. Grimoires feed instance counts, instance counts feed a `> 0` test.
- Every species trait is inert for the same reason. Retention, scribe affinity and rediscovery all
  move mastery and instance counts, and nothing reads either except a presence test.
- `permit-then-idle` wins, and **beats** the bot that funds and blesses, because permitting is the
  only verb that touches the single live path at all — and it does not even have to stay permitted,
  since `yieldSources` never re-checks the ruleset.

The earlier diagnosis in this document — that the ceiling is the god's economy — was closer than
"content exhaustion" but still downstream of this. Both are hereby superseded. **The ceiling is that
the god's ruleset and the academics' knowledge are, at runtime, connected to the simulation by one
unconditional favor trickle.**

### Correction to a figure recorded above

This document has said permitting all nineteen switches costs 98,304 favor, or 1.51% of a run's
income. That is right for nineteen switches and wrong for the game as shipped. The v1 subset is a
strict rectangle — `{Intellego, Perdo, Rego}` x `{Mentem, Terram, Limen, Nomen}` — so all twelve
enabled cells open on **seven** switches for **40,960 favor, 0.63% of income**. The permit economy is
less than half as binding as recorded. Creo, Muto and Corpus are all dark, which is a content-side
restatement of the measured one-component result: **nothing in the shipped grid makes or transforms
anything.**

### Status: being fixed, and the fix needs a decision

W29 is building `packages/coordination/src/universe-effects.ts` — 46 of the 70 cells carry a
`resource-yield` or `build-rate` effect at `target: "universe"`, waiting on exactly this wire. Its
treatment is better than what would have been specified for it: it gates on `permits()` **at
application time**, so an interdiction switches the economy off without destroying what anyone knows;
it contributes a node's magnitude once however many copies exist, so copying a book stays a hedge
rather than a harvest; and it passes magnitude arrays to section 3's `stackMagnitudes` rather than
summing them.

One open divergence has been raised with W29 and is not yet resolved. `gatherEffects` enforces a
mastery activation threshold and location dormancy, and has an adversarial test pinning the latter.
`universe-effects.ts` re-walks the instance store and gates on **presence**. Under presence-gating a
node discovered one tick ago, at `DEFAULT_INITIAL_MASTERY = 256`, delivers full economic yield, and
decay toward the floor never reduces it — which would make retention, decay, teaching thresholds and
the whole marooning mechanic inert *on the new path*, reintroducing the campaign's central failure
class inside the fix for it. There is a real argument for presence (a shelved grimoire has no
mastery), so this is a design fork to settle and record, not an obvious bug.

The architectural question behind it: **two implementations of knowledge-to-effect will diverge, and
the one carrying the adversarial test will not be the one the economy uses.**

### What this does to the definition of done

D5, D6 and D7 were chosen as the tests that say the *game* changed rather than the numbers. They are
still the right tests, and they were unreachable for a reason no amount of tuning would have found:
D7 in particular — *varying the founding species mix changes which strategy wins* — cannot come out
positive while the only quantity species traits influence is an instance count read by a `> 0` test.
**No baseline collected before this wire lands measures the game.** They measure a favor trickle.
Balance work resumes after it, not before, and the tuner's calibrated constants should be treated as
provisional.

---

## Pre-registered: what the wire will and will not fix

Written **before** the first post-wire sweep, so the result cannot be read backwards into whichever
story it happens to fit. Six mechanics have already been built and measured; each time the
prediction was formed after the number arrived, and each time the campaign learned less than it
should have.

**The wire is necessary and not sufficient.** Specifically:

*Expected to move.* Species traits become economically legible for the first time, so `archivist`
should separate from `passive-control` on output rather than on grimoire count; interdiction should
acquire a price, since `universe-effects` re-checks `permits()` every tick; and **D7** — varying the
founding species mix changes which strategy wins — becomes reachable at all. D7 was never a hard
test. It was an impossible one: the only quantity species traits influenced was an instance count
read by a `> 0` test.

*Expected NOT to move.* **D2** (exploit margin) and **D6** (no strategy wins at the passive
baseline). `permit-then-idle` opens all seven switches for 0.63% of income, its academics learn the
subset by tick 300 whether or not the god does anything else, and `universe-effects` will then pay it
in full. Idling never suppressed knowledge acquisition — it only skipped verbs. Wiring effects makes
knowledge *worth* something without making the idle bot's knowledge worth *less*.

The complement is permit opportunity cost, and it is the other half of the fix, not a follow-up.
Codex's spec puts the target at a focused opening portfolio costing **15–30% of plausible early-run
favor**; against the measured 0.63% that is a 24-to-48-fold increase. The measurement that says this
is required rather than fastidious is already in hand: `permit-then-idle` does not merely match the
active bot, it **beats** it. Qwen's reading of that number is the sharp one and it is recorded here
because it constrains the fix — *"you've built a more expensive door to the same empty room"*: making
favor scarce while the god's post-permit verbs remain worthless takes resources from the only bot
that spends them. **Verb value must land before or with permit cost, never after.**

So: if the post-wire sweep shows D5/D7 movement and D2/D6 flat, the wire worked and the cost half is
missing. If D5 and D7 are also flat, the diagnosis is wrong a third time and the next step is
measurement, not another mechanic.

## Resource model: four specs in hand, and one collision with a shipped requirement

Four independent economy specs were commissioned and all four arrived. (An earlier note in this
campaign that Qwen returned nothing was wrong — `qwen-economy-spec.md` is 19,008 bytes and
`qwen-economy.md` a further 8,589.) Where they agree is worth as much as where they differ:

| | resources | shape |
|---|---|---|
| GLM | 3 | Sustenance / Materia / **Vis** |
| Qwen | 3 | Sustenance / Stock / **Aether** |
| Codex | 4 | Provisions / Works / Script / **Vis**, and Vis is *lootable* |
| shipped (W29) | 3 | food / stone / vellum — **no magical stock** |

**Unanimous across all four external specs, and none of it is in the build:** occupation demand must
be *derived* from population and installed capacity rather than constant (the measured defect is
demand pinned near 104 regardless of populace); territory must scale *productivity* rather than dump
carrying capacity into one universe-wide number; magic must relieve a *named bottleneck* rather than
mint generic output; and permits must carry real opportunity cost. Three of four independently
propose a **magical fuel stock** that the shipped `food/stone/vellum` does not have — which is the one
live design delta, and the one that decides whether Vim and the ritual layer have an economy to sit
in.

Also unanimous, and a useful brake: **no intermediate goods, no crafting chains, no markets or
dynamic pricing.** Raw resource to consumer. Every spec says a conversion chain without coordinates
is bookkeeping, not decisions.

### The collision — for the author, not for an agent

`openspec/changes/mages-and-species/specs/economy/spec.md:250` is a shipped, validated requirement:

> **The economy SHALL track exactly three inputs — populace, materials, and knowledge-as-capital —
> and MUST NOT introduce a fourth resource.**
> *Scenario: WHEN the economy's tracked resources are enumerated THEN exactly populace, materials,
> and knowledge-as-capital appear.*

`MaterialAmounts` is `Readonly<Record<'food' | 'stone' | 'vellum', Fixed>>` — three independent
stocks, with `territoryYieldShares` giving them separate supply and `routeYieldByForm` giving them
separate demand. Two honest readings, and they are not close:

- **One input, differentiated.** "Materials" remains a single tracked input whose internal
  composition varies. The requirement is about the *count of inputs the economy reasons over*, and
  three kinds of one input is not a fourth input.
- **Three resources wearing one label.** Independent stocks with independent scarcity and
  independent claimants are three resources whatever the type is called. This is the reading the
  scenario's word *enumerated* most naturally supports.

W31's research offers a third path that satisfies the requirement as literally written: keep
`materials` as **one pool**, and express the fourteen forms as **converters and activators on the
flow** rather than as pools — a form gates whether a conversion may fire, or changes its yield. No
new stock, and *Rego Terram* still moves the number exactly as §6a promises.

**This is a spec change either way and therefore the author's call.** It is not blocking: W29 and the
material-kinds workstream continue on the differentiated reading, which is the reversible one, and
this is recorded rather than resolved. What must not happen is the requirement being quietly deleted
to match the code — the requirement is the only reason anyone noticed.

### One thing the spec already requires, which the root cause was violating

Same file, third scenario: *"WHEN a universe's library depth increases with all other inputs held
constant THEN its research, teaching, and scribing throughput increase."* That is the missing wire,
written as an acceptance criterion, in a change that shipped. The effect-pipeline fix is not scope
creep and is not new design — **it is an already-agreed requirement that was never satisfied**, and
nothing was testing whether it had been.

## W31's research, in one line each — the parts that are directly actionable

Full synthesis at `docs/design/economy-flow-models.md`; these are the load-bearing ones.

- **`shortage` has a formal definition** (Dormans 2012 §4.3): a pool gone negative absorbs all inflow
  before anything downstream can pull. **Recommendation adopted: unmet upkeep should lapse into
  decay, never bank as debt.** A drain that cannot be paid should destroy capability, not create an
  obligation stock.
- **A converter engine deadlocks, and the named remedy is a weak static engine.** The knowledge-capital
  loop *is* a converter engine; it needs an unconditional production floor the debt cannot capture.
- **Source/sink power matching** (Cook): the diagnostic for economic health is **unspent pools**,
  never aggregate production. Favor regeneration scales with worship against a spend menu that does
  not — a structural mismatch, not a tuning error. The ledger already records 9.1–12.4M discarded
  favor per run **into nothing**; routing that discard into feedback is the fix.
- **Occupation demand pinned near 104 is a boundary-adequacy failure**, not an oscillation: there is
  no connector from populace back into demand, so the loop is absent rather than delayed. Do not
  reach for the supply-line fix here — reach for it in the *reallocation* rule, which has a real
  `transferRatePerTick` delay and reads only the current gap.
- **Every current metric is a level metric.** A run that oscillates and one that settles report the
  same median. Classify each run as equilibrium / oscillation / collapse and report the mode
  distribution — this is also the concrete definition INV-29 currently lacks. And the period-2
  alternation check cannot see a 1,400-tick cycle; use autocorrelation over the 12-tick census grid.
- **Extend `invariants.md`'s "Disproved by" column to the metrics registry.** Every metric states the
  observation that would prove it is not measuring what it claims. `libraryDependence` sitting at 0 —
  a metric structurally incapable of moving, reading as a healthy constant — is the fourth instance
  of this failure in this campaign and the cheapest one to have caught.
- **Adopt the notation, not the tool.** machinations.io is proprietary SaaS metered per node
  activation, which is hostile to Monte Carlo and awkward against AGPL. The vocabulary, the
  seven-field feedback-profile schema and the thirteen-pattern catalogue are free and citable. The
  one thing worth stealing is the **reverse trigger** — a starvation signal as a first-class
  primitive, which is exactly the per-claimant unmet-demand counter that would have caught the
  1,400-tick zero on the first sweep.
- **Correction to a term used earlier in this campaign:** *arms race*, *worker placement* and *slow
  cycle* are **not** Dormans patterns and appear nowhere in the thesis or the glossary. Do not spec
  against them.
- **Chain depth has no published rule of thumb.** Shipped deep-chain economies run 48–183 goods, but
  they manufacture decisions from build orders and spatial routing, both of which this game has
  constitutionally excluded — so those counts are an upper bound generated by mechanisms we do not
  have. The defensible rule is Cook's: **a resource earns its slot when it has its own sink and its
  own scarcity regime.** Fourteen materials sharing one sink is one resource with fourteen labels.

### Correction: the material-kinds cost is not sunk, it is pending — and it lands on merge

The material-kinds workstream reported that three-kind materials had "already spread past
`rules-world`" into `state`, `coordination`, `agent-api`, `scenario`, `gym-bridge` and `server`, and
that backing out would mean unwinding the world-state schema itself. It flagged, to its credit, that
it was reading this from compiler error text rather than from the source. Checked against
`origin/main` (`5abda97`), the picture is different:

    packages/state/src/components.ts:133      materials: 'i32'
    packages/state/src/components.ts:157      materials: Fp
    packages/agent-api/src/observation.ts:250 view[offset + 3] = saturate(record.materials)

**On `main`, `materials` is a single scalar**, and the observation space carries it as one value.
The spread the agent saw is real but confined to W29's unmerged worktree — which it was itself
working inside, and which is why the two workstreams' changes appeared as one tree.

That flips the shape of the decision, and makes it more urgent rather than less:

- **Nothing is committed to `main`.** Backing out today is abandoning a branch, not migrating a
  schema. The cost the report described is not already paid.
- **It becomes paid at merge.** `observation.ts:246` calls §4.1's field order *"the contract"*.
  Turning one `materials` scalar into three changes the observation layout, which breaks every
  trained policy and every recorded gym trajectory, and takes `WORLD_SCHEMA_VERSION` to 4.

So the question is not "is it worth unwinding" but **"decide before W29 merges."** After that, the
cheap option is gone. The three readings recorded above are unchanged; what changed is the deadline.

Two facts for whoever decides, both from the material-kinds report and worth keeping:

- The implementation **deliberately commits to the "three resources" reading.** There is no
  conservation law across kinds: `yieldWeights` components are independently bounded `0..1024` with
  no requirement they sum to anything, and Animal is `food: 512` *and* `vellum: 512` simultaneously —
  not a 512 split off one whole. Nothing anywhere represents materials as a single scalar with kinds
  as a view over it.
- **A fourth kind is not trivially addable.** `packages/content` uses named fields rather than a
  `MATERIAL_KINDS` const tuple, so adding Vis later means hand-editing five scattered places: the
  `MaterialKindAmounts<T>` interface, both `$defs` in two schema files, all 14 `form.json` and 5
  `territory.json` records, a hardcoded `['food','stone','vellum'] as const` loop in the invariant
  test, and the golden `contentRevision`. `rules-world/src/economy/kinds.ts` **does** have the tuple;
  `content` is the odd one out.

**Recommended cheap hedge, not yet authorised:** give `packages/content` the same `MATERIAL_KINDS`
tuple `rules-world` already has, with the schema and tests deriving from it. It adds no kind, changes
no behaviour, and makes both futures cheaper — adding Vis, or collapsing back to one pool. It is the
one move that does not preempt the decision.

---

## The process question: what allowed this, and the gate that was already in CI

The campaign rule after a defect is to ask what in the process permitted it, not who missed it. The
answer here is unusually clean, and unusually embarrassing: **the gate existed, ran on every commit,
and said the opposite of the truth.**

`npm run verify` includes `check:coverage` → `scripts/check-primitive-coverage.mjs`. Run today, on
`main`, against the shipped content:

    Primitive coverage over 51 v1 nodes (14 primitives exercised):
      research-rate      7 node(s)
      resource-yield     5 node(s)
      build-rate         5 node(s)
      ...
    Declared exclusions: fertility, lifespan
    Primitive coverage check PASSED.

Fourteen primitives reported **exercised**. `research-rate` reported as exercised by seven nodes —
while nothing in production reads a research-rate magnitude derived from any node, because
`gatherEffects` has no production caller. The check loads the **content registry** and asks *is every
primitive carried by at least one authored node?* That is an authorship question. The word
`exercised`, and the name `coverage`, both read as a runtime claim, and a reviewer comparing this
output against a content diff — which the script's own header says is its purpose — is given no
signal that the authored effects reach nothing.

This is the fourth instance in this campaign of a metric that cannot fail reading as a healthy
constant: `libraryDependence` pinned at 0, `capitalSnowball`'s byte-identical checkpoints,
`referenceLibraryDepth` at 1.00, and now the coverage gate. W31's research names the pattern and the
antidote: **every metric states the observation that would prove it is not measuring what it
claims.** `invariants.md` already has that column. The metrics and the CI gates do not.

The script is admirably self-aware about a *different* failure — its header argues that "a check
nobody has watched fail is not a check", and provides a directory argument so the failing path can be
exercised by hand. It was watched failing on the case it models. It models the wrong case.

### The missing gate, specified

A **consumption** check to sit beside the coverage check, in `verify`, failing loudly:

- For each primitive in the registry, assert that a production source **outside** `packages/content`
  and `rules-magic/src/effects` consumes a magnitude that originated at a node.
- Reachability is the honest framing, and it is static: it is the question *"is there a path from an
  authored effect to a rate the simulation applies?"* — answerable without running a sweep, which is
  what makes it a CI gate rather than a metric. W31 cites Nelson (2011) for the general form:
  properties of the artifact analysable without a playtest.
- **Naive grep is not sufficient and must not be used.** Searching production sources for primitive
  ids returns 78 files for `ward` (matching *toward*, *forward*) and 44 for `portal` (the whole
  portal subsystem). A string match over-counts so badly it would manufacture a second passing check
  that means nothing — which is the exact failure being fixed. The check must trace the call graph
  from `gatherEffects`/`stackContributions` to their consumers, or assert on an explicit registered
  consumer table that the effect pipeline exports.
- It must distinguish **node-driven** from **god-driven**. Several primitives are consumed today via
  god interventions (`god/interventions.ts`, `god/favor.ts`) without any node contributing to them.
  A check that counts those as coverage reproduces the defect one layer up: the question is not
  *"does anything read this primitive"* but *"can what the academics know change it."*

Getting this wrong in the lenient direction gives a green check and no information, which is worse
than no check. The output should print the consumer for each primitive on success, for the same
reason the coverage check prints node counts — so a reviewer watches the number shrink.

---

## W26, measured: 93.4% of what a universe knows cannot be taught, and every metric calls it healthy

2400 ticks, seed `0x00090001`, zero god input. These are measurements, not arguments.

- **2,028 of 2,172 held instances are marooned — 93.4%.** Mean teachable share across the run: 10.6%.
- **28 of 51 nodes have no teachable copy at all — 54.9%**, across 1,106 held copies.
- At that same instant: `fragileNodeIds` **0**, `singleLocationNodeIds` **0**, minimum redundancy **4**.

**Every committed metric calls that healthy.** This is the *fifth* instance in this campaign of a
measurement structurally incapable of reporting the thing it appears to report — after
`libraryDependence` pinned at 0, `capitalSnowball`'s byte-identical checkpoints,
`referenceLibraryDepth` at 1.00, and `check:coverage`. It is also the most consequential, because the
redundancy metrics are what **D5** rests on. Four copies of a node that no living mind can transmit
is not redundancy 4. **D5 as written may be measuring the wrong quantity**, and that has to be settled
before any post-wire result is read against it.

### It refutes a claim made earlier in this campaign, and the refutation is the interesting part

The working assumption — mine — was that untransmittable nodes were *already effectively dead*, so
marooning merely described an existing state. **Falsified for 27 of the 28.** Zero of them never had
a teachable copy; only one, `pm-the-empty-room` (tier 5), has gone 300+ ticks without one, at 1,790
ticks. The frontier **oscillates between 4 and 45 nodes** while `nodesHeld` sits flat at 51.

**Untransmittability is churn, not a ratchet** — research re-derives nodes back into teachability at
full ordinary price. That is the whole mechanism, and it was invisible because the only instrument
watching was a node count that never moves.

Two consequences worth stating plainly:

- **The durable cost concentrates at depth.** Tier 5 averages 1,019 ticks since a teachable copy;
  tiers 1–4 average 62–121. **Marooning bites hardest exactly where §6's deep specialists live** —
  which is where the design wants long-lived species to be worth their slowness. That is either the
  mechanic working, or the mechanic eating the feature; it is not yet possible to say which, and
  saying which requires the wire.
- **1,250 instances were born unteachable**, because `transmittedMastery` is lossy: a teacher at
  exactly the 512 threshold transmits `mul(512, 512) = 256`. Late in a wave, a lesson manufactures a
  dead copy.

And it retires an old suspicion: W13's *976 lessons for 0.0 nodes* was never a teaching defect —
teaching adds no nodes by construction. What marooning destroys is teaching's **preservation** value.

### Two defects reported and deliberately not fixed

- `gateway.ts:441` quotes research at the **≥3× rediscovery price for every node the universe
  holds**, because `wasEverKnown` is set on `createInstance`, while `research()` charges the ordinary
  price for exactly those nodes. The two disagree, and the inflated quote is a drag on **the only
  path that does any preservation at all**.
- Every stolen instance is born permanently marooned — theft writes at `mastery: 0` — and the comment
  justifying theft's balance depends on a study operation that does not exist.

### Method worth keeping

Inertness was **proved by snapshot hash**, not asserted: censused-every-tick and clean arms both end
on `cb1c0efafbd7f66a` at 2400 ticks, with a vacuity guard so the test cannot pass by measuring
nothing. `ticksToUnteachable` came out one higher than the derived table because `teach()` refuses on
`mastery < threshold`, so 512 still teaches — caught because the measured maxima were checked against
a hand-derived table rather than against themselves. Full `verify` green: 279 files, 3,925 tests, all
three balance gates passing with **thirty metrics at delta 0.00000**, no golden and no baseline
regenerated.

---

## W32: the corroboration was double-counted, and the balance target was folklore

Four corrections, each of which invalidates something this document or the campaign asserted.

### 1. "Five independent confirmations" is at most four — and this is arithmetic

**A perfect prefix structure *entails* containment 1.000.** Prefix fidelity and containment are not two
measurements agreeing; the second is implied by the first. This document, and I in several messages,
have repeatedly claimed *five independent ways* of establishing content exhaustion. Two of the five
were one. **Say four, and say which four.**

This is the failure mode the campaign was built to avoid, committed by the campaign: corroboration
counted by how many numbers were printed rather than by how many independent things were measured.

### 2. The rock-paper-scissors target cannot be sourced, and the defensible target is different

Neither StarCraft's matchup non-transitivity nor Magic's aggro/control/combo triangle could be
verified by **any** measurement. Both are confident folklore, and the StarCraft data that does exist
argues **confounding**, not cycling. The only verified non-transitivity measurement in a commercial
game is chess.

**The replacement target is exact and checkable.** Our strategy poset has **width 1** (Dilworth
1950) — one chain, everything comparable. The goal is **width > 1**: strategies that are genuinely
*incomparable*, not a cycle. That is what D3 was reaching for and could not name.

### 3. Every exploit margin this campaign published was measured against a bot that flatters it

**A fixed bot pool lies.** Goodman et al. (2024) measured depth collapsing from 0.125 to **0.000**
once the agent was tuned. Every exploit-margin number here was measured against
`uniform-random-legal`, **which has seven of fifteen verbs inert**. A probe that cannot use half the
action space is not a lower bound on exploitability; it is a lower bound on *that probe*.

**This bears directly on D2**, which is defined as out-winning `uniform-random-legal` by ≥ 0.05. D2 is
not merely unmet — as specified, it is **not a test of what it claims to test**. It needs an adaptive
opponent, or an explicit statement that it measures a floor.

### 4. Our statistics already had names, and the names come with caveats we skipped

- **Prefix fidelity 0.943 is a Guttman coefficient of reproducibility** (1944), and clears the
  customary 0.90. It is also known to be **inflated by extreme marginals** — and we have exactly that
  pathology, since three strategies hold the entire reachable set. Report the **coefficient of
  scalability** against **minimal marginal reproducibility**, not the raw number.
- **Containment 1.000 is nestedness** (Atmar & Patterson 1993; NODF), whose literature has required a
  **null model** for thirty years, because nested matrices arise by chance from marginals alone. We
  reported it without one.
- **Participation ratio is not from this field at all** — it is condensed-matter physics, with no
  found use in game evaluation. Label it a house metric and report matrix **rank** beside it.
- **Do not gate on a depth number.** The field's most rigorous recent entrant reports weak, mostly
  insignificant correlation with human judgement, and Lantz et al. 2017 is a **position paper** that
  says so of itself. Anyone citing it as empirical is citing it wrong.

### A discrepancy to resolve, not to paper over

W32 reports *"the whole grid costs **96 favor** against a floor income of 1/tick over 2,400 ticks."*
This document records **40,960 favor** for the seven switches that open the twelve v1 cells, from
`god-cost.json`. Those cannot both be the price of the same thing. Most likely they are different
quantities — a per-tick or ruleset-edit cost versus the one-time switch cost — but **nobody has
checked**, and the permit-opportunity-cost work depends on knowing which number is the real
constraint. Resolve before tuning anything.

### Also delivered

A checkable design language: eleven closed verbs (`nests`, `incomparable`, `width`, `reproducible`,
`dominates`, `degenerate`, `chain`, `solved-open-loop`, `inert`, `commits`, `composes`), each a JSON
record carrying a falsifiable hypothesis and a **`refutedBy`** procedure, validated by the repo's own
schema compiler so it adds no dependency. `solved-open-loop` is the term we lacked for
`permit-then-idle`.

It earned its keep before shipping: writing the claim that funding and encouragement are *"worth less
than nothing"* exposed that the comparison behind it is **40/40 against 38/40 at n=40** — a two-run
difference with overlapping Wilson intervals and no restricted arm ever run. Verdict `unmeasured`,
not `holds`. The notation caught an overclaim without anyone running anything.

### And a note on how briefs go wrong

Three research leads died on contact with sources, and **one of them was a fabricated citation that
originated in the brief I wrote** — a "Deep Hanabi" experiment that does not exist. An agent
inheriting a confident false premise will spend real time on it. Briefs get citations checked before
they are sent, or they manufacture work.

### Decided: `state` reuses `content`'s material type, not the reverse

`schema-duplication.test.ts` flags that `content`'s `MaterialKindAmounts<T>` and `state`'s
`MaterialStockRecord` are the same three fields. The peer session that hit it refused to resolve it
and flagged it, which was right — it is a §5 boundary call, not a style choice. Settled by the table
in `packages/sim-core/test/unit/module-boundaries.test.ts`:

    content: { value: [], typeOnly: ['sim-core'] }
    state:   { value: ['sim-core'], typeOnly: ['content'] }

`content` is the root of the tree — its `value` list is **empty**, and there is no `@mm/state` import
anywhere in `packages/content/src`. `state` **already** has a type-only edge to `content`. So `state`
deriving `MaterialStockRecord` from `content`'s `MaterialKindAmounts<T>` needs no new edge and no
boundary-table change; the reverse would give the root package a downstream dependency and require a
written §5 deviation.

One caveat to check rather than assume: `state`'s component records declare i32 column layouts. If
the column declaration cannot be expressed in terms of the shared type, derive the *type* and keep
the declaration separate. **Do not weaken `schema-duplication.test.ts`** — it caught real production
drift across a package boundary, which is exactly its job.

### Resolved, and the error was mine: permits cost 96 favor, not 98,304

The discrepancy flagged above is settled by reading the schema. `packages/content/schema/god-cost.schema.json:17`
types `favorCost` as `$ref: "#/$defs/fp"`, and `packages/content/src/types.ts:205` declares it
`readonly favorCost: Fp` — **fixed-point at 1/1024**, like everything else in the rules path.

So the raw integers in `god-cost.json` are not favor:

| switch | raw (Fp) | **actual favor** |
|---|---|---|
| `permit-technique` | 8192 | **8** |
| `permit-form` | 4096 | **4** |

- The **v1 subset** — 3 techniques + 4 forms opening all twelve enabled cells — costs **40 favor**.
- The **whole grid** — 5 techniques + 14 forms — costs **96 favor**.

**W32's 96 is exactly right. Every figure this document has published for permit cost was the raw
fixed-point integer read as though it were favor, and was therefore 1024× too large.** Strike
98,304/1.51% and 40,960/0.63% wherever they appear above; they are the same mistake twice.

This does not weaken the argument — **it makes it far stronger than was claimed.** Against W32's
floor income of 1 favor/tick over 2,400 ticks, opening the entire ruleset costs **1.7% of the
minimum income a universe can possibly earn**, and against the measured income it rounds to zero. The
god's central verb is, in practice, free.

It also explains a measurement that never fit: permitting could not be rationed by making favor
scarce, because favor scarcity would have to be extreme by a factor of hundreds before 40 favor
became a decision. Qwen's *"a more expensive door to the same empty room"* was right about the
mechanism and generous about the magnitude.

**Lesson for the campaign's own method:** a number taken from a data file and quoted in a design
argument must be read through its declared type. Four separate documents and several agent briefs
carried this figure. Nobody checked the schema because the integer looked like a plausible favor
price — which is exactly why 1/1024 fixed point is easy to misread and why the type exists.

---

## Author's direction: add drains, do not cut

> *"Try not to cut stuff, instead add drains — there are no drains at all in this whole thing, and
> the economy should be a bit of a drain of stuff."*

This supersedes the permit-repricing approach. **Making the god's one meaningful verb expensive
nerfs the interesting thing to compensate for the boring thing.** The switch prices stay roughly
where they are; the deliverable is the sinks the economy has never had.

It converges exactly with W31's research, arrived at independently from the other direction:

- **A cap is not a drain.** 9.1–12.4M favor is discarded per run. In Machinations' vocabulary a Drain
  is *"elements that consume resources… permanently removed from a game's economy"* — an outflow
  something can be traded against. Silent truncation at a ceiling is not that: it breaks conservation
  **and destroys the signal** that would feed back to whatever is overproducing.
- **Cook's power matching:** a growing source needs a growing or competitive sink. Worship scales
  with populace; the spend menu does not. No repricing of one purchase can fix a structural
  mismatch — which is the formal reason the repricing plan would have eaten itself.
- **Dormans names both kinds of friction**, and the applicability note for the second is verbatim
  *"use dynamic friction to balance games where resources are produced too fast."* That is this game,
  named, with a prescription.

**Stewardship survives the change of direction where the one-time price does not:** a recurring favor
drain scaling with how many doctrine families stay legal keeps a broad ruleset *possible* and makes
it *expensive to govern*. Breadth becomes a running commitment rather than a toll at the door.

Two constraints on any drain built: unmet upkeep **lapses into decay, never banks as debt** (W26
measured what the debt version does — a library at zero for 1,400 ticks), and anything draining the
knowledge loop needs a **weak static engine** beside it, since a converter engine deadlocks and that
is the documented remedy.

---

## W20 delivered the thing the campaign exists for: the species now diverge

`w20/compositional-content`, 33 commits, measured in four arms.

| claim | before | after |
|---|--:|--:|
| dimensionality (80%) | 2 | **3** (v1), 5 wide — **met** |
| `ascensionRate` | 0.79 | **0.1250**, inside §7's 0.05–0.20 — **D1 met** |
| gnome vs human | identical 49 nodes | **Jaccard 0.57, 1.7× reach, gnome ascends and human does not — met** |
| no strategy holds the whole set | 5 of 8 did | **met in v1** |
| rituals requiring several casters | — | **met**, with a greedy-mage impossibility proof |
| prefix fidelity | 0.9088 | 0.8523 against a target of 0.5 — **missed in every arm** |
| D6 | failing | **passes** |
| D3 | failing | still failing |

**"Gnome ascends and human does not" is the first measured distinct playstyle in this project.** D7 —
varying the founding species mix changes which strategy wins — was unreachable for the whole campaign
and is now within reach.

The effect schema traces construct-by-construct to `sound-design.md` §4.1's five envelopes:
**Intellego → `reveal`** contributes *no magnitude* and switches on latent effects; **Perdo →
`remove`** contributes a negative and suppresses a presence primitive; **Rego → `control`**
contributes a `{floor, ceiling}` clamp rather than a bonus. Mentem never targets `universe` (§4.2,
*"the only form with no reverb at all"*), enforced across all 70 cells — and that rule caught a
pre-existing defect outside v1.

**Enablement beat shaping, and the margin is the finding.** Arm B — old ladder content, only the grid
permitted — moved dimensionality 2 → 23 by itself, against arm D's shaped content. But arm B scores
0.512 between-strategy variance to arm D's **0.759**. *Enablement produced variety; shaping produced
structure.* Both are needed and they are not substitutes.

### It agrees with the root cause, from a completely different direction

> **"Only eleven effects are live.** `knowledgeEffectHooks` filters to `target: "universe"`; there is
> **no per-mage effect channel**, so the life-extension ladder is authored, validated and
> disconnected. Scribe accrual is hardcoded `NO_BONUSES`; `build-rate`'s consumer has no caller; raid
> theft bypasses both exclusion seams. **The cheapest next move is not more content — it's connecting
> what exists.**"

That is the third independent arrival at the same conclusion, after W30 and W29. It also means the
per-mage exclusivity and the logarithmic life-extension ladder the author asked for are **built and
unreachable** — they need a per-mage effect channel that does not exist.

### And it sharpens why `permit-then-idle` wins

Still 12/12 — but it now **ties** `permissive-breadth` where it previously beat it 40/40 to 38/40. The
sharper reading is W20's: it permits the grid in its first 140 ticks and buys **299.6 nodes against
passive's 60.2**. Everything W20 built is a decision *inside the knowledge graph that no god verb
reaches*. §4's edict budget is the mechanism the vision already has for that.

### Six escalations, unresolved and recorded

1. **Tracks vs §4a's four-hook cap** — tradition-owned content would be a fifth hook. Shipped at
   graph level instead.
2. **Rituals need a vision amendment** — not traceable to any existing section.
3. **Enablement default deferred** — `fullGridAtFounding` ships as an instrument defaulting to 0.
   This is the "does wide mean enabled or permitted" question, now with an evidence package.
4. **Perdo-on-`concealment` is inverted** — ~10 nodes lower their own caster's concealment while
   every gloss says they hide her. Left unfixed deliberately: it answers *"does Perdo destroy the
   shadow or the observation"* across all fourteen forms.
5. **Perdo has four free roots** where Rego is fully gated behind Intellego. An accident, not a
   decision — settle before Muto and Creo.
6. **Intellego cannot be half of an exclusive pair**: stripping it leaves **12 of 108** nodes, none
   past tier 3. **Perdo ↔ Rego** remains the recommendation, which is where the corrected lattice
   reading already pointed.

### The phantom test failures had a measured cause, and it was us

Every workstream tonight reported the same signature: `npm run verify` failing with
`Error: [vitest-worker]: Timeout calling "onTaskUpdate"` and **zero named failing tests**. It was
labelled "contention" and worked around. Measured:

    cores: 16          load average: 287
    node processes: 52     of which 8 were Monte Carlo sweeps
    one workstream alone held 6

**18× oversubscription.** That is not contention, it is starvation, and the vitest timeouts were
real test failures caused by it rather than a reporting artifact. Several agents lost time to it,
`ci-check.sh` mirrors `verify`, so it can fail a good commit on the runner — and at least one agent
correctly refused to write "verify exit 0" because it had never witnessed one.

Mitigated without losing work by renicing every sweep to `NI 15` rather than killing them: the two
largest dropped from 341% and 266% CPU to 207% and 173% immediately, so tests now win the scheduler
while the sweeps continue.

**The structural cause is that `balance:gate` runs `--workers 4`, and nothing coordinates across
workstreams.** Six agents each running a gate is 24 workers on 16 cores before any test process
starts. Either the harness binaries should nice themselves outside CI, or the campaign needs a stated
cap on concurrent sweeps. Recorded rather than fixed, because the fix belongs in `mc-harness` and
touching it while six sweeps are mid-flight would invalidate them.

---

## W19 is the negative control for W20's headline, and neither workstream knew it

W19 swept the **old** content at five horizons, asking whether shortening the run made the species
reach different magic before exhaustion flattened them:

| horizon | gnome union | human union | nodes unique to either | paired containment |
|--:|--:|--:|--:|--:|
| 300 | 49 | 49 | **0** | 0.970 / 0.992 |
| 450 | 49 | 49 | **0** | 0.990 / 0.996 |
| 600 | 49 | 49 | **0** | 0.999 / 0.999 |
| 900–2400 | 49 | 49 | **0** | 1.000 |

At horizon 300 humans hold a mean of **37.7** nodes against gnomes' **45.2** — a 20% gap in count —
and the union over seeds is the **same 49 nodes, with zero unique to either side**. Shortening the
horizon does not make species reach different magic; it catches humans earlier on the same queue.
That is W15's *"speed, not shape"* confirmed at every horizon where content is still unexhausted.

**Put beside W20's result on the new content — Jaccard 0.57, 1.7× reach, gnome ascending where human
does not — this is a before-and-after with the before measured five ways.** The divergence is
attributable to the content graph, not to the horizon, not to the measurement, and not to
exhaustion. W19 was commissioned to test a hypothesis that had already been refuted; it turned out to
be the control the campaign's best result needed.

**The caveat, stated because the pairing is only as good as its comparability:** these are separate
sweeps with different arms, so this is a strong suggestive pairing rather than a controlled
experiment. The clean version is W20's arm structure re-run at W19's horizons. Worth doing —
it would convert the campaign's headline from *measured* to *attributed*.

W19 adds one more thing worth keeping: the **only** place the two species' node sets differ on old
content is under `permissive-breadth` — reached by editing the ruleset — and that comparison is
**confounded by design**, because removing a species changes founding order and therefore every
downstream draw. Any future species claim resting on `permissive-breadth` inherits that confound.

---

## The question nobody in this project has asked

An external review was given the measured findings cold and asked four questions. Its answer to the
last one is the sharpest thing anyone has said about this work:

> **"What player decision can make a losing universe win, through a causal chain the player can
> understand and verify?"**
>
> Not *"are the primitives authored?"*, *"are metrics in range?"*, or *"can species diverge?"* Those
> are implementation and simulation questions. The missing question is whether the god's constrained
> authority creates **counterfactual, legible leverage** over outcomes.
>
> If the answer is not demonstrably yes for at least one decision, the honest description is a
> promising autonomous-world simulator — not yet a strategy game about being the god of magic.

Every definition-of-done item in this document is one of the questions it says are the wrong ones.
D1–D8 measure whether the *simulation* behaves; none of them asks whether the *player* has leverage.
That is not an argument for deleting them — they are still necessary — but they are not sufficient,
and nothing here has been checking the difference.

### It also puts a caveat on the campaign's best result

On W20's species divergence:

> "It is probably a real **graph-level** result, but not evidence that the game's magic system works.
> The rewrite can change discovery, teaching and species trajectories through authored graph topology
> **even if spell effects are inert**. Gnome/human divergence and `ascensionRate` may be genuine
> outputs of the academic simulation — but they are **not yet attributable to the god legalizing
> magic**."

That is fair and it is testable. The distinguishing measurement it proposes: **fixed-seed paired runs
with every effect contribution forcibly neutralized versus normal**, comparing species Jaccard,
`ascensionRate` and win state. If the delta is ~0, W20's result is a knowledge-graph artifact wearing
a magic-system label. `packages/primitives/src/ablation.ts` already exports `neutralizing()` and
`ablationMaskFor()` — the mechanism exists and has never been pointed at this question.

### And it named the way tonight gets wasted, accurately

> "The likely waste: spending the night tuning numbers, adding drains, or polishing the content graph
> until aggregate metrics look 'in band'. That can produce prettier charts while leaving the core
> causal path disconnected. **Second-most-likely waste: fixing all 16 primitives instead of proving
> one.**"

Both were in flight when this arrived. Redirected: W29 now owes **one primitive proven end to end**
rather than six wired — permit the cell, see use rise, see a contribution logged, see world state
mutate, see a visible outcome change, and **forbid the cell and watch the change disappear**. Step
five is what makes it proof instead of a demo.

### The drains critique, kept because it is the acceptance criteria inverted

> "Drains can make the economy feel constrained **without creating decisions**. You may turn 'favor is
> meaningless' into 'favor is a tax bill,' while the optimal policy remains 'permit everything, idle,
> and pay upkeep.'"
>
> "A drain is only valuable if it produces a hard, legible tradeoff — *'keeping this family legal
> preserves human portal defense but starves gnome ritual research'* — not merely 'your number went
> down.'"

So a uniform upkeep is the version that fails. A drain earns its place when two sinks draw on the
same pool, each attached to a **different visible capability**, and the right answer **differs by
species or ruleset**. The failure signature to watch for: outcome metrics move while **policy
sensitivity does not** — same total favor, different allocation, identical result. That is a distinct
measurement from any level metric and nothing currently collects it.

### W19's final numbers answer Codex's attribution question — and the answer is "graph topology, and that is real"

W19 committed its decision rule before seeing the data, then measured the **old** content at every
horizon from 300 to 2400:

- **one** component carries 80% of the variance, at every horizon;
- **cross-strategy containment sits *above* the within-strategy diagonal** by +0.019 to +0.022 — two
  different strategies' node sets overlap each other *more* than two seeds of the same strategy do.
  That is the most compact statement of "the strategies are not different" this campaign has
  produced;
- prefix fidelity is flat: **0.9244 at horizon 300, 0.9318 at 2400**;
- and with magnitude removed, the shape-only participation ratio is **3.31 at horizon 300 against
  3.30 at 2400**. The apparent rise in the raw ratio (1.74 → 1.94) is *"breadth wearing composition's
  clothes"* — at a short horizon strategies differ in how far along **one queue** they have got, not
  in which magic they hold.

Even at horizon 300, where only 1% of runs hold the full set, the v1-bound strategies already hold
**48.5 of 51**. The unexhausted window is the gap between 95% of the set and all of it.

**Put together with W20 this resolves the attribution question, though not in the flattering
direction.** Effects were disconnected in *both* measurements. Old content: one dimension, flat at
every horizon. New content: three dimensions in v1, five wide, with species reaching different magic.
The difference therefore **is** graph topology, exactly as the external review suspected — and that
is a real result rather than a deflating one. Restructuring what depends on what is what made species
matter. What it is not is evidence that the magic *system* works, because no spell effect reached
anything in either arm.

So the honest statement of the campaign's best result: **the content graph now produces distinct
playstyles; the effect pipeline has still never run.** Those are two different claims and only the
first is measured.

W19 also reported an incident against itself: its validator hardcoded the first pass's sampling grid
and deleted 50 valid files from the second. The tool now takes the grid as a parameter and does not
delete unless asked. Recorded because a workstream that reports its own destroyed data is worth more
than one that quietly regenerates it.

---

## Vision audit: three implications that gut things designed the same night

A systematic scan is running separately. These three came from reading §13's own text, and each was
verified in the code before being claimed. All three are **implications**, not omissions: the vision
records the fact, and nobody followed it through to what it means.

### 1. Every library holds the same two nodes, so the raid has nothing to steal

§13 records it against itself, inside a question it declares **resolved**:

> *"Emergent specialization needs libraries that differ, and in the reference run they do not: one
> university, and its shelf holds **two distinct nodes against 1,263 books**, because the scribable
> list is ordered by cost and every scribe copies the cheapest thing available."*

Verified — `packages/rules-world/src/autonomy/feasibility.ts:112`:

    const target = cheapest(outlook.scribableTargets);

One line, and it is the whole mechanism.

**What nobody drew out.** Tonight's raid design makes libraries the objective: a university's library
building contains exactly the grimoire rows whose location is that library, and the raider physically
carries out the books. **If every library holds the same two nodes, there is nothing in any library
that the raider does not already have.** The most evocative mechanic in the design is stealing a
sorted list of the cheapest thing everyone already knows.

It also means §13's *"resolved: specialization is emergent"* is resolved in principle and
**unfalsifiable in practice** — §13 says as much, in a sentence added so nobody would read *resolved*
as *demonstrated*, and then the raid design was written against the resolved version anyway.

The fix is small and it is not a balance number: scribe selection needs a reason to copy something
other than the cheapest — rarity, the last copy, what the library lacks, what a mage was asked for.
Any of those makes libraries differ, and libraries differing is the precondition for four separate
mechanics.

### 2. Nothing ever founds a second university, so the roster has nothing to allocate

§13 again, on what bounds a mature universe:

> *"No second university is ever founded because founding one is a god action and the reference run
> receives zero player input. So a 'mature universe' at this build is a universe whose mage roster is
> capped by an institution the player never built."*

88 living mages against a populace of 18,713, held at exactly the founding academy's **64 student
seats** from world year thirty onward. And `advanceConstruction` — the function that would advance a
new university's build — has **zero production callers**; it is defined, exported, mentioned in one
comment, and invoked nowhere outside its own tests.

**What nobody drew out**, and it lands on two things built this week:

- Tonight's **stationed set** — teaching, researching and defending are one roster — is stated as the
  tightest coupling in the design. With **one** university there is no siting decision, no
  concentration risk, and no question of which campus to defend. The tension is real and currently
  has nowhere to happen.
- **W24 measured a genuine tradeoff between a river-delta and a highland-waste academy** — 818
  population and library depth 22 against 1,002 and 19, histories separating at tick 157. W24 flagged
  that siting is a *scenario* decision rather than a *play* decision. This is worse than that: a
  player cannot exercise it **even in principle**, because exercising it requires founding a second
  university and nothing in the tree completes one.

### 3. Pillar 1 promises symmetry the implementation does not keep

The first design pillar:

> *"Rules-setting is the core verb. The most interesting decision in the game is which magic exists in
> your universe — because that choice is **symmetric** and permanent-feeling."*

`packages/content/src/god.ts:191–206` enforces the symmetry it can see: content fails to load if
permitting and forbidding cost different favor, citing this pillar. But W30 found the *total* price
asymmetric by construction — `interventions.ts:390–393` exempts permitting from the worship shock
outright, and `decay.ts:74–77` charges only forbidding with irreversible mastery loss, in a comment
calling itself *"the whole mechanism by which forbidding a cell actually costs a civilization
something."*

**So the favor price is symmetric by enforced invariant and everything else is asymmetric against
denial.** The pillar is not merely unmet; there is a loader invariant standing guard over the one
axis where it holds, which is the most convincing possible way to not notice the others.

That matters more after tonight than before it: the raid design leans hard on denial being a peer
strategy — forbid Perdo to save the library, forbid Fatum and swear off your own escape — and every
one of those plays is charged twice under the current implementation.

---

## W41's vision audit: the four that change what we do next

Full report from W41; `docs/design/vision-audit.md` (831 lines, branch `w12/vision-audit`, unmerged
and **cited by nothing**) already did deliverable 1 a day earlier. That is the fourth time this
project has paid for the same finding. **Merge it.**

### 1. §6's species differentiator is authored and read by nothing

`species.json` carries per-form affinities for five of six species — draconic `ignem: 1792`,
`vim: 1536`, `nomen: 1280`; dwarf `terram: 1536`; elf `herbam: 1536`. The only reader in the tree is
`packages/content/src/load.ts:938`, **the key validator** — it checks the keys are spellable and never
touches the values.

**D7 — *varying the founding species mix changes which strategy wins* — has failed for five sweeps
while §6's own differentiation mechanism sat authored and unread.** Two external reviewers
independently prescribed exactly this mechanism, and the campaign's own enumeration of species traits
omits `affinities` entirely. This is the cheapest large win available: the content exists, the spec
wants it, nothing has to be designed.

### 2. Both documents written last night are tradition-blind, and §4a says the tradition *is* the universe

`grep -i tradition` over `raid-engagement.md` and `ages-of-magic.md` returns **nothing**. Both are
written as though every universe were the reference one. Under **Art of Memory** — a shipped v1
tradition — three things break:

- **The progression spine is foreclosed.** `ages-of-magic.md` §3 says the third age is reachable
  *"only across generations… only through records"*. Art of Memory has no records:
  `scribing.ts:76` sets `keepsWrittenCopies: false`. Measured: **zero grimoires across 96 runs, library
  depth 0.0, 17.2 nodes known against Vancian's 65.8.** The tradition chosen at run start silently
  decides whether the mid and late game exist — and forecloses them for exactly the short-lived
  species that most need them.
- **The raid's objective is an empty room.** Palace-held knowledge is unburnable and unlootable by
  construction (`consequences.ts:176-180`). The floor plan draws a library with nothing in it. This
  stacks on the two-distinct-nodes finding: there, libraries hold two things; here, none.
- **Exposure's strength is set by the *defender's* tradition and the design assumes it constant.** A
  witness runs their **own** home hooks (§4a). Against True Naming, witnessed knowledge is born at
  `instanceMastery: 1024` — full, teachable, permanent. Against Art of Memory it lands in a palace and
  dies with the witness. The self-limiting bound on repeat raiding varies from near-total to
  near-zero along an axis the document never names.

### 3. Compounds collide with §3, and the collision inverts the progression curve

`arbitration.ts:421` is structurally single-cell — `permits(hostRuleset, grid.cellOf(nodeId))`, and
`cellOf` returns one cell. If a compound is legal only when the host permits **every** cell in its
set, then:

**The deeper your magic, the less of it you can carry through a portal.** Third-age magic becomes a
home-defence technology, which is the exact inverse of the curve `ages-of-magic.md` builds.

And two things follow that nobody priced:

- **One interdiction denies a family.** §4 justifies the small edict budget on interface and
  action-space grounds — never on power, because at the time one edict could only ever be worth one
  cell. Under compounds it is worth every compound containing that cell.
- **The budget grows with the leader**: `edictBudget = 1 + worshipTier`, capped at 8. The player with
  the most worship holds the most single-cell vetoes precisely when rivals' magic spans the most
  cells. Composed with the mid-raid lock, one irreversible interdiction can delete a raider's whole
  third-age repertoire in a single action.

`ages-of-magic.md` §5 lists four things to settle. **None of them is §3.** It should be question zero.

### 4. Three tasks are checked `[x]` and the wiring is absent

Worse than an unwritten plan, because it is the state nobody re-checks. All three in
`mages-and-species/tasks.md`, in front of 0.4.0:

- **7.5** *"Route the library contribution into the shared (1 + Σ) accumulator"* —
  `capitalRateMultiplier` has no non-test caller; `gateway.ts:578` passes `NEUTRAL_RATE` and says so.
  The spec it claims to satisfy is a **shipped requirement**, so §6a's second compounding loop is an
  agreed acceptance criterion that was never met and nothing tested.
- **8.1** *"capped resource-yield stacking"* — stacking is real; `world-step.ts:637` hardcodes
  `resourceYieldBonuses: []`. This is the path of §4's own worked example about *Rego Terram*.
- **8.2** four materials claimants — `libraryUpkeep: 0`, `construction: 0`, and both
  `applyLibraryUpkeep` and `advanceConstruction` have no non-test callers.

### And one that is uncomfortable rather than actionable

§11: *"Shipping the client first would make human playtesters the primary balance signal by default,
**which is the exact outcome the balance-first methodology exists to avoid**."*

`raid-engagement.md` Part II opens *"Author's direction, after playing the prototype"* and then rules
raid locations, floor plans, portal placement, rewind and target suggestion. The prototype animates a
**synthetic trace generated in the page**, and the same document names the hazard: *"a raid view that
animates plausible-looking magic unconnected to what the engine decided is worse than no raid view,
because it will be believed."*

In fairness the prototypes are honestly labelled and §11's rationale is about *balance* signal rather
than feel. But the machine signal it defers to is currently measuring a disconnected pipeline, so
there was no rival signal in the room. Recorded because it is exactly the failure mode §11 predicted,
arriving by a route §11 did not.

---

## The regime failure is a V8 TurboFan miscompilation, not our code

W28's four magic regimes measured well and `npm run test` failed with
`No implementation for "acquire" kind "true-name"` — for a kind that is implemented. I hypothesised
cross-contaminated content interning under a shared vitest worker. **That was wrong, and the
refutation is the model to copy:** a contaminated intern table would throw `hooksOf`'s *"No loaded
tradition has id N"*, not `unimplementedKind`. The throw site is a two-case `switch` on a plain
string with no table lookup anywhere on the path. A hypothesis that predicts the wrong error is
refuted whatever else is true.

### The evidence

A **cold-path** probe in the `default:` arm — cold precisely so it cannot perturb timing the way
per-call logging did, which is what made the bug vanish for the previous agent:

    seen "true-name", typeof "string", length 9,
    codePoints [116,114,117,101,45,110,97,109,101], ctor "String",
    seenIsTrueName TRUE, rereadSameAsSeen TRUE,
    coldSwitchOnSeen "true-name", coldSwitchOnReread "true-name"

**The operand compares `===` equal to a case literal, and an identical switch in a cold function
dispatches it correctly, while the hot switch takes `default`.** Source hex-dumped (plain ASCII,
hyphen `0x2d`); esbuild's transform dumped (a plain string switch). Both eliminated.

| configuration | result |
|---|---|
| Node 22, CI ubuntu x64 (our `.nvmrc` pin) | **FAIL**, 6 of 6 runs |
| **Node 24, the "Next Node major" job, same commit** | **PASS** — 275 files, 3,904 tests, *and* all three balance gates and the goldens |
| base branch, Node 22 | PASS |
| Node 22 local, `--no-turbofan` | PASS |
| Node 22 local, `--no-maglev` | FAIL |

TurboFan is necessary and sufficient; Maglev is not involved.

### Why W28 triggers a bug it did not cause

W28 changes **no code on that path**. It changes the *workload*: seven traditions instead of three
widens the action space, and `researchCost` re-enters `applyAcquire` per candidate node per mage per
tick — **~33 million calls per run**. That volume tiers the site up into TurboFan. The hot path is a
real separate defect, already flagged; it is what makes the engine bug *reachable*, not its cause.

### The fix, and its blocking dependency

**Move the Node pin to 24** — `.nvmrc`, `package.json` `engines`, and bump the non-blocking job to 26.
The evidence is direct rather than inferred: that job is already green end-to-end on the failing
commit.

**Node 24 must be installed on `cto-tycoon-hel1` first.** `scripts/ci-check.sh:30-33` compares the
runner's Node major against `.nvmrc` and `FATAL`s on a mismatch — deliberately, with the comment *"fix
the runner image rather than relaxing this check"*. Flip the pin before the runner has 24 and
`ci/hetzner-lint` goes red on **every branch**.

### Why no source workaround was applied, which was the right call

No rewrite of that switch is *provably* correct; `store.ts`, `cast.ts` and `cost.ts` carry the
identical pattern, so a local fix relocates the exposure rather than removing it; and validating one
empirically is epistemically adjacent to retrying until green — the exact thing this campaign's rules
forbid. A standalone upstream reproducer was attempted and failed, because the isolating loop was
optimised away.

**Methodological note worth keeping:** every passing configuration in the tier matrix also runs 3–4×
slower, which is the same perturbation class as the instrumentation that hid the bug. That is why the
**Node 24 CI run** is the load-bearing evidence — it is full-speed and fully optimised, and it passes.

---

## THE WIRE IS CONNECTED, AND IT IS CAUSALLY PROVEN

W29 landed `packages/coordination/src/universe-effects.ts` with `npm run verify` green — 278 files,
3,934 tests, all three balance gates, no golden touched.

### The proof, which is the deliverable and not the wire

The external review's demand was five links under fixed seeds, with **step five the one that makes it
proof rather than a demo**. `packages/scenario/test/unit/causal-chain-build-rate.test.ts`, 8 tests:

| | Terram permitted | Terram forbidden | **`build-rate` ablated** |
|---|--:|--:|--:|
| months to open a university | **40** | 98 | 98 |
| stone spent | 1,912 | 3,104 | 3,104 |
| contributions reaching construction | 38 | 0 | **38** |
| Terram instances held | 178 | 0 | **178** |

**The ablated arm is the whole argument.** Same ruleset, same 178 instances held, all 38
contributions still gathered — and the buildings go up at the unaided rate anyway. Forbidding a cell
removes three things at once; ablating the primitive removes exactly one. That isolates *the effect*
from *the permission*, which no measurement in this campaign had done before.

### What it moved

Two universes identical but for permitted forms, 200 ticks, seed 589825: **5 of 5 economic series
differ.** The granary universe makes 468,099 food to the quarry's 321,443, and 274,403 vellum to
75,733; the quarry raises a university in **30 months against the granary's 42**.

Against the same universe with the wire pulled out: `resource-yield` **+214% to +294%**, and
`build-rate` cuts time-to-build **57%** and stone-per-building **32%**.

### It took the review note, and the consequence is the design working

An earlier draft gated on **presence** — an instance exists. I flagged that it diverged from
`gatherEffects`'s mastery threshold and would make retention, decay and marooning inert *on the new
path*. It rewrote to call `gatherEffects` and inherit the shipped location, mastery and dormancy
gates, citing `magic-primitives`: *"a shelf full of `research-rate` grimoires that nobody has read is
exactly as magical as a shelf."*

> **The economy now depends on living casters. Kill the mages and the harvest falls though every book
> survives.**

That is §5's individuated, mortal knowledge reaching the economy for the first time.

### Against the pre-registration

The prediction, written before any of this: **D5/D7-class results should move; D2 and D6 should not,
until permit opportunity cost lands.** W29 did not run the eight-strategy sweep, so **D2 and D6 remain
untested** — the prediction is not yet confirmed or refuted and must not be reported as either. What
is confirmed is the mechanism the prediction depended on.

### Three defects found by building it

A **Zeno stall** — crew size floored to zero as the backlog shrank and every site froze at 1002/1024
forever. A **stale-handle crash** — construction held cohort handles across the populace phase, and
the entity store's generation check turned a silent misattribution into a loud refusal. And
**unpayable labour** — crews sized from backlog alone, now bounded by affordable stone.

### The baseline movement to look at

One regeneration with a rationale. At 5 and 20 years **no metric moved**. At 200 years
`referenceLivingMages` 105 → 461 and `referenceLibraryDepth` 9.9 → 31.1 (construction working), and
**`referencePeakPopulation` 50,080 → 29,489, −156 SE** — flagged by W29 itself as the number most
worth an author's eye. Two documented, untuned decisions cause it: `K` reads food alone, and laborers
on sites do not farm.

Also raised the ascension sweep's `perRunTimeoutMs` from 600s to 1800s: one archivist run now takes
**305s measured**, against a cap sized for a build whose universities never completed.

---

## Correction: affinities were already wired, and this document is what said otherwise

W41's audit reported that `species.json`'s affinities are read only by `load.ts:938`, the key
validator. **That is false on `main`.** W20 already shipped the mechanism: `affinities` is one of
`packages/rules-world/src/autonomy/target-appeal.ts`'s six target-selection terms, wired end to end
through `scenario/content-set.ts` → `coordination/outlook.ts` → `affinityTerm` → `chooseTarget`, with
its divisor and `fp(384)` bound authored in `autonomy-weight.json`.

**The artefact that misled the audit is this file.** Its enumeration of species traits omits
`affinities`, and two external reviewers independently prescribed a mechanism that had already
landed, because they were reading the enumeration rather than the code. That omission is corrected
here rather than silently repaired, because the failure mode — *a summary of the code being trusted
over the code* — is one this campaign has now committed at least three times.

The placement W20 chose is also better than the one I recommended. Affinity applies to **target
appeal**, whose divisor is orthogonal to tier — which is exactly the property that lets it **reorder**
`compareTargets`' queue rather than move a species faster along it. Research cost, which I suggested,
would have reached the same content through a second channel and double-applied it.

### The measurement nobody had taken

72 runs, same species and same seeds, affinities authored against every table emptied:

- **It moves sets, not counts.** Dwarf run 0/1 ends at **29 nodes with affinity on and 37 with it
  off** — Jaccard 0.610, with **4 nodes unique to the affine arm and 12 unique to the ablated one.**
  That is the *opposite* of the "speed, not shape" signature: the ablated arm is larger, and the
  affine arm holds nodes the larger one lacks.
- **It almost never survives to terminal**, for the reason this campaign already knows: any universe
  that lives exhausts all 51 v1 nodes, and reordering a fully-walked queue cannot change its union.
  Draconic, dwarf and elf all reach 51/51 on both sides. **Orc is the only exception, at Jaccard
  0.720 — and only because orc universes collapse before exhausting.**
- Negative control passes exactly: gnome and human are identical on both sides at every horizon in
  all twelve run pairs.

### The finding that reframes five sweeps

**7 of 11 authored affinity entries name forms no enabled cell uses** — `ignem` ×2, `vim` ×2,
`herbam`, `imaginem`, `corpus`. And:

> **Gnome and human are the two species with zero live entries.**

They are also exactly the pair W15, W19 and W20 are all measured on.

So W15's *"identical 49 nodes"*, W19's *"no divergence at any horizon"* and every species claim
resting on that pair were measured on **the one pair of species whose differentiating trait the v1
grid cannot read.** The result was true and the framing was not: it is evidence that gnome and human
do not differ *under v1's enabled rectangle*, not that species do not differ.

(The brief I wrote claimed *no* affinity form is enabled. That is wrong in the useful direction —
`mentem`, `nomen` and `terram` are all live. The problem is narrower and worse: it is live for the
species nobody measures.)

### Magnitudes, read for the first time

- The only authored value reaching the `fp(384)` bound is draconic's `ignem` **1792** — a **dark**
  form. Live entries use at most two-thirds of the available axis.
- Elf `mentem`, draconic `nomen` and orc `terram` are all **1280** — three species sharing an
  identical magnitude and differing only in which column it sits in.
- §6 promises *"technique/form affinities"* and `load.ts` accepts only form and cell keys, so
  `{"rego": 1536}` cannot be authored. **Whole technique rows are unexpressible**, and half the
  promise has never been buildable.

### Two harness bugs found in passing, both of which have bitten before

**Species intern alphabetically, not in `species.json` order** — so `foundingSpeciesMask` bit 0 is
**draconic**, not human. That cost one wrong arm before it was caught, and any earlier work that
assumed file order was measuring a different species than it reported.

**`contentRevision` sits inside the hashed header**, so snapshot-hash comparison is useless as an
inertness check across a content ablation — the hash moves because the content moved, whatever the
behaviour did.

---

## The root under the root cause: this game has no concept of a mage *doing* anything

W49 was sent to build mētis accrual from applied use, with one gating question to answer first:
**does an idle god's universe apply magic to its economy anyway?** If it does, the mechanic is
decoration. The answer came back in an hour and it is worse than a null:

> **"No mage in this game ever applies magic to anything."**

Three facts, each verified:

- **Application is passive.** `universeEconomyBonuses` reads `KNOWLEDGE_INSTANCE` every tick and
  derives its multipliers from what mages **know**. Not from what they do.
- **The autonomy goal registry has nine entries and none of them is an applied-use activity.** A mage
  can research, teach, scribe, and so on — she cannot *work*.
- **The economy's labour is populace cohorts, not mages.** The people who farm and quarry are not the
  people who know magic.
- Measured: the zero-god-input arm applies magic on **96.7% of ticks**, because *knowing is applying*.

**So there is no distinction between having knowledge and using it**, and every mechanic that depends
on that distinction is unbuildable as specified — mētis from use most obviously, but also
publish-or-perish's *"practice is an operation somebody has to perform"*, and `ages-of-magic.md`'s
whole account of a working mage whose fundamentals stay fresh through use.

### This is a better explanation of the negative control than any we have had

The campaign has spent forty sweeps asking why `permit-then-idle` wins. Here is the structural answer:

> **If magic is a passive property of what a universe knows, then acquiring knowledge is the only
> verb that exists, and the god's only lever on it is permitting more.** Which is exactly, and
> exclusively, what `permit-then-idle` does.

Every other god verb — fund, bless, encourage, grant, assign — tries to influence *how* a universe
practises. There is no practice to influence.

### And the economy wire rewards the idle bot more than anyone

The sharpest finding in the report, and it inverts the reason the wire was built:

> **The only god lever on the economic path is the permit gate, and it points the wrong way.** The
> twelve founding-permitted cells hold **8 of the 74 economic nodes** — all Terram. Opening the grid
> multiplies reachable economic content **ninefold**, and opening the grid is the one thing
> `permit-then-idle` does.

W29's wire was built to give the god's verbs marginal value. Measured against this, it gives the
*permit* verb ninefold value and the other nine verbs none — which is the negative control's thesis
with a larger number attached.

**This does not make the wire wrong.** Connecting authored effects to the world was necessary and its
causal proof stands. It means the wire alone cannot produce the result it was aimed at, and nobody
had measured which verb it actually pays.

### What follows

**Mētis-from-use is blocked on a prerequisite nobody had named: application must become an
activity.** A mage must be able to *work* — to spend her time applying a cell to a site — and that
work must be distinguishable from merely holding the node. Until then there is no "use" for use-based
mechanics to accrue from, and the cheapest wrong move would be to accrue mētis from *knowing*, which
would reward the idle bot a third time.

That is a significant piece of design, not a fix, and it is now the highest-value open question in
the project. It also reframes several things already ruled:

- **`encourageResearch` reordering the queue** (W52, in flight) becomes more important, not less —
  it is currently the *only* proposal that gives a god verb a non-permit lever.
- **The stationed set's three-way tension** (`ages-of-magic.md` §2b) assumes mages allocate their
  hours between teaching, researching and defending. Two of those three exist.
- **Territory and siting** produce different materials, and W24 measured real divergence — but no mage
  is standing in the delta making it happen.

W49 also found and fixed a defect in its own instrument: `defineWorldSimulation` takes one argument,
so its `onReport` callback was silently dropped and the agreement check was printing *"clean"* without
ever evaluating. It reported this rather than quietly repairing it, and confirmed the applied-use
figures were unchanged by the fix.

### The numbers, and a correction to the negative control itself

W49 ran the gate and did not build. Five strategies, matched seeds, applied use normalised per tick:

| strategy | mean ticks | use/tick | ticks applying | form mix |
|---|--:|--:|--:|---|
| `passive-control` | 2400 | 21.11 | 98.8% | Terram 100% |
| `permit-then-idle` | 1082 | **118.78** | 98.6% | seven forms |
| `permissive-breadth` | 1122 | **118.77** | 99.1% | seven forms |
| `denial-warden` | 1768 | **0.14** | 1.6% | Terram 100% |
| `archivist` | 2400 | 379.22 | 99.2% | Terram 100% |

**`permit-then-idle` / `permissive-breadth` = 1.0001.** Idle is the *ablation* of breadth — same
opening, every action after round 140 replaced by nothing — and **2,260 ticks of doing nothing cost it
0.01% of its applied use.** §11c predicted it would accumulate none.

Worse, **the hook is anti-correlated with playing**: `denial-warden`, the god using its verbs hardest,
accrues **877× less** than the god doing nothing. And `archivist` has the pool's largest volume with
**the same 100%-Terram mix as the do-nothing arm**, because it spends its verbs on scribing rather
than permitting. Volume and composition are set by two different things and **neither of them is
work.**

**Correction to a figure this document has used repeatedly.** `balance/results-integration-r2.txt`
records **`permit-then-idle` at 40/40**; the **38/40** quoted here and in several agent briefs is
`permissive-breadth`. The idle bot is not matching the active one — **it is beating it.**

### The recommendation, which is the thing to build next

> **Build `practice` as a tenth autonomy goal.** It competes for a mage's month, restores mastery —
> closing `ages-of-magic.md` §2c's publish-or-perish loop — and is what `resource-yield` should gate
> on, so the economy reads **work performed** rather than **knowledge held**.

The game named this operation itself and then never built it. `decay.ts:115`: *"Nothing in this
subsystem restores mastery; **practice does, and practice is an operation somebody has to perform.**"*
It is a `mages-and-species` change, not a `knowledge-model` one.

**The battle half may survive the gate that killed this one**, for a reason worth stating: a raid
**is** an act, with a roster of who was there and who came home. The attribution the economy lacks is
already present. Prefer a mastery term over its own node, survivors only, and run the same shaped
measurement before believing it.

### Four stale facts, flagged and not fixed

`CLAUDE.md` says `WORLD_SCHEMA_VERSION` is **3**; the code says **5**. *"`gatherEffects` has no
production caller"* is stale in **five places** now that #42 has landed it. And `content-set.ts`'s
consumption note is stale in the *other* direction, which may make the consumption report understate
what is actually wired.

---

## No mage ever chooses to teach

W47, instrumenting the empty teaching window on the merged economy tree, measured this and it is the
most consequential thing in its report:

> **`teach` is feasible on 2,628 evaluations in the window and selected on none.** Over two
> centuries, on either tree, **no mage ever chooses to teach — every lesson happens because a student
> went looking.**

Teaching in this game is entirely student-pull. The `teach` goal exists, is scored, is feasible, and
loses every time. That single fact runs underneath a large part of the design written this week:

- **`ages-of-magic.md` §2b's stationed set** — the tension between teaching, researching and
  defending — assumes a mage *chooses* to teach. She never does.
- **§2c's publish-or-perish loop** has teaching keeping a scholar's fundamentals fresh. If teaching is
  only ever student-initiated, a scholar cannot elect to maintain herself; she can only be found.
- **The college** (§2, §2a) is an arrangement for teaching to happen. Its faculty do not teach — they
  are taught *at*.

W47 handed it forward rather than fixing it, correctly: it belongs to `mage-autonomy` and touching
goal scoring inside a merge PR has baseline consequences. Alongside it, `affiliate` holds **76 of 90**
mages by world year 200 (69 of 83 on main) — the emergent monoculture the goal histogram was built to
expose, visible as a number for the first time.

### And the tripwire it was blocking was never a property of the build

`reference-long-run` 9.5 asserted a lesson in *every* 20-year window. W47 ruled out three
explanations by measurement rather than argument — not the economy (261 research projects complete in
the same empty window), not crowd-out (`teachableToMe` is empty on **all 21,471** mage-evaluations,
so `seek-teaching` is masked infeasible rather than out-scored), not the threshold (`fp(512)`
untouched, and the supply wave crosses it nine windows in ten).

**Teaching's supply oscillates, and the horizon ends inside a trough.** Across five run seeds, **three
of five have an empty window on `main` too — where the assertion is green.** It was measuring a wave
at one phase. Replaced with three claims that hold on every seed on both trees: teaching starts, it
is not confined to the founding-grant era, and it happens in more than half the windows.

The instrument reproduced main's own committed claim exactly — main's baseline note says the thinnest
window holds 16, and it measured 16 — which forecloses *"the probe is wrong."*

---

## The CI ceiling is now the binding constraint, and it needs the owner

`npm run verify` on the economy branch is **11m59s**, of which the ascension gate is **565.4s — 79%**.
The self-hosted runner's timeout is **600s**. Its history on that branch: timed out, failed mid-test,
timed out. Every other branch passes, so this is specific to what the tree costs.

**The sequencing point is the actionable part:** verify is over budget *because of what the branch
does* — a universe 2.6× the population, now fighting raids. **The moment #42 merges, `main` inherits
that cost and `ci/hetzner-lint` should begin timing out repo-wide.**

So the decision is not "retry". It is:

> **Raise the timeout in `/opt/ci-runner/webhook_receiver.py` before merging #42, or accept a red
> required check on `main`.**

That receiver is shared with `themultiverse.school` and the docs require owner sign-off, so it is not
an agent's call. W47 correctly refused the two tempting alternatives: it did not touch
`scripts/ci-check.sh` (which must stay equivalent to `verify`), and it did not trim the ascension
sweep, because 32 runs is already `balance/README.md`'s argued minimum and **shrinking a gate to fit
CI is tuning the instrument.**

### Freezing main

W47 merged main twice during one CI cycle and main moved twice more, most recently taking
`knowledgeKind` onto all 300 nodes. The gate treats `provenance.contentHash` as block-level
invalidation, so each round costs a **full baseline regeneration (~15 min) even when no metric
moves** — and that buys nothing while the runner ceiling stands, because merge freshness is not what
is failing.

**Main is therefore frozen to non-`packages/` changes until #42 lands.** Docs, `ui/` and tooling may
continue; anything touching the simulation waits. This is my call as delegated author and is the
cheapest way to stop paying a regeneration per cycle for a race nobody can win.

### Two false statements withdrawn from the superseded baseline notes

Found while writing their replacements, and both matter beyond this PR: the notes called all three
sweeps **100% `passive-control`** (the ascension sweep round-robins all eight strategies), and said
**nothing in `packages/scenario` opens a portal** — `raidEngagement` is `false` on main and `true` on
the branch, so **raids firing is part of this merge's delta** and was never isolated from the economy
wire.

---

## `practice` is built. Eighth null on the bot — and the first mechanic to move the thing it was *for*.

W53 built the operation `decay.ts` named about itself and nobody wrote: a tenth autonomy goal that
accrues mage-months against a tier-scaled requirement and restores mastery. **`decay.ts` is
untouched** — relaxing its monotonicity clamp is what reopens the re-permitted-fragment exploit it
documents — and a forbidden cell **refuses** practice, closing the same door from the other side.
Zero new RNG draws: `practice()` takes no `rng` and displaces no baseline's stream sequence.

Publish-or-perish enters as **candidate ordering, not a weight** — practice targets sort
*stalest-first*, deliberately bypassing `boundCandidates`, whose novel-before-cheap comparator is
exactly wrong for a node you are **keeping** rather than acquiring.

### The three answers

**Q1 — does applied use separate `permit-then-idle` from `permissive-breadth`? No.** All three
comparisons sit inside one standard error of zero (+0.20, −0.25, +0.99 SE). **Eighth mechanic aimed at
that bot; eighth null.**

W53 initially wrote up a 2.05× ratio as a real inverted separation **and retracted it**, because the
per-run values are `0, 0, 53, 117, 418, 1381, 2308, 3280` — a point ratio that does not survive its
own spread. That retraction is worth more than the finding would have been.

**The sharper result is why it failed:** gating `resource-yield` on being *committed to practice on
that node this tick* removes **99.2–99.6% of the economy's magical contribution**, leaving a quantity
too sparse to compare gods by. The mechanism is right and the gate is too sharp. W53's own named
follow-up is the fix: a **freshness window** (`lastPracticedTick`) rather than a tick-sharp test,
traded away to land the measurement.

**Q2 — the teachable fraction moves, weakly but on every arm.** Below-threshold share falls 0.8–2.5
points at 1.2–2.1 SE; this tree's like-for-like goes **87.8% → 85.3%**. At unit scale it is louder: a
standard universe's twenty-year mastery ceiling went **256 → 1019**, and it teaches **3 lessons where
it taught 0.** Publish-or-perish is closing.

**And the number I did not expect:** `referenceNodesGainedFinalQuarter` **+10.9%**. That is
`ages-of-magic.md` §2c's *"fresh fundamentals inform research at the frontier"* arriving as a
measurement, from a mechanic built for a different reason.

**Q3 — `denial-warden` is unchanged**, 207× → 230× behind the god doing nothing.

### Q3 is a flaw in my design, not in this build

W53 names it structurally and it is correct: **practice is refused in forbidden cells, so any
applied-use currency is anti-correlated with denial.** A denial strategy cannot accrue what it
refuses to permit.

That is a finding about `raid-engagement.md` §11c — the mētis-from-use section I wrote — not about
`practice`. §11c argued applied use would attack `permit-then-idle` structurally. It does something
worse: it **punishes the denial play**, which vision §2's first pillar insists must be a peer
strategy. An applied-use currency is a permissiveness tax wearing a different name.

Any use-based mechanic therefore needs an answer for what a denier accrues, and the honest candidates
are narrow: practice on the cells you *do* permit counting for more, or denial buying a different
currency entirely. **Unresolved, and it should block the battle half of §11c until it is.**

### Discipline worth copying

Three withdrawals rather than three widenings: the 2.05× retracted; `denial-warden`'s gated figure
(*"7 zeros and a 4"*) withdrawn as unquotable; and 9.8's books-to-depth bound **withdrawn, not
widened**, at 159 books / 17 nodes against 157 / 48. `balance:gate:ascension` was still running at the
end and is recorded as **a named gap rather than a promise.**

### The ascension gate finished, and it upgrades the negative result

`referenceLibraryDepth` **34.13 → 14.03, −58.9% at −3.02 SE** — the only metric clearing this gate's
tolerance. It is the same metric that regressed on both faster gates (−23%, −25%) and the same
collapse `reference-long-run` 9.8 sees at two centuries (**48 → 17 distinct nodes**).

**Three gates and a long run now agree: the library stops broadening under the practice gate.** That
is the most robust result this change produced, and it is negative. Practice targets sort
stalest-first, so a mage maintains what she holds instead of acquiring what she lacks — the library
deepens on fewer things. That is a real design tradeoff rather than a tuning error, and it should be
decided rather than smoothed: **publish-or-perish and library breadth are in tension, and this is the
first measurement of the exchange rate.**

Two readings the results table invites and W53 refused:

- **`referenceGrimoires` falls 38% and passes.** It passes because the ascension sweep's spread
  absorbs it — tolerances run to **±33 on a value of 60, and ±1456 on 3267**. *"Nine of ten pass"* is
  a fact about the tolerances, not about the build, and the doc says so in the same breath as the
  table.
- **`referenceNodesGainedFinalQuarter` +12.2%** moves the same direction as the horizon gate's
  +10.9%, but at 0.28 SE it carries no weight here. **Two same-signed observations, one significant:
  watched, not claimed.**

---

## The prototype was not disagreeing with the engine. It had a ×24 button on.

The author noticed the raid prototype produces vivid, differentiated combat where the simulation
produces direct-damage at 1.9% of hit points removed, and asked what the real system was getting
wrong. W56 settled it, and the answer is a detail nobody would have guessed:

> **`ui/raid/index.html`'s finding was measured at ×1 authored magnitudes. Its vivid combat is the
> ×24 damage button it labels "not content".** The two implementations do not disagree — one has an
> operator control, and the demo was running with it on.

**And 1.9% is authoring, not a zeroed lookup.** Proved positively rather than assumed: direct-damage
removes **454 raw per landing attempt across 1,462 attempts**, inside the authored 96–768 band. **A
missed lookup produces exactly zero**, so 454 is proof the lookup resolves. The arithmetic sits in one
node — `pm-the-empty-room` bolts fp(0.75) against a mage's fp(64) while its own field does fp(7.5),
and `summon-damage` is fp(2) *per tick*.

This matters beyond the one number. **"The prototype behaves better than the engine" was a real
observation with two real causes, and neither was the one it suggested.**

### The second cause is a live defect, and it is worse than the first

> **`firstCastableNode` gates candidacy on `direct-damage`** (`raid.ts:588`). A node carrying only
> `area-denial`, `blink`, `summon`, `ward` or `concealment` is **never cast**.

And since **no shipped node carries both `summon` and `direct-damage`**, `summon` **cannot reach a
battlefield at all.** Area-denial appears in the measurements only because 11 nodes happen to carry
both primitives; it rides along on damage's ticket.

The prototype's filter accepts `direct-damage`, `area-denial` **and** `blink`. The engine's does not.
**That is the second divergence the author was seeing**, and it is not a display difference — it is a
class of magic that cannot be cast.

Two consequences worth stating: any measurement of control primitives to date has been taken through
a filter that mostly excludes them, and `winRateByPrimitive`'s ablation cannot say anything about a
primitive that never fires.

### And `ward` is invisible to the instrument that ranks primitives

There is no `applied(ward, …)` in `primitiveApplication`, so `ward` **contributes zero to what
`winRateByPrimitive` reads while denying measurable action.** A primitive that works and reports
nothing is the fifth instance of this project's recurring failure — a metric structurally incapable
of seeing the thing it is named for.

### The metrics that replace damage-as-the-measure

`combatActionEconomy` **0.129** — combatant-ticks of enemy action denied over the combatant-ticks a
raid *contained*, so a longer raid does not rank as more decided by combat. Three channels: removal
(credited across sources by hp removed over a target's **whole life**, because killing-tick
attribution is timing noise wearing a definition's clothes), **save** (a `ward` scaling a lethal tick
survivable, or `concealment` making the finishing cast miss), and **decoy** (an attack spent on a
summon). Summon kills earn nothing, or damage farms denial on free bodies.

`combatThresholdEfficiency` **0.076** — removing over removing-plus-hurting attempts, with a field
counted as *one* attempt for its whole life via a cast id.

**The headline the old measure could not produce: a direct-damage cast removes a target 1.57% of the
time; the field on the same node, 18.3%.**

**Displacement is declared absent rather than zeroed** — `blink` moves only the caster and fields push
nobody — which is the distinction four earlier metrics failed to make.

### Verified, and larger than reported: five of seven combat primitives cannot be cast

`packages/rules-raid/src/raid.ts:588`, verbatim:

```ts
if (!node.effects.some((effect) => effect.primitive === COMBAT_PRIMITIVES.directDamage)) {
  continue;
}
```

Counted against shipped content:

| primitive | nodes carrying it | **castable** (also carry `direct-damage`) |
|---|--:|--:|
| `direct-damage` | 37 | 37 |
| `area-denial` | 38 | **11** |
| `ward` | 39 | **0** |
| `concealment` | 48 | **0** |
| `summon` | 10 | **0** |
| `blink` | 9 | **0** |
| `knowledge-steal` | 6 | **0** |

`arbitration.ts` dispatches seven primitives. **Two can arrive.** Around 112 nodes carrying control
magic are unreachable, and 27 of 38 area-denial nodes with them.

**`knowledge-steal` is the one that matters most.** Six nodes, none castable. The entire design in
which a raid is an attack on a rival's *knowledge* — looting minds, `Intellego Mentem` and
`Rego Nomen` as the theft cells §5 gates theft behind — **cannot happen.** Not rarely: never.

### It explains a finding nobody could explain

W37 measured that **raids are decided by objective capture, not combat** — survival-regret zero on
every seed — and left it as a tuning mystery. It is not tuning. **Five of seven combat primitives
never fire**, so combat is `direct-damage` plus whatever area-denial rides in on damage's ticket, and
`direct-damage` removes a target 1.57% of the time. Combat cannot decide a raid because most of
combat is not in the raid.

It also retroactively qualifies every control-primitive measurement this project holds. W38's
*"area-denial 49.7%, summons + soldiers 48.4%"* was measured with summons that were **soldiers**,
because summoned creatures cannot be summoned.

**This is a one-line filter with a five-primitive blast radius**, and it is the first thing to fix
when the freeze lifts. The fix itself needs care rather than deletion: the filter exists so a
combatant does not stand in a field choosing a node that does nothing, and the comment four lines
above says so — *"a refusal that costs a tick is a behavioural bug wearing a safety check's
clothes."* The correct test is *does this node do anything in an engagement*, which is the seven
`COMBAT_PRIMITIVES`, not the one.

---

## No NaN contamination — and two findings that matter more than the one we were hunting

**Verdict: clean, and negative-controlled.** Zero non-integer values crossed into state across a
2,400-tick reference run and eight strategy arms — **74,859,594** writes through the unchecked door
and **12,789,123** through the checked one. The probe was **proven able to fire first** (2 of 2
injected NaNs caught, one per door), and the run's snapshot hash matched the committed
`6ed339c6d1dea724` exactly, so the instrument did not perturb what it measured.

A state *sweep* can never work, which is worth recording: **by read time a NaN is already `0`.** The
check watches values **as written**, at the only two doors.

### The specimen for "how did 3,900 tests miss this"

`packages/rules-world/test/unit/economy-materials.test.ts:37` declares its helper with:

    resourceYieldBonuses: readonly number[] = []

Two tests pass a non-empty list and prove `resourceYieldMultiplier` stacks correctly. **Not one test
of `materialsProduced` overrides that default — and the default is character-for-character the `[]`
that `world-step.ts:772` passes in production.**

> **The suite verified the function and never the wiring.** The test's own convenience default *is*
> the production defect.

Same shape for `assertRepresentable`: it had tests, they asserted out-of-range rejection, and none
ever handed it a NaN. This is the whole answer to the author's question, and it is a category of test
the project lacked rather than carelessness in the ones it has.

### FINDING 1 — the balance gates cannot see a doubling

Two of the three gates play **no god verbs at all** (`worldTickCap` 60 and 240, `passive-control`
only). The third pools all eight arms — **whose outcomes span 40×** — into one mean, with tolerance
set at 3× that pooled standard error:

> **±118% of mean for `referenceGrimoires`. ±136% for `referenceNodesGainedFinalQuarter`.**
>
> **A mechanic could double knowledge output and the gate would pass.**

This is a better explanation of eight null results than any mechanism theory. The instrument that
declared them null has tolerances wider than the effects being looked for, and two thirds of it never
exercises the verbs under test. **Every null this campaign has recorded needs re-reading against
that**, and no baseline cut before it is fixed can mean what §11's parity rule claims an even MINOR
means.

### FINDING 2 — the float ban does not cover `packages/coordination/src`

`CLAUDE.md`'s first non-negotiable constraint is no floating point in the rules path. **eslint's
`RULES_SRC` omits `packages/coordination/src` while `check-purity.mjs` treats it as rules path** — so
the two disagree about what the rule covers, and four raw-division sites sit in the gap:
`god/ascension.ts:336,337` and `god/interventions.ts:441,798`.

### The 1.9% question, answered a second way and agreeing

Independently of W56's ×24 discovery, W55 reached the same verdict by arithmetic: `CastArbiter#effectsOf`
uses `requireRegistryNode`, **which throws on a miss**, and compares strings on both sides — no
mismatch is possible. And the numbers predict the result without any measurement: direct-damage is
fp(276) **once per cast** behind an evasion roll, 0.42% of max HP, while `summon-damage` is fp(2048)
**per tick per summon** up to eight. **One summon out-damages an entire cast 7.4× in a single tick.**

Two agents, two methods, same answer. That is the strongest form of confirmation this campaign gets.

### Scope, stated rather than implied

The clean bill covers the reference run and all eight arms. It does **not** cover `rules-raid`'s
engagement path, because nothing opens a portal at this build and **no engagement tick ever ran.**

---

## Ten of fifteen metrics have never run. The four dead constants were not accidents.

W57, while building species metrics, found the general mechanism:

> **`collectRunMetrics` has no production caller anywhere.** Nothing constructs a `RunTelemetry`;
> `KnowledgeCensus` is never instantiated. **Ten of the fifteen registered metrics are per-run and
> are therefore all structurally incapable of moving in a real sweep.**

Baselines gate only `scenario`'s ten `reference*` vital signs. Everything else in the registry is
decoration.

**Put beside W55's finding, the measurement apparatus is comprehensively broken:**

- **10 of 15 metrics are never collected.**
- The few that are get tolerances of **±118% of mean**, set at 3× a standard error pooled over arms
  spanning 40×.
- **Two of three gates play no god verb at all.**

That is a complete explanation of eight consecutive null results, and it is not a mechanism theory.
**We have been measuring with an instrument that mostly does not run, and grading it against
tolerances that cannot fail.** `libraryDependence` pinned at 0, `capitalSnowball`'s byte-identical
checkpoints, `referenceLibraryDepth` at 1.00 and the coverage gate were four visible symptoms of one
structural fact.

## Nothing in the rules path ever raises mastery

Found while trying to gate "qualified" on teachability:

> **`setMastery` has one non-test caller — the decay pass — and it only lowers.**

Research creates instances at **256**, below the **512** teach threshold, and **they can never
climb.** Every teachable instance in the game descends from a god grant at 1024, sliding toward a
retention floor that is also below 512 **for all six species**.

So `ages-of-magic.md` §2c's publish-or-perish is not merely missing its *publish* half — the arrow
only points down, by construction, everywhere. W53's `practice` is the fix and it is unmerged.

This also makes the **teachable window** the real species discriminator: gnome **32** ticks against
dwarf and draconic **102**.

## The three species claims, measured

**Claim 1 — versatility hegemony — refuted, and what replaces it is worse.** All six species staff
**70 of 70** cells and 12 of 12; all six trip an 80% flag. Every cell has a prerequisite-free tier-1
node and the lowest depth ceiling is 3, so **cell entry is free for everyone and nothing limits
breadth at all.** The contrast vector confirms the derivation reads content correctly: elf and
draconic are exactly top on `exhaustibleCells` at 70/70, against orc's **2**.

**Claim 2 — long-lived brittleness — half supported, mechanism refuted.** Elf and draconic never
recover, so losses do compound. But *"human and orc get absorbed"* is **false** — both are censored
too, despite human having the highest mage-production rate and orc the shortest maturity lag. Only
gnome (72 ticks) and dwarf (372) recover. **Recovery is not fertility-limited**: student demand *is*
university capacity, and the carrying-capacity brake is one scalar shared across all species.
Retuning `fertility` would move a number that is not the binding constraint.

**Claim 3 — role assignment as a demographic lever — refuted, and reported `mechanic-absent` rather
than 0.** `roleId` never enters the mortality hazard; `perTickHazard` reads age, birth tick and
effective lifespan and nothing else. The only role-to-death pathway is raid combatant eligibility,
and `raidEngagement` is false. **The price is undefined, not zero. The lever does not exist yet.**

### And it caught itself falling into this project's own trap

Its first shock run returned `recoveryTicks: 0` for all six species. The cause was its own sampling
window — the shock-tick observation is recorded *before* the cull, so the collector received the
pre-shock roster as its first post-shock sample.

> *"Six species reporting instant recovery after losing half their mages was the tell."*

A plausible zero, caught because it was implausible. That is the discipline the four dead constants
needed and did not get.

---

# The random bot wins because it presses the button

W58 ran both falsification tests. The results resolve the campaign and invert two of its headline
findings.

## Test 1 — a random bot ascends 80/80, on every starting position

| strategy | asc/runs | rate | mean nodes |
|---|---|--:|--:|
| `passive-control` | 0/80 | 0.0000 | 51.0 |
| **`uniform-random-legal`** | **80/80** | **1.0000** | 50.5 |
| `permissive-breadth` | 80/80 | 1.0000 | 190.9 |
| `archivist` | 79/80 | 0.9875 | 51.0 |
| `narrow-depth` | 21/80 | 0.2625 | 7.7 |
| `denial-warden` | 20/80 | 0.2500 | 3.1 |

Across **560 paired world-by-world comparisons**, the number of worlds where a designed strategy
summited and the random bot did not is **zero, in every row.**

## And here is why

> **`passive-control` reaches `ascensionPath = apotheosis` at tick 960 in 8 of 8 runs.** It scores
> 0/80 for one reason: its stance is `never`, so **it never submits action 15.**
>
> **The random bot holds the same 51 nodes and wins 80/80 because it draws the button.**

The win condition reads a clock that runs whether or not anyone plays. Everyone qualifies; only some
*declare*. That is the whole result, and eight mechanics were built downstream of it.

## Test 2 refutes *both* remaining explanations

The simulation is **not** insensitive and the evaluator is **not** hiding a live signal. Instrumented
before scoring, the arms diverge enormously and **never reconverge**:

- `nodesKnown` **η²(strategy) = 1.00** from tick 60 onward
- cross-strategy node-set Jaccard on a **shared seed: 0.23**, against within-strategy cross-seed **0.89**

That is the **inverse** of the shape this document has cited for weeks.

### Which means "seed beats strategy" was a measurement artifact

The earlier sweep's **round-robin assignment gives each strategy disjoint replicate indexes, so no two
strategies ever played the same universe.** It was comparing different worlds and reporting the
difference as strategy-insensitivity. W19's twelve-horizon result, and every citation of it here,
inherits that defect.

**Strategy dominates node composition overwhelmingly.** It always did.

## The one genuine null

**Knowledge does not convert into population.** η²(strategy) **0.01–0.04** at every horizon while
η²(seed) runs 0.6–1.0, on a channel demonstrably capable of differing. The god's play moves what a
universe knows and does not move how many people it has.

## Instrument findings that block anything quoted from before

- **On `main` the exploit margin is still `ascensionRate − probeRate`** — confirmed empirically to 4dp.
  `EXPLOIT_MARGIN_MIN` (0.05) equals `BAND.min` (0.05). **W18's repairs were never merged**; they
  exist only on `w18/instrument-repair` and round-3.
- **The −0.8214 this document quotes is not about `uniform-random-legal`.** It is round-3's
  *"deliberate mean 0.1286 − worst probe 0.9500"*, and the winning probe there is
  **`permit-then-idle` at 0.95** — while `uniform-random-legal` scores **0/40** on that tree.
  **The exploit's identity reverses between trees.** The shape of the finding survives; every
  specific number attached to it does not.
- The probe still has **7 of 15 verbs inert**, so 1.0000 is a floor on *this* probe. It wins 80/80
  anyway.
- **Position dependence is real but belongs to someone else**: the probe is position-*independent*
  (1.000 in all four cells); `narrow-depth` (0.000/0.000/0.900/0.150) and `denial-warden` are the
  position-dependent ones. This refines a prior claim rather than confirming it.

Every reported null was checked against the silent-zero confound per quantity, and none is a
`NaN → 0`.

---

## W66 — the research guide, spot-checked against `packages/`, and four of five items withdrawn

*2026-08-13. A review pass over the five research-dive items I had queued. It refutes items I had
already dispatched agents on, including one I had called the cheap one.*

**The general lesson, which matters more than any single item: the guide was briefed on
`vision.md`, which describes intent, and not on the code, which is well ahead of it.** So it
systematically over-recommends things that already exist. The hit rate on "already built" is high
enough that any entry must be spot-checked against `packages/` before acting. I did not do that
before dispatching, and it cost two agent-runs.

### Item 1 — combat primitives are measured wrong. **Withdrawn, and the fix would have been a regression.**

`winRateByPrimitive` (`packages/mc-harness/src/ablation.ts`) does not score combat nodes by damage.
It ablates each primitive and measures the win rate of the arm retaining it against the arm where
it is neutralised, over **mirrored paired seeds** with a **Wilson score interval**. That is
outcome-based by construction: if `direct-damage` contributes less to winning than `area-denial`
does, the ablation says so without anyone deciding in advance that control matters more. Bolting a
damage-output metric onto that is a regression, not a fix.

The mirroring is the tell that this was thought through. `ablation.ts` states that an unmirrored
measurement would report side 0's structural advantage as the primitive's contribution — "quietly,
as a number near 50% that drifts."

The timing argument was backwards as well. It said land this *before* the baselines are committed.
**The baselines are committed already.**

**What survives is narrow and real:** ablation measures a primitive's *presence*, not its *tuning*.
The 300 nodes carry **37 `direct-damage` effects spanning magnitudes 96 to 768 — an 8× spread** —
and whether a given node's magnitude clears a kill threshold is invisible to a presence/absence
experiment. That is a question about node tuning *inside* one primitive, not a flaw in how the
harness values combat. PR #57's `combatActionEconomy` is a legitimate second view but is a
**secondary diagnostic beside the ablation, not a replacement**, and no gate should be built on it
until it has been checked against what the ablation already reports. Its PR body has been corrected.

### Item 2 — species insights. **Holds, and is the best-timed thing on the list.**

All six species carry `"tuningStatus": "untuned"` in `packages/content/data/species.json`. This work
is genuinely ahead of the campaign.

- **Versatility hegemony is a real registry gap.** Twelve metrics, and none measures how many cells
  a species can staff; `grep` for `coverage` or `hegemony` returns zero. The tuner scores strategy
  variety, but that is concentration *across strategies*, not across *species capability* — a
  different question. **Now the highest-priority open item**, dispatched.
- **Long-lived brittleness is weaker than billed**, because the data already encodes it hard:
  fertility runs **96 (draconic) to 1536 (orc), a 16× spread**, against lifespans of 18000 vs 720
  months. The asymmetry probably already emerges. This wants a **balance assertion, not a mechanic.**

### Item 3 — tie worship to daily relevance. **Half-anticipated; the surviving half is real and is not cheap.**

`god-constant.json` already implements worship as three saturating classes — mage, university,
populace — each with a per-head rate and a half-cap. And the design has already *rejected* "worship
equals power": `favor-cap-base`'s gloss says the cap "converts a worship lead from power into tempo
— a high-worship god cannot do more things, only sooner." There is even a documented
`worshipSnowball` retune order across four constants.

**What genuinely is not there: worship is completely independent of which cells you permit.**
Nothing connects the ruleset to devotion, so "water and crops out-worship spectacular destruction"
is unimplemented. But it couples the ruleset into a loop that already has a tuned anti-snowball
retune order, so it is a bigger change than I described it as.

### Item 4 — forbidding Intellego costs counter-intelligence. **Does not map. Withdrawn.**

I called this the cheap one. It is the opposite. `concealment` exists, but as a **raid-scale** combat
primitive — a probability of evading targeting, stacked multiplicatively in
`packages/rules-raid/src/arbitration.ts`. **There is no world-scale screening concept for it to
modify.** "Forbidding Intellego leaves hostile concealment unopposed" would require inventing a new
world-scale subsystem, which the insight does not justify. The agent was stopped and re-pointed at
item 2.

### Item 5 — make the university prestige loop explicit. **Already done, better than proposed.**

`capitalSnowball` measures the Gini of library-held nodes at five checkpoints; `libraryDependence`
measures the fraction of nodes down to a single surviving instance; `prestigeAdvantage` and
`prestige-per-worship-tier` both exist. The compounding loop is instrumented. I was recommending
building something that is built.

### Revised ranking, replacing the one above

1. **Species cell-coverage metric** — a real gap in the registry, and species tuning is the live work.
2. **Node-level damage-threshold tuning** — the surviving fragment of item 1: ablation cannot see
   magnitude tuning within a primitive, against an 8× spread over 37 damage effects.
3. **Ruleset-to-worship coupling** — genuinely absent, genuinely interesting, not cheap.
4. Everything else — already implemented to a higher standard than the guide proposes, or needing
   new subsystems the insight does not justify.

### An aside the CI queue handed over for free

`check:consumption` fails identically on all six open PRs in ~25s. That is not six regressions and
not a broken check: **the condition is true on `main`.** Two of sixteen primitives have a
node-driven consumer — `portal` (2 nodes) and `worship-yield` (11 nodes). The other twelve, including
every combat primitive, cannot be moved by anything the academics know. The check is non-blocking and
is working exactly as designed; it is the clearest single statement of the gap the campaign is
closing. It also independently confirms the "two, not one" correction recorded above.

---

## W68 — the teaching leak, investigated on request, and three measurements that turn out to name one mechanism

*2026-08-13. From the grungeon-master digest (eps 13/14/27/29/33/36/38/41/43). The item asked for
an investigation; here it is, with one correction that makes the fix substantially cheaper.*

### The finding holds. `studentFor` and `teacherFor` scan every living mage in the universe.

`packages/coordination/src/gateway.ts:501` and `:513` both iterate `this.livingMages()` with **no
affiliation test and no proximity test**, returning the lowest-handle counterparty. `outlook.ts:104–105`
feeds `teachableToMe` / `teachableByMe` from that unfiltered scan. There is no institutional boundary
on teaching. Confirmed.

### The correction: a university *is* a container — just not for teaching.

The item says "a university is not a container for anything." That is too strong, and the difference
is the whole cost estimate. `universityId` has **41 read sites**, and three of them are real containers
already:

| what `universityId` gates | where | works? |
|---|---|---|
| **which library your books are shelved into** | `gateway.ts:912` → `#libraryOf` → `#shelfFor` | **yes** |
| **scribe-months available to you** | `outlook.ts:59, 109` `scribeThroughputOf` | **yes** |
| **whether you'd rather be elsewhere** | `outlook.ts:92, 110` `preferredUniversityFor` | **yes** |
| **who can teach you** | `gateway.ts:501, 513` | **no — leaks universe-wide** |

So the container exists, is load-bearing, and has exactly one hole in it. Scoping teaching to
co-affiliates is **plugging a hole in a working boundary**, not building a boundary. The item's own
suggested route — cross-university transfer through `affiliate`, which already exists as a goal — is
therefore the right one, and `preferredUniversityFor` is already the machinery that would move mages
between containers.

### Three independent measurements name this one mechanism

This is the part that was not visible from any single workstream:

- **W24's siting result had nothing to bite on.** The item's diagnosis — *sites differ, libraries
  can't* — is right, and now has a mechanism: books are shelved per-university (that boundary works),
  but the knowledge that produces the books is universally available (this one does not). Siting can
  only matter if what a site holds can diverge.
- **W19's horizon sweep, 9,600 runs over twelve horizons, found the strategy space one-dimensional at
  every horizon** — including tick 30, where universes hold 31% of the reachable set. Its own
  explanation: `compareTargets` orders candidates by cost then node id, so *"a value-blind acquirer
  walks one queue at any horizon over any set."* Cross-strategy containment sits **above** the
  within-strategy diagonal at all twelve horizons, worst at the shortest.
- **`studentFor` returns the lowest-handle student and `teachableTo` returns the cheapest node.** The
  docstring says so and gives a defensible reason for each (a handle is a total order depending on
  nothing but state). Locally correct, globally the same queue.

**One queue, walked by everyone, with no container to hold a difference in.** That is why seed beats
strategy on node composition even though strategy dominates node *count* (η² = 1.00 from tick 60):
strategies differ in how much they acquire and not in what, because there is only one "what" to walk.

### Consequences for the roadmap

W19's conclusion — that no pacing change and no mechanic altering acquisition difficulty will produce
a second dimension, because the ordering is value-blind — is **correct but incomplete**. Value-blind
ordering and boundary-free teaching are two separate causes of the same one-queue result, and fixing
either alone leaves the other. W17's value-sensitive acquirer makes the queue *ordered differently*;
scoping teaching makes there be *more than one queue*. **Both are needed and neither substitutes.**

### The proposed measurement has no instrument yet

`universityProfile` exists only in `packages/rules-world/test/unit/universities-library.test.ts` — it
is a test helper, not a registered metric. "Dominant cells differ between two universities on the same
seed" is the right check and cannot currently be run in a sweep. That is a small, well-defined gap and
should be closed before the mechanic changes, so the before-figure exists.

### Items 1, 5, 9 and 43 from the same digest — triaged, not yet actioned

- **Ep 13/29, founding knowledge is blueprint-shaped.** Confirmed at
  `interventions.ts:624`: `createInstance` at `constants.grantMastery`, a full instance in a mind.
  **And it is worse than the item knows** — `setMastery`'s only non-test caller is the decay pass in
  `decay.ts:213`, and it lowers. **Mastery can only ever fall.** Research creates instances at 256
  against a 512 teach threshold, so founding grants at 1024 are the *only* source of teachable
  knowledge in the universe, which is why 93.4% of held knowledge cannot be taught. Making the grant
  nudge-shaped **without landing `practice` first would remove the only source of teachable knowledge
  there is.** `w53/practice` is therefore a hard prerequisite, not a parallel track. Sequenced.
- **Ep 41, universities have one growth axis.** Holds. A second axis — coordinated non-magical
  throughput — would give `laborAffinity` (orc 1536, dwarf 1280) something to do; it currently sits in
  the same category the species `affinities` field sat in before W20 wired it. Queued behind the
  teaching boundary, because a second axis for a container that cannot hold a difference is a second
  axis on nothing.
- **Ep 36, portal security as a materials drain.** Holds, and is the cleanest available instance of
  the "permission should be necessary but not sufficient" shape that two external reviewers converged
  on independently in round 3. `portal` is one of only **two** primitives with a node-driven consumer,
  so it is also one of the few places where a drain would actually be reachable from what mages know.
- **Ep 43, maintenance. Already built — recording it so nobody re-proposes it.**
  `LIBRARY_UPKEEP_PER_INSTANCE` in `library.ts` plus `applyLibraryUpkeep` at `capital.ts:271` degrade
  instances on unpaid materials, and W7 measured it flipping narrow-depth from 12/12 to 0/12. The
  unbuilt half is the material axis: `GrimoireRecord.durability` (`components.ts:735`) is written from
  `scribeAffinity` and was read by nothing until W8's looting. A material tag on grimoires now
  multiplies a live axis instead of adding a dead one.

**The general lesson from the previous digest still applies and applied again here:** every one of
these needed checking against `packages/` before acting. Two of the six were already built, one was
sharper than stated, and one would have been actively destructive if landed in the order proposed.

### The founding-grant budget — decision, 2026-08-13

**Grants stay full instances. What changes is that you only get two at first, and more accrue.**

This is the owner's call and it is better than the nudge-shaped grant the digest proposed, for a
reason the digest could not have known: the nudge shape achieves "necessary but not sufficient" by
weakening *what* a grant is, and a grant at mastery 1024 is currently the **only** source of
teachable knowledge in the universe. Weakening it removes the thing before its replacement exists.

A **budget** achieves the same design goal by making grants *scarce* instead of *weak*:

- permission is still necessary and no longer sufficient — you cannot seed the whole grid, so what
  you seed is a commitment and the rest has to be discovered;
- specialisation is sharp from the founding, which is ep 29's point, because two grants force a
  choice where nineteen did not;
- the valuable import is a direction rather than a destination, which is ep 13's point, because two
  nodes cannot be a curriculum;
- and **nothing that currently works stops working**, because a granted instance is still a granted
  instance. `practice` stops being a hard prerequisite and becomes an independent improvement.

**What accrues is the open sub-question.** It should be something the universe *does*, not something
the god spends, or the budget becomes a second favor pool with extra steps. The candidates worth
measuring, in preference order:

1. **Nodes the mages discovered for themselves** — the god earns the right to seed more by the
   universe having demonstrated it can grow without seeding. Reads directly off knowledge instances,
   needs no new state, and makes the early game teach the loop it wants you to trust.
2. **Universities founded and still standing** — ties the budget to the institution, which is where
   ep 41's second growth axis and the teaching boundary both land.
3. **Worship**, only if it can be made ruleset-sensitive first — otherwise it is the favor pool again.

**Measurement, unchanged from the digest and now actually runnable:** `permit-then-idle` stops
matching `permissive-breadth`'s 231-node profile. That pair is the campaign's negative control and its
sharpest single number — the idle bot currently scores **40/40** against the active bot's 38/40. If a
grant budget does not move it, the budget is not doing the work.

### The 2×2 opening — decision, 2026-08-13

**A universe does not begin with the grid. It begins with a 2×2 square of it, and techniques and
forms are themselves discovered.**

Today v1 enables twelve cells — `{intellego, perdo, rego} × {limen, mentem, nomen, terram}`, a 3×4
block — and enables them *at the start*, for everyone, identically. The opening becomes **2 techniques
× 2 forms = 4 cells**, chosen at founding, and the rest of the grid is reached by discovering
techniques and forms rather than by being handed them.

**This is the structural answer to the one-dimensionality W19 measured over 9,600 runs.** That sweep
found the strategy space one-dimensional at *every* horizon from tick 30 to 2400, and its explanation
was that a value-blind acquirer walks one queue. But there was a deeper reason it could only ever find
one queue: **every universe was walking the same content set.** Cross-strategy containment sat above
the within-strategy diagonal at all twelve horizons — which is what "there is only one thing to
discover, and strategies differ only in how fast" looks like when you measure it.

Different opening squares are **different content sets from tick 0**. Two universes that begin at
`{intellego, perdo} × {mentem, nomen}` and `{rego, creo} × {terram, limen}` do not have a queue in
common to walk. That is a second dimension obtained structurally rather than by tuning, and it is the
one thing on the list that no acquirer change and no pacing change could have produced.

**How it composes with the other two fixes, which is the point:**

| fix | what it does to the queue |
|---|---|
| **2×2 opening** | there is more than one queue, and yours is not mine |
| **grant budget (2 grants)** | you cannot seed your whole square — inside 4 cells, 2 grants is a sharp commitment |
| **teaching boundary** | two universities in *the same* universe can hold different parts of one square |

Each is necessary. The budget without the square is a sharp commitment to a shared destination; the
square without the budget lets you seed all four cells and skip the discovery the square exists to
force; the boundary without either has nothing to hold apart. **Together they are the first design in
this campaign that makes "which magic does your universe have" a question with more than one answer.**

**This is also what `docs/design/ages-of-magic.md` was describing without a mechanism.** Ages governed
by the interactions of two, with the interactions of three taking time to develop, is exactly a grid
that opens 2×2 and grows — the early game is raw and new because you genuinely hold four cells, and the
late game has fully developed colleges because by then the square has grown and the prerequisites are
reachable. The doc had the fiction and the pacing; this is the rule underneath it.

**Open questions, to settle with measurement rather than argument:**

1. **Who chooses the opening square — god, seed, or species?** God-chosen makes it the first and most
   path-dependent decision in the game, which is ep 29's argument. Seed-chosen guarantees divergence
   across a sweep without relying on the strategy to produce it, which is what the measurement needs.
   These are not exclusive: seed-chosen for the harness, god-chosen for play, is a legitimate answer if
   the scenario layer can express both.
2. **Must the square stay contiguous as it grows?** A 2×2 that grows to a 2×3 and then a 3×3 is a
   different game from one that adds arbitrary cells — contiguity is what makes a technique or form
   an *axis* rather than a token.
3. **Do the twelve currently-enabled cells survive as a "standard opening"?** The 51 authored nodes in
   those cells are the only content that has ever been measured. A 2×2 elsewhere on the grid draws on
   the other 249 nodes, which are authored but unexercised — expect them to be wrong in ways the
   enabled twelve are not.
4. **What does this do to the balance baselines?** All of them. Every committed baseline was measured
   against a 12-cell opening. This is the largest behavioural change proposed in the campaign and it
   invalidates the lot; that is a cost to plan for, not a reason to avoid it.

### On guessing at numbers — a standing rule, recorded because it keeps coming up

The owner's response to being asked for a grant budget was *"idk what the right budget is, I am
guessing."* That is the correct answer, and the correct response to it is **not to guess better.**

This project has a Monte Carlo harness, paired seeds, common random numbers, mirrored ablation and a
strategy pool. **A number nobody can defend should be a swept parameter, not a chosen constant.** The
rule, for this campaign and after it:

> When a design decision reduces to a scalar and no one can say why it should take a particular value,
> the deliverable is the **curve**, not the value. Sweep it, with both degenerate ends as controls, and
> let the recommended value fall out of the measurement.

For the grant budget that means sweeping 0 (pure discovery, no grants) through unlimited (today's
behaviour) with 1, 2 and 4 between. **Both endpoints must be in the sweep**, because a range whose ends
are not controls cannot say whether the mechanic did anything. A flat curve is a real finding: it would
mean grants are not the binding constraint and the budget is theatre.

This is also the honest reading of why so much of this campaign produced null results. Eight mechanics
were declared null by an apparatus that mostly did not run — but several of the *design* decisions
underneath them were single guessed constants that nobody swept, and a guessed constant that happens to
sit in a flat region of its own curve is indistinguishable from a mechanic that does nothing. **The
instrument was one failure; unswept scalars are the other, and this one is ours.**

The same rule applies to the 2×2 opening: **the square size is a parameter too.** 2×2 is the owner's
intuition and deserves the same treatment as the budget — sweep 1×1, 2×2, 3×3 and the full 3×4 that
v1 currently ships, and report what square size actually buys a second dimension. It may be that 2×2
is too tight to be playable, or that 3×3 is enough; neither is knowable by argument.

---

## W71 — practice changes which species survive, and that is both the result and the problem

*2026-08-13. Isolated while merging `main` into `w53/practice`. Three tests fail on the merged tree
and pass on `main`; they are reporting a real change, not flake.*

`w53/practice` adds a `practice-rate` primitive so mages can restore mastery. Before it, `setMastery`
had one non-test caller — the decay pass — and it only ever lowered.

Same test, same seed, the two trees:

| species | lifespan (months) | on `main` (pre / killed) | on `w53/practice` |
|---|---|---|---|
| human | 720 | **16 / 7** | **5 / 1** |
| orc | 720 | **3 / 2** | **absent — no row at all** |
| dwarf | 3,600 | 18 / 10 | 23 / 14 |
| gnome | 2,400 | 10 / 6 | 12 / 6 |
| elf | 8,400 | 8 / 4 | 8 / 4 |
| draconic | 18,000 | 11 / 4 | 11 / 4 |

**The direction is exactly what a retention mechanic predicts.** If you keep what you learn, a species
that lives 18,000 months compounds mastery and one that lives 720 dies before practice pays off. The
two shortest-lived species collapse; the longer-lived ones grow or hold.

**This is simultaneously the best and the worst news on the branch.** Species differentiation that
*emerges from a mechanic* rather than from tuned constants is precisely what this campaign has failed
to produce for weeks — W19 found the strategy space one-dimensional across 9,600 runs, and all six
species can staff 70 of 70 cells. A mechanic that makes species genuinely different is the goal.
**But driving a playable species to zero is not differentiation, it is deletion.**

Orc going extinct is doubly surprising: **orc fertility is 1536, the highest of the six**, against
draconic's 96 — a 16× spread. A species with the best fertility in the game reaching zero says the
lifespan channel is overwhelming the fertility channel rather than trading against it.

**The third failure may be the primary one and is not yet ruled out.** `reference-long-run.test.ts`
fails with *"scribing died of the economy again — vellum ran out, not just food."* More retained
mastery means more scribing means more vellum drawn, and a materials collapse would hit the most
populous species hardest — which would make the population table a *symptom* of an economic failure
rather than a lifespan effect. Those are very different fixes and the two hypotheses have not yet been
discriminated. Under investigation.

**Recorded now rather than after the fix, because the shape of the finding matters more than its
resolution:** this is the first time in the campaign that a mechanic produced species divergence
without anyone tuning a species constant to produce it. Whatever the fix turns out to be, it must keep
that and lose the extinction. All six species carry `"tuningStatus": "untuned"`, so retuning is
legitimate — but the differentiation is the asset here, not the accident.

---

## W72 — favor is not a binding constraint anywhere, and a converter with no input

*2026-08-13. Surfaced as a caveat on the ascension work; it is larger than the work it was a caveat on.*

**`open-then-build` founds 98 universities against a threshold of 2, with zero rejections and 4.7M
favor left unspent.** The god sits at its favor cap, so the purchase is free.

In Machinations terms this is a **converter with no input constraint**. Founding a university is
supposed to be a decision — a thing you can do instead of something else. It is currently a button
that always works, ninety-eight times, while the resource that nominally prices it accumulates unspent
in the millions. There is no shortage, so there is no decision, so the verb carries no information
about what kind of god you are.

**This is the same disease as the two mechanics now in flight, showing up in a third place:**

| where | the free thing |
|---|---|
| **founding knowledge** | grants are unlimited; a full instance at mastery 1024, as often as you like |
| **the opening ruleset** | twelve cells, enabled at the start, identically, for everyone |
| **founding universities** | 98 for the price of nothing, against a threshold of 2 |

The founding-grant budget (`w69/grant-budget`) and the 2×2 opening (`w70/opening-square`) treat the
first two. **Nothing yet treats the third**, and it is arguably the cheapest of the three to fix,
because the price already exists and simply never binds.

**Why this matters more than a tuning note:** it explains why the ascension conjunct is, in its
author's own honest phrase, *"a placement fix, not an economic one."* Requiring universities before
ascension converts "reads the ruleset" into "reads the ruleset **and** one button nobody pressed."
Strictly better, and not deep — because the button is free. **If founding a university were actually
priced, the same conjunct would be an economic fix.** The mechanism is sound; it is resting on an
economy that does not push back.

The general form, worth stating once so it can be checked against every future verb: **a cost that
never binds is not a cost, and a verb whose cost never binds is not a choice.** The measurement is
simple and nobody has been running it — for each god verb, the fraction of legal invocations that were
declined for want of resource. Any verb sitting at zero over a full run is free, whatever its
declared price says. `favorCost` being typed `Fp` makes this easy to get wrong in the reassuring
direction: a price that looks like 98,304 is 96.
