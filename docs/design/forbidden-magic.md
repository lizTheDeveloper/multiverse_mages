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

---

## The world is dying, a new age struggles to be born, and a new god of magic is born

*Owner, 2026-08-13, closing the loop.* **You restart, new.**

**The end of a world is not a game-over screen. It is the transition.** A world that decays past
saving dies, an age struggles to follow it, and **a new god of magic is born** — which is you, next
run, somewhere else.

That makes this a roguelike whose meta-progression is **adversarial rather than cumulative**. You do
not carry power forward. **You carry your unfinished business forward**, and it has had a long time to
think about you.

### The loop, whole

    a god sets what magic can exist
      → academics discover, teach, record, and lose it
      → the grid widens with worship; prodigies open cells nobody has opened
      → what the god forbade goes underground and organises
      → the frontier is exhausted; idle scholars turn to dark things
      → the world thins, magic recedes, and old things show through
      → the god summits — or does not
    → whatever was never defeated waits
      → a new age struggles to be born
      → a new god of magic is born
      → and the waiting things are already there

**Every arrow in that diagram is a mechanic in this repository or a spec in this folder.** Most of the
early ones are built.

### It makes prestige the run loop rather than a bonus

`prestigeCarryForward: true` is declared, `carriedPrestige` and `legacyGrant` have no production
caller, and **`legacy-reference-tick` and `legacy-archive-max-tier` are authored constants for a
generation boundary that never arrives.** The apparatus was built for exactly this and has been
waiting for the other end of the loop to exist.

**So "you restart, new" is not a new subsystem. It is the missing half of one that is already in the
codebase**, and the two dead constants are the seam.

### Two endings, and they are not symmetric

*Owner, correcting a reading of mine:* **"Ascend during Peak Magic is the real move — you get the
prestige and really go on to the next one. A New God Of Magic Is Born is the degenerate case. No
prestige."**

I had written these as two equivalent ways for a world to end. **They are not, and the asymmetry is
the whole incentive.**

| ending | what carries |
|---|---|
| **Ascend at Peak Magic** | **prestige.** You go on properly. |
| **The world dies; a new god is born** | **nothing in your favour.** You continue with what you left behind and nothing to offset it. |

**The degenerate case is not a loss screen — it is worse than one in a specific and interesting way.**
The run does not stop; you simply begin again with no accumulated standing and the same waiting
enemies. **The Old Gods follow either way. Only one path pays you for the trouble.**

### And "at Peak Magic" is a timing constraint, not a threshold

**This is the sharpest thing in the ending design, and it was not in the doc before.**

Ascending is not simply a bar to clear whenever you manage it. **Prestige is earned by summiting while
the world is at its height** — which means:

- **Too early** and the world has not reached peak: you can ascend, but there is less to ascend *from*,
  and the prestige reflects it.
- **Too late** and magic is already receding: the peak has passed, the last-ditch tactics are what is
  left, and they get you out without getting you paid.

**So there is an optimal window, and finding it is the game.** That is a genuine strategic problem of
exactly the kind this project has been unable to produce — not "maximise a number" but "judge a moment"
— and it is the first mechanic here where **timing rather than accumulation decides the outcome.**

It also gives the decay spec its teeth. A world beginning to fade is not merely losing resources: **it
is losing the window.** Every tick after the peak is prestige the player will not get, which is a much
better clock than a countdown because the player can *see* it in the state of their own world.

**And it explains why the last-ditch tactics must be survivable but unrewarding.** They are the escape
hatch, not the play. A player who reaches the Box of Ascendance has already lost the thing worth
winning — they are salvaging a run, and the design should let them, without paying them as though they
had judged the moment right.

### And "a new age struggles to be born" is the part to get right

**The transition should not be instant.** The phrase is doing real work: an age *struggling* to be born
is a period where the new world is thin, the old things are strong, and the new god has almost nothing.

**That is the same shape as the early game the design already specifies** — one species, a small
square, magic raw and new — but with a reason for the smallness that is not merely "you start small."
**You start small because the last world ended**, and what is left of it is not friendly.

It also gives the opening its stakes. A first run's early game is a tutorial; a fifth run's early game
is *fragile*, because the things waiting have names and you gave them those names.

### The one thing this must not become

**A meta-progression that only ratchets difficulty is a punishment for playing.** If every run is
strictly harder than the last, a player's reward for engagement is a worse game.

**Something must accumulate in the player's favour** — and the owner has supplied a much better answer
than the one I had:

