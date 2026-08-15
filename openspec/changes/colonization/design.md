## Context

Colonization is the first mechanic in this project that is **about the multiverse rather than about a
universe**. Everything built so far runs inside one simulation instance holding one universe
(`contracts.md` §1.1); `raid-engagement` reaches outside that boundary for the length of a raid and
then closes it again. Colonization proposes a consequence that outlives the raid, and a structure —
the bubble — that exists above every individual universe.

Four constraints frame it, and they pull against each other:

1. **`contracts.md` §1.1: one universe per simulation instance.** A raid does not load a second
   universe; it captures immutable ruleset snapshots. Anything persistent between two universes has
   to explain how it exists without a second universe being resident. `packages/state`'s
   `findUniverse()` throws outright on a second `UNIVERSE` row.
2. **`contracts.md` §0: clocks are per-universe.** *"A multi-universe simulation therefore ticks
   universes independently, and no global clock exists at the core level."* Any per-tick obligation
   between two universes has to say which clock evaluates it.
3. **Vision §7a: the world has no map.** *"At world scale there is no map… World-scale entities carry
   no coordinates at all."* The reason is load-bearing: it keeps world-time Monte Carlo cheap.
4. **The agent interface is the Monte Carlo interface** (vision §9). A mechanic that behaves
   differently in a single-instance harness run than in a live match means the harness is measuring
   a different game than players play, and every committed balance baseline is about the wrong thing.

Constraint 4 quietly kills one of the three transfer shapes below. But the finding that most shapes
this document is not architectural at all — it is arithmetic, and it is in the section headed *"the
transfer is nearly inert at this build"*. Read that one first if you read only one.

## Goals / Non-Goals

**Goals:**

- Express the author's mechanic — extinguish the mages, absorb the populace — with **no map, no
  coordinates, and no second resident universe.**
- Add the smallest possible amount of world state, and say exactly what it costs.
- Give every recommendation the measurement that would show it failing, including the two that
  suggest it fails today.
- Separate what belongs in v1 from what does not, and argue the split rather than asserting it.
- Raise every rule the spec does not settle rather than inventing one.

**Non-Goals:**

- Netcode, persistence transport, or session management. `pvp-server` owns those; this change states
  what it needs from them.
- Raid combat, objectives, or consequence machinery. `raid-engagement` owns those, and this change
  deliberately adds **no new raid objectives** — §8's three already compose into the extinction
  condition.
- Tuning. Every magnitude here is an untuned placeholder and marked as one.
- Deciding whether ascension or bubble-clearing is the game's real win condition. That is the
  author's call and it is this document's central open question.

---

## The finding that matters most: the transfer is nearly inert at this build

The author's mechanic says the conquered universe's *"taxes and materials and labour go to the new
group"*. Worship is the channel for taxes and devotion, and materials is the channel for the rest.
Both were measured against the code as it stands, and **neither carries the mechanic.**

### Worship is saturating, and the populace channel is already at 95% of its cap

`worshipTarget()` in `packages/coordination/src/god/worship.ts` sums three independently saturating
terms — mages, completed universities, populace — each of the form `sat(x, cap, half) = cap·x/(x+half)`.
The populace term uses `worship-populace-per-head` 16, `worship-populace-cap` 2048,
`worship-populace-half` 16384, and the loader asserts
`worship-mage-cap + worship-university-cap + worship-populace-cap == worship-max` (4096 + 3072 + 2048
= 9216).

Vision §13's reference run ends with a populace of **18,713**. Putting that through the term:

| | populace | raw | saturated worship | share of the 2048 cap |
|---|---:|---:|---:|---:|
| conqueror alone | 18,713 | 299,408 | **1,941** | **94.8%** |
| after absorbing an identical rival | 37,426 | 598,816 | **1,993** | 97.3% |

**Absorbing an entire rival civilization — nearly nineteen thousand people — raises the conqueror's
worship by 52 fp.** Against that universe's total worship of roughly 4,831 (mages 2,611 + universities
279 + populace 1,941, of a 9,216 maximum) that is about **1%**, and through
`favorRegeneration() = favor-regen-base + worship × favor-per-worship` it is a **0.76% increase in
favor regeneration**: 3,439 per tick becoming 3,465.

