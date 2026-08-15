# The 125 reachability findings, triaged

**Measured at `e2b89d8` on 2026-08-14**, by `npm run check:reachability` and the mention analysis
described in §5. This is an **inventory, not a fix**. Nothing here is a proposal; the point is to
convert the single number "125 findings" into a count of things somebody would actually do something
about, because that number is what nobody currently knows.

Re-derive before acting on it. Per CLAUDE.md, a measurement is a statement about the tree it was
taken on, and §6 below is what happens when you skip that step.

---

## 1. The counts

| Package | Integration debt | Tooling-only | Dead | False positive | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| `content` | 0 | 5 | 1 | 0 | 6 |
| `coordination` | 15 | 0 | 1 | 0 | 16 |
| `primitives` | 2 | 1 | 0 | 0 | 3 |
| `rules-magic` | 22 | 1 | 4 | 0 | 27 |
| `rules-raid` | 5 | 0 | 2 | 0 | 7 |
| `rules-world` | 25 | 3 | 12 | 0 | 40 |
| `scenario` | 0 | 12 | 0 | 0 | 12 |
| `sim-core` | 2 | 4 | 0 | 0 | 6 |
| `state` | 5 | 0 | 3 | 0 | 8 |
| **Total** | **76** | **26** | **23** | **0** | **125** |

The headline: **76 of the 125 are integration debt** — mechanics that are built, mostly tested,
exported, and that nothing in a running universe calls. That is the number the raw count was hiding.
Twenty-six are tooling surface doing exactly its job, and twenty-three are dead weight.

**Zero false positives.** That is a result about the checker, and it was not the expected one — see §5.

### The four categories

- **Integration debt.** A simulation mechanic: it reads or writes world state, or computes a rules
  quantity, and its absence changes what the game does. The `completeAffiliation` class.
- **Tooling-only.** Formatters, report builders, metric definitions, lab helpers, in-memory content
  sources, debug-sentinel predicates. Their consumers are tests, `bin/` labs and analysis scripts by
  design. The export is the point; the world step should never call them. Debt: nil.
- **Dead.** Empty sentinels nothing defaults to, one-line arithmetic aliases, and functions
  superseded by a same-purpose symbol that *is* reached. Delete.
- **False positive.** The checker is wrong: something has a production consumer it cannot see.

---

## 2. The load-bearing ones

These are the findings that behave like tonight's four: their absence silently disables a whole
subsystem rather than leaving inert code behind. Grouped by mechanism, because that is the unit a
repair comes in — every row below is one wiring job, not N.

