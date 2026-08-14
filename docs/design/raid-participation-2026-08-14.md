# Who fields a combatant, and why the combat primitives still measure nothing

**Measured 2026-08-14 on `combat-primitive-consumption` at `6c1b376` with `origin/main` `0dbf94c`
merged in** (that merge is `CLAUDE.md` only — no `packages/` change). Four seeds
(`0x0badc0de, 0x00abcdef, 0x12345678, 0x00041000`), 1200 world ticks, reference scenario with raids
on, driven through `policyFor` → `runEpisode`. Harness: branch `measure/assign-role-combatants`,
`packages/scenario/test/unit/tmp-*.test.ts` — temporary, not merged.

This is a measurement, not a design change. Nothing under `balance/**` was touched.

## 1. Three strategies submit god action 10, and it resolves

From `@mm/scenario`'s own `auditPool()` at 600 ticks, seed `AUDIT_RUN_SEED`:

| strategy | action-10 legal | listed | submitted | applied |
| --- | ---: | ---: | ---: | ---: |
| `uniform-random-legal` | 599/600 | 55 | 55 | 55 |
| `archivist` | 599/600 | 600 | 14 | 14 |
| `portal-rush` | 599/600 | 600 | 54 | 41 |

The remaining nine pool members never list it. `assignRole` is **not** shadowed; the three verbs that
are (`portal-rush/1`, `portal-rush/12`, `worship-maximizer/11`) are already allow-listed in
`strategy-shadowing.test.ts`.

## 2. Those arms field combatants and fight real raids

Totals over the four seeds:

| arm | action 10 applied | raids | outbound | casualties | nodes gained | outbound raids with a raider fielded | inbound raids with a warden fielded |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `passive-control` | 0 | 17 | 0 | 0 | 0 | — | 0/17 |
| `portal-rush` | 949 | 94 | 86 | 118 | 40 | 56/86 | 6/8 |
| `archivist` | 58 | 17 | 0 | 0 | 0 | — | 12/17 |
| `uniform-random-legal` | 387 | 52 | 41 | 48 | 32 | 22/41 | 10/11 |

Thirty of `portal-rush`'s 86 outbound raids end `defender / sideEliminated` — its whole warband dead —
and 55 end `attacker / objectivesResolved` with nodes carried home.

Role counts are taken by a read-only observer system spliced immediately **before** the `raids` system,
so each figure is the roster the raid deployed from rather than the survivors. The observer is inert:
the same run with and without it produces snapshot hash `140ea0177325f5eb` and a byte-identical raid
log.

**So "the reference universe fields no mage combatants" is a property of a run with no god agent.**
`packages/scenario/test/unit/combat-ablation-reaches-a-raid.test.ts` drives the world with
`step(state, [], rng)` — zero submitted actions — and `passive-control` reproduces it exactly. It is
not a property of the game, and its `expect(wardens).toBe(0)` cannot fire "the day a strategy assigns
one", because no strategy runs in that file.

## 3. Fielding combatants does not make the primitives measurable

Seed-matched control vs `ablationMaskFor([p])` within each arm, comparing whole raid logs — seeds
moved, of four:

| arm | direct-damage | ward | concealment | area-denial | blink | summon | knowledge-steal |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `passive-control` | 0 | 0 | 0 | 0 | 0 | 0 | **3** |
| `portal-rush` | 0 | 0 | 0 | 0 | 0 | 0 | **4** |
| `archivist` | 0 | 0 | 0 | 0 | 0 | 0 | **3** |

`knowledge-steal` is the positive control: the mask reaches the arbiter and the log can register a
change. The combatants are armed — 25–29 distinct combat-primitive nodes held in mind per run,
essentially the whole v1 combat repertoire, and every fielded warden and raider holds some.

**Leading explanation, named rather than proven: the record, not the engine.** `scenario`'s
`RaidRecord` carries only local-side outcomes and drops `RaidOutcome.primitiveApplication`, which is
the field that exists to say how much of each primitive each side put on the field. On an outbound raid
our raiders' damage lands on the rival, and nothing in the record is a function of rival casualties.
Second candidate, not excluded: the castable-node mask or the mastery threshold means those held nodes
are never cast.

Next step, cheap and unblocking: put `primitiveApplication` — or at minimum the opposing side's
casualties — on `RaidRecord`.

`nodesLostLocally` reading zero everywhere is **not** evidence of anything: `raids.ts` only sets it on
an inbound raid and `outcome.ts` defines it as nodes the host has no remaining instance of at all,
which in a universe of 26–622 mages is a very high bar.

## 4. The sweep-configuration consequence

- `balance/sweeps/balance-full.sweep.json` is the **only** sweep declaring a raid or combat metric
  (`combatActionEconomy`, `combatThresholdEfficiency`, `inboundRaidTempoLoss`, `raidInitiationCost`,
  `raidLengthDistribution`, `roleAssignmentDemographicCost`) and its pool is `["passive-control"]`
  alone.
- The two sweeps carrying the eight-strategy round-robin — `balance-gate-agency`,
  `balance-gate-ascension` — declare **no** raid metric. `balance-gate` and `balance-gate-horizon` are
  `passive-control`-only.
- `balance-full` has no committed baseline and nothing invokes it: no npm script, not `verify`, neither
  CI system.

So the raid and combat metrics have **no committed measurement at all**, and the one sweep that would
produce one is configured with the arm that fields no combatants. Fixing the pool is one line — but it
should follow §3, or the sweep will faithfully record another set of nulls.

Unrelated drift found while checking this: `balance/README.md`'s five-sweep table gives `balance-full`
a tick cap of 240 and "9 + `referenceNodesGainedFinalQuarter`" metrics, while the sweep file on this
ref declares `worldTickCap: 1200` and 23 metrics.
