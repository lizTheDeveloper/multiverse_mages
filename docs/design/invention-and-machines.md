# Invention, and where machines come from

**Measured 2026-08-16 on `integration/all-branches` @ `4621db1a`** — the tree carrying the seven-kind
material economy with all seventy grid cells open. Every number below was read off that tree; the
proposals are marked as proposals.

This document exists because a design decision turned out to have already been made, in data, by
somebody authoring a yield table — and nobody had written down that they had made it.

## 1. The finding: the grid already sorts itself into physical and abstract

`packages/content/data/form.json`, read whole:

| form | yields | |
|---|---|---|
| imaginem | `insight: 1024` | **abstract** |
| mentem | `insight: 1024` | **abstract** |
| umbra | `passage: 1024` | **abstract** |
| fatum | `passage: 1024` | **abstract** |
| limen | `passage: 1024` | **abstract** |
| animal | `food: 512, vellum: 512` | physical |
| aquam | `food: 768, stone: 256` | physical |
| auram | `food: 256, stone: 768` | physical |
| corpus | `labor: 1024` | physical |
| herbam | `food: 512, vellum: 512` | physical |
| ignem | `stone: 1024` | physical |
| terram | `stone: 1024` | physical |
| vim | `essence: 1024` | physical |
| nomen | `vellum: 1024` | physical |

**Five forms yield only the abstract stocks. Nine yield only physical ones. Not one form is mixed.**

That partition was never stated as a rule. It emerged from authoring fourteen rows one at a time,
and it is exact — which is the kind of accident worth keeping deliberately.

## 2. Invention is not a new axis. It is the five abstract forms.

The question that prompted this was whether *invention* should be a fifteenth **form** (`Machina`,
a noun, 5 × 15 = 75 cells) or a sixth **technique** (a verb, 6 × 14 = 84 cells, and a wider ruleset
bitmask). The author's answer was neither:

> "Like imaginem and fatum and umbra and all kinds of stuff are the magic of invention." … "mentem"

Four of the five named directly; `limen` — the threshold — is the fifth and belongs to the set on
the same evidence.

So there is nothing to add. `GRID_TECHNIQUE_COUNT` stays 5, the nineteen ruleset switches stay
nineteen, `contracts.md` §1.1 is untouched, and no god action changes its parameter bound. **The
capability was already in the grid; only the name was missing.**

## 3. Then a machine is a cell-pair, not a noun

If invention is abstract production, and a machine is a physical thing that goes on producing after
it is made, then a machine is **abstract production applied to physical production**: Imaginem or
Mentem conceiving what Terram or Ignem builds.

That is a relationship between two cells, and the content graph already carries relationships
between cells. Measured on this tree: **301 nodes, 293 prerequisite edges, 36 of them crossing
cells**, tiers 1–7, live at runtime through `prerequisitesOf` in
`packages/rules-magic/src/grid.ts`. 109 of the 301 nodes sit in abstract-form cells.

**Proposal.** A machine is a node whose prerequisites span an abstract cell and a physical one. It
needs no new component, no new form, and no new gate — it needs authoring.

## 4. The tech tree is emergent, and it already exists

The author was explicit that no *strict* tech tree is wanted, and none is needed. A thing you
cannot build until later is already expressible twice over:

1. **Depth** — a node whose prerequisite closure runs deep. The graph is tiered 1–7 and every edge
   runs low tier to high.
2. **Permission** — a cell the god has not armed. `permits()` is bitmask-only, so an unopened
   column is a starting position rather than a wall.

A machine gated by *both* — deep prerequisites spanning two cells the god must have armed — is late
by construction, without a tech tree existing anywhere as an object. **Any proposed machine gate
that is neither a prerequisite edge nor a `permits()` bit has to justify why these two are
insufficient.**

## 5. The consequence that makes it a design rather than a taxonomy

`insight` and `passage` are not free. They already drain:

- **`insight` → teaching throughput**, at the lectern, joined to the existing `teach-rate` source
  array under its single `fp(4096)` cap.
- **`passage` → opening a portal.**

So if inventing a machine spends `insight`, **machines compete with teaching for the same stock.**
The university that mechanises its quarry teaches fewer students that season. That tension is not
designed in; it falls out of a structure that already exists, and it is the strongest argument that
this reading is the right one — a taxonomy would have no consequence at all.

The same holds on the other side: a machine that spends `passage` competes with raiding.

## 6. The enhancement stack

The author's frame: everything has labour, the labours differ by trade, and *"they can all be
enhanced by magic, also by machines, super by magic machines."*

Read against the above, the stages have natural referents:

| stage | what it is |
|---|---|
| base | a trade's populace output — a formula over cohort headcount, not an entity |
| magic | a cast on that trade, `resource-yield` routed to a kind by the node's form |
| machine | invention magic spent **once**, yielding thereafter without further casting |
| magic machine | a machine **still being cast upon** — both multipliers live at once |

**Open, and not to be assumed in the flattering direction:** whether *"super"* is genuinely
super-additive or is simply two multipliers stacking under the existing `fp(4096)` cap. The cheaper
reading is that `stackMagnitudes` already carries it unchanged. That should be measured before any
new mechanism is proposed.

## 7. What would falsify all of this

- **§1** — a form authored with a mixed yield. The partition is currently exact; one counter-example
  and it is a coincidence rather than a structure.
- **§2** — glosses in the five abstract cells that do not read as inventive. This claim rests on a
  yield table, and the fiction is the independent witness. An audit of all 301 names and glosses is
  the check, and it was commissioned alongside this document.
- **§3** — if authoring machines as cross-cell nodes needs a mechanism the graph cannot express, the
  cell-pair reading is wrong.
- **§5** — if `insight` turns out to be abundant enough that machines never actually compete with
  teaching, the tension is decorative. That is a measurement, and **there are no baselines on this
  tree to take it against yet**, deliberately: 110 reachability findings remain, and a number taken
  now would measure the connected parts and present itself as the whole.

## 8. What this does not settle

- **Labour by trade.** Farmhand, herder, quarrier and stoneworker are one `laborer` occupation and
  one `labor` kind today. A sixth occupation is a contract change guarded by a throw in
  `packages/rules-world/src/populace/cohort-store.ts`.
- **The chain inside `food`.** Fields produce plants, animals eat plants, both are food. That is a
  consumer which is itself a producer, hidden in a single stock — and note `food` shortfall
  currently kills nobody, it brakes fertility, so a herd that starves has no modelled consequence.
- **Who builds a machine.** The god *"never commands a mage"* (vision §1, §2 Pillar 3, §7), so a
  machine has to arise from mage autonomy or from a pressure verb, never from an order.
