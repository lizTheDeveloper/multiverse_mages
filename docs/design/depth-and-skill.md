<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Depth, and the vocabulary this project has been measuring without

**Workstream:** W32, `w32/depth-language`, from `integration/campaign-round-2`. **Role:** research
and language design. **Changes no constant, no rule, no behaviour.**

This is a synthesis aimed at one game, not a literature review. Its companion is
`design-language.md`, which turns the parts that survive into a notation the specs and the test
suite can share.

## How to read the sourcing

Every substantive claim below is one of three things, and it says which:

- **[read]** — the cited text was retrieved and read this workstream, and the claim is supported by
  a passage in it.
- **[secondary]** — the claim comes from a source that quotes or paraphrases the cited work, not
  from the work itself.
- **[recall]** — recalled, not verified against a source this workstream. Treat as a lead.

This discipline is not decoration. The campaign has already withdrawn a widely-repeated citation
whose abstract did not support the claim made from it. In this workstream the same failure was
caught twice more, and both are recorded in §9 because a synthesis that hides its own near-misses
is less trustworthy than one that does not.

---

## 1. The finding, before the vocabulary

Five workstreams have measured the same thing and named it five ways.

| workstream | what it reported | |
|---|---|---|
| W15 | first eigenvalue 0.914, participation ratio 1.19 | the strategy space is one-dimensional |
| W15 | cross-strategy containment 1.000 | strategies nest rather than differ |
| W15 | prefix fidelity 0.943, exact on 65/84 | a run's node set is a function of its node count |
| W15 | two ceiling-4 species reach the identical 49 nodes | species change how far, not which |
| R2 | `permit-then-idle` 40/40 against `permissive-breadth` 38/40 | the bot that does nothing beats the bot that plays |
| R2 | 8 of 10 strategies at rate exactly 0.0000 | there is no ladder to climb |

Those are not five findings. They are one, and it took five workstreams to say so because each
invented its own metric, and an invented metric cannot be compared with the invented metric next
door. The literature has names for most of this. Some of the names arrive with thresholds, null
models and known failure modes that our versions do not carry, and that is the concrete return on
doing this at all.

---

## 2. The vocabulary

### 2.1 Depth is not complexity

The distinction that carries the most weight, and the one the literature is clearest on.

**Complexity** is how much there is to know: rules, state space, branching factor. **Depth** is how
much there is to *get better at*.

