# Baseline decisions waiting, as of 2026-08-14

**Measured on `origin/main` at `cc20d54` and on each PR's own head. Dated because a measurement is a
statement about the tree it was taken on** — if you are reading this after those refs moved, re-run
before acting.

`CLAUDE.md` reserves re-baselining for the repository owner, so six branches are sitting on it. They
are not equally hard. **Three are mechanical** — an agent ran the discriminating control and the
movement is provably not about balance — **and three are genuine judgements about the game.** This
page separates them so the easy ones do not queue behind the hard ones.

Nothing here has been regenerated. Every number below was *reported* by the branch that found it.

---

## The mechanical three

Each of these fails a gate for a reason that is **structural, not behavioural**, and the evidence for
that is a control someone actually ran.

### #72 — the opening square  ·  **LANDED 2026-08-14 as `672066f`. Kept for the record; not a pending decision.**

**Corrections to what this section said while it was pending, both found in the merge:**

- It said *"every metric passes at delta `0.00000`."* True against **pristine `origin/main`** — 109 of
  109 rows byte-identical, reproduced in a second detached worktree. **Not** true against the
  superseded files: **92 of 109**, with 73 of 90 on the agency gate.
- The 17 that differ are **`main`'s own drift.** `main`'s committed agency baseline was already 17 rows
  stale against `main`'s head before anyone touched this branch, passing within tolerance at largest
  −1.44 SE. **The next branch that has to refresh a hash will hit the same 17 rows and it will look
  like theirs.**
- A **fourth** file had to change: `balance/README.md`. `gate-power.test.ts` recomputes every
  power-table cell from the committed baselines, so derived data is bound to them by a test. That is
  the tripwire working, not a second re-baseline.

**Original entry, unedited:**

- `verify:nosweeps` **exit 0, 4,402/4,402**.
- All three gates fail on **one line each**: `provenance.rngRegistryHash`. **Every metric passes at
  delta `0.00000`.**
- Cause: appending `openingSquare: 12` changes `canonicalHash(RNG_STREAM)`, and `gate.ts` treats that
  key as a block-level refusal. **A hash cannot distinguish "appended" from "renumbered"** — that is
  the real finding, and it will recur on every future stream addition.
- *Recommendation:* accept, or fix the baseline format so an appended stream is distinguishable from
  a renumbered one. The second is the better long-term answer and is its own change.

### #125 — universities become institutions

- **4,411/4,411 tests pass.** `balance:gate` and `balance:gate:horizon` pass; only
  `balance:gate:agency` regresses, 7 rows against `toleranceK = 3`.
- **The discriminating control was run**: keep the link entities, revert only the scribing rule — and
  it **reproduces the treatment exactly, metric for metric**. So none of the movement comes from
  universities owning their staff. **All of it is entity-handle re-allocation.**
- *Recommendation:* accept. This is a consequence of entity numbering, not of the mechanic.

### #126 — alliances

- Three gates regenerated **provenance-only against its own merge base** `ebe4fb4`: **0 of 109 metric
  rows moved**, verified independently against that base rather than against today's `main`.
- **But the branch is far behind**, and `main` has since taken #127. A rebase makes this a **real**
  re-baseline against a base whose numbers genuinely differ.
- **Measured what the rebase would cost** (2026-08-14, `origin/main` at `954da94`): the branch's
  three baselines differ from `main`'s in **103 of 109 rows**, and all three `contentHash`es differ.
  **That movement is `main`'s, not the branch's** — `main` has taken #127 and #132 since `ebe4fb4`,
  and the branch's files still carry `ebe4fb4`-era values.
- So a textual rebase cannot settle this: whichever side wins silently decides the baseline, which is
  the `package-lock.json` hazard in a file where it matters far more.
- **A prediction that would make the decision small.** The alliance branch adds a god verb (action
  16). If no strategy in the gate pool exercises it, a re-run on the rebased tree should reproduce
  `main`'s values exactly, and the regeneration would again be **provenance-only** — the same result
  it had against its own base. If instead the values move, the verb *is* being exercised and the
  movement is the finding.
- *Recommendation:* **rebase, re-run the three gates, and report.** Do not accept the current files —
  they are provenance-only against a base that no longer exists. Cost is one gate cycle (~35 min for
  the 200-year one), and it converts this from an unanswerable question into a one-line answer.

---

## The three that are actually about the game

### #134 — affiliation completion  ·  *the founding defect, closed*

- **Affiliated share: all-six `0.0077 → 0.7226`; human `0.0003 → 0.9991`.** Grimoires per living mage
  at 5 years **2.34 → 10.28**.
- **The loss channel is damped for the first time**: the two arms that were *forgetting faster than
  they learned* (−4.875, −3.250 nodes in the final quarter) are now near flat.
