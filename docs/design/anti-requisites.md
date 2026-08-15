<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Anti-requisites — the first mechanic that costs the permissive strategy something

**Status: implemented and re-measured. First recorded 2026-08-14 on branch `anti-requisites`
against `main` @ `e2a15cf`; **re-measured 2026-08-14 on the merge of `main` @ `9cfe582`**, which is
the tree this page now describes.** `vision.md` is the vision of record; this implements §4b and closes
one of §13's open questions.

## The decision §13 left open

§4b fixes the rule — **per mage, reason-bearing, symmetric because the reason is, checked against
the mage's held set and never the universe's**. §13 left the content shape open:

> The content shape is also open: an anti-requisite is the mirror of a prerequisite and `node.json`
> has only the latter, so whether exclusion is authored on nodes, on cells, or on a **named school
> region** is undecided.

**It is cells**, and the third option was not a close call: no `school` entity exists anywhere in
`content` or `state`, so a named school region would invent a concept the codebase has never had.
Cells is also how §4b speaks — *"if you use light magic you can't also use dark magic"* is a claim
about bodies of magic, not about individual workings.

## What was built

### The content shape

`cell.json` gains an optional `excludes` array. Each entry carries `cell`, `reason`, and
`resolution`.

**`resolution` is authored per exclusion rather than fixed globally**, and that follows §4b's own
*"every exclusion carries its reason"*: if the reason varies, what happens should vary with it.

- **`refused`** — the acquisition never happens. A wall.
- **`destructive`** — the acquisition succeeds and destroys every instance of the excluded body of
  magic that mage holds. If hers was the universe's last copy, the node is *gone*.

### What the loader refuses

- **A one-sided edge.** The loader does **not** synthesise the mirror. The `reason` is the half that
  would be fabricated, and a generated mirror always looks symmetric while proving nothing.
- **Halves that disagree** on reason or on resolution. That is what a half-finished edit looks like,
  and taking either side would be a coin flip deciding whether a mage loses her holdings.
- **A cell excluding itself**, and **any `intellego` cell on either side** — §4b rules the
  perception trunk out, since excluding it costs a mage two-thirds of the grid rather than a school.

### Where enforcement lives, and the site that decided it

**Five** things put a node in a mage's head: a founding grant, research, teaching, scribing read
back, and **raid theft**. Four route through `CoordinatingKnowledgeGateway` — which is where a
frontier filter would naturally live. The fifth does not: `rules-raid`'s `consequences.ts` calls
`createInstance` directly into `LOCATION_KIND.mind`.

So a frontier-only check would be **launderable**: *steal the school you are forbidden*, and the
exclusion never fires. That is not an exotic edge case — it is a strategy, and one a learned agent
would find while a human reviewer read the filter and believed it.

The check therefore sits on **`createInstance`**, the one place all five converge, and the same
place `contracts.md` §1.5's ever-known write already sits for the same stated reason: *"first
instance is a fact about the index, not about which operation happened to produce it."*

**Only held locations are checked.** §4b excludes what a *mage* may hold; a library is an
institution, and a civilization keeping both books is exactly what §4b says a civilization is *for*.
Checking shelves would make the first authored exclusion start burning archives nobody learned from.

**One acquisition path is not covered, deliberately, and it is worth naming.** `raids.ts` resolves
`attacker = outbound ? local : rival`. The local participant's subsystem is built with the exclusion
resolver, so this universe is checked whenever it is the one acquiring — which is every outbound
raid, and it never acquires on an inbound one. The rival stand-in built by `rival-universe.ts` is
not, so a rival mage stealing on an *inbound* raid is unchecked. `buildRival` is called per raid and
its world is discarded when the portal closes, so nothing it acquires persists; what it can still
move is that one engagement's loot and the `RaidRecord` metrics derived from it. Wiring it is a
one-argument change and is left out of this branch on purpose, because it would alter the rival's
behaviour and this branch's whole claim is about which measurements moved.

### What ships

One pair: **`creo-ignem` ⊥ `creo-umbra`, `destructive`** — §4b's own example, and the pair
`content/deep-magic` authors nodes for.

**Authoring a pair was forced rather than chosen.** The plan was to ship the machinery with zero
pairs so no baseline moved. `schema-constraint-liveness` refused: it proves each schema constraint
by finding shipped content the constraint applies to, mutating it, and asserting the load fails *for
that reason*. A schema nothing instantiates cannot be proven live, and an unproven constraint is
precisely the decoration that file exists to catch. The meta-test was right and the plan was wrong.

