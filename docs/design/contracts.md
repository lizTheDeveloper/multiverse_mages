# Multiverse Mages — Core Contracts

*The interface layer every capability is built against. `docs/design/vision.md` says what the game
is; this says what the machine looks like. Anything ambiguous here becomes an incompatibility
between two packages written by two different people, so ambiguity is the defect this document
exists to prevent.*

**Normative.** Where this document and a capability spec disagree, this document wins, and the
spec is the thing that gets fixed.

---

## 0. Universal Conventions

- **Fixed-point.** All rules-path numbers are integers at scale `FP = 1024`. A value of `1024`
  means 1.0. Written `fp(x)` below. No floats anywhere in the rules path (see `CLAUDE.md`).
- **Identifiers.** Content IDs are lowercase kebab-case strings in data files, interned to `uint16`
  at load. Runtime entity IDs are `uint32` handles with a generation counter.
- **Time.**
  - `worldTick` = **1 month**. A world year is 12 ticks.
  - `engagementTick` = **100 ms** of fictional time. 10 per fictional second.
  - Real-time pacing (how many ms of wall clock per tick) is a client/server concern and never
    appears in the core.
  - **Clocks are per-universe.** Entering engagement mode freezes world time for the two
    participating universes only; every uninvolved universe continues to advance. A multi-universe
    simulation therefore ticks universes independently, and no global clock exists at the core
    level.
- **Space.** Only engagement entities have positions. Coordinates are `fp` metres on a 2D plane.
  The reference battlefield is 200 m × 200 m. World-scale entities have **no** coordinates —
  the component model must not assume otherwise.
- **Randomness.** Every draw names a subsystem stream (§6). No subsystem may draw from another's.
- **Nulls.** Absent references are `0`, never `-1` or `undefined`. Entity handle `0` is reserved
  and never allocated.
- **`EDICT_BUDGET_MAX = 8`.** A permanent structural constant, distinct from a universe's current
  `edictBudget`, which grows with worship tier and may never exceed it. The observation vector pads
  to the maximum. Raising this constant is a breaking contract change precisely because it resizes
  the observation and invalidates every trained policy — which is why it is pinned here rather than
  derived from a tuning value in `god-agency`.
- **Content revision.** Every content registry computes a `contentRevision` hash over all loaded
  content. It is written into every snapshot. Two universes may only interact — a raid, a match —
  if their `contentRevision` values are equal. There is no partial-compatibility rule and no
  negotiation; mismatch is refusal with both revisions named.

  **It is 128 bits wide, carried end to end as 32 lowercase hex characters** — in the content
  registry, in `SimState`, in the snapshot header (16 raw bytes), and in the ruleset snapshot,
  with no narrowing at any boundary. The width is normative, not an implementation detail. It was
  once stored as a `uint32`, and because this clause offers no partial-compatibility rule to fall
  back on, that fold made "equal revisions" mean only *probably* identical content: birthday
  collisions become likely around 65,000 distinct content sets, an ordinary number for moddable
  content, and each one admits two incompatible universes to the same match. Narrowing this value
  anywhere is a breaking contract change.

---

## 1. State Schema

The world state is a set of component arrays over an entity store. Grouped by scale.

### 1.1 Universe (singleton per simulation instance)

One simulation instance holds one universe. A raid does **not** load a second universe into the
same instance: it captures an immutable **ruleset snapshot** from each participant at portal open —
`permittedTechniques`, `permittedForms`, `edicts`, `traditionId`, `contentRevision` — and
`permits()` evaluates against that snapshot, never against a live entity.

This is what makes the vision's frozen-policy rule (§3) structural rather than dependent on the
action mask: `rules-raid` may not depend on `agent-api` (§5), so a raid that read live universe
state would have no mechanism preventing mid-raid rule changes at all.

| Field | Type | Notes |
|---|---|---|
| `permittedTechniques` | `uint8` bitmask | 5 bits, one per technique |
| `permittedForms` | `uint16` bitmask | 14 bits, one per form |
| `edicts` | array of `{cellId: uint16, kind: 0=dispensation \| 1=interdiction}` | a new edict may be issued only while `length < edictBudget`. Existing edicts stay in force if the budget later falls — deterministic auto-revocation would silently rewrite a player's ruleset mid-run |
| `edictBudget` | `uint8` | current allowance; grows with worship tier, never exceeds `EDICT_BUDGET_MAX` |
| `traditionId` | `uint16` | exactly one; never 0 |
| `favor` | `fp` | god's currency |
| `worship` | `fp` | drives favor regen |
| `worshipTier` | `uint8` | derived, cached; recomputed on worship change |
| `materials` | `fp` | |
| `era` | `uint16` | **derived, cached**: `floor(worldTick / ERA_TICKS)` with `ERA_TICKS = 240` (20 world years). Nothing advances it imperatively — it was previously a field nothing wrote, while an ascension path was defined over it |
| `prestige` | `fp` | carried in from prior runs; **read-only during a run** |
| `prestigeEarned` | `fp` | written once at run end; the input to the next run's `prestige` |
| `terminalReason` | `uint8` | none \| ascension-apotheosis \| ascension-canon \| stagnation \| truncated |
| `favorCap` | `fp` | rises with worship tier; overflow is discarded and counted as `favorWasted` |
| `encouragedCells` | array of `{cellId, expiryTick}` | action 12 had nowhere to persist. Magnitude is derived from the remaining ticks, not stored: a stored magnitude and a stored expiry are two records of one linear decay, and they can disagree |
| `axisChangeCounters` | array per technique/form | hysteresis; repeated flips of one axis escalate in cost |
| `blessings` | array of `{mageId, expiryTick}` | one row per blessed mage, which is what makes "re-blessing refreshes rather than stacks" structural: there is no representation in which a mage holds two |
| `upheavals` | array of `{factor, expiryTick}` | worship shocks in force. An entity per shock, because two forbiddings can overlap and the combined factor is the shared multiplicative-on-remainder arithmetic over both |
| `eraEvaluations` | array of `{era, libraryDependence, nodesLost, passed}` | what each era boundary found. `libraryDependence` at era 2 is not recoverable from state at era 4, so the Enduring Canon ascension path cannot be decided without retaining these |
| `godState` | singleton, below | counters, high-water marks, and cached derivations that one tick of state cannot see |
| `grantBudget` | singleton, below | the founding-grant allowance and its ledger. **Absent means unbounded** |
| `ascended` | `bool` | terminal flag |

**`godState` — one row beside the universe, not fifteen more universe fields.** Widening the
universe row would have been the obvious move and is the expensive one: a snapshot section carries
its field table inline, so an added field reshapes the universe section and every older save has to
be rewritten column by column, where an added *component* is an appended empty section — the
migration shape this project has used three times and tested. The row is created lazily on the
first god tick, so "no row" means "this universe has not been stepped yet", which is exactly what a
pre-`god-agency` save describes.

| Field | Type | Notes |
|---|---|---|
| `favorWasted` | `fp` | regeneration discarded at the pool cap, summed over the run. §7's early snowball signal — it moves long before a Gini coefficient does |
| `magelessTicks` | `int32` | consecutive world ticks with no living mage |
| `lowWorshipTicks` | `int32` | consecutive world ticks below the stagnation worship floor |
| `stasisTicks` | `int32` | consecutive world ticks with no node newly entering the universe |
| `lastEverKnown` / `lastExisting` | `uint16` | last tick's ever-known and existing node counts, so "a node entered" is decidable without storing a set |
| `ascensionFirstMetTick` | `int32` | world tick a path was **first** satisfied, `0` for never. The gap to the declaring tick is what says whether the terminal reward is mispriced against continued play |
| `ascensionPath` | `uint8` | none \| apotheosis \| canon. Recomputed every world tick, so the condition can lapse |
| `peakWorshipTier`, `deepestTier` | `uint8` | high-water marks; inputs to `prestigeEarned` |
| `lastEraRecorded` | `uint16` | so each era boundary is evaluated exactly once |
| `eraNodesLost` | `uint16` | nodes lost so far in the current era |
| `goodEraRun` | `uint16` | consecutive passing era boundaries |
| `overBudgetEdicts` | `uint8` | edicts in force beyond the current budget. **Reported, never auto-revoked** |
| `terminalTick` | `int32` | world tick the run ended on, `0` while running |

**`grantBudget` — the founding-grant allowance, and a deviation from this document as originally
drawn.** It is the sixth overall, after `state`, `primitives`, `coordination` and `scenario` in §5
and the goal commitment and effort progress in §1.2, and it is recorded here for the reason those
are: a reader planning against §1.1 as written would find action 8 unlimited, and it is not.

