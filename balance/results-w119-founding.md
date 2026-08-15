# w119 — does anybody found a university, and what would it cost to start with none

**Measured 2026-08-14.** Shipped arm on `be446a6` (`origin/main`, immediately after #125
*"Universities become institutions"*). Removal arm on `1afb9e6`
(`w119/start-with-no-university`), which is `be446a6` plus the founding instrument plus one
change: the founding academy is deleted from `buildReferenceState`. Both arms re-measured after
#125 landed; the pre-#125 numbers were within noise of these and are not reproduced.

Every table below is reproducible from the tree it names:

    node tools/w119/founding-table.mjs 600         # the founding table
    node tools/w119/probe-trace.mjs                # the positive control, tick by tick
    PASSIVE=1 node tools/w119/affiliation-trace.mjs 2400
    node tools/w119/affiliate-score.mjs 300

## 1. The question, and why it needed an instrument

`strategies.ts` records in `permissive-breadth`'s own version history that `fundUniversity`
*"moved ahead of the three ruleset actions **while `universityCount` is zero**"*, and that before
the move *"the strategy that exists to fund broadly completed no university in any run of any
sweep ever taken."*

That was a code comment, and nothing in the build could check it. §4.2 gives founding and funding
**one action id**, so `spentByAction[11]` cannot say which purchase resolved;
`WorldStepReport.universitiesCompleted` counts only the ones *laborers* finished, so a site the
god's fourth funding completed is invisible to it; and the candidate list is capped at the
action's slot count and stops counting at seven.

`FoundingAudit` in `packages/scenario/src/strategy-audit.ts` is that instrument.

### The positive control fires, and at the tick the arithmetic predicts

`FOUNDING_PROBE` wants exactly one thing: action 11, slot 0. Favor opens at 0,
`favor-regen-base` is fp 1024/tick, `found-university-cost` is fp 10240, and worship lags upward
from nothing — so the price is crossed in the region of ten world ticks. From
`tools/w119/probe-trace.mjs` on the removal arm:

| world tick | ledger opening | spent on action 11 | universities standing |
|---|---|---|---|
| 7 | 7,968 | 0 | 0 |
| 8 | 9,205 | 0 | 0 |
| **9** | **10,463** | **10,240** | **1** |
| 16 | 9,536 | 0 | 1 |
| **17** | **10,929** | **10,240** | **2** |

**This control is not decoration.** The first version of the watcher held the `SimState` that
`Scenario.create` returned and read the `UNIVERSITY` component off it. `sim-core`'s `step` clones
(`const next = state.clone()`), so that reference describes the tick-0 world forever: it reported
**0 universities founded on a run that founded 195**. A non-zero assertion would have caught that;
a *predicted tick* is what makes the rest of the table readable.

## 2. The shipped starting position, `be446a6`, 600 world ticks

    strategy              legal    afford   sub:found  sub:fund  founded  @tick  completed  @tick  grimoires  @tick  lessons  pre-uni  peakFavor
    founding-probe        582/600  187/600  582        0         187      9      67         0      594        2      150      4        14100
    passive-control       597/600  591/600  0          0         0        -      1          0      598        2      172      172      51200
    uniform-random-legal  594/600  587/600  9          39        9        44     10         0      600        2      362      18       51200
    permissive-breadth    591/600  566/600  0          4         0        -      1          0      579        2      501      501      51200
    narrow-depth          518/525  493/525  0          0         0        -      1          0      292        2      51       51       40960
    denial-warden         500/507  487/507  0          0         0        -      1          0      27         2      17       17       40960
    archivist             538/600  183/600  538        0         183      26     82         0      623        2      488      15       14351
    portal-rush           588/600  473/600  0          0         0        -      1          0      180        2      158      158      40960
    worship-maximizer     597/600  591/600  0          0         0        -      1          0      587        2      235      235      51200
    idle-then-declare     597/600  591/600  0          0         0        -      1          0      598        2      172      172      51200
    permit-then-idle      589/600  558/600  0          0         0        -      1          0      571        2      443      443      40960
    allocate-concentrate  589/600  558/600  8          30        8        150    9          0      567        2      660      153      51200
    allocate-spread       589/600  558/600  8          30        8        150    9          0      562        2      601      153      51200

**The comment is now a measurement.** `permissive-breadth` submits action 11 four times in 600
ticks and names slot 0 **zero** times. It founds nothing — and not because it cannot afford to:
it could have paid the founding price on 566 of 600 ticks. The promotion that was added to fix
this is conditional on `universityCount === 0`, and the starting position seeds a completed
academy, so the condition is false before tick 0 exists. **The fix is gated on a condition the
scenario permanently falsifies.**