## What it measured

`npm run test`, on the merged tree: **4,545 of 4,546 passing, 327 files, one failure** — and the
failure is a finding rather than a break. `ablation-reaches-the-world-loop.test.ts` runs
`permissive-breadth`, the one strategy this mechanic bites, and asserts as a coda that the ablated
arm's population *equals* the control's, so that the loss it measures reads as a loss rather than a
collapse. On this tree it reads 300 against 298. Both of that test's substantive assertions still
hold — the ablated arm still ends with strictly fewer knowledge instances and strictly fewer
grimoires — and the incidental equality does not. It is left failing rather than relaxed: whether
a two-mage divergence in a knock-on population is acceptable, or whether that assertion should
never have been an equality, is a call for the owner and not one to make inside a merge.

Two committed payloads were re-recorded rather than edited, both because `contentRevision` moved:

| payload | command | what moved |
|---|---|---|
| `ui/session.json` | `npm run ui:record` | `provenance.snapshotHash` `f6974848cef4578c` → `29770a4e48b7175b`, **and nothing else** — all 401 frames, the action log, the layout and the content block are identical. `contentRevision` sits in `SimState`'s hashed header, so the hash moves while the run does not. |
| `ui/design-dashboard/data.json` | `npm run ui:dashboard` | `provenance.contentRevision`, plus two `reachability.unreached[].line` numbers in `packages/rules-magic/src/grid.ts` (486 → 545, 137 → 175) — line drift from this branch's own edits to that file. Finding count, names and files are unchanged. |


