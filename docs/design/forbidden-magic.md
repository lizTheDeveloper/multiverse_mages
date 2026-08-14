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

---

## Idle academics do evil, and this makes the campaign's worst finding into a mechanic

*Owner, 2026-08-13:* **"Especially if there is no Lost Magic to rediscover and basically nothing for
academics to do — they should do evil, forbidden things."**

**This is the best reframe available, because the thing it describes is already true and already
measured.**

The campaign's central, repeated finding is **content exhaustion**: a universe reaches its ceiling and
stops. `passive-control` reaches **51 nodes doing nothing at all**, and an `archivist` who builds
roughly thirteen hundred universities reaches **the same 51**. After that the roster has nothing left
to learn, and `GOAL.idle` — **which already exists and is currently a null outcome** — absorbs the
rest of the run.

**Thousands of idle mage-ticks that presently produce nothing.**

Under this design they produce cults. **The failure becomes the mechanic**, and it does so with a goal
that is already in the enumeration and already chosen.

### Why this is right rather than merely convenient

**It is true about people.** A university full of brilliant, funded, unoccupied scholars is not a
stable object. The game is a model of how hard it is to produce complex knowledge; *what a research
culture does when it runs out of frontier* is exactly the kind of thing that model should have an
opinion about.

**And it makes the frontier a resource rather than a backdrop.** Today running out of things to learn
is an anticlimax the harness reports as a flat line. Under this it is a **hazard**: a god who
permitted narrowly and exhausted the cells has an idle, dangerous faculty, and the fix is to give them
something to do — open more grid, find Lost Magic, send them somewhere.

**That is the loop the whole design has been reaching for.** Width is not just power; **width is
occupation.** A god unlocks more magic partly so their academics have somewhere to put their
attention.

### It also gives rediscovery a job

The 3× rediscovery multiplier and the whole loss-and-recovery apparatus currently model something the
reference universe barely does. **Lost Magic as the alternative to idleness** makes it load-bearing:
a world with things to recover has occupied scholars, and a world that has recovered everything does
not.

**So knowledge loss stops being purely a cost.** A universe that has lost things has work; one that
has lost nothing and learned everything has a problem. That is a genuinely strange and good incentive,
and it is the first thing in this design that makes decay *desirable* under some conditions.

### The measurement, which is unusually cheap

**Idle mage-ticks are already countable**, and the campaign has the numbers to compare against: the
tick at which a universe hits its ceiling, and how long it sits there. **If cult pressure is a function
of idle scholar-time, the existing null results become the baseline** — every arm that flatlined is an
arm that should now be growing an underground.

---

## Not ascending decays the world

*Owner, same session:* **"Not ascending should carry consequences, namely: The World Begins To Decay
and Magic Leaves The World."**

**Stagnation must not be neutral.** Today a run that does not ascend simply ends, and `passive-control`
sitting at 51 nodes for two thousand ticks costs nothing. That is why doing nothing has been
competitive.

**Under this, the clock is real**: a world that does not reach the summit begins to lose what it has.
Magic drains out. The grid narrows. The thing you built comes apart while you watch.

### Why this is the correct pressure, structurally

- **It makes the horizon a deadline rather than a measurement window.** The owner's phrasing elsewhere
  — *"before the sun swallows the earth"* — is the same idea, and it is what makes draconic's slowness
  fatal rather than merely slow. **A species that is patient and immortal still loses to a world that
  is running down.**
- **It is the counterweight to accumulation.** Every mechanic in this design rewards building up.
  Without decay the optimal play is always *more*, and the late game is an accumulation phase with no
  shape. **A world that decays if you stall is a world where tempo matters.**
- **And it inverts the worship-buys-width loop into something that can run backwards.** Width is not
  a ratchet: what a civilisation stops sustaining, it loses. That is already how library upkeep works
  — instances degrade on unpaid materials — so the vocabulary exists.

### The interaction that makes this dangerous, and interesting

**Decay and idleness compound.** A world that has exhausted its content has idle academics *and* is not
ascending — so it grows cults **and** loses magic at the same time, and the cults are strongest exactly
when the god is weakest.

**That is a death spiral, and it needs a floor.** A run should be able to *fail* — that is the point —
but it should fail in a way a player can see coming and could have prevented, not one that becomes
unrecoverable before it becomes visible. **The interface prototypes' `ascension/` question — "can a
player see which one they are heading for?" — stops being a nicety and becomes a requirement.**

### Open, and none of it guessable

1. **What decays first?** Magic leaving the world is evocative and ambiguous. Cells closing, instances
   decaying faster, worship falling, mages not being born — these are very different games. **Cells
   closing is the strongest**: it is the direct inverse of the unlock, and it means the world visibly
   narrows.
