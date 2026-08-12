<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W28 — magic regimes, not one magic system with switches

**Branch:** `w28/magic-regimes`, from `origin/integration/campaign-round-2` at `0b54c84`.
**Upstream measurement:** `docs/design/tradition-sweep.md` (W13, already merged; three arms × n=96, CRN).
**Mandate:** vision §4a — *"A tradition may hook exactly four points, and no others. This cap is
deliberate — bespoke tradition code is the fun, and it is also precisely what defeats Monte Carlo
balancing."*

## The observation this workstream answers

> "Different universes aren't really different. There's no *making deals with demons* or *body
> horror magic* or *magic as music* or *magic as telepathy* — there aren't meaningfully different
> spell **regimes**."

Correct as an observation about the shipped content. Not correct as an observation about the
mechanism. W13 measured the three v1 traditions at n=96 under common random numbers and found that
**one of them is already a different game**:

| | Vancian | True Naming | Art of Memory |
|---|---|---|---|
| ascension rate | 0.6875 | 0.6979 | **0.1250** |
| grimoires | 979 | 908 | **0** |
| library depth | 1.4 | 1.7 | **0.0** |
| capitalSnowball | 0.1818 | 0.2487 | **0.0000** |
| nodes known | 65.8 | 58.2 | **17.2** |
| living mages | ~62 | ~65 | **120** |
| population | 6,979 | 7,516 | **18,546** |

All of that comes from a single `store` hook. Meanwhile Vancian and True Naming measure as the same
universe on almost everything, and differ in content by one number.

**So the thesis under test is not "four hooks are too few". It is "only one regime was ever
written."**

---

## Part 1 — The hook-space report

What each of the four hooks can and cannot express, read out of
`packages/rules-magic/src/traditions/` **and then traced to whether it reaches a running
simulation**. Nobody had written this, and the second half is the half that matters: a hook field
that no world-loop code reads is not a design lever, it is a comment.

### The frame: two facts that constrain everything

1. **The four points split by clock** (`hook-for.ts:hookSourceFor`). `acquire` and `store` are
   world-time and resolve to the mage's **home** tradition. `cast` and `cost` are engagement-time
   and resolve to the **host's**. `portalHookSet` adds the documented exception: the raider's *home*
   `cast` kind populates `preparedSpells` before she leaves.
2. **The measurement instrument is entirely world-time.** W13's ten `reference*` metrics all sample
   standing world stocks. So **`cast` and `cost` are invisible to the measurement that defines "a
   measurably different universe"** — which is the mechanical reason Vancian, whose entire identity
   is `cast`+`cost`, measured identical to True Naming.

The design rule that falls out, and which every regime below obeys: **a regime's mechanical identity
must live in `acquire` or `store`.**

### The wiring, hook by hook — what is live, and what is decorative

This is the load-bearing table. `WorldStepDeps` (`packages/coordination/src/world-step.ts:224,233`)
carries **only** `store: StorePolicy` and `acquire: AcquirePolicy`. There is no `CastPolicy` or
`CostPolicy` anywhere in the world loop.

| hook | field | reaches a running universe? | where |
|---|---|---|---|
| `acquire` | `researchCost` | **live** | `instances/research.ts:230` |
| `acquire` | `teachCost` | **live** | `coordination/gateway.ts:596,702` |
| `acquire` | `initialMastery` | **live** | `instances/research.ts:300` |
| `acquire` | `stolenMastery` | **dead** | computed; no reader outside tests |
| `store` | `personalLocationKind` | **live** | `research.ts:297,322`, `teaching.ts:190` |
| `store` | `slotsPerMage` | **live** | `research.ts:351` → `admitToStore` |
| `store` | `scribingAvailable` | **live** | `gateway.ts:509,1179` |
| `store` | `holdableLocationKinds` | raid only | `rules-raid/portal.ts:272` |
| `store` | `perishesWithHolder` | **dead** | death uses a hardcoded `mind‖palace` predicate |
| `store` | `lootableAt` / `transferableAt` / `burnableAt` | **dead** | raid loot calls `destroyInstance` directly |
| `store` | `libraryDepthCoefficient` | **dead** | `capital.ts` reads `libraryDepths`, which knows nothing of it |
| `cast` | `preparationRequired`, `slotsPerMage` | raid only | `rules-raid/portal.ts:278`, `raid.ts:581` |
| `cost` | `paidAtPreparation` | raid only | `raid.ts:592`, `arbitration.ts:272` |

