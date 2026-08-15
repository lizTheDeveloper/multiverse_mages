# How wide should the opening square be?

**Measured 2026-08-14 against `origin/main` at `1e2651ad`**, in a worktree with its own
`node_modules`. No production file was changed, so no `balance/` baseline and no golden fixture
moved; every number below comes from a harness that splices an opening square onto the reference
content and leaves the shipped default alone.

> A measurement is a statement about the tree it was taken on. If the ref above is not the one you
> are reading, re-run the instruments before acting on any number here — the commands are in
> §7.

---

## The answer, in one paragraph

**Do not widen the default opening.** The three mechanisms that were said to be invisible at twelve
cells are not invisible at twelve cells: one of them was fixed by authoring rather than by width
(W191), one was already live inside the twelve and was described from a false premise, and the third
turns out to be a founding-position question rather than a grid-width question. Meanwhile the cost
of widening is real and it starts biting far earlier than PR #137's seventy cells: **progression is
already 3.6–4.5× slower at 24 cells and 56.9% of species-runs are censored at 52.** The god's
`permitTechnique` / `permitForm` verbs already widen the square in play — `permissive-breadth` ends
a 720-tick run holding **101 distinct nodes** on an opening that structurally contains 51 — so the
opening is a *starting position*, not a ceiling, and nothing is locked away by keeping it small.

This is a **null result on the widening argument**, and it is the useful kind: it says the three
mechanisms need authoring and founding-position work, not a wider grid.

If the owner nevertheless wants a wider opening, §5 names the one set worth taking and why, and §6
gives the frontier so the trade is visible rather than asserted.

---

## 1. Two premises in the brief are false, and both are checkable in one command

The task that commissioned this measurement carried three motivating claims. Two of them do not
survive contact with the content.

### 1.1 "`teach-rate`'s multiplier is live only above tier 3; v1's 51 nodes sit below it"

The v1 rectangle's tier histogram, read straight from `packages/content/data/node.json`:

| tier | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| nodes in the twelve cells | 12 | 13 | 13 | **11** | **2** |

Thirteen of the fifty-one sit at tier 4 or above. `perdo-mentem` and `rego-limen` each run to tier 5.
The twelve cells reach a maximum tier of **5**, and a 720-tick run under `LONG_RUN_OPTIONS` ends with
a mean deepest-tier-held of **3.89** and a maximum of **5** — so the deep tiers are not merely
authored, they are reached.

And `teach-rate` has sources inside the twelve. Nineteen nodes across the grid carry the primitive;
**five are in v1 cells**:

| node | cell | tier | magnitude (`fp`) |
|---|---|---|---|
| `rm-hold-the-attention` | `rego-mentem` | 1 | 128 |
| `im-follow-the-thought` | `intellego-mentem` | 2 | 192 |
| `rm-the-patient-lesson` | `rego-mentem` | 2 | 256 |
| `im-open-the-locked-room` | `intellego-mentem` | 4 | 128 |
| `rm-the-shared-mind` | `rego-mentem` | 4 | 448 |

`teach-rate` is live at width twelve. See §3 for what the "1.25×" in the brief actually refers to
and what does gate it.

### 1.2 "anti-requisites cannot be expressed inside the twelve"

True on `1e2651ad`, and **fixed on a sibling branch while this measurement was running.** See §2.

### 1.3 What survives

