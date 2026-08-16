<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# What balance means here, and what the game is about

*Owner, 2026-08-13. This corrects the search's objective function and states the thematic frame that
should decide arguments the measurements cannot.*

## We do not want perfect balance

**Some configurations should be bad.** A game where every ruleset is viable is not balanced, it is
**flat** — and flat is the failure this project has actually been living in. Sixty runs of
`passive-control` reaching the same 51 nodes as an archivist who built thirteen hundred universities
is not balance. It is an absence of consequence.

**What is wanted is a wide meta**: many genuinely viable ways to play, *and* a large surrounding space
of ways that do not work — where the not-working is **legible and learnable** rather than arbitrary.

### Which means the search's score was subtly wrong

The archive scores `width` — cells occupied by a strategy that beats the null ladder — and reports
`reachable-not-worth-playing` as a separate count. **I had that second number filed as waste.** It is
not. It is the meta's shape.

> **A cell nobody should play is content, provided a player can find out why.** The failures are half
> the game; a strategy space with no wrong answers has no right ones either.

So the objective is **not** to drive `reachable-not-worth-playing` to zero. It is to have both numbers
be large, with the failures **instructive** — which is exactly what the ladder's rung diagnosis
already provides. Losing to rung 1 (*the verbs do nothing*) and rung 3 (*a coin could do this*) are
different lessons, and a player who learns the difference has learned the game.

**The number to distrust is `width` alone.** A search that maximises it will find a flat meta, which
is where this project started.

## The literature, and what it actually says

Three sources worth reading before arguing about a balance number, and one caution about all of them.

**Elias, Garfield and Gutschera, *Characteristics of Games*** — the canonical text on this. Its useful
contribution here is that "balance" is several unrelated properties wearing one word: *fairness*
between players, *depth* (how long skill keeps mattering), *variety*, and the absence of *degenerate*
dominant strategies. **This project has been measuring the fourth and calling it the first three.**
The null ladder is a degeneracy check, not a depth measurement, and it should not be quoted as one.

**Restricted play (Jaffe et al.)** — a technique for measuring balance by *handicapping* an agent and
seeing what it can still achieve. **The null ladder is a restricted-play design and nobody involved
knew that**: `passive-control` is a maximally-restricted agent, `permit-then-idle` is restricted to
ruleset verbs, `uniform-random-legal` is restricted to no policy. The literature says this is a good
family of instruments, and it also warns what it cannot see — restricted play measures *whether* a
capability matters, not *how much fun* it is.

**Sirlin on degenerate strategies** — the practical version: a strategy is degenerate when it is
dominant *and* uninteresting, and those are two conditions. **`permit-then-idle` is exactly that
shape** and the campaign has treated its dominance as the whole problem. Its *dullness* is the other
half, and no metric here measures dullness.

**The caution**: all of this literature is about competitive games with human opponents. **Multiverse
Mages is mostly a single-player construction game that occasionally raids.** Fairness-between-players
is close to irrelevant until PvP; depth and variety are the whole thing. Do not import a matchup
matrix and call it balance.

## What the game is about

**It is a model of how hard it is to produce complex technology, told as magical academia.**

That is the thematic frame, and it decides arguments the measurements cannot. The frustrations are not
obstacles to the fantasy — **they are the fantasy**:

- **Knowledge decays.** Nobody maintains what they know for free, and publish-or-perish is the honest
  name for it.
- **Teaching is a bottleneck, not a broadcast.** A thing known by one mind is one death from gone.
- **Institutions are how knowledge outlives people**, and institutions are expensive, slow, and
  require someone to fund them before they pay.
- **You cannot decree progress.** The god sets what magic *can* exist and cannot make anyone discover
  it. **That is the central joke and the central truth.**
- **The prodigy is luck.** A civilisation that never produced the right student never learns that
  stone can be worked, however much worship it accrued.

**A player who finishes a run should understand, in their hands rather than in an argument, why
building a computer took a species several thousand years.** That is the design target, and it is
worth more than any balance figure.

## And it has to be strategic catnip

**Fun is a real constraint and this project has no measurement of it.** That is fine — it is not
measurable and should not be faked — but it means some decisions must be made on taste, and the taste
should be stated:

- **Legible causation.** A player must be able to work out *why* something happened. The interface
  prototypes exist for this, and `mage/`'s finding — that the read path cannot answer "why did she do
  that" — is a bigger problem than it looks.
- **Decisions with teeth, and they must bite in the same run.** A cost that never binds is not a cost.
  Free universities, an 84-favor whole grid, and unlimited grants are all the same defect.
- **Surprise that is fair.** The prodigy is random; the *consequences* of who you got must be
  followable. Random inputs, deterministic consequences.
- **The late game must be a different game.** The phase weighting (late 3 : mid 2 : early 1) is this
  taste written as arithmetic.

**Where a measurement and this document disagree, say so out loud rather than quietly picking one.**
A mechanic that measures well and is boring is a finding about the metric.
