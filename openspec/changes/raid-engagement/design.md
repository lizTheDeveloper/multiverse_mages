## Context

A raid is the only place in Multiverse Mages where two universes touch, and it is the only place
where the game's load-bearing rule — *the host universe's ruleset governs all magic cast inside it,
for both attacker and defender* (vision §3) — has any observable effect. Everything the god does in
world time is a bet about what happens in this one mode.

Three constraints shape every decision below, and they pull against each other:

1. **`contracts.md` §1.1 declares `Universe` a singleton**, while §1.6 gives `RaidState` a
   `hostUniverseId: uint32` handle. Taken literally these contradict. A raid needs two rulesets in
   scope at once, and one of them belongs to a universe that is not the local singleton.
2. **The 0.7.0 claims are zero-occurrence claims.** "A forbidden spell never resolves" and "no raid
   exceeds portal stability" are only provable if there is exactly one place a spell can resolve and
   exactly one place stability can change. A design with two enforcement sites cannot make either
   claim; it can only make the claim "we did not observe it".
3. **Space exists only here.** `contracts.md` §0 and vision §7a state that world-scale entities carry
   no coordinates. Raids therefore have to materialise an entire positional world from unpositioned
   world state on entry, and dissolve it on exit without leaking a single coordinate back.

`contracts.md` §8 explicitly assigns combat resolution math to `rules-raid`. This document proposes
it. Every magnitude here is an untuned placeholder; the balance harness delivered in 0.5.0 owns the
numbers, and this change owns only the shapes, the units, and the order of operations.

## Goals / Non-Goals

**Goals:**

- One arbitration choke point, enforced twice — once as a filter that prevents illegal casts from
  ever being selected, once as an assertion that would catch it if the filter were wrong.
- Termination as a structural property: a non-terminating raid impossible to construct, not merely
  unobserved, and the bound checkable at content load rather than discovered at tick 100,000.
- Combat resolution specified to the level where two implementers cannot disagree — phase order,
  targeting rule, which primitive applies before which, and what rounds where.
- A spatial layer whose entire lifetime is bracketed by portal open and raid resolution.
- Consequence write-back that is atomic and that makes knowledge loss a real, permanent event.
- A raid that is a pure, reproducible function of `(attacker snapshot, defender snapshot, raidSeed)`,
  so `pvp-server` inherits lockstep determinism rather than re-deriving it.

**Non-Goals:**

- Netcode, lockstep transport, matchmaking, or servers. `pvp-server` owns those; this change owns
  only the property that makes them possible.
- Rendering. The client reads the engagement observation block and computes no rules.
- God interventions during a raid. `contracts.md` §4.2 masks rules-changing actions in engagement
  mode; the god has no combatant-level verb at all, by design (vision §7).
- Research, teaching, scribing, and rediscovery mechanics. This change *destroys* and *steals*
  knowledge instances through the interfaces `knowledge-model` publishes; it does not create the
  model.
- Tuning. Every magnitude below is a placeholder and is marked as one.

## Decisions

### The ruleset snapshot resolves the singleton contradiction and implements frozen policy

Arbitration during a raid does not read a `Universe` entity. It reads an immutable **ruleset
snapshot** — a value carrying `{permittedTechniques, permittedForms, edicts, traditionId}` — captured
from each participant at portal open and stored on `RaidState`. `permits()` is applied to that value.
The `hostUniverseId` handle remains for identity, provenance, and write-back addressing; it is never
dereferenced for a legality decision.

This single mechanism does three jobs at once. It lets two rulesets be in scope without promoting
`Universe` out of singleton status, so `contracts.md` §1.1 stands unamended. It makes the vision's
frozen-policy rule (§3, *nothing about the ruleset can be altered once a raid has begun*) structural
rather than procedural: even if the action mask in `contracts.md` §4.2 were bypassed, arbitration
would still read the snapshot taken at portal open. And it removes an entire class of desync from
`pvp-server`, because the ruleset governing a raid is transmitted once with the pairing rather than
being re-read from live state on both machines every tick.

