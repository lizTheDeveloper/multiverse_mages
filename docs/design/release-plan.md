# Multiverse Mages — Release Plan

*Version numbers, release boundaries, and the claim each release makes. A claim that cannot be
proven wrong is not a claim — it is activity that sounds like progress. Every entry below states
the measurement that would disprove it, and whether that measurement is actually collected yet.*

---

## Versioning scheme

`MAJOR.MINOR.PATCH`, answering one question: **does anything that worked before stop working?**

**Pre-1.0** — the contracts in `docs/design/contracts.md` are still moving. That is what `0.x`
means, and it is honest rather than sloppy.

- **MINOR** — one roadmap milestone. May break contracts; every break is named explicitly in the
  release notes.
- **PATCH** — fixes and balance tuning between milestones. Never breaks a contract. Retuning a
  magnitude is a PATCH; changing a primitive's *unit* or *stacking rule* is a MINOR.

**At 1.0.0** the contracts freeze. From then on, a change to the agent API, the content schemas, or
the snapshot format is a MAJOR bump, because someone's trained agent, authored content, or saved
universe stops working.

**Tag every release.** A tag 150 commits behind what is live is not a rollback marker, it is a
decoration. If it is not tagged, it is not a rollback target, and we say so instead of pretending.

### Parity encodes balance validation — ADOPTED

**Even MINOR = balance-validated. Odd MINOR = in flight.**

Balance validation is the real quality gate on this project, so the version number itself says
whether you are looking at a line whose Monte Carlo baselines are green. `0.9.3` is a raid engine
nobody has proven terminates; `0.10.0` is one that survived ten thousand trials.

Three consequences, all deliberate:

1. **Every capability ships twice.** It lands on an odd MINOR, and it is *promoted* to the next
   even MINOR when its baselines are committed and green. The even release is earned, not
   scheduled. This is why the roadmap below has sixteen MINORs for ten changes.
2. **The gate is enforced in CI, not intended.** A release may only take an even MINOR if the
   balance-baseline job passes. A version scheme that relies on someone remembering is a version
   scheme that lies within a month.
3. **Parity is undefined below 0.5.0.** There is no harness before then, so nothing can be green.
   `0.2.0` and `0.4.0` are even and carry no validation claim, and saying so plainly is better than
   pretending the invariant holds where it cannot.

An even MINOR is therefore the honest answer to "is it safe to build on this?" — and the odd ones
stop being a source of false confidence.

---

## The measurement pivot

**Releases 0.1.0 through 0.4.0 can only make mechanical claims.** There is no balance harness until
0.5.0, so any claim about whether the game is *good* or *fair* before then is unverifiable — and an
unverifiable claim is worse than none, because it feels like rigour.

This is stated up front so nobody writes "improved knowledge economy" in the 0.3.0 notes. Until
0.5.0, claims are about determinism, correctness, and enforcement. After 0.5.0, they can be about
balance.

---

## Roadmap

| Version | Change | What it makes true | Parity |
|---|---|---|---|
| 0.1.0 | `sim-core-foundation` | The simulation is reproducible | n/a |
| 0.2.0 | `core-contracts` | Shared shapes are enforced, not agreed | n/a |
| 0.3.0 | `knowledge-model` | Magic and knowledge exist and can be lost | n/a |
| 0.4.0 | `mages-and-species` | A universe runs on its own | n/a |
| 0.5.0 | `agent-interface` | **The game becomes measurable** | in flight |
| 0.6.0 | — | **First validated line.** Baselines committed and green for knowledge and mages | validated |
| 0.7.0 | `god-agency` | The player has verbs | in flight |
| 0.8.0 | — | Worship loop proven not to run away | validated |
| 0.9.0 | `raid-engagement` | Universes can fight | in flight |
| 0.10.0 | — | Every raid terminates; arbitration never leaks | validated |
| 0.11.0 | `gym-bridge` | Machines can play | in flight |
| 0.12.0 | — | **Machine meta found**; baselines re-greened against learned agents | validated |
| 0.13.0 | `electron-client` | Humans can play | in flight |
| 0.14.0 | — | First playtest cohort completes without balance regression | validated |
| 0.15.0 | `pvp-server` | Humans can play each other | in flight |
| 0.16.0 | — | Zero desyncs; prestige does not decide matches | validated |
| 1.0.0 | — | Contracts freeze; public release | validated |

