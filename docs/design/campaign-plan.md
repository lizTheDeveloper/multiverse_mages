<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Campaign: make the game have strategies

**Goal.** Understand and articulate the probable strategies, and balance the game automatically so
the demo strategy set has enough variety that a human would enjoy playing it.

**Positioning, in the author's words:** *School Battle Tycoon With Multiversal Magic Systems* —
global knowledge management, the preservation of rare skills, and the production of talent.

**The rule for every workstream:** each mechanic implemented must be traceable to `vision.md` or
`contracts.md`. `CLAUDE.md` is explicit that work not traceable to the vision is scope creep.
Magnitudes the spec leaves open go into validated content data as `tuningStatus: "untuned"`.
**Where the spec is silent on a *rule*, stop and ask — do not invent one.**

---

## The diagnosis, measured

Around forty Monte Carlo sweeps produced one causal chain. Each link is measured, not argued.

    contracts §1.1 puts one universe per simulation instance
      -> nothing ever supplies candidates.ts's `portalTargets`
      -> `openPortal` has zero candidates and is permanently masked
      -> NO RAIDS EVER HAPPEN  (rules-raid is 4,525 lines across 16 files, never invoked)
      -> no external knowledge loss
      -> ~2900 instances over 51 nodes = ~55 copies each; nothing is ever the last copy
      -> libraryDependence sits at 0; redundancy is free and worthless
      -> every species trait about retention, scribing and rediscovery is inert
      -> the archivist makes 4096 grimoires against passive's 1156 and ends on the SAME 51 nodes
    and, separately, from the same missing pressure:
      -> waiting costs nothing
      -> a bot that plays nothing and presses buttons at random wins 100% of runs
      -> ascensionRate 0.79 against §7's band of 0.05-0.20

**The binding constraint on what a universe knows is the ruleset, not the economy.** Passive and
archivist both plateau at 51 nodes; `permissive-breadth`, which only permits more cells, reaches 217.
Everything else merely makes copies.

That is why the game has one axis of play, and why no setting of the ascension constants fixes it:
a 24-cell scan under common random numbers found **zero cells** in band, **zero** with a positive
exploit margin, and the idle probe winning **100% of runs in every cell**.

---

## Board

| WS | What | Owner | State |
|---|---|---|---|
| W1 | Ascension stance + 2400-tick gate | opus | **done**, in PR #16 |
| W2 | Discriminating-ascension proposal | opus | **done**, proposal only |
| W3 | Ascension-routes proposal | opus | **done**, proposal only |
| W4 | Reward functions + `metricDeltas` design | lead | **done**, branch `w4/reward-functions` |
| W5 | Axis off-by-one + `terminalReason` in record | opus | **done**, in PR #16 |
| — | Balance tuner (CRN, hard constraints) | lead | **done**, in PR #16 |
| W6 | Positive-achievement ascension predicates | opus | in flight |
| W7 | §6a library-depth → research-rate loop | opus | in flight |
| W8 | Make raids actually engage | opus | in flight |

Each in-flight workstream owns a checkable plan on its own branch under `docs/superpowers/plans/`.
Opus leads may delegate reading and tracing to Sonnet subagents; design decisions and final
measurement stay with the lead.

---

## Definition of done for the campaign

Not "implemented and tests pass". The campaign is done when all of these are **measured and
reported with numbers**, on the 2400-tick eight-strategy sweep at n >= 96:

- [ ] **D1** `ascensionRate` inside **0.05–0.20** (`contracts.md` §7, vision §8a *"reachable but not routine"*)
- [ ] **D2** Exploit margin **positive**: the pool out-wins `uniform-random-legal` by >= 0.05
- [ ] **D3** At least **three** strategies win at materially different rates, none above 60% of wins
- [ ] **D4** Correlation between per-strategy ascension rate and mean nodes known is **positive**
- [ ] **D5** `libraryDependence` leaves zero — knowledge can actually be lost
- [ ] **D6** No strategy wins at the passive knowledge baseline
- [ ] **D7** Varying the founding species mix changes which strategy wins
- [ ] **D8** `npm run verify` green, with every baseline movement justified in writing and **no golden fixture regenerated**

D5, D6 and D7 are the ones that say the *game* changed rather than the numbers. D7 is the strongest
single test that the species table has become load-bearing.

---

## Workstreams, with acceptance tests

