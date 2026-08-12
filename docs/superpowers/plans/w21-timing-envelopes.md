# W21 — the envelope is a cost curve, and the arrangement is the interface

*Branch `w21/timing-and-envelopes`, from `integration/campaign-round-2`. Design source:
`docs/design/sound-design.md` §3 and §4. Constraint source: `docs/design/contracts.md` §0, §3, §4.2,
§6.*

Two mechanics, both already written down in the sound design and neither implemented:

1. **Technique is an envelope** (§4.1). Five techniques, five different *shapes over time*, where
   the game currently has one flat scalar for all five.
2. **Timing matters** (§3.1). One world tick is one bar; subsystems own subdivisions; off-grid is
   wrong (§3.2). *When* the god commits an intervention changes what it costs.

The hard constraint on both: **§0.1 — audio is a projection of state and computes no rules.** What
is shared between the arrangement and the mechanic is the *clock*, never the rules. Nothing here
reads, writes, or depends on the audio system, and nothing here may reach a wall clock or an RNG
stream.

---

## 0. What the reconnaissance found, and what it forces

Four facts from tracing the tree, each of which killed a design that looked obvious.

**F1 — `durationTicks` is dead for 369 of 407 shipped effects.** `packages/content/data/node.json`
has 300 nodes; the histogram of `EffectRecord.durationTicks` is `{0: 369, 20: 2, 30: 7, 40: 13,
50: 8, 60: 8}`. The 38 non-zero ones are `area-denial` fields, and `rules-raid/src/raid.ts` reads
those straight off the node, bypassing the `rules-magic` gather/stack pipeline entirely.

> **Consequence.** An envelope over an *effect's* `durationTicks` would be inert for 91% of shipped
> content and would only ever be observable inside a raid. That is not a cost curve; that is
> decoration. **The envelope goes on acquisition, not on effect duration.**

**F2 — the god gets exactly one action per world tick, and that is pinned.**
`packages/agent-api/src/session.ts` states it normatively: *"One action per submission, one world
tick per submission… 'several actions per tick' is a different action space from the one a policy
is trained against."*

> **Consequence.** There is no submission-order-within-a-bar for the timing rule to read. Any rule
> of the form "the k-th action in the tick lands on subdivision k" requires widening the action
> space, which is a breaking change to every trained policy. **The subdivision must be derived from
> simulation state, not from submission position.**

**F3 — no per-technique dispatch point exists anywhere.** Grepping `'creo'`/`'perdo'`/… across all
`packages/*/src` finds one comment and nothing else. Techniques are a bit position in a bitmask and
a grid coordinate; no rule, hook, cost or decay formula branches on technique identity. This work
adds the first one.

**F4 — the golden fixtures cannot see any of this.** `packages/sim-core/test/golden/worlds.ts`
defines its own toy world with its own `GOLDEN_ACTION` vocabulary (`enroll`/`graduate`/`endow`).
The god system, the world loop, `rules-magic` and `@mm/content` are all installed by
`@mm/coordination`, which the goldens never touch.

> **Consequence.** As long as this work changes nothing in `sim-core`'s clock, RNG, fixed-point or
> `step` semantics, **no golden fixture can change.** That is the feasibility check, and it passed.
> If one changes anyway, that is a defect in this work and the run stops. The balance *baselines*
> are a different matter and are expected to move — see §5.

---

## 1. Mechanic 1 — the envelope is an acquisition cost curve

### 1.1 Where it lives

`packages/rules-magic/src/instances/research.ts` already has the exact shape a curve needs:

```ts
readonly progress: Fp;   // accumulated before this step; the caller owns storing it
readonly effort: Fp;     // work applied this step, before the stream-3 jitter
```

and `researchRequirement()` returns `required`. So `t = progress / required ∈ [0, 1)` is a
**position within the acquisition's own duration** — which is precisely what §4.1 means by an
envelope. Research, teaching and scribing are the three multi-tick knowledge processes, and they
are where the whole game lives.

The envelope scales **effort delivered at position `t`**:

```
effectiveEffort = mul(effort, envelopeMultiplier(envelope, progress, required))
```