- Cost: all three gates `baseline-invalid` (`contentHash` moved with two new weights), and **9 pinned
  observations moved across 7 files**.
- **The part that needs your eye:** at 200 years it is genuinely mixed. Human, orc, gnome and all-six
  rise (inside SE), but **dwarf falls 79% (~4 SE) while its population doubles**, elf −43%, draconic
  −28%. The author's hypothesis — flagged unproven — is `applyLibraryUpkeep`, **newly reached rather
  than newly written**, because this is the first build to keep a library deep enough to owe upkeep it
  cannot pay.
- *Recommendation:* accept the change; the defect it closes is the one this campaign exists for. The
  dwarf regression is a separate investigation and should be opened as one rather than blocking this.

### #140 — scholarship moves the academic primitives  ·  *no content change*

- `check:consumption` **10 failures → 7**. Behaviour: research **+30.6%**, distinct nodes retained
  **+39.4%**, grimoires **+43.4%**. Ablation-attributed: research +30.4%, scribe +32.1%.
- **`contentRevision` byte-identical.** Only `snapshotHash` moved.
- Gate movement: `referenceNodesGained` and `referenceNodesKnown` **+44.54 SE**,
  `referenceKnowledgeInstances` +29.13 SE — with **population flat at +0.04 SE as a control**, which
  is what says this is the intended channel and not a population artifact.
- **Its species claim is now REFUTED, and this replaces the "on notice" wording that was here
  earlier.** Measured in #143 over 12 independent seed sets: the four-species chain
  `gnome < dwarf < human < elf` holds in **1 of 12**. Links: `gnome < dwarf` 4/12, `dwarf < human`
  3/12, `human < elf` 12/12. On `main` the chain holds **0/12**, and its one robust link was
  **already established on `main` at 64.7 SE**. The branch also *loses* `orc < elf`, 11/12 → 0/12.
- It is **not a measurement error** — #140's published table reproduces to the tick, as does
  `main`'s. The same four relations separate robustly before and after. **Task 9.9 is unmet on both
  refs and this branch did not move it.**
- *Recommendation:* **accept, on the effect sizes only.** Research +30.6%, nodes retained +39.4%,
  grimoires +43.4%, population flat at +0.04 SE as a control — those are far outside noise and they
  are about *knowledge*, which is what the change is for. **Do not quote the four-species ordering at
  all.**

### #137 — all seventy cells  ·  *hold*

- 51 reachable nodes → **300**; `check:content` clean over all of them. Affinity liveness **4/11 →
  11/11**, and both new sole-occupant cells are affinity-predicted.
- **And the differentiation metrics went the wrong way.** Occupancy Gini **0.0714 → 0.0436**;
  time-to-tier separations **7 of 15 pairs → 4**. Six times the content, *less* distinguishable
  species.
- Two tests left red, correctly: looting lost its premise (`shelveForeignBooks` selects on
  `record.v1`, and there are no non-v1 cells left — **249 of 300 shelvable today, 0 of 300 under
  this**), and the 9.5 scribing tripwire fired.
- **#72 does not fix this**, contrary to what was said earlier and since measured:
  `resolveOpeningSquare`'s default returns `v1RulesetAxes(registry)` — the same flag — so #72 on top
  of #137 opens the whole grid too. `explicitOpeningAxes` exists and **has no caller**.
- **And it is worse than "made the metrics worse" — measured in #143 at `d6c32d0`, it destroys the
  measurement.** At 720 ticks every species is **~20× slower** to tier 3 and **human is censored in
  51 of 72 runs** (two whole seed sets never reach it). `gnome < elf` and `dwarf < elf` fall to 8/12,
  **`human < elf` reverses**, and `gnome < dwarf` is refuted outright at 0/12 — that one clean of
  censoring. Two relations survive at 10/10 and **must not be read as robust separations**: they are
  precisely the two reading the most censored species, so they are an artefact of where the run
  stopped.
- **Most numbers taken on this branch at this horizon are about truncation, not about species.**
  Uncensoring human would need ~2,400 ticks — about 20 minutes for twelve seed sets, and nobody has
  paid it.
- *Recommendation:* **hold.** It is the one change that made the stated goal worse; the companion that
  was supposed to rescue it does not, as shipped; and its own measurements are not trustworthy at the
  horizon anyone has run it at. What it needs is `explicitOpeningAxes` wired into the reference
  default — a design decision, not a merge.

---

## Landed since this page was written, and it changes one premise

**#144 — the combat primitives.** `check:consumption` **10 → 3**; all seven combat primitives closed,
leaving exactly #140's three. **109 of 109 baseline rows byte-identical**, measured against a second
worktree at pristine `origin/main` rather than argued. No baseline decision required.

