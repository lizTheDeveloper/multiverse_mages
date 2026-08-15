# The 125 reachability findings, triaged

**Measured at `e2b89d8` on 2026-08-14**, by `npm run check:reachability` plus the capability
analysis described in §5. This is an **inventory, not a fix**: the point is to convert the single
number "125 findings" into a count of things somebody would act on, because that number is what
nobody currently knows.

Re-derive before acting on it. A measurement is a statement about the tree it was taken on, and §6
is what happens when you skip that step.

---

## 1. The counts

| Package | Integration debt | Superseded | Tooling-only | Dead | False positive | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `content` | 1 | 0 | 5 | 1 | 0 | 7 |
| `coordination` | 13 | 2 | 0 | 1 | 0 | 16 |
| `primitives` | 2 | 0 | 1 | 0 | 0 | 3 |
| `rules-magic` | 16 | 6 | 1 | 4 | 0 | 27 |
| `rules-raid` | 9 | 0 | 0 | 2 | 0 | 11 |
| `rules-world` | 19 | 6 | 3 | 12 | 0 | 40 |
| `scenario` | 3 | 0 | 12 | 0 | 0 | 15 |
| `sim-core` | 1 | 0 | 5 | 0 | 0 | 6 |
| `state` | 5 | 0 | 0 | 3 | 0 | 8 |
| **Total** | **69** | **14** | **27** | **23** | **0** | **133** |

The headline: **61 of the 125 are integration debt** — mechanics that are built, mostly tested,
exported, and that nothing in a running universe calls. That is the number the raw count was hiding.
The other 64 are noise of three different kinds.

### The five categories

- **Integration debt.** A simulation mechanic whose *capability* is absent: nothing else in the
  rules path does the job under another name. The `completeAffiliation` class.
- **Superseded.** The symbol is unreached and the capability is **live under another name** — a
  private method, a differently-named function in another package, or direct component access.
  Deleting the symbol changes nothing; wiring it would duplicate a live path. §5 is about why this
  category exists and why it is the dangerous one.
- **Tooling-only.** Formatters, report builders, metric definitions, lab helpers, in-memory content
  sources, debug-sentinel predicates. Consumers are tests, `bin/` labs and analysis scripts by
  design. The world step should never call them. Debt: nil.
- **Dead.** Empty sentinels nothing defaults to, one-line arithmetic aliases. Delete.
- **False positive.** The checker is wrong: a production consumer it cannot see.

---

## 2. The load-bearing ones

Findings that behave like `completeAffiliation`: their absence silently disables a subsystem rather
than leaving inert code. **Every row was verified by looking for the capability, not the symbol** —
that is, by asking whether anything else in the rules path does the job. Rows that failed that test
were moved to §3 and are not here.

