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

**What we measured**: rank the nodes by how many runs hold them; for a run holding *k* nodes,
predict "the top *k*". Mean overlap 0.943; exactly right on 65 of 84 runs.

**What that is**: a claim that a set of binary items forms a **cumulative unidimensional scale** —
holding item *i* implies holding every item ranked above it, so the whole response pattern is
recoverable from the score alone. That is **Guttman scalogram analysis** (Guttman, L., "A Basis for
Scaling Qualitative Data", *American Sociological Review* 9(2):139–150, 1944, DOI 10.2307/2086306)
**[citation verified via Crossref]**, and the fraction of cells correctly reproduced from the score
is the **coefficient of reproducibility**, `CR = 1 − errors/entries`. **Our prefix fidelity is a
coefficient of reproducibility under a different name**, and 0.943 clears the customary CR ≥ 0.90
threshold for calling a set of items scalable.

**The caveat our version does not carry, and it is the important one.** CR is *inflated by extreme
item marginals*: if almost every run holds almost every node, "predict the top k" is nearly right by
arithmetic and reports structure that is not there. Our data has exactly that pathology — **three
strategies hold the identical fifty-one nodes in all twelve runs**, because 51 is the entire
reachable set. W15 pre-registered that as forced by the content boundary, to its credit, but the
number 0.943 does not know it.

The established corrections, all verified to exist:

- **Minimal marginal reproducibility (MMR)** — what CR would be from predicting each item's modal
  response alone. The floor CR must be judged against. *(Standard in applied use; no originating
  citation could be pinned — flagged as unverified provenance.)*
- **Coefficient of scalability** — how far CR exceeds MMR. Menzel, H., "A New Coefficient for
  Scalogram Analysis", *Public Opinion Quarterly* 17(2):268, 1953, DOI 10.1086/266460 **[verified]**.
- **Loevinger's H** — Loevinger, J., *Psychological Bulletin* 45(6):507–529, 1948, DOI
  10.1037/h0055827 **[verified]**.

**We should be reporting the gap, not the raw number.** And if the project ever wants a probabilistic
rather than deterministic claim, the modern successor is **Mokken scale analysis** (Mokken, R.J., *A
Theory and Procedure of Scale Analysis*, De Gruyter Mouton 1971, DOI 10.1515/9783110813203; Sijtsma
& Molenaar, *Introduction to Nonparametric Item Response Theory*, Sage 2002, DOI
10.4135/9781412984676; van Schuur, "Mokken Scale Analysis: Between the Guttman Scale and Parametric
Item Response Theory", *Political Analysis* 11(2):139–163, 2003, DOI 10.1093/pan/mpg002) **[all
verified]** — which replaces Guttman's deterministic "must" with "more likely", and has a maintained
implementation in the `mokken` R package.

*(A tempting claim was checked and does not hold as usually stated: "a Guttman scale is the limiting
case of a Rasch model as discrimination → ∞". The strict Rasch model has **no free discrimination
parameter** to send to infinity. It is true of the 2PL logistic model, as a fact about the logistic
function rather than a result anyone states. Do not write it with "Rasch" in it.)*

### 3.2 Cross-strategy containment 1.000 is nestedness — and it is not a second finding

**What we measured**: `|A∩B| / min(|A|,|B|)` = 1.000 for every cross-strategy pair inside v1.

**What that is**: perfect **nestedness** of a presence/absence matrix — runs as sites, nodes as
species. Ecology has measured exactly this for thirty years and has two things we do not: named
metrics, and a null-model requirement.

- Atmar, W. & Patterson, B.D., "The Measure of Order and Disorder in the Distribution of Species in
  Fragmented Habitat", *Oecologia* 96(3):373–382, 1993, DOI 10.1007/BF00317508 **[verified]** —
  nestedness *temperature*.
- Almeida-Neto, Guimarães, Guimarães Jr., Loyola & Ulrich, "A consistent metric for nestedness
  analysis in ecological systems: reconciling concept and measurement", *Oikos* 117(8):1227–1239,
  2008, DOI 10.1111/j.0030-1299.2008.16644.x **[verified]** — the **NODF** metric. Its abstract
  states the problem directly: widely-used nestedness metrics *"inappropriately detect patterns in
  randomly-structured matrices and are prone to Type I errors."*
- Gotelli, N.J., "Null Model Analysis of Species Co-occurrence Patterns", *Ecology*
  81(9):2606–2621, 2000 **[verified]**; Ulrich, W. & Gotelli, N.J., "Null Model Analysis of Species
  Nestedness Patterns", *Ecology* 88(7):1824–1831, 2007, DOI 10.1890/06-1208.1 **[verified]**;
  Ulrich, Almeida-Neto & Gotelli, "A consumer's guide to nestedness analysis", *Oikos* 118(1):3–17,
  2009, DOI 10.1111/j.1600-0706.2008.17053.x **[verified]**.

**The null-model requirement is the point.** Nested-looking matrices arise by chance from marginal
totals alone. An ecologist reporting nestedness without one would be sent back; we reported 1.000
without one.

**And there is a sharper problem, found by asking the question properly.** Prefix fidelity and
containment are not two independent confirmations of the same conclusion. **One entails the other.**
If every run's held set is a prefix of one fixed node ordering, then for any two runs with
|A| ≤ |B| we have A ⊆ B by construction, so `|A∩B| / min(|A|,|B|)` is exactly 1.000 — *arithmetic,
not evidence*. Perfect containment is a **corollary** of a perfect Guttman scale.

So the campaign's five independent confirmations of content exhaustion are at most four. This does
not overturn the conclusion — W15 independently identified the mechanism (`compareTargets` orders by
`remainingCost` then `nodeId`, and nothing reads value), and a mechanism beats a statistic. But
**counting a corollary as corroboration is how a wrong conclusion would have survived too**, and the
next containment figure should arrive with a null model: shuffle held sets preserving each run's node
count and each node's frequency, and report where 1.000 sits in that distribution.

**The order-theoretic statement is the crisp one.** A family of sets in which every pair is
comparable under inclusion is a **chain**; the poset of our strategies under inclusion has **width
1**. Dilworth's theorem — the maximum antichain size equals the minimum number of chains covering a
finite poset, and that common value is its width (Dilworth, R.P., "A Decomposition Theorem for
Partially Ordered Sets", *Annals of Mathematics* 51(1):161–166, 1950, DOI 10.2307/1969503)
**[verified]** — gives the design target a number: **we want measured width > 1.** That is the single
most compact statement of what this game needs, and `design-language.md` makes it a checkable claim.

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
| **A commitment with a losing state** — an opening that is a bet, not a freebie | StarCraft's cheese/greed structure (§5.1) **[read]** | **No.** No world state exists in which permitting everything is worse than not. 96 favor against a 2,400+ budget |
| **Imperfect information** | Czarnecki 2020's n-bit communicativity; Jaffe's obliviousness restriction | **Not exercised.** A god's observation is complete for the purpose every measured strategy uses it for — which is none |
| **A ladder of distinguishable strength levels** | RAPP, Liu 2017, Browne 2022, Goodman 2024 | **No.** 8 of 10 strategies at exactly 0.0000 |
| **Composition — parts combining into qualitatively new things** | Vampire Survivors (§5.3) | **No.** 201 of 300 nodes carry exactly one effect; two effects on a node are two independent scalars stacking by their primitive's declared rule. There is no composition operator in the schema |
| **Between-run structure (metagame)** | §5.2 | **Latent.** `carriedPrestige`, `legacyGrant` and raids exist; nothing yet makes yesterday's best ruleset lose |
| **Execution** | StarCraft | **Structurally unavailable, permanently.** See §5.1 |

**The honest summary of §4: of nine levers the literature and the case studies name, this build has
none outright, has one in vestigial form, has one latent, and has one it is structurally forbidden
from ever having.** That is a harsher reading than "six mechanics landed and none moved the number",
and it is the same finding.

**If only one is to be pursued, it is opportunity cost, and the reason is that it is the cheapest.**
Composition (Vampire Survivors) needs a schema change and a content pass; non-transitivity needs a
pairwise outcome matrix that does not yet exist; a metagame needs the raid loop to bite. But a
constrained construction budget is *arithmetic*, and §5.2 shows it is one number away: an MTG deck
cannot hold every card, and our ruleset can. Nothing else on this list can be tried as cheaply, and
nothing else is as directly implicated by `permit-then-idle`.

---

## 5. Three case studies, sorted by whether they survive the loss of execution

Three games were named as reference points: StarCraft, Magic: The Gathering, Vampire Survivors. They
were chosen well, because each produces depth by a different mechanism and only some of those
mechanisms survive a player who cannot act.

**Two premises attached to the choice did not survive checking, and both are stated first, because
each was going to become a design argument.**

### 5.0 The two premises that failed

**"StarCraft's matchups are famously non-transitive."** No measured evidence for this could be
found. Aligulac's balance report could not be retrieved; the essays that do engage with Aligulac's
data argue the opposite direction — that aggregate race win rates are *confounded by dominant
individual players and matchup specialists* rather than showing a cycle
(<https://www.illiteracyhasdownsides.com/p/how-much-do-dominant-players-affect>) **[read]**. No
academic paper measuring race-matchup intransitivity in StarCraft was found. Day[9] reportedly
**argues against** the rock-paper-scissors reading, on the grounds that skilled players read triggers
and are not surprised by an opening **[recall — search summary only]**.

**Verdict: "SC races are RPS" is community folklore, unconfirmed in either direction.** Win rates
cluster near 50% and move with patches, which is equally consistent with a tight transitive hierarchy.

**"The aggro/control/combo triangle is the canonical non-transitive structure."** Same result. The
folklore is easy to find and states itself confidently; the same enthusiast sources immediately
caveat that "the real metagame is far messier". **No win-rate matrix — 17lands, MTGGoldfish or
otherwise — establishing the cycle empirically was found.**

**Verdict: folklore, unconfirmed.** This matters more than it looks. The campaign's stated design
target is "get the rock-paper-scissors structure MTG has". If MTG's triangle is not demonstrably
cyclic, then **the target is being copied from a game that may not have it**, and the honest target
is the weaker, checkable one that Dilworth gives us: *a strategy poset of width greater than 1*.
Incomparability is achievable and measurable. A cycle is a stronger claim and we have no verified
example of one in a commercial game to copy — the only verified measurement of non-transitivity in a
real game found this workstream is **chess** (Sanjaya et al. 2022, §2.6), which nobody thinks of as
rock-paper-scissors.

### 5.1 StarCraft — mostly unavailable, and the surviving part is the interesting part

**Where its depth lives.** Execution (micro, macro, APM, multitasking), information (scouting and the
read), and commitment (the opening).

**What survives losing execution: commitment and information. Nothing mechanical.**

The build order is the transferable idea, and Liquipedia states its structure precisely
**[read**, <https://liquipedia.net/starcraft/index.php?title=Cheese&action=raw>**]**: cheese is
*"hard to beat if not scouted but easy to defeat if it is"*, requires *"a great sacrifice of
economy"*, and leaves a failed player *"far behind in the game"*. Liquipedia's build-order page adds
the read-and-counter-read layer: players scout to identify openings, and deliberately build
misleading structures to bait a false read
**[read**, <https://liquipedia.net/starcraft/index.php?title=Build_order&action=raw>**]**.

**Strip the execution and that structure is intact.** It is a resource-allocation decision made
before the window opens, with an upside conditional on the opponent's unknown choice and a downside
if read. Our god makes exactly that kind of decision and could make it under exactly those terms.

**What we measurably do not have is the downside.** Permitting the entire grid costs 5 techniques ×
8 favor + 14 forms × 4 favor = **96 favor**, against a floor income of 1 favor per world tick with no
worship at all *(computed from `packages/content/data/god-cost.json` and `god-constant.json`;
`favor-regen-base` is 1024 at fp scale 1024)*. Ninety-six ticks of the cheapest income the game
offers, out of 2,400. `permit-then-idle` does it in 140 and then stops playing.

**There is no world state in which permitting everything is worse than not permitting it.** That is
the precise, checkable sense in which our opening is not a build order: **a build order is a
commitment, and a commitment has a state where it loses.** `design-language.md` makes that a claim
form, because it is the one StarCraft idea that transfers whole and the one this game most obviously
fails.

The information half also survives in principle and is currently vacuous: our god's observation is
complete for the purpose every measured strategy uses it for, which is none.

**What does not transfer, and would mislead if borrowed:** anything whose mechanism is timing,
precision, multitasking, reaction, or the physical act of scouting. STARDATA frames fog-of-war
recovery as a core open problem and notes professional humans are *"very efficient in handling
partial observations"* **[read**, arXiv:1708.02139**]** — that efficiency is a skill of the player's
hands and attention, and we have neither.

### 5.2 Magic: The Gathering — the closest analogue, and the sharpest contrast

**Where its depth lives.** Combinatorial construction before play; a metagame between games; and
piloting during play.

**The structural analogy is real and worth stating exactly.** A god's permitted ruleset *is* a deck:
chosen before play, then executed by something other than the player. Both are construction problems
under a resource constraint whose output is handed to a process the constructor does not command.

**What makes construction hard in MTG is a resource curve, and the mathematics is public.** Frank
Karsten's land-count work derives counts from the hypergeometric probability of hitting land drops
on curve: roughly **19–22 lands for a 0.5–2.1 mean-mana-value deck, 23–26 for 2.1–3.3, 27 for 3.3+**
**[secondary** — the figures are corroborated by an independent source citing and quoting the
article, <https://gist.github.com/teryror/881d60e08480a56043895d3bbb83c374>; Karsten's own text could
not be parsed**]**.

**Read that against our god's currency.** Our whole grid costs 96 favor and a run supplies at least
2,400. **There is no curve.** An MTG deck cannot contain every card because sixty slots and a mana
curve forbid it; our ruleset can contain every cell because nothing forbids it. The single most
transferable MTG idea is not the archetype triangle — which §5.0 found unverified — it is that
**construction must be constrained enough that including one thing excludes another**. Our
construction is unconstrained, and that is one arithmetic fact away from being the whole finding.

**Rosewater on degeneracy is worth quoting because it names the failure mode as a design problem
rather than a balance number** **[read**,
<https://magic.wizards.com/en/news/making-magic/banned-run-2003-02-17>**]**:

> We ban and restrict cards because we believe there is something worse than not allowing players to
> use a particular card, and that is having a play environment become so degenerate that the game is
> no longer fun.

That is precisely our situation with `permit-then-idle`, and the response Rosewater describes — ban
it — is not available to us, because `permit-then-idle` is not a card. It is the shape of the whole
decision.

**The complexity result is a gift to §2.1 and should be read carefully.** Churchill, Biderman &
Herrick, "Magic: The Gathering is Turing Complete", arXiv:1904.09828, also FUN 2021 **[read]**, show
that determining the outcome of optimal play is equivalent to the halting problem, using
standard-size tournament-legal decks and no randomness or hidden information. **But the construction
requires that all moves of both players are forced.** Undecidability is achieved with *zero
meaningful choice*. Relatedly, Chatterjee & Ibsen-Jensen, "The Complexity of Deciding Legality of a
Single Step of Magic: The Gathering", ECAI 2016 **[read]**, show single-step legality is
**coNP-complete**, dropping to **P** if either of two small card sets is excluded.

**That is the depth-is-not-complexity distinction in its most vivid available form**: the most
computationally intractable known result about MTG lives in a position where nobody has a decision to
make. Anyone arguing that our 70-cell grid and 300 nodes constitute depth should read that sentence
twice.

**What survives losing execution:** construction, metagame positioning, and the designer-side
intervention against degeneracy. **What does not:** piloting — sequencing, mulligans, combat math,
bluffing, tempo. That split is well recognised in the community; **no source quantifying it was
found**, including at 17lands, whose "Using Win Rate Data" post acknowledges skill-testing cards
qualitatively and gives no variance decomposition **[read]**.

**The metagame question.** MTG's depth lives substantially *between* games: the field shifts,
yesterday's best deck loses. This project can have that — `carriedPrestige`, `legacyGrant` and raids
across universes are all built. **But no formal treatment of MTG archetype cycling was found** — no
replicator-dynamics or evolutionary-game-theory paper on it. So the between-run lever is real,
promising, and **supported by no literature this workstream could verify**. Design it if it is
wanted; do not claim research backing for it.

The one mechanism that would give it teeth is already in `vision.md`: raids are arbitrated by the
**host universe's ruleset**. That makes a ruleset a thing another player must beat, which is the only
route found in this whole synthesis by which our game acquires a genuine pairwise outcome matrix —
and therefore the only route to computing a cyclic component at all (§6.2).

### 5.3 Vampire Survivors — the existence proof, and the one to copy

**Structurally the closest to our loop despite looking nothing like it.** The player sets things up
and watches autonomous action resolve. It is the existence proof that compositional discovery can
carry a game whose player barely acts.

**The evolution mechanic, precisely.** A weapon evolves when it is levelled to maximum (usually 8)
while the player holds the required passive item — usually also maxed, with named exceptions
(Infinite Corridor, Crimson Shroud, Sole Solution, Ashes of Muspell, and all Moonspell-DLC
evolutions) — and then **opens a treasure chest dropped by a boss at or after the 10-minute mark**.
A separate **Union** merges two maxed weapons rather than a weapon and a passive, on the same chest
trigger. **[read**, <https://vampire.survivors.wiki/w/Evolution>**]**

**How many.** Version-dependent, and both figures found are reported rather than one being chosen:
the base game has **21 weapon evolutions and unions**, with **+7** from Legacy of the Moonspell and
**+7** from Tides of the Foscari **[read**, choostgames.com**]**; a source dated to v1.13 headlines
**74+ across the base game and seven DLCs** **[read**, rogueranker.com**]**. The game has shipped
continuous content, so any single number is a snapshot.

**Why an evolution reads as a discovery rather than a tier-up.** Four properties, and every one is a
schema property rather than a tuning value:

1. **It is a conjunction of two different kinds of thing.** Weapon *and* passive — not "this weapon,
   more". The recipe is not derivable from either ingredient's own progression.
2. **The result is qualitatively different**, not the same effect with a bigger scalar.
3. **It is gated on a third, timed event** — the boss chest at 10:00 — so it arrives as an occasion
   rather than a threshold silently crossing.
4. **It is not announced.** Neither wiki page fetched mentions an in-game hint system for pairings
   *(an absence of mention, not a confirmed absence — flagged as weaker evidence)*. The recipe is
   knowledge the player brings, which is exactly Koster's frame: the fun is in learning the pattern.

**What stops the set collapsing to one best build.** The verified answer is a slot economy plus a
rule-modifier layer:

- **Six weapon slots**, with a documented exception for stage-specific pickups **[read**,
  <https://vampire.survivors.wiki/w/Weapons>**]**. Six of the available weapons, and taking one means
  not taking another — **opportunity cost, enforced structurally.** *(The commonly repeated "six
  passive slots" could not be verified — the wiki returned 402. Treat as unverified.)*
- **Arcanas: 22 regular plus 12 "Darkanas", of which up to 3 are active in a run**, one chosen at run
  start and further ones offered at the **11:00** and **21:00** marks, with the choice pool widening
  to six options once 23+ are unlocked **[read**,
  <https://vampire.survivors.wiki/w/Arcana>**]**. Arcanas change rules categorically — Gemini gives
  listed weapons a paired counterpart — which reshapes **which evolutions are reachable at all** in a
  given run.

**That is the mechanism we lack, stated as a comparison rather than an aspiration:**

| | Vampire Survivors | Multiverse Mages, measured |
|---|---|---|
| composition | weapon + passive → a **different kind** of weapon | **none.** 201 of 300 nodes carry exactly one effect; 91 carry two; two effects are two independent scalars stacking by their primitive's declared rule |
| opportunity cost | 6 weapon slots out of many | **none inside a ruleset.** The whole grid costs 96 favor of a 2,400+ budget |
| rule modifiers per run | up to 3 Arcanas from 34, reshaping what is reachable | the god's permission set — but it is monotone and free, so every run reaches the same place |
| discovery | the recipe is unannounced knowledge | the acquisition order is a value-blind cost queue and the same every run |

**Two honest counterweights, because a case study that only flatters is not a case study.** Peter
Howell (University of Portsmouth) argues in *The Conversation* that Vampire Survivors' retention owes
substantially to a **near-miss effect** drawn from Galante's prior work in the gambling industry —
a run failing short of the 30-minute mark producing the same psychology as two of three slot symbols
**[read**,
<https://theconversation.com/vampire-survivors-how-developers-used-gambling-psychology-to-create-a-bafta-winning-game-203613>**]**.
And Galante's own account of development is *"mercenary"* and *"fire-and-forget"* — grabbing
sprite-pack assets, coding attack patterns on the spot, *"didn't have a vision"* **[read**, Bryant
Francis, *Game Developer*, 14 Aug 2024**]**. Whatever depth the evolution system has was **emergent,
not engineered**, and some of what looks like depth from outside may be a retention loop.

**Copy the mechanic. Do not copy the claim that it is what makes the game work.**

**What survives losing execution:** everything above. The only execution-dependent skill in Vampire
Survivors is real-time positioning and kiting — one verb, and the one we do not have. **This is why
Vampire Survivors is the right model and StarCraft is not.**

### 5.4 The summary table

Sources of depth across the three, sorted by the discriminating question.

| game | source of depth | survives no execution? |
|---|---|---|
| StarCraft | opening as a commitment with a losing state | **yes** — and we lack the losing state |
| StarCraft | information: when to commit, hedge or change plan | **yes** — currently vacuous for us |
| StarCraft | race/tech asymmetry | **yes** in principle; its non-transitivity is unverified |
| StarCraft | physically scouting | no |
| StarCraft | micro, APM, multitasking, build execution | no |
| MTG | construction under a resource curve | **yes** — and we have no curve |
| MTG | metagame positioning between games | **yes** — latent; no literature found |
| MTG | designer intervention against a degenerate environment | **yes** (designer-side) |
| MTG | piloting: sequencing, mulligans, combat math, bluffing | no |
| MTG | computational hardness of optimal play | orthogonal — and its own literature shows it coexisting with zero choice |
| Vampire Survivors | evolution: two kinds of thing composing into a third | **yes** — the direct model for a compositional content graph |
| Vampire Survivors | six-slot opportunity cost | **yes** |
| Vampire Survivors | Arcanas as per-run rule modifiers reshaping reachability | **yes** |
| Vampire Survivors | real-time positioning and kiting | no |
| Vampire Survivors | near-miss retry loop | yes (meta-loop) — and it is a retention mechanism, not depth |

**The pattern is consistent across all three genres**: what transfers is construction, allocation,
commitment under uncertainty, and content asymmetry; what does not is exactly what each community
already calls execution. That consistency is this workstream's own synthesis rather than a cited
result, and it is offered as such.

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
7. **Prefix fidelity and containment are not two findings.** Perfect containment is a *corollary* of
   a perfect prefix structure — arithmetic, not corroboration. The campaign's "five independent
   confirmations that the binding constraint is content exhaustion" is at most four. Recorded in
   §3.2, and it does not change the conclusion; it changes how much the conclusion is entitled to
   lean on that pair of numbers.
8. **The rock-paper-scissors target is copied from games not shown to have it.** Neither StarCraft's
   race matchups nor MTG's aggro/control/combo triangle could be verified as non-transitive by any
   measurement found; both are confidently-stated folklore. The only verified measurement of
   non-transitivity in a commercial game found this workstream is **chess**. Recorded in §5.0. The
   defensible target is not a cycle but **a strategy poset of width > 1** — incomparability, which
   is weaker, achievable, and checkable.
9. **Vampire Survivors' depth was not engineered.** Its designer describes the process as
   "fire-and-forget" with "no vision", and a published analysis attributes much of its retention to
   a gambling near-miss effect rather than to strategy. Copy the evolution mechanic; do not import
   the theory of why it works. Recorded in §5.3.

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
   threshold (60% vs 75%). The book's own text could not be read this workstream, so **every claim
   about it here is [secondary]**.
4. **"StarCraft's matchups are famously non-transitive"** and **"MTG's aggro/control/combo triangle
   is the canonical non-transitive structure."** Both were supplied as established. No measurement
   supporting either could be found; what was found for StarCraft argues the aggregate data is
   confounded rather than cyclic. See §5.0.
5. **"A Guttman scale is the limiting case of a Rasch model as discrimination → ∞."** Checked, and
   it is wrong as stated: the strict Rasch model has no free discrimination parameter. See §3.1.

Numbers 3, 4 and 5 are the instructive ones, because all three were held confidently and all three
were about to become design arguments. Two of them came from this workstream's own briefing. The
mechanism that caught them was the same every time — read the source, not a summary of it.

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
| Guttman, "A Basis for Scaling Qualitative Data", *ASR* 9(2):139–150, 1944 | **[citation verified]** DOI 10.2307/2086306 |
| Menzel, "A New Coefficient for Scalogram Analysis", *POQ* 17(2):268, 1953 | **[citation verified]** DOI 10.1086/266460 |
| Loevinger, *Psychological Bulletin* 45(6):507–529, 1948 | **[citation verified]** DOI 10.1037/h0055827 |
| Mokken, *A Theory and Procedure of Scale Analysis*, 1971 | **[citation verified]** DOI 10.1515/9783110813203 |
| Sijtsma & Molenaar, *Introduction to Nonparametric IRT*, Sage 2002 | **[citation verified]** DOI 10.4135/9781412984676 |
| van Schuur, "Mokken Scale Analysis", *Political Analysis* 11(2):139–163, 2003 | **[read]** DOI 10.1093/pan/mpg002 |
| Atmar & Patterson, *Oecologia* 96(3):373–382, 1993 | **[citation verified]** DOI 10.1007/BF00317508 |
| Almeida-Neto et al., NODF, *Oikos* 117(8):1227–1239, 2008 | **[citation verified]** DOI 10.1111/j.0030-1299.2008.16644.x |
| Gotelli, *Ecology* 81(9):2606–2621, 2000; Ulrich & Gotelli, *Ecology* 88(7):1824–1831, 2007 | **[citation verified]** |
| Ulrich, Almeida-Neto & Gotelli, "A consumer's guide to nestedness analysis", *Oikos* 118(1):3–17, 2009 | **[citation verified]** DOI 10.1111/j.1600-0706.2008.17053.x |
| Dilworth, "A Decomposition Theorem for Partially Ordered Sets", *Ann. Math.* 51(1):161–166, 1950 | **[citation verified]** DOI 10.2307/1969503 |
| Churchill, Biderman & Herrick, "Magic: The Gathering is Turing Complete", 2019 / FUN 2021 | **[read]** arXiv:1904.09828 |
| Chatterjee & Ibsen-Jensen, "Complexity of Deciding Legality of a Single Step of MTG", ECAI 2016 | **[read]** |
| Rosewater, "Banned on the Run", Wizards of the Coast, 2003 | **[read]** |
| Karsten, "How Many Lands Do You Need…", ChannelFireball, 2017 | **[secondary]** figures corroborated, original not parsed |
| Liquipedia, "Cheese" and "Build order" | **[read]** raw wikitext |
| Lin, Gehring, Khalidov & Synnaeve, "STARDATA", 2017 | **[read]** arXiv:1708.02139 |
| Vampire Survivors wiki: Evolution, Weapons, Arcana | **[read]** |
| Howell, "Vampire Survivors: how developers used gambling psychology…", *The Conversation*, 2023 | **[read]** |
| Francis, *Game Developer*, "Vampire Survivors development sounds like…", 2024 | **[read]** |
| Churchill & Buro, "Build Order Optimization in StarCraft", AIIDE 2011 | **[metadata verified only]** |
| Synnaeve & Bessière, "A Bayesian Model for Opening Prediction in RTS Games", CIG 2011 | **[metadata verified only]** |
