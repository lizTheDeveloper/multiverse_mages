<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W31 — Formal design language for game economies. Synthesis.

Verdict up front: **the formal language exists, it is Machinations, and it is a better fit for this
game than for most games** — because its most clearly documented limitation is that it cannot model
space or continuous physics, and this project has constitutionally excluded both. What is *thin* is
chain-depth guidance (no designer states a number) and economy instrumentation (no academic literature
on conservation checks at all). Sources below; verification status marked on everything.

**Epistemic tiers used below:** [PR] peer-reviewed or academic press; [DEV] developer-stated (studio
blog, dev diary, designer interview); [PE] practitioner essay — well-regarded, not peer-reviewed;
[WIKI] community wiki count; [UNVER] could not verify.

## THE FIVE IDEAS, UP FRONT
1. **`shortage` semantics** [PR] — a pool that goes negative absorbs all inflow before anything can pull
   from it. The library debt.
2. **Source/sink power matching** [PE] — a scaling source needs a scaling sink; the diagnostic is
   *unspent pools*, never aggregate production. The favor overflow.
3. **Every engine needs a friction, and a converter engine deadlocks** [PR] — the knowledge-capital loop
   is a converter engine; its documented remedy is a weak static engine. INV-29's missing mechanism.
4. **The supply-line term in an autonomous producer's decision rule** [PR] — a rule that ignores
   transfers already in flight is the canonical oscillation generator. Occupation reallocation.
5. **Behaviour-mode classification plus extreme-condition tests** [PR] — every metric we have is
   numerical, so an oscillating run and a settled run report the same median.

Each is expanded with its mapping in §6.

## Sources I read directly, in full text
- **Dormans, J. (2012). _Engineering Emergence: Applied Theory for Game Design_.** PhD thesis,
  Universiteit van Amsterdam, ILLC DS-2012-12, ISBN 978-94-6190-752-3, CC BY-NC 3.0 NL.
  https://eprints.illc.uva.nl/id/eprint/2118/1/DS-2012-12.text.pdf — 302pp, downloaded, text-extracted,
  read §3.8–3.9, §4.3–4.11, §8.5–8.6, Appendix B complete, Tables 4.1/4.2 read as page images.
- **Dormans, J. (2011). "Simulating Mechanics to Study Emergence in Games."** AAAI WS-11-19.
  https://cdn.aaai.org/ojs/12477/12477-52-16005-1-2-20201228.pdf — read all 7 pages as images.
- **Rupp, F. & Eckert, K. (2024). "GEEvo: Game Economy Generation and Balancing with Evolutionary
  Algorithms."** arXiv:2404.18574, 29 Apr 2024 — abstract verified by me directly.

Everything attributed below to Adams & Dormans (2012) the *book*, to Sterman, to Cook, to Johnson, to
Wube, or to Paradox came via subagents; I mark each with how well it was verified.

---
# 1. THE VOCABULARY

## 1.1 Nodes
All definitions verbatim from Dormans 2012 (thesis) / Dormans 2011 (AAAI) unless noted.

| Node | Glyph | Definition |
|---|---|---|
| **Pool** | open circle | "A pool collects resources that flow into it." The only node that accumulates. |
| **Source** | triangle up | "elements that produce resources". Functions "just like a Pool without inputs that starts with a sufficiently large (or even infinite) supply." |
| **Drain** | triangle down | "elements that consume resources." "A Resource that goes into a Drain is permanently removed from a game's economy." |
| **Converter** | line over ▷ | "Converters convert one resource into another... Converters act exactly as a drain that triggers a source, consuming one resource to produce another." |
| **Trader** | line over ◁▷ | "Nodes that cause Resources to change ownership when fired." |
| **Gate** | diamond | "In contrast to a pool a gate does not collect resources, instead it immediately redistributes them." |
| **Delay / Queue** | — | Delay: every arriving resource gets its own independent N-step countdown, many in flight at once. Queue: strictly one resource at a time. (machinations.io docs, via subagent) |
| **Register** | — | Computes a value from multiple inputs; passive (formula) or interactive. (modern tool only) |
| **End condition** | — | Halts the run when a condition is met; checked every time step. |

**The four distinctions that actually matter:**

- **Converter vs Trader.** Verbatim, thesis §4.5 p.82: *"Using a converter resources are actually
  consumed and produced, and therefore the total number of resources in the game might change. Whereas
  with a trader the number of resources always stays the same."* A converter changes resource **type**
  and breaks conservation; a trader changes **owner** and preserves it. Dormans notes most people
  misclassify: a CRPG merchant with infinite stock is a **converter** wearing a trader's UI.
- **Gate vs Drain.** A drain **destroys** unconditionally and accumulates nothing. A gate **accumulates
  nothing either** but destroys only as a *side effect*: "when no condition is met, [the resource flows]
  to the destruction of the resource." A drain is a policy; a gate is a switch that happens to leak.