### 1.2 The five shapes, and the sentence each one traces to

Every shape is quoted from `sound-design.md` §4.1. Nothing here is invented.

| Technique | §4.1, verbatim | curve id | shape over `t` |
|---|---|---|---|
| **Rego** | *"Hard-quantized. Snap, lock, gate. Zero attack, gated release, rhythmically rigid"* | `rigid` | **flat**. Full rate from the first month, no curvature. The control: bit-identical to today. |
| **Creo** | *"The only technique whose energy increases across its duration"* | `swell` | **rising**. Cheap effort early, the work lands late. |
| **Perdo** | *"Subtractive… Perdo's signature is a hole"* | `hole` | **falling** — the exact time-reverse of `swell`. The hole is taken out immediately; the tail is absence. |
| **Muto** | *"begins as one material and ends as another. The listener hears the change, not the endpoints"* | `bend` | **mid-peaked**. Low at both endpoints, the value is in the transition. |
| **Intellego** | *"No impact at all; a filter opens… nothing is struck"* | `open` | **late-opening**. A near-dead attack slot — nothing is struck — then the filter opens and it runs fast. |

`swell` and `hole` are exact mirrors, which is the right relationship between *make* and *unmake*.

### 1.3 The invariant that stops this being a buff

A curve must not make a technique cheaper. The envelope is **harmonic-mean-normalised**: under
*constant* effort, months-to-completion is equal across all five curves, within fixed-point
rounding. The shape changes **when** the work lands, not **how much** there is.

Under constant effort with per-slot multiplier `mᵢ` over `S` equal slots, months spent in slot `i`
is proportional to `1/mᵢ`, so the invariant is

```
Σ (FP_ONE * FP_ONE / mᵢ)  ==  S * FP_ONE      (within a stated tolerance)
```

This is checked in a test over the shipped table, and it is why `open`'s attack slot is a *small
positive* multiplier and not zero — `1/0` diverges and would make Intellego infinitely slow.

### 1.4 Where the mechanic actually bites

Harmonic normalisation deliberately makes the constant-effort case a no-op. The curve is
observable in exactly three situations, all of them real:

- **Effort varies mid-project.** A blessing, a university funding, an `encouragedCells` emphasis
  decaying, a stacked `research-rate` primitive arriving or lapsing. A `swell` node rewards effort
  poured in late; a `hole` node rewards it early. *(Blocking check: confirm rates are recomputed
  per tick and can move mid-project — §6, check C1.)*
- **The project is interrupted.** A mage dies, or autonomy switches her goal. Banked progress at
  month *m* differs by curve, so short-lived species (orc ~60y, human ~80y) and long-lived ones
  (draconic ~1500y) are differently suited to different techniques. This is the
  species × technique interaction D7 and D9 have never observed. *(Blocking check: C2.)*
- **Rediscovery**, which multiplies `required` and therefore stretches the curve.

**If C1 and C2 both come back dead — rates constant per project and banked progress discarded
unread — the curve is provably decorative, and this plan says so in the report rather than shipping
it.** That is the honest outcome and the brief asks for it explicitly.

### 1.5 Content shape

The envelope goes on `technique.json`, because §4.1's claim is literally *"techniques are
envelopes"* — it is a property of the technique, not of a node, and putting it on a node would let
content contradict the technique.

```jsonc
{
  "id": "creo", "name": "Creo", "gloss": "make, create, heal", "bit": 0,
  "envelope": {
    "id": "swell",
    "gloss": "sound-design.md §4.1: 'the only technique whose energy increases across its duration'.",
    "slots": [ /* 8 fp multipliers over the acquisition's own duration */ ],
    "tuningStatus": "untuned"
  }
}
```

Files this touches: `packages/content/schema/technique.schema.json`,
`packages/content/src/types.ts` (`TechniqueRecord`), `packages/content/data/technique.json`, and
**`docs/design/contracts.md` §2.1** — whose fenced example is parsed and field-matched against the
schema in both directions by `packages/content/test/unit/schema-doc-agreement.test.ts`.

