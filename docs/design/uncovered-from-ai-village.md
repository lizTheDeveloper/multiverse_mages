<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# What is in AI Village and not here, and not yet designed

*Survey, 2026-08-13. Source: `~/src/multiverse_games/games/mvee`, same owner. The paradigm data is
covered in `ruleset-map.md`; **this is what that document missed.** A deeper pass is running as an
agent; this is the first look.*

**The paradigms were the obvious import. The systems around them are the interesting one.**

## Four that matter, in order of what they would do for this project

### 1. `ComboDetector.ts` — an automated degeneracy finder

> *"Analyzes paradigm combinations to detect: **economy-breaking combos, god-mode combinations,
> infinite resource loops**."*

**This campaign has been doing that by hand for weeks.** `permit-then-idle` winning 40/40 by doing
nothing for 2,260 of 2,400 ticks; `open-then-build` founding 98 universities against a threshold of 2
with 4.7M favor unspent; `archivist` building ~1,300 universities for the same 51 nodes doing nothing
reaches. **Every one was found by a person reading a sweep.**

**A detector that looks for the *shape* of a degenerate combination rather than waiting for a metric to
notice is the single most valuable thing in this survey.** It is also the natural companion to the null
ladder: the ladder catches *dominance*, and Sirlin's definition needs dominance **and** dullness —
**this is a candidate for the missing half.**

### 2. `ParadigmComposition.ts` — two paradigms in one practitioner, with exclusions

> *"Paradigm RELATIONSHIPS describe how paradigms interact when a **single practitioner** tries to use
> both — e.g. you can't serve both a god AND a demon: the Divine+Pact **exclusive** relationship."*

**This is the sorcerer question, already solved, and better than my sketch of it.**
`discoverable-traditions.md` argues that a per-mage tradition is a schema revision and worth it. **What
it does not have is a theory of what happens when a mage holds two** — and `mvee` has one, with named
relationship kinds and exclusivity.

**It is also `ages-of-magic.md`'s "interactions of two."** That document says ages are governed by the
interactions of two and that three takes time to develop — and has no mechanism. **This is the
mechanism**, authored, in a sibling repository.

**And "you cannot serve both a god and a demon" is exactly the late-game tension the forbidden-magic
spec needs**: a scholar who takes the pact gives something up, and the giving-up is expressible rather
than asserted.

### 3. `MagicAcademy.ts` — institutions that teach multiple paradigms

> *"Academies are organizations that teach related magic systems together: **shared curricula between
> compatible paradigms, cross-paradigm synergy bonuses**."*

**Mages' universities have exactly one growth axis — library depth — and 1,300 of them buy nothing.**
The design has since made them load-bearing (prodigies unlock cells through them), and this supplies
the second axis: **an academy is defined by *which paradigms it teaches together*.**

That is a far better answer than the "coordinated non-magical throughput" I had queued from ep 41. **A
university becomes a *curriculum* rather than a pile** — which is also what would let two universities
finally differ, the thing `w78`'s teaching boundary could not achieve alone.

### 4. `MagicLawEnforcer.ts` — laws, risks and consequences

> *"Checks whether a spell can be cast within a paradigm, calculates costs, evaluates **risks**, and
> determines **consequences**."*

**Mages has `permits()`, which is binary**: a cell is legal or it is not. `mvee` paradigms carry `laws`,
`risks` and `channels` — fields `ruleset-map.md` noted as having *no counterpart*.

**A law with a consequence is a different object from a prohibition**, and the forbidden-magic spec
needs one: *"someone does something dark and twisted"* implies a rule that can be broken at a price,
not a cell that is closed.

## Not yet examined, and each may hold more

The magic package alone has thirteen subdirectories and thirty-odd modules. **Named here so the next
pass has a list rather than a hunch:**

`ArtifactCreation.ts` (**the Box of Ascendance has a counterpart after all**) · `MagicSkillTree*.ts`
(three modules) · `MagicDetectionSystem.ts` (**counter-intelligence, which W66 withdrew as unmappable**)
· `summoning/` (`summon` is a Mages primitive with **zero castable nodes**) · `blessing/` · `costs/` ·
`evaluation/` · `generation/` · `NullParadigms.ts` (**anti-magic — the `null` and `anti` positions on
the intensity axis**) · `LLMEffectGenerator.ts` · `MagicSourceGenerator.ts`.

**And the engine beyond magic is entirely unexamined**: 212+ systems, 125+ components, and metasystems
named **Consciousness, Divinity, Reproduction, Multiverse and Realms** — plus packages for botany with
genetics, environment with weather and soil, and **persistence with time travel.**

**`Divinity` and `Multiverse` are the two whose names alone suggest overlap with this project's core**,
and neither has been opened.

## The caution that applies to all of it

**`mvee` is a much larger simulation with a persistent 3D world.** Mages is deliberately smaller: no
world-scale coordinates, fixed-point determinism, zero runtime dependencies in the core. **Most of what
is over there cannot come across, and the value is in the *designs* rather than the code.**

**Take the ideas and the names; re-derive every number; port nothing that assumes a voxel world.**