| Field | Type | Notes |
|---|---|---|
| `startingGrants` | `uint16` | founding grants available before the universe has discovered anything |
| `accrualNodes` | `uint16` | self-discovered nodes that earn one further grant. `0` means a fixed allowance, not a division by zero |
| `cap` | `uint16` | ceiling on `startingGrants + earned`. A ceiling on what may be **granted**, never on what is held |
| `grantsUsed` | `uint16` | grants applied so far, over the run |
| `seededNodes` | `uint16` | ever-known nodes a god put there rather than the universe finding them |

`foundingGrantsRemaining = max(0, min(startingGrants + floor((everKnown − seededNodes) / accrualNodes), cap) − grantsUsed)`.

The reasoning, in the order it forced the decision:

- **Grants are made scarce, not weak, and the distinction is load-bearing.** `setMastery`'s only
  non-test caller is the decay pass and it lowers, so an instance granted at `grantMastery` is
  currently the universe's **only** source of knowledge above the teach threshold. A nudge-shaped
  grant would achieve "permission is necessary but not sufficient" by deleting that source before
  its replacement exists. Limiting the *count* achieves the same design goal and nothing that works
  today stops working.
- **Absence means unbounded, and that is a decision rather than a default.** Every pre-`w69` save
  and every hand-built test world carries no row, and all of them were written against unlimited
  grants. Reading an absent row as a budget of zero would switch founding grants off for all of
  them at once, silently. This is also why the revision-4 → 5 migration appends an **empty**
  section rather than synthesising one: a synthesised row's `grantsUsed` would read zero for a run
  that may have granted thirty times, handing a restored save a fresh allowance, and its `cap`
  would come from the restoring build's content and impose a limit on a run measured without one.
- **The parameters live in state and not only in content, because a sweep has to vary them.**
  `god-constant.json` is the authority for the defaults and nothing may hardcode them. But
  `worldDeps` resolves the god constants **once per worker** and shares the frozen struct across
  every run that worker executes, so two arms of one sweep could never disagree about a budget read
  from there. Seeding it into state at founding is the same shape `edictBudget` already has, and it
  is what makes the budget a swept parameter rather than a number somebody guessed.
- **`seededNodes` is what stops the budget paying for itself.** The accrual counts nodes the mages
  discovered for themselves — ever-known less the nodes a god seeded. Without the subtraction a
  grant makes a node ever-known, the accrual reads that as a discovery, and a budget of one with an
  accrual of one is a budget of infinity. It counts the scenario's tick-zero seeding too, so a cell
  running `foundingNodes: 4` does not begin life credited with four discoveries it did not make.
- **The mask closes when the budget is spent**, through `agent-api`'s candidate list rather than
  through a second copy of the rule — exactly as `canIssueEdict` gates actions 5 and 6. An action a
  bot can submit but which reliably does nothing is what `illegalActionRate` calls *"a spec-clarity
  smell"*: the mask says yes, `god-agency` refuses, and the disagreement reads as a confused agent
  rather than as a resource that ran out.
- **The cost is a third schema revision**, repaired exactly as the two before it: world-schema
  revision 6 appends an empty `grant-budget` section, and `sim-core`'s `SNAPSHOT_VERSION` again
  does not move. `WORLD_SCHEMA_VERSION` is now **6** — revision 5 is `material-stock`, and
  `grant-budget` is appended after it because section order in a snapshot is declaration order.
  It is also the one place in `migrations.ts` where appending beats rewriting:
  `splitMaterialsByKind` rewrites the universe layout and is right to, because a save that recorded
  a materials total did record something. A save that predates the budget recorded nothing.
- **What ships is inert.** All three constants ship at values no run can reach — the grid holds 300
  nodes and only prerequisite-free ones in permitted cells are grantable — so this build grants
  exactly as it always did and the mechanic is exercised only through the swept arms. The value
  that eventually ships falls out of a measured curve rather than out of a guess, which is what the
  harness is for.

**A terminated universe is frozen in its component rows, and not in its clock.** `god-agency`'s
ascension spec asks that *"no world tick may further alter the universe's state"* and that a
stepped, ascended universe's *snapshot hash is unchanged*. The first is implemented and tested: a
universe carrying a `terminalReason` runs no world phase and no god phase, so no component row
moves and every submitted action is refused and counted. The second is **not**, and the difference
is deliberate rather than an oversight — `step` advances the clock unconditionally, and that is
`sim-core`'s contract rather than any capability's to override. So the hash of a terminated
universe moves by exactly the clock, every tick, forever.

The layer that stops advancing a finished run is `agent-api`'s session, which already refuses to
`submit` to a terminated episode. Making the hash literally constant instead would mean either a
rules layer suppressing a core clock advance — the inversion §5 rule 4 exists to prevent, wearing
a different hat — or a second `step` that sometimes does not advance, which is the duplication the
one-step-contract rule forbids. Recorded here because a reader comparing the spec's sentence
against the code will otherwise think one of them is wrong.

**Ruleset legality — the single arbitration function.** Every consumer must call this rather than
reimplementing it:

```
permits(universe, cellId) =
    if edicts contains (cellId, interdiction) -> false
    if edicts contains (cellId, dispensation) -> true
    else techniqueBit(cellId) ∈ permittedTechniques AND formBit(cellId) ∈ permittedForms
```

Interdiction beats dispensation; a cell may not carry both, and the loader rejects content that
tries.

**Legality gates world-time acquisition** — research, teaching, and scribing — and gates casting.
It is deliberately **not** a universal invariant over instances: a mage may hold knowledge her
universe has since forbidden, and it lies dormant rather than being erased. Making legality
universal would silently pre-decide how raid theft works, which belongs to `raid-engagement`.

### 1.2 Mage (individual entity)

| Field | Type | Notes |
|---|---|---|
| `speciesId` | `uint16` | |
| `birthTick` | `int32` | world ticks; age is derived, never stored |
| `roleId` | `uint8` | researcher \| warden \| professor \| raider |
| `universityId` | `uint32` | handle, 0 = unaffiliated |
| `curiosity`, `ambition`, `caution` | `fp` | personality; rolled at birth from species means |
| `vigor`, `maxVigor` | `fp` | the resource a tradition's `cost` hook deducts from. Without it, `cost` has nothing to spend and the hook is decorative |
| `alive` | `bool` | |

Mages are individuals. Everyone else is not.

**Goal commitment** — a separate component, keyed on the mage's own entity handle, and **present
only while she has chosen a goal**.

| Field | Type | Notes |
|---|---|---|
| `goalId` | `uint8` | `rules-world`'s permanent, append-only goal registry. `0` is `idle` |
| `targetNodeId` | `uint16` | the node the goal is pointed at, or `0` for a goal that needs none |
| `adoptedTick` | `int32` | the commitment clock, which hysteresis and the stagger both compare against |
| `score` | `fp` | what it was adopted at. Reported, never compared — the incumbent is re-scored |

**This is a deviation from this document as originally drawn, added during `mages-and-species`, and
the third of its kind after `state` and `primitives` in §5.** `mages-and-species`' proposal says
`state-schema` is *"consumed unchanged"*. This addition breaks that, and it is recorded here rather
than absorbed quietly because the promise was made in writing and somebody planning against it
should meet the correction where they read the original.

The reasoning, in the order it forced the decision:

- **A commitment must outlive a tick.** §7's autonomy has a commitment minimum and a hysteresis
  margin, both of which compare `worldTick` against the tick a goal was adopted on. That comparison
  needs the adoption tick to still be there next tick — and therefore after a save, because a
  commitment that vanished on load would make a resumed run diverge from an uninterrupted one. That
  is a desync in `pvp-server` and a silently spoiled baseline in Monte Carlo, and neither announces
  itself.
- **A JavaScript map beside the state was rejected first.** It is state that does not round-trip,
  the defect `state`'s component model exists to prevent.
- **Widening §1.2's mage row was rejected second, and this is why the addition is a component.** A
  mage who has never chosen and a mage who chose `idle` are different states, and the autonomy layer
  reads the difference. Fields exist for every mage, so telling those two apart on the mage row
  would need a sentinel goal id — a tenth entry in a registry whose entire contract is that its ids
  are permanent and mean one thing each. An absent component says the same thing with nothing
  invented, and costs nothing for the mages not using it, which at any moment is most of them.
