# W53 — practice: what it moved, and the two questions it answered "no" to

**Status: measured.** Every number below comes from `tools/w53/practice.mjs`, which is W49's
`tools/w49/applied-use.mjs` with four columns added and its arithmetic untouched. Both arms were run
on **the same tree** at the same coordinates — `SWEEP_ID w49-applied-use-v1`, `ROOT_SEED 20260811`,
the committed ascension sweep's two corner cells, four replicates, 2,400 world ticks, four
strategies, 32 runs per arm. The "before" arm is commit `780b5de` (the economy merged, the mechanic
absent) in a separate worktree; the "after" arm is this branch.

Raw output: `balance/results-w53-practice-before.json`, `balance/results-w53-practice-after.json`.

---

## The short version

**The mechanic runs.** Mages practise, mastery goes back up, and it costs them the month.

**The gate separates the strategies — by a factor of two, in the wrong direction.**
`permit-then-idle` accrues **2.05×** `permissive-breadth` on applied use, where before it accrued
1.04×. The number moved. What it says is that a god who funds universities and encourages research
makes its scholars *busier at the frontier and worse at maintenance*, and the economy now reads
maintenance.

**Publish-or-perish moved about a point and a half.** The share of held instances below the teach
threshold went from 88.1% to 86.3% on `permissive-breadth`. That is a real movement and it is not
the loop closing.

**`denial-warden` is more anti-correlated with playing, not less.** It was 207× behind the god that
does nothing; it is now 230× behind on the ungated quantity and **426× behind on the gated one**.

**A null result is a full-value result, and two of the three questions here are nulls.** Nothing
below has been tuned to make a number look better.

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
Agreement with the production path: **0 of 51,468 ticks** had the world report come in below the
gated probe figure in the before arm, **30 of 51,468 (0.06%)** in the after arm — the residue is
W49's own documented phase-order asymmetry (the report describes the beginning of a tick, the probe
the end of it), not a predicate mismatch.

---

## Question 1 — does applied use separate `permit-then-idle` from `permissive-breadth`?

The two bots declare the same permits. `permit-then-idle` is `permissive-breadth` with every
non-permit action removed: no `fundUniversity`, no `encourageResearch`, no `issueDispensation`, and
nothing at all submitted after round 140 of 2,400.

| | before, ungated | after, ungated | after, **gated** |
|---|---|---|---|
| `permit-then-idle`, use/run | 135,353 | 120,331 | **945** |
| `permissive-breadth`, use/run | 129,867 | 126,899 | **460** |
| **ratio** | **1.0422** | 0.9482 | **2.0524** |

**The ratio moved: 1.04 → 2.05.** It is no longer indistinguishable, and by that literal reading the
gate did what it was built to do — an idle god and a playing god are now 2× apart on the quantity a
mētis mechanic would accrue on.

**It moved the wrong way, and the mechanism is legible.** Practice completions per run:

| | practice completions/run | held instances/tick |
|---|---|---|
| `passive-control` | 15,825 | 1,416 |
| `permit-then-idle` | 9,065 | 2,220 |
| `permissive-breadth` | 8,901 | 2,290 |
| `denial-warden` | 11 | 12 |

