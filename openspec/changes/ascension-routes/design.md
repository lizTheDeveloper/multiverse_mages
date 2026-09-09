# A summit per playstyle — design

**Status:** proposal. Nothing here is implemented.
**Measured against:** `campaign/ascension-meta` @ `e5e2a2d`, reference-universe-v1.
**Reads:** `docs/superpowers/specs/2026-08-11-ascension-meta-design.md` (W3, approach C) and its
findings note.

## 1. The question this change was asked first: more routes, or better-differentiated routes?

**Both, and the order is forced.** Differentiation without a route per playstyle leaves three of the
eight scripted strategies with nothing to play toward; routes without differentiation produce five
buttons that unlock on the same tick. But the two halves are not symmetric in urgency, and they are
not the same workstream.

The tuning half — making apotheosis stop opening passively at tick 700 — is W2's, and this change
does not touch `god-constant.json`'s existing ascension constants.

The half that is *this* change's, and that is not a tuning problem at all, is that **the existing
two routes cannot be told apart even in principle by the instruments the repo has.** Three separate
mechanisms:

- `qualifyingPath` returns apotheosis whenever apotheosis holds, and reaches canon only when it does
  not. Canon's measured share is therefore bounded above by the fraction of ascensions in which
  apotheosis was *not* also satisfied. Retuning the constants cannot fix an evaluation order.
- The declaration carries no choice. Vision §8a frames ascension as *"a summit reached"*; today the
  engine decides which summit the player reached, and the player learns about it in the terminal
  record.
- `ascensionRateByPath` is specified and unbuilt, and the layer beneath it throws the information
  away: `agent-api`'s session maps both ascension reasons onto `'ascended'`, and `mc-harness`'s
  `TERMINAL_STATUS` has no finer vocabulary. **A sweep run today physically cannot answer "which
  route was that".**

So: the first four task groups are differentiation-of-the-existing-two, and they would be worth
doing if no new route were ever added. The three new routes then sit on an instrument that can see
them. Stated as an answer to the campaign's question: *more routes is the right move, but it is the
second move, and doing it first would have produced three more indistinguishable ones.*

## 2. Which playstyles get a summit, and which do not

The `hypothesis` field on each of the eight strategies in `packages/mc-harness/src/strategies.ts` is
the best written statement of intended playstyle. Taking them one at a time:

| Strategy | Hypothesis, in one clause | Summit |
|---|---|---|
| `passive-control` | the null hypothesis — what a universe does unattended | **None, deliberately.** A control that can win is not a control. Every route's condition must be one passive play fails. That is the acceptance test for W2's retune and for each new route alike |
| `uniform-random-legal` | the noise floor | **None.** It may still ascend by luck; that it currently ascends 10/10 is F1, and it is W1's and W2's to fix |
| `narrow-depth` | whether concentration beats breadth | **`apotheosis`**, unchanged. The deepest node of a cell is what concentration is for |
| `archivist` | whether redundancy defeats the loss channel | **`enduring-canon`**, unchanged. Consecutive era boundaries under a `libraryDependence` ceiling *is* redundancy paying. The route is not missing; it is invisible, and §1 says why |
| `permissive-breadth` | whether breadth outruns the loss channel | **`great-compendium`**, new. It is the only strategy that measurably does something (273 nodes known) and it has nothing to play toward |
| `worship-maximizer` | whether the favor economy binds | **`unbroken-devotion`**, new — with a shape argued in §4, because the naive version rewards the snowball §7 exists to catch |
| `denial-warden` | whether the god can suppress a capability at all | **`warded-silence`**, new — with a health conjunct, because the naive version rewards dying quietly |
| `portal-rush` | whether reaching the portal early is worth its tempo | **None yet, and this is a rejection with a reason.** `portalTargets` is empty in a single-universe Monte Carlo run, so `openPortal` is masked in every sweep the harness can currently run. A portal route would be unfalsifiable until `raid-engagement` lands. It is named in §7 as future work and no terminal reason is reserved for it — reserving an unused id is a promise, and promises in an append-only enumeration are how enumerations rot |