- **Trigger vs Activator.** A **trigger** (label `*`) is an *event*: "Triggers fire when all the inputs
  of its source node become satisfied: when each input passed the number of resources to the node as
  indicated by its flow rate." An **activator** (label is a condition — `==0`, `<3`, `>=4`, `3-6`) is a
  *standing predicate*: "If the state of the elements where the activator originates meets this
  condition then the element where the activator ends can fire, otherwise it is inhibited." Trigger =
  push. Activator = permission. This is the pair everyone conflates.
- **Delay vs Queue.** Parallel independent timers vs a serial FIFO. Choosing wrong is how you get
  either an unbounded work-in-progress stock or an unintended bottleneck.

Dormans is explicit that source/drain/converter/trader are **shorthand, not primitives**: "In theory,
a pool or combination of pools and gates can fulfill all these functions, but for clarity it is useful
to introduce special nodes." The four come from Adams & Rollings (2007) *Fundamentals of Game Design*,
who named them the **four economic functions**; Dormans' contribution was making them executable.

## 1.2 Connections
**Resource connections** (solid arrows): label = flow rate; unlabelled = 1; `all` = unlimited.

**State connections** (dotted arrows) — exactly four subtypes, thesis §4.3:

1. **Label modifier** — node → the *label* of a connection. `L(t+1) = L(t) + Σ(Mᵢ·ΔSᵢ)`. Takes effect
   on the subsequent time step.
2. **Node modifier** — node → node, changing the *resource count* on the target.
   `N(t+1) = N(t) + Σ(Mᵢ·ΔSᵢ)`. Fractional labels (`+1/3`, `-2/4`) allowed, rounded down. Dormans calls
   these "syntactic sugar" for a longer construction.
3. **Trigger** (`*`) — see above.
4. **Activator** (condition label) — see above.

The modern tool adds a **reverse trigger** (`!`), absent from the 2012 thesis: it fires when a node
**fails** to pull all the resources its inputs call for. That is a **starvation signal as a first-class
primitive** — see §5.

## 1.3 Timing and firing — the part everyone gets wrong
**Activation modes** (verbatim, Adams & Dormans 2012 Appendix C, via subagent; consistent with thesis
§4.9 which I read directly):
- **Passive** — "does not fire unless triggered by an external process."
- **Interactive** — "can be clicked by a player to make it fire."
- **Automatic** — "fires every time step." (marked `*`)
- **Starting** — "fires only once, when the diagram first begins to run." (marked `s`)
Gates have only the first three; there is no starting gate.

**Pull/push and all-or-none** (thesis §4.9, read directly):
- Default **pull**: "a node pulls as much resources as it can, up to the flow rates of its inputs. **If
  not all resources are available, it still pulls those that are.**"
- **Pull-all-or-none** (`&`): "when not all resources are available, **none are pulled**."
- Same two modes for **push**; a pushing node in all-or-none mode "only sends resources when it can
  supply all of its outputs."

This one distinction is the entire formal content of "what happens when four claimants want more
materials than exist," and it is a two-value switch per claimant, not a policy essay.

**Rate determinability** — Table 4.2 lists deterministic / dice / skill / multiplayer-dynamic /
strategy icons. Critical caveat, verbatim from the book via subagent: *"the difference between these
symbols is only cosmetic. Functionally, the Machinations Tool implements them all the same way, as a
random number generator."* Skill and multiplayer rates are **not simulated** — they are dice with a
different icon that tells a human reader *why* the number is uncertain. Do not import them as if they
model anything.

## 1.4 Feedback profile — Table 4.1, verified by reading the page image
Seven characteristics; a loop's profile is these seven plus determinability.

| Characteristic | Values | Description (verbatim) |
|---|---|---|
| **Type** | Positive / Negative | "Amplifies differences, destabilizes a game." / "Dampens differences, stabilizes or balances a game." |
| **Effect** | Constructive / Destructive | "Operates on a game effect that helps a player win." / "...that will make a player lose." |
| **Investment** | High / Low | "Many/Few resources must be invested to activate the feedback." |
| **Return** | High / Low / **Insufficient** | "The net gain is high / low / **The gain does not outweigh the investment (net gain is negative)**." |
| **Speed** | Immediate / Fast / Slow | "The feedback is in effect immediately / takes a little time / takes a lot of time to take effect." |
| **Range** | Short / Long | "The feedback operates directly over a few steps." / "...indirectly over many steps." |
| **Durability** | None / Limited / Extended / Permanent | "The feedback works only once / over a short period / over a long period / The effect of the feedback is permanent." |

Dormans' warning, verbatim: *"It is easy to confuse positive feedback with constructive feedback and
negative feedback with destructive feedback. However, positive destructive feedback does exist."*
(Chess: losing pieces makes you lose more pieces — positive, destructive.)

**This table is the most directly usable thing in the whole literature for this project.** It is a
seven-field schema. Every loop in the design can be given a row, and the rows are checkable against
sweep output.

---
# 2. THE NAMED PATTERNS, AND WHICH ONES APPLY

Thesis Appendix B, read in full. Exactly **13** patterns. Dormans: *"I would advocate that the total
number of patterns be kept low."*