The populace channel is the *most* saturated of the three and it is exactly the channel a colony
feeds. This is the same failure shape the campaign has already found twice — `durability` written and
read by nothing, `landUnits` bounding something that is not binding. **A mechanic that moves a
quantity already at 95% of its cap does not move the game.**

### Materials are unsaturated, but they flow into a loop that produces nothing new

`materialsProduced()` is linear and uncapped: `laborers × MATERIALS_PER_LABORER(8) × laborAffinity ×
resourceYield`. So absorbed labour *is* a real, unbounded flow — which is where the snowball risk
lives. But in the live world loop only two claimants draw against the stock: subsistence, and
scribing. `advanceConstruction` and `applyLibraryUpkeep` have **no caller outside tests**, and
`buildProgress` advances only through the god's `fundUniversity` action, independent of the stock.

So colonial materials at this build buy **more scribing** — and the campaign has already measured
what more scribing produces: the archivist strategy writes 4,096 grimoires against passive's 1,156
and ends on the **same 51 nodes**. Colonial materials would fund copies of an exhausted set.

### What this means, and it is not that the mechanic is wrong

It means the mechanic cannot be evaluated at this build, and shipping it here would produce a
statistically invisible result that someone would later mistake for "colonization is balanced".

> **Acceptance test 1 — the inertness test.** Before any of this is implemented, run the
> counterfactual on the existing harness: add a synthetic populace and materials endowment of one
> reference universe to an arm, at n ≥ 96 over 2400 ticks, and report the change in `worshipSnowball`,
> `ascensionRate`, and mean nodes known. **If the deltas are inside one standard error, the transfer
> as specified is inert and the design must change before it is built** — either colonies get their
> own worship channel with its own cap, or the transfer's substance moves somewhere unsaturated.

Two consequences if the author does want a dedicated colony worship channel: `worship-max` must rise,
and `checkGodConstants`' asserted sum identity must be updated with it — a content change with a
loader invariant attached, not a silent tuning turn.

---

## Decision 1 — a colony is a frozen summary, not a living vassal

At the moment a universe is extinguished, the engine derives **one row** — surviving populace by
species, materials stock, worship contribution — and writes it into the *conqueror's* world state.
The extinguished universe stops simulating. Nothing thereafter reads it, and nothing evaluates
anything on its clock, because it no longer has one.

Compare the alternative the word "tribute" naturally suggests — a **living** universe paying a share
of output each world tick. That fails on constraints 2 and 4 together, and the failure is not
aesthetic:

- The two universes tick independently, so "each world tick" names no shared moment. If the payer's
  clock charges it, a conqueror whose own world time is frozen by a raid still accrues income from a
  clock they are not running on; if the payer is raided, the flow stops for reasons neither player
  can see.
- In a single-instance Monte Carlo run **the counterpart universe is not resident at all**. The
  harness would model a drain with no destination while players experience a transfer. Vision §9's
  *"the agent interface is the MC interface"* is violated at the root.

**The author's mechanic is architecturally cheaper than vassalage precisely because the thing
absorbed has stopped simulating.** What this proposal asks of W10 is a stable universe identity and a
bubble roster, and nothing more.

**Consequence — absorbed populace does not join the conqueror's cohorts.** It contributes worship and
materials from the frozen row only. The alternative imports people into a carrying capacity that
never grew to hold them: `K` derives from `Σ landUnits × capacityPerLandUnit` and the conqueror's
`landUnits` did not change, so §6a's fertility brake — which drives births to zero as population
approaches `K` — would collapse the imported population within a few ticks. The mechanic would
visibly undo itself.

**Consequence — `contracts.md` §2.7's anticipated migration is not triggered.** That passage
anticipates *"a raid that takes ground"* and reserves `landUnits` for a move into §1.1. The author's
colonization takes **people**, not ground. `landUnits` stays in content and this change does not
touch it. If the author instead wants absorbed populace to genuinely *join* — to live, breed and
produce mages — then land must transfer with them, §2.7's migration fires, and the change is
materially larger. **Raised as open question 9.**

## Decision 2 — extinction is an existing ending with an attribution added

`stepStagnation()` in `packages/coordination/src/god/ascension.ts` already counts consecutive
mageless world ticks and ends the run when `magelessTicks >= stagnation-mageless-ticks` (**60**, i.e.
five world years). This change adds two things and no third:

1. **A per-attacker kill ledger** in the defender's world state, written by `rules-raid`'s existing
   consequence path when a mage casualty is applied. Attribution is then a fact the state carries
   rather than a guess made when the last mage dies — which matters, because the last mage very often
   dies of old age between raids.
2. **A claim**, made by a god within a bounded window after extinction, at a favor cost. If nobody
   claims, the run ends as `stagnation` exactly as today and no colony is created.

The claim keeps conquest a *decision* that costs tempo, in keeping with §8's *"raiding is never
free"*. Attribution by last-raider alone rewards vulture play; attribution by most-kills alone hands
colonies to players who never chose to collect one.

### Two concrete integration hazards, both findable now

- **`TERMINAL_REASON` is `{none:0, ascensionApotheosis:1, ascensionCanon:2, stagnation:3,
  truncated:4}`.** Adding `conquest` as 5 is additive, but `prestigeEarned` branches
  `terminalReason === stagnation ? prestigeBaseStagnated : prestigeBaseCutoff`. **A new `conquest`
  reason silently falls into the *cutoff* branch and pays 256**, which is more than a stagnated run
  pays. That is a defect waiting to happen and it is what open question 2 must settle.
- **The mageless counter resets to zero the instant a single mage exists.** Extinction therefore
  requires sixty *consecutive* mageless ticks, which one student promoting out of a cohort resets.
  This is not a rounding detail — it is the structural reason the replacement pipeline must be
  destroyed and not merely suppressed.

### The finding that decides whether this is feasible at all

**Killing mages is not sufficient, because mages are replaced.** Vision §13's reference run holds
**88 living mages against a populace of 18,713**, and what bounds the roster is *"not magic and not
mortality; it is student seats"* — 64 of them, filled to exactly 64 from world year thirty onward.

So extinction requires suppressing the **replacement pipeline**: the universities holding the seats,
and the knowledge that lets anyone teach. Those are precisely §8's three objective kinds — *a
library, a university, an archmage*. **Colonization therefore needs no new raid objectives; it needs
the existing ones to be cumulative and persistent across raids.** That is the strongest fit argument
the mechanic has, and it is also its largest risk, because nobody has measured mages-killed-per-raid
or seats-destroyed-per-raid — raids have never executed at all.

> **Acceptance test 2 — the reachability test.** On a multi-universe sweep at n ≥ 96 over 2400 ticks,
> report the median number of successful raids required to reach sixty consecutive mageless ticks,
> against the number of raids a universe can mount in that span given §8's tempo cost. **If the first
> exceeds the second, colonization is unreachable and this change is decoration.** Report the negative
> plainly; the campaign's standing constraints require it.

## Decision 3 — bubbles are two things, and they must be separated

**Bubble-as-adjacency** — a bounded set of universes that may open portals to one another. This is
**world structure**: it answers *which universes are reachable*, which is what `portalTargets` asks.
`CandidateInput.portalTargets` exists in `packages/agent-api/src/candidates.ts` as an optional field
and **nothing in production sets it**; the field's own comment says why — *"one simulation instance
holds one universe — the multiverse is not in state, and there is nothing here to enumerate."*
Consequently `openPortal`'s mask bit is permanently 0, structurally rather than by cost, which is the
campaign board's measured root cause of *"NO RAIDS EVER HAPPEN"*. This is required by W8 whether or
not colonization ever ships.

**Is that matchmaking, which §12 excludes?** No, and the distinction is real rather than semantic.
Matchmaking pairs *players into a session*. Adjacency says which universes exist near each other in
the fiction, is read by the world layer, and is a property of the world rather than of any pairing.
§12's exclusion sits beside *"ranked ladder"* and *"monetization"*; it is about queues and ranking.

**Bubble-as-tier** — bubbles stacked into a ladder, tier N+1 populated by those who cleared tier N.
This **is** a ranked progression system whatever it is called, and §12 puts a ranked ladder out of
v1. It also has a structural property worth stating before anyone builds it:

> If clearing a bubble of size `S` means being the last universe standing, exactly one player per
> bubble promotes and `S − 1` rejoin. Since losers rejoin at the same tier into a fresh bubble
> ("always rejoin"), tier-`N` population is conserved except for the `1/S` who leave upward, and tier
> `N+1` fills at `1/S` of tier `N`'s throughput. **The ladder is geometrically thin at the top** — at
> `S = 8`, tier 3 holds roughly one in sixty-four of the playerbase. That is normal for a ladder and
> it is exactly why a ladder needs a playerbase to mean anything, which v1 does not have.

**Recommendation: adjacency is in scope and should be extracted from this change and handed to
W8/W10 now. The tier ladder is post-v1** — specified here so the shape is on record and W10 can
reserve for it.

**What this costs W10, precisely.** A grep for `universeId`, `hostUniverseId` and
`attackerUniverseId` across every package including tests returns **zero hits**. No identity stable
across simulation instances exists anywhere in the tree; the only identity is a per-process
`EntityHandle` recovered by scanning. Bubble membership is therefore entirely new surface area, not a
rename. It is also constrained by `contracts.md` §0: two universes may interact only if their
`contentRevision` values are equal, with *"no partial-compatibility rule and no negotiation"* — so a
bubble is implicitly a set of universes sharing a content revision, and what happens to a bubble when
content is updated is unanswered.

## Decision 4 — naming, because a collision is already sitting here

The author used **prestige** as a verb, meaning to reset and advance a tier. The codebase uses
**prestige** as a noun for §8a's carried-forward legacy score, with nine authored constants
(`prestige-earn-max` 2048, `prestige-retention` 768, `prestige-cap` 8192, `prestige-base-ascended`
1024, `prestige-base-cutoff` 256, `prestige-base-stagnated` 128, plus per-tier, per-era and
per-worship-tier terms), a loader-asserted identity `cap × (1 − retention) == earn-max`, and a §7
metric named `prestigeAdvantage`.

**Two mechanics cannot share that name.** Recommended terms, coining no new noun:

| Concept | Term | Why |
|---|---|---|
| the bounded neighbourhood | **bubble** | the author's own word; no existing use |
| which layer of bubbles | **`bubbleTier`** (`uint8`) | reads as an index, not a score |
| clearing a bubble and advancing | **promotion** | plain, and unlike "ascension" it does not collide with §8a |

Alternatives if the author prefers a coined noun: *echelon*, *sphere*, *rank*. Whatever is chosen,
this document records that the collision existed, so nobody later reads `prestige-cap` as a cap on
tiers.

---

## The three transfer shapes, and the measurement that would show each failing

The author has specified the mechanic, so this is not a menu. It is the record of what the
alternatives cost, because two of them will be proposed again by someone who has not read this.

### Option A — frozen colony endowment (**recommended; the author's mechanic**)

Derived once at extinction; contributes to the conqueror's worship and materials thereafter.

- **Cost:** one `COLONY` component, one kill-ledger component, one `WORLD_SCHEMA_VERSION` revision.
  No cross-clock arithmetic. From W10, only a stable universe id and a bubble roster.
- **Fails two ways, and both are measurable.**
  > **Failing small — inertness.** Acceptance test 1 above. A 1% worship gain and a 0.76% favor-regen
  > gain from absorbing an entire civilization is not a mechanic.
  >
  > **Failing large — snowball.** Colony worship is a third input to §7's already-compounding favor
  > loop while §6a's knowledge-capital loop compounds beside it — vision §6a's named *"two compounding
  > loops that feed each other"* shape. The metric to watch is **`worshipSnowball`, which carries the
  > explicit `≤ 0.35` bound** (`contracts.md` §7); note that `capitalSnowball` is measured with **no
  > numeric threshold assigned at all** (`thresholdOwner: 'god-agency'`), which is itself a gap worth
  > closing before this change is judged against it. Also report **whether the first universe in a
  > bubble to take a colony clears that bubble more than 60% of the time** — the sharpest of the
  > three, because if first blood predicts the bubble winner, the remaining `S − 2` players are
  > playing out a foregone result, which is the live-PvP failure §8a names. And report `favorWasted`:
  > if it rises, colony worship is overflowing the favor cap and is pure snowball with nothing to buy.

### Option B — tribute from a living vassal (**rejected**)

The loser survives and pays a share of output per world tick.