> **"Maybe it's easier next time — you start off in the same world but with a new race, and the old
> race is around, and you can make friends immediately."**

**The world persists. The peoples accumulate.** A new god is born into the *same* world, playing a
*different* species, and **the species the previous generation raised is still living there.**

That is the right kind of accumulation, for three reasons:

- **It is social, not statistical.** Nothing gets stronger. What you have is **someone to talk to**,
  which is a completely different currency from power creep and cannot inflate.
- **It is earned in the fiction.** The elves are there because a previous god of magic spent a world
  raising them. **You are inheriting your own work, from the outside.**
- **And it lands precisely on the mechanic that most needs help.** One-species founding makes the early
  game lonely and gates escape behind portal magic that most openings cannot reach. **A restart where
  allies already exist skips that wall entirely** — *"dragons have to make friends"* becomes *"the
  friends are already here, and you made them."*

**So the second run is genuinely easier, and the reason is legible.** Not a difficulty slider, not
carried-over stats: the world remembers who lives in it.

### Which makes the meta-progression two opposed accumulations

| accumulates | earned by | effect |
|---|---|---|
| **Old Gods** | failing to finish an adversary | the world gets more dangerous |
| **peoples** | raising a species through a generation | the world gets friendlier |

**Both are things you did, and they point in opposite directions.** A player who summits cleanly leaves
a world with more allies and no new horrors; one who limps out leaves peoples *and* things that wait.

**That is a self-balancing ramp with no constant to tune**, which is worth stating twice in a project
carrying hundreds of untuned ones.

It also gives the earlier framing its full sense. *"A new age struggles to be born"* is not a blank
world — it is a world with ruins, survivors, and things in the dark, **all of them yours.**

**And the honest smaller version still holds beneath it**: a player who has seen ten worlds knows
things about the seventy-cell grid that a first-timer does not, and that costs nothing to implement
because it lives in their head.

**If that turns out to be insufficient, the answer is not to grant power** — it is to make the Old
Gods *fewer and more specific*, so that a careful player genuinely clears their record. **Sweep it:
how much of a generation's unfinished business carries, with both degenerate ends as controls.**

**And note what the asymmetry above already does for this problem.** Prestige is the accumulating
thing, and it is earned only by judging the peak correctly — so a player who keeps failing does not
spiral into an unwinnable ladder of Old Gods with nothing to show. **They keep starting fresh at the
same difficulty**, which is a floor, and the ratchet only engages for players who are actually
succeeding. That is the right way round, and it fell out of the design rather than being added to
patch it.

### What the survivors teach: Old Magic from the Last Age

*Owner, 2026-08-13, supplying the mechanism.* The surviving people do not merely exist to be allied
with — **they can teach you Old Magic from the Last Age.**

> *"Whatever random spells they had at the end — usually the most useful. Fire, feed selves. These are
> free spells and don't require an unlock."*

**The inheritance is derived, not authored.** It is **whatever knowledge instances that species still
held when the previous world ended** — so it is different every generation, and it is a consequence of
how the last god played rather than a gift the designer chose.

### Why "usually the most useful" falls out rather than being asserted

**What survives is what stayed in use**, and what stays in use is what a population needs daily. Fire.
Feeding themselves. Not the deep, spectacular, hard-won cells — **the ones somebody used every week
for two thousand years.**

That is already how this simulation works, and it needs no new rule:

- **Knowledge decays and must be refreshed by teaching**, so what persists to the end of a world is
  what kept being taught.
- **`dailyRelevance` already scales worship per cell by what the magic is *for*** — measured
  **+23.0% → +48.8%** for `daily` versus `spectacle`.
- **So the practical cells are the ones a population sustains**, and the practical cells are what
  the survivors carry into the next age.

**A god who permitted spectacle leaves a thin, glamorous inheritance. A god who permitted water and
crops leaves fire and bread.** That is the third time the daily-relevance work has paid for itself, and
the first time it has reached across generations.

### Free, and no unlock — which is the right exception

**These spells bypass the worship-to-width progression entirely.** They are not cells you unlock; they
are **cells someone in the world already knows**, and a new god does not need to invent what is
standing in front of them.

That exception is correct and it is narrow:

- **It cannot inflate**, because it is bounded by what actually survived, which is a small set of
  practical cells rather than a growing pile.
- **It is legible** — *"the old people still know how to call fire, and they will show you"* is a
  complete explanation of why a rule was skipped.
