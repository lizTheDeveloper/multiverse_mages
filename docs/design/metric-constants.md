# The constants `agent-interface` pinned, and the ambiguities they resolve

`agent-interface` task 10.6. `docs/design/contracts.md` §7 is the **registry of metric names** and
says outright that *"the precise definitions live in the `agent-interface` capability specs, under
an explicit `definitionVersion`, not here"*. This file is the third thing: the list of every free
parameter those definitions had to invent, in one place, with the question each one answers.

**Why it exists at all.** §7 defines each metric in a single table row. A row like *"world ticks for
50% of nodes known at tick t to be lost by tick t+n"* does not say how often the census is taken,
what happens to a node that is rediscovered, or what to report when half the cohort is still alive
when the run ends. Somebody had to decide, and `design.md` names the failure mode of deciding
silently: *"a later change would re-invent them differently and the baselines would compare two
different quantities under one name"*. A baseline that compares a 12-tick census against a 6-tick
one reports the difference as a balance movement, stays green until it does not, and nobody can tell
which of the two numbers was the game.

**This file is checked, not maintained.** Every row below is asserted against
`BALANCE_METRIC_REGISTRY`'s `pinnedConstants` by
`packages/mc-harness/test/unit/pinned-constants-doc.test.ts`, in both directions: a constant added
to the registry and not to this table fails, and a row here for a constant the registry does not
declare fails too. So this document cannot go stale without the suite going red — which is the only
kind of design document that stays true.

**Changing a value here is a redefinition.** The mechanism is `definitionVersion` and the check is
task 6.13's: each metric's constants are digested with its normative definition, and the digest is
pinned in `packages/mc-harness/test/unit/metrics-definition-version.test.ts`. Move a constant
without moving the version and that check fails naming the metric; move the version and the pin has
to be edited, which a reviewer reads as what it is.

## The ambiguities, and what was chosen

