# The 127 reachability findings, triaged

**Measured at `e2b89d8` on 2026-08-14**, by `npm run check:reachability` plus the capability
analysis described in §5. This is an **inventory, not a fix**: the point is to convert the single
number "127 findings" into a count of things somebody would act on, because that number is what
nobody currently knows.

Re-derive before acting on it. A measurement is a statement about the tree it was taken on, and §6
is what happens when you skip that step.

> **Third correction round — 2026-08-15, re-verified at `08ca5368`.** Three rows were wrong and are
> corrected below rather than left for a reader to trip over. **`applyWard`** and **`replay`** move
> from §2 to §3: each has a live capability under another name, found independently by
> `audit-contracts.md`, `audit-vision.md` and `audit-sequence.md` §1.2 and re-checked here. And §2's
> `rules-raid` row gave *"nothing in `scenario` opens a portal"* as its reason, which is false —
> `packages/scenario/src/raids.ts:423` calls `openPortal`; **the five findings in that row are still
> `unreached` in `scripts/reachability-baseline.json` at this ref, so the row's verdict stands and
> only its reason changes.** The category totals move with the two reclassifications: integration
> debt **61 → 59**, superseded **14 → 16**. The 125 and the per-package totals are unchanged — this
> is a re-judgement, not a re-measurement, and the per-package split was re-derived from the
> committed baseline as a control (content 6, coordination 16, primitives 3, rules-magic 27,
> rules-raid 7, rules-world 38, scenario 15, sim-core 6, state 8 = 127).

> **Corrected 2026-08-15, `w204/affiliate-writer`.** Two findings left the baseline because they
> were repaired rather than re-judged: `completeAffiliation` (`unreached`) and `changeAffiliation`
> (`reachedOnlyByUnreached`) both now have a production caller in `settleAffiliations`. The
> `rules-world` row drops 40 → 38 and its integration debt 19 → 17; the total drops 129 → 127 and
> the integration-debt total 60 → 58; the **University staffing** mechanism row in §2 drops 9 → 7.
> Nothing else in this document was re-judged. `staffCohortsOf`, `unstaffUniversity`,
> `admitStudents`, `AdmissionRefusals`, `effectiveCapacity`, `universityProfile` and `dominantCell`
> remain in that row — `admitStudents` and `effectiveCapacity` are now reached through
> `universityPreference`'s seat filter, but the ratchet is the authority on that and it still
> reports them, so they stay until it does not.

---

## 1. The counts

| Package | Integration debt | Superseded | Tooling-only | Dead | False positive | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `content` | 1 | 0 | 5 | 1 | 0 | 7 |
| `coordination` | 13 | 2 | 0 | 1 | 0 | 16 |
| `primitives` | 1 | 1 | 1 | 0 | 0 | 3 |
| `rules-magic` | 16 | 6 | 1 | 4 | 0 | 27 |
| `rules-raid` | 5 | 0 | 0 | 2 | 0 | 7 |
| `rules-world` | 17 | 6 | 3 | 12 | 0 | 38 |
| `scenario` | 0 | 0 | 15 | 0 | 0 | 15 |
| `sim-core` | 0 | 1 | 5 | 0 | 0 | 6 |
| `state` | 5 | 0 | 0 | 3 | 0 | 8 |
| **Total** | **58** | **16** | **30** | **23** | **0** | **127** |

