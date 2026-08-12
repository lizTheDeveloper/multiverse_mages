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

All of that comes from a single `store` hook and four params. Meanwhile Vancian and True Naming
measure as the same universe on almost everything, and differ in content by one number.

**So the thesis under test is not "four hooks are too few". It is "only one regime was ever
written."** This plan tests that thesis by writing three more and measuring them.

---

## Part 1 — The hook-space report

What each of the four hooks can and cannot express **today**, read out of
`packages/rules-magic/src/traditions/`. This is half the deliverable and nobody had written it.

### The frame that governs everything below

Two facts constrain the whole space, and neither is in any hook's own documentation:

1. **The four points split by clock** (`hook-for.ts:hookSourceFor`). `acquire` and `store` are
   world-time and resolve to the mage's **home** tradition. `cast` and `cost` are engagement-time
   and resolve to the **host's**. `portalHookSet` adds the one documented exception: the raider's
   *home* `cast` kind populates `preparedSpells` before she leaves.
2. **The W13 sweep instrument is entirely world-time.** Its ten `reference*` metrics and its arm
   metrics all sample standing world stocks. Therefore **`cast` and `cost` are invisible to the
   measurement that defines "a measurably different universe"** — which is the mechanical reason
   Vancian (whose entire identity is `cast`+`cost`) measured identical to True Naming.

The design rule that falls out: **a regime's mechanical identity must live in `acquire` or `store`.**
`cast` and `cost` can carry portal asymmetry and audio character, but a regime built only on them
reproduces the Vancian≈True-Naming null result by construction.

### `acquire` — how knowledge enters a mind

**Vocabulary (`acquire.ts`):** exactly four numbers — `researchCost`, `teachCost`,
`initialMastery`, `stolenMastery`. Two kinds: `standard` (pass-through) and `true-name`
(three integer params: `researchCostMultiplier`, `teachCostMultiplier`, `instanceMastery`).

**Can express:**

- Research made arbitrarily dearer or cheaper (fp multiplier, floored at 1 by `scaleCost` — a
  deliberate guard against a cheap node flooring to a cost of zero).
- Teaching made arbitrarily dearer or cheaper, independently of research.
- The mastery a *new* instance is born at, and separately the mastery a *stolen* instance arrives
  at.

**The single highest-leverage number in the hook, and it is not obvious:** `instanceMastery`
interacts with a threshold outside the hook. `DEFAULT_INITIAL_MASTERY` is 256; the teach threshold
is 512; and `setMastery`'s only rules-path caller lowers. So **an instance born below 512 can never
become teachable**, and True Naming's `instanceMastery: 1024` is not a flavour number — it is the
switch that turns teaching on at all (W13's probe: 1,513 lessons per run against Vancian's 134).
Any regime that wants a living oral transmission must set this ≥ 512.

**Cannot express:**

- **Decay.** Stated explicitly in the module doc: it "may not touch decay", and the containment is
  that it has *no vocabulary* for it. A regime whose thesis is "knowledge rots faster/slower here"
  is not authorable at `acquire`.
- **Prerequisite structure.** It cannot make a tradition reach different parts of the grid, gate
  cells, or change what is researchable — only what it costs.
- **Who may teach whom**, cohort effects, or any dependence on the number of holders. The four
  numbers are functions of the node alone.
- **Any per-acquisition state.** `AcquirePolicy` is pure and memoryless: it cannot make the tenth
  node cost more than the first, which is what a "the demon's price rises" regime would need.
- **Rediscovery separately from research.** The 3× rediscovery multiplier is applied by the caller
  *after* the hook, so a regime cannot be "bad at first discovery, good at recovering losses".

**Naming defect worth recording:** the `true-name` kind's vocabulary is entirely generic — three
scalars with no reference to names. It is the *only* non-standard `acquire` kind, and it is
therefore the kind every future regime must use regardless of fiction. Three of the four regimes
below declare `"kind": "true-name"` while having nothing to do with true names. Renaming it to
something like `scaled` is a one-line enumeration change; it is not made here because it would
churn the §2.5 table and the 0.3.0 release-claim tests for zero mechanical gain. **This is a
vocabulary defect, not a capability gap** — the hook can say everything these regimes need.