| Mechanism | Findings | Verified how |
| --- | ---: | --- |
| **University staffing** — `completeAffiliation`, `changeAffiliation`, `staffCohortsOf`, `unstaffUniversity`, `admitStudents`, `AdmissionRefusals`, `effectiveCapacity`, `universityProfile`, `dominantCell` | 9 | The only writer of the `UNIVERSITY_STAFF` component in the tree is `staffCohortsOf` itself, which is unreached; `world-step.ts:532` says in a comment that the component "shipped in `WORLD_COMPONENTS` with no writer". `scripts/w117-gate-check.sh` independently reports affiliation **shut** at `e2b89d8`. Universities are created (by `god/interventions.ts:781`) and never staffed. |
| **Ascension legacy** — `legacyGrant`, `legacyBudget`, `carriedPrestige`, `LEGACY_CHANNELS`, and eight god constants (`legacy-*`, `prestige-retention`, `legacy-reference-tick`) | 12 | The largest single dead mechanism, and the clearest case for the check's one-hop transitivity: eight authored constants look like knobs to a content author and turn nothing, because their only reader is `legacyGrant` and `legacyGrant` has no caller. |
| **Spell preparation and its cost half** — `prepare`, `isCastable`, `preparationCost`, `costSplit` | 4 | `castPolicy`, `expendOnCast`, `costPolicy` and `castCost` *are* reached, so casting works. The **preparation** half does not: nothing splits a cost across preparation and cast, and nothing asks whether a spell is castable before it is cast. |
| **Portal spell transfer** — `populatePreparedSpells`, `releaseAbroad` | 2 | `resolvePortalHooks` is reached and the two functions that would use the resolved hooks are not. Prepared spells do not cross a portal. |
| **Tradition store policy** — `palaceLibraryDepth`, `perishesWithHolder`, `scribeAvailability`, `PALACE_STORE`, `STANDARD_STORE` | 5 | `storePolicy`, `canHoldAt` and `admitToStore` are reached, so storage admits. The *consequences* of a store kind — palace depth, perishing with the holder, scribe availability — are computed by nothing. |
| **`changeTradition`** and `RESOLUTION`, `hooksOfTradition` | 3 | `agent-api` publishes a change-tradition action and `mc-harness`'s strategies name it, while the rules function that would execute it has no caller. The action space advertises a move the rules never make. |
| **`applyWard`** | 1 | `damage × (1 − preventedFraction)` is the **only** implementation of ward prevention in the tree — verified by reading `primitives/src/stacking.ts` and `ablation.ts`, which describes the stacked value as "the prevented fraction". Wards stack into a fraction that is never applied to damage. |
| **Library-level destruction** — `destroyLibrary`, `grimoiresIn` | 2 | Narrower than it looks, and corrected once. `destroyGrimoire` **is** live: `rules-raid/src/consequences.ts:241` and `:265` loot and burn books one at a time, and that file's own comment claiming it was the fix for both is out of date about the library half. What has no caller is destruction of a library *as a unit* — and `instances/subsystem.ts:116` already records the consequence, that an unshelved book is one `grimoiresIn` cannot see and `destroyLibrary` leaves standing. |
| **`replay`** | 1 | The replayer has no production caller: the only call-shaped occurrence of `replay(` in the tree is its own definition. Golden fixtures are *recorded* by `scripts/regen-goldens.mjs`, which mentions replay in prose and does not call it. Constraint 4's value is that a fixture diff means behaviour changed on purpose; nothing outside a test ever re-runs one. |
| **`rules-raid` consequences and objectives** — `returnedWithKnowledge`, `strandedAttackers`, `objectiveHoldsKnowledge`, `OBJECTIVE_LOCATION_KIND`, `BURNABLE_LOCATION_KINDS` | 5 | Consistent with CLAUDE.md: `raid-engagement` is 67/92 and nothing in `scenario` opens a portal. Whole-subsystem debt, not individually surprising. |
| **World-snapshot loading** — `loadWorldSnapshot`, `migrateWorldEnvelope` | 2 | Weaker than it looks and stated precisely for that reason: `sim-core`'s `envelopeToState` *is* reached, so snapshots decode. What has no caller is the **world-schema-aware** wrapper in `@mm/state`. Nothing in the rules path loads a world snapshot back. |
| — | — | **`ENGAGEMENT_TICK_MS` was here and has been removed.** Its own doc comment settles it: the constant documents *"how much simulated time a combat tick represents, not how much wall clock a caller should spend on one"*, and real-time pacing *"is a client and server concern and never enters the core"*. Its consumers are the Electron client and the PvP server, both outside this repository. Reclassified tooling-only. |

One more was dropped from this table on inspection: **`withdrawGrimoire`** is declared deliberately unused by `gateway.ts:107` — *"`withdrawGrimoire` is unused and stays unused"* — which is an accepted design decision rather than debt.

That is 46 of the 69. The remaining 23 are integration debt of the ordinary kind — an economy input
list, a commitment predicate, a monoculture threshold, `speciesRediscoveryMultiplier`,
`worshipShareOfRegeneration` — worth wiring, not worth a row.

**Eight of those 23 arrived on 2026-08-14**, when `w182/raid-seam` merged `main`: 125 → 133, and the
split is worth stating because only half is this branch's. Four — `characterFor`, `FOUNDING_PROBE`,
`auditFounding`, `formatFounding` — were **already slipped on `main`** before that branch existed,
confirmed by running the ratchet on a pristine `origin/main` worktree at `9b4b242d`, which reports
the same four. The other four are `rules-raid`'s verb surface from `w37/raid-playable`:
`legalVerbs`, `verbSide`, `runPlanFor` and `ENGAGEMENT_PHASE_NAMES` — a phase/side verb table for a
client and a mask, and the scripted-plan entry point for a headless run. They are staged ahead of
their consumer rather than dead. `applyDirective` is deliberately **not** among them: the raid seam
wired it, which was the point of that branch.

---

## 3. Superseded: 14 findings, and the trap they are