Two smaller readings from the same table:

- **Legality is not intent and is not success.** The probe sees action 11 legal on 582 ticks and
  can afford to found on 187. `cheapestPrice` admits the entry while *either* purchase is
  affordable, and `fundUniversityCandidates` does not filter completed universities — so once one
  is finished the entry stays legal at the funding price and every submission against it is
  refused by `fundPlan`. A column that read legality as trying would have reported the probe
  attempting constantly.
- **`worship-maximizer` still shadows action 11**, as `strategy-shadowing.test.ts` already
  records: 591 ticks legal, 587 listed, 0 submitted.

## 3. The removal arm, `1afb9e6`, 600 world ticks

    strategy              legal    afford   sub:found  sub:fund  founded  @tick  completed  @tick  grimoires  @tick  lessons  pre-uni  peakFavor
    founding-probe        574/600  194/600  574        0         194      9      95         24     0          -      224      5        14635
    passive-control       591/600  591/600  0          0         0        -      0          -      0          -      544      544      40960
    uniform-random-legal  589/600  589/600  9          42        9        46     9          66     0          -      536      142      51200
    permissive-breadth    559/600  546/600  1          4         1        40     1          114    0          -      738      63       51200
    narrow-depth          486/520  486/520  0          0         0        -      0          -      0          -      161      161      40960
    denial-warden         543/559  543/559  0          0         0        -      0          -      0          -      70       70       40960
    archivist             371/600  124/600  371        0         124      216    46         228    0          -      705      610      14295
    portal-rush           311/359  311/359  0          0         0        -      0          -      0          -      347      347      40960
    worship-maximizer     591/600  591/600  0          0         0        -      0          -      0          -      578      578      40960
    idle-then-declare     591/600  591/600  0          0         0        -      0          -      0          -      544      544      40960
    permit-then-idle      554/600  554/600  0          0         0        -      0          -      0          -      1311     1311     40960
    allocate-concentrate  554/600  554/600  8          30        8        150    8          162    0          -      746      240      51200
    allocate-spread       554/600  554/600  8          30        8        150    8          162    0          -      862      240      51200

Three things happen, and the third is why the arm is not merged.

1. **The promotion fires.** `permissive-breadth` names slot 0 once and founds a university at tick
   40, which it completes at tick 114. With `universityCount` genuinely zero, the gate opens.
2. **Teaching carries more, not less.** Lessons rise across the pool — `permit-then-idle` 443 →
   1311, `permissive-breadth` 501 → 738. Knowledge still moves in the window before anything is
   built, because teaching is mage-to-mage and needs no institution. The opening is slow, not
   dead.
3. **Not one grimoire is written, in any arm, ever.** `archivist` completes 46 universities and
   writes nothing. The probe completes 95 and writes nothing.

## 4. Why founding a university buys no scribing: `completeAffiliation` has no caller

This is **not** a defect the removal introduces. It is `mage-autonomy`'s, and it is visible on
`be446a6` if you look at the right column.

`isFeasible` masks `scribe` when a mage's scribe throughput is zero, and throughput is zero for an
unaffiliated mage. A mage acquires an affiliation through the `affiliate` goal, and that goal:

- **is feasible** — `universityPreference` returns any completed university in preference to a
  current handle of `0`, so `betterAffiliationAvailable` is true for every unaffiliated mage the
  moment one is finished;
- **is selected** — over 300 ticks from the first completion, `tools/w119/affiliate-score.mjs`
  counts **1,130 mage-ticks** committed to `affiliate` on the shipped arm and **1,616** on the
  removal arm, second only to `research-node`;
- **is never applied.** `completeAffiliation` has **no caller outside its own tests**.
  `world-step.ts` says in prose that the goal *"completes through `completeAffiliation` rather
  than by accumulating months"*. The wire it describes does not exist. The commitment is adopted,
  spends no months, and never resolves.

The consequence, `PASSIVE=1 node tools/w119/affiliation-trace.mjs 2400`, no god actions,
200 world years:

| tick | shipped: mages / affiliated / grimoires | removal: mages / affiliated / grimoires |
|---|---|---|
| 0 | 6 / **6** / 0 | 6 / **0** / 0 |
| 120 | 17 / 5 / 96 | 19 / 0 / 0 |
| 480 | 20 / 4 / 421 | 18 / 0 / 0 |
| 960 | 47 / 3 / 163 | **11 / 0 / 0** |
| 1920 | 57 / 2 / 46 | **11 / 0 / 0** |
| 2400 | 73 / **1** / 51 | **11 / 0 / 0** |

