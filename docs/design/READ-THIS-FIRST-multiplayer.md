<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# ⚠️ Correction: this is a multiplayer game

*2026-08-13. Read this before any of the design documents dated today.*

**Several documents written this session drifted into single-player roguelike design.** That is my
error, and this note marks it rather than deleting them, because most of the content survives with a
changed frame.

## What `vision.md` actually says

- **"Elimination is intended.** A losing player quits — that is the game — and you can always rejoin."
- **"Defeat is a re-entry, and it is already priced. A universe ends; a player does not."**
- **"a live-PvP death sentence"**
- `pvp-server` is scheduled at **0.15.0** — `authoritative-lockstep`, `direct-challenge`,
  `universe-persistence` — and is **proposal only: no tasks, no package on `main`.**

**Determinism is not an aesthetic preference. CLAUDE.md lists it as non-negotiable *because of the
live-PvP requirement*.** Fixed-point, stream-split RNG, golden replays — all of it exists so two
machines agree.

## What drifted, and what survives

| document | frame | verdict |
|---|---|---|
| `unlocking-magic.md` | worship → width, prodigies, universities | **survives.** This is a player's economy, single- or multi-player. |
| `divine-attention.md` | strong on two vs weak on five | **survives.** A build-order choice, which is what PvP wants. |
| `founding-and-alliance.md` | one species, allies via portals | **survives and improves.** Allies should be **other players.** |
| `forbidden-magic.md` — cults, forbidding-makes-enemies | | **survives.** What you forbid is what an opponent may exploit. |
| `forbidden-magic.md` — **Old Gods as your own undefeated adversaries** | solo meta-progression | **needs reframing.** In PvP your adversaries are other players, and they are still there. |
| `forbidden-magic.md` — **ages, prestige generations, the unlock web** | solo run loop | **needs reframing.** Possibly seasons; possibly nothing. |
| `world-shaping.md` — **the sun ages across ages** | solo | **needs reframing**, and it is the most single-player thing written today. |

**The economy, the ruleset verbs, the institutions and the tradition design are all frame-independent.
The meta-progression is not.**

## The one thing that got better

**"Two gods in one world" was not an ElfQuest reading. It is the multiplayer structure**, and I
described it without recognising it:

> Two gods of magic, one world, two systems of what magic can be. Portalling to another people imports
> **their god's ruleset**. §3's Portal Rule — a raid arbitrated by the *host's* ruleset — and
> `foreignMagicPolicy`'s four answers are about **what happens when another god's magic arrives.**

**That is the game.** And the practical note stands and matters more now: **`contracts.md` §1.1 puts
one universe per simulation instance**, which has blocked raids, alliances and the multiverse premise
for the entire campaign. **Whether PvP is two gods sharing one world or two simulated universes is a
structural question with a large cost difference**, and it should be answered before `pvp-server` is
built rather than during.

## The questions this raises, which are the owner's

1. **Simultaneous or asynchronous?** *"Authoritative lockstep"* suggests simultaneous. But
   `universe-persistence` and *"you can always rejoin"* suggest a persistent world that outlives a
   session. **These are very different games and the design documents assume neither.**
2. **What is a match?** A universe from founding to ascension is 2,400 ticks and hours of simulated
   centuries. **That is not a session length.** Either the game is played at a much coarser grain than
   the sim runs, or a player joins an already-old world.
3. **Is there meta-progression at all?** *"Elimination is intended, and you can always rejoin"* reads
   as **no persistent advantage** — which would retire the unlock web entirely, and that is a
   legitimate answer.
4. **Do the ages exist?** They are the most beautiful thing designed today and possibly the most
   single-player. **Seasons are the multiplayer analogue** and are a different mechanic wearing the
   same name.

**None of these should be guessed.** The design documents from today are usable as a menu; the frame
is the owner's to set.
