<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W109 — what an alliance is worth, and what it is worth it *for*

Measured on `w109/alliances` at the tree that added god action 16, `invite scholar`.
Every arm is 100 runs at a 2400-tick horizon, one strategy per arm, common random
numbers verified by `scripts/w109-analyse.mjs`. Run records under `balance/w109/`.

**Read the headline as two numbers, not one.** The verb works, and it does not work
for the reason the design claims.

---

## 1. The claim under test

`docs/design/ages-of-magic.md` §2f: *"alliances between realms are the way that you
get visiting mages."* The owner's framing is **"dragons have to make friends"** — the
best mages in the game, in a species that cannot produce them.

Action 16 spends favor to attract one scholar of another species into one of your
universities. She is an ordinary `MAGE` row, not a modifier, and she arrives
**empty-headed**: `invitePlan` calls `createMage` and attaches no knowledge
instance. Nothing about the invitation is a knowledge grant.

## 2. What the diagnosis turned out to be

The brief proposed fertility as draconic's problem. It is not, and the reason is
arithmetic rather than statistical.

- **Draconic `maturityMonths` is 3,600 against a 2,400-tick horizon.** No draconic
  born inside a run can ever become a mage in it. The founding cohort plus the
  tick-zero student cohorts are the entire mage population, and **fertility cannot
  move any number at this horizon.** Raising it would change nothing.
- **Population is not the binding term for ascension at all.** Elf ascends **20/100
  on 2.84 living mages**; draconic ascends **0/100 on 4.26**. Fewer mages, ten times
  the ascension rate.
- **The mechanism that does bind is depth appetite.**
  `speciesTargetTerm = floor((curiosity − 1024) / 8) × tier`, bounded at ±384. For
  draconic that is **−96 per tier, pinned at the −384 floor from tier 4 upward** —
  exactly where the portal nodes sit.

## 3. The portal gate is a curiosity gate in disguise

Action 16 is gated on portal magic, per the owner's design: a living mage holding a
node carrying the `portal` primitive, in a permitted cell. That is the same
predicate action 14 uses, and it is now one function, `portalMagicHolder`.

Both `portal`-carrying nodes are in `rego-limen`, at tier 4 (`rl-open-the-portal`)
and tier 5 (`rl-the-standing-gate`), behind a seven-node closure spanning
`rego-limen` and `intellego-limen`. Both cells are v1-enabled, so the chain is
*permitted* from tick zero. It is simply never *climbed*.

Measured over 100 runs per species, how often a universe ever resolves action 14 —
which requires holding portal magic — against species curiosity:

| species | curiosity | runs reaching the gate | ascended |
|---|--:|--:|--:|
| gnome | 1792 | 17 | 17 |
| human | 1152 | 14 | 6 |
| elf | 896 | 16 | 20 |
| dwarf | 512 | 3 | 2 |
| orc | 384 | **0** | 2 |
| draconic | 256 | **0** | 0 |

**It is a trend and not strict monotonicity** — elf, at curiosity 896, reaches the gate
more often than human at 1152. The load-bearing half needs no ordering at all: **the two
least curious species never reach the gate in a hundred runs each, and they are exactly
the two the mechanic exists to rescue.**

One provenance note on that table. Five of the six arms reproduce `balance/w99/`
*exactly* — draconic 26.88 nodes and 4.26 living mages, elf 54.03 and 2.84, and so on.
**Human does not**: 40.92 nodes against 39.62, 188.10 living mages against 174.68, with
2 of 100 runs ending in a different terminal state. That is not this branch: `w99` was
recorded on `main` at `e2a15cf` and this branch is based on `ebe4fb4`, eighteen commits
later, and human is the most populous arm and so the most sensitive to anything in
between. The figure this table quotes is stable across both builds of this branch —
14 runs reaching the gate, before and after the mask fix — but a reader comparing
human's *other* columns against `w99` should expect the gap and should not attribute it
to action 16. That asymmetry is inverted with respect
to the design intent. It is a fact about where the portal nodes sit in the grid, and
per the brief it is reported rather than patched: the gate stays literal.

## 4. Through the shipped game, draconic still ascends 0/100

