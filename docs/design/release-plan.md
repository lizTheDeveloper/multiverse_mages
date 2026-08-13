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

#### What "the balance-baseline job passes" names, concretely

Point 2 above is only enforceable if it names a command. It does:

> **An even MINOR requires `npm run verify:full` green, on the commit being tagged.**

`npm run verify` is *not* sufficient, and since 2026-08-13 it is deliberately not the same thing.
The merge gate runs the five-year, twenty-year and agency sweeps — about forty seconds — and the
**two-hundred-year gate is not among them**, because it costs 830 s on a quiet machine and 1154 s on
a busy one, and the self-hosted runner serialises against a 2400 s timeout. Held in `verify` it made
every unrelated pull request queue behind it; seven were stacked on that runner the day the split
landed. `balance/README.md` has the measurements and `balance-ci-wiring.test.ts` asserts the split
from both sides.

That gate is the one that measures the **win condition** — 0 of 400 runs ascend at twenty world
years and 46 of 64 at two hundred — so it is precisely the instrument that substantiates *"Monte
Carlo baselines committed and green"*. It runs on every commit in its own parallel GitHub Actions
job (**Balance gate, two hundred world years**) which is **not required to merge**, so a regression
is visible immediately without blocking unrelated work.

**Taking an even MINOR without that job green on the tagged commit is exactly the failure the parity
scheme exists to prevent.** The release checklist is therefore:

1. `npm run verify:full` green locally on the commit to be tagged, **or** the parallel
   **Balance gate, two hundred world years** job green on that commit in Actions. Either is
   sufficient; they run the same sweep against the same baseline.
2. Every gate baseline in `balance/baselines/` regenerated *only* with a rationale, per
   `balance/README.md`. A baseline regenerated to make a release go green is the thing the
   `contentHash` exists to catch.
3. The tag. An untagged release is not a rollback target.

A note for whoever next changes what `verify` runs: the number of gates in it has already been
wrong in three files' comments once. Say *which* gates run where rather than how many, so the
sentence cannot rot the next time one moves.

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

**Measured at 0.1.0:**

- Three golden fixtures — world time only, an engagement transition, heavy entity churn — replay to
  their recorded per-tick hashes. Verified across **three Node majors locally (20, 22, 26)**, not
  only the pinned one, and across separate processes. CI runs the pinned job as a gate and Node 24
  as a non-blocking early warning.
- The gate was proved to fire, twice and independently, by injecting nondeterminism and confirming
  every fixture failed while naming its diverging tick — and that a failing run rewrites no fixture.
- Throughput: 18-19 M entity-updates/sec, flat from 5,000 to 25,000 entities. Recorded in
  `vision.md` §13 with what it does and does not answer. (An earlier draft of this line said
  ~19.7 M, measured before the RNG and clock fixes landed — i.e. against a build that was not
  tagged. Re-measured against the shipped code.)

**Known limitation, stated rather than discovered later:** `npm run goldens:regen` requires Node 22
or newer, because it loads the core's TypeScript through native type stripping. The simulation
itself is unaffected — fixtures replay correctly on Node 20 — and `engines` pins Node 22 anyway,
but a contributor on an older Node will find the command, not the tests, is what fails.

### 0.2.0 — `core-contracts`

**Claim:** No content record is ever silently skipped. Every schema violation fails the load and
names its file path and JSON pointer.

- *Disproved by:* a fixture seeded with *k* violations where the validator reports fewer than *k*,
  or where a load partially succeeds.
- *Collected:* **yes**.

**Claim:** Ruleset legality is computed in exactly one place.

- *Disproved by:* the conformance check finding any **cell-scoped** technique/form bitmask
  evaluation outside `permits()`. Expected count: zero.
- *Collected:* **yes**.

