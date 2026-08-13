# W53 — practice: the mechanic works, and the measurement it was built for is a null

**Status: measured.** Every number below comes from `tools/w53/practice.mjs`, which is W49's
`tools/w49/applied-use.mjs` with four columns added and its arithmetic untouched. Both arms were run
on **the same tree** at the same coordinates — `SWEEP_ID w49-applied-use-v1`, `ROOT_SEED 20260811`,
the committed ascension sweep's two corner cells, four replicates, 2,400 world ticks, four
strategies, 32 runs per arm. The "before" arm is commit `780b5de` (the economy merged, the mechanic
absent) in a separate worktree; the "after" arm is this branch.

Raw output: `balance/results-w53-practice-before.json`, `balance/results-w53-practice-after.json`.

---

## The short version

**The mechanic runs.** Mages practise, mastery goes back up, and it costs them the month. That much
is not in doubt anywhere below.

**Question 1 is a null, and it is the eighth mechanic aimed at this bot.** Applied use does **not**
separate `permit-then-idle` from `permissive-breadth` at any usable confidence — not before the
change, not after it, and not on the gated column. Every one of the three comparisons is **within
one standard error of zero** over 32 runs. The point ratios moved (1.0422 → 0.9482 ungated, 2.0524
gated) and none of that movement survives its own spread.

**Worse, the gate starves its own measurement channel.** Under the tick-sharp gate, **2 of 8 runs
accrue exactly zero for every strategy that accrues at all** — `denial-warden`'s figure is 7 of 8 —
and one run carries a third of an arm's total. The quantity a mētis mechanic would accrue on is not
merely un-separating; at this gate's sharpness it is too sparse to compare gods by at all.

**Question 2 moves, weakly and consistently.** The share of held instances below the teach threshold
falls on **all four** arms, by 0.8 to 2.5 percentage points, at 1.2 to 2.1 standard errors. Real
direction, small size, and not the loop closing.

**Question 3 is a null in the unhelpful direction.** `denial-warden` remains hundreds of times
behind the god that does nothing, and the gated figure for it is 7 zeros and a 4 — a number with no
information in it.

**A null result is a full-value result. Nothing here was tuned to make a number look better**, and
the brief's instruction — *"if it does not, say so plainly and stop"* — is what the rest of this
document does.

---

## The instrument

`tools/w53/practice.mjs` reports two applied-use columns per run:

- **`appliedUseInstanceTicks`** — W49's original predicate, ungated, byte-identical arithmetic. One
  credit per (instance, tick) for an instance at a mind or palace, at or above
  `MASTERY_ACTIVATION_THRESHOLD`, whose cell is permitted, whose node carries a `target: "universe"`
  effect on `resource-yield` or `build-rate`. Kept so a number here can be set beside the record.
- **`gatedUseInstanceTicks`** — the same, plus the production gate this branch added: the instance's
  holder must be committed to `GOAL.practice` on that node.

Plus `teachableInstanceTicks` / `heldInstanceTicks` (the share `ages-of-magic.md` §2c quotes as
93.4% below threshold), `nodesTeachableTicks` / `nodesHeldTicks` (its 28-of-51), and
`practiceCompleted` off the world report.

The probe is one appended system that draws nothing and mutates nothing, exactly as W49's was.
Agreement with the production path: **0 of 50,508 ticks** had the world report come in below the
gated probe figure in the before arm, **30 of 51,468 (0.06%)** in the after arm — the residue is
W49's own documented phase-order asymmetry (the report describes the beginning of a tick, the probe
the end of it), not a predicate mismatch.

**One disclosed difference between the two arms' copies of the instrument.** Commit `780b5de` has no
`GOAL.practice` and no `readCommitment` export to import, so the before-arm copy replaces those two
imports with a stub that makes the gated column identically zero. Nothing else differs, and the
zero is reported rather than hidden: at `780b5de` no mage applies magic to anything, which is the
condition this whole workstream exists because of.

**Every comparison below is reported with its spread.** W49's record was burned once by a ratio
without one; a ratio over eight heavy-tailed counts is not a finding until its standard error says
so.

---

## Question 1 — does applied use separate `permit-then-idle` from `permissive-breadth`?