The even releases carry no new capability. That is the point — they are the moment the previous
odd release stops being a promise. **0.12.0 is the most important one in the plan**: it is where
learned agents have played enough to expose strategies the scripted bots could not, and the
baselines have been re-established against them. Shipping a client before that is shipping a game
whose meta nobody has looked for.

### Reordering — adopted

The RL bridge now ships **before** the Electron client. Machines discover the meta, *then* humans
discover the human meta. Shipping the client first would make human playtesters the primary balance
signal by default, which is precisely the outcome the balance-first methodology exists to avoid.

Cost: the first human playtest slips. That is the intended trade, and it is the whole reason the
project was structured balance-first in the first place.

---

## Claims per release

### 0.1.0 — `sim-core-foundation`

**Claim:** The same seed and action log produce a byte-identical final snapshot hash across
processes, across machines, and across two Node majors.

- *Disproved by:* any golden fixture whose final hash differs between CI runs or between the pinned
  Node 22 job and the next-major job.
- *Collected:* **yes** — this release builds the golden-replay suite.

**Claim:** The simulation sustains at least N entity-updates per second headless, where N is
recorded, not asserted in advance.

- *Disproved by:* a benchmark run below the recorded figure on comparable hardware.
- *Collected:* **yes** — the benchmark harness ships in this release. The number is an *output* of
  0.1.0, and every later population claim is bounded by it.

### 0.2.0 — `core-contracts`

**Claim:** No content record is ever silently skipped. Every schema violation fails the load and
names its file path and JSON pointer.

- *Disproved by:* a fixture seeded with *k* violations where the validator reports fewer than *k*,
  or where a load partially succeeds.
- *Collected:* **yes**.

**Claim:** Ruleset legality is computed in exactly one place.

- *Disproved by:* the conformance check finding any direct technique/form bitmask evaluation
  outside `permits()`. Expected count: zero.
- *Collected:* **yes**.

### 0.3.0 — `knowledge-model`

**Claim:** A node ceases to exist in a universe when its last instance is destroyed, and
rediscovering it costs at least 3× its original research cost.

- *Disproved by:* a scenario test where a node remains learnable after its last instance is
  destroyed, or where rediscovery completes below the multiplier.
- *Collected:* **yes**, by deterministic scenario tests.

**Claim:** Each of the three v1 traditions changes measurable behaviour through its declared hook,
and through no other path.

- *Disproved by:* two traditions producing identical outcomes on a scenario that should
  distinguish them, or a tradition altering behaviour outside its four hooks.
- *Collected:* **yes**.

**Explicitly not claimed:** that any of this is *balanced*. Not measurable until 0.5.0.

### 0.4.0 — `mages-and-species`

**Claim:** A universe seeded with all six species and receiving zero player input runs 200 world-
years without population collapse to zero or unbounded growth.

- *Disproved by:* a long-run test where any species' population hits zero, or where total
  population exceeds the documented bound.
- *Collected:* **yes** — a deterministic long-run test, no harness required.

**Claim:** Species differentiate measurably: time-to-tier differs between species by more than
noise on identical seeds.

- *Disproved by:* two species reaching the same tier within a negligible tick difference across
  seeds.
- *Collected:* **yes**, as a deterministic test. Whether the differences are *interesting* is a
  0.5.0 question.

### 0.5.0 — `agent-interface` — the pivot

Promoted to **0.6.0**, the first validated line, when baselines for `knowledge-model` and `mages-and-species` are committed and green.

**Claim:** Ten thousand headless runs complete within the recorded time budget on eight workers,
and every metric in `contracts.md` §7 is reported for every run.

- *Disproved by:* a sweep exceeding the budget, or any run missing a metric.
- *Collected:* **yes** — this release builds the collection.

**Claim:** Monte Carlo results are reproducible: the same sweep configuration and root seed produce
identical aggregate metrics.

- *Disproved by:* two identical sweeps producing differing metrics.
- *Collected:* **yes**.

### 0.7.0 — `god-agency`

**First release that can make a balance claim.** Promoted to **0.8.0** when both claims below hold across a full sweep.

**Claim:** No scripted god strategy in the bot pool exceeds a 65% win rate against the pool.

- *Disproved by:* a tournament sweep where any strategy exceeds it.
- *Collected:* **yes**, via 0.5.0.

**Claim:** The worship loop does not run away — `worshipSnowball` stays below its threshold across
the sweep.

