<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W26 — marooning: knowledge that is alive and cannot move

**Branch** `w26/marooning`, from `origin/integration/campaign-round-2`, fast-forwarded onto
`origin/w22/knowledge-observability` so this work extends W22's census rather than building a
second instrument.

**This workstream changes no rule, no constant and no magnitude.** It publishes derived values a
renderer must not recompute, and it measures. If a balance baseline or a golden fixture moves, that
is a defect in this branch and gets reported as one, not regenerated.

---

## The finding

`rules-magic/src/instances/decay.ts` and `constants.ts`:

```
masteryDecayPerTick(retention) = max(div(MASTERY_DECAY_PER_TICK, retention), 1)   // 8/retention
masteryFloor(retention, false) = min(mul(MASTERY_FLOOR_SHARE, retention), 1024)   // retention/4
DEFAULT_TEACH_THRESHOLD        = 512
```

Across the six shipped species (`packages/content/data/species.json`):

| species | retention | decay/tick | floor | floor ≥ 512? |
|---|---|---|---|---|
| gnome | 512 | 16 | 128 | no |
| orc | 896 | 9 | 224 | no |
| human | 1024 | 8 | 256 | no |
| elf | 1280 | 6 | 320 | no |
| dwarf | 1536 | 5 | 384 | no |
| draconic | 1536 | 5 | 384 | no |

Every floor is below the teach threshold. And **nothing in the build raises mastery**:
`KnowledgeSubsystem.setMastery` has exactly one rules-path caller — `decay.ts:213` — and it only
ever writes a value bounded above by the value it read. W7 implemented `practice.ts` this session
and `804c16b` reverted it whole.

The consequences, each traced to a line rather than assumed:

- **A non-dormant held instance is never destroyed.** It settles at its floor and stays there.
- **It becomes permanently unteachable.** `teaching.ts:163` refuses on
  `teacherMastery < threshold`; `heldMastery` reads mind and palace only.
- **Its holder can never re-acquire it.** `coordination/src/gateway.ts:497` and `:1128` skip a
  student who `knows()` the node, and `knows()` is set membership at *any* mastery, including zero.
  `:435` skips the same mage as a research target.
- **A book is not a way back.** `scribing.ts:209` writes the grimoire instance at `mastery: 0`,
  and there is no book→mind path in the build at all — `teaching.ts` says so explicitly
  (*"reading one into a mind is `mages-and-species`' study loop"*), and that loop does not exist.

So every acquisition starts a clock, and teaching only ever propagates *recently acquired*
knowledge in a wave that closes behind itself. That is a candidate explanation for W13's result:
teaching busy under True Naming (976 lessons in the first quarter) while buying 0.0 ±0.1 extra
nodes known.

> **Read the Results before acting on this section.** The measurement confirms the mechanism at the
> **instance** level — 93.4% of held instances are marooned at tick 2,400 — and **falsifies the
> "guaranteed to die with its holder" reading at the node level for 27 of the 28 affected nodes**.
> Research keeps re-deriving nodes back into teachability, at full price, so untransmittability is
> churn rather than a ratchet. The durable loss is real but narrow, and it concentrates at tier 5.

### What the finding is *not*

Stated up front so the report cannot be read as more alarming than the evidence supports:

- Marooning is **per instance and per mage**, not per universe. A mage who does *not* hold the node
  may still research it. `isRediscovery` is `wasEverKnown && !exists`, so while any instance
  survives, re-deriving is **ordinary** research at the ordinary price — the ≥3× rediscovery
  multiplier does not apply. Research is a real path back at the universe level.
- Marooning is **not** the dormant path. A dormant instance has floor `0`, decays to zero, is
  destroyed, and emits the loss event `knowledgeHalfLife` is computed from. That knowledge has an
  exit. Marooned knowledge does not — which is exactly why no committed metric sees it.

---

## Deliverable 1 — publish the derived values

*"Audio is a projection of state, and computes no rules"* (`sound-design.md` §0.1, from contracts
§5). The same holds for any view. Today a panel can render `704` and nothing else; `704` means
"teachable, 25 ticks left" for a human and "teachable, 39 ticks left" for a dwarf, and a renderer
must not be the thing that knows that.