### W6 — the two ascension predicates require positive achievement

Traceable to **§8a**: *"a summit reached — the deepest node of a cell, or a civilization that has
held its knowledge intact across enough eras"*. The defect is that *"held its knowledge intact"* is
currently satisfied by a universe that never had knowledge to hold.

- [ ] Path A gates on something the god's play creates. Measured input: `advanceConstruction` has
      **no caller anywhere in the tree**, and `fundUniversity` advances build progress by its own
      path — so completed universities exist only if the god funds them.
- [ ] Path B requires holding something real across eras, not merely not losing it.
- [ ] Thresholds anchored to the **passive baseline** (`knownNodes >= passive * K`), never to a
      strategy — the archivist's current summit *is* the passive baseline, so calibrating to it
      reproduces the defect exactly.
- [ ] Constants added with `gloss` and `tuningStatus: "untuned"`; loader invariants asserted.
- [ ] Report which thresholds need recalibrating once W7 and W8 land.
- **Acceptance:** D1–D4 reported with numbers, or the binding one named with evidence.

### W7 — the knowledge-capital loop

Traceable to **§6a**: *"a university's output scales with the depth of its library… knowledge is an
input to producing more knowledge… That is a compounding loop… the balance harness must watch it
specifically."*

- [ ] Library depth feeds research rate. Today `libraryDepth` is read only by `outlook.ts`'s
      placeholder `universityPreference` and affects no rate.
- [ ] The effect appears in **nodes known**, not only in instance counts — a loop that makes more
      copies of the same 51 nodes reproduces the archivist's exact non-result.
- [ ] `capitalSnowball` measures something real; report before and after. Its checkpoints are
      currently byte-identical because `libraryNodeCount` is 1 and never moves.
- [ ] Audit and report which §5/§6a/§7 mechanics are real, stubbed or absent. Do **not** implement
      them all. Known-present: mortality, teaching, scribing-consumes-materials.
- **Acceptance:** `archivist` separates from `passive-control` on nodes known by > 3 SE, and
  `referenceLibraryDepth` leaves 1.00.

### W8 — raids actually engage

Traceable to **§3** (The Portal Rule), **§8** (Raids), **§8a**. The engine exists and is unreachable.

- [ ] Something supplies `portalTargets`; `openPortal` gains candidates.
- [ ] State plainly how a raid is arbitrated within §1.1's one-universe-per-instance rule, following
      `arbitration.ts` and `portal.ts` rather than inventing a second answer. If §1.1 blocks the
      intended design, say so and propose the smallest unblocking change.
- [ ] `raidEngagement` flips to true only when honestly true.
- [ ] The four raid-dependent §7 metrics stop reporting `mechanic-absent`.
- [ ] PRNG streams audited: a raid draw must not re-roll another subsystem, or every committed
      baseline silently rots.
- **Acceptance:** `libraryDependence` leaves zero, per-strategy spread in nodes known widens, and
  `portal-rush` separates from `passive-control` by > 3 SE on at least one §7 metric.

---

## Open questions for the author — not for agents to answer

These are design decisions the spec does not settle. Agents have been told to raise rather than
invent, and these are the ones already known:

- [ ] **How much faster should raiding make you ascend?** The author's intent: *"there should be
      enough of a bonus to raiding that you ascend much faster"*, and *"if there are many universes
      they shouldn't survive to ascension, because someone should raid them."* §8 does not price it.
- [ ] **Is 55 copies per node a magnitude problem or a structural one?** Whether the loss channel is
      fixed by faster decay, fewer mages, or only by raids burning things.
- [ ] **Does `ascension-canon-breadth` lock out the archivist?** W2 proposes 96 nodes; the archivist
      measures 50.9. Unresolved between two proposals, and deliberately not settled until W7 lands.

---

## Standing constraints

- **Never run `npm run goldens:regen`.** Golden fixtures are determinism claims, categorically
  different from balance baselines. A failing golden test is a finding to report.
- Balance baselines may be regenerated via `regenerate-baseline.mjs` **with a written rationale**
  naming the constants that changed and the measured deltas.
- Determinism: no `Math.random`, no `Date.now`, no floats in the rules path. Fixed point at 1/1024.
- Randomness stream-split per subsystem.
- Content in validated data files, never hardcoded.
- Every claim reported with its number, and a negative result reported plainly. An engineered
  success is worth less than an honest failure.