The headline: **58 of the 127 are integration debt** — mechanics that are built, mostly tested,
exported, and that nothing in a running universe calls. That is the number the raw count was hiding.
The other 66 are noise of three different kinds.

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
| **University staffing** — `completeAffiliation`, `changeAffiliation`, `staffCohortsOf`, `unstaffUniversity`, `admitStudents`, `AdmissionRefusals`, `effectiveCapacity`, `universityProfile`, `dominantCell` | 7 | The only writer of the `UNIVERSITY_STAFF` component in the tree is `staffCohortsOf` itself, which is unreached; `world-step.ts:532` says in a comment that the component "shipped in `WORLD_COMPONENTS` with no writer". `scripts/w117-gate-check.sh` independently reports affiliation **shut** at `e2b89d8`. Universities are created (by `god/interventions.ts:781`) and never staffed. |
| **Ascension legacy** — `legacyGrant`, `legacyBudget`, `carriedPrestige`, `LEGACY_CHANNELS`, and eight god constants (`legacy-*`, `prestige-retention`, `legacy-reference-tick`) | 12 | The largest single dead mechanism, and the clearest case for the check's one-hop transitivity: eight authored constants look like knobs to a content author and turn nothing, because their only reader is `legacyGrant` and `legacyGrant` has no caller. |
| **Spell preparation and its cost half** — `prepare`, `isCastable`, `preparationCost`, `costSplit` | 4 | `castPolicy`, `expendOnCast`, `costPolicy` and `castCost` *are* reached, so casting works. The **preparation** half does not: nothing splits a cost across preparation and cast, and nothing asks whether a spell is castable before it is cast. |
| **Portal spell transfer** — `populatePreparedSpells`, `releaseAbroad` | 2 | `resolvePortalHooks` is reached and the two functions that would use the resolved hooks are not. Prepared spells do not cross a portal. |
| **Tradition store policy** — `palaceLibraryDepth`, `perishesWithHolder`, `scribeAvailability`, `PALACE_STORE`, `STANDARD_STORE` | 5 | `storePolicy`, `canHoldAt` and `admitToStore` are reached, so storage admits. The *consequences* of a store kind — palace depth, perishing with the holder, scribe availability — are computed by nothing. |
| **`changeTradition`** and `RESOLUTION`, `hooksOfTradition` | 3 | `agent-api` publishes a change-tradition action and `mc-harness`'s strategies name it, while the rules function that would execute it has no caller. The action space advertises a move the rules never make. |
| **Library-level destruction** — `destroyLibrary`, `grimoiresIn` | 2 | Narrower than it looks, and corrected once. `destroyGrimoire` **is** live: `rules-raid/src/consequences.ts:241` and `:265` loot and burn books one at a time, and that file's own comment claiming it was the fix for both is out of date about the library half. What has no caller is destruction of a library *as a unit* — and `instances/subsystem.ts:116` already records the consequence, that an unshelved book is one `grimoiresIn` cannot see and `destroyLibrary` leaves standing. |
| **`rules-raid` consequences and objectives** — `returnedWithKnowledge`, `strandedAttackers`, `objectiveHoldsKnowledge`, `OBJECTIVE_LOCATION_KIND`, `BURNABLE_LOCATION_KINDS` | 5 | ~~Consistent with CLAUDE.md: `raid-engagement` is 67/92 and nothing in `scenario` opens a portal.~~ **Reason corrected 2026-08-15 at `08ca5368`: `scenario` does open a portal** — `packages/scenario/src/raids.ts:423` calls `openPortal` and `reference-universe.ts:1007` supplies `portalTargets`. All five names are nevertheless still `unreached` in `scripts/reachability-baseline.json` at this ref, so the row keeps its count and its category: portals open and raids terminate, and the *consequences* of a raid — knowledge carried home, attackers stranded, an objective that holds knowledge, a burnable location — are what nothing reaches. |
| **World-snapshot loading** — `loadWorldSnapshot`, `migrateWorldEnvelope` | 2 | Weaker than it looks and stated precisely for that reason: `sim-core`'s `envelopeToState` *is* reached, so snapshots decode. What has no caller is the **world-schema-aware** wrapper in `@mm/state`. Nothing in the rules path loads a world snapshot back. |
| — | — | **`ENGAGEMENT_TICK_MS` was here and has been removed.** Its own doc comment settles it: the constant documents *"how much simulated time a combat tick represents, not how much wall clock a caller should spend on one"*, and real-time pacing *"is a client and server concern and never enters the core"*. Its consumers are the Electron client and the PvP server, both outside this repository. Reclassified tooling-only. |

One more was dropped from this table on inspection: **`withdrawGrimoire`** is declared deliberately unused by `gateway.ts:107` — *"`withdrawGrimoire` is unused and stays unused"* — which is an accepted design decision rather than debt.