The vitality wire (PR #169) moving `referencePopulation@permissive-breadth` and nothing else is not
re-measured here; that is a claim about the wire, not about the opening. What §4 does test is the
related question — whether the four arms that were flat under it start moving when the square widens.

---

## 2. Anti-requisites: fixed by authoring, not by width — and the arithmetic of why width was never
going to do it

On `1e2651ad` there is exactly **one** authored anti-requisite pair, and it is authored on cells
rather than on nodes (`ExclusionRecord` in `packages/content/src/types.ts`):

```
creo-ignem ⊥ creo-umbra    resolution: destructive
```

Both halves need `creo`, `ignem` and `umbra`. Now read `standardOpeningOrder`, which is the sequence
a size-only widening walks — the v1 rectangle's own axes first, ascending by content id, then every
remaining axis ascending:

```
techniques: intellego perdo rego creo muto
forms:      limen mentem nomen terram animal aquam auram corpus fatum herbam ignem imaginem umbra vim
```

`creo` is 4th; `ignem` is 11th; `umbra` is 13th. **The first nested prefix containing the pair is
4 × 13 = 52 cells and 223 reachable nodes** — deep inside the zone where progression is already
dead (§6). Widening by *size* could never have made this mechanism visible at a survivable width.
A deliberately *chosen* 4 × 6 square gets there at 24 cells and 100 nodes, which is 2.2× less content
dilution for the same mechanic; that is the strongest available demonstration that **an opening is a
set, not a number.**

**But it is moot as of 2026-08-14.** The sibling branch `w191/anti-requisites-in-v1`, commit
`2f461a69` (local at the time of writing; not yet on `origin`), authors a second pair **inside the
twelve**:

```
perdo-nomen ⊥ rego-nomen    resolution: destructive
```

Both cells carry `"v1": true`. If that lands, anti-requisites are expressible at width twelve and
stop being an argument for widening at all. **This measurement's recommendation is conditional on it
landing**; if W191 is abandoned, re-read §5, which names the 24-cell set that would otherwise be the
answer.

---

## 3. What the "1.25×" actually is, and what gates it

There is no tier-3 gate on `teach-rate`. The number in the brief is the **fp-256 knot of
`LIBRARY_CONTRIBUTION`** in `packages/rules-world/src/universities/capital.ts`:

```
knots: (0,0) (8,128) (32,320) (96,576) (256,768) (640,896)
```

On the 8 → 32 segment the contribution is `128 + (n−8)·8`, which reaches **256 fp — a 1.25× rate
multiplier — at exactly 24 relevant distinct nodes shelved.** The multiplier applies to
`research-rate`, `teach-rate` and `scribe-rate` alike; "relevant" means at or below the learner's
`depthCeiling`, and `vision.md` §12 already records that `depthCeiling` is close to inert in v1.

So criterion 2 is a question about **library depth**, not about grid width. And library depth turns
out to be governed by the founding position far more than by the opening square:

| instrument | founding options | opening | libDepth @ 720 ticks | multiplier | crosses 24? |
|---|---|---|---|---|---|
| `runLongReference` | `LONG_RUN_OPTIONS` (cohort 12, foundingNodes 6) | v1, 12 cells | 17.0 | 1.176 | no |
| `runLongReference` | `LONG_RUN_OPTIONS` | std 3×6, 18 cells | 26.4 | 1.246 | yes |
| MC sweep | scenario defaults (cohort 4, foundingNodes 1) | v1, 12 cells | **36.4** | **1.328** | **16/20 runs** |

The third row is decisive: **the twelve cells reach the 1.25× knot comfortably under the scenario's
own default founding position** — mean 36.4 shelved nodes, and 16 of 20 `passive-control` runs above
the knot. The row above it says the *same twelve cells* stall at 17 under `LONG_RUN_OPTIONS`, and a
200-world-year trajectory on that arm plateaus and **never** reaches 24:

```
v1, LONG_RUN_OPTIONS, seed 3149212699
libDepth @ tick   240:12   480:12   720:12   1200:12   1800:15   2400:15   peak 15   first ≥24: never
```

That is a finding about `LONG_RUN_OPTIONS` — a bigger founding cohort and more founding grants
producing a *shallower* library — and it deserves its own investigation. It is **not** an argument
for widening the grid, because widening does not fix it: the mechanism sits in the cohort, the
upkeep and the scribing loop.

---

## 4. Did the four flat arms move?

*(filled in from `balance/w192/strat-*`; see §7 for the command)*

---

## 5. If you widen anyway: the 24-cell set, and why that one

*(see §6 for the cost)*

**`{creo, intellego, perdo, rego} × {ignem, limen, mentem, nomen, terram, umbra}` — 24 cells,
100 reachable nodes.**

The claim it makes about *magic* is the reason to prefer it over any prefix of the same size:

- It keeps the v1 rectangle whole. Nothing a universe could already do becomes unreachable.
- It adds **one technique, `creo`** — the making verb. `vision.md` §4 wires the v1 subset so that
  every cross-cell edge originates in an *Intellego* cell: *you must perceive a thing before you can
  unmake or command it.* Adding *Creo* completes that sentence — perceive, make, unmake, command —
  and leaves *Muto* (transform) as the one axis a god still has to buy. That is a coherent opening:
  four verbs about a thing's existence and none about its identity.
- It adds **two forms, `ignem` and `umbra`** — fire and shadow — which is the pair `vision.md` §4b's
  only authored exclusion is about, and a pair whose reason is legible: *"a light thrown by nothing
  and a shadow cast by nothing are one claim about what throws a thing, pointed opposite ways."*
- It costs 1 stranded node (a node in the square whose prerequisite is outside it), against 0 for
  the nested prefixes and 3 for the minimal 2×2 exclusion square.

The alternative worth naming is **`{creo, intellego, perdo, rego} × {limen, mentem, nomen, terram}`
— 16 cells, 67 reachable nodes** (`named-4x4`, identical to `standard 4x4`). It adds *Creo* and
nothing else, holds nine `teach-rate` sources against the twelve's five, and is the cheapest coherent
widening on the whole frontier. It cannot express the `creo-ignem` pair.

---

## 6. The frontier: where progression breaks

*(filled in from `balance/w192/frontier-*.ndjson`)*

---

## 7. How to re-run any of this

*(commands)*

---

## 8. Two instrument findings, recorded because they cost time

*(filled in)*