*Refined during implementation, because the original count was zero only if you did not look.*
Two sites evaluate the bitmasks directly and both are correct: the legality mask asks whether
every technique is already permitted — a universe with everything forbidden but one live
dispensation has `permits()` returning true for that cell while "permit a technique" is still a
legal action, so saturation is a question about the raw axis and there is no cell to ask it about.
And the observation projects §4.1's ruleset block, which pins axis bits and edict slots as separate
fields so an agent learns the precedence itself; routing it through `permits()` would fold the
edicts in and change an exported contract every trained policy depends on. The rule is therefore
not "nobody may touch the bitmask" but "nobody may decide a *cell* from it", and the check draws
that line by shape rather than by a list of exempt filenames.

**Measured at 0.2.0:**

- Five records broken five ways produce five diagnostics with five distinct JSON pointers, and two
  different kinds of violation in two different files both survive to the report. Mutation-checked:
  truncating the reported diagnostics to the first turns both assertions red.
- The arbitration conformance check reports zero cell-scoped evaluations outside `permits()`, and
  is mutation-checked against a copied arbitration in `rules-magic`.
- 811 tests across 71 files; typecheck, lint, dependency-purity and content validation all gate CI.

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

**Contract break, named rather than absorbed: `contracts.md` §2.4.** The species record gains
`maturityMonths`, `mageAptitude` and `laborAffinity`, and `rediscoveryAffinity` gains a stated
direction — higher is better, applied as a **divisor**, with an `fp(3072)` floor on the effective
multiplier so that species affinity can never drive rediscovery below the 3× penalty 0.3.0 claims.
Any species file written against the old §2.4 fails to load. Three further breaks are recorded in
`contracts.md` itself and not repeated here: the `goal-commitment` and `effort-progress`
components, both against §1.2's promise that `state-schema` would be *"consumed unchanged"*, and
the `coordination` and `scenario` packages against §5's dependency diagram.

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

**Claim:** A 200-world-year run is deterministic end to end: two independent executions of the same
build, seed and starting position produce a byte-identical final snapshot hash.

- *Disproved by:* two executions of `runLongReference` disagreeing on `finalSnapshotHash`.
- *Collected:* **yes**. Added at closeout rather than planned, because 0.1.0's determinism claim is
  about `sim-core`'s substrate replaying an action log, and this is the different question the
  world loop can fail on its own: the loop keeps per-run mutable state — a report closure and a
  rediscovery clamp counter — that a shared instance would leak between runs, and 2,400 ticks of
  eight phases is where that would show.

**Measured at 0.4.0:**

- **The first claim holds, and the second is disproved.** Both are stated below with the numbers,
  because a claim recorded and then quietly not checked is worse than one never made.
- **No species is lost.** Over 2,400 ticks the per-species population floor is 26 / 27 / 27 / 27 /
  28 / 32 against 36 founded. Asserted at every tick rather than at checkpoints.
- **The population is bounded, and the bound is no longer vacuous.** Peak 18,722 against a
  documented bound of 109,800 — `maxCarryingCapacity` of the shipped `territory.json`, a function
  of content and of nothing that happens during a run. The tighter statement is asserted too: the
  population never exceeds `K` at any tick, and `K` *falls* through this run, from 57,205 at world
  year twenty to 29,831 at year two hundred, because the subsistence shortfall now reaches
  `carryingCapacity`. The gap between the two closes from a factor of 264 to a factor of 1.6, so
  the assertion is being asked a real question by the end of the run. It was not before: the
  `economy` spec's *"population never exceeds K"* passed vacuously for as long as `K` was derived
  from the materials the population produced.
- **The run is reproducible.** Two full 2,400-tick executions agree on the final snapshot hash
  (`c69e009ec85fd2a8` for the committed seed and starting position), and a different seed produces
  a different hash — the control, without which the equality would also hold for a run that ignored
  its seed.
- **The occupation mix does not oscillate.** The longest run of two-tick alternation over 2,400
  ticks is **2 ticks**, against a threshold of one world year.

**Disproved at 0.4.0 — species differentiation:** the claim's own disproof condition is met.
Time to a tier-2 mage, in world ticks, over eight seeds of a sixty-year run:

| Species | Observed interval | Censored |
|---|---|---|
| dwarf | `[17, 17]` | 0 |
| gnome | `[16, 17]` | 0 |
| human | `[17, 17]` | 0 |
| elf | `[20, 49]` | 0 |
| draconic | `[63, 548]` | 3 of 8 |
| orc | one seed at 316 | 7 of 8 |