That is five live routes: two existing, three new. Five is a deliberate number and §5 explains why it
is not three and not eight.

## 3. Declaration and detection

### Qualification is a set

`GodStateRecord` gains `ascensionQualified`, a bitmask over route slots, recomputed from scratch
every world tick by the outcome system — the same discipline the current `ascensionPath` follows, and
for the same reason: a condition that can be met must be able to lapse.

`qualifyingPath`'s first-match-wins ordering is deleted. Every authored route is evaluated every
tick and contributes its own bit. Nothing in the engine ranks them.

`ascensionPath` is retained, and narrowed to **the route the god declared**, `0` while the run is
live. Its stored values keep their existing meanings — `1` apotheosis, `2` canon — so a snapshot
written before this change reads correctly after it.

### Declaration is a parameterized action

`declareAscension` (action 15) joins `PARAMETERIZED_ACTIONS`. Its candidate list is the qualifying
routes in authored order; `CANDIDATE_SLOTS[15] = 8` is pinned in the sense §4.4 already uses — a
contract constant, not a tuning knob.

Three consequences worth stating rather than discovering:

- **`k = 8` caps how many routes may be simultaneously live.** The content loader asserts
  `routeCount ≤ 8` and fails hard otherwise, so a build can never author a route an agent has no
  slot to name.
- **Parameter `0` is the graceful-degradation path.** A policy trained before this change emits no
  parameter, which resolves to slot `0` — the highest-ranked qualifying route. With apotheosis
  authored first and canon second (asserted by the loader), that is byte-identical to today's
  first-match-wins behaviour. Old policies keep working; they simply cannot express a preference.
- **The mask's shape does not change.** `mask[15]` stays a single entry, now
  `ascensionQualified !== 0`. Per-route legality is carried by the candidate list, which is how every
  other parameterized action already works.

**Rejected: one action id per route (16, 17, 18…).** Action ids are append-only, so this is legal,
but it makes the *action space size* a function of *how many routes content authors* — which puts a
content edit in the position of invalidating every trained policy. Routes are content. The action
space is a contract. The parameter keeps them on the correct sides of that line.

**Rejected: a deterministic engine-side tiebreak (rarest route, hardest route, most recently
qualified).** Any of these is implementable and none is a decision. The whole finding in §1 is that
the engine choosing is what made canon invisible; a cleverer engine choice reproduces the defect
with better manners.

### The terminal reason is per route, and append-only

`TERMINAL_REASON` gains `ascensionCompendium = 5`, `ascensionDevotion = 6`, `ascensionWarded = 7`.
The existing four keep their values permanently: they are serialized into every episode record, into
the gym wire format, and into golden fixtures.

**Rejected: one `ascension` terminal reason plus a separate `routeId` field.** It is arguably
tidier, and it is a breaking change to the meaning of `terminalReason == 1`, which
`mm_gym.rewards.sparse_terminal` and every episode record already committed depend on. Append-only
costs three enumeration members and breaks nothing.

**The trap this creates, named so it is fixed rather than discovered.** `rewards.py` currently reads:

```python
if outcome.terminal_reason in (
    TERMINAL_REASON_ASCENSION_APOTHEOSIS,
    TERMINAL_REASON_ASCENSION_CANON,
):
    return 1.0
```

A route-5 ascension scores `0.0`. Not an error, not a warning — a silent zero that teaches a policy
the compendium is worth exactly as much as stagnating. The module gains an exported
`ASCENSION_TERMINAL_REASONS` frozenset, and a contract test asserts its membership equals the set of
ascension reasons the TypeScript enumeration declares, so the two cannot drift.

## 4. The five condition kinds

