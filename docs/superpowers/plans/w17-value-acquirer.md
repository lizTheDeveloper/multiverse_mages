<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W17 — the value-sensitive acquirer

**Branch:** `w17/value-sensitive-acquirer`, from `main` at `6e5ecee`.
**Upstream measurement:** `docs/design/strategy-dimensionality.md` on `origin/w15/strategy-dimensionality`.
**Mandate:** vision §7 — *"mages act on utility-scored goals shaped by species, age, personality, and
their assigned standing role (researcher, warden, professor, raider)."*

## The defect, restated in one line

`compareTargets` orders candidate nodes by `remainingCost`, then `nodeId`. **Target selection is not
a utility score and is shaped by none of §7's four things.** Goal selection already is one
(`autonomy/terms.ts`, six terms, all four inputs); target selection was never given the same
treatment, and target selection is what decides *which magic a universe ends up holding*.

## The fact that makes the defect total, measured before writing any code

In the v1 content set `researchCost` is a **pure function of tier**: 2048, 4096, 8192, 16384, 32768
for tiers 1–5, with **no within-tier variation at all** (12/13/13/11/2 nodes). So
`compareTargets` is not merely "cost first" — inside v1 it is exactly **tier, then node id**, one
fixed total order shared by every mage of every species in every universe. That is the whole of
W15's prefix fidelity 0.943, and it is why species change only the stopping point.

It also tells us which new terms can and cannot break the queue:

- A term proportional to **tier** (curiosity appetite, age, ambition, caution) can *reverse* or
  *bend* the ordering and can create an interior optimum, but on its own it yields another total
  order over tiers. Necessary, not sufficient.
- A term keyed on **which cell/form a node is in** (species `affinities`) or on **what a node
  does** (its authored `effects` primitives) is *orthogonal to tier* and is the thing that actually
  reorders. **These two are the load-bearing terms.**

The v1 primitive histogram over the 51 nodes is rich enough to carry a role term:
`direct-damage` 11, `research-rate` 7, `area-denial` 6, `concealment` 5, `teach-rate` 5,
`resource-yield` 5, `build-rate` 5, `knowledge-steal` 4, `scribe-rate` 4, `ward` 3, `blink` 2,
`portal` 2, `worship-yield` 2, `summon` 2. Every v1 node has at least one effect.

## The score

`targetAppeal(goal, target, outlook, weights) -> Fixed`, six additive terms, each bounded on its own
axis, **one clamp after summation** — the same shape as `scoring.ts`, for the same stated reason
(additive terms are individually ablatable; a product cannot be interrogated).

| term | what it reads | vision sentence it traces to |
|---|---|---|
| `effort` | `-remainingCost / divisor` | §5 *"**Research** — a mage derives a new node from prerequisites they hold. **Slow.**"* — the incumbent cost order, demoted from *the* order to one term among six |
| `affinity` | species `affinities`, cell key then form key | §6 *"Tuned on: lifespan, curiosity …, and **technique/form affinities**."* |
| `species` | `(species.curiosity − fp1)/d × tier` | §6 *"**curiosity** (rate of self-directed research)"*; §6 table *"Gnome … Highest curiosity"* / *"Draconic … Barely curious"* |
| `age` | age-band weight × tier | §7 *"utility-scored goals shaped by species, **age**, personality"* |
| `personality` | `(ambition − fp1)/d × tier − (caution − fp1)/d × tier` | §7 *"…species, age, **personality**…"* |
| `role` | Σ over the node's authored effect primitives of `roleAppeal[role][primitive]` | §7 *"and their assigned standing **role** (researcher, warden, professor, raider)"* |

**Tie-break: `compareTargets` — `remainingCost`, then `nodeId`. `nodeId` remains the final
tie-break, so the order is total and no draw is taken.** No RNG is added anywhere, so no stream
moves and no balance baseline can rot from a re-roll.

## Questions raised rather than answered

- [ ] **Q1.** The loader accepts an affinity key that is a **form id or a cell id**
      (`load.ts:938`), but vision §6 says *"technique/form affinities"* — a **technique** key is
      illegal today. Not extended here; nothing in the score needs it. Raised for the spec owner.