- **Fails on the project's own methodology, not on taste.** Clocks are per-universe and
  unsynchronised, so "per world tick" names no shared moment; and in single-instance Monte Carlo the
  counterpart is not resident, so the harness models a drain where players experience a transfer.
- It is also the most unambiguously **economy**-shaped option, which §12 puts out of v1.
- Recorded because "vassalage with a recovery path" is the design anyone reaches for first.

### Option C — imposed ruleset constraint (**not chosen, but the one that moves the measured problem**)

The conqueror writes an edict into the loser's ruleset — most interestingly a *dispensation*, forcing
a cell **open** in the loser's sky, which under §3's portal rule arms the conqueror's own future raids
there.

- **Architecturally as cheap as A:** one write at raid resolution, expiry ticking on the loser's own
  clock, no cross-universe reference afterward. Imposing at *resolution* does not violate §3's
  frozen-policy rule, because the raid has ended.
- **It is the only candidate that moves the campaign's measured binding constraint.** The board's
  finding is unambiguous: *"the binding constraint on what a universe knows is the ruleset, not the
  economy"* — `permissive-breadth`, which only permits more cells, reaches 217 nodes where every
  other strategy plateaus at 51. Unlike Option A, this option is **not** inert at the current build.
- **Not chosen** because it is not what the author described, and whether it counts as "colonizing" is
  the author's call. **Raised as open question 10.**
- Details it would need: an imposed edict must **not** consume the loser's edict budget, and its
  interaction with `overBudgetEdicts` — *"reported, never auto-revoked"* (`contracts.md` §1.1) — must
  be stated.
  > **Measurement:** the share of imposed edicts that actually alter a subsequent raid's legal-node
  > mask, and the change in mean nodes known for the imposed-upon universe. If the first is near zero
  > it is decoration; if the second is large it is doing the thing looting does, by another route.

---

## How the six standing tensions resolve

**1 — §7a says the world has no map.** Resolved cleanly and without compromise. Everything
transferred is a count: populace by species, a materials stock, a worship contribution. Bubble
membership is an adjacency set over universe identities — a relationship, which §7a explicitly
permits (*"counts and relationships"*). **No entity gains a coordinate anywhere in this change.**

**2 — §8's griefing warning.** Resolved by the author, and it should be stated accurately rather than
as a waiver. §8 warns that unbounded loss is *"a live-PvP death sentence"*. What the author specified
is not unbounded loss: **a universe is a run, and defeat is a fast re-entry carrying legacy.** The
design already prices this — `prestige-base-stagnated` is non-zero *"deliberately: a zero floor makes
losing streaks spiral"* — and §8a already says the persistent world is *"persistent across runs, not
within one infinite run"*. The player never leaves the game; only universes end. **This proposal
therefore proposes no mitigations** — no vassalage, no devotion decay, no revolt — and the risk
relocates entirely to the conqueror's side, where Option A's measurements sit.

**3 — §8a: ascension closes a universe.** **Unresolved, and it is this proposal's central open
question.** See question 1.

**4 — §1.1: one universe per simulation instance.** Resolved by Decision 1 at close to zero
architectural cost, and the cost is stated exactly: one appended component section, one
`WORLD_SCHEMA_VERSION` revision (no existing field table reshaped, `sim-core`'s `SNAPSHOT_VERSION`
unmoved — the migration shape this project has used four times), and from W10 a stable universe
identity plus a bubble roster, **neither of which exists in any form today**. The heavy version —
Option B — would have required per-tick cross-universe evaluation on unsynchronised clocks, and
rejecting it is what keeps the ask small.

**5 — §12 puts economy out of scope.** **Split, and the split is the honest answer.** §12's "economy"
sits beside *"ranked ladder, matchmaking beyond direct challenge, monetization"*, which reads as the
meta/monetization economy rather than §6a's populace-and-materials economy — §6a is in the vision and
shipped in 0.4.0. **That ambiguity is itself worth the author resolving** (question 12). Under either
reading: colonial tribute as a one-time derived endowment is a **raid consequence**, sitting in §8's
list beside casualties and burned books, not a recurring economy; whereas the **bubble tier ladder is
unambiguously a ranked progression system and is out of v1 under §12**.