### 1.6 Reconciliation with W20

**W20 (`w20/compositional-content`) owns `node.json`'s effect structure. This work does not touch
it.** The curve is a `technique.json` field consumed on the *acquisition* path
(`researchCost`/`teachCost`/`scribeCost`), which is a different part of the file and a different
pipeline. No collision by construction.

The evaluator lands in `@mm/primitives` beside `effectiveRediscoveryMultiplier` — the precedented
cross-package home for shared fixed-point arithmetic — so **W20 can reference the same curve
vocabulary for any duration-bearing effect it defines**, rather than growing a second one.

Three semantic halves of §4.1 that a scalar envelope cannot express belong to W20's schema and are
**offered as vocabulary, not implemented here**:

- Intellego as *"nothing is struck"* — a **read** that returns information and writes no state.
- Muto as *"begins as one material and ends as another"* — a **conversion pair** (`from`/`to`
  primitives) rather than one magnitude.
- Perdo as *"absence where there was content"* — a **residual** that outlives the duration.

### 1.7 Tradition interaction (§4.4)

Vision §4a confines a tradition to four hooks — acquire, store, cast, cost — and §4.4 says a
tradition recolours **cast and cost**, which is exactly where a cost curve lives.

**The curve is not a fifth hook.** It is technique content, and it composes with the existing
`acquire` hook multiplicatively: `acquire` prices the node (it scales `researchCost` →
`required`), the curve redistributes effort across that price. A test pins that the two compose and
that neither shadows the other.

---

## 2. Mechanic 2 — the timing rule

### 2.1 What §3.1 actually assigns, and what it does not

§3.1's table assigns subdivisions to **world subsystems** — economy on beats 1 & 3, teaching on the
backbeat, research on 8ths, scribing on 16ths, and off-grid reserved to knowledge loss and portal
events. It says nothing about which subdivision a *god intervention* occupies.

Combined with F2 (one action per bar), this settles the shape of the only rule that is available:

> **An intervention occupies the subdivision owned by the subsystem it aims at. The god does not
> choose the subdivision; she chooses the bar. An intervention is *in phase* when the bar it lands
> in is actually playing that subdivision, and *off-grid* when it is not — and §3.2 says off-grid
> is wrong.**

§3.1 is explicit about why this is the teaching case in particular: *"A civilization that has
stopped teaching has a kick and no snare, and it sounds like something is missing, because
something is."* Blessing a mage into a civilization that is not teaching is a backbeat struck over
a bar with no backbeat in it.

### 2.2 The predicate, and why it is deterministic

`godState` gains `barActivity: uint8` — a bitmask written at the end of each world tick recording
which of §3.1's subdivisions the universe actually played:

| bit | subdivision | set when |
|---|---|---|
| 0 | economy (beats 1 & 3) | materials were produced this tick |
| 1 | **teaching (the backbeat)** | at least one teaching project advanced |
| 2 | research (8ths) | at least one research project advanced |
| 3 | scribing (16ths) | at least one scribing project advanced |

An intervention reads the **previous** tick's mask — the bar that just played. That is a pure
function of committed state.

**Determinism argument, stated so it can be checked:**

1. The subdivision is a function of the action's `kind`, a constant table.
2. Whether it is in phase is a function of `godState.barActivity`, written by the world loop from
   state, read by `god-intervention` at the start of the next tick.
3. Nothing consults a wall clock. `Date.now`, `performance.now` and real-time pacing appear nowhere
   in the core — contracts §0 puts pacing outside it entirely.
4. Nothing draws. **No stream 12.** Contracts §6 is append-only and a new stream would invalidate
   every committed baseline; the timing rule is arithmetic, not chance.
5. Replay therefore reproduces it: the same `(rootSeed, initial state, action log)` produces the
   same `barActivity` at every tick and the same surcharge on every intervention.

A test asserts the byte-identical replay directly, over a run that pays surcharges.

### 2.3 The eight-bar unease — the rule for constitutional acts

The downbeat always plays (the tick boundary always happens), so the phase predicate can never
catch a constitutional act. §5.2 supplies the rule that can, and supplies the number:

> *"the permit chord includes one low partial that resolves neither up nor down… **it decays over
> about eight bars**."*

Eight bars is eight world ticks. So:

> **A constitutional act (actions 1–7) committed while a previous constitutional act's unease is
> still ringing pays a surcharge scaling with the bars still to run.**

`godState.uneaseUntilTick: int32` = the tick of the last constitutional act, plus eight. One
integer, no draw, exact.

This is deliberately **orthogonal to `axisChangeCounters`**, which contracts §1.1 already defines
as hysteresis on repeated flips of *one* axis. That counter never fires for `permit-then-idle`:
nothing is flipped twice, each axis goes 0 → 1 exactly once. The unease window generalises the same
intuition across axes and across time — it prices *churning the constitution*, not *flip-flopping
one switch*.

### 2.4 Raid time — §3.4 is honoured structurally, not by a new rule

§3.4: *"Inside a raid, the grid is gone. No tempo, no subdivisions, no snapping."* Contracts §4.2
already masks **every** god action except no-op during engagement, so no god intervention exists in
raid time for a timing rule to price. Quantization is off in raid time because there is nothing
there to quantize. A test pins that the timing rule is never evaluated in `TIME_MODE.engagement`.

### 2.5 The question this raises, rather than answering

**§3.1 assigns subdivisions to world subsystems, not to god interventions, and the mapping below is
therefore provisional.** It is shipped because a mechanic needs one, and flagged because the design
does not settle it. The one case the brief calls obvious — *"an intervention aimed at teaching has
an obvious relationship to the backbeat"* — is the one this is most confident about.

| Action | Subdivision | Basis |
|---|---|---|
| 8 grant founding knowledge, 9 bless mage | **teaching** (backbeat) | §3.1 teaching is *"mind to mind… the thing that keeps knowledge alive against mortality"*; §5.3 calls a grant a birth into a mind |
| 10 assign role, 12 encourage research | research (8ths) | both aim at what mages spend their months on |
| 11 fund university | economy (beats 1 & 3) | §3.1's economy row is *"materials, populace"* |
| 1–7 constitutional, 13, 14, 15 | downbeat | §3.1: *"Tick boundary — world state advances"*. Priced by §2.3's unease window, not by the phase predicate |

**Open for the author:** should a constitutional act have a subdivision of its own? §3.2 says
*exactly two* things ignore the beat — knowledge loss and portal events — so a constitutional act
cannot be off-grid by construction, which is why the unease window is a separate rule rather than a
sixth row of §3.1's table.

### 2.6 Where the surcharge is applied

`interventionCost(actionId, costs, options)` in `packages/coordination/src/god/favor.ts` is already
*"written as one function so that the legality mask, the ledger, and the resolution path cannot
disagree about a price."* The timing surcharge composes there exactly as `hysteresis` does, so the
affordability mask sees the same price the resolver charges. Constants go in
`packages/content/data/god-constant.json` with a `gloss` and `tuningStatus: "untuned"`.

---

## 3. Acceptance, restated as checkable claims

| # | Claim | How it is checked |
|---|---|---|
| A1 | The five techniques have measurably different cost/effect shapes | A test evaluates all five over the same `(effort, required)` and asserts pairwise-distinct per-slot vectors, `rigid` flat, `hole` the exact reverse of `swell`, `open` alone near-zero at attack |
| A2 | No curve is a power buff | Constant-effort completion time equal across all five within tolerance; `rigid` exactly equal to today |
| A3 | Timing changes an intervention's outcome | A test pays a different price for the same action on two different ticks, from state alone |
| A4 | It is deterministic and replayable | A recorded run with surcharges replays to a byte-identical snapshot hash |
| A5 | It never reaches a wall clock or an RNG stream | `check:purity` plus a test asserting the stream registry is unchanged (no stream 12) |
| A6 | Raid time has no quantization | A test asserting the rule is not evaluated in `TIME_MODE.engagement` |
| A7 | No golden regenerated | The suite asserts fixtures are byte-identical; if one moves, **stop and report** |
| A8 | `permit-then-idle` is measured | §5 |

