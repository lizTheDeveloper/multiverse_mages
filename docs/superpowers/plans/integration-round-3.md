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
| 7 | `origin/main` | absorbs `w17` as real commits, plus `bark-voices` | **yes** |

`npm run verify` after **each** merge, per-stage results recorded — never "chain green".

### Why `main` is step 7 rather than step 4

`main` moved to `6e4e80f` mid-round: `w17/value-sensitive-acquirer` was merged into it as real
commits, and PR #26 for this branch now conflicts. The orchestrator asked for it to be resolved
before the round completes, and **it is — as the last merge rather than an interrupting one**:

- The final measurement and the **single** baseline regeneration must happen on the final tree, and
  `main` is part of that tree wherever it sits in the order. Its position is bookkeeping.
- Taking it last preserves the six-merge attribution design already committed here, and absorbs any
  *further* movement of `main` in one step instead of two.
- Regenerating baselines now and again at the end would break this round's standing rule that they
  are regenerated exactly once.

### The `main` merge is a re-merge of content this branch already has

Round 2 **squash-merged** `w17` (`4f70acd`), deliberately, to keep ~60k lines of `.w17/` sweep JSON
out of a public repository. A squash leaves no ancestry, so git reports `w17` as 21 missing commits
and conflicts on every file it touched — while the *content* is already here. Confirmed: `origin/main`
carries **zero** files under `.w17/`, so the exclusion held on both sides.

A trial merge produced **nine** conflicts, one more than reported — `tools/w15/run-arm.mjs` is the
ninth, because W19 modified it in this round.

**Banked resolutions, written before executing so they are not decided under merge pressure:**

| file | resolution | evidence |
|---|---|---|
| `packages/content/src/autonomy.ts` | **ours** | see below — main regressed round 2's fix |
| `tools/w15/run-arm.mjs` | **ours** | W19's additive `--sample`; main's side is strictly older |
| `packages/scenario/src/long-run.ts` | expect ours ⊇ theirs | verify per-file with `:2:`/`:3:` |
| `packages/scenario/src/reference-universe.ts` | expect ours ⊇ theirs | verify per-file |
| `packages/content/test/unit/shipped-content.test.ts` | expect ours ⊇ theirs | round 2 kept **both** counts |
| `packages/content/test/unit/interning.test.ts` | **neither side** | recompute `contentRevision` on the merged tree, keep both history narratives |
| the three `balance/baselines/*.json` | **ours, provisionally** | round 2's exact precedent; regenerate once at the end |

**`autonomy.ts` is the one that matters, and the finding runs against `main`.** The two sides differ
in exactly one line:

    ours    const pair = `${record.role}\u0000${record.primitive}`;
    theirs  const pair = `${record.role}<raw NUL>${record.primitive}`;

Byte counts settle it: ours is 11,432 bytes with **zero** NUL bytes; main's is 11,427 with
**exactly one**. The runtime key is identical — both join role and primitive with U+0000, and that
separator is load-bearing, since without it `role:"ab",primitive:"c"` and `role:"a",primitive:"bc"`
would collide. Round 2 replaced the literal control character with its escape so the file is
diffable text rather than something git treats as binary. **`main` currently carries a raw NUL byte
in a source file in a public repository**, and merging its side would reintroduce the defect round 2
fixed. Taking ours is behaviour-preserving and is the fix.

### The `@mm/rules-raid` edge — packaging, not policy

Reported separately because the premise handed to this workstream was that widening `scenario`'s
edge list is a `contracts.md` §5 boundary-policy change requiring a fifth recorded deviation.
**Checked in the tree, it is not.** Two of the four proposed edits were already done:

- `module-boundaries.test.ts` **already carries `rules-raid` in `scenario`'s `ALLOWED` value edges**,
  with its reasoning written out — *"§5 gives `scenario` everything above; a leaf, and `rules-raid`
  is above it in that list."*
- `contracts.md` §5 **already grants** `scenario` → *"everything above; a leaf"* (line 910) and
  already records `scenario` as the fourth deviation. `rules-raid` is above `scenario` in §5's own
  list, so the edge was licensed before anything reached for it.