**No.** Not before the change, not after it, and not on the gated column.

The two bots declare the same permits. `permit-then-idle` is `permissive-breadth` with every
non-permit action removed: no `fundUniversity`, no `encourageResearch`, no `issueDispensation`, and
nothing at all submitted after round 140 of 2,400. It is the ablation of playing.

Applied use per run, mean ± standard error over 8 runs each:

| | before, ungated | after, ungated | after, **gated** |
|---|---|---|---|
| `permit-then-idle` | 135,353 ± 15,183 | 120,331 ± 17,531 | 945 ± 444 |
| `permissive-breadth` | 129,867 ± 23,133 | 126,899 ± 19,557 | 460 ± 200 |
| point ratio | 1.0422 | 0.9482 | 2.0524 |
| **difference, in SE** | **+0.20 SE** | **−0.25 SE** | **+0.99 SE** |

Every one of those is a coin flip. The 2.05× gated ratio is the one that looks like a result and it
is the least trustworthy number in this document: it is a ratio of two means of a count that is
**zero in 2 of 8 runs for each of the three strategies that accrue at all**, whose largest single
run (3,280) is more than three times the arm's own mean.

Here are the raw gated per-run values, sorted, because a mean of these is close to meaningless:

| strategy | the eight runs | non-zero |
|---|---|---|
| `passive-control` | 0, 0, 11, 63, 88, 138, 291, 1115 | 6/8 |
| `permit-then-idle` | 0, 0, 53, 117, 418, 1381, 2308, 3280 | 6/8 |
| `permissive-breadth` | 0, 0, 26, 126, 209, 858, 1010, 1453 | 6/8 |
| `denial-warden` | 0, 0, 0, 0, 0, 0, 0, 4 | 1/8 |

**So the honest finding is sharper than "the ratio did not move", and it is about the gate rather
than about the gods:** a tick-sharp practitioner gate does not merely fail to separate the two bots,
it removes 99%+ of the signal (see *The cost of the gate* below) and leaves a quantity too sparse to
compare anything by. The eighth mechanic aimed at `permit-then-idle` has produced nothing, and this
one produced nothing while also taking the measurement channel with it.

### What is not the explanation

The obvious suspicion — that the god's verbs never reach practice, so the null is a wiring bug — was
ruled out **before** the sweep ran, on purpose.
`packages/coordination/test/unit/practice-rate-channel.test.ts` asserts that `bless-practice-rate`
is non-zero and reaches a blessed mage, that an unblessed mage in an unencouraged cell receives
nothing, that the hook is not an alias of the research hook, and that a deep library raises the
practice multiplier through the same `(1 + Σ)` accumulator research uses. The channel is wired. A
null with that file green is a statement about the game.

### What may be the explanation, offered as a hypothesis and not as a result

Practice completions per run point one way, and the direction is worth recording even though the
applied-use comparison cannot support it:

| | practice completions/run | held instances/tick |
|---|---|---|
| `passive-control` | 15,825 | 1,416 |
| `permit-then-idle` | 9,065 | 2,220 |
| `permissive-breadth` | 8,901 | 2,290 |
| `denial-warden` | 11 | 12 |

The god that does nothing has the most practice completions and the fewest instances; the two gods
that play have roughly 60% as many completions and 60% more instances. The reading that fits is
that **every verb which makes research cheaper bids a mage away from maintenance** — a funded,
encouraged university produces scholars who are busier at the frontier — and an economy that reads
maintenance would then reward the god who leaves its scholars alone.

That is a hypothesis about goal competition, not a measured result: `passive-control` differs from
the other two in far more than its verbs, and no ablation here isolates the claim. It is written
down because it names the experiment somebody should run next — hold the ruleset fixed, vary only
`fundUniversity`, and read practice completions — and because if it is right, no tuning of the
practice constants changes the sign.

## Question 2 — does the teachable fraction move off 93.4%?

**It moves, on every arm, in the right direction, and weakly.**

Share of held instances **below** `DEFAULT_TEACH_THRESHOLD`, per-run mean ± standard error over 8
runs each:

| strategy | before | after | delta | in SE |
|---|---|---|---|---|
| `passive-control` | 91.64 ± 0.34% | 90.82 ± 0.60% | **−0.81 pts** | −1.18 SE |
| `permit-then-idle` | 87.59 ± 0.51% | 85.69 ± 1.17% | **−1.89 pts** | −1.48 SE |
| `permissive-breadth` | 87.84 ± 0.42% | 85.31 ± 1.13% | **−2.53 pts** | −2.10 SE |
| `denial-warden` | 51.50 ± 0.44% | 50.41 ± 0.45% | **−1.09 pts** | −1.72 SE |

No single arm clears three standard errors; **all four move the same way**, which on a sign test
alone is 1 in 16. Taken together this is a small real improvement rather than noise, and it is
nowhere near closing the loop.

Nodes with at least one teachable copy, averaged per tick, did **not** improve — 68.8 of 126.6 →
67.2 of 126.3 on `permissive-breadth`. Practice raises the mastery of nodes somebody already
teaches before it rescues a node nobody does, which is what stalest-*within-a-mage* ordering buys
and what a stalest-*within-the-universe* ordering would not.

Two honest caveats about the 93.4% itself. It is W26's number, taken on a different tree with a
different instrument at a different instant; **this tree's own before-value is 87.8%**, and 87.8% →
85.3% is the comparison that is actually like-for-like. And `denial-warden`'s 51% is not health — it
holds twelve instances.

Where the loop *is* visibly closed is at unit scale, and it is worth recording because it is a test
written before the mechanic existed:
`packages/coordination/test/unit/acquire-hook-in-the-loop.test.ts` asserted that a standard-tradition
universe's mastery ceiling was its placeholder `fp(256)`, *"which nothing in the loop ever raises"*.
Over twenty world years that universe now reaches **1019** and teaches **3** lessons where it
previously taught **0**. The mechanism works; at population scale over two centuries, decay
out-runs it.

The reason is arithmetic and is not hidden: `PRACTICE_MASTERY_RESTORE` is `fp(128)` per completed
project, `PRACTICE_COST_PER_TIER` is `fp(1024)` of a mage-month per tier, and a mage holds dozens of
nodes while practising one. Both constants are `Untuned` and the harness that would tune them is
0.5.0's. **This measurement is a reason to tune them, not evidence that they are wrong.**

## Question 3 — does `denial-warden` stop being anti-correlated with playing?

**No**, and the gated figure for it carries no information at all.

| | before | after, ungated | after, gated |
|---|---|---|---|
| `passive-control` use/run | 52,061 ± 4,508 | 47,990 ± 4,340 | 213 ± 133 |
| `denial-warden` use/run | 251 ± 103 | 209 ± 93 | **0.5 ± 0.5** |
| point ratio | 207.1× | 230.0× | 426.5× |

The ungated comparison is dense on both sides and says plainly that the god using its verbs hardest
accrues two hundred times less applied use than the god doing nothing — unchanged by this work. The
gated one is **seven zeros and a four**; the 426× is arithmetic on a sample with one non-zero
observation and should not be quoted.

This was always the least likely of the three to move, and the reason is structural rather than
incidental: `denial-warden` forbids and interdicts, practice is **refused in a forbidden cell** by
design (that refusal is what stops an interdiction being practised away), and so a denying god
removes its own universe's ability to practise along with its ability to cast. It holds 12
instances per tick against `permissive-breadth`'s 2,290. There is nothing for a maintenance mechanic
to reward.

**Any mechanic that accrues on applied magic will be anti-correlated with denial.** If the design
wants a denying god to score, the currency it scores in cannot be applied use — which is a finding
about `raid-engagement.md` §11c's proposal rather than about this build.

## The cost of the gate, stated plainly

Gating `resource-yield` on a tick-sharp practice commitment removes **99.2% to 99.6%** of the
economy's magical contribution:

| strategy | ungated use/tick | gated use/tick | remaining |
|---|---|---|---|
| `passive-control` | 20.00 | 0.089 | 0.4% |
| `permit-then-idle` | 102.67 | 0.806 | 0.8% |
| `permissive-breadth` | 108.28 | 0.393 | 0.4% |

