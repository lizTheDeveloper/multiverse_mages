## Why

The win condition does not measure play. `docs/superpowers/specs/2026-08-11-ascension-meta-findings.md`
F1 records that `uniform-random-legal` ascends 10 of 10 runs at 2400 ticks while every deliberate
strategy ascends 0 of 10, and that `passive-control` — a bot that submits nothing but no-ops —
reaches the same 51-node state the winner ascends from. Two causes were separated there. The
harness artifact is W1's; this change is the other one: **eligibility accrues whether or not the god
acts, so the optimal policy is "idle until eligible, then press one button."**

That is measured here rather than assumed, by driving the reference universe directly with scripted
god policies (`design.md` carries the tables and how they were taken):

- **Path A opens passively at world tick 709.** Worship reaches tier 4 with zero god actions and
  asymptotes at fp 4,636 by tick 2400.
- **Path B opens passively at world tick 1080, and keeps opening.** The passive universe passes
  every era boundary — `libraryDependence` measures **0%** from tick 360 onward and it loses **0**
  nodes per era — so `goodEraRun` reaches **9** against the 4 the path requires.
- **An active civilization fails Path B.** A god that permits axes, funds universities and blesses
  mages holds 174 nodes at tick 2400 and its `goodEraRun` is **0**: at the era boundary near tick
  960 it had lost 7 nodes against `ascension-loss-max = 2`, while its `libraryDependence` was 12%
  and passing.

Path B, as authored, therefore **rewards inertia and punishes scale** — the sign is inverted, not
merely weak. Until eligibility moves with play, `mm_gym.rewards.sparse_terminal` is maximised by
idling, a trained policy learns nothing about magic, and release-plan 0.12.0 — *"the machine meta
found"* — cannot be claimed.

## What Changes

- **Path A: turn the first authored knob, and only that knob.** `ascension-tier-gate` moves from
  **4** to **5**. This is the knob `god-constant.json` already names *"the first knob turned when
  ascensionRate leaves its 5–20% band"*, and it discriminates for a reason the data shows: the
  university worship class is the only class the god moves — the world loop founds no universities
  and `advanceConstruction` has no caller outside the god's `fundUniversity` — so tier 5 is
  unreachable without a sustained building programme and reachable with one. Measured: passive
  worship asymptotes at fp 4,636 (tier 4); a god founding one university every 40 ticks reaches fp
  8,503 and crosses tier 5 between ticks 1800 and 2400.
- **Path B: a rule change, because no authored knob can invert a sign.** A passing era boundary
  gains one conjunct and one of its existing conjuncts is made scale-relative:
  - the universe must hold at least `ascension-canon-breadth` nodes at the boundary (**new**, 96 —
    the passive baseline is 51 and flat from tick 840; breadth-playing policies reach 174–182);
  - the loss allowance becomes `max(ascension-loss-max, nodesKnown × ascension-loss-fraction)`
    (**new** fraction, fp 51 ≈ 5%), so a 51-node canon still gets the authored allowance of 2 and a
    174-node canon gets 8. An absolute cap over a quantity that scales measures size, not
    custodianship.
- **Price the declaration.** `declare-ascension` moves from **0** to **fp 20,480**, with a loader
  invariant pinning it at or below `favor-cap-base` so that a universe which qualifies can always
  eventually pay. The proposal is explicit that this is **not** the discriminator (see below) — it
  exists so that stopping trades against playing.
- **Add a balance gate for the property the band cannot see.** `ascensionRate` inside 5–20% is
  compatible with the failure this change exists to fix: today the aggregate is 0.125 and *inside*
  the band while one strategy wins 10/10. A second gate asserts that the rate **correlates with
  play**, per-strategy, on W1's long-horizon sweep.
- **Say where the new knobs sit in the retune order.** The authored order —
  `ascension-tier-gate`, then `ascension-era-count`, then `ascension-dependence-max` — is
  **unchanged** and remains the response to a band violation. `ascension-canon-breadth` and
  `ascension-loss-fraction` are *shape* constants, turned only when the correlation gate fails, and
  never as a first response to the rate leaving its band.

Pricing is deliberately not claimed as the fix, and the measurement says why: **every policy probed
sits at its favor cap for most of the run.** The passive god discards fp 9,530,689 of regeneration
over 2400 ticks; the moderate builder discards fp 12,353,708. A flat favor price is therefore
cheapest for exactly the strategy this change exists to exclude. It buys about five to seven ticks
of banked regeneration, which is an opportunity cost (ten blessings, two university foundings) and
not a gate.

## Capabilities

### Modified Capabilities

- `ascension-and-prestige` (owned by `god-agency`, in flight): Path A's tier gate, Path B's era
  test, and the balance-gate requirement that tunes them.
- `favor-economy` (owned by `god-agency`, in flight): the declaration price and the invariant that
  bounds it.

### New Capabilities

None. Everything here amends a capability `god-agency` already defines, which is also why the delta
specs restate the full requirement text they replace rather than patching a clause.

## Impact

- **Content:** `packages/content/data/god-constant.json` (`ascension-tier-gate` 4 → 5; new
  `ascension-canon-breadth` and `ascension-loss-fraction`), `packages/content/data/god-cost.json`
  (`declare-ascension` 0 → 20480), `packages/content/src/god.ts` (`REQUIRED_GOD_CONSTANTS` is
  checked in both directions, so the two new ids must be added there, plus the price invariant).
- **Rules:** `packages/coordination/src/god/ascension.ts` and the era-boundary block of
  `system.ts` — the `passed` predicate gains the breadth conjunct and the scaled loss allowance;
  `constants.ts` gains two fields. Integer and fixed-point throughout: the allowance is
  `floorDiv(nodesKnown × fraction, fp(1024))`, and no float enters the rules path.
- **`contentRevision` moves.** That is a compatibility break for every universe and is deliberate.
- **Golden fixtures are *not* regenerated.** If a fixture's simulated result changes, that is a
  finding to escalate — a fixture whose action log declares ascension or reaches an era boundary
  would move — and this campaign has no authority to regenerate them. Balance baselines may be
  regenerated, via `packages/mc-harness/bin/regenerate-baseline.mjs` only, stating the constants
  that changed and the measured deltas.
- **Depends on W1** (`w1/ascension-stance`): explicit per-strategy ascension stances and the
  2400-tick instrument with its own committed baseline. Both claims below are unmeasurable without
  it — the committed 60- and 240-tick gates are structurally blind to the win condition (F2).
- **Blocks W3** (a summit per playstyle). W3 adds routes; adding routes to an instrument that
  cannot separate strategies would be untestable, and this change is what makes it testable.
- **Reported against vision §8a:** two places the measured build and the vision of record disagree
  are recorded in `design.md` rather than resolved silently — §8a's *"reachable but not routine"*
  is a statement about an aggregate that can conceal a strategy for which it is routine, and §8a's
  second summit (*"held its knowledge intact across enough eras"*) currently describes the null
  hypothesis.
- **Risk accepted:** `ascension-tier-gate = 5` is the ceiling of `worship-tier-count`, so Path A's
  first knob is spent by this change. Any later tightening of Path A must be a new conjunct, and
  the named successor is the institutional one this proposal rejects as redundant today
  (`design.md`, alternative 3).