**Home: W22's `knowledgeCensus` in `packages/agent-api/src/knowledge-census.ts`.** Extended, not
duplicated. Per held instance the census publishes:

- `floor` — `masteryFloor(retention, dormant)`
- `decayPerTick` — `masteryDecayPerTick(retention)`
- `ticksToUnteachable` — first tick at which `teach()` will refuse; `0` if it already does;
  `null` if the floor sits at or above the threshold and it never will
- `teachable` — whether it is at or above the threshold now
- `marooned` — held, non-dormant, below the threshold: no exit exists

`ticksToUnteachable = floorDiv(mastery − threshold, decayPerTick) + 1`, exact integer arithmetic.
**Note the deliberate +1 against the brief's table.** The table's "ticks from 1024 to 512" is 64 for
a human: at t=64 mastery is exactly 512, which `teach()` still accepts (`mastery < threshold`
refuses). The first tick on which she cannot teach is 65. The published field is the one a renderer
needs — *when does this stop working* — so it is 65, and the divergence is recorded here rather
than discovered later.

### Three buckets, never blended

The headline number is worthless if these mix:

| bucket | test | has an exit? |
|---|---|---|
| **marooned** | held (mind/palace), non-dormant, `mastery < threshold` | **no** |
| **condemned** | held, dormant | yes — destruction, and a loss event |
| **written** | grimoire/library, `mastery` 0 by construction | n/a — never teachable, never decays |

### Three constraints on how it is published

1. **The observation vector is not widened.** W22 chose a diagnostic projection outside the vector
   precisely so `OBSERVATION_LAYOUT_DIGEST` stays put and `gym-bridge` never refuses to start. That
   line holds here: no new channel, no digest bump, no invalidated policy.
2. **No new dependency edge.** `@mm/agent-api` depends on `@mm/sim-core` and `@mm/state` only, and
   deliberately not on `@mm/content` (its loader would drag `node:fs` into a browser renderer). It
   may not import `@mm/rules-magic`. So the decay arithmetic is **injected** — the caller passes
   rules-magic's own `masteryFloor`, `masteryDecayPerTick` and `DEFAULT_TEACH_THRESHOLD` — exactly
   the `catalogue.ts` precedent. There remains exactly one implementation of the formula, and a
   committed test proves the census agrees with it on a real run.
3. **Integer arithmetic only.** `floorDiv`, never `/`: this package's float-boundary test bans
   division outside `normalize.ts`.

The marooning block is an **optional second argument**. Absent, `knowledgeCensus(state)` is
byte-for-byte what W22 shipped — existing callers, existing tests, and W22's "no allocation per
instance" cost claim all unchanged.

### Inertness — proved, not asserted

