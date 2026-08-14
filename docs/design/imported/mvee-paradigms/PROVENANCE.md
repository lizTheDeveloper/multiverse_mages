<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Provenance — imported `mvee` paradigm records

**Imported 2026-08-13** on branch `w110/paradigm-study`, for the investigation written up in
`docs/design/mvee-paradigm-survey.md`.

## Source

| | |
|---|---|
| **Repository** | `mvee` / *AI Village* — *Multiverse: The End of Eternity* |
| **Path** | `~/src/multiverse_games/games/mvee`, working tree as of 2026-08-13 |
| **Files** | `custom_game_engine/packages/magic/data/core-paradigms.json`, `.../creative-paradigms.json`, `.../data/paradigms/dimensional-paradigms.json`, and `custom_game_engine/packages/magic/src/NullParadigms.ts` |
| **Licence** | **AI Village License**, `LICENSE` at that repository's root |
| **Copyright** | Ann Howard |

## Why this copy is licensed, which is not obvious

**The AI Village License is not AGPL-compatible on its face.** It is a source-available licence with
a revenue obligation on corporate users, which is precisely the class `CLAUDE.md` bans from this
repository's dependency graph — alongside BSL, SSPL, Elastic and CC BY-NC. Reading that rule and
stopping would be the correct instinct.

**What makes this copy legal is common ownership, not licence compatibility.** The copyright holder
of `mvee` (Ann Howard) and the copyright holder of Multiverse Mages (Ann Kelner) are the same person,
and she has authorised the copy. A copyright holder may license her own work to herself on any terms
she likes; the AI Village License constrains third parties, not its author.

**Two consequences that must be respected:**

1. **This authorisation covers this material only.** It is not a precedent for importing anything
   else from `mvee`, and it does not make `mvee` an AGPL-compatible dependency. **Do not add `mvee`
   as a package dependency**, and do not import further material without asking again.
2. **This directory is documentation, not content.** Nothing here is loaded by
   `packages/content/src/loader`, validated by `check:content`, or reachable from the rules path.
   `packages/content/data/` remains entirely Ann Kelner's own work under AGPL-3.0-or-later. Moving
   any of this into that directory would be both a schema change and a fresh licensing question.

## What is here

| file | contents |
|---|---|
| `shortlist.json` | Verbatim records for `pact`, `threshold`, `dimension`, plus `dimension`'s 13-entry `dimensional_powers` spell list. Extracted with `jq`; unmodified. |
| `null-family.json` | Hand-transcribed summaries of `null`, `dead`, `anti`, which `mvee` defines in TypeScript rather than JSON. **Only fields actually read from the source are recorded**, each with the line it came from. Absent fields were not checked, not confirmed empty. |

## Magnitudes are deliberately unconverted

Every number in these files is `mvee`'s, at `mvee`'s scale, tuned for `mvee`'s simulation.
`powerCeiling: 250`, `regenRate: 0.02`, `probability: 0.3`, `powerMultiplier: 1.8` — **none of these
mean anything in Mages.** The rules path is fixed-point at 1/1024 and carries no floats at all, so
several of these values are not merely mis-scaled but of a type that cannot enter it.

They are left as they are on purpose. A half-converted number is worse than an obviously foreign one,
because it looks like it has been thought about. **Import the structure and the names; re-derive every
magnitude.** The 1024× error has shipped twice in this project already.