- **The cost is a schema revision.** Adding a component means an older world snapshot is missing a
  section, which `deserializeState` refuses. That is repaired by a world-schema migration in
  `packages/state/src/migrations.ts`, which appends the empty section. It deliberately does **not**
  bump `sim-core`'s `SNAPSHOT_VERSION`: that number is inside the hashed header, so moving it
  changes every snapshot hash in the project and breaks every golden fixture with a version error
  rather than a behaviour diff. The container and the component set are versioned separately, and
  the second is inferred from the snapshot's own self-describing component tables.

**Effort progress** — a separate component, **one entity per project**, present only for work a
mage has actually started and not yet finished.

| Field | Type | Notes |
|---|---|---|
| `subject` | `uint32` | the mage the work is counted against; for teaching, the **teacher** |
| `kind` | `uint8` | research \| teaching \| scribing. `0` is the reserved null |
| `nodeId` | `uint16` | the node being worked toward |
| `counterparty` | `uint32` | the student, for a teaching effort; `0` for the other two |
| `progress` | `fp` | work accumulated, in the unit `kind` implies |

**This is the second deviation from this document as originally drawn, added during
`mages-and-species`, and the fifth overall after `state`, `primitives` and `coordination` in §5 and
the goal commitment above.** It is recorded here for the same reason that one is: `mages-and-species`
promised `state-schema` would be *"consumed unchanged"*, and this breaks that promise a second time.

The reasoning, in the order it forced the decision:

- **Somebody had to own partial progress.** `rules-magic`'s `research` takes *"progress accumulated
  before this step"* as a parameter and states that *"the caller owns storing it"*; teaching and
  scribing have a cost to reach and no accumulator at all. Nothing owned it, so
  `packages/coordination`'s three `contribute*` methods threw rather than invent a home for it —
  which left mages choosing goals, holding them through hysteresis, and completing nothing.
- **Storing it on the goal commitment was rejected first.** It is the obvious place and it is
  wrong: hysteresis exists precisely to move a mage off a goal, so progress living on the
  commitment would be destroyed by the mechanism most likely to touch it. A mage displaced from a
  node after fifteen years of work would silently restart it at zero on returning, and no metric in
  the project would attribute that loss to the rule that caused it. **Progress must outlive a goal
  switch**, and that single requirement is what the shape below is derived from.
- **Widening §1.2's mage row was rejected second, and for the same reasons as before.** Fields
  exist for every mage, so a fixed row could carry only a fixed number of projects, chosen by
  whoever wrote it; a mage with none would pay for them anyway; and "no project" would need a
  sentinel node id. An absent row says all of that with nothing invented.
- **A project is therefore an entity, keyed by its fields rather than by a handle.** A mage may
  have several projects set down at once, so this cannot hang on her handle the way the goal
  commitment does — the precedent is §1.1's `axisChangeCounters`, one entity per axis ever flipped.
  All four addressing fields earn their place. `kind` separates work over the same node that is not
  the same work: a mage who holds a node can be teaching it and writing it down at once, against
  `teachCost` and `scribeCost` respectively, and without the discriminator a month at the desk
  finishes a student's education. `counterparty` makes a lesson belong to the **pair**, because
  §2.3 prices teaching as one cost for two people and both of them have goals pointed at it — the
  teacher's `teach` and the student's `seek-teaching`. Two rows would let one lesson complete twice
  and put two instances of one node in one student's head.
- **The number of projects one mage may hold is bounded.** Without a bound the component grows with
  *how often mages change their minds*, which is not a number the design controls; the bound is
  `MAX_EFFORTS_PER_MAGE` in `packages/coordination/src/effort-store.ts`, and starting a project past
  it gives up the least-invested one. Untuned, like every magnitude before 0.5.0.
- **The cost is a second schema revision**, repaired exactly as the first one was: world-schema
  revision 3 appends an empty `effort-progress` section, and `sim-core`'s `SNAPSHOT_VERSION` again
  does not move. A revision-1 save reaches revision 3 by running both steps in turn.

### 1.3 Populace cohort (aggregate entity)

| Field | Type | Notes |
|---|---|---|
| `speciesId` | `uint16` | |
| `occupation` | `uint8` | laborer \| scribe \| student \| soldier \| idle |
| `count` | `uint32` | |
| `birthTickBucket` | `int32` | cohorts are bucketed by decade of birth, not per-person |

**This is a performance contract, not a modelling preference.** Simulating a whole population as
individuals is what would make Monte Carlo unaffordable. Only mages are individuals; everyone else
is a counted cohort. No capability may promote populace to individual entities without changing
this document first.

### 1.4 University

| Field | Type | Notes |
|---|---|---|
| `libraryId` | `uint32` | handle |
| `capacity` | `uint16` | students supportable |
| `staffCohorts` | array of handles | |
| `buildProgress` | `fp` | `fp(1024)` = complete |

### 1.5 Knowledge

**Node**: content, not state. **Knowledge instance**: state.

| Field | Type | Notes |
|---|---|---|
| `nodeId` | `uint16` | |
| `locationKind` | `uint8` | `1` mind · `2` grimoire · `3` library · `4` palace |
| `locationId` | `uint32` | mage / grimoire / library / mage handle respectively |
| `acquiredTick` | `int32` | |
| `mastery` | `fp` | 0 → just learned, `fp(1024)` → teachable without loss |

**Grimoire**

| Field | Type | Notes |
|---|---|---|
| `nodeId` | `uint16` | one node per grimoire |
| `durability` | `fp` | species scribe-affinity raises this; dwarven books resist burning |
| `holderKind` / `holderId` | `uint8` / `uint32` | mage, library, in transit, or **unowned** — a dead unaffiliated mage's books are not in transit to anywhere |

**One instance per written copy.** A grimoire shelved in a library does not produce a second
instance: the instance's location is *rewritten* from `(2, grimoireId)` to `(3, libraryId)` on
shelving and back on removal. The grimoire-to-library association lives in a subsystem index, not in
a second instance record. Counting a shelved book twice would inflate every redundancy metric and
make `libraryDependence` lie in the safe direction.

**`mastery` thresholds.** `fp(1024)` is full mastery. Below `TEACH_THRESHOLD` a mage may not teach
at all; between the threshold and full, teaching transmits at proportionally reduced mastery. "Loss"
in the mastery scale is therefore defined, not implied.

**The reduction is strict, and that is a rule rather than an artifact of the arithmetic.** A teacher
anywhere below `fp(1024)` must produce a student strictly below her own mastery — the loss is
floored at one unit, the finest quantity scale 1/1024 can represent, and only a teacher at exactly
`fp(1024)` transmits without reduction. Stating it this way round is load-bearing because
"proportionally reduced" alone does not survive fixed point: `mul` floors, so a teacher one unit
short of full has a shortfall of `1`, and `mul(1, anything below one)` is `0`. Half the jitter range
would therefore round the entire shortfall away and teach losslessly — from a teacher one ordinary
decay tick below full, which is a reachable state and not a contrived one. Degradation would stop
compounding down a chain and settle at a plateau, and `knowledgeHalfLife` would measure a decay that
the rules had quietly stopped producing.

**Derived, never stored:** whether a node "exists in the universe" is `count(instances of nodeId) > 0`,
computed from an index maintained by the knowledge subsystem. Nothing may cache it in state.

**Persisted, and not derivable:** a per-node **ever-known** record. Instances alone cannot
distinguish a node this universe once held and lost from one it never knew — and rediscovery
requires exactly that distinction. This is state, not an index.

### 1.6 Engagement-only entities

Present only while `clock.mode == engagement`. Discarded on raid resolution, and **not** written to
world snapshots.

**Combatant**

| Field | Type | Notes |
|---|---|---|
| `sourceKind` | `uint8` | mage \| soldier-detachment \| summon |
| `sourceId` | `uint32` | handle into world state, 0 for summons |
| `side` | `uint8` | 0 attacker, 1 defender |
| `x`, `y` | `fp` | metres |
| `hp`, `maxHp` | `fp` | |
| `vigor`, `maxVigor` | `fp` | carried from the source mage; the host tradition's `cost` hook deducts from it |
| `preparedSpells` | array of `nodeId` | **readied at home, spent abroad.** The raider's *home* `cast` hook populates this list at portal entry, drawing on what her home `store` hook makes available; the *host's* `cast` hook governs how casting consumes it and the host's `cost` hook sets the price. This is the only split under which vision §4a's "carries her own preparations but pays the host's price" is literally true — a purely host-governed `cast` would strip a Vancian raider of preparations entirely on arrival |
| `concealment` | `fp` | |