**6 — Does it help the measured problem?** **No, and the numbers are worse than "no".** The measured
problem is content exhaustion: 70 cells authored, 12 enabled, containing exactly 51 of 300 nodes, and
an idle universe learns all 51. Looting attacks that directly — it moves *nodes* between universes,
adding to the taker and removing from the loser. **A colony transfers populace, materials and
worship. It transfers no nodes.** A conquered universe by definition has no mages left to read, and
its books were looted by the raids that killed them, which is W8's mechanic, not this one. And per
the inertness finding, the two things it *does* transfer are a worship channel already at 94.8% of
its cap and a materials flow whose only live claimant is a scribe loop that copies an exhausted set.

So the honest verdict, in the terms the brief asked for:

- **Looting and colonization are not interchangeable, and they do not solve the same problem.**
  Looting answers the plateau. Colonization answers a different and also real problem — that raids
  have no terminal stake and the persistent world has no shape — but that is not what is currently
  blocking the campaign.
- **Colonization does not earn a place beside looting in v1.** Its feasibility is unmeasured
  (acceptance test 2), its effect is measurably near-zero at this build (acceptance test 1), and
  what effect it would have lands on a loop the vision already warns about.
- **The one piece that does earn v1 is not colonization at all.** It is bubble-as-adjacency, the
  missing answer to `portalTargets` and therefore to the measured root cause of why no raid has ever
  executed. It should be extracted and handed to W8/W10 immediately rather than waiting on this
  change.
- **If one colonization mechanic must ship in v1, Option C is the better bet than Option A** — same
  architectural cost, and it moves the constraint the campaign measured as binding. That it is not
  what the author described is exactly why it is a question and not a recommendation.

## Risks

- **The transfer is inert.** Acceptance test 1. Stated first because it is measurable today, on the
  existing harness, without implementing anything.
- **The mechanic may be unreachable.** Acceptance test 2.
- **The conqueror's snowball.** Option A's measurements. Note the correction: the explicit `≤ 0.35`
  bound belongs to `worshipSnowball`; `capitalSnowball` has **no threshold assigned in code**.
- **Species may decide the match.** Draconic mages live ~1500 years and elven ~700, against an orc's
  ~60. Within a 2400-tick (200-year) run, mortality removes a human or orc roster several times over
  and removes **zero** draconic mages — and a single surviving mage resets `magelessTicks` to zero. A
  conqueror facing a draconic universe must kill every mage by force; facing a human one, mortality
  does most of the work and the raider need only suppress the replacement pipeline.
  > **Measurement:** conquest rate by founding species mix, n ≥ 96 over 2400 ticks. **If draconic
  > conquest rate is near zero while human exceeds 0.3, conquest is species-determined rather than
  > play-determined**, which fails the spirit of the campaign's D7 and D9 — species should change
  > which strategy wins, not decide the match. The same measurement distinguishes the good case: if
  > draconic universes are hard to conquer *and* clear their own bubbles rarely, that is a trade, and
  > §6's *"few, ancient, and terrifying"* is working as authored.
- **Two prestige accumulation paths, far apart.** The recurrence `prestige' = prestige × retention +
  earned` with retention 768/1024 has fixed point `4 × earned`. A player who only ever loses, earning
  the stagnated base with no achievement terms, converges toward **512**; the `prestige-cap` of 8192
  is reachable only by consistently earning `prestige-earn-max` 2048 — a **sixteenfold** standing
  gap, and the loader's asserted identity `cap × (1 − retention) == earn-max` is exactly that
  statement.
  > **Measurement:** `prestigeAdvantage` must stay under 60% (`contracts.md` §7). Sweep a converged
  > loser against a converged high earner and measure the win-rate delta. **If it exceeds 60%, tiered
  > matchmaking is not a scope extra — it is the thing that makes prestige safe**, and the ladder's v1
  > exclusion becomes a live problem rather than a deferral.
- **A new terminal reason silently mis-prices.** `prestigeEarned`'s branch treats anything that is
  not `stagnation` as the cutoff case, so a `conquest` reason added naively pays 256 rather than 128.
  Question 2 must be answered before the enum is extended.
- **RNG streams.** Any draw this change adds — claim resolution, bubble assignment on rejoin — needs
  its own stream in `contracts.md` §6. Adding a draw to an existing stream re-rolls another subsystem
  and silently rots every committed baseline.