- **And it makes the early game of a later generation feel different rather than merely easier.** You
  do not begin stronger; you begin **less alone and less ignorant**, which is the same distinction the
  whole design keeps drawing.

### The one thing to guard

**It must not make the practical cells worthless to permit.** If fire and food arrive free every
generation after the first, a god may stop permitting them and spend the whole grid on spectacle —
which would invert the daily-relevance incentive precisely.

**The guard is that the inheritance is the *previous* world's practical magic, and worship is paid on
what *this* world's population can use.** Inheriting fire does not feed anyone unless mages here still
cast it, and the survivors are one species among the peoples this world will hold. **Worth measuring
rather than assuming**, because it is exactly the kind of second-order incentive that has surprised
this project before.

### And the inheritance is capped in the grid's own geometry

*Owner:* **"But it's like no more than X% of a full row or column, idk."**

**The cap is expressed as a fraction of a technique-row or a form-column**, not as a node count — and
that is the right unit, because it is the unit the grid is already drawn in.

**A survivor people can leave you *some* fire. They cannot leave you fire.**

That matters for the same reason the equivalence class for foundational knowledge is the cell: **a
whole row or column is a *discipline*, and a discipline should be founded by a prodigy, not
inherited.** The inheritance is meant to be practical scraps that stayed useful — *"they still know how
to call a flame"* — and an uncapped one would quietly become *"they still know Ignem"*, which is a
different and much larger gift.

It also bounds the interaction that would otherwise break the progression. Without a cap, a long chain
of generations could accumulate the whole grid for free and **the worship-to-width unlock would stop
being the way magic enters a world** — which is the spine of the whole design.

**The value of X is unknown and should stay unknown until it is measured.** The owner's *"idk"* is the
correct answer and it is exactly the case the standing rule was written for: **a design decision that
reduces to a scalar nobody can defend is a swept parameter, with both degenerate ends as controls** —
0% (no inheritance at all, so a restart is only allies and no knowledge) and 100% (a survivor people
hands over entire disciplines). **The curve between those decides whether the mechanic is a warm
detail or the dominant strategy**, and a flat curve would mean it is neither.

---

## Ascending as dragons in the sixth age is a different brag from dragons in the first

*Owner, 2026-08-13. This is about how achievement is **recorded**, and it means prestige cannot be one
number.*

**The same ending is not the same accomplishment.** Draconic, alone, in a first age — no allies, no
inherited magic, no survivors to teach you fire, and a grid nobody has ever mapped — is a *completely*
different feat from draconic in a sixth age, where three peoples already live in the world and one of
them will hand you the practical cells for nothing.

**Both are "ascended as draconic". Only one is hard.**

### Which means prestige must be a tuple, not a scalar

**A single accumulating score destroys the information that makes the achievement worth having.** If
the sixth age pays more because you got further, the hard runs are worth less than the easy ones. If it
pays less, the meta-progression punishes engagement. **Neither is right, because the two runs are not
on one axis at all.**

**Record the conditions with the result:**

    ascended · draconic · age 1 · alone · at peak
    ascended · draconic · age 6 · three allied peoples · after peak

**These are different categories, not different scores.** It is speedrun taxonomy, and it is the
correct model: nobody asks whether a glitchless any% is *better* than a 100% run, because the category
*is* the claim.

### Why the first age becomes the purest run, which inverts the usual roguelike

Most roguelikes make later runs stronger. **This one makes later runs easier and less impressive**,
and the design should say so plainly rather than pretending otherwise:

- **Age 1 is the hardest the game will ever be** — no peoples, no Old Magic, no map, and *also* no Old
  Gods, since nothing has been left undefeated yet.
- **Age 6 is friendlier and more crowded** — allies from tick zero, inherited practical cells, a grid
  the player has personally seen five times, **and everything you failed to finish, waiting.**

**So difficulty does not rise or fall monotonically. It changes shape.** Later ages are easier to
*survive* and harder to *finish cleanly*, because your unfinished business compounds while your
advantages plateau. That is a much better curve than either direction alone, and — as with the two
accumulations — **it needs no constant tuned to produce it.**

### And it is exactly the right kind of nerd bait

**"Ascended as draconic, first age, alone, at peak" is a sentence a player wants to be able to say**,
and the only reason it means anything is that every clause in it is a constraint that was real.

That is the whole argument for recording conditions rather than collapsing them: **the brag is the
data structure.** A scalar prestige number is a leaderboard; a tuple is a story with a shape other
players can recognise and chase.

