# Wires that never bind

**Measured 2026-08-15 on `08ca53684a5f29b24be0bffea615f760faacc400`** (`origin/main`, "A
provenance-only baseline re-seal", #184), in a worktree where `npm ci` and `tsc --build` both ran at
that SHA before any measurement. That last clause matters: every tool under `tools/w204/` resolves
`@mm/*` through the workspace symlinks into `dist/`, so a finding taken against a stale build is a
finding about code that is not on disk.

Nothing here is a repair. One instrument defect was fixed — my own, described below — and no
package under `packages/` was touched.

## The defect class, and why nothing in the build can see it

Three checks guard this repository and none of them can find a mechanism that is called every tick,
reaches its consumer, and contributes nothing.

- **`check:reachability`** counts symbols nothing calls. A wire called ten thousand times is
  *reached*, whatever it contributes.
- **`check:consumption`** asks whether a primitive's authored node effects reach a consumer. Its own
  source now says it cannot distinguish a live wire from one whose magnitude never binds.
- **The five design audits** read documents and ask whether a requirement is implemented. A
  requirement that is implemented and inert reads as done.

So the only instrument that answers is a run. **Ablate the mechanism, re-run the same seeds, diff
the outcome. If nothing moves, the mechanism is inert however live it looks.**

## The instrument

Five tools, all under `tools/w204/`, all read-only against `packages/`:

| tool | question |
| --- | --- |
| `never-bind.mjs` + `arms.mjs` | ablate one mechanism in the reference long run; diff the whole state and the whole per-tick trace |
| `episode-ablate.mjs` | the same question through `executeReferenceRun`, which has a god and a raid system in it |
| `verb-census.mjs` | per god verb, pooled over all twelve shipped strategies: legal / listed / submitted / **applied** |
| `goal-census.mjs` | per mage goal: mage-ticks committed, effort rows accrued, affiliation transitions |
| `channel-counter.mjs` | per bonus channel: calls, non-empty calls, contributions, magnitudes |
| `raid-census.mjs` | per strategy: raids, engagement ticks, combatant ticks, **combat attempts by source** |

### Two drivers, because one of them is blind by construction

`runLongReference` steps the world with an **empty action list every tick** and never installs the
raid system. That is the right driver for the world's own evolution and a useless one for anything a
god or a raid touches: all three knowledge-bonus channels are fed by blessing constants, so a
no-action run makes every one of them return an empty list forever — correctly, and
indistinguishably from a channel that is dead. Every row below names its driver.

### Two artifacts I found in my own instrument, both of which would have inverted the table

**The snapshot hash moves on a content-only edit.** The amplification direction rebuilds the
registry with one primitive's magnitudes multiplied, and `finalSnapshotHash` differs even when
nothing behavioural does. Amplifying `direct-damage` — an engagement primitive, in a driver that
resolves no engagement — moves the snapshot hash while all twenty-seven behavioural counters are
identical. Judged on the snapshot hash, **all sixteen primitives would have read live.** The
amplification direction is therefore judged on a `traceHash` over every field of every per-tick
report plus the per-tick census, and `never-bind.mjs` refuses to print a table unless amplifying
`direct-damage` leaves that trace untouched.

**An arm can replace a policy with itself.** The first `store` hook arm swapped the tradition's
store policy for the standard one and reported a perfect byte-identical null. The shipped default
tradition is `true-naming`, whose store hook **is** the standard one. `refuseIdentity` now throws
rather than reporting that null, and each tradition arm runs against the tradition that implements
the hook.

`never-bind.mjs` refuses to report anything unless four self-checks pass: two control runs in one
process agree; identity-amplification is byte-identical; content-only amplification leaves the trace
untouched; and ablating `resource-yield` moves the run. `episode-ablate.mjs` has its own control
reproducibility check, and `knowledge-steal` is its positive control.

## The known controls, reconciled

The brief supplied six controls. Five reconcile; two of the supplied figures are not in this tree.

| control | result |
| --- | --- |
| six of seven primitives ablate byte-identically at 240 ticks; only `resource-yield` moves | **reproduced exactly.** `lifespan`, `build-rate`, `research-rate`, `teach-rate`, `scribe-rate`, `fertility` byte-identical; `resource-yield` moves materials −39.0% |
| combat attempts exactly zero, `bySource: {}`, over non-zero combatant-ticks | **reproduced at scale.** 93 raids, 5,829 engagement ticks, 121,167 combatant-ticks, **0 attempts**, `bySource: {}`, 0 world-scale removals — 12 strategies × 2 seeds × 600 ticks. The tree's own recorded figure is 61 raids / 80,615 combatant-ticks over 8 strategies × 2 seeds at `b02892b` (`scripts/w144-ablation-visibility.mjs`), which scales to ~92 at twelve strategies. **The brief's 108/88,470 and 7/19,912 appear nowhere in this tree** and should be treated as unsourced |
| `constructionBacklog` 0 at all 601 ticks | **reproduced and extended.** `buildProgressAdded` is 0 on **all 2,400** ticks; `constructionStoneOwed` 0; `universitiesCompleted` 0; the universe's one university is already standing at tick 0 |
| `lifespan`: 1,594 contributions, zero effect; `fertility` carries the level | **driver-dependent, and the shape holds.** 0 contributions in 74,343 calls under the no-action long run; **3,401 contributions** under `worship-maximizer`, all of magnitude 61,440, moving `livingMages` by exactly one mage on one seed |
| `teach-rate`: lessons +0.1–3.1% | **not reproduced — and the measurement here is stronger.** Byte-identical at zero *and* at ×100 amplification, on three seeds at 600 ticks. The mechanism is known: `content-set.ts` registers `teach-rate` as a *non-node* consumer fed by blessing constants, so no authored node magnitude can move it at any width |
| soldier detachments 0.000 per raid | **not measured directly.** The cause is measured: the `soldier` occupation holds **0 people at all 2,400 ticks**, because `world-step.ts` passes `standingSoldierTarget: NO_STANDING_ARMY` — a hardcoded zero, by citation |

### The horizon is not the reason

Every byte-identical row was re-run at **2,400 ticks** — the sweeps' own horizon, and eight times the
240 the six-of-seven control was taken at. All nine stayed byte-identical in both directions:
`lifespan`, `research-rate`, `teach-rate`, `scribe-rate`, `fertility` and `build-rate` at zero and at
×100, and the three bonus channels at zero. **"Never fires" and "has not fired yet" are separated
here by measurement, not by assumption** (`tools/w204/out/matrix-2400.json`, one seed; the 600-tick
matrix carries three).

## The table

Ranked by how load-bearing the mechanism is *supposed* to be. "fires" and "magnitude" are counts
from the reference run; "ablation moves" is the decisive column.

| mechanism | fires | magnitude when it does | ablation moves | inert: content or structural | evidence |
| --- | --- | --- | --- | --- | --- |
| **`affiliate` mage goal** | **13,572 mage-ticks, 36.5% of all committed mage-life** | none — `workOne` has no branch; falls to `default: return undefined` | no seam; the goal has no accrual to remove | **structural** | `goal-census.mjs`, 600 ticks. 6 affiliation gains in the whole run, **0 of them on a tick the mage was committed to `affiliate`**; 5 of 114 mages ever affiliated. `completeAffiliation` has no production caller |
| **`research-rate` from node effects** | `researchBonusesFor` called **19,285×** | **0 contributions, every call** | byte-identical at zero and at ×100 | **structural** — registered as a *non-node* consumer; only blessing/encouragement constants feed it | `channel-counter.mjs`; `matrix-600` |
| **`teach-rate` from node effects** | `teachBonusesFor` called **695×** | **0 contributions**; 3 contributions in 256 calls under `worship-maximizer` | byte-identical at zero and at ×100 | **structural** | as above; `content-set.ts:679` |
| **`lifespan` from node effects** | `lifespanEffectsFor` called **74,343×** | **0 contributions** with no god; 3,401 × fp 61,440 with one | zeroing the channel under `worship-maximizer` moves `livingMages` 21→20 on one of two seeds | **structural** for node effects; god-only otherwise | `channel-counter.mjs`; `episode-ablate.mjs` |
| **`scribe-rate`** | stacked every scribing tick | `world-step.ts` passes the literal `NO_BONUSES` | byte-identical at zero and at ×100 | **structural** — nothing, node or god, can move it, and `content-set.ts` says so | `matrix-600`; `content-set.ts:691` |
| **`fertility`** | species content only | 5 authored node effects, **0 of them inside the opening square** — and no consumer for them at any width | byte-identical at zero and at ×100 | **structural.** `ECONOMIC_PRIMITIVES` in `universe-effects.ts` is `{resource-yield, build-rate}` and nothing else; a fertility node effect has no fetch site to reach | `reach.mjs`; `matrix-600`; `universe-effects.ts:183` |
| **`build-rate`** | **39 sources stacked, every tick** | real magnitudes, gathered and applied to nothing | byte-identical at zero; trace moves at ×100, no numeric report field does | **structural — a starting-position fact, not a content-width one.** It has a real node consumer; nothing is ever under construction for it to consume | `matrix-600`; `buildProgressAdded` Σ = 0 over 2,400 ticks |
| **`resource-yield`** | live | −36.8% materials produced, −22.6% applied | **moves three fields, all of them materials, and nothing else** — and is byte-identical across the entire committed run record | live in code, **invisible to the record** | `matrix-600`; `episode-ablate.mjs`; `CensusSample` has no material field |
| **`universeEffects` (applied magic)** | 11,263 non-zero yields | fp 128–512 | zeroing it removes every economic node and every build-rate source | **live** | `channel-counter.mjs`; `matrix-600` |
| **god action 5, `issueDispensation`** | legal 1,168 ticks; **submitted 598×** pooled | — | **applied 0 times, by any strategy, on any seed** | **structural** — `edictPlan` refuses a dispensation on an already-permitted cell, and `permissive-breadth` submits it on 553 of 600 ticks | `verb-census.mjs` |
| **god action 6, `issueInterdiction`** | submitted 540× | — | applied **3×** | edict-budget bound | `verb-census.mjs` |
| **god action 13, `changeTradition`** | **legal 0 ticks**; listed 588× | — | never resolves | structural, by price: 65,536 favor exceeds the cap below the top worship tier | `verb-census.mjs` |
| **god action 15, `declareAscension`** | **legal 0 ticks**; listed 5,232× | — | never resolves | gate, not price | `verb-census.mjs` |
| **god action 7, `revokeEdict`** | legal **13 ticks** of 7,200 | — | applied 3× | follows from edicts almost never existing | `verb-census.mjs` |
| **all seven combat sources** | 93 raids, 121,167 combatant-ticks | — | **0 attempts, `bySource: {}`, 0 removals** | **structural** — `chooseIntent` ranks theft above casting and no strategy grants a raider a combat node | `raid-census.mjs` |
| **`blink` / displacement** | — | — | never | **structural** — the engine reports `displacement` in `unimplementedCombatChannels` | `raid-census.mjs` |
| **`knowledge-steal`** | — | — | **moves** — population, living mages, grimoires, library depth | live; the pool's only live combat primitive | `episode-ablate.mjs` |
| **Vancian's `cast` and `cost` hooks** | — | — | not measured | **structural** — the only call sites are `rules-raid/arbitration.ts`; no `WorldStepDeps` field exists and the world loop never reaches them | `grep -a` over `coordination`, `rules-world`, `scenario`: no caller |
| **`true-naming`'s `acquire` hook** | — | — | **moves** — lessons −77.9%, economic nodes −91.7% | live | `matrix-600` |
| **`art-of-memory`'s `store` hook** | — | — | **moves** — grimoires 0 → 660 | live (it suppresses scribing outright) | `matrix-600` |
| **`soldier` occupation** | **0 people at all 2,400 ticks** | — | nothing to ablate | **structural** — `standingSoldierTarget: NO_STANDING_ARMY` | `occupation` probe |
| **`scribe` occupation demand** | — | `scribingQueueDepth: 0`, hardcoded at the call site | — | **structural** | `world-step.ts:799` |
| **`ward-duty` and `raid-readiness` goals** | **0 mage-ticks** | — | — | **structural** — both also lack an accrual branch | `goal-census.mjs` |
| **`idle` goal** | 0 mage-ticks | — | — | never selected | `goal-census.mjs` |
| **`deps.hazard`** | — | — | — | **structural** — the reference universe never installs it; the field is `undefined` for the whole run | deps dump |
| **`deps.appeal`** | — | — | **moves** — applied materials −51.7% | live | `matrix-600` |
| **`deps.god`** | — | — | trace moves; no numeric report field does | live, but through a non-numeric channel this instrument does not name | `matrix-600` |

**Twenty-seven rows, one per mechanism**, except *all seven combat sources*, which folds seven into
one because they share a single cause and a single zero. They sort into four buckets that add up:

- **Ten fire zero times.** `issueDispensation` (submitted 598×, applied never), `changeTradition`,
  `declareAscension`, the seven combat sources, `blink`, the `soldier` occupation, the `scribe`
  occupation demand, `ward-duty` and `raid-readiness`, `idle`, and `deps.hazard`.
- **Eight fire — several of them tens of thousands of times — and move nothing.** `affiliate`,
  `research-rate`, `teach-rate` and `lifespan` from node effects, `scribe-rate`, `fertility`,
  `build-rate`, and Vancian's `cast`/`cost` hooks.
- **One moves the world and nothing the record can see:** `resource-yield`.
- **Eight are live:** `universeEffects`, `issueInterdiction`, `revokeEdict`, `knowledge-steal`,
  true-naming's `acquire`, art-of-memory's `store`, `deps.appeal`, `deps.god`.

**The content-versus-structural split is eighteen structural to zero content-scoped.** Not one of
the inert rows would bind at a wider opening square. `fertility` looked like a content row until
`universe-effects.ts` settled it — `ECONOMIC_PRIMITIVES` is `{resource-yield, build-rate}`, so those
two are the *only* primitives with a node-effect fetch site, and a fertility node effect has nowhere
to arrive however many cells are open. `build-rate`'s null is a starting-position fact for the same
reason it is not a content one: it has a live consumer and nothing to consume. In every other case
the wire is missing rather than the content thin.

## The three most dangerous

### 1. A third of every mage's life is spent on a goal the rules do not implement

`affiliate` takes **13,572 of 37,211 committed mage-ticks** — 36.5%, second only to research. It has
no accrual in `workOne`; it falls through to `default: return undefined`. The world-step docblock
says it "completes through `completeAffiliation` rather than by accumulating months", and
`completeAffiliation` **has no production caller** — `check:reachability` already prints it as
unreached.

That much is visible. What is not visible anywhere is the cost. Over 600 ticks the universe gains
**six** affiliations and **not one of them** happens on a tick the mage was committed to `affiliate`;
they come from `assignStaff`, which does not read the goal. Five of 114 mages are ever affiliated.
So a third of the workforce is standing still, and the mechanism it is waiting for resolves by a
different route that ignores it.

Every check is green. `goalSwitches` is the only goal number in `WorldStepReport`; the per-goal
histogram is computed every tick inside `stepMageAutonomy` and dropped, and `CensusSample` has no
goal channel. There is no committed number anywhere that would move if this were fixed — which is
also why fixing it cannot be validated against a baseline today.

### 2. Discovery does not change the rates it is supposed to change

The vision is that mages discover magic and the magic changes what the universe can do. For three of
the four rates, the wire from a node to the rate **does not exist**:

- `researchBonusesFor` — 19,285 calls, **0 contributions**.
- `teachBonusesFor` — 695 calls, **0 contributions**.
- `lifespanEffectsFor` — 74,343 calls, **0 contributions**.
- `scribe-rate` — `world-step.ts` passes the literal `NO_BONUSES`.

These are not weak magnitudes. They are empty lists, on every call, in a run where mages research
19,324 mage-ticks and learn 50 nodes. Under a god they become non-empty — blessings feed them — but
what feeds them is a **god constant**, never anything anybody discovered. `content-set.ts` records
this precisely, in a comment, as a non-node consumer registration; `check:consumption` therefore
passes on all four while reporting the truth in a form nobody reads as a defect.

The consequence for the ablation table is stark: `teach-rate` is byte-identical at zero **and** at a
hundredfold amplification. The brief's "+0.1–3.1%" is generous. Under the world loop alone the
figure is zero, and it would still be zero with all seventy cells open, because no width of content
reaches a channel that takes no node input.

### 3. The one primitive that does move the world moves nothing the record can see

`resource-yield` is the single primitive with a live node consumer. Ablating it cuts materials
produced by **36.8%** and materials applied by **22.6%** over 600 ticks. It moves **nothing else** —
not population, not living mages, not nodes known, not grimoires, not library depth. And across the
entire committed run record — every declared metric, every census sample, every checkpoint, every
raid — an ablated run is **byte-identical to its control**, on both drivers and every seed tried,
including with the long run's own starting position.

The reason is one line of shape: `CensusSample` is `{worldTick, population, livingMages, nodesKnown,
knowledgeInstances, libraryDepth, grimoires, saturated}`. **There is no material quantity in it.**
Nor is there one anywhere else a baseline could reach: **not one of the eighteen `contracts.md` §7
metrics in `BALANCE_METRIC_REGISTRY`, and not one of the eleven `REFERENCE_MEASURES`, reads a
material quantity.** A 37% swing in the economy is not representable in the artefact the balance
gate compares.

This is the dangerous one because it is a wire that never binds *in the instrument that guards the
game*. Every balance baseline in `balance/baselines/` is blind to the economy by construction; a
change that halved material production would pass the gate byte-identically, and the gate's green is
what "even MINOR" in `release-plan.md` is a claim about.

Beside it sits its mirror: `build-rate` gathers **39 stacking sources every tick** for 2,400 ticks
and applies them to a `buildProgressAdded` that is **zero on every one of those ticks**, because the
reference universe's one university is already standing and no god ever founds another. The economy
produces materials nothing consumes, and the construction system consumes a rate nothing produces.

## What this did not measure

- **Soldier detachments per raid** — not measured. Only its cause (`NO_STANDING_ARMY`).
- **`cast` and `cost` tradition hooks** — no ablation, because there is no seam that does not also
  move `contentRevision`. Their inertness in the world loop is established by call-site absence, not
  by a run.
- **Per-verb raid counters** — `steal`, `move`, `objective`, `withdraw`, `guard` have no tally
  anywhere in the build. Only damage-bearing sources are counted, and those are zero.
- **`deps.god`'s non-numeric channel** — the trace moves and no numeric report field does. Naming
  what moved needs a finer trace than this one.
- **`nodesLost` as an attribution channel** — it sums death, decay and upkeep degradation into one
  scalar and is a *rule input* to the god's era accounting, so any single-channel loss ablation read
  through it would be unattributable. No row here depends on it.
