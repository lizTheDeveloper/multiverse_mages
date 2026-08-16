## Why

**Magic makes materials the god can never spend, and half of magic makes nothing at all.**
Three measurements, all taken 2026-08-15 against `origin/main` @ `edcaf591`.

**1. Seven of the fourteen forms yield nothing.** `packages/content/data/form.json` gives every
form a `yieldWeights` map over `{food, stone, vellum}`. Seven are `{0, 0, 0}`:

| form | food | stone | vellum |
|------|------|-------|--------|
| ignem, terram | — | 1024 | — |
| nomen | — | — | 1024 |
| aquam | 768 | 256 | — |
| auram | 256 | 768 | — |
| animal, herbam | 512 | — | 512 |
| **corpus, imaginem, mentem, vim, umbra, fatum, limen** | **0** | **0** | **0** |

**And the v1 opening square is half dead.** The shipped opening is
`intellego · perdo · rego` × `mentem · terram · limen · nomen`. Of those four forms **`mentem`
and `limen` both yield zero**, so a god who opens on mind-magic and thresholds generates no
economy at all and the interface gives no way to find out why.

**2. No god action costs a material.** All seventeen rows of
`packages/content/data/god-cost.json` carry exactly one price field, `favorCost`. There is no
material cost anywhere in the action space. So the game holds **two economies that never meet**:

    god:      worship  ->  favor      ->  the seventeen verbs
    populace: forms    ->  materials  ->  subsistence, building, scribing

Magic produces materials; the god's decisions never touch them. A player asking *"what is my
economy doing"* is asking about a system their verbs cannot reach.

**3. The observation sums the three stocks into one number.**
`packages/agent-api/src/observation.ts` is explicit and correct about why — §4.1's block is fixed
at five slots and *"a resize invalidates every trained agent"* — but records the consequence as an
open question: *"an agent cannot yet tell a food shortage from a vellum one."* The UI inherits it.
`ui/console/` prints `MATERIALS 2982` and there is no reading of the page that distinguishes a
famine from a parchment shortage.

Every row of both tables is `tuningStatus: untuned`.

### The shape this change is not

`docs/design/economy-flow-models.md` already supplies the vocabulary and should be read first: a
**converter** changes resource type and breaks conservation while a **trader** changes owner and
preserves it; a **spill** that silently truncates at a cap *"both breaks conservation and destroys
the signal that would feed back to whatever is overproducing."* This change adds converters
deliberately and must not add silent spills.

## What Changes

**A. Four new material kinds, so that every form yields something.** `MATERIAL_STOCK` gains
`labor`, `essence`, `insight` and `passage` beside `food`, `stone` and `vellum`. Each new kind
takes its fiction from the forms that produce it and is spent by a sink that already exists:

| kind | produced by | spent on |
|------|-------------|----------|
| `labor` | corpus | construction rate — raising a university faster |
| `essence` | vim | enchanting; the price of a dispensation |
| `insight` | mentem, imaginem | university teaching throughput |
| `passage` | limen, fatum, umbra | opening a portal, and holding it |

**B. God actions cost materials, not only favor.** `god-cost.json` gains an optional
`materialCost` map beside `favorCost`. The systemic rule the tables should satisfy: **a verb that
makes a thing in the world spends the material that thing is made of.** `fund-university` spends
stone and labor; `grant-founding-knowledge` spends vellum; `open-portal` spends passage;
`issue-dispensation` spends essence; `bless-mage` spends insight. Favor remains the pacing
currency and does not go away.

**C. The player can see the stocks separately.** `PlayerState.resources.materials` is documented
as `food + stone + vellum` and stays, because §4.1's five slots are a contract. A **named**
per-kind block is added to `PlayerState` — which is not the observation vector and carries no
digest — so `player-state.ts`'s reducer, the play server and any UI can read seven stocks while
the trained agent's 400 slots do not move.

**D. A faucet/sink ledger with a conservation assertion.** Per tick, per kind, record what was
produced and what was consumed, and assert the stock delta equals faucet minus sink. This is
`economy-flow-models.md` §3.4's recommendation and it is the only part of this change that can
fail loudly when the rest is wrong.

## Impact

- **`WORLD_SCHEMA_VERSION` moves to 7.** `MATERIAL_STOCK` gains fields, and `worldSchemaVersionOf`
  identifies a revision by which components exist — an appended *section* is detectable and an
  added *field* is not, per the note already in `components.ts`. The migration must be written
  deliberately; every existing save and every hand-built test world must keep its behaviour, which
  means an absent kind reads as zero rather than as a shortage.
- **`SNAPSHOT_VERSION` does not move.** It is inside the hashed header and moving it would break
  every golden fixture with a version error instead of a behaviour diff.
- **`contentRevision` moves** — `form.json` and `god-cost.json` both change. Expect the
  `interning.test.ts` digest literal to move once, and record the union rather than picking a side.
- **Balance baselines move, and should.** Adding costs to verbs that were free changes what every
  strategy can afford. This is an accept, not a regression, and the sweep should be re-recorded
  with the reason stated.
- **The seven inert forms sit in cells that v1 does not enable**, except `mentem` and `limen`,
  which are in the opening square. If this change ships in slices, that pair is the slice that
  matters.