2. **When does it start?** A deadline that is never reached is decoration; one that arrives before a
   universe can plausibly ascend is a loss screen. **Sweep it against the measured ascension tick.**
3. **Is decay recoverable?** If a decayed world can be pulled back, the mechanic is tension; if not, it
   is a timer. **Tension is better, and it is also harder to tune.**

---

## Last-ditch ascension: what the receding tide uncovers

*Owner, 2026-08-13:* **"In the Magic Leaves The World scenario it begins fading, becomes harder to
ascend, and then there have to be some last-ditch ascension tactics — Prophecies From A Lost Age Of
High Magic, Secret Texts The Ancient Masters Used, A Portal To The Undying Lands, The Box Of
Ascendance, you know, whatever tropes."**

**This is the answer to the death-spiral floor, and it is a better answer than a cap on decay.**

I flagged that decay plus idleness compound into something unrecoverable. **The fix is not to soften
the decay — it is that the decay itself opens options that did not exist while magic was abundant.**

    magic is abundant  →  the ordinary paths work; the desperate ones are unavailable
    magic is fading    →  the ordinary paths get harder
                       →  and the old things start to show through
    magic is nearly gone → only the desperate paths remain, and they are open

**When the tide goes out, the high-water marks become visible.** A world thick with living magic has no
use for a half-legible prophecy from an age nobody remembers; a world where magic is nearly gone has
nothing else.

That is thematically exact and structurally load-bearing at the same time: **the late game stops being
a decline and becomes a different game**, which is what the phase weighting (late 3 : mid 2 : early 1)
exists to reward and what nothing has yet supplied.

### The tropes map onto mechanics that already exist

Each of these is a real thing in the codebase wearing a better name:

| trope | what it already is |
|---|---|
| **Prophecies From A Lost Age Of High Magic** | **rediscovery.** The 3× multiplier and the whole loss-and-recovery apparatus, which currently model something the reference universe barely does. Knowledge from when the grid was wide. |
| **Secret Texts The Ancient Masters Used** | **grimoires and libraries** — and specifically the *palace* store hook and looted texts. A physical object carrying knowledge no living mind holds. |
| **A Portal To The Undying Lands** | **`limen` and `portal`.** Ascension by *leaving* rather than by summiting in place — and it uses the cell the design has already made load-bearing. |
| **The Box Of Ascendance** | an **artifact**: one object that does the thing. The only entry here with no current counterpart, and therefore the one to build last. |

**Three of the four need no new subsystem.** They need the existing ones to become *reachable under
conditions where the normal path is closing*, which is a gating change rather than a mechanics change.

### Why this is the right shape

**It rewards having lost things.** A civilisation that never lost any knowledge has no prophecies to
recover, no ancient texts, nothing buried. **The world that decayed is the world that has something to
find** — which is the strange, good incentive noted above where decay stops being purely a cost, taken
to its conclusion.

**It makes the comeback earned rather than granted.** A last-ditch tactic is not a mercy rule. Each one
should be **expensive, risky, and only available because things are bad** — the player who reaches for
the Box is making a real decision, not receiving a handout.

**And it should be adjacent to forbidden magic without being identical to it.** Desperate is not the
same as dark, and the design is stronger if those are two axes rather than one: *"we opened the sealed
archive"* and *"we bargained with a thing that waits"* are different stories, and a player should be
able to take the first without the second. **But the second should be more powerful**, and that is the
temptation the endgame is built on.

### Open, and none of it guessable

1. **Are these unlocked by decay, or merely made worth doing by it?** Unlocking is cleaner and more
   legible — *this option appeared* — but always-available-and-rarely-worth-it is subtler and rewards a
   player who spots the moment. **I lean unlocking**, because the game currently has no way to tell a
   player that something changed.
2. **How many should exist, and should a run see all of them?** Four tropes is a good number to author
   and a bad number to offer at once. **A run seeing one or two is a story; a run seeing four is a
   menu.**
3. **Do they compete with ordinary ascension or replace it?** If the desperate paths are strictly worse,
   nobody takes them and they are decoration. **If they are strictly better, everyone stalls
   deliberately to unlock them** — which is exactly the degenerate strategy this project has been
   catching all campaign, and the null ladder's rung 2 is the guard that would find it.
4. **What does the Box of Ascendance cost?** The one with no existing counterpart is also the one most
   likely to be a magic button. **It should probably cost something no other verb costs** — a species,
   a university, the god's own accumulated worship — and it should be swept, with both ends as controls.
