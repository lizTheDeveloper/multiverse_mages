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
2. **Nodes with every copy marooned** — the important one. Such a node cannot be taught, cannot be
   read out of a book, and dies with its last holder, and *no committed metric can see it*:
   `knowledgeHalfLife` counts it alive, `libraryDependence` counts it held, W22's `fragileNodeIds`
   and `unwrittenNodeIds` both call it healthy.
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
- [ ] `tools/w26/marooning-report.mjs`, and run it at 2400 ticks
- [ ] `npm run verify`, per stage; report the exact result
- [ ] Record the four measurements and the fully-marooned node count here

---

## Results

*Not yet measured. This section is filled from `tools/w26/marooning-report.mjs` output and from
nowhere else; until the tool has run against a built tree there are no numbers here to quote.*
