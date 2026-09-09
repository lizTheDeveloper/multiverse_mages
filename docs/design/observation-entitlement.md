# What a player is entitled to observe

**Status:** design, 2026-08-14. Written against `origin/main` at `be446a6`.

## The defect this exists to close

`permissive-breadth` does not take the price of an action into its value function. It cannot:
**price is not in the observation.** `PreferenceInput` is `{ observation, mask, round, context }`, and
nothing in those four carries a cost table. The strategy submits `permitTechnique` every round, the
mask filters it when the god cannot afford it, the next preference goes through, and the strategy
never learns that anything happened.

That is not a bug in `permissive-breadth`. It is what happens when **no artifact anywhere enumerates
what a player is entitled to observe.** The observation vector is 400 anonymous slots:
`ObservationSlot` carries `index`, `block`, `blockIndex`, and `descriptor` — how a channel is
*scaled*, never what it *is*. `OBSERVATION_LAYOUT_DIGEST` hashes positions and normalization rules,
so it would catch a slot moving and would not notice every slot being about the wrong thing. A
strategy author reads `observation[36]` and has to already know that is favor.

So the failure mode is structural and it recurs: something is added to the world, nobody adds it to
the observation, no test can tell, and every measurement taken afterwards silently answers a
narrower question than the one asked. The pricing sweep is one instance — it concluded *"no price
binds"* when what it had measured was *"a price-blind agent is not deterred by price"*.

## The claim

A checklist maintained by hand forgets. **The list of things a value function must account for should
be computed from the world state, not written down.** Every trait is then in exactly one of three
places: observed and used, observed and deliberately ignored, or withheld from the player on purpose
— and each of the three is a declaration a test can read.

## The spine that already exists

`WORLD_COMPONENTS` (21) and `ENGAGEMENT_COMPONENTS` (3) are `as const` arrays of `ComponentSpec`,
each with a `name` and a `fields` record. Every `(component, field)` pair is a candidate observable
trait, and the whole set is enumerable at build time with no simulation running.

`components.ts` already contains the pattern this proposes, applied to a different property:

```ts
export function worldComponentsWithPosition(components = WORLD_COMPONENTS): {...}[]
export function assertNoWorldPositions(...): void   // throws; a test asserts it
```

A function that walks the registry and returns violations, and a test that asserts the list is
empty. Adding a positional field to a world component turns that test red. This design applies the
same idiom to observability, and adds nothing architecturally new.

## The reducer

```
WORLD_COMPONENTS × fields  ──▶  classify each (component, field) trait
                                  ├─ OBSERVABLE  → projected into PlayerState per entity
                                  ├─ AGGREGATED  → reaches the player only as a
                                  │                histogram; names which one
                                  └─ WITHHELD    → declared, with a reason

project(state: WorldState): PlayerState        // the abstract reducer

PlayerState fields         ──▶  ├─ ENCODED      → ≥1 named observation slot
                                └─ UNENCODED    → declared, with a reason

PlayerState × Strategy     ──▶  ├─ reads        → the value function consults it
                                └─ ignores      → { field, because }
```

### Classification is three-way, because most of the vector is histograms

Most blocks are not projections of component fields at all. `knowledgeSlot(cellId)` is 70×3 = 210
slots, `mageTierSlot(speciesId, tier)` is 6×8 = 48, `cohortSlot(speciesId, occupation)` is 6×5 = 30.
Those are **histograms over entities**. `MAGE.tier` is therefore neither observable nor withheld: it
is observable *in aggregate* and withheld *per entity*, and a gate that demands a two-way answer
would force a false one on nearly every field in the registry.

So the third state is load-bearing, and it carries the name of the aggregate it feeds. That is also
what makes the lossiest mapping in the vector visible: `institutions` is **4 slots covering four
components** — `UNIVERSITY`, `UNIVERSITY_STAFF`, `LIBRARY`, `GRIMOIRE`. Everything a university is
reaches the player as four numbers. Whether that is right is a design question this change does not
answer; it only makes it impossible to keep not asking.

`PlayerState` is **named and structural** — one field per entitled trait, not a `Float64Array`. The
existing 400-slot vector becomes an *encoding* of it (`encode(PlayerState): Float64Array`) rather
than the definition of it. That inverts today's relationship, where the vector is the only statement
of what a player knows and it makes that statement positionally.

Three reasons for a named intermediate rather than naming the slots in place:

1. **Strategies get to read fields, not offsets.** `player.resources.favor` instead of
   `observation[36]`. The checklist can then be a field-name set.
2. **Withholding becomes expressible.** PvP needs traits that exist in state and must not reach the
   opponent — library depth, mage roster. Today there is nowhere to write "deliberately absent", so
   absence and oversight are indistinguishable.
3. **Encoding stays free to change.** Renormalizing a channel or splitting a block moves the digest,
   not the entitlement.

## The three gates

Each in the `worldComponentsWithPosition` idiom: a pure function returning `string[]` of problems, an
`assert*` that throws, and a test asserting empty.

| Gate | Turns red when | Fixed by |
|---|---|---|
| `unclassifiedTraits()` | a component field is none of observable / aggregated / withheld | deciding, in one line |
| `unencodedObservables()` | a `PlayerState` field reaches no slot and isn't declared unencoded | encoding it, or declaring why not |
| `unacknowledgedByStrategy(s)` | a strategy neither reads nor ignores a field | `reads:` or `ignores: {field, because}` |

The third is the checklist, generated. `StrategyDefinition` gains `reads` and `ignores`, and their union must be exact — not a subset.

**At block granularity, not field.** Nine blocks × twelve strategies is 108 decisions and a human
reviews them. A hundred-odd traits × twelve is ~1200 `because` strings, nearly all of them *"static
preference list, reads nothing"* — which gets bulk-generated once and never read again. That is the
hand-maintained checklist reimplemented in TypeScript, and it fails the same way. The user's
standard — by design or manually excluded — only holds at a granularity someone actually reads. **Adding an observable trait turns every strategy in the pool red
until each one decides about it.** That is the property being bought: forgetting stops being
possible, and excluding stays cheap.

`because` is prose and unenforceable, deliberately — same as `disprovedBy` on a metric and `because`
on an ascension stance. It is read by humans in review. What the machine enforces is that a decision
was *made*, not that it was wise.

## What this immediately surfaces

Two known holes get names on day one:

- **Action cost is unencoded.** `god-cost.json` prices sixteen actions and no strategy can see any of
  them. Either it becomes a `PlayerState` field with slots, or it is declared unencoded with a
  reason. It cannot stay unnamed.
- **The mask is not a substitute for observation.** Unaffordability today reaches a strategy only as
  a legality bit, so an unaffordable action is a *substitution* the agent never notices —
  `illegalActionRate` records zero for arms where the god can afford nothing. Naming price separates
  "may not" from "cannot pay for".

## Not in scope

- No change to `OBSERVATION_SIZE`, block order, or normalization. Purely additive; the digest and
  every baseline hold. Encoding new traits is a later, separately-measured change.
- No change to what any strategy *does*. `ignores` on every field of a static preference list is a
  legal and honest first state, and it is what most of the pool will declare.
- Not a price-aware strategy. That is the experiment this unblocks, not this change.

**And it does not gate that experiment.** A strategy can already see `favor` — the resources block
encodes `saturate(record.favor)` — but not what anything *costs*, so it cannot compute
affordability. Sixteen cost slots is a standalone additive change that unblocks a price-aware
strategy today. It should not wait on the entitlement work, and the entitlement work is what stops
the next such gap from going unnamed for a year.

## The sequence

0. **The inventory, before any code.** Enumerate `WORLD_COMPONENTS × Object.keys(spec.fields)`
   against the nine blocks and hand-classify every trait three ways. This is the checklist as a
   document, it costs one script, and it is the only thing that says whether the granularity above is
   right: thirty traits and this design is comfortable, a hundred and fifty and it needs coarsening
   before a line is written.
1. `PlayerState` + `project()` covering what the 400 slots already encode, with a test proving the
   projection round-trips to the existing vector unchanged.
2. `unclassifiedTraits()` over the registry, seeded from step 0's inventory.
3. `unencodedObservables()`, which is where cost lands as a declared gap.
4. `reads`/`ignores` on `StrategyDefinition`, backfilled across the pool.

Steps 0–3 change no behaviour and move no baseline. Step 4 changes no behaviour either — it only
makes the pool state what it looks at, which is how anyone finds the next `permissive-breadth`.

**Step 4 waits.** It edits `StrategyDefinition`, which every in-flight branch defining a strategy
will conflict with, and there are currently eight rebases in flight with at least two in
`mc-harness`. Land 0–3 now; take 4 after the integration wave settles, or land it as optional fields
plus a test rather than required ones.