**RaidState**

| Field | Type | Notes |
|---|---|---|
| `hostRuleset` | ruleset snapshot | the defender's. Governs legality, and the `cast`/`cost` hooks |
| `raiderRuleset` | ruleset snapshot | the attacker's. Governs the `acquire`/`store` hooks |
| `objectives` | array of `{kind, targetId, x, y, valueFp, statusKind, capturedBy}` | `statusKind` distinguishes held / captured / looted / destroyed — a looted library still stands, a burned one does not |
| `portalStability` | `int32` | raw integer, decrements every engagement tick; 0 ends the raid |
| `stabilityDecayPerTick` | `int32` ≥ 1 | **authored raw integer, never derived by fixed-point division.** `div` rounds toward negative infinity, so a derived decay silently becomes 0 whenever the divisor exceeds the numerator — a raid that runs forever, with no error and no symptom |
| `raidSeed` | `uint32` | derived at portal open |
| `engagementStartTick` | `int32` | the world tick the raid began at |

**No effect primitive may modify `portalStability`.** Its absence from §3 is load-bearing, not
incidental: adding one would silently downgrade the termination guarantee from a proof to an
observation. Content declaring any stability increase or decay reduction is a hard load failure.

---

## 2. Content Schemas

All content is JSON, validated at load. **Invalid content is a hard load failure, never a warning.**
A silently-ignored malformed node is a balance bug that takes weeks to find.

### 2.1 `technique.json` / `form.json`

```jsonc
{ "id": "rego", "name": "Rego", "gloss": "control, bind, compel", "bit": 4 }
{ "id": "corpus", "name": "Corpus", "gloss": "body", "bit": 3 }
```

Exactly 5 techniques and 14 forms. `bit` values are dense, stable, and never reordered — they are
serialized into snapshots.

### 2.2 `cell.json`

```jsonc
{
  "id": "rego-corpus",
  "technique": "rego",
  "form": "corpus",
  "classicalLabels": ["necromancy"],                 // display only, never mechanical.
                                                     // Vision §4's mapping table is authoritative
  "v1": true,                                        // optional; flags membership of the 12-cell
                                                     // v1 rectangle. Absent means not in v1
  "edicts": [],                                      // optional; "dispensation" | "interdiction".
                                                     // §1.1 requires the loader to reject a cell
                                                     // carrying both, which needs a slot to carry one
  "nodes": ["rc-still-the-limb", "rc-puppet-flesh"]   // every id must resolve in node.json; there is
                                                     // no elision syntax, "..." is not a contentId
}
```

70 cells exist in schema. The **v1 subset** is flagged per-cell with `"v1": true`; exactly 12 cells
(3 techniques × 4 forms) carry it, and the set must include `rego-limen`.

### 2.3 `node.json`

```jsonc
{
  "id": "rc-puppet-flesh",
  "cell": "rego-corpus",
  "name": "Puppet Flesh",           // display label; required, and not a mechanical value
  "gloss": "Walk a body that is not yours, one limb at a time.",  // required; <= 400 chars
  "tier": 3,                        // 1..7; depth ceilings are per-species
  "prerequisites": ["rc-still-the-limb"],
  "researchCost": 4096,             // fp; mage-months of self-directed work
  "teachCost": 1024,                // fp; mage-months for a teacher/student pair
  "scribeCost": 2048,               // fp; scribe-months + materials
  "rediscoveryMultiplier": 3072,    // fp; applied to researchCost when relearning a lost node.
                                    // Content invariant: >= fp(3072). Species rediscoveryAffinity is
                                    // applied, then a hard fp(3072) floor -- otherwise the BEST
                                    // rediscoverer's affinity alone drops the effective cost to
                                    // 3072*1024/1792 = 1755, i.e. 1.71x, falsifying the 0.3.0 claim.
                                    // (An earlier draft of this line said "2.25x". That number is
                                    // 3072*768/1024 -- affinity as a MULTIPLIER, against a dwarf's
                                    // value. It was the only sentence in this document written under
                                    // that reading, and it taught an implementation the wrong
                                    // direction: rules-magic shipped `mul` where every other artifact
                                    // -- this field's own "fp DIVISOR" note in §2.4, the species data,
                                    // the loader's 5376 authoring floor -- assumes `div`. Found when
                                    // two agents independently reported the contradiction.)
                                    // Author v1 bases at >= fp(5376). NOT fp(4096) -- that number does
                                    // not achieve its own purpose: the best rediscoverer (gnome,
                                    // affinity 1792) turns 4096 into 4096*1024/1792 = 2340, BELOW the
                                    // floor, so the trait clamps flat and does nothing. Break-even is
                                    // 3072 * 1792 / 1024 = 5376
  "effects": [
    { "primitive": "direct-damage", "magnitude": 512, "target": "single", "durationTicks": 0 }
  ],
  "knowledgeKind": "episteme",      // "episteme" | "metis". Authored, never derived: `metis` marks
                                    // knowledge that codification destroys, so a cell's deep end is
                                    // an authoring decision rather than a consequence of tier. The
                                    // principle and every call in the shipped set are in
                                    // docs/design/metis-authoring.md
  "tuningStatus": "untuned"         // "untuned" | "tuned". Same meaning as in §2.4: every magnitude
                                    // above is a placeholder awaiting the balance harness
}
```

Prerequisites may cross cells. The loader rejects prerequisite cycles and any node whose
prerequisite has a higher `tier`.

### 2.4 `species.json`

```jsonc
{
  "id": "dwarf",
  "name": "Dwarf",                  // display label; required, and not a mechanical value
  "lifespanMonths": 3000,           // ~250y
  "lifespanVarianceMonths": 360,
  "curiosity": 512,                 // fp; P(initiating self-directed research) scalar
  "depthCeiling": 5,                // max node tier reachable
  "learnRate": 1024,                // fp multiplier on teaching/research throughput
  "retention": 1536,                // fp; resists mastery decay
  "fertility": 768,                 // fp multiplier on cohort birth rate
  "scribeAffinity": 1792,           // fp multiplier on grimoire durability and scribe-rate
  "rediscoveryAffinity": 768,       // fp DIVISOR against rediscoveryMultiplier. Higher is better,
                                    // uniform with every other trait -- so this dwarf is a
                                    // below-average rediscoverer, and gnomes lead (vision §5)
  "maturityMonths": 600,            // before which a mage cannot be promoted from a student cohort
  "mageAptitude": 448,              // fp; share of matured students who become mages at all
  "laborAffinity": 1280,            // fp multiplier on non-magical labour productivity
  "affinities": { "terram": 1536, "ignem": 1152 },  // by form or by cell id
  "personality": { "curiosity": 512, "ambition": 1024, "caution": 1024 },  // optional; means, each
                                    // defaults to fp(1024)
  "tuningStatus": "untuned"         // "untuned" | "tuned". Every magnitude above is a placeholder
                                    // awaiting the balance harness, and no release before 0.5.0
                                    // may claim any of them is balanced (release-plan.md)
}
```

**This field list is CI-enforced.** A conformance check parses the example above and compares it
field-for-field against the species schema, failing the build when a field is added to one and not
the other. The example is what an author copies when writing new species content, so a field
missing from it is a broken starting point rather than a documentation nit — which is exactly how
`name` and `tuningStatus` came to be required by the schema and absent from here.

**Soldier effectiveness is deliberately absent, and the absence is load-bearing.** Vision §6 gives
orcs "martial capability", and a `martialAffinity` field is the obvious way to encode it. It is not
here because soldier effectiveness is only observable inside a raid, and raids belong to
`raid-engagement`. Adding the field now would ship a species trait that nothing reads, tuned against
no measurement, from a capability with less information than the one that will eventually need it.
If `raid-engagement` wants it, that change amends this section with a use for it in hand.

### 2.5 `tradition.json`

```jsonc
{
  "id": "art-of-memory",
  "name": "The Art of Memory",
  "hooks": {
    "acquire": { "kind": "standard" },
    "store":   { "kind": "palace",
                 "params": { "slotsPerMage": 12, "lootable": false, "burnable": false,
                             "libraryDepthCoefficient": 768 } },
    "cast":    { "kind": "standard" },
    "cost":    { "kind": "standard" }
  }
}
```

**A tradition may declare exactly these four hooks and no others.** Each hook's `kind` selects from
a closed, enumerated set implemented in code; `params` are data. Adding a new `kind` is a code
change that must update this document. This cap is the mechanism that keeps traditions from
defeating primitive-level balance.