*Alternative considered:* promote `Universe` to a multi-entity table so both participants are live
entities in one state. Rejected — it changes a normative contract in order to serve one mode, it
would give every world-scale system a universe handle to thread through code that only ever has one
universe, and it makes "the ruleset cannot change mid-raid" a rule enforced only by the action mask,
which is a single point of failure for the strictest claim in the release plan.

*Alternative considered:* have arbitration call `permits()` against the live host universe, relying
on the action mask to keep it frozen. Rejected — the mask lives in `agent-api`, and `rules-raid` must
not depend on `agent-api` (`contracts.md` §5, rule 4). Depending on a layer above you for a safety
property you are claiming is exactly backwards.

### Arbitration is enforced twice: mask at selection, assert at resolution

**Layer 1 — the legal-node mask.** At portal open, for each combatant, the engine computes a bitset
of nodes that combatant may cast: nodes it holds (via its *home* `store` hook) intersected with
`{n : permits(hostRulesetSnapshot, cell(n))}`. Because the ruleset is frozen, this is computed once
per raid and never recomputed. Illegal spells are not merely blocked, they are never candidates —
the combatant's utility-AI cannot score what it cannot see.

**Layer 2 — the resolution assertion.** `resolveCast` is the only function in the codebase that may
apply a node's effects during engagement. Its first statement re-evaluates
`permits(hostRulesetSnapshot, cell(node))`. On false it applies nothing, charges no cost, draws no
combat RNG, and increments `forbiddenCastsBlocked`. That counter is the 0.7.0 claim: across 10,000
Monte Carlo raids it must read zero.

The second layer is redundant by construction, and that is the point. A counter that is only ever
zero looks like dead code until you realise it is the measurement. To prove the assertion is live
rather than vacuous, a fault-injection test constructs a raid with the mask deliberately disabled and
asserts the counter becomes non-zero and no effect is applied — otherwise "zero occurrences" is
indistinguishable from "the check never runs".

*Alternative considered:* the mask alone. Rejected — it makes the release claim unfalsifiable. If
the mask is the only enforcement, then a mask bug produces an illegal cast that nothing counts, and
the metric reports zero for the wrong reason.

*Alternative considered:* the assertion alone, letting the AI select illegal spells and be refused.
Rejected — it burns a combatant's tick on a guaranteed failure, which is a behavioural bug dressed as
a safety check, and it makes `forbiddenCastsBlocked` a routine number rather than an invariant.

### Portal opening is governed by the attacker's ruleset alone

The portal spell is cast in the attacker's own sky, so the attacker's universe must permit
`rego-limen` and the attacker must have a living mage holding a node carrying the `portal` primitive.
The host's ruleset governs everything cast *after* arrival, and nothing before it.

*Alternative considered:* require both universes to permit `rego-limen`, on the grounds that a portal
has two ends. Rejected for a design reason and a rules reason. The design reason: forbidding a single
form would grant total raid immunity, which is a strictly dominant play the moment any player finds
it, and it would collapse the entire engagement layer for that matchup. The rules reason: vision §3
scopes arbitration to magic *cast inside* a universe, and the opening is not cast inside the host.
The consequence is stated plainly so it reads as design rather than oversight — forbidding
`rego-limen` denies you the ability to raid, never the ability to be raided.

### The tradition hook split, and what actually populates `preparedSpells`

Vision §4a splits the four hooks by clock: `acquire` and `store` are world-time concerns and follow
the combatant's **home** tradition; `cast` and `cost` are host-governed. Both sides are treated
identically — for a defender, home and host happen to be the same universe, which is why the rule
needs no special case.

`contracts.md` §1.6 says `preparedSpells` is "populated by tradition `cast` hook", while vision §4a
says a raider "carries her own preparations". These are reconciled in two steps rather than by
choosing a winner:

1. The **candidate pool** is determined by the combatant's home `store` hook — which knowledge
   instances are reachable at all. An Art of Memory raider's palace instances travel with her; a
   Vancian raider's grimoires travel as items; a True Naming raider carries names.