## Open Questions

Raised for the author, not answered here. The first is the one that matters most.

**1. Which is the real win condition — ascension, or clearing a bubble?** §8a's ascension is a win
condition that *closes your universe*. Clearing a bubble is now also a win condition, and a larger
one, since it promotes you. Two readings, both defensible:
- *Alternatives* — ascend for a personal summit, conquer for dominance. Then ascension must be worth
  choosing over conquest, and it currently closes your universe, which appears to forfeit your bubble
  position.
- *Composed* — ascension is how a universe ends well and banks legacy; clearing the bubble is how a
  player leaves the tier. Then: what happens to bubble progress when you ascend and open a new
  universe in the same bubble, and do your colonies carry?

This is immediate rather than theoretical. W6 has just made ascension discriminating and measured it
— rate 0.167, exploit margin +0.167, correlation +0.97 with knowing magic. **If conquest is the real
win condition, those numbers describe a side quest.**

**2. Does a conquered run pay `prestige-base-stagnated` (128), or its own base?** "Conquered, and
feeding a rival" is arguably a different ending from "ruined by neglect". This is not only a feel
question: as noted above, a new `TERMINAL_REASON` added without answering it falls into the *cutoff*
branch and pays 256.

**3. Which tier does a player rejoin at?** The author said *"always rejoin"*, not "rejoin where you
were." Same-tier rejoin makes tiers sticky and forgiving; demotion makes them meaningful and
punishing. Not this document's call.

**4. What decides bubble size and composition?** It is the parameter that decides how often anyone is
raided at all, and therefore whether the raid layer is live enough to matter. Small bubbles clear
fast and churn tiers; large ones make raids frequent but promotion rare. Proposed as an authored
content constant with a `gloss` and `tuningStatus: "untuned"`, value left to the author and the
harness.

**5. What does "conquered all universes in your bubble" mean when everyone is conquering?** If bubble
members eliminate each other, most are extinguished before anyone clears it — so is clearing "be the
last one standing" (a battle-royale shape), or "personally conquer all `S − 1` others" (much
stricter, and promotion becomes rare)? The two produce very different tier throughputs.

**6. The "special circumstances" that allow an unbounded bubble.** Allowed for by the author and not
specified. Recorded as an explicit exception.

**7. How is a conqueror attributed?** Proposed above as kill-ledger plus claim, but last-raider and
most-kills are both defensible and cheaper. The choice decides whether conquest is a decision or a
side effect.

**8. Is a colony static, decaying, or living?** *"They pay whatever they paid to their old god"* reads
as **static**. Static compounds without bound as colonies accumulate; **decaying** bounds it at the
cost of contradicting the phrasing; **living** is a second resident universe by another name and is
rejected. No default is assumed here.

**9. Do absorbed people actually join, or only pay?** Decision 1 has them contribute worship and
materials without entering the conqueror's cohorts, because the conqueror's `K` did not grow. **If
they should genuinely join — live, breed, produce mages — then land must transfer with them,
`contracts.md` §2.7's `landUnits` migration into §1.1 fires, and this change becomes materially
larger.** A real fork, and the author's.

**10. Is Option C what "colonize" meant?** Imposing a *dispensation* — forcing a cell open in a
rival's sky, which under §3 arms your own raids there — is the only candidate that moves the
campaign's measured binding constraint, and unlike Option A it is not inert at this build. It is not
what the author described. Worth one sentence of confirmation before it is discarded.

**11. Does the vision get a §8b?** Colonization is traceable to no section of `vision.md`, and
`CLAUDE.md` says untraceable work is scope creep. This change needs an author-owned vision amendment
as a prerequisite, and follows `raid-engagement`'s precedent of raising rather than editing.

**12. Does §12's "economy" mean §6a's economy?** §6a is in the vision and shipped in 0.4.0, while §12
lists "economy" as out of scope for v1. Those cannot both mean the same thing, and the ambiguity
affects more changes than this one.

**13. Should colonies have their own worship channel?** Required if the transfer is to be anything
other than inert, and it means raising `worship-max` above 9216 and updating the loader's asserted
sum identity. A content change with an invariant attached, not a tuning turn.