**Open:** whether the *game* should reward the harder categories, or merely record them. **I lean
record-only** — the moment a category pays better, players optimise for the category rather than
playing, and *"do the hard thing because it is hard"* is a stronger motivation than a multiplier. But
that is taste, and it is exactly the kind of thing that should be argued rather than assumed.

---

## This is how ages and worlds work, and why magic actually leaves

*Owner, 2026-08-13, grounding the whole arc:*

> **"I think that's how Ages and Worlds work in most fantasy — a world with many peoples, their gods
> living, then dying as their people lose their appreciation for miracles. See also: human
> civilizations."**

**This is the thematic spine, and it supplies a mechanism the decay spec was missing.**

### Magic leaves the world through indifference, not entropy

I had written *"The World Begins To Decay and Magic Leaves The World"* as pressure — a clock that runs.
**The owner's framing is causal and much better: the god fades because the people stop being amazed.**

That is not a timer. **It is the worship loop running backwards**, and every term already exists:

- **Worship accrues from mages, universities and populace** — three saturating classes with per-head
  rates.
- **`dailyRelevance` scales it per cell by what the magic is *for*** — `daily` versus `spectacle`,
  +23.0% → **+48.8%**.
- **So a world that stops finding magic remarkable stops paying worship**, and a god without worship
  cannot unlock, cannot suppress, and cannot act.

**The decline is caused by the same thing that caused the rise, pointed the other way** — and it means
a god's death is *earned by the shape of what they permitted*, not scheduled.

**A god of spectacle burns bright and is forgotten.** A god of fire and bread stays relevant and lasts,
because people keep needing bread. **That is the strongest possible argument for the daily-relevance
mechanic, and it is now load-bearing four separate times.**

### The uncomfortable version, which is the good one

**The god that lasts is not the impressive one.** A god whose magic became ordinary — water, crops,
warmth, light — is a god nobody marvels at *and cannot do without.* A god of wonders is adored and
then obsolete.

**That is a genuinely interesting thing for a strategy game to make you choose between**, and it is
the same trade the divine-attention dial already poses — strong on two, or weak on five — arriving
from the other end and agreeing with itself.

### "See also: human civilizations"

**This is the theme stated plainly, and it is the reason the project exists.**

The design is a model of how hard it is to produce complex technology. **The other half of that model
is how easily it is lost** — and human history is unambiguous about which is more common:

- **Knowledge held by too few people dies with them.**
- **Institutions that stop being funded stop teaching.**
- **Techniques that stop being practised stop being reproducible**, and the fact that a thing was once
  done is no guarantee anyone can still do it.
- **And a civilisation rarely notices the moment it stopped being able to do something.**

**Every one of those is already a mechanic here.** `libraryDependence` measures knowledge down to a
single surviving copy. Library upkeep degrades instances on unpaid materials. Mastery decays without
teaching. **The simulation was already about this; the ages framing is what makes it legible as a
story rather than a set of decay constants.**

**A player should finish a run understanding, in their hands rather than in an argument, why the fall
of a civilisation is mostly *forgetting* — and why it does not feel like anything while it is
happening.** That is the design target, and it is worth more than any balance number.

### What this changes concretely

1. **Decay must be caused, not scheduled.** Whatever implements *"magic leaves the world"* should read
   worship and relevance, not a tick count. **A timer would say the wrong thing about why worlds end.**
2. **The god's own mortality is the pressure**, and it is legible — a player can watch their worship
   thin and know exactly which cells stopped mattering.
3. **And the last-ditch tactics get their justification.** *Prophecies from a lost age* and *secret
   texts the ancient masters used* are what a civilisation reaches for **when it can no longer do what
   its ancestors did** — which is the most human thing in the entire design.

---

## The multiverse move: hard species, early age, high prestige → you unlock what came through the holes

*Owner, 2026-08-13:* **"If you beat the game early, using a hard species in an early age, and prestige
— maybe you go dragon → fae. *That's* the Vampire Survivors thing."**

**This is the capstone, and it makes three earlier decisions pay off at once.**

### It is why prestige had to be a tuple

The section above argued that *ascended · draconic · age 1 · alone · at peak* must be recorded as a
**category** rather than collapsed into a score. **This is what the category is for.**

**The tuple is not a brag. It is an unlock key.** A specific, hard, legible condition — *hard species,
early age, ascended at peak* — opens a door. That only works if the conditions survived; a scalar
prestige number could never express it.

### And it is why "not (yet) playable" had that parenthesis

