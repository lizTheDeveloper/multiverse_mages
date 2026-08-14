<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W134 — Why the dwarven shelf collapsed, measured

**Dated 2026-08-14.** Every number below is a statement about two refs and nothing else:

- **before** — `e2a15cf` (`93b9068^`, on `main`), the tree immediately preceding
  `feat(autonomy): give completeAffiliation a production caller`.
- **after** — `b02e115`, the head of `w116/complete-affiliation` (PR #134) at the time of
  measurement.

**Instrument:** `tools/w134/upkeep.mjs`, 7 arms × 20 replicates, ten strategies round-robin, world
tick cap 2400 (200 world years), W116's `sweepId` and `rootSeed` so the arms are the same universes
and the two files are a paired comparison. The probe reads
`defineWorldSimulation().lastReport()` — no rules-path change, no new draw, no new stream. Raw
outputs were not committed; `balance/` was not touched and no baseline was moved. Movement is
reported against **`toleranceK = 3`**, the value every committed baseline uses.

**Instrument validation, three ways.** (1) The probe's final grimoire mean reproduces
`balance/results-w116-{before,after}-2400.json` to the reported decimal — all seven arms on the
before tree, six of seven on the after tree, with the `all-six` after arm still running when this
was written.
(2) The decomposition closes: `scribed − degraded = final`, exactly, on both trees
(417.1 − 174.6 = 242.5; 597.3 − 545.5 = 51.8). (3) A positive control asserts that a
200-instance library against a stock of zero owes 400 fp and loses 12 instances, and every arm
reports the first tick at which each counter fired, so a zero is readable beside a sibling that
fired rather than being a broken probe.

## The result in six lines

1. **Only one of the three reported regressions clears tolerance.** dwarf grimoires
   242.5 ± 46.1 → 51.8 ± 18.8 is **3.83 SE**. elf (−51.9, **1.12 SE**) and draconic (−12.0,
   **0.33 SE**) are not distinguishable from zero at K = 3.
2. **The cause is destruction, not a failure to write.** The rival hypothesis — the books were
   never written — predicts a *fall* in production. dwarf production **rose**, 417.1 → 597.3 books
   (2.83 SE, itself inside tolerance; the direction is what kills the hypothesis, not the
   magnitude). Destruction rose twice as far and does clear it: 174.6 → 545.5 instances,
   **4.58 SE** — the largest movement in the table.
3. **`applyLibraryUpkeep` was not newly reached.** On the *before* tree dwarf already owed upkeep
   from world tick 2, went unpayable on 118.8 ticks per run and lost 174.6 instances. What changed
   is the **rate**: unpayable ticks 118.8 → 297.0, and the first unpayable tick moved from 631 to
   270. "Newly reached" is true only for draconic and gnome (0 → 57.7 and 0 → 37.2 instances), and
   neither of those arms' outcome clears tolerance.
4. **What died was redundancy, and this is the sharpest number in the set.** Destroying 545.5
   shelved instances cost dwarf **0.95 ± 0.62 nodes** leaving the universe over the whole run —
   down from 2.75 ± 1.70 before, a movement of 1.00 SE. `nodesKnown` likewise did not move:
   46.4 → 26.9, **1.09 SE**, inside tolerance. Precisely: what the brake destroyed was copies
   redundant against knowledge still held somewhere else — `degradeLibrary` offers duplicate
   shelved copies before singles, and a single copy destroyed while a living mage still holds the
   node emits no loss event. Destroying second copies is what
   `LIBRARY_UPKEEP_PER_INSTANCE`'s docstring says brake 4 is *for*.
5. **The shelf ceiling is vellum, not `scribeAffinity`.** gnome wrote 113.0 books and kept 75.7;
   dwarf wrote 597.3 and kept 51.8. Across a 5.3× span in production the final shelf is
   uncorrelated with it — the binding constraint is vellum, not the species trait. **No arm reached
   an income-constrained floor**, so this measurement does not name one: dwarf ends with 109,301 fp
   of vellum against a 51.8-instance shelf owing ~104 fp a tick, about a thousand ticks of runway
   on a run that ended at 821.5. What the endowment funded was an overshoot; what upkeep did was
   destroy it; no equilibrium was reached before the run ended.
6. **The population premise does not hold.** dwarf living mages 9.8 ± 3.9 → 18.9 ± 16.1 is
   **0.55 SE**, and the populace point estimate *fell* (706.8 → 195.2, 1.38 SE). Neither direction
   is a movement.

## The economy underneath it

The reference universe is founded with `STARTING_MATERIALS = 1000 × FP_ONE` = **1,024,000 fp** of
vellum (`packages/scenario/src/reference-universe.ts:120`). Dwarf's *lifetime* vellum production on
the after tree is **24,170 fp** — 2.4% of the endowment. The ledger closes to the unit:

    1,024,000 (endowment) + 24,170 (produced) − 658,842 (scribed) − 280,027 (upkeep paid)
      = 109,301 (final stock)

So every book in the game is written out of the founding endowment, and then charged 2 fp per tick
forever against an income that was never sized to carry it. `firstUnpayableTick` is simply the tick
at which the endowment stops covering the shelf, and #134 — by affiliating everybody, which is what
it was for — moves that tick 2.3× earlier for the species that writes fastest.

Two arithmetic consequences worth having written down:

- `DEGRADATION_PER_SHORTFALL / LIBRARY_UPKEEP_PER_INSTANCE = 32 / 2 = 16`. A library that pays
  **nothing** loses one sixteenth of its shelf per world tick — about 54% per world year. Both
  constants are marked **Untuned** in `packages/rules-world/src/universities/`.
- Grimoires, shelved grimoires and library-located instances are the **same number** in every arm
  and both trees. No mage privately holds a book, exactly as `gateway.ts`'s scribing note says: at
  this build a book cannot be written any other way.

## What is actually wrong, named and not fixed

Nothing in `applyLibraryUpkeep`. It charges what it says it charges, in the order it documents, it
never overdraws, and it does not bank debt — which is the remedy
`docs/design/economy-flow-models.md` §6 idea 1 prescribes, already satisfied.

Two **absences upstream** of it produce the overshoot:

1. **The affordability reserve is one tick deep.** `packages/coordination/src/world-step.ts:688`
   gives scribes `max(stock.vellum − upkeepOwed, 0)`. A book costs its scribing price once and
   `LIBRARY_UPKEEP_PER_INSTANCE` per tick *for the rest of the run*, and no term anywhere in the
   loop compares the second number to income. So there is no state in which the universe declines
   to write a book it cannot keep — it writes it, pays for it, and destroys it. Measured cost for
   dwarf on the after tree: **91% of production destroyed**, and 658,842 fp of vellum spent on
   copies that did not survive. That is waste, not knowledge loss.
2. **The vellum source does not scale with the sink it feeds.** Production is linear in laborers
   (~4–14 of them); upkeep is linear in a shelf that grows with the mage population. This is
   `economy-flow-models.md` §6 idea 2 (source/sink power matching, whose stated diagnostic is
   unspent pools rather than aggregate production) and §6 idea 4 (a producer's decision rule with
   no supply-line term, `w_SL = 0`, the canonical oscillation generator). Both were written down
   before this measurement existed; this is the first run-level evidence for either.

Neither is a defect in #134, and neither was created by it. #134 made an existing overshoot
reachable sooner by removing the thing that was accidentally limiting book production — a single
affiliated founder.

## A committed test says the same thing, and it went red on this branch

`npm run verify` on `b02e115` reports 9 failed tests across 7 files. Three were re-run in isolation
on a quiet box and each **passes on `e2a15cf` and fails on `b02e115`**:

- `packages/coordination/test/unit/knowledge-capital.test.ts` — vision §6a's *"a deep library
  produces strictly more of the library output over five years than a bare shelf"*, **expected
  1025 to be greater than 1026**. Its four **brake-4** assertions all still pass: upkeep is charged
  in proportion to instances, a duplicate is charged its keep and paid nothing back, and a library
  that cannot be kept degrades rather than driving the stock negative. The brake's mechanics are
  intact; the *benefit* it was meant to be held in tension with is not.
- `packages/scenario/test/unit/species-occupancy.test.ts` — `bySpecies('dwarf').occupiedCells`
  **expected 12, got 3**, plus the spread metric (≈ 0.0729 → 0.15) and the missing-cell list
  (four ids → `[]`). The same collapse at twenty world years rather than two hundred.
- `packages/scenario/test/unit/causal-chain-build-rate.test.ts` — link 5b, **expected 184 to be
  181**.

The other four — `loss-shock-recovery`, `raid-engagement`, `reference-long-run` (9.8) and
`reference-time-to-tier` — were not contrasted against `e2a15cf` and are unverified in either
direction as of this date.

## What this measurement did not do

- It did not tune any species stat, cost, or content value, and moved no baseline.
- It did not establish *why* elf and draconic point estimates fell; at 20 replicates they are inside
  tolerance and the honest statement is "not measured", not "no effect". Resolving elf's −51.9 at
  3 SE means shrinking its standard error by 3 / 1.12 = 2.68×, so `n × 2.68² ≈ 7.2` — about **144
  replicates** against the 20 taken, roughly fifteen minutes per arm on the current harness.
- Run length is a checked non-confound rather than an assumption: dwarf runs ended at 933.4 ± 150.4
  ticks before and 821.5 ± 102.3 after (**0.62 SE**). Note that no arm runs the full 2400 — "two
  hundred world years" is a cap, not a duration.
