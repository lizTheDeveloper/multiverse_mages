<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Divine attention: strong on two, or weak on five

*Proposal, 2026-08-13, from the owner. It is the first proposed mechanic that a measurement asked for
before it was proposed.*

## The dial

A god's attention is finite and **spreadable**:

- **Concentrate** — a strong effect on **two** forms. High-talent casters arrive **early and from a
  small population**, because the talent threshold is easy to clear where attention is deep.
- **Spread** — a weak effect on **five**. High talent needs **a large population**, because each form
  is shallow — **but the magic is more useful, so it earns more worship.**

**Tempo against economy**, and both ends are viable openings rather than one being correct.

## Why this is not a new idea being invented

**The search already found these two archetypes and could not explain them.** Its two occupied
cells — the only two strategies beating the null ladder — were:

| strategy | ascended | nodesKnown | libraryDepth | terminalReason | **spendConcentration** |
|---|--:|--:|--:|--:|--:|
| `permissive-breadth` | 8/13 | 4 | 3 | 1 | **2** |
| `allocate-concentrate` | 13/13 | 4 | 3 | 2 | **1** |

**They are identical on every knowledge axis and differ only in how concentrated their spending is.**
That was recorded as a curiosity — the entire measured width of the strategy space resting on a
descriptor that reads the verbs rather than their consequences.

**This mechanic is what makes that difference have consequences.** The two archetypes exist as
*behaviours* today and buy nothing different; under the dial they buy different economies.

## Why the loop closes, using only mechanics that already work

Three existing systems supply every term, and none of them needs inventing:

1. **Worship saturates in three classes** — mage, university, populace, each with a per-head rate and a
   half-cap. **A populace class already means "more people, more worship."**
2. **`dailyRelevance` scales worship per cell** (W81), measured: `daily` versus `spectacle` widens from
   +23.0% to **+48.8%**. **"More useful magic earns more worship" is already implemented, per cell.**
3. **Worship now gates species capacity** — the god supports two peoples until enough of them believe.

So **spread → more relevant cells → more worship → more species → more population → the talent
threshold clears anyway.** The long way round, and it ends somewhere concentrate cannot reach.

And **concentrate → deep attention → talent early from few people → tempo**, which is the classic
rush, and it should stall where breadth compounds.

**The two paths are not the same queue.** That is the property this campaign has failed to produce for
weeks, and here it falls out of three mechanics already built rather than a fourth being added.

## What the dial actually is

**Not a new resource.** The god's attention is favor, and the spread is *how many cells the favor is
spread across* — which the harness is already measuring as `spendConcentration`, a Herfindahl over
favor spent by action id.

**The one new rule is that concentration buys depth.** Some function of "favor committed to this cell"
against "talent threshold for casters in this cell." Concentrate a fixed budget on two cells and the
threshold there falls far; spread it over five and each falls a little.

**Do not guess that function.** It is a scalar nobody can defend, which is exactly the class of
decision this project has been wrong about repeatedly. **Sweep it, with both degenerate ends as
controls** — a concentration bonus of zero (the dial does nothing, today's game) and one so steep that
spreading is never correct.

## The measurement that decides it

**Both ends must beat the null ladder, and they must occupy different cells.**

That is a sharper test than "is it balanced", and the instrument for it already runs: a mechanic where
only concentrate clears the floor is a mechanic that deleted a strategy rather than adding one. The
search reports `WIDTH` and `margin-over-null`, and this change should move **width** — which nothing
has yet.

**And watch the phase profile.** Concentrate should own the early game and mid game; spread should own
the late. If `mobilityByStrategy` shows either playing one move for the whole run, the dial is a
starting choice rather than a strategy — which is worth knowing, and is not what was asked for.

## Two risks worth stating

**Spread may simply be worse.** The measured all-six control had 324 living mages against elf-only's
2.84 — population differences in this simulation are enormous, and if the talent threshold is steep the
spread path may never clear it before the run ends. **That is what the sweep is for**, and a null here
is a real finding: it would mean the population curve, not the attention dial, is the binding term.

**And concentrate may be the ruleset-only exploit wearing a new hat.** `permit-then-idle` already wins
by permitting and then doing nothing; a dial that rewards narrow commitment could make that stronger
rather than weaker. **The null ladder is the guard**, and rung 2 is precisely the rung that would catch
it.