Demons and fae were specified as **things that come through the holes** — a category a universe *deals
with*, not one it founds as. **The parenthesis was doing real work**, and this is the payoff:

    you play the peoples of a world
        → you open portals; things come through that are not of the world
        → you beat the game the hard way
    → you play one of those things

**That is the multiverse move.** The escalation is not from weak to strong — **it is from *worldly* to
*unworldly***, which is a much more interesting axis and one the design already has vocabulary for.
The fae were an *antagonist* last age.

### Why the Vampire Survivors comparison is exactly right, including the part that constrains it

**Vampire Survivors' unlock web works because its characters are not upgrades.** They play
*differently*, are *specifically* unlocked by something you did, and the discovering is most of the
pleasure. **The rule that makes it work is the one to import: an unlock must change how you play, not
how much you win.**

Applied here:

- **A fae god should not be a stronger draconic god.** They should have a different relationship to
  worship, to institutions, to teaching — a people who are *not from here* should probably not want
  universities in the shape mortals do.
- **The unlock condition must be specific and discoverable**, not a threshold. *"Ascend as draconic in
  a first age"* is a sentence a player can hold in their head and aim at. *"Reach 40,000 prestige"* is
  not.
- **And the web should have shape.** Dragon → fae is one edge. What each unlocked species then unlocks
  is the meta-game, and it should be authored as a graph rather than a ladder.

### What it fixes about the run loop

**It gives the ratchet somewhere good to go.** The concern recorded earlier was that a
meta-progression which only accumulates Old Gods is a punishment for playing. The answers so far were
*peoples accumulate* (warm, social) and *knowledge in the player's head* (honest, small).

**This is the third and strongest: playing well opens genuinely new games.** Not a bonus applied to
the old one — **a different thing to play**, earned by a specific act of skill.

And it makes the hardest categories worth attempting **without paying them a multiplier** — which is
the taste call flagged in the previous section, now resolved in the better direction. *"Do the hard
thing because it unlocks something strange"* is a much stronger motivation than *"do the hard thing for
1.4× score."*

### Open, and the first one is load-bearing