Writing a fifth deviation paragraph would record as a deviation something the policy already
permits, so it was **not** written. What was genuinely missing was packaging only — the dependency
and the project reference — fixed in `babe2d8`, one added line in `package-lock.json`.

**Why it typechecked anyway, which is why it went unnoticed:** the root `tsconfig.json` solution
file lists `./packages/rules-raid` explicitly, so `tsc --build` builds it whatever `scenario`
declares, and npm workspaces symlink every workspace into the root `node_modules` whatever
`scenario` declares. The build worked by accident of the root listing, not by the edge being
declared — which would have surfaced the day anyone built `scenario` alone.

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

- [x] Plan committed and pushed
- [x] Baseline `npm run verify` on the un-merged base, per stage
- [x] Merge 1 — `w18/instrument-repair`, verify, record, push
- [x] Merge 2 — `w22/knowledge-observability`, verify, record, push
- [x] Merge 3 — `w19/horizon-sweep`, verify, record, push
- [x] Merge 4 — `w24/university-siting`, verify, record, push
- [x] Merge 5 — `w21/timing-and-envelopes`, verify, record, push
- [x] Merge 6 — `w25/spec-refresh`, verify, record, push
- [x] Golden fixtures: checked at every merge — unchanged at all seven
- [x] Baselines regenerated once, with the single rationale
- [ ] The 2400-tick sweep at n ≥ 400, ten strategies, coverage asserted
- [ ] D1–D9 reported with real numbers, each `failed` or `saturated`

## Record — what moved after each merge

*Nothing is written here that has not been run. Every figure below is read out of a
`verify-*.log` or a gate output on disk.*

### Baseline (un-merged, `0b54c84`)

`npm run verify` reached the test stage clean and the three gates were then run individually:
**275 test files / 3,872 tests, all passing**, and all three balance gates **PASS at delta
`0.00000` on every metric**. The chain's own exit was 1 for the documented reason — three
`Timeout calling "onTaskUpdate"` unhandled errors raised *after* `Test Files 275 passed (275)`,
which is the `reference-long-run.test.ts` RPC-budget defect and not a test failure. No timeout was
raised to make anything green.

This is the attribution baseline: it reproduces round 2's committed figure exactly, so anything
that moves below moves because of a merge and not because of this worktree.

Golden fixture fingerprints, recorded here so every later merge can be checked cheaply:

    baa53d12…  engagement-transition.json
    0c6e4eee…  entity-churn.json
    3f039155…  world-time-only.json

### Merge 1 — `w18/instrument-repair` (`ce1403b`)

Merged clean, **no textual conflicts** — and then **failed verify**, which is a finding rather
than a hiccup.

**The interaction: W18's own `verify` green claim does not reproduce.** W18 made
`replicates % poolSize` a *refusal* rather than a warning, and added `TOY_FIXED_POOL` to
`packages/mc-harness/test/unit/fixtures.ts` for tests whose subject is scheduling rather than the
strategy pool. It migrated three call sites to it — `pool.test.ts` (replicates 1),
`storage.test.ts` (3), `reproduce-run.test.ts` (5). **`shard.test.ts` is the fourth and was
missed.** It is W11's file, W18's diff does not contain it, and W18's refusal is what rejects it,
so the failing combination exists on W18's branch as well as on the merge:

    Sweep toy-sweep is not valid and no run was dispatched:
      replicates is 1 against a round-robin pool of 2 strategies …

Resolved by finishing W18's own migration — the failing case wants exactly one task against four
shards, so the replicate count of 1 *is* the point of it, and the fixed pool is the honest fixture
by W18's own comment. **The invariant was not relaxed**, and no timeout or threshold was touched.

`npm run verify` **EXIT=0** after the fix. **277 test files / 3,918 tests, all passing**
(+2 files, +46 tests against baseline). All three gates **PASS at delta `0.00000` on every
metric**. **No golden changed** — all three fingerprints identical, and
`git diff origin/integration/campaign-round-2...HEAD -- packages/sim-core` is empty.

