<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Overnight plan, and the decisions taken without asking

*2026-08-14. The owner is asleep and asked for as many design decisions as could reasonably be made,
plus autonomous experiments. This is what was decided and why, so every call is reversible by someone
reading one file.*

## The sequencing decision, which is the important one

**No new measurement until two branches land.** Not a scheduling preference — a correctness rule,
learned twice tonight at real cost.

**1. `w115/enable-all-cells`.** The enabled twelve cells cover four forms, and species affinities barely
intersect them: gnome and human have **no reachable affinity at all**, and elf, draconic and orc express
only their weakest. **The campaign's long-standing "all six species can staff 70 of 70 cells and are
interchangeable" was an artifact of that selection.** Every measurement taken on twelve cells is
measuring a world that is about to stop existing, and will produce more artifacts of exactly that kind.

**2. `w116/complete-affiliation`.** `completeAffiliation` has no production caller, so no mage a universe
promotes is ever affiliated, and an unaffiliated mage cannot scribe or ward. **162 living human mages
produce 0.05 grimoires; 4.3 draconic mages produce 76.** The alliance experiment attributed its result
to curiosity, then headcount, then demographics — **and it was this.** Any effect size measured before
this lands is measuring the defect.

**So: land the two, then re-measure. Do not run sweeps in between.** The cheapest possible
re-measurement is already on disk — `balance/w99/` committed 1,000 run records at 100 replicates/arm
precisely so later work could compare without re-running.

## Decisions taken

**1. `w99`'s human arm is suspect and must not be quoted until confirmed.** Five of six baseline arms
reproduce it exactly; human differs (40.92 vs 39.62 nodes) and **reproduced on a clean re-run**, so it
predates the branch that found it. `w99` was recorded eighteen commits back. **Treat the other five as
sound and human as unverified** until someone re-runs it.

**2. The shadowing audit extends from legality to price.** `w90/mask-sync` asks whether a verb was legal
and never submitted. **It must also ask whether a verb was affordable and never saved for.** Three
instances now: `permissive-breadth` never founding a university, `narrow-depth` never asking for a grant,
and orc never accumulating an invitation's 24,576 favor because it always had something cheaper to buy.
**A greedy preference list over a mixed price range is a spending habit, not a strategy**, and it
silently converts *"unaffordable"* into *"unwanted"*.

**3. `reachable-not-worth-playing` is tier-relative, not absolute.** Now that the bot pool is the shipped
opponent roster, a bot that beats `passive-control` by +2 is **good filler on world two and an
embarrassment at the top.** The archive already carries `marginOverNull` per cell; the verdict should be
read against a tier rather than as a single pool-wide judgement.

**4. `marginOverNull` is the bot difficulty rating.** It was built as the search's headline number and is
exactly what a prestige tier needs. **No new instrument** — the roster is the archive read as a grid,
cells for variety, margin for tier.

**5. Which null rung a bot clears is its tier assignment.** A bot that beats `passive-control` and loses
to `permit-then-idle` is a low-tier opponent with a legible weakness; one clearing all four is top-tier.
**The rung diagnosis stops being a debugging aid and becomes the ladder's rungs.**

**6. Do not wire the 1.15 cross-species affinity cap yet.** It is the obvious next mechanic and it is
**downstream of `w115`** — dragons cannot reach fire today, so a measurement of whether difference
matters is not currently possible. Wiring it now would produce a number nobody could interpret.

## What runs overnight

- **A detached merge watcher**, landing PRs as their required checks go green. It reads state and never
  overrides a gate.
- **The two blocking branches**, already in flight.
- **`w107/apply-magic`**, in flight — the one that answers *"magic doesn't do anything"*, which three
  separate specs now wait on.
- **Then one gated experiment**: re-run `w99`'s methodology against its own committed records, once both
  blockers have landed. **Gated, not scheduled** — if the blockers do not land, it does not run, because
  running it early is the exact error this plan exists to prevent.

## What was deliberately not done

**No new agents beyond the gated experiment.** Roughly eighty worktrees share this machine, and the
RPC-timeout noise that has repeatedly had to be explained away as "documented starvation signature" is
self-inflicted. **Fewer, sequenced agents produce more trustworthy numbers than more parallel ones.**

**And no re-baselining.** Several branches are in that stack and the two blocking changes will move
everything again. **Re-recording now would be work done twice and a diff nobody could read.**