2. The **prepared list** is the host `cast` hook applied to that pool — how many may be held ready,
   and how expenditure works. Expenditure cost is the host `cost` hook.

So an Art of Memory raider in a Vancian universe finds her palace intact but must ready spells the
Vancian way and pay the Vancian price; a Vancian raider in an Art of Memory universe keeps her
prepared list but releases it under her host's rules. This is the split doing real mechanical work
in both directions, and it is testable as a scenario pair.

*Alternative considered:* read `contracts.md` §1.6 literally, letting the host `cast` hook determine
both what is available and how it is spent. Rejected — it would mean a raider's home tradition has no
effect abroad at all, deleting the half of vision §4a that makes the split interesting, and it would
let an Art of Memory host make a visiting raider's grimoires unreadable, which is a `store` decision
wearing a `cast` hook's clothes.

### Combat resolution: fixed phase order, deferred death, one ward application

Each engagement tick (100 ms of fictional time) runs these phases in this order, always:

1. **Intent.** Every living combatant scores its goal set — engage, reposition, cast, loot, steal,
   withdraw, guard — against **tick-start state**, using the utility-AI from `mage-autonomy`. Ties
   break on RNG stream 7. Nobody sees another combatant's intent this tick.
2. **Movement and displacement.** Ordinary movement is a clamped step toward the goal position;
   `blink` applies as instantaneous displacement, taking the **max** across sources rather than the
   sum (`contracts.md` §3). Both are clamped to the battlefield rectangle and to passable terrain; a
   displacement whose endpoint is impassable resolves at the last passable point along the path,
   which prevents `blink` from becoming a terrain-ignoring primitive by accident.
3. **Area denial.** Every active `area-denial` field applies `magnitude` HP to each combatant inside
   its radius, additive across fields. Area denial passes through `ward` but **not** through
   `concealment`, because concealment is defined as evasion of *targeting and detection*
   (`contracts.md` §3) and a field targets nothing. This is the mechanical reason area denial is the
   counter to a concealment build, and it should be stated rather than emergent.
4. **Cast resolution.** In ascending stable combatant key order, each declared cast runs:
   legality (`permits` on the frozen host snapshot) → cost (host `cost` hook; unaffordable means no
   effect and no expenditure) → cast (host `cast` hook expends the preparation) → target acquisition
   (range by **squared distance**, plus line of sight) → concealment evasion roll (stream 8) →
   damage.
5. **Theft resolution.** `knowledge-steal` attempts resolve on stream 9, after damage, so a thief who
   kills her target this tick does not also read its mind — the mind is gone. Deliberate: it forces a
   real choice between killing and robbing.
6. **Objective interaction.** Capture, burn, and loot progress advances for combatants in contact
   with an objective.
7. **Stability decrement.** `portalStability -= stabilityDecayPerTick`. Unconditional. See below.
8. **Cleanup.** Combatants at or below 0 HP are removed; expired fields are removed; the termination
   predicate is evaluated.

Two properties fall out of this order and are specified as requirements:

- **Deferred death.** Removal happens in phase 8, never during phase 4. A combatant reduced to 0 HP
  by a lower-indexed enemy still resolves the intent it declared in phase 1 — the dying blow. This is
  not flavour; it is what stops entity index order from silently deciding fights. Because
  `direct-damage` is additive and HP clamps at zero, the set of effects applied within a tick does
  not depend on the order phase 4 walks.
- **One ward application.** All `direct-damage` resolving against one target within one tick is
  summed first (additive across sources, §3), then a single ward factor is applied to the sum:
  `wardTotal = 1 - Π(1 - wᵢ)`, clamped to `fp(922)`, and `applied = raw × (1 - wardTotal)` using the
  shared fixed-point helper that rounds toward negative infinity. Applying ward per source instead
  would make ten small hits strictly worse for the attacker than one large hit of equal total, purely
  as a rounding artefact.