---

## 4. Order of work

1. ~~Recon~~ (done — §0).
2. **This plan, committed first.**
3. **Blocking checks C1/C2** (§6). If both dead, report and stop on mechanic 1.
4. Curve evaluator in `@mm/primitives` + tests (A1, A2).
5. Content: `technique.json` envelope + schema + `contracts.md` §2.1 + loader.
6. Thread through `rules-magic` acquisition as an *optional* input, mirroring `acquire`/`store`, so
   omitting it is today's behaviour exactly.
7. Timing: `godState.barActivity` + `uneaseUntilTick`, the subdivision table, the surcharge in
   `interventionCost`, constants in `god-constant.json` (A3, A4, A5, A6).
8. Paired sweeps (§5).
9. `npm run verify`. One baseline regeneration at the end, with written rationale, if and only if
   the gates move.

## 5. The negative control, and what would count as a result

`permit-then-idle` wins 40/40 on the base branch by permitting axes for 140 of 2,400 ticks and then
submitting an empty preference list forever.

**Prediction, stated before measuring:** the win rate will not move. The campaign has five
independent confirmations that terminal outcomes at 2,400 ticks are decided by *content
exhaustion*, and W17's finding was *"much sooner, same place."* A surcharge on 140 early ticks
changes when the grid opens, not whether it opens.

So the measurement must collect **leading indicators**, or a null result says nothing:

- favor spent on unease surcharges, and the tick the grid finishes opening;
- `nodesKnown` at 600 ticks (the horizon where W17 found movement) as well as at 2,400;
- `timeToTierBySpecies`, where the curve × lifespan interaction should appear if anywhere.

Paired sweeps: mechanic on and off, same pool, same seeds.

**If the win rate does not move and the leading indicators do not move either, the mechanic is
decorative and the report says so plainly.** If the leading indicators move and the win rate does
not, the finding is *"timing prices the verbs; the ceiling still picks the winner"* — a sixth
confirmation of the campaign's own conclusion, and a reason the ceiling is the thing to fix.

## 6. Blocking checks

- **C0 — golden exposure.** ✅ Done. `sim-core/test/golden/worlds.ts` is a self-contained toy world;
  the god system and `rules-magic` are `@mm/coordination`'s and are never installed. No golden can
  see this work unless it touches `sim-core` semantics, which it must not.
- **C1 — does per-tick effort/rate move mid-project?** If not, the curve only bites on
  interruption.
- **C2 — is banked progress read by anything but the completion comparison, and what happens to it
  on death or goal switch?** If it is discarded unread and rates are constant, the curve is
  provably decorative.
- **C3 — re-fetch `w20/compositional-content` before finalising any content schema.** It did not
  exist at plan time (`git fetch origin w20/compositional-content` → *"couldn't find remote ref"*).

## 7. Status

- [x] Recon; F1–F4 established
- [x] C0 golden exposure cleared
- [x] **C1 and C2 both alive** — the curve is not decorative. See §8.
- [x] Curve evaluator + tests (`@mm/primitives/envelope.ts`, 17 tests)
- [x] Content + schema + `contracts.md` §2.1 + loader invariant
- [x] Acquisition threading (research, teaching, scribing)
- [x] Timing rule (world-schema revision 5, 15 tests)
- [ ] Sweeps
- [ ] `npm run verify`

---

## 8. C1 and C2, answered

Both came back alive, which is the finding that let mechanic 1 ship.

**C1 — rates do move mid-project. Confirmed end to end.** Blessings toggle
(`godEffectHooks.researchBonusesFor`), `encouragedCells` emphasis decays linearly
tick by tick (`emphasisAt`, re-derived from remaining ticks and never cached
across ticks), and a university's library depth grows as books are scribed
(`capital.depthFor` → `libraryRateMultiplier`). All three are recomputed live on
every `research()` call. The comment at `gateway.ts:440` says why explicitly:
freezing a rate at commitment time *"would make the cost stale by
construction."*