Routes are compositions of a closed vocabulary, implemented once each, parameterized by named
`god-constant` ids. This is the same move §4 of the vision makes for effect primitives, for the same
reason: balance assertions need a small number of things to be asserted over.

Every kind is integer arithmetic over counters that already exist or over run-length counters added
in the same style as `goodEraRun` — fixed point at 1/1024, no floats, no wall clock. Every
sustained kind resets its counter to zero the moment its condition lapses, exactly as
`stepStagnation` does, because every one of these is about a *consecutive* run.

### `deepest-node-held` — apotheosis, unchanged

A living mage holds the deepest node of a permitted cell, with at least two live instances, at
worship tier ≥ `ascension-tier-gate`. Retained verbatim; W2 owns its constants.

### `era-run` — enduring canon, unchanged

`goodEraRun ≥ ascension-era-count`, where a boundary passes when `libraryDependence ≤
ascension-dependence-max` and `eraNodesLost ≤ ascension-loss-max`. Retained verbatim; W2 owns its
constants.

### `breadth-held` — the Great Compendium

At least `compendium-cell-count` distinct **permitted** cells each hold at least
`compendium-nodes-per-cell` known nodes, each with at least two live instances, held continuously for
`compendium-sustain-ticks`.

The two-instance clause is what stops this being "permit everything and wait". §6a says a
university's output scales with library depth and that teaching capacity is finite; holding *many*
cells *redundantly* is the thing breadth is bad at, which is precisely `permissive-breadth`'s own
stated hypothesis — *"breadth might instead spread a fixed teaching capacity too thin"*. The route
is the affirmative answer to that hypothesis, and it is not free.

### `worship-recovered` — Unbroken Devotion

Worship returns to tier ≥ `devotion-tier-gate` within `devotion-recovery-ticks` of a shock whose
factor is at or below `devotion-shock-floor`, on `devotion-occurrences` non-overlapping occasions in
one run.

**Why not simply "hold the highest worship tier".** That route is *win the snowball*. §7 makes
`worshipSnowball` a threshold metric with a Gini ceiling of 0.35 precisely because the worship→favor
loop is one of the design's two compounding loops, and a summit awarded for magnitude would pay the
player for the exact behaviour the balance gate exists to catch.

Recovery is a different quantity. `worship-lag-fall` (≈15%/tick) is strictly greater than
`worship-lag-rise` (≈5%/tick) — the asymmetry is documented in `god-constant.json` as *"the loop's
damping"* — so a shock is felt in about five ticks and re-earned over about twenty. A route that
requires the loop to be pushed *down* and driven back up several times measures whether the god can
manage devotion, and it is strictly harder for the runaway leader than for anyone else, because a
saturated universe has nowhere to recover *from* without deliberately spending something. It rewards
the second half of `worship-maximizer`'s hypothesis — *whether the economy binds* — rather than the
size of the number.

### `constrained-thriving` — Warded Silence

Permitted cell count ≤ `warded-max-cells` **and** worship ≥ `warded-health-floor` **and** living
mages ≥ `warded-min-mages` **and** populace ≥ `warded-min-populace`, all four held across
`warded-era-run` consecutive era boundaries.

**The conjunct is the whole design.** Vision §8a: *"defeat is not the opposite of ascension. A
universe that is raided to ruin does not 'lose' — it stagnates."* `denial-warden` currently ends at
7.8 nodes known, which is a universe close enough to dead that a naive suppression route would be a
summit awarded for dying slowly. The health conjuncts make the route say something the game does not
currently say anywhere: *a universe can be deliberately narrow and still be alive.* It is the same
shape, and the same argument, as `stepStagnation`'s conjunctive stasis trigger, which exists so that
a perfect custodian is not terminated as ruin.

`warded-max-cells < compendium-cell-count` is asserted by the loader, which makes these two routes
**mutually exclusive by construction**.

## 5. Why this produces variety rather than a new dominant line

