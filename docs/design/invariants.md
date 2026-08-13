# Multiverse Mages — Standing Claims

*The claims that must hold on **every** commit after the release that establishes them, not just on
the day that release ships. `release-plan.md` says what each release makes newly true; this document
says what must never stop being true, how it is checked, and how long a violation could go unnoticed.*

> **Nothing here is enforced yet.** No code exists. Every claim below is a commitment with a
> named landing version, and the enforcement column describes machinery that must be *built*, not
> machinery that is running. Treating this list as coverage before 0.1.0 lands would be the exact
> "feels like rigour" failure it exists to prevent. The registry becomes real one row at a time.

---

## How to read this

Each claim carries five things: the statement, what would **disprove** it, the **mechanism** that
checks it, the **cadence** at which that mechanism runs, and the version it goes **live**.

Cadence is the important column, because it is detection latency — how long a regression can hide.

| | Cadence | Latency | Runs |
|---|---|---|---|
| **C** | Per commit | Minutes | CI on every push and PR |
| **S** | Per sweep | Hours to days | Nightly or pre-release Monte Carlo; needs `agent-interface` |
| **D** | Drift check | Days to weeks | Scheduled routine that reads and files issues, changing nothing |

A claim's canonical statement lives here. Where `release-plan.md` states the same thing as a release
entry, that is the *establishing* claim; this document is the *retention* claim, and the two must not
be maintained as separate prose.

---

## 1. Determinism — live from 0.1.0

The foundation. Everything downstream that is worth measuring is measurable because these hold.

| ID | Claim | Disproved by | Mechanism | Cadence |
|---|---|---|---|---|
| **INV-1** | The same `(rootSeed, initialSnapshot, actionLog)` produces a byte-identical final snapshot hash — across processes, across machines, across two Node majors. | Any golden fixture whose hash differs between CI runs, or between the pinned Node 22 job and the next-major job. | Golden-replay suite; two-Node CI matrix | **C** |
| **INV-2** | Adding a random draw in one subsystem does not change a single value drawn by any other. | A stream-independence test where inserting a draw shifts another subsystem's sequence. | Stream-independence test + append-only stream-ID registry test | **C** |
| **INV-3** | Subsystem stream IDs are permanent. None is ever reused or renumbered. | The registry test finding a changed or duplicated ID. | Registry test, which must name both IDs and say that committed balance baselines are invalidated | **C** |
| **INV-4** | Serialize → restore → step N is indistinguishable from step N. Serializing the same state twice yields byte-identical buffers. | Differing snapshot hashes on either path. | Round-trip and stability tests | **C** |
| **INV-5** | Recording is observation-free: a run with recording enabled and one with it disabled produce identical results. | Differing final hashes between the two. | Replay test | **C** |
| **INV-6** | Replay is speed-independent. Wall-clock pacing cannot change an outcome. | Identical inputs replayed fast and slow producing different hashes. | Replay test | **C** |
| **INV-7** | Golden fixtures are never rewritten as a side effect. Regeneration requires an explicit command and shows a reviewable diff. | A failing test run that leaves fixture files modified on disk. | Fixture-immutability test | **C** |

**INV-7 is the meta-claim that protects the other six.** A suite that silently reblesses its own
baselines reports green forever and detects nothing. If exactly one row here is treated as
non-negotiable in review, it is this one — a regenerated golden is a claim that behaviour changed on
purpose, and it should be read that way every time.

## 2. Purity and boundaries — live from 0.1.0 (§9 from 0.2.0)

These are cheap, mechanical, and exist because every one of them erodes silently under a year of
feature work and is invisible until a desync or an irreproducible sweep appears months later.

| ID | Claim | Disproved by | Mechanism | Cadence |
|---|---|---|---|---|
| **INV-8** | `@mm/sim-core` has zero runtime dependencies, imports no Node built-in, and contains no `Math.random`, `Date.now`, `new Date()`, `performance.now()`, or `Intl`. | Lint or the dependency-purity check exiting non-zero. | ESLint restricted globals + package-manifest check | **C** |
| **INV-9** | No floating-point arithmetic anywhere in the rules path. All rules math is fixed-point at 1/1024, and division rounds toward negative infinity through one shared helper. | A non-integer literal or `Math.*` float operation in the rules path; a division rounding inconsistently for negative operands. | Float-ban lint + rounding property tests | **C** |
| **INV-10** | The package dependency graph holds: `sim-core` depends on nothing, `rules-magic` and `rules-world` never import each other, and no package depends on the client or the server. | The dependency-graph test naming a forbidden edge. | Dependency-graph test | **C** |

