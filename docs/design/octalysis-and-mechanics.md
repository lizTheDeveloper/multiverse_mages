<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Octalysis, and the four open mechanics questions

**Status:** proposals. Nothing here is implemented and nothing here is a decision. Where the vision
already answers a question, this document cites it and stops. Where the vision is genuinely silent,
it gives two or three options with trade-offs, a recommendation, and the measurement that would show
the recommendation failing.

**Build analysed:** `integration/measured-ground` @ `c02fb48`. Every `file:line` below was read on
that commit and spot-checked by hand, because W6, W7 and W8 are moving the same code and a citation
that rots silently is worse than no citation.

**A framing correction, applied throughout.** An earlier draft of this brief described the game as
single-player-versus-environment. It is not. Vision §8 has universes raiding each other, §8a carries
prestige *across* runs, §11 schedules `pvp-server` at 0.15.0 with `authoritative-lockstep` and
`direct-challenge`, and `CLAUDE.md` names the live-PvP requirement as one of the two sources of the
determinism constraints. The single-universe Monte Carlo scenario is an **instrument limitation**
that this campaign is fixing, not the shape of the game. That correction changes the verdict on one
Octalysis drive and replaces one of the open questions outright.

---

## Part 0 — Eight corrections to the measured record

These came out of tracing the code against the campaign's own summary. They are listed first
because several of them change what the rest of this document can honestly claim. Each was verified
directly rather than taken from a summary.

### C1 — The species traits are not inert. They are read everywhere and consequential nowhere

`campaign-plan.md` line 32 says *"every species trait about retention, scribing and rediscovery is
inert"*, and `hard-magic.md` says the traits are *"authored and inert"*. **As stated, this is false.**
All eight authored traits are read in the reachable world loop:

| trait | read at |
|---|---|
| `lifespanMonths` | `packages/rules-world/src/mages/lifespan.ts:192`, `packages/coordination/src/world-step.ts:989` |
| `retention` | `packages/coordination/src/world-step.ts:1024` (`retentionOf`), consumed by the decay phase |
| `scribeAffinity` | `packages/rules-magic/src/instances/scribing.ts:187` (durability roll) |
| `rediscoveryAffinity` | `packages/rules-magic/src/instances/research.ts:221` |
| `curiosity` | `packages/rules-world/src/mages/personality.ts:94`, `packages/rules-world/src/autonomy/terms.ts:223` |
| `learnRate` | `packages/rules-magic/src/instances/research.ts:232` |
| `depthCeiling` | `packages/rules-world/src/autonomy/candidates.ts:70` |
| `fertility` | `packages/coordination/src/world-step.ts:955` → `packages/rules-world/src/economy/carrying-capacity.ts:439` |

The accurate statement is narrower and more useful: **the traits are read, and the quantities they
modulate are pinned by thresholds and by an absent destruction channel, so they cannot express
themselves in an outcome.** That matters because "inert" invites the fix "wire them up", and they
are wired up. The fix is C2 and C3.

### C2 — Research-derived knowledge is both permanently unteachable and permanently undecayable

This is the sharpest finding in the trace, and it is verified from four primary sites:

- `DEFAULT_INITIAL_MASTERY = 256` — `packages/rules-magic/src/instances/constants.ts:50`
- `DEFAULT_TEACH_THRESHOLD = 512` — `constants.ts:63`
- `masteryFloor(retention, dormant)` returns `0` only when dormant, otherwise
  `min(mul(256, retention), MASTERY_MAX)` — `packages/rules-magic/src/instances/decay.ts:74-77`
- `setMastery` has exactly one call site, `decay.ts:213`, and it only ever lowers. **Nothing in the
  build raises an instance's mastery.**

So a node a mage researches is born at 256, can never rise to the 512 a teacher needs, and can never
fall to zero:

| species | retention | non-dormant decay floor | born at | teachable? | can reach 0? |
|---|---:|---:|---:|---|---|
| orc | 896 | 224 | 256 | no | no |
| human | 1024 | 256 | 256 | no | no |
| dwarf | 1536 | 384 | 256 | no | no |
| gnome | 512 | 128 | 256 | no | no |
| elf | 1280 | 320 | 256 | no | no |
| draconic | 1536 | 384 | 256 | no | no |

Only a founding grant arrives above the threshold — `grant-mastery` is `1024`
(`packages/content/data/god-constant.json:227-230`), and its own gloss says so: *"A grant at the
research default would sit below the teach threshold and never leave the founder's head."*

The consequence is recorded in the repository's own reference test,
`packages/scenario/test/unit/reference-long-run.test.ts:24-32`, which reports rather than asserts it:
**teaching stops after world year twenty and scribing after world year sixty.** Teaching only ever
propagates the finite pool of god-granted founding knowledge, and then it is taught out. Vision §5
calls teaching *"mind → mind. Fast."* — in the reference universe it is dead for 180 of 200 years.

### C3 — Written knowledge has no destruction path at all in the reachable build

- `destroyGrimoire` and `destroyLibrary` exist at
  `packages/rules-magic/src/instances/location.ts:111` and `:126` and have **no production caller** —
  the only call is `location.ts:137`, one calling the other.
- A grimoire's `durability` is written once at `packages/rules-magic/src/instances/scribing.ts:186`
  and read in production **only** by `packages/rules-raid/src/consequences.ts:190`, which is
  unreachable. There is no ambient decay of a book; `decay.ts:20-23` says so as a design intent.

So in the reachable game, a book is immortal. Combined with C2, the **only** loss channels that
actually fire are (a) a mage dying, which removes her mind copies, and (b) the god forbidding a cell,
which makes it dormant and lets decay reach zero. Item (b) is worth sitting with: **the sole
knowledge-destruction mechanism the player can experience is the player's own edict.**

### C4 — The archivist's "4096 grimoires" is a clipped observation, not a count

`OBSERVATION_SCALE.grimoireCount = 4096` — `packages/agent-api/src/layout.ts:210`. That is the
divisor at which the channel normalises to 1.0. `census.ts` decodes the **normalized** observation
and flags the clip (`packages/scenario/src/census.ts:83-95`, `CensusSample.saturated`), but
`REFERENCE_MEASURES` reads `run.last.grimoires` (`packages/scenario/src/measures.ts:124`) and drops
the flag. The archivist's measured 4096 is exactly the ceiling.

This does not overturn the campaign's conclusion — the archivist ends on the same 51 nodes, and that
is the load-bearing half — but "4096 against 1156" understates the archivist's redundancy by an
unknown amount, and one of the ten reference measures can report a ceiling as a measurement.

It also suggests a hypothesis for an otherwise strange number: the archivist records **fewer**
knowledge instances (2738) than the passive control (2922) despite far more books.
`OBSERVATION_SCALE.instancesPerCell` is 512 and the instance total is summed per cell, so a strategy
that concentrates copies clips harder. *Hypothesis, not a finding* — settled by propagating
`CensusSample.saturated` into the sweep output, which is a one-line reporting change and not a game
mechanic.