**The enumeration, normatively.** This table is the document half of that rule, and a test compares
it against `packages/content/src/hooks.ts` character for character. Without it, "adding a kind must
update this document" named no place in the document to update, and the obligation could be
honoured by writing nothing.

| Hook | Kinds |
|---|---|
| `acquire` | `standard`, `true-name` |
| `store` | `standard`, `palace` |
| `cast` | `standard`, `prepared` |
| `cost` | `standard`, `prepaid` |

**Across a portal the hooks split by clock** (`vision.md` §4a): `acquire` and `store` resolve to the
mage's **home** tradition, because acquiring and holding knowledge are world-time acts; `cast` and
`cost` resolve to the **host's**, because releasing a spell happens under the host's sky. The single
arbitration function is `hookFor(hook, homeTraditionId, hostTraditionId)` in `@mm/rules-magic`, and
it is the only place outside the four dispatch points permitted to read a `traditionId`.

### 2.6 `primitive.json`

Declares the units and stacking rule for each effect primitive. See §3 — the table there is
normative and this file must match it.

### 2.7 `territory.json`

```jsonc
{
  "id": "arable-lowland",
  "name": "The Arable Lowland",
  "gloss": "The ordinary country most people live in, and the reason there are most people.",
  "landUnits": 1600,             // how much of this region the universe holds. A count, not fp
  "capacityPerLandUnit": 20480,  // fp; people one land unit carries. 20480 = 20 people
  "tuningStatus": "untuned"
}
```

**Territory is the fixed resource, and that is its entire job.** Carrying capacity `K` is derived
from `Σ landUnits × capacityPerLandUnit` because nothing a universe does during a run creates land.
Every other economic quantity a universe holds — the materials stock above all — is something the
universe produces, so deriving `K` from one of those makes `K` a function of its own consequences:
more people produce more materials, more materials raise `K`, and the population bound is whatever
number the run happened to reach. This file exists so that the bound is a property of the world
rather than of the run's length.

Materials and completed university seats still *modulate* `K` — a well-supplied territory holds more
people than a bare one — but only as a **bounded multiplier** on the territory term, never as an
addend that can grow without limit. `packages/rules-world/src/economy/carrying-capacity.ts` states
the shape and the ceiling it implies.

`landUnits` is a per-universe endowment carried in content because a simulation instance holds
exactly one universe (§1.1). When that stops being true — a raid that takes ground, a scenario that
seeds a smaller world — `landUnits` moves to §1.1 and this record keeps `capacityPerLandUnit`, which
is a property of the *kind* of country and not of who holds it.

**A universe that cannot feed itself carries fewer people, and the world loop is what says so.**
`carryingCapacity` has taken a `subsistenceShortfallShare` since `mages-and-species` task 8.5 and
nothing passed one until the change's closeout, so `K` was the well-fed `K` for the length of any
run. The 200-year reference run is what made that visible: the materials stock empties around world
year seventy and `K` did not move. The share is now computed inside the births phase — this tick's
subsistence demand against the stock as it stands, before consumption runs — because consumption is
phase 9 and births are phase 8, and the alternatives were storing last tick's share in state (a
world-schema revision for a number one line reads) or charging subsistence for a population and
then letting it grow inside the same tick. With it wired, the reference run's `K` falls from 57,205
to 29,831 across two centuries while the population rises to 18,722, so *"population never exceeds
`K`"* is finally a question with a narrow answer rather than a bound running away ahead of the thing
it bounds.

**Every magnitude here is untuned** and carries `tuningStatus` saying so.

### 2.8 `god-cost.json`

```jsonc
{
  "id": "forbid-technique",
  "actionId": 2,                 // the §4.2 action id. Permanent, like the action
  "favorCost": 8192,             // fp. Base price, before hysteresis and node-tier scaling
  "gloss": "Exactly what permitting costs.",
  "tuningStatus": "untuned"
}
```

What each action in §4.2 costs the god in favor, as data rather than as literals in the rules
path — so that retuning a price is a content change a sweep can turn rather than a code change,
and so that the price is inside `contentRevision`. Two universes that disagreed about the cost of
forbidding a technique while agreeing they were compatible would be playing different games.

The loader enforces three things a JSON Schema cannot: **exactly one record per action id 0–15**
(a missing entry is a free action); **permitting costs exactly what forbidding costs** on both
axes, because vision pillar 1 rests on the decision being symmetric and any asymmetry makes denial
a penalty rather than a peer strategy; and **assigning a role is strictly the cheapest non-zero
action**, because it is the verb the god performs constantly and a priced one turns most of the
action space into unaffordable no-ops, inflating `illegalActionRate` into noise.

Founding a university has no id of its own — §4.2 gives funding and founding one action — so its
price is the `found-university-cost` constant in §2.9 rather than a second row here.

### 2.9 `god-constant.json`

```jsonc
{
  "id": "worship-lag-fall",
  "value": 154,                  // ~15% of the gap to the target closed per world tick
  "unit": "fp",                  // fp | ticks | count | months | tier
  "gloss": "Strictly greater than the rise rate; the asymmetry is the loop's damping.",
  "tuningStatus": "untuned"
}
```

Every magnitude of the worship loop, the favor economy, the interventions, ascension, stagnation
and prestige. **The set of ids is structural and the values are not.** The rules read each constant
by name, so the loader fails a set that omits one — an absent constant arrives in a formula as `0`,
and a worship lag of zero is a plausible-looking answer to a question nobody asked — and equally
fails a set that declares one nothing reads, because an unread constant is a tuning knob that does
nothing and the sweep that turned it would report the null result as a finding about the game.

Three identities among these constants are checked at load, because each is one a retune can break
silently:

- `worship-max` equals the three saturation caps summed. The ceiling is a property of the formula,
  not a clamp applied afterwards, and lowering a cap without lowering the stated ceiling turns that
  sentence into a comment.
- `prestige-cap × (fp(1024) − prestige-retention) == prestige-earn-max × fp(1024)`. `PRESTIGE_CAP`
  is the analytic limit of the carry-over recurrence at maximum earning, which is what makes the
  meta-game's bound arithmetic rather than a clamp.
- `worship-lag-fall > worship-lag-rise`. The asymmetry *is* the damping.

**Every value here is untuned** and carries `tuningStatus` saying so.

### 2.10 `raid-constant.json`

```jsonc
{
  "id": "stability-decay-per-tick",
  "value": 1024,                 // raw integer. NOT fp, and never derived
  "unit": "raw",                 // fp | raw | count | ticks
  "gloss": "Subtracted from portal stability every engagement tick, unconditionally.",
  "tuningStatus": "untuned"
}
```

Every magnitude an engagement is made of: the portal's opening stability and its decay, the
battlefield and its terrain, the per-side caps, the derived combatant statistics, the objective
values, and the victory threshold. Added by `raid-engagement`, and a deliberate extension of this
section for the same reason §2.8 and §2.9 are — a number a balance sweep turns belongs in content,
and inside `contentRevision`, or two universes could disagree about how long a portal holds while
agreeing they may fight.

**The set of ids is structural and the values are not**, exactly as in §2.9: the loader fails a set
that omits a constant the rules read, and equally one that declares a constant nothing reads.

Three checks here are not tuning hygiene — they are the **termination proof**, and they are the
reason this file exists rather than a `const` block in `rules-raid`:

- `stability-decay-per-tick` must be an **authored raw integer of at least 1**. §1.6 states why: a
  decay derived by fixed-point division silently becomes `0` whenever the divisor exceeds the
  numerator, and a decay of zero is a raid that runs forever with no error and no symptom.
- `ceil((portal-stability-initial + portal-stability-jitter) / stability-decay-per-tick)` must not
  exceed `MAX_ENGAGEMENT_TICKS`, the compile-time ceiling in `packages/content/src/raid.ts`. The
  jitter is inside the numerator because a bound that holds on average is not a bound. The ceiling
  is deliberately **not** a content value: it is what the engine trips over when the decrement
  guarantee has been broken, and a ceiling a sweep can raise is one that gets raised the first time
  a run reaches it.
- No radius may exceed `max-interaction-radius`, which is the spatial index's cell size. The index
  promises a radius query inspects at most nine cells; past that it silently stops finding
  combatants at the edge of an effect, which reads as balance rather than as a bug.

**Every value here is untuned** and carries `tuningStatus` saying so.

### 2.11 `autonomy-weight.json`