That is arithmetic, not a bug: a mage holds dozens of nodes and practises one, so at most one of her
instances can pass the gate in any tick, and only if that one happens to be an economic node.

It shows up downstream. `reference-long-run` task 9.8 measures the reference universe's library at
world year 200: **159 books against 17 distinct nodes**, where it was **157 against 48** before the
gate. The book count survives and the *breadth* collapses — less `resource-yield` is less `vellum`,
and scribes go on copying what the shelf already holds. That test's books-to-depth bound has been
**withdrawn rather than widened**, because widening it to fit 9.4-books-per-node would assert that
9.4 is fine, and the comment it would have replaced named ten as the point at which the brake is
gone.

### The recommended follow-up, named so it is not re-derived

The gate should be a **freshness window**, not a tick-sharp commitment: an instance contributes if
somebody has practised it within the last *N* ticks. That preserves "the economy reads work
performed" — the whole point — while letting a scholar's month of drill pay out over a season rather
than a tick, which is what practice means physically anyway.

It was not built here because it needs a `lastPracticedTick` field on `KNOWLEDGE_INSTANCE`, i.e.
`WORLD_SCHEMA_VERSION` 3 → 4 with a migration. That is precedented twice over and is a day's work;
it was traded away for landing the measurement, which is the deliverable. The tick-sharp gate is the
smaller first cut and its numbers are above.

---

## Determinism audit

**Zero new RNG draws.** `practice()` in `packages/rules-magic/src/instances/practice.ts` takes no
`rng` parameter, opens no stream, and adds no ordinal to any existing stream;
`contributePractice` is the only accrual on the coordinating gateway that does not reach for
`#rng`. No committed baseline's stream sequence is displaced by an insertion, which is the property
`rng-insertion-invariance` exists to hold.

The tenth goal does change *which* goal a mage selects, so the stream-7 tie-break can resolve
differently in a run — but that is a behaviour change reached through the same draw sequence, not a
re-roll. The distinction is the one `contracts.md` §6 cares about.

All fixed-point: `PRACTICE_COST_PER_TIER` and `PRACTICE_MASTERY_RESTORE` are integers at scale
1/1024, the requirement divides through `div`, and no float enters the rules path.

### The three balance gates

All three gates report **`baseline-invalid`** first: the committed baselines were recorded at content
revision `ba7be8d6` and this tree is `b418fc02` (the `practice-rate` primitive, the
`bless-practice-rate` constant, two node effects). That is the same refusal W49 recorded on its own
tree, and it is the gate saying *"across two builds a delta is not a regression, it is a category
error."* **No baseline has been regenerated.**

The gates print their per-metric deltas anyway, and those are the numbers this change owes a
rationale for. `balance:gate` (200 runs, 100 world ticks):

| metric | baseline | current | delta | verdict |
|---|---|---|---|---|
| `referenceKnowledgeInstances` | 310.26 | 294.01 | **−16.25 (−5.2%, −7.6 SE)** | regressed |
| `referenceLibraryDepth` | 5.280 | 4.055 | **−1.225 (−23.2%, −5.6 SE)** | regressed |
| `referenceGrimoires` | 90.97 | 88.35 | −2.63 (−1.6 SE) | pass |
| `referenceNodesKnown` | 17.06 | 16.91 | −0.15 (−1.4 SE) | pass |
| `referenceLivingMages` | 38.95 | 38.94 | −0.02 | pass |
| population series | — | — | unchanged within noise | pass |

`balance:gate:horizon` (200 runs, the long horizon):

| metric | baseline | current | delta | verdict |
|---|---|---|---|---|
| `referenceKnowledgeInstances` | 1003.9 | 890.2 | **−113.7 (−11.3%, −13.3 SE)** | regressed |
| `referenceLibraryDepth` | 18.64 | 13.95 | **−4.70 (−25.2%, −6.2 SE)** | regressed |
| `referenceNodesGainedFinalQuarter` | 7.645 | 8.480 | **+0.835 (+10.9%, +7.9 SE)** | regressed |
| `referenceGrimoires` | 321.5 | 299.9 | −21.6 (−2.9 SE) | pass |
| `referenceNodesGained` | 39.35 | 38.96 | −0.39 (−2.4 SE) | pass |
| `referenceNodesKnown` | 41.85 | 41.46 | −0.39 (−2.4 SE) | pass |
| `referencePeakPopulation` | 353.0 | 356.0 | +3.0 (+0.5 SE) | pass |

