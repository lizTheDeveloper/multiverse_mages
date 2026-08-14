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
| elf | 896 | 16 | 20 |
| dwarf | 512 | 3 | 2 |
| orc | 384 | **0** | 2 |
| draconic | 256 | **0** | 0 |

Human (curiosity 1152) is absent from that table — its arm was not taken — so the
ordering is a trend and not a demonstration of strict monotonicity. The load-bearing
half needs no ordering: **the two least curious species never reach the gate, and they
are exactly the two the mechanic exists to rescue.** That asymmetry is inverted with respect
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

## 6. The discriminator: it is bodies, not curiosity

An empty-headed arrival still changes two things at once — headcount, and the
personality distribution of the roster. Draconic's roster cannot grow on its own
inside the horizon, so one adult is a large fractional change to a roster of four.

The verb refuses a species already resident, so a same-species invitation cannot be
expressed through it. The matched control is therefore the same bodies at
approximately the same time, through the committed `foundingMages` factor: **six
draconic founders instead of one, no invitations.**

| arm | living mages | ascended | nodes known | library depth | grimoires | ticksRun |
|---|--:|--:|--:|--:|--:|--:|
| `gated-abstainer` (1 founder) | 4.31 | **0/100** | 71.12 | 14.24 | 75.98 | 1189 |
| `gated-bodies` (6 draconic founders) | 8.91 | **15/100** | 86.79 | 24.98 | 123.78 | 1385 |
| `gated-seeker` (1 + ~5 foreign) | 8.75 | **14/100** | 188.38 | 14.94 | 26.33 | 2272 |

**15/100 against 14/100, at matched headcount, with the same earliest ascension tick
(1682).** Six dragons do the same job as five foreign scholars.

So the mechanic is, on this evidence, a **demographic patch**. "Dragons have to make
friends" is true in the sense that dragons need *bodies*; it is not yet true in the
sense that they need *other kinds of people*. The design claim — that a mismatched
species imports the curiosity it lacks — is **not** what produces the ascensions.

Two honest qualifications, in both directions:

- **The control was advantaged and only tied.** Draconic founders live 18,000 months
  and never die inside the horizon; the seeker's immigrants die and are replaced. The
  bodies arm therefore has more, and more stable, mage-ticks than the treatment — and
  Canon rewards four *consecutive* good era boundaries. The bias favours the control,
  which makes "headcount suffices" the robust direction of this result.
- **The two arms reach the same rate by visibly different routes.** The seeker knows
  **2.2× the nodes** (188 vs 87) and almost never stagnates (3/100 vs 72/100); the
  bodies arm builds deeper libraries and scribes far more (grimoires 124 vs 26). So
  headcount sets the ascension rate, while *who* the bodies are sets breadth and
  survival. A metric other than `ascensionRate` might well separate them.

**And the verb remains the only in-game lever that delivers the bodies.**
`foundingMages` is a scenario instrument; no god action creates a draconic mage. So
the discriminator explains *why* action 16 works without making it redundant.

## 7. What it does to orc and human

The immigration-free hazard is that a mechanic helping everyone equally has not made
dragons special. Organically the question does not even arise for orc — it reaches
the gate in 0/100 runs, exactly as draconic does — so these are gated arms too.

<!-- ORC_HUMAN_TABLE -->

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

1. **Do not touch draconic `fertility`.** It cannot move a number at this horizon.
   If more dragons are wanted, `maturityMonths` is the lever — 3,600 against 2,400 is
   the whole of it.
2. **Move portal magic within reach of an incurious species**, or give the chain a
   shallower entry point. Until then action 16 is unreachable for precisely the two
   species it was designed for. This is a content-placement decision, not a tuning
   one.
3. **If the design wants curiosity rather than headcount to be the payoff**, the
   mechanic needs §2g familiarity — the per-`(species, species)` affinity capped at
   1.15 — which is schema-bearing and was deliberately declined here. On current
   evidence the alliance is a demographic patch, and that should be a decision rather
   than a surprise.
4. **`completeAffiliation` has no production caller**, so every mage promoted during
   a run is permanently unaffiliated and can never scribe or ward — founders only.
   That suppresses instance redundancy for every species and interacts directly with
   these arms, since an invited scholar *is* affiliated at creation. Routed to
   `w108/university-fidelity`; noted here because it conditions every number above.