- [ ] **Q2.** `gatherFrontier` truncates each bucket at `MAX_CANDIDATE_TARGETS = 16` **in cost
      order**, before any value is computed. If the frontier exceeds 16, value can only reorder
      inside a cost-ordered window. Left alone (it is a documented cost device), but frontier
      length is instrumented in the sweep so the report can say whether it binds.
- [ ] **Q3.** Human and gnome declare **no affinity in any v1 form** (human `{}`, gnome
      `imaginem`/`vim`, neither v1). Their split therefore has to come from the curiosity term, not
      from affinities. **No affinity was authored into `species.json` to make the measurement
      pass** — that would be tuning the instrument.

## Tasks

### 1. Instrument and baseline

- [x] 1.1 Read W15's measurement, the vision §§5–7, `contracts.md` §2.3, `CLAUDE.md`.
- [x] 1.2 Establish that v1 `researchCost` is a pure function of tier.
- [ ] 1.3 Merge `origin/w15/strategy-dimensionality` for `foundingSpeciesMask`, the inert probe and
      `tools/w15/{run-arm,composition,analyse}.mjs`. **Reuse, do not rebuild.**
- [ ] 1.4 Record the "before" numbers on this branch with this tooling.

### 2. Content — every weight authored, none hardcoded

- [ ] 2.1 `packages/content/data/autonomy-weight.json`: scalar weights and the role × primitive
      appeal table, each with a `gloss` and `tuningStatus: "untuned"`.
- [ ] 2.2 Schema + `checkAutonomyWeights`: role must be one of the four, primitive must exist in
      `primitive.json`, ids unique, the required scalar set present in both directions, and the
      **bound invariant** — the role bound is strictly below the sum of the other five bounds, so a
      role can never outvote everything else. The §7 pillar as arithmetic, checked at load.
- [ ] 2.3 Register the file, intern it, expose `autonomyWeight(id)` and the role table on the
      registry.

### 3. Rules — the score

- [ ] 3.1 `KnowledgeTarget` gains `cellId`, `formId` and the node's effect `primitives`.
- [ ] 3.2 `MageOutlook` gains the species affinity table resolved to interned ids.
- [ ] 3.3 `autonomy/target-appeal.ts`: `readTargetAppeal(source)` (the `rules-raid/tuning.ts`
      pattern), the six term functions, `targetAppeal`, per-term bounds, one clamp, ablation.
- [ ] 3.4 `chooseTarget` becomes an argmax over `targetAppeal` with `compareTargets` as tie-break.
- [ ] 3.5 Thread the weights through `SelectionInput` / `AutonomyTickInput` / coordination /
      scenario.

### 4. Tests, written first

- [ ] 4.1 Two mages identical but for **role** choose different targets from one candidate list.
- [ ] 4.2 Two species differing only in **affinity** choose different targets.
- [ ] 4.3 Gnome and human, same depth ceiling, order the same list differently (curiosity term).
- [ ] 4.4 **Age** and **personality** each move a choice on their own (ablation).
- [ ] 4.5 The order is total and deterministic: equal appeal falls to cost then `nodeId`; no RNG
      draw is taken in target selection.
- [ ] 4.6 The loader rejects an unknown role, an unknown primitive, and a role bound that would let
      a role dominate.

### 5. Measure, and report the number whether or not it holds

- [ ] 5.1 Re-run the 2400-tick eight-strategy sweep after the change.
- [ ] 5.2 Prefix fidelity — target **< 0.7**, was 0.943.
- [ ] 5.3 Effective dimensionality — target **≥ 2 components for 80%**, was 1.
- [ ] 5.4 Cross-strategy containment — target **< 1.000**, was 1.000 everywhere in v1.
- [ ] 5.5 Gnome vs human node sets — target **not identical**, were identical (49 = 49).
- [ ] 5.6 Frontier-length instrumentation, to answer Q2 and to tell "the selector is still flat"
      apart from "the window was already truncated".

### 6. Gate

- [ ] 6.1 `npm run verify`. **A failing golden fixture is a STOP-and-report, never a regen.**
- [ ] 6.2 Balance baselines: they will move. Regenerate only with a written rationale naming what
      moved and why the new numbers are right.