- *Disproved by:* the Gini coefficient exceeding threshold at any measured tick count.
- *Collected:* **yes**. This is the specific risk flagged in vision §6a and §7, and this is where
  it stops being a worry and becomes a number.

### 0.9.0 — `raid-engagement`

Promoted to **0.10.0** when all three claims below hold across 10,000 raids.

**Claim:** Every raid terminates. Across 10,000 Monte Carlo raids, zero exceed portal stability.

- *Disproved by:* a single non-terminating raid.
- *Collected:* **yes**.

**Claim:** Host-ruleset arbitration is absolute — a spell forbidden in the host universe never
resolves there. Expected occurrences across 10,000 raids: zero.

- *Disproved by:* one occurrence.
- *Collected:* **yes**. This is the game's load-bearing rule; it deserves the strictest claim in
  the plan.

**Claim:** Knowledge loss from raids is real but not catastrophic — `libraryDependence` stays within
its band.

- *Disproved by:* the metric leaving the band.
- *Collected:* **yes**.

### 0.11.0 — `gym-bridge`

Promoted to **0.12.0** when learned agents have played enough to expose strategies the scripted pool could not, and baselines have been re-established against them.

**Claim:** The Python bridge sustains the recorded observation/action throughput and reproduces a
recorded episode exactly.

- *Disproved by:* throughput below the recorded figure, or a replayed episode diverging.
- *Collected:* **yes**.

**Not claimed:** that a trained agent achieves anything in particular. Training outcomes are
research, not a release promise, and putting them in release notes would be the exact failure this
document exists to prevent.

### 0.13.0 — `electron-client` — first human cohort

Promoted to **0.14.0** when a playtest cohort completes without a balance regression.

**Claim:** A new player reaches their first granted founding knowledge without external
instruction.

- *Disproved by:* observed playtest sessions where players do not.
- *Collected:* **NO.** There is no telemetry. This is the first claim in the plan that cannot be
  automatically verified, and it must not be dressed up as though it can. Either instrument the
  client before this release — see the `wire-telemetry` skill — or state plainly that the claim
  rests on a handful of observed sessions.

**Claim:** The client computes no rules — its displayed state always matches a server snapshot
hash.

- *Disproved by:* any divergence between client-displayed state and the authoritative snapshot.
- *Collected:* **yes**, automatable.

### 0.15.0 — `pvp-server`

Promoted to **0.16.0** when both claims below hold.

**Claim:** Zero desyncs. Across 1,000 automated matches, both clients produce identical final
snapshot hashes.

- *Disproved by:* one mismatch.
- *Collected:* **yes** — an automated match harness. This claim is only meaningful because 0.1.0
  established determinism; it is the payoff for that constraint.

**Claim:** Prestige does not decide matches — `prestigeAdvantage` stays under 60%.

- *Disproved by:* the metric exceeding it.
- *Collected:* **yes**.

### 1.0.0 — contracts freeze

**Claim:** No breaking change to the agent API, content schemas, or snapshot format ships without a
MAJOR bump.

- *Disproved by:* a contract-diff test against the 1.0.0 baseline failing on a non-MAJOR release.
- *Collected:* build the contract-diff test as part of 1.0.0. It is the machinery that makes the
  promise enforceable rather than aspirational.

---

## Cohorts

Pre-1.0 there are no users, so releases ship on milestone boundaries.

From **0.13.0** there are playtesters, and they become the release boundary: each playtest wave is a
cohort, and a cohort experiences one version. This gives a sentence that means something to a human
— "everyone in wave 3 played 0.13.2" — which is also the unit for judging whether a change helped.

Post-1.0, cohorts are players who onboarded in a given window.

---

## Regressions

When something worked and no longer does: **do not read code first.** Establish the last version
where it worked, bisect to the commit that changed the behaviour, and only then explain it. The
intuitive cause is frequently wrong, and reading code confirms whatever you already suspect.

For balance regressions specifically, the committed Monte Carlo baselines make this concrete: a
metric that moved beyond tolerance names both the release and the metric before anyone opens an
editor.

---

## Related skills

- `release-process` — how code gets from a branch to production
- `verify-release` — the human test plan for a release, required from 0.13.0
- `wire-telemetry` — needed before 0.13.0's onboarding claim is verifiable
- `detect-drift` — whether these docs still match the code