### 2a. Numeric integrity — live from 0.4.0

INV-8 and INV-9 keep the *operations* clean. These three keep the *values* clean, and they exist
because this project has now met the same defect four times and caught it four different ways, all
of them luck.

The defect has two halves and one mechanism. A lookup misses, `undefined` enters arithmetic, `NaN`
comes out — and an `Int32Array` coerces `NaN` to **`0`**. So "NaN contamination" and "the value
silently fell to zero" are not two problems. They are one problem seen from two ends, and neither
end throws.

| ID | Claim | Disproved by | Mechanism | Cadence |
|---|---|---|---|---|
| **INV-37** | No non-integer value ever crosses into component storage in an assembled universe — not under any shipped strategy, and not on the raid path. | The value sentinel reporting one violation at either door, in any arm. | `installValueSentinel` over the reference universe, all shipped strategies, and a resolved-raid arm | **C** |
| **INV-38** | The set of functions that floor a live non-zero quantity to zero is exactly the registered set. It grows only by review. | An unregistered `module:functionName` appearing in the annihilation recorder's report. | `installAnnihilationSentinel` + the registry in `annihilation-registry.test.ts` | **C** |
| **INV-39** | Every arm that claims to check a mechanic reaches it. A coverage assertion accompanies each numeric-integrity arm whose mechanic is reached probabilistically. | An arm asserting cleanliness while its mechanic count is zero. | Resolved-raid count asserted alongside the violation list | **C** |

**INV-39 is the meta-claim that protects the other two,** the way INV-7 protects the determinism
block. A run that never reaches a mechanic reports zero violations and passes — so an arm without a
coverage assertion is indistinguishable from an arm that checks nothing. This is not hypothetical:
before 0.4.0 the raid path's only coverage was one raid resolved across the whole ten-strategy pool,
on one seed, by accident. `portal-rush` — the strategy whose entire purpose is opening portals —
resolved none at 60, 90, 120, 180 or 240 ticks. Any content change could have taken that last
accidental raid away, and nothing would have gone red.

**What these three do not cover, stated so nobody reads them as more than they are.** The value
sentinel watches component storage, so a `Fixed` living in a plain object — `RaidState.portalStability`
and `stabilityDecayPerTick` are the current examples — is outside it, and there `NaN` survives rather
than coercing. The annihilation sentinel sees `mul` and `div` only; a floor reached by `floorDiv`
directly, or by a bare `-`, is invisible to it. Both are off by default and cost one comparison when
off, so neither is a shipping guard — they are instruments, and they are only as good as the arms
that install them.

## 3. Contract integrity — live from 0.2.0

Once these hold, capabilities can be built concurrently without inventing incompatible versions of
the same model. Each one stops being true the moment someone works around it locally.

| ID | Claim | Disproved by | Mechanism | Cadence |
|---|---|---|---|---|
| **INV-11** | Content never partially loads. Every schema violation fails the load and names its file path and JSON pointer; a fixture with *k* violations reports exactly *k*. | A load that partially succeeds, or a validator reporting fewer than *k*. | Validation CLI + seeded-violation fixture | **C** |
| **INV-12** | Ruleset legality is computed in exactly one place. `permits(universe, cellId)` is the only implementation, and interdiction always beats dispensation. | The conformance check finding any direct technique/form bitmask evaluation outside `permits()`. Expected count: zero, permanently. | Conformance check | **C** |
| **INV-13** | The observation vector's shape is constant — across universes, across world and engagement scale, and as content grows toward all 70 cells. | Two observations of differing length or block layout. | Shape tests over divergent universes | **C** |
| **INV-14** | An illegal action is a silent no-op that increments a counter. It never throws and never mutates state. | An exception, or any state change, from a masked action. | Action-space tests | **C** |
| **INV-15** | Primitive stacking and caps are computed once, from the registry, and the registry matches `contracts.md` §3 exactly. | Inline magnitude arithmetic in any capability; any unit, scale, stacking rule, or cap diverging from the table. | Shared-implementation conformance + registry↔document check | **C** |
| **INV-16** | World-scale entities carry no coordinates; non-mage populace exists only as counted cohorts; engagement entities never appear in world snapshots. | A position component on a mage, university, cohort, or library; an individual non-mage entity; a combatant in a world snapshot. | State-schema conformance tests | **C** |