That is 42 of the 58. (It was 46 of 61 until `applyWard` and `replay` moved to §3 in the third
correction round, and 44 of 59 until `characterFor` arrived with #201 — see §5.) The remaining 16
are integration debt of the ordinary kind — an economy input list, a commitment predicate, a
monoculture threshold, `speciesRediscoveryMultiplier`, `worshipShareOfRegeneration`,
`characterFor` — worth wiring, not worth a row.

---

## 3. Superseded: 16 findings, and the trap they are

**This is the most useful thing in this document.** Sixteen findings look exactly like §2 — an
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
| `applyWard` **(moved from §2, 2026-08-15)** | `CastArbiter#applyWardOnce` — `packages/rules-raid/src/arbitration.ts:570`, live at `raid.ts:514` and `:995`. It **reimplements** the multiply, `floorDiv(rawDamage * (FP_ONE - ward), FP_ONE)`, rather than delegating to `primitives`. §2's stated reason searched `primitives/` for a capability that lives in `rules-raid` — **the exact §5 trap this document is otherwise the best account of.** The pin is right and its old reason was wrong. Wards still never prevent anything, because no combat attempt occurs; that is §8's defect, not this one. |
| `replay` **(moved from §2, 2026-08-15)** | `replayAndLocate` — imported at `scripts/regen-goldens.mjs:107` and **called at `:142`**, over `recordingOf(fixture)`. §2's reason grepped for the literal string `replay(`, which the named export does not match. Constraint 4 is enforced by a replayer with a production caller; it is `replay` itself that has none. |

Every one of these is safe to delete, and each deletion is also a decision about which of two
implementations is the real one — which makes them worth more attention than §4, not less.

---

## 4. Dead: 23, and tooling-only: 27

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

A **third** correction round, 2026-08-15 at `08ca5368`, moved two more and corrected the reason on a
third — `applyWard`, `replay`, and the `rules-raid` row's portal clause. All three failed the same
way, and differently from rounds one and two: **the capability was looked for in the wrong package,
or under the wrong spelling.** `applyWard`'s capability is in `rules-raid`, not `primitives`;
`replay`'s live form is `replayAndLocate`, which a grep for `replay(` cannot see; and *"nothing in
`scenario` opens a portal"* was inherited from `CLAUDE.md` rather than checked against `scenario`.
So the §5 question needs a second clause: **"is the capability absent, or only this accessor" — and
if only this accessor, under what other name, in which other package?** Three rounds of correction
on one document is itself the finding: a symbol-level check produces judgements that rot faster than
the counts do.

So: **an unreached symbol is a claim about a symbol, never about a capability** — and the cheapest place to look for the capability is the doc comment on the symbol itself, which in this repository is usually where somebody already wrote down why it has no caller. Promoting it to a
claim about a capability takes a second search, for the thing the symbol would have done, under any
name.

### The false-positive result

**Zero**, and the search for them ran longest. Twenty-seven findings had a mention in a non-barrel
production file, which is what a false positive looks like. Every one dissolved into a doc comment
(`completeAffiliation` in `world-step.ts`, `destroyLibrary` in `consequences.ts`, `ECONOMIC_INPUTS`
in `components.ts`, `REFERENCE_SWEEP` in `scenario.mjs`), a barrel re-export, an unrelated English
word (`replay`, `prepare`), or a same-named method on a different object (`gateway.heldNodes`). The
checker's stated bias — resolve conservatively, under-report rather than cry wolf — held on all 125 as first triaged; the four added since are argued in §5.

### Two broken probes, both caught by implausibility rather than by failure

- The first mention pass used `git grep -- 'packages/*/test'` and reported **zero** test callers for
  all symbols. Wildcard git pathspecs match against the full path, so a directory prefix with no
  trailing glob matches nothing; the correct form is `packages/*/test/**`.
- A capability sweep for ward application grepped `\bward\b` and matched *toward* and *forward* —
  the exact substring trap `rules-magic/src/effects/consumption.ts` documents in its own exclusion
  note, fallen into while checking a finding in the file next door.
- `ui/design-dashboard/data.json` embeds these findings verbatim and therefore matches **every**
  symbol name. Any mention analysis that counts it finds all of them "referenced in production".

---

## 6. What was already fixed, or was never on this ref

Three of the four findings that motivated this work are **not** among the original 125:

- **`gatherEffects` is reached** — `coordination/src/universe-effects.ts:330` calls it. The belief
  that `gateway.ts` called it came from a doc comment, and that error was real; but the symbol has a
  genuine production consumer and the check has never reported it.
- **`applyDirective` and `runPlanFor` do not exist at `e2b89d8`.** They are on an unmerged branch. A
  check cannot report a symbol that is not on the ref it ran against.

`completeAffiliation` is the one that is among them, and it heads §2 for that reason.

---

## 7. The gate this feeds

`npm run check:reachability:ratchet` fails when the reported findings stop matching
`scripts/reachability-baseline.json`, in **either** direction. Exit 0 held, 42 drifted, 1 the probe
is broken. Fixing a finding therefore requires re-pinning:

    npm run reachability:pin

and the diff on that file is the progress record. An entry removed is a repair; an entry added is a
debt someone accepted. The counts above are worth writing down once; the baseline diff keeps them
current for free.

## §5 — The four that arrived with #201

[added 2026-08-15; the ratchet slipped from 125 to 129 on `main` @ 574e4e65 and named them]

`#201` — *"Integration debt: every primitive wired, magnitudes signed, and the ablation that says
which wires actually bind"* — exported four symbols nothing outside a test calls. The ratchet
reported them precisely, in both directions, and its message names the three ways out: wire it,
delete it, or accept the debt and say so. This is the third, with the argument for each.

| symbol | package | category | why it is debt and not a defect |
|---|---|---|---|
| `characterFor` | `content` | integration debt | Hashes a mage handle into the authored character pool, exactly as `audioSelect` does for cues. **No caller at all — not production, not test.** It is staged ahead of a client that draws a mage, which does not exist yet. Deleting it would delete the content wire with it; the pool it reads is authored and shipped. |
| `FOUNDING_PROBE` | `scenario` | tooling-only | The probe's declaration. `reachedOnlyByUnreached`, which is the ratchet correctly refusing to count a symbol as live because the only thing reaching it is itself unreached. |
| `auditFounding` | `scenario` | tooling-only | Drives a scripted god at the reference universe and reports what it founded. Called by `founding-instrument.test.ts` and by nothing in a running universe, which is what an instrument is. |
| `formatFounding` | `scenario` | tooling-only | Renders that audit for a human. Same argument. |

**The distinction the table draws is the one worth keeping.** `characterFor` is *integration debt*:
something a running universe should eventually call and does not. The three `scenario` symbols are
*tooling-only*: measurement apparatus, which a running universe should **never** call, and whose
appearance here is the check working rather than a backlog growing.

Pinned rather than argued away, because the ratchet's whole value is that the pinned set is a list
somebody wrote down on purpose. A finding that is pinned without an entry here is a finding nobody
decided about — and `reachability-triage-doc.test.ts` fails the build if this document and the
baseline disagree, which is why it is impossible to pin quietly.