1. **What is a fae god actually like?** If the answer is "draconic with better numbers", the whole
   mechanic is power creep wearing a costume. **The unlock is only worth building if the unlocked thing
   plays differently**, and `mvee`'s paradigm set is the obvious source — `pact` is `teach=false,
   scroll=false, source: divine`, which is already a *fundamentally* different game and is thematically
   exactly what a fae bargain should be.
2. **Is the unlocked species playable in the same world, or does it need its own?** Fae in the world
   they haunted is a good story; fae *anywhere* is a simpler rule.
3. **How wide is the web?** Six species and several ages give a large space of conditions. **Author a
   few edges deliberately rather than generating them** — Vampire Survivors' unlocks are hand-placed,
   and that is why they feel like secrets rather than combinatorics.

### What an unlock actually brings: weird species, and their weird world's magic

*Owner, continuing:* **"Unlock weird species. Strange magic from their weird world. Higher dimensional
realms, secret magics, wild individuals."**

**An unlock is not a character. It is a region of the design space.** A weird species arrives with the
magic of the place it came from — and that is the answer to a problem this campaign has been unable to
solve.

### It solves content exhaustion at the level above the run

**Inside a run, exhaustion is now a mechanic**: the frontier runs out, scholars go idle, and idle
scholars do dark things. Good.

**Across runs, exhaustion was still fatal.** Seventy cells and three hundred nodes are *one world's
worth of magic*, and a player who has seen it is done. **Unlocks are the answer: each weird species
brings its own paradigm, and the space grows sideways rather than deeper.**

`mvee` has **43 authored paradigms** — that is not one world's magic, it is dozens, and it is already
written. The four axes (intensity, source, formality, animism) are the coordinates a "weird world" is
weird *in*.

### The three named kinds, and each already has a home

**Higher dimensional realms.** This is the 3D/4D/5D/6D idea, and it has a concrete place: the raid map
has buildings, sampled line-of-sight and a breadth-first flow field, and **adjacency, visibility and
pathing are exactly what dimensionality transforms.** A species from a higher-dimensional realm is not
a stat block — **it is a different geometry**, and `mvee`'s `dimension` paradigm plus Mages' `limen`
form are the existing vocabulary. Whether the raid map's dimensionality is a parameter or an assumption
is under investigation and is the question that decides the cost.

**Secret magics.** Paradigms that are `teach=false` or `scroll=false` — **eleven of `mvee`'s
thirty-seven** — and the tradition sweep has already measured how severe that is: under standard-acquire
traditions a universe ends 2400 ticks with **zero teachable instances**. Severe is the point. A magic
that cannot be written down is a different civilisation, not a modifier.

**Wild individuals.** `wild` is **3 techniques × 13 forms, `teach=false`, `scroll=false`** — the widest
form coverage of any paradigm in that set, and untransmittable. `talent` is 7 × 12, innate. **A species
where everyone is a sorcerer** is a coherent thing to play and is the exact inverse of the academic
game: no universities, no teaching, no libraries — **only people who can do it, and when they die it
is gone.**

**That last one is the sharpest, because the whole game is built on institutions.** Playing a people
who cannot have institutions is not a variant. It is the argument.

### Why this is the right shape for the content strategy

- **The magic comes from somewhere.** A weird species' magic is weird *because of where they are from*,
  which is a reason rather than a reskin, and the four-axis spectrum makes "where they are from"
  expressible as data.
- **It is authored, not generated.** Forty-three hand-written paradigms with laws, risks and lore beat
  any procedural grid, and the unlock web should be hand-placed for the same reason Vampire Survivors'
  is.
- **And it keeps the seventy-cell grid stable.** Mages' vocabulary is Ars-Magica-derived and three
  hundred nodes deep. **Weird species do not need a bigger grid — they need a different relationship to
  the one that exists**, which is what a paradigm *is*.

**Open, and it is the same question as before:** whether an unlocked species is playable in the world
it haunted, or needs its own. **Higher-dimensional realms lean toward "its own"** — a geometry is a
property of a place, not a passenger — and that may be the natural boundary between species you *ally*
with and species you *become*.

### Non-euclidean is nearly free here, and the contract already says why

*Owner:* **"Higher Dimensions is fun, and since we don't have to maintain a world at that level we can
be non-euclidean and all kinds of weird stuff."**

**Verified, and it is more true than the intuition claimed.** `packages/state/src/components.ts` states
it as a contract, under the heading *"No world-scale component has a position"*:

> §0: *"Only engagement entities have positions… **World-scale entities have no coordinates** — the
> component model must not assume otherwise."*

**The world scale has no geometry to break.** A territory is `landUnits` and `capacityPerLandUnit` —
**capacity, not space.** There is nothing to make non-euclidean because there is nothing euclidean.

**So weird geometry is bounded to exactly one place: the raid map.** And that is the cheapest possible
place for it, because:

- **It already has the machinery** — buildings, sampled line-of-sight, a breadth-first flow field.
  Adjacency, visibility and pathing are precisely what dimensionality transforms.
- **It is rebuilt per engagement**, so *"temporarily 4D"* costs nothing to unwind. The temporary
  qualifier the owner attached to the idea is free.
- **And it cannot corrupt the world sim**, because the world sim does not know where anything is.

**A constraint written to keep the component model clean turns out to make the strangest idea in the
design almost free.** That is worth recording as a fact about this architecture rather than a lucky
break: **Multiverse Mages can afford weird space in a way a game with a persistent 3D world cannot.**

### Which makes the weird-magic catalogue a content question, not an engine one

*Owner:* **"Animal spirits. Blood magic. Straight up alien magic."**

All three are authored already, and they differ on the axes that matter:

| kind | `mvee` paradigm | shape |
|---|---|---|
| **animal spirits** | `spirit_accord` (5×8, teach ✓, scroll ✓, `src: social`), `animus`, `tethermancy` | **relationship-based** — magic as negotiation with things that have wills. The animism axis exists for exactly this. |
| **blood magic** | `blood` (4×4, teach ✓, **scroll ✗**, `src: internal`) | **teachable but unrecordable.** A tradition you must learn from a person because it cannot be written — which is a different failure mode from `pact` and a different game from either. |
| **alien magic** | the dimensional set — `dimension`, `escalation`, `corruption_crown` | **not of this world**, and the one that wants the geometry above. |

**`blood` is the sharpest of the three for this project specifically.** `teach=true, scroll=false` is
the exact combination Mages has never run: the Art of Memory is `standard`-acquire with a `palace`
store, and True Naming is the opposite. **A tradition where knowledge moves between people but never
onto a shelf makes libraries worthless and teaching everything** — which is a direct attack on the
mechanic the whole campaign has been measuring.

**None of the three needs an engine change.** They need the `store` and `acquire` hooks Mages already
has, plus content. **Only the alien/dimensional set wants new machinery, and it wants it in the one
subsystem that can afford it.**