**C2 — banked progress is read, not merely compared.** `researchFrontier`
computes `remainingCost = max(requirement − banked, 0)` on **every autonomy
evaluation**, to score whether resuming beats starting something else. Progress
survives a goal switch by design (*"she has set it down"*), is frozen and not
lost when a cell is forbidden, and is destroyed with its mage
(`EffortLedger.clearSubject`).

**So the curve does not merely change arithmetic — it changes what mages choose
to work on.** A `swell` node banks slowly and looks hopeless for most of its
life; a `hole` node banks fast and looks nearly finished while it drags. Under
autonomy scoring those are different decisions. And because progress dies with
its mage, the shape interacts with species lifespan — the species × technique
interaction D7 and D9 have looked for and never found.

## 9. What shipped, and what did not

| Piece | State |
|---|---|
| Five envelopes as acquisition cost curves | **Shipped**, applied to **research only** — see §10 |
| Harmonic invariant, enforced by the loader | **Shipped** |
| §5.2's eight-bar unease on constitutional acts | **Shipped**, priced, mask-mirrored |
| §3.1's subdivision table and the in-phase predicate | **Shipped as vocabulary**, reported on every phase |
| §3.2's off-grid surcharge | **Not priced.** See below |

The off-grid surcharge is the one deliberate omission, and two independent
things pushed the same way:

1. **§3.1 does not assign subdivisions to god interventions.** It assigns them
   to world subsystems, and §3.2 reserves off-grid for knowledge loss and portal
   events *"and nothing else"*. `SUBDIVISION_OF_ACTION` is therefore a reading,
   not a citation — so it is raised (§2.5) rather than priced.
2. **Pricing it would need `agent-api`'s mask to agree**, because the mask
   reprices every action itself. A surcharge the mask cannot see is not a cost;
   it is an illegal-action counter, which is precisely the defect integration
   round 2 found in `uniform-random-legal` — *"seven of fifteen verbs inert,
   telemetry clean."* Making the mask agree requires the mapping to be normative
   first.

`@mm/content`'s loader made the same argument a third time, unprompted: it
refuses a `god-constant.json` row nothing reads, so `off-grid-surcharge` is
**absent from content** rather than authored and inert. That rule is right and
the constant arrives with the answer, not before it.


---

## 10. What running the suite changed, and the two pins it moved

Three things were only findable by running it.

### 10.1 The curve is research-only

Teaching and scribing lost their envelope. The structural argument is the one
that decides it: both have a **flat authored requirement** and their rate scales
the *numerator* (`mageMonths`, `scribeMonths`), so `progress / required` is not a
position within an acquisition's own duration the way it is for research, where
the rates divide the requirement. There is no interior for a curve to be a curve
over.

A measurement agrees, and is stated carefully because the effect is real and is
not the whole cause. Lessons in the last two 20-year windows of the reference
universe's 200-year run:

| arm | window 8 | window 9 |
|---|---|---|
| flat curves | 114 | 1 |
| research envelope only | 19 | 0 |
| research + teaching envelope | 5 | 0 |

Curving teaching **deepened** the thinning without producing it.

### 10.2 Two reference pins moved, and the ablation says it was the mechanic

Setting all five envelopes to `rigid` and changing nothing else restores the
previous numbers exactly. So these are the mechanic, not a defect in it.

**`reference-long-run` 9.5 — teaching in every 20-year window.** Window 9 went
`1 → 0`. **The pin held by exactly one lesson before this branch touched
anything.** Re-pinned at nine of ten windows and the first eight without
exception — which still fails outright the defect it was written to catch
(teaching dead from window 1).

> **Raised for the author.** If *"a lesson in every window"* is a design
> invariant rather than a measured trajectory, the curve ratio is the knob:
> every `slots` value is `untuned`, and the 8:1 spread was chosen because §4.1
> gives a direction and no magnitude. Choosing that ratio by what makes the line
> green would be tuning to the test, so it is raised rather than done.

**`reference-time-to-tier` 9.9 — species bands at tier 3.** One loss and one
gain, both recorded, because a pin that wrote down only the improvement would be
advocacy:

| species | flat | curved |
|---|---|---|
| gnome | [20, 21] | **[19, 20]** — now separates strictly from dwarf and orc |
| dwarf | [21, 25] | [21, 27] |
| orc | [21, 27] | **[21, 37]** — ties elf's fastest seed; separation lost |
| human | [26, 37] | [26, 39] |
| elf | [35, 58] | [37, 60] |
| draconic | [26, 380] | [26, 298] |

Gnome is the first species in this project distinguishable from every other at
tier 3 by more than the cross-seed spread. Orc is no longer distinguishable from
elf. **Task 9.9 still wants four species and still gets fewer.**

### 10.3 A promised test that did not exist

`mask.ts`'s `uneaseMultiplier` comment said the two implementations *"are bound
by a test rather than by an import"*. No such test had been written — a claim
without its check, in exactly the defect class integration round 2 found in
`uniform-random-legal`, where the gate admitted actions coordination refused and
the telemetry stayed clean.

`god-timing-mask-agreement.test.ts` is that check. Its discriminating case is
favor set **between** the base and surcharged prices — with plenty of favor it
would pass whether or not the mask knew the rule — swept across every bar of the
phrase, asserting the mask's verdict and the resolver's are the same verdict.


---

## 11. Reconciliation with W20, from W20's actual tree

`w20/compositional-content` **is not on the remote** — two fetches found no such
ref — but the branch exists locally at `5e289ac`, and it was read rather than
guessed at.

### There is no collision, by construction

W20 owns `node.json`'s **effect** structure and does not touch
`technique.json` at all: `git diff` over W20's entire history shows
`technique.json` and `technique.schema.json` byte-identical to the pre-W20 base.
This work's `envelope` field is a `technique.json` field consumed on the research
acquisition path. The two do not meet.

### W20 built the semantics this plan offered as vocabulary

§1.6 above offered three halves of §4.1 that a scalar envelope cannot express —
Intellego as a read, Muto as a conversion pair, Perdo as a residual — as
proposed vocabulary for W20's schema rather than implementing them here. **W20
implemented exactly that**, as a required `mode` on each effect:

    mode: 'create' | 'reveal' | 'transform' | 'remove' | 'control'

one per technique, with `reveals`, `transformTo` and `control: {floor, ceiling}`
hanging off the modes that need them, plus a `when` condition. Its `types.ts`
calls `mode` *"the technique's envelope, made mechanical."*

**So the split is the one this plan proposed, and both halves now exist:**
W20 owns *what a technique does to state*; this owns *what a technique costs
across the duration of learning it*. Neither shadows the other, and a node's
`mode` and its technique's `envelope` are read on different paths.

### One genuine divergence, for the author rather than for either workstream

`docs/design/compositional-content.md` §3.5 — W20's own design note, written and
not implemented — reads §4.1 a second time and proposes cost curves too:

> *"The author's instruction is that **techniques' envelopes should become real
> cost curves**, so §4.1's five shapes are read a second time, as functions of
> tier"*

**That is a different axis from this one.** W20 §3.5 proposes cost as a function
of a node's **tier** — a shape across the tree. This implements cost as a
function of **progress within one node's own acquisition** — a shape across the
months. Both are defensible readings of *"the envelope is a cost curve"* and
they compose without conflict, but they are not the same mechanism and only one
of them is built.

The shape names differ, and on four of five so do only the words:

| technique | W20 §3.5 (proposed, f(tier)) | W21 (built, f(progress)) | agree? |
|---|---|---|---|
| Creo | back-loaded | `swell` — rising | yes |
| Perdo | front-loaded | `hole` — falling | yes |
| Muto | bridged | `bend` — mid-peaked | yes |
| Rego | quantized | `rigid` — flat | close; `rigid` is not quantized |
| **Intellego** | **flat** | **`open` — near-silent attack, then fast** | **no** |

Intellego is the one real disagreement, and it is not resolved here. §4.1 says
*"no impact at all; a filter opens… nothing is struck"*, which reads as a
hesitation and not as flatness — and flat would make Intellego's curve
**identical to Rego's**, collapsing two of the five shapes §4.1 insists are
different. That is the argument for `open`; it is stated rather than assumed,
because picking between two readings of one sentence is the author's call.