All three balance gates reported `baseline-invalid` on `provenance.contentHash`
(`d4e3047657b4fa8a1a74e1d52f9f5c86 → e8442af2c5f91ae6f80ad9a178e0e451`) — correctly, since the
content did change. **All three were re-recorded on 2026-08-14 with the owner's authorisation**;
the deltas below are the measurements taken against the superseded baselines, immediately before
regenerating. `balance-gate-ascension-v1` was deliberately left alone: it refuses for an older and
unrelated reason (a superseded `rngRegistryHash` from PR #72), is already failing on `main`, and its
job is not required to merge.

**Byte-identity below is established by grepping for non-zero deltas, not by reading the pass
column.** The distinction is not pedantic: `referenceGrimoires@permissive-breadth` **passes** at
1.66 SE while moving **25.0**, so a pass column would have reported that row as unchanged.

### The reference gates: byte-identical

| gate | world ticks | runs | metrics | pair's contribution |
|---|--:|--:|--:|---|
| `balance-gate-v1` | 60 | 200 | 9 | **byte-identical** |
| `balance-gate-horizon-v1` | 240 | 200 | 10 | **byte-identical** |

**This table changed meaning when the branch was merged with `main` @ `be446a6` (PR #125), and the
earlier version of it is now wrong.** Before that merge, both reference gates were byte-identical at
every row against their committed baselines, and the table said so. On the merged tree they are
not: 8 of 9 rows move on the five-year gate and 10 of 10 on the twenty-year gate — all well inside
tolerance, both gates `PASS`, and **none of it is this branch's.**

That attribution is measured, not argued. #125 changed no content file, so `provenance.contentHash`
did not move for it and neither reference gate refused. What moved are values, and the pair
contributes **exactly zero** to them: stripping the two `excludes` arrays, rebuilding, and
re-running both sweeps reproduces **every current value byte-identically**. The residue is #125
re-rolling handle-keyed draws by allocating `UNIVERSITY_STAFF` link rows — `contracts.md` §6 splits
the RNG per entity handle — which is the same mechanism #125's own rationale gives for the
`denial-warden` arm lines.

So the claim the column now makes is the one that was always meant: **the pair is invisible to the
reference universe.** The earlier phrasing conflated that with "nothing moves", which was true on
the branch alone and is not true of the merged tree.

**Both horizons in this table were previously wrong, and the correction is worth stating rather
than making quietly.** The rows read `240` and `2400`; the committed sweeps
(`balance/sweeps/balance-gate.sweep.json`, `balance-gate-horizon.sweep.json`) set
`termination.worldTickCap` to **60** and **240**. The metric count on the first row was wrong too:
nine, not ten.

These are recorded as **two independent errors, not one mechanism.** The tempting summary is "every
label was shifted one rung up the ladder", and it does not survive the ladder: the gates run at
**60 / 240 / 240 / 2400**, so the five-year gate's label (240) is indeed the next rung, but the
twenty-year gate's (2400) is *two* rungs up — it borrowed the two-hundred-year gate's horizon,
skipping the agency gate at 240. A tidy explanation attached to a correct correction is the same
defect as the thing being corrected, so no explanation is offered beyond the two facts.

**The agency table below was not affected.** Its "240 world ticks, 64 runs" matches
`balance-gate-agency.sweep.json` exactly — `worldTickCap: 240`, four factor cells × 16 replicates.
So the headline **−26.50** is a twenty-year number and always was; it was not quoted at ten times
its horizon. What was mislabelled is the byte-identity table, where a wrong horizon weakens a claim
of *no* difference rather than inflating a claim of one.

Both halves of the shipped pair are `creo`, and the v1 rectangle is `intellego · perdo · rego` ×
`mentem · terram · limen · nomen`. The reference universe **cannot reach either cell**. The mechanic
is live and the reference run cannot see it — the claim, measured rather than asserted.

### The agency gate: the mechanic bites, and it bites exactly one strategy

The agency pool permits the full grid, so unlike the reference universe it *can* reach `creo`.

`referenceNodesKnown`, 240 world ticks, 64 runs:

| strategy | baseline | current | delta |
|---|--:|--:|--:|
| `portal-rush` | 44.88 | 44.88 | 0.00 |
| `uniform-random-legal` | 43.75 | 43.75 | 0.00 |
| `archivist` | 43.38 | 43.38 | 0.00 |
| **`permissive-breadth`** | 68.63 | **42.50** | **−26.13** (−20.80 SE) |
| `passive-control` | 41.25 | 41.25 | 0.00 |
| `worship-maximizer` | 40.13 | 40.13 | 0.00 |
| `narrow-depth` | 7.75 | 7.75 | 0.00 |
| `denial-warden` | 4.13 | 4.13 | 0.00 |

**Seven of eight strategies are byte-identical. The eighth loses 38% of its knowledge** — and the
rows are printed in the *new* order on purpose: `permissive-breadth` was first and is now fourth.

Byte-identity is the whole claim, so it is checked as one rather than read off the pass/fail column
— a row can pass a three-SE tolerance while moving (`referenceGrimoires@permissive-breadth` moved
+19.6 and passed at 1.27 SE). Counted exactly, on the run taken immediately before regenerating:
**71 of the gate's 90 rows are at `delta 0.00000`.** The 19 that moved are the **9 pooled
aggregates** and **all 10 `@permissive-breadth` arm rows**, and nothing else — so the other seven
strategies are byte-identical across **all 70 of their arm rows**, and the pooled aggregates move
only because they pool `permissive-breadth`.

The largest movements, all on that one arm: `referenceKnowledgeInstances` 1614.38 → 1013.00
(−27.04 SE, the largest in the file), `referenceNodesGainedFinalQuarter` 14.625 → 5.25 (−25.00 SE),
`referenceNodesKnown` and `referenceNodesGained` both −26.13 (−20.80 SE), and — moving *upward* —
`referenceGrimoires` +19.63 (1.27 SE, passing) and
`referencePeakPopulation` 330 → 340 (1.27 SE). That last one is worth noticing: the arm that
forgets the most ends with slightly *more* people, which is the same decoupling of knowledge from
demography that the ablation test's population floor documents.

**Why these numbers differ from the first recording, twice over.** The table above first read
75.25 → 45.00, −30.25, then 68.50 → 42.00, −26.50, and now 68.63 → 42.50, −26.13. **Nothing about
the mechanic changed at either step**; what changed was the baseline underneath it, because `main`
re-recorded this gate twice while the branch was open. `5a1ce6c` did it for `apply-magic`
(`permissive-breadth` 75.25 → 68.50, passive control 42.13 → 40.63), and PR #125
(`w108/university-fidelity`) did it again — that one is a pure re-roll of handle-keyed draws from
allocating `UNIVERSITY_STAFF` link rows, which is why every arm's *baseline* shifts slightly while
the *deltas* for seven of eight stay at exactly 0.00000.

That the shape survived is the check worth recording rather than the numbers: a competing
re-baseline could have moved other arms and turned this from a re-quote into a different finding.
It did not — the non-zero rows are the same 9 pooled aggregates and the same 10
`@permissive-breadth` arm rows before and after the merge.

This is the result the campaign has been asking for since W24, and it is worth stating precisely
because it is easy to overclaim. F3 measured the strategy space as **one axis — permit more vs
permit less** — with `permissive-breadth` strictly dominant (75.25 nodes against a 42-node passive
control when F3 measured it; 68.63 against 41.25 on this tree, after two later re-recordings moved the
baseline). `campaign-plan.md` records five independent confirmations that the binding constraint is
content exhaustion and *the absence of opposing terms*, and W24's rule: **"without an opposing term
siting is a ranking, not a decision."**

An anti-requisite is an opposing term, and it is aimed at exactly the strategy that had none.
Permitting everything no longer means *getting* everything: a mage who learns one side of an
exclusion loses the other, so a permissive god now has a composition problem where he previously had
a monotone accumulation. Measured, the dominant strategy's lead over the passive control falls from
**+27.4 nodes to +1.3**, and on this metric it stops being the leading strategy at all — three
others now finish ahead of it.

**One authored pair did that.** The set in `content/deep-magic` proposes more.

### What is not claimed

- **That the strategy space now has two axes.** It has one axis with a cost on one end. Whether a
  *different* strategy now wins is a tournament question, and the honest instrument is a round-robin
  at 2400 ticks, not this gate.
- **That −26.50 is the right magnitude.** It is one pair, `destructive`, on two cells with 9 nodes
  between them, at `tuningStatus: "untuned"`. A 40% loss may well be too harsh; it is a balance
  decision and the number to argue over is now measured rather than hypothetical.
- **That the reference universe is unaffected in principle.** It is unaffected *because both halves
  are `creo`*. Authoring a pair inside the v1 rectangle would move every baseline, which is a
  release-scope decision.

## Open, and the ruling is the author's

1. **Which schools exclude which.** §13's question, still open — this decides the *shape* and
   authors one pair as proof. §4b requires each to carry a reason that runs both ways, so the pairs
   are a content judgement, not a derivation.
2. **`refused` or `destructive`, per pair.** Both are implemented and only `destructive` is
   exercised by shipped content. A `refused` pair would ship with a different feel: no loss, but a
   permanent fork in what a mage can become.
3. **Whether teaching should refuse before the desk.** Enforcement is at acquisition; a mage can
   currently commit effort to a node that will be refused when it completes. A frontier filter is a
   pure optimization and is *not* in this branch — it was left out deliberately, because
   implementing it before measuring would have made the enforcement path look untested.

## Rebased onto `main` @ `9cfe582`, and one test went red

**Added 2026-08-14.** The branch was rebased from `e2a15cf` onto `9cfe582`, 53 commits later. Two
things came out of it, one procedural and one substantive.

### The content revision is a three-way union

`main` had meanwhile taken `apply-magic`'s two `autonomy-weight.json` scalars
(`162f80bf → d4e30476`). This branch had `162f80bf → ee99b584`. Neither literal is a digest over a
preimage holding both, so the union produces a third: **`e8442af2c5f91ae6f80ad9a178e0e451`**. That is
the situation `interning.test.ts` already documents twice, and both narratives are kept in the chain
rather than one replacing the other.

### `ablation-reaches-the-world-loop` fails, and it is this branch's doing

    expect(ablated.population).toBe(control.population)   // expected 300 to be 298

**Isolated by experiment, not inferred.** The test passes on clean `main` @ `9cfe582`. Removing only
the `excludes` array from the two cells — changing nothing else — makes it pass on this branch.
Restoring it makes it fail again.

**Why the reference gates did not see this.** Every measurement in the section above was taken
against the reference universe, whose ruleset is the v1 rectangle, and both halves of the pair are
`creo`. This test is different: it permits the **full grid**, so mages actually reach
`creo-ignem` and `creo-umbra` — nine authored nodes between them — and `destructive` fires for the
first time in a real run.

So the earlier claim in this document, *"the mechanic is live and the reference run cannot see it"*,
was true and incomplete. The honest statement is: **no run that plays only the v1 rectangle can see
it, and every run that permits the full grid can.** The ablation test is the first such run in the
suite, and it is what caught this.

**What it means, and the part that is genuinely open.** The test's own comment says the population
assertion exists so a difference reads as *"a loss the arm suffered rather than an arm that died"*.
Under `destructive`, losing a school of magic now propagates to population between two arms that
differ only in an ablated primitive — the two arms lose different mages' schools at different ticks,
and the demographic paths separate. That is the mechanic working; whether it should reach
**population** is a design question, not a bug to paper over.

Three possible readings were recorded, and the ruling was the author's:

1. **The mechanic is correct and the test's invariant is now too strong.** Two arms that diverge in
   knowledge will diverge in population once knowledge feeds the economy, which is what §6a wants.
2. **`destructive` is too harsh at this magnitude.** A `refused` pair would cost nothing
   demographically, and the shipped pair could be `refused` until the effects work lands.
3. **The pair should not ship on live cells at all.** But `schema-constraint-liveness` forces a
   shipped instance, so this trades one constraint for another.

### Ruling: reading 1, taken 2026-08-14 — and the measurement changed the reasoning

**Reading 1 was taken and the test was corrected.** The paragraph above no longer describes the
tree: the suite is green. But the argument that got there is *not* the one reading 1 states, and the
difference matters more than the ruling.

Reading 1 supposes the two arms' "demographic paths separate". **They do not.** Every primitive was
ablated in turn at 240 ticks against the same control (population 298, living mages 67, knowledge
3,190, grimoires 1,024). Six of the seven — `fertility`, `lifespan`, `research-rate`, `teach-rate`,
`scribe-rate`, `build-rate` — come back **byte-identical to the control**. Only `resource-yield`
moves anything, and what it moves is knowledge (−728) and grimoires (−726), not people: population
300, living mages 67.

Then the harshest available lever, far harsher than any ablation the suite can ask for:
substituting `0` for `FP_ONE` in `additive-into-multiplier` — the inversion `ablation.ts` warns
about at length, which multiplies the ablated arm's whole yield by zero. It costs **97 % of that
arm's grimoires** (1,024 → 31) and 31 % of its knowledge, and leaves population at **297 against
298** and living mages **unchanged at 67**.

So the finding is not "the mechanic now reaches population". It is that
**`expect(ablated.population).toBe(control.population)` never had any power to begin with.** It held
because population is very nearly decoupled from `resource-yield` at this horizon, not because the
two arms were demographically matched — and a two-mage knock-on was enough to break it. An equality
that passes for a reason unrelated to its claim is the same defect class as a test that stops at the
data structure, which is what the file's own comment says it exists to avoid.

**What replaced it**, in `packages/scenario/test/unit/ablation-reaches-the-world-loop.test.ts`:

- The two substantive assertions are untouched — the ablated arm ends with strictly fewer knowledge
  instances and strictly fewer grimoires, and the arms are not deeply equal.
- The population coda became a **one-sided floor** in its own `it`: the ablated arm may not finish
  below **95 %** of the control's population. One-sided because the observed drift is *upward* and an
  ablated arm with slightly more people is not the failure being guarded; the inverted-mask failure
  is already caught by the two `toBeLessThan` assertions, which a better-off arm cannot satisfy.
- **The floor is documented as a backstop, not as a discriminator.** The probe table above is in the
  test file, together with the plain statement that no ablation lever available moves population by
  more than 2 of 298, so nothing the test can do trips the floor today. It is kept because the
  yield→demography coupling is real at longer horizons — `gate-power.test.ts` records
  `referencePeakPopulation@permissive-breadth` moving 7,009 → 12,685 at the 2,400-tick gate "because
  applied food raises `K` hardest in the arm that permits the most cells" — and a line that costs
  nothing and would catch that coupling arriving at 240 ticks earns its place. A floor *presented as*
  discriminating between the arms would not have.

**The negative control is on the assertions that do have power**, since the floor demonstrably has
none here. The three `deps.ablation` forwarding sites in `coordination`'s `world-step.ts` —
`materialsProduced`, `advanceConstruction`, `appliedYield` — were severed, reproducing defect #136
exactly. The ablated arm goes byte-identical to the control, `not.toEqual` fails, and both
`toBeLessThan` assertions fail with `expected 3190 to be less than 3190`. Restoring the three lines
returns all six tests to green.

Readings 2 and 3 were **not** taken: the pair still ships on live cells with resolution
`destructive`, so `schema-constraint-liveness` still has the instance it needs.
