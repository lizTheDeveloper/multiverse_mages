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

**The Old Gods are the other end.** A god who ascends does not simply score — **they persist, and they
become the transcendent thing a later universe's cultists reach for.** Your previous victories are the
antagonists of your next game.

That is a roguelike meta-progression, it makes `prestige` mean something for the first time, and it
costs almost nothing structurally because the carry-forward apparatus already exists and is already
declared as available.

**And it is thematically exact.** A god of magic who transcended is, from inside a later world, indistinguishable from a very old and very powerful thing that should not be spoken to.

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
4. **How much prestige carries?** A scalar nobody can defend, with both ends as controls: a god whose
   ascension changes nothing later, and one whose ascension makes the next run unwinnable.

## The one thing to be careful of

**This must not become the only late game.** If cults are the sole thing that happens after saturation,
the late game is a defence minigame and the construction game ends at mid. **The saturated world should
also be where the best magic finally exists** — the cults are what make it *cost* something, not what
it is *for*.