**But read its headline before trusting any earlier consumption number**, including ones on this page.
Measured on unmodified `main` *before any change*: a warband holding four v1 `direct-damage` nodes put
**85,056 fp** on the field against a tier-matched academic warband's **0**. Combat magic already
worked. `check:consumption` reported **seven live consumers as absent** because `arbitration.ts` read
`registry.nodes` directly and the composition root's recorder never saw it.

So the check was blind, not the game — and it is the check I trusted most, because it was red and its
framing was well argued. **A confidently-wrong instrument reads exactly like a finding.**

One consequence to weigh: **`check:consumption` is not in `npm run verify`**, so nothing keeps those
seven closed. Adding it would turn `main` red while #140's three are outstanding, so the sequencing is
yours.

## Not a baseline decision, but the throughput blocker

**#138** — each `main` commit currently gets its own verification only if no other commit lands within
~40 minutes, because a **non-required** 35-minute balance-gate job shares the workflow's concurrency
group. GitHub keeps one pending run per group, so intermediate commits are **cancelled in the queue,
never run**. Three of `main`'s last eight runs were never verified.

It also corrects `docs/devops/ci-and-deploy.md`, which asserts *"`main` runs never cancel each other.
They serialise"* — the one property in that section whose stated purpose is preserving the release
record, and the one that did not hold.

*Recommendation:* take this first. Everything above merges at one commit per forty minutes until it
lands.

---

## The backlog, and the four PRs tonight made newly relevant

Nineteen PRs are open. Most are the campaign's backlog and several are hundreds of commits behind
`main` (`w19/horizon-sweep` 270, `w9/octalysis-and-mechanics` 335, `w3/ascension-routes` 345,
`integration/campaign-round-3` 215). Those need a rewrite-or-close decision on their own merits and
this page does not attempt one.

**But four of them are answers to questions tonight raised, and none was written with that in mind.**

### #80 — `researchCost` varies within a tier

Its own finding: `researchCost` was `2048 << (tier - 1)` for all three hundred nodes — **six distinct
values across 300 nodes, not one deviating** — and `compareTargets` breaks cost ties on **node id**,
which `intern` assigned walking `node.json` **alphabetically**. So *"cheapest first"* has been
*"alphabetically first"*.

That is the mechanism underneath the cost problem tonight kept hitting from the other side: #140
measured `teachCost` at 512 against a teaching pair pushing 2048/tick, so **tiers 1–3 complete in one
month at any multiplier** — which is why `teach-rate` moved +0.2% while research moved +30.4%. A lever
wired correctly into a range where it cannot express itself. **#80 is the fix for that whole class**,
and it was open before anyone knew the class existed.

### #79 — an optional displacement cost on an effect

#145 found `displacement` is the **sole remaining entry** in `rules-raid`'s `UNIMPLEMENTED_CHANNELS`,
now carried honestly into `RaidObservation` instead of a hardcoded four-element list. #79 is about
displacement costs. Whether it closes that channel is worth ten minutes of someone's reading.

Its body also opens with *"the falsifying measurement was null by construction"* and the same
`+91.4 ± 135.1` figure #127 later reproduced independently — **two agents, days apart, arriving at the
same null and the same explanation.** That agreement is itself evidence.

### #75 — teaching stops at the institution  ·  *its blocker may have just been removed*

The owner asked for this directly: *"Teaching has no institutional boundary, so universities cannot
diverge — it should? can you investigate."*

It has been **held deliberately red on one test**: `reference-time-to-tier.test.ts:285`, because orc's
tier-3 interval moved `[24,31]` → `[24,52]` and crosses elf's low of 44.

**#143 retired every orc assertion from that file**, on the measurement that `orc < elf` holds in 11
of 12 seed sets and a file running one seed set cannot state a rate. So the assertion #75 is blocked
on **may no longer exist**. Stated as *may*: the branch carries its own 303-line copy against `main`'s
393, so the check is to merge `main` in and run that file — not to assume.

### #117 — metric reachability

*"For every registered metric, whether it can be made to move."* This is **step 1 of
`self-evolving-search.md`** — *"the guard, first, because it is the lesson of the entire campaign"* —
and it generalises `winRateByPrimitive`'s ablation from primitives to metrics.

Tonight is the argument for it. Four metrics were found publishing healthy constants they could not
move; `winRateByPrimitive` was honest but for a false reason; `combatActionEconomy` published a
**wrong explanation** for its own absence; and six §7 metrics turn out to have **no committed
measurement at all**. An autonomous optimiser pointed at any of them would have run forever reporting
progress.

**Of everything in the backlog, this is the one whose value tonight raised the most.**