| ambiguity §7 left open | what was pinned | why that answer |
|---|---|---|
| How often is the knowledge census taken? | every **12 world ticks**, from tick **0** | One world year (`contracts.md` §0). It is also the grid the reference scenario's vital signs already sample on, so the two describe the same universe at the same moments rather than at interleaved ones. |
| What happens to a node lost and then rediscovered? | it is an observed loss in every cohort that held it, and re-enters cohorts sampled after it returns | Falls out of the cohort construction with no special case, and it is what makes the 3× rediscovery penalty visible in a survival curve rather than averaged away. |
| What if half the cohort is still alive when the run ends? | status **`censored`**, with the longest observed elapsed time as a lower bound | Reporting the run length as the half-life converts "we never saw half of it lost" into "half of it was lost the moment we stopped looking". That number is plausible, stable across runs, and wrong. |
| Which quantile, and estimated how? | **0.5**, pooled **Kaplan–Meier**, right-censored at termination | Right-censoring is the whole point: a truncated run is evidence, not a missing observation. |
| At what ticks are the snowball coefficients taken? | **60, 120, 240, 480, 1200** | Doubling, then a long tail: early inequality and late inequality are different findings and a single late checkpoint cannot tell them apart. |
| One number, or one per checkpoint? | one per checkpoint; the **scalar is the last checkpoint with a sample** | The coefficients at tick 60 and tick 1200 measure different stages of the same run, and their mean describes neither. §7's threshold is about where a universe ends up. |
| What is the Gini of an all-zero population? | **0** | Perfect equality. A division by zero would surface as `null` at the moment the distribution was most equal. |
| What is the Gini of an empty sample? | **`null`**, and the metric reports unavailable | An empty arm and an equal arm are different findings. |
| Is `worshipSnowball` a rate or a level? | the **instantaneous** regeneration per world tick, read off the god's favor ledger | A universe sitting at its `favorCap` regenerates steadily while its pool does not move at all. Differencing the observed pool would report that universe as having stopped. |
| Which runs count at a checkpoint? | runs that terminated before it are **excluded and counted** | Folding an early termination in as 0 makes early deaths read as extreme inequality, inflating exactly the coefficient §7 thresholds at ≤ 0.35. |
| How wide is a raid-length bin, and what is in the overflow bin? | **10 engagement ticks**; the overflow bin must be **empty** and a raid in it **fails the run** | `contracts.md` §1.6 makes raid termination a proof — no primitive may modify `portalStability` and decay is an authored integer ≥ 1 — so a raid past its bound is a violated guarantee, not a long tail. |
| Which percentile convention? | **nearest-rank**, everywhere | Interpolation invents values between observations. Every percentile here is over integers. |
| What is in `ascensionRate`'s denominator? | `ascended` + `stagnated` + **`truncated`**; `failed` excluded and reported separately | A run that hit the tick cap is a universe that did not ascend. Dropping it computes the rate over a population selected on the outcome being measured, which lands inside the 5–20% band by construction. A crashed worker is not evidence about the game. |
| What counts as "reaching a tier"? | a **living mage of that species** holding an instance at location kind **`mind`** | A tier-4 node sitting in a grimoire nobody has read is not a species that reached tier 4. |
| What if most runs never reach a `(species, tier)` pair? | above **half** censored, the arm aggregate reports the **censoring fraction**, not a median | A median over the minority that got there moves in the *wrong direction* as the game gets harder: fewer runs arrive, the survivors are the fastest, the median falls. |
| Is a no-op an action for `illegalActionRate`? | **yes** — it is in the denominator | A denominator of "interesting actions only" makes a strategy look worse the more it engages with the game. |
| Where do the counters come from? | `agent-api`'s `accounting()`, never recounted | Two tallies that disagreed would both look like plausible integers. |
| How is a mixed-strategy run attributed? | **even split across the run's slots**, and the limitation is reported with it | `agent-api` accounts per session. Right in aggregate, wrong for any individual run; the fix is per-slot accounting there, not arithmetic here. |
| What confidence interval on an ablation win rate? | **Wilson score**, *z* = 1.959963984540054 | The textbook Wald interval gives `[1, 1]` for twenty wins out of twenty — infinite confidence from twenty observations — and it fails hardest exactly where an ablation result is most interesting. |
| When is a primitive's contribution "not detected"? | when the interval **contains 0.5**; reported **with** the point estimate | "The interval contains 0.5" and "the estimate is missing" are different findings. A primitive at 0.52 over eight plays and one at 0.5 over eight hundred must not read the same. |
| Can a primitive be un-ablatable? | **`portal`**, reported `not-attributable` | Neutralizing a presence gate removes raiding, so the ablation arm plays no raid. A win rate there would be a comparison against an arm that never fought. |
| Pairwise ablation? | **refused**, in the sweep validator and again in the mask | Fifteen primitives make 105 pairs: two orders of magnitude of sweep cost for a question nobody has asked. |
| What is the maximum prestige carry-forward? | **`PRESTIGE_CAP`**, from loaded `god-constant` content | Not chosen here. The loader asserts `PRESTIGE_CAP × (fp(1024) − PRESTIGE_RETENTION) == PRESTIGE_EARN_MAX × fp(1024)`, which makes it the analytic limit of the carry-forward recurrence at its earning ceiling rather than a clamp somebody picked. |
| What is a combat node *worth*? | combatant-ticks of enemy action denied, over the combatant-ticks a raid contains | Every prior measure of a combat primitive counted magnitude put on the field. Measured raids say that ranks the wrong thing: cast `direct-damage` removes under two percent of the hit points a raid removes, and survival-regret reads zero on every seed because the raid is decided by objectives the raider walks to. A node buys enemy action that does not happen; that is the quantity. |
| Does "removed from action" mean killed? | no — killed, saved by `ward` or `concealment`, or soaked by a summon | Control dominates damage on this tuning, so a measure counting only corpses would report the same near-zero it exists to replace. Displacement would be a fourth channel and this engine has no code path for it, so it is *declared absent* rather than reported as a zero — a channel structurally incapable of moving is the failure this project has already shipped four times. |
| Which source killed a combatant, when several hurt it? | split in proportion to the hit points each removed **over its whole life**, floored, remainder to the largest | Crediting the killing tick hands everything to whoever landed last — `area-denial` finishing what a bolt whittled, or the reverse — which is timing noise wearing a definition's clothes. The split conserves exactly, so the total does not change when the rows are regrouped. |
| Does killing a summon count? | no; reported alongside, outside the scalar | A summon costs its owner nothing at world scale. Folding its removal in would let damage farm denial on free bodies, which is invisible inflation of the exact number the metric exists to make honest. Reporting it alongside makes the exclusion's failure mode visible instead of silent. |
| What is one *attempt*, for threshold efficiency? | one resolved cast per primitive it carries, or one intrinsic attack; an `area-denial` field is one attempt for its whole life | A field applies damage on every tick it stands. Counting each tick would turn one cast into forty attempts and make a per-cast ratio read as a per-tick statistic under a per-cast name, so the field carries its cast's attempt id. |
| What about an attempt that landed nothing? | counted, and in neither the numerator nor the denominator | An attempt the target evaded says nothing about whether its source crosses a removal threshold. Folding it into the denominator would charge the caster for the *enemy's* `concealment`. |

## Every pinned constant, by metric

Generated from the registry and checked against it. `definitionVersion` is per metric; see
`metrics-definition-version.test.ts` for the committed digests.