**Correction to the brief:** *arms race*, *worker placement*, and *slow cycle* do **not** appear
anywhere in the 302-page thesis, in Appendix B, or in machinations.io's ~90-term glossary. A subagent
grepped the full extracted text and fetched the glossary to confirm. They are not Dormans coinages.
Do not spec against them.

| Pattern | Intent (verbatim) | Applies here? |
|---|---|---|
| **Static Engine** | "Produce a steady flow of resources over time for players to consume or to collect while playing the game." | **Yes.** Laborer→materials production is one. Its named use is as a **deadlock preventer** for a converter engine — see §3. |
| **Dynamic Engine** | "A source produces an adjustable flow of resources. Players can invest resources to improve the flow." | **Yes, but re-cast.** The investor is the *autonomous mage/institution*, not the god. The god funds; the agents invest. Dormans' consequence text says "player" — read it as "agent". |
| **Converter Engine** | "Two converters set up in a loop create a surplus of resources that can be used elsewhere in the game." | **Yes — this is the knowledge-capital loop.** Library depth → mage quality → research → library depth. Its named failure is deadlock; see §3. |
| **Engine Building** | "A significant portion of gameplay is dedicated to building up and tuning an engine to create a steady flow of resources." | **Partially.** The god tunes the engine through rules and funding, never by placing pieces. Dormans' framing assumes player-directed construction; here the construction is agent-directed under god-set constraints. |
| **Static Friction** | "A drain automatically consumes resources produced by the player." | **Yes.** Subsistence and library upkeep are static friction. Purely automatic — no player command needed. |
| **Dynamic Friction** | "A drain automatically consumes resources produced by the player, the consumption rate is affected by the state of other elements in the game." | **Yes, and it is the missing piece.** Upkeep scaling with library depth is dynamic friction on the knowledge engine. Named applicability: "Use dynamic friction to balance games where resources are produced too fast." |
| **Attrition** | "Players actively steal or destroy resources of other players that they need for other actions in the game." | **Yes — this is raids,** and it is the pattern the measured build is missing entirely (no raids ever fire). Dormans' warning transfers exactly: attrition feedback "might be negative when it stimulates players to act and conspire against the leader, but it also might cause positive feedback when players are stimulated to attack and eliminate weaker players." |
| **Stopping Mechanism** | "Reduce the effectiveness of a mechanism every time it is activated." | **Yes.** The 3× rediscovery penalty is one. Named use: "counter dominant strategies", "reduce the effectiveness of a positive feedback mechanism." |
| **Multiple Feedback** | "A single gameplay mechanism feeds into multiple feedback mechanisms, each with a different signature." | **Yes, and it is already the design.** Permitting a cell feeds worship, knowledge, and raid exposure at once. Consequence: "using this pattern makes a game more difficult" and "Finding the right balance between the multiple feedback loops is an important issue." |
| **Trade** | "Allow trade between players to introduce multiplayer dynamics and negative, constructive feedback." | **NO — inapplicable as shipped.** There is no exchange mechanism between universes; the only inter-universe channel is a raid, which is attrition, not trade. Also presupposes players bartering socially. |
| **Escalating Complications** | "Player progress towards a goal increases the difficulty of further progression." | **Partially.** Structurally available (deeper knowledge → more raid attention), but Dormans scopes it to "fast-paced games based on player skill where the game needs to adjust quickly to the player's skill level." The world layer is neither fast-paced nor skill-based. |
| **Escalating Complexity** | "Players act against growing complexity, trying to keep the game under control until positive feedback grows too strong and the accumulated complexity makes them lose." | **NO.** Explicitly "an addictive skill based game" where the player personally keeps up each step. The god cannot act per-step against complexity. |
| **Playing Style Reinforcement** | "By applying slow, positive, constructive feedback on player actions, the game gradually adapts to the players preferred playing style." | **Yes, and it is the species/tradition system's actual name.** Its stated failure mode is the one this project has measured: *"Playing style reinforcement only works well when multiple strategies and play styles are viable option in the game. When there is only one, or only a few, every one will go for those options."* |