### `store` — where knowledge can live

**Vocabulary (`store.ts`):** the widest of the four, and the reason Art of Memory separated.
`holdableLocationKinds`, `personalLocationKind`, `slotsPerMage`, `scribingAvailable`, `lootableAt`,
`transferableAt`, `burnableAt`, `perishesWithHolder`, `libraryDepthCoefficient`. Two kinds:
`standard` and `palace` (params `slotsPerMage`, `lootable`, `burnable`,
`libraryDepthCoefficient`).

**Can express:**

- **Where a newly acquired instance lands** — the single most consequential choice in the hook.
  `contracts.md` §1.5 gives four location kinds (`mind`, `grimoire`, `library`, `palace`) and the
  policy may name any of them as `personalLocationKind`. Only two of the four have ever been used.
- Whether written copies exist at all (`scribingAvailable`). Turning this off zeroes grimoires,
  library depth, and `capitalSnowball` in one stroke, and makes the universe unraidable for
  knowledge.
- A hard per-mage capacity (`slotsPerMage`, 1–4096, or unbounded).
- Whether an instance survives its holder (`perishesWithHolder`) — i.e. whether knowledge is
  mortal or immortal.
- Whether an instance is an object that can be taken, handed over, or burned.
- How much a living mage's personal store contributes to institutional research capital
  (`libraryDepthCoefficient`).

**Cannot express:**

- **A new location kind.** `LOCATION_KIND` is closed in `@mm/state`. A regime needing a fifth place
  for knowledge to sit (a ley line, a bloodline, a place in the world rather than in a person) is
  not authorable, and this is the one genuine hard wall in the hook space.
- **Per-node or per-cell storage rules.** Every predicate takes a `locationKind` and nothing else,
  so "names may not be written down but everything else may" is inexpressible.
- **Capacity that varies with the mage.** `slotsPerMage` is one integer for the whole universe; it
  cannot scale with species, age, or mastery.
- **Migration between locations.** The policy says where an instance *lands* and what may happen to
  it there; it has no vocabulary for "instances drift from mind to palace over time".
- **Partial or lossy storage.** An instance is at a location or it is not.

### `cast` — how a held spell is expended

**Vocabulary (`cast.ts`):** two fields. `preparationRequired: boolean` and `slotsPerMage: number`.
Two kinds: `standard` and `prepared` (one param).

**Can express:** whether a spell must be readied in advance, and how many may be readied. That is
the whole of it. It is genuinely one boolean and one integer.

**Cannot express:** anything that is not "a list of node ids with a length cap". Not cooldowns, not
per-cast failure, not backlash, not casting that damages or transforms the caster, not casting from
a shared pool, not casting that consumes the knowledge itself (`expendOnCast` is explicit that the
instance is untouched, and deliberately so — conflating them would register casting as knowledge
loss).

**And it is invisible to the sweep.** Engagement-time, and the campaign's own diagnosis is that no
raids currently occur. A regime whose thesis lives here cannot be measured today.

### `cost` — what casting takes out of the caster

**Vocabulary (`cost.ts`):** **one boolean.** `paidAtPreparation`. Two kinds, `standard` and
`prepaid`, neither taking a single param. The hook's entire authority is *when* the caller's own
figure is charged; it cannot change the magnitude, and the invariant `costSplit` exists to assert
is that the two halves always sum to the caller's base cost.

**Cannot express:** a different price, a price in a different currency, a price paid by someone
other than the caster, a debt, a price that rises with use, or a price paid in anything but vigor.
Every one of the author's named regimes wants at least one of these at `cost` — a demon's deferred
debt, body horror's price in flesh, telepathy's cost borne by the group.

**This is the narrowest of the four hooks by a wide margin, and the honest statement is that it is
the one that would need widening first** — but see Part 4: widening it buys nothing measurable
until raids run, so this workstream does not widen it and does not propose to.

### Summary: what the hook space can and cannot do