| metric | constant | value |
|---|---|---|
| `winRateByPrimitive` | `interval` | `"wilson-score"` |
| `winRateByPrimitive` | `intervalZ` | `1.959963984540054` |
| `winRateByPrimitive` | `mirrored` | `true` |
| `winRateByPrimitive` | `noDetectedEffectRule` | `"interval contains 0.5"` |
| `winRateByPrimitive` | `notAttributablePrimitives` | `["portal"]` |
| `winRateByPrimitive` | `pairwiseAblation` | `false` |
| `timeToTierBySpecies` | `heavyCensoringFraction` | `0.5` |
| `timeToTierBySpecies` | `locationKind` | `"mind"` |
| `timeToTierBySpecies` | `pairCount` | `42` |
| `timeToTierBySpecies` | `percentileRule` | `"nearest-rank"` |
| `timeToTierBySpecies` | `tierMax` | `7` |
| `timeToTierBySpecies` | `tierMin` | `1` |
| `knowledgeHalfLife` | `censoring` | `"right-censored at run termination"` |
| `knowledgeHalfLife` | `censusIntervalTicks` | `12` |
| `knowledgeHalfLife` | `censusStartTick` | `0` |
| `knowledgeHalfLife` | `cohorts` | `"pooled"` |
| `knowledgeHalfLife` | `estimator` | `"kaplan-meier"` |
| `knowledgeHalfLife` | `quantile` | `0.5` |
| `libraryDependence` | `censusIntervalTicks` | `12` |
| `libraryDependence` | `censusStartTick` | `0` |
| `libraryDependence` | `excludeEmptyUniverseSamples` | `true` |
| `worshipSnowball` | `checkpointTicks` | `[60,120,240,480,1200]` |
| `worshipSnowball` | `degenerateTotalIsZero` | `0` |
| `worshipSnowball` | `estimator` | `"G = (2·Σ i·x_i) / (n·Σ x_i) − (n+1)/n, ascending, 1-based"` |
| `worshipSnowball` | `perClassContributions` | `["mages","universities","populace"]` |
| `worshipSnowball` | `quantity` | `"instantaneous favor regeneration per world tick, off the god favor ledger"` |
| `worshipSnowball` | `scalarCheckpoint` | `"last checkpoint with a sample"` |
| `worshipSnowball` | `smallSampleCorrection` | `false` |
| `capitalSnowball` | `checkpointTicks` | `[60,120,240,480,1200]` |
| `capitalSnowball` | `degenerateTotalIsZero` | `0` |
| `capitalSnowball` | `estimator` | `"G = (2·Σ i·x_i) / (n·Σ x_i) − (n+1)/n, ascending, 1-based"` |
| `capitalSnowball` | `quantity` | `"distinct nodes in library-kind instances"` |
| `capitalSnowball` | `scalarCheckpoint` | `"last checkpoint with a sample"` |
| `capitalSnowball` | `smallSampleCorrection` | `false` |
| `raidLengthDistribution` | `binWidthTicks` | `10` |
| `raidLengthDistribution` | `overflowBinMustBeEmpty` | `true` |
| `raidLengthDistribution` | `percentileRule` | `"nearest-rank"` |
| `raidLengthDistribution` | `scalar` | `"p50"` |
| `ascensionRate` | `denominatorStatuses` | `["ascended","stagnated","truncated"]` |
| `ascensionRate` | `excludedStatuses` | `["failed"]` |
| `ascensionRate` | `targetBandMax` | `0.2` |
| `ascensionRate` | `targetBandMin` | `0.05` |
| `prestigeAdvantage` | `carryForwardMax` | `"PRESTIGE_CAP, from loaded god-constant content"` |
| `prestigeAdvantage` | `mirrored` | `true` |
| `prestigeAdvantage` | `thresholdMax` | `0.6` |
| `illegalActionRate` | `denominatorIncludesNoOps` | `true` |
| `illegalActionRate` | `noOpActionId` | `0` |
| `illegalActionRate` | `source` | `"agent-api accounting()"` |
| `illegalActionRate` | `strategyAttribution` | `"even split across the run slots"` |
| `inboundRaidTempoLoss` | `denominator` | `"elapsed world ticks of this run"` |
| `raidInitiationCost` | `denominator` | `"raids initiated"` |
| `combatActionEconomy` | `castAndIntrinsicSeparated` | `true` |
| `combatActionEconomy` | `decoyTicksPerAbsorbedAttack` | `1` |
| `combatActionEconomy` | `denominator` | `"combatant-ticks the raid contained: entry to removal or resolution, every combatant"` |
| `combatActionEconomy` | `killAttribution` | `"proportional to the hit points each source removed over the target's life; floored, remainder to the largest, ties on ascending source id"` |
| `combatActionEconomy` | `overkillExcluded` | `true` |
| `combatActionEconomy` | `removalDuration` | `"removal tick to resolution tick"` |
| `combatActionEconomy` | `saveAttribution` | `"one save per combatant-tick; concealment when the evaded magnitude was necessary, otherwise ward; each save owns the span to the next save, the removal, or resolution"` |
| `combatActionEconomy` | `summonRemovalsExcluded` | `true` |
| `combatActionEconomy` | `unimplementedChannels` | `["displacement"]` |
| `combatThresholdEfficiency` | `attemptUnit` | `"one resolved cast per primitive, or one intrinsic attack; a field is one attempt for its whole life"` |
| `combatThresholdEfficiency` | `denominator` | `"removing plus hurting attempts"` |
| `combatThresholdEfficiency` | `numerator` | `"attempts that damaged a combatant which reached zero hit points on a tick they fed"` |
| `combatThresholdEfficiency` | `pooling` | `"over every raid in the run"` |
| `combatThresholdEfficiency` | `spentAttemptsExcluded` | `true` |
| `combatThresholdEfficiency` | `undefinedEfficiencyIsNull` | `true` |