**Patterns that assume direct player command — flagged as the brief asked:** Trade (inapplicable),
Escalating Complexity (inapplicable), Engine Building and Dynamic Engine (applicable only with the
investor re-cast from player to autonomous agent), Attrition (applicable because raids are a god-funded
action, but Dormans' version is a player attacking directly and the mediation matters).

---
# 3. FAILURE MODES THE LITERATURE NAMES — mapped to what we measured

This is the highest-value table. Left column is measured; middle is the published name; right is what
the source prescribes.

### 3.1 Library owed 3.4× total production; every shelf at zero for 1,400 ticks
**Name 1: `shortage` (Machinations, thesis §4.3, verbatim, read directly):**
> "By using negative node modifiers or redistributing resources from a node that has positive input
> node modifiers it becomes possible that the number of resources on a node becomes negative. In this
> case, the negative number of resources indicates a **shortage**. **No resources can be pulled from a
> node that has a shortage, and resources that flow into a node with a shortage are used to compensate
> for the shortage first.**"

*If* unmet upkeep banks as debt — which the word "owed" in the measurement implies, though I have not
read the economy code — this is line-by-line the shortage semantics: every subsequent material inflow
goes to servicing the negative pool, and nothing downstream can pull. Machinations has had a name and an
exact semantics for this since 2012.

> **Answered 2026-08-14, on `b02e115` (W134).** The code was read: **unmet upkeep does not bank as
> debt.** `applyLibraryUpkeep` floors the shortfall into destroyed instances and drops the
> remainder in the same tick, saying so by name — *"It is not banked — a 'pending degradation'
> counter would be a field on a component `contracts.md` §1.5 does not have"* — and
> `assertMaterialsNonNegative` refuses a negative stock at every tick boundary, so no pool can go
> negative for inflow to service. **The design recommendation in §6 idea 1 — "unmet upkeep should
> lapse into decay, never bank as debt" — is therefore already satisfied**, and the shortage
> semantics above do not apply to this drain. Ideas 2 and 4 do: see
> `docs/design/library-upkeep-w134.md`. The 3.4× figure in this section's heading is an older,
> undated measurement and W134 does not replace it.

**Name 2: converter-engine deadlock (Appendix B.3, verbatim):**
> "A converter engine introduces the chances of a deadlock, when both resources dry out, the engine
> stops working. Players run the risk of creating deadlocks themselves by forgetting to invest energy
> to get new fuel. **Combine a converter engine with a weak static engine to prevent this from
> happening.**"

The prescription is explicit and cheap: a *weak static engine* — a small unconditional floor of
production that cannot be captured by the debt — is the documented anti-deadlock device.

**Name 3: Paradox's own postmortem.** Victoria 3's lead systems designer Mikael Andersson named three
failure modes of the closed Victoria II economy (Game Developer "Deep Dive", via subagent): **distribution
modeling** (allocating a scarce good among competing buyers — *literally our four-claimant problem*),
**substitution modeling**, and **iterative imbalancing** (small imbalances compounding into collapse over
a long campaign). Paradox's replacement needed a from-scratch trade rework post-launch (Dev Diary #143,
March 2025). This is the closest shipped analogue and it is a cautionary one.

**Design recommendation:** unmet upkeep should **lapse into decay**, never bank as debt. A drain that
cannot be paid should destroy capability, not create an obligation stock. Additionally the four
claimants should each declare **pull-any vs pull-all-or-none** explicitly (§1.3): scribing a grimoire is
naturally all-or-none (a half-scribed book is nothing); subsistence is naturally pull-any.