## 4. Game rules — live from 0.3.0 / 0.7.0

The rules the design would not survive losing. **INV-19 is the load-bearing one** — §3 of the vision
is the whole strategy layer, and it is stated as an absolute rather than a tolerance for that reason.

| ID | Claim | Disproved by | Mechanism | Cadence | Live |
|---|---|---|---|---|---|
| **INV-17** | A node is learnable if and only if at least one instance of it exists. When the last instance is destroyed the node leaves the universe, and rediscovery costs at least 3× original research. | A node remaining learnable after its last instance is destroyed; a rediscovery completing below the multiplier. | Deterministic scenario tests | **C** | 0.3.0 |
| **INV-18** | A tradition changes behaviour only through its four declared hooks — `acquire`, `store`, `cast`, `cost` — and through no other path. Across a portal, `acquire` and `store` follow the raider's home tradition; `cast` and `cost` follow the host's. | Any behavioural difference traceable to a tradition outside its hooks; two traditions producing identical outcomes on a distinguishing scenario; a raider paying her home tradition's cast cost abroad. | Scenario tests per tradition, plus a cross-portal hook-split test | **C** | 0.3.0 |
| **INV-19** | **Host-ruleset arbitration is absolute.** A spell whose cell the host universe forbids never resolves there, for attacker or defender. Expected occurrences: **zero**. | One occurrence, in any run, ever. | Scenario tests (**C**) and a zero-tolerance counter across every swept raid (**S**) | **C + S** | 0.7.0 |
| **INV-20** | Every raid terminates. No raid outlives portal stability. Expected non-terminating raids across a 10,000-raid sweep: zero. | A single non-terminating raid. | Sweep termination counter | **S** | 0.7.0 |
| **INV-21** | A raid is frozen policy. No action that alters the ruleset or tradition is legal while the clock is in engagement mode, and none takes effect if submitted. | A ruleset or tradition change taking effect mid-raid; a mask permitting one. | Legality-mask tests + world-state assertion | **C** | 0.6.0 |

## 5. The simulation stays alive — live from 0.4.0

| ID | Claim | Disproved by | Mechanism | Cadence |
|---|---|---|---|---|
| **INV-22** | A universe seeded with all six species and given zero player input runs 200 world-years without any species reaching zero and without population exceeding its documented bound. | Either boundary being crossed in the long-run test. | Deterministic long-run test — no harness needed | **C** |
| **INV-23** | Species remain measurably distinct: time-to-tier separation between species exceeds noise on identical seeds. | Two species reaching the same tier within a negligible tick difference across seeds. | Deterministic differentiation test | **C** |

INV-23 guards a specific slow failure: species converging on each other as later tuning passes
average them together, which no individual balance change would ever look responsible for.

## 6. Balance — live from 0.5.0 / 0.6.0

Everything above can be checked in minutes. **Nothing in this section can be checked without the
Monte Carlo harness**, which is precisely why the harness lands fourth. Before 0.5.0 these claims
cannot be made at all — and per `release-plan.md`, must not be.

| ID | Claim | Disproved by | Mechanism | Cadence | Live |
|---|---|---|---|---|---|
| **INV-24** | Sweeps are reproducible: the same sweep configuration and root seed produce identical aggregate metrics. | Two identical sweeps differing on any metric. | Sweep-reproducibility check | **S** | 0.5.0 |
| **INV-25** | Every metric in `contracts.md` §7 is reported for every run. No run completes with a metric missing. | Any run missing any metric. | Metric-completeness assertion | **S** | 0.5.0 |
| **INV-26** | No committed balance baseline moves beyond tolerance without deliberate acknowledgement. A primitive whose measured win-rate contribution shifts past its band fails CI. | A baseline diff landing silently. | Balance regression gate | **S** | 0.5.0 |
| **INV-27** | No scripted god strategy exceeds a 65% win rate against the bot pool. | A tournament sweep where any strategy exceeds it. | Tournament sweep | **S** | 0.6.0 |
| **INV-28** | The worship loop does not run away: `worshipSnowball` stays below threshold at every measured tick count. | The Gini coefficient exceeding threshold at any measured point. | Snowball metric | **S** | 0.6.0 |
| **INV-29** | The knowledge-capital loop does not run away: library depth → mage quality → research rate → library depth stays within its band, measured independently of the worship loop. | The compounding metric leaving its band, or the two loops jointly producing a runaway that neither shows alone. | **To be defined** — see Gaps | **S** | 0.6.0 |
| **INV-30** | Ascension stays a summit: the share of runs that ascend stays inside a band — not a majority, not almost none. | The ascension rate leaving the band in either direction. | **To be defined** — see Gaps | **S** | 0.6.0 |
| **INV-31** | Prestige does not decide matches: `prestigeAdvantage` stays under 60%, and prestige does not compound without bound across runs. | The metric exceeding it, or unbounded growth across chained runs. | Prestige sweep | **S** | 0.10.0 |
| **INV-32** | Zero desyncs. Across 1,000 automated matches, both clients produce identical final snapshot hashes. | One mismatch. | Automated match harness | **S** | 0.10.0 |