Paired arms, identical strategies except that `alliance-seeker` lists action 16
first and `alliance-abstainer` does not:

| arm | n | ascended | nodes known | library depth | living mages | ticksRun | invitations |
|---|--:|--:|--:|--:|--:|--:|--:|
| `alliance-abstainer` | 100 | **0/100** | 70.00 ±0.00 | 13.64 ±2.74 | 4.24 ±0.07 | 1186 | 0 |
| `alliance-seeker` | 100 | **0/100** | 70.00 ±0.00 | 13.64 ±2.74 | 4.24 ±0.07 | 1186 | 0 |

Every paired difference is **+0.00 ±0.00**. The two arms are bit-identical, because
the gate never opens and the seeker therefore degrades exactly to its control. All
100 runs of both arms stagnate.

This is the honest answer to the acceptance criterion as the shipped game stands:
the verb cannot fire for draconic, because content placement puts its gate out of
reach of the species it was built for.

## 5. Downstream of the gate, the verb is decisive

`foundingPortalMagic` is an **instrument, not a magnitude** — the same kind of thing
`foundingSpeciesMask` is. It seeds the shallowest portal-carrying node into a
founder's mind at tick zero, which places a universe *at* the gate and asks only what
the invitation is worth once it is legal. Zero, the default, changes nothing.

| arm | n | ascended | nodes known | library depth | instances | living mages | ticksRun | invitations |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| `gated-abstainer` | 100 | **0/100** | 71.12 ±0.16 | 14.24 ±2.82 | 225.40 | 4.31 ±0.07 | 1189 | 0 |
| `gated-seeker` | 100 | **14/100** | 188.38 ±4.56 | 14.94 ±2.36 | 928.63 | 8.75 ±0.15 | 2272 | 14.63/run |

Paired against the control, same seed: **nodes known +117.26 ±4.55**, instances
+703.23 ±33.49, living mages +4.44 ±0.12, all far beyond three paired standard
errors. Terminal statuses invert: the control **stagnates 100/100 at ~1189 ticks**,
while the treatment **survives to truncation in 83/100** and stagnates in 3.

**The seeded node alone does nothing.** The control holds portal magic for the whole
run and ascends zero times. All 14 ascensions are runs that invited; every one is
the **Enduring Canon** path, and the earliest is tick **1682** against a 2400-tick
horizon — comfortably inside it, which is the tempo half of the requirement.

The invitation is a **revolving door rather than a one-off**: 14.63 invitations per
run, not the five the "no living mage of that species" rule appears to cap it at.
Immigrants die — a human lives 960 months inside a 2400-tick run — the species stops
being resident, and the seat reopens. The design self-limits by *concurrency*, not by
lifetime count.

## 6. The discriminator: not curiosity, and not simply bodies — *affiliated* bodies

An empty-headed arrival changes two things at once: headcount, and the personality
distribution of the roster. The verb refuses a resident species, so a same-species
invitation cannot be expressed through it; the matched control is therefore the same
bodies at approximately the same time, through the committed `foundingMages` factor —
**six draconic founders instead of one, no invitations.**

| arm | living mages | ascended | nodes known | library depth | grimoires |
|---|--:|--:|--:|--:|--:|
| `gated-abstainer` (1 founder) | 4.31 | **0/100** | 71.12 | 14.24 | 75.98 |
| `gated-bodies` (6 draconic founders) | 8.91 | **15/100** | 86.79 | 24.98 | 123.78 |
| `gated-seeker` (1 + ~5 foreign) | 8.75 | **14/100** | 188.38 | 14.94 | 26.33 |

**15/100 against 14/100 at matched headcount, same earliest ascension tick.** Six
dragons do the same job as five foreign scholars, so the payoff is **not** the imported
curiosity the design claims. The control was *advantaged* and only tied — draconic
founders never die inside the horizon while immigrants do — which makes that the robust
direction.

But "headcount" is not the end of it, and the cross-species table in §7 is what forced
the sharper answer. Look at what scribes:

| arm | living mages | library depth | grimoires |
|---|--:|--:|--:|
| `human-gated-abstainer` | **162.3** | **0.05** | **0.05** |
| `human-gated-seeker` | 171.0 | **12.32** | **25.01** |
| `draconic-gated-abstainer` | **4.3** | **14.24** | **75.98** |