### 3.2 Occupation demand pinned at ~104 regardless of populace (17,188 idle vs 67 laborers)
**Name: boundary adequacy failure (Sterman, *Business Dynamics* 2000, ch.21 — test #1 of the battery).**
The test asks: *are the important variables endogenous to the model?* Demand here is computed from
institution counts, so it is **exogenous** with respect to population — there is no connector from
populace back into demand. In system-dynamics terms the loop is not delayed, it is **absent**. Meadows'
definition applies: a feedback loop is "the mechanism that allows a change in stock to affect a flow into
or out of that same stock" — there is no such mechanism here.

Note this is *not* the beer-game pathology, which is a *delayed* balancing loop. Do not reach for the
supply-line fix here; reach for it in §3.4.

### 3.3 God's currency overflows its cap; 9.1–12.4M discarded per run
**Name: source/sink power mismatch.** Daniel Cook, *"Value chains — A method for creating and balancing
faucet-and-drain game economies"*, lostgarden.com, 12 Dec 2021 (fetched and verified by subagent).
Cook's central argument is the one this project needs: **real economies conserve, game economies do
not**, so aggregate production is not evidence of health — the diagnostic is whether pools **accumulate
unspent**. His matching rule: a *constant* source needs a *fixed* sink; a *linear/trickle* source needs a
*repeatable* sink; an *exponential* source needs an *exponential or competitive* sink. Favor regeneration
scales with worship (a growing source) against a spend menu that does not scale (a fixed sink). The
mismatch is structural, not a tuning error.

**SD corollary** (via subagent, standard SD idiom): an inflow exceeding a ceiling should be an explicit
**spill flow**, never a silent truncation — *"stock = min(stock + inflow, CAP)"* both breaks conservation
and destroys the signal that would feed back to whatever is overproducing. The favor ledger already
records the discard (per the `god-agency` spec). **The missing piece is that the discard feeds back into
nothing.** Route it: let sustained discard raise costs, unlock a sink, or decay worship.

### 3.4 "The economy does not oscillate" — the current check is too narrow
The economy spec asserts the occupation mix "does not exhibit a sustained two-tick alternation." That
detects period-2 only. The literature says the period scales with the loop's delay:

- **Verified verbatim** (CiteSeerX synthesis of Sterman's stock-management work): *"Oscillations can
  arise only when there are time delays in the negative feedbacks controlling the state of the system...
  to oscillate, the time delay must be (at least partially) ignored, and the manager must continue to
  initiate corrective actions in response to the perceived gap between the desired and actual state of
  the system even after sufficient corrections are in the pipeline."*
- **Sterman, J.D. (1989), "Modeling Managerial Behavior: Misperceptions of Feedback in a Dynamic Decision
  Making Experiment," _Management Science_ 35(3):321–339** — abstract fetched directly from INFORMS by
  subagent; verbatim: *"subjects are shown to be insensitive to the feedbacks from their decisions to the
  environment."* The paper does say what it is usually said to say. **Caveat:** the specific estimated
  supply-line weight parameters could not be verified against the primary text.
- **Edali, M. & Yasarcan, H. (2014), "A Mathematical Model of the Beer Game," _JASSS_ 17(4):2**
  https://www.jasss.org/17/4/2.html — formalizes the rule:
  `O = round(Expected_Demand + (S* − S)/SAT + w_SL·(SL* − SL))`
  where `w_SL` weights the **supply line** (committed but not yet arrived). Optimal `w_SL` = 1.0;
  subjects use far less.

Occupation reallocation is exactly a stock-management structure with a material delay
(`transferRatePerTick`). A rule that reads only the current gap and ignores transfers already in flight
is `w_SL = 0` — the textbook oscillation generator. **A 1,400-tick starvation cycle is invisible to a
period-2 detector.** Replace it with autocorrelation or peak detection over the existing 12-tick census
grid.

### 3.5 Dominant / degenerate strategies (the idle bot winning 100% of runs)
- **Soren Johnson, "GD Column 17: Water Finds a Crack," designer-notes.com** (verified): *"a single,
  dominant strategy actually takes away choice from a game because all other options are provably
  sub-optimal... the sweet spot for game design is when a specific decision is right in some
  circumstances but not in others, with a wide grey area between the two extremes."* And on why you
  cannot ship around it: an exploit, once found, *"cannot be ignored or forgotten, even if the player
  wishes otherwise."*
- Dormans' own term for structural flaws is *"'bad smells' in analogy to software engineering"* and the
  dynamic-engine consequence names it: *"one must be careful not to create a dominant strategy either by
  favoring the long term strategy, or by making the costs for the long term strategy too high."*

### 3.6 1 of 16 effect primitives both reachable and node-driven
No economy-literature name. This is **static reachability over the content graph** — 15 primitives have
no activator path from any node. The citable frame is **Nelson, M.J. (2011), "Game Metrics Without
Players: Strategies for Understanding Game Artifacts," AIIDE Workshop on AI in the Game Design Process**
https://cdn.aaai.org/ojs/12479/12479-52-16007-1-2-20201228.pdf — the argument that the *artifact itself*
(rules, content, state space) can be analysed without running a single playtest. A reachability check is
a static artifact metric and belongs in CI, not in the sweep.

### 3.7 Deep chains becoming tedious — the named reason
The literature does **not** blame depth. Wube, **FFF #266 "Cleanup of mechanics"**
https://www.factorio.com/blog/post/fff-266 (verified): *"there is not really a clear connection between
the number of ingredients and the complexity of the recipe."* They removed mechanics because *"it was
yet another thing that had to be explained somehow"*. **FFF #397** documents the real cost of depth:
finding what an item is *made from* is easy, finding what it is *used for* was *"almost impossible
through some kind of search"* — so they shipped a browsable index rather than pruning the chain. The
named failure of deep chains is **discoverability in the used-by direction**, not step count.

---
# 4. CHAIN DEPTH — the verdict

**Verdict: "three or four resources, not fourteen" is NOT defensible as stated, and it is also not
wrong for this game. It is right for the wrong reason, and the reason matters.**

**No designer states a chain-depth rule of thumb.** That is a genuine negative finding after targeted
search, not a search failure.

Verified counts (all fan-wiki or agent-counted, none developer-stated — flagged accordingly):
| Game | Count | Source quality |
|---|---|---|
| Frostpunk | **5** resources | inferred from shipped design; no dev quote found |
| Victoria 3 | **48** goods (11 staple / 16 luxury / 17 industrial / 4 military) | Paradox community wiki |
| Factorio | **105** intermediate products | official wiki category count; Wube never states a total |
| Anno 1800 | **183** goods with DLC | subagent's own count from raw MediaWiki wikitext |

So shipped deep-chain economies run 48–183, an order of magnitude above fourteen. **But those counts do
not transfer**, and this is the load-bearing argument:

> Anno, Factorio and Victoria manufacture their decision content from **direct build orders** and
> **spatial routing** — where to place the producer, how to route the belt, what ratio to build.
> Multiverse Mages has constitutionally excluded both: the god cannot issue orders, and the world layer
> has no coordinates. **Per-resource decision density here is structurally lower**, so the shipped
> counts are an upper bound generated by mechanisms this game does not have.

**The defensible rule is Cook's, not a count:** a resource earns its slot when it has **its own sink and
its own scarcity regime**. Fourteen materials sharing one sink is not fourteen resources — it is one
resource with fourteen labels, and it will add bookkeeping without adding decisions. Corroborated by
Wube, **FFF #375 (Quality)** (verbatim, verified): *"Generally, just adding a huge amount of recipes
isn't really adding to the game at this point, as we feel that the game already has enough... we wanted
to add some complexity, and also, make the related complications explicitly opt-in."* Depth should be
**opt-in**, not a mandatory multiplication of the recipe table.

The one number the literature *does* give is about **loops, not resources** — Dormans, verbatim: *"most
successful games incorporate two or more, but not that many more, feedback loops in its main
structure"*, and *"a well-designed game is built on only a handful feedback loops."* The vision doc
already names two compounding loops (worship, knowledge-capital). That is inside the literature's band.
Adding materials differentiation should be judged on **whether it adds a loop**, not on the goods count.

## 4.1 ⚠️ SPEC COLLISION — flag, do not silently resolve
`openspec/changes/mages-and-species/specs/economy/spec.md` contains:

> **Requirement: The economy has exactly three tracked inputs.** "The economy SHALL track exactly three
> inputs — populace, materials, and knowledge-as-capital — and MUST NOT introduce a fourth resource."
> Scenario: "No fourth resource."

Differentiating `materials` into fourteen stocks would introduce thirteen more resources and **fail that
scenario**. Any move in that direction is a **spec change**, not tuning, and needs a proposal.

**There is a resolution that satisfies both**, and it falls straight out of the vocabulary: keep
`materials` as **one pool**, and express the fourteen forms as **converters and activators on the flow**
rather than as pools.
- A form is an **activator**: it gates whether a conversion may fire at all (a permitted form unlocks a
  recipe).
- A form is a **converter**: it changes the rate/yield of materials→building or materials→grimoire.
- No new stock, no fourth resource, no violation — and *Rego Terram* "moves this number" exactly as
  vision §6a already promises.
Fourteen **pools** fails the test. Fourteen **converters and activators on one flow** passes both the
spec and Cook's rule.

---
# 5. HOW TO INSTRUMENT IT — as a diff against what already exists

The project is already far better instrumented than the literature's median: `metric-constants.md`
pins Kaplan–Meier with right-censoring, Wilson score intervals, nearest-rank percentiles, a Gini
estimator with a documented degenerate case, and a `definitionVersion` digest that fails CI when a
definition moves. **Do not rebuild any of that.** Three instrument *classes* are missing.

### 5.1 What already matches the literature (name it and move on)
- `winRateByPrimitive` ablation **is restricted play**. **Jaffe, A., Miller, A., Andersen, E., Liu, Y-E.,
  Karlin, A., Popović, Z. (2012), "Evaluating Competitive Game Balance with Restricted Play," AIIDE**
  https://ojs.aaai.org/index.php/AIIDE/article/view/12513 — abstract verified verbatim by subagent:
  *"We argue for a formulation in which carefully restricted agents are played against standard agents."*
  **Important correction:** restricted play is a **per-mechanic sensitivity/attribution measure**, not a
  dominant-strategy detector. It can *reveal* one when restricting a mechanic collapses the win rate, but
  the paper does not claim to find them. Applied to one educational card game (name not confirmed).
- `worshipSnowball` / `capitalSnowball` Gini has a real precedent: **Hooper, B. (2020), "EVE Online: The
  Worlds of Wealth and War," DiGRA 2020** https://dl.digra.org/index.php/dl/article/view/1187 — Gini on
  actual player-wealth data. **Do not** import the "0.4–0.6 healthy, >0.8 oligarchy" thresholds a
  subagent found circulating on Medium; unverified, not authoritative. Derive thresholds from our own
  sweeps.
- The SimWar case study (Dormans 2011, read directly) is the methodological ancestor of our sweeps:
  1,000 sessions per configuration, scripted artificial players, a table of parameter tweaks. Its
  finding is a sensitivity result: *"the balance between rushing and turtling strategy is mostly
  affected by the balance between production and offensive units, and little by the balance between
  offensive and defensive units."* Note also Dormans' honesty: *"It is naive to assume that the tweaks
  suggested in this paper translate to a perfectly balanced game when implemented."*

### 5.2 Missing class 1 — flow accounting (every current metric is a *level* metric)
Every metric in the registry measures a level, a rate, or a distribution at a checkpoint. None
reconciles flows. The favor ledger is the exception and proves the point — it is the only place a
closing balance is asserted against opening + in − out.

Extend that shape to `materials` and to knowledge instances: a per-tick **faucet/sink ledger** with a
conservation assertion, plus **unmet-demand-per-claimant** promoted from "recorded and observable" (as
the economy spec already requires) to a **reported sweep metric**. Precedent: **GEEvo** (Rupp & Eckert
2024, arXiv:2404.18574, abstract verified by me) evolves graph-based economies and uses **pool
monitoring** — resource accumulation in storage nodes over time — as its fitness signal, not production
aggregates. Cook's argument is the same one: watch whether pools sit unspent.

**Machinations offers the primitive:** the **reverse trigger** (`!`) fires when a node fails to pull all
the resources its inputs call for. A per-claimant starvation counter is exactly this, and it is the
metric that would have caught the 1,400-tick zero on the first sweep.

**Honest gap:** there is **no academic literature on conservation checks or resource-accounting
invariants for game simulations.** A subagent searched specifically and found none. It is tribal
practice. The nearest citable neighbours are Sterman's dimensional-consistency and extreme-condition
tests, and Cook's piece. Say so rather than inventing a citation.

### 5.3 Missing class 2 — behaviour-*mode* classification per run
Sterman's sensitivity analysis splits three ways, and the split is the whole point:
- **numerical sensitivity** — do output *values* move?
- **behavioural sensitivity** — does the output *mode* change (equilibrium vs oscillation vs collapse)?
- **policy sensitivity** — do the *conclusions* change?

Every current metric is numerical. A run that oscillates and a run that settles can produce the same
median. **Classify each run's mode** and report the distribution of modes as a first-class metric. This
is also the concrete answer to **INV-29**, whose mechanism is currently "To be defined": the
knowledge-capital loop "does not run away" is a claim about *mode*, and it should be tested by pushing
the loop's inputs to extremes across sweep arms rather than by observing that nominal runs look smooth.

### 5.4 Missing class 3 — extreme-condition tests as sweep arms
**Sterman, _Business Dynamics_ (McGraw-Hill, 2000), ch.21 "Truth and Beauty: Validation and Model
Testing"** — the twelve-test battery (list via subagent; chapter text not fetchable, treat individual
wordings as unverified): boundary adequacy, structure assessment, dimensional consistency, parameter
assessment, **extreme conditions**, integration error, behaviour reproduction, behaviour anomaly, family
member, surprise behaviour, **sensitivity analysis**, system improvement.

Mapping to what exists: the reference-scenario long-run test is a **behaviour reproduction** test. "No
land carries nobody" and "A stock that grows without limit does not grow K without limit" are
**extreme-condition** tests, already written and already good. The `fp(1024)` scale discipline is
**dimensional consistency**. **We have roughly half the battery; the named absentees are boundary
adequacy (which §3.2 shows we fail), behaviour anomaly, and behavioural sensitivity.**

For parameter attribution the standard recipe is **Morris screening then Sobol** — Morris is cheap and
tells you which parameters matter at all, Sobol is expensive and apportions variance, so you run it only
on Morris's shortlist. Flagged honestly: this is general ABM/engineering practice; a subagent found no
paper applying it to a game economy.

**Integration-error warning, and it bites this codebase specifically.** A fixed-step integer tick loop
*is* Euler integration at `dt = 1 tick`. Euler is a first-order linear extrapolator: on any curved
trajectory it systematically overshoots the turning point, and inside a feedback loop that overshoot
compounds rather than washing out (iSee Systems, "Integration Methods and DT"). Any balancing loop whose
natural response time is a handful of ticks sits exactly where the bias is worst. Determinism forbids
adaptive step sizes, so the mitigation is structural — keep loop response times long relative to the
tick, and clamp with the SD idiom `flow = MIN(desired_flow, stock/dt)` rather than letting a stock go
negative and calling it debt.

### 5.5 Metrics that lie — the name
**Goodhart's law** (Goodhart 1975; Strathern's 1997 paraphrase, "when a measure becomes a target it
ceases to be a good measure"). The mechanism relevant here is **causal-intervention decoupling**:
"total production is rising" was never the target — *throughput that reaches use* was, and the model let
the two decouple. `libraryDependence` sitting at 0 is the same failure: a metric that is structurally
incapable of moving reads as a healthy constant.

**Practical rule this project can adopt directly:** every metric must have a stated **falsifier** — the
observation that would prove it is not measuring what it claims. `invariants.md` already applies exactly
this discipline via its "Disproved by" column. Extend that column to the *metrics* registry, not just
the invariants registry. That is a small change and it is the direct antidote to being burned a fourth
time.

---
# 6. THE FIVE MOST APPLICABLE IDEAS

1. **`shortage` semantics (Machinations, thesis §4.3).** A pool that goes negative absorbs all inflow
   before anything downstream can pull — the exact mechanism behind the library owing 3.4× production
   and every shelf sitting at zero for 1,400 ticks. **Map:** make unmet upkeep *lapse into decay*
   instead of banking as debt, and give each of the four materials claimants an explicit
   pull-any vs pull-all-or-none mode instead of an implicit priority order.

2. **Source/sink power matching (Cook, Lostgarden 2021).** A constant source needs a fixed sink; a
   linear source a repeatable sink; an exponential source an exponential or competitive sink — and the
   diagnostic is *unspent pools*, never aggregate production. **Map:** favor regeneration scales with
   worship while the spend menu does not, which is why 9.1–12.4M is discarded per run; either scale the
   sink or route the discard into feedback, because the ledger currently records it into nothing.

3. **Every engine needs a friction, and a converter engine deadlocks (Dormans, Appendix B.3/B.6).**
   The knowledge-capital loop *is* a converter engine, whose documented failure is deadlock and whose
   documented remedy is "combine with a weak static engine". **Map:** give the knowledge loop a
   dynamic friction (upkeep scaling with library depth) and an unconditional production floor that the
   debt cannot capture — that pair is INV-29's missing mechanism.

4. **The supply-line term in an autonomous producer's decision rule (Sterman 1989; Edali & Yasarcan
   2014, JASSS 17(4):2).** A stock-management rule that reads only the current gap and ignores transfers
   already in flight is `w_SL = 0`, the canonical oscillation generator. **Map:** occupation reallocation
   is precisely this structure with a `transferRatePerTick` delay, so the rule must subtract in-flight
   transfers — and separately, demand pinned at ~104 is a *boundary adequacy* failure (demand is
   exogenous to population), which is a missing loop, not a delayed one.