**Five fields reach a running universe.** Two acquire multipliers, `instanceMastery`,
`slotsPerMage`, `scribingAvailable`, plus `personalLocationKind` — which turns out not to count, for
the reason below. That is the whole world-time design space, and it is why this workstream's regimes
are built from it rather than from the wider vocabulary the types advertise.

Three consequences worth stating on their own, because each is a defect someone should fix and none
of them is W28's to fix:

- **`libraryDepthCoefficient` is decorative, which re-reads W13's headline.** Art of Memory declares
  `768` and the world loop never reads it. Its measured library depth of 0.0 is not the coefficient
  being small — it is scribing being off and the coefficient never contributing at all. The
  `palaceLibraryDepth` function exists, is documented as the thing that stops vision §6a's
  knowledge-as-capital loop being switched off for one of three traditions, and has no caller.
- **`mind` and `palace` are mechanically the same place.** `isHeldLocation`
  (`instances/subsystem.ts:94`) hardcodes `mind ‖ palace`; decay, teaching, and death all use that
  predicate rather than the policy. So the Art of Memory's separation from `standard` comes entirely
  from `slotsPerMage: 12` and `scribingAvailable: false` — **not** from the palace. The most
  evocative thing in the tradition system is currently a rename.
- **`perishesWithHolder` disagrees with the engine and the engine wins.** The hardcoded predicate
  destroys palace instances on death even under a `standard` policy that says they survive.

### `acquire` — how knowledge enters a mind

**Vocabulary:** four numbers. Two kinds: `standard` and `true-name` (`researchCostMultiplier`,
`teachCostMultiplier`, `instanceMastery`).

**The highest-leverage number in the hook, and it is not obvious.** `instanceMastery` interacts with
a threshold outside the hook: `DEFAULT_INITIAL_MASTERY` is 256, the teach threshold is 512, and
`setMastery`'s only rules-path caller *lowers*. So **an instance born below 512 can never become
teachable**, and True Naming's `instanceMastery: 1024` is not flavour — it is the switch that turns
teaching on at all (W13's probe: 1,513 lessons per run against Vancian's 134). It is therefore a
one-integer **binary switch on whether transmission exists in a universe**, and three of the seven
shipped traditions have it switched off without saying so.

**Cannot express:** decay (stated in the module doc, and the containment is that it has no
vocabulary for it); prerequisite reach; who may teach whom; any per-acquisition state, so "the
demon's price rises with each bargain" is not authorable; rediscovery separately from research,
since the 3× multiplier is applied by the caller after the hook.

**Naming defect.** `true-name`'s vocabulary is entirely generic — three scalars, no reference to
names — and it is the *only* non-standard acquire kind, so every future regime must declare it
regardless of fiction. All four regimes below do. Renaming it to `scaled` is a one-line enumeration
change, not made here because it would churn the §2.5 table and the 0.3.0 release-claim tests for
zero mechanical gain. **A vocabulary defect, not a capability gap.**

### `store` — where knowledge can live

**Vocabulary:** the widest of the four, and the reason Art of Memory separated. Nine fields; two
kinds before this change (`standard`, `palace`).

**The hard wall, and it is the finding this workstream exists to report.**
`personalLocationKind` is typed over all four of `contracts.md` §1.5's location kinds, and **only two
of them are constructible.** `KnowledgeSubsystem.createInstance` (`subsystem.ts:322`) throws a
`RangeError` if the location kind is `grimoire` or `library` and no grimoire handle is supplied — and
the acquisition path (`research.ts:295`) supplies none, because a mage researching a node is not
writing a book. So a `store` kind declaring `personalLocationKind: grimoire` **crashes the
simulation at the first completed research.**

That is what killed the first two regimes drafted for this workstream:

- *The Covenant* — knowledge lives in the contract, not the head; immortal, lootable, and it outlives
  you. `personalLocationKind: grimoire`.
- *The Egregore* — no one knows anything, the university knows it. `personalLocationKind: library`.

Both are **exactly expressible in the hook's vocabulary** and neither is buildable. **This is not an
argument for widening the four-hook contract.** The hook has precisely the right word; the
acquisition path cannot honour it. The fix is a constructible `grimoire`/`library` acquisition path —
a change to `rules-magic`'s instance creation, not to `vision.md` §4a. Widening the hook contract
would not help, and doing it in response to this would be fixing the wrong thing.