Read together, the three that moved say one thing each:

- **Instances and library depth fall**, by 5–11% and 23–25% on these two gates, and by 59% on the
  ascension gate below. Practice takes months that were research and scribing, and the gated economy
  pays for less `vellum`. This is the cost, and it is the same movement `reference-long-run` 9.8
  shows at two centuries.
- **`referenceNodesGainedFinalQuarter` *rises* 10.9%, and it is the only metric that improves.** A
  universe with fresher fundamentals is still gaining nodes late in a run where it used to be
  slowing down. That is `ages-of-magic.md` §2c's claim — *"fresh fundamentals inform research at
  the frontier"* — showing up as a number, and it is the strongest positive result in this
  document. It is also the metric a reviewer should distrust most, because it is one metric out of
  seventeen and this is the first time anything has been measured against it under a maintenance
  mechanic.

`balance:gate:ascension` (32 runs, **892.0 s** — W49 measured 504 s for the same sweep and had to
raise a timeout to get it; this machine was carrying two other agents' sweeps at the time):

| metric | baseline | current | delta | verdict |
|---|---|---|---|---|
| `referenceLibraryDepth` | 34.13 | 14.03 | **−20.09 (−58.9%, −3.02 SE)** | regressed |
| `referenceGrimoires` | 283.56 | 175.84 | −107.72 (−38.0%, −2.42 SE) | pass |
| `referenceKnowledgeInstances` | 3266.6 | 3005.7 | −260.9 (−8.0%, −0.54 SE) | pass |
| `referenceNodesGainedFinalQuarter` | 4.875 | 5.469 | +0.594 (+12.2%, +0.28 SE) | pass |
| `referenceNodesKnown` | 60.88 | 59.72 | −1.16 (−0.10 SE) | pass |
| `referenceLivingMages` | 459.9 | 473.9 | +14.1 (+0.08 SE) | pass |
| population series | — | — | unchanged within noise | pass |

Two things to read carefully here, because this gate's tolerances are enormous — `referenceNodesKnown`
tolerates ±33 on a value of 60, and `referenceKnowledgeInstances` ±1456 on 3267:

- **`referenceLibraryDepth` is the only metric that clears its tolerance, and it is the same metric
  that regressed on both faster gates.** −59% here against −23% and −25% there, and the same
  collapse `reference-long-run` 9.8 sees at two centuries. Three gates and a long run all say the
  library stops broadening; that is the most robust negative result in this document.
- **`referenceGrimoires` falls 38% and *passes*.** It passes because the ascension sweep's spread is
  wide enough to absorb it, not because it did not happen. A reader taking "9 of 10 pass" off this
  table would be reading the tolerances, not the build.

`referenceNodesGainedFinalQuarter` moves the same direction as it did on the horizon gate (+12.2%
against +10.9%) but at 0.28 SE it carries no weight here. Two same-signed observations, one of them
significant: worth watching, not worth claiming.

The comparison that would be *meaningful* is a regeneration taken deliberately after the
freshness-window decision above, not one taken to make a gate go green.

---

## What ships, and what it claims

The claim this work makes, in the form the release plan requires — something that could turn out to
be false, plus the measurement that would disprove it:

> **Mastery is no longer monotone.** A mage who spends months on a node she holds raises its
> mastery, can cross back over the teaching threshold, and pays for it in the research and teaching
> she did not do. Disproved by: `practiceCompleted` at zero in any run of the reference universe, or
> the below-threshold share failing to fall on the arms above.

The claims it deliberately does **not** make:

> That applied use now separates a god who plays from a god who does not. It does not — every
> comparison is inside one standard error, and the tick-sharp gate leaves the quantity too sparse to
> compare with.

> That the economy now rewards playing. Nothing here establishes that. What little signal there is
> points the other way.

> That publish-or-perish is closed. It moved 0.8 to 2.5 points on four arms and remains at 85%.
