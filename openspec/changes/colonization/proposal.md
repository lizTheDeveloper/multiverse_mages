## Why

`raid-engagement` makes two universes able to fight. Nothing yet makes a fight *matter beyond
itself*. A raid today ends with casualties, burned books and looted grimoires, and then both
universes go back to their own clocks having changed nothing about the world they share — because
there is no world they share. Vision §8a says a ruined universe *"does not 'lose' — it stagnates,
and stagnation is its own ending"*, and leaves open what becomes of its people.

The author's direction answers that, in four parts:

> *"Extinguish their magic users so there are no more — that is what colonizes them. And then they
> pay whatever they paid to their old god: their taxes and materials and labour go to the new
> group."*
>
> *"You gotta respawn in a new group of multiverses."* … *"You go until you have conquered all
> universes in your bubble, then you prestige to the next bubble, where it's all people who
> conquered a bubble."* … *"That way you can always rejoin when you lose."*

Together those describe a loop in which **a universe is a run and the player never leaves the
game**:

    within a bubble:      raid, loot, extinguish rivals
    extinguished:         mages gone -> populace, materials and worship pass to the conqueror
    clear the bubble:     promoted to the next tier, populated by others who cleared theirs
    lose your universe:   rejoin a fresh bubble, carrying prestige
    only universes end.   the player does not.

Three things this lands on already exist, and the change is small because of it:

- **A mageless universe already has a terminal state.** `magelessTicks` counts consecutive world
  ticks with no living mage and ends the run as stagnated. Colonization invents no ending; it gives
  an existing one an *attribution* and a *beneficiary*.
- **§7's worship loop is already the transfer channel.** Favor regeneration scales with worship —
  *"the number and devotion of mages, universities, and populace revering you"*. A populace that now
  reveres a different god is a quantity change in a formula that already exists.
- **§8's three objective kinds already compose into the extinction condition.** Killing mages is not
  sufficient, because mages are replaced out of student seats; extinction requires suppressing the
  replacement pipeline too. *A library, a university, an archmage* is exactly that list. **This
  change adds no raid objectives.**

And it needs no map. Populace, materials and worship are counts; bubble membership is an adjacency
set. Vision §7a's *"world-scale entities carry no coordinates at all"* is preserved without
argument, which is the strongest structural fact about this proposal.

**This proposal is deliberately held at proposal depth,** for the same reason `pvp-server` is: the
central magnitude — how many raids it takes to extinguish a universe — has never been measured, and
if the answer is thirty then the mechanic is unreachable and everything below is decoration. The
proposal states the measurement rather than assuming the answer.

## What Changes

- **Extinction becomes an attributable terminal reason.** A universe whose `magelessTicks` reaches
  the stagnation threshold ends as `conquest` rather than `stagnation` when a conqueror is
  attributed to it, and as `stagnation` when none is. No new terminal condition is introduced.
- **Attribution is recorded during raids, not inferred afterwards.** A per-attacker ledger of mages
  killed accumulates in the defender's world state across raids, so that "who did this" is a fact
  the state carries rather than a guess made at the moment of death.
- **A colony is a frozen summary, not a second resident universe.** At extinction the engine derives
  one `COLONY` component row in the conqueror's world state from the extinguished universe's
  terminal state — surviving populace by species, materials stock, and worship contribution — and
  that row feeds the conqueror's worship and materials on the conqueror's own clock. The
  extinguished universe stops simulating. **This is what makes the mechanic affordable**, and it is
  argued at length in `design.md`.
- **Absorbed populace does not join the conqueror's cohorts.** It contributes worship and materials
  only. The alternative imports people into a carrying capacity that never grew to hold them, and
  §6a's fertility brake would kill them off within a few ticks — the mechanic would visibly undo
  itself. Consequence: `contracts.md` §2.7's anticipated `landUnits` migration is **not** triggered
  by this change. That passage anticipated *"a raid that takes ground"*; the author's colonization
  takes people, not ground.
- **Bubbles bound who can portal to whom.** A bubble is a bounded set of universes that may open
  portals to one another. It is the thing that populates `portalTargets`, which today nothing
  populates — the campaign board's measured root cause of *"NO RAIDS EVER HAPPEN"*.
- **A player who loses a universe rejoins into a fresh bubble,** carrying prestige under the existing
  §8a recurrence. Defeat is a re-entry, not an exit.
- **Bubble tiers are specified and recommended for post-v1.** Clearing a bubble promotes a player to
  a tier populated by others who cleared theirs. This is a ranked progression system, which vision
  §12 puts out of v1 scope. The capability is written so the shape is on record and W10's
  persistence can reserve for it, not so it ships in v1.

**BREAKING:** none by itself. Adding the `COLONY` component and the attribution ledger costs a
`WORLD_SCHEMA_VERSION` revision, which is an appended component section and the migration shape this
project has used four times. It changes no existing component's field table and does not move
`sim-core`'s `SNAPSHOT_VERSION`.