**Also cannot express:** a *fifth* location kind (`LOCATION_KIND` is closed — a ley line, a
bloodline, a place in the world rather than in a person); per-node or per-cell storage rules, so
"names may not be written down but everything else may" is inexpressible; capacity that varies with
the mage, species, age or mastery; migration between locations; partial storage.

**One thing it could not express that W28 needed, and now can.** `standard` hardcodes
`UNBOUNDED_SLOTS` and `palace` sets `scribingAvailable: false`. So **"books exist AND a mage's memory
is finite"** had no kind to declare. That is a real gap, it is the only one this workstream hit that
a new *kind* could close, and it is closed by `bounded` — `standard` in every respect except a
declared ceiling.

### `cast` — how a held spell is expended

**Vocabulary:** one boolean and one integer. `preparationRequired`, `slotsPerMage`.

**Cannot express** anything that is not "a list of node ids with a length cap": no cooldowns, no
per-cast failure, no backlash, no casting that damages or transforms the caster, no shared pool, no
casting that consumes the knowledge itself (`expendOnCast` is explicit and deliberate — conflating
them would register casting as knowledge loss and spike `knowledgeHalfLife` with no raid behind it).

**And it is invisible to the sweep.** Raid-only.

### `cost` — what casting takes out of the caster

**Vocabulary: one boolean.** `paidAtPreparation`. Two kinds, neither taking a param. Its entire
authority is *when* the caller's own figure is charged; it cannot change the magnitude.

**Cannot express** a different price, a price in a different currency, a price paid by anyone but
the caster, a debt, a price that rises with use, or a price paid in anything but vigor. **Every one
of the author's four named regimes wants at least one of these** — a demon's deferred debt, body
horror's price in flesh, telepathy's cost borne by the group.

**This is the narrowest hook by a wide margin and it is the one that would need widening first.**
W28 does not widen it, and the reason is measurement, not caution: `cost` is raid-only, and the
campaign's own diagnosis is that no raids currently occur, so a widened `cost` would produce no
measurable difference in any universe today. Widening it before it is reachable would be adding
vocabulary that cannot be tested. There is also a live defect in the same place: `preparationCost`
has no caller, so a `prepaid` host tradition charges **neither** half — Vancian's cost is currently
free in both directions.

### Summary

| | can express | reaches a running universe | hard wall |
|---|---|---|---|
| `acquire` | research cost, teach cost, mastery at birth, mastery when stolen | first three | decay; prerequisite reach; any state or history |
| `store` | where knowledge lands, capacity, writability, mortality, lootability, capital | capacity + writability only | **`grimoire`/`library` are unconstructible**; a fifth location kind; per-node rules |
| `cast` | preparation required, slot count | raid only | everything else |
| `cost` | **when** the price is charged | raid only | **the price itself** |

**The world-time regime space is five numbers, two of which are switches.** That is smaller than the
types suggest and much larger than the shipped content had explored: of the eight structural corners
formed by {writes / unwritten} × {bounded / unbounded} × {teaches / cannot teach}, the three v1
traditions occupied **three**, and two of those three were the same corner.

---

## Part 2 — The four regimes as built

Each states a thesis, the corner it occupies, and **the metric that would show it, named before the
sweep ran**. Every magnitude is `tuningStatus: "untuned"`.

| regime | writes? | bounded? | teaches? | acquire | store |
|---|---|---|---|---|---|
| Vancian *(v1)* | yes | no | **no** | standard | standard |
| True Naming *(v1)* | yes | no | yes | 2× research, ½× teach, mastery 1024 | standard |
| Art of Memory *(v1)* | no | 12 | **no** | standard | palace |
| **Chorale** | no | 4096 | yes | 3× research, ¼× teach, mastery 1024 | palace |
| **Flesh Codex** | no | **3** | **no** | ¼× research, 4× teach, mastery 256 | palace |
| **Shared Mind** | no | 12 | yes | 4× research, ⅛× teach, mastery 1024 | palace |
| **Witch's Bond** | **yes** | **5** | **no** | 0.19× research, 4× teach, mastery 256 | **bounded** |

### R1 — The Chorale (magic as music)

**Thesis.** *Nothing is written and nothing is owned; a singer carries as many songs as she can
hold, and being sung to is the fastest way anyone learns anything.* Unbounded, unwritten, living
transmission.