5. **Behaviour-mode classification plus extreme-condition tests (Sterman ch.21).** Sensitivity splits
   into numerical, behavioural and policy; every metric we have is numerical, so a run that oscillates
   and one that settles can report the same median. **Map:** classify each run as equilibrium /
   oscillation / collapse and report the mode distribution — that is the concrete definition INV-29 and
   INV-30 are currently missing, and the period-2 alternation check should become autocorrelation over
   the existing 12-tick census grid so a 1,400-tick cycle cannot hide.

---
# 7. TOOLING, AND WHETHER TO BUY IT

- **machinations.io** — alive and funded. $3.3M Series A led by Hiro Capital, May 2022, ~$6.45M total
  raised; ~$1.8M ARR and ~23 employees as of ~Sept 2025 reporting (via subagent). Browser SaaS, billed
  by **"Machinations Events"** (every node activation, token move and formula recalculation consumes
  events) times seats. Higher tiers expose an **API key, JSON export of variables, export of play
  results, and Google Sheets/Drive export** — confirmed from the site's own plan-config JSON. Exact
  prices could not be extracted (React-rendered).
- **Original Flash tool** (`jorisdormans.nl/machinations`) — **dead.** 403 over HTTP, mismatched TLS
  cert, and Flash itself discontinued end-2020. A `.swf` is archived at `github.com/DleanJeans/Machinations`
  (static since 2020).