The obvious failure mode is that a player computes which summit is cheapest and every strategy
converges on it, leaving four dead routes and a nicer-looking version of the same one axis. Five
mechanisms, in descending order of how much work they do:

1. **Opposed conditions.** `great-compendium` requires at least *N* permitted cells;
   `warded-silence` requires at most *K*, with `K < N` asserted at content load. No universe
   satisfies both, ever, at any tuning.
2. **Contended capacity.** `encourageResearch` is one action per round, and slot 0 is the deepest
   permitted cell. `apotheosis` wants it taken every round; `great-compendium` wants it rotated.
   This is the exact trade `narrow-depth` and `permissive-breadth` already probe, given a terminal
   condition on each side.
3. **Contended stability.** Breadth raises `libraryDependence` — more nodes known against the same
   scribe and teaching capacity means more nodes with exactly one instance. That metric is the gate
   `enduring-canon` fails on. Pursuing the compendium actively costs canon progress, and the harness
   can see it, because `libraryDependence` is already a §7 metric collected per run.
4. **Sustained conditions defeat late pivots.** Every new route requires a *run* — consecutive era
   boundaries or consecutive ticks — rather than an instantaneous state, and the axis-change
   hysteresis (`hysteresis-step` per outstanding change, decaying every `hysteresis-decay-ticks`)
   makes a late ruleset flip escalatingly expensive. A player cannot notice at tick 900 that
   `warded-silence` is cheap and reshape the ruleset to claim it.
5. **Payout parity, which is the one that would silently undo the other four.** Declaration is
   priced identically for every route, and `prestigeEarned` gains **no per-route term**: the base
   stays `prestigeBaseAscended` for all five. Differentiation stays where it already is — the
   `deepestTier`, `erasSurvived`, and `peakWorshipTier` achievement terms, which vary by *how the
   run was played* rather than by *which button was pressed*. A per-route price or a per-route
   prestige bonus is a direct lever for "take the cheapest route", and both are rejected here
   explicitly so that a later tuner does not reach for one as an obvious knob.

**One cross-qualification hazard, named rather than designed away.** `denial-warden` forbids
constantly, and each forbidding produces an upheaval shock — which is an input to
`worship-recovered`. A warden that keeps its universe healthy can qualify for both `warded-silence`
and `unbroken-devotion`. That is not a bug: declaration resolves which it claims, and the strategy ×
route cross-tabulation is exactly the instrument that shows whether it resolves it *consistently*.
If `denial-warden` splits its ascensions evenly across two routes, it has no modal route, and the
"predominantly" clause of the claim below is what catches that.

Prestige is unaffected in kind. `carriedPrestige` still saturates at `prestigeCap` and
`legacyBudget` is still concave on top of it, so §8a's *"prestige must not compound without bound"*
holds for five routes exactly as it held for two: the routes change what a run must achieve, not
what an achievement is worth.

## 6. Metrics: what says a route is dead

**No new §7 metric name is invented.** `ascensionRateByPath` is already named in `contracts.md` §7's
neighbourhood and in `god-agency` task 7.3; this change builds it and pins its definition:

> For each authored route *r*: `ascensionRateByPath[r]` is the fraction of **eligible** runs whose
> terminal reason is *r*'s, over the same denominator `ascensionRate` uses — runs whose status is
> ascended, stagnated, or truncated, with failed runs excluded from both numerator and denominator
> and reported separately. The **share** of route *r* is derived as
> `ascensionRateByPath[r] / ascensionRate`, and is defined only when `ascensionRate > 0`.

Threshold owner is `god-agency`, per §7's ownership split. Two assertions:

- **Dominant route.** `share(r) > 0.60` for any *r* fails the sweep and names the route. This
  **tightens and supersedes** `god-agency`'s existing scenario, which fails only above 90%; that
  scenario is marked superseded when this lands rather than left to disagree quietly.