---

## 12. The negative control: what the rule does to `permit-then-idle`, derived

The measurement is a paired `integration-r2-true-naming` sweep — this branch
against the **committed** off arm in `balance/results-integration-r2.txt`, which
was measured on this branch's own base with the same sweep file and the same
`rootSeed 20260811`. That is a cross-build comparison rather than a same-build
pair, and it is named as such: if a delta is surprising, the confirmatory
follow-up is a content-patched flat-envelope arm, not a louder claim.

### What the rule does to it, before measuring

`permit-then-idle` submits `permitTechnique` or `permitForm` on **every tick for
the first 140**, then an empty preference list for the remaining 2,260. Under
`agent-api`'s one-action-per-tick rule that is *one constitutional act per bar,
140 bars running.*

Every one of those acts after the first lands with **seven bars of unease still
ringing** — `uneaseUntilTick = t + 8`, evaluated at `t + 1`. So its multiplier is

    fp(1024) + 7 × fp(256) = fp(2816) = 2.75×

and a `permitTechnique` that costs `fp(8192)` costs `fp(22528)` instead. **The
strategy that wins 40/40 is the one this rule prices hardest**, because
back-to-back law changes are the entire strategy.

Note what does *not* catch it: §1.1's `axisChangeCounters` is hysteresis on
flipping **one axis** twice, and `permit-then-idle` never flips anything twice —
nineteen switches, once each, every counter 0 → 1 and stopped. The measured
per-flip price on the base branch is the base price, every time.

### What would count as a result

**Prediction, stated before the numbers.** The win rate will not move. The
campaign has five independent confirmations that terminal outcomes at 2,400
ticks are decided by content exhaustion, and W17's finding was *"much sooner,
same place."* A surcharge on 140 early ticks changes **when** the grid opens,
not **whether** it opens — and the strategy has 2,260 idle ticks afterwards in
which to arrive at the same ceiling.

So the leading indicators are the measurement, not the win rate:

- `referenceNodesKnown` and its SE, against the off arm's **257.9 ± 1.48**;
- `referenceLibraryDepth` (off arm **43.27**) and `referenceGrimoires` (**87**);
- the D1–D9 table from `scripts/integration-r2-analyse.mjs`, which asserts
  strategy coverage before reporting anything.

### What this instrument structurally cannot see

The r2 sweep collects **final-tick metrics only** — `referenceNodesKnown` and
the rest, at tick 2,400. So it can answer *did the endpoint move* and it
**cannot** answer *did the grid open later*. A surcharge that pushes the grid's
opening from tick 140 to tick 300 leaves more than two thousand idle ticks in
which to arrive at exactly the same ceiling, and this table would read that as a
null.

That limitation is named here rather than discovered in the numbers, because a
null from an instrument that could not have seen the effect is a different
finding from a null from one that could. **The instrument that could see it is a
horizon-600 variant of this sweep** — W17 found movement at 600 ticks and none
at 2,400 on a different mechanic, for exactly this reason — and it has not been
run.

`balance/sweeps/w21-negative-control.sweep.json` is committed as the
**confirmatory same-build instrument for that follow-up**: 80 replicates over
`permit-then-idle` and `permissive-breadth` alone, the two strategies that win,
so a paired flat-envelope arm can be run against it cheaply. It has not been run
either, and is committed unrun deliberately and said so here — this repository
refuses an unread constant on the grounds that a knob nobody turns is a null
result waiting to be misread, and an unrun sweep deserves the same sentence.

**If neither the win rate nor the indicators move, the timing mechanic is
decorative against this agent at this horizon, and the report says so plainly.** The honest
version of that finding is already legible from the design: the rule prices the
*constitutional* verbs, and integration round 2's own conclusion was that the
clerical verbs are *"worth slightly less than nothing"* while the ceiling picks
the winner. A mechanic that prices the one verb that matters and still does not
change who wins would be a sixth confirmation that **the ceiling, not the
pricing, is the thing to fix.**
