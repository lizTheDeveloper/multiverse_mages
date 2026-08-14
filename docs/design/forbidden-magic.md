<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Forbidden magic, the Old Gods, and the cults

*Spec, 2026-08-13, from the owner. The last of the design arc, and the one that gives the game a named
antagonist and its meta-progression at the same time.*

## The shape

> Someone does something **dark and twisted** to gain access to **forbidden magic**, powered by **the
> Old Gods** — transcendent beings from previous prestige generations. They start **evil cults**, which
> bring **AI-controlled perma-raids of random magic**.

Four pieces, and three of them attach to things already in the codebase.

## The Old Gods are previous runs, and this is what `prestige` was for

**`prestigeCarryForward: true` is declared at `packages/scenario/src/executor.ts`. `carriedPrestige`
and `legacyGrant` have no production caller. Every reference state begins `prestige: 0`. Two authored
constants — `legacy-archive-max-tier` and `legacy-reference-tick` — are resolved and never consumed.**

The whole prestige cluster is built and unreachable. It was built to carry something forward between
runs and nothing was ever on the other end.

**The Old Gods are the other end — and they are specifically the adversaries you did not defeat.**

*Owner, correcting an earlier reading of mine:*

> **"Your undefeated adversaries are actually The Old Gods, who wait and use forbidden magic to
> fuck up your day."**

I had written that *ascended gods* carry forward. **It is the opposite, and the opposite is much
better: what persists is unfinished business.** A cult you survived but never broke does not
disappear when the run ends. **It waits.**

That inverts the meta-progression into something far stronger than a victory ledger:

- **Your failures accumulate as named antagonists**, with history, rather than difficulty scaling by a
  number.
- **"They wait" is the whole tone.** Not defeated, not dormant by accident — patient.
- **And it resolves a tension I flagged two paragraphs later.** I wrote that a perma-raid should be
  *"survivable indefinitely and never finished."* Survivable indefinitely, yes — but **never finishing
  it now has a price, paid in the next generation.** So a player has a real reason to try to end a
  cult rather than merely outlast it, and "I can tank this forever" stops being the correct answer.

**It also makes the difficulty curve authored by the player rather than by a constant.** A god who
cleans up their world faces a quiet next generation; a god who accumulates unresolved enemies inherits
all of them at once. **That is a ramp nobody has to tune**, which is worth noting in a project with
hundreds of untuned constants.

And it is thematically exact twice over. A thing that was never beaten, that had time and no body and
nothing else to do, is the correct origin for a transcendent horror — and **"I let that one go" is a
much better reason for a monster to exist than "I won."**

## Forbidding creates its own opposition, which is the mechanic

**This is the part that makes forbidden magic a *system* rather than a flavour, and it closes a loop
the campaign has been circling.**

Today forbidding is nearly free and nearly pointless: the whole grid costs 84 favor once, and
`decay.ts` charges forbidding with irreversible mastery loss — *"the whole mechanism by which
forbidding a cell actually costs a civilization something."*

**But knowledge that is forbidden does not vanish. It goes underground.**

    a god forbids a cell
        → the mages who held it do not forget instantly
        → what survives is unteachable, unscribable, illegal
        → and something is willing to preserve it
    → a cult

**Forbidding is how cults are made.** Not as a punishment for playing badly — as the *cost* of a
legitimate move. A god who forbids nothing has no cults and no control over what magic exists; a god
who forbids freely has a shaped world and an underground.

That makes forbidding **the most interesting verb in the late game** rather than the least, and it
does it by connecting three existing things: the ruleset verbs, `decay.ts`'s irreversible loss, and
the raid layer.

## Cults, and why perma-raids are the right pressure

A cult is an **AI-controlled persistent antagonist** that raids with **random magic** — magic drawn
from what it preserved and what the Old God grants, which is not the host's ruleset and does not
respect it.

Three reasons this fits rather than being bolted on:

- **§3's Portal Rule says a raid is arbitrated by the host universe's ruleset.** A cult raiding *with
  forbidden magic* is the interesting exception, and `mvee`'s `foreignMagicPolicy` already enumerates
  the four answers: `compatible` · `hostile` · `incompatible` · `absorbs`.
- **The raid layer exists and has nothing to do.** `@mm/rules-raid` is 4,525 lines with no dependents,
  every committed gate resolves zero raids, and `knowledge-steal` has zero castable nodes. **A
  perpetual antagonist is a reason for all of it to run.**
- **"Random magic" is a real answer to a real problem.** The campaign's central finding is that every
  universe holds the same knowledge. An opponent whose magic is *drawn* rather than developed is the
  one source of variety that does not depend on the player's own content ever diverging.

**Perma-raid means pressure that does not resolve**, which is what a late game needs to stop being an
accumulation phase. It should be *survivable indefinitely and never finished.*

