## ADDED Requirements

### Requirement: Worship is a measurement of the civilization, not an accumulated stock

`worship` SHALL be recomputed every world tick from current universe state and MUST NOT be
incremented, spent, transferred, or otherwise treated as a resource. No action in the
`docs/design/contracts.md` §4.2 action space may write `worship` directly; interventions influence
it only by changing the civilization the formula measures, or through the upheaval shock defined
below.

#### Scenario: Past size buys nothing

- **WHEN** two universes reach identical mage, university, and populace counts at the same tick,
  one having grown steadily and one having peaked at ten times that size and collapsed
- **THEN** both converge to the same worship target, and neither retains an advantage from its
  history once the lag has settled

#### Scenario: Worship is not spendable

- **WHEN** the action-space conformance check inspects every intervention's effect
- **THEN** no intervention debits or credits `worship` as a currency

#### Scenario: Worship is recomputed, not persisted forward

- **WHEN** a universe's living mages all die in a single world tick
- **THEN** the worship target for the following tick reflects zero mage devotion, regardless of
  what worship held before

### Requirement: Worship contributions saturate per source class

The worship target SHALL be the sum of three independently saturated source classes — mages,
completed universities, and populace — each combined by
`sat(x, cap, half) = cap × x / (x + half)` using the shared fixed-point division that rounds toward
negative infinity. The sum of the three `cap` values MUST be the formula's absolute ceiling, so
that no clamp is applied after the fact. All magnitudes below are untuned placeholders awaiting
the balance harness.

| Class | Raw input | `cap` | `half` |
|---|---|---|---|
| Mages | `fp(1024)` per living mage, `+fp(512)` while blessed | `fp(4096)` | `fp(51200)` |
| Universities | `fp(2048)` per completed university | `fp(3072)` | `fp(20480)` |
| Populace | `fp(16)` per head | `fp(2048)` | `fp(16384)` |

#### Scenario: A class at its half-point yields half its cap

- **WHEN** a universe holds exactly 50 living unblessed mages
- **THEN** the mage class contributes `fp(2048)`

#### Scenario: Contributions are concave

- **WHEN** a universe grows from 50 to 100 living mages
- **THEN** the mage class contributes less additional worship than it did growing from 0 to 50

#### Scenario: The ceiling is a property of the formula

- **WHEN** a universe is seeded with a million of every source
- **THEN** the worship target is strictly below `fp(9216)` and no post-hoc clamp is applied

#### Scenario: Classes saturate independently

- **WHEN** a universe's mage class is at its cap and its university class is at zero
- **THEN** founding a university still increases the worship target

### Requirement: Worship follows its target with an asymmetric lag

Stored `worship` SHALL move toward the worship target by
`worship' = worship + (target − worship) × LAG / fp(1024)` each world tick, using `LAG_RISE` when
the target is above current worship and `LAG_FALL` when it is below, with `LAG_FALL > LAG_RISE`.
`LAG_RISE = fp(51)` and `LAG_FALL = fp(154)` are untuned placeholders.

#### Scenario: Worship rises gradually

- **WHEN** a universe at `worship = 0` reaches a worship target of `fp(4608)` and is advanced one
  world tick
- **THEN** `worship` is `fp(229)`, not `fp(4608)`

#### Scenario: Worship falls faster than it rises

- **WHEN** a universe at `worship = fp(4608)` loses everything and its target drops to zero
- **THEN** the magnitude of the first tick's change exceeds the magnitude of the first tick's
  change when the same universe rose from zero to that target

#### Scenario: Worship converges

- **WHEN** the worship target is held constant for 200 world ticks
- **THEN** `worship` differs from the target by less than one fixed-point unit

#### Scenario: The lag is deterministic

- **WHEN** the same seed and action log are replayed
- **THEN** `worship` is identical at every world tick, and the fixed-point division rounds toward
  negative infinity throughout

### Requirement: Worship never reads library depth

The worship formula MUST NOT take as input library depth, node tiers known, instance counts,
research rate, or any other measure of knowledge as capital. The only permitted route from
knowledge to favor SHALL be the `worship-yield` effect primitive, which multiplies favor
regeneration through the shared capped channel and never enters the worship formula.

#### Scenario: Library depth is irrelevant to worship

- **WHEN** two universes hold identical mage, university, and populace counts but library depths of
  40 nodes and 1000 nodes
- **THEN** both compute the same worship target

#### Scenario: The formula's inputs are enumerated

- **WHEN** the conformance check inspects the worship computation's dependencies
- **THEN** it reads only living mage records, completed university records, populace cohort counts,
  the blessing flag, and the upheaval shock, and reading any knowledge component fails the check

#### Scenario: Knowledge reaches favor only through the primitive

- **WHEN** a universe acquires nodes carrying `worship-yield`
- **THEN** favor regeneration rises and the worship target is unchanged

### Requirement: Worship tiers are geometric and set the edict budget