| | can express | hard wall |
|---|---|---|
| `acquire` | cost of research, cost of teaching, mastery at birth, mastery when stolen | decay; prerequisite reach; any state or history |
| `store` | **which of four locations knowledge lands in**, capacity, writability, mortality, lootability, capital contribution | a **fifth** location kind; per-node rules; per-mage capacity |
| `cast` | preparation required, and how many slots | everything else; and unmeasurable today |
| `cost` | **when** the caller's price is charged | **the price itself** |

**`store` is the hook with real range and it has been explored at two of its four location kinds.**
That is the finding, and the four regimes below are built on it.

---

## Part 2 — The four regimes, with pre-registered metrics

Each regime states a thesis, the hook configuration that produces it, and **the metric that would
show it, named before the sweep runs**. Every magnitude is `tuningStatus: "untuned"` — the balance
harness cannot pronounce on any of these numbers and nothing here claims otherwise.

### R1 — The Covenant (deals with demons)

**Thesis.** *Your knowledge is not in your head. It is in the contract, and the contract outlives
you.* A pact mage does not study; she is told, completely, at once. What she has is a signed
instrument — portable, immortal, and exactly as safe as the vault it sits in.

**Hooks.** `store` is a **new kind, `bound-pact`**, whose `personalLocationKind` is `grimoire`:
acquisition itself creates the written instrument, so mind→grimoire scribing is not a separate act
and `scribingAvailable` is false. Instances do **not** perish with the holder. `acquire` uses
`true-name` with a research multiplier well below 1 (the demon simply tells you) and
`instanceMastery` at 1024 (a pact is complete or it is not).

**Pre-registered metric.** `referenceGrimoires` far above every existing arm (every acquisition
mints one, where a standard universe mints only what a scribe copies), and `capitalSnowball` above
True Naming's 0.2487. Knowledge immortal ⇒ `referenceNodesKnown` above Vancian's 65.8.

**Why it is a new kind.** No existing `store` kind lands a personal instance at `grimoire`;
`standard` lands at `mind`, `palace` at `palace`.

### R2 — The Flesh Codex (body horror)

**Thesis.** *Knowledge is cut into the body. It is cheap to inscribe, there is only so much skin,
and it is not on any shelf when you die.* A universe that keeps re-learning what it keeps burying.

**Hooks.** No new kind — `palace` with `lootable: true` and `burnable: true` (a body can be
harvested, which the existing params already say and nobody had ever set true), a **small**
`slotsPerMage`, and `libraryDepthCoefficient: 0` — flesh is not a library and nobody else can read
you. `acquire` makes research cheap, so the universe re-derives what it loses.

**Pre-registered metric.** The **churn signature**: `referenceNodesGained` high relative to
`referenceNodesKnown` — a universe that gains many nodes and holds few. Distinguished from Art of
Memory by `referenceNodesGained` and from everything else by `referenceLibraryDepth: 0`.

**Authorable today with zero code.** That is itself evidence for the thesis of this workstream: the
existing param space contains a body-horror regime nobody had written.

### R3 — The Chorale (magic as music)

**Thesis.** *Nothing is written; everything is sung, and the choir is the library.* Transmission is
the whole of the tradition — cheap to teach, dear to compose, unbounded in what one singer may
carry, and the institution's research capital is the living voices in it.