**162 human mages produce 0.05 grimoires; 4.3 draconic mages produce 76.** That
inversion has one cause. `scribeThroughputFor` returns zero for a mage whose
`universityId` is `0`, and **`completeAffiliation` has no production caller** — so no
mage a universe promotes for itself is *ever* affiliated. Only two kinds of mage are:
founders, and **an invited scholar, who is affiliated at creation.**

Draconic's single founder lives 18,000 months and scribes for the whole run. Human's
founder dies at 960 months, after which the universe has **no affiliated mage at all**
and scribing stops dead — until an invitation arrives. That is why human's library
depth moves from 0.05 to 12.32 on roughly three invitations, and why `foundingMages: 6`
works too: it adds six *affiliated* mages.

**So the quantity the verb actually delivers is an affiliated scholar, and it is scarce
only because of an unwired code path.** This measurement is therefore, in substantial
part, of the alliance mechanic compensating for a defect in a subsystem it does not
own. **Every effect size in this document should be re-measured after
`w108/university-fidelity` wires affiliation**, and the honest prior is that the
alliance's advantage shrinks — possibly a great deal — once a universe can affiliate
its own graduates.

`foundingMages` is a scenario instrument and no god action creates a mage of the
universe's own species, so the verb remains the only in-game lever that delivers
affiliated bodies today. That is what makes it work; it is not what the design says
makes it work.

## 7. What it does to orc and human — and it does not make dragons special

All three species are measured downstream of the gate, because organically neither orc
nor draconic ever reaches it.

| species | maturity | fertility | without the verb | with it | Δ | runs that invited | invitations/run |
|---|--:|--:|--:|--:|--:|--:|--:|
| **draconic** | 3,600 | 96 | 0/100 | **14/100** | **+14** | 97/100 | 14.63 |
| **human** | 216 | 1,280 | 35/100 | **50/100** | **+15** | 56/100 | 2.92 |
| **orc** | 168 | 1,536 | 47/100 | **48/100** | **+1** | 4/100 | 0.08 |

Human's paired differences are as real as draconic's — nodes known **+35.55 ±5.08**,
library depth **+12.27 ±2.22**, grimoires **+24.96 ±4.43**, all beyond three paired
standard errors. Orc's are all inside it.

**This is the answer to the immigration-free hazard, and it is the unwelcome one.** The
brief's test was that *"a mechanic that only helps the species who cannot reproduce is
correct; one that helps everyone equally has not made dragons special, it has made
immigration free."* Downstream of the gate the verb is worth **+15 to human and +14 to
draconic** — and human matures in 216 months against a 2,400-tick horizon and breeds at
1,280. **It helps the species that needs it least at least as much as the one that needs
it most, so as built it has not made dragons special.**