```jsonc
{
  "id": "role-appeal-raider-direct-damage",
  "value": 384,                  // fp; MAY be negative — a role can find a kind of magic distasteful
  "unit": "fp",                  // fp | raw. `raw` is a divisor, never a magnitude
  "role": "raider",              // optional; present exactly on a role-appeal row
  "primitive": "direct-damage",  // optional; present exactly on a role-appeal row, and an id from §2.6
  "gloss": "The raider's own primitive.",
  "tuningStatus": "untuned"
}
```

Every magnitude a mage's choice of **which node to work on** is made of: the six term weights, the
six per-term bounds, the appeal ceiling, and the role × primitive table. Added by W17, and a
deliberate extension of this section for the reason §2.8, §2.9 and §2.10 are — a number a balance
sweep turns belongs in content and inside `contentRevision`.

**Two kinds of record share the file.** A **scalar** declares neither `role` nor `primitive` and is
read by name; the set of scalar ids is structural exactly as in §2.9, so the loader fails a set
omitting a weight the rules read and equally one declaring a weight nothing reads. A **role-appeal
row** declares both, names a role from §1.2 and a primitive from §2.6 — each cross-checked — and its
`id` must be exactly `role-appeal-<role>-<primitive>`, so a row cannot say one thing to a reader and
another to the loader.

Why this file exists at all is §7's *"mages act on utility-scored goals shaped by species, age,
personality, and their assigned standing role."* Goal selection was that from 0.4.0. **Target
selection was not** — it ordered candidates by `remainingCost` then `nodeId`, and because v1
`researchCost` is a pure function of tier that was one fixed queue every universe walked and stopped
at a different point along. `docs/design/value-sensitive-acquirer.md` records the measurement.

Two checks here are not tuning hygiene — they are the design pillar §7 states in prose:

- `target-bound-role` must be **strictly below the sum of the other five term bounds**, so any
  combination of effort, affinity, species, age and personality can outvote any role. That is *"you
  set the role; they decide everything else"* as arithmetic. Without it, role-as-filter — which
  `mages-and-species/design.md` rejects twice over — returns as a tuning edit nobody reviews.
- No role-appeal row's magnitude may exceed `target-bound-role`. Clamping at lookup would leave an
  out-of-range entry in the table looking authored while behaving as something else.

`target-appeal-ceiling` must be at least the sum of all six bounds: a clamp that binds on an ordinary
outlook flattens real differences into ties, and a score whose ceiling is reachable by summing its
own bounds quietly stops discriminating at the top.

**Every value here is untuned** and carries `tuningStatus` saying so.

---

## 3. Effect Primitive Semantics

Every primitive: its unit, where it applies, and how multiple sources combine. **Stacking rule is
the field most likely to be silently assumed differently by two implementers**, so it is stated for
all of them.

| Primitive | Unit | Scale | Stacking |
|---|---|---|---|
| `direct-damage` | HP per application | engagement | summed per target per tick, then **one** ward factor applied to the sum — so ten small hits equal one large hit rather than differing by rounding artefact |
| `ward` | fraction of damage prevented | engagement | **multiplicative on the remainder**, hard cap `fp(922)` = 90% |
| `area-denial` | HP per engagement tick, within radius (fp metres) | engagement | additive |
| `blink` | fp metres of instantaneous displacement | engagement | max, not sum |
| `summon` | count of combatants from a template | engagement | additive, capped per side |
| `build-rate` | multiplier on construction progress | world | additive into `(1 + Σbonus)`, cap `fp(4096)` |
| `resource-yield` | multiplier on materials per world tick | world | additive into `(1 + Σ)`, cap `fp(4096)` |
| `research-rate` | multiplier on research progress | world | additive into `(1 + Σ)`, cap `fp(4096)` |
| `teach-rate` | multiplier on teaching throughput | world | additive into `(1 + Σ)`, cap `fp(4096)` |
| `scribe-rate` | multiplier on scribing throughput | world | additive into `(1 + Σ)`, cap `fp(4096)` |
| `lifespan` | additive months | world | additive, cap `+50%` of species base. **Recomputed from active effects at each hazard evaluation, never accumulated into a stored field** — which is also why mortality is a per-tick hazard rather than a death date rolled at birth |
| `fertility` | multiplier on cohort birth rate | world | additive into `(1 + Σ)`, cap `fp(3072)` |
| `worship-yield` | multiplier on favor regeneration | world | additive into `(1 + Σ)`, cap `fp(2048)` |
| `concealment` | fp probability of evading targeting/detection | both | multiplicative on the remainder, cap `fp(870)` = 85% |
| `knowledge-steal` | fp probability per attempt of copying an instance | engagement | max, not sum |
| `portal` | boolean gate; enables raid initiation | world | n/a — presence only |

**Why the caps exist:** every uncapped multiplicative rate in a game with two compounding loops
(worship §7, knowledge-as-capital §6a) is a runaway waiting to happen. The caps are deliberately
placed to be *reachable*, so the balance harness measures behaviour at the cap rather than
discovering it in live play.

**Rounding.** All `fp` division rounds toward negative infinity via the single shared helper. No
exceptions — uniform rounding is what makes replays reproducible.

**Extended precision is mandatory wherever a per-tick rate derives from a long span.** A draconic
lifespan of 18,000 months divided at `fp` scale floors to **zero hazard**, and dragons become
silently immortal — a defect that would survive thousands of Monte Carlo runs looking like a
species that is merely very long-lived. Any rate of the form `X / lifespanMonths` computes at
extended scale before narrowing, and a test must assert a non-zero draconic hazard specifically.

---

## 4. Observation / Action Space

One interface serves scripted bots, Monte Carlo, and reinforcement learning. It is defined once,
here, because building it twice guarantees divergence.

### 4.1 Observation — fixed shape

Shape must be **constant across a run and across universes**, or RL cannot consume it. Variable-
length data is bucketed or summarized, never emitted raw.

| Block | Size | Contents |
|---|---|---|
| `ruleset` | 19 + 2×`EDICT_BUDGET_MAX` = 35 | technique bits, form bits, 8 edict slots (cellId, kind), zero-padded |
| `tradition` | 1 | tradition id |
| `resources` | 5 | favor, worship, worshipTier, materials, prestige |
| `population` | 6 species × 5 occupations = 30 | cohort counts |
| `mages` | 6 species × 8 tiers = 48 | living mage counts by species and highest tier known; **slot 0 is "knows nothing yet"** |
| `knowledge` | 70 cells × 3 = 210 | per cell: nodes known, deepest tier, instance redundancy |
| `institutions` | 4 | university count, total capacity, library depth, grimoire count |
| `clock` | 3 | worldTick, era, mode |
| `engagement` (zeroed at world scale) | 64 | own/enemy combatant summaries, objective states, portal stability |

**Why the mage block has eight slots per species, not seven.** Node tiers are numbered 1–7 (§2.3),
so bucketing purely by highest tier known left a mage who knows nothing in no bucket at all — and
nothing else in the observation carries a living-mage count. An agent could not distinguish ten
fresh mages from none, which is precisely the state a universe is in for its first decades and
exactly when the god's decisions matter most. Slot 0 is the untaught. Found while implementing
`core-contracts`; the block was widened rather than patched around, because a count recovered from
somewhere else would have been a second source of truth for the same fact.

Total: a fixed vector. The core emits integers; **normalization happens in the agent-api layer,
which is the one place floats are permitted** on the way out.

**Exported type is pinned:** `Float64Array`, values in `[0, 1]`, with `fp(1024)` mapping to `1.0`.
Every trained policy depends on this, so it is a contract, not an implementation detail. Each block
declares its own normalization descriptor — a divisor and a clamp — so that a quantity whose range
later grows does not silently rescale an existing policy's inputs.

### 4.2 Actions — discrete, masked

| ID | Action | Parameters |
|---|---|---|
| 0 | no-op | — |
| 1 | permit technique | techniqueId |
| 2 | forbid technique | techniqueId |
| 3 | permit form | formId |
| 4 | forbid form | formId |
| 5 | issue dispensation | cellId |
| 6 | issue interdiction | cellId |
| 7 | revoke edict | edictIndex |
| 8 | grant founding knowledge | mageId, nodeId |
| 9 | bless mage | mageId |
| 10 | assign role | mageId, roleId |
| 11 | fund university | universityId \| 0 to found new |
| 12 | encourage research | cellId |
| 13 | change tradition | traditionId |
| 14 | open portal | targetUniverseId |
| 15 | declare ascension | — |