| Mechanism | Findings | What is silently off |
| --- | ---: | --- |
| **University staffing** — `completeAffiliation`, `changeAffiliation` | 2 | Universities are built and never staffed. Affiliated mages run 6 → 5 → … → 1 over 200 world years while 189 universities stand. `scripts/w117-gate-check.sh` exists solely to test this one, and reports **shut** at `e2b89d8`. |
| **The university subsystem behind it** — `createUniversity`, `readUniversity`, `admitStudents`, `AdmissionRefusals`, `effectiveCapacity`, `universityProfile`, `dominantCell`, `staffCohortsOf`, `unstaffUniversity` | 9 | Admission, capacity, profile and staffing all exist and none is on a path from the world step. Ten of `rules-world`'s twelve heaviest-tested exports are here. |
| **Ascension legacy** — `legacyGrant`, `legacyBudget`, `carriedPrestige`, `LEGACY_CHANNELS`, and eight god constants (`legacy-*`, `prestige-retention`, `legacy-reference-tick`) | 12 | The largest single dead mechanism in the tree, and the clearest case for the check's one-hop transitivity: eight authored content constants look like knobs to a content author and turn nothing, because their only reader is `legacyGrant` and `legacyGrant` has no caller. |
| **Tradition hooks** — `hooksOfTradition`, `prepare`, `isCastable`, `costSplit`, `preparationCost`, `RESOLUTION`, `PALACE_STORE`, `STANDARD_STORE`, `scribeAvailability`, `perishesWithHolder`, `palaceLibraryDepth`, `populatePreparedSpells`, `releaseAbroad` | 13 | CLAUDE.md calls tradition hooks "the one licensed exception" to content-in-data, confined to four extension points: acquire, store, cast, cost. **Three of the four — store, cast and cost — have no production caller at all.** A tradition therefore differentiates on acquisition and nothing else. |
| **`changeTradition`** | 1 | `agent-api` publishes a change-tradition *action* and `mc-harness`'s strategies name it, while the rules function that would execute it is called by nothing. The action space advertises a move the rules never make. |
| **Dormancy and prerequisites** — `usableHolding`, `prerequisiteStatusFor`, `dormancyRefusal`, `KNOWLEDGE_USE` | 4 | Nothing asks whether a held node's prerequisites are satisfied, so nothing is ever dormant. Prerequisite structure in the content graph has no run-time consequence. |
| **Species traits** — `traitValueOf`, `SPECIES_FP_TRAITS`, `advantageOf` | 3 | **Nothing in the rules path reads a species fixed-point trait.** The recorded observation that all six species are interchangeable has been attributed to the twelve-cell selection (`w117` probe A); this says the accessor is uncalled too, which is a second, independent cause and the cheaper one to fix. |
| **Effect stacking** — `stackContributions`, `applyWard` | 2 | `stackContributions` is the documented route from effect contributions to a stacked magnitude (contracts §3), reached by nothing. `applyWard` is the ward-prevention arithmetic: wards prevent nothing. |
| **Library and grimoire consequences** — `destroyLibrary`, `grimoiresIn`, `withdrawGrimoire` | 3 | A raid cannot burn a library and a mage cannot withdraw a grimoire. `rules-raid/src/consequences.ts` names `destroyLibrary` in prose without calling it — the same doc-comment trap that made `gateway.ts` look like a `gatherEffects` consumer. |
| **`replay`** | 1 | The replayer has no production caller. Golden fixtures are *recorded* by `scripts/regen-goldens.mjs`, which mentions replay in prose and does not call it. Constraint 4's whole value is that a fixture diff means behaviour changed; nothing outside a test ever re-runs one. |
| **Snapshot loading** — `loadWorldSnapshot`, `migrateWorldEnvelope` | 2 | Snapshots are written and never read back by anything in the rules path. `MigrationRegistry` is already an accepted `DECLARED_EXCLUSIONS` entry for being staged ahead of its consumer; this is the consumer, and it is staged too. |
| **`POPULACE_STREAM`** | 1 | An `RNG_STREAM` id that nothing uses. Constraint 3 — randomness stream-split per subsystem, so a new draw in one place does not re-roll another — is unenforced for populace draws specifically. Every committed balance baseline depends on that property holding. |
| **Worship tiers** — `worshipTierOf`, `tierDerivedValues`, `worshipShareOfRegeneration` | 3 | CLAUDE.md records favor and worship as *installed into the world step*. The tier computation is not: whatever is installed does not tier. Worth checking against `god-agency`'s task list before treating as debt. |
| **`ENGAGEMENT_TICK_MS`** | 1 | The engagement half of the dual-scale clock, read by nothing. |

That is 57 of the 76 named. The remaining 19 are integration debt of the ordinary kind — a helper on
a dead branch, an economy input list, a raid consequence — worth wiring but not worth a row here.

---

## 3. Dead: 23 findings

Three shapes, all safely deletable and none urgent.

**Empty sentinels nothing defaults to** (9): `NO_AFFINITIES`, `NO_TERRITORY`, `NO_DEMAND`,
`NO_YIELD_BONUSES`, `TRAIT_NEUTRAL`, `NULL_CONTENT_ID`, `NULL_CELL_ID`,
`OBJECTIVE_KIND_UNSPECIFIED`, `BIRTH_BUCKET_TAIL_ALLOWANCE`. Each names a zero that the code writes
as a literal.

**One-line arithmetic or predicate aliases** (8): `drawBelow` (a rename of `nextBounded`),
`fractionOf`, `addAmounts`, `narrowToFixed`, `isWorkingMage` (`mage.alive !== 0`), `isProductive`,
`summedYield`, `assertCostHook`.

**Superseded duplicates** (6): `cellAxes` (`rules-magic/src/grid.ts`) and `cellAxesOf`
(`state/src/grid.ts`) are the same function in two packages and *both* are unreached, which is worth
a second look before deleting either. `heldNodes` (`rules-magic/src/grid.ts`) is shadowed by the
live `gateway.heldNodes` method — a name collision the checker resolved correctly and a human
grepping would not. Plus `AGE_BANDS_IN_ORDER`, `UNCHANGED_MULTIPLIER`, `PRODUCTIVE_OCCUPATIONS`.