INV-32 is the payoff for §1. It is only a meaningful claim because determinism was made a property
the substrate enforces rather than a discipline authors were asked to remember.

## 7. Drift — continuous, from today

These need no code. They are the cheapest claims in the document and the ones most likely to be
quietly false, because nothing fails when they break.

| ID | Claim | Disproved by | Mechanism | Cadence |
|---|---|---|---|---|
| **INV-33** | The roadmap table in `vision.md` §11 and `openspec list` agree on every change ID, capability ID, and status. | Any row naming a change or capability that does not exist, or any change absent from the table. | Scheduled drift check | **D** |
| **INV-34** | Every OpenSpec change traces to a section of `vision.md`, and every section of `vision.md` is claimed by a change or explicitly listed out of scope in §12. | An untraceable change (scope creep) or an unclaimed section (unmet promise). | Scheduled drift check | **D** |
| **INV-35** | The primitive registry, the effect-primitive table in `contracts.md` §3, and the vision §4 primitive list describe the same set. | Any divergence in membership, unit, scale, stacking rule, or cap. | Registry↔document check (**C**) reinforced by drift review (**D**) | **C + D** |
| **INV-36** | Every claim in this document has an enforcement mechanism that actually runs, or is explicitly marked as not yet collected. | A claim whose named mechanism does not exist, with no marker saying so. | Scheduled drift check over this file | **D** |

INV-36 is what keeps this document from becoming decoration. A registry of claims nobody checks is
worse than no registry, because it reads as coverage.

---

## Gaps

Four things the vision demands that no release claim currently covers. Each needs a claim added to
`release-plan.md` at the version named, or an explicit decision not to make one.

**1. The knowledge-capital compounding loop (INV-29).** Vision §6a names two compounding loops —
worship and knowledge-as-capital — says they feed each other, and says "the balance harness must
watch it specifically." `release-plan.md` claims `worshipSnowball` at 0.6.0 and `libraryDependence`
at 0.7.0, but the latter is framed as a raid-consequence band, not as a runaway guard, and nothing
measures the two loops *jointly*. Two compounding loops that feed each other is the classic shape
that produces runaway leaders, and a live-PvP game cannot absorb that. **Needs: a defined metric and
a 0.6.0 claim.**

**2. Ascension rate (INV-30).** Vision §8a states the constraint precisely — "if a majority of Monte
Carlo runs ascend, it is not a summit; if almost none do, the meta-game never starts" — and no
release makes any claim about it. This is a two-sided band, which makes it unusual and easy to
forget: most balance metrics only fail in one direction. **Needs: a band and a 0.6.0 claim.**

**3. Knowledge half-life.** Vision §9 lists it among the balance metrics. It is the number that says
whether pillar 2 — knowledge is physical, and losing it hurts — is actually true in play rather than
merely implemented. No claim exists. **Needs: a claim at 0.5.0 or 0.6.0.**

**4. Raid length distribution.** Vision §9 lists it. `release-plan.md` claims raids *terminate*,
which is a correctness claim, not a pacing one — every raid could terminate at the stability timer
and the game would be unplayable while satisfying INV-20. **Needs: a distribution claim at 0.7.0.**

---

## Related

- `release-plan.md` — the establishing claim for each version, and the version semantics
- `vision.md` — §3, §6a, §7, §8a and §9 are the sources of the game-rule and balance claims here
- `contracts.md` — §3 and §7 are named directly by INV-15, INV-25 and INV-35
- The `detect-drift` skill — the mechanism for the **D**-cadence claims in §7
- The `version-and-claim` skill — why a claim that cannot be proven wrong is not a claim