### C5 — `libraryDependence` does not sit at zero build-wide. Zero is a property of the passive control

W2's own probe (`origin/w2/discriminating-ascension`, `openspec/changes/discriminating-ascension/design.md`)
measures, at tick 2400: `passive` 0%, `breadth` **3%**, `builder` 0%, `canon` **2%**. The campaign's
line *"`libraryDependence` sits at 0"* is true of the strategies that do nothing and false of the
strategies that permit magic.

### C6 — `libraryDependence` measures the research frontier, not loss exposure

This one is a caution about **D5**, the campaign's own definition of done. `libraryDependence` is the
fraction of known nodes with exactly one surviving instance. A universe that keeps *discovering* new
nodes has single-copy nodes at its frontier whether or not anything is ever lost. Under C2, a newly
researched node cannot be taught, so its second copy must wait for another mage to derive it
independently — a long dwell at exactly one copy, by construction.

The arithmetic is: standing single-copy fraction ≈ (acquisition rate × dwell at one copy) ÷ nodes
known. Inverting it on the measured numbers, with **zero losses assumed**:

| policy | nodes known | nodes gained / 2400 ticks | measured libDep | dwell at one copy that alone explains it |
|---|---:|---:|---:|---:|
| `passive` | 51 | 0.0000 /tick | 0% | n/a — no flow, so no frontier |
| `breadth` | 182 | 0.0546 /tick | 3% | 100 ticks |
| `canon` | 174 | 0.0512 /tick | 2% | 68 ticks |

Sixty-eight to a hundred ticks — five to eight world years — is an entirely ordinary time for a
second mage to independently derive a node. **So the measured `libraryDependence` is fully
accounted for by acquisition flow with no loss channel involved.**

D5 as written — *"`libraryDependence` leaves zero — knowledge can actually be lost"* — is therefore
at risk of a **false pass**: W7's research loop will raise acquisition flow and move
`libraryDependence` off zero without making anything losable. The disambiguator is a loss
observation, not a standing stock: `knowledgeHalfLife` (a §7 metric, Kaplan–Meier over census
cohorts, already implemented at `packages/mc-harness/src/metrics-collectors.ts:126`) and
`eraNodesLost` (already in `godState`). Recommend D5 be restated against those.

### C7 — Favor is not scarce; it is superabundant

W2's probe measures discarded favor regeneration over 2400 ticks of **9.1M to 12.4M fp** for every
policy, against a pool cap of 61,440–71,680. `favorWasted` is fully implemented
(`packages/coordination/src/god/favor.ts:109-124` → `packages/coordination/src/god/system.ts:451`)
and contracts §7 calls it *"the early snowball signal"*. It is signalling.

### C8 — The construction economy is dead code

`advanceConstruction` (`packages/rules-world/src/universities/construction.ts:219`) has no caller
outside its own re-export. The **only** writer of `buildProgress` anywhere is `fundPlan`
(`packages/coordination/src/god/interventions.ts:750-754`), which adds a flat 256 fp per god action.
So the labour-and-materials construction path — `laborAffinity`, `build-rate` stacking, labour-stall
accounting — never runs, and a university is built exclusively by the god pressing a button four
times. Vision §6 says *"laborers build universities"*. They do not.

### C9 — The tradition axis is authored, asymmetric, and has never been measured

Not a correction so much as an unclaimed finding, and it is the largest one here.
`packages/content/data/tradition.json` gives **True Naming** an `acquire` hook with
`instanceMastery: 1024`. Vancian Memorization and the Art of Memory both use `acquire: standard`,
which is `DEFAULT_INITIAL_MASTERY` = 256.

Under C2, that single authored number is the difference between a universe whose teaching graph works
and one whose teaching graph is dead after year twenty. **True Naming is currently the only tradition
in which a mage can teach anything she discovered herself.**

The reference universe does not use it. `scribingTraditionId`
(`packages/scenario/src/content-set.ts:191-198`) picks the first shipped tradition whose `store` hook
keeps written copies — chosen by asking the hook rather than by naming a tradition, deliberately, and
the Art of Memory is excluded because it writes nothing down. The reference universe therefore runs
Vancian, which the reference test's teaching-collapse finding confirms empirically.

Vision §4a calls the tradition *"an identity decision, not a build option"* and gives it exactly four
licensed hook points. One of those hooks already contains a decisive strategic asymmetry, inside the
hook budget, in validated content data — and **no sweep varies it**. This is the cheapest untested
axis of play in the game, and it needs no new mechanic to test.

---

## Part 1 — The Octalysis analysis

### How this reading is bounded, before anything else

Octalysis is a vocabulary and a checklist for *felt player experience*. This game has had **zero
human playtests**, deliberately: vision §9 says *"Humans last… human playtesting discovers the human
meta after the machine meta says the numbers are sane."* So everything below is a reading of the
design documents plus the machine meta. Where I write "absent", I mean absent from the design or
absent from the simulation — never "players didn't feel it", because no player has felt anything yet.
An Octalysis audit of a pre-playtest build is a design review wearing a framework's clothes, and it
should be read as one.

I use five verdicts, and the distinctions carry weight:

- **present** — in the design and load-bearing in the build
- **stubbed** — the mechanism exists and produces no differentiated outcome
- **specified-and-unimplemented** — the vision specifies it; the code is written or scheduled and
  unreached. Not a design gap.
- **absent-by-roadmap** — not built, and not due yet per vision §11
- **absent-by-defect** — the design calls for it, the build contradicts it

### Drive 1 — Epic Meaning & Calling · **present**

*Vision §1, §2 pillar 1, §4a.* You are the god of magic for a universe; you never cast and never
command. The calling is structural rather than granted — you are not chosen by a narrator, you simply
occupy the role, which is a stronger form of the drive than the badge Octalysis usually describes.

Evidence it is real rather than asserted: the whole 70-cell grid is pre-authored, 300 nodes deep, of
which twelve cells are enabled (`CLAUDE.md`); the voice banks are, as `hard-magic.md` argues, a
specification of species behaviour rather than decoration; `tradition.json` makes the universe's
identity a single irreversible choice with four hook points.

**Fitting techniques:** *Narrative* and *Elitism* are already in the design — a universe's tradition
is its faction identity. *Beginner's Luck* maps onto the founding grant, which is the one action that
creates a body of magic from nothing. Nothing needs inventing.

### Drive 2 — Development & Accomplishment · **stubbed**

**This is where I disagree with the brief.** The author's reading is "strong on 1–4". Drive 2 is the
weakest of the four and the measurements say so plainly:

- `ascensionRate` **0.792** against contracts §7's declared band of 0.05–0.20
  (`probable-strategies.md`).