Deleting all 23 would take the check from 125 to 102 and change nothing about the game. It is the
cheapest available progress and the least valuable.

---

## 4. Tooling-only: 26 findings

`scenario`'s twelve are the whole package's contribution and every one is a report or metric builder:
`censusLine`, `longRunLines`, `longestOccupationAlternation`, `claimRate`, `speciesVersatility`,
`actionName`, `auditPool`, `auditStrategy`, `formatAudit`, `AnnihilationRecorder`,
`BALANCE_RUN_METRIC_IDS`, `REFERENCE_SWEEP`. `content`'s five are the audio/audition pipeline —
`assetIdOf`, `mergeSelections`, `selectionCoverage`, `audioSelect`, `memorySource`. `sim-core`
contributes four probes and utilities — `valueSentinelInstalled`, `annihilationSentinelInstalled`,
`cloneStream`, `rejectionThreshold`. The rest: `ablationConformance`, `describeRefusal`,
`AGE_BAND_NAMES`, `histogramCellCount`, `naivePerLifespanRate`.

**These are the strongest candidates for `DECLARED_EXCLUSIONS`, and they should still not go there
in bulk.** The script's own note is right that an exclusion added to quiet output is a defect
converted into silence, and it is now the wrong tool anyway: the ratchet
(`scripts/reachability-baseline.json`) pins them without asserting they are fine, which is a more
honest record than an exclusion entry claiming each has an argument nobody wrote.

---

## 5. Method, and the false-positive result

Each finding was assigned exactly one category. Assignment used three mechanical inputs — the
symbol's signature, the number of test files matching its name, and every non-test source file
matching its name — and one judgement: does calling this change world state, or does it produce a
string, a metric or a lab result?

The false-positive count is **0**, and the search for them was the part that ran longest. Twenty-seven
findings had a mention in some non-barrel production file, which is what a false positive looks like.
Every one dissolved on inspection into a doc comment (`completeAffiliation` in `world-step.ts`,
`destroyLibrary` in `consequences.ts`, `ECONOMIC_INPUTS` in `components.ts`, `REFERENCE_SWEEP` in
`scenario.mjs`), a barrel re-export, an unrelated English word (`replay`, `prepare`), or a same-named
method on a different object (`gateway.heldNodes`). The checker's stated bias — resolve conservatively,
under-report rather than cry wolf — held on all 125.

Two cautions about the analysis itself, both earned:

- The first mention pass used `git grep -- 'packages/*/test'` and reported **zero** test callers for
  every one of the 125 symbols, which is absurd on its face. Wildcard git pathspecs are matched
  against the full path, so a directory prefix without a trailing glob matches nothing. The corrected
  pathspec is `packages/*/test/**`. This is the repo's recorded "checker that answers about the wrong
  input" shape, and it was caught only because the answer was implausible, not because anything failed.
- `ui/design-dashboard/data.json` embeds these findings verbatim, so it matches *every* symbol name
  and must be excluded from any mention analysis. An analysis that counted it would find every
  finding "referenced in production".

---

## 6. What was already fixed, or was never on this ref

Three of the four findings that motivated the ratchet are **not** in the 125, and stating why is the
point of dating this document:

- **`gatherEffects` is reached.** `packages/coordination/src/universe-effects.ts:330` calls it. The
  belief that `gateway.ts` called it came from a doc comment, and that specific error is real — but
  the symbol has a genuine production consumer and the check has never reported it.
- **`applyDirective` and `runPlanFor` do not exist at `e2b89d8`.** They are on an unmerged branch.
  A check cannot report a symbol that is not on the ref it ran against, and a finding restated from
  another branch's tree is a finding about that branch.

`completeAffiliation` is the one that is in the 125, and it is finding number one in this document
for that reason.

---

## 7. The gate this feeds

`npm run check:reachability:ratchet` fails when the reported findings stop matching
`scripts/reachability-baseline.json` — in **either** direction. Exit 0 held, 42 drifted, 1 the probe
is broken. Fixing a finding therefore requires re-pinning:

    npm run reachability:pin

and the diff on that file is the progress record. An entry removed is a repair; an entry added is a
debt someone chose to accept. The counts in §1 are only worth writing down once, but the baseline
diff keeps them current for free.
