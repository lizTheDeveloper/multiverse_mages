
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