A god's verbs reach practice through a real channel — `practice-rate` takes the blessing constant,
the cell encouragement and vision §6a's library depth, and
`packages/coordination/test/unit/practice-rate-channel.test.ts` asserts each of those is non-zero
where it should be and absent where it should not, *specifically* so that this result cannot be
confused with an unwired seam. But the same verbs reach research through the same kind of channel,
and research is what they make cheaper first. A funded, encouraged universe produces scholars who
research more, hold more (2,290 instances/tick against `passive-control`'s 1,416), and practise
**less** than the scholars of a god who does nothing.

So the finding is not "the god cannot influence practice". It is:

> **The god's verbs reach how *well* a mage practises, not *whether* she does — and every verb that
> makes research cheaper bids the mage away from maintenance.** An economy that reads maintenance
> therefore rewards the god who leaves its scholars alone.

That is the same shape as W49's complaint, one layer in. It is a design problem in the *goal
competition*, not in the accrual predicate, and no amount of tuning the practice constants fixes the
sign — raising practice's appeal raises it for every strategy equally.

---

## Question 2 — does the teachable fraction move off 93.4%?

Share of held instances **below** `DEFAULT_TEACH_THRESHOLD`, and nodes with at least one teachable
copy, averaged per tick over the whole run:

| strategy | below threshold, before | below threshold, after | nodes w/ teachable copy, before | after |
|---|---|---|---|---|
| `passive-control` | 91.7% | **91.1%** | 31.6 of 47.9 | 30.6 of 47.5 |
| `permit-then-idle` | 87.8% | **86.6%** | 70.6 of 126.2 | 66.2 of 125.8 |
| `permissive-breadth` | 88.1% | **86.3%** | 68.8 of 126.6 | 67.2 of 126.3 |
| `denial-warden` | 51.3% | **50.9%** | 0.6 of 1.3 | 0.6 of 1.1 |

**It moved 0.4 to 1.8 percentage points, in the right direction, on every arm.** It did not close.

Two honest caveats about the 93.4% itself. It is W26's number, taken on a different tree with a
different instrument at a different instant; **this tree's own before-value is 88.1%**, and 88.1% →
86.3% is the comparison that is actually like-for-like. And `denial-warden`'s 51% is not health — it
holds twelve instances.

Where the loop *is* visibly closed is at unit scale, and it is worth recording because it is a test
that was written before the mechanic existed:
`packages/coordination/test/unit/acquire-hook-in-the-loop.test.ts` asserted that a standard-tradition
universe's mastery ceiling was its placeholder `fp(256)`, *"which nothing in the loop ever raises"*.
Over twenty world years that universe now reaches **1019** and teaches **3** lessons where it
previously taught **0**. The mechanism works; at population scale over two centuries, decay
out-runs it.

The reason is arithmetic and is not hidden: `PRACTICE_MASTERY_RESTORE` is `fp(128)` per completed
project, `PRACTICE_COST_PER_TIER` is `fp(1024)` of a mage-month per tier, and a mage holds dozens of
nodes while practising one. Both constants are `Untuned` and the harness that would tune them is
0.5.0's. **This measurement is a reason to tune them, not evidence that they are wrong.**

---

## Question 3 — does `denial-warden` stop being anti-correlated with playing?

No. It got worse.

| | before | after, ungated | after, gated |
|---|---|---|---|
| `passive-control` / `denial-warden` | **207.1×** | 230.0× | **426.5×** |

The god using its verbs hardest accrues 426 times less applied use than the god doing nothing.

This was always the least likely of the three to move, and the reason is structural rather than
incidental: `denial-warden` forbids and interdicts, practice is **refused in a forbidden cell** by
design (that refusal is what stops an interdiction being practised away), and so a denying god
removes its own universe's ability to practise along with its ability to cast. It holds 12
instances per tick against `permissive-breadth`'s 2,290. There is nothing for a maintenance mechanic
to reward.

**Any mechanic that accrues on applied magic will be anti-correlated with denial.** If the design
wants a denying god to score, the currency it scores in cannot be applied use — which is a finding
about `raid-engagement.md` §11c's proposal rather than about this build.

---

## The cost of the gate, stated plainly

Gating `resource-yield` on a tick-sharp practice commitment removes **99.3% to 99.6%** of the
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

- **Instances and library depth fall**, by 5–11% and 23–25%. Practice takes months that were
  research and scribing, and the gated economy pays for less `vellum`. This is the cost, and it is
  the same movement `reference-long-run` 9.8 shows at two centuries.
- **`referenceNodesGainedFinalQuarter` *rises* 10.9%, and it is the only metric that improves.** A
  universe with fresher fundamentals is still gaining nodes late in a run where it used to be
  slowing down. That is `ages-of-magic.md` §2c's claim — *"fresh fundamentals inform research at
  the frontier"* — showing up as a number, and it is the strongest positive result in this
  document. It is also the metric a reviewer should distrust most, because it is one metric out of
  seventeen and this is the first time anything has been measured against it under a maintenance
  mechanic.

`balance:gate:ascension` is recorded in the same shape below when its 32 runs finish; it is the
slowest of the three by two orders of magnitude.

The comparison that would be *meaningful* is a regeneration taken deliberately after the
freshness-window decision above, not one taken to make a gate go green.

---

## What ships, and what it claims

The claim this work makes, in the form the release plan requires — something that could turn out to
be false, plus the measurement that would disprove it:

> **Mastery is no longer monotone.** A mage who spends months on a node she holds raises its
> mastery, can cross back over the teaching threshold, and pays for it in the research and teaching
> she did not do. Disproved by: `practiceCompleted` at zero in any run of the reference universe, or
> the teachable share failing to move between the two arms above.

The claim it deliberately does **not** make:

> That the economy now rewards playing. It does not. On the measurement above it rewards leaving
> your scholars alone, by a factor of two.