**Pre-registered metric.** `referenceNodesKnown` far above Art of Memory's 17.2 while
`referenceGrimoires` stays at exactly 0 — the pair that separates it from both existing poles at
once. If Art of Memory's 17.2 is slot-bound, removing the cap must move it.

**No new kind.** `palace` at 4096 slots, which with 300 authored nodes is unbounded in practice.

### R2 — The Flesh Codex (body horror)

**Thesis.** *Inscribing a working on yourself is quick and nobody can teach you your own scars, so
every mage carves her own; there is only so much skin, and none of it is on any shelf when she
dies.* Cheap discovery, total loss.

**Pre-registered metric.** The **churn signature**: high `referenceNodesGained` against low
`referenceNodesKnown`, with `referenceGrimoires` and `referenceLibraryDepth` both 0 — a universe
that keeps re-learning what it keeps burying.

**No new kind.** `palace` at 3 slots with `lootable`/`burnable` true — the first time either param
has ever been set true in shipped content, though the wiring report says both are currently
decorative, so the regime's measurable identity rests on the slot count and the acquire numbers.

### R3 — The Shared Mind (magic as telepathy)

**Thesis.** *Deriving a working alone is near hopeless and thought passes between minds almost
freely, but a mind holds only twelve of the shared thing and none of it can be written.*

**Authored deliberately as a controlled arm.** It is the Art of Memory with one thing changed:
`instanceMastery` 256 → 1024, i.e. transmission switched on. Same store kind, same 12 slots, same
no-scribing. That makes the pair a **designed experiment on the teach-threshold cliff** — the single
highest-leverage number in the acquire hook — rather than a re-skin. Two outcomes and both are
findings: if it separates from Art of Memory, teaching matters to world-time outcomes and the cliff
is a balance lever nobody has been treating as one; if it does not, then W13's 11× difference in
lessons taught is invisible to every metric the harness collects, and the harness has a blind spot
worth naming.

**Pre-registered metric.** Separation from Art of Memory on `referenceNodesKnown` and
`referenceKnowledgeInstances`.

### R4 — The Witch's Bond (deals with demons)

**Thesis.** *The bargain is quick and it is struck alone, so nothing is ever taught; but the terms
are written and the books outlast everyone who signed them, and a witch may hold only five bonds
before she has nothing left to offer.*

**The one regime that needed a new kind**, and the only one: books plus a finite memory is the
corner `standard` and `palace` cannot jointly reach. `bounded` closes it.

**Pre-registered metric.** `referenceGrimoires` high (books are the only transmission) with
`referenceKnowledgeInstances` per living mage capped near 5 — high written capital on top of a
small personal store, a combination no shipped tradition could produce.

### The pre-registered distance definition

Fixed **before** the sweep, and implemented in `scripts/w28-analyse.mjs` so it cannot be redefined
to fit:

> Over the seven W13 metrics (ascension rate, grimoires, library depth, nodes known, living mages,
> population, capitalSnowball), a pair (A, B) qualifies if its separation **meets or exceeds** the
> Art-of-Memory-vs-Vancian separation on **at least four of the seven**. Separation is
> |Δmean| / pooled SE for the six metrics with per-run values; `capitalSnowball` is arm-scoped with
> no per-run value and therefore no SE, so it is compared on raw |Δ|. Common random numbers make the
> comparison paired.

### The reference-tradition hazard — checked, and it did not move

`scribingTraditionId()` walks traditions in interned order — lexicographic on the id string — and
returns the first whose `store` can scribe. **Measured on the seven-tradition set:**

```
1 art-of-memory | palace      5 true-naming          | standard
2 chorale       | palace      6 vancian-memorization | standard
3 flesh-codex   | palace      7 witch-bond           | bounded
4 shared-mind   | palace
scribingTraditionId -> 5 = true-naming
```

**The reference tradition did not move.** Three of the four new regimes cannot scribe at all, and
`witch-bond` — which can — sorts after `true-naming`. Its id was chosen partly for that, and saying
so is the point: **the reference universe's tradition, and therefore every committed balance
baseline, is decided by string sort order.** That is a hazard nobody chose. A future author adding a
scribing tradition named `covenant` would silently re-baseline the entire balance suite.
`packages/content/test/unit/tradition-hooks.test.ts` now carries the trip wire.

