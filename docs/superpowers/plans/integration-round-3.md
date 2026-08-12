<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Integration round 3 — measure six workstreams under a repaired instrument

**Branch:** `integration/campaign-round-3`, from `origin/integration/campaign-round-2` at `0b54c84`.

## Why this exists

Round 2 measured eight workstreams together and produced the campaign's sharpest negative result:
**`permit-then-idle` wins 40/40** — a bot that presses two permit buttons for 140 of 2,400 ticks and
then submits an empty preference list forever beats the strategy that funds universities, blesses
mages and encourages research.

Round 3 differs from round 2 in one structural way. **W18 repairs the measurement instrument
itself.** Every number round 2 reported was taken with a scorer that (a) calibrated on a
six-strategy pool, (b) computed an exploit margin algebraically identical to `ascensionRate`, and
(c) scored a known-broken system as healthy on both correlation coefficients. W18 merges **first**,
and every number in this round is taken with the repaired scorer.

**The consequence, stated before any measurement is taken:** figures carried forward from other
branches were measured with the old scorer and do not survive. They are re-measured here, not
copied.

## The ancestry fact

All eight candidate branches share merge-base `0b54c84` — round-2's HEAD — **exactly**. There is no
drift between them and no branch contains another. The fan is clean, and anything not merged this
round merges onto round 3 without extra rebase cost.

## W20 and W23 — available, deliberately not merged

The brief recorded both as "not on the remote". **That is stale — both are pushed**:

| branch | head | scope |
|---|---|---|
| `w20/compositional-content` | `44a894f` | 93 files, +13,696 / −1,167 |
| `w23/populace-and-record` | `aa11835` | 23 files, +2,952 / −113 |

They are still **not merged this round**, for reasons that are not about availability:

1. The brief's measurement design — the ten-strategy pool, the known-interactions list, the
   D1–D9 framing — was drawn for six branches and plans explicitly for these two landing *after*.
2. W20 is a **content** change of a size that moves `contentRevision` again and interacts with
   every branch in this round. Folding it in turns a six-merge round into a different campaign
   round. That is the coordinator's call, not the integrator's.
3. W20's own final commit is titled *"claim 0 is a negative result"*. It has not been vetted for
   integration.

**What will need re-measuring when they land** is recorded in the closing report.

**One hazard for whoever merges W23:** W23's diff already contains `tools/w22/census-report.mjs`.
It was built on top of W22's work, so after this round merges W22, part of W23 is redundant and
will conflict. Take W22's copy.

## Merge order

| # | branch | what it carries | behaviour? |
|---|---|---|---|
| 1 | `w18/instrument-repair` | control-gated scoring — **the instrument** | scorer only |
| 2 | `w22/knowledge-observability` | per-node location-aware census, outside the observation vector | no (claimed inert) |
| 3 | `w19/horizon-sweep` | horizon tooling and findings, one additive `--sample` flag | no |
| 4 | `w24/university-siting` | universities gain a territory link; `WORLD_SCHEMA_VERSION` revision | **yes** |
| 5 | `w21/timing-and-envelopes` | technique cost curves over research progress + timing surcharge | **yes** |
| 6 | `w25/spec-refresh` | vision and contracts brought up to date | docs, but **parsed by tests** |

`npm run verify` after **each** merge, per-stage results recorded — never "chain green".

## Checks bound to specific merges

- **After #2 (W22) and again after #4 (W24):** `OBSERVATION_LAYOUT_DIGEST` unmoved,
  `WORLD_SCHEMA_VERSION` revised, **`SNAPSHOT_VERSION` untouched**. `CLAUDE.md` distinguishes them:
  a snapshot version is a determinism/replay claim, a world schema version is a state-shape claim.
- **After #5 (W21):** the branch's `packages/sim-core` **zero-diff** claim must survive the merge.
  `git diff origin/integration/campaign-round-2...HEAD -- packages/sim-core` stays empty.
- **After #6 (W25):** run the doc-parsing tests specifically — `horizon-gate.test.ts` reads CI
  config, and a metrics conformance test parses `contracts.md`. A failure there can be caused by
  an *earlier* branch's doc edits, which is an interaction finding, not a W25 defect.
- **W21 × W24 both affect acquisition timing** — cost curves and territory-dependent capacity —
  and have never been measured together. This is the interaction to watch in the final sweep.

## Standing rules

- **Never `npm run goldens:regen`.** A golden fixture changing is a determinism finding: **STOP**,
  report the diff, do not resolve it.
- **A balance-gate failure is not a golden failure.** From the first behavioural merge onward the
  three `balance:gate*` stages are *expected* to fail, because the gate refuses cross-build
  comparison once `contentRevision` moves. The gate's printed metric deltas **are** the "what
  moved" record.
- **Baselines regenerated exactly once, at the end**, with a **single written rationale** naming
  every mechanism and its measured delta. `contentRevision` has moved at W6, W8, W17 and a gloss
  audit; expect baselines invalid by provenance, not by movement.
- **`git add -A` is unsafe.** A concurrent tuner rewrites `packages/content/data/god-constant.json`
  and a stray `add -A` has committed a trial value once (`975e177`, reverted in `41d40be`). Stage
  explicit paths.
- If `package-lock.json` conflicts: `npm install`, commit the result. It auto-merges wrongly.
- `npm run verify` may fail spuriously under load with `Timeout calling "onTaskUpdate"` **after**
  all tests pass — root-caused to `reference-long-run.test.ts` blocking a worker ~146 s past
  vitest's RPC budget. Re-run stages individually and report per stage. **Never raise a timeout to
  make a chain green.**

## The final measurement

Pinned here so it cannot drift:

- 2400 ticks, **n ≥ 400**
- the **full ten-strategy pool including both adversarial probes** — `permit-then-idle` and
  `idle-then-declare`
- `replicates` a **multiple of the pool size** (W18 refuses non-divisible, it does not warn)
- **coverage asserted in the output**
- distributed sweep path where available (1096 runs in ~85 s, byte-identical to local)

Report order, fixed in advance:

1. **`permit-then-idle`'s win rate first.** It is the negative control and it is the headline.
2. D1–D9, each marked **failed** or **saturated** — they are different findings and only one of
   them is about the game.
3. **Spearman beside Pearson with the non-zero winner count.**
4. The plain statement that **D2 carries no information while the probe loses.**

## Checklist

- [ ] Plan committed and pushed
- [ ] Baseline `npm run verify` on the un-merged base, per stage
- [ ] Merge 1 — `w18/instrument-repair`, verify, record, push
- [ ] Merge 2 — `w22/knowledge-observability`, verify, record, push
- [ ] Merge 3 — `w19/horizon-sweep`, verify, record, push
- [ ] Merge 4 — `w24/university-siting`, verify, record, push
- [ ] Merge 5 — `w21/timing-and-envelopes`, verify, record, push
- [ ] Merge 6 — `w25/spec-refresh`, verify, record, push
- [ ] Golden fixtures: checked at every merge
- [ ] Baselines regenerated once, with the single rationale
- [ ] The 2400-tick sweep at n ≥ 400, ten strategies, coverage asserted
- [ ] D1–D9 reported with real numbers, each `failed` or `saturated`

## Record — what moved after each merge

*Filled in as the round proceeds. Nothing is written here that has not been run.*