**This is the most useful thing in this document.** Fourteen findings look exactly like §2 — an
unreached mechanic in a rules package, well tested, obviously important — and are not, because the
capability is live under a different name. A triage that read the symbol instead of the capability
would have filed every one of them as a disabled subsystem, and each would have cost somebody an
investigation ending in "it already works".

| Finding | Live path that supersedes it |
| --- | --- |
| `traitValueOf`, `SPECIES_FP_TRAITS`, `advantageOf` | Species traits are read all over the rules path by **direct field access** — `learnRate` in `instances/research.ts`, `scribeAffinity` in `universities/scribing.ts`, `laborAffinity` in `economy/materials.ts` and `rules-raid/src/combatants.ts`, `mageAptitude` in `mages/promotion.ts`, `rediscoveryAffinity` in `primitives/src/rediscovery.ts`. The generic accessor and its trait list are the unused part, not traits. |
| `usableHolding`, `prerequisiteStatusFor`, `dormancyRefusal`, `KNOWLEDGE_USE` | Prerequisites *are* gated: `gateway.ts:450` and `:524` call a private `#prerequisitesHeld(mage, node.prerequisites)` on both the research and teaching paths. The `dormancy` module is a second implementation nothing switched to. |
| `stackContributions` | `primitives`' `stackMagnitudes` is reached and is the live stacker; `universe-effects.ts` gathers contributions and stacks them per primitive itself. |
| `worshipTierOf`, `tierDerivedValues` | `god/system.ts:380` computes the tier with `tierOf(worship, constants)`, and `interventions.ts:1052` derives the budget and cap with `edictBudgetFor` and `favorCapFor` directly. |
| `createUniversity`, `readUniversity` | Universities are created with `attachRecord(state, UNIVERSITY, …)` in `god/interventions.ts:781` and read with `collectRecords(state, UNIVERSITY)` in `capital.ts`, `gateway.ts` and `agent-api`. |
| `withdrawGrimoire` | Declared deliberately unused by `gateway.ts:107` — *"`withdrawGrimoire` is unused and stays unused"*. An accepted design decision. |
| `POPULACE_STREAM` | A re-export of `RNG_STREAM.populace`, which is used directly at `economy/carrying-capacity.ts:488` and `populace/mortality.ts:229`. Constraint 3 is **not** at risk here. |

Every one of these is safe to delete, and each deletion is also a decision about which of two
implementations is the real one — which makes them worth more attention than §4, not less.

---

## 4. Dead: 23, and tooling-only: 26

**Dead** splits three ways. *Empty sentinels nothing defaults to* (9): `NO_AFFINITIES`,
`NO_TERRITORY`, `NO_DEMAND`, `NO_YIELD_BONUSES`, `TRAIT_NEUTRAL`, `NULL_CONTENT_ID`, `NULL_CELL_ID`,
`OBJECTIVE_KIND_UNSPECIFIED`, `BIRTH_BUCKET_TAIL_ALLOWANCE` — each names a zero the code writes as a
literal. *One-line aliases* (8): `drawBelow` (a rename of `nextBounded`), `fractionOf`, `addAmounts`,
`narrowToFixed`, `isWorkingMage`, `isProductive`, `summedYield`, `assertCostHook`. *Duplicates* (6):
`cellAxes` (`rules-magic`) and `cellAxesOf` (`state`) are the same function in two packages and
**both** are unreached, which is worth a look before deleting either; `heldNodes` is shadowed by the
live `gateway.heldNodes` method; plus `AGE_BANDS_IN_ORDER`, `UNCHANGED_MULTIPLIER`,
`PRODUCTIVE_OCCUPATIONS`.

**Tooling-only** (27) is dominated by `scenario`, whose entire contribution of twelve is report and metric
builders: `censusLine`, `longRunLines`, `longestOccupationAlternation`, `claimRate`,
`speciesVersatility`, `actionName`, `auditPool`, `auditStrategy`, `formatAudit`,
`AnnihilationRecorder`, `BALANCE_RUN_METRIC_IDS`, `REFERENCE_SWEEP`. `content` adds the audio and
audition pipeline (`assetIdOf`, `mergeSelections`, `selectionCoverage`, `audioSelect`,
`memorySource`); `sim-core` adds four probes and utilities (`valueSentinelInstalled`,
`annihilationSentinelInstalled`, `cloneStream`, `rejectionThreshold`); and `ablationConformance`,
`describeRefusal`, `AGE_BAND_NAMES`, `histogramCellCount`, `naivePerLifespanRate` and
`ENGAGEMENT_TICK_MS` make up the rest.