- **Open source** — `vrozen/MM-Lib` (C++, the Micro-Machinations reference implementation) dormant since
  Dec 2014; `kakoeimon/GodotMation` dormant since 2019; `dsgarage/machinations-web` created Feb 2026,
  1 star, too young to assess. **There is no actively-maintained open-source Machinations engine.**

**Recommendation: adopt the notation, do not adopt the tool.** The AGPL constraint in `CLAUDE.md` makes a
proprietary SaaS in the design loop awkward, the event-metered pricing is hostile to Monte Carlo, and —
decisively — we already have a deterministic simulator that is strictly more faithful than a Machinations
diagram would be. What Machinations gives us is a **vocabulary, a seven-field feedback-profile schema, and
a pattern catalogue**, all of which are free and citable. The one thing worth stealing from the tool is the
**reverse trigger**: a first-class starvation signal.

## Has the field moved?
Only a little, and not away from Dormans.
- **Formalisation:** Klint, P. & van Rozen, R. (2013), "Micro-Machinations: A DSL for Game Economies,"
  *SLE 2013*, LNCS 8225, DOI 10.1007/978-3-319-02654-1_3; and van Rozen, R. & Dormans, J. (2014),
  "Adapting Game Mechanics with Micro-Machinations," *FDG 2014*. These exist **because** the original
  notation is informal — in their words, Machinations "is limited to design itself." Both dormant.