`worshipTier` SHALL be the count of geometric thresholds `fp(512) × 2^t` for `t` in `0..4` that
current worship meets or exceeds, yielding tiers 0 through 5. `edictBudget` MUST equal
`1 + worshipTier`, and `edictBudgetMax` MUST therefore be 6 — the value `contracts.md` §4.1 uses to
size the observation vector's ruleset block. Thresholds are untuned placeholders; the tier count
is not, because the observation shape depends on it.

#### Scenario: Tier is derived from worship

- **WHEN** worship is `fp(4608)`
- **THEN** `worshipTier` is 4 and `edictBudget` is 5

#### Scenario: A fresh universe holds one edict

- **WHEN** a universe is created with zero worship
- **THEN** `worshipTier` is 0 and `edictBudget` is 1

#### Scenario: The budget is bounded

- **WHEN** worship reaches its ceiling
- **THEN** `worshipTier` is 5, `edictBudget` is 6, and no state permits a seventh edict

#### Scenario: Losing a tier does not silently drop an edict

- **WHEN** a universe holding 5 edicts falls from worship tier 4 to worship tier 3
- **THEN** the existing edicts remain in force, no further edict may be issued until one is
  revoked, and the over-budget condition is reported to the harness

#### Scenario: Tier is cached and recomputed on change

- **WHEN** worship crosses a threshold
- **THEN** the cached `worshipTier` is recomputed within the same world tick and every
  tier-dependent value observes the new tier

### Requirement: Upheaval applies a worship shock proportional to disruption

Forbidding a previously permitted technique or form SHALL multiply the worship target by a shock
factor for `UPHEAVAL_TICKS` world ticks, and the shock MUST scale with the fraction of the
universe's known nodes rendered inert by the change, so that forbidding an unused axis is nearly
costless in worship. Changing tradition SHALL apply a far larger shock for a far longer window.
Knowledge in a forbidden cell MUST become inert rather than destroyed. `UPHEAVAL_TICKS = 24`, a
shock floor of `fp(512)`, a tradition shock of `fp(256)` for 120 world ticks, are untuned
placeholders.

#### Scenario: Forbidding an unused axis barely stings

- **WHEN** a form no mage has ever studied is forbidden
- **THEN** the worship shock factor is at or near `fp(1024)` and worship is substantially unchanged

#### Scenario: Forbidding a load-bearing axis halves worship

- **WHEN** a technique underpinning most of the universe's known nodes is forbidden
- **THEN** the worship target is multiplied by approximately `fp(512)` for 24 world ticks and
  recovery follows `LAG_RISE`

#### Scenario: Forbidden knowledge is inert, not lost

- **WHEN** a permitted technique is forbidden and later permitted again
- **THEN** every knowledge instance in the affected cells is present with unchanged mastery, and no
  node left the universe as a result

#### Scenario: Tradition change is ruinous

- **WHEN** the universe's tradition is changed
- **THEN** the worship target is multiplied by `fp(256)` for 120 world ticks and the remaining
  favor pool is zeroed

#### Scenario: Shocks do not stack without bound

- **WHEN** two forbidding actions apply overlapping shocks
- **THEN** the combined factor is computed by the shared multiplicative-on-remainder arithmetic and
  never falls below the declared shock floor

### Requirement: The worship loop is bounded and measured against a stated threshold

The balance harness SHALL report `worshipSnowball` as the Gini coefficient of favor regeneration
across Monte Carlo runs at fixed tick counts, and the metric MUST stay at or below its threshold at
every measured point. The harness MUST also report the ratio of 95th-percentile to median favor
regeneration and `favorWasted`. No implementation may clamp these metrics; they are measurements,
and the threshold is the test rather than the mechanism. A threshold of Gini ≤ 0.35 measured at
world ticks 120, 600, 1200, and 2400, with a 95th-percentile-to-median ratio at or below 3:1, is an
untuned placeholder.

#### Scenario: The threshold is asserted, not assumed

- **WHEN** a ten-thousand-run sweep completes
- **THEN** `worshipSnowball` is reported at all four tick counts and the sweep fails if any exceeds
  the threshold

#### Scenario: A runaway is attributable to a source class

- **WHEN** `worshipSnowball` exceeds its threshold
- **THEN** the per-class saturated contributions are reported alongside it, so the responsible
  class is identifiable without a second sweep

#### Scenario: Retuning follows a stated order

- **WHEN** the threshold is exceeded and the formula is retuned
- **THEN** the saturation caps are lowered first, the half-points raised second, favor-per-worship
  lowered third, and the per-tier favor cap lowered fourth, one knob at a time with a full sweep
  between

#### Scenario: Surplus is visible before dispersion is

- **WHEN** a strategy regenerates more favor than it can spend
- **THEN** `favorWasted` rises for that strategy, independently of whether `worshipSnowball` has
  yet moved