Read the affiliated column on the shipped arm: **6 → 5 → 4 → 3 → 2 → 1.** It only ever falls. The
six mages the scenario hand-affiliates at tick 0 do every piece of scribing the universe will ever
do, and they are dying. On a run with a god founding universities the same column reads 0 at every
tick against 189 standing and 81 completed — a hundred and eighty-nine institutions and not one
scholar in any of them.

The academy was not a starting position. It was the only thing holding the written half of the
knowledge economy up.

## 5. What the removal costs the gates — reported, not regenerated

`toleranceK` is 3 for every baseline. Nothing in `balance/baselines/` was regenerated.

**Instrument alone (this PR, `a2782db`): all three fast gates PASS.** Largest movement anywhere is
`referencePeakPopulation` at 2.30 SE against a tolerance of 20.9, and `balance:gate:agency` is
0.00 SE on every one of its metrics. `ui/session.json`'s `snapshotHash` **does not move** —
`universitiesStanding` is a report field, nothing hashes it, and `ui-recording.test.ts` passes
unchanged. `ui/design-dashboard/data.json` moves by three reachability findings and three line
numbers, which is the new exports (`FOUNDING_PROBE`, `auditFounding`, `formatFounding`) joining
`auditPool` and `formatAudit` in a list they were already on.

**Removal arm: `balance:gate` and `balance:gate:horizon` both FAIL.**

| metric | horizon | baseline | removal arm | delta | SE | tolerance |
|---|---|---|---|---|---|---|
| `referenceGrimoires` | 60 | 90.47 | **0.000** | −90.47 | −54.01 | 5.026 |
| `referenceGrimoires` | 240 | 323.90 | **0.000** | −323.90 | −45.34 | 21.43 |
| `referenceLibraryDepth` | 60 | 3.815 | **0.000** | −3.815 | −18.21 | 0.628 |
| `referenceLibraryDepth` | 240 | 16.10 | **0.000** | −16.10 | −20.97 | 2.304 |
| `referenceLivingMages` | 60 | 38.97 | 32.28 | −6.695 | −67.28 | 0.299 |
| `referenceLivingMages` | 240 | 37.72 | 30.24 | −7.475 | −37.18 | 0.603 |
| `referenceKnowledgeInstances` | 240 | 951.57 | 900.77 | −50.80 | −6.48 | 23.52 |
| `referenceNodesKnown` | 240 | 40.67 | 41.86 | +1.190 | +6.59 | 0.542 |
| `referencePopulation` | 240 | 212.29 | 229.39 | +17.10 | +14.21 | 3.610 |
| `referencePeakPopulation` | 240 | 362.0 | 419.0 | +57.00 | +8.18 | 20.90 |

Two are exactly zero rather than merely low, which is the signature of a channel that is off
rather than weak. `referenceNodesKnown` and the population metrics move *up*: mages who cannot
scribe research instead, and a populace with no student demand grows.

`npm run verify:nosweeps` on the removal arm: **22 tests fail across 13 files**, including
`reference-long-run.test.ts`'s own tripwire — *"no lesson taught in the whole second century —
teaching has died out, which is the dead-`acquire`-hook shape this tripwire exists to catch"* —
and *"no research completed in ticks 961-1200"*. The same command on the instrument-only tree
passes 4,533 of 4,534, the one failure being the dashboard payload above.

**`balance:gate:ascension` was not run.** It was started against the removal arm and killed at
about 25 minutes with the machine's load average at 302 and rising; the numbers it would have
produced are not in this document and should not be inferred from anything in it.

## 6. What this says to do

1. **Land the instrument.** It is inert, it takes the measurement that was missing, and its
   positive control means a future zero in that table is a fact rather than a hope.
2. **Wire `affiliate` as its own change, with its own baseline.** The site is the roster loop in
   `packages/rules-world/src/autonomy/tick.ts`, where `selectGoal` already holds the fresh outlook
   `completeAffiliation` requires — but it carries a real design decision (does the goal complete
   on adoption, or after months?), so it is a change and not a one-liner. It moves baselines on
   the **current** starting position too, which is exactly why it must not ride along with
   anything else: the question *"how much scribing appears when mages can actually affiliate?"*
   has to be answerable on its own.
3. **Then re-land `w119/start-with-no-university`,** and re-run this table. Founding becomes the
   first real decision of a run, `permissive-breadth`'s promotion means something, and the opening
   window costs the universe books it can earn back.
