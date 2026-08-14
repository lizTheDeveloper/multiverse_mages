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

---

## Resolved: prestige is matchmaking, not power

*Owner, 2026-08-14, answering the four questions above.*

> **"Prestige as the tier-gating thing. It keeps people who have just joined away from people who have
> been working on their universe for a long time, and gives people who are maybe worse at the game a
> leg up. Cap-size multiverses of 12 to 24 players. If not enough humans join within a certain time, AI
> players — and a few extra AI as filler. That allows us to have prestige and skill gating."**

**This answers every open question, and it retires the worry the design documents were circling.**

### Prestige stops being a progression problem

I spent several documents worrying that a meta-progression which accumulates advantage is either power
creep or a punishment. **Prestige-as-matchmaking has neither failure mode**, because it confers no
in-game power at all — it decides **who you are playing against.**

- **A veteran's advantage is their skill**, not their carried-over stats.
- **A weaker player's "leg up" is not being matched against a stronger one** — which is a leg up that
  costs the design nothing and inflates nothing.
- **And the tuple survives, now doing real work.** *"Ascended · draconic · age 1 · alone · at peak"* is
  a matchmaking signal as well as a brag: what you have *done* is what you are *bracketed by*. A scalar
  would have collapsed exactly the information a bracket needs.

### A "multiverse" is a match: 12–24 gods, capped

**That is the structural answer the campaign has needed all along.** `contracts.md` §1.1 puts **one
universe per simulation instance**, and that single constraint has blocked raids, alliances,
`openPortal` and the entire multiverse premise for the whole campaign.

**A multiverse is 12–24 universes in one instance.** Not two, not unbounded — a **capped shard**, which
is a well-understood thing to build and to reason about, and which makes the Portal Rule finally
operational: a raid crosses between two universes *in the same instance*, arbitrated by the host's
ruleset.

**The two-gods-in-one-world idea from the ElfQuest reading is a special case of this, not an
alternative to it** — and the cap is what makes it affordable.

### And the bot pool is the AI player roster

**This is the part that changes what tonight's work was for.**

*"If not enough human players join within a certain amount of time, we can use AI players, and a few
extra AI as filler."*

**The strategy pool is not a test harness. It is the shipped opponent roster.** `passive-control`,
`permissive-breadth`, `allocate-concentrate`, `archivist`, `denial-warden`, `narrow-depth`,
`portal-rush`, `worship-maximizer`, `alliance-seeker` — **those are AI players**, and every measurement
taken of them is a measurement of an opponent a human will actually face.

That reframes several things at once:

- **The quality-diversity archive is a roster-design tool.** Its elites are candidate bots, and
  **`WIDTH` is how many genuinely different opponents exist.** A flat meta is not merely a balance
  problem — it means every AI opponent plays the same.
- **`META_SHAPE` is exactly right for this.** The owner's target — *"many things should work, many
  things should not"* — describes a roster where some bots are strong and some are weak, which is what
  filler *should* look like.
- **And the null ladder is a floor on AI quality.** A bot that loses to `passive-control` is not filler,
  it is an insult. **`reachable-not-worth-playing` is the discard pile for opponent design.**
- **The shadowing class matters much more now.** `permissive-breadth` never founding a university, and
  `narrow-depth` never asking for a grant, are not measurement curiosities — **they are AI opponents
  visibly failing to play their own stated strategy**, in front of a human.

### What this means for the documents flagged above

| document | verdict, revised |
|---|---|
| economy, divine attention, founding, forbidding | **survive**, as before |
| **prestige / the unlock web** | **survives** — as matchmaking and as cosmetic-or-roster unlocks, not as power |
| **Old Gods** | **survives, rescoped** — an NPC pressure inside a match, or a season theme; **not** carried personal difficulty |
| **the sun ageing across ages** | **survives if "age" means season** — a shard-wide clock all 12–24 players share |
| **peoples accumulating across runs** | **needs re-siting** — in a shared shard, the peoples in the world are *other players'*, which is better and is what alliances already are |

### What is now the open question, and it is smaller

**How long is a match, and what does a player do while their universe simulates centuries?** 2,400
ticks is not a session. Either the shard runs at a coarser grain than the sim, or a player's attention
is intermittent and the game is partly asynchronous. **That is the last structural unknown**, and it
is a scheduling question rather than a design one.

### Bot difficulty is graded by prestige — and the archive already computes the grade

*Owner:* **"Different difficulties of bot at different levels of prestige, so you're not dealing with
ancient old ones who are brilliant AlphaGo players on world number two. Also, the further up you go,
the fewer players survive that far."**

**The archive already has both axes it needs for this, and one of them is its headline number.**

| axis | what it is | archive field |
|---|---|---|
| **which opponent** | the behaviour cell — nodes known, library depth, terminal route, spend concentration | `coordinate` |
| **how strong** | ascensions over the null bar, on paired seeds | **`marginOverNull`** |

**`marginOverNull` is a difficulty rating.** It was designed as the search's headline — *"if this is not
growing, nothing else in the archive matters"* — and it turns out to be exactly the number a
matchmaking tier needs. **A bot at margin +2 belongs on world two; a bot at +14 does not.**

So the roster is **the archive, read as a grid**: cells give variety at each tier, margin sorts the
tiers. **No new instrument, and the pairing discipline that makes the margin trustworthy — same seeds,
common random numbers, nulls re-run every round — is already enforced.**

### The consequence of "fewer players survive that far"

**High-prestige shards will be sparse, and therefore mostly AI.**

That inverts where bot quality matters. The intuition is that filler is for beginners — **the opposite
is true.** A world-two shard fills with humans and a few weak bots. **A top-tier shard of 12–24 slots
with few surviving humans is a field made mostly of machines**, played by the people most able to tell.

**So the hard bots are not a stretch goal. They are the endgame content**, and the AI quality problem is
worst exactly where the players are best.

Two things follow, and both are about tonight's findings rather than new work:

- **The shadowing class becomes a shipping bug, not a measurement note.** `permissive-breadth` never
  founding a university and `narrow-depth` never asking for a grant are opponents failing to play their
  own stated strategy — **and at high tier that happens in front of the players most likely to notice
  and least likely to forgive it.**
- **`reachable-not-worth-playing` is tier-relative, not absolute.** A bot that cannot beat
  `passive-control` is unusable anywhere. **A bot that beats it by +2 is good filler on world two and an
  embarrassment at the top.** The archive should carry margin per cell rather than a single pool
  verdict — which it already does, one field down.

**And the null ladder gains a second job.** It is a floor on AI quality — but *which rung* a bot clears
is a tier assignment. A bot that beats `passive-control` and loses to `permit-then-idle` is a low-tier
opponent with a legible weakness; one that clears all four is top-tier. **The rung diagnosis stops being
a debugging aid and becomes the ladder's rungs.**