W22's price for reading `SimState` directly was `packages/scenario/test/unit/
knowledge-census-inertness.test.ts`: identical `snapshotHash()` with and without interleaved census
calls. The extension pays the same price at the same standard, with the marooning model supplied,
and the report tool re-checks it at 2400 ticks where the committed test runs 240.

---

## Deliverable 2 — what marooning costs

`tools/w26/marooning-report.mjs`, on W22's `play()` pattern: reference universe, zero god input,
seed `0x00090001`, 2400 ticks. Reads only; writes no baseline and no golden.

Four measurements:

1. **Marooned instances as a share of all instances**, and of held instances.
2. **Nodes with every copy marooned** — the important one. Such a node cannot be taught and cannot
   be read out of a book, and *no committed metric can see it*: `knowledgeHalfLife` counts it
   alive, `libraryDependence` counts it held, W22's `fragileNodeIds` and `unwrittenNodeIds` both
   call it healthy. Whether it also *dies* is the question the measurement has to answer rather
   than assume — the answer turned out to be "usually not", and the measurement has to be able to
   say so, which is why it tracks how long each node has gone without a teachable copy rather than
   only counting them at the end.
3. **Time-to-maroon by species**, measured by watching the crossing (`prev ≥ threshold`,
   `now < threshold`) at `censusEvery = 1`, not derived from the table. Instances **born below the
   threshold** are counted separately: `transmittedMastery` from a teacher near 512 lands well
   below 512, so a lesson can produce an instance that was never teachable for one tick.
4. **Whether marooning explains the teaching/nodes-known gap.** Teaching definitionally never adds
   a node to the universe — `teachableTo` requires the student not know it — so the gap needs no
   explaining in that direction. The question is whether marooning destroys teaching's
   *preservation* value: the time series of teachable-instance share, and of nodes with at least
   one teachable copy against `nodesHeld`.

---

## Deliverable 3 — the practice question, framed, not decided

**No practice implementation lands on this branch.** `campaign-plan.md`: *"Where the spec is silent
on a rule, stop and ask — do not invent one."*

The four sources the decision rests on:

- **vision §5's operation list** — research, teaching, scribing, loss, rediscovery, theft. Six
  operations, no practice.
- **`decay.ts`'s own docstring** — *"Nothing in this subsystem restores mastery; practice does, and
  practice is an operation somebody has to perform."* The subsystem's author named practice as the
  counterpart and left it to somebody else.
- **`804c16b`** — the measured +47% lessons over 200 years (1,782 → 2,613), and its warning: a gain
  path accelerates every species at once and confounds species differentiation.
- **`constants.ts` framing** — every number here is an untuned placeholder, and the measurement
  pivot is 0.5.0.

Set out for the author: what marooning-with-no-recovery makes the game, versus
marooning-you-can-fight; what practice costs in mage ticks and player attention; and whether §5's
list implies practice belongs or implies it was deliberately excluded.

---

## Tasks

- [x] Branch from `origin/integration/campaign-round-2`, fast-forward onto `origin/w22/…`, `npm ci`
- [x] Read `decay.ts`, `constants.ts`, W22's census, vision §5/§6, `campaign-plan.md`, `CLAUDE.md`
- [x] Verify the finding line by line: `setMastery` callers, `knows()`, scribing mastery, book→mind
- [x] Commit and push this plan
- [ ] `npm run typecheck` (the report tool reads `dist/`)
- [ ] Extend `knowledgeCensus` with the optional marooning model and per-instance block
- [ ] Unit edges in `@mm/agent-api`: born-below, exactly-at-threshold, floor ≥ threshold, written
      excluded, orphan holder
- [ ] Extend the scenario inertness test with a model-supplied census — prove by snapshot hash
- [ ] Agreement test in `@mm/scenario`: predicted first-unteachable tick vs the tick `teach()`
      actually flips on a real run — the one-implementation guard for the injected functions
- [x] `tools/w26/marooning-report.mjs`, and run it at 2400 ticks
- [x] `npm run verify`, per stage; report the exact result
- [x] Record the four measurements and the fully-marooned node count here

---

## `npm run verify`, per stage

Run as one chain first, then stage by stage. Every stage green.

| stage | result |
|---|---|
| `typecheck` | pass |
| `lint` | pass |
| `check:purity` | pass — the eight zero-dependency packages unchanged |
| `check:content` | pass — `contentRevision a622452a3b55e38fd902a2d3264b44d7` |
| `check:audio` | pass — 54 cues, 10 voice-line banks |
| `check:coverage` | pass |
| `test` | **279 files, 3,925 tests, all passing** |
| `balance:gate` | **PASS**, every metric delta `0.00000` |
| `balance:gate:horizon` | **PASS**, every metric delta `0.00000` |
| `balance:gate:ascension` | **PASS**, every metric delta `0.00000` |

**No golden regenerated and no baseline regenerated.** `git status` is clean of `balance/` and
`packages/sim-core/test/golden/`, and all thirty gate metrics across the three gates report delta
`0.00000` — which is what an observation-only change must do and is the check that would have
caught it if this branch had touched a rule.

Two things worth recording rather than smoothing over:

- **The chained run failed once, legitimately.** `packages/state/test/unit/schema-duplication.test.ts`
  rejected `InstanceMastery` and `HeldRow` as supersets of `@mm/state`'s `KnowledgeInstanceRecord`.
  The rule is right and the fix is the one the checker sanctions — `extends` counts as consuming
  the shared type, restating its fields does not. Fixed in `60ad238`; the 2,400-tick report is
  byte-identical after it, both arms still on `cb1c0efafbd7f66a`.
- **The known `Timeout calling "onTaskUpdate"` artifact appeared**, as `CLAUDE.md`'s campaign notes
  describe: three to five unhandled RPC-timeout errors after the tests themselves finish, from
  `reference-long-run.test.ts` blocking a worker past vitest's budget. On one loaded run it took
  three test *files* down with it. Re-run unloaded, the same suite is 279/279 and 3,925/3,925.
  **No timeout was raised to make anything green.**

---

## Results

`node tools/w26/marooning-report.mjs`. Reference universe, seed `0x00090001`, 2,400 world ticks
(200 fictional years), zero god input, `cohortSize 4`, `foundingNodes 4`, raids on. Every number
below is from that tool and from nowhere else.

### Inertness — the proof, not the assertion

| arm | snapshot hash |
|---|---|
| censused, a full census **every tick** for 2,400 ticks | `cb1c0efafbd7f66a` |
| clean, no census called at all | `cb1c0efafbd7f66a` |

Identical, along with `clock.worldTick` and `illegalActionCount`. The committed test
(`packages/scenario/test/unit/knowledge-census-inertness.test.ts`) takes the same proof at 240
ticks with the marooning model supplied, and adds two forms W22 did not need: that the projection
actually saw held instances, so the proof cannot pass vacuously, and that `knowledgeCensus(state)`
is field-for-field identical whether or not the model was passed.

**The observation vector is untouched.** No channel added, `OBSERVATION_LAYOUT_DIGEST` unmoved,
`layout-digest.test.ts` and the adversarial digest suite green.

### 1. Marooned instances

| | count | share |
|---|---|---|
| instances, total | 2,172 | |
| held (mind/palace) | 2,172 | 100.0% |
| written (grimoire/library) | 0 | 0.0% |
| **marooned** | **2,028** | **93.4% of held, 93.4% of all** |
| teachable | 144 | 6.6% of held |
| condemned (dormant) | 0 | and `dormancyEvaluated: true`, so that is measured, not assumed |

Nothing is written down at tick 2,400 — W22 found the scribing floor and raids take the residual to
zero — so every instance in the universe is in a mind. **93.4% of them cannot teach and never
will.** Averaged over the whole run rather than read at the end, the teachable share of held
instances is **10.6%**.

### 2. Nodes with every copy marooned

| | count | share of nodes held |
|---|---|---|
| nodes held | 51 | |
| with ≥1 teachable copy | 23 | 45.1% |
| **untransmittable — no teachable copy anywhere** | **28** | **54.9%** |

1,106 copies are held of those 28 nodes. What the committed metrics see at the same instant:
`fragileNodeIds` **0**, `singleLocationNodeIds` **0**, minimum redundancy **4**, maximum **55**.
Every existing instrument calls this universe's knowledge healthy while more than half of it cannot
move. Averaged over the run, **46.2%** of held nodes are untransmittable at any given tick.

### The brief's stronger claim, tested and falsified for 27 of the 28

The brief calls such a node *"already effectively dead"*. **That is true of one node out of 28, and
the measurement says so plainly:**

| | count |
|---|---|
| untransmittable at tick 2,400 | 28 |
| that never once had a teachable copy in the whole run | **0** |
| with no teachable copy for ≥ 100 ticks | 15 |
| with no teachable copy for ≥ 300 ticks | **1** |
| with no teachable copy for ≥ 1,200 ticks | **1** |

The transmittable frontier does not decline. It **oscillates**, between 4 and 45 nodes, while
`nodesHeld` sits flat at 51 from tick 600 onward. Untransmittability is churn, not a ratchet: nodes
fall out of reach and are put back, usually within about a hundred ticks.

**The mechanism putting them back is research, and only research.** Every other instance-creating
path is ruled out by inspection: teaching refuses a teacher below the threshold; theft writes the
thief's instance at `mastery: 0` deliberately (`rules-raid/src/consequences.ts:141`); a looted
grimoire carries the book's mastery, and a book is mastery 0 with no path into a mind; and the
god's `grantFoundingKnowledge` requires god input this run has none of. So a node comes back only
when a mage who does *not* hold it derives it again — at the **ordinary** research price, since
`isRediscovery` requires the node not to exist.

### The durable cost concentrates at depth

| tier | untransmittable at 2,400 | mean ticks since a teachable copy | mean share of run untransmittable |
|---|---|---|---|
| 1 | 4 | 78 | 52% |
| 2 | 9 | 121 | 46% |
| 3 | 8 | 62 | 43% |
| 4 | 5 | 116 | 42% |
| **5** | **2** | **1,019** | **73%** |

The one durably stranded node is `pm-the-empty-room` (id 221, tier 5): **1,790 ticks — 149
fictional years — without a single teachable copy**, 80.9% of the run untransmittable. The
runner-up is `rl-the-standing-gate` (id 278, tier 5).

That is the sharpest thing in this report. Shallow nodes are re-minted constantly because many
mages can derive them; a tier-5 node needs a mage with the depth ceiling *and* the prerequisites,
and there are few of those, so when its last teachable copy decays it stays gone. **Marooning bites
hardest exactly where §6's "deep specialists" pillar lives** — the elves and draconics the species
table exists to differentiate.

### 3. Time-to-maroon, measured

4,569 crossings observed. Ticks from acquisition to the first tick the instance could no longer
teach:

| species | crossings | min | median | max | derived from the table (+1) |
|---|---|---|---|---|---|
| gnome | 930 | 3 | 33 | 33 | 33 |
| orc | 523 | 2 | 32 | 57 | 58 |
| human | 1,955 | 2 | 65 | 65 | 65 |
| elf | 122 | 4 | 86 | 86 | 86 |
| dwarf | 943 | 2 | 77 | 103 | 103 |
| draconic | 96 | 2 | 67 | 103 | 103 |

**The maxima land exactly on the derived values**, which is a free cross-check on the census's
arithmetic: an instance acquired at full mastery runs the full clock and not one tick more.

The medians sitting *below* the maxima — draconic 67 against 103, dwarf 77 against 103 — are the
finding the derived table cannot produce. Research under True Naming mints an instance at
`fp(1024)`; **teaching does not.** `teach()` calls `transmittedMastery`, which is lossy for any
teacher below full mastery, so a lesson from a partly-decayed teacher produces an instance with
part of its clock already spent.

**1,250 instances were born below the threshold** — never teachable for a single tick:

| species | born marooned |
|---|---|
| dwarf | 445 |
| human | 374 |
| orc | 302 |
| draconic | 62 |
| elf | 49 |
| gnome | 18 |

The arithmetic is unforgiving: a teacher at exactly the threshold transmits
`mul(512, 512) = 256` — half the threshold. Late in a wave, **a lesson manufactures a dead copy.**

### 4. Does marooning explain the teaching/nodes-known gap?

Partly, and not in the direction the question implies. Teaching cannot add a node to the universe
by construction — `teachableTo` requires the student not to know it — so W13's 976 lessons buying
0.0 ±0.1 nodes known was never evidence of a defect in teaching.

What the measurement adds is that teaching's *product* is transient. The frontier series:

| tick | nodesHeld | nodes with ≥1 teachable copy | held instances | teachable | share |
|---|---|---|---|---|---|
| 60 | 27 | 27 | 208 | 145 | 69.7% |
| 120 | 39 | 30 | 355 | 88 | 24.8% |
| 300 | 48 | 22 | 460 | 37 | 8.0% |
| 600 | 51 | 14 | 590 | 30 | 5.1% |
| 1200 | 51 | 42 | 2,247 | 168 | 7.5% |
| 1800 | 51 | 25 | 1,376 | 108 | 7.8% |
| 2400 | 51 | 23 | 2,172 | 144 | 6.6% |

The teachable *share* collapses from 70% to under 10% within 300 ticks and never recovers, while
the node frontier churns. The universe is running to stand still: research re-mints, decay
un-mints, and teaching — 1,250 of whose products were unteachable on arrival — moves copies that
mostly cannot move again.

---

## Deliverable 3 — the practice question, framed for the author

**Not decided here, and nothing implemented.** `campaign-plan.md`: *"Where the spec is silent on a
rule, stop and ask — do not invent one."* What follows is the decision and its sources.

### What §5 says, and what it does not

vision §5 lists the operations by name: **research, teaching, scribing, loss, rediscovery,
theft**. Six. Practice is not among them. That is the strongest single citation, and it cuts both
ways — the list may be exhaustive by intent, or it may be a list of the operations that *move
knowledge between locations*, which practice does not do. §5's own framing is locational
(*"Knowledge Has a Location"*), and every one of the six changes where a copy is or whether it
exists. Practice changes only a number attached to a copy that stays put. On that reading its
absence is a category fact rather than a prohibition. **That reading is the author's to accept or
reject; it is not settled by the text.**

### What the code says it expected

Two places in the build assume practice exists:

- `rules-magic/src/instances/decay.ts`, in its own docstring: *"Nothing in this subsystem restores
  mastery; **practice does**, and practice is an operation somebody has to perform."* The
  subsystem's author designed the floor **against** a counterpart that was never written.
- `rules-raid/src/consequences.ts:141`, on stolen knowledge: *"She has the shape of it and not the
  practice, so she cannot teach it onward **without further study**."* There is no further-study
  operation. Every stolen instance in the game is therefore born permanently marooned, and the
  comment justifying theft's balance describes a mechanism that does not exist.

### What it would cost, measured

`804c16b` implemented practice and reverted it whole. Lessons taught over the 200-year reference
run, per twenty-year window:

    without practice  815 / 289 /  96 /  47 / 105 /  79 /  55 /  19 / 166 / 111  = 1782
    with practice     826 / 445 / 284 / 165 /  67 /  39 / 140 / 295 / 226 / 126  = 2613

**+47% lessons.** The revert's warning stands: a gain path accelerates every species at once, and
the species-differentiation regression in `reference-time-to-tier.test.ts` was partly its doing.
Everything in `instances/constants.ts` is an untuned placeholder and the measurement pivot is
0.5.0, so no number here can be called balanced either way.

### The question this measurement lets the author ask, which the brief could not

The choice is **not** "can knowledge survive without practice" — it demonstrably survives, at 93.4%
of instances marooned, by expensive churn. The choice is about **where the loss lands and what the
treadmill costs**:

1. **Marooning with no recovery** is a game where knowledge decays out of reach and is bought back
   by re-derivation. It has a real texture: the archivist fantasy becomes about *rate*, mages spend
   their lives re-deriving what a colleague across the hall already knows, and the loss
   concentrates at tier 5 — precisely the deep specialists §6 sells. Whether that concentration is
   a feature (depth is precious and perishable) or a defect (the depth pillar is unreachable in
   practice) is the author's call and nobody else's.
2. **Marooning you can fight** gives the player and the mages a lever. It costs mage ticks that
   currently go to research, it costs player attention on a screen that does not exist yet, and per
   `804c16b` it confounds the species axis unless it is scaled by retention rather than applied
   flat.
3. **Neither is free.** Leaving it as-is leaves two code comments describing a mechanism that is
   not there, and leaves theft creating instances that can never be taught onward — a *rule*
   consequence nobody chose.

A fourth option the measurement suggests and nobody has costed: leave decay alone and change where
**teaching's** loss falls, since 1,250 instances were born unteachable because `transmittedMastery`
is quadratic near the threshold. That is a smaller rule change than practice, aimed at the same
symptom. **Listed, not recommended.**

---

## A second finding, adjacent, reported and not fixed

`coordination/src/gateway.ts:441` quotes research cost with
`rediscovery: this.#deps.knowledge.wasEverKnown(nodeId)`. `wasEverKnown` is marked inside
`createInstance` (`subsystem.ts:350`), so it is **true for every node the universe currently
holds**. But `research()` charges `isRediscovery = wasEverKnown && !exists` (`research.ts:248`),
which is false for a held node. So a mage choosing a research target is quoted the ≥3× rediscovery
price for a node the universe still holds, and charged the ordinary price if she takes it — against
`gateway.ts`'s own stated intent that *"what a mage is quoted while choosing is what she is charged
while working"*.

It bears directly on marooning: re-derivation is the only path back to a transmittable copy, and
the frontier scan ranks exactly those nodes ~3× worse than they cost. Re-minting demonstrably
happens anyway, so this is a drag rather than a blocker. **Not fixed here** — this branch changes
no rule.
