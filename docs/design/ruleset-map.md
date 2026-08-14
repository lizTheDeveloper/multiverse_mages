<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The ruleset map

*Status: proposal, 2026-08-13. Sourced from a sibling project — `mvee` (*Multiverse: The End of
Eternity*), at `~/src/multiverse_games/games/mvee`. Nothing here is approved. Read
`self-evolving-search.md` first: this is what that search should explore **instead of** random
opening squares.*

## The problem this solves

The search currently explores rulesets by **drawing a rectangle of the grid at random**. That works —
seeded squares take within-strategy containment from 0.980 to 0.250 — but a random rectangle is not a
*magic system*. It has no identity, nothing to be true or false about it, and nothing a player could
recognise or name.

**`mvee` has already solved this, and its solution is data rather than prose.** Forty-three authored
magic paradigms, positioned on four independent axes, each with a machine-readable definition of what
magic *is* in a universe that runs it.

## The four axes

`custom_game_engine/packages/magic/src/ParadigmSpectrum.ts`. They are declared independent, and the
file argues for the independence: *"you can have high magic with low animism (rule-based wizards), or
low magic with high animism (mundane world where everything has a spirit but magic is rare)."*

| axis | positions |
|---|---|
| **Magical intensity** | `null` · `anti` · `dead` · `trace` · `low` · `medium` · `high` · `saturated` |
| **Source origin** | `none` · `divine` · `pact` · `ancestral` · `environmental` · `internal` · `knowledge` · `emotional` · `material` · `narrative` |
| **Formality** | `chaotic` · `intuitive` · `traditional` · `trained` · `academic` · `scientific` |
| **Animism** | `materialist` · `mammalian` · `animal` · `organic` · `object` · `elemental` · `abstract` · `panpsychic` |

**This is a ruleset space with named coordinates.** Mages currently has one: twelve cells of a
seventy-cell grid, identical in every universe.

## Why it maps onto Mages almost exactly

A paradigm record carries these fields, and the left column is not a paraphrase — it is the field name:

| `mvee` field | what it already is in Mages |
|---|---|
| `availableTechniques` × `availableForms` | **the grid.** `mvee` uses 8 × 11, Mages 5 × 14 |
| `allowsTeaching` | the `acquire` hook |
| `allowsScrolls`, `allowsEnchantment` | the `store` hook — *"a tradition whose `store` hook keeps no written copies cannot scribe at all"* |
| `costs`, `powerCeiling`, `powerScaling` | the `cost` hook |
| **`foreignMagicPolicy`** | **the Portal Rule.** Values: `compatible` · `hostile` · `incompatible` · `absorbs` |
| `compatibleParadigms`, `resonantCombinations`, `forbiddenCombinations` | cross-paradigm interaction |
| `laws`, `risks`, `channels`, `acquisitionMethods` | no counterpart yet |

**`foreignMagicPolicy` is the find.** Mages' §3 Portal Rule says a raid is arbitrated by the *host*
universe's ruleset — and `mvee` has already enumerated four answers to what happens when foreign magic
arrives. That is a raid mechanic sitting in a data file in another repository.

## What the paradigms are worth as search seeds

Three of the shipped ones, to show the range is real and not cosmetic:

| paradigm | teach | scrolls | ceiling | techniques × forms |
|---|---|---|---|---|
| `academic` | **yes** | **yes** | 100 | 8 × 10 |
| `pact` | **no** | **no** | 150 | 4 × 4 |
| `names` | yes | yes | **none** | 4 × 6 |

**`pact` cannot be taught and cannot be written down.** In Mages that is a universe where the entire
knowledge-transmission apparatus — teaching, scribing, libraries, the university — does not apply, and
where a mage's death is total loss. Mages has three traditions and **has never run a sweep across
them**; `mvee` has forty-three, and they differ on the axes that would actually change the game.

Compare against what the campaign measured: the reference tradition, True Naming, sets
`instanceMastery: 1024` on **every** instance, so researched knowledge is immediately teachable and
chains losslessly. **Every measurement this project has taken assumes that.** `pact` is the arm that
would say how much of it was tradition-specific.

## How to use it, in order

1. **Take the four axes as the ruleset map, unchanged.** They are a better-designed space than the
   opening-square rectangle and they cost nothing to adopt — it is a coordinate system, not code.
2. **Import a handful of paradigms as sweep factor levels**, starting with the three above, because
   they differ on `allowsTeaching` and `powerCeiling` — the two properties the campaign has shown are
   load-bearing. **This is the tradition sweep W92 called the cheapest unrun experiment, with real
   content instead of the three v1 traditions.**
3. **Adopt `foreignMagicPolicy` for the Portal Rule.** Four named answers beat inventing one.
4. **Only then consider the grid vocabularies.** `mvee`'s 8 × 11 and Mages' 5 × 14 are different
   alphabets — `create/destroy/control/transform/perceive/protect/enhance/summon` against
   `creo/perdo/rego/muto/intellego`. **Do not unify them.** Mages' vocabulary is Ars-Magica-derived and
   its content is 300 authored nodes deep; a translation table at the paradigm boundary is cheap and a
   migration is not.

## Two cautions

**This is a sibling repository, not a dependency.** Copying the *data* is a licensing question and the
*coordinate system* is not — an axis with named positions is a design idea, and adopting it costs
nothing legally or technically. **Check the licence before importing any JSON**, per CLAUDE.md's rule
that every dependency must be AGPL-compatible.

**And `mvee`'s numbers are its own.** `powerCeiling: 100` means nothing in fixed-point 1/1024, and a
paradigm's costs are tuned for a different simulation. **Import the structure and the names; re-derive
every magnitude.** The 1024× error has shipped twice in this project already.