**Concealment is the only miss chance.** There is no to-hit roll and no accuracy statistic. A single
uniform draw from stream 8 is compared against the target's effective concealment
(multiplicative-on-remainder across sources, capped `fp(870)`); on evasion the attack fails to
acquire, the caster's preparation and cost are still spent, and zero damage is dealt.

*Alternative considered:* a conventional accuracy-versus-evasion to-hit roll driven by caster tier.
Rejected — accuracy is not in the `contracts.md` §3 primitive table, and §3 is normative. Introducing
a sixteenth combat statistic outside the primitive registry is precisely the move that makes
`winRateByPrimitive` stop meaning anything, because contribution would flow through a channel
ablation cannot switch off.

*Alternative considered:* concealment as damage reduction rather than evasion. Rejected — §3 defines
its unit as a probability of evading targeting/detection, and reinterpreting it as mitigation would
make it a second `ward` with a different cap.

**Targeting rule.** Among enemy combatants within range and line of sight, a caster selects the one
with the lowest current HP above zero; ties break on ascending stable combatant key. Placeholder and
marked as such — "focus the weakest" is a legible default, not a claim about optimal play, and
`mage-autonomy` may replace the scoring function without touching resolution.

**Placeholder magnitudes** (all untuned, all owned by the harness): `maxHp` = `fp(64)` base, scaled
by species and by highest node tier known; movement `fp(4)` metres per tick; interaction radius
cap `fp(16)` metres; `maxCombatantsPerSide` = 32; `maxSummonsPerSide` = 16.

### RNG substreams are keyed by stable identity, not entity index

Combat draws derive from `(rootSeed, streamId, engagementTick, combatantKey, drawOrdinal)`, where
`combatantKey` is `(side, spawnOrdinal)` — assigned at deployment and never reused within a raid.
Keying on the entity index would make every roll depend on allocation order, so adding one summon
would re-roll the rest of the battlefield.

The property this buys is **insertion invariance**, the same property `sim-core-foundation` bought
with per-subsystem streams, extended one level down: introducing an additional draw for one
combatant, or introducing an additional combatant, does not alter the values any other combatant
draws. That is directly testable and it is what keeps a balance baseline meaningful across a change
that adds a new effect.