**Legality mask is mandatory.** Every observation carries a boolean mask over the action space. An
agent that submits an illegal action gets a no-op and a counter increment — never an exception,
never a silent partial effect. RL agents will submit illegal actions constantly; that must be
cheap and observable.

**This rule governs the core only, and the core assumes a trusted caller.** A cheap, silent,
unlimited no-op is correct for a learning agent and is an invitation to unbounded work from a
hostile network peer — and under the AGPL, modified clients are a granted right, not an anomaly.
Any layer accepting actions across a trust boundary (`server`, and `gym-bridge` if ever exposed
remotely) MUST apply its own admission policy — rate limiting, disconnection — *before* the action
reaches the core. The core does not defend itself; the boundary does.

**Every action except no-op is masked during engagement.** The god acts only in world time. This
covers the ruleset actions 1–7 and 13, and equally 8–12, 14, and 15: blessing a defender mid-raid,
or declaring ascension to escape a losing one, violates frozen policy exactly as squarely as
forbidding a technique does. Silence in an earlier draft of this table was not permission.

This is the vision's frozen-policy rule (§3), enforced in one place.

### 4.3 Reward and episode boundaries

The core emits **no reward**. Reward is a property of a training objective, not of the game, and
baking one in would make every trained agent a hostage to one researcher's choice.

Instead the core emits, alongside each observation, an **outcome record**: terminal flag, terminal
reason, era, and the balance-metric deltas since the previous step. The `agent-api` layer exposes a
*pluggable* reward function over that record. The shipped default is sparse and terminal: ascension
`+1`, stagnation `0`, nothing in between.

**Episode boundaries:**

- **Terminal** — ascension (vision §8a), or stagnation as defined by `god-agency`.
- **Truncated** — a step limit imposed by the caller, never by the core. A truncated episode is
  flagged distinctly from a terminal one; bootstrapping value estimates through the two differs, and
  conflating them is a silent training bug.
- **A raid is inside an episode, not its own episode.** The clock changes mode; the episode does
  not end. One agent plays both scales — which is exactly what the fixed-shape observation with its
  zero-filled engagement block exists to support.

### 4.4 Parameterized actions and the explain channel

Actions 8–14 carry entity handles drawn from a set that changes every tick, and a flat discrete mask
cannot express "action 9, but only for these 40 of 3,000 mages."

**Resolution:** parameterized actions address a **slot-indexed candidate list**, not raw handles.
Each observation carries, per parameterized action, a fixed-length list of the top-*k* candidate
entities ranked by a deterministic salience ordering; the agent selects a slot index. `k` is a
structural constant per action, pinned like `EDICT_BUDGET_MAX`. A slot referring to an entity that
died between observation and action is an ordinary illegal action.

**The explain channel** is a separate, optional projection carrying the reasons behind autonomous
mage decisions — utility scores and the goal chosen. It exists because vision §7 makes mage autonomy
a design pillar while §5 forbids the renderer computing rules: with no data path, a client can show
what mages *did* but never why, and autonomy reads as randomness.

It is **not** part of the RL observation. It is emitted on request, is never an input to any rules
computation, and no simulation behaviour may depend on whether it was requested.

**Consumer note, added while drafting `docs/design/sound-design.md` (§10.1).** The core's guarantee
above is unchanged and should stay. But a planned consumer — the client's bark system — wants
*per-mage decision reasons at world-tick granularity*, which is a different shape from *on-demand
explanation of one decision*. Two consequences, neither urgent:

- Whoever pins the explain channel's payload in `agent-interface` should know that shape is wanted,
  because it is much cheaper to know before the format is fixed than after.
- `electron-client` should treat the channel as required for its own read path even though the core
  keeps it optional. A client that skipped it to save bandwidth would ship a game where mages are
  silent about why they act — which is the exact failure this section exists to prevent, arriving
  through a door nobody was watching.

---

## 5. Module Boundaries

```
packages/
  sim-core        deterministic substrate. Depends on: nothing.
  content         data files + loader + validator, plus a parallel audio content set and its own leaf modules. Depends on: sim-core (types only).
  state           §1 world state types, component layouts, permits().     → sim-core, content (types only)
  primitives      §3 stacking arithmetic and cap clamping.                → sim-core, content (types only)
  rules-magic     grid legality, nodes, knowledge instances, traditions. → sim-core, content, state, primitives
  rules-world     mages, species, populace, universities, economy.        → sim-core, content, state, primitives
  rules-raid      engagement space, combat, objectives, consequences.     → sim-core, content, state, primitives, rules-magic, rules-world, coordination
  coordination    the world step loop, and the rules-world → rules-magic port. → sim-core, content, state, primitives, rules-magic, rules-world
  agent-api       observation/action space, legality masks.               → sim-core, content, state, primitives, rules-*, coordination
  mc-harness      worker pool, sweeps, balance metrics.                   → agent-api
  scenario        the reference universe at tick zero, and the run executor. → everything above; a leaf
  client-electron renderer. Reads snapshots. Computes no rules.           → agent-api (read path only)
  server          authoritative lockstep, Hetzner deployment.             → agent-api
  gym-bridge      JSON-over-stdio RL wrapper.                             → agent-api
```

**`state` is a deviation from this list as originally drawn, added during `core-contracts`.**
`state-schema` requires one set of world-state type definitions that every rules package consumes,
and the original list had nowhere to put them: `sim-core` must stay content-agnostic — its entity
store knows nothing about magic — and putting them in `rules-magic` would force `rules-world` to
import it for the mage layout, which is exactly the cycle rule 3 forbids. Its edge to `content` is
**types only** because `content`'s public surface re-exports a filesystem-reading loader, and
`state` runs inside the Electron renderer.

**`primitives` is the second deviation, added for the same underlying reason: §5 was drawn before
anyone tried to satisfy it.** §3's stacking arithmetic needs `sim-core`'s fixed-point helpers *and*
the primitive registry that lives in `content`. `content` is in the dependency-purity check's
`PURE_PACKAGES` and may take no runtime dependency, so the arithmetic cannot live there; and §3
forbids re-deriving a floor outside the one shared helper, so it cannot live anywhere that would
have to reimplement one. A package between the two is the only placement that satisfies both.

**`content` also carries a second, parallel audio content set — cues and voice-line banks under
`data/audio`, validated by their own schemas — deliberately outside `contentRevision` (§0):
renderer-only content that never reaches the simulation must never perturb the hash two universes
compare to agree they can play together. Alongside it live two pure leaf modules,
`audio-selection-merge.ts` and `audio-generation.ts`, added for asset production rather than for
the simulation.** A separate package for either would be worse. `audio-selection-merge.ts` is
loaded directly by a browser (`tools/audition/`) and must import nothing — a package boundary
would not tighten that constraint, only add a `package.json` for it to point at. And
`audio-generation.ts` is ~100 lines whose only input is audio content records already defined
here; a new package would add build infrastructure — its own `tsconfig`, its own entry in the
dependency-purity check, its own place in this diagram — to hold two files. Boundaries that are
only true in practice, not enforced anywhere, are the ones that get "tidied up" by someone who
does not know why they were drawn that way.

**`coordination` is the third deviation, added during `mages-and-species`, and it is rule 3's own
coordinating layer given a home.** Rule 3 says the `rules-magic`/`rules-world` interaction *"lives
in a coordinating layer"* without naming one, and the two candidates this list already held both
fail a **world** loop:

- **`rules-raid`** may import both, and the dependency-graph test names it as the example. But this
  list defines it as *"engagement space, combat, objectives, consequences"*, and a world tick is
  none of those. Putting the world loop there makes a headless Monte Carlo worker load the combat
  package in order to advance a month, and hands ownership of 0.4.0's central loop to
  `raid-engagement`, a capability that has not started. It also inverts §0's clock rule: an
  engagement *freezes* world time, so the raid layer is the thing that pauses the world loop, and
  one module should not be both the thing paused and the thing pausing.
- **`agent-api`** may import every `rules-*` package, but rule 4 runs the dependency one way only.
  A world loop living there could never be reached by `rules-raid` when a raid writes its
  consequences back into world state — and the observation layer becoming an input to the rules it
  observes is precisely what rule 4 exists to prevent.

So the layer gets a package, above both rules packages and below `agent-api`, with an inbound edge
from `rules-raid` because a raid's consequences land in world state through it. It is in
`PURE_PACKAGES`: it is rules-path code, loaded by the client, the server and the Monte Carlo
workers alike.