- A 24-cell tuner scan under common random numbers found **0 of 24** cells in band, **0 of 24** where
  the pool out-won the idle probe, and the idle probe winning **100% of runs in every cell**.
- **5 of 7 winning strategies** finish at the passive knowledge baseline of 51 nodes.
- `uniform-random-legal` — which plays nothing and presses buttons uniformly — ascends 12/12.

Octalysis is explicit that Development & Accomplishment requires the challenge to be real; a badge
for showing up is the framework's own canonical anti-pattern. The game has abundant progress
*structure* — worship tiers, eras, `deepestTier`, `goodEraRun`, prestige — and a terminal condition
an idle bot satisfies. That is a progress bar attached to a participation award.

There is a second, quieter defect on the same drive: the player receives **no per-step progress
feedback at all**. Contracts §4.3 promises `metricDeltas` *"since the previous step"* alongside every
observation; `packages/agent-api/src/outcome.ts:114` and `:127` return `Object.freeze({})`,
unconditionally and by acknowledged design pending `agent-interface`.

**Fitting techniques:** none that this document should propose — W6 owns making the predicates
require positive achievement, and W2/W3 have already designed it. The Octalysis contribution here is
only the diagnosis: what is missing is not a reward, it is a *challenge*.

**Explicitly rejected:** a Trophy Shelf, a badge wall, a completion percentage. A knowledge-management
game for people who like knowledge management does not need a Trophy Shelf, and the 70-cell grid is
already a better collection surface than any overlay would be.

### Drive 3 — Empowerment of Creativity & Feedback · **half present: creativity yes, feedback absent**

The creativity half is the game's strongest asset. Vision §4: nineteen primary switches plus a small
edict budget over seventy cells, each cell a graph of prerequisite-gated nodes. `permits()` is one
function (contracts §1.1). The action space is real and almost entirely reachable — of sixteen god
actions, fifteen dispatch to implemented effects (`packages/coordination/src/god/interventions.ts`),
and only `openPortal` is permanently masked.

The feedback half is not there, and this is the finding I would put in front of the author first:

- **The explain channel is types with no producer.** `packages/agent-api/src/explain.ts` defines
  `ExplainedDecision` and `ExplainProjection`; a repository-wide search finds exactly two references,
  the definition and a type re-export at `packages/agent-api/src/index.ts:170`. Contracts §4.4
  designs it; nothing constructs one.
- **`metricDeltas` is always empty**, as above.
- **The observation is per-cell, never per-node.** `packages/agent-api/src/observation.ts:127-172`
  digests knowledge into three channels per cell — `nodesKnown`, `deepestTier`, `instances`. The
  player therefore **cannot see which node is one copy from being lost**, only whether an entire cell
  is uniformly fragile. The mage block is a species × tier headcount histogram
  (`observation.ts:262-275`) with no vigor field, so the player **cannot see which mages are near
  death**. The institutions block carries a library's *depth* but never its contents.

Octalysis's claim about this drive is that creativity without feedback is not empowerment, and that
is exactly right here: the god may run any experiment on the ruleset and cannot read the result. The
game's own fantasy — *"you bless, you fund, you forbid… then you let go and see what they make of
it"* (§1) — has no *see*.

**Fitting techniques:** the honest answer is that the Octalysis vocabulary does not contain the fix.
The fix is instrumentation: a fragility readout naming which knowledge is one copy from loss, and
which mages are old. That is not a gamification technique, it is the interface the design already
promised. **I flag this as a place where the framework is being applied loosely** — I am borrowing
drive 3's name for a plain observability gap because the octagon has no cell for "the player cannot
see the state", and that omission is a real limitation of the framework, not of the game.

Note the tension to resolve rather than paper over: contracts §4.1 requires the observation be a
fixed shape with variable-length data bucketed or summarised, never raw. A per-node fragility list is
variable-length by nature. The reconcilable version is a **fixed-width digest** — e.g. a count of
one-copy nodes per cell alongside the existing three channels — which stays inside §4.1 and answers
the question. That is a proposal for `agent-interface` to price, not a decision here.

### Drive 4 — Ownership & Possession · **present, and unreadable**

*Vision §5, §8a.* Knowledge is individuated and located: `mind:`, `grimoire:`, `library:`, `palace:`.
All four location kinds are implemented, the Art of Memory's `palace` store hook carries
`lootable: false, burnable: false` in content, and prestige carries an archive forward across runs.
The 70-cell grid is a natural Collection Set and the design already treats it as one.

The qualification is drive 3's: you own a great deal you cannot enumerate. Ownership you cannot
inspect is weak ownership, and the same fixed-width digest fixes both.

### Drive 5 — Social Influence & Relatedness · **specified and unimplemented**

Reclassified per the framing correction. This is not a design gap; it is the entire PvP layer,
scheduled and unreached.

- `packages/rules-raid` is **16 files, 4,525 lines**, and is imported by **nothing** — the only
  mentions of `@mm/rules-raid` outside the package are prose comments in
  `packages/state/src/engagement.ts`.
- `packages/scenario/src/executor.ts:95` sets `REFERENCE_MECHANICS.raidEngagement: false`.
- `openPortal` (action 14) derives its candidates from a caller-supplied `portalTargets`
  (`packages/agent-api/src/candidates.ts:102`, consumed at `:322-327`). Nothing supplies it, because
  contracts §1.1 puts one universe in one simulation instance. The mask therefore clears the action
  every tick. `packages/mc-harness/src/strategies.ts:1057-1065` states this in the source itself:
  *"Action 14 is implemented and unreachable, which are different things and both are true."*
- Four §7 raid metrics report `mechanic-absent` unconditionally —
  `collectRaidLengthDistribution`, `collectInboundRaidTempoLoss`, `collectRaidInitiationCost` and
  `collectWinRateByPrimitive`, declared at `packages/mc-harness/src/metrics-collectors.ts:730, 763,
  788, 1092`.

The arbitration the vision describes is not merely planned, it is written: `CastArbiter`
(`packages/rules-raid/src/arbitration.ts:14-59`) holds an immutable `RulesetSnapshot` captured at
portal open and never recomputed, routing every legality check through one method; `portalGate`
(`portal.ts:105-128`) deliberately excludes the host's ruleset from the decision to *open*; casting
resolves legality → host `cost` hook → host `cast` hook → effects, for attacker and defender alike.
That is vision §3 and §4a implemented exactly as specified, waiting for a second universe.

**Fitting techniques:** vision §8's structure already supplies the drive-5 techniques worth having —
a shared adversary, an arbitrated matchup, and a third party who profits from every war. The
technique the octagon would suggest and that should be **rejected** is a social leaderboard: §8a
already bounds prestige precisely so the meta does not decide matches in advance, and a public
ranking works against that bound.

### Drive 6 — Scarcity & Impatience · **stubbed, and for two different reasons**