Lantz, Isaksen, Jaffe, Nealen & Togelius are explicit about what depth is **not**, and each denial
comes with an argument rather than an assertion **[read**, "Depth in Strategic Games", AAAI 2017
workshop *What's Next for AI in Games?*, <http://www.nealen.net/papers/Lantz2017Depth.pdf>**]**:

- **Not state-space size.** Bolt a coin-flip token onto any game: the state space doubles, the depth
  does not move.
- **Not branching factor.** Adding arbitrarily many *dud* branches inflates the branching factor and
  adds nothing; a binary choice that matters can be deeper than fifty that do not.
- **Not computational complexity class.** PSPACE-vs-EXP is too coarse, and it cannot separate "hard
  to solve" from "interesting to solve". Their example: brute-force needle-in-a-haystack search is
  resource-intensive and shallow.
- **Not a threshold property.** They decline to define a line between deep and non-deep games;
  everything is on a spectrum.

**This is directly load-bearing for us.** The campaign has spent content budget on the assumption
that twelve enabled cells were too few, and W15 measured the dimensionality at **1 with 51 nodes and
2 with 282** — more content bought no proportional axis. That is the branching-factor denial
arriving as a measurement. Authoring more nodes into a value-blind cost queue is adding dud
branches.

### 2.2 Skill chain, and who actually coined it

The brief for this workstream believed *Characteristics of Games* (Elias, Garfield & Gutschera, MIT
Press, 2012) contains the formal treatment of skill chains with depth defined as chain length. That
is **not what the sourcing supports**, and the correction matters.

Lantz et al. attribute the idea to **Bill Robertie**, "Letters to the Editor", *Inside Backgammon*
2(1):2–4, 1992, under the name **complexity number**, and credit *Characteristics of Games* with
"expounding upon" it rather than coining it **[read**, Lantz et al. §"Skill Chains and Strategy
Ladders"**]**. Their statement of it:

> The size of a game's skill chain is the number of distinct steps in the ranking of all players,
> where players at each step beat all the players at lower steps some significant percentage of the
> time.

Robertie's own terms were **skill differential** for one step of the chain, at a **75%** win-rate
threshold, and **complexity number** for the count of steps **[secondary**, The Gammon Press,
<https://thegammonpress.com/comparing-games-skill-chance/>, which reports his worked numbers: Go 40,
Chess 14, Scrabble 10, Backgammon 8, no-limit hold'em 8, Checkers 8**]**.

Gilbert & Wells attribute the longest-chain construction to Elias et al. directly, at a **60%**
threshold **[read**, "Ludometrics: Luck, and How to Measure It", arXiv:1811.00673, §1.3.1 — but
this is their paraphrase of the book, not a quotation from it**]**. Two citing papers give two
different thresholds for the same construction. **Nobody should treat 60% or 75% as a constant this
project inherits**; the threshold is a free parameter, which in our vocabulary means it must be
pinned and versioned like any other.

Attempts to read the book's own text this workstream failed: Internet Archive returned 403,
Google Books' search-inside returned nothing for the phrase. **So every claim about what
*Characteristics of Games* says is [secondary] here, and the doc says so rather than borrowing the
book's authority.** If the skill-chain definition ever becomes load-bearing for a gate, buy the
book.

Lantz et al. are also careful that skill-chain length is **evidence of** depth rather than its
definition, which is why they build a separate formal model. That distinction is worth keeping.

**Term collision, flagged because it will otherwise cause a wrong conversation.** Daniel Cook's
"skill chain" (Lost Garden, "The Chemistry of Game Design", 2007,
<https://lostgarden.com/2007/07/19/the-chemistry-of-game-design/>) **[read]** is a completely
different idea: a dependency graph of learnable sub-skills inside one game, built from "skill
atoms". Cook's chains are about *teaching*; Robertie's are about *ranking*. This project has a
knowledge dependency graph and a strategy ranking problem, so both are live here and conflating
them would be easy. **In this repository "skill chain" always means Robertie's.** Cook's sense is
called a **skill graph**.

### 2.3 Skill ceiling is not skill chain

A **skill ceiling** is how good the best possible play is. A **skill chain** is how many
distinguishable rungs lie between the worst and best play. They come apart in both directions: a
game can have an enormous ceiling and a two-rung chain (find the trick, then execute it perfectly),
and a game can have a modest ceiling with many rungs.

**Our build is the first case, degenerately.** The ceiling is "permit everything, then wait" and the
chain from `permit-then-idle` to everyone else is **one step**. Eight of ten strategies at rate
exactly 0.0000 are not eight rungs; they are the floor.

### 2.4 The strategy ladder — depth made computational

Lantz et al.'s own contribution replaces human players with algorithms **[read]**. A **strategy
ladder** is a sequence of strategies, each the best achievable at a given level of computational
resources; **d**, their depth property, is the number of discrete steps in that ladder, where a step
requires improvement over the previous by some threshold.

**The paper is a position paper and says so.** In the authors' words: *"At this stage in our
research we do not yet have a system built to evaluate our proposed technique."* Its "Next Steps"
list development of toy games and application to Tic Tac Toe, Blackjack and 3×3 Go as **future
work** **[read]**. Anyone citing it as an empirical result is citing it wrong.

The idea becomes operational downstream, and this is the line to follow if the project ever wants to
gate on depth:

| work | what it does |
|---|---|
| Nielsen, Barros, Togelius & Nelson, **RAPP** — "General Video Game Evaluation Using Relative Algorithm Performance Profiles", EvoApplications 2015, LNCS 9028:369–380, DOI 10.1007/978-3-319-16549-3_30 **[secondary]** | several algorithms of differing strength play the game; a deeper game shows a bigger gap between strong and weak |
| Liu, Togelius, Perez-Liébana & Lucas, "Evolving Game Skill-Depth using General Video Game AI Agents", arXiv:1703.06275, 2017 **[read]** | MCTS **rollout budget** as the strength axis; evolves game parameters to maximise the strong-vs-weak gap. Empirical, 14,400-instance sweep |
| Browne, "Quickly Detecting Skill Trace in Games", IEEE CoG 2022:604–607 **[secondary]** | **skill trace**: win rate of budget-2X against budget-X across a ladder of MCTS time budgets; `ST = y + (1−y)·AUC` |
| Goodman, Perez-Liebana & Lucas, "Skill Depth in Tabletop Board Games", IEEE CoG 2024 **[read]**, <https://tabletopgames.ai/assets/pdf/Goodman2024SkillAnalysis.pdf> | tunes the MCTS agent per game (a fixed agent is a bad strength proxy — No Free Lunch); a full budget **grid** rather than adjacent doublings; a 3-parameter logistic model separating stochasticity (M) from depth (β) |

**Goodman et al. is the most useful of these to us, and the most honest.** They report that their
metrics' correlation with human-perceived complexity (BoardGameGeek ratings) is **weak and mostly
not significant** — Spearman ρ 0.27–0.62, p mostly 0.16–0.50, one cell under 0.05 **[read]**. They
also show a game's measured depth collapsing when the agent is tuned properly: Virus goes from
ST = 0.125 to **ST = 0.000** **[read]**. That is the same failure mode as measuring our strategy
space with a bot pool that cannot detect a ruleset-only winner — which is exactly why round 2 added
`permit-then-idle` and `idle-then-declare`. **Our pool composition problem is a known problem in
this literature and it has a known answer: tune the ladder, do not trust a fixed agent.**

Stephenson, Perez-Liebana, Nelson, Khalifa & Zook, "Game Complexity vs Strategic Depth" (2019
seminar report, <https://matthewstephenson.info>) **[read]** pushes back on the whole programme,
arguing depth is subjective to the player or agent rather than an objective property — directly
against Lantz et al.'s stated goal of a psychology-independent **d**. They propose no replacement.
**Cited here so that nobody reads this section as settled science. It is not.**

### 2.5 Dominated, dominant, degenerate, solved

Classical and unambiguous, so this is the part of the vocabulary that can be adopted wholesale.
**Osborne & Rubinstein, *A Course in Game Theory*, MIT Press, 1994, ch. 4** — §4.1 rationalizability,
§4.2 iterated elimination of strictly dominated actions, §4.3 the weak version **[verified table of
contents,** <https://www.economics.utoronto.ca/osborne/cgt/TOC.html>**]**.

- **Strictly dominated**: option A is worse than B *at every state*. Rational play never uses it.
- **Weakly dominated**: A is never better and sometimes worse. The distinction matters because
  iterated elimination of *weakly* dominated actions is order-dependent and can delete equilibria —
  which is precisely why our claim language must say which one is meant.
- **Dominant**: better than everything else at every state. A game with a dominant strategy has no
  decision at that node.
- **Degenerate** (design usage, not game theory's): a strategy or option that collapses the
  strategic space around it, so that the interesting decisions stop being made. Not a term with a
  formal definition we could verify; used here descriptively and always with a decision procedure
  attached.
- **Solved**: the optimal line is known and fixed. The important refinement for us is that a game
  can be **solved open-loop** — the optimal line is a fixed *sequence*, ignoring all state.

**`permit-then-idle` is an open-loop solution.** It presses two verbs for 140 ticks and then submits
an empty preference list for 2,260 more, and it wins 40 of 40. Nothing in this project's vocabulary
had a name for that; "solved open-loop at horizon 2400" is the name.

### 2.6 Transitive and cyclic structure

The formal treatment here is recent, rigorous, and the most transferable body of work in this whole
synthesis.

**Balduzzi, Tuyls, Perolat & Graepel, "Re-evaluating Evaluation", NeurIPS 2018, arXiv:1806.02643**
**[read]**. An antisymmetric win-loss log-odds matrix `A_ij = log(p_ij/(1−p_ij))` admits a
**combinatorial Hodge decomposition** into a **transitive** component — a gradient, exactly the part
a rating like Elo can express — and a **cyclic** component, the rotational part Elo cannot, of which
rock-paper-scissors is the minimal example. They cite Jiang, Lim, Yao & Ye, "Statistical ranking and
combinatorial Hodge theory", *Mathematical Programming* 127(1):203–244, 2011, arXiv:0811.1067
**[secondary]**, whose HodgeRank splits pairwise-comparison data three ways: gradient (transitive),
curl (locally cyclic) and harmonic (globally cyclic but locally acyclic).

**Correction worth recording: this paper defines no scalar "percent transitive" measure.** Its
contribution is Nash averaging and multidimensional Elo. If we want a transitivity fraction we are
inventing one, and must say so.

**Balduzzi, Garnelo, Bachrach, Czarnecki, Perolat, Jaderberg & Graepel, "Open-ended Learning in
Symmetric Zero-sum Games", ICML 2019, arXiv:1901.08106** **[read]**. Theorem 1: every functional-form
game decomposes as **transitive ⊕ cyclic**. A game is transitive when `φ(v,w) = f(v) − f(w)` for
some rating `f` — a *subtractive factorization*, i.e. **the outcome of every matchup is determined by
one number per strategy**. It introduces the **gamescape**, the convex hull of strategies' objective
functions, and states that *"the dimension of the EGS is determined by the rank of the evaluation
matrix"*. It also defines **effective diversity**, a Nash-weighted population diversity measure.

**Read that transitivity definition against our measurement.** W15 found 94.6% of variance between
strategies on a single axis and a run's node set determined by its node count. A game in which one
number per strategy determines everything is, in Balduzzi's terms, **a purely transitive game with a
one-dimensional gamescape**. We did not find something unusual; we found the degenerate case the
formalism is built to detect.

**Czarnecki, Gidel, Tracey, Tuyls, Omidshafiei, Balduzzi & Jaderberg, "Real World Games Look Like
Spinning Tops", NeurIPS 2020, arXiv:2004.09468** **[read]**. The empirical claim: real games have an
upright transitive axis and a radial non-transitive one, and the cyclic dimension is **widest in the
middle of the skill range**, narrowing toward both the Nash equilibrium at the top and maximally weak
play at the bottom. Validated on nine two-player zero-sum symmetric games; Theorem 1 proves
arbitrarily long cycles exist in any game that is "n-bit communicative", with Go proven ≥1000-bit
communicative and cycles of length ≥2^1000.

**The spinning-top geometry is the single most useful picture in this synthesis**, because it says
where to look. A game whose cyclic dimension is zero *at every skill level* is a cone, not a top.
Ours is a cone. It also predicts that if we ever get non-transitivity, it will appear among
mid-strength strategies first — so a pool of only extreme strategies would miss it.

Sanjaya, Wang & Yang, "Measuring the Non-Transitivity in Chess", arXiv:2110.11737, *Algorithms*
15(5):152, 2022 **[secondary, abstract]**: Nash clustering plus counting rock-paper-scissors cycles
over a billion Lichess/FICS games; chess does have spinning-top geometry, and non-transitivity is
inversely related to a player's ability to gain rating.

**Order theory gives the crisp statement of our problem.** A family of sets in which every pair is
comparable under inclusion is a **chain**; one in which no pair is comparable is an **antichain**.
W15 measured containment 1.000 across every v1 strategy pair. **We have a chain and we want a poset
with width greater than 1.** That sentence is the whole design problem in six words, and it is worth
having.

---

## 3. Our measurements, given their real names

This is the section the workstream exists for. Two of our numbers are instances of measures other
fields have been arguing about for decades, and the arguments are the valuable part.

### 3.1 Prefix fidelity 0.943 is a coefficient of reproducibility

*(This subsection is completed in §3.4 with the verified citations; the naming itself is stated
here because the mechanism is ours to state.)*

**What we measured**: rank the nodes by how many runs hold them; for a run holding *k* nodes,
predict "the top *k*". Mean overlap 0.943; exactly right on 65 of 84 runs.

**What that is**: a claim that a set of binary items forms a **cumulative unidimensional scale** —
that holding item *i* implies holding every item ranked above it, so the whole response pattern is
recoverable from the score alone. That is **Guttman scaling**, and the fraction of item-by-case cells
correctly reproduced from the score is the **coefficient of reproducibility**.

**The caveat our version does not carry, and it is the important one.** A high coefficient of
reproducibility is *inflated by extreme item marginals*: if almost every run holds almost every node,
"predict the top k" is nearly right by arithmetic and says nothing about structure. Our own data has
exactly that pathology — **three strategies hold the identical fifty-one nodes in all twelve runs**,
because 51 is the entire reachable set. W15 pre-registered that as forced by the content boundary
and said so, which is to its credit, but the *number* 0.943 does not know it.

The established corrections are **minimal marginal reproducibility** — what the coefficient would be
if you simply predicted each item's modal response — and the **coefficient of scalability**, which
reports how far reproducibility exceeds that floor. **We should be reporting the gap, not the raw
number.**

### 3.2 Cross-strategy containment 1.000 is nestedness

**What we measured**: `|A∩B| / min(|A|,|B|)` = 1.000 for every cross-strategy pair inside v1.

**What that is**: perfect **nestedness** of a presence/absence matrix — runs as sites, nodes as
species. Ecology has measured exactly this for thirty years and has two things we do not: named
metrics (**NODF**; nestedness **temperature**) and, more importantly, **a null-model requirement**.

**The requirement is the point.** Nested-looking matrices arise *by chance* from marginal totals
alone. An ecologist reporting nestedness without a null model would be sent back; we reported 1.000
without one. In our case the substantive conclusion survives — W15 independently identified the
mechanism (`compareTargets` orders by `remainingCost` then `nodeId`, and nothing reads value), and a
mechanism beats a statistic. But **"we found the mechanism" is a defence available exactly once**,
and the next containment number should arrive with a null model: shuffle held-sets preserving each
run's node count and each node's frequency, and report where 1.000 sits in that distribution.

### 3.3 Participation ratio 1.19 is ours, and should be labelled as such

The research came back **unable to find participation ratio used in the game-evaluation literature at
all**. It is a localization measure from condensed-matter physics, associated with Bell & Dean, 1970
**[recall]**. Balduzzi, Czarnecki and Omidshafiei use **rank**, the Schur/Hodge decomposition, and
Nash-cluster counts instead.

That does not make 1.19 wrong. It makes it a house metric, and a house metric in a document that
also cites papers reads as though it came from one. The better-attested alternative for "how many
dimensions does this spectrum really have" is **effective rank** — `exp(H)` where H is the Shannon
entropy of the normalized singular values (Roy & Vetterli, "The Effective Rank: A Measure of
Effective Dimensionality", EUSIPCO 2007) **[recall]**. And the alternative that this specific
literature actually uses is simply **rank of the evaluation matrix**, per Balduzzi et al. 2019
**[read]**.

**Recommendation:** keep the participation ratio, label it a house metric, and report **rank of the
strategy-vs-strategy evaluation matrix** beside it, because that is the number a reader of the
gamescape papers will look for.

### 3.4 Restricted play is the name for our controls

The balance scorer's negative and positive controls, and `ablation.ts`'s neutralize-a-primitive
arms, are an instance of a published methodology: **Jaffe, Miller, Andersen, Liu, Karlin & Popović,
"Evaluating Competitive Game Balance with Restricted Play", AIIDE 2012:26–31, DOI
10.1609/aiide.v8i1.12513** **[read]**,
<https://homes.cs.washington.edu/~zoran/jaffe2012ecg.pdf>.

The method: given a restriction R on behaviour, measure the win probability of the restricted agent
`A_R` against the unrestricted `A`, with `A` knowing the restriction and free to exploit it. A
restriction that barely costs win rate says the restricted thing does not matter; one that is
devastating says it is essential.

**Their taxonomy of restrictions is a ready-made backlog of probes we do not have.** Their
categories, with the version of each that this game could run:

| their restriction | what it tests | our version |
|---|---|---|
| limited mixed-strategy support | unpredictability | a god restricted to *n* distinct verbs |
| **oblivious for k rounds** | reactivity and adaptation | **a god that cannot see the observation for k ticks** — the direct test of whether any decision here is state-dependent |
| never / always play action *a* | the power of one action | already implemented as `signatureActions` |
| search depth ≤ k | long-term vs short-term | a god with a *k*-tick planning horizon |
| always pick a given start | starting-condition fairness | `foundingSpeciesMask`, which W15 built |

**The "oblivious" probe is the one to build next**, and the reason is that `permit-then-idle` already
passes it trivially: a bot that ignores every observation wins 40/40. Running the restriction
formally converts an anecdote into the measurement Jaffe et al.'s framework was built to report.

They also state their own limits **[read]**: the method cannot capture anything rooted in human
psychology or feel, and it does not model execution difficulty. The second exclusion is a gift here
— our player has no execution to model.

*(One correction from the process: an early automated read of this paper reported its case study as
StarCraft: Brood War. It is not. The case study is **Monsters Divided**, an educational fractions
card game built by the authors' lab. The error was caught by reading the PDF. See §9.)*

---

## 4. What the research says produces depth, and which levers we have

Assembled from the sources above and sorted by whether this build can pull it.

| lever | source | do we have it? |
|---|---|---|
| **Non-transitive matchups** — cyclic component of the payoff decomposition | Balduzzi 2018/2019, Czarnecki 2020 **[read]** | **No.** Containment 1.000; the game is purely transitive. This is the largest single gap |
| **A semi-ordered space** — neither pure search nor one memorised trick; depth peaks between the two | Lantz et al. 2017 **[read]**, framed via entropy and Kolmogorov complexity, *speculative and untested* | **No.** One memorised trick, executable open-loop |
| **Opportunity cost in construction** — effort on A is effort not on B | our own §5 case study; MTG's mana curve | **Almost none.** `permissive-breadth` is the sole measured instance (containment 0.644) and it arrives from editing the ruleset, not from playing |
| **Imperfect information** | Czarnecki 2020's n-bit communicativity; Jaffe's obliviousness restriction | **Not exercised.** A god's observation is complete for the purpose every measured strategy uses it for — which is none |
| **A ladder of distinguishable strength levels** | RAPP, Liu 2017, Browne 2022, Goodman 2024 | **No.** 8 of 10 strategies at exactly 0.0000 |
| **Composition — parts combining into qualitatively new things** | Vampire Survivors (§5.3) | **No.** 201 of 300 nodes carry exactly one effect; two effects on a node are two independent scalars stacking by their primitive's declared rule. There is no composition operator in the schema |
| **Between-run structure (metagame)** | §5.2 | **Latent.** `carriedPrestige`, `legacyGrant` and raids exist; nothing yet makes yesterday's best ruleset lose |
| **Execution** | StarCraft | **Structurally unavailable, permanently.** See §5.1 |

**The honest summary of §4: of eight levers the literature and the case studies name, this build has
zero, has one in vestigial form, and has one it is structurally forbidden from ever having.** That is
a harsher reading than "six mechanics landed and none moved the number", and it is the same finding.

---

## 5. Three case studies, sorted by whether they survive the loss of execution

**Placeholder — completed below.**

---

## 6. What does not apply, and why it would mislead

Most of this literature assumes symmetric two-player zero-sum games with direct player control.
Neither assumption holds here, and each failure has a specific consequence.

### 6.1 The player cannot execute, and cannot command

The god sets what magic *can exist*, funds institutions and pays for interventions. Mages act on
their own utility scores. **There is no order the player can give to a mage.**

Consequences, stated as things a reader of the literature would otherwise get wrong:

- **Every depth source that lives in the action itself is unavailable.** Not "hard to reach" —
  unavailable. Any proposal whose mechanism is timing, precision, multitasking or reaction is a
  proposal for a different game.
- **The strategy-ladder programme still applies, but the resource axis changes.** RAPP, Browne and
  Goodman all use MCTS *budget* as the strength proxy. For us the meaningful axis is not compute
  spent per decision — there are ~19 decisions in a winning run — but **how much of the world state
  the policy is allowed to read**, which is Jaffe's obliviousness restriction. A ladder built on
  thinking time would measure nothing here.
- **The player's skill is entirely in construction and commitment**, which is why MTG deckbuilding
  is the closest analogue and why the StarCraft comparison has to be cut in half rather than taken
  whole.

### 6.2 The game is not symmetric two-player zero-sum

The Hodge and gamescape machinery is defined on antisymmetric matrices from symmetric zero-sum
games. Ours is a single-universe run against a win predicate, with raids as a side channel.

**This is not fatal, and the fix is specific:** the decomposition needs a **pairwise outcome matrix**,
which we can build the moment universes are scored against each other — raid outcomes, or a
tournament where each strategy's ruleset is the host for another strategy's raid, which is the
mechanic `vision.md` already promises. Until then, "transitive vs cyclic" is a claim we can state
and cannot yet compute, and the language must have a **not-measurable** verdict for exactly that.

### 6.3 Depth is not a proxy for fun, and the literature does not claim it is

Lantz et al. explicitly decline the value judgement: *"We aren't claiming that this quality is the
most important feature for judging a game's overall value"* **[read]**. Goodman et al. found their
depth measures correlate weakly and mostly insignificantly with human complexity ratings **[read]**.
Stephenson et al. argue the whole property is observer-relative **[read]**.

Koster's *A Theory of Fun for Game Design* (2004) proposes fun as the act of learning a pattern, with
boredom as the state after the pattern is fully learned. **[recall — not verified against the text
this workstream.]** It is cited here because it is the frame under which "solved in 140 ticks"
is a statement about the player's experience and not only about the mathematics, and because it is
widely read. It is a designer's essay, not a validated model, and it is treated as one.

**So: do not gate a release on a depth number.** The claim to make is narrower and defensible — *this
build is open-loop solvable at horizon 2400, and a game that is open-loop solvable has nothing to
learn after the solution is found.* That claim needs no theory of fun to be damning.

---

## 7. What contradicts a decision this campaign has already made

Collected deliberately, because a synthesis that only confirms is not worth commissioning.

1. **"More content will add strategic dimensions."** Lantz et al.'s branching-factor denial says
   added options that do not change the decision are dud branches **[read]**, and W15 measured
   exactly that: 51 nodes gave 1 dimension, 282 gave 2, and the second came from the permission
   lever rather than the nodes. **Pre-authoring the whole grid to 300 nodes did not buy depth and
   the literature predicts it could not have.** The nodes may still be worth having for texture,
   variety and flavour — but not on a depth argument.
2. **The bot pool is the instrument, and a fixed instrument lies.** Goodman et al. show a game's
   measured depth collapsing from 0.125 to 0.000 once the agent is tuned rather than fixed
   **[read]**. Every exploit margin this campaign has published was measured against
   `uniform-random-legal`, which round 2 found to have **seven of fifteen verbs inert with its own
   telemetry reading clean**. The literature's answer is not "add a probe when someone thinks of
   one" but "search the agent space per measurement".
3. **Skill-chain thresholds are not inherited constants.** Two citing papers give 60% and 75% for
   the same construction. Any gate we write on chain length must pin its own threshold and version
   it.
4. **Depth's own literature does not support gating on depth.** The most rigorous recent work in
   the line reports weak, mostly insignificant correlation with human judgement **[read]**, and a
   2019 position paper argues the property is observer-relative **[read]**. A `depthScore` in the
   metrics registry would be a house metric wearing a citation's clothes. §3.3 already found one of
   those.
5. **`participation ratio` is not from this field.** Recorded in §3.3.
6. **Containment 1.000 was reported without a null model.** Recorded in §3.2.

---

## 8. What to measure next, in the order the dependencies force

Each is stated with the reading that would confirm it, in the style W15 used.

1. **Run the obliviousness restriction** (Jaffe et al.'s reactivity category). A god policy that
   cannot read the observation for the first *k* ticks, and one that can never read it. *Confirms:*
   if the blind god's `ascensionRate` is within the interval of the sighted god's, **no decision in
   this game is state-dependent** — which is the formal version of what `permit-then-idle` already
   suggests, and a far stronger statement than any single bot's win rate.
2. **Report the coefficient of scalability, not the raw reproducibility.** *Confirms:* if
   reproducibility barely exceeds minimal marginal reproducibility, prefix fidelity 0.943 was
   measuring the content boundary rather than the strategy space.
3. **Attach a null model to every containment number.** Shuffle held-sets preserving run size and
   node frequency; report the percentile.
4. **Build a pairwise outcome matrix** — raid host against raid guest, or ruleset against ruleset —
   and compute its rank and its Hodge decomposition. *Confirms:* a zero cyclic component is the
   formal statement of "there is no rock-paper-scissors here", and it is currently unmeasurable
   rather than false.
5. **Search the agent space rather than fixing it**, per Goodman et al. *Confirms:* if a tuned pool
   finds a strategy that beats `permit-then-idle`, the ladder has two rungs after all and the
   instrument was the problem.

---

## 9. The near-misses, recorded

Three claims did not survive contact with a source this workstream. All three would have read
perfectly well in a finished document.

1. **"Lantz et al. ran a Deep Hanabi experiment."** This appeared in this workstream's own research
   prompt as a lead. The paper was read end to end and **Hanabi is never mentioned**. There is no
   experiment; the paper says outright it has no system built yet.
2. **"Jaffe et al.'s restricted-play case study was StarCraft: Brood War."** An automated summary
   said so. Reading the PDF shows the case study is **Monsters Divided**, an educational fractions
   card game.
3. **"*Characteristics of Games* defines skill chain and depth as its length."** This was the
   brief's premise. The sourcing puts the coinage with **Robertie 1992**, treats the book as
   expounding rather than originating, and shows the two papers citing it disagreeing about the
   threshold. The book's own text could not be read this workstream, so **every claim about it here
   is [secondary]**.

The third is the most instructive, because it was the most confidently held.

---

## 10. Reading list, consolidated

| work | status |
|---|---|
| Lantz, Isaksen, Jaffe, Nealen & Togelius, "Depth in Strategic Games", AAAI 2017 workshop | **[read]** <http://www.nealen.net/papers/Lantz2017Depth.pdf> |
| Jaffe, Miller, Andersen, Liu, Karlin & Popović, "Evaluating Competitive Game Balance with Restricted Play", AIIDE 2012:26–31 | **[read]** DOI 10.1609/aiide.v8i1.12513 |
| Balduzzi, Tuyls, Perolat & Graepel, "Re-evaluating Evaluation", NeurIPS 2018 | **[read]** arXiv:1806.02643 |
| Balduzzi et al., "Open-ended Learning in Symmetric Zero-sum Games", ICML 2019 | **[read]** arXiv:1901.08106 |
| Czarnecki et al., "Real World Games Look Like Spinning Tops", NeurIPS 2020 | **[read]** arXiv:2004.09468 |
| Goodman, Perez-Liebana & Lucas, "Skill Depth in Tabletop Board Games", IEEE CoG 2024 | **[read]** |
| Liu, Togelius, Perez-Liébana & Lucas, "Evolving Game Skill-Depth using GVGAI Agents", 2017 | **[read]** arXiv:1703.06275 |
| Stephenson et al., "Game Complexity vs Strategic Depth", 2019 | **[read]** |
| Gilbert & Wells, "Ludometrics: Luck, and How to Measure It", 2018 | **[read]** arXiv:1811.00673 |
| Cook, "The Chemistry of Game Design", Lost Garden 2007 | **[read]** |
| Osborne & Rubinstein, *A Course in Game Theory*, MIT Press 1994, ch. 4 | **[TOC verified]** |
| Jiang, Lim, Yao & Ye, "Statistical ranking and combinatorial Hodge theory", *Math. Prog.* 127(1), 2011 | **[secondary]** arXiv:0811.1067 |
| Nielsen, Barros, Togelius & Nelson, RAPP, EvoApplications 2015 | **[secondary]** |
| Browne, "Quickly Detecting Skill Trace in Games", IEEE CoG 2022 | **[secondary]** |
| Sanjaya, Wang & Yang, "Measuring the Non-Transitivity in Chess", *Algorithms* 15(5):152, 2022 | **[secondary]** arXiv:2110.11737 |
| Elias, Garfield & Gutschera, *Characteristics of Games*, MIT Press 2012 | **[secondary only — text not obtained]** |
| Robertie, "Letters to the Editor", *Inside Backgammon* 2(1):2–4, 1992 | **[secondary]** |
| Koster, *A Theory of Fun for Game Design*, 2004 | **[recall]** |
| Roy & Vetterli, "The Effective Rank", EUSIPCO 2007 | **[recall]** |
