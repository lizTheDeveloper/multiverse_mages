# Daily relevance: the first authoring pass

**Status:** first pass, content-authored. 70 of 70 cells, every one `tuningStatus: "untuned"`.
**Applies to:** `packages/content/data/cell.json`, fields `dailyRelevance` and `relevanceGloss`.
**Consumed by:** `packages/coordination/src/god/system.ts`, `yieldSources` — the one place a
`worship-yield` magnitude becomes a number the favor economy reads.
**Vision:** §7 (worship and favor, and the snowball it admits), §2.2 (the grid), §8 (the god's economy).

---

## 0. Why this document exists

The design is one sentence:

> Give each cell a `dailyRelevance` weight — the share of ordinary people whose daily life the cell
> touches — and make worship yield scale with it. **Water and crops and roads out-worship
> spectacular destruction.**

That sentence fixes the *rule* completely and the *numbers* not at all. Seventy cells need a value,
and the values are the design: a pass that put every cell within a hair of the mean would satisfy
the sentence and mean nothing, and a pass that scored cells by how impressive they sound would
satisfy nothing.

So the numbers are argued here rather than tuned into existence, and they are argued **cell by
cell** so that a reader can disagree with call number four specifically rather than with the pass
generally. `docs/design/metis-authoring.md` did the same job for `knowledgeKind` and is this
document's model, down to the shape of its probes.

### What the field buys, mechanically

`worship-yield` is one of only two node-authored primitives that reach the running simulation
(`portal` is the other). It multiplies favor **regeneration** — additively stacked into `(1 + Σ)`,
capped by `contracts.md` §3, and it never touches `favorCap`. Relevance multiplies each magnitude
before it enters that stack.

The reason this is worth a whole field is §7's admitted snowball: worship buys favor, favor buys
permits, permits buy worship. **Relevance is bounded by population share rather than by power.** It
is the only term in the loop that cannot be grown by playing well — you can permit more cells, but
you cannot make a cell touch more lives than there are lives — so the loop acquires a ceiling that
belongs to the ruleset instead of to the run.

It also gives a permissive ruleset a *shape*. Permitting broadly is currently strictly safe: a
dispensation costs an edict slot and returns whatever the cell happens to hold. Under relevance you
can permit a great deal of magic nobody's life touches, and be paid for none of it.

---

## 1. The principle

**The discriminating question, asked of every cell:**

> If every mage in the universe vanished tonight, what share of ordinary people would notice within
> a month — not by hearing about it, but because something they do every week stopped working?

Note what that question is *not* asking. It is not asking how powerful the cell is, how frightening
it is, how much a king would pay for it, or how deep its tier ceiling runs. `perdo-mentem` can
unmake a mind and scores 192. `creo-aquam` draws water and scores the ceiling. The whole field is
one axis and the axis is **reach into ordinary weeks**.

Five probes make the question operational. The first three argue a cell up; the last two argue it
down, and they are the reason the pass did not simply rank the forms by how agricultural they sound.

### Probe 1 — The absent-mage test

Would the loss be *felt*, by people who never meet a mage?

> `creo-aquam` — *"a well that does not fail is the one working every person in reach of it uses
> every day of their life without ever seeing it cast."*

The village does not know a mage made the well. The village knows the well. **High.**

### Probe 2 — The census test

What fraction of households contains someone whose week this touches?

> `intellego-ignem` — *"judging a kiln, the colour of ready iron … a trade's eye."*

Smiths, potters, bakers, limeburners. That is a real and recurring fraction of a town and it is
nothing like all of it — which is what 448 means and what a cell scored on vibes would have put
much higher, because forges are exciting. **Middle.**

### Probe 3 — For, or to?

Does the working act *for* the people in its area, or *on* them?

> `creo-auram` — *"three of these five workings are storms, and a storm is something done to a
> district rather than for it."*

Reach is not the same as service. A called storm reaches everyone in the valley; it is not part of
anyone's week. This probe is what keeps the destruction row honest without flattening it, and it is
what pulls `creo-auram` (512) well below `intellego-auram` (768), which is the same weather read
instead of made.

### Probe 4 — Fear is not reach (argues down)

Does the cell's claim on ordinary life consist of people being *afraid* of it?

> `perdo-corpus` — *"everyone fears this and almost no one's day contains it."*

Every peasant in the universe would name a withering curse among the things they dread. None of
them structures a week around it. Relevance is a share of lives touched, not a share of nightmares,
and this probe cost the whole `perdo` row about two hundred points it would otherwise have gathered
on dread alone.

### Probe 5 — Knowing is not having (argues down)

Does the cell produce a thing, or only a fact about a thing?

`intellego-aquam` scores 704 against `creo-aquam`'s 1024, and `intellego-terram` 576 against
`creo-terram`'s 768. Knowing where the water is matters enormously and is not the same as the water
being there. The `intellego` row is high — much higher than a naive "perception is a mage's
business" reading would put it, because diagnosis, weather and soil are the three most consulted
questions in an agrarian life — but it sits under the `creo` row consistently, and deliberately.

### The technique gradient, and its exceptions

The pass did not start from a formula, but one fell out of it, and stating it makes the exceptions
legible:

**creo ≥ rego > intellego ≈ muto > perdo**

`creo` makes the thing; `rego` is the infrastructure verb — the channel turned, the herd driven, the
stone set, the fire held off; `muto` is a craft verb and `intellego` a consultative one; `perdo`
destroys. Three cells break it and each break is argued below: `perdo-ignem`, `rego-ignem` over
`creo-ignem`, and `intellego-auram` over `muto-auram`.

### What relevance is *not*

**It is not tier, and it is not power.** `creo-vim`'s `The Made Vis` is a tier-5 working that
rewrites a university's economy and sits in a cell scored 64. The cell is invisible to everyone who
is not a mage, and that is the entire measurement.

**It is not moral.** `perdo-ignem` at 704 is the highest-scoring cell on the destruction row
because putting fires out is civic, and `rego-nomen` at 384 includes binding a servant. The field
scores reach, not virtue; a separate axis for that would be a different design.

**It is not a share of *magic*, it is a share of *people*.** Two cells can both be scored 512 and
mean entirely different things — `creo-fatum` because half its nodes touch everyone and half touch
one person, `muto-ignem` because it touches a real trade constantly. The number is the population
share, integrated over the cell's typical working, and the gloss is what disambiguates them.

---

## 2. The distribution

| band | value | cells | what lives there |
| --- | ---: | ---: | --- |
| the ceiling | 1024 | 1 | `creo-aquam` |
| near-universal | 832–960 | 8 | water, crops, healing, roads, diagnosis, the managed landscape |
| most people | 640–768 | 9 | building, weather-reading, livestock, hearth-fire, firefighting |
| a large minority | 448–576 | 17 | trades, herding, oaths, surgery, divination, quarrying |
| a minority | 256–384 | 14 | scholarship, names, thresholds, illusion, curses |
| specialists | 128–224 | 15 | shadow, counter-illusion, boundary-breaking |
| mage-facing only | 64–96 | 6 | the five `vim` cells and `perdo-umbra` |

The shape is deliberate and worth stating because it is falsifiable: **the distribution is
top-heavy on `creo` and `rego`, bottom-heavy on `perdo` and `vim`, and the `intellego` row is
higher than anyone expects.** If a later tuning pass flattens it, the mechanic stops doing anything;
if it stretches it, `worship-yield` in low cells rounds to nothing and the cells become
indistinguishable from each other at the bottom. Both are visible in one glance at this table, which
is why the table is here.

**Every value is a multiple of 32, and most are multiples of 64.** A relevance of, say, 707 would
claim a precision no argument in this document supports. The ladder is coarse on purpose: the pass
can defend "this is a two-thirds cell and that is a half cell" and cannot defend a per-cent.

### What this does to the numbers, stated up front

Every value is ≤ `fp(1024)`, because a share of a population cannot exceed the population. So
applying this field **reduces every worship-yield contribution in the game**, uniformly for a cell
at the ceiling and by 94% for `creo-vim`. That is not a side effect to be normalised away: the
authored `worship-yield` magnitudes were written against an implicit relevance of 1, and the
correct response is to re-tune those magnitudes — which is exactly what `tuningStatus: "untuned"`
on all seventy cells is a promise to do. **This pass moves balance baselines and says so.** What it
must not do is move them by accident, which is why the paired measurement in `tools/w60/` reports
the effect directly rather than through a gate.

---

## 3. The ten hardest calls

### 1. `perdo-ignem` — **704**, and the reason this document exists

The rule as written invites reading the whole `perdo` row as spectacle and scoring it near the
floor. This cell refuses:

> Snuff. Take the Warmth. **The Unburnt Library. Nothing Will Catch.**

In a universe of thatch, timber and open hearths, a working that stops fire spreading is the single
most valuable civic thing on the grid. Nothing else in the file is as close to a public service. It
outscores `creo-ignem` (640), which is the cell that *makes* fire, and it outscores every other
destruction cell by more than double.

If the pass had produced a tidy `perdo` row it would have been a pass about the word "destroy"
rather than about what the cells do, and this is the call that proves it isn't. It is also the call
most likely to be wrong: the argument leans hard on a pre-modern fire regime that the vision does
not state anywhere. **If the setting turns out to be stone-built, this drops to about 384.**

### 2. `creo-vim` — **64**, and why the floor is not zero

Every `vim` cell is scored 64 or 96. `vim` is magic about magic: aura, vis, the price of a working,
the standing prohibition. Nobody outside the craft can perceive any of it, and the absent-mage test
returns *nobody notices* almost by construction.

The temptation was zero, and zero is wrong for a mechanical reason worth writing down. `worship-yield`
stacks into `(1 + Σ)`; a source of exactly zero is indistinguishable from a source that is not
there, which would make "this cell yields nothing" and "this cell carries no `worship-yield`" the
same state — and they are not the same state, because the first is a tuning claim and the second is
a content fact. 64 keeps them distinct and keeps a `fp(384)` magnitude contributing 24 rather than
0, which is small, visible, and honest.

It is also the call the mechanic most depends on. `creo-vim` carries two of the eleven `worship-yield`
nodes in the file. If the spread between it and the fate cells is not large, the mechanic does not
exist.

### 3. `intellego-fatum` — **448**, against a real objection

Divination is the single most *popular* thing on the grid. Everyone casts the lots; everyone reads
omens; a village consults them constantly. On a naive census probe this is a 900-point cell.

It scores 448, and the reason is Probe 3: consulting the lots changes nothing that was going to
happen. Enormous appetite, no reach. **Relevance is measured in lives touched, not in lives
interested** — the same distinction Probe 4 makes for fear, arriving from the opposite direction.

This is the most arguable number in the file. A reader who holds that a practice everybody performs
weekly *is* by definition part of their week has a real case, and the counter is that the field
feeds `worship-yield`, which is a payment for a god's magic doing something for people. Under that
reading, popularity that produces nothing is exactly what should not be paid for.

### 4. `perdo-corpus` — **256**, the counter-case to call 1

Having argued `perdo-ignem` up, the pass has to show it did not simply promote the whole row.
`perdo-corpus` is a withered hand, a long fever, years taken. Its reach is enormous *as a fear* and
minute as a practice: it is aimed at one person at a time and its use is rare, secret and criminal.
256.

The pair `perdo-ignem` 704 / `perdo-corpus` 256 is the clearest statement of what the axis measures
that this document contains. Both destroy. One is a fire brigade and one is a curse.

### 5. `rego-mentem` — **448**, and the temptation to tune it

`rego-mentem` is the only worship-bearing cell inside the v1 rectangle, so it is the only one whose
relevance moves any number anyone has ever measured. Every other carrying cell is dark until the
grid opens further.

That made it the one cell where authoring and tuning were hardest to keep apart, and the discipline
was to author it as though it were dark like the rest. What it holds is *Hold the Attention, The
Patient Lesson, Kindle Devotion, The Shared Mind*: a classroom and a congregation. A congregation is
a real share of a population and nothing like all of it. 448 — squarely mid-table, below every
water, crop and road cell and well above the mage-facing ones.

The consequence is stated rather than hidden: **the shipped reference universe's worship-yield falls
to roughly 44% of what it was**, because 448/1024 is what its only carrying cell now contributes.
That is a large committed-baseline movement produced by an authoring judgement, and it is the
strongest argument in the file for `tuningStatus: "untuned"` meaning what it says.

### 6. `creo-aquam` — **1024**, and whether a ceiling is legitimate

One cell sits at the top of the scale. The worry about a ceiling is that it wastes headroom: if
something more universal is ever authored, there is nowhere to put it.

Taken deliberately anyway, because the field is a *share of a population* and shares have a ceiling
that is not a modelling convenience. Nobody is exempt from thirst. If a later cell is equally
universal it is also 1024, and two cells at the ceiling is the correct outcome rather than a
collision. What would be wrong is a scale on which the most universal thing in the world scored 0.9
of something unspecified.

### 7. `rego-fatum` — **576**, a cell scored on one node

The fate cells are the hardest form on the grid, and `rego-fatum` is the highest of them on the
strength of a single node: **The Kept Oath**. Oath and settlement are how an illiterate village does
law — every bargain, every betrothal, every boundary dispute — while the rest of the cell holds
lots, ill hours and settled questions that are a magistrate's business.

So: is a cell scored on its median working or its best one? The pass scores the **typical working
weighted toward its lower tiers**, because the lower tiers are the ones that actually get cast, and
`The Kept Oath` is tier 2. A cell whose tier-6 capstone touches everyone and whose roots touch
nobody would score low, and `creo-fatum` (512) is exactly that shape in reverse: *The Promised Year*
is a harvest guarantee at tier 2, and above it the cell narrows to writing one person's ending.

### 8. `rego-ignem` **768** over `creo-ignem` **640** — the technique gradient breaking

The gradient says `creo` outranks `rego`. Fire breaks it. Making fire is a struck light and a held
temperature at the shallow end and a standing furnace and an uncontained hour at the deep end;
averaged, a foundry's business. *Keeping* fire — the forge banked, the fire held off, the walled
fire — is what stands between a hearth and a burnt village, in a place where roofs are straw.

Together with call 1 this makes fire the only form on the grid where the destruction and control
cells both outrank creation, and that is a claim about the setting rather than about the magic: fire
is the one element ordinary people already have plenty of and mainly need managed.

### 9. `perdo-terram` — **320**, scored on the content and not the concept

Demolition is real work: a shaft sunk, a ruin cleared, a quarry face brought down. On the concept,
`perdo-terram` is a 600-point cell.

On the content it is *Crumble, Open the Ground, Pull Down the Arch, The Swallowed Hall* — written as
siege from root to capstone, with no node that is a labourer's tool. 320.

The rule this establishes is worth more than the number: **a cell is scored on the nodes it actually
holds, not on what its technique-form pair could plausibly contain.** If a later pass authors a
`perdo-terram` node about clearing a landslip, the cell moves, and it moves for a reason anyone can
check against the file.

### 10. `creo-corpus` **960** / `intellego-corpus` **832** / `rego-corpus` **576** — one form, three numbers

The last call is not a single cell but a demonstration that the axis discriminates *within* a form,
which is the thing a form-then-technique scoring scheme would fail at.

Everyone has a body. Making one whole — a closed wound, a mended decade — is felt at every childbed
and every harvest accident: 960. Reading one is diagnosis, which reaches everyone eventually and the
sick daily, and is the half of medicine that only knows: 832. Holding one still is surgery and
labour, which is a narrower and more professional thing: 576. And unmaking one is call 4, at 256.

Four cells, one form, a spread of 704 points. If the field could not produce that, it would be a
relabelling of the form axis and not a design.

---

## 4. What would falsify this pass

Three things, in the order they would show up:

1. **The measurement finds no effect.** `tools/w60/relevance-arms.mjs` runs the ablation paired on
   identical seeds. If authored relevance moves favor regeneration by less than the seed-to-seed
   spread, either the spread is too wide to see it or the values are too flat, and this document's
   §2 table is where to look first.
2. **The bottom of the scale collapses.** If `mul(magnitude, relevance)` floors to zero for the
   low cells at the shipped magnitudes, then everything under about 128 is one bucket and the
   twelve cells in the bottom two bands are not being distinguished — they are being deleted.
   Currently the smallest product is `mul(128, 64) = 8`, which is small and not zero.
3. **A tuning pass raises the low cells to make the economy work.** That would be tuning the wrong
   knob: the magnitudes in `node.json` are untuned and are the ones written against an implicit
   relevance of 1. Relevance is a claim about a setting, and it should move when the setting is
   argued differently — as in call 1 — and not when a number needs to come out.