The design has four scarcities. Measured, they do not behave alike:

| scarcity | design | measured |
|---|---|---|
| **materials** | §6a — *"a universe can be knowledge-rich and unable to write any of it down"* | **real and biting.** Scribing stops at world year sixty because the stock empties (reference test) |
| **edict budget** | §4 — small, grows with worship tier | plausibly real; not separately measured |
| **teaching capacity** | §6a, §5 | moot — teaching is dead after year twenty (C2) |
| **favor** | §7 — the god's currency | **not scarce.** 9.1M–12.4M fp discarded per run (C7) |

The author's reading — "no Scarcity because nothing is ever the last copy" — is right about knowledge
and misses the sharper, cheaper failure: **the god's own currency is superabundant.** Every policy
sits at its cap. That is measurable today via `favorWasted`, it needs no new mechanic, and it means
the whole favor-pricing table in `god-cost.json` currently constrains nobody. Note the perverse
consequence W2 already spotted: a favor price is *cheapest for the idler*, who has spent nothing.

**Fitting techniques:** *Appointment Dynamics* and *Dangling* map cleanly onto the raid tempo cost
(§8) once raids fire. **Rejected:** countdown timers, energy bars, and anything that makes the player
wait in wall-clock time. Vision §13 leaves wall-clock pacing to the balance harness, and an
impatience mechanic bolted onto a game whose core loop is two-hundred-year civilisations would be a
technique chosen to fill a cell.

### Drive 7 — Unpredictability & Curiosity · **mechanically present, experientially absent**

Randomness is real and disciplined: stream-split per subsystem (contracts §6), jitter on research
(`RESEARCH_JITTER_SPAN = 128`), on teaching (`TEACHING_JITTER_SPAN = 256`), on grimoire durability,
and a per-tick mortality hazard rather than a death date rolled at birth.

And it produces nothing surprising. Five of seven strategies land on exactly **51.0** nodes.
Four of ten reference metrics — living mages, population, peak population, population change — are
blind to every strategy (`probable-strategies.md`, F4). The world is stochastic and its outcomes are
not.

**This is the drive where Octalysis's own techniques are actively wrong for this game**, and I want
to be explicit rather than diplomatic about it. Mystery boxes, random rewards, Easter eggs and
sudden-reward schedules are the standard drive-7 toolkit; every one of them is a poor fit here.
Determinism is a hard constraint from live PvP, the audience is people who like knowledge
management, and a random reward is the exact opposite of the epistemic pleasure this game is selling.

The right lever is **epistemic** uncertainty, not aleatory: the player not knowing, rather than the
world not being determined. Which is drive 3's observability gap again, seen from the other side —
and the fact that two of Octalysis's eight "core drives" collapse onto one mechanism in this game is
a fair criticism of the framework's claim that the eight are independent.

### Drive 8 — Loss & Avoidance · **absent by defect, and the defect is deeper than "55 copies"**

The vision is unambiguous. §5: *"Loss — the last instance is destroyed. The node leaves the
universe… This is what makes losing hurt in a way that losing units never does."* §8: *"casualties
are permanent. Knowledge whose last instance dies with a mage or burns in a library is lost."*

The build, per C2 and C3:

1. A researched instance is born at 256, floors at 128–384 depending on species, and **cannot reach
   zero** unless the god forbids its cell.
2. A written instance has **no destruction path whatsoever** — `destroyGrimoire` and `destroyLibrary`
   have no production caller; `durability` is written once and read only by unreachable raid code.
3. Library burning *is* implemented, in `packages/rules-raid/src/consequences.ts:181-233`, with a
   per-book roll against `min(durability, grimoire-burn-resist-cap)` deciding looted versus burned —
   and it is unreachable.

So the only loss a player can currently cause or suffer is a mage dying with mind-copies, or the
player's own interdiction. **Loss & Avoidance is pointed the wrong way: you do not fear loss, you
administer it.** The dwarf's second cross-reference, the gnome's cheap rediscovery, the 3× rediscovery
floor (`packages/primitives/src/rediscovery.ts:104`) and grimoire durability by species are all
insurance against a fire that cannot happen — which is `hard-magic.md`'s own conclusion, now with the
mechanism named.

**Fitting techniques:** the design already contains the right one and it is unreached. Nothing needs
inventing; W8 needs to land.

### The two axes

**White Hat (1, 2, 3) versus Black Hat (6, 7, 8).**

The game is White-Hat-dominant by construction — creation, mastery, meaning — and that is *correct*
for its audience and should not be "corrected". But the Black Hat side is not merely weak; drives 6
and 8 trace to the **same** missing destruction channel and drive 7 to the same missing
observability, so the octagon's eight cells resolve to about three independent causes here.

Chou's structural claim about this axis is that White Hat alone produces engagement without urgency —
the player enjoys the system and has no reason to act *now*. The measured signature of exactly that
is "waiting is free", an idle bot winning 100% of runs, and `ascensionRate` at 0.79. **This is the one
place where the framework earns its keep**: it predicted the shape of the defect the sweeps found, in
advance of the sweeps, from the design alone. That is worth saying because most of the rest of this
analysis is the framework labelling things the measurements already knew.

The author's hypothesis — that the measured defects *are* the missing Black Hat drives — holds up,
with one amendment: they are not three missing drives, they are two missing mechanisms (a reachable
destruction channel, and observability) that Octalysis happens to score in three cells.

**Left Brain / extrinsic (2, 4, 6) versus Right Brain / intrinsic (3, 5, 7).**

| | drive | state |
|---|---|---|
| Left | 2 Accomplishment | stubbed — the reward is real, the challenge is not |
| Left | 4 Ownership | present, unreadable |
| Left | 6 Scarcity | stubbed — favor superabundant, materials real |
| Right | 3 Creativity & Feedback | half — creativity strong, feedback absent |
| Right | 5 Relatedness | specified and unimplemented |
| Right | 7 Curiosity | mechanically present, experientially absent |

The positioning — *"global knowledge management, the preservation of rare skills, and the production
of talent"* — is a **Right Brain pitch**. It promises intrinsic satisfactions: creative rule-setting,
relatedness through rivalry, curiosity about what a civilisation will do. The build currently
delivers mostly Left Brain counters — tiers, eras, node totals, a terminal flag. Every Right Brain
drive is gated behind exactly two things: raids landing (W8) and the observation exposing fragility.

### Where I think Octalysis is the wrong tool

Stated plainly, because a framework applied uncritically is worse than none:

1. **It is a checklist, not a theory.** It predicts no magnitudes, names no falsification criterion,
   and cannot say whether a drive is *sufficiently* served. Every quantitative claim in this document
   comes from the sweeps, not the octagon.
2. **The eight drives are not independent here.** 6 and 8 are one mechanism; 3 and 7 are another.
   Scoring them as eight cells overstates how many problems there are and understates how coupled
   they are.