**`scenario` is the fourth deviation, added when the Monte Carlo harness was first pointed at a
real universe. It is the composition root this list never named.** §5 gives `mc-harness` one edge,
to `agent-api`, and `agent-api` builds no worlds — its session takes a caller-supplied `Scenario`
and states outright that *"a session does not know how to build a world"*. So something has to load
content, install `coordination`'s world loop, seed a starting position, and hand the result to a
session the harness drives. Every package already on this list fails that job for a different
reason:

- **`agent-api`** is granted `content` and `coordination` by this diagram, but its manifest refuses
  `content` deliberately: that package's public surface re-exports a filesystem loader, and §5 puts
  `client-electron` and `gym-bridge` downstream of the observation layer, which therefore has to
  run in a browser. A world builder there drags `node:fs` into the renderer.
- **`mc-harness`** may not, and the single edge is the point rather than an oversight: the harness
  and a trained policy must observe the same universe through the same interface, so a harness that
  could construct a `SimState` could measure one without going through §4.
- **`coordination`** holds the loop and is in `PURE_PACKAGES` — rules-path code the client and the
  server load. It may not hold a loader.
- **`rules-*`** may not import `agent-api` at all (rule 4), and a scenario is defined by the
  session interface it satisfies.

So the starting position gets a package above every rules package and above both consumers of §4.
It is a **leaf**: nothing in this repository imports it, which is what makes an edge to both halves
of the boundary safe, and the dependency-graph test asserts the leaf property by name. It is
deliberately *not* in `PURE_PACKAGES` — it reads the filesystem and names a worker entry point by
URL, exactly as `mc-harness` does — but it declares no third-party runtime dependency and its own
boundary test holds that line.

The `mm-run-sweep` CLI already assumed such a thing existed: it takes `--scenario <module>` and
expects `{executor, registries, provenance, workerUrl}`. This package is where that module's code
lives, so that the most consequential code in a balance run — *what a universe is at tick zero* —
is typechecked, linted, boundary-checked and tested, rather than living in a loose `.mjs` outside
the workspace.

**Enforced rules:**

1. `sim-core` depends on nothing and imports no Node built-ins.
2. Nothing depends on `client-electron` or `server`.
3. `rules-magic` and `rules-world` must not import each other. Where they interact — a mage
   learning a node — the interaction lives in a coordinating layer, not in a cycle.
4. Rules packages never import `agent-api`. The dependency runs one way only.
5. A dependency-graph test asserts all of the above in CI. Boundaries that are only documented are
   boundaries that are already broken.

---

## 6. RNG Stream Registry

Subsystem IDs are permanent. Adding a stream is append-only; **reusing or renumbering an ID
invalidates every committed balance baseline.**

| ID | Subsystem |
|---|---|
| 1 | mage birth and personality rolls |
| 2 | mortality |
| 3 | research and discovery |
| 4 | teaching outcomes |
| 5 | scribing outcomes and grimoire durability |
| 6 | populace cohort dynamics |
| 7 | mage autonomy / utility-AI tie-breaking, **including combatant goal selection in a raid** |
| 8 | combat resolution only — hit, evasion, damage |
| 9 | knowledge theft |
| 10 | objective and raid generation |
| 11 | terrain generation and combatant deployment |
| 12 | the opening square — which techniques and forms a universe is founded holding |

**Stream 12 is the first append since the baselines were committed, and it is what taught us that
appending is not free.** The gate compares `provenance.rngRegistryHash` as a block-level refusal,
and that hash is taken over this whole table — so adding a row invalidates every committed
baseline *by identity*, before a single number has moved. That is conservative rather than wrong,
but it means **any** future subsystem addition forces a re-baseline event, and the cost belongs in
the plan for one rather than being discovered in a red gate. See
`docs/design/opening-square.md` §4.

Draws key on `(rootSeed, stream, tick, actorKey, drawOrdinal)` where `actorKey` is stable identity,
never array index. This gives **insertion invariance**: adding a combatant, or adding a draw,
disturbs nobody else's rolls. Without it, an ablation run diverges from its control for reasons
unrelated to the ablated primitive, and every attribution measurement becomes noise.

---

## 7. Balance Metrics

The **registry of metric names**. Committed baselines are keyed on these names, and a CI check
asserts the implemented registry's keys equal this list exactly.

**The precise definitions live in the `agent-interface` capability specs, under an explicit
`definitionVersion`, not here.** Every metric below needed pinning that prose could not carry —
census intervals, censoring rules, denominators, whether a rate is instantaneous or cumulative. A
metric whose definition drifts silently makes every committed baseline meaningless while still
appearing green, so the definition is versioned alongside the numbers it produces.

**Every constant that pinning invented is listed in
[`metric-constants.md`](./metric-constants.md), with the ambiguity it resolves.** That note is
checked against the implemented registry in both directions — a constant in the code and not in the
note fails, and so does a row in the note for a constant the code does not declare — so it cannot go
stale without the suite going red.

**Ownership splits two ways.** `agent-interface` owns each metric's *definition and collection*;
the capability that owns the mechanic owns its *threshold value* — `worshipSnowball`,
`ascensionRate`, and `prestigeAdvantage` thresholds belong to `god-agency`, and the tempo metrics
to `raid-engagement`. A definition without a threshold is unfalsifiable; a threshold without a
pinned definition is unmeasurable.

**A metric whose mechanic does not yet exist reports `{status: "unavailable", reason:
"mechanic-absent"}`.** It is never absent from the output. This is what lets `0.5.0` claim that
every metric is reported two milestones before raids exist: a missing key is a harness failure, an
unavailable status is an honest answer.

| Metric | Definition |
|---|---|
| `winRateByPrimitive` | raid win rate attributed to each primitive via ablation runs |
| `timeToTierBySpecies` | world ticks for a species to first reach each node tier |
| `knowledgeHalfLife` | world ticks for 50% of nodes known at tick *t* to be lost by tick *t+n* |
| `libraryDependence` | fraction of known nodes with exactly one surviving instance |
| `worshipSnowball` | Gini coefficient of favor regen across MC runs at fixed tick counts. **Threshold: ≤ 0.35**, plus p95:p50 regen ≤ 3:1 |
| `capitalSnowball` | same, over library depth — the §6a loop |
| `raidLengthDistribution` | engagement ticks to resolution; must be bounded by portal stability |
| `ascensionRate` | fraction of runs reaching ascension. Target band: 5–20% |
| `prestigeAdvantage` | win rate of a high-prestige universe vs. a fresh one. **Must stay under 60%** |
| `illegalActionRate` | fraction of agent actions rejected by the mask; a spec-clarity smell |
| `inboundRaidTempoLoss` | world ticks a universe spends frozen in engagement as a defender, as a fraction of elapsed multiverse time. **Must stay under its threshold** — this is the griefing guard |
| `raidInitiationCost` | tempo an attacker forgoes per raid, for comparison against what they gain |
| `speciesGridVersatility` | cells of the seventy a species can staff with a qualified researcher, over the full grid and over the permitted cells separately. **Flag above 80% coverage even when depth is low** — the hegemony guard, and a different question from depth |
| `speciesCellOccupancy` | cells of the seventy a species **actually occupies** — a living mage of that species holding a knowledge instance of some node in the cell, in a mind — over the full grid and over the permitted cells separately, with *which* cells carried beside the count. The scalar is the Gini coefficient across species, so "one species staffs everything" is a number; 0 is an even spread. The outcome counterpart to `speciesGridVersatility`'s capability, and the observation its falsification test is stated over |
| `lossShockRecovery` | world ticks a species roster takes to regain its pre-shock headcount after a deterministic cull, per species, right-censored. Asserts that long-lived species recover *worse* rather than assuming fertility handles it |
| `roleAssignmentDemographicCost` | fall in a species' share of the roster under role assignment into lossy roles, against a paired arm that assigned none. Makes action 10 a demographic lever with a price rather than a free choice |

---

## 8. What This Document Does Not Fix

Deliberately left to the capabilities that own them, so that implementation experience informs them:

- Combat resolution math beyond primitive units — `rules-raid`
- Utility-AI scoring functions for mage autonomy — `rules-world`
- The worship and favor-regeneration formulas — `god-agency`
- Wall-clock pacing — **the server is authoritative; the client follows.** In single-player, the
  client's own core instance is the server for this purpose. Naming one owner matters: two owners
  choosing independently produces a divergence determinism cannot catch, because both sides are
  individually correct
- Snapshot wire format for network transport — `pvp-server`
- Which 12 cells make the v1 subset — `knowledge-model`, constrained only to include `rego-limen`