- **Dead route.** `ascensionRateByPath[r] == 0` fails the sweep and names the route, **provided the
  sweep is large enough for zero to mean something**: `n × rateBudget(r) ≥ 8`, where `rateBudget` is
  authored per route in `ascension-route.json`. Below that size the metric reports the route as
  `{status: "unavailable", reason: "underpowered-sweep"}` rather than passing it — an underpowered
  sweep that silently passes is worse than one that says it cannot tell.

The rate budgets are content, authored `untuned`, and the loader asserts two properties of them:
their sum lies inside §7's declared 5–20% ascension band, and no single budget exceeds 60% of that
sum. The 60% claim is therefore checked twice — once against the design at content-load time, once
against reality at sweep time — and a build that could not possibly satisfy it fails before a sweep
is spent finding out.

**The strategy × route cross-tabulation is a tournament report, not a §7 metric.** §7 metrics are
collected against builds that have no scripted pool, and a metric that is `unavailable` whenever the
harness is not running a round-robin is a metric shaped wrong. `tournament.ts` already produces a
per-strategy record; it gains a route histogram, and the long-horizon gate reports it.

## 7. The claim, and what disproves it

> **Claim.** On the 2400-tick long-horizon sweep over the committed eight-strategy round-robin pool,
> at least three distinct strategies each have a *modal ascension route* that no other of the three
> shares, and no route accounts for more than 60% of all ascensions.

**The sweep that decides it:** the long-horizon gate W1 introduces — 2400 world ticks,
reference-universe-v1, eight-strategy round-robin, `n ≥ 400` runs. The floor on *n* is not
arbitrary: it is the smallest *n* for which the rarest authored rate budget predicts at least eight
ascensions, so that observing zero is decisive rather than unlucky.

**The measurements that disprove it, any one of them sufficient:**

| Observation | What it falsifies |
|---|---|
| Fewer than three strategies have distinct modal routes in the tournament cross-tab | The variety claim directly |
| Any route's `share` exceeds `0.60` in `ascensionRateByPath` | The concentration claim directly |
| Any authored route's `ascensionRateByPath` is `0` at `n × rateBudget ≥ 8` | The route is dead; the claim is false because a dead route cannot be any strategy's modal route |
| A strategy's modal route is modal by a margin inside sampling noise for *n* | "Predominantly" is not established; the claim is not yet true, which is a different failure from being false, and the sweep reports it as such |
| `ascensionRate` leaves 5–20% | Not this claim, but a gate this change can break: five disjunctive routes sum, and the rate-budget assertion is the design-time guard against it |

**Failure is informative in a specific way, and that is the point of authoring budgets.** A dead
route says its condition is unreachable at current content and constants; a dominant route says its
condition is cheaper than the other four. Both are localized to one route's constants, which is what
makes the retune order statable at all: adjust the offending route's own constants first, and only
then reconsider the route.

## 8. Dependencies, stated plainly

- **Blocked on W2 for content.** Until ascension gates on something the god's play moves, every
  strategy reaches eligibility at the same tick and a five-route sweep measures five ways of
  pressing the same button. The route records and the three new condition kinds must not be authored
  before W2's retune is committed and green.
- **Blocked on W1 for measurement.** Until every scripted strategy carries an explicit ascension
  stance, "which route did it take" measures preference-list ordering rather than play.
- **Not blocked:** task groups 1–4 — the terminal-reason extension, the qualification bitmask, the
  parameterized declaration, and the `ascensionRateByPath` plumbing. These are what make W2's own
  falsifiable claim measurable *by path*, so landing them first is useful to W2 rather than merely
  harmless to it.
- **File coordination.** This change does not edit `packages/mc-harness/src/strategies.ts` (W1) and
  does not modify any existing constant in `packages/content/data/god-constant.json` (W2). Its
  god-constant edit is an **append** of new ids for the three new routes, which merges cleanly with
  W2's modification of existing ones. Route records reference god-constant ids by name rather than
  inlining thresholds, so W2's tuned values flow through without this change restating them.