3. **The octagon tempts you to fill cells.** Explicitly declined in this document: trophy shelves,
   badge walls, daily-login streaks, random-reward boxes, social leaderboards, countdown timers. Each
   would fill a cell and each conflicts with either the determinism constraint, §8a's prestige bound,
   or the audience.
4. **It has no cell for observability**, which on the evidence is this build's largest experiential
   defect after the missing loss channel.
5. **It measures felt experience, and nobody has felt this game yet.** Vision §9 makes that
   deliberate. This whole analysis should be re-run after the first human playtests and will probably
   move.

---

## Part 2 — The four open questions

### Q1 — How much should raiding accelerate ascension?

**Vision status:** §8 is silent on the price. §8a bounds the band. Two things the vision and W3
*already* decide, which narrow the answer before any option is considered:

- **Contracts §7 already specifies how to price it — by comparison, not by a number.**
  `raidInitiationCost` is defined as *"tempo an attacker forgoes per raid, for comparison against
  what they gain"*, with denominator *"raids initiated"* (`metric-constants.md`). The design already
  says the raid bonus is set by making a measured inequality come out positive.
- **W3 already rejects the two most obvious levers.** `origin/w3/ascension-routes` §5 mechanism 5
  makes payout parity a design rule: declaration is priced identically for every route and
  `prestigeEarned` gains *no per-route term*, explicitly *"so that a later tuner does not reach for
  one as an obvious knob"*. So *"a bonus to raiding"* may **not** be a per-route prestige bonus or a
  cheaper terminal price.

**The structural problem to be solved.** Vision §8 states that raiding costs tempo for *both* sides
and that *"a third party profits from every war. This is the intended shape."* That is a free-rider
structure: every universe would prefer some *other* universe to do the suppressing. Left alone it has
a no-raid equilibrium, which is precisely what the author's second sentence forbids — *"if there are
many universes they shouldn't survive to ascension, because someone should raid them."* So the bonus
is not decoration; it is the correction that makes the free-rider equilibrium unstable.

Write `L` for the world ticks an attacker forgoes per raid (`raidInitiationCost`) and `G` for what
she gains, in the same units. Raiding is chosen only when `G > L`. The griefing ceiling is separate
and comes from §8: `inboundRaidTempoLoss` bounds how much of a defender's life may be spent frozen.

**Option A — break-even plus a fixed margin.** Author `G ≈ L × (1 + m)` with `m` small, say 25%,
tuned by moving loot yields. *Consequence:* raiding is weakly profitable, so it happens occasionally
and self-limits. Safest against griefing; easiest to tune; and it almost certainly **fails the
author's second sentence** — a 25% edge does not make many universes fail to reach ascension.

**Option B — the gain scales with the defender's stock.** What a raid takes is proportional to what
the defender has: nodes looted, library depth burned. *Consequence:* the leader is always the most
profitable target, so raiding becomes a decentralised anti-snowball mechanism doing work that §6a and
§7 already demand of the balance harness (`worshipSnowball` ≤ 0.35, `capitalSnowball` the same over
library depth — and `capitalSnowball` already measures **0.3498**, a hair under threshold).
Acceleration of the raider's ascension is emergent — she gains nodes and denies them — rather than
authored as a terminal bonus, which keeps W3's payout parity intact. *Risk:* concentrated griefing on
whoever leads, which is exactly the `inboundRaidTempoLoss` case §8 says must be bounded and not
assumed away.

**Option C — raiding shortens the ascension clock directly.** A successful raid decrements a sustain
counter or an era requirement. *Consequence:* literally "ascend much faster", and trivially tunable.
*Risk:* it prices the terminal directly, which is the lever W3 §5.5 rejects wearing a different hat,
and it is the option most likely to make a raid route exceed W3's 60% share gate.

**Recommendation: B, with A's inequality as a floor constraint and C declined.** B is the only option
that satisfies both of the author's sentences at once, it does anti-snowball work the design already
requires elsewhere, and it leaves the terminal untouched so W3's five-route differentiation survives.
A's `G > L` becomes a content-load assertion rather than a mechanic. C should be declined explicitly
so a later tuner does not reach for it.

**The measurement that would show this failing** — all four already exist in the §7 registry:

| observation | what it falsifies |
|---|---|
| `raidInitiationCost` ≥ the median measured gain | raiding is unprofitable; raid rate → 0; the author's first sentence fails |
| `inboundRaidTempoLoss` over its threshold | the griefing guard fails; §8 calls this *"a live-PvP death sentence dressed as a strategic cost"* |
| `ascensionRate` leaves 0.05–0.20 once raids fire | the pricing broke §8a's band |
| a raid-associated route's `share` > 0.60 in `ascensionRateByPath` | B has become C by accident |

**Dependencies: W8 (blocking) and W6 (blocking).** Nothing here is measurable until `portalTargets`
is supplied, and the price attaches to predicates W6 is redesigning. W7 moves the denominator, since
a working research loop changes what a looted node is worth.

### Q2 — Is ~55 copies per node a magnitude problem or a structural one?

**Structural — and the structure is not the one the question assumes.** The campaign asks whether
faster decay, fewer mages, or only raids-that-burn would move `libraryDependence` off zero. On the
traced mechanism, **the first two cannot, in principle, and the third is not the only thing that
can.**

**Where 55 copies actually comes from.** Decomposing the measured passive-control run — 2,922
instances, 51 nodes, 71.5 living mages, 1,156 grimoires, library depth 2:

- 1,156 grimoires spread over **2 distinct nodes** (`hard-magic.md`: every scribe copies the cheapest
  thing available), so the books are not what makes nodes redundant.
- ~1,766 mind instances over ~51 nodes and 71.5 mages: **24.7 nodes per mage**, **34.6 mind copies
  per node** — the average node sits in **48%** of all living minds.

Copies per node is therefore ≈ *living mages × research saturation*, and research saturation is high
because 51 nodes is a small set relative to what a mage researches in a lifetime. It is not a
birth–death balance between creation and destruction, because on this build there is **almost no
destruction**:

- **Faster decay cannot work.** Mind instances floor at `mul(256, retention)` ≥ 128 and never reach
  zero unless the god forbids the cell (C2). The decay rate is irrelevant to a floor.
- **Fewer mages cannot work.** Copies scale with mage count, but so does research — you lower the
  numerator and the node set's growth together, and land near the same saturation.
- **Raids that burn work, but only on the 2 nodes anything is written about**, until W7 gives
  libraries depth.

**The lever that does work is `K`, the size of the permitted node set — which the god already
controls.** At a fixed instance budget, mean copies and the distance from equilibrium down to a last
copy fall together:

| nodes known `K` | mean copies | excursion to the last copy |
|---:|---:|---:|
| 51 (passive) | 57.3 | 7.44 sd |
| 96 (W2's proposed canon breadth) | 30.4 | 5.34 sd |
| 182 (`breadth`, measured) | 16.1 | 3.76 sd |
| 273 (`permissive-breadth`, measured) | 10.7 | 2.97 sd |

A seven-sigma excursion never happens. A three-sigma one happens. **Permitting more magic is already
most of the loss channel**, which is a satisfying result because it makes vision §2's first pillar —
*"rules-setting is the core verb"* — the thing that also sets your fragility. Breadth is not merely
"know more"; it is "know more, more thinly, and be losable".

**Three options, then.**

**Option A — do nothing structural; let W7 and W8 raise `K` and add burning.** *Consequence:*
fragility arrives as a side effect of breadth and of raids. Cheapest; entirely inside work already in
flight. *Risk:* leaves C6's false-pass problem in place, and leaves written knowledge immortal.

**Option B — give written knowledge a destruction path.** Grimoire durability is authored, rolled per
book from species `scribeAffinity`, and read by nothing reachable (C3). Either an ambient decay, or
`destroyLibrary` gaining a caller on a materials-upkeep shortfall — `consumeMaterials` is already
invoked with `libraryUpkeep: 0` (`packages/coordination/src/world-step.ts:580`), so the seam exists.
*Consequence:* makes `scribeAffinity` and *"it's dwarven, it'll outlive us both"* mechanical, and does
so on a demographic clock rather than an adversarial one, so it works in single-player. *Risk:* a new
loss channel is a new balance surface, and `hard-magic.md` argues durability should come **after**
destruction is possible, not with it.

**Option C — lower the mastery floor below the creation mastery, so neglected knowledge can actually
be forgotten.** Today `masteryFloor` for a non-dormant cell is `mul(256, retention)`, which is 256 for
a human — exactly `DEFAULT_INITIAL_MASTERY`. The design sits precisely on the knife edge where
nothing decays away. *Consequence:* the direct expression of the vision's *"they die — sometimes
taking the only copy of something irreplaceable"*, and it makes `retention` load-bearing at last.
*Risk:* `decay.ts:70-73` says the zero floor is *"the entire difference between knowledge a
civilization merely neglects and knowledge its god has forbidden"* — this option deliberately erases
that distinction, so it is a **rule change and must be the author's**, not an agent's.

**Recommendation: A now, B next, C only if the author wants neglect to be lossy.** A is free and
already scheduled. B is the smallest change that makes the species table load-bearing and is where
`hard-magic.md` already points. C is a genuine design decision with a stated rationale on the other
side, and this document raises it rather than taking it.

**And restate D5.** Per C6, `libraryDependence` leaving zero does not demonstrate that knowledge can
be lost — acquisition flow alone produces 2–3% with no losses at all. Recommend D5 be measured on
**`knowledgeHalfLife`** (§7, implemented, Kaplan–Meier, right-censored) and on **`eraNodesLost`**,
both of which count observed losses rather than standing single-copy stock.

**The measurement that would show this proposal failing:** if `knowledgeHalfLife` remains `censored`
— i.e. half of a cohort is never lost within a run — after W7 and W8 land and `K` exceeds 200, then
raising `K` did not create real fragility and the answer was magnitude after all. Equally: if the
per-strategy spread in nodes known does not widen (`hard-magic.md`'s own stated disproof), the loop
is implemented and not load-bearing.

**Dependencies: W7 (raises `K` and gives libraries depth beyond 2 nodes) and W8 (supplies burning).**
Both move every number in this section.

### Q3 — What is the right structure for the strategy space of a persistent multiplayer game, and how should it be evaluated?

**Vision status: §3 already supplies the mechanism; the evaluation method is silent.**

**Non-transitivity is already designed in, and the vision says where it comes from.** §3, The Portal
Rule, is the load-bearing mechanic: *"the host universe's ruleset governs all magic cast inside it,
for both attacker and defender"*, and *"permitting something arms your defense and arms anyone who
invades you and happens to know it."* That is a matchup matrix by construction — your payoff depends
on the interaction of your ruleset with your opponent's knowledge, and `A` raiding `B` is a
structurally different game from `B` raiding `A`. The design does not need a new source of cyclicity.
It has one, and it is the pillar.

Two further axes exist and are unmeasured: species composition (the campaign's D7 already tests it)
and **tradition** (C9 — one authored number separates a working teaching graph from a dead one, and
no sweep varies it).

**What the literature supports, and what it does not.** I had a survey done of the 2018–2021
multi-agent evaluation line. Reported honestly, including the parts that do not help:

- **Spinning-top geometry** (Czarnecki, Gidel, Tracey, Tuyls, Omidshafiei, Balduzzi, Jaderberg,
  *Real World Games Look Like Spinning Tops*, arXiv:2004.09468, 2020) proposes a geometry in which
  *"the upright axis represent[s] transitive strength, and the radial axis, which corresponds to the
  number of cycles that exist at a particular transitive strength, represent[s] the non-transitive
  dimension"*, over **"nine real world two-player zero-sum symmetric games"** plus AlphaStar
  populations. No falsification was located. **But the scope quoted there is the paper's own, and
  this game is not two-player, not zero-sum, and not symmetric** — which is the whole reason Option A
  below is recommended over Option B.

  *A related-work caution, corrected during review.* Sanjaya, Wang and Yang (*Measuring the
  Non-Transitivity in Chess*, arXiv:2110.11737, 2021) is frequently cited as replicating the
  spinning-top's "cyclicity peaks at mediocre skill" claim. Its abstract supports the measurement —
  *"over one billion match data from Lichess and FICS"* — but states the finding differently: *"high
  degrees of non-transitivity tend to prevent human players from making progress on their Elo rating,
  whereas progressions are easier to make at the level of ratings where the degree of non-transitivity
  is lower."* That is a claim about non-transitivity impeding progression, not about where cyclicity
  peaks. **Treat the spinning-top geometry as unreplicated until someone reads that paper's full
  text**; this document does not rest any recommendation on it.
- **PSRO / rectified-Nash gamescapes** (Lanctot et al. NeurIPS 2017; Balduzzi et al. ICML 2019) — the
  ICML paper's title states the symmetric zero-sum scope. Useful negative result worth knowing:
  McAleer et al.'s P2SRO (NeurIPS 2020) reports that rectified PSRO and DCH **fail to converge even
  in small games**, so this sub-field does test its own claims.
- **α-Rank** (Omidshafiei et al., *Scientific Reports* 2019) and plain **response-graph analysis**
  are the best structural fit: neither requires symmetry or zero-sum, and both handle N populations.
  Two caveats, both from the same research group's own follow-ups: the original polynomial-scalability
  claim was walked back within a year (Yang et al., α^α-Rank, arXiv:1909.11628 — the transition
  matrix is exponential in joint profiles), and the base method assumes **noise-free** payoffs
  (Rowland et al., NeurIPS 2019, arXiv:1909.09849, is the paper that opens this and does not close it
  for asymmetric general-sum games).
- **Nash averaging** (Balduzzi, Tuyls, Pérolat, Graepel, NeurIPS 2018) — its agent-vs-task framing is
  the closest published precedent for "a third party profits without fighting". I could not verify its
  noise-handling from primary text and am flagging that rather than asserting it.
- **Quality-diversity for balance** (the Fontaine/Togelius/Nikolaidis/Hoover Hearthstone and Mario
  line) is real but narrow — one or two games per line, one author cluster. Documented failure modes
  exist for CMA-ME (abandons the objective for exploration; struggles on flat landscapes; poor with
  low-resolution archives) but they are general-QD failure modes, not balance-specific ones.

**The honest summary is that no published method has been tested on this combination**: asymmetric,
host-determined rules; non-zero-sum with a free-riding third party; and a combinatorially huge,
slowly-constructed strategy space. Every method above excludes at least one of those in its own
stated scope.

**Three options for how to evaluate.**

**Option A — an asymmetric matchup matrix with no solution concept.** Report the win-rate matrix over
a curated pool, indexed by (attacker strategy, host strategy), and count **transitivity violations**
— 3-cycles where A beats B beats C beats A. Sawyer & Frey (arXiv:2009.09990, 2020) use exactly this
measure on 60,000+ professional basketball games across a century, which is a useful precedent
because it is a real accumulating-advantage system. *Consequence:* assumption-free — it requires
nothing the game violates — directly falsifiable, and cheap: W3 already puts a route histogram on
`tournament.ts`. *Limitation:* it describes rather than solves; it will not rank strategies.

**Option B — α-Rank / response-graph over a curated empirical game.** Fits the stated assumptions
(asymmetric, general-sum, multi-population) and produces a ranking. *Consequence:* a principled
evaluation the literature supports on paper. *Risk:* both known caveats bite here — the strategy set
is not small, and Monte Carlo payoffs are noisy, which is precisely the case the base method assumes
away.

**Option C — PSRO-style incremental population growth.** Fits the "not pre-enumerable" property,
which is the one thing about this game that PSRO was actually built for. *Risk:* base PSRO is
symmetric zero-sum, this game is neither, and specific variants have published non-convergence.

**Recommendation: A now, B later, C declined.** A costs almost nothing, assumes nothing the game
violates, and answers the question the design actually asks — *does the Portal Rule produce
matchups?* B is the right destination once the pool is large enough and a noise treatment has been
chosen; it should not be adopted before then, because adopting a solution concept whose assumptions
the game breaks produces a confident ranking that means nothing. C should be declined explicitly.

**And measure the tradition axis first, because it is free.** Before any of this: run the existing
eight-strategy sweep across the three shipped traditions. Per C9 the acquire hook already makes them
mechanically inequivalent, and if that produces a different strategy ranking per tradition, D7's
sibling claim is established at the cost of a sweep and no code.

**The measurement that would show this failing:** if the (attacker × host) win-rate matrix over the
curated pool contains **zero 3-cycles**, at an `n` where a cycle would be detectable above sampling
noise, then the Portal Rule is not producing matchups and the game's non-transitivity is aspirational.
That is a single, cheap, decisive number.

**Dependencies: W8 (blocking).** There is no matchup matrix without raids. The tradition sweep is
**not** blocked and could run today.

### Q4 — Is a bounded prestige cap sufficient to stop the meta deciding matches in advance?

**Vision status:** §8a states the failure mode — *"Prestige must not compound without bound across
runs, or the meta-game decides matches before they begin — a live-PvP death sentence."* The pricing
is authored in `packages/content/data/god-constant.json` and the vision does not assess sufficiency.

**The design is already stronger than "a bounded cap".** It has **two dampers in series**, and the
second is doing most of the work:

1. **A convergent recurrence.** `prestige' = prestige × retention + earned`, with
   `prestige-retention` 768 (75%) and `prestige-earn-max` 2048, so `prestige-cap` 8192 is
   `earn-max ÷ (1 − retention)` — an analytic limit, not a clamp. The loader asserts the identity
   (`metric-constants.md`), so a retune that breaks it fails the load.
2. **A saturating prestige→legacy conversion.** `legacy-cap` 1024 and `legacy-half` 2048. Its own
   gloss states the effect: *"Half the maximum prestige already buys 83% of the attainable head
   start, so the back half of the prestige range is nearly worthless."*

Working the arithmetic through, at steady state a player who always earns `e` sits at `4e`:

| player | steady prestige | legacy | head start (25% of baseline × legacy/cap) |
|---|---:|---:|---:|
| perfect ascender | 8192 (the cap) | 819 | 20.0% |
| median ascender | ~4096 | 683 | 16.7% |
| perpetual stagnator (`prestige-base-stagnated` 128) | 512 | 205 | 5.0% |
| fresh universe | 0 | 0 | 0% |

**So among established players the spread is about 1.2 : 1**, and veteran-versus-veteran is nearly
flat. That is a well-built damper and it deserves saying.

**Three residual risks, and only the second is serious.**

- **The metric measures the wrong population.** `prestigeAdvantage` is defined as *"win rate of a
  high-prestige universe vs. a fresh one"*, `mirrored: true`, threshold 0.6, and currently reports
  `no-observations` (`probable-strategies.md` F5). Read against the table above, that arm measures the
  **newcomer gap** — the largest gap in the distribution — and says nothing about whether the meta
  decides matches among established players, who are all compressed near the cap. A passing
  `prestigeAdvantage` would therefore not disprove §8a's fear in the population that matters.
- **The cap bounds the input, not the output.** §6a names two compounding loops that feed each other
  and says *"that is exactly the shape that produces runaway leaders."* A 20% head start at
  `legacy-reference-tick` 120 is an *initial condition* fed into two compounding loops running to tick
  2400. Nothing in the prestige model bounds what that becomes. `capitalSnowball` measured **0.3498**
  against a 0.35 threshold, from a *zero-prestige* population — which is the leading indicator that
  the loop gain is not small. **This is the real question, and it is empirical, not analytic.**
- **The shipped head start is currently larger than intended.** `legacy-baseline-favor` is 20480 with
  the gloss *"Placeholder for the median unaided universe's favor pool… until then it is the pool
  cap, which is the honest upper bound."* The head start is 25% of an over-estimate. Honest, labelled,
  and worth fixing before any sufficiency claim.

**Where the vision already answered a question I was about to propose on:** whether prestige should be
placed at risk. It already is — `legacy-archive-nodes`' gloss says the seeded instances are *"placed
in a library where they are lootable and burnable like any other"*, and `legacy-archive-max-tier` 3
exists because *"a legacy that could seed the summit would be prestige buying the ascension
condition."* Carried-forward advantage is already destructible by exactly the mechanism the game is
about. That is a better answer than anything I would have proposed.

**Three options.**

**Option A — change nothing; run the measurement that has never been run.** `prestigeAdvantage` is
defined, mirrored, thresholded, and simply unexecuted because no sweep seeds a high-prestige universe.
*Consequence:* costs a sweep and the placeholder fix. *Risk:* the metric as scoped answers the
newcomer question, not the sufficiency question.

**Option B — A, plus a second arm at median prestige.** Measure cap-versus-median alongside
cap-versus-fresh. *Consequence:* separates "newcomers are behind" (an onboarding problem, real but
different) from "the meta decides matches" (§8a's actual fear). *Risk:* one more sweep arm; the
threshold for the new arm is `god-agency`'s to set, per §7's ownership split.

**Option C — add a third damper on the output side.** *Consequence:* would bound the compounded
advantage rather than the initial condition. *Risk:* premature — it treats a symptom nobody has
measured, and §8a's own constraint is about the *outcome*, which A and B are the way to see.

**Recommendation: B.** The analysis says the two existing dampers are probably sufficient
veteran-versus-veteran and were never the risk; the risk is loop gain, and loop gain is measured, not
argued. Fix the `legacy-baseline-favor` placeholder first, or the first measurement will be taken
against an inflated head start.

**The measurement that would show this failing:** `prestigeAdvantage` at or above **0.6** on either
arm; or the cap-versus-median arm exceeding the cap-versus-fresh arm's *distance from 0.5* by more
than sampling noise, which would say the advantage is compounding rather than saturating; or
`capitalSnowball` crossing **0.35** in a prestige-seeded population when it does not in a fresh one.

**A caution from the literature, honestly labelled.** Sawyer & Frey (*Super-teams or fair leagues?
Parity policies by powerful regulators don't prevent capture*, arXiv:2009.09990, 2020) analyse
*"outcomes of over 60,000 games from four professional basketball leagues"* spanning more than a
century, computing *"the evolving rate of transitivity violations (A>B, B>C, but C>A) to measure the
ability of leagues to maintain parity between teams"*, and find the sport has become **less**
competitive over time despite regulation. That is
sports-league governance, not video-game progression, and it is a caution rather than a result about
this design — but the shape of the caution is exactly right: a bound written into the rules is not the
same as a bound on outcomes. Beyond that, the survey found **no on-point rigorous literature** on
whether bounded carry-forward keeps individual matches undecided, and no matched-pair or handicap
design in the game literature for separating a persistent-asset advantage from a skill advantage.
This is open territory; the design cannot lean on an established result, and `prestigeAdvantage`'s
`mirrored: true` is already a better instrument than the literature offers.

**Dependencies: W8 (blocking for any raid-based arm) and `god-agency` for thresholds.** The
world-scale arm — does a prestige-seeded universe out-develop a fresh one — is **not** blocked and
could run once a sweep seeds prestige.

---

## Part 3 — Where the vision already had the answer

Recorded because these are the places the answer is the spec's and not this document's:

| question I was going to propose on | where it is already answered |
|---|---|
| How do we know the raid bonus is priced right? | contracts §7: `raidInitiationCost` is *"tempo an attacker forgoes per raid, for comparison against what they gain"* |
| Should raiding pay extra prestige, or a cheaper terminal? | No. W3 `ascension-routes` §5 mechanism 5 makes payout parity a rule, explicitly to stop a later tuner reaching for it |
| Should prestige be destructible? | Already is. `legacy-archive-nodes` seeds into a library *"where they are lootable and burnable like any other"* |
| Is the prestige cap arbitrary? | No. It is `earn-max ÷ (1 − retention)`, and the loader asserts the identity |
| Should a burned library hurt more than the books? | §6a: *"burning a rival's library is not just a loss of stored spells, it is an attack on their rate of future production"* |
| Is griefing a risk? | §8 names it, forbids assuming it away, and requires inbound tempo loss as a first-class metric |
| Should the god see per-mage detail? | §4.1 fixes the observation shape; §6 gives the four-slot institutions constraint that decided emergent specialisation. Any fragility readout must be fixed-width |
| Should defeat be the opposite of ascension? | §8a: no — *"a universe that is raided to ruin does not 'lose' — it stagnates"* |

---

## Part 4 — What the measured data contradicts

Six places where the record and the design disagree. Each is a claim in a document, checked:

1. **"Every species trait is inert"** (`campaign-plan.md` L32, `hard-magic.md`) — false as stated. All
   eight are read; see C1. The accurate claim is that they cannot express themselves in an outcome.
2. **"`libraryDependence` sits at 0"** (`campaign-plan.md` L31) — true of the passive control, false
   of `breadth` (3%) and `canon` (2%); see C5.
3. **Vision §5: "Teaching — mind → mind. Fast."** — dead after world year twenty in the reference
   universe, because research creates below the teach threshold and nothing raises mastery; see C2.
   The repository's own reference test reports this.
4. **Vision §6: "laborers build universities"** — they do not. `advanceConstruction` has no caller and
   the god's favor is the only thing that moves `buildProgress`; see C8.
5. **Vision §5: "Loss — the last instance is destroyed"** — written knowledge has no reachable
   destruction path at all, and mind knowledge floors above zero. The player's own interdiction is the
   only loss mechanism in the reachable game; see C2, C3.
6. **The archivist's 4,096 grimoires** — that is `OBSERVATION_SCALE.grimoireCount`, the saturation
   ceiling, not a count; see C4.

And one place where the **framework** was right in advance: Octalysis' White-Hat/Black-Hat structural
claim — that White Hat alone produces engagement without urgency — predicted the exact shape of the
defect the sweeps later found. That is the one prediction in this document the octagon earned rather
than relabelled.

---

## Part 5 — Dependency summary

| proposal | W6 predicates | W7 research loop | W8 raids | measurable today? |
|---|---|---|---|---|
| Q1 raid pricing (Option B) | **blocking** | moves the denominator | **blocking** | no |
| Q2 fragility via `K` (Option A) | — | **blocking** | **blocking** | no |
| Q2 written-knowledge decay (Option B) | — | changes what a library holds | independent | partly |
| Q2 restate D5 on `knowledgeHalfLife` | — | — | — | **yes** |
| Q3 matchup matrix + cycle count (Option A) | — | — | **blocking** | no |
| Q3 tradition sweep (C9) | — | — | — | **yes** |
| Q4 second prestige arm (Option B) | — | — | blocking for raid arms only | **partly** |
| C4 propagate `CensusSample.saturated` | — | — | — | **yes** |
| Drive 3 fixed-width fragility digest | — | — | — | **yes** |

Four of these need nothing that is in flight: restating D5, sweeping the tradition axis, propagating
the saturation flag, and giving the observation a fragility digest. The tradition sweep is the one I
would run first, because it costs a sweep and no code and it could double the game's measured axes of
play.