These 27 are the strongest candidates for `DECLARED_EXCLUSIONS` and **should still not go there in
bulk.** The script's own note is right that an exclusion added to quiet output is a defect converted
into silence, and the ratchet is now a better tool for the job: `scripts/reachability-baseline.json`
pins them without claiming each has an argument nobody wrote.

---

## 5. Method

Each finding got exactly one category, from three mechanical inputs — the symbol's signature, test
files matching its name, non-test source files matching its name — and one question that turned out
to be the whole exercise:

> Is the **capability** absent, or only this **accessor**?

The first pass of this document answered that question by inspection and got it wrong fourteen
times, in both directions of confidence. It asserted that "nothing in the rules path reads a species
fixed-point trait" (traits are read everywhere), that three of the four licensed tradition hook
points had no caller (all four have reached implementations; it is the *secondary* policies that do
not), and that constraint 3 was unenforced for populace draws (`RNG_STREAM.populace` is used
directly twice). Each of those was one grep away from being checked, and each would have sent
somebody at a subsystem that already works.

A second correction round, run after the first, moved three more rows: `ENGAGEMENT_TICK_MS` (its own comment names its consumers as the client and server), `destroyLibrary` (the grimoire-level destruction it appeared to gate is live at `consequences.ts:241`), and `withdrawGrimoire` (`gateway.ts:107` declares it deliberately unused). In each case the **adjacent source comment** held the answer and the first two passes had not read it.

So: **an unreached symbol is a claim about a symbol, never about a capability** — and the cheapest place to look for the capability is the doc comment on the symbol itself, which in this repository is usually where somebody already wrote down why it has no caller. Promoting it to a
claim about a capability takes a second search, for the thing the symbol would have done, under any
name.

### The false-positive result

**Zero**, and the search for them ran longest. Twenty-seven findings had a mention in a non-barrel
production file, which is what a false positive looks like. Every one dissolved into a doc comment
(`completeAffiliation` in `world-step.ts`, `destroyLibrary` in `consequences.ts`, `ECONOMIC_INPUTS`
in `components.ts`, `REFERENCE_SWEEP` in `scenario.mjs`), a barrel re-export, an unrelated English
word (`replay`, `prepare`), or a same-named method on a different object (`gateway.heldNodes`). The
checker's stated bias — resolve conservatively, under-report rather than cry wolf — held on all 125.

### Two broken probes, both caught by implausibility rather than by failure

- The first mention pass used `git grep -- 'packages/*/test'` and reported **zero** test callers for
  all 125 symbols. Wildcard git pathspecs match against the full path, so a directory prefix with no
  trailing glob matches nothing; the correct form is `packages/*/test/**`.
- A capability sweep for ward application grepped `\bward\b` and matched *toward* and *forward* —
  the exact substring trap `rules-magic/src/effects/consumption.ts` documents in its own exclusion
  note, fallen into while checking a finding in the file next door.
- `ui/design-dashboard/data.json` embeds these findings verbatim and therefore matches **every**
  symbol name. Any mention analysis that counts it finds all 125 "referenced in production".

---

## 6. What was already fixed, or was never on this ref

Three of the four findings that motivated this work are **not** in the 125:

- **`gatherEffects` is reached** — `coordination/src/universe-effects.ts:330` calls it. The belief
  that `gateway.ts` called it came from a doc comment, and that error was real; but the symbol has a
  genuine production consumer and the check has never reported it.
- **`applyDirective` and `runPlanFor` do not exist at `e2b89d8`.** They are on an unmerged branch. A
  check cannot report a symbol that is not on the ref it ran against.

`completeAffiliation` is the one that is in the 125, and it heads §2 for that reason.

---

## 7. The gate this feeds

`npm run check:reachability:ratchet` fails when the reported findings stop matching
`scripts/reachability-baseline.json`, in **either** direction. Exit 0 held, 42 drifted, 1 the probe
is broken. Fixing a finding therefore requires re-pinning:

    npm run reachability:pin

and the diff on that file is the progress record. An entry removed is a repair; an entry added is a
debt someone accepted. The counts above are worth writing down once; the baseline diff keeps them
current for free.