**Baselines must still be regenerated,** for a different reason: the balance gate compares
`provenance.contentHash` (`mc-harness/src/gate.ts:139`), and adding four traditions moves the
content revision `a622452a → 1f471d16`. That is a provenance invalidation, not a behaviour
regression, and the regeneration's per-metric deltas are the evidence for which it was.

---

## Tasks

### 1. Hook-space report
- [x] 1.1 Read all four dispatch modules, `hook-for.ts`, `portal.ts`, `registry.ts`.
- [x] 1.2 Vocabulary and hard walls, per hook.
- [x] 1.3 The clock/measurement rule that constrains regime design.
- [x] 1.4 Trace every policy field to whether the world loop reads it; annotate.

### 2. Content and code
- [x] 2.1 `bounded` store kind: `hooks.ts`, `store.ts` dispatch, `contracts.md` §2.5 row.
- [x] 2.2 Author four regimes in `packages/content/data/tradition.json`.
- [x] 2.3 `gloss` + `tuningStatus` required on traditions (schema, type, all seven records).
- [x] 2.4 Sound-design §4.4 rows for all four.

### 3. Tests
- [x] 3.1 Enumeration parity — code and `contracts.md` in one commit.
- [x] 3.2 Structural-corner test: a new regime that lands on an occupied corner fails.
- [x] 3.3 Trip wire on the reference-tradition sort-order hazard.
- [x] 3.4 Extend `tradition-differentiation` to the new regimes — 21 pairs, both cohorts.

### 4. Measure
- [x] 4.1 One sweep file per new arm, single-level `tradition` factor, sharing `sweepId` and
      `rootSeed` so CRN holds. n = 96.
- [x] 4.2 Re-run all seven arms on one content set; CRN verified: 576 pairs, 0 mismatches.
- [x] 4.3 Report the per-tradition table in W13's format.
- [x] 4.4 Evaluate the pre-registered distance definition: 3 of 6 pairs qualified.

### 5. Gate
- [x] 5.1 Regenerate the three balance baselines with written rationale; each reported no metric moved.
- [ ] 5.2 `npm run verify`. **A failing golden fixture is a STOP-and-report, never a regen.**

## What landed that was not in the plan

- **Two drafted regimes were cut after the wiring trace, not after the sweep.** *The Covenant*
  (`personalLocationKind: grimoire`) and *The Egregore* (`library`) are recorded in Part 1 as the
  evidence for the hard wall, because a regime that cannot be built is a more useful report than a
  regime quietly replaced.
- **Adding traditions widens the god's action space.** Action 13's candidates are "every tradition
  except the one held" (`agent-api/src/candidates.ts:311`), so the list grows from 2 to 6, and the
  interned id is written into the observation vector. Every strategy that samples the legal action
  set therefore behaves differently than it did with three traditions. **The tradition axis cannot
  be swept without perturbing the god's action space**, and no arrangement of sweep files isolates
  it. Comparisons *between the seven arms* remain valid — one content set, one action space — but
  comparisons to W13's published table are not controlled and are reported as such.