*Alternative considered:* a single sequential stream 8 walked in combatant order. Simpler, and it is
what most implementations do. Rejected — every roll then depends on how many rolls preceded it in the
tick, so a change to any one combatant's behaviour invalidates every subsequent draw, and the
`winRateByPrimitive` ablation runs (which work precisely by removing a primitive's effects) would
shift the entire simulation rather than isolating a contribution.

### Termination is structural: an unconditional decrement, an authored integer, a load-time bound

Four properties together make a non-terminating raid impossible to construct:

1. **Exactly one writer.** `portalStability` is written by one function, called from one phase, with
   no conditional guarding the write. A conformance check asserts no other site assigns it.
2. **No primitive can touch it.** The `contracts.md` §3 primitive table contains nothing that affects
   portal stability. This absence is load-bearing and this change depends on it: adding such a
   primitive would break the 0.7.0 termination claim, so the requirement is written to forbid any
   node, tradition hook, or objective from increasing stability or reducing decay.
3. **The decay rate is an authored integer, never a derived one.** `stabilityDecayPerTick` is a raw
   integer ≥ 1, validated at load. It MUST NOT be computed by fixed-point division. This is the
   specific trap the design walked into and out of: expressing decay as "stability divided by desired
   raid length" produces zero under fixed-point division rounding toward negative infinity whenever
   the divisor exceeds the numerator, and a decay of zero is a raid that runs forever with no error,
   no exception, and no symptom other than a worker that never returns.
4. **A hard ceiling above the arithmetic bound.** `MAX_ENGAGEMENT_TICKS` is a compile-time constant.
   The loader rejects any content where `ceil(initialStability / stabilityDecayPerTick)` exceeds it.
   At runtime, a raid reaching the ceiling resolves immediately *and* raises a loud invariant
   violation — because if the ceiling is ever reached, property 3 has been broken somewhere and the
   correct response is a failing test, not a quietly truncated raid.

Per-tick work is bounded for the same reason the tick count is: `maxCombatantsPerSide` and
`maxSummonsPerSide` are hard caps, and a summon that would exceed the cap is a no-op rather than a
queued request. A bounded tick count times bounded per-tick work is a bounded raid, which is the
whole claim.

Placeholder values: `initialStability = fp(3000)` jittered by up to `fp(600)` on stream 10,
`stabilityDecayPerTick = fp(1)` = 1024 raw, giving 2,400–3,600 engagement ticks (4–6 fictional
minutes); `MAX_ENGAGEMENT_TICKS = 8192`. Untuned.

*Alternative considered:* end the raid when a wall-clock or step budget is exhausted. Rejected —
wall-clock has no place in the core (`contracts.md` §0), and a budget-based cut produces a
non-deterministic resolution, which breaks golden replay and lockstep simultaneously.

*Alternative considered:* let objectives or spells extend portal stability, an obvious and thematic
mechanic ("shore up the gate"). Rejected explicitly and reluctantly. Any mechanism that increases
stability turns termination from a proof into an inequality between a decay rate and a regeneration
rate, and the release claim would degrade to "no raid exceeded the bound in the runs we did". If
this mechanic is ever wanted, the correct shape is a *reduction of the decay applied only to a
prepaid tick budget fixed at portal open* — the bound stays computable at entry.

### Spatial state is created at entry, discarded at resolution, and never persisted

The battlefield, terrain grid, spatial index, and combatants exist only while
`clock.mode == engagement`, and `contracts.md` §1.6 already forbids writing them to world snapshots.
Combatants are **derived** from world state, holding `sourceId` handles back into it; they are not
world entities that gained coordinates.

- **Terrain** is a grid over the 200 m × 200 m battlefield, cells carrying `passable`,
  `blocksLineOfSight`, and a movement cost. Generated at portal open from stream 10 keyed by the raid
  seed. Never persisted — regenerating from the seed is cheaper than storing it and cannot drift.
- **The spatial index** is a uniform grid whose cell size equals the maximum interaction radius, so
  any radius query touches at most nine cells. Uniform rather than a tree because insertion and
  update order in a tree affects traversal order, and traversal order feeding into targeting is a
  determinism hazard.
- **Range uses squared distance.** No square root appears in the rules path. `sqrt` is a
  floating-point operation and the float ban (`contracts.md` §0) is absolute; comparing `dx² + dy²`
  against `r²` is exact in fixed point and needs no helper.
- **Line of sight** is an integer supercover line walk between combatant centres over terrain cells,
  blocked by the first `blocksLineOfSight` cell. Integer Bresenham-family tracing keeps the float ban
  intact and makes LOS symmetric, which matters because an asymmetric LOS lets one side shoot from
  cover the other cannot see into.

### Consequence write-back is one atomic delta, ordered so that theft outruns loss

At resolution the engine computes a complete `RaidOutcome` and applies it in a single step. A raid
never leaves either world state partially updated — a partial application on a crashed worker would
be a corrupted universe, and worlds are persistent across runs (vision §8a).

Application order is significant:

1. **Casualties.** Combatants at 0 HP with `sourceKind == mage` set `alive = false` on the world mage
   handle in that mage's own universe. Soldier detachments decrement their source populace cohort.
   Summons (`sourceId == 0`) write back nothing — they never existed at world scale.
2. **Stranded raiders.** Attacker combatants still on the field when the portal collapses are lost
   with the portal. See below.
3. **Instance destruction.** Burned libraries destroy the knowledge instances at
   `library:<universityId>`; burned or looted grimoires destroy or move theirs; a dead mage's
   `mind:` and `palace:` instances are destroyed by mage death through `knowledge-model`'s normal
   path, not by a special raid rule.
4. **Theft insertion.** Successfully stolen instances are created in the thief's universe at
   `mind:<mageId>` with `mastery = 0` and `acquiredTick` set to the world tick the raid resumes at.
5. **Existence recomputation.** The derived "node exists in universe" index is recomputed for both
   universes, and nodes that fell to zero instances are recorded in the outcome record for metrics.
   Nothing caches existence in state — `contracts.md` §1.5 forbids it.

Theft insertion precedes existence recomputation deliberately. A node whose last host instance burned
in the same raid that a raider stole it survives — abroad, in the mind of the thief who took it, and
lost forever to the universe that invented it. That is the most evocative outcome the knowledge model
can produce and it should be reachable rather than accidentally ordered out of existence.

A raid consumes **zero world ticks**. Both clocks resume at exactly the tick they paused at. The cost
of raiding is favor, which `god-agency` owns; making a raid also cost world time would double-charge
it through a mechanism nobody chose.

### Knowledge existence and castability are different questions

`permits()` gates **casting**, never the possession of a knowledge instance. A raider may steal a
node her own universe forbids; it enters her universe, occupies a mind, can be taught and scribed,
counts toward existence — and is simply inert at home until the god permits its cell. This is exactly
the symmetry vision §3 describes from the other direction, and without stating it the write-back of
theft is ambiguous in a way that would produce two incompatible implementations.

### Stranded raiders are lost with the portal

An attacker combatant that has not returned through the portal's position when stability reaches zero
is lost: dead, permanently, with everything it was carrying. This is what makes the stability timer a
decision the raider's utility-AI must weigh rather than a clock that merely ends the scene.

*Alternative considered:* all surviving raiders return automatically at collapse. Rejected — it makes
the last tick of a raid free, so the dominant line is always "keep looting until the timer expires",
and the timer stops being a tension. Marked as the most likely rule in this change to need softening;
if the harness shows raiding is never worth attempting, the intended relaxation is a survival roll
scaled by distance to the portal, not a return to automatic extraction.

### The 64-slot engagement observation block is sufficient, and this closes `core-contracts`' question

`core-contracts` left open whether the 64-slot engagement block in `contracts.md` §4.1 must grow for
larger raids. It must not, because the block is summarised rather than per-combatant, and the caps
here bound what must be summarised. Allocation: own-side summary 12, enemy-side summary 12, six
objectives × 5 fields = 30, portal and clock 6, reserved 4. Total 64.

The enemy-side summary is **concealment-masked**: combatants evading detection do not contribute to
the enemy summary an agent observes. Concealment that is visible in the observation vector is not
concealment, and an RL agent would learn straight through it.

### Raid AI is autonomous; the god has no combatant verb

Mages act on their own utility-scored goals in raids exactly as they do in world time (vision §7).
`contracts.md` §4.2 contains no combatant-level action, and this change adds none. The god's only
raid verb is action 14, open portal — a decision made before the raid, whose consequences she then
watches. Combatant goal selection reuses `mage-autonomy`'s scorer with a raid-specific goal set.

## Risks / Trade-offs

- **The zero-occurrence arbitration claim could be vacuously true if the assertion never runs** →
  Fault-injection test disables the selection mask and asserts the counter becomes non-zero while no
  effect is applied. A test that proves the check is live is the only thing that distinguishes zero
  from unmeasured.
- **The stability decay rate is one integer away from a hanging simulation** → Defended three ways:
  authored not derived, validated ≥ 1 raw at load, and bounded by a compile-time ceiling that raises
  an invariant violation rather than silently truncating. The failure mode is a loud test failure at
  content load, which is the cheapest possible place to meet it.
- **Every combat magnitude here is a guess** → Explicitly marked untuned throughout. The harness from
  0.5.0 owns them, and the units and stacking rules — the things that are expensive to change later —
  come from `contracts.md` §3 rather than from judgement here.
- **Deriving combatants from world state hard-couples `rules-raid` to `rules-world`'s shapes** →
  Accepted and expected: `contracts.md` §5 places `rules-raid` above both rules packages precisely so
  this coordination has a legal home, and it keeps `rules-magic` and `rules-world` free of each other.
- **Stranded-raider permadeath may make raiding strictly unprofitable** → It is a single tunable rule
  with a named, pre-agreed relaxation, and `winRateByPrimitive` plus raid participation rate will show
  it. Better to ship the sharp version and soften it with evidence than to ship the safe version and
  never learn whether the timer created tension.
- **Terrain regenerated from seed rather than stored will diverge if the generator changes** → The
  generator's output is covered by golden replay fixtures, so a change to it fails the determinism
  suite in the change that caused it. Storing terrain would trade a caught failure for a silent one.
- **Concealment-masked observations mean an agent can be surprised by state it could not see** →
  Intended. It is the mechanic. The risk is that RL training becomes harder, which is the correct
  cost for a hidden-information primitive to impose.
- **Five `contracts.md` §1.6 fields are missing for this design to be implementable** → Recorded below
  as proposed amendments rather than made as edits, because `contracts.md` is normative and amending
  it belongs to `core-contracts`. Implementation of this change is blocked on that decision.

## Migration Plan

Additive over 0.6.0. No existing behaviour changes: world-time simulation is untouched, and a
universe that never opens a portal is bit-identical before and after this change — which is itself a
regression test worth running, since it proves the engagement layer is inert at world scale.

Rollback is reverting the branch. Persisted universes written before this change remain loadable,
because engagement state is never written to world snapshots (`contracts.md` §1.6).

The one sequencing constraint is that the proposed `contracts.md` §1.6 amendments must be accepted
before `rules-raid` implementation begins; the change cannot carry its own termination bound in state
without them.

## Open Questions

**Proposed amendments to `contracts.md` §1.6 `RaidState`.** Not applied here; `contracts.md` is
normative and this change may not edit it. Each is required by the design above:

1. `attackerUniverseId: uint32` — write-back addressing needs both participants, and only the host is
   currently recorded.
2. `hostRuleset` and `attackerRuleset` as immutable ruleset-snapshot values — the mechanism that
   resolves the §1.1 singleton contradiction and freezes policy. Note that `attackerTraditionId`
   already on `RaidState` becomes redundant once `attackerRuleset` carries it.
3. `raidSeed: uint32` and `engagementStartTick: int32` — a raid must be reproducible from its own
   state, and the termination bound is expressed relative to its start.
4. `stabilityDecayPerTick: fp` — currently `portalStability` exists with no declared decay rate, so
   the termination bound is not computable from state.
5. An objective `statusKind` field. The current `{kind, targetId, x, y, valueFp, capturedBy}` shape
   cannot distinguish *held*, *captured*, *looted*, and *destroyed*, and those four have different
   consequences at write-back — a looted library still stands, a burned one does not.

**Questions for the balance harness, not answerable here:**

- What is the right `initialStability`, and should it scale with the defender's total objective value
  so that raiding a rich universe grants more time? The latter is attractive and is deliberately not
  specified, because it makes the termination bound depend on world state and therefore harder to
  validate at load. If adopted, the bound must still be computed and checked at portal open.
- Is 32 combatants per side the right cap? It is the number the 64-slot observation block and the
  `sim-core-foundation` benchmark jointly have to live with, and it is a placeholder from both.
- Does the stranded-raider rule make raiding unprofitable? Named above with its relaxation.

**Questions for `contracts.md` §6, reported rather than silently decided:**

- Stream 7 is "mage autonomy / utility-AI tie-breaking" and stream 8 is "combat resolution". A
  combatant's goal selection in a raid is both. This design assigns goal-selection tie-breaks to 7 and
  all hit, evasion, and damage rolls to 8. Stream renumbering is forbidden, so the split should be
  confirmed before baselines are committed.
- Terrain generation and deployment placement are folded into stream 10, "objective and raid
  generation", as the nearest fit. If the registry ought to carry a distinct terrain stream, it must
  be appended before any balance baseline exists, not after.