Orc's near-zero gain is *not* evidence of the asymmetry the design wants, because orc
barely used the verb: 4 runs in 100, 0.08 invitations per run. The gain tracks **how
often each god could afford to invite**, not how badly each species needed to. Orc is
not poor — it spends over a million favor per run — but it always has something cheaper
to buy, and it is the only arm that spends on `fundUniversity` and `encourageResearch`
in most runs (39 and 37 of 100, against draconic's zero). A policy that submits the
first affordable preference every tick never saves for a dear one. That is a plausible
mechanism consistent with the spend profiles and **it is not independently verified
here**; it is a property of `alliance-seeker`'s ordering as much as of orc.

So the design goal is **not** met by this mechanic on its own. What makes the shipped
game dragon-flavoured is only the portal gate — and §3 shows the gate excludes draconic
entirely, so in shipped form the mechanic reaches only species that did not need it.

## 8. Provenance, and one moved baseline

- **No new RNG stream, no schema revision.** The arriving scholar's personality is
  drawn on stream 1 keyed on her own entity handle, so §6's insertion invariance
  makes the draw disturb nobody. `WORLD_SCHEMA_VERSION` stays at **6**.
- **`contentRevision` moves**, `162f80bf…` → `87fdff6c…`, because the seventeenth god
  cost is in the preimage. The digest is over parsed values, not file bytes. Every
  existing price is byte-identical.
- **The append is behaviourally inert, and the route to that sentence is worth
  keeping.** An intermediate build of this branch *was* not inert: re-running the
  draconic species sweep then showed 9 of 10 strategies bit-identical and **all 10
  runs of `uniform-random-legal` differing**, because that strategy samples the
  legality mask and the mask had grown a spuriously-legal seventeenth entry. That
  was the optimistic-mask defect in §9 wearing a second hat. With the gate in the
  mask, action 16 is illegal until a universe holds portal magic, the legal set is
  therefore exactly what it was, and **all 10 of 10 strategies are bit-identical**:
  83 stagnated and 17 truncated, before and after, 26.88 nodes and 4.26 living mages
  either way.
- **The committed balance baselines are re-recorded for provenance, and for nothing
  else.** All four gates fail on `baseline-invalid` — the gate refuses to compare
  across two `contentHash` values, correctly calling it *"a category error"* — while
  **every metric in every gate reports `delta 0.00000`**, including each
  per-strategy arm of the agency gate. So this branch does join the re-baseline
  stack, and it joins it carrying the weakest possible claim: the numbers are
  unchanged and only the stamp moved. `supersededDeltas` in each regenerated file
  is a column of zeros, which is the check a reviewer should apply.
- The pre-append baseline arms reproduce `balance/w99/` **exactly** — draconic
  0/100 at 26.88 nodes and 4.26 living mages, elf 20/100 at 2.84 — so the W99
  baseline has not moved underneath this branch.

## 9. Defects this measurement found

- **A silently free god action.** `ACTION_ID_MAX` was a literal `15` in
  `coordination/src/god/constants.ts` *and* `GOD_ACTION_ID_MAX` in `@mm/content`.
  Only the second moved with the append, so the cost table was built one entry short
  and **action 16 cost nothing**: the mask's affordability check passes, the resolver
  charges zero, and nothing looks wrong. Now imported from the single constant. A
  length assertion is why it surfaced as a red test rather than as a balance number
  nobody could explain.
- **An optimistic mask costs a policy its whole turn.** The first draft of
  `inviteScholarCandidates` omitted the portal gate, reasoning that `invitePlan`
  refuses on it anyway. A policy submits **one action per round** and takes the first
  its mask calls legal — so the seeker spent every tick of two hundred years
  submitting an invitation the rules refused, reaching library depth **2.51** against
  its control's **13.64** while inviting nobody. Fixed, pinned by three tests, and
  the re-measurement is the bit-identical table in §4. This is §7's *"spec-clarity
  smell"* arriving as a balance number instead of as a counter.

## 10. Recommendations, all deferred off this branch

1. **Do not touch draconic `fertility`.** It cannot move a number at this horizon:
   `maturityMonths` 3,600 against a 2,400-tick run means no draconic born in a run can
   ever become a mage in it. Elf ascends 20/100 on **2.84** living mages against
   draconic's 4.26. If more dragons are wanted, maturity is the lever.
2. **Wire `completeAffiliation` before believing any effect size here.** It is
   `w108/university-fidelity`'s and untouched by this branch, but §6 shows it is the
   *mechanism* of the alliance's benefit: 162 unaffiliated human mages scribe nothing
   while 4.3 affiliated draconic ones scribe 76 grimoires, and an invited scholar is
   affiliated at creation. Until a universe can affiliate its own graduates, this
   mechanic is partly compensating for a missing code path rather than delivering a
   design.
3. **Move portal magic within reach of an incurious species,** or give the chain a
   shallower entry. Content placement, not tuning. Until then the verb is unreachable
   for exactly the two species it was designed for.
4. **The payoff has to become species-conditional, or the design claim should change.**
   As built the verb is worth as much to human as to draconic (§7), so it is closer to
   free immigration than to "dragons have to make friends". Two honest routes: implement
   §2g familiarity so the benefit is the per-`(species, species)` affinity the design
   actually describes — schema-bearing, and deliberately declined here — or accept that
   the mechanic is a demographic patch and restate the pillar accordingly. Choosing
   should be a decision, not a discovery.