Dwarf, gnome and human are **one band**, separated by at most one tick — which is exactly *"two
species reaching the same tier within a negligible tick difference across seeds"*. Three species
are cleanly separated (one of the tied trio, then elf, then draconic: in every seed the faster
arrives strictly earlier), and `mages-and-species` task 9.9 asks for four. Orc cannot be counted as
a fourth: it is censored in seven seeds of eight, and in the eighth it arrives at tick 316, inside
draconic's interval — so whether it separates depends on the horizon, and the horizon long enough
to decide is the one in which it overlaps.

The honest reading is that **species differentiate along the axis this instrument reads, but not
into six distinguishable species**, and the fix is either a censoring convention — which
`contracts.md` §7's `timeToTierBySpecies` owns and `agent-interface` pins, not this change — or
content that separates dwarf, gnome and human, which is tuning and is forbidden before 0.5.0.

**Three degeneracies, recorded because a release that hides them is worth less than one that does
not:**

- **Teaching stops after world year twenty.** A researched instance is created at `fp(256)` and the
  teach threshold is `fp(512)`, so nothing a mage works out for herself is ever teachable.
  Knowledge spreads only from founding grants, and those are taught out inside the first window.
- **Scribing stops after world year sixty**, and dies of the economy rather than of the threshold:
  books cost materials, and the stock is empty from roughly year seventy onward. The universe then
  runs two-thirds of the run in permanent famine, which is now visible as a falling `K` and was
  previously invisible entirely.
- **Library depth is two nodes against 1,263 books.** The scribable list is ordered by cost, so
  every scribe copies the same cheap node. The total effective knowledge capital is `fp(32)` from
  world year one to world year two hundred — which means `mages-and-species` task 9.8, *"the
  rolling growth rate of capital is non-increasing"*, is true and vacuous, and its box is left
  unticked for that reason rather than ticked for the wrong one.

**Not claimed, and specifically:** that the reference universe reaches carrying capacity within the
200-year horizon. It does not — at year two hundred the population is at 63% of `K` and births
still exceed deaths by 11%. It settles at roughly world year 475 (`b/d` 0.999 at year 500), which
is outside the horizon this release commits to, so `mages-and-species` task 8.7 is left unticked
and the birth-and-death equilibrium is demonstrated at cohort granularity instead, at a documented
tolerance of five per cent.

**Explicitly not claimed:** that any of this is *balanced*. Parity carries no meaning below 0.5.0
and every magnitude in the shipped content is marked `untuned`.

### 0.5.0 — `agent-interface` — the pivot

Promoted to **0.6.0**, the first validated line, when baselines for `knowledge-model` and `mages-and-species` are committed and green.

**Claim:** Ten thousand headless runs complete within the recorded time budget on eight workers,
and every metric in `contracts.md` §7 is reported for every run — where a metric whose mechanic does
not yet exist reports an explicit `unavailable` status rather than being omitted.

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

**Claim:** At least 8 of 10 observed first-time players issue a grant-founding-knowledge action
within 15 minutes of starting, without asking a question or consulting documentation.

- *Disproved by:* fewer than 8 of 10 in an observed cohort.
- *Collected:* **NO, and the original wording was also unfalsifiable.** "Without external
  instruction" had no measurable definition and no time bound — it could never have been checked
  even with perfect telemetry. The restatement above is falsifiable but still needs either
  instrumentation (see `wire-telemetry`) or ten genuinely observed sessions. Do not claim it on
  fewer.

**Claim:** The client computes no rules — displayed state always matches the snapshot hash of the
core instance it reads from.

- *Disproved by:* any divergence between client-displayed state and that snapshot.
- *Collected:* **yes**, automatable. Stated against the *core*, not a server: the server does not
  exist until 0.15.0, and the original wording made this claim uncheckable at the release that
  makes it. Designing the main↔renderer transport as the same path the server will later use makes
  the 0.16.0 desync claim nearly free; not doing so makes it a rewrite.

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