**Depends on amendments this change does not make.** Colonization appears nowhere in `vision.md` —
§8's termination is *"destroying or looting a target"* — and `CLAUDE.md` is explicit that untraceable
work is scope creep. This change therefore **requires a vision amendment (a new §8b, or an extension
of §8a) as an author-owned prerequisite**, and raises it as an open question rather than editing the
vision of record. The same holds for `contracts.md` §1.1: a bubble is a structure above the
one-universe-per-instance rule, and amending §1.1 is `core-contracts`' deliberate act.

## Capabilities

### New Capabilities

- `universe-extinction`: the mageless terminal condition gaining an attributed conqueror — the
  per-attacker kill ledger written during raids, the claim window, the `conquest` terminal reason
  beside `stagnation`, the rule that an unclaimed extinction is still a stagnation, and the
  prestige a conquered run pays.
- `colonial-tribute`: what a conquered universe yields and how — the colony record derived once at
  extinction, its contribution to the conqueror's worship and materials, the rule that absorbed
  populace never enters the conqueror's cohorts, colony dynamics over time, and the snowball
  measurements that would show the yield mispriced.
- `multiverse-bubbles`: the bounded neighbourhood — bubble membership as the source of
  `portalTargets`, bubble size as an authored untuned constant, rejoin on the loss of a universe,
  and the tier structure recorded for post-v1 with its scope argument stated in the spec itself.

### Modified Capabilities

None yet, and that is a claim this change cannot fully honour until the vision amendment lands.
`ascension-and-prestige` is the capability most likely to need a delta: §8a's ascension and a bubble
clear are now two win conditions, and which one a player actually wants is this proposal's central
open question. No delta is filed against it here because filing one would be answering that question
by implication.

## Impact

- **New:** a `COLONY` component and an attacker-kill-ledger component in `packages/state`; extinction
  attribution and claim handling in `packages/coordination`'s world loop; the colony's worship and
  materials contribution in `packages/rules-world`; the kill-ledger write in `packages/rules-raid`'s
  consequence path; bubble membership and `portalTargets` derivation, whose home is argued in
  `design.md` and is most likely `packages/scenario` plus `packages/server`.
- **Depends on:** `raid-engagement` for the raid that kills the mages and for the consequence
  write-back the ledger rides on; `god-agency` for worship, favor, prestige and the terminal-reason
  machinery; `mages-and-species` for populace cohorts, universities and the student-seat pipeline
  that makes extinction hard; `agent-interface` for the harness that must price it before it ships.
- **Downstream, and this is the load-bearing one:** `pvp-server` must carry bubble membership, a
  universe id stable across simulation instances, and the rejoin transition, as persistence state.
  W10 is defining those contracts now. **What this change needs from W10 is small and specific** — a
  stable universe identity and a bubble roster — precisely because the colony is a frozen summary
  rather than a live relationship. That distinction is worth stating to W10 explicitly: a
  vassalage-style tribute from a *living* universe would have required per-tick evaluation across two
  universes whose clocks are per-universe and unsynchronised (`contracts.md` §0), and would have been
  a far heavier ask.
- **Balance:** this change adds a third input to §7's worship loop, which already compounds, while
  §6a's knowledge-capital loop compounds beside it — the exact *"two compounding loops that feed each
  other"* shape vision §6a warns produces runaway leaders. The metric that bounds this is
  **`worshipSnowball`, which carries the explicit `≤ 0.35` bound**; `capitalSnowball` is measured with
  **no numeric threshold assigned in code** (`thresholdOwner: 'god-agency'`), which is a gap worth
  closing before this change is judged against it. **The balance risk in this proposal is entirely on
  the conqueror's side**, not the victim's, and the measurements that would show it failing are named
  in `design.md`.
- **Scope verdict, stated plainly because the author asked for it:** the bounded neighbourhood
  belongs in v1 and is urgent, because nothing else answers `portalTargets`. Extinction-with-
  attribution is authorable now and implementable once the harness can price it. Colonial tribute
  carries real snowball risk and does **not** address the campaign's measured problem, which is
  content exhaustion — 51 of 300 nodes, learned by an idle universe. The bubble tier ladder is
  post-v1 under §12. The full argument, including why looting and colonization are not
  interchangeable, is in `design.md`.
- **Risk accepted, and one of the two is already measured.** Every magnitude here is an untuned
  placeholder, and two carry the change rather than decorate it. **The transfer appears to be nearly
  inert at this build:** worship saturates per channel, and the populace term already sits at **94.8%
  of `worship-populace-cap`** at the reference run's populace of 18,713, so absorbing an equivalent
  civilization adds roughly **52 fp of worship against a total of ~4,831** — about a **0.76% increase
  in favor regeneration**. The other half, materials, is unsaturated but its only live claimants are
  subsistence and scribing, so colonial materials fund more copies of an already-exhausted 51-node
  set. **And the mechanic may be unreachable:** nobody has measured how many raids it takes to hold a
  universe mageless for sixty consecutive ticks. Both are stated as acceptance tests in `design.md`,
  the first of which can be run on the existing harness today, rather than discovered after
  implementation.