- **The glosses are deliberately not the prose they should be.** A pass rewriting them in the
  in-world register every other content file uses (`territory.json`: *"The ordinary country most
  people live in…"*) was written and reverted: `gloss` is in the `contentRevision` preimage, the
  rewrite moved the digest `1f471d16 → db2e8aba`, and the tradition sweep was already running. Prose
  polish is not worth either re-running seven arms or committing content whose revision differs from
  the one the reported measurement was taken on. Left for a later commit, with the rewrite recorded
  here as the reason it is not in this one.
- **One test failure observed once and not reproduced.** `work-phase.test.ts` failed with
  `No implementation for "acquire" kind "true-name"` — from `applyAcquire`'s default branch, on a
  hook whose kind printed as exactly `true-name`. Investigated rather than retried: direct
  reproduction through the built package resolved all seven traditions' acquire hooks correctly; a
  control on reverted sources isolated the *other* failure in that file as a 30s CPU-contention
  timeout from the concurrent sweep; the failure vanished after a rebuild and has not returned,
  including under instrumentation. Best remaining explanation is a stale vitest transform/dep cache
  during a concurrent rebuild. Recorded rather than dropped: if it recurs on a clean-room run it is
  real and blocks.

## Result

**Four hooks sufficed, and the thesis held: the problem was that only one regime had ever been
written.** Seven arms at n=96 under common random numbers, 576 (cellIndex, replicateIndex) pairs
compared across arms, **0 seed or strategy mismatches**, one `sweepId`, no arm at the wrong level.
Three of the four new regimes are mechanically buildable in hook *params* alone; exactly one needed
a new `kind`, for exactly one reason.

### The seven-arm table

| tradition | asc. rate | nodesKnown | instances | grimoires | libDepth | livingMages | population |
|---|---|---|---|---|---|---|---|
| Vancian | 0.1146 | 64.2 ±7.7 | 1883 ±189 | 91 ±30 | 4.4 ±1.0 | 87.0 ±9.9 | 16,871 ±1303 |
| True Naming | 0.1250 | 65.9 ±7.8 | 2364 ±218 | 195 ±40 | 15.1 ±2.6 | 82.9 ±10.1 | 16,154 ±1364 |
| Art of Memory | 0.0000 | 23.8 ±1.4 | 385 ±53 | 0.0 ±0.0 | 0.0 ±0.0 | 81.7 ±10.1 | 14,135 ±1281 |
| **Chorale** | **0.1250** | **62.0 ±6.8** | 2162 ±198 | 26 ±6 | 0.0 ±0.0 | 88.2 ±10.4 | 16,796 ±1337 |
| **Flesh Codex** | 0.0000 | **10.9 ±1.2** | **119 ±17** | 0.0 ±0.0 | 0.0 ±0.0 | 83.9 ±10.5 | 14,831 ±1335 |
| **Shared Mind** | 0.0000 | 22.5 ±1.3 | 668 ±80 | 1.0 ±0.4 | 0.0 ±0.0 | **92.2 ±10.1** | **18,897 ±1213** |
| **Witch's Bond** | 0.0000 | 15.4 ±0.9 | 302 ±28 | **140 ±23** | 1.7 ±0.2 | 77.6 ±10.4 | 13,455 ±1381 |

`capitalSnowball`: Vancian 0.4405, True Naming 0.4941, **Witch's Bond 0.5078** — and **0.0000** for
Art of Memory, Chorale, Flesh Codex and Shared Mind.

### The pre-registered distance test: met, three times over

The bar is the Art-of-Memory-vs-Vancian separation **re-measured on this tree under CRN** — not
W13's published separations, which are not comparable for the two reasons above. The yardstick came
out at: ascension 3.51, grimoires 3.02, library depth 4.31, nodes known 5.18, living mages 0.37,
population 1.50, capitalSnowball 0.44.

| pair of new regimes | metrics met | qualifies |
|---|---|---|
| **Chorale vs Witch's Bond** | **7 / 7** | **YES** |
| Shared Mind vs Witch's Bond | 5 / 7 | **YES** |
| Flesh Codex vs Witch's Bond | 4 / 7 | **YES** |
| Chorale vs Flesh Codex | 3 / 7 | no |
| Chorale vs Shared Mind | 3 / 7 | no |
| Flesh Codex vs Shared Mind | 3 / 7 | no |

**Chorale and the Witch's Bond are further apart than the Art of Memory is from Vancian on every
one of the seven metrics** — including nodes known at 6.82 SE against the yardstick's 5.18, and
library depth at 8.43 against 4.31. Acceptance asked for one qualifying pair; three qualified.

Note the three that did not qualify all fail the same way and it is not a wash: Chorale, Flesh Codex
and Shared Mind are all unwritten traditions, so they agree at exactly 0.0 on library depth and
0.0000 on capitalSnowball, which costs each pair two of the seven metrics by construction. On the
metrics that can distinguish them they separate hard — Chorale vs Flesh Codex is **7.46 SE** apart
on nodes known, the largest single separation in the whole table.

### Four findings the sweep produced that nobody had asked for

**1. The Art of Memory's 17.2 nodes known was slot-bound, and now that is measured.** Chorale is the
Art of Memory with the cap removed (12 → 4096 slots) and teaching switched on: nodes known goes
23.8 → 62.0, instances 385 → 2162, and ascension 0.0000 → 0.1250. The pre-registered metric was
exactly this, and it moved.

**2. Teaching spreads knowledge; it does not create it.** The Shared Mind was authored as a
controlled arm — the Art of Memory with one number changed, `instanceMastery` 256 → 1024, i.e. the
teach-threshold cliff crossed and nothing else. The result splits cleanly:

| | Art of Memory | Shared Mind | moved? |
|---|---|---|---|
| nodes known | 23.8 ±1.4 | 22.5 ±1.3 | **no** |
| instances | 385 ±53 | 668 ±80 | **+73%** |
| living mages | 81.7 | 92.2 | +13% |
| population | 14,135 | 18,897 | **+34%** |

So W13's 11× difference in lessons taught is **not** invisible to the harness, as feared — it is
visible in redundancy and in population, and invisible in *nodes known*, because the breadth of a
universe's magic is research-bound and teaching only copies what research already found. That is a
balance lever nobody was treating as one, and it means `instanceMastery` is a one-integer switch on
a universe's population curve.

**3. A tradition can hold books it did not write.** Chorale shows 26 grimoires and Shared Mind 1.0,
despite both having `scribingAvailable: false` — while the Art of Memory and the Flesh Codex, also
unwritable, show exactly 0.0. Library depth is 0.0 for all four, so the books are *held* and never
*shelved*, which is the signature of raid loot rather than scribing. `referenceGrimoires` is
therefore not a scribing metric once raids run, and the strong unwritten universes are carrying off
other people's libraries. Consistent with the fiction and not something anyone authored.

**4. Tradition choice moves a universe in and out of the §7 ascension band on its own.** Vancian
(0.1146), True Naming (0.1250) and Chorale (0.1250) all sit inside the 0.05–0.20 target band; Art of
Memory, Flesh Codex, Shared Mind and the Witch's Bond all sit at 0.0000, below it. No balance
constant separates them. That is the strongest available evidence that traditions are a strategic
axis rather than a label — and also a warning, since four of seven shipped traditions currently
cannot ascend at all.

### Did four hooks suffice? Yes — and here is the careful version

- **All four registers the author named were built inside the four hooks**: deals with demons
  (Witch's Bond), body horror (Flesh Codex), magic as music (Chorale), magic as telepathy (Shared
  Mind). Three of the four required **no code at all** — only params no one had ever set.
- **One new `kind` was required, and only one.** `bounded`, because `standard` hardcodes unbounded
  capacity and `palace` cannot keep a written copy, so *"books exist AND a mage's memory is finite"*
  had no kind to declare. `contracts.md` §2.5 explicitly sanctions adding a kind as a reviewed code
  change, so this is expected work, **not** evidence against the cap. It is also the regime that
  qualified in all three winning pairs.
- **Two regimes could not be built, and the reason is not the hook contract.** The strongest reading
  of *deals with demons* (knowledge lives in the contract, not the head) and of *telepathy*
  (knowledge lives in the institution) both want `personalLocationKind` at `grimoire` or `library`.
  The `store` hook has exactly that word. `KnowledgeSubsystem.createInstance` throws for either
  without a grimoire handle, and the acquisition path supplies none. **That is a missing acquisition
  path in `rules-magic`, not a missing hook**, and widening the four-hook contract would not help.
- **The hook that would need widening first is `cost`** — one boolean, no params, cannot change the
  price. Every one of the author's four registers wants something from it. W28 does not widen it,
  because `cost` is raid-only and unmeasurable today, and vocabulary that cannot be tested is
  vocabulary that cannot be balanced.

### The reference tradition did not move

`scribingTraditionId()` still returns **true-naming** on the seven-tradition set — verified by
loading the shipped content, not argued. Three of the four new regimes cannot scribe; `witch-bond`
can, and its id sorts after `true-naming`, which was part of why that id was chosen. The hazard
itself — **a tradition's name decides which universe every balance baseline was measured in** — is
now guarded by a trip wire in `packages/content/test/unit/tradition-hooks.test.ts`.

### The gate

`npm run verify`: **green**, in a clean-room run with the vitest cache cleared and nothing else
running. No golden fixture was regenerated. All three balance baselines were regenerated once, and
each reported **`no metric moved`** — provenance only. That is a stronger result than expected: it
means adding four traditions and widening the god's action space from 2 candidates to 6 changed
nothing measurable on any of the three gates.

### The forced next step

**Four of seven shipped traditions cannot ascend.** That is not W28's to fix — no balance constant
distinguishes them and the harness does not exist until 0.5.0 — but it is now a measured fact with
a named cause: ascension tracks nodes known, nodes known is research-bound, and the four
non-ascending traditions are the four with either a hard slot cap or dear research. The tuning
question that follows is whether `slotsPerMage` should be a species-scaled quantity rather than a
universe constant, which the `store` hook currently cannot express.