**What moved: nothing in the simulation, and the meaning of every score.** The scorer is not on
the rules path, which is why the gates are byte-identical. What changed is what the campaign's
numbers *say*:

- `replicates % poolSize !== 0` is **refused**, not warned.
- `exploitMargin` is now the **deliberate-strategy mean minus the worst of three probes**
  (`uniform-random-legal`, `idle-then-declare`, `permit-then-idle`), so it is no longer
  algebraically `ascensionRate − probeRate`. `EXPLOIT_MARGIN_MIN` 0.05 → **0.10**.
- The correlation term contributes only at **≥ 3 winners** (`CORRELATION_MIN_SUPPORT`), and
  contributes the **weaker** of Pearson and Spearman.

Demonstrated on committed run records (`mc-results/gate`, the ascension gate's own 32 runs):
**Pearson +0.9556, Spearman +0.5916, 1 winner of 8 — the term now contributes 0.** That single
line is what the repair does to every correlation this campaign has published.

### Merge 2 — `w22/knowledge-observability` (`81c125e`)

Merged clean, **no conflicts**. Verify was run **per stage**, because the chained run stopped at
the test stage under load.

**The failure was load, and it was checked rather than assumed.** Four test files timed out at
30 s — `god-loop`, `work-phase`, `world-step`, `raid-engagement` — none with an assertion failure,
all four with `Test timed out in 30000ms`. Two independent checks say this is the machine and not
the merge:

1. **Nothing in the rules path imports the census.** `grep` over `packages/coordination/src`,
   `packages/rules-*/src` and `packages/scenario/src` for `knowledgeCensus` returns nothing, so
   the projection cannot slow the step loop — it is a function that must be called, and the
   simulation never calls it.
2. **All four pass in isolation: 4 files / 39 tests, EXIT=0.** Measured while the machine reported
   **load average 216.5 across 126 node processes** — several other agents are working in this
   repository concurrently, which `CLAUDE.md` warns about by name. `reference-long-run.test.ts`
   took **332 s here against 161 s at merge 1**, the same test on the same tree, which is the
   clearest single indicator that the tree did not change speed.

**No timeout was raised**, and the four are reported as timed out rather than folded into a green
chain.

Stages, individually: typecheck, lint, purity, content, audio, coverage all pass; **279 test files
/ 3,948 tests** (275 passing + the 4 that pass in isolation); all three balance gates **PASS at
delta `0.00000` on every metric**; **no golden changed.**

**Both halves of the known W22/W24 interaction hold at this point:**

- `OBSERVATION_LAYOUT_DIGEST` **unmoved at `46182c35d829b205`** — and now pinned in *three* places
  that agree: `agent-api/test/unit/layout-digest.test.ts`, W22's new
  `agent-api/test/unit/knowledge-census.test.ts`, and `gym-bridge/python/tests/test_contract.py`.
- `SNAPSHOT_VERSION` **1**, `WORLD_SCHEMA_VERSION` **4** — both untouched, which is correct: W22
  adds no world state, so neither claim should move.

### Merge 3 — `w19/horizon-sweep` (`433b42d`)

Merged clean, **no conflicts**, and **touches nothing under `packages/`** — the whole diff is
`balance/sweeps/` (12 horizon specs), `tools/w15`, `tools/w19` and `docs/`. Verified anyway.

Same contention signature as merge 2, one notch smaller: **two** test files timed out at 30 s —
`god-loop` and `work-phase` — with no assertion failure, and **both pass on re-run** alongside
`module-boundaries` (3 files / 38 tests, EXIT=0) while the machine reported **load average 243**.
No timeout was raised.

Stages, individually: typecheck, lint, purity, content, audio, coverage pass; **279 test files /
3,948 tests**; all three balance gates **PASS at delta `0.00000` on every metric**; **no golden
changed**.

**W19's own status is worth carrying forward, because it is not "done".** Its plan doc and
`docs/design/horizon-sweep.md` both still read *"In flight"*: the production-arm numbers are final
and are what the branch is merged for — the 2400 arm reproduces integration round 2's
`ascensionRate` **0.1950** exactly — but the local composition arms had not landed. Nothing here
depends on them.

### Interlude — the `@mm/rules-raid` declaration (`babe2d8`) and the §5 record

Fixed out of order because it was raised mid-round against this branch. Recorded above under
*"packaging, not policy"*: the `ALLOWED` table and §5's grant were both already in place, and only
the dependency and the project reference were missing.

The §5 *record* was then written after all — not as a fifth deviation, which would misstate the
spec, but as a paragraph appended to the **existing** `scenario` deviation, saying that the grant
has now been cashed for the first time and, more usefully, **why it is safe in a way a future
package will not automatically inherit**: `scenario` may reach the raid engine because `scenario`
is a leaf that nothing imports, so an edge out of it can neither create a cycle nor drag combat
code into a client bundle. That is the sentence that stops the next person widening the table for a
package that is not a leaf.

`module-boundaries.test.ts` (18 tests) and `schema-doc-agreement.test.ts` (42 tests — it parses
`contracts.md` §2) both pass after the edit.

### Merge 4 — `w24/university-siting` (`54dc0f8`)

Merged clean, **no conflicts** — the first behavioural merge of the round.

**Both halves of the W22 × W24 interaction hold, and the two version constants behave exactly as
`CLAUDE.md` requires:**

- `WORLD_SCHEMA_VERSION` **4 → 5**, with `addTerritorySiting` appended and a migration test — a
  state-shape claim, correctly revised.
- `SNAPSHOT_VERSION` **1, untouched** — the replay/determinism claim, correctly not revised. This
  is the distinction that matters: a snapshot-version bump would fail every golden with a version
  error instead of a behaviour diff.
- `OBSERVATION_LAYOUT_DIGEST` **unmoved at `46182c35d829b205`** — W22's inertness survives W24's
  contract revision.
- **No golden changed**, and `packages/sim-core` is still byte-identical to round 2.

Same contention signature: the same **two** files timed out at 30 s, **both pass on re-run**
(2 files / 20 tests, EXIT=0) at **load average 248**. Stages otherwise pass; **281 test files /
3,977 tests**.

**The gates PASS at delta `0.00000` — which needs explaining, because a behavioural merge should
have refused them on provenance.** W24 regenerated all three baselines on its own branch and
shipped them with a full rationale, so the baselines in this tree already describe this tree.
`contentRevision` moved `a622452a…` → **`5be75547…`**, because every `territory.json` record gained
`libraryUpkeepMultiplier`.

W24's own rationale is worth carrying into the end-of-round regeneration, because it identifies the
mechanism rather than just reporting movement: against the superseded baselines **29 of 30 figures
were inside tolerance**, and the movement is **RNG re-keying, not a rule change** — the world step
now materializes five `territory-holding` entities on the first tick, entity handles are what
`deriveActorStream` keys on (§6), so every later entity draws from a different per-actor stream.
The siting arithmetic is exactly neutral in these three gates by construction: the reference
academy sits at the documented default, `arable-lowland`, whose capacity and upkeep multipliers are
both `fp(1024)`.

The one figure that did *not* fit: `referencePeakPopulation` on the horizon gate, **353 → 365 at
3.02 SE against a tolerance of 3.00** — a hair over, on a max statistic, in the same direction as
the noise everywhere else. Recorded rather than absorbed.

### Merge 5 — `w21/timing-and-envelopes` (`faa9b3d`, `6d59587`)

**Ten conflicts.** The one that mattered was semantic rather than textual.

**Two revision 5s cannot both exist.** W21 and W24 were both cut from a revision-4 tree, neither
contained the other, and each appended its own `from: 4, to: 5` migration — `addBarPhase` and
`addTerritorySiting`. Merging them literally would have produced two different definitions of one
revision, and the revision number is precisely what a migration step is keyed on. **W21's step was
renumbered to 5 → 6 and `WORLD_SCHEMA_VERSION` taken to 6.** That is a renumbering *before* either
shipped, which is the only moment it is safe: no snapshot in existence carries `bar-phase`, so no
save can be keyed to the revision it used to claim.

`worldSchemaVersionOf` needed the same care and git got it wrong: the auto-merge placed the
`BAR_PHASE` test *after* `TERRITORY_HOLDING` and returning **5**, which would have read every
current snapshot as one revision behind and run a migration over saves already up to date. Newest
marker first, returning 6.

`WORLD_COMPONENTS` orders the siting pair before `bar-phase`, in revision order, so a migrated
revision-4 envelope is byte-identical to one this build writes from scratch.

**`SNAPSHOT_VERSION` stays 1**, and the three golden fixtures are byte-identical. The pin that
asserts the two are different numbers now reads 1 and 6 — six world-schema revisions have shipped
and the container format has never moved.

**`contentRevision` is a fourth value: `5a2a97df2d263e4a629aa2a5f3037020`** — neither W24's
`5be75547…` nor W21's `d89d4eef…`, for exactly the reason W6, W8 and W17 each recorded a different
successor to `2512ea02`. Both narratives are kept in `interning.test.ts`.

**`packages/sim-core` zero diff against round 2 is sustained** — W21's branch claim survives the
merge.

#### The W21 × W24 interaction, which is the thing neither branch could see

**`reference-time-to-tier` 9.9 fired, and it fired *upward*.** W21 lost orc's separation from elf
to its research envelopes, recorded that as a loss, and pinned `orc.high >= elf.low` *"in the form
that will reopen this box the day it separates again"*. It separated again on the merge:

| species | w17 (flat) | W21 alone | **W21 + W24** |
|---|---|---|---|
| gnome | [19, 20] | [19, 20] | **[20, 20]** |
| dwarf | [21, 25] | [21, 27] | **[21, 27]** |
| orc | [21, 27] | **[21, 37]** | **[21, 29]** |
| human | [26, 37] | [26, 39] | **[27, 35]** |
| elf | [35, 58] | [37, 60] | **[36, 58]** |
| draconic | [26, 380] | [26, 298] | **[24, 282]** |

Orc's slowest seed goes **37 → 29** against an elf floor of 36, so the whole fast trio clears elf
and the three-band separation is back. The mechanism is W24's, and it is the same one that moved
its gate baselines: five `territory-holding` entities on the first world tick shift every later
handle, and `deriveActorStream` keys on the handle (§6).

**This is a fact about the instrument, not good news about the game.** Nothing made a species better
at magic. A six-seed interval moved because the RNG was re-keyed and happened to move the way task
9.9 wants. **Orc's separation from elf is inside the noise of an entity-allocation change** — a
weaker claim than either branch made alone, and the reason the combined tree is the only place
either could be checked.

The other composed conflict: `reference-long-run`'s 9.5 teaching pin had been relaxed by **both**
branches, each for its own mechanism and each reporting the pin was already a knife edge. W21's
form is kept because it is strictly stronger — *"first eight windows without exception, nine of ten
alive"* implies W24's *"at most one silent"* and adds where the hole may be.

**The gates now refuse on provenance**, which is the expected regime change and not a metric
movement: `contentHash` is `5a2a97df…` and the baselines were recorded at `5be75547…`. Underneath
the refusal **every metric is inside tolerance** — at 600 ticks `referenceNodesKnown` +0.22
(2.09 SE) is the largest single move, and on the ascension gate `referenceNodesKnown` and
`referenceNodesGained` are both delta `0.00000`. W21 on top of W24 is a small effect on the
reference universe.

Verify: **285 test files / 4,036 tests**, with three of the four named failures being the usual 30 s
load timeouts and the fourth being 9.9 above; all four pass on re-run (4 files / 31 tests, EXIT=0).
**No golden changed.**

### Merge 6 — `w25/spec-refresh` (`5306852`)

Merged clean, **no conflicts**. Documentation only: `vision.md` §11 reconciled with `openspec list`,
§8/§8a/§8b reframed around elimination being intended rather than a griefing surface, §7a's
place-as-relationship boundary drawn where W24 put it, and the §4 perception-trunk finding recorded.

**The check the brief asked for.** `vision.md` has **zero runtime parsers**, so nothing there can
break by construction. Ten tests parse `contracts.md`, and W21, W24 and this round's own §5 edit all
touched that document, so they were run explicitly rather than trusted: **10 files / 150 tests, all
pass** — `schema-doc-agreement`, `primitive-contract`, `tradition-hooks`, `god-conformance`,
`metrics-registry`, `pinned-constants-doc`, `ablation-conformance`, `pre-0-5-0-claim-check`,
`species-contract-conformance`, `rng-registry-append-only`.

### Merge 7 — `origin/main` (`6ef64c2`)

**Fifteen conflicts, and they are content-equivalence checks rather than choices** — except in three
places where `main` is behind this branch.

`main` merged `w17/value-sensitive-acquirer` as real commits while this round was in flight. Round 2
had **squash-merged** the same work (`4f70acd`) to keep ~60k lines of `.w17/` sweep JSON out of a
public repository, and a squash leaves no ancestry, so git reports 21 missing commits and conflicts
on every file W17 touched while the content is already here. `main` carries **zero** files under
`.w17/`, so the exclusion held on both sides.

**`autonomy.ts` is a defect in `main`, and it is the sharpest finding of this merge.** The two sides
differ in exactly one line. The runtime key is identical — both join role and primitive with U+0000,
which is load-bearing, since without it `role:"ab",primitive:"c"` would collide with
`role:"a",primitive:"bc"`. Ours spells the separator as the escape; **`main` embeds the literal
control character**, so git classifies the file as binary and it cannot be diffed or reviewed. Byte
counts settle it: ours 11,432 with **zero** NULs, main's 11,427 with **exactly one**. Round 2 fixed
this and `main` reintroduced it. Taking ours is behaviour-preserving and is the fix.

Other resolutions: `reference-universe.ts` and `long-run.ts` keep **W13's `tradition` content id** and
drop `main`'s ordinal `traditionIndex`, which is round 2's decision reaffirmed — an ordinal *"would
move the day a tradition is added"*, and this campaign's most-cited defect is that the reference
tradition was True Naming by accident of the alphabet. `shipped-content.test.ts` keeps 46 raid
constants against main's 39. `types.ts`, `index.ts`, `gateway.ts`, `world-step.ts` and
`content-set.ts` are ours-only W21 additions main has never seen; `content-set.ts` was verified
**byte-identical to `:2:`** after resolution, because a stray marker had to be removed by hand.

`contentRevision` **unmoved** at `5a2a97df…` — main brought no content-data change. Goldens
byte-identical. `npm install` kept `@mm/rules-raid` in the lock.

**A note on authorship of this commit.** The orchestrator committed the staged tree while this agent
was believed terminated, recording that no resolution decision was made there. That is accurate —
every resolution above is this agent's, verified after the fact: `autonomy.ts` NUL-free at 11,432
bytes, no `traditionIndex` in `packages/scenario/src`, `raidConstants: 46`,
`WORLD_SCHEMA_VERSION` 6, `SNAPSHOT_VERSION` 1.

### The single baseline regeneration (`d1d3140`)

Once, after all seven merges, never mid-sequence, one rationale written into all three files.

**`npm run verify` on the final tree: 285 test files / 4,038 tests, ALL PASS** — no timeouts at all
on this run, which is itself evidence that every earlier timeout was contention. The three gates then
refused on provenance (`contentHash` `5a2a97df…` against baselines recorded at `5be75547…`), which is
precisely what the single regeneration exists to clear. After regenerating: **all three gates PASS at
delta `0.00000` on every metric.**

**Not one figure in any of the three gates was outside tolerance before regeneration.** The reason
they were invalid is provenance, not movement.