**Hooks.** No new kind — `palace` with an effectively unbounded `slotsPerMage` (against Art of
Memory's 12), `libraryDepthCoefficient` **above** Art of Memory's 768, and nothing lootable or
burnable. `acquire` uses `true-name` with teaching very cheap, research dear, and `instanceMastery`
≥ 512 so transmission is live.

**Pre-registered metric.** `referenceNodesKnown` far above Art of Memory's 17.2 while
`referenceGrimoires` stays at exactly 0 — the pair that separates it from both poles at once. If
Art of Memory's 17.2 is slot-bound, removing the cap must move it; if it is not, this regime
measures as Art of Memory and the plan says so.

### R4 — The Egregore (magic as telepathy)

**Thesis.** *No one knows anything. The university knows it.* An instance is created directly in
the institution's library; individual mages are the hands, not the vessels.

**Hooks.** `store` is a **new kind, `egregore`**, whose `personalLocationKind` is `library`.
Immortal (survives any mage), unscribable (there is nothing to copy out of a head), and its whole
character is that personal capacity and institutional capital are the same quantity.

**Pre-registered metric.** `referenceLibraryDepth` far above every existing arm — the maximal-capital
pole, against Art of Memory's 0.0 — with `referenceGrimoires` at 0 and `capitalSnowball` at the top
of the table.

**Why it is a new kind.** Same reason as R1: no existing kind lands a personal instance at
`library`.

### The pre-registered distance definition

The acceptance item *"at least two new regimes are as far from each other as Art of Memory is from
Vancian"* is defined **now, before the sweep**, so it cannot be defined afterwards to fit:

> Over the seven W13 metrics (ascension rate, grimoires, library depth, capitalSnowball, nodes
> known, living mages, population), a pair (A, B) qualifies if the normalised separation
> |mean(A) − mean(B)| / pooled SE **meets or exceeds** the Art-of-Memory-vs-Vancian separation on
> **at least four of the seven**. Common random numbers make the comparison paired, so the same
> seeds and the same strategy assignment stand behind every arm.

### The reference-tradition hazard, checked before authoring

`scribingTraditionId()` walks traditions in interned order — which `internSorted` makes
**lexicographic on the id string** — and returns the first whose `store` can scribe. Today:
`art-of-memory`(1) skipped, **`true-naming`(2) wins**, `vancian-memorization`(3) never reached. The
reference universe runs True Naming by accident of the alphabet.

**Every regime here declares `scribingAvailable: false`,** so none of them can win that loop no
matter where its id sorts, and the reference tradition must not move. This is not a coincidence
arranged to dodge a baseline regeneration — all four theses are "knowledge does not live in a
copied book" — but it is checked empirically rather than argued, and reported either way.

**The hazard remains and should be recorded as a defect independent of this workstream:** the
reference universe's tradition is selected by string sort order, so *any* future tradition whose id
sorts before `true-naming` and whose store can scribe silently re-baselines the entire balance
suite.

---

## Tasks

### 1. Hook-space report
- [x] 1.1 Read all four dispatch modules, `hook-for.ts`, `portal.ts`, `registry.ts`.
- [x] 1.2 Write Part 1 above: vocabulary and hard walls, per hook.
- [x] 1.3 Establish the clock/measurement rule that constrains regime design.
- [ ] 1.4 Annotate Part 1 with which policy fields are live in the world loop vs unreachable.

### 2. Content and code — new kinds only where the vocabulary genuinely cannot reach
- [ ] 2.1 `bound-pact` store kind: `hooks.ts` enumeration, `store.ts` dispatch, `contracts.md` §2.5 row.
- [ ] 2.2 `egregore` store kind: same three places.
- [ ] 2.3 Author all four regimes in `packages/content/data/tradition.json`.
- [ ] 2.4 Glosses and `tuningStatus` for every magnitude — resolve where they may legally live,
      since `checkHookParams` rejects undeclared params and `TraditionRecord` carries neither today.
- [ ] 2.5 Sound-design §4.4 rows for all four, in the house format.

### 3. Tests, written first
- [ ] 3.1 Extend the enumeration-parity test's expectations (code and `contracts.md` in one commit).
- [ ] 3.2 Extend `tradition-differentiation` to the new regimes.
- [ ] 3.3 Assert `scribingTraditionId()` still returns `true-naming` with seven traditions loaded.

### 4. Measure
- [ ] 4.1 One sweep file per new arm, single-level `tradition` factor, sharing `sweepId` and
      `rootSeed` with the existing arms so CRN holds. n ≥ 96.
- [ ] 4.2 Verify CRN post-hoc, as W13 did: seed and strategy mismatches must be 0.
- [ ] 4.3 Report the per-tradition table in W13's format, all seven arms.
- [ ] 4.4 Evaluate the pre-registered distance definition and report the number, held or not.

### 5. Gate
- [ ] 5.1 `npm run verify`. **A failing golden fixture is a STOP-and-report, never a regen.**
- [ ] 5.2 Report whether the reference tradition moved, with the check that shows it.

## Result

*(written after the sweep, whether or not the thesis holds)*
