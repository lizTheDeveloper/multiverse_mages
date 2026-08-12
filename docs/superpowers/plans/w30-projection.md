<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W30 — The hard-SF projection of the magic rules

**Goal.** Write `docs/design/magic-projection.md`: a hard-science-fiction extrapolation of what a
universe *becomes* when it permits each technique and each form, pushed three and four consequences
deep, with every chain landing on a named primitive, a species or territory field, or a metric the
harness already collects. The deliverable that matters is **the commitment table** — nineteen rows,
one per primary switch, stating what permitting that switch costs a civilization *beyond favor*.
That table is the design argument for why permit-everything should be a bad idea rather than the
dominant strategy, which is what `integration-round-2-results.md` measured it to be: `permit-then-idle`
ascends 40/40 while `permissive-breadth`, which also funds and blesses and encourages, manages 38/40.

**Not in scope.** Any code. `packages/` is untouched — several agents are live there and this
workstream produces a design document only. Also out of scope: retuning favor prices (the 1.51%
arithmetic is a symptom, not the disease), the OpenSpec proposal that would implement any of this,
and the raid layer beyond what the portal rule forces.

## Decisions taken, with the section each traces to

- **Two marks, applied mechanically.** `[V §n]` for anything already stated in `vision.md`,
  `contracts.md`, `invariants.md` or `sound-design.md`; `[P]` for a projection. The brief requires
  that the author be able to accept or reject each projection independently, and that is only
  possible if the grounded and the invented are visibly separated on every line.
- **Every chain terminates on something that exists.** A named primitive from `primitive.json`, a
  field of `species.json` or `territory.json`, or a metric in `metric-constants.md`'s registry.
  `strategy-dimensionality.md` is the precedent: the projections that changed the game there were
  the ones that named `compareTargets` and its cost-only ordering.
- **The cost of a permit is paid in mage behaviour and populace composition, not favor.** Vision §7
  fixes that the god never commands a mage; §4 fixes that permitting only widens the legal set.
  What a permit can therefore *afford* to change is what mages want and what the populace is made
  of — the option set the six-term utility in `autonomy-weight.json` scores over, and the roles the
  non-magical majority in §6a occupies. A commitment cost expressed anywhere else would be the god
  issuing an order by another name.
- **`store` is the axis that already discriminates.** `tradition-sweep.md`: *"the split runs
  between `store` hooks rather than `acquire` hooks."* Art of Memory is the only tradition that
  produces a different game, and it does so by changing where knowledge can live. The projection
  therefore weights the forms that touch knowledge location — Mentem, Nomen, Limen — over the forms
  that only touch combat.
- **[V §7a] No coordinates at world scale.** Terram, Herbam and Limen projections land on
  `territory.landUnits`, `capacityPerLandUnit`, materials and `build-rate`. Counts, never places.
- **[V §4a] Four hooks, no fifth.** No projection may require a tradition hook beyond acquire,
  store, cast and cost.
- **[V §3 / INV-21] A raid in progress is frozen policy.** A commitment cost that bites during a
  raid must be pre-existing state carried into the raid, never a rule evaluated inside it.
- **[INV-12] `permits()` stays the sole legality check.** Nothing proposed here may add a second
  gate on whether a spell is legal. Commitment costs are consequences of a permit, not extra
  conditions on it.

## Steps

### 1. Reading and grounding

- [x] 1.1 `docs/design/vision.md` in full
- [x] 1.2 `docs/design/sound-design.md` §4.1–4.3 — the envelope/material decomposition, and the
      seven worked cells
- [x] 1.3 `docs/design/campaign-plan.md` on `origin/pm/campaign-plan` — the negative control and
      the 98,304 / 6,531,264 arithmetic
- [x] 1.4 `packages/content/data/{primitive,species,territory}.json` — the caps are the physics
- [x] 1.5 `hard-magic.md`, `invariants.md`, `probable-strategies.md`,
      `integration-round-2-results.md`, `strategy-dimensionality.md`, `metric-constants.md`,
      `tradition-sweep.md`, `value-sensitive-acquirer.md`
- [x] 1.6 Audit of what permitting mechanically does today, and of which primitives are node-driven

### 2. `docs/design/magic-projection.md`

- [x] 2.1 §1 — why permitting is currently a purchase, and what a commitment would be instead
- [x] 2.2 §2 — the five techniques, three to four consequences deep each
- [x] 2.3 §3 — the eight weight-bearing forms: Corpus, Mentem, Nomen, Limen deep; Terram, Herbam,
      Animal, Ignem tighter
- [x] 2.4 §4 — the emergent pairs, at least six *(eight)*
- [x] 2.5 §5 — **the commitment table**, nineteen rows
- [x] 2.6 §6 — five mechanics, each with its primitive and its measurement, each stating whether
      that measurement exists today, and each stating whether it fits the shipped v1 subset
- [x] 2.7 §7 — contradictions against what is already built, recorded verbatim *(seven)*
- [x] 2.8 §8 — what this does not answer

### 3. Gate

- [x] 3.1 Every one of the sixteen primitive IDs appears in a load-bearing position
- [x] 3.2 Nineteen commitment rows; no row whose cost is only favor
- [x] 3.3 Every new claim carries `[P]`; every cited one carries its section
- [x] 3.4 At least one contradiction against the built tree recorded — §7.1 is the headline, and it
      needs none of the projections accepted to be worth fixing
- [x] 3.5 `git diff --stat origin/integration/campaign-round-2 -- packages/` is empty
- [ ] 3.6 Push `w30/magic-projection`

## What the audit changed about the plan

Three findings arrived after the plan was written and reshaped the document:

- **The v1 subset is `{Intellego, Perdo, Rego} × {Mentem, Terram, Limen, Nomen}`** — a strict
  rectangle of twelve cells holding 51 of the grid's 300 nodes. **Creo, Muto and Corpus are all
  dark**, which means the brief's own headline case is entirely outside the shipped game. §1.5 was
  added to say so, and every mechanic in §6 now carries a *Subset* line.
- **Only one of sixteen primitives is node-driven at runtime, and it is the one that bypasses
  `permits()`.** `gatherEffects` has no non-test caller; `worship-yield` reaches the simulation by
  a separate path that never asks whether the cell is permitted. §7.5.
- **Permitting is exempt from the only two mechanisms that charge an axis flip** — the worship shock
  and the decay-floor removal — while the content loader enforces that permitting and forbidding
  cost *identical favor*, citing vision pillar 1's symmetry. §1.2 and §7.1.

**No `npm run verify` gate on this workstream, and no `goldens:regen` under any circumstances** —
nothing here changes behaviour, and a workstream that touches no code should not be able to move a
fixture.