- **Automation:** **GEEvo** (Rupp & Eckert 2024, arXiv:2404.18574) is the most on-topic recent work —
  graph-based economies, evolutionary generation then balancing, fitness from repeated simulation, pool
  monitoring as the health signal. Deliberately "detached from a specific game." This is the closest
  published precedent for what our harness does.
- Nothing supersedes Machinations as a *vocabulary*. The 2012 thesis is still the reference.

## Things I could not verify — stated so they are not repeated as fact
- **Lehdonvirta, V. & Castronova, E. (2014), _Virtual Economies: Design and Analysis_, MIT Press.**
  Confirmed to exist; **chapter structure and content could not be verified.** Anything about its
  treatment of sinks/faucets beyond "it covers them" is secondhand from reviews.
- **Schreiber, I. & Romero, B. (2021), _Game Balance_, CRC Press.** Chapter structure confirmed (Ch.6
  Economic Systems, Ch.7 Trading and Auctions, Ch.8 Resources) via publisher listings; **no chapter text
  retrievable.** No rule of thumb should be attributed to it without a direct read. This is the single
  most likely place a real chain-depth heuristic exists.
- **Dormans (2009), "Machinations: Elemental Feedback Structures for Game Design," GAMEON-NA, pp.33–40**
  — bibliographically confirmed, **no public full text found.** The thesis supersedes it anyway.
- **Sterman ch.21** — the twelve test *names* are reliable; individual wordings are secondhand.
- **Sterman 1989** — abstract verified; the estimated supply-line weight *values* were not.
- The "faucets and sinks" vocabulary is **not** traceable to Shokrizade; its origin is diffuse MMO design
  practice. Do not attribute it.
- Frostpunk's small resource count is an inference from the shipped game; **no designer quote found**
  saying it was deliberate restraint.
- *arms race*, *worker placement*, *slow cycle* — **not in Dormans.** Not Machinations terms.