## What this does to the whole arc

Every earlier piece now has a late-game consequence, and the arc reads:

| phase | what you are doing | what it costs you |
|---|---|---|
| early | one species, a small square, magic is raw | you are alone |
| mid | worship, universities, prodigies, alliances through portals | the doors you opened are open |
| late | the world is saturated — sorcerers, holes, pacts | **what you forbade is organised, and it has a patron** |

**And it answers the caution I raised on the late game being only pressure.** Cults are pressure — but
they are pressure *you authored*, by choosing what to forbid. That is a very different feeling from
pressure that arrives on a timer, and it is the difference between a decline and an age.

## The open questions, and none of them should be guessed

1. **What is "dark and twisted"?** The act that opens forbidden magic needs to be a *thing a mage does*
   — and the game currently has no way for a mage to do anything to the world at all. **This is blocked
   on the same missing apply/work activity as everything else**, which is now the third design that
   waits on it.
2. **Does a cult come from your own mages, or arrive?** From your own is much stronger — the scholar
   who would not give up her subject is a better antagonist than a stranger — and it uses the
   underground-knowledge loop directly. **Arriving is cheaper and weaker.**
3. **How random is "random magic"?** Uniform over the grid is easy and characterless. Weighted by what
   the Old God was strong in — *by what a previous player did* — is enormously better and nearly free
   given prestige carry-forward. **Sweep it.**
4. **How much carries, and what counts as "undefeated"?** Two scalars and a definition, none of them
   guessable. Survived-but-not-broken is clearly undefeated; **is a cult you never noticed also
   undefeated?** I think yes — it waited precisely because nothing troubled it — but that is a taste
   call with a large consequence, because it decides whether ignoring a problem is cheaper than
   fighting it. **Sweep the carry amount with both ends as controls**: a generation that changes
   nothing, and one that makes the next run unwinnable.

## The one thing to be careful of

**This must not become the only late game.** If cults are the sole thing that happens after saturation,
the late game is a defence minigame and the construction game ends at mid. **The saturated world should
also be where the best magic finally exists** — the cults are what make it *cost* something, not what
it is *for*.

---

## Your followers push back

*Owner, 2026-08-13. The counter-pressure, and it makes worship do a third job while putting the three
in competition.*

**Worshippers exert pressure on forbidden magic.** A god with a large, devoted following suppresses
cults; a god with few followers cannot.

That is the piece that stops this being one-directional. Without it, forbidding accumulates enemies
with no counterplay and the only strategy is to forbid nothing — **which would delete the ruleset verb
the whole game is named for.**

### Why this is the right counter rather than a new resource

**It gives the populace a role.** Today they are a worship source and a subsistence demand — a number
that eats and believes. Under this they are also **the thing standing between your world and its
underground**, which is a much better reason for a god to care about ordinary people than a per-head
accrual rate.

**And it makes worship genuinely contested.** Worship now does three things:

| worship buys | mechanic |
|---|---|
| **tempo** | favor regeneration, `favor-cap-base`'s stated job |
| **width** | unlocking new kinds of magic through universities |
| **suppression** | holding down what you forbade |

**Three claims on one pool is a real decision** — and it is the first time worship has been anything
but a rate. A god who spends everything on width finds their underground unpoliced; one who holds
enough back to keep order grows more slowly. **That tension is the game, and it costs no new
resource.**

### And it composes with daily relevance, which is already measured

`dailyRelevance` scales worship per cell by what the magic is *for* — measured at **+23.0% → +48.8%**
for `daily` versus `spectacle`. So:

**A god whose permitted magic serves ordinary life has more followers, and therefore more suppression.**
A god who permits only spectacle has a thin, spectacular following and a thriving underground.

**That is a coherent moral shape falling out of existing mechanics rather than being asserted**, and it
is the second time the daily-relevance work has paid for itself.

### Open, and not to be guessed

1. **Is suppression a stock or a flow?** A standing suppression *level* competing with spending is
   simpler; a per-tick expenditure makes it an active choice. **The second is more interesting and more
   likely to be micromanagement.**
2. **Can followers lose?** If suppression always wins given enough worship, cults are a tax rather than
   a threat. **There should be a level of forbidden magic that a purely devotional response cannot
   hold** — otherwise the answer to every cult is "have more people."
3. **Does suppression convert or destroy?** A cult broken by the faithful and a cult broken by force
   are different fictions, and only one of them is *"they came back."*

### The caution that now matters most

**This makes worship the answer to three separate problems, and a resource that answers everything
answers nothing.** If width, tempo and suppression all scale together, a god simply maximises worship
and the three claims collapse into one number.

**They must trade against each other, and that trade is a swept parameter with both degenerate ends as
controls** — worship so plentiful that all three are free, and so scarce that only one is ever
affordable.
